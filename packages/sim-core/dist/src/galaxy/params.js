const DEFAULT_RADIUS = 1000;
export function normalizeGalaxyParams(params = {}) {
    const systemCount = integerParam("systemCount", params.systemCount ?? 500, 1, 2000);
    const galaxyRadius = finiteParam("galaxyRadius", params.galaxyRadius ?? DEFAULT_RADIUS, 100, 5000);
    const shape = params.shape ?? "spiral";
    const armCount = integerParam("armCount", params.armCount ?? 4, 1, 8);
    const armTightness = finiteParam("armTightness", params.armTightness ?? 0.4, 0, 1);
    const maxGateLength = params.maxGateLength === undefined
        ? undefined
        : finiteParam("maxGateLength", params.maxGateLength, 1, galaxyRadius * 2);
    const planetsMin = integerParam("planetsPerSystemMin", params.planetsPerSystemMin ?? 1, 1, 16);
    const planetsMax = integerParam("planetsPerSystemMax", params.planetsPerSystemMax ?? 9, planetsMin, 16);
    return {
        systemCount,
        shape,
        armCount,
        armTightness,
        avgGateDegree: finiteParam("avgGateDegree", params.avgGateDegree ?? 3, 2, 5),
        gateDegreeVariance: finiteParam("gateDegreeVariance", params.gateDegreeVariance ?? 0.6, 0, 1),
        maxGateLength,
        regionCount: integerParam("regionCount", params.regionCount ?? 8, 1, Math.min(64, systemCount)),
        chokepointStrength: finiteParam("chokepointStrength", params.chokepointStrength ?? 0.6, 0, 1),
        planetsPerSystemMin: planetsMin,
        planetsPerSystemMax: planetsMax,
        habitableFraction: finiteParam("habitableFraction", params.habitableFraction ?? 0.12, 0, 1),
        resourceClusterStrength: finiteParam("resourceClusterStrength", params.resourceClusterStrength ?? 0.7, 0, 1),
        rareResourceAbundance: finiteParam("rareResourceAbundance", params.rareResourceAbundance ?? 0.05, 0, 1),
        factionCount: integerParam("factionCount", params.factionCount ?? 8, 1, 32),
        factionMinJumps: integerParam("factionMinJumps", params.factionMinJumps ?? 6, 1, 64),
        startViabilityJumps: integerParam("startViabilityJumps", params.startViabilityJumps ?? params.factionMinJumps ?? 6, 1, 64),
        maxAttempts: integerParam("maxAttempts", params.maxAttempts ?? 32, 1, 512),
        galaxyRadius,
        minSystemDistance: params.minSystemDistance ??
            defaultMinimumDistance(systemCount, galaxyRadius, shape, params.avgGateDegree ?? 3),
        rareResourceClusterMin: Math.max(3, Math.min(8, Math.floor(Math.sqrt(systemCount) / 7)))
    };
}
export function paramsWithPreset(presets, presetId, overrides = {}) {
    for (let i = 0; i < presets.length; i += 1) {
        const preset = presets[i];
        if (preset?.id === presetId)
            return { ...preset.params, ...overrides };
    }
    throw new RangeError(`Unknown galaxy preset "${presetId}".`);
}
export function deriveAttemptSeed(seed, attempt) {
    if (attempt === 0)
        return seed >>> 0;
    return mix32((seed >>> 0) ^ Math.imul((attempt + 1) >>> 0, 0x9e3779b9));
}
function defaultMinimumDistance(systemCount, radius, shape, avgGateDegree) {
    const shapeFactor = shape === "ring" ? 0.56 : shape === "cluster" ? 0.48 : 0.72;
    const densityFactor = avgGateDegree > 3.5 ? 0.93 : 1;
    return Math.max(6, radius * Math.sqrt(shapeFactor / systemCount) * 0.82 * densityFactor);
}
function finiteParam(name, value, min, max) {
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`${name} must be a finite number in ${min}..${max}.`);
    }
    return value;
}
function integerParam(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new RangeError(`${name} must be an integer in ${min}..${max}.`);
    }
    return value;
}
function mix32(value) {
    let x = value >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}
//# sourceMappingURL=params.js.map