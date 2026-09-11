import { StageOneLogKind } from "../events/log.js";
import { RelationStatus } from "./relations.js";
import { TreatyType } from "./treaty.js";
import type { StageOneWorld } from "../world/state.js";
import { WarState } from "../war/state.js";

export const PEACE_EXHAUSTION_THRESHOLD = 65;
export const MAX_WAR_DURATION_TICKS = 100 * 365;
export const TRUCE_DURATION_TICKS = 10 * 365;

export interface PeaceTerms {
  /** A system currently held by one party that is ceded to the other; -1 means status quo. */
  readonly cededSystem: number;
  readonly recipient: number;
  readonly reparations: number;
  readonly reparationsRecipient: number;
  readonly tradeConcessionTo: number;
}

export interface PeaceEvaluation {
  readonly attackerUtility: number;
  readonly defenderUtility: number;
  readonly mutuallyAcceptable: boolean;
}

export interface PeaceResult extends PeaceEvaluation {
  readonly concluded: boolean;
  readonly reason: "goal-achieved" | "exhaustion" | "duration" | "not-ready" | "rejected";
}

/** Ending a costly war has utility; exhaustion can therefore make adverse terms acceptable. */
export function evaluatePeaceTerms(
  world: StageOneWorld,
  war: number,
  terms: PeaceTerms
): PeaceEvaluation {
  const attacker = world.wars.attacker[war] ?? -1;
  const defender = world.wars.defender[war] ?? -1;
  let attackerUtility = (world.factionDynamics.warExhaustion[attacker] ?? 0) * 0.8;
  let defenderUtility = (world.factionDynamics.warExhaustion[defender] ?? 0) * 0.8;
  if (terms.cededSystem >= 0) {
    const oldOwner = world.systems.owner[terms.cededSystem] ?? -1;
    if (terms.recipient === attacker) attackerUtility += 30;
    if (terms.recipient === defender) defenderUtility += 30;
    if (oldOwner === attacker) attackerUtility -= 45;
    if (oldOwner === defender) defenderUtility -= 45;
  }
  if (terms.reparations > 0) {
    const value = Math.min(50, terms.reparations / 10_000);
    if (terms.reparationsRecipient === attacker) {
      attackerUtility += value;
      defenderUtility -= value;
    } else if (terms.reparationsRecipient === defender) {
      defenderUtility += value;
      attackerUtility -= value;
    }
  }
  if (terms.tradeConcessionTo === attacker) {
    attackerUtility += 8;
    defenderUtility -= 4;
  } else if (terms.tradeConcessionTo === defender) {
    defenderUtility += 8;
    attackerUtility -= 4;
  }
  attackerUtility += world.relations.opinion(attacker, defender) * 0.02;
  defenderUtility += world.relations.opinion(defender, attacker) * 0.02;
  return {
    attackerUtility,
    defenderUtility,
    mutuallyAcceptable: attackerUtility >= 0 && defenderUtility >= 0
  };
}

export function seekPeace(
  world: StageOneWorld,
  war: number,
  tick: number,
  terms: PeaceTerms = statusQuoTerms()
): PeaceResult {
  if (world.wars.state[war] !== WarState.Active) {
    return {
      concluded: false,
      reason: "not-ready",
      attackerUtility: 0,
      defenderUtility: 0,
      mutuallyAcceptable: false
    };
  }
  const goal = world.warGoals.forWar(war);
  const goalAchieved =
    goal >= 0 &&
    (world.systems.owner[world.warGoals.targetSystem[goal] ?? -1] ?? -2) ===
      (world.wars.attacker[war] ?? -1);
  const attacker = world.wars.attacker[war] ?? -1;
  const defender = world.wars.defender[war] ?? -1;
  const exhausted =
    (world.factionDynamics.warExhaustion[attacker] ?? 0) >= PEACE_EXHAUSTION_THRESHOLD ||
    (world.factionDynamics.warExhaustion[defender] ?? 0) >= PEACE_EXHAUSTION_THRESHOLD;
  const tooLong = tick - (world.wars.startedTick[war] ?? tick) >= MAX_WAR_DURATION_TICKS;
  if (!goalAchieved && !exhausted && !tooLong) {
    return {
      concluded: false,
      reason: "not-ready",
      attackerUtility: 0,
      defenderUtility: 0,
      mutuallyAcceptable: false
    };
  }
  const evaluation = evaluatePeaceTerms(world, war, terms);
  if (!evaluation.mutuallyAcceptable && !tooLong) {
    return { ...evaluation, concluded: false, reason: "rejected" };
  }
  applyPeaceTerms(world, terms, tick, attacker, defender);
  world.wars.end(war, tick);
  if (goal >= 0) world.warGoals.active[goal] = 0;
  world.relations.setStatus(attacker, defender, RelationStatus.Truce, tick + TRUCE_DURATION_TICKS);
  world.treaties.add(
    TreatyType.Truce,
    attacker,
    defender,
    tick,
    tick + TRUCE_DURATION_TICKS,
    evaluation.attackerUtility,
    evaluation.defenderUtility
  );
  world.eventLog.append(
    tick,
    StageOneLogKind.PeaceConcluded,
    goal < 0 ? -1 : (world.warGoals.targetSystem[goal] ?? -1),
    -1,
    attacker,
    goal < 0 ? -1 : (world.warGoals.resource[goal] ?? -1),
    goalAchieved ? 1 : exhausted ? 2 : 3
  );
  return {
    ...evaluation,
    concluded: true,
    reason: goalAchieved ? "goal-achieved" : exhausted ? "exhaustion" : "duration"
  };
}

export function statusQuoTerms(): PeaceTerms {
  return {
    cededSystem: -1,
    recipient: -1,
    reparations: 0,
    reparationsRecipient: -1,
    tradeConcessionTo: -1
  };
}

function applyPeaceTerms(
  world: StageOneWorld,
  terms: PeaceTerms,
  tick: number,
  attacker: number,
  defender: number
): void {
  if (terms.cededSystem >= 0 && terms.recipient >= 0) {
    world.systems.owner[terms.cededSystem] = terms.recipient;
    let body = world.systems.firstBody[terms.cededSystem] ?? -1;
    while (body >= 0) {
      const oldOwner = world.bodies.owner[body] ?? -1;
      if (oldOwner >= 0 && oldOwner !== terms.recipient) {
        world.bodies.owner[body] = terms.recipient;
        world.colonyHistory.recordCaptured(body, oldOwner, tick);
      }
      body = world.bodies.nextInSystem[body] ?? -1;
    }
    world.factions.rebuildColoniesFromOwners(world.bodies);
  }
  if (terms.reparations > 0 && terms.reparationsRecipient >= 0) {
    const recipient = terms.reparationsRecipient;
    const payer = recipient === attacker ? defender : recipient === defender ? attacker : -1;
    if (payer >= 0) {
      const paid = Math.min(Math.max(0, world.factions.treasury[payer] ?? 0), terms.reparations);
      world.factions.treasury[payer] = (world.factions.treasury[payer] ?? 0) - paid;
      world.factions.treasury[recipient] = Math.min(
        1e12,
        (world.factions.treasury[recipient] ?? 0) + paid
      );
    }
  }
  if (terms.tradeConcessionTo === attacker || terms.tradeConcessionTo === defender) {
    world.treaties.add(
      TreatyType.TradeAgreement,
      attacker,
      defender,
      tick,
      tick + 25 * 365,
      terms.tradeConcessionTo === attacker ? 8 : -4,
      terms.tradeConcessionTo === defender ? 8 : -4
    );
    world.eventLog.append(
      tick,
      StageOneLogKind.TreatySigned,
      -1,
      -1,
      attacker,
      TreatyType.TradeAgreement,
      defender
    );
  }
}
