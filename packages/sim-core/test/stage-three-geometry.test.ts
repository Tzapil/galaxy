import { describe, expect, it } from "vitest";

import {
  Rng,
  applyChokepoints,
  clusterRegions,
  connectedComponentCount,
  generateStarLayout,
  minimumSquaredDistance,
  normalizeGalaxyParams,
  pruneGateGraph,
  triangulateDelaunay,
  type GalaxyPoint
} from "../src/index.js";

describe("stage three galaxy geometry", () => {
  it("places stars deterministically for the same seed", () => {
    const first = generateStarLayout(20260904, { systemCount: 500 });
    const second = generateStarLayout(20260904, { systemCount: 500 });

    expect(first.points).toEqual(second.points);
  });

  it("keeps the poisson minimum distance at 2000 systems", () => {
    const layout = generateStarLayout(77, { systemCount: 2000, shape: "disc" });

    expect(layout.points).toHaveLength(2000);
    expect(Math.sqrt(minimumSquaredDistance(layout.points))).toBeGreaterThanOrEqual(
      layout.minSystemDistance - 1e-7
    );
  }, 60_000);

  it("makes the four shapes numerically distinct", () => {
    const disc = radialStats(generateStarLayout(11, { systemCount: 450, shape: "disc" }).points);
    const spiral = generateStarLayout(11, {
      systemCount: 450,
      shape: "spiral",
      armCount: 4
    }).points;
    const spiralBaseline = generateStarLayout(11, { systemCount: 450, shape: "disc" }).points;
    const ring = radialStats(generateStarLayout(11, { systemCount: 450, shape: "ring" }).points);
    const cluster = nearestNeighborMean(
      generateStarLayout(11, { systemCount: 450, shape: "cluster" }).points
    );

    expect(ring.meanRadius).toBeGreaterThan(disc.meanRadius);
    expect(ring.radiusSpread).toBeLessThan(disc.radiusSpread);
    expect(spiralArmAlignment(spiral, 4, 0.4)).toBeLessThan(
      spiralArmAlignment(spiralBaseline, 4, 0.4) * 0.78
    );
    expect(cluster).toBeLessThan(
      nearestNeighborMean(generateStarLayout(12, { systemCount: 450, shape: "disc" }).points)
    );
  }, 60_000);

  it("prunes Delaunay gates to the target average degree on 50 seeds", () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = 20260904 + i;
      const layout = generateStarLayout(seed, { systemCount: 500 });
      const edges = triangulateDelaunay(layout.points);
      const graph = pruneGateGraph(
        layout.points,
        edges,
        normalizeGalaxyParams({ systemCount: 500 }),
        Rng.fromSeed(seed).derive("galaxy").derive("gates")
      );

      expect(graph.averageDegree).toBeGreaterThanOrEqual(2.85);
      expect(graph.averageDegree).toBeLessThanOrEqual(3.15);
      expect(connectedComponentCount(layout.points.length, graph.edges)).toBe(1);
      expect(graph.edges.every((edge) => edge.length <= graph.maxGateLength + 1e-9)).toBe(true);
    }
  }, 120_000);

  it("responds to sparse and dense avgGateDegree targets", () => {
    const layout = generateStarLayout(99, { systemCount: 300 });
    const edges = triangulateDelaunay(layout.points);
    const sparse = pruneGateGraph(
      layout.points,
      edges,
      normalizeGalaxyParams({ systemCount: 300, avgGateDegree: 2 }),
      Rng.fromSeed(99).derive("galaxy").derive("sparse-gates")
    );
    const dense = pruneGateGraph(
      layout.points,
      edges,
      normalizeGalaxyParams({ systemCount: 300, avgGateDegree: 5 }),
      Rng.fromSeed(99).derive("galaxy").derive("dense-gates")
    );

    expect(sparse.edges.length).toBeLessThanOrEqual(305);
    expect(dense.edges.length).toBeGreaterThan(700);
  });

  it("keeps chokepoint pruning connected and strict at full strength", () => {
    const layout = generateStarLayout(123, { systemCount: 350 });
    const candidate = triangulateDelaunay(layout.points);
    const graph = pruneGateGraph(
      layout.points,
      candidate,
      normalizeGalaxyParams({ systemCount: 350, avgGateDegree: 3.2 }),
      Rng.fromSeed(123).derive("galaxy").derive("gates")
    );
    const regions = clusterRegions(
      layout.points,
      7,
      Rng.fromSeed(123).derive("galaxy").derive("regions")
    );
    const choked = applyChokepoints(layout.points.length, graph.edges, regions.regionOfSystem, 1);

    expect(connectedComponentCount(layout.points.length, choked)).toBe(1);
    expect(maxInterRegionPassages(choked, regions.regionOfSystem)).toBe(1);
  }, 60_000);
});

function radialStats(points: readonly GalaxyPoint[]): {
  readonly meanRadius: number;
  readonly radiusSpread: number;
} {
  let total = 0;
  const radii: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    const radius = Math.sqrt(point.x * point.x + point.y * point.y);
    total += radius;
    radii.push(radius);
  }
  const mean = total / Math.max(1, radii.length);
  let spread = 0;
  for (let i = 0; i < radii.length; i += 1) spread += Math.abs((radii[i] ?? 0) - mean);
  return { meanRadius: mean, radiusSpread: spread / Math.max(1, radii.length) };
}

function spiralArmAlignment(
  points: readonly GalaxyPoint[],
  armCount: number,
  armTightness: number
): number {
  const maxRadius = maxPointRadius(points);
  const armWidth = (Math.PI * 2) / armCount;
  const twist = 2.0 + armTightness * 5.2;
  let total = 0;
  let count = 0;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    const radius = Math.sqrt(point.x * point.x + point.y * point.y);
    const angle = positiveModulo(
      Math.atan2(point.y, point.x) - (radius / maxRadius) * twist,
      armWidth
    );
    total += Math.min(angle, armWidth - angle);
    count += 1;
  }
  return total / Math.max(1, count);
}

function maxPointRadius(points: readonly GalaxyPoint[]): number {
  let max = 1;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    max = Math.max(max, Math.sqrt(point.x * point.x + point.y * point.y));
  }
  return max;
}

function positiveModulo(value: number, period: number): number {
  const result = value % period;
  return result < 0 ? result + period : result;
}

function nearestNeighborMean(points: readonly GalaxyPoint[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    let best = Number.POSITIVE_INFINITY;
    const a = points[i];
    if (a === undefined) continue;
    for (let j = 0; j < points.length; j += 1) {
      if (i === j) continue;
      const b = points[j];
      if (b === undefined) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    total += best;
  }
  return total / Math.max(1, points.length);
}

function maxInterRegionPassages(
  edges: readonly { readonly a: number; readonly b: number }[],
  regions: Uint16Array
): number {
  const counts = new Map<string, number>();
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined) continue;
    const a = regions[edge.a] ?? 0;
    const b = regions[edge.b] ?? 0;
    if (a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let max = 0;
  for (const count of counts.values()) max = Math.max(max, count);
  return max;
}
