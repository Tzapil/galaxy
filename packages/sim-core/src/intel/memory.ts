import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export const enum IntelSource {
  Battle = 1,
  Border = 2,
  Scout = 3
}

export type IntelColumn =
  | "observer"
  | "target"
  | "source"
  | "observedTick"
  | "availableTick"
  | "strength"
  | "kineticFraction"
  | "laserFraction"
  | "missileFraction"
  | "plasmaFraction"
  | "shieldFraction"
  | "armorRating";

export interface ObservedFleetProfile {
  readonly strength: number;
  readonly kineticFraction: number;
  readonly laserFraction: number;
  readonly missileFraction: number;
  readonly plasmaFraction: number;
  readonly shieldFraction: number;
  readonly armorRating: number;
}

export class IntelMemory {
  public observer: Uint16Array;
  public target: Uint16Array;
  public source: Uint8Array;
  public observedTick: Float64Array;
  public availableTick: Float64Array;
  public strength: Float64Array;
  public kineticFraction: Float64Array;
  public laserFraction: Float64Array;
  public missileFraction: Float64Array;
  public plasmaFraction: Float64Array;
  public shieldFraction: Float64Array;
  public armorRating: Float64Array;

  public constructor(public readonly arena: SoAArena<IntelColumn>) {
    this.observer = new Uint16Array(0);
    this.target = new Uint16Array(0);
    this.source = new Uint8Array(0);
    this.observedTick = new Float64Array(0);
    this.availableTick = new Float64Array(0);
    this.strength = new Float64Array(0);
    this.kineticFraction = new Float64Array(0);
    this.laserFraction = new Float64Array(0);
    this.missileFraction = new Float64Array(0);
    this.plasmaFraction = new Float64Array(0);
    this.shieldFraction = new Float64Array(0);
    this.armorRating = new Float64Array(0);
    this.refreshColumns();
  }

  public static create(initialCapacity = 32): IntelMemory {
    return new IntelMemory(
      new SoAArena<IntelColumn>(
        "intel_memory",
        [
          { name: "observer", kind: "u16" },
          { name: "target", kind: "u16" },
          { name: "source", kind: "u8" },
          { name: "observedTick", kind: "f64" },
          { name: "availableTick", kind: "f64" },
          { name: "strength", kind: "f64" },
          { name: "kineticFraction", kind: "f64" },
          { name: "laserFraction", kind: "f64" },
          { name: "missileFraction", kind: "f64" },
          { name: "plasmaFraction", kind: "f64" },
          { name: "shieldFraction", kind: "f64" },
          { name: "armorRating", kind: "f64" }
        ],
        initialCapacity
      )
    );
  }

  public static fromSnapshot(snapshot: ArenaSnapshot): IntelMemory {
    return new IntelMemory(SoAArena.fromSnapshot(snapshot) as SoAArena<IntelColumn>);
  }

  public get length(): number {
    return this.arena.length;
  }

  public record(
    observer: number,
    target: number,
    source: IntelSource,
    observedTick: number,
    profile: ObservedFleetProfile
  ): number {
    let row = this.latestRow(observer, target, Number.POSITIVE_INFINITY);
    if (row >= 0 && (this.observedTick[row] ?? -1) > observedTick) return row;
    if (row < 0) {
      const oldCapacity = this.arena.capacity;
      row = this.arena.addRow();
      if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    }
    this.observer[row] = observer;
    this.target[row] = target;
    this.source[row] = source;
    this.observedTick[row] = observedTick;
    this.availableTick[row] = observedTick + sourceDelay(source);
    this.strength[row] = Math.max(0, profile.strength);
    this.kineticFraction[row] = clamp01(profile.kineticFraction);
    this.laserFraction[row] = clamp01(profile.laserFraction);
    this.missileFraction[row] = clamp01(profile.missileFraction);
    this.plasmaFraction[row] = clamp01(profile.plasmaFraction);
    this.shieldFraction[row] = clamp01(profile.shieldFraction);
    this.armorRating[row] = Math.max(0, profile.armorRating);
    return row;
  }

  public latestRow(observer: number, target: number, tick: number): number {
    let best = -1;
    let bestTick = Number.NEGATIVE_INFINITY;
    for (let row = 0; row < this.length; row += 1) {
      if ((this.observer[row] ?? -1) !== observer || (this.target[row] ?? -1) !== target) continue;
      if ((this.availableTick[row] ?? Number.POSITIVE_INFINITY) > tick) continue;
      const observed = this.observedTick[row] ?? -1;
      if (observed > bestTick) {
        bestTick = observed;
        best = row;
      }
    }
    return best;
  }

  private refreshColumns(): void {
    this.observer = this.arena.column("observer") as Uint16Array;
    this.target = this.arena.column("target") as Uint16Array;
    this.source = this.arena.column("source") as Uint8Array;
    this.observedTick = this.arena.column("observedTick") as Float64Array;
    this.availableTick = this.arena.column("availableTick") as Float64Array;
    this.strength = this.arena.column("strength") as Float64Array;
    this.kineticFraction = this.arena.column("kineticFraction") as Float64Array;
    this.laserFraction = this.arena.column("laserFraction") as Float64Array;
    this.missileFraction = this.arena.column("missileFraction") as Float64Array;
    this.plasmaFraction = this.arena.column("plasmaFraction") as Float64Array;
    this.shieldFraction = this.arena.column("shieldFraction") as Float64Array;
    this.armorRating = this.arena.column("armorRating") as Float64Array;
  }
}

function sourceDelay(source: IntelSource): number {
  if (source === IntelSource.Battle) return 0;
  if (source === IntelSource.Scout) return 3;
  return 30;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
