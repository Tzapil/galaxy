import type { StageOneDoctrine } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
import type { EntityRef } from "../entity/ids.js";
import { StageOneLogKind } from "../events/log.js";

import { resolveBandStep, weaponCanFire, type CombatBand } from "./bands.js";
import { BattleSide, MAX_BATTLE_ROUNDS } from "./battle.js";
import { applyLayeredDamage } from "./damage.js";
import { recordWarCost } from "../diplo/war-exhaustion.js";
import { interceptDamage } from "./intercept.js";
import { CombatLogKind } from "./log.js";
import { checkWithdrawal } from "./withdraw.js";

export interface BattleRoundResult {
  readonly active: boolean;
  readonly round: number;
  readonly band: CombatBand;
  readonly shipsA: number;
  readonly shipsB: number;
  readonly destroyed: number;
  readonly withdrew: BattleSide | 0;
  readonly operations: number;
}

export class CombatRoundScratch {
  public attacker: Int32Array;
  public target: Int32Array;
  public weapon: Int32Array;
  public rawDamage: Float64Array;
  public intercepted: Float64Array;
  public vsShield: Float64Array;
  public vsArmor: Float64Array;
  public count = 0;

  public constructor(initialCapacity = 1024) {
    const capacity = Math.max(1, initialCapacity | 0);
    this.attacker = new Int32Array(capacity);
    this.target = new Int32Array(capacity);
    this.weapon = new Int32Array(capacity);
    this.rawDamage = new Float64Array(capacity);
    this.intercepted = new Float64Array(capacity);
    this.vsShield = new Float64Array(capacity);
    this.vsArmor = new Float64Array(capacity);
  }

  public reset(): void {
    this.count = 0;
  }

  public push(
    attacker: number,
    target: number,
    weapon: number,
    rawDamage: number,
    intercepted: number,
    vsShield: number,
    vsArmor: number
  ): void {
    this.ensureCapacity(this.count + 1);
    const row = this.count;
    this.count += 1;
    this.attacker[row] = attacker;
    this.target[row] = target;
    this.weapon[row] = weapon;
    this.rawDamage[row] = rawDamage;
    this.intercepted[row] = intercepted;
    this.vsShield[row] = vsShield;
    this.vsArmor[row] = vsArmor;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.attacker.length) return;
    let capacity = this.attacker.length;
    while (capacity < required) capacity *= 2;
    this.attacker = growI32(this.attacker, capacity);
    this.target = growI32(this.target, capacity);
    this.weapon = growI32(this.weapon, capacity);
    this.rawDamage = growF64(this.rawDamage, capacity);
    this.intercepted = growF64(this.intercepted, capacity);
    this.vsShield = growF64(this.vsShield, capacity);
    this.vsArmor = growF64(this.vsArmor, capacity);
  }
}

/** One tick is exactly one DISTANCE -> FIRE -> RESULTS combat round (spec 9.2). */
export function resolveBattleRound(
  world: StageOneWorld,
  battle: EntityRef,
  tick: number,
  scratch: CombatRoundScratch
): BattleRoundResult {
  if (!world.battles.isActive(battle)) return inactiveResult(world, battle.index);
  const nextRound = (world.battles.round[battle.index] ?? 0) + 1;
  world.battles.round[battle.index] = nextRound;
  const doctrineA = doctrineForSide(world, battle, BattleSide.A);
  const doctrineB = doctrineForSide(world, battle, BattleSide.B);
  const speedA = averageSpeed(world, battle, BattleSide.A, nextRound);
  const speedB = averageSpeed(world, battle, BattleSide.B, nextRound);
  const currentBand = world.battles.band[battle.index] as CombatBand;
  const band = resolveBandStep(currentBand, doctrineA, doctrineB, speedA, speedB);
  world.battles.band[battle.index] = band;

  scratch.reset();
  gatherVolley(world, battle, nextRound, band, BattleSide.A, BattleSide.B, scratch);
  gatherVolley(world, battle, nextRound, band, BattleSide.B, BattleSide.A, scratch);
  const destroyed = applyVolley(world, battle, nextRound, tick, scratch);
  regenerateShields(world, battle, nextRound);

  let shipsA = countActive(world, battle, BattleSide.A, nextRound);
  let shipsB = countActive(world, battle, BattleSide.B, nextRound);
  let withdrew: BattleSide | 0 = 0;
  const strengthA = sideStrength(world, battle, BattleSide.A, nextRound);
  const strengthB = sideStrength(world, battle, BattleSide.B, nextRound);

  if (shipsA > 0 && shipsB > 0) {
    const lossA = 1 - shipsA / Math.max(1, world.battles.initialA[battle.index] ?? 1);
    const lossB = 1 - shipsB / Math.max(1, world.battles.initialB[battle.index] ?? 1);
    const withdrawA = checkWithdrawal(
      lossA,
      lossB,
      doctrineA.withdrawAt,
      speedA,
      speedB,
      strengthA,
      strengthB,
      doctrineB.pursueAbove
    );
    const withdrawB = checkWithdrawal(
      lossB,
      lossA,
      doctrineB.withdrawAt,
      speedB,
      speedA,
      strengthB,
      strengthA,
      doctrineA.pursueAbove
    );
    if (withdrawA.escaped) withdrew = BattleSide.A;
    else if (withdrawB.escaped) withdrew = BattleSide.B;
  }

  const hitLimit = nextRound >= MAX_BATTLE_ROUNDS;
  if (shipsA === 0 || shipsB === 0 || withdrew !== 0 || hitLimit) {
    const ownerA = fleetOwner(world, world.battles.fleetA[battle.index] ?? -1);
    const ownerB = fleetOwner(world, world.battles.fleetB[battle.index] ?? -1);
    const winner =
      withdrew === BattleSide.A
        ? ownerB
        : withdrew === BattleSide.B
          ? ownerA
          : shipsA === 0 && shipsB === 0
            ? -1
            : shipsA === 0
              ? ownerB
              : shipsB === 0
                ? ownerA
                : strengthA > strengthB
                  ? ownerA
                  : strengthB > strengthA
                    ? ownerB
                    : -1;
    if (withdrew !== 0) appendWithdrawal(world, battle, tick, nextRound, withdrew);
    world.battles.end(battle, tick, winner);
    world.eventLog.append(
      tick,
      StageOneLogKind.BattleEnded,
      world.battles.system[battle.index] ?? -1,
      -1,
      battle.index,
      winner,
      nextRound
    );
    retireEmptyFleet(world, world.battles.fleetA[battle.index] ?? -1);
    retireEmptyFleet(world, world.battles.fleetB[battle.index] ?? -1);
  }

  shipsA = countActive(world, battle, BattleSide.A, nextRound);
  shipsB = countActive(world, battle, BattleSide.B, nextRound);
  const operations = scratch.count + destroyed + shipsA + shipsB;
  world.battles.operations[battle.index] =
    (world.battles.operations[battle.index] ?? 0) + operations;
  return {
    active: world.battles.isActive(battle),
    round: nextRound,
    band,
    shipsA,
    shipsB,
    destroyed,
    withdrew,
    operations
  };
}

function retireEmptyFleet(world: StageOneWorld, fleet: number): void {
  if (fleet < 0) return;
  const ref = world.fleets.ref(fleet);
  if (!world.fleets.isAlive(ref)) return;
  world.fleets.pruneLostShips(ref, world.ships);
  if ((world.fleets.memberCount[fleet] ?? 0) === 0) world.fleets.disband(ref, world.ships);
}

function gatherVolley(
  world: StageOneWorld,
  battle: EntityRef,
  round: number,
  band: CombatBand,
  attackerSide: BattleSide,
  defenderSide: BattleSide,
  scratch: CombatRoundScratch
): void {
  let intercept = totalIntercept(world, battle, defenderSide, round);
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!eligible(world, battle, row, attackerSide, round)) continue;
    const target = chooseTarget(
      world,
      battle,
      defenderSide,
      round,
      world.battles.shipDoctrine[row] ?? -1
    );
    if (target < 0) return;
    const ship = world.battles.ship[row] ?? -1;
    const blueprint = world.ships.blueprint[ship] ?? -1;
    if (blueprint < 0 || blueprint >= world.blueprints.length) continue;
    const moduleCount = world.blueprints.moduleCount[blueprint] ?? 0;
    for (let slot = 0; slot < moduleCount; slot += 1) {
      const moduleIndex = world.blueprints.moduleAt(blueprint, slot);
      const module = world.data.modules[moduleIndex];
      if (module === undefined || module.damage <= 0 || !weaponCanFire(module.bands, band))
        continue;
      const faction = world.ships.faction[ship] ?? 0;
      const raw =
        module.damage * world.techModifiers.moduleStatMultiplier(faction, moduleIndex, "damage");
      let remaining = raw;
      let absorbed = 0;
      if (module.interceptable) {
        const result = interceptDamage(raw, intercept);
        remaining = result.damage;
        absorbed = result.absorbed;
        intercept = result.interceptRemaining;
      }
      if (remaining > 0) {
        scratch.push(
          row,
          target,
          moduleIndex,
          remaining,
          absorbed,
          module.vsShield,
          module.vsArmor
        );
      }
    }
  }
}

function applyVolley(
  world: StageOneWorld,
  battle: EntityRef,
  round: number,
  tick: number,
  scratch: CombatRoundScratch
): number {
  for (let hit = 0; hit < scratch.count; hit += 1) {
    const target = scratch.target[hit] ?? -1;
    if (target < 0) continue;
    const result = applyLayeredDamage(
      {
        shield: world.battles.shipShield[target] ?? 0,
        armorRating: world.battles.shipArmorRating[target] ?? 0,
        structure: world.battles.shipStructure[target] ?? 0
      },
      scratch.rawDamage[hit] ?? 0,
      scratch.vsShield[hit] ?? 1,
      scratch.vsArmor[hit] ?? 1
    );
    world.battles.shipShield[target] = result.shield;
    world.battles.shipStructure[target] = result.structure;
    world.battles.log.append({
      tick,
      battle: battle.index,
      round,
      kind: CombatLogKind.Shot,
      side: world.battles.shipSide[scratch.attacker[hit] ?? -1] ?? 0,
      actor: world.battles.ship[scratch.attacker[hit] ?? -1] ?? -1,
      target: world.battles.ship[target] ?? -1,
      weapon: scratch.weapon[hit] ?? -1,
      rawDamage: scratch.rawDamage[hit] ?? 0,
      intercepted: scratch.intercepted[hit] ?? 0,
      shieldDamage: result.shieldDamage,
      armorPrevented: result.armorPrevented,
      structureDamage: result.structureDamage
    });
  }

  let destroyed = 0;
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!belongsToBattle(world, battle, row) || world.battles.shipActive[row] !== 1) continue;
    if ((world.battles.shipStructure[row] ?? 0) > 0) continue;
    world.battles.shipActive[row] = 0;
    const ship = world.battles.ship[row] ?? -1;
    const faction = world.ships.faction[ship] ?? -1;
    world.ships.markDisbanded(ship);
    if (faction >= 0) {
      recordWarCost(world, faction, { shipsLost: 1, populationLost: 0, creditsSpent: 0 });
    }
    destroyed += 1;
    world.battles.log.append({
      tick,
      battle: battle.index,
      round,
      kind: CombatLogKind.Destroyed,
      side: world.battles.shipSide[row] ?? 0,
      actor: ship,
      target: ship,
      weapon: -1,
      rawDamage: 0,
      intercepted: 0,
      shieldDamage: 0,
      armorPrevented: 0,
      structureDamage: 0
    });
  }
  return destroyed;
}

function regenerateShields(world: StageOneWorld, battle: EntityRef, round: number): void {
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!eligibleAnySide(world, battle, row, round)) continue;
    world.battles.shipShield[row] = Math.min(
      world.battles.shipMaxShield[row] ?? 0,
      (world.battles.shipShield[row] ?? 0) + (world.battles.shipShieldRegen[row] ?? 0)
    );
  }
}

function chooseTarget(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide,
  round: number,
  doctrineIndex: number
): number {
  const doctrine = world.data.doctrines[doctrineIndex];
  const focusWeak = doctrine !== undefined && doctrine.weights.dps >= doctrine.weights.ehp;
  let best = -1;
  let bestValue = focusWeak ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!eligible(world, battle, row, side, round)) continue;
    const value = focusWeak
      ? (world.battles.shipShield[row] ?? 0) + (world.battles.shipStructure[row] ?? 0)
      : (world.battles.shipMaxStructure[row] ?? 0);
    if (
      (focusWeak && value < bestValue - 1e-9) ||
      (!focusWeak && value > bestValue + 1e-9) ||
      (Math.abs(value - bestValue) <= 1e-9 &&
        (world.battles.ship[row] ?? 0) < bestShipId(world, best))
    ) {
      best = row;
      bestValue = value;
    }
  }
  return best;
}

function doctrineForSide(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide
): StageOneDoctrine {
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!belongsToBattle(world, battle, row) || (world.battles.shipSide[row] ?? 0) !== side)
      continue;
    const doctrine = world.data.doctrines[world.battles.shipDoctrine[row] ?? -1];
    if (doctrine !== undefined) return doctrine;
  }
  const fallback = world.data.doctrines[0];
  if (fallback === undefined) throw new RangeError("Combat requires at least one doctrine.");
  return fallback;
}

function eligible(
  world: StageOneWorld,
  battle: EntityRef,
  row: number,
  side: BattleSide,
  round: number
): boolean {
  return eligibleAnySide(world, battle, row, round) && (world.battles.shipSide[row] ?? 0) === side;
}

function eligibleAnySide(
  world: StageOneWorld,
  battle: EntityRef,
  row: number,
  round: number
): boolean {
  return (
    belongsToBattle(world, battle, row) &&
    world.battles.shipActive[row] === 1 &&
    (world.battles.shipJoinedRound[row] ?? 255) <= round &&
    world.ships.isAlive({
      index: world.battles.ship[row] ?? -1,
      generation: world.battles.shipGeneration[row] ?? 0
    })
  );
}

function belongsToBattle(world: StageOneWorld, battle: EntityRef, row: number): boolean {
  return (
    (world.battles.shipBattle[row] ?? -1) === battle.index &&
    (world.battles.shipBattleGeneration[row] ?? 0) === battle.generation
  );
}

function countActive(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide,
  round: number
): number {
  let count = 0;
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (eligible(world, battle, row, side, round)) count += 1;
  }
  return count;
}

function averageSpeed(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide,
  round: number
): number {
  let total = 0;
  let count = 0;
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!eligible(world, battle, row, side, round)) continue;
    total += world.battles.shipSpeed[row] ?? 0;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function totalIntercept(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide,
  round: number
): number {
  let total = 0;
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (eligible(world, battle, row, side, round)) total += world.battles.shipIntercept[row] ?? 0;
  }
  return total;
}

function sideStrength(
  world: StageOneWorld,
  battle: EntityRef,
  side: BattleSide,
  round: number
): number {
  let total = 0;
  for (let row = 0; row < world.battles.shipLength; row += 1) {
    if (!eligible(world, battle, row, side, round)) continue;
    total += Math.max(0, world.battles.shipStructure[row] ?? 0);
    total += Math.max(0, world.battles.shipShield[row] ?? 0);
  }
  return total;
}

function appendWithdrawal(
  world: StageOneWorld,
  battle: EntityRef,
  tick: number,
  round: number,
  side: BattleSide
): void {
  world.battles.log.append({
    tick,
    battle: battle.index,
    round,
    kind: CombatLogKind.Withdrew,
    side,
    actor:
      side === BattleSide.A
        ? (world.battles.fleetA[battle.index] ?? -1)
        : (world.battles.fleetB[battle.index] ?? -1),
    target: -1,
    weapon: -1,
    rawDamage: 0,
    intercepted: 0,
    shieldDamage: 0,
    armorPrevented: 0,
    structureDamage: 0
  });
}

function fleetOwner(world: StageOneWorld, fleet: number): number {
  return fleet >= 0 ? (world.fleets.owner[fleet] ?? -1) : -1;
}

function bestShipId(world: StageOneWorld, battleShip: number): number {
  return battleShip >= 0
    ? (world.battles.ship[battleShip] ?? Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER;
}

function inactiveResult(world: StageOneWorld, battle: number): BattleRoundResult {
  return {
    active: false,
    round: world.battles.round[battle] ?? 0,
    band: (world.battles.band[battle] ?? 0) as CombatBand,
    shipsA: 0,
    shipsB: 0,
    destroyed: 0,
    withdrew: 0,
    operations: 0
  };
}

function growI32(source: Int32Array, capacity: number): Int32Array {
  const result = new Int32Array(capacity);
  result.set(source);
  return result;
}

function growF64(source: Float64Array, capacity: number): Float64Array {
  const result = new Float64Array(capacity);
  result.set(source);
  return result;
}
