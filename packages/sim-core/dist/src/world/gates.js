import { SoAArena } from "../soa/arena.js";
export class Gates {
    arena;
    from;
    to;
    travelTicks;
    blocked;
    nextInSystem;
    constructor(arena) {
        this.arena = arena;
        this.from = new Uint32Array(0);
        this.to = new Uint32Array(0);
        this.travelTicks = new Uint16Array(0);
        this.blocked = new Uint8Array(0);
        this.nextInSystem = new Int32Array(0);
        this.refreshColumns();
    }
    static create(initialCapacity = 64) {
        return new Gates(new SoAArena("gates", [
            { name: "from", kind: "u32" },
            { name: "to", kind: "u32" },
            { name: "travelTicks", kind: "u16" },
            { name: "blocked", kind: "u8" },
            { name: "nextInSystem", kind: "i32" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Gates(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    addDirected(systems, from, to, travelTicks) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.from[row] = from;
        this.to[row] = to;
        this.travelTicks[row] = travelTicks;
        this.blocked[row] = 0;
        this.nextInSystem[row] = -1;
        systems.attachGate(from, row, this.nextInSystem);
        return row;
    }
    addUndirected(systems, a, b, travelTicks) {
        this.addDirected(systems, a, b, travelTicks);
        this.addDirected(systems, b, a, travelTicks);
    }
    refreshColumns() {
        this.from = this.arena.column("from");
        this.to = this.arena.column("to");
        this.travelTicks = this.arena.column("travelTicks");
        this.blocked = this.arena.column("blocked");
        this.nextInSystem = this.arena.column("nextInSystem");
    }
}
//# sourceMappingURL=gates.js.map