import { type StageOneRenderSnapshot } from "@galaxy-sim/sim-core";
import type { StageOneSimulation } from "@galaxy-sim/sim-core";
export declare const DEFAULT_RENDER_SLICES: number;
export declare function buildRenderSnapshot(simulation: StageOneSimulation, slices: number): ArrayBuffer;
export declare function decodeRenderSnapshot(buffer: ArrayBuffer): StageOneRenderSnapshot;
//# sourceMappingURL=snapshot-view.d.ts.map