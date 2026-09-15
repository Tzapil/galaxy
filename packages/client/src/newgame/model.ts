import {
  createStageTwoDataFromGameData,
  generateStarLayout,
  normalizeGalaxyParams,
  type GalaxyGenerationParams,
  type GalaxyPoint,
  type GalaxyShape
} from "@galaxy-sim/sim-core";
import { GAME_DATA } from "@galaxy-sim/sim-data/game-data";
import type { StageOneInitParams } from "@galaxy-sim/sim-worker";

const data = createStageTwoDataFromGameData(GAME_DATA);

export interface NewGameConfig {
  readonly seed: number;
  readonly systemCount: number;
  readonly shape: GalaxyShape;
  readonly armCount: number;
  readonly armTightness: number;
  readonly avgGateDegree: number;
  readonly gateDegreeVariance: number;
  readonly maxGateLength: number;
  readonly regionCount: number;
  readonly chokepointStrength: number;
  readonly planetsPerSystemMin: number;
  readonly planetsPerSystemMax: number;
  readonly habitableFraction: number;
  readonly resourceClusterStrength: number;
  readonly rareResourceAbundance: number;
  readonly factionCount: number;
  readonly factionMinJumps: number;
  readonly maxShips: number;
  readonly unlimitedShips: boolean;
  readonly maxBuildings: number;
  readonly unlimitedBuildings: boolean;
  readonly targetTicksPerSecond: number;
}

export interface NewGamePreset {
  readonly id: string;
  readonly label: string;
  readonly config: NewGameConfig;
}

export const DEFAULT_NEW_GAME: NewGameConfig = {
  seed: 20260904,
  systemCount: 500,
  shape: "spiral",
  armCount: 4,
  armTightness: 0.4,
  avgGateDegree: 3,
  gateDegreeVariance: 0.6,
  maxGateLength: 0,
  regionCount: 8,
  chokepointStrength: 0.6,
  planetsPerSystemMin: 1,
  planetsPerSystemMax: 9,
  habitableFraction: 0.12,
  resourceClusterStrength: 0.7,
  rareResourceAbundance: 0.05,
  factionCount: 8,
  factionMinJumps: 6,
  maxShips: 20_000,
  unlimitedShips: false,
  maxBuildings: 50_000,
  unlimitedBuildings: false,
  targetTicksPerSecond: 1000
};

export const NEW_GAME_PRESETS: readonly NewGamePreset[] = data.galaxyPresets.map((preset) => ({
  id: preset.id,
  label: preset.label,
  config: { ...DEFAULT_NEW_GAME, ...preset.params }
}));

export function validateNewGame(config: NewGameConfig): readonly string[] {
  const errors: string[] = [];
  try {
    normalizeGalaxyParams(toGalaxyParams(config));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Galaxy parameters are invalid.");
  }
  if (config.planetsPerSystemMin > config.planetsPerSystemMax)
    errors.push("Minimum planets cannot exceed maximum planets.");
  if (config.factionCount > config.systemCount)
    errors.push("Faction count cannot exceed system count.");
  if (
    config.factionMinJumps >= config.systemCount / 2 ||
    config.factionCount * config.factionMinJumps > config.systemCount * 1.5
  ) {
    errors.push(
      "Faction spacing is impossible at this system count; reduce factionMinJumps or factions."
    );
  }
  if (!config.unlimitedShips && config.maxShips < config.factionCount)
    errors.push("maxShips is too small for the starting factions.");
  if (!config.unlimitedBuildings && config.maxBuildings < config.factionCount * 8)
    errors.push("maxBuildings is too small for the starting packages.");
  if (config.targetTicksPerSecond < 1 || config.targetTicksPerSecond > 1000)
    errors.push("targetTicksPerSecond must be in 1..1000.");
  return errors;
}

export function toGalaxyParams(config: NewGameConfig): GalaxyGenerationParams {
  return {
    systemCount: config.systemCount,
    shape: config.shape,
    armCount: config.armCount,
    armTightness: config.armTightness,
    avgGateDegree: config.avgGateDegree,
    gateDegreeVariance: config.gateDegreeVariance,
    ...(config.maxGateLength > 0 ? { maxGateLength: config.maxGateLength } : {}),
    regionCount: config.regionCount,
    chokepointStrength: config.chokepointStrength,
    planetsPerSystemMin: config.planetsPerSystemMin,
    planetsPerSystemMax: config.planetsPerSystemMax,
    habitableFraction: config.habitableFraction,
    resourceClusterStrength: config.resourceClusterStrength,
    rareResourceAbundance: config.rareResourceAbundance,
    factionCount: config.factionCount,
    factionMinJumps: config.factionMinJumps
  };
}

export function toWorkerInit(config: NewGameConfig): StageOneInitParams {
  return {
    galaxy: toGalaxyParams(config),
    speed: 1,
    targetTicksPerSecond: config.targetTicksPerSecond,
    technicalLimits: {
      maxShips: config.unlimitedShips ? undefined : config.maxShips,
      maxBuildings: config.unlimitedBuildings ? undefined : config.maxBuildings
    }
  };
}

export function previewPoints(config: NewGameConfig): readonly GalaxyPoint[] {
  if (validateNewGame(config).length > 0) return [];
  return generateStarLayout(config.seed, toGalaxyParams(config)).points;
}
