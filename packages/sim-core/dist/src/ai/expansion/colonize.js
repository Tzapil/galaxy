import { foundColony } from "../../bootstrap/found-colony.js";
import { EventKind } from "../../events/kinds.js";
import { fuelNeededForJumps } from "../../ships/fuel.js";
import { ShipRole, ShipState } from "../../ships/ships.js";
import { logColonization } from "../decision-log.js";
import { bestColonyTarget } from "./colony-score.js";
export function runColonization(data, world, routes, queue, faction, tick, bottleneckResource) {
    const target = bestColonyTarget(data, world, routes, faction, bottleneckResource);
    if (target.body < 0 || target.score <= 0) {
        return { built: false, launched: false, targetBody: -1, score: 0 };
    }
    const built = buildColonizerIfNeeded(data, world, faction, tick, bottleneckResource);
    const launched = launchIdleColonizer(data, world, routes, queue, faction, target.body, tick);
    if (launched) {
        logColonization(data, world, tick, faction, target.body, bottleneckResource, target.score);
    }
    return { built, launched, targetBody: target.body, score: target.score };
}
export function buildColonizerIfNeeded(data, world, faction, tick, reasonResource = -1) {
    if (hasActiveColonizer(world, faction))
        return false;
    const capitalBody = world.factions.capitalBody[faction] ?? -1;
    const capitalSystem = world.factions.capitalSystem[faction] ?? -1;
    if (capitalBody < 0 || capitalSystem < 0)
        return false;
    if ((world.factions.treasury[faction] ?? 0) < 400)
        return false;
    const stockpile = world.bodies.stockpile[capitalBody] ?? 0;
    const hullFrames = data.resourceIndex.get("hull_frames") ?? -1;
    const lifeSupport = data.resourceIndex.get("life_support") ?? -1;
    if (hullFrames < 0 || lifeSupport < 0)
        return false;
    if (!world.stockpiles.hasAtLeast(stockpile, hullFrames, 6))
        return false;
    if (!world.stockpiles.hasAtLeast(stockpile, lifeSupport, 8))
        return false;
    world.stockpiles.remove(stockpile, hullFrames, 6);
    world.stockpiles.remove(stockpile, lifeSupport, 8);
    world.factions.treasury[faction] = (world.factions.treasury[faction] ?? 0) - 400;
    const ship = world.addShip(faction, capitalSystem, ShipRole.Colonizer, 900, 260, 8);
    logColonization(data, world, tick, faction, capitalBody, reasonResource, ship);
    return true;
}
export function launchIdleColonizer(data, world, routes, queue, faction, targetBody, tick) {
    const ship = firstIdleColonizer(world, faction);
    if (ship < 0 || targetBody < 0)
        return false;
    const fromSystem = world.ships.currentSystem[ship] ?? 0;
    const targetSystem = world.bodies.system[targetBody] ?? -1;
    const route = routes.find(world.systems, world.gates, fromSystem, targetSystem);
    if (!route.reachable)
        return false;
    const fuelNeed = fuelNeededForJumps(world, ship, route.jumps);
    if ((world.ships.fuelTank[ship] ?? 0) + 1e-9 < fuelNeed)
        return false;
    world.ships.fuelTank[ship] = (world.ships.fuelTank[ship] ?? 0) - fuelNeed;
    world.ships.state[ship] = ShipState.InTransit;
    world.ships.fromSystem[ship] = fromSystem;
    world.ships.toSystem[ship] = targetSystem;
    world.ships.sourceBody[ship] = world.factions.capitalBody[faction] ?? -1;
    world.ships.targetBody[ship] = targetBody;
    world.ships.departTick[ship] = tick;
    world.ships.arriveTick[ship] = tick + route.travelTicks;
    world.ships.cargoResource[ship] = -1;
    world.ships.cargoAmount[ship] = 0;
    queue.schedule(tick + route.travelTicks, EventKind.ShipArrival, ship);
    return true;
}
export function handleColonizerArrival(data, world, ship, tick) {
    if (world.ships.role[ship] !== ShipRole.Colonizer)
        return false;
    if (world.ships.state[ship] !== ShipState.InTransit)
        return false;
    const targetBody = world.ships.targetBody[ship] ?? -1;
    const faction = world.ships.faction[ship] ?? -1;
    const result = targetBody >= 0 && faction >= 0
        ? foundColony(data, world, faction, targetBody, tick)
        : { ok: false, body: targetBody, buildings: 0, reason: "alreadyOwned" };
    world.ships.currentSystem[ship] =
        world.ships.toSystem[ship] ?? world.ships.currentSystem[ship] ?? 0;
    world.ships.sourceBody[ship] = -1;
    world.ships.targetBody[ship] = -1;
    world.ships.cargoResource[ship] = -1;
    world.ships.cargoAmount[ship] = 0;
    if (result.ok) {
        world.ships.state[ship] = ShipState.Disbanded;
        logColonization(data, world, tick, faction, targetBody, -1, result.buildings ?? 0);
        return true;
    }
    world.ships.state[ship] = ShipState.Idle;
    return false;
}
function hasActiveColonizer(world, faction) {
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if (world.ships.faction[ship] === faction &&
            world.ships.role[ship] === ShipRole.Colonizer &&
            world.ships.state[ship] !== ShipState.Disbanded) {
            return true;
        }
    }
    return false;
}
function firstIdleColonizer(world, faction) {
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if (world.ships.faction[ship] === faction &&
            world.ships.role[ship] === ShipRole.Colonizer &&
            world.ships.state[ship] === ShipState.Idle) {
            return ship;
        }
    }
    return -1;
}
//# sourceMappingURL=colonize.js.map