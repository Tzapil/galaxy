import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
export declare const enum StageOneLogKind {
    BatchComplete = 1,
    MissingInput = 2,
    DeadlockBroken = 3,
    ShipmentDelivered = 4,
    DepartureFailedFuel = 5,
    HaulerLaunched = 6,
    PopulationWarning = 7,
    FleetDisbanded = 8,
    ConstructionStarted = 9,
    ConstructionWaitingMaterials = 10,
    ConstructionComplete = 11,
    BuildingDemolished = 12,
    ContractSubsidyPaid = 13,
    ResearchCompleted = 14
}
export type EventLogColumn = "serial" | "tick" | "kind" | "system" | "body" | "subject" | "resource" | "amount";
export declare class StageOneEventLog {
    readonly arena: SoAArena<EventLogColumn>;
    private readonly maxEntries;
    serial: Float64Array;
    tick: Float64Array;
    kind: Uint16Array;
    system: Int32Array;
    body: Int32Array;
    subject: Int32Array;
    resource: Int32Array;
    amount: Float64Array;
    private nextSerial;
    constructor(arena: SoAArena<EventLogColumn>, maxEntries?: number);
    private refreshColumns;
    static create(initialCapacity?: number): StageOneEventLog;
    static fromSnapshot(snapshot: ArenaSnapshot): StageOneEventLog;
    get length(): number;
    append(tick: number, kind: StageOneLogKind, system: number, body: number, subject: number, resource: number, amount: number): void;
    recentRow(indexFromOldest: number, count?: number): number;
}
//# sourceMappingURL=log.d.ts.map