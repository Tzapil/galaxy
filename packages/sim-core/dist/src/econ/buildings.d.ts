import { SoAArena } from "../soa/arena.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
import type { Bodies } from "../world/bodies.js";
export declare const enum BuildingState {
    UnderConstruction = 0,
    Working = 1,
    IdleMissingInput = 2,
    IdleNoWorkers = 3,
    IdleNoPower = 4,
    IdleStorageFull = 5,
    Demolished = 6
}
export type BuildingColumn = "type" | "body" | "batchRecipe" | "continuousProcess" | "slots" | "state" | "stateResource" | "startedTick" | "finishTick" | "workersRequired" | "assignedWorkers" | "nextInBody";
export declare class Buildings {
    readonly arena: SoAArena<BuildingColumn>;
    type: Uint16Array;
    body: Uint32Array;
    batchRecipe: Int32Array;
    continuousProcess: Int32Array;
    slots: Uint16Array;
    state: Uint8Array;
    stateResource: Int32Array;
    startedTick: Float64Array;
    finishTick: Float64Array;
    workersRequired: Float64Array;
    assignedWorkers: Float64Array;
    nextInBody: Int32Array;
    constructor(arena: SoAArena<BuildingColumn>);
    static create(initialCapacity?: number): Buildings;
    static fromSnapshot(snapshot: ArenaSnapshot): Buildings;
    get length(): number;
    addBuilt(data: StageOneData, bodies: Bodies, body: number, buildingType: number): number;
    addUnderConstruction(data: StageOneData, bodies: Bodies, body: number, buildingType: number, tick: number): number;
    activateBuilt(data: StageOneData, bodies: Bodies, building: number): void;
    markDemolished(data: StageOneData, bodies: Bodies, building: number): void;
    private addShell;
    setIdleMissing(building: number, resource: number, energyResource: number): void;
    setIdleNoWorkers(building: number): void;
    setIdleStorageFull(building: number, resource: number): void;
    setWorking(building: number, tick: number, finishTick: number): void;
    private refreshColumns;
}
//# sourceMappingURL=buildings.d.ts.map