import type { StageOneData, StageOnePersonalityWeights } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export declare const enum AiGoalKind {
    FleetProgram = 1,
    ResourceReserve = 2
}
export interface AiGoal {
    readonly id: number;
    readonly kind: AiGoalKind;
    readonly priority: number;
    readonly deadlineTick: number;
    readonly subject: number;
    readonly resource: number;
    readonly targetAmount: number;
}
export declare function createStrategicGoal(data: StageOneData, world: StageOneWorld, faction: number, tick: number, weights: StageOnePersonalityWeights, currentBottleneck?: number): AiGoal;
//# sourceMappingURL=goals.d.ts.map