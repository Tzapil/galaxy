import type { StageOneData } from "../stage-one/data.js";
export declare function resourceIsConsumedBySink(data: StageOneData, resource: number): boolean;
export declare function sinkConsumesResource(data: StageOneData, sinkId: "ship_construction" | "building_construction" | string, resource: number): boolean;
export declare function allBuildCostResourcesAreSinks(data: StageOneData): boolean;
//# sourceMappingURL=sinks.d.ts.map