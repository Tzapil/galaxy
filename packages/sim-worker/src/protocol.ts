import type {
  EntityCounters,
  GalaxyGenerationParams,
  RenderEvent,
  StageTwoMetrics,
  TechnicalEntityLimits
} from "@galaxy-sim/sim-core";

import type { HistoryPayload, HistoryRequest } from "./history.js";
import type { SystemView } from "./system-view.js";

export type WorkerSpeed = 0 | 1 | 10 | 100 | 1000;

export type TechnicalLimits = TechnicalEntityLimits;

export interface FactionSummary {
  readonly id: number;
  readonly label: string;
  readonly systems: number;
  readonly population: number;
  readonly ships: number;
  readonly treasury: number;
  readonly power: number;
}

export interface StageOneWorkerStats {
  readonly tick: number;
  readonly targetSpeed: WorkerSpeed;
  readonly actualSpeed: number;
  readonly tickMs: number;
  readonly subsystemMs: readonly number[];
  readonly tickMsHistory: readonly number[];
  readonly counters: EntityCounters;
  readonly factions: readonly FactionSummary[];
}

export type WorkerCommand =
  | { readonly type: "init"; readonly seed: number; readonly params?: StageOneInitParams }
  | { readonly type: "setSpeed"; readonly multiplier: WorkerSpeed }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "save"; readonly slotId: string }
  | {
      readonly type: "load";
      readonly slotId: string;
      readonly buffer?: ArrayBuffer;
      readonly technicalLimits?: TechnicalLimits;
    }
  | { readonly type: "subscribe"; readonly slices: number }
  | { readonly type: "selectSystem"; readonly system: number }
  | { readonly type: "history"; readonly request: HistoryRequest };

export type WorkerMessage =
  | {
      readonly channel: "control";
      readonly type: "ready";
      readonly tick: number;
      readonly hash: string;
    }
  | {
      readonly channel: "control";
      readonly type: "saved";
      readonly slotId: string;
      readonly tick: number;
      readonly hash: string;
      readonly buffer: ArrayBuffer;
    }
  | {
      readonly channel: "control";
      readonly type: "loaded";
      readonly slotId: string;
      readonly tick: number;
      readonly hash: string;
    }
  | {
      readonly channel: "snapshot";
      readonly type: "snapshot";
      readonly tick: number;
      readonly slices: number;
      readonly buffer: ArrayBuffer;
    }
  | {
      readonly channel: "stats";
      readonly type: "stats";
      readonly stats: StageOneWorkerStats;
      readonly metrics: StageTwoMetrics;
    }
  | { readonly channel: "system"; readonly type: "system"; readonly view: SystemView }
  | { readonly channel: "history"; readonly type: "history"; readonly payload: HistoryPayload }
  | { readonly channel: "events"; readonly type: "events"; readonly events: readonly RenderEvent[] }
  | { readonly channel: "control"; readonly type: "error"; readonly message: string };

export interface StageOneInitParams {
  readonly startPaused?: boolean;
  readonly speed?: WorkerSpeed;
  readonly slices?: number;
  readonly galaxy?: GalaxyGenerationParams;
  readonly technicalLimits?: TechnicalLimits;
  readonly targetTicksPerSecond?: number;
}
