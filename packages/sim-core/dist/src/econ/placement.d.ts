import { type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export type PlacementFailureReason = "noFreeSlots" | "wrongBodyType" | "missingDeposit" | "noPowerSource";
export interface PlacementResult {
    readonly ok: boolean;
    readonly reason?: PlacementFailureReason;
}
export declare function validatePlacement(data: StageOneData, world: StageOneWorld, body: number, buildingType: number): PlacementResult;
export declare function hasPowerSource(data: StageOneData, world: StageOneWorld, body: number, buildingTypeInPlan?: number): boolean;
//# sourceMappingURL=placement.d.ts.map