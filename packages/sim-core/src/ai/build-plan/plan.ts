import { BuildingState } from "../../econ/buildings.js";
import { validatePlacement } from "../../econ/placement.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
import { AiOperationalTaskKind, type AiOperationalTask } from "../bottleneck.js";
import { chooseProducer } from "../mrp/explode.js";

import {
  guardAlternativeProducer,
  guardDemolishByFlow,
  guardHousingCap,
  guardPowerAvailable,
  guardStockHorizon,
  guardVitalVsComfort,
  NeedBranch
} from "./guards.js";
import { solveLinearProgram } from "./lp.js";

const COMFORT_VITAL_RESERVE_DAYS = 30;

export interface BuildPlanItem {
  readonly body: number;
  readonly buildingType: number;
  readonly count: number;
  readonly resource: number;
  readonly score: number;
}

export interface BuildPlan {
  readonly faction: number;
  readonly items: readonly BuildPlanItem[];
  readonly operations: number;
}

export function createBuildPlan(
  data: StageOneData,
  world: StageOneWorld,
  task: AiOperationalTask
): BuildPlan {
  if (task.kind !== AiOperationalTaskKind.BuildProducer || task.body < 0 || task.buildingType < 0) {
    return { faction: task.faction, items: [], operations: 0 };
  }
  if (!guardStockHorizon(world, task.faction, task.resource, task.score)) {
    return { faction: task.faction, items: [], operations: 1 };
  }
  if (
    guardVitalVsComfort(data, task.resource) === NeedBranch.Comfort &&
    minVitalReserveDays(data, world, task.faction) < COMFORT_VITAL_RESERVE_DAYS
  ) {
    return { faction: task.faction, items: [], operations: 1 };
  }
  const candidates: BuildPlanItem[] = [];
  const producer = guardAlternativeProducer(
    data,
    world,
    task.faction,
    task.resource,
    task.buildingType
  );
  const producerBody = bestBodyForBuilding(data, world, task.faction, producer, task.body);
  if (producerBody < 0) return { faction: task.faction, items: [], operations: 1 };

  const power = powerPrerequisite(data, world, producerBody, producer);
  if (power >= 0) {
    candidates.push({
      body: producerBody,
      buildingType: power,
      count: 1,
      resource: data.energyResource,
      score: 1
    });
  }

  addInputProducer(data, world, task, producerBody, candidates);
  addShipyardSidecar(data, world, task, producerBody, candidates);
  candidates.push({
    body: producerBody,
    buildingType: producer,
    count: suggestedCount(data, task.resource, producer, task.score),
    resource: task.resource,
    score: Math.max(0.1, task.score)
  });

  const rounded = roundedPlan(data, world, candidates);
  return { faction: task.faction, items: rounded, operations: candidates.length };
}

function addInputProducer(
  data: StageOneData,
  world: StageOneWorld,
  task: AiOperationalTask,
  body: number,
  candidates: BuildPlanItem[]
): void {
  const recipeIndex = data.buildings[task.buildingType]?.batchRecipe ?? -1;
  const recipe = data.batchRecipes[recipeIndex];
  let added = 0;
  if (recipe !== undefined) {
    for (let i = 0; i < recipe.inputs.length && added < 2; i += 1) {
      const input = recipe.inputs[i];
      if (input === undefined || input.resource === data.energyResource) continue;
      if (factionStock(world, task.faction, input.resource) > input.amount * 6) continue;
      if (addPrereqProducer(data, world, task, body, input.resource, candidates)) added += 1;
    }
  }

  const buildCost = data.buildings[task.buildingType]?.buildCost ?? [];
  for (let i = 0; i < buildCost.length && added < 3; i += 1) {
    const input = buildCost[i];
    if (input === undefined || input.resource === data.energyResource) continue;
    if (factionStock(world, task.faction, input.resource) > input.amount * 2) continue;
    if (addPrereqProducer(data, world, task, body, input.resource, candidates)) added += 1;
  }
}

function addPrereqProducer(
  data: StageOneData,
  world: StageOneWorld,
  task: AiOperationalTask,
  body: number,
  resource: number,
  candidates: BuildPlanItem[]
): boolean {
  const producer = chooseProducer(data, resource);
  const buildingType =
    producer === undefined ? -1 : (data.buildingIndex.get(producer.buildingId) ?? -1);
  if (buildingType < 0 || buildingType === task.buildingType) return false;
  if (alreadyPlanned(candidates, -1, buildingType)) return false;
  const targetBody = bestBodyForBuilding(data, world, task.faction, buildingType, body);
  if (targetBody >= 0) {
    candidates.push({
      body: targetBody,
      buildingType,
      count: 1,
      resource,
      score: Math.max(0.1, data.baseValue[resource] ?? 1)
    });
    return true;
  }
  return false;
}

function addShipyardSidecar(
  data: StageOneData,
  world: StageOneWorld,
  task: AiOperationalTask,
  body: number,
  candidates: BuildPlanItem[]
): void {
  const hullFrames = data.resourceIndex.get("hull_frames") ?? -1;
  if (task.resource !== hullFrames) return;
  const shipyard = data.buildingIndex.get("shipyard") ?? -1;
  if (shipyard < 0 || factionHasBuilding(world, task.faction, shipyard)) return;
  const targetBody = bestBodyForBuilding(data, world, task.faction, shipyard, body);
  if (targetBody >= 0) {
    candidates.push({
      body: targetBody,
      buildingType: shipyard,
      count: 1,
      resource: hullFrames,
      score: task.score * 0.8
    });
  }
}

function roundedPlan(
  data: StageOneData,
  world: StageOneWorld,
  candidates: readonly BuildPlanItem[]
): readonly BuildPlanItem[] {
  if (candidates.length === 0) return [];
  const objective = new Array<number>(candidates.length);
  const slotConstraint = new Array<number>(candidates.length);
  const workerConstraint = new Array<number>(candidates.length);
  let slotLimit = 0;
  let workerLimit = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    if (item === undefined) continue;
    const def = data.buildings[item.buildingType];
    objective[i] = item.score;
    slotConstraint[i] = def?.slots ?? 0;
    workerConstraint[i] = def?.workers ?? 0;
    slotLimit += freeSlots(world, item.body);
    workerLimit += workforceHeadroom(world, item.body);
  }
  const solution = solveLinearProgram({
    objective,
    constraints: [slotConstraint, workerConstraint],
    limits: [Math.max(1, slotLimit), Math.max(1, workerLimit)]
  });
  const result: BuildPlanItem[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    if (item === undefined) continue;
    const allowed = Math.max(1, Math.min(item.count, Math.floor(solution.values[i] ?? item.count)));
    if (allowed <= 0 || alreadyPlanned(result, item.body, item.buildingType)) continue;
    if (!canQueueBuilding(data, world, item.body, item.buildingType, result)) continue;
    result.push({ ...item, count: allowed });
  }
  return result;
}

function canQueueBuilding(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number,
  previous: readonly BuildPlanItem[]
): boolean {
  const plannedPower = containsPower(data, previous, body);
  if (!guardPowerAvailable(data, world, body, buildingType, plannedPower)) return false;
  if (data.buildings[buildingType]?.id === "housing" && !guardHousingCap(data, world, body, 1)) {
    return false;
  }
  const placement = validatePlacement(data, world, body, buildingType);
  return (
    placement.ok ||
    (placement.reason === "noPowerSource" && plannedPower) ||
    (placement.reason === "noFreeSlots" && hasDemolishableSpace(data, world, body, buildingType))
  );
}

function powerPrerequisite(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): number {
  const placement = validatePlacement(data, world, body, buildingType);
  if (placement.reason !== "noPowerSource") return -1;
  for (let i = 0; i < data.buildings.length; i += 1) {
    const building = data.buildings[i];
    if (building?.powerSource !== true) continue;
    if (validatePlacement(data, world, body, i).ok) return i;
  }
  return -1;
}

function suggestedCount(
  data: StageOneData,
  resource: number,
  buildingType: number,
  deficitPerDay: number
): number {
  const recipeIndex = data.buildings[buildingType]?.batchRecipe ?? -1;
  const recipe = data.batchRecipes[recipeIndex];
  if (recipe === undefined) return 1;
  let outputPerDay = 0;
  for (let i = 0; i < recipe.outputs.length; i += 1) {
    const output = recipe.outputs[i];
    if (output?.resource === resource)
      outputPerDay += output.amount / Math.max(1, recipe.durationTicks);
  }
  if (outputPerDay <= 0) return 1;
  return Math.max(1, Math.min(3, Math.ceil(deficitPerDay / outputPerDay)));
}

function bestBodyForBuilding(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  buildingType: number,
  preferredBody: number
): number {
  if (buildingType < 0) return -1;
  if (canBodyEventuallyPlace(data, world, preferredBody, buildingType)) return preferredBody;
  let bestBody = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    if (canBodyEventuallyPlace(data, world, body, buildingType)) {
      const score = freeSlots(world, body) + (world.bodies.habitability[body] ?? 0);
      if (score > bestScore + 1e-9) {
        bestScore = score;
        bestBody = body;
      }
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return bestBody;
}

function canBodyEventuallyPlace(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): boolean {
  if (body < 0 || buildingType < 0) return false;
  const placement = validatePlacement(data, world, body, buildingType);
  return (
    placement.ok ||
    placement.reason === "noPowerSource" ||
    (placement.reason === "noFreeSlots" && hasDemolishableSpace(data, world, body, buildingType))
  );
}

function containsPower(data: StageOneData, items: readonly BuildPlanItem[], body: number): boolean {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item?.body === body && data.buildings[item.buildingType]?.powerSource === true) return true;
  }
  return false;
}

function alreadyPlanned(
  items: readonly BuildPlanItem[],
  body: number,
  buildingType: number
): boolean {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item?.buildingType === buildingType && (body < 0 || item.body === body)) {
      return true;
    }
  }
  return false;
}

function factionStock(world: StageOneWorld, faction: number, resource: number): number {
  let stock = 0;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    stock += world.stockpiles.get(world.bodies.stockpile[body] ?? 0, resource);
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return stock;
}

function factionHasBuilding(world: StageOneWorld, faction: number, buildingType: number): boolean {
  for (let building = 0; building < world.buildings.length; building += 1) {
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    if (world.buildings.type[building] === buildingType) return true;
  }
  return false;
}

function freeSlots(world: StageOneWorld, body: number): number {
  return Math.max(0, (world.bodies.slots[body] ?? 0) - (world.bodies.usedSlots[body] ?? 0));
}

function hasDemolishableSpace(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): boolean {
  const slotsNeeded = Math.max(
    0,
    (data.buildings[buildingType]?.slots ?? 0) - freeSlots(world, body)
  );
  if (slotsNeeded <= 0) return true;
  let slots = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const type = world.buildings.type[building] ?? -1;
    const def = data.buildings[type];
    if (
      type !== buildingType &&
      def?.powerSource !== true &&
      world.buildings.state[building] !== BuildingState.UnderConstruction &&
      guardDemolishByFlow(data, world, building).ok
    ) {
      slots += world.buildings.slots[building] ?? def?.slots ?? 0;
      if (slots >= slotsNeeded) return true;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return false;
}

function minVitalReserveDays(data: StageOneData, world: StageOneWorld, faction: number): number {
  let min = Number.POSITIVE_INFINITY;
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) <= 0) continue;
    if (data.populationNeeds.comfortOnly[resource] === 1) continue;
    const demand = factionDailyNeed(data, world, faction, resource);
    if (demand <= 0) continue;
    min = Math.min(min, factionStock(world, faction, resource) / demand);
  }
  return Number.isFinite(min) ? min : 0;
}

function factionDailyNeed(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  resource: number
): number {
  let demand = 0;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    demand +=
      (world.bodies.population[body] ?? 0) *
      (data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return demand;
}

function workforceHeadroom(world: StageOneWorld, body: number): number {
  const available = (world.bodies.population[body] ?? 0) * 0.55;
  let load = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    load += world.buildings.workersRequired[building] ?? 0;
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return Math.max(1, available - load);
}
