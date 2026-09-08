export interface LinearProgram {
    readonly objective: readonly number[];
    readonly constraints: readonly (readonly number[])[];
    readonly limits: readonly number[];
}
export interface LinearProgramSolution {
    readonly feasible: boolean;
    readonly objectiveValue: number;
    readonly values: readonly number[];
    readonly iterations: number;
}
export declare function solveLinearProgram(program: LinearProgram): LinearProgramSolution;
//# sourceMappingURL=lp.d.ts.map