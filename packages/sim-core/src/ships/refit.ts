import { StageOneLogKind } from "../events/log.js";
import type { ResourceAmount, StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

import { calculateDesignStats } from "./design-stats.js";
import { blueprintComponentRequirements } from "./kit-order.js";
import { ShipState } from "./ships.js";
import { hasOwnedShipyard } from "./shipyard.js";

export const REFIT_COST_FRACTION = 0.4;

export interface RefitCheck {
  readonly ok: boolean;
  readonly shipyardBody: number;
  readonly missingResource: number;
  readonly reason: "ok" | "shipInTransit" | "foreignBlueprint" | "noShipyard" | "missingComponents";
}

export function refitCost(
  data: StageOneData,
  world: StageOneWorld,
  targetBlueprint: number
): readonly ResourceAmount[] {
  const requirements = blueprintComponentRequirements(data, world.blueprints, targetBlueprint);
  const scaled: ResourceAmount[] = [];
  for (let i = 0; i < requirements.length; i += 1) {
    const item = requirements[i];
    if (item === undefined) throw new RangeError("Refit requirement list is inconsistent.");
    scaled.push({ resource: item.resource, amount: item.amount * REFIT_COST_FRACTION });
  }
  return scaled;
}

export function canRefitShip(
  data: StageOneData,
  world: StageOneWorld,
  ship: number,
  targetBlueprint: number
): RefitCheck {
  if (world.ships.state[ship] !== ShipState.Idle) {
    return {
      ok: false,
      shipyardBody: -1,
      missingResource: -1,
      reason: "shipInTransit"
    };
  }
  const faction = world.ships.faction[ship] ?? -1;
  if (
    targetBlueprint < 0 ||
    targetBlueprint >= world.blueprints.length ||
    (world.blueprints.faction[targetBlueprint] ?? -2) !== faction
  ) {
    return {
      ok: false,
      shipyardBody: -1,
      missingResource: -1,
      reason: "foreignBlueprint"
    };
  }
  const shipyardBody = findOwnedShipyardInSystem(
    data,
    world,
    faction,
    world.ships.currentSystem[ship] ?? -1
  );
  if (shipyardBody < 0) {
    return {
      ok: false,
      shipyardBody: -1,
      missingResource: -1,
      reason: "noShipyard"
    };
  }
  const stockpile = world.bodies.stockpile[shipyardBody] ?? -1;
  const missingResource = world.stockpiles.canReserveAll(
    stockpile,
    refitCost(data, world, targetBlueprint)
  );
  if (missingResource >= 0) {
    return {
      ok: false,
      shipyardBody,
      missingResource,
      reason: "missingComponents"
    };
  }
  return { ok: true, shipyardBody, missingResource: -1, reason: "ok" };
}

export function refitShipAtShipyard(
  data: StageOneData,
  world: StageOneWorld,
  ship: number,
  targetBlueprint: number,
  tick: number
): RefitCheck {
  const check = canRefitShip(data, world, ship, targetBlueprint);
  if (!check.ok) return check;
  const stockpile = world.bodies.stockpile[check.shipyardBody] ?? -1;
  const cost = refitCost(data, world, targetBlueprint);
  for (let i = 0; i < cost.length; i += 1) {
    const item = cost[i];
    if (item === undefined) throw new RangeError("Refit cost list is inconsistent.");
    if (!world.stockpiles.remove(stockpile, item.resource, item.amount)) {
      throw new RangeError("Refit reservation changed while applying it.");
    }
  }
  world.eventLog.append(
    tick,
    StageOneLogKind.RefitStarted,
    world.ships.currentSystem[ship] ?? -1,
    check.shipyardBody,
    ship,
    targetBlueprint,
    REFIT_COST_FRACTION
  );
  world.ships.blueprint[ship] = targetBlueprint;
  const faction = world.ships.faction[ship] ?? 0;
  const design = world.blueprints.design(targetBlueprint);
  const stats = calculateDesignStats(data, design, world.techModifiers, faction);
  const hull = data.hulls[world.blueprints.hull[targetBlueprint] ?? -1];
  const fuelCapacity = Math.max(hull?.baseFuel ?? 0, stats.fuelCap);
  world.ships.cargoCapacity[ship] = Math.max(0, stats.cargo);
  world.ships.fuelCapacity[ship] = fuelCapacity;
  world.ships.fuelTank[ship] = Math.min(world.ships.fuelTank[ship] ?? 0, fuelCapacity);
  world.eventLog.append(
    tick,
    StageOneLogKind.RefitComplete,
    world.ships.currentSystem[ship] ?? -1,
    check.shipyardBody,
    ship,
    targetBlueprint,
    1
  );
  return check;
}

function findOwnedShipyardInSystem(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  system: number
): number {
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    if (
      (world.bodies.system[body] ?? -1) === system &&
      hasOwnedShipyard(data, world, faction, body)
    ) {
      return body;
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return -1;
}
