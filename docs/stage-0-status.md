# Stage 0 status

Дата фиксации: 2026-09-04

## Статус

Stage 0 выполнен. К Stage 1 не переходил.

## Что сделано

- Собран pnpm workspace с пакетами `@galaxy-sim/sim-core`, `@galaxy-sim/sim-data`, `@galaxy-sim/sim-worker`, `@galaxy-sim/client`, `@galaxy-sim/tools`.
- Добавлены строгие TypeScript-конфиги, Vitest, ESLint, Prettier и GitHub Actions CI.
- Перенесены JSON-данные из `docs/galaxy-sim-data` в `packages/sim-data/data`.
- Добавлены JSON Schema для всех переданных data-файлов и генерация TypeScript-типов из схем.
- Реализован `sim-data` loader `load()` с проверкой схем, индексов и ссылочной целостности.
- Перенесены семь валидаторов данных в `packages/tools/src` и подключена команда `validate:data`.
- Реализована детерминированная база `sim-core`: seeded PRNG, tick-clock, entity ids/generations, SoA arena, typed-array pool.
- Реализована детерминированная event queue с сортировкой по `(tick, sequenceId)`, cancel и serialize/deserialize.
- Реализованы binary snapshots, стабильный snapshot hash, `PersistPort`, Node file persist и journal compaction.
- Добавлены instrumentation counters/timers и headless CLI.
- Добавлены golden-run baseline/check, pathology scenarios и bench harness.
- Добавлен минимальный worker protocol и intentionally minimal React/Vite client для Stage 0 smoke-run.

## Проверки

- `corepack pnpm -r build` — pass.
- `corepack pnpm -r test` — pass, 24 теста.
- `corepack pnpm lint` — pass.
- `corepack pnpm format:check` — pass.
- `corepack pnpm validate:data` — pass.
- `corepack pnpm golden:check` — pass.
- `corepack pnpm scenarios:check` — pass.
- `corepack pnpm bench -- --seeds 50 --years 1000 --out reports/bench-stage0.json` — pass.
- `corepack pnpm sim:run -- --seed 20260904 --ticks 100000 --snapshot-every 10000 --report reports/headless-stage0.json` — pass.
- Vite dev server запущен и проверен: `http://127.0.0.1:5173`, `HTTP 200`.

## Golden hashes

- seed `20260904`, 100000 ticks: `d7793960913cb36cd8d1a42711bcaba7`.
- seed `7`, 100000 ticks: `8c59c9af0e014213bb86d2d4a7b1eea8`.
- seed `424242`, 100000 ticks: `b44a885a05345dec6e1dd18807e311a1`.

## Артефакты

- Golden baselines: `packages/tools/golden/seed-*.hash`.
- Data validation reports: `packages/tools/reports/*.txt`.
- Chain graph baseline: `packages/tools/reports/chain-graph.expected.mmd`.
- Headless run report: `packages/tools/reports/headless-stage0.json`.
- Bench report: `packages/tools/reports/bench-stage0.json`.

## Важные оговорки

- Данные сохранены по фактическому состоянию из `docs/galaxy-sim-data`; текущие counts отличаются от старого плана: 37 resources, 36 batch recipes, 4 continuous processes, 6 sinks, 49 buildings, 94 techs, 12 hulls, 49 modules, 9 doctrines.
- `bootstrap.mjs` сохраняет известную открытую балансовую проблему стартового пакета: критерий `noResourceStarvedLongerThanDays` нарушен для текущих данных. `validate:data` запускает bootstrap, сохраняет report и пропускает именно этот known issue, чтобы Stage 0 проверял инфраструктуру без изменения баланса данных.
- В каталоге нет `.git`, поэтому коммит не создавался.
