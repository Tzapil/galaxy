export interface GalaxyPoint {
  readonly x: number;
  readonly y: number;
}

export interface GalaxyEdge {
  readonly a: number;
  readonly b: number;
  readonly length: number;
}

export interface GalaxyRegionSummary {
  readonly id: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly firstSystem: number;
  readonly systemCount: number;
}

export interface GalaxyResourceDeposit {
  readonly resource: number;
  readonly yieldValue: number;
}

export interface GalaxyBodyPlan {
  readonly type: number;
  readonly size: number;
  readonly habitability: number;
  readonly slots: number;
  readonly featureMask: number;
  readonly deposits: readonly GalaxyResourceDeposit[];
}

export interface GalaxyBodiesPlan {
  readonly bodiesBySystem: readonly (readonly GalaxyBodyPlan[])[];
  readonly systemResources: readonly Uint8Array[];
  readonly totalBodies: number;
  readonly habitableBodies: number;
}
