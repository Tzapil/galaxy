import { RoutePlanner } from "../nav/route.js";
import { BuildingState } from "../econ/buildings.js";
import { resourceIndexOf, type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

import { administrativeCapacity } from "./admin-capacity.js";
import { advanceRepression } from "./repression.js";
import { regionalDistanceOrigin } from "./regional-capital.js";

export const REGION_TENSION_THRESHOLD = 40;

export interface RegionTensionBreakdown {
  readonly distance: number;
  readonly freshness: number;
  readonly culturalForeignness: number;
  readonly consumerShortage: number;
  readonly vitalShortage: number;
  readonly warExhaustion: number;
  readonly taxBurden: number;
  readonly administrativeCapacity: number;
  readonly total: number;
}

/** All eight terms from spec 11.4, evaluated for one concrete generated region. */
export function calculateRegionTension(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  region: number,
  tick: number,
  advanceRepressionState = false
): RegionTensionBreakdown {
  const routePlanner = new RoutePlanner(Math.max(8, world.systems.length));
  const origin = regionalDistanceOrigin(world, faction, region);
  let distanceTotal = 0;
  let systemCount = 0;
  for (let system = 0; system < world.systems.length; system += 1) {
    if (
      (world.systems.owner[system] ?? -1) !== faction ||
      (world.systems.region[system] ?? -1) !== region
    ) {
      continue;
    }
    const route = routePlanner.find(world.systems, world.gates, origin, system);
    distanceTotal += route.reachable ? route.jumps : world.systems.length;
    systemCount += 1;
  }
  const distanceMultiplier = world.techModifiers.globalMultiplier(faction, "distancePenalty");
  const distance = (systemCount > 0 ? distanceTotal / systemCount : 0) * 0.55 * distanceMultiplier;
  const history = historyTerms(world, faction, region, tick);
  const consumer = resourceIndexOf(data.resourceIndex, "consumer_goods");
  const food = resourceIndexOf(data.resourceIndex, "food");
  const medicine = resourceIndexOf(data.resourceIndex, "medicine");
  const consumerShortage = regionalShortage(data, world, faction, region, consumer) * 16;
  const vitalShortage =
    ((regionalShortage(data, world, faction, region, food) +
      regionalShortage(data, world, faction, region, medicine)) /
      2) *
    16;
  const warExhaustion = ((world.factionDynamics.warExhaustion[faction] ?? 0) / 100) * 8;
  const taxBurden = clamp01(world.factionDynamics.taxBurden[faction] ?? 0) * 8;
  const capacity = administrativeCapacity(world, faction).total;
  const ownedSystems = countOwnedSystems(world, faction);
  const repression = advanceRepressionState
    ? advanceRepression(world, faction, region)
    : currentRepression(world, faction, region);
  const administrativeTerm =
    Math.max(0, ownedSystems - capacity) * 1.8 -
    Math.min(14, capacity * 0.12) -
    repression.immediateRelief;
  const culturalForeignness = history.culturalForeignness + repression.releasedHatred;
  const total = clamp(
    distance +
      history.freshness +
      culturalForeignness +
      consumerShortage +
      vitalShortage +
      warExhaustion +
      taxBurden +
      administrativeTerm,
    0,
    100
  );
  return {
    distance,
    freshness: history.freshness,
    culturalForeignness,
    consumerShortage,
    vitalShortage,
    warExhaustion,
    taxBurden,
    administrativeCapacity: administrativeTerm,
    total
  };
}

export function updateRegionTension(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  region: number,
  tick: number
): RegionTensionBreakdown {
  const breakdown = calculateRegionTension(data, world, faction, region, tick, true);
  const row = world.cohesion.row(faction, region, true);
  world.cohesion.tension[row] = breakdown.total;
  if (breakdown.total >= REGION_TENSION_THRESHOLD) {
    if ((world.cohesion.highSinceTick[row] ?? -1) < 0) world.cohesion.highSinceTick[row] = tick;
  } else {
    world.cohesion.highSinceTick[row] = -1;
  }
  return breakdown;
}

function historyTerms(
  world: StageOneWorld,
  faction: number,
  region: number,
  tick: number
): { readonly freshness: number; readonly culturalForeignness: number } {
  let freshness = 0;
  let foreignness = 0;
  let bodies = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const system = world.bodies.system[body] ?? -1;
    if ((world.systems.region[system] ?? -1) !== region) continue;
    bodies += 1;
    // F5: founded colonies never receive conquest freshness, regardless of age.
    if (world.colonyHistory.wasConquered(body)) {
      const age = Math.max(0, tick - (world.colonyHistory.conqueredTick[body] ?? tick));
      freshness += Math.max(0, 1 - age / (50 * 365)) * 14;
    }
    const founder = world.colonyHistory.foundedBy[body] ?? faction;
    const founderCulture =
      founder >= 0 && founder < world.factionDynamics.length
        ? (world.factionDynamics.culture[founder] ?? founder)
        : founder;
    const ownerCulture = world.factionDynamics.culture[faction] ?? faction;
    if (founderCulture !== ownerCulture) foreignness += 8;
  }
  const divisor = Math.max(1, bodies);
  const assimilation = world.techModifiers.globalMultiplier(faction, "foreignnessDecay");
  return {
    freshness: freshness / divisor,
    culturalForeignness: foreignness / divisor / Math.max(1, assimilation)
  };
}

function regionalShortage(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  region: number,
  resource: number
): number {
  let stock = 0;
  let dailyNeed = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const system = world.bodies.system[body] ?? -1;
    if ((world.systems.region[system] ?? -1) !== region) continue;
    stock += world.stockpiles.get(world.bodies.stockpile[body] ?? 0, resource);
    dailyNeed +=
      (world.bodies.population[body] ?? 0) *
      (data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
  }
  if (dailyNeed <= 0) return 0;
  return 1 - Math.min(1, stock / Math.max(0.0001, dailyNeed * 90));
}

function countOwnedSystems(world: StageOneWorld, faction: number): number {
  let count = 0;
  for (let system = 0; system < world.systems.length; system += 1) {
    if ((world.systems.owner[system] ?? -1) === faction) count += 1;
  }
  return count;
}

function currentRepression(
  world: StageOneWorld,
  faction: number,
  region: number
): { readonly immediateRelief: number; readonly releasedHatred: number } {
  const row = world.cohesion.row(faction, region, true);
  let garrisons = 0;
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] === BuildingState.Demolished) continue;
    if (world.data.buildings[world.buildings.type[building] ?? -1]?.id !== "garrison") continue;
    const body = world.buildings.body[building] ?? -1;
    const system = world.bodies.system[body] ?? -1;
    if (
      (world.bodies.owner[body] ?? -1) === faction &&
      (world.systems.region[system] ?? -1) === region
    ) {
      garrisons += 1;
    }
  }
  return {
    immediateRelief: Math.min(12, garrisons * 3),
    releasedHatred: world.cohesion.releasedHatred[row] ?? 0
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
