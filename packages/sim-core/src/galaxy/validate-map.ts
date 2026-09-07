import { resourceIndexOf, type StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

import type { NormalizedGalaxyParams } from "./params.js";
import { connectedComponentCount, shortestJumpDistances } from "./prune.js";
import { rareResourceIndices, tierOneStartResourceIndices } from "./resources-gen.js";
import type { GalaxyEdge } from "./types.js";

export type MapValidationCode =
  "graphDisconnected" | "startResourceAccess" | "startDistance" | "rareResourceClusters";

export interface MapValidationViolation {
  readonly code: MapValidationCode;
  readonly message: string;
  readonly subject: string;
  readonly expected: number;
  readonly actual: number;
}

export interface MapValidationResult {
  readonly ok: boolean;
  readonly violations: readonly MapValidationViolation[];
}

export function validateGalaxyMap(
  data: StageOneData,
  world: StageOneWorld,
  edges: readonly GalaxyEdge[],
  params: NormalizedGalaxyParams
): MapValidationResult {
  const violations: MapValidationViolation[] = [];
  const components = connectedComponentCount(world.systems.length, edges);
  if (components !== 1) {
    violations.push({
      code: "graphDisconnected",
      message: "Gate graph must have exactly one connected component.",
      subject: "gates",
      expected: 1,
      actual: components
    });
  }
  validateStartDistances(world, edges, params, violations);
  validateStartResourceAccess(data, world, edges, params, violations);
  validateRareClusters(data, world, edges, params, violations);
  return { ok: violations.length === 0, violations };
}

export function systemResourcePresence(
  data: StageOneData,
  world: StageOneWorld
): readonly Uint8Array[] {
  const rows: Uint8Array[] = [];
  for (let system = 0; system < world.systems.length; system += 1) {
    rows.push(new Uint8Array(data.resources.length));
  }
  for (let deposit = 0; deposit < world.bodies.deposits.length; deposit += 1) {
    const body = world.bodies.deposits.body[deposit] ?? 0;
    const system = world.bodies.system[body] ?? 0;
    const resource = world.bodies.deposits.resource[deposit] ?? 0;
    const row = rows[system];
    if (row !== undefined) row[resource] = 1;
  }
  return rows;
}

function validateStartDistances(
  world: StageOneWorld,
  edges: readonly GalaxyEdge[],
  params: NormalizedGalaxyParams,
  violations: MapValidationViolation[]
): void {
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    const start = world.factions.capitalSystem[faction] ?? 0;
    const distances = shortestJumpDistances(world.systems.length, edges, start);
    for (let other = faction + 1; other < world.factions.length; other += 1) {
      const distance = distances[world.factions.capitalSystem[other] ?? 0] ?? 0xffff;
      if (distance < params.factionMinJumps) {
        violations.push({
          code: "startDistance",
          message: "Faction starts must be separated by factionMinJumps.",
          subject: `${faction}:${other}`,
          expected: params.factionMinJumps,
          actual: distance
        });
      }
    }
  }
}

function validateStartResourceAccess(
  data: StageOneData,
  world: StageOneWorld,
  edges: readonly GalaxyEdge[],
  params: NormalizedGalaxyParams,
  violations: MapValidationViolation[]
): void {
  const presence = systemResourcePresence(data, world);
  const required = tierOneStartResourceIndices(data);
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    const start = world.factions.capitalSystem[faction] ?? 0;
    const distances = shortestJumpDistances(
      world.systems.length,
      edges,
      start,
      params.startViabilityJumps
    );
    for (let r = 0; r < required.length; r += 1) {
      const resource = required[r] ?? 0;
      let found = false;
      for (let system = 0; system < presence.length; system += 1) {
        if ((distances[system] ?? 0xffff) > params.startViabilityJumps) continue;
        if (presence[system]?.[resource] === 1) {
          found = true;
          break;
        }
      }
      if (!found) {
        violations.push({
          code: "startResourceAccess",
          message: "Faction start lacks a tier-1 raw category within jump radius.",
          subject: `${faction}:${data.resources[resource]?.id ?? String(resource)}`,
          expected: 1,
          actual: 0
        });
      }
    }
  }
}

function validateRareClusters(
  data: StageOneData,
  world: StageOneWorld,
  edges: readonly GalaxyEdge[],
  params: NormalizedGalaxyParams,
  violations: MapValidationViolation[]
): void {
  const presence = systemResourcePresence(data, world);
  const rares = rareResourceIndices(data);
  for (let i = 0; i < rares.length; i += 1) {
    const resource = rares[i] ?? 0;
    const clusters = countResourceClusters(presence, edges, resource);
    if (clusters < params.rareResourceClusterMin) {
      violations.push({
        code: "rareResourceClusters",
        message: "Rare resources must appear in several gate-separated clusters.",
        subject: data.resources[resource]?.id ?? String(resource),
        expected: params.rareResourceClusterMin,
        actual: clusters
      });
    }
  }
}

function countResourceClusters(
  presence: readonly Uint8Array[],
  edges: readonly GalaxyEdge[],
  resource: number
): number {
  const marked = new Uint8Array(presence.length);
  for (let system = 0; system < presence.length; system += 1) {
    if (presence[system]?.[resource] === 1) marked[system] = 1;
  }
  const visited = new Uint8Array(presence.length);
  const queue = new Int32Array(presence.length);
  let clusters = 0;
  for (let start = 0; start < presence.length; start += 1) {
    if (marked[start] !== 1 || visited[start] === 1) continue;
    clusters += 1;
    let read = 0;
    let write = 1;
    queue[0] = start;
    visited[start] = 1;
    while (read < write) {
      const current = queue[read] ?? 0;
      read += 1;
      for (let e = 0; e < edges.length; e += 1) {
        const edge = edges[e];
        if (edge === undefined) continue;
        let next = -1;
        if (edge.a === current) next = edge.b;
        else if (edge.b === current) next = edge.a;
        if (next < 0 || marked[next] !== 1 || visited[next] === 1) continue;
        visited[next] = 1;
        queue[write] = next;
        write += 1;
      }
    }
  }
  return clusters;
}

export function resourceByIdOrNegative(data: StageOneData, id: string): number {
  try {
    return resourceIndexOf(data.resourceIndex, id);
  } catch {
    return -1;
  }
}
