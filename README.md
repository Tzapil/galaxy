# Galaxy Sim

Браузерная симуляция галактических цивилизаций. Репозиторий собран как pnpm-монорепо:
чистое детерминированное ядро, пакет данных, worker-обёртка, клиент и CLI-инструменты.

## Быстрый старт

```bash
corepack enable
corepack pnpm install
corepack pnpm -r build
corepack pnpm -r test
corepack pnpm -r lint
corepack pnpm dev
```

Клиент живёт в `packages/client` и поднимается Vite-сервером. На этапе 0 он отдаёт
минимальную страницу без игровой логики.

## Пакеты

| Пакет                    | Назначение                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `@galaxy-sim/sim-core`   | Чистая логика симуляции: тик, PRNG, ID, SoA, очередь, снапшоты. Ноль внешних зависимостей, ноль DOM. |
| `@galaxy-sim/sim-data`   | JSON-данные, JSON Schema, типы и загрузчик с валидацией.                                             |
| `@galaxy-sim/sim-worker` | Web Worker-протокол поверх `sim-core`.                                                               |
| `@galaxy-sim/client`     | React + PixiJS + uPlot клиент.                                                                       |
| `@galaxy-sim/tools`      | CLI-прогоны, golden-run, стенд и переносимые валидаторы данных.                                      |

## Проверки данных

```bash
corepack pnpm validate:data
```

Агрегатор запускает `validate -> tech -> design -> bootstrap -> galaxy -> war`, пишет
отчёты в `packages/tools/reports` и проверяет baseline-метрики. Данные считаются
эталоном: числа в JSON не правятся в инфраструктурных шагах.

## Golden-run

```bash
corepack pnpm golden:check
corepack pnpm golden:update -- --reason "описание намеренного изменения"
```

Если `golden:check` упал, сначала ищем недетерминизм: случайный `Math.random()`,
`Date.now()`, `performance.now()`, зависимость от обхода `Map`/`Set`/`Object.keys` или
порядок событий внутри одного тика. Эталон обновляется только явной командой с причиной,
которая дописывается в `CHANGELOG.md`.

## Headless и стенд

```bash
corepack pnpm sim:run -- --seed 20260904 --ticks 100000 --snapshot-every 10000
corepack pnpm bench -- --seeds 50 --years 1000
corepack pnpm scenarios:check
```

Инструментовка выключаема и не входит в хеш состояния. Включение приборов не должно
менять `golden-run`.
