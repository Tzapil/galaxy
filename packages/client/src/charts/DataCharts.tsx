import { createStageTwoDataFromGameData } from "@galaxy-sim/sim-core";
import { GAME_DATA } from "@galaxy-sim/sim-data/game-data";
import type { FactionSummary, HistoryPayload, HistorySeriesSelector } from "@galaxy-sim/sim-worker";
import { useEffect, useMemo, useState, type ReactElement } from "react";

import { FACTION_COLORS } from "../map/colorModes.js";
import { UPlotChart, type PlotSeries } from "./UPlotChart.js";

const data = createStageTwoDataFromGameData(GAME_DATA);
const CHART_COLORS = ["#55d6be", "#ffd166", "#ef476f", "#7aa2f7", "#bb9af7"] as const;

type ChartMode = "price" | "flow" | "power" | "polities";

export function DataCharts({
  history,
  factions,
  onRequest
}: {
  readonly history: HistoryPayload | undefined;
  readonly factions: readonly FactionSummary[];
  readonly onRequest: (series: readonly HistorySeriesSelector[], horizonTicks: number) => void;
}): ReactElement {
  const [mode, setMode] = useState<ChartMode>("price");
  const [resource, setResource] = useState(data.resourceIndex.get("food") ?? 0);
  const [horizon, setHorizon] = useState(3_650_000);
  const selectors = useMemo(
    () => selectorsFor(mode, resource, factions),
    [factions, mode, resource]
  );
  useEffect(() => onRequest(selectors, horizon), [horizon, onRequest, selectors]);
  const plotSeries: PlotSeries[] =
    history?.series.map((series, index) => ({
      label: series.label,
      values: series.values,
      color: CHART_COLORS[index % CHART_COLORS.length] ?? "#ffffff"
    })) ?? [];
  return (
    <section className="data-charts panel" aria-label="Historical charts">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Worker-aggregated history</span>
          <h2>Data observatory</h2>
        </div>
        <span className="count-pill">{history?.sourcePoints ?? 0} buckets</span>
      </div>
      <div className="chart-controls">
        {(["price", "flow", "power", "polities"] as const).map((value) => (
          <button
            type="button"
            className={mode === value ? "active" : ""}
            key={value}
            onClick={() => setMode(value)}
          >
            {value}
          </button>
        ))}
        {mode === "price" || mode === "flow" ? (
          <select
            value={resource}
            onChange={(event) => setResource(Number(event.currentTarget.value))}
          >
            {data.resources.map((item, index) => (
              <option value={index} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : null}
        <select value={horizon} onChange={(event) => setHorizon(Number(event.currentTarget.value))}>
          <option value={365}>1 year</option>
          <option value={36_500}>100 years</option>
          <option value={365_000}>1,000 years</option>
          <option value={3_650_000}>10,000 years</option>
        </select>
      </div>
      {history === undefined || history.ticks.length === 0 ? (
        <div className="empty-state">History is being aggregated in the simulation worker.</div>
      ) : (
        <UPlotChart ticks={history.ticks} series={plotSeries} />
      )}
      <small className="history-footnote">
        Worker storage {(history?.workerBytes ?? 0).toLocaleString()} bytes. Extremes survive
        monthly and annual thinning.
      </small>
      <FactionTable factions={factions} />
    </section>
  );
}

function selectorsFor(
  mode: ChartMode,
  resource: number,
  factions: readonly FactionSummary[]
): readonly HistorySeriesSelector[] {
  if (mode === "price") return [{ metric: "price", resource, label: "Shadow price" }];
  if (mode === "flow")
    return [
      { metric: "production", resource, label: "Production / day" },
      { metric: "consumption", resource, label: "Consumption / day" }
    ];
  if (mode === "power")
    return factions.slice(0, 12).map((faction) => ({
      metric: "factionPower" as const,
      faction: faction.id,
      label: faction.label
    }));
  return [
    { metric: "liveFactions", label: "Living factions" },
    { metric: "powerConcentration", label: "Power concentration" }
  ];
}

function FactionTable({
  factions
}: {
  readonly factions: readonly FactionSummary[];
}): ReactElement {
  const [sort, setSort] = useState<keyof FactionSummary>("power");
  const rows = useMemo(
    () => factions.slice().sort((left, right) => compareSummary(left, right, sort)),
    [factions, sort]
  );
  return (
    <div className="faction-table-wrap">
      <h3>Faction comparison</h3>
      <table className="faction-table">
        <thead>
          <tr>
            {(["label", "systems", "population", "ships", "treasury", "power"] as const).map(
              (key) => (
                <th key={key}>
                  <button type="button" onClick={() => setSort(key)}>
                    {key}
                  </button>
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <i
                  style={{
                    backgroundColor: `#${(FACTION_COLORS[row.id % FACTION_COLORS.length] ?? 0xffffff).toString(16).padStart(6, "0")}`
                  }}
                />
                {row.label}
              </td>
              <td>{row.systems}</td>
              <td>{row.population.toFixed(0)}</td>
              <td>{row.ships}</td>
              <td>{row.treasury.toFixed(0)}</td>
              <td>{row.power.toFixed(0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function compareSummary(
  left: FactionSummary,
  right: FactionSummary,
  key: keyof FactionSummary
): number {
  const a = left[key];
  const b = right[key];
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return Number(b) - Number(a);
}
