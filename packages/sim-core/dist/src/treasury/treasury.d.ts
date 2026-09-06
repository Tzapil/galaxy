import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export declare const TAX_PER_POP_PER_DAY = 0.12;
export declare const CIVILIAN_UPKEEP_PER_DAY = 2.5;
export declare const SUPPORT_UPKEEP_PER_DAY = 2.5;
export declare const WARSHIP_UPKEEP_PER_DAY = 14;
export declare const TREASURY_DEBT_FLOOR = -200;
export interface TreasuryStepResult {
    readonly taxIncome: number;
    readonly upkeep: number;
    readonly disbandedShips: number;
}
export declare function applyDailyTreasury(_data: StageOneData, world: StageOneWorld, tick: number): TreasuryStepResult;
export declare function fleetUpkeep(world: StageOneWorld, faction: number): number;
export declare function upkeepForRole(role: number): number;
//# sourceMappingURL=treasury.d.ts.map