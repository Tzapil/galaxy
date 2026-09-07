import type { Rng } from "../rng.js";
import type { GalaxyEdge, GalaxyPoint } from "./types.js";
export interface PrunedGateGraph {
    readonly edges: readonly GalaxyEdge[];
    readonly degrees: Uint16Array;
    readonly averageDegree: number;
    readonly maxGateLength: number;
}
export interface PruneGateOptions {
    readonly avgGateDegree: number;
    readonly gateDegreeVariance: number;
    readonly maxGateLength: number | undefined;
}
export interface GraphAdjacency {
    readonly offsets: Uint32Array;
    readonly targets: Uint32Array;
}
export declare function pruneGateGraph(points: readonly GalaxyPoint[], candidateEdges: readonly GalaxyEdge[], options: PruneGateOptions, rng: Rng): PrunedGateGraph;
export declare function degreesFor(systemCount: number, edges: readonly GalaxyEdge[]): Uint16Array;
export declare function connectedComponentCount(systemCount: number, edges: readonly GalaxyEdge[], onlyMarked?: Uint8Array): number;
export declare function buildAdjacency(systemCount: number, edges: readonly GalaxyEdge[]): GraphAdjacency;
export declare function shortestJumpDistances(systemCount: number, edges: readonly GalaxyEdge[], source: number, maxJumps?: number): Uint16Array;
export declare function shortestJumpDistancesWithAdjacency(systemCount: number, adjacency: GraphAdjacency, source: number, maxJumps?: number): Uint16Array;
export declare function multiSourceJumpDistances(systemCount: number, edges: readonly GalaxyEdge[], sources: readonly number[]): Uint16Array;
export declare function averageEdgeLength(edges: readonly GalaxyEdge[]): number;
//# sourceMappingURL=prune.d.ts.map