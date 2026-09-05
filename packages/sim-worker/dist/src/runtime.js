import { Instrumentation, StageOneSimulation } from "@galaxy-sim/sim-core";
import { DEFAULT_RENDER_SLICES, buildRenderSnapshot } from "./snapshot-view.js";
const SNAPSHOT_INTERVAL_MS = 1000 / 30;
const STATS_INTERVAL_MS = 250;
export class StageOneWorkerRuntime {
    nowMs;
    simulation;
    instrumentation;
    instrumentationStartMs = 0;
    targetSpeed = 1;
    lastNonZeroSpeed = 1;
    running = false;
    tickCredit = 0;
    subscribedSlices = DEFAULT_RENDER_SLICES;
    lastSnapshotMs = Number.NEGATIVE_INFINITY;
    lastStatsMs = Number.NEGATIVE_INFINITY;
    lastActualSpeed = 0;
    lastTickMs = 0;
    constructor(options = {}) {
        this.nowMs = options.nowMs ?? (() => 0);
    }
    handle(command) {
        try {
            if (command.type === "init")
                return this.init(command.seed, command.params?.speed, command.params?.startPaused, command.params?.slices);
            if (command.type === "setSpeed")
                return this.setSpeed(command.multiplier);
            if (command.type === "pause")
                return this.pause();
            if (command.type === "resume")
                return this.resume();
            if (command.type === "subscribe")
                return this.subscribe(command.slices);
            if (command.type === "save")
                return this.save(command.slotId);
            if (command.type === "load")
                return this.load(command.slotId, command.buffer);
            return [this.error("Unknown worker command.")];
        }
        catch (error) {
            return [this.error(error instanceof Error ? error.message : "Unknown worker error.")];
        }
    }
    advanceElapsed(elapsedMs, maxTicks = Number.POSITIVE_INFINITY) {
        if (this.simulation === undefined || !this.running || this.targetSpeed === 0)
            return this.periodicMessages(0, Math.max(0, elapsedMs));
        const safeElapsed = Math.max(0, elapsedMs);
        this.tickCredit += (safeElapsed * this.targetSpeed) / 1000;
        const wantedTicks = Math.floor(this.tickCredit);
        const allowedTicks = Math.max(0, Math.min(wantedTicks, Math.floor(maxTicks)));
        const started = this.nowMs();
        for (let i = 0; i < allowedTicks; i += 1) {
            const tickStarted = this.nowMs();
            this.simulation.step(this.instrumentation);
            this.lastTickMs = this.nowMs() - tickStarted;
        }
        this.tickCredit -= allowedTicks;
        if (allowedTicks < wantedTicks)
            this.tickCredit = 0;
        this.lastActualSpeed = safeElapsed > 0 ? (allowedTicks / safeElapsed) * 1000 : 0;
        if (allowedTicks > 0 && this.lastTickMs <= 0) {
            this.lastTickMs = (this.nowMs() - started) / allowedTicks;
        }
        return this.periodicMessages(allowedTicks, safeElapsed);
    }
    advanceTicks(ticks) {
        if (this.simulation === undefined)
            throw new Error("Simulation is not initialized.");
        for (let i = 0; i < ticks; i += 1)
            this.simulation.step(this.instrumentation);
    }
    get tick() {
        return this.simulation?.tick ?? 0;
    }
    hash() {
        if (this.simulation === undefined)
            throw new Error("Simulation is not initialized.");
        return this.simulation.hash();
    }
    fullSnapshot() {
        if (this.simulation === undefined)
            throw new Error("Simulation is not initialized.");
        return this.simulation.snapshot();
    }
    init(seed, speed, startPaused, slices) {
        this.simulation = StageOneSimulation.create(seed);
        this.targetSpeed = speed ?? 1;
        if (this.targetSpeed !== 0)
            this.lastNonZeroSpeed = this.targetSpeed;
        this.running = startPaused === true ? false : this.targetSpeed !== 0;
        this.tickCredit = 0;
        this.subscribedSlices = slices ?? DEFAULT_RENDER_SLICES;
        this.instrumentationStartMs = this.nowMs();
        this.instrumentation = new Instrumentation({
            enabled: true,
            targetTicksPerSecond: this.targetSpeed,
            historyCapacity: 256,
            nowMs: this.nowMs
        });
        this.lastSnapshotMs = Number.NEGATIVE_INFINITY;
        this.lastStatsMs = Number.NEGATIVE_INFINITY;
        return [
            {
                channel: "control",
                type: "ready",
                tick: this.simulation.tick,
                hash: this.simulation.hash()
            },
            this.snapshotMessage(),
            this.statsMessage()
        ];
    }
    setSpeed(multiplier) {
        this.requireSimulation();
        this.targetSpeed = multiplier;
        if (multiplier !== 0)
            this.lastNonZeroSpeed = multiplier;
        this.running = multiplier !== 0;
        this.tickCredit = 0;
        this.resetInstrumentation();
        return [this.statsMessage()];
    }
    pause() {
        this.requireSimulation();
        this.running = false;
        this.tickCredit = 0;
        return [this.statsMessage()];
    }
    resume() {
        this.requireSimulation();
        if (this.targetSpeed === 0)
            this.targetSpeed = this.lastNonZeroSpeed;
        this.running = true;
        this.resetInstrumentation();
        return [this.statsMessage()];
    }
    subscribe(slices) {
        this.requireSimulation();
        this.subscribedSlices = slices;
        return [this.snapshotMessage()];
    }
    save(slotId) {
        const simulation = this.requireSimulation();
        const buffer = simulation.snapshot();
        return [{ channel: "control", type: "saved", slotId, tick: simulation.tick, buffer }];
    }
    load(slotId, buffer) {
        if (buffer === undefined)
            return [this.error("Load command requires a snapshot buffer.")];
        this.simulation = StageOneSimulation.fromSnapshot(buffer);
        this.tickCredit = 0;
        this.resetInstrumentation();
        return [
            {
                channel: "control",
                type: "loaded",
                slotId,
                tick: this.simulation.tick,
                hash: this.simulation.hash()
            },
            this.snapshotMessage(),
            this.statsMessage()
        ];
    }
    periodicMessages(_ticksAdvanced, elapsedMs) {
        const messages = [];
        const now = this.nowMs();
        if (this.simulation !== undefined && now - this.lastSnapshotMs >= SNAPSHOT_INTERVAL_MS - 0.5) {
            messages.push(this.snapshotMessage());
        }
        if (this.simulation !== undefined && now - this.lastStatsMs >= STATS_INTERVAL_MS) {
            if (elapsedMs <= 0)
                this.lastActualSpeed = 0;
            messages.push(this.statsMessage());
        }
        return messages;
    }
    snapshotMessage() {
        const simulation = this.requireSimulation();
        const buffer = buildRenderSnapshot(simulation, this.subscribedSlices);
        this.lastSnapshotMs = this.nowMs();
        return {
            channel: "snapshot",
            type: "snapshot",
            tick: simulation.tick,
            slices: this.subscribedSlices,
            buffer
        };
    }
    statsMessage() {
        const simulation = this.requireSimulation();
        this.lastStatsMs = this.nowMs();
        return {
            channel: "stats",
            type: "stats",
            stats: this.statsFromSummary(this.instrumentation?.summary(this.nowMs() - this.instrumentationStartMs)),
            metrics: simulation.metrics()
        };
    }
    statsFromSummary(summary) {
        const simulation = this.requireSimulation();
        return {
            tick: simulation.tick,
            targetSpeed: this.running ? this.targetSpeed : 0,
            actualSpeed: this.running ? this.lastActualSpeed : 0,
            tickMs: this.lastTickMs,
            subsystemMs: summary?.subsystemMs ?? [],
            counters: summary?.counters ??
                {
                    systems: simulation.world.systems.length,
                    factions: simulation.world.factions.length,
                    ships: simulation.world.ships.length,
                    buildings: simulation.world.buildings.length
                }
        };
    }
    resetInstrumentation() {
        this.instrumentationStartMs = this.nowMs();
        this.instrumentation = new Instrumentation({
            enabled: true,
            targetTicksPerSecond: this.targetSpeed,
            historyCapacity: 256,
            nowMs: this.nowMs
        });
        this.lastActualSpeed = 0;
        this.lastTickMs = 0;
        this.lastStatsMs = Number.NEGATIVE_INFINITY;
    }
    requireSimulation() {
        if (this.simulation === undefined)
            throw new Error("Simulation is not initialized.");
        return this.simulation;
    }
    error(message) {
        return { channel: "control", type: "error", message };
    }
}
//# sourceMappingURL=runtime.js.map