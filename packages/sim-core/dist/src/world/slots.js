import { BodyType } from "./bodies.js";
export function slotRangeForBody(type, habitability) {
    if (type === BodyType.Station)
        return { min: 4, max: 10 };
    if (type === BodyType.Comet)
        return { min: 5, max: 12 };
    if (type === BodyType.GasGiant)
        return { min: 4, max: 10 };
    if (type === BodyType.AsteroidBelt)
        return { min: 6, max: 14 };
    if (habitability >= 0.7)
        return { min: 12, max: 26 };
    return { min: 8, max: 18 };
}
export function totalSlotsForBody(type, size, habitability) {
    const range = slotRangeForBody(type, habitability);
    const normalizedSize = Math.max(0, Math.min(1, size));
    return Math.round(range.min + (range.max - range.min) * normalizedSize);
}
export function freeSlots(totalSlots, usedSlots) {
    return Math.max(0, totalSlots - usedSlots);
}
//# sourceMappingURL=slots.js.map