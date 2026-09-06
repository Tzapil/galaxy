import { bootProduction } from "../econ/batch.js";
import { validatePlacement } from "../econ/placement.js";
import { ShipRole } from "../ships/ships.js";
import { bodyTypePlacementMask, resourceIndexOf } from "../stage-one/data.js";
const requiredBootstrapBuildings = [
    "physics_lab",
    "engineering_lab",
    "bio_lab",
    "alloy_works",
    "electronics_plant",
    "refinery"
];
export function applyStartPackage(data, world, system, label, queue, includeShips = true) {
    const pack = requireStartPackage(data);
    const bodies = [];
    for (let i = 0; i < pack.bodies.length; i += 1) {
        const body = pack.bodies[i];
        if (body === undefined)
            throw new RangeError("Start body is inconsistent.");
        const created = world.addBody(system, body.type, body.yieldValue, body.habitability, body.slots, -1, 0, body.featureMask);
        addDepositsForFeatures(data, world, created, body.featureMask, body.yieldValue);
        bodies.push(created);
    }
    const faction = world.addFaction(label, system, bodies[0] ?? 0, pack.treasuryCredits, 1, 1);
    distributeStartPopulation(data, world, pack, faction, bodies);
    addStartBuildings(data, world, pack, bodies);
    seedStartStockpiles(data, world, pack, bodies);
    if (includeShips)
        addStartPackageShips(data, world, faction, system);
    world.factions.researchedCount[faction] = pack.technologies.length;
    if (queue !== undefined)
        bootProduction(data, world, queue, 0);
    return { faction, bodies };
}
export function addStartPackageShips(data, world, faction, system) {
    addStartShips(data, world, requireStartPackage(data), faction, system);
}
export function validateStartPackage(data) {
    const pack = requireStartPackage(data);
    const missing = [];
    const presentBuildings = new Uint8Array(data.buildings.length);
    const bodyHasPower = new Uint8Array(pack.bodies.length);
    const bodyNeedsPower = new Uint8Array(pack.bodies.length);
    let workerNeed = 0;
    let placementsValid = true;
    for (let i = 0; i < pack.buildings.length; i += 1) {
        const item = pack.buildings[i];
        if (item === undefined)
            throw new RangeError("Start building is inconsistent.");
        const def = data.buildings[item.building];
        const body = pack.bodies[item.body];
        if (def === undefined || body === undefined) {
            placementsValid = false;
            continue;
        }
        presentBuildings[item.building] = 1;
        workerNeed += def.workers;
        if ((def.placementMask & bodyTypePlacementMask(body.type)) === 0)
            placementsValid = false;
        if ((body.featureMask & def.requiredFeatureMask) !== def.requiredFeatureMask) {
            placementsValid = false;
        }
        if (def.powerSource)
            bodyHasPower[item.body] = 1;
        if (requiresEnergy(data, def.batchRecipe, def.continuousProcess))
            bodyNeedsPower[item.body] = 1;
    }
    for (const id of requiredBootstrapBuildings) {
        const index = data.buildingIndex.get(id);
        if (index === undefined || presentBuildings[index] !== 1)
            missing.push(id);
    }
    let hasLocalPowerEverywhere = true;
    for (let i = 0; i < pack.bodies.length; i += 1) {
        if (bodyNeedsPower[i] === 1 && bodyHasPower[i] !== 1)
            hasLocalPowerEverywhere = false;
    }
    const effectivePopulation = effectiveStartPopulation(pack, workerNeed);
    const requiredWorkerRatio = workerNeed > 0 ? (effectivePopulation * pack.employmentRate) / workerNeed : 1;
    const hasScienceDataFlow = hasStartProducer(data, pack, "data_physics") &&
        hasStartProducer(data, pack, "data_engineering") &&
        hasStartProducer(data, pack, "data_bio");
    return {
        ok: missing.length === 0 &&
            placementsValid &&
            hasLocalPowerEverywhere &&
            hasScienceDataFlow &&
            requiredWorkerRatio + 1e-9 >= 0.8,
        bodyCount: pack.bodies.length,
        buildingCount: pack.buildings.length,
        effectivePopulation,
        requiredWorkerRatio,
        hasLocalPowerEverywhere,
        hasScienceDataFlow,
        placementsValid,
        missing
    };
}
export function startPackageSummary(data) {
    const validation = validateStartPackage(data);
    return [
        `bodies=${validation.bodyCount}`,
        `buildings=${validation.buildingCount}`,
        `population=${validation.effectivePopulation.toFixed(1)}`,
        `workerRatio=${validation.requiredWorkerRatio.toFixed(2)}`,
        `power=${validation.hasLocalPowerEverywhere ? "ok" : "fail"}`,
        `science=${validation.hasScienceDataFlow ? "ok" : "fail"}`,
        `placement=${validation.placementsValid ? "ok" : "fail"}`
    ].join(", ");
}
function requireStartPackage(data) {
    if (data.startPackage === undefined)
        throw new Error("Stage 2 data has no start package.");
    return data.startPackage;
}
function distributeStartPopulation(data, world, pack, faction, bodies) {
    const need = new Float64Array(bodies.length);
    let totalNeed = 0;
    for (let i = 0; i < pack.buildings.length; i += 1) {
        const item = pack.buildings[i];
        if (item === undefined)
            throw new RangeError("Start building is inconsistent.");
        const workers = data.buildings[item.building]?.workers ?? 0;
        need[item.body] = (need[item.body] ?? 0) + workers;
        totalNeed += workers;
    }
    const startPopulation = effectiveStartPopulation(pack, totalNeed);
    const baseline = totalNeed / Math.max(0.01, pack.employmentRate);
    const scale = baseline > 0 ? startPopulation / baseline : 1;
    let assigned = 0;
    for (let i = 1; i < bodies.length; i += 1) {
        const body = bodies[i] ?? -1;
        if (body < 0)
            continue;
        const population = Math.max(1, ((need[i] ?? 0) / Math.max(0.01, pack.employmentRate)) * scale);
        assigned += population;
        world.addColony(faction, body, population);
    }
    const capital = bodies[0] ?? 0;
    world.bodies.population[capital] = Math.max(1, startPopulation - assigned);
}
function effectiveStartPopulation(pack, workerNeed) {
    if (workerNeed <= 0)
        return pack.population;
    const minimum = (workerNeed * 0.8) / Math.max(0.01, pack.employmentRate);
    return Math.max(pack.population, minimum);
}
function seedStartStockpiles(data, world, pack, bodies) {
    for (let i = 0; i < bodies.length; i += 1) {
        const body = bodies[i] ?? -1;
        if (body < 0)
            continue;
        const stockpile = world.bodies.stockpile[body] ?? 0;
        for (let j = 0; j < pack.stockpiles.length; j += 1) {
            const item = pack.stockpiles[j];
            if (item === undefined)
                throw new RangeError("Start stockpile is inconsistent.");
            const amount = startStockpileAmount(data, world, body, item, i === 0);
            if (amount > 0)
                world.stockpiles.set(stockpile, item.resource, amount);
        }
    }
}
function startStockpileAmount(data, world, body, item, capital) {
    const need = data.populationNeeds.perThousandPopPerDay[item.resource] ?? 0;
    if (need > 0 && data.populationNeeds.comfortOnly[item.resource] !== 1) {
        return Math.max(item.amount, (world.bodies.population[body] ?? 0) * need * 730);
    }
    if (capital)
        return item.amount;
    if (need > 0) {
        return item.amount;
    }
    if (resourceIsDepositOnBody(data, world, body, item.resource))
        return item.amount * 0.35;
    if (data.resources[item.resource]?.id === "fuel")
        return item.amount * 0.2;
    if (resourceUsedByLocalBuilding(data, world, body, item.resource))
        return item.amount * 0.15;
    return 0;
}
function addStartBuildings(data, world, pack, bodies) {
    const order = pack.buildings
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
        const powerA = data.buildings[a.item.building]?.powerSource === true ? 0 : 1;
        const powerB = data.buildings[b.item.building]?.powerSource === true ? 0 : 1;
        if (powerA !== powerB)
            return powerA - powerB;
        return a.index - b.index;
    });
    for (let i = 0; i < order.length; i += 1) {
        const item = order[i]?.item;
        if (item === undefined)
            throw new RangeError("Start building is inconsistent.");
        const body = bodies[item.body] ?? -1;
        if (body < 0)
            throw new RangeError("Start body index is invalid.");
        const placement = validatePlacement(data, world, body, item.building);
        if (!placement.ok) {
            const id = data.buildings[item.building]?.id ?? String(item.building);
            throw new Error(`Start package cannot place ${id}: ${placement.reason ?? "unknown"}.`);
        }
        world.buildings.addBuilt(data, world.bodies, body, item.building, world.stockpiles);
    }
}
function addStartShips(data, world, pack, faction, system) {
    for (let i = 0; i < pack.ships.length; i += 1) {
        const item = pack.ships[i];
        if (item === undefined)
            throw new RangeError("Start ship is inconsistent.");
        const hull = data.hulls[item.hull];
        if (hull === undefined)
            throw new RangeError("Start hull is inconsistent.");
        for (let count = 0; count < item.count; count += 1) {
            const role = roleForHull(hull.id, hull.shipClass);
            world.addShip(faction, system, role, cargoCapacityForHull(hull.id), hull.baseFuel, fuelPerJumpForHull(hull.baseFuel, role));
        }
    }
}
export function addDepositsForFeatures(data, world, body, featureMask, yieldValue) {
    addDepositIfFeature(data, world, body, featureMask, "ore_deposit", "ore", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "silicate_deposit", "silicates", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "ice_deposit", "ice", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "gas_giant_orbit", "gas", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "rare_earth_vein", "rare_earth", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "crystal_vein", "crystals", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "radioactive_vein", "radioactives", yieldValue);
    addDepositIfFeature(data, world, body, featureMask, "habitable", "biomass", yieldValue);
}
function addDepositIfFeature(data, world, body, featureMask, feature, resource, yieldValue) {
    const bit = data.featureIndex.get(feature);
    const resourceIndex = data.resourceIndex.get(resource);
    if (bit === undefined || resourceIndex === undefined)
        return;
    if ((featureMask & (1 << bit)) !== 0)
        world.bodies.addDeposit(body, resourceIndex, yieldValue);
}
function requiresEnergy(data, batchRecipe, continuousProcess) {
    if (continuousProcess >= 0) {
        const process = data.continuous[continuousProcess];
        return (process?.outputsPerTick.some((output) => output.resource === data.energyResource) !== true);
    }
    if (batchRecipe < 0)
        return false;
    const recipe = data.batchRecipes[batchRecipe];
    if (recipe === undefined)
        return false;
    for (let i = 0; i < recipe.inputs.length; i += 1) {
        if (recipe.inputs[i]?.resource === data.energyResource)
            return true;
    }
    return false;
}
function hasStartProducer(data, pack, resourceId) {
    const resource = resourceIndexOf(data.resourceIndex, resourceId);
    for (let i = 0; i < pack.buildings.length; i += 1) {
        const buildingType = pack.buildings[i]?.building ?? -1;
        const recipeIndex = data.buildings[buildingType]?.batchRecipe ?? -1;
        const recipe = data.batchRecipes[recipeIndex];
        if (recipe?.outputs.some((output) => output.resource === resource) === true)
            return true;
    }
    return false;
}
function resourceIsDepositOnBody(data, world, body, resource) {
    return world.bodies.hasDeposit(body, resource);
}
function resourceUsedByLocalBuilding(data, world, body, resource) {
    let building = world.bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
        const type = world.buildings.type[building] ?? -1;
        const def = data.buildings[type];
        if (def !== undefined &&
            buildingUsesResource(data, def.batchRecipe, def.continuousProcess, resource)) {
            return true;
        }
        building = world.buildings.nextInBody[building] ?? -1;
    }
    return false;
}
function buildingUsesResource(data, batchRecipe, continuousProcess, resource) {
    if (batchRecipe >= 0) {
        const recipe = data.batchRecipes[batchRecipe];
        if (recipe?.inputs.some((input) => input.resource === resource) === true)
            return true;
    }
    if (continuousProcess >= 0) {
        const process = data.continuous[continuousProcess];
        if (process?.inputsPerTick.some((input) => input.resource === resource) === true)
            return true;
    }
    return false;
}
function roleForHull(id, shipClass) {
    if (shipClass === "warship")
        return ShipRole.Warship;
    if (id.includes("prospector"))
        return ShipRole.Miner;
    if (id.includes("shuttle"))
        return ShipRole.Scout;
    if (id.includes("colony"))
        return ShipRole.Colonizer;
    return ShipRole.Hauler;
}
function cargoCapacityForHull(id) {
    if (id.includes("heavy_freighter"))
        return 3600;
    if (id.includes("freighter"))
        return 2200;
    if (id.includes("colony"))
        return 1200;
    if (id.includes("prospector"))
        return 800;
    if (id.includes("shuttle"))
        return 300;
    return 180;
}
function fuelPerJumpForHull(baseFuel, role) {
    if (role === ShipRole.Warship)
        return Math.max(6, baseFuel / 12);
    if (role === ShipRole.Hauler)
        return Math.max(5, baseFuel / 22);
    return Math.max(4, baseFuel / 26);
}
//# sourceMappingURL=start-package.js.map