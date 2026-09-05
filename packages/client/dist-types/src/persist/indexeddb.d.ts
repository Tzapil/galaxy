import type { JournalEntry, PersistPort } from "@galaxy-sim/sim-core";
export declare class IndexedDbPersistPort implements PersistPort {
  saveSnapshot(id: string, buffer: ArrayBuffer): Promise<void>;
  loadSnapshot(id: string): Promise<ArrayBuffer | undefined>;
  appendJournal(entries: readonly JournalEntry[]): Promise<void>;
  readJournal(fromTick: number): Promise<readonly JournalEntry[]>;
  compactJournal(snapshotTick: number): Promise<void>;
}
//# sourceMappingURL=indexeddb.d.ts.map
