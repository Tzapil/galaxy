import { describe, expect, it } from "vitest";

import {
  StageOneLogKind,
  StoryEventKind,
  calculateStoryImportance,
  compactStoryEvents,
  storyImportanceBand,
  storyKindForLog
} from "../src/index.js";

describe("story events", () => {
  it("maps every required observer story from the simulation log", () => {
    expect(storyKindForLog(StageOneLogKind.WarDeclared)).toBe(StoryEventKind.WarDeclared);
    expect(storyKindForLog(StageOneLogKind.BattleStarted)).toBe(StoryEventKind.BattleStarted);
    expect(storyKindForLog(StageOneLogKind.AiColonization)).toBe(StoryEventKind.ColonyFounded);
    expect(storyKindForLog(StageOneLogKind.BlockadeEnded)).toBe(StoryEventKind.BlockadeFallen);
    expect(storyKindForLog(StageOneLogKind.PopulationWarning)).toBe(StoryEventKind.Famine);
    expect(storyKindForLog(StageOneLogKind.ResearchCompleted)).toBe(
      StoryEventKind.ResearchCompleted
    );
    expect(storyKindForLog(StageOneLogKind.ShipyardBuildComplete, 4, true)).toBe(
      StoryEventKind.FirstMarkFourLaunched
    );
    expect(storyKindForLog(StageOneLogKind.Secession)).toBe(StoryEventKind.RegionSeceded);
    expect(storyKindForLog(StageOneLogKind.AiStrategicGoal)).toBe(StoryEventKind.AiDecision);
  });

  it("computes monotonic importance from consequences", () => {
    const routine = calculateStoryImportance({
      systemsAffected: 0,
      productionValue: 1,
      shipsAffected: 0
    });
    const major = calculateStoryImportance({
      systemsAffected: 4,
      productionValue: 50_000,
      shipsAffected: 20
    });
    expect(major).toBeGreaterThan(routine);
    expect(storyImportanceBand(major)).not.toBe("routine");
  });

  it("preserves computed milestones while compacting routine centuries", () => {
    const events = Array.from({ length: 10 }, (_, serial) => ({
      serial,
      tick: serial * 20_000,
      storyKind: StoryEventKind.Economy,
      importance: serial === 2 ? 80 : 5
    }));
    const compacted = compactStoryEvents(events, 2);

    expect(compacted.some((event) => "serial" in event && event.serial === 2)).toBe(true);
    expect(compacted.some((event) => "kind" in event && event.kind === "century-summary")).toBe(
      true
    );
    expect(compacted.filter((event) => "serial" in event && event.importance < 55)).toHaveLength(2);
  });
});
