import type { Rng } from "../rng.js";

import { compareEdges } from "./delaunay.js";
import { multiSourceJumpDistances } from "./prune.js";
import type { GalaxyEdge, GalaxyPoint, GalaxyRegionSummary } from "./types.js";

export interface RegionLayout {
  readonly regionOfSystem: Uint16Array;
  readonly regions: readonly GalaxyRegionSummary[];
}

interface MutableCenter {
  x: number;
  y: number;
}

const KMEANS_ITERATIONS = 16;

export function clusterRegions(
  points: readonly GalaxyPoint[],
  regionCount: number,
  rng: Rng
): RegionLayout {
  if (regionCount <= 0 || regionCount > points.length) {
    throw new RangeError("regionCount must be in 1..systemCount.");
  }
  const centers = initializeCenters(points, regionCount, rng);
  const regionOfSystem = new Uint16Array(points.length);
  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration += 1) {
    assignRegions(points, centers, regionOfSystem);
    recenter(points, centers, regionOfSystem);
  }
  assignRegions(points, centers, regionOfSystem);
  return summarizeRegions(points, centers, regionOfSystem);
}

export function computeCapitalJumpDistances(
  systemCount: number,
  edges: readonly GalaxyEdge[],
  capitalSystems: readonly number[]
): Uint16Array {
  return multiSourceJumpDistances(systemCount, edges, capitalSystems);
}

function initializeCenters(
  points: readonly GalaxyPoint[],
  regionCount: number,
  rng: Rng
): MutableCenter[] {
  const centers: MutableCenter[] = [];
  const first = rng.nextInt(0, points.length);
  centers.push(pointCenter(points[first], first));
  while (centers.length < regionCount) {
    let best = -1;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
      if (centerAlreadyUsesSystem(centers, points, i)) continue;
      const distance = nearestCenterDistance(points[i], centers);
      if (
        distance > bestDistance ||
        (distance === bestDistance && comparePointIndex(points, i, best) < 0)
      ) {
        best = i;
        bestDistance = distance;
      }
    }
    centers.push(pointCenter(points[best], best));
  }
  return centers;
}

function assignRegions(
  points: readonly GalaxyPoint[],
  centers: readonly MutableCenter[],
  regionOfSystem: Uint16Array
): void {
  for (let i = 0; i < points.length; i += 1) {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let region = 0; region < centers.length; region += 1) {
      const distance = distanceSquared(points[i], centers[region]);
      if (distance < bestDistance) {
        best = region;
        bestDistance = distance;
      }
    }
    regionOfSystem[i] = best;
  }
}

function recenter(
  points: readonly GalaxyPoint[],
  centers: MutableCenter[],
  regionOfSystem: Uint16Array
): void {
  const counts = new Uint32Array(centers.length);
  const sumsX = new Float64Array(centers.length);
  const sumsY = new Float64Array(centers.length);
  for (let i = 0; i < points.length; i += 1) {
    const region = regionOfSystem[i] ?? 0;
    const point = points[i];
    if (point === undefined) continue;
    counts[region] = (counts[region] ?? 0) + 1;
    sumsX[region] = (sumsX[region] ?? 0) + point.x;
    sumsY[region] = (sumsY[region] ?? 0) + point.y;
  }
  for (let region = 0; region < centers.length; region += 1) {
    const count = counts[region] ?? 0;
    if (count > 0) {
      const center = centers[region];
      if (center === undefined) continue;
      center.x = (sumsX[region] ?? 0) / count;
      center.y = (sumsY[region] ?? 0) / count;
    }
  }
}

function summarizeRegions(
  points: readonly GalaxyPoint[],
  centers: readonly MutableCenter[],
  regionOfSystem: Uint16Array
): RegionLayout {
  const counts = new Uint32Array(centers.length);
  const first = new Uint32Array(centers.length);
  first.fill(0xffffffff);
  for (let i = 0; i < regionOfSystem.length; i += 1) {
    const region = regionOfSystem[i] ?? 0;
    counts[region] = (counts[region] ?? 0) + 1;
    if ((first[region] ?? 0xffffffff) === 0xffffffff) first[region] = i;
  }
  const regions: GalaxyRegionSummary[] = [];
  for (let region = 0; region < centers.length; region += 1) {
    const center = centers[region] ?? { x: 0, y: 0 };
    regions.push({
      id: region,
      centerX: center.x,
      centerY: center.y,
      firstSystem: first[region] ?? 0,
      systemCount: counts[region] ?? 0
    });
  }
  void points;
  return { regionOfSystem, regions };
}

function centerAlreadyUsesSystem(
  centers: readonly MutableCenter[],
  points: readonly GalaxyPoint[],
  system: number
): boolean {
  const point = points[system];
  if (point === undefined) return false;
  for (let i = 0; i < centers.length; i += 1) {
    const center = centers[i];
    if (center?.x === point.x && center.y === point.y) return true;
  }
  return false;
}

function nearestCenterDistance(
  point: GalaxyPoint | undefined,
  centers: readonly MutableCenter[]
): number {
  if (point === undefined) return Number.NEGATIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < centers.length; i += 1)
    best = Math.min(best, distanceSquared(point, centers[i]));
  return best;
}

function pointCenter(point: GalaxyPoint | undefined, index: number): MutableCenter {
  if (point === undefined) throw new RangeError(`Missing point ${index}.`);
  return { x: point.x, y: point.y };
}

function comparePointIndex(points: readonly GalaxyPoint[], a: number, b: number): number {
  if (b < 0) return -1;
  const left = points[a];
  const right = points[b];
  if (left === undefined || right === undefined) return a - b;
  if (left.x !== right.x) return left.x - right.x;
  if (left.y !== right.y) return left.y - right.y;
  return a - b;
}

function distanceSquared(
  point: GalaxyPoint | MutableCenter | undefined,
  center: GalaxyPoint | MutableCenter | undefined
): number {
  if (point === undefined || center === undefined) return Number.POSITIVE_INFINITY;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return dx * dx + dy * dy;
}

export function interRegionPassageCounts(
  edges: readonly GalaxyEdge[],
  regionOfSystem: Uint16Array
): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined) continue;
    const a = regionOfSystem[edge.a] ?? 0;
    const b = regionOfSystem[edge.b] ?? 0;
    if (a === b) continue;
    const key = regionPairKey(a, b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function regionPairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function sortedEdgesByRegionPair(
  edges: readonly GalaxyEdge[],
  regionOfSystem: Uint16Array
): Map<string, GalaxyEdge[]> {
  const groups = new Map<string, GalaxyEdge[]>();
  const sorted = edges.slice().sort(compareEdges);
  for (let i = 0; i < sorted.length; i += 1) {
    const edge = sorted[i];
    if (edge === undefined) continue;
    const regionA = regionOfSystem[edge.a] ?? 0;
    const regionB = regionOfSystem[edge.b] ?? 0;
    if (regionA === regionB) continue;
    const key = regionPairKey(regionA, regionB);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [edge]);
    else group.push(edge);
  }
  return groups;
}
