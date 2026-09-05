import { describe, expect, it } from "vitest";

import { Rng } from "../src/rng.js";

describe("Rng", () => {
  it("replays one million values from the same seed", () => {
    const a = Rng.fromSeed(20260904);
    const b = Rng.fromSeed(20260904);
    let firstMismatch = -1;

    for (let i = 0; i < 1_000_000; i += 1) {
      if (a.nextU32() !== b.nextU32()) {
        firstMismatch = i;
        break;
      }
    }

    expect(firstMismatch).toBe(-1);
  });

  it("derives independent reproducible streams", () => {
    const rootA = Rng.fromSeed(7);
    const rootB = Rng.fromSeed(7);
    const a1 = rootA.derive("a");
    const a2 = rootB.derive("a");
    const b = rootA.derive("b");

    expect(a1.nextU32()).toBe(a2.nextU32());
    expect(a1.nextU32()).not.toBe(b.nextU32());
  });

  it("continues bit-for-bit after serialize and deserialize", () => {
    const continuous = Rng.fromSeed(42);
    const restoredSource = Rng.fromSeed(42);
    for (let i = 0; i < 1000; i += 1) {
      continuous.nextU32();
      restoredSource.nextU32();
    }

    const restored = Rng.deserialize(restoredSource.serialize());
    for (let i = 0; i < 10_000; i += 1) {
      expect(restored.nextU32()).toBe(continuous.nextU32());
    }
  });
});
