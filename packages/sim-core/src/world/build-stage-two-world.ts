import {
  addStartPackageShips,
  applyStartPackage,
  addDepositsForFeatures
} from "../bootstrap/start-package.js";
import { Rng } from "../rng.js";
import { featureMaskFromNames, type StageOneData } from "../stage-one/data.js";

import { BodyType } from "./bodies.js";
import { slotRangeForBody } from "./slots.js";
import { StageOneWorld } from "./state.js";

const SYSTEM_COUNT = 20;

export function buildStageTwoWorld(data: StageOneData, seed: number): StageOneWorld {
  const rng = Rng.fromSeed(seed).derive("stage-two-world");
  const world = StageOneWorld.create(data);

  for (let i = 0; i < SYSTEM_COUNT; i += 1) {
    const angle = (i / SYSTEM_COUNT) * Math.PI * 2;
    const ring = 145 + rng.nextInt(0, 38);
    const x = 190 + Math.cos(angle) * ring + rng.nextInt(-16, 17);
    const y = 150 + Math.sin(angle) * ring + rng.nextInt(-16, 17);
    world.systems.add(x, y, i < SYSTEM_COUNT / 2 ? 0 : 1, -1);
  }

  for (let i = 0; i < SYSTEM_COUNT; i += 1) {
    world.gates.addUndirected(world.systems, i, (i + 1) % SYSTEM_COUNT, 3 + rng.nextInt(0, 5));
  }
  for (let i = 0; i < SYSTEM_COUNT; i += 2) {
    world.gates.addUndirected(world.systems, i, (i + 5) % SYSTEM_COUNT, 6 + rng.nextInt(0, 5));
  }

  for (let system = 0; system < SYSTEM_COUNT; system += 1) {
    if (system === 0 || system === 10) continue;
    addGeneratedBodies(data, world, rng, system);
  }

  const vega = applyStartPackage(data, world, 0, "Vega Compact", undefined, false);
  const orion = applyStartPackage(data, world, 10, "Orion Combine", undefined, false);
  addStartPackageShips(data, world, vega.faction, 0);
  addStartPackageShips(data, world, orion.faction, 10);
  return world;
}

function addGeneratedBodies(
  data: StageOneData,
  world: StageOneWorld,
  rng: Rng,
  system: number
): void {
  const habitable = rng.nextInt(0, 100) < 35;
  addGeneratedBody(
    data,
    world,
    rng,
    system,
    BodyType.Planet,
    habitable ? ["habitable", "ice_deposit"] : ["ore_deposit", "silicate_deposit"],
    habitable ? 0.65 + rng.nextInt(0, 25) / 100 : 0.12 + rng.nextInt(0, 30) / 100
  );
  addGeneratedBody(data, world, rng, system, BodyType.Planet, ["ice_deposit"], 0.05);
  addGeneratedBody(data, world, rng, system, BodyType.Planet, ["gas_giant_orbit"], 0.03);

  const rareFeatures: string[] = ["ore_deposit"];
  if (rng.nextInt(0, 100) < 45) rareFeatures.push("rare_earth_vein");
  if (rng.nextInt(0, 100) < 35) rareFeatures.push("crystal_vein");
  if (rng.nextInt(0, 100) < 30) rareFeatures.push("radioactive_vein");
  addGeneratedBody(data, world, rng, system, BodyType.AsteroidBelt, rareFeatures, 0);
}

function addGeneratedBody(
  data: StageOneData,
  world: StageOneWorld,
  rng: Rng,
  system: number,
  type: BodyType,
  features: readonly string[],
  habitability: number
): void {
  const size =
    type === BodyType.AsteroidBelt
      ? 0.4 + rng.nextInt(0, 30) / 100
      : 0.7 + rng.nextInt(0, 80) / 100;
  const slots = slotRangeForBody(type, habitability).min + rng.nextInt(0, 4);
  const featureMask = featureMaskFromNames(data.featureIndex, features);
  const body = world.addBody(system, type, size, habitability, slots, -1, 0, featureMask);
  addDepositsForFeatures(data, world, body, featureMask, 0.65 + rng.nextInt(0, 70) / 100);
}
