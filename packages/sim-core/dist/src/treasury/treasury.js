import { StageOneLogKind } from "../events/log.js";
import { ShipRole, ShipState } from "../ships/ships.js";
export const TAX_PER_POP_PER_DAY = 0.12;
export const CIVILIAN_UPKEEP_PER_DAY = 2.5;
export const SUPPORT_UPKEEP_PER_DAY = 2.5;
export const WARSHIP_UPKEEP_PER_DAY = 14;
export const TREASURY_DEBT_FLOOR = -200;
export function applyDailyTreasury(_data, world, tick) {
    let taxIncome = 0;
    let upkeep = 0;
    for (let faction = 0; faction < world.factions.length; faction += 1) {
        const income = factionPopulation(world, faction) * TAX_PER_POP_PER_DAY;
        const cost = fleetUpkeep(world, faction);
        world.factions.treasury[faction] = (world.factions.treasury[faction] ?? 0) + income - cost;
        taxIncome += income;
        upkeep += cost;
    }
    let disbandedShips = 0;
    for (let faction = 0; faction < world.factions.length; faction += 1) {
        while ((world.factions.treasury[faction] ?? 0) < 0) {
            const ship = bestShipToDisband(world, faction);
            if (ship < 0)
                break;
            disbandShip(world, ship, tick);
            disbandedShips += 1;
            if ((world.factions.treasury[faction] ?? 0) < TREASURY_DEBT_FLOOR) {
                world.factions.treasury[faction] = TREASURY_DEBT_FLOOR;
            }
            if (fleetUpkeep(world, faction) <= factionPopulation(world, faction) * TAX_PER_POP_PER_DAY)
                break;
        }
    }
    return { taxIncome, upkeep, disbandedShips };
}
export function fleetUpkeep(world, faction) {
    let total = 0;
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if ((world.ships.faction[ship] ?? -1) !== faction)
            continue;
        if (world.ships.state[ship] === ShipState.Disbanded)
            continue;
        total += upkeepForRole(world.ships.role[ship] ?? ShipRole.Hauler);
    }
    return total;
}
export function upkeepForRole(role) {
    if (role === ShipRole.Warship)
        return WARSHIP_UPKEEP_PER_DAY;
    if (role === ShipRole.Miner || role === ShipRole.Scout || role === ShipRole.Hauler)
        return CIVILIAN_UPKEEP_PER_DAY;
    return SUPPORT_UPKEEP_PER_DAY;
}
function factionPopulation(world, faction) {
    let total = 0;
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        total += world.bodies.population[body] ?? 0;
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return total;
}
function bestShipToDisband(world, faction) {
    let best = -1;
    let bestUpkeep = -1;
    for (let ship = 0; ship < world.ships.length; ship += 1) {
        if ((world.ships.faction[ship] ?? -1) !== faction)
            continue;
        if (world.ships.state[ship] === ShipState.Disbanded)
            continue;
        if (world.ships.role[ship] !== ShipRole.Warship)
            continue;
        const upkeep = upkeepForRole(world.ships.role[ship] ?? ShipRole.Hauler);
        if (upkeep > bestUpkeep) {
            best = ship;
            bestUpkeep = upkeep;
        }
    }
    return best;
}
function disbandShip(world, ship, tick) {
    const system = world.ships.currentSystem[ship] ?? world.ships.toSystem[ship] ?? -1;
    world.ships.state[ship] = ShipState.Disbanded;
    world.ships.cargoResource[ship] = -1;
    world.ships.cargoAmount[ship] = 0;
    world.ships.sourceBody[ship] = -1;
    world.ships.targetBody[ship] = -1;
    world.eventLog.append(tick, StageOneLogKind.FleetDisbanded, system, -1, ship, -1, 0);
}
//# sourceMappingURL=treasury.js.map