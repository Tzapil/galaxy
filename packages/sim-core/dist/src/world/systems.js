import { SoAArena } from "../soa/arena.js";
export class Systems {
    arena;
    x;
    y;
    region;
    owner;
    firstBody;
    bodyCount;
    firstGate;
    gateCount;
    bodyTail;
    gateTail;
    constructor(arena) {
        this.arena = arena;
        this.x = new Float64Array(0);
        this.y = new Float64Array(0);
        this.region = new Uint16Array(0);
        this.owner = new Int32Array(0);
        this.firstBody = new Int32Array(0);
        this.bodyCount = new Uint32Array(0);
        this.firstGate = new Int32Array(0);
        this.gateCount = new Uint32Array(0);
        this.refreshColumns();
        this.bodyTail = new Int32Array(arena.capacity);
        this.gateTail = new Int32Array(arena.capacity);
        this.bodyTail.fill(-1);
        this.gateTail.fill(-1);
    }
    static create(initialCapacity = 32) {
        return new Systems(new SoAArena("systems", [
            { name: "x", kind: "f64" },
            { name: "y", kind: "f64" },
            { name: "region", kind: "u16" },
            { name: "owner", kind: "i32" },
            { name: "firstBody", kind: "i32" },
            { name: "bodyCount", kind: "u32" },
            { name: "firstGate", kind: "i32" },
            { name: "gateCount", kind: "u32" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Systems(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    add(x, y, region, owner) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.ensureAuxCapacity(this.arena.capacity);
        this.x[row] = x;
        this.y[row] = y;
        this.region[row] = region;
        this.owner[row] = owner;
        this.firstBody[row] = -1;
        this.bodyCount[row] = 0;
        this.firstGate[row] = -1;
        this.gateCount[row] = 0;
        this.bodyTail[row] = -1;
        this.gateTail[row] = -1;
        return row;
    }
    attachBody(system, body, bodyNextInSystem) {
        const tail = this.bodyTail[system] ?? -1;
        if (tail < 0) {
            this.firstBody[system] = body;
        }
        else {
            bodyNextInSystem[tail] = body;
        }
        this.bodyTail[system] = body;
        bodyNextInSystem[body] = -1;
        this.bodyCount[system] = (this.bodyCount[system] ?? 0) + 1;
    }
    attachGate(system, gate, gateNextInSystem) {
        const tail = this.gateTail[system] ?? -1;
        if (tail < 0) {
            this.firstGate[system] = gate;
        }
        else {
            gateNextInSystem[tail] = gate;
        }
        this.gateTail[system] = gate;
        gateNextInSystem[gate] = -1;
        this.gateCount[system] = (this.gateCount[system] ?? 0) + 1;
    }
    rebuildBodyTails(bodyNextInSystem) {
        this.ensureAuxCapacity(this.arena.capacity);
        for (let system = 0; system < this.length; system += 1) {
            let current = this.firstBody[system] ?? -1;
            let tail = -1;
            while (current >= 0) {
                tail = current;
                current = bodyNextInSystem[current] ?? -1;
            }
            this.bodyTail[system] = tail;
        }
    }
    rebuildGateTails(gateNextInSystem) {
        this.ensureAuxCapacity(this.arena.capacity);
        for (let system = 0; system < this.length; system += 1) {
            let current = this.firstGate[system] ?? -1;
            let tail = -1;
            while (current >= 0) {
                tail = current;
                current = gateNextInSystem[current] ?? -1;
            }
            this.gateTail[system] = tail;
        }
    }
    ensureAuxCapacity(required) {
        if (required <= this.bodyTail.length)
            return;
        const nextBodyTail = new Int32Array(required);
        nextBodyTail.fill(-1);
        nextBodyTail.set(this.bodyTail);
        this.bodyTail = nextBodyTail;
        const nextGateTail = new Int32Array(required);
        nextGateTail.fill(-1);
        nextGateTail.set(this.gateTail);
        this.gateTail = nextGateTail;
    }
    refreshColumns() {
        this.x = this.arena.column("x");
        this.y = this.arena.column("y");
        this.region = this.arena.column("region");
        this.owner = this.arena.column("owner");
        this.firstBody = this.arena.column("firstBody");
        this.bodyCount = this.arena.column("bodyCount");
        this.firstGate = this.arena.column("firstGate");
        this.gateCount = this.arena.column("gateCount");
    }
}
//# sourceMappingURL=systems.js.map