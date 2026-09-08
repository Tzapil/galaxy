import { ShipRole, ShipState } from "../../ships/ships.js";
import { logFleetScale } from "../decision-log.js";
export function scaleCivilianFleet(data, world, jobs, faction, tick) {
    const idle = idleHaulersForFaction(world, faction);
    if (jobs.count <= idle * 4 + 6)
        return { built: false, ship: -1 };
    if ((world.factions.treasury[faction] ?? 0) < 1200)
        return { built: false, ship: -1 };
    if (factionIncome(world, faction) < factionUpkeep(world, faction) + 2.5) {
        return { built: false, ship: -1 };
    }
    const capitalBody = world.factions.capitalBody[faction] ?? -1;
    const capitalSystem = world.factions.capitalSystem[faction] ?? -1;
    if (capitalBody < 0 || capitalSystem < 0)
        return { built: false, ship: -1 };
    const stockpile = world.bodies.stockpile[capitalBody] ?? 0;
    if (!removeShipKit(data, world, stockpile))
        return { built: false, ship: -1 };
    world.factions.treasury[faction] = (world.factions.treasury[faction] ?? 0) - 250;
    const ship = world.addHauler(faction, capitalSystem, 1800, 180, 7);
    logFleetScale(data, world, tick, faction, ship, jobs.count);
    return { built: true, ship };
}
function removeShipKit(data, world, stockpile) {
    const hullFrames = data.resourceIndex.get("hull_frames") ?? -1;
    const thrusters = data.resourceIndex.get("thrusters") ?? -1;
    const reactors = data.resourceIndex.get("reactors") ?? -1;
    const lifeSupport = data.resourceIndex.get("life_support") ?? -1;
    if (hullFrames < 0 || thrusters < 0 || reactors < 0 || lifeSupport < 0)
        return false;
    if (!world.stockpiles.hasAtLeast(stockpile, hullFrames, 3))
        return false;
    if (!world.stockpiles.hasAtLeast(stockpile, thrusters, 2))
        return false;
    if (!world.stockpiles.hasAtLeast(stockpile, reactors, 1))
        return false;
    if (!world.stockpiles.hasAtLeast(stockpile, lifeSupport, 2))
        return false;
    world.stockpiles.remove(stockpile, hullFrames, 3);
    world.stockpiles.remove(stockpile, thrusters, 2);
    world.stockpiles.remove(stockpile, reactors, 1);
    world.stockpiles.remove(stockpile, lifeSupport, 2);
    return true;
}
function idleHaulersForFaction(world, faction) {
    let idle = 0;
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if (world.ships.faction[ship] === faction &&
            world.ships.role[ship] === ShipRole.Hauler &&
            world.ships.state[ship] === ShipState.Idle) {
            idle += 1;
        }
    }
    return idle;
}
function factionIncome(world, faction) {
    let population = 0;
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        population += world.bodies.population[body] ?? 0;
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return population * 0.12;
}
function factionUpkeep(world, faction) {
    let upkeep = 0;
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if (world.ships.faction[ship] !== faction)
            continue;
        if (world.ships.state[ship] === ShipState.Disbanded)
            continue;
        if (world.ships.role[ship] === ShipRole.Warship)
            upkeep += 14;
        else
            upkeep += 2.5;
    }
    return upkeep;
}
//# sourceMappingURL=fleet-scale.js.map