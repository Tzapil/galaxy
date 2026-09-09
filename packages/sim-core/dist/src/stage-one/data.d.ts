import { type EconGraph } from "../econ/graph.js";
import type { GalaxyPreset } from "../galaxy/params.js";
import { BodyType } from "../world/bodies.js";
export interface ResourceAmount {
    readonly resource: number;
    readonly amount: number;
}
export type ShipClass = "civilian" | "warship" | "support";
export type ShipSlotType = "weapon" | "defense" | "propulsion" | "utility";
export type WeaponBand = "long" | "medium" | "short";
export interface ShipSlotBudget {
    readonly weapon: number;
    readonly defense: number;
    readonly propulsion: number;
    readonly utility: number;
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
    readonly name: string;
    readonly tier: number;
    readonly shipClass: ShipClass;
    readonly phase: number;
    readonly slots: ShipSlotBudget;
    readonly baseMass: number;
    readonly structure: number;
    readonly crewCapacity: number;
    readonly buildRecipe: readonly ResourceAmount[];
    readonly buildDays: number;
    readonly baseFuel: number;
    readonly tech: string;
}
export interface StageOneModule {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly slot: ShipSlotType;
    readonly tier: number;
    readonly phase: number;
    readonly powerDraw: number;
    readonly mass: number;
    readonly thrust: number;
    readonly crew: number;
    readonly cost: readonly ResourceAmount[];
    readonly tech: string;
    readonly bands: readonly WeaponBand[];
    readonly damage: number;
    readonly vsShield: number;
    readonly vsArmor: number;
    readonly interceptable: boolean;
    readonly armorRating: number;
    readonly structureBonus: number;
    readonly shieldHp: number;
    readonly shieldRegen: number;
    readonly intercept: number;
    readonly cargo: number;
    readonly scan: number;
    readonly fuelCap: number;
    readonly troops: number;
    readonly mining: number;
    readonly colonists: number;
    readonly buildPower: number;
    readonly crewCapacityBonus: number;
    readonly consumedOnUse: boolean;
}
export type StageOneTechEffectType = "unlockModule" | "unlockHull" | "unlockBuilding" | "modifier" | "ability";
export interface StageOneTechEffect {
    readonly type: StageOneTechEffectType;
    readonly id: string;
    readonly target: string;
    readonly stat: string;
    readonly value: number;
}
export type StageOneTechDataKind = "physics" | "engineering" | "bio" | "mixed";
export interface StageOneTechBranch {
    readonly id: string;
    readonly name: string;
    readonly primaryData: StageOneTechDataKind;
}
export interface StageOneTech {
    readonly id: string;
    readonly name: string;
    readonly branch: string;
    readonly tier: number;
    readonly phase: number;
    readonly repeatable: boolean;
    readonly requires: readonly string[];
    readonly physicsCost: number;
    readonly engineeringCost: number;
    readonly bioCost: number;
    readonly basePhysicsCost: number;
    readonly baseEngineeringCost: number;
    readonly baseBioCost: number;
    readonly costGrowth: number;
    readonly effects: readonly StageOneTechEffect[];
    readonly effectPerLevel: readonly StageOneTechEffect[];
}
export interface StageOnePersonalityWeights {
    readonly growth: number;
    readonly industry: number;
    readonly research: number;
    readonly military: number;
    readonly logistics: number;
    readonly stockpile: number;
    readonly risk: number;
}
export interface StageOnePersonality {
    readonly id: string;
    readonly label: string;
    readonly weights: StageOnePersonalityWeights;
}
export interface StageOneDoctrineWeights {
    readonly dps: number;
    readonly ehp: number;
    readonly speed: number;
    readonly cargo: number;
    readonly scan: number;
    readonly mining: number;
    readonly colonists: number;
    readonly troops: number;
    readonly intercept: number;
}
export interface StageOneDoctrineRequirements {
    readonly minSpeed: number;
    readonly minCargo: number;
    readonly minScan: number;
    readonly minMining: number;
    readonly minColonists: number;
    readonly minTroops: number;
}
export interface StageOneDoctrine {
    readonly id: string;
    readonly name: string;
    readonly role: ShipClass;
    readonly hulls: readonly string[];
    readonly preferredBand: WeaponBand;
    readonly weights: StageOneDoctrineWeights;
    readonly require: StageOneDoctrineRequirements;
    readonly withdrawAt: number;
    readonly pursueAbove: number;
}
export interface StageOneDoctrineScoring {
    readonly offBandPenalty: number;
    readonly shieldEhpFactor: number;
    readonly armorSoftening: number;
    readonly expectedBattleRounds: number;
    readonly defaultEnemyProfile: {
        readonly shieldFraction: number;
        readonly armorRating: number;
    };
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
    readonly modules: readonly StageOneModule[];
    readonly moduleIndex: ReadonlyMap<string, number>;
    readonly techBranches: readonly StageOneTechBranch[];
    readonly techBranchIndex: ReadonlyMap<string, number>;
    readonly techs: readonly StageOneTech[];
    readonly techIndex: ReadonlyMap<string, number>;
    readonly doctrines: readonly StageOneDoctrine[];
    readonly doctrineIndex: ReadonlyMap<string, number>;
    readonly doctrineScoring: StageOneDoctrineScoring;
    readonly personalities: readonly StageOnePersonality[];
    readonly personalityIndex: ReadonlyMap<string, number>;
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
    readonly modules: {
        readonly modules: readonly RawGameModule[];
    };
    readonly doctrines: RawGameDoctrinesFile;
    readonly techs: {
        readonly branches: readonly RawGameTechBranch[];
        readonly techs: readonly RawGameTech[];
    };
    readonly galaxyPresets: RawGalaxyPresetsFile;
    readonly personalities: RawGamePersonalitiesFile;
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
    readonly name: string;
    readonly tier: number;
    readonly class: ShipClass;
    readonly phase: number;
    readonly slots: ShipSlotBudget;
    readonly baseMass: number;
    readonly structure: number;
    readonly crewCapacity: number;
    readonly buildRecipe: Record<string, number>;
    readonly buildDays: number;
    readonly baseFuel: number;
    readonly tech: string;
}
interface RawGameModule {
    readonly id: string;
    readonly name: string;
    readonly family: string;
    readonly slot: ShipSlotType;
    readonly tier: number;
    readonly phase: number;
    readonly powerDraw: number;
    readonly mass: number;
    readonly thrust?: number;
    readonly crew: number;
    readonly cost: Record<string, number>;
    readonly tech: string;
    readonly bands?: readonly WeaponBand[];
    readonly damage?: number;
    readonly vsShield?: number;
    readonly vsArmor?: number;
    readonly interceptable?: boolean;
    readonly armorRating?: number;
    readonly structureBonus?: number;
    readonly shieldHp?: number;
    readonly shieldRegen?: number;
    readonly intercept?: number;
    readonly cargo?: number;
    readonly scan?: number;
    readonly fuelCap?: number;
    readonly troops?: number;
    readonly mining?: number;
    readonly colonists?: number;
    readonly buildPower?: number;
    readonly crewCapacityBonus?: number;
    readonly consumedOnUse?: boolean;
}
interface RawGameTechBranch {
    readonly id: string;
    readonly name: string;
    readonly primaryData: StageOneTechDataKind;
}
interface RawGameTechEffect {
    readonly type: StageOneTechEffectType;
    readonly id?: string;
    readonly target?: string;
    readonly stat?: string;
    readonly value?: number;
}
interface RawGameTech {
    readonly id: string;
    readonly name: string;
    readonly branch: string;
    readonly tier: number;
    readonly phase: number;
    readonly repeatable?: boolean;
    readonly requires?: readonly string[];
    readonly cost?: {
        readonly physics?: number;
        readonly engineering?: number;
        readonly bio?: number;
    };
    readonly baseCost?: {
        readonly physics?: number;
        readonly engineering?: number;
        readonly bio?: number;
    };
    readonly costGrowth?: number;
    readonly effects?: readonly RawGameTechEffect[];
    readonly effectPerLevel?: readonly RawGameTechEffect[];
}
interface RawGamePersonalityWeights {
    readonly growth: number;
    readonly industry: number;
    readonly research: number;
    readonly military: number;
    readonly logistics: number;
    readonly stockpile: number;
    readonly risk: number;
}
interface RawGamePersonality {
    readonly id: string;
    readonly label: string;
    readonly weights: RawGamePersonalityWeights;
}
interface RawGamePersonalitiesFile {
    readonly personalities: readonly RawGamePersonality[];
}
interface RawGameDoctrine {
    readonly id: string;
    readonly name: string;
    readonly role: ShipClass;
    readonly hulls: readonly string[];
    readonly preferredBand: WeaponBand;
    readonly weights: Partial<Record<keyof StageOneDoctrineWeights, number>>;
    readonly require: Partial<Record<keyof StageOneDoctrineRequirements, number>>;
    readonly withdrawAt: number;
    readonly pursueAbove: number;
}
interface RawGameDoctrinesFile {
    readonly scoring: {
        readonly offBandPenalty?: number;
        readonly shieldEhpFactor?: number;
        readonly armorSoftening?: number;
        readonly expectedBattleRounds?: number;
        readonly defaultEnemyProfile?: {
            readonly shieldFraction?: number;
            readonly armorRating?: number;
        };
    };
    readonly doctrines: readonly RawGameDoctrine[];
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