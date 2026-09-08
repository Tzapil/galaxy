import { StageOneLogKind } from "../events/log.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export interface AiDecisionEvent {
  readonly kind: StageOneLogKind;
  readonly faction: number;
  readonly system: number;
  readonly body: number;
  readonly subject: number;
  readonly resource: number;
  readonly amount: number;
}

export function appendAiDecision(
  _data: StageOneData,
  world: StageOneWorld,
  tick: number,
  event: AiDecisionEvent
): void {
  world.eventLog.append(
    tick,
    event.kind,
    event.system,
    event.body,
    event.subject,
    event.resource,
    event.amount
  );
}

export function logStrategicGoal(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  faction: number,
  subject: number,
  resource: number,
  pressure: number
): void {
  appendAiDecision(data, world, tick, {
    kind: StageOneLogKind.AiStrategicGoal,
    faction,
    system: world.factions.capitalSystem[faction] ?? -1,
    body: world.factions.capitalBody[faction] ?? -1,
    subject,
    resource,
    amount: pressure
  });
}

export function logBottleneck(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  faction: number,
  resource: number,
  deficitPerDay: number
): void {
  appendAiDecision(data, world, tick, {
    kind: StageOneLogKind.AiBottleneck,
    faction,
    system: world.factions.capitalSystem[faction] ?? -1,
    body: world.factions.capitalBody[faction] ?? -1,
    subject: faction,
    resource,
    amount: deficitPerDay
  });
}

export function logBuildPlan(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  faction: number,
  body: number,
  buildingType: number,
  resource: number,
  score: number
): void {
  appendAiDecision(data, world, tick, {
    kind: StageOneLogKind.AiBuildPlan,
    faction,
    system: world.bodies.system[body] ?? -1,
    body,
    subject: buildingType,
    resource,
    amount: score
  });
}

export function logColonization(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  faction: number,
  targetBody: number,
  resource: number,
  score: number
): void {
  appendAiDecision(data, world, tick, {
    kind: StageOneLogKind.AiColonization,
    faction,
    system: world.bodies.system[targetBody] ?? -1,
    body: targetBody,
    subject: faction,
    resource,
    amount: score
  });
}

export function logFleetScale(
  data: StageOneData,
  world: StageOneWorld,
  tick: number,
  faction: number,
  ship: number,
  jobs: number
): void {
  appendAiDecision(data, world, tick, {
    kind: StageOneLogKind.AiFleetScale,
    faction,
    system: world.factions.capitalSystem[faction] ?? -1,
    body: world.factions.capitalBody[faction] ?? -1,
    subject: ship,
    resource: data.resourceIndex.get("fuel") ?? -1,
    amount: jobs
  });
}
