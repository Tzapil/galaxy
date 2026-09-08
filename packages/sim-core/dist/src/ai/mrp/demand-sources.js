import { calculateCapitalDemandForFaction } from "../../build/capital-demand.js";
export function collectFactionDemandSources(data, world, faction, planned = []) {
    const recipeDemandPerDay = new Float64Array(data.resources.length);
    const populationDemandPerDay = new Float64Array(data.resources.length);
    const capitalDemandPerDay = calculateCapitalDemandForFaction(data, world, faction, planned);
    const fleetDemandPerDay = calculateFleetDemandPerDay(data, world, faction);
    const targets = [];
    addRecipeDemand(data, world, faction, recipeDemandPerDay);
    addPopulationDemand(data, world, faction, populationDemandPerDay);
    addArrayTargets(recipeDemandPerDay, targets);
    addArrayTargets(populationDemandPerDay, targets);
    addArrayTargets(capitalDemandPerDay, targets);
    addArrayTargets(fleetDemandPerDay, targets);
    addFleetProgramTargets(data, targets);
    return {
        recipeDemandPerDay,
        populationDemandPerDay,
        capitalDemandPerDay,
        fleetDemandPerDay,
        targets
    };
}
export function calculateFleetDemandPerDay(data, world, faction) {
    const demand = new Float64Array(data.resources.length);
    const population = factionPopulation(world, faction);
    addById(data, demand, "fuel", 2 + 0.012 * population);
    addById(data, demand, "hull_frames", 0.5);
    addById(data, demand, "thrusters", 0.4);
    addById(data, demand, "reactors", 0.25);
    addById(data, demand, "life_support", 0.25);
    return demand;
}
export function demandByColonyShare(world, faction, totalDemandPerDay) {
    const colonyCount = Math.max(1, world.factions.colonyCount[faction] ?? 0);
    const result = [];
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        const share = new Float64Array(totalDemandPerDay.length);
        for (let resource = 0; resource < totalDemandPerDay.length; resource += 1) {
            share[resource] = (totalDemandPerDay[resource] ?? 0) / colonyCount;
        }
        result.push(share);
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return result;
}
function addRecipeDemand(data, world, faction, demand) {
    for (let building = 0; building < world.buildings.length; building += 1) {
        const body = world.buildings.body[building] ?? -1;
        if ((world.bodies.owner[body] ?? -1) !== faction)
            continue;
        const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
        if (recipeIndex < 0)
            continue;
        const recipe = data.batchRecipes[recipeIndex];
        if (recipe === undefined)
            throw new RangeError("Building recipe index is invalid.");
        addBagRate(demand, recipe.inputs, Math.max(1, recipe.durationTicks));
    }
}
function addPopulationDemand(data, world, faction, demand) {
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        const population = world.bodies.population[body] ?? 0;
        for (let resource = 0; resource < data.resources.length; resource += 1) {
            const perThousand = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
            demand[resource] = (demand[resource] ?? 0) + population * perThousand;
        }
        body = world.bodies.nextInFaction[body] ?? -1;
    }
}
function addFleetProgramTargets(data, targets) {
    const cruiser = data.hullIndex.get("cruiser");
    const fallback = data.hullIndex.get("corvette");
    const hull = cruiser ?? fallback;
    if (hull === undefined)
        return;
    targets.push({ kind: "hull", hull, count: 20, horizonDays: 365 });
}
function addArrayTargets(demand, targets) {
    for (let resource = 0; resource < demand.length; resource += 1) {
        const amountPerDay = demand[resource] ?? 0;
        if (amountPerDay > 0)
            targets.push({ kind: "resource", resource, amountPerDay });
    }
}
function addBagRate(demand, bag, durationTicks) {
    for (let i = 0; i < bag.length; i += 1) {
        const item = bag[i];
        if (item === undefined)
            throw new RangeError("Resource bag is inconsistent.");
        demand[item.resource] = (demand[item.resource] ?? 0) + item.amount / durationTicks;
    }
}
function factionPopulation(world, faction) {
    let population = 0;
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        population += world.bodies.population[body] ?? 0;
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return population;
}
function addById(data, demand, id, amount) {
    const resource = data.resourceIndex.get(id);
    if (resource !== undefined)
        demand[resource] = (demand[resource] ?? 0) + amount;
}
//# sourceMappingURL=demand-sources.js.map