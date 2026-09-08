import type { JobBoard } from "../../market/jobboard.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
export interface FleetScaleResult {
    readonly built: boolean;
    readonly ship: number;
}
export declare function scaleCivilianFleet(data: StageOneData, world: StageOneWorld, jobs: JobBoard, faction: number, tick: number): FleetScaleResult;
//# sourceMappingURL=fleet-scale.d.ts.map