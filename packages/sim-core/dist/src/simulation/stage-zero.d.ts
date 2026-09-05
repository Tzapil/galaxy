import { type Instrumentation } from "../instrument.js";
import type { SnapshotState } from "../snapshot/types.js";
export interface StageZeroRunReport {
    readonly ticks: number;
    readonly finalHash: string;
    readonly intermediateHashes: readonly HashCheckpoint[];
    readonly counters: {
        readonly systems: number;
        readonly factions: number;
        readonly ships: number;
        readonly buildings: number;
    };
}
export interface HashCheckpoint {
    readonly tick: number;
    readonly hash: string;
}
export declare class StageZeroSimulation {
    private readonly rootRng;
    private readonly eventRng;
    private readonly queue;
    private readonly probes;
    tick: number;
    private readonly eventBatch;
    private constructor();
    static create(seed: number): StageZeroSimulation;
    static fromSnapshot(buffer: ArrayBuffer): StageZeroSimulation;
    step(instrumentation?: Instrumentation): void;
    run(ticks: number, checkpointEvery?: number, instrumentation?: Instrumentation): StageZeroRunReport;
    snapshot(): ArrayBuffer;
    hash(): string;
    snapshotState(): SnapshotState;
    private applyContinuousTick;
    private applyEvents;
}
//# sourceMappingURL=stage-zero.d.ts.map