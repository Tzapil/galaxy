import { EventKind } from "./kinds.js";

export interface EventHandle {
  readonly slot: number;
  readonly generation: number;
}

export class EventBatch {
  public readonly ticks: Float64Array;
  public readonly sequenceIds: Float64Array;
  public readonly kinds: Int32Array;
  public readonly payloadIndices: Int32Array;
  public count = 0;

  public constructor(public readonly capacity: number) {
    this.ticks = new Float64Array(capacity);
    this.sequenceIds = new Float64Array(capacity);
    this.kinds = new Int32Array(capacity);
    this.payloadIndices = new Int32Array(capacity);
  }

  public clear(): void {
    this.count = 0;
  }

  public push(tick: number, sequenceId: number, kind: EventKind, payloadIndex: number): void {
    if (this.count >= this.capacity) throw new RangeError("EventBatch capacity exceeded.");
    this.ticks[this.count] = tick;
    this.sequenceIds[this.count] = sequenceId;
    this.kinds[this.count] = kind;
    this.payloadIndices[this.count] = payloadIndex;
    this.count += 1;
  }
}

export class EventQueue {
  private ticks: Float64Array;
  private sequenceIds: Float64Array;
  private kinds: Int32Array;
  private payloadIndices: Int32Array;
  private generations: Uint32Array;
  private active: Uint8Array;
  private heap: Int32Array;
  private freeSlots: Int32Array;
  private heapSize = 0;
  private freeCount = 0;
  private nextSlot = 0;
  private nextSequence = 0;

  public constructor(initialCapacity = 64) {
    const capacity = Math.max(1, initialCapacity | 0);
    this.ticks = new Float64Array(capacity);
    this.sequenceIds = new Float64Array(capacity);
    this.kinds = new Int32Array(capacity);
    this.payloadIndices = new Int32Array(capacity);
    this.generations = new Uint32Array(capacity);
    this.active = new Uint8Array(capacity);
    this.heap = new Int32Array(capacity);
    this.freeSlots = new Int32Array(capacity);
  }

  public get size(): number {
    let count = 0;
    for (let i = 0; i < this.heapSize; i += 1) {
      const slot = this.heap[i] ?? 0;
      if (this.active[slot] === 1) count += 1;
    }
    return count;
  }

  public get capacity(): number {
    return this.ticks.length;
  }

  public schedule(tick: number, kind: EventKind, payloadIndex: number): EventHandle {
    if (!Number.isSafeInteger(tick) || tick < 0)
      throw new RangeError("event tick must be a safe non-negative integer.");
    const slot = this.allocSlot();
    this.ticks[slot] = tick;
    this.sequenceIds[slot] = this.nextSequence;
    this.nextSequence += 1;
    this.kinds[slot] = kind;
    this.payloadIndices[slot] = payloadIndex;
    this.active[slot] = 1;
    this.heapPush(slot);
    return { slot, generation: this.generations[slot] ?? 0 };
  }

  public cancel(handle: EventHandle): boolean {
    if (!this.isLiveHandle(handle)) return false;
    this.active[handle.slot] = 0;
    return true;
  }

  public drainUntil(tick: number, out: EventBatch): number {
    out.clear();
    while (this.heapSize > 0) {
      const slot = this.heap[0] ?? 0;
      if (this.active[slot] !== 1) {
        this.heapPop();
        this.releaseSlot(slot);
        continue;
      }
      if ((this.ticks[slot] ?? 0) > tick) break;
      this.heapPop();
      out.push(
        this.ticks[slot] ?? 0,
        this.sequenceIds[slot] ?? 0,
        this.kinds[slot] as EventKind,
        this.payloadIndices[slot] ?? 0
      );
      this.active[slot] = 0;
      this.releaseSlot(slot);
    }
    return out.count;
  }

  public peekTick(): number | undefined {
    while (this.heapSize > 0) {
      const slot = this.heap[0] ?? 0;
      if (this.active[slot] === 1) return this.ticks[slot] ?? 0;
      this.heapPop();
      this.releaseSlot(slot);
    }
    return undefined;
  }

  public serialize(): ArrayBuffer {
    const count = this.size;
    const bytes = 4 + 4 + 8 + 4 + count * 24;
    const buffer = new ArrayBuffer(bytes);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint32(offset, 0x47534551, true);
    offset += 4;
    view.setUint32(offset, 1, true);
    offset += 4;
    view.setFloat64(offset, this.nextSequence, true);
    offset += 8;
    view.setUint32(offset, count, true);
    offset += 4;
    for (let i = 0; i < this.heapSize; i += 1) {
      const slot = this.heap[i] ?? 0;
      if (this.active[slot] !== 1) continue;
      view.setFloat64(offset, this.ticks[slot] ?? 0, true);
      offset += 8;
      view.setFloat64(offset, this.sequenceIds[slot] ?? 0, true);
      offset += 8;
      view.setInt32(offset, this.kinds[slot] ?? 0, true);
      offset += 4;
      view.setInt32(offset, this.payloadIndices[slot] ?? 0, true);
      offset += 4;
    }
    return buffer;
  }

  public static deserialize(buffer: ArrayBuffer): EventQueue {
    const view = new DataView(buffer);
    let offset = 0;
    if (view.getUint32(offset, true) !== 0x47534551)
      throw new Error("Invalid event queue snapshot magic.");
    offset += 4;
    const version = view.getUint32(offset, true);
    offset += 4;
    if (version !== 1) throw new Error(`Unsupported event queue snapshot version ${version}.`);
    const nextSequence = view.getFloat64(offset, true);
    offset += 8;
    const count = view.getUint32(offset, true);
    offset += 4;
    const queue = new EventQueue(Math.max(1, count));
    queue.nextSequence = nextSequence;
    for (let i = 0; i < count; i += 1) {
      const tick = view.getFloat64(offset, true);
      offset += 8;
      const sequenceId = view.getFloat64(offset, true);
      offset += 8;
      const kind = view.getInt32(offset, true);
      offset += 4;
      const payloadIndex = view.getInt32(offset, true);
      offset += 4;
      const slot = queue.allocSlot();
      queue.ticks[slot] = tick;
      queue.sequenceIds[slot] = sequenceId;
      queue.kinds[slot] = kind;
      queue.payloadIndices[slot] = payloadIndex;
      queue.active[slot] = 1;
      queue.heapPush(slot);
    }
    return queue;
  }

  private isLiveHandle(handle: EventHandle): boolean {
    if (handle.slot < 0 || handle.slot >= this.nextSlot) return false;
    return (
      this.active[handle.slot] === 1 && (this.generations[handle.slot] ?? 0) === handle.generation
    );
  }

  private allocSlot(): number {
    let slot: number;
    if (this.freeCount > 0) {
      this.freeCount -= 1;
      slot = this.freeSlots[this.freeCount] ?? 0;
    } else {
      slot = this.nextSlot;
      this.nextSlot += 1;
      this.ensureCapacity(this.nextSlot);
    }
    return slot;
  }

  private releaseSlot(slot: number): void {
    this.generations[slot] = ((this.generations[slot] ?? 0) + 1) >>> 0;
    this.ensureFreeCapacity(this.freeCount + 1);
    this.freeSlots[this.freeCount] = slot;
    this.freeCount += 1;
  }

  private heapPush(slot: number): void {
    this.ensureHeapCapacity(this.heapSize + 1);
    let child = this.heapSize;
    this.heapSize += 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const parentSlot = this.heap[parent] ?? 0;
      if (this.compareSlots(parentSlot, slot) <= 0) break;
      this.heap[child] = parentSlot;
      child = parent;
    }
    this.heap[child] = slot;
  }

  private heapPop(): number {
    const root = this.heap[0] ?? 0;
    this.heapSize -= 1;
    if (this.heapSize > 0) {
      const moved = this.heap[this.heapSize] ?? 0;
      this.heap[0] = moved;
      this.heapSink(0);
    }
    return root;
  }

  private heapSink(index: number): void {
    let parent = index;
    const slot = this.heap[parent] ?? 0;
    while (true) {
      const left = parent * 2 + 1;
      if (left >= this.heapSize) break;
      const right = left + 1;
      let best = left;
      if (
        right < this.heapSize &&
        this.compareSlots(this.heap[right] ?? 0, this.heap[left] ?? 0) < 0
      ) {
        best = right;
      }
      const bestSlot = this.heap[best] ?? 0;
      if (this.compareSlots(slot, bestSlot) <= 0) break;
      this.heap[parent] = bestSlot;
      parent = best;
    }
    this.heap[parent] = slot;
  }

  private compareSlots(a: number, b: number): number {
    const tickA = this.ticks[a] ?? 0;
    const tickB = this.ticks[b] ?? 0;
    if (tickA !== tickB) return tickA < tickB ? -1 : 1;
    const seqA = this.sequenceIds[a] ?? 0;
    const seqB = this.sequenceIds[b] ?? 0;
    if (seqA === seqB) return 0;
    return seqA < seqB ? -1 : 1;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.capacity) return;
    let next = this.capacity;
    while (next < required) next *= 2;

    const ticks = new Float64Array(next);
    ticks.set(this.ticks);
    this.ticks = ticks;

    const sequenceIds = new Float64Array(next);
    sequenceIds.set(this.sequenceIds);
    this.sequenceIds = sequenceIds;

    const kinds = new Int32Array(next);
    kinds.set(this.kinds);
    this.kinds = kinds;

    const payloadIndices = new Int32Array(next);
    payloadIndices.set(this.payloadIndices);
    this.payloadIndices = payloadIndices;

    const generations = new Uint32Array(next);
    generations.set(this.generations);
    this.generations = generations;

    const active = new Uint8Array(next);
    active.set(this.active);
    this.active = active;

    this.ensureFreeCapacity(next);
    this.ensureHeapCapacity(next);
  }

  private ensureHeapCapacity(required: number): void {
    if (required <= this.heap.length) return;
    let next = this.heap.length;
    while (next < required) next *= 2;
    const heap = new Int32Array(next);
    heap.set(this.heap);
    this.heap = heap;
  }

  private ensureFreeCapacity(required: number): void {
    if (required <= this.freeSlots.length) return;
    let next = this.freeSlots.length;
    while (next < required) next *= 2;
    const freeSlots = new Int32Array(next);
    freeSlots.set(this.freeSlots);
    this.freeSlots = freeSlots;
  }
}
