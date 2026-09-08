import type { StageOneData, StageOnePersonalityWeights } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export type UtilityAxis = keyof StageOnePersonalityWeights;

export interface UtilityOption<T> {
  readonly value: T;
  readonly baseScore: number;
  readonly axis: UtilityAxis;
  readonly tieBreak: number;
}

export interface UtilityChoice<T> {
  readonly value: T;
  readonly score: number;
  readonly axis: UtilityAxis;
}

export function personalityWeightsForFaction(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): StageOnePersonalityWeights {
  const count = data.personalities.length;
  if (count === 0) return balancedWeights();
  const preferred =
    (world.factions.characterExpansion[faction] ?? 1) > (world.factions.characterIndustry[faction] ?? 1)
      ? "expansionist"
      : (world.factions.characterIndustry[faction] ?? 1) > 1.05
        ? "industrialist"
        : "default";
  const index = data.personalityIndex.get(preferred) ?? faction % count;
  return data.personalities[index]?.weights ?? data.personalities[0]?.weights ?? balancedWeights();
}

export function chooseUtilityOption<T>(
  weights: StageOnePersonalityWeights,
  options: readonly UtilityOption<T>[]
): UtilityChoice<T> | undefined {
  let best: UtilityOption<T> | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i];
    if (option === undefined) continue;
    const score = option.baseScore * weights[option.axis];
    if (
      score > bestScore + 1e-9 ||
      (Math.abs(score - bestScore) <= 1e-9 && option.tieBreak < (best?.tieBreak ?? Infinity))
    ) {
      best = option;
      bestScore = score;
    }
  }
  if (best === undefined) return undefined;
  return { value: best.value, score: bestScore, axis: best.axis };
}

function balancedWeights(): StageOnePersonalityWeights {
  return {
    growth: 1,
    industry: 1,
    research: 1,
    military: 1,
    logistics: 1,
    stockpile: 1,
    risk: 1
  };
}
