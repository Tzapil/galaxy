import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export type ColonyHistoryColumn =
  "foundedBy" | "foundedTick" | "conqueredFrom" | "conqueredTick" | "siegeBy" | "orbitalController";

/** Body-indexed military/history sidecar. Founded and conquered colonies stay distinct. */
export class ColonyHistory {
  public foundedBy: Int32Array;
  public foundedTick: Float64Array;
  public conqueredFrom: Int32Array;
  public conqueredTick: Float64Array;
  public siegeBy: Int32Array;
  public orbitalController: Int32Array;

  public constructor(public readonly arena: SoAArena<ColonyHistoryColumn>) {
    this.foundedBy = new Int32Array(0);
    this.foundedTick = new Float64Array(0);
    this.conqueredFrom = new Int32Array(0);
    this.conqueredTick = new Float64Array(0);
    this.siegeBy = new Int32Array(0);
    this.orbitalController = new Int32Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 96): ColonyHistory {
    return new ColonyHistory(
      new SoAArena<ColonyHistoryColumn>(
        "colony_history",
        [
          { name: "foundedBy", kind: "i32" },
          { name: "foundedTick", kind: "f64" },
          { name: "conqueredFrom", kind: "i32" },
          { name: "conqueredTick", kind: "f64" },
          { name: "siegeBy", kind: "i32" },
          { name: "orbitalController", kind: "i32" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): ColonyHistory {
    return new ColonyHistory(SoAArena.fromSnapshot(snapshot) as SoAArena<ColonyHistoryColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public addBody(): number {
    const oldCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    this.foundedBy[row] = -1;
    this.foundedTick[row] = -1;
    this.conqueredFrom[row] = -1;
    this.conqueredTick[row] = -1;
    this.siegeBy[row] = -1;
    this.orbitalController[row] = -1;
    return row;
  }

  public recordFounded(body: number, faction: number, tick: number): void {
    this.foundedBy[body] = faction;
    this.foundedTick[body] = tick;
    this.conqueredFrom[body] = -1;
    this.conqueredTick[body] = -1;
  }

  public recordCaptured(body: number, previousOwner: number, tick: number): void {
    this.conqueredFrom[body] = previousOwner;
    this.conqueredTick[body] = tick;
    this.siegeBy[body] = -1;
  }

  public wasConquered(body: number): boolean {
    return (this.conqueredTick[body] ?? -1) >= 0;
  }

  private refreshColumns(): void {
    this.foundedBy = this.arena.column("foundedBy") as Int32Array;
    this.foundedTick = this.arena.column("foundedTick") as Float64Array;
    this.conqueredFrom = this.arena.column("conqueredFrom") as Int32Array;
    this.conqueredTick = this.arena.column("conqueredTick") as Float64Array;
    this.siegeBy = this.arena.column("siegeBy") as Int32Array;
    this.orbitalController = this.arena.column("orbitalController") as Int32Array;
  }
}
