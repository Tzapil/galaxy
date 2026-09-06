import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";

import type { Systems } from "./systems.js";

export const enum BodyType {
  Planet = 1,
  AsteroidBelt = 2,
  GasGiant = 3,
  Station = 4,
  Comet = 5
}

export type BodyColumn =
  | "system"
  | "type"
  | "size"
  | "habitability"
  | "featureMask"
  | "slots"
  | "usedSlots"
  | "owner"
  | "stockpile"
  | "population"
  | "development"
  | "housing"
  | "unrest"
  | "firstDeposit"
  | "depositCount"
  | "firstBuilding"
  | "buildingCount"
  | "nextInSystem"
  | "nextInFaction";

export type DepositColumn = "body" | "resource" | "yield";

export class Bodies {
  public system: Uint32Array;
  public type: Uint8Array;
  public size: Float64Array;
  public habitability: Float64Array;
  public featureMask: Uint32Array;
  public slots: Uint16Array;
  public usedSlots: Uint16Array;
  public owner: Int32Array;
  public stockpile: Uint32Array;
  public population: Float64Array;
  public development: Float64Array;
  public housing: Uint16Array;
  public unrest: Float64Array;
  public firstDeposit: Int32Array;
  public depositCount: Uint16Array;
  public firstBuilding: Int32Array;
  public buildingCount: Uint32Array;
  public nextInSystem: Int32Array;
  public nextInFaction: Int32Array;

  private buildingTail: Int32Array;
  private depositTail: Int32Array;

  public constructor(
    public readonly arena: SoAArena<BodyColumn>,
    public readonly deposits: Deposits
  ) {
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

  public static create(initialCapacity = 64): Bodies {
    return new Bodies(
      new SoAArena<BodyColumn>(
        "bodies",
        [
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
        ],
        initialCapacity
      ),
      Deposits.create(initialCapacity * 2)
    );
  }

  public static fromSnapshots(bodySnapshot: ArenaSnapshot, depositSnapshot: ArenaSnapshot): Bodies {
    return new Bodies(
      SoAArena.fromSnapshot(bodySnapshot) as SoAArena<BodyColumn>,
      Deposits.fromSnapshot(depositSnapshot)
    );
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(
    systems: Systems,
    system: number,
    type: BodyType,
    size: number,
    habitability: number,
    slots: number,
    owner: number,
    stockpile: number,
    population: number,
    featureMask = 0
  ): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
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

  public addDeposit(body: number, resource: number, yieldValue: number): number {
    const row = this.deposits.add(body, resource, yieldValue);
    const tail = this.depositTail[body] ?? -1;
    if (tail < 0) {
      this.firstDeposit[body] = row;
    }
    this.depositTail[body] = row;
    this.depositCount[body] = (this.depositCount[body] ?? 0) + 1;
    return row;
  }

  public attachBuilding(body: number, building: number, buildingNextInBody: Int32Array): void {
    const tail = this.buildingTail[body] ?? -1;
    if (tail < 0) {
      this.firstBuilding[body] = building;
    } else {
      buildingNextInBody[tail] = building;
    }
    this.buildingTail[body] = building;
    buildingNextInBody[building] = -1;
    this.buildingCount[body] = (this.buildingCount[body] ?? 0) + 1;
  }

  public rebuildBuildingTails(buildingNextInBody: Int32Array): void {
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

  public hasDeposit(body: number, resource: number): boolean {
    const start = this.firstDeposit[body] ?? -1;
    const count = this.depositCount[body] ?? 0;
    for (let i = 0; i < count; i += 1) {
      const row = start + i;
      if ((this.deposits.resource[row] ?? -1) === resource) return true;
    }
    return false;
  }

  public hasFeatureMask(body: number, mask: number): boolean {
    return mask === 0 || ((this.featureMask[body] ?? 0) & mask) === mask;
  }

  private ensureAuxCapacity(required: number): void {
    if (required <= this.buildingTail.length) return;
    const nextBuildingTail = new Int32Array(required);
    nextBuildingTail.fill(-1);
    nextBuildingTail.set(this.buildingTail);
    this.buildingTail = nextBuildingTail;

    const nextDepositTail = new Int32Array(required);
    nextDepositTail.fill(-1);
    nextDepositTail.set(this.depositTail);
    this.depositTail = nextDepositTail;
  }

  private rebuildDepositTails(): void {
    this.ensureAuxCapacity(this.arena.capacity);
    for (let i = 0; i < this.length; i += 1) {
      const firstDeposit = this.firstDeposit[i] ?? -1;
      const count = this.depositCount[i] ?? 0;
      this.depositTail[i] = count > 0 ? firstDeposit + count - 1 : -1;
    }
  }

  private refreshColumns(): void {
    this.system = this.arena.column("system") as Uint32Array;
    this.type = this.arena.column("type") as Uint8Array;
    this.size = this.arena.column("size") as Float64Array;
    this.habitability = this.arena.column("habitability") as Float64Array;
    this.featureMask = this.arena.column("featureMask") as Uint32Array;
    this.slots = this.arena.column("slots") as Uint16Array;
    this.usedSlots = this.arena.column("usedSlots") as Uint16Array;
    this.owner = this.arena.column("owner") as Int32Array;
    this.stockpile = this.arena.column("stockpile") as Uint32Array;
    this.population = this.arena.column("population") as Float64Array;
    this.development = this.arena.column("development") as Float64Array;
    this.housing = this.arena.column("housing") as Uint16Array;
    this.unrest = this.arena.column("unrest") as Float64Array;
    this.firstDeposit = this.arena.column("firstDeposit") as Int32Array;
    this.depositCount = this.arena.column("depositCount") as Uint16Array;
    this.firstBuilding = this.arena.column("firstBuilding") as Int32Array;
    this.buildingCount = this.arena.column("buildingCount") as Uint32Array;
    this.nextInSystem = this.arena.column("nextInSystem") as Int32Array;
    this.nextInFaction = this.arena.column("nextInFaction") as Int32Array;
  }
}

export class Deposits {
  public body: Uint32Array;
  public resource: Uint16Array;
  public yield: Float64Array;

  public constructor(public readonly arena: SoAArena<DepositColumn>) {
    this.body = new Uint32Array(0);
    this.resource = new Uint16Array(0);
    this.yield = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 128): Deposits {
    return new Deposits(
      new SoAArena<DepositColumn>(
        "deposits",
        [
          { name: "body", kind: "u32" },
          { name: "resource", kind: "u16" },
          { name: "yield", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Deposits {
    return new Deposits(SoAArena.fromSnapshot(snapshot) as SoAArena<DepositColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(body: number, resource: number, yieldValue: number): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.body[row] = body;
    this.resource[row] = resource;
    this.yield[row] = yieldValue;
    return row;
  }

  private refreshColumns(): void {
    this.body = this.arena.column("body") as Uint32Array;
    this.resource = this.arena.column("resource") as Uint16Array;
    this.yield = this.arena.column("yield") as Float64Array;
  }
}
