import type { RoutePlanner } from "../nav/route.js";
import { type StageOneData } from "../stage-one/data.js";
import type { GovernmentContracts } from "../treasury/contracts.js";
import type { StageOneWorld } from "../world/state.js";
export declare class JobBoard {
    readonly capacity: number;
    readonly faction: Uint16Array;
    readonly sourceBody: Uint32Array;
    readonly targetBody: Uint32Array;
    readonly sourceSystem: Uint32Array;
    readonly targetSystem: Uint32Array;
    readonly resource: Uint16Array;
    readonly quantity: Float64Array;
    readonly travelTicks: Float64Array;
    readonly score: Float64Array;
    readonly reserved: Uint8Array;
    count: number;
    constructor(capacity?: number);
    clear(): void;
    takeBestForFaction(faction: number): number;
    takeBestAtSystem(faction: number, system: number): number;
    unreserve(job: number): void;
    bestUnreservedForFaction(faction: number): number;
    update(data: StageOneData, world: StageOneWorld, routes: RoutePlanner, contracts?: GovernmentContracts): void;
    private scanPair;
    private pushSorted;
    private bubbleUp;
    private compareRows;
    private compareIncoming;
    private write;
    private swap;
}
//# sourceMappingURL=jobboard.d.ts.map