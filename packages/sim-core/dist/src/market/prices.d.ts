import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
import type { Buildings } from "../econ/buildings.js";
import type { Bodies } from "../world/bodies.js";
import type { Stockpiles } from "../world/stockpiles.js";
export declare class MarketPrices {
    readonly arena: SoAArena<string>;
    private readonly data;
    readonly priceColumns: Float64Array[];
    readonly demandColumns: Float64Array[];
    constructor(arena: SoAArena<string>, data: StageOneData);
    static create(data: StageOneData, initialCapacity?: number): MarketPrices;
    static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): MarketPrices;
    addPoint(): number;
    recalculate(data: StageOneData, bodies: Bodies, stockpiles: Stockpiles, buildings: Buildings): void;
    price(body: number, resource: number): number;
    demand(body: number, resource: number): number;
    spreadForResource(bodies: Bodies, resource: number): number;
    private refreshColumns;
}
export declare function estimateDailyDemand(data: StageOneData, bodies: Bodies, buildings: Buildings, body: number, resource: number): number;
//# sourceMappingURL=prices.d.ts.map