import { buildingIndexOf, type StageOneData } from "../stage-one/data.js";
import { addDepositsForFeatures } from "./start-package.js";
import { validatePlacement } from "../econ/placement.js";
import type { StageOneWorld } from "../world/state.js";

export interface FoundColonyResult {
  readonly ok: boolean;
  readonly body: number;
  readonly buildings: number;
  readonly reason?: "alreadyOwned" | "noValidBuildings";
}

const starterBuildings = ["solar_array", "housing", "warehouse", "hydroponics_bay"] as const;

export function foundColony(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  body: number,
  _tick = 0
): FoundColonyResult {
  if ((world.bodies.owner[body] ?? -1) >= 0) {
    return { ok: false, body, buildings: 0, reason: "alreadyOwned" };
  }
  world.addColony(faction, body, 12);
  addDepositsForFeatures(
    data,
    world,
    body,
    world.bodies.featureMask[body] ?? 0,
    world.bodies.size[body] ?? 1
  );

  let buildings = 0;
  for (const id of starterBuildings) buildings += addIfPlaceable(data, world, body, id);
  buildings += addExtractionIfPlaceable(data, world, body);
  seedColonyStockpile(data, world, body);

  if (buildings === 0) return { ok: false, body, buildings, reason: "noValidBuildings" };
  return { ok: true, body, buildings };
}

function addExtractionIfPlaceable(data: StageOneData, world: StageOneWorld, body: number): number {
  const candidates = [
    ["ore", "mine"],
    ["ice", "ice_drill"],
    ["gas", "gas_collector"],
    ["silicates", "quarry"],
    ["rare_earth", "rare_earth_mine"],
    ["crystals", "crystal_mine"],
    ["radioactives", "radioactive_mine"]
  ] as const;

  for (const [resource, building] of candidates) {
    const resourceIndex = data.resourceIndex.get(resource);
    if (resourceIndex === undefined || !world.bodies.hasDeposit(body, resourceIndex)) continue;
    if (addIfPlaceable(data, world, body, building) > 0) return 1;
  }
  return 0;
}

function addIfPlaceable(
  data: StageOneData,
  world: StageOneWorld,
  body: number,
  buildingId: string
): number {
  const buildingType = data.buildingIndex.get(buildingId);
  if (buildingType === undefined) return 0;
  const placement = validatePlacement(data, world, body, buildingType);
  if (!placement.ok) return 0;
  world.buildings.addBuilt(data, world.bodies, body, buildingType, world.stockpiles);
  return 1;
}

function seedColonyStockpile(data: StageOneData, world: StageOneWorld, body: number): void {
  const pack = data.startPackage;
  if (pack === undefined) return;
  const stockpile = world.bodies.stockpile[body] ?? 0;
  for (let i = 0; i < pack.stockpiles.length; i += 1) {
    const item = pack.stockpiles[i];
    if (item === undefined) throw new RangeError("Start stockpile is inconsistent.");
    const vital = (data.populationNeeds.perThousandPopPerDay[item.resource] ?? 0) > 0;
    const fuel = data.resources[item.resource]?.id === "fuel";
    const buildingMaterial = buildingIndexOf(data.buildingIndex, "housing") >= 0 && item.amount > 0;
    if (vital || fuel || buildingMaterial) {
      world.stockpiles.set(stockpile, item.resource, Math.max(1, item.amount * 0.08));
    }
  }
}
