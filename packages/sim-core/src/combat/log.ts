import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export const enum CombatLogKind {
  Shot = 1,
  Destroyed = 2,
  Withdrew = 3,
  BattleEnded = 4,
  Reinforced = 5
}

export type CombatLogColumn =
  | "serial"
  | "tick"
  | "battle"
  | "round"
  | "kind"
  | "side"
  | "actor"
  | "target"
  | "weapon"
  | "rawDamage"
  | "intercepted"
  | "shieldDamage"
  | "armorPrevented"
  | "structureDamage";

export interface CombatLogEntry {
  readonly tick: number;
  readonly battle: number;
  readonly round: number;
  readonly kind: CombatLogKind;
  readonly side: number;
  readonly actor: number;
  readonly target: number;
  readonly weapon: number;
  readonly rawDamage: number;
  readonly intercepted: number;
  readonly shieldDamage: number;
  readonly armorPrevented: number;
  readonly structureDamage: number;
}

export class CombatLog {
  public serial: Float64Array;
  public tick: Float64Array;
  public battle: Uint32Array;
  public round: Uint8Array;
  public kind: Uint8Array;
  public side: Uint8Array;
  public actor: Int32Array;
  public target: Int32Array;
  public weapon: Int32Array;
  public rawDamage: Float64Array;
  public intercepted: Float64Array;
  public shieldDamage: Float64Array;
  public armorPrevented: Float64Array;
  public structureDamage: Float64Array;

  public constructor(public readonly arena: SoAArena<CombatLogColumn>) {
    this.serial = new Float64Array(0);
    this.tick = new Float64Array(0);
    this.battle = new Uint32Array(0);
    this.round = new Uint8Array(0);
    this.kind = new Uint8Array(0);
    this.side = new Uint8Array(0);
    this.actor = new Int32Array(0);
    this.target = new Int32Array(0);
    this.weapon = new Int32Array(0);
    this.rawDamage = new Float64Array(0);
    this.intercepted = new Float64Array(0);
    this.shieldDamage = new Float64Array(0);
    this.armorPrevented = new Float64Array(0);
    this.structureDamage = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 2048): CombatLog {
    return new CombatLog(
      new SoAArena<CombatLogColumn>(
        "combat_log",
        [
          { name: "serial", kind: "f64" },
          { name: "tick", kind: "f64" },
          { name: "battle", kind: "u32" },
          { name: "round", kind: "u8" },
          { name: "kind", kind: "u8" },
          { name: "side", kind: "u8" },
          { name: "actor", kind: "i32" },
          { name: "target", kind: "i32" },
          { name: "weapon", kind: "i32" },
          { name: "rawDamage", kind: "f64" },
          { name: "intercepted", kind: "f64" },
          { name: "shieldDamage", kind: "f64" },
          { name: "armorPrevented", kind: "f64" },
          { name: "structureDamage", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): CombatLog {
    return new CombatLog(SoAArena.fromSnapshot(snapshot) as SoAArena<CombatLogColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public append(entry: CombatLogEntry): number {
    const oldCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    this.serial[row] = row;
    this.tick[row] = entry.tick;
    this.battle[row] = entry.battle;
    this.round[row] = entry.round;
    this.kind[row] = entry.kind;
    this.side[row] = entry.side;
    this.actor[row] = entry.actor;
    this.target[row] = entry.target;
    this.weapon[row] = entry.weapon;
    this.rawDamage[row] = entry.rawDamage;
    this.intercepted[row] = entry.intercepted;
    this.shieldDamage[row] = entry.shieldDamage;
    this.armorPrevented[row] = entry.armorPrevented;
    this.structureDamage[row] = entry.structureDamage;
    return row;
  }

  private refreshColumns(): void {
    this.serial = this.arena.column("serial") as Float64Array;
    this.tick = this.arena.column("tick") as Float64Array;
    this.battle = this.arena.column("battle") as Uint32Array;
    this.round = this.arena.column("round") as Uint8Array;
    this.kind = this.arena.column("kind") as Uint8Array;
    this.side = this.arena.column("side") as Uint8Array;
    this.actor = this.arena.column("actor") as Int32Array;
    this.target = this.arena.column("target") as Int32Array;
    this.weapon = this.arena.column("weapon") as Int32Array;
    this.rawDamage = this.arena.column("rawDamage") as Float64Array;
    this.intercepted = this.arena.column("intercepted") as Float64Array;
    this.shieldDamage = this.arena.column("shieldDamage") as Float64Array;
    this.armorPrevented = this.arena.column("armorPrevented") as Float64Array;
    this.structureDamage = this.arena.column("structureDamage") as Float64Array;
  }
}
