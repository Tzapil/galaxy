import { Application, Container, Graphics, Text } from "pixi.js";
import {
  RenderSystemFlag,
  type RenderSystem,
  type StageOneRenderSnapshot
} from "@galaxy-sim/sim-core";

import { colorForSystem, colorOptionsForSnapshot, type MapColorMode } from "./colorModes.js";

type SelectSystem = (system: number) => void;

interface Projection {
  readonly minX: number;
  readonly minY: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
  readonly focusX: number;
  readonly focusY: number;
}

export class PixiMap {
  private readonly graphics = new Graphics();
  private readonly labels = new Container();
  private app: Application | undefined;
  private initialized = false;
  private canvas: HTMLCanvasElement | undefined;
  private container: HTMLElement | undefined;
  private snapshot: StageOneRenderSnapshot | undefined;
  private selectedSystem = -1;
  private focusedSystem = -1;
  private colorMode: MapColorMode = "ownership";
  private deficitResource = 0;
  private projection: Projection | undefined;
  private readonly onSystemSelected: SelectSystem;
  private resizeObserver: ResizeObserver | undefined;

  public constructor(onSystemSelected: SelectSystem) {
    this.onSystemSelected = onSystemSelected;
  }

  public async mount(container: HTMLElement): Promise<void> {
    const app = new Application();
    this.container = container;
    this.app = app;
    await app.init({ background: 0x07101f, resizeTo: container, antialias: true });
    if (this.app !== app || this.container !== container) {
      app.destroy(true);
      return;
    }
    const canvas = app.canvas;
    this.canvas = canvas;
    this.initialized = true;
    app.stage.addChild(this.graphics);
    app.stage.addChild(this.labels);
    canvas.addEventListener("click", this.handleClick);
    container.appendChild(canvas);
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

  public setColorMode(mode: MapColorMode, resource = this.deficitResource): void {
    this.colorMode = mode;
    this.deficitResource = resource;
    this.draw();
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    const app = this.app;
    const canvas = this.canvas;
    this.app = undefined;
    this.initialized = false;
    this.canvas = undefined;
    this.container = undefined;
    if (canvas !== undefined) {
      canvas.removeEventListener("click", this.handleClick);
    }
    if (app !== undefined && canvas !== undefined) {
      app.destroy(true);
    }
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.snapshot === undefined || this.app === undefined || !this.initialized) return;
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
    if (this.app === undefined || !this.initialized || this.snapshot === undefined) return;

    this.projection = projectionFor(
      this.snapshot.systems,
      this.app.renderer.width,
      this.app.renderer.height,
      this.focusedSystem
    );

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
      this.graphics.stroke({
        width: gate.blocked
          ? 2.5
          : gate.regionBoundary
            ? 1.7
            : 0.8 + Math.min(1.5, gate.traffic / 20),
        color: gate.blocked ? 0xff5d5d : gate.regionBoundary ? 0x8c78ff : 0x334762,
        alpha: gate.blocked ? 0.95 : gate.regionBoundary ? 0.75 : 0.55
      });
    }
  }

  private drawSystems(): void {
    const snapshot = this.snapshot;
    if (snapshot === undefined) return;
    const options = colorOptionsForSnapshot(snapshot, this.colorMode, this.deficitResource);
    for (let i = 0; i < snapshot.systems.length; i += 1) {
      const system = snapshot.systems[i];
      if (system === undefined) continue;
      const point = this.project(system);
      const important =
        (system.flags & (RenderSystemFlag.Capital | RenderSystemFlag.RegionalCapital)) !== 0;
      const color = colorForSystem(system, options);
      const radius = system.id === this.selectedSystem ? 7 : important ? 5.5 : 3.6;
      this.graphics.circle(point.x, point.y, radius);
      this.graphics.fill(color);
      if ((system.flags & RenderSystemFlag.ActiveBattle) !== 0) {
        this.graphics.circle(point.x, point.y, radius + 4);
        this.graphics.stroke({ width: 2, color: 0xffd166, alpha: 0.95 });
      }
      if (system.id === this.focusedSystem) {
        this.graphics.circle(point.x, point.y, 12);
        this.graphics.stroke({ width: 1, color: 0xffffff });
      }
      if (important || system.id === this.selectedSystem || snapshot.systems.length <= 120) {
        const label = new Text({
          text: String(system.id),
          style: { fill: 0xdde9f8, fontFamily: "Inter, sans-serif", fontSize: 10 }
        });
        label.x = point.x + radius + 3;
        label.y = point.y - radius - 3;
        this.labels.addChild(label);
      }
    }
  }

  private drawShips(): void {
    const snapshot = this.snapshot;
    if (snapshot === undefined) return;
    if (snapshot.ships.length > 900) {
      this.drawAggregatedFlows(snapshot);
      return;
    }
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
      this.graphics.circle(x, y, 2.1);
      this.graphics.fill(ship.state === 1 ? 0xdff7ff : 0x8ea0b8);
    }
  }

  private drawAggregatedFlows(snapshot: StageOneRenderSnapshot): void {
    const flows = new Map<string, { readonly from: number; readonly to: number; count: number }>();
    for (let index = 0; index < snapshot.ships.length; index += 1) {
      const ship = snapshot.ships[index];
      if (ship === undefined || ship.from === ship.to || ship.arriveTick < snapshot.tick) continue;
      const key = `${ship.from}:${ship.to}`;
      const flow = flows.get(key);
      if (flow === undefined) flows.set(key, { from: ship.from, to: ship.to, count: 1 });
      else flow.count += 1;
    }
    for (const flow of flows.values()) {
      const from = snapshot.systems[flow.from];
      const to = snapshot.systems[flow.to];
      if (from === undefined || to === undefined) continue;
      const a = this.project(from);
      const b = this.project(to);
      this.graphics.moveTo(a.x, a.y);
      this.graphics.lineTo(b.x, b.y);
      this.graphics.stroke({
        width: Math.min(7, 1 + Math.log2(flow.count + 1)),
        color: 0x7be0ff,
        alpha: 0.35
      });
    }
  }

  private project(system: RenderSystem): { readonly x: number; readonly y: number } {
    const app = this.app;
    const projection = this.projection;
    if (app === undefined || projection === undefined) return { x: system.x, y: system.y };
    const width = Math.max(1, app.renderer.width);
    const height = Math.max(1, app.renderer.height);
    const centeredX = (system.x - projection.minX - projection.centerX) * projection.scale;
    const centeredY = (system.y - projection.minY - projection.centerY) * projection.scale;
    return {
      x: width / 2 + centeredX - projection.focusX * 0.35,
      y: height / 2 + centeredY - projection.focusY * 0.35
    };
  }
}

function projectionFor(
  systems: readonly RenderSystem[],
  width: number,
  height: number,
  focusedSystem: number
): Projection {
  const bounds = boundsFor(systems);
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(
    safeWidth / Math.max(1, bounds.width + 80),
    safeHeight / Math.max(1, bounds.height + 80)
  );
  const centerX = bounds.width / 2;
  const centerY = bounds.height / 2;
  const focused = focusedSystem >= 0 ? systems[focusedSystem] : undefined;
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    centerX,
    centerY,
    scale,
    focusX: focused === undefined ? 0 : (focused.x - bounds.minX - centerX) * scale,
    focusY: focused === undefined ? 0 : (focused.y - bounds.minY - centerY) * scale
  };
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
