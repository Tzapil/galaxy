import { resourceIndexOf } from "../stage-one/data.js";
import { KitOrderState } from "../ships/kit-order.js";
import { repeatableCostAtLevel } from "../tech/repeatable.js";
export class JobBoard {
    capacity;
    faction;
    sourceBody;
    targetBody;
    sourceSystem;
    targetSystem;
    resource;
    quantity;
    travelTicks;
    score;
    reserved;
    kitOrder;
    compound;
    count = 0;
    constructor(capacity = 60) {
        this.capacity = capacity;
        this.faction = new Uint16Array(capacity);
        this.sourceBody = new Uint32Array(capacity);
        this.targetBody = new Uint32Array(capacity);
        this.sourceSystem = new Uint32Array(capacity);
        this.targetSystem = new Uint32Array(capacity);
        this.resource = new Uint16Array(capacity);
        this.quantity = new Float64Array(capacity);
        this.travelTicks = new Float64Array(capacity);
        this.score = new Float64Array(capacity);
        this.reserved = new Uint8Array(capacity);
        this.kitOrder = new Int32Array(capacity);
        this.compound = new Uint8Array(capacity);
    }
    clear() {
        this.count = 0;
    }
    takeBestForFaction(faction) {
        for (let i = 0; i < this.count; i += 1) {
            if ((this.faction[i] ?? 0) === faction && this.reserved[i] !== 1) {
                this.reserved[i] = 1;
                return i;
            }
        }
        return -1;
    }
    takeBestAtSystem(faction, system) {
        for (let i = 0; i < this.count; i += 1) {
            if ((this.faction[i] ?? 0) === faction &&
                (this.sourceSystem[i] ?? 0) === system &&
                this.reserved[i] !== 1) {
                this.reserved[i] = 1;
                return i;
            }
        }
        return -1;
    }
    unreserve(job) {
        if (job >= 0 && job < this.count)
            this.reserved[job] = 0;
    }
    bestUnreservedForFaction(faction) {
        for (let i = 0; i < this.count; i += 1) {
            if ((this.faction[i] ?? 0) === faction && this.reserved[i] !== 1)
                return i;
        }
        return -1;
    }
    update(data, world, routes, contracts) {
        this.clear();
        const fuel = resourceIndexOf(data.resourceIndex, "fuel");
        for (let faction = 0; faction < world.factions.length; faction += 1) {
            let source = world.factions.firstColony[faction] ?? -1;
            while (source >= 0) {
                let target = world.factions.firstColony[faction] ?? -1;
                while (target >= 0) {
                    if (target !== source)
                        this.scanPair(data, world, routes, contracts, faction, source, target, fuel);
                    target = world.bodies.nextInFaction[target] ?? -1;
                }
                source = world.bodies.nextInFaction[source] ?? -1;
            }
            this.scanKitOrders(data, world, routes, faction, fuel);
        }
    }
    scanPair(data, world, routes, contracts, faction, source, target, fuel) {
        const sourceSystem = world.bodies.system[source] ?? 0;
        const targetSystem = world.bodies.system[target] ?? 0;
        const route = routes.find(world.systems, world.gates, sourceSystem, targetSystem);
        if (!route.reachable)
            return;
        for (let resource = 0; resource < data.resources.length; resource += 1) {
            if (data.transportable[resource] !== 1)
                continue;
            const sourcePrice = world.prices.price(source, resource);
            const targetPrice = world.prices.price(target, resource);
            const subsidy = contracts?.subsidyFor(faction, target, resource) ?? 0;
            const researchBid = researchBidAtCapital(data, world, faction, target, resource);
            if (isScienceDataResource(data, resource) && subsidy <= 0 && researchBid <= 0)
                continue;
            if (subsidy <= 0 && researchBid <= 0 && targetPrice <= sourcePrice * 1.25)
                continue;
            const reserve = resource === fuel ? 40 : 0;
            const sourceDemandReserve = Math.max(reserve, world.prices.demand(source, resource) * sourceReserveDays(data, resource));
            const sourceStock = Math.max(0, world.stockpiles.get(world.bodies.stockpile[source] ?? 0, resource) - sourceDemandReserve);
            const targetSpace = world.stockpiles.capacity(world.bodies.stockpile[target] ?? 0, resource) -
                world.stockpiles.get(world.bodies.stockpile[target] ?? 0, resource);
            const demandWindow = Math.max(30, world.prices.demand(target, resource) * 60, researchRemainingAtCapital(data, world, faction, target, resource));
            const quantity = Math.max(0, Math.min(sourceStock, targetSpace, demandWindow));
            if (quantity <= 0.001)
                continue;
            const gain = (targetPrice + subsidy + researchBid - sourcePrice) * quantity;
            if (gain <= 0)
                continue;
            this.pushSorted(faction, source, target, sourceSystem, targetSystem, resource, quantity, route.travelTicks, gain / Math.max(1, route.travelTicks));
        }
    }
    scanKitOrders(data, world, routes, faction, fuel) {
        for (let order = 0; order < world.kitOrders.length; order += 1) {
            const state = world.kitOrders.state[order] ?? KitOrderState.Inactive;
            if (state !== KitOrderState.Active)
                continue;
            if ((world.kitOrders.faction[order] ?? -1) !== faction)
                continue;
            const target = world.kitOrders.targetBody[order] ?? -1;
            if (target < 0)
                continue;
            for (let resource = 0; resource < data.resources.length; resource += 1) {
                if (data.transportable[resource] !== 1)
                    continue;
                const missing = world.kitOrders.missing(order, resource);
                if (missing <= 0.001)
                    continue;
                this.scanKitOrderResource(data, world, routes, faction, order, target, resource, missing, fuel);
            }
        }
    }
    scanKitOrderResource(data, world, routes, faction, order, target, resource, missing, fuel) {
        const targetSystem = world.bodies.system[target] ?? 0;
        let source = world.factions.firstColony[faction] ?? -1;
        while (source >= 0) {
            if (source !== target) {
                const sourceSystem = world.bodies.system[source] ?? 0;
                const route = routes.find(world.systems, world.gates, sourceSystem, targetSystem);
                if (route.reachable) {
                    const reserve = resource === fuel ? 40 : 0;
                    const sourceStock = Math.max(0, world.stockpiles.get(world.bodies.stockpile[source] ?? 0, resource) - reserve);
                    const targetStockpile = world.bodies.stockpile[target] ?? 0;
                    const targetSpace = world.stockpiles.capacity(targetStockpile, resource) -
                        world.stockpiles.get(targetStockpile, resource);
                    const quantity = Math.max(0, Math.min(sourceStock, targetSpace, missing));
                    if (quantity > 0.001) {
                        const score = ((data.baseValue[resource] ?? 1) * quantity * 3) / Math.max(1, route.travelTicks);
                        this.pushSorted(faction, source, target, sourceSystem, targetSystem, resource, quantity, route.travelTicks, score, order, 1);
                    }
                }
            }
            source = world.bodies.nextInFaction[source] ?? -1;
        }
    }
    pushSorted(faction, sourceBody, targetBody, sourceSystem, targetSystem, resource, quantity, travelTicks, score, kitOrder = -1, compound = 0) {
        if (this.count < this.capacity) {
            this.write(this.count, faction, sourceBody, targetBody, sourceSystem, targetSystem, resource, quantity, travelTicks, score, kitOrder, compound);
            this.count += 1;
            this.bubbleUp(this.count - 1);
            return;
        }
        if (this.compareIncoming(score, sourceBody, targetBody, resource, this.capacity - 1) >= 0)
            return;
        this.write(this.capacity - 1, faction, sourceBody, targetBody, sourceSystem, targetSystem, resource, quantity, travelTicks, score, kitOrder, compound);
        this.bubbleUp(this.capacity - 1);
    }
    bubbleUp(index) {
        let current = index;
        while (current > 0 && this.compareRows(current, current - 1) < 0) {
            this.swap(current, current - 1);
            current -= 1;
        }
    }
    compareRows(a, b) {
        const scoreA = this.score[a] ?? 0;
        const scoreB = this.score[b] ?? 0;
        if (scoreA !== scoreB)
            return scoreA > scoreB ? -1 : 1;
        const sourceA = this.sourceBody[a] ?? 0;
        const sourceB = this.sourceBody[b] ?? 0;
        if (sourceA !== sourceB)
            return sourceA - sourceB;
        const targetA = this.targetBody[a] ?? 0;
        const targetB = this.targetBody[b] ?? 0;
        if (targetA !== targetB)
            return targetA - targetB;
        return (this.resource[a] ?? 0) - (this.resource[b] ?? 0);
    }
    compareIncoming(score, sourceBody, targetBody, resource, row) {
        const rowScore = this.score[row] ?? 0;
        if (score !== rowScore)
            return score > rowScore ? -1 : 1;
        const rowSource = this.sourceBody[row] ?? 0;
        if (sourceBody !== rowSource)
            return sourceBody - rowSource;
        const rowTarget = this.targetBody[row] ?? 0;
        if (targetBody !== rowTarget)
            return targetBody - rowTarget;
        return resource - (this.resource[row] ?? 0);
    }
    write(row, faction, sourceBody, targetBody, sourceSystem, targetSystem, resource, quantity, travelTicks, score, kitOrder, compound) {
        this.faction[row] = faction;
        this.sourceBody[row] = sourceBody;
        this.targetBody[row] = targetBody;
        this.sourceSystem[row] = sourceSystem;
        this.targetSystem[row] = targetSystem;
        this.resource[row] = resource;
        this.quantity[row] = quantity;
        this.travelTicks[row] = travelTicks;
        this.score[row] = score;
        this.reserved[row] = 0;
        this.kitOrder[row] = kitOrder;
        this.compound[row] = compound;
    }
    swap(a, b) {
        swapU16(this.faction, a, b);
        swapU32(this.sourceBody, a, b);
        swapU32(this.targetBody, a, b);
        swapU32(this.sourceSystem, a, b);
        swapU32(this.targetSystem, a, b);
        swapU16(this.resource, a, b);
        swapF64(this.quantity, a, b);
        swapF64(this.travelTicks, a, b);
        swapF64(this.score, a, b);
        swapU8(this.reserved, a, b);
        swapI32(this.kitOrder, a, b);
        swapU8(this.compound, a, b);
    }
}
function researchBidAtCapital(data, world, faction, target, resource) {
    if (researchRemainingAtCapital(data, world, faction, target, resource) <= 0.001)
        return 0;
    return (data.baseValue[resource] ?? 1) * 3;
}
function isScienceDataResource(data, resource) {
    const id = data.resources[resource]?.id;
    return id === "data_physics" || id === "data_engineering" || id === "data_bio";
}
function sourceReserveDays(data, resource) {
    if (data.techs.length === 0)
        return 60;
    if ((data.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0 &&
        data.populationNeeds.comfortOnly[resource] !== 1) {
        return 14;
    }
    return 60;
}
function researchRemainingAtCapital(data, world, faction, target, resource) {
    if ((world.factions.capitalBody[faction] ?? -1) !== target)
        return 0;
    const current = world.techState.currentTech[faction] ?? -1;
    const tech = data.techs[current];
    if (tech === undefined)
        return 0;
    const level = world.techState.level(current, faction);
    const cost = repeatableCostAtLevel(tech, level + 1);
    const id = data.resources[resource]?.id ?? "";
    if (id === "data_physics") {
        return Math.max(0, cost.physics - (world.techState.progressPhysics[faction] ?? 0));
    }
    if (id === "data_engineering") {
        return Math.max(0, cost.engineering - (world.techState.progressEngineering[faction] ?? 0));
    }
    if (id === "data_bio") {
        return Math.max(0, cost.bio - (world.techState.progressBio[faction] ?? 0));
    }
    return 0;
}
function swapU8(values, a, b) {
    const tmp = values[a] ?? 0;
    values[a] = values[b] ?? 0;
    values[b] = tmp;
}
function swapU16(values, a, b) {
    const tmp = values[a] ?? 0;
    values[a] = values[b] ?? 0;
    values[b] = tmp;
}
function swapU32(values, a, b) {
    const tmp = values[a] ?? 0;
    values[a] = values[b] ?? 0;
    values[b] = tmp;
}
function swapI32(values, a, b) {
    const tmp = values[a] ?? 0;
    values[a] = values[b] ?? 0;
    values[b] = tmp;
}
function swapF64(values, a, b) {
    const tmp = values[a] ?? 0;
    values[a] = values[b] ?? 0;
    values[b] = tmp;
}
//# sourceMappingURL=jobboard.js.map