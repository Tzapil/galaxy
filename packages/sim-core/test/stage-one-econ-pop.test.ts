import { describe, expect, it } from "vitest";

import {
  detectAndBreakProductionDeadlocks,
  handleBatchComplete,
  processContinuousBuildings,
  tryStartBatch
} from "../src/econ/batch.js";
import { BuildingState } from "../src/econ/buildings.js";
import { EventKind } from "../src/events/kinds.js";
import { StageOneLogKind } from "../src/events/log.js";
import { EventBatch, EventQueue } from "../src/events/queue.js";
import { consumePopulation } from "../src/pop/consume.js";
import { populationCapacity, updatePopulationGrowth } from "../src/pop/growth.js";
import { requiredFoodPlantsForOwnWorkforce } from "../src/pop/workforce.js";
import {
  buildingIndexOf,
  createDefaultStageOneData,
  resourceIndexOf,
  type StageOneBatchRecipe,
  type StageOneData
} from "../src/stage-one/data.js";
import { BodyType } from "../src/world/bodies.js";
import { StageOneWorld } from "../src/world/state.js";

describe("stage one production and population", () => {
  it("runs the ore to metal batch chain for 1000 ticks", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 200);
    const queue = new EventQueue(128);
    const body = 0;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const metal = resourceIndexOf(data.resourceIndex, "metal");
    const initialMetal = world.stockpiles.get(stockpile, metal);

    world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "solar_array")
    );
    world.buildings.addBuilt(data, world.bodies, body, buildingIndexOf(data.buildingIndex, "mine"));
    world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "smelter")
    );

    for (let tick = 0; tick < 1000; tick += 1) {
      processContinuousBuildings(data, world);
      tryStartBatch(data, world, queue, 1, tick);
      tryStartBatch(data, world, queue, 2, tick);
      drainBatchEvents(data, world, queue, tick);
    }

    expect(world.stockpiles.get(stockpile, metal)).toBeGreaterThan(initialMetal);
  });

  it("moves a building to idle missing input in the same tick", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 50);
    const queue = new EventQueue(8);
    const body = 0;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const ore = resourceIndexOf(data.resourceIndex, "ore");
    const energy = resourceIndexOf(data.resourceIndex, "energy");
    const smelter = world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "smelter")
    );

    world.stockpiles.set(stockpile, energy, 100);

    expect(tryStartBatch(data, world, queue, smelter, 0)).toBe(false);
    expect(world.buildings.state[smelter]).toBe(BuildingState.IdleMissingInput);
    expect(world.buildings.stateResource[smelter]).toBe(ore);
  });

  it("blocks a new batch explicitly when output storage is full", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 50);
    const queue = new EventQueue(8);
    const body = 0;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const ore = resourceIndexOf(data.resourceIndex, "ore");
    const energy = resourceIndexOf(data.resourceIndex, "energy");
    const metal = resourceIndexOf(data.resourceIndex, "metal");
    const smelter = world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "smelter")
    );

    world.stockpiles.set(stockpile, ore, 100);
    world.stockpiles.set(stockpile, energy, 100);
    world.stockpiles.set(stockpile, metal, world.stockpiles.capacity(stockpile, metal));

    expect(tryStartBatch(data, world, queue, smelter, 10)).toBe(false);
    expect(world.buildings.state[smelter]).toBe(BuildingState.IdleStorageFull);
    expect(world.buildings.stateResource[smelter]).toBe(metal);
    expect(queue.peekTick()).toBe(11);
  });

  it("detects and breaks a direct production deadlock deterministically", () => {
    const data = deadlockData();
    const world = singleColonyWorld(data, 50);
    const queue = new EventQueue(8);
    const mine = world.buildings.addBuilt(
      data,
      world.bodies,
      0,
      buildingIndexOf(data.buildingIndex, "mine")
    );
    const smelter = world.buildings.addBuilt(
      data,
      world.bodies,
      0,
      buildingIndexOf(data.buildingIndex, "smelter")
    );

    expect(tryStartBatch(data, world, queue, mine, 0)).toBe(false);
    expect(tryStartBatch(data, world, queue, smelter, 0)).toBe(false);
    expect(detectAndBreakProductionDeadlocks(data, world, queue, 30)).toBe(1);

    const event = world.eventLog.recentRow(world.eventLog.length - 1);
    expect(world.eventLog.kind[event]).toBe(StageOneLogKind.DeadlockBroken);
    expect(world.buildings.state[mine]).toBe(BuildingState.Working);
  });

  it("smooths sawtooth supply with a 30-day EMA instead of daily panic", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 100);
    const food = resourceIndexOf(data.resourceIndex, "food");

    for (let day = 0; day < 120; day += 1) {
      world.supply.update(0, food, day % 2 === 0 ? 1 : 0.8);
    }

    expect(world.supply.get(0, food)).toBeGreaterThan(0.85);
  });

  it("shrinks under starvation and recovers growth only from reserve surplus", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 200);
    const body = 0;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const food = resourceIndexOf(data.resourceIndex, "food");
    const water = resourceIndexOf(data.resourceIndex, "water");

    setSupply(world, body, food, 0.3);
    setSupply(world, body, water, 1);
    updatePopulationGrowth(data, world.bodies, world.stockpiles, world.supply);
    expect(world.bodies.population[body]).toBeLessThan(200);

    const afterStarvation = world.bodies.population[body] ?? 0;
    setSupply(world, body, food, 1);
    setSupply(world, body, water, 1);
    world.stockpiles.set(stockpile, food, 1500);
    world.stockpiles.set(stockpile, water, 1500);
    updatePopulationGrowth(data, world.bodies, world.stockpiles, world.supply);
    expect(world.bodies.population[body]).toBeGreaterThan(afterStarvation);
    expect(world.bodies.population[body]).toBeLessThanOrEqual(
      populationCapacity(world.bodies, body)
    );
  });

  it("keeps workforce scale compatible with colony food production", () => {
    const data = createDefaultStageOneData();
    const food = resourceIndexOf(data.resourceIndex, "food");
    const recipe = data.batchRecipes[data.batchRecipeIndex.get("synth_food") ?? -1];
    if (recipe === undefined) throw new Error("Missing synth_food recipe.");
    const output = recipe.outputs.find((item) => item.resource === food);
    if (output === undefined) throw new Error("Missing food output.");

    expect(
      requiredFoodPlantsForOwnWorkforce(14, output.amount, recipe.durationTicks, 0.06)
    ).toBeLessThan(1);
  });

  it("makes buildings without workers idle even with full inputs", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 1);
    const queue = new EventQueue(8);
    const body = 0;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const ore = resourceIndexOf(data.resourceIndex, "ore");
    const energy = resourceIndexOf(data.resourceIndex, "energy");
    const smelter = world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "smelter")
    );

    world.stockpiles.set(stockpile, ore, 100);
    world.stockpiles.set(stockpile, energy, 100);

    expect(tryStartBatch(data, world, queue, smelter, 0)).toBe(false);
    expect(world.buildings.state[smelter]).toBe(BuildingState.IdleNoWorkers);
  });

  it("keeps a supplied colony alive for 100 years without exceeding capacity", () => {
    const data = createDefaultStageOneData();
    const world = singleColonyWorld(data, 220);
    const stockpile = world.bodies.stockpile[0] ?? 0;
    const food = resourceIndexOf(data.resourceIndex, "food");
    const water = resourceIndexOf(data.resourceIndex, "water");

    world.stockpiles.set(stockpile, food, 1500);
    world.stockpiles.set(stockpile, water, 1500);
    for (let day = 0; day < 36_500; day += 1) {
      consumePopulation(data, world.bodies, world.stockpiles, world.supply);
      if (day % 30 === 0) {
        world.stockpiles.set(stockpile, food, 1500);
        world.stockpiles.set(stockpile, water, 1500);
      }
      updatePopulationGrowth(data, world.bodies, world.stockpiles, world.supply);
    }

    expect(world.bodies.population[0]).toBeGreaterThan(220);
    expect(world.bodies.population[0]).toBeLessThanOrEqual(populationCapacity(world.bodies, 0));
  });
});

function singleColonyWorld(data: StageOneData, population: number): StageOneWorld {
  const world = StageOneWorld.create(data);
  world.systems.add(0, 0, 0, -1);
  const body = world.addBody(0, BodyType.Planet, 1, 0.9, 24, -1, population);
  world.addFaction("Test", 0, body, 0, 1, 1);
  return world;
}

function setSupply(world: StageOneWorld, body: number, resource: number, value: number): void {
  const column = world.supply.emaColumns[resource];
  if (column === undefined) throw new RangeError("Missing supply column.");
  column[body] = value;
}

function drainBatchEvents(
  data: StageOneData,
  world: StageOneWorld,
  queue: EventQueue,
  tick: number
): void {
  const batch = new EventBatch(16);
  const count = queue.drainUntil(tick, batch);
  for (let i = 0; i < count; i += 1) {
    if (batch.kinds[i] === EventKind.BatchComplete) {
      handleBatchComplete(data, world, queue, batch.payloadIndices[i] ?? 0, tick);
    }
  }
}

function deadlockData(): StageOneData {
  const base = createDefaultStageOneData();
  const ore = resourceIndexOf(base.resourceIndex, "ore");
  const metal = resourceIndexOf(base.resourceIndex, "metal");
  const recipes: StageOneBatchRecipe[] = [
    {
      id: "cycle_ore",
      buildingId: "mine",
      inputs: [{ resource: metal, amount: 1 }],
      outputs: [{ resource: ore, amount: 1 }],
      durationTicks: 1,
      workers: 1
    },
    {
      id: "cycle_metal",
      buildingId: "smelter",
      inputs: [{ resource: ore, amount: 1 }],
      outputs: [{ resource: metal, amount: 1 }],
      durationTicks: 1,
      workers: 1
    }
  ];

  return {
    ...base,
    batchRecipes: recipes,
    batchRecipeIndex: new Map([
      ["cycle_ore", 0],
      ["cycle_metal", 1]
    ]),
    continuous: [],
    buildings: base.buildings.map((building) => {
      if (building.id === "mine")
        return { ...building, batchRecipe: 0, continuousProcess: -1, workers: 1 };
      if (building.id === "smelter")
        return { ...building, batchRecipe: 1, continuousProcess: -1, workers: 1 };
      return { ...building, batchRecipe: -1, continuousProcess: -1 };
    })
  };
}
