import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compactJournalEntries } from "@galaxy-sim/sim-core";
export class FilePersistPort {
    rootDir;
    journalPath;
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.journalPath = resolve(rootDir, "journal.jsonl");
    }
    async saveSnapshot(id, buffer) {
        await mkdir(this.rootDir, { recursive: true });
        await writeFile(resolve(this.rootDir, `${id}.bin`), Buffer.from(buffer));
    }
    async loadSnapshot(id) {
        try {
            const data = await readFile(resolve(this.rootDir, `${id}.bin`));
            return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
        catch (error) {
            if (isNotFound(error))
                return undefined;
            throw error;
        }
    }
    async appendJournal(entries) {
        await mkdir(this.rootDir, { recursive: true });
        const payload = entries.map((entry) => JSON.stringify(entry)).join("\n");
        await writeFile(this.journalPath, payload.length > 0 ? `${payload}\n` : "", { flag: "a" });
    }
    async readJournal(fromTick) {
        let text;
        try {
            text = await readFile(this.journalPath, "utf8");
        }
        catch (error) {
            if (isNotFound(error))
                return [];
            throw error;
        }
        const entries = [];
        for (const line of text.split("\n")) {
            if (line.trim().length === 0)
                continue;
            const entry = JSON.parse(line);
            if (entry.tick >= fromTick)
                entries.push(entry);
        }
        return entries;
    }
    async compactJournal(snapshotTick) {
        const entries = await this.readJournal(0);
        const compacted = compactJournalEntries(entries, snapshotTick);
        const text = compacted.map((entry) => JSON.stringify(entry)).join("\n");
        await mkdir(this.rootDir, { recursive: true });
        await writeFile(this.journalPath, text.length > 0 ? `${text}\n` : "");
    }
}
function isNotFound(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
//# sourceMappingURL=node-persist.js.map