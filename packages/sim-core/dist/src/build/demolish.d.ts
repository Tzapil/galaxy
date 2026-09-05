import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export declare const DEMOLITION_REFUND_RATE = 0.35;
export declare const DEMOLITION_BUFFER_YEARS = 5;
export interface DemolitionCheck {
    readonly ok: boolean;
    readonly minCoverageAfter: number;
    readonly minBufferYears: number;
}
export declare function canDemolishByFlow(data: StageOneData, world: StageOneWorld, building: number): DemolitionCheck;
export declare function demolishBuilding(data: StageOneData, world: StageOneWorld, building: number, tick: number): boolean;
export declare function dailyProductionOnBody(data: StageOneData, world: StageOneWorld, body: number): Float64Array;
export declare function dailyDemandOnBody(data: StageOneData, world: StageOneWorld, body: number): Float64Array;
//# sourceMappingURL=demolish.d.ts.map