import type { RngSnapshot } from "../rng.js";
import type { ArenaSnapshot } from "../soa/arena.js";
import type { EventQueue } from "../events/queue.js";
export interface SnapshotRngStream {
    readonly name: string;
    readonly state: RngSnapshot;
}
export interface SnapshotState {
    readonly tick: number;
    readonly rngStreams: readonly SnapshotRngStream[];
    readonly eventQueue: EventQueue;
    readonly arenas: readonly ArenaSnapshot[];
}
export interface RestoredRngStream {
    readonly name: string;
    readonly state: RngSnapshot;
}
export interface RestoredSnapshot {
    readonly tick: number;
    readonly rngStreams: readonly RestoredRngStream[];
    readonly eventQueueBuffer: ArrayBuffer;
    readonly arenas: readonly ArenaSnapshot[];
}
//# sourceMappingURL=types.d.ts.map