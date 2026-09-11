import { BuildingState } from "../econ/buildings.js";
import type { StageOneWorld } from "../world/state.js";

/** Finds a built regional-capital building and updates the persistent distance origin. */
export function refreshRegionalCapital(
  world: StageOneWorld,
  faction: number,
  region: number
): number {
  const row = world.cohesion.row(faction, region, true);
  let bestSystem = -1;
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] === BuildingState.Demolished) continue;
    const type = world.buildings.type[building] ?? -1;
    if (world.data.buildings[type]?.id !== "regional_capital") continue;
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const system = world.bodies.system[body] ?? -1;
    if ((world.systems.region[system] ?? -1) !== region) continue;
    if (bestSystem < 0 || system < bestSystem) bestSystem = system;
  }
  world.cohesion.regionalCapitalSystem[row] = bestSystem;
  return bestSystem;
}

export function regionalDistanceOrigin(
  world: StageOneWorld,
  faction: number,
  region: number
): number {
  const regional = refreshRegionalCapital(world, faction, region);
  return regional >= 0 ? regional : (world.factions.capitalSystem[faction] ?? -1);
}
