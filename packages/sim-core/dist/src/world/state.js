import { Buildings } from "../econ/buildings.js";
import { MarketPrices } from "../market/prices.js";
import { SupplyEma } from "../pop/supply-ema.js";
import { StageOneEventLog } from "../events/log.js";
import { Ships } from "../ships/ships.js";
import { Bodies, BodyType } from "./bodies.js";
import { Factions } from "./factions.js";
import { Gates } from "./gates.js";
import { Stockpiles } from "./stockpiles.js";
import { Systems } from "./systems.js";
export class StageOneWorld {
    data;
    systems;
    gates;
    bodies;
    stockpiles;
    factions;
    buildings;
    ships;
    supply;
    prices;
    eventLog;
    constructor(data, systems, gates, bodies, stockpiles, factions, buildings, ships, supply, prices, eventLog) {
        this.data = data;
        this.systems = systems;
        this.gates = gates;
        this.bodies = bodies;
        this.stockpiles = stockpiles;
        this.factions = factions;
        this.buildings = buildings;
        this.ships = ships;
        this.supply = supply;
        this.prices = prices;
        this.eventLog = eventLog;
    }
    static create(data) {
        return new StageOneWorld(data, Systems.create(32), Gates.create(96), Bodies.create(96), Stockpiles.create(data, 96), Factions.create(4), Buildings.create(256), Ships.create(64), SupplyEma.create(data, 96), MarketPrices.create(data, 96), StageOneEventLog.create(512));
    }
    static fromSnapshots(data, snapshots) {
        const systems = Systems.fromSnapshot(findArena(snapshots, "systems"));
        const gates = Gates.fromSnapshot(findArena(snapshots, "gates"));
        const bodies = Bodies.fromSnapshots(findArena(snapshots, "bodies"), findArena(snapshots, "deposits"));
        const stockpiles = Stockpiles.fromSnapshot(data, findArena(snapshots, "stockpiles"));
        const factions = Factions.fromSnapshot(findArena(snapshots, "factions"));
        const buildings = Buildings.fromSnapshot(findArena(snapshots, "buildings"));
        const ships = Ships.fromSnapshot(findArena(snapshots, "ships"));
        const supply = SupplyEma.fromSnapshot(data, findArena(snapshots, "supply_ema"));
        const prices = MarketPrices.fromSnapshot(data, findArena(snapshots, "market_prices"));
        const eventLog = StageOneEventLog.fromSnapshot(findArena(snapshots, "stage_one_event_log"));
        systems.rebuildBodyTails(bodies.nextInSystem);
        systems.rebuildGateTails(gates.nextInSystem);
        bodies.rebuildBuildingTails(buildings.nextInBody);
        factions.rebuildColonyTails(bodies);
        return new StageOneWorld(data, systems, gates, bodies, stockpiles, factions, buildings, ships, supply, prices, eventLog);
    }
    arenas() {
        return [
            this.systems.arena.snapshot(),
            this.gates.arena.snapshot(),
            this.bodies.arena.snapshot(),
            this.bodies.deposits.arena.snapshot(),
            this.stockpiles.arena.snapshot(),
            this.factions.arena.snapshot(),
            this.buildings.arena.snapshot(),
            this.ships.arena.snapshot(),
            this.supply.arena.snapshot(),
            this.prices.arena.snapshot(),
            this.eventLog.arena.snapshot()
        ];
    }
    addBody(system, type, size, habitability, slots, owner, population, featureMask = 0) {
        const stockpile = this.stockpiles.add();
        const supplyRow = this.supply.addBody();
        const priceRow = this.prices.addPoint();
        if (stockpile !== supplyRow || stockpile !== priceRow) {
            throw new RangeError("Body sidecar arenas must keep identical row indexes.");
        }
        return this.bodies.add(this.systems, system, type, size, habitability, slots, owner, stockpile, population, featureMask);
    }
    addFaction(label, capitalSystem, capitalBody, treasury, expansion, industry) {
        const faction = this.factions.add(label, capitalSystem, capitalBody, treasury, expansion, industry);
        this.bodies.owner[capitalBody] = faction;
        this.systems.owner[capitalSystem] = faction;
        this.factions.attachColony(faction, capitalBody, this.bodies);
        return faction;
    }
    addColony(faction, body, population) {
        const system = this.bodies.system[body] ?? 0;
        this.bodies.owner[body] = faction;
        this.bodies.population[body] = population;
        this.systems.owner[system] = faction;
        this.factions.attachColony(faction, body, this.bodies);
    }
    addHauler(faction, currentSystem, cargoCapacity, fuelCapacity, fuelPerJump) {
        const stockpile = this.stockpiles.add();
        return this.ships.addHauler(faction, currentSystem, stockpile, cargoCapacity, fuelCapacity, fuelPerJump);
    }
}
function findArena(snapshots, name) {
    for (let i = 0; i < snapshots.length; i += 1) {
        const snapshot = snapshots[i];
        if (snapshot?.name === name)
            return snapshot;
    }
    throw new Error(`Stage one snapshot is missing arena "${name}".`);
}
//# sourceMappingURL=state.js.map