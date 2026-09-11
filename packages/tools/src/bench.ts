import { cpus } from "node:os";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";

import {
  StageOneSimulation,
  StageTwoSimulation,
  buildStageThreeWorld,
  paramsWithPreset,
  ticksFromYears,
  type EntityCounters,
  type StageOneMetrics,
  type StageTwoMetrics
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "./stage-two-loader.js";
import { detectPathologies } from "./pathology.js";
import { runStageSixCampaign, type StageSixMetrics } from "./stage-six-bench.js";
import { runStageSevenCampaign, type StageSevenMetrics } from "./stage-seven-bench.js";

interface BenchOptions {
  readonly stage: 1 | 2 | 3 | 6 | 7;
  readonly seeds: number;
  readonly years: number;
  readonly out: string | undefined;
  readonly preset: string;
}

interface WorkerInput {
  readonly stage: 1 | 2 | 3 | 6 | 7;
  readonly seed: number;
  readonly ticks: number;
  readonly preset: string;
}

interface WorkerResult {
  readonly seed: number;
  readonly finalHash: string;
  readonly ticks: number;
  readonly counters: EntityCounters;
  readonly metrics: StageOneMetrics | StageTwoMetrics | StageSixMetrics | StageSevenMetrics;
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
  readonly aiBuildPlansStarted: Distribution;
  readonly aiColonizationLaunches: Distribution;
  readonly aiFleetBuilds: Distribution;
  readonly coloniesFounded: Distribution;
  readonly aiOperations: Distribution;
}

interface StageSixDistributions {
  readonly warCount: Distribution;
  readonly averageWarDurationDays: Distribution;
  readonly longestWarDays: Distribution;
  readonly shipsLost: Distribution;
  readonly blockadeCount: Distribution;
  readonly averageBlockadeDurationDays: Distribution;
  readonly economicWarChains: Distribution;
  readonly maxPriceJump: Distribution;
  readonly mrpBottlenecks: Distribution;
  readonly distinctFleetProfiles: Distribution;
  readonly maxBattleRounds: Distribution;
  readonly peakCombatOperationsPerTick: Distribution;
  readonly duelCycleEdges: Distribution;
  readonly duelMaxBudgetGapFraction: Distribution;
  readonly estimatedOperationsAt20Battles: Distribution;
}

interface StageSevenDistributions {
  readonly aliveFactionsMin: Distribution;
  readonly aliveFactionsMax: Distribution;
  readonly aliveFactionDistinctCounts: Distribution;
  readonly medianFactionAgeYears: Distribution;
  readonly earlyConcentrationMax: Distribution;
  readonly middleConcentrationMax: Distribution;
  readonly lateConcentrationMax: Distribution;
  readonly secessionCount: Distribution;
  readonly warCount: Distribution;
  readonly coalitionChanges: Distribution;
  readonly maxEventLogEntries: Distribution;
  readonly retainedStateBytesMax: Distribution;
  readonly actualTicksPerSecond: Distribution;
}

const metricNotes = [
  ["alive_factions_by_time", "ok: seeded factions remain alive"],
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
  const report = await runWorkerInput(input);
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

  const results = await runWorkers(options.stage, seeds, options.preset, ticks);
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
  const stageTwo = options.stage >= 2 ? describeStageTwoDistributions(results) : undefined;
  const stageSix = options.stage === 6 ? describeStageSixDistributions(results) : undefined;
  const stageSeven = options.stage === 7 ? describeStageSevenDistributions(results) : undefined;
  const stageSixData = options.stage === 6 ? await loadStageTwoData() : undefined;
  const elapsedMs = describeDistribution(results.map((result) => result.elapsedMs));
  const chainCases =
    options.stage === 6
      ? results
          .filter((result) => requireStageSixMetrics(result.metrics).economicWarChains > 0)
          .slice(0, 3)
          .map((result) => {
            const metrics = requireStageSixMetrics(result.metrics);
            return {
              seed: result.seed,
              gate: metrics.chainGate,
              resource: metrics.chainResource,
              priceBefore: metrics.chainPriceBefore,
              priceAfter: metrics.chainPriceAfter,
              priceMultiplier:
                metrics.chainPriceAfter / Math.max(0.000001, metrics.chainPriceBefore),
              stoppedShipyardBody: metrics.chainShipyard
            };
          })
      : undefined;
  const winningFleetCompositions =
    options.stage === 6 && stageSixData !== undefined
      ? countWinningArchetypes(
          results,
          stageSixData.doctrines.map((doctrine) => doctrine.id)
        )
      : undefined;
  const pathologyFailures =
    options.stage === 6 || options.stage === 7
      ? results.flatMap((result) =>
          detectPathologies({
            seed: result.seed,
            tick: result.ticks,
            stage: options.stage,
            metrics:
              options.stage === 7
                ? requireStageSevenMetrics(result.metrics)
                : requireStageSixMetrics(result.metrics)
          }).filter((finding) => finding.status === "failed")
        )
      : [];
  const chainSeedCount =
    options.stage === 6
      ? results.filter((result) => requireStageSixMetrics(result.metrics).economicWarChains > 0)
          .length
      : 0;
  const stageSixGate =
    stageSix === undefined || winningFleetCompositions === undefined
      ? undefined
      : {
          chainSeedCount,
          requiredChainSeeds: Math.min(10, results.length),
          duelCycleEdges: stageSix.duelCycleEdges.min,
          maxFairBudgetGapFraction: stageSix.duelMaxBudgetGapFraction.max,
          distinctFleetProfiles: stageSix.distinctFleetProfiles.min,
          maxEstimatedOperationsAt20Battles: stageSix.estimatedOperationsAt20Battles.max,
          pathologyFailures: pathologyFailures.length,
          passed:
            chainSeedCount >= Math.min(10, results.length) &&
            stageSix.warCount.min > 0 &&
            stageSix.longestWarDays.max <= 20 * 365 &&
            stageSix.duelCycleEdges.min === 4 &&
            stageSix.duelMaxBudgetGapFraction.max < 0.03 &&
            stageSix.distinctFleetProfiles.min >= 2 &&
            stageSix.estimatedOperationsAt20Battles.max <= 16_000 &&
            pathologyFailures.length === 0 &&
            Math.max(...Object.values(winningFleetCompositions)) < results.length
        };
  const stageSevenGate =
    stageSeven === undefined
      ? undefined
      : {
          pathologyFailures: pathologyFailures.length,
          passed:
            stageSeven.aliveFactionsMin.min >= 2 &&
            stageSeven.aliveFactionDistinctCounts.min >= 2 &&
            stageSeven.secessionCount.min > 0 &&
            stageSeven.warCount.min > 0 &&
            stageSeven.earlyConcentrationMax.max < 0.35 &&
            stageSeven.middleConcentrationMax.p90 < 0.55 &&
            results.some(
              (result) => requireStageSevenMetrics(result.metrics).lateHegemonyReached
            ) &&
            results.every(
              (result) => requireStageSevenMetrics(result.metrics).retainedStateStabilized
            ) &&
            stageSeven.maxEventLogEntries.max <= 4096 &&
            pathologyFailures.length === 0
        };
  const notes = metricNotes.map(([name, status]) => ({
    name,
    status:
      options.stage >= 6 && name === "war_count_and_duration"
        ? "ok: Stage 6+ warCount and duration distributions"
        : options.stage === 7 && name === "power_concentration_index"
          ? "ok: Stage 7 concentration distribution by epoch"
          : options.stage === 7 && name === "median_faction_age"
            ? "ok: Stage 7 finite faction-age distribution"
            : status
  }));
  const report = {
    options,
    distributions: {
      minPopulation,
      averageFoodWaterSpread: priceSpread,
      deliveredShipments,
      missedDeparturesFuel,
      stageTwo,
      stageSix,
      stageSeven,
      elapsedMs
    },
    metrics: notes,
    chainCases,
    winningFleetCompositions,
    stageSixGate,
    stageSevenGate,
    pathologyFailures,
    runs: results
  };

  console.log(`BENCH STAGE-${options.stage}`);
  console.log(`runs: ${results.length}, years: ${options.years}, ticksPerRun: ${ticks}`);
  console.log(formatDistribution("minPopulation", minPopulation, 2));
  console.log(formatDistribution("averageFoodWaterSpread", priceSpread, 4));
  console.log(formatDistribution("deliveredShipments", deliveredShipments, 0));
  console.log(formatDistribution("missedDeparturesFuel", missedDeparturesFuel, 0));
  if (stageTwo !== undefined) printStageTwoDistributions(stageTwo);
  if (stageSix !== undefined) printStageSixDistributions(stageSix);
  if (stageSeven !== undefined) printStageSevenDistributions(stageSeven);
  console.log(formatDistribution("elapsedMs", elapsedMs, 2));
  for (const note of notes) console.log(`${note.name}: ${note.status}`);
  if (chainCases !== undefined) {
    console.log(`economicWarChainSeeds: ${chainSeedCount}/${results.length}`);
  }
  if (winningFleetCompositions !== undefined) {
    console.log(`winningFleetCompositions: ${JSON.stringify(winningFleetCompositions)}`);
  }
  if (stageSixGate !== undefined) {
    console.log(
      `stageSixGate: ${stageSixGate.passed ? "ok" : "failed"}, pathologyFailures=${pathologyFailures.length}`
    );
  }
  if (stageSevenGate !== undefined) {
    console.log(
      `stageSevenGate: ${stageSevenGate.passed ? "ok" : "failed"}, pathologyFailures=${pathologyFailures.length}`
    );
  }

  if (options.out !== undefined) {
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (stageSixGate?.passed === false) throw new Error("Stage 6 benchmark gate failed.");
  if (stageSevenGate?.passed === false) throw new Error("Stage 7 benchmark gate failed.");

  return results;
}

async function runWorkers(
  stage: 1 | 2 | 3 | 6 | 7,
  seeds: readonly number[],
  preset: string,
  ticks: number
): Promise<readonly WorkerResult[]> {
  const maxWorkers = Math.max(1, Math.min(cpus().length, seeds.length));
  const results: WorkerResult[] = [];
  let cursor = 0;

  async function next(): Promise<void> {
    const seed = seeds[cursor];
    cursor += 1;
    if (seed === undefined) return;
    const result = await runWorker({ stage, seed, ticks, preset });
    results.push(result);
    await next();
  }

  const starters: Promise<void>[] = [];
  for (let i = 0; i < maxWorkers; i += 1) starters.push(next());
  await Promise.all(starters);
  results.sort((a, b) => a.seed - b.seed);
  return results;
}

async function runWorkerInput(input: WorkerInput) {
  if (input.stage === 7) {
    const data = await loadStageTwoData();
    return runStageSevenCampaign(input.seed, input.ticks / 365, data);
  }
  if (input.stage === 6) {
    const data = await loadStageTwoData();
    return runStageSixCampaign(input.seed, input.ticks / 365, data);
  }
  const sim =
    input.stage === 1
      ? StageOneSimulation.create(input.seed)
      : await createStageTwoBenchSimulation(input);
  return sim.run(input.ticks, 0);
}

async function createStageTwoBenchSimulation(input: WorkerInput): Promise<StageTwoSimulation> {
  const data = await loadStageTwoData();
  if (input.stage === 2) return StageTwoSimulation.create(input.seed, data);
  return StageTwoSimulation.createFromWorld(
    input.seed,
    data,
    buildStageThreeWorld(data, input.seed, paramsWithPreset(data.galaxyPresets, input.preset))
  );
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
    treasuryMin: describeDistribution(metrics.map((metric) => metric.treasuryMin)),
    aiBuildPlansStarted: describeDistribution(metrics.map((metric) => metric.aiBuildPlansStarted)),
    aiColonizationLaunches: describeDistribution(
      metrics.map((metric) => metric.aiColonizationLaunches)
    ),
    aiFleetBuilds: describeDistribution(metrics.map((metric) => metric.aiFleetBuilds)),
    coloniesFounded: describeDistribution(metrics.map((metric) => metric.coloniesFounded)),
    aiOperations: describeDistribution(metrics.map((metric) => metric.aiOperations))
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
  console.log(formatDistribution("aiBuildPlansStarted", distributions.aiBuildPlansStarted, 0));
  console.log(
    formatDistribution("aiColonizationLaunches", distributions.aiColonizationLaunches, 0)
  );
  console.log(formatDistribution("aiFleetBuilds", distributions.aiFleetBuilds, 0));
  console.log(formatDistribution("coloniesFounded", distributions.coloniesFounded, 0));
  console.log(formatDistribution("aiOperations", distributions.aiOperations, 0));
}

function describeStageSixDistributions(results: readonly WorkerResult[]): StageSixDistributions {
  const metrics = results.map((result) => requireStageSixMetrics(result.metrics));
  return {
    warCount: describeDistribution(metrics.map((metric) => metric.warCount)),
    averageWarDurationDays: describeDistribution(
      metrics.map((metric) => metric.averageWarDurationDays)
    ),
    longestWarDays: describeDistribution(metrics.map((metric) => metric.longestWarDays)),
    shipsLost: describeDistribution(metrics.map((metric) => metric.shipsLost)),
    blockadeCount: describeDistribution(metrics.map((metric) => metric.blockadeCount)),
    averageBlockadeDurationDays: describeDistribution(
      metrics.map((metric) => metric.averageBlockadeDurationDays)
    ),
    economicWarChains: describeDistribution(metrics.map((metric) => metric.economicWarChains)),
    maxPriceJump: describeDistribution(metrics.map((metric) => metric.maxPriceJump)),
    mrpBottlenecks: describeDistribution(metrics.map((metric) => metric.mrpBottlenecks)),
    distinctFleetProfiles: describeDistribution(
      metrics.map((metric) => metric.distinctFleetProfiles)
    ),
    maxBattleRounds: describeDistribution(metrics.map((metric) => metric.maxBattleRounds)),
    peakCombatOperationsPerTick: describeDistribution(
      metrics.map((metric) => metric.peakCombatOperationsPerTick)
    ),
    duelCycleEdges: describeDistribution(metrics.map((metric) => metric.duelCycleEdges)),
    duelMaxBudgetGapFraction: describeDistribution(
      metrics.map((metric) => metric.duelMaxBudgetGapFraction)
    ),
    estimatedOperationsAt20Battles: describeDistribution(
      metrics.map((metric) => metric.estimatedOperationsAt20Battles)
    )
  };
}

function printStageSixDistributions(distributions: StageSixDistributions): void {
  console.log(formatDistribution("warCount", distributions.warCount, 0));
  console.log(
    formatDistribution("averageWarDurationDays", distributions.averageWarDurationDays, 1)
  );
  console.log(formatDistribution("longestWarDays", distributions.longestWarDays, 0));
  console.log(formatDistribution("shipsLost", distributions.shipsLost, 0));
  console.log(formatDistribution("blockadeCount", distributions.blockadeCount, 0));
  console.log(
    formatDistribution("averageBlockadeDurationDays", distributions.averageBlockadeDurationDays, 1)
  );
  console.log(formatDistribution("economicWarChains", distributions.economicWarChains, 0));
  console.log(formatDistribution("maxPriceJump", distributions.maxPriceJump, 3));
  console.log(formatDistribution("mrpBottlenecks", distributions.mrpBottlenecks, 0));
  console.log(formatDistribution("distinctFleetProfiles", distributions.distinctFleetProfiles, 0));
  console.log(formatDistribution("maxBattleRounds", distributions.maxBattleRounds, 0));
  console.log(
    formatDistribution("peakCombatOperationsPerTick", distributions.peakCombatOperationsPerTick, 0)
  );
  console.log(formatDistribution("duelCycleEdges", distributions.duelCycleEdges, 0));
  console.log(
    formatDistribution("duelMaxBudgetGapFraction", distributions.duelMaxBudgetGapFraction, 4)
  );
  console.log(
    formatDistribution(
      "estimatedOperationsAt20Battles",
      distributions.estimatedOperationsAt20Battles,
      0
    )
  );
}

function describeStageSevenDistributions(
  results: readonly WorkerResult[]
): StageSevenDistributions {
  const metrics = results.map((result) => requireStageSevenMetrics(result.metrics));
  return {
    aliveFactionsMin: describeDistribution(metrics.map((metric) => metric.aliveFactionsMin)),
    aliveFactionsMax: describeDistribution(metrics.map((metric) => metric.aliveFactionsMax)),
    aliveFactionDistinctCounts: describeDistribution(
      metrics.map((metric) => metric.aliveFactionDistinctCounts)
    ),
    medianFactionAgeYears: describeDistribution(
      metrics.map((metric) => metric.medianFactionAgeYears)
    ),
    earlyConcentrationMax: describeDistribution(
      metrics.map((metric) => metric.earlyConcentrationMax)
    ),
    middleConcentrationMax: describeDistribution(
      metrics.map((metric) => metric.middleConcentrationMax)
    ),
    lateConcentrationMax: describeDistribution(
      metrics.map((metric) => metric.lateConcentrationMax)
    ),
    secessionCount: describeDistribution(metrics.map((metric) => metric.secessionCount)),
    warCount: describeDistribution(metrics.map((metric) => metric.warCount)),
    coalitionChanges: describeDistribution(metrics.map((metric) => metric.coalitionChanges)),
    maxEventLogEntries: describeDistribution(metrics.map((metric) => metric.maxEventLogEntries)),
    retainedStateBytesMax: describeDistribution(
      metrics.map((metric) => metric.retainedStateBytesMax)
    ),
    actualTicksPerSecond: describeDistribution(metrics.map((metric) => metric.actualTicksPerSecond))
  };
}

function printStageSevenDistributions(distributions: StageSevenDistributions): void {
  console.log(formatDistribution("aliveFactionsMin", distributions.aliveFactionsMin, 0));
  console.log(formatDistribution("aliveFactionsMax", distributions.aliveFactionsMax, 0));
  console.log(
    formatDistribution("aliveFactionDistinctCounts", distributions.aliveFactionDistinctCounts, 0)
  );
  console.log(formatDistribution("medianFactionAgeYears", distributions.medianFactionAgeYears, 1));
  console.log(formatDistribution("earlyConcentrationMax", distributions.earlyConcentrationMax, 4));
  console.log(
    formatDistribution("middleConcentrationMax", distributions.middleConcentrationMax, 4)
  );
  console.log(formatDistribution("lateConcentrationMax", distributions.lateConcentrationMax, 4));
  console.log(formatDistribution("secessionCount", distributions.secessionCount, 0));
  console.log(formatDistribution("warCount", distributions.warCount, 0));
  console.log(formatDistribution("coalitionChanges", distributions.coalitionChanges, 0));
  console.log(formatDistribution("maxEventLogEntries", distributions.maxEventLogEntries, 0));
  console.log(formatDistribution("retainedStateBytesMax", distributions.retainedStateBytesMax, 0));
  console.log(formatDistribution("actualTicksPerSecond", distributions.actualTicksPerSecond, 0));
}

function requireStageTwoMetrics(
  metrics: StageOneMetrics | StageTwoMetrics | StageSixMetrics | StageSevenMetrics
): StageTwoMetrics {
  if (!("idleNoPower" in metrics)) throw new Error("Stage 2 metrics are unavailable.");
  return metrics;
}

function requireStageSixMetrics(
  metrics: StageOneMetrics | StageTwoMetrics | StageSixMetrics | StageSevenMetrics
): StageSixMetrics {
  if (!("averageWarDurationDays" in metrics)) throw new Error("Stage 6 metrics are unavailable.");
  return metrics;
}

function requireStageSevenMetrics(
  metrics: StageOneMetrics | StageTwoMetrics | StageSixMetrics | StageSevenMetrics
): StageSevenMetrics {
  if (!("secessionCount" in metrics)) throw new Error("Stage 7 metrics are unavailable.");
  return metrics;
}

function countWinningArchetypes(
  results: readonly WorkerResult[],
  doctrineIds: readonly string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const winner = requireStageSixMetrics(result.metrics).winningArchetype;
    const key = doctrineIds[winner] ?? "draw";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
  const stage = numberArg(argv, "stage", 6);
  if (stage !== 1 && stage !== 2 && stage !== 3 && stage !== 6 && stage !== 7) {
    throw new Error("--stage must be 1, 2, 3, 6 or 7.");
  }
  return {
    stage,
    seeds: numberArg(argv, "seeds", 50),
    years: numberArg(argv, "years", stage >= 2 ? 1000 : 100),
    out: stringArg(argv, "out"),
    preset: stringArg(argv, "preset") ?? "balanced"
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
