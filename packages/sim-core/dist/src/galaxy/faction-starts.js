import { addStartPackageShips, applyStartPackage } from "../bootstrap/start-package.js";
import { buildAdjacency, shortestJumpDistancesWithAdjacency } from "./prune.js";
import { tierOneStartResourceIndices } from "./resources-gen.js";
import { computeCapitalJumpDistances } from "./regions.js";
export function chooseFactionStarts(data, systemResources, edges, params, rng) {
    const requiredResources = tierOneStartResourceIndices(data);
    const adjacency = buildAdjacency(systemResources.length, edges);
    const candidates = viableStartCandidates(systemResources, adjacency, params.startViabilityJumps, requiredResources);
    if (candidates.length < params.factionCount) {
        throw new Error(`Only ${candidates.length} viable starts for ${params.factionCount} factions within ${params.startViabilityJumps} jumps.`);
    }
    const starts = [];
    const first = candidates[rng.nextInt(0, candidates.length)] ?? candidates[0];
    if (first === undefined)
        throw new Error("No viable faction starts.");
    starts.push(first);
    while (starts.length < params.factionCount) {
        const next = chooseNextStart(candidates, starts, systemResources.length, adjacency, rng);
        if (next < 0) {
            throw new Error(`Cannot place ${params.factionCount} starts with factionMinJumps=${params.factionMinJumps}.`);
        }
        const distances = shortestJumpDistancesWithAdjacency(systemResources.length, adjacency, next, params.factionMinJumps);
        let ok = true;
        for (let i = 0; i < starts.length; i += 1) {
            if ((distances[starts[i] ?? 0] ?? 0xffff) < params.factionMinJumps)
                ok = false;
        }
        if (!ok) {
            const filtered = candidates.filter((candidate) => candidate !== next);
            candidates.length = 0;
            candidates.push(...filtered);
            continue;
        }
        starts.push(next);
    }
    starts.sort((a, b) => a - b);
    return { starts, requiredResources };
}
export function applyFactionStarts(data, world, starts, edges) {
    const applied = [];
    for (let i = 0; i < starts.length; i += 1) {
        const start = starts[i] ?? 0;
        const item = applyStartPackage(data, world, start, factionLabel(i), undefined, false);
        addStartPackageShips(data, world, item.faction, start);
        applied.push(item);
    }
    refreshWorldCapitalDistances(world, edges);
    return applied;
}
export function refreshWorldCapitalDistances(world, edges) {
    const capitals = [];
    for (let faction = 0; faction < world.factions.length; faction += 1) {
        capitals.push(world.factions.capitalSystem[faction] ?? 0);
    }
    world.capitalDistances.replace(computeCapitalJumpDistances(world.systems.length, edges, capitals));
}
export function startHasResourcesWithinJumps(systemResources, adjacency, start, radius, requiredResources) {
    const distances = shortestJumpDistancesWithAdjacency(systemResources.length, adjacency, start, radius);
    for (let r = 0; r < requiredResources.length; r += 1) {
        const resource = requiredResources[r] ?? 0;
        let found = false;
        for (let system = 0; system < systemResources.length; system += 1) {
            if ((distances[system] ?? 0xffff) > radius)
                continue;
            if (systemResources[system]?.[resource] === 1) {
                found = true;
                break;
            }
        }
        if (!found) {
            return false;
        }
    }
    return true;
}
function viableStartCandidates(systemResources, adjacency, radius, requiredResources) {
    const candidates = [];
    for (let system = 0; system < systemResources.length; system += 1) {
        if (startHasResourcesWithinJumps(systemResources, adjacency, system, radius, requiredResources)) {
            candidates.push(system);
        }
    }
    return candidates;
}
function chooseNextStart(candidates, starts, systemCount, adjacency, rng) {
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < candidates.length; i += 1) {
        const candidate = candidates[i] ?? -1;
        if (candidate < 0 || starts.includes(candidate))
            continue;
        const minDistance = distanceToClosestStart(systemCount, adjacency, candidate, starts);
        const score = minDistance * 100 + rng.nextFloat();
        if (score > bestScore || (score === bestScore && candidate < best)) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}
function distanceToClosestStart(systemCount, adjacency, candidate, starts) {
    const distances = shortestJumpDistancesWithAdjacency(systemCount, adjacency, candidate);
    let best = 0xffff;
    for (let i = 0; i < starts.length; i += 1) {
        best = Math.min(best, distances[starts[i] ?? 0] ?? 0xffff);
    }
    return best;
}
function factionLabel(index) {
    const labels = [
        "Vega Compact",
        "Orion Combine",
        "Cygnus League",
        "Kairon Assembly",
        "Altair Trust",
        "Sagan Directorate",
        "Helix Union",
        "Lyra Mandate",
        "Aster Republic",
        "Kepler Syndicate",
        "Nadir Pact",
        "Zenith Worlds"
    ];
    return labels[index] ?? `Faction ${index + 1}`;
}
//# sourceMappingURL=faction-starts.js.map