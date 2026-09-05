import { describe, expect, it } from "vitest";

import { decodeRenderSnapshot } from "../src/index.js";
import type { WorkerCommand, WorkerMessage } from "../src/protocol.js";
import { StageOneWorkerRuntime } from "../src/runtime.js";

describe("worker protocol", () => {
  it("has typed command and response messages", () => {
    const command: WorkerCommand = { type: "init", seed: 20260904 };
    const message: WorkerMessage = {
      channel: "control",
      type: "ready",
      tick: 0,
      hash: "hash"
    };

    expect(command.type).toBe("init");
    expect(message.type).toBe("ready");
  });

  it("reaches the same hash at the same tick for x1 and x1000", () => {
    const slow = new StageOneWorkerRuntime();
    slow.handle({ type: "init", seed: 42, params: { speed: 1 } });
    slow.advanceTicks(1000);

    const fast = new StageOneWorkerRuntime();
    fast.handle({ type: "init", seed: 42, params: { speed: 1000 } });
    fast.advanceTicks(1000);

    expect(fast.tick).toBe(slow.tick);
    expect(fast.hash()).toBe(slow.hash());
  });

  it("pause stops elapsed-time advancement without mutating state", () => {
    let now = 0;
    const runtime = new StageOneWorkerRuntime({ nowMs: () => now });
    runtime.handle({ type: "init", seed: 7 });
    runtime.advanceTicks(10);
    const hash = runtime.hash();
    runtime.handle({ type: "pause" });
    now += 1000;
    runtime.advanceElapsed(1000);

    expect(runtime.tick).toBe(10);
    expect(runtime.hash()).toBe(hash);
  });

  it("emits render snapshots near 30 Hz regardless of tick speed", () => {
    let now = 0;
    const runtime = new StageOneWorkerRuntime({ nowMs: () => now });
    runtime.handle({ type: "init", seed: 9, params: { speed: 1000 } });
    let snapshots = 0;

    for (let frame = 0; frame < 60; frame += 1) {
      now += 1000 / 60;
      const messages = runtime.advanceElapsed(1000 / 60);
      snapshots += messages.filter((message) => message.type === "snapshot").length;
    }

    expect(snapshots).toBeGreaterThanOrEqual(25);
    expect(snapshots).toBeLessThanOrEqual(35);
  });

  it("degrades by slowing game time instead of skipping ticks", () => {
    let now = 0;
    const runtime = new StageOneWorkerRuntime({ nowMs: () => now });
    runtime.handle({ type: "init", seed: 11, params: { speed: 1000 } });
    now += 1000;

    const messages = runtime.advanceElapsed(1000, 100);
    const stats = messages.find((message) => message.type === "stats");

    expect(runtime.tick).toBe(100);
    expect(stats?.type).toBe("stats");
    if (stats?.type === "stats") expect(stats.stats.actualSpeed).toBeCloseTo(100);
  });

  it("save and load restore a transferable snapshot buffer", () => {
    const first = new StageOneWorkerRuntime();
    first.handle({ type: "init", seed: 13 });
    first.advanceTicks(250);
    const saved = first
      .handle({ type: "save", slotId: "a" })
      .find((message) => message.type === "saved");
    if (saved?.type !== "saved") throw new Error("Runtime did not return a save buffer.");

    const second = new StageOneWorkerRuntime();
    second.handle({ type: "init", seed: 1 });
    second.handle({ type: "load", slotId: "a", buffer: saved.buffer });

    expect(second.tick).toBe(first.tick);
    expect(second.hash()).toBe(first.hash());
  });

  it("render snapshots are flat ArrayBuffers honoring slice subscriptions", () => {
    const runtime = new StageOneWorkerRuntime();
    runtime.handle({ type: "init", seed: 14 });
    const snapshot = runtime
      .handle({ type: "subscribe", slices: 1 })
      .find((message) => message.type === "snapshot");
    if (snapshot?.type !== "snapshot") throw new Error("Runtime did not return a render snapshot.");

    const decoded = decodeRenderSnapshot(snapshot.buffer);
    expect(snapshot.buffer).toBeInstanceOf(ArrayBuffer);
    expect(decoded.systems).toHaveLength(20);
    expect(decoded.colonies).toHaveLength(0);
  });
});
