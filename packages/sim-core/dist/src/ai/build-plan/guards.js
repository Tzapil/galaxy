import { canDemolishByFlow } from "../../build/demolish.js";
import { BuildingState } from "../../econ/buildings.js";
import { hasPowerSource } from "../../econ/placement.js";
export var NeedBranch;
(function (NeedBranch) {
    NeedBranch[NeedBranch["Vital"] = 1] = "Vital";
    NeedBranch[NeedBranch["Comfort"] = 2] = "Comfort";
    NeedBranch[NeedBranch["Industrial"] = 3] = "Industrial";
})(NeedBranch || (NeedBranch = {}));
// D8: vital and comfort needs are separate branches; comfort must not block housing.
export function guardVitalVsComfort(data, resource) {
    if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) <= 0)
        return NeedBranch.Industrial;
    return data.populationNeeds.comfortOnly[resource] === 1 ? NeedBranch.Comfort : NeedBranch.Vital;
}
// D5: housing cannot consume the colony's entire slot economy.
export function guardHousingCap(data, world, body, plannedHousing = 0) {
    const housing = data.buildingIndex.get("housing") ?? -1;
    const arcology = data.buildingIndex.get("arcology") ?? -1;
    let housingSlots = plannedHousing;
    let building = world.bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
        const type = world.buildings.type[building] ?? -1;
        if (world.buildings.state[building] !== BuildingState.Demolished &&
            (type === housing || type === arcology)) {
            housingSlots += world.buildings.slots[building] ?? 0;
        }
        building = world.buildings.nextInBody[building] ?? -1;
    }
    const limit = Math.max(1, Math.ceil((world.bodies.slots[body] ?? 0) * 0.3));
    return housingSlots <= limit;
}
// D6: if stock covers the demand horizon, do not expand that resource chain.
export function guardStockHorizon(world, faction, resource, demandPerDay, horizonDays = 90) {
    if (demandPerDay <= 0)
        return false;
    let stock = 0;
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        stock += world.stockpiles.get(world.bodies.stockpile[body] ?? 0, resource);
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return stock / demandPerDay <= horizonDays;
}
// D7: demolition eligibility is flow-based, not local surplus based.
export function guardDemolishByFlow(data, world, building) {
    return canDemolishByFlow(data, world, building);
}
// D2: powered production needs an existing source or one explicitly present in the same plan.
export function guardPowerAvailable(data, world, body, buildingType, plannedPower = false) {
    if (data.buildings[buildingType]?.powerSource === true)
        return true;
    if (plannedPower)
        return true;
    return hasPowerSource(data, world, body);
}
// D10: biomass has a weaker but placeable alternative when habitable farmland is unavailable.
export function guardAlternativeProducer(data, world, faction, resource, preferredBuildingType) {
    const biomass = data.resourceIndex.get("biomass") ?? -1;
    if (resource !== biomass)
        return preferredBuildingType;
    if (ownedPlaceableBodyExists(data, world, faction, preferredBuildingType)) {
        return preferredBuildingType;
    }
    return data.buildingIndex.get("hydroponics_bay") ?? preferredBuildingType;
}
function ownedPlaceableBodyExists(data, world, faction, buildingType) {
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        const def = data.buildings[buildingType];
        if (def !== undefined &&
            (world.bodies.usedSlots[body] ?? 0) + def.slots <= (world.bodies.slots[body] ?? 0) &&
            world.bodies.hasFeatureMask(body, def.requiredFeatureMask)) {
            return true;
        }
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return false;
}
//# sourceMappingURL=guards.js.map