import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData, StageOneTech } from "../stage-one/data.js";

import { clampRepeatableLevel, MAX_REPEATABLE_TECH_LEVEL } from "./repeatable.js";

export type TechStateColumn =
  | "currentTech"
  | "progressPhysics"
  | "progressEngineering"
  | "progressBio"
  | "completedCount"
  | "cacheVersion"
  | `tech_${number}`;

export class FactionTechState {
  public currentTech: Int32Array;
  public progressPhysics: Float64Array;
  public progressEngineering: Float64Array;
  public progressBio: Float64Array;
  public completedCount: Uint16Array;
  public cacheVersion: Uint32Array;
  public readonly levels: Uint16Array[];

  public constructor(
    public readonly arena: SoAArena<TechStateColumn>,
    private readonly data: StageOneData
  ) {
    this.currentTech = new Int32Array(0);
    this.progressPhysics = new Float64Array(0);
    this.progressEngineering = new Float64Array(0);
    this.progressBio = new Float64Array(0);
    this.completedCount = new Uint16Array(0);
    this.cacheVersion = new Uint32Array(0);
    this.levels = [];
    this.refreshColumns();
  }

  public static create(data: StageOneData, initialCapacity = 4): FactionTechState {
    const specs: {
      readonly name: TechStateColumn;
      readonly kind: "i32" | "f64" | "u16" | "u32";
    }[] = [
      { name: "currentTech", kind: "i32" },
      { name: "progressPhysics", kind: "f64" },
      { name: "progressEngineering", kind: "f64" },
      { name: "progressBio", kind: "f64" },
      { name: "completedCount", kind: "u16" },
      { name: "cacheVersion", kind: "u32" }
    ];
    for (let i = 0; i < data.techs.length; i += 1) {
      specs.push({ name: techColumn(i), kind: "u16" });
    }
    return new FactionTechState(
      new SoAArena<TechStateColumn>("tech_state", specs, initialCapacity),
      data
    );
  }

  public static fromSnapshot(data: StageOneData, snapshot: ArenaSnapshot): FactionTechState {
    return new FactionTechState(SoAArena.fromSnapshot(snapshot) as SoAArena<TechStateColumn>, data);
  }

  public get length(): number {
    return this.arena.length;
  }

  public addFaction(startTech: number): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.currentTech[row] = -1;
    this.progressPhysics[row] = 0;
    this.progressEngineering[row] = 0;
    this.progressBio[row] = 0;
    this.completedCount[row] = 0;
    this.cacheVersion[row] = 0;
    for (let i = 0; i < this.levels.length; i += 1) {
      const column = this.levels[i];
      if (column === undefined) throw new RangeError("Technology state column is missing.");
      column[row] = 0;
    }
    if (startTech >= 0) this.markResearched(row, startTech);
    return row;
  }

  public hasResearched(faction: number, tech: number): boolean {
    return this.level(tech, faction) > 0;
  }

  public level(tech: number, faction: number): number {
    return this.levelColumn(tech)[faction] ?? 0;
  }

  public markResearched(faction: number, techIndex: number): boolean {
    const tech = this.tech(techIndex);
    const column = this.levelColumn(techIndex);
    const current = column[faction] ?? 0;
    if (tech.repeatable) {
      if (current >= MAX_REPEATABLE_TECH_LEVEL) return false;
      column[faction] = clampRepeatableLevel(current + 1);
    } else {
      if (current > 0) return false;
      column[faction] = 1;
    }
    this.completedCount[faction] = this.countCompleted(faction);
    this.cacheVersion[faction] = (this.cacheVersion[faction] ?? 0) + 1;
    return true;
  }

  public setCurrent(faction: number, techIndex: number): void {
    if ((this.currentTech[faction] ?? -1) === techIndex) return;
    this.tech(techIndex);
    this.currentTech[faction] = techIndex;
    this.progressPhysics[faction] = 0;
    this.progressEngineering[faction] = 0;
    this.progressBio[faction] = 0;
  }

  public clearCurrent(faction: number): void {
    this.currentTech[faction] = -1;
    this.progressPhysics[faction] = 0;
    this.progressEngineering[faction] = 0;
    this.progressBio[faction] = 0;
  }

  public countCompleted(faction: number): number {
    let count = 0;
    for (let tech = 0; tech < this.data.techs.length; tech += 1) {
      if (this.level(tech, faction) > 0) count += 1;
    }
    return count;
  }

  private tech(index: number): StageOneTech {
    const tech = this.data.techs[index];
    if (tech === undefined) throw new RangeError(`Unknown technology index ${index}.`);
    return tech;
  }

  private levelColumn(tech: number): Uint16Array {
    const column = this.levels[tech];
    if (column === undefined) throw new RangeError(`Technology level column ${tech} is missing.`);
    return column;
  }

  private refreshColumns(): void {
    this.currentTech = this.arena.column("currentTech") as Int32Array;
    this.progressPhysics = this.arena.column("progressPhysics") as Float64Array;
    this.progressEngineering = this.arena.column("progressEngineering") as Float64Array;
    this.progressBio = this.arena.column("progressBio") as Float64Array;
    this.completedCount = this.arena.column("completedCount") as Uint16Array;
    this.cacheVersion = this.arena.column("cacheVersion") as Uint32Array;
    this.levels.length = 0;
    for (let i = 0; i < this.data.techs.length; i += 1) {
      this.levels.push(this.arena.column(techColumn(i)) as Uint16Array);
    }
  }
}

function techColumn(index: number): `tech_${number}` {
  return `tech_${index}`;
}
