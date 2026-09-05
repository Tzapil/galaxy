export const TICKS_PER_YEAR = 365;
export class SimClock {
    tick;
    constructor(tick = 0) {
        this.tick = tick;
        if (!Number.isSafeInteger(tick) || tick < 0)
            throw new RangeError("tick must be a safe non-negative integer.");
    }
    get year() {
        return Math.floor(this.tick / TICKS_PER_YEAR);
    }
    get dayOfYear() {
        return this.tick % TICKS_PER_YEAR;
    }
    advance(days = 1) {
        if (!Number.isSafeInteger(days) || days < 0)
            throw new RangeError("days must be a safe non-negative integer.");
        this.tick += days;
    }
}
export function ticksFromYears(years) {
    if (!Number.isFinite(years) || years < 0)
        throw new RangeError("years must be a non-negative finite number.");
    return Math.round(years * TICKS_PER_YEAR);
}
export function yearsFromTicks(ticks) {
    if (!Number.isSafeInteger(ticks) || ticks < 0)
        throw new RangeError("ticks must be a safe non-negative integer.");
    return ticks / TICKS_PER_YEAR;
}
//# sourceMappingURL=time.js.map