import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { ResourceAmount, StageOneData } from "../stage-one/data.js";
export declare class Stockpiles {
    readonly arena: SoAArena<string>;
    private readonly data;
    readonly amountColumns: Float64Array[];
    readonly capacityColumns: Float64Array[];
    constructor(arena: SoAArena<string>, data: StageOneData);
    static create(data: StageOneData, initialCapacity?: number): Stockpiles;
    static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): Stockpiles;
    get length(): number;
    add(): number;
    get(row: number, resource: number): number;
    capacity(row: number, resource: number): number;
    set(row: number, resource: number, value: number): void;
    addClamped(row: number, resource: number, amount: number): number;
    remove(row: number, resource: number, amount: number): boolean;
    removeAvailable(row: number, resource: number, amount: number): number;
    hasAtLeast(row: number, resource: number, amount: number): boolean;
    canFit(row: number, resource: number, amount: number): boolean;
    addCapacity(row: number, amount: number): void;
    setCapacity(row: number, resource: number, capacity: number): void;
    canReserveAll(row: number, bag: readonly ResourceAmount[]): number;
    canFitAll(row: number, bag: readonly ResourceAmount[]): number;
    private refreshColumns;
}
//# sourceMappingURL=stockpiles.d.ts.map