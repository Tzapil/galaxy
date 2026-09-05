import { EventKind } from "../events/kinds.js";
import { EventBatch, EventQueue } from "../events/queue.js";
import { InstrumentSubsystem } from "../instrument.js";
import { Rng } from "../rng.js";
import { readStateSnapshot } from "../snapshot/read.js";
import { hashState } from "../snapshot/hash.js";
import { writeStateSnapshot } from "../snapshot/write.js";
import { SoAArena } from "../soa/arena.js";
export class StageZeroSimulation {
    rootRng;
    eventRng;
    queue;
    probes;
    tick;
    eventBatch = new EventBatch(1024);
    constructor(rootRng, eventRng, queue, probes, tick) {
        this.rootRng = rootRng;
        this.eventRng = eventRng;
        this.queue = queue;
        this.probes = probes;
        this.tick = tick;
    }
    static create(seed) {
        const rootRng = Rng.fromSeed(seed);
        const eventRng = rootRng.derive("stage-zero-events");
        const queue = new EventQueue(1024);
        const probes = new SoAArena("stage_zero_probes", [
            { name: "mass", kind: "f64" },
            { name: "signal", kind: "u32" },
            { name: "owner", kind: "u16" }
        ], 32);
        const mass = probes.column("mass");
        const signal = probes.column("signal");
        const owner = probes.column("owner");
        for (let i = 0; i < 32; i += 1) {
            const row = probes.addRow();
            mass[row] = 100 + rootRng.nextInt(0, 10_000) / 100;
            signal[row] = rootRng.nextU32();
            owner[row] = rootRng.nextInt(0, 4);
        }
        for (let i = 0; i < 512; i += 1) {
            queue.schedule(eventRng.nextInt(1, 100_000), EventKind.BatchComplete, i % probes.length);
        }
        return new StageZeroSimulation(rootRng, eventRng, queue, probes, 0);
    }
    static fromSnapshot(buffer) {
        const restored = readStateSnapshot(buffer);
        const root = restored.rngStreams.find((stream) => stream.name === "root");
        const events = restored.rngStreams.find((stream) => stream.name === "events");
        const probes = restored.arenas.find((arena) => arena.name === "stage_zero_probes");
        if (root === undefined || events === undefined || probes === undefined) {
            throw new Error("Stage zero snapshot is missing required streams or arenas.");
        }
        return new StageZeroSimulation(Rng.deserialize(root.state), Rng.deserialize(events.state), EventQueue.deserialize(restored.eventQueueBuffer), SoAArena.fromSnapshot(probes), restored.tick);
    }
    step(instrumentation) {
        const totalStart = instrumentation?.begin(InstrumentSubsystem.Total) ?? 0;
        const continuousStart = instrumentation?.begin(InstrumentSubsystem.Continuous) ?? 0;
        this.applyContinuousTick();
        instrumentation?.end(InstrumentSubsystem.Continuous, continuousStart);
        const eventStart = instrumentation?.begin(InstrumentSubsystem.Events) ?? 0;
        const drained = this.queue.drainUntil(this.tick, this.eventBatch);
        this.applyEvents(drained);
        instrumentation?.end(InstrumentSubsystem.Events, eventStart);
        this.tick += 1;
        if (instrumentation?.enabled === true) {
            instrumentation.setEntityCounters({
                systems: 0,
                factions: 0,
                ships: 0,
                buildings: this.probes.length
            });
            const totalMs = instrumentation.end(InstrumentSubsystem.Total, totalStart);
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
            counters: { systems: 0, factions: 0, ships: 0, buildings: this.probes.length }
        };
    }
    snapshot() {
        return writeStateSnapshot(this.snapshotState());
    }
    hash() {
        return hashState(this.snapshotState());
    }
    snapshotState() {
        return {
            tick: this.tick,
            rngStreams: [
                { name: "root", state: this.rootRng.serialize() },
                { name: "events", state: this.eventRng.serialize() }
            ],
            eventQueue: this.queue,
            arenas: [this.probes.snapshot()]
        };
    }
    applyContinuousTick() {
        const mass = this.probes.column("mass");
        const signal = this.probes.column("signal");
        const owner = this.probes.column("owner");
        for (let i = 0; i < this.probes.length; i += 1) {
            const wave = ((signal[i] ?? 0) & 7) + 1;
            mass[i] = (mass[i] ?? 0) + wave * 0.001;
            signal[i] =
                (Math.imul(signal[i] ?? 0, 1664525) + 1013904223 + (owner[i] ?? 0) + this.tick) >>> 0;
        }
    }
    applyEvents(count) {
        const mass = this.probes.column("mass");
        const signal = this.probes.column("signal");
        for (let i = 0; i < count; i += 1) {
            const row = (this.eventBatch.payloadIndices[i] ?? 0) % this.probes.length;
            mass[row] = (mass[row] ?? 0) + (this.eventBatch.kinds[i] ?? 0) * 0.25;
            signal[row] = ((signal[row] ?? 0) ^ (this.eventBatch.sequenceIds[i] ?? 0)) >>> 0;
        }
    }
}
//# sourceMappingURL=stage-zero.js.map