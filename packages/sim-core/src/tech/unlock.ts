import type { StageOneData, StageOneTechEffectType } from "../stage-one/data.js";

import type { FactionTechState } from "./state.js";

export interface AppliedTechEffects {
  readonly unlockModule: number;
  readonly unlockHull: number;
  readonly unlockBuilding: number;
  readonly modifier: number;
  readonly ability: number;
}

export function emptyAppliedTechEffects(): AppliedTechEffects {
  return {
    unlockModule: 0,
    unlockHull: 0,
    unlockBuilding: 0,
    modifier: 0,
    ability: 0
  };
}

export function summarizeAppliedTechEffects(
  data: StageOneData,
  techIndex: number
): AppliedTechEffects {
  const tech = data.techs[techIndex];
  if (tech === undefined) throw new RangeError(`Unknown technology index ${techIndex}.`);
  let unlockModule = 0;
  let unlockHull = 0;
  let unlockBuilding = 0;
  let modifier = 0;
  let ability = 0;
  for (let i = 0; i < tech.effects.length; i += 1) {
    const type = tech.effects[i]?.type;
    if (type === "unlockModule") unlockModule += 1;
    else if (type === "unlockHull") unlockHull += 1;
    else if (type === "unlockBuilding") unlockBuilding += 1;
    else if (type === "modifier") modifier += 1;
    else if (type === "ability") ability += 1;
    else if (type !== undefined) assertKnownEffectType(type);
  }
  return { unlockModule, unlockHull, unlockBuilding, modifier, ability };
}

export function isModuleUnlocked(
  data: StageOneData,
  techState: FactionTechState,
  faction: number,
  moduleIndex: number
): boolean {
  const module = data.modules[moduleIndex];
  if (module === undefined) return false;
  return isTechUnlockedById(data, techState, faction, module.tech);
}

export function isHullUnlocked(
  data: StageOneData,
  techState: FactionTechState,
  faction: number,
  hullIndex: number
): boolean {
  const hull = data.hulls[hullIndex];
  if (hull === undefined) return false;
  return isTechUnlockedById(data, techState, faction, hull.tech);
}

export function isBuildingUnlocked(
  data: StageOneData,
  techState: FactionTechState,
  faction: number,
  buildingIndex: number
): boolean {
  const building = data.buildings[buildingIndex];
  if (building === undefined) return false;
  for (let tech = 0; tech < data.techs.length; tech += 1) {
    if (!techState.hasResearched(faction, tech)) continue;
    if (techUnlocksBuilding(data, tech, building.id)) return true;
  }
  return false;
}

export function hasAbility(
  data: StageOneData,
  techState: FactionTechState,
  faction: number,
  abilityId: string
): boolean {
  for (let tech = 0; tech < data.techs.length; tech += 1) {
    if (!techState.hasResearched(faction, tech)) continue;
    const item = data.techs[tech];
    if (item === undefined) throw new RangeError("Technology table is inconsistent.");
    for (let i = 0; i < item.effects.length; i += 1) {
      const effect = item.effects[i];
      if (effect?.type === "ability" && effect.id === abilityId) return true;
    }
  }
  return false;
}

export function isTechUnlockedById(
  data: StageOneData,
  techState: FactionTechState,
  faction: number,
  techId: string
): boolean {
  const tech = data.techIndex.get(techId);
  if (tech === undefined) return false;
  return techState.hasResearched(faction, tech);
}

function techUnlocksBuilding(data: StageOneData, techIndex: number, buildingId: string): boolean {
  const tech = data.techs[techIndex];
  if (tech === undefined) throw new RangeError("Technology table is inconsistent.");
  for (let i = 0; i < tech.effects.length; i += 1) {
    const effect = tech.effects[i];
    if (effect?.type === "unlockBuilding" && effect.id === buildingId) return true;
  }
  return false;
}

function assertKnownEffectType(type: StageOneTechEffectType): void {
  if (
    type !== "unlockModule" &&
    type !== "unlockHull" &&
    type !== "unlockBuilding" &&
    type !== "modifier" &&
    type !== "ability"
  ) {
    throw new RangeError(`Unknown technology effect type "${type}".`);
  }
}
