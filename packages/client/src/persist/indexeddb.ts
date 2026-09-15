import type { JournalEntry, PersistPort } from "@galaxy-sim/sim-core";
import { compactJournalEntries } from "@galaxy-sim/sim-core";

import { GameSaveRepository, type SaveStorage } from "./repository.js";

const DB_NAME = "galaxy-sim";
const DB_VERSION = 2;
type StoreName = "snapshots" | "journal" | "metadata";

export class IndexedDbSaveStorage implements SaveStorage {
  public async put(store: StoreName, key: string, value: unknown): Promise<void> {
    const db = await openDb();
    try {
      await put(db, store, key, value);
    } finally {
      db.close();
    }
  }

  public async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    const db = await openDb();
    try {
      return await get<T>(db, store, key);
    } finally {
      db.close();
    }
  }

  public async delete(store: StoreName, key: string): Promise<void> {
    const db = await openDb();
    try {
      await remove(db, store, key);
    } finally {
      db.close();
    }
  }

  public async keys(_store: "metadata"): Promise<readonly string[]> {
    const db = await openDb();
    try {
      return await keys(db, "metadata");
    } finally {
      db.close();
    }
  }
}

export class IndexedDbPersistPort implements PersistPort {
  private readonly storage = new IndexedDbSaveStorage();

  public async saveSnapshot(id: string, buffer: ArrayBuffer): Promise<void> {
    await this.storage.put("snapshots", id, buffer);
  }

  public loadSnapshot(id: string): Promise<ArrayBuffer | undefined> {
    return this.storage.get<ArrayBuffer>("snapshots", id);
  }

  public async appendJournal(entries: readonly JournalEntry[]): Promise<void> {
    const existing = await this.readJournal(0);
    await this.storage.put("journal", "legacy", [...existing, ...entries]);
  }

  public async readJournal(fromTick: number): Promise<readonly JournalEntry[]> {
    const entries = (await this.storage.get<JournalEntry[]>("journal", "legacy")) ?? [];
    return entries.filter((entry) => entry.tick >= fromTick);
  }

  public async compactJournal(snapshotTick: number): Promise<void> {
    const entries = await this.readJournal(0);
    await this.storage.put("journal", "legacy", compactJournalEntries(entries, snapshotTick));
  }
}

export function createIndexedDbSaveRepository(): GameSaveRepository {
  return new GameSaveRepository(new IndexedDbSaveStorage());
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolveOpen, rejectOpen) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["snapshots", "journal", "metadata"] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolveOpen(request.result);
    request.onerror = () => rejectOpen(request.error);
  });
}

function put(db: IDBDatabase, store: StoreName, key: string, value: unknown): Promise<void> {
  return new Promise((resolvePut, rejectPut) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolvePut();
    tx.onabort = () => rejectPut(tx.error ?? new Error("IndexedDB write was aborted."));
    tx.onerror = () => rejectPut(tx.error ?? new Error("IndexedDB write failed."));
  });
}

function get<T>(db: IDBDatabase, store: StoreName, key: string): Promise<T | undefined> {
  return new Promise((resolveGet, rejectGet) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolveGet(request.result as T | undefined);
    request.onerror = () => rejectGet(request.error);
  });
}

function remove(db: IDBDatabase, store: StoreName, key: string): Promise<void> {
  return new Promise((resolveDelete, rejectDelete) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolveDelete();
    tx.onerror = () => rejectDelete(tx.error);
  });
}

function keys(db: IDBDatabase, store: StoreName): Promise<string[]> {
  return new Promise((resolveKeys, rejectKeys) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAllKeys();
    request.onsuccess = () => resolveKeys(request.result.map(String));
    request.onerror = () => rejectKeys(request.error);
  });
}
