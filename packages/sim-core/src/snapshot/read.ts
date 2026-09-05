import { EventQueue } from "../events/queue.js";
import { columnKindFromCode, createArray } from "../soa/arena.js";
import type { ArenaColumnSnapshot, ArenaSnapshot } from "../soa/arena.js";

import { SNAPSHOT_MAGIC, SNAPSHOT_VERSION } from "./write.js";
import type { RestoredRngStream, RestoredSnapshot } from "./types.js";

export function readStateSnapshot(buffer: ArrayBuffer): RestoredSnapshot {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const magic = view.getUint32(offset, true);
  offset += 4;
  if (magic !== SNAPSHOT_MAGIC) throw new Error("Invalid galaxy-sim snapshot magic.");

  const version = view.getUint32(offset, true);
  offset += 4;
  if (version !== SNAPSHOT_VERSION) {
    throw new Error(
      `Unsupported galaxy-sim snapshot version ${version}. Expected ${SNAPSHOT_VERSION}.`
    );
  }

  const tick = view.getFloat64(offset, true);
  offset += 8;
  const rngCount = view.getUint32(offset, true);
  offset += 4;
  const queueByteLength = view.getUint32(offset, true);
  offset += 4;
  const arenaCount = view.getUint32(offset, true);
  offset += 4;

  const rngStreams: RestoredRngStream[] = [];
  for (let i = 0; i < rngCount; i += 1) {
    const nameRead = readString(view, bytes, offset);
    offset = nameRead.offset;
    const rootSeed = view.getUint32(offset, true);
    offset += 4;
    const stream = view.getUint32(offset, true);
    offset += 4;
    const s0 = view.getUint32(offset, true);
    offset += 4;
    const s1 = view.getUint32(offset, true);
    offset += 4;
    const s2 = view.getUint32(offset, true);
    offset += 4;
    const s3 = view.getUint32(offset, true);
    offset += 4;
    rngStreams.push({ name: nameRead.value, state: { rootSeed, stream, s0, s1, s2, s3 } });
  }

  const eventQueueBuffer = buffer.slice(offset, offset + queueByteLength);
  EventQueue.deserialize(eventQueueBuffer);
  offset += queueByteLength;

  const arenas: ArenaSnapshot[] = [];
  for (let i = 0; i < arenaCount; i += 1) {
    const arenaName = readString(view, bytes, offset);
    offset = arenaName.offset;
    const rowCount = view.getUint32(offset, true);
    offset += 4;
    const columnCount = view.getUint32(offset, true);
    offset += 4;

    const columns: ArenaColumnSnapshot[] = [];
    for (let c = 0; c < columnCount; c += 1) {
      const read = readColumn(view, bytes, offset);
      offset = read.offset;
      columns.push(read.column);
    }

    arenas.push({ name: arenaName.value, rowCount, columns });
  }

  return { tick, rngStreams, eventQueueBuffer, arenas };
}

interface StringRead {
  readonly value: string;
  readonly offset: number;
}

interface ColumnRead {
  readonly column: ArenaColumnSnapshot;
  readonly offset: number;
}

function readString(view: DataView, bytes: Uint8Array, offset: number): StringRead {
  const length = view.getUint16(offset, true);
  let nextOffset = offset + 2;
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += String.fromCharCode(bytes[nextOffset] ?? 0);
    nextOffset += 1;
  }
  return { value, offset: nextOffset };
}

function readColumn(view: DataView, bytes: Uint8Array, offset: number): ColumnRead {
  const nameRead = readString(view, bytes, offset);
  let nextOffset = nameRead.offset;
  const kind = columnKindFromCode(view.getUint8(nextOffset));
  nextOffset += 1;
  const byteLength = view.getUint32(nextOffset, true);
  nextOffset += 4;
  const data = createArray(kind, byteLength / dataElementSize(kind));
  new Uint8Array(data.buffer).set(bytes.slice(nextOffset, nextOffset + byteLength));
  return { column: { name: nameRead.value, kind, data }, offset: nextOffset + byteLength };
}

function dataElementSize(kind: string): number {
  switch (kind) {
    case "f64":
      return Float64Array.BYTES_PER_ELEMENT;
    case "f32":
      return Float32Array.BYTES_PER_ELEMENT;
    case "i32":
    case "u32":
      return Int32Array.BYTES_PER_ELEMENT;
    case "i16":
    case "u16":
      return Int16Array.BYTES_PER_ELEMENT;
    case "i8":
    case "u8":
      return Int8Array.BYTES_PER_ELEMENT;
    default:
      throw new RangeError(`Unknown column kind ${kind}.`);
  }
}
