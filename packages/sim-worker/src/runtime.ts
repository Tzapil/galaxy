import {
  Instrumentation,
  StageOneSimulation,
  type EntityCounters,
  type InstrumentationSummary
} from "@galaxy-sim/sim-core";

import type { StageOneWorkerStats, WorkerCommand, WorkerMessage, WorkerSpeed } from "./protocol.js";
import { DEFAULT_RENDER_SLICES, buildRenderSnapshot } from "./snapshot-view.js";

const SNAPSHOT_INTERVAL_MS = 1000 / 30;
const STATS_INTERVAL_MS = 250;

export interface StageOneWorkerRuntimeOptions {
  readonly nowMs?: () => number;
}

export class StageOneWorkerRuntime {
  private readonly nowMs: () => number;
  private simulation: StageOneSimulation | undefined;
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

  public constructor(options: StageOneWorkerRuntimeOptions = {}) {
    this.nowMs = options.nowMs ?? (() => 0);
  }

  public handle(command: WorkerCommand): WorkerMessage[] {
    try {
      if (command.type === "init")
        return this.init(
          command.seed,
          command.params?.speed,
          command.params?.startPaused,
          command.params?.slices
        );
      if (command.type === "setSpeed") return this.setSpeed(command.multiplier);
      if (command.type === "pause") return this.pause();
      if (command.type === "resume") return this.resume();
      if (command.type === "subscribe") return this.subscribe(command.slices);
      if (command.type === "save") return this.save(command.slotId);
      if (command.type === "load") return this.load(command.slotId, command.buffer);
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

    for (let i = 0; i < allowedTicks; i += 1) {
      const tickStarted = this.nowMs();
      this.simulation.step(this.instrumentation);
      this.lastTickMs = this.nowMs() - tickStarted;
    }

    this.tickCredit -= allowedTicks;
    if (allowedTicks < wantedTicks) this.tickCredit = 0;
    this.lastActualSpeed = safeElapsed > 0 ? (allowedTicks / safeElapsed) * 1000 : 0;
    if (allowedTicks > 0 && this.lastTickMs <= 0) {
      this.lastTickMs = (this.nowMs() - started) / allowedTicks;
    }
    return this.periodicMessages(allowedTicks, safeElapsed);
  }

  public advanceTicks(ticks: number): void {
    if (this.simulation === undefined) throw new Error("Simulation is not initialized.");
    for (let i = 0; i < ticks; i += 1) this.simulation.step(this.instrumentation);
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

  private init(
    seed: number,
    speed?: WorkerSpeed,
    startPaused?: boolean,
    slices?: number
  ): WorkerMessage[] {
    this.simulation = StageOneSimulation.create(seed);
    this.targetSpeed = speed ?? 1;
    if (this.targetSpeed !== 0) this.lastNonZeroSpeed = this.targetSpeed;
    this.running = startPaused === true ? false : this.targetSpeed !== 0;
    this.tickCredit = 0;
    this.subscribedSlices = slices ?? DEFAULT_RENDER_SLICES;
    this.instrumentationStartMs = this.nowMs();
    this.instrumentation = new Instrumentation({
      enabled: true,
      targetTicksPerSecond: this.targetSpeed,
      historyCapacity: 256,
      nowMs: this.nowMs
    });
    this.lastSnapshotMs = Number.NEGATIVE_INFINITY;
    this.lastStatsMs = Number.NEGATIVE_INFINITY;

    return [
      {
        channel: "control",
        type: "ready",
        tick: this.simulation.tick,
        hash: this.simulation.hash()
      },
      this.snapshotMessage(),
      this.statsMessage()
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
    const buffer = simulation.snapshot();
    return [{ channel: "control", type: "saved", slotId, tick: simulation.tick, buffer }];
  }

  private load(slotId: string, buffer?: ArrayBuffer): WorkerMessage[] {
    if (buffer === undefined) return [this.error("Load command requires a snapshot buffer.")];
    this.simulation = StageOneSimulation.fromSnapshot(buffer);
    this.tickCredit = 0;
    this.resetInstrumentation();
    return [
      {
        channel: "control",
        type: "loaded",
        slotId,
        tick: this.simulation.tick,
        hash: this.simulation.hash()
      },
      this.snapshotMessage(),
      this.statsMessage()
    ];
  }

  private periodicMessages(_ticksAdvanced: number, elapsedMs: number): WorkerMessage[] {
    const messages: WorkerMessage[] = [];
    const now = this.nowMs();
    if (this.simulation !== undefined && now - this.lastSnapshotMs >= SNAPSHOT_INTERVAL_MS - 0.5) {
      messages.push(this.snapshotMessage());
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
      counters:
        summary?.counters ??
        ({
          systems: simulation.world.systems.length,
          factions: simulation.world.factions.length,
          ships: simulation.world.ships.length,
          buildings: simulation.world.buildings.length
        } satisfies EntityCounters)
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

  private requireSimulation(): StageOneSimulation {
    if (this.simulation === undefined) throw new Error("Simulation is not initialized.");
    return this.simulation;
  }

  private error(message: string): WorkerMessage {
    return { channel: "control", type: "error", message };
  }
}
