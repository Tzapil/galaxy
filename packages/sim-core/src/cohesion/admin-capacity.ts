import { BuildingState } from "../econ/buildings.js";
import type { StageOneWorld } from "../world/state.js";

export const MAX_ADMINISTRATIVE_CAPACITY = 10_000;

export interface AdministrativeCapacityBreakdown {
  readonly technologyLevels: number;
  readonly buildingBonus: number;
  readonly personalityMultiplier: number;
  readonly total: number;
}

/** Strong but slow growth: 8 early, tens in midgame, 200+ after repeatables (spec 11.6). */
export function administrativeCapacity(
  world: StageOneWorld,
  faction: number
): AdministrativeCapacityBreakdown {
  let technologyLevels = 0;
  for (let tech = 0; tech < world.data.techs.length; tech += 1) {
    if (world.data.techs[tech]?.branch !== "administration") continue;
    technologyLevels += world.techState.level(tech, faction);
  }
  let buildingBonus = 0;
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] === BuildingState.Demolished) continue;
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const id = world.data.buildings[world.buildings.type[building] ?? -1]?.id;
    if (id === "admin_center") buildingBonus += 2;
    else if (id === "comm_hub") buildingBonus += 1;
    else if (id === "garrison") buildingBonus += 0.5;
  }
  const expansion = world.factions.characterExpansion[faction] ?? 1;
  const industry = world.factions.characterIndustry[faction] ?? 1;
  const personalityMultiplier = clamp(
    0.8 + industry * 0.2 - Math.max(0, expansion - 1) * 0.1,
    0.65,
    1.4
  );
  const total = clamp(
    (8 + technologyLevels * 9 + buildingBonus) * personalityMultiplier,
    0,
    MAX_ADMINISTRATIVE_CAPACITY
  );
  return { technologyLevels, buildingBonus, personalityMultiplier, total };
}

export function administrativeCapacityEra(total: number): "early" | "middle" | "late" {
  if (total >= 200) return "late";
  if (total >= 40) return "middle";
  return "early";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
