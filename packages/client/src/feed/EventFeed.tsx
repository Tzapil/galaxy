import { createDefaultStageOneData, StageOneLogKind, type RenderEvent } from "@galaxy-sim/sim-core";
import type { ReactElement } from "react";

const data = createDefaultStageOneData();

interface EventFeedProps {
  readonly events: readonly RenderEvent[];
  readonly onFocusSystem: (system: number) => void;
}

export function EventFeed({ events, onFocusSystem }: EventFeedProps): ReactElement {
  return (
    <section className="panel event-feed">
      <h2>Events</h2>
      <ol>
        {events
          .slice()
          .reverse()
          .map((event, index) => (
            <li key={`${event.tick}-${event.kind}-${event.subject}-${index}`}>
              <button type="button" onClick={() => onFocusSystem(event.system)}>
                <span>{event.tick}</span>
                <span>{eventText(event)}</span>
              </button>
            </li>
          ))}
      </ol>
    </section>
  );
}

function eventText(event: RenderEvent): string {
  const resource =
    event.resource >= 0 ? (data.resources[event.resource]?.id ?? `res${event.resource}`) : "";
  switch (event.kind) {
    case StageOneLogKind.BatchComplete:
      return `batch ${resource} +${event.amount.toFixed(0)} @ ${event.system}`;
    case StageOneLogKind.MissingInput:
      return `idle missing ${resource} @ ${event.system}`;
    case StageOneLogKind.DeadlockBroken:
      return `deadlock break ${resource} @ ${event.system}`;
    case StageOneLogKind.ShipmentDelivered:
      return `ship ${resource} +${event.amount.toFixed(0)} @ ${event.system}`;
    case StageOneLogKind.DepartureFailedFuel:
      return `no fuel @ ${event.system}`;
    case StageOneLogKind.HaulerLaunched:
      return `haul ${resource} ${event.amount.toFixed(0)} @ ${event.system}`;
    case StageOneLogKind.PopulationWarning:
      return `population warning @ ${event.system}`;
  }
  return `event ${event.kind} @ ${event.system}`;
}
