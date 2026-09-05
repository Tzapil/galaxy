import type { JournalEntry, PersistPort } from "@galaxy-sim/sim-core";
import { compactJournalEntries } from "@galaxy-sim/sim-core";

const DB_NAME = "galaxy-sim";
const DB_VERSION = 1;

export class IndexedDbPersistPort implements PersistPort {
  public async saveSnapshot(id: string, buffer: ArrayBuffer): Promise<void> {
    const db = await openDb();
    await put(db, "snapshots", id, buffer);
    db.close();
  }

  public async loadSnapshot(id: string): Promise<ArrayBuffer | undefined> {
    const db = await openDb();
    const value = await get<ArrayBuffer>(db, "snapshots", id);
    db.close();
    return value;
  }

  public async appendJournal(entries: readonly JournalEntry[]): Promise<void> {
    const existing = await this.readJournal(0);
    const db = await openDb();
    await put(db, "journal", "entries", [...existing, ...entries]);
    db.close();
  }

  public async readJournal(fromTick: number): Promise<readonly JournalEntry[]> {
    const db = await openDb();
    const entries = (await get<JournalEntry[]>(db, "journal", "entries")) ?? [];
    db.close();
    return entries.filter((entry) => entry.tick >= fromTick);
  }

  public async compactJournal(snapshotTick: number): Promise<void> {
    const entries = await this.readJournal(0);
    const db = await openDb();
    await put(db, "journal", "entries", compactJournalEntries(entries, snapshotTick));
    db.close();
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolveOpen, rejectOpen) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots");
      if (!db.objectStoreNames.contains("journal")) db.createObjectStore("journal");
    };
    request.onsuccess = () => resolveOpen(request.result);
    request.onerror = () => rejectOpen(request.error);
  });
}

function put(db: IDBDatabase, storeName: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolvePut, rejectPut) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolvePut();
    tx.onerror = () => rejectPut(tx.error);
  });
}

function get<T>(db: IDBDatabase, storeName: string, key: string): Promise<T | undefined> {
  return new Promise((resolveGet, rejectGet) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolveGet(request.result as T | undefined);
    request.onerror = () => rejectGet(request.error);
  });
}
