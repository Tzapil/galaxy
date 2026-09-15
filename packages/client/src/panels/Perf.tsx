import type { StageTwoMetrics } from "@galaxy-sim/sim-core";
import type { StageOneWorkerStats, WorkerSpeed } from "@galaxy-sim/sim-worker";
import { useMemo, type ReactElement } from "react";

import { UPlotChart } from "../charts/UPlotChart.js";

const speeds: readonly WorkerSpeed[] = [0, 1, 10, 100, 1000];
const subsystemNames = [
  "continuous",
  "events",
  "snapshot",
  "AI strategic",
  "AI ops",
  "AI tactical",
  "total"
];

export function Perf({
  stats,
  metrics,
  speed,
  visible,
  onSpeed
}: {
  readonly stats: StageOneWorkerStats | undefined;
  readonly metrics: StageTwoMetrics | undefined;
  readonly speed: WorkerSpeed;
  readonly visible: boolean;
  readonly onSpeed: (speed: WorkerSpeed) => void;
}): ReactElement {
  const historyTicks = useMemo(
    () => (stats?.tickMsHistory ?? []).map((_value, index) => index),
    [stats?.tickMsHistory]
  );
  const isBehind =
    (stats?.targetSpeed ?? 0) > 0 && (stats?.actualSpeed ?? 0) + 1 < (stats?.targetSpeed ?? 0);
  return (
    <section className="panel perf-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Simulation clock</span>
          <h2>Run controls</h2>
        </div>
      </div>
      <div className="speed-row">
        {speeds.map((value) => (
          <button
            className={speed === value ? "active" : ""}
            key={value}
            type="button"
            onClick={() => onSpeed(value)}
          >
            {value === 0 ? "pause" : `x${value}`}
          </button>
        ))}
      </div>
      {isBehind ? (
        <div className="degradation-warning" role="status">
          Simulation is behind: actual x{(stats?.actualSpeed ?? 0).toFixed(0)} of x
          {stats?.targetSpeed ?? speed}. No ticks are skipped.
        </div>
      ) : null}
      <div className="metric-grid compact">
        <Metric label="Year" value={Math.floor((stats?.tick ?? 0) / 365).toLocaleString()} />
        <Metric label="Actual" value={`x${(stats?.actualSpeed ?? 0).toFixed(0)}`} />
        <Metric label="Tick" value={`${(stats?.tickMs ?? 0).toFixed(3)} ms`} />
        <Metric label="Population" value={(metrics?.totalPopulation ?? 0).toFixed(0)} />
      </div>
      {visible ? (
        <>
          <div className="subsystems">
            {(stats?.subsystemMs ?? []).map((value, index) => (
              <span key={subsystemNames[index] ?? index}>
                <em>{subsystemNames[index] ?? index}</em>
                {value.toFixed(2)} ms
              </span>
            ))}
          </div>
          <div className="entity-counters">
            <span>{stats?.counters.systems ?? 0} systems</span>
            <span>{stats?.counters.factions ?? 0} factions</span>
            <span>{stats?.counters.ships ?? 0} ships</span>
            <span>{stats?.counters.buildings ?? 0} buildings</span>
          </div>
          {historyTicks.length > 1 ? (
            <UPlotChart
              height={130}
              ticks={historyTicks}
              series={[{ label: "tick ms", values: stats?.tickMsHistory ?? [], color: "#55d6be" }]}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
