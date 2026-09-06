import { beforeAll, describe, expect, it } from "vitest";

import {
  allBuildCostResourcesAreSinks,
  applyDailyTreasury,
  BodyType,
  BuildingState,
  buildingIndexOf,
  calculateCapitalDemand,
  canDemolishByFlow,
  choosePowerSourceForRemoteBase,
  completeConstruction,
  demolishBuilding,
  advanceWaitingConstructions,
  EventQueue,
  featureMaskFromNames,
  GovernmentContracts,
  JobBoard,
  launchBestLocalJob,
  LaunchResult,
  resourceIndexOf,
  RoutePlanner,
  ShipRole,
  ShipState,
  StageOneLogKind,
  StageOneWorld,
  StageTwoSimulation,
  startBuildingConstruction,
  validatePlacement,
  validateStartPackage,
  type StageOneData
} from "@galaxy-sim/sim-core";

import { detectPathologies } from "../src/pathology.js";
import { loadStageTwoData } from "../src/stage-two-loader.js";

let data: StageOneData;

beforeAll(async () => {
  data = await loadStageTwoData();
});

describe("Stage 2 data and runtime", () => {
  it("loads the full Stage 2 economic graph", () => {
    expect(data.resources).toHaveLength(37);
    expect(data.batchRecipes).toHaveLength(36);
    expect(data.continuous).toHaveLength(3);
    expect(data.sinks).toHaveLength(6);
    expect(data.buildings).toHaveLength(49);
    expect(data.hulls).toHaveLength(12);
    expect(data.techs).toHaveLength(94);

    expect(data.transportable[data.energyResource]).toBe(0);
    expect(data.unitVolume[data.energyResource]).toBe(0);
    expect(data.graph.materialCycleCount).toBe(0);
    expect(data.graph.energyCycleCount).toBeGreaterThan(0);
    expect(allBuildCostResourcesAreSinks(data)).toBe(true);

    expect(missingPhaseOneTurnover(data)).toEqual([]);
  });

  it("validates the bootstrap package with local power and research flow", () => {
    const validation = validateStartPackage(data);

    expect(validation.ok).toBe(true);
    expect(validation.bodyCount).toBe(5);
    expect(validation.buildingCount).toBe(46);
    expect(validation.effectivePopulation).toBeCloseTo(226.9, 1);
    expect(validation.requiredWorkerRatio).toBeGreaterThanOrEqual(0.8);
    expect(validation.hasLocalPowerEverywhere).toBe(true);
    expect(validation.hasScienceDataFlow).toBe(true);
    expect(validation.placementsValid).toBe(true);
    expect(validation.missing).toEqual([]);
  });

  it("enforces slots, body type, deposits, and local power for placement", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const rocky = findOwnedBodyWithFeature(data, sim.world, 0, "ore_deposit");
    const belt = findOwnedBodyOfType(sim.world, 0, BodyType.AsteroidBelt);
    const farm = buildingIndexOf(data.buildingIndex, "farm");
    const hydroponics = buildingIndexOf(data.buildingIndex, "hydroponics_bay");

    expect(validatePlacement(data, sim.world, rocky, farm)).toEqual({
      ok: false,
      reason: "missingDeposit"
    });
    expect(validatePlacement(data, sim.world, rocky, hydroponics).ok).toBe(true);
    expect(validatePlacement(data, sim.world, belt, farm)).toEqual({
      ok: false,
      reason: "wrongBodyType"
    });

    const world = StageOneWorld.create(data);
    const system = world.systems.add(0, 0, 0, -1);
    const unpowered = world.addBody(system, BodyType.Planet, 1, 0.5, 4, -1, 0);
    const faction = world.addFaction("Test", system, unpowered, 1_000, 1, 1);
    const waterPlant = buildingIndexOf(data.buildingIndex, "water_plant");
    expect(faction).toBe(0);
    expect(validatePlacement(data, world, unpowered, waterPlant)).toEqual({
      ok: false,
      reason: "noPowerSource"
    });

    const small = world.addBody(system, BodyType.Planet, 1, 0.5, 2, faction, 0);
    const shipyard = buildingIndexOf(data.buildingIndex, "shipyard");
    expect(validatePlacement(data, world, small, shipyard)).toEqual({
      ok: false,
      reason: "noFreeSlots"
    });
  });

  it("keeps fission useful as the remote-base power source", () => {
    expect(choosePowerSourceForRemoteBase(data, 100)).toBe("fission_plant");
  });

  it("moves dependent buildings to idleNoPower when local generation is removed", () => {
    const sim = StageTwoSimulation.create(20260904, data);
    const body = findOwnedBodyWithFeature(data, sim.world, 0, "habitable");
    const waterPlantType = buildingIndexOf(data.buildingIndex, "water_plant");
    const waterPlant = findBuildingOnBody(sim.world, body, waterPlantType);
    expect(waterPlant).toBeGreaterThanOrEqual(0);

    let building = sim.world.bodies.firstBuilding[body] ?? -1;
    while (building >= 0) {
      const type = sim.world.buildings.type[building] ?? -1;
      const next = sim.world.buildings.nextInBody[building] ?? -1;
      if (data.buildings[type]?.powerSource === true) {
        sim.world.buildings.markDemolished(data, sim.world.bodies, building, sim.world.stockpiles);
      }
      building = next;
    }

    const ice = resourceIndexOf(data.resourceIndex, "ice");
    const water = resourceIndexOf(data.resourceIndex, "water");
    const stockpile = sim.world.bodies.stockpile[body] ?? 0;
    sim.world.stockpiles.set(stockpile, ice, 100);
    sim.world.stockpiles.set(stockpile, water, 0);
    sim.world.stockpiles.set(stockpile, data.energyResource, 0);
    sim.world.buildings.state[waterPlant] = BuildingState.IdleMissingInput;
    sim.world.buildings.finishTick[waterPlant] = -1;

    sim.step();
    expect(sim.world.buildings.state[waterPlant]).toBe(BuildingState.IdleNoPower);
    expect(sim.metrics().idleNoPower).toBeGreaterThan(0);
  });

  it("keeps construction waiting locally until materials arrive", () => {
    const world = StageOneWorld.create(data);
    const queue = new EventQueue();
    const system = world.systems.add(0, 0, 0, -1);
    const body = world.addBody(system, BodyType.Planet, 1, 0.5, 4, -1, 10);
    world.addFaction("Test", system, body, 1_000, 1, 1);
    world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "solar_array"),
      world.stockpiles
    );

    const waterPlant = buildingIndexOf(data.buildingIndex, "water_plant");
    const result = startBuildingConstruction(data, world, queue, body, waterPlant, 5);
    expect(result.ok).toBe(true);
    expect(result.waitingResource).toBe(resourceIndexOf(data.resourceIndex, "metal"));
    expect(world.buildings.state[result.building]).toBe(BuildingState.UnderConstruction);
    expect(world.buildings.finishTick[result.building]).toBe(-1);
    expect(hasLogKind(world, StageOneLogKind.ConstructionWaitingMaterials)).toBe(true);

    const demand = calculateCapitalDemand(data, world);
    for (const item of data.buildings[waterPlant]?.buildCost ?? []) {
      expect(demand[item.resource]).toBe(item.amount);
      world.stockpiles.set(world.bodies.stockpile[body] ?? 0, item.resource, item.amount);
    }

    expect(advanceWaitingConstructions(data, world, queue, 6)).toBe(1);
    expect(world.buildings.finishTick[result.building]).toBe(
      6 + (data.buildings[waterPlant]?.buildDays ?? 0)
    );

    completeConstruction(
      data,
      world,
      queue,
      result.building,
      world.buildings.finishTick[result.building] ?? 0
    );
    expect(world.buildings.state[result.building]).not.toBe(BuildingState.UnderConstruction);
    expect(hasLogKind(world, StageOneLogKind.ConstructionComplete)).toBe(true);
  });

  it("guards demolition by flow and refunds an explicit material share", () => {
    const world = StageOneWorld.create(data);
    const system = world.systems.add(0, 0, 0, -1);
    const body = world.addBody(system, BodyType.Planet, 1, 0.5, 6, -1, 100);
    world.addFaction("Test", system, body, 1_000, 1, 1);
    world.buildings.addBuilt(
      data,
      world.bodies,
      body,
      buildingIndexOf(data.buildingIndex, "solar_array"),
      world.stockpiles
    );

    const foodPlant = buildingIndexOf(data.buildingIndex, "food_plant");
    const first = world.buildings.addBuilt(data, world.bodies, body, foodPlant, world.stockpiles);
    expect(canDemolishByFlow(data, world, first).ok).toBe(false);

    const second = world.buildings.addBuilt(data, world.bodies, body, foodPlant, world.stockpiles);
    const metal = resourceIndexOf(data.resourceIndex, "metal");
    const beforeMetal = world.stockpiles.get(world.bodies.stockpile[body] ?? 0, metal);
    expect(demolishBuilding(data, world, second, 10)).toBe(true);
    expect(world.buildings.state[second]).toBe(BuildingState.Demolished);
    expect(world.stockpiles.get(world.bodies.stockpile[body] ?? 0, metal)).toBeGreaterThan(
      beforeMetal
    );
    expect(hasLogKind(world, StageOneLogKind.BuildingDemolished)).toBe(true);
  });

  it("keeps energy out of transport contracts while allowing material subsidies to launch", () => {
    const world = StageOneWorld.create(data);
    const system = world.systems.add(0, 0, 0, -1);
    const source = world.addBody(system, BodyType.Planet, 1, 0.5, 4, -1, 0);
    const target = world.addBody(system, BodyType.Planet, 1, 0.5, 4, -1, 0);
    const faction = world.addFaction("Test", system, source, 1_000, 1, 1);
    world.addColony(faction, target, 0);

    const energy = data.energyResource;
    const water = resourceIndexOf(data.resourceIndex, "water");
    const sourceStockpile = world.bodies.stockpile[source] ?? 0;
    world.stockpiles.set(sourceStockpile, energy, 100);
    world.stockpiles.set(sourceStockpile, water, 100);

    const routes = new RoutePlanner();
    const contracts = new GovernmentContracts();
    const jobs = new JobBoard();
    contracts.add({ faction, targetBody: target, resource: energy, creditsPerUnit: 10 });
    jobs.update(data, world, routes, contracts);
    expect(jobs.count).toBe(0);

    contracts.add({ faction, targetBody: target, resource: water, creditsPerUnit: 10 });
    jobs.update(data, world, routes, contracts);
    expect(jobs.count).toBe(1);
    expect(jobs.resource[0]).toBe(water);

    const ship = world.addHauler(faction, system, 100, 0, 1);
    expect(launchBestLocalJob(data, world, jobs, routes, new EventQueue(), ship, 0)).toBe(
      LaunchResult.Launched
    );
  });

  it("disbands unaffordable warships and writes a reasoned treasury event", () => {
    const world = StageOneWorld.create(data);
    const system = world.systems.add(0, 0, 0, -1);
    const body = world.addBody(system, BodyType.Planet, 1, 0.5, 4, -1, 0);
    const faction = world.addFaction("Test", system, body, -1, 1, 1);
    const warship = world.addShip(faction, system, ShipRole.Warship, 0, 0, 1);

    const result = applyDailyTreasury(data, world, 3);
    expect(result.disbandedShips).toBe(1);
    expect(world.ships.state[warship]).toBe(ShipState.Disbanded);
    expect(hasLogKind(world, StageOneLogKind.FleetDisbanded)).toBe(true);
  });

  it("survives the first year with local power and warship disbanding", () => {
    const report = StageTwoSimulation.create(20260904, data).run(365, 0);

    expect(report.metrics.idleNoPower).toBe(0);
    expect(report.metrics.missedDeparturesFuel).toBeLessThanOrEqual(2);
    expect(report.metrics.disbandedShips).toBeGreaterThanOrEqual(4);
    expect(report.metrics.maxResourceZeroStreakDays).toBe(0);
    expect(report.metrics.treasuryMin).toBeGreaterThanOrEqual(-200);
  });

  it("runs fifty years without collapse, deadlock, or research stall", () => {
    const report = StageTwoSimulation.create(20260904, data).run(18_250, 0);

    expect(report.metrics.totalPopulation).toBeGreaterThan(500);
    expect(report.metrics.minPopulation).toBeGreaterThan(5);
    expect(report.metrics.idleNoPower).toBe(0);
    expect(report.metrics.idleMissingInput).toBeLessThan(90);
    expect(report.metrics.researchedTechnologies).toBeGreaterThan(1);
    expect(report.metrics.missedDeparturesFuel).toBeLessThan(10);
    expect(report.metrics.maxResourceZeroStreakDays).toBe(0);
    expect(report.metrics.treasuryMin).toBeGreaterThanOrEqual(-200);

    const findings = detectPathologies({
      seed: 20260904,
      tick: 18_250,
      stage: 2,
      metrics: report.metrics
    });
    expect(findings.filter((finding) => finding.status === "failed")).toEqual([]);
  }, 120_000);
});

function missingPhaseOneTurnover(data: StageOneData): readonly string[] {
  const produced = new Uint8Array(data.resources.length);
  const consumed = new Uint8Array(data.resources.length);
  for (const recipe of data.batchRecipes) {
    for (const output of recipe.outputs) produced[output.resource] = 1;
    for (const input of recipe.inputs) consumed[input.resource] = 1;
  }
  for (const process of data.continuous) {
    for (const output of process.outputsPerTick) produced[output.resource] = 1;
    for (const input of process.inputsPerTick) consumed[input.resource] = 1;
  }
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0) consumed[resource] = 1;
  }
  for (const sink of data.sinks) {
    for (const resource of sink.consumes) consumed[resource] = 1;
  }

  const missing: string[] = [];
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    if ((data.phase[resource] ?? 0) !== 1) continue;
    if (produced[resource] !== 1 || consumed[resource] !== 1) {
      missing.push(data.resources[resource]?.id ?? String(resource));
    }
  }
  return missing;
}

function findOwnedBodyWithFeature(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  feature: string
): number {
  const mask = featureMaskFromNames(data.featureIndex, [feature]);
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    if (world.bodies.hasFeatureMask(body, mask)) return body;
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  throw new Error(`No owned body has feature ${feature}.`);
}

function findOwnedBodyOfType(world: StageOneWorld, faction: number, type: BodyType): number {
  let body = world.factions.firstColony[faction] ?? -1;
  while (body >= 0) {
    if ((world.bodies.type[body] ?? 0) === type) return body;
    body = world.bodies.nextInFaction[body] ?? -1;
  }
  throw new Error(`No owned body has type ${type}.`);
}

function findBuildingOnBody(world: StageOneWorld, body: number, buildingType: number): number {
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if ((world.buildings.type[building] ?? -1) === buildingType) return building;
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return -1;
}

function hasLogKind(world: StageOneWorld, kind: StageOneLogKind): boolean {
  for (let row = 0; row < world.eventLog.length; row += 1) {
    if (world.eventLog.kind[row] === kind) return true;
  }
  return false;
}
