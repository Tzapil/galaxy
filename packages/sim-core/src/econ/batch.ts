import { EventKind } from "../events/kinds.js";
import { StageOneLogKind } from "../events/log.js";
import type { EventQueue } from "../events/queue.js";
import type { StageOneData } from "../stage-one/data.js";
import { BuildingState, type Buildings } from "./buildings.js";
import { hasWorkersForBuilding } from "../pop/workforce.js";
import type { StageOneWorld } from "../world/state.js";

import { firstOutputWithoutSpace, reserveInputs } from "./reserve.js";
export { processContinuousBuildings } from "./continuous.js";

export function tryStartBatch(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  building: number,
  tick: number
): boolean {
  const buildings = world.buildings;
  if (buildings.state[building] === BuildingState.Working) return false;
  if (
    buildings.state[building] === BuildingState.UnderConstruction ||
    buildings.state[building] === BuildingState.Demolished
  ) {
    return false;
  }
  const recipeIndex = buildings.batchRecipe[building] ?? -1;
  if (recipeIndex < 0) return false;
  if (!hasWorkersForBuilding(world.bodies, buildings, building)) return false;

  const recipe = data.batchRecipes[recipeIndex];
  if (recipe === undefined) throw new RangeError("Batch recipe index is invalid.");
  const body = buildings.body[building] ?? 0;
  const stockpile = world.bodies.stockpile[body] ?? 0;
  const noSpace = firstOutputWithoutSpace(world.stockpiles, stockpile, recipe.outputs);
  if (noSpace >= 0) {
    // Spec 5.4: a full store blocks the next batch explicitly. If an already
    // completed output races with an incoming shipment, capacity clamps it and the log records accepted output.
    buildings.setIdleStorageFull(building, noSpace);
    if ((buildings.finishTick[building] ?? -1) <= tick) {
      buildings.finishTick[building] = tick + 1;
      queue.schedule(tick + 1, EventKind.ProductionRetry, building);
    }
    return false;
  }

  const missing = reserveInputs(world.stockpiles, stockpile, recipe.inputs);
  if (missing >= 0) {
    buildings.setIdleMissing(building, missing, data.energyResource);
    world.eventLog.append(
      tick,
      StageOneLogKind.MissingInput,
      world.bodies.system[body] ?? -1,
      body,
      building,
      missing,
      0
    );
    return false;
  }

  const finishTick = tick + recipe.durationTicks;
  buildings.setWorking(building, tick, finishTick);
  queue.schedule(finishTick, EventKind.BatchComplete, building);
  return true;
}

export function handleBatchComplete(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  building: number,
  tick: number
): void {
  const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
  if (recipeIndex < 0) return;
  const recipe = data.batchRecipes[recipeIndex];
  if (recipe === undefined) throw new RangeError("Batch recipe index is invalid.");
  const body = world.buildings.body[building] ?? 0;
  const stockpile = world.bodies.stockpile[body] ?? 0;
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    const output = recipe.outputs[i];
    if (output === undefined) throw new RangeError("Batch output is inconsistent.");
    const lost = world.stockpiles.addClamped(stockpile, output.resource, output.amount);
    world.eventLog.append(
      tick,
      StageOneLogKind.BatchComplete,
      world.bodies.system[body] ?? -1,
      body,
      building,
      output.resource,
      output.amount - lost
    );
  }
  world.buildings.state[building] = BuildingState.IdleMissingInput;
  world.buildings.stateResource[building] = -1;
  tryStartIdleBuildingsOnBody(data, world, queue, body, tick);
}

export function tryStartIdleBuildingsOnBody(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  body: number,
  tick: number
): void {
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const state = world.buildings.state[building] ?? BuildingState.UnderConstruction;
    if (
      state === BuildingState.IdleMissingInput ||
      state === BuildingState.IdleNoPower ||
      state === BuildingState.IdleStorageFull ||
      state === BuildingState.IdleNoWorkers
    ) {
      tryStartBatch(data, world, queue, building, tick);
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
}

export function bootProduction(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  tick: number
): void {
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) >= 0) {
      tryStartIdleBuildingsOnBody(data, world, queue, body, tick);
    }
  }
}

export function detectAndBreakProductionDeadlocks(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  tick: number
): number {
  for (let a = 0; a < world.buildings.length; a += 1) {
    if (world.buildings.state[a] !== BuildingState.IdleMissingInput) continue;
    const missingA = world.buildings.stateResource[a] ?? -1;
    const recipeA = recipeFor(data, world.buildings, a);
    if (recipeA < 0) continue;
    for (let b = a + 1; b < world.buildings.length; b += 1) {
      if (world.buildings.state[b] !== BuildingState.IdleMissingInput) continue;
      const missingB = world.buildings.stateResource[b] ?? -1;
      const recipeB = recipeFor(data, world.buildings, b);
      if (recipeB < 0) continue;
      if (produces(data, recipeA, missingB) && produces(data, recipeB, missingA)) {
        injectMissingInput(data, world, a, missingA);
        world.eventLog.append(
          tick,
          StageOneLogKind.DeadlockBroken,
          world.bodies.system[world.buildings.body[a] ?? 0] ?? -1,
          world.buildings.body[a] ?? 0,
          a,
          missingA,
          1
        );
        tryStartBatch(data, world, queue, a, tick);
        return 1;
      }
    }
  }
  return 0;
}

function recipeFor(data: StageOneData, buildings: Buildings, building: number): number {
  if (buildings.state[building] === BuildingState.Demolished) return -1;
  const recipeIndex = buildings.batchRecipe[building] ?? -1;
  return recipeIndex >= 0 && recipeIndex < data.batchRecipes.length ? recipeIndex : -1;
}

function produces(data: StageOneData, recipeIndex: number, resource: number): boolean {
  if (resource < 0) return false;
  const recipe = data.batchRecipes[recipeIndex];
  if (recipe === undefined) return false;
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    if ((recipe.outputs[i]?.resource ?? -1) === resource) return true;
  }
  return false;
}

function injectMissingInput(
  data: StageOneData,
  world: StageOneWorld,
  building: number,
  resource: number
): void {
  const recipe = data.batchRecipes[world.buildings.batchRecipe[building] ?? -1];
  if (recipe === undefined) return;
  let amount = 0;
  for (let i = 0; i < recipe.inputs.length; i += 1) {
    const input = recipe.inputs[i];
    if (input?.resource === resource) amount = input.amount;
  }
  const body = world.buildings.body[building] ?? 0;
  world.stockpiles.addClamped(world.bodies.stockpile[body] ?? 0, resource, amount);
}
