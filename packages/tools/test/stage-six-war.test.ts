import { beforeAll, describe, expect, it } from "vitest";

import {
  BlockadeReaction,
  BodyType,
  CombatBand,
  CombatLogKind,
  CombatRoundScratch,
  EventQueue,
  JobBoard,
  Rng,
  RoutePlanner,
  ShipRole,
  ShipyardOrderState,
  StageOneWorld,
  StageTwoSimulation,
  applyLayeredDamage,
  bestDesign,
  calculateDesignStats,
  checkWithdrawal,
  chooseBlockadeReaction,
  clearBlockade,
  createBattle,
  defenseTaskForThreat,
  endSiege,
  establishBlockade,
  establishOrbitalSuperiority,
  estimateIntel,
  findLogisticsBottleneck,
  fleetSpeed,
  garrisonStrength,
  interceptDamage,
  invadeColony,
  launchFleet,
  observeFleetAfterBattle,
  queueShipBuild,
  reinforceBattle,
  resolveBattleRound,
  scoutSystem,
  startSiege,
  type BestDesignResult,
  type EntityRef,
  type ShipDesign,
  type StageOneData
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "../src/stage-two-loader.js";
import { evaluateDuelMatrix } from "../src/stage-six-bench.js";

let data: StageOneData;

beforeAll(async () => {
  data = await loadStageTwoData();
});

describe("Stage 6 fleets and combat", () => {
  it("keeps all four edges of the fair-budget counter-design cycle", () => {
    const matrix = evaluateDuelMatrix(data);
    expect(matrix.cycleEdges).toBe(4);
    expect(matrix.maxBudgetGapFraction).toBeLessThan(0.03);
  });

  it("moves at the slowest member speed, charges fuel atomically, and invalidates disbanded refs", () => {
    const setup = militaryWorld();
    const fastBlueprint = addBlueprint(setup.world, setup.a, "raider", "corvette", [
      "reactor_t2",
      "thruster_t2",
      "thruster_t2",
      "missile_t1",
      "missile_t1",
      "armor_t1"
    ]);
    const slowBlueprint = addBlueprint(setup.world, setup.a, "trooper", "troopship", [
      "reactor_t2",
      "thruster_t1",
      "troop_bay_t1",
      "troop_bay_t1"
    ]);
    const fast = setup.world.addShip(
      setup.a,
      setup.left,
      ShipRole.Warship,
      0,
      100,
      2,
      fastBlueprint
    );
    const slow = setup.world.addShip(
      setup.a,
      setup.left,
      ShipRole.Warship,
      0,
      100,
      2,
      slowBlueprint
    );
    const fleet = setup.world.fleets.add(setup.a, doctrine("raider"), setup.left, setup.left, 0);
    expect(setup.world.fleets.addShip(fleet, setup.world.ships.ref(fast), setup.world.ships)).toBe(
      true
    );
    expect(setup.world.fleets.addShip(fleet, setup.world.ships.ref(slow), setup.world.ships)).toBe(
      true
    );

    const expectedSlow = setup.world.blueprints.speed[slowBlueprint] ?? 0;
    expect(fleetSpeed(setup.world, fleet)).toBeCloseTo(expectedSlow);
    setup.world.ships.fuelTank[slow] = 0;
    const beforeFastFuel = setup.world.ships.fuelTank[fast] ?? 0;
    expect(
      launchFleet(setup.world, new RoutePlanner(), new EventQueue(), fleet, setup.right, 1)
    ).toMatchObject({ ok: false, reason: "noFuel" });
    expect(setup.world.ships.fuelTank[fast]).toBe(beforeFastFuel);

    setup.world.ships.fuelTank[slow] = 100;
    const launch = launchFleet(
      setup.world,
      new RoutePlanner(),
      new EventQueue(),
      fleet,
      setup.right,
      2
    );
    expect(launch.ok).toBe(true);
    expect(launch.arriveTick).toBe(2 + Math.max(1, Math.ceil(10 / expectedSlow)));

    const oldFleet = { ...fleet };
    expect(setup.world.fleets.disband(fleet, setup.world.ships)).toBe(true);
    expect(setup.world.fleets.isAlive(oldFleet)).toBe(false);
    expect(setup.world.fleets.fleetOfShip(setup.world.ships.ref(fast), setup.world.ships)).toBe(-1);
  });

  it("applies layered damage, the 60% intercept cap, and speed-aware pursuit", () => {
    const hit = applyLayeredDamage({ shield: 50, armorRating: 90, structure: 100 }, 100, 1, 1);
    expect(hit.shield).toBe(0);
    expect(hit.armorPrevented).toBeCloseTo(25);
    expect(hit.structure).toBeCloseTo(75);
    expect(interceptDamage(100, 1_000)).toEqual({
      damage: 40,
      absorbed: 60,
      interceptRemaining: 940
    });
    expect(checkWithdrawal(0.5, 0.1, 0.4, 12, 6, 100, 200, 1.2)).toMatchObject({
      wantsToWithdraw: true,
      escaped: true,
      pursued: true
    });
    expect(checkWithdrawal(0.5, 0.1, 0.4, 4, 8, 100, 200, 1.2).escaped).toBe(false);
  });

  it("keeps fire simultaneous when battle sides are swapped and writes a replayable log", () => {
    const forward = symmetricBattle(false);
    const reverse = symmetricBattle(true);
    expect(forward.winner).toBe(reverse.winner);
    expect(forward.survivors).toEqual(reverse.survivors);
    expect(forward.rounds).toBeLessThanOrEqual(40);
    expect(forward.shots).toBeGreaterThan(0);
    expect(forward.terminalEvents).toBe(1);
  });

  it("lets a faster long-range fleet control distance and accepts next-round reinforcements", () => {
    const setup = militaryWorld();
    const missile = addBlueprint(setup.world, setup.a, "raider", "corvette", [
      "reactor_t2",
      "thruster_t2",
      "thruster_t2",
      "missile_t1",
      "missile_t1",
      "armor_t1"
    ]);
    const kinetic = addBlueprint(setup.world, setup.b, "line_battle", "cruiser", [
      "reactor_t2",
      "thruster_t1",
      "kinetic_t2",
      "kinetic_t2",
      "armor_t2",
      "armor_t2"
    ]);
    const raiders = fleetWithShips(setup.world, setup.a, setup.left, "raider", missile, 2);
    const line = fleetWithShips(setup.world, setup.b, setup.left, "line_battle", kinetic, 1);
    const reserve = fleetWithShips(setup.world, setup.b, setup.left, "line_battle", kinetic, 1);
    setup.world.wars.declare(setup.a, setup.b, 0);
    const battle = createBattle(setup.world, raiders, line, 0);
    expect(battle).toBeDefined();
    if (battle === undefined) throw new Error("battle was not created");
    const scratch = new CombatRoundScratch();
    const first = resolveBattleRound(setup.world, battle, 1, scratch);
    expect(first.band).toBe(CombatBand.Long);
    expect(reinforceBattle(setup.world, battle, reserve, 1)).toBe(1);
    const joined = findBattleShip(setup.world, reserve);
    expect(setup.world.battles.shipJoinedRound[joined]).toBe(2);
    resolveBattleRound(setup.world, battle, 2, scratch);
    expect(countCombatLog(setup.world, CombatLogKind.Reinforced)).toBe(1);
  });

  it("round-trips active Stage 6 state without changing its deterministic hash", () => {
    const setup = militaryWorld(false);
    const blueprintA = addBlueprint(setup.world, setup.a, "raider", "corvette", [
      "reactor_t2",
      "thruster_t2",
      "missile_t1",
      "armor_t1"
    ]);
    const blueprintB = addBlueprint(setup.world, setup.b, "line_battle", "corvette", [
      "reactor_t1",
      "thruster_t1",
      "kinetic_t1",
      "armor_t1"
    ]);
    const fleetA = fleetWithShips(setup.world, setup.a, setup.left, "raider", blueprintA, 1);
    const fleetB = fleetWithShips(setup.world, setup.b, setup.left, "line_battle", blueprintB, 1);
    setup.world.wars.declare(setup.a, setup.b, 2);
    const battle = createBattle(setup.world, fleetA, fleetB, 3);
    if (battle === undefined) throw new Error("battle was not created");
    expect(observeFleetAfterBattle(setup.world, setup.a, fleetB.index, 4)).toBeGreaterThanOrEqual(
      0
    );

    const sim = StageTwoSimulation.createFromWorld(56, data, setup.world);
    const restored = StageTwoSimulation.fromSnapshot(sim.snapshot(), data);

    const changedColumns: string[] = [];
    for (const originalArena of sim.world.arenas()) {
      const restoredArena = restored.world
        .arenas()
        .find((candidate) => candidate.name === originalArena.name);
      if (restoredArena === undefined) {
        changedColumns.push(`${originalArena.name} (missing)`);
        continue;
      }
      for (const originalColumn of originalArena.columns) {
        const restoredColumn = restoredArena.columns.find(
          (candidate) => candidate.name === originalColumn.name
        );
        if (
          restoredColumn === undefined ||
          originalColumn.data.length !== restoredColumn.data.length ||
          originalColumn.data.some((value, index) => value !== restoredColumn.data[index])
        ) {
          changedColumns.push(`${originalArena.name}.${originalColumn.name}`);
        }
      }
    }
    expect(changedColumns).toEqual([]);
    expect(restored.hash()).toBe(sim.hash());
    expect(restored.world.fleets.length).toBe(2);
    expect(restored.world.fleets.memberLength).toBe(2);
    expect(restored.world.wars.isHostile(setup.a, setup.b)).toBe(true);
    expect(restored.world.battles.isActive(battle)).toBe(true);
    expect(restored.world.intel.length).toBe(1);
    expect(restored.world.colonyHistory.foundedBy[setup.bodyA]).toBe(setup.a);
  });
});

describe("Stage 6 blockades, intel, and conquest", () => {
  it("blocks enemies but not owner/neutral, restores routes, and selects all three AI reactions", () => {
    const setup = militaryWorld(true);
    const blueprint = addBlueprint(setup.world, setup.a, "line_battle", "corvette", [
      "reactor_t1",
      "thruster_t1",
      "thruster_t1",
      "kinetic_t1",
      "armor_t1"
    ]);
    const fleet = fleetWithShips(setup.world, setup.a, setup.left, "line_battle", blueprint, 1);
    setup.world.wars.declare(setup.a, setup.b, 0);
    expect(establishBlockade(setup.world, fleet, 0, 1)).toBe(true);
    const routes = new RoutePlanner();
    expect(
      routes.find(
        setup.world.systems,
        setup.world.gates,
        setup.left,
        setup.right,
        setup.a,
        setup.world.wars
      ).reachable
    ).toBe(true);
    expect(
      routes.find(
        setup.world.systems,
        setup.world.gates,
        setup.left,
        setup.right,
        setup.b,
        setup.world.wars
      ).reachable
    ).toBe(false);
    expect(
      routes.find(
        setup.world.systems,
        setup.world.gates,
        setup.left,
        setup.right,
        setup.neutral,
        setup.world.wars
      ).reachable
    ).toBe(true);

    const reactions = [
      chooseBlockadeReaction(
        setup.world,
        setup.b,
        0,
        pressure(1_000, 100, 10, 100, 1_000, 1_000),
        2
      ).reaction,
      chooseBlockadeReaction(setup.world, setup.b, 0, pressure(10, 1, 100, 10_000, 1_000, 1_000), 3)
        .reaction,
      chooseBlockadeReaction(setup.world, setup.b, 0, pressure(100, 1, 1_000, 1, 1, 1), 4).reaction
    ];
    expect(reactions).toEqual([
      BlockadeReaction.BreakWithFleet,
      BlockadeReaction.EscortConvoys,
      BlockadeReaction.RerouteEconomy
    ]);
    expect(clearBlockade(setup.world, 0, 5)).toBe(true);
    expect(
      routes.find(
        setup.world.systems,
        setup.world.gates,
        setup.left,
        setup.right,
        setup.b,
        setup.world.wars
      ).reachable
    ).toBe(true);
  });

  it("cuts kit logistics so scarcity rises and the shipyard remains stopped without war-specific price code", () => {
    const setup = blockadeEconomyWorld();
    const before = setup.world.prices.price(setup.yard, setup.component);
    const jobs = new JobBoard(80);
    jobs.update(data, setup.world, new RoutePlanner());
    expect(jobs.count).toBeGreaterThan(0);

    expect(establishBlockade(setup.world, setup.blockader, 0, 1)).toBe(true);
    jobs.update(data, setup.world, new RoutePlanner());
    expect(jobs.count).toBe(0);
    setup.world.stockpiles.set(setup.world.bodies.stockpile[setup.yard] ?? 0, setup.component, 0);
    setup.world.prices.recalculate(
      data,
      setup.world.bodies,
      setup.world.stockpiles,
      setup.world.buildings
    );
    expect(setup.world.prices.price(setup.yard, setup.component)).toBeGreaterThan(before);
    expect(setup.world.shipyardOrders.state[setup.order]).toBe(ShipyardOrderState.GatheringKit);
    expect(
      findLogisticsBottleneck(
        data,
        setup.world,
        new RoutePlanner(),
        setup.world.bodies.owner[setup.yard] ?? -1
      )?.resource
    ).toBe(setup.component);

    clearBlockade(setup.world, 0, 2);
    jobs.update(data, setup.world, new RoutePlanner());
    expect(jobs.count).toBeGreaterThan(0);
  });

  it("ages deterministic intelligence and feeds enemy weapons into autodesign", () => {
    const setup = militaryWorld();
    const laserBlueprint = addBlueprint(setup.world, setup.b, "line_battle", "cruiser", [
      "reactor_t3",
      "reactor_t3",
      "thruster_t2",
      "laser_t2",
      "laser_t2",
      "armor_t1"
    ]);
    const enemy = fleetWithShips(
      setup.world,
      setup.b,
      setup.left,
      "line_battle",
      laserBlueprint,
      2
    );
    observeFleetAfterBattle(setup.world, setup.a, enemy.index, 10);
    const rng = Rng.fromSeed(44);
    const fresh = estimateIntel(setup.world.intel, setup.a, setup.b, 10, rng);
    const old = estimateIntel(setup.world.intel, setup.a, setup.b, 3660, rng);
    expect(fresh).toBeDefined();
    expect(old).toBeDefined();
    expect(old?.errorFraction).toBeGreaterThan(fresh?.errorFraction ?? 1);
    expect(estimateIntel(setup.world.intel, setup.a, setup.b, 3660, rng)).toEqual(old);
    expect(estimateIntel(setup.world.intel, setup.neutral, setup.b, 10, rng)).toBeUndefined();

    const scoutBlueprint = addBlueprint(setup.world, setup.a, "scout", "shuttle", [
      "reactor_t1",
      "thruster_t2",
      "sensor_t1"
    ]);
    const scout = setup.world.addShip(
      setup.a,
      setup.left,
      ShipRole.Scout,
      0,
      100,
      1,
      scoutBlueprint
    );
    expect(scoutSystem(setup.world, scout, setup.left, 20)).toBeGreaterThan(0);
    expect(estimateIntel(setup.world.intel, setup.a, setup.b, 23, rng)).toBeDefined();

    const line = data.doctrines[doctrine("line_battle")];
    if (line === undefined || fresh === undefined) throw new Error("missing doctrine/intel");
    const laserResponse = bestDesign(data, line, {
      budget: 100_000,
      maxTier: 3,
      enemy: fresh
    });
    const missileResponse = bestDesign(data, line, {
      budget: 100_000,
      maxTier: 3,
      enemy: {
        shieldFraction: 0.2,
        armorRating: 20,
        missileFraction: 1,
        laserFraction: 0
      }
    });
    expect(moduleStat(laserResponse, "armorRating")).toBeGreaterThan(0);
    expect(moduleStat(missileResponse, "intercept")).toBeGreaterThan(0);
    expect(laserResponse?.design.modules).not.toEqual(missileResponse?.design.modules);
  });

  it("requires orbital control and produced troops, applies garrisons, and marks conquest history", () => {
    const setup = militaryWorld();
    const troopBlueprint = addBlueprint(setup.world, setup.a, "trooper", "troopship", [
      "reactor_t2",
      "thruster_t1",
      "troop_bay_t1",
      "troop_bay_t1"
    ]);
    const combatBlueprint = addBlueprint(setup.world, setup.a, "line_battle", "cruiser", [
      "reactor_t3",
      "thruster_t2",
      "kinetic_t2",
      "kinetic_t2",
      "armor_t2"
    ]);
    const troops = fleetWithShips(setup.world, setup.a, setup.right, "trooper", troopBlueprint, 1);
    const combat = fleetWithShips(
      setup.world,
      setup.a,
      setup.right,
      "line_battle",
      combatBlueprint,
      2
    );
    setup.world.wars.declare(setup.a, setup.b, 0);
    const target = setup.bodyB;
    setup.world.buildings.addBuilt(
      data,
      setup.world.bodies,
      target,
      building("housing"),
      setup.world.stockpiles
    );
    setup.world.buildings.addBuilt(
      data,
      setup.world.bodies,
      target,
      building("garrison"),
      setup.world.stockpiles
    );
    const defended = garrisonStrength(setup.world, target);
    expect(defended).toBeGreaterThan(250);
    expect(
      data.buildings[
        defenseTaskForThreat(setup.world, setup.b, target, 100, 100)?.buildingType ?? -1
      ]?.id
    ).toBe("orbital_defense");
    expect(invadeColony(setup.world, troops, target, 1).reason).toBe("noOrbitalSuperiority");
    expect(establishOrbitalSuperiority(setup.world, combat, target).established).toBe(true);
    expect(invadeColony(setup.world, combat, target, 2).reason).toBe("noTroops");
    setup.world.buildings.markDemolished(
      data,
      setup.world.bodies,
      findBuilding(setup.world, target, building("garrison")),
      setup.world.stockpiles
    );
    const beforePopulation = setup.world.bodies.population[target] ?? 0;
    const invasion = invadeColony(setup.world, troops, target, 3);
    expect(invasion.captured).toBe(true);
    expect(invasion.buildingsLost).toBeGreaterThan(0);
    expect(setup.world.bodies.population[target]).toBeLessThan(beforePopulation);
    expect(setup.world.factionDynamics.warExhaustion[setup.b]).toBeGreaterThan(0);
    expect(setup.world.colonyHistory.wasConquered(target)).toBe(true);
    expect(setup.world.colonyHistory.wasConquered(setup.bodyA)).toBe(false);
    expect(setup.world.bodies.owner[target]).toBe(setup.a);
  });

  it("implements siege as logistics isolation while ordinary population code causes decline", () => {
    const setup = militaryWorld();
    const combatBlueprint = addBlueprint(setup.world, setup.a, "line_battle", "cruiser", [
      "reactor_t3",
      "thruster_t2",
      "kinetic_t2",
      "kinetic_t2",
      "armor_t2"
    ]);
    const combat = fleetWithShips(
      setup.world,
      setup.a,
      setup.right,
      "line_battle",
      combatBlueprint,
      2
    );
    setup.world.wars.declare(setup.a, setup.b, 0);
    expect(establishOrbitalSuperiority(setup.world, combat, setup.bodyB).established).toBe(true);
    expect(startSiege(setup.world, combat, setup.bodyB)).toBe(true);
    const routes = new RoutePlanner();
    expect(
      routes.find(
        setup.world.systems,
        setup.world.gates,
        setup.left,
        setup.right,
        setup.b,
        setup.world.wars
      ).reachable
    ).toBe(false);
    const before = setup.world.bodies.population[setup.bodyB] ?? 0;
    const sim = StageTwoSimulation.createFromWorld(55, data, setup.world);
    sim.run(40, 0);
    expect(setup.world.bodies.population[setup.bodyB]).toBeLessThan(before);
    expect(endSiege(setup.world, setup.bodyB)).toBe(true);
    expect(
      routes.find(
        setup.world.systems,
        setup.world.gates,
        setup.left,
        setup.right,
        setup.b,
        setup.world.wars
      ).reachable
    ).toBe(true);
  });
});

function militaryWorld(includeNeutral = true): {
  readonly world: StageOneWorld;
  readonly left: number;
  readonly right: number;
  readonly bodyA: number;
  readonly bodyB: number;
  readonly a: number;
  readonly b: number;
  readonly neutral: number;
} {
  const world = StageOneWorld.create(data);
  const left = world.systems.add(0, 0, 0, -1);
  const right = world.systems.add(10, 0, 0, -1);
  world.gates.addUndirected(world.systems, left, right, 10);
  const bodyA = world.addBody(left, BodyType.Planet, 1, 0.8, 20, -1, 100);
  const bodyB = world.addBody(right, BodyType.Planet, 1, 0.8, 20, -1, 100);
  const a = world.addFaction("A", left, bodyA, 100_000, 1, 1);
  const b = world.addFaction("B", right, bodyB, 100_000, 1, 1);
  let neutral = 65535;
  if (includeNeutral) {
    const neutralSystem = world.systems.add(20, 0, 0, -1);
    const neutralBody = world.addBody(neutralSystem, BodyType.Planet, 1, 0.8, 10, -1, 50);
    neutral = world.addFaction("N", neutralSystem, neutralBody, 10_000, 1, 1);
  }
  return { world, left, right, bodyA, bodyB, a, b, neutral };
}

function addBlueprint(
  world: StageOneWorld,
  faction: number,
  doctrineId: string,
  hullId: string,
  modules: readonly string[]
): number {
  const design: ShipDesign = {
    hull: hull(hullId),
    modules: modules.map((id) => moduleIndex(id))
  };
  const stats = calculateDesignStats(data, design);
  const result: BestDesignResult = {
    hull: design.hull,
    design,
    stats,
    score: stats.effectiveHitPoints + stats.damageLong + stats.damageMedium + stats.damageShort,
    cost: stats.cost,
    iterations: 0,
    scorePerCredit: stats.cost > 0 ? stats.effectiveHitPoints / stats.cost : 0,
    affordableCount: 1,
    budgetedScore: stats.effectiveHitPoints
  };
  return world.blueprints.addFromDesign(data, faction, doctrine(doctrineId), result, 0);
}

function fleetWithShips(
  world: StageOneWorld,
  faction: number,
  system: number,
  doctrineId: string,
  blueprint: number,
  count: number
): EntityRef {
  const fleet = world.fleets.add(faction, doctrine(doctrineId), system, system, 0);
  for (let i = 0; i < count; i += 1) {
    const ship = world.addShip(faction, system, ShipRole.Warship, 0, 100, 1, blueprint);
    world.fleets.addShip(fleet, world.ships.ref(ship), world.ships);
  }
  return fleet;
}

function symmetricBattle(reverse: boolean): {
  readonly winner: number;
  readonly survivors: readonly number[];
  readonly rounds: number;
  readonly shots: number;
  readonly terminalEvents: number;
} {
  const setup = militaryWorld(false);
  const designA = addBlueprint(setup.world, setup.a, "line_battle", "corvette", [
    "reactor_t1",
    "thruster_t1",
    "thruster_t1",
    "kinetic_t1",
    "kinetic_t1",
    "armor_t1"
  ]);
  const designB = addBlueprint(setup.world, setup.b, "line_battle", "corvette", [
    "reactor_t1",
    "thruster_t1",
    "thruster_t1",
    "kinetic_t1",
    "kinetic_t1",
    "armor_t1"
  ]);
  const a = fleetWithShips(setup.world, setup.a, setup.left, "line_battle", designA, 2);
  const b = fleetWithShips(setup.world, setup.b, setup.left, "line_battle", designB, 2);
  setup.world.wars.declare(setup.a, setup.b, 0);
  const battle = createBattle(setup.world, reverse ? b : a, reverse ? a : b, 0);
  if (battle === undefined) throw new Error("battle was not created");
  const scratch = new CombatRoundScratch();
  while (setup.world.battles.isActive(battle)) {
    resolveBattleRound(setup.world, battle, setup.world.battles.round[battle.index] ?? 0, scratch);
  }
  const survivors = [
    survivorsForFaction(setup.world, setup.a),
    survivorsForFaction(setup.world, setup.b)
  ];
  return {
    winner: setup.world.battles.winner[battle.index] ?? -1,
    survivors,
    rounds: setup.world.battles.round[battle.index] ?? 0,
    shots: countCombatLog(setup.world, CombatLogKind.Shot),
    terminalEvents: countCombatLog(setup.world, CombatLogKind.BattleEnded)
  };
}

function blockadeEconomyWorld(): {
  readonly world: StageOneWorld;
  readonly yard: number;
  readonly component: number;
  readonly order: number;
  readonly blockader: EntityRef;
} {
  const setup = militaryWorld(false);
  const source = setup.bodyA;
  const yard = setup.bodyB;
  // Defender owns both ends of its supply chain; attacker only occupies the gate.
  setup.world.bodies.owner[source] = setup.b;
  setup.world.factions.rebuildColoniesFromOwners(setup.world.bodies);
  const blueprint = addBlueprint(setup.world, setup.b, "line_battle", "corvette", [
    "reactor_t1",
    "thruster_t1",
    "thruster_t1",
    "kinetic_t1",
    "armor_t1"
  ]);
  setup.world.buildings.addBuilt(
    data,
    setup.world.bodies,
    yard,
    building("shipyard"),
    setup.world.stockpiles
  );
  const queued = queueShipBuild(data, setup.world, setup.b, yard, blueprint, 0, true);
  if (!queued.ok) throw new Error(`ship build was not queued: ${queued.reason}`);
  const order = queued.order;
  const kitOrder = setup.world.shipyardOrders.kitOrder[order] ?? -1;
  let component = -1;
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    if (setup.world.kitOrders.missing(kitOrder, resource) > 0) {
      component = resource;
      break;
    }
  }
  if (component < 0) throw new Error("kit has no missing component");
  const sourceStockpile = setup.world.bodies.stockpile[source] ?? 0;
  setup.world.stockpiles.setCapacity(sourceStockpile, component, 10_000);
  setup.world.stockpiles.set(sourceStockpile, component, 1_000);
  const yardStockpile = setup.world.bodies.stockpile[yard] ?? 0;
  setup.world.stockpiles.setCapacity(yardStockpile, component, 10_000);
  setup.world.stockpiles.set(yardStockpile, component, 100);
  setup.world.prices.recalculate(
    data,
    setup.world.bodies,
    setup.world.stockpiles,
    setup.world.buildings
  );

  // Restore source to attacker only after job ownership lists were formed would break the scenario;
  // use a third attacker fleet at the gate while defender remains the economic owner.
  setup.world.bodies.owner[source] = setup.b;
  const attackBlueprint = addBlueprint(setup.world, setup.a, "line_battle", "corvette", [
    "reactor_t1",
    "thruster_t1",
    "thruster_t1",
    "kinetic_t1",
    "armor_t1"
  ]);
  const blockader = fleetWithShips(
    setup.world,
    setup.a,
    setup.left,
    "line_battle",
    attackBlueprint,
    1
  );
  setup.world.wars.declare(setup.a, setup.b, 0);
  return { world: setup.world, yard, component, order, blockader };
}

function pressure(
  blockadeFleetStrength: number,
  availableFleetStrength: number,
  exposedCargoValue: number,
  escortCapacity: number,
  detourCost: number,
  replacementIndustryCost: number
) {
  return {
    blockadeFleetStrength,
    availableFleetStrength,
    exposedCargoValue,
    escortCapacity,
    detourCost,
    replacementIndustryCost
  };
}

function countCombatLog(world: StageOneWorld, kind: CombatLogKind): number {
  let count = 0;
  for (let row = 0; row < world.battles.log.length; row += 1) {
    if (world.battles.log.kind[row] === kind) count += 1;
  }
  return count;
}

function survivorsForFaction(world: StageOneWorld, faction: number): number {
  let count = 0;
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if ((world.ships.faction[ship] ?? -1) === faction && world.ships.isAlive(world.ships.ref(ship)))
      count += 1;
  }
  return count;
}

function findBattleShip(world: StageOneWorld, fleet: EntityRef): number {
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    const ship = world.battles.ship[row] ?? -1;
    if (world.fleets.fleetOfShip(world.ships.ref(ship), world.ships) === fleet.index) return row;
  }
  return -1;
}

function findBuilding(world: StageOneWorld, body: number, type: number): number {
  let buildingIndex = world.bodies.firstBuilding[body] ?? -1;
  while (buildingIndex >= 0) {
    if ((world.buildings.type[buildingIndex] ?? -1) === type) return buildingIndex;
    buildingIndex = world.buildings.nextInBody[buildingIndex] ?? -1;
  }
  return -1;
}

function moduleStat(
  design: BestDesignResult | undefined,
  stat: "armorRating" | "intercept"
): number {
  return design?.stats[stat] ?? 0;
}

function doctrine(id: string): number {
  const value = data.doctrineIndex.get(id);
  if (value === undefined) throw new RangeError(`missing doctrine ${id}`);
  return value;
}

function hull(id: string): number {
  const value = data.hullIndex.get(id);
  if (value === undefined) throw new RangeError(`missing hull ${id}`);
  return value;
}

function moduleIndex(id: string): number {
  const value = data.moduleIndex.get(id);
  if (value === undefined) throw new RangeError(`missing module ${id}`);
  return value;
}

function building(id: string): number {
  const value = data.buildingIndex.get(id);
  if (value === undefined) throw new RangeError(`missing building ${id}`);
  return value;
}
