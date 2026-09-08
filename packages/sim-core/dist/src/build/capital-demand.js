import { BuildingState } from "../econ/buildings.js";
export function calculateCapitalDemand(data, world, planned = []) {
    const demand = new Float64Array(data.resources.length);
    addCapitalDemand(data, world, demand, -1, planned);
    return demand;
}
export function calculateCapitalDemandForFaction(data, world, faction, planned = []) {
    const demand = new Float64Array(data.resources.length);
    addCapitalDemand(data, world, demand, faction, planned);
    return demand;
}
function addCapitalDemand(data, world, demand, faction, planned) {
    for (let building = 0; building < world.buildings.length; building += 1) {
        if (world.buildings.state[building] !== BuildingState.UnderConstruction)
            continue;
        if ((world.buildings.finishTick[building] ?? -1) >= 0)
            continue;
        if (faction >= 0) {
            const body = world.buildings.body[building] ?? -1;
            if ((world.bodies.owner[body] ?? -1) !== faction)
                continue;
        }
        addBag(demand, data.buildings[world.buildings.type[building] ?? 0]?.buildCost ?? [], 1);
    }
    for (let i = 0; i < planned.length; i += 1) {
        const plan = planned[i];
        if (plan === undefined)
            throw new RangeError("Planned construction entry is inconsistent.");
        addBag(demand, data.buildings[plan.buildingType]?.buildCost ?? [], plan.count);
    }
}
function addBag(target, bag, multiplier) {
    for (let i = 0; i < bag.length; i += 1) {
        const item = bag[i];
        if (item === undefined)
            throw new RangeError("Resource bag is inconsistent.");
        target[item.resource] = (target[item.resource] ?? 0) + item.amount * multiplier;
    }
}
//# sourceMappingURL=capital-demand.js.map