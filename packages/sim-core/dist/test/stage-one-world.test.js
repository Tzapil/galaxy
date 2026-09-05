import { describe, expect, it } from "vitest";
import { RoutePlanner } from "../src/nav/route.js";
import { StageOneSimulation } from "../src/simulation/stage-one.js";
import { createDefaultStageOneData, resourceIndexOf } from "../src/stage-one/data.js";
import { BodyType } from "../src/world/bodies.js";
import { buildTestWorld } from "../src/world/build-testworld.js";
import { StageOneWorld } from "../src/world/state.js";
describe("stage one world model", () => {
    it("builds the fixed 20-system slice deterministically from a seed", () => {
        const first = StageOneSimulation.create(20260904);
        const second = StageOneSimulation.create(20260904);
        expect(first.world.systems.length).toBe(20);
        expect(first.hash()).toBe(second.hash());
    });
    it("keeps the test gate graph connected and starts factions far apart", () => {
        const sim = StageOneSimulation.create(20260904);
        const routes = new RoutePlanner();
        const firstCapital = sim.world.factions.capitalSystem[0] ?? -1;
        const secondCapital = sim.world.factions.capitalSystem[1] ?? -1;
        expect(routes.connectedComponentCount(sim.world.systems, sim.world.gates)).toBe(1);
        expect(routes.find(sim.world.systems, sim.world.gates, firstCapital, secondCapital).jumps).toBeGreaterThanOrEqual(4);
    });
    it("uses real resource ids for the slice resources", () => {
        const data = createDefaultStageOneData();
        const expectedIds = [
            "energy",
            "ore",
            "ice",
            "biomass",
            "gas",
            "metal",
            "water",
            "food",
            "fuel"
        ];
        expect(data.sliceResourceIndices.map((resource) => data.resources[resource]?.id)).toEqual(expectedIds);
        for (let i = 0; i < expectedIds.length; i += 1) {
            expect(resourceIndexOf(data.resourceIndex, expectedIds[i] ?? "")).toBe(data.sliceResourceIndices[i]);
        }
    });
    it("round-trips a stage-one snapshot with the same hash and future evolution", () => {
        const continuous = StageOneSimulation.create(77);
        continuous.run(700, 0);
        const midpoint = StageOneSimulation.create(77);
        midpoint.run(350, 0);
        const restored = StageOneSimulation.fromSnapshot(midpoint.snapshot());
        restored.run(350, 0);
        expect(restored.hash()).toBe(continuous.hash());
    });
    it("keeps stockpiles strictly local", () => {
        const data = createDefaultStageOneData();
        const world = buildTestWorld(data, 5);
        const ore = resourceIndexOf(data.resourceIndex, "ore");
        const first = world.bodies.stockpile[0] ?? 0;
        const second = world.bodies.stockpile[1] ?? 0;
        world.stockpiles.set(first, ore, 123);
        expect(world.stockpiles.get(first, ore)).toBe(123);
        expect(world.stockpiles.get(second, ore)).not.toBe(123);
    });
    it("preserves system body indexes while body arenas grow", () => {
        const data = createDefaultStageOneData();
        const world = StageOneWorld.create(data);
        world.systems.add(0, 0, 0, -1);
        for (let i = 0; i < 10_000; i += 1) {
            world.addBody(0, BodyType.Planet, 1, 0.5, 4, -1, 0);
        }
        let traversed = 0;
        let body = world.systems.firstBody[0] ?? -1;
        while (body >= 0) {
            traversed += 1;
            body = world.bodies.nextInSystem[body] ?? -1;
        }
        expect(world.systems.bodyCount[0]).toBe(10_000);
        expect(traversed).toBe(10_000);
    });
});
//# sourceMappingURL=stage-one-world.test.js.map