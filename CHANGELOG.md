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
