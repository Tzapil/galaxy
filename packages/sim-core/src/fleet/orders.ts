import type { EntityRef } from "../entity/ids.js";
import { EventKind } from "../events/kinds.js";
import type { EventQueue } from "../events/queue.js";
import type { RoutePlanner } from "../nav/route.js";
import { ShipState } from "../ships/ships.js";
import type { StageOneWorld } from "../world/state.js";

import { FleetState, fleetSpeed } from "./fleet.js";

export const enum FleetOrder {
  None = 0,
  Rally = 1,
  MoveTo = 2,
  Hold = 3,
  Blockade = 4,
  Escort = 5,
  Withdraw = 6
}

export type FleetLaunchFailure =
  "invalidFleet" | "emptyFleet" | "notTogether" | "noFuel" | "noRoute";

export interface FleetLaunchResult {
  readonly ok: boolean;
  readonly reason: FleetLaunchFailure | undefined;
  readonly arriveTick: number;
}

export function issueFleetOrder(
  world: StageOneWorld,
  fleet: EntityRef,
  order: FleetOrder,
  targetSystem = -1,
  target?: EntityRef
): boolean {
  if (!world.fleets.isAlive(fleet)) return false;
  world.fleets.order[fleet.index] = order;
  world.fleets.targetSystem[fleet.index] = targetSystem;
  world.fleets.targetEntity[fleet.index] = target?.index ?? -1;
  world.fleets.targetGeneration[fleet.index] = target?.generation ?? 0;
  return true;
}

/**
 * Fleet fuel is charged atomically from ship tanks at departure. If one member
 * cannot pay its full jump cost, no tank is changed and the whole formation waits.
 */
export function launchFleet(
  world: StageOneWorld,
  routes: RoutePlanner,
  queue: EventQueue,
  fleet: EntityRef,
  targetSystem: number,
  tick: number
): FleetLaunchResult {
  if (!world.fleets.isAlive(fleet)) return failed("invalidFleet");
  world.fleets.pruneLostShips(fleet, world.ships);
  if ((world.fleets.memberCount[fleet.index] ?? 0) <= 0) return failed("emptyFleet");
  const origin = world.fleets.currentSystem[fleet.index] ?? 0;
  const route = routes.find(
    world.systems,
    world.gates,
    origin,
    targetSystem,
    world.fleets.owner[fleet.index] ?? -1,
    world.navigation,
    tick
  );
  if (!route.reachable) return failed("noRoute");

  for (let member = 0; member < world.fleets.memberLength; member += 1) {
    if (!isMember(world, fleet, member)) continue;
    const ship = world.fleets.memberShip[member] ?? -1;
    if (
      world.ships.state[ship] !== ShipState.Idle ||
      (world.ships.currentSystem[ship] ?? -1) !== origin
    ) {
      return failed("notTogether");
    }
    const needed = (world.ships.fuelPerJump[ship] ?? 0) * route.jumps;
    if ((world.ships.fuelTank[ship] ?? 0) + 1e-9 < needed) return failed("noFuel");
  }

  const speed = fleetSpeed(world, fleet);
  if (speed <= 0) return failed("notTogether");
  const arriveTick = tick + Math.max(1, Math.ceil(route.travelTicks / speed));
  for (let member = 0; member < world.fleets.memberLength; member += 1) {
    if (!isMember(world, fleet, member)) continue;
    const ship = world.fleets.memberShip[member] ?? -1;
    const needed = (world.ships.fuelPerJump[ship] ?? 0) * route.jumps;
    world.ships.fuelTank[ship] = Math.max(0, (world.ships.fuelTank[ship] ?? 0) - needed);
    world.ships.state[ship] = ShipState.InTransit;
    world.ships.fromSystem[ship] = origin;
    world.ships.toSystem[ship] = targetSystem;
    world.ships.departTick[ship] = tick;
    world.ships.arriveTick[ship] = arriveTick;
  }
  world.fleets.state[fleet.index] = FleetState.InTransit;
  world.fleets.order[fleet.index] = FleetOrder.MoveTo;
  world.fleets.targetSystem[fleet.index] = targetSystem;
  world.fleets.departTick[fleet.index] = tick;
  world.fleets.arriveTick[fleet.index] = arriveTick;
  queue.schedule(arriveTick, EventKind.FleetArrival, fleet.index);
  return { ok: true, reason: undefined, arriveTick };
}

export function handleFleetArrival(
  world: StageOneWorld,
  fleetIndex: number,
  tick: number
): boolean {
  const fleet = world.fleets.ref(fleetIndex);
  if (!world.fleets.isAlive(fleet)) return false;
  if (world.fleets.state[fleetIndex] !== FleetState.InTransit) return false;
  if ((world.fleets.arriveTick[fleetIndex] ?? -1) > tick) return false;
  const target = world.fleets.targetSystem[fleetIndex] ?? -1;
  if (target < 0) return false;
  world.fleets.currentSystem[fleetIndex] = target;
  world.fleets.state[fleetIndex] = FleetState.Active;
  world.fleets.departTick[fleetIndex] = -1;
  world.fleets.arriveTick[fleetIndex] = -1;
  for (let member = 0; member < world.fleets.memberLength; member += 1) {
    if (!isMember(world, fleet, member)) continue;
    const ship = world.fleets.memberShip[member] ?? -1;
    world.ships.state[ship] = ShipState.Idle;
    world.ships.currentSystem[ship] = target;
    world.ships.fromSystem[ship] = target;
    world.ships.toSystem[ship] = target;
    world.ships.departTick[ship] = -1;
    world.ships.arriveTick[ship] = -1;
  }
  return true;
}

function isMember(world: StageOneWorld, fleet: EntityRef, row: number): boolean {
  return (
    world.fleets.memberActive[row] === 1 &&
    (world.fleets.memberFleet[row] ?? -1) === fleet.index &&
    (world.fleets.memberFleetGeneration[row] ?? 0) === fleet.generation &&
    world.ships.isAlive({
      index: world.fleets.memberShip[row] ?? -1,
      generation: world.fleets.memberShipGeneration[row] ?? 0
    })
  );
}

function failed(reason: FleetLaunchFailure): FleetLaunchResult {
  return { ok: false, reason, arriveTick: -1 };
}
