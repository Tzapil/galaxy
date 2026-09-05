import type { EventQueue } from "../events/queue.js";
import type { JobBoard } from "../market/jobboard.js";
import type { RoutePlanner } from "../nav/route.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export declare const enum LaunchResult {
    Launched = 1,
    NoJob = 2,
    NoFuel = 3,
    NoCargo = 4
}
export declare function assignIdleHaulers(data: StageOneData, world: StageOneWorld, jobs: JobBoard, routes: RoutePlanner, queue: EventQueue, tick: number): {
    readonly launched: number;
    readonly failedFuel: number;
};
export declare function launchBestLocalJob(data: StageOneData, world: StageOneWorld, jobs: JobBoard, routes: RoutePlanner, queue: EventQueue, ship: number, tick: number): LaunchResult;
export declare function handleShipArrival(data: StageOneData, world: StageOneWorld, queue: EventQueue, ship: number, tick: number): boolean;
//# sourceMappingURL=move.d.ts.map