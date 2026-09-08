export const AI_STRATEGIC_PERIOD_TICKS = 360;
export const AI_OPERATIONAL_PERIOD_TICKS = 30;
export var AiLayer;
(function (AiLayer) {
    AiLayer[AiLayer["Strategic"] = 1] = "Strategic";
    AiLayer[AiLayer["Operational"] = 2] = "Operational";
    AiLayer[AiLayer["Tactical"] = 3] = "Tactical";
})(AiLayer || (AiLayer = {}));
export class AiScheduler {
    shouldRunStrategic(tick, faction) {
        if (tick <= 0)
            return false;
        return tick % AI_STRATEGIC_PERIOD_TICKS === strategicPhase(faction);
    }
    shouldRunOperational(tick, faction) {
        if (tick <= 0)
            return false;
        return tick % AI_OPERATIONAL_PERIOD_TICKS === operationalPhase(faction);
    }
    shouldRunTactical(_tick) {
        return true;
    }
    collectDue(tick, factionCount, out) {
        out.length = 0;
        for (let faction = 0; faction < factionCount; faction += 1) {
            if (this.shouldRunStrategic(tick, faction)) {
                out.push({ layer: AiLayer.Strategic, faction });
            }
            if (this.shouldRunOperational(tick, faction)) {
                out.push({ layer: AiLayer.Operational, faction });
            }
        }
    }
}
function strategicPhase(faction) {
    return (faction * 43) % AI_STRATEGIC_PERIOD_TICKS;
}
function operationalPhase(faction) {
    return faction % AI_OPERATIONAL_PERIOD_TICKS;
}
//# sourceMappingURL=scheduler.js.map