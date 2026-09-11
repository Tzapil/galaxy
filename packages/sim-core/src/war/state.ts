import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export const enum WarState {
  Ended = 0,
  Active = 1
}

export type WarColumn =
  "attacker" | "defender" | "state" | "startedTick" | "endedTick" | "lastFrontChangeTick";

/** Minimal hostility state needed by Stage 6; diplomacy policy belongs to Stage 7. */
export class Wars {
  public attacker: Uint16Array;
  public defender: Uint16Array;
  public state: Uint8Array;
  public startedTick: Float64Array;
  public endedTick: Float64Array;
  public lastFrontChangeTick: Float64Array;

  public constructor(public readonly arena: SoAArena<WarColumn>) {
    this.attacker = new Uint16Array(0);
    this.defender = new Uint16Array(0);
    this.state = new Uint8Array(0);
    this.startedTick = new Float64Array(0);
    this.endedTick = new Float64Array(0);
    this.lastFrontChangeTick = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 16): Wars {
    return new Wars(
      new SoAArena<WarColumn>(
        "wars",
        [
          { name: "attacker", kind: "u16" },
          { name: "defender", kind: "u16" },
          { name: "state", kind: "u8" },
          { name: "startedTick", kind: "f64" },
          { name: "endedTick", kind: "f64" },
          { name: "lastFrontChangeTick", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Wars {
    return new Wars(SoAArena.fromSnapshot(snapshot) as SoAArena<WarColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public declare(attacker: number, defender: number, tick: number): number {
    const existing = this.activeWarBetween(attacker, defender);
    if (existing >= 0) return existing;
    let row = -1;
    for (let candidate = 0; candidate < this.length; candidate += 1) {
      if (this.state[candidate] === WarState.Ended) {
        row = candidate;
        break;
      }
    }
    if (row < 0) {
      const oldCapacity = this.arena.capacity;
      row = this.arena.addRow();
      if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    }
    this.attacker[row] = attacker;
    this.defender[row] = defender;
    this.state[row] = WarState.Active;
    this.startedTick[row] = tick;
    this.endedTick[row] = -1;
    this.lastFrontChangeTick[row] = tick;
    return row;
  }

  public end(war: number, tick: number): boolean {
    if (this.state[war] !== WarState.Active) return false;
    this.state[war] = WarState.Ended;
    this.endedTick[war] = tick;
    return true;
  }

  public markFrontChanged(war: number, tick: number): void {
    if (this.state[war] === WarState.Active) this.lastFrontChangeTick[war] = tick;
  }

  public isHostile(a: number, b: number): boolean {
    return this.activeWarBetween(a, b) >= 0;
  }

  public activeWarBetween(a: number, b: number): number {
    for (let war = 0; war < this.length; war += 1) {
      if (this.state[war] !== WarState.Active) continue;
      const attacker = this.attacker[war] ?? -1;
      const defender = this.defender[war] ?? -1;
      if ((attacker === a && defender === b) || (attacker === b && defender === a)) return war;
    }
    return -1;
  }

  private refreshColumns(): void {
    this.attacker = this.arena.column("attacker") as Uint16Array;
    this.defender = this.arena.column("defender") as Uint16Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.startedTick = this.arena.column("startedTick") as Float64Array;
    this.endedTick = this.arena.column("endedTick") as Float64Array;
    this.lastFrontChangeTick = this.arena.column("lastFrontChangeTick") as Float64Array;
  }
}
