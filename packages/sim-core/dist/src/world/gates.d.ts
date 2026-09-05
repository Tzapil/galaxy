import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { Systems } from "./systems.js";
export type GateColumn = "from" | "to" | "travelTicks" | "blocked" | "nextInSystem";
export declare class Gates {
    readonly arena: SoAArena<GateColumn>;
    from: Uint32Array;
    to: Uint32Array;
    travelTicks: Uint16Array;
    blocked: Uint8Array;
    nextInSystem: Int32Array;
    constructor(arena: SoAArena<GateColumn>);
    static create(initialCapacity?: number): Gates;
    static fromSnapshot(snapshot: ArenaSnapshot): Gates;
    get length(): number;
    addDirected(systems: Systems, from: number, to: number, travelTicks: number): number;
    addUndirected(systems: Systems, a: number, b: number, travelTicks: number): void;
    private refreshColumns;
}
//# sourceMappingURL=gates.d.ts.map