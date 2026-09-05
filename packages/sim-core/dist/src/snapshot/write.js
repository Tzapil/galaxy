import { columnKindToCode } from "../soa/arena.js";
export const SNAPSHOT_MAGIC = 0x47534d30;
export const SNAPSHOT_VERSION = 1;
export function writeStateSnapshot(state) {
    const eventQueueBuffer = state.eventQueue.serialize();
    const byteLength = 28 + rngStreamsByteLength(state) + 4 + eventQueueBuffer.byteLength + arenasByteLength(state);
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    view.setUint32(offset, SNAPSHOT_MAGIC, true);
    offset += 4;
    view.setUint32(offset, SNAPSHOT_VERSION, true);
    offset += 4;
    view.setFloat64(offset, state.tick, true);
    offset += 8;
    view.setUint32(offset, state.rngStreams.length, true);
    offset += 4;
    view.setUint32(offset, eventQueueBuffer.byteLength, true);
    offset += 4;
    view.setUint32(offset, state.arenas.length, true);
    offset += 4;
    for (const stream of state.rngStreams) {
        offset = writeString(view, bytes, offset, stream.name);
        view.setUint32(offset, stream.state.rootSeed, true);
        offset += 4;
        view.setUint32(offset, stream.state.stream, true);
        offset += 4;
        view.setUint32(offset, stream.state.s0, true);
        offset += 4;
        view.setUint32(offset, stream.state.s1, true);
        offset += 4;
        view.setUint32(offset, stream.state.s2, true);
        offset += 4;
        view.setUint32(offset, stream.state.s3, true);
        offset += 4;
    }
    bytes.set(new Uint8Array(eventQueueBuffer), offset);
    offset += eventQueueBuffer.byteLength;
    for (const arena of state.arenas) {
        offset = writeString(view, bytes, offset, arena.name);
        view.setUint32(offset, arena.rowCount, true);
        offset += 4;
        view.setUint32(offset, arena.columns.length, true);
        offset += 4;
        for (const column of arena.columns) {
            offset = writeColumn(view, bytes, offset, column);
        }
    }
    return buffer;
}
function rngStreamsByteLength(state) {
    let bytes = 0;
    for (const stream of state.rngStreams)
        bytes += 2 + stream.name.length + 24;
    return bytes;
}
function arenasByteLength(state) {
    let bytes = 0;
    for (const arena of state.arenas) {
        bytes += 2 + arena.name.length + 8;
        for (const column of arena.columns) {
            bytes += 2 + column.name.length + 1 + 4 + column.data.byteLength;
        }
    }
    return bytes;
}
function writeColumn(view, target, offset, column) {
    let nextOffset = writeString(view, target, offset, column.name);
    view.setUint8(nextOffset, columnKindToCode(column.kind));
    nextOffset += 1;
    view.setUint32(nextOffset, column.data.byteLength, true);
    nextOffset += 4;
    target.set(new Uint8Array(column.data.buffer, column.data.byteOffset, column.data.byteLength), nextOffset);
    return nextOffset + column.data.byteLength;
}
function writeString(view, target, offset, value) {
    if (value.length > 0xffff)
        throw new RangeError("Snapshot string is too long.");
    view.setUint16(offset, value.length, true);
    let nextOffset = offset + 2;
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code > 0x7f)
            throw new RangeError("Snapshot metadata must be ASCII.");
        target[nextOffset] = code;
        nextOffset += 1;
    }
    return nextOffset;
}
//# sourceMappingURL=write.js.map