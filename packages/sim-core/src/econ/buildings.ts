import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
import type { Bodies } from "../world/bodies.js";
import type { Stockpiles } from "../world/stockpiles.js";

export const enum BuildingState {
  UnderConstruction = 0,
  Working = 1,
  IdleMissingInput = 2,
  IdleNoWorkers = 3,
  IdleNoPower = 4,
  IdleStorageFull = 5,
  Demolished = 6
}

export type BuildingColumn =
  | "type"
  | "body"
  | "batchRecipe"
  | "continuousProcess"
  | "slots"
  | "state"
  | "stateResource"
  | "startedTick"
  | "finishTick"
  | "workersRequired"
  | "assignedWorkers"
  | "nextInBody";

export class Buildings {
  private technicalLimit: number | undefined;
  public type: Uint16Array;
  public body: Uint32Array;
  public batchRecipe: Int32Array;
  public continuousProcess: Int32Array;
  public slots: Uint16Array;
  public state: Uint8Array;
  public stateResource: Int32Array;
  public startedTick: Float64Array;
  public finishTick: Float64Array;
  public workersRequired: Float64Array;
  public assignedWorkers: Float64Array;
  public nextInBody: Int32Array;

  public constructor(public readonly arena: SoAArena<BuildingColumn>) {
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

  public static create(initialCapacity = 128): Buildings {
    return new Buildings(
      new SoAArena<BuildingColumn>(
        "buildings",
        [
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
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Buildings {
    return new Buildings(SoAArena.fromSnapshot(snapshot) as SoAArena<BuildingColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public setTechnicalLimit(limit: number | undefined): void {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < this.length)) {
      throw new RangeError(
        "Building technical limit cannot be lower than the current building count."
      );
    }
    this.technicalLimit = limit;
  }

  public canAdd(count = 1): boolean {
    return (
      Number.isSafeInteger(count) &&
      count >= 0 &&
      (this.technicalLimit === undefined || this.length + count <= this.technicalLimit)
    );
  }

  public addBuilt(
    data: StageOneData,
    bodies: Bodies,
    body: number,
    buildingType: number,
    stockpiles?: Stockpiles
  ): number {
    const row = this.addShell(data, bodies, body, buildingType, BuildingState.UnderConstruction);
    if (row < 0) return -1;
    this.activateBuilt(data, bodies, row, stockpiles);
    return row;
  }

  public addUnderConstruction(
    data: StageOneData,
    bodies: Bodies,
    body: number,
    buildingType: number,
    tick: number
  ): number {
    const row = this.addShell(data, bodies, body, buildingType, BuildingState.UnderConstruction);
    if (row < 0) return -1;
    this.startedTick[row] = tick;
    this.finishTick[row] = -1;
    this.stateResource[row] = -1;
    return row;
  }

  public activateBuilt(
    data: StageOneData,
    bodies: Bodies,
    building: number,
    stockpiles?: Stockpiles
  ): void {
    const buildingType = this.type[building] ?? 0;
    const def = data.buildings[buildingType];
    if (def === undefined) throw new RangeError("Unknown building type.");
    const body = this.body[building] ?? 0;
    this.state[building] =
      def.batchRecipe >= 0 || def.continuousProcess >= 0
        ? BuildingState.IdleMissingInput
        : BuildingState.Working;
    this.stateResource[building] = -1;
    this.startedTick[building] = -1;
    this.finishTick[building] = -1;
    bodies.housing[body] = (bodies.housing[body] ?? 0) + def.housing;
    if (stockpiles !== undefined && def.storageBonus > 0) {
      stockpiles.addCapacity(bodies.stockpile[body] ?? 0, def.storageBonus);
    }
  }

  public markDemolished(
    data: StageOneData,
    bodies: Bodies,
    building: number,
    stockpiles?: Stockpiles
  ): void {
    if (this.state[building] === BuildingState.Demolished) return;
    const buildingType = this.type[building] ?? 0;
    const def = data.buildings[buildingType];
    if (def === undefined) throw new RangeError("Unknown building type.");
    const body = this.body[building] ?? 0;
    bodies.usedSlots[body] = Math.max(0, (bodies.usedSlots[body] ?? 0) - def.slots);
    bodies.housing[body] = Math.max(0, (bodies.housing[body] ?? 0) - def.housing);
    bodies.buildingCount[body] = Math.max(0, (bodies.buildingCount[body] ?? 0) - 1);
    if (stockpiles !== undefined && def.storageBonus > 0) {
      stockpiles.addCapacity(bodies.stockpile[body] ?? 0, -def.storageBonus);
    }
    this.state[building] = BuildingState.Demolished;
    this.stateResource[building] = -1;
    this.startedTick[building] = -1;
    this.finishTick[building] = -1;
    this.assignedWorkers[building] = 0;
  }

  private addShell(
    data: StageOneData,
    bodies: Bodies,
    body: number,
    buildingType: number,
    state: BuildingState
  ): number {
    if (!this.canAdd()) return -1;
    const def = data.buildings[buildingType];
    if (def === undefined) throw new RangeError("Unknown building type.");
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
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

  public setIdleMissing(building: number, resource: number, energyResource: number): void {
    this.state[building] =
      resource === energyResource ? BuildingState.IdleNoPower : BuildingState.IdleMissingInput;
    this.stateResource[building] = resource;
    this.startedTick[building] = -1;
    this.finishTick[building] = -1;
  }

  public setIdleNoWorkers(building: number): void {
    this.state[building] = BuildingState.IdleNoWorkers;
    this.stateResource[building] = -1;
    this.startedTick[building] = -1;
    this.finishTick[building] = -1;
  }

  public setIdleStorageFull(building: number, resource: number): void {
    this.state[building] = BuildingState.IdleStorageFull;
    this.stateResource[building] = resource;
    this.startedTick[building] = -1;
  }

  public setWorking(building: number, tick: number, finishTick: number): void {
    this.state[building] = BuildingState.Working;
    this.stateResource[building] = -1;
    this.startedTick[building] = tick;
    this.finishTick[building] = finishTick;
  }

  private refreshColumns(): void {
    this.type = this.arena.column("type") as Uint16Array;
    this.body = this.arena.column("body") as Uint32Array;
    this.batchRecipe = this.arena.column("batchRecipe") as Int32Array;
    this.continuousProcess = this.arena.column("continuousProcess") as Int32Array;
    this.slots = this.arena.column("slots") as Uint16Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.stateResource = this.arena.column("stateResource") as Int32Array;
    this.startedTick = this.arena.column("startedTick") as Float64Array;
    this.finishTick = this.arena.column("finishTick") as Float64Array;
    this.workersRequired = this.arena.column("workersRequired") as Float64Array;
    this.assignedWorkers = this.arena.column("assignedWorkers") as Float64Array;
    this.nextInBody = this.arena.column("nextInBody") as Int32Array;
  }
}
