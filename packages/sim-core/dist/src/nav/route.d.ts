import type { Gates } from "../world/gates.js";
import type { Systems } from "../world/systems.js";
export interface RouteResult {
    readonly reachable: boolean;
    readonly travelTicks: number;
    readonly jumps: number;
    readonly nextSystem: number;
}
export declare class RoutePlanner {
    private dist;
    private jumps;
    private previous;
    private visited;
    constructor(initialCapacity?: number);
    find(systems: Systems, gates: Gates, from: number, to: number): RouteResult;
    connectedComponentCount(systems: Systems, gates: Gates): number;
    private markComponent;
    private nextUnvisited;
    private nextHop;
    private ensureCapacity;
}
//# sourceMappingURL=route.d.ts.map