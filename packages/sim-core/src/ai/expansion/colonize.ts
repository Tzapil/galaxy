import { foundColony } from "../../bootstrap/found-colony.js";
import type { FoundColonyResult } from "../../bootstrap/found-colony.js";
import { EventKind } from "../../events/kinds.js";
import type { EventQueue } from "../../events/queue.js";
import { fuelNeededForJumps } from "../../ships/fuel.js";
import { ShipRole, ShipState } from "../../ships/ships.js";
import type { RoutePlanner } from "../../nav/route.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
import { logColonization } from "../decision-log.js";

import { bestColonyTarget } from "./colony-score.js";

export const COLONIZER_CREDIT_COST = 400;
export const COLONIZER_HULL_FRAMES = 6;
export const COLONIZER_LIFE_SUPPORT = 8;

export interface ColonizationStep {
  readonly built: boolean;
  readonly launched: boolean;
  readonly targetBody: number;
  readonly score: number;
}

export function runColonization(
  data: StageOneData,
  world: StageOneWorld,
  routes: RoutePlanner,
  queue: EventQueue,
  faction: number,
  tick: number,
  bottleneckResource: number
): ColonizationStep {
  const target = bestColonyTarget(data, world, routes, faction, bottleneckResource);
  if (target.body < 0 || target.score <= 0) {
    return { built: false, launched: false, targetBody: -1, score: 0 };
  }
  const built = buildColonizerIfNeeded(data, world, faction, tick, bottleneckResource);
  const launched = launchIdleColonizer(data, world, routes, queue, faction, target.body, tick);
  if (launched) {
    logColonization(data, world, tick, faction, target.body, bottleneckResource, target.score);
  }
  return { built, launched, targetBody: target.body, score: target.score };
}

export function buildColonizerIfNeeded(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tick: number,
  reasonResource = -1
): boolean {
  if (hasActiveColonizer(world, faction)) return false;
  const capitalBody = world.factions.capitalBody[faction] ?? -1;
  const capitalSystem = world.factions.capitalSystem[faction] ?? -1;
  if (capitalBody < 0 || capitalSystem < 0) return false;
  if ((world.factions.treasury[faction] ?? 0) < COLONIZER_CREDIT_COST) return false;
  const stockpile = world.bodies.stockpile[capitalBody] ?? 0;
  const hullFrames = data.resourceIndex.get("hull_frames") ?? -1;
  const lifeSupport = data.resourceIndex.get("life_support") ?? -1;
  if (hullFrames < 0 || lifeSupport < 0) return false;
  if (!world.stockpiles.hasAtLeast(stockpile, hullFrames, COLONIZER_HULL_FRAMES)) return false;
  if (!world.stockpiles.hasAtLeast(stockpile, lifeSupport, COLONIZER_LIFE_SUPPORT)) return false;
  world.stockpiles.remove(stockpile, hullFrames, COLONIZER_HULL_FRAMES);
  world.stockpiles.remove(stockpile, lifeSupport, COLONIZER_LIFE_SUPPORT);
  world.factions.treasury[faction] =
    (world.factions.treasury[faction] ?? 0) - COLONIZER_CREDIT_COST;
  const ship = world.addShip(faction, capitalSystem, ShipRole.Colonizer, 900, 260, 8);
  logColonization(data, world, tick, faction, capitalBody, reasonResource, ship);
  return true;
}

export function launchIdleColonizer(
  data: StageOneData,
  world: StageOneWorld,
  routes: RoutePlanner,
  queue: EventQueue,
  faction: number,
  targetBody: number,
  tick: number
): boolean {
  const ship = firstIdleColonizer(world, faction);
  if (ship < 0 || targetBody < 0) return false;
  const fromSystem = world.ships.currentSystem[ship] ?? 0;
  const targetSystem = world.bodies.system[targetBody] ?? -1;
  const route = routes.find(world.systems, world.gates, fromSystem, targetSystem);
  if (!route.reachable) return false;
  const fuelNeed = fuelNeededForJumps(world, ship, route.jumps);
  if ((world.ships.fuelTank[ship] ?? 0) + 1e-9 < fuelNeed) return false;
  world.ships.fuelTank[ship] = (world.ships.fuelTank[ship] ?? 0) - fuelNeed;
  world.ships.state[ship] = ShipState.InTransit;
  world.ships.fromSystem[ship] = fromSystem;
  world.ships.toSystem[ship] = targetSystem;
  world.ships.sourceBody[ship] = world.factions.capitalBody[faction] ?? -1;
  world.ships.targetBody[ship] = targetBody;
  world.ships.departTick[ship] = tick;
  world.ships.arriveTick[ship] = tick + route.travelTicks;
  world.ships.cargoResource[ship] = -1;
  world.ships.cargoAmount[ship] = 0;
  queue.schedule(tick + route.travelTicks, EventKind.ShipArrival, ship);
  return true;
}

export function handleColonizerArrival(
  data: StageOneData,
  world: StageOneWorld,
  ship: number,
  tick: number
): boolean {
  if (world.ships.role[ship] !== ShipRole.Colonizer) return false;
  if (world.ships.state[ship] !== ShipState.InTransit) return false;
  const targetBody = world.ships.targetBody[ship] ?? -1;
  const faction = world.ships.faction[ship] ?? -1;
  const result: FoundColonyResult =
    targetBody >= 0 && faction >= 0
      ? foundColony(data, world, faction, targetBody, tick)
      : { ok: false, body: targetBody, buildings: 0, reason: "alreadyOwned" };
  world.ships.currentSystem[ship] =
    world.ships.toSystem[ship] ?? world.ships.currentSystem[ship] ?? 0;
  world.ships.sourceBody[ship] = -1;
  world.ships.targetBody[ship] = -1;
  world.ships.cargoResource[ship] = -1;
  world.ships.cargoAmount[ship] = 0;
  if (result.ok) {
    world.ships.markDisbanded(ship);
    logColonization(data, world, tick, faction, targetBody, -1, result.buildings ?? 0);
    return true;
  }
  world.ships.state[ship] = ShipState.Idle;
  return false;
}

function hasActiveColonizer(world: StageOneWorld, faction: number): boolean {
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if (
      world.ships.faction[ship] === faction &&
      world.ships.role[ship] === ShipRole.Colonizer &&
      world.ships.state[ship] !== ShipState.Disbanded
    ) {
      return true;
    }
  }
  return false;
}

function firstIdleColonizer(world: StageOneWorld, faction: number): number {
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if (
      world.ships.faction[ship] === faction &&
      world.ships.role[ship] === ShipRole.Colonizer &&
      world.ships.state[ship] === ShipState.Idle
    ) {
      return ship;
    }
  }
  return -1;
}
