import type { EventQueue } from "../../events/queue.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
import type { BuildPlan } from "./plan.js";
export interface AppliedBuildPlan {
    readonly started: number;
    readonly queued: number;
}
export declare function applyBuildPlan(data: StageOneData, world: StageOneWorld, queue: EventQueue, tick: number, plan: BuildPlan, maxQueuedPerFaction?: number): AppliedBuildPlan;
export declare function activeConstructionForFaction(world: StageOneWorld, faction: number): number;
//# sourceMappingURL=apply.d.ts.map