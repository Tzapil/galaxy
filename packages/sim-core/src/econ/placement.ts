import { BuildingState } from "./buildings.js";
import { bodyTypePlacementMask, type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export type PlacementFailureReason =
  "noFreeSlots" | "wrongBodyType" | "missingDeposit" | "noPowerSource";

export interface PlacementResult {
  readonly ok: boolean;
  readonly reason?: PlacementFailureReason;
}

export function validatePlacement(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): PlacementResult {
  const def = data.buildings[buildingType];
  if (def === undefined) throw new RangeError("Unknown building type.");
  if ((world.bodies.usedSlots[body] ?? 0) + def.slots > (world.bodies.slots[body] ?? 0)) {
    return { ok: false, reason: "noFreeSlots" };
  }
  const bodyMask = bodyTypePlacementMask(world.bodies.type[body] ?? 0);
  if ((def.placementMask & bodyMask) === 0) return { ok: false, reason: "wrongBodyType" };
  if (!world.bodies.hasFeatureMask(body, def.requiredFeatureMask)) {
    return { ok: false, reason: "missingDeposit" };
  }
  if (
    requiresLocalPower(data, def.batchRecipe, def.continuousProcess) &&
    !hasPowerSource(data, world, body, buildingType)
  ) {
    return { ok: false, reason: "noPowerSource" };
  }
  return { ok: true };
}

export function hasPowerSource(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingTypeInPlan = -1
): boolean {
  if (buildingTypeInPlan >= 0 && data.buildings[buildingTypeInPlan]?.powerSource === true)
    return true;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const state = world.buildings.state[building] ?? BuildingState.Demolished;
    const type = world.buildings.type[building] ?? -1;
    if (state !== BuildingState.Demolished && data.buildings[type]?.powerSource === true) {
      return true;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return false;
}

function requiresLocalPower(
  data: StageOneData,
  batchRecipe: number,
  continuousProcess: number
): boolean {
  if (continuousProcess >= 0)
    return (
      data.continuous[continuousProcess]?.outputsPerTick.some(
        (out) => out.resource === data.energyResource
      ) !== true
    );
  if (batchRecipe < 0) return false;
  const recipe = data.batchRecipes[batchRecipe];
  if (recipe === undefined) return false;
  for (let i = 0; i < recipe.inputs.length; i += 1) {
    if ((recipe.inputs[i]?.resource ?? -1) === data.energyResource) return true;
  }
  return false;
}
