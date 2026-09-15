import { StageOneLogKind } from "./log.js";

/** Narrative categories exposed to the observer UI (spec 12.2). */
export const enum StoryEventKind {
  Economy = 1,
  WarDeclared = 2,
  BattleStarted = 3,
  BattleEnded = 4,
  ColonyFounded = 5,
  BlockadeFallen = 6,
  Famine = 7,
  ResearchCompleted = 8,
  ShipLaunched = 9,
  FirstMarkFourLaunched = 10,
  RegionSeceded = 11,
  Diplomacy = 12,
  AiDecision = 13
}

export type StoryImportanceBand = "routine" | "notable" | "major" | "historic";

export interface StoryImpact {
  readonly systemsAffected: number;
  readonly productionValue: number;
  readonly shipsAffected: number;
}

export interface CompactableStoryEvent {
  readonly serial: number;
  readonly tick: number;
  readonly storyKind: StoryEventKind;
  readonly importance: number;
}

export interface StoryCenturySummary {
  readonly kind: "century-summary";
  readonly century: number;
  readonly tick: number;
  readonly count: number;
  readonly peakImportance: number;
}

/**
 * Importance is derived only from consequence scale, never supplied by callers.
 * The saturating curve keeps a single large input from hiding the other dimensions.
 */
export function calculateStoryImportance(impact: StoryImpact): number {
  const systems = Math.sqrt(nonNegative(impact.systemsAffected)) * 0.46;
  const production = Math.log1p(nonNegative(impact.productionValue)) * 0.075;
  const ships = Math.sqrt(nonNegative(impact.shipsAffected)) * 0.22;
  return Math.round(100 * (1 - Math.exp(-(systems + production + ships))));
}

export function storyImportanceBand(importance: number): StoryImportanceBand {
  if (importance >= 80) return "historic";
  if (importance >= 55) return "major";
  if (importance >= 30) return "notable";
  return "routine";
}

export function isStoryMilestone(importance: number): boolean {
  return importance >= 55;
}

export function storyKindForLog(
  kind: StageOneLogKind,
  blueprintMark = 0,
  firstMarkFour = false
): StoryEventKind {
  switch (kind) {
    case StageOneLogKind.WarDeclared:
      return StoryEventKind.WarDeclared;
    case StageOneLogKind.BattleStarted:
      return StoryEventKind.BattleStarted;
    case StageOneLogKind.BattleEnded:
      return StoryEventKind.BattleEnded;
    case StageOneLogKind.AiColonization:
      return StoryEventKind.ColonyFounded;
    case StageOneLogKind.BlockadeEnded:
      return StoryEventKind.BlockadeFallen;
    case StageOneLogKind.PopulationWarning:
      return StoryEventKind.Famine;
    case StageOneLogKind.ResearchCompleted:
      return StoryEventKind.ResearchCompleted;
    case StageOneLogKind.ShipyardBuildComplete:
      return blueprintMark >= 4 && firstMarkFour
        ? StoryEventKind.FirstMarkFourLaunched
        : StoryEventKind.ShipLaunched;
    case StageOneLogKind.Secession:
      return StoryEventKind.RegionSeceded;
    case StageOneLogKind.TreatySigned:
    case StageOneLogKind.TreatyBroken:
    case StageOneLogKind.PeaceConcluded:
    case StageOneLogKind.CoalitionChanged:
      return StoryEventKind.Diplomacy;
    case StageOneLogKind.AiStrategicGoal:
    case StageOneLogKind.AiBottleneck:
    case StageOneLogKind.AiBuildPlan:
    case StageOneLogKind.AiFleetScale:
    case StageOneLogKind.AiNoop:
    case StageOneLogKind.ResearchChosen:
    case StageOneLogKind.BlockadeResponse:
      return StoryEventKind.AiDecision;
    default:
      return StoryEventKind.Economy;
  }
}

/**
 * Keeps every computed milestone and the newest routine events. Older routine rows are
 * represented by one summary per century, matching journal compaction (spec 11.7).
 */
export function compactStoryEvents<T extends CompactableStoryEvent>(
  events: readonly T[],
  routineLimit = 1200
): Array<T | StoryCenturySummary> {
  if (events.length <= routineLimit) return events.slice();
  const milestones: T[] = [];
  const routine: T[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined) continue;
    if (isStoryMilestone(event.importance)) milestones.push(event);
    else routine.push(event);
  }
  const keepFrom = Math.max(0, routine.length - routineLimit);
  const summaries = summarizeRoutine(routine.slice(0, keepFrom));
  const kept = [...milestones, ...routine.slice(keepFrom)];
  kept.sort((a, b) => a.serial - b.serial);
  return [...summaries, ...kept].sort((a, b) => a.tick - b.tick);
}

function summarizeRoutine<T extends CompactableStoryEvent>(
  events: readonly T[]
): StoryCenturySummary[] {
  const summaries: StoryCenturySummary[] = [];
  let century = -1;
  let count = 0;
  let peak = 0;
  for (let i = 0; i <= events.length; i += 1) {
    const event = events[i];
    const nextCentury = event === undefined ? -1 : Math.floor(event.tick / 36_500);
    if (century >= 0 && nextCentury !== century) {
      summaries.push({
        kind: "century-summary",
        century,
        tick: century * 36_500,
        count,
        peakImportance: peak
      });
      count = 0;
      peak = 0;
    }
    if (event !== undefined) {
      century = nextCentury;
      count += 1;
      peak = Math.max(peak, event.importance);
    }
  }
  return summaries;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
