import { type Buildings } from "../econ/buildings.js";
import type { Bodies } from "../world/bodies.js";
export declare const EMPLOYMENT = 0.55;
export declare const MIN_OPERATION_WORKER_RATIO = 0.8;
export declare function assignWorkforceForBody(bodies: Bodies, buildings: Buildings, body: number): void;
export declare function hasWorkersForBuilding(bodies: Bodies, buildings: Buildings, building: number): boolean;
export declare function requiredFoodPlantsForOwnWorkforce(planetSlots: number, foodPlantOutputPerBatch: number, foodPlantDurationTicks: number, foodPerThousandPerDay: number): number;
//# sourceMappingURL=workforce.d.ts.map