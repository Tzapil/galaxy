import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import type { AiGoal } from "./goals.js";
export declare const STOCK_RESERVE_HORIZON_DAYS = 90;
export declare const enum AiOperationalTaskKind {
    BuildProducer = 1,
    ColonizeResource = 2,
    ResearchUnlock = 3,
    Stabilize = 4
}
export interface AiBottleneck {
    readonly resource: number;
    readonly demandPerDay: number;
    readonly supplyPerDay: number;
    readonly deficitPerDay: number;
    readonly stockDays: number;
    readonly operations: number;
}
export interface AiOperationalTask {
    readonly kind: AiOperationalTaskKind;
    readonly faction: number;
    readonly resource: number;
    readonly body: number;
    readonly buildingType: number;
    readonly score: number;
}
export declare function findBottleneck(data: StageOneData, world: StageOneWorld, faction: number, _goal?: AiGoal): AiBottleneck | undefined;
export declare function toOperationalTask(data: StageOneData, world: StageOneWorld, faction: number, bottleneck: AiBottleneck | undefined): AiOperationalTask;
export declare function reserveDays(stock: number, demandPerDay: number): number;
//# sourceMappingURL=bottleneck.d.ts.map