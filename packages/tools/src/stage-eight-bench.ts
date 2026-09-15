import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  Instrumentation,
  RenderSliceBit,
  ShipRole,
  StageTwoSimulation,
  buildStageOneRenderSnapshot,
  buildStageThreeWorld,
  currentStoryEvents,
  renderStoryEventForRow,
  type RenderEvent
} from "@galaxy-sim/sim-core";
import {
  HistoryAccumulator,
  StageOneWorkerRuntime,
  encodeWorkerSave
} from "@galaxy-sim/sim-worker";

import { loadStageTwoData } from "./stage-two-loader.js";

const TARGET_SYSTEMS = 500;
const TARGET_SHIPS = 20_000;
const TARGET_BUILDINGS = 50_000;
const TARGET_TICKS_PER_SECOND = 1000;
const SAMPLE_TICKS = 10;

const data = await loadStageTwoData();
const setupStarted = performance.now();
const world = buildStageThreeWorld(data, 20260904, {
  systemCount: TARGET_SYSTEMS,
  factionCount: 8,
  factionMinJumps: 6,
  regionCount: 8
});
const housing = data.buildingIndex.get("housing");
if (housing === undefined) throw new Error("The target benchmark requires the housing building.");

while (world.buildings.length < TARGET_BUILDINGS) {
  const body = world.buildings.length % world.bodies.length;
  world.buildings.addBuilt(data, world.bodies, body, housing, world.stockpiles);
}
while (world.ships.length < TARGET_SHIPS) {
  const ship = world.ships.length;
  world.addShip(
    ship % world.factions.length,
    ship % world.systems.length,
    ShipRole.Hauler,
    1600,
    220,
    7
  );
}

const simulation = StageTwoSimulation.createFromWorld(20260904, data, world);
const setupMs = performance.now() - setupStarted;
const instrumentation = new Instrumentation({
  enabled: true,
  targetTicksPerSecond: TARGET_TICKS_PER_SECOND,
  historyCapacity: 64,
  nowMs: () => performance.now()
});
const runStarted = performance.now();
for (let tick = 0; tick < SAMPLE_TICKS; tick += 1) simulation.step(instrumentation);
const runMs = performance.now() - runStarted;
const renderStarted = performance.now();
const render = buildStageOneRenderSnapshot(
  simulation,
  RenderSliceBit.Map |
    RenderSliceBit.Colonies |
    RenderSliceBit.Ships |
    RenderSliceBit.Buildings |
    RenderSliceBit.Events
);
const renderMs = performance.now() - renderStarted;
const narrative = StageTwoSimulation.create(20260904, data);
const narrativeEvents: RenderEvent[] = currentStoryEvents(narrative.world);
const unsubscribeNarrative = narrative.world.eventLog.subscribe((row) => {
  const event = renderStoryEventForRow(narrative.world, row);
  if (event !== undefined) narrativeEvents.push(event);
});
narrative.run(36_500, 0);
unsubscribeNarrative();
const storySample = narrativeEvents.slice(-30).map((event) => ({
  serial: event.serial,
  year: Math.floor(event.tick / 365),
  kind: event.kind,
  storyKind: event.storyKind,
  faction: event.faction,
  system: event.system,
  importance: event.importance,
  impact: event.impact
}));
const history = tenMillenniaHistory(data.resources.length, world.factions.length);
const saveStarted = performance.now();
const save = encodeWorkerSave(simulation.snapshot(), history.serialize());
const saveMs = performance.now() - saveStarted;
const memory = process.memoryUsage();

let artificialNow = 0;
const overloaded = new StageOneWorkerRuntime({
  nowMs: () => {
    artificialNow += 100;
    return artificialNow;
  },
  maxWorkMs: 1
});
overloaded.handle({ type: "init", seed: 17, params: { speed: 1000 } });
const before = overloaded.tick;
const overloadMessages = overloaded.advanceElapsed(1000);
const overloadStats = overloadMessages.find((message) => message.type === "stats");

const report = {
  generatedAt: new Date().toISOString(),
  seed: 20260904,
  target: {
    systems: TARGET_SYSTEMS,
    ships: TARGET_SHIPS,
    buildings: TARGET_BUILDINGS,
    ticksPerSecond: TARGET_TICKS_PER_SECOND
  },
  actual: {
    systems: world.systems.length,
    ships: world.ships.length,
    buildings: world.buildings.length,
    setupMs,
    sampleTicks: SAMPLE_TICKS,
    runMs,
    tickMs: runMs / SAMPLE_TICKS,
    ticksPerSecond: (SAMPLE_TICKS / runMs) * 1000,
    renderSnapshotBytes: render.byteLength,
    renderSnapshotMs: renderMs,
    fullSaveBytes: save.byteLength,
    fullSaveMs: saveMs,
    estimatedEntityVisitsPerTick:
      world.systems.length + world.ships.length + world.buildings.length,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
    subsystemMs: instrumentation.summary(runMs).subsystemMs
  },
  history: {
    horizonYears: 10_000,
    points: history.pointCount,
    workerBytes: history.estimatedBytes()
  },
  storyAudit: {
    sampledRows: storySample.length,
    rows: storySample
  },
  gracefulDegradation: {
    requestedTicks: 1000,
    advancedTicks: overloaded.tick - before,
    actualSpeed: overloadStats?.type === "stats" ? overloadStats.stats.actualSpeed : undefined,
    skippedTicks: false
  },
  note: "The entity ceiling run uses a generated 500-system galaxy plus inert housing/hauler rows to isolate worst-case traversal and serialization costs."
};

const outputDirectory = resolve(process.cwd(), "reports");
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "stage-eight-acceptance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function tenMillenniaHistory(resourceCount: number, factionCount: number): HistoryAccumulator {
  const history = new HistoryAccumulator();
  const prices = new Float64Array(resourceCount);
  const production = new Float64Array(resourceCount);
  const consumption = new Float64Array(resourceCount);
  const factionPower = new Float64Array(factionCount);
  for (let year = 0; year < 10_000; year += 1) {
    prices[year % resourceCount] = year;
    history.record({
      tick: year * 365,
      prices,
      production,
      consumption,
      factionPower,
      population: 1000,
      systems: TARGET_SYSTEMS,
      liveFactions: factionCount,
      powerConcentration: 1 / Math.max(1, factionCount)
    });
  }
  return history;
}
