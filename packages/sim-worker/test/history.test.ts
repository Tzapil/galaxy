import { describe, expect, it } from "vitest";

import { HistoryAccumulator, type HistorySample } from "../src/history.js";

function sample(tick: number, price = 1): HistorySample {
  return {
    tick,
    prices: new Float64Array([price]),
    production: new Float64Array([2]),
    consumption: new Float64Array([1]),
    factionPower: new Float64Array([10, 5]),
    population: 100,
    systems: 20,
    liveFactions: 2,
    powerConcentration: 0.625
  };
}

describe("worker history", () => {
  it("retains extrema while moving daily samples into coarser buckets", () => {
    const history = new HistoryAccumulator();
    for (let tick = 0; tick < 400; tick += 1) {
      history.record(sample(tick, tick === 10 ? 999 : 1));
    }

    const payload = history.query({
      id: 1,
      series: [{ metric: "price", resource: 0 }]
    });
    expect(payload.series[0]?.values).toContain(999);

    const restored = HistoryAccumulator.deserialize(history.serialize());
    expect(restored.query({ id: 1, series: [{ metric: "price", resource: 0 }] })).toEqual(payload);
  });

  it("keeps ten millennia bounded and returns only requested columns", () => {
    const history = new HistoryAccumulator();
    const prices = new Float64Array(37);
    const production = new Float64Array(37);
    const consumption = new Float64Array(37);
    const factionPower = new Float64Array(8);
    for (let year = 0; year < 10_000; year += 1) {
      prices[0] = year;
      history.record({
        tick: year * 365,
        prices,
        production,
        consumption,
        factionPower,
        population: 100,
        systems: 500,
        liveFactions: 8,
        powerConcentration: 0.125
      });
    }

    const payload = history.query({
      id: 2,
      horizonTicks: 3_650_000,
      series: [{ metric: "population", label: "Population" }]
    });
    expect(history.pointCount).toBeLessThanOrEqual(10_001);
    expect(history.estimatedBytes()).toBeLessThan(35_000_000);
    expect(payload.series).toHaveLength(1);
    expect(payload.series[0]?.label).toBe("Population");
    expect(payload.ticks.length).toBe(payload.series[0]?.values.length);
  });
});
