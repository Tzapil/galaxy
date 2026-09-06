import { cpus } from "node:os";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";

import {
  StageOneSimulation,
  StageTwoSimulation,
  ticksFromYears,
  type EntityCounters,
  type StageOneMetrics,
  type StageTwoMetrics
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "./stage-two-loader.js";

interface BenchOptions {
  readonly stage: 1 | 2;
  readonly seeds: number;
  readonly years: number;
  readonly out: string | undefined;
}

interface WorkerInput {
  readonly stage: 1 | 2;
  readonly seed: number;
  readonly ticks: number;
}

interface WorkerResult {
  readonly seed: number;
  readonly finalHash: string;
  readonly ticks: number;
  readonly counters: EntityCounters;
  readonly metrics: StageOneMetrics | StageTwoMetrics;
  readonly elapsedMs: number;
}

interface Distribution {
  readonly min: number;
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
  readonly max: number;
}

interface StageTwoDistributions {
  readonly idleNoPower: Distribution;
  readonly idleMissingInput: Distribution;
  readonly constructedBuildings: Distribution;
  readonly researchedTechnologies: Distribution;
  readonly disbandedShips: Distribution;
  readonly activeConstructions: Distribution;
  readonly slotFillRatio: Distribution;
  readonly maxResourceZeroStreakDays: Distribution;
  readonly treasuryMin: Distribution;
}

const metricNotes = [
  ["alive_factions_by_time", "ok: two seeded factions"],
  ["power_concentration_index", "n/a until Stage 7"],
  ["median_faction_age", "n/a until Stage 7"],
  ["building_idle_without_inputs", "ok: Stage 2 idleMissingInput"],
  ["resources_at_zero_longer_than_n_years", "ok: Stage 2 maxResourceZeroStreakDays"],
  ["average_transport_utilization", "ok: deliveredShipments proxy"],
  ["war_count_and_duration", "n/a until Stage 6"],
  ["galactic_price_spread", "ok: averageFoodWaterSpread"]
] as const;

if (!isMainThread) {
  const input = workerData as WorkerInput;
  const started = process.hrtime.bigint();
  const sim =
    input.stage === 1
      ? StageOneSimulation.create(input.seed)
      : StageTwoSimulation.create(input.seed, await loadStageTwoData());
  const report = sim.run(input.ticks, 0);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  parentPort?.postMessage({
    seed: input.seed,
    finalHash: report.finalHash,
    ticks: input.ticks,
    counters: report.counters,
    metrics: report.metrics,
    elapsedMs
  } satisfies WorkerResult);
} else if (isCliEntrypoint()) {
  await runBench(parseArgs(process.argv.slice(2)));
}

export async function runBench(options: BenchOptions): Promise<readonly WorkerResult[]> {
  const ticks = ticksFromYears(options.years);
  const seeds: number[] = [];
  for (let i = 0; i < options.seeds; i += 1) seeds.push(20260904 + i);

  const results = await runWorkers(options.stage, seeds, ticks);
  const minPopulation = describeDistribution(results.map((result) => result.metrics.minPopulation));
  const priceSpread = describeDistribution(
    results.map((result) => result.metrics.averageFoodWaterSpread)
  );
  const deliveredShipments = describeDistribution(
    results.map((result) => result.metrics.deliveredShipments)
  );
  const missedDeparturesFuel = describeDistribution(
    results.map((result) => result.metrics.missedDeparturesFuel)
  );
  const stageTwo = options.stage === 2 ? describeStageTwoDistributions(results) : undefined;
  const elapsedMs = describeDistribution(results.map((result) => result.elapsedMs));
  const report = {
    options,
    distributions: {
      minPopulation,
      averageFoodWaterSpread: priceSpread,
      deliveredShipments,
      missedDeparturesFuel,
      stageTwo,
      elapsedMs
    },
    metrics: metricNotes.map(([name, status]) => ({ name, status })),
    runs: results
  };

  console.log(`BENCH STAGE-${options.stage}`);
  console.log(`runs: ${results.length}, years: ${options.years}, ticksPerRun: ${ticks}`);
  console.log(formatDistribution("minPopulation", minPopulation, 2));
  console.log(formatDistribution("averageFoodWaterSpread", priceSpread, 4));
  console.log(formatDistribution("deliveredShipments", deliveredShipments, 0));
  console.log(formatDistribution("missedDeparturesFuel", missedDeparturesFuel, 0));
  if (stageTwo !== undefined) printStageTwoDistributions(stageTwo);
  console.log(formatDistribution("elapsedMs", elapsedMs, 2));
  for (const [name, status] of metricNotes) console.log(`${name}: ${status}`);

  if (options.out !== undefined) {
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return results;
}

async function runWorkers(
  stage: 1 | 2,
  seeds: readonly number[],
  ticks: number
): Promise<readonly WorkerResult[]> {
  const maxWorkers = Math.max(1, Math.min(cpus().length, seeds.length));
  const results: WorkerResult[] = [];
  let cursor = 0;

  async function next(): Promise<void> {
    const seed = seeds[cursor];
    cursor += 1;
    if (seed === undefined) return;
    const result = await runWorker({ stage, seed, ticks });
    results.push(result);
    await next();
  }

  const starters: Promise<void>[] = [];
  for (let i = 0; i < maxWorkers; i += 1) starters.push(next());
  await Promise.all(starters);
  results.sort((a, b) => a.seed - b.seed);
  return results;
}

function runWorker(input: WorkerInput): Promise<WorkerResult> {
  return new Promise((resolveWorker, rejectWorker) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: input,
      execArgv: ["--import", "tsx"]
    });
    worker.once("message", (message: WorkerResult) => resolveWorker(message));
    worker.once("error", rejectWorker);
    worker.once("exit", (code) => {
      if (code !== 0) rejectWorker(new Error(`bench worker exited with code ${code}`));
    });
  });
}

function describeStageTwoDistributions(results: readonly WorkerResult[]): StageTwoDistributions {
  const metrics = results.map((result) => requireStageTwoMetrics(result.metrics));
  return {
    idleNoPower: describeDistribution(metrics.map((metric) => metric.idleNoPower)),
    idleMissingInput: describeDistribution(metrics.map((metric) => metric.idleMissingInput)),
    constructedBuildings: describeDistribution(
      metrics.map((metric) => metric.constructedBuildings)
    ),
    researchedTechnologies: describeDistribution(
      metrics.map((metric) => metric.researchedTechnologies)
    ),
    disbandedShips: describeDistribution(metrics.map((metric) => metric.disbandedShips)),
    activeConstructions: describeDistribution(metrics.map((metric) => metric.activeConstructions)),
    slotFillRatio: describeDistribution(metrics.map((metric) => metric.slotFillRatio)),
    maxResourceZeroStreakDays: describeDistribution(
      metrics.map((metric) => metric.maxResourceZeroStreakDays)
    ),
    treasuryMin: describeDistribution(metrics.map((metric) => metric.treasuryMin))
  };
}

function printStageTwoDistributions(distributions: StageTwoDistributions): void {
  console.log(formatDistribution("idleNoPower", distributions.idleNoPower, 0));
  console.log(formatDistribution("idleMissingInput", distributions.idleMissingInput, 0));
  console.log(formatDistribution("constructedBuildings", distributions.constructedBuildings, 0));
  console.log(
    formatDistribution("researchedTechnologies", distributions.researchedTechnologies, 0)
  );
  console.log(formatDistribution("disbandedShips", distributions.disbandedShips, 0));
  console.log(formatDistribution("activeConstructions", distributions.activeConstructions, 0));
  console.log(formatDistribution("slotFillRatio", distributions.slotFillRatio, 3));
  console.log(
    formatDistribution("maxResourceZeroStreakDays", distributions.maxResourceZeroStreakDays, 0)
  );
  console.log(formatDistribution("treasuryMin", distributions.treasuryMin, 2));
}

function requireStageTwoMetrics(metrics: StageOneMetrics | StageTwoMetrics): StageTwoMetrics {
  if (!("idleNoPower" in metrics)) throw new Error("Stage 2 metrics are unavailable.");
  return metrics;
}

function describeDistribution(values: readonly number[]): Distribution {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: percentile(sorted, 0),
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: percentile(sorted, 1)
  };
}

function formatDistribution(name: string, distribution: Distribution, digits: number): string {
  return `${name}: min=${distribution.min.toFixed(digits)}, p10=${distribution.p10.toFixed(
    digits
  )}, median=${distribution.median.toFixed(digits)}, p90=${distribution.p90.toFixed(
    digits
  )}, max=${distribution.max.toFixed(digits)}`;
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index] ?? 0;
}

function parseArgs(argv: readonly string[]): BenchOptions {
  const stage = numberArg(argv, "stage", 2);
  if (stage !== 1 && stage !== 2) throw new Error("--stage must be 1 or 2.");
  return {
    stage,
    seeds: numberArg(argv, "seeds", 50),
    years: numberArg(argv, "years", stage === 2 ? 1000 : 100),
    out: stringArg(argv, "out")
  };
}

function numberArg(argv: readonly string[], name: string, fallback: number): number {
  const raw = stringArg(argv, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
  return Math.trunc(value);
}

function stringArg(argv: readonly string[], name: string): string | undefined {
  const exact = `--${name}`;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === exact) return argv[i + 1];
    if (arg?.startsWith(`${exact}=`) === true) return arg.slice(exact.length + 1);
  }
  return undefined;
}

function isCliEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
