import { StageOneWorkerRuntime } from "./runtime.js";
import type { WorkerCommand, WorkerMessage } from "./protocol.js";

const runtime = new StageOneWorkerRuntime({
  nowMs: () => performance.now()
});

let lastPump = performance.now();

function post(message: WorkerMessage): void {
  if (message.type === "snapshot" || message.type === "saved") {
    globalThis.postMessage(message, { transfer: [message.buffer] });
    return;
  }
  globalThis.postMessage(message);
}

function postAll(messages: readonly WorkerMessage[]): void {
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message !== undefined) post(message);
  }
}

globalThis.onmessage = (event: MessageEvent<WorkerCommand>) => {
  postAll(runtime.handle(event.data));
};

function pump(): void {
  const now = performance.now();
  const elapsedMs = now - lastPump;
  lastPump = now;
  postAll(runtime.advanceElapsed(elapsedMs));
  setTimeout(pump, 16);
}

pump();
