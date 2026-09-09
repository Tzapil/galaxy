import type { StageOneData, StageOneDoctrine } from "../../stage-one/data.js";
import type { TechModifierCache } from "../../tech/modifiers.js";
import type { ShipDesign, ShipDesignStats } from "../design-stats.js";
import { calculateDesignStats } from "../design-stats.js";
import { moduleBundleCost } from "../module.js";
import { validateShipDesign, type ShipDesignValidityOptions } from "../validity.js";

import { applyMove, singleMoves, type AutoDesignMove } from "./moves.js";
import { scoreDesign, type EnemyShipProfile } from "./score.js";

export interface AutoDesignOptions {
  readonly modulePool: readonly number[];
  readonly maxCost?: number;
  readonly enemy?: EnemyShipProfile;
  readonly modifiers?: TechModifierCache;
  readonly faction?: number;
  readonly maxIterations?: number;
  readonly minEfficiency?: number;
}

export interface AutoDesignResult {
  readonly design: ShipDesign;
  readonly stats: ShipDesignStats;
  readonly score: number;
  readonly cost: number;
  readonly iterations: number;
}

interface CandidateMove {
  readonly design: ShipDesign;
  readonly efficiency: number;
  readonly scoreDelta: number;
}

const DEFAULT_MAX_ITERATIONS = 200;

export function cheapestReactor(data: StageOneData, modulePool: readonly number[]): number {
  let best = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < modulePool.length; i += 1) {
    const moduleIndex = modulePool[i] ?? -1;
    const module = data.modules[moduleIndex];
    if (module === undefined || module.family !== "reactor") continue;
    const cost = moduleBundleCost(data, module);
    if (
      cost < bestCost - 1e-9 ||
      (Math.abs(cost - bestCost) <= 1e-9 &&
        module.id.localeCompare(data.modules[best]?.id ?? "") < 0)
    ) {
      best = moduleIndex;
      bestCost = cost;
    }
  }
  return best;
}

export function designShip(
  data: StageOneData,
  hull: number,
  doctrine: StageOneDoctrine,
  options: AutoDesignOptions
): AutoDesignResult | undefined {
  const reactor = cheapestReactor(data, options.modulePool);
  if (reactor < 0) return undefined;
  let current: ShipDesign = { hull, modules: [reactor] };
  const faction = options.faction ?? 0;
  if (!validateShipDesign(data, current, validityOptionsFrom(options, faction)).ok) {
    return undefined;
  }

  let iterations = 0;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const minEfficiency = options.minEfficiency ?? 0;
  for (; iterations < maxIterations; iterations += 1) {
    const baseScore = scoreDesign(
      data,
      current,
      doctrine,
      options.enemy,
      options.modifiers,
      faction
    );
    const baseCost = calculateDesignStats(data, current, options.modifiers, faction).cost;
    let best = bestSimpleMove(data, current, doctrine, baseScore, baseCost, options);
    if (best === undefined) {
      best = bestCompoundMove(data, current, doctrine, baseScore, baseCost, options);
    }
    if (best === undefined || best.efficiency <= minEfficiency) break;
    current = best.design;
  }

  const stats = calculateDesignStats(data, current, options.modifiers, faction);
  return {
    design: current,
    stats,
    score: scoreDesign(data, current, doctrine, options.enemy, options.modifiers, faction),
    cost: stats.cost,
    iterations
  };
}

function bestSimpleMove(
  data: StageOneData,
  current: ShipDesign,
  doctrine: StageOneDoctrine,
  baseScore: number,
  baseCost: number,
  options: AutoDesignOptions
): CandidateMove | undefined {
  let best: CandidateMove | undefined;
  const moves = singleMoves(data, current, options.modulePool);
  for (let i = 0; i < moves.length; i += 1) {
    best = chooseBetterCandidate(
      best,
      candidateForMove(data, current, moves[i], doctrine, baseScore, baseCost, options)
    );
  }
  return best;
}

function bestCompoundMove(
  data: StageOneData,
  current: ShipDesign,
  doctrine: StageOneDoctrine,
  baseScore: number,
  baseCost: number,
  options: AutoDesignOptions
): CandidateMove | undefined {
  const targets = singleMoves(data, current, options.modulePool)
    .map((move) => ({ move, design: applyMove(current, move) }))
    .filter((item) => !isFeasible(data, item.design, options))
    .map((item) => ({
      move: item.move,
      scoreDelta:
        scoreDesign(
          data,
          item.design,
          doctrine,
          options.enemy,
          options.modifiers,
          options.faction ?? 0
        ) - baseScore
    }))
    .filter((item) => item.scoreDelta > 1e-9)
    .sort((a, b) => b.scoreDelta - a.scoreDelta);

  let best: CandidateMove | undefined;
  const enablingMoves = singleMoves(data, current, options.modulePool);
  const targetLimit = Math.min(10, targets.length);
  for (let target = 0; target < targetLimit; target += 1) {
    const targetMove = targets[target]?.move;
    if (targetMove === undefined) continue;
    for (let enable = 0; enable < enablingMoves.length; enable += 1) {
      const enabled = applyMove(current, enablingMoves[enable] as AutoDesignMove);
      if (!isFeasible(data, enabled, options)) continue;
      const candidate = applyMove(enabled, targetMove);
      best = chooseBetterCandidate(
        best,
        candidateForDesign(data, candidate, doctrine, baseScore, baseCost, options)
      );
    }
    if (best !== undefined) return best;
  }
  return best;
}

function candidateForMove(
  data: StageOneData,
  current: ShipDesign,
  move: AutoDesignMove | undefined,
  doctrine: StageOneDoctrine,
  baseScore: number,
  baseCost: number,
  options: AutoDesignOptions
): CandidateMove | undefined {
  if (move === undefined) return undefined;
  return candidateForDesign(data, applyMove(current, move), doctrine, baseScore, baseCost, options);
}

function candidateForDesign(
  data: StageOneData,
  design: ShipDesign,
  doctrine: StageOneDoctrine,
  baseScore: number,
  baseCost: number,
  options: AutoDesignOptions
): CandidateMove | undefined {
  if (!isFeasible(data, design, options)) return undefined;
  const faction = options.faction ?? 0;
  const cost = calculateDesignStats(data, design, options.modifiers, faction).cost;
  if (options.maxCost !== undefined && cost > options.maxCost + 1e-9) return undefined;
  const score = scoreDesign(data, design, doctrine, options.enemy, options.modifiers, faction);
  const scoreDelta = score - baseScore;
  if (scoreDelta <= 1e-9) return undefined;
  return {
    design,
    scoreDelta,
    efficiency: scoreDelta / Math.max(0.01, cost - baseCost)
  };
}

function chooseBetterCandidate(
  best: CandidateMove | undefined,
  candidate: CandidateMove | undefined
): CandidateMove | undefined {
  if (candidate === undefined) return best;
  if (best === undefined) return candidate;
  if (candidate.efficiency > best.efficiency + 1e-12) return candidate;
  if (
    Math.abs(candidate.efficiency - best.efficiency) <= 1e-12 &&
    candidate.scoreDelta > best.scoreDelta
  ) {
    return candidate;
  }
  return best;
}

function isFeasible(data: StageOneData, design: ShipDesign, options: AutoDesignOptions): boolean {
  return validateShipDesign(data, design, validityOptionsFrom(options, options.faction ?? 0)).ok;
}

function validityOptionsFrom(
  options: AutoDesignOptions,
  faction: number
): ShipDesignValidityOptions {
  return {
    faction,
    ...(options.maxCost === undefined ? {} : { maxCost: options.maxCost }),
    ...(options.modifiers === undefined ? {} : { modifiers: options.modifiers })
  };
}
