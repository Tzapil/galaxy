import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot, NumericArray } from "../soa/arena.js";

export const enum ShipRole {
  Hauler = 1,
  Colonizer = 2,
  Warship = 3,
  Miner = 4,
  Scout = 5
}

export const enum ShipState {
  Idle = 0,
  InTransit = 1,
  Disbanded = 2
}

export type ShipColumn =
  | "faction"
  | "role"
  | "state"
  | "currentSystem"
  | "fromSystem"
  | "toSystem"
  | "sourceBody"
  | "targetBody"
  | "departTick"
  | "arriveTick"
  | "cargoResource"
  | "cargoAmount"
  | "cargoCapacity"
  | "fuelTank"
  | "fuelCapacity"
  | "fuelPerJump"
  | "blueprint"
  | "stockpile";

export class Ships {
  public faction: Uint16Array;
  public role: Uint8Array;
  public state: Uint8Array;
  public currentSystem: Uint32Array;
  public fromSystem: Uint32Array;
  public toSystem: Uint32Array;
  public sourceBody: Int32Array;
  public targetBody: Int32Array;
  public departTick: Float64Array;
  public arriveTick: Float64Array;
  public cargoResource: Int32Array;
  public cargoAmount: Float64Array;
  public cargoCapacity: Float64Array;
  public fuelTank: Float64Array;
  public fuelCapacity: Float64Array;
  public fuelPerJump: Float64Array;
  public blueprint: Int32Array;
  public stockpile: Uint32Array;

  public constructor(public readonly arena: SoAArena<ShipColumn>) {
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

  public static create(initialCapacity = 32): Ships {
    return new Ships(
      new SoAArena<ShipColumn>(
        "ships",
        [
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
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Ships {
    if (hasColumn(snapshot, "blueprint")) {
      return new Ships(SoAArena.fromSnapshot(snapshot) as SoAArena<ShipColumn>);
    }
    const ships = Ships.create(Math.max(1, snapshot.rowCount));
    for (let row = 0; row < snapshot.rowCount; row += 1) ships.arena.addRow();
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

  public get length(): number {
    return this.arena.length;
  }

  public addHauler(
    faction: number,
    currentSystem: number,
    stockpile: number,
    cargoCapacity: number,
    fuelCapacity: number,
    fuelPerJump: number
  ): number {
    return this.addShip(
      faction,
      currentSystem,
      stockpile,
      ShipRole.Hauler,
      cargoCapacity,
      fuelCapacity,
      fuelPerJump
    );
  }

  public addShip(
    faction: number,
    currentSystem: number,
    stockpile: number,
    role: ShipRole,
    cargoCapacity: number,
    fuelCapacity: number,
    fuelPerJump: number,
    blueprint = -1
  ): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
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

  private refreshColumns(): void {
    this.faction = this.arena.column("faction") as Uint16Array;
    this.role = this.arena.column("role") as Uint8Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.currentSystem = this.arena.column("currentSystem") as Uint32Array;
    this.fromSystem = this.arena.column("fromSystem") as Uint32Array;
    this.toSystem = this.arena.column("toSystem") as Uint32Array;
    this.sourceBody = this.arena.column("sourceBody") as Int32Array;
    this.targetBody = this.arena.column("targetBody") as Int32Array;
    this.departTick = this.arena.column("departTick") as Float64Array;
    this.arriveTick = this.arena.column("arriveTick") as Float64Array;
    this.cargoResource = this.arena.column("cargoResource") as Int32Array;
    this.cargoAmount = this.arena.column("cargoAmount") as Float64Array;
    this.cargoCapacity = this.arena.column("cargoCapacity") as Float64Array;
    this.fuelTank = this.arena.column("fuelTank") as Float64Array;
    this.fuelCapacity = this.arena.column("fuelCapacity") as Float64Array;
    this.fuelPerJump = this.arena.column("fuelPerJump") as Float64Array;
    this.blueprint = this.arena.column("blueprint") as Int32Array;
    this.stockpile = this.arena.column("stockpile") as Uint32Array;
  }

  private copyLegacyColumn(snapshot: ArenaSnapshot, name: ShipColumn, target: NumericArray): void {
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

function hasColumn(snapshot: ArenaSnapshot, name: string): boolean {
  for (let i = 0; i < snapshot.columns.length; i += 1) {
    if (snapshot.columns[i]?.name === name) return true;
  }
  return false;
}
