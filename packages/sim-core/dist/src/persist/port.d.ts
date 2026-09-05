export interface JournalEntry {
    readonly tick: number;
    readonly kind: string;
    readonly milestone: boolean;
    readonly payload: string;
}
export interface PersistPort {
    saveSnapshot(id: string, buffer: ArrayBuffer): Promise<void>;
    loadSnapshot(id: string): Promise<ArrayBuffer | undefined>;
    appendJournal(entries: readonly JournalEntry[]): Promise<void>;
    readJournal(fromTick: number): Promise<readonly JournalEntry[]>;
    compactJournal(snapshotTick: number): Promise<void>;
}
export declare function compactJournalEntries(entries: readonly JournalEntry[], snapshotTick: number): JournalEntry[];
//# sourceMappingURL=port.d.ts.map