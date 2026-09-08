import { BuildingState } from "../../econ/buildings.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";

export interface FactionSupply {
  readonly productionPerDay: Float64Array;
  readonly stockpile: Float64Array;
}

export function calculateFactionSupplyRates(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): FactionSupply {
  const productionPerDay = new Float64Array(data.resources.length);
  const stockpile = new Float64Array(data.resources.length);

  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    addBodyStockpile(data, world, body, stockpile);
    body = world.bodies.nextInFaction[body] ?? -1;
  }

  for (let building = 0; building < world.buildings.length; building += 1) {
    const bodyId = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[bodyId] ?? -1) !== faction) continue;
    if (world.buildings.state[building] === BuildingState.Demolished) continue;
    if (world.buildings.state[building] === BuildingState.UnderConstruction) continue;
    const multiplier = workerMultiplier(world, building);
    addBatchOutputs(data, world, building, multiplier, productionPerDay);
    addContinuousOutputs(data, world, building, multiplier, productionPerDay);
  }

  return { productionPerDay, stockpile };
}

function addBodyStockpile(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  stockpile: Float64Array
): void {
  const row = world.bodies.stockpile[body] ?? 0;
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    stockpile[resource] = (stockpile[resource] ?? 0) + world.stockpiles.get(row, resource);
  }
}

function addBatchOutputs(
  data: StageOneData,
  world: StageOneWorld,
  building: number,
  multiplier: number,
  productionPerDay: Float64Array
): void {
  const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
  if (recipeIndex < 0) return;
  const recipe = data.batchRecipes[recipeIndex];
  if (recipe === undefined) throw new RangeError("Building recipe index is invalid.");
  const body = world.buildings.body[building] ?? -1;
  const yieldValue = Math.max(0.2, world.bodies.development[body] ?? 1);
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    const output = recipe.outputs[i];
    if (output === undefined) throw new RangeError("Recipe output bag is inconsistent.");
    const rate = (output.amount / Math.max(1, recipe.durationTicks)) * yieldValue * multiplier;
    productionPerDay[output.resource] = (productionPerDay[output.resource] ?? 0) + rate;
  }
}

function addContinuousOutputs(
  data: StageOneData,
  world: StageOneWorld,
  building: number,
  multiplier: number,
  productionPerDay: Float64Array
): void {
  const processIndex = world.buildings.continuousProcess[building] ?? -1;
  if (processIndex < 0) return;
  const process = data.continuous[processIndex];
  if (process === undefined) throw new RangeError("Building process index is invalid.");
  for (let i = 0; i < process.outputsPerTick.length; i += 1) {
    const output = process.outputsPerTick[i];
    if (output === undefined) throw new RangeError("Continuous output bag is inconsistent.");
    productionPerDay[output.resource] =
      (productionPerDay[output.resource] ?? 0) + output.amount * multiplier;
  }
}

function workerMultiplier(world: StageOneWorld, building: number): number {
  const required = world.buildings.workersRequired[building] ?? 0;
  if (required <= 0) return 1;
  return Math.max(0, Math.min(1, (world.buildings.assignedWorkers[building] ?? 0) / required));
}
