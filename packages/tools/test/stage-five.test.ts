import { beforeAll, describe, expect, it } from "vitest";

import {
  BodyType,
  GovernmentContracts,
  JobBoard,
  KitOrderState,
  MAX_REPEATABLE_TECH_LEVEL,
  Rng,
  RoutePlanner,
  ShipRole,
  ShipyardOrderState,
  StageOneWorld,
  TechGraph,
  addKitOrderContracts,
  advanceShipyards,
  armorReduction,
  assertStageFiveHullData,
  assertStageFiveModuleData,
  bestDesign,
  blueprintComponentRequirements,
  canRefitShip,
  calculateDesignStats,
  chooseResearchTopic,
  collectAndAdvanceResearch,
  computeEffectiveHitPoints,
  isModuleUnlocked,
  isResearchPathReachable,
  queueShipBuild,
  refitCost,
  refitShipAtShipyard,
  repeatableCostAtLevel,
  researchPathCost,
  researchRelevanceForBottleneck,
  resourceIndexOf,
  scoreDesign,
  speedScore,
  StageTwoSimulation,
  startProducibleResources,
  totalCost,
  validateAllModifiers,
  validateShipDesign,
  type BestDesignResult,
  type ShipDesign,
  type StageOneData,
  type StageOneTech
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "../src/stage-two-loader.js";

let data: StageOneData;

beforeAll(async () => {
  data = await loadStageTwoData();
});

describe("Stage 5 research and ship design", () => {
  it("loads a valid DAG with bootstrap science flow and Phase 1 ship data", () => {
    const graph = TechGraph.create(data);
    const producible = startProducibleResources(data, graph);

    expect(data.techs.length).toBe(94);
    expect(data.techBranches).toHaveLength(13);
    expect(data.techs.filter((tech) => tech.repeatable)).toHaveLength(13);
    expect(graph.validation.cycles).toEqual([]);
    expect(graph.validation.unreachable).toEqual([]);
    expect(graph.validation.duplicateUnlocks).toEqual([]);
    expect(graph.validation.missingUnlocks).toEqual([]);
    expect(graph.validation.bootstrapMissing).toEqual([]);
    expect(producible[resourceIndexOf(data.resourceIndex, "data_physics")]).toBe(1);
    expect(producible[resourceIndexOf(data.resourceIndex, "data_engineering")]).toBe(1);
    expect(producible[resourceIndexOf(data.resourceIndex, "data_bio")]).toBe(1);

    expect(() => assertStageFiveHullData(data)).not.toThrow();
    expect(() => assertStageFiveModuleData(data)).not.toThrow();
    expect(() => validateAllModifiers(data)).not.toThrow();
  });

  it("prices research by prerequisite path and filters unreachable science branches", () => {
    const world = oneFactionWorld(data);
    const faction = 0;
    const shields3 = techIndex("shields_3");
    const directCost = repeatableCostAtLevel(data.techs[shields3] as StageOneTech, 1);
    const path = researchPathCost(data, world, faction, shields3);

    expect(path.total).toBeGreaterThan(totalCost(directCost));
    const pathIds = path.path.map((tech) => data.techs[tech]?.id);
    expect(pathIds).toEqual(
      expect.arrayContaining([
        "materials_alloys",
        "microelectronics",
        "superconduction",
        "shields_1",
        "shields_2",
        "shields_3"
      ])
    );
    expect(pathIds[pathIds.length - 1]).toBe("shields_3");
    expect(isResearchPathReachable(data, world, faction, shields3)).toBe(false);
    expect(chooseResearchTopic(data, world, faction, 1)).toBeUndefined();
  });

  it("draws research noise from a derived stream and keeps the root RNG stable", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const rng = Rng.fromSeed(12345);
    const before = rng.serialize();
    const choice = chooseResearchTopic(data, sim.world, 0, 100, rng);

    expect(choice).toBeDefined();
    expect(choice?.reason).toContain("cost_path=");
    expect(choice?.prereqPath.length).toBeGreaterThan(0);
    expect(rng.serialize()).toEqual(before);
  });

  it("scores shield bottlenecks toward defensive shield research", () => {
    const shields = resourceIndexOf(data.resourceIndex, "shields");
    const shieldTech = data.techs[techIndex("shields_1")] as StageOneTech;
    const alloyTech = data.techs[techIndex("materials_alloys")] as StageOneTech;

    expect(researchRelevanceForBottleneck(data, shieldTech, shields)).toBeGreaterThan(
      researchRelevanceForBottleneck(data, alloyTech, shields)
    );
  });

  it("tracks unlocks per faction and caps repeatable levels", () => {
    const world = oneFactionWorld(data);
    const faction = 0;
    const reactor = moduleIndex("reactor_t1");
    const laser = moduleIndex("laser_t1");
    const laserTech = techIndex("energy_weapons_1");
    const repeatable = data.techs.findIndex((tech) => tech.repeatable);

    expect(isModuleUnlocked(data, world.techState, faction, reactor)).toBe(true);
    expect(isModuleUnlocked(data, world.techState, faction, laser)).toBe(false);

    world.techState.markResearched(faction, laserTech);
    expect(isModuleUnlocked(data, world.techState, faction, laser)).toBe(true);

    for (let i = 0; i < MAX_REPEATABLE_TECH_LEVEL + 8; i += 1) {
      world.techState.markResearched(faction, repeatable);
    }
    expect(world.techState.level(repeatable, faction)).toBe(MAX_REPEATABLE_TECH_LEVEL);
  });

  it("consumes transported science data only at the capital conversion point", () => {
    const world = StageOneWorld.create(data);
    const system = world.systems.add(0, 0, 0, -1);
    const capital = world.addBody(system, BodyType.Planet, 1, 0.8, 8, -1, 100);
    const remote = world.addBody(system, BodyType.Planet, 1, 0.5, 8, -1, 30);
    const faction = world.addFaction("Research", system, capital, 1_000, 1, 1);
    world.addColony(faction, remote, 30);
    world.buildings.addBuilt(
      data,
      world.bodies,
      capital,
      buildingIndex("physics_lab"),
      world.stockpiles
    );

    const engineering = resourceIndexOf(data.resourceIndex, "data_engineering");
    const remoteStockpile = world.bodies.stockpile[remote] ?? 0;
    const capitalStockpile = world.bodies.stockpile[capital] ?? 0;
    const tech = techIndex("materials_alloys");
    const cost = repeatableCostAtLevel(data.techs[tech] as StageOneTech, 1);
    world.techState.setCurrent(faction, tech);
    world.stockpiles.setCapacity(remoteStockpile, engineering, 10_000);
    world.stockpiles.set(remoteStockpile, engineering, cost.engineering);

    const remoteOnly = collectAndAdvanceResearch(data, world, 1);
    expect(remoteOnly.collectedEngineering).toBe(0);
    expect(world.stockpiles.get(remoteStockpile, engineering)).toBe(cost.engineering);

    world.stockpiles.setCapacity(capitalStockpile, engineering, 10_000);
    world.stockpiles.set(capitalStockpile, engineering, cost.engineering);
    const completed = collectAndAdvanceResearch(data, world, 2);
    expect(completed.completed).toBe(1);
    expect(world.techState.hasResearched(faction, tech)).toBe(true);

    const next = techIndex("microelectronics");
    world.techState.setCurrent(faction, next);
    let building = world.bodies.firstBuilding[capital] ?? -1;
    while (building >= 0) {
      const nextBuilding = world.buildings.nextInBody[building] ?? -1;
      world.buildings.markDemolished(data, world.bodies, building, world.stockpiles);
      building = nextBuilding;
    }
    const progressBefore = world.techState.progressEngineering[faction] ?? 0;
    world.stockpiles.set(capitalStockpile, engineering, 10_000);
    collectAndAdvanceResearch(data, world, 3);
    expect(world.techState.progressEngineering[faction]).toBe(progressBefore);
  });

  it("applies tech modifiers to recipes and reports unknown modifier targets", () => {
    const world = oneFactionWorld(data);
    const faction = 0;
    const tech = techIndex("materials_alloys");
    const recipe = data.batchRecipeIndex.get("forge_alloys") ?? -1;
    const output = data.batchRecipes[recipe]?.outputs[0];
    if (output === undefined) throw new Error("forge_alloys has no output");

    world.techState.markResearched(faction, tech);
    world.techModifiers.recalculateFaction(data, world.techState, faction);

    const baseCost = baseRecipeUnitCost(recipe, output.resource);
    expect(world.techModifiers.outputMultiplier(faction, recipe)).toBeGreaterThan(1);
    expect(
      world.techModifiers.effectiveRecipeUnitCost(data, faction, recipe, output.resource)
    ).toBeLessThan(baseCost);

    const badTech = {
      ...(data.techs[0] as StageOneTech),
      id: "bad_modifier",
      effects: [
        {
          type: "modifier",
          id: "",
          target: "recipe:does_not_exist",
          stat: "outputMultiplier",
          value: 1.1
        }
      ]
    } as StageOneTech;
    const badData = { ...data, techs: [...data.techs, badTech] } as StageOneData;
    expect(() => validateAllModifiers(badData)).toThrow(/Unknown modifier target/);
  });

  it("scores designs with diminishing speed, armor softening, shield regen, and enemy profile", () => {
    const corvette = shipDesign("corvette", [
      "reactor_t1",
      "thruster_t1",
      "thruster_t1",
      "kinetic_t1",
      "armor_t1"
    ]);
    const cruiser = shipDesign("cruiser", [
      "reactor_t3",
      "reactor_t3",
      "thruster_t3",
      "thruster_t3",
      "thruster_t3",
      "laser_t3",
      "laser_t3",
      "shield_t2",
      "armor_t2"
    ]);
    const doctrine = data.doctrines[data.doctrineIndex.get("line_battle") ?? -1];
    if (doctrine === undefined) throw new Error("Missing line_battle doctrine");

    expect(armorReduction(90, 90)).toBeCloseTo(0.5);
    expect(computeEffectiveHitPoints(100, 0, 100, 10, 90, 1.3, 6)).toBeCloseTo(290);
    expect(speedScore(20) - speedScore(10)).toBeLessThan(speedScore(10) - speedScore(0));
    expect(validateShipDesign(data, cruiser).ok).toBe(true);

    const vsShields = scoreDesign(data, corvette, doctrine, { shieldFraction: 1, armorRating: 0 });
    const vsArmor = scoreDesign(data, corvette, doctrine, { shieldFraction: 0, armorRating: 200 });
    expect(vsShields).not.toBeCloseTo(vsArmor);
  });

  it("autodesigns useful ships under budget instead of choosing absolute strongest hulls", () => {
    const raider = data.doctrines[data.doctrineIndex.get("raider") ?? -1];
    const line = data.doctrines[data.doctrineIndex.get("line_battle") ?? -1];
    if (raider === undefined || line === undefined) throw new Error("Missing doctrines");

    const cheap = bestDesign(data, raider, { budget: 9_000, maxTier: 4 });
    expect(cheap).toBeDefined();
    expect(cheap?.cost).toBeLessThanOrEqual(9_000);
    expect(data.hulls[cheap?.hull ?? -1]?.id).not.toBe("battleship");

    const cruiser = bestDesign(data, line, {
      budget: 150_000,
      maxTier: 3,
      enemy: { shieldFraction: 0.9, armorRating: 20 }
    });
    expect(cruiser).toBeDefined();
    expect(cruiser?.stats.speed).toBeGreaterThan(0);
    expect(cruiser?.stats.effectiveHitPoints).toBeGreaterThan(0);
  });

  it("reserves partial ship kits, exposes component jobs, completes builds, and gates refits by shipyard", () => {
    const setup = shipyardWorld(data);
    const blueprint = addCorvetteBlueprint(data, setup.world, setup.faction);
    const requirements = blueprintComponentRequirements(data, setup.world.blueprints, blueprint);
    const partial = requirements[0];
    if (partial === undefined) throw new Error("Blueprint has no component requirements");
    const yardStockpile = setup.world.bodies.stockpile[setup.yard] ?? 0;
    setup.world.stockpiles.setCapacity(yardStockpile, partial.resource, partial.amount + 100);
    setup.world.stockpiles.set(yardStockpile, partial.resource, partial.amount / 2);

    const noKit = queueShipBuild(data, setup.world, setup.faction, setup.yard, blueprint, 1, false);
    expect(noKit.ok).toBe(false);
    expect(noKit.reason).toBe("missingComponents");

    const queued = queueShipBuild(data, setup.world, setup.faction, setup.yard, blueprint, 2, true);
    expect(queued.ok).toBe(true);
    const kitOrder = setup.world.shipyardOrders.kitOrder[queued.order] ?? -1;
    expect(setup.world.kitOrders.state[kitOrder]).toBe(KitOrderState.Active);
    expect(setup.world.kitOrders.reserved(kitOrder, partial.resource)).toBeCloseTo(
      partial.amount / 2
    );
    expect(setup.world.stockpiles.remove(yardStockpile, partial.resource, partial.amount / 2)).toBe(
      false
    );

    const contracts = new GovernmentContracts();
    addKitOrderContracts(data, setup.world, contracts);
    const sourceStockpile = setup.world.bodies.stockpile[setup.source] ?? 0;
    for (const item of requirements) {
      const missing = setup.world.kitOrders.missing(kitOrder, item.resource);
      setup.world.stockpiles.setCapacity(sourceStockpile, item.resource, missing + 100);
      setup.world.stockpiles.set(sourceStockpile, item.resource, missing);
    }
    const jobs = new JobBoard(40);
    jobs.update(data, setup.world, new RoutePlanner());
    expect(findKitJob(jobs, kitOrder)).toBeGreaterThanOrEqual(0);

    for (const item of requirements) {
      const missing = setup.world.kitOrders.missing(kitOrder, item.resource);
      setup.world.stockpiles.setCapacity(yardStockpile, item.resource, missing + 100);
      setup.world.stockpiles.addClamped(yardStockpile, item.resource, missing);
    }
    setup.world.kitOrders.reserveFromTarget(setup.world, kitOrder, 3);
    expect(setup.world.kitOrders.state[kitOrder]).toBe(KitOrderState.Ready);

    const started = setup.world.shipyardOrders.state[queued.order] ?? ShipyardOrderState.Inactive;
    expect(started).toBe(ShipyardOrderState.GatheringKit);
    const beforeShips = setup.world.ships.length;
    const advance = setup.world.shipyardOrders;
    const build = advance.finishTick[queued.order] ?? -1;
    expect(build).toBe(-1);

    const firstAdvance = awaitShipyardStart(setup.world, queued.order);
    expect(firstAdvance).toBeGreaterThan(0);
    const finishTick = setup.world.shipyardOrders.finishTick[queued.order] ?? -1;
    awaitShipyardCompletion(setup.world, queued.order, finishTick);
    expect(setup.world.ships.length).toBe(beforeShips + 1);
    expect(setup.world.ships.blueprint[beforeShips]).toBe(blueprint);

    const secondBlueprint = addCorvetteBlueprint(data, setup.world, setup.faction, 200);
    const remoteShip = setup.world.addShip(
      setup.faction,
      setup.remoteSystem,
      ShipRole.Warship,
      0,
      80,
      8,
      blueprint
    );
    expect(canRefitShip(data, setup.world, remoteShip, secondBlueprint).reason).toBe("noShipyard");

    const refitShip = setup.world.addShip(
      setup.faction,
      setup.yardSystem,
      ShipRole.Warship,
      0,
      80,
      8,
      blueprint
    );
    for (const item of refitCost(data, setup.world, secondBlueprint)) {
      setup.world.stockpiles.setCapacity(yardStockpile, item.resource, item.amount + 100);
      setup.world.stockpiles.set(yardStockpile, item.resource, item.amount);
    }
    const refit = refitShipAtShipyard(data, setup.world, refitShip, secondBlueprint, 300);
    expect(refit.ok).toBe(true);
    expect(setup.world.ships.blueprint[refitShip]).toBe(secondBlueprint);
  });
});

function oneFactionWorld(data: StageOneData): StageOneWorld {
  const world = StageOneWorld.create(data);
  const system = world.systems.add(0, 0, 0, -1);
  const body = world.addBody(system, BodyType.Planet, 1, 0.8, 12, -1, 100);
  world.addFaction("Test", system, body, 1_000, 1, 1);
  return world;
}

function shipyardWorld(data: StageOneData): {
  readonly world: StageOneWorld;
  readonly faction: number;
  readonly yard: number;
  readonly source: number;
  readonly yardSystem: number;
  readonly remoteSystem: number;
} {
  const world = StageOneWorld.create(data);
  const yardSystem = world.systems.add(0, 0, 0, -1);
  const remoteSystem = world.systems.add(10, 0, 0, -1);
  world.gates.addUndirected(world.systems, yardSystem, remoteSystem, 4);
  const yard = world.addBody(yardSystem, BodyType.Planet, 1, 0.8, 16, -1, 100);
  const source = world.addBody(remoteSystem, BodyType.Planet, 1, 0.5, 8, -1, 20);
  const faction = world.addFaction("Yard", yardSystem, yard, 10_000, 1, 1);
  world.addColony(faction, source, 20);
  world.buildings.addBuilt(data, world.bodies, yard, buildingIndex("shipyard"), world.stockpiles);
  return { world, faction, yard, source, yardSystem, remoteSystem };
}

function addCorvetteBlueprint(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tick = 0
): number {
  const design = shipDesign("corvette", [
    "reactor_t1",
    "thruster_t1",
    "thruster_t1",
    "kinetic_t1",
    "armor_t1"
  ]);
  const stats = calculateDesignStats(data, design, world.techModifiers, faction);
  const result: BestDesignResult = {
    hull: design.hull,
    design,
    stats,
    score: stats.effectiveHitPoints + stats.damageMedium,
    cost: stats.cost,
    iterations: 0,
    scorePerCredit:
      stats.cost > 0 ? (stats.effectiveHitPoints + stats.damageMedium) / stats.cost : 0,
    affordableCount: 1,
    budgetedScore: stats.effectiveHitPoints + stats.damageMedium
  };
  return world.blueprints.addFromDesign(
    data,
    faction,
    data.doctrineIndex.get("line_battle") ?? 0,
    result,
    tick
  );
}

function shipDesign(hullId: string, moduleIds: readonly string[]): ShipDesign {
  return {
    hull: hullIndex(hullId),
    modules: moduleIds.map((id) => moduleIndex(id))
  };
}

function awaitShipyardStart(world: StageOneWorld, order: number): number {
  for (let tick = 3; tick < 100; tick += 1) {
    advanceShipyards(data, world, tick);
    if (world.shipyardOrders.state[order] === ShipyardOrderState.Building) return tick;
  }
  return -1;
}

function awaitShipyardCompletion(world: StageOneWorld, order: number, finishTick: number): void {
  advanceShipyards(data, world, finishTick);
  expect(world.shipyardOrders.state[order]).toBe(ShipyardOrderState.Complete);
}

function findKitJob(jobs: JobBoard, kitOrder: number): number {
  for (let i = 0; i < jobs.count; i += 1) {
    if (jobs.kitOrder[i] === kitOrder) return i;
  }
  return -1;
}

function baseRecipeUnitCost(recipe: number, resource: number): number {
  const definition = data.batchRecipes[recipe];
  if (definition === undefined) throw new Error("Missing recipe");
  let inputValue = 0;
  for (const input of definition.inputs) {
    inputValue += input.amount * (data.baseValue[input.resource] ?? 1);
  }
  let outputAmount = 0;
  for (const output of definition.outputs) {
    if (output.resource === resource) outputAmount += output.amount;
  }
  return inputValue / Math.max(0.000001, outputAmount);
}

function techIndex(id: string): number {
  const value = data.techIndex.get(id);
  if (value === undefined) throw new RangeError(`Missing tech ${id}`);
  return value;
}

function hullIndex(id: string): number {
  const value = data.hullIndex.get(id);
  if (value === undefined) throw new RangeError(`Missing hull ${id}`);
  return value;
}

function moduleIndex(id: string): number {
  const value = data.moduleIndex.get(id);
  if (value === undefined) throw new RangeError(`Missing module ${id}`);
  return value;
}

function buildingIndex(id: string): number {
  const value = data.buildingIndex.get(id);
  if (value === undefined) throw new RangeError(`Missing building ${id}`);
  return value;
}
