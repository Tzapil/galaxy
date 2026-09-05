export const TICKS_PER_YEAR = 365;

export class SimClock {
  public constructor(public tick = 0) {
    if (!Number.isSafeInteger(tick) || tick < 0)
      throw new RangeError("tick must be a safe non-negative integer.");
  }

  public get year(): number {
    return Math.floor(this.tick / TICKS_PER_YEAR);
  }

  public get dayOfYear(): number {
    return this.tick % TICKS_PER_YEAR;
  }

  public advance(days = 1): void {
    if (!Number.isSafeInteger(days) || days < 0)
      throw new RangeError("days must be a safe non-negative integer.");
    this.tick += days;
  }
}

export function ticksFromYears(years: number): number {
  if (!Number.isFinite(years) || years < 0)
    throw new RangeError("years must be a non-negative finite number.");
  return Math.round(years * TICKS_PER_YEAR);
}

export function yearsFromTicks(ticks: number): number {
  if (!Number.isSafeInteger(ticks) || ticks < 0)
    throw new RangeError("ticks must be a safe non-negative integer.");
  return ticks / TICKS_PER_YEAR;
}
