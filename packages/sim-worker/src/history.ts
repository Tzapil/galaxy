import { BuildingState, type StageTwoSimulation } from "@galaxy-sim/sim-core";

const DAILY_RETENTION = 365;
const MONTHLY_RETENTION = 1200;
const MAX_ANNUAL_POINTS = 20_000;
const HISTORY_MAGIC = 0x48535438;
const HISTORY_VERSION = 1;
const HISTORY_HEADER_BYTES = 40;

export type HistoryMetric =
  | "price"
  | "production"
  | "consumption"
  | "factionPower"
  | "population"
  | "systems"
  | "liveFactions"
  | "powerConcentration";

export interface HistorySeriesSelector {
  readonly metric: HistoryMetric;
  readonly resource?: number;
  readonly faction?: number;
  readonly label?: string;
}

export interface HistoryRequest {
  readonly id: number;
  readonly series: readonly HistorySeriesSelector[];
  readonly horizonTicks?: number;
}

export interface HistorySeries {
  readonly label: string;
  readonly values: readonly number[];
}

export interface HistoryPayload {
  readonly id: number;
  readonly ticks: readonly number[];
  readonly series: readonly HistorySeries[];
  readonly sourcePoints: number;
  readonly workerBytes: number;
}

export interface HistorySample {
  readonly tick: number;
  readonly prices: Float64Array;
  readonly production: Float64Array;
  readonly consumption: Float64Array;
  readonly factionPower: Float64Array;
  readonly population: number;
  readonly systems: number;
  readonly liveFactions: number;
  readonly powerConcentration: number;
}

interface HistoryPoint {
  readonly tick: number;
  readonly values: Float64Array;
  readonly minimum: Float64Array;
  readonly maximum: Float64Array;
}

/** Worker-owned, bounded multi-resolution history (spec 12.3). */
export class HistoryAccumulator {
  private readonly daily: HistoryPoint[] = [];
  private readonly monthly: HistoryPoint[] = [];
  private readonly annual: HistoryPoint[] = [];
  private resourceCount = 0;
  private factionCount = 0;
  private lastTick = -1;

  public capture(simulation: StageTwoSimulation): void {
    if (simulation.tick === this.lastTick) return;
    this.record(sampleSimulation(simulation));
  }

  public record(sample: HistorySample): void {
    if (sample.tick <= this.lastTick) return;
    if (this.resourceCount === 0) {
      this.resourceCount = sample.prices.length;
      this.factionCount = sample.factionPower.length;
    }
    if (
      sample.prices.length !== this.resourceCount ||
      sample.production.length !== this.resourceCount ||
      sample.consumption.length !== this.resourceCount
    ) {
      throw new RangeError("History resource columns changed during a run.");
    }
    if (sample.factionPower.length > this.factionCount) {
      this.expandFactionColumns(this.factionCount, sample.factionPower.length);
      this.factionCount = sample.factionPower.length;
    }
    this.daily.push(pointFromSample(sample, this.resourceCount, this.factionCount));
    this.lastTick = sample.tick;
    while (this.daily.length > DAILY_RETENTION) {
      const point = this.daily.shift();
      if (point !== undefined) appendBucket(this.monthly, point, 30);
    }
    while (this.monthly.length > MONTHLY_RETENTION) {
      const point = this.monthly.shift();
      if (point !== undefined) appendBucket(this.annual, point, 365);
    }
    if (this.annual.length > MAX_ANNUAL_POINTS) {
      this.annual.splice(0, this.annual.length - MAX_ANNUAL_POINTS);
    }
  }

  public query(request: HistoryRequest): HistoryPayload {
    const horizon = Math.max(1, request.horizonTicks ?? Number.POSITIVE_INFINITY);
    const fromTick = Math.max(0, this.lastTick - horizon);
    const points = [...this.annual, ...this.monthly, ...this.daily]
      .filter((point) => point.tick >= fromTick)
      .sort((left, right) => left.tick - right.tick);
    const ticks: number[] = [];
    const values = request.series.map(() => [] as number[]);
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const point = points[pointIndex];
      if (point === undefined) continue;
      appendVisiblePoint(ticks, values, point, request.series, this.resourceCount);
    }
    return {
      id: request.id,
      ticks,
      series: request.series.map((selector, index) => ({
        label: selector.label ?? defaultLabel(selector),
        values: values[index] ?? []
      })),
      sourcePoints: points.length,
      workerBytes: this.estimatedBytes()
    };
  }

  public estimatedBytes(): number {
    const width = this.resourceCount * 3 + this.factionCount + 4;
    return (this.daily.length + this.monthly.length + this.annual.length) * (8 + width * 24);
  }

  public get pointCount(): number {
    return this.daily.length + this.monthly.length + this.annual.length;
  }

  public serialize(): ArrayBuffer {
    const width = this.resourceCount * 3 + this.factionCount + 4;
    const pointBytes = (1 + width * 3) * 8;
    const buffer = new ArrayBuffer(HISTORY_HEADER_BYTES + this.pointCount * pointBytes);
    const view = new DataView(buffer);
    view.setUint32(0, HISTORY_MAGIC, true);
    view.setUint32(4, HISTORY_VERSION, true);
    view.setUint32(8, this.resourceCount, true);
    view.setUint32(12, this.factionCount, true);
    view.setUint32(16, this.daily.length, true);
    view.setUint32(20, this.monthly.length, true);
    view.setUint32(24, this.annual.length, true);
    view.setFloat64(32, this.lastTick, true);
    let offset = HISTORY_HEADER_BYTES;
    for (const points of [this.daily, this.monthly, this.annual]) {
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (point === undefined) throw new RangeError("History point is inconsistent.");
        view.setFloat64(offset, point.tick, true);
        offset += 8;
        offset = writeFloat64Array(buffer, offset, point.values, width);
        offset = writeFloat64Array(buffer, offset, point.minimum, width);
        offset = writeFloat64Array(buffer, offset, point.maximum, width);
      }
    }
    return buffer;
  }

  public static deserialize(buffer: ArrayBuffer): HistoryAccumulator {
    if (buffer.byteLength < HISTORY_HEADER_BYTES) throw new Error("History snapshot is truncated.");
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== HISTORY_MAGIC) throw new Error("Invalid history snapshot.");
    const version = view.getUint32(4, true);
    if (version !== HISTORY_VERSION) {
      throw new Error(`Unsupported history snapshot version ${version}.`);
    }
    const resourceCount = view.getUint32(8, true);
    const factionCount = view.getUint32(12, true);
    const counts = [
      view.getUint32(16, true),
      view.getUint32(20, true),
      view.getUint32(24, true)
    ] as const;
    const width = resourceCount * 3 + factionCount + 4;
    const pointCount = counts[0] + counts[1] + counts[2];
    const expectedBytes = HISTORY_HEADER_BYTES + pointCount * (1 + width * 3) * 8;
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes !== buffer.byteLength) {
      throw new Error("History snapshot has an invalid size.");
    }

    const history = new HistoryAccumulator();
    history.resourceCount = resourceCount;
    history.factionCount = factionCount;
    history.lastTick = view.getFloat64(32, true);
    let offset = HISTORY_HEADER_BYTES;
    const targets = [history.daily, history.monthly, history.annual] as const;
    for (let group = 0; group < targets.length; group += 1) {
      const target = targets[group];
      if (target === undefined) throw new RangeError("History bucket group is inconsistent.");
      const count = counts[group] ?? 0;
      for (let index = 0; index < count; index += 1) {
        const tick = view.getFloat64(offset, true);
        offset += 8;
        const values = new Float64Array(buffer.slice(offset, offset + width * 8));
        offset += width * 8;
        const minimum = new Float64Array(buffer.slice(offset, offset + width * 8));
        offset += width * 8;
        const maximum = new Float64Array(buffer.slice(offset, offset + width * 8));
        offset += width * 8;
        target.push({ tick, values, minimum, maximum });
      }
    }
    return history;
  }

  private expandFactionColumns(previousCount: number, nextCount: number): void {
    for (const points of [this.daily, this.monthly, this.annual]) {
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        if (point !== undefined) {
          points[index] = expandPoint(point, this.resourceCount, previousCount, nextCount);
        }
      }
    }
  }
}

function writeFloat64Array(
  buffer: ArrayBuffer,
  offset: number,
  source: Float64Array,
  width: number
): number {
  if (source.length !== width) throw new RangeError("History point width is inconsistent.");
  new Float64Array(buffer, offset, width).set(source);
  return offset + width * 8;
}

function sampleSimulation(simulation: StageTwoSimulation): HistorySample {
  const { world, data } = simulation;
  const resourceCount = data.resources.length;
  const prices = new Float64Array(resourceCount);
  const production = new Float64Array(resourceCount);
  const consumption = new Float64Array(resourceCount);
  const priceCounts = new Uint32Array(resourceCount);
  const factionPower = new Float64Array(world.factions.length);
  let population = 0;
  for (let body = 0; body < world.bodies.length; body += 1) {
    const owner = world.bodies.owner[body] ?? -1;
    if (owner < 0) continue;
    const bodyPopulation = world.bodies.population[body] ?? 0;
    population += bodyPopulation;
    factionPower[owner] = (factionPower[owner] ?? 0) + bodyPopulation;
    for (let resource = 0; resource < resourceCount; resource += 1) {
      prices[resource] = (prices[resource] ?? 0) + world.prices.price(body, resource);
      priceCounts[resource] = (priceCounts[resource] ?? 0) + 1;
      consumption[resource] =
        (consumption[resource] ?? 0) +
        bodyPopulation * (data.populationNeeds.perThousandPopPerDay[resource] ?? 0);
    }
  }
  for (let resource = 0; resource < resourceCount; resource += 1) {
    prices[resource] = (prices[resource] ?? 0) / Math.max(1, priceCounts[resource] ?? 0);
  }
  for (let building = 0; building < world.buildings.length; building += 1) {
    if (world.buildings.state[building] !== BuildingState.Working) continue;
    const batch = data.batchRecipes[world.buildings.batchRecipe[building] ?? -1];
    if (batch !== undefined) {
      addRates(production, batch.outputs, 1 / Math.max(1, batch.durationTicks));
      addRates(consumption, batch.inputs, 1 / Math.max(1, batch.durationTicks));
    }
    const continuous = data.continuous[world.buildings.continuousProcess[building] ?? -1];
    if (continuous !== undefined) {
      addRates(production, continuous.outputsPerTick, 1);
      addRates(consumption, continuous.inputsPerTick, 1);
    }
  }
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    factionPower[faction] =
      (factionPower[faction] ?? 0) + Math.max(0, world.factions.treasury[faction] ?? 0) * 0.01;
  }
  for (let ship = 0; ship < world.ships.length; ship += 1) {
    const faction = world.ships.faction[ship] ?? -1;
    if (faction < 0) continue;
    const blueprint = world.ships.blueprint[ship] ?? -1;
    factionPower[faction] =
      (factionPower[faction] ?? 0) +
      (blueprint >= 0 ? (world.blueprints.cost[blueprint] ?? 100) : 100);
  }
  let totalPower = 0;
  let liveFactions = 0;
  for (let faction = 0; faction < factionPower.length; faction += 1) {
    if (world.factionDynamics.alive[faction] === 1) liveFactions += 1;
    totalPower += factionPower[faction] ?? 0;
  }
  let powerConcentration = 0;
  if (totalPower > 0) {
    for (let faction = 0; faction < factionPower.length; faction += 1) {
      const share = (factionPower[faction] ?? 0) / totalPower;
      powerConcentration += share * share;
    }
  }
  return {
    tick: simulation.tick,
    prices,
    production,
    consumption,
    factionPower,
    population,
    systems: world.systems.length,
    liveFactions,
    powerConcentration
  };
}

function addRates(
  target: Float64Array,
  amounts: readonly { readonly resource: number; readonly amount: number }[],
  multiplier: number
): void {
  for (let i = 0; i < amounts.length; i += 1) {
    const item = amounts[i];
    if (item !== undefined)
      target[item.resource] = (target[item.resource] ?? 0) + item.amount * multiplier;
  }
}

function pointFromSample(
  sample: HistorySample,
  resourceCount: number,
  factionCount: number
): HistoryPoint {
  const values = new Float64Array(resourceCount * 3 + factionCount + 4);
  values.set(sample.prices, 0);
  values.set(sample.production, resourceCount);
  values.set(sample.consumption, resourceCount * 2);
  values.set(sample.factionPower, resourceCount * 3);
  const scalar = resourceCount * 3 + factionCount;
  values[scalar] = sample.population;
  values[scalar + 1] = sample.systems;
  values[scalar + 2] = sample.liveFactions;
  values[scalar + 3] = sample.powerConcentration;
  return { tick: sample.tick, values, minimum: values.slice(), maximum: values.slice() };
}

function appendBucket(points: HistoryPoint[], incoming: HistoryPoint, bucketTicks: number): void {
  const bucket = Math.floor(incoming.tick / bucketTicks);
  const last = points[points.length - 1];
  if (last === undefined || Math.floor(last.tick / bucketTicks) !== bucket) {
    points.push(clonePoint(incoming));
    return;
  }
  const width = Math.max(last.values.length, incoming.values.length);
  const values = resized(last.values, width);
  const minimum = resized(last.minimum, width, Number.POSITIVE_INFINITY);
  const maximum = resized(last.maximum, width, Number.NEGATIVE_INFINITY);
  for (let index = 0; index < width; index += 1) {
    values[index] = incoming.values[index] ?? values[index] ?? 0;
    minimum[index] = Math.min(
      minimum[index] ?? Number.POSITIVE_INFINITY,
      incoming.minimum[index] ?? 0
    );
    maximum[index] = Math.max(
      maximum[index] ?? Number.NEGATIVE_INFINITY,
      incoming.maximum[index] ?? 0
    );
  }
  points[points.length - 1] = { tick: incoming.tick, values, minimum, maximum };
}

function appendVisiblePoint(
  ticks: number[],
  values: number[][],
  point: HistoryPoint,
  selectors: readonly HistorySeriesSelector[],
  resourceCount: number
): void {
  let hasDistinctExtreme = false;
  for (let series = 0; series < selectors.length; series += 1) {
    const index = columnFor(selectors[series], resourceCount, point.values.length);
    if ((point.minimum[index] ?? 0) !== (point.maximum[index] ?? 0)) hasDistinctExtreme = true;
  }
  const phases = hasDistinctExtreme ? ([-0.2, 0, 0.2] as const) : ([0] as const);
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
    ticks.push(point.tick + (phases[phaseIndex] ?? 0));
    for (let series = 0; series < selectors.length; series += 1) {
      const index = columnFor(selectors[series], resourceCount, point.values.length);
      const source =
        phaseIndex === 0 ? point.minimum : phaseIndex === 1 ? point.values : point.maximum;
      values[series]?.push(source[index] ?? 0);
    }
  }
}

function columnFor(
  selector: HistorySeriesSelector | undefined,
  resourceCount: number,
  width: number
): number {
  const metric = selector?.metric ?? "population";
  const resource = Math.max(0, Math.min(resourceCount - 1, selector?.resource ?? 0));
  if (metric === "price") return resource;
  if (metric === "production") return resourceCount + resource;
  if (metric === "consumption") return resourceCount * 2 + resource;
  const scalarStart = width - 4;
  if (metric === "factionPower") {
    return Math.max(
      resourceCount * 3,
      Math.min(scalarStart - 1, resourceCount * 3 + (selector?.faction ?? 0))
    );
  }
  if (metric === "systems") return scalarStart + 1;
  if (metric === "liveFactions") return scalarStart + 2;
  if (metric === "powerConcentration") return scalarStart + 3;
  return scalarStart;
}

function defaultLabel(selector: HistorySeriesSelector): string {
  if (selector.metric === "factionPower") return `faction ${selector.faction ?? 0}`;
  if (
    selector.metric === "price" ||
    selector.metric === "production" ||
    selector.metric === "consumption"
  ) {
    return `${selector.metric} ${selector.resource ?? 0}`;
  }
  return selector.metric;
}

function clonePoint(point: HistoryPoint): HistoryPoint {
  return {
    tick: point.tick,
    values: point.values.slice(),
    minimum: point.minimum.slice(),
    maximum: point.maximum.slice()
  };
}

function resized(source: Float64Array, width: number, fill = 0): Float64Array {
  if (source.length === width) return source.slice();
  const next = new Float64Array(width);
  if (fill !== 0) next.fill(fill);
  next.set(source.subarray(0, Math.min(source.length, width)));
  return next;
}

function expandPoint(
  point: HistoryPoint,
  resourceCount: number,
  previousFactionCount: number,
  nextFactionCount: number
): HistoryPoint {
  const resourceColumns = resourceCount * 3;
  const width = resourceColumns + nextFactionCount + 4;
  function expand(source: Float64Array): Float64Array {
    const output = new Float64Array(width);
    output.set(source.subarray(0, resourceColumns + previousFactionCount), 0);
    output.set(
      source.subarray(
        resourceColumns + previousFactionCount,
        resourceColumns + previousFactionCount + 4
      ),
      resourceColumns + nextFactionCount
    );
    return output;
  }
  return {
    tick: point.tick,
    values: expand(point.values),
    minimum: expand(point.minimum),
    maximum: expand(point.maximum)
  };
}
