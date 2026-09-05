export const GROWTH_R = 0.00012;
export const MAX_POPULATION_PER_BODY = 2500;
export function updatePopulationGrowth(data, bodies, stockpiles, supply) {
    for (let body = 0; body < bodies.length; body += 1) {
        const owner = bodies.owner[body] ?? -1;
        const population = bodies.population[body] ?? 0;
        if (owner < 0 || population <= 0)
            continue;
        const capacity = populationCapacity(bodies, body);
        const vital = supply.minVital(data, body);
        const reserveDays = minVitalReserveDays(data, bodies, stockpiles, body);
        let delta = 0;
        if (vital < 0.75) {
            delta = -population * GROWTH_R * (1 + (0.75 - vital) * 6);
        }
        else if (vital >= 0.95 && reserveDays >= 45 && population < capacity) {
            const roomFactor = (capacity - population) / Math.max(1, capacity);
            delta = population * GROWTH_R * Math.max(0, Math.min(1, roomFactor));
        }
        bodies.population[body] = clamp(population + delta, 1, capacity);
        bodies.unrest[body] = unrestFromSupply(vital);
    }
}
export function populationCapacity(bodies, body) {
    const base = 120 + (bodies.habitability[body] ?? 0) * 500;
    const housing = (bodies.housing[body] ?? 0) * 90;
    const buildingSupport = (bodies.buildingCount[body] ?? 0) * 2;
    return Math.min(MAX_POPULATION_PER_BODY, base + housing + buildingSupport);
}
export function unrestFromSupply(vital) {
    if (vital >= 1)
        return 0;
    if (vital >= 0.8)
        return lerp(0.15, 0, (vital - 0.8) / 0.2);
    if (vital >= 0.5)
        return lerp(0.45, 0.15, (vital - 0.5) / 0.3);
    if (vital >= 0.3)
        return lerp(0.8, 0.45, (vital - 0.3) / 0.2);
    return lerp(1, 0.8, vital / 0.3);
}
function minVitalReserveDays(data, bodies, stockpiles, body) {
    const population = bodies.population[body] ?? 0;
    const stockpile = bodies.stockpile[body] ?? 0;
    let minDays = Number.POSITIVE_INFINITY;
    for (let resource = 0; resource < data.resources.length; resource += 1) {
        const rate = data.populationNeeds.perThousandPopPerDay[resource] ?? 0;
        if (rate <= 0 || data.populationNeeds.comfortOnly[resource] === 1)
            continue;
        const demand = Math.max(0.000001, population * rate);
        const days = stockpiles.get(stockpile, resource) / demand;
        if (days < minDays)
            minDays = days;
    }
    return Number.isFinite(minDays) ? minDays : 0;
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}
//# sourceMappingURL=growth.js.map