import type { EntityRef } from "../entity/ids.js";
import { ShipState } from "../ships/ships.js";
import type { StageOneWorld } from "../world/state.js";

import { FleetOrder } from "./orders.js";

export type RallyResult = "joined" | "enRoute" | "invalid";

/** Assigns a newly completed ship to its formation's rally point. */
export function rallyShip(world: StageOneWorld, fleet: EntityRef, ship: EntityRef): RallyResult {
  if (!world.fleets.isAlive(fleet) || !world.ships.isAlive(ship)) return "invalid";
  if ((world.fleets.owner[fleet.index] ?? -1) !== (world.ships.faction[ship.index] ?? -2)) {
    return "invalid";
  }
  const rally = world.fleets.rallySystem[fleet.index] ?? -1;
  if ((world.ships.currentSystem[ship.index] ?? -2) !== rally) {
    world.ships.toSystem[ship.index] = rally;
    world.fleets.order[fleet.index] = FleetOrder.Rally;
    return "enRoute";
  }
  world.ships.state[ship.index] = ShipState.Idle;
  return world.fleets.addShip(fleet, ship, world.ships) ? "joined" : "invalid";
}
