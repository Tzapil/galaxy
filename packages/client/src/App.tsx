import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  decodeStageOneRenderSnapshot,
  type StageOneMetrics,
  type StageOneRenderSnapshot
} from "@galaxy-sim/sim-core";
import {
  DEFAULT_RENDER_SLICES,
  type StageOneWorkerStats,
  type WorkerMessage,
  type WorkerSpeed
} from "@galaxy-sim/sim-worker";

import { EventFeed } from "./feed/EventFeed.js";
import { PixiMap } from "./map/PixiMap.js";
import { Colony } from "./panels/Colony.js";
import { Perf } from "./panels/Perf.js";
import { IndexedDbPersistPort } from "./persist/indexeddb.js";
import "./styles.css";

const SAVE_SLOT = "stage-one";
const DEFAULT_SEED = 20260904;
const INITIAL_SPEED: WorkerSpeed = 10;

export function App(): ReactElement {
  const mapHost = useRef<HTMLDivElement | null>(null);
  const map = useRef<PixiMap | null>(null);
  const worker = useRef<Worker | null>(null);
  const persist = useMemo(() => new IndexedDbPersistPort(), []);
  const [snapshot, setSnapshot] = useState<StageOneRenderSnapshot | undefined>();
  const [stats, setStats] = useState<StageOneWorkerStats | undefined>();
  const [metrics, setMetrics] = useState<StageOneMetrics | undefined>();
  const [speed, setSpeedState] = useState<WorkerSpeed>(INITIAL_SPEED);
  const [selectedSystem, setSelectedSystem] = useState(0);

  useEffect(() => {
    const view = new PixiMap(setSelectedSystem);
    map.current = view;
    const host = mapHost.current;
    if (host !== null) void view.mount(host);
    return () => {
      view.destroy();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const simWorker = new Worker(new URL("../../sim-worker/src/worker.ts", import.meta.url), {
      type: "module"
    });
    worker.current = simWorker;
    simWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      void handleWorkerMessage(event.data, persist, setSnapshot, setStats, setMetrics);
    };
    simWorker.postMessage({
      type: "init",
      seed: DEFAULT_SEED,
      params: { speed: INITIAL_SPEED, slices: DEFAULT_RENDER_SLICES }
    });
    return () => {
      simWorker.terminate();
      worker.current = null;
    };
  }, [persist]);

  useEffect(() => {
    if (snapshot !== undefined) map.current?.update(snapshot);
  }, [snapshot]);

  function setSpeed(next: WorkerSpeed): void {
    setSpeedState(next);
    worker.current?.postMessage(
      next === 0 ? { type: "pause" } : { type: "setSpeed", multiplier: next }
    );
  }

  function focusSystem(system: number): void {
    setSelectedSystem(system);
    map.current?.focusSystem(system);
  }

  function save(): void {
    worker.current?.postMessage({ type: "save", slotId: SAVE_SLOT });
  }

  async function load(): Promise<void> {
    const buffer = await persist.loadSnapshot(SAVE_SLOT);
    if (buffer !== undefined) {
      worker.current?.postMessage({ type: "load", slotId: SAVE_SLOT, buffer }, [buffer]);
    }
  }

  return (
    <main className="shell" aria-label="Galaxy Sim Stage 1">
      <div className="topbar">
        <strong>Galaxy Sim Stage 1</strong>
        <span>system {selectedSystem}</span>
      </div>
      <div className="workspace">
        <div ref={mapHost} className="map-host" />
        <aside className="side">
          <Perf
            stats={stats}
            metrics={metrics}
            speed={speed}
            onSpeed={setSpeed}
            onSave={save}
            onLoad={() => void load()}
          />
          <Colony
            selectedSystem={selectedSystem}
            colonies={snapshot?.colonies ?? []}
            buildings={snapshot?.buildings ?? []}
          />
          <EventFeed events={snapshot?.events ?? []} onFocusSystem={focusSystem} />
        </aside>
      </div>
    </main>
  );
}

async function handleWorkerMessage(
  message: WorkerMessage,
  persist: IndexedDbPersistPort,
  setSnapshot: (snapshot: StageOneRenderSnapshot) => void,
  setStats: (stats: StageOneWorkerStats) => void,
  setMetrics: (metrics: StageOneMetrics) => void
): Promise<void> {
  if (message.type === "snapshot") {
    setSnapshot(decodeStageOneRenderSnapshot(message.buffer));
    return;
  }
  if (message.type === "stats") {
    setStats(message.stats);
    setMetrics(message.metrics);
    return;
  }
  if (message.type === "saved") {
    await persist.saveSnapshot(message.slotId, message.buffer);
  }
}
