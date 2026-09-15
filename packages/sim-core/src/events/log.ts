import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";

export const enum StageOneLogKind {
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
  ResearchCompleted = 14,
  AiStrategicGoal = 15,
  AiBottleneck = 16,
  AiBuildPlan = 17,
  AiColonization = 18,
  AiFleetScale = 19,
  AiNoop = 20,
  ResearchChosen = 21,
  BlueprintCreated = 22,
  KitOrderCreated = 23,
  ShipyardOrderQueued = 24,
  ShipyardBuildStarted = 25,
  ShipyardBuildComplete = 26,
  RefitStarted = 27,
  RefitComplete = 28,
  BlockadeStarted = 29,
  BlockadeEnded = 30,
  BlockadeResponse = 31,
  BattleStarted = 32,
  BattleEnded = 33,
  ColonyCaptured = 34,
  IntelUpdated = 35,
  WarDeclared = 36,
  TreatySigned = 37,
  TreatyBroken = 38,
  ForeignTrade = 39,
  PeaceConcluded = 40,
  CoalitionChanged = 41,
  Secession = 42
}

const DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT = 4096;

export type EventLogColumn =
  "serial" | "tick" | "kind" | "system" | "body" | "subject" | "resource" | "amount";

export type StageOneLogListener = (row: number) => void;

export class StageOneEventLog {
  public serial: Float64Array;
  public tick: Float64Array;
  public kind: Uint16Array;
  public system: Int32Array;
  public body: Int32Array;
  public subject: Int32Array;
  public resource: Int32Array;
  public amount: Float64Array;
  private nextSerial = 0;
  private readonly listeners = new Set<StageOneLogListener>();

  public constructor(
    public readonly arena: SoAArena<EventLogColumn>,
    private readonly maxEntries = DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT
  ) {
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

  private refreshColumns(): void {
    this.serial = this.arena.column("serial") as Float64Array;
    this.tick = this.arena.column("tick") as Float64Array;
    this.kind = this.arena.column("kind") as Uint16Array;
    this.system = this.arena.column("system") as Int32Array;
    this.body = this.arena.column("body") as Int32Array;
    this.subject = this.arena.column("subject") as Int32Array;
    this.resource = this.arena.column("resource") as Int32Array;
    this.amount = this.arena.column("amount") as Float64Array;
  }

  public static create(initialCapacity = DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT): StageOneEventLog {
    return new StageOneEventLog(
      new SoAArena<EventLogColumn>(
        "stage_one_event_log",
        [
          { name: "serial", kind: "f64" },
          { name: "tick", kind: "f64" },
          { name: "kind", kind: "u16" },
          { name: "system", kind: "i32" },
          { name: "body", kind: "i32" },
          { name: "subject", kind: "i32" },
          { name: "resource", kind: "i32" },
          { name: "amount", kind: "f64" }
        ],
        initialCapacity
      ),
      initialCapacity
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): StageOneEventLog {
    const log = new StageOneEventLog(
      SoAArena.fromSnapshot(snapshot) as SoAArena<EventLogColumn>,
      Math.max(DEFAULT_STAGE_ONE_EVENT_LOG_LIMIT, snapshot.rowCount)
    );
    let maxSerial = -1;
    for (let row = 0; row < log.length; row += 1) {
      const serial = log.serial[row] ?? -1;
      if (serial > maxSerial) maxSerial = serial;
    }
    log.nextSerial = maxSerial + 1;
    return log;
  }

  public get length(): number {
    return this.arena.length;
  }

  public subscribe(listener: StageOneLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public append(
    tick: number,
    kind: StageOneLogKind,
    system: number,
    body: number,
    subject: number,
    resource: number,
    amount: number
  ): void {
    const previousCapacity = this.arena.capacity;
    const row =
      this.arena.length < this.maxEntries ? this.arena.addRow() : this.nextSerial % this.maxEntries;
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.serial[row] = this.nextSerial;
    this.nextSerial += 1;
    this.tick[row] = tick;
    this.kind[row] = kind;
    this.system[row] = system;
    this.body[row] = body;
    this.subject[row] = subject;
    this.resource[row] = resource;
    this.amount[row] = amount;
    for (const listener of this.listeners) listener(row);
  }

  public recentRow(indexFromOldest: number, count = this.length): number {
    if (indexFromOldest < 0 || indexFromOldest >= count || count > this.length)
      throw new RangeError("Recent event index is outside the available log window.");
    const startSerial = Math.max(0, this.nextSerial - count);
    return (startSerial + indexFromOldest) % this.maxEntries;
  }
}
