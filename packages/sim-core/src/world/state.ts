import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
import { Buildings } from "../econ/buildings.js";
import { Battles } from "../combat/battle.js";
import { Fleets } from "../fleet/fleet.js";
import { IntelMemory } from "../intel/memory.js";
import { MarketPrices } from "../market/prices.js";
import { SupplyEma } from "../pop/supply-ema.js";
import { StageOneEventLog } from "../events/log.js";
import { Blueprints } from "../ships/blueprint.js";
import { KitOrders } from "../ships/kit-order.js";
import { ShipRole, Ships } from "../ships/ships.js";
import { ShipyardOrders } from "../ships/shipyard.js";
import { TechGraph } from "../tech/graph.js";
import { TechModifierCache, refreshFactionBuildingWorkers } from "../tech/modifiers.js";
import { FactionTechState } from "../tech/state.js";
import { Wars } from "../war/state.js";
import { Relations } from "../diplo/relations.js";
import { DiplomaticNavigation, Treaties } from "../diplo/treaty.js";
import { WarGoals } from "../diplo/war-goals.js";
import { FactionDynamics, RegionCohesion } from "../cohesion/state.js";

import { Bodies, BodyType } from "./bodies.js";
import { ColonyHistory } from "./colonies.js";
import { Factions } from "./factions.js";
import { Gates } from "./gates.js";
import { CapitalDistances, Regions } from "./regions.js";
import { Stockpiles } from "./stockpiles.js";
import { Systems } from "./systems.js";

export interface StageOneWorldCapacities {
  readonly systems: number;
  readonly gates: number;
  readonly bodies: number;
  readonly stockpiles: number;
  readonly factions: number;
  readonly buildings: number;
  readonly ships: number;
  readonly regions: number;
  readonly blueprints: number;
  readonly kitOrders: number;
  readonly shipyardOrders: number;
  readonly fleets: number;
  readonly fleetMembers: number;
  readonly wars: number;
  readonly battles: number;
  readonly battleShips: number;
  readonly intel: number;
  readonly colonyHistory: number;
  readonly relations: number;
  readonly treaties: number;
  readonly warGoals: number;
  readonly cohesion: number;
}

export class StageOneWorld {
  public constructor(
    public readonly data: StageOneData,
    public readonly systems: Systems,
    public readonly gates: Gates,
    public readonly bodies: Bodies,
    public readonly colonyHistory: ColonyHistory,
    public readonly stockpiles: Stockpiles,
    public readonly factions: Factions,
    public readonly regions: Regions,
    public readonly capitalDistances: CapitalDistances,
    public readonly buildings: Buildings,
    public readonly ships: Ships,
    public readonly supply: SupplyEma,
    public readonly prices: MarketPrices,
    public readonly techGraph: TechGraph,
    public readonly techState: FactionTechState,
    public readonly techModifiers: TechModifierCache,
    public readonly blueprints: Blueprints,
    public readonly kitOrders: KitOrders,
    public readonly shipyardOrders: ShipyardOrders,
    public readonly fleets: Fleets,
    public readonly wars: Wars,
    public readonly battles: Battles,
    public readonly intel: IntelMemory,
    public readonly relations: Relations,
    public readonly treaties: Treaties,
    public readonly warGoals: WarGoals,
    public readonly factionDynamics: FactionDynamics,
    public readonly cohesion: RegionCohesion,
    public readonly eventLog: StageOneEventLog
  ) {
    this.navigation = new DiplomaticNavigation(wars, treaties);
  }

  public readonly navigation: DiplomaticNavigation;

  public static create(
    data: StageOneData,
    capacities?: Partial<StageOneWorldCapacities>
  ): StageOneWorld {
    const bodyCapacity = capacities?.bodies ?? 96;
    const techGraph = TechGraph.create(data);
    return new StageOneWorld(
      data,
      Systems.create(capacities?.systems ?? 32),
      Gates.create(capacities?.gates ?? 96),
      Bodies.create(bodyCapacity),
      ColonyHistory.create(capacities?.colonyHistory ?? bodyCapacity),
      Stockpiles.create(data, capacities?.stockpiles ?? bodyCapacity),
      Factions.create(capacities?.factions ?? 4),
      Regions.create(capacities?.regions ?? 8),
      CapitalDistances.create(capacities?.systems ?? 32),
      Buildings.create(capacities?.buildings ?? 256),
      Ships.create(capacities?.ships ?? 64),
      SupplyEma.create(data, bodyCapacity),
      MarketPrices.create(data, bodyCapacity),
      techGraph,
      FactionTechState.create(data, capacities?.factions ?? 4),
      TechModifierCache.create(data, techGraph, capacities?.factions ?? 4),
      Blueprints.create(capacities?.blueprints ?? 32),
      KitOrders.create(data, capacities?.kitOrders ?? 64),
      ShipyardOrders.create(capacities?.shipyardOrders ?? 32),
      Fleets.create(capacities?.fleets ?? 32, capacities?.fleetMembers ?? 256),
      Wars.create(capacities?.wars ?? 16),
      Battles.create(capacities?.battles ?? 32, capacities?.battleShips ?? 512),
      IntelMemory.create(capacities?.intel ?? 32),
      Relations.create(capacities?.relations ?? 16),
      Treaties.create(capacities?.treaties ?? 32),
      WarGoals.create(capacities?.warGoals ?? 16),
      FactionDynamics.create(capacities?.factions ?? 4),
      RegionCohesion.create(capacities?.cohesion ?? 32),
      StageOneEventLog.create()
    );
  }

  public static fromSnapshots(
    data: StageOneData,
    snapshots: readonly ArenaSnapshot[]
  ): StageOneWorld {
    const systems = Systems.fromSnapshot(findArena(snapshots, "systems"));
    const gates = Gates.fromSnapshot(findArena(snapshots, "gates"));
    const bodies = Bodies.fromSnapshots(
      findArena(snapshots, "bodies"),
      findArena(snapshots, "deposits")
    );
    const colonyHistorySnapshot = optionalArena(snapshots, "colony_history");
    const colonyHistory =
      colonyHistorySnapshot === undefined
        ? createLegacyColonyHistory(bodies.length)
        : ColonyHistory.fromSnapshot(colonyHistorySnapshot);
    const stockpiles = Stockpiles.fromSnapshot(data, findArena(snapshots, "stockpiles"));
    const factions = Factions.fromSnapshot(findArena(snapshots, "factions"));
    if (colonyHistorySnapshot === undefined) {
      for (let body = 0; body < bodies.length; body += 1) {
        const owner = bodies.owner[body] ?? -1;
        if (owner >= 0) colonyHistory.recordFounded(body, owner, 0);
      }
    }
    const regions = optionalArena(snapshots, "regions");
    const capitalDistances = optionalArena(snapshots, "capital_distances");
    const buildings = Buildings.fromSnapshot(findArena(snapshots, "buildings"));
    const ships = Ships.fromSnapshot(findArena(snapshots, "ships"));
    const supply = SupplyEma.fromSnapshot(data, findArena(snapshots, "supply_ema"));
    const prices = MarketPrices.fromSnapshot(data, findArena(snapshots, "market_prices"));
    const techGraph = TechGraph.create(data);
    const techStateSnapshot = optionalArena(snapshots, "tech_state");
    const techState =
      techStateSnapshot === undefined
        ? FactionTechState.create(data, Math.max(1, factions.length))
        : FactionTechState.fromSnapshot(data, techStateSnapshot);
    ensureTechStateRows(data, techGraph, techState, factions.researchedCount, factions.length);
    const techModifiers = TechModifierCache.create(data, techGraph, factions.length);
    const blueprintsSnapshot = optionalArena(snapshots, "blueprints");
    const blueprints =
      blueprintsSnapshot === undefined
        ? Blueprints.create()
        : Blueprints.fromSnapshot(blueprintsSnapshot);
    const kitOrdersSnapshot = optionalArena(snapshots, "kit_orders");
    const kitOrders =
      kitOrdersSnapshot === undefined
        ? KitOrders.create(data)
        : KitOrders.fromSnapshot(data, kitOrdersSnapshot);
    const shipyardOrdersSnapshot = optionalArena(snapshots, "shipyard_orders");
    const shipyardOrders =
      shipyardOrdersSnapshot === undefined
        ? ShipyardOrders.create()
        : ShipyardOrders.fromSnapshot(shipyardOrdersSnapshot);
    const fleetSnapshot = optionalArena(snapshots, "fleets");
    const fleetMembersSnapshot = optionalArena(snapshots, "fleet_members");
    const fleets =
      fleetSnapshot === undefined || fleetMembersSnapshot === undefined
        ? Fleets.create()
        : Fleets.fromSnapshots(fleetSnapshot, fleetMembersSnapshot);
    const warsSnapshot = optionalArena(snapshots, "wars");
    const wars = warsSnapshot === undefined ? Wars.create() : Wars.fromSnapshot(warsSnapshot);
    const battleSnapshot = optionalArena(snapshots, "battles");
    const battleShipsSnapshot = optionalArena(snapshots, "battle_ships");
    const combatLogSnapshot = optionalArena(snapshots, "combat_log");
    const battles =
      battleSnapshot === undefined ||
      battleShipsSnapshot === undefined ||
      combatLogSnapshot === undefined
        ? Battles.create()
        : Battles.fromSnapshots(battleSnapshot, battleShipsSnapshot, combatLogSnapshot);
    const intelSnapshot = optionalArena(snapshots, "intel_memory");
    const intel =
      intelSnapshot === undefined ? IntelMemory.create() : IntelMemory.fromSnapshot(intelSnapshot);
    const relationSnapshot = optionalArena(snapshots, "relations");
    const relations =
      relationSnapshot === undefined
        ? Relations.create()
        : Relations.fromSnapshot(relationSnapshot);
    relations.ensureFactionCount(factions.length);
    const treatySnapshot = optionalArena(snapshots, "treaties");
    const treaties =
      treatySnapshot === undefined ? Treaties.create() : Treaties.fromSnapshot(treatySnapshot);
    const warGoalSnapshot = optionalArena(snapshots, "war_goals");
    const warGoals =
      warGoalSnapshot === undefined ? WarGoals.create() : WarGoals.fromSnapshot(warGoalSnapshot);
    const dynamicsSnapshot = optionalArena(snapshots, "faction_dynamics");
    const factionDynamics =
      dynamicsSnapshot === undefined
        ? FactionDynamics.create(Math.max(1, factions.length))
        : FactionDynamics.fromSnapshot(dynamicsSnapshot);
    while (factionDynamics.length < factions.length) {
      factionDynamics.addFaction(0, factionDynamics.length);
    }
    const cohesionSnapshot = optionalArena(snapshots, "region_cohesion");
    const cohesion =
      cohesionSnapshot === undefined
        ? RegionCohesion.create()
        : RegionCohesion.fromSnapshot(cohesionSnapshot);
    const eventLog = StageOneEventLog.fromSnapshot(findArena(snapshots, "stage_one_event_log"));
    systems.rebuildBodyTails(bodies.nextInSystem);
    systems.rebuildGateTails(gates.nextInSystem);
    bodies.rebuildBuildingTails(buildings.nextInBody);
    factions.rebuildColonyTails(bodies);
    return new StageOneWorld(
      data,
      systems,
      gates,
      bodies,
      colonyHistory,
      stockpiles,
      factions,
      regions === undefined ? Regions.create() : Regions.fromSnapshot(regions),
      capitalDistances === undefined
        ? CapitalDistances.create()
        : CapitalDistances.fromSnapshot(capitalDistances),
      buildings,
      ships,
      supply,
      prices,
      techGraph,
      techState,
      techModifiers,
      blueprints,
      kitOrders,
      shipyardOrders,
      fleets,
      wars,
      battles,
      intel,
      relations,
      treaties,
      warGoals,
      factionDynamics,
      cohesion,
      eventLog
    ).refreshAllTechModifiers();
  }

  public arenas(): readonly ArenaSnapshot[] {
    return [
      this.systems.arena.snapshot(),
      this.gates.arena.snapshot(),
      this.bodies.arena.snapshot(),
      this.bodies.deposits.arena.snapshot(),
      this.colonyHistory.arena.snapshot(),
      this.stockpiles.arena.snapshot(),
      this.factions.arena.snapshot(),
      ...this.regionArenas(),
      this.buildings.arena.snapshot(),
      this.ships.arena.snapshot(),
      this.supply.arena.snapshot(),
      this.prices.arena.snapshot(),
      this.techState.arena.snapshot(),
      this.blueprints.arena.snapshot(),
      this.kitOrders.arena.snapshot(),
      this.shipyardOrders.arena.snapshot(),
      this.fleets.arena.snapshot(),
      this.fleets.members.snapshot(),
      this.wars.arena.snapshot(),
      this.battles.arena.snapshot(),
      this.battles.ships.snapshot(),
      this.battles.log.arena.snapshot(),
      this.intel.arena.snapshot(),
      this.relations.arena.snapshot(),
      this.treaties.arena.snapshot(),
      this.warGoals.arena.snapshot(),
      this.factionDynamics.arena.snapshot(),
      this.cohesion.arena.snapshot(),
      this.eventLog.arena.snapshot()
    ];
  }

  private regionArenas(): readonly ArenaSnapshot[] {
    const arenas: ArenaSnapshot[] = [];
    if (this.regions.length > 0) arenas.push(this.regions.arena.snapshot());
    if (this.capitalDistances.length > 0) arenas.push(this.capitalDistances.arena.snapshot());
    return arenas;
  }

  public addBody(
    system: number,
    type: BodyType,
    size: number,
    habitability: number,
    slots: number,
    owner: number,
    population: number,
    featureMask = 0
  ): number {
    const expectedBody = this.bodies.length;
    const historyRow = this.colonyHistory.addBody();
    const stockpile = this.stockpiles.add();
    const supplyRow = this.supply.addBody();
    const priceRow = this.prices.addPoint();
    if (historyRow !== expectedBody || supplyRow !== expectedBody || priceRow !== expectedBody) {
      throw new RangeError("Body supply and price sidecar arenas must keep body row indexes.");
    }
    const body = this.bodies.add(
      this.systems,
      system,
      type,
      size,
      habitability,
      slots,
      owner,
      stockpile,
      population,
      featureMask
    );
    if (body !== expectedBody) {
      throw new RangeError("Body arena row index diverged from sidecar arenas.");
    }
    return body;
  }

  public addFaction(
    label: string,
    capitalSystem: number,
    capitalBody: number,
    treasury: number,
    expansion: number,
    industry: number,
    tick = 0,
    culture = -1,
    recordCapitalFounding = true
  ): number {
    const faction = this.factions.add(
      label,
      capitalSystem,
      capitalBody,
      treasury,
      expansion,
      industry
    );
    this.bodies.owner[capitalBody] = faction;
    this.systems.owner[capitalSystem] = faction;
    this.factions.attachColony(faction, capitalBody, this.bodies);
    if (recordCapitalFounding) this.colonyHistory.recordFounded(capitalBody, faction, tick);
    const techRow = this.techState.addFaction(this.techGraph.startTech);
    if (techRow !== faction) {
      throw new RangeError("Faction and technology state row indexes must match.");
    }
    this.techModifiers.recalculateFaction(this.data, this.techState, faction);
    this.factions.researchedCount[faction] = this.techState.countCompleted(faction);
    this.relations.ensureFactionCount(faction + 1);
    const dynamicsRow = this.factionDynamics.addFaction(tick, culture < 0 ? faction : culture);
    if (dynamicsRow !== faction) {
      throw new RangeError("Faction and long-horizon state row indexes must match.");
    }
    return faction;
  }

  public reviveFaction(
    faction: number,
    label: string,
    capitalSystem: number,
    capitalBody: number,
    treasury: number,
    expansion: number,
    industry: number,
    tick: number,
    culture: number
  ): number {
    this.factions.revive(faction, label, capitalSystem, capitalBody, treasury, expansion, industry);
    this.bodies.owner[capitalBody] = faction;
    this.systems.owner[capitalSystem] = faction;
    this.factions.attachColony(faction, capitalBody, this.bodies);
    this.techState.resetFaction(faction, this.techGraph.startTech);
    this.techModifiers.recalculateFaction(this.data, this.techState, faction);
    this.factions.researchedCount[faction] = this.techState.countCompleted(faction);
    this.relations.resetFaction(faction);
    this.factionDynamics.reviveFaction(faction, tick, culture);
    this.cohesion.resetFaction(faction);
    return faction;
  }

  public addColony(faction: number, body: number, population: number, tick = 0): void {
    const system = this.bodies.system[body] ?? 0;
    this.bodies.owner[body] = faction;
    this.bodies.population[body] = population;
    this.systems.owner[system] = faction;
    this.factions.attachColony(faction, body, this.bodies);
    this.colonyHistory.recordFounded(body, faction, tick);
  }

  public refreshAllTechModifiers(): this {
    this.techModifiers.ensureFactionRows(this.factions.length);
    for (let faction = 0; faction < this.factions.length; faction += 1) {
      this.techModifiers.recalculateFaction(this.data, this.techState, faction);
      refreshFactionBuildingWorkers(this.data, this, faction);
      this.factions.researchedCount[faction] = this.techState.countCompleted(faction);
    }
    return this;
  }

  public addHauler(
    faction: number,
    currentSystem: number,
    cargoCapacity: number,
    fuelCapacity: number,
    fuelPerJump: number
  ): number {
    const stockpile = this.stockpiles.add();
    return this.ships.addHauler(
      faction,
      currentSystem,
      stockpile,
      cargoCapacity,
      fuelCapacity,
      fuelPerJump
    );
  }

  public addShip(
    faction: number,
    currentSystem: number,
    role: ShipRole,
    cargoCapacity: number,
    fuelCapacity: number,
    fuelPerJump: number,
    blueprint = -1
  ): number {
    const stockpile = this.stockpiles.add();
    return this.ships.addShip(
      faction,
      currentSystem,
      stockpile,
      role,
      cargoCapacity,
      fuelCapacity,
      fuelPerJump,
      blueprint
    );
  }
}

function createLegacyColonyHistory(bodyCount: number): ColonyHistory {
  const history = ColonyHistory.create(Math.max(1, bodyCount));
  for (let body = 0; body < bodyCount; body += 1) history.addBody();
  return history;
}

function findArena(snapshots: readonly ArenaSnapshot[], name: string): ArenaSnapshot {
  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = snapshots[i];
    if (snapshot?.name === name) return snapshot;
  }
  throw new Error(`Stage one snapshot is missing arena "${name}".`);
}

function optionalArena(
  snapshots: readonly ArenaSnapshot[],
  name: string
): ArenaSnapshot | undefined {
  for (let i = 0; i < snapshots.length; i += 1) {
    const snapshot = snapshots[i];
    if (snapshot?.name === name) return snapshot;
  }
  return undefined;
}

function ensureTechStateRows(
  data: StageOneData,
  techGraph: TechGraph,
  techState: FactionTechState,
  oldResearchedCount: Uint16Array,
  factionCount: number
): void {
  while (techState.length < factionCount) {
    const faction = techState.addFaction(techGraph.startTech);
    const oldCount = oldResearchedCount[faction] ?? 0;
    for (let tech = 0; tech < Math.min(oldCount, data.techs.length); tech += 1) {
      if (tech === techGraph.startTech) continue;
      if (data.techs[tech]?.repeatable === true) continue;
      techState.markResearched(faction, tech);
    }
  }
}
