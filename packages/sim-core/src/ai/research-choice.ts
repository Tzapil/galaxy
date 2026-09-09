import { findBottleneck } from "./bottleneck.js";
import { personalityWeightsForFaction } from "./utility.js";
import type { Rng } from "../rng.js";
import type { StageOneData, StageOneTech, StageOneTechEffect } from "../stage-one/data.js";
import { MAX_REPEATABLE_TECH_LEVEL, repeatableCostAtLevel, totalCost } from "../tech/repeatable.js";
import type { StageOneWorld } from "../world/state.js";

export interface ResearchChoice {
  readonly tech: number;
  readonly score: number;
  readonly relevance: number;
  readonly personalityWeight: number;
  readonly cost: number;
  readonly bottleneckResource: number;
  readonly reason: string;
}

export function chooseResearchTopic(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tick: number,
  rng?: Rng
): ResearchChoice | undefined {
  let best: ResearchChoice | undefined;
  const bottleneck = findBottleneck(data, world, faction);
  const bottleneckResource = bottleneck?.resource ?? -1;
  for (let tech = 0; tech < data.techs.length; tech += 1) {
    const definition = data.techs[tech];
    if (definition === undefined) throw new RangeError("Technology table is inconsistent.");
    if (!isResearchCandidate(data, world, faction, tech, definition)) continue;
    const relevance = relevanceByMrp(data, definition, bottleneckResource);
    const personalityWeight = personalityWeightForTech(data, world, faction, definition);
    const level = world.techState.level(tech, faction);
    const cost = Math.max(1, totalCost(repeatableCostAtLevel(definition, level + 1)));
    const noise =
      rng === undefined ? deterministicNoise(faction, tech, tick) : rng.nextFloat() * 0.0001;
    const score = (relevance * personalityWeight) / cost + noise;
    const choice = {
      tech,
      score,
      relevance,
      personalityWeight,
      cost,
      bottleneckResource,
      reason: reasonFor(data, definition, bottleneckResource, relevance, personalityWeight)
    };
    if (isBetter(choice, best)) best = choice;
  }
  return best;
}

export function personalityWeightForTech(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tech: StageOneTech
): number {
  const weights = personalityWeightsForFaction(data, world, faction);
  const branch = tech.branch.toLowerCase();
  if (branch.includes("weapon") || branch.includes("defense") || branch.includes("war")) {
    return weights.military;
  }
  if (branch.includes("propulsion") || branch.includes("logistics") || branch.includes("fleet")) {
    return weights.logistics;
  }
  if (branch.includes("biology") || branch.includes("habitat") || branch.includes("growth")) {
    return weights.growth;
  }
  if (branch.includes("industry") || branch.includes("construction")) {
    return weights.industry;
  }
  return weights.research;
}

export function isResearchCandidate(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tech: number,
  definition = data.techs[tech]
): boolean {
  if (definition === undefined) return false;
  if (definition.id === "start") return false;
  const level = world.techState.level(tech, faction);
  if (!definition.repeatable && level > 0) return false;
  if (definition.repeatable && level >= MAX_REPEATABLE_TECH_LEVEL) return false;
  const prereqs = world.techGraph.prerequisites[tech] ?? [];
  for (let i = 0; i < prereqs.length; i += 1) {
    const prereq = prereqs[i] ?? -1;
    if (prereq < 0) return false;
    if (!world.techState.hasResearched(faction, prereq)) return false;
  }
  return true;
}

function relevanceByMrp(
  data: StageOneData,
  tech: StageOneTech,
  bottleneckResource: number
): number {
  let score = baseBranchRelevance(tech);
  if (bottleneckResource < 0) return score;
  for (let i = 0; i < tech.effects.length; i += 1) {
    score = Math.max(score, effectRelevance(data, tech.effects[i], bottleneckResource));
  }
  for (let i = 0; i < tech.effectPerLevel.length; i += 1) {
    score = Math.max(score, effectRelevance(data, tech.effectPerLevel[i], bottleneckResource));
  }
  return score;
}

function effectRelevance(
  data: StageOneData,
  effect: StageOneTechEffect | undefined,
  bottleneckResource: number
): number {
  if (effect === undefined) return 0.15;
  if (effect.type === "unlockBuilding") {
    return buildingHelpsResource(data, effect.id, bottleneckResource) ? 9 : 1.5;
  }
  if (effect.type === "modifier") {
    return modifierHelpsResource(data, effect, bottleneckResource) ? 7 : 1.4;
  }
  if (effect.type === "unlockModule") {
    return moduleHelpsResource(data, effect.id, bottleneckResource) ? 5 : 1.2;
  }
  if (effect.type === "unlockHull") return 2.2;
  if (effect.type === "ability") return 1.6;
  return 0.15;
}

function buildingHelpsResource(
  data: StageOneData,
  buildingId: string,
  bottleneckResource: number
): boolean {
  const building = data.buildings[data.buildingIndex.get(buildingId) ?? -1];
  if (building === undefined) return false;
  const recipe = data.batchRecipes[building.batchRecipe];
  if (recipe === undefined) return false;
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    if ((recipe.outputs[i]?.resource ?? -1) === bottleneckResource) return true;
  }
  return false;
}

function modifierHelpsResource(
  data: StageOneData,
  effect: StageOneTechEffect,
  bottleneckResource: number
): boolean {
  const target = effect.target;
  if (target === "global") {
    return (
      effect.stat === "recipeOutput" ||
      (effect.stat === "foodOutput" && data.resources[bottleneckResource]?.id === "food") ||
      (effect.stat === "powerOutput" && bottleneckResource === data.energyResource)
    );
  }
  const colon = target.indexOf(":");
  if (colon <= 0) return false;
  const kind = target.slice(0, colon);
  const id = target.slice(colon + 1);
  if (kind === "recipe") return recipeOutputsResource(data, id, bottleneckResource);
  if (kind === "building") return buildingHelpsResource(data, id, bottleneckResource);
  if (kind === "family")
    return familyHelpsResource(id, data.resources[bottleneckResource]?.id ?? "");
  return false;
}

function recipeOutputsResource(data: StageOneData, recipeId: string, resource: number): boolean {
  const recipe = data.batchRecipes[data.batchRecipeIndex.get(recipeId) ?? -1];
  if (recipe === undefined) return false;
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    if ((recipe.outputs[i]?.resource ?? -1) === resource) return true;
  }
  return false;
}

function moduleHelpsResource(data: StageOneData, moduleId: string, resource: number): boolean {
  const module = data.modules[data.moduleIndex.get(moduleId) ?? -1];
  if (module === undefined) return false;
  return familyHelpsResource(module.family, data.resources[resource]?.id ?? "");
}

function familyHelpsResource(family: string, resourceId: string): boolean {
  if (resourceId === "fuel" && (family === "fuel_tank" || family === "thruster")) return true;
  if (resourceId === "hull_frames" && (family === "armor" || family === "construction"))
    return true;
  if (resourceId === "alloys" && family === "armor") return true;
  if (resourceId === "electronics" && (family === "reactor" || family === "sensor")) return true;
  if (resourceId.includes("weapon") && isWeaponFamily(family)) return true;
  return false;
}

function baseBranchRelevance(tech: StageOneTech): number {
  if (tech.repeatable) return 0.6;
  const branch = tech.branch.toLowerCase();
  if (branch.includes("core") || branch.includes("industry")) return 2;
  if (branch.includes("propulsion") || branch.includes("logistics")) return 1.5;
  if (branch.includes("weapon") || branch.includes("defense")) return 1.4;
  return 1;
}

function reasonFor(
  data: StageOneData,
  tech: StageOneTech,
  bottleneckResource: number,
  relevance: number,
  personalityWeight: number
): string {
  const resource =
    bottleneckResource >= 0 ? (data.resources[bottleneckResource]?.id ?? "unknown") : "none";
  return `bottleneck=${resource}; relevance=${relevance.toFixed(3)}; personality=${personalityWeight.toFixed(3)}`;
}

function isBetter(candidate: ResearchChoice, best: ResearchChoice | undefined): boolean {
  if (best === undefined) return true;
  if (candidate.score > best.score + 1e-12) return true;
  return Math.abs(candidate.score - best.score) <= 1e-12 && candidate.tech < best.tech;
}

function deterministicNoise(faction: number, tech: number, tick: number): number {
  let x = ((faction + 1) * 0x9e3779b1) ^ ((tech + 1) * 0x85ebca6b) ^ (tick * 0xc2b2ae35);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  return ((x >>> 0) / 0x100000000) * 0.0001;
}

function isWeaponFamily(family: string): boolean {
  return family === "laser" || family === "kinetic" || family === "missile" || family === "plasma";
}
