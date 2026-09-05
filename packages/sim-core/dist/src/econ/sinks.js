export function resourceIsConsumedBySink(data, resource) {
    return data.graph.sinkConsumes[resource] === 1;
}
export function sinkConsumesResource(data, sinkId, resource) {
    for (let sink = 0; sink < data.sinks.length; sink += 1) {
        const item = data.sinks[sink];
        if (item?.id !== sinkId)
            continue;
        for (let i = 0; i < item.consumes.length; i += 1) {
            if ((item.consumes[i] ?? -1) === resource)
                return true;
        }
    }
    return false;
}
export function allBuildCostResourcesAreSinks(data) {
    for (let building = 0; building < data.buildings.length; building += 1) {
        const cost = data.buildings[building]?.buildCost ?? [];
        for (let i = 0; i < cost.length; i += 1) {
            const resource = cost[i]?.resource ?? -1;
            if (resource >= 0 && data.graph.sinkConsumes[resource] !== 1)
                return false;
        }
    }
    return true;
}
//# sourceMappingURL=sinks.js.map