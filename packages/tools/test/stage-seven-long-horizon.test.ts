import { beforeAll, describe, expect, it } from "vitest";
import type { StageOneData } from "@galaxy-sim/sim-core";

import { detectPathologies } from "../src/pathology.js";
import { runStageSevenCampaign } from "../src/stage-seven-bench.js";
import { loadStageTwoData } from "../src/stage-two-loader.js";

describe("Stage 7.7 ten-thousand-year gate", () => {
  let data: StageOneData;

  beforeAll(async () => {
    data = await loadStageTwoData();
  });

  it("runs 10,000 years with oscillating factions, no early hegemon, and bounded state", () => {
    const report = runStageSevenCampaign(20260904, 10_000, data);
    const metrics = report.metrics;
    expect(report.ticks).toBe(3_650_000);
    expect(metrics.aliveFactionsMin).toBeGreaterThanOrEqual(2);
    expect(metrics.aliveFactionDistinctCounts).toBeGreaterThan(2);
    expect(metrics.secessionCount).toBeGreaterThan(0);
    expect(metrics.warCount).toBeGreaterThan(0);
    expect(metrics.medianFactionAgeYears).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.medianFactionAgeYears)).toBe(true);
    expect(metrics.earlyConcentrationMax).toBeLessThan(0.35);
    expect(metrics.lateHegemonyReached).toBe(true);
    expect(metrics.retainedStateStabilized).toBe(true);
    expect(metrics.maxEventLogEntries).toBeLessThanOrEqual(4096);
    expect(metrics.actualTicksPerSecond).toBeGreaterThan(1_000);
    expect(metrics.epochMetrics).toHaveLength(21);
    expect(metrics.epochMetrics.at(-1)?.year).toBe(10_000);
    expect(
      detectPathologies({ seed: 20260904, tick: report.ticks, stage: 7, metrics }).filter(
        (finding) => finding.status === "failed"
      )
    ).toHaveLength(0);
  });

  it("is deterministic and keeps every reported accumulator finite", () => {
    const left = runStageSevenCampaign(77, 1_000, data);
    const right = runStageSevenCampaign(77, 1_000, data);
    expect(left.finalHash).toBe(right.finalHash);
    for (const epoch of left.metrics.epochMetrics) {
      expect(Object.values(epoch).every(Number.isFinite)).toBe(true);
    }
  });
});
