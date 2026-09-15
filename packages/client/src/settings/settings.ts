import type { WorkerSpeed } from "@galaxy-sim/sim-worker";

export type Theme = "midnight" | "light" | "high-contrast";

export interface AppSettings {
  readonly defaultSpeed: WorkerSpeed;
  readonly autosaveMinutes: number;
  readonly instrumentsVisible: boolean;
  readonly theme: Theme;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultSpeed: 10,
  autosaveMinutes: 10,
  instrumentsVisible: true,
  theme: "midnight"
};

const SETTINGS_KEY = "galaxy-sim.settings.v1";

export function loadSettings(storage: Pick<Storage, "getItem"> = localStorage): AppSettings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (raw === null) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      defaultSpeed: isSpeed(parsed.defaultSpeed)
        ? parsed.defaultSpeed
        : DEFAULT_SETTINGS.defaultSpeed,
      autosaveMinutes:
        typeof parsed.autosaveMinutes === "number" && parsed.autosaveMinutes >= 0
          ? parsed.autosaveMinutes
          : DEFAULT_SETTINGS.autosaveMinutes,
      instrumentsVisible:
        typeof parsed.instrumentsVisible === "boolean"
          ? parsed.instrumentsVisible
          : DEFAULT_SETTINGS.instrumentsVisible,
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(
  settings: AppSettings,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function isSpeed(value: unknown): value is WorkerSpeed {
  return value === 0 || value === 1 || value === 10 || value === 100 || value === 1000;
}

function isTheme(value: unknown): value is Theme {
  return value === "midnight" || value === "light" || value === "high-contrast";
}
