import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createDefaultStageOneData, StageOneLogKind } from "@galaxy-sim/sim-core";
const data = createDefaultStageOneData();
export function EventFeed({ events, onFocusSystem }) {
  return _jsxs("section", {
    className: "panel event-feed",
    children: [
      _jsx("h2", { children: "Events" }),
      _jsx("ol", {
        children: events
          .slice()
          .reverse()
          .map((event, index) =>
            _jsx(
              "li",
              {
                children: _jsxs("button", {
                  type: "button",
                  onClick: () => onFocusSystem(event.system),
                  children: [
                    _jsx("span", { children: event.tick }),
                    _jsx("span", { children: eventText(event) })
                  ]
                })
              },
              `${event.tick}-${event.kind}-${event.subject}-${index}`
            )
          )
      })
    ]
  });
}
function eventText(event) {
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
}
//# sourceMappingURL=EventFeed.js.map
