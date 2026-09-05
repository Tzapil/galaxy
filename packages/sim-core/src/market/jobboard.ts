import type { RoutePlanner } from "../nav/route.js";
import { resourceIndexOf, type StageOneData } from "../stage-one/data.js";
import type { GovernmentContracts } from "../treasury/contracts.js";
import type { StageOneWorld } from "../world/state.js";

export class JobBoard {
  public readonly faction: Uint16Array;
  public readonly sourceBody: Uint32Array;
  public readonly targetBody: Uint32Array;
  public readonly sourceSystem: Uint32Array;
  public readonly targetSystem: Uint32Array;
  public readonly resource: Uint16Array;
  public readonly quantity: Float64Array;
  public readonly travelTicks: Float64Array;
  public readonly score: Float64Array;
  public readonly reserved: Uint8Array;
  public count = 0;

  public constructor(public readonly capacity = 60) {
    this.faction = new Uint16Array(capacity);
    this.sourceBody = new Uint32Array(capacity);
    this.targetBody = new Uint32Array(capacity);
    this.sourceSystem = new Uint32Array(capacity);
    this.targetSystem = new Uint32Array(capacity);
    this.resource = new Uint16Array(capacity);
    this.quantity = new Float64Array(capacity);
    this.travelTicks = new Float64Array(capacity);
    this.score = new Float64Array(capacity);
    this.reserved = new Uint8Array(capacity);
  }

  public clear(): void {
    this.count = 0;
  }

  public takeBestForFaction(faction: number): number {
    for (let i = 0; i < this.count; i += 1) {
      if ((this.faction[i] ?? 0) === faction && this.reserved[i] !== 1) {
        this.reserved[i] = 1;
        return i;
      }
    }
    return -1;
  }

  public takeBestAtSystem(faction: number, system: number): number {
    for (let i = 0; i < this.count; i += 1) {
      if (
        (this.faction[i] ?? 0) === faction &&
        (this.sourceSystem[i] ?? 0) === system &&
        this.reserved[i] !== 1
      ) {
        this.reserved[i] = 1;
        return i;
      }
    }
    return -1;
  }

  public unreserve(job: number): void {
    if (job >= 0 && job < this.count) this.reserved[job] = 0;
  }

  public bestUnreservedForFaction(faction: number): number {
    for (let i = 0; i < this.count; i += 1) {
      if ((this.faction[i] ?? 0) === faction && this.reserved[i] !== 1) return i;
    }
    return -1;
  }

  public update(
    data: StageOneData,
    world: StageOneWorld,
    routes: RoutePlanner,
    contracts?: GovernmentContracts
  ): void {
    this.clear();
    const fuel = resourceIndexOf(data.resourceIndex, "fuel");
    for (let faction = 0; faction < world.factions.length; faction += 1) {
      let source = world.factions.firstColony[faction] ?? -1;
      while (source >= 0) {
        let target = world.factions.firstColony[faction] ?? -1;
        while (target >= 0) {
          if (target !== source)
            this.scanPair(data, world, routes, contracts, faction, source, target, fuel);
          target = world.bodies.nextInFaction[target] ?? -1;
        }
        source = world.bodies.nextInFaction[source] ?? -1;
      }
    }
  }

  private scanPair(
    data: StageOneData,
    world: StageOneWorld,
    routes: RoutePlanner,
    contracts: GovernmentContracts | undefined,
    faction: number,
    source: number,
    target: number,
    fuel: number
  ): void {
    const sourceSystem = world.bodies.system[source] ?? 0;
    const targetSystem = world.bodies.system[target] ?? 0;
    const route = routes.find(world.systems, world.gates, sourceSystem, targetSystem);
    if (!route.reachable) return;
    for (let resource = 0; resource < data.resources.length; resource += 1) {
      if (data.transportable[resource] !== 1) continue;
      const sourcePrice = world.prices.price(source, resource);
      const targetPrice = world.prices.price(target, resource);
      const subsidy = contracts?.subsidyFor(faction, target, resource) ?? 0;
      if (subsidy <= 0 && targetPrice <= sourcePrice * 1.25) continue;
      const reserve = resource === fuel ? 40 : 0;
      const sourceDemandReserve = Math.max(reserve, world.prices.demand(source, resource) * 60);
      const sourceStock = Math.max(
        0,
        world.stockpiles.get(world.bodies.stockpile[source] ?? 0, resource) - sourceDemandReserve
      );
      const targetSpace =
        world.stockpiles.capacity(world.bodies.stockpile[target] ?? 0, resource) -
        world.stockpiles.get(world.bodies.stockpile[target] ?? 0, resource);
      const demandWindow = Math.max(30, world.prices.demand(target, resource) * 60);
      const quantity = Math.max(0, Math.min(sourceStock, targetSpace, demandWindow));
      if (quantity <= 0.001) continue;
      const gain = (targetPrice + subsidy - sourcePrice) * quantity;
      if (gain <= 0) continue;
      this.pushSorted(
        faction,
        source,
        target,
        sourceSystem,
        targetSystem,
        resource,
        quantity,
        route.travelTicks,
        gain / Math.max(1, route.travelTicks)
      );
    }
  }

  private pushSorted(
    faction: number,
    sourceBody: number,
    targetBody: number,
    sourceSystem: number,
    targetSystem: number,
    resource: number,
    quantity: number,
    travelTicks: number,
    score: number
  ): void {
    if (this.count < this.capacity) {
      this.write(
        this.count,
        faction,
        sourceBody,
        targetBody,
        sourceSystem,
        targetSystem,
        resource,
        quantity,
        travelTicks,
        score
      );
      this.count += 1;
      this.bubbleUp(this.count - 1);
      return;
    }
    if (this.compareIncoming(score, sourceBody, targetBody, resource, this.capacity - 1) >= 0)
      return;
    this.write(
      this.capacity - 1,
      faction,
      sourceBody,
      targetBody,
      sourceSystem,
      targetSystem,
      resource,
      quantity,
      travelTicks,
      score
    );
    this.bubbleUp(this.capacity - 1);
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0 && this.compareRows(current, current - 1) < 0) {
      this.swap(current, current - 1);
      current -= 1;
    }
  }

  private compareRows(a: number, b: number): number {
    const scoreA = this.score[a] ?? 0;
    const scoreB = this.score[b] ?? 0;
    if (scoreA !== scoreB) return scoreA > scoreB ? -1 : 1;
    const sourceA = this.sourceBody[a] ?? 0;
    const sourceB = this.sourceBody[b] ?? 0;
    if (sourceA !== sourceB) return sourceA - sourceB;
    const targetA = this.targetBody[a] ?? 0;
    const targetB = this.targetBody[b] ?? 0;
    if (targetA !== targetB) return targetA - targetB;
    return (this.resource[a] ?? 0) - (this.resource[b] ?? 0);
  }

  private compareIncoming(
    score: number,
    sourceBody: number,
    targetBody: number,
    resource: number,
    row: number
  ): number {
    const rowScore = this.score[row] ?? 0;
    if (score !== rowScore) return score > rowScore ? -1 : 1;
    const rowSource = this.sourceBody[row] ?? 0;
    if (sourceBody !== rowSource) return sourceBody - rowSource;
    const rowTarget = this.targetBody[row] ?? 0;
    if (targetBody !== rowTarget) return targetBody - rowTarget;
    return resource - (this.resource[row] ?? 0);
  }

  private write(
    row: number,
    faction: number,
    sourceBody: number,
    targetBody: number,
    sourceSystem: number,
    targetSystem: number,
    resource: number,
    quantity: number,
    travelTicks: number,
    score: number
  ): void {
    this.faction[row] = faction;
    this.sourceBody[row] = sourceBody;
    this.targetBody[row] = targetBody;
    this.sourceSystem[row] = sourceSystem;
    this.targetSystem[row] = targetSystem;
    this.resource[row] = resource;
    this.quantity[row] = quantity;
    this.travelTicks[row] = travelTicks;
    this.score[row] = score;
    this.reserved[row] = 0;
  }

  private swap(a: number, b: number): void {
    swapU16(this.faction, a, b);
    swapU32(this.sourceBody, a, b);
    swapU32(this.targetBody, a, b);
    swapU32(this.sourceSystem, a, b);
    swapU32(this.targetSystem, a, b);
    swapU16(this.resource, a, b);
    swapF64(this.quantity, a, b);
    swapF64(this.travelTicks, a, b);
    swapF64(this.score, a, b);
    swapU8(this.reserved, a, b);
  }
}

function swapU8(values: Uint8Array, a: number, b: number): void {
  const tmp = values[a] ?? 0;
  values[a] = values[b] ?? 0;
  values[b] = tmp;
}

function swapU16(values: Uint16Array, a: number, b: number): void {
  const tmp = values[a] ?? 0;
  values[a] = values[b] ?? 0;
  values[b] = tmp;
}

function swapU32(values: Uint32Array, a: number, b: number): void {
  const tmp = values[a] ?? 0;
  values[a] = values[b] ?? 0;
  values[b] = tmp;
}

function swapF64(values: Float64Array, a: number, b: number): void {
  const tmp = values[a] ?? 0;
  values[a] = values[b] ?? 0;
  values[b] = tmp;
}
