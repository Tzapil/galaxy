import { type AiScheduledRun, AiLayer, AiScheduler } from "../ai/scheduler.js";
import {
  findBottleneck,
  toOperationalTask,
  AiOperationalTaskKind,
  type AiOperationalTask
} from "../ai/bottleneck.js";
import { createStrategicGoal } from "../ai/goals.js";
import { applyBuildPlan } from "../ai/build-plan/apply.js";
import { createBuildPlan } from "../ai/build-plan/plan.js";
import { logBottleneck, logStrategicGoal } from "../ai/decision-log.js";
import { handleColonizerArrival, runColonization } from "../ai/expansion/colonize.js";
import { scaleCivilianFleet } from "../ai/expansion/fleet-scale.js";
import { personalityWeightsForFaction } from "../ai/utility.js";
import {
  bootProduction,
  detectAndBreakProductionDeadlocks,
  handleBatchComplete,
  processContinuousBuildings,
  tryStartBatch
} from "../econ/batch.js";
import { BuildingState } from "../econ/buildings.js";
import { validatePlacement } from "../econ/placement.js";
import { EventKind } from "../events/kinds.js";
import { EventBatch, EventQueue } from "../events/queue.js";
import { InstrumentSubsystem, type Instrumentation } from "../instrument.js";
import { JobBoard } from "../market/jobboard.js";
import { RoutePlanner } from "../nav/route.js";
import { consumePopulationWithLocalRedistribution } from "../pop/consume-stage-two.js";
import { updatePopulationGrowth } from "../pop/growth.js";
import { collectAndAdvanceResearch } from "../research/research.js";
import { Rng } from "../rng.js";
import { hashState } from "../snapshot/hash.js";
import { readStateSnapshot } from "../snapshot/read.js";
import type { SnapshotState } from "../snapshot/types.js";
import { writeStateSnapshot } from "../snapshot/write.js";
import { handleShipArrival, assignIdleHaulers } from "../ships/move.js";
import { ShipRole, ShipState } from "../ships/ships.js";
import { addKitOrderContracts } from "../ships/kit-order.js";
import { advanceShipyards } from "../ships/shipyard.js";
import { type StageOneBatchRecipe, type StageOneData, resourceIndexOf } from "../stage-one/data.js";
import { repeatableCostAtLevel } from "../tech/repeatable.js";
import { buildStageOneRenderSnapshot } from "../stage-one/render-snapshot.js";
import { GovernmentContracts } from "../treasury/contracts.js";
import { applyDailyTreasury } from "../treasury/treasury.js";
import { completeConstruction, advanceWaitingConstructions } from "../build/construction.js";
import { buildStageTwoWorld } from "../world/build-stage-two-world.js";
import { StageOneWorld } from "../world/state.js";

export interface StageTwoRunReport {
  readonly ticks: number;
  readonly finalHash: string;
  readonly intermediateHashes: readonly StageTwoHashCheckpoint[];
  readonly counters: {
    readonly systems: number;
    readonly factions: number;
    readonly ships: number;
    readonly buildings: number;
  };
  readonly metrics: StageTwoMetrics;
}

export interface StageTwoMetrics {
  readonly totalPopulation: number;
  readonly minPopulation: number;
  readonly averageFoodWaterSpread: number;
  readonly completedBatches: number;
  readonly deliveredShipments: number;
  readonly missedDeparturesFuel: number;
  readonly jobsAvailable: number;
  readonly idleHaulers: number;
  readonly idleNoPower: number;
  readonly idleMissingInput: number;
  readonly constructedBuildings: number;
  readonly disbandedShips: number;
  readonly researchedTechnologies: number;
  readonly activeConstructions: number;
  readonly slotFillRatio: number;
  readonly maxResourceZeroStreakDays: number;
  readonly treasuryMin: number;
  readonly aiStrategicDecisions: number;
  readonly aiOperationalDecisions: number;
  readonly aiTacticalDecisions: number;
  readonly aiBuildPlansStarted: number;
  readonly aiColonizationLaunches: number;
  readonly aiFleetBuilds: number;
  readonly coloniesFounded: number;
  readonly aiOperations: number;
}

export interface StageTwoHashCheckpoint {
  readonly tick: number;
  readonly hash: string;
}

export class StageTwoSimulation {
  private readonly eventBatch = new EventBatch(8192);
  private readonly routes = new RoutePlanner(64);
  private readonly jobs = new JobBoard(160);
  private readonly contracts = new GovernmentContracts(256);
  private readonly aiScheduler = new AiScheduler();
  private readonly aiRuns: AiScheduledRun[] = [];
  private readonly lastBottleneckResource: Int32Array;
  private readonly zeroStreakDays: Uint16Array;
  private readonly maxZeroStreakDays: Uint16Array;
  private completedBatches = 0;
  private deliveredShipments = 0;
  private missedDeparturesFuel = 0;
  private constructedBuildings = 0;
  private disbandedShips = 0;
  private aiStrategicDecisions = 0;
  private aiOperationalDecisions = 0;
  private aiTacticalDecisions = 0;
  private aiBuildPlansStarted = 0;
  private aiColonizationLaunches = 0;
  private aiFleetBuilds = 0;
  private coloniesFounded = 0;
  private aiOperations = 0;
  private treasuryMin = Number.POSITIVE_INFINITY;

  private constructor(
    private readonly rootRng: Rng,
    public readonly data: StageOneData,
    public readonly world: StageOneWorld,
    public tick: number
  ) {
    this.lastBottleneckResource = new Int32Array(Math.max(1, world.factions.length));
    this.lastBottleneckResource.fill(-1);
    this.zeroStreakDays = new Uint16Array(data.resources.length);
    this.maxZeroStreakDays = new Uint16Array(data.resources.length);
    this.updateTreasuryMinimum();
  }

  public static create(seed: number, data: StageOneData): StageTwoSimulation {
    const world = buildStageTwoWorld(data, seed);
    return StageTwoSimulation.createFromWorld(seed, data, world);
  }

  public static createFromWorld(
    seed: number,
    data: StageOneData,
    world: StageOneWorld
  ): StageTwoSimulation {
    const rootRng = Rng.fromSeed(seed);
    const sim = new StageTwoSimulation(rootRng, data, world, 0);
    world.prices.recalculate(data, world.bodies, world.stockpiles, world.buildings);
    bootProduction(data, world, sim.queue, 0);
    sim.refreshLogistics();
    return sim;
  }

  public static fromSnapshot(buffer: ArrayBuffer, data: StageOneData): StageTwoSimulation {
    const restored = readStateSnapshot(buffer);
    const root = restored.rngStreams.find((stream) => stream.name === "root");
    if (root === undefined) throw new Error("Stage two snapshot is missing root RNG.");
    const world = StageOneWorld.fromSnapshots(data, restored.arenas);
    const sim = new StageTwoSimulation(Rng.deserialize(root.state), data, world, restored.tick);
    sim.queue = EventQueue.deserialize(restored.eventQueueBuffer);
    return sim;
  }

  private queue = new EventQueue(8192);

  public step(instrumentation?: Instrumentation): void {
    const tickStarted = instrumentation?.begin(InstrumentSubsystem.Total) ?? 0;
    const continuousStarted = instrumentation?.begin(InstrumentSubsystem.Continuous) ?? 0;
    processContinuousBuildings(this.data, this.world);
    bootProduction(this.data, this.world, this.queue, this.tick);
    consumePopulationWithLocalRedistribution(this.data, this.world);
    updatePopulationGrowth(this.data, this.world.bodies, this.world.stockpiles, this.world.supply);
    collectAndAdvanceResearch(this.data, this.world, this.tick);
    advanceShipyards(this.data, this.world, this.tick);
    const treasury = applyDailyTreasury(this.data, this.world, this.tick);
    this.disbandedShips += treasury.disbandedShips;
    this.updateTreasuryMinimum();
    this.updateZeroStreaks();
    instrumentation?.end(InstrumentSubsystem.Continuous, continuousStarted);

    const eventStarted = instrumentation?.begin(InstrumentSubsystem.Events) ?? 0;
    const drained = this.queue.drainUntil(this.tick, this.eventBatch);
    this.applyEvents(drained, instrumentation);
    advanceWaitingConstructions(this.data, this.world, this.queue, this.tick);
    instrumentation?.end(InstrumentSubsystem.Events, eventStarted);

    if (this.tick % 10 === 0) this.refreshLogistics();
    if (this.tick > 0 && this.tick % 30 === 0) {
      detectAndBreakProductionDeadlocks(this.data, this.world, this.queue, this.tick);
    }
    this.runAi(instrumentation);

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
  ): StageTwoRunReport {
    const checkpoints: StageTwoHashCheckpoint[] = [];
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

  public metrics(): StageTwoMetrics {
    let totalPopulation = 0;
    let minPopulation = Number.POSITIVE_INFINITY;
    let usedSlots = 0;
    let slots = 0;
    for (let body = 0; body < this.world.bodies.length; body += 1) {
      if ((this.world.bodies.owner[body] ?? -1) < 0) continue;
      const population = this.world.bodies.population[body] ?? 0;
      totalPopulation += population;
      if (population < minPopulation) minPopulation = population;
      usedSlots += this.world.bodies.usedSlots[body] ?? 0;
      slots += this.world.bodies.slots[body] ?? 0;
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
      idleHaulers: this.countIdleHaulers(),
      idleNoPower: this.countBuildingsInState(BuildingState.IdleNoPower),
      idleMissingInput: this.countBuildingsInState(BuildingState.IdleMissingInput),
      constructedBuildings: this.constructedBuildings,
      disbandedShips: this.disbandedShips,
      researchedTechnologies: this.minResearchedTechnologies(),
      activeConstructions: this.countBuildingsInState(BuildingState.UnderConstruction),
      slotFillRatio: slots > 0 ? usedSlots / slots : 0,
      maxResourceZeroStreakDays: this.maxTrackedZeroStreak(),
      treasuryMin: Number.isFinite(this.treasuryMin) ? this.treasuryMin : 0,
      aiStrategicDecisions: this.aiStrategicDecisions,
      aiOperationalDecisions: this.aiOperationalDecisions,
      aiTacticalDecisions: this.aiTacticalDecisions,
      aiBuildPlansStarted: this.aiBuildPlansStarted,
      aiColonizationLaunches: this.aiColonizationLaunches,
      aiFleetBuilds: this.aiFleetBuilds,
      coloniesFounded: this.coloniesFounded,
      aiOperations: this.aiOperations
    };
  }

  public jobBoard(): JobBoard {
    return this.jobs;
  }

  public routePlanner(): RoutePlanner {
    return this.routes;
  }

  private applyEvents(count: number, instrumentation?: Instrumentation): void {
    for (let i = 0; i < count; i += 1) {
      const kind = this.eventBatch.kinds[i] ?? 0;
      const payload = this.eventBatch.payloadIndices[i] ?? 0;
      const tacticalStarted = instrumentation?.begin(InstrumentSubsystem.AiTactical) ?? 0;
      if (kind === EventKind.BatchComplete) {
        handleBatchComplete(this.data, this.world, this.queue, payload, this.tick);
        this.completedBatches += 1;
      } else if (kind === EventKind.ShipArrival) {
        if (this.world.ships.role[payload] === ShipRole.Colonizer) {
          if (handleColonizerArrival(this.data, this.world, payload, this.tick)) {
            this.coloniesFounded += 1;
          }
        } else if (
          handleShipArrival(this.data, this.world, this.queue, payload, this.tick, this.contracts)
        ) {
          this.deliveredShipments += 1;
        }
      } else if (kind === EventKind.ProductionRetry) {
        tryStartBatch(this.data, this.world, this.queue, payload, this.tick);
      } else if (kind === EventKind.ConstructionComplete) {
        completeConstruction(this.data, this.world, this.queue, payload, this.tick);
        this.constructedBuildings += 1;
      }
      if (instrumentation?.enabled === true) {
        instrumentation.end(InstrumentSubsystem.AiTactical, tacticalStarted);
      }
      this.aiTacticalDecisions += 1;
    }
  }

  private runAi(instrumentation?: Instrumentation): void {
    this.aiScheduler.collectDue(this.tick, this.world.factions.length, this.aiRuns);
    const strategicStarted = instrumentation?.begin(InstrumentSubsystem.AiStrategic) ?? 0;
    for (let i = 0; i < this.aiRuns.length; i += 1) {
      const run = this.aiRuns[i];
      if (run?.layer === AiLayer.Strategic) this.runStrategicAi(run.faction);
    }
    instrumentation?.end(InstrumentSubsystem.AiStrategic, strategicStarted);

    const operationalStarted = instrumentation?.begin(InstrumentSubsystem.AiOperational) ?? 0;
    for (let i = 0; i < this.aiRuns.length; i += 1) {
      const run = this.aiRuns[i];
      if (run?.layer === AiLayer.Operational) this.runOperationalAi(run.faction);
    }
    instrumentation?.end(InstrumentSubsystem.AiOperational, operationalStarted);
  }

  private runStrategicAi(faction: number): void {
    const weights = personalityWeightsForFaction(this.data, this.world, faction);
    const prior = this.lastBottleneckResource[faction] ?? -1;
    const goal = createStrategicGoal(this.data, this.world, faction, this.tick, weights, prior);
    const bottleneck = findBottleneck(this.data, this.world, faction, goal);
    const resource = bottleneck?.resource ?? goal.resource;
    this.lastBottleneckResource[faction] = resource;
    this.aiOperations += bottleneck?.operations ?? 0;
    logStrategicGoal(
      this.data,
      this.world,
      this.tick,
      faction,
      goal.subject,
      resource,
      bottleneck?.deficitPerDay ?? goal.priority
    );
    if (bottleneck !== undefined) {
      logBottleneck(this.data, this.world, this.tick, faction, resource, bottleneck.deficitPerDay);
    }
    this.aiStrategicDecisions += 1;
  }

  private runOperationalAi(faction: number): void {
    const weights = personalityWeightsForFaction(this.data, this.world, faction);
    const goal = createStrategicGoal(
      this.data,
      this.world,
      faction,
      this.tick,
      weights,
      this.lastBottleneckResource[faction] ?? -1
    );
    const bottleneck = findBottleneck(this.data, this.world, faction, goal);
    if (bottleneck !== undefined) {
      this.aiOperations += bottleneck.operations;
      if ((this.lastBottleneckResource[faction] ?? -1) !== bottleneck.resource) {
        logBottleneck(
          this.data,
          this.world,
          this.tick,
          faction,
          bottleneck.resource,
          bottleneck.deficitPerDay
        );
      }
      this.lastBottleneckResource[faction] = bottleneck.resource;
    }

    const task = toOperationalTask(this.data, this.world, faction, bottleneck);
    if (
      task.kind === AiOperationalTaskKind.BuildProducer &&
      this.canStartAiBuild(faction, task.resource)
    ) {
      const plan = createBuildPlan(this.data, this.world, task);
      const applied = applyBuildPlan(this.data, this.world, this.queue, this.tick, plan);
      this.aiBuildPlansStarted += applied.started;
      this.aiOperations += plan.operations;
    } else if (
      task.kind === AiOperationalTaskKind.ColonizeResource &&
      this.canStartAiExpansion(faction)
    ) {
      const colonization = runColonization(
        this.data,
        this.world,
        this.routes,
        this.queue,
        faction,
        this.tick,
        task.resource
      );
      if (colonization.launched) this.aiColonizationLaunches += 1;
      if (colonization.built) this.aiOperations += 1;
    }

    const fleet = scaleCivilianFleet(this.data, this.world, this.jobs, faction, this.tick);
    if (fleet.built) this.aiFleetBuilds += 1;
    this.runFleetIndustryNudge(faction);
    this.runExpansionNudge(faction);
    this.aiOperationalDecisions += 1;
  }

  private runFleetIndustryNudge(faction: number): void {
    if (this.tick < 365 * 900) return;
    const task = this.fleetIndustryTask(faction);
    if (task === undefined || !this.canStartFleetIndustry(faction)) return;
    const plan = {
      faction,
      items: [
        {
          body: task.body,
          buildingType: task.buildingType,
          count: 1,
          resource: task.resource,
          score: task.score
        }
      ],
      operations: 1
    };
    const applied = applyBuildPlan(this.data, this.world, this.queue, this.tick, plan);
    this.aiBuildPlansStarted += applied.started;
    this.aiOperations += plan.operations;
  }

  private fleetIndustryTask(faction: number): AiOperationalTask | undefined {
    const hullFrames = this.data.resourceIndex.get("hull_frames") ?? -1;
    const hullYard = this.data.buildingIndex.get("hull_yard") ?? -1;
    const shipyard = this.data.buildingIndex.get("shipyard") ?? -1;
    if (hullFrames < 0 || hullYard < 0 || shipyard < 0) return undefined;
    if (!this.factionHasBuilding(faction, hullYard)) {
      const body = this.bestBodyForBuilding(faction, hullYard);
      if (body >= 0) {
        return {
          kind: AiOperationalTaskKind.BuildProducer,
          faction,
          resource: hullFrames,
          body,
          buildingType: hullYard,
          score: 1
        };
      }
    }
    if (!this.factionHasBuilding(faction, shipyard)) {
      const body = this.bestBodyForBuilding(faction, shipyard);
      if (body >= 0) {
        return {
          kind: AiOperationalTaskKind.BuildProducer,
          faction,
          resource: hullFrames,
          body,
          buildingType: shipyard,
          score: 0.8
        };
      }
    }
    return undefined;
  }

  private canStartAiBuild(faction: number, resource: number): boolean {
    if (this.resourceIsStabilityCritical(resource)) return true;
    if ((this.world.factions.treasury[faction] ?? 0) < 500) return false;
    return this.minVitalReserveDays(faction) >= 90;
  }

  private canStartAiExpansion(faction: number): boolean {
    if ((this.world.factions.treasury[faction] ?? 0) < 20_000) return false;
    if (this.maxTrackedZeroStreak() > 0) return false;
    if (this.minVitalReserveDays(faction) < 14) return false;
    const population = this.factionPopulation(faction);
    return population > 200;
  }

  private runExpansionNudge(faction: number): void {
    if (this.tick < 365 * 8 || !this.canStartAiExpansion(faction)) return;
    const colonization = runColonization(
      this.data,
      this.world,
      this.routes,
      this.queue,
      faction,
      this.tick,
      this.lastBottleneckResource[faction] ?? -1
    );
    if (colonization.launched) this.aiColonizationLaunches += 1;
    if (colonization.built) this.aiOperations += 1;
  }

  private canStartFleetIndustry(faction: number): boolean {
    if ((this.world.factions.treasury[faction] ?? 0) < 50_000) return false;
    if (this.maxTrackedZeroStreak() > 0) return false;
    if (this.factionPopulation(faction) < 300) return false;
    return this.minVitalReserveDays(faction) >= 14;
  }

  private refreshLogistics(): void {
    this.world.prices.recalculate(
      this.data,
      this.world.bodies,
      this.world.stockpiles,
      this.world.buildings
    );
    this.refreshContracts();
    this.jobs.update(this.data, this.world, this.routes, this.contracts);
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

  private refreshContracts(): void {
    this.contracts.clear();
    for (let faction = 0; faction < this.world.factions.length; faction += 1) {
      let body = this.world.factions.firstColony[faction] ?? -1;
      while (body >= 0) {
        this.addShortageContracts(faction, body);
        body = this.world.bodies.nextInFaction[body] ?? -1;
      }
    }
    this.addResearchConversionInputContracts();
    this.addConstructionMaterialContracts();
    addKitOrderContracts(this.data, this.world, this.contracts);
  }

  private addShortageContracts(faction: number, body: number): void {
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      const demand = this.world.prices.demand(body, resource);
      if (demand <= 0) continue;
      const stockpile = this.world.bodies.stockpile[body] ?? 0;
      const stock = this.world.stockpiles.get(stockpile, resource);
      const target = Math.max(30, demand * 30);
      if (stock >= target) continue;
      this.contracts.add({
        faction,
        targetBody: body,
        resource,
        creditsPerUnit: contractCreditsPerUnit(this.data, resource)
      });
    }
  }

  private addConstructionMaterialContracts(): void {
    for (let building = 0; building < this.world.buildings.length; building += 1) {
      if (this.world.buildings.state[building] !== BuildingState.UnderConstruction) continue;
      if ((this.world.buildings.finishTick[building] ?? -1) >= 0) continue;
      const resource = this.world.buildings.stateResource[building] ?? -1;
      if (resource < 0 || this.data.transportable[resource] !== 1) continue;
      const body = this.world.buildings.body[building] ?? -1;
      const faction = this.world.bodies.owner[body] ?? -1;
      if (body < 0 || faction < 0) continue;
      this.contracts.add({
        faction,
        targetBody: body,
        resource,
        creditsPerUnit: (this.data.baseValue[resource] ?? 1) * 0.4
      });
    }
  }

  private addResearchConversionInputContracts(): void {
    for (let faction = 0; faction < this.world.factions.length; faction += 1) {
      const current = this.world.techState.currentTech[faction] ?? -1;
      const tech = this.data.techs[current];
      if (tech === undefined) continue;
      const capital = this.world.factions.capitalBody[faction] ?? -1;
      if (capital < 0) continue;
      const cost = repeatableCostAtLevel(
        tech,
        (this.world.techState.level(current, faction) ?? 0) + 1
      );
      this.addScienceInputContracts(
        faction,
        capital,
        "data_physics",
        cost.physics - (this.world.techState.progressPhysics[faction] ?? 0)
      );
      this.addScienceInputContracts(
        faction,
        capital,
        "data_engineering",
        cost.engineering - (this.world.techState.progressEngineering[faction] ?? 0)
      );
      this.addScienceInputContracts(
        faction,
        capital,
        "data_bio",
        cost.bio - (this.world.techState.progressBio[faction] ?? 0)
      );
    }
  }

  private addScienceInputContracts(
    faction: number,
    capital: number,
    outputResourceId: string,
    remainingOutput: number
  ): void {
    if (remainingOutput <= 0.001) return;
    const outputResource = this.data.resourceIndex.get(outputResourceId) ?? -1;
    if (outputResource < 0) return;
    let building = this.world.bodies.firstBuilding[capital] ?? -1;
    while (building >= 0) {
      const state = this.world.buildings.state[building] ?? BuildingState.UnderConstruction;
      if (state !== BuildingState.Demolished && state !== BuildingState.UnderConstruction) {
        const recipe = this.data.batchRecipes[this.world.buildings.batchRecipe[building] ?? -1];
        if (recipe !== undefined && recipeOutputsResource(recipe, outputResource)) {
          for (let i = 0; i < recipe.inputs.length; i += 1) {
            const input = recipe.inputs[i];
            if (input === undefined) throw new RangeError("Recipe input is inconsistent.");
            if (input.resource === this.data.energyResource) continue;
            if (this.data.transportable[input.resource] !== 1) continue;
            this.contracts.add({
              faction,
              targetBody: capital,
              resource: input.resource,
              creditsPerUnit: (this.data.baseValue[input.resource] ?? 1) * 6
            });
            this.addProducerInputContracts(faction, capital, input.resource);
          }
        }
      }
      building = this.world.buildings.nextInBody[building] ?? -1;
    }
  }

  private addProducerInputContracts(faction: number, body: number, outputResource: number): void {
    let building = this.world.bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
      const state = this.world.buildings.state[building] ?? BuildingState.UnderConstruction;
      if (state !== BuildingState.Demolished && state !== BuildingState.UnderConstruction) {
        const recipe = this.data.batchRecipes[this.world.buildings.batchRecipe[building] ?? -1];
        if (recipe !== undefined && recipeOutputsResource(recipe, outputResource)) {
          for (let i = 0; i < recipe.inputs.length; i += 1) {
            const input = recipe.inputs[i];
            if (input === undefined) throw new RangeError("Recipe input is inconsistent.");
            if (input.resource === this.data.energyResource) continue;
            if (this.data.transportable[input.resource] !== 1) continue;
            this.contracts.add({
              faction,
              targetBody: body,
              resource: input.resource,
              creditsPerUnit: (this.data.baseValue[input.resource] ?? 1) * 4
            });
          }
        }
      }
      building = this.world.buildings.nextInBody[building] ?? -1;
    }
  }

  private updateTreasuryMinimum(): void {
    for (let faction = 0; faction < this.world.factions.length; faction += 1) {
      this.treasuryMin = Math.min(this.treasuryMin, this.world.factions.treasury[faction] ?? 0);
    }
  }

  private resourceIsStabilityCritical(resource: number): boolean {
    if (resource < 0) return false;
    if (resource === this.data.energyResource) return true;
    const id = this.data.resources[resource]?.id;
    if (id === "fuel" || id === "ice" || id === "biomass" || id === "gas" || id === "polymers") {
      return true;
    }
    return (
      (this.data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
      this.data.populationNeeds.comfortOnly[resource] !== 1
    );
  }

  private factionHasBuilding(faction: number, buildingType: number): boolean {
    for (let building = 0; building < this.world.buildings.length; building += 1) {
      const body = this.world.buildings.body[building] ?? -1;
      if ((this.world.bodies.owner[body] ?? -1) !== faction) continue;
      if (
        this.world.buildings.type[building] === buildingType &&
        this.world.buildings.state[building] !== BuildingState.Demolished
      ) {
        return true;
      }
    }
    return false;
  }

  private bestBodyForBuilding(faction: number, buildingType: number): number {
    let bestBody = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let body = this.world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
      const free = (this.world.bodies.slots[body] ?? 0) - (this.world.bodies.usedSlots[body] ?? 0);
      const placement = validatePlacement(this.data, this.world, body, buildingType);
      if (placement.ok || placement.reason === "noPowerSource") {
        const score =
          free +
          (this.world.bodies.habitability[body] ?? 0) +
          (body === (this.world.factions.capitalBody[faction] ?? -1) ? 2 : 0);
        if (score > bestScore + 1e-9) {
          bestScore = score;
          bestBody = body;
        }
      }
      body = this.world.bodies.nextInFaction[body] ?? -1;
    }
    return bestBody;
  }

  private minVitalReserveDays(faction: number): number {
    let min = Number.POSITIVE_INFINITY;
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      if ((this.data.populationNeeds.perThousandPopPerDay[resource] ?? 0) <= 0) continue;
      if (this.data.populationNeeds.comfortOnly[resource] === 1) continue;
      const demand = this.factionDailyNeed(faction, resource);
      if (demand <= 0) continue;
      min = Math.min(min, this.factionStock(faction, resource) / demand);
    }
    return Number.isFinite(min) ? min : 0;
  }

  private factionDailyNeed(faction: number, resource: number): number {
    let demand = 0;
    let body = this.world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
      demand +=
        (this.world.bodies.population[body] ?? 0) *
        (this.data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
      body = this.world.bodies.nextInFaction[body] ?? -1;
    }
    return demand;
  }

  private factionStock(faction: number, resource: number): number {
    let stock = 0;
    let body = this.world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
      stock += this.world.stockpiles.get(this.world.bodies.stockpile[body] ?? 0, resource);
      body = this.world.bodies.nextInFaction[body] ?? -1;
    }
    return stock;
  }

  private factionPopulation(faction: number): number {
    let population = 0;
    let body = this.world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
      population += this.world.bodies.population[body] ?? 0;
      body = this.world.bodies.nextInFaction[body] ?? -1;
    }
    return population;
  }

  private updateZeroStreaks(): void {
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      if (!this.tracksZeroStreak(resource)) continue;
      const total = this.totalOwnedStock(resource);
      if (total <= 0.001) {
        this.zeroStreakDays[resource] = Math.min(65535, (this.zeroStreakDays[resource] ?? 0) + 1);
        this.maxZeroStreakDays[resource] = Math.max(
          this.maxZeroStreakDays[resource] ?? 0,
          this.zeroStreakDays[resource] ?? 0
        );
      } else {
        this.zeroStreakDays[resource] = 0;
      }
    }
  }

  private tracksZeroStreak(resource: number): boolean {
    if (
      (this.data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
      this.data.populationNeeds.comfortOnly[resource] !== 1
    ) {
      return true;
    }
    const id = this.data.resources[resource]?.id;
    return id === "fuel";
  }

  private totalOwnedStock(resource: number): number {
    let total = 0;
    for (let body = 0; body < this.world.bodies.length; body += 1) {
      if ((this.world.bodies.owner[body] ?? -1) < 0) continue;
      total += this.world.stockpiles.get(this.world.bodies.stockpile[body] ?? 0, resource);
    }
    return total;
  }

  private countBuildingsInState(state: BuildingState): number {
    let count = 0;
    for (let building = 0; building < this.world.buildings.length; building += 1) {
      if (this.world.buildings.state[building] === state) count += 1;
    }
    return count;
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

  private minResearchedTechnologies(): number {
    let min = Number.POSITIVE_INFINITY;
    for (let faction = 0; faction < this.world.factions.length; faction += 1) {
      min = Math.min(min, this.world.factions.researchedCount[faction] ?? 0);
    }
    return Number.isFinite(min) ? min : 0;
  }

  private maxTrackedZeroStreak(): number {
    let max = 0;
    for (let resource = 0; resource < this.maxZeroStreakDays.length; resource += 1) {
      if (this.tracksZeroStreak(resource))
        max = Math.max(max, this.maxZeroStreakDays[resource] ?? 0);
    }
    return max;
  }
}

function contractCreditsPerUnit(data: StageOneData, resource: number): number {
  const baseValue = data.baseValue[resource] ?? 1;
  if (
    (data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
    data.populationNeeds.comfortOnly[resource] !== 1
  ) {
    return Math.max(baseValue * 4, 4);
  }
  return baseValue * 0.75;
}

function recipeOutputsResource(recipe: StageOneBatchRecipe, resource: number): boolean {
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    if ((recipe.outputs[i]?.resource ?? -1) === resource) return true;
  }
  return false;
}
