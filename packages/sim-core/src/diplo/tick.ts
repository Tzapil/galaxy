import type { AiBottleneck } from "../ai/bottleneck.js";
import type { RoutePlanner } from "../nav/route.js";
import type { Rng } from "../rng.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import { attemptRegionSecession, retireFaction } from "../cohesion/secession.js";
import { executeForeignTrade } from "../market/foreign-trade.js";

import { findCasusBelli } from "./casus-belli.js";
import { hegemonWarMultiplier, updateCoalitionTreaties } from "./coalition.js";
import { declareWarForCasusBelli, type WarDeclarationResult } from "./declare-war.js";
import { evaluateTreatyUtility, negotiateTreaty } from "./negotiate.js";
import { seekPeace } from "./peace.js";
import { TreatyType } from "./treaty.js";
import { advanceWarExhaustion } from "./war-exhaustion.js";

export interface DiplomacyDayResult {
  readonly treatiesChanged: number;
  readonly trades: number;
  readonly peaceTreaties: number;
  readonly secessions: number;
}

/** Working-system entrypoint called by StageTwoSimulation every game day. */
export function runDiplomacyDay(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  rootRng: Rng
): DiplomacyDayResult {
  advanceWarExhaustion(world);
  let trades = 0;
  if (tick > 0 && tick % 30 === 0) trades = runForeignTradeRound(data, world, tick);
  if (tick <= 0 || tick % 365 !== 0) {
    return { treatiesChanged: 0, trades, peaceTreaties: 0, secessions: 0 };
  }
  let peaceTreaties = 0;
  for (let war = 0; war < world.wars.length; war += 1) {
    if (seekPeace(world, war, tick).concluded) peaceTreaties += 1;
  }
  const treatiesChanged = updateCoalitionTreaties(world, tick) + offerTradeAgreements(world, tick);
  let secessions = 0;
  const initialFactionCount = world.factions.length;
  for (let faction = 0; faction < initialFactionCount; faction += 1) {
    if (world.factionDynamics.alive[faction] !== 1) continue;
    for (let region = 0; region < regionCount(world); region += 1) {
      if (!factionOwnsRegion(world, faction, region)) continue;
      const result = attemptRegionSecession(
        data,
        world,
        faction,
        region,
        tick,
        rootRng.derive(`secession:${faction}:${region}:${tick}`)
      );
      if (result.occurred) secessions += 1;
    }
    if ((world.factions.colonyCount[faction] ?? 0) === 0) {
      retireFaction(world, faction, tick);
    }
  }
  return { treatiesChanged, trades, peaceTreaties, secessions };
}

export function considerWarFromBottleneck(
  data: StageOneData,
  world: StageOneWorld,
  routes: RoutePlanner,
  faction: number,
  bottleneck: AiBottleneck | undefined,
  tick: number,
  rootRng: Rng
): WarDeclarationResult | undefined {
  const casusBelli = findCasusBelli(data, world, routes, faction, bottleneck, tick);
  if (casusBelli === undefined) return undefined;
  return declareWarForCasusBelli(
    data,
    world,
    casusBelli,
    tick,
    rootRng,
    hegemonWarMultiplier(world, faction, casusBelli.defender)
  );
}

function offerTradeAgreements(world: StageOneWorld, tick: number): number {
  let changes = 0;
  for (let a = 0; a < world.factions.length; a += 1) {
    if (world.factionDynamics.alive[a] !== 1) continue;
    for (let b = a + 1; b < world.factions.length; b += 1) {
      if (world.factionDynamics.alive[b] !== 1) continue;
      if (world.treaties.activeBetween(TreatyType.TradeAgreement, a, b, tick) >= 0) continue;
      const complementarity = tradeComplementarity(world, a, b);
      const utilityA = evaluateTreatyUtility(world, a, b, {
        directBenefit: complementarity,
        cost: 0.2
      });
      const utilityB = evaluateTreatyUtility(world, b, a, {
        directBenefit: complementarity,
        cost: 0.2
      });
      const result = negotiateTreaty(
        world,
        {
          type: TreatyType.TradeAgreement,
          factionA: a,
          factionB: b,
          utilityA,
          utilityB,
          durationTicks: 20 * 365
        },
        tick
      );
      if (result.accepted) changes += 1;
    }
  }
  return changes;
}

function runForeignTradeRound(data: StageOneData, world: StageOneWorld, tick: number): number {
  let trades = 0;
  for (let a = 0; a < world.factions.length; a += 1) {
    for (let b = a + 1; b < world.factions.length; b += 1) {
      if (world.treaties.activeBetween(TreatyType.TradeAgreement, a, b, tick) < 0) continue;
      for (let resource = 0; resource < data.resources.length; resource += 1) {
        const priceA = factionAveragePrice(world, a, resource);
        const priceB = factionAveragePrice(world, b, resource);
        if (!Number.isFinite(priceA) || !Number.isFinite(priceB)) continue;
        const seller = priceA <= priceB ? a : b;
        const buyer = seller === a ? b : a;
        const result = executeForeignTrade(data, world, seller, buyer, resource, 10, tick);
        if (result?.traded === true) trades += 1;
      }
    }
  }
  return trades;
}

function tradeComplementarity(world: StageOneWorld, a: number, b: number): number {
  let best = 0;
  for (let resource = 0; resource < world.data.resources.length; resource += 1) {
    const aPrice = factionAveragePrice(world, a, resource);
    const bPrice = factionAveragePrice(world, b, resource);
    if (!Number.isFinite(aPrice) || !Number.isFinite(bPrice)) continue;
    best = Math.max(best, Math.abs(aPrice - bPrice) / Math.max(0.1, Math.max(aPrice, bPrice)));
  }
  return best;
}

function factionAveragePrice(world: StageOneWorld, faction: number, resource: number): number {
  let total = 0;
  let count = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    total += world.prices.price(body, resource);
    count += 1;
  }
  return count > 0 ? total / count : Number.NaN;
}

function regionCount(world: StageOneWorld): number {
  let max = -1;
  for (let system = 0; system < world.systems.length; system += 1) {
    max = Math.max(max, world.systems.region[system] ?? -1);
  }
  return max + 1;
}

function factionOwnsRegion(world: StageOneWorld, faction: number, region: number): boolean {
  for (let system = 0; system < world.systems.length; system += 1) {
    if (
      (world.systems.owner[system] ?? -1) === faction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      return true;
    }
  }
  return false;
}
