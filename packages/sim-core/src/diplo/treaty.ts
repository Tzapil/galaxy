import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";
import type { Wars } from "../war/state.js";

import { RelationStatus, type Relations } from "./relations.js";

export const enum TreatyType {
  Truce = 1,
  NonAggression = 2,
  TradeAgreement = 3,
  Passage = 4,
  DefensiveAlliance = 5
}

export const enum TreatyState {
  Ended = 0,
  Active = 1
}

export type TreatyColumn =
  | "type"
  | "state"
  | "factionA"
  | "factionB"
  | "targetFaction"
  | "startedTick"
  | "endsTick"
  | "utilityA"
  | "utilityB";

/** Persistent, bounded-condition treaty entities from spec 11.2. */
export class Treaties {
  public type: Uint8Array;
  public state: Uint8Array;
  public factionA: Uint16Array;
  public factionB: Uint16Array;
  public targetFaction: Int32Array;
  public startedTick: Float64Array;
  public endsTick: Float64Array;
  public utilityA: Float64Array;
  public utilityB: Float64Array;

  public constructor(public readonly arena: SoAArena<TreatyColumn>) {
    this.type = new Uint8Array(0);
    this.state = new Uint8Array(0);
    this.factionA = new Uint16Array(0);
    this.factionB = new Uint16Array(0);
    this.targetFaction = new Int32Array(0);
    this.startedTick = new Float64Array(0);
    this.endsTick = new Float64Array(0);
    this.utilityA = new Float64Array(0);
    this.utilityB = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 32): Treaties {
    return new Treaties(
      new SoAArena<TreatyColumn>(
        "treaties",
        [
          { name: "type", kind: "u8" },
          { name: "state", kind: "u8" },
          { name: "factionA", kind: "u16" },
          { name: "factionB", kind: "u16" },
          { name: "targetFaction", kind: "i32" },
          { name: "startedTick", kind: "f64" },
          { name: "endsTick", kind: "f64" },
          { name: "utilityA", kind: "f64" },
          { name: "utilityB", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Treaties {
    return new Treaties(SoAArena.fromSnapshot(snapshot) as SoAArena<TreatyColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(
    type: TreatyType,
    factionA: number,
    factionB: number,
    tick: number,
    endsTick: number,
    utilityA: number,
    utilityB: number,
    targetFaction = -1
  ): number {
    const existing = this.activeBetween(type, factionA, factionB, tick, targetFaction);
    if (existing >= 0) return existing;
    let row = -1;
    for (let candidate = 0; candidate < this.length; candidate += 1) {
      if (this.state[candidate] === TreatyState.Ended) {
        row = candidate;
        break;
      }
    }
    if (row < 0) {
      const oldCapacity = this.arena.capacity;
      row = this.arena.addRow();
      if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    }
    this.type[row] = type;
    this.state[row] = TreatyState.Active;
    this.factionA[row] = factionA;
    this.factionB[row] = factionB;
    this.targetFaction[row] = targetFaction;
    this.startedTick[row] = tick;
    this.endsTick[row] = endsTick;
    this.utilityA[row] = utilityA;
    this.utilityB[row] = utilityB;
    return row;
  }

  public activeBetween(
    type: TreatyType,
    a: number,
    b: number,
    tick: number,
    targetFaction = -1
  ): number {
    for (let treaty = 0; treaty < this.length; treaty += 1) {
      if (this.state[treaty] !== TreatyState.Active || this.type[treaty] !== type) continue;
      if ((this.endsTick[treaty] ?? -1) >= 0 && tick >= (this.endsTick[treaty] ?? -1)) {
        this.state[treaty] = TreatyState.Ended;
        continue;
      }
      const left = this.factionA[treaty] ?? -1;
      const right = this.factionB[treaty] ?? -1;
      if (!((left === a && right === b) || (left === b && right === a))) continue;
      if (targetFaction >= 0 && (this.targetFaction[treaty] ?? -1) !== targetFaction) continue;
      return treaty;
    }
    return -1;
  }

  public end(treaty: number, tick: number): boolean {
    if (this.state[treaty] !== TreatyState.Active) return false;
    this.state[treaty] = TreatyState.Ended;
    this.endsTick[treaty] = tick;
    return true;
  }

  private refreshColumns(): void {
    this.type = this.arena.column("type") as Uint8Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.factionA = this.arena.column("factionA") as Uint16Array;
    this.factionB = this.arena.column("factionB") as Uint16Array;
    this.targetFaction = this.arena.column("targetFaction") as Int32Array;
    this.startedTick = this.arena.column("startedTick") as Float64Array;
    this.endsTick = this.arena.column("endsTick") as Float64Array;
    this.utilityA = this.arena.column("utilityA") as Float64Array;
    this.utilityB = this.arena.column("utilityB") as Float64Array;
  }
}

/** Runtime navigation policy: hostile destinations are invadable, neutral transit needs passage. */
export class DiplomaticNavigation {
  public constructor(
    private readonly wars: Wars,
    private readonly treaties: Treaties
  ) {}

  public isHostile(a: number, b: number): boolean {
    return this.wars.isHostile(a, b);
  }

  public canTraverse(traveler: number, owner: number, tick: number): boolean {
    if (traveler < 0 || owner < 0 || traveler === owner || this.wars.isHostile(traveler, owner)) {
      return true;
    }
    return (
      this.treaties.activeBetween(TreatyType.Passage, traveler, owner, tick) >= 0 ||
      this.treaties.activeBetween(TreatyType.DefensiveAlliance, traveler, owner, tick) >= 0
    );
  }
}

export function relationStatusForTreaty(type: TreatyType): RelationStatus {
  if (type === TreatyType.Truce) return RelationStatus.Truce;
  if (type === TreatyType.NonAggression) return RelationStatus.NonAggression;
  if (type === TreatyType.TradeAgreement) return RelationStatus.TradeAgreement;
  if (type === TreatyType.Passage) return RelationStatus.Passage;
  return RelationStatus.DefensiveAlliance;
}

export function endTreatyAsBreach(
  treaties: Treaties,
  relations: Relations,
  treaty: number,
  breaker: number,
  tick: number
): boolean {
  if (!treaties.end(treaty, tick)) return false;
  const a = treaties.factionA[treaty] ?? -1;
  const b = treaties.factionB[treaty] ?? -1;
  const victim = breaker === a ? b : a;
  relations.recordTreatyBreach(breaker, victim);
  relations.setStatus(a, b, RelationStatus.Peace);
  return true;
}
