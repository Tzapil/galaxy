import type { StageOneData, StageOnePersonalityWeights } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export type UtilityAxis = keyof StageOnePersonalityWeights;
export interface UtilityOption<T> {
    readonly value: T;
    readonly baseScore: number;
    readonly axis: UtilityAxis;
    readonly tieBreak: number;
}
export interface UtilityChoice<T> {
    readonly value: T;
    readonly score: number;
    readonly axis: UtilityAxis;
}
export declare function personalityWeightsForFaction(data: StageOneData, world: StageOneWorld, faction: number): StageOnePersonalityWeights;
export declare function chooseUtilityOption<T>(weights: StageOnePersonalityWeights, options: readonly UtilityOption<T>[]): UtilityChoice<T> | undefined;
//# sourceMappingURL=utility.d.ts.map