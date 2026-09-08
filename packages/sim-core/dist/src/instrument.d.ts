export declare const enum InstrumentSubsystem {
    Continuous = 0,
    Events = 1,
    Snapshot = 2,
    AiStrategic = 3,
    AiOperational = 4,
    AiTactical = 5,
    Total = 6
}
export declare const INSTRUMENT_SUBSYSTEM_COUNT = 7;
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
export declare class Instrumentation {
    private readonly options;
    private readonly subsystemMs;
    private readonly tickHistory;
    private historyCursor;
    private historyCount;
    private totalTicks;
    private counters;
    constructor(options: InstrumentationOptions);
    get enabled(): boolean;
    begin(_subsystem: InstrumentSubsystem): number;
    end(subsystem: InstrumentSubsystem, startedAt: number): number;
    recordTick(durationMs: number): void;
    setEntityCounters(counters: EntityCounters): void;
    summary(elapsedMs: number): InstrumentationSummary;
}
//# sourceMappingURL=instrument.d.ts.map