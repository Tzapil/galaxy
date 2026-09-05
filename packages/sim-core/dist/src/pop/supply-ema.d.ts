import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
export declare const SUPPLY_EMA_DAYS = 30;
export declare class SupplyEma {
    readonly arena: SoAArena<string>;
    private readonly data;
    readonly emaColumns: Float64Array[];
    readonly lastColumns: Float64Array[];
    constructor(arena: SoAArena<string>, data: StageOneData);
    static create(data: StageOneData, initialCapacity?: number): SupplyEma;
    static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): SupplyEma;
    addBody(): number;
    update(body: number, resource: number, satisfaction: number): void;
    get(body: number, resource: number): number;
    minVital(data: StageOneData, body: number): number;
    private refreshColumns;
}
//# sourceMappingURL=supply-ema.d.ts.map