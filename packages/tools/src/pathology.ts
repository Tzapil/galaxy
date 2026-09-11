export interface PathologyFinding {
  readonly check: string;
  readonly status: "ok" | "failed" | "not_available";
  readonly message: string;
  readonly seed: number;
  readonly tick: number;
}

export interface PathologyInput {
  readonly seed: number;
  readonly tick: number;
  readonly stage: number;
  readonly metrics?:
    | StageOnePathologyMetrics
    | StageTwoPathologyMetrics
    | StageSixPathologyMetrics
    | StageSevenPathologyMetrics;
}

export interface StageOnePathologyMetrics {
  readonly minPopulation: number;
  readonly totalPopulation: number;
  readonly averageFoodWaterSpread: number;
  readonly deliveredShipments: number;
  readonly missedDeparturesFuel: number;
}

export interface StageTwoPathologyMetrics extends StageOnePathologyMetrics {
  readonly idleNoPower: number;
  readonly idleMissingInput: number;
  readonly constructedBuildings: number;
  readonly researchedTechnologies: number;
  readonly maxResourceZeroStreakDays: number;
  readonly treasuryMin: number;
}

export interface StageSixPathologyMetrics extends StageTwoPathologyMetrics {
  readonly warCount: number;
  readonly longestFrontStallDays: number;
  readonly unorderedFleetDays: number;
  readonly maxBattleRounds: number;
  readonly stalledBlockades: number;
  readonly blockadeReactions: number;
  readonly ghostFleets: number;
  readonly economicWarChains: number;
  readonly duelCycleEdges: number;
}

export interface StageSevenPathologyMetrics extends StageTwoPathologyMetrics {
  readonly warCount: number;
  readonly secessionCount: number;
  readonly aliveFactionsMin: number;
  readonly aliveFactionDistinctCounts: number;
  readonly earlyConcentrationMax: number;
  readonly retainedStateStabilized: boolean;
  readonly maxEventLogEntries: number;
}

const stageBoundChecks: readonly { readonly check: string; readonly stage: number }[] = [
  { check: "no-building-for-100-years", stage: 2 },
  { check: "resource-produced-nowhere", stage: 2 },
  { check: "transport-loop-without-progress", stage: 1 },
  { check: "price-infinite-or-zero-forever", stage: 1 },
  { check: "population-collapse-everywhere", stage: 1 },
  { check: "mutual-production-deadlock", stage: 2 },
  { check: "war-without-front-change", stage: 6 },
  { check: "fleet-without-order", stage: 6 },
  { check: "battle-over-40-rounds", stage: 6 },
  { check: "blockade-without-reaction", stage: 6 },
  { check: "fleet-ghost", stage: 6 },
  { check: "economic-war-chain-missing", stage: 6 },
  { check: "duel-matrix-not-cyclic", stage: 6 },
  { check: "diplomatic-stagnation", stage: 7 },
  { check: "early-eternal-hegemony", stage: 7 },
  { check: "all-factions-extinct", stage: 7 },
  { check: "unbounded-long-horizon-state", stage: 7 }
];

export function detectPathologies(input: PathologyInput): readonly PathologyFinding[] {
  const findings: PathologyFinding[] = [];
  for (const check of stageBoundChecks) {
    if (input.stage < check.stage) {
      findings.push(
        unavailableFinding(input, check.check, `not available until Stage ${check.stage}`)
      );
    } else if (check.stage === 1) {
      findings.push(stageOneFinding(input, check.check));
    } else if (check.stage === 2) {
      findings.push(stageTwoFinding(input, check.check));
    } else if (check.stage === 6 && input.stage === 6) {
      findings.push(stageSixFinding(input, check.check));
    } else if (check.stage === 7) {
      findings.push(stageSevenFinding(input, check.check));
    } else {
      findings.push(
        unavailableFinding(input, check.check, "covered by the dedicated Stage 6 combat stand")
      );
    }
  }
  return findings;
}

function stageSevenFinding(input: PathologyInput, check: string): PathologyFinding {
  const metrics = input.metrics;
  if (metrics === undefined || !("secessionCount" in metrics)) {
    return unavailableFinding(input, check, "Stage 7 metrics were not provided");
  }
  if (check === "diplomatic-stagnation") {
    return metrics.warCount > 0 &&
      metrics.secessionCount > 0 &&
      metrics.aliveFactionDistinctCounts > 1
      ? okFinding(
          input,
          check,
          `${metrics.warCount} wars, ${metrics.secessionCount} secessions, ${metrics.aliveFactionDistinctCounts} faction counts`
        )
      : failedFinding(input, check, "wars, secessions or faction-count oscillation stopped");
  }
  if (check === "early-eternal-hegemony") {
    return metrics.earlyConcentrationMax < 0.35
      ? okFinding(
          input,
          check,
          `early concentration max ${metrics.earlyConcentrationMax.toFixed(4)}`
        )
      : failedFinding(
          input,
          check,
          `early concentration reached ${metrics.earlyConcentrationMax.toFixed(4)}`
        );
  }
  if (check === "all-factions-extinct") {
    return metrics.aliveFactionsMin > 0
      ? okFinding(input, check, `minimum alive factions ${metrics.aliveFactionsMin}`)
      : failedFinding(input, check, "all factions became extinct");
  }
  if (check === "unbounded-long-horizon-state") {
    return metrics.retainedStateStabilized && metrics.maxEventLogEntries <= 4096
      ? okFinding(input, check, `retained state stabilized; journal ${metrics.maxEventLogEntries}`)
      : failedFinding(input, check, "retained state or event journal kept growing");
  }
  return okFinding(input, check, "Stage 7 check is available");
}

function stageSixFinding(input: PathologyInput, check: string): PathologyFinding {
  const metrics = input.metrics;
  if (metrics === undefined || !("longestFrontStallDays" in metrics)) {
    return unavailableFinding(input, check, "Stage 6 metrics were not provided");
  }
  if (check === "war-without-front-change") {
    if (metrics.warCount <= 0) return failedFinding(input, check, "no wars occurred");
    return metrics.longestFrontStallDays <= 20 * 365
      ? okFinding(input, check, `longest front stall ${metrics.longestFrontStallDays} days`)
      : failedFinding(input, check, `front stalled for ${metrics.longestFrontStallDays} days`);
  }
  if (check === "fleet-without-order") {
    return metrics.unorderedFleetDays <= 5 * 365
      ? okFinding(input, check, `longest unordered fleet span ${metrics.unorderedFleetDays} days`)
      : failedFinding(input, check, `fleet lacked an order for ${metrics.unorderedFleetDays} days`);
  }
  if (check === "battle-over-40-rounds") {
    return metrics.maxBattleRounds <= 40
      ? okFinding(input, check, `longest battle ${metrics.maxBattleRounds} rounds`)
      : failedFinding(input, check, `battle lasted ${metrics.maxBattleRounds} rounds`);
  }
  if (check === "blockade-without-reaction") {
    return metrics.stalledBlockades === 0 && metrics.blockadeReactions > 0
      ? okFinding(input, check, `blockade reactions ${metrics.blockadeReactions}`)
      : failedFinding(
          input,
          check,
          `${metrics.stalledBlockades} blockades stalled without reaction`
        );
  }
  if (check === "fleet-ghost") {
    return metrics.ghostFleets === 0
      ? okFinding(input, check, "no active empty fleets")
      : failedFinding(input, check, `${metrics.ghostFleets} active empty fleets`);
  }
  if (check === "economic-war-chain-missing") {
    return metrics.economicWarChains > 0
      ? okFinding(input, check, `economic-war chains ${metrics.economicWarChains}`)
      : failedFinding(input, check, "blockade did not propagate into the economy");
  }
  if (check === "duel-matrix-not-cyclic") {
    return metrics.duelCycleEdges === 4
      ? okFinding(input, check, "all four counter-design edges hold")
      : failedFinding(input, check, `${metrics.duelCycleEdges}/4 counter-design edges hold`);
  }
  return okFinding(input, check, "Stage 6 check is available");
}

function stageOneFinding(input: PathologyInput, check: string): PathologyFinding {
  const metrics = input.metrics;
  if (metrics === undefined) {
    return unavailableFinding(input, check, "metrics were not provided");
  }
  if (check === "population-collapse-everywhere") {
    return metrics.totalPopulation > 1
      ? okFinding(
          input,
          check,
          `total population ${metrics.totalPopulation.toFixed(2)}, minimum colony ${metrics.minPopulation.toFixed(2)}`
        )
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

function stageTwoFinding(input: PathologyInput, check: string): PathologyFinding {
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
      : failedFinding(
          input,
          check,
          `tracked resource stayed at zero for ${metrics.maxResourceZeroStreakDays} days`
        );
  }
  if (check === "mutual-production-deadlock") {
    return metrics.idleMissingInput < 90
      ? okFinding(input, check, `idle missing-input buildings ${metrics.idleMissingInput}`)
      : failedFinding(input, check, `too many missing-input idles: ${metrics.idleMissingInput}`);
  }
  return okFinding(input, check, "Stage 2 check is available");
}

function unavailableFinding(
  input: PathologyInput,
  check: string,
  message: string
): PathologyFinding {
  return {
    check,
    status: "not_available",
    message,
    seed: input.seed,
    tick: input.tick
  };
}

function okFinding(input: PathologyInput, check: string, message: string): PathologyFinding {
  return {
    check,
    status: "ok",
    message,
    seed: input.seed,
    tick: input.tick
  };
}

function failedFinding(input: PathologyInput, check: string, message: string): PathologyFinding {
  return {
    check,
    status: "failed",
    message,
    seed: input.seed,
    tick: input.tick
  };
}
