import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { Systems } from "./systems.js";
export declare const enum BodyType {
    Planet = 1,
    AsteroidBelt = 2,
    GasGiant = 3,
    Station = 4,
    Comet = 5
}
export type BodyColumn = "system" | "type" | "size" | "habitability" | "featureMask" | "slots" | "usedSlots" | "owner" | "stockpile" | "population" | "development" | "housing" | "unrest" | "firstDeposit" | "depositCount" | "firstBuilding" | "buildingCount" | "nextInSystem" | "nextInFaction";
export type DepositColumn = "body" | "resource" | "yield";
export declare class Bodies {
    readonly arena: SoAArena<BodyColumn>;
    readonly deposits: Deposits;
    system: Uint32Array;
    type: Uint8Array;
    size: Float64Array;
    habitability: Float64Array;
    featureMask: Uint32Array;
    slots: Uint16Array;
    usedSlots: Uint16Array;
    owner: Int32Array;
    stockpile: Uint32Array;
    population: Float64Array;
    development: Float64Array;
    housing: Uint16Array;
    unrest: Float64Array;
    firstDeposit: Int32Array;
    depositCount: Uint16Array;
    firstBuilding: Int32Array;
    buildingCount: Uint32Array;
    nextInSystem: Int32Array;
    nextInFaction: Int32Array;
    private buildingTail;
    private depositTail;
    constructor(arena: SoAArena<BodyColumn>, deposits: Deposits);
    static create(initialCapacity?: number): Bodies;
    static fromSnapshots(bodySnapshot: ArenaSnapshot, depositSnapshot: ArenaSnapshot): Bodies;
    get length(): number;
    add(systems: Systems, system: number, type: BodyType, size: number, habitability: number, slots: number, owner: number, stockpile: number, population: number, featureMask?: number): number;
    addDeposit(body: number, resource: number, yieldValue: number): number;
    attachBuilding(body: number, building: number, buildingNextInBody: Int32Array): void;
    rebuildBuildingTails(buildingNextInBody: Int32Array): void;
    hasDeposit(body: number, resource: number): boolean;
    hasFeatureMask(body: number, mask: number): boolean;
    private ensureAuxCapacity;
    private rebuildDepositTails;
    private refreshColumns;
}
export declare class Deposits {
    readonly arena: SoAArena<DepositColumn>;
    body: Uint32Array;
    resource: Uint16Array;
    yield: Float64Array;
    constructor(arena: SoAArena<DepositColumn>);
    static create(initialCapacity?: number): Deposits;
    static fromSnapshot(snapshot: ArenaSnapshot): Deposits;
    get length(): number;
    add(body: number, resource: number, yieldValue: number): number;
    private refreshColumns;
}
//# sourceMappingURL=bodies.d.ts.map