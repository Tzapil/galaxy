export class BufferPool {
    create;
    free = [];
    allocations = 0;
    constructor(create) {
        this.create = create;
    }
    get allocationCount() {
        return this.allocations;
    }
    borrow() {
        const item = this.free.pop();
        if (item !== undefined)
            return item;
        this.allocations += 1;
        return this.create();
    }
    release(item) {
        this.free.push(item);
    }
}
//# sourceMappingURL=pool.js.map