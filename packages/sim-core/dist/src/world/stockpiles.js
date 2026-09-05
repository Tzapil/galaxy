import { SoAArena } from "../soa/arena.js";
export class Stockpiles {
    arena;
    data;
    amountColumns;
    capacityColumns;
    constructor(arena, data) {
        this.arena = arena;
        this.data = data;
        const amountColumns = [];
        const capacityColumns = [];
        this.amountColumns = amountColumns;
        this.capacityColumns = capacityColumns;
        this.refreshColumns();
    }
    static create(data, initialCapacity = 64) {
        const columns = [];
        for (let i = 0; i < data.resources.length; i += 1) {
            const id = data.resources[i]?.id;
            if (id === undefined)
                throw new RangeError("Resource metadata is inconsistent.");
            columns.push({ name: amountColumnName(id), kind: "f64" });
            columns.push({ name: capacityColumnName(id), kind: "f64" });
        }
        return new Stockpiles(new SoAArena("stockpiles", columns, initialCapacity), data);
    }
    static fromSnapshot(data, snapshot) {
        return new Stockpiles(SoAArena.fromSnapshot(snapshot), data);
    }
    get length() {
        return this.arena.length;
    }
    add() {
        const previousCapacity = this.arena.capacity;
        const row = this.arena.addRow();
        if (this.arena.capacity !== previousCapacity)
            this.refreshColumns();
        for (let resource = 0; resource < this.data.resources.length; resource += 1) {
            mustColumn(this.amountColumns[resource])[row] = 0;
            mustColumn(this.capacityColumns[resource])[row] = this.data.storageDefault[resource] ?? 0;
        }
        return row;
    }
    get(row, resource) {
        return mustColumn(this.amountColumns[resource])[row] ?? 0;
    }
    capacity(row, resource) {
        return mustColumn(this.capacityColumns[resource])[row] ?? 0;
    }
    set(row, resource, value) {
        const column = mustColumn(this.amountColumns[resource]);
        const capacity = this.capacity(row, resource);
        column[row] = clamp(value, 0, capacity);
    }
    addClamped(row, resource, amount) {
        const column = mustColumn(this.amountColumns[resource]);
        const current = column[row] ?? 0;
        const capacity = this.capacity(row, resource);
        const accepted = Math.max(0, Math.min(amount, capacity - current));
        column[row] = current + accepted;
        return amount - accepted;
    }
    remove(row, resource, amount) {
        const column = mustColumn(this.amountColumns[resource]);
        const current = column[row] ?? 0;
        if (current + 1e-9 < amount)
            return false;
        column[row] = current - amount;
        return true;
    }
    removeAvailable(row, resource, amount) {
        const column = mustColumn(this.amountColumns[resource]);
        const current = column[row] ?? 0;
        const removed = Math.max(0, Math.min(current, amount));
        column[row] = current - removed;
        return removed;
    }
    hasAtLeast(row, resource, amount) {
        return this.get(row, resource) + 1e-9 >= amount;
    }
    canFit(row, resource, amount) {
        return this.capacity(row, resource) - this.get(row, resource) + 1e-9 >= amount;
    }
    addCapacity(row, amount) {
        for (let resource = 0; resource < this.data.resources.length; resource += 1) {
            const column = mustColumn(this.capacityColumns[resource]);
            column[row] = (column[row] ?? 0) + amount;
        }
    }
    setCapacity(row, resource, capacity) {
        const column = mustColumn(this.capacityColumns[resource]);
        column[row] = Math.max(0, capacity);
        const amount = mustColumn(this.amountColumns[resource]);
        amount[row] = clamp(amount[row] ?? 0, 0, column[row] ?? 0);
    }
    canReserveAll(row, bag) {
        for (let i = 0; i < bag.length; i += 1) {
            const item = bag[i];
            if (item === undefined)
                throw new RangeError("Resource bag is inconsistent.");
            if (!this.hasAtLeast(row, item.resource, item.amount))
                return item.resource;
        }
        return -1;
    }
    canFitAll(row, bag) {
        for (let i = 0; i < bag.length; i += 1) {
            const item = bag[i];
            if (item === undefined)
                throw new RangeError("Resource bag is inconsistent.");
            if (!this.canFit(row, item.resource, item.amount))
                return item.resource;
        }
        return -1;
    }
    refreshColumns() {
        this.amountColumns.length = 0;
        this.capacityColumns.length = 0;
        for (let i = 0; i < this.data.resources.length; i += 1) {
            const id = this.data.resources[i]?.id;
            if (id === undefined)
                throw new RangeError("Resource metadata is inconsistent.");
            this.amountColumns.push(this.arena.column(amountColumnName(id)));
            this.capacityColumns.push(this.arena.column(capacityColumnName(id)));
        }
    }
}
function amountColumnName(id) {
    return `amount_${id}`;
}
function capacityColumnName(id) {
    return `capacity_${id}`;
}
function mustColumn(column) {
    if (column === undefined)
        throw new RangeError("Stockpile resource column is missing.");
    return column;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=stockpiles.js.map