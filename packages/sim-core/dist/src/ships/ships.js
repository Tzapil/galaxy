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
    blueprint;
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
        this.blueprint = new Int32Array(0);
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
            { name: "blueprint", kind: "i32" },
            { name: "stockpile", kind: "u32" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        if (hasColumn(snapshot, "blueprint")) {
            return new Ships(SoAArena.fromSnapshot(snapshot));
        }
        const ships = Ships.create(Math.max(1, snapshot.rowCount));
        for (let row = 0; row < snapshot.rowCount; row += 1)
            ships.arena.addRow();
        ships.copyLegacyColumn(snapshot, "faction", ships.faction);
        ships.copyLegacyColumn(snapshot, "role", ships.role);
        ships.copyLegacyColumn(snapshot, "state", ships.state);
        ships.copyLegacyColumn(snapshot, "currentSystem", ships.currentSystem);
        ships.copyLegacyColumn(snapshot, "fromSystem", ships.fromSystem);
        ships.copyLegacyColumn(snapshot, "toSystem", ships.toSystem);
        ships.copyLegacyColumn(snapshot, "sourceBody", ships.sourceBody);
        ships.copyLegacyColumn(snapshot, "targetBody", ships.targetBody);
        ships.copyLegacyColumn(snapshot, "departTick", ships.departTick);
        ships.copyLegacyColumn(snapshot, "arriveTick", ships.arriveTick);
        ships.copyLegacyColumn(snapshot, "cargoResource", ships.cargoResource);
        ships.copyLegacyColumn(snapshot, "cargoAmount", ships.cargoAmount);
        ships.copyLegacyColumn(snapshot, "cargoCapacity", ships.cargoCapacity);
        ships.copyLegacyColumn(snapshot, "fuelTank", ships.fuelTank);
        ships.copyLegacyColumn(snapshot, "fuelCapacity", ships.fuelCapacity);
        ships.copyLegacyColumn(snapshot, "fuelPerJump", ships.fuelPerJump);
        ships.copyLegacyColumn(snapshot, "stockpile", ships.stockpile);
        ships.blueprint.fill(-1, 0, snapshot.rowCount);
        return ships;
    }
    get length() {
        return this.arena.length;
    }
    addHauler(faction, currentSystem, stockpile, cargoCapacity, fuelCapacity, fuelPerJump) {
        return this.addShip(faction, currentSystem, stockpile, ShipRole.Hauler, cargoCapacity, fuelCapacity, fuelPerJump);
    }
    addShip(faction, currentSystem, stockpile, role, cargoCapacity, fuelCapacity, fuelPerJump, blueprint = -1) {
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
        this.blueprint[row] = blueprint;
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
        this.blueprint = this.arena.column("blueprint");
        this.stockpile = this.arena.column("stockpile");
    }
    copyLegacyColumn(snapshot, name, target) {
        for (let i = 0; i < snapshot.columns.length; i += 1) {
            const column = snapshot.columns[i];
            if (column?.name === name) {
                target.set(column.data);
                return;
            }
        }
        throw new RangeError(`Legacy ships snapshot is missing column "${name}".`);
    }
}
function hasColumn(snapshot, name) {
    for (let i = 0; i < snapshot.columns.length; i += 1) {
        if (snapshot.columns[i]?.name === name)
            return true;
    }
    return false;
}
//# sourceMappingURL=ships.js.map