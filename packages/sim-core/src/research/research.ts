import { chooseResearchTopic } from "../ai/research-choice.js";
import { BuildingState } from "../econ/buildings.js";
import { StageOneLogKind } from "../events/log.js";
import type { Rng } from "../rng.js";
import type { StageOneData, StageOneTech } from "../stage-one/data.js";
import { repeatableCostAtLevel, type TechDataCost } from "../tech/repeatable.js";
import { refreshFactionBuildingWorkers } from "../tech/modifiers.js";
import type { StageOneWorld } from "../world/state.js";
import { refreshFactionBlueprints } from "../ships/shipyard.js";

export interface ResearchStepResult {
  readonly collectedPhysics: number;
  readonly collectedEngineering: number;
  readonly collectedBio: number;
  readonly completed: number;
  readonly chosen: number;
}

export function collectAndAdvanceResearch(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  rng?: Rng
): ResearchStepResult {
  const physics = optionalResource(data, "data_physics");
  const engineering = optionalResource(data, "data_engineering");
  const bio = optionalResource(data, "data_bio");
  let collectedPhysics = 0;
  let collectedEngineering = 0;
  let collectedBio = 0;
  let completed = 0;
  let chosen = 0;

  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if ((world.techState.currentTech[faction] ?? -1) < 0) {
      const choice = chooseResearchTopic(data, world, faction, tick, rng);
      if (choice !== undefined) {
        world.techState.setCurrent(faction, choice.tech);
        world.eventLog.append(
          tick,
          StageOneLogKind.ResearchChosen,
          world.factions.capitalSystem[faction] ?? -1,
          world.factions.capitalBody[faction] ?? -1,
          choice.tech,
          choice.bottleneckResource,
          choice.score
        );
        chosen += 1;
      }
    }

    const current = world.techState.currentTech[faction] ?? -1;
    const tech = data.techs[current];
    if (tech === undefined) {
      mirrorProgressToLegacyCounters(world, faction);
      continue;
    }
    if (!capitalCanConvertScience(data, world, faction)) {
      mirrorProgressToLegacyCounters(world, faction);
      continue;
    }

    const cost = repeatableCostAtLevel(tech, world.techState.level(current, faction) + 1);
    const capitalStockpile =
      world.bodies.stockpile[world.factions.capitalBody[faction] ?? -1] ?? -1;
    if (physics >= 0) {
      collectedPhysics += consumeResearchData(
        world,
        faction,
        capitalStockpile,
        physics,
        cost.physics,
        "physics"
      );
    }
    if (engineering >= 0) {
      collectedEngineering += consumeResearchData(
        world,
        faction,
        capitalStockpile,
        engineering,
        cost.engineering,
        "engineering"
      );
    }
    if (bio >= 0) {
      collectedBio += consumeResearchData(world, faction, capitalStockpile, bio, cost.bio, "bio");
    }
    if (researchIsComplete(world, faction, cost)) {
      completeTechnology(data, world, faction, current, tech, tick);
      completed += 1;
    } else {
      mirrorProgressToLegacyCounters(world, faction);
    }
  }

  return { collectedPhysics, collectedEngineering, collectedBio, completed, chosen };
}

function consumeResearchData(
  world: StageOneWorld,
  faction: number,
  stockpile: number,
  resource: number,
  required: number,
  kind: "physics" | "engineering" | "bio"
): number {
  const progress = progressFor(world, faction, kind);
  const remaining = Math.max(0, required - progress);
  if (remaining <= 0.000001) return 0;
  const removed = world.stockpiles.removeAvailable(stockpile, resource, remaining);
  if (kind === "physics") {
    world.techState.progressPhysics[faction] =
      (world.techState.progressPhysics[faction] ?? 0) + removed;
  } else if (kind === "engineering") {
    world.techState.progressEngineering[faction] =
      (world.techState.progressEngineering[faction] ?? 0) + removed;
  } else {
    world.techState.progressBio[faction] = (world.techState.progressBio[faction] ?? 0) + removed;
  }
  return removed;
}

function completeTechnology(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  techIndex: number,
  tech: StageOneTech,
  tick: number
): void {
  const applied = world.techState.markResearched(faction, techIndex);
  world.techState.clearCurrent(faction);
  if (applied) {
    world.techModifiers.recalculateFaction(data, world.techState, faction);
    refreshFactionBuildingWorkers(data, world, faction);
    world.factions.researchedCount[faction] = world.techState.countCompleted(faction);
    refreshFactionBlueprints(data, world, faction, tick);
  }
  world.eventLog.append(
    tick,
    StageOneLogKind.ResearchCompleted,
    world.factions.capitalSystem[faction] ?? -1,
    world.factions.capitalBody[faction] ?? -1,
    faction,
    techIndex,
    tech.repeatable ? world.techState.level(techIndex, faction) : 1
  );
  mirrorProgressToLegacyCounters(world, faction);
}

function researchIsComplete(world: StageOneWorld, faction: number, cost: TechDataCost): boolean {
  return (
    (world.techState.progressPhysics[faction] ?? 0) + 1e-9 >= cost.physics &&
    (world.techState.progressEngineering[faction] ?? 0) + 1e-9 >= cost.engineering &&
    (world.techState.progressBio[faction] ?? 0) + 1e-9 >= cost.bio
  );
}

function capitalCanConvertScience(
  data: StageOneData,
  world: StageOneWorld,
  faction: number
): boolean {
  const capital = world.factions.capitalBody[faction] ?? -1;
  if (capital < 0) return false;
  const physicsLab = data.buildingIndex.get("physics_lab") ?? -1;
  const engineeringLab = data.buildingIndex.get("engineering_lab") ?? -1;
  const bioLab = data.buildingIndex.get("bio_lab") ?? -1;
  const academy = data.buildingIndex.get("academy") ?? -1;
  let building = world.bodies.firstBuilding[capital] ?? -1;
  while (building >= 0) {
    const type = world.buildings.type[building] ?? -1;
    if (
      (type === physicsLab || type === engineeringLab || type === bioLab || type === academy) &&
      world.buildings.state[building] !== BuildingState.Demolished
    ) {
      return true;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return false;
}

function progressFor(
  world: StageOneWorld,
  faction: number,
  kind: "physics" | "engineering" | "bio"
): number {
  if (kind === "physics") return world.techState.progressPhysics[faction] ?? 0;
  if (kind === "engineering") return world.techState.progressEngineering[faction] ?? 0;
  return world.techState.progressBio[faction] ?? 0;
}

function mirrorProgressToLegacyCounters(world: StageOneWorld, faction: number): void {
  world.factions.dataPhysics[faction] = world.techState.progressPhysics[faction] ?? 0;
  world.factions.dataEngineering[faction] = world.techState.progressEngineering[faction] ?? 0;
  world.factions.dataBio[faction] = world.techState.progressBio[faction] ?? 0;
}

function optionalResource(data: StageOneData, id: string): number {
  return data.resourceIndex.get(id) ?? -1;
}
