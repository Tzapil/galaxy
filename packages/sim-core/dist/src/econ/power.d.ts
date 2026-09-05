import type { StageOneData } from "../stage-one/data.js";
export interface PowerSourceScore {
    readonly buildingId: string;
    readonly energyPerTick: number;
    readonly logisticsVolumePer100Energy: number;
    readonly unitCost: number;
    readonly score: number;
}
export declare function clampLocalEnergyBuffer(data: StageOneData, amount: number): number;
export declare function scorePowerSourcesForLogistics(data: StageOneData, distanceTicks: number): readonly PowerSourceScore[];
export declare function choosePowerSourceForRemoteBase(data: StageOneData, distanceTicks: number, minimumEnergyPerTick?: number): string;
//# sourceMappingURL=power.d.ts.map