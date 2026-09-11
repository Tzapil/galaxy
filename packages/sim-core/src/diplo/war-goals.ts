import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export type WarGoalColumn =
  | "war"
  | "attacker"
  | "defender"
  | "resource"
  | "targetSystem"
  | "needScore"
  | "declaredStrength"
  | "active";

/** One concrete MRP-derived goal for each diplomatic war (spec 10.5 and 11.1). */
export class WarGoals {
  public war: Uint32Array;
  public attacker: Uint16Array;
  public defender: Uint16Array;
  public resource: Int32Array;
  public targetSystem: Int32Array;
  public needScore: Float64Array;
  public declaredStrength: Float64Array;
  public active: Uint8Array;

  public constructor(public readonly arena: SoAArena<WarGoalColumn>) {
    this.war = new Uint32Array(0);
    this.attacker = new Uint16Array(0);
    this.defender = new Uint16Array(0);
    this.resource = new Int32Array(0);
    this.targetSystem = new Int32Array(0);
    this.needScore = new Float64Array(0);
    this.declaredStrength = new Float64Array(0);
    this.active = new Uint8Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 16): WarGoals {
    return new WarGoals(
      new SoAArena<WarGoalColumn>(
        "war_goals",
        [
          { name: "war", kind: "u32" },
          { name: "attacker", kind: "u16" },
          { name: "defender", kind: "u16" },
          { name: "resource", kind: "i32" },
          { name: "targetSystem", kind: "i32" },
          { name: "needScore", kind: "f64" },
          { name: "declaredStrength", kind: "f64" },
          { name: "active", kind: "u8" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): WarGoals {
    return new WarGoals(SoAArena.fromSnapshot(snapshot) as SoAArena<WarGoalColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public add(
    war: number,
    attacker: number,
    defender: number,
    resource: number,
    targetSystem: number,
    needScore: number,
    declaredStrength: number
  ): number {
    let row = -1;
    for (let candidate = 0; candidate < this.length; candidate += 1) {
      if (this.active[candidate] !== 1) {
        row = candidate;
        break;
      }
    }
    if (row < 0) {
      const oldCapacity = this.arena.capacity;
      row = this.arena.addRow();
      if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    }
    this.war[row] = war;
    this.attacker[row] = attacker;
    this.defender[row] = defender;
    this.resource[row] = resource;
    this.targetSystem[row] = targetSystem;
    this.needScore[row] = needScore;
    this.declaredStrength[row] = declaredStrength;
    this.active[row] = 1;
    return row;
  }

  public forWar(war: number): number {
    for (let row = 0; row < this.length; row += 1) {
      if (this.active[row] === 1 && (this.war[row] ?? -1) === war) return row;
    }
    return -1;
  }

  private refreshColumns(): void {
    this.war = this.arena.column("war") as Uint32Array;
    this.attacker = this.arena.column("attacker") as Uint16Array;
    this.defender = this.arena.column("defender") as Uint16Array;
    this.resource = this.arena.column("resource") as Int32Array;
    this.targetSystem = this.arena.column("targetSystem") as Int32Array;
    this.needScore = this.arena.column("needScore") as Float64Array;
    this.declaredStrength = this.arena.column("declaredStrength") as Float64Array;
    this.active = this.arena.column("active") as Uint8Array;
  }
}
