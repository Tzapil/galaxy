import { SoAArena } from "../soa/arena.js";
export var BuildingState;
(function (BuildingState) {
    BuildingState[BuildingState["UnderConstruction"] = 0] = "UnderConstruction";
    BuildingState[BuildingState["Working"] = 1] = "Working";
    BuildingState[BuildingState["IdleMissingInput"] = 2] = "IdleMissingInput";
    BuildingState[BuildingState["IdleNoWorkers"] = 3] = "IdleNoWorkers";
    BuildingState[BuildingState["IdleNoPower"] = 4] = "IdleNoPower";
    BuildingState[BuildingState["IdleStorageFull"] = 5] = "IdleStorageFull";
    BuildingState[BuildingState["Demolished"] = 6] = "Demolished";
})(BuildingState || (BuildingState = {}));
export class Buildings {
    arena;
    type;
    body;
    batchRecipe;
    continuousProcess;
    slots;
    state;
    stateResource;
    startedTick;
    finishTick;
    workersRequired;
    assignedWorkers;
    nextInBody;
    constructor(arena) {
        this.arena = arena;
        this.type = new Uint16Array(0);
        this.body = new Uint32Array(0);
        this.batchRecipe = new Int32Array(0);
        this.continuousProcess = new Int32Array(0);
        this.slots = new Uint16Array(0);
        this.state = new Uint8Array(0);
        this.stateResource = new Int32Array(0);
        this.startedTick = new Float64Array(0);
        this.finishTick = new Float64Array(0);
        this.workersRequired = new Float64Array(0);
        this.assignedWorkers = new Float64Array(0);
        this.nextInBody = new Int32Array(0);
        this.refreshColumns();
    }
    static create(initialCapacity = 128) {
        return new Buildings(new SoAArena("buildings", [
            { name: "type", kind: "u16" },
            { name: "body", kind: "u32" },
            { name: "batchRecipe", kind: "i32" },
            { name: "continuousProcess", kind: "i32" },
            { name: "slots", kind: "u16" },
            { name: "state", kind: "u8" },
            { name: "stateResource", kind: "i32" },
            { name: "startedTick", kind: "f64" },
            { name: "finishTick", kind: "f64" },
            { name: "workersRequired", kind: "f64" },
            { name: "assignedWorkers", kind: "f64" },
            { name: "nextInBody", kind: "i32" }
        ], initialCapacity));
    }
    static fromSnapshot(snapshot) {
        return new Buildings(SoAArena.fromSnapshot(snapshot));
    }
    get length() {
        return this.arena.length;
    }
    addBuilt(data, bodies, body, buildingType) {
        const row = this.addShell(data, bodies, body, buildingType, BuildingState.UnderConstruction);
        this.activateBuilt(data, bodies, row);
        return row;
    }
    addUnderConstruction(data, bodies, body, buildingType, tick) {
        const row = this.addShell(data, bodies, body, buildingType, BuildingState.UnderConstruction);
        this.startedTick[row] = tick;
        this.finishTick[row] = -1;
        this.stateResource[row] = -1;
        return row;
    }
    activateBuilt(data, bodies, building) {
        const buildingType = this.type[building] ?? 0;
        const def = data.buildings[buildingType];
        if (def === undefined)
            throw new RangeError("Unknown building type.");
        this.state[building] =
            def.batchRecipe >= 0 || def.continuousProcess >= 0
                ? BuildingState.IdleMissingInput
                : BuildingState.Working;
        this.stateResource[building] = -1;
        this.startedTick[building] = -1;
        this.finishTick[building] = -1;
        bodies.housing[this.body[building] ?? 0] =
            (bodies.housing[this.body[building] ?? 0] ?? 0) + def.housing;
    }
    markDemolished(data, bodies, building) {
        if (this.state[building] === BuildingState.Demolished)
            return;
        const buildingType = this.type[building] ?? 0;
        const def = data.buildings[buildingType];
        if (def === undefined)
            throw new RangeError("Unknown building type.");
        const body = this.body[building] ?? 0;
        bodies.usedSlots[body] = Math.max(0, (bodies.usedSlots[body] ?? 0) - def.slots);
        bodies.housing[body] = Math.max(0, (bodies.housing[body] ?? 0) - def.housing);
        bodies.buildingCount[body] = Math.max(0, (bodies.buildingCount[body] ?? 0) - 1);
        this.state[building] = BuildingState.Demolished;
        this.stateResource[building] = -1;
        this.startedTick[building] = -1;
        this.finishTick[building] = -1;
        this.assignedWorkers[building] = 0;
    }
    addShell(data, bodies, body, buildingType, state) {
        const def = data.buildings[buildingType];
        if (def === undefined)
            throw new RangeError("Unknown building type.");
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.type[row] = buildingType;
        this.body[row] = body;
        this.batchRecipe[row] = def.batchRecipe;
        this.continuousProcess[row] = def.continuousProcess;
        this.slots[row] = def.slots;
        this.state[row] = state;
        this.stateResource[row] = -1;
        this.startedTick[row] = -1;
        this.finishTick[row] = -1;
        this.workersRequired[row] = def.workers;
        this.assignedWorkers[row] = 0;
        this.nextInBody[row] = -1;
        bodies.usedSlots[body] = (bodies.usedSlots[body] ?? 0) + def.slots;
        bodies.attachBuilding(body, row, this.nextInBody);
        return row;
    }
    setIdleMissing(building, resource, energyResource) {
        this.state[building] =
            resource === energyResource ? BuildingState.IdleNoPower : BuildingState.IdleMissingInput;
        this.stateResource[building] = resource;
        this.startedTick[building] = -1;
        this.finishTick[building] = -1;
    }
    setIdleNoWorkers(building) {
        this.state[building] = BuildingState.IdleNoWorkers;
        this.stateResource[building] = -1;
        this.startedTick[building] = -1;
        this.finishTick[building] = -1;
    }
    setIdleStorageFull(building, resource) {
        this.state[building] = BuildingState.IdleStorageFull;
        this.stateResource[building] = resource;
        this.startedTick[building] = -1;
    }
    setWorking(building, tick, finishTick) {
        this.state[building] = BuildingState.Working;
        this.stateResource[building] = -1;
        this.startedTick[building] = tick;
        this.finishTick[building] = finishTick;
    }
    refreshColumns() {
        this.type = this.arena.column("type");
        this.body = this.arena.column("body");
        this.batchRecipe = this.arena.column("batchRecipe");
        this.continuousProcess = this.arena.column("continuousProcess");
        this.slots = this.arena.column("slots");
        this.state = this.arena.column("state");
        this.stateResource = this.arena.column("stateResource");
        this.startedTick = this.arena.column("startedTick");
        this.finishTick = this.arena.column("finishTick");
        this.workersRequired = this.arena.column("workersRequired");
        this.assignedWorkers = this.arena.column("assignedWorkers");
        this.nextInBody = this.arena.column("nextInBody");
    }
}
//# sourceMappingURL=buildings.js.map