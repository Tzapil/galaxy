// Валидатор графа производственных цепочек.
// Запуск: node validate.mjs
//
// Проверяет:
//   1. Ссылочную целостность (все ресурсы в рецептах существуют)
//   2. Отсутствие материальных циклов (циклы через energy допустимы — это обратная связь энергетики)
//   3. Что каждый ресурс кем-то производится и кем-то потребляется
//   4. Считает экономическую стоимость каждого ресурса методом итеративной релаксации
//   5. Считает плотность стоимости (value / объём) — проверка свойства «перерабатывай у источника»
//   6. Считает глубину цепочки до сырья

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, LABOR_VALUE, loadData, computeValues, recipeUnitCost as unitCost, makeExploder } from './values.mjs';

const { RES, BATCH, CONT, SINKS, BUILDINGS, producedBy } = loadData();

const errors = [];
const warnings = [];

// ---------------------------------------------------------------- 1. целостность

for (const r of BATCH) {
  for (const id of [...Object.keys(r.inputs ?? {}), ...Object.keys(r.outputs ?? {})]) {
    if (!RES.has(id)) errors.push(`Рецепт ${r.id}: неизвестный ресурс "${id}"`);
  }
  if (!r.outputs || Object.keys(r.outputs).length === 0) errors.push(`Рецепт ${r.id}: нет выходов`);
  if (!(r.durationDays > 0)) errors.push(`Рецепт ${r.id}: некорректная длительность`);
  if (!(r.workers > 0)) errors.push(`Рецепт ${r.id}: некорректное число рабочих`);
}

for (const c of CONT) {
  const io = { ...(c.inputs ?? {}), ...(c.inputsPerDay ?? {}), ...(c.outputPerDay ?? {}) };
  for (const id of Object.keys(io)) {
    if (!RES.has(id)) errors.push(`Процесс ${c.id}: неизвестный ресурс "${id}"`);
  }
  for (const id of Object.keys(c.perThousandPopPerDay ?? {})) {
    if (!RES.has(id)) errors.push(`Процесс ${c.id}: неизвестный ресурс "${id}"`);
  }
}

for (const s of SINKS) {
  for (const id of s.consumes) if (!RES.has(id)) errors.push(`Сток ${s.id}: неизвестный ресурс "${id}"`);
}

// --- здания
const recipeIds = new Set([...BATCH.map((r) => r.id), ...CONT.map((c) => c.id)]);
const buildingIds = new Set(BUILDINGS.map((b) => b.id));
const buildingsWithRecipe = new Set(BUILDINGS.filter((b) => b.recipe).map((b) => b.recipe));

for (const b of BUILDINGS) {
  if (b.recipe && !recipeIds.has(b.recipe)) errors.push(`Здание ${b.id}: неизвестный рецепт "${b.recipe}"`);
  if (!(b.slots >= 1)) errors.push(`Здание ${b.id}: некорректное число слотов`);
  for (const id of Object.keys(b.buildCost ?? {})) {
    if (!RES.has(id)) errors.push(`Здание ${b.id}: неизвестный ресурс в стоимости постройки "${id}"`);
  }
  if (!(b.buildDays > 0)) errors.push(`Здание ${b.id}: некорректный срок постройки`);
}
for (const r of BATCH) {
  if (!r.building) { errors.push(`Рецепт ${r.id}: не указано здание`); continue; }
  if (!buildingIds.has(r.building)) errors.push(`Рецепт ${r.id}: ссылается на несуществующее здание "${r.building}"`);
  if (!buildingsWithRecipe.has(r.id)) warnings.push(`Рецепт ${r.id} не привязан ни к одному зданию обратной ссылкой`);
}
for (const c of CONT) {
  if (c.kind === 'consumption') continue;
  if (c.building && !buildingIds.has(c.building)) errors.push(`Процесс ${c.id}: несуществующее здание "${c.building}"`);
}

// ---------------------------------------------------------------- 2. циклы

const materialCycles = [];
const energyCycles = [];
const WHITE = 0, GREY = 1, BLACK = 2;
const colour = new Map([...RES.keys()].map((k) => [k, WHITE]));

function dfs(node, stack) {
  colour.set(node, GREY);
  stack.push(node);
  for (const recipe of producedBy.get(node) ?? []) {
    for (const dep of Object.keys(recipe.inputs ?? {})) {
      if (colour.get(dep) === GREY) {
        const cycle = stack.slice(stack.indexOf(dep)).concat(dep);
        (cycle.includes('energy') ? energyCycles : materialCycles).push(cycle);
      } else if (colour.get(dep) === WHITE) {
        dfs(dep, stack);
      }
    }
  }
  stack.pop();
  colour.set(node, BLACK);
}
for (const id of RES.keys()) if (colour.get(id) === WHITE) dfs(id, []);

// ---------------------------------------------------------------- 3. сироты

const consumedSomewhere = new Set();
for (const r of BATCH) for (const id of Object.keys(r.inputs ?? {})) consumedSomewhere.add(id);
for (const c of CONT) {
  for (const id of Object.keys({ ...(c.inputs ?? {}), ...(c.inputsPerDay ?? {}) })) consumedSomewhere.add(id);
  for (const id of Object.keys(c.perThousandPopPerDay ?? {})) consumedSomewhere.add(id);
}
for (const s of SINKS) for (const id of s.consumes) consumedSomewhere.add(id);

for (const [id, r] of RES) {
  if (r.phase !== 1) continue;
  if (!producedBy.has(id)) errors.push(`Ресурс "${id}" (${r.name}) нигде не производится`);
  if (!consumedSomewhere.has(id)) errors.push(`Ресурс "${id}" (${r.name}) нигде не потребляется — мёртвый узел`);
}

// ---------------------------------------------------------------- 4. стоимость (итеративная релаксация)

const value = computeValues(RES, producedBy);
const recipeUnitCost = (recipe, outId) => unitCost(recipe, outId, value);

// ---------------------------------------------------------------- 5. глубина цепочки

const depth = new Map();
function chainDepth(id, seen = new Set()) {
  if (depth.has(id)) return depth.get(id);
  if (seen.has(id)) return 0;
  seen.add(id);
  let d = 0;
  for (const recipe of producedBy.get(id) ?? []) {
    const ins = Object.keys(recipe.inputs ?? {}).filter((x) => x !== 'energy');
    if (ins.length === 0) { d = Math.max(d, 0); continue; }
    let local = 0;
    for (const inId of ins) local = Math.max(local, chainDepth(inId, new Set(seen)) + 1);
    d = Math.max(d, local);
  }
  depth.set(id, d);
  return d;
}
for (const id of RES.keys()) chainDepth(id);

// ---------------------------------------------------------------- отчёт

const line = '─'.repeat(96);
console.log(line);
console.log('ВАЛИДАЦИЯ ГРАФА ПРОИЗВОДСТВЕННЫХ ЦЕПОЧЕК');
console.log(line);
console.log(`Ресурсов:            ${RES.size}  (фаза 1: ${[...RES.values()].filter(r => r.phase === 1).length})`);
console.log(`Партийных рецептов:  ${BATCH.length}`);
console.log(`Непрерывных:         ${CONT.length}`);
console.log(`Стоков:              ${SINKS.length}`);
console.log('');

console.log(`Материальных циклов: ${materialCycles.length}${materialCycles.length ? ' ← ОШИБКА' : '  (ок)'}`);
for (const c of materialCycles) console.log(`   ${c.join(' → ')}`);
const uniqEnergyCycles = [...new Set(energyCycles.map((c) => c.join(' → ')))];
console.log(`Циклов через энергию: ${uniqEnergyCycles.length}  (допустимы, разрешаются фиксированной точкой)`);
for (const c of uniqEnergyCycles.slice(0, 6)) console.log(`   ${c}`);
console.log('');

if (errors.length) {
  console.log('ОШИБКИ:');
  for (const e of errors) console.log('   ✗ ' + e);
} else {
  console.log('Ошибок целостности нет.');
}
if (warnings.length) {
  console.log('ПРЕДУПРЕЖДЕНИЯ:');
  for (const w of warnings) console.log('   ! ' + w);
}
console.log('');

console.log(line);
console.log('ЭКОНОМИЧЕСКАЯ СТОИМОСТЬ И ПЛОТНОСТЬ');
console.log(line);
console.log(
  'ресурс'.padEnd(18) + 'ур'.padStart(3) + 'глуб'.padStart(6) +
  'стоим/ед'.padStart(11) + 'объём'.padStart(8) + 'стоим/объём'.padStart(13) + '  профиль'
);
const rows = [...RES.values()].filter((r) => r.phase === 1).sort((a, b) => a.tier - b.tier || value.get(a.id) - value.get(b.id));
for (const r of rows) {
  const v = value.get(r.id);
  const dens = r.unitVolume > 0 ? v / r.unitVolume : NaN;
  const bar = Number.isFinite(dens) ? '█'.repeat(Math.min(40, Math.round(Math.log10(Math.max(dens, 0.01)) * 12 + 12))) : '—';
  console.log(
    r.id.padEnd(18) + String(r.tier).padStart(3) + String(depth.get(r.id)).padStart(6) +
    v.toFixed(2).padStart(11) + String(r.unitVolume).padStart(8) +
    (Number.isFinite(dens) ? dens.toFixed(2) : '—').padStart(13) + '  ' + bar
  );
}
console.log('');

console.log(line);
console.log('ПРОВЕРКА СВОЙСТВА «ПЕРЕРАБАТЫВАЙ У ИСТОЧНИКА»');
console.log(line);
const pairs = [['ore', 'metal'], ['ice', 'water'], ['gas', 'fuel'], ['gas', 'polymers'], ['silicates', 'ceramics'], ['metal', 'alloys'], ['crystals', 'superconductors']];
for (const [raw, refined] of pairs) {
  const dRaw = value.get(raw) / RES.get(raw).unitVolume;
  const dRef = value.get(refined) / RES.get(refined).unitVolume;
  const ratio = dRef / dRaw;
  console.log(`${raw.padEnd(14)} → ${refined.padEnd(16)} плотность стоимости растёт в ${ratio.toFixed(1)}× ${ratio > 1.5 ? '✓' : '← слабо, возить сырьё не наказывается'}`);
}
console.log('');

console.log(line);
console.log('ЭНЕРГЕТИКА: ЦЕНА ЗА ЕДИНИЦУ, ВЫРАБОТКА ЗА СЛОТ, ЛОГИСТИЧЕСКАЯ НАГРУЗКА');
console.log(line);
console.log('станция'.padEnd(16) + 'выход/д'.padStart(9) + 'цена/ед'.padStart(10) + 'за слот'.padStart(9) + 'объём/д'.padStart(9) + 'объём на 100 эн'.padStart(17));
for (const c of CONT.filter((x) => x.kind === 'power')) {
  const out = c.outputPerDay.energy;
  let cost = LABOR_VALUE * c.workers;
  let vol = 0;
  for (const [inId, qty] of Object.entries(c.inputsPerDay ?? {})) {
    cost += value.get(inId) * qty;
    vol += (RES.get(inId)?.unitVolume ?? 0) * qty;
  }
  console.log(
    c.id.padEnd(16) + out.toFixed(0).padStart(9) + (cost / out).toFixed(3).padStart(10) +
    out.toFixed(0).padStart(9) + vol.toFixed(2).padStart(9) + ((vol / out) * 100).toFixed(2).padStart(17)
  );
}
console.log('');
console.log('Осей три, а не одна. Солнце: дешевле всех и ноль логистики, но хуже всех за слот.');
console.log('Термояд: лучший за слот и дешевле деления, но требует втрое больше хаулинга.');
console.log('Деление: выбор для удалённых баз, где важен не кредит, а длина плеча снабжения.');
console.log('');

console.log(line);
console.log('ВЫБРОСЫ СТОИМОСТИ ВНУТРИ УРОВНЯ');
console.log(line);
let outlierCount = 0;
for (const tier of [1, 2, 3, 4, 5]) {
  const group = [...RES.values()].filter((r) => r.phase === 1 && r.tier === tier && Number.isFinite(value.get(r.id)));
  if (group.length < 2) continue;
  const vals = group.map((r) => value.get(r.id)).sort((a, b) => a - b);
  const median = vals[Math.floor(vals.length / 2)];
  const flagged = group.filter((r) => value.get(r.id) > median * 4);
  console.log(`Уровень ${tier}: медиана ${median.toFixed(2)}, разброс ${vals[0].toFixed(2)}–${vals.at(-1).toFixed(2)}` +
    (flagged.length ? `  ← выбросы: ${flagged.map((r) => `${r.id} (${value.get(r.id).toFixed(1)}, ×${(value.get(r.id) / median).toFixed(1)})`).join(', ')}` : '  ✓'));
  outlierCount += flagged.length;
}
console.log('');

console.log(line);
console.log('СЕБЕСТОИМОСТЬ РЕДКОГО СЫРЬЯ ПРОТИВ ОБЫЧНОГО');
console.log(line);
const commons = [...RES.values()].filter((r) => r.category === 'raw' && r.rarity === 'common');
const rares = [...RES.values()].filter((r) => r.category === 'raw' && r.rarity === 'rare');
const avgCommon = commons.reduce((s, r) => s + value.get(r.id), 0) / commons.length;
for (const r of rares) {
  const ratio = value.get(r.id) / avgCommon;
  const ok = ratio >= 2 && ratio <= 5;
  console.log(`${r.id.padEnd(16)} ${value.get(r.id).toFixed(2).padStart(7)}  = ×${ratio.toFixed(1)} от обычного  ${ok ? '✓' : '← вне коридора 2–5×, редкость учитывается дважды'}`);
}
console.log('Редкость должна возникать из географии и теневых цен, а не из себестоимости добычи.');
console.log('');

console.log(line);
console.log('СТОИМОСТЬ ФЛОТА В СЫРЬЕ (развёртка через MRP)');
console.log(line);
const rawIds = [...RES.values()].filter((r) => r.category === 'raw' && r.phase === 1).map((r) => r.id);
const explode = makeExploder(RES, producedBy, value);
const cruiser = { hull_frames: 4, reactors: 2, thrusters: 3, weapons: 4, shields: 3, armor: 6, life_support: 1 };
console.log('Условный крейсер: ' + Object.entries(cruiser).map(([k, v]) => `${k}×${v}`).join(', '));
const totalRaw = new Map();
for (const [k, v] of Object.entries(cruiser)) explode(k, v, totalRaw);
const sortedRaw = [...totalRaw.entries()].sort((a, b) => b[1] - a[1]);
for (const [id, qty] of sortedRaw) {
  console.log(`   ${id.padEnd(16)} ${qty.toFixed(1).padStart(9)} ед.   ${RES.get(id).rarity === 'rare' ? '← редкое' : ''}`);
}
const cruiserValue = Object.entries(cruiser).reduce((s, [k, v]) => s + value.get(k) * v, 0);
console.log(`   ${'ИТОГО стоимость'.padEnd(16)} ${cruiserValue.toFixed(0).padStart(9)} у.е.`);
console.log('');

console.log(line);
console.log('ГОДОВОЙ РАСХОД СЫРЬЯ ОДНОЙ ЭНЕРГОСТАНЦИЕЙ');
console.log(line);
for (const c of CONT.filter((x) => x.kind === 'power')) {
  const entries = Object.entries(c.inputsPerDay ?? {});
  if (!entries.length) { console.log(`${c.id.padEnd(16)} ничего не потребляет`); continue; }
  const parts = entries.map(([id, q]) => {
    const raw = explode(id, q * 365, new Map());
    const rawStr = [...raw.entries()].map(([r, v]) => `${r} ${v.toFixed(0)}`).join(', ');
    return `${id} ${(q * 365).toFixed(0)} ед./год  →  сырьё: ${rawStr}`;
  });
  console.log(`${c.id.padEnd(16)} ${parts.join('; ')}`);
}
console.log('Это то, чего не видно в развёртке одного корабля: энергетика создаёт постоянный,');
console.log('а не разовый спрос, и именно она делает радиоактивы стратегическим ресурсом.');
console.log('');

// ---------------------------------------------------------------- диаграмма

const tierOf = (id) => RES.get(id)?.tier ?? 9;
let mmd = 'graph LR\n';
for (const r of BATCH) {
  for (const inId of Object.keys(r.inputs ?? {})) {
    if (inId === 'energy') continue;
    for (const outId of Object.keys(r.outputs)) mmd += `  ${inId} --> ${outId}\n`;
  }
}
mmd += '\n';
for (const [id, r] of RES) {
  if (r.phase !== 1 || id === 'energy') continue;
  mmd += `  class ${id} t${r.tier};\n`;
}
mmd += `
  classDef t1 fill:#3b2f1e,stroke:#8a7a4a,color:#f0e6d2;
  classDef t2 fill:#1e3b32,stroke:#4a8a7a,color:#e6f0ec;
  classDef t3 fill:#1e2c3b,stroke:#4a6a8a,color:#e6ecf0;
  classDef t4 fill:#3b1e2c,stroke:#8a4a6a,color:#f0e6ec;
  classDef t5 fill:#2c1e3b,stroke:#6a4a8a,color:#ece6f0;
`;
writeFileSync(join(HERE, 'chain-graph.mmd'), mmd, 'utf8');
console.log('Диаграмма графа записана в chain-graph.mmd');
console.log(line);

process.exit(errors.length || materialCycles.length ? 1 : 0);
