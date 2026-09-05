import { buildingIndexOf, resourceIndexOf } from "../stage-one/data.js";
import { Rng } from "../rng.js";
import { BodyType } from "./bodies.js";
import { StageOneWorld } from "./state.js";
const SYSTEM_COUNT = 20;
export function buildTestWorld(data, seed) {
    const rng = Rng.fromSeed(seed).derive("testworld");
    const world = StageOneWorld.create(data);
    for (let i = 0; i < SYSTEM_COUNT; i += 1) {
        const angle = (i / SYSTEM_COUNT) * Math.PI * 2;
        const ring = 120 + rng.nextInt(0, 25);
        const x = 180 + Math.cos(angle) * ring + rng.nextInt(-12, 13);
        const y = 140 + Math.sin(angle) * ring + rng.nextInt(-12, 13);
        world.systems.add(x, y, i < 10 ? 0 : 1, -1);
    }
    for (let i = 0; i < SYSTEM_COUNT; i += 1) {
        world.gates.addUndirected(world.systems, i, (i + 1) % SYSTEM_COUNT, 3 + rng.nextInt(0, 5));
    }
    for (let i = 1; i < SYSTEM_COUNT; i += 2) {
        world.gates.addUndirected(world.systems, i, (i + 2) % SYSTEM_COUNT, 4 + rng.nextInt(0, 5));
    }
    const ore = resourceIndexOf(data.resourceIndex, "ore");
    const ice = resourceIndexOf(data.resourceIndex, "ice");
    const biomass = resourceIndexOf(data.resourceIndex, "biomass");
    const gas = resourceIndexOf(data.resourceIndex, "gas");
    const primaryBodies = new Int32Array(SYSTEM_COUNT);
    for (let system = 0; system < SYSTEM_COUNT; system += 1) {
        const habitability = system === 0 || system === 10 ? 0.92 : 0.35 + rng.nextInt(0, 50) / 100;
        const planet = world.addBody(system, BodyType.Planet, 0.8 + rng.nextInt(0, 70) / 100, habitability, 18 + rng.nextInt(0, 5), -1, 0);
        primaryBodies[system] = planet;
        world.bodies.addDeposit(planet, ice, system % 3 === 0 ? 1.4 : 0.7);
        if (habitability > 0.55)
            world.bodies.addDeposit(planet, biomass, 1.0 + rng.nextInt(0, 60) / 100);
        if (system % 2 === 0)
            world.bodies.addDeposit(planet, ore, 0.7);
        const belt = world.addBody(system, BodyType.AsteroidBelt, 0.4, 0, 6, -1, 0);
        world.bodies.addDeposit(belt, ore, 1.2 + rng.nextInt(0, 80) / 100);
        const giant = world.addBody(system, BodyType.GasGiant, 1.6, 0, 4, -1, 0);
        world.bodies.addDeposit(giant, gas, 1.1 + rng.nextInt(0, 70) / 100);
    }
    const factionA = world.addFaction("Vega Compact", 0, primaryBodies[0] ?? 0, 20_000, 1.0, 1.0);
    const factionB = world.addFaction("Orion Combine", 10, primaryBodies[10] ?? 0, 20_000, 1.0, 1.0);
    world.bodies.population[primaryBodies[0] ?? 0] = 260;
    world.bodies.population[primaryBodies[10] ?? 0] = 260;
    world.addColony(factionA, primaryBodies[1] ?? 1, 170);
    world.addColony(factionB, primaryBodies[11] ?? 11, 170);
    seedColony(data, world, primaryBodies[0] ?? 0, true);
    seedColony(data, world, primaryBodies[1] ?? 0, false);
    seedColony(data, world, primaryBodies[10] ?? 0, true);
    seedColony(data, world, primaryBodies[11] ?? 0, false);
    for (let i = 0; i < 2; i += 1)
        world.addHauler(factionA, 0, 1600, 220, 7);
    for (let i = 0; i < 2; i += 1)
        world.addHauler(factionA, 1, 1600, 220, 7);
    for (let i = 0; i < 2; i += 1)
        world.addHauler(factionB, 10, 1600, 220, 7);
    for (let i = 0; i < 2; i += 1)
        world.addHauler(factionB, 11, 1600, 220, 7);
    return world;
}
function seedColony(data, world, body, capital) {
    const buildings = capital
        ? [
            "solar_array",
            "solar_array",
            "solar_array",
            "solar_array",
            "mine",
            "ice_drill",
            "farm",
            "water_plant",
            "food_plant",
            "smelter",
            "refinery",
            "housing",
            "warehouse",
            "spaceport"
        ]
        : [
            "solar_array",
            "solar_array",
            "solar_array",
            "mine",
            "gas_collector",
            "ice_drill",
            "farm",
            "water_plant",
            "food_plant",
            "smelter",
            "refinery",
            "housing",
            "warehouse",
            "spaceport"
        ];
    for (let i = 0; i < buildings.length; i += 1) {
        world.buildings.addBuilt(data, world.bodies, body, buildingIndexOf(data.buildingIndex, buildings[i] ?? ""));
    }
    const stockpile = world.bodies.stockpile[body] ?? 0;
    set(data, world, stockpile, "energy", 80);
    set(data, world, stockpile, "ore", capital ? 60 : 700);
    set(data, world, stockpile, "ice", capital ? 700 : 80);
    set(data, world, stockpile, "gas", capital ? 80 : 700);
    set(data, world, stockpile, "biomass", capital ? 500 : 60);
    set(data, world, stockpile, "metal", capital ? 300 : 40);
    set(data, world, stockpile, "water", capital ? 500 : 80);
    set(data, world, stockpile, "food", capital ? 1400 : 800);
    set(data, world, stockpile, "fuel", capital ? 450 : 80);
    set(data, world, stockpile, "medicine", 120);
    set(data, world, stockpile, "consumer_goods", 180);
    set(data, world, stockpile, "luxury_goods", 50);
}
function set(data, world, stockpile, id, amount) {
    world.stockpiles.set(stockpile, resourceIndexOf(data.resourceIndex, id), amount);
}
//# sourceMappingURL=build-testworld.js.map