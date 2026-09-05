export interface EntityRef {
  readonly index: number;
  readonly generation: number;
}

export class EntityAllocator {
  private generations: Uint32Array;
  private alive: Uint8Array;
  private freeList: Int32Array;
  private freeCount = 0;
  private nextIndex = 0;

  public constructor(initialCapacity = 16) {
    const capacity = Math.max(1, initialCapacity | 0);
    this.generations = new Uint32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.freeList = new Int32Array(capacity);
  }

  public get capacity(): number {
    return this.generations.length;
  }

  public get allocatedSlots(): number {
    return this.nextIndex - this.freeCount;
  }

  public alloc(): EntityRef {
    let index: number;
    if (this.freeCount > 0) {
      this.freeCount -= 1;
      index = this.freeList[this.freeCount] ?? 0;
    } else {
      index = this.nextIndex;
      this.nextIndex += 1;
      this.ensureCapacity(this.nextIndex);
    }
    this.alive[index] = 1;
    return { index, generation: this.generations[index] ?? 0 };
  }

  public free(ref: EntityRef): boolean {
    if (!this.isAlive(ref)) return false;
    const index = ref.index;
    this.alive[index] = 0;
    this.generations[index] = ((this.generations[index] ?? 0) + 1) >>> 0;
    this.ensureFreeCapacity(this.freeCount + 1);
    this.freeList[this.freeCount] = index;
    this.freeCount += 1;
    return true;
  }

  public isAlive(ref: EntityRef): boolean {
    if (!Number.isInteger(ref.index) || ref.index < 0 || ref.index >= this.nextIndex) return false;
    return this.alive[ref.index] === 1 && (this.generations[ref.index] ?? 0) === ref.generation;
  }

  private ensureCapacity(required: number): void {
    if (required <= this.generations.length) return;
    let next = this.generations.length;
    while (next < required) next *= 2;

    const generations = new Uint32Array(next);
    generations.set(this.generations);
    this.generations = generations;

    const alive = new Uint8Array(next);
    alive.set(this.alive);
    this.alive = alive;

    this.ensureFreeCapacity(next);
  }

  private ensureFreeCapacity(required: number): void {
    if (required <= this.freeList.length) return;
    let next = this.freeList.length;
    while (next < required) next *= 2;
    const freeList = new Int32Array(next);
    freeList.set(this.freeList);
    this.freeList = freeList;
  }
}
