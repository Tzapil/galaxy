import type { ResourceAmount, StageOneBatchRecipe, StageOneContinuousProcess, StageOneResource, StageOneSink } from "../stage-one/data.js";
export declare const LABOR_VALUE = 0.5;
export declare const ENERGY_SOLAR_SEED_VALUE: number;
export declare const enum EconProducerKind {
    Batch = 1,
    Continuous = 2
}
export declare const enum EconConsumerKind {
    Batch = 1,
    Continuous = 2,
    Population = 3,
    Sink = 4
}
export interface EconGraph {
    readonly producedByStart: Int32Array;
    readonly producedByCount: Uint16Array;
    readonly producedByRecipe: Int32Array;
    readonly producedByKind: Uint8Array;
    readonly consumedByStart: Int32Array;
    readonly consumedByCount: Uint16Array;
    readonly consumedByRecipe: Int32Array;
    readonly consumedByKind: Uint8Array;
    readonly chainDepth: Uint16Array;
    readonly sinkConsumes: Uint8Array;
    readonly materialCycleCount: number;
    readonly energyCycleCount: number;
    readonly energyCostShareMin: number;
}
export interface EconGraphInput {
    readonly resources: readonly StageOneResource[];
    readonly batchRecipes: readonly StageOneBatchRecipe[];
    readonly continuous: readonly StageOneContinuousProcess[];
    readonly sinks: readonly StageOneSink[];
    readonly populationNeeds: {
        readonly perThousandPopPerDay: Float64Array;
    };
    readonly energyResource: number;
}
export declare function buildEconGraph(input: EconGraphInput, baseValue: Float64Array): EconGraph;
export declare function computeBaseValues(input: EconGraphInput): Float64Array;
export declare function recipeUnitCost(inputs: readonly ResourceAmount[], outputs: readonly ResourceAmount[], outputResource: number, workers: number, durationTicks: number, values: Float64Array): number;
export declare function explodeToRaw(input: EconGraphInput, values: Float64Array, resource: number, amount: number, out: Float64Array): void;
//# sourceMappingURL=graph.d.ts.map