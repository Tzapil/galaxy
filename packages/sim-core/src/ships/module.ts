import type { StageOneData, StageOneModule } from "../stage-one/data.js";

export function moduleById(data: StageOneData, id: string): StageOneModule {
  const index = data.moduleIndex.get(id);
  if (index === undefined) throw new RangeError(`Unknown module "${id}".`);
  const module = data.modules[index];
  if (module === undefined) throw new RangeError(`Module index ${index} is missing.`);
  return module;
}

export function moduleBundleCost(data: StageOneData, module: StageOneModule): number {
  let cost = 0;
  for (let i = 0; i < module.cost.length; i += 1) {
    const item = module.cost[i];
    if (item === undefined) throw new RangeError("Module cost bag is inconsistent.");
    cost += item.amount * (data.baseValue[item.resource] ?? 1);
  }
  return cost;
}

export function hullBundleCost(
  data: StageOneData,
  hull: { readonly buildRecipe: readonly { readonly resource: number; readonly amount: number }[] }
): number {
  let cost = 0;
  for (let i = 0; i < hull.buildRecipe.length; i += 1) {
    const item = hull.buildRecipe[i];
    if (item === undefined) throw new RangeError("Hull build recipe is inconsistent.");
    cost += item.amount * (data.baseValue[item.resource] ?? 1);
  }
  return cost;
}

export function assertStageFiveModuleData(data: StageOneData): void {
  if (data.modules.length < 45) {
    throw new RangeError(`Stage 5 expects about 45 modules, got ${data.modules.length}.`);
  }
  for (let i = 0; i < data.modules.length; i += 1) {
    const module = data.modules[i];
    if (module === undefined) throw new RangeError("Module table is inconsistent.");
    if (module.mass < 0) throw new RangeError(`${module.id}: mass must be non-negative.`);
    if (module.crew < 0) throw new RangeError(`${module.id}: crew must be non-negative.`);
    if (module.damage > 0) {
      if (module.bands.length === 0) throw new RangeError(`${module.id}: weapon has no bands.`);
      if (module.vsShield < 0.6 || module.vsShield > 1.4) {
        throw new RangeError(`${module.id}: vsShield must be in 0.6..1.4.`);
      }
      if (module.vsArmor < 0.6 || module.vsArmor > 1.4) {
        throw new RangeError(`${module.id}: vsArmor must be in 0.6..1.4.`);
      }
    }
  }
}
