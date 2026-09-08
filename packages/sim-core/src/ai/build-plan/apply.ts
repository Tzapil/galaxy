import { startBuildingConstruction } from "../../build/construction.js";
import { BuildingState } from "../../econ/buildings.js";
import type { EventQueue } from "../../events/queue.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
import { logBuildPlan } from "../decision-log.js";

import type { BuildPlan } from "./plan.js";

export interface AppliedBuildPlan {
  readonly started: number;
  readonly queued: number;
}

export function applyBuildPlan(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  tick: number,
  plan: BuildPlan,
  maxQueuedPerFaction = 3
): AppliedBuildPlan {
  let started = 0;
  let queued = activeConstructionForFaction(world, plan.faction);
  for (let i = 0; i < plan.items.length; i += 1) {
    const item = plan.items[i];
    if (item === undefined || queued >= maxQueuedPerFaction) continue;
    for (let count = 0; count < item.count && queued < maxQueuedPerFaction; count += 1) {
      if (!belowCopyLimit(data, world, item.body, item.buildingType)) continue;
      const result = startBuildingConstruction(data, world, queue, item.body, item.buildingType, tick);
      if (!result.ok) continue;
      started += 1;
      queued += 1;
      logBuildPlan(
        data,
        world,
        tick,
        plan.faction,
        item.body,
        item.buildingType,
        item.resource,
        item.score
      );
    }
  }
  return { started, queued };
}

export function activeConstructionForFaction(world: StageOneWorld, faction: number): number {
  let active = 0;
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] !== BuildingState.UnderConstruction) continue;
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) === faction) active += 1;
  }
  return active;
}

function belowCopyLimit(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingType: number
): boolean {
  const def = data.buildings[buildingType];
  if (def === undefined) return false;
  return countBuildingTypeOnBody(world, body, buildingType) < maxCopiesForBuilding(def.id, world.bodies.slots[body] ?? 0);
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

function maxCopiesForBuilding(id: string, slots: number): number {
  if (id === "solar_array") return Math.max(1, Math.ceil(slots / 5));
  if (id === "housing") return Math.max(1, Math.ceil(slots / 6));
  if (id === "shipyard" || id === "hull_yard") return Math.max(1, Math.ceil(slots / 8));
  if (id.endsWith("_mine") || id === "mine" || id === "ice_drill" || id === "gas_collector") {
    return Math.max(1, Math.ceil(slots / 3));
  }
  return Math.max(1, Math.ceil(slots / 4));
}
