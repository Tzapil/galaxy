import type { StageOneDoctrine, WeaponBand } from "../stage-one/data.js";

export const enum CombatBand {
  Long = 0,
  Medium = 1,
  Short = 2
}

export function combatBand(value: WeaponBand): CombatBand {
  if (value === "long") return CombatBand.Long;
  if (value === "medium") return CombatBand.Medium;
  return CombatBand.Short;
}

export function weaponCanFire(bands: readonly WeaponBand[], band: CombatBand): boolean {
  const wanted = bandName(band);
  for (let i = 0; i < bands.length; i += 1) {
    if (bands[i] === wanted) return true;
  }
  return false;
}

export function moveBand(current: CombatBand, target: CombatBand): CombatBand {
  if (current === target) return current;
  return (current + (target > current ? 1 : -1)) as CombatBand;
}

export function resolveBandStep(
  current: CombatBand,
  doctrineA: StageOneDoctrine,
  doctrineB: StageOneDoctrine,
  averageSpeedA: number,
  averageSpeedB: number
): CombatBand {
  const wantedA = combatBand(doctrineA.preferredBand);
  const wantedB = combatBand(doctrineB.preferredBand);
  if (wantedA === wantedB) return moveBand(current, wantedA);
  if (Math.abs(averageSpeedA - averageSpeedB) <= 1e-9) return current;
  return moveBand(current, averageSpeedA > averageSpeedB ? wantedA : wantedB);
}

export function bandName(band: CombatBand): WeaponBand {
  if (band === CombatBand.Long) return "long";
  if (band === CombatBand.Medium) return "medium";
  return "short";
}
