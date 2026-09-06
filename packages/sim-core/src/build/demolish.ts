import { BuildingState } from "../econ/buildings.js";
import { StageOneLogKind } from "../events/log.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export const DEMOLITION_REFUND_RATE = 0.35;
export const DEMOLITION_BUFFER_YEARS = 5;

export interface DemolitionCheck {
  readonly ok: boolean;
  readonly minCoverageAfter: number;
  readonly minBufferYears: number;
}

export function canDemolishByFlow(
  data: StageOneData,
  world: StageOneWorld,
  building: number
): DemolitionCheck {
  if (world.buildings.state[building] === BuildingState.Demolished) {
    return { ok: false, minCoverageAfter: 0, minBufferYears: 0 };
  }
  const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
  if (recipeIndex < 0) return { ok: false, minCoverageAfter: 0, minBufferYears: 0 };
  const body = world.buildings.body[building] ?? 0;
  const recipe = data.batchRecipes[recipeIndex];
  if (recipe === undefined) throw new RangeError("Building recipe index is invalid.");
  const production = dailyProductionOnBody(data, world, body);
  const demand = dailyDemandOnBody(data, world, body);
  let minCoverageAfter = Number.POSITIVE_INFINITY;
  let minBufferYears = Number.POSITIVE_INFINITY;

  for (let i = 0; i < recipe.outputs.length; i += 1) {
    const output = recipe.outputs[i];
    if (output === undefined) throw new RangeError("Recipe output is inconsistent.");
    const need = demand[output.resource] ?? 0;
    if (need <= 0) return { ok: false, minCoverageAfter: 0, minBufferYears: 0 };
    const after = (production[output.resource] ?? 0) - output.amount / recipe.durationTicks;
    const coverage = after / need;
    const stock = world.stockpiles.get(world.bodies.stockpile[body] ?? 0, output.resource);
    const yearlyGap = Math.max(0, need - after) * 365;
    const bufferYears = yearlyGap <= 0 ? Number.POSITIVE_INFINITY : stock / yearlyGap;
    minCoverageAfter = Math.min(minCoverageAfter, coverage);
    minBufferYears = Math.min(minBufferYears, bufferYears);
    if (coverage < 1.05 && bufferYears < DEMOLITION_BUFFER_YEARS) {
      return { ok: false, minCoverageAfter, minBufferYears };
    }
  }

  return { ok: true, minCoverageAfter, minBufferYears };
}

export function demolishBuilding(
  data: StageOneData,
  world: StageOneWorld,
  building: number,
  tick: number
): boolean {
  const check = canDemolishByFlow(data, world, building);
  if (!check.ok) return false;
  const body = world.buildings.body[building] ?? 0;
  const stockpile = world.bodies.stockpile[body] ?? 0;
  const def = data.buildings[world.buildings.type[building] ?? 0];
  if (def === undefined) throw new RangeError("Unknown building type.");
  for (let i = 0; i < def.buildCost.length; i += 1) {
    const item = def.buildCost[i];
    if (item === undefined) throw new RangeError("Build cost is inconsistent.");
    world.stockpiles.addClamped(stockpile, item.resource, item.amount * DEMOLITION_REFUND_RATE);
  }
  world.buildings.markDemolished(data, world.bodies, building, world.stockpiles);
  world.eventLog.append(
    tick,
    StageOneLogKind.BuildingDemolished,
    world.bodies.system[body] ?? -1,
    body,
    building,
    -1,
    DEMOLITION_REFUND_RATE
  );
  return true;
}

export function dailyProductionOnBody(
  data: StageOneData,
  world: StageOneWorld,
  body: number
): Float64Array {
  const production = new Float64Array(data.resources.length);
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (world.buildings.state[building] !== BuildingState.Demolished) {
      const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
      if (recipeIndex >= 0) {
        const recipe = data.batchRecipes[recipeIndex];
        if (recipe === undefined) throw new RangeError("Building recipe index is invalid.");
        for (let i = 0; i < recipe.outputs.length; i += 1) {
          const output = recipe.outputs[i];
          if (output === undefined) throw new RangeError("Recipe output is inconsistent.");
          production[output.resource] =
            (production[output.resource] ?? 0) + output.amount / recipe.durationTicks;
        }
      }
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return production;
}

export function dailyDemandOnBody(
  data: StageOneData,
  world: StageOneWorld,
  body: number
): Float64Array {
  const demand = new Float64Array(data.resources.length);
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    demand[resource] =
      (world.bodies.population[body] ?? 0) *
      (data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
  }
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (world.buildings.state[building] !== BuildingState.Demolished) {
      const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
      if (recipeIndex >= 0) {
        const recipe = data.batchRecipes[recipeIndex];
        if (recipe === undefined) throw new RangeError("Building recipe index is invalid.");
        for (let i = 0; i < recipe.inputs.length; i += 1) {
          const input = recipe.inputs[i];
          if (input === undefined) throw new RangeError("Recipe input is inconsistent.");
          if (input.resource !== data.energyResource) {
            demand[input.resource] =
              (demand[input.resource] ?? 0) + input.amount / recipe.durationTicks;
          }
        }
      }
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return demand;
}
