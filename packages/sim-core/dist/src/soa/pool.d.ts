import type { NumericArray } from "./arena.js";
export declare class BufferPool<T extends NumericArray> {
    private readonly create;
    private readonly free;
    private allocations;
    constructor(create: () => T);
    get allocationCount(): number;
    borrow(): T;
    release(item: T): void;
}
//# sourceMappingURL=pool.d.ts.map