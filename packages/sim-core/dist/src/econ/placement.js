import { BuildingState } from "./buildings.js";
import { bodyTypePlacementMask } from "../stage-one/data.js";
export function validatePlacement(data, world, body, buildingType) {
    const def = data.buildings[buildingType];
    if (def === undefined)
        throw new RangeError("Unknown building type.");
    if ((world.bodies.usedSlots[body] ?? 0) + def.slots > (world.bodies.slots[body] ?? 0)) {
        return { ok: false, reason: "noFreeSlots" };
    }
    const bodyMask = bodyTypePlacementMask(world.bodies.type[body] ?? 0);
    if ((def.placementMask & bodyMask) === 0)
        return { ok: false, reason: "wrongBodyType" };
    if (!world.bodies.hasFeatureMask(body, def.requiredFeatureMask)) {
        return { ok: false, reason: "missingDeposit" };
    }
    if (requiresLocalPower(data, def.batchRecipe, def.continuousProcess) && !hasPowerSource(data, world, body, buildingType)) {
        return { ok: false, reason: "noPowerSource" };
    }
    return { ok: true };
}
export function hasPowerSource(data, world, body, buildingTypeInPlan = -1) {
    if (buildingTypeInPlan >= 0 && data.buildings[buildingTypeInPlan]?.powerSource === true)
        return true;
    let building = world.bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
        const state = world.buildings.state[building] ?? BuildingState.Demolished;
        const type = world.buildings.type[building] ?? -1;
        if (state !== BuildingState.Demolished &&
            data.buildings[type]?.powerSource === true) {
            return true;
        }
        building = world.buildings.nextInBody[building] ?? -1;
    }
    return false;
}
function requiresLocalPower(data, batchRecipe, continuousProcess) {
    if (continuousProcess >= 0)
        return data.continuous[continuousProcess]?.outputsPerTick.some((out) => out.resource === data.energyResource) !== true;
    if (batchRecipe < 0)
        return false;
    const recipe = data.batchRecipes[batchRecipe];
    if (recipe === undefined)
        return false;
    for (let i = 0; i < recipe.inputs.length; i += 1) {
        if ((recipe.inputs[i]?.resource ?? -1) === data.energyResource)
            return true;
    }
    return false;
}
//# sourceMappingURL=placement.js.map