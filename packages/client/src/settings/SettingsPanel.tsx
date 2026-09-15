import type { WorkerSpeed } from "@galaxy-sim/sim-worker";
import { type ReactElement } from "react";

import { saveSettings, type AppSettings, type Theme } from "./settings.js";

export function SettingsPanel({
  settings,
  onChange,
  onClose
}: {
  readonly settings: AppSettings;
  readonly onChange: (settings: AppSettings) => void;
  readonly onClose: () => void;
}): ReactElement {
  function update(next: AppSettings): void {
    saveSettings(next);
    onChange(next);
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Application settings"
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Observer preferences</span>
            <h2>Settings</h2>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <label>
          <span>Default speed</span>
          <select
            value={settings.defaultSpeed}
            onChange={(event) =>
              update({
                ...settings,
                defaultSpeed: Number(event.currentTarget.value) as WorkerSpeed
              })
            }
          >
            {[0, 1, 10, 100, 1000].map((speed) => (
              <option value={speed} key={speed}>
                {speed === 0 ? "paused" : `x${speed}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Autosave interval (minutes; 0 disables)</span>
          <input
            type="number"
            min={0}
            max={120}
            value={settings.autosaveMinutes}
            onChange={(event) =>
              update({ ...settings, autosaveMinutes: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.instrumentsVisible}
            onChange={(event) =>
              update({ ...settings, instrumentsVisible: event.currentTarget.checked })
            }
          />
          <span>Show performance instruments</span>
        </label>
        <label>
          <span>Theme</span>
          <select
            value={settings.theme}
            onChange={(event) => update({ ...settings, theme: event.currentTarget.value as Theme })}
          >
            <option value="midnight">Midnight</option>
            <option value="light">Light</option>
            <option value="high-contrast">High contrast</option>
          </select>
        </label>
      </section>
    </div>
  );
}
