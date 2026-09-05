import { BodyType } from "./bodies.js";
export interface SlotRange {
    readonly min: number;
    readonly max: number;
}
export declare function slotRangeForBody(type: BodyType, habitability: number): SlotRange;
export declare function totalSlotsForBody(type: BodyType, size: number, habitability: number): number;
export declare function freeSlots(totalSlots: number, usedSlots: number): number;
//# sourceMappingURL=slots.d.ts.map