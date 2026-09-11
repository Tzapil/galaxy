import type { EntityRef } from "../entity/ids.js";
import { StageOneLogKind } from "../events/log.js";
import { calculateDesignStats, type ShipDesignStats } from "../ships/design-stats.js";
import type { StageOneWorld } from "../world/state.js";
import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

import { CombatBand } from "./bands.js";
import { CombatLog, CombatLogKind } from "./log.js";

export const MAX_BATTLE_ROUNDS = 40;

export const enum BattleState {
  Ended = 0,
  Active = 1
}

export const enum BattleSide {
  A = 1,
  B = 2
}

export type BattleColumn =
  | "generation"
  | "state"
  | "system"
  | "fleetA"
  | "fleetAGeneration"
  | "fleetB"
  | "fleetBGeneration"
  | "band"
  | "round"
  | "startedTick"
  | "endedTick"
  | "winner"
  | "operations"
  | "initialA"
  | "initialB";

export type BattleShipColumn =
  | "battle"
  | "battleGeneration"
  | "side"
  | "ship"
  | "shipGeneration"
  | "doctrine"
  | "joinedRound"
  | "active"
  | "shield"
  | "maxShield"
  | "shieldRegen"
  | "armorRating"
  | "structure"
  | "maxStructure"
  | "speed"
  | "intercept";

export class Battles {
  public generation: Uint32Array;
  public state: Uint8Array;
  public system: Uint32Array;
  public fleetA: Uint32Array;
  public fleetAGeneration: Uint32Array;
  public fleetB: Uint32Array;
  public fleetBGeneration: Uint32Array;
  public band: Uint8Array;
  public round: Uint8Array;
  public startedTick: Float64Array;
  public endedTick: Float64Array;
  public winner: Int32Array;
  public operations: Float64Array;
  public initialA: Uint32Array;
  public initialB: Uint32Array;

  public shipBattle: Uint32Array;
  public shipBattleGeneration: Uint32Array;
  public shipSide: Uint8Array;
  public ship: Uint32Array;
  public shipGeneration: Uint32Array;
  public shipDoctrine: Int32Array;
  public shipJoinedRound: Uint8Array;
  public shipActive: Uint8Array;
  public shipShield: Float64Array;
  public shipMaxShield: Float64Array;
  public shipShieldRegen: Float64Array;
  public shipArmorRating: Float64Array;
  public shipStructure: Float64Array;
  public shipMaxStructure: Float64Array;
  public shipSpeed: Float64Array;
  public shipIntercept: Float64Array;

  public constructor(
    public readonly arena: SoAArena<BattleColumn>,
    public readonly ships: SoAArena<BattleShipColumn>,
    public readonly log: CombatLog
  ) {
    this.generation = new Uint32Array(0);
    this.state = new Uint8Array(0);
    this.system = new Uint32Array(0);
    this.fleetA = new Uint32Array(0);
    this.fleetAGeneration = new Uint32Array(0);
    this.fleetB = new Uint32Array(0);
    this.fleetBGeneration = new Uint32Array(0);
    this.band = new Uint8Array(0);
    this.round = new Uint8Array(0);
    this.startedTick = new Float64Array(0);
    this.endedTick = new Float64Array(0);
    this.winner = new Int32Array(0);
    this.operations = new Float64Array(0);
    this.initialA = new Uint32Array(0);
    this.initialB = new Uint32Array(0);
    this.shipBattle = new Uint32Array(0);
    this.shipBattleGeneration = new Uint32Array(0);
    this.shipSide = new Uint8Array(0);
    this.ship = new Uint32Array(0);
    this.shipGeneration = new Uint32Array(0);
    this.shipDoctrine = new Int32Array(0);
    this.shipJoinedRound = new Uint8Array(0);
    this.shipActive = new Uint8Array(0);
    this.shipShield = new Float64Array(0);
    this.shipMaxShield = new Float64Array(0);
    this.shipShieldRegen = new Float64Array(0);
    this.shipArmorRating = new Float64Array(0);
    this.shipStructure = new Float64Array(0);
    this.shipMaxStructure = new Float64Array(0);
    this.shipSpeed = new Float64Array(0);
    this.shipIntercept = new Float64Array(0);
    this.refreshColumns();
    this.refreshShipColumns();
  }

  public static create(initialCapacity = 32, shipCapacity = 512): Battles {
    return new Battles(
      new SoAArena<BattleColumn>(
        "battles",
        [
          { name: "generation", kind: "u32" },
          { name: "state", kind: "u8" },
          { name: "system", kind: "u32" },
          { name: "fleetA", kind: "u32" },
          { name: "fleetAGeneration", kind: "u32" },
          { name: "fleetB", kind: "u32" },
          { name: "fleetBGeneration", kind: "u32" },
          { name: "band", kind: "u8" },
          { name: "round", kind: "u8" },
          { name: "startedTick", kind: "f64" },
          { name: "endedTick", kind: "f64" },
          { name: "winner", kind: "i32" },
          { name: "operations", kind: "f64" },
          { name: "initialA", kind: "u32" },
          { name: "initialB", kind: "u32" }
        ],
        initialCapacity
      ),
      new SoAArena<BattleShipColumn>(
        "battle_ships",
        [
          { name: "battle", kind: "u32" },
          { name: "battleGeneration", kind: "u32" },
          { name: "side", kind: "u8" },
          { name: "ship", kind: "u32" },
          { name: "shipGeneration", kind: "u32" },
          { name: "doctrine", kind: "i32" },
          { name: "joinedRound", kind: "u8" },
          { name: "active", kind: "u8" },
          { name: "shield", kind: "f64" },
          { name: "maxShield", kind: "f64" },
          { name: "shieldRegen", kind: "f64" },
          { name: "armorRating", kind: "f64" },
          { name: "structure", kind: "f64" },
          { name: "maxStructure", kind: "f64" },
          { name: "speed", kind: "f64" },
          { name: "intercept", kind: "f64" }
        ],
        shipCapacity
      ),
      CombatLog.create()
    );
  }

  public static fromSnapshots(
    battleSnapshot: ArenaSnapshot,
    shipSnapshot: ArenaSnapshot,
    logSnapshot: ArenaSnapshot
  ): Battles {
    return new Battles(
      SoAArena.fromSnapshot(battleSnapshot) as SoAArena<BattleColumn>,
      SoAArena.fromSnapshot(shipSnapshot) as SoAArena<BattleShipColumn>,
      CombatLog.fromSnapshot(logSnapshot)
    );
  }

  public get length(): number {
    return this.arena.length;
  }

  public get shipLength(): number {
    return this.ships.length;
  }

  public ref(battle: number): EntityRef {
    return { index: battle, generation: this.generation[battle] ?? 0 };
  }

  public isActive(battle: EntityRef): boolean {
    return (
      battle.index >= 0 &&
      battle.index < this.length &&
      this.state[battle.index] === BattleState.Active &&
      (this.generation[battle.index] ?? 0) === battle.generation
    );
  }

  public systemIsBlocked(system: number): boolean {
    for (let battle = 0; battle < this.length; battle += 1) {
      if (this.state[battle] === BattleState.Active && (this.system[battle] ?? -1) === system) {
        return true;
      }
    }
    return false;
  }

  public end(battle: EntityRef, tick: number, winner: number): boolean {
    if (!this.isActive(battle)) return false;
    this.state[battle.index] = BattleState.Ended;
    this.endedTick[battle.index] = tick;
    this.winner[battle.index] = winner;
    this.log.append({
      tick,
      battle: battle.index,
      round: this.round[battle.index] ?? 0,
      kind: CombatLogKind.BattleEnded,
      side: 0,
      actor: winner,
      target: -1,
      weapon: -1,
      rawDamage: 0,
      intercepted: 0,
      shieldDamage: 0,
      armorPrevented: 0,
      structureDamage: 0
    });
    return true;
  }

  public addCombatShip(
    battle: EntityRef,
    side: BattleSide,
    ship: EntityRef,
    doctrine: number,
    stats: ShipDesignStats,
    joinedRound: number
  ): number {
    const oldCapacity = this.ships.capacity;
    const row = this.ships.addRow();
    if (oldCapacity !== this.ships.capacity) this.refreshShipColumns();
    this.shipBattle[row] = battle.index;
    this.shipBattleGeneration[row] = battle.generation;
    this.shipSide[row] = side;
    this.ship[row] = ship.index;
    this.shipGeneration[row] = ship.generation;
    this.shipDoctrine[row] = doctrine;
    this.shipJoinedRound[row] = joinedRound;
    this.shipActive[row] = 1;
    this.shipShield[row] = stats.shieldHp;
    this.shipMaxShield[row] = stats.shieldHp;
    this.shipShieldRegen[row] = stats.shieldRegen;
    this.shipArmorRating[row] = stats.armorRating;
    this.shipStructure[row] = stats.structure;
    this.shipMaxStructure[row] = stats.structure;
    this.shipSpeed[row] = stats.speed;
    this.shipIntercept[row] = stats.intercept;
    return row;
  }

  private refreshColumns(): void {
    this.generation = this.arena.column("generation") as Uint32Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.system = this.arena.column("system") as Uint32Array;
    this.fleetA = this.arena.column("fleetA") as Uint32Array;
    this.fleetAGeneration = this.arena.column("fleetAGeneration") as Uint32Array;
    this.fleetB = this.arena.column("fleetB") as Uint32Array;
    this.fleetBGeneration = this.arena.column("fleetBGeneration") as Uint32Array;
    this.band = this.arena.column("band") as Uint8Array;
    this.round = this.arena.column("round") as Uint8Array;
    this.startedTick = this.arena.column("startedTick") as Float64Array;
    this.endedTick = this.arena.column("endedTick") as Float64Array;
    this.winner = this.arena.column("winner") as Int32Array;
    this.operations = this.arena.column("operations") as Float64Array;
    this.initialA = this.arena.column("initialA") as Uint32Array;
    this.initialB = this.arena.column("initialB") as Uint32Array;
  }

  private refreshShipColumns(): void {
    this.shipBattle = this.ships.column("battle") as Uint32Array;
    this.shipBattleGeneration = this.ships.column("battleGeneration") as Uint32Array;
    this.shipSide = this.ships.column("side") as Uint8Array;
    this.ship = this.ships.column("ship") as Uint32Array;
    this.shipGeneration = this.ships.column("shipGeneration") as Uint32Array;
    this.shipDoctrine = this.ships.column("doctrine") as Int32Array;
    this.shipJoinedRound = this.ships.column("joinedRound") as Uint8Array;
    this.shipActive = this.ships.column("active") as Uint8Array;
    this.shipShield = this.ships.column("shield") as Float64Array;
    this.shipMaxShield = this.ships.column("maxShield") as Float64Array;
    this.shipShieldRegen = this.ships.column("shieldRegen") as Float64Array;
    this.shipArmorRating = this.ships.column("armorRating") as Float64Array;
    this.shipStructure = this.ships.column("structure") as Float64Array;
    this.shipMaxStructure = this.ships.column("maxStructure") as Float64Array;
    this.shipSpeed = this.ships.column("speed") as Float64Array;
    this.shipIntercept = this.ships.column("intercept") as Float64Array;
  }
}

export function createBattle(
  world: StageOneWorld,
  fleetA: EntityRef,
  fleetB: EntityRef,
  tick: number
): EntityRef | undefined {
  if (!world.fleets.isAlive(fleetA) || !world.fleets.isAlive(fleetB)) return undefined;
  const ownerA = world.fleets.owner[fleetA.index] ?? -1;
  const ownerB = world.fleets.owner[fleetB.index] ?? -1;
  if (ownerA === ownerB || !world.wars.isHostile(ownerA, ownerB)) return undefined;
  const system = world.fleets.currentSystem[fleetA.index] ?? -1;
  if (system < 0 || (world.fleets.currentSystem[fleetB.index] ?? -2) !== system) return undefined;
  const oldCapacity = world.battles.arena.capacity;
  const row = world.battles.arena.addRow();
  if (oldCapacity !== world.battles.arena.capacity) refreshBattleColumns(world.battles);
  world.battles.generation[row] = 0;
  world.battles.state[row] = BattleState.Active;
  world.battles.system[row] = system;
  world.battles.fleetA[row] = fleetA.index;
  world.battles.fleetAGeneration[row] = fleetA.generation;
  world.battles.fleetB[row] = fleetB.index;
  world.battles.fleetBGeneration[row] = fleetB.generation;
  world.battles.band[row] = CombatBand.Long;
  world.battles.round[row] = 0;
  world.battles.startedTick[row] = tick;
  world.battles.endedTick[row] = -1;
  world.battles.winner[row] = -1;
  world.battles.operations[row] = 0;
  const battle = world.battles.ref(row);
  const countA = addFleetShips(world, battle, fleetA, BattleSide.A, 1);
  const countB = addFleetShips(world, battle, fleetB, BattleSide.B, 1);
  world.battles.initialA[row] = countA;
  world.battles.initialB[row] = countB;
  if (countA === 0 || countB === 0) {
    world.battles.end(battle, tick, countA > 0 ? ownerA : countB > 0 ? ownerB : -1);
    return undefined;
  }
  world.eventLog.append(
    tick,
    StageOneLogKind.BattleStarted,
    system,
    -1,
    battle.index,
    ownerA,
    ownerB
  );
  return battle;
}

export function reinforceBattle(
  world: StageOneWorld,
  battle: EntityRef,
  fleet: EntityRef,
  tick: number
): number {
  if (!world.battles.isActive(battle) || !world.fleets.isAlive(fleet)) return 0;
  if (
    (world.fleets.currentSystem[fleet.index] ?? -1) !== (world.battles.system[battle.index] ?? -2)
  ) {
    return 0;
  }
  const owner = world.fleets.owner[fleet.index] ?? -1;
  const fleetA = world.battles.fleetA[battle.index] ?? -1;
  const fleetB = world.battles.fleetB[battle.index] ?? -1;
  const ownerA = world.fleets.owner[fleetA] ?? -2;
  const ownerB = world.fleets.owner[fleetB] ?? -2;
  const side = owner === ownerA ? BattleSide.A : owner === ownerB ? BattleSide.B : 0;
  if (side === 0) return 0;
  const joinedRound = (world.battles.round[battle.index] ?? 0) + 1;
  const count = addFleetShips(world, battle, fleet, side, joinedRound);
  if (count > 0) {
    if (side === BattleSide.A) {
      world.battles.initialA[battle.index] = (world.battles.initialA[battle.index] ?? 0) + count;
    } else {
      world.battles.initialB[battle.index] = (world.battles.initialB[battle.index] ?? 0) + count;
    }
    world.battles.log.append({
      tick,
      battle: battle.index,
      round: world.battles.round[battle.index] ?? 0,
      kind: CombatLogKind.Reinforced,
      side,
      actor: fleet.index,
      target: -1,
      weapon: -1,
      rawDamage: count,
      intercepted: 0,
      shieldDamage: 0,
      armorPrevented: 0,
      structureDamage: 0
    });
  }
  return count;
}

function addFleetShips(
  world: StageOneWorld,
  battle: EntityRef,
  fleet: EntityRef,
  side: BattleSide,
  joinedRound: number
): number {
  let count = 0;
  const doctrine = world.fleets.doctrine[fleet.index] ?? -1;
  for (let member = 0; member < world.fleets.memberLength; member += 1) {
    if (world.fleets.memberActive[member] !== 1) continue;
    if ((world.fleets.memberFleet[member] ?? -1) !== fleet.index) continue;
    if ((world.fleets.memberFleetGeneration[member] ?? 0) !== fleet.generation) continue;
    const ship = {
      index: world.fleets.memberShip[member] ?? -1,
      generation: world.fleets.memberShipGeneration[member] ?? 0
    };
    if (!world.ships.isAlive(ship)) continue;
    const blueprint = world.ships.blueprint[ship.index] ?? -1;
    if (blueprint < 0 || blueprint >= world.blueprints.length) continue;
    const stats = calculateDesignStats(
      world.data,
      world.blueprints.design(blueprint),
      world.techModifiers,
      world.fleets.owner[fleet.index] ?? 0
    );
    world.battles.addCombatShip(battle, side, ship, doctrine, stats, joinedRound);
    count += 1;
  }
  return count;
}

// createBattle grows the public arena directly to keep a single append point.
function refreshBattleColumns(battles: Battles): void {
  battles.generation = battles.arena.column("generation") as Uint32Array;
  battles.state = battles.arena.column("state") as Uint8Array;
  battles.system = battles.arena.column("system") as Uint32Array;
  battles.fleetA = battles.arena.column("fleetA") as Uint32Array;
  battles.fleetAGeneration = battles.arena.column("fleetAGeneration") as Uint32Array;
  battles.fleetB = battles.arena.column("fleetB") as Uint32Array;
  battles.fleetBGeneration = battles.arena.column("fleetBGeneration") as Uint32Array;
  battles.band = battles.arena.column("band") as Uint8Array;
  battles.round = battles.arena.column("round") as Uint8Array;
  battles.startedTick = battles.arena.column("startedTick") as Float64Array;
  battles.endedTick = battles.arena.column("endedTick") as Float64Array;
  battles.winner = battles.arena.column("winner") as Int32Array;
  battles.operations = battles.arena.column("operations") as Float64Array;
  battles.initialA = battles.arena.column("initialA") as Uint32Array;
  battles.initialB = battles.arena.column("initialB") as Uint32Array;
}
