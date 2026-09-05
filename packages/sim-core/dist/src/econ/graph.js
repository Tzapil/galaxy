export const LABOR_VALUE = 0.5;
export const ENERGY_SOLAR_SEED_VALUE = 0.5 / 15;
export var EconProducerKind;
(function (EconProducerKind) {
    EconProducerKind[EconProducerKind["Batch"] = 1] = "Batch";
    EconProducerKind[EconProducerKind["Continuous"] = 2] = "Continuous";
})(EconProducerKind || (EconProducerKind = {}));
export var EconConsumerKind;
(function (EconConsumerKind) {
    EconConsumerKind[EconConsumerKind["Batch"] = 1] = "Batch";
    EconConsumerKind[EconConsumerKind["Continuous"] = 2] = "Continuous";
    EconConsumerKind[EconConsumerKind["Population"] = 3] = "Population";
    EconConsumerKind[EconConsumerKind["Sink"] = 4] = "Sink";
})(EconConsumerKind || (EconConsumerKind = {}));
export function buildEconGraph(input, baseValue) {
    const producedEdges = [];
    const consumedEdges = [];
    const sinkConsumes = new Uint8Array(input.resources.length);
    for (let recipeIndex = 0; recipeIndex < input.batchRecipes.length; recipeIndex += 1) {
        const recipe = must(input.batchRecipes[recipeIndex], "batch recipe");
        pushConsumers(consumedEdges, recipe.inputs, EconConsumerKind.Batch, recipeIndex);
        pushProducers(producedEdges, recipe.outputs, EconProducerKind.Batch, recipeIndex);
    }
    for (let processIndex = 0; processIndex < input.continuous.length; processIndex += 1) {
        const process = must(input.continuous[processIndex], "continuous process");
        pushConsumers(consumedEdges, process.inputsPerTick, EconConsumerKind.Continuous, processIndex);
        pushProducers(producedEdges, process.outputsPerTick, EconProducerKind.Continuous, processIndex);
    }
    for (let resource = 0; resource < input.resources.length; resource += 1) {
        if ((input.populationNeeds.perThousandPopPerDay[resource] ?? 0) > 0) {
            consumedEdges.push({
                resource,
                kind: EconConsumerKind.Population,
                recipe: -1
            });
        }
    }
    for (let sinkIndex = 0; sinkIndex < input.sinks.length; sinkIndex += 1) {
        const sink = must(input.sinks[sinkIndex], "sink");
        for (let i = 0; i < sink.consumes.length; i += 1) {
            const resource = sink.consumes[i] ?? 0;
            sinkConsumes[resource] = 1;
            consumedEdges.push({
                resource,
                kind: EconConsumerKind.Sink,
                recipe: sinkIndex
            });
        }
    }
    producedEdges.sort(edgeOrder);
    consumedEdges.sort(edgeOrder);
    const producedByStart = startsFor(input.resources.length, producedEdges);
    const producedByCount = countsFor(input.resources.length, producedEdges);
    const consumedByStart = startsFor(input.resources.length, consumedEdges);
    const consumedByCount = countsFor(input.resources.length, consumedEdges);
    return {
        producedByStart,
        producedByCount,
        producedByRecipe: Int32Array.from(producedEdges.map((edge) => edge.recipe)),
        producedByKind: Uint8Array.from(producedEdges.map((edge) => edge.kind)),
        consumedByStart,
        consumedByCount,
        consumedByRecipe: Int32Array.from(consumedEdges.map((edge) => edge.recipe)),
        consumedByKind: Uint8Array.from(consumedEdges.map((edge) => edge.kind)),
        chainDepth: computeChainDepth(input),
        sinkConsumes,
        materialCycleCount: countCycles(input, false),
        energyCycleCount: countCycles(input, true),
        energyCostShareMin: computeEnergyCostShareMin(input, baseValue)
    };
}
export function computeBaseValues(input) {
    const values = new Float64Array(input.resources.length);
    for (let i = 0; i < values.length; i += 1)
        values[i] = Number.POSITIVE_INFINITY;
    values[input.energyResource] = ENERGY_SOLAR_SEED_VALUE;
    for (let pass = 0; pass < 200; pass += 1) {
        let changed = false;
        for (let resource = 0; resource < input.resources.length; resource += 1) {
            let best = values[resource] ?? Number.POSITIVE_INFINITY;
            for (let recipeIndex = 0; recipeIndex < input.batchRecipes.length; recipeIndex += 1) {
                const recipe = must(input.batchRecipes[recipeIndex], "batch recipe");
                if (!bagHasResource(recipe.outputs, resource))
                    continue;
                const cost = recipeUnitCost(recipe.inputs, recipe.outputs, resource, recipe.workers, recipe.durationTicks, values);
                if (cost < best - 1e-9)
                    best = cost;
            }
            for (let processIndex = 0; processIndex < input.continuous.length; processIndex += 1) {
                const process = must(input.continuous[processIndex], "continuous process");
                if (!bagHasResource(process.outputsPerTick, resource))
                    continue;
                const cost = recipeUnitCost(process.inputsPerTick, process.outputsPerTick, resource, process.workers, 1, values);
                if (cost < best - 1e-9)
                    best = cost;
            }
            if (best < (values[resource] ?? Number.POSITIVE_INFINITY) - 1e-9) {
                values[resource] = best;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return values;
}
export function recipeUnitCost(inputs, outputs, outputResource, workers, durationTicks, values) {
    let cost = workers * Math.max(1, durationTicks) * LABOR_VALUE;
    for (let i = 0; i < inputs.length; i += 1) {
        const input = must(inputs[i], "recipe input");
        const value = values[input.resource] ?? Number.POSITIVE_INFINITY;
        if (!Number.isFinite(value))
            return Number.POSITIVE_INFINITY;
        cost += value * input.amount;
    }
    const output = bagAmount(outputs, outputResource);
    return output > 0 ? cost / output : Number.POSITIVE_INFINITY;
}
export function explodeToRaw(input, values, resource, amount, out) {
    const guard = new Uint8Array(input.resources.length);
    explodeRecursive(input, values, resource, amount, out, guard);
}
function explodeRecursive(input, values, resource, amount, out, guard) {
    const metadata = input.resources[resource];
    if (metadata === undefined)
        throw new RangeError("Resource index is invalid.");
    if (metadata.category === "raw") {
        out[resource] = (out[resource] ?? 0) + amount;
        return;
    }
    if (resource === input.energyResource || guard[resource] === 1)
        return;
    const best = bestProducerFor(input, values, resource);
    if (best.recipe < 0)
        return;
    guard[resource] = 1;
    const inputs = best.kind === EconProducerKind.Batch
        ? must(input.batchRecipes[best.recipe], "batch recipe").inputs
        : must(input.continuous[best.recipe], "continuous process").inputsPerTick;
    const outputs = best.kind === EconProducerKind.Batch
        ? must(input.batchRecipes[best.recipe], "batch recipe").outputs
        : must(input.continuous[best.recipe], "continuous process").outputsPerTick;
    const outputAmount = Math.max(0.000001, bagAmount(outputs, resource));
    for (let i = 0; i < inputs.length; i += 1) {
        const item = must(inputs[i], "recipe input");
        explodeRecursive(input, values, item.resource, (item.amount / outputAmount) * amount, out, guard);
    }
    guard[resource] = 0;
}
function bestProducerFor(input, values, resource) {
    let bestKind = EconProducerKind.Batch;
    let bestRecipe = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let recipeIndex = 0; recipeIndex < input.batchRecipes.length; recipeIndex += 1) {
        const recipe = must(input.batchRecipes[recipeIndex], "batch recipe");
        if (!bagHasResource(recipe.outputs, resource))
            continue;
        const cost = recipeUnitCost(recipe.inputs, recipe.outputs, resource, recipe.workers, recipe.durationTicks, values);
        if (cost < bestCost) {
            bestCost = cost;
            bestKind = EconProducerKind.Batch;
            bestRecipe = recipeIndex;
        }
    }
    for (let processIndex = 0; processIndex < input.continuous.length; processIndex += 1) {
        const process = must(input.continuous[processIndex], "continuous process");
        if (!bagHasResource(process.outputsPerTick, resource))
            continue;
        const cost = recipeUnitCost(process.inputsPerTick, process.outputsPerTick, resource, process.workers, 1, values);
        if (cost < bestCost) {
            bestCost = cost;
            bestKind = EconProducerKind.Continuous;
            bestRecipe = processIndex;
        }
    }
    return { kind: bestKind, recipe: bestRecipe };
}
function computeChainDepth(input) {
    const depth = new Uint16Array(input.resources.length);
    const visiting = new Uint8Array(input.resources.length);
    const visited = new Uint8Array(input.resources.length);
    for (let resource = 0; resource < input.resources.length; resource += 1) {
        depth[resource] = chainDepthFor(input, resource, depth, visiting, visited);
    }
    return depth;
}
function chainDepthFor(input, resource, depth, visiting, visited) {
    if (visited[resource] === 1)
        return depth[resource] ?? 0;
    if (visiting[resource] === 1)
        return 0;
    visiting[resource] = 1;
    let maxDepth = 0;
    for (let recipeIndex = 0; recipeIndex < input.batchRecipes.length; recipeIndex += 1) {
        const recipe = must(input.batchRecipes[recipeIndex], "batch recipe");
        if (!bagHasResource(recipe.outputs, resource))
            continue;
        for (let i = 0; i < recipe.inputs.length; i += 1) {
            const dependency = must(recipe.inputs[i], "recipe input").resource;
            if (dependency === input.energyResource)
                continue;
            maxDepth = Math.max(maxDepth, chainDepthFor(input, dependency, depth, visiting, visited) + 1);
        }
    }
    visiting[resource] = 0;
    visited[resource] = 1;
    depth[resource] = maxDepth;
    return maxDepth;
}
function countCycles(input, wantsEnergyCycle) {
    const color = new Uint8Array(input.resources.length);
    const stack = new Int32Array(input.resources.length + 1);
    let cycles = 0;
    for (let resource = 0; resource < input.resources.length; resource += 1) {
        if (color[resource] === 0)
            cycles += dfsCycles(input, resource, color, stack, 0, wantsEnergyCycle);
    }
    return cycles;
}
function dfsCycles(input, resource, color, stack, depth, wantsEnergyCycle) {
    color[resource] = 1;
    stack[depth] = resource;
    let cycles = 0;
    for (let recipeIndex = 0; recipeIndex < input.batchRecipes.length; recipeIndex += 1) {
        const recipe = must(input.batchRecipes[recipeIndex], "batch recipe");
        if (!bagHasResource(recipe.outputs, resource))
            continue;
        cycles += dfsCycleBag(input, recipe.inputs, color, stack, depth, wantsEnergyCycle);
    }
    for (let processIndex = 0; processIndex < input.continuous.length; processIndex += 1) {
        const process = must(input.continuous[processIndex], "continuous process");
        if (!bagHasResource(process.outputsPerTick, resource))
            continue;
        cycles += dfsCycleBag(input, process.inputsPerTick, color, stack, depth, wantsEnergyCycle);
    }
    color[resource] = 2;
    return cycles;
}
function dfsCycleBag(input, inputs, color, stack, depth, wantsEnergyCycle) {
    let cycles = 0;
    for (let i = 0; i < inputs.length; i += 1) {
        const dependency = must(inputs[i], "recipe input").resource;
        const colorValue = color[dependency] ?? 0;
        if (colorValue === 1) {
            const hasEnergy = stackContains(stack, depth, input.energyResource) || dependency === input.energyResource;
            if (hasEnergy === wantsEnergyCycle)
                cycles += 1;
        }
        else if (colorValue === 0) {
            cycles += dfsCycles(input, dependency, color, stack, depth + 1, wantsEnergyCycle);
        }
    }
    return cycles;
}
function computeEnergyCostShareMin(input, values) {
    let minShare = Number.POSITIVE_INFINITY;
    for (let recipeIndex = 0; recipeIndex < input.batchRecipes.length; recipeIndex += 1) {
        const recipe = must(input.batchRecipes[recipeIndex], "batch recipe");
        let energyCost = 0;
        let total = recipe.workers * recipe.durationTicks * LABOR_VALUE;
        for (let i = 0; i < recipe.inputs.length; i += 1) {
            const item = must(recipe.inputs[i], "recipe input");
            const cost = (values[item.resource] ?? 0) * item.amount;
            total += cost;
            if (item.resource === input.energyResource)
                energyCost += cost;
        }
        if (energyCost > 0 && total > 0)
            minShare = Math.min(minShare, energyCost / total);
    }
    return Number.isFinite(minShare) ? minShare : 0;
}
function pushProducers(edges, bag, kind, recipe) {
    for (let i = 0; i < bag.length; i += 1) {
        edges.push({ resource: must(bag[i], "producer output").resource, kind, recipe });
    }
}
function pushConsumers(edges, bag, kind, recipe) {
    for (let i = 0; i < bag.length; i += 1) {
        edges.push({ resource: must(bag[i], "consumer input").resource, kind, recipe });
    }
}
function startsFor(resourceCount, edges) {
    const starts = new Int32Array(resourceCount);
    starts.fill(-1);
    for (let i = 0; i < edges.length; i += 1) {
        const resource = edges[i]?.resource ?? -1;
        if (resource >= 0 && (starts[resource] ?? -1) < 0)
            starts[resource] = i;
    }
    return starts;
}
function countsFor(resourceCount, edges) {
    const counts = new Uint16Array(resourceCount);
    for (let i = 0; i < edges.length; i += 1) {
        const resource = edges[i]?.resource ?? -1;
        if (resource >= 0)
            counts[resource] = (counts[resource] ?? 0) + 1;
    }
    return counts;
}
function edgeOrder(a, b) {
    if (a.resource !== b.resource)
        return a.resource - b.resource;
    if (a.kind !== b.kind)
        return a.kind - b.kind;
    return a.recipe - b.recipe;
}
function bagHasResource(bag, resource) {
    for (let i = 0; i < bag.length; i += 1) {
        if ((bag[i]?.resource ?? -1) === resource)
            return true;
    }
    return false;
}
function bagAmount(bag, resource) {
    for (let i = 0; i < bag.length; i += 1) {
        const item = bag[i];
        if (item?.resource === resource)
            return item.amount;
    }
    return 0;
}
function stackContains(stack, depth, resource) {
    for (let i = 0; i <= depth; i += 1) {
        if (stack[i] === resource)
            return true;
    }
    return false;
}
function must(value, label) {
    if (value === undefined)
        throw new RangeError(`Missing ${label}.`);
    return value;
}
//# sourceMappingURL=graph.js.map