import { type StageOneRunReport, type StageTwoRunReport, type StageZeroRunReport } from "@galaxy-sim/sim-core";
interface HeadlessOptions {
    readonly stage: 0 | 1 | 2;
    readonly seed: number;
    readonly ticks: number;
    readonly snapshotEvery: number;
    readonly reportPath: string | undefined;
}
export declare function runHeadless(options: HeadlessOptions): Promise<StageZeroRunReport | StageOneRunReport | StageTwoRunReport>;
export {};
//# sourceMappingURL=headless.d.ts.map