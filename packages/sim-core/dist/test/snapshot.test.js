import { describe, expect, it } from "vitest";
import { Instrumentation } from "../src/instrument.js";
import { compactJournalEntries } from "../src/persist/port.js";
import { readStateSnapshot } from "../src/snapshot/read.js";
import { SNAPSHOT_VERSION } from "../src/snapshot/write.js";
import { StageZeroSimulation } from "../src/simulation/stage-zero.js";
describe("snapshots and hashes", () => {
    it("round-trips stage-zero state with the same hash", () => {
        const sim = StageZeroSimulation.create(20260904);
        sim.run(1000);
        const restored = StageZeroSimulation.fromSnapshot(sim.snapshot());
        expect(restored.hash()).toBe(sim.hash());
    });
    it("matches continuous run after restoring from a midpoint snapshot", () => {
        const continuous = StageZeroSimulation.create(77);
        continuous.run(2000);
        const restoredSource = StageZeroSimulation.create(77);
        restoredSource.run(1000);
        const restored = StageZeroSimulation.fromSnapshot(restoredSource.snapshot());
        restored.run(1000);
        expect(restored.hash()).toBe(continuous.hash());
    });
    it("rejects an unsupported snapshot version with a clear error", () => {
        const sim = StageZeroSimulation.create(1);
        const buffer = sim.snapshot();
        new DataView(buffer).setUint32(4, SNAPSHOT_VERSION + 1, true);
        expect(() => readStateSnapshot(buffer)).toThrow(/Unsupported galaxy-sim snapshot version/);
    });
    it("compacts routine journal entries but keeps milestones", () => {
        const compacted = compactJournalEntries([
            { tick: 10, kind: "routine", milestone: false, payload: "a" },
            { tick: 20, kind: "battle", milestone: true, payload: "b" },
            { tick: 200, kind: "routine", milestone: false, payload: "c" }
        ], 100);
        expect(compacted.map((entry) => entry.payload)).toEqual(["b", "c"]);
    });
    it("keeps the same hash with instrumentation enabled and disabled", () => {
        const withoutInstrumentation = StageZeroSimulation.create(55);
        withoutInstrumentation.run(10_000);
        let now = 0;
        const instrumentation = new Instrumentation({
            enabled: true,
            targetTicksPerSecond: 1000,
            historyCapacity: 128,
            nowMs: () => {
                now += 0.01;
                return now;
            }
        });
        const withInstrumentation = StageZeroSimulation.create(55);
        withInstrumentation.run(10_000, 0, instrumentation);
        expect(withInstrumentation.hash()).toBe(withoutInstrumentation.hash());
    });
});
//# sourceMappingURL=snapshot.test.js.map