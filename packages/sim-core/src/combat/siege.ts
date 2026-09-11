import type { EntityRef } from "../entity/ids.js";
import type { StageOneWorld } from "../world/state.js";

import { hasOrbitalSuperiority } from "./orbital.js";

/**
 * Siege only cuts logistics. Population consumption, supply EMA, prices and
 * production stalls remain the ordinary economy code (spec 9.8).
 */
export function startSiege(world: StageOneWorld, fleet: EntityRef, body: number): boolean {
  if (!world.fleets.isAlive(fleet)) return false;
  const attacker = world.fleets.owner[fleet.index] ?? -1;
  if (!hasOrbitalSuperiority(world, body, attacker)) return false;
  const system = world.bodies.system[body] ?? -1;
  if ((world.fleets.currentSystem[fleet.index] ?? -2) !== system) return false;
  world.colonyHistory.siegeBy[body] = attacker;
  for (let gate = 0; gate < world.gates.length; gate += 1) {
    if ((world.gates.from[gate] ?? -1) === system || (world.gates.to[gate] ?? -1) === system) {
      world.gates.blockadedBy[gate] = attacker;
    }
  }
  return true;
}

export function endSiege(world: StageOneWorld, body: number): boolean {
  const attacker = world.colonyHistory.siegeBy[body] ?? -1;
  if (attacker < 0) return false;
  const system = world.bodies.system[body] ?? -1;
  for (let gate = 0; gate < world.gates.length; gate += 1) {
    if (
      ((world.gates.from[gate] ?? -1) === system || (world.gates.to[gate] ?? -1) === system) &&
      (world.gates.blockadedBy[gate] ?? -1) === attacker
    ) {
      world.gates.blockadedBy[gate] = -1;
    }
  }
  world.colonyHistory.siegeBy[body] = -1;
  return true;
}
