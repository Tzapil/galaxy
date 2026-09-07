import type { Rng } from "../rng.js";
import type { NormalizedGalaxyParams } from "./params.js";
import type { GalaxyPoint } from "./types.js";
export interface GalaxyShapeSampler {
    readonly sample: (rng: Rng) => GalaxyPoint;
    readonly contains: (point: GalaxyPoint) => boolean;
}
export declare function createGalaxyShapeSampler(params: NormalizedGalaxyParams, rng: Rng): GalaxyShapeSampler;
//# sourceMappingURL=shapes.d.ts.map