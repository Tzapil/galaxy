import { StageOneLogKind } from "../events/log.js";
import type { StageOneData, StageOneTech } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export interface ResearchStepResult {
  readonly collectedPhysics: number;
  readonly collectedEngineering: number;
  readonly collectedBio: number;
  readonly completed: number;
}

export function collectAndAdvanceResearch(
  data: StageOneData,
  world: StageOneWorld,
  tick: number
): ResearchStepResult {
  const physics = optionalResource(data, "data_physics");
  const engineering = optionalResource(data, "data_engineering");
  const bio = optionalResource(data, "data_bio");
  let collectedPhysics = 0;
  let collectedEngineering = 0;
  let collectedBio = 0;

  for (let faction = 0; faction < world.factions.length; faction += 1) {
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
      const stockpile = world.bodies.stockpile[body] ?? 0;
      if (physics >= 0) {
        const amount = world.stockpiles.removeAvailable(
          stockpile,
          physics,
          Number.POSITIVE_INFINITY
        );
        world.factions.dataPhysics[faction] = (world.factions.dataPhysics[faction] ?? 0) + amount;
        collectedPhysics += amount;
      }
      if (engineering >= 0) {
        const amount = world.stockpiles.removeAvailable(
          stockpile,
          engineering,
          Number.POSITIVE_INFINITY
        );
        world.factions.dataEngineering[faction] =
          (world.factions.dataEngineering[faction] ?? 0) + amount;
        collectedEngineering += amount;
      }
      if (bio >= 0) {
        const amount = world.stockpiles.removeAvailable(stockpile, bio, Number.POSITIVE_INFINITY);
        world.factions.dataBio[faction] = (world.factions.dataBio[faction] ?? 0) + amount;
        collectedBio += amount;
      }
      body = world.bodies.nextInFaction[body] ?? -1;
    }
  }

  let completed = 0;
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    while (completeNextAffordableTech(data, world, faction, tick)) completed += 1;
  }

  return { collectedPhysics, collectedEngineering, collectedBio, completed };
}

function completeNextAffordableTech(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tick: number
): boolean {
  const next = nextResearchableTech(data, world.factions.researchedCount[faction] ?? 0);
  if (next < 0) return false;
  const tech = data.techs[next];
  if (tech === undefined) return false;
  if (!canAffordTech(world, faction, tech)) return false;
  world.factions.dataPhysics[faction] =
    (world.factions.dataPhysics[faction] ?? 0) - tech.physicsCost;
  world.factions.dataEngineering[faction] =
    (world.factions.dataEngineering[faction] ?? 0) - tech.engineeringCost;
  world.factions.dataBio[faction] = (world.factions.dataBio[faction] ?? 0) - tech.bioCost;
  world.factions.researchedCount[faction] = Math.max(
    (world.factions.researchedCount[faction] ?? 0) + 1,
    next + 1
  );
  world.eventLog.append(
    tick,
    StageOneLogKind.ResearchCompleted,
    world.factions.capitalSystem[faction] ?? -1,
    world.factions.capitalBody[faction] ?? -1,
    faction,
    next,
    1
  );
  return true;
}

function nextResearchableTech(data: StageOneData, completedCount: number): number {
  for (let i = Math.max(0, completedCount); i < data.techs.length; i += 1) {
    const tech = data.techs[i];
    if (tech === undefined) throw new RangeError("Tech list is inconsistent.");
    if (tech.id === "start") continue;
    if (tech.repeatable) continue;
    if (prerequisitesCompleted(data, i, completedCount)) return i;
  }
  return -1;
}

function prerequisitesCompleted(
  data: StageOneData,
  techIndex: number,
  completedCount: number
): boolean {
  const tech = data.techs[techIndex];
  if (tech === undefined) throw new RangeError("Tech list is inconsistent.");
  for (let i = 0; i < tech.requires.length; i += 1) {
    const required = tech.requires[i] ?? "";
    if (required === "start") continue;
    const index = techIndexById(data, required);
    if (index >= completedCount) return false;
  }
  return true;
}

function canAffordTech(world: StageOneWorld, faction: number, tech: StageOneTech): boolean {
  return (
    (world.factions.dataPhysics[faction] ?? 0) + 1e-9 >= tech.physicsCost &&
    (world.factions.dataEngineering[faction] ?? 0) + 1e-9 >= tech.engineeringCost &&
    (world.factions.dataBio[faction] ?? 0) + 1e-9 >= tech.bioCost
  );
}

function techIndexById(data: StageOneData, id: string): number {
  for (let i = 0; i < data.techs.length; i += 1) {
    if (data.techs[i]?.id === id) return i;
  }
  return Number.MAX_SAFE_INTEGER;
}

function optionalResource(data: StageOneData, id: string): number {
  return data.resourceIndex.get(id) ?? -1;
}
