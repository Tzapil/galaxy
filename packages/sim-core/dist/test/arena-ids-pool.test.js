import { describe, expect, it } from "vitest";
import { EntityAllocator } from "../src/entity/ids.js";
import { SoAArena } from "../src/soa/arena.js";
import { BufferPool } from "../src/soa/pool.js";
describe("SoA arena and ID allocator", () => {
    it("grows from 16 to 100000 rows without losing values", () => {
        const arena = new SoAArena("numbers", [{ name: "value", kind: "u32" }], 16);
        const value = arena.column("value");
        for (let i = 0; i < 100_000; i += 1) {
            const row = arena.addRow();
            arena.column("value")[row] = i * 3;
        }
        expect(arena.capacity).toBeGreaterThanOrEqual(100_000);
        expect(arena.length).toBe(100_000);
        expect(value[0]).toBe(0);
        expect(arena.column("value")[99_999]).toBe(299_997);
    });
    it("does not let a stale EntityRef point at a reused slot", () => {
        const allocator = new EntityAllocator(1);
        const first = allocator.alloc();
        expect(allocator.free(first)).toBe(true);
        const second = allocator.alloc();
        expect(second.index).toBe(first.index);
        expect(second.generation).not.toBe(first.generation);
        expect(allocator.isAlive(first)).toBe(false);
        expect(allocator.isAlive(second)).toBe(true);
    });
    it("reuses pooled buffers without allocating after warmup", () => {
        const pool = new BufferPool(() => new Float64Array(128));
        const warm = pool.borrow();
        pool.release(warm);
        const allocationsAfterWarmup = pool.allocationCount;
        for (let i = 0; i < 10_000; i += 1) {
            const item = pool.borrow();
            pool.release(item);
        }
        expect(pool.allocationCount).toBe(allocationsAfterWarmup);
    });
});
//# sourceMappingURL=arena-ids-pool.test.js.map