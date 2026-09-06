export interface PathologyFinding {
    readonly check: string;
    readonly status: "ok" | "failed" | "not_available";
    readonly message: string;
    readonly seed: number;
    readonly tick: number;
}
export interface PathologyInput {
    readonly seed: number;
    readonly tick: number;
    readonly stage: number;
    readonly metrics?: StageOnePathologyMetrics | StageTwoPathologyMetrics;
}
export interface StageOnePathologyMetrics {
    readonly minPopulation: number;
    readonly totalPopulation: number;
    readonly averageFoodWaterSpread: number;
    readonly deliveredShipments: number;
    readonly missedDeparturesFuel: number;
}
export interface StageTwoPathologyMetrics extends StageOnePathologyMetrics {
    readonly idleNoPower: number;
    readonly idleMissingInput: number;
    readonly constructedBuildings: number;
    readonly researchedTechnologies: number;
    readonly maxResourceZeroStreakDays: number;
    readonly treasuryMin: number;
}
export declare function detectPathologies(input: PathologyInput): readonly PathologyFinding[];
//# sourceMappingURL=pathology.d.ts.map