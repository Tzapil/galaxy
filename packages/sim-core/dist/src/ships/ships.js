import { SoAArena } from "../soa/arena.js";
export var ShipRole;
(function (ShipRole) {
    ShipRole[ShipRole["Hauler"] = 1] = "Hauler";
    ShipRole[ShipRole["Colonizer"] = 2] = "Colonizer";
    ShipRole[ShipRole["Warship"] = 3] = "Warship";
    ShipRole[ShipRole["Miner"] = 4] = "Miner";
    ShipRole[ShipRole["Scout"] = 5] = "Scout";
})(ShipRole || (ShipRole = {}));
export var ShipState;
(function (ShipState) {
    ShipState[ShipState["Idle"] = 0] = "Idle";
    ShipState[ShipState["InTransit"] = 1] = "InTransit";
    ShipState[ShipState["Disbanded"] = 2] = "Disbanded";
})(ShipState || (ShipState = {}));
export class Ships {
    arena;
    faction;
    role;
    state;
    currentSystem;
    fromSystem;
    toSystem;
    sourceBody;
    targetBody;
    departTick;
    arriveTick;
    cargoResource;
    cargoAmount;
    cargoCapacity;
    fuelTank;
    fuelCapacity;
    fuelPerJump;
    stockpile;
    constructor(arena) {
        this.arena = arena;
        this.faction = new Uint16Array(0);
        this.role = new Uint8Array(0);
        this.state = new Uint8Array(0);
        this.currentSystem = new Uint32Array(0);
        this.fromSystem = new Uint32Array(0);
        this.toSystem = new Uint32Array(0);
        this.sourceBody = new Int32Array(0);
        this.targetBody = new Int32Array(0);
        this.departTick = new Float64Array(0);
        this.arriveTick = new Float64Array(0);
        this.cargoResource = new Int32Array(0);
        this.cargoAmount = new Float64Array(0);
        this.cargoCapacity = new Float64Array(0);
        this.fuelTank = new Float64Array(0);
        this.fuelCapacity = new Float64Array(0);
        this.fuelPerJump = new Float64Array(0);
        this.stockpile = new Uint32Array(0);
        this.refreshColumns();
    }
    static create(initialCapacity = 32) {
        return new Ships(new SoAArena("ships", [
            { name: "faction", kind: "u16" },
            { name: "role", kind: "u8" },
            { name: "state", kind: "u8" },
            { name: "currentSystem", kind: "u32" },
            { name: "fromSystem", kind: "u32" },
            { name: "toSystem", kind: "u32" },
            { name: "sourceBody", kind: "i32" },
            { name: "targetBody", kind: "i32" },
            { name: "departTick", kind: "f64" },
            { name: "arriveTick", kind: "f64" },
            { name: "cargoResource", kind: "i32" },
            { name: "cargoAmount", kind: "f64" },
            { name: "cargoCapacity", kind: "f64" },
            { name: "fuelTank", kind: "f64" },
            { name: "fuelCapacity", kind: "f64" },
            { name: "fuelPerJump", kind: "f64" },
            { name: "stockpile", kind: "u32" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Ships(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    addHauler(faction, currentSystem, stockpile, cargoCapacity, fuelCapacity, fuelPerJump) {
        return this.addShip(faction, currentSystem, stockpile, ShipRole.Hauler, cargoCapacity, fuelCapacity, fuelPerJump);
    }
    addShip(faction, currentSystem, stockpile, role, cargoCapacity, fuelCapacity, fuelPerJump) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.faction[row] = faction;
        this.role[row] = role;
        this.state[row] = ShipState.Idle;
        this.currentSystem[row] = currentSystem;
        this.fromSystem[row] = currentSystem;
        this.toSystem[row] = currentSystem;
        this.sourceBody[row] = -1;
        this.targetBody[row] = -1;
        this.departTick[row] = -1;
        this.arriveTick[row] = -1;
        this.cargoResource[row] = -1;
        this.cargoAmount[row] = 0;
        this.cargoCapacity[row] = cargoCapacity;
        this.fuelTank[row] = fuelCapacity;
        this.fuelCapacity[row] = fuelCapacity;
        this.fuelPerJump[row] = fuelPerJump;
        this.stockpile[row] = stockpile;
        return row;
    }
    refreshColumns() {
        this.faction = this.arena.column("faction");
        this.role = this.arena.column("role");
        this.state = this.arena.column("state");
        this.currentSystem = this.arena.column("currentSystem");
        this.fromSystem = this.arena.column("fromSystem");
        this.toSystem = this.arena.column("toSystem");
        this.sourceBody = this.arena.column("sourceBody");
        this.targetBody = this.arena.column("targetBody");
        this.departTick = this.arena.column("departTick");
        this.arriveTick = this.arena.column("arriveTick");
        this.cargoResource = this.arena.column("cargoResource");
        this.cargoAmount = this.arena.column("cargoAmount");
        this.cargoCapacity = this.arena.column("cargoCapacity");
        this.fuelTank = this.arena.column("fuelTank");
        this.fuelCapacity = this.arena.column("fuelCapacity");
        this.fuelPerJump = this.arena.column("fuelPerJump");
        this.stockpile = this.arena.column("stockpile");
    }
}
//# sourceMappingURL=ships.js.map