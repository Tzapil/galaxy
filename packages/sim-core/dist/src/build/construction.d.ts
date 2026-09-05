import { type PlacementResult } from "../econ/placement.js";
import type { EventQueue } from "../events/queue.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface ConstructionResult {
    readonly ok: boolean;
    readonly building: number;
    readonly placement?: PlacementResult["reason"];
    readonly waitingResource: number;
}
export declare function startBuildingConstruction(data: StageOneData, world: StageOneWorld, queue: EventQueue, body: number, buildingType: number, tick: number): ConstructionResult;
export declare function advanceWaitingConstructions(data: StageOneData, world: StageOneWorld, queue: EventQueue, tick: number): number;
export declare function completeConstruction(data: StageOneData, world: StageOneWorld, queue: EventQueue, building: number, tick: number): void;
//# sourceMappingURL=construction.d.ts.map