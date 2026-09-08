import { StageOneLogKind } from "../events/log.js";
export function appendAiDecision(_data, world, tick, event) {
    world.eventLog.append(tick, event.kind, event.system, event.body, event.subject, event.resource, event.amount);
}
export function logStrategicGoal(data, world, tick, faction, subject, resource, pressure) {
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
export function logBottleneck(data, world, tick, faction, resource, deficitPerDay) {
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
export function logBuildPlan(data, world, tick, faction, body, buildingType, resource, score) {
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
export function logColonization(data, world, tick, faction, targetBody, resource, score) {
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
export function logFleetScale(data, world, tick, faction, ship, jobs) {
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
//# sourceMappingURL=decision-log.js.map