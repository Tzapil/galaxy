import { startBuildingConstruction } from "./construction.js";
import { BuildingState } from "../econ/buildings.js";
import { validatePlacement } from "../econ/placement.js";
import type { EventQueue } from "../events/queue.js";
import { MIN_OPERATION_WORKER_RATIO } from "../pop/workforce.js";
import { resourceIndexOf, type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

const VITAL_RESERVE_TARGET_DAYS = 180;
const HOUSING_RESERVE_TARGET_DAYS = 240;
const HOUSING_CAPACITY_TRIGGER = 0.86;

const vitalProducerOrder = [
  ["water", "water_plant"],
  ["food", "food_plant"],
  ["medicine", "pharma_plant"],
  ["consumer_goods", "consumer_plant"]
] as const;

export function runAutoBuilder(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  tick: number
): number {
  let started = 0;
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (activeConstructionForFaction(world, faction) > 0) continue;
    const plan = selectBuildingForFaction(data, world, faction);
    if (plan.body < 0 || plan.building < 0) continue;
    const result = startBuildingConstruction(data, world, queue, plan.body, plan.building, tick);
    if (result.ok) started += 1;
  }
  return started;
}

function selectBuildingForFaction(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): { readonly body: number; readonly building: number } {
  const noPower = firstIdleNoPowerBody(world, faction);
  if (noPower >= 0) {
    const power = powerCandidateForBody(data, world, noPower);
    if (power.building >= 0) return power;
  }

  const vital = mostPressingVitalShortage(data, world, faction);
  const input = strategicInputCandidate(data, world, faction, vital.resource);
  if (input.body >= 0) return input;
  if (
    vital.resource >= 0 &&
    (vital.supply < 0.96 || vital.reserveDays < VITAL_RESERVE_TARGET_DAYS)
  ) {
    const candidate = producerCandidateForVital(data, world, faction, vital.resource);
    if (candidate.body >= 0) return candidate;
  }

  const housing = housingCandidate(data, world, faction);
  if (housing.body >= 0) return housing;

  return { body: -1, building: -1 };
}

function activeConstructionForFaction(world: StageOneWorld, faction: number): number {
  let active = 0;
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] !== BuildingState.UnderConstruction) continue;
    const body = world.buildings.body[building] ?? -1;
    if (body >= 0 && (world.bodies.owner[body] ?? -1) === faction) active += 1;
  }
  return active;
}

function firstIdleNoPowerBody(world: StageOneWorld, faction: number): number {
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] !== BuildingState.IdleNoPower) continue;
    const body = world.buildings.body[building] ?? -1;
    if (body >= 0 && (world.bodies.owner[body] ?? -1) === faction) return body;
  }
  return -1;
}

function mostPressingVitalShortage(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): { readonly resource: number; readonly supply: number; readonly reserveDays: number } {
  let bestResource = -1;
  let bestSupply = 1;
  let bestReserveDays = Number.POSITIVE_INFINITY;
  let bestScore = 1;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) <= 0) continue;
      if (data.populationNeeds.comfortOnly[resource] === 1) continue;
      const supply = world.supply.get(body, resource);
      const reserveDays = factionReserveDays(data, world, faction, resource);
      const score = Math.min(supply, reserveDays / VITAL_RESERVE_TARGET_DAYS);
      if (score < bestScore) {
        bestScore = score;
        bestSupply = supply;
        bestResource = resource;
        bestReserveDays = reserveDays;
      }
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return { resource: bestResource, supply: bestSupply, reserveDays: bestReserveDays };
}

function strategicInputCandidate(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  vitalResource: number
): { readonly body: number; readonly building: number } {
  const food = data.resourceIndex.get("food") ?? -1;
  const medicine = data.resourceIndex.get("medicine") ?? -1;
  const water = data.resourceIndex.get("water") ?? -1;
  const biomass = data.resourceIndex.get("biomass") ?? -1;
  const polymers = data.resourceIndex.get("polymers") ?? -1;
  const ice = data.resourceIndex.get("ice") ?? -1;

  if (water >= 0 && ice >= 0 && vitalResource === water) {
    const dailyIce = factionDailyNeed(data, world, faction, water) * (22 / 20);
    if (factionReserveDaysForUse(world, faction, ice, dailyIce) < VITAL_RESERVE_TARGET_DAYS) {
      const drill = findPlaceableBody(data, world, faction, "ice_drill");
      if (drill.body >= 0) return drill;
    }
  }

  if (biomass >= 0 && (vitalResource === food || vitalResource === medicine)) {
    const dailyBiomass =
      (food >= 0 ? factionDailyNeed(data, world, faction, food) * (18 / 24) : 0) +
      (medicine >= 0 ? factionDailyNeed(data, world, faction, medicine) * (6 / 9) : 0);
    if (
      factionReserveDaysForUse(world, faction, biomass, dailyBiomass) < VITAL_RESERVE_TARGET_DAYS
    ) {
      const farm = findPlaceableBody(data, world, faction, "farm");
      if (farm.body >= 0) return farm;
      const hydroponics = findPlaceableBody(data, world, faction, "hydroponics_bay");
      if (hydroponics.body >= 0) return hydroponics;
    }
  }

  if (medicine >= 0 && polymers >= 0 && vitalResource === medicine) {
    const dailyPolymers = factionDailyNeed(data, world, faction, medicine) * (2 / 9);
    if (
      factionReserveDaysForUse(world, faction, polymers, dailyPolymers) < VITAL_RESERVE_TARGET_DAYS
    ) {
      const polymerPlant = findPlaceableBody(data, world, faction, "polymer_plant");
      if (polymerPlant.body >= 0) return polymerPlant;
    }
  }

  return { body: -1, building: -1 };
}

function producerCandidateForVital(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  resource: number
): { readonly body: number; readonly building: number } {
  for (const [resourceId, buildingId] of vitalProducerOrder) {
    if (resourceIndexOf(data.resourceIndex, resourceId) !== resource) continue;
    return findPlaceableBody(data, world, faction, buildingId);
  }
  return { body: -1, building: -1 };
}

function powerCandidateForBody(
  data: StageOneData,
  world: StageOneWorld,
  body: number
): { readonly body: number; readonly building: number } {
  const building = data.buildingIndex.get("solar_array") ?? -1;
  if (building < 0) return { body: -1, building: -1 };
  if (!belowCopyLimit(data, world, body, building)) return { body: -1, building: -1 };
  if (!hasWorkforceHeadroom(data, world, body, building)) return { body: -1, building: -1 };
  if (!validatePlacement(data, world, body, building).ok) return { body: -1, building: -1 };
  return { body, building };
}

function housingCandidate(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): { readonly body: number; readonly building: number } {
  if (!vitalReservesAbove(data, world, faction, HOUSING_RESERVE_TARGET_DAYS)) {
    return { body: -1, building: -1 };
  }
  const housing = data.buildingIndex.get("housing") ?? -1;
  if (housing < 0) return { body: -1, building: -1 };
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    const capacity = populationCapacity(world, body);
    const population = world.bodies.population[body] ?? 0;
    if (
      capacity > 0 &&
      population / capacity >= HOUSING_CAPACITY_TRIGGER &&
      belowCopyLimit(data, world, body, housing) &&
      validatePlacement(data, world, body, housing).ok
    ) {
      return { body, building: housing };
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return { body: -1, building: -1 };
}

function populationCapacity(world: StageOneWorld, body: number): number {
  const base = 120 + (world.bodies.habitability[body] ?? 0) * 500;
  const housing = (world.bodies.housing[body] ?? 0) * 90;
  const buildingSupport = (world.bodies.buildingCount[body] ?? 0) * 2;
  return Math.min(2500, base + housing + buildingSupport);
}

function findPlaceableBody(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  buildingId: string
): { readonly body: number; readonly building: number } {
  const building = data.buildingIndex.get(buildingId) ?? -1;
  if (building < 0) return { body: -1, building: -1 };
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    if (
      belowCopyLimit(data, world, body, building) &&
      hasWorkforceHeadroom(data, world, body, building) &&
      validatePlacement(data, world, body, building).ok
    ) {
      return { body, building };
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return { body: -1, building: -1 };
}

function belowCopyLimit(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): boolean {
  const def = data.buildings[buildingType];
  if (def === undefined) return false;
  return (
    countBuildingTypeOnBody(world, body, buildingType) <
    maxCopiesForBuilding(def.id, world.bodies.slots[body] ?? 0)
  );
}

function maxCopiesForBuilding(id: string, slots: number): number {
  if (id === "solar_array") return Math.max(1, Math.ceil(slots / 5));
  if (id === "housing") return Math.max(1, Math.ceil(slots / 6));
  if (
    id === "farm" ||
    id === "hydroponics_bay" ||
    id === "water_plant" ||
    id === "food_plant" ||
    id === "pharma_plant" ||
    id === "consumer_plant"
  ) {
    return Math.max(1, Math.ceil(slots / 4));
  }
  return Math.max(1, Math.ceil(slots / 8));
}

function countBuildingTypeOnBody(world: StageOneWorld, body: number, buildingType: number): number {
  let count = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (
      world.buildings.type[building] === buildingType &&
      world.buildings.state[building] !== BuildingState.Demolished
    ) {
      count += 1;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return count;
}

function hasWorkforceHeadroom(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): boolean {
  const required = data.buildings[buildingType]?.workers ?? 0;
  if (required <= 0) return true;
  const available = (world.bodies.population[body] ?? 0) * 0.55;
  const futureLoad = workerLoadOnBody(world, body) + required;
  return available >= futureLoad * MIN_OPERATION_WORKER_RATIO;
}

function workerLoadOnBody(world: StageOneWorld, body: number): number {
  let load = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (world.buildings.state[building] !== BuildingState.Demolished) {
      load += world.buildings.workersRequired[building] ?? 0;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return load;
}

function vitalReservesAbove(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  days: number
): boolean {
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) <= 0) continue;
    if (data.populationNeeds.comfortOnly[resource] === 1) continue;
    if (factionReserveDays(data, world, faction, resource) < days) return false;
  }
  return true;
}

function factionReserveDays(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  resource: number
): number {
  return factionReserveDaysForUse(
    world,
    faction,
    resource,
    factionDailyNeed(data, world, faction, resource)
  );
}

function factionReserveDaysForUse(
  world: StageOneWorld,
  faction: number,
  resource: number,
  dailyUse: number
): number {
  if (dailyUse <= 0) return Number.POSITIVE_INFINITY;
  let stock = 0;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    stock += world.stockpiles.get(world.bodies.stockpile[body] ?? 0, resource);
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return stock / dailyUse;
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
    const population = world.bodies.population[body] ?? 0;
    const baseRate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
    const rate =
      data.populationNeeds.comfortOnly[resource] === 1
        ? baseRate * Math.max(0.2, world.bodies.development[body] ?? 1)
        : baseRate;
    demand += population * rate;
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return demand;
}
