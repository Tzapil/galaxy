import type { Rng } from "../rng.js";

import type { NormalizedGalaxyParams } from "./params.js";
import type { GalaxyPoint } from "./types.js";

export interface GalaxyShapeSampler {
  readonly sample: (rng: Rng) => GalaxyPoint;
  readonly contains: (point: GalaxyPoint) => boolean;
}

interface ClusterCenter {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

const TAU = Math.PI * 2;

export function createGalaxyShapeSampler(
  params: NormalizedGalaxyParams,
  rng: Rng
): GalaxyShapeSampler {
  if (params.shape === "disc") return discSampler(params.galaxyRadius);
  if (params.shape === "spiral") return spiralSampler(params.galaxyRadius, params);
  if (params.shape === "ring") return ringSampler(params.galaxyRadius);
  return clusterSampler(params.galaxyRadius, rng);
}

function discSampler(radius: number): GalaxyShapeSampler {
  return {
    sample: (rng) => {
      const angle = rng.nextFloat() * TAU;
      const distance = radius * Math.sqrt(rng.nextFloat());
      return pointFromPolar(angle, distance);
    },
    contains: (point) => squaredRadius(point) <= radius * radius
  };
}

function spiralSampler(
  radius: number,
  params: Pick<NormalizedGalaxyParams, "armCount" | "armTightness">
): GalaxyShapeSampler {
  const armCount = Math.max(1, params.armCount);
  const spread = 0.58 - params.armTightness * 0.32;
  const twist = 2.0 + params.armTightness * 5.2;
  return {
    sample: (rng) => {
      const arm = rng.nextInt(0, armCount);
      const t = Math.sqrt(rng.nextFloat());
      const distance = radius * t;
      const armAngle = (arm / armCount) * TAU;
      const angle = armAngle + t * twist + centered(rng.nextFloat()) * spread * (1.05 - t * 0.45);
      const radialJitter = 1 + centered(rng.nextFloat()) * 0.16;
      return pointFromPolar(angle, Math.min(radius, Math.max(0, distance * radialJitter)));
    },
    contains: (point) => squaredRadius(point) <= radius * radius
  };
}

function ringSampler(radius: number): GalaxyShapeSampler {
  return {
    sample: (rng) => {
      const angle = rng.nextFloat() * TAU;
      const bell = (rng.nextFloat() + rng.nextFloat() + rng.nextFloat()) / 3 - 0.5;
      const distance = radius * Math.max(0.44, Math.min(0.98, 0.76 + bell * 0.34));
      return pointFromPolar(angle, distance);
    },
    contains: (point) => {
      const distance = Math.sqrt(squaredRadius(point));
      return distance >= radius * 0.25 && distance <= radius;
    }
  };
}

function clusterSampler(radius: number, rng: Rng): GalaxyShapeSampler {
  const centers = createClusterCenters(radius, rng);
  return {
    sample: (sampleRng) => {
      const center = centers[sampleRng.nextInt(0, centers.length)] ?? centers[0];
      if (center === undefined) throw new RangeError("Cluster sampler has no centers.");
      const angle = sampleRng.nextFloat() * TAU;
      const localRadius = center.radius * Math.sqrt(sampleRng.nextFloat());
      return {
        x: center.x + Math.cos(angle) * localRadius,
        y: center.y + Math.sin(angle) * localRadius
      };
    },
    contains: (point) => {
      for (let i = 0; i < centers.length; i += 1) {
        const center = centers[i];
        if (center === undefined) continue;
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        if (dx * dx + dy * dy <= center.radius * center.radius) return true;
      }
      return false;
    }
  };
}

function createClusterCenters(radius: number, rng: Rng): readonly ClusterCenter[] {
  const centers: ClusterCenter[] = [];
  const count = 7;
  for (let i = 0; i < count; i += 1) {
    const base = (i / count) * TAU;
    const angle = base + centered(rng.nextFloat()) * 0.38;
    const distance = radius * (0.2 + rng.nextFloat() * 0.58);
    centers.push({
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      radius: radius * (0.23 + rng.nextFloat() * 0.1)
    });
  }
  centers.push({ x: 0, y: 0, radius: radius * 0.32 });
  return centers;
}

function pointFromPolar(angle: number, distance: number): GalaxyPoint {
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance
  };
}

function centered(value: number): number {
  return value * 2 - 1;
}

function squaredRadius(point: GalaxyPoint): number {
  return point.x * point.x + point.y * point.y;
}
