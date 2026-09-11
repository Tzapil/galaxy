import { BuildingState } from "../econ/buildings.js";
import type { EntityRef } from "../entity/ids.js";
import { fleetCombatStrength } from "../fleet/fleet.js";
import type { StageOneWorld } from "../world/state.js";

export const ORBITAL_DEFENSE_STRENGTH = 600;

export interface OrbitalSuperiorityResult {
  readonly established: boolean;
  readonly attackStrength: number;
  readonly defenseStrength: number;
}

export function establishOrbitalSuperiority(
  world: StageOneWorld,
  fleet: EntityRef,
  body: number
): OrbitalSuperiorityResult {
  if (!world.fleets.isAlive(fleet)) return result(false, 0, 0);
  const attacker = world.fleets.owner[fleet.index] ?? -1;
  const defender = world.bodies.owner[body] ?? -1;
  if (attacker < 0 || defender < 0 || !world.wars.isHostile(attacker, defender)) {
    return result(false, 0, orbitalDefenseStrength(world, body));
  }
  const system = world.bodies.system[body] ?? -1;
  if ((world.fleets.currentSystem[fleet.index] ?? -2) !== system) {
    return result(false, 0, orbitalDefenseStrength(world, body));
  }
  const attackStrength = fleetCombatStrength(world, fleet);
  const defenseStrength = orbitalDefenseStrength(world, body);
  const established = attackStrength > defenseStrength;
  if (established) world.colonyHistory.orbitalController[body] = attacker;
  return result(established, attackStrength, defenseStrength);
}

export function hasOrbitalSuperiority(
  world: StageOneWorld,
  body: number,
  attacker: number
): boolean {
  return (world.colonyHistory.orbitalController[body] ?? -1) === attacker;
}

export function orbitalDefenseStrength(world: StageOneWorld, body: number): number {
  const orbitalDefense = world.data.buildingIndex.get("orbital_defense") ?? -1;
  if (orbitalDefense < 0) return 0;
  let strength = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (
      (world.buildings.type[building] ?? -1) === orbitalDefense &&
      world.buildings.state[building] !== BuildingState.Demolished &&
      world.buildings.state[building] !== BuildingState.UnderConstruction
    ) {
      strength += ORBITAL_DEFENSE_STRENGTH;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return strength;
}

function result(
  established: boolean,
  attackStrength: number,
  defenseStrength: number
): OrbitalSuperiorityResult {
  return { established, attackStrength, defenseStrength };
}
