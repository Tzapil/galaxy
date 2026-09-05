import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { BuildingState, createDefaultStageOneData } from "@galaxy-sim/sim-core";
const data = createDefaultStageOneData();
export function Colony({ selectedSystem, colonies, buildings }) {
  const colony =
    colonies.find((item) => item.system === selectedSystem) ??
    colonies.find((item) => item.population > 0);
  return _jsxs("section", {
    className: "panel colony-panel",
    children: [
      _jsx("h2", { children: "Colony" }),
      colony === undefined
        ? _jsx("p", { className: "muted", children: "none" })
        : _jsxs(_Fragment, {
            children: [
              _jsxs("div", {
                className: "kv",
                children: [
                  _jsx("span", { children: "system" }),
                  _jsx("b", { children: colony.system }),
                  _jsx("span", { children: "body" }),
                  _jsx("b", { children: colony.body }),
                  _jsx("span", { children: "faction" }),
                  _jsx("b", { children: colony.faction }),
                  _jsx("span", { children: "pop" }),
                  _jsx("b", { children: colony.population.toFixed(1) }),
                  _jsx("span", { children: "unrest" }),
                  _jsx("b", { children: colony.unrest.toFixed(2) })
                ]
              }),
              _jsxs("table", {
                children: [
                  _jsx("thead", {
                    children: _jsxs("tr", {
                      children: [
                        _jsx("th", { children: "res" }),
                        _jsx("th", { children: "stock" }),
                        _jsx("th", { children: "price" })
                      ]
                    })
                  }),
                  _jsx("tbody", {
                    children: data.sliceResourceIndices.map((resource, index) =>
                      _jsxs(
                        "tr",
                        {
                          children: [
                            _jsx("td", { children: data.resources[resource]?.id ?? resource }),
                            _jsx("td", { children: (colony.stock[index] ?? 0).toFixed(0) }),
                            _jsx("td", { children: (colony.prices[index] ?? 0).toFixed(2) })
                          ]
                        },
                        resource
                      )
                    )
                  })
                ]
              }),
              _jsx("ul", {
                className: "building-list",
                children: buildings
                  .filter((building) => building.body === colony.body)
                  .map((building) =>
                    _jsxs(
                      "li",
                      {
                        children: [
                          _jsx("span", {
                            children:
                              data.buildings[building.type]?.name ?? `building ${building.type}`
                          }),
                          _jsx("b", { children: buildingStateText(building) })
                        ]
                      },
                      building.id
                    )
                  )
              })
            ]
          })
    ]
  });
}
function buildingStateText(building) {
  const resource =
    building.stateResource >= 0
      ? (data.resources[building.stateResource]?.id ?? `res${building.stateResource}`)
      : "";
  switch (building.state) {
    case BuildingState.UnderConstruction:
      return "building";
    case BuildingState.Working:
      return "working";
    case BuildingState.IdleMissingInput:
      return `idle: no ${resource}`;
    case BuildingState.IdleNoWorkers:
      return "idle: workers";
    case BuildingState.IdleNoPower:
      return "idle: power";
    case BuildingState.IdleStorageFull:
      return `idle: full ${resource}`;
    default:
      return "idle";
  }
}
//# sourceMappingURL=Colony.js.map
