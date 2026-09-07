import { type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import type { NormalizedGalaxyParams } from "./params.js";
import type { GalaxyEdge } from "./types.js";
export type MapValidationCode = "graphDisconnected" | "startResourceAccess" | "startDistance" | "rareResourceClusters";
export interface MapValidationViolation {
    readonly code: MapValidationCode;
    readonly message: string;
    readonly subject: string;
    readonly expected: number;
    readonly actual: number;
}
export interface MapValidationResult {
    readonly ok: boolean;
    readonly violations: readonly MapValidationViolation[];
}
export declare function validateGalaxyMap(data: StageOneData, world: StageOneWorld, edges: readonly GalaxyEdge[], params: NormalizedGalaxyParams): MapValidationResult;
export declare function systemResourcePresence(data: StageOneData, world: StageOneWorld): readonly Uint8Array[];
export declare function resourceByIdOrNegative(data: StageOneData, id: string): number;
//# sourceMappingURL=validate-map.d.ts.map