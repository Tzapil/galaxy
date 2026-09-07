import { type EconGraph } from "../econ/graph.js";
import type { GalaxyPreset } from "../galaxy/params.js";
import { BodyType } from "../world/bodies.js";
export interface ResourceAmount {
    readonly resource: number;
    readonly amount: number;
}
export interface StageOneResource {
    readonly id: string;
    readonly name: string;
    readonly tier: number;
    readonly category: string;
    readonly phase: number;
    readonly storageDefault: number;
    readonly transportable: boolean;
    readonly unitVolume: number;
    readonly depositFeature: string;
}
export interface StageOneBatchRecipe {
    readonly id: string;
    readonly buildingId: string;
    readonly inputs: readonly ResourceAmount[];
    readonly outputs: readonly ResourceAmount[];
    readonly durationTicks: number;
    readonly workers: number;
}
export interface StageOneContinuousProcess {
    readonly id: string;
    readonly buildingId: string;
    readonly inputsPerTick: readonly ResourceAmount[];
    readonly outputsPerTick: readonly ResourceAmount[];
    readonly workers: number;
}
export interface StageOneBuildingDef {
    readonly id: string;
    readonly name: string;
    readonly slots: number;
    readonly batchRecipe: number;
    readonly continuousProcess: number;
    readonly workers: number;
    readonly housing: number;
    readonly storageBonus: number;
    readonly placementMask: number;
    readonly requiredFeatureMask: number;
    readonly buildCost: readonly ResourceAmount[];
    readonly buildDays: number;
    readonly powerSource: boolean;
}
export interface StageOnePopulationNeeds {
    readonly perThousandPopPerDay: Float64Array;
    readonly comfortOnly: Uint8Array;
}
export interface StageOneSink {
    readonly id: string;
    readonly consumes: readonly number[];
}
export interface StageOneHull {
    readonly id: string;
    readonly shipClass: "civilian" | "warship" | "support";
    readonly buildRecipe: readonly ResourceAmount[];
    readonly buildDays: number;
    readonly baseFuel: number;
}
export interface StageOneTech {
    readonly id: string;
    readonly phase: number;
    readonly repeatable: boolean;
    readonly requires: readonly string[];
    readonly physicsCost: number;
    readonly engineeringCost: number;
    readonly bioCost: number;
}
export interface StageOneStartBody {
    readonly id: string;
    readonly type: BodyType;
    readonly slots: number;
    readonly featureMask: number;
    readonly yieldValue: number;
    readonly habitability: number;
}
export interface StageOneStartBuilding {
    readonly building: number;
    readonly body: number;
}
export interface StageOneStartShip {
    readonly hull: number;
    readonly count: number;
}
export interface StageOneStartPackage {
    readonly bodies: readonly StageOneStartBody[];
    readonly buildings: readonly StageOneStartBuilding[];
    readonly stockpiles: readonly ResourceAmount[];
    readonly ships: readonly StageOneStartShip[];
    readonly population: number;
    readonly employmentRate: number;
    readonly treasuryCredits: number;
    readonly technologies: readonly string[];
}
export interface StageOneData {
    readonly resources: readonly StageOneResource[];
    readonly resourceIndex: ReadonlyMap<string, number>;
    readonly transportable: Uint8Array;
    readonly phase: Uint16Array;
    readonly storageDefault: Float64Array;
    readonly unitVolume: Float64Array;
    readonly baseValue: Float64Array;
    readonly batchRecipes: readonly StageOneBatchRecipe[];
    readonly batchRecipeIndex: ReadonlyMap<string, number>;
    readonly continuous: readonly StageOneContinuousProcess[];
    readonly continuousIndex: ReadonlyMap<string, number>;
    readonly powerProcessIndices: readonly number[];
    readonly sinks: readonly StageOneSink[];
    readonly buildings: readonly StageOneBuildingDef[];
    readonly buildingIndex: ReadonlyMap<string, number>;
    readonly featureIndex: ReadonlyMap<string, number>;
    readonly featureNames: readonly string[];
    readonly populationNeeds: StageOnePopulationNeeds;
    readonly graph: EconGraph;
    readonly energyResource: number;
    readonly startPackage: StageOneStartPackage | undefined;
    readonly hulls: readonly StageOneHull[];
    readonly hullIndex: ReadonlyMap<string, number>;
    readonly techs: readonly StageOneTech[];
    readonly sliceResourceIndices: readonly number[];
    readonly galaxyPresets: readonly GalaxyPreset[];
}
export interface StageGameDataInput {
    readonly resources: {
        readonly resources: readonly RawGameResource[];
    };
    readonly recipes: {
        readonly batchRecipes: readonly RawGameBatchRecipe[];
        readonly continuous: readonly RawGameContinuousProcess[];
        readonly sinks: readonly RawGameSink[];
    };
    readonly buildings: {
        readonly buildings: readonly RawGameBuilding[];
    };
    readonly startPackage: RawGameStartPackage;
    readonly hulls: {
        readonly hulls: readonly RawGameHull[];
    };
    readonly techs: {
        readonly techs: readonly RawGameTech[];
    };
    readonly galaxyPresets: RawGalaxyPresetsFile;
}
interface RawGameResource {
    readonly id: string;
    readonly name: string;
    readonly tier: number;
    readonly category: string;
    readonly phase: number;
    readonly storageDefault: number;
    readonly transportable: boolean;
    readonly unitVolume: number;
    readonly deposit?: string;
}
interface RawGameBatchRecipe {
    readonly id: string;
    readonly building: string;
    readonly inputs: Record<string, number>;
    readonly outputs: Record<string, number>;
    readonly durationDays: number;
    readonly workers: number;
}
interface RawGameContinuousProcess {
    readonly id: string;
    readonly kind: string;
    readonly building?: string;
    readonly inputsPerDay?: Record<string, number>;
    readonly outputPerDay?: Record<string, number>;
    readonly outputsPerDay?: Record<string, number>;
    readonly perThousandPopPerDay?: Record<string, number>;
    readonly comfortOnly?: readonly string[];
    readonly workers?: number;
}
interface RawGameSink {
    readonly id: string;
    readonly consumes: readonly string[];
}
interface RawGameBuilding {
    readonly id: string;
    readonly name: string;
    readonly recipe: string | null;
    readonly slots: number;
    readonly workers?: number;
    readonly placement: {
        readonly on: readonly string[];
        readonly requires?: string | readonly string[];
    };
    readonly buildCost: Record<string, number>;
    readonly buildDays: number;
}
interface RawGameStartPackage {
    readonly homeSystem: {
        readonly bodies: readonly {
            readonly id: string;
            readonly type: string;
            readonly slots: number;
            readonly features: readonly string[];
            readonly yield?: number;
        }[];
    };
    readonly population: {
        readonly start: number;
        readonly employmentRate: number;
    };
    readonly treasury: {
        readonly credits: number;
    };
    readonly buildings: readonly {
        readonly id: string;
        readonly body: string;
    }[];
    readonly stockpiles: Record<string, number | string | undefined>;
    readonly ships: readonly {
        readonly hull: string;
        readonly count: number;
    }[];
    readonly technologies: readonly string[];
}
interface RawGameHull {
    readonly id: string;
    readonly class: "civilian" | "warship" | "support";
    readonly buildRecipe: Record<string, number>;
    readonly buildDays: number;
    readonly baseFuel: number;
}
interface RawGameTech {
    readonly id: string;
    readonly phase: number;
    readonly repeatable?: boolean;
    readonly requires?: readonly string[];
    readonly cost?: {
        readonly physics?: number;
        readonly engineering?: number;
        readonly bio?: number;
    };
}
interface RawGalaxyPresetsFile {
    readonly presets: readonly RawGalaxyPreset[];
}
interface RawGalaxyPreset {
    readonly id: string;
    readonly label: string;
    readonly params: RawGalaxyPresetParams;
}
interface RawGalaxyPresetParams {
    readonly systemCount?: number;
    readonly shape?: string;
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
}
export declare function createDefaultStageOneData(): StageOneData;
export declare function createStageTwoDataFromGameData(input: StageGameDataInput): StageOneData;
export declare function resourceIndexOf(index: ReadonlyMap<string, number>, id: string): number;
export declare function buildingIndexOf(index: ReadonlyMap<string, number>, id: string): number;
export declare function featureMaskFromNames(featureIndex: ReadonlyMap<string, number>, features: readonly string[]): number;
export declare function bodyTypePlacementMask(type: number): number;
export {};
//# sourceMappingURL=data.d.ts.map