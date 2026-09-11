import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export type FactionDynamicsColumn =
  "alive" | "bornTick" | "endedTick" | "culture" | "warExhaustion" | "taxBurden";

/** Bounded long-horizon accumulators, one row per faction (spec 11.7). */
export class FactionDynamics {
  public alive: Uint8Array;
  public bornTick: Float64Array;
  public endedTick: Float64Array;
  public culture: Uint16Array;
  public warExhaustion: Float64Array;
  public taxBurden: Float64Array;

  public constructor(public readonly arena: SoAArena<FactionDynamicsColumn>) {
    this.alive = new Uint8Array(0);
    this.bornTick = new Float64Array(0);
    this.endedTick = new Float64Array(0);
    this.culture = new Uint16Array(0);
    this.warExhaustion = new Float64Array(0);
    this.taxBurden = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 8): FactionDynamics {
    return new FactionDynamics(
      new SoAArena<FactionDynamicsColumn>(
        "faction_dynamics",
        [
          { name: "alive", kind: "u8" },
          { name: "bornTick", kind: "f64" },
          { name: "endedTick", kind: "f64" },
          { name: "culture", kind: "u16" },
          { name: "warExhaustion", kind: "f64" },
          { name: "taxBurden", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): FactionDynamics {
    return new FactionDynamics(SoAArena.fromSnapshot(snapshot) as SoAArena<FactionDynamicsColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public addFaction(tick: number, culture: number): number {
    const oldCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    this.alive[row] = 1;
    this.bornTick[row] = tick;
    this.endedTick[row] = -1;
    this.culture[row] = Math.max(0, Math.min(0xffff, Math.trunc(culture)));
    this.warExhaustion[row] = 0;
    this.taxBurden[row] = 0.25;
    return row;
  }

  public endFaction(faction: number, tick: number): void {
    this.alive[faction] = 0;
    this.endedTick[faction] = tick;
  }

  public reviveFaction(faction: number, tick: number, culture: number): void {
    if (faction < 0 || faction >= this.length) throw new RangeError("Unknown faction row.");
    this.alive[faction] = 1;
    this.bornTick[faction] = tick;
    this.endedTick[faction] = -1;
    this.culture[faction] = Math.max(0, Math.min(0xffff, Math.trunc(culture)));
    this.warExhaustion[faction] = 0;
    this.taxBurden[faction] = 0.25;
  }

  private refreshColumns(): void {
    this.alive = this.arena.column("alive") as Uint8Array;
    this.bornTick = this.arena.column("bornTick") as Float64Array;
    this.endedTick = this.arena.column("endedTick") as Float64Array;
    this.culture = this.arena.column("culture") as Uint16Array;
    this.warExhaustion = this.arena.column("warExhaustion") as Float64Array;
    this.taxBurden = this.arena.column("taxBurden") as Float64Array;
  }
}

export type RegionCohesionColumn =
  | "faction"
  | "region"
  | "tension"
  | "highSinceTick"
  | "hiddenHatred"
  | "releasedHatred"
  | "regionalCapitalSystem";

/** Sparse faction-region state; diplomacy runs yearly, outside the per-entity hot loop. */
export class RegionCohesion {
  public faction: Uint16Array;
  public region: Uint16Array;
  public tension: Float64Array;
  public highSinceTick: Float64Array;
  public hiddenHatred: Float64Array;
  public releasedHatred: Float64Array;
  public regionalCapitalSystem: Int32Array;

  public constructor(public readonly arena: SoAArena<RegionCohesionColumn>) {
    this.faction = new Uint16Array(0);
    this.region = new Uint16Array(0);
    this.tension = new Float64Array(0);
    this.highSinceTick = new Float64Array(0);
    this.hiddenHatred = new Float64Array(0);
    this.releasedHatred = new Float64Array(0);
    this.regionalCapitalSystem = new Int32Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 32): RegionCohesion {
    return new RegionCohesion(
      new SoAArena<RegionCohesionColumn>(
        "region_cohesion",
        [
          { name: "faction", kind: "u16" },
          { name: "region", kind: "u16" },
          { name: "tension", kind: "f64" },
          { name: "highSinceTick", kind: "f64" },
          { name: "hiddenHatred", kind: "f64" },
          { name: "releasedHatred", kind: "f64" },
          { name: "regionalCapitalSystem", kind: "i32" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): RegionCohesion {
    return new RegionCohesion(SoAArena.fromSnapshot(snapshot) as SoAArena<RegionCohesionColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public row(faction: number, region: number, create = false): number {
    for (let row = 0; row < this.length; row += 1) {
      if ((this.faction[row] ?? -1) === faction && (this.region[row] ?? -1) === region) return row;
    }
    if (!create) return -1;
    const oldCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    this.faction[row] = faction;
    this.region[row] = region;
    this.tension[row] = 0;
    this.highSinceTick[row] = -1;
    this.hiddenHatred[row] = 0;
    this.releasedHatred[row] = 0;
    this.regionalCapitalSystem[row] = -1;
    return row;
  }

  public resetFaction(faction: number): void {
    for (let row = 0; row < this.length; row += 1) {
      if ((this.faction[row] ?? -1) !== faction) continue;
      this.tension[row] = 0;
      this.highSinceTick[row] = -1;
      this.hiddenHatred[row] = 0;
      this.releasedHatred[row] = 0;
      this.regionalCapitalSystem[row] = -1;
    }
  }

  private refreshColumns(): void {
    this.faction = this.arena.column("faction") as Uint16Array;
    this.region = this.arena.column("region") as Uint16Array;
    this.tension = this.arena.column("tension") as Float64Array;
    this.highSinceTick = this.arena.column("highSinceTick") as Float64Array;
    this.hiddenHatred = this.arena.column("hiddenHatred") as Float64Array;
    this.releasedHatred = this.arena.column("releasedHatred") as Float64Array;
    this.regionalCapitalSystem = this.arena.column("regionalCapitalSystem") as Int32Array;
  }
}
