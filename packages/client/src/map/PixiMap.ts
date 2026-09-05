import { Application, Container, Graphics, Text } from "pixi.js";
import type { RenderSystem, StageOneRenderSnapshot } from "@galaxy-sim/sim-core";

type SelectSystem = (system: number) => void;

export class PixiMap {
  private readonly graphics = new Graphics();
  private readonly labels = new Container();
  private app: Application | undefined;
  private container: HTMLElement | undefined;
  private snapshot: StageOneRenderSnapshot | undefined;
  private selectedSystem = -1;
  private focusedSystem = -1;
  private readonly onSystemSelected: SelectSystem;
  private resizeObserver: ResizeObserver | undefined;

  public constructor(onSystemSelected: SelectSystem) {
    this.onSystemSelected = onSystemSelected;
  }

  public async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    this.app = new Application();
    await this.app.init({ background: 0x000000, resizeTo: container, antialias: false });
    this.app.stage.addChild(this.graphics);
    this.app.stage.addChild(this.labels);
    this.app.canvas.addEventListener("click", this.handleClick);
    container.appendChild(this.app.canvas);
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(container);
    this.draw();
  }

  public update(snapshot: StageOneRenderSnapshot): void {
    this.snapshot = snapshot;
    this.draw();
  }

  public focusSystem(system: number): void {
    this.focusedSystem = system;
    this.selectedSystem = system;
    this.draw();
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    if (this.app !== undefined) {
      this.app.canvas.removeEventListener("click", this.handleClick);
      this.app.destroy(true);
    }
    this.app = undefined;
    this.container = undefined;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.snapshot === undefined || this.app === undefined) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = -1;
    let bestDistance = 18 * 18;
    for (let i = 0; i < this.snapshot.systems.length; i += 1) {
      const system = this.snapshot.systems[i];
      if (system === undefined) continue;
      const point = this.project(system);
      const dx = point.x - x;
      const dy = point.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = system.id;
      }
    }
    if (best >= 0) {
      this.selectedSystem = best;
      this.onSystemSelected(best);
      this.draw();
    }
  };

  private draw(): void {
    this.graphics.clear();
    this.labels.removeChildren().forEach((child) => child.destroy());
    if (this.app === undefined || this.snapshot === undefined) return;

    this.drawGates();
    this.drawSystems();
    this.drawShips();
  }

  private drawGates(): void {
    const snapshot = this.snapshot;
    if (snapshot === undefined) return;
    for (let i = 0; i < snapshot.gates.length; i += 1) {
      const gate = snapshot.gates[i];
      if (gate === undefined) continue;
      const from = snapshot.systems[gate.from];
      const to = snapshot.systems[gate.to];
      if (from === undefined || to === undefined) continue;
      const a = this.project(from);
      const b = this.project(to);
      this.graphics.moveTo(a.x, a.y);
      this.graphics.lineTo(b.x, b.y);
      this.graphics.stroke({ width: 1, color: gate.blocked ? 0x777777 : 0x333333 });
    }
  }

  private drawSystems(): void {
    const snapshot = this.snapshot;
    if (snapshot === undefined) return;
    for (let i = 0; i < snapshot.systems.length; i += 1) {
      const system = snapshot.systems[i];
      if (system === undefined) continue;
      const point = this.project(system);
      const color = system.owner === 0 ? 0x1f8f3a : system.owner === 1 ? 0x9f3030 : 0x555555;
      const radius = system.id === this.selectedSystem ? 8 : 6;
      this.graphics.circle(point.x, point.y, radius);
      this.graphics.fill(color);
      if (system.id === this.focusedSystem) {
        this.graphics.circle(point.x, point.y, 12);
        this.graphics.stroke({ width: 1, color: 0xffffff });
      }
      const label = new Text({
        text: String(system.id),
        style: { fill: 0xffffff, fontFamily: "monospace", fontSize: 10 }
      });
      label.x = point.x + 7;
      label.y = point.y - 7;
      this.labels.addChild(label);
    }
  }

  private drawShips(): void {
    const snapshot = this.snapshot;
    if (snapshot === undefined) return;
    for (let i = 0; i < snapshot.ships.length; i += 1) {
      const ship = snapshot.ships[i];
      if (ship === undefined) continue;
      const from = snapshot.systems[ship.from];
      const to = snapshot.systems[ship.to];
      if (from === undefined || to === undefined) continue;
      const a = this.project(from);
      const b = this.project(to);
      const span = Math.max(1, ship.arriveTick - ship.departTick);
      const t = Math.max(0, Math.min(1, (snapshot.tick - ship.departTick) / span));
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      this.graphics.rect(x - 2, y - 2, 4, 4);
      this.graphics.fill(ship.state === 1 ? 0xffffff : 0x999999);
    }
  }

  private project(system: RenderSystem): { readonly x: number; readonly y: number } {
    const app = this.app;
    const snapshot = this.snapshot;
    if (app === undefined || snapshot === undefined) return { x: system.x, y: system.y };
    const bounds = boundsFor(snapshot.systems);
    const width = Math.max(1, app.renderer.width);
    const height = Math.max(1, app.renderer.height);
    const scale = Math.min(
      width / Math.max(1, bounds.width + 80),
      height / Math.max(1, bounds.height + 80)
    );
    const centeredX = (system.x - bounds.minX - bounds.width / 2) * scale;
    const centeredY = (system.y - bounds.minY - bounds.height / 2) * scale;
    let focusX = 0;
    let focusY = 0;
    if (this.focusedSystem >= 0) {
      const focused = snapshot.systems[this.focusedSystem];
      if (focused !== undefined) {
        focusX = (focused.x - bounds.minX - bounds.width / 2) * scale;
        focusY = (focused.y - bounds.minY - bounds.height / 2) * scale;
      }
    }
    return {
      x: width / 2 + centeredX - focusX * 0.35,
      y: height / 2 + centeredY - focusY * 0.35
    };
  }
}

function boundsFor(systems: readonly RenderSystem[]): {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < systems.length; i += 1) {
    const system = systems[i];
    if (system === undefined) continue;
    if (system.x < minX) minX = system.x;
    if (system.y < minY) minY = system.y;
    if (system.x > maxX) maxX = system.x;
    if (system.y > maxY) maxY = system.y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY))
    return { minX: 0, minY: 0, width: 1, height: 1 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}
