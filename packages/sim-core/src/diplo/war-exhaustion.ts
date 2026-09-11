import type { StageOneWorld } from "../world/state.js";
import { WarState } from "../war/state.js";

export const MAX_WAR_EXHAUSTION = 100;
export const WAR_EXHAUSTION_TENSION_WEIGHT = 8;

export interface WarCost {
  readonly shipsLost: number;
  readonly populationLost: number;
  readonly creditsSpent: number;
}

/** Losses and expenditure accumulate into a bounded value suitable for 10k-year saves. */
export function recordWarCost(world: StageOneWorld, faction: number, cost: WarCost): number {
  const delta =
    Math.max(0, cost.shipsLost) * 1.5 +
    Math.max(0, cost.populationLost) * 0.01 +
    Math.max(0, cost.creditsSpent) / 25_000;
  const next = clamp((world.factionDynamics.warExhaustion[faction] ?? 0) + delta, 0, 100);
  world.factionDynamics.warExhaustion[faction] = next;
  return next;
}

/** Daily attrition while fighting and recovery in peace; no wall-clock time is consulted. */
export function advanceWarExhaustion(world: StageOneWorld): void {
  for (let faction = 0; faction < world.factions.length; faction += 1) {
    if (world.factionDynamics.alive[faction] !== 1) continue;
    const current = world.factionDynamics.warExhaustion[faction] ?? 0;
    const next = activeWarCount(world, faction) > 0 ? current + 0.0025 : current - 0.01;
    world.factionDynamics.warExhaustion[faction] = clamp(next, 0, MAX_WAR_EXHAUSTION);
  }
}

export function activeWarCount(world: StageOneWorld, faction: number): number {
  let count = 0;
  for (let war = 0; war < world.wars.length; war += 1) {
    if (world.wars.state[war] !== WarState.Active) continue;
    if (
      (world.wars.attacker[war] ?? -1) === faction ||
      (world.wars.defender[war] ?? -1) === faction
    ) {
      count += 1;
    }
  }
  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
