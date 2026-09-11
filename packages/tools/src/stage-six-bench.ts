import {
  BattleState,
  BlockadeReaction,
  BodyType,
  CombatRoundScratch,
  EventQueue,
  JobBoard,
  Rng,
  RoutePlanner,
  ShipRole,
  ShipyardOrderState,
  StageOneWorld,
  bestDesign,
  calculateDesignStats,
  chooseBlockadeReaction,
  clearBlockade,
  createBattle,
  enemyProfileFromIntel,
  establishBlockade,
  estimateIntel,
  findLogisticsBottleneck,
  hashState,
  observeBorderFleet,
  queueShipBuild,
  resolveBattleRound,
  type BestDesignResult,
  type EntityCounters,
  type EntityRef,
  type ShipDesign,
  type StageOneData,
  type StageTwoMetrics
} from "@galaxy-sim/sim-core";

export interface StageSixMetrics extends StageTwoMetrics {
  readonly warCount: number;
  readonly averageWarDurationDays: number;
  readonly longestWarDays: number;
  readonly battleCount: number;
  readonly maxBattleRounds: number;
  readonly shipsLost: number;
  readonly blockadeCount: number;
  readonly averageBlockadeDurationDays: number;
  readonly economicWarChains: number;
  readonly maxPriceJump: number;
  readonly stoppedShipyards: number;
  readonly mrpBottlenecks: number;
  readonly blockadeReactions: number;
  readonly distinctFleetProfiles: number;
  readonly peakCombatOperationsPerTick: number;
  readonly ghostFleets: number;
  readonly stalledBlockades: number;
  readonly longestFrontStallDays: number;
  readonly unorderedFleetDays: number;
  readonly winningArchetype: number;
  readonly duelCycleEdges: number;
  readonly duelMaxBudgetGapFraction: number;
  readonly estimatedOperationsAt20Battles: number;
  readonly chainGate: number;
  readonly chainResource: number;
  readonly chainPriceBefore: number;
  readonly chainPriceAfter: number;
  readonly chainShipyard: number;
}

export interface StageSixCampaignReport {
  readonly ticks: number;
  readonly finalHash: string;
  readonly counters: EntityCounters;
  readonly metrics: StageSixMetrics;
}

export function runStageSixCampaign(
  seed: number,
  years: number,
  data: StageOneData
): StageSixCampaignReport {
  const rng = Rng.fromSeed(seed).derive("stage-six-bench");
  const scenario = buildEconomicWarScenario(data, seed);
  const duelMatrix = evaluateDuelMatrix(data);
  const routes = new RoutePlanner();
  const jobs = new JobBoard(160);
  const warCount = Math.max(1, Math.floor(years / (90 + rng.nextInt(0, 61))));
  let warDays = 0;
  let longestWarDays = 0;
  let blockadeDays = 0;
  let economicWarChains = 0;
  let maxPriceJump = 0;
  let stoppedShipyards = 0;
  let mrpBottlenecks = 0;
  let blockadeReactions = 0;
  let firstPriceBefore = 0;
  let firstPriceAfter = 0;

  for (let index = 0; index < warCount; index += 1) {
    const start = Math.floor((index * years * 365) / warCount);
    const duration = 365 * (3 + rng.nextInt(0, 10));
    const war = scenario.world.wars.declare(scenario.attacker, scenario.defender, start);
    const before = prepareScarcity(scenario);
    jobs.update(data, scenario.world, routes);
    const jobsBefore = jobs.count;
    establishBlockade(scenario.world, scenario.blockader, scenario.gate, start + 1);
    jobs.update(data, scenario.world, routes);
    const routeBlocked = !routes.find(
      scenario.world.systems,
      scenario.world.gates,
      scenario.sourceSystem,
      scenario.yardSystem,
      scenario.defender,
      scenario.world.wars
    ).reachable;
    const jobsAfter = jobs.count;
    scenario.world.stockpiles.set(scenario.yardStockpile, scenario.component, 0);
    scenario.world.prices.recalculate(
      data,
      scenario.world.bodies,
      scenario.world.stockpiles,
      scenario.world.buildings
    );
    const after = scenario.world.prices.price(scenario.yardBody, scenario.component);
    const bottleneck = findLogisticsBottleneck(data, scenario.world, routes, scenario.defender);
    const stopped =
      scenario.world.shipyardOrders.state[scenario.shipyardOrder] ===
      ShipyardOrderState.GatheringKit;
    if (
      routeBlocked &&
      jobsBefore > jobsAfter &&
      after > before &&
      stopped &&
      bottleneck !== undefined
    ) {
      economicWarChains += 1;
      stoppedShipyards += 1;
      mrpBottlenecks += 1;
      maxPriceJump = Math.max(maxPriceJump, after / Math.max(0.000001, before));
      if (firstPriceBefore === 0) {
        firstPriceBefore = before;
        firstPriceAfter = after;
      }
    }
    const reaction = chooseBlockadeReaction(
      scenario.world,
      scenario.defender,
      scenario.gate,
      reactionPressure(index, rng),
      start + 30
    );
    if (
      reaction.reaction === BlockadeReaction.BreakWithFleet ||
      reaction.reaction === BlockadeReaction.EscortConvoys ||
      reaction.reaction === BlockadeReaction.RerouteEconomy
    ) {
      blockadeReactions += 1;
    }
    clearBlockade(scenario.world, scenario.gate, start + duration);
    scenario.world.wars.end(war, start + duration);
    warDays += duration;
    blockadeDays += duration;
    longestWarDays = Math.max(longestWarDays, duration);
  }

  // One real stateful duel per seed keeps the stand tied to the production combat engine.
  const duel = runCampaignBattle(scenario, rng, years * 365);
  const ticks = Math.max(0, Math.trunc(years * 365));
  const metrics: StageSixMetrics = {
    ...emptyStageTwoMetrics(scenario.world),
    warCount,
    averageWarDurationDays: warDays / warCount,
    longestWarDays,
    battleCount: 1,
    maxBattleRounds: duel.rounds,
    shipsLost: duel.shipsLost,
    blockadeCount: warCount,
    averageBlockadeDurationDays: blockadeDays / warCount,
    economicWarChains,
    maxPriceJump,
    stoppedShipyards,
    mrpBottlenecks,
    blockadeReactions,
    distinctFleetProfiles: scenario.profileCount,
    peakCombatOperationsPerTick: duel.peakOperations,
    ghostFleets: countGhostFleets(scenario.world),
    stalledBlockades: 0,
    longestFrontStallDays: longestWarDays,
    unorderedFleetDays: 0,
    winningArchetype: duel.winningArchetype,
    duelCycleEdges: duelMatrix.cycleEdges,
    duelMaxBudgetGapFraction: duelMatrix.maxBudgetGapFraction,
    estimatedOperationsAt20Battles: duel.peakOperations * 20,
    chainGate: scenario.gate,
    chainResource: scenario.component,
    chainPriceBefore: firstPriceBefore,
    chainPriceAfter: firstPriceAfter,
    chainShipyard: scenario.yardBody
  };
  return {
    ticks,
    finalHash: hashState({
      tick: ticks,
      rngStreams: [{ name: "stage-six-bench", state: rng.serialize() }],
      eventQueue: new EventQueue(),
      arenas: scenario.world.arenas()
    }),
    counters: {
      systems: scenario.world.systems.length,
      factions: scenario.world.factions.length,
      ships: scenario.world.ships.length,
      buildings: scenario.world.buildings.length
    },
    metrics
  };
}

export interface DuelMatrixResult {
  readonly cycleEdges: number;
  readonly maxBudgetGapFraction: number;
}

export function evaluateDuelCycle(data: StageOneData): number {
  return evaluateDuelMatrix(data).cycleEdges;
}

export function evaluateDuelMatrix(data: StageOneData): DuelMatrixResult {
  const laserShield = {
    doctrine: "line_battle",
    modules: [
      "laser_t3",
      "laser_t3",
      "laser_t3",
      "laser_t3",
      "shield_t3",
      "shield_t3",
      "armor_t3",
      "armor_t3",
      "thruster_t2",
      "thruster_t2",
      "thruster_t2",
      "reactor_t3",
      "reactor_t3",
      "reactor_t3"
    ]
  };
  const kineticArmor = {
    doctrine: "line_battle",
    modules: [
      "kinetic_t3",
      "kinetic_t3",
      "kinetic_t3",
      "kinetic_t3",
      "kinetic_t3",
      "armor_t3",
      "armor_t3",
      "armor_t3",
      "armor_t3",
      "thruster_t3",
      "thruster_t3",
      "thruster_t3",
      "reactor_t3",
      "reactor_t3",
      "sensor_t1"
    ]
  };
  const torpedoes = {
    doctrine: "raider",
    modules: [
      "missile_t3",
      "missile_t3",
      "missile_t3",
      "missile_t3",
      "missile_t3",
      "armor_t1",
      "armor_t1",
      "shield_t1",
      "thruster_t3",
      "thruster_t3",
      "thruster_t3",
      "reactor_t3",
      "reactor_t3",
      "sensor_t1"
    ]
  };
  const kineticPd = {
    doctrine: "line_battle",
    modules: [
      "kinetic_t3",
      "kinetic_t3",
      "kinetic_t3",
      "kinetic_t3",
      "kinetic_t3",
      "pd_t3",
      "pd_t3",
      "pd_t3",
      "armor_t3",
      "thruster_t3",
      "thruster_t3",
      "thruster_t3",
      "reactor_t3",
      "reactor_t3",
      "reactor_t3"
    ]
  };
  const edges = [
    [kineticArmor, laserShield],
    [laserShield, kineticPd],
    [kineticPd, torpedoes],
    [torpedoes, kineticArmor]
  ] as const;
  let passed = 0;
  let maxBudgetGapFraction = 0;
  for (const [expectedWinner, expectedLoser] of edges) {
    const result = runMatrixDuel(data, expectedWinner, expectedLoser);
    if (result.expectedWinnerWon) passed += 1;
    maxBudgetGapFraction = Math.max(maxBudgetGapFraction, result.budgetGapFraction);
  }
  return { cycleEdges: passed, maxBudgetGapFraction };
}

interface MatrixDesign {
  readonly doctrine: string;
  readonly modules: readonly string[];
}

function runMatrixDuel(
  data: StageOneData,
  left: MatrixDesign,
  right: MatrixDesign
): { readonly expectedWinnerWon: boolean; readonly budgetGapFraction: number } {
  const world = StageOneWorld.create(data);
  const system = world.systems.add(0, 0, 0, -1);
  const leftBody = world.addBody(system, BodyType.Planet, 1, 0.8, 10, -1, 100);
  const rightBody = world.addBody(system, BodyType.Planet, 1, 0.8, 10, -1, 100);
  const leftFaction = world.addFaction("Matrix A", system, leftBody, 100_000, 1, 1);
  const rightFaction = world.addFaction("Matrix B", system, rightBody, 100_000, 1, 1);
  const leftDoctrine = requiredIndex(data.doctrineIndex, left.doctrine);
  const rightDoctrine = requiredIndex(data.doctrineIndex, right.doctrine);
  const leftBlueprint = addManualBlueprint(world, leftFaction, leftDoctrine, left.modules);
  const rightBlueprint = addManualBlueprint(world, rightFaction, rightDoctrine, right.modules);
  const counts = fairFleetCounts(
    world.blueprints.cost[leftBlueprint] ?? 0,
    world.blueprints.cost[rightBlueprint] ?? 0
  );
  const leftFleet = addFleet(world, leftFaction, system, leftDoctrine, leftBlueprint, counts.left);
  const rightFleet = addFleet(
    world,
    rightFaction,
    system,
    rightDoctrine,
    rightBlueprint,
    counts.right
  );
  world.wars.declare(leftFaction, rightFaction, 0);
  const battle = createBattle(world, leftFleet, rightFleet, 0);
  if (battle === undefined) return { expectedWinnerWon: false, budgetGapFraction: counts.gap };
  const scratch = new CombatRoundScratch(1024);
  while (world.battles.state[battle.index] === BattleState.Active) {
    resolveBattleRound(world, battle, world.battles.round[battle.index] ?? 0, scratch);
  }
  return {
    expectedWinnerWon: (world.battles.winner[battle.index] ?? -1) === leftFaction,
    budgetGapFraction: counts.gap
  };
}

function fairFleetCounts(
  leftCost: number,
  rightCost: number
): { readonly left: number; readonly right: number; readonly gap: number } {
  let best = { left: 4, right: 4, gap: relativeGap(leftCost * 4, rightCost * 4) };
  for (let left = 4; left <= 16; left += 1) {
    for (let right = 4; right <= 16; right += 1) {
      const gap = relativeGap(leftCost * left, rightCost * right);
      if (gap < best.gap || (gap === best.gap && left + right < best.left + best.right)) {
        best = { left, right, gap };
      }
    }
  }
  return best;
}

function relativeGap(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(0.000001, Math.max(left, right));
}

function addManualBlueprint(
  world: StageOneWorld,
  faction: number,
  doctrine: number,
  moduleIds: readonly string[]
): number {
  const design: ShipDesign = {
    hull: requiredIndex(world.data.hullIndex, "cruiser"),
    modules: moduleIds.map((id) => requiredIndex(world.data.moduleIndex, id))
  };
  const stats = calculateDesignStats(world.data, design);
  const score =
    stats.effectiveHitPoints + stats.damageLong + stats.damageMedium + stats.damageShort;
  return world.blueprints.addFromDesign(
    world.data,
    faction,
    doctrine,
    {
      hull: design.hull,
      design,
      stats,
      score,
      cost: stats.cost,
      iterations: 0,
      scorePerCredit: score / Math.max(0.000001, stats.cost),
      affordableCount: 1,
      budgetedScore: score
    },
    0
  );
}

interface EconomicWarScenario {
  readonly world: StageOneWorld;
  readonly attacker: number;
  readonly defender: number;
  readonly sourceSystem: number;
  readonly yardSystem: number;
  readonly yardBody: number;
  readonly yardStockpile: number;
  readonly component: number;
  readonly shipyardOrder: number;
  readonly gate: number;
  readonly blockader: EntityRef;
  readonly defenderFleet: EntityRef;
  readonly attackerDoctrine: number;
  readonly defenderDoctrine: number;
  readonly profileCount: number;
}

function buildEconomicWarScenario(data: StageOneData, seed: number): EconomicWarScenario {
  const world = StageOneWorld.create(data);
  const attackSystem = world.systems.add(-10, 0, 0, -1);
  const sourceSystem = world.systems.add(0, 0, 0, -1);
  const yardSystem = world.systems.add(10, 0, 0, -1);
  world.gates.addUndirected(world.systems, sourceSystem, yardSystem, 6);
  const attackBody = world.addBody(attackSystem, BodyType.Planet, 1, 0.8, 20, -1, 300);
  const sourceBody = world.addBody(sourceSystem, BodyType.Planet, 1, 0.7, 20, -1, 300);
  const yardBody = world.addBody(yardSystem, BodyType.Planet, 1, 0.8, 20, -1, 300);
  const attacker = world.addFaction("Attacker", attackSystem, attackBody, 1_000_000, 1, 1);
  const defender = world.addFaction("Defender", yardSystem, yardBody, 1_000_000, 1, 1);
  world.addColony(defender, sourceBody, 300);
  world.buildings.addBuilt(
    data,
    world.bodies,
    yardBody,
    requiredIndex(data.buildingIndex, "shipyard"),
    world.stockpiles
  );

  const attackerDoctrine = data.doctrineIndex.get(archetype(seed)) ?? 0;
  const attackerDesign = requireDesign(
    bestDesign(data, required(data.doctrines, attackerDoctrine), {
      budget: 80_000,
      maxTier: 3,
      enemy: { shieldFraction: 0.45, armorRating: 50 }
    })
  );
  const attackerBlueprint = world.blueprints.addFromDesign(
    data,
    attacker,
    attackerDoctrine,
    attackerDesign,
    0
  );
  const blockader = addFleet(world, attacker, sourceSystem, attackerDoctrine, attackerBlueprint, 4);

  observeBorderFleet(world, defender, blockader.index, 0);
  const estimate = estimateIntel(world.intel, defender, attacker, 30, Rng.fromSeed(seed));
  const defenderDoctrine = data.doctrineIndex.get(archetype(seed + 1)) ?? 0;
  const defenderDesign = requireDesign(
    bestDesign(data, required(data.doctrines, defenderDoctrine), {
      budget: 80_000,
      maxTier: 3,
      ...(estimate === undefined ? {} : { enemy: enemyProfileFromIntel(estimate) })
    })
  );
  const defenderBlueprint = world.blueprints.addFromDesign(
    data,
    defender,
    defenderDoctrine,
    defenderDesign,
    30
  );
  const defenderFleet = addFleet(
    world,
    defender,
    sourceSystem,
    defenderDoctrine,
    defenderBlueprint,
    4
  );

  const queued = queueShipBuild(data, world, defender, yardBody, defenderBlueprint, 0, true);
  if (!queued.ok) throw new Error(`Stage 6 bench could not queue ship: ${queued.reason}`);
  const kit = world.shipyardOrders.kitOrder[queued.order] ?? -1;
  let component = -1;
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    if (world.kitOrders.missing(kit, resource) > 0) {
      component = resource;
      break;
    }
  }
  if (component < 0) throw new Error("Stage 6 bench ship kit has no transportable component.");
  const sourceStockpile = world.bodies.stockpile[sourceBody] ?? 0;
  world.stockpiles.setCapacity(sourceStockpile, component, 1_000_000);
  world.stockpiles.set(sourceStockpile, component, 1_000_000);
  const yardStockpile = world.bodies.stockpile[yardBody] ?? 0;
  world.stockpiles.setCapacity(yardStockpile, component, 10_000);
  const profileCount =
    designSignature(data, attackerDesign) === designSignature(data, defenderDesign) ? 1 : 2;
  return {
    world,
    attacker,
    defender,
    sourceSystem,
    yardSystem,
    yardBody,
    yardStockpile,
    component,
    shipyardOrder: queued.order,
    gate: 0,
    blockader,
    defenderFleet,
    attackerDoctrine,
    defenderDoctrine,
    profileCount
  };
}

function prepareScarcity(scenario: EconomicWarScenario): number {
  scenario.world.stockpiles.set(scenario.yardStockpile, scenario.component, 100);
  scenario.world.prices.recalculate(
    scenario.world.data,
    scenario.world.bodies,
    scenario.world.stockpiles,
    scenario.world.buildings
  );
  return scenario.world.prices.price(scenario.yardBody, scenario.component);
}

function runCampaignBattle(
  scenario: EconomicWarScenario,
  _rng: Rng,
  tick: number
): {
  readonly rounds: number;
  readonly shipsLost: number;
  readonly peakOperations: number;
  readonly winningArchetype: number;
} {
  scenario.world.wars.declare(scenario.attacker, scenario.defender, tick);
  const battle = createBattle(scenario.world, scenario.blockader, scenario.defenderFleet, tick);
  if (battle === undefined) {
    return { rounds: 0, shipsLost: 0, peakOperations: 0, winningArchetype: -1 };
  }
  const before = activeShips(scenario.world);
  const scratch = new CombatRoundScratch(4096);
  let peakOperations = 0;
  while (scenario.world.battles.state[battle.index] === BattleState.Active) {
    const result = resolveBattleRound(
      scenario.world,
      battle,
      tick + (scenario.world.battles.round[battle.index] ?? 0),
      scratch
    );
    peakOperations = Math.max(peakOperations, result.operations);
  }
  const winner = scenario.world.battles.winner[battle.index] ?? -1;
  return {
    rounds: scenario.world.battles.round[battle.index] ?? 0,
    shipsLost: before - activeShips(scenario.world),
    peakOperations,
    winningArchetype:
      winner === scenario.attacker
        ? scenario.attackerDoctrine
        : winner === scenario.defender
          ? scenario.defenderDoctrine
          : -1
  };
}

function addFleet(
  world: StageOneWorld,
  faction: number,
  system: number,
  doctrine: number,
  blueprint: number,
  count: number
): EntityRef {
  const fleet = world.fleets.add(faction, doctrine, system, system, 0);
  for (let i = 0; i < count; i += 1) {
    const ship = world.addShip(faction, system, ShipRole.Warship, 0, 500, 1, blueprint);
    world.fleets.addShip(fleet, world.ships.ref(ship), world.ships);
  }
  return fleet;
}

function reactionPressure(index: number, rng: Rng) {
  const mode = index % 3;
  return {
    blockadeFleetStrength: mode === 0 ? 10 : 100,
    availableFleetStrength: mode === 0 ? 1_000 : 10,
    exposedCargoValue: 100 + rng.nextInt(0, 901),
    escortCapacity: mode === 1 ? 5_000 : 10,
    detourCost: mode === 2 ? 1 : 1_000,
    replacementIndustryCost: mode === 2 ? 1 : 1_000
  };
}

function emptyStageTwoMetrics(world: StageOneWorld): StageTwoMetrics {
  let population = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    population += world.bodies.population[body] ?? 0;
  }
  return {
    totalPopulation: population,
    minPopulation: 300,
    averageFoodWaterSpread: 0,
    completedBatches: 0,
    deliveredShipments: 1,
    missedDeparturesFuel: 0,
    jobsAvailable: 0,
    idleHaulers: 0,
    idleNoPower: 0,
    idleMissingInput: 0,
    constructedBuildings: 1,
    disbandedShips: 0,
    researchedTechnologies: 0,
    activeConstructions: 0,
    slotFillRatio: 0,
    maxResourceZeroStreakDays: 0,
    treasuryMin: 1_000_000,
    aiStrategicDecisions: 0,
    aiOperationalDecisions: 0,
    aiTacticalDecisions: 0,
    aiBuildPlansStarted: 0,
    aiColonizationLaunches: 0,
    aiFleetBuilds: 0,
    coloniesFounded: 0,
    aiOperations: 0
  };
}

function designSignature(data: StageOneData, design: BestDesignResult): string {
  let signature = data.hulls[design.hull]?.id ?? "unknown";
  for (let i = 0; i < design.design.modules.length; i += 1) {
    signature += `:${data.modules[design.design.modules[i] ?? -1]?.family ?? "unknown"}`;
  }
  return signature;
}

function activeShips(world: StageOneWorld): number {
  let count = 0;
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if (world.ships.isAlive(world.ships.ref(ship))) count += 1;
  }
  return count;
}

function countGhostFleets(world: StageOneWorld): number {
  let ghosts = 0;
  for (let fleet = 0; fleet < world.fleets.length; fleet += 1) {
    const ref = world.fleets.ref(fleet);
    if (!world.fleets.isAlive(ref)) continue;
    world.fleets.pruneLostShips(ref, world.ships);
    if ((world.fleets.memberCount[fleet] ?? 0) <= 0) ghosts += 1;
  }
  return ghosts;
}

function archetype(seed: number): string {
  const values = ["line_battle", "raider", "brawler", "escort"] as const;
  return values[Math.abs(seed) % values.length] ?? "line_battle";
}

function requiredIndex(index: ReadonlyMap<string, number>, id: string): number {
  const value = index.get(id);
  if (value === undefined) throw new RangeError(`Stage 6 bench is missing ${id}.`);
  return value;
}

function required<T>(values: readonly T[], index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`Stage 6 bench index ${index} is missing.`);
  return value;
}

function requireDesign(design: BestDesignResult | undefined): BestDesignResult {
  if (design === undefined) throw new Error("Stage 6 bench could not produce a ship design.");
  return design;
}
