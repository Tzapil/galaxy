import type { NumericArray } from "./arena.js";

export class BufferPool<T extends NumericArray> {
  private readonly free: T[] = [];
  private allocations = 0;

  public constructor(private readonly create: () => T) {}

  public get allocationCount(): number {
    return this.allocations;
  }

  public borrow(): T {
    const item = this.free.pop();
    if (item !== undefined) return item;
    this.allocations += 1;
    return this.create();
  }

  public release(item: T): void {
    this.free.push(item);
  }
}
