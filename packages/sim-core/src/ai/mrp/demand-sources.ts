import {
  calculateCapitalDemandForFaction,
  type PlannedConstruction
} from "../../build/capital-demand.js";
import type { ResourceAmount, StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";

import type { MrpTarget } from "./explode.js";

export interface FactionDemandSources {
  readonly recipeDemandPerDay: Float64Array;
  readonly populationDemandPerDay: Float64Array;
  readonly capitalDemandPerDay: Float64Array;
  readonly fleetDemandPerDay: Float64Array;
  readonly targets: readonly MrpTarget[];
}

export function collectFactionDemandSources(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  planned: readonly PlannedConstruction[] = []
): FactionDemandSources {
  const recipeDemandPerDay = new Float64Array(data.resources.length);
  const populationDemandPerDay = new Float64Array(data.resources.length);
  const capitalDemandPerDay = calculateCapitalDemandForFaction(data, world, faction, planned);
  const fleetDemandPerDay = calculateFleetDemandPerDay(data, world, faction);
  const targets: MrpTarget[] = [];

  addRecipeDemand(data, world, faction, recipeDemandPerDay);
  addPopulationDemand(data, world, faction, populationDemandPerDay);
  addArrayTargets(recipeDemandPerDay, targets);
  addArrayTargets(populationDemandPerDay, targets);
  addArrayTargets(capitalDemandPerDay, targets);
  addFleetTargetsByColonyShare(world, faction, fleetDemandPerDay, targets);
  addFleetProgramTargets(data, targets);

  return {
    recipeDemandPerDay,
    populationDemandPerDay,
    capitalDemandPerDay,
    fleetDemandPerDay,
    targets
  };
}

export function calculateFleetDemandPerDay(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): Float64Array {
  const demand = new Float64Array(data.resources.length);
  const population = factionPopulation(world, faction);
  addById(data, demand, "fuel", 2 + 0.012 * population);
  addById(data, demand, "hull_frames", 0.5);
  addById(data, demand, "thrusters", 0.4);
  addById(data, demand, "reactors", 0.25);
  addById(data, demand, "life_support", 0.25);
  return demand;
}

export function demandByColonyShare(
  world: StageOneWorld,
  faction: number,
  totalDemandPerDay: Float64Array
): Float64Array[] {
  const colonyCount = Math.max(1, world.factions.colonyCount[faction] ?? 0);
  const result: Float64Array[] = [];
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    const share = new Float64Array(totalDemandPerDay.length);
    for (let resource = 0; resource < totalDemandPerDay.length; resource += 1) {
      share[resource] = (totalDemandPerDay[resource] ?? 0) / colonyCount;
    }
    result.push(share);
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return result;
}

function addRecipeDemand(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  demand: Float64Array
): void {
  for (let building = 0; building < world.buildings.length; building += 1) {
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const recipeIndex = world.buildings.batchRecipe[building] ?? -1;
    if (recipeIndex < 0) continue;
    const recipe = data.batchRecipes[recipeIndex];
    if (recipe === undefined) throw new RangeError("Building recipe index is invalid.");
    addBagRate(demand, recipe.inputs, Math.max(1, recipe.durationTicks));
  }
}

function addPopulationDemand(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  demand: Float64Array
): void {
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    const population = world.bodies.population[body] ?? 0;
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      const perThousand = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
      demand[resource] = (demand[resource] ?? 0) + population * perThousand;
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
}

function addFleetProgramTargets(data: StageOneData, targets: MrpTarget[]): void {
  const cruiser = data.hullIndex.get("cruiser");
  const fallback = data.hullIndex.get("corvette");
  const hull = cruiser ?? fallback;
  if (hull === undefined) return;
  targets.push({ kind: "hull", hull, count: 20, horizonDays: 365 });
}

function addFleetTargetsByColonyShare(
  world: StageOneWorld,
  faction: number,
  demand: Float64Array,
  targets: MrpTarget[]
): void {
  let shares = 0;
  for (const share of demandByColonyShare(world, faction, demand)) {
    addArrayTargets(share, targets);
    shares += 1;
  }
  if (shares === 0) addArrayTargets(demand, targets);
}

function addArrayTargets(demand: Float64Array, targets: MrpTarget[]): void {
  for (let resource = 0; resource < demand.length; resource += 1) {
    const amountPerDay = demand[resource] ?? 0;
    if (amountPerDay > 0) targets.push({ kind: "resource", resource, amountPerDay });
  }
}

function addBagRate(
  demand: Float64Array,
  bag: readonly ResourceAmount[],
  durationTicks: number
): void {
  for (let i = 0; i < bag.length; i += 1) {
    const item = bag[i];
    if (item === undefined) throw new RangeError("Resource bag is inconsistent.");
    demand[item.resource] = (demand[item.resource] ?? 0) + item.amount / durationTicks;
  }
}

function factionPopulation(world: StageOneWorld, faction: number): number {
  let population = 0;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    population += world.bodies.population[body] ?? 0;
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return population;
}

function addById(data: StageOneData, demand: Float64Array, id: string, amount: number): void {
  const resource = data.resourceIndex.get(id);
  if (resource !== undefined) demand[resource] = (demand[resource] ?? 0) + amount;
}
