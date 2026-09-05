import {
  BuildingState,
  createDefaultStageOneData,
  type RenderBuilding,
  type RenderColony
} from "@galaxy-sim/sim-core";
import type { ReactElement } from "react";

const data = createDefaultStageOneData();

interface ColonyProps {
  readonly selectedSystem: number;
  readonly colonies: readonly RenderColony[];
  readonly buildings: readonly RenderBuilding[];
}

export function Colony({ selectedSystem, colonies, buildings }: ColonyProps): ReactElement {
  const colony =
    colonies.find((item) => item.system === selectedSystem) ??
    colonies.find((item) => item.population > 0);

  return (
    <section className="panel colony-panel">
      <h2>Colony</h2>
      {colony === undefined ? (
        <p className="muted">none</p>
      ) : (
        <>
          <div className="kv">
            <span>system</span>
            <b>{colony.system}</b>
            <span>body</span>
            <b>{colony.body}</b>
            <span>faction</span>
            <b>{colony.faction}</b>
            <span>pop</span>
            <b>{colony.population.toFixed(1)}</b>
            <span>unrest</span>
            <b>{colony.unrest.toFixed(2)}</b>
          </div>
          <table>
            <thead>
              <tr>
                <th>res</th>
                <th>stock</th>
                <th>price</th>
              </tr>
            </thead>
            <tbody>
              {data.sliceResourceIndices.map((resource, index) => (
                <tr key={resource}>
                  <td>{data.resources[resource]?.id ?? resource}</td>
                  <td>{(colony.stock[index] ?? 0).toFixed(0)}</td>
                  <td>{(colony.prices[index] ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="building-list">
            {buildings
              .filter((building) => building.body === colony.body)
              .map((building) => (
                <li key={building.id}>
                  <span>{data.buildings[building.type]?.name ?? `building ${building.type}`}</span>
                  <b>{buildingStateText(building)}</b>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

function buildingStateText(building: RenderBuilding): string {
  const resource =
    building.stateResource >= 0
      ? (data.resources[building.stateResource]?.id ?? `res${building.stateResource}`)
      : "";
  switch (building.state) {
    case BuildingState.UnderConstruction:
      return "building";
    case BuildingState.Working:
      return "working";
    case BuildingState.IdleMissingInput:
      return `idle: no ${resource}`;
    case BuildingState.IdleNoWorkers:
      return "idle: workers";
    case BuildingState.IdleNoPower:
      return "idle: power";
    case BuildingState.IdleStorageFull:
      return `idle: full ${resource}`;
    default:
      return "idle";
  }
}
