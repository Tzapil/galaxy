import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";

export const SUPPLY_EMA_DAYS = 30;
const SUPPLY_ALPHA = 1 / SUPPLY_EMA_DAYS;

export class SupplyEma {
  public readonly emaColumns: Float64Array[];
  public readonly lastColumns: Float64Array[];

  public constructor(
    public readonly arena: SoAArena<string>,
    private readonly data: StageOneData
  ) {
    const emaColumns: Float64Array[] = [];
    const lastColumns: Float64Array[] = [];
    this.emaColumns = emaColumns;
    this.lastColumns = lastColumns;
    this.refreshColumns();
  }

  public static create(data: StageOneData, initialCapacity = 64): SupplyEma {
    const columns = [];
    for (let i = 0; i < data.resources.length; i += 1) {
      const id = data.resources[i]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      columns.push({ name: emaColumnName(id), kind: "f64" as const });
      columns.push({ name: lastColumnName(id), kind: "f64" as const });
    }
    return new SupplyEma(new SoAArena<string>("supply_ema", columns, initialCapacity), data);
  }

  public static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): SupplyEma {
    return new SupplyEma(SoAArena.fromSnapshot(snapshot), data);
  }

  public addBody(): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    for (let resource = 0; resource < this.data.resources.length; resource += 1) {
      column(this.emaColumns[resource])[row] = 1;
      column(this.lastColumns[resource])[row] = 1;
    }
    return row;
  }

  public update(body: number, resource: number, satisfaction: number): void {
    const value = clamp01(satisfaction);
    const ema = column(this.emaColumns[resource]);
    const previous = ema[body] ?? 1;
    ema[body] = previous + (value - previous) * SUPPLY_ALPHA;
    column(this.lastColumns[resource])[body] = value;
  }

  public get(body: number, resource: number): number {
    return column(this.emaColumns[resource])[body] ?? 1;
  }

  public minVital(data: StageOneData, body: number): number {
    let min = 1;
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      const rate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
      if (rate <= 0 || data.populationNeeds.comfortOnly[resource] === 1) continue;
      const value = this.get(body, resource);
      if (value < min) min = value;
    }
    return min;
  }

  private refreshColumns(): void {
    this.emaColumns.length = 0;
    this.lastColumns.length = 0;
    for (let i = 0; i < this.data.resources.length; i += 1) {
      const id = this.data.resources[i]?.id;
      if (id === undefined) throw new RangeError("Resource metadata is inconsistent.");
      this.emaColumns.push(this.arena.column(emaColumnName(id)) as Float64Array);
      this.lastColumns.push(this.arena.column(lastColumnName(id)) as Float64Array);
    }
  }
}

function emaColumnName(id: string): string {
  return `ema_${id}`;
}

function lastColumnName(id: string): string {
  return `last_${id}`;
}

function column(value: Float64Array | undefined): Float64Array {
  if (value === undefined) throw new RangeError("Supply metric column is missing.");
  return value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
