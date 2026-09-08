import type { ResourceAmount, StageOneBatchRecipe, StageOneData } from "../../stage-one/data.js";

export interface MrpResourceTarget {
  readonly kind: "resource";
  readonly resource: number;
  readonly amountPerDay: number;
}

export interface MrpHullTarget {
  readonly kind: "hull";
  readonly hull: number;
  readonly count: number;
  readonly horizonDays: number;
}

export type MrpTarget = MrpResourceTarget | MrpHullTarget;

export interface MrpTraceStep {
  readonly resource: number;
  readonly depth: number;
  readonly amountPerDay: number;
}

export interface MrpExplosion {
  readonly requiredPerDay: Float64Array;
  readonly directPerDay: Float64Array;
  readonly trace: readonly MrpTraceStep[];
  readonly operations: number;
  readonly maxDepth: number;
}

export interface MrpExplosionOptions {
  readonly maxDepth?: number;
}

export function explodeDemand(
  data: StageOneData,
  targets: readonly MrpTarget[],
  options: MrpExplosionOptions = {}
): MrpExplosion {
  const requiredPerDay = new Float64Array(data.resources.length);
  const directPerDay = new Float64Array(data.resources.length);
  const trace: MrpTraceStep[] = [];
  const maxDepth = options.maxDepth ?? 16;
  let operations = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (target === undefined) continue;
    if (target.kind === "resource") {
      if (target.amountPerDay <= 0) continue;
      directPerDay[target.resource] = (directPerDay[target.resource] ?? 0) + target.amountPerDay;
      operations += explodeResource(
        data,
        target.resource,
        target.amountPerDay,
        requiredPerDay,
        trace,
        0,
        maxDepth
      );
    } else {
      const hull = data.hulls[target.hull];
      if (hull === undefined || target.count <= 0 || target.horizonDays <= 0) continue;
      const multiplier = target.count / target.horizonDays;
      for (let item = 0; item < hull.buildRecipe.length; item += 1) {
        const cost = hull.buildRecipe[item];
        if (cost === undefined) throw new RangeError("Hull build recipe is inconsistent.");
        const amountPerDay = cost.amount * multiplier;
        directPerDay[cost.resource] = (directPerDay[cost.resource] ?? 0) + amountPerDay;
        operations += explodeResource(
          data,
          cost.resource,
          amountPerDay,
          requiredPerDay,
          trace,
          0,
          maxDepth
        );
      }
    }
  }

  return { requiredPerDay, directPerDay, trace, operations, maxDepth };
}

function explodeResource(
  data: StageOneData,
  resource: number,
  amountPerDay: number,
  requiredPerDay: Float64Array,
  trace: MrpTraceStep[],
  depth: number,
  maxDepth: number
): number {
  if (amountPerDay <= 0) return 0;
  requiredPerDay[resource] = (requiredPerDay[resource] ?? 0) + amountPerDay;
  trace.push({ resource, depth, amountPerDay });
  if (depth >= maxDepth || resource === data.energyResource) return 1;

  const recipe = chooseProducer(data, resource);
  if (recipe === undefined) return 1;
  const outputRate = outputRateFor(recipe, resource);
  if (outputRate <= 0) return 1;
  const runsPerDay = amountPerDay / outputRate;
  let operations = 1;
  for (let i = 0; i < recipe.inputs.length; i += 1) {
    const input = recipe.inputs[i];
    if (input === undefined) throw new RangeError("Recipe input bag is inconsistent.");
    const inputRate = (input.amount / Math.max(1, recipe.durationTicks)) * runsPerDay;
    operations += explodeResource(
      data,
      input.resource,
      inputRate,
      requiredPerDay,
      trace,
      depth + 1,
      maxDepth
    );
  }
  return operations;
}

export function chooseProducer(
  data: StageOneData,
  resource: number
): StageOneBatchRecipe | undefined {
  let best: StageOneBatchRecipe | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < data.batchRecipes.length; i += 1) {
    const recipe = data.batchRecipes[i];
    if (recipe === undefined || outputRateFor(recipe, resource) <= 0) continue;
    const unitCost = recipeUnitCost(data, recipe, resource);
    if (
      unitCost < bestCost - 1e-9 ||
      (Math.abs(unitCost - bestCost) <= 1e-9 && recipe.id.localeCompare(best?.id ?? "") < 0)
    ) {
      best = recipe;
      bestCost = unitCost;
    }
  }
  return best;
}

function recipeUnitCost(
  data: StageOneData,
  recipe: StageOneBatchRecipe,
  resource: number
): number {
  let inputValue = 0;
  for (let i = 0; i < recipe.inputs.length; i += 1) {
    const input = recipe.inputs[i];
    if (input === undefined) throw new RangeError("Recipe input bag is inconsistent.");
    inputValue += input.amount * (data.baseValue[input.resource] ?? 1);
  }
  return inputValue / Math.max(0.000001, outputAmountFor(recipe.outputs, resource));
}

function outputRateFor(recipe: StageOneBatchRecipe, resource: number): number {
  return outputAmountFor(recipe.outputs, resource) / Math.max(1, recipe.durationTicks);
}

function outputAmountFor(outputs: readonly ResourceAmount[], resource: number): number {
  for (let i = 0; i < outputs.length; i += 1) {
    const output = outputs[i];
    if (output?.resource === resource) return output.amount;
  }
  return 0;
}
