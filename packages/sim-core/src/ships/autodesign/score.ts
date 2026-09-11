import type { StageOneData, StageOneDoctrine, WeaponBand } from "../../stage-one/data.js";
import type { TechModifierCache } from "../../tech/modifiers.js";
import type { ShipDesign, ShipDesignStats } from "../design-stats.js";
import { armorReduction, calculateDesignStats } from "../design-stats.js";

export interface EnemyShipProfile {
  readonly shieldFraction: number;
  readonly armorRating: number;
  readonly kineticFraction?: number;
  readonly laserFraction?: number;
  readonly missileFraction?: number;
  readonly plasmaFraction?: number;
}

const DPS_SCALE = 1;
const EHP_SCALE = 0.1;
const CARGO_SCALE = 0.1;
const SCAN_SCALE = 20;
const MINING_SCALE = 2;
const COLONISTS_SCALE = 200;
const TROOPS_SCALE = 0.33;
const INTERCEPT_SCALE = 1;

export function speedScore(speed: number): number {
  // Stage 5.6 / finding B1: diminishing returns keep fast doctrines armed.
  return 30 * Math.log(1 + Math.max(0, speed));
}

export function scoreDesign(
  data: StageOneData,
  design: ShipDesign,
  doctrine: StageOneDoctrine,
  enemy: EnemyShipProfile = data.doctrineScoring.defaultEnemyProfile,
  modifiers?: TechModifierCache,
  faction = 0
): number {
  const stats = calculateDesignStats(data, design, modifiers, faction);
  return scoreStats(data, stats, doctrine, enemy, modifiers, faction);
}

export function scoreStats(
  data: StageOneData,
  stats: ShipDesignStats,
  doctrine: StageOneDoctrine,
  enemy: EnemyShipProfile = data.doctrineScoring.defaultEnemyProfile,
  modifiers?: TechModifierCache,
  faction = 0
): number {
  const weights = doctrine.weights;
  let effectiveDps = 0;
  for (let i = 0; i < stats.weaponModules.length; i += 1) {
    const moduleIndex = stats.weaponModules[i] ?? -1;
    const module = data.modules[moduleIndex];
    if (module === undefined) throw new RangeError(`Unknown weapon module index ${moduleIndex}.`);
    const inBand = moduleHasBand(module.bands, doctrine.preferredBand);
    const damage =
      module.damage * (modifiers?.moduleStatMultiplier(faction, moduleIndex, "damage") ?? 1);
    effectiveDps +=
      damage *
      (inBand ? 1 : data.doctrineScoring.offBandPenalty) *
      threatFactor(data, module.vsShield, module.vsArmor, enemy);
  }

  let score = 0;
  score += weights.dps * effectiveDps * DPS_SCALE;
  score += weights.ehp * stats.effectiveHitPoints * EHP_SCALE;
  score += weights.speed * speedScore(stats.speed);
  score += weights.cargo * stats.cargo * CARGO_SCALE;
  score += weights.scan * stats.scan * SCAN_SCALE;
  score += weights.mining * stats.mining * MINING_SCALE;
  score += weights.colonists * stats.colonists * COLONISTS_SCALE;
  score += weights.troops * stats.troops * TROOPS_SCALE;
  score += weights.intercept * stats.intercept * INTERCEPT_SCALE;
  // Stage 6.5: observed weapons make defenses adaptive instead of decorative.
  score += weights.ehp * (enemy.laserFraction ?? 0) * stats.armorRating * 2;
  score += weights.intercept * (enemy.missileFraction ?? 0) * stats.intercept * 2;
  return score - requirementPenalty(stats, doctrine);
}

export function meetsDoctrineRequirements(
  stats: ShipDesignStats,
  doctrine: StageOneDoctrine
): boolean {
  const req = doctrine.require;
  return (
    stats.speed + 1e-9 >= req.minSpeed &&
    stats.cargo + 1e-9 >= req.minCargo &&
    stats.scan + 1e-9 >= req.minScan &&
    stats.mining + 1e-9 >= req.minMining &&
    stats.colonists + 1e-9 >= req.minColonists &&
    stats.troops + 1e-9 >= req.minTroops
  );
}

export function threatFactor(
  data: StageOneData,
  vsShield: number,
  vsArmor: number,
  enemy: EnemyShipProfile
): number {
  const armorRed = armorReduction(enemy.armorRating, data.doctrineScoring.armorSoftening);
  const shield = Math.max(0, Math.min(1, enemy.shieldFraction));
  return shield * vsShield + (1 - shield) * vsArmor * (1 - armorRed);
}

function requirementPenalty(stats: ShipDesignStats, doctrine: StageOneDoctrine): number {
  const req = doctrine.require;
  let penalty = 0;
  penalty += shortfall(req.minSpeed, stats.speed, 400);
  penalty += shortfall(req.minCargo, stats.cargo, 4);
  penalty += shortfall(req.minScan, stats.scan, 300);
  penalty += shortfall(req.minMining, stats.mining, 40);
  penalty += shortfall(req.minColonists, stats.colonists, 3000);
  penalty += shortfall(req.minTroops, stats.troops, 6);
  return penalty;
}

function shortfall(need: number, have: number, multiplier: number): number {
  return have < need ? (need - have) * multiplier : 0;
}

function moduleHasBand(bands: readonly WeaponBand[], band: WeaponBand): boolean {
  for (let i = 0; i < bands.length; i += 1) {
    if (bands[i] === band) return true;
  }
  return false;
}
