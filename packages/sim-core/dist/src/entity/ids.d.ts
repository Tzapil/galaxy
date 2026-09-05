export interface EntityRef {
    readonly index: number;
    readonly generation: number;
}
export declare class EntityAllocator {
    private generations;
    private alive;
    private freeList;
    private freeCount;
    private nextIndex;
    constructor(initialCapacity?: number);
    get capacity(): number;
    get allocatedSlots(): number;
    alloc(): EntityRef;
    free(ref: EntityRef): boolean;
    isAlive(ref: EntityRef): boolean;
    private ensureCapacity;
    private ensureFreeCapacity;
}
//# sourceMappingURL=ids.d.ts.map