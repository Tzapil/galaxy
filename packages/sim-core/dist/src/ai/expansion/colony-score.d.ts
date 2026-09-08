import type { RoutePlanner } from "../../nav/route.js";
import type { StageOneData } from "../../stage-one/data.js";
import type { StageOneWorld } from "../../world/state.js";
export interface ColonyScore {
    readonly body: number;
    readonly score: number;
    readonly bottleneckResource: number;
}
export declare function scoreColonyTarget(data: StageOneData, world: StageOneWorld, routes: RoutePlanner, faction: number, body: number, bottleneckResource?: number): ColonyScore;
export declare function bestColonyTarget(data: StageOneData, world: StageOneWorld, routes: RoutePlanner, faction: number, bottleneckResource?: number): ColonyScore;
//# sourceMappingURL=colony-score.d.ts.map