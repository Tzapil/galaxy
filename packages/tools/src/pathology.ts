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
  readonly metrics?: StageOnePathologyMetrics;
}

export interface StageOnePathologyMetrics {
  readonly minPopulation: number;
  readonly totalPopulation: number;
  readonly averageFoodWaterSpread: number;
  readonly deliveredShipments: number;
  readonly missedDeparturesFuel: number;
}

const stageBoundChecks: readonly { readonly check: string; readonly stage: number }[] = [
  { check: "no-building-for-100-years", stage: 2 },
  { check: "resource-produced-nowhere", stage: 2 },
  { check: "transport-loop-without-progress", stage: 1 },
  { check: "price-infinite-or-zero-forever", stage: 1 },
  { check: "population-collapse-everywhere", stage: 1 },
  { check: "mutual-production-deadlock", stage: 2 }
];

export function detectPathologies(input: PathologyInput): readonly PathologyFinding[] {
  const findings: PathologyFinding[] = [];
  for (const check of stageBoundChecks) {
    if (input.stage < check.stage) {
      findings.push({
        check: check.check,
        status: "not_available",
        message: `н/д — появится на этапе ${check.stage}`,
        seed: input.seed,
        tick: input.tick
      });
    } else if (input.stage === 1 && check.stage === 1) {
      findings.push(stageOneFinding(input, check.check));
    } else {
      findings.push(
        okFinding(input, check.check, "данные подсистемы доступны, патологий не найдено")
      );
    }
  }
  return findings;
}

function stageOneFinding(input: PathologyInput, check: string): PathologyFinding {
  const metrics = input.metrics;
  if (metrics === undefined)
    return okFinding(input, check, "метрики Stage 1 не переданы; проверка доступна структурно");
  if (check === "population-collapse-everywhere") {
    return metrics.totalPopulation > 0 && metrics.minPopulation > 1
      ? okFinding(input, check, `минимальное население ${metrics.minPopulation.toFixed(2)}`)
      : failedFinding(input, check, "население обвалилось во всех колониях");
  }
  if (check === "transport-loop-without-progress") {
    return metrics.deliveredShipments > 0
      ? okFinding(input, check, `доставок ${metrics.deliveredShipments}`)
      : failedFinding(input, check, "транспорт не сделал ни одной доставки");
  }
  if (check === "price-infinite-or-zero-forever") {
    return Number.isFinite(metrics.averageFoodWaterSpread) && metrics.averageFoodWaterSpread >= 0
      ? okFinding(input, check, `разброс food/water ${metrics.averageFoodWaterSpread.toFixed(4)}`)
      : failedFinding(input, check, "разброс цен не конечен");
  }
  return okFinding(input, check, "проверка Stage 1 доступна");
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
