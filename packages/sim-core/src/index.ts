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
export {
  calculateCapitalDemand,
  calculateCapitalDemandForFaction
} from "./build/capital-demand.js";
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
export {
  AI_OPERATIONAL_PERIOD_TICKS,
  AI_STRATEGIC_PERIOD_TICKS,
  AiLayer,
  AiScheduler
} from "./ai/scheduler.js";
export type { AiScheduledRun } from "./ai/scheduler.js";
export { chooseUtilityOption, personalityWeightsForFaction } from "./ai/utility.js";
export type { UtilityAxis, UtilityChoice, UtilityOption } from "./ai/utility.js";
export { formatAiDecisionReason } from "./ai/decision-log.js";
export type { AiDecisionReasonEvent } from "./ai/decision-log.js";
export {
  chooseResearchTopic,
  isResearchCandidate,
  isResearchPathReachable,
  personalityWeightForTech,
  researchPathCost,
  researchRelevanceForBottleneck
} from "./ai/research-choice.js";
export type { ResearchChoice, ResearchPathCost } from "./ai/research-choice.js";
export {
  findBottleneck,
  findLogisticsBottleneck,
  reserveDays,
  STOCK_RESERVE_HORIZON_DAYS,
  toOperationalTask,
  AiOperationalTaskKind
} from "./ai/bottleneck.js";
export type { AiBottleneck, AiOperationalTask } from "./ai/bottleneck.js";
export { createStrategicGoal, AiGoalKind } from "./ai/goals.js";
export type { AiGoal } from "./ai/goals.js";
export { chooseProducer, explodeDemand } from "./ai/mrp/explode.js";
export type {
  MrpExplosion,
  MrpExplosionOptions,
  MrpHullTarget,
  MrpResourceTarget,
  MrpTarget,
  MrpTraceStep
} from "./ai/mrp/explode.js";
export {
  calculateFleetDemandPerDay,
  collectFactionDemandSources,
  demandByColonyShare
} from "./ai/mrp/demand-sources.js";
export type { FactionDemandSources } from "./ai/mrp/demand-sources.js";
export { calculateFactionSupplyRates } from "./ai/mrp/supply.js";
export type { FactionSupply } from "./ai/mrp/supply.js";
export {
  guardAlternativeProducer,
  guardDemolishByFlow,
  guardHousingCap,
  guardPowerAvailable,
  guardStockHorizon,
  guardVitalVsComfort,
  NeedBranch
} from "./ai/build-plan/guards.js";
export { solveLinearProgram } from "./ai/build-plan/lp.js";
export type { LinearProgram, LinearProgramSolution } from "./ai/build-plan/lp.js";
export { createBuildPlan } from "./ai/build-plan/plan.js";
export type { BuildPlan, BuildPlanItem } from "./ai/build-plan/plan.js";
export { activeConstructionForFaction, applyBuildPlan } from "./ai/build-plan/apply.js";
export type { AppliedBuildPlan } from "./ai/build-plan/apply.js";
export { bestColonyTarget, scoreColonyTarget } from "./ai/expansion/colony-score.js";
export type { ColonyScore } from "./ai/expansion/colony-score.js";
export {
  buildColonizerIfNeeded,
  COLONIZER_CREDIT_COST,
  COLONIZER_HULL_FRAMES,
  COLONIZER_LIFE_SUPPORT,
  handleColonizerArrival,
  launchIdleColonizer,
  runColonization
} from "./ai/expansion/colonize.js";
export type { ColonizationStep } from "./ai/expansion/colonize.js";
export { scaleCivilianFleet } from "./ai/expansion/fleet-scale.js";
export type { FleetScaleResult } from "./ai/expansion/fleet-scale.js";
export { compactJournalEntries } from "./persist/port.js";
export type { JournalEntry, PersistPort } from "./persist/port.js";
export { consumePopulationWithLocalRedistribution } from "./pop/consume-stage-two.js";
export { JobBoard } from "./market/jobboard.js";
export { gateIsBlockedFor, RoutePlanner } from "./nav/route.js";
export type { HostilityView, RouteResult } from "./nav/route.js";
export { Rng } from "./rng.js";
export type { RngSnapshot } from "./rng.js";
export {
  buildGeneratedGalaxyWorld,
  buildStageThreeWorld,
  gateDegrees,
  generateStarLayout,
  GalaxyGenerationError
} from "./galaxy/build-galaxy-world.js";
export type { GeneratedGalaxy, StarLayout } from "./galaxy/build-galaxy-world.js";
export { applyChokepoints } from "./galaxy/chokepoints.js";
export { triangulateDelaunay } from "./galaxy/delaunay.js";
export { chooseFactionStarts, refreshWorldCapitalDistances } from "./galaxy/faction-starts.js";
export type { FactionStartSelection } from "./galaxy/faction-starts.js";
export { deriveAttemptSeed, normalizeGalaxyParams, paramsWithPreset } from "./galaxy/params.js";
export type {
  GalaxyGenerationParams,
  GalaxyPreset,
  GalaxyShape,
  NormalizedGalaxyParams
} from "./galaxy/params.js";
export { minimumSquaredDistance, poissonDiskSample, PoissonDiskError } from "./galaxy/poisson.js";
export {
  averageEdgeLength,
  connectedComponentCount,
  degreesFor,
  multiSourceJumpDistances,
  pruneGateGraph,
  shortestJumpDistances
} from "./galaxy/prune.js";
export type { PrunedGateGraph, PruneGateOptions } from "./galaxy/prune.js";
export {
  createSystemResourceMap,
  neighborResourceCorrelation,
  rareResourceClusterCount,
  rareResourceIndices,
  tierOneStartResourceIndices
} from "./galaxy/resources-gen.js";
export { clusterRegions, computeCapitalJumpDistances } from "./galaxy/regions.js";
export type { RegionLayout } from "./galaxy/regions.js";
export { systemResourcePresence, validateGalaxyMap } from "./galaxy/validate-map.js";
export type {
  MapValidationCode,
  MapValidationResult,
  MapValidationViolation
} from "./galaxy/validate-map.js";
export type {
  GalaxyBodiesPlan,
  GalaxyBodyPlan,
  GalaxyEdge,
  GalaxyPoint,
  GalaxyRegionSummary,
  GalaxyResourceDeposit
} from "./galaxy/types.js";
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
  StageOneDoctrine,
  StageOneDoctrineRequirements,
  StageOneDoctrineScoring,
  StageOneDoctrineWeights,
  StageOneHull,
  StageOneModule,
  StageOnePersonality,
  StageOnePersonalityWeights,
  StageOnePopulationNeeds,
  StageOneResource,
  StageOneSink,
  StageOneStartBody,
  StageOneStartBuilding,
  StageOneStartPackage,
  StageOneStartShip,
  StageOneTech,
  StageOneTechBranch,
  StageOneTechDataKind,
  StageOneTechEffect,
  StageOneTechEffectType,
  ShipClass,
  ShipSlotBudget,
  ShipSlotType,
  WeaponBand,
  StageGameDataInput
} from "./stage-one/data.js";
export { BodyType } from "./world/bodies.js";
export { ColonyHistory } from "./world/colonies.js";
export { CapitalDistances, Regions } from "./world/regions.js";
export { StageOneWorld } from "./world/state.js";
export type { StageOneWorldCapacities } from "./world/state.js";
export { slotRangeForBody, totalSlotsForBody, freeSlots } from "./world/slots.js";
export { buildStageTwoWorld } from "./world/build-stage-two-world.js";
export { ShipRole, ShipState } from "./ships/ships.js";
export {
  Fleets,
  FleetState,
  fleetAverageSpeed,
  fleetCombatStrength,
  fleetSpeed
} from "./fleet/fleet.js";
export type { FleetStatWorld } from "./fleet/fleet.js";
export { FleetOrder, handleFleetArrival, issueFleetOrder, launchFleet } from "./fleet/orders.js";
export type { FleetLaunchFailure, FleetLaunchResult } from "./fleet/orders.js";
export { rallyShip } from "./fleet/rally.js";
export type { RallyResult } from "./fleet/rally.js";
export { Wars, WarState } from "./war/state.js";
export { Relations, RelationStatus } from "./diplo/relations.js";
export {
  DiplomaticNavigation,
  endTreatyAsBreach,
  relationStatusForTreaty,
  Treaties,
  TreatyState,
  TreatyType
} from "./diplo/treaty.js";
export { WarGoals } from "./diplo/war-goals.js";
export { findCasusBelli, formatCasusBelliReason } from "./diplo/casus-belli.js";
export type { CasusBelli } from "./diplo/casus-belli.js";
export {
  declareWarForCasusBelli,
  evaluateWarDecision,
  MAX_SIMULTANEOUS_WAR_FRONTS,
  WAR_DECLARATION_THRESHOLD
} from "./diplo/declare-war.js";
export type { WarDecision, WarDecisionFactors, WarDeclarationResult } from "./diplo/declare-war.js";
export { evaluateTreatyUtility, negotiateTreaty } from "./diplo/negotiate.js";
export type { TreatyNegotiation, TreatyOffer, TreatyUtilityInput } from "./diplo/negotiate.js";
export {
  evaluatePeaceTerms,
  MAX_WAR_DURATION_TICKS,
  PEACE_EXHAUSTION_THRESHOLD,
  seekPeace,
  statusQuoTerms,
  TRUCE_DURATION_TICKS
} from "./diplo/peace.js";
export type { PeaceEvaluation, PeaceResult, PeaceTerms } from "./diplo/peace.js";
export {
  activeWarCount,
  advanceWarExhaustion,
  MAX_WAR_EXHAUSTION,
  recordWarCost,
  WAR_EXHAUSTION_TENSION_WEIGHT
} from "./diplo/war-exhaustion.js";
export type { WarCost } from "./diplo/war-exhaustion.js";
export {
  assessThreat,
  factionPowerShares,
  hegemonWarMultiplier,
  powerConcentrationIndex,
  updateCoalitionTreaties
} from "./diplo/coalition.js";
export type { PowerShares, ThreatAssessment } from "./diplo/coalition.js";
export { considerWarFromBottleneck, runDiplomacyDay } from "./diplo/tick.js";
export type { DiplomacyDayResult } from "./diplo/tick.js";
export { executeForeignTrade, quoteForeignTrade } from "./market/foreign-trade.js";
export type { ForeignTradeQuote, ForeignTradeResult } from "./market/foreign-trade.js";
export {
  administrativeCapacity,
  administrativeCapacityEra,
  MAX_ADMINISTRATIVE_CAPACITY
} from "./cohesion/admin-capacity.js";
export type { AdministrativeCapacityBreakdown } from "./cohesion/admin-capacity.js";
export { FactionDynamics, RegionCohesion } from "./cohesion/state.js";
export { refreshRegionalCapital, regionalDistanceOrigin } from "./cohesion/regional-capital.js";
export { advanceRepression, MAX_HIDDEN_HATRED } from "./cohesion/repression.js";
export type { RepressionEffect } from "./cohesion/repression.js";
export {
  calculateRegionTension,
  REGION_TENSION_THRESHOLD,
  updateRegionTension
} from "./cohesion/tension.js";
export type { RegionTensionBreakdown } from "./cohesion/tension.js";
export {
  attemptRegionSecession,
  formatSecessionReason,
  retireFaction,
  SECESSION_ANNUAL_CHANCE,
  SECESSION_MIN_HIGH_TICKS
} from "./cohesion/secession.js";
export type { SecessionResult } from "./cohesion/secession.js";
export {
  bandName,
  combatBand,
  CombatBand,
  moveBand,
  resolveBandStep,
  weaponCanFire
} from "./combat/bands.js";
export {
  Battles,
  BattleSide,
  BattleState,
  createBattle,
  MAX_BATTLE_ROUNDS,
  reinforceBattle
} from "./combat/battle.js";
export { CombatRoundScratch, resolveBattleRound } from "./combat/round.js";
export type { BattleRoundResult } from "./combat/round.js";
export { applyLayeredDamage, weaponDamageType, WeaponDamageType } from "./combat/damage.js";
export type { DamageLayers, DamageResult } from "./combat/damage.js";
export { interceptDamage, MAX_INTERCEPT_FRACTION } from "./combat/intercept.js";
export type { InterceptResult } from "./combat/intercept.js";
export { checkWithdrawal } from "./combat/withdraw.js";
export type { WithdrawalCheck } from "./combat/withdraw.js";
export { CombatLog, CombatLogKind } from "./combat/log.js";
export type { CombatLogEntry } from "./combat/log.js";
export {
  BlockadeReaction,
  chooseBlockadeReaction,
  clearBlockade,
  establishBlockade
} from "./combat/blockade.js";
export type { BlockadePressure, BlockadeReactionChoice } from "./combat/blockade.js";
export {
  establishOrbitalSuperiority,
  hasOrbitalSuperiority,
  orbitalDefenseStrength,
  ORBITAL_DEFENSE_STRENGTH
} from "./combat/orbital.js";
export type { OrbitalSuperiorityResult } from "./combat/orbital.js";
export { endSiege, startSiege } from "./combat/siege.js";
export {
  CAPTURE_POPULATION_SURVIVAL,
  defenseTaskForThreat,
  fleetTroopStrength,
  GARRISON_STRENGTH,
  garrisonStrength,
  invadeColony
} from "./combat/invasion.js";
export type { InvasionFailure, InvasionResult } from "./combat/invasion.js";
export { IntelMemory, IntelSource } from "./intel/memory.js";
export type { ObservedFleetProfile } from "./intel/memory.js";
export {
  enemyProfileFromIntel,
  estimateIntel,
  estimatedEnemyCapability
} from "./intel/estimate.js";
export type { IntelEstimate } from "./intel/estimate.js";
export {
  fleetProfile,
  observeBattle,
  observeBorderFleet,
  observeFleetAfterBattle,
  scoutSystem
} from "./intel/observe.js";
export { assignIdleHaulers, handleShipArrival, launchBestLocalJob } from "./ships/move.js";
export { LaunchResult } from "./ships/move.js";
export { collectAndAdvanceResearch } from "./tech/research.js";
export type { ResearchStepResult } from "./tech/research.js";
export {
  assertStageFiveHullData,
  emptySlotBudget,
  hullById,
  setSlotBudgetValue,
  SHIP_SLOT_TYPES,
  slotBudgetValue
} from "./ships/hull.js";
export {
  assertStageFiveModuleData,
  hullBundleCost,
  moduleBundleCost,
  moduleById
} from "./ships/module.js";
export {
  armorReduction,
  calculateDesignStats,
  computeEffectiveHitPoints
} from "./ships/design-stats.js";
export type { ShipDesign, ShipDesignStats } from "./ships/design-stats.js";
export { isShipDesignValid, validateShipDesign } from "./ships/validity.js";
export type {
  ShipDesignBudget,
  ShipDesignBudgetFailure,
  ShipDesignValidity,
  ShipDesignValidityOptions
} from "./ships/validity.js";
export {
  meetsDoctrineRequirements,
  scoreDesign,
  scoreStats,
  speedScore,
  threatFactor
} from "./ships/autodesign/score.js";
export type { EnemyShipProfile } from "./ships/autodesign/score.js";
export { applyMove, singleMoves } from "./ships/autodesign/moves.js";
export type { AutoDesignMove } from "./ships/autodesign/moves.js";
export { cheapestReactor, designShip } from "./ships/autodesign/greedy.js";
export type { AutoDesignOptions, AutoDesignResult } from "./ships/autodesign/greedy.js";
export {
  availableHullsForDesign,
  availableModulesForDesign,
  bestDesign,
  designIsUseful
} from "./ships/autodesign/best-hull.js";
export type { BestDesignOptions, BestDesignResult } from "./ships/autodesign/best-hull.js";
export {
  blueprintVersionDistribution,
  MAX_BLUEPRINT_MODULES,
  obsoleteFleetFraction
} from "./ships/blueprint.js";
export type { BlueprintVersionMetric } from "./ships/blueprint.js";
export {
  addKitOrderContracts,
  blueprintComponentRequirements,
  KitOrderState
} from "./ships/kit-order.js";
export {
  advanceShipyards,
  hasOwnedShipyard,
  queueShipBuild,
  refreshFactionBlueprints,
  ShipyardOrderState
} from "./ships/shipyard.js";
export type { ShipyardQueueResult } from "./ships/shipyard.js";
export {
  canRefitShip,
  refitCost,
  refitShipAtShipyard,
  REFIT_COST_FRACTION
} from "./ships/refit.js";
export type { RefitCheck } from "./ships/refit.js";
export {
  prereqClosure,
  startProducibleResources,
  TechGraph,
  TechGraphError
} from "./tech/graph.js";
export type { TechGraphValidation } from "./tech/graph.js";
export {
  clampRepeatableLevel,
  MAX_REPEATABLE_TECH_LEVEL,
  repeatableCostAtLevel,
  repeatableEffectMultiplier,
  techBaseCost,
  totalCost
} from "./tech/repeatable.js";
export type { TechDataCost } from "./tech/repeatable.js";
export { FactionTechState } from "./tech/state.js";
export type { TechStateColumn } from "./tech/state.js";
export {
  moduleCost,
  refreshFactionBuildingWorkers,
  TechModifierCache,
  validateAllModifiers
} from "./tech/modifiers.js";
export type { TechModifierCacheStats } from "./tech/modifiers.js";
export {
  emptyAppliedTechEffects,
  hasAbility,
  isBuildingUnlocked,
  isHullUnlocked,
  isModuleUnlocked,
  isTechUnlockedById,
  summarizeAppliedTechEffects
} from "./tech/unlock.js";
export type { AppliedTechEffects } from "./tech/unlock.js";
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
