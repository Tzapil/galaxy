export declare const TICKS_PER_YEAR = 365;
export declare class SimClock {
    tick: number;
    constructor(tick?: number);
    get year(): number;
    get dayOfYear(): number;
    advance(days?: number): void;
}
export declare function ticksFromYears(years: number): number;
export declare function yearsFromTicks(ticks: number): number;
//# sourceMappingURL=time.d.ts.map