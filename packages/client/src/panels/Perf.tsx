import type { StageOneMetrics } from "@galaxy-sim/sim-core";
import type { StageOneWorkerStats, WorkerSpeed } from "@galaxy-sim/sim-worker";
import type { ReactElement } from "react";

interface PerfProps {
  readonly stats: StageOneWorkerStats | undefined;
  readonly metrics: StageOneMetrics | undefined;
  readonly speed: WorkerSpeed;
  readonly onSpeed: (speed: WorkerSpeed) => void;
  readonly onSave: () => void;
  readonly onLoad: () => void;
}

const speeds: readonly WorkerSpeed[] = [0, 1, 10, 100, 1000];

export function Perf({ stats, metrics, speed, onSpeed, onSave, onLoad }: PerfProps): ReactElement {
  return (
    <section className="panel">
      <h2>Run</h2>
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
      <div className="kv">
        <span>tick</span>
        <b>{stats?.tick ?? 0}</b>
        <span>target</span>
        <b>x{stats?.targetSpeed ?? speed}</b>
        <span>actual</span>
        <b>x{(stats?.actualSpeed ?? 0).toFixed(0)}</b>
        <span>tick ms</span>
        <b>{(stats?.tickMs ?? 0).toFixed(3)}</b>
        <span>systems</span>
        <b>{stats?.counters.systems ?? 0}</b>
        <span>ships</span>
        <b>{stats?.counters.ships ?? 0}</b>
        <span>buildings</span>
        <b>{stats?.counters.buildings ?? 0}</b>
        <span>pop</span>
        <b>{(metrics?.totalPopulation ?? 0).toFixed(0)}</b>
        <span>min pop</span>
        <b>{(metrics?.minPopulation ?? 0).toFixed(0)}</b>
        <span>spread</span>
        <b>{(metrics?.averageFoodWaterSpread ?? 0).toFixed(3)}</b>
      </div>
      <div className="subsystems">
        {(stats?.subsystemMs ?? []).slice(0, 4).map((value, index) => (
          <span key={index}>{value.toFixed(1)}</span>
        ))}
      </div>
      <div className="speed-row">
        <button type="button" onClick={onSave}>
          save
        </button>
        <button type="button" onClick={onLoad}>
          load
        </button>
      </div>
    </section>
  );
}
