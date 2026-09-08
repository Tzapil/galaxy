import type { ArenaSnapshot } from "../soa/arena.js";
import type { StageOneData } from "../stage-one/data.js";
import { Buildings } from "../econ/buildings.js";
import { MarketPrices } from "../market/prices.js";
import { SupplyEma } from "../pop/supply-ema.js";
import { StageOneEventLog } from "../events/log.js";
import { ShipRole, Ships } from "../ships/ships.js";

import { Bodies, BodyType } from "./bodies.js";
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
}

export class StageOneWorld {
  public constructor(
    public readonly data: StageOneData,
    public readonly systems: Systems,
    public readonly gates: Gates,
    public readonly bodies: Bodies,
    public readonly stockpiles: Stockpiles,
    public readonly factions: Factions,
    public readonly regions: Regions,
    public readonly capitalDistances: CapitalDistances,
    public readonly buildings: Buildings,
    public readonly ships: Ships,
    public readonly supply: SupplyEma,
    public readonly prices: MarketPrices,
    public readonly eventLog: StageOneEventLog
  ) {}

  public static create(
    data: StageOneData,
    capacities?: Partial<StageOneWorldCapacities>
  ): StageOneWorld {
    const bodyCapacity = capacities?.bodies ?? 96;
    return new StageOneWorld(
      data,
      Systems.create(capacities?.systems ?? 32),
      Gates.create(capacities?.gates ?? 96),
      Bodies.create(bodyCapacity),
      Stockpiles.create(data, capacities?.stockpiles ?? bodyCapacity),
      Factions.create(capacities?.factions ?? 4),
      Regions.create(capacities?.regions ?? 8),
      CapitalDistances.create(capacities?.systems ?? 32),
      Buildings.create(capacities?.buildings ?? 256),
      Ships.create(capacities?.ships ?? 64),
      SupplyEma.create(data, bodyCapacity),
      MarketPrices.create(data, bodyCapacity),
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
    const stockpiles = Stockpiles.fromSnapshot(data, findArena(snapshots, "stockpiles"));
    const factions = Factions.fromSnapshot(findArena(snapshots, "factions"));
    const regions = optionalArena(snapshots, "regions");
    const capitalDistances = optionalArena(snapshots, "capital_distances");
    const buildings = Buildings.fromSnapshot(findArena(snapshots, "buildings"));
    const ships = Ships.fromSnapshot(findArena(snapshots, "ships"));
    const supply = SupplyEma.fromSnapshot(data, findArena(snapshots, "supply_ema"));
    const prices = MarketPrices.fromSnapshot(data, findArena(snapshots, "market_prices"));
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
      eventLog
    );
  }

  public arenas(): readonly ArenaSnapshot[] {
    return [
      this.systems.arena.snapshot(),
      this.gates.arena.snapshot(),
      this.bodies.arena.snapshot(),
      this.bodies.deposits.arena.snapshot(),
      this.stockpiles.arena.snapshot(),
      this.factions.arena.snapshot(),
      ...this.regionArenas(),
      this.buildings.arena.snapshot(),
      this.ships.arena.snapshot(),
      this.supply.arena.snapshot(),
      this.prices.arena.snapshot(),
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
    const stockpile = this.stockpiles.add();
    const supplyRow = this.supply.addBody();
    const priceRow = this.prices.addPoint();
    if (supplyRow !== expectedBody || priceRow !== expectedBody) {
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
    industry: number
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
    return faction;
  }

  public addColony(faction: number, body: number, population: number): void {
    const system = this.bodies.system[body] ?? 0;
    this.bodies.owner[body] = faction;
    this.bodies.population[body] = population;
    this.systems.owner[system] = faction;
    this.factions.attachColony(faction, body, this.bodies);
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
    fuelPerJump: number
  ): number {
    const stockpile = this.stockpiles.add();
    return this.ships.addShip(
      faction,
      currentSystem,
      stockpile,
      role,
      cargoCapacity,
      fuelCapacity,
      fuelPerJump
    );
  }
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
