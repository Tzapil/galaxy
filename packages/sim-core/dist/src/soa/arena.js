export class SoAArena {
    name;
    specs;
    columns;
    rowCount = 0;
    constructor(name, specs, initialCapacity = 16) {
        this.name = name;
        if (specs.length === 0)
            throw new RangeError("SoA arena requires at least one column.");
        const capacity = Math.max(1, initialCapacity | 0);
        this.specs = specs.slice();
        this.columns = this.specs.map((spec) => createArray(spec.kind, capacity));
    }
    get length() {
        return this.rowCount;
    }
    get capacity() {
        return this.columns[0]?.length ?? 0;
    }
    addRow() {
        const index = this.rowCount;
        this.rowCount += 1;
        this.ensureCapacity(this.rowCount);
        return index;
    }
    ensureCapacity(required) {
        if (required <= this.capacity)
            return;
        let next = this.capacity;
        while (next < required)
            next *= 2;
        for (let i = 0; i < this.columns.length; i += 1) {
            const column = this.columns[i];
            const spec = this.specs[i];
            if (column === undefined || spec === undefined)
                throw new RangeError("Arena metadata is inconsistent.");
            const replacement = createArray(spec.kind, next);
            replacement.set(column);
            this.columns[i] = replacement;
        }
    }
    column(name) {
        for (let i = 0; i < this.specs.length; i += 1) {
            if (this.specs[i]?.name === name) {
                const column = this.columns[i];
                if (column === undefined)
                    throw new RangeError(`Arena column "${name}" is missing.`);
                return column;
            }
        }
        throw new RangeError(`Arena column "${name}" is missing.`);
    }
    snapshot() {
        const columns = [];
        for (let i = 0; i < this.specs.length; i += 1) {
            const spec = this.specs[i];
            const column = this.columns[i];
            if (spec === undefined || column === undefined)
                throw new RangeError("Arena metadata is inconsistent.");
            columns.push({
                name: spec.name,
                kind: spec.kind,
                data: sliceColumn(column, this.rowCount)
            });
        }
        return { name: this.name, rowCount: this.rowCount, columns };
    }
    static fromSnapshot(snapshot) {
        const arena = new SoAArena(snapshot.name, snapshot.columns.map((column) => ({ name: column.name, kind: column.kind })), Math.max(1, snapshot.rowCount));
        arena.rowCount = snapshot.rowCount;
        for (let i = 0; i < snapshot.columns.length; i += 1) {
            const source = snapshot.columns[i]?.data;
            const target = arena.columns[i];
            if (source === undefined || target === undefined)
                throw new RangeError("Arena snapshot is inconsistent.");
            target.set(source);
        }
        return arena;
    }
}
export function columnKindToCode(kind) {
    switch (kind) {
        case "f64":
            return 1;
        case "f32":
            return 2;
        case "i32":
            return 3;
        case "u32":
            return 4;
        case "i16":
            return 5;
        case "u16":
            return 6;
        case "i8":
            return 7;
        case "u8":
            return 8;
    }
}
export function columnKindFromCode(code) {
    switch (code) {
        case 1:
            return "f64";
        case 2:
            return "f32";
        case 3:
            return "i32";
        case 4:
            return "u32";
        case 5:
            return "i16";
        case 6:
            return "u16";
        case 7:
            return "i8";
        case 8:
            return "u8";
        default:
            throw new RangeError(`Unknown column kind code ${code}.`);
    }
}
export function bytesPerElement(kind) {
    switch (kind) {
        case "f64":
            return Float64Array.BYTES_PER_ELEMENT;
        case "f32":
            return Float32Array.BYTES_PER_ELEMENT;
        case "i32":
            return Int32Array.BYTES_PER_ELEMENT;
        case "u32":
            return Uint32Array.BYTES_PER_ELEMENT;
        case "i16":
            return Int16Array.BYTES_PER_ELEMENT;
        case "u16":
            return Uint16Array.BYTES_PER_ELEMENT;
        case "i8":
            return Int8Array.BYTES_PER_ELEMENT;
        case "u8":
            return Uint8Array.BYTES_PER_ELEMENT;
    }
}
export function createArray(kind, capacity) {
    switch (kind) {
        case "f64":
            return new Float64Array(capacity);
        case "f32":
            return new Float32Array(capacity);
        case "i32":
            return new Int32Array(capacity);
        case "u32":
            return new Uint32Array(capacity);
        case "i16":
            return new Int16Array(capacity);
        case "u16":
            return new Uint16Array(capacity);
        case "i8":
            return new Int8Array(capacity);
        case "u8":
            return new Uint8Array(capacity);
    }
}
function sliceColumn(column, rowCount) {
    return column.slice(0, rowCount);
}
//# sourceMappingURL=arena.js.map