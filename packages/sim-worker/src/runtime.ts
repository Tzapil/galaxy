import {
  buildStageThreeWorld,
  currentStoryEvents,
  createStageTwoDataFromGameData,
  Instrumentation,
  renderStoryEventForRow,
  StageTwoSimulation,
  type EntityCounters,
  type InstrumentationSummary,
  type RenderEvent
} from "@galaxy-sim/sim-core";
import { GAME_DATA } from "@galaxy-sim/sim-data/game-data";

import { HistoryAccumulator } from "./history.js";
import { decodeWorkerSave, encodeWorkerSave } from "./save-envelope.js";
import type {
  FactionSummary,
  StageOneInitParams,
  StageOneWorkerStats,
  TechnicalLimits,
  WorkerCommand,
  WorkerMessage,
  WorkerSpeed
} from "./protocol.js";
import { DEFAULT_RENDER_SLICES, buildRenderSnapshot } from "./snapshot-view.js";
import { buildSystemView } from "./system-view.js";

const SNAPSHOT_INTERVAL_MS = 1000 / 30;
const STATS_INTERVAL_MS = 250;
const data = createStageTwoDataFromGameData(GAME_DATA);

export interface StageOneWorkerRuntimeOptions {
  readonly nowMs?: () => number;
  readonly maxWorkMs?: number;
}

export class StageOneWorkerRuntime {
  private readonly nowMs: () => number;
  private readonly maxWorkMs: number;
  private simulation: StageTwoSimulation | undefined;
  private history = new HistoryAccumulator();
  private instrumentation: Instrumentation | undefined;
  private instrumentationStartMs = 0;
  private targetSpeed: WorkerSpeed = 1;
  private lastNonZeroSpeed: WorkerSpeed = 1;
  private running = false;
  private tickCredit = 0;
  private subscribedSlices = DEFAULT_RENDER_SLICES;
  private lastSnapshotMs = Number.NEGATIVE_INFINITY;
  private lastStatsMs = Number.NEGATIVE_INFINITY;
  private lastActualSpeed = 0;
  private lastTickMs = 0;
  private selectedSystem = -1;
  private pendingStoryEvents: RenderEvent[] = [];
  private unsubscribeStory: (() => void) | undefined;
  private technicalLimits: TechnicalLimits = {};

  public constructor(options: StageOneWorkerRuntimeOptions = {}) {
    this.nowMs = options.nowMs ?? (() => 0);
    this.maxWorkMs = options.maxWorkMs ?? Number.POSITIVE_INFINITY;
  }

  public handle(command: WorkerCommand): WorkerMessage[] {
    try {
      if (command.type === "init") return this.init(command.seed, command.params);
      if (command.type === "setSpeed") return this.setSpeed(command.multiplier);
      if (command.type === "pause") return this.pause();
      if (command.type === "resume") return this.resume();
      if (command.type === "subscribe") return this.subscribe(command.slices);
      if (command.type === "save") return this.save(command.slotId);
      if (command.type === "load") {
        return this.load(command.slotId, command.buffer, command.technicalLimits);
      }
      if (command.type === "selectSystem") return this.selectSystem(command.system);
      if (command.type === "history") return [this.historyMessage(command.request)];
      return [this.error("Unknown worker command.")];
    } catch (error) {
      return [this.error(error instanceof Error ? error.message : "Unknown worker error.")];
    }
  }

  public advanceElapsed(elapsedMs: number, maxTicks = Number.POSITIVE_INFINITY): WorkerMessage[] {
    if (this.simulation === undefined || !this.running || this.targetSpeed === 0)
      return this.periodicMessages(0, Math.max(0, elapsedMs));
    const safeElapsed = Math.max(0, elapsedMs);
    this.tickCredit += (safeElapsed * this.targetSpeed) / 1000;
    const wantedTicks = Math.floor(this.tickCredit);
    const allowedTicks = Math.max(0, Math.min(wantedTicks, Math.floor(maxTicks)));
    const started = this.nowMs();
    let advancedTicks = 0;
    for (let i = 0; i < allowedTicks; i += 1) {
      const tickStarted = this.nowMs();
      this.simulation.step(this.instrumentation);
      this.history.capture(this.simulation);
      this.lastTickMs = this.nowMs() - tickStarted;
      advancedTicks += 1;
      if (advancedTicks > 0 && this.nowMs() - started >= this.maxWorkMs) break;
    }

    this.tickCredit -= advancedTicks;
    if (advancedTicks < wantedTicks) this.tickCredit = 0;
    this.lastActualSpeed = safeElapsed > 0 ? (advancedTicks / safeElapsed) * 1000 : 0;
    if (advancedTicks > 0 && this.lastTickMs <= 0) {
      this.lastTickMs = (this.nowMs() - started) / advancedTicks;
    }
    return this.periodicMessages(advancedTicks, safeElapsed);
  }

  public advanceTicks(ticks: number): void {
    if (this.simulation === undefined) throw new Error("Simulation is not initialized.");
    for (let i = 0; i < ticks; i += 1) {
      this.simulation.step(this.instrumentation);
      this.history.capture(this.simulation);
    }
  }

  public get tick(): number {
    return this.simulation?.tick ?? 0;
  }

  public hash(): string {
    if (this.simulation === undefined) throw new Error("Simulation is not initialized.");
    return this.simulation.hash();
  }

  public fullSnapshot(): ArrayBuffer {
    if (this.simulation === undefined) throw new Error("Simulation is not initialized.");
    return this.simulation.snapshot();
  }

  private init(seed: number, params: StageOneInitParams = {}): WorkerMessage[] {
    this.simulation =
      params.galaxy === undefined
        ? StageTwoSimulation.create(seed, data)
        : StageTwoSimulation.createFromWorld(
            seed,
            data,
            buildStageThreeWorld(data, seed, params.galaxy)
          );
    this.technicalLimits = { ...params.technicalLimits };
    applyTechnicalLimits(this.simulation, this.technicalLimits);
    this.history = new HistoryAccumulator();
    this.history.capture(this.simulation);
    this.attachStoryFeed();
    this.targetSpeed = params.speed ?? 1;
    if (this.targetSpeed !== 0) this.lastNonZeroSpeed = this.targetSpeed;
    this.running = params.startPaused === true ? false : this.targetSpeed !== 0;
    this.tickCredit = 0;
    this.subscribedSlices = params.slices ?? DEFAULT_RENDER_SLICES;
    this.selectedSystem = -1;
    this.instrumentationStartMs = this.nowMs();
    this.instrumentation = new Instrumentation({
      enabled: true,
      targetTicksPerSecond: params.targetTicksPerSecond ?? this.targetSpeed,
      historyCapacity: 256,
      nowMs: this.nowMs
    });
    this.lastSnapshotMs = Number.NEGATIVE_INFINITY;
    this.lastStatsMs = Number.NEGATIVE_INFINITY;

    const storyMessage = this.drainStoryMessage();
    return [
      {
        channel: "control",
        type: "ready",
        tick: this.simulation.tick,
        hash: this.simulation.hash()
      },
      this.snapshotMessage(),
      this.statsMessage(),
      ...(storyMessage === undefined ? [] : [storyMessage])
    ];
  }

  private setSpeed(multiplier: WorkerSpeed): WorkerMessage[] {
    this.requireSimulation();
    this.targetSpeed = multiplier;
    if (multiplier !== 0) this.lastNonZeroSpeed = multiplier;
    this.running = multiplier !== 0;
    this.tickCredit = 0;
    this.resetInstrumentation();
    return [this.statsMessage()];
  }

  private pause(): WorkerMessage[] {
    this.requireSimulation();
    this.running = false;
    this.tickCredit = 0;
    return [this.statsMessage()];
  }

  private resume(): WorkerMessage[] {
    this.requireSimulation();
    if (this.targetSpeed === 0) this.targetSpeed = this.lastNonZeroSpeed;
    this.running = true;
    this.resetInstrumentation();
    return [this.statsMessage()];
  }

  private subscribe(slices: number): WorkerMessage[] {
    this.requireSimulation();
    this.subscribedSlices = slices;
    return [this.snapshotMessage()];
  }

  private save(slotId: string): WorkerMessage[] {
    const simulation = this.requireSimulation();
    const buffer = encodeWorkerSave(simulation.snapshot(), this.history.serialize());
    return [
      {
        channel: "control",
        type: "saved",
        slotId,
        tick: simulation.tick,
        hash: simulation.hash(),
        buffer
      }
    ];
  }

  private load(
    slotId: string,
    buffer?: ArrayBuffer,
    technicalLimits?: TechnicalLimits
  ): WorkerMessage[] {
    if (buffer === undefined) return [this.error("Load command requires a snapshot buffer.")];
    const payload = decodeWorkerSave(buffer);
    this.simulation = StageTwoSimulation.fromSnapshot(payload.simulation, data);
    if (technicalLimits !== undefined) this.technicalLimits = { ...technicalLimits };
    applyTechnicalLimits(this.simulation, this.technicalLimits);
    this.history =
      payload.history === undefined
        ? new HistoryAccumulator()
        : HistoryAccumulator.deserialize(payload.history);
    if (payload.history === undefined) this.history.capture(this.simulation);
    this.attachStoryFeed();
    this.tickCredit = 0;
    this.resetInstrumentation();
    const storyMessage = this.drainStoryMessage();
    return [
      {
        channel: "control",
        type: "loaded",
        slotId,
        tick: this.simulation.tick,
        hash: this.simulation.hash()
      },
      this.snapshotMessage(),
      this.statsMessage(),
      ...(this.selectedSystem >= 0 ? [this.systemMessage()] : []),
      ...(storyMessage === undefined ? [] : [storyMessage])
    ];
  }

  private selectSystem(system: number): WorkerMessage[] {
    const simulation = this.requireSimulation();
    if (system < 0 || system >= simulation.world.systems.length) {
      return [this.error(`Unknown system ${system}.`)];
    }
    this.selectedSystem = system;
    return [this.systemMessage()];
  }

  private periodicMessages(_ticksAdvanced: number, elapsedMs: number): WorkerMessage[] {
    const messages: WorkerMessage[] = [];
    const now = this.nowMs();
    if (this.simulation !== undefined && now - this.lastSnapshotMs >= SNAPSHOT_INTERVAL_MS - 0.5) {
      messages.push(this.snapshotMessage());
      if (this.selectedSystem >= 0) messages.push(this.systemMessage());
      const storyMessage = this.drainStoryMessage();
      if (storyMessage !== undefined) messages.push(storyMessage);
    }
    if (this.simulation !== undefined && now - this.lastStatsMs >= STATS_INTERVAL_MS) {
      if (elapsedMs <= 0) this.lastActualSpeed = 0;
      messages.push(this.statsMessage());
    }
    return messages;
  }

  private snapshotMessage(): WorkerMessage {
    const simulation = this.requireSimulation();
    const buffer = buildRenderSnapshot(simulation, this.subscribedSlices);
    this.lastSnapshotMs = this.nowMs();
    return {
      channel: "snapshot",
      type: "snapshot",
      tick: simulation.tick,
      slices: this.subscribedSlices,
      buffer
    };
  }

  private statsMessage(): WorkerMessage {
    const simulation = this.requireSimulation();
    this.lastStatsMs = this.nowMs();
    return {
      channel: "stats",
      type: "stats",
      stats: this.statsFromSummary(
        this.instrumentation?.summary(this.nowMs() - this.instrumentationStartMs)
      ),
      metrics: simulation.metrics()
    };
  }

  private statsFromSummary(summary?: InstrumentationSummary): StageOneWorkerStats {
    const simulation = this.requireSimulation();
    return {
      tick: simulation.tick,
      targetSpeed: this.running ? this.targetSpeed : 0,
      actualSpeed: this.running ? this.lastActualSpeed : 0,
      tickMs: this.lastTickMs,
      subsystemMs: summary?.subsystemMs ?? [],
      tickMsHistory: summary?.tickMsHistory ?? [],
      counters:
        summary?.counters ??
        ({
          systems: simulation.world.systems.length,
          factions: simulation.world.factions.length,
          ships: simulation.world.ships.length,
          buildings: simulation.world.buildings.length
        } satisfies EntityCounters),
      factions: factionSummaries(simulation)
    };
  }

  private resetInstrumentation(): void {
    this.instrumentationStartMs = this.nowMs();
    this.instrumentation = new Instrumentation({
      enabled: true,
      targetTicksPerSecond: this.targetSpeed,
      historyCapacity: 256,
      nowMs: this.nowMs
    });
    this.lastActualSpeed = 0;
    this.lastTickMs = 0;
    this.lastStatsMs = Number.NEGATIVE_INFINITY;
  }

  private systemMessage(): WorkerMessage {
    const simulation = this.requireSimulation();
    return {
      channel: "system",
      type: "system",
      view: buildSystemView(simulation, this.selectedSystem)
    };
  }

  private historyMessage(request: import("./history.js").HistoryRequest): WorkerMessage {
    this.requireSimulation();
    return { channel: "history", type: "history", payload: this.history.query(request) };
  }

  private attachStoryFeed(): void {
    this.unsubscribeStory?.();
    const simulation = this.requireSimulation();
    this.pendingStoryEvents = currentStoryEvents(simulation.world);
    this.unsubscribeStory = simulation.world.eventLog.subscribe((row) => {
      const event = renderStoryEventForRow(simulation.world, row);
      if (event === undefined) return;
      this.pendingStoryEvents.push(event);
      if (this.pendingStoryEvents.length > 6000) {
        const milestones = this.pendingStoryEvents.filter((item) => item.milestone);
        const routine = this.pendingStoryEvents.filter((item) => !item.milestone).slice(-1200);
        this.pendingStoryEvents = [...milestones, ...routine].sort(
          (left, right) => left.serial - right.serial
        );
      }
    });
  }

  private drainStoryMessage(): WorkerMessage | undefined {
    if (this.pendingStoryEvents.length === 0) return undefined;
    const events = this.pendingStoryEvents;
    this.pendingStoryEvents = [];
    return { channel: "events", type: "events", events };
  }

  private requireSimulation(): StageTwoSimulation {
    if (this.simulation === undefined) throw new Error("Simulation is not initialized.");
    return this.simulation;
  }

  private error(message: string): WorkerMessage {
    return { channel: "control", type: "error", message };
  }
}

function applyTechnicalLimits(
  simulation: StageTwoSimulation,
  limits: TechnicalLimits | undefined
): void {
  if (limits?.maxShips !== undefined && simulation.world.ships.length > limits.maxShips) {
    throw new RangeError(
      "Initial fleet exceeds maxShips; enable unlimited ships or raise the limit."
    );
  }
  if (
    limits?.maxBuildings !== undefined &&
    simulation.world.buildings.length > limits.maxBuildings
  ) {
    throw new RangeError(
      "Initial industry exceeds maxBuildings; enable unlimited buildings or raise the limit."
    );
  }
  simulation.world.setTechnicalLimits(limits);
}

function factionSummaries(simulation: StageTwoSimulation): FactionSummary[] {
  const world = simulation.world;
  const summaries: FactionSummary[] = [];
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    let systems = 0;
    let population = 0;
    let ships = 0;
    let fleetValue = 0;
    for (let system = 0; system < world.systems.length; system += 1) {
      if ((world.systems.owner[system] ?? -1) === faction) systems += 1;
    }
    for (let body = 0; body < world.bodies.length; body += 1) {
      if ((world.bodies.owner[body] ?? -1) === faction)
        population += world.bodies.population[body] ?? 0;
    }
    for (let ship = 0; ship < world.ships.length; ship += 1) {
      if ((world.ships.faction[ship] ?? -1) !== faction) continue;
      ships += 1;
      const blueprint = world.ships.blueprint[ship] ?? -1;
      fleetValue += blueprint >= 0 ? (world.blueprints.cost[blueprint] ?? 100) : 100;
    }
    const treasury = world.factions.treasury[faction] ?? 0;
    summaries.push({
      id: faction,
      label: world.factions.label(faction),
      systems,
      population,
      ships,
      treasury,
      power: population + fleetValue + Math.max(0, treasury) * 0.01
    });
  }
  return summaries;
}
