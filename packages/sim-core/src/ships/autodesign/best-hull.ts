import type { StageOneData, StageOneDoctrine } from "../../stage-one/data.js";
import type { TechModifierCache } from "../../tech/modifiers.js";
import type { FactionTechState } from "../../tech/state.js";
import { isHullUnlocked, isModuleUnlocked } from "../../tech/unlock.js";

import { type ShipDesignStats } from "../design-stats.js";
import { validateShipDesign } from "../validity.js";

import { designShip, type AutoDesignOptions, type AutoDesignResult } from "./greedy.js";
import { meetsDoctrineRequirements, type EnemyShipProfile } from "./score.js";

export interface BestDesignOptions {
  readonly budget?: number;
  readonly maxCost?: number;
  readonly enemy?: EnemyShipProfile;
  readonly modifiers?: TechModifierCache;
  readonly faction?: number;
  readonly techState?: FactionTechState;
  readonly maxTier?: number;
}

export interface BestDesignResult extends AutoDesignResult {
  readonly hull: number;
  readonly scorePerCredit: number;
  readonly affordableCount: number;
  readonly budgetedScore: number;
}

export function availableModulesForDesign(
  data: StageOneData,
  options: BestDesignOptions = {}
): readonly number[] {
  const modules: number[] = [];
  for (let module = 0; module < data.modules.length; module += 1) {
    const item = data.modules[module];
    if (item === undefined) throw new RangeError("Module table is inconsistent.");
    if (item.phase !== 1) continue;
    if (options.maxTier !== undefined && item.tier > options.maxTier) continue;
    if (
      options.techState !== undefined &&
      !isModuleUnlocked(data, options.techState, options.faction ?? 0, module)
    ) {
      continue;
    }
    modules.push(module);
  }
  modules.sort((a, b) => {
    const left = data.modules[a]?.id ?? "";
    const right = data.modules[b]?.id ?? "";
    return left.localeCompare(right);
  });
  return modules;
}

export function availableHullsForDesign(
  data: StageOneData,
  doctrine: StageOneDoctrine,
  options: BestDesignOptions = {}
): readonly number[] {
  const hulls: number[] = [];
  for (let hull = 0; hull < data.hulls.length; hull += 1) {
    const item = data.hulls[hull];
    if (item === undefined) throw new RangeError("Hull table is inconsistent.");
    if (item.phase !== 1) continue;
    if (options.maxTier !== undefined && item.tier > options.maxTier) continue;
    if (!doctrineAllowsHull(doctrine, item.id)) continue;
    if (
      options.techState !== undefined &&
      !isHullUnlocked(data, options.techState, options.faction ?? 0, hull)
    ) {
      continue;
    }
    hulls.push(hull);
  }
  hulls.sort((a, b) => {
    const left = data.hulls[a]?.tier ?? 0;
    const right = data.hulls[b]?.tier ?? 0;
    if (left !== right) return left - right;
    return (data.hulls[a]?.id ?? "").localeCompare(data.hulls[b]?.id ?? "");
  });
  return hulls;
}

export function bestDesign(
  data: StageOneData,
  doctrine: StageOneDoctrine,
  options: BestDesignOptions = {}
): BestDesignResult | undefined {
  const budget = options.budget ?? options.maxCost ?? Number.POSITIVE_INFINITY;
  const costCap = options.maxCost ?? budget;
  const modulePool = availableModulesForDesign(data, options);
  const hullPool = availableHullsForDesign(data, doctrine, options);
  let best: BestDesignResult | undefined;

  for (let i = 0; i < hullPool.length; i += 1) {
    const hull = hullPool[i] ?? -1;
    const designOptions: AutoDesignOptions = {
      modulePool,
      maxCost: costCap,
      ...(options.enemy === undefined ? {} : { enemy: options.enemy }),
      ...(options.modifiers === undefined ? {} : { modifiers: options.modifiers }),
      ...(options.faction === undefined ? {} : { faction: options.faction })
    };
    const result = designShip(data, hull, doctrine, designOptions);
    if (result === undefined) continue;
    if (!meetsDoctrineRequirements(result.stats, doctrine)) continue;
    const row = budgetedResult(hull, result, budget);
    if (row.affordableCount <= 0) continue;
    best = chooseBudgetedBetter(data, best, row);
  }

  return best;
}

export function designIsUseful(
  data: StageOneData,
  result: AutoDesignResult,
  doctrine: StageOneDoctrine
): boolean {
  return (
    validateShipDesign(data, result.design).ok && meetsDoctrineRequirements(result.stats, doctrine)
  );
}

function budgetedResult(hull: number, result: AutoDesignResult, budget: number): BestDesignResult {
  const affordableCount = Number.isFinite(budget)
    ? Math.floor(budget / Math.max(0.000001, result.cost))
    : 1;
  const scorePerCredit = result.score / Math.max(0.000001, result.cost);
  const budgetedScore =
    Number.isFinite(budget) && budget > 0
      ? (result.score * affordableCount) / budget
      : scorePerCredit;
  return {
    ...result,
    hull,
    scorePerCredit,
    affordableCount,
    budgetedScore
  };
}

function chooseBudgetedBetter(
  data: StageOneData,
  best: BestDesignResult | undefined,
  candidate: BestDesignResult
): BestDesignResult {
  if (best === undefined) return candidate;
  if (candidate.budgetedScore > best.budgetedScore + 1e-12) return candidate;
  if (Math.abs(candidate.budgetedScore - best.budgetedScore) <= 1e-12) {
    if (candidate.scorePerCredit > best.scorePerCredit + 1e-12) return candidate;
    if (
      Math.abs(candidate.scorePerCredit - best.scorePerCredit) <= 1e-12 &&
      compareStats(candidate.stats, best.stats) > 0
    ) {
      return candidate;
    }
  }
  void data;
  return best;
}

function compareStats(left: ShipDesignStats, right: ShipDesignStats): number {
  if (left.effectiveHitPoints !== right.effectiveHitPoints) {
    return left.effectiveHitPoints > right.effectiveHitPoints ? 1 : -1;
  }
  if (left.cost !== right.cost) return left.cost < right.cost ? 1 : -1;
  return 0;
}

function doctrineAllowsHull(doctrine: StageOneDoctrine, hullId: string): boolean {
  for (let i = 0; i < doctrine.hulls.length; i += 1) {
    if (doctrine.hulls[i] === hullId) return true;
  }
  return false;
}
