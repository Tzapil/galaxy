// Валидатор и анализатор дерева технологий.
// Запуск: node tech.mjs
//
// Проверяет:
//   1. Ссылочную целостность в обе стороны: каждый узел открывает существующие сущности,
//      и каждая сущность фазы 1 кем-то открывается.
//   2. Отсутствие циклов в предпосылках и достижимость всех узлов от корня.
//   3. Отсутствие циклов бутстрапа: всё, что нужно для производства научных данных,
//      обязано быть доступно на нулевом тике.
//   4. Баланс трёх видов данных по стоимости.
//   5. Критические пути до ключевых возможностей.
//   6. Прогон исследования: сколько игровых лет занимает каждый тир.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, loadData } from "./values.mjs";

const { BATCH, BUILDINGS } = loadData();
const HULLS = JSON.parse(readFileSync(join(DATA_DIR, "hulls.json"), "utf8")).hulls;
const MODULES = JSON.parse(readFileSync(join(DATA_DIR, "modules.json"), "utf8")).modules;
const techDoc = JSON.parse(readFileSync(join(DATA_DIR, "techs.json"), "utf8"));
const TECHS = techDoc.techs;
const BRANCHES = techDoc.branches;

const T = new Map(TECHS.map((t) => [t.id, t]));
const DATA_TYPES = ["physics", "engineering", "bio"];
const errors = [];
const warnings = [];

// ---------------------------------------------------------------- 1. целостность

const moduleIds = new Set(MODULES.map((m) => m.id));
const hullIds = new Set(HULLS.map((h) => h.id));
const buildingIds = new Set(BUILDINGS.map((b) => b.id));
const recipeIds = new Set(BATCH.map((r) => r.id));

const unlockedModules = new Map();
const unlockedHulls = new Map();
const unlockedBuildings = new Map();

for (const t of TECHS) {
  for (const dep of t.requires ?? []) {
    if (!T.has(dep)) errors.push(`Технология ${t.id}: неизвестная предпосылка "${dep}"`);
  }
  const cost = t.repeatable ? t.baseCost : t.cost;
  for (const k of Object.keys(cost ?? {})) {
    if (!DATA_TYPES.includes(k)) errors.push(`Технология ${t.id}: неизвестный вид данных "${k}"`);
  }
  if (t.repeatable && !(t.costGrowth > 1))
    errors.push(`Технология ${t.id}: повторяемая без роста стоимости`);

  for (const e of [...(t.effects ?? []), ...(t.effectPerLevel ?? [])]) {
    switch (e.type) {
      case "unlockModule":
        if (!moduleIds.has(e.id))
          errors.push(`Технология ${t.id}: открывает несуществующий модуль "${e.id}"`);
        if (unlockedModules.has(e.id))
          errors.push(
            `Модуль "${e.id}" открывается дважды: ${unlockedModules.get(e.id)} и ${t.id}`
          );
        unlockedModules.set(e.id, t.id);
        break;
      case "unlockHull":
        if (!hullIds.has(e.id))
          errors.push(`Технология ${t.id}: открывает несуществующий корпус "${e.id}"`);
        if (unlockedHulls.has(e.id))
          errors.push(`Корпус "${e.id}" открывается дважды: ${unlockedHulls.get(e.id)} и ${t.id}`);
        unlockedHulls.set(e.id, t.id);
        break;
      case "unlockBuilding":
        if (!buildingIds.has(e.id))
          errors.push(`Технология ${t.id}: открывает несуществующее здание "${e.id}"`);
        if (unlockedBuildings.has(e.id))
          errors.push(
            `Здание "${e.id}" открывается дважды: ${unlockedBuildings.get(e.id)} и ${t.id}`
          );
        unlockedBuildings.set(e.id, t.id);
        break;
      case "modifier": {
        const tgt = e.target ?? "";
        if (tgt.startsWith("recipe:") && !recipeIds.has(tgt.slice(7)))
          errors.push(`Технология ${t.id}: модификатор на несуществующий рецепт "${tgt}"`);
        if (tgt.startsWith("module:") && !moduleIds.has(tgt.slice(7)))
          errors.push(`Технология ${t.id}: модификатор на несуществующий модуль "${tgt}"`);
        if (tgt.startsWith("building:") && !buildingIds.has(tgt.slice(9)))
          errors.push(`Технология ${t.id}: модификатор на несуществующее здание "${tgt}"`);
        break;
      }
      case "ability":
        break;
      default:
        errors.push(`Технология ${t.id}: неизвестный тип эффекта "${e.type}"`);
    }
  }
}

// обратная проверка: всё ли фазы 1 кем-то открывается
for (const m of MODULES)
  if (m.phase === 1 && !unlockedModules.has(m.id))
    errors.push(`Модуль "${m.id}" (${m.name}) не открывается ни одной технологией`);
for (const h of HULLS)
  if (h.phase === 1 && !unlockedHulls.has(h.id))
    errors.push(`Корпус "${h.id}" (${h.name}) не открывается ни одной технологией`);
for (const b of BUILDINGS)
  if (!unlockedBuildings.has(b.id))
    errors.push(`Здание "${b.id}" (${b.name}) не открывается ни одной технологией`);

// сверка с полем tech в самих сущностях
for (const m of MODULES) {
  if (m.phase !== 1 || !m.tech) continue;
  const actual = unlockedModules.get(m.id);
  if (actual && actual !== m.tech)
    warnings.push(`Модуль ${m.id}: поле tech="${m.tech}", а открывает его "${actual}"`);
}
for (const h of HULLS) {
  if (h.phase !== 1 || !h.tech) continue;
  const actual = unlockedHulls.get(h.id);
  if (actual && actual !== h.tech)
    warnings.push(`Корпус ${h.id}: поле tech="${h.tech}", а открывает его "${actual}"`);
}

// ---------------------------------------------------------------- 2. циклы и достижимость

const cycles = [];
const WHITE = 0,
  GREY = 1,
  BLACK = 2;
const colour = new Map([...T.keys()].map((k) => [k, WHITE]));
function dfs(id, stack) {
  colour.set(id, GREY);
  stack.push(id);
  for (const dep of T.get(id)?.requires ?? []) {
    if (!T.has(dep)) continue;
    if (colour.get(dep) === GREY) cycles.push(stack.slice(stack.indexOf(dep)).concat(dep));
    else if (colour.get(dep) === WHITE) dfs(dep, stack);
  }
  stack.pop();
  colour.set(id, BLACK);
}
for (const id of T.keys()) if (colour.get(id) === WHITE) dfs(id, []);

const reachable = new Set();
(function walk() {
  let changed = true;
  reachable.add("start");
  while (changed) {
    changed = false;
    for (const t of TECHS) {
      if (reachable.has(t.id)) continue;
      const deps = t.requires ?? [];
      if (deps.length && deps.every((d) => reachable.has(d))) {
        reachable.add(t.id);
        changed = true;
      }
    }
  }
})();
for (const t of TECHS)
  if (!reachable.has(t.id)) errors.push(`Технология ${t.id} недостижима от корня`);

// ---------------------------------------------------------------- 3. циклы бутстрапа

const startTech = T.get("start");
const startBuildings = new Set(
  (startTech?.effects ?? []).filter((e) => e.type === "unlockBuilding").map((e) => e.id)
);
const buildingByRecipe = new Map(BUILDINGS.filter((b) => b.recipe).map((b) => [b.recipe, b.id]));
const producerOf = new Map();
for (const r of BATCH) for (const out of Object.keys(r.outputs)) producerOf.set(out, r.id);

// какие ресурсы производимы, если построены только стартовые здания
const startProducible = new Set(["energy"]);
{
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of BATCH) {
      const b = buildingByRecipe.get(r.id);
      if (!b || !startBuildings.has(b)) continue;
      const inputsOk = Object.keys(r.inputs ?? {}).every((i) => startProducible.has(i));
      if (!inputsOk) continue;
      for (const out of Object.keys(r.outputs)) {
        if (!startProducible.has(out)) {
          startProducible.add(out);
          changed = true;
        }
      }
    }
  }
}
for (const dataType of DATA_TYPES) {
  const id = `data_${dataType}`;
  if (!startProducible.has(id)) {
    errors.push(
      `ЦИКЛ БУТСТРАПА: ${id} невозможно произвести стартовыми зданиями — наука не запустится`
    );
  }
}
// потребности населения тоже должны быть покрыты с нуля
for (const need of ["food", "water", "medicine", "consumer_goods", "fuel"]) {
  if (!startProducible.has(need))
    errors.push(`ЦИКЛ БУТСТРАПА: ${need} невозможно произвести стартовыми зданиями`);
}

// ---------------------------------------------------------------- анализ

const totalCost = (t) =>
  Object.values(t.repeatable ? t.baseCost : (t.cost ?? {})).reduce((a, b) => a + b, 0);
const costByType = (t) => (t.repeatable ? t.baseCost : (t.cost ?? {}));

const line = "─".repeat(96);
console.log(line);
console.log("ВАЛИДАЦИЯ ДЕРЕВА ТЕХНОЛОГИЙ");
console.log(line);
console.log(
  `Узлов:            ${TECHS.length}  (повторяемых: ${TECHS.filter((t) => t.repeatable).length}, фаза 2: ${TECHS.filter((t) => t.phase === 2).length})`
);
console.log(`Веток:            ${BRANCHES.length}`);
console.log(
  `Открывает:        ${unlockedModules.size} модулей, ${unlockedHulls.size} корпусов, ${unlockedBuildings.size} зданий`
);
console.log(`Циклов:           ${cycles.length}${cycles.length ? " ← ОШИБКА" : "  (ок)"}`);
for (const c of cycles) console.log(`   ${c.join(" → ")}`);
console.log(`Недостижимых:     ${TECHS.length - reachable.size}`);
console.log("");
console.log(
  `Производимо стартовыми зданиями: ${[...startProducible]
    .filter((x) => x !== "energy")
    .sort()
    .join(", ")}`
);
console.log("");
if (errors.length) {
  console.log("ОШИБКИ:");
  for (const e of errors) console.log("   ✗ " + e);
} else console.log("Ошибок нет.");
if (warnings.length) {
  console.log("ПРЕДУПРЕЖДЕНИЯ:");
  for (const w of warnings) console.log("   ! " + w);
}
console.log("");

console.log(line);
console.log("ВЕТКИ");
console.log(line);
console.log(
  "ветка".padEnd(28) +
    "узлов".padStart(7) +
    "повтор".padStart(8) +
    "физика".padStart(9) +
    "инженер".padStart(9) +
    "био".padStart(8) +
    "итого".padStart(9)
);
for (const br of BRANCHES) {
  const nodes = TECHS.filter((t) => t.branch === br.id);
  const sum = { physics: 0, engineering: 0, bio: 0 };
  for (const n of nodes.filter((x) => !x.repeatable))
    for (const [k, v] of Object.entries(n.cost ?? {})) sum[k] += v;
  console.log(
    br.name.padEnd(28) +
      String(nodes.length).padStart(7) +
      String(nodes.filter((x) => x.repeatable).length).padStart(8) +
      String(sum.physics).padStart(9) +
      String(sum.engineering).padStart(9) +
      String(sum.bio).padStart(8) +
      String(sum.physics + sum.engineering + sum.bio).padStart(9)
  );
}
const grand = { physics: 0, engineering: 0, bio: 0 };
for (const n of TECHS.filter((x) => !x.repeatable && x.phase === 1))
  for (const [k, v] of Object.entries(n.cost ?? {})) grand[k] += v;
const grandTotal = grand.physics + grand.engineering + grand.bio;
console.log("");
console.log(
  `Итого по фазе 1: физика ${grand.physics} (${((grand.physics / grandTotal) * 100).toFixed(0)}%), ` +
    `инженерия ${grand.engineering} (${((grand.engineering / grandTotal) * 100).toFixed(0)}%), ` +
    `биология ${grand.bio} (${((grand.bio / grandTotal) * 100).toFixed(0)}%)`
);
const share = [grand.physics, grand.engineering, grand.bio].map((v) => v / grandTotal);
if (Math.min(...share) < 0.15)
  console.log(
    "   ← перекос: один из видов данных почти не востребован, соответствующие лаборатории будут не нужны"
  );
else
  console.log("   ✓ все три вида данных востребованы (каждый не меньше 15% суммарной стоимости)");
console.log("");

// ---------------------------------------------------------------- критические пути

function prereqClosure(id) {
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    if (out.has(cur)) continue;
    out.add(cur);
    for (const d of T.get(cur)?.requires ?? []) stack.push(d);
  }
  out.delete("start");
  return out;
}

console.log(line);
console.log("КРИТИЧЕСКИЕ ПУТИ ДО КЛЮЧЕВЫХ ВОЗМОЖНОСТЕЙ");
console.log(line);
const goals = [
  ["Крейсер", "hull_cruiser"],
  ["Линкор", "hull_battleship"],
  ["Щит Мк3", "shields_3"],
  ["Рельсотрон Мк3", "kinetic_3"],
  ["Плазма Мк3", "plasma_3"],
  ["Колонизация", "colonization"],
  ["Терраформирование", "terraforming_1"],
  ["Термояд", "fusion_power"],
  ["Региональные столицы", "regional_governance"],
  ["Протоколы автономии", "autonomous_protocols"]
];
console.log(
  "цель".padEnd(26) +
    "узлов".padStart(7) +
    "физика".padStart(9) +
    "инженер".padStart(9) +
    "био".padStart(8) +
    "итого".padStart(9)
);
const goalCosts = new Map();
for (const [label, id] of goals) {
  if (!T.has(id)) {
    console.log(`${label}: цель "${id}" не найдена`);
    continue;
  }
  const cl = prereqClosure(id);
  const sum = { physics: 0, engineering: 0, bio: 0 };
  for (const n of cl) for (const [k, v] of Object.entries(costByType(T.get(n)))) sum[k] += v;
  const tot = sum.physics + sum.engineering + sum.bio;
  goalCosts.set(id, { cl, sum, tot });
  console.log(
    label.padEnd(26) +
      String(cl.size).padStart(7) +
      String(sum.physics).padStart(9) +
      String(sum.engineering).padStart(9) +
      String(sum.bio).padStart(8) +
      String(tot).padStart(9)
  );
}
console.log("");

// ---------------------------------------------------------------- прогон исследования

console.log(line);
console.log("ПРОГОН: СКОЛЬКО ИГРОВЫХ ЛЕТ ЗАНИМАЕТ ИССЛЕДОВАНИЕ");
console.log(line);
const labRate = {};
for (const dt of DATA_TYPES) {
  const r = BATCH.find((x) => x.outputs[`data_${dt}`]);
  labRate[dt] = r ? r.outputs[`data_${dt}`] / r.durationDays : 0;
}
console.log(
  `Выработка одной лаборатории: ${DATA_TYPES.map((d) => `${d} ${labRate[d].toFixed(2)}/день`).join(", ")}`
);
console.log("");
console.log("цель".padEnd(26) + [2, 6, 15, 40].map((n) => `${n} лаб.`.padStart(11)).join(""));
for (const [label, id] of goals) {
  const g = goalCosts.get(id);
  if (!g) continue;
  let row = label.padEnd(26);
  for (const labs of [2, 6, 15, 40]) {
    // лаборатории каждого типа; узкое место — самый дефицитный вид данных
    const years = Math.max(...DATA_TYPES.map((d) => (g.sum[d] || 0) / (labRate[d] * labs) / 365));
    row += `${years.toFixed(1)} л.`.padStart(11);
  }
  console.log(row);
}
console.log("");
console.log("Считается по самому дефицитному виду данных: если фракция вложилась только в физику,");
console.log("её инженерные технологии станут узким местом, и MRP это обнаружит.");
console.log("");

// ---------------------------------------------------------------- эпохи

console.log(line);
console.log("ЭПОХИ ПО ТИРАМ (заменяют заглушку early/mid/late в design.mjs)");
console.log(line);
for (const maxTier of [1, 2, 3, 4]) {
  const set = TECHS.filter((t) => t.phase === 1 && t.tier <= maxTier && !t.repeatable);
  const mods = set.flatMap((t) =>
    (t.effects ?? []).filter((e) => e.type === "unlockModule").map((e) => e.id)
  );
  const hulls = set.flatMap((t) =>
    (t.effects ?? []).filter((e) => e.type === "unlockHull").map((e) => e.id)
  );
  const cost = set.reduce((a, t) => a + totalCost(t), 0);
  const years6 = Math.max(
    ...DATA_TYPES.map(
      (d) => set.reduce((a, t) => a + (costByType(t)[d] || 0), 0) / (labRate[d] * 6) / 365
    )
  );
  console.log(
    `тир ≤ ${maxTier}: ${String(set.length).padStart(3)} технологий, ${String(mods.length).padStart(2)} модулей, ${hulls.length} корпусов, стоимость ${String(cost).padStart(6)}, ~${years6.toFixed(0)} лет при 6 лабораториях`
  );
}
console.log("");

// ---------------------------------------------------------------- повторяемые

console.log(line);
console.log("ПОВТОРЯЕМЫЕ ТЕХНОЛОГИИ: СТОИМОСТЬ ПО УРОВНЯМ");
console.log(line);
const rep = TECHS.filter((t) => t.repeatable);
console.log(
  "технология".padEnd(34) + [1, 5, 10, 20, 40].map((l) => `ур.${l}`.padStart(11)).join("")
);
for (const t of rep) {
  const base = Object.values(t.baseCost).reduce((a, b) => a + b, 0);
  let row = t.name.slice(0, 32).padEnd(34);
  for (const lvl of [1, 5, 10, 20, 40])
    row += Math.round(base * Math.pow(t.costGrowth, lvl - 1))
      .toLocaleString("ru-RU")
      .padStart(11);
  console.log(row);
}
console.log("");
console.log("Рост стоимости гарантирует, что дерево нельзя «доисследовать»: к сороковому уровню");
console.log("цена вырастает в тысячи раз, и вложение в науку остаётся осмысленным выбором вечно.");
console.log(line);

process.exit(errors.length || cycles.length ? 1 : 0);
