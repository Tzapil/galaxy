export declare const AI_STRATEGIC_PERIOD_TICKS = 360;
export declare const AI_OPERATIONAL_PERIOD_TICKS = 30;
export declare const enum AiLayer {
    Strategic = 1,
    Operational = 2,
    Tactical = 3
}
export interface AiScheduledRun {
    readonly layer: AiLayer;
    readonly faction: number;
}
export declare class AiScheduler {
    shouldRunStrategic(tick: number, faction: number): boolean;
    shouldRunOperational(tick: number, faction: number): boolean;
    shouldRunTactical(_tick: number): boolean;
    collectDue(tick: number, factionCount: number, out: AiScheduledRun[]): void;
}
//# sourceMappingURL=scheduler.d.ts.map