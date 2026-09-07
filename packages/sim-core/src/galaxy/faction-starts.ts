import {
  addStartPackageShips,
  applyStartPackage,
  type AppliedStartPackage
} from "../bootstrap/start-package.js";
import type { Rng } from "../rng.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

import type { NormalizedGalaxyParams } from "./params.js";
import {
  buildAdjacency,
  shortestJumpDistancesWithAdjacency,
  type GraphAdjacency
} from "./prune.js";
import { tierOneStartResourceIndices } from "./resources-gen.js";
import { computeCapitalJumpDistances } from "./regions.js";
import type { GalaxyEdge } from "./types.js";

export interface FactionStartSelection {
  readonly starts: readonly number[];
  readonly requiredResources: readonly number[];
}

export function chooseFactionStarts(
  data: StageOneData,
  systemResources: readonly Uint8Array[],
  edges: readonly GalaxyEdge[],
  params: NormalizedGalaxyParams,
  rng: Rng
): FactionStartSelection {
  const requiredResources = tierOneStartResourceIndices(data);
  const adjacency = buildAdjacency(systemResources.length, edges);
  const candidates = viableStartCandidates(
    systemResources,
    adjacency,
    params.startViabilityJumps,
    requiredResources
  );
  if (candidates.length < params.factionCount) {
    throw new Error(
      `Only ${candidates.length} viable starts for ${params.factionCount} factions within ${params.startViabilityJumps} jumps.`
    );
  }

  const starts: number[] = [];
  const first = candidates[rng.nextInt(0, candidates.length)] ?? candidates[0];
  if (first === undefined) throw new Error("No viable faction starts.");
  starts.push(first);
  while (starts.length < params.factionCount) {
    const next = chooseNextStart(candidates, starts, systemResources.length, adjacency, rng);
    if (next < 0) {
      throw new Error(
        `Cannot place ${params.factionCount} starts with factionMinJumps=${params.factionMinJumps}.`
      );
    }
    const distances = shortestJumpDistancesWithAdjacency(
      systemResources.length,
      adjacency,
      next,
      params.factionMinJumps
    );
    let ok = true;
    for (let i = 0; i < starts.length; i += 1) {
      if ((distances[starts[i] ?? 0] ?? 0xffff) < params.factionMinJumps) ok = false;
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

export function applyFactionStarts(
  data: StageOneData,
  world: StageOneWorld,
  starts: readonly number[],
  edges: readonly GalaxyEdge[]
): readonly AppliedStartPackage[] {
  const applied: AppliedStartPackage[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i] ?? 0;
    const item = applyStartPackage(data, world, start, factionLabel(i), undefined, false);
    addStartPackageShips(data, world, item.faction, start);
    applied.push(item);
  }
  refreshWorldCapitalDistances(world, edges);
  return applied;
}

export function refreshWorldCapitalDistances(
  world: StageOneWorld,
  edges: readonly GalaxyEdge[]
): void {
  const capitals: number[] = [];
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    capitals.push(world.factions.capitalSystem[faction] ?? 0);
  }
  world.capitalDistances.replace(
    computeCapitalJumpDistances(world.systems.length, edges, capitals)
  );
}

export function startHasResourcesWithinJumps(
  systemResources: readonly Uint8Array[],
  adjacency: GraphAdjacency,
  start: number,
  radius: number,
  requiredResources: readonly number[]
): boolean {
  const distances = shortestJumpDistancesWithAdjacency(
    systemResources.length,
    adjacency,
    start,
    radius
  );
  for (let r = 0; r < requiredResources.length; r += 1) {
    const resource = requiredResources[r] ?? 0;
    let found = false;
    for (let system = 0; system < systemResources.length; system += 1) {
      if ((distances[system] ?? 0xffff) > radius) continue;
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

function viableStartCandidates(
  systemResources: readonly Uint8Array[],
  adjacency: GraphAdjacency,
  radius: number,
  requiredResources: readonly number[]
): number[] {
  const candidates: number[] = [];
  for (let system = 0; system < systemResources.length; system += 1) {
    if (
      startHasResourcesWithinJumps(systemResources, adjacency, system, radius, requiredResources)
    ) {
      candidates.push(system);
    }
  }
  return candidates;
}

function chooseNextStart(
  candidates: readonly number[],
  starts: readonly number[],
  systemCount: number,
  adjacency: GraphAdjacency,
  rng: Rng
): number {
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i] ?? -1;
    if (candidate < 0 || starts.includes(candidate)) continue;
    const minDistance = distanceToClosestStart(systemCount, adjacency, candidate, starts);
    const score = minDistance * 100 + rng.nextFloat();
    if (score > bestScore || (score === bestScore && candidate < best)) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function distanceToClosestStart(
  systemCount: number,
  adjacency: GraphAdjacency,
  candidate: number,
  starts: readonly number[]
): number {
  const distances = shortestJumpDistancesWithAdjacency(systemCount, adjacency, candidate);
  let best = 0xffff;
  for (let i = 0; i < starts.length; i += 1) {
    best = Math.min(best, distances[starts[i] ?? 0] ?? 0xffff);
  }
  return best;
}

function factionLabel(index: number): string {
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
