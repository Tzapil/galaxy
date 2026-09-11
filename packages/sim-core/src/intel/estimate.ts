import { Rng } from "../rng.js";
import type { EnemyShipProfile } from "../ships/autodesign/score.js";

import { IntelMemory, IntelSource } from "./memory.js";

export interface IntelEstimate extends EnemyShipProfile {
  readonly strength: number;
  readonly kineticFraction: number;
  readonly laserFraction: number;
  readonly missileFraction: number;
  readonly plasmaFraction: number;
  readonly observedTick: number;
  readonly confidence: number;
  readonly errorFraction: number;
}

export function estimateIntel(
  memory: IntelMemory,
  observer: number,
  target: number,
  tick: number,
  rootRng: Rng
): IntelEstimate | undefined {
  const row = memory.latestRow(observer, target, tick);
  if (row < 0) return undefined;
  const age = Math.max(0, tick - (memory.observedTick[row] ?? tick));
  const errorFraction = Math.min(0.75, baseError(memory.source[row] as IntelSource) + age / 7300);
  const rng = rootRng.derive(
    `intel:${observer}:${target}:${memory.observedTick[row] ?? 0}:${tick}`
  );
  return {
    strength: noisyPositive(memory.strength[row] ?? 0, errorFraction, rng),
    kineticFraction: noisyFraction(memory.kineticFraction[row] ?? 0, errorFraction, rng),
    laserFraction: noisyFraction(memory.laserFraction[row] ?? 0, errorFraction, rng),
    missileFraction: noisyFraction(memory.missileFraction[row] ?? 0, errorFraction, rng),
    plasmaFraction: noisyFraction(memory.plasmaFraction[row] ?? 0, errorFraction, rng),
    shieldFraction: noisyFraction(memory.shieldFraction[row] ?? 0, errorFraction, rng),
    armorRating: noisyPositive(memory.armorRating[row] ?? 0, errorFraction, rng),
    observedTick: memory.observedTick[row] ?? 0,
    confidence: 1 - errorFraction,
    errorFraction
  };
}

export function enemyProfileFromIntel(estimate: IntelEstimate): EnemyShipProfile {
  return {
    shieldFraction: estimate.shieldFraction,
    armorRating: estimate.armorRating,
    kineticFraction: estimate.kineticFraction,
    laserFraction: estimate.laserFraction,
    missileFraction: estimate.missileFraction,
    plasmaFraction: estimate.plasmaFraction
  };
}

/** Conservative capability input reserved for the Stage 7 war utility. */
export function estimatedEnemyCapability(estimate: IntelEstimate | undefined): number {
  if (estimate === undefined) return Number.POSITIVE_INFINITY;
  return estimate.strength / Math.max(0.1, estimate.confidence);
}

function baseError(source: IntelSource): number {
  if (source === IntelSource.Battle) return 0.02;
  if (source === IntelSource.Scout) return 0.07;
  return 0.15;
}

function noisyFraction(value: number, error: number, rng: Rng): number {
  return Math.max(0, Math.min(1, value + centered(rng) * error));
}

function noisyPositive(value: number, error: number, rng: Rng): number {
  return Math.max(0, value * (1 + centered(rng) * error));
}

function centered(rng: Rng): number {
  return rng.nextFloat() * 2 - 1;
}
