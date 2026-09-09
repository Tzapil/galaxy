import { hasWorkersForBuilding } from "../pop/workforce.js";
import { BuildingState } from "./buildings.js";
export function processContinuousBuildings(data, world) {
    const buildings = world.buildings;
    for (let building = 0; building < buildings.length; building += 1) {
        const state = buildings.state[building] ?? BuildingState.Demolished;
        if (state === BuildingState.UnderConstruction || state === BuildingState.Demolished)
            continue;
        const processIndex = buildings.continuousProcess[building] ?? -1;
        if (processIndex < 0)
            continue;
        if (!hasWorkersForBuilding(world.bodies, buildings, building))
            continue;
        const process = data.continuous[processIndex];
        if (process === undefined)
            throw new RangeError("Continuous process index is invalid.");
        const body = buildings.body[building] ?? 0;
        const faction = world.bodies.owner[body] ?? -1;
        const stockpile = world.bodies.stockpile[body] ?? 0;
        const missing = world.stockpiles.canReserveAll(stockpile, process.inputsPerTick);
        if (missing >= 0) {
            buildings.setIdleMissing(building, missing, data.energyResource);
            continue;
        }
        for (let i = 0; i < process.inputsPerTick.length; i += 1) {
            const input = process.inputsPerTick[i];
            if (input === undefined)
                throw new RangeError("Continuous input is inconsistent.");
            world.stockpiles.remove(stockpile, input.resource, input.amount);
        }
        for (let i = 0; i < process.outputsPerTick.length; i += 1) {
            const output = process.outputsPerTick[i];
            if (output === undefined)
                throw new RangeError("Continuous output is inconsistent.");
            const multiplier = output.resource === data.energyResource && faction >= 0
                ? world.techModifiers.globalMultiplier(faction, "powerOutput")
                : 1;
            world.stockpiles.addClamped(stockpile, output.resource, output.amount * multiplier);
        }
        buildings.state[building] = BuildingState.Working;
        buildings.stateResource[building] = -1;
    }
}
//# sourceMappingURL=continuous.js.map