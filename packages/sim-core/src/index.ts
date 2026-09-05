export { EntityAllocator } from "./entity/ids.js";
export type { EntityRef } from "./entity/ids.js";
export { EventKind } from "./events/kinds.js";
export { StageOneLogKind } from "./events/log.js";
export { BuildingState } from "./econ/buildings.js";
export { EventBatch, EventQueue } from "./events/queue.js";
export type { EventHandle } from "./events/queue.js";
export { Instrumentation, InstrumentSubsystem } from "./instrument.js";
export type {
  EntityCounters,
  InstrumentationOptions,
  InstrumentationSummary
} from "./instrument.js";
export { compactJournalEntries } from "./persist/port.js";
export type { JournalEntry, PersistPort } from "./persist/port.js";
export { Rng } from "./rng.js";
export type { RngSnapshot } from "./rng.js";
export { hashBuffer128, hashBytes128, hashState } from "./snapshot/hash.js";
export { readStateSnapshot } from "./snapshot/read.js";
export type { RestoredSnapshot, SnapshotRngStream, SnapshotState } from "./snapshot/types.js";
export { SNAPSHOT_MAGIC, SNAPSHOT_VERSION, writeStateSnapshot } from "./snapshot/write.js";
export { StageZeroSimulation } from "./simulation/stage-zero.js";
export type { HashCheckpoint, StageZeroRunReport } from "./simulation/stage-zero.js";
export { StageOneSimulation } from "./simulation/stage-one.js";
export type {
  StageOneMetrics,
  StageOneRunReport,
  HashCheckpoint as StageOneHashCheckpoint
} from "./simulation/stage-one.js";
export {
  decodeStageOneRenderSnapshot,
  RenderSliceBit,
  STAGE_ONE_VIEW_MAGIC,
  STAGE_ONE_VIEW_VERSION
} from "./stage-one/render-snapshot.js";
export type {
  RenderBuilding,
  RenderColony,
  RenderEvent,
  RenderGate,
  RenderShip,
  RenderSystem,
  StageOneRenderSnapshot
} from "./stage-one/render-snapshot.js";
export { createDefaultStageOneData, buildingIndexOf, resourceIndexOf } from "./stage-one/data.js";
export type {
  ResourceAmount,
  StageOneBatchRecipe,
  StageOneBuildingDef,
  StageOneContinuousProcess,
  StageOneData,
  StageOnePopulationNeeds,
  StageOneResource
} from "./stage-one/data.js";
export { SimClock, TICKS_PER_YEAR, ticksFromYears, yearsFromTicks } from "./time.js";
export { SoAArena } from "./soa/arena.js";
export type {
  ArenaColumnSnapshot,
  ArenaSnapshot,
  ColumnKind,
  ColumnSpec,
  NumericArray
} from "./soa/arena.js";
export { BufferPool } from "./soa/pool.js";
