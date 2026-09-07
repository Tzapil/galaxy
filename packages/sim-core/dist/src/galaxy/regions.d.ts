import type { Rng } from "../rng.js";
import type { GalaxyEdge, GalaxyPoint, GalaxyRegionSummary } from "./types.js";
export interface RegionLayout {
    readonly regionOfSystem: Uint16Array;
    readonly regions: readonly GalaxyRegionSummary[];
}
export declare function clusterRegions(points: readonly GalaxyPoint[], regionCount: number, rng: Rng): RegionLayout;
export declare function computeCapitalJumpDistances(systemCount: number, edges: readonly GalaxyEdge[], capitalSystems: readonly number[]): Uint16Array;
export declare function interRegionPassageCounts(edges: readonly GalaxyEdge[], regionOfSystem: Uint16Array): Map<string, number>;
export declare function regionPairKey(a: number, b: number): string;
export declare function sortedEdgesByRegionPair(edges: readonly GalaxyEdge[], regionOfSystem: Uint16Array): Map<string, GalaxyEdge[]>;
//# sourceMappingURL=regions.d.ts.map