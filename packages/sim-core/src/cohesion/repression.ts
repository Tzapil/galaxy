import { BuildingState } from "../econ/buildings.js";
import type { StageOneWorld } from "../world/state.js";

export const MAX_HIDDEN_HATRED = 100;

export interface RepressionEffect {
  readonly garrisons: number;
  readonly immediateRelief: number;
  readonly hiddenHatred: number;
  readonly releasedHatred: number;
}

/** Garrisons suppress current tension cheaply while banking a bounded delayed backlash. */
export function advanceRepression(
  world: StageOneWorld,
  faction: number,
  region: number,
  years = 1
): RepressionEffect {
  const row = world.cohesion.row(faction, region, true);
  const garrisons = countGarrisons(world, faction, region);
  if (garrisons > 0) {
    world.cohesion.hiddenHatred[row] = clamp(
      (world.cohesion.hiddenHatred[row] ?? 0) + garrisons * 0.8 * Math.max(0, years),
      0,
      MAX_HIDDEN_HATRED
    );
    world.cohesion.releasedHatred[row] = Math.max(
      0,
      (world.cohesion.releasedHatred[row] ?? 0) - 0.5 * years
    );
  } else {
    const hidden = world.cohesion.hiddenHatred[row] ?? 0;
    const released = Math.min(hidden, Math.max(0.5, hidden * 0.3));
    world.cohesion.hiddenHatred[row] = Math.max(0, hidden - released);
    world.cohesion.releasedHatred[row] = clamp(
      (world.cohesion.releasedHatred[row] ?? 0) + released,
      0,
      MAX_HIDDEN_HATRED
    );
  }
  return {
    garrisons,
    immediateRelief: Math.min(12, garrisons * 3),
    hiddenHatred: world.cohesion.hiddenHatred[row] ?? 0,
    releasedHatred: world.cohesion.releasedHatred[row] ?? 0
  };
}

function countGarrisons(world: StageOneWorld, faction: number, region: number): number {
  let count = 0;
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] === BuildingState.Demolished) continue;
    if (world.data.buildings[world.buildings.type[building] ?? -1]?.id !== "garrison") continue;
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const system = world.bodies.system[body] ?? -1;
    if ((world.systems.region[system] ?? -1) === region) count += 1;
  }
  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
