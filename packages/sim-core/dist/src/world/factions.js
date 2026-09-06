import { SoAArena } from "../soa/arena.js";
export class Factions {
    arena;
    capitalSystem;
    capitalBody;
    treasury;
    dataPhysics;
    dataEngineering;
    dataBio;
    researchedCount;
    firstColony;
    colonyCount;
    characterExpansion;
    characterIndustry;
    colonyTail;
    labels;
    constructor(arena, labels) {
        this.arena = arena;
        this.capitalSystem = new Uint32Array(0);
        this.capitalBody = new Uint32Array(0);
        this.treasury = new Float64Array(0);
        this.dataPhysics = new Float64Array(0);
        this.dataEngineering = new Float64Array(0);
        this.dataBio = new Float64Array(0);
        this.researchedCount = new Uint16Array(0);
        this.firstColony = new Int32Array(0);
        this.colonyCount = new Uint32Array(0);
        this.characterExpansion = new Float64Array(0);
        this.characterIndustry = new Float64Array(0);
        this.refreshColumns();
        this.colonyTail = new Int32Array(arena.capacity);
        this.colonyTail.fill(-1);
        this.labels = labels === undefined ? [] : labels.slice();
    }
    static create(initialCapacity = 4) {
        return new Factions(new SoAArena("factions", [
            { name: "capitalSystem", kind: "u32" },
            { name: "capitalBody", kind: "u32" },
            { name: "treasury", kind: "f64" },
            { name: "dataPhysics", kind: "f64" },
            { name: "dataEngineering", kind: "f64" },
            { name: "dataBio", kind: "f64" },
            { name: "researchedCount", kind: "u16" },
            { name: "firstColony", kind: "i32" },
            { name: "colonyCount", kind: "u32" },
            { name: "characterExpansion", kind: "f64" },
            { name: "characterIndustry", kind: "f64" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Factions(SoAArena.fromSnapshot(snapshot), [
            "Vega Compact",
            "Orion Combine"
        ]);
    }
    get length() {
        return this.arena.length;
    }
    label(faction) {
        return this.labels[faction] ?? `Faction ${faction}`;
    }
    add(label, capitalSystem, capitalBody, treasury, expansion, industry) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.ensureAuxCapacity(this.arena.capacity);
        this.labels[row] = label;
        this.capitalSystem[row] = capitalSystem;
        this.capitalBody[row] = capitalBody;
        this.treasury[row] = treasury;
        this.dataPhysics[row] = 0;
        this.dataEngineering[row] = 0;
        this.dataBio[row] = 0;
        this.researchedCount[row] = 0;
        this.firstColony[row] = -1;
        this.colonyCount[row] = 0;
        this.characterExpansion[row] = expansion;
        this.characterIndustry[row] = industry;
        this.colonyTail[row] = -1;
        return row;
    }
    attachColony(faction, body, bodies) {
        const tail = this.colonyTail[faction] ?? -1;
        if (tail < 0) {
            this.firstColony[faction] = body;
        }
        else {
            bodies.nextInFaction[tail] = body;
        }
        this.colonyTail[faction] = body;
        bodies.nextInFaction[body] = -1;
        this.colonyCount[faction] = (this.colonyCount[faction] ?? 0) + 1;
    }
    rebuildColonyTails(bodies) {
        this.ensureAuxCapacity(this.arena.capacity);
        for (let faction = 0; faction < this.length; faction += 1) {
            let current = this.firstColony[faction] ?? -1;
            let tail = -1;
            while (current >= 0) {
                tail = current;
                current = bodies.nextInFaction[current] ?? -1;
            }
            this.colonyTail[faction] = tail;
        }
    }
    ensureAuxCapacity(required) {
        if (required <= this.colonyTail.length)
            return;
        const next = new Int32Array(required);
        next.fill(-1);
        next.set(this.colonyTail);
        this.colonyTail = next;
    }
    refreshColumns() {
        this.capitalSystem = this.arena.column("capitalSystem");
        this.capitalBody = this.arena.column("capitalBody");
        this.treasury = this.arena.column("treasury");
        this.dataPhysics = this.arena.column("dataPhysics");
        this.dataEngineering = this.arena.column("dataEngineering");
        this.dataBio = this.arena.column("dataBio");
        this.researchedCount = this.arena.column("researchedCount");
        this.firstColony = this.arena.column("firstColony");
        this.colonyCount = this.arena.column("colonyCount");
        this.characterExpansion = this.arena.column("characterExpansion");
        this.characterIndustry = this.arena.column("characterIndustry");
    }
}
//# sourceMappingURL=factions.js.map