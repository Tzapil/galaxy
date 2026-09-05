export interface RngSnapshot {
    readonly rootSeed: number;
    readonly stream: number;
    readonly s0: number;
    readonly s1: number;
    readonly s2: number;
    readonly s3: number;
}
export declare class Rng {
    private readonly rootSeed;
    private readonly stream;
    private s0;
    private s1;
    private s2;
    private s3;
    private constructor();
    static fromSeed(seed: number): Rng;
    static deserialize(snapshot: RngSnapshot): Rng;
    derive(label: string): Rng;
    serialize(): RngSnapshot;
    nextU32(): number;
    nextFloat(): number;
    nextInt(minInclusive: number, maxExclusive: number): number;
    shuffle<T>(items: T[]): T[];
    private static fromMixedSeed;
}
//# sourceMappingURL=rng.d.ts.map