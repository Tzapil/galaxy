import { Rng } from "../rng.js";
import { StageOneWorld } from "../world/state.js";
import { generateGalaxyBodies } from "./bodies-gen.js";
import { applyChokepoints } from "./chokepoints.js";
import { triangulateDelaunay } from "./delaunay.js";
import { applyFactionStarts, chooseFactionStarts } from "./faction-starts.js";
import { deriveAttemptSeed, normalizeGalaxyParams } from "./params.js";
import { poissonDiskSample } from "./poisson.js";
import { averageEdgeLength, degreesFor, pruneGateGraph } from "./prune.js";
import { createGalaxyShapeSampler } from "./shapes.js";
import { clusterRegions } from "./regions.js";
import { validateGalaxyMap } from "./validate-map.js";
export class GalaxyGenerationError extends Error {
    attempts;
    reasons;
    constructor(message, attempts, reasons) {
        super(message);
        this.attempts = attempts;
        this.reasons = reasons;
        this.name = "GalaxyGenerationError";
    }
}
export function generateStarLayout(seed, paramsInput = {}) {
    const params = normalizeGalaxyParams(paramsInput);
    const rng = Rng.fromSeed(seed).derive("galaxy");
    const points = layoutStars(params, rng);
    return { points, params, minSystemDistance: params.minSystemDistance };
}
export function buildGeneratedGalaxyWorld(data, seed, paramsInput = {}) {
    const params = normalizeGalaxyParams(paramsInput);
    const reasons = [];
    for (let attempt = 0; attempt < params.maxAttempts; attempt += 1) {
        const generationSeed = deriveAttemptSeed(seed, attempt);
        try {
            const galaxy = buildAttempt(data, seed, generationSeed, attempt, params);
            if (galaxy.validation.ok)
                return galaxy;
            reasons.length = 0;
            for (const violation of galaxy.validation.violations) {
                reasons.push(`${violation.code}:${violation.subject} expected=${violation.expected} actual=${violation.actual}`);
            }
        }
        catch (error) {
            reasons.length = 0;
            reasons.push(error instanceof Error ? error.message : "unknown generation failure");
        }
    }
    throw new GalaxyGenerationError(`Galaxy generation failed after ${params.maxAttempts} attempts: ${reasons.join("; ")}`, params.maxAttempts, reasons.slice());
}
export function buildStageThreeWorld(data, seed, paramsInput = {}) {
    return buildGeneratedGalaxyWorld(data, seed, paramsInput).world;
}
function buildAttempt(data, sourceSeed, generationSeed, attempt, params) {
    const rng = Rng.fromSeed(generationSeed).derive("galaxy");
    const points = layoutStars(params, rng);
    const candidateEdges = triangulateDelaunay(points);
    const pruned = pruneGateGraph(points, candidateEdges, params, rng.derive("gates"));
    const regionLayout = clusterRegions(points, params.regionCount, rng.derive("regions"));
    const edges = applyChokepoints(points.length, pruned.edges, regionLayout.regionOfSystem, params.chokepointStrength);
    const bodies = generateGalaxyBodies(data, points, params, rng.derive("bodies"));
    const starts = chooseFactionStarts(data, bodies.systemResources, edges, params, rng.derive("starts"));
    const world = materializeWorld(data, points, edges, regionLayout, bodies, starts.starts, params);
    const validation = validateGalaxyMap(data, world, edges, params);
    return {
        world,
        points,
        edges,
        params,
        sourceSeed,
        generationSeed,
        attempt,
        minSystemDistance: params.minSystemDistance,
        averageGateDegree: points.length > 0 ? (edges.length * 2) / points.length : 0,
        maxGateLength: params.maxGateLength ?? averageEdgeLength(candidateEdges) * 1.5,
        validation
    };
}
function layoutStars(params, rng) {
    const sampler = createGalaxyShapeSampler(params, rng.derive("shape"));
    return poissonDiskSample(rng.derive("stars"), sampler, {
        count: params.systemCount,
        minDistance: params.minSystemDistance,
        radius: params.galaxyRadius
    });
}
function materializeWorld(data, points, edges, regionLayout, bodies, starts, params) {
    const capacities = capacitiesFor(data, points.length, edges.length, bodies, starts.length, params);
    const world = StageOneWorld.create(data, capacities);
    for (let system = 0; system < points.length; system += 1) {
        const point = points[system];
        if (point === undefined)
            throw new RangeError("Point list is inconsistent.");
        world.systems.add(point.x, point.y, regionLayout.regionOfSystem[system] ?? 0, -1);
    }
    for (let i = 0; i < regionLayout.regions.length; i += 1) {
        const region = regionLayout.regions[i];
        if (region === undefined)
            continue;
        world.regions.add(region.centerX, region.centerY, region.firstSystem, region.systemCount);
    }
    for (let i = 0; i < edges.length; i += 1) {
        const edge = edges[i];
        if (edge === undefined)
            continue;
        world.gates.addUndirected(world.systems, edge.a, edge.b, travelTicks(edge, edges));
    }
    for (let system = 0; system < bodies.bodiesBySystem.length; system += 1) {
        const plans = bodies.bodiesBySystem[system];
        if (plans === undefined)
            continue;
        for (let i = 0; i < plans.length; i += 1) {
            const plan = plans[i];
            if (plan === undefined)
                continue;
            const body = world.addBody(system, plan.type, plan.size, plan.habitability, plan.slots, -1, 0, plan.featureMask);
            for (let d = 0; d < plan.deposits.length; d += 1) {
                const deposit = plan.deposits[d];
                if (deposit !== undefined)
                    world.bodies.addDeposit(body, deposit.resource, deposit.yieldValue);
            }
        }
    }
    applyFactionStarts(data, world, starts, edges);
    return world;
}
function capacitiesFor(data, systemCount, edgeCount, bodies, factionCount, params) {
    const startBodies = data.startPackage?.bodies.length ?? 0;
    const startBuildings = data.startPackage?.buildings.length ?? 0;
    const startShips = data.startPackage?.ships.reduce((sum, item) => sum + item.count, 0) ?? 0;
    const totalBodies = bodies.totalBodies + startBodies * factionCount;
    return {
        systems: systemCount,
        gates: edgeCount * 2,
        bodies: totalBodies,
        stockpiles: totalBodies + startShips * factionCount,
        factions: factionCount,
        regions: params.regionCount,
        buildings: startBuildings * factionCount + 128,
        ships: startShips * factionCount + 64
    };
}
function travelTicks(edge, edges) {
    const average = Math.max(1, averageEdgeLength(edges));
    const normalized = Math.max(0, Math.min(1, edge.length / (average * 1.8)));
    return 3 + Math.min(4, Math.floor(normalized * 5));
}
export function gateDegrees(systemCount, edges) {
    return degreesFor(systemCount, edges);
}
//# sourceMappingURL=build-galaxy-world.js.map