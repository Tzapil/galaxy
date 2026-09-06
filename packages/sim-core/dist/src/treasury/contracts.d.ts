import type { StageOneData } from "../stage-one/data.js";
import type { StageOneWorld } from "../world/state.js";
export interface ContractSubsidy {
    readonly faction: number;
    readonly targetBody: number;
    readonly resource: number;
    readonly creditsPerUnit: number;
}
export declare class GovernmentContracts {
    readonly capacity: number;
    readonly faction: Int32Array;
    readonly targetBody: Int32Array;
    readonly resource: Int32Array;
    readonly creditsPerUnit: Float64Array;
    count: number;
    constructor(capacity?: number);
    clear(): void;
    add(subsidy: ContractSubsidy): boolean;
    subsidyFor(faction: number, targetBody: number, resource: number): number;
}
export declare function payContractSubsidy(_data: StageOneData, world: StageOneWorld, contracts: GovernmentContracts | undefined, faction: number, targetBody: number, resource: number, amount: number, tick: number): number;
//# sourceMappingURL=contracts.d.ts.map