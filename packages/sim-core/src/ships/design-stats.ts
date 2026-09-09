import type { TechModifierCache } from "../tech/modifiers.js";
import type { ShipSlotBudget, StageOneData } from "../stage-one/data.js";

import { emptySlotBudget, setSlotBudgetValue, slotBudgetValue } from "./hull.js";
import { hullBundleCost } from "./module.js";

export interface ShipDesign {
  readonly hull: number;
  readonly modules: readonly number[];
}

export interface ShipDesignStats {
  readonly mass: number;
  readonly thrust: number;
  readonly power: number;
  readonly crew: number;
  readonly crewCapacity: number;
  readonly shieldHp: number;
  readonly shieldRegen: number;
  readonly armorRating: number;
  readonly armorReduction: number;
  readonly structure: number;
  readonly effectiveHitPoints: number;
  readonly damageLong: number;
  readonly damageMedium: number;
  readonly damageShort: number;
  readonly weaponModules: readonly number[];
  readonly cargo: number;
  readonly scan: number;
  readonly fuelCap: number;
  readonly troops: number;
  readonly mining: number;
  readonly colonists: number;
  readonly buildPower: number;
  readonly intercept: number;
  readonly usedSlots: ShipSlotBudget;
  readonly cost: number;
  readonly speed: number;
}

export function calculateDesignStats(
  data: StageOneData,
  design: ShipDesign,
  modifiers?: TechModifierCache,
  faction = 0
): ShipDesignStats {
  const hull = data.hulls[design.hull];
  if (hull === undefined) throw new RangeError(`Unknown hull index ${design.hull}.`);
  const usedSlots = emptySlotBudget();
  const weaponModules: number[] = [];
  let mass = hull.baseMass;
  let thrust = 0;
  let power = 0;
  let crew = 0;
  let crewCapacity = hull.crewCapacity;
  let shieldHp = 0;
  let shieldRegen = 0;
  let armorRating = 0;
  let structure = hull.structure;
  let damageLong = 0;
  let damageMedium = 0;
  let damageShort = 0;
  let cargo = 0;
  let scan = 0;
  let fuelCap = hull.baseFuel;
  let troops = 0;
  let mining = 0;
  let colonists = 0;
  let buildPower = 0;
  let intercept = 0;
  let cost = hullBundleCost(data, hull);

  for (let i = 0; i < design.modules.length; i += 1) {
    const moduleIndex = design.modules[i] ?? -1;
    const module = data.modules[moduleIndex];
    if (module === undefined) throw new RangeError(`Unknown module index ${moduleIndex}.`);
    setSlotBudgetValue(usedSlots, module.slot, slotBudgetValue(usedSlots, module.slot) + 1);
    const damageMultiplier = statMultiplier(modifiers, faction, moduleIndex, "damage");
    const thrustMultiplier = statMultiplier(modifiers, faction, moduleIndex, "thrust");
    const armorMultiplier = statMultiplier(modifiers, faction, moduleIndex, "armorRating");
    const shieldMultiplier = statMultiplier(modifiers, faction, moduleIndex, "shieldHp");
    const cargoMultiplier = statMultiplier(modifiers, faction, moduleIndex, "cargo");
    mass += module.mass;
    thrust += module.thrust * thrustMultiplier;
    power += module.powerDraw;
    crew += module.crew;
    crewCapacity += module.crewCapacityBonus;
    shieldHp += module.shieldHp * shieldMultiplier;
    shieldRegen += module.shieldRegen;
    armorRating += module.armorRating * armorMultiplier;
    structure += module.structureBonus;
    cargo += module.cargo * cargoMultiplier;
    scan += module.scan;
    fuelCap += module.fuelCap;
    troops += module.troops;
    mining += module.mining;
    colonists += module.colonists;
    buildPower += module.buildPower;
    intercept += module.intercept;
    cost += moduleCostWithModifier(data, moduleIndex, modifiers, faction);
    if (module.damage > 0) {
      weaponModules.push(moduleIndex);
      const damage = module.damage * damageMultiplier;
      for (let band = 0; band < module.bands.length; band += 1) {
        const current = module.bands[band];
        if (current === "long") damageLong += damage;
        else if (current === "medium") damageMedium += damage;
        else if (current === "short") damageShort += damage;
      }
    }
  }

  const speed = mass > 0 ? thrust / mass : 0;
  const armorRed = armorReduction(armorRating, data.doctrineScoring.armorSoftening);
  return {
    mass,
    thrust,
    power,
    crew,
    crewCapacity,
    shieldHp,
    shieldRegen,
    armorRating,
    armorReduction: armorRed,
    structure,
    effectiveHitPoints: computeEffectiveHitPoints(
      structure,
      armorRating,
      shieldHp,
      shieldRegen,
      data.doctrineScoring.armorSoftening,
      data.doctrineScoring.shieldEhpFactor,
      data.doctrineScoring.expectedBattleRounds
    ),
    damageLong,
    damageMedium,
    damageShort,
    weaponModules,
    cargo,
    scan,
    fuelCap,
    troops,
    mining,
    colonists,
    buildPower,
    intercept,
    usedSlots,
    cost,
    speed
  };
}

export function armorReduction(rating: number, softening = 90): number {
  return rating <= 0 ? 0 : rating / (rating + softening);
}

export function computeEffectiveHitPoints(
  structure: number,
  armorRating: number,
  shieldHp: number,
  shieldRegen: number,
  armorSoftening = 90,
  shieldEhpFactor = 1.3,
  expectedBattleRounds = 6
): number {
  const reduction = armorReduction(armorRating, armorSoftening);
  return (
    structure / Math.max(0.000001, 1 - reduction) +
    shieldHp * shieldEhpFactor +
    shieldRegen * expectedBattleRounds
  );
}

function moduleCostWithModifier(
  data: StageOneData,
  moduleIndex: number,
  modifiers: TechModifierCache | undefined,
  faction: number
): number {
  const module = data.modules[moduleIndex];
  if (module === undefined) throw new RangeError("Module table is inconsistent.");
  const multiplier = statMultiplier(modifiers, faction, moduleIndex, "cost");
  let cost = 0;
  for (let i = 0; i < module.cost.length; i += 1) {
    const item = module.cost[i];
    if (item === undefined) throw new RangeError("Module cost bag is inconsistent.");
    cost += item.amount * (data.baseValue[item.resource] ?? 1) * multiplier;
  }
  return cost;
}

function statMultiplier(
  modifiers: TechModifierCache | undefined,
  faction: number,
  module: number,
  stat: "damage" | "thrust" | "armorRating" | "shieldHp" | "cargo" | "cost"
): number {
  return modifiers?.moduleStatMultiplier(faction, module, stat) ?? 1;
}
