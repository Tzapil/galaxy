import { compactJournalEntries } from "@galaxy-sim/sim-core";
const DB_NAME = "galaxy-sim";
const DB_VERSION = 1;
export class IndexedDbPersistPort {
  async saveSnapshot(id, buffer) {
    const db = await openDb();
    await put(db, "snapshots", id, buffer);
    db.close();
  }
  async loadSnapshot(id) {
    const db = await openDb();
    const value = await get(db, "snapshots", id);
    db.close();
    return value;
  }
  async appendJournal(entries) {
    const existing = await this.readJournal(0);
    const db = await openDb();
    await put(db, "journal", "entries", [...existing, ...entries]);
    db.close();
  }
  async readJournal(fromTick) {
    const db = await openDb();
    const entries = (await get(db, "journal", "entries")) ?? [];
    db.close();
    return entries.filter((entry) => entry.tick >= fromTick);
  }
  async compactJournal(snapshotTick) {
    const entries = await this.readJournal(0);
    const db = await openDb();
    await put(db, "journal", "entries", compactJournalEntries(entries, snapshotTick));
    db.close();
  }
}
function openDb() {
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
function put(db, storeName, key, value) {
  return new Promise((resolvePut, rejectPut) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolvePut();
    tx.onerror = () => rejectPut(tx.error);
  });
}
function get(db, storeName, key) {
  return new Promise((resolveGet, rejectGet) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolveGet(request.result);
    request.onerror = () => rejectGet(request.error);
  });
}
//# sourceMappingURL=indexeddb.js.map
