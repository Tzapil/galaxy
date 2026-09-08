import type { StageOneBatchRecipe, StageOneData } from "../../stage-one/data.js";
export interface MrpResourceTarget {
    readonly kind: "resource";
    readonly resource: number;
    readonly amountPerDay: number;
}
export interface MrpHullTarget {
    readonly kind: "hull";
    readonly hull: number;
    readonly count: number;
    readonly horizonDays: number;
}
export type MrpTarget = MrpResourceTarget | MrpHullTarget;
export interface MrpTraceStep {
    readonly resource: number;
    readonly depth: number;
    readonly amountPerDay: number;
}
export interface MrpExplosion {
    readonly requiredPerDay: Float64Array;
    readonly directPerDay: Float64Array;
    readonly trace: readonly MrpTraceStep[];
    readonly operations: number;
    readonly maxDepth: number;
}
export interface MrpExplosionOptions {
    readonly maxDepth?: number;
}
export declare function explodeDemand(data: StageOneData, targets: readonly MrpTarget[], options?: MrpExplosionOptions): MrpExplosion;
export declare function chooseProducer(data: StageOneData, resource: number): StageOneBatchRecipe | undefined;
//# sourceMappingURL=explode.d.ts.map