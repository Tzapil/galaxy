import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const speeds = [0, 1, 10, 100, 1000];
export function Perf({ stats, metrics, speed, onSpeed, onSave, onLoad }) {
  return _jsxs("section", {
    className: "panel",
    children: [
      _jsx("h2", { children: "Run" }),
      _jsx("div", {
        className: "speed-row",
        children: speeds.map((value) =>
          _jsx(
            "button",
            {
              className: speed === value ? "active" : "",
              type: "button",
              onClick: () => onSpeed(value),
              children: value === 0 ? "pause" : `x${value}`
            },
            value
          )
        )
      }),
      _jsxs("div", {
        className: "kv",
        children: [
          _jsx("span", { children: "tick" }),
          _jsx("b", { children: stats?.tick ?? 0 }),
          _jsx("span", { children: "target" }),
          _jsxs("b", { children: ["x", stats?.targetSpeed ?? speed] }),
          _jsx("span", { children: "actual" }),
          _jsxs("b", { children: ["x", (stats?.actualSpeed ?? 0).toFixed(0)] }),
          _jsx("span", { children: "tick ms" }),
          _jsx("b", { children: (stats?.tickMs ?? 0).toFixed(3) }),
          _jsx("span", { children: "systems" }),
          _jsx("b", { children: stats?.counters.systems ?? 0 }),
          _jsx("span", { children: "ships" }),
          _jsx("b", { children: stats?.counters.ships ?? 0 }),
          _jsx("span", { children: "buildings" }),
          _jsx("b", { children: stats?.counters.buildings ?? 0 }),
          _jsx("span", { children: "pop" }),
          _jsx("b", { children: (metrics?.totalPopulation ?? 0).toFixed(0) }),
          _jsx("span", { children: "min pop" }),
          _jsx("b", { children: (metrics?.minPopulation ?? 0).toFixed(0) }),
          _jsx("span", { children: "spread" }),
          _jsx("b", { children: (metrics?.averageFoodWaterSpread ?? 0).toFixed(3) })
        ]
      }),
      _jsx("div", {
        className: "subsystems",
        children: (stats?.subsystemMs ?? [])
          .slice(0, 4)
          .map((value, index) => _jsx("span", { children: value.toFixed(1) }, index))
      }),
      _jsxs("div", {
        className: "speed-row",
        children: [
          _jsx("button", { type: "button", onClick: onSave, children: "save" }),
          _jsx("button", { type: "button", onClick: onLoad, children: "load" })
        ]
      })
    ]
  });
}
//# sourceMappingURL=Perf.js.map
