import { SoAArena } from "../soa/arena.js";
export class MarketPrices {
    arena;
    data;
    priceColumns;
    demandColumns;
    constructor(arena, data) {
        this.arena = arena;
        this.data = data;
        const priceColumns = [];
        const demandColumns = [];
        this.priceColumns = priceColumns;
        this.demandColumns = demandColumns;
        this.refreshColumns();
    }
    static create(data, initialCapacity = 64) {
        const columns = [];
        for (let i = 0; i < data.resources.length; i += 1) {
            const id = data.resources[i]?.id;
            if (id === undefined)
                throw new RangeError("Resource metadata is inconsistent.");
            columns.push({ name: priceColumnName(id), kind: "f64" });
            columns.push({ name: demandColumnName(id), kind: "f64" });
        }
        return new MarketPrices(new SoAArena("market_prices", columns, initialCapacity), data);
    }
    static fromSnapshot(data, snapshot) {
        return new MarketPrices(SoAArena.fromSnapshot(snapshot), data);
    }
    addPoint() {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        for (let resource = 0; resource < this.data.resources.length; resource += 1) {
            column(this.priceColumns[resource])[row] = this.data.baseValue[resource] ?? 1;
            column(this.demandColumns[resource])[row] = 0;
        }
        return row;
    }
    recalculate(data, bodies, stockpiles, buildings) {
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
    price(body, resource) {
        return column(this.priceColumns[resource])[body] ?? 0;
    }
    demand(body, resource) {
        return column(this.demandColumns[resource])[body] ?? 0;
    }
    spreadForResource(bodies, resource) {
        let min = Number.POSITIVE_INFINITY;
        let max = 0;
        for (let body = 0; body < bodies.length; body += 1) {
            if ((bodies.owner[body] ?? -1) < 0 || (bodies.population[body] ?? 0) <= 0)
                continue;
            const price = this.price(body, resource);
            if (price < min)
                min = price;
            if (price > max)
                max = price;
        }
        return Number.isFinite(min) ? max - min : 0;
    }
    refreshColumns() {
        this.priceColumns.length = 0;
        this.demandColumns.length = 0;
        for (let i = 0; i < this.data.resources.length; i += 1) {
            const id = this.data.resources[i]?.id;
            if (id === undefined)
                throw new RangeError("Resource metadata is inconsistent.");
            this.priceColumns.push(this.arena.column(priceColumnName(id)));
            this.demandColumns.push(this.arena.column(demandColumnName(id)));
        }
    }
}
export function estimateDailyDemand(data, bodies, buildings, body, resource) {
    let demand = (bodies.population[body] ?? 0) * (data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
    let building = bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
        const recipeIndex = buildings.batchRecipe[building] ?? -1;
        if (recipeIndex >= 0) {
            const recipe = data.batchRecipes[recipeIndex];
            if (recipe === undefined)
                throw new RangeError("Building recipe index is invalid.");
            for (let i = 0; i < recipe.inputs.length; i += 1) {
                const input = recipe.inputs[i];
                if (input === undefined)
                    throw new RangeError("Recipe input is inconsistent.");
                if (input.resource === resource) {
                    demand += input.amount / Math.max(1, recipe.durationTicks);
                }
            }
        }
        building = buildings.nextInBody[building] ?? -1;
    }
    return demand;
}
function priceColumnName(id) {
    return `price_${id}`;
}
function demandColumnName(id) {
    return `demand_${id}`;
}
function column(value) {
    if (value === undefined)
        throw new RangeError("Market price column is missing.");
    return value;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=prices.js.map