import { type AppliedStartPackage } from "../bootstrap/start-package.js";
import type { Rng } from "../rng.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import type { NormalizedGalaxyParams } from "./params.js";
import { type GraphAdjacency } from "./prune.js";
import type { GalaxyEdge } from "./types.js";
export interface FactionStartSelection {
    readonly starts: readonly number[];
    readonly requiredResources: readonly number[];
}
export declare function chooseFactionStarts(data: StageOneData, systemResources: readonly Uint8Array[], edges: readonly GalaxyEdge[], params: NormalizedGalaxyParams, rng: Rng): FactionStartSelection;
export declare function applyFactionStarts(data: StageOneData, world: StageOneWorld, starts: readonly number[], edges: readonly GalaxyEdge[]): readonly AppliedStartPackage[];
export declare function refreshWorldCapitalDistances(world: StageOneWorld, edges: readonly GalaxyEdge[]): void;
export declare function startHasResourcesWithinJumps(systemResources: readonly Uint8Array[], adjacency: GraphAdjacency, start: number, radius: number, requiredResources: readonly number[]): boolean;
//# sourceMappingURL=faction-starts.d.ts.map