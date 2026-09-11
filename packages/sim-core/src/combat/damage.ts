import { armorReduction } from "../ships/design-stats.js";

export const enum WeaponDamageType {
  Kinetic = 1,
  Laser = 2,
  Missile = 3,
  Plasma = 4
}

export interface DamageLayers {
  readonly shield: number;
  readonly armorRating: number;
  readonly structure: number;
}

export interface DamageResult {
  readonly shield: number;
  readonly structure: number;
  readonly shieldDamage: number;
  readonly armorPrevented: number;
  readonly structureDamage: number;
  readonly destroyed: boolean;
}

/** Spec 9.4: shield -> armor reduction -> structure. */
export function applyLayeredDamage(
  target: DamageLayers,
  rawDamage: number,
  vsShield: number,
  vsArmor: number,
  armorSoftening = 90
): DamageResult {
  let raw = Math.max(0, rawDamage);
  let shield = Math.max(0, target.shield);
  const shieldMultiplier = Math.max(0.000001, vsShield);
  const shieldDamage = Math.min(shield, raw * shieldMultiplier);
  shield -= shieldDamage;
  raw = Math.max(0, raw - shieldDamage / shieldMultiplier);

  const beforeArmor = raw * Math.max(0, vsArmor);
  const reduction = armorReduction(Math.max(0, target.armorRating), armorSoftening);
  const armorPrevented = beforeArmor * reduction;
  const structureDamage = beforeArmor - armorPrevented;
  const structure = target.structure - structureDamage;
  return {
    shield,
    structure,
    shieldDamage,
    armorPrevented,
    structureDamage,
    destroyed: structure <= 0
  };
}

export function weaponDamageType(family: string): WeaponDamageType {
  if (family === "laser" || family === "energy") return WeaponDamageType.Laser;
  if (family === "missile" || family === "torpedo") return WeaponDamageType.Missile;
  if (family === "plasma") return WeaponDamageType.Plasma;
  return WeaponDamageType.Kinetic;
}
