import {
  compactJournalEntries,
  type JournalEntry,
  type TechnicalEntityLimits
} from "@galaxy-sim/sim-core";

import {
  SAVE_FORMAT_VERSION,
  assertSupportedSave,
  decodeSaveFile,
  encodeSaveFile,
  type GameSave,
  type SaveMetadata
} from "./save-format.js";

export interface SaveStorage {
  put(store: "snapshots" | "journal" | "metadata", key: string, value: unknown): Promise<void>;
  get<T>(store: "snapshots" | "journal" | "metadata", key: string): Promise<T | undefined>;
  delete(store: "snapshots" | "journal" | "metadata", key: string): Promise<void>;
  keys(store: "metadata"): Promise<readonly string[]>;
}

export class SaveQuotaError extends Error {
  public constructor() {
    super("Storage quota is exhausted. Delete old saves or export them before trying again.");
    this.name = "SaveQuotaError";
  }
}

export class GameSaveRepository {
  public constructor(private readonly storage: SaveStorage) {}

  public async save(input: {
    readonly id: string;
    readonly name: string;
    readonly tick: number;
    readonly hash: string;
    readonly snapshot: ArrayBuffer;
    readonly journal: readonly JournalEntry[];
    readonly automatic?: boolean;
    readonly updatedAt?: number;
    readonly technicalLimits?: TechnicalEntityLimits;
  }): Promise<SaveMetadata> {
    const journal = compactJournalEntries(input.journal, input.tick);
    const metadata: SaveMetadata = {
      id: input.id,
      name: input.name.trim() || "Unnamed save",
      formatVersion: SAVE_FORMAT_VERSION,
      updatedAt: input.updatedAt ?? Date.now(),
      tick: input.tick,
      gameYear: Math.floor(input.tick / 365),
      byteLength: input.snapshot.byteLength + JSON.stringify(journal).length * 2,
      hash: input.hash,
      automatic: input.automatic === true,
      ...(input.technicalLimits === undefined ? {} : { technicalLimits: input.technicalLimits })
    };
    try {
      await this.storage.put("snapshots", input.id, input.snapshot.slice(0));
      await this.storage.put("journal", input.id, journal);
      await this.storage.put("metadata", input.id, metadata);
    } catch (error) {
      if (isQuotaError(error)) throw new SaveQuotaError();
      throw error;
    }
    return metadata;
  }

  public async list(): Promise<SaveMetadata[]> {
    const keys = await this.storage.keys("metadata");
    const result: SaveMetadata[] = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const metadata = await this.storage.get<SaveMetadata>("metadata", key);
      if (metadata !== undefined) result.push(metadata);
    }
    return result.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  public async load(id: string): Promise<GameSave | undefined> {
    const metadata = await this.storage.get<SaveMetadata>("metadata", id);
    if (metadata === undefined) return undefined;
    assertSupportedSave(metadata);
    const snapshot = await this.storage.get<ArrayBuffer>("snapshots", id);
    if (snapshot === undefined) throw new Error(`Save "${metadata.name}" has no full snapshot.`);
    const journal = (await this.storage.get<readonly JournalEntry[]>("journal", id)) ?? [];
    return { metadata, snapshot: snapshot.slice(0), journal };
  }

  public async rename(id: string, name: string): Promise<void> {
    const save = await this.load(id);
    if (save === undefined) throw new Error(`Save slot ${id} does not exist.`);
    await this.storage.put("metadata", id, {
      ...save.metadata,
      name: name.trim() || save.metadata.name
    });
  }

  public async delete(id: string): Promise<void> {
    await this.storage.delete("snapshots", id);
    await this.storage.delete("journal", id);
    await this.storage.delete("metadata", id);
  }

  public async export(id: string): Promise<ArrayBuffer> {
    const save = await this.load(id);
    if (save === undefined) throw new Error(`Save slot ${id} does not exist.`);
    return encodeSaveFile(save);
  }

  public async import(buffer: ArrayBuffer, replacementId?: string): Promise<SaveMetadata> {
    const save = decodeSaveFile(buffer);
    return this.save({
      id: replacementId ?? save.metadata.id,
      name: save.metadata.name,
      tick: save.metadata.tick,
      hash: save.metadata.hash,
      snapshot: save.snapshot,
      journal: save.journal,
      automatic: save.metadata.automatic,
      updatedAt: save.metadata.updatedAt,
      ...(save.metadata.technicalLimits === undefined
        ? {}
        : { technicalLimits: save.metadata.technicalLimits })
    });
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}
