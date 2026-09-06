import { BuildingState, type Buildings } from "../econ/buildings.js";
import type { Bodies } from "../world/bodies.js";

export const EMPLOYMENT = 0.55;
export const MIN_OPERATION_WORKER_RATIO = 0.8;

export function assignWorkforceForBody(bodies: Bodies, buildings: Buildings, body: number): void {
  const owner = bodies.owner[body] ?? -1;
  const system = bodies.system[body] ?? -1;
  const available = workforceAvailableInPool(bodies, owner, system);
  const requiredTotal = workforceRequiredInPool(bodies, buildings, owner, system);

  if (requiredTotal > 0 && available >= requiredTotal * MIN_OPERATION_WORKER_RATIO) {
    assignProportionalWorkforceInPool(bodies, buildings, owner, system, available / requiredTotal);
    return;
  }

  assignGreedyWorkforceInPool(bodies, buildings, owner, system, available);
}

function workforceAvailableInPool(bodies: Bodies, owner: number, system: number): number {
  if (owner < 0 || system < 0) return 0;
  let available = 0;
  for (let body = 0; body < bodies.length; body += 1) {
    if (!sameWorkforcePool(bodies, body, owner, system)) continue;
    available += (bodies.population[body] ?? 0) * EMPLOYMENT;
  }
  return available;
}

function workforceRequiredInPool(
  bodies: Bodies,
  buildings: Buildings,
  owner: number,
  system: number
): number {
  let requiredTotal = 0;
  for (let body = 0; body < bodies.length; body += 1) {
    if (!sameWorkforcePool(bodies, body, owner, system)) continue;
    let building = bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
      const state = buildings.state[building] ?? BuildingState.Demolished;
      if (state !== BuildingState.UnderConstruction && state !== BuildingState.Demolished) {
        requiredTotal += buildings.workersRequired[building] ?? 0;
      }
      building = buildings.nextInBody[building] ?? -1;
    }
  }
  return requiredTotal;
}

function assignProportionalWorkforceInPool(
  bodies: Bodies,
  buildings: Buildings,
  owner: number,
  system: number,
  ratio: number
): void {
  const clampedRatio = Math.min(1, ratio);
  for (let body = 0; body < bodies.length; body += 1) {
    if (!sameWorkforcePool(bodies, body, owner, system)) continue;
    let building = bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
      const state = buildings.state[building] ?? BuildingState.Demolished;
      const required = buildings.workersRequired[building] ?? 0;
      buildings.assignedWorkers[building] =
        state === BuildingState.UnderConstruction || state === BuildingState.Demolished
          ? 0
          : required * clampedRatio;
      building = buildings.nextInBody[building] ?? -1;
    }
  }
}

function assignGreedyWorkforceInPool(
  bodies: Bodies,
  buildings: Buildings,
  owner: number,
  system: number,
  available: number
): void {
  let remaining = available;
  for (let body = 0; body < bodies.length; body += 1) {
    if (!sameWorkforcePool(bodies, body, owner, system)) continue;
    remaining = assignGreedyWorkforceForBody(bodies, buildings, body, remaining);
  }
}

function assignGreedyWorkforceForBody(
  bodies: Bodies,
  buildings: Buildings,
  body: number,
  available: number
): number {
  let remaining = available;
  let building = bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const state = buildings.state[building] ?? BuildingState.Demolished;
    if (state === BuildingState.UnderConstruction || state === BuildingState.Demolished) {
      buildings.assignedWorkers[building] = 0;
      building = buildings.nextInBody[building] ?? -1;
      continue;
    }
    const required = buildings.workersRequired[building] ?? 0;
    if (required <= remaining) {
      buildings.assignedWorkers[building] = required;
      remaining -= required;
    } else if (required > 0 && remaining >= required * MIN_OPERATION_WORKER_RATIO) {
      buildings.assignedWorkers[building] = remaining;
      remaining = 0;
    } else {
      buildings.assignedWorkers[building] = 0;
      if (buildings.state[building] !== BuildingState.Working) {
        buildings.setIdleNoWorkers(building);
      }
    }
    building = buildings.nextInBody[building] ?? -1;
  }
  return remaining;
}

function sameWorkforcePool(bodies: Bodies, body: number, owner: number, system: number): boolean {
  return (bodies.owner[body] ?? -1) === owner && (bodies.system[body] ?? -1) === system;
}

export function hasWorkersForBuilding(
  bodies: Bodies,
  buildings: Buildings,
  building: number
): boolean {
  const body = buildings.body[building] ?? 0;
  assignWorkforceForBody(bodies, buildings, body);
  const required = buildings.workersRequired[building] ?? 0;
  if (required <= 0) return true;
  return (buildings.assignedWorkers[building] ?? 0) >= required * MIN_OPERATION_WORKER_RATIO;
}

export function requiredFoodPlantsForOwnWorkforce(
  planetSlots: number,
  foodPlantOutputPerBatch: number,
  foodPlantDurationTicks: number,
  foodPerThousandPerDay: number
): number {
  const workers = planetSlots * 4;
  const dailyNeed = workers * foodPerThousandPerDay;
  const dailyOutput = foodPlantOutputPerBatch / foodPlantDurationTicks;
  return dailyOutput > 0 ? dailyNeed / dailyOutput : Number.POSITIVE_INFINITY;
}
