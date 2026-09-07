import { type Instrumentation } from "../instrument.js";
import { JobBoard } from "../market/jobboard.js";
import { RoutePlanner } from "../nav/route.js";
import type { SnapshotState } from "../snapshot/types.js";
import { type StageOneData } from "../stage-one/data.js";
import { StageOneWorld } from "../world/state.js";
export interface StageTwoRunReport {
    readonly ticks: number;
    readonly finalHash: string;
    readonly intermediateHashes: readonly StageTwoHashCheckpoint[];
    readonly counters: {
        readonly systems: number;
        readonly factions: number;
        readonly ships: number;
        readonly buildings: number;
    };
    readonly metrics: StageTwoMetrics;
}
export interface StageTwoMetrics {
    readonly totalPopulation: number;
    readonly minPopulation: number;
    readonly averageFoodWaterSpread: number;
    readonly completedBatches: number;
    readonly deliveredShipments: number;
    readonly missedDeparturesFuel: number;
    readonly jobsAvailable: number;
    readonly idleHaulers: number;
    readonly idleNoPower: number;
    readonly idleMissingInput: number;
    readonly constructedBuildings: number;
    readonly disbandedShips: number;
    readonly researchedTechnologies: number;
    readonly activeConstructions: number;
    readonly slotFillRatio: number;
    readonly maxResourceZeroStreakDays: number;
    readonly treasuryMin: number;
}
export interface StageTwoHashCheckpoint {
    readonly tick: number;
    readonly hash: string;
}
export declare class StageTwoSimulation {
    private readonly rootRng;
    readonly data: StageOneData;
    readonly world: StageOneWorld;
    tick: number;
    private readonly eventBatch;
    private readonly routes;
    private readonly jobs;
    private readonly contracts;
    private readonly zeroStreakDays;
    private readonly maxZeroStreakDays;
    private completedBatches;
    private deliveredShipments;
    private missedDeparturesFuel;
    private constructedBuildings;
    private disbandedShips;
    private treasuryMin;
    private constructor();
    static create(seed: number, data: StageOneData): StageTwoSimulation;
    static createFromWorld(seed: number, data: StageOneData, world: StageOneWorld): StageTwoSimulation;
    static fromSnapshot(buffer: ArrayBuffer, data: StageOneData): StageTwoSimulation;
    private queue;
    step(instrumentation?: Instrumentation): void;
    run(ticks: number, checkpointEvery?: number, instrumentation?: Instrumentation): StageTwoRunReport;
    snapshot(): ArrayBuffer;
    renderSnapshot(slices: number): ArrayBuffer;
    hash(): string;
    snapshotState(): SnapshotState;
    metrics(): StageTwoMetrics;
    jobBoard(): JobBoard;
    routePlanner(): RoutePlanner;
    private applyEvents;
    private refreshLogistics;
    private refreshContracts;
    private addShortageContracts;
    private scaleHaulers;
    private updateTreasuryMinimum;
    private updateZeroStreaks;
    private tracksZeroStreak;
    private totalOwnedStock;
    private countBuildingsInState;
    private countIdleHaulers;
    private countIdleHaulersForFaction;
    private minResearchedTechnologies;
    private maxTrackedZeroStreak;
}
//# sourceMappingURL=stage-two.d.ts.map