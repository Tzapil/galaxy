import type { WorkerCommand, WorkerMessage } from "./protocol.js";
export interface StageOneWorkerRuntimeOptions {
    readonly nowMs?: () => number;
}
export declare class StageOneWorkerRuntime {
    private readonly nowMs;
    private simulation;
    private instrumentation;
    private instrumentationStartMs;
    private targetSpeed;
    private lastNonZeroSpeed;
    private running;
    private tickCredit;
    private subscribedSlices;
    private lastSnapshotMs;
    private lastStatsMs;
    private lastActualSpeed;
    private lastTickMs;
    constructor(options?: StageOneWorkerRuntimeOptions);
    handle(command: WorkerCommand): WorkerMessage[];
    advanceElapsed(elapsedMs: number, maxTicks?: number): WorkerMessage[];
    advanceTicks(ticks: number): void;
    get tick(): number;
    hash(): string;
    fullSnapshot(): ArrayBuffer;
    private init;
    private setSpeed;
    private pause;
    private resume;
    private subscribe;
    private save;
    private load;
    private periodicMessages;
    private snapshotMessage;
    private statsMessage;
    private statsFromSummary;
    private resetInstrumentation;
    private requireSimulation;
    private error;
}
//# sourceMappingURL=runtime.d.ts.map