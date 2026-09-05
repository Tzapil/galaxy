import { EventKind } from "./kinds.js";
export interface EventHandle {
    readonly slot: number;
    readonly generation: number;
}
export declare class EventBatch {
    readonly capacity: number;
    readonly ticks: Float64Array;
    readonly sequenceIds: Float64Array;
    readonly kinds: Int32Array;
    readonly payloadIndices: Int32Array;
    count: number;
    constructor(capacity: number);
    clear(): void;
    push(tick: number, sequenceId: number, kind: EventKind, payloadIndex: number): void;
}
export declare class EventQueue {
    private ticks;
    private sequenceIds;
    private kinds;
    private payloadIndices;
    private generations;
    private active;
    private heap;
    private freeSlots;
    private heapSize;
    private freeCount;
    private nextSlot;
    private nextSequence;
    constructor(initialCapacity?: number);
    get size(): number;
    get capacity(): number;
    schedule(tick: number, kind: EventKind, payloadIndex: number): EventHandle;
    cancel(handle: EventHandle): boolean;
    drainUntil(tick: number, out: EventBatch): number;
    peekTick(): number | undefined;
    serialize(): ArrayBuffer;
    static deserialize(buffer: ArrayBuffer): EventQueue;
    private isLiveHandle;
    private allocSlot;
    private releaseSlot;
    private heapPush;
    private heapPop;
    private heapSink;
    private compareSlots;
    private ensureCapacity;
    private ensureHeapCapacity;
    private ensureFreeCapacity;
}
//# sourceMappingURL=queue.d.ts.map