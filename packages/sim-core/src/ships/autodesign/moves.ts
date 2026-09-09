import type { StageOneData } from "../../stage-one/data.js";
import type { ShipDesign } from "../design-stats.js";
import { slotBudgetValue } from "../hull.js";
import { calculateDesignStats } from "../design-stats.js";

export type AutoDesignMoveKind = "add" | "swap";

export interface AutoDesignMove {
  readonly kind: AutoDesignMoveKind;
  readonly module: number;
  readonly replaceIndex: number;
}

export function singleMoves(
  data: StageOneData,
  design: ShipDesign,
  modulePool: readonly number[]
): readonly AutoDesignMove[] {
  const hull = data.hulls[design.hull];
  if (hull === undefined) throw new RangeError(`Unknown hull index ${design.hull}.`);
  const stats = calculateDesignStats(data, design);
  const moves: AutoDesignMove[] = [];
  for (let i = 0; i < modulePool.length; i += 1) {
    const moduleIndex = modulePool[i] ?? -1;
    const module = data.modules[moduleIndex];
    if (module === undefined) throw new RangeError(`Unknown module index ${moduleIndex}.`);
    if (slotBudgetValue(stats.usedSlots, module.slot) < slotBudgetValue(hull.slots, module.slot)) {
      moves.push({ kind: "add", module: moduleIndex, replaceIndex: -1 });
    }
  }
  for (let slot = 0; slot < design.modules.length; slot += 1) {
    const current = data.modules[design.modules[slot] ?? -1];
    if (current === undefined) throw new RangeError("Design module list is inconsistent.");
    for (let i = 0; i < modulePool.length; i += 1) {
      const moduleIndex = modulePool[i] ?? -1;
      const candidate = data.modules[moduleIndex];
      if (candidate === undefined) throw new RangeError(`Unknown module index ${moduleIndex}.`);
      if (candidate.id === current.id || candidate.slot !== current.slot) continue;
      moves.push({ kind: "swap", module: moduleIndex, replaceIndex: slot });
    }
  }
  return moves;
}

export function applyMove(design: ShipDesign, move: AutoDesignMove): ShipDesign {
  if (move.kind === "add") {
    const modules = design.modules.slice();
    modules.push(move.module);
    return { hull: design.hull, modules };
  }
  const modules = design.modules.slice();
  modules[move.replaceIndex] = move.module;
  return { hull: design.hull, modules };
}
