import { resourceIndexOf } from "../stage-one/data.js";
export const COLONY_FUEL_RESERVE = 40;
export function refuelShipAtBody(data, world, ship, body) {
    const fuel = resourceIndexOf(data.resourceIndex, "fuel");
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const available = Math.max(0, world.stockpiles.get(stockpile, fuel) - COLONY_FUEL_RESERVE);
    const needed = Math.max(0, (world.ships.fuelCapacity[ship] ?? 0) - (world.ships.fuelTank[ship] ?? 0));
    const taken = world.stockpiles.removeAvailable(stockpile, fuel, Math.min(available, needed));
    world.ships.fuelTank[ship] = (world.ships.fuelTank[ship] ?? 0) + taken;
}
export function fuelNeededForJumps(world, ship, jumps) {
    return (world.ships.fuelPerJump[ship] ?? 0) * jumps;
}
//# sourceMappingURL=fuel.js.map