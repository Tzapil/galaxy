import { Rng } from "../rng.js";
import { featureMaskFromNames, resourceIndexOf } from "../stage-one/data.js";
import { BodyType } from "../world/bodies.js";
import { totalSlotsForBody } from "../world/slots.js";
import { createSystemResourceMap } from "./resources-gen.js";
export function generateGalaxyBodies(data, points, params, rng) {
    const systemResources = mutableSystemResourceMap(createSystemResourceMap(data, points, params, rng));
    const counts = new Uint16Array(points.length);
    let totalBodies = 0;
    for (let system = 0; system < points.length; system += 1) {
        const count = rng.nextInt(params.planetsPerSystemMin, params.planetsPerSystemMax + 1);
        counts[system] = count;
        totalBodies += count;
    }
    const habitableTarget = Math.min(totalBodies, Math.round(totalBodies * params.habitableFraction));
    const habitablePlan = chooseHabitableSystems(points, habitableTarget, rng);
    const bodiesBySystem = [];
    let habitableBodies = 0;
    for (let system = 0; system < points.length; system += 1) {
        const bodies = [];
        const requested = counts[system] ?? params.planetsPerSystemMin;
        const wantsHabitable = (habitablePlan[system] ?? 0) > 0;
        const resourceRow = systemResources[system];
        if (resourceRow === undefined)
            throw new RangeError("System resource map is inconsistent.");
        if (wantsHabitable) {
            bodies.push(bodyWithFeatures(data, rng, BodyType.Planet, 0.78 + rng.nextFloat() * 0.2, ["habitable"]));
            resourceRow[resourceIndexOf(data.resourceIndex, "biomass")] = 1;
            habitableBodies += 1;
        }
        addRequiredResourceBodies(data, rng, resourceRow, bodies, requested);
        while (bodies.length < requested) {
            const next = fillerBody(data, rng);
            bodies.push(next);
            if (next.habitability >= 0.7)
                habitableBodies += 1;
        }
        bodiesBySystem.push(bodies);
    }
    return { bodiesBySystem, systemResources, totalBodies, habitableBodies };
}
function addRequiredResourceBodies(data, rng, resources, bodies, requested) {
    const rockyFeatures = [];
    pushIfResource(data, resources, "ore", rockyFeatures, "ore_deposit");
    pushIfResource(data, resources, "silicates", rockyFeatures, "silicate_deposit");
    pushIfResource(data, resources, "rare_earth", rockyFeatures, "rare_earth_vein");
    pushIfResource(data, resources, "crystals", rockyFeatures, "crystal_vein");
    pushIfResource(data, resources, "radioactives", rockyFeatures, "radioactive_vein");
    const hasIce = hasResource(data, resources, "ice");
    const hasGas = hasResource(data, resources, "gas");
    if (rockyFeatures.length > 0 && bodies.length < requested) {
        bodies.push(bodyWithFeatures(data, rng, BodyType.AsteroidBelt, 0, rockyFeatures));
    }
    if (hasIce && bodies.length < requested) {
        bodies.push(bodyWithFeatures(data, rng, BodyType.Planet, 0.08 + rng.nextFloat() * 0.18, ["ice_deposit"]));
    }
    if (hasGas && bodies.length < requested) {
        bodies.push(bodyWithFeatures(data, rng, BodyType.GasGiant, 0, ["gas_giant_orbit"]));
    }
    if (bodies.length >= requested)
        mergeOverflowFeatures(data, rng, resources, bodies);
}
function mergeOverflowFeatures(data, rng, resources, bodies) {
    const first = bodies[0];
    if (first === undefined)
        return;
    const features = featureNamesForBody(data, first);
    if (hasResource(data, resources, "ice"))
        pushUnique(features, "ice_deposit");
    if (hasResource(data, resources, "gas"))
        pushUnique(features, "gas_giant_orbit");
    bodies[0] = bodyWithFeatures(data, rng, first.type, first.habitability, features);
}
function fillerBody(data, rng) {
    const roll = rng.nextFloat();
    if (roll < 0.14)
        return bodyWithFeatures(data, rng, BodyType.GasGiant, 0, ["gas_giant_orbit"]);
    if (roll < 0.3)
        return bodyWithFeatures(data, rng, BodyType.AsteroidBelt, 0, ["ore_deposit"]);
    if (roll < 0.55)
        return bodyWithFeatures(data, rng, BodyType.Planet, 0.06 + rng.nextFloat() * 0.18, [
            "ice_deposit"
        ]);
    return bodyWithFeatures(data, rng, BodyType.Planet, 0.12 + rng.nextFloat() * 0.28, [
        "ore_deposit"
    ]);
}
function bodyWithFeatures(data, rng, type, habitability, features) {
    const size = type === BodyType.GasGiant ? 0.75 + rng.nextFloat() * 0.25 : 0.25 + rng.nextFloat() * 0.75;
    const slots = totalSlotsForBody(type, size, habitability);
    const featureMask = featureMaskFromNames(data.featureIndex, features);
    return {
        type,
        size,
        habitability,
        slots,
        featureMask,
        deposits: depositsForFeatures(data, rng, features)
    };
}
function depositsForFeatures(data, rng, features) {
    const deposits = [];
    for (let i = 0; i < features.length; i += 1) {
        const resource = resourceForFeature(data, features[i] ?? "");
        if (resource >= 0)
            deposits.push({ resource, yieldValue: 0.7 + rng.nextFloat() * 0.6 });
    }
    return deposits.sort((a, b) => a.resource - b.resource);
}
function resourceForFeature(data, feature) {
    if (feature === "ore_deposit")
        return resourceIndexOf(data.resourceIndex, "ore");
    if (feature === "silicate_deposit")
        return resourceIndexOf(data.resourceIndex, "silicates");
    if (feature === "ice_deposit")
        return resourceIndexOf(data.resourceIndex, "ice");
    if (feature === "gas_giant_orbit")
        return resourceIndexOf(data.resourceIndex, "gas");
    if (feature === "habitable")
        return resourceIndexOf(data.resourceIndex, "biomass");
    if (feature === "rare_earth_vein")
        return resourceIndexOf(data.resourceIndex, "rare_earth");
    if (feature === "crystal_vein")
        return resourceIndexOf(data.resourceIndex, "crystals");
    if (feature === "radioactive_vein")
        return resourceIndexOf(data.resourceIndex, "radioactives");
    return -1;
}
function chooseHabitableSystems(points, target, rng) {
    const counts = new Uint16Array(points.length);
    const scored = [];
    for (let system = 0; system < points.length; system += 1) {
        const point = points[system];
        if (point === undefined)
            continue;
        const centerBias = 1 - Math.min(1, Math.sqrt(point.x * point.x + point.y * point.y) / 1200);
        scored.push({ system, score: centerBias * 0.35 + rng.nextFloat() * 0.65 });
    }
    scored.sort((a, b) => {
        if (a.score !== b.score)
            return b.score - a.score;
        return a.system - b.system;
    });
    let remaining = target;
    for (let i = 0; i < scored.length && remaining > 0; i += 1) {
        counts[scored[i]?.system ?? 0] = 1;
        remaining -= 1;
    }
    return counts;
}
function mutableSystemResourceMap(input) {
    const result = [];
    for (let i = 0; i < input.length; i += 1) {
        const row = input[i];
        if (row === undefined)
            throw new RangeError("System resource row is inconsistent.");
        result.push(new Uint8Array(row));
    }
    return result;
}
function pushIfResource(data, resources, resourceId, features, feature) {
    if (hasResource(data, resources, resourceId))
        features.push(feature);
}
function hasResource(data, resources, resourceId) {
    return resources[resourceIndexOf(data.resourceIndex, resourceId)] === 1;
}
function featureNamesForBody(data, body) {
    const result = [];
    for (let bit = 0; bit < data.featureNames.length; bit += 1) {
        if ((body.featureMask & (1 << bit)) !== 0)
            result.push(data.featureNames[bit] ?? "");
    }
    return result;
}
function pushUnique(values, value) {
    if (!values.includes(value))
        values.push(value);
}
//# sourceMappingURL=bodies-gen.js.map