import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";

import type { Systems } from "./systems.js";

export type GateColumn = "from" | "to" | "travelTicks" | "blocked" | "nextInSystem";

export class Gates {
  public from: Uint32Array;
  public to: Uint32Array;
  public travelTicks: Uint16Array;
  public blocked: Uint8Array;
  public nextInSystem: Int32Array;

  public constructor(public readonly arena: SoAArena<GateColumn>) {
    this.from = new Uint32Array(0);
    this.to = new Uint32Array(0);
    this.travelTicks = new Uint16Array(0);
    this.blocked = new Uint8Array(0);
    this.nextInSystem = new Int32Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 64): Gates {
    return new Gates(
      new SoAArena<GateColumn>(
        "gates",
        [
          { name: "from", kind: "u32" },
          { name: "to", kind: "u32" },
          { name: "travelTicks", kind: "u16" },
          { name: "blocked", kind: "u8" },
          { name: "nextInSystem", kind: "i32" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Gates {
    return new Gates(SoAArena.fromSnapshot(snapshot) as SoAArena<GateColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public addDirected(systems: Systems, from: number, to: number, travelTicks: number): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.from[row] = from;
    this.to[row] = to;
    this.travelTicks[row] = travelTicks;
    this.blocked[row] = 0;
    this.nextInSystem[row] = -1;
    systems.attachGate(from, row, this.nextInSystem);
    return row;
  }

  public addUndirected(systems: Systems, a: number, b: number, travelTicks: number): void {
    this.addDirected(systems, a, b, travelTicks);
    this.addDirected(systems, b, a, travelTicks);
  }

  private refreshColumns(): void {
    this.from = this.arena.column("from") as Uint32Array;
    this.to = this.arena.column("to") as Uint32Array;
    this.travelTicks = this.arena.column("travelTicks") as Uint16Array;
    this.blocked = this.arena.column("blocked") as Uint8Array;
    this.nextInSystem = this.arena.column("nextInSystem") as Int32Array;
  }
}
