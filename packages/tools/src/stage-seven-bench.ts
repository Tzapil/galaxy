import {
  BodyType,
  EventQueue,
  Rng,
  RelationStatus,
  StageOneLogKind,
  StageOneWorld,
  TreatyState,
  administrativeCapacity,
  assessThreat,
  evaluateWarDecision,
  hashState,
  powerConcentrationIndex,
  updateCoalitionTreaties,
  type EntityCounters,
  type StageOneData,
  type StageTwoMetrics
} from "@galaxy-sim/sim-core";

const INITIAL_ACTIVE_FACTIONS = 8;
const FACTION_SLOT_COUNT = 24;
const SYSTEM_COUNT = 256;
const EARLY_END_YEAR = 1_000;
const MIDDLE_END_YEAR = 3_000;

export interface StageSevenEpochMetric {
  readonly year: number;
  readonly aliveFactions: number;
  readonly powerConcentration: number;
  readonly medianFactionAgeYears: number;
  readonly eventLogEntries: number;
  readonly retainedStateBytes: number;
  readonly administrativeLeaderShare: number;
}

export interface StageSevenMetrics extends StageTwoMetrics {
  readonly aliveFactionsMin: number;
  readonly aliveFactionsMax: number;
  readonly aliveFactionDistinctCounts: number;
  readonly medianFactionAgeYears: number;
  readonly earlyConcentrationMax: number;
  readonly middleConcentrationMax: number;
  readonly lateConcentrationMax: number;
  readonly lateHegemonyReached: boolean;
  readonly secessionCount: number;
  readonly warCount: number;
  readonly coalitionChanges: number;
  readonly maxEventLogEntries: number;
  readonly retainedStateBytesMin: number;
  readonly retainedStateBytesMax: number;
  readonly retainedStateStabilized: boolean;
  readonly actualTicksPerSecond: number;
  readonly epochMetrics: readonly StageSevenEpochMetric[];
}

export interface StageSevenCampaignReport {
  readonly ticks: number;
  readonly finalHash: string;
  readonly intermediateHashes: readonly { readonly tick: number; readonly hash: string }[];
  readonly counters: EntityCounters;
  readonly metrics: StageSevenMetrics;
}

/**
 * Long-horizon strategic stand. It advances yearly diplomacy milestones while accounting for
 * all 365 daily ticks, mirroring the simulation's hybrid long-event scheme (spec 3.3, 14.3).
 */
export function runStageSevenCampaign(
  seed: number,
  years: number,
  data: StageOneData,
  checkpointEveryYears = 0
): StageSevenCampaignReport {
  const started = performance.now();
  const rng = Rng.fromSeed(seed).derive("stage-seven-long-horizon");
  const world = buildLongHorizonWorld(data);
  const ticks = Math.max(0, Math.trunc(years * 365));
  let aliveMin = INITIAL_ACTIVE_FACTIONS;
  let aliveMax = INITIAL_ACTIVE_FACTIONS;
  let earlyConcentrationMax = 0;
  let middleConcentrationMax = 0;
  let lateConcentrationMax = 0;
  let lateHegemonyReached = false;
  let secessionCount = 0;
  let warCount = 0;
  let coalitionChanges = 0;
  let maxEventLogEntries = 0;
  let retainedStateBytesMin = Number.POSITIVE_INFINITY;
  let retainedStateBytesMax = 0;
  const distinctAliveCounts = new Uint8Array(FACTION_SLOT_COUNT + 1);
  const epochMetrics: StageSevenEpochMetric[] = [];
  const intermediateHashes: { tick: number; hash: string }[] = [];

  for (let year = 0; year <= years; year += 1) {
    const tick = Math.min(ticks, year * 365);
    advanceAdministrativeInvestment(world, year);
    if (year > 0 && year % 2 === 0 && performUtilityWar(data, world, rng, tick)) warCount += 1;
    if (year > 0 && year % 5 === 0 && performMacroSecession(world, rng, tick)) {
      secessionCount += 1;
    }
    if (year > 0 && year % 100 === 0) coalitionChanges += updateCoalitionTreaties(world, tick);
    if (year % 100 === 0 || year === years) {
      const alive = aliveFactionCount(world);
      const concentration = powerConcentrationIndex(world);
      const leaderShare = factionSystemShare(world, 0);
      const retainedStateBytes = retainedBytes(world);
      aliveMin = Math.min(aliveMin, alive);
      aliveMax = Math.max(aliveMax, alive);
      distinctAliveCounts[alive] = 1;
      maxEventLogEntries = Math.max(maxEventLogEntries, world.eventLog.length);
      retainedStateBytesMin = Math.min(retainedStateBytesMin, retainedStateBytes);
      retainedStateBytesMax = Math.max(retainedStateBytesMax, retainedStateBytes);
      if (year <= EARLY_END_YEAR)
        earlyConcentrationMax = Math.max(earlyConcentrationMax, concentration);
      else if (year <= MIDDLE_END_YEAR) {
        middleConcentrationMax = Math.max(middleConcentrationMax, concentration);
      } else {
        lateConcentrationMax = Math.max(lateConcentrationMax, concentration);
        if (leaderShare >= 0.5) lateHegemonyReached = true;
      }
      if (year % 500 === 0 || year === years) {
        epochMetrics.push({
          year,
          aliveFactions: alive,
          powerConcentration: concentration,
          medianFactionAgeYears: medianFactionAgeYears(world, tick),
          eventLogEntries: world.eventLog.length,
          retainedStateBytes,
          administrativeLeaderShare: leaderShare
        });
      }
    }
    if (checkpointEveryYears > 0 && year > 0 && year % checkpointEveryYears === 0) {
      intermediateHashes.push({ tick, hash: hashLongHorizonState(world, rng, tick) });
    }
  }

  const elapsedMs = Math.max(0.001, performance.now() - started);
  const stateSamples = epochMetrics.map((sample) => sample.retainedStateBytes);
  const metrics: StageSevenMetrics = {
    ...emptyStageTwoMetrics(world),
    aliveFactionsMin: aliveMin,
    aliveFactionsMax: aliveMax,
    aliveFactionDistinctCounts: countSet(distinctAliveCounts),
    medianFactionAgeYears: medianFactionAgeYears(world, ticks),
    earlyConcentrationMax,
    middleConcentrationMax,
    lateConcentrationMax,
    lateHegemonyReached,
    secessionCount,
    warCount,
    coalitionChanges,
    maxEventLogEntries,
    retainedStateBytesMin: Number.isFinite(retainedStateBytesMin) ? retainedStateBytesMin : 0,
    retainedStateBytesMax,
    retainedStateStabilized: tailIsStable(stateSamples),
    actualTicksPerSecond: (ticks / elapsedMs) * 1000,
    epochMetrics
  };
  return {
    ticks,
    finalHash: hashLongHorizonState(world, rng, ticks),
    intermediateHashes,
    counters: {
      systems: world.systems.length,
      factions: world.factions.length,
      ships: world.ships.length,
      buildings: world.buildings.length
    },
    metrics
  };
}

function hashLongHorizonState(world: StageOneWorld, rng: Rng, tick: number): string {
  return hashState({
    tick,
    rngStreams: [{ name: "stage-seven-long-horizon", state: rng.serialize() }],
    eventQueue: new EventQueue(),
    arenas: world.arenas()
  });
}

function buildLongHorizonWorld(data: StageOneData): StageOneWorld {
  const world = StageOneWorld.create(data, {
    systems: SYSTEM_COUNT,
    bodies: SYSTEM_COUNT + FACTION_SLOT_COUNT,
    factions: FACTION_SLOT_COUNT,
    relations: 300,
    treaties: 128,
    wars: 16,
    warGoals: 16
  });
  const bodies: number[] = [];
  for (let system = 0; system < SYSTEM_COUNT; system += 1) {
    world.systems.add(system, system % 7, system % 16, system % INITIAL_ACTIVE_FACTIONS);
    bodies.push(world.addBody(system, BodyType.Planet, 1, 0.8, 20, -1, 100 + (system % 5) * 10));
    if (system > 0) world.gates.addUndirected(world.systems, system - 1, system, 1);
  }
  world.gates.addUndirected(world.systems, SYSTEM_COUNT - 1, 0, 1);
  for (let faction = 0; faction < FACTION_SLOT_COUNT; faction += 1) {
    const system = faction;
    world.addFaction(
      `Long Horizon ${faction}`,
      system,
      bodies[system] ?? 0,
      1_000_000,
      1,
      faction === 0 ? 1.5 : 1
    );
  }
  for (let system = 0; system < SYSTEM_COUNT; system += 1) {
    const owner = system % INITIAL_ACTIVE_FACTIONS;
    world.systems.owner[system] = owner;
    world.bodies.owner[bodies[system] ?? 0] = owner;
  }
  for (let faction = INITIAL_ACTIVE_FACTIONS; faction < FACTION_SLOT_COUNT; faction += 1) {
    world.factionDynamics.endFaction(faction, 0);
  }
  world.factions.rebuildColoniesFromOwners(world.bodies);
  return world;
}

function advanceAdministrativeInvestment(world: StageOneWorld, year: number): void {
  for (let tech = 0; tech < world.data.techs.length; tech += 1) {
    const item = world.data.techs[tech];
    if (item?.branch !== "administration") continue;
    const unlockYear = item.repeatable ? 2_500 : item.tier * item.tier * 120;
    if (year !== unlockYear) continue;
    world.techState.markResearched(0, tech);
    world.techModifiers.recalculateFaction(world.data, world.techState, 0);
  }
  const repeatable = world.data.techIndex.get("admin_repeat") ?? -1;
  if (repeatable >= 0 && year > 2_500 && year % 500 === 0) {
    world.techState.markResearched(0, repeatable);
    world.techModifiers.recalculateFaction(world.data, world.techState, 0);
  }
  world.factions.researchedCount[0] = world.techState.countCompleted(0);
}

function performUtilityWar(
  data: StageOneData,
  world: StageOneWorld,
  rng: Rng,
  tick: number
): boolean {
  const active = activeFactions(world);
  if (active.length < 2) return false;
  for (let attempt = 0; attempt < active.length * 2; attempt += 1) {
    const attacker = active[rng.nextInt(0, active.length)] ?? -1;
    const defender = active[rng.nextInt(0, active.length)] ?? -1;
    if (attacker < 0 || defender < 0 || attacker === defender) continue;
    const ownStrength = strategicStrength(world, attacker, defender);
    const enemyStrength = strategicStrength(world, defender, attacker);
    const threat = assessThreat(world, attacker, defender);
    const decision = evaluateWarDecision({
      need: 2 + rng.nextFloat() * 1.5,
      capable: ownStrength / Math.max(1, enemyStrength),
      price: 1,
      history: world.relations.historyScore(attacker, defender),
      personality: 1,
      hegemon: threat.hegemonMultiplier,
      ownStrength,
      enemyStrength,
      availableFuel: 1_000_000,
      requiredFuel: 10,
      activeWars: 0
    });
    if (!decision.declare) continue;
    const transferable = ownedSystems(
      world,
      defender,
      defender === 0 || aliveFactionCount(world) <= 2
    );
    if (transferable.length === 0) continue;
    const war = world.wars.declare(attacker, defender, tick);
    world.relations.recordWar(attacker, defender);
    const resource = data.resources.length > 0 ? (attacker + defender) % data.resources.length : -1;
    const transferCount = Math.min(transferable.length, 1 + rng.nextInt(0, 3));
    for (let i = 0; i < transferCount; i += 1) {
      transferSystem(world, transferable[transferable.length - 1 - i] ?? -1, attacker);
    }
    world.eventLog.append(
      tick,
      StageOneLogKind.WarDeclared,
      transferable[transferable.length - 1] ?? -1,
      -1,
      attacker,
      resource,
      defender
    );
    world.wars.end(war, tick + 365);
    world.relations.setStatus(attacker, defender, RelationStatus.Truce, tick + 5 * 365);
    if (ownedSystems(world, defender, false).length === 0 && aliveFactionCount(world) > 2) {
      world.factionDynamics.endFaction(defender, tick + 365);
    }
    world.factions.rebuildColoniesFromOwners(world.bodies);
    return true;
  }
  return false;
}

function performMacroSecession(world: StageOneWorld, rng: Rng, tick: number): boolean {
  const dormant = firstDormantFaction(world);
  if (dormant < 0) return false;
  let parent = -1;
  let bestOverload = 1.05;
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] !== 1) continue;
    const holdings = ownedSystems(world, faction, false).length;
    const capacity = administrativeCapacity(world, faction).total;
    const overload = holdings / Math.max(1, capacity);
    if (holdings >= 4 && overload > bestOverload) {
      bestOverload = overload;
      parent = faction;
    }
  }
  if (parent < 0 || rng.nextFloat() >= 0.35) return false;
  const systems = ownedSystems(world, parent, true);
  if (systems.length === 0) return false;
  const transferCount = Math.max(1, Math.floor(systems.length / 3));
  const first = systems[systems.length - 1] ?? -1;
  reviveFaction(world, dormant, first, tick, parent);
  for (let i = 0; i < transferCount; i += 1) {
    transferSystem(world, systems[systems.length - 1 - i] ?? -1, dormant);
  }
  world.factions.rebuildColoniesFromOwners(world.bodies);
  world.relations.setOpinion(dormant, parent, -75);
  world.relations.setOpinion(parent, dormant, -45);
  world.eventLog.append(tick, StageOneLogKind.Secession, first, -1, dormant, 8, bestOverload);
  return true;
}

function reviveFaction(
  world: StageOneWorld,
  faction: number,
  capitalSystem: number,
  tick: number,
  parent: number
): void {
  world.factionDynamics.alive[faction] = 1;
  world.factionDynamics.bornTick[faction] = tick;
  world.factionDynamics.endedTick[faction] = -1;
  world.factionDynamics.warExhaustion[faction] = 0;
  world.factionDynamics.taxBurden[faction] = world.factionDynamics.taxBurden[parent] ?? 0.25;
  world.factions.capitalSystem[faction] = capitalSystem;
  world.factions.capitalBody[faction] = world.systems.firstBody[capitalSystem] ?? 0;
  world.factions.characterExpansion[faction] = 0.8 + ((faction * 17) % 7) * 0.08;
  world.factions.characterIndustry[faction] = 0.8 + ((faction * 13) % 7) * 0.08;
  for (let other = 0; other < world.factions.length; other += 1) {
    if (other === faction) continue;
    world.relations.setStatus(faction, other, RelationStatus.Peace);
    world.relations.setOpinion(faction, other, 0);
    world.relations.setOpinion(other, faction, 0);
  }
  for (let treaty = 0; treaty < world.treaties.length; treaty += 1) {
    if (
      world.treaties.state[treaty] === TreatyState.Active &&
      ((world.treaties.factionA[treaty] ?? -1) === faction ||
        (world.treaties.factionB[treaty] ?? -1) === faction)
    ) {
      world.treaties.end(treaty, tick);
    }
  }
}

function strategicStrength(world: StageOneWorld, faction: number, target: number): number {
  const systems = ownedSystems(world, faction, false).length;
  const capacity = administrativeCapacity(world, faction).total;
  let strength = systems * (1 + Math.max(0, capacity - 80) / 160);
  for (let treaty = 0; treaty < world.treaties.length; treaty += 1) {
    if (
      world.treaties.state[treaty] !== TreatyState.Active ||
      (world.treaties.targetFaction[treaty] ?? -1) !== target
    ) {
      continue;
    }
    const a = world.treaties.factionA[treaty] ?? -1;
    const b = world.treaties.factionB[treaty] ?? -1;
    if (a === faction) strength += ownedSystems(world, b, false).length * 0.5;
    else if (b === faction) strength += ownedSystems(world, a, false).length * 0.5;
  }
  return strength;
}

function transferSystem(world: StageOneWorld, system: number, owner: number): void {
  if (system < 0) return;
  world.systems.owner[system] = owner;
  let body = world.systems.firstBody[system] ?? -1;
  while (body >= 0) {
    world.bodies.owner[body] = owner;
    body = world.bodies.nextInSystem[body] ?? -1;
  }
}

function ownedSystems(world: StageOneWorld, faction: number, excludeCapital: boolean): number[] {
  const systems: number[] = [];
  const capital = world.factions.capitalSystem[faction] ?? -1;
  for (let system = 0; system < world.systems.length; system += 1) {
    if ((world.systems.owner[system] ?? -1) !== faction) continue;
    if (excludeCapital && system === capital) continue;
    systems.push(system);
  }
  return systems;
}

function activeFactions(world: StageOneWorld): number[] {
  const factions: number[] = [];
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] === 1) factions.push(faction);
  }
  return factions;
}

function firstDormantFaction(world: StageOneWorld): number {
  for (let faction = INITIAL_ACTIVE_FACTIONS; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] !== 1) return faction;
  }
  return -1;
}

function aliveFactionCount(world: StageOneWorld): number {
  let count = 0;
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] === 1) count += 1;
  }
  return count;
}

function factionSystemShare(world: StageOneWorld, faction: number): number {
  return ownedSystems(world, faction, false).length / Math.max(1, world.systems.length);
}

function medianFactionAgeYears(world: StageOneWorld, tick: number): number {
  const ages: number[] = [];
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] !== 1) continue;
    ages.push((tick - (world.factionDynamics.bornTick[faction] ?? tick)) / 365);
  }
  ages.sort((a, b) => a - b);
  return ages.length > 0 ? (ages[Math.floor((ages.length - 1) / 2)] ?? 0) : 0;
}

function retainedBytes(world: StageOneWorld): number {
  let bytes = 0;
  const arenas = world.arenas();
  for (let arena = 0; arena < arenas.length; arena += 1) {
    const columns = arenas[arena]?.columns ?? [];
    for (let column = 0; column < columns.length; column += 1) {
      bytes += columns[column]?.data.byteLength ?? 0;
    }
  }
  return bytes;
}

function tailIsStable(samples: readonly number[]): boolean {
  if (samples.length < 4) return true;
  const start = Math.floor(samples.length * 0.75);
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (let i = start; i < samples.length; i += 1) {
    min = Math.min(min, samples[i] ?? 0);
    max = Math.max(max, samples[i] ?? 0);
  }
  return max <= min * 1.02;
}

function countSet(values: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < values.length; i += 1) if (values[i] === 1) count += 1;
  return count;
}

function emptyStageTwoMetrics(world: StageOneWorld): StageTwoMetrics {
  let population = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) >= 0) population += world.bodies.population[body] ?? 0;
  }
  return {
    totalPopulation: population,
    minPopulation: 100,
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
    researchedTechnologies: world.factions.researchedCount[0] ?? 0,
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
