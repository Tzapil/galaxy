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

export function compactJournalEntries(
  entries: readonly JournalEntry[],
  snapshotTick: number
): JournalEntry[] {
  const compacted: JournalEntry[] = [];
  for (const entry of entries) {
    if (entry.tick >= snapshotTick || entry.milestone) compacted.push(entry);
  }
  return compacted;
}
