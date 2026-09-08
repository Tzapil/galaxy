import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
export interface FactionSupply {
    readonly productionPerDay: Float64Array;
    readonly stockpile: Float64Array;
}
export declare function calculateFactionSupplyRates(data: StageOneData, world: StageOneWorld, faction: number): FactionSupply;
//# sourceMappingURL=supply.d.ts.map