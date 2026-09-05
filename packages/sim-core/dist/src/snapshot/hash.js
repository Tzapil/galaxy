import { writeStateSnapshot } from "./write.js";
const MASK_64 = (1n << 64n) - 1n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_OFFSET_A = 0xcbf29ce484222325n;
const FNV64_OFFSET_B = 0x84222325cbf29ce4n;
export function hashState(state) {
    return hashBytes128(new Uint8Array(writeStateSnapshot(state)));
}
export function hashBuffer128(buffer) {
    return hashBytes128(new Uint8Array(buffer));
}
export function hashBytes128(bytes) {
    let a = FNV64_OFFSET_A;
    let b = FNV64_OFFSET_B;
    for (let i = 0; i < bytes.length; i += 1) {
        const value = BigInt(bytes[i] ?? 0);
        a ^= value;
        a = (a * FNV64_PRIME) & MASK_64;
        b ^= value + BigInt((i * 131) & 0xff);
        b = (b * FNV64_PRIME) & MASK_64;
    }
    return toHex64(a) + toHex64(b);
}
function toHex64(value) {
    return value.toString(16).padStart(16, "0");
}
//# sourceMappingURL=hash.js.map