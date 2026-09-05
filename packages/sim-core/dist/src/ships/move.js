import { EventKind } from "../events/kinds.js";
import { StageOneLogKind } from "../events/log.js";
import { tryStartIdleBuildingsOnBody } from "../econ/batch.js";
import { fuelNeededForJumps, refuelShipAtBody } from "./fuel.js";
import { ShipRole, ShipState } from "./ships.js";
export var LaunchResult;
(function (LaunchResult) {
    LaunchResult[LaunchResult["Launched"] = 1] = "Launched";
    LaunchResult[LaunchResult["NoJob"] = 2] = "NoJob";
    LaunchResult[LaunchResult["NoFuel"] = 3] = "NoFuel";
    LaunchResult[LaunchResult["NoCargo"] = 4] = "NoCargo";
})(LaunchResult || (LaunchResult = {}));
export function assignIdleHaulers(data, world, jobs, routes, queue, tick) {
    let launched = 0;
    let failedFuel = 0;
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if (world.ships.role[ship] !== ShipRole.Hauler || world.ships.state[ship] !== ShipState.Idle) {
            continue;
        }
        const result = launchBestLocalJob(data, world, jobs, routes, queue, ship, tick);
        if (result === LaunchResult.Launched)
            launched += 1;
        if (result === LaunchResult.NoFuel)
            failedFuel += 1;
    }
    return { launched, failedFuel };
}
export function launchBestLocalJob(data, world, jobs, routes, queue, ship, tick) {
    const faction = world.ships.faction[ship] ?? 0;
    const currentSystem = world.ships.currentSystem[ship] ?? 0;
    const job = jobs.takeBestAtSystem(faction, currentSystem);
    if (job < 0)
        return repositionToBestSource(data, world, jobs, routes, queue, ship, tick);
    const sourceBody = jobs.sourceBody[job] ?? 0;
    const targetBody = jobs.targetBody[job] ?? 0;
    const sourceSystem = jobs.sourceSystem[job] ?? 0;
    const targetSystem = jobs.targetSystem[job] ?? 0;
    const route = routes.find(world.systems, world.gates, sourceSystem, targetSystem);
    if (!route.reachable) {
        jobs.unreserve(job);
        return LaunchResult.NoJob;
    }
    refuelShipAtBody(data, world, ship, sourceBody);
    const fuelNeed = fuelNeededForJumps(world, ship, route.jumps);
    if ((world.ships.fuelTank[ship] ?? 0) + 1e-9 < fuelNeed) {
        jobs.unreserve(job);
        world.eventLog.append(tick, StageOneLogKind.DepartureFailedFuel, sourceSystem, sourceBody, ship, -1, fuelNeed);
        return LaunchResult.NoFuel;
    }
    const resource = jobs.resource[job] ?? 0;
    const maxByVolume = (world.ships.cargoCapacity[ship] ?? 0) / Math.max(0.000001, data.unitVolume[resource] ?? 1);
    const quantity = Math.max(0, Math.min(jobs.quantity[job] ?? 0, maxByVolume));
    const sourceStockpile = world.bodies.stockpile[sourceBody] ?? 0;
    const removed = world.stockpiles.removeAvailable(sourceStockpile, resource, quantity);
    if (removed <= 0.001) {
        jobs.unreserve(job);
        return LaunchResult.NoCargo;
    }
    const shipStockpile = world.ships.stockpile[ship] ?? 0;
    world.stockpiles.addClamped(shipStockpile, resource, removed);
    world.ships.fuelTank[ship] = (world.ships.fuelTank[ship] ?? 0) - fuelNeed;
    world.ships.state[ship] = ShipState.InTransit;
    world.ships.fromSystem[ship] = sourceSystem;
    world.ships.toSystem[ship] = targetSystem;
    world.ships.sourceBody[ship] = sourceBody;
    world.ships.targetBody[ship] = targetBody;
    world.ships.departTick[ship] = tick;
    world.ships.arriveTick[ship] = tick + route.travelTicks;
    world.ships.cargoResource[ship] = resource;
    world.ships.cargoAmount[ship] = removed;
    queue.schedule(tick + route.travelTicks, EventKind.ShipArrival, ship);
    world.eventLog.append(tick, StageOneLogKind.HaulerLaunched, sourceSystem, sourceBody, ship, resource, removed);
    return LaunchResult.Launched;
}
function repositionToBestSource(data, world, jobs, routes, queue, ship, tick) {
    const faction = world.ships.faction[ship] ?? 0;
    const currentSystem = world.ships.currentSystem[ship] ?? 0;
    const job = jobs.bestUnreservedForFaction(faction);
    if (job < 0)
        return LaunchResult.NoJob;
    const sourceSystem = jobs.sourceSystem[job] ?? currentSystem;
    if (sourceSystem === currentSystem)
        return LaunchResult.NoJob;
    const portBody = findFactionBodyInSystem(world, faction, currentSystem);
    if (portBody < 0)
        return LaunchResult.NoJob;
    const route = routes.find(world.systems, world.gates, currentSystem, sourceSystem);
    if (!route.reachable)
        return LaunchResult.NoJob;
    refuelShipAtBody(data, world, ship, portBody);
    const fuelNeed = fuelNeededForJumps(world, ship, route.jumps);
    if ((world.ships.fuelTank[ship] ?? 0) + 1e-9 < fuelNeed) {
        world.eventLog.append(tick, StageOneLogKind.DepartureFailedFuel, currentSystem, portBody, ship, -1, fuelNeed);
        return LaunchResult.NoFuel;
    }
    world.ships.fuelTank[ship] = (world.ships.fuelTank[ship] ?? 0) - fuelNeed;
    world.ships.state[ship] = ShipState.InTransit;
    world.ships.fromSystem[ship] = currentSystem;
    world.ships.toSystem[ship] = sourceSystem;
    world.ships.sourceBody[ship] = portBody;
    world.ships.targetBody[ship] = jobs.sourceBody[job] ?? -1;
    world.ships.departTick[ship] = tick;
    world.ships.arriveTick[ship] = tick + route.travelTicks;
    world.ships.cargoResource[ship] = -1;
    world.ships.cargoAmount[ship] = 0;
    queue.schedule(tick + route.travelTicks, EventKind.ShipArrival, ship);
    return LaunchResult.Launched;
}
export function handleShipArrival(data, world, queue, ship, tick) {
    if (world.ships.state[ship] !== ShipState.InTransit)
        return false;
    const targetBody = world.ships.targetBody[ship] ?? -1;
    const resource = world.ships.cargoResource[ship] ?? -1;
    const amount = world.ships.cargoAmount[ship] ?? 0;
    let delivered = false;
    if (targetBody >= 0 && resource >= 0 && amount > 0) {
        const shipStockpile = world.ships.stockpile[ship] ?? 0;
        const targetStockpile = world.bodies.stockpile[targetBody] ?? 0;
        const removed = world.stockpiles.removeAvailable(shipStockpile, resource, amount);
        const lost = world.stockpiles.addClamped(targetStockpile, resource, removed);
        world.eventLog.append(tick, StageOneLogKind.ShipmentDelivered, world.bodies.system[targetBody] ?? -1, targetBody, ship, resource, removed - lost);
        tryStartIdleBuildingsOnBody(data, world, queue, targetBody, tick);
        delivered = true;
    }
    world.ships.state[ship] = ShipState.Idle;
    world.ships.currentSystem[ship] = world.ships.toSystem[ship] ?? 0;
    world.ships.sourceBody[ship] = -1;
    world.ships.targetBody[ship] = -1;
    world.ships.cargoResource[ship] = -1;
    world.ships.cargoAmount[ship] = 0;
    return delivered;
}
function findFactionBodyInSystem(world, faction, system) {
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        if ((world.bodies.system[body] ?? -1) === system)
            return body;
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return -1;
}
//# sourceMappingURL=move.js.map