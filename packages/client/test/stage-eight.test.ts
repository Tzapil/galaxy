import {
  BuildingState,
  StageOneLogKind,
  StoryEventKind,
  type RenderEvent,
  type RenderSystem
} from "@galaxy-sim/sim-core";
import { describe, expect, it } from "vitest";

import { filterEvents, mergeEventBatches, visibleWindow } from "../src/feed/model.js";
import { colorForSystem, valueForMode } from "../src/map/colorModes.js";
import {
  DEFAULT_NEW_GAME,
  NEW_GAME_PRESETS,
  previewPoints,
  toWorkerInit,
  validateNewGame
} from "../src/newgame/model.js";
import { GameSaveRepository, SaveQuotaError, type SaveStorage } from "../src/persist/repository.js";
import { decodeSaveFile, encodeSaveFile } from "../src/persist/save-format.js";
import { buildingStateText } from "../src/system/SystemView.js";

function event(serial: number, milestone = false): RenderEvent {
  return {
    serial,
    tick: serial * 365,
    kind: milestone ? StageOneLogKind.WarDeclared : StageOneLogKind.BatchComplete,
    storyKind: milestone ? StoryEventKind.WarDeclared : StoryEventKind.Economy,
    importance: milestone ? 70 : 5,
    milestone,
    faction: serial % 2,
    system: serial,
    body: -1,
    subject: -1,
    resource: 0,
    amount: 1,
    impact: { systemsAffected: 1, productionValue: 1, shipsAffected: 0 }
  };
}

class MemoryStorage implements SaveStorage {
  private readonly values = new Map<string, unknown>();
  public quota = false;

  public async put(
    store: "snapshots" | "journal" | "metadata",
    key: string,
    value: unknown
  ): Promise<void> {
    if (this.quota) throw new DOMException("full", "QuotaExceededError");
    this.values.set(`${store}:${key}`, value);
  }

  public async get<T>(
    store: "snapshots" | "journal" | "metadata",
    key: string
  ): Promise<T | undefined> {
    return this.values.get(`${store}:${key}`) as T | undefined;
  }

  public async delete(store: "snapshots" | "journal" | "metadata", key: string): Promise<void> {
    this.values.delete(`${store}:${key}`);
  }

  public async keys(): Promise<readonly string[]> {
    return [...this.values.keys()]
      .filter((key) => key.startsWith("metadata:"))
      .map((key) => key.slice("metadata:".length));
  }
}

describe("stage eight observer models", () => {
  it("colors all numeric map layers from snapshot values", () => {
    const system: RenderSystem = {
      id: 1,
      x: 0,
      y: 0,
      owner: 2,
      region: 1,
      wealth: 75,
      traffic: 9,
      tension: 0.8,
      flags: 0,
      deficits: [0.1, 0.7]
    };
    expect(valueForMode(system, "wealth", 0)).toBe(75);
    expect(valueForMode(system, "deficit", 1)).toBeCloseTo(0.7);
    expect(valueForMode(system, "traffic", 0)).toBe(9);
    expect(valueForMode(system, "tension", 0)).toBeCloseTo(0.8);
    expect(colorForSystem(system, { mode: "ownership", resource: 0, maximum: 1 })).not.toBe(0);
  });

  it("evaluates every color layer for 2,000 systems within one 30 fps frame budget", () => {
    const systems = Array.from({ length: 2000 }, (_, id): RenderSystem => ({
      id,
      x: id,
      y: -id,
      owner: id % 16,
      region: id % 8,
      wealth: id * 3,
      traffic: id % 70,
      tension: (id % 100) / 100,
      flags: 0,
      deficits: [0.1, (id % 10) / 10]
    }));
    const started = performance.now();
    for (const mode of ["ownership", "wealth", "deficit", "traffic", "tension"] as const) {
      for (const system of systems) {
        colorForSystem(system, { mode, resource: 1, maximum: 6000 });
      }
    }
    expect(performance.now() - started).toBeLessThan(33);
  });

  it("batches, filters and virtualizes a long event stream without losing milestones", () => {
    const merged = mergeEventBatches(
      Array.from({ length: 100 }, (_, index) => event(index, index === 3)),
      [event(100)],
      10
    );
    expect(merged.some((item) => item.serial === 3)).toBe(true);
    expect(merged).toHaveLength(11);
    expect(
      filterEvents(merged, { faction: 0, kind: 0, minimumImportance: 0, query: "produced" }).length
    ).toBeGreaterThan(0);
    expect(visibleWindow(100_000, 7600, 760, 76)).toEqual({ start: 95, end: 115 });
  });

  it("round-trips full binary saves and reports exhausted quota", async () => {
    const storage = new MemoryStorage();
    const repository = new GameSaveRepository(storage);
    const snapshot = new Uint8Array([1, 2, 3, 4]).buffer;
    await repository.save({
      id: "a",
      name: "Test",
      tick: 730,
      hash: "abc",
      snapshot,
      journal: [],
      technicalLimits: { maxShips: 20_000, maxBuildings: 50_000 }
    });
    const loaded = await new GameSaveRepository(storage).load("a");
    expect(new Uint8Array(loaded?.snapshot ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(snapshot)
    );
    const decoded = decodeSaveFile(encodeSaveFile(loaded!));
    expect(decoded.metadata.hash).toBe("abc");
    expect(decoded.metadata.technicalLimits).toEqual({
      maxShips: 20_000,
      maxBuildings: 50_000
    });
    expect(new Uint8Array(decoded.snapshot)).toEqual(new Uint8Array(snapshot));

    const incompatible = encodeSaveFile(loaded!);
    new DataView(incompatible).setUint32(4, 999, true);
    expect(() => decodeSaveFile(incompatible)).toThrow(/incompatible/);

    storage.quota = true;
    await expect(
      repository.save({ id: "b", name: "Full", tick: 0, hash: "x", snapshot, journal: [] })
    ).rejects.toBeInstanceOf(SaveQuotaError);
  });

  it("validates presets, deterministic previews and unlimited technical limits", () => {
    for (const preset of NEW_GAME_PRESETS) expect(validateNewGame(preset.config)).toEqual([]);
    expect(previewPoints(DEFAULT_NEW_GAME)).toEqual(previewPoints(DEFAULT_NEW_GAME));
    expect(
      validateNewGame({ ...DEFAULT_NEW_GAME, systemCount: 20, factionMinJumps: 50 })
    ).not.toEqual([]);
    expect(
      toWorkerInit({ ...DEFAULT_NEW_GAME, unlimitedShips: true }).technicalLimits?.maxShips
    ).toBeUndefined();
  });

  it("renders causal building states instead of utilization percentages", () => {
    const base = {
      id: 1,
      type: 0,
      stateResource: 0,
      remainingTicks: 12,
      assignedWorkers: 0,
      requiredWorkers: 10
    };
    expect(buildingStateText({ ...base, state: BuildingState.UnderConstruction }, 0)).toContain(
      "12"
    );
    expect(buildingStateText({ ...base, state: BuildingState.IdleMissingInput }, 0)).toContain(
      "no"
    );
    expect(buildingStateText({ ...base, state: BuildingState.IdleNoWorkers }, 0)).toContain(
      "workers"
    );
    expect(buildingStateText({ ...base, state: BuildingState.IdleNoPower }, 0)).toContain("power");
  });
});
