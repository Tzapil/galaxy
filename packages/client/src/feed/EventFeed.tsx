import {
  StoryEventKind,
  compactStoryEvents,
  storyImportanceBand,
  type RenderEvent,
  type StoryCenturySummary
} from "@galaxy-sim/sim-core";
import type { FactionSummary } from "@galaxy-sim/sim-worker";
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type UIEvent
} from "react";

import { eventReason, eventTitle, filterEvents, storyKindLabel, visibleWindow } from "./model.js";

const ROW_HEIGHT = 92;
const STORY_KINDS = [
  StoryEventKind.WarDeclared,
  StoryEventKind.BattleStarted,
  StoryEventKind.ColonyFounded,
  StoryEventKind.BlockadeFallen,
  StoryEventKind.Famine,
  StoryEventKind.ResearchCompleted,
  StoryEventKind.ShipLaunched,
  StoryEventKind.RegionSeceded,
  StoryEventKind.Diplomacy,
  StoryEventKind.AiDecision,
  StoryEventKind.Economy
] as const;

interface EventFeedProps {
  readonly events: readonly RenderEvent[];
  readonly factions?: readonly FactionSummary[];
  readonly onFocusSystem: (system: number) => void;
}

export function EventFeed({ events, factions = [], onFocusSystem }: EventFeedProps): ReactElement {
  const [faction, setFaction] = useState(-1);
  const [kind, setKind] = useState(0);
  const [minimumImportance, setMinimumImportance] = useState(0);
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const viewport = useRef<HTMLDivElement | null>(null);
  const deferredEvents = useDeferredValue(events);
  const filtered = useMemo(
    () => filterEvents(deferredEvents, { faction, kind, minimumImportance, query }),
    [deferredEvents, faction, kind, minimumImportance, query]
  );
  const timeline = useMemo(() => compactStoryEvents(filtered, 1200).slice().reverse(), [filtered]);
  const height = viewport.current?.clientHeight ?? 560;
  const window = visibleWindow(timeline.length, scrollTop, height, ROW_HEIGHT);

  function onScroll(event: UIEvent<HTMLDivElement>): void {
    setScrollTop(event.currentTarget.scrollTop);
  }

  return (
    <section className="panel event-feed" aria-label="Story feed">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Live chronicle</span>
          <h2>Events</h2>
        </div>
        <span className="count-pill">{filtered.length}</span>
      </div>
      <div className="feed-filters">
        <input
          aria-label="Search events"
          placeholder="Search the chronicle…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <select
          aria-label="Filter by faction"
          value={faction}
          onChange={(event) => setFaction(Number(event.currentTarget.value))}
        >
          <option value={-1}>All factions</option>
          {factions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by event type"
          value={kind}
          onChange={(event) => setKind(Number(event.currentTarget.value))}
        >
          <option value={0}>All event types</option>
          {STORY_KINDS.map((value) => (
            <option key={value} value={value}>
              {storyKindLabel(value)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by importance"
          value={minimumImportance}
          onChange={(event) => setMinimumImportance(Number(event.currentTarget.value))}
        >
          <option value={0}>Any importance</option>
          <option value={30}>Notable+</option>
          <option value={55}>Major+</option>
          <option value={80}>Historic</option>
        </select>
      </div>
      <div className="feed-viewport" ref={viewport} onScroll={onScroll}>
        {timeline.length === 0 ? (
          <div className="empty-state">No events match these filters.</div>
        ) : (
          <div className="feed-spacer" style={{ height: timeline.length * ROW_HEIGHT }}>
            {timeline.slice(window.start, window.end).map((entry, offset) => {
              const index = window.start + offset;
              return (
                <div
                  className="feed-row-position"
                  key={entryKey(entry)}
                  style={{ transform: `translateY(${index * ROW_HEIGHT}px)` }}
                >
                  {"kind" in entry && entry.kind === "century-summary" ? (
                    <CenturySummary summary={entry} />
                  ) : (
                    <EventRow event={entry as RenderEvent} onFocusSystem={onFocusSystem} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function EventRow({
  event,
  onFocusSystem
}: {
  readonly event: RenderEvent;
  readonly onFocusSystem: (system: number) => void;
}): ReactElement {
  const year = Math.floor(event.tick / 365);
  const band = storyImportanceBand(event.importance);
  return (
    <article className={`event-row importance-${band}`}>
      <button
        className="event-focus"
        type="button"
        disabled={event.system < 0}
        onClick={() => onFocusSystem(event.system)}
      >
        <span className="event-date">Y{year.toLocaleString()}</span>
        <span>{eventTitle(event)}</span>
        <span className="importance-meter" title={`Importance ${event.importance}/100`}>
          {event.importance}
        </span>
      </button>
      <details>
        <summary>Why?</summary>
        <p>{eventReason(event)}</p>
      </details>
    </article>
  );
}

function CenturySummary({ summary }: { readonly summary: StoryCenturySummary }): ReactElement {
  return (
    <article className="event-row century-summary">
      <span>Century {summary.century + 1}</span>
      <strong>{summary.count} routine events folded</strong>
      <small>Peak importance {summary.peakImportance}</small>
    </article>
  );
}

function entryKey(entry: RenderEvent | StoryCenturySummary): string {
  return "kind" in entry && entry.kind === "century-summary"
    ? `century-${entry.century}`
    : `event-${(entry as RenderEvent).serial}`;
}
