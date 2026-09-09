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

export function solveLinearProgram(program: LinearProgram): LinearProgramSolution {
  const variables = program.objective.length;
  const constraints = program.constraints.length;
  if (variables === 0) {
    return { feasible: true, objectiveValue: 0, values: [], iterations: 0 };
  }
  const width = variables + constraints + 1;
  const height = constraints + 1;
  const tableau = new Float64Array(width * height);

  for (let row = 0; row < constraints; row += 1) {
    const limit = program.limits[row] ?? 0;
    if (limit < -1e-9) return infeasible(variables);
    const constraint = program.constraints[row] ?? [];
    for (let col = 0; col < variables; col += 1) {
      tableau[row * width + col] = Math.max(0, constraint[col] ?? 0);
    }
    tableau[row * width + variables + row] = 1;
    tableau[row * width + width - 1] = Math.max(0, limit);
  }

  const objectiveRow = constraints * width;
  for (let col = 0; col < variables; col += 1) {
    tableau[objectiveRow + col] = -(program.objective[col] ?? 0);
  }

  let iterations = 0;
  while (iterations < 256) {
    const entering = chooseEntering(tableau, objectiveRow, variables);
    if (entering < 0) break;
    const leaving = chooseLeaving(tableau, width, constraints, entering);
    if (leaving < 0) break;
    pivot(tableau, width, height, leaving, entering);
    iterations += 1;
  }

  const values = new Array<number>(variables).fill(0);
  for (let col = 0; col < variables; col += 1) {
    const row = basicRowFor(tableau, width, constraints, col);
    values[col] = row >= 0 ? (tableau[row * width + width - 1] ?? 0) : 0;
  }
  return {
    feasible: true,
    objectiveValue: tableau[objectiveRow + width - 1] ?? 0,
    values,
    iterations
  };
}

function chooseEntering(tableau: Float64Array, objectiveRow: number, variables: number): number {
  for (let col = 0; col < variables; col += 1) {
    if ((tableau[objectiveRow + col] ?? 0) < -1e-9) return col;
  }
  return -1;
}

function chooseLeaving(
  tableau: Float64Array,
  width: number,
  constraints: number,
  entering: number
): number {
  let bestRow = -1;
  let bestRatio = Number.POSITIVE_INFINITY;
  for (let row = 0; row < constraints; row += 1) {
    const coefficient = tableau[row * width + entering] ?? 0;
    if (coefficient <= 1e-9) continue;
    const ratio = (tableau[row * width + width - 1] ?? 0) / coefficient;
    if (ratio < bestRatio - 1e-9) {
      bestRatio = ratio;
      bestRow = row;
    }
  }
  return bestRow;
}

function pivot(
  tableau: Float64Array,
  width: number,
  height: number,
  pivotRow: number,
  pivotCol: number
): void {
  const pivotValue = tableau[pivotRow * width + pivotCol] ?? 1;
  for (let col = 0; col < width; col += 1) {
    tableau[pivotRow * width + col] = (tableau[pivotRow * width + col] ?? 0) / pivotValue;
  }
  for (let row = 0; row < height; row += 1) {
    if (row === pivotRow) continue;
    const factor = tableau[row * width + pivotCol] ?? 0;
    if (Math.abs(factor) <= 1e-12) continue;
    for (let col = 0; col < width; col += 1) {
      tableau[row * width + col] =
        (tableau[row * width + col] ?? 0) - factor * (tableau[pivotRow * width + col] ?? 0);
    }
  }
}

function basicRowFor(
  tableau: Float64Array,
  width: number,
  constraints: number,
  col: number
): number {
  let rowWithOne = -1;
  for (let row = 0; row < constraints; row += 1) {
    const value = tableau[row * width + col] ?? 0;
    if (Math.abs(value - 1) <= 1e-9) {
      if (rowWithOne >= 0) return -1;
      rowWithOne = row;
    } else if (Math.abs(value) > 1e-9) {
      return -1;
    }
  }
  return rowWithOne;
}

function infeasible(variables: number): LinearProgramSolution {
  return {
    feasible: false,
    objectiveValue: 0,
    values: new Array<number>(variables).fill(0),
    iterations: 0
  };
}
