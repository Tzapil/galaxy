import type { JournalEntry, TechnicalEntityLimits } from "@galaxy-sim/sim-core";

export const SAVE_FORMAT_VERSION = 1;
const SAVE_MAGIC = 0x47535638;
const HEADER_BYTES = 16;

export interface SaveMetadata {
  readonly id: string;
  readonly name: string;
  readonly formatVersion: number;
  readonly updatedAt: number;
  readonly tick: number;
  readonly gameYear: number;
  readonly byteLength: number;
  readonly hash: string;
  readonly automatic: boolean;
  readonly technicalLimits?: TechnicalEntityLimits;
}

export interface GameSave {
  readonly metadata: SaveMetadata;
  readonly snapshot: ArrayBuffer;
  readonly journal: readonly JournalEntry[];
}

export class IncompatibleSaveError extends Error {
  public constructor(version: number) {
    super(`Save format ${version} is incompatible with supported format ${SAVE_FORMAT_VERSION}.`);
    this.name = "IncompatibleSaveError";
  }
}

export function encodeSaveFile(save: GameSave): ArrayBuffer {
  assertSupportedSave(save.metadata);
  const metadata = new TextEncoder().encode(
    JSON.stringify({ metadata: save.metadata, journal: save.journal })
  );
  const output = new ArrayBuffer(HEADER_BYTES + metadata.byteLength + save.snapshot.byteLength);
  const view = new DataView(output);
  view.setUint32(0, SAVE_MAGIC, true);
  view.setUint32(4, SAVE_FORMAT_VERSION, true);
  view.setUint32(8, metadata.byteLength, true);
  view.setUint32(12, save.snapshot.byteLength, true);
  new Uint8Array(output, HEADER_BYTES, metadata.byteLength).set(metadata);
  new Uint8Array(output, HEADER_BYTES + metadata.byteLength).set(new Uint8Array(save.snapshot));
  return output;
}

export function decodeSaveFile(buffer: ArrayBuffer): GameSave {
  if (buffer.byteLength < HEADER_BYTES)
    throw new Error("The selected file is not a Galaxy Sim save.");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== SAVE_MAGIC) throw new Error("Invalid Galaxy Sim save signature.");
  const version = view.getUint32(4, true);
  if (version !== SAVE_FORMAT_VERSION) throw new IncompatibleSaveError(version);
  const metadataLength = view.getUint32(8, true);
  const snapshotLength = view.getUint32(12, true);
  if (HEADER_BYTES + metadataLength + snapshotLength !== buffer.byteLength) {
    throw new Error("Save file is truncated or contains trailing data.");
  }
  const json = new TextDecoder().decode(new Uint8Array(buffer, HEADER_BYTES, metadataLength));
  const parsed = JSON.parse(json) as {
    readonly metadata?: SaveMetadata;
    readonly journal?: readonly JournalEntry[];
  };
  if (parsed.metadata === undefined || !Array.isArray(parsed.journal)) {
    throw new Error("Save metadata is missing.");
  }
  assertSupportedSave(parsed.metadata);
  const snapshot = buffer.slice(HEADER_BYTES + metadataLength);
  return { metadata: parsed.metadata, snapshot, journal: parsed.journal };
}

export function assertSupportedSave(metadata: SaveMetadata): void {
  if (metadata.formatVersion !== SAVE_FORMAT_VERSION) {
    throw new IncompatibleSaveError(metadata.formatVersion);
  }
}
