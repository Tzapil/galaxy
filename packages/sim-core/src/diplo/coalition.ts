import { StageOneLogKind } from "../events/log.js";
import { fleetCombatStrength } from "../fleet/fleet.js";
import { BuildingState } from "../econ/buildings.js";
import type { StageOneWorld } from "../world/state.js";

import { evaluateTreatyUtility, negotiateTreaty } from "./negotiate.js";
import { TreatyState, TreatyType } from "./treaty.js";

export interface PowerShares {
  readonly systems: number;
  readonly population: number;
  readonly production: number;
  readonly fleet: number;
  readonly combined: number;
}

export interface ThreatAssessment {
  readonly relativeStrength: number;
  readonly absoluteShare: number;
  readonly utilityPressure: number;
  readonly hegemonMultiplier: number;
}

/** Four-dimensional power share; no single fleet spike is enough to define a hegemon. */
export function factionPowerShares(world: StageOneWorld, faction: number): PowerShares {
  const model = collectPowerModel(world);
  return sharesFromModel(model, faction);
}

function sharesFromModel(model: PowerModel, faction: number): PowerShares {
  const factionPower = model.factions[faction] ?? EMPTY_POWER;
  const totals = model.totals;
  const shares = {
    systems: safeShare(factionPower.systems, totals.systems),
    population: safeShare(factionPower.population, totals.population),
    production: safeShare(factionPower.production, totals.production),
    fleet: safeShare(factionPower.fleet, totals.fleet)
  };
  let dimensions = 0;
  let combined = 0;
  if (totals.systems > 0) {
    combined += shares.systems;
    dimensions += 1;
  }
  if (totals.population > 0) {
    combined += shares.population;
    dimensions += 1;
  }
  if (totals.production > 0) {
    combined += shares.production;
    dimensions += 1;
  }
  if (totals.fleet > 0) {
    combined += shares.fleet;
    dimensions += 1;
  }
  return { ...shares, combined: dimensions > 0 ? combined / dimensions : 0 };
}

export function assessThreat(
  world: StageOneWorld,
  observer: number,
  target: number
): ThreatAssessment {
  return assessThreatFromModel(collectPowerModel(world), observer, target);
}

function assessThreatFromModel(
  model: PowerModel,
  observer: number,
  target: number
): ThreatAssessment {
  const own = model.factions[observer] ?? EMPTY_POWER;
  const theirs = model.factions[target] ?? EMPTY_POWER;
  const ownCombined = own.systems * 25 + own.population + own.production * 50 + own.fleet;
  const targetCombined =
    theirs.systems * 25 + theirs.population + theirs.production * 50 + theirs.fleet;
  const relativeStrength = targetCombined / Math.max(1, ownCombined);
  const absoluteShare = sharesFromModel(model, target).combined;
  const relativePressure = Math.max(0, relativeStrength - 1) * 0.45;
  const galacticPressure = Math.max(0, absoluteShare - 0.24) * 8;
  const utilityPressure = relativePressure + galacticPressure;
  return {
    relativeStrength,
    absoluteShare,
    utilityPressure,
    hegemonMultiplier: 1 + galacticPressure
  };
}

/** Herfindahl index over the same combined share used by diplomatic threat evaluation. */
export function powerConcentrationIndex(world: StageOneWorld): number {
  const model = collectPowerModel(world);
  let hhi = 0;
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] !== 1) continue;
    const share = sharesFromModel(model, faction).combined;
    hhi += share * share;
  }
  return hhi;
}

export function hegemonWarMultiplier(
  world: StageOneWorld,
  observer: number,
  target: number
): number {
  return assessThreat(world, observer, target).hegemonMultiplier;
}

/**
 * Re-runs ordinary bilateral defensive-alliance utilities. Simultaneous pressure from one
 * high-share faction makes many offers pass without a separate "form coalition" action.
 */
export function updateCoalitionTreaties(world: StageOneWorld, tick: number): number {
  const model = collectPowerModel(world);
  const formationFloor = Math.max(0.3, fairPowerShare(model) * 1.15);
  let changes = expireSafeCoalitions(world, tick, model);
  for (let target = 0; target < world.factions.length; target += 1) {
    if (world.factionDynamics.alive[target] !== 1) continue;
    for (let a = 0; a < world.factions.length; a += 1) {
      if (a === target || world.factionDynamics.alive[a] !== 1) continue;
      const threatA = assessThreatFromModel(model, a, target);
      if (threatA.absoluteShare <= formationFloor || threatA.utilityPressure <= 0) continue;
      for (let b = a + 1; b < world.factions.length; b += 1) {
        if (b === target || world.factionDynamics.alive[b] !== 1) continue;
        if (world.treaties.activeBetween(TreatyType.DefensiveAlliance, a, b, tick, target) >= 0) {
          continue;
        }
        const threatB = assessThreatFromModel(model, b, target);
        const utilityA = evaluateTreatyUtility(world, a, b, {
          directBenefit: 0.15,
          cost: 0.5,
          sharedThreat: Math.min(threatA.utilityPressure, threatB.utilityPressure)
        });
        const utilityB = evaluateTreatyUtility(world, b, a, {
          directBenefit: 0.15,
          cost: 0.5,
          sharedThreat: Math.min(threatA.utilityPressure, threatB.utilityPressure)
        });
        const result = negotiateTreaty(
          world,
          {
            type: TreatyType.DefensiveAlliance,
            factionA: a,
            factionB: b,
            utilityA,
            utilityB,
            durationTicks: 25 * 365,
            targetFaction: target
          },
          tick
        );
        if (result.accepted) {
          changes += 1;
          world.eventLog.append(tick, StageOneLogKind.CoalitionChanged, -1, -1, a, target, b);
        }
      }
    }
  }
  return changes;
}

function expireSafeCoalitions(world: StageOneWorld, tick: number, model: PowerModel): number {
  const retentionFloor = Math.max(0.27, fairPowerShare(model) * 1.08);
  let changes = 0;
  for (let treaty = 0; treaty < world.treaties.length; treaty += 1) {
    if (
      world.treaties.state[treaty] !== TreatyState.Active ||
      world.treaties.type[treaty] !== TreatyType.DefensiveAlliance
    ) {
      continue;
    }
    const target = world.treaties.targetFaction[treaty] ?? -1;
    if (target < 0) continue;
    const a = world.treaties.factionA[treaty] ?? -1;
    const b = world.treaties.factionB[treaty] ?? -1;
    const pressure = Math.max(
      assessThreatFromModel(model, a, target).utilityPressure,
      assessThreatFromModel(model, b, target).utilityPressure
    );
    const absoluteShare = sharesFromModel(model, target).combined;
    if (absoluteShare > retentionFloor && pressure > 0.25) continue;
    world.treaties.end(treaty, tick);
    world.eventLog.append(tick, StageOneLogKind.CoalitionChanged, -1, -1, a, target, -1);
    changes += 1;
  }
  return changes;
}

interface RawPower {
  readonly systems: number;
  readonly population: number;
  readonly production: number;
  readonly fleet: number;
}

interface PowerModel {
  readonly factions: readonly RawPower[];
  readonly totals: RawPower;
}

const EMPTY_POWER: RawPower = { systems: 0, population: 0, production: 0, fleet: 0 };

function collectPowerModel(world: StageOneWorld): PowerModel {
  const factions: RawPower[] = [];
  const totals = { systems: 0, population: 0, production: 0, fleet: 0 };
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    const power =
      world.factionDynamics.alive[faction] === 1 ? rawPower(world, faction) : EMPTY_POWER;
    factions.push(power);
    totals.systems += power.systems;
    totals.population += power.population;
    totals.production += power.production;
    totals.fleet += power.fleet;
  }
  return { factions, totals };
}

function rawPower(world: StageOneWorld, faction: number): RawPower {
  let systems = 0;
  let population = 0;
  let production = 0;
  let fleet = 0;
  for (let system = 0; system < world.systems.length; system += 1) {
    if ((world.systems.owner[system] ?? -1) === faction) systems += 1;
  }
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) === faction)
      population += world.bodies.population[body] ?? 0;
  }
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] === BuildingState.Demolished) continue;
    const body = world.buildings.body[building] ?? -1;
    if ((world.bodies.owner[body] ?? -1) === faction) production += 1;
  }
  for (let row = 0; row < world.fleets.length; row += 1) {
    const ref = world.fleets.ref(row);
    if ((world.fleets.owner[row] ?? -1) === faction && world.fleets.isAlive(ref)) {
      fleet += fleetCombatStrength(world, ref);
    }
  }
  return { systems, population, production, fleet };
}

function safeShare(value: number, total: number): number {
  return total > 0 ? value / total : 0;
}

function fairPowerShare(model: PowerModel): number {
  let active = 0;
  for (const power of model.factions) {
    if (power.systems > 0 || power.population > 0 || power.production > 0 || power.fleet > 0) {
      active += 1;
    }
  }
  return active > 0 ? 1 / active : 1;
}
