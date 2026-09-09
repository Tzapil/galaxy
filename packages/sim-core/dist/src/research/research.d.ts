import type { Rng } from "../rng.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface ResearchStepResult {
    readonly collectedPhysics: number;
    readonly collectedEngineering: number;
    readonly collectedBio: number;
    readonly completed: number;
    readonly chosen: number;
}
export declare function collectAndAdvanceResearch(data: StageOneData, world: StageOneWorld, tick: number, rng?: Rng): ResearchStepResult;
//# sourceMappingURL=research.d.ts.map