import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
export declare const enum ShipRole {
    Hauler = 1,
    Colonizer = 2
}
export declare const enum ShipState {
    Idle = 0,
    InTransit = 1
}
export type ShipColumn = "faction" | "role" | "state" | "currentSystem" | "fromSystem" | "toSystem" | "sourceBody" | "targetBody" | "departTick" | "arriveTick" | "cargoResource" | "cargoAmount" | "cargoCapacity" | "fuelTank" | "fuelCapacity" | "fuelPerJump" | "stockpile";
export declare class Ships {
    readonly arena: SoAArena<ShipColumn>;
    faction: Uint16Array;
    role: Uint8Array;
    state: Uint8Array;
    currentSystem: Uint32Array;
    fromSystem: Uint32Array;
    toSystem: Uint32Array;
    sourceBody: Int32Array;
    targetBody: Int32Array;
    departTick: Float64Array;
    arriveTick: Float64Array;
    cargoResource: Int32Array;
    cargoAmount: Float64Array;
    cargoCapacity: Float64Array;
    fuelTank: Float64Array;
    fuelCapacity: Float64Array;
    fuelPerJump: Float64Array;
    stockpile: Uint32Array;
    constructor(arena: SoAArena<ShipColumn>);
    static create(initialCapacity?: number): Ships;
    static fromSnapshot(snapshot: ArenaSnapshot): Ships;
    get length(): number;
    addHauler(faction: number, currentSystem: number, stockpile: number, cargoCapacity: number, fuelCapacity: number, fuelPerJump: number): number;
    private refreshColumns;
}
//# sourceMappingURL=ships.d.ts.map