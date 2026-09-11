import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

/** The primary state of a bilateral relation. Treaties themselves are separate entities. */
export const enum RelationStatus {
  Peace = 0,
  War = 1,
  Truce = 2,
  NonAggression = 3,
  TradeAgreement = 4,
  Passage = 5,
  DefensiveAlliance = 6
}

export type RelationColumn =
  | "lowFaction"
  | "highFaction"
  | "status"
  | "lowOpinion"
  | "highOpinion"
  | "pastWars"
  | "brokenTreaties"
  | "borderFriction"
  | "statusUntilTick";

/**
 * Dense triangular faction-pair matrix in SoA form. Adding faction N appends exactly N rows,
 * so row indexes remain stable for snapshots while lookup stays O(1) (spec 11.1-11.2).
 */
export class Relations {
  public lowFaction: Uint16Array;
  public highFaction: Uint16Array;
  public status: Uint8Array;
  public lowOpinion: Float64Array;
  public highOpinion: Float64Array;
  public pastWars: Uint16Array;
  public brokenTreaties: Uint16Array;
  public borderFriction: Float64Array;
  public statusUntilTick: Float64Array;
  private factionCountValue = 0;

  public constructor(public readonly arena: SoAArena<RelationColumn>) {
    this.lowFaction = new Uint16Array(0);
    this.highFaction = new Uint16Array(0);
    this.status = new Uint8Array(0);
    this.lowOpinion = new Float64Array(0);
    this.highOpinion = new Float64Array(0);
    this.pastWars = new Uint16Array(0);
    this.brokenTreaties = new Uint16Array(0);
    this.borderFriction = new Float64Array(0);
    this.statusUntilTick = new Float64Array(0);
    this.refreshColumns();
    this.factionCountValue = inferFactionCount(arena.length);
  }

  public static create(initialCapacity = 16): Relations {
    return new Relations(
      new SoAArena<RelationColumn>(
        "relations",
        [
          { name: "lowFaction", kind: "u16" },
          { name: "highFaction", kind: "u16" },
          { name: "status", kind: "u8" },
          { name: "lowOpinion", kind: "f64" },
          { name: "highOpinion", kind: "f64" },
          { name: "pastWars", kind: "u16" },
          { name: "brokenTreaties", kind: "u16" },
          { name: "borderFriction", kind: "f64" },
          { name: "statusUntilTick", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Relations {
    return new Relations(SoAArena.fromSnapshot(snapshot) as SoAArena<RelationColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public get factionCount(): number {
    return this.factionCountValue;
  }

  public ensureFactionCount(required: number): void {
    while (this.factionCountValue < required) {
      const high = this.factionCountValue;
      for (let low = 0; low < high; low += 1) this.addPair(low, high);
      this.factionCountValue += 1;
    }
  }

  public row(a: number, b: number): number {
    if (a === b || a < 0 || b < 0) return -1;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    if (high >= this.factionCountValue) return -1;
    return (high * (high - 1)) / 2 + low;
  }

  public relationStatus(a: number, b: number, tick = 0): RelationStatus {
    const row = this.row(a, b);
    if (row < 0) return RelationStatus.Peace;
    const until = this.statusUntilTick[row] ?? -1;
    if (until >= 0 && tick >= until && this.status[row] !== RelationStatus.War) {
      this.status[row] = RelationStatus.Peace;
      this.statusUntilTick[row] = -1;
    }
    return (this.status[row] ?? RelationStatus.Peace) as RelationStatus;
  }

  public setStatus(a: number, b: number, status: RelationStatus, untilTick = -1): void {
    this.ensureFactionCount(Math.max(a, b) + 1);
    const row = this.row(a, b);
    if (row < 0) return;
    this.status[row] = status;
    this.statusUntilTick[row] = untilTick;
  }

  public opinion(observer: number, target: number): number {
    const row = this.row(observer, target);
    if (row < 0) return 0;
    return observer < target ? (this.lowOpinion[row] ?? 0) : (this.highOpinion[row] ?? 0);
  }

  public setOpinion(observer: number, target: number, value: number): void {
    this.ensureFactionCount(Math.max(observer, target) + 1);
    const row = this.row(observer, target);
    if (row < 0) return;
    if (observer < target) this.lowOpinion[row] = clamp(value, -100, 100);
    else this.highOpinion[row] = clamp(value, -100, 100);
  }

  public adjustOpinion(observer: number, target: number, delta: number): void {
    this.setOpinion(observer, target, this.opinion(observer, target) + delta);
  }

  public recordWar(a: number, b: number): void {
    this.ensureFactionCount(Math.max(a, b) + 1);
    const row = this.row(a, b);
    if (row < 0) return;
    this.pastWars[row] = Math.min(0xffff, (this.pastWars[row] ?? 0) + 1);
    this.adjustOpinion(a, b, -12);
    this.adjustOpinion(b, a, -12);
    this.setStatus(a, b, RelationStatus.War);
  }

  public recordTreatyBreach(breaker: number, victim: number): void {
    this.ensureFactionCount(Math.max(breaker, victim) + 1);
    const row = this.row(breaker, victim);
    if (row < 0) return;
    this.brokenTreaties[row] = Math.min(0xffff, (this.brokenTreaties[row] ?? 0) + 1);
    this.adjustOpinion(victim, breaker, -35);
    this.adjustOpinion(breaker, victim, -8);
  }

  public historyScore(observer: number, target: number): number {
    const row = this.row(observer, target);
    if (row < 0) return 0;
    return (
      this.opinion(observer, target) * -0.01 +
      (this.pastWars[row] ?? 0) * 0.08 +
      (this.brokenTreaties[row] ?? 0) * 0.35 +
      Math.max(0, this.borderFriction[row] ?? 0) * 0.02
    );
  }

  public resetFaction(faction: number): void {
    if (faction < 0 || faction >= this.factionCountValue) return;
    for (let other = 0; other < this.factionCountValue; other += 1) {
      const row = this.row(faction, other);
      if (row < 0) continue;
      this.status[row] = RelationStatus.Peace;
      this.lowOpinion[row] = 0;
      this.highOpinion[row] = 0;
      this.pastWars[row] = 0;
      this.brokenTreaties[row] = 0;
      this.borderFriction[row] = 0;
      this.statusUntilTick[row] = -1;
    }
  }

  private addPair(low: number, high: number): void {
    const oldCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    this.lowFaction[row] = low;
    this.highFaction[row] = high;
    this.status[row] = RelationStatus.Peace;
    this.lowOpinion[row] = 0;
    this.highOpinion[row] = 0;
    this.pastWars[row] = 0;
    this.brokenTreaties[row] = 0;
    this.borderFriction[row] = 0;
    this.statusUntilTick[row] = -1;
  }

  private refreshColumns(): void {
    this.lowFaction = this.arena.column("lowFaction") as Uint16Array;
    this.highFaction = this.arena.column("highFaction") as Uint16Array;
    this.status = this.arena.column("status") as Uint8Array;
    this.lowOpinion = this.arena.column("lowOpinion") as Float64Array;
    this.highOpinion = this.arena.column("highOpinion") as Float64Array;
    this.pastWars = this.arena.column("pastWars") as Uint16Array;
    this.brokenTreaties = this.arena.column("brokenTreaties") as Uint16Array;
    this.borderFriction = this.arena.column("borderFriction") as Float64Array;
    this.statusUntilTick = this.arena.column("statusUntilTick") as Float64Array;
  }
}

function inferFactionCount(pairCount: number): number {
  if (pairCount <= 0) return pairCount === 0 ? 1 : 0;
  return Math.trunc((1 + Math.sqrt(1 + pairCount * 8)) / 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
