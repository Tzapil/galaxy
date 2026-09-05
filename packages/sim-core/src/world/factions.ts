import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";

import type { Bodies } from "./bodies.js";

export type FactionColumn =
  | "capitalSystem"
  | "capitalBody"
  | "treasury"
  | "dataPhysics"
  | "dataEngineering"
  | "dataBio"
  | "researchedCount"
  | "firstColony"
  | "colonyCount"
  | "characterExpansion"
  | "characterIndustry";

export class Factions {
  public capitalSystem: Uint32Array;
  public capitalBody: Uint32Array;
  public treasury: Float64Array;
  public dataPhysics: Float64Array;
  public dataEngineering: Float64Array;
  public dataBio: Float64Array;
  public researchedCount: Uint16Array;
  public firstColony: Int32Array;
  public colonyCount: Uint32Array;
  public characterExpansion: Float64Array;
  public characterIndustry: Float64Array;

  private colonyTail: Int32Array;
  private readonly labels: string[];

  public constructor(
    public readonly arena: SoAArena<FactionColumn>,
    labels?: readonly string[]
  ) {
    this.capitalSystem = new Uint32Array(0);
    this.capitalBody = new Uint32Array(0);
    this.treasury = new Float64Array(0);
    this.dataPhysics = new Float64Array(0);
    this.dataEngineering = new Float64Array(0);
    this.dataBio = new Float64Array(0);
    this.researchedCount = new Uint16Array(0);
    this.firstColony = new Int32Array(0);
    this.colonyCount = new Uint32Array(0);
    this.characterExpansion = new Float64Array(0);
    this.characterIndustry = new Float64Array(0);
    this.refreshColumns();
    this.colonyTail = new Int32Array(arena.capacity);
    this.colonyTail.fill(-1);
    this.labels = labels === undefined ? [] : labels.slice();
  }

  public static create(initialCapacity = 4): Factions {
    return new Factions(
      new SoAArena<FactionColumn>(
        "factions",
        [
          { name: "capitalSystem", kind: "u32" },
          { name: "capitalBody", kind: "u32" },
          { name: "treasury", kind: "f64" },
          { name: "dataPhysics", kind: "f64" },
          { name: "dataEngineering", kind: "f64" },
          { name: "dataBio", kind: "f64" },
          { name: "researchedCount", kind: "u16" },
          { name: "firstColony", kind: "i32" },
          { name: "colonyCount", kind: "u32" },
          { name: "characterExpansion", kind: "f64" },
          { name: "characterIndustry", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Factions {
    return new Factions(SoAArena.fromSnapshot(snapshot) as SoAArena<FactionColumn>, [
      "Vega Compact",
      "Orion Combine"
    ]);
  }

  public get length(): number {
    return this.arena.length;
  }

  public label(faction: number): string {
    return this.labels[faction] ?? `Faction ${faction}`;
  }

  public add(
    label: string,
    capitalSystem: number,
    capitalBody: number,
    treasury: number,
    expansion: number,
    industry: number
  ): number {
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.ensureAuxCapacity(this.arena.capacity);
    this.labels[row] = label;
    this.capitalSystem[row] = capitalSystem;
    this.capitalBody[row] = capitalBody;
    this.treasury[row] = treasury;
    this.dataPhysics[row] = 0;
    this.dataEngineering[row] = 0;
    this.dataBio[row] = 0;
    this.researchedCount[row] = 0;
    this.firstColony[row] = -1;
    this.colonyCount[row] = 0;
    this.characterExpansion[row] = expansion;
    this.characterIndustry[row] = industry;
    this.colonyTail[row] = -1;
    return row;
  }

  public attachColony(faction: number, body: number, bodies: Bodies): void {
    const tail = this.colonyTail[faction] ?? -1;
    if (tail < 0) {
      this.firstColony[faction] = body;
    } else {
      bodies.nextInFaction[tail] = body;
    }
    this.colonyTail[faction] = body;
    bodies.nextInFaction[body] = -1;
    this.colonyCount[faction] = (this.colonyCount[faction] ?? 0) + 1;
  }

  public rebuildColonyTails(bodies: Bodies): void {
    this.ensureAuxCapacity(this.arena.capacity);
    for (let faction = 0; faction < this.length; faction += 1) {
      let current = this.firstColony[faction] ?? -1;
      let tail = -1;
      while (current >= 0) {
        tail = current;
        current = bodies.nextInFaction[current] ?? -1;
      }
      this.colonyTail[faction] = tail;
    }
  }

  private ensureAuxCapacity(required: number): void {
    if (required <= this.colonyTail.length) return;
    const next = new Int32Array(required);
    next.fill(-1);
    next.set(this.colonyTail);
    this.colonyTail = next;
  }

  private refreshColumns(): void {
    this.capitalSystem = this.arena.column("capitalSystem") as Uint32Array;
    this.capitalBody = this.arena.column("capitalBody") as Uint32Array;
    this.treasury = this.arena.column("treasury") as Float64Array;
    this.dataPhysics = this.arena.column("dataPhysics") as Float64Array;
    this.dataEngineering = this.arena.column("dataEngineering") as Float64Array;
    this.dataBio = this.arena.column("dataBio") as Float64Array;
    this.researchedCount = this.arena.column("researchedCount") as Uint16Array;
    this.firstColony = this.arena.column("firstColony") as Int32Array;
    this.colonyCount = this.arena.column("colonyCount") as Uint32Array;
    this.characterExpansion = this.arena.column("characterExpansion") as Float64Array;
    this.characterIndustry = this.arena.column("characterIndustry") as Float64Array;
  }
}
