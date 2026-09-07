import { bootProduction, detectAndBreakProductionDeadlocks, handleBatchComplete, processContinuousBuildings, tryStartBatch } from "../econ/batch.js";
import { BuildingState } from "../econ/buildings.js";
import { EventKind } from "../events/kinds.js";
import { EventBatch, EventQueue } from "../events/queue.js";
import { InstrumentSubsystem } from "../instrument.js";
import { JobBoard } from "../market/jobboard.js";
import { RoutePlanner } from "../nav/route.js";
import { consumePopulationWithLocalRedistribution } from "../pop/consume-stage-two.js";
import { updatePopulationGrowth } from "../pop/growth.js";
import { collectAndAdvanceResearch } from "../research/research.js";
import { Rng } from "../rng.js";
import { hashState } from "../snapshot/hash.js";
import { readStateSnapshot } from "../snapshot/read.js";
import { writeStateSnapshot } from "../snapshot/write.js";
import { handleShipArrival, assignIdleHaulers } from "../ships/move.js";
import { ShipRole, ShipState } from "../ships/ships.js";
import { resourceIndexOf } from "../stage-one/data.js";
import { buildStageOneRenderSnapshot } from "../stage-one/render-snapshot.js";
import { GovernmentContracts } from "../treasury/contracts.js";
import { applyDailyTreasury } from "../treasury/treasury.js";
import { completeConstruction, advanceWaitingConstructions } from "../build/construction.js";
import { runAutoBuilder } from "../build/auto-builder.js";
import { buildStageTwoWorld } from "../world/build-stage-two-world.js";
import { StageOneWorld } from "../world/state.js";
export class StageTwoSimulation {
    rootRng;
    data;
    world;
    tick;
    eventBatch = new EventBatch(8192);
    routes = new RoutePlanner(64);
    jobs = new JobBoard(160);
    contracts = new GovernmentContracts(256);
    zeroStreakDays;
    maxZeroStreakDays;
    completedBatches = 0;
    deliveredShipments = 0;
    missedDeparturesFuel = 0;
    constructedBuildings = 0;
    disbandedShips = 0;
    treasuryMin = Number.POSITIVE_INFINITY;
    constructor(rootRng, data, world, tick) {
        this.rootRng = rootRng;
        this.data = data;
        this.world = world;
        this.tick = tick;
        this.zeroStreakDays = new Uint16Array(data.resources.length);
        this.maxZeroStreakDays = new Uint16Array(data.resources.length);
        this.updateTreasuryMinimum();
    }
    static create(seed, data) {
        const world = buildStageTwoWorld(data, seed);
        return StageTwoSimulation.createFromWorld(seed, data, world);
    }
    static createFromWorld(seed, data, world) {
        const rootRng = Rng.fromSeed(seed);
        const sim = new StageTwoSimulation(rootRng, data, world, 0);
        world.prices.recalculate(data, world.bodies, world.stockpiles, world.buildings);
        bootProduction(data, world, sim.queue, 0);
        sim.refreshLogistics();
        return sim;
    }
    static fromSnapshot(buffer, data) {
        const restored = readStateSnapshot(buffer);
        const root = restored.rngStreams.find((stream) => stream.name === "root");
        if (root === undefined)
            throw new Error("Stage two snapshot is missing root RNG.");
        const world = StageOneWorld.fromSnapshots(data, restored.arenas);
        const sim = new StageTwoSimulation(Rng.deserialize(root.state), data, world, restored.tick);
        sim.queue = EventQueue.deserialize(restored.eventQueueBuffer);
        return sim;
    }
    queue = new EventQueue(8192);
    step(instrumentation) {
        const tickStarted = instrumentation?.begin(InstrumentSubsystem.Total) ?? 0;
        const continuousStarted = instrumentation?.begin(InstrumentSubsystem.Continuous) ?? 0;
        processContinuousBuildings(this.data, this.world);
        bootProduction(this.data, this.world, this.queue, this.tick);
        consumePopulationWithLocalRedistribution(this.data, this.world);
        updatePopulationGrowth(this.data, this.world.bodies, this.world.stockpiles, this.world.supply);
        collectAndAdvanceResearch(this.data, this.world, this.tick);
        const treasury = applyDailyTreasury(this.data, this.world, this.tick);
        this.disbandedShips += treasury.disbandedShips;
        this.updateTreasuryMinimum();
        this.updateZeroStreaks();
        instrumentation?.end(InstrumentSubsystem.Continuous, continuousStarted);
        const eventStarted = instrumentation?.begin(InstrumentSubsystem.Events) ?? 0;
        const drained = this.queue.drainUntil(this.tick, this.eventBatch);
        this.applyEvents(drained);
        advanceWaitingConstructions(this.data, this.world, this.queue, this.tick);
        instrumentation?.end(InstrumentSubsystem.Events, eventStarted);
        if (this.tick % 10 === 0)
            this.refreshLogistics();
        if (this.tick > 0 && this.tick % 30 === 0) {
            detectAndBreakProductionDeadlocks(this.data, this.world, this.queue, this.tick);
        }
        if (this.tick > 0 && this.tick % 90 === 0) {
            runAutoBuilder(this.data, this.world, this.queue, this.tick);
        }
        this.tick += 1;
        if (instrumentation?.enabled === true) {
            instrumentation.setEntityCounters({
                systems: this.world.systems.length,
                factions: this.world.factions.length,
                ships: this.world.ships.length,
                buildings: this.world.buildings.length
            });
            const totalMs = instrumentation.end(InstrumentSubsystem.Total, tickStarted);
            instrumentation.recordTick(totalMs);
        }
    }
    run(ticks, checkpointEvery = 10_000, instrumentation) {
        const checkpoints = [];
        const targetTick = this.tick + ticks;
        while (this.tick < targetTick) {
            this.step(instrumentation);
            if (checkpointEvery > 0 && this.tick % checkpointEvery === 0) {
                checkpoints.push({ tick: this.tick, hash: this.hash() });
            }
        }
        return {
            ticks,
            finalHash: this.hash(),
            intermediateHashes: checkpoints,
            counters: {
                systems: this.world.systems.length,
                factions: this.world.factions.length,
                ships: this.world.ships.length,
                buildings: this.world.buildings.length
            },
            metrics: this.metrics()
        };
    }
    snapshot() {
        return writeStateSnapshot(this.snapshotState());
    }
    renderSnapshot(slices) {
        return buildStageOneRenderSnapshot(this, slices);
    }
    hash() {
        return hashState(this.snapshotState());
    }
    snapshotState() {
        return {
            tick: this.tick,
            rngStreams: [{ name: "root", state: this.rootRng.serialize() }],
            eventQueue: this.queue,
            arenas: this.world.arenas()
        };
    }
    metrics() {
        let totalPopulation = 0;
        let minPopulation = Number.POSITIVE_INFINITY;
        let usedSlots = 0;
        let slots = 0;
        for (let body = 0; body < this.world.bodies.length; body += 1) {
            if ((this.world.bodies.owner[body] ?? -1) < 0)
                continue;
            const population = this.world.bodies.population[body] ?? 0;
            totalPopulation += population;
            if (population < minPopulation)
                minPopulation = population;
            usedSlots += this.world.bodies.usedSlots[body] ?? 0;
            slots += this.world.bodies.slots[body] ?? 0;
        }
        const food = resourceIndexOf(this.data.resourceIndex, "food");
        const water = resourceIndexOf(this.data.resourceIndex, "water");
        return {
            totalPopulation,
            minPopulation: Number.isFinite(minPopulation) ? minPopulation : 0,
            averageFoodWaterSpread: (this.world.prices.spreadForResource(this.world.bodies, food) +
                this.world.prices.spreadForResource(this.world.bodies, water)) /
                2,
            completedBatches: this.completedBatches,
            deliveredShipments: this.deliveredShipments,
            missedDeparturesFuel: this.missedDeparturesFuel,
            jobsAvailable: this.jobs.count,
            idleHaulers: this.countIdleHaulers(),
            idleNoPower: this.countBuildingsInState(BuildingState.IdleNoPower),
            idleMissingInput: this.countBuildingsInState(BuildingState.IdleMissingInput),
            constructedBuildings: this.constructedBuildings,
            disbandedShips: this.disbandedShips,
            researchedTechnologies: this.minResearchedTechnologies(),
            activeConstructions: this.countBuildingsInState(BuildingState.UnderConstruction),
            slotFillRatio: slots > 0 ? usedSlots / slots : 0,
            maxResourceZeroStreakDays: this.maxTrackedZeroStreak(),
            treasuryMin: Number.isFinite(this.treasuryMin) ? this.treasuryMin : 0
        };
    }
    jobBoard() {
        return this.jobs;
    }
    routePlanner() {
        return this.routes;
    }
    applyEvents(count) {
        for (let i = 0; i < count; i += 1) {
            const kind = this.eventBatch.kinds[i] ?? 0;
            const payload = this.eventBatch.payloadIndices[i] ?? 0;
            if (kind === EventKind.BatchComplete) {
                handleBatchComplete(this.data, this.world, this.queue, payload, this.tick);
                this.completedBatches += 1;
            }
            else if (kind === EventKind.ShipArrival) {
                if (handleShipArrival(this.data, this.world, this.queue, payload, this.tick, this.contracts)) {
                    this.deliveredShipments += 1;
                }
            }
            else if (kind === EventKind.ProductionRetry) {
                tryStartBatch(this.data, this.world, this.queue, payload, this.tick);
            }
            else if (kind === EventKind.ConstructionComplete) {
                completeConstruction(this.data, this.world, this.queue, payload, this.tick);
                this.constructedBuildings += 1;
            }
        }
    }
    refreshLogistics() {
        this.world.prices.recalculate(this.data, this.world.bodies, this.world.stockpiles, this.world.buildings);
        this.refreshContracts();
        this.jobs.update(this.data, this.world, this.routes, this.contracts);
        const before = this.missedDeparturesFuel;
        const result = assignIdleHaulers(this.data, this.world, this.jobs, this.routes, this.queue, this.tick);
        this.missedDeparturesFuel = before + result.failedFuel;
    }
    refreshContracts() {
        this.contracts.clear();
        for (let faction = 0; faction < this.world.factions.length; faction += 1) {
            let body = this.world.factions.firstColony[faction] ?? -1;
            while (body >= 0) {
                this.addShortageContracts(faction, body);
                body = this.world.bodies.nextInFaction[body] ?? -1;
            }
        }
    }
    addShortageContracts(faction, body) {
        for (let resource = 0; resource < this.data.resources.length; resource += 1) {
            const demand = this.world.prices.demand(body, resource);
            if (demand <= 0)
                continue;
            const stockpile = this.world.bodies.stockpile[body] ?? 0;
            const stock = this.world.stockpiles.get(stockpile, resource);
            const target = Math.max(30, demand * 30);
            if (stock >= target)
                continue;
            this.contracts.add({
                faction,
                targetBody: body,
                resource,
                creditsPerUnit: (this.data.baseValue[resource] ?? 1) * contractMultiplierForResource(this.data, resource)
            });
        }
    }
    scaleHaulers() {
        for (let faction = 0; faction < this.world.factions.length; faction += 1) {
            const idle = this.countIdleHaulersForFaction(faction);
            if (this.jobs.count <= idle * 5 + 8)
                continue;
            if ((this.world.factions.treasury[faction] ?? 0) < 600)
                continue;
            const capital = this.world.factions.capitalSystem[faction] ?? 0;
            this.world.addHauler(faction, capital, 1800, 180, 7);
        }
    }
    updateTreasuryMinimum() {
        for (let faction = 0; faction < this.world.factions.length; faction += 1) {
            this.treasuryMin = Math.min(this.treasuryMin, this.world.factions.treasury[faction] ?? 0);
        }
    }
    updateZeroStreaks() {
        for (let resource = 0; resource < this.data.resources.length; resource += 1) {
            if (!this.tracksZeroStreak(resource))
                continue;
            const total = this.totalOwnedStock(resource);
            if (total <= 0.001) {
                this.zeroStreakDays[resource] = Math.min(65535, (this.zeroStreakDays[resource] ?? 0) + 1);
                this.maxZeroStreakDays[resource] = Math.max(this.maxZeroStreakDays[resource] ?? 0, this.zeroStreakDays[resource] ?? 0);
            }
            else {
                this.zeroStreakDays[resource] = 0;
            }
        }
    }
    tracksZeroStreak(resource) {
        if ((this.data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
            this.data.populationNeeds.comfortOnly[resource] !== 1) {
            return true;
        }
        const id = this.data.resources[resource]?.id;
        return id === "fuel";
    }
    totalOwnedStock(resource) {
        let total = 0;
        for (let body = 0; body < this.world.bodies.length; body += 1) {
            if ((this.world.bodies.owner[body] ?? -1) < 0)
                continue;
            total += this.world.stockpiles.get(this.world.bodies.stockpile[body] ?? 0, resource);
        }
        return total;
    }
    countBuildingsInState(state) {
        let count = 0;
        for (let building = 0; building < this.world.buildings.length; building += 1) {
            if (this.world.buildings.state[building] === state)
                count += 1;
        }
        return count;
    }
    countIdleHaulers() {
        let count = 0;
        for (let ship = 0; ship < this.world.ships.length; ship += 1) {
            if (this.world.ships.role[ship] === ShipRole.Hauler &&
                this.world.ships.state[ship] === ShipState.Idle) {
                count += 1;
            }
        }
        return count;
    }
    countIdleHaulersForFaction(faction) {
        let count = 0;
        for (let ship = 0; ship < this.world.ships.length; ship += 1) {
            if (this.world.ships.faction[ship] === faction &&
                this.world.ships.role[ship] === ShipRole.Hauler &&
                this.world.ships.state[ship] === ShipState.Idle) {
                count += 1;
            }
        }
        return count;
    }
    minResearchedTechnologies() {
        let min = Number.POSITIVE_INFINITY;
        for (let faction = 0; faction < this.world.factions.length; faction += 1) {
            min = Math.min(min, this.world.factions.researchedCount[faction] ?? 0);
        }
        return Number.isFinite(min) ? min : 0;
    }
    maxTrackedZeroStreak() {
        let max = 0;
        for (let resource = 0; resource < this.maxZeroStreakDays.length; resource += 1) {
            if (this.tracksZeroStreak(resource))
                max = Math.max(max, this.maxZeroStreakDays[resource] ?? 0);
        }
        return max;
    }
}
function contractMultiplierForResource(data, resource) {
    if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
        data.populationNeeds.comfortOnly[resource] !== 1) {
        return 4;
    }
    return 0.75;
}
//# sourceMappingURL=stage-two.js.map