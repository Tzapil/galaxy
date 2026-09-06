import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFromDirectory } from "@galaxy-sim/sim-data/node";
import { createStageTwoDataFromGameData, type StageOneData } from "@galaxy-sim/sim-core";

export async function loadStageTwoData(): Promise<StageOneData> {
  const root = workspaceRoot();
  const loaded = await loadFromDirectory(
    resolve(root, "packages/sim-data/data"),
    resolve(root, "packages/sim-data/schema")
  );
  return createStageTwoDataFromGameData(loaded.data);
}

function workspaceRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const sourceCandidate = resolve(here, "../../..");
  if (existsSync(resolve(sourceCandidate, "packages/sim-data/data"))) return sourceCandidate;
  const distCandidate = resolve(here, "../../../..");
  if (existsSync(resolve(distCandidate, "packages/sim-data/data"))) return distCandidate;
  return process.cwd();
}
