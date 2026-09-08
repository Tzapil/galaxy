import type { EventQueue } from "../../events/queue.js";
import type { RoutePlanner } from "../../nav/route.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
export interface ColonizationStep {
    readonly built: boolean;
    readonly launched: boolean;
    readonly targetBody: number;
    readonly score: number;
}
export declare function runColonization(data: StageOneData, world: StageOneWorld, routes: RoutePlanner, queue: EventQueue, faction: number, tick: number, bottleneckResource: number): ColonizationStep;
export declare function buildColonizerIfNeeded(data: StageOneData, world: StageOneWorld, faction: number, tick: number, reasonResource?: number): boolean;
export declare function launchIdleColonizer(data: StageOneData, world: StageOneWorld, routes: RoutePlanner, queue: EventQueue, faction: number, targetBody: number, tick: number): boolean;
export declare function handleColonizerArrival(data: StageOneData, world: StageOneWorld, ship: number, tick: number): boolean;
//# sourceMappingURL=colonize.d.ts.map