import type { EntityCounters, StageOneMetrics } from "@galaxy-sim/sim-core";

export type WorkerSpeed = 0 | 1 | 10 | 100 | 1000;

export interface StageOneWorkerStats {
  readonly tick: number;
  readonly targetSpeed: WorkerSpeed;
  readonly actualSpeed: number;
  readonly tickMs: number;
  readonly subsystemMs: readonly number[];
  readonly counters: EntityCounters;
}

export type WorkerCommand =
  | { readonly type: "init"; readonly seed: number; readonly params?: StageOneInitParams }
  | { readonly type: "setSpeed"; readonly multiplier: WorkerSpeed }
  | { readonly type: "pause" }
  | { readonly type: "resume" }
  | { readonly type: "save"; readonly slotId: string }
  | { readonly type: "load"; readonly slotId: string; readonly buffer?: ArrayBuffer }
  | { readonly type: "subscribe"; readonly slices: number };

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
      readonly metrics: StageOneMetrics;
    }
  | { readonly channel: "control"; readonly type: "error"; readonly message: string };

export interface StageOneInitParams {
  readonly startPaused?: boolean;
  readonly speed?: WorkerSpeed;
  readonly slices?: number;
}
