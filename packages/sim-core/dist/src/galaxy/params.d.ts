export type GalaxyShape = "disc" | "spiral" | "ring" | "cluster";
export interface GalaxyGenerationParams {
    readonly systemCount?: number;
    readonly shape?: GalaxyShape;
    readonly armCount?: number;
    readonly armTightness?: number;
    readonly avgGateDegree?: number;
    readonly gateDegreeVariance?: number;
    readonly maxGateLength?: number;
    readonly regionCount?: number;
    readonly chokepointStrength?: number;
    readonly planetsPerSystemMin?: number;
    readonly planetsPerSystemMax?: number;
    readonly habitableFraction?: number;
    readonly resourceClusterStrength?: number;
    readonly rareResourceAbundance?: number;
    readonly factionCount?: number;
    readonly factionMinJumps?: number;
    readonly startViabilityJumps?: number;
    readonly maxAttempts?: number;
    readonly galaxyRadius?: number;
    readonly minSystemDistance?: number;
}
export interface NormalizedGalaxyParams {
    readonly systemCount: number;
    readonly shape: GalaxyShape;
    readonly armCount: number;
    readonly armTightness: number;
    readonly avgGateDegree: number;
    readonly gateDegreeVariance: number;
    readonly maxGateLength: number | undefined;
    readonly regionCount: number;
    readonly chokepointStrength: number;
    readonly planetsPerSystemMin: number;
    readonly planetsPerSystemMax: number;
    readonly habitableFraction: number;
    readonly resourceClusterStrength: number;
    readonly rareResourceAbundance: number;
    readonly factionCount: number;
    readonly factionMinJumps: number;
    readonly startViabilityJumps: number;
    readonly maxAttempts: number;
    readonly galaxyRadius: number;
    readonly minSystemDistance: number;
    readonly rareResourceClusterMin: number;
}
export interface GalaxyPreset {
    readonly id: string;
    readonly label: string;
    readonly params: GalaxyGenerationParams;
}
export declare function normalizeGalaxyParams(params?: GalaxyGenerationParams): NormalizedGalaxyParams;
export declare function paramsWithPreset(presets: readonly GalaxyPreset[], presetId: string, overrides?: GalaxyGenerationParams): GalaxyGenerationParams;
export declare function deriveAttemptSeed(seed: number, attempt: number): number;
//# sourceMappingURL=params.d.ts.map