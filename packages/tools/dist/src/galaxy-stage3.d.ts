interface GalaxyStageThreeOptions {
    readonly seed: number;
    readonly preset: string;
    readonly systems: number | undefined;
    readonly checkSeeds: number;
    readonly outDir: string;
}
interface GenerationCheckResult {
    readonly seed: number;
    readonly attempt: number;
    readonly systems: number;
    readonly edges: number;
    readonly averageGateDegree: number;
    readonly factions: number;
    readonly validationOk: boolean;
    readonly violationCount: number;
    readonly elapsedMs: number;
}
export declare function runGalaxyStageThree(options: GalaxyStageThreeOptions): Promise<readonly GenerationCheckResult[]>;
export {};
//# sourceMappingURL=galaxy-stage3.d.ts.map