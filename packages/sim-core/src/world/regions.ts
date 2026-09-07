import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";

export type RegionColumn = "centerX" | "centerY" | "firstSystem" | "systemCount";

export class Regions {
  public centerX: Float64Array;
  public centerY: Float64Array;
  public firstSystem: Uint32Array;
  public systemCount: Uint32Array;

  public constructor(public readonly arena: SoAArena<RegionColumn>) {
    this.centerX = new Float64Array(0);
    this.centerY = new Float64Array(0);
    this.firstSystem = new Uint32Array(0);
    this.systemCount = new Uint32Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 8): Regions {
    return new Regions(
      new SoAArena<RegionColumn>(
        "regions",
        [
          { name: "centerX", kind: "f64" },
          { name: "centerY", kind: "f64" },
          { name: "firstSystem", kind: "u32" },
          { name: "systemCount", kind: "u32" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Regions {
    return new Regions(SoAArena.fromSnapshot(snapshot) as SoAArena<RegionColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(centerX: number, centerY: number, firstSystem: number, systemCount: number): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.centerX[row] = centerX;
    this.centerY[row] = centerY;
    this.firstSystem[row] = firstSystem;
    this.systemCount[row] = systemCount;
    return row;
  }

  private refreshColumns(): void {
    this.centerX = this.arena.column("centerX") as Float64Array;
    this.centerY = this.arena.column("centerY") as Float64Array;
    this.firstSystem = this.arena.column("firstSystem") as Uint32Array;
    this.systemCount = this.arena.column("systemCount") as Uint32Array;
  }
}

export type CapitalDistanceColumn = "jumps";

export class CapitalDistances {
  public jumps: Uint16Array;

  public constructor(public readonly arena: SoAArena<CapitalDistanceColumn>) {
    this.jumps = new Uint16Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 32): CapitalDistances {
    return new CapitalDistances(
      new SoAArena<CapitalDistanceColumn>(
        "capital_distances",
        [{ name: "jumps", kind: "u16" }],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): CapitalDistances {
    return new CapitalDistances(SoAArena.fromSnapshot(snapshot) as SoAArena<CapitalDistanceColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public setDistance(system: number, jumps: number): void {
    while (this.arena.length <= system) {
      const previousCapacity = this.arena.capacity;
      this.arena.addRow();
      if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    }
    this.jumps[system] = Math.max(0, Math.min(0xffff, Math.trunc(jumps)));
  }

  public replace(values: Uint16Array): void {
    while (this.arena.length < values.length) {
      const previousCapacity = this.arena.capacity;
      this.arena.addRow();
      if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    }
    for (let i = 0; i < values.length; i += 1) this.jumps[i] = values[i] ?? 0xffff;
  }

  private refreshColumns(): void {
    this.jumps = this.arena.column("jumps") as Uint16Array;
  }
}
