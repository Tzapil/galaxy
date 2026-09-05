import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
export type SystemColumn = "x" | "y" | "region" | "owner" | "firstBody" | "bodyCount" | "firstGate" | "gateCount";
export declare class Systems {
    readonly arena: SoAArena<SystemColumn>;
    x: Float64Array;
    y: Float64Array;
    region: Uint16Array;
    owner: Int32Array;
    firstBody: Int32Array;
    bodyCount: Uint32Array;
    firstGate: Int32Array;
    gateCount: Uint32Array;
    private bodyTail;
    private gateTail;
    constructor(arena: SoAArena<SystemColumn>);
    static create(initialCapacity?: number): Systems;
    static fromSnapshot(snapshot: ArenaSnapshot): Systems;
    get length(): number;
    add(x: number, y: number, region: number, owner: number): number;
    attachBody(system: number, body: number, bodyNextInSystem: Int32Array): void;
    attachGate(system: number, gate: number, gateNextInSystem: Int32Array): void;
    rebuildBodyTails(bodyNextInSystem: Int32Array): void;
    rebuildGateTails(gateNextInSystem: Int32Array): void;
    private ensureAuxCapacity;
    private refreshColumns;
}
//# sourceMappingURL=systems.d.ts.map