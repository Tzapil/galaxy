import type { StageOneData } from "../stage-one/data.js";
import type { Bodies } from "../world/bodies.js";
import type { Stockpiles } from "../world/stockpiles.js";

import type { SupplyEma } from "./supply-ema.js";

export function consumePopulation(
  data: StageOneData,
  bodies: Bodies,
  stockpiles: Stockpiles,
  supply: SupplyEma
): void {
  for (let body = 0; body < bodies.length; body += 1) {
    const population = bodies.population[body] ?? 0;
    if (population <= 0 || (bodies.owner[body] ?? -1) < 0) continue;
    const stockpile = bodies.stockpile[body] ?? 0;
    const development = Math.max(0.2, bodies.development[body] ?? 1);
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      const baseRate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
      if (baseRate <= 0) continue;
      const rate =
        data.populationNeeds.comfortOnly[resource] === 1 ? baseRate * development : baseRate;
      const demand = population * rate;
      if (demand <= 0) {
        supply.update(body, resource, 1);
        continue;
      }
      const removed = stockpiles.removeAvailable(stockpile, resource, demand);
      supply.update(body, resource, removed / demand);
    }
  }
}
