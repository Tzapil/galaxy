import type {
  ShipSlotBudget,
  ShipSlotType,
  StageOneData,
  StageOneHull
} from "../stage-one/data.js";

export const SHIP_SLOT_TYPES: readonly ShipSlotType[] = [
  "weapon",
  "defense",
  "propulsion",
  "utility"
];

export function hullById(data: StageOneData, id: string): StageOneHull {
  const index = data.hullIndex.get(id);
  if (index === undefined) throw new RangeError(`Unknown hull "${id}".`);
  const hull = data.hulls[index];
  if (hull === undefined) throw new RangeError(`Hull index ${index} is missing.`);
  return hull;
}

export function slotBudgetValue(slots: ShipSlotBudget, slot: ShipSlotType): number {
  if (slot === "weapon") return slots.weapon;
  if (slot === "defense") return slots.defense;
  if (slot === "propulsion") return slots.propulsion;
  return slots.utility;
}

export function setSlotBudgetValue(
  slots: MutableShipSlotBudget,
  slot: ShipSlotType,
  value: number
): void {
  if (slot === "weapon") slots.weapon = value;
  else if (slot === "defense") slots.defense = value;
  else if (slot === "propulsion") slots.propulsion = value;
  else slots.utility = value;
}

export interface MutableShipSlotBudget {
  weapon: number;
  defense: number;
  propulsion: number;
  utility: number;
}

export function emptySlotBudget(): MutableShipSlotBudget {
  return { weapon: 0, defense: 0, propulsion: 0, utility: 0 };
}

export function assertStageFiveHullData(data: StageOneData): void {
  const phaseOne = countPhaseOneHulls(data);
  if (phaseOne < 11) {
    throw new RangeError(`Stage 5 expects at least 11 phase-one hulls, got ${phaseOne}.`);
  }
  for (let i = 0; i < data.hulls.length; i += 1) {
    const hull = data.hulls[i];
    if (hull === undefined) throw new RangeError("Hull table is inconsistent.");
    if (hull.baseMass <= 0) throw new RangeError(`${hull.id}: baseMass must be positive.`);
    if (hull.structure <= 0) throw new RangeError(`${hull.id}: structure must be positive.`);
    if (hull.buildDays <= 0) throw new RangeError(`${hull.id}: buildDays must be positive.`);
    if (totalSlots(hull.slots) <= 0) throw new RangeError(`${hull.id}: hull has no module slots.`);
  }
}

function countPhaseOneHulls(data: StageOneData): number {
  let count = 0;
  for (let i = 0; i < data.hulls.length; i += 1) {
    if (data.hulls[i]?.phase === 1) count += 1;
  }
  return count;
}

function totalSlots(slots: ShipSlotBudget): number {
  return slots.weapon + slots.defense + slots.propulsion + slots.utility;
}
