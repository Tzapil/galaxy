import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { hrtime } from "node:process";
import { pathToFileURL } from "node:url";
import { Instrumentation, StageOneSimulation, StageZeroSimulation, ticksFromYears } from "@galaxy-sim/sim-core";
const subsystemNames = ["continuous", "events", "snapshot", "total"];
export async function runHeadless(options) {
    const sim = options.stage === 0
        ? StageZeroSimulation.create(options.seed)
        : StageOneSimulation.create(options.seed);
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
    }
    console.log("intermediateHashes:");
    for (const checkpoint of report.intermediateHashes) {
        console.log(`  ${checkpoint.tick}: ${checkpoint.hash}`);
    }
    console.log(`finalHash: ${report.finalHash}`);
}
function parseArgs(argv) {
    const stage = numberArg(argv, "stage", 1);
    if (stage !== 0 && stage !== 1)
        throw new Error("--stage must be 0 or 1.");
    return {
        stage,
        seed: numberArg(argv, "seed", 20260904),
        ticks: numberArg(argv, "ticks", ticksFromYears(100)),
        snapshotEvery: numberArg(argv, "snapshot-every", 10_000),
        reportPath: stringArg(argv, "report")
    };
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