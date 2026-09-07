import type { Rng } from "../rng.js";
import type { GalaxyShapeSampler } from "./shapes.js";
import type { GalaxyPoint } from "./types.js";
export interface PoissonDiskOptions {
    readonly count: number;
    readonly minDistance: number;
    readonly radius: number;
    readonly maxAttemptsPerPoint?: number;
}
export declare class PoissonDiskError extends Error {
    constructor(message: string);
}
export declare function poissonDiskSample(rng: Rng, sampler: GalaxyShapeSampler, options: PoissonDiskOptions): readonly GalaxyPoint[];
export declare function minimumSquaredDistance(points: readonly GalaxyPoint[]): number;
//# sourceMappingURL=poisson.d.ts.map