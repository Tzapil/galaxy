import { describe, expect, it } from "vitest";
import {
  BodyType,
  IntelSource,
  MAX_HIDDEN_HATRED,
  MAX_WAR_EXHAUSTION,
  RelationStatus,
  Rng,
  RoutePlanner,
  SECESSION_MIN_HIGH_TICKS,
  ShipRole,
  StageOneLogKind,
  StageOneWorld,
  TreatyType,
  administrativeCapacity,
  advanceRepression,
  advanceWarExhaustion,
  assessThreat,
  attemptRegionSecession,
  calculateRegionTension,
  declareWarForCasusBelli,
  endTreatyAsBreach,
  evaluatePeaceTerms,
  evaluateWarDecision,
  executeForeignTrade,
  findCasusBelli,
  formatCasusBelliReason,
  formatSecessionReason,
  negotiateTreaty,
  powerConcentrationIndex,
  recordWarCost,
  regionalDistanceOrigin,
  seekPeace,
  updateCoalitionTreaties,
  type AiBottleneck,
  type PeaceTerms,
  type StageOneData
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "../src/stage-two-loader.js";

describe("Stage 7.1 relations and MRP casus belli", () => {
  it("stores status, directional opinion and bounded history in the pair matrix", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    scenario.world.relations.setStatus(0, 1, RelationStatus.NonAggression, 500);
    scenario.world.relations.setOpinion(0, 1, 22);
    scenario.world.relations.recordTreatyBreach(1, 0);
    expect(scenario.world.relations.length).toBe(1);
    expect(scenario.world.relations.relationStatus(0, 1, 10)).toBe(RelationStatus.NonAggression);
    expect(scenario.world.relations.opinion(0, 1)).toBe(-13);
    expect(scenario.world.relations.brokenTreaties[0]).toBe(1);
  });

  it("does not invent a war target without an MRP deficit", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    expect(
      findCasusBelli(data, scenario.world, new RoutePlanner(), 0, undefined, 0)
    ).toBeUndefined();
  });

  it("declares against a weaker reachable supplier and records a concrete reason", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    const resource = requiredIndex(data.resourceIndex, "crystals");
    const fuel = requiredIndex(data.resourceIndex, "fuel");
    fill(scenario.world, scenario.bodies[0] ?? 0, fuel, 500);
    fill(scenario.world, scenario.bodies[1] ?? 0, resource, 500);
    scenario.world.addShip(0, 0, ShipRole.Warship, 0, 100, 1);
    scenario.world.addShip(0, 0, ShipRole.Warship, 0, 100, 1);
    scenario.world.addShip(1, 1, ShipRole.Warship, 0, 100, 1);
    scenario.world.intel.record(0, 1, IntelSource.Battle, 0, emptyProfile(100));
    const bottleneck = shortage(resource);
    const cb = findCasusBelli(data, scenario.world, new RoutePlanner(), 0, bottleneck, 0);
    expect(cb).toMatchObject({ defender: 1, resource, targetSystem: 1 });
    const result = declareWarForCasusBelli(data, scenario.world, required(cb), 0, Rng.fromSeed(7));
    expect(result.declare).toBe(true);
    expect(scenario.world.wars.isHostile(0, 1)).toBe(true);
    expect(formatCasusBelliReason(data, required(cb))).toContain("crystals");
    expect(formatCasusBelliReason(data, required(cb))).toContain("система 1");
    expect(lastLogKind(scenario.world)).toBe(StageOneLogKind.WarDeclared);
  });

  it("blocks a third front, an unreachable fuel budget and insufficient force", () => {
    const base = {
      need: 3,
      capable: 2,
      price: 1,
      history: 0,
      personality: 1,
      hegemon: 1,
      ownStrength: 200,
      enemyStrength: 100,
      availableFuel: 100,
      requiredFuel: 20,
      activeWars: 0
    };
    expect(evaluateWarDecision({ ...base, activeWars: 2 }).reason).toBe("fronts");
    expect(evaluateWarDecision({ ...base, availableFuel: 0 }).reason).toBe("fuel");
    expect(evaluateWarDecision({ ...base, ownStrength: 50 }).reason).toBe("strength");
  });

  it("keeps a truce binding when another treaty becomes the displayed relation status", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    const fuel = requiredIndex(data.resourceIndex, "fuel");
    fill(scenario.world, scenario.bodies[0] ?? 0, fuel, 500);
    scenario.world.addShip(0, 0, ShipRole.Warship, 0, 100, 1);
    scenario.world.addShip(0, 0, ShipRole.Warship, 0, 100, 1);
    scenario.world.addShip(1, 1, ShipRole.Warship, 0, 100, 1);
    scenario.world.intel.record(0, 1, IntelSource.Battle, 0, emptyProfile(100));
    for (const type of [TreatyType.Truce, TreatyType.TradeAgreement]) {
      negotiateTreaty(
        scenario.world,
        { type, factionA: 0, factionB: 1, utilityA: 1, utilityB: 1, durationTicks: 365 },
        type
      );
    }
    const result = declareWarForCasusBelli(
      data,
      scenario.world,
      {
        attacker: 0,
        defender: 1,
        resource: 0,
        targetSystem: 1,
        routeJumps: 1,
        routeFuelCost: 10,
        need: 3
      },
      10,
      Rng.fromSeed(8)
    );
    expect(scenario.world.relations.relationStatus(0, 1, 10)).toBe(RelationStatus.TradeAgreement);
    expect(result).toMatchObject({ declare: false, reason: "treaty" });
  });
});

describe("Stage 7.2 treaties, passage and foreign trade", () => {
  it("supports all five treaty types and rejects unilateral offers", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    const types = [
      TreatyType.Truce,
      TreatyType.NonAggression,
      TreatyType.TradeAgreement,
      TreatyType.Passage,
      TreatyType.DefensiveAlliance
    ];
    for (const type of types) {
      expect(
        negotiateTreaty(
          scenario.world,
          { type, factionA: 0, factionB: 1, utilityA: 1, utilityB: 1, durationTicks: 365 },
          type * 10
        ).accepted
      ).toBe(true);
    }
    expect(scenario.world.treaties.length).toBe(5);
    expect(
      negotiateTreaty(
        scenario.world,
        {
          type: TreatyType.TradeAgreement,
          factionA: 0,
          factionB: 1,
          utilityA: 5,
          utilityB: -0.1,
          durationTicks: 365
        },
        100
      ).accepted
    ).toBe(false);
  });

  it("trades at a price between shadow prices and moves real treasury credits", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    const resource = requiredIndex(data.resourceIndex, "metal");
    fill(scenario.world, scenario.bodies[0] ?? 0, resource, 900);
    fill(scenario.world, scenario.bodies[1] ?? 0, resource, 0);
    scenario.world.prices.recalculate(
      data,
      scenario.world.bodies,
      scenario.world.stockpiles,
      scenario.world.buildings
    );
    negotiateTreaty(
      scenario.world,
      {
        type: TreatyType.TradeAgreement,
        factionA: 0,
        factionB: 1,
        utilityA: 1,
        utilityB: 1,
        durationTicks: 365
      },
      0
    );
    const sellerBefore = scenario.world.factions.treasury[0] ?? 0;
    const buyerBefore = scenario.world.factions.treasury[1] ?? 0;
    const result = executeForeignTrade(data, scenario.world, 0, 1, resource, 20, 1);
    expect(result?.traded).toBe(true);
    expect(result?.negotiatedPrice).toBeGreaterThanOrEqual(result?.sellerShadowPrice ?? Infinity);
    expect(result?.negotiatedPrice).toBeLessThanOrEqual(result?.buyerShadowPrice ?? -Infinity);
    expect(scenario.world.factions.treasury[0]).toBeGreaterThan(sellerBefore);
    expect(scenario.world.factions.treasury[1]).toBeLessThan(buyerBefore);
  });

  it("revoking passage changes a transit route immediately and breach damages history", async () => {
    const data = await loadStageTwoData();
    const world = StageOneWorld.create(data);
    const systems = addChain(world, 3, [0, 1, 0]);
    const bodyA = addOwnedBody(world, systems[0] ?? 0);
    const bodyB = addOwnedBody(world, systems[1] ?? 1);
    const bodyC = addOwnedBody(world, systems[2] ?? 2);
    world.addFaction("A", 0, bodyA, 1_000, 1, 1);
    world.addFaction("B", 1, bodyB, 1_000, 1, 1);
    world.addColony(0, bodyC, 100);
    world.systems.owner[2] = 0;
    const routes = new RoutePlanner();
    expect(routes.find(world.systems, world.gates, 0, 2, 0, world.navigation, 5).reachable).toBe(
      false
    );
    const offer = negotiateTreaty(
      world,
      {
        type: TreatyType.Passage,
        factionA: 0,
        factionB: 1,
        utilityA: 2,
        utilityB: 1,
        durationTicks: 365
      },
      5
    );
    expect(routes.find(world.systems, world.gates, 0, 2, 0, world.navigation, 5).reachable).toBe(
      true
    );
    expect(endTreatyAsBreach(world.treaties, world.relations, offer.treaty, 1, 5)).toBe(true);
    expect(routes.find(world.systems, world.gates, 0, 2, 0, world.navigation, 5).reachable).toBe(
      false
    );
    expect(world.relations.opinion(0, 1)).toBeLessThan(0);
  });
});

describe("Stage 7.3 war exhaustion and peace", () => {
  it("accumulates from losses, is capped, and recovers in peace", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    recordWarCost(scenario.world, 0, { shipsLost: 1_000, populationLost: 1e9, creditsSpent: 1e12 });
    expect(scenario.world.factionDynamics.warExhaustion[0]).toBe(MAX_WAR_EXHAUSTION);
    advanceWarExhaustion(scenario.world);
    expect(scenario.world.factionDynamics.warExhaustion[0]).toBeLessThan(MAX_WAR_EXHAUSTION);
  });

  it("seeks peace after reaching the resource-system goal and records the reason", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    const resource = requiredIndex(data.resourceIndex, "crystals");
    const war = scenario.world.wars.declare(0, 1, 0);
    scenario.world.warGoals.add(war, 0, 1, resource, 1, 3, 100);
    scenario.world.systems.owner[1] = 0;
    const result = seekPeace(scenario.world, war, 365);
    expect(result).toMatchObject({ concluded: true, reason: "goal-achieved" });
    expect(lastLogKind(scenario.world)).toBe(StageOneLogKind.PeaceConcluded);
    expect(scenario.world.relations.relationStatus(0, 1, 365)).toBe(RelationStatus.Truce);
  });

  it("high exhaustion accepts adverse terms and duration prevents eternal war", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2);
    const war = scenario.world.wars.declare(0, 1, 0);
    scenario.world.factionDynamics.warExhaustion[0] = 90;
    scenario.world.factionDynamics.warExhaustion[1] = 90;
    const adverse: PeaceTerms = {
      cededSystem: 0,
      recipient: 1,
      reparations: 0,
      reparationsRecipient: -1,
      tradeConcessionTo: -1
    };
    expect(evaluatePeaceTerms(scenario.world, war, adverse).mutuallyAcceptable).toBe(true);
    expect(seekPeace(scenario.world, war, 1, adverse).concluded).toBe(true);

    const secondWar = scenario.world.wars.declare(0, 1, 2);
    scenario.world.factionDynamics.warExhaustion[0] = 0;
    scenario.world.factionDynamics.warExhaustion[1] = 0;
    expect(seekPeace(scenario.world, secondWar, 102 * 365).concluded).toBe(true);
  });

  it("charges reparations to the correct war party and activates a trade concession", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 3);
    const war = scenario.world.wars.declare(0, 1, 0);
    scenario.world.wars.declare(0, 2, 1);
    scenario.world.factionDynamics.warExhaustion[0] = 90;
    scenario.world.factionDynamics.warExhaustion[1] = 90;
    const payerBefore = scenario.world.factions.treasury[1] ?? 0;
    const unrelatedBefore = scenario.world.factions.treasury[2] ?? 0;
    const terms: PeaceTerms = {
      cededSystem: -1,
      recipient: -1,
      reparations: 1_000,
      reparationsRecipient: 0,
      tradeConcessionTo: 0
    };
    expect(seekPeace(scenario.world, war, 2, terms).concluded).toBe(true);
    expect(scenario.world.factions.treasury[1]).toBe(payerBefore - 1_000);
    expect(scenario.world.factions.treasury[2]).toBe(unrelatedBefore);
    expect(
      scenario.world.treaties.activeBetween(TreatyType.TradeAgreement, 0, 1, 2)
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("Stage 7.4 utility coalitions", () => {
  it("forms against a multi-axis hegemon, affects concentration, and dissolves after weakening", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 4, 16);
    for (let system = 4; system < 16; system += 1) {
      scenario.world.systems.owner[system] = 0;
      const body = scenario.bodies[system] ?? -1;
      scenario.world.bodies.owner[body] = 0;
      scenario.world.bodies.population[body] = 500;
    }
    scenario.world.factions.rebuildColoniesFromOwners(scenario.world.bodies);
    expect(assessThreat(scenario.world, 1, 0).absoluteShare).toBeGreaterThan(0.4);
    expect(powerConcentrationIndex(scenario.world)).toBeGreaterThan(0.25);
    expect(updateCoalitionTreaties(scenario.world, 365)).toBeGreaterThan(0);
    expect(
      scenario.world.treaties.activeBetween(TreatyType.DefensiveAlliance, 1, 2, 365, 0)
    ).toBeGreaterThanOrEqual(0);

    for (let system = 0; system < 16; system += 1) {
      const owner = system % 4;
      scenario.world.systems.owner[system] = owner;
      scenario.world.bodies.owner[scenario.bodies[system] ?? -1] = owner;
      scenario.world.bodies.population[scenario.bodies[system] ?? -1] = 100;
    }
    scenario.world.factions.rebuildColoniesFromOwners(scenario.world.bodies);
    updateCoalitionTreaties(scenario.world, 730);
    const alliance = scenario.world.treaties.activeBetween(
      TreatyType.DefensiveAlliance,
      1,
      2,
      730,
      0
    );
    expect(alliance).toBe(-1);
  });

  it("does not create a coalition against an equal neighbor", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 3, 6);
    expect(updateCoalitionTreaties(scenario.world, 365)).toBe(0);
  });
});

describe("Stage 7.5-7.6 cohesion and three retention strategies", () => {
  it("applies conquest freshness only to conquered colonies (F5)", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 1, 2);
    scenario.world.addColony(0, scenario.bodies[1] ?? 1, 100, 100);
    const founded = calculateRegionTension(data, scenario.world, 0, 1, 101);
    expect(founded.freshness).toBe(0);
    expect(founded.culturalForeignness).toBe(0);
    scenario.world.colonyHistory.recordCaptured(scenario.bodies[1] ?? 1, 1, 100);
    scenario.world.colonyHistory.foundedBy[scenario.bodies[1] ?? 1] = 1;
    const conquered = calculateRegionTension(data, scenario.world, 0, 1, 101);
    expect(conquered.freshness).toBeGreaterThan(0);
    expect(conquered.culturalForeignness).toBeGreaterThan(0);
  });

  it("better food supply lowers tension without a farming special case", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 1);
    const food = requiredIndex(data.resourceIndex, "food");
    fill(scenario.world, scenario.bodies[0] ?? 0, food, 0);
    const hungry = calculateRegionTension(data, scenario.world, 0, 0, 0);
    fill(scenario.world, scenario.bodies[0] ?? 0, food, 10_000);
    const fed = calculateRegionTension(data, scenario.world, 0, 0, 0);
    expect(fed.vitalShortage).toBeLessThan(hungry.vitalShortage);
    expect(fed.total).toBeLessThan(hungry.total);
  });

  it("secedes only after sustained tension and transfers colonies, fleet and industry", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 2, 24);
    for (let system = 1; system < 24; system += 1) {
      scenario.world.addColony(0, scenario.bodies[system] ?? system, 100, 0);
      scenario.world.systems.owner[system] = 0;
    }
    scenario.world.factions.rebuildColoniesFromOwners(scenario.world.bodies);
    scenario.world.factionDynamics.endFaction(1, 0);
    const factionRowsBefore = scenario.world.factions.length;
    const remoteBody = scenario.bodies[1] ?? 1;
    const building = requiredIndex(data.buildingIndex, "mine");
    scenario.world.buildings.addBuilt(data, scenario.world.bodies, remoteBody, building);
    const fleet = scenario.world.fleets.add(0, 0, 1, 1, 0);
    const ship = scenario.world.addShip(0, 1, ShipRole.Warship, 0, 100, 1);
    scenario.world.fleets.addShip(fleet, scenario.world.ships.ref(ship), scenario.world.ships);
    const tick = SECESSION_MIN_HIGH_TICKS + 365;
    const row = scenario.world.cohesion.row(0, 1, true);
    scenario.world.cohesion.highSinceTick[row] = 0;
    const result = attemptRegionSecession(data, scenario.world, 0, 1, tick, Rng.fromSeed(1), 1);
    expect(result.occurred).toBe(true);
    expect(result.newFaction).toBe(1);
    expect(scenario.world.factions.length).toBe(factionRowsBefore);
    expect(result.breakdown.total).toBeGreaterThanOrEqual(40);
    expect(scenario.world.bodies.owner[remoteBody]).toBe(result.newFaction);
    expect(scenario.world.fleets.owner[fleet.index]).toBe(result.newFaction);
    expect(scenario.world.ships.faction[ship]).toBe(result.newFaction);
    expect(scenario.world.buildings.body[0]).toBe(remoteBody);
    expect(scenario.world.relations.opinion(result.newFaction, 0)).toBeLessThan(0);
    expect(formatSecessionReason(result)).toContain(result.dominantComponent);
    expect(lastLogKind(scenario.world)).toBe(StageOneLogKind.Secession);
  });

  it("administrative technologies and buildings grow bounded capacity", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 1);
    const early = administrativeCapacity(scenario.world, 0).total;
    for (let tech = 0; tech < data.techs.length; tech += 1) {
      if (data.techs[tech]?.branch === "administration") {
        scenario.world.techState.markResearched(0, tech);
      }
    }
    scenario.world.techModifiers.recalculateFaction(data, scenario.world.techState, 0);
    for (const id of ["admin_center", "comm_hub", "garrison"]) {
      scenario.world.buildings.addBuilt(
        data,
        scenario.world.bodies,
        scenario.bodies[0] ?? 0,
        requiredIndex(data.buildingIndex, id)
      );
    }
    const late = administrativeCapacity(scenario.world, 0).total;
    expect(early).toBeGreaterThanOrEqual(8);
    expect(early).toBeLessThan(12);
    expect(late).toBeGreaterThan(40);
    expect(late).toBeLessThanOrEqual(10_000);
  });

  it("a regional capital changes the distance origin and lowers its region tension", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 1, 6);
    for (let system = 1; system < 6; system += 1) {
      scenario.world.addColony(0, scenario.bodies[system] ?? system, 100, 0);
      scenario.world.systems.owner[system] = 0;
    }
    const before = calculateRegionTension(data, scenario.world, 0, 1, 0);
    scenario.world.buildings.addBuilt(
      data,
      scenario.world.bodies,
      scenario.bodies[4] ?? 4,
      requiredIndex(data.buildingIndex, "regional_capital")
    );
    const after = calculateRegionTension(data, scenario.world, 0, 1, 0);
    expect(regionalDistanceOrigin(scenario.world, 0, 1)).toBe(4);
    expect(after.distance).toBeLessThan(before.distance);
  });

  it("repression buys immediate relief but releases a larger delayed backlash", async () => {
    const data = await loadStageTwoData();
    const scenario = makeWorld(data, 1);
    const garrison = scenario.world.buildings.addBuilt(
      data,
      scenario.world.bodies,
      scenario.bodies[0] ?? 0,
      requiredIndex(data.buildingIndex, "garrison")
    );
    let effect = advanceRepression(scenario.world, 0, 0, 200);
    expect(effect.immediateRelief).toBeGreaterThan(0);
    expect(effect.hiddenHatred).toBe(MAX_HIDDEN_HATRED);
    scenario.world.buildings.markDemolished(data, scenario.world.bodies, garrison);
    effect = advanceRepression(scenario.world, 0, 0, 1);
    expect(effect.immediateRelief).toBe(0);
    expect(effect.releasedHatred).toBeGreaterThan(0);
  });
});

interface WorldScenario {
  readonly world: StageOneWorld;
  readonly bodies: readonly number[];
}

function makeWorld(data: StageOneData, factions: number, systemCount = factions): WorldScenario {
  const world = StageOneWorld.create(data, { systems: systemCount + 2, bodies: systemCount + 2 });
  const owners: number[] = [];
  for (let system = 0; system < systemCount; system += 1) owners.push(system % factions);
  const systems = addChain(world, systemCount, owners);
  const bodies: number[] = [];
  for (let system = 0; system < systemCount; system += 1) {
    bodies.push(addOwnedBody(world, systems[system] ?? system));
  }
  for (let faction = 0; faction < factions; faction += 1) {
    const system = faction;
    world.addFaction(`Faction ${faction}`, system, bodies[system] ?? 0, 1_000_000, 1, 1);
  }
  return { world, bodies };
}

function addChain(world: StageOneWorld, count: number, owners: readonly number[]): number[] {
  const systems: number[] = [];
  for (let i = 0; i < count; i += 1) {
    systems.push(world.systems.add(i * 10, 0, i === 0 ? 0 : 1, owners[i] ?? -1));
    if (i > 0) world.gates.addUndirected(world.systems, i - 1, i, 1);
  }
  return systems;
}

function addOwnedBody(world: StageOneWorld, system: number): number {
  return world.addBody(system, BodyType.Planet, 1, 0.8, 20, -1, 100);
}

function fill(world: StageOneWorld, body: number, resource: number, amount: number): void {
  const stockpile = world.bodies.stockpile[body] ?? -1;
  world.stockpiles.setCapacity(stockpile, resource, Math.max(10_000, amount));
  world.stockpiles.set(stockpile, resource, amount);
}

function shortage(resource: number): AiBottleneck {
  return {
    resource,
    demandPerDay: 4,
    supplyPerDay: 0,
    deficitPerDay: 4,
    stockDays: 0,
    operations: 1
  };
}

function emptyProfile(strength: number) {
  return {
    strength,
    kineticFraction: 0.25,
    laserFraction: 0.25,
    missileFraction: 0.25,
    plasmaFraction: 0.25,
    shieldFraction: 0.5,
    armorRating: 20
  };
}

function lastLogKind(world: StageOneWorld): StageOneLogKind {
  let bestRow = -1;
  let bestSerial = -1;
  for (let row = 0; row < world.eventLog.length; row += 1) {
    if ((world.eventLog.serial[row] ?? -1) > bestSerial) {
      bestSerial = world.eventLog.serial[row] ?? -1;
      bestRow = row;
    }
  }
  return world.eventLog.kind[bestRow] as StageOneLogKind;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a value.");
  return value;
}

function requiredIndex(index: ReadonlyMap<string, number>, id: string): number {
  const value = index.get(id);
  if (value === undefined) throw new Error(`Missing data id ${id}.`);
  return value;
}
