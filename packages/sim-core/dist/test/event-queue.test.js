import { describe, expect, it } from "vitest";
import { EventKind } from "../src/events/kinds.js";
import { EventBatch, EventQueue } from "../src/events/queue.js";
import { Rng } from "../src/rng.js";
describe("EventQueue", () => {
    it("drains 100000 events in strict (tick, sequenceId) order", () => {
        const queue = new EventQueue(16);
        const rng = Rng.fromSeed(123);
        for (let i = 0; i < 100_000; i += 1) {
            queue.schedule(rng.nextInt(0, 5000), EventKind.BatchComplete, i);
        }
        const out = new EventBatch(100_000);
        queue.drainUntil(5000, out);
        for (let i = 1; i < out.count; i += 1) {
            const prevTick = out.ticks[i - 1] ?? 0;
            const tick = out.ticks[i] ?? 0;
            const prevSeq = out.sequenceIds[i - 1] ?? 0;
            const seq = out.sequenceIds[i] ?? 0;
            expect(tick > prevTick || (tick === prevTick && seq > prevSeq)).toBe(true);
        }
    });
    it("is reproducible for the same seed", () => {
        expect(drainSignature(987)).toBe(drainSignature(987));
    });
    it("keeps same-tick events in sequence order", () => {
        const queue = new EventQueue(4);
        queue.schedule(10, EventKind.BatchComplete, 1);
        queue.schedule(10, EventKind.ShipArrival, 2);
        queue.schedule(10, EventKind.ResearchComplete, 3);
        const out = new EventBatch(3);
        queue.drainUntil(10, out);
        expect(Array.from(out.sequenceIds.slice(0, out.count))).toEqual([0, 1, 2]);
        expect(Array.from(out.payloadIndices.slice(0, out.count))).toEqual([1, 2, 3]);
    });
    it("does not return cancelled events", () => {
        const queue = new EventQueue(4);
        queue.schedule(1, EventKind.BatchComplete, 1);
        const cancelled = queue.schedule(1, EventKind.BatchComplete, 2);
        queue.schedule(1, EventKind.BatchComplete, 3);
        expect(queue.cancel(cancelled)).toBe(true);
        const out = new EventBatch(3);
        queue.drainUntil(1, out);
        expect(Array.from(out.payloadIndices.slice(0, out.count))).toEqual([1, 3]);
    });
    it("round-trips through binary serialization", () => {
        const queue = new EventQueue(4);
        queue.schedule(5, EventKind.BatchComplete, 1);
        queue.schedule(2, EventKind.ResearchComplete, 2);
        queue.schedule(5, EventKind.ShipArrival, 3);
        const restored = EventQueue.deserialize(queue.serialize());
        const out = new EventBatch(3);
        restored.drainUntil(10, out);
        expect(Array.from(out.ticks.slice(0, out.count))).toEqual([2, 5, 5]);
        expect(Array.from(out.payloadIndices.slice(0, out.count))).toEqual([2, 1, 3]);
    });
});
function drainSignature(seed) {
    const queue = new EventQueue(16);
    const rng = Rng.fromSeed(seed);
    for (let i = 0; i < 2000; i += 1) {
        queue.schedule(rng.nextInt(0, 100), EventKind.BatchComplete, i);
    }
    const out = new EventBatch(2000);
    queue.drainUntil(100, out);
    let signature = "";
    for (let i = 0; i < out.count; i += 1) {
        signature += `${out.ticks[i] ?? 0}:${out.sequenceIds[i] ?? 0}:${out.payloadIndices[i] ?? 0};`;
    }
    return signature;
}
//# sourceMappingURL=event-queue.test.js.map