import type { Rng } from "../rng.js";
import { type StageOneData } from "../stage-one/data.js";
import type { NormalizedGalaxyParams } from "./params.js";
import type { GalaxyEdge, GalaxyPoint } from "./types.js";
export declare function createSystemResourceMap(data: StageOneData, points: readonly GalaxyPoint[], params: NormalizedGalaxyParams, rng: Rng): readonly Uint8Array[];
export declare function rareResourceIndices(data: StageOneData): readonly number[];
export declare function tierOneStartResourceIndices(data: StageOneData): readonly number[];
export declare function rareResourceClusterCount(systemResources: readonly Uint8Array[], edges: readonly GalaxyEdge[], resource: number): number;
export declare function neighborResourceCorrelation(systemResources: readonly Uint8Array[], edges: readonly GalaxyEdge[], resource: number): number;
//# sourceMappingURL=resources-gen.d.ts.map