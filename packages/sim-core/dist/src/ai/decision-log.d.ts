import { StageOneLogKind } from "../events/log.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface AiDecisionEvent {
    readonly kind: StageOneLogKind;
    readonly faction: number;
    readonly system: number;
    readonly body: number;
    readonly subject: number;
    readonly resource: number;
    readonly amount: number;
}
export declare function appendAiDecision(_data: StageOneData, world: StageOneWorld, tick: number, event: AiDecisionEvent): void;
export declare function logStrategicGoal(data: StageOneData, world: StageOneWorld, tick: number, faction: number, subject: number, resource: number, pressure: number): void;
export declare function logBottleneck(data: StageOneData, world: StageOneWorld, tick: number, faction: number, resource: number, deficitPerDay: number): void;
export declare function logBuildPlan(data: StageOneData, world: StageOneWorld, tick: number, faction: number, body: number, buildingType: number, resource: number, score: number): void;
export declare function logColonization(data: StageOneData, world: StageOneWorld, tick: number, faction: number, targetBody: number, resource: number, score: number): void;
export declare function logFleetScale(data: StageOneData, world: StageOneWorld, tick: number, faction: number, ship: number, jobs: number): void;
//# sourceMappingURL=decision-log.d.ts.map