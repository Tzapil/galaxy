import type { StageOneData, StageOnePersonalityWeights } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export const enum AiGoalKind {
  FleetProgram = 1,
  ResourceReserve = 2
}

export interface AiGoal {
  readonly id: number;
  readonly kind: AiGoalKind;
  readonly priority: number;
  readonly deadlineTick: number;
  readonly subject: number;
  readonly resource: number;
  readonly targetAmount: number;
}

export function createStrategicGoal(
  data: StageOneData,
  world: StageOneWorld,
  faction: number,
  tick: number,
  weights: StageOnePersonalityWeights,
  currentBottleneck = -1
): AiGoal {
  const hull = data.hullIndex.get("cruiser") ?? data.hullIndex.get("corvette") ?? -1;
  const hullFrames = data.resourceIndex.get("hull_frames") ?? currentBottleneck;
  const resource = currentBottleneck >= 0 ? currentBottleneck : hullFrames;
  const goalId = faction * 1000 + Math.floor(tick / 360);
  const colonyFactor = Math.max(1, world.factions.colonyCount[faction] ?? 1);
  return {
    id: goalId,
    kind: AiGoalKind.FleetProgram,
    priority: Math.max(1, weights.military * weights.industry),
    deadlineTick: tick + 365,
    subject: hull,
    resource,
    targetAmount: Math.max(4, Math.round(20 * weights.military * Math.sqrt(colonyFactor))),
  };
}
