import { type EntityCounters, type StageOneMetrics } from "@galaxy-sim/sim-core";
interface BenchOptions {
    readonly seeds: number;
    readonly years: number;
    readonly out: string | undefined;
}
interface WorkerResult {
    readonly seed: number;
    readonly finalHash: string;
    readonly ticks: number;
    readonly counters: EntityCounters;
    readonly metrics: StageOneMetrics;
    readonly elapsedMs: number;
}
export declare function runBench(options: BenchOptions): Promise<readonly WorkerResult[]>;
export {};
//# sourceMappingURL=bench.d.ts.map