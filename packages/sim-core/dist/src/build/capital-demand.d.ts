import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface PlannedConstruction {
    readonly buildingType: number;
    readonly count: number;
}
export declare function calculateCapitalDemand(data: StageOneData, world: StageOneWorld, planned?: readonly PlannedConstruction[]): Float64Array;
//# sourceMappingURL=capital-demand.d.ts.map