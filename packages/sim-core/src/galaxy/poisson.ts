import type { Rng } from "../rng.js";

import type { GalaxyShapeSampler } from "./shapes.js";
import type { GalaxyPoint } from "./types.js";

export interface PoissonDiskOptions {
  readonly count: number;
  readonly minDistance: number;
  readonly radius: number;
  readonly maxAttemptsPerPoint?: number;
}

export class PoissonDiskError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PoissonDiskError";
  }
}

export function poissonDiskSample(
  rng: Rng,
  sampler: GalaxyShapeSampler,
  options: PoissonDiskOptions
): readonly GalaxyPoint[] {
  if (options.count <= 0) return [];
  if (options.minDistance <= 0) throw new RangeError("minDistance must be positive.");

  const cellSize = options.minDistance / Math.SQRT2;
  const min = -options.radius;
  const width = Math.ceil((options.radius * 2) / cellSize) + 1;
  const grid = new Int32Array(width * width);
  grid.fill(-1);
  const points: GalaxyPoint[] = [];
  const minDistanceSq = options.minDistance * options.minDistance;
  const attemptsLimit = Math.max(
    options.count * (options.maxAttemptsPerPoint ?? 1600),
    options.count * 120
  );

  let attempts = 0;
  while (points.length < options.count && attempts < attemptsLimit) {
    attempts += 1;
    const candidate = sampler.sample(rng);
    if (!sampler.contains(candidate)) continue;
    if (candidate.x < min || candidate.y < min) continue;
    if (candidate.x > options.radius || candidate.y > options.radius) continue;
    const cellX = Math.floor((candidate.x - min) / cellSize);
    const cellY = Math.floor((candidate.y - min) / cellSize);
    if (cellX < 0 || cellY < 0 || cellX >= width || cellY >= width) continue;
    if (!hasNeighborTooClose(points, grid, width, cellX, cellY, candidate, minDistanceSq)) {
      grid[cellY * width + cellX] = points.length;
      points.push(candidate);
    }
  }

  if (points.length !== options.count) {
    throw new PoissonDiskError(
      `Could place only ${points.length}/${options.count} systems at minDistance ${options.minDistance.toFixed(
        3
      )}.`
    );
  }

  return points;
}

export function minimumSquaredDistance(points: readonly GalaxyPoint[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < points.length; j += 1) {
      const b = points[j];
      if (b === undefined) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      minimum = Math.min(minimum, dx * dx + dy * dy);
    }
  }
  return minimum;
}

function hasNeighborTooClose(
  points: readonly GalaxyPoint[],
  grid: Int32Array,
  width: number,
  cellX: number,
  cellY: number,
  candidate: GalaxyPoint,
  minDistanceSq: number
): boolean {
  const minX = Math.max(0, cellX - 2);
  const maxX = Math.min(width - 1, cellX + 2);
  const minY = Math.max(0, cellY - 2);
  const maxY = Math.min(width - 1, cellY + 2);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const pointIndex = grid[y * width + x] ?? -1;
      if (pointIndex < 0) continue;
      const point = points[pointIndex];
      if (point === undefined) continue;
      const dx = point.x - candidate.x;
      const dy = point.y - candidate.y;
      if (dx * dx + dy * dy < minDistanceSq) return true;
    }
  }
  return false;
}
