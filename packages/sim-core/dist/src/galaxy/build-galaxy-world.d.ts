import type { StageOneData } from "../stage-one/data.js";
import { StageOneWorld } from "../world/state.js";
import { type GalaxyGenerationParams, type NormalizedGalaxyParams } from "./params.js";
import { type MapValidationResult } from "./validate-map.js";
import type { GalaxyEdge, GalaxyPoint } from "./types.js";
export interface GeneratedGalaxy {
    readonly world: StageOneWorld;
    readonly points: readonly GalaxyPoint[];
    readonly edges: readonly GalaxyEdge[];
    readonly params: NormalizedGalaxyParams;
    readonly sourceSeed: number;
    readonly generationSeed: number;
    readonly attempt: number;
    readonly minSystemDistance: number;
    readonly averageGateDegree: number;
    readonly maxGateLength: number;
    readonly validation: MapValidationResult;
}
export interface StarLayout {
    readonly points: readonly GalaxyPoint[];
    readonly params: NormalizedGalaxyParams;
    readonly minSystemDistance: number;
}
export declare class GalaxyGenerationError extends Error {
    readonly attempts: number;
    readonly reasons: readonly string[];
    constructor(message: string, attempts: number, reasons: readonly string[]);
}
export declare function generateStarLayout(seed: number, paramsInput?: GalaxyGenerationParams): StarLayout;
export declare function buildGeneratedGalaxyWorld(data: StageOneData, seed: number, paramsInput?: GalaxyGenerationParams): GeneratedGalaxy;
export declare function buildStageThreeWorld(data: StageOneData, seed: number, paramsInput?: GalaxyGenerationParams): StageOneWorld;
export declare function gateDegrees(systemCount: number, edges: readonly GalaxyEdge[]): Uint16Array;
//# sourceMappingURL=build-galaxy-world.d.ts.map