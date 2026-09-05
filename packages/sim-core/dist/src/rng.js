export class Rng {
    rootSeed;
    stream;
    s0;
    s1;
    s2;
    s3;
    constructor(rootSeed, stream, s0, s1, s2, s3) {
        this.rootSeed = rootSeed;
        this.stream = stream;
        this.s0 = s0;
        this.s1 = s1;
        this.s2 = s2;
        this.s3 = s3;
    }
    static fromSeed(seed) {
        return Rng.fromMixedSeed(seed >>> 0, 0);
    }
    static deserialize(snapshot) {
        return new Rng(snapshot.rootSeed >>> 0, snapshot.stream >>> 0, snapshot.s0 >>> 0, snapshot.s1 >>> 0, snapshot.s2 >>> 0, snapshot.s3 >>> 0);
    }
    derive(label) {
        const labelHash = hashString32(label);
        const mixedRoot = mix32(this.rootSeed ^ labelHash ^ 0x9e3779b9);
        const mixedStream = mix32(this.stream + labelHash + 0x85ebca6b);
        return Rng.fromMixedSeed(mixedRoot, mixedStream);
    }
    serialize() {
        return {
            rootSeed: this.rootSeed,
            stream: this.stream,
            s0: this.s0,
            s1: this.s1,
            s2: this.s2,
            s3: this.s3
        };
    }
    nextU32() {
        const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
        const t = (this.s1 << 9) >>> 0;
        this.s2 = (this.s2 ^ this.s0) >>> 0;
        this.s3 = (this.s3 ^ this.s1) >>> 0;
        this.s1 = (this.s1 ^ this.s2) >>> 0;
        this.s0 = (this.s0 ^ this.s3) >>> 0;
        this.s2 = (this.s2 ^ t) >>> 0;
        this.s3 = rotl(this.s3, 11);
        return result;
    }
    nextFloat() {
        return this.nextU32() / 0x100000000;
    }
    nextInt(minInclusive, maxExclusive) {
        if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
            throw new RangeError("nextInt bounds must be integers.");
        }
        if (maxExclusive <= minInclusive) {
            throw new RangeError("nextInt requires maxExclusive > minInclusive.");
        }
        const range = maxExclusive - minInclusive;
        return minInclusive + (this.nextU32() % range);
    }
    shuffle(items) {
        for (let i = items.length - 1; i > 0; i -= 1) {
            const j = this.nextInt(0, i + 1);
            const tmp = items[i];
            items[i] = items[j];
            items[j] = tmp;
        }
        return items;
    }
    static fromMixedSeed(rootSeed, stream) {
        let state = mix32(rootSeed ^ stream ^ 0xa0761d65);
        const s0 = splitMix32Next(state);
        state = s0.nextState;
        const s1 = splitMix32Next(state);
        state = s1.nextState;
        const s2 = splitMix32Next(state);
        state = s2.nextState;
        const s3 = splitMix32Next(state);
        if ((s0.value | s1.value | s2.value | s3.value) === 0) {
            return new Rng(rootSeed >>> 0, stream >>> 0, 0x6d2b79f5, 0x1b56c4e9, 0x85ebca6b, 0xc2b2ae35);
        }
        return new Rng(rootSeed >>> 0, stream >>> 0, s0.value, s1.value, s2.value, s3.value);
    }
}
function rotl(value, shift) {
    return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}
function splitMix32Next(state) {
    const nextState = (state + 0x9e3779b9) >>> 0;
    return { value: mix32(nextState), nextState };
}
function mix32(value) {
    let x = value >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}
function hashString32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i) & 0xff;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}
//# sourceMappingURL=rng.js.map