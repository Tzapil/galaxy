import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { StageOneSimulation, StageTwoSimulation, StageZeroSimulation } from "@galaxy-sim/sim-core";

import { detectPathologies } from "./pathology.js";
import { runStageSixCampaign } from "./stage-six-bench.js";
import { runStageSevenCampaign } from "./stage-seven-bench.js";
import { loadStageTwoData } from "./stage-two-loader.js";

interface ScenarioFile {
  readonly stage?: 0 | 1 | 2 | 6 | 7;
  readonly seed: number;
  readonly ticks: number;
  readonly description: string;
  readonly expectedPathologyStatus: "ok" | "failed" | "not_available";
}

const here = dirname(fileURLToPath(import.meta.url));
const scenariosDir = resolve(here, "../scenarios");

export async function checkScenarios(): Promise<boolean> {
  const files = (await readdir(scenariosDir)).filter((file) => file.endsWith(".json")).sort();
  const stageTwoData = files.some(
    (file) =>
      file.includes("stage-two") || file.includes("stage-six") || file.includes("stage-seven")
  )
    ? await loadStageTwoData()
    : undefined;
  let ok = true;
  for (const file of files) {
    const scenario = JSON.parse(
      await readFile(resolve(scenariosDir, file), "utf8")
    ) as ScenarioFile;
    const stage = scenario.stage ?? 0;
    const findings =
      stage === 0
        ? stageZeroFindings(scenario)
        : stage === 1
          ? stageOneFindings(scenario)
          : stage === 2
            ? stageTwoFindings(scenario, requireStageTwoData(stageTwoData))
            : stage === 6
              ? stageSixFindings(scenario, requireStageTwoData(stageTwoData))
              : stageSevenFindings(scenario, requireStageTwoData(stageTwoData));
    const failed = findings.some((finding) => finding.status === "failed");
    const enabled = findings.some((finding) => finding.status !== "not_available");
    const status = failed ? "failed" : enabled ? "ok" : "not_available";
    if (status !== scenario.expectedPathologyStatus) {
      console.error(`${file}: expected ${scenario.expectedPathologyStatus}, got ${status}`);
      for (const finding of findings.filter((item) => item.status === "failed")) {
        console.error(`  ${finding.check}: ${finding.message}`);
      }
      ok = false;
    } else {
      console.log(`${file}: ${scenario.description} -> ${status}`);
    }
  }
  return ok;
}

function stageSevenFindings(
  scenario: ScenarioFile,
  data: Parameters<typeof StageTwoSimulation.create>[1]
): ReturnType<typeof detectPathologies> {
  const report = runStageSevenCampaign(scenario.seed, scenario.ticks / 365, data);
  return detectPathologies({
    seed: scenario.seed,
    tick: scenario.ticks,
    stage: 7,
    metrics: report.metrics
  });
}

function stageSixFindings(
  scenario: ScenarioFile,
  data: Parameters<typeof StageTwoSimulation.create>[1]
): ReturnType<typeof detectPathologies> {
  const report = runStageSixCampaign(scenario.seed, scenario.ticks / 365, data);
  return detectPathologies({
    seed: scenario.seed,
    tick: scenario.ticks,
    stage: 6,
    metrics: report.metrics
  });
}

function stageZeroFindings(scenario: ScenarioFile): ReturnType<typeof detectPathologies> {
  StageZeroSimulation.create(scenario.seed).run(scenario.ticks, 0);
  return detectPathologies({
    seed: scenario.seed,
    tick: scenario.ticks,
    stage: 0
  });
}

function stageOneFindings(scenario: ScenarioFile): ReturnType<typeof detectPathologies> {
  const report = StageOneSimulation.create(scenario.seed).run(scenario.ticks, 0);
  return detectPathologies({
    seed: scenario.seed,
    tick: scenario.ticks,
    stage: 1,
    metrics: report.metrics
  });
}

function stageTwoFindings(
  scenario: ScenarioFile,
  data: Parameters<typeof StageTwoSimulation.create>[1]
): ReturnType<typeof detectPathologies> {
  const report = StageTwoSimulation.create(scenario.seed, data).run(scenario.ticks, 0);
  return detectPathologies({
    seed: scenario.seed,
    tick: scenario.ticks,
    stage: 2,
    metrics: report.metrics
  });
}

function requireStageTwoData(
  data: Awaited<ReturnType<typeof loadStageTwoData>> | undefined
): Awaited<ReturnType<typeof loadStageTwoData>> {
  if (data === undefined) throw new Error("Stage 2 data was not loaded.");
  return data;
}

if (isCliEntrypoint()) {
  const ok = await checkScenarios();
  process.exit(ok ? 0 : 1);
}

function isCliEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
