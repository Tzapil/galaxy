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

export interface AiDecisionReasonEvent {
  readonly kind: StageOneLogKind;
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

export function formatAiDecisionReason(data: StageOneData, event: AiDecisionReasonEvent): string {
  const system = event.system >= 0 ? `system ${event.system}` : "unknown system";
  const body = event.body >= 0 ? `body ${event.body}` : "unknown body";
  const resource = resourceName(data, event.resource);
  switch (event.kind) {
    case StageOneLogKind.AiStrategicGoal:
      return `AI strategic goal: focus ${resource}; pressure ${formatNumber(event.amount)} at ${system}.`;
    case StageOneLogKind.AiBottleneck:
      return `AI bottleneck: ${resource} deficit ${formatNumber(event.amount)} per day at ${system}.`;
    case StageOneLogKind.AiBuildPlan:
      return `AI build plan: queue ${buildingName(data, event.subject)} on ${body} because ${resource} pressure is ${formatNumber(event.amount)}.`;
    case StageOneLogKind.AiColonization:
      return `AI colonization: target ${body} for ${resource}; score ${formatNumber(event.amount)}.`;
    case StageOneLogKind.AiFleetScale:
      return `AI fleet scale: add hauler ${event.subject} because ${formatNumber(event.amount)} jobs are waiting.`;
    case StageOneLogKind.AiNoop:
      return `AI holds plan at ${system}.`;
    case StageOneLogKind.ResearchChosen:
      return `Research choice: study ${techName(data, event.subject)} for ${resource}; score ${formatNumber(event.amount)}.`;
    default:
      return "";
  }
}

function resourceName(data: StageOneData, resource: number): string {
  if (resource < 0) return "no specific resource";
  const def = data.resources[resource];
  return def === undefined ? `resource ${resource}` : `${def.name} (${def.id})`;
}

function buildingName(data: StageOneData, building: number): string {
  if (building < 0) return "unknown building";
  const def = data.buildings[building];
  return def === undefined ? `building ${building}` : `${def.name} (${def.id})`;
}

function techName(data: StageOneData, tech: number): string {
  if (tech < 0) return "unknown technology";
  const def = data.techs[tech];
  return def === undefined ? `technology ${tech}` : `${def.name} (${def.id})`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}
