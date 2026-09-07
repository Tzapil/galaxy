import { SoAArena } from "../soa/arena.js";
export class Regions {
    arena;
    centerX;
    centerY;
    firstSystem;
    systemCount;
    constructor(arena) {
        this.arena = arena;
        this.centerX = new Float64Array(0);
        this.centerY = new Float64Array(0);
        this.firstSystem = new Uint32Array(0);
        this.systemCount = new Uint32Array(0);
        this.refreshColumns();
    }
    static create(initialCapacity = 8) {
        return new Regions(new SoAArena("regions", [
            { name: "centerX", kind: "f64" },
            { name: "centerY", kind: "f64" },
            { name: "firstSystem", kind: "u32" },
            { name: "systemCount", kind: "u32" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Regions(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    add(centerX, centerY, firstSystem, systemCount) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.centerX[row] = centerX;
        this.centerY[row] = centerY;
        this.firstSystem[row] = firstSystem;
        this.systemCount[row] = systemCount;
        return row;
    }
    refreshColumns() {
        this.centerX = this.arena.column("centerX");
        this.centerY = this.arena.column("centerY");
        this.firstSystem = this.arena.column("firstSystem");
        this.systemCount = this.arena.column("systemCount");
    }
}
export class CapitalDistances {
    arena;
    jumps;
    constructor(arena) {
        this.arena = arena;
        this.jumps = new Uint16Array(0);
        this.refreshColumns();
    }
    static create(initialCapacity = 32) {
        return new CapitalDistances(new SoAArena("capital_distances", [{ name: "jumps", kind: "u16" }], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new CapitalDistances(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    setDistance(system, jumps) {
        while (this.arena.length <= system) {
            const previousCapacity = this.arena.capacity;
            this.arena.addRow();
            if (this.arena.capacity !== previousCapacity)
                this.refreshColumns();
        }
        this.jumps[system] = Math.max(0, Math.min(0xffff, Math.trunc(jumps)));
    }
    replace(values) {
        while (this.arena.length < values.length) {
            const previousCapacity = this.arena.capacity;
            this.arena.addRow();
            if (this.arena.capacity !== previousCapacity)
                this.refreshColumns();
        }
        for (let i = 0; i < values.length; i += 1)
            this.jumps[i] = values[i] ?? 0xffff;
    }
    refreshColumns() {
        this.jumps = this.arena.column("jumps");
    }
}
//# sourceMappingURL=regions.js.map