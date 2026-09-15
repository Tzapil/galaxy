import { BattleState } from "../combat/battle.js";
import { StageOneLogKind } from "../events/log.js";
import {
  calculateStoryImportance,
  isStoryMilestone,
  storyKindForLog,
  type StoryEventKind,
  type StoryImpact
} from "../events/story.js";
import type { StageOneWorld } from "../world/state.js";

export const STAGE_ONE_VIEW_MAGIC = 0x47533156;
export const STAGE_ONE_VIEW_VERSION = 2;

const MAX_RENDER_EVENTS = 512;
const SYSTEM_FIXED_BYTES = 56;
const GATE_BYTES = 16;
const COLONY_FIXED_BYTES = 32;
const SHIP_BYTES = 52;
const BUILDING_BYTES = 24;
const EVENT_BYTES = 64;

export const enum RenderSliceBit {
  Map = 1 << 0,
  Colonies = 1 << 1,
  Ships = 1 << 2,
  Buildings = 1 << 3,
  Events = 1 << 4
}

export const enum RenderSystemFlag {
  Capital = 1 << 0,
  RegionalCapital = 1 << 1,
  ActiveBattle = 1 << 2
}

export interface StageOneRenderSnapshot {
  readonly tick: number;
  readonly slices: number;
  readonly resourceCount: number;
  readonly systems: readonly RenderSystem[];
  readonly gates: readonly RenderGate[];
  readonly colonies: readonly RenderColony[];
  readonly ships: readonly RenderShip[];
  readonly buildings: readonly RenderBuilding[];
  readonly events: readonly RenderEvent[];
}

export interface RenderSystem {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly owner: number;
  readonly region: number;
  readonly wealth: number;
  readonly traffic: number;
  readonly tension: number;
  readonly flags: number;
  readonly deficits: readonly number[];
}

export interface RenderGate {
  readonly from: number;
  readonly to: number;
  readonly blocked: boolean;
  readonly regionBoundary: boolean;
  readonly traffic: number;
}

export interface RenderColony {
  readonly body: number;
  readonly system: number;
  readonly faction: number;
  readonly population: number;
  readonly unrest: number;
  readonly stock: readonly number[];
  readonly prices: readonly number[];
}

export interface RenderShip {
  readonly id: number;
  readonly state: number;
  readonly from: number;
  readonly to: number;
  readonly departTick: number;
  readonly arriveTick: number;
  readonly cargoResource: number;
  readonly cargoAmount: number;
  readonly faction: number;
}

export interface RenderBuilding {
  readonly id: number;
  readonly body: number;
  readonly type: number;
  readonly state: number;
  readonly stateResource: number;
  readonly finishTick: number;
}

export interface RenderEvent {
  readonly serial: number;
  readonly tick: number;
  readonly kind: StageOneLogKind;
  readonly storyKind: StoryEventKind;
  readonly importance: number;
  readonly milestone: boolean;
  readonly faction: number;
  readonly system: number;
  readonly body: number;
  readonly subject: number;
  readonly resource: number;
  readonly amount: number;
  readonly impact: StoryImpact;
}

/** Converts a technical log row into an observer event without mutating simulation state. */
export function renderStoryEventForRow(
  world: StageOneWorld,
  event: number
): RenderEvent | undefined {
  const log = world.eventLog;
  const kind = log.kind[event] ?? StageOneLogKind.BatchComplete;
  if (!isObserverStoryKind(kind)) return undefined;
  const subject = log.subject[event] ?? -1;
  const resource = log.resource[event] ?? -1;
  const amount = log.amount[event] ?? 0;
  const blueprint = kind === StageOneLogKind.ShipyardBuildComplete ? resource : -1;
  const mark = blueprint >= 0 ? (world.blueprints.mark[blueprint] ?? 0) : 0;
  const faction = factionForEvent(world, kind, subject, log.system[event] ?? -1, blueprint);
  const impact = impactForEvent(world, kind, subject, resource, amount, faction);
  const importance = calculateStoryImportance(impact);
  return {
    serial: log.serial[event] ?? 0,
    tick: log.tick[event] ?? 0,
    kind,
    storyKind: storyKindForLog(
      kind,
      mark,
      mark >= 4 && isFirstMarkFourCompletion(world, event, faction)
    ),
    importance,
    milestone: isStoryMilestone(importance),
    faction,
    system: log.system[event] ?? -1,
    body: log.body[event] ?? -1,
    subject,
    resource,
    amount,
    impact
  };
}

export function currentStoryEvents(world: StageOneWorld): RenderEvent[] {
  return observerStoryRows(world).flatMap((row) => {
    const event = renderStoryEventForRow(world, row);
    return event === undefined ? [] : [event];
  });
}

interface RenderSnapshotSource {
  readonly tick: number;
  readonly world: StageOneWorld;
}

interface MapMetrics {
  readonly wealth: Float64Array;
  readonly traffic: Float64Array;
  readonly tension: Float64Array;
  readonly flags: Uint8Array;
  readonly deficits: Float32Array;
}

export function buildStageOneRenderSnapshot(
  sim: RenderSnapshotSource,
  slices: number
): ArrayBuffer {
  const world = sim.world;
  const systemCount = has(slices, RenderSliceBit.Map) ? world.systems.length : 0;
  const gateCount = has(slices, RenderSliceBit.Map) ? world.gates.length / 2 : 0;
  const colonyCount = has(slices, RenderSliceBit.Colonies) ? countColonies(sim) : 0;
  const shipCount = has(slices, RenderSliceBit.Ships) ? world.ships.length : 0;
  const buildingCount = has(slices, RenderSliceBit.Buildings) ? world.buildings.length : 0;
  const eventRows = has(slices, RenderSliceBit.Events) ? observerStoryRows(world) : [];
  const eventCount = eventRows.length;
  const resourceCount = world.data.resources.length;
  const bytes =
    52 +
    systemCount * (SYSTEM_FIXED_BYTES + resourceCount * 4) +
    gateCount * GATE_BYTES +
    colonyCount * (COLONY_FIXED_BYTES + resourceCount * 16) +
    shipCount * SHIP_BYTES +
    buildingCount * BUILDING_BYTES +
    eventCount * EVENT_BYTES;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, STAGE_ONE_VIEW_MAGIC, true);
  offset += 4;
  view.setUint32(offset, STAGE_ONE_VIEW_VERSION, true);
  offset += 4;
  view.setFloat64(offset, sim.tick, true);
  offset += 8;
  view.setUint32(offset, slices, true);
  offset += 4;
  view.setUint32(offset, resourceCount, true);
  offset += 4;
  view.setUint32(offset, systemCount, true);
  offset += 4;
  view.setUint32(offset, gateCount, true);
  offset += 4;
  view.setUint32(offset, colonyCount, true);
  offset += 4;
  view.setUint32(offset, shipCount, true);
  offset += 4;
  view.setUint32(offset, buildingCount, true);
  offset += 4;
  view.setUint32(offset, eventCount, true);
  offset += 4;

  const mapMetrics = systemCount > 0 ? collectMapMetrics(world, resourceCount) : undefined;
  if (systemCount > 0 && mapMetrics !== undefined)
    offset = writeSystems(view, offset, sim, resourceCount, mapMetrics);
  if (gateCount > 0 && mapMetrics !== undefined) offset = writeGates(view, offset, sim, mapMetrics);
  if (colonyCount > 0) offset = writeColonies(view, offset, sim, resourceCount);
  if (shipCount > 0) offset = writeShips(view, offset, sim);
  if (buildingCount > 0) offset = writeBuildings(view, offset, sim);
  if (eventCount > 0) writeEvents(view, offset, sim, eventRows);
  return buffer;
}

export function decodeStageOneRenderSnapshot(buffer: ArrayBuffer): StageOneRenderSnapshot {
  const view = new DataView(buffer);
  let offset = 0;
  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== STAGE_ONE_VIEW_MAGIC) throw new Error("Invalid stage one view snapshot magic.");
  const version = view.getUint32(offset, true);
  offset += 4;
  if (version !== STAGE_ONE_VIEW_VERSION) throw new Error("Unsupported stage one view snapshot.");
  const tick = view.getFloat64(offset, true);
  offset += 8;
  const slices = view.getUint32(offset, true);
  offset += 4;
  const resourceCount = view.getUint32(offset, true);
  offset += 4;
  const systemCount = view.getUint32(offset, true);
  offset += 4;
  const gateCount = view.getUint32(offset, true);
  offset += 4;
  const colonyCount = view.getUint32(offset, true);
  offset += 4;
  const shipCount = view.getUint32(offset, true);
  offset += 4;
  const buildingCount = view.getUint32(offset, true);
  offset += 4;
  const eventCount = view.getUint32(offset, true);
  offset += 4;

  const systems: RenderSystem[] = [];
  for (let i = 0; i < systemCount; i += 1) {
    const deficits: number[] = [];
    const system: RenderSystem = {
      id: view.getUint32(offset, true),
      x: view.getFloat64(offset + 4, true),
      y: view.getFloat64(offset + 12, true),
      owner: view.getInt32(offset + 20, true),
      region: view.getInt32(offset + 24, true),
      wealth: view.getFloat64(offset + 28, true),
      traffic: view.getFloat64(offset + 36, true),
      tension: view.getFloat64(offset + 44, true),
      flags: view.getUint8(offset + 52),
      deficits
    };
    offset += SYSTEM_FIXED_BYTES;
    for (let resource = 0; resource < resourceCount; resource += 1) {
      deficits.push(view.getFloat32(offset, true));
      offset += 4;
    }
    systems.push(system);
  }

  const gates: RenderGate[] = [];
  for (let i = 0; i < gateCount; i += 1) {
    gates.push({
      from: view.getUint32(offset, true),
      to: view.getUint32(offset + 4, true),
      blocked: view.getUint8(offset + 8) === 1,
      regionBoundary: view.getUint8(offset + 9) === 1,
      traffic: view.getFloat32(offset + 12, true)
    });
    offset += GATE_BYTES;
  }

  const colonies: RenderColony[] = [];
  for (let i = 0; i < colonyCount; i += 1) {
    const stock: number[] = [];
    const prices: number[] = [];
    const body = view.getUint32(offset, true);
    const system = view.getUint32(offset + 4, true);
    const faction = view.getInt32(offset + 8, true);
    const population = view.getFloat64(offset + 12, true);
    const unrest = view.getFloat64(offset + 20, true);
    offset += COLONY_FIXED_BYTES;
    for (let resource = 0; resource < resourceCount; resource += 1) {
      stock.push(view.getFloat64(offset, true));
      prices.push(view.getFloat64(offset + 8, true));
      offset += 16;
    }
    colonies.push({ body, system, faction, population, unrest, stock, prices });
  }

  const ships: RenderShip[] = [];
  for (let i = 0; i < shipCount; i += 1) {
    ships.push({
      id: view.getUint32(offset, true),
      state: view.getUint8(offset + 4),
      from: view.getUint32(offset + 8, true),
      to: view.getUint32(offset + 12, true),
      departTick: view.getFloat64(offset + 16, true),
      arriveTick: view.getFloat64(offset + 24, true),
      cargoResource: view.getInt32(offset + 32, true),
      cargoAmount: view.getFloat64(offset + 40, true),
      faction: view.getInt32(offset + 48, true)
    });
    offset += SHIP_BYTES;
  }

  const buildings: RenderBuilding[] = [];
  for (let i = 0; i < buildingCount; i += 1) {
    buildings.push({
      id: view.getUint32(offset, true),
      body: view.getUint32(offset + 4, true),
      type: view.getUint16(offset + 8, true),
      state: view.getUint8(offset + 10),
      stateResource: view.getInt32(offset + 12, true),
      finishTick: view.getFloat64(offset + 16, true)
    });
    offset += BUILDING_BYTES;
  }

  const events: RenderEvent[] = [];
  for (let i = 0; i < eventCount; i += 1) {
    events.push({
      serial: view.getFloat64(offset, true),
      tick: view.getFloat64(offset + 8, true),
      kind: view.getUint16(offset + 16, true) as StageOneLogKind,
      storyKind: view.getUint8(offset + 18) as StoryEventKind,
      importance: view.getUint8(offset + 19),
      milestone: view.getUint8(offset + 20) === 1,
      faction: view.getInt32(offset + 24, true),
      system: view.getInt32(offset + 28, true),
      body: view.getInt32(offset + 32, true),
      subject: view.getInt32(offset + 36, true),
      resource: view.getInt32(offset + 40, true),
      amount: view.getFloat64(offset + 44, true),
      impact: {
        systemsAffected: view.getFloat32(offset + 52, true),
        productionValue: view.getFloat32(offset + 56, true),
        shipsAffected: view.getFloat32(offset + 60, true)
      }
    });
    offset += EVENT_BYTES;
  }

  return {
    tick,
    slices,
    resourceCount,
    systems,
    gates,
    colonies,
    ships,
    buildings,
    events
  };
}

function writeSystems(
  view: DataView,
  offset: number,
  sim: RenderSnapshotSource,
  resourceCount: number,
  metrics: MapMetrics
): number {
  const systems = sim.world.systems;
  let next = offset;
  for (let system = 0; system < systems.length; system += 1) {
    view.setUint32(next, system, true);
    view.setFloat64(next + 4, systems.x[system] ?? 0, true);
    view.setFloat64(next + 12, systems.y[system] ?? 0, true);
    view.setInt32(next + 20, systems.owner[system] ?? -1, true);
    view.setInt32(next + 24, systems.region[system] ?? -1, true);
    view.setFloat64(next + 28, metrics.wealth[system] ?? 0, true);
    view.setFloat64(next + 36, metrics.traffic[system] ?? 0, true);
    view.setFloat64(next + 44, metrics.tension[system] ?? 0, true);
    view.setUint8(next + 52, metrics.flags[system] ?? 0);
    next += SYSTEM_FIXED_BYTES;
    const base = system * resourceCount;
    for (let resource = 0; resource < resourceCount; resource += 1) {
      view.setFloat32(next, metrics.deficits[base + resource] ?? 0, true);
      next += 4;
    }
  }
  return next;
}

function writeGates(
  view: DataView,
  offset: number,
  sim: RenderSnapshotSource,
  metrics: MapMetrics
): number {
  const world = sim.world;
  let next = offset;
  for (let gate = 0; gate < world.gates.length; gate += 2) {
    const from = world.gates.from[gate] ?? 0;
    const to = world.gates.to[gate] ?? 0;
    view.setUint32(next, from, true);
    view.setUint32(next + 4, to, true);
    view.setUint8(
      next + 8,
      (world.gates.blocked[gate] ?? 0) === 1 || (world.gates.blockadedBy[gate] ?? -1) >= 0 ? 1 : 0
    );
    view.setUint8(
      next + 9,
      (world.systems.region[from] ?? -1) !== (world.systems.region[to] ?? -1) ? 1 : 0
    );
    view.setFloat32(
      next + 12,
      ((metrics.traffic[from] ?? 0) + (metrics.traffic[to] ?? 0)) / 2,
      true
    );
    next += GATE_BYTES;
  }
  return next;
}

function writeColonies(
  view: DataView,
  offset: number,
  sim: RenderSnapshotSource,
  resourceCount: number
): number {
  const world = sim.world;
  let next = offset;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) < 0 || (world.bodies.population[body] ?? 0) <= 0) continue;
    view.setUint32(next, body, true);
    view.setUint32(next + 4, world.bodies.system[body] ?? 0, true);
    view.setInt32(next + 8, world.bodies.owner[body] ?? -1, true);
    view.setFloat64(next + 12, world.bodies.population[body] ?? 0, true);
    view.setFloat64(next + 20, world.bodies.unrest[body] ?? 0, true);
    next += COLONY_FIXED_BYTES;
    const stockpile = world.bodies.stockpile[body] ?? 0;
    for (let resource = 0; resource < resourceCount; resource += 1) {
      view.setFloat64(next, world.stockpiles.get(stockpile, resource), true);
      view.setFloat64(next + 8, world.prices.price(body, resource), true);
      next += 16;
    }
  }
  return next;
}

function writeShips(view: DataView, offset: number, sim: RenderSnapshotSource): number {
  const ships = sim.world.ships;
  let next = offset;
  for (let ship = 0; ship < ships.length; ship += 1) {
    view.setUint32(next, ship, true);
    view.setUint8(next + 4, ships.state[ship] ?? 0);
    view.setUint32(next + 8, ships.fromSystem[ship] ?? 0, true);
    view.setUint32(next + 12, ships.toSystem[ship] ?? 0, true);
    view.setFloat64(next + 16, ships.departTick[ship] ?? -1, true);
    view.setFloat64(next + 24, ships.arriveTick[ship] ?? -1, true);
    view.setInt32(next + 32, ships.cargoResource[ship] ?? -1, true);
    view.setFloat64(next + 40, ships.cargoAmount[ship] ?? 0, true);
    view.setInt32(next + 48, ships.faction[ship] ?? -1, true);
    next += SHIP_BYTES;
  }
  return next;
}

function writeBuildings(view: DataView, offset: number, sim: RenderSnapshotSource): number {
  const buildings = sim.world.buildings;
  let next = offset;
  for (let building = 0; building < buildings.length; building += 1) {
    view.setUint32(next, building, true);
    view.setUint32(next + 4, buildings.body[building] ?? 0, true);
    view.setUint16(next + 8, buildings.type[building] ?? 0, true);
    view.setUint8(next + 10, buildings.state[building] ?? 0);
    view.setInt32(next + 12, buildings.stateResource[building] ?? -1, true);
    view.setFloat64(next + 16, buildings.finishTick[building] ?? -1, true);
    next += BUILDING_BYTES;
  }
  return next;
}

function writeEvents(
  view: DataView,
  offset: number,
  sim: RenderSnapshotSource,
  eventRows: readonly number[]
): number {
  const world = sim.world;
  let next = offset;
  for (let i = 0; i < eventRows.length; i += 1) {
    const event = renderStoryEventForRow(world, eventRows[i] ?? 0);
    if (event === undefined) continue;
    view.setFloat64(next, event.serial, true);
    view.setFloat64(next + 8, event.tick, true);
    view.setUint16(next + 16, event.kind, true);
    view.setUint8(next + 18, event.storyKind);
    view.setUint8(next + 19, event.importance);
    view.setUint8(next + 20, event.milestone ? 1 : 0);
    view.setInt32(next + 24, event.faction, true);
    view.setInt32(next + 28, event.system, true);
    view.setInt32(next + 32, event.body, true);
    view.setInt32(next + 36, event.subject, true);
    view.setInt32(next + 40, event.resource, true);
    view.setFloat64(next + 44, event.amount, true);
    view.setFloat32(next + 52, event.impact.systemsAffected, true);
    view.setFloat32(next + 56, event.impact.productionValue, true);
    view.setFloat32(next + 60, event.impact.shipsAffected, true);
    next += EVENT_BYTES;
  }
  return next;
}

function observerStoryRows(world: StageOneWorld): number[] {
  const rows: number[] = [];
  const log = world.eventLog;
  for (let index = 0; index < log.length; index += 1) {
    const row = log.recentRow(index);
    if (isObserverStoryKind(log.kind[row] ?? 0)) rows.push(row);
  }
  return rows.slice(-MAX_RENDER_EVENTS);
}

function isObserverStoryKind(kind: number): boolean {
  return (
    kind === StageOneLogKind.WarDeclared ||
    kind === StageOneLogKind.BattleStarted ||
    kind === StageOneLogKind.BattleEnded ||
    kind === StageOneLogKind.AiColonization ||
    kind === StageOneLogKind.BlockadeEnded ||
    kind === StageOneLogKind.PopulationWarning ||
    kind === StageOneLogKind.ResearchCompleted ||
    kind === StageOneLogKind.ShipyardBuildComplete ||
    kind === StageOneLogKind.Secession ||
    kind === StageOneLogKind.TreatySigned ||
    kind === StageOneLogKind.TreatyBroken ||
    kind === StageOneLogKind.PeaceConcluded ||
    kind === StageOneLogKind.CoalitionChanged ||
    kind === StageOneLogKind.AiStrategicGoal ||
    kind === StageOneLogKind.AiBottleneck ||
    kind === StageOneLogKind.AiBuildPlan ||
    kind === StageOneLogKind.AiFleetScale ||
    kind === StageOneLogKind.AiNoop ||
    kind === StageOneLogKind.ResearchChosen ||
    kind === StageOneLogKind.BlockadeResponse
  );
}

function collectMapMetrics(world: StageOneWorld, resourceCount: number): MapMetrics {
  const systemCount = world.systems.length;
  const wealth = new Float64Array(systemCount);
  const traffic = new Float64Array(systemCount);
  const tension = new Float64Array(systemCount);
  const flags = new Uint8Array(systemCount);
  const deficits = new Float32Array(systemCount * resourceCount);
  for (let body = 0; body < world.bodies.length; body += 1) {
    const system = world.bodies.system[body] ?? -1;
    if (system < 0) continue;
    const stockpile = world.bodies.stockpile[body] ?? -1;
    const population = world.bodies.population[body] ?? 0;
    if (stockpile < 0) continue;
    for (let resource = 0; resource < resourceCount; resource += 1) {
      const stock = world.stockpiles.get(stockpile, resource);
      const baseValue = Math.max(0.001, world.data.baseValue[resource] ?? 1);
      wealth[system] = (wealth[system] ?? 0) + stock * baseValue;
      const pricePressure = Math.max(0, world.prices.price(body, resource) / baseValue - 1) / 4;
      const need = population * (world.data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
      const reservePressure = need > 0 ? Math.max(0, 1 - stock / Math.max(0.001, need * 90)) : 0;
      const index = system * resourceCount + resource;
      deficits[index] = Math.min(1, Math.max(deficits[index] ?? 0, pricePressure, reservePressure));
    }
  }
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    const from = world.ships.fromSystem[ship] ?? -1;
    const to = world.ships.toSystem[ship] ?? -1;
    if (from >= 0) traffic[from] = (traffic[from] ?? 0) + 1;
    if (to >= 0 && to !== from) traffic[to] = (traffic[to] ?? 0) + 1;
  }
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    const capital = world.factions.capitalSystem[faction] ?? -1;
    if (capital >= 0) flags[capital] = (flags[capital] ?? 0) | RenderSystemFlag.Capital;
  }
  for (let row = 0; row < world.cohesion.length; row += 1) {
    const regional = world.cohesion.regionalCapitalSystem[row] ?? -1;
    if (regional >= 0) flags[regional] = (flags[regional] ?? 0) | RenderSystemFlag.RegionalCapital;
  }
  for (let battle = 0; battle < world.battles.length; battle += 1) {
    if (world.battles.state[battle] !== BattleState.Active) continue;
    const system = world.battles.system[battle] ?? -1;
    if (system >= 0) flags[system] = (flags[system] ?? 0) | RenderSystemFlag.ActiveBattle;
  }
  for (let system = 0; system < systemCount; system += 1) {
    const owner = world.systems.owner[system] ?? -1;
    const region = world.systems.region[system] ?? -1;
    const row = owner >= 0 && region >= 0 ? world.cohesion.row(owner, region) : -1;
    tension[system] = row >= 0 ? (world.cohesion.tension[row] ?? 0) : 0;
  }
  return { wealth, traffic, tension, flags, deficits };
}

function factionForEvent(
  world: StageOneWorld,
  kind: StageOneLogKind,
  subject: number,
  system: number,
  blueprint: number
): number {
  if (
    kind === StageOneLogKind.WarDeclared ||
    kind === StageOneLogKind.Secession ||
    kind === StageOneLogKind.ResearchCompleted ||
    kind === StageOneLogKind.AiBottleneck ||
    kind === StageOneLogKind.AiColonization ||
    kind === StageOneLogKind.AiFleetScale ||
    kind === StageOneLogKind.AiNoop
  ) {
    return subject;
  }
  if (blueprint >= 0) return world.blueprints.faction[blueprint] ?? -1;
  return system >= 0 ? (world.systems.owner[system] ?? -1) : -1;
}

function impactForEvent(
  world: StageOneWorld,
  kind: StageOneLogKind,
  subject: number,
  resource: number,
  amount: number,
  faction: number
): StoryImpact {
  let systemsAffected = subject >= 0 ? 1 : 0;
  let productionValue = Math.abs(amount) * (world.data.baseValue[resource] ?? 1);
  let shipsAffected = 0;
  if (kind === StageOneLogKind.WarDeclared) {
    const defender = Math.trunc(amount);
    systemsAffected = ownedSystemCount(world, faction) + ownedSystemCount(world, defender);
    shipsAffected = factionShipCount(world, faction) + factionShipCount(world, defender);
  } else if (kind === StageOneLogKind.BattleStarted || kind === StageOneLogKind.BattleEnded) {
    systemsAffected = 1;
    shipsAffected = (world.battles.initialA[subject] ?? 0) + (world.battles.initialB[subject] ?? 0);
    productionValue = battleProductionValue(world, subject);
  } else if (kind === StageOneLogKind.Secession) {
    systemsAffected = ownedSystemCount(world, subject);
    productionValue = factionProductionValue(world, subject);
  } else if (kind === StageOneLogKind.ResearchCompleted) {
    const tech = world.data.techs[resource];
    productionValue =
      (tech?.physicsCost ?? tech?.basePhysicsCost ?? 0) +
      (tech?.engineeringCost ?? tech?.baseEngineeringCost ?? 0) +
      (tech?.bioCost ?? tech?.baseBioCost ?? 0);
  } else if (kind === StageOneLogKind.ShipyardBuildComplete) {
    productionValue = world.blueprints.cost[resource] ?? 0;
    shipsAffected = 1;
  } else if (kind === StageOneLogKind.AiColonization) {
    systemsAffected = 1;
    const body = world.factions.capitalBody[faction] ?? -1;
    productionValue = body >= 0 ? (world.bodies.population[body] ?? 0) : Math.abs(amount);
  }
  return { systemsAffected, productionValue, shipsAffected };
}

function ownedSystemCount(world: StageOneWorld, faction: number): number {
  if (faction < 0) return 0;
  let count = 0;
  for (let system = 0; system < world.systems.length; system += 1) {
    if ((world.systems.owner[system] ?? -1) === faction) count += 1;
  }
  return count;
}

function factionShipCount(world: StageOneWorld, faction: number): number {
  if (faction < 0) return 0;
  let count = 0;
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if ((world.ships.faction[ship] ?? -1) === faction) count += 1;
  }
  return count;
}

function factionProductionValue(world: StageOneWorld, faction: number): number {
  let value = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    if ((world.bodies.owner[body] ?? -1) !== faction) continue;
    const stockpile = world.bodies.stockpile[body] ?? -1;
    if (stockpile < 0) continue;
    for (let resource = 0; resource < world.data.resources.length; resource += 1) {
      value += world.stockpiles.get(stockpile, resource) * (world.data.baseValue[resource] ?? 1);
    }
  }
  return value;
}

function battleProductionValue(world: StageOneWorld, battle: number): number {
  let value = 0;
  for (let row = 0; row < world.battles.ships.length; row += 1) {
    if ((world.battles.shipBattle[row] ?? -1) !== battle) continue;
    const ship = world.battles.ship[row] ?? -1;
    const blueprint = ship >= 0 ? (world.ships.blueprint[ship] ?? -1) : -1;
    if (blueprint < 0) continue;
    value += world.blueprints.cost[blueprint] ?? 0;
  }
  return value;
}

function isFirstMarkFourCompletion(
  world: StageOneWorld,
  eventRow: number,
  faction: number
): boolean {
  const currentSerial = world.eventLog.serial[eventRow] ?? Number.POSITIVE_INFINITY;
  for (let row = 0; row < world.eventLog.length; row += 1) {
    if (row === eventRow || world.eventLog.kind[row] !== StageOneLogKind.ShipyardBuildComplete)
      continue;
    const blueprint = world.eventLog.resource[row] ?? -1;
    if (
      (world.eventLog.serial[row] ?? Number.POSITIVE_INFINITY) < currentSerial &&
      (world.blueprints.mark[blueprint] ?? 0) >= 4 &&
      (world.blueprints.faction[blueprint] ?? -1) === faction
    ) {
      return false;
    }
  }
  if (currentSerial < 4096) return true;
  let survivingMarkFourShips = 0;
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    if ((world.ships.faction[ship] ?? -1) !== faction) continue;
    const blueprint = world.ships.blueprint[ship] ?? -1;
    if ((world.blueprints.mark[blueprint] ?? 0) >= 4) survivingMarkFourShips += 1;
  }
  return survivingMarkFourShips <= 1;
}

function countColonies(sim: RenderSnapshotSource): number {
  let count = 0;
  for (let body = 0; body < sim.world.bodies.length; body += 1) {
    if ((sim.world.bodies.owner[body] ?? -1) >= 0 && (sim.world.bodies.population[body] ?? 0) > 0)
      count += 1;
  }
  return count;
}

function has(slices: number, bit: RenderSliceBit): boolean {
  return (slices & bit) === bit;
}
