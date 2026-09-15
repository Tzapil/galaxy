const WORKER_SAVE_MAGIC = 0x57535638;
const WORKER_SAVE_VERSION = 1;
const WORKER_SAVE_HEADER_BYTES = 16;

export interface WorkerSavePayload {
  readonly simulation: ArrayBuffer;
  readonly history?: ArrayBuffer;
}

export function encodeWorkerSave(simulation: ArrayBuffer, history: ArrayBuffer): ArrayBuffer {
  const output = new ArrayBuffer(
    WORKER_SAVE_HEADER_BYTES + simulation.byteLength + history.byteLength
  );
  const view = new DataView(output);
  view.setUint32(0, WORKER_SAVE_MAGIC, true);
  view.setUint32(4, WORKER_SAVE_VERSION, true);
  view.setUint32(8, simulation.byteLength, true);
  view.setUint32(12, history.byteLength, true);
  new Uint8Array(output, WORKER_SAVE_HEADER_BYTES, simulation.byteLength).set(
    new Uint8Array(simulation)
  );
  new Uint8Array(output, WORKER_SAVE_HEADER_BYTES + simulation.byteLength, history.byteLength).set(
    new Uint8Array(history)
  );
  return output;
}

export function decodeWorkerSave(buffer: ArrayBuffer): WorkerSavePayload {
  if (buffer.byteLength < WORKER_SAVE_HEADER_BYTES) return { simulation: buffer.slice(0) };
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== WORKER_SAVE_MAGIC) return { simulation: buffer.slice(0) };
  const version = view.getUint32(4, true);
  if (version !== WORKER_SAVE_VERSION) {
    throw new Error(`Unsupported worker save version ${version}.`);
  }
  const simulationBytes = view.getUint32(8, true);
  const historyBytes = view.getUint32(12, true);
  if (WORKER_SAVE_HEADER_BYTES + simulationBytes + historyBytes !== buffer.byteLength) {
    throw new Error("Worker save is truncated or contains trailing data.");
  }
  return {
    simulation: buffer.slice(WORKER_SAVE_HEADER_BYTES, WORKER_SAVE_HEADER_BYTES + simulationBytes),
    history: buffer.slice(WORKER_SAVE_HEADER_BYTES + simulationBytes)
  };
}
