import { validatePlacement } from "../econ/placement.js";
import { collectFactionDemandSources } from "./mrp/demand-sources.js";
import { chooseProducer, explodeDemand } from "./mrp/explode.js";
import { calculateFactionSupplyRates } from "./mrp/supply.js";
export const STOCK_RESERVE_HORIZON_DAYS = 90;
export var AiOperationalTaskKind;
(function (AiOperationalTaskKind) {
    AiOperationalTaskKind[AiOperationalTaskKind["BuildProducer"] = 1] = "BuildProducer";
    AiOperationalTaskKind[AiOperationalTaskKind["ColonizeResource"] = 2] = "ColonizeResource";
    AiOperationalTaskKind[AiOperationalTaskKind["ResearchUnlock"] = 3] = "ResearchUnlock";
    AiOperationalTaskKind[AiOperationalTaskKind["Stabilize"] = 4] = "Stabilize";
})(AiOperationalTaskKind || (AiOperationalTaskKind = {}));
export function findBottleneck(data, world, faction, _goal) {
    const sources = collectFactionDemandSources(data, world, faction);
    const explosion = explodeDemand(data, sources.targets);
    const supply = calculateFactionSupplyRates(data, world, faction);
    let best;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let resource = 0; resource < data.resources.length; resource += 1) {
        const demandPerDay = explosion.requiredPerDay[resource] ?? 0;
        if (demandPerDay <= 0.0001)
            continue;
        const supplyPerDay = supply.productionPerDay[resource] ?? 0;
        const deficitPerDay = demandPerDay - supplyPerDay;
        if (deficitPerDay <= 0.0001)
            continue;
        const stockDays = reserveDays(supply.stockpile[resource] ?? 0, demandPerDay);
        if (stockDays > STOCK_RESERVE_HORIZON_DAYS)
            continue;
        const score = bottleneckScore(data, resource, demandPerDay, supplyPerDay, deficitPerDay, stockDays);
        if (score > bestScore + 1e-9) {
            bestScore = score;
            best = {
                resource,
                demandPerDay,
                supplyPerDay,
                deficitPerDay,
                stockDays,
                operations: explosion.operations
            };
        }
    }
    return best;
}
export function toOperationalTask(data, world, faction, bottleneck) {
    if (bottleneck === undefined) {
        return {
            kind: AiOperationalTaskKind.Stabilize,
            faction,
            resource: -1,
            body: world.factions.capitalBody[faction] ?? -1,
            buildingType: -1,
            score: 0
        };
    }
    const producer = chooseProducer(data, bottleneck.resource);
    if (producer === undefined) {
        return {
            kind: AiOperationalTaskKind.ResearchUnlock,
            faction,
            resource: bottleneck.resource,
            body: world.factions.capitalBody[faction] ?? -1,
            buildingType: -1,
            score: bottleneck.deficitPerDay
        };
    }
    const buildingType = data.buildingIndex.get(producer.buildingId) ?? -1;
    const body = bestOwnedBodyForBuilding(data, world, faction, buildingType);
    if (body >= 0) {
        return {
            kind: AiOperationalTaskKind.BuildProducer,
            faction,
            resource: bottleneck.resource,
            body,
            buildingType,
            score: bottleneck.deficitPerDay
        };
    }
    return {
        kind: AiOperationalTaskKind.ColonizeResource,
        faction,
        resource: bottleneck.resource,
        body: bestUnownedBodyForResource(data, world, faction, bottleneck.resource),
        buildingType,
        score: bottleneck.deficitPerDay
    };
}
export function reserveDays(stock, demandPerDay) {
    if (demandPerDay <= 0)
        return Number.POSITIVE_INFINITY;
    return stock / demandPerDay;
}
function bestOwnedBodyForBuilding(data, world, faction, buildingType) {
    if (buildingType < 0)
        return -1;
    let bestBody = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        const placement = validatePlacement(data, world, body, buildingType);
        const noPowerOnly = placement.reason === "noPowerSource";
        if (placement.ok || noPowerOnly) {
            const freeSlots = (world.bodies.slots[body] ?? 0) - (world.bodies.usedSlots[body] ?? 0);
            const capitalBonus = body === (world.factions.capitalBody[faction] ?? -1) ? 2 : 0;
            const score = freeSlots + capitalBonus + (world.bodies.habitability[body] ?? 0);
            if (score > bestScore + 1e-9) {
                bestScore = score;
                bestBody = body;
            }
        }
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return bestBody;
}
function bestUnownedBodyForResource(data, world, faction, resource) {
    let bestBody = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    const capital = world.factions.capitalSystem[faction] ?? 0;
    for (let body = 0; body < world.bodies.length; body += 1) {
        if ((world.bodies.owner[body] ?? -1) >= 0)
            continue;
        if (!bodyCanSupplyResource(data, world, body, resource))
            continue;
        const distance = Math.abs((world.bodies.system[body] ?? 0) - capital);
        const score = (world.bodies.habitability[body] ?? 0) * 25 +
            (world.bodies.slots[body] ?? 0) -
            distance * 0.1;
        if (score > bestScore + 1e-9) {
            bestScore = score;
            bestBody = body;
        }
    }
    return bestBody;
}
function bodyCanSupplyResource(data, world, body, resource) {
    if (world.bodies.hasDeposit(body, resource))
        return true;
    const deposit = data.resources[resource]?.depositFeature ?? "";
    if (deposit.length > 0) {
        const feature = data.featureIndex.get(deposit);
        if (feature !== undefined && ((world.bodies.featureMask[body] ?? 0) & (1 << feature)) !== 0) {
            return true;
        }
    }
    const producer = chooseProducer(data, resource);
    if (producer === undefined)
        return false;
    const buildingType = data.buildingIndex.get(producer.buildingId) ?? -1;
    const def = data.buildings[buildingType];
    return def !== undefined && world.bodies.hasFeatureMask(body, def.requiredFeatureMask);
}
function bottleneckScore(data, resource, demandPerDay, supplyPerDay, deficitPerDay, stockDays) {
    const tier = data.resources[resource]?.tier ?? 1;
    const value = Math.max(0.1, data.baseValue[resource] ?? 1);
    const id = data.resources[resource]?.id ?? "";
    let priority = 1;
    let scoringDeficit = deficitPerDay;
    if (isVital(data, resource)) {
        priority = 5000;
        if (stockDays < 30) {
            scoringDeficit = Math.max(scoringDeficit, demandPerDay * ((30 - Math.max(0, stockDays)) / 30) * 0.5);
        }
    }
    else if (id === "fuel") {
        priority = 1400;
    }
    else if (resource === data.energyResource) {
        priority = 900;
    }
    else if (id === "ice" || id === "biomass" || id === "gas" || id === "polymers") {
        priority = 800;
    }
    return ((scoringDeficit / (supplyPerDay + 0.25)) * (1 + tier * 0.35) * Math.log2(value + 2) * priority +
        demandPerDay * 0.01);
}
function isVital(data, resource) {
    return ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
        data.populationNeeds.comfortOnly[resource] !== 1);
}
//# sourceMappingURL=bottleneck.js.map