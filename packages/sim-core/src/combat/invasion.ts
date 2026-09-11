import { AiOperationalTaskKind, type AiOperationalTask } from "../ai/bottleneck.js";
import { BuildingState } from "../econ/buildings.js";
import type { EntityRef } from "../entity/ids.js";
import { StageOneLogKind } from "../events/log.js";
import { recordWarCost } from "../diplo/war-exhaustion.js";
import { calculateDesignStats } from "../ships/design-stats.js";
import type { StageOneWorld } from "../world/state.js";

import { hasOrbitalSuperiority } from "./orbital.js";

export const GARRISON_STRENGTH = 250;
export const CAPTURE_POPULATION_SURVIVAL = 0.8;

export type InvasionFailure =
  "invalidFleet" | "notHostile" | "noOrbitalSuperiority" | "noTroops" | "repelled";

export interface InvasionResult {
  readonly captured: boolean;
  readonly reason: InvasionFailure | undefined;
  readonly attackStrength: number;
  readonly defenseStrength: number;
  readonly populationLost: number;
  readonly buildingsLost: number;
}

export function invadeColony(
  world: StageOneWorld,
  fleet: EntityRef,
  body: number,
  tick: number
): InvasionResult {
  if (!world.fleets.isAlive(fleet)) return failed("invalidFleet", 0, 0);
  const attacker = world.fleets.owner[fleet.index] ?? -1;
  const defender = world.bodies.owner[body] ?? -1;
  if (attacker < 0 || defender < 0 || !world.wars.isHostile(attacker, defender)) {
    return failed("notHostile", 0, 0);
  }
  if (!hasOrbitalSuperiority(world, body, attacker)) {
    return failed("noOrbitalSuperiority", 0, garrisonStrength(world, body));
  }
  const attackStrength = fleetTroopStrength(world, fleet);
  const defenseStrength = garrisonStrength(world, body);
  if (attackStrength <= 0) return failed("noTroops", 0, defenseStrength);
  if (attackStrength <= defenseStrength) return failed("repelled", attackStrength, defenseStrength);

  const beforePopulation = world.bodies.population[body] ?? 0;
  const afterPopulation = beforePopulation * CAPTURE_POPULATION_SURVIVAL;
  world.bodies.population[body] = afterPopulation;
  recordWarCost(world, defender, {
    shipsLost: 0,
    populationLost: beforePopulation - afterPopulation,
    creditsSpent: 0
  });
  const buildingsLost = damageBuildingsOnCapture(world, body);
  world.bodies.owner[body] = attacker;
  world.factions.rebuildColoniesFromOwners(world.bodies);
  refreshSystemOwner(world, world.bodies.system[body] ?? -1);
  world.colonyHistory.recordCaptured(body, defender, tick);
  world.colonyHistory.orbitalController[body] = attacker;
  const war = world.wars.activeWarBetween(attacker, defender);
  if (war >= 0) world.wars.markFrontChanged(war, tick);
  world.eventLog.append(
    tick,
    StageOneLogKind.ColonyCaptured,
    world.bodies.system[body] ?? -1,
    body,
    attacker,
    defender,
    beforePopulation - afterPopulation
  );
  return {
    captured: true,
    reason: undefined,
    attackStrength,
    defenseStrength,
    populationLost: beforePopulation - afterPopulation,
    buildingsLost
  };
}

export function fleetTroopStrength(world: StageOneWorld, fleet: EntityRef): number {
  if (!world.fleets.isAlive(fleet)) return 0;
  let troops = 0;
  for (let member = 0; member < world.fleets.memberLength; member += 1) {
    if (world.fleets.memberActive[member] !== 1) continue;
    if ((world.fleets.memberFleet[member] ?? -1) !== fleet.index) continue;
    if ((world.fleets.memberFleetGeneration[member] ?? 0) !== fleet.generation) continue;
    const ship = world.fleets.memberShip[member] ?? -1;
    if (
      !world.ships.isAlive({
        index: ship,
        generation: world.fleets.memberShipGeneration[member] ?? 0
      })
    )
      continue;
    const blueprint = world.ships.blueprint[ship] ?? -1;
    if (blueprint < 0 || blueprint >= world.blueprints.length) continue;
    troops += calculateDesignStats(world.data, world.blueprints.design(blueprint)).troops;
  }
  return troops;
}

export function garrisonStrength(world: StageOneWorld, body: number): number {
  const garrison = world.data.buildingIndex.get("garrison") ?? -1;
  let buildings = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (
      (world.buildings.type[building] ?? -1) === garrison &&
      world.buildings.state[building] !== BuildingState.Demolished &&
      world.buildings.state[building] !== BuildingState.UnderConstruction
    ) {
      buildings += 1;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  const populationMilitia = Math.sqrt(Math.max(0, world.bodies.population[body] ?? 0)) * 2;
  return buildings * GARRISON_STRENGTH + populationMilitia;
}

/** Operational AI hook: threat produces ordinary construction tasks. */
export function defenseTaskForThreat(
  world: StageOneWorld,
  faction: number,
  body: number,
  orbitalThreat: number,
  invasionThreat: number
): AiOperationalTask | undefined {
  if ((world.bodies.owner[body] ?? -1) !== faction) return undefined;
  const orbitalDefense = world.data.buildingIndex.get("orbital_defense") ?? -1;
  const garrison = world.data.buildingIndex.get("garrison") ?? -1;
  const buildingType =
    orbitalThreat > 0 && orbitalDefense >= 0 && !hasBuilding(world, body, orbitalDefense)
      ? orbitalDefense
      : invasionThreat > 0 && garrison >= 0 && !hasBuilding(world, body, garrison)
        ? garrison
        : -1;
  if (buildingType < 0) return undefined;
  const resource = world.data.buildings[buildingType]?.buildCost[0]?.resource ?? -1;
  return {
    kind: AiOperationalTaskKind.BuildProducer,
    faction,
    resource,
    body,
    buildingType,
    score: Math.max(orbitalThreat, invasionThreat)
  };
}

function damageBuildingsOnCapture(world: StageOneWorld, body: number): number {
  let candidate = 0;
  let lost = 0;
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const next = world.buildings.nextInBody[building] ?? -1;
    if (world.buildings.state[building] !== BuildingState.Demolished) {
      if (candidate % 4 === 0) {
        world.buildings.markDemolished(world.data, world.bodies, building, world.stockpiles);
        lost += 1;
      }
      candidate += 1;
    }
    building = next;
  }
  return lost;
}

function refreshSystemOwner(world: StageOneWorld, system: number): void {
  if (system < 0) return;
  let owner = -1;
  let body = world.systems.firstBody[system] ?? -1;
  while (body >= 0) {
    const bodyOwner = world.bodies.owner[body] ?? -1;
    if (bodyOwner >= 0) {
      if (owner < 0) owner = bodyOwner;
      else if (owner !== bodyOwner) {
        world.systems.owner[system] = -1;
        return;
      }
    }
    body = world.bodies.nextInSystem[body] ?? -1;
  }
  world.systems.owner[system] = owner;
}

function hasBuilding(world: StageOneWorld, body: number, type: number): boolean {
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    if (
      (world.buildings.type[building] ?? -1) === type &&
      world.buildings.state[building] !== BuildingState.Demolished
    ) {
      return true;
    }
    building = world.buildings.nextInBody[building] ?? -1;
  }
  return false;
}

function failed(
  reason: InvasionFailure,
  attackStrength: number,
  defenseStrength: number
): InvasionResult {
  return {
    captured: false,
    reason,
    attackStrength,
    defenseStrength,
    populationLost: 0,
    buildingsLost: 0
  };
}
