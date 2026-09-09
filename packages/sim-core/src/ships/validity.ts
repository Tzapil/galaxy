import type { StageOneData } from "../stage-one/data.js";
import type { TechModifierCache } from "../tech/modifiers.js";

import type { ShipDesign, ShipDesignStats } from "./design-stats.js";
import { calculateDesignStats } from "./design-stats.js";

export type ShipDesignBudget = "slots" | "energy" | "mass" | "crew" | "cost";

export interface ShipDesignBudgetFailure {
  readonly budget: ShipDesignBudget;
  readonly used: number;
  readonly limit: number;
  readonly slot?: string;
}

export interface ShipDesignValidity {
  readonly ok: boolean;
  readonly failures: readonly ShipDesignBudgetFailure[];
  readonly stats: ShipDesignStats;
}

export interface ShipDesignValidityOptions {
  readonly maxCost?: number;
  readonly maxMass?: number;
  readonly modifiers?: TechModifierCache;
  readonly faction?: number;
}

export function validateShipDesign(
  data: StageOneData,
  design: ShipDesign,
  options: ShipDesignValidityOptions = {}
): ShipDesignValidity {
  const faction = options.faction ?? 0;
  const stats = calculateDesignStats(data, design, options.modifiers, faction);
  const hull = data.hulls[design.hull];
  if (hull === undefined) throw new RangeError(`Unknown hull index ${design.hull}.`);
  const failures: ShipDesignBudgetFailure[] = [];
  pushSlotFailure(failures, "weapon", stats.usedSlots.weapon, hull.slots.weapon);
  pushSlotFailure(failures, "defense", stats.usedSlots.defense, hull.slots.defense);
  pushSlotFailure(failures, "propulsion", stats.usedSlots.propulsion, hull.slots.propulsion);
  pushSlotFailure(failures, "utility", stats.usedSlots.utility, hull.slots.utility);
  if (stats.power > 1e-9) {
    failures.push({ budget: "energy", used: stats.power, limit: 0 });
  }
  if (options.maxMass !== undefined && stats.mass > options.maxMass + 1e-9) {
    failures.push({ budget: "mass", used: stats.mass, limit: options.maxMass });
  }
  if (stats.crew > stats.crewCapacity + 1e-9) {
    failures.push({ budget: "crew", used: stats.crew, limit: stats.crewCapacity });
  }
  if (options.maxCost !== undefined && stats.cost > options.maxCost + 1e-9) {
    failures.push({ budget: "cost", used: stats.cost, limit: options.maxCost });
  }
  return { ok: failures.length === 0, failures, stats };
}

export function isShipDesignValid(
  data: StageOneData,
  design: ShipDesign,
  options: ShipDesignValidityOptions = {}
): boolean {
  return validateShipDesign(data, design, options).ok;
}

function pushSlotFailure(
  failures: ShipDesignBudgetFailure[],
  slot: "weapon" | "defense" | "propulsion" | "utility",
  used: number,
  limit: number
): void {
  if (used > limit) failures.push({ budget: "slots", used, limit, slot });
}
