import type { EventQueue } from "../events/queue.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export { processContinuousBuildings } from "./continuous.js";
export declare function tryStartBatch(data: StageOneData, world: StageOneWorld, queue: EventQueue, building: number, tick: number): boolean;
export declare function handleBatchComplete(data: StageOneData, world: StageOneWorld, queue: EventQueue, building: number, tick: number): void;
export declare function tryStartIdleBuildingsOnBody(data: StageOneData, world: StageOneWorld, queue: EventQueue, body: number, tick: number): void;
export declare function bootProduction(data: StageOneData, world: StageOneWorld, queue: EventQueue, tick: number): void;
export declare function detectAndBreakProductionDeadlocks(data: StageOneData, world: StageOneWorld, queue: EventQueue, tick: number): number;
//# sourceMappingURL=batch.d.ts.map