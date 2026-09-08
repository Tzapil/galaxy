export const enum InstrumentSubsystem {
  Continuous = 0,
  Events = 1,
  Snapshot = 2,
  AiStrategic = 3,
  AiOperational = 4,
  AiTactical = 5,
  Total = 6
}

export const INSTRUMENT_SUBSYSTEM_COUNT = 7;

export interface EntityCounters {
  readonly systems: number;
  readonly factions: number;
  readonly ships: number;
  readonly buildings: number;
}

export interface InstrumentationOptions {
  readonly enabled: boolean;
  readonly targetTicksPerSecond: number;
  readonly historyCapacity?: number;
  readonly nowMs: () => number;
}

export interface InstrumentationSummary {
  readonly enabled: boolean;
  readonly targetTicksPerSecond: number;
  readonly actualTicksPerSecond: number;
  readonly subsystemMs: readonly number[];
  readonly tickMsHistory: readonly number[];
  readonly counters: EntityCounters;
}

export class Instrumentation {
  private readonly subsystemMs: Float64Array;
  private readonly tickHistory: Float64Array;
  private historyCursor = 0;
  private historyCount = 0;
  private totalTicks = 0;
  private counters: EntityCounters = { systems: 0, factions: 0, ships: 0, buildings: 0 };

  public constructor(private readonly options: InstrumentationOptions) {
    const historyCapacity = options.enabled ? (options.historyCapacity ?? 60_000) : 0;
    this.subsystemMs = new Float64Array(options.enabled ? INSTRUMENT_SUBSYSTEM_COUNT : 0);
    this.tickHistory = new Float64Array(historyCapacity);
  }

  public get enabled(): boolean {
    return this.options.enabled;
  }

  public begin(_subsystem: InstrumentSubsystem): number {
    if (!this.options.enabled) return 0;
    return this.options.nowMs();
  }

  public end(subsystem: InstrumentSubsystem, startedAt: number): number {
    if (!this.options.enabled) return 0;
    const duration = this.options.nowMs() - startedAt;
    this.subsystemMs[subsystem] = (this.subsystemMs[subsystem] ?? 0) + duration;
    return duration;
  }

  public recordTick(durationMs: number): void {
    if (!this.options.enabled || this.tickHistory.length === 0) return;
    this.tickHistory[this.historyCursor] = durationMs;
    this.historyCursor = (this.historyCursor + 1) % this.tickHistory.length;
    this.historyCount = Math.min(this.historyCount + 1, this.tickHistory.length);
    this.totalTicks += 1;
  }

  public setEntityCounters(counters: EntityCounters): void {
    if (!this.options.enabled) return;
    this.counters = counters;
  }

  public summary(elapsedMs: number): InstrumentationSummary {
    if (!this.options.enabled) {
      return {
        enabled: false,
        targetTicksPerSecond: this.options.targetTicksPerSecond,
        actualTicksPerSecond: 0,
        subsystemMs: [],
        tickMsHistory: [],
        counters: this.counters
      };
    }

    const history: number[] = [];
    for (let i = 0; i < this.historyCount; i += 1) {
      const index =
        (this.historyCursor - this.historyCount + i + this.tickHistory.length) %
        this.tickHistory.length;
      history.push(this.tickHistory[index] ?? 0);
    }

    return {
      enabled: true,
      targetTicksPerSecond: this.options.targetTicksPerSecond,
      actualTicksPerSecond: elapsedMs > 0 ? (this.totalTicks / elapsedMs) * 1000 : 0,
      subsystemMs: Array.from(this.subsystemMs),
      tickMsHistory: history,
      counters: this.counters
    };
  }
}
