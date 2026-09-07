import type { Rng } from "../rng.js";
import { resourceIndexOf, type StageOneData } from "../stage-one/data.js";

import type { NormalizedGalaxyParams } from "./params.js";
import type { GalaxyEdge, GalaxyPoint } from "./types.js";

interface ClusterSeed {
  readonly system: number;
  readonly radius: number;
}

interface ScoredSystem {
  readonly system: number;
  readonly score: number;
}

const RARE_RESOURCE_IDS = ["rare_earth", "crystals", "radioactives"] as const;
const COMMON_RESOURCE_IDS = ["ore", "ice", "gas", "silicates"] as const;

export function createSystemResourceMap(
  data: StageOneData,
  points: readonly GalaxyPoint[],
  params: NormalizedGalaxyParams,
  rng: Rng
): readonly Uint8Array[] {
  const resources: Uint8Array[] = [];
  for (let i = 0; i < points.length; i += 1) resources.push(new Uint8Array(data.resources.length));

  for (let i = 0; i < COMMON_RESOURCE_IDS.length; i += 1) {
    const id = COMMON_RESOURCE_IDS[i] ?? "";
    const resource = resourceIndexOf(data.resourceIndex, id);
    const flags = selectResourceSystems(
      points,
      params,
      rng,
      commonAbundance(id),
      Math.max(4, params.regionCount),
      i + 11
    );
    writeResourceFlags(resources, resource, flags);
  }

  for (let i = 0; i < RARE_RESOURCE_IDS.length; i += 1) {
    const id = RARE_RESOURCE_IDS[i] ?? "";
    const resource = resourceIndexOf(data.resourceIndex, id);
    const abundance = Math.max(
      params.rareResourceAbundance,
      (params.rareResourceClusterMin * 2) / Math.max(1, points.length)
    );
    const flags = selectResourceSystems(
      points,
      params,
      rng,
      abundance,
      params.rareResourceClusterMin,
      i + 101
    );
    writeResourceFlags(resources, resource, flags);
  }

  return resources;
}

export function rareResourceIndices(data: StageOneData): readonly number[] {
  return RARE_RESOURCE_IDS.map((id) => resourceIndexOf(data.resourceIndex, id));
}

export function tierOneStartResourceIndices(data: StageOneData): readonly number[] {
  const blockedRare = new Set<string>(RARE_RESOURCE_IDS);
  const result: number[] = [];
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    const item = data.resources[resource];
    if (item === undefined) continue;
    if (item.phase !== 1 || item.tier !== 1 || item.category !== "raw") continue;
    if (blockedRare.has(item.id) || item.id === "exotic_matter") continue;
    result.push(resource);
  }
  return result.sort((a, b) => a - b);
}

export function rareResourceClusterCount(
  systemResources: readonly Uint8Array[],
  edges: readonly GalaxyEdge[],
  resource: number
): number {
  const marked = new Uint8Array(systemResources.length);
  let present = 0;
  for (let system = 0; system < systemResources.length; system += 1) {
    if (systemResources[system]?.[resource] === 1) {
      marked[system] = 1;
      present += 1;
    }
  }
  if (present === 0) return 0;
  const visited = new Uint8Array(systemResources.length);
  let clusters = 0;
  for (let system = 0; system < systemResources.length; system += 1) {
    if (marked[system] !== 1 || visited[system] === 1) continue;
    clusters += 1;
    markResourceCluster(system, marked, visited, edges);
  }
  return clusters;
}

export function neighborResourceCorrelation(
  systemResources: readonly Uint8Array[],
  edges: readonly GalaxyEdge[],
  resource: number
): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined) continue;
    const a = systemResources[edge.a]?.[resource] ?? 0;
    const b = systemResources[edge.b]?.[resource] ?? 0;
    if (a === 1 || b === 1) either += 1;
    if (a === 1 && b === 1) both += 1;
  }
  return either === 0 ? 0 : both / either;
}

function selectResourceSystems(
  points: readonly GalaxyPoint[],
  params: NormalizedGalaxyParams,
  rng: Rng,
  abundance: number,
  clusterCount: number,
  salt: number
): Uint8Array {
  const flags = new Uint8Array(points.length);
  const target = Math.max(clusterCount, Math.round(points.length * abundance));
  const seeds = chooseClusterSeeds(points, clusterCount, params.galaxyRadius, rng);
  const scored: ScoredSystem[] = [];
  for (let system = 0; system < points.length; system += 1) {
    const point = points[system];
    if (point === undefined) continue;
    const clusterScore = clusterInfluence(point, points, seeds);
    const noiseScore = valueNoise2d(point.x, point.y, params.galaxyRadius / 6, salt);
    const jitter = stableNoise(system, salt + 907);
    const strength = params.resourceClusterStrength;
    scored.push({
      system,
      score: clusterScore * strength + noiseScore * (1 - strength) + jitter * 0.0001
    });
  }
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return a.system - b.system;
  });
  for (let i = 0; i < Math.min(target, scored.length); i += 1) {
    flags[scored[i]?.system ?? 0] = 1;
  }
  return flags;
}

function chooseClusterSeeds(
  points: readonly GalaxyPoint[],
  count: number,
  radius: number,
  rng: Rng
): readonly ClusterSeed[] {
  const seeds: ClusterSeed[] = [];
  if (points.length === 0) return seeds;
  seeds.push({
    system: rng.nextInt(0, points.length),
    radius: radius * (0.14 + rng.nextFloat() * 0.08)
  });
  while (seeds.length < count) {
    let best = 0;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (let system = 0; system < points.length; system += 1) {
      const distance = nearestSeedDistance(points, system, seeds);
      if (distance > bestDistance) {
        best = system;
        bestDistance = distance;
      }
    }
    seeds.push({ system: best, radius: radius * (0.14 + rng.nextFloat() * 0.08) });
  }
  return seeds;
}

function nearestSeedDistance(
  points: readonly GalaxyPoint[],
  system: number,
  seeds: readonly ClusterSeed[]
): number {
  let best = Number.POSITIVE_INFINITY;
  const point = points[system];
  if (point === undefined) return best;
  for (let i = 0; i < seeds.length; i += 1) {
    const seedPoint = points[seeds[i]?.system ?? 0];
    if (seedPoint === undefined) continue;
    const dx = point.x - seedPoint.x;
    const dy = point.y - seedPoint.y;
    best = Math.min(best, dx * dx + dy * dy);
  }
  return best;
}

function clusterInfluence(
  point: GalaxyPoint,
  points: readonly GalaxyPoint[],
  seeds: readonly ClusterSeed[]
): number {
  let best = 0;
  for (let i = 0; i < seeds.length; i += 1) {
    const seed = seeds[i];
    if (seed === undefined) continue;
    const center = points[seed.system];
    if (center === undefined) continue;
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const influence = Math.max(0, 1 - distance / seed.radius);
    best = Math.max(best, influence * influence);
  }
  return best;
}

function writeResourceFlags(
  resources: readonly Uint8Array[],
  resource: number,
  flags: Uint8Array
): void {
  for (let system = 0; system < flags.length; system += 1) {
    if (flags[system] === 1) {
      const row = resources[system];
      if (row !== undefined) row[resource] = 1;
    }
  }
}

function markResourceCluster(
  start: number,
  marked: Uint8Array,
  visited: Uint8Array,
  edges: readonly GalaxyEdge[]
): void {
  const queue = new Int32Array(marked.length);
  let read = 0;
  let write = 1;
  queue[0] = start;
  visited[start] = 1;
  while (read < write) {
    const current = queue[read] ?? 0;
    read += 1;
    for (let i = 0; i < edges.length; i += 1) {
      const edge = edges[i];
      if (edge === undefined) continue;
      let next = -1;
      if (edge.a === current) next = edge.b;
      else if (edge.b === current) next = edge.a;
      if (next < 0 || marked[next] !== 1 || visited[next] === 1) continue;
      visited[next] = 1;
      queue[write] = next;
      write += 1;
    }
  }
}

function commonAbundance(id: string): number {
  if (id === "ore") return 0.68;
  if (id === "silicates") return 0.6;
  if (id === "ice") return 0.52;
  if (id === "gas") return 0.42;
  return 0.5;
}

function valueNoise2d(x: number, y: number, scale: number, salt: number): number {
  const sx = x / Math.max(1, scale);
  const sy = y / Math.max(1, scale);
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = smooth(sx - ix);
  const fy = smooth(sy - iy);
  const a = latticeNoise(ix, iy, salt);
  const b = latticeNoise(ix + 1, iy, salt);
  const c = latticeNoise(ix, iy + 1, salt);
  const d = latticeNoise(ix + 1, iy + 1, salt);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}

function latticeNoise(x: number, y: number, salt: number): number {
  return stableNoise(Math.imul(x, 374761393) ^ Math.imul(y, 668265263), salt);
}

function stableNoise(value: number, salt: number): number {
  let x = (value ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
