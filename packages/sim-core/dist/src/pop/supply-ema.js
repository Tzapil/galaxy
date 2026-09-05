import { SoAArena } from "../soa/arena.js";
export const SUPPLY_EMA_DAYS = 30;
const SUPPLY_ALPHA = 1 / SUPPLY_EMA_DAYS;
export class SupplyEma {
    arena;
    data;
    emaColumns;
    lastColumns;
    constructor(arena, data) {
        this.arena = arena;
        this.data = data;
        const emaColumns = [];
        const lastColumns = [];
        this.emaColumns = emaColumns;
        this.lastColumns = lastColumns;
        this.refreshColumns();
    }
    static create(data, initialCapacity = 64) {
        const columns = [];
        for (let i = 0; i < data.resources.length; i += 1) {
            const id = data.resources[i]?.id;
            if (id === undefined)
                throw new RangeError("Resource metadata is inconsistent.");
            columns.push({ name: emaColumnName(id), kind: "f64" });
            columns.push({ name: lastColumnName(id), kind: "f64" });
        }
        return new SupplyEma(new SoAArena("supply_ema", columns, initialCapacity), data);
    }
    static fromSnapshot(data, snapshot) {
        return new SupplyEma(SoAArena.fromSnapshot(snapshot), data);
    }
    addBody() {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        for (let resource = 0; resource < this.data.resources.length; resource += 1) {
            column(this.emaColumns[resource])[row] = 1;
            column(this.lastColumns[resource])[row] = 1;
        }
        return row;
    }
    update(body, resource, satisfaction) {
        const value = clamp01(satisfaction);
        const ema = column(this.emaColumns[resource]);
        const previous = ema[body] ?? 1;
        ema[body] = previous + (value - previous) * SUPPLY_ALPHA;
        column(this.lastColumns[resource])[body] = value;
    }
    get(body, resource) {
        return column(this.emaColumns[resource])[body] ?? 1;
    }
    minVital(data, body) {
        let min = 1;
        for (let resource = 0; resource < data.resources.length; resource += 1) {
            const rate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
            if (rate <= 0 || data.populationNeeds.comfortOnly[resource] === 1)
                continue;
            const value = this.get(body, resource);
            if (value < min)
                min = value;
        }
        return min;
    }
    refreshColumns() {
        this.emaColumns.length = 0;
        this.lastColumns.length = 0;
        for (let i = 0; i < this.data.resources.length; i += 1) {
            const id = this.data.resources[i]?.id;
            if (id === undefined)
                throw new RangeError("Resource metadata is inconsistent.");
            this.emaColumns.push(this.arena.column(emaColumnName(id)));
            this.lastColumns.push(this.arena.column(lastColumnName(id)));
        }
    }
}
function emaColumnName(id) {
    return `ema_${id}`;
}
function lastColumnName(id) {
    return `last_${id}`;
}
function column(value) {
    if (value === undefined)
        throw new RangeError("Supply metric column is missing.");
    return value;
}
function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}
//# sourceMappingURL=supply-ema.js.map