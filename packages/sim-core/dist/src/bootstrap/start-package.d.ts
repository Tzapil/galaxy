import type { EventQueue } from "../events/queue.js";
import { type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface AppliedStartPackage {
    readonly faction: number;
    readonly bodies: readonly number[];
}
export interface StartPackageValidation {
    readonly ok: boolean;
    readonly bodyCount: number;
    readonly buildingCount: number;
    readonly effectivePopulation: number;
    readonly requiredWorkerRatio: number;
    readonly hasLocalPowerEverywhere: boolean;
    readonly hasScienceDataFlow: boolean;
    readonly placementsValid: boolean;
    readonly missing: readonly string[];
}
export declare function applyStartPackage(data: StageOneData, world: StageOneWorld, system: number, label: string, queue?: EventQueue, includeShips?: boolean): AppliedStartPackage;
export declare function addStartPackageShips(data: StageOneData, world: StageOneWorld, faction: number, system: number): void;
export declare function validateStartPackage(data: StageOneData): StartPackageValidation;
export declare function startPackageSummary(data: StageOneData): string;
export declare function addDepositsForFeatures(data: StageOneData, world: StageOneWorld, body: number, featureMask: number, yieldValue: number): void;
//# sourceMappingURL=start-package.d.ts.map