import { type DemolitionCheck } from "../../build/demolish.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
export declare const enum NeedBranch {
    Vital = 1,
    Comfort = 2,
    Industrial = 3
}
export declare function guardVitalVsComfort(data: StageOneData, resource: number): NeedBranch;
export declare function guardHousingCap(data: StageOneData, world: StageOneWorld, body: number, plannedHousing?: number): boolean;
export declare function guardStockHorizon(world: StageOneWorld, faction: number, resource: number, demandPerDay: number, horizonDays?: number): boolean;
export declare function guardDemolishByFlow(data: StageOneData, world: StageOneWorld, building: number): DemolitionCheck;
export declare function guardPowerAvailable(data: StageOneData, world: StageOneWorld, body: number, buildingType: number, plannedPower?: boolean): boolean;
export declare function guardAlternativeProducer(data: StageOneData, world: StageOneWorld, faction: number, resource: number, preferredBuildingType: number): number;
//# sourceMappingURL=guards.d.ts.map