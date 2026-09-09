import type { StageOneData, StageOneTech, StageOneTechEffect } from "../stage-one/data.js";

export interface TechGraphValidation {
  readonly cycles: readonly string[][];
  readonly unreachable: readonly string[];
  readonly duplicateUnlocks: readonly string[];
  readonly missingUnlocks: readonly string[];
  readonly bootstrapMissing: readonly string[];
}

export class TechGraph {
  public readonly prerequisites: readonly (readonly number[])[];
  public readonly dependents: readonly (readonly number[])[];
  public readonly branchNodes: readonly (readonly number[])[];
  public readonly validation: TechGraphValidation;
  public readonly startTech: number;

  public constructor(
    public readonly data: StageOneData,
    prerequisites: readonly (readonly number[])[],
    dependents: readonly (readonly number[])[],
    branchNodes: readonly (readonly number[])[],
    validation: TechGraphValidation,
    startTech: number
  ) {
    this.prerequisites = prerequisites;
    this.dependents = dependents;
    this.branchNodes = branchNodes;
    this.validation = validation;
    this.startTech = startTech;
  }

  public static create(data: StageOneData): TechGraph {
    const prerequisites = buildPrerequisites(data);
    const dependents = buildDependents(data, prerequisites);
    const branchNodes = buildBranchNodes(data);
    const startTech = data.techIndex.get("start") ?? -1;
    if (data.techs.length === 0) {
      return new TechGraph(data, prerequisites, dependents, branchNodes, emptyValidation(), -1);
    }
    const validation = validateGraph(data, prerequisites, startTech);
    if (hasValidationErrors(validation)) {
      throw new TechGraphError(formatValidation(validation));
    }
    return new TechGraph(data, prerequisites, dependents, branchNodes, validation, startTech);
  }

  public techIndex(id: string): number {
    const index = this.data.techIndex.get(id);
    if (index === undefined) throw new RangeError(`Unknown technology "${id}".`);
    return index;
  }

  public tech(idOrIndex: string | number): StageOneTech {
    const index = typeof idOrIndex === "string" ? this.techIndex(idOrIndex) : idOrIndex;
    const tech = this.data.techs[index];
    if (tech === undefined) throw new RangeError(`Unknown technology index ${index}.`);
    return tech;
  }
}

function emptyValidation(): TechGraphValidation {
  return {
    cycles: [],
    unreachable: [],
    duplicateUnlocks: [],
    missingUnlocks: [],
    bootstrapMissing: []
  };
}

export class TechGraphError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TechGraphError";
  }
}

export function prereqClosure(graph: TechGraph, techId: string): readonly string[] {
  const out: string[] = [];
  const seen = new Uint8Array(graph.data.techs.length);
  const stack: number[] = [graph.techIndex(techId)];
  while (stack.length > 0) {
    const current = stack.pop() ?? -1;
    if (current < 0 || seen[current] === 1) continue;
    seen[current] = 1;
    const id = graph.data.techs[current]?.id;
    if (id !== undefined && id !== "start") out.push(id);
    const deps = graph.prerequisites[current] ?? [];
    for (let i = deps.length - 1; i >= 0; i -= 1) stack.push(deps[i] ?? -1);
  }
  return out;
}

export function startProducibleResources(data: StageOneData, graph: TechGraph): Uint8Array {
  const producible = new Uint8Array(data.resources.length);
  if (data.energyResource >= 0) producible[data.energyResource] = 1;

  const startBuildings = new Uint8Array(data.buildings.length);
  if (graph.startTech >= 0) {
    const start = graph.data.techs[graph.startTech];
    for (let i = 0; i < (start?.effects.length ?? 0); i += 1) {
      const effect = start?.effects[i];
      if (effect?.type !== "unlockBuilding") continue;
      const building = data.buildingIndex.get(effect.id);
      if (building !== undefined) startBuildings[building] = 1;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let recipeIndex = 0; recipeIndex < data.batchRecipes.length; recipeIndex += 1) {
      const recipe = data.batchRecipes[recipeIndex];
      if (recipe === undefined) throw new RangeError("Batch recipe table is inconsistent.");
      const building = data.buildingIndex.get(recipe.buildingId);
      if (building === undefined || startBuildings[building] !== 1) continue;
      if (!inputsProducible(recipe.inputs, producible)) continue;
      for (let i = 0; i < recipe.outputs.length; i += 1) {
        const output = recipe.outputs[i];
        if (output === undefined) throw new RangeError("Recipe output bag is inconsistent.");
        if (producible[output.resource] !== 1) {
          producible[output.resource] = 1;
          changed = true;
        }
      }
    }
  }
  return producible;
}

function buildPrerequisites(data: StageOneData): readonly (readonly number[])[] {
  const result: number[][] = [];
  for (let i = 0; i < data.techs.length; i += 1) {
    const tech = data.techs[i];
    if (tech === undefined) throw new RangeError("Technology table is inconsistent.");
    const deps: number[] = [];
    for (let j = 0; j < tech.requires.length; j += 1) {
      const dep = tech.requires[j] ?? "";
      const index = data.techIndex.get(dep);
      if (index === undefined) throw new TechGraphError(`${tech.id}: unknown prerequisite ${dep}.`);
      deps.push(index);
    }
    deps.sort((a, b) => a - b);
    result.push(deps);
  }
  return result;
}

function buildDependents(
  data: StageOneData,
  prerequisites: readonly (readonly number[])[]
): readonly (readonly number[])[] {
  const result: number[][] = [];
  for (let i = 0; i < data.techs.length; i += 1) result.push([]);
  for (let tech = 0; tech < prerequisites.length; tech += 1) {
    const deps = prerequisites[tech] ?? [];
    for (let i = 0; i < deps.length; i += 1) result[deps[i] ?? 0]?.push(tech);
  }
  for (let i = 0; i < result.length; i += 1) result[i]?.sort((a, b) => a - b);
  return result;
}

function buildBranchNodes(data: StageOneData): readonly (readonly number[])[] {
  const result: number[][] = [];
  for (let i = 0; i < data.techBranches.length; i += 1) result.push([]);
  for (let techIndex = 0; techIndex < data.techs.length; techIndex += 1) {
    const tech = data.techs[techIndex];
    if (tech === undefined) throw new RangeError("Technology table is inconsistent.");
    const branch = data.techBranchIndex.get(tech.branch);
    if (branch === undefined)
      throw new TechGraphError(`${tech.id}: unknown branch ${tech.branch}.`);
    result[branch]?.push(techIndex);
  }
  for (let i = 0; i < result.length; i += 1) result[i]?.sort((a, b) => a - b);
  return result;
}

function validateGraph(
  data: StageOneData,
  prerequisites: readonly (readonly number[])[],
  startTech: number
): TechGraphValidation {
  const cycles = findCycles(data, prerequisites);
  const unreachable = findUnreachable(data, prerequisites, startTech);
  const unlocks = validateUnlocks(data);
  const bootstrapMissing = validateBootstrap(data, prerequisites, startTech);
  return {
    cycles,
    unreachable,
    duplicateUnlocks: unlocks.duplicateUnlocks,
    missingUnlocks: unlocks.missingUnlocks,
    bootstrapMissing
  };
}

function findCycles(
  data: StageOneData,
  prerequisites: readonly (readonly number[])[]
): readonly string[][] {
  const cycles: string[][] = [];
  const white = 0;
  const grey = 1;
  const black = 2;
  const colour = new Uint8Array(data.techs.length);
  const stack: number[] = [];

  function dfs(index: number): void {
    colour[index] = grey;
    stack.push(index);
    const deps = prerequisites[index] ?? [];
    for (let i = 0; i < deps.length; i += 1) {
      const dep = deps[i] ?? -1;
      if (dep < 0) continue;
      if (colour[dep] === grey) {
        const start = stack.indexOf(dep);
        const cycle: string[] = [];
        for (let j = Math.max(0, start); j < stack.length; j += 1) {
          cycle.push(data.techs[stack[j] ?? 0]?.id ?? "?");
        }
        cycle.push(data.techs[dep]?.id ?? "?");
        cycles.push(cycle);
      } else if (colour[dep] === white) {
        dfs(dep);
      }
    }
    stack.pop();
    colour[index] = black;
  }

  for (let i = 0; i < data.techs.length; i += 1) {
    if (colour[i] === white) dfs(i);
  }
  return cycles;
}

function findUnreachable(
  data: StageOneData,
  prerequisites: readonly (readonly number[])[],
  startTech: number
): readonly string[] {
  if (data.techs.length === 0) return [];
  if (startTech < 0) return data.techs.map((tech) => tech.id);
  const reachable = new Uint8Array(data.techs.length);
  reachable[startTech] = 1;
  let changed = true;
  while (changed) {
    changed = false;
    for (let tech = 0; tech < data.techs.length; tech += 1) {
      if (reachable[tech] === 1) continue;
      const deps = prerequisites[tech] ?? [];
      if (deps.length === 0) continue;
      let ok = true;
      for (let i = 0; i < deps.length; i += 1) {
        if (reachable[deps[i] ?? -1] !== 1) ok = false;
      }
      if (ok) {
        reachable[tech] = 1;
        changed = true;
      }
    }
  }
  const out: string[] = [];
  for (let tech = 0; tech < data.techs.length; tech += 1) {
    if (reachable[tech] !== 1) out.push(data.techs[tech]?.id ?? `#${tech}`);
  }
  return out;
}

function validateUnlocks(data: StageOneData): {
  readonly duplicateUnlocks: readonly string[];
  readonly missingUnlocks: readonly string[];
} {
  const moduleUnlocks = new Int32Array(data.modules.length);
  const hullUnlocks = new Int32Array(data.hulls.length);
  const buildingUnlocks = new Int32Array(data.buildings.length);
  moduleUnlocks.fill(-1);
  hullUnlocks.fill(-1);
  buildingUnlocks.fill(-1);
  const duplicateUnlocks: string[] = [];
  const missingUnlocks: string[] = [];

  for (let techIndex = 0; techIndex < data.techs.length; techIndex += 1) {
    const tech = data.techs[techIndex];
    if (tech === undefined) throw new RangeError("Technology table is inconsistent.");
    for (let i = 0; i < tech.effects.length; i += 1) {
      recordUnlock(
        data,
        techIndex,
        tech.effects[i],
        moduleUnlocks,
        hullUnlocks,
        buildingUnlocks,
        duplicateUnlocks
      );
    }
  }

  for (let i = 0; i < data.modules.length; i += 1) {
    const item = data.modules[i];
    if (item?.phase === 1 && (moduleUnlocks[i] ?? -1) < 0) {
      missingUnlocks.push(`module:${item.id}`);
    }
  }
  for (let i = 0; i < data.hulls.length; i += 1) {
    const item = data.hulls[i];
    if (item?.phase === 1 && (hullUnlocks[i] ?? -1) < 0) {
      missingUnlocks.push(`hull:${item.id}`);
    }
  }
  for (let i = 0; i < data.buildings.length; i += 1) {
    const item = data.buildings[i];
    if (item !== undefined && (buildingUnlocks[i] ?? -1) < 0) {
      missingUnlocks.push(`building:${item.id}`);
    }
  }

  return { duplicateUnlocks, missingUnlocks };
}

function recordUnlock(
  data: StageOneData,
  techIndex: number,
  effect: StageOneTechEffect | undefined,
  moduleUnlocks: Int32Array,
  hullUnlocks: Int32Array,
  buildingUnlocks: Int32Array,
  duplicateUnlocks: string[]
): void {
  if (effect === undefined) return;
  if (effect.type === "unlockModule") {
    const index = data.moduleIndex.get(effect.id);
    if (index === undefined) throw new TechGraphError(`Unknown module unlock "${effect.id}".`);
    if ((moduleUnlocks[index] ?? -1) >= 0) duplicateUnlocks.push(`module:${effect.id}`);
    moduleUnlocks[index] = techIndex;
  } else if (effect.type === "unlockHull") {
    const index = data.hullIndex.get(effect.id);
    if (index === undefined) throw new TechGraphError(`Unknown hull unlock "${effect.id}".`);
    if ((hullUnlocks[index] ?? -1) >= 0) duplicateUnlocks.push(`hull:${effect.id}`);
    hullUnlocks[index] = techIndex;
  } else if (effect.type === "unlockBuilding") {
    const index = data.buildingIndex.get(effect.id);
    if (index === undefined) throw new TechGraphError(`Unknown building unlock "${effect.id}".`);
    if ((buildingUnlocks[index] ?? -1) >= 0) duplicateUnlocks.push(`building:${effect.id}`);
    buildingUnlocks[index] = techIndex;
  } else if (effect.type !== "modifier" && effect.type !== "ability") {
    throw new TechGraphError(`Unknown technology effect type "${effect.type}".`);
  }
}

function validateBootstrap(
  data: StageOneData,
  prerequisites: readonly (readonly number[])[],
  startTech: number
): readonly string[] {
  if (data.techs.length === 0 || startTech < 0) return [];
  const graph = new TechGraph(
    data,
    prerequisites,
    buildDependents(data, prerequisites),
    buildBranchNodes(data),
    {
      cycles: [],
      unreachable: [],
      duplicateUnlocks: [],
      missingUnlocks: [],
      bootstrapMissing: []
    },
    startTech
  );
  const producible = startProducibleResources(data, graph);
  const required = [
    "data_physics",
    "data_engineering",
    "data_bio",
    "food",
    "water",
    "medicine",
    "consumer_goods",
    "fuel"
  ];
  const missing: string[] = [];
  for (let i = 0; i < required.length; i += 1) {
    const id = required[i] ?? "";
    const resource = data.resourceIndex.get(id);
    if (resource !== undefined && producible[resource] !== 1) missing.push(id);
  }
  return missing;
}

function inputsProducible(
  inputs: readonly { readonly resource: number }[],
  producible: Uint8Array
): boolean {
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    if (input === undefined || producible[input.resource] !== 1) return false;
  }
  return true;
}

function hasValidationErrors(validation: TechGraphValidation): boolean {
  return (
    validation.cycles.length > 0 ||
    validation.unreachable.length > 0 ||
    validation.duplicateUnlocks.length > 0 ||
    validation.missingUnlocks.length > 0 ||
    validation.bootstrapMissing.length > 0
  );
}

function formatValidation(validation: TechGraphValidation): string {
  const parts: string[] = [];
  if (validation.cycles.length > 0) {
    parts.push(`cycles=${validation.cycles.map((cycle) => cycle.join("->")).join(",")}`);
  }
  if (validation.unreachable.length > 0) {
    parts.push(`unreachable=${validation.unreachable.join(",")}`);
  }
  if (validation.duplicateUnlocks.length > 0) {
    parts.push(`duplicateUnlocks=${validation.duplicateUnlocks.join(",")}`);
  }
  if (validation.missingUnlocks.length > 0) {
    parts.push(`missingUnlocks=${validation.missingUnlocks.join(",")}`);
  }
  if (validation.bootstrapMissing.length > 0) {
    parts.push(`bootstrapMissing=${validation.bootstrapMissing.join(",")}`);
  }
  return `Technology graph validation failed: ${parts.join("; ")}`;
}
