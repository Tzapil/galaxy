import { BodyType } from "./bodies.js";

export interface SlotRange {
  readonly min: number;
  readonly max: number;
}

export function slotRangeForBody(type: BodyType, habitability: number): SlotRange {
  if (type === BodyType.Station) return { min: 4, max: 10 };
  if (type === BodyType.Comet) return { min: 5, max: 12 };
  if (type === BodyType.GasGiant) return { min: 4, max: 10 };
  if (type === BodyType.AsteroidBelt) return { min: 6, max: 14 };
  if (habitability >= 0.7) return { min: 12, max: 26 };
  return { min: 8, max: 18 };
}

export function totalSlotsForBody(type: BodyType, size: number, habitability: number): number {
  const range = slotRangeForBody(type, habitability);
  const normalizedSize = Math.max(0, Math.min(1, size));
  return Math.round(range.min + (range.max - range.min) * normalizedSize);
}

export function freeSlots(totalSlots: number, usedSlots: number): number {
  return Math.max(0, totalSlots - usedSlots);
}
