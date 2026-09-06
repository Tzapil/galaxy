export { EntityAllocator } from "./entity/ids.js";
export type { EntityRef } from "./entity/ids.js";
export { EventKind } from "./events/kinds.js";
export { StageOneLogKind } from "./events/log.js";
export { BuildingState } from "./econ/buildings.js";
export { buildEconGraph, computeBaseValues, explodeToRaw, recipeUnitCost } from "./econ/graph.js";
export type { EconGraph, EconGraphInput } from "./econ/graph.js";
export { validatePlacement, hasPowerSource } from "./econ/placement.js";
export type { PlacementFailureReason, PlacementResult } from "./econ/placement.js";
export { choosePowerSourceForRemoteBase, scorePowerSourcesForLogistics } from "./econ/power.js";
export type { PowerSourceScore } from "./econ/power.js";
export {
  allBuildCostResourcesAreSinks,
  resourceIsConsumedBySink,
  sinkConsumesResource
} from "./econ/sinks.js";
export {
  advanceWaitingConstructions,
  completeConstruction,
  startBuildingConstruction
} from "./build/construction.js";
export type { ConstructionResult } from "./build/construction.js";
export { calculateCapitalDemand } from "./build/capital-demand.js";
export type { PlannedConstruction } from "./build/capital-demand.js";
export { canDemolishByFlow, demolishBuilding } from "./build/demolish.js";
export type { DemolitionCheck } from "./build/demolish.js";
export { foundColony } from "./bootstrap/found-colony.js";
export type { FoundColonyResult } from "./bootstrap/found-colony.js";
export {
  applyStartPackage,
  startPackageSummary,
  validateStartPackage
} from "./bootstrap/start-package.js";
export type { AppliedStartPackage, StartPackageValidation } from "./bootstrap/start-package.js";
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
export { consumePopulationWithLocalRedistribution } from "./pop/consume-stage-two.js";
export { JobBoard } from "./market/jobboard.js";
export { RoutePlanner } from "./nav/route.js";
export type { RouteResult } from "./nav/route.js";
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
export { StageTwoSimulation } from "./simulation/stage-two.js";
export type {
  StageTwoHashCheckpoint,
  StageTwoMetrics,
  StageTwoRunReport
} from "./simulation/stage-two.js";
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
export {
  bodyTypePlacementMask,
  createDefaultStageOneData,
  createStageTwoDataFromGameData,
  featureMaskFromNames,
  buildingIndexOf,
  resourceIndexOf
} from "./stage-one/data.js";
export type {
  ResourceAmount,
  StageOneBatchRecipe,
  StageOneBuildingDef,
  StageOneContinuousProcess,
  StageOneData,
  StageOneHull,
  StageOnePopulationNeeds,
  StageOneResource,
  StageOneSink,
  StageOneStartBody,
  StageOneStartBuilding,
  StageOneStartPackage,
  StageOneStartShip,
  StageOneTech,
  StageGameDataInput
} from "./stage-one/data.js";
export { BodyType } from "./world/bodies.js";
export { StageOneWorld } from "./world/state.js";
export { slotRangeForBody, totalSlotsForBody, freeSlots } from "./world/slots.js";
export { buildStageTwoWorld } from "./world/build-stage-two-world.js";
export { ShipRole, ShipState } from "./ships/ships.js";
export { assignIdleHaulers, handleShipArrival, launchBestLocalJob } from "./ships/move.js";
export { LaunchResult } from "./ships/move.js";
export {
  applyDailyTreasury,
  fleetUpkeep,
  upkeepForRole,
  TAX_PER_POP_PER_DAY,
  CIVILIAN_UPKEEP_PER_DAY,
  SUPPORT_UPKEEP_PER_DAY,
  WARSHIP_UPKEEP_PER_DAY,
  TREASURY_DEBT_FLOOR
} from "./treasury/treasury.js";
export { GovernmentContracts, payContractSubsidy } from "./treasury/contracts.js";
export type { ContractSubsidy } from "./treasury/contracts.js";
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
