import { type RenderEvent } from "@galaxy-sim/sim-core";
import type { ReactElement } from "react";
interface EventFeedProps {
  readonly events: readonly RenderEvent[];
  readonly onFocusSystem: (system: number) => void;
}
export declare function EventFeed({ events, onFocusSystem }: EventFeedProps): ReactElement;
export {};
//# sourceMappingURL=EventFeed.d.ts.map
