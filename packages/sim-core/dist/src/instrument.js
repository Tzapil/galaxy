export var InstrumentSubsystem;
(function (InstrumentSubsystem) {
    InstrumentSubsystem[InstrumentSubsystem["Continuous"] = 0] = "Continuous";
    InstrumentSubsystem[InstrumentSubsystem["Events"] = 1] = "Events";
    InstrumentSubsystem[InstrumentSubsystem["Snapshot"] = 2] = "Snapshot";
    InstrumentSubsystem[InstrumentSubsystem["AiStrategic"] = 3] = "AiStrategic";
    InstrumentSubsystem[InstrumentSubsystem["AiOperational"] = 4] = "AiOperational";
    InstrumentSubsystem[InstrumentSubsystem["AiTactical"] = 5] = "AiTactical";
    InstrumentSubsystem[InstrumentSubsystem["Total"] = 6] = "Total";
})(InstrumentSubsystem || (InstrumentSubsystem = {}));
export const INSTRUMENT_SUBSYSTEM_COUNT = 7;
export class Instrumentation {
    options;
    subsystemMs;
    tickHistory;
    historyCursor = 0;
    historyCount = 0;
    totalTicks = 0;
    counters = { systems: 0, factions: 0, ships: 0, buildings: 0 };
    constructor(options) {
        this.options = options;
        const historyCapacity = options.enabled ? (options.historyCapacity ?? 60_000) : 0;
        this.subsystemMs = new Float64Array(options.enabled ? INSTRUMENT_SUBSYSTEM_COUNT : 0);
        this.tickHistory = new Float64Array(historyCapacity);
    }
    get enabled() {
        return this.options.enabled;
    }
    begin(_subsystem) {
        if (!this.options.enabled)
            return 0;
        return this.options.nowMs();
    }
    end(subsystem, startedAt) {
        if (!this.options.enabled)
            return 0;
        const duration = this.options.nowMs() - startedAt;
        this.subsystemMs[subsystem] = (this.subsystemMs[subsystem] ?? 0) + duration;
        return duration;
    }
    recordTick(durationMs) {
        if (!this.options.enabled || this.tickHistory.length === 0)
            return;
        this.tickHistory[this.historyCursor] = durationMs;
        this.historyCursor = (this.historyCursor + 1) % this.tickHistory.length;
        this.historyCount = Math.min(this.historyCount + 1, this.tickHistory.length);
        this.totalTicks += 1;
    }
    setEntityCounters(counters) {
        if (!this.options.enabled)
            return;
        this.counters = counters;
    }
    summary(elapsedMs) {
        if (!this.options.enabled) {
            return {
                enabled: false,
                targetTicksPerSecond: this.options.targetTicksPerSecond,
                actualTicksPerSecond: 0,
                subsystemMs: [],
                tickMsHistory: [],
                counters: this.counters
            };
        }
        const history = [];
        for (let i = 0; i < this.historyCount; i += 1) {
            const index = (this.historyCursor - this.historyCount + i + this.tickHistory.length) %
                this.tickHistory.length;
            history.push(this.tickHistory[index] ?? 0);
        }
        return {
            enabled: true,
            targetTicksPerSecond: this.options.targetTicksPerSecond,
            actualTicksPerSecond: elapsedMs > 0 ? (this.totalTicks / elapsedMs) * 1000 : 0,
            subsystemMs: Array.from(this.subsystemMs),
            tickMsHistory: history,
            counters: this.counters
        };
    }
}
//# sourceMappingURL=instrument.js.map