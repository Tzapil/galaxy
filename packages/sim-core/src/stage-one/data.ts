import { buildEconGraph, computeBaseValues, type EconGraph } from "../econ/graph.js";
import type { GalaxyGenerationParams, GalaxyPreset, GalaxyShape } from "../galaxy/params.js";
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
  readonly resources: { readonly resources: readonly RawGameResource[] };
  readonly recipes: {
    readonly batchRecipes: readonly RawGameBatchRecipe[];
    readonly continuous: readonly RawGameContinuousProcess[];
    readonly sinks: readonly RawGameSink[];
  };
  readonly buildings: { readonly buildings: readonly RawGameBuilding[] };
  readonly startPackage: RawGameStartPackage;
  readonly hulls: { readonly hulls: readonly RawGameHull[] };
  readonly techs: { readonly techs: readonly RawGameTech[] };
  readonly galaxyPresets: RawGalaxyPresetsFile;
}

interface RawResource {
  readonly id: string;
  readonly name: string;
  readonly tier?: number;
  readonly category?: string;
  readonly phase?: number;
  readonly storageDefault: number;
  readonly transportable: boolean;
  readonly unitVolume: number;
  readonly deposit?: string;
}

interface RawRecipe {
  readonly id: string;
  readonly buildingId: string;
  readonly inputs: readonly [string, number][];
  readonly outputs: readonly [string, number][];
  readonly durationTicks: number;
  readonly workers: number;
}

interface RawContinuous {
  readonly id: string;
  readonly buildingId: string;
  readonly inputsPerTick: readonly [string, number][];
  readonly outputsPerTick: readonly [string, number][];
  readonly workers: number;
}

interface RawBuilding {
  readonly id: string;
  readonly name: string;
  readonly slots: number;
  readonly recipeId?: string;
  readonly workers?: number;
  readonly housing?: number;
  readonly storageBonus?: number;
  readonly placement?: {
    readonly on: readonly string[];
    readonly requires?: string | readonly string[];
  };
  readonly buildCost?: Record<string, number>;
  readonly buildDays?: number;
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
  readonly population: { readonly start: number; readonly employmentRate: number };
  readonly treasury: { readonly credits: number };
  readonly buildings: readonly { readonly id: string; readonly body: string }[];
  readonly stockpiles: Record<string, number | string | undefined>;
  readonly ships: readonly { readonly hull: string; readonly count: number }[];
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

type NumericGalaxyPresetParam = Exclude<
  Extract<keyof RawGalaxyPresetParams, keyof GalaxyGenerationParams>,
  "shape"
>;

const PLACEMENT_PLANET = 1 << 0;
const PLACEMENT_ASTEROID = 1 << 1;
const PLACEMENT_GAS_GIANT = 1 << 2;
const PLACEMENT_STATION = 1 << 3;
const PLACEMENT_COMET = 1 << 4;
const PLACEMENT_ANY =
  PLACEMENT_PLANET | PLACEMENT_ASTEROID | PLACEMENT_GAS_GIANT | PLACEMENT_STATION | PLACEMENT_COMET;

const rawResources: readonly RawResource[] = [
  { id: "energy", name: "Energy", storageDefault: 200, transportable: false, unitVolume: 0 },
  { id: "ore", name: "Ore", storageDefault: 2000, transportable: true, unitVolume: 1 },
  { id: "ice", name: "Ice", storageDefault: 2000, transportable: true, unitVolume: 1 },
  { id: "biomass", name: "Biomass", storageDefault: 2000, transportable: true, unitVolume: 0.9 },
  { id: "gas", name: "Gas", storageDefault: 2000, transportable: true, unitVolume: 1.2 },
  { id: "metal", name: "Metal", storageDefault: 1500, transportable: true, unitVolume: 0.6 },
  { id: "water", name: "Water", storageDefault: 1500, transportable: true, unitVolume: 0.8 },
  { id: "food", name: "Food", storageDefault: 1500, transportable: true, unitVolume: 0.7 },
  { id: "fuel", name: "Fuel", storageDefault: 1500, transportable: true, unitVolume: 0.7 },
  {
    id: "medicine",
    name: "Medicine",
    storageDefault: 800,
    transportable: true,
    unitVolume: 0.2
  },
  {
    id: "consumer_goods",
    name: "Consumer goods",
    storageDefault: 1000,
    transportable: true,
    unitVolume: 0.4
  },
  {
    id: "luxury_goods",
    name: "Luxury goods",
    storageDefault: 800,
    transportable: true,
    unitVolume: 0.3
  }
];

const rawBatchRecipes: readonly RawRecipe[] = [
  {
    id: "mine_ore",
    buildingId: "mine",
    inputs: [["energy", 5]],
    outputs: [["ore", 20]],
    durationTicks: 2,
    workers: 4
  },
  {
    id: "drill_ice",
    buildingId: "ice_drill",
    inputs: [["energy", 5]],
    outputs: [["ice", 34]],
    durationTicks: 2,
    workers: 3
  },
  {
    id: "collect_gas",
    buildingId: "gas_collector",
    inputs: [["energy", 8]],
    outputs: [["gas", 16]],
    durationTicks: 2,
    workers: 4
  },
  {
    id: "farm_biomass",
    buildingId: "farm",
    inputs: [
      ["water", 4],
      ["energy", 3]
    ],
    outputs: [["biomass", 30]],
    durationTicks: 3,
    workers: 5
  },
  {
    id: "smelt_metal",
    buildingId: "smelter",
    inputs: [
      ["ore", 12],
      ["energy", 12]
    ],
    outputs: [["metal", 6]],
    durationTicks: 2,
    workers: 4
  },
  {
    id: "purify_water",
    buildingId: "water_plant",
    inputs: [
      ["ice", 22],
      ["energy", 8]
    ],
    outputs: [["water", 20]],
    durationTicks: 1,
    workers: 2
  },
  {
    id: "refine_fuel",
    buildingId: "refinery",
    inputs: [
      ["gas", 12],
      ["energy", 15]
    ],
    outputs: [["fuel", 16]],
    durationTicks: 2,
    workers: 4
  },
  {
    id: "synth_food",
    buildingId: "food_plant",
    inputs: [
      ["biomass", 18],
      ["water", 8],
      ["energy", 5]
    ],
    outputs: [["food", 24]],
    durationTicks: 2,
    workers: 4
  }
];

const rawContinuous: readonly RawContinuous[] = [
  {
    id: "solar_array",
    buildingId: "solar_array",
    inputsPerTick: [],
    outputsPerTick: [["energy", 26]],
    workers: 1
  }
];

const rawBuildings: readonly RawBuilding[] = [
  { id: "mine", name: "Mine", slots: 1, recipeId: "mine_ore" },
  { id: "ice_drill", name: "Ice drill", slots: 1, recipeId: "drill_ice" },
  { id: "gas_collector", name: "Gas collector", slots: 1, recipeId: "collect_gas" },
  { id: "farm", name: "Farm", slots: 1, recipeId: "farm_biomass" },
  { id: "smelter", name: "Smelter", slots: 1, recipeId: "smelt_metal" },
  { id: "water_plant", name: "Water plant", slots: 1, recipeId: "purify_water" },
  { id: "refinery", name: "Refinery", slots: 1, recipeId: "refine_fuel" },
  { id: "food_plant", name: "Food plant", slots: 1, recipeId: "synth_food" },
  { id: "solar_array", name: "Solar array", slots: 1, recipeId: "solar_array" },
  { id: "housing", name: "Housing", slots: 1, workers: 0, housing: 90 },
  { id: "warehouse", name: "Warehouse", slots: 1, workers: 2, storageBonus: 500 },
  { id: "spaceport", name: "Spaceport", slots: 1, workers: 5 }
];

export function createDefaultStageOneData(): StageOneData {
  const resources: StageOneResource[] = rawResources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    tier: resource.tier ?? defaultTier(resource.id),
    category: resource.category ?? defaultCategory(resource.id),
    phase: resource.phase ?? 1,
    storageDefault: resource.storageDefault,
    transportable: resource.transportable,
    unitVolume: resource.unitVolume,
    depositFeature: resource.deposit ?? ""
  }));
  const resourceIndex = indexById(resources);
  const transportable = new Uint8Array(resources.length);
  const phase = new Uint16Array(resources.length);
  const storageDefault = new Float64Array(resources.length);
  const unitVolume = new Float64Array(resources.length);
  for (let i = 0; i < resources.length; i += 1) {
    const resource = must(resources[i], "resource");
    transportable[i] = resource.transportable ? 1 : 0;
    phase[i] = resource.phase;
    storageDefault[i] = resource.storageDefault;
    unitVolume[i] = resource.unitVolume;
  }

  const batchRecipes = rawBatchRecipes.map((recipe) => ({
    id: recipe.id,
    buildingId: recipe.buildingId,
    inputs: convertBag(recipe.inputs, resourceIndex),
    outputs: convertBag(recipe.outputs, resourceIndex),
    durationTicks: recipe.durationTicks,
    workers: recipe.workers
  }));
  const batchRecipeIndex = indexById(batchRecipes);

  const continuous = rawContinuous.map((process) => ({
    id: process.id,
    buildingId: process.buildingId,
    inputsPerTick: convertBag(process.inputsPerTick, resourceIndex),
    outputsPerTick: convertBag(process.outputsPerTick, resourceIndex),
    workers: process.workers
  }));
  const continuousIndex = indexById(continuous);
  const powerProcessIndices = powerProcessIndicesFor(
    continuous,
    resourceIndexOf(resourceIndex, "energy")
  );
  const featureIndex = buildFeatureIndex(rawBuildings, []);
  const featureNames = featureNamesFromIndex(featureIndex);
  const sinks: StageOneSink[] = [];

  const buildings = rawBuildings.map((building) => {
    const recipeId = building.recipeId;
    const batchRecipe = recipeId === undefined ? -1 : (batchRecipeIndex.get(recipeId) ?? -1);
    const continuousProcess = recipeId === undefined ? -1 : (continuousIndex.get(recipeId) ?? -1);
    const recipeWorkers =
      batchRecipe >= 0
        ? must(batchRecipes[batchRecipe], "batch recipe").workers
        : continuousProcess >= 0
          ? must(continuous[continuousProcess], "continuous process").workers
          : (building.workers ?? 0);
    return {
      id: building.id,
      name: building.name,
      slots: building.slots,
      batchRecipe,
      continuousProcess,
      workers: recipeWorkers,
      housing: building.housing ?? 0,
      storageBonus: building.storageBonus ?? 0,
      placementMask: placementMaskFrom(building.placement?.on ?? ["planet", "station", "asteroid"]),
      requiredFeatureMask: requiredFeatureMaskFrom(featureIndex, building.placement?.requires),
      buildCost: convertBagFromRecord(building.buildCost ?? {}, resourceIndex),
      buildDays: building.buildDays ?? 1,
      powerSource:
        continuousProcess >= 0 &&
        producesResource(continuous[continuousProcess], resourceIndexOf(resourceIndex, "energy"))
    };
  });
  const buildingIndex = indexById(buildings);

  const needs = new Float64Array(resources.length);
  needs[resourceIndexOf(resourceIndex, "food")] = 0.06;
  needs[resourceIndexOf(resourceIndex, "water")] = 0.05;
  needs[resourceIndexOf(resourceIndex, "medicine")] = 0.008;
  needs[resourceIndexOf(resourceIndex, "consumer_goods")] = 0.015;
  needs[resourceIndexOf(resourceIndex, "luxury_goods")] = 0.006;

  const comfortOnly = new Uint8Array(resources.length);
  comfortOnly[resourceIndexOf(resourceIndex, "medicine")] = 1;
  comfortOnly[resourceIndexOf(resourceIndex, "consumer_goods")] = 1;
  comfortOnly[resourceIndexOf(resourceIndex, "luxury_goods")] = 1;
  const energyResource = resourceIndexOf(resourceIndex, "energy");
  const graphInput = {
    resources,
    batchRecipes,
    continuous,
    sinks,
    populationNeeds: { perThousandPopPerDay: needs, comfortOnly },
    energyResource
  };
  const baseValue = computeBaseValues(graphInput);
  const graph = buildEconGraph(graphInput, baseValue);

  return {
    resources,
    resourceIndex,
    transportable,
    phase,
    storageDefault,
    unitVolume,
    baseValue,
    batchRecipes,
    batchRecipeIndex,
    continuous,
    continuousIndex,
    powerProcessIndices,
    sinks,
    buildings,
    buildingIndex,
    featureIndex,
    featureNames,
    populationNeeds: { perThousandPopPerDay: needs, comfortOnly },
    graph,
    energyResource,
    startPackage: undefined,
    hulls: [],
    hullIndex: new Map<string, number>(),
    techs: [],
    sliceResourceIndices: [
      resourceIndexOf(resourceIndex, "energy"),
      resourceIndexOf(resourceIndex, "ore"),
      resourceIndexOf(resourceIndex, "ice"),
      resourceIndexOf(resourceIndex, "biomass"),
      resourceIndexOf(resourceIndex, "gas"),
      resourceIndexOf(resourceIndex, "metal"),
      resourceIndexOf(resourceIndex, "water"),
      resourceIndexOf(resourceIndex, "food"),
      resourceIndexOf(resourceIndex, "fuel")
    ],
    galaxyPresets: []
  };
}

export function createStageTwoDataFromGameData(input: StageGameDataInput): StageOneData {
  const rawGameResources = input.resources.resources;
  const resources: StageOneResource[] = rawGameResources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    tier: resource.tier,
    category: resource.category,
    phase: resource.phase,
    storageDefault:
      resource.id === "energy" ? Math.max(260, resource.storageDefault) : resource.storageDefault,
    transportable: resource.transportable,
    unitVolume: resource.unitVolume,
    depositFeature: resource.deposit ?? ""
  }));
  const resourceIndex = indexById(resources);
  const transportable = new Uint8Array(resources.length);
  const phase = new Uint16Array(resources.length);
  const storageDefault = new Float64Array(resources.length);
  const unitVolume = new Float64Array(resources.length);
  for (let i = 0; i < resources.length; i += 1) {
    const resource = must(resources[i], "resource");
    transportable[i] = resource.transportable ? 1 : 0;
    phase[i] = resource.phase;
    storageDefault[i] = resource.storageDefault;
    unitVolume[i] = resource.unitVolume;
  }

  const batchRecipes = input.recipes.batchRecipes.map((recipe) => ({
    id: recipe.id,
    buildingId: recipe.building,
    inputs: convertBagFromRecord(recipe.inputs, resourceIndex),
    outputs: convertBagFromRecord(recipe.outputs, resourceIndex),
    durationTicks: recipe.durationDays,
    workers: recipe.workers
  }));
  const batchRecipeIndex = indexById(batchRecipes);

  const continuous = input.recipes.continuous
    .filter((process) => process.kind !== "consumption")
    .map((process) => ({
      id: process.id,
      buildingId: process.building ?? process.id,
      inputsPerTick: convertBagFromRecord(process.inputsPerDay ?? {}, resourceIndex),
      outputsPerTick: convertBagFromRecord(
        process.outputPerDay ?? process.outputsPerDay ?? {},
        resourceIndex
      ),
      workers: process.workers ?? 0
    }));
  const continuousIndex = indexById(continuous);
  const populationNeeds = populationNeedsFrom(input.recipes.continuous, resourceIndex);
  const energyResource = resourceIndexOf(resourceIndex, "energy");
  const powerProcessIndices = powerProcessIndicesFor(continuous, energyResource);
  const sinks = input.recipes.sinks.map((sink) => ({
    id: sink.id,
    consumes: sink.consumes.map((id) => resourceIndexOf(resourceIndex, id)).sort((a, b) => a - b)
  }));
  const featureIndex = buildFeatureIndex(
    input.buildings.buildings,
    input.startPackage.homeSystem.bodies
  );
  const featureNames = featureNamesFromIndex(featureIndex);

  const buildings = input.buildings.buildings.map((building) => {
    const recipeId = building.recipe ?? undefined;
    const batchRecipe = recipeId === undefined ? -1 : (batchRecipeIndex.get(recipeId) ?? -1);
    const continuousProcess = recipeId === undefined ? -1 : (continuousIndex.get(recipeId) ?? -1);
    const recipeWorkers =
      batchRecipe >= 0
        ? must(batchRecipes[batchRecipe], "batch recipe").workers
        : continuousProcess >= 0
          ? must(continuous[continuousProcess], "continuous process").workers
          : (building.workers ?? 0);
    return {
      id: building.id,
      name: building.name,
      slots: building.slots,
      batchRecipe,
      continuousProcess,
      workers: recipeWorkers,
      housing: building.id === "arcology" ? 3 : building.id === "housing" ? 1 : 0,
      storageBonus: building.id === "warehouse" ? 500 : 0,
      placementMask: placementMaskFrom(building.placement.on),
      requiredFeatureMask: requiredFeatureMaskFrom(featureIndex, building.placement.requires),
      buildCost: convertBagFromRecord(building.buildCost, resourceIndex),
      buildDays: building.buildDays,
      powerSource:
        continuousProcess >= 0 && producesResource(continuous[continuousProcess], energyResource)
    };
  });
  const buildingIndex = indexById(buildings);

  const hulls = input.hulls.hulls.map((hull) => ({
    id: hull.id,
    shipClass: hull.class,
    buildRecipe: convertBagFromRecord(hull.buildRecipe, resourceIndex),
    buildDays: hull.buildDays,
    baseFuel: hull.baseFuel
  }));
  const hullIndex = indexById(hulls);

  const techs = input.techs.techs.map((tech) => ({
    id: tech.id,
    phase: tech.phase,
    repeatable: tech.repeatable === true,
    requires: (tech.requires ?? []).slice().sort(),
    physicsCost: tech.cost?.physics ?? 0,
    engineeringCost: tech.cost?.engineering ?? 0,
    bioCost: tech.cost?.bio ?? 0
  }));

  const graphInput = {
    resources,
    batchRecipes,
    continuous,
    sinks,
    populationNeeds,
    energyResource
  };
  const baseValue = computeBaseValues(graphInput);
  const graph = buildEconGraph(graphInput, baseValue);

  return {
    resources,
    resourceIndex,
    transportable,
    phase,
    storageDefault,
    unitVolume,
    baseValue,
    batchRecipes,
    batchRecipeIndex,
    continuous,
    continuousIndex,
    powerProcessIndices,
    sinks,
    buildings,
    buildingIndex,
    featureIndex,
    featureNames,
    populationNeeds,
    graph,
    energyResource,
    startPackage: startPackageFrom(
      input.startPackage,
      buildingIndex,
      resourceIndex,
      featureIndex,
      hullIndex
    ),
    hulls,
    hullIndex,
    techs,
    sliceResourceIndices: preferredSliceResources(resourceIndex),
    galaxyPresets: galaxyPresetsFrom(input.galaxyPresets)
  };
}

export function resourceIndexOf(index: ReadonlyMap<string, number>, id: string): number {
  const value = index.get(id);
  if (value === undefined) throw new RangeError(`Unknown resource id "${id}".`);
  return value;
}

export function buildingIndexOf(index: ReadonlyMap<string, number>, id: string): number {
  const value = index.get(id);
  if (value === undefined) throw new RangeError(`Unknown building id "${id}".`);
  return value;
}

function convertBag(
  items: readonly [string, number][],
  resourceIndex: ReadonlyMap<string, number>
): readonly ResourceAmount[] {
  return items
    .map(([id, amount]) => ({ resource: resourceIndexOf(resourceIndex, id), amount }))
    .sort((a, b) => a.resource - b.resource);
}

function indexById<T extends { readonly id: string }>(
  items: readonly T[]
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < items.length; i += 1) {
    const item = must(items[i], "indexed item");
    if (map.has(item.id)) throw new RangeError(`Duplicate id "${item.id}".`);
    map.set(item.id, i);
  }
  return map;
}

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new RangeError(`Missing ${label}.`);
  return value;
}

function convertBagFromRecord(
  bag: Record<string, number>,
  resourceIndex: ReadonlyMap<string, number>
): readonly ResourceAmount[] {
  return Object.keys(bag)
    .map((id) => ({ resource: resourceIndexOf(resourceIndex, id), amount: bag[id] ?? 0 }))
    .sort((a, b) => a.resource - b.resource);
}

function populationNeedsFrom(
  continuous: readonly RawGameContinuousProcess[],
  resourceIndex: ReadonlyMap<string, number>
): StageOnePopulationNeeds {
  const resourceCount = resourceIndex.size;
  const perThousandPopPerDay = new Float64Array(resourceCount);
  const comfortOnly = new Uint8Array(resourceCount);
  for (let i = 0; i < continuous.length; i += 1) {
    const process = continuous[i];
    if (process?.kind !== "consumption") continue;
    const needs = process.perThousandPopPerDay ?? {};
    for (const id of Object.keys(needs)) {
      perThousandPopPerDay[resourceIndexOf(resourceIndex, id)] = needs[id] ?? 0;
    }
    for (const id of process.comfortOnly ?? []) {
      comfortOnly[resourceIndexOf(resourceIndex, id)] = 1;
    }
  }
  return { perThousandPopPerDay, comfortOnly };
}

function powerProcessIndicesFor(
  continuous: readonly StageOneContinuousProcess[],
  energyResource: number
): readonly number[] {
  const indices: number[] = [];
  for (let i = 0; i < continuous.length; i += 1) {
    if (producesResource(continuous[i], energyResource)) indices.push(i);
  }
  return indices;
}

function producesResource(
  process: StageOneContinuousProcess | undefined,
  resource: number
): boolean {
  if (process === undefined) return false;
  for (let i = 0; i < process.outputsPerTick.length; i += 1) {
    if ((process.outputsPerTick[i]?.resource ?? -1) === resource) return true;
  }
  return false;
}

function buildFeatureIndex(
  buildings: readonly {
    readonly placement?: { readonly requires?: string | readonly string[] };
  }[],
  bodies: readonly { readonly features?: readonly string[] }[]
): ReadonlyMap<string, number> {
  const names: string[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (const feature of bodies[i]?.features ?? []) pushFeature(names, feature);
  }
  for (let i = 0; i < buildings.length; i += 1) {
    const requires = buildings[i]?.placement?.requires;
    if (Array.isArray(requires)) {
      for (const feature of requires) pushFeature(names, feature);
    } else if (requires !== undefined) {
      pushFeature(names, requires);
    }
  }
  names.sort();
  const map = new Map<string, number>();
  for (let i = 0; i < names.length; i += 1) {
    if (i >= 31) throw new RangeError("Body feature mask supports up to 31 features.");
    map.set(names[i] ?? "", i);
  }
  return map;
}

function pushFeature(names: string[], feature: string | readonly string[]): void {
  if (typeof feature !== "string") {
    for (const item of feature) pushFeature(names, item);
    return;
  }
  if (!names.includes(feature)) names.push(feature);
}

function featureNamesFromIndex(index: ReadonlyMap<string, number>): readonly string[] {
  const names = new Array<string>(index.size);
  for (const [name, bit] of index) names[bit] = name;
  return names;
}

function requiredFeatureMaskFrom(
  featureIndex: ReadonlyMap<string, number>,
  requires: string | readonly string[] | undefined
): number {
  if (requires === undefined) return 0;
  const items = Array.isArray(requires) ? requires : [requires];
  let mask = 0;
  for (let i = 0; i < items.length; i += 1) {
    const bit = featureIndex.get(items[i] ?? "");
    if (bit === undefined) throw new RangeError(`Unknown body feature "${items[i] ?? ""}".`);
    mask |= 1 << bit;
  }
  return mask;
}

export function featureMaskFromNames(
  featureIndex: ReadonlyMap<string, number>,
  features: readonly string[]
): number {
  let mask = 0;
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i] ?? "";
    const bit = featureIndex.get(feature);
    if (bit === undefined) throw new RangeError(`Unknown body feature "${feature}".`);
    mask |= 1 << bit;
  }
  return mask;
}

export function bodyTypePlacementMask(type: number): number {
  switch (type) {
    case BodyType.Planet:
      return PLACEMENT_PLANET;
    case BodyType.AsteroidBelt:
      return PLACEMENT_ASTEROID;
    case BodyType.GasGiant:
      return PLACEMENT_GAS_GIANT;
    case BodyType.Station:
      return PLACEMENT_STATION;
    case BodyType.Comet:
      return PLACEMENT_COMET;
    default:
      return 0;
  }
}

function placementMaskFrom(values: readonly string[]): number {
  let mask = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? "";
    if (value === "planet") mask |= PLACEMENT_PLANET | PLACEMENT_GAS_GIANT;
    else if (value === "asteroid") mask |= PLACEMENT_ASTEROID;
    else if (value === "station") mask |= PLACEMENT_STATION;
    else if (value === "comet") mask |= PLACEMENT_COMET;
  }
  return mask === 0 ? PLACEMENT_ANY : mask;
}

function startPackageFrom(
  input: RawGameStartPackage,
  buildingIndex: ReadonlyMap<string, number>,
  resourceIndex: ReadonlyMap<string, number>,
  featureIndex: ReadonlyMap<string, number>,
  hullIndex: ReadonlyMap<string, number>
): StageOneStartPackage {
  const bodyIndex = new Map<string, number>();
  const bodies = input.homeSystem.bodies.map((body, index) => {
    bodyIndex.set(body.id, index);
    return {
      id: body.id,
      type: bodyTypeFrom(body.type),
      slots: body.slots,
      featureMask: featureMaskFromNames(featureIndex, body.features),
      yieldValue: body.yield ?? 1,
      habitability: body.features.includes("habitable") ? 0.92 : 0.1
    };
  });

  const buildings = input.buildings.map((building) => {
    const body = bodyIndex.get(building.body);
    if (body === undefined)
      throw new RangeError(`Start package body "${building.body}" is unknown.`);
    return {
      building: buildingIndexOf(buildingIndex, building.id),
      body
    };
  });

  const stockpiles = Object.keys(input.stockpiles)
    .filter((id) => typeof input.stockpiles[id] === "number")
    .map((id) => ({
      resource: resourceIndexOf(resourceIndex, id),
      amount: Number(input.stockpiles[id])
    }))
    .sort((a, b) => a.resource - b.resource);

  const ships = input.ships.map((ship) => ({
    hull: hullIndexOf(hullIndex, ship.hull),
    count: ship.count
  }));

  return {
    bodies,
    buildings,
    stockpiles,
    ships,
    population: input.population.start,
    employmentRate: input.population.employmentRate,
    treasuryCredits: input.treasury.credits,
    technologies: input.technologies.slice().sort()
  };
}

function bodyTypeFrom(type: string): BodyType {
  if (type === "asteroid") return BodyType.AsteroidBelt;
  if (type === "station") return BodyType.Station;
  if (type === "comet") return BodyType.Comet;
  if (type === "gas_giant") return BodyType.GasGiant;
  return BodyType.Planet;
}

function hullIndexOf(index: ReadonlyMap<string, number>, id: string): number {
  const value = index.get(id);
  if (value === undefined) throw new RangeError(`Unknown hull id "${id}".`);
  return value;
}

function preferredSliceResources(resourceIndex: ReadonlyMap<string, number>): readonly number[] {
  const ids = [
    "energy",
    "ore",
    "ice",
    "biomass",
    "gas",
    "metal",
    "water",
    "food",
    "fuel",
    "alloys",
    "electronics",
    "rare_earth"
  ];
  const result: number[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i] ?? "";
    const value = resourceIndex.get(id);
    if (value !== undefined) result.push(value);
  }
  return result;
}

function galaxyPresetsFrom(input: RawGalaxyPresetsFile): readonly GalaxyPreset[] {
  return input.presets
    .map((preset) => ({
      id: preset.id,
      label: preset.label,
      params: galaxyPresetParamsFrom(preset.params)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function galaxyPresetParamsFrom(raw: RawGalaxyPresetParams): GalaxyGenerationParams {
  const params: GalaxyGenerationParams = {};
  setNumberParam(params, raw, "systemCount");
  setShapeParam(params, raw);
  setNumberParam(params, raw, "armCount");
  setNumberParam(params, raw, "armTightness");
  setNumberParam(params, raw, "avgGateDegree");
  setNumberParam(params, raw, "gateDegreeVariance");
  setNumberParam(params, raw, "maxGateLength");
  setNumberParam(params, raw, "regionCount");
  setNumberParam(params, raw, "chokepointStrength");
  setNumberParam(params, raw, "planetsPerSystemMin");
  setNumberParam(params, raw, "planetsPerSystemMax");
  setNumberParam(params, raw, "habitableFraction");
  setNumberParam(params, raw, "resourceClusterStrength");
  setNumberParam(params, raw, "rareResourceAbundance");
  setNumberParam(params, raw, "factionCount");
  setNumberParam(params, raw, "factionMinJumps");
  setNumberParam(params, raw, "startViabilityJumps");
  return params;
}

function setNumberParam(
  params: GalaxyGenerationParams,
  raw: RawGalaxyPresetParams,
  key: NumericGalaxyPresetParam
): void {
  const value = raw[key];
  if (typeof value === "number") {
    (params as Record<NumericGalaxyPresetParam, number>)[key] = value;
  }
}

function setShapeParam(params: GalaxyGenerationParams, raw: RawGalaxyPresetParams): void {
  const value = raw.shape;
  if (value === "disc" || value === "spiral" || value === "ring" || value === "cluster") {
    (params as { shape?: GalaxyShape }).shape = value;
  }
}

function defaultTier(id: string): number {
  if (id === "energy") return 0;
  if (id === "ore" || id === "ice" || id === "biomass" || id === "gas") return 1;
  if (id === "metal" || id === "water" || id === "food" || id === "fuel") return 2;
  return 3;
}

function defaultCategory(id: string): string {
  if (id === "energy") return "utility";
  if (id === "ore" || id === "ice" || id === "biomass" || id === "gas") return "raw";
  if (id === "metal" || id === "water" || id === "food" || id === "fuel") return "refined";
  return "consumer";
}
