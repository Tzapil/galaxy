import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { hrtime } from "node:process";
import { pathToFileURL } from "node:url";
import { Instrumentation, buildStageThreeWorld, paramsWithPreset, StageOneSimulation, StageTwoSimulation, StageZeroSimulation, ticksFromYears } from "@galaxy-sim/sim-core";
import { loadStageTwoData } from "./stage-two-loader.js";
const subsystemNames = ["continuous", "events", "snapshot", "total"];
export async function runHeadless(options) {
    const stageTwoData = options.stage === 2 || options.stage === 3 ? await loadStageTwoData() : undefined;
    const sim = options.stage === 0
        ? StageZeroSimulation.create(options.seed)
        : options.stage === 1
            ? StageOneSimulation.create(options.seed)
            : options.stage === 2
                ? StageTwoSimulation.create(options.seed, requireStageTwoData(stageTwoData))
                : StageTwoSimulation.createFromWorld(options.seed, requireStageTwoData(stageTwoData), buildStageThreeWorld(requireStageTwoData(stageTwoData), options.seed, paramsWithPreset(requireStageTwoData(stageTwoData).galaxyPresets, options.preset)));
    const started = hrtime.bigint();
    const instrumentation = new Instrumentation({
        enabled: true,
        targetTicksPerSecond: 1000,
        historyCapacity: 60_000,
        nowMs: () => Number(hrtime.bigint() - started) / 1_000_000
    });
    const report = sim.run(options.ticks, options.snapshotEvery, instrumentation);
    const elapsedMs = Number(hrtime.bigint() - started) / 1_000_000;
    const summary = instrumentation.summary(elapsedMs);
    printRunReport(options, report, elapsedMs, summary.subsystemMs);
    if (options.reportPath !== undefined) {
        await mkdir(dirname(resolve(options.reportPath)), { recursive: true });
        await writeFile(options.reportPath, `${JSON.stringify({ options, report, elapsedMs, instrumentation: summary }, null, 2)}\n`, "utf8");
    }
    return report;
}
function printRunReport(options, report, elapsedMs, subsystemMs) {
    const ticksPerSecond = elapsedMs > 0 ? (options.ticks / elapsedMs) * 1000 : 0;
    console.log(`HEADLESS STAGE-${options.stage} RUN`);
    console.log(`seed: ${options.seed}`);
    console.log(`ticks: ${options.ticks}`);
    console.log(`elapsedMs: ${elapsedMs.toFixed(2)}`);
    console.log(`actualTicksPerSecond: ${ticksPerSecond.toFixed(0)}`);
    console.log("subsystemsMs:");
    for (let i = 0; i < subsystemNames.length; i += 1) {
        console.log(`  ${subsystemNames[i]}: ${(subsystemMs[i] ?? 0).toFixed(3)}`);
    }
    console.log(`counters: systems=${report.counters.systems}, factions=${report.counters.factions}, ships=${report.counters.ships}, buildings=${report.counters.buildings}`);
    if ("metrics" in report) {
        console.log(`metrics: totalPop=${report.metrics.totalPopulation.toFixed(2)}, minPop=${report.metrics.minPopulation.toFixed(2)}, delivered=${report.metrics.deliveredShipments}, spread=${report.metrics.averageFoodWaterSpread.toFixed(4)}`);
        if ("idleNoPower" in report.metrics) {
            console.log(`stage2: idleNoPower=${report.metrics.idleNoPower}, idleMissingInput=${report.metrics.idleMissingInput}, constructed=${report.metrics.constructedBuildings}, researched=${report.metrics.researchedTechnologies}, disbanded=${report.metrics.disbandedShips}, activeConstruction=${report.metrics.activeConstructions}, slotFill=${report.metrics.slotFillRatio.toFixed(3)}, maxZero=${report.metrics.maxResourceZeroStreakDays}, treasuryMin=${report.metrics.treasuryMin.toFixed(2)}`);
        }
    }
    console.log("intermediateHashes:");
    for (const checkpoint of report.intermediateHashes) {
        console.log(`  ${checkpoint.tick}: ${checkpoint.hash}`);
    }
    console.log(`finalHash: ${report.finalHash}`);
}
function parseArgs(argv) {
    const stage = numberArg(argv, "stage", 1);
    if (stage !== 0 && stage !== 1 && stage !== 2 && stage !== 3)
        throw new Error("--stage must be 0, 1, 2 or 3.");
    return {
        stage,
        seed: numberArg(argv, "seed", 20260904),
        ticks: numberArg(argv, "ticks", ticksFromYears(100)),
        snapshotEvery: numberArg(argv, "snapshot-every", 10_000),
        reportPath: stringArg(argv, "report"),
        preset: stringArg(argv, "preset") ?? "balanced"
    };
}
function requireStageTwoData(data) {
    if (data === undefined)
        throw new Error("Stage two data was not loaded.");
    return data;
}
function numberArg(argv, name, fallback) {
    const raw = stringArg(argv, name);
    if (raw === undefined)
        return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value))
        throw new Error(`--${name} must be a number.`);
    return Math.trunc(value);
}
function stringArg(argv, name) {
    const exact = `--${name}`;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === exact)
            return argv[i + 1];
        if (arg?.startsWith(`${exact}=`) === true)
            return arg.slice(exact.length + 1);
    }
    return undefined;
}
if (isCliEntrypoint()) {
    await runHeadless(parseArgs(process.argv.slice(2)));
}
function isCliEntrypoint() {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
//# sourceMappingURL=headless.js.map