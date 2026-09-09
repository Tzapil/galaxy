import { EventKind } from "../events/kinds.js";
import { StageOneLogKind } from "../events/log.js";
import { repeatableCostAtLevel } from "../tech/repeatable.js";
import { BuildingState } from "./buildings.js";
import { hasWorkersForBuilding } from "../pop/workforce.js";
export { processContinuousBuildings } from "./continuous.js";
export function tryStartBatch(data, world, queue, building, tick) {
    const buildings = world.buildings;
    if (buildings.state[building] === BuildingState.Working)
        return false;
    if (buildings.state[building] === BuildingState.UnderConstruction ||
        buildings.state[building] === BuildingState.Demolished) {
        return false;
    }
    const recipeIndex = buildings.batchRecipe[building] ?? -1;
    if (recipeIndex < 0)
        return false;
    if (!hasWorkersForBuilding(world.bodies, buildings, building))
        return false;
    const recipe = data.batchRecipes[recipeIndex];
    if (recipe === undefined)
        throw new RangeError("Batch recipe index is invalid.");
    const body = buildings.body[building] ?? 0;
    const faction = world.bodies.owner[body] ?? -1;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const noSpace = firstOutputWithoutSpace(data, world, stockpile, faction, recipeIndex, recipe.outputs);
    if (noSpace >= 0) {
        // Spec 5.4: a full store blocks the next batch explicitly. If an already
        // completed output races with an incoming shipment, capacity clamps it and the log records accepted output.
        buildings.setIdleStorageFull(building, noSpace);
        if ((buildings.finishTick[building] ?? -1) <= tick) {
            buildings.finishTick[building] = tick + 1;
            queue.schedule(tick + 1, EventKind.ProductionRetry, building);
        }
        return false;
    }
    const missing = reserveInputs(data, world, stockpile, faction, recipeIndex, recipe.inputs);
    if (missing >= 0) {
        buildings.setIdleMissing(building, missing, data.energyResource);
        world.eventLog.append(tick, StageOneLogKind.MissingInput, world.bodies.system[body] ?? -1, body, building, missing, 0);
        return false;
    }
    const finishTick = tick +
        (faction >= 0
            ? world.techModifiers.effectiveDurationTicks(data, faction, recipeIndex)
            : recipe.durationTicks);
    buildings.setWorking(building, tick, finishTick);
    queue.schedule(finishTick, EventKind.BatchComplete, building);
    return true;
}
export function handleBatchComplete(data, world, queue, building, tick) {
    if (world.buildings.state[building] === BuildingState.Demolished)
        return;
    const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
    if (recipeIndex < 0)
        return;
    const recipe = data.batchRecipes[recipeIndex];
    if (recipe === undefined)
        throw new RangeError("Batch recipe index is invalid.");
    const body = world.buildings.body[building] ?? 0;
    const faction = world.bodies.owner[body] ?? -1;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    for (let i = 0; i < recipe.outputs.length; i += 1) {
        const output = recipe.outputs[i];
        if (output === undefined)
            throw new RangeError("Batch output is inconsistent.");
        const amount = faction >= 0
            ? world.techModifiers.effectiveOutputAmount(data, faction, recipeIndex, output)
            : output.amount;
        const lost = world.stockpiles.addClamped(stockpile, output.resource, amount);
        world.eventLog.append(tick, StageOneLogKind.BatchComplete, world.bodies.system[body] ?? -1, body, building, output.resource, amount - lost);
    }
    world.buildings.state[building] = BuildingState.IdleMissingInput;
    world.buildings.stateResource[building] = -1;
    tryStartIdleBuildingsOnBody(data, world, queue, body, tick);
}
export function tryStartIdleBuildingsOnBody(data, world, queue, body, tick) {
    startIdleBuildingsPass(data, world, queue, body, tick, true);
    startIdleBuildingsPass(data, world, queue, body, tick, false);
}
function startIdleBuildingsPass(data, world, queue, body, tick, researchPriorityOnly) {
    let building = world.bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
        const state = world.buildings.state[building] ?? BuildingState.UnderConstruction;
        if (state === BuildingState.IdleMissingInput ||
            state === BuildingState.IdleNoPower ||
            state === BuildingState.IdleStorageFull ||
            state === BuildingState.IdleNoWorkers) {
            const priority = isResearchPriorityBuilding(data, world, body, building);
            if (priority === researchPriorityOnly)
                tryStartBatch(data, world, queue, building, tick);
        }
        building = world.buildings.nextInBody[building] ?? -1;
    }
}
export function bootProduction(data, world, queue, tick) {
    for (let body = 0; body < world.bodies.length; body += 1) {
        if ((world.bodies.owner[body] ?? -1) >= 0) {
            tryStartIdleBuildingsOnBody(data, world, queue, body, tick);
        }
    }
}
export function detectAndBreakProductionDeadlocks(data, world, queue, tick) {
    for (let a = 0; a < world.buildings.length; a += 1) {
        if (world.buildings.state[a] !== BuildingState.IdleMissingInput)
            continue;
        const missingA = world.buildings.stateResource[a] ?? -1;
        const recipeA = recipeFor(data, world.buildings, a);
        if (recipeA < 0)
            continue;
        for (let b = a + 1; b < world.buildings.length; b += 1) {
            if (world.buildings.state[b] !== BuildingState.IdleMissingInput)
                continue;
            const missingB = world.buildings.stateResource[b] ?? -1;
            const recipeB = recipeFor(data, world.buildings, b);
            if (recipeB < 0)
                continue;
            if (produces(data, recipeA, missingB) && produces(data, recipeB, missingA)) {
                injectMissingInput(data, world, a, missingA);
                world.eventLog.append(tick, StageOneLogKind.DeadlockBroken, world.bodies.system[world.buildings.body[a] ?? 0] ?? -1, world.buildings.body[a] ?? 0, a, missingA, 1);
                tryStartBatch(data, world, queue, a, tick);
                return 1;
            }
        }
    }
    return 0;
}
function reserveInputs(data, world, stockpile, faction, recipeIndex, inputs) {
    for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        if (input === undefined)
            throw new RangeError("Recipe input is inconsistent.");
        const amount = faction >= 0
            ? world.techModifiers.effectiveInputAmount(input, faction, recipeIndex)
            : input.amount;
        if (!world.stockpiles.hasAtLeast(stockpile, input.resource, amount))
            return input.resource;
    }
    for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        if (input === undefined)
            throw new RangeError("Recipe input is inconsistent.");
        const amount = faction >= 0
            ? world.techModifiers.effectiveInputAmount(input, faction, recipeIndex)
            : input.amount;
        if (!world.stockpiles.remove(stockpile, input.resource, amount)) {
            throw new RangeError("Whole-batch reservation changed while applying it.");
        }
    }
    void data;
    return -1;
}
function firstOutputWithoutSpace(data, world, stockpile, faction, recipeIndex, outputs) {
    for (let i = 0; i < outputs.length; i += 1) {
        const output = outputs[i];
        if (output === undefined)
            throw new RangeError("Recipe output is inconsistent.");
        const amount = faction >= 0
            ? world.techModifiers.effectiveOutputAmount(data, faction, recipeIndex, output)
            : output.amount;
        if (!world.stockpiles.canFit(stockpile, output.resource, amount))
            return output.resource;
    }
    return -1;
}
function isResearchPriorityBuilding(data, world, body, building) {
    const faction = world.bodies.owner[body] ?? -1;
    if (faction < 0 || (world.factions.capitalBody[faction] ?? -1) !== body)
        return false;
    const current = world.techState.currentTech[faction] ?? -1;
    const tech = data.techs[current];
    if (tech === undefined)
        return false;
    const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
    const recipe = data.batchRecipes[recipeIndex];
    if (recipe === undefined)
        return false;
    const cost = repeatableCostAtLevel(tech, world.techState.level(current, faction) + 1);
    for (let i = 0; i < recipe.outputs.length; i += 1) {
        const resourceId = data.resources[recipe.outputs[i]?.resource ?? -1]?.id;
        if (resourceId === "data_physics" &&
            (world.techState.progressPhysics[faction] ?? 0) + 1e-9 < cost.physics) {
            return true;
        }
        if (resourceId === "data_engineering" &&
            (world.techState.progressEngineering[faction] ?? 0) + 1e-9 < cost.engineering) {
            return true;
        }
        if (resourceId === "data_bio" &&
            (world.techState.progressBio[faction] ?? 0) + 1e-9 < cost.bio) {
            return true;
        }
    }
    return false;
}
function recipeFor(data, buildings, building) {
    if (buildings.state[building] === BuildingState.Demolished)
        return -1;
    const recipeIndex = buildings.batchRecipe[building] ?? -1;
    return recipeIndex >= 0 && recipeIndex < data.batchRecipes.length ? recipeIndex : -1;
}
function produces(data, recipeIndex, resource) {
    if (resource < 0)
        return false;
    const recipe = data.batchRecipes[recipeIndex];
    if (recipe === undefined)
        return false;
    for (let i = 0; i < recipe.outputs.length; i += 1) {
        if ((recipe.outputs[i]?.resource ?? -1) === resource)
            return true;
    }
    return false;
}
function injectMissingInput(data, world, building, resource) {
    const recipe = data.batchRecipes[world.buildings.batchRecipe[building] ?? -1];
    if (recipe === undefined)
        return;
    let amount = 0;
    for (let i = 0; i < recipe.inputs.length; i += 1) {
        const input = recipe.inputs[i];
        if (input?.resource === resource)
            amount = input.amount;
    }
    const body = world.buildings.body[building] ?? 0;
    world.stockpiles.addClamped(world.bodies.stockpile[body] ?? 0, resource, amount);
}
//# sourceMappingURL=batch.js.map