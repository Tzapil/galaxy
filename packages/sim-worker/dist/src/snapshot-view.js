import { RenderSliceBit, decodeStageOneRenderSnapshot } from "@galaxy-sim/sim-core";
export const DEFAULT_RENDER_SLICES = RenderSliceBit.Map |
    RenderSliceBit.Colonies |
    RenderSliceBit.Ships |
    RenderSliceBit.Buildings |
    RenderSliceBit.Events;
export function buildRenderSnapshot(simulation, slices) {
    return simulation.renderSnapshot(slices);
}
export function decodeRenderSnapshot(buffer) {
    return decodeStageOneRenderSnapshot(buffer);
}
//# sourceMappingURL=snapshot-view.js.map