import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { ResourceAmount, StageOneData } from "../stage-one/data.js";

export class Stockpiles {
  public readonly amountColumns: Float64Array[];
  public readonly capacityColumns: Float64Array[];

  public constructor(
    public readonly arena: SoAArena<string>,
    private readonly data: StageOneData
  ) {
    const amountColumns: Float64Array[] = [];
    const capacityColumns: Float64Array[] = [];
    this.amountColumns = amountColumns;
    this.capacityColumns = capacityColumns;
    this.refreshColumns();
  }

  public static create(data: StageOneData, initialCapacity = 64): Stockpiles {
    const columns = [];
    for (let i = 0; i < data.resources.length; i += 1) {
      const id = data.resources[i]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      columns.push({ name: amountColumnName(id), kind: "f64" as const });
      columns.push({ name: capacityColumnName(id), kind: "f64" as const });
    }
    return new Stockpiles(new SoAArena<string>("stockpiles", columns, initialCapacity), data);
  }

  public static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): Stockpiles {
    return new Stockpiles(SoAArena.fromSnapshot(snapshot), data);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      mustColumn(this.amountColumns[resource])[row] = 0;
      mustColumn(this.capacityColumns[resource])[row] = this.data.storageDefault[resource] ?? 0;
    }
    return row;
  }

  public get(row: number, resource: number): number {
    return mustColumn(this.amountColumns[resource])[row] ?? 0;
  }

  public capacity(row: number, resource: number): number {
    return mustColumn(this.capacityColumns[resource])[row] ?? 0;
  }

  public set(row: number, resource: number, value: number): void {
    const column = mustColumn(this.amountColumns[resource]);
    const capacity = this.capacity(row, resource);
    column[row] = clamp(value, 0, capacity);
  }

  public addClamped(row: number, resource: number, amount: number): number {
    const column = mustColumn(this.amountColumns[resource]);
    const current = column[row] ?? 0;
    const capacity = this.capacity(row, resource);
    const accepted = Math.max(0, Math.min(amount, capacity - current));
    column[row] = current + accepted;
    return amount - accepted;
  }

  public remove(row: number, resource: number, amount: number): boolean {
    const column = mustColumn(this.amountColumns[resource]);
    const current = column[row] ?? 0;
    if (current + 1e-9 < amount) return false;
    column[row] = current - amount;
    return true;
  }

  public removeAvailable(row: number, resource: number, amount: number): number {
    const column = mustColumn(this.amountColumns[resource]);
    const current = column[row] ?? 0;
    const removed = Math.max(0, Math.min(current, amount));
    column[row] = current - removed;
    return removed;
  }

  public hasAtLeast(row: number, resource: number, amount: number): boolean {
    return this.get(row, resource) + 1e-9 >= amount;
  }

  public canFit(row: number, resource: number, amount: number): boolean {
    return this.capacity(row, resource) - this.get(row, resource) + 1e-9 >= amount;
  }

  public addCapacity(row: number, amount: number): void {
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      const column = mustColumn(this.capacityColumns[resource]);
      column[row] = Math.max(0, (column[row] ?? 0) + amount);
      const values = mustColumn(this.amountColumns[resource]);
      values[row] = clamp(values[row] ?? 0, 0, column[row] ?? 0);
    }
  }

  public setCapacity(row: number, resource: number, capacity: number): void {
    const column = mustColumn(this.capacityColumns[resource]);
    column[row] = Math.max(0, capacity);
    const amount = mustColumn(this.amountColumns[resource]);
    amount[row] = clamp(amount[row] ?? 0, 0, column[row] ?? 0);
  }

  public canReserveAll(row: number, bag: readonly ResourceAmount[]): number {
    for (let i = 0; i < bag.length; i += 1) {
      const item = bag[i];
      if (item === undefined) throw new RangeError("Resource bag is inconsistent.");
      if (!this.hasAtLeast(row, item.resource, item.amount)) return item.resource;
    }
    return -1;
  }

  public canFitAll(row: number, bag: readonly ResourceAmount[]): number {
    for (let i = 0; i < bag.length; i += 1) {
      const item = bag[i];
      if (item === undefined) throw new RangeError("Resource bag is inconsistent.");
      if (!this.canFit(row, item.resource, item.amount)) return item.resource;
    }
    return -1;
  }

  private refreshColumns(): void {
    this.amountColumns.length = 0;
    this.capacityColumns.length = 0;
    for (let i = 0; i < this.data.resources.length; i += 1) {
      const id = this.data.resources[i]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      this.amountColumns.push(this.arena.column(amountColumnName(id)) as Float64Array);
      this.capacityColumns.push(this.arena.column(capacityColumnName(id)) as Float64Array);
    }
  }
}

function amountColumnName(id: string): string {
  return `amount_${id}`;
}

function capacityColumnName(id: string): string {
  return `capacity_${id}`;
}

function mustColumn(column: Float64Array | undefined): Float64Array {
  if (column === undefined) throw new RangeError("Stockpile resource column is missing.");
  return column;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
