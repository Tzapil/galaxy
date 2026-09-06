import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
import { BuildingState } from "../econ/buildings.js";
import type { Buildings } from "../econ/buildings.js";
import type { Bodies } from "../world/bodies.js";
import type { Stockpiles } from "../world/stockpiles.js";

export class MarketPrices {
  public readonly priceColumns: Float64Array[];
  public readonly demandColumns: Float64Array[];

  public constructor(
    public readonly arena: SoAArena<string>,
    private readonly data: StageOneData
  ) {
    const priceColumns: Float64Array[] = [];
    const demandColumns: Float64Array[] = [];
    this.priceColumns = priceColumns;
    this.demandColumns = demandColumns;
    this.refreshColumns();
  }

  public static create(data: StageOneData, initialCapacity = 64): MarketPrices {
    const columns = [];
    for (let i = 0; i < data.resources.length; i += 1) {
      const id = data.resources[i]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      columns.push({ name: priceColumnName(id), kind: "f64" as const });
      columns.push({ name: demandColumnName(id), kind: "f64" as const });
    }
    return new MarketPrices(new SoAArena<string>("market_prices", columns, initialCapacity), data);
  }

  public static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): MarketPrices {
    return new MarketPrices(SoAArena.fromSnapshot(snapshot), data);
  }

  public addPoint(): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      column(this.priceColumns[resource])[row] = this.data.baseValue[resource] ?? 1;
      column(this.demandColumns[resource])[row] = 0;
    }
    return row;
  }

  public recalculate(
    data: StageOneData,
    bodies: Bodies,
    stockpiles: Stockpiles,
    buildings: Buildings
  ): void {
    for (let body = 0; body < bodies.length; body += 1) {
      const stockpile = bodies.stockpile[body] ?? 0;
      for (let resource = 0; resource < data.resources.length; resource += 1) {
        const dailyDemand = estimateDailyDemand(data, bodies, buildings, body, resource);
        const target = Math.max(40, dailyDemand * 60);
        const stock = stockpiles.get(stockpile, resource);
        const scarcity = clamp(2.5 - (2 * stock) / target, 0.15, 4);
        column(this.demandColumns[resource])[body] = dailyDemand;
        column(this.priceColumns[resource])[body] = (data.baseValue[resource] ?? 1) * scarcity;
      }
    }
  }

  public price(body: number, resource: number): number {
    return column(this.priceColumns[resource])[body] ?? 0;
  }

  public demand(body: number, resource: number): number {
    return column(this.demandColumns[resource])[body] ?? 0;
  }

  public spreadForResource(bodies: Bodies, resource: number): number {
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (let body = 0; body < bodies.length; body += 1) {
      if ((bodies.owner[body] ?? -1) < 0 || (bodies.population[body] ?? 0) <= 0) continue;
      const price = this.price(body, resource);
      if (price < min) min = price;
      if (price > max) max = price;
    }
    return Number.isFinite(min) ? max - min : 0;
  }

  private refreshColumns(): void {
    this.priceColumns.length = 0;
    this.demandColumns.length = 0;
    for (let i = 0; i < this.data.resources.length; i += 1) {
      const id = this.data.resources[i]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      this.priceColumns.push(this.arena.column(priceColumnName(id)) as Float64Array);
      this.demandColumns.push(this.arena.column(demandColumnName(id)) as Float64Array);
    }
  }
}

export function estimateDailyDemand(
  data: StageOneData,
  bodies: Bodies,
  buildings: Buildings,
  body: number,
  resource: number
): number {
  let demand =
    (bodies.population[body] ?? 0) * (data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
  let building = bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const state = buildings.state[building] ?? BuildingState.Demolished;
    if (state === BuildingState.UnderConstruction) {
      if ((buildings.finishTick[building] ?? -1) < 0) {
        const type = buildings.type[building] ?? -1;
        const def = data.buildings[type];
        if (def !== undefined) {
          for (let i = 0; i < def.buildCost.length; i += 1) {
            const input = def.buildCost[i];
            if (input === undefined) throw new RangeError("Build cost is inconsistent.");
            if (input.resource === resource) demand += input.amount / 30;
          }
        }
      }
      building = buildings.nextInBody[building] ?? -1;
      continue;
    }
    if (state === BuildingState.UnderConstruction || state === BuildingState.Demolished) {
      building = buildings.nextInBody[building] ?? -1;
      continue;
    }
    const recipeIndex = buildings.batchRecipe[building] ?? -1;
    if (recipeIndex >= 0) {
      const recipe = data.batchRecipes[recipeIndex];
      if (recipe === undefined) throw new RangeError("Building recipe index is invalid.");
      for (let i = 0; i < recipe.inputs.length; i += 1) {
        const input = recipe.inputs[i];
        if (input === undefined) throw new RangeError("Recipe input is inconsistent.");
        if (input.resource === resource) {
          demand += input.amount / Math.max(1, recipe.durationTicks);
        }
      }
    }
    const processIndex = buildings.continuousProcess[building] ?? -1;
    if (processIndex >= 0) {
      const process = data.continuous[processIndex];
      if (process === undefined) throw new RangeError("Building process index is invalid.");
      for (let i = 0; i < process.inputsPerTick.length; i += 1) {
        const input = process.inputsPerTick[i];
        if (input === undefined) throw new RangeError("Continuous input is inconsistent.");
        if (input.resource === resource) demand += input.amount;
      }
    }
    building = buildings.nextInBody[building] ?? -1;
  }
  return demand;
}

function priceColumnName(id: string): string {
  return `price_${id}`;
}

function demandColumnName(id: string): string {
  return `demand_${id}`;
}

function column(value: Float64Array | undefined): Float64Array {
  if (value === undefined) throw new RangeError("Market price column is missing.");
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
