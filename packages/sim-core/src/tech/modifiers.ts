import type {
  ResourceAmount,
  StageOneData,
  StageOneTechEffect,
  StageOneModule
} from "../stage-one/data.js";

import type { TechGraph } from "./graph.js";
import { repeatableEffectMultiplier } from "./repeatable.js";
import type { FactionTechState } from "./state.js";

export interface TechModifierCacheStats {
  readonly recomputations: number;
}

type RecipeStat =
  | "outputMultiplier"
  | "inputMultiplier"
  | "durationMultiplier"
  | "workersMultiplier"
  | "recipeOutput";
type ModuleStat = "damage" | "thrust" | "armorRating" | "shieldHp" | "cargo" | "cost";
type GlobalMultiplierStat =
  | "energyStorage"
  | "powerOutput"
  | "gateTransitTime"
  | "fuelPerJump"
  | "enemyMissileAccuracy"
  | "shipBuildTime"
  | "populationGrowth"
  | "populationCap"
  | "foodOutput"
  | "stationSlots"
  | "workersPerBuilding"
  | "transportEfficiency"
  | "fleetUpkeep"
  | "distancePenalty"
  | "foreignnessDecay";
type GlobalAdditiveStat = "adminCapacity";

export class TechModifierCache {
  private recipeOutputMultipliers: Float64Array;
  private recipeInputMultipliers: Float64Array;
  private recipeDurationMultipliers: Float64Array;
  private recipeWorkersMultipliers: Float64Array;
  private moduleDamageMultipliers: Float64Array;
  private moduleThrustMultipliers: Float64Array;
  private moduleArmorRatingMultipliers: Float64Array;
  private moduleShieldHpMultipliers: Float64Array;
  private moduleCargoMultipliers: Float64Array;
  private moduleCostMultipliers: Float64Array;
  private energyStorageMultipliers: Float64Array;
  private powerOutputMultipliers: Float64Array;
  private gateTransitTimeMultipliers: Float64Array;
  private fuelPerJumpMultipliers: Float64Array;
  private enemyMissileAccuracyMultipliers: Float64Array;
  private shipBuildTimeMultipliers: Float64Array;
  private populationGrowthMultipliers: Float64Array;
  private populationCapMultipliers: Float64Array;
  private stationSlotsMultipliers: Float64Array;
  private transportEfficiencyMultipliers: Float64Array;
  private fleetUpkeepMultipliers: Float64Array;
  private distancePenaltyMultipliers: Float64Array;
  private foreignnessDecayMultipliers: Float64Array;
  private adminCapacityAdditions: Float64Array;
  private factionCount = 0;
  private recomputations = 0;

  private constructor(
    private readonly recipeCount: number,
    private readonly moduleCount: number
  ) {
    this.recipeOutputMultipliers = new Float64Array(0);
    this.recipeInputMultipliers = new Float64Array(0);
    this.recipeDurationMultipliers = new Float64Array(0);
    this.recipeWorkersMultipliers = new Float64Array(0);
    this.moduleDamageMultipliers = new Float64Array(0);
    this.moduleThrustMultipliers = new Float64Array(0);
    this.moduleArmorRatingMultipliers = new Float64Array(0);
    this.moduleShieldHpMultipliers = new Float64Array(0);
    this.moduleCargoMultipliers = new Float64Array(0);
    this.moduleCostMultipliers = new Float64Array(0);
    this.energyStorageMultipliers = new Float64Array(0);
    this.powerOutputMultipliers = new Float64Array(0);
    this.gateTransitTimeMultipliers = new Float64Array(0);
    this.fuelPerJumpMultipliers = new Float64Array(0);
    this.enemyMissileAccuracyMultipliers = new Float64Array(0);
    this.shipBuildTimeMultipliers = new Float64Array(0);
    this.populationGrowthMultipliers = new Float64Array(0);
    this.populationCapMultipliers = new Float64Array(0);
    this.stationSlotsMultipliers = new Float64Array(0);
    this.transportEfficiencyMultipliers = new Float64Array(0);
    this.fleetUpkeepMultipliers = new Float64Array(0);
    this.distancePenaltyMultipliers = new Float64Array(0);
    this.foreignnessDecayMultipliers = new Float64Array(0);
    this.adminCapacityAdditions = new Float64Array(0);
  }

  public static create(
    data: StageOneData,
    graph: TechGraph,
    factionCapacity = 0
  ): TechModifierCache {
    validateAllModifiers(data, graph);
    const cache = new TechModifierCache(data.batchRecipes.length, data.modules.length);
    cache.ensureFactionRows(factionCapacity);
    return cache;
  }

  public ensureFactionRows(required: number): void {
    if (required <= this.factionCount) return;
    const oldCount = this.factionCount;
    this.factionCount = required;
    this.recipeOutputMultipliers = resizeMultipliers(
      this.recipeOutputMultipliers,
      oldCount,
      required,
      this.recipeCount
    );
    this.recipeInputMultipliers = resizeMultipliers(
      this.recipeInputMultipliers,
      oldCount,
      required,
      this.recipeCount
    );
    this.recipeDurationMultipliers = resizeMultipliers(
      this.recipeDurationMultipliers,
      oldCount,
      required,
      this.recipeCount
    );
    this.recipeWorkersMultipliers = resizeMultipliers(
      this.recipeWorkersMultipliers,
      oldCount,
      required,
      this.recipeCount
    );
    this.moduleDamageMultipliers = resizeMultipliers(
      this.moduleDamageMultipliers,
      oldCount,
      required,
      this.moduleCount
    );
    this.moduleThrustMultipliers = resizeMultipliers(
      this.moduleThrustMultipliers,
      oldCount,
      required,
      this.moduleCount
    );
    this.moduleArmorRatingMultipliers = resizeMultipliers(
      this.moduleArmorRatingMultipliers,
      oldCount,
      required,
      this.moduleCount
    );
    this.moduleShieldHpMultipliers = resizeMultipliers(
      this.moduleShieldHpMultipliers,
      oldCount,
      required,
      this.moduleCount
    );
    this.moduleCargoMultipliers = resizeMultipliers(
      this.moduleCargoMultipliers,
      oldCount,
      required,
      this.moduleCount
    );
    this.moduleCostMultipliers = resizeMultipliers(
      this.moduleCostMultipliers,
      oldCount,
      required,
      this.moduleCount
    );
    this.energyStorageMultipliers = resizeScalarMultipliers(
      this.energyStorageMultipliers,
      oldCount,
      required
    );
    this.powerOutputMultipliers = resizeScalarMultipliers(
      this.powerOutputMultipliers,
      oldCount,
      required
    );
    this.gateTransitTimeMultipliers = resizeScalarMultipliers(
      this.gateTransitTimeMultipliers,
      oldCount,
      required
    );
    this.fuelPerJumpMultipliers = resizeScalarMultipliers(
      this.fuelPerJumpMultipliers,
      oldCount,
      required
    );
    this.enemyMissileAccuracyMultipliers = resizeScalarMultipliers(
      this.enemyMissileAccuracyMultipliers,
      oldCount,
      required
    );
    this.shipBuildTimeMultipliers = resizeScalarMultipliers(
      this.shipBuildTimeMultipliers,
      oldCount,
      required
    );
    this.populationGrowthMultipliers = resizeScalarMultipliers(
      this.populationGrowthMultipliers,
      oldCount,
      required
    );
    this.populationCapMultipliers = resizeScalarMultipliers(
      this.populationCapMultipliers,
      oldCount,
      required
    );
    this.stationSlotsMultipliers = resizeScalarMultipliers(
      this.stationSlotsMultipliers,
      oldCount,
      required
    );
    this.transportEfficiencyMultipliers = resizeScalarMultipliers(
      this.transportEfficiencyMultipliers,
      oldCount,
      required
    );
    this.fleetUpkeepMultipliers = resizeScalarMultipliers(
      this.fleetUpkeepMultipliers,
      oldCount,
      required
    );
    this.distancePenaltyMultipliers = resizeScalarMultipliers(
      this.distancePenaltyMultipliers,
      oldCount,
      required
    );
    this.foreignnessDecayMultipliers = resizeScalarMultipliers(
      this.foreignnessDecayMultipliers,
      oldCount,
      required
    );
    this.adminCapacityAdditions = resizeScalarAdditions(
      this.adminCapacityAdditions,
      oldCount,
      required
    );
  }

  public recalculateFaction(
    data: StageOneData,
    techState: FactionTechState,
    faction: number
  ): void {
    this.ensureFactionRows(faction + 1);
    this.resetFaction(faction);
    for (let techIndex = 0; techIndex < data.techs.length; techIndex += 1) {
      const level = techState.level(techIndex, faction);
      if (level <= 0) continue;
      const tech = data.techs[techIndex];
      if (tech === undefined) throw new RangeError("Technology table is inconsistent.");
      const effects = tech.repeatable ? tech.effectPerLevel : tech.effects;
      for (let i = 0; i < effects.length; i += 1) {
        const effect = effects[i];
        if (effect?.type !== "modifier") continue;
        this.applyModifier(data, faction, effect, tech.repeatable ? level : 1);
      }
    }
    this.recomputations += 1;
  }

  public stats(): TechModifierCacheStats {
    return { recomputations: this.recomputations };
  }

  public outputMultiplier(faction: number, recipe: number): number {
    return this.recipeOutputMultipliers[this.recipeOffset(faction, recipe)] ?? 1;
  }

  public inputMultiplier(faction: number, recipe: number): number {
    return this.recipeInputMultipliers[this.recipeOffset(faction, recipe)] ?? 1;
  }

  public durationMultiplier(faction: number, recipe: number): number {
    return this.recipeDurationMultipliers[this.recipeOffset(faction, recipe)] ?? 1;
  }

  public workersMultiplier(faction: number, recipe: number): number {
    return this.recipeWorkersMultipliers[this.recipeOffset(faction, recipe)] ?? 1;
  }

  public moduleStatMultiplier(faction: number, module: number, stat: ModuleStat): number {
    const offset = this.moduleOffset(faction, module);
    if (stat === "damage") return this.moduleDamageMultipliers[offset] ?? 1;
    if (stat === "thrust") return this.moduleThrustMultipliers[offset] ?? 1;
    if (stat === "armorRating") return this.moduleArmorRatingMultipliers[offset] ?? 1;
    if (stat === "shieldHp") return this.moduleShieldHpMultipliers[offset] ?? 1;
    if (stat === "cargo") return this.moduleCargoMultipliers[offset] ?? 1;
    return this.moduleCostMultipliers[offset] ?? 1;
  }

  public globalMultiplier(faction: number, stat: GlobalMultiplierStat): number {
    if (stat === "energyStorage") return this.energyStorageMultipliers[faction] ?? 1;
    if (stat === "powerOutput") return this.powerOutputMultipliers[faction] ?? 1;
    if (stat === "gateTransitTime") return this.gateTransitTimeMultipliers[faction] ?? 1;
    if (stat === "fuelPerJump") return this.fuelPerJumpMultipliers[faction] ?? 1;
    if (stat === "enemyMissileAccuracy") {
      return this.enemyMissileAccuracyMultipliers[faction] ?? 1;
    }
    if (stat === "shipBuildTime") return this.shipBuildTimeMultipliers[faction] ?? 1;
    if (stat === "populationGrowth") return this.populationGrowthMultipliers[faction] ?? 1;
    if (stat === "populationCap") return this.populationCapMultipliers[faction] ?? 1;
    if (stat === "foodOutput") return 1;
    if (stat === "stationSlots") return this.stationSlotsMultipliers[faction] ?? 1;
    if (stat === "workersPerBuilding") return this.recipeWorkersMultipliers.length > 0 ? 1 : 1;
    if (stat === "transportEfficiency") return this.transportEfficiencyMultipliers[faction] ?? 1;
    if (stat === "fleetUpkeep") return this.fleetUpkeepMultipliers[faction] ?? 1;
    if (stat === "distancePenalty") return this.distancePenaltyMultipliers[faction] ?? 1;
    return this.foreignnessDecayMultipliers[faction] ?? 1;
  }

  public globalAddition(faction: number, stat: GlobalAdditiveStat): number {
    if (stat === "adminCapacity") return this.adminCapacityAdditions[faction] ?? 0;
    return 0;
  }

  public effectiveOutputAmount(
    data: StageOneData,
    faction: number,
    recipe: number,
    output: ResourceAmount
  ): number {
    return (
      output.amount *
      this.outputMultiplier(faction, recipe) *
      foodOutputMultiplier(data, faction, output, this)
    );
  }

  public effectiveInputAmount(input: ResourceAmount, faction: number, recipe: number): number {
    return input.amount * this.inputMultiplier(faction, recipe);
  }

  public effectiveDurationTicks(data: StageOneData, faction: number, recipe: number): number {
    const base = data.batchRecipes[recipe]?.durationTicks ?? 1;
    return Math.max(1, Math.ceil(base * this.durationMultiplier(faction, recipe)));
  }

  public effectiveRecipeUnitCost(
    data: StageOneData,
    faction: number,
    recipeIndex: number,
    resource: number
  ): number {
    const recipe = data.batchRecipes[recipeIndex];
    if (recipe === undefined) throw new RangeError("Batch recipe table is inconsistent.");
    let inputValue = 0;
    for (let i = 0; i < recipe.inputs.length; i += 1) {
      const input = recipe.inputs[i];
      if (input === undefined) throw new RangeError("Recipe input bag is inconsistent.");
      inputValue +=
        this.effectiveInputAmount(input, faction, recipeIndex) *
        (data.baseValue[input.resource] ?? 1);
    }
    const output = outputAmount(data, this, faction, recipeIndex, recipe.outputs, resource);
    return inputValue / Math.max(0.000001, output);
  }

  private resetFaction(faction: number): void {
    resetWindow(this.recipeOutputMultipliers, faction, this.recipeCount, 1);
    resetWindow(this.recipeInputMultipliers, faction, this.recipeCount, 1);
    resetWindow(this.recipeDurationMultipliers, faction, this.recipeCount, 1);
    resetWindow(this.recipeWorkersMultipliers, faction, this.recipeCount, 1);
    resetWindow(this.moduleDamageMultipliers, faction, this.moduleCount, 1);
    resetWindow(this.moduleThrustMultipliers, faction, this.moduleCount, 1);
    resetWindow(this.moduleArmorRatingMultipliers, faction, this.moduleCount, 1);
    resetWindow(this.moduleShieldHpMultipliers, faction, this.moduleCount, 1);
    resetWindow(this.moduleCargoMultipliers, faction, this.moduleCount, 1);
    resetWindow(this.moduleCostMultipliers, faction, this.moduleCount, 1);
    this.energyStorageMultipliers[faction] = 1;
    this.powerOutputMultipliers[faction] = 1;
    this.gateTransitTimeMultipliers[faction] = 1;
    this.fuelPerJumpMultipliers[faction] = 1;
    this.enemyMissileAccuracyMultipliers[faction] = 1;
    this.shipBuildTimeMultipliers[faction] = 1;
    this.populationGrowthMultipliers[faction] = 1;
    this.populationCapMultipliers[faction] = 1;
    this.stationSlotsMultipliers[faction] = 1;
    this.transportEfficiencyMultipliers[faction] = 1;
    this.fleetUpkeepMultipliers[faction] = 1;
    this.distancePenaltyMultipliers[faction] = 1;
    this.foreignnessDecayMultipliers[faction] = 1;
    this.adminCapacityAdditions[faction] = 0;
  }

  private applyModifier(
    data: StageOneData,
    faction: number,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    const target = splitTarget(effect.target);
    if (target.kind === "recipe") {
      const recipe = data.batchRecipeIndex.get(target.id);
      if (recipe === undefined)
        throw new RangeError(`Unknown recipe modifier target "${effect.target}".`);
      this.applyRecipeModifier(data, faction, recipe, recipeStat(effect.stat), effect, levels);
    } else if (target.kind === "building") {
      const building = data.buildingIndex.get(target.id);
      if (building === undefined)
        throw new RangeError(`Unknown building modifier target "${effect.target}".`);
      this.applyBuildingModifier(data, faction, target.id, recipeStat(effect.stat), effect, levels);
    } else if (target.kind === "module") {
      const module = data.moduleIndex.get(target.id);
      if (module === undefined)
        throw new RangeError(`Unknown module modifier target "${effect.target}".`);
      this.applyModuleModifier(faction, module, moduleStat(effect.stat), effect, levels);
    } else if (target.kind === "family") {
      if (isEconomicRecipeFamily(data, target.id)) {
        this.applyEconomicFamilyModifier(
          data,
          faction,
          target.id,
          recipeStat(effect.stat),
          effect,
          levels
        );
      } else {
        this.applyFamilyModifier(data, faction, target.id, moduleStat(effect.stat), effect, levels);
      }
    } else if (target.kind === "global") {
      this.applyGlobalModifier(data, faction, effect, levels);
    } else {
      throw new RangeError(`Unknown modifier target "${effect.target}".`);
    }
  }

  private applyRecipeModifier(
    data: StageOneData,
    faction: number,
    recipe: number,
    stat: RecipeStat,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    const multiplier = multiplierValue(effect, levels);
    if (stat === "outputMultiplier" || stat === "recipeOutput") {
      this.multiplyRecipe(this.recipeOutputMultipliers, faction, recipe, multiplier);
    } else if (stat === "inputMultiplier") {
      this.multiplyRecipe(this.recipeInputMultipliers, faction, recipe, multiplier);
    } else if (stat === "durationMultiplier") {
      this.multiplyRecipe(this.recipeDurationMultipliers, faction, recipe, multiplier);
    } else if (stat === "workersMultiplier") {
      this.multiplyRecipe(this.recipeWorkersMultipliers, faction, recipe, multiplier);
    }
    void data;
  }

  private applyBuildingModifier(
    data: StageOneData,
    faction: number,
    buildingId: string,
    stat: RecipeStat,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    for (let recipe = 0; recipe < data.batchRecipes.length; recipe += 1) {
      if (data.batchRecipes[recipe]?.buildingId === buildingId) {
        this.applyRecipeModifier(data, faction, recipe, stat, effect, levels);
      }
    }
  }

  private applyFamilyModifier(
    data: StageOneData,
    faction: number,
    family: string,
    stat: ModuleStat,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    let matched = false;
    for (let module = 0; module < data.modules.length; module += 1) {
      if (data.modules[module]?.family !== family) continue;
      matched = true;
      this.applyModuleModifier(faction, module, stat, effect, levels);
    }
    if (!matched) throw new RangeError(`Unknown module family modifier target "family:${family}".`);
  }

  private applyEconomicFamilyModifier(
    data: StageOneData,
    faction: number,
    family: string,
    stat: RecipeStat,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    let matched = false;
    for (let recipe = 0; recipe < data.batchRecipes.length; recipe += 1) {
      if (!recipeIsInEconomicFamily(data, recipe, family)) continue;
      matched = true;
      this.applyRecipeModifier(data, faction, recipe, stat, effect, levels);
    }
    if (!matched) throw new RangeError(`Unknown recipe family modifier target "family:${family}".`);
  }

  private applyModuleModifier(
    faction: number,
    module: number,
    stat: ModuleStat,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    const multiplier = multiplierValue(effect, levels);
    if (stat === "damage")
      this.multiplyModule(this.moduleDamageMultipliers, faction, module, multiplier);
    else if (stat === "thrust")
      this.multiplyModule(this.moduleThrustMultipliers, faction, module, multiplier);
    else if (stat === "armorRating")
      this.multiplyModule(this.moduleArmorRatingMultipliers, faction, module, multiplier);
    else if (stat === "shieldHp")
      this.multiplyModule(this.moduleShieldHpMultipliers, faction, module, multiplier);
    else if (stat === "cargo")
      this.multiplyModule(this.moduleCargoMultipliers, faction, module, multiplier);
    else this.multiplyModule(this.moduleCostMultipliers, faction, module, multiplier);
  }

  private applyGlobalModifier(
    data: StageOneData,
    faction: number,
    effect: StageOneTechEffect,
    levels: number
  ): void {
    const stat = globalStat(effect.stat);
    if (stat === "adminCapacity") {
      this.adminCapacityAdditions[faction] =
        (this.adminCapacityAdditions[faction] ?? 0) + effect.value * levels;
      return;
    }
    const multiplier = multiplierValue(effect, levels);
    if (stat === "recipeOutput") {
      for (let recipe = 0; recipe < data.batchRecipes.length; recipe += 1) {
        this.multiplyRecipe(this.recipeOutputMultipliers, faction, recipe, multiplier);
      }
    } else if (stat === "foodOutput") {
      for (let recipe = 0; recipe < data.batchRecipes.length; recipe += 1) {
        if (recipeOutputsResourceId(data, recipe, "food")) {
          this.multiplyRecipe(this.recipeOutputMultipliers, faction, recipe, multiplier);
        }
      }
    } else if (stat === "powerOutput") {
      this.multiplyScalar(this.powerOutputMultipliers, faction, multiplier);
    } else if (stat === "energyStorage") {
      this.multiplyScalar(this.energyStorageMultipliers, faction, multiplier);
    } else if (stat === "gateTransitTime") {
      this.multiplyScalar(this.gateTransitTimeMultipliers, faction, multiplier);
    } else if (stat === "fuelPerJump") {
      this.multiplyScalar(this.fuelPerJumpMultipliers, faction, multiplier);
    } else if (stat === "enemyMissileAccuracy") {
      this.multiplyScalar(this.enemyMissileAccuracyMultipliers, faction, multiplier);
    } else if (stat === "shipBuildTime") {
      this.multiplyScalar(this.shipBuildTimeMultipliers, faction, multiplier);
    } else if (stat === "populationGrowth") {
      this.multiplyScalar(this.populationGrowthMultipliers, faction, multiplier);
    } else if (stat === "populationCap") {
      this.multiplyScalar(this.populationCapMultipliers, faction, multiplier);
    } else if (stat === "stationSlots") {
      this.multiplyScalar(this.stationSlotsMultipliers, faction, multiplier);
    } else if (stat === "workersPerBuilding") {
      for (let recipe = 0; recipe < data.batchRecipes.length; recipe += 1) {
        this.multiplyRecipe(this.recipeWorkersMultipliers, faction, recipe, multiplier);
      }
    } else if (stat === "transportEfficiency") {
      this.multiplyScalar(this.transportEfficiencyMultipliers, faction, multiplier);
    } else if (stat === "fleetUpkeep") {
      this.multiplyScalar(this.fleetUpkeepMultipliers, faction, multiplier);
    } else if (stat === "distancePenalty") {
      this.multiplyScalar(this.distancePenaltyMultipliers, faction, multiplier);
    } else {
      this.multiplyScalar(this.foreignnessDecayMultipliers, faction, multiplier);
    }
  }

  private multiplyRecipe(
    values: Float64Array,
    faction: number,
    recipe: number,
    multiplier: number
  ): void {
    const offset = this.recipeOffset(faction, recipe);
    values[offset] = (values[offset] ?? 1) * multiplier;
  }

  private multiplyModule(
    values: Float64Array,
    faction: number,
    module: number,
    multiplier: number
  ): void {
    const offset = this.moduleOffset(faction, module);
    values[offset] = (values[offset] ?? 1) * multiplier;
  }

  private multiplyScalar(values: Float64Array, faction: number, multiplier: number): void {
    values[faction] = (values[faction] ?? 1) * multiplier;
  }

  private recipeOffset(faction: number, recipe: number): number {
    return faction * this.recipeCount + recipe;
  }

  private moduleOffset(faction: number, module: number): number {
    return faction * this.moduleCount + module;
  }
}

export function refreshFactionBuildingWorkers(
  data: StageOneData,
  world: {
    readonly bodies: { readonly owner: Int32Array };
    readonly buildings: {
      readonly length: number;
      readonly body: Uint32Array;
      readonly type: Uint16Array;
      readonly workersRequired: Float64Array;
    };
    readonly techModifiers: TechModifierCache;
  },
  faction: number
): void {
  for (let building = 0; building < world.buildings.length; building += 1) {
    const body = world.buildings.body[building] ?? 0;
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const type = world.buildings.type[building] ?? -1;
    const recipe = data.buildings[type]?.batchRecipe ?? -1;
    const base = data.buildings[type]?.workers ?? 0;
    world.buildings.workersRequired[building] =
      recipe >= 0 ? base * world.techModifiers.workersMultiplier(faction, recipe) : base;
  }
}

export function validateAllModifiers(data: StageOneData, _graph?: TechGraph): void {
  for (let techIndex = 0; techIndex < data.techs.length; techIndex += 1) {
    const tech = data.techs[techIndex];
    if (tech === undefined) throw new RangeError("Technology table is inconsistent.");
    validateEffectList(data, tech.effects);
    validateEffectList(data, tech.effectPerLevel);
  }
}

function validateEffectList(data: StageOneData, effects: readonly StageOneTechEffect[]): void {
  for (let i = 0; i < effects.length; i += 1) {
    const effect = effects[i];
    if (effect?.type === "modifier") validateModifier(data, effect);
  }
}

function validateModifier(data: StageOneData, effect: StageOneTechEffect): void {
  const target = splitTarget(effect.target);
  if (target.kind === "recipe") {
    if (!data.batchRecipeIndex.has(target.id))
      throw new RangeError(`Unknown modifier target "${effect.target}".`);
    recipeStat(effect.stat);
  } else if (target.kind === "building") {
    if (!data.buildingIndex.has(target.id))
      throw new RangeError(`Unknown modifier target "${effect.target}".`);
    recipeStat(effect.stat);
  } else if (target.kind === "module") {
    if (!data.moduleIndex.has(target.id))
      throw new RangeError(`Unknown modifier target "${effect.target}".`);
    moduleStat(effect.stat);
  } else if (target.kind === "family") {
    let matched = false;
    for (let module = 0; module < data.modules.length; module += 1) {
      if (data.modules[module]?.family === target.id) matched = true;
    }
    if (matched) {
      moduleStat(effect.stat);
      return;
    }
    if (isEconomicRecipeFamily(data, target.id)) {
      recipeStat(effect.stat);
      return;
    }
    throw new RangeError(`Unknown modifier target "${effect.target}".`);
  } else if (target.kind === "global") {
    globalStat(effect.stat);
  } else {
    throw new RangeError(`Unknown modifier target "${effect.target}".`);
  }
}

function splitTarget(target: string): { readonly kind: string; readonly id: string } {
  if (target === "global") return { kind: "global", id: "" };
  const colon = target.indexOf(":");
  if (colon <= 0) return { kind: "", id: target };
  return { kind: target.slice(0, colon), id: target.slice(colon + 1) };
}

function recipeStat(stat: string): RecipeStat {
  if (
    stat === "outputMultiplier" ||
    stat === "inputMultiplier" ||
    stat === "durationMultiplier" ||
    stat === "workersMultiplier" ||
    stat === "recipeOutput"
  ) {
    return stat;
  }
  throw new RangeError(`Unknown recipe modifier stat "${stat}".`);
}

function moduleStat(stat: string): ModuleStat {
  if (
    stat === "damage" ||
    stat === "thrust" ||
    stat === "armorRating" ||
    stat === "shieldHp" ||
    stat === "cargo" ||
    stat === "cost"
  ) {
    return stat;
  }
  throw new RangeError(`Unknown module modifier stat "${stat}".`);
}

function globalStat(stat: string): RecipeStat | GlobalMultiplierStat | GlobalAdditiveStat {
  if (stat === "recipeOutput") return stat;
  if (stat === "adminCapacity") return stat;
  if (
    stat === "energyStorage" ||
    stat === "powerOutput" ||
    stat === "gateTransitTime" ||
    stat === "fuelPerJump" ||
    stat === "enemyMissileAccuracy" ||
    stat === "shipBuildTime" ||
    stat === "populationGrowth" ||
    stat === "populationCap" ||
    stat === "foodOutput" ||
    stat === "stationSlots" ||
    stat === "workersPerBuilding" ||
    stat === "transportEfficiency" ||
    stat === "fleetUpkeep" ||
    stat === "distancePenalty" ||
    stat === "foreignnessDecay"
  ) {
    return stat;
  }
  throw new RangeError(`Unknown global modifier stat "${stat}".`);
}

function multiplierValue(effect: StageOneTechEffect, levels: number): number {
  // Stage 5.3: all multiplier composition is multiplicative and repeatables apply
  // the same multiplier per level, while additive stats use explicit addition.
  return levels <= 1 ? effect.value : repeatableEffectMultiplier(effect.value, levels);
}

function resizeMultipliers(
  previous: Float64Array,
  oldCount: number,
  nextCount: number,
  width: number
): Float64Array {
  const next = new Float64Array(Math.max(0, nextCount * width));
  next.fill(1);
  for (let faction = 0; faction < oldCount; faction += 1) {
    const oldStart = faction * width;
    const nextStart = faction * width;
    next.set(previous.slice(oldStart, oldStart + width), nextStart);
  }
  return next;
}

function resizeScalarMultipliers(
  previous: Float64Array,
  oldCount: number,
  nextCount: number
): Float64Array {
  const next = new Float64Array(nextCount);
  next.fill(1);
  next.set(previous.slice(0, oldCount));
  return next;
}

function resizeScalarAdditions(
  previous: Float64Array,
  oldCount: number,
  nextCount: number
): Float64Array {
  const next = new Float64Array(nextCount);
  next.set(previous.slice(0, oldCount));
  return next;
}

function resetWindow(values: Float64Array, faction: number, width: number, value: number): void {
  const start = faction * width;
  values.fill(value, start, start + width);
}

function recipeOutputsResourceId(data: StageOneData, recipe: number, resourceId: string): boolean {
  const resource = data.resourceIndex.get(resourceId);
  if (resource === undefined) return false;
  const outputs = data.batchRecipes[recipe]?.outputs ?? [];
  for (let i = 0; i < outputs.length; i += 1) {
    if (outputs[i]?.resource === resource) return true;
  }
  return false;
}

function isEconomicRecipeFamily(data: StageOneData, family: string): boolean {
  for (let recipe = 0; recipe < data.batchRecipes.length; recipe += 1) {
    if (recipeIsInEconomicFamily(data, recipe, family)) return true;
  }
  return false;
}

function recipeIsInEconomicFamily(data: StageOneData, recipe: number, family: string): boolean {
  if (family !== "extraction") return false;
  const item = data.batchRecipes[recipe];
  if (item === undefined) return false;
  const buildingId = item.buildingId;
  if (
    buildingId.includes("mine") ||
    buildingId.includes("drill") ||
    buildingId.includes("collector") ||
    buildingId.includes("quarry") ||
    buildingId.includes("farm")
  ) {
    return true;
  }
  for (let i = 0; i < item.outputs.length; i += 1) {
    const resource = data.resources[item.outputs[i]?.resource ?? -1];
    if (resource?.category === "raw") return true;
  }
  return false;
}

function foodOutputMultiplier(
  _data: StageOneData,
  _faction: number,
  _output: ResourceAmount,
  _cache: TechModifierCache
): number {
  return 1;
}

function outputAmount(
  data: StageOneData,
  cache: TechModifierCache,
  faction: number,
  recipeIndex: number,
  outputs: readonly ResourceAmount[],
  resource: number
): number {
  for (let i = 0; i < outputs.length; i += 1) {
    const output = outputs[i];
    if (output?.resource === resource) {
      return cache.effectiveOutputAmount(data, faction, recipeIndex, output);
    }
  }
  return 0;
}

export function moduleCost(
  data: StageOneData,
  cache: TechModifierCache | undefined,
  faction: number,
  module: StageOneModule
): number {
  let cost = 0;
  const moduleIndex = data.moduleIndex.get(module.id) ?? -1;
  const multiplier =
    cache === undefined || moduleIndex < 0
      ? 1
      : cache.moduleStatMultiplier(faction, moduleIndex, "cost");
  for (let i = 0; i < module.cost.length; i += 1) {
    const item = module.cost[i];
    if (item === undefined) throw new RangeError("Module cost bag is inconsistent.");
    cost += item.amount * (data.baseValue[item.resource] ?? 1) * multiplier;
  }
  return cost;
}
