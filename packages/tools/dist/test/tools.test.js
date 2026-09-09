import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StageOneSimulation } from "@galaxy-sim/sim-core";
import { FilePersistPort } from "../src/node-persist.js";
import { detectPathologies } from "../src/pathology.js";
describe("tools package", () => {
    it("provides a Node PersistPort implementation", async () => {
        const dir = await mkdtemp(resolve(tmpdir(), "galaxy-sim-"));
        try {
            const port = new FilePersistPort(dir);
            const snapshot = StageOneSimulation.create(1).snapshot();
            await port.saveSnapshot("a", snapshot);
            expect(await port.loadSnapshot("a")).toBeInstanceOf(ArrayBuffer);
            await port.appendJournal([
                { tick: 1, kind: "routine", milestone: false, payload: "x" },
                { tick: 2, kind: "milestone", milestone: true, payload: "y" }
            ]);
            await port.compactJournal(2);
            expect((await port.readJournal(0)).map((entry) => entry.payload)).toEqual(["y"]);
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
    it("reports stage-gated pathology checks explicitly", () => {
        const findings = detectPathologies({ seed: 1, tick: 0, stage: 0 });
        expect(findings).toHaveLength(6);
        expect(findings.every((finding) => finding.status === "not_available")).toBe(true);
    });
    it("checks Stage 1 pathologies from run metrics", () => {
        const sim = StageOneSimulation.create(3);
        const report = sim.run(36_500, 0);
        const findings = detectPathologies({
            seed: 3,
            tick: 36_500,
            stage: 1,
            metrics: report.metrics
        });
        expect(findings.filter((finding) => finding.status === "failed")).toHaveLength(0);
        expect(findings.filter((finding) => finding.status === "ok")).toHaveLength(3);
    }, 20_000);
});
//# sourceMappingURL=tools.test.js.map