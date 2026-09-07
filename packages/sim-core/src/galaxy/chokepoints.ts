import { compareEdges } from "./delaunay.js";
import { connectedComponentCount, degreesFor } from "./prune.js";
import { sortedEdgesByRegionPair } from "./regions.js";
import type { GalaxyEdge } from "./types.js";

interface ActiveEdge {
  readonly edge: GalaxyEdge;
  active: boolean;
}

export function applyChokepoints(
  systemCount: number,
  edges: readonly GalaxyEdge[],
  regionOfSystem: Uint16Array,
  chokepointStrength: number
): readonly GalaxyEdge[] {
  if (chokepointStrength <= 0) return edges.slice().sort(compareEdges);
  const active = edges
    .slice()
    .sort(compareEdges)
    .map((edge) => ({ edge, active: true }));
  const degrees = degreesFor(systemCount, edges);
  const groups = sortedEdgesByRegionPair(edges, regionOfSystem);
  const groupKeys = Array.from(groups.keys()).sort();
  for (let g = 0; g < groupKeys.length; g += 1) {
    const group = groups.get(groupKeys[g] ?? "");
    if (group === undefined || group.length <= 1) continue;
    const keepCount =
      chokepointStrength >= 1 ? 1 : Math.max(1, Math.ceil(group.length * (1 - chokepointStrength)));
    const removalOrder = group.slice().sort((a, b) => {
      if (a.length !== b.length) return b.length - a.length;
      return compareEdges(b, a);
    });
    let liveInGroup = group.length;
    for (let i = 0; i < removalOrder.length && liveInGroup > keepCount; i += 1) {
      const edge = removalOrder[i];
      if (edge === undefined) continue;
      const activeIndex = findActiveEdge(active, edge);
      if (activeIndex < 0) continue;
      const activeEdge = active[activeIndex];
      if (activeEdge === undefined) continue;
      if ((degrees[edge.a] ?? 0) <= 1 || (degrees[edge.b] ?? 0) <= 1) continue;
      activeEdge.active = false;
      if (connectedComponentCount(systemCount, materialize(active)) === 1) {
        degrees[edge.a] = Math.max(0, (degrees[edge.a] ?? 0) - 1);
        degrees[edge.b] = Math.max(0, (degrees[edge.b] ?? 0) - 1);
        liveInGroup -= 1;
      } else {
        activeEdge.active = true;
      }
    }
  }
  return materialize(active);
}

function findActiveEdge(active: readonly ActiveEdge[], edge: GalaxyEdge): number {
  for (let i = 0; i < active.length; i += 1) {
    const item = active[i];
    if (item?.active === true && item.edge.a === edge.a && item.edge.b === edge.b) return i;
  }
  return -1;
}

function materialize(active: readonly ActiveEdge[]): GalaxyEdge[] {
  const edges: GalaxyEdge[] = [];
  for (let i = 0; i < active.length; i += 1) {
    const item = active[i];
    if (item?.active === true) edges.push(item.edge);
  }
  return edges.sort(compareEdges);
}
