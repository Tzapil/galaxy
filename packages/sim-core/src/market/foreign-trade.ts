import { StageOneLogKind } from "../events/log.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import { TreatyType } from "../diplo/treaty.js";

export interface ForeignTradeQuote {
  readonly seller: number;
  readonly buyer: number;
  readonly sellerBody: number;
  readonly buyerBody: number;
  readonly resource: number;
  readonly sellerShadowPrice: number;
  readonly buyerShadowPrice: number;
  readonly negotiatedPrice: number;
  readonly amount: number;
}

export interface ForeignTradeResult extends ForeignTradeQuote {
  readonly traded: boolean;
  readonly credits: number;
}

/** Negotiated border price always stays between both internal shadow prices (spec 5.8). */
export function quoteForeignTrade(
  world: StageOneWorld,
  seller: number,
  buyer: number,
  resource: number,
  requestedAmount: number,
  buyerBargainingPower = 0.5
): ForeignTradeQuote | undefined {
  const sellerBody = bestTradeBody(world, seller, resource, true);
  const buyerBody = bestTradeBody(world, buyer, resource, false);
  if (sellerBody < 0 || buyerBody < 0) return undefined;
  const sellerPrice = world.prices.price(sellerBody, resource);
  const buyerPrice = world.prices.price(buyerBody, resource);
  if (sellerPrice >= buyerPrice - 1e-9) return undefined;
  const power = clamp01(buyerBargainingPower);
  const negotiatedPrice = sellerPrice + (buyerPrice - sellerPrice) * (1 - power);
  const sellerStockpile = world.bodies.stockpile[sellerBody] ?? -1;
  const buyerStockpile = world.bodies.stockpile[buyerBody] ?? -1;
  const stock = world.stockpiles.get(sellerStockpile, resource);
  const room =
    world.stockpiles.capacity(buyerStockpile, resource) -
    world.stockpiles.get(buyerStockpile, resource);
  const affordable =
    negotiatedPrice <= 0 ? 0 : Math.max(0, world.factions.treasury[buyer] ?? 0) / negotiatedPrice;
  const amount = Math.max(0, Math.min(requestedAmount, stock, room, affordable));
  return {
    seller,
    buyer,
    sellerBody,
    buyerBody,
    resource,
    sellerShadowPrice: sellerPrice,
    buyerShadowPrice: buyerPrice,
    negotiatedPrice,
    amount
  };
}

export function executeForeignTrade(
  _data: StageOneData,
  world: StageOneWorld,
  seller: number,
  buyer: number,
  resource: number,
  requestedAmount: number,
  tick: number,
  buyerBargainingPower = 0.5
): ForeignTradeResult | undefined {
  if (world.treaties.activeBetween(TreatyType.TradeAgreement, seller, buyer, tick) < 0) {
    return undefined;
  }
  const quote = quoteForeignTrade(
    world,
    seller,
    buyer,
    resource,
    requestedAmount,
    buyerBargainingPower
  );
  if (quote === undefined) return undefined;
  const credits = quote.amount * quote.negotiatedPrice;
  if (quote.amount <= 0 || credits <= 0) return { ...quote, traded: false, credits: 0 };
  const sellerStockpile = world.bodies.stockpile[quote.sellerBody] ?? -1;
  const buyerStockpile = world.bodies.stockpile[quote.buyerBody] ?? -1;
  if (!world.stockpiles.remove(sellerStockpile, resource, quote.amount)) {
    return { ...quote, traded: false, credits: 0 };
  }
  const rejected = world.stockpiles.addClamped(buyerStockpile, resource, quote.amount);
  if (rejected > 1e-9) {
    world.stockpiles.addClamped(sellerStockpile, resource, quote.amount);
    return { ...quote, traded: false, credits: 0 };
  }
  world.factions.treasury[seller] = cappedCredits((world.factions.treasury[seller] ?? 0) + credits);
  world.factions.treasury[buyer] = cappedCredits((world.factions.treasury[buyer] ?? 0) - credits);
  world.eventLog.append(
    tick,
    StageOneLogKind.ForeignTrade,
    world.bodies.system[quote.buyerBody] ?? -1,
    quote.buyerBody,
    seller,
    resource,
    quote.amount
  );
  return { ...quote, traded: true, credits };
}

function bestTradeBody(
  world: StageOneWorld,
  faction: number,
  resource: number,
  seller: boolean
): number {
  let best = -1;
  let bestScore = seller ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    const stockpile = world.bodies.stockpile[body] ?? -1;
    const available = world.stockpiles.get(stockpile, resource);
    const room = world.stockpiles.capacity(stockpile, resource) - available;
    const eligible = seller ? available > 0.001 : room > 0.001;
    const price = world.prices.price(body, resource);
    if (eligible && (seller ? price < bestScore - 1e-9 : price > bestScore + 1e-9)) {
      best = body;
      bestScore = price;
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return best;
}

function cappedCredits(value: number): number {
  return Math.max(-1e12, Math.min(1e12, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
