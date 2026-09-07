import { beforeAll, describe, expect, it } from "vitest";
import { GalaxyGenerationError, EventQueue, buildGeneratedGalaxyWorld, hashState, neighborResourceCorrelation, normalizeGalaxyParams, paramsWithPreset, rareResourceClusterCount, rareResourceIndices, systemResourcePresence } from "@galaxy-sim/sim-core";
import { loadStageTwoData } from "../src/stage-two-loader.js";
let data;
beforeAll(async () => {
    data = await loadStageTwoData();
});
describe("Stage 3 galaxy generation", () => {
    it("generates 50 valid 500-system maps", () => {
        const params = paramsWithPreset(data.galaxyPresets, "balanced");
        for (let i = 0; i < 50; i += 1) {
            const galaxy = buildGeneratedGalaxyWorld(data, 20260904 + i, params);
            expect(galaxy.world.systems.length).toBe(500);
            expect(galaxy.validation.violations).toEqual([]);
            expect(galaxy.averageGateDegree).toBeGreaterThanOrEqual(2.7);
            expect(galaxy.averageGateDegree).toBeLessThanOrEqual(3.15);
            expect(galaxy.world.factions.length).toBe(8);
        }
    }, 180_000);
    it("is deterministic from the source seed, including regeneration attempts", () => {
        const params = paramsWithPreset(data.galaxyPresets, "balanced", {
            maxAttempts: 8,
            resourceClusterStrength: 1
        });
        const first = buildGeneratedGalaxyWorld(data, 424242, params);
        const second = buildGeneratedGalaxyWorld(data, 424242, params);
        expect(first.attempt).toBe(second.attempt);
        expect(first.generationSeed).toBe(second.generationSeed);
        expect(worldHash(first.world)).toBe(worldHash(second.world));
    });
    it("fails impossible start spacing with a clear bounded-attempt error", () => {
        expect(() => buildGeneratedGalaxyWorld(data, 1, {
            systemCount: 20,
            factionCount: 8,
            factionMinJumps: 50,
            startViabilityJumps: 6,
            maxAttempts: 2
        })).toThrow(GalaxyGenerationError);
    });
    it("keeps every data preset valid", () => {
        for (const preset of data.galaxyPresets) {
            const galaxy = buildGeneratedGalaxyWorld(data, 20260904, preset.params);
            expect(galaxy.validation.violations).toEqual([]);
            expect(galaxy.world.factions.length).toBe(preset.params.factionCount ?? 8);
        }
    }, 120_000);
    it("clusters rare resources and keeps each rare resource in several clusters", () => {
        const clustered = buildGeneratedGalaxyWorld(data, 9901, {
            systemCount: 500,
            resourceClusterStrength: 1,
            rareResourceAbundance: 0.05
        });
        const flat = buildGeneratedGalaxyWorld(data, 9901, {
            systemCount: 500,
            resourceClusterStrength: 0,
            rareResourceAbundance: 0.05
        });
        const rareEarth = rareResourceIndices(data)[0] ?? 0;
        const clusteredPresence = systemResourcePresence(data, clustered.world);
        const flatPresence = systemResourcePresence(data, flat.world);
        const clusteredCorrelation = neighborResourceCorrelation(clusteredPresence, clustered.edges, rareEarth);
        const flatCorrelation = neighborResourceCorrelation(flatPresence, flat.edges, rareEarth);
        expect(clusteredCorrelation).toBeGreaterThan(flatCorrelation + 0.05);
        for (const resource of rareResourceIndices(data)) {
            expect(rareResourceClusterCount(clusteredPresence, clustered.edges, resource)).toBeGreaterThanOrEqual(normalizeGalaxyParams({ systemCount: 500 }).rareResourceClusterMin);
        }
    }, 120_000);
});
function worldHash(world) {
    return hashState({
        tick: 0,
        rngStreams: [],
        eventQueue: new EventQueue(),
        arenas: world.arenas()
    });
}
//# sourceMappingURL=stage-three.test.js.map