import { chooseUtilityOption, personalityWeightsForFaction } from "../ai/utility.js";
import type { EntityRef } from "../entity/ids.js";
import { StageOneLogKind } from "../events/log.js";
import { FleetState } from "../fleet/fleet.js";
import { FleetOrder, issueFleetOrder } from "../fleet/orders.js";
import type { StageOneWorld } from "../world/state.js";

export const enum BlockadeReaction {
  BreakWithFleet = 1,
  EscortConvoys = 2,
  RerouteEconomy = 3
}

export interface BlockadePressure {
  readonly blockadeFleetStrength: number;
  readonly availableFleetStrength: number;
  readonly exposedCargoValue: number;
  readonly escortCapacity: number;
  readonly detourCost: number;
  readonly replacementIndustryCost: number;
}

export interface BlockadeReactionChoice {
  readonly reaction: BlockadeReaction;
  readonly score: number;
  readonly reason: string;
}

/** A blockade is an edge status, not a battle (spec 9.7). */
export function establishBlockade(
  world: StageOneWorld,
  fleet: EntityRef,
  gate: number,
  tick: number
): boolean {
  if (!world.fleets.isAlive(fleet) || world.fleets.state[fleet.index] !== FleetState.Active) {
    return false;
  }
  const system = world.fleets.currentSystem[fleet.index] ?? -1;
  if (system !== (world.gates.from[gate] ?? -2) && system !== (world.gates.to[gate] ?? -3)) {
    return false;
  }
  const owner = world.fleets.owner[fleet.index] ?? -1;
  issueFleetOrder(world, fleet, FleetOrder.Blockade, world.gates.to[gate] ?? -1);
  world.gates.blockadedBy[gate] = owner;
  const reverse = reverseGate(world, gate);
  if (reverse >= 0) world.gates.blockadedBy[reverse] = owner;
  world.eventLog.append(
    tick,
    StageOneLogKind.BlockadeStarted,
    world.gates.from[gate] ?? -1,
    -1,
    fleet.index,
    gate,
    owner
  );
  return true;
}

export function clearBlockade(world: StageOneWorld, gate: number, tick: number): boolean {
  const owner = world.gates.blockadedBy[gate] ?? -1;
  if (owner < 0) return false;
  world.gates.blockadedBy[gate] = -1;
  const reverse = reverseGate(world, gate);
  if (reverse >= 0 && (world.gates.blockadedBy[reverse] ?? -1) === owner) {
    world.gates.blockadedBy[reverse] = -1;
  }
  world.eventLog.append(
    tick,
    StageOneLogKind.BlockadeEnded,
    world.gates.from[gate] ?? -1,
    -1,
    owner,
    gate,
    0
  );
  return true;
}

export function chooseBlockadeReaction(
  world: StageOneWorld,
  faction: number,
  gate: number,
  pressure: BlockadePressure,
  tick: number
): BlockadeReactionChoice {
  const weights = personalityWeightsForFaction(world.data, world, faction);
  const breakScore =
    pressure.availableFleetStrength / Math.max(1, pressure.blockadeFleetStrength) +
    pressure.exposedCargoValue * 0.002;
  const escortScore =
    pressure.escortCapacity / Math.max(1, pressure.blockadeFleetStrength) +
    pressure.exposedCargoValue * 0.0015;
  const rerouteScore =
    pressure.exposedCargoValue /
    Math.max(1, pressure.detourCost + pressure.replacementIndustryCost);
  const choice = chooseUtilityOption(weights, [
    {
      value: BlockadeReaction.BreakWithFleet,
      baseScore: breakScore,
      axis: "military",
      tieBreak: 1
    },
    {
      value: BlockadeReaction.EscortConvoys,
      baseScore: escortScore,
      axis: "logistics",
      tieBreak: 2
    },
    {
      value: BlockadeReaction.RerouteEconomy,
      baseScore: rerouteScore,
      axis: "industry",
      tieBreak: 3
    }
  ]);
  const reaction = choice?.value ?? BlockadeReaction.RerouteEconomy;
  const score = choice?.score ?? 0;
  const reason = reactionReason(reaction, pressure, score);
  world.eventLog.append(
    tick,
    StageOneLogKind.BlockadeResponse,
    world.gates.from[gate] ?? -1,
    -1,
    faction,
    gate,
    reaction
  );
  return { reaction, score, reason };
}

function reverseGate(world: StageOneWorld, gate: number): number {
  const from = world.gates.from[gate] ?? -1;
  const to = world.gates.to[gate] ?? -1;
  for (let candidate = 0; candidate < world.gates.length; candidate += 1) {
    if ((world.gates.from[candidate] ?? -2) === to && (world.gates.to[candidate] ?? -3) === from) {
      return candidate;
    }
  }
  return -1;
}

function reactionReason(
  reaction: BlockadeReaction,
  pressure: BlockadePressure,
  score: number
): string {
  if (reaction === BlockadeReaction.BreakWithFleet) {
    return `break blockade: fleet ratio ${(pressure.availableFleetStrength / Math.max(1, pressure.blockadeFleetStrength)).toFixed(2)}, utility ${score.toFixed(2)}`;
  }
  if (reaction === BlockadeReaction.EscortConvoys) {
    return `escort convoys: cargo ${pressure.exposedCargoValue.toFixed(1)}, escort ${pressure.escortCapacity.toFixed(1)}, utility ${score.toFixed(2)}`;
  }
  return `reroute industry: detour ${pressure.detourCost.toFixed(1)}, replacement ${pressure.replacementIndustryCost.toFixed(1)}, utility ${score.toFixed(2)}`;
}
