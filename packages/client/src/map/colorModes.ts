import type { RenderSystem, StageOneRenderSnapshot } from "@galaxy-sim/sim-core";

export type MapColorMode = "ownership" | "wealth" | "deficit" | "traffic" | "tension";

export interface ColorModeOptions {
  readonly mode: MapColorMode;
  readonly resource: number;
  readonly maximum: number;
}

// Tol/Brewer-inspired palette with good color-vision-deficiency separation.
export const FACTION_COLORS = [
  0x4e79a7, 0xf28e2b, 0x59a14f, 0xe15759, 0xb07aa1, 0x76b7b2, 0xedc948, 0xff9da7, 0x9c755f,
  0xbab0ac, 0x2f6f9f, 0xd9730d, 0x34843a, 0xba3b46, 0x87549d, 0x4b9691
] as const;

export function colorOptionsForSnapshot(
  snapshot: StageOneRenderSnapshot,
  mode: MapColorMode,
  resource: number
): ColorModeOptions {
  let maximum = mode === "deficit" || mode === "tension" ? 1 : 0;
  for (let index = 0; index < snapshot.systems.length; index += 1) {
    const system = snapshot.systems[index];
    if (system !== undefined) maximum = Math.max(maximum, valueForMode(system, mode, resource));
  }
  return { mode, resource, maximum: Math.max(0.0001, maximum) };
}

export function colorForSystem(system: RenderSystem, options: ColorModeOptions): number {
  if (options.mode === "ownership") {
    return system.owner < 0
      ? 0x415067
      : (FACTION_COLORS[system.owner % FACTION_COLORS.length] ?? 0x8ea0b8);
  }
  const normalized = Math.max(
    0,
    Math.min(1, valueForMode(system, options.mode, options.resource) / options.maximum)
  );
  if (options.mode === "deficit") return gradient(0x173a5e, 0xff5d5d, normalized);
  if (options.mode === "tension") return gradient(0x22483a, 0xff6b35, normalized);
  if (options.mode === "traffic") return gradient(0x28354d, 0x4de1ff, normalized);
  return gradient(0x29334a, 0xffd166, normalized);
}

export function valueForMode(system: RenderSystem, mode: MapColorMode, resource: number): number {
  if (mode === "wealth") return system.wealth;
  if (mode === "deficit") return system.deficits[resource] ?? 0;
  if (mode === "traffic") return system.traffic;
  if (mode === "tension") return system.tension;
  return system.owner;
}

function gradient(from: number, to: number, t: number): number {
  const red = Math.round(
    ((from >>> 16) & 0xff) + (((to >>> 16) & 0xff) - ((from >>> 16) & 0xff)) * t
  );
  const green = Math.round(
    ((from >>> 8) & 0xff) + (((to >>> 8) & 0xff) - ((from >>> 8) & 0xff)) * t
  );
  const blue = Math.round((from & 0xff) + ((to & 0xff) - (from & 0xff)) * t);
  return (red << 16) | (green << 8) | blue;
}
