import type { EntityRef } from "../entity/ids.js";
import { ShipState, type Ships } from "../ships/ships.js";
import { SoAArena, type ArenaSnapshot } from "../soa/arena.js";

export const enum FleetState {
  Inactive = 0,
  Active = 1,
  InTransit = 2,
  Disbanded = 3
}

export type FleetColumn =
  | "generation"
  | "state"
  | "owner"
  | "doctrine"
  | "order"
  | "rallySystem"
  | "currentSystem"
  | "targetSystem"
  | "targetEntity"
  | "targetGeneration"
  | "departTick"
  | "arriveTick"
  | "createdTick"
  | "memberCount";

export type FleetMemberColumn = "fleet" | "fleetGeneration" | "ship" | "shipGeneration" | "active";

/**
 * Persistent military formations from spec 6.3. Rows are never reordered; a
 * generation bump invalidates every outstanding EntityRef when a fleet is disbanded.
 */
export class Fleets {
  public generation: Uint32Array;
  public state: Uint8Array;
  public owner: Uint16Array;
  public doctrine: Int32Array;
  public order: Uint8Array;
  public rallySystem: Uint32Array;
  public currentSystem: Uint32Array;
  public targetSystem: Int32Array;
  public targetEntity: Int32Array;
  public targetGeneration: Uint32Array;
  public departTick: Float64Array;
  public arriveTick: Float64Array;
  public createdTick: Float64Array;
  public memberCount: Uint32Array;

  public memberFleet: Uint32Array;
  public memberFleetGeneration: Uint32Array;
  public memberShip: Uint32Array;
  public memberShipGeneration: Uint32Array;
  public memberActive: Uint8Array;

  public constructor(
    public readonly arena: SoAArena<FleetColumn>,
    public readonly members: SoAArena<FleetMemberColumn>
  ) {
    this.generation = new Uint32Array(0);
    this.state = new Uint8Array(0);
    this.owner = new Uint16Array(0);
    this.doctrine = new Int32Array(0);
    this.order = new Uint8Array(0);
    this.rallySystem = new Uint32Array(0);
    this.currentSystem = new Uint32Array(0);
    this.targetSystem = new Int32Array(0);
    this.targetEntity = new Int32Array(0);
    this.targetGeneration = new Uint32Array(0);
    this.departTick = new Float64Array(0);
    this.arriveTick = new Float64Array(0);
    this.createdTick = new Float64Array(0);
    this.memberCount = new Uint32Array(0);
    this.memberFleet = new Uint32Array(0);
    this.memberFleetGeneration = new Uint32Array(0);
    this.memberShip = new Uint32Array(0);
    this.memberShipGeneration = new Uint32Array(0);
    this.memberActive = new Uint8Array(0);
    this.refreshColumns();
    this.refreshMemberColumns();
  }

  public static create(initialCapacity = 32, memberCapacity = 256): Fleets {
    return new Fleets(
      new SoAArena<FleetColumn>(
        "fleets",
        [
          { name: "generation", kind: "u32" },
          { name: "state", kind: "u8" },
          { name: "owner", kind: "u16" },
          { name: "doctrine", kind: "i32" },
          { name: "order", kind: "u8" },
          { name: "rallySystem", kind: "u32" },
          { name: "currentSystem", kind: "u32" },
          { name: "targetSystem", kind: "i32" },
          { name: "targetEntity", kind: "i32" },
          { name: "targetGeneration", kind: "u32" },
          { name: "departTick", kind: "f64" },
          { name: "arriveTick", kind: "f64" },
          { name: "createdTick", kind: "f64" },
          { name: "memberCount", kind: "u32" }
        ],
        initialCapacity
      ),
      new SoAArena<FleetMemberColumn>(
        "fleet_members",
        [
          { name: "fleet", kind: "u32" },
          { name: "fleetGeneration", kind: "u32" },
          { name: "ship", kind: "u32" },
          { name: "shipGeneration", kind: "u32" },
          { name: "active", kind: "u8" }
        ],
        memberCapacity
      )
    );
  }

  public static fromSnapshots(fleetSnapshot: ArenaSnapshot, memberSnapshot: ArenaSnapshot): Fleets {
    return new Fleets(
      SoAArena.fromSnapshot(fleetSnapshot) as SoAArena<FleetColumn>,
      SoAArena.fromSnapshot(memberSnapshot) as SoAArena<FleetMemberColumn>
    );
  }

  public get length(): number {
    return this.arena.length;
  }

  public get memberLength(): number {
    return this.members.length;
  }

  public add(
    owner: number,
    doctrine: number,
    rallySystem: number,
    currentSystem: number,
    tick: number
  ): EntityRef {
    const oldCapacity = this.arena.capacity;
    const row = this.arena.addRow();
    if (oldCapacity !== this.arena.capacity) this.refreshColumns();
    this.generation[row] = 0;
    this.state[row] = FleetState.Active;
    this.owner[row] = owner;
    this.doctrine[row] = doctrine;
    this.order[row] = 0;
    this.rallySystem[row] = rallySystem;
    this.currentSystem[row] = currentSystem;
    this.targetSystem[row] = -1;
    this.targetEntity[row] = -1;
    this.targetGeneration[row] = 0;
    this.departTick[row] = -1;
    this.arriveTick[row] = -1;
    this.createdTick[row] = tick;
    this.memberCount[row] = 0;
    return this.ref(row);
  }

  public ref(fleet: number): EntityRef {
    return { index: fleet, generation: this.generation[fleet] ?? 0 };
  }

  public isAlive(ref: EntityRef): boolean {
    return (
      ref.index >= 0 &&
      ref.index < this.length &&
      this.state[ref.index] !== FleetState.Disbanded &&
      (this.generation[ref.index] ?? 0) === ref.generation
    );
  }

  public addShip(fleet: EntityRef, ship: EntityRef, ships: Ships): boolean {
    if (!this.isAlive(fleet) || !ships.isAlive(ship)) return false;
    if ((ships.faction[ship.index] ?? -1) !== (this.owner[fleet.index] ?? -2)) return false;
    if (this.fleetOfShip(ship, ships) >= 0) return false;
    const oldCapacity = this.members.capacity;
    const member = this.members.addRow();
    if (oldCapacity !== this.members.capacity) this.refreshMemberColumns();
    this.memberFleet[member] = fleet.index;
    this.memberFleetGeneration[member] = fleet.generation;
    this.memberShip[member] = ship.index;
    this.memberShipGeneration[member] = ship.generation;
    this.memberActive[member] = 1;
    this.memberCount[fleet.index] = (this.memberCount[fleet.index] ?? 0) + 1;
    return true;
  }

  public removeShip(fleet: EntityRef, ship: EntityRef): boolean {
    if (!this.isAlive(fleet)) return false;
    for (let row = 0; row < this.memberLength; row += 1) {
      if (this.memberActive[row] !== 1) continue;
      if ((this.memberFleet[row] ?? -1) !== fleet.index) continue;
      if ((this.memberFleetGeneration[row] ?? 0) !== fleet.generation) continue;
      if ((this.memberShip[row] ?? -1) !== ship.index) continue;
      if ((this.memberShipGeneration[row] ?? 0) !== ship.generation) continue;
      this.memberActive[row] = 0;
      this.memberCount[fleet.index] = Math.max(0, (this.memberCount[fleet.index] ?? 0) - 1);
      return true;
    }
    return false;
  }

  public fleetOfShip(ship: EntityRef, ships: Ships): number {
    if (!ships.isAlive(ship)) return -1;
    for (let row = 0; row < this.memberLength; row += 1) {
      if (this.memberActive[row] !== 1) continue;
      if ((this.memberShip[row] ?? -1) !== ship.index) continue;
      if ((this.memberShipGeneration[row] ?? 0) !== ship.generation) continue;
      const fleet = this.memberFleet[row] ?? -1;
      if (
        fleet >= 0 &&
        this.isAlive({ index: fleet, generation: this.memberFleetGeneration[row] ?? 0 })
      ) {
        return fleet;
      }
    }
    return -1;
  }

  public pruneLostShips(fleet: EntityRef, ships: Ships): number {
    if (!this.isAlive(fleet)) return 0;
    let removed = 0;
    for (let row = 0; row < this.memberLength; row += 1) {
      if (this.memberActive[row] !== 1) continue;
      if ((this.memberFleet[row] ?? -1) !== fleet.index) continue;
      if ((this.memberFleetGeneration[row] ?? 0) !== fleet.generation) continue;
      const ship = {
        index: this.memberShip[row] ?? -1,
        generation: this.memberShipGeneration[row] ?? 0
      };
      if (ships.isAlive(ship)) continue;
      this.memberActive[row] = 0;
      removed += 1;
    }
    if (removed > 0) {
      this.memberCount[fleet.index] = Math.max(0, (this.memberCount[fleet.index] ?? 0) - removed);
    }
    return removed;
  }

  public disband(fleet: EntityRef, ships: Ships): boolean {
    if (!this.isAlive(fleet)) return false;
    for (let row = 0; row < this.memberLength; row += 1) {
      if (this.memberActive[row] !== 1) continue;
      if ((this.memberFleet[row] ?? -1) !== fleet.index) continue;
      if ((this.memberFleetGeneration[row] ?? 0) !== fleet.generation) continue;
      const ship = this.memberShip[row] ?? -1;
      if (ship >= 0 && ships.state[ship] !== ShipState.Disbanded)
        ships.state[ship] = ShipState.Idle;
      this.memberActive[row] = 0;
    }
    this.memberCount[fleet.index] = 0;
    this.state[fleet.index] = FleetState.Disbanded;
    this.order[fleet.index] = 0;
    this.targetSystem[fleet.index] = -1;
    this.targetEntity[fleet.index] = -1;
    this.generation[fleet.index] = ((this.generation[fleet.index] ?? 0) + 1) >>> 0;
    return true;
  }

  private refreshColumns(): void {
    this.generation = this.arena.column("generation") as Uint32Array;
    this.state = this.arena.column("state") as Uint8Array;
    this.owner = this.arena.column("owner") as Uint16Array;
    this.doctrine = this.arena.column("doctrine") as Int32Array;
    this.order = this.arena.column("order") as Uint8Array;
    this.rallySystem = this.arena.column("rallySystem") as Uint32Array;
    this.currentSystem = this.arena.column("currentSystem") as Uint32Array;
    this.targetSystem = this.arena.column("targetSystem") as Int32Array;
    this.targetEntity = this.arena.column("targetEntity") as Int32Array;
    this.targetGeneration = this.arena.column("targetGeneration") as Uint32Array;
    this.departTick = this.arena.column("departTick") as Float64Array;
    this.arriveTick = this.arena.column("arriveTick") as Float64Array;
    this.createdTick = this.arena.column("createdTick") as Float64Array;
    this.memberCount = this.arena.column("memberCount") as Uint32Array;
  }

  private refreshMemberColumns(): void {
    this.memberFleet = this.members.column("fleet") as Uint32Array;
    this.memberFleetGeneration = this.members.column("fleetGeneration") as Uint32Array;
    this.memberShip = this.members.column("ship") as Uint32Array;
    this.memberShipGeneration = this.members.column("shipGeneration") as Uint32Array;
    this.memberActive = this.members.column("active") as Uint8Array;
  }
}

export interface FleetStatWorld {
  readonly fleets: Fleets;
  readonly ships: Ships;
  readonly blueprints: {
    readonly length: number;
    readonly speed: Float64Array;
    readonly dps: Float64Array;
    readonly ehp: Float64Array;
  };
}

/** Travel speed is deliberately the slowest member (spec 6.3). */
export function fleetSpeed(world: FleetStatWorld, fleet: EntityRef): number {
  if (!world.fleets.isAlive(fleet)) return 0;
  let speed = Number.POSITIVE_INFINITY;
  let found = false;
  for (let row = 0; row < world.fleets.memberLength; row += 1) {
    if (!activeMember(world, fleet, row)) continue;
    const ship = world.fleets.memberShip[row] ?? -1;
    speed = Math.min(speed, shipSpeed(world, ship));
    found = true;
  }
  return found ? speed : 0;
}

/** Mean speed is used only for range-control contests in spec 9.2. */
export function fleetAverageSpeed(world: FleetStatWorld, fleet: EntityRef): number {
  if (!world.fleets.isAlive(fleet)) return 0;
  let total = 0;
  let count = 0;
  for (let row = 0; row < world.fleets.memberLength; row += 1) {
    if (!activeMember(world, fleet, row)) continue;
    total += shipSpeed(world, world.fleets.memberShip[row] ?? -1);
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

export function fleetCombatStrength(world: FleetStatWorld, fleet: EntityRef): number {
  if (!world.fleets.isAlive(fleet)) return 0;
  let strength = 0;
  for (let row = 0; row < world.fleets.memberLength; row += 1) {
    if (!activeMember(world, fleet, row)) continue;
    const ship = world.fleets.memberShip[row] ?? -1;
    const blueprint = world.ships.blueprint[ship] ?? -1;
    if (blueprint < 0 || blueprint >= world.blueprints.length) continue;
    strength += (world.blueprints.ehp[blueprint] ?? 0) + (world.blueprints.dps[blueprint] ?? 0) * 6;
  }
  return strength;
}

function activeMember(world: FleetStatWorld, fleet: EntityRef, row: number): boolean {
  if (world.fleets.memberActive[row] !== 1) return false;
  if ((world.fleets.memberFleet[row] ?? -1) !== fleet.index) return false;
  if ((world.fleets.memberFleetGeneration[row] ?? 0) !== fleet.generation) return false;
  return world.ships.isAlive({
    index: world.fleets.memberShip[row] ?? -1,
    generation: world.fleets.memberShipGeneration[row] ?? 0
  });
}

function shipSpeed(world: FleetStatWorld, ship: number): number {
  const blueprint = world.ships.blueprint[ship] ?? -1;
  if (blueprint < 0 || blueprint >= world.blueprints.length) return 1;
  return Math.max(0, world.blueprints.speed[blueprint] ?? 0);
}
