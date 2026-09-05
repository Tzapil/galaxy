import type { StageOneData } from "../stage-one/data.js";
import type { Bodies } from "../world/bodies.js";
import type { Stockpiles } from "../world/stockpiles.js";
import type { SupplyEma } from "./supply-ema.js";
export declare const GROWTH_R = 0.00012;
export declare const MAX_POPULATION_PER_BODY = 2500;
export declare function updatePopulationGrowth(data: StageOneData, bodies: Bodies, stockpiles: Stockpiles, supply: SupplyEma): void;
export declare function populationCapacity(bodies: Bodies, body: number): number;
export declare function unrestFromSupply(vital: number): number;
//# sourceMappingURL=growth.d.ts.map