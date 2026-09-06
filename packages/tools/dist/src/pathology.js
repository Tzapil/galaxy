const stageBoundChecks = [
    { check: "no-building-for-100-years", stage: 2 },
    { check: "resource-produced-nowhere", stage: 2 },
    { check: "transport-loop-without-progress", stage: 1 },
    { check: "price-infinite-or-zero-forever", stage: 1 },
    { check: "population-collapse-everywhere", stage: 1 },
    { check: "mutual-production-deadlock", stage: 2 }
];
export function detectPathologies(input) {
    const findings = [];
    for (const check of stageBoundChecks) {
        if (input.stage < check.stage) {
            findings.push(unavailableFinding(input, check.check, `not available until Stage ${check.stage}`));
        }
        else if (check.stage === 1) {
            findings.push(stageOneFinding(input, check.check));
        }
        else {
            findings.push(stageTwoFinding(input, check.check));
        }
    }
    return findings;
}
function stageOneFinding(input, check) {
    const metrics = input.metrics;
    if (metrics === undefined) {
        return unavailableFinding(input, check, "metrics were not provided");
    }
    if (check === "population-collapse-everywhere") {
        return metrics.totalPopulation > 0 && metrics.minPopulation > 1
            ? okFinding(input, check, `min population ${metrics.minPopulation.toFixed(2)}`)
            : failedFinding(input, check, "population collapsed everywhere");
    }
    if (check === "transport-loop-without-progress") {
        return metrics.deliveredShipments > 0
            ? okFinding(input, check, `deliveries ${metrics.deliveredShipments}`)
            : failedFinding(input, check, "transport made no deliveries");
    }
    if (check === "price-infinite-or-zero-forever") {
        return Number.isFinite(metrics.averageFoodWaterSpread) && metrics.averageFoodWaterSpread >= 0
            ? okFinding(input, check, `food/water spread ${metrics.averageFoodWaterSpread.toFixed(4)}`)
            : failedFinding(input, check, "price spread is not finite");
    }
    return okFinding(input, check, "Stage 1 check is available");
}
function stageTwoFinding(input, check) {
    const metrics = input.metrics;
    if (metrics === undefined || !("idleNoPower" in metrics)) {
        return unavailableFinding(input, check, "Stage 2 metrics were not provided");
    }
    if (check === "no-building-for-100-years") {
        if (input.tick >= 36_500 && metrics.constructedBuildings <= 0) {
            return failedFinding(input, check, "no completed construction in the first 100 years");
        }
        return okFinding(input, check, `completed construction ${metrics.constructedBuildings}`);
    }
    if (check === "resource-produced-nowhere") {
        return metrics.maxResourceZeroStreakDays < 730
            ? okFinding(input, check, `max tracked zero streak ${metrics.maxResourceZeroStreakDays} days`)
            : failedFinding(input, check, `tracked resource stayed at zero for ${metrics.maxResourceZeroStreakDays} days`);
    }
    if (check === "mutual-production-deadlock") {
        return metrics.idleMissingInput < 90
            ? okFinding(input, check, `idle missing-input buildings ${metrics.idleMissingInput}`)
            : failedFinding(input, check, `too many missing-input idles: ${metrics.idleMissingInput}`);
    }
    return okFinding(input, check, "Stage 2 check is available");
}
function unavailableFinding(input, check, message) {
    return {
        check,
        status: "not_available",
        message,
        seed: input.seed,
        tick: input.tick
    };
}
function okFinding(input, check, message) {
    return {
        check,
        status: "ok",
        message,
        seed: input.seed,
        tick: input.tick
    };
}
function failedFinding(input, check, message) {
    return {
        check,
        status: "failed",
        message,
        seed: input.seed,
        tick: input.tick
    };
}
//# sourceMappingURL=pathology.js.map