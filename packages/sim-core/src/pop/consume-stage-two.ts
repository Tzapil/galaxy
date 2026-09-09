import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

const SYSTEM_RESERVE_DAYS = 14;

export function consumePopulationWithLocalRedistribution(
  data: StageOneData,
  world: StageOneWorld
): void {
  for (let body = 0; body < world.bodies.length; body += 1) {
    const population = world.bodies.population[body] ?? 0;
    if (population <= 0 || (world.bodies.owner[body] ?? -1) < 0) continue;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const development = Math.max(0.2, world.bodies.development[body] ?? 1);
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      const baseRate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
      if (baseRate <= 0) continue;
      const rate =
        data.populationNeeds.comfortOnly[resource] === 1 ? baseRate * development : baseRate;
      const demand = population * rate;
      if (demand <= 0) {
        world.supply.update(body, resource, 1);
        continue;
      }
      const local = world.stockpiles.removeAvailable(stockpile, resource, demand);
      const shared =
        local >= demand ? 0 : drawFromSameSystem(data, world, body, resource, demand - local, rate);
      world.supply.update(body, resource, (local + shared) / demand);
    }
  }
}

function drawFromSameSystem(
  data: StageOneData,
  world: StageOneWorld,
  targetBody: number,
  resource: number,
  amount: number,
  targetDailyRate: number
): number {
  if ((data.transportable[resource] ?? 0) !== 1) return 0;
  const faction = world.bodies.owner[targetBody] ?? -1;
  const system = world.bodies.system[targetBody] ?? -1;
  if (faction < 0 || system < 0) return 0;

  const totalShortage = sameSystemShortage(data, world, faction, system, resource, targetDailyRate);
  const totalAvailable = sameSystemAvailable(data, world, targetBody, resource, targetDailyRate);
  const fairShare =
    totalShortage > 0 ? Math.min(amount, (totalAvailable * amount) / totalShortage) : amount;
  let remaining = fairShare;
  let removed = 0;
  let sourceBody = world.factions.firstColony[faction] ?? -1;
  while (sourceBody >= 0 && remaining > 0) {
    if (sourceBody !== targetBody && (world.bodies.system[sourceBody] ?? -1) === system) {
      const sourceStockpile = world.bodies.stockpile[sourceBody] ?? 0;
      const sourcePopulation = world.bodies.population[sourceBody] ?? 0;
      const sourceRate = dailyNeedRate(data, world, sourceBody, resource, targetDailyRate);
      const reserve = sourcePopulation * sourceRate * SYSTEM_RESERVE_DAYS;
      const available = Math.max(0, world.stockpiles.get(sourceStockpile, resource) - reserve);
      if (available > 0) {
        const draw = Math.min(available, remaining);
        removed += world.stockpiles.removeAvailable(sourceStockpile, resource, draw);
        remaining = amount - removed;
      }
    }
    sourceBody = world.bodies.nextInFaction[sourceBody] ?? -1;
  }

  return removed;
}

function sameSystemShortage(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  system: number,
  resource: number,
  fallbackRate: number
): number {
  let shortage = 0;
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    if ((world.bodies.system[body] ?? -1) === system) {
      const population = world.bodies.population[body] ?? 0;
      const rate = dailyNeedRate(data, world, body, resource, fallbackRate);
      const demand = population * rate;
      if (demand > 0) {
        const stockpile = world.bodies.stockpile[body] ?? 0;
        shortage += Math.max(0, demand - world.stockpiles.get(stockpile, resource));
      }
    }
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  return shortage;
}

function sameSystemAvailable(
  data: StageOneData,
  world: StageOneWorld,
  targetBody: number,
  resource: number,
  fallbackRate: number
): number {
  const faction = world.bodies.owner[targetBody] ?? -1;
  const system = world.bodies.system[targetBody] ?? -1;
  if (faction < 0 || system < 0) return 0;
  let available = 0;
  let sourceBody = world.factions.firstColony[faction] ?? -1;
  while (sourceBody >= 0) {
    if (sourceBody !== targetBody && (world.bodies.system[sourceBody] ?? -1) === system) {
      const sourceStockpile = world.bodies.stockpile[sourceBody] ?? 0;
      const sourcePopulation = world.bodies.population[sourceBody] ?? 0;
      const sourceRate = dailyNeedRate(data, world, sourceBody, resource, fallbackRate);
      const reserve = sourcePopulation * sourceRate * SYSTEM_RESERVE_DAYS;
      available += Math.max(0, world.stockpiles.get(sourceStockpile, resource) - reserve);
    }
    sourceBody = world.bodies.nextInFaction[sourceBody] ?? -1;
  }
  return available;
}

function dailyNeedRate(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  resource: number,
  fallbackRate: number
): number {
  const baseRate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
  if (baseRate <= 0) return fallbackRate;
  if (data.populationNeeds.comfortOnly[resource] !== 1) return baseRate;
  return baseRate * Math.max(0.2, world.bodies.development[body] ?? 1);
}
