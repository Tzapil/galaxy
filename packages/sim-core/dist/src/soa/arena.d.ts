export type ColumnKind = "f64" | "f32" | "i32" | "u32" | "i16" | "u16" | "i8" | "u8";
export type NumericArray = Float64Array | Float32Array | Int32Array | Uint32Array | Int16Array | Uint16Array | Int8Array | Uint8Array;
export interface ColumnSpec<Name extends string = string> {
    readonly name: Name;
    readonly kind: ColumnKind;
}
export interface ArenaColumnSnapshot {
    readonly name: string;
    readonly kind: ColumnKind;
    readonly data: NumericArray;
}
export interface ArenaSnapshot {
    readonly name: string;
    readonly rowCount: number;
    readonly columns: readonly ArenaColumnSnapshot[];
}
export declare class SoAArena<Name extends string = string> {
    readonly name: string;
    private readonly specs;
    private readonly columns;
    private rowCount;
    constructor(name: string, specs: readonly ColumnSpec<Name>[], initialCapacity?: number);
    get length(): number;
    get capacity(): number;
    addRow(): number;
    ensureCapacity(required: number): void;
    column(name: Name): NumericArray;
    snapshot(): ArenaSnapshot;
    static fromSnapshot(snapshot: ArenaSnapshot): SoAArena<string>;
}
export declare function columnKindToCode(kind: ColumnKind): number;
export declare function columnKindFromCode(code: number): ColumnKind;
export declare function bytesPerElement(kind: ColumnKind): number;
export declare function createArray(kind: ColumnKind, capacity: number): NumericArray;
//# sourceMappingURL=arena.d.ts.map