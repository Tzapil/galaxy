import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData, StageOneHull } from "../stage-one/data.js";
import { StageOneLogKind } from "../events/log.js";
import { BuildingState } from "../econ/buildings.js";
import type { StageOneWorld } from "../world/state.js";

import { bestDesign } from "./autodesign/best-hull.js";
import { Blueprints } from "./blueprint.js";
import { calculateDesignStats, type ShipDesign } from "./design-stats.js";
import { blueprintComponentRequirements, KitOrderState } from "./kit-order.js";
import { ShipRole } from "./ships.js";

export const enum ShipyardOrderState {
  Inactive = 0,
  GatheringKit = 1,
  Building = 2,
  Complete = 3,
  Cancelled = 4
}

export type ShipyardOrderColumn =
  | "faction"
  | "body"
  | "blueprint"
  | "kitOrder"
  | "state"
  | "createdTick"
  | "startedTick"
  | "finishTick";

export interface ShipyardQueueResult {
  readonly ok: boolean;
  readonly order: number;
  readonly reason:
    "queued" | "noShipyard" | "foreignBody" | "invalidBlueprint" | "missingComponents";
  readonly missingResource: number;
}

export class ShipyardOrders {
  public faction: Uint16Array;
  public body: Uint32Array;
  public blueprint: Int32Array;
  public kitOrder: Int32Array;
  public state: Uint8Array;
  public createdTick: Float64Array;
  public startedTick: Float64Array;
  public finishTick: Float64Array;

  public constructor(public readonly arena: SoAArena<ShipyardOrderColumn>) {
    this.faction = new Uint16Array(0);
    this.body = new Uint32Array(0);
    this.blueprint = new Int32Array(0);
    this.kitOrder = new Int32Array(0);
    this.state = new Uint8Array(0);
    this.createdTick = new Float64Array(0);
    this.startedTick = new Float64Array(0);
    this.finishTick = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 32): ShipyardOrders {
    return new ShipyardOrders(
      new SoAArena<ShipyardOrderColumn>(
        "shipyard_orders",
        [
          { name: "faction", kind: "u16" },
          { name: "body", kind: "u32" },
          { name: "blueprint", kind: "i32" },
          { name: "kitOrder", kind: "i32" },
          { name: "state", kind: "u8" },
          { name: "createdTick", kind: "f64" },
          { name: "startedTick", kind: "f64" },
          { name: "finishTick", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): ShipyardOrders {
    return new ShipyardOrders(SoAArena.fromSnapshot(snapshot) as SoAArena<ShipyardOrderColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(
    faction: number,
    body: number,
    blueprint: number,
    kitOrder: number,
    tick: number
  ): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.faction[row] = faction;
    this.body[row] = body;
    this.blueprint[row] = blueprint;
    this.kitOrder[row] = kitOrder;
    this.state[row] = kitOrder >= 0 ? ShipyardOrderState.GatheringKit : ShipyardOrderState.Building;
    this.createdTick[row] = tick;
    this.startedTick[row] = kitOrder >= 0 ? -1 : tick;
    this.finishTick[row] = -1;
    return row;
  }

  private refreshColumns(): void {
    this.faction = this.arena.column("faction") as Uint16Array;
    this.body = this.arena.column("body") as Uint32Array;
    this.blueprint = this.arena.column("blueprint") as Int32Array;
    this.kitOrder = this.arena.column("kitOrder") as Int32Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.createdTick = this.arena.column("createdTick") as Float64Array;
    this.startedTick = this.arena.column("startedTick") as Float64Array;
    this.finishTick = this.arena.column("finishTick") as Float64Array;
  }
}

export function queueShipBuild(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  body: number,
  blueprint: number,
  tick: number,
  useKitOrder = true
): ShipyardQueueResult {
  if (!blueprintIsValidForFaction(world.blueprints, faction, blueprint)) {
    return { ok: false, order: -1, reason: "invalidBlueprint", missingResource: -1 };
  }
  if ((world.bodies.owner[body] ?? -1) !== faction) {
    return { ok: false, order: -1, reason: "foreignBody", missingResource: -1 };
  }
  if (!hasOwnedShipyard(data, world, faction, body)) {
    return { ok: false, order: -1, reason: "noShipyard", missingResource: -1 };
  }
  const kitOrder = useKitOrder ? world.kitOrders.addForBlueprint(world, blueprint, body, tick) : -1;
  if (!useKitOrder) {
    const missing = tryConsumeBlueprintComponents(data, world, blueprint, body);
    if (missing >= 0) {
      return { ok: false, order: -1, reason: "missingComponents", missingResource: missing };
    }
  }
  const order = world.shipyardOrders.add(faction, body, blueprint, kitOrder, tick);
  if (!useKitOrder) startShipyardBuild(world, order, tick);
  world.eventLog.append(
    tick,
    StageOneLogKind.ShipyardOrderQueued,
    world.bodies.system[body] ?? -1,
    body,
    order,
    blueprint,
    kitOrder
  );
  return { ok: true, order, reason: "queued", missingResource: -1 };
}

export function advanceShipyards(
  data: StageOneData,
  world: StageOneWorld,
  tick: number
): { readonly started: number; readonly completed: number } {
  world.kitOrders.advance(world, tick);
  let started = 0;
  let completed = 0;
  for (let order = 0; order < world.shipyardOrders.length; order += 1) {
    const state = world.shipyardOrders.state[order] ?? ShipyardOrderState.Inactive;
    if (state === ShipyardOrderState.GatheringKit) {
      const kitOrder = world.shipyardOrders.kitOrder[order] ?? -1;
      if (kitOrder >= 0 && world.kitOrders.state[kitOrder] === KitOrderState.Ready) {
        startShipyardBuild(world, order, tick);
        started += 1;
      }
    } else if (
      state === ShipyardOrderState.Building &&
      tick + 1e-9 >= (world.shipyardOrders.finishTick[order] ?? Number.POSITIVE_INFINITY)
    ) {
      completeShipyardBuild(data, world, order, tick);
      completed += 1;
    }
  }
  return { started, completed };
}

export function refreshFactionBlueprints(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tick: number,
  budget = 60_000
): readonly number[] {
  const created: number[] = [];
  for (let doctrine = 0; doctrine < data.doctrines.length; doctrine += 1) {
    const definition = data.doctrines[doctrine];
    if (definition === undefined) throw new RangeError("Doctrine table is inconsistent.");
    const design = bestDesign(data, definition, {
      budget,
      faction,
      modifiers: world.techModifiers,
      techState: world.techState
    });
    if (design === undefined) continue;
    const latest = world.blueprints.latestFor(faction, doctrine);
    if (latest >= 0 && sameBlueprintDesign(world.blueprints.design(latest), design.design)) {
      continue;
    }
    const blueprint = world.blueprints.addFromDesign(data, faction, doctrine, design, tick);
    world.eventLog.append(
      tick,
      StageOneLogKind.BlueprintCreated,
      world.factions.capitalSystem[faction] ?? -1,
      world.factions.capitalBody[faction] ?? -1,
      faction,
      blueprint,
      design.score
    );
    created.push(blueprint);
  }
  return created;
}

export function hasOwnedShipyard(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  body: number
): boolean {
  if ((world.bodies.owner[body] ?? -1) !== faction) return false;
  const shipyard = data.buildingIndex.get("shipyard") ?? -1;
  if (shipyard < 0) return false;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (
      world.buildings.type[building] === shipyard &&
      world.buildings.state[building] !== BuildingState.Demolished
    ) {
      return true;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return false;
}

function startShipyardBuild(world: StageOneWorld, order: number, tick: number): void {
  const faction = world.shipyardOrders.faction[order] ?? 0;
  const blueprint = world.shipyardOrders.blueprint[order] ?? -1;
  const body = world.shipyardOrders.body[order] ?? -1;
  const baseDays = world.blueprints.buildDays[blueprint] ?? 1;
  const multiplier = world.techModifiers.globalMultiplier(faction, "shipBuildTime");
  const finishTick = tick + Math.max(1, Math.ceil(baseDays * multiplier));
  world.shipyardOrders.state[order] = ShipyardOrderState.Building;
  world.shipyardOrders.startedTick[order] = tick;
  world.shipyardOrders.finishTick[order] = finishTick;
  world.eventLog.append(
    tick,
    StageOneLogKind.ShipyardBuildStarted,
    body >= 0 ? (world.bodies.system[body] ?? -1) : -1,
    body,
    order,
    blueprint,
    finishTick - tick
  );
}

function completeShipyardBuild(
  data: StageOneData,
  world: StageOneWorld,
  order: number,
  tick: number
): void {
  const blueprint = world.shipyardOrders.blueprint[order] ?? -1;
  const body = world.shipyardOrders.body[order] ?? -1;
  const faction = world.shipyardOrders.faction[order] ?? -1;
  const hull = data.hulls[world.blueprints.hull[blueprint] ?? -1];
  if (hull === undefined || body < 0 || faction < 0) return;
  const kitOrder = world.shipyardOrders.kitOrder[order] ?? -1;
  if (kitOrder >= 0) world.kitOrders.complete(kitOrder);
  const design = world.blueprints.design(blueprint);
  const stats = calculateDesignStats(data, design, world.techModifiers, faction);
  const fuelCapacity = Math.max(hull.baseFuel, stats.fuelCap);
  world.addShip(
    faction,
    world.bodies.system[body] ?? 0,
    roleForHull(hull),
    Math.max(0, stats.cargo),
    fuelCapacity,
    fuelPerJumpForHull(fuelCapacity, hull),
    blueprint
  );
  world.shipyardOrders.state[order] = ShipyardOrderState.Complete;
  world.eventLog.append(
    tick,
    StageOneLogKind.ShipyardBuildComplete,
    world.bodies.system[body] ?? -1,
    body,
    order,
    blueprint,
    1
  );
}

function blueprintIsValidForFaction(
  blueprints: Blueprints,
  faction: number,
  blueprint: number
): boolean {
  return (
    blueprint >= 0 &&
    blueprint < blueprints.length &&
    (blueprints.faction[blueprint] ?? -1) === faction
  );
}

function tryConsumeBlueprintComponents(
  data: StageOneData,
  world: StageOneWorld,
  blueprint: number,
  body: number
): number {
  const stockpile = world.bodies.stockpile[body] ?? -1;
  if (stockpile < 0) return 0;
  const requirements = blueprintComponentRequirements(data, world.blueprints, blueprint);
  const missing = world.stockpiles.canReserveAll(stockpile, requirements);
  if (missing >= 0) return missing;
  for (let i = 0; i < requirements.length; i += 1) {
    const item = requirements[i];
    if (item === undefined) throw new RangeError("Blueprint component list is inconsistent.");
    if (!world.stockpiles.remove(stockpile, item.resource, item.amount)) {
      throw new RangeError("Blueprint component reservation changed while applying it.");
    }
  }
  return -1;
}

function sameBlueprintDesign(left: ShipDesign, right: ShipDesign): boolean {
  if (left.hull !== right.hull || left.modules.length !== right.modules.length) return false;
  for (let i = 0; i < left.modules.length; i += 1) {
    if ((left.modules[i] ?? -1) !== (right.modules[i] ?? -2)) return false;
  }
  return true;
}

function roleForHull(hull: StageOneHull): ShipRole {
  if (hull.shipClass === "warship") return ShipRole.Warship;
  if (hull.id.includes("prospector")) return ShipRole.Miner;
  if (hull.id.includes("shuttle")) return ShipRole.Scout;
  if (hull.id.includes("colony")) return ShipRole.Colonizer;
  return ShipRole.Hauler;
}

function fuelPerJumpForHull(fuelCapacity: number, hull: StageOneHull): number {
  if (hull.shipClass === "warship") return Math.max(6, fuelCapacity / 12);
  if (hull.shipClass === "civilian") return Math.max(5, fuelCapacity / 22);
  return Math.max(4, fuelCapacity / 26);
}
