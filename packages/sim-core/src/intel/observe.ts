import { calculateDesignStats } from "../ships/design-stats.js";
import { ShipRole, ShipState } from "../ships/ships.js";
import type { EntityRef } from "../entity/ids.js";
import { StageOneLogKind } from "../events/log.js";
import type { StageOneWorld } from "../world/state.js";

import { BattleSide } from "../combat/battle.js";
import { IntelSource, type ObservedFleetProfile } from "./memory.js";

export function observeFleetAfterBattle(
  world: StageOneWorld,
  observer: number,
  targetFleet: number,
  tick: number
): number {
  const target = world.fleets.owner[targetFleet] ?? -1;
  if (target < 0 || target === observer) return -1;
  const row = world.intel.record(
    observer,
    target,
    IntelSource.Battle,
    tick,
    fleetProfile(world, targetFleet)
  );
  logIntel(world, observer, target, tick, IntelSource.Battle);
  return row;
}

export function observeBorderFleet(
  world: StageOneWorld,
  observer: number,
  targetFleet: number,
  tick: number
): number {
  const target = world.fleets.owner[targetFleet] ?? -1;
  if (target < 0 || target === observer) return -1;
  const row = world.intel.record(
    observer,
    target,
    IntelSource.Border,
    tick,
    fleetProfile(world, targetFleet)
  );
  logIntel(world, observer, target, tick, IntelSource.Border);
  return row;
}

/** Battle reports include destroyed ships by reading the immutable battle roster. */
export function observeBattle(world: StageOneWorld, battle: EntityRef, tick: number): number {
  const fleetA = world.battles.fleetA[battle.index] ?? -1;
  const fleetB = world.battles.fleetB[battle.index] ?? -1;
  const ownerA = world.fleets.owner[fleetA] ?? -1;
  const ownerB = world.fleets.owner[fleetB] ?? -1;
  if (ownerA < 0 || ownerB < 0 || ownerA === ownerB) return 0;
  world.intel.record(
    ownerA,
    ownerB,
    IntelSource.Battle,
    tick,
    battleFleetProfile(world, battle, BattleSide.B)
  );
  logIntel(world, ownerA, ownerB, tick, IntelSource.Battle);
  world.intel.record(
    ownerB,
    ownerA,
    IntelSource.Battle,
    tick,
    battleFleetProfile(world, battle, BattleSide.A)
  );
  logIntel(world, ownerB, ownerA, tick, IntelSource.Battle);
  return 2;
}

export function scoutSystem(
  world: StageOneWorld,
  scout: number,
  system: number,
  tick: number
): number {
  if (
    world.ships.state[scout] === ShipState.Disbanded ||
    world.ships.role[scout] !== ShipRole.Scout ||
    (world.ships.currentSystem[scout] ?? -1) !== system
  ) {
    return 0;
  }
  const blueprint = world.ships.blueprint[scout] ?? -1;
  if (
    blueprint < 0 ||
    blueprint >= world.blueprints.length ||
    calculateDesignStats(world.data, world.blueprints.design(blueprint)).scan <= 0
  ) {
    return 0;
  }
  const observer = world.ships.faction[scout] ?? -1;
  let reports = 0;
  for (let fleet = 0; fleet < world.fleets.length; fleet += 1) {
    if ((world.fleets.currentSystem[fleet] ?? -2) !== system) continue;
    const target = world.fleets.owner[fleet] ?? -1;
    if (target < 0 || target === observer) continue;
    world.intel.record(observer, target, IntelSource.Scout, tick, fleetProfile(world, fleet));
    logIntel(world, observer, target, tick, IntelSource.Scout);
    reports += 1;
  }
  return reports;
}

function logIntel(
  world: StageOneWorld,
  observer: number,
  target: number,
  tick: number,
  source: IntelSource
): void {
  world.eventLog.append(tick, StageOneLogKind.IntelUpdated, -1, -1, observer, target, source);
}

export function fleetProfile(world: StageOneWorld, fleet: number): ObservedFleetProfile {
  const accumulator = emptyAccumulator();
  const ref = world.fleets.ref(fleet);
  for (let member = 0; member < world.fleets.memberLength; member += 1) {
    if (world.fleets.memberActive[member] !== 1) continue;
    if ((world.fleets.memberFleet[member] ?? -1) !== fleet) continue;
    if ((world.fleets.memberFleetGeneration[member] ?? 0) !== ref.generation) continue;
    const ship = world.fleets.memberShip[member] ?? -1;
    if (
      !world.ships.isAlive({
        index: ship,
        generation: world.fleets.memberShipGeneration[member] ?? 0
      })
    )
      continue;
    addShipToProfile(world, ship, accumulator);
  }
  return finishProfile(accumulator);
}

function battleFleetProfile(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide
): ObservedFleetProfile {
  const accumulator = emptyAccumulator();
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if ((world.battles.shipBattle[row] ?? -1) !== battle.index) continue;
    if ((world.battles.shipBattleGeneration[row] ?? 0) !== battle.generation) continue;
    if ((world.battles.shipSide[row] ?? 0) !== side) continue;
    addShipToProfile(world, world.battles.ship[row] ?? -1, accumulator);
  }
  return finishProfile(accumulator);
}

interface ProfileAccumulator {
  strength: number;
  kinetic: number;
  laser: number;
  missile: number;
  plasma: number;
  ships: number;
  shieldShips: number;
  armor: number;
}

function emptyAccumulator(): ProfileAccumulator {
  return {
    strength: 0,
    kinetic: 0,
    laser: 0,
    missile: 0,
    plasma: 0,
    ships: 0,
    shieldShips: 0,
    armor: 0
  };
}

function addShipToProfile(
  world: StageOneWorld,
  ship: number,
  accumulator: ProfileAccumulator
): void {
  const blueprint = world.ships.blueprint[ship] ?? -1;
  if (blueprint < 0 || blueprint >= world.blueprints.length) return;
  const stats = calculateDesignStats(world.data, world.blueprints.design(blueprint));
  accumulator.strength +=
    stats.effectiveHitPoints + (stats.damageLong + stats.damageMedium + stats.damageShort) * 6;
  if (stats.shieldHp > 0) accumulator.shieldShips += 1;
  accumulator.armor += stats.armorRating;
  accumulator.ships += 1;
  for (let slot = 0; slot < (world.blueprints.moduleCount[blueprint] ?? 0); slot += 1) {
    const module = world.data.modules[world.blueprints.moduleAt(blueprint, slot)];
    if (module === undefined || module.damage <= 0) continue;
    if (module.family === "laser" || module.family === "energy") {
      accumulator.laser += module.damage;
    } else if (module.family === "missile" || module.family === "torpedo") {
      accumulator.missile += module.damage;
    } else if (module.family === "plasma") {
      accumulator.plasma += module.damage;
    } else {
      accumulator.kinetic += module.damage;
    }
  }
}

function finishProfile(accumulator: ProfileAccumulator): ObservedFleetProfile {
  const weaponTotal = Math.max(
    1,
    accumulator.kinetic + accumulator.laser + accumulator.missile + accumulator.plasma
  );
  return {
    strength: accumulator.strength,
    kineticFraction: accumulator.kinetic / weaponTotal,
    laserFraction: accumulator.laser / weaponTotal,
    missileFraction: accumulator.missile / weaponTotal,
    plasmaFraction: accumulator.plasma / weaponTotal,
    shieldFraction: accumulator.ships > 0 ? accumulator.shieldShips / accumulator.ships : 0,
    armorRating: accumulator.ships > 0 ? accumulator.armor / accumulator.ships : 0
  };
}
