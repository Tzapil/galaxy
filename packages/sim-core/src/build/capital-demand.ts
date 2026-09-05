import { BuildingState } from "../econ/buildings.js";
import type { ResourceAmount, StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export interface PlannedConstruction {
  readonly buildingType: number;
  readonly count: number;
}

export function calculateCapitalDemand(
  data: StageOneData,
  world: StageOneWorld,
  planned: readonly PlannedConstruction[] = []
): Float64Array {
  const demand = new Float64Array(data.resources.length);
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] !== BuildingState.UnderConstruction) continue;
    if ((world.buildings.finishTick[building] ?? -1) >= 0) continue;
    addBag(demand, data.buildings[world.buildings.type[building] ?? 0]?.buildCost ?? [], 1);
  }
  for (let i = 0; i < planned.length; i += 1) {
    const plan = planned[i];
    if (plan === undefined) throw new RangeError("Planned construction entry is inconsistent.");
    addBag(demand, data.buildings[plan.buildingType]?.buildCost ?? [], plan.count);
  }
  return demand;
}

function addBag(target: Float64Array, bag: readonly ResourceAmount[], multiplier: number): void {
  for (let i = 0; i < bag.length; i += 1) {
    const item = bag[i];
    if (item === undefined) throw new RangeError("Resource bag is inconsistent.");
    target[item.resource] = (target[item.resource] ?? 0) + item.amount * multiplier;
  }
}
