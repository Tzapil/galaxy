import { type Instrumentation } from "../instrument.js";
import { JobBoard } from "../market/jobboard.js";
import { RoutePlanner } from "../nav/route.js";
import { type StageOneData } from "../stage-one/data.js";
import type { SnapshotState } from "../snapshot/types.js";
import { StageOneWorld } from "../world/state.js";
export interface StageOneRunReport {
    readonly ticks: number;
    readonly finalHash: string;
    readonly intermediateHashes: readonly HashCheckpoint[];
    readonly counters: {
        readonly systems: number;
        readonly factions: number;
        readonly ships: number;
        readonly buildings: number;
    };
    readonly metrics: StageOneMetrics;
}
export interface StageOneMetrics {
    readonly totalPopulation: number;
    readonly minPopulation: number;
    readonly averageFoodWaterSpread: number;
    readonly completedBatches: number;
    readonly deliveredShipments: number;
    readonly missedDeparturesFuel: number;
    readonly jobsAvailable: number;
    readonly idleHaulers: number;
}
export interface HashCheckpoint {
    readonly tick: number;
    readonly hash: string;
}
export declare class StageOneSimulation {
    private readonly rootRng;
    readonly data: StageOneData;
    readonly world: StageOneWorld;
    tick: number;
    private readonly eventBatch;
    private readonly routes;
    private readonly jobs;
    private completedBatches;
    private deliveredShipments;
    private missedDeparturesFuel;
    private constructor();
    static create(seed: number, data?: StageOneData): StageOneSimulation;
    static fromSnapshot(buffer: ArrayBuffer, data?: StageOneData): StageOneSimulation;
    private queue;
    step(instrumentation?: Instrumentation): void;
    run(ticks: number, checkpointEvery?: number, instrumentation?: Instrumentation): StageOneRunReport;
    snapshot(): ArrayBuffer;
    renderSnapshot(slices: number): ArrayBuffer;
    hash(): string;
    snapshotState(): SnapshotState;
    metrics(): StageOneMetrics;
    jobBoard(): JobBoard;
    routePlanner(): RoutePlanner;
    private applyEvents;
    private refreshLogistics;
    private scaleHaulers;
    private countIdleHaulers;
}
//# sourceMappingURL=stage-one.d.ts.map