export var AiGoalKind;
(function (AiGoalKind) {
    AiGoalKind[AiGoalKind["FleetProgram"] = 1] = "FleetProgram";
    AiGoalKind[AiGoalKind["ResourceReserve"] = 2] = "ResourceReserve";
})(AiGoalKind || (AiGoalKind = {}));
export function createStrategicGoal(data, world, faction, tick, weights, currentBottleneck = -1) {
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
        targetAmount: Math.max(4, Math.round(20 * weights.military * Math.sqrt(colonyFactor)))
    };
}
//# sourceMappingURL=goals.js.map