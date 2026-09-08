import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
import { type AiOperationalTask } from "../bottleneck.js";
export interface BuildPlanItem {
    readonly body: number;
    readonly buildingType: number;
    readonly count: number;
    readonly resource: number;
    readonly score: number;
}
export interface BuildPlan {
    readonly faction: number;
    readonly items: readonly BuildPlanItem[];
    readonly operations: number;
}
export declare function createBuildPlan(data: StageOneData, world: StageOneWorld, task: AiOperationalTask): BuildPlan;
//# sourceMappingURL=plan.d.ts.map