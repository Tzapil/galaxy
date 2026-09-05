import type { ResourceAmount } from "../stage-one/data.js";
import type { Stockpiles } from "../world/stockpiles.js";

export function reserveInputs(
  stockpiles: Stockpiles,
  stockpile: number,
  inputs: readonly ResourceAmount[]
): number {
  const missing = stockpiles.canReserveAll(stockpile, inputs);
  if (missing >= 0) return missing;
  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    if (input === undefined) throw new RangeError("Recipe input is inconsistent.");
    if (!stockpiles.remove(stockpile, input.resource, input.amount)) {
      throw new RangeError("Whole-batch reservation changed while applying it.");
    }
  }
  return -1;
}

export function firstOutputWithoutSpace(
  stockpiles: Stockpiles,
  stockpile: number,
  outputs: readonly ResourceAmount[]
): number {
  return stockpiles.canFitAll(stockpile, outputs);
}
