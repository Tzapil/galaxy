import type { JournalEntry, PersistPort } from "@galaxy-sim/sim-core";
export declare class FilePersistPort implements PersistPort {
    private readonly rootDir;
    private readonly journalPath;
    constructor(rootDir: string);
    saveSnapshot(id: string, buffer: ArrayBuffer): Promise<void>;
    loadSnapshot(id: string): Promise<ArrayBuffer | undefined>;
    appendJournal(entries: readonly JournalEntry[]): Promise<void>;
    readJournal(fromTick: number): Promise<readonly JournalEntry[]>;
    compactJournal(snapshotTick: number): Promise<void>;
}
//# sourceMappingURL=node-persist.d.ts.map