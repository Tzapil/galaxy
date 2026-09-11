import { StageOneLogKind } from "../events/log.js";
import { TreatyState } from "../diplo/treaty.js";
import type { Rng } from "../rng.js";
import { ShipState } from "../ships/ships.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import { WarState } from "../war/state.js";

import {
  REGION_TENSION_THRESHOLD,
  updateRegionTension,
  type RegionTensionBreakdown
} from "./tension.js";

export const SECESSION_MIN_HIGH_TICKS = 5 * 365;
export const SECESSION_ANNUAL_CHANCE = 0.3;

export interface SecessionResult {
  readonly occurred: boolean;
  readonly parentFaction: number;
  readonly newFaction: number;
  readonly region: number;
  readonly dominantComponent: keyof RegionTensionBreakdown;
  readonly breakdown: RegionTensionBreakdown;
}

export function attemptRegionSecession(
  data: StageOneData,
  world: StageOneWorld,
  parentFaction: number,
  region: number,
  tick: number,
  rng: Rng,
  chance = SECESSION_ANNUAL_CHANCE
): SecessionResult {
  const breakdown = updateRegionTension(data, world, parentFaction, region, tick);
  const dominantComponent = dominantTensionComponent(breakdown);
  const row = world.cohesion.row(parentFaction, region, true);
  const highSince = world.cohesion.highSinceTick[row] ?? -1;
  const eligible =
    breakdown.total >= REGION_TENSION_THRESHOLD &&
    highSince >= 0 &&
    tick - highSince >= SECESSION_MIN_HIGH_TICKS;
  if (!eligible || rng.nextFloat() >= chance) {
    return {
      occurred: false,
      parentFaction,
      newFaction: -1,
      region,
      dominantComponent,
      breakdown
    };
  }
  const capitalBody = firstRegionBody(world, parentFaction, region);
  if (capitalBody < 0 || regionOwnsCapital(world, parentFaction, region)) {
    return {
      occurred: false,
      parentFaction,
      newFaction: -1,
      region,
      dominantComponent,
      breakdown
    };
  }
  const capitalSystem = world.bodies.system[capitalBody] ?? -1;
  const share = regionPopulationShare(world, parentFaction, region);
  const parentTreasury = Math.max(0, world.factions.treasury[parentFaction] ?? 0);
  const childTreasury = parentTreasury * Math.min(0.6, Math.max(0.1, share));
  world.factions.treasury[parentFaction] = parentTreasury - childTreasury;
  const reusableFaction = firstDormantFaction(world, parentFaction);
  const expansion = clamp(
    (world.factions.characterExpansion[parentFaction] ?? 1) + (rng.nextFloat() - 0.5) * 0.2,
    0.4,
    2
  );
  const industry = clamp(
    (world.factions.characterIndustry[parentFaction] ?? 1) + (rng.nextFloat() - 0.5) * 0.2,
    0.4,
    2
  );
  const label = `Secession ${reusableFaction >= 0 ? reusableFaction : world.factions.length}`;
  const culture = newFactionCulture(world, parentFaction);
  const newFaction =
    reusableFaction >= 0
      ? world.reviveFaction(
          reusableFaction,
          label,
          capitalSystem,
          capitalBody,
          childTreasury,
          expansion,
          industry,
          tick,
          culture
        )
      : world.addFaction(
          label,
          capitalSystem,
          capitalBody,
          childTreasury,
          expansion,
          industry,
          tick,
          culture,
          false
        );
  transferRegion(world, parentFaction, newFaction, region);
  inheritTechnologies(world, parentFaction, newFaction);
  world.factions.rebuildColoniesFromOwners(world.bodies);
  world.relations.setOpinion(newFaction, parentFaction, -80);
  world.relations.setOpinion(parentFaction, newFaction, -55);
  world.relations.recordWar(newFaction, parentFaction);
  world.wars.declare(newFaction, parentFaction, tick);
  world.eventLog.append(
    tick,
    StageOneLogKind.Secession,
    capitalSystem,
    capitalBody,
    newFaction,
    dominantComponentCode(dominantComponent),
    breakdown.total
  );
  world.cohesion.highSinceTick[row] = -1;
  return {
    occurred: true,
    parentFaction,
    newFaction,
    region,
    dominantComponent,
    breakdown
  };
}

/** Ends references to a dead polity so its row can safely host a later secession. */
export function retireFaction(world: StageOneWorld, faction: number, tick: number): void {
  if (world.factionDynamics.alive[faction] !== 1) return;
  for (let fleet = 0; fleet < world.fleets.length; fleet += 1) {
    if ((world.fleets.owner[fleet] ?? -1) !== faction) continue;
    world.fleets.disband(world.fleets.ref(fleet), world.ships);
  }
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if ((world.ships.faction[ship] ?? -1) === faction) world.ships.markDisbanded(ship);
  }
  for (let war = 0; war < world.wars.length; war += 1) {
    if (world.wars.state[war] !== WarState.Active) continue;
    if (
      (world.wars.attacker[war] ?? -1) !== faction &&
      (world.wars.defender[war] ?? -1) !== faction
    ) {
      continue;
    }
    world.wars.end(war, tick);
    const goal = world.warGoals.forWar(war);
    if (goal >= 0) world.warGoals.active[goal] = 0;
  }
  for (let treaty = 0; treaty < world.treaties.length; treaty += 1) {
    if (world.treaties.state[treaty] !== TreatyState.Active) continue;
    if (
      (world.treaties.factionA[treaty] ?? -1) === faction ||
      (world.treaties.factionB[treaty] ?? -1) === faction
    ) {
      world.treaties.end(treaty, tick);
    }
  }
  world.factionDynamics.endFaction(faction, tick);
}

export function formatSecessionReason(result: SecessionResult): string {
  return `раскол региона ${result.region}: напряжение ${result.breakdown.total.toFixed(1)}, главный вклад — ${result.dominantComponent}`;
}

function transferRegion(
  world: StageOneWorld,
  parentFaction: number,
  newFaction: number,
  region: number
): void {
  for (let system = 0; system < world.systems.length; system += 1) {
    if (
      (world.systems.owner[system] ?? -1) === parentFaction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      world.systems.owner[system] = newFaction;
    }
  }
  for (let body = 0; body < world.bodies.length; body += 1) {
    const system = world.bodies.system[body] ?? -1;
    if (
      (world.bodies.owner[body] ?? -1) === parentFaction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      world.bodies.owner[body] = newFaction;
    }
  }
  for (let fleet = 0; fleet < world.fleets.length; fleet += 1) {
    const system = world.fleets.currentSystem[fleet] ?? world.fleets.rallySystem[fleet] ?? -1;
    if (
      (world.fleets.owner[fleet] ?? -1) === parentFaction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      world.fleets.owner[fleet] = newFaction;
    }
  }
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if (world.ships.state[ship] === ShipState.Disbanded) continue;
    const system = world.ships.currentSystem[ship] ?? world.ships.toSystem[ship] ?? -1;
    if (
      (world.ships.faction[ship] ?? -1) === parentFaction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      world.ships.faction[ship] = newFaction;
    }
  }
}

function inheritTechnologies(world: StageOneWorld, parent: number, child: number): void {
  for (let tech = 0; tech < world.data.techs.length; tech += 1) {
    const parentLevel = world.techState.level(tech, parent);
    while (world.techState.level(tech, child) < parentLevel) {
      if (!world.techState.markResearched(child, tech)) break;
    }
  }
  world.techModifiers.recalculateFaction(world.data, world.techState, child);
  world.factions.researchedCount[child] = world.techState.countCompleted(child);
}

function firstRegionBody(world: StageOneWorld, faction: number, region: number): number {
  for (let body = 0; body < world.bodies.length; body += 1) {
    const system = world.bodies.system[body] ?? -1;
    if (
      (world.bodies.owner[body] ?? -1) === faction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      return body;
    }
  }
  return -1;
}

function regionOwnsCapital(world: StageOneWorld, faction: number, region: number): boolean {
  const capital = world.factions.capitalSystem[faction] ?? -1;
  return (world.systems.region[capital] ?? -2) === region;
}

function regionPopulationShare(world: StageOneWorld, faction: number, region: number): number {
  let total = 0;
  let regional = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const population = world.bodies.population[body] ?? 0;
    total += population;
    const system = world.bodies.system[body] ?? -1;
    if ((world.systems.region[system] ?? -1) === region) regional += population;
  }
  return total > 0 ? regional / total : 0.25;
}

function newFactionCulture(world: StageOneWorld, parent: number): number {
  return (world.factionDynamics.culture[parent] ?? parent) + 1;
}

function firstDormantFaction(world: StageOneWorld, parent: number): number {
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (faction !== parent && world.factionDynamics.alive[faction] !== 1) return faction;
  }
  return -1;
}

function dominantTensionComponent(breakdown: RegionTensionBreakdown): keyof RegionTensionBreakdown {
  const keys: readonly (keyof RegionTensionBreakdown)[] = [
    "distance",
    "freshness",
    "culturalForeignness",
    "consumerShortage",
    "vitalShortage",
    "warExhaustion",
    "taxBurden",
    "administrativeCapacity"
  ];
  let best = keys[0] ?? "distance";
  let value = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i] ?? "distance";
    if (breakdown[key] > value) {
      value = breakdown[key];
      best = key;
    }
  }
  return best;
}

function dominantComponentCode(component: keyof RegionTensionBreakdown): number {
  if (component === "distance") return 1;
  if (component === "freshness") return 2;
  if (component === "culturalForeignness") return 3;
  if (component === "consumerShortage") return 4;
  if (component === "vitalShortage") return 5;
  if (component === "warExhaustion") return 6;
  if (component === "taxBurden") return 7;
  return 8;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
