import { type PlannedConstruction } from "../../build/capital-demand.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
import type { MrpTarget } from "./explode.js";
export interface FactionDemandSources {
    readonly recipeDemandPerDay: Float64Array;
    readonly populationDemandPerDay: Float64Array;
    readonly capitalDemandPerDay: Float64Array;
    readonly fleetDemandPerDay: Float64Array;
    readonly targets: readonly MrpTarget[];
}
export declare function collectFactionDemandSources(data: StageOneData, world: StageOneWorld, faction: number, planned?: readonly PlannedConstruction[]): FactionDemandSources;
export declare function calculateFleetDemandPerDay(data: StageOneData, world: StageOneWorld, faction: number): Float64Array;
export declare function demandByColonyShare(world: StageOneWorld, faction: number, totalDemandPerDay: Float64Array): Float64Array[];
//# sourceMappingURL=demand-sources.d.ts.map