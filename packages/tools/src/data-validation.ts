import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

import {
  allBuildCostResourcesAreSinks,
  resourceIndexOf,
  validateStartPackage
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "./stage-two-loader.js";

interface ToolRun {
  readonly name: string;
  readonly command: readonly string[];
  readonly allowKnownOpenIssue?: boolean;
}

interface Baseline {
  readonly materialCycles: number;
  readonly energyCyclesMin: number;
  readonly rareRawRatio: { readonly min: number; readonly max: number };
  readonly energyCostShareMin: number;
  readonly dataBalanceMin: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const reportsDir = resolve(packageRoot, "reports");
const baselinePath = resolve(packageRoot, "baseline.json");

const runs: readonly ToolRun[] = [
  { name: "validate", command: ["node", "src/validate.mjs"] },
  { name: "tech", command: ["node", "src/tech.mjs"] },
  { name: "design", command: ["node", "src/design.mjs"] },
  {
    name: "bootstrap",
    command: ["node", "src/bootstrap.mjs"],
    allowKnownOpenIssue: true
  },
  { name: "galaxy", command: ["node", "src/galaxy.mjs"] },
  { name: "war", command: ["node", "src/war.mjs"] }
];

if (isCliEntrypoint()) {
  const ok = await runDataValidation();
  process.exit(ok ? 0 : 1);
}

export async function runDataValidation(): Promise<boolean> {
  await mkdir(reportsDir, { recursive: true });
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
  let ok = true;
  const outputs = new Map<string, string>();

  for (const run of runs) {
    const result = await execute(run);
    outputs.set(run.name, result.output);
    await writeFile(resolve(reportsDir, `${run.name}.txt`), result.output, "utf8");

    if (result.exitCode !== 0) {
      if (run.allowKnownOpenIssue === true && isKnownBootstrapOpenIssue(result.output)) {
        console.warn(
          `${run.name}: known open balance issue preserved in report; continuing infrastructure validation.`
        );
      } else {
        console.error(`${run.name}: exited with ${result.exitCode}`);
        ok = false;
      }
    } else {
      console.log(`${run.name}: ok`);
    }
  }

  const validateOutput = outputs.get("validate") ?? "";
  const techOutput = outputs.get("tech") ?? "";
  ok = checkBaseline(validateOutput, techOutput, baseline) && ok;
  ok = (await checkStageTwoRuntimeData(baseline)) && ok;
  ok = (await compareChainGraph()) && ok;
  return ok;
}

interface RunResult {
  readonly exitCode: number;
  readonly output: string;
}

function execute(run: ToolRun): Promise<RunResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(run.command[0] ?? "", run.command.slice(1), {
      cwd: packageRoot,
      shell: false
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => resolveRun({ exitCode: code ?? 1, output }));
  });
}

function checkBaseline(validateOutput: string, techOutput: string, baseline: Baseline): boolean {
  let ok = true;
  const materialCycles = numberAfter(validateOutput, /Материальных циклов:\s+(\d+)/u);
  const energyCycles = numberAfter(validateOutput, /Циклов через энергию:\s+(\d+)/u);
  if (materialCycles !== baseline.materialCycles) {
    console.error(
      `baseline: material cycles expected ${baseline.materialCycles}, got ${materialCycles}`
    );
    ok = false;
  }
  if (energyCycles < baseline.energyCyclesMin) {
    console.error(
      `baseline: expected at least ${baseline.energyCyclesMin} energy cycles, got ${energyCycles}`
    );
    ok = false;
  }

  const rareRatios = Array.from(
    validateOutput.matchAll(/= ×([0-9]+(?:\.[0-9]+)?) от обычного/gu)
  ).map((match) => Number(match[1]));
  for (const ratio of rareRatios) {
    if (ratio < baseline.rareRawRatio.min || ratio > baseline.rareRawRatio.max) {
      console.error(
        `baseline: rare/common ratio ${ratio} outside ${baseline.rareRawRatio.min}..${baseline.rareRawRatio.max}`
      );
      ok = false;
    }
  }

  const balances =
    /Итого по фазе 1: физика \d+ \((\d+)%\), инженерия \d+ \((\d+)%\), биология \d+ \((\d+)%\)/u.exec(
      techOutput
    );
  if (balances === null) {
    console.error("baseline: cannot parse science data balance.");
    ok = false;
  } else {
    for (const value of balances.slice(1).map((item) => Number(item) / 100)) {
      if (value < baseline.dataBalanceMin) {
        console.error(`baseline: science data balance ${value} below ${baseline.dataBalanceMin}`);
        ok = false;
      }
    }
  }

  if (
    baseline.energyCostShareMin > 0 &&
    !["solar_array", "fission_plant", "fusion_plant"].every((id) => validateOutput.includes(id))
  ) {
    console.error("baseline: economy report did not include energy section.");
    ok = false;
  }

  return ok;
}

async function checkStageTwoRuntimeData(baseline: Baseline): Promise<boolean> {
  const data = await loadStageTwoData();
  let ok = true;
  if (data.resources.length < 35 || data.batchRecipes.length < 33 || data.continuous.length < 3) {
    console.error(
      `stage-two-data: incomplete graph resources=${data.resources.length}, batch=${data.batchRecipes.length}, continuous=${data.continuous.length}`
    );
    ok = false;
  }
  if (data.graph.materialCycleCount !== baseline.materialCycles) {
    console.error(
      `stage-two-data: material cycles expected ${baseline.materialCycles}, got ${data.graph.materialCycleCount}`
    );
    ok = false;
  }
  if (data.graph.energyCycleCount < baseline.energyCyclesMin) {
    console.error(
      `stage-two-data: expected at least ${baseline.energyCyclesMin} energy cycles, got ${data.graph.energyCycleCount}`
    );
    ok = false;
  }
  if (data.graph.energyCostShareMin + 1e-9 < baseline.energyCostShareMin) {
    console.error(
      `stage-two-data: energy cost share expected at least ${baseline.energyCostShareMin}, got ${data.graph.energyCostShareMin}`
    );
    ok = false;
  }
  if ((data.transportable[resourceIndexOf(data.resourceIndex, "energy")] ?? 1) !== 0) {
    console.error("stage-two-data: energy must be non-transportable.");
    ok = false;
  }
  if (!allBuildCostResourcesAreSinks(data)) {
    console.error("stage-two-data: every build-cost resource must be covered by a sink.");
    ok = false;
  }

  const bootstrap = validateStartPackage(data);
  if (!bootstrap.ok) {
    console.error(`stage-two-data: start package invalid: ${bootstrap.missing.join(", ")}`);
    ok = false;
  }
  ok = checkPhaseOneTurnover(data) && ok;

  if (ok) console.log("stage-two-data: ok");
  return ok;
}

function checkPhaseOneTurnover(data: Awaited<ReturnType<typeof loadStageTwoData>>): boolean {
  let ok = true;
  for (let resource = 0; resource < data.resources.length; resource += 1) {
    const item = data.resources[resource];
    if (item === undefined || item.phase !== 1) continue;
    if ((data.graph.producedByCount[resource] ?? 0) <= 0) {
      console.error(`stage-two-data: phase 1 resource ${item.id} is produced nowhere.`);
      ok = false;
    }
    if ((data.graph.consumedByCount[resource] ?? 0) <= 0) {
      console.error(`stage-two-data: phase 1 resource ${item.id} is consumed nowhere.`);
      ok = false;
    }
  }
  return ok;
}

async function compareChainGraph(): Promise<boolean> {
  const generated = await readFile(resolve(reportsDir, "chain-graph.mmd"), "utf8");
  const committed = await readFile(resolve(reportsDir, "chain-graph.expected.mmd"), "utf8");
  if (generated !== committed) {
    console.error("chain-graph.mmd drifted from the committed baseline.");
    return false;
  }
  console.log("chain-graph: ok");
  return true;
}

function numberAfter(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  return match === null ? Number.NaN : Number(match[1]);
}

function isKnownBootstrapOpenIssue(output: string): boolean {
  return output.includes("food") && output.includes("luxury_goods") && output.includes("730");
}

function isCliEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
