import { StageOneWorkerRuntime } from "./runtime.js";
const runtime = new StageOneWorkerRuntime({
    nowMs: () => performance.now()
});
let lastPump = performance.now();
function post(message) {
    if (message.type === "snapshot" || message.type === "saved") {
        globalThis.postMessage(message, { transfer: [message.buffer] });
        return;
    }
    globalThis.postMessage(message);
}
function postAll(messages) {
    for (let i = 0; i < messages.length; i += 1) {
        const message = messages[i];
        if (message !== undefined)
            post(message);
    }
}
globalThis.onmessage = (event) => {
    postAll(runtime.handle(event.data));
};
function pump() {
    const now = performance.now();
    const elapsedMs = now - lastPump;
    lastPump = now;
    postAll(runtime.advanceElapsed(elapsedMs));
    setTimeout(pump, 16);
}
pump();
//# sourceMappingURL=worker.js.map