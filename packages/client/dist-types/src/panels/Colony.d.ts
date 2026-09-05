import { type RenderBuilding, type RenderColony } from "@galaxy-sim/sim-core";
import type { ReactElement } from "react";
interface ColonyProps {
  readonly selectedSystem: number;
  readonly colonies: readonly RenderColony[];
  readonly buildings: readonly RenderBuilding[];
}
export declare function Colony({ selectedSystem, colonies, buildings }: ColonyProps): ReactElement;
export {};
//# sourceMappingURL=Colony.d.ts.map
