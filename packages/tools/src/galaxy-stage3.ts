import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hrtime } from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildGeneratedGalaxyWorld,
  paramsWithPreset,
  type GalaxyEdge,
  type GalaxyGenerationParams,
  type GeneratedGalaxy,
  type StageOneData
} from "@galaxy-sim/sim-core";

import { loadStageTwoData } from "./stage-two-loader.js";

interface GalaxyStageThreeOptions {
  readonly seed: number;
  readonly preset: string;
  readonly systems: number | undefined;
  readonly checkSeeds: number;
  readonly outDir: string;
}

interface GenerationCheckResult {
  readonly seed: number;
  readonly attempt: number;
  readonly systems: number;
  readonly edges: number;
  readonly averageGateDegree: number;
  readonly factions: number;
  readonly validationOk: boolean;
  readonly violationCount: number;
  readonly elapsedMs: number;
}

const shapeNames = ["disc", "spiral", "ring", "cluster"] as const;

export async function runGalaxyStageThree(
  options: GalaxyStageThreeOptions
): Promise<readonly GenerationCheckResult[]> {
  const data = await loadStageTwoData();
  const outDir = resolve(options.outDir);
  await mkdir(outDir, { recursive: true });

  const baseParams = paramsWithPreset(data.galaxyPresets, options.preset, systemOverride(options));
  await writePreviews(data, options.seed, baseParams, outDir);
  const results = runValidationSweep(data, options, baseParams);
  await writeFile(
    resolve(outDir, "stage3-galaxy-report.json"),
    `${JSON.stringify({ options, results, summary: summarize(results) }, null, 2)}\n`,
    "utf8"
  );
  printSummary(options, results);
  return results;
}

function runValidationSweep(
  data: StageOneData,
  options: GalaxyStageThreeOptions,
  params: GalaxyGenerationParams
): readonly GenerationCheckResult[] {
  const results: GenerationCheckResult[] = [];
  for (let i = 0; i < options.checkSeeds; i += 1) {
    const seed = options.seed + i;
    const started = hrtime.bigint();
    const galaxy = buildGeneratedGalaxyWorld(data, seed, params);
    const elapsedMs = Number(hrtime.bigint() - started) / 1_000_000;
    results.push({
      seed,
      attempt: galaxy.attempt,
      systems: galaxy.world.systems.length,
      edges: galaxy.edges.length,
      averageGateDegree: galaxy.averageGateDegree,
      factions: galaxy.world.factions.length,
      validationOk: galaxy.validation.ok,
      violationCount: galaxy.validation.violations.length,
      elapsedMs
    });
  }
  return results;
}

async function writePreviews(
  data: StageOneData,
  seed: number,
  params: GalaxyGenerationParams,
  outDir: string
): Promise<void> {
  for (let i = 0; i < shapeNames.length; i += 1) {
    const shape = shapeNames[i] ?? "spiral";
    const galaxy = buildGeneratedGalaxyWorld(data, seed, { ...params, shape });
    await writeFile(resolve(outDir, `galaxy-${shape}.svg`), renderSvg(galaxy), "utf8");
  }
}

function renderSvg(galaxy: GeneratedGalaxy): string {
  const width = 1000;
  const height = 1000;
  const bounds = pointBounds(galaxy.points);
  const scale = Math.min(
    (width - 80) / Math.max(1, bounds.maxX - bounds.minX),
    (height - 80) / Math.max(1, bounds.maxY - bounds.minY)
  );
  const gates = uniqueUndirected(galaxy.edges)
    .map((edge) => {
      const a = project(galaxy.points[edge.a], bounds, scale, width, height);
      const b = project(galaxy.points[edge.b], bounds, scale, width, height);
      const regionA = galaxy.world.systems.region[edge.a] ?? 0;
      const regionB = galaxy.world.systems.region[edge.b] ?? 0;
      const color = regionA === regionB ? "#333333" : "#777777";
      return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(
        2
      )}" y2="${b.y.toFixed(2)}" stroke="${color}" stroke-width="1" />`;
    })
    .join("\n");
  const systems = galaxy.points
    .map((point, index) => {
      const p = project(point, bounds, scale, width, height);
      const region = galaxy.world.systems.region[index] ?? 0;
      const owner = galaxy.world.systems.owner[index] ?? -1;
      const radius = owner >= 0 ? 5 : 2.8;
      const stroke = owner >= 0 ? "#ffffff" : "none";
      return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${radius}" fill="${regionColor(
        region
      )}" stroke="${stroke}" stroke-width="1" />`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#050505" />
<g>${gates}</g>
<g>${systems}</g>
</svg>
`;
}

function uniqueUndirected(edges: readonly GalaxyEdge[]): readonly GalaxyEdge[] {
  return edges;
}

function project(
  point: { readonly x: number; readonly y: number } | undefined,
  bounds: ReturnType<typeof pointBounds>,
  scale: number,
  width: number,
  height: number
): { readonly x: number; readonly y: number } {
  if (point === undefined) return { x: width / 2, y: height / 2 };
  return {
    x: width / 2 + (point.x - (bounds.minX + bounds.maxX) / 2) * scale,
    y: height / 2 + (point.y - (bounds.minY + bounds.maxY) / 2) * scale
  };
}

function pointBounds(points: readonly { readonly x: number; readonly y: number }[]): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point === undefined) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

function regionColor(region: number): string {
  const palette = [
    "#57a6ff",
    "#c66bff",
    "#ffc857",
    "#61d394",
    "#ff6b6b",
    "#4ecdc4",
    "#f78fb3",
    "#c5d86d",
    "#9b9ece",
    "#f4a261",
    "#7bdff2",
    "#b2f7ef"
  ];
  return palette[region % palette.length] ?? "#888888";
}

function summarize(results: readonly GenerationCheckResult[]): {
  readonly ok: boolean;
  readonly minDegree: number;
  readonly maxDegree: number;
  readonly maxElapsedMs: number;
  readonly medianElapsedMs: number;
} {
  const degrees = results.map((result) => result.averageGateDegree).sort((a, b) => a - b);
  const elapsed = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  return {
    ok: results.every((result) => result.validationOk),
    minDegree: degrees[0] ?? 0,
    maxDegree: degrees[degrees.length - 1] ?? 0,
    maxElapsedMs: elapsed[elapsed.length - 1] ?? 0,
    medianElapsedMs: elapsed[Math.floor(elapsed.length / 2)] ?? 0
  };
}

function printSummary(
  options: GalaxyStageThreeOptions,
  results: readonly GenerationCheckResult[]
): void {
  const summary = summarize(results);
  console.log(`GALAXY STAGE 3 preset=${options.preset}`);
  console.log(`seeds: ${results.length}, baseSeed: ${options.seed}`);
  console.log(`validation: ${summary.ok ? "ok" : "failed"}`);
  console.log(
    `averageGateDegree: ${summary.minDegree.toFixed(3)}..${summary.maxDegree.toFixed(3)}`
  );
  console.log(
    `elapsedMs: median=${summary.medianElapsedMs.toFixed(2)}, max=${summary.maxElapsedMs.toFixed(
      2
    )}`
  );
}

function systemOverride(options: GalaxyStageThreeOptions): GalaxyGenerationParams {
  return options.systems === undefined ? {} : { systemCount: options.systems };
}

function parseArgs(argv: readonly string[]): GalaxyStageThreeOptions {
  return {
    seed: numberArg(argv, "seed", 20260904),
    preset: stringArg(argv, "preset") ?? "balanced",
    systems: optionalNumberArg(argv, "systems"),
    checkSeeds: numberArg(argv, "check-seeds", 50),
    outDir: stringArg(argv, "out-dir") ?? "reports/stage3"
  };
}

function numberArg(argv: readonly string[], name: string, fallback: number): number {
  return optionalNumberArg(argv, name) ?? fallback;
}

function optionalNumberArg(argv: readonly string[], name: string): number | undefined {
  const raw = stringArg(argv, name);
  if (raw === undefined) return undefined;
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

if (isCliEntrypoint()) {
  await runGalaxyStageThree(parseArgs(process.argv.slice(2)));
}

function isCliEntrypoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}
