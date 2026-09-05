import { type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export declare const COLONY_FUEL_RESERVE = 40;
export declare function refuelShipAtBody(data: StageOneData, world: StageOneWorld, ship: number, body: number): void;
export declare function fuelNeededForJumps(world: StageOneWorld, ship: number, jumps: number): number;
//# sourceMappingURL=fuel.d.ts.map