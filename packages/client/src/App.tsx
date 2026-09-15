import {
  createStageTwoDataFromGameData,
  decodeStageOneRenderSnapshot,
  type JournalEntry,
  type RenderEvent,
  type StageOneRenderSnapshot,
  type StageTwoMetrics,
  type TechnicalEntityLimits
} from "@galaxy-sim/sim-core";
import { GAME_DATA } from "@galaxy-sim/sim-data/game-data";
import type {
  HistoryPayload,
  HistorySeriesSelector,
  StageOneWorkerStats,
  SystemView as SystemSlice,
  WorkerMessage,
  WorkerSpeed
} from "@galaxy-sim/sim-worker";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { DataCharts } from "./charts/DataCharts.js";
import { EventFeed } from "./feed/EventFeed.js";
import { mergeEventBatches } from "./feed/model.js";
import { PixiMap } from "./map/PixiMap.js";
import type { MapColorMode } from "./map/colorModes.js";
import { NewGameScreen } from "./newgame/NewGameScreen.js";
import { toWorkerInit, type NewGameConfig } from "./newgame/model.js";
import { Perf } from "./panels/Perf.js";
import { createIndexedDbSaveRepository } from "./persist/indexeddb.js";
import type { GameSaveRepository } from "./persist/repository.js";
import { SavesPanel } from "./saves/SavesPanel.js";
import { SettingsPanel } from "./settings/SettingsPanel.js";
import { DEFAULT_SETTINGS, loadSettings, type AppSettings } from "./settings/settings.js";
import { SystemView } from "./system/SystemView.js";
import "./styles.css";

type Screen = "newgame" | "galaxy" | "system" | "charts";
interface PendingSave {
  readonly name: string;
  readonly automatic: boolean;
}

const data = createStageTwoDataFromGameData(GAME_DATA);

export function App(): ReactElement {
  const mapHost = useRef<HTMLDivElement | null>(null);
  const map = useRef<PixiMap | null>(null);
  const worker = useRef<Worker | null>(null);
  const repository = useMemo<GameSaveRepository>(() => createIndexedDbSaveRepository(), []);
  const eventRef = useRef<readonly RenderEvent[]>([]);
  const pendingSaves = useRef(new Map<string, PendingSave>());
  const autoSlot = useRef(0);
  const historyRequestId = useRef(0);
  const technicalLimitsRef = useRef<TechnicalEntityLimits>({});
  const [screen, setScreen] = useState<Screen>("newgame");
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<StageOneRenderSnapshot>();
  const [systemView, setSystemView] = useState<SystemSlice>();
  const [stats, setStats] = useState<StageOneWorkerStats>();
  const [metrics, setMetrics] = useState<StageTwoMetrics>();
  const [history, setHistory] = useState<HistoryPayload>();
  const [events, setEvents] = useState<readonly RenderEvent[]>([]);
  const [speed, setSpeedState] = useState<WorkerSpeed>(10);
  const [selectedSystem, setSelectedSystem] = useState(0);
  const [colorMode, setColorMode] = useState<MapColorMode>("ownership");
  const [deficitResource, setDeficitResource] = useState(
    data.resourceIndex.get("superconductors") ?? 0
  );
  const [settings, setSettings] = useState<AppSettings>(() => {
    if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
    return loadSettings();
  });
  const [showSaves, setShowSaves] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saveRevision, setSaveRevision] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    const simWorker = new Worker(new URL("../../sim-worker/src/worker.ts", import.meta.url), {
      type: "module"
    });
    worker.current = simWorker;
    simWorker.onmessage = (message: MessageEvent<WorkerMessage>) => {
      void handleWorkerMessage(message.data);
    };
    return () => {
      simWorker.terminate();
      worker.current = null;
    };
  }, [repository]);

  useEffect(() => {
    if (screen !== "galaxy") return;
    const view = new PixiMap((system) => openSystem(system));
    map.current = view;
    const host = mapHost.current;
    if (host !== null) void view.mount(host);
    if (snapshot !== undefined) view.update(snapshot);
    view.focusSystem(selectedSystem);
    view.setColorMode(colorMode, deficitResource);
    return () => {
      view.destroy();
      map.current = null;
    };
  }, [screen]);

  useEffect(() => {
    if (snapshot !== undefined) map.current?.update(snapshot);
  }, [snapshot]);

  useEffect(() => {
    map.current?.setColorMode(colorMode, deficitResource);
  }, [colorMode, deficitResource]);

  useEffect(() => {
    if (!ready || settings.autosaveMinutes <= 0) return;
    const timer = window.setInterval(() => {
      const slot = autoSlot.current % 3;
      autoSlot.current += 1;
      requestSave(`autosave-${slot}`, `Autosave ${slot + 1}`, true);
    }, settings.autosaveMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [ready, settings.autosaveMinutes]);

  async function handleWorkerMessage(message: WorkerMessage): Promise<void> {
    if (message.type === "snapshot") {
      const decoded = decodeStageOneRenderSnapshot(message.buffer);
      setSnapshot(decoded);
      setEvents((current) => {
        const next = mergeEventBatches(current, decoded.events);
        eventRef.current = next;
        return next;
      });
      return;
    }
    if (message.type === "events") {
      setEvents((current) => {
        const next = mergeEventBatches(current, message.events);
        eventRef.current = next;
        return next;
      });
      return;
    }
    if (message.type === "stats") {
      setStats(message.stats);
      setMetrics(message.metrics);
      return;
    }
    if (message.type === "system") {
      setSystemView(message.view);
      return;
    }
    if (message.type === "history") {
      setHistory(message.payload);
      return;
    }
    if (message.type === "ready") {
      setReady(true);
      setError("");
      return;
    }
    if (message.type === "loaded") {
      setReady(true);
      setScreen("galaxy");
      setShowSaves(false);
      setError("");
      return;
    }
    if (message.type === "saved") {
      const pending = pendingSaves.current.get(message.slotId) ?? {
        name: message.slotId,
        automatic: false
      };
      pendingSaves.current.delete(message.slotId);
      try {
        await repository.save({
          id: message.slotId,
          name: pending.name,
          automatic: pending.automatic,
          tick: message.tick,
          hash: message.hash,
          snapshot: message.buffer,
          journal: storyJournal(eventRef.current),
          technicalLimits: technicalLimitsRef.current
        });
        setSaveRevision((value) => value + 1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not store the save.");
      }
      return;
    }
    if (message.type === "error") setError(message.message);
  }

  function startGame(config: NewGameConfig): void {
    setReady(false);
    setError("");
    setSnapshot(undefined);
    setSystemView(undefined);
    setHistory(undefined);
    setEvents([]);
    eventRef.current = [];
    const nextSpeed = settings.defaultSpeed;
    technicalLimitsRef.current = toWorkerInit(config).technicalLimits ?? {};
    setSpeedState(nextSpeed);
    setScreen("galaxy");
    worker.current?.postMessage({
      type: "init",
      seed: config.seed,
      params: { ...toWorkerInit(config), speed: nextSpeed }
    });
  }

  function setSpeed(next: WorkerSpeed): void {
    setSpeedState(next);
    worker.current?.postMessage(
      next === 0 ? { type: "pause" } : { type: "setSpeed", multiplier: next }
    );
  }

  function openSystem(system: number): void {
    setSelectedSystem(system);
    setSystemView(undefined);
    setScreen("system");
    worker.current?.postMessage({ type: "selectSystem", system });
  }

  function focusSystem(system: number): void {
    if (system < 0) return;
    setSelectedSystem(system);
    setScreen("galaxy");
    map.current?.focusSystem(system);
  }

  function requestSave(id: string, name: string, automatic = false): void {
    if (!ready) return;
    pendingSaves.current.set(id, { name, automatic });
    worker.current?.postMessage({ type: "save", slotId: id });
  }

  async function loadSave(id: string): Promise<void> {
    try {
      const save = await repository.load(id);
      if (save === undefined) throw new Error("Save slot was not found.");
      technicalLimitsRef.current = save.metadata.technicalLimits ?? {};
      worker.current?.postMessage(
        {
          type: "load",
          slotId: id,
          buffer: save.snapshot,
          technicalLimits: technicalLimitsRef.current
        },
        [save.snapshot]
      );
      setSpeedState(settings.defaultSpeed);
      worker.current?.postMessage(
        settings.defaultSpeed === 0
          ? { type: "pause" }
          : { type: "setSpeed", multiplier: settings.defaultSpeed }
      );
      const restoredEvents = save.journal.flatMap(eventFromJournal);
      eventRef.current = restoredEvents;
      setEvents(restoredEvents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the save.");
    }
  }

  const requestHistory = useCallback(
    (series: readonly HistorySeriesSelector[], horizonTicks: number): void => {
      historyRequestId.current += 1;
      worker.current?.postMessage({
        type: "history",
        request: { id: historyRequestId.current, series, horizonTicks }
      });
    },
    []
  );

  if (screen === "newgame") {
    return (
      <>
        <NewGameScreen onStart={startGame} onOpenSaves={() => setShowSaves(true)} />
        {error.length > 0 ? <div className="global-error">{error}</div> : null}
        {showSaves ? (
          <SavesPanel
            repository={repository}
            revision={saveRevision}
            canSave={false}
            onSave={requestSave}
            onLoad={(id) => void loadSave(id)}
            onClose={() => setShowSaves(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <main className="shell" aria-label="Galaxy Sim observatory">
      <header className="topbar">
        <button className="wordmark" type="button" onClick={() => setScreen("newgame")}>
          GALAXY / OBSERVATORY
        </button>
        <nav>
          <button
            className={screen === "galaxy" ? "active" : ""}
            type="button"
            onClick={() => setScreen("galaxy")}
          >
            Galaxy
          </button>
          <button
            className={screen === "charts" ? "active" : ""}
            type="button"
            onClick={() => setScreen("charts")}
          >
            Data
          </button>
          <button type="button" onClick={() => setShowSaves(true)}>
            Saves
          </button>
          <button type="button" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </nav>
        <div className="topbar-status">
          <span className={ready ? "status-dot ready" : "status-dot"} />
          {ready ? `Year ${Math.floor((stats?.tick ?? 0) / 365).toLocaleString()}` : "Generating…"}
        </div>
      </header>
      {error.length > 0 ? (
        <div className="global-error" role="alert">
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      ) : null}
      {screen === "system" ? (
        <SystemView view={systemView} onBack={() => setScreen("galaxy")} />
      ) : (
        <div className="workspace">
          <section className="primary-view">
            {screen === "galaxy" ? (
              <>
                <div ref={mapHost} className="map-host" />
                <MapControls
                  mode={colorMode}
                  resource={deficitResource}
                  onMode={setColorMode}
                  onResource={setDeficitResource}
                />
              </>
            ) : (
              <DataCharts
                history={history}
                factions={stats?.factions ?? []}
                onRequest={requestHistory}
              />
            )}
          </section>
          <aside className="side">
            <Perf
              stats={stats}
              metrics={metrics}
              speed={speed}
              visible={settings.instrumentsVisible}
              onSpeed={setSpeed}
            />
            <EventFeed events={events} factions={stats?.factions} onFocusSystem={focusSystem} />
          </aside>
        </div>
      )}
      {showSaves ? (
        <SavesPanel
          repository={repository}
          revision={saveRevision}
          canSave
          onSave={requestSave}
          onLoad={(id) => void loadSave(id)}
          onClose={() => setShowSaves(false)}
        />
      ) : null}
      {showSettings ? (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      ) : null}
    </main>
  );
}

function MapControls({
  mode,
  resource,
  onMode,
  onResource
}: {
  readonly mode: MapColorMode;
  readonly resource: number;
  readonly onMode: (mode: MapColorMode) => void;
  readonly onResource: (resource: number) => void;
}): ReactElement {
  return (
    <div className="map-controls">
      <span className="eyebrow">Map layer</span>
      <div className="segmented">
        {(["ownership", "wealth", "deficit", "traffic", "tension"] as const).map((value) => (
          <button
            type="button"
            className={value === mode ? "active" : ""}
            key={value}
            onClick={() => onMode(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {mode === "deficit" ? (
        <select
          aria-label="Deficit resource"
          value={resource}
          onChange={(event) => onResource(Number(event.currentTarget.value))}
        >
          {data.resources.map((item, index) => (
            <option value={index} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      ) : null}
      <small>
        Click a system to enter the system view. Continuous zoom is intentionally omitted.
      </small>
    </div>
  );
}

function storyJournal(events: readonly RenderEvent[]): JournalEntry[] {
  return events.map((event) => ({
    tick: event.tick,
    kind: String(event.storyKind),
    milestone: event.milestone,
    payload: JSON.stringify(event)
  }));
}

function eventFromJournal(entry: JournalEntry): RenderEvent[] {
  try {
    return [JSON.parse(entry.payload) as RenderEvent];
  } catch {
    return [];
  }
}
