import type { Rng } from "../rng.js";

import { compareEdges } from "./delaunay.js";
import type { GalaxyEdge, GalaxyPoint } from "./types.js";

export interface PrunedGateGraph {
  readonly edges: readonly GalaxyEdge[];
  readonly degrees: Uint16Array;
  readonly averageDegree: number;
  readonly maxGateLength: number;
}

export interface PruneGateOptions {
  readonly avgGateDegree: number;
  readonly gateDegreeVariance: number;
  readonly maxGateLength: number | undefined;
}

interface ActiveEdge {
  readonly edge: GalaxyEdge;
  keepBias: number;
  active: boolean;
}

const INF_DISTANCE = 0xffff;

export interface GraphAdjacency {
  readonly offsets: Uint32Array;
  readonly targets: Uint32Array;
}

export function pruneGateGraph(
  points: readonly GalaxyPoint[],
  candidateEdges: readonly GalaxyEdge[],
  options: PruneGateOptions,
  rng: Rng
): PrunedGateGraph {
  if (points.length <= 1) {
    return {
      edges: [],
      degrees: new Uint16Array(points.length),
      averageDegree: 0,
      maxGateLength: 0
    };
  }
  const defaultMax = Math.max(
    averageEdgeLength(candidateEdges) * 1.5,
    minimumConnectedGateLength(points.length, candidateEdges)
  );
  const maxGateLength = options.maxGateLength ?? defaultMax;
  const filtered = candidateEdges
    .filter((edge) => edge.length <= maxGateLength + 1e-9)
    .sort(compareEdges);
  if (connectedComponentCount(points.length, filtered) !== 1) {
    throw new Error(
      `maxGateLength ${maxGateLength.toFixed(3)} disconnects the Delaunay candidate graph.`
    );
  }

  const active: ActiveEdge[] = filtered.map((edge) => ({
    edge,
    keepBias: rng.nextFloat(),
    active: true
  }));
  const degrees = degreesFor(points.length, filtered);
  const targetEdges = Math.max(
    points.length - 1,
    Math.round((points.length * options.avgGateDegree) / 2)
  );
  let activeCount = active.length;

  while (activeCount > targetEdges) {
    const candidate = bestRemovable(active, degrees, options);
    if (candidate < 0) break;
    const candidateEdge = active[candidate];
    if (candidateEdge === undefined) break;
    candidateEdge.active = false;
    if (connectedComponentCountWithActive(points.length, active) === 1) {
      const edge = candidateEdge.edge;
      degrees[edge.a] = Math.max(0, (degrees[edge.a] ?? 0) - 1);
      degrees[edge.b] = Math.max(0, (degrees[edge.b] ?? 0) - 1);
      activeCount -= 1;
    } else {
      candidateEdge.active = true;
      candidateEdge.keepBias = -1;
    }
  }

  const edges = materializeActive(active);
  return {
    edges,
    degrees: degreesFor(points.length, edges),
    averageDegree: points.length > 0 ? (edges.length * 2) / points.length : 0,
    maxGateLength
  };
}

export function degreesFor(systemCount: number, edges: readonly GalaxyEdge[]): Uint16Array {
  const degrees = new Uint16Array(systemCount);
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined) continue;
    degrees[edge.a] = (degrees[edge.a] ?? 0) + 1;
    degrees[edge.b] = (degrees[edge.b] ?? 0) + 1;
  }
  return degrees;
}

export function connectedComponentCount(
  systemCount: number,
  edges: readonly GalaxyEdge[],
  onlyMarked?: Uint8Array
): number {
  if (systemCount === 0) return 0;
  return connectedComponentCountWithAdjacency(
    systemCount,
    buildAdjacency(systemCount, edges),
    onlyMarked
  );
}

export function buildAdjacency(systemCount: number, edges: readonly GalaxyEdge[]): GraphAdjacency {
  const degrees = new Uint32Array(systemCount);
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined) continue;
    degrees[edge.a] = (degrees[edge.a] ?? 0) + 1;
    degrees[edge.b] = (degrees[edge.b] ?? 0) + 1;
  }
  const offsets = new Uint32Array(systemCount + 1);
  for (let i = 0; i < systemCount; i += 1) {
    offsets[i + 1] = (offsets[i] ?? 0) + (degrees[i] ?? 0);
  }
  const targets = new Uint32Array(offsets[systemCount] ?? 0);
  const cursor = offsets.slice(0, systemCount);
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge === undefined) continue;
    const aWrite = cursor[edge.a] ?? 0;
    targets[aWrite] = edge.b;
    cursor[edge.a] = aWrite + 1;
    const bWrite = cursor[edge.b] ?? 0;
    targets[bWrite] = edge.a;
    cursor[edge.b] = bWrite + 1;
  }
  return { offsets, targets };
}

function connectedComponentCountWithAdjacency(
  systemCount: number,
  adjacency: GraphAdjacency,
  onlyMarked?: Uint8Array
): number {
  const visited = new Uint8Array(systemCount);
  const queue = new Int32Array(systemCount);
  let components = 0;
  for (let start = 0; start < systemCount; start += 1) {
    if (onlyMarked !== undefined && onlyMarked[start] !== 1) continue;
    if (visited[start] === 1) continue;
    components += 1;
    let read = 0;
    let write = 1;
    queue[0] = start;
    visited[start] = 1;
    while (read < write) {
      const current = queue[read] ?? 0;
      read += 1;
      const startOffset = adjacency.offsets[current] ?? 0;
      const endOffset = adjacency.offsets[current + 1] ?? startOffset;
      for (let i = startOffset; i < endOffset; i += 1) {
        const next = adjacency.targets[i] ?? 0;
        if (onlyMarked !== undefined && onlyMarked[next] !== 1) continue;
        if (visited[next] === 1) continue;
        visited[next] = 1;
        queue[write] = next;
        write += 1;
      }
    }
  }
  return components;
}

export function shortestJumpDistances(
  systemCount: number,
  edges: readonly GalaxyEdge[],
  source: number,
  maxJumps = INF_DISTANCE
): Uint16Array {
  return shortestJumpDistancesWithAdjacency(
    systemCount,
    buildAdjacency(systemCount, edges),
    source,
    maxJumps
  );
}

export function shortestJumpDistancesWithAdjacency(
  systemCount: number,
  adjacency: GraphAdjacency,
  source: number,
  maxJumps = INF_DISTANCE
): Uint16Array {
  const distances = new Uint16Array(systemCount);
  distances.fill(INF_DISTANCE);
  if (source < 0 || source >= systemCount) return distances;
  const queue = new Int32Array(systemCount);
  let read = 0;
  let write = 1;
  distances[source] = 0;
  queue[0] = source;
  while (read < write) {
    const current = queue[read] ?? 0;
    read += 1;
    const currentDistance = distances[current] ?? INF_DISTANCE;
    if (currentDistance >= maxJumps) continue;
    const startOffset = adjacency.offsets[current] ?? 0;
    const endOffset = adjacency.offsets[current + 1] ?? startOffset;
    for (let i = startOffset; i < endOffset; i += 1) {
      const next = adjacency.targets[i] ?? 0;
      if (distances[next] !== INF_DISTANCE) continue;
      distances[next] = currentDistance + 1;
      queue[write] = next;
      write += 1;
    }
  }
  return distances;
}

export function multiSourceJumpDistances(
  systemCount: number,
  edges: readonly GalaxyEdge[],
  sources: readonly number[]
): Uint16Array {
  const adjacency = buildAdjacency(systemCount, edges);
  const distances = new Uint16Array(systemCount);
  distances.fill(INF_DISTANCE);
  const queue = new Int32Array(systemCount);
  let read = 0;
  let write = 0;
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i] ?? -1;
    if (source < 0 || source >= systemCount || distances[source] === 0) continue;
    distances[source] = 0;
    queue[write] = source;
    write += 1;
  }
  while (read < write) {
    const current = queue[read] ?? 0;
    read += 1;
    const currentDistance = distances[current] ?? INF_DISTANCE;
    const startOffset = adjacency.offsets[current] ?? 0;
    const endOffset = adjacency.offsets[current + 1] ?? startOffset;
    for (let i = startOffset; i < endOffset; i += 1) {
      const next = adjacency.targets[i] ?? 0;
      if (distances[next] !== INF_DISTANCE) continue;
      distances[next] = currentDistance + 1;
      queue[write] = next;
      write += 1;
    }
  }
  return distances;
}

export function averageEdgeLength(edges: readonly GalaxyEdge[]): number {
  if (edges.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < edges.length; i += 1) total += edges[i]?.length ?? 0;
  return total / edges.length;
}

function minimumConnectedGateLength(systemCount: number, edges: readonly GalaxyEdge[]): number {
  const parent = new Int32Array(systemCount);
  for (let i = 0; i < systemCount; i += 1) parent[i] = i;
  let components = systemCount;
  let longest = 0;
  const sorted = edges.slice().sort(compareEdges);
  for (let i = 0; i < sorted.length && components > 1; i += 1) {
    const edge = sorted[i];
    if (edge === undefined) continue;
    const a = findParent(parent, edge.a);
    const b = findParent(parent, edge.b);
    if (a === b) continue;
    parent[b] = a;
    components -= 1;
    longest = Math.max(longest, edge.length);
  }
  return longest;
}

function findParent(parent: Int32Array, item: number): number {
  let current = item;
  while ((parent[current] ?? current) !== current) current = parent[current] ?? current;
  let compress = item;
  while ((parent[compress] ?? compress) !== compress) {
    const next = parent[compress] ?? compress;
    parent[compress] = current;
    compress = next;
  }
  return current;
}

function bestRemovable(
  edges: readonly ActiveEdge[],
  degrees: Uint16Array,
  options: PruneGateOptions
): number {
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  const averageDegree = options.avgGateDegree;
  const variance = options.gateDegreeVariance;
  for (let i = 0; i < edges.length; i += 1) {
    const item = edges[i];
    if (item === undefined || !item.active || item.keepBias < 0) continue;
    const edge = item.edge;
    if ((degrees[edge.a] ?? 0) <= 1 || (degrees[edge.b] ?? 0) <= 1) continue;
    const desiredA = averageDegree + (item.keepBias - 0.5) * variance * averageDegree;
    const desiredB = averageDegree + (0.5 - item.keepBias) * variance * averageDegree;
    const surplus = (degrees[edge.a] ?? 0) - desiredA + ((degrees[edge.b] ?? 0) - desiredB);
    const lowDegreeProtection =
      Math.max(0, 2.5 - (degrees[edge.a] ?? 0)) + Math.max(0, 2.5 - (degrees[edge.b] ?? 0));
    const score =
      edge.length * 0.012 +
      surplus * (0.65 - variance * 0.25) -
      lowDegreeProtection * (1.2 - variance) -
      item.keepBias * variance * 0.25;
    if (
      score > bestScore ||
      (score === bestScore && compareEdges(edge, edges[best]?.edge ?? edge) > 0)
    ) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function connectedComponentCountWithActive(
  systemCount: number,
  edges: readonly ActiveEdge[]
): number {
  return connectedComponentCount(systemCount, materializeActive(edges));
}

function materializeActive(edges: readonly ActiveEdge[]): GalaxyEdge[] {
  const result: GalaxyEdge[] = [];
  for (let i = 0; i < edges.length; i += 1) {
    const item = edges[i];
    if (item?.active === true) result.push(item.edge);
  }
  return result.sort(compareEdges);
}
