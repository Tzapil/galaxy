import { SoAArena } from "../soa/arena.js";
export var BodyType;
(function (BodyType) {
    BodyType[BodyType["Planet"] = 1] = "Planet";
    BodyType[BodyType["AsteroidBelt"] = 2] = "AsteroidBelt";
    BodyType[BodyType["GasGiant"] = 3] = "GasGiant";
    BodyType[BodyType["Station"] = 4] = "Station";
    BodyType[BodyType["Comet"] = 5] = "Comet";
})(BodyType || (BodyType = {}));
export class Bodies {
    arena;
    deposits;
    system;
    type;
    size;
    habitability;
    featureMask;
    slots;
    usedSlots;
    owner;
    stockpile;
    population;
    development;
    housing;
    unrest;
    firstDeposit;
    depositCount;
    firstBuilding;
    buildingCount;
    nextInSystem;
    nextInFaction;
    buildingTail;
    depositTail;
    constructor(arena, deposits) {
        this.arena = arena;
        this.deposits = deposits;
        this.system = new Uint32Array(0);
        this.type = new Uint8Array(0);
        this.size = new Float64Array(0);
        this.habitability = new Float64Array(0);
        this.featureMask = new Uint32Array(0);
        this.slots = new Uint16Array(0);
        this.usedSlots = new Uint16Array(0);
        this.owner = new Int32Array(0);
        this.stockpile = new Uint32Array(0);
        this.population = new Float64Array(0);
        this.development = new Float64Array(0);
        this.housing = new Uint16Array(0);
        this.unrest = new Float64Array(0);
        this.firstDeposit = new Int32Array(0);
        this.depositCount = new Uint16Array(0);
        this.firstBuilding = new Int32Array(0);
        this.buildingCount = new Uint32Array(0);
        this.nextInSystem = new Int32Array(0);
        this.nextInFaction = new Int32Array(0);
        this.refreshColumns();
        this.buildingTail = new Int32Array(arena.capacity);
        this.depositTail = new Int32Array(arena.capacity);
        this.buildingTail.fill(-1);
        this.depositTail.fill(-1);
        this.rebuildDepositTails();
    }
    static create(initialCapacity = 64) {
        return new Bodies(new SoAArena("bodies", [
            { name: "system", kind: "u32" },
            { name: "type", kind: "u8" },
            { name: "size", kind: "f64" },
            { name: "habitability", kind: "f64" },
            { name: "featureMask", kind: "u32" },
            { name: "slots", kind: "u16" },
            { name: "usedSlots", kind: "u16" },
            { name: "owner", kind: "i32" },
            { name: "stockpile", kind: "u32" },
            { name: "population", kind: "f64" },
            { name: "development", kind: "f64" },
            { name: "housing", kind: "u16" },
            { name: "unrest", kind: "f64" },
            { name: "firstDeposit", kind: "i32" },
            { name: "depositCount", kind: "u16" },
            { name: "firstBuilding", kind: "i32" },
            { name: "buildingCount", kind: "u32" },
            { name: "nextInSystem", kind: "i32" },
            { name: "nextInFaction", kind: "i32" }
        ], initialCapacity), Deposits.create(initialCapacity * 2));
    }
    static fromSnapshots(bodySnapshot, depositSnapshot) {
        return new Bodies(SoAArena.fromSnapshot(bodySnapshot), Deposits.fromSnapshot(depositSnapshot));
    }
    get length() {
        return this.arena.length;
    }
    add(systems, system, type, size, habitability, slots, owner, stockpile, population, featureMask = 0) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.ensureAuxCapacity(this.arena.capacity);
        this.system[row] = system;
        this.type[row] = type;
        this.size[row] = size;
        this.habitability[row] = habitability;
        this.featureMask[row] = featureMask;
        this.slots[row] = slots;
        this.usedSlots[row] = 0;
        this.owner[row] = owner;
        this.stockpile[row] = stockpile;
        this.population[row] = population;
        this.development[row] = 1;
        this.housing[row] = 0;
        this.unrest[row] = 0;
        this.firstDeposit[row] = -1;
        this.depositCount[row] = 0;
        this.firstBuilding[row] = -1;
        this.buildingCount[row] = 0;
        this.nextInSystem[row] = -1;
        this.nextInFaction[row] = -1;
        this.buildingTail[row] = -1;
        this.depositTail[row] = -1;
        systems.attachBody(system, row, this.nextInSystem);
        return row;
    }
    addDeposit(body, resource, yieldValue) {
        const row = this.deposits.add(body, resource, yieldValue);
        const tail = this.depositTail[body] ?? -1;
        if (tail < 0) {
            this.firstDeposit[body] = row;
        }
        this.depositTail[body] = row;
        this.depositCount[body] = (this.depositCount[body] ?? 0) + 1;
        return row;
    }
    attachBuilding(body, building, buildingNextInBody) {
        const tail = this.buildingTail[body] ?? -1;
        if (tail < 0) {
            this.firstBuilding[body] = building;
        }
        else {
            buildingNextInBody[tail] = building;
        }
        this.buildingTail[body] = building;
        buildingNextInBody[building] = -1;
        this.buildingCount[body] = (this.buildingCount[body] ?? 0) + 1;
    }
    rebuildBuildingTails(buildingNextInBody) {
        this.ensureAuxCapacity(this.arena.capacity);
        for (let body = 0; body < this.length; body += 1) {
            let current = this.firstBuilding[body] ?? -1;
            let tail = -1;
            while (current >= 0) {
                tail = current;
                current = buildingNextInBody[current] ?? -1;
            }
            this.buildingTail[body] = tail;
        }
    }
    hasDeposit(body, resource) {
        const start = this.firstDeposit[body] ?? -1;
        const count = this.depositCount[body] ?? 0;
        for (let i = 0; i < count; i += 1) {
            const row = start + i;
            if ((this.deposits.resource[row] ?? -1) === resource)
                return true;
        }
        return false;
    }
    hasFeatureMask(body, mask) {
        return mask === 0 || (((this.featureMask[body] ?? 0) & mask) === mask);
    }
    ensureAuxCapacity(required) {
        if (required <= this.buildingTail.length)
            return;
        const nextBuildingTail = new Int32Array(required);
        nextBuildingTail.fill(-1);
        nextBuildingTail.set(this.buildingTail);
        this.buildingTail = nextBuildingTail;
        const nextDepositTail = new Int32Array(required);
        nextDepositTail.fill(-1);
        nextDepositTail.set(this.depositTail);
        this.depositTail = nextDepositTail;
    }
    rebuildDepositTails() {
        this.ensureAuxCapacity(this.arena.capacity);
        for (let i = 0; i < this.length; i += 1) {
            const firstDeposit = this.firstDeposit[i] ?? -1;
            const count = this.depositCount[i] ?? 0;
            this.depositTail[i] = count > 0 ? firstDeposit + count - 1 : -1;
        }
    }
    refreshColumns() {
        this.system = this.arena.column("system");
        this.type = this.arena.column("type");
        this.size = this.arena.column("size");
        this.habitability = this.arena.column("habitability");
        this.featureMask = this.arena.column("featureMask");
        this.slots = this.arena.column("slots");
        this.usedSlots = this.arena.column("usedSlots");
        this.owner = this.arena.column("owner");
        this.stockpile = this.arena.column("stockpile");
        this.population = this.arena.column("population");
        this.development = this.arena.column("development");
        this.housing = this.arena.column("housing");
        this.unrest = this.arena.column("unrest");
        this.firstDeposit = this.arena.column("firstDeposit");
        this.depositCount = this.arena.column("depositCount");
        this.firstBuilding = this.arena.column("firstBuilding");
        this.buildingCount = this.arena.column("buildingCount");
        this.nextInSystem = this.arena.column("nextInSystem");
        this.nextInFaction = this.arena.column("nextInFaction");
    }
}
export class Deposits {
    arena;
    body;
    resource;
    yield;
    constructor(arena) {
        this.arena = arena;
        this.body = new Uint32Array(0);
        this.resource = new Uint16Array(0);
        this.yield = new Float64Array(0);
        this.refreshColumns();
    }
    static create(initialCapacity = 128) {
        return new Deposits(new SoAArena("deposits", [
            { name: "body", kind: "u32" },
            { name: "resource", kind: "u16" },
            { name: "yield", kind: "f64" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Deposits(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    add(body, resource, yieldValue) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.body[row] = body;
        this.resource[row] = resource;
        this.yield[row] = yieldValue;
        return row;
    }
    refreshColumns() {
        this.body = this.arena.column("body");
        this.resource = this.arena.column("resource");
        this.yield = this.arena.column("yield");
    }
}
//# sourceMappingURL=bodies.js.map