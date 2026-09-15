import {
  StageOneLogKind,
  StoryEventKind,
  createStageTwoDataFromGameData,
  formatAiDecisionReason,
  type RenderEvent
} from "@galaxy-sim/sim-core";
import { GAME_DATA } from "@galaxy-sim/sim-data/game-data";

const data = createStageTwoDataFromGameData(GAME_DATA);

export interface EventFilters {
  readonly faction: number;
  readonly kind: number;
  readonly minimumImportance: number;
  readonly query: string;
}

export function mergeEventBatches(
  current: readonly RenderEvent[],
  incoming: readonly RenderEvent[],
  routineLimit = 5000
): RenderEvent[] {
  const bySerial = new Map<number, RenderEvent>();
  for (let index = 0; index < current.length; index += 1) {
    const event = current[index];
    if (event !== undefined) bySerial.set(event.serial, event);
  }
  for (let index = 0; index < incoming.length; index += 1) {
    const event = incoming[index];
    if (event !== undefined) bySerial.set(event.serial, event);
  }
  const sorted = [...bySerial.values()].sort((left, right) => left.serial - right.serial);
  const milestones = sorted.filter((event) => event.milestone);
  const routine = sorted.filter((event) => !event.milestone);
  return [...milestones, ...routine.slice(-routineLimit)].sort(
    (left, right) => left.serial - right.serial
  );
}

export function filterEvents(events: readonly RenderEvent[], filters: EventFilters): RenderEvent[] {
  const query = filters.query.trim().toLocaleLowerCase("ru");
  return events.filter((event) => {
    if (filters.faction >= 0 && event.faction !== filters.faction) return false;
    if (filters.kind > 0 && storyCategory(event.storyKind) !== filters.kind) return false;
    if (event.importance < filters.minimumImportance) return false;
    if (query.length > 0) {
      const searchable = `${eventTitle(event)} ${eventReason(event)}`.toLocaleLowerCase("ru");
      if (!searchable.includes(query)) return false;
    }
    return true;
  });
}

function storyCategory(kind: StoryEventKind): StoryEventKind {
  if (kind === StoryEventKind.BattleEnded) return StoryEventKind.BattleStarted;
  if (kind === StoryEventKind.FirstMarkFourLaunched) return StoryEventKind.ShipLaunched;
  return kind;
}

export function visibleWindow(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = 5
): { readonly start: number; readonly end: number } {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  return { start, end };
}

export function eventTitle(event: RenderEvent): string {
  const faction = event.faction >= 0 ? `Фракция ${event.faction}` : "Неизвестная сторона";
  const resource = resourceName(event.resource);
  switch (event.storyKind) {
    case StoryEventKind.WarDeclared:
      return `${faction} объявляет войну фракции ${Math.trunc(event.amount)}`;
    case StoryEventKind.BattleStarted:
      return `В системе ${event.system} началось сражение`;
    case StoryEventKind.BattleEnded:
      return `Сражение в системе ${event.system} завершено`;
    case StoryEventKind.ColonyFounded:
      return `${faction} основывает колонию в системе ${event.system}`;
    case StoryEventKind.BlockadeFallen:
      return `Блокада у системы ${event.system} пала`;
    case StoryEventKind.Famine:
      return `Голод на теле ${event.body}`;
    case StoryEventKind.ResearchCompleted:
      return `${faction} completed research ${techName(event.resource)}`;
    case StoryEventKind.FirstMarkFourLaunched:
      return `${faction} launched its first Mk IV ship`;
    case StoryEventKind.ShipLaunched:
      return `${faction} launched a new ship`;
    case StoryEventKind.RegionSeceded:
      return `Region in system ${event.system} seceded as ${faction}`;
    case StoryEventKind.Diplomacy:
      return `Diplomatic change involving ${faction}`;
    case StoryEventKind.AiDecision:
      return formatAiDecisionReason(data, event) || `${faction} revised its plan`;
    default:
      if (event.kind === StageOneLogKind.BatchComplete)
        return `${resource}: +${event.amount.toFixed(0)} produced in system ${event.system}`;
      if (event.kind === StageOneLogKind.ShipmentDelivered)
        return `${resource}: ${event.amount.toFixed(0)} delivered to system ${event.system}`;
      return `Economic event in system ${event.system}`;
  }
}

export function eventReason(event: RenderEvent): string {
  const aiReason = formatAiDecisionReason(data, event);
  if (aiReason.length > 0) return aiReason;
  const impact = event.impact;
  return `Impact: ${impact.systemsAffected.toFixed(0)} systems, ${impact.productionValue.toFixed(0)} production value, ${impact.shipsAffected.toFixed(0)} ships.`;
}

export function storyKindLabel(kind: number): string {
  switch (kind) {
    case StoryEventKind.WarDeclared:
      return "Wars";
    case StoryEventKind.BattleStarted:
    case StoryEventKind.BattleEnded:
      return "Battles";
    case StoryEventKind.ColonyFounded:
      return "Colonies";
    case StoryEventKind.BlockadeFallen:
      return "Blockades";
    case StoryEventKind.Famine:
      return "Famine";
    case StoryEventKind.ResearchCompleted:
      return "Research";
    case StoryEventKind.ShipLaunched:
    case StoryEventKind.FirstMarkFourLaunched:
      return "Shipbuilding";
    case StoryEventKind.RegionSeceded:
      return "Secessions";
    case StoryEventKind.Diplomacy:
      return "Diplomacy";
    case StoryEventKind.AiDecision:
      return "AI decisions";
    default:
      return "Economy";
  }
}

function resourceName(resource: number): string {
  return data.resources[resource]?.name ?? `resource ${resource}`;
}

function techName(tech: number): string {
  return data.techs[tech]?.name ?? `technology ${tech}`;
}
