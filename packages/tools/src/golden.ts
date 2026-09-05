import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { StageOneSimulation, StageZeroSimulation } from "@galaxy-sim/sim-core";

interface GoldenScenario {
  readonly stage: 0 | 1;
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
  { stage: 1, seed: 424242, ticks: 100_000, checkpointEvery: 10_000 }
];

export async function checkGolden(): Promise<boolean> {
  let ok = true;
  for (const scenario of scenarios) {
    const actual = runScenario(scenario);
    const expected = await readBaseline(scenario);
    if (expected === undefined) {
      console.error(
        `Missing golden baseline for seed ${scenario.seed}. Run golden:update with --reason.`
      );
      ok = false;
      continue;
    }
    const mismatch = firstMismatch(expected, actual);
    if (mismatch !== undefined) {
      console.error(`Golden mismatch for seed ${scenario.seed}: ${mismatch}`);
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
  for (const scenario of scenarios) {
    const report = runScenario(scenario);
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

function runScenario(scenario: GoldenScenario): Omit<GoldenBaseline, keyof GoldenScenario> {
  const sim =
    scenario.stage === 0
      ? StageZeroSimulation.create(scenario.seed)
      : StageOneSimulation.create(scenario.seed);
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
        return `checkpoint ${left?.tick ?? right?.tick ?? "unknown"} expected ${left?.hash ?? "missing"}, got ${right?.hash ?? "missing"}`;
      }
    }
    return `final expected ${expected.finalHash}, got ${actual.finalHash}`;
  }
  return undefined;
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
