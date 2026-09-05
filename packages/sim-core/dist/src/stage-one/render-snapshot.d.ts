import { StageOneLogKind } from "../events/log.js";
import type { StageOneSimulation } from "../simulation/stage-one.js";
export declare const STAGE_ONE_VIEW_MAGIC = 1196634454;
export declare const STAGE_ONE_VIEW_VERSION = 1;
export declare const enum RenderSliceBit {
    Map = 1,
    Colonies = 2,
    Ships = 4,
    Buildings = 8,
    Events = 16
}
export interface StageOneRenderSnapshot {
    readonly tick: number;
    readonly slices: number;
    readonly systems: readonly RenderSystem[];
    readonly gates: readonly RenderGate[];
    readonly colonies: readonly RenderColony[];
    readonly ships: readonly RenderShip[];
    readonly buildings: readonly RenderBuilding[];
    readonly events: readonly RenderEvent[];
}
export interface RenderSystem {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly owner: number;
}
export interface RenderGate {
    readonly from: number;
    readonly to: number;
    readonly blocked: boolean;
}
export interface RenderColony {
    readonly body: number;
    readonly system: number;
    readonly faction: number;
    readonly population: number;
    readonly unrest: number;
    readonly stock: readonly number[];
    readonly prices: readonly number[];
}
export interface RenderShip {
    readonly id: number;
    readonly state: number;
    readonly from: number;
    readonly to: number;
    readonly departTick: number;
    readonly arriveTick: number;
    readonly cargoResource: number;
    readonly cargoAmount: number;
}
export interface RenderBuilding {
    readonly id: number;
    readonly body: number;
    readonly type: number;
    readonly state: number;
    readonly stateResource: number;
}
export interface RenderEvent {
    readonly tick: number;
    readonly kind: StageOneLogKind;
    readonly system: number;
    readonly body: number;
    readonly subject: number;
    readonly resource: number;
    readonly amount: number;
}
export declare function buildStageOneRenderSnapshot(sim: StageOneSimulation, slices: number): ArrayBuffer;
export declare function decodeStageOneRenderSnapshot(buffer: ArrayBuffer): StageOneRenderSnapshot;
//# sourceMappingURL=render-snapshot.d.ts.map