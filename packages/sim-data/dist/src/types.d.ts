export type { BuildingsFile, DoctrinesFile, GalaxyPresetsFile, HullsFile, ModulesFile, RecipesFile, ResourcesFile, StartPackageFile, TechsFile } from "./generated/schema-types.js";
import type { BuildingsFile, DoctrinesFile, GalaxyPresetsFile, HullsFile, ModulesFile, RecipesFile, ResourcesFile, StartPackageFile, TechsFile } from "./generated/schema-types.js";
export type ResourceRecord = ResourcesFile["resources"][number];
export type BatchRecipeRecord = RecipesFile["batchRecipes"][number];
export type ContinuousRecord = RecipesFile["continuous"][number];
export type SinkRecord = RecipesFile["sinks"][number];
export type BuildingRecord = BuildingsFile["buildings"][number];
export type TechRecord = TechsFile["techs"][number];
export type HullRecord = HullsFile["hulls"][number];
export type ModuleRecord = ModulesFile["modules"][number];
export type DoctrineRecord = DoctrinesFile["doctrines"][number];
export type GalaxyPresetRecord = GalaxyPresetsFile["presets"][number];
export interface GameDataFiles {
    readonly resources: ResourcesFile;
    readonly recipes: RecipesFile;
    readonly buildings: BuildingsFile;
    readonly techs: TechsFile;
    readonly hulls: HullsFile;
    readonly modules: ModulesFile;
    readonly doctrines: DoctrinesFile;
    readonly startPackage: StartPackageFile;
    readonly galaxyPresets: GalaxyPresetsFile;
}
export interface GameDataSchemas {
    readonly resources: unknown;
    readonly recipes: unknown;
    readonly buildings: unknown;
    readonly techs: unknown;
    readonly hulls: unknown;
    readonly modules: unknown;
    readonly doctrines: unknown;
    readonly startPackage: unknown;
    readonly galaxyPresets: unknown;
}
export interface LoadedGameData {
    readonly data: GameDataFiles;
    readonly RES: Map<string, ResourceRecord>;
    readonly BATCH: readonly BatchRecipeRecord[];
    readonly CONT: readonly ContinuousRecord[];
    readonly SINKS: readonly SinkRecord[];
    readonly BUILDINGS: readonly BuildingRecord[];
    readonly producedBy: Map<string, readonly BatchRecipeRecord[]>;
}
//# sourceMappingURL=types.d.ts.map