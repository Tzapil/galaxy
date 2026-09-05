import { tryStartIdleBuildingsOnBody } from "../econ/batch.js";
import { BuildingState } from "../econ/buildings.js";
import { validatePlacement } from "../econ/placement.js";
import { EventKind } from "../events/kinds.js";
import { StageOneLogKind } from "../events/log.js";
export function startBuildingConstruction(data, world, queue, body, buildingType, tick) {
    const placement = validatePlacement(data, world, body, buildingType);
    if (!placement.ok) {
        return {
            ok: false,
            building: -1,
            placement: placement.reason,
            waitingResource: -1
        };
    }
    const building = world.buildings.addUnderConstruction(data, world.bodies, body, buildingType, tick);
    const waitingResource = tryPayConstructionCost(data, world, building);
    if (waitingResource >= 0) {
        world.buildings.stateResource[building] = waitingResource;
        world.eventLog.append(tick, StageOneLogKind.ConstructionWaitingMaterials, world.bodies.system[body] ?? -1, body, building, waitingResource, 0);
        return { ok: true, building, waitingResource };
    }
    scheduleConstruction(data, world, queue, building, tick);
    world.eventLog.append(tick, StageOneLogKind.ConstructionStarted, world.bodies.system[body] ?? -1, body, building, -1, data.buildings[buildingType]?.buildDays ?? 0);
    return { ok: true, building, waitingResource: -1 };
}
export function advanceWaitingConstructions(data, world, queue, tick) {
    let started = 0;
    for (let building = 0; building < world.buildings.length; building += 1) {
        if (world.buildings.state[building] !== BuildingState.UnderConstruction)
            continue;
        if ((world.buildings.finishTick[building] ?? -1) >= 0)
            continue;
        const waitingResource = tryPayConstructionCost(data, world, building);
        if (waitingResource >= 0) {
            world.buildings.stateResource[building] = waitingResource;
            continue;
        }
        scheduleConstruction(data, world, queue, building, tick);
        started += 1;
    }
    return started;
}
export function completeConstruction(data, world, queue, building, tick) {
    if (world.buildings.state[building] !== BuildingState.UnderConstruction)
        return;
    const body = world.buildings.body[building] ?? 0;
    world.buildings.activateBuilt(data, world.bodies, building);
    world.eventLog.append(tick, StageOneLogKind.ConstructionComplete, world.bodies.system[body] ?? -1, body, building, -1, 1);
    tryStartIdleBuildingsOnBody(data, world, queue, body, tick);
}
function tryPayConstructionCost(data, world, building) {
    const def = data.buildings[world.buildings.type[building] ?? 0];
    if (def === undefined)
        throw new RangeError("Unknown building type.");
    const body = world.buildings.body[building] ?? 0;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    const missing = world.stockpiles.canReserveAll(stockpile, def.buildCost);
    if (missing >= 0)
        return missing;
    for (let i = 0; i < def.buildCost.length; i += 1) {
        const item = def.buildCost[i];
        if (item === undefined)
            throw new RangeError("Construction cost is inconsistent.");
        world.stockpiles.remove(stockpile, item.resource, item.amount);
    }
    return -1;
}
function scheduleConstruction(data, world, queue, building, tick) {
    const def = data.buildings[world.buildings.type[building] ?? 0];
    if (def === undefined)
        throw new RangeError("Unknown building type.");
    const finishTick = tick + def.buildDays;
    world.buildings.startedTick[building] = tick;
    world.buildings.finishTick[building] = finishTick;
    world.buildings.stateResource[building] = -1;
    queue.schedule(finishTick, EventKind.ConstructionComplete, building);
}
//# sourceMappingURL=construction.js.map