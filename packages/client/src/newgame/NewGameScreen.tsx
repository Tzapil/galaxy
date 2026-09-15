import { useMemo, useState, type ReactElement } from "react";

import {
  DEFAULT_NEW_GAME,
  NEW_GAME_PRESETS,
  previewPoints,
  validateNewGame,
  type NewGameConfig
} from "./model.js";

const numericFields: readonly {
  readonly key: Exclude<keyof NewGameConfig, "shape" | "unlimitedShips" | "unlimitedBuildings">;
  readonly label: string;
  readonly hint: string;
  readonly step: number;
}[] = [
  {
    key: "seed",
    label: "Seed",
    hint: "Deterministically controls the entire generation.",
    step: 1
  },
  {
    key: "systemCount",
    label: "Systems",
    hint: "Default 500; slider supports 2,000. Above that is at your own risk.",
    step: 1
  },
  { key: "armCount", label: "Spiral arms", hint: "Number of arms for the spiral shape.", step: 1 },
  {
    key: "armTightness",
    label: "Arm tightness",
    hint: "How tightly spiral arms curl.",
    step: 0.05
  },
  {
    key: "avgGateDegree",
    label: "Average gate degree",
    hint: "2 is tree-like; 5 produces porous fronts.",
    step: 0.1
  },
  {
    key: "gateDegreeVariance",
    label: "Gate variance",
    hint: "Higher values create hubs and dead ends.",
    step: 0.05
  },
  {
    key: "maxGateLength",
    label: "Max gate length",
    hint: "0 uses 1.5× average candidate distance.",
    step: 10
  },
  {
    key: "regionCount",
    label: "Regions",
    hint: "Strategic regions used for chokepoints and cohesion.",
    step: 1
  },
  {
    key: "chokepointStrength",
    label: "Chokepoint strength",
    hint: "0 is broad access; 1 leaves single passages.",
    step: 0.05
  },
  {
    key: "planetsPerSystemMin",
    label: "Planets min",
    hint: "Minimum generated bodies per system.",
    step: 1
  },
  {
    key: "planetsPerSystemMax",
    label: "Planets max",
    hint: "Maximum generated bodies per system.",
    step: 1
  },
  {
    key: "habitableFraction",
    label: "Habitable fraction",
    hint: "Share colonizable without terraforming.",
    step: 0.01
  },
  {
    key: "resourceClusterStrength",
    label: "Resource clustering",
    hint: "0 is even; 1 makes hard deposits.",
    step: 0.05
  },
  {
    key: "rareResourceAbundance",
    label: "Rare abundance",
    hint: "Share of systems carrying rare inputs.",
    step: 0.01
  },
  { key: "factionCount", label: "Factions", hint: "Number of starting civilizations.", step: 1 },
  {
    key: "factionMinJumps",
    label: "Faction spacing",
    hint: "Minimum jumps between starting systems.",
    step: 1
  },
  {
    key: "maxShips",
    label: "Ship safety cap",
    hint: "Technical guard; default 20,000.",
    step: 1000
  },
  {
    key: "maxBuildings",
    label: "Building safety cap",
    hint: "Technical guard; default 50,000.",
    step: 1000
  },
  {
    key: "targetTicksPerSecond",
    label: "Target ticks/sec",
    hint: "Target simulation rate, up to 1,000.",
    step: 10
  }
];

export function NewGameScreen({
  onStart,
  onOpenSaves
}: {
  readonly onStart: (config: NewGameConfig) => void;
  readonly onOpenSaves: () => void;
}): ReactElement {
  const [config, setConfig] = useState(DEFAULT_NEW_GAME);
  const errors = useMemo(() => validateNewGame(config), [config]);
  const points = useMemo(() => previewPoints(config), [config]);
  function setNumber(key: (typeof numericFields)[number]["key"], value: number): void {
    setConfig((current) => ({ ...current, [key]: value }));
  }
  return (
    <main className="new-game-screen">
      <section className="new-game-copy">
        <span className="brand-mark">GALAXY / OBSERVATORY</span>
        <h1>Build a history worth watching.</h1>
        <p>
          Set the constraints; civilizations write the story. The same seed and parameters always
          reconstruct the same galaxy.
        </p>
        <div className="preset-row">
          {NEW_GAME_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.id}
              onClick={() => setConfig({ ...preset.config, seed: config.seed })}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" onClick={onOpenSaves}>
            Load saved galaxy
          </button>
        </div>
        <GalaxyPreview points={points} />
        <div className="limit-note">
          <strong>“Unlimited” only removes a technical safety rail.</strong> Planet slots, workforce
          and treasury fleet upkeep always remain active game constraints.
        </div>
      </section>
      <section className="new-game-form" aria-label="New game parameters">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Generation parameters</span>
            <h2>New galaxy</h2>
          </div>
          <button
            type="button"
            onClick={() => setNumber("seed", crypto.getRandomValues(new Uint32Array(1))[0] ?? 1)}
          >
            Random seed
          </button>
        </div>
        <label>
          <span>
            Shape <small>disc / spiral / ring / cluster</small>
          </span>
          <select
            value={config.shape}
            onChange={(event) =>
              setConfig({ ...config, shape: event.currentTarget.value as NewGameConfig["shape"] })
            }
          >
            {["disc", "spiral", "ring", "cluster"].map((shape) => (
              <option key={shape}>{shape}</option>
            ))}
          </select>
        </label>
        <div className="parameter-grid">
          {numericFields.map((field) => (
            <label key={field.key} title={field.hint}>
              <span>
                {field.label}
                <small>
                  {field.hint}
                  {field.key === "systemCount" ? ` Current: ${config.systemCount}.` : ""}
                </small>
              </span>
              <input
                type={field.key === "systemCount" ? "range" : "number"}
                min={field.key === "systemCount" ? 1 : undefined}
                max={field.key === "systemCount" ? 2000 : undefined}
                step={field.step}
                value={config[field.key]}
                onChange={(event) => setNumber(field.key, Number(event.currentTarget.value))}
              />
            </label>
          ))}
        </div>
        <div className="unlimited-row">
          <label>
            <input
              type="checkbox"
              checked={config.unlimitedShips}
              onChange={(event) =>
                setConfig({ ...config, unlimitedShips: event.currentTarget.checked })
              }
            />{" "}
            Unlimited ships
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.unlimitedBuildings}
              onChange={(event) =>
                setConfig({ ...config, unlimitedBuildings: event.currentTarget.checked })
              }
            />{" "}
            Unlimited buildings
          </label>
        </div>
        {errors.length > 0 ? (
          <div className="validation-errors" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <div className="validation-ok">
            Parameters are viable · {points.length} deterministic systems previewed
          </div>
        )}
        <button
          className="primary launch-button"
          type="button"
          disabled={errors.length > 0}
          onClick={() => onStart(config)}
        >
          Generate and observe
        </button>
      </section>
    </main>
  );
}

function GalaxyPreview({
  points
}: {
  readonly points: readonly { readonly x: number; readonly y: number }[];
}): ReactElement {
  if (points.length === 0)
    return <div className="galaxy-preview empty-state">Fix validation errors to preview.</div>;
  let max = 1;
  for (const point of points) max = Math.max(max, Math.abs(point.x), Math.abs(point.y));
  return (
    <svg
      className="galaxy-preview"
      viewBox="-105 -105 210 210"
      role="img"
      aria-label="Deterministic galaxy preview"
    >
      {points.map((point, index) => (
        <circle
          key={index}
          cx={(point.x / max) * 95}
          cy={(point.y / max) * 95}
          r={points.length > 800 ? 0.45 : 0.75}
        />
      ))}
    </svg>
  );
}
