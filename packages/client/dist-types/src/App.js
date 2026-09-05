import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { decodeStageOneRenderSnapshot } from "@galaxy-sim/sim-core";
import { DEFAULT_RENDER_SLICES } from "@galaxy-sim/sim-worker";
import { EventFeed } from "./feed/EventFeed.js";
import { PixiMap } from "./map/PixiMap.js";
import { Colony } from "./panels/Colony.js";
import { Perf } from "./panels/Perf.js";
import { IndexedDbPersistPort } from "./persist/indexeddb.js";
import "./styles.css";
const SAVE_SLOT = "stage-one";
const DEFAULT_SEED = 20260904;
const INITIAL_SPEED = 10;
export function App() {
  const mapHost = useRef(null);
  const map = useRef(null);
  const worker = useRef(null);
  const persist = useMemo(() => new IndexedDbPersistPort(), []);
  const [snapshot, setSnapshot] = useState();
  const [stats, setStats] = useState();
  const [metrics, setMetrics] = useState();
  const [speed, setSpeedState] = useState(INITIAL_SPEED);
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
    simWorker.onmessage = (event) => {
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
  function setSpeed(next) {
    setSpeedState(next);
    worker.current?.postMessage(
      next === 0 ? { type: "pause" } : { type: "setSpeed", multiplier: next }
    );
  }
  function focusSystem(system) {
    setSelectedSystem(system);
    map.current?.focusSystem(system);
  }
  function save() {
    worker.current?.postMessage({ type: "save", slotId: SAVE_SLOT });
  }
  async function load() {
    const buffer = await persist.loadSnapshot(SAVE_SLOT);
    if (buffer !== undefined) {
      worker.current?.postMessage({ type: "load", slotId: SAVE_SLOT, buffer }, [buffer]);
    }
  }
  return _jsxs("main", {
    className: "shell",
    "aria-label": "Galaxy Sim Stage 1",
    children: [
      _jsxs("div", {
        className: "topbar",
        children: [
          _jsx("strong", { children: "Galaxy Sim Stage 1" }),
          _jsxs("span", { children: ["system ", selectedSystem] })
        ]
      }),
      _jsxs("div", {
        className: "workspace",
        children: [
          _jsx("div", { ref: mapHost, className: "map-host" }),
          _jsxs("aside", {
            className: "side",
            children: [
              _jsx(Perf, {
                stats: stats,
                metrics: metrics,
                speed: speed,
                onSpeed: setSpeed,
                onSave: save,
                onLoad: () => void load()
              }),
              _jsx(Colony, {
                selectedSystem: selectedSystem,
                colonies: snapshot?.colonies ?? [],
                buildings: snapshot?.buildings ?? []
              }),
              _jsx(EventFeed, { events: snapshot?.events ?? [], onFocusSystem: focusSystem })
            ]
          })
        ]
      })
    ]
  });
}
async function handleWorkerMessage(message, persist, setSnapshot, setStats, setMetrics) {
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
//# sourceMappingURL=App.js.map
