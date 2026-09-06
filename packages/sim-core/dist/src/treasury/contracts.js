import { StageOneLogKind } from "../events/log.js";
import { TREASURY_DEBT_FLOOR } from "./treasury.js";
export class GovernmentContracts {
    capacity;
    faction;
    targetBody;
    resource;
    creditsPerUnit;
    count = 0;
    constructor(capacity = 128) {
        this.capacity = capacity;
        this.faction = new Int32Array(capacity);
        this.targetBody = new Int32Array(capacity);
        this.resource = new Int32Array(capacity);
        this.creditsPerUnit = new Float64Array(capacity);
    }
    clear() {
        this.count = 0;
    }
    add(subsidy) {
        if (this.count >= this.capacity)
            return false;
        this.faction[this.count] = subsidy.faction;
        this.targetBody[this.count] = subsidy.targetBody;
        this.resource[this.count] = subsidy.resource;
        this.creditsPerUnit[this.count] = subsidy.creditsPerUnit;
        this.count += 1;
        return true;
    }
    subsidyFor(faction, targetBody, resource) {
        let best = 0;
        for (let i = 0; i < this.count; i += 1) {
            if ((this.faction[i] ?? -1) === faction &&
                (this.targetBody[i] ?? -1) === targetBody &&
                (this.resource[i] ?? -1) === resource) {
                best = Math.max(best, this.creditsPerUnit[i] ?? 0);
            }
        }
        return best;
    }
}
export function payContractSubsidy(_data, world, contracts, faction, targetBody, resource, amount, tick) {
    const creditsPerUnit = contracts?.subsidyFor(faction, targetBody, resource) ?? 0;
    const credits = Math.max(0, creditsPerUnit * amount);
    if (credits <= 0)
        return 0;
    const treasury = world.factions.treasury[faction] ?? 0;
    const payable = Math.min(credits, Math.max(0, treasury - TREASURY_DEBT_FLOOR));
    if (payable <= 0)
        return 0;
    world.factions.treasury[faction] = treasury - payable;
    world.eventLog.append(tick, StageOneLogKind.ContractSubsidyPaid, world.bodies.system[targetBody] ?? -1, targetBody, faction, resource, payable);
    return payable;
}
//# sourceMappingURL=contracts.js.map