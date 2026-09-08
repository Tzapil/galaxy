import { type EntityCounters, type StageOneMetrics, type StageTwoMetrics } from "@galaxy-sim/sim-core";
interface BenchOptions {
    readonly stage: 1 | 2 | 3;
    readonly seeds: number;
    readonly years: number;
    readonly out: string | undefined;
    readonly preset: string;
}
interface WorkerResult {
    readonly seed: number;
    readonly finalHash: string;
    readonly ticks: number;
    readonly counters: EntityCounters;
    readonly metrics: StageOneMetrics | StageTwoMetrics;
    readonly elapsedMs: number;
}
export declare function runBench(options: BenchOptions): Promise<readonly WorkerResult[]>;
export {};
//# sourceMappingURL=bench.d.ts.map