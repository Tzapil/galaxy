export function reserveInputs(stockpiles, stockpile, inputs) {
    const missing = stockpiles.canReserveAll(stockpile, inputs);
    if (missing >= 0)
        return missing;
    for (let i = 0; i < inputs.length; i += 1) {
        const input = inputs[i];
        if (input === undefined)
            throw new RangeError("Recipe input is inconsistent.");
        if (!stockpiles.remove(stockpile, input.resource, input.amount)) {
            throw new RangeError("Whole-batch reservation changed while applying it.");
        }
    }
    return -1;
}
export function firstOutputWithoutSpace(stockpiles, stockpile, outputs) {
    return stockpiles.canFitAll(stockpile, outputs);
}
//# sourceMappingURL=reserve.js.map