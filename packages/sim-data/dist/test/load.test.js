import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadFromDirectory } from "../src/node-load.js";
const dataDir = resolve(import.meta.dirname, "../data");
const schemaDir = resolve(import.meta.dirname, "../schema");
describe("sim-data loader", () => {
    it("validates every JSON file against its schema", async () => {
        await expect(loadFromDirectory(dataDir, schemaDir)).resolves.toBeTruthy();
    });
    it("builds stable indexes over the transferred data", async () => {
        const loaded = await loadFromDirectory(dataDir, schemaDir);
        expect(loaded.RES.size).toBe(37);
        expect(loaded.BATCH).toHaveLength(36);
        expect(loaded.BUILDINGS).toHaveLength(49);
        expect(loaded.data.techs.techs).toHaveLength(94);
        expect(loaded.data.techs.branches).toHaveLength(13);
        expect(loaded.data.hulls.hulls).toHaveLength(12);
        expect(loaded.data.modules.modules).toHaveLength(49);
        expect(loaded.data.doctrines.doctrines).toHaveLength(9);
        expect(loaded.data.galaxyPresets.presets.map((preset) => preset.id)).toEqual([
            "balanced",
            "fragmented",
            "open_frontier",
            "tight"
        ]);
    });
    it("links buildings, recipe resources, and producedBy references", async () => {
        const loaded = await loadFromDirectory(dataDir, schemaDir);
        const recipeIds = new Set([
            ...loaded.BATCH.map((recipe) => recipe.id),
            ...loaded.CONT.map((process) => process.id)
        ]);
        for (const building of loaded.BUILDINGS) {
            if (building.recipe !== null)
                expect(recipeIds.has(building.recipe)).toBe(true);
        }
        expect(loaded.producedBy.get("metal")?.some((recipe) => recipe.id === "smelt_metal")).toBe(true);
    });
    it("links technology unlock effects to concrete content", async () => {
        const loaded = await loadFromDirectory(dataDir, schemaDir);
        const modules = new Set(loaded.data.modules.modules.map((item) => item.id));
        const hulls = new Set(loaded.data.hulls.hulls.map((item) => item.id));
        const buildings = new Set(loaded.BUILDINGS.map((item) => item.id));
        for (const tech of loaded.data.techs.techs) {
            const effects = Array.isArray(tech.effects)
                ? tech.effects
                : Array.isArray(tech.effectPerLevel)
                    ? tech.effectPerLevel
                    : [];
            for (const effect of effects) {
                if (effect.type === "unlockModule")
                    expect(modules.has(effect.id ?? "")).toBe(true);
                if (effect.type === "unlockHull")
                    expect(hulls.has(effect.id ?? "")).toBe(true);
                if (effect.type === "unlockBuilding")
                    expect(buildings.has(effect.id ?? "")).toBe(true);
            }
        }
    });
});
//# sourceMappingURL=load.test.js.map