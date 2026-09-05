import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { Bodies } from "./bodies.js";
export type FactionColumn = "capitalSystem" | "capitalBody" | "treasury" | "firstColony" | "colonyCount" | "characterExpansion" | "characterIndustry";
export declare class Factions {
    readonly arena: SoAArena<FactionColumn>;
    capitalSystem: Uint32Array;
    capitalBody: Uint32Array;
    treasury: Float64Array;
    firstColony: Int32Array;
    colonyCount: Uint32Array;
    characterExpansion: Float64Array;
    characterIndustry: Float64Array;
    private colonyTail;
    private readonly labels;
    constructor(arena: SoAArena<FactionColumn>, labels?: readonly string[]);
    static create(initialCapacity?: number): Factions;
    static fromSnapshot(snapshot: ArenaSnapshot): Factions;
    get length(): number;
    label(faction: number): string;
    add(label: string, capitalSystem: number, capitalBody: number, treasury: number, expansion: number, industry: number): number;
    attachColony(faction: number, body: number, bodies: Bodies): void;
    rebuildColonyTails(bodies: Bodies): void;
    private ensureAuxCapacity;
    private refreshColumns;
}
//# sourceMappingURL=factions.d.ts.map