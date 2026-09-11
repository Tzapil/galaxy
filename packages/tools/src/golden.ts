import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildStageThreeWorld,
  paramsWithPreset,
  StageOneSimulation,
  StageTwoSimulation,
  StageZeroSimulation
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "./stage-two-loader.js";
import { runStageSevenCampaign } from "./stage-seven-bench.js";

interface GoldenScenario {
  readonly stage: 0 | 1 | 2 | 3 | 7;
  readonly seed: number;
  readonly ticks: number;
  readonly checkpointEvery: number;
}

interface GoldenBaseline extends GoldenScenario {
  readonly finalHash: string;
  readonly intermediateHashes: readonly { readonly tick: number; readonly hash: string }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const goldenDir = resolve(here, "../golden");
const changelogPath = resolve(here, "../../../CHANGELOG.md");

const scenarios: readonly GoldenScenario[] = [
  { stage: 1, seed: 20260904, ticks: 100_000, checkpointEvery: 10_000 },
  { stage: 1, seed: 7, ticks: 100_000, checkpointEvery: 10_000 },
  { stage: 1, seed: 424242, ticks: 100_000, checkpointEvery: 10_000 },
  { stage: 2, seed: 20260904, ticks: 100_000, checkpointEvery: 10_000 },
  { stage: 3, seed: 20260904, ticks: 10_000, checkpointEvery: 1_000 },
  { stage: 7, seed: 20260904, ticks: 3_650_000, checkpointEvery: 182_500 }
];

export async function checkGolden(): Promise<boolean> {
  const stageTwoData = scenarios.some(
    (scenario) => scenario.stage === 2 || scenario.stage === 3 || scenario.stage === 7
  )
    ? await loadStageTwoData()
    : undefined;
  let ok = true;
  for (const scenario of scenarios) {
    const actual = runScenario(scenario, stageTwoData);
    const expected = await readBaseline(scenario);
    if (expected === undefined) {
      console.error(
        `Missing golden baseline for stage ${scenario.stage} seed ${scenario.seed}. Run golden:update with --reason.`
      );
      ok = false;
      continue;
    }
    const mismatch = firstMismatch(expected, actual);
    if (mismatch !== undefined) {
      console.error(
        `Golden mismatch for stage ${scenario.stage} seed ${scenario.seed}: ${mismatch}`
      );
      ok = false;
    } else {
      console.log(`stage ${scenario.stage} seed ${scenario.seed}: ${actual.finalHash} ok`);
    }
  }
  return ok;
}

export async function updateGolden(reason: string): Promise<void> {
  if (reason.trim().length === 0) throw new Error('golden:update requires --reason "text".');
  await mkdir(goldenDir, { recursive: true });
  const stageTwoData = scenarios.some(
    (scenario) => scenario.stage === 2 || scenario.stage === 3 || scenario.stage === 7
  )
    ? await loadStageTwoData()
    : undefined;
  for (const scenario of scenarios) {
    const report = runScenario(scenario, stageTwoData);
    await writeFile(
      baselinePath(scenario),
      `${JSON.stringify({ ...scenario, ...report }, null, 2)}\n`,
      "utf8"
    );
    console.log(`updated stage ${scenario.stage} seed ${scenario.seed}: ${report.finalHash}`);
  }
  await appendFile(
    changelogPath,
    `\n## Golden baseline update\n\n- Reason: ${reason.trim()}\n`,
    "utf8"
  );
}

function runScenario(
  scenario: GoldenScenario,
  stageTwoData: Awaited<ReturnType<typeof loadStageTwoData>> | undefined
): Omit<GoldenBaseline, keyof GoldenScenario> {
  if (scenario.stage === 7) {
    const data = requireStageTwoData(stageTwoData);
    const report = runStageSevenCampaign(
      scenario.seed,
      scenario.ticks / 365,
      data,
      scenario.checkpointEvery / 365
    );
    return {
      finalHash: report.finalHash,
      intermediateHashes: report.intermediateHashes
    };
  }
  const sim =
    scenario.stage === 0
      ? StageZeroSimulation.create(scenario.seed)
      : scenario.stage === 1
        ? StageOneSimulation.create(scenario.seed)
        : scenario.stage === 2
          ? StageTwoSimulation.create(scenario.seed, requireStageTwoData(stageTwoData))
          : StageTwoSimulation.createFromWorld(
              scenario.seed,
              requireStageTwoData(stageTwoData),
              buildStageThreeWorld(
                requireStageTwoData(stageTwoData),
                scenario.seed,
                paramsWithPreset(requireStageTwoData(stageTwoData).galaxyPresets, "balanced")
              )
            );
  const report = sim.run(scenario.ticks, scenario.checkpointEvery);
  return {
    finalHash: report.finalHash,
    intermediateHashes: report.intermediateHashes
  };
}

async function readBaseline(scenario: GoldenScenario): Promise<GoldenBaseline | undefined> {
  try {
    return JSON.parse(await readFile(baselinePath(scenario), "utf8")) as GoldenBaseline;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

function baselinePath(scenario: GoldenScenario): string {
  return resolve(goldenDir, `stage-${scenario.stage}-seed-${scenario.seed}-${scenario.ticks}.hash`);
}

function firstMismatch(
  expected: GoldenBaseline,
  actual: Omit<GoldenBaseline, keyof GoldenScenario>
): string | undefined {
  if (expected.finalHash !== actual.finalHash) {
    for (let i = 0; i < expected.intermediateHashes.length; i += 1) {
      const left = expected.intermediateHashes[i];
      const right = actual.intermediateHashes[i];
      if (left?.hash !== right?.hash) {
        return `checkpoint ${left?.tick ?? right?.tick ?? "unknown"} expected ${
          left?.hash ?? "missing"
        }, got ${right?.hash ?? "missing"}`;
      }
    }
    return `final expected ${expected.finalHash}, got ${actual.finalHash}`;
  }
  return undefined;
}

function requireStageTwoData(
  data: Awaited<ReturnType<typeof loadStageTwoData>> | undefined
): Awaited<ReturnType<typeof loadStageTwoData>> {
  if (data === undefined) throw new Error("Stage 2 data was not loaded.");
  return data;
}

function reasonArg(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reason") return argv[i + 1];
    if (arg?.startsWith("--reason=") === true) return arg.slice("--reason=".length);
  }
  return undefined;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

const command = process.argv[2] ?? "check";
if (isCliEntrypoint()) {
  if (command === "check") {
    const ok = await checkGolden();
    process.exit(ok ? 0 : 1);
  } else if (command === "update") {
    const reason = reasonArg(process.argv.slice(3));
    if (reason === undefined) {
      console.error('golden:update requires --reason "text".');
      process.exit(1);
    }
    await updateGolden(reason);
  } else {
    console.error(`Unknown golden command "${command}".`);
    process.exit(1);
  }
}

function isCliEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
