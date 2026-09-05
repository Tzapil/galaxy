import {
  bootProduction,
  detectAndBreakProductionDeadlocks,
  handleBatchComplete,
  processContinuousBuildings,
  tryStartBatch
} from "../econ/batch.js";
import { EventKind } from "../events/kinds.js";
import { EventBatch, EventQueue } from "../events/queue.js";
import { InstrumentSubsystem, type Instrumentation } from "../instrument.js";
import { JobBoard } from "../market/jobboard.js";
import { RoutePlanner } from "../nav/route.js";
import { consumePopulation } from "../pop/consume.js";
import { updatePopulationGrowth } from "../pop/growth.js";
import { Rng } from "../rng.js";
import {
  createDefaultStageOneData,
  resourceIndexOf,
  type StageOneData
} from "../stage-one/data.js";
import { buildStageOneRenderSnapshot } from "../stage-one/render-snapshot.js";
import { hashState } from "../snapshot/hash.js";
import { readStateSnapshot } from "../snapshot/read.js";
import type { SnapshotState } from "../snapshot/types.js";
import { writeStateSnapshot } from "../snapshot/write.js";
import { handleShipArrival, assignIdleHaulers } from "../ships/move.js";
import { ShipRole, ShipState } from "../ships/ships.js";
import { buildTestWorld } from "../world/build-testworld.js";
import { StageOneWorld } from "../world/state.js";

export interface StageOneRunReport {
  readonly ticks: number;
  readonly finalHash: string;
  readonly intermediateHashes: readonly HashCheckpoint[];
  readonly counters: {
    readonly systems: number;
    readonly factions: number;
    readonly ships: number;
    readonly buildings: number;
  };
  readonly metrics: StageOneMetrics;
}

export interface StageOneMetrics {
  readonly totalPopulation: number;
  readonly minPopulation: number;
  readonly averageFoodWaterSpread: number;
  readonly completedBatches: number;
  readonly deliveredShipments: number;
  readonly missedDeparturesFuel: number;
  readonly jobsAvailable: number;
  readonly idleHaulers: number;
}

export interface HashCheckpoint {
  readonly tick: number;
  readonly hash: string;
}

export class StageOneSimulation {
  private readonly eventBatch = new EventBatch(4096);
  private readonly routes = new RoutePlanner(32);
  private readonly jobs = new JobBoard(60);
  private completedBatches = 0;
  private deliveredShipments = 0;
  private missedDeparturesFuel = 0;

  private constructor(
    private readonly rootRng: Rng,
    public readonly data: StageOneData,
    public readonly world: StageOneWorld,
    public tick: number
  ) {}

  public static create(seed: number, data = createDefaultStageOneData()): StageOneSimulation {
    const rootRng = Rng.fromSeed(seed);
    const world = buildTestWorld(data, seed);
    const sim = new StageOneSimulation(rootRng, data, world, 0);
    world.prices.recalculate(data, world.bodies, world.stockpiles, world.buildings);
    bootProduction(data, world, sim.queue, 0);
    sim.refreshLogistics();
    return sim;
  }

  public static fromSnapshot(
    buffer: ArrayBuffer,
    data = createDefaultStageOneData()
  ): StageOneSimulation {
    const restored = readStateSnapshot(buffer);
    const root = restored.rngStreams.find((stream) => stream.name === "root");
    if (root === undefined) throw new Error("Stage one snapshot is missing root RNG.");
    const world = StageOneWorld.fromSnapshots(data, restored.arenas);
    const sim = new StageOneSimulation(Rng.deserialize(root.state), data, world, restored.tick);
    sim.queue = EventQueue.deserialize(restored.eventQueueBuffer);
    return sim;
  }

  private queue = new EventQueue(4096);

  public step(instrumentation?: Instrumentation): void {
    const tickStarted = instrumentation?.begin(InstrumentSubsystem.Total) ?? 0;
    const continuousStarted = instrumentation?.begin(InstrumentSubsystem.Continuous) ?? 0;
    processContinuousBuildings(this.data, this.world);
    consumePopulation(this.data, this.world.bodies, this.world.stockpiles, this.world.supply);
    updatePopulationGrowth(this.data, this.world.bodies, this.world.stockpiles, this.world.supply);
    instrumentation?.end(InstrumentSubsystem.Continuous, continuousStarted);

    const eventStarted = instrumentation?.begin(InstrumentSubsystem.Events) ?? 0;
    const drained = this.queue.drainUntil(this.tick, this.eventBatch);
    this.applyEvents(drained);
    instrumentation?.end(InstrumentSubsystem.Events, eventStarted);

    if (this.tick % 10 === 0) this.refreshLogistics();
    if (this.tick > 0 && this.tick % 30 === 0) {
      detectAndBreakProductionDeadlocks(this.data, this.world, this.queue, this.tick);
    }

    this.tick += 1;
    if (instrumentation?.enabled === true) {
      instrumentation.setEntityCounters({
        systems: this.world.systems.length,
        factions: this.world.factions.length,
        ships: this.world.ships.length,
        buildings: this.world.buildings.length
      });
      const totalMs = instrumentation.end(InstrumentSubsystem.Total, tickStarted);
      instrumentation.recordTick(totalMs);
    }
  }

  public run(
    ticks: number,
    checkpointEvery = 10_000,
    instrumentation?: Instrumentation
  ): StageOneRunReport {
    const checkpoints: HashCheckpoint[] = [];
    const targetTick = this.tick + ticks;
    while (this.tick < targetTick) {
      this.step(instrumentation);
      if (checkpointEvery > 0 && this.tick % checkpointEvery === 0) {
        checkpoints.push({ tick: this.tick, hash: this.hash() });
      }
    }
    return {
      ticks,
      finalHash: this.hash(),
      intermediateHashes: checkpoints,
      counters: {
        systems: this.world.systems.length,
        factions: this.world.factions.length,
        ships: this.world.ships.length,
        buildings: this.world.buildings.length
      },
      metrics: this.metrics()
    };
  }

  public snapshot(): ArrayBuffer {
    return writeStateSnapshot(this.snapshotState());
  }

  public renderSnapshot(slices: number): ArrayBuffer {
    return buildStageOneRenderSnapshot(this, slices);
  }

  public hash(): string {
    return hashState(this.snapshotState());
  }

  public snapshotState(): SnapshotState {
    return {
      tick: this.tick,
      rngStreams: [{ name: "root", state: this.rootRng.serialize() }],
      eventQueue: this.queue,
      arenas: this.world.arenas()
    };
  }

  public metrics(): StageOneMetrics {
    let totalPopulation = 0;
    let minPopulation = Number.POSITIVE_INFINITY;
    for (let body = 0; body < this.world.bodies.length; body += 1) {
      if ((this.world.bodies.owner[body] ?? -1) < 0) continue;
      const population = this.world.bodies.population[body] ?? 0;
      totalPopulation += population;
      if (population < minPopulation) minPopulation = population;
    }
    const food = resourceIndexOf(this.data.resourceIndex, "food");
    const water = resourceIndexOf(this.data.resourceIndex, "water");
    return {
      totalPopulation,
      minPopulation: Number.isFinite(minPopulation) ? minPopulation : 0,
      averageFoodWaterSpread:
        (this.world.prices.spreadForResource(this.world.bodies, food) +
          this.world.prices.spreadForResource(this.world.bodies, water)) /
        2,
      completedBatches: this.completedBatches,
      deliveredShipments: this.deliveredShipments,
      missedDeparturesFuel: this.missedDeparturesFuel,
      jobsAvailable: this.jobs.count,
      idleHaulers: this.countIdleHaulers()
    };
  }

  public jobBoard(): JobBoard {
    return this.jobs;
  }

  public routePlanner(): RoutePlanner {
    return this.routes;
  }

  private applyEvents(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const kind = this.eventBatch.kinds[i] ?? 0;
      const payload = this.eventBatch.payloadIndices[i] ?? 0;
      if (kind === EventKind.BatchComplete) {
        handleBatchComplete(this.data, this.world, this.queue, payload, this.tick);
        this.completedBatches += 1;
      } else if (kind === EventKind.ShipArrival) {
        if (handleShipArrival(this.data, this.world, this.queue, payload, this.tick)) {
          this.deliveredShipments += 1;
        }
      } else if (kind === EventKind.ProductionRetry) {
        tryStartBatch(this.data, this.world, this.queue, payload, this.tick);
      }
    }
  }

  private refreshLogistics(): void {
    this.world.prices.recalculate(
      this.data,
      this.world.bodies,
      this.world.stockpiles,
      this.world.buildings
    );
    this.jobs.update(this.data, this.world, this.routes);
    this.scaleHaulers();
    const before = this.missedDeparturesFuel;
    const result = assignIdleHaulers(
      this.data,
      this.world,
      this.jobs,
      this.routes,
      this.queue,
      this.tick
    );
    this.missedDeparturesFuel = before + result.failedFuel;
  }

  private scaleHaulers(): void {
    const idle = this.countIdleHaulers();
    if (this.jobs.count <= idle * 4 + 6) return;
    for (let faction = 0; faction < this.world.factions.length; faction += 1) {
      const capital = this.world.factions.capitalSystem[faction] ?? 0;
      this.world.addHauler(faction, capital, 1600, 220, 7);
    }
  }

  private countIdleHaulers(): number {
    let count = 0;
    for (let ship = 0; ship < this.world.ships.length; ship += 1) {
      if (
        this.world.ships.role[ship] === ShipRole.Hauler &&
        this.world.ships.state[ship] === ShipState.Idle
      ) {
        count += 1;
      }
    }
    return count;
  }
}
