import { StageOneLogKind } from "../events/log.js";
export const STAGE_ONE_VIEW_MAGIC = 0x47533156;
export const STAGE_ONE_VIEW_VERSION = 1;
export var RenderSliceBit;
(function (RenderSliceBit) {
    RenderSliceBit[RenderSliceBit["Map"] = 1] = "Map";
    RenderSliceBit[RenderSliceBit["Colonies"] = 2] = "Colonies";
    RenderSliceBit[RenderSliceBit["Ships"] = 4] = "Ships";
    RenderSliceBit[RenderSliceBit["Buildings"] = 8] = "Buildings";
    RenderSliceBit[RenderSliceBit["Events"] = 16] = "Events";
})(RenderSliceBit || (RenderSliceBit = {}));
export function buildStageOneRenderSnapshot(sim, slices) {
    const world = sim.world;
    const systemCount = has(slices, RenderSliceBit.Map) ? world.systems.length : 0;
    const gateCount = has(slices, RenderSliceBit.Map) ? world.gates.length / 2 : 0;
    const colonyCount = has(slices, RenderSliceBit.Colonies) ? countColonies(sim) : 0;
    const shipCount = has(slices, RenderSliceBit.Ships) ? world.ships.length : 0;
    const buildingCount = has(slices, RenderSliceBit.Buildings) ? world.buildings.length : 0;
    const eventCount = has(slices, RenderSliceBit.Events) ? Math.min(40, world.eventLog.length) : 0;
    const resourceCount = world.data.sliceResourceIndices.length;
    const bytes = 52 +
        systemCount * 24 +
        gateCount * 12 +
        colonyCount * (32 + resourceCount * 16) +
        shipCount * 52 +
        buildingCount * 20 +
        eventCount * 36;
    const buffer = new ArrayBuffer(bytes);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint32(offset, STAGE_ONE_VIEW_MAGIC, true);
    offset += 4;
    view.setUint32(offset, STAGE_ONE_VIEW_VERSION, true);
    offset += 4;
    view.setFloat64(offset, sim.tick, true);
    offset += 8;
    view.setUint32(offset, slices, true);
    offset += 4;
    view.setUint32(offset, resourceCount, true);
    offset += 4;
    view.setUint32(offset, systemCount, true);
    offset += 4;
    view.setUint32(offset, gateCount, true);
    offset += 4;
    view.setUint32(offset, colonyCount, true);
    offset += 4;
    view.setUint32(offset, shipCount, true);
    offset += 4;
    view.setUint32(offset, buildingCount, true);
    offset += 4;
    view.setUint32(offset, eventCount, true);
    offset += 4;
    if (systemCount > 0)
        offset = writeSystems(view, offset, sim);
    if (gateCount > 0)
        offset = writeGates(view, offset, sim);
    if (colonyCount > 0)
        offset = writeColonies(view, offset, sim);
    if (shipCount > 0)
        offset = writeShips(view, offset, sim);
    if (buildingCount > 0)
        offset = writeBuildings(view, offset, sim);
    if (eventCount > 0)
        writeEvents(view, offset, sim, eventCount);
    return buffer;
}
export function decodeStageOneRenderSnapshot(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    const magic = view.getUint32(offset, true);
    offset += 4;
    if (magic !== STAGE_ONE_VIEW_MAGIC)
        throw new Error("Invalid stage one view snapshot magic.");
    const version = view.getUint32(offset, true);
    offset += 4;
    if (version !== STAGE_ONE_VIEW_VERSION)
        throw new Error("Unsupported stage one view snapshot.");
    const tick = view.getFloat64(offset, true);
    offset += 8;
    const slices = view.getUint32(offset, true);
    offset += 4;
    const resourceCount = view.getUint32(offset, true);
    offset += 4;
    const systemCount = view.getUint32(offset, true);
    offset += 4;
    const gateCount = view.getUint32(offset, true);
    offset += 4;
    const colonyCount = view.getUint32(offset, true);
    offset += 4;
    const shipCount = view.getUint32(offset, true);
    offset += 4;
    const buildingCount = view.getUint32(offset, true);
    offset += 4;
    const eventCount = view.getUint32(offset, true);
    offset += 4;
    const systems = [];
    for (let i = 0; i < systemCount; i += 1) {
        systems.push({
            id: view.getUint32(offset, true),
            x: view.getFloat64(offset + 4, true),
            y: view.getFloat64(offset + 12, true),
            owner: view.getInt32(offset + 20, true)
        });
        offset += 24;
    }
    const gates = [];
    for (let i = 0; i < gateCount; i += 1) {
        gates.push({
            from: view.getUint32(offset, true),
            to: view.getUint32(offset + 4, true),
            blocked: view.getUint8(offset + 8) === 1
        });
        offset += 12;
    }
    const colonies = [];
    for (let i = 0; i < colonyCount; i += 1) {
        const stock = [];
        const prices = [];
        const body = view.getUint32(offset, true);
        const system = view.getUint32(offset + 4, true);
        const faction = view.getInt32(offset + 8, true);
        const population = view.getFloat64(offset + 12, true);
        const unrest = view.getFloat64(offset + 20, true);
        offset += 32;
        for (let r = 0; r < resourceCount; r += 1) {
            stock.push(view.getFloat64(offset, true));
            prices.push(view.getFloat64(offset + 8, true));
            offset += 16;
        }
        colonies.push({ body, system, faction, population, unrest, stock, prices });
    }
    const ships = [];
    for (let i = 0; i < shipCount; i += 1) {
        ships.push({
            id: view.getUint32(offset, true),
            state: view.getUint8(offset + 4),
            from: view.getUint32(offset + 8, true),
            to: view.getUint32(offset + 12, true),
            departTick: view.getFloat64(offset + 16, true),
            arriveTick: view.getFloat64(offset + 24, true),
            cargoResource: view.getInt32(offset + 32, true),
            cargoAmount: view.getFloat64(offset + 40, true)
        });
        offset += 52;
    }
    const buildings = [];
    for (let i = 0; i < buildingCount; i += 1) {
        buildings.push({
            id: view.getUint32(offset, true),
            body: view.getUint32(offset + 4, true),
            type: view.getUint16(offset + 8, true),
            state: view.getUint8(offset + 10),
            stateResource: view.getInt32(offset + 12, true)
        });
        offset += 20;
    }
    const events = [];
    for (let i = 0; i < eventCount; i += 1) {
        events.push({
            tick: view.getFloat64(offset, true),
            kind: view.getUint16(offset + 8, true),
            system: view.getInt32(offset + 12, true),
            body: view.getInt32(offset + 16, true),
            subject: view.getInt32(offset + 20, true),
            resource: view.getInt32(offset + 24, true),
            amount: view.getFloat64(offset + 28, true)
        });
        offset += 36;
    }
    return { tick, slices, systems, gates, colonies, ships, buildings, events };
}
function writeSystems(view, offset, sim) {
    const systems = sim.world.systems;
    let next = offset;
    for (let i = 0; i < systems.length; i += 1) {
        view.setUint32(next, i, true);
        view.setFloat64(next + 4, systems.x[i] ?? 0, true);
        view.setFloat64(next + 12, systems.y[i] ?? 0, true);
        view.setInt32(next + 20, systems.owner[i] ?? -1, true);
        next += 24;
    }
    return next;
}
function writeGates(view, offset, sim) {
    const gates = sim.world.gates;
    let next = offset;
    for (let i = 0; i < gates.length; i += 2) {
        view.setUint32(next, gates.from[i] ?? 0, true);
        view.setUint32(next + 4, gates.to[i] ?? 0, true);
        view.setUint8(next + 8, gates.blocked[i] ?? 0);
        next += 12;
    }
    return next;
}
function writeColonies(view, offset, sim) {
    const world = sim.world;
    let next = offset;
    for (let body = 0; body < world.bodies.length; body += 1) {
        if ((world.bodies.owner[body] ?? -1) < 0 || (world.bodies.population[body] ?? 0) <= 0)
            continue;
        view.setUint32(next, body, true);
        view.setUint32(next + 4, world.bodies.system[body] ?? 0, true);
        view.setInt32(next + 8, world.bodies.owner[body] ?? -1, true);
        view.setFloat64(next + 12, world.bodies.population[body] ?? 0, true);
        view.setFloat64(next + 20, world.bodies.unrest[body] ?? 0, true);
        next += 32;
        const stockpile = world.bodies.stockpile[body] ?? 0;
        for (let r = 0; r < world.data.sliceResourceIndices.length; r += 1) {
            const resource = world.data.sliceResourceIndices[r] ?? 0;
            view.setFloat64(next, world.stockpiles.get(stockpile, resource), true);
            view.setFloat64(next + 8, world.prices.price(body, resource), true);
            next += 16;
        }
    }
    return next;
}
function writeShips(view, offset, sim) {
    const ships = sim.world.ships;
    let next = offset;
    for (let ship = 0; ship < ships.length; ship += 1) {
        view.setUint32(next, ship, true);
        view.setUint8(next + 4, ships.state[ship] ?? 0);
        view.setUint32(next + 8, ships.fromSystem[ship] ?? 0, true);
        view.setUint32(next + 12, ships.toSystem[ship] ?? 0, true);
        view.setFloat64(next + 16, ships.departTick[ship] ?? -1, true);
        view.setFloat64(next + 24, ships.arriveTick[ship] ?? -1, true);
        view.setInt32(next + 32, ships.cargoResource[ship] ?? -1, true);
        view.setFloat64(next + 40, ships.cargoAmount[ship] ?? 0, true);
        next += 52;
    }
    return next;
}
function writeBuildings(view, offset, sim) {
    const buildings = sim.world.buildings;
    let next = offset;
    for (let building = 0; building < buildings.length; building += 1) {
        view.setUint32(next, building, true);
        view.setUint32(next + 4, buildings.body[building] ?? 0, true);
        view.setUint16(next + 8, buildings.type[building] ?? 0, true);
        view.setUint8(next + 10, buildings.state[building] ?? 0);
        view.setInt32(next + 12, buildings.stateResource[building] ?? -1, true);
        next += 20;
    }
    return next;
}
function writeEvents(view, offset, sim, eventCount) {
    const log = sim.world.eventLog;
    let next = offset;
    for (let i = 0; i < eventCount; i += 1) {
        const event = log.recentRow(i, eventCount);
        view.setFloat64(next, log.tick[event] ?? 0, true);
        view.setUint16(next + 8, log.kind[event] ?? 0, true);
        view.setInt32(next + 12, log.system[event] ?? -1, true);
        view.setInt32(next + 16, log.body[event] ?? -1, true);
        view.setInt32(next + 20, log.subject[event] ?? -1, true);
        view.setInt32(next + 24, log.resource[event] ?? -1, true);
        view.setFloat64(next + 28, log.amount[event] ?? 0, true);
        next += 36;
    }
    return next;
}
function countColonies(sim) {
    let count = 0;
    for (let body = 0; body < sim.world.bodies.length; body += 1) {
        if ((sim.world.bodies.owner[body] ?? -1) >= 0 && (sim.world.bodies.population[body] ?? 0) > 0)
            count += 1;
    }
    return count;
}
function has(slices, bit) {
    return (slices & bit) === bit;
}
//# sourceMappingURL=render-snapshot.js.map