export const AI_STRATEGIC_PERIOD_TICKS = 360;
export const AI_OPERATIONAL_PERIOD_TICKS = 30;

export const enum AiLayer {
  Strategic = 1,
  Operational = 2,
  Tactical = 3
}

export interface AiScheduledRun {
  readonly layer: AiLayer;
  readonly faction: number;
}

export class AiScheduler {
  public shouldRunStrategic(tick: number, faction: number): boolean {
    if (tick <= 0) return false;
    return tick % AI_STRATEGIC_PERIOD_TICKS === strategicPhase(faction);
  }

  public shouldRunOperational(tick: number, faction: number): boolean {
    if (tick <= 0) return false;
    return tick % AI_OPERATIONAL_PERIOD_TICKS === operationalPhase(faction);
  }

  public shouldRunTactical(_tick: number): boolean {
    return true;
  }

  public collectDue(tick: number, factionCount: number, out: AiScheduledRun[]): void {
    out.length = 0;
    for (let faction = 0; faction < factionCount; faction += 1) {
      if (this.shouldRunStrategic(tick, faction)) {
        out.push({ layer: AiLayer.Strategic, faction });
      }
      if (this.shouldRunOperational(tick, faction)) {
        out.push({ layer: AiLayer.Operational, faction });
      }
    }
  }
}

function strategicPhase(faction: number): number {
  return (faction * 43) % AI_STRATEGIC_PERIOD_TICKS;
}

function operationalPhase(faction: number): number {
  return faction % AI_OPERATIONAL_PERIOD_TICKS;
}
