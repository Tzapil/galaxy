import { describe, expect, it } from "vitest";
import { EventQueue } from "../src/events/queue.js";
import { JobBoard } from "../src/market/jobboard.js";
import { estimateDailyDemand } from "../src/market/prices.js";
import { RoutePlanner } from "../src/nav/route.js";
import { handleShipArrival, launchBestLocalJob } from "../src/ships/move.js";
import { ShipState } from "../src/ships/ships.js";
import { StageOneSimulation } from "../src/simulation/stage-one.js";
import { createDefaultStageOneData, resourceIndexOf } from "../src/stage-one/data.js";
import { BodyType } from "../src/world/bodies.js";
import { StageOneWorld } from "../src/world/state.js";
describe("stage one market and logistics", () => {
    it("applies the target/scarcity/price formula literally", () => {
        const data = createDefaultStageOneData();
        const world = singleColonyWorld(data, 1000);
        const body = 0;
        const food = resourceIndexOf(data.resourceIndex, "food");
        world.prices.recalculate(data, world.bodies, world.stockpiles, world.buildings);
        const demand = estimateDailyDemand(data, world.bodies, world.buildings, body, food);
        const target = Math.max(40, demand * 60);
        const scarcity = Math.max(0.15, Math.min(4, 2.5 - (2 * 0) / target));
        expect(world.prices.demand(body, food)).toBeCloseTo(demand);
        expect(world.prices.price(body, food)).toBeCloseTo((data.baseValue[food] ?? 0) * scarcity);
    });
    it("reserves a single profitable job for only one of twenty idle haulers", () => {
        const data = createDefaultStageOneData();
        const world = twoColonyWorld(data);
        const jobs = oneFoodJob(data, world, 0, 1);
        const routes = new RoutePlanner();
        const queue = new EventQueue(64);
        for (let i = 0; i < 20; i += 1)
            world.addHauler(0, 0, 1600, 220, 7);
        let launched = 0;
        for (let ship = 0; ship < world.ships.length; ship += 1) {
            if (launchBestLocalJob(data, world, jobs, routes, queue, ship, 0) === 1)
                launched += 1;
        }
        expect(jobs.count).toBe(1);
        expect(jobs.reserved[0]).toBe(1);
        expect(launched).toBe(1);
    });
    it("keeps a fuel-starved hauler in port and records the failed departure", () => {
        const data = createDefaultStageOneData();
        const world = twoColonyWorld(data);
        const jobs = oneFoodJob(data, world, 0, 1);
        const queue = new EventQueue(8);
        const ship = world.addHauler(0, 0, 1600, 220, 7);
        world.ships.fuelTank[ship] = 0;
        expect(launchBestLocalJob(data, world, jobs, new RoutePlanner(), queue, ship, 0)).toBe(3);
        expect(world.ships.state[ship]).toBe(ShipState.Idle);
        expect(world.eventLog.length).toBe(1);
    });
    it("lets a hauler leave a fuel-less destination using its own tank", () => {
        const data = createDefaultStageOneData();
        const world = twoColonyWorld(data);
        const routes = new RoutePlanner();
        const queue = new EventQueue(8);
        const ship = world.addHauler(0, 0, 1600, 220, 7);
        const fuel = resourceIndexOf(data.resourceIndex, "fuel");
        world.stockpiles.set(world.bodies.stockpile[0] ?? 0, fuel, 0);
        world.stockpiles.set(world.bodies.stockpile[1] ?? 0, fuel, 0);
        expect(launchBestLocalJob(data, world, oneFoodJob(data, world, 0, 1), routes, queue, ship, 0)).toBe(1);
        const arrival = world.ships.arriveTick[ship] ?? 0;
        expect(handleShipArrival(data, world, queue, ship, arrival)).toBe(true);
        expect(world.ships.currentSystem[ship]).toBe(1);
        expect(launchBestLocalJob(data, world, oneFoodJob(data, world, 1, 0), routes, queue, ship, arrival)).toBe(1);
        expect(world.ships.state[ship]).toBe(ShipState.InTransit);
    });
    it("routes around blocked gates", () => {
        const data = createDefaultStageOneData();
        const world = StageOneWorld.create(data);
        world.systems.add(0, 0, 0, -1);
        world.systems.add(1, 0, 0, -1);
        world.systems.add(2, 0, 0, -1);
        world.gates.addUndirected(world.systems, 0, 1, 1);
        world.gates.addUndirected(world.systems, 1, 2, 1);
        world.gates.addUndirected(world.systems, 0, 2, 10);
        const routes = new RoutePlanner();
        expect(routes.find(world.systems, world.gates, 0, 2).travelTicks).toBe(2);
        world.gates.blocked[0] = 1;
        world.gates.blocked[1] = 1;
        expect(routes.find(world.systems, world.gates, 0, 2).travelTicks).toBe(10);
    });
    it("reduces food and water price spread over a 100-year run", () => {
        const sim = StageOneSimulation.create(12345);
        const initialSpread = sim.metrics().averageFoodWaterSpread;
        const report = sim.run(36_500, 0);
        expect(report.metrics.averageFoodWaterSpread).toBeLessThan(initialSpread);
        expect(report.metrics.minPopulation).toBeGreaterThan(100);
        expect(report.metrics.deliveredShipments).toBeGreaterThan(0);
    });
});
function singleColonyWorld(data, population) {
    const world = StageOneWorld.create(data);
    world.systems.add(0, 0, 0, -1);
    const body = world.addBody(0, BodyType.Planet, 1, 0.9, 24, -1, population);
    world.addFaction("Test", 0, body, 0, 1, 1);
    return world;
}
function twoColonyWorld(data) {
    const world = StageOneWorld.create(data);
    world.systems.add(0, 0, 0, -1);
    world.systems.add(1, 0, 0, -1);
    world.gates.addUndirected(world.systems, 0, 1, 7);
    const first = world.addBody(0, BodyType.Planet, 1, 0.9, 24, -1, 100);
    const second = world.addBody(1, BodyType.Planet, 1, 0.9, 24, -1, 100);
    world.addFaction("Test", 0, first, 0, 1, 1);
    world.addColony(0, second, 100);
    return world;
}
function oneFoodJob(data, world, source, target) {
    const food = resourceIndexOf(data.resourceIndex, "food");
    const sourceStockpile = world.bodies.stockpile[source] ?? 0;
    const targetStockpile = world.bodies.stockpile[target] ?? 0;
    world.stockpiles.set(sourceStockpile, food, 1000);
    world.stockpiles.set(targetStockpile, food, 0);
    for (let resource = 0; resource < data.resources.length; resource += 1) {
        setMarket(world, source, resource, 1, 0);
        setMarket(world, target, resource, 1, 0);
    }
    setMarket(world, source, food, 1, 0);
    setMarket(world, target, food, 10, 10);
    const jobs = new JobBoard(1);
    jobs.update(data, world, new RoutePlanner());
    return jobs;
}
function setMarket(world, body, resource, price, demand) {
    const priceColumn = world.prices.priceColumns[resource];
    const demandColumn = world.prices.demandColumns[resource];
    if (priceColumn === undefined || demandColumn === undefined)
        throw new RangeError("Missing market column.");
    priceColumn[body] = price;
    demandColumn[body] = demand;
}
//# sourceMappingURL=stage-one-logistics.test.js.map