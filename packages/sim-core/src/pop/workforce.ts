import { BuildingState, type Buildings } from "../econ/buildings.js";
import type { Bodies } from "../world/bodies.js";

export const EMPLOYMENT = 0.55;

export function assignWorkforceForBody(bodies: Bodies, buildings: Buildings, body: number): void {
  let available = (bodies.population[body] ?? 0) * EMPLOYMENT;
  let building = bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const state = buildings.state[building] ?? BuildingState.Demolished;
    if (state === BuildingState.UnderConstruction || state === BuildingState.Demolished) {
      buildings.assignedWorkers[building] = 0;
      building = buildings.nextInBody[building] ?? -1;
      continue;
    }
    const required = buildings.workersRequired[building] ?? 0;
    if (required <= available) {
      buildings.assignedWorkers[building] = required;
      available -= required;
    } else {
      buildings.assignedWorkers[building] = 0;
      if (buildings.state[building] !== BuildingState.Working) {
        buildings.setIdleNoWorkers(building);
      }
    }
    building = buildings.nextInBody[building] ?? -1;
  }
}

export function hasWorkersForBuilding(
  bodies: Bodies,
  buildings: Buildings,
  building: number
): boolean {
  const body = buildings.body[building] ?? 0;
  assignWorkforceForBody(bodies, buildings, body);
  return (buildings.assignedWorkers[building] ?? 0) >= (buildings.workersRequired[building] ?? 0);
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
