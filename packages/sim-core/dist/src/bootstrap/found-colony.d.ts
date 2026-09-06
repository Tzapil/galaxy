import { type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface FoundColonyResult {
    readonly ok: boolean;
    readonly body: number;
    readonly buildings: number;
    readonly reason?: "alreadyOwned" | "noValidBuildings";
}
export declare function foundColony(data: StageOneData, world: StageOneWorld, faction: number, body: number, _tick?: number): FoundColonyResult;
//# sourceMappingURL=found-colony.d.ts.map