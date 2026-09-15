import {
  RenderSliceBit,
  type StageOneRenderSnapshot,
  decodeStageOneRenderSnapshot
} from "@galaxy-sim/sim-core";

export const DEFAULT_RENDER_SLICES =
  RenderSliceBit.Map |
  RenderSliceBit.Colonies |
  RenderSliceBit.Ships |
  RenderSliceBit.Buildings |
  RenderSliceBit.Events;

export function buildRenderSnapshot(
  simulation: { readonly renderSnapshot: (slices: number) => ArrayBuffer },
  slices: number
): ArrayBuffer {
  return simulation.renderSnapshot(slices);
}

export function decodeRenderSnapshot(buffer: ArrayBuffer): StageOneRenderSnapshot {
  return decodeStageOneRenderSnapshot(buffer);
}
