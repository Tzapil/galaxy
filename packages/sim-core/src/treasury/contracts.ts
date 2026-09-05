import { StageOneLogKind } from "../events/log.js";
import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";

export interface ContractSubsidy {
  readonly faction: number;
  readonly targetBody: number;
  readonly resource: number;
  readonly creditsPerUnit: number;
}

export class GovernmentContracts {
  public readonly faction: Int32Array;
  public readonly targetBody: Int32Array;
  public readonly resource: Int32Array;
  public readonly creditsPerUnit: Float64Array;
  public count = 0;

  public constructor(public readonly capacity = 128) {
    this.faction = new Int32Array(capacity);
    this.targetBody = new Int32Array(capacity);
    this.resource = new Int32Array(capacity);
    this.creditsPerUnit = new Float64Array(capacity);
  }

  public clear(): void {
    this.count = 0;
  }

  public add(subsidy: ContractSubsidy): boolean {
    if (this.count >= this.capacity) return false;
    this.faction[this.count] = subsidy.faction;
    this.targetBody[this.count] = subsidy.targetBody;
    this.resource[this.count] = subsidy.resource;
    this.creditsPerUnit[this.count] = subsidy.creditsPerUnit;
    this.count += 1;
    return true;
  }

  public subsidyFor(faction: number, targetBody: number, resource: number): number {
    let best = 0;
    for (let i = 0; i < this.count; i += 1) {
      if (
        (this.faction[i] ?? -1) === faction &&
        (this.targetBody[i] ?? -1) === targetBody &&
        (this.resource[i] ?? -1) === resource
      ) {
        best = Math.max(best, this.creditsPerUnit[i] ?? 0);
      }
    }
    return best;
  }
}

export function payContractSubsidy(
  data: StageOneData,
  world: StageOneWorld,
  contracts: GovernmentContracts | undefined,
  faction: number,
  targetBody: number,
  resource: number,
  amount: number,
  tick: number
): number {
  const creditsPerUnit = contracts?.subsidyFor(faction, targetBody, resource) ?? 0;
  const credits = Math.max(0, creditsPerUnit * amount);
  if (credits <= 0) return 0;
  world.factions.treasury[faction] = (world.factions.treasury[faction] ?? 0) - credits;
  world.eventLog.append(
    tick,
    StageOneLogKind.ContractSubsidyPaid,
    world.bodies.system[targetBody] ?? -1,
    targetBody,
    faction,
    resource,
    credits
  );
  void data;
  return credits;
}
