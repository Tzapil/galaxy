export function scoreColonyTarget(data, world, routes, faction, body, bottleneckResource = -1) {
    if ((world.bodies.owner[body] ?? -1) >= 0) {
        return { body, score: Number.NEGATIVE_INFINITY, bottleneckResource };
    }
    const targetSystem = world.bodies.system[body] ?? -1;
    const nearest = nearestFactionColonyDistance(world, routes, faction, targetSystem);
    if (!Number.isFinite(nearest)) {
        return { body, score: Number.NEGATIVE_INFINITY, bottleneckResource };
    }
    let score = (world.bodies.habitability[body] ?? 0) * 40;
    score += (world.bodies.slots[body] ?? 0) * 0.6;
    const first = world.bodies.firstDeposit[body] ?? -1;
    const count = world.bodies.depositCount[body] ?? 0;
    for (let i = 0; i < count; i += 1) {
        const deposit = first + i;
        const resource = world.bodies.deposits.resource[deposit] ?? -1;
        const yieldValue = world.bodies.deposits.yield[deposit] ?? 0;
        score += resourceScore(data, resource, yieldValue);
        if (resource === bottleneckResource)
            score += 50 * Math.max(0.5, yieldValue);
    }
    score /= 1 + nearest / 12;
    return { body, score, bottleneckResource };
}
export function bestColonyTarget(data, world, routes, faction, bottleneckResource = -1) {
    let best = { body: -1, score: Number.NEGATIVE_INFINITY, bottleneckResource };
    for (let body = 0; body < world.bodies.length; body += 1) {
        const score = scoreColonyTarget(data, world, routes, faction, body, bottleneckResource);
        if (score.score > best.score + 1e-9)
            best = score;
    }
    return best;
}
function nearestFactionColonyDistance(world, routes, faction, targetSystem) {
    let nearest = Number.POSITIVE_INFINITY;
    let body = world.factions.firstColony[faction] ?? -1;
    while (body >= 0) {
        const sourceSystem = world.bodies.system[body] ?? -1;
        const route = routes.find(world.systems, world.gates, sourceSystem, targetSystem);
        if (route.reachable)
            nearest = Math.min(nearest, route.jumps);
        body = world.bodies.nextInFaction[body] ?? -1;
    }
    return nearest;
}
function resourceScore(data, resource, yieldValue) {
    const id = data.resources[resource]?.id ?? "";
    if (id === "rare_earth" || id === "crystals" || id === "radioactives") {
        return 25 * yieldValue;
    }
    if (id === "ore")
        return 6 * yieldValue;
    if (id === "ice")
        return 8 * yieldValue;
    if (id === "gas")
        return 7 * yieldValue;
    return 3 * yieldValue;
}
//# sourceMappingURL=colony-score.js.map