import { StageOneLogKind } from "../events/log.js";
import type { StageOneWorld } from "../world/state.js";

import { relationStatusForTreaty, TreatyType } from "./treaty.js";

export interface TreatyOffer {
  readonly type: TreatyType;
  readonly factionA: number;
  readonly factionB: number;
  readonly utilityA: number;
  readonly utilityB: number;
  readonly durationTicks: number;
  readonly targetFaction?: number;
}

export interface TreatyNegotiation {
  readonly accepted: boolean;
  readonly treaty: number;
  readonly utilityA: number;
  readonly utilityB: number;
}

/** No treaty is created unless both independently-computed utilities are positive. */
export function negotiateTreaty(
  world: StageOneWorld,
  offer: TreatyOffer,
  tick: number
): TreatyNegotiation {
  if (offer.factionA === offer.factionB || offer.utilityA <= 0 || offer.utilityB <= 0) {
    return {
      accepted: false,
      treaty: -1,
      utilityA: offer.utilityA,
      utilityB: offer.utilityB
    };
  }
  const endsTick =
    offer.durationTicks < 0 ? -1 : tick + Math.max(1, Math.trunc(offer.durationTicks));
  const treaty = world.treaties.add(
    offer.type,
    offer.factionA,
    offer.factionB,
    tick,
    endsTick,
    offer.utilityA,
    offer.utilityB,
    offer.targetFaction ?? -1
  );
  world.relations.setStatus(
    offer.factionA,
    offer.factionB,
    relationStatusForTreaty(offer.type),
    endsTick
  );
  world.relations.adjustOpinion(offer.factionA, offer.factionB, 3);
  world.relations.adjustOpinion(offer.factionB, offer.factionA, 3);
  world.eventLog.append(
    tick,
    StageOneLogKind.TreatySigned,
    -1,
    -1,
    offer.factionA,
    offer.type,
    offer.factionB
  );
  return { accepted: true, treaty, utilityA: offer.utilityA, utilityB: offer.utilityB };
}

export interface TreatyUtilityInput {
  readonly directBenefit: number;
  readonly cost: number;
  readonly sharedThreat?: number;
}

/** History modifies, but cannot replace, the concrete benefit/cost calculation. */
export function evaluateTreatyUtility(
  world: StageOneWorld,
  observer: number,
  partner: number,
  input: TreatyUtilityInput
): number {
  const opinion = world.relations.opinion(observer, partner) * 0.01;
  const row = world.relations.row(observer, partner);
  const breaches = row < 0 ? 0 : (world.relations.brokenTreaties[row] ?? 0);
  return input.directBenefit + (input.sharedThreat ?? 0) + opinion - input.cost - breaches * 0.75;
}
