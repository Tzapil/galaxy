import { SoAArena } from "../soa/arena.js";
export var StageOneLogKind;
(function (StageOneLogKind) {
    StageOneLogKind[StageOneLogKind["BatchComplete"] = 1] = "BatchComplete";
    StageOneLogKind[StageOneLogKind["MissingInput"] = 2] = "MissingInput";
    StageOneLogKind[StageOneLogKind["DeadlockBroken"] = 3] = "DeadlockBroken";
    StageOneLogKind[StageOneLogKind["ShipmentDelivered"] = 4] = "ShipmentDelivered";
    StageOneLogKind[StageOneLogKind["DepartureFailedFuel"] = 5] = "DepartureFailedFuel";
    StageOneLogKind[StageOneLogKind["HaulerLaunched"] = 6] = "HaulerLaunched";
    StageOneLogKind[StageOneLogKind["PopulationWarning"] = 7] = "PopulationWarning";
    StageOneLogKind[StageOneLogKind["FleetDisbanded"] = 8] = "FleetDisbanded";
    StageOneLogKind[StageOneLogKind["ConstructionStarted"] = 9] = "ConstructionStarted";
    StageOneLogKind[StageOneLogKind["ConstructionWaitingMaterials"] = 10] = "ConstructionWaitingMaterials";
    StageOneLogKind[StageOneLogKind["ConstructionComplete"] = 11] = "ConstructionComplete";
    StageOneLogKind[StageOneLogKind["BuildingDemolished"] = 12] = "BuildingDemolished";
    StageOneLogKind[StageOneLogKind["ContractSubsidyPaid"] = 13] = "ContractSubsidyPaid";
    StageOneLogKind[StageOneLogKind["ResearchCompleted"] = 14] = "ResearchCompleted";
    StageOneLogKind[StageOneLogKind["AiStrategicGoal"] = 15] = "AiStrategicGoal";
    StageOneLogKind[StageOneLogKind["AiBottleneck"] = 16] = "AiBottleneck";
    StageOneLogKind[StageOneLogKind["AiBuildPlan"] = 17] = "AiBuildPlan";
    StageOneLogKind[StageOneLogKind["AiColonization"] = 18] = "AiColonization";
    StageOneLogKind[StageOneLogKind["AiFleetScale"] = 19] = "AiFleetScale";
    StageOneLogKind[StageOneLogKind["AiNoop"] = 20] = "AiNoop";
})(StageOneLogKind || (StageOneLogKind = {}));
const DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT = 4096;
export class StageOneEventLog {
    arena;
    maxEntries;
    serial;
    tick;
    kind;
    system;
    body;
    subject;
    resource;
    amount;
    nextSerial = 0;
    constructor(arena, maxEntries = DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT) {
        this.arena = arena;
        this.maxEntries = maxEntries;
        this.serial = new Float64Array(0);
        this.tick = new Float64Array(0);
        this.kind = new Uint16Array(0);
        this.system = new Int32Array(0);
        this.body = new Int32Array(0);
        this.subject = new Int32Array(0);
        this.resource = new Int32Array(0);
        this.amount = new Float64Array(0);
        this.refreshColumns();
    }
    refreshColumns() {
        this.serial = this.arena.column("serial");
        this.tick = this.arena.column("tick");
        this.kind = this.arena.column("kind");
        this.system = this.arena.column("system");
        this.body = this.arena.column("body");
        this.subject = this.arena.column("subject");
        this.resource = this.arena.column("resource");
        this.amount = this.arena.column("amount");
    }
    static create(initialCapacity = DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT) {
        return new StageOneEventLog(new SoAArena("stage_one_event_log", [
            { name: "serial", kind: "f64" },
            { name: "tick", kind: "f64" },
            { name: "kind", kind: "u16" },
            { name: "system", kind: "i32" },
            { name: "body", kind: "i32" },
            { name: "subject", kind: "i32" },
            { name: "resource", kind: "i32" },
            { name: "amount", kind: "f64" }
        ], initialCapacity), initialCapacity);
    }
    static fromSnapshot(snapshot) {
        const log = new StageOneEventLog(SoAArena.fromSnapshot(snapshot), Math.max(DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT, snapshot.rowCount));
        let maxSerial = -1;
        for (let row = 0; row < log.length; row += 1) {
            const serial = log.serial[row] ?? -1;
            if (serial > maxSerial)
                maxSerial = serial;
        }
        log.nextSerial = maxSerial + 1;
        return log;
    }
    get length() {
        return this.arena.length;
    }
    append(tick, kind, system, body, subject, resource, amount) {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.length < this.maxEntries ? this.arena.addRow() : this.nextSerial % this.maxEntries;
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        this.serial[row] = this.nextSerial;
        this.nextSerial += 1;
        this.tick[row] = tick;
        this.kind[row] = kind;
        this.system[row] = system;
        this.body[row] = body;
        this.subject[row] = subject;
        this.resource[row] = resource;
        this.amount[row] = amount;
    }
    recentRow(indexFromOldest, count = this.length) {
        if (indexFromOldest < 0 || indexFromOldest >= count || count > this.length)
            throw new RangeError("Recent event index is outside the available log window.");
        const startSerial = Math.max(0, this.nextSerial - count);
        return (startSerial + indexFromOldest) % this.maxEntries;
    }
}
//# sourceMappingURL=log.js.map