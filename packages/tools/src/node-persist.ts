import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { JournalEntry, PersistPort } from "@galaxy-sim/sim-core";
import { compactJournalEntries } from "@galaxy-sim/sim-core";

export class FilePersistPort implements PersistPort {
  private readonly journalPath: string;

  public constructor(private readonly rootDir: string) {
    this.journalPath = resolve(rootDir, "journal.jsonl");
  }

  public async saveSnapshot(id: string, buffer: ArrayBuffer): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(resolve(this.rootDir, `${id}.bin`), Buffer.from(buffer));
  }

  public async loadSnapshot(id: string): Promise<ArrayBuffer | undefined> {
    try {
      const data = await readFile(resolve(this.rootDir, `${id}.bin`));
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  public async appendJournal(entries: readonly JournalEntry[]): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    const payload = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(this.journalPath, payload.length > 0 ? `${payload}\n` : "", { flag: "a" });
  }

  public async readJournal(fromTick: number): Promise<readonly JournalEntry[]> {
    let text: string;
    try {
      text = await readFile(this.journalPath, "utf8");
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const entries: JournalEntry[] = [];
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      const entry = JSON.parse(line) as JournalEntry;
      if (entry.tick >= fromTick) entries.push(entry);
    }
    return entries;
  }

  public async compactJournal(snapshotTick: number): Promise<void> {
    const entries = await this.readJournal(0);
    const compacted = compactJournalEntries(entries, snapshotTick);
    const text = compacted.map((entry) => JSON.stringify(entry)).join("\n");
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(this.journalPath, text.length > 0 ? `${text}\n` : "");
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
