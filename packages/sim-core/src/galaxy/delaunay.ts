import type { GalaxyEdge, GalaxyPoint } from "./types.js";

interface IndexedPoint extends GalaxyPoint {
  readonly index: number;
}

interface Triangle {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

interface BoundaryEdge {
  readonly a: number;
  readonly b: number;
  count: number;
}

const EPSILON = 1e-9;

export function triangulateDelaunay(points: readonly GalaxyPoint[]): readonly GalaxyEdge[] {
  if (points.length <= 1) return [];
  if (points.length === 2) return [edgeBetween(points, 0, 1)];

  const indexed = indexedPoints(points);
  const superStart = points.length;
  const allPoints = indexed.concat(superTriangle(points, superStart));
  const order = indexed.slice().sort(compareIndexedPoints);
  let triangles: Triangle[] = [{ a: superStart, b: superStart + 1, c: superStart + 2 }];

  for (let i = 0; i < order.length; i += 1) {
    const point = order[i];
    if (point === undefined) continue;
    const bad = new Uint8Array(triangles.length);
    const boundary = new Map<string, BoundaryEdge>();
    for (let t = 0; t < triangles.length; t += 1) {
      const triangle = triangles[t];
      if (triangle === undefined) continue;
      if (circumcircleContains(allPoints, triangle, point)) {
        bad[t] = 1;
        addBoundaryEdge(boundary, triangle.a, triangle.b);
        addBoundaryEdge(boundary, triangle.b, triangle.c);
        addBoundaryEdge(boundary, triangle.c, triangle.a);
      }
    }

    const next: Triangle[] = [];
    for (let t = 0; t < triangles.length; t += 1) {
      const triangle = triangles[t];
      if (triangle !== undefined && bad[t] !== 1) next.push(triangle);
    }

    const edges = Array.from(boundary.values())
      .filter((edge) => edge.count === 1)
      .sort(compareBoundaryEdges);
    for (let e = 0; e < edges.length; e += 1) {
      const boundaryEdge = edges[e];
      if (boundaryEdge === undefined) continue;
      const triangle = makeTriangle(allPoints, boundaryEdge.a, boundaryEdge.b, point.index);
      if (triangle !== undefined) next.push(triangle);
    }
    next.sort(compareTriangles);
    triangles = next;
  }

  const edges = edgesFromTriangles(points, triangles, superStart);
  if (edges.length > 0) return edges;
  return collinearFallback(points);
}

function indexedPoints(points: readonly GalaxyPoint[]): IndexedPoint[] {
  const result: IndexedPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) throw new RangeError("Point list is inconsistent.");
    result.push({ x: point.x, y: point.y, index: i });
  }
  return result;
}

function superTriangle(points: readonly GalaxyPoint[], start: number): IndexedPoint[] {
  const bounds = pointBounds(points);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const size = span * 32;
  return [
    { index: start, x: centerX - size, y: centerY - size },
    { index: start + 1, x: centerX, y: centerY + size },
    { index: start + 2, x: centerX + size, y: centerY - size }
  ];
}

function pointBounds(points: readonly GalaxyPoint[]): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function circumcircleContains(
  points: readonly IndexedPoint[],
  triangle: Triangle,
  point: IndexedPoint
): boolean {
  const a = points[triangle.a];
  const b = points[triangle.b];
  const c = points[triangle.c];
  if (a === undefined || b === undefined || c === undefined) {
    throw new RangeError("Delaunay triangle references an unknown point.");
  }

  const ax = a.x - point.x;
  const ay = a.y - point.y;
  const bx = b.x - point.x;
  const by = b.y - point.y;
  const cx = c.x - point.x;
  const cy = c.y - point.y;
  const det =
    (ax * ax + ay * ay) * (bx * cy - by * cx) -
    (bx * bx + by * by) * (ax * cy - ay * cx) +
    (cx * cx + cy * cy) * (ax * by - ay * bx);
  const orient = orientation(a, b, c);
  if (Math.abs(orient) <= EPSILON) return false;
  const normalized = orient > 0 ? det : -det;
  return normalized > EPSILON;
}

function makeTriangle(
  points: readonly IndexedPoint[],
  aIndex: number,
  bIndex: number,
  cIndex: number
): Triangle | undefined {
  const a = points[aIndex];
  const b = points[bIndex];
  const c = points[cIndex];
  if (a === undefined || b === undefined || c === undefined) return undefined;
  const orient = orientation(a, b, c);
  if (Math.abs(orient) <= EPSILON) return undefined;
  return orient > 0 ? { a: aIndex, b: bIndex, c: cIndex } : { a: bIndex, b: aIndex, c: cIndex };
}

function edgesFromTriangles(
  points: readonly GalaxyPoint[],
  triangles: readonly Triangle[],
  superStart: number
): GalaxyEdge[] {
  const unique = new Map<string, GalaxyEdge>();
  for (let i = 0; i < triangles.length; i += 1) {
    const triangle = triangles[i];
    if (triangle === undefined) continue;
    addOutputEdge(unique, points, triangle.a, triangle.b, superStart);
    addOutputEdge(unique, points, triangle.b, triangle.c, superStart);
    addOutputEdge(unique, points, triangle.c, triangle.a, superStart);
  }
  return Array.from(unique.values()).sort(compareEdges);
}

function collinearFallback(points: readonly GalaxyPoint[]): readonly GalaxyEdge[] {
  const order = indexedPoints(points).sort(compareIndexedPoints);
  const edges: GalaxyEdge[] = [];
  for (let i = 1; i < order.length; i += 1) {
    const a = order[i - 1]?.index ?? 0;
    const b = order[i]?.index ?? 0;
    edges.push(edgeBetween(points, a, b));
  }
  return edges.sort(compareEdges);
}

function addBoundaryEdge(boundary: Map<string, BoundaryEdge>, a: number, b: number): void {
  const edge = orderedEdge(a, b);
  const key = edgeKey(edge.a, edge.b);
  const existing = boundary.get(key);
  if (existing === undefined) {
    boundary.set(key, { a: edge.a, b: edge.b, count: 1 });
  } else {
    existing.count += 1;
  }
}

function addOutputEdge(
  edges: Map<string, GalaxyEdge>,
  points: readonly GalaxyPoint[],
  a: number,
  b: number,
  superStart: number
): void {
  if (a >= superStart || b >= superStart) return;
  const edge = orderedEdge(a, b);
  const key = edgeKey(edge.a, edge.b);
  if (!edges.has(key)) edges.set(key, edgeBetween(points, edge.a, edge.b));
}

function edgeBetween(points: readonly GalaxyPoint[], a: number, b: number): GalaxyEdge {
  const first = points[a];
  const second = points[b];
  if (first === undefined || second === undefined) {
    throw new RangeError("Edge references an unknown point.");
  }
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return { a: Math.min(a, b), b: Math.max(a, b), length: Math.sqrt(dx * dx + dy * dy) };
}

function orderedEdge(a: number, b: number): { readonly a: number; readonly b: number } {
  return a < b ? { a, b } : { a: b, b: a };
}

function edgeKey(a: number, b: number): string {
  return `${a}:${b}`;
}

function orientation(a: GalaxyPoint, b: GalaxyPoint, c: GalaxyPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function compareIndexedPoints(a: IndexedPoint, b: IndexedPoint): number {
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  return a.index - b.index;
}

function compareBoundaryEdges(a: BoundaryEdge, b: BoundaryEdge): number {
  if (a.a !== b.a) return a.a - b.a;
  return a.b - b.b;
}

function compareTriangles(a: Triangle, b: Triangle): number {
  if (a.a !== b.a) return a.a - b.a;
  if (a.b !== b.b) return a.b - b.b;
  return a.c - b.c;
}

export function compareEdges(a: GalaxyEdge, b: GalaxyEdge): number {
  if (a.length !== b.length) return a.length - b.length;
  if (a.a !== b.a) return a.a - b.a;
  return a.b - b.b;
}
