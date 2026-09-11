export const MAX_INTERCEPT_FRACTION = 0.6;

export interface InterceptResult {
  readonly damage: number;
  readonly absorbed: number;
  readonly interceptRemaining: number;
}

/** Spec 9.4: no interceptable volley may lose more than 60% of its damage. */
export function interceptDamage(damage: number, interceptAvailable: number): InterceptResult {
  const safeDamage = Math.max(0, damage);
  const available = Math.max(0, interceptAvailable);
  const absorbed = Math.min(available, safeDamage * MAX_INTERCEPT_FRACTION);
  return {
    damage: safeDamage - absorbed,
    absorbed,
    interceptRemaining: available - absorbed
  };
}
