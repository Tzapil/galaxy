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
import { Stockpiles } from "./stockpiles.js";
import { Systems } from "./systems.js";
export declare class StageOneWorld {
    readonly data: StageOneData;
    readonly systems: Systems;
    readonly gates: Gates;
    readonly bodies: Bodies;
    readonly stockpiles: Stockpiles;
    readonly factions: Factions;
    readonly buildings: Buildings;
    readonly ships: Ships;
    readonly supply: SupplyEma;
    readonly prices: MarketPrices;
    readonly eventLog: StageOneEventLog;
    constructor(data: StageOneData, systems: Systems, gates: Gates, bodies: Bodies, stockpiles: Stockpiles, factions: Factions, buildings: Buildings, ships: Ships, supply: SupplyEma, prices: MarketPrices, eventLog: StageOneEventLog);
    static create(data: StageOneData): StageOneWorld;
    static fromSnapshots(data: StageOneData, snapshots: readonly ArenaSnapshot[]): StageOneWorld;
    arenas(): readonly ArenaSnapshot[];
    addBody(system: number, type: BodyType, size: number, habitability: number, slots: number, owner: number, population: number, featureMask?: number): number;
    addFaction(label: string, capitalSystem: number, capitalBody: number, treasury: number, expansion: number, industry: number): number;
    addColony(faction: number, body: number, population: number): void;
    addHauler(faction: number, currentSystem: number, cargoCapacity: number, fuelCapacity: number, fuelPerJump: number): number;
    addShip(faction: number, currentSystem: number, role: ShipRole, cargoCapacity: number, fuelCapacity: number, fuelPerJump: number): number;
}
//# sourceMappingURL=state.d.ts.map