import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";

import type { BestDesignResult } from "./autodesign/best-hull.js";
import type { ShipDesign } from "./design-stats.js";

export const MAX_BLUEPRINT_MODULES = 32;

type BlueprintModuleColumn = `module${number}`;
export type BlueprintColumn =
  | "faction"
  | "doctrine"
  | "hull"
  | "mark"
  | "createdTick"
  | "moduleCount"
  | "cost"
  | "buildDays"
  | "speed"
  | "ehp"
  | "dps"
  | BlueprintModuleColumn;

export class Blueprints {
  public faction: Uint16Array;
  public doctrine: Int32Array;
  public hull: Uint16Array;
  public mark: Uint16Array;
  public createdTick: Float64Array;
  public moduleCount: Uint16Array;
  public cost: Float64Array;
  public buildDays: Float64Array;
  public speed: Float64Array;
  public ehp: Float64Array;
  public dps: Float64Array;
  public readonly moduleColumns: Int32Array[];

  public constructor(public readonly arena: SoAArena<BlueprintColumn>) {
    this.faction = new Uint16Array(0);
    this.doctrine = new Int32Array(0);
    this.hull = new Uint16Array(0);
    this.mark = new Uint16Array(0);
    this.createdTick = new Float64Array(0);
    this.moduleCount = new Uint16Array(0);
    this.cost = new Float64Array(0);
    this.buildDays = new Float64Array(0);
    this.speed = new Float64Array(0);
    this.ehp = new Float64Array(0);
    this.dps = new Float64Array(0);
    this.moduleColumns = [];
    this.refreshColumns();
  }

  public static create(initialCapacity = 32): Blueprints {
    const specs: { readonly name: BlueprintColumn; readonly kind: "u16" | "i32" | "f64" }[] = [
      { name: "faction", kind: "u16" },
      { name: "doctrine", kind: "i32" },
      { name: "hull", kind: "u16" },
      { name: "mark", kind: "u16" },
      { name: "createdTick", kind: "f64" },
      { name: "moduleCount", kind: "u16" },
      { name: "cost", kind: "f64" },
      { name: "buildDays", kind: "f64" },
      { name: "speed", kind: "f64" },
      { name: "ehp", kind: "f64" },
      { name: "dps", kind: "f64" }
    ];
    for (let i = 0; i < MAX_BLUEPRINT_MODULES; i += 1) {
      specs.push({ name: moduleColumn(i), kind: "i32" });
    }
    return new Blueprints(new SoAArena<BlueprintColumn>("blueprints", specs, initialCapacity));
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): Blueprints {
    return new Blueprints(SoAArena.fromSnapshot(snapshot) as SoAArena<BlueprintColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public addFromDesign(
    data: StageOneData,
    faction: number,
    doctrine: number,
    design: BestDesignResult,
    tick: number
  ): number {
    if (design.design.modules.length > MAX_BLUEPRINT_MODULES) {
      throw new RangeError(`Blueprint has more than ${MAX_BLUEPRINT_MODULES} modules.`);
    }
    const previousCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (this.arena.capacity !== previousCapacity) this.refreshColumns();
    this.faction[row] = faction;
    this.doctrine[row] = doctrine;
    this.hull[row] = design.hull;
    this.mark[row] = this.nextMark(faction, doctrine, design.hull);
    this.createdTick[row] = tick;
    this.moduleCount[row] = design.design.modules.length;
    this.cost[row] = design.cost;
    this.buildDays[row] = data.hulls[design.hull]?.buildDays ?? 1;
    this.speed[row] = design.stats.speed;
    this.ehp[row] = design.stats.effectiveHitPoints;
    this.dps[row] = design.stats.damageLong + design.stats.damageMedium + design.stats.damageShort;
    for (let i = 0; i < MAX_BLUEPRINT_MODULES; i += 1) {
      const column = this.moduleColumns[i];
      if (column === undefined) throw new RangeError("Blueprint module columns are missing.");
      column[row] = design.design.modules[i] ?? -1;
    }
    return row;
  }

  public design(row: number): ShipDesign {
    const modules: number[] = [];
    const count = this.moduleCount[row] ?? 0;
    for (let i = 0; i < count; i += 1) {
      const module = this.moduleColumns[i]?.[row] ?? -1;
      if (module >= 0) modules.push(module);
    }
    return { hull: this.hull[row] ?? 0, modules };
  }

  public moduleAt(row: number, slot: number): number {
    return this.moduleColumns[slot]?.[row] ?? -1;
  }

  public name(data: StageOneData, row: number): string {
    const hull = data.hulls[this.hull[row] ?? -1]?.name ?? "Ship";
    const doctrine = data.doctrines[this.doctrine[row] ?? -1]?.name ?? "Pattern";
    return `${hull} ${doctrine} Mk ${toRoman(this.mark[row] ?? 1)}`;
  }

  public latestFor(faction: number, doctrine: number): number {
    let best = -1;
    let bestMark = -1;
    for (let row = 0; row < this.length; row += 1) {
      if ((this.faction[row] ?? -1) !== faction) continue;
      if ((this.doctrine[row] ?? -1) !== doctrine) continue;
      const mark = this.mark[row] ?? 0;
      if (mark > bestMark) {
        bestMark = mark;
        best = row;
      }
    }
    return best;
  }

  private nextMark(faction: number, doctrine: number, hull: number): number {
    let mark = 0;
    for (let row = 0; row < this.length; row += 1) {
      if ((this.faction[row] ?? -1) !== faction) continue;
      if ((this.doctrine[row] ?? -1) !== doctrine) continue;
      if ((this.hull[row] ?? -1) !== hull) continue;
      mark = Math.max(mark, this.mark[row] ?? 0);
    }
    return mark + 1;
  }

  private refreshColumns(): void {
    this.faction = this.arena.column("faction") as Uint16Array;
    this.doctrine = this.arena.column("doctrine") as Int32Array;
    this.hull = this.arena.column("hull") as Uint16Array;
    this.mark = this.arena.column("mark") as Uint16Array;
    this.createdTick = this.arena.column("createdTick") as Float64Array;
    this.moduleCount = this.arena.column("moduleCount") as Uint16Array;
    this.cost = this.arena.column("cost") as Float64Array;
    this.buildDays = this.arena.column("buildDays") as Float64Array;
    this.speed = this.arena.column("speed") as Float64Array;
    this.ehp = this.arena.column("ehp") as Float64Array;
    this.dps = this.arena.column("dps") as Float64Array;
    this.moduleColumns.length = 0;
    for (let i = 0; i < MAX_BLUEPRINT_MODULES; i += 1) {
      this.moduleColumns.push(this.arena.column(moduleColumn(i)) as Int32Array);
    }
  }
}

export interface BlueprintVersionMetric {
  readonly blueprint: number;
  readonly count: number;
  readonly mark: number;
  readonly obsolete: boolean;
}

export function blueprintVersionDistribution(
  world: {
    readonly blueprints: Blueprints;
    readonly ships: {
      readonly length: number;
      readonly faction: Uint16Array;
      readonly blueprint: Int32Array;
    };
  },
  faction: number
): readonly BlueprintVersionMetric[] {
  const counts = new Int32Array(Math.max(1, world.blueprints.length));
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if ((world.ships.faction[ship] ?? -1) !== faction) continue;
    const blueprint = world.ships.blueprint[ship] ?? -1;
    if (blueprint >= 0 && blueprint < counts.length) {
      counts[blueprint] = (counts[blueprint] ?? 0) + 1;
    }
  }
  const latestByHullDoctrine = latestMarksByHullDoctrine(world.blueprints, faction);
  const metrics: BlueprintVersionMetric[] = [];
  for (let blueprint = 0; blueprint < counts.length; blueprint += 1) {
    const count = counts[blueprint] ?? 0;
    if (count <= 0) continue;
    const mark = world.blueprints.mark[blueprint] ?? 0;
    const key = hullDoctrineKey(
      world.blueprints.hull[blueprint] ?? -1,
      world.blueprints.doctrine[blueprint] ?? -1
    );
    metrics.push({
      blueprint,
      count,
      mark,
      obsolete: mark < (latestByHullDoctrine.get(key) ?? mark)
    });
  }
  return metrics;
}

export function obsoleteFleetFraction(
  world: Parameters<typeof blueprintVersionDistribution>[0],
  faction: number
): number {
  const distribution = blueprintVersionDistribution(world, faction);
  let total = 0;
  let obsolete = 0;
  for (let i = 0; i < distribution.length; i += 1) {
    const row = distribution[i];
    if (row === undefined) throw new RangeError("Blueprint metric list is inconsistent.");
    total += row.count;
    if (row.obsolete) obsolete += row.count;
  }
  return total > 0 ? obsolete / total : 0;
}

function latestMarksByHullDoctrine(blueprints: Blueprints, faction: number): Map<string, number> {
  const result = new Map<string, number>();
  for (let row = 0; row < blueprints.length; row += 1) {
    if ((blueprints.faction[row] ?? -1) !== faction) continue;
    const key = hullDoctrineKey(blueprints.hull[row] ?? -1, blueprints.doctrine[row] ?? -1);
    result.set(key, Math.max(result.get(key) ?? 0, blueprints.mark[row] ?? 0));
  }
  return result;
}

function hullDoctrineKey(hull: number, doctrine: number): string {
  return `${hull}:${doctrine}`;
}

function moduleColumn(index: number): BlueprintModuleColumn {
  return `module${index}`;
}

function toRoman(value: number): string {
  const numerals = [
    ["X", 10],
    ["IX", 9],
    ["V", 5],
    ["IV", 4],
    ["I", 1]
  ] as const;
  let remaining = Math.max(1, Math.trunc(value));
  let out = "";
  for (let i = 0; i < numerals.length; i += 1) {
    const pair = numerals[i];
    if (pair === undefined) throw new RangeError("Roman numerals are inconsistent.");
    while (remaining >= pair[1]) {
      out += pair[0];
      remaining -= pair[1];
    }
  }
  return out;
}
