# Changelog

## 0.0.0

- Заложен Этап 0: монорепо, данные, детерминированное ядро и проверочные инструменты.

## Golden baseline update

- Reason: Initial Stage 0 deterministic baseline

## Golden baseline update

- Reason: Stage 1 vertical slice baseline

## Golden baseline update

- Reason: Stage 2 full economy bootstrap, workforce, sinks, construction, treasury and research

## Stage 2 full economy

- Implemented the Stage 2 game-data loader, full economy graph, placement checks, local power,
  construction, demolition guards, treasury, contracts, start package bootstrap, research flow,
  and pathology/bench/scenario coverage.
- Added Stage 2 invariants for non-transportable energy, sink-covered build costs, phase-one
  producer/consumer turnover, material cycle count, and bootstrap local-power validity.
- Calibrated the initial economy around a 226.9k effective population workforce floor and a
  reactive builder so the seed factions avoid power starvation and blind slot-filling.
- Bench on 2026-09-05: Stage 2, 50 seeds x 1000 years, no failed pathology checks; median
  minPopulation 9.28, deliveredShipments 218922, missedDeparturesFuel 0, idleNoPower 0,
  idleMissingInput 0, constructedBuildings 12, researchedTechnologies 15, treasuryMin -185.70.
- Replaced the stale 3% energy-share baseline with the measured full-chain guard 0.0039; the
  previous threshold did not match the complete recipe graph where solar energy settles at its
  fixed-point cost.

## Stage 3 procedural galaxy

- Added deterministic galaxy generation with disc, spiral, ring, and cluster layouts; Poisson
  placement; dependency-free Delaunay gates; pruning, regions, and choke-point shaping.
- Added generated planetary bodies, clustered rare resources, faction start placement, map
  validation, galaxy presets, SVG previews, and a Stage 3 timing/validation CLI report.
- Stage 3 CLI on 2026-09-07: 50 balanced 500-system seeds valid, average gate degree
  2.860..2.928, median generation 84.77 ms, max 106.19 ms.

## Golden baseline update

- Reason: Stage 3 procedural galaxy generation

## Golden baseline update

- Reason: Stage 3 procedural galaxy generation

## Golden baseline update

- Reason: Stage 4 faction AI, MRP planning, AI event log capacity

## Golden baseline update

- Reason: Stage 5 tech graph, local science logistics, ship blueprints, shipyard systems, and
  final reserve behavior.

## Stage 6 war

- Added persistent fleets, deterministic fleet orders and atomic ship-tank fuel charging,
  stateful daily battles, simultaneous fire, range control, layered damage, interception,
  withdrawal, reinforcement, and replayable combat logs.
- Added selective gate blockades with economic routing effects and utility-based responses,
  delayed/noisy intelligence feeding ship design, and orbital superiority, siege, produced
  troops, garrisons, invasion damage, and explicit conquest history.
- Added Stage 6 pathology checks, an economic-war regression scenario, and the 50-seed,
  1000-year war stand report. The blockade chain reproduced in 50/50 seeds; the fair-budget
  duel matrix retained all four cyclic counter-design edges and stayed within the combat budget.

## Golden baseline update

- Reason: Stage 6 deterministic fleet, war, battle, intel, blockade, and colony-history arenas

## Stage 7 diplomacy and long-term dynamics

- Added persistent bilateral relations, five negotiated treaty types, real-credit foreign trade,
  passage-aware routing, MRP-derived war goals, utility declarations, war exhaustion, and peace
  terms covering systems, reparations, and trade concessions.
- Added multi-axis power concentration and utility-driven anti-hegemon coalitions, eight-factor
  regional tension, five-year secessions, administrative capacity, regional capitals, and
  repression with bounded delayed backlash.
- Added a Stage 7 headless/bench stand, long-horizon regression scenario, four new pathology
  checks, epoch reports, and a 10,000-year golden with 500-year checkpoints. The 50-seed stand
  completed with no pathology failures; live faction counts varied in every run and late
  administrative hegemony remained achievable.

## Golden baseline update

- Reason: Stage 7 diplomacy, cohesion, secession, bounded long-horizon state, and combat-cost integration

## Stage 8 observer interface

- Added a batched, virtualized story feed with consequence-derived importance, milestone
  retention, causal AI explanations, text/faction/type/importance filters, and map focus.
- Added the five PixiJS galaxy data layers, bounded selected-system slices, system details,
  uPlot history, faction comparison, instrumentation, and honest slowdown reporting.
- Added versioned IndexedDB saves with full binary snapshots, deterministic controller
  state, persisted multi-resolution history and compacted journals; rotating autosaves,
  slot management, export/import, quota handling, and loading from the initial screen.
- Added the complete data-driven new-game screen, deterministic preview, four presets,
  validation, core-enforced technical limits persisted with saves, unlimited controls,
  themes and persisted observer settings.
- Added the Stage 8 regression and target acceptance stand. On the recorded machine the
  synthetic 500/20,000/50,000 ceiling ran at 45.31 ticks/s and produced a 51,534,487-byte
  full save including 10,000 years of history; overload slowed game time without skipping
  simulation ticks.
- Fixed the system-to-galaxy return race: retained snapshots now wait for PixiJS renderer
  initialization before drawing.
