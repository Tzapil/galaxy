import { personalityWeightsForFaction } from "../ai/utility.js";
import { StageOneLogKind } from "../events/log.js";
import { fleetCombatStrength, FleetState } from "../fleet/fleet.js";
import { estimateIntel, estimatedEnemyCapability } from "../intel/estimate.js";
import { RelationStatus } from "./relations.js";
import type { Rng } from "../rng.js";
import { ShipRole, ShipState } from "../ships/ships.js";
import { resourceIndexOf, type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

import type { CasusBelli } from "./casus-belli.js";
import { TreatyType } from "./treaty.js";

export const MAX_SIMULTANEOUS_WAR_FRONTS = 2;
export const WAR_DECLARATION_THRESHOLD = 1.5;

export interface WarDecisionFactors {
  readonly need: number;
  readonly capable: number;
  readonly price: number;
  readonly history: number;
  readonly personality: number;
  readonly hegemon: number;
  readonly ownStrength: number;
  readonly enemyStrength: number;
  readonly availableFuel: number;
  readonly requiredFuel: number;
  readonly activeWars: number;
}

export interface WarDecision {
  readonly declare: boolean;
  readonly score: number;
  readonly reason: "declare" | "need" | "fuel" | "fronts" | "strength" | "treaty" | "threshold";
  readonly factors: WarDecisionFactors;
}

/** Pure five-factor utility from spec 11.1; callers can inspect every term. */
export function evaluateWarDecision(factors: WarDecisionFactors): WarDecision {
  const score =
    factors.need * factors.capable * factors.price * factors.personality * factors.hegemon +
    factors.history;
  let reason: WarDecision["reason"] = "declare";
  if (factors.need <= 0) reason = "need";
  else if (factors.activeWars >= MAX_SIMULTANEOUS_WAR_FRONTS) reason = "fronts";
  else if (factors.availableFuel + 1e-9 < factors.requiredFuel) reason = "fuel";
  else if (factors.ownStrength + 1e-9 < factors.enemyStrength * 0.75) reason = "strength";
  else if (score <= WAR_DECLARATION_THRESHOLD) reason = "threshold";
  return { declare: reason === "declare", score, reason, factors };
}

export interface WarDeclarationResult extends WarDecision {
  readonly war: number;
  readonly goal: number;
}

export function declareWarForCasusBelli(
  data: StageOneData,
  world: StageOneWorld,
  casusBelli: CasusBelli,
  tick: number,
  rootRng: Rng,
  hegemonMultiplier = 1
): WarDeclarationResult {
  const attacker = casusBelli.attacker;
  const defender = casusBelli.defender;
  const ownStrength = factionMilitaryStrength(world, attacker);
  const intel = estimateIntel(world.intel, attacker, defender, tick, rootRng);
  const enemyStrength = estimatedEnemyCapability(intel);
  const activeWars = activeWarCount(world, attacker);
  const fuel = factionResourceStock(
    data,
    world,
    attacker,
    resourceIndexOf(data.resourceIndex, "fuel")
  );
  const weights = personalityWeightsForFaction(data, world, attacker);
  const relationStatus = world.relations.relationStatus(attacker, defender, tick);
  const treatyBlocks =
    relationStatus === RelationStatus.Truce ||
    relationStatus === RelationStatus.NonAggression ||
    world.treaties.activeBetween(TreatyType.Truce, attacker, defender, tick) >= 0 ||
    world.treaties.activeBetween(TreatyType.NonAggression, attacker, defender, tick) >= 0;
  const factors: WarDecisionFactors = {
    need: casusBelli.need,
    capable: ownStrength / Math.max(1, enemyStrength),
    price: treatyBlocks ? 0 : 1 / (1 + activeWars * 0.8),
    history: world.relations.historyScore(attacker, defender),
    personality: Math.max(0.2, (weights.military + weights.risk) / 2),
    hegemon: Math.max(0.5, hegemonMultiplier),
    ownStrength,
    enemyStrength,
    availableFuel: fuel,
    requiredFuel: casusBelli.routeFuelCost,
    activeWars
  };
  const decision = evaluateWarDecision(factors);
  if (treatyBlocks) return { ...decision, declare: false, reason: "treaty", war: -1, goal: -1 };
  if (!decision.declare) return { ...decision, war: -1, goal: -1 };
  const war = world.wars.declare(attacker, defender, tick);
  const goal = world.warGoals.add(
    war,
    attacker,
    defender,
    casusBelli.resource,
    casusBelli.targetSystem,
    casusBelli.need,
    ownStrength
  );
  world.relations.recordWar(attacker, defender);
  world.eventLog.append(
    tick,
    StageOneLogKind.WarDeclared,
    casusBelli.targetSystem,
    -1,
    attacker,
    casusBelli.resource,
    defender
  );
  return { ...decision, war, goal };
}

export function activeWarCount(world: StageOneWorld, faction: number): number {
  let count = 0;
  for (let war = 0; war < world.wars.length; war += 1) {
    if (world.wars.state[war] !== 1) continue;
    if (
      (world.wars.attacker[war] ?? -1) === faction ||
      (world.wars.defender[war] ?? -1) === faction
    ) {
      count += 1;
    }
  }
  return count;
}

export function factionMilitaryStrength(world: StageOneWorld, faction: number): number {
  let strength = 0;
  for (let fleet = 0; fleet < world.fleets.length; fleet += 1) {
    const ref = world.fleets.ref(fleet);
    if (
      world.fleets.isAlive(ref) &&
      world.fleets.state[fleet] !== FleetState.Disbanded &&
      (world.fleets.owner[fleet] ?? -1) === faction
    ) {
      strength += fleetCombatStrength(world, ref);
    }
  }
  if (strength > 0) return strength;
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if ((world.ships.faction[ship] ?? -1) !== faction) continue;
    if (world.ships.state[ship] === ShipState.Disbanded) continue;
    if (world.ships.role[ship] === ShipRole.Warship) strength += 100;
  }
  return strength;
}

function factionResourceStock(
  _data: StageOneData,
  world: StageOneWorld,
  faction: number,
  resource: number
): number {
  let total = 0;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    total += world.stockpiles.get(world.bodies.stockpile[body] ?? 0, resource);
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return total;
}
