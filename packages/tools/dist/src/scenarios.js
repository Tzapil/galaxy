import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { StageOneSimulation, StageZeroSimulation } from "@galaxy-sim/sim-core";
import { detectPathologies } from "./pathology.js";
const here = dirname(fileURLToPath(import.meta.url));
const scenariosDir = resolve(here, "../scenarios");
export async function checkScenarios() {
    const files = (await readdir(scenariosDir)).filter((file) => file.endsWith(".json")).sort();
    let ok = true;
    for (const file of files) {
        const scenario = JSON.parse(await readFile(resolve(scenariosDir, file), "utf8"));
        const stage = scenario.stage ?? 0;
        const findings = stage === 0 ? stageZeroFindings(scenario) : stageOneFindings(scenario);
        const failed = findings.some((finding) => finding.status === "failed");
        const enabled = findings.some((finding) => finding.status !== "not_available");
        const status = failed ? "failed" : enabled ? "ok" : "not_available";
        if (status !== scenario.expectedPathologyStatus) {
            console.error(`${file}: expected ${scenario.expectedPathologyStatus}, got ${status}`);
            ok = false;
        }
        else {
            console.log(`${file}: ${scenario.description} -> ${status}`);
        }
    }
    return ok;
}
function stageZeroFindings(scenario) {
    StageZeroSimulation.create(scenario.seed).run(scenario.ticks, 0);
    return detectPathologies({
        seed: scenario.seed,
        tick: scenario.ticks,
        stage: 0
    });
}
function stageOneFindings(scenario) {
    const report = StageOneSimulation.create(scenario.seed).run(scenario.ticks, 0);
    return detectPathologies({
        seed: scenario.seed,
        tick: scenario.ticks,
        stage: 1,
        metrics: report.metrics
    });
}
if (isCliEntrypoint()) {
    const ok = await checkScenarios();
    process.exit(ok ? 0 : 1);
}
function isCliEntrypoint() {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
//# sourceMappingURL=scenarios.js.map