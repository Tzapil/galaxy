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
export declare function Perf({
  stats,
  metrics,
  speed,
  onSpeed,
  onSave,
  onLoad
}: PerfProps): ReactElement;
export {};
//# sourceMappingURL=Perf.d.ts.map
