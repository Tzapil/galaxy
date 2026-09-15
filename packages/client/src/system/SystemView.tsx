import { BodyType, BuildingState, createStageTwoDataFromGameData } from "@galaxy-sim/sim-core";
import { GAME_DATA } from "@galaxy-sim/sim-data/game-data";
import type {
  SystemBodyView,
  SystemBuildingView,
  SystemView as SystemSlice
} from "@galaxy-sim/sim-worker";
import { useEffect, useMemo, useState, type ReactElement } from "react";

const data = createStageTwoDataFromGameData(GAME_DATA);

export function SystemView({
  view,
  onBack
}: {
  readonly view: SystemSlice | undefined;
  readonly onBack: () => void;
}): ReactElement {
  const [selectedBodyId, setSelectedBodyId] = useState(-1);
  useEffect(() => setSelectedBodyId(view?.bodies[0]?.id ?? -1), [view?.id]);
  const selectedBody = useMemo(
    () => view?.bodies.find((body) => body.id === selectedBodyId) ?? view?.bodies[0],
    [selectedBodyId, view]
  );
  if (view === undefined) {
    return (
      <section className="system-screen loading-state">
        <button type="button" onClick={onBack}>
          ← Galaxy
        </button>
        <p>Receiving the selected-system slice…</p>
      </section>
    );
  }
  return (
    <section className="system-screen" aria-label={`System ${view.id}`}>
      <header className="system-header">
        <button type="button" onClick={onBack}>
          ← Galaxy map
        </button>
        <div>
          <span className="eyebrow">Region {view.region}</span>
          <h1>System {view.id}</h1>
        </div>
        <div className="system-owner">{view.ownerLabel}</div>
      </header>
      <div className="system-layout">
        <div className="system-orbits" aria-label="System objects">
          <div className="star" aria-label="Star" />
          {view.bodies.map((body, index) => (
            <button
              className={`orbital-body body-${body.type} ${selectedBody?.id === body.id ? "selected" : ""}`}
              style={{
                left: `${18 + ((index * 19) % 70)}%`,
                top: `${18 + ((index * 31) % 66)}%`
              }}
              type="button"
              key={body.id}
              onClick={() => setSelectedBodyId(body.id)}
              title={`${bodyTypeName(body.type)} ${body.id}`}
            >
              <span>{bodyTypeGlyph(body.type)}</span>
              <small>{body.id}</small>
            </button>
          ))}
          <div className="gate-list">
            {view.gates.map((gate) => (
              <span className={gate.blocked ? "blocked" : ""} key={gate.to}>
                Gate → {gate.to} · {gate.travelTicks}d {gate.blocked ? "· BLOCKED" : ""}
              </span>
            ))}
          </div>
          <div className="ship-cloud">{view.ships.length} ships / transports in system</div>
          {view.battle !== undefined ? (
            <div className="battle-state">
              <strong>
                Battle #{view.battle.id} · round {view.battle.round}
              </strong>
              <span>Range band {view.battle.band}</span>
              <span>
                A {view.battle.sideA} (lost {view.battle.lossesA}) · B {view.battle.sideB} (lost{" "}
                {view.battle.lossesB})
              </span>
            </div>
          ) : null}
        </div>
        <BodyPanel body={selectedBody} tick={view.tick} />
      </div>
    </section>
  );
}

function BodyPanel({
  body,
  tick
}: {
  readonly body: SystemBodyView | undefined;
  readonly tick: number;
}): ReactElement {
  if (body === undefined)
    return <aside className="body-panel empty-state">No bodies in this system.</aside>;
  return (
    <aside className="body-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{bodyTypeName(body.type)}</span>
          <h2>Body {body.id}</h2>
        </div>
        <span className="count-pill">
          {body.usedSlots}/{body.slots} slots
        </span>
      </div>
      <div className="metric-grid">
        <Metric label="Size" value={body.size.toFixed(2)} />
        <Metric label="Habitability" value={`${(body.habitability * 100).toFixed(0)}%`} />
        <Metric label="Population" value={body.population.toFixed(1)} />
        <Metric label="Capacity" value={body.populationCapacity.toFixed(1)} />
      </div>
      <h3>Deposits</h3>
      <div className="chip-row">
        {body.deposits.length === 0 ? (
          <span className="muted">none</span>
        ) : (
          body.deposits.map((deposit) => (
            <span className="data-chip" key={`${deposit.resource}-${deposit.yield}`}>
              {data.resources[deposit.resource]?.name ?? deposit.resource} ×
              {deposit.yield.toFixed(2)}
            </span>
          ))
        )}
      </div>
      <h3>Buildings and active batches</h3>
      <ul className="building-cards">
        {body.buildings.map((building) => (
          <li key={building.id}>
            <span>{data.buildings[building.type]?.name ?? `Building ${building.type}`}</span>
            <strong>{buildingStateText(building, tick)}</strong>
          </li>
        ))}
      </ul>
      <h3>Local stock and shadow prices</h3>
      <div className="resource-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Stock</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {data.resources.map((resource, index) => (
              <tr key={resource.id}>
                <td>{resource.name}</td>
                <td>{(body.stock[index] ?? 0).toFixed(1)}</td>
                <td>{(body.prices[index] ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </aside>
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

export function buildingStateText(building: SystemBuildingView, tick: number): string {
  const resource =
    building.stateResource >= 0
      ? (data.resources[building.stateResource]?.name ?? `resource ${building.stateResource}`)
      : "";
  if (building.state === BuildingState.UnderConstruction)
    return `building: ${Math.max(0, building.remainingTicks).toFixed(0)} days left`;
  if (building.state === BuildingState.Working) {
    return building.remainingTicks > 0
      ? `batch running: ${building.remainingTicks.toFixed(0)} days left`
      : "working";
  }
  if (building.state === BuildingState.IdleMissingInput) return `stopped: no ${resource}`;
  if (building.state === BuildingState.IdleNoWorkers)
    return `stopped: no workers (${building.assignedWorkers.toFixed(0)}/${building.requiredWorkers.toFixed(0)})`;
  if (building.state === BuildingState.IdleNoPower) return "stopped: no power";
  if (building.state === BuildingState.IdleStorageFull) return `stopped: ${resource} storage full`;
  if (building.state === BuildingState.Demolished) return "demolished";
  return `idle at tick ${tick}`;
}

function bodyTypeName(type: number): string {
  if (type === BodyType.AsteroidBelt) return "Asteroid belt";
  if (type === BodyType.GasGiant) return "Gas giant";
  if (type === BodyType.Station) return "Station";
  if (type === BodyType.Comet) return "Comet";
  return "Planet";
}

function bodyTypeGlyph(type: number): string {
  if (type === BodyType.AsteroidBelt) return "•••";
  if (type === BodyType.GasGiant) return "◉";
  if (type === BodyType.Station) return "◇";
  if (type === BodyType.Comet) return "☄";
  return "●";
}
