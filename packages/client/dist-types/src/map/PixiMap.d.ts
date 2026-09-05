import type { StageOneRenderSnapshot } from "@galaxy-sim/sim-core";
type SelectSystem = (system: number) => void;
export declare class PixiMap {
  private readonly graphics;
  private readonly labels;
  private app;
  private container;
  private snapshot;
  private selectedSystem;
  private focusedSystem;
  private readonly onSystemSelected;
  private resizeObserver;
  constructor(onSystemSelected: SelectSystem);
  mount(container: HTMLElement): Promise<void>;
  update(snapshot: StageOneRenderSnapshot): void;
  focusSystem(system: number): void;
  destroy(): void;
  private readonly handleClick;
  private draw;
  private drawGates;
  private drawSystems;
  private drawShips;
  private project;
}
export {};
//# sourceMappingURL=PixiMap.d.ts.map
