import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import { StageOneLogKind } from "../events/log.js";
import type { ResourceAmount, StageOneData } from "../stage-one/data.js";
import type { GovernmentContracts } from "../treasury/contracts.js";
import type { StageOneWorld } from "../world/state.js";

import type { Blueprints } from "./blueprint.js";

export const enum KitOrderState {
  Inactive = 0,
  Active = 1,
  Ready = 2,
  Completed = 3,
  Expired = 4,
  Cancelled = 5
}

export class KitOrders {
  public faction: Uint16Array;
  public targetBody: Uint32Array;
  public blueprint: Int32Array;
  public createdTick: Float64Array;
  public expiresTick: Float64Array;
  public state: Uint8Array;
  public priority: Float64Array;
  public readonly requiredColumns: Float64Array[] = [];
  public readonly reservedColumns: Float64Array[] = [];

  public constructor(
    public readonly arena: SoAArena<string>,
    private readonly data: StageOneData
  ) {
    this.faction = new Uint16Array(0);
    this.targetBody = new Uint32Array(0);
    this.blueprint = new Int32Array(0);
    this.createdTick = new Float64Array(0);
    this.expiresTick = new Float64Array(0);
    this.state = new Uint8Array(0);
    this.priority = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(data: StageOneData, initialCapacity = 64): KitOrders {
    const columns = [
      { name: "faction", kind: "u16" as const },
      { name: "targetBody", kind: "u32" as const },
      { name: "blueprint", kind: "i32" as const },
      { name: "createdTick", kind: "f64" as const },
      { name: "expiresTick", kind: "f64" as const },
      { name: "state", kind: "u8" as const },
      { name: "priority", kind: "f64" as const }
    ];
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      const id = data.resources[resource]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      columns.push({ name: requiredColumnName(id), kind: "f64" as const });
      columns.push({ name: reservedColumnName(id), kind: "f64" as const });
    }
    return new KitOrders(new SoAArena<string>("kit_orders", columns, initialCapacity), data);
  }

  public static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): KitOrders {
    return new KitOrders(SoAArena.fromSnapshot(snapshot), data);
  }

  public get length(): number {
    return this.arena.length;
  }

  public addForBlueprint(
    world: StageOneWorld,
    blueprint: number,
    targetBody: number,
    tick: number,
    timeoutTicks = 180,
    priority = 1
  ): number {
    const faction = world.blueprints.faction[blueprint] ?? -1;
    if (faction < 0) throw new RangeError("Blueprint has no owning faction.");
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.faction[row] = faction;
    this.targetBody[row] = targetBody;
    this.blueprint[row] = blueprint;
    this.createdTick[row] = tick;
    this.expiresTick[row] = tick + timeoutTicks;
    this.state[row] = KitOrderState.Active;
    this.priority[row] = priority;
    this.clearResourceColumns(row);

    const requirements = blueprintComponentRequirements(this.data, world.blueprints, blueprint);
    for (let i = 0; i < requirements.length; i += 1) {
      const item = requirements[i];
      if (item === undefined) throw new RangeError("Kit requirements are inconsistent.");
      const required = mustColumn(this.requiredColumns[item.resource]);
      required[row] = (required[row] ?? 0) + item.amount;
    }
    this.reserveFromTarget(world, row, tick);
    world.eventLog.append(
      tick,
      StageOneLogKind.KitOrderCreated,
      world.bodies.system[targetBody] ?? -1,
      targetBody,
      row,
      blueprint,
      this.isReady(row) ? 1 : 0
    );
    return row;
  }

  public reserveFromTarget(world: StageOneWorld, order: number, tick: number): void {
    const state = this.state[order] ?? KitOrderState.Inactive;
    if (state !== KitOrderState.Active && state !== KitOrderState.Ready) return;
    if ((this.expiresTick[order] ?? Number.POSITIVE_INFINITY) < tick) {
      this.expire(world, order);
      return;
    }
    const targetBody = this.targetBody[order] ?? 0;
    const targetStockpile = world.bodies.stockpile[targetBody] ?? -1;
    if (targetStockpile < 0) return;
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      const missing = this.missing(order, resource);
      if (missing <= 0.000001) continue;
      const removed = world.stockpiles.removeAvailable(targetStockpile, resource, missing);
      const reserved = mustColumn(this.reservedColumns[resource]);
      reserved[order] = (reserved[order] ?? 0) + removed;
    }
    this.state[order] = this.isReady(order) ? KitOrderState.Ready : KitOrderState.Active;
  }

  public advance(world: StageOneWorld, tick: number): void {
    for (let order = 0; order < this.length; order += 1) {
      const state = this.state[order] ?? KitOrderState.Inactive;
      if (state !== KitOrderState.Active && state !== KitOrderState.Ready) continue;
      this.reserveFromTarget(world, order, tick);
    }
  }

  public missing(order: number, resource: number): number {
    return Math.max(
      0,
      (mustColumn(this.requiredColumns[resource])[order] ?? 0) -
        (mustColumn(this.reservedColumns[resource])[order] ?? 0)
    );
  }

  public required(order: number, resource: number): number {
    return mustColumn(this.requiredColumns[resource])[order] ?? 0;
  }

  public reserved(order: number, resource: number): number {
    return mustColumn(this.reservedColumns[resource])[order] ?? 0;
  }

  public isReady(order: number): boolean {
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      if (this.missing(order, resource) > 0.000001) return false;
    }
    return true;
  }

  public complete(order: number): void {
    if (!this.isReady(order)) throw new RangeError("Cannot complete an incomplete kit order.");
    this.state[order] = KitOrderState.Completed;
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      mustColumn(this.reservedColumns[resource])[order] = 0;
    }
  }

  public expire(world: StageOneWorld, order: number): void {
    const state = this.state[order] ?? KitOrderState.Inactive;
    if (state !== KitOrderState.Active && state !== KitOrderState.Ready) return;
    this.returnReservedToTarget(world, order);
    this.state[order] = KitOrderState.Expired;
  }

  public cancel(world: StageOneWorld, order: number): void {
    const state = this.state[order] ?? KitOrderState.Inactive;
    if (state !== KitOrderState.Active && state !== KitOrderState.Ready) return;
    this.returnReservedToTarget(world, order);
    this.state[order] = KitOrderState.Cancelled;
  }

  private returnReservedToTarget(world: StageOneWorld, order: number): void {
    const targetBody = this.targetBody[order] ?? -1;
    if (targetBody < 0) return;
    const targetStockpile = world.bodies.stockpile[targetBody] ?? -1;
    if (targetStockpile < 0) return;
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      const reserved = mustColumn(this.reservedColumns[resource])[order] ?? 0;
      if (reserved <= 0) continue;
      world.stockpiles.addClamped(targetStockpile, resource, reserved);
      mustColumn(this.reservedColumns[resource])[order] = 0;
    }
  }

  private clearResourceColumns(row: number): void {
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      mustColumn(this.requiredColumns[resource])[row] = 0;
      mustColumn(this.reservedColumns[resource])[row] = 0;
    }
  }

  private refreshColumns(): void {
    this.faction = this.arena.column("faction") as Uint16Array;
    this.targetBody = this.arena.column("targetBody") as Uint32Array;
    this.blueprint = this.arena.column("blueprint") as Int32Array;
    this.createdTick = this.arena.column("createdTick") as Float64Array;
    this.expiresTick = this.arena.column("expiresTick") as Float64Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.priority = this.arena.column("priority") as Float64Array;
    this.requiredColumns.length = 0;
    this.reservedColumns.length = 0;
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      const id = this.data.resources[resource]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      this.requiredColumns.push(this.arena.column(requiredColumnName(id)) as Float64Array);
      this.reservedColumns.push(this.arena.column(reservedColumnName(id)) as Float64Array);
    }
  }
}

export function blueprintComponentRequirements(
  data: StageOneData,
  blueprints: Blueprints,
  blueprint: number
): readonly ResourceAmount[] {
  const hull = data.hulls[blueprints.hull[blueprint] ?? -1];
  if (hull === undefined) throw new RangeError("Blueprint hull is invalid.");
  const totals = new Float64Array(data.resources.length);
  addBag(totals, hull.buildRecipe);
  const count = blueprints.moduleCount[blueprint] ?? 0;
  for (let slot = 0; slot < count; slot += 1) {
    const module = data.modules[blueprints.moduleAt(blueprint, slot)];
    if (module === undefined) throw new RangeError("Blueprint module is invalid.");
    addBag(totals, module.cost);
  }
  const result: ResourceAmount[] = [];
  for (let resource = 0; resource < totals.length; resource += 1) {
    const amount = totals[resource] ?? 0;
    if (amount > 0) result.push({ resource, amount });
  }
  return result;
}

export function addKitOrderContracts(
  data: StageOneData,
  world: StageOneWorld,
  contracts: GovernmentContracts
): void {
  for (let order = 0; order < world.kitOrders.length; order += 1) {
    const state = world.kitOrders.state[order] ?? KitOrderState.Inactive;
    if (state !== KitOrderState.Active && state !== KitOrderState.Ready) continue;
    const faction = world.kitOrders.faction[order] ?? -1;
    const targetBody = world.kitOrders.targetBody[order] ?? -1;
    if (faction < 0 || targetBody < 0) continue;
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      const missing = world.kitOrders.missing(order, resource);
      if (missing <= 0.000001 || data.transportable[resource] !== 1) continue;
      contracts.add({
        faction,
        targetBody,
        resource,
        creditsPerUnit: (data.baseValue[resource] ?? 1) * 2
      });
    }
  }
}

function addBag(totals: Float64Array, bag: readonly ResourceAmount[]): void {
  for (let i = 0; i < bag.length; i += 1) {
    const item = bag[i];
    if (item === undefined) throw new RangeError("Resource bag is inconsistent.");
    totals[item.resource] = (totals[item.resource] ?? 0) + item.amount;
  }
}

function requiredColumnName(id: string): string {
  return `required_${id}`;
}

function reservedColumnName(id: string): string {
  return `reserved_${id}`;
}

function mustColumn(column: Float64Array | undefined): Float64Array {
  if (column === undefined) throw new RangeError("Kit order resource column is missing.");
  return column;
}
