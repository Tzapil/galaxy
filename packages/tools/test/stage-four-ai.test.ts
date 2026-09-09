import { beforeAll, describe, expect, it } from "vitest";

import {
  AiOperationalTaskKind,
  AiScheduler,
  BuildingState,
  BodyType,
  EventQueue,
  NeedBranch,
  RoutePlanner,
  ShipRole,
  ShipState,
  StageOneLogKind,
  StageOneWorld,
  StageTwoSimulation,
  applyBuildPlan,
  buildColonizerIfNeeded,
  buildingIndexOf,
  calculateFleetDemandPerDay,
  chooseUtilityOption,
  collectFactionDemandSources,
  demandByColonyShare,
  explodeDemand,
  findBottleneck,
  formatAiDecisionReason,
  guardAlternativeProducer,
  guardDemolishByFlow,
  guardHousingCap,
  guardPowerAvailable,
  guardStockHorizon,
  guardVitalVsComfort,
  handleColonizerArrival,
  launchIdleColonizer,
  resourceIndexOf,
  solveLinearProgram,
  toOperationalTask,
  type StageOneData,
  createBuildPlan,
  createStrategicGoal
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "../src/stage-two-loader.js";

let data: StageOneData;

beforeAll(async () => {
  data = await loadStageTwoData();
});

describe("Stage 4 faction AI", () => {
  it("loads personalities and lets weights change deterministic utility choices", () => {
    expect(data.personalities.length).toBeGreaterThanOrEqual(4);
    const expansion = chooseUtilityOption(
      {
        growth: 2,
        industry: 0.5,
        research: 1,
        military: 1,
        logistics: 1,
        stockpile: 1,
        risk: 1
      },
      [
        { value: "colony", axis: "growth", baseScore: 1, tieBreak: 1 },
        { value: "factory", axis: "industry", baseScore: 1.5, tieBreak: 0 }
      ]
    );
    const industry = chooseUtilityOption(
      {
        growth: 0.5,
        industry: 2,
        research: 1,
        military: 1,
        logistics: 1,
        stockpile: 1,
        risk: 1
      },
      [
        { value: "colony", axis: "growth", baseScore: 1, tieBreak: 1 },
        { value: "factory", axis: "industry", baseScore: 1.5, tieBreak: 0 }
      ]
    );

    expect(expansion?.value).toBe("colony");
    expect(industry?.value).toBe("factory");
  });

  it("amortizes strategic and operational faction work over phases", () => {
    const scheduler = new AiScheduler();
    let maxStrategic = 0;
    let maxOperational = 0;
    for (let tick = 0; tick < 360; tick += 1) {
      let strategic = 0;
      let operational = 0;
      for (let faction = 0; faction < 8; faction += 1) {
        if (scheduler.shouldRunStrategic(tick, faction)) strategic += 1;
        if (scheduler.shouldRunOperational(tick, faction)) operational += 1;
      }
      maxStrategic = Math.max(maxStrategic, strategic);
      maxOperational = Math.max(maxOperational, operational);
    }

    expect(maxStrategic).toBeLessThanOrEqual(1);
    expect(maxOperational).toBeLessThanOrEqual(1);
  });

  it("recursively explodes cruiser demand through composite and raw chains", () => {
    const cruiser = data.hullIndex.get("cruiser") ?? -1;
    const hullFrames = resourceIndexOf(data.resourceIndex, "hull_frames");
    const composites = resourceIndexOf(data.resourceIndex, "composites");
    const polymers = resourceIndexOf(data.resourceIndex, "polymers");
    const gas = resourceIndexOf(data.resourceIndex, "gas");

    const result = explodeDemand(data, [
      { kind: "hull", hull: cruiser, count: 20, horizonDays: 365 }
    ]);

    expect(result.requiredPerDay[hullFrames]).toBeGreaterThan(0);
    expect(result.requiredPerDay[composites]).toBeGreaterThan(0);
    expect(result.requiredPerDay[polymers]).toBeGreaterThan(0);
    expect(result.requiredPerDay[gas]).toBeGreaterThan(0);
    expect(result.operations).toBeGreaterThan(6);
  });

  it("includes capital and fleet demand sources and keeps energy terminal", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const waterPlant = buildingIndexOf(data.buildingIndex, "water_plant");
    const body = sim.world.factions.capitalBody[0] ?? 0;
    const queue = new EventQueue();
    const construction = sim.world.buildings.addUnderConstruction(
      data,
      sim.world.bodies,
      body,
      waterPlant,
      1
    );
    sim.world.buildings.stateResource[construction] = resourceIndexOf(data.resourceIndex, "metal");

    const sources = collectFactionDemandSources(data, sim.world, 0);
    const fuel = resourceIndexOf(data.resourceIndex, "fuel");
    const hullFrames = resourceIndexOf(data.resourceIndex, "hull_frames");
    const metal = resourceIndexOf(data.resourceIndex, "metal");
    const shares = demandByColonyShare(
      sim.world,
      0,
      calculateFleetDemandPerDay(data, sim.world, 0)
    );
    const energyOnly = explodeDemand(data, [
      { kind: "resource", resource: data.energyResource, amountPerDay: 10 }
    ]);

    expect(queue.size).toBe(0);
    expect(sources.capitalDemandPerDay[metal]).toBeGreaterThan(0);
    expect(sources.fleetDemandPerDay[fuel]).toBeGreaterThan(2);
    expect(sources.fleetDemandPerDay[hullFrames]).toBeCloseTo(0.5, 5);
    expect(shares).toHaveLength(sim.world.factions.colonyCount[0] ?? 0);
    expect(energyOnly.trace).toHaveLength(1);
  });

  it("turns MRP bottlenecks into guarded build plans", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const goal = createStrategicGoal(
      data,
      sim.world,
      0,
      360,
      data.personalities[0]?.weights ?? {
        growth: 1,
        industry: 1,
        research: 1,
        military: 1,
        logistics: 1,
        stockpile: 1,
        risk: 1
      }
    );
    const bottleneck = findBottleneck(data, sim.world, 0, goal);
    const task = toOperationalTask(data, sim.world, 0, bottleneck);

    expect(task.kind).toBe(AiOperationalTaskKind.BuildProducer);
    const plan = createBuildPlan(data, sim.world, task);
    expect(plan.items.length).toBeGreaterThan(0);
    expect(plan.items.every((item) => item.body >= 0 && item.buildingType >= 0)).toBe(true);
  });

  it("build planner can reserve a multi-slot shipyard packet deterministically", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const hullFrames = resourceIndexOf(data.resourceIndex, "hull_frames");
    const hullYard = buildingIndexOf(data.buildingIndex, "hull_yard");
    const task = {
      kind: AiOperationalTaskKind.BuildProducer,
      faction: 0,
      resource: hullFrames,
      body: sim.world.factions.capitalBody[0] ?? 0,
      buildingType: hullYard,
      score: 3
    };
    const first = createBuildPlan(data, sim.world, task);
    const second = createBuildPlan(data, sim.world, task);
    const ids = first.items.map((item) => data.buildings[item.buildingType]?.id);

    expect(first).toEqual(second);
    expect(ids).toContain("hull_yard");
    expect(ids).toContain("shipyard");
    expect(
      solveLinearProgram({
        objective: [3, 2],
        constraints: [
          [3, 3],
          [10, 20],
          [1, 1]
        ],
        limits: [12, 60, 4]
      }).values[0]
    ).toBeGreaterThan(0);
  });

  it("covers the six Stage 4 build guards", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const water = resourceIndexOf(data.resourceIndex, "water");
    const consumerGoods = resourceIndexOf(data.resourceIndex, "consumer_goods");
    const body = sim.world.factions.capitalBody[0] ?? 0;
    const waterPlant = buildingIndexOf(data.buildingIndex, "water_plant");
    const biomass = resourceIndexOf(data.resourceIndex, "biomass");
    const farm = buildingIndexOf(data.buildingIndex, "farm");
    const unpoweredWorld = StageOneWorld.create(data);
    const system = unpoweredWorld.systems.add(0, 0, 0, -1);
    const unpowered = unpoweredWorld.addBody(system, BodyType.Planet, 1, 0.5, 5, -1, 100);
    unpoweredWorld.addFaction("Guard", system, unpowered, 1_000, 1, 1);

    expect(guardVitalVsComfort(data, water)).toBe(NeedBranch.Vital);
    expect(guardVitalVsComfort(data, consumerGoods)).toBe(NeedBranch.Comfort);
    expect(guardHousingCap(data, sim.world, body, 1)).toBe(true);
    expect(guardStockHorizon(sim.world, 0, water, 0.0001)).toBe(false);
    expect(guardPowerAvailable(data, unpoweredWorld, unpowered, waterPlant, false)).toBe(false);
    expect(guardPowerAvailable(data, unpoweredWorld, unpowered, waterPlant, true)).toBe(true);
    expect(guardAlternativeProducer(data, unpoweredWorld, 0, biomass, farm)).toBe(
      buildingIndexOf(data.buildingIndex, "hydroponics_bay")
    );

    unpoweredWorld.buildings.addBuilt(
      data,
      unpoweredWorld.bodies,
      unpowered,
      buildingIndexOf(data.buildingIndex, "solar_array"),
      unpoweredWorld.stockpiles
    );
    const foodPlant = unpoweredWorld.buildings.addBuilt(
      data,
      unpoweredWorld.bodies,
      unpowered,
      buildingIndexOf(data.buildingIndex, "food_plant"),
      unpoweredWorld.stockpiles
    );
    expect(guardDemolishByFlow(data, unpoweredWorld, foodPlant).ok).toBe(false);
  });

  it("wires stock horizon and vital-vs-comfort guards through build planning", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const faction = 0;
    const body = sim.world.factions.capitalBody[faction] ?? 0;
    const water = resourceIndexOf(data.resourceIndex, "water");
    const food = resourceIndexOf(data.resourceIndex, "food");
    const medicine = resourceIndexOf(data.resourceIndex, "medicine");
    const consumerGoods = resourceIndexOf(data.resourceIndex, "consumer_goods");
    const waterPlant = buildingIndexOf(data.buildingIndex, "water_plant");
    const foodPlant = buildingIndexOf(data.buildingIndex, "food_plant");
    const consumerPlant = buildingIndexOf(data.buildingIndex, "consumer_plant");

    setFactionStock(sim.world, faction, water, 10_000);
    const stockedPlan = createBuildPlan(data, sim.world, {
      kind: AiOperationalTaskKind.BuildProducer,
      faction,
      resource: water,
      body,
      buildingType: waterPlant,
      score: 1
    });
    expect(guardStockHorizon(sim.world, faction, water, 1)).toBe(false);
    expect(stockedPlan.items).toHaveLength(0);

    setFactionStock(sim.world, faction, water, 0);
    setFactionStock(sim.world, faction, food, 0);
    setFactionStock(sim.world, faction, medicine, 0);
    const comfortPlan = createBuildPlan(data, sim.world, {
      kind: AiOperationalTaskKind.BuildProducer,
      faction,
      resource: consumerGoods,
      body,
      buildingType: consumerPlant,
      score: 5
    });
    const vitalPlan = createBuildPlan(data, sim.world, {
      kind: AiOperationalTaskKind.BuildProducer,
      faction,
      resource: food,
      body,
      buildingType: foodPlant,
      score: 5
    });

    expect(guardVitalVsComfort(data, consumerGoods)).toBe(NeedBranch.Comfort);
    expect(comfortPlan.items).toHaveLength(0);
    expect(vitalPlan.items.length).toBeGreaterThan(0);
  });

  it("frees slots for build plans only through flow-approved demolition", () => {
    const world = StageOneWorld.create(data);
    const system = world.systems.add(0, 0, 0, -1);
    const body = world.addBody(system, BodyType.Planet, 1, 0.8, 3, -1, 100);
    const faction = world.addFaction("Demolition", system, body, 1_000, 1, 1);
    const solar = buildingIndexOf(data.buildingIndex, "solar_array");
    const foodPlant = buildingIndexOf(data.buildingIndex, "food_plant");
    const waterPlant = buildingIndexOf(data.buildingIndex, "water_plant");
    const water = resourceIndexOf(data.resourceIndex, "water");
    const foodA = world.buildings.addBuilt(data, world.bodies, body, foodPlant, world.stockpiles);
    const foodB = world.buildings.addBuilt(data, world.bodies, body, foodPlant, world.stockpiles);
    world.buildings.addBuilt(data, world.bodies, body, solar, world.stockpiles);
    const stockpile = world.bodies.stockpile[body] ?? 0;
    for (const item of data.buildings[waterPlant]?.buildCost ?? []) {
      world.stockpiles.setCapacity(stockpile, item.resource, item.amount + 100);
      world.stockpiles.set(stockpile, item.resource, item.amount + 10);
    }

    expect(
      guardDemolishByFlow(data, world, foodA).ok || guardDemolishByFlow(data, world, foodB).ok
    ).toBe(true);

    const applied = applyBuildPlan(
      data,
      world,
      new EventQueue(),
      10,
      {
        faction,
        items: [{ body, buildingType: waterPlant, count: 1, resource: water, score: 1 }],
        operations: 1
      },
      1
    );

    expect(applied.started).toBe(1);
    expect(
      world.buildings.state[foodA] === BuildingState.Demolished ||
        world.buildings.state[foodB] === BuildingState.Demolished
    ).toBe(true);
    expect(hasEvent(world, StageOneLogKind.BuildingDemolished)).toBe(true);
  });

  it("launches a disposable colonizer and founds a colony on arrival", () => {
    const world = StageOneWorld.create(data);
    const home = world.systems.add(0, 0, 0, -1);
    const target = world.systems.add(1, 0, 0, -1);
    world.gates.addUndirected(world.systems, home, target, 10);
    const capital = world.addBody(home, BodyType.Planet, 1, 0.8, 8, -1, 200);
    const targetBody = world.addBody(target, BodyType.Planet, 1, 0.9, 8, -1, 0);
    const rareEarth = resourceIndexOf(data.resourceIndex, "rare_earth");
    world.bodies.addDeposit(targetBody, rareEarth, 1.5);
    const faction = world.addFaction("Colonizers", home, capital, 10_000, 1, 1);
    const stockpile = world.bodies.stockpile[capital] ?? 0;
    world.stockpiles.set(stockpile, resourceIndexOf(data.resourceIndex, "hull_frames"), 10);
    world.stockpiles.set(stockpile, resourceIndexOf(data.resourceIndex, "life_support"), 10);

    expect(buildColonizerIfNeeded(data, world, faction, 1, rareEarth)).toBe(true);
    const ship = findShip(world, ShipRole.Colonizer);
    expect(
      launchIdleColonizer(data, world, new RoutePlanner(), new EventQueue(), faction, targetBody, 2)
    ).toBe(true);
    expect(world.ships.state[ship]).toBe(ShipState.InTransit);
    expect(handleColonizerArrival(data, world, ship, 12)).toBe(true);
    expect(world.bodies.owner[targetBody]).toBe(faction);
    expect(world.ships.state[ship]).toBe(ShipState.Disbanded);
  });

  it("runs a stable AI smoke with explainable decision events", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const report = sim.run(3650, 0);
    let aiEvents = 0;
    for (let i = 0; i < sim.world.eventLog.length; i += 1) {
      const row = sim.world.eventLog.recentRow(i);
      const kind = sim.world.eventLog.kind[row] ?? 0;
      if (kind < StageOneLogKind.AiStrategicGoal) continue;
      aiEvents += 1;
      expect(Number.isFinite(sim.world.eventLog.amount[row] ?? 0)).toBe(true);
      expect(sim.world.eventLog.resource[row] ?? -1).toBeGreaterThanOrEqual(-1);
      expect(
        formatAiDecisionReason(data, {
          kind,
          system: sim.world.eventLog.system[row] ?? -1,
          body: sim.world.eventLog.body[row] ?? -1,
          subject: sim.world.eventLog.subject[row] ?? -1,
          resource: sim.world.eventLog.resource[row] ?? -1,
          amount: sim.world.eventLog.amount[row] ?? 0
        }).length
      ).toBeGreaterThan(24);
    }

    expect(report.metrics.totalPopulation).toBeGreaterThan(500);
    expect(report.metrics.maxResourceZeroStreakDays).toBe(0);
    expect(report.metrics.aiStrategicDecisions).toBeGreaterThan(0);
    expect(report.metrics.aiOperationalDecisions).toBeGreaterThan(0);
    expect(report.metrics.aiTacticalDecisions).toBeGreaterThan(0);
    expect(report.metrics.aiBuildPlansStarted).toBeGreaterThan(0);
    expect(aiEvents).toBeGreaterThan(0);
  }, 60_000);
});

function findShip(world: StageOneWorld, role: ShipRole): number {
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if (world.ships.role[ship] === role) return ship;
  }
  return -1;
}

function setFactionStock(
  world: StageOneWorld,
  faction: number,
  resource: number,
  amount: number
): void {
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    const stockpile = world.bodies.stockpile[body] ?? 0;
    world.stockpiles.setCapacity(stockpile, resource, Math.max(amount, 10_000));
    world.stockpiles.set(stockpile, resource, amount);
    body = world.bodies.nextInFaction[body] ?? -1;
  }
}

function hasEvent(world: StageOneWorld, kind: StageOneLogKind): boolean {
  for (let i = 0; i < world.eventLog.length; i += 1) {
    const row = world.eventLog.recentRow(i);
    if (world.eventLog.kind[row] === kind) return true;
  }
  return false;
}
