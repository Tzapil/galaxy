import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";

export type SystemColumn =
  "x" | "y" | "region" | "owner" | "firstBody" | "bodyCount" | "firstGate" | "gateCount";

export class Systems {
  public x: Float64Array;
  public y: Float64Array;
  public region: Uint16Array;
  public owner: Int32Array;
  public firstBody: Int32Array;
  public bodyCount: Uint32Array;
  public firstGate: Int32Array;
  public gateCount: Uint32Array;

  private bodyTail: Int32Array;
  private gateTail: Int32Array;

  public constructor(public readonly arena: SoAArena<SystemColumn>) {
    this.x = new Float64Array(0);
    this.y = new Float64Array(0);
    this.region = new Uint16Array(0);
    this.owner = new Int32Array(0);
    this.firstBody = new Int32Array(0);
    this.bodyCount = new Uint32Array(0);
    this.firstGate = new Int32Array(0);
    this.gateCount = new Uint32Array(0);
    this.refreshColumns();
    this.bodyTail = new Int32Array(arena.capacity);
    this.gateTail = new Int32Array(arena.capacity);
    this.bodyTail.fill(-1);
    this.gateTail.fill(-1);
  }

  public static create(initialCapacity = 32): Systems {
    return new Systems(
      new SoAArena<SystemColumn>(
        "systems",
        [
          { name: "x", kind: "f64" },
          { name: "y", kind: "f64" },
          { name: "region", kind: "u16" },
          { name: "owner", kind: "i32" },
          { name: "firstBody", kind: "i32" },
          { name: "bodyCount", kind: "u32" },
          { name: "firstGate", kind: "i32" },
          { name: "gateCount", kind: "u32" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Systems {
    return new Systems(SoAArena.fromSnapshot(snapshot) as SoAArena<SystemColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(x: number, y: number, region: number, owner: number): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.ensureAuxCapacity(this.arena.capacity);
    this.x[row] = x;
    this.y[row] = y;
    this.region[row] = region;
    this.owner[row] = owner;
    this.firstBody[row] = -1;
    this.bodyCount[row] = 0;
    this.firstGate[row] = -1;
    this.gateCount[row] = 0;
    this.bodyTail[row] = -1;
    this.gateTail[row] = -1;
    return row;
  }

  public attachBody(system: number, body: number, bodyNextInSystem: Int32Array): void {
    const tail = this.bodyTail[system] ?? -1;
    if (tail < 0) {
      this.firstBody[system] = body;
    } else {
      bodyNextInSystem[tail] = body;
    }
    this.bodyTail[system] = body;
    bodyNextInSystem[body] = -1;
    this.bodyCount[system] = (this.bodyCount[system] ?? 0) + 1;
  }

  public attachGate(system: number, gate: number, gateNextInSystem: Int32Array): void {
    const tail = this.gateTail[system] ?? -1;
    if (tail < 0) {
      this.firstGate[system] = gate;
    } else {
      gateNextInSystem[tail] = gate;
    }
    this.gateTail[system] = gate;
    gateNextInSystem[gate] = -1;
    this.gateCount[system] = (this.gateCount[system] ?? 0) + 1;
  }

  public rebuildBodyTails(bodyNextInSystem: Int32Array): void {
    this.ensureAuxCapacity(this.arena.capacity);
    for (let system = 0; system < this.length; system += 1) {
      let current = this.firstBody[system] ?? -1;
      let tail = -1;
      while (current >= 0) {
        tail = current;
        current = bodyNextInSystem[current] ?? -1;
      }
      this.bodyTail[system] = tail;
    }
  }

  public rebuildGateTails(gateNextInSystem: Int32Array): void {
    this.ensureAuxCapacity(this.arena.capacity);
    for (let system = 0; system < this.length; system += 1) {
      let current = this.firstGate[system] ?? -1;
      let tail = -1;
      while (current >= 0) {
        tail = current;
        current = gateNextInSystem[current] ?? -1;
      }
      this.gateTail[system] = tail;
    }
  }

  private ensureAuxCapacity(required: number): void {
    if (required <= this.bodyTail.length) return;
    const nextBodyTail = new Int32Array(required);
    nextBodyTail.fill(-1);
    nextBodyTail.set(this.bodyTail);
    this.bodyTail = nextBodyTail;

    const nextGateTail = new Int32Array(required);
    nextGateTail.fill(-1);
    nextGateTail.set(this.gateTail);
    this.gateTail = nextGateTail;
  }

  private refreshColumns(): void {
    this.x = this.arena.column("x") as Float64Array;
    this.y = this.arena.column("y") as Float64Array;
    this.region = this.arena.column("region") as Uint16Array;
    this.owner = this.arena.column("owner") as Int32Array;
    this.firstBody = this.arena.column("firstBody") as Int32Array;
    this.bodyCount = this.arena.column("bodyCount") as Uint32Array;
    this.firstGate = this.arena.column("firstGate") as Int32Array;
    this.gateCount = this.arena.column("gateCount") as Uint32Array;
  }
}
