import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
export type RegionColumn = "centerX" | "centerY" | "firstSystem" | "systemCount";
export declare class Regions {
    readonly arena: SoAArena<RegionColumn>;
    centerX: Float64Array;
    centerY: Float64Array;
    firstSystem: Uint32Array;
    systemCount: Uint32Array;
    constructor(arena: SoAArena<RegionColumn>);
    static create(initialCapacity?: number): Regions;
    static fromSnapshot(snapshot: ArenaSnapshot): Regions;
    get length(): number;
    add(centerX: number, centerY: number, firstSystem: number, systemCount: number): number;
    private refreshColumns;
}
export type CapitalDistanceColumn = "jumps";
export declare class CapitalDistances {
    readonly arena: SoAArena<CapitalDistanceColumn>;
    jumps: Uint16Array;
    constructor(arena: SoAArena<CapitalDistanceColumn>);
    static create(initialCapacity?: number): CapitalDistances;
    static fromSnapshot(snapshot: ArenaSnapshot): CapitalDistances;
    get length(): number;
    setDistance(system: number, jumps: number): void;
    replace(values: Uint16Array): void;
    private refreshColumns;
}
//# sourceMappingURL=regions.d.ts.map