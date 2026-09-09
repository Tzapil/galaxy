import type { StageOneTech } from "../stage-one/data.js";

export const MAX_REPEATABLE_TECH_LEVEL = 40;
export const REPEATABLE_EFFECT_PER_LEVEL = 1.02;

export interface TechDataCost {
  readonly physics: number;
  readonly engineering: number;
  readonly bio: number;
}

export function techBaseCost(tech: StageOneTech): TechDataCost {
  return tech.repeatable
    ? {
        physics: tech.basePhysicsCost,
        engineering: tech.baseEngineeringCost,
        bio: tech.baseBioCost
      }
    : {
        physics: tech.physicsCost,
        engineering: tech.engineeringCost,
        bio: tech.bioCost
      };
}

export function repeatableCostAtLevel(tech: StageOneTech, nextLevel: number): TechDataCost {
  if (!tech.repeatable) return techBaseCost(tech);
  const level = clampRepeatableLevel(nextLevel);
  const growth = Math.pow(tech.costGrowth, Math.max(0, level - 1));
  return {
    physics: tech.basePhysicsCost * growth,
    engineering: tech.baseEngineeringCost * growth,
    bio: tech.baseBioCost * growth
  };
}

export function repeatableEffectMultiplier(valuePerLevel: number, level: number): number {
  return Math.pow(valuePerLevel, clampRepeatableLevel(level));
}

export function clampRepeatableLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(MAX_REPEATABLE_TECH_LEVEL, Math.trunc(level)));
}

export function totalCost(cost: TechDataCost): number {
  return cost.physics + cost.engineering + cost.bio;
}
