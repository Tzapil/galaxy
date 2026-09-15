import { beforeEach, describe, expect, it, vi } from "vitest";

const pixi = vi.hoisted(() => {
  type InitResolver = () => void;
  interface MockCanvas {
    readonly addEventListener: ReturnType<typeof vi.fn>;
    readonly removeEventListener: ReturnType<typeof vi.fn>;
    readonly getBoundingClientRect: ReturnType<typeof vi.fn>;
  }

  const state: {
    readonly applications: MockApplication[];
    resolveInit: InitResolver | undefined;
  } = {
    applications: [],
    resolveInit: undefined
  };

  function createCanvas(): HTMLCanvasElement {
    const canvas: MockCanvas = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 }))
    };
    return canvas as unknown as HTMLCanvasElement;
  }

  class MockApplication {
    public readonly stage = {
      addChild: vi.fn((_child: unknown) => undefined)
    };

    public readonly destroy = vi.fn((_removeView?: boolean) => undefined);
    public renderer:
      | { readonly width: number; readonly height: number; readonly canvas: HTMLCanvasElement }
      | undefined;

    public constructor() {
      state.applications.push(this);
    }

    public async init(): Promise<void> {
      await new Promise<void>((resolve) => {
        state.resolveInit = resolve;
      });
      this.renderer = { width: 100, height: 100, canvas: createCanvas() };
    }

    public get canvas(): HTMLCanvasElement {
      return this.renderer?.canvas ?? missingCanvas().canvas;
    }
  }

  function missingCanvas(): { readonly canvas: HTMLCanvasElement } {
    return undefined as unknown as { readonly canvas: HTMLCanvasElement };
  }

  return { MockApplication, state };
});

vi.mock("pixi.js", () => ({
  Application: pixi.MockApplication,
  Container: class MockContainer {
    public addChild(_child: unknown): void {
      return undefined;
    }

    public removeChildren(): Array<{ readonly destroy: () => void }> {
      return [];
    }
  },
  Graphics: class MockGraphics {
    public clear(): void {
      return undefined;
    }

    public moveTo(_x: number, _y: number): void {
      return undefined;
    }

    public lineTo(_x: number, _y: number): void {
      return undefined;
    }

    public stroke(_options: unknown): void {
      return undefined;
    }

    public circle(_x: number, _y: number, _radius: number): void {
      return undefined;
    }

    public fill(_color: number): void {
      return undefined;
    }

    public rect(_x: number, _y: number, _width: number, _height: number): void {
      return undefined;
    }
  },
  Text: class MockText {
    public x = 0;
    public y = 0;

    public constructor(_options: unknown) {
      return;
    }
  }
}));

import { PixiMap } from "../src/map/PixiMap.js";
import type { StageOneRenderSnapshot } from "@galaxy-sim/sim-core";

describe("PixiMap", () => {
  beforeEach(() => {
    pixi.state.applications.length = 0;
    pixi.state.resolveInit = undefined;
  });

  it("accepts a retained snapshot while remount initialization is pending", async () => {
    const map = new PixiMap(() => undefined);
    const container = {
      appendChild: vi.fn((_node: Node) => undefined)
    } as unknown as HTMLElement;
    const mount = map.mount(container);
    let error: unknown;

    try {
      map.update({ systems: [], gates: [], ships: [] } as unknown as StageOneRenderSnapshot);
    } catch (cause) {
      error = cause;
    }

    map.destroy();
    pixi.state.resolveInit?.();
    await mount;
    expect(error).toBeUndefined();
  });

  it("can be destroyed before PIXI initialization exposes a canvas", async () => {
    const map = new PixiMap(() => undefined);
    const container = {
      appendChild: vi.fn((_node: Node) => undefined)
    } as unknown as HTMLElement;

    const mount = map.mount(container);

    expect(() => map.destroy()).not.toThrow();

    pixi.state.resolveInit?.();
    await mount;

    expect(container.appendChild).not.toHaveBeenCalled();
    expect(pixi.state.applications[0]?.destroy).toHaveBeenCalledWith(true);
  });
});
