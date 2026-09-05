import { cpus } from "node:os";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isMainThread, parentPort, workerData, Worker } from "node:worker_threads";
import { StageOneSimulation, ticksFromYears } from "@galaxy-sim/sim-core";
const metricNotes = [
    ["alive_factions_by_time", "ok — в срезе две фракции"],
    ["power_concentration_index", "н/д — появится на этапе 7"],
    ["median_faction_age", "н/д — появится на этапе 7"],
    ["building_idle_without_inputs", "н/д — появится на этапе 2"],
    ["resources_at_zero_longer_than_n_years", "н/д — появится на этапе 2"],
    ["average_transport_utilization", "ok — прокси: deliveredShipments"],
    ["war_count_and_duration", "н/д — появится на этапе 6"],
    ["galactic_price_spread", "ok — averageFoodWaterSpread"]
];
if (!isMainThread) {
    const input = workerData;
    const started = process.hrtime.bigint();
    const sim = StageOneSimulation.create(input.seed);
    const report = sim.run(input.ticks, 0);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    parentPort?.postMessage({
        seed: input.seed,
        finalHash: report.finalHash,
        ticks: input.ticks,
        counters: report.counters,
        metrics: report.metrics,
        elapsedMs
    });
}
else if (isCliEntrypoint()) {
    await runBench(parseArgs(process.argv.slice(2)));
}
export async function runBench(options) {
    const ticks = ticksFromYears(options.years);
    const seeds = [];
    for (let i = 0; i < options.seeds; i += 1)
        seeds.push(20260904 + i);
    const results = await runWorkers(seeds, ticks);
    const minPopulation = describeDistribution(results.map((result) => result.metrics.minPopulation));
    const priceSpread = describeDistribution(results.map((result) => result.metrics.averageFoodWaterSpread));
    const deliveredShipments = describeDistribution(results.map((result) => result.metrics.deliveredShipments));
    const elapsedMs = describeDistribution(results.map((result) => result.elapsedMs));
    const report = {
        options,
        distributions: {
            minPopulation,
            averageFoodWaterSpread: priceSpread,
            deliveredShipments,
            elapsedMs
        },
        metrics: metricNotes.map(([name, status]) => ({ name, status })),
        runs: results
    };
    console.log("BENCH STAGE-1");
    console.log(`runs: ${results.length}, years: ${options.years}, ticksPerRun: ${ticks}`);
    console.log(`minPopulation: min=${minPopulation.min.toFixed(2)}, p10=${minPopulation.p10.toFixed(2)}, median=${minPopulation.median.toFixed(2)}, p90=${minPopulation.p90.toFixed(2)}, max=${minPopulation.max.toFixed(2)}`);
    console.log(`averageFoodWaterSpread: min=${priceSpread.min.toFixed(4)}, p10=${priceSpread.p10.toFixed(4)}, median=${priceSpread.median.toFixed(4)}, p90=${priceSpread.p90.toFixed(4)}, max=${priceSpread.max.toFixed(4)}`);
    console.log(`deliveredShipments: min=${deliveredShipments.min}, p10=${deliveredShipments.p10}, median=${deliveredShipments.median}, p90=${deliveredShipments.p90}, max=${deliveredShipments.max}`);
    console.log(`elapsedMs: min=${elapsedMs.min.toFixed(2)}, p10=${elapsedMs.p10.toFixed(2)}, median=${elapsedMs.median.toFixed(2)}, p90=${elapsedMs.p90.toFixed(2)}, max=${elapsedMs.max.toFixed(2)}`);
    for (const [name, status] of metricNotes)
        console.log(`${name}: ${status}`);
    if (options.out !== undefined) {
        await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
    return results;
}
async function runWorkers(seeds, ticks) {
    const maxWorkers = Math.max(1, Math.min(cpus().length, seeds.length));
    const results = [];
    let cursor = 0;
    async function next() {
        const seed = seeds[cursor];
        cursor += 1;
        if (seed === undefined)
            return;
        const result = await runWorker({ seed, ticks });
        results.push(result);
        await next();
    }
    const starters = [];
    for (let i = 0; i < maxWorkers; i += 1)
        starters.push(next());
    await Promise.all(starters);
    results.sort((a, b) => a.seed - b.seed);
    return results;
}
function runWorker(input) {
    return new Promise((resolveWorker, rejectWorker) => {
        const worker = new Worker(new URL(import.meta.url), {
            workerData: input,
            execArgv: ["--import", "tsx"]
        });
        worker.once("message", (message) => resolveWorker(message));
        worker.once("error", rejectWorker);
        worker.once("exit", (code) => {
            if (code !== 0)
                rejectWorker(new Error(`bench worker exited with code ${code}`));
        });
    });
}
function describeDistribution(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
        min: percentile(sorted, 0),
        p10: percentile(sorted, 0.1),
        median: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        max: percentile(sorted, 1)
    };
}
function percentile(sorted, q) {
    if (sorted.length === 0)
        return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
    return sorted[index] ?? 0;
}
function parseArgs(argv) {
    return {
        seeds: numberArg(argv, "seeds", 50),
        years: numberArg(argv, "years", 100),
        out: stringArg(argv, "out")
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
function isCliEntrypoint() {
    return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
//# sourceMappingURL=bench.js.map