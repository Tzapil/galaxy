import {
  BattleSide,
  BattleState,
  BuildingState,
  type StageTwoSimulation
} from "@galaxy-sim/sim-core";

export interface SystemView {
  readonly tick: number;
  readonly id: number;
  readonly owner: number;
  readonly ownerLabel: string;
  readonly region: number;
  readonly bodies: readonly SystemBodyView[];
  readonly ships: readonly SystemShipView[];
  readonly gates: readonly SystemGateView[];
  readonly battle: SystemBattleView | undefined;
  readonly approximateBytes: number;
}

export interface SystemBodyView {
  readonly id: number;
  readonly type: number;
  readonly size: number;
  readonly habitability: number;
  readonly population: number;
  readonly populationCapacity: number;
  readonly slots: number;
  readonly usedSlots: number;
  readonly owner: number;
  readonly deposits: readonly SystemDepositView[];
  readonly buildings: readonly SystemBuildingView[];
  readonly stock: readonly number[];
  readonly prices: readonly number[];
}

export interface SystemDepositView {
  readonly resource: number;
  readonly yield: number;
}

export interface SystemBuildingView {
  readonly id: number;
  readonly type: number;
  readonly state: number;
  readonly stateResource: number;
  readonly remainingTicks: number;
  readonly assignedWorkers: number;
  readonly requiredWorkers: number;
}

export interface SystemShipView {
  readonly id: number;
  readonly faction: number;
  readonly role: number;
  readonly state: number;
}

export interface SystemGateView {
  readonly to: number;
  readonly travelTicks: number;
  readonly blocked: boolean;
}

export interface SystemBattleView {
  readonly id: number;
  readonly round: number;
  readonly band: number;
  readonly sideA: number;
  readonly sideB: number;
  readonly lossesA: number;
  readonly lossesB: number;
}

/** Builds only the selected-system slice; output size does not grow with the galaxy. */
export function buildSystemView(simulation: StageTwoSimulation, system: number): SystemView {
  const world = simulation.world;
  if (system < 0 || system >= world.systems.length) {
    throw new RangeError(`Unknown system ${system}.`);
  }
  const bodies: SystemBodyView[] = [];
  let body = world.systems.firstBody[system] ?? -1;
  while (body >= 0) {
    bodies.push(buildBody(simulation, body));
    body = world.bodies.nextInSystem[body] ?? -1;
  }
  const ships: SystemShipView[] = [];
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    const here = world.ships.currentSystem[ship] === system;
    const arriving =
      world.ships.toSystem[ship] === system &&
      (world.ships.arriveTick[ship] ?? -1) >= simulation.tick;
    if (!here && !arriving) continue;
    ships.push({
      id: ship,
      faction: world.ships.faction[ship] ?? -1,
      role: world.ships.role[ship] ?? 0,
      state: world.ships.state[ship] ?? 0
    });
  }
  const gates: SystemGateView[] = [];
  let gate = world.systems.firstGate[system] ?? -1;
  while (gate >= 0) {
    gates.push({
      to: world.gates.to[gate] ?? -1,
      travelTicks: world.gates.travelTicks[gate] ?? 0,
      blocked: world.gates.blocked[gate] === 1 || (world.gates.blockadedBy[gate] ?? -1) >= 0
    });
    gate = world.gates.nextInSystem[gate] ?? -1;
  }
  const battle = activeBattleView(simulation, system);
  const owner = world.systems.owner[system] ?? -1;
  const approximateBytes =
    96 +
    bodies.reduce(
      (sum, item) =>
        sum +
        96 +
        item.deposits.length * 16 +
        item.buildings.length * 48 +
        (item.stock.length + item.prices.length) * 8,
      0
    ) +
    ships.length * 20 +
    gates.length * 16 +
    (battle === undefined ? 0 : 48);
  return {
    tick: simulation.tick,
    id: system,
    owner,
    ownerLabel: owner >= 0 ? world.factions.label(owner) : "Нейтральная система",
    region: world.systems.region[system] ?? -1,
    bodies,
    ships,
    gates,
    battle,
    approximateBytes
  };
}

function buildBody(simulation: StageTwoSimulation, body: number): SystemBodyView {
  const { world, data } = simulation;
  const deposits: SystemDepositView[] = [];
  const firstDeposit = world.bodies.firstDeposit[body] ?? -1;
  const depositCount = world.bodies.depositCount[body] ?? 0;
  for (let offset = 0; offset < depositCount; offset += 1) {
    const deposit = firstDeposit + offset;
    deposits.push({
      resource: world.bodies.deposits.resource[deposit] ?? -1,
      yield: world.bodies.deposits.yield[deposit] ?? 0
    });
  }
  const buildings: SystemBuildingView[] = [];
  let building = world.bodies.firstBuilding[body] ?? -1;
  while (building >= 0) {
    const finishTick = world.buildings.finishTick[building] ?? -1;
    buildings.push({
      id: building,
      type: world.buildings.type[building] ?? -1,
      state: world.buildings.state[building] ?? BuildingState.UnderConstruction,
      stateResource: world.buildings.stateResource[building] ?? -1,
      remainingTicks: finishTick >= 0 ? Math.max(0, finishTick - simulation.tick) : 0,
      assignedWorkers: world.buildings.assignedWorkers[building] ?? 0,
      requiredWorkers: world.buildings.workersRequired[building] ?? 0
    });
    building = world.buildings.nextInBody[building] ?? -1;
  }
  const stock: number[] = [];
  const prices: number[] = [];
  const stockpile = world.bodies.stockpile[body] ?? -1;
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    stock.push(stockpile >= 0 ? world.stockpiles.get(stockpile, resource) : 0);
    prices.push(world.prices.price(body, resource));
  }
  const population = world.bodies.population[body] ?? 0;
  const populationCapacity = Math.min(
    2500,
    120 +
      (world.bodies.habitability[body] ?? 0) * 500 +
      (world.bodies.housing[body] ?? 0) * 90 +
      (world.bodies.buildingCount[body] ?? 0) * 2
  );
  return {
    id: body,
    type: world.bodies.type[body] ?? 0,
    size: world.bodies.size[body] ?? 0,
    habitability: world.bodies.habitability[body] ?? 0,
    population,
    populationCapacity,
    slots: world.bodies.slots[body] ?? 0,
    usedSlots: world.bodies.usedSlots[body] ?? 0,
    owner: world.bodies.owner[body] ?? -1,
    deposits,
    buildings,
    stock,
    prices
  };
}

function activeBattleView(
  simulation: StageTwoSimulation,
  system: number
): SystemBattleView | undefined {
  const battles = simulation.world.battles;
  for (let battle = 0; battle < battles.length; battle += 1) {
    if (battles.state[battle] !== BattleState.Active || battles.system[battle] !== system) continue;
    let sideA = 0;
    let sideB = 0;
    for (let row = 0; row < battles.ships.length; row += 1) {
      if (battles.shipBattle[row] !== battle || battles.shipActive[row] !== 1) continue;
      if (battles.shipSide[row] === BattleSide.A) sideA += 1;
      else if (battles.shipSide[row] === BattleSide.B) sideB += 1;
    }
    return {
      id: battle,
      round: battles.round[battle] ?? 0,
      band: battles.band[battle] ?? 0,
      sideA,
      sideB,
      lossesA: Math.max(0, (battles.initialA[battle] ?? 0) - sideA),
      lossesB: Math.max(0, (battles.initialB[battle] ?? 0) - sideB)
    };
  }
  return undefined;
}
