import type { AiBottleneck } from "../ai/bottleneck.js";
import type { RoutePlanner } from "../nav/route.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export interface CasusBelli {
  readonly attacker: number;
  readonly defender: number;
  readonly resource: number;
  readonly targetSystem: number;
  readonly routeJumps: number;
  readonly routeFuelCost: number;
  readonly need: number;
}

/** Turns the current MRP shortage into the nearest concrete foreign resource target. */
export function findCasusBelli(
  _data: StageOneData,
  world: StageOneWorld,
  routes: RoutePlanner,
  attacker: number,
  bottleneck: AiBottleneck | undefined,
  tick: number
): CasusBelli | undefined {
  if (bottleneck === undefined || bottleneck.deficitPerDay <= 0.0001) return undefined;
  const capital = world.factions.capitalSystem[attacker] ?? -1;
  if (capital < 0) return undefined;
  let bestSystem = -1;
  let bestDefender = -1;
  let bestJumps = Number.POSITIVE_INFINITY;
  let bestTravel = Number.POSITIVE_INFINITY;
  for (let system = 0; system < world.systems.length; system += 1) {
    const owner = world.systems.owner[system] ?? -1;
    if (owner < 0 || owner === attacker || !systemCanSupply(world, system, bottleneck.resource)) {
      continue;
    }
    const route = routes.find(
      world.systems,
      world.gates,
      capital,
      system,
      attacker,
      world.navigation,
      tick
    );
    if (!route.reachable) continue;
    if (
      route.jumps < bestJumps ||
      (route.jumps === bestJumps &&
        (route.travelTicks < bestTravel ||
          (route.travelTicks === bestTravel && system < bestSystem)))
    ) {
      bestSystem = system;
      bestDefender = owner;
      bestJumps = route.jumps;
      bestTravel = route.travelTicks;
    }
  }
  if (bestSystem < 0 || bestDefender < 0) return undefined;
  const need = Math.max(
    0,
    Math.min(4, bottleneck.deficitPerDay / Math.max(0.25, bottleneck.supplyPerDay + 0.25))
  );
  return {
    attacker,
    defender: bestDefender,
    resource: bottleneck.resource,
    targetSystem: bestSystem,
    routeJumps: bestJumps,
    routeFuelCost: Math.max(1, bestJumps) * 10,
    need
  };
}

export function formatCasusBelliReason(data: StageOneData, casusBelli: CasusBelli): string {
  const resource = data.resources[casusBelli.resource]?.id ?? `resource-${casusBelli.resource}`;
  return `дефицит ${resource}, ближайший источник — система ${casusBelli.targetSystem}`;
}

function systemCanSupply(world: StageOneWorld, system: number, resource: number): boolean {
  let body = world.systems.firstBody[system] ?? -1;
  while (body >= 0) {
    if (world.bodies.hasDeposit(body, resource)) return true;
    if (world.stockpiles.get(world.bodies.stockpile[body] ?? 0, resource) > 0.001) return true;
    body = world.bodies.nextInSystem[body] ?? -1;
  }
  return false;
}
