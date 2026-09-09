import {
  createDefaultStageOneData,
  formatAiDecisionReason,
  StageOneLogKind,
  type RenderEvent
} from "@galaxy-sim/sim-core";
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
  const aiReason = formatAiDecisionReason(data, event);
  if (aiReason.length > 0) return aiReason;
  const resource =
    event.resource >= 0 ? (data.resources[event.resource]?.id ?? `res${event.resource}`) : "";
  const building =
    event.subject >= 0 ? (data.buildings[event.subject]?.id ?? `building${event.subject}`) : "";
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
    case StageOneLogKind.ConstructionStarted:
      return `build started ${building} @ ${event.system}`;
    case StageOneLogKind.ConstructionWaitingMaterials:
      return `build waits for ${resource} @ ${event.system}`;
    case StageOneLogKind.ConstructionComplete:
      return `build complete ${building} @ ${event.system}`;
    case StageOneLogKind.BuildingDemolished:
      return `demolished ${building} @ ${event.system}`;
    case StageOneLogKind.ContractSubsidyPaid:
      return `subsidy ${resource} ${event.amount.toFixed(0)} @ ${event.system}`;
    case StageOneLogKind.ResearchCompleted:
      return `research ${event.subject} @ ${event.system}`;
    case StageOneLogKind.AiStrategicGoal:
      return `AI goal ${resource} pressure ${event.amount.toFixed(1)} @ ${event.system}`;
    case StageOneLogKind.AiBottleneck:
      return `AI bottleneck ${resource} gap ${event.amount.toFixed(2)} @ ${event.system}`;
    case StageOneLogKind.AiBuildPlan:
      return `AI builds ${building} for ${resource} @ ${event.system}`;
    case StageOneLogKind.AiColonization:
      return `AI colonizes for ${resource} score ${event.amount.toFixed(1)} @ ${event.system}`;
    case StageOneLogKind.AiFleetScale:
      return `AI adds hauler for ${event.amount.toFixed(0)} jobs @ ${event.system}`;
    case StageOneLogKind.AiNoop:
      return `AI holds plan @ ${event.system}`;
  }
  return `event ${event.kind} @ ${event.system}`;
}
