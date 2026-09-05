// Пересчёт стоимостей дерева технологий под нужный темп партии.
// Запуск: node rescale-techs.mjs [--apply]
//
// Без --apply только показывает, что получится.
//
// Задача: исходные стоимости давали исследование всего дерева за ~20 лет при шести
// лабораториях. Для партии на тысячи лет нужен другой масштаб и более крутая кривая
// тиров, иначе технологическая эпоха заканчивается раньше, чем фракции успевают
// столкнуться.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE } from './values.mjs';

const TIER_MULT = { 0: 1, 1: 8, 2: 16, 3: 42, 4: 80, 5: 140 };
const REPEAT_MULT = 40;
const REPEAT_GROWTH = 1.22;

const path = join(HERE, 'techs.json');
const doc = JSON.parse(readFileSync(path, 'utf8'));
const apply = process.argv.includes('--apply');

const round = (v) => {
  if (v < 1000) return Math.round(v / 10) * 10;
  if (v < 100000) return Math.round(v / 100) * 100;
  return Math.round(v / 1000) * 1000;
};

let changed = 0;
for (const t of doc.techs) {
  const mult = TIER_MULT[t.tier] ?? 1;
  if (t.repeatable) {
    for (const k of Object.keys(t.baseCost ?? {})) t.baseCost[k] = round(t.baseCost[k] * REPEAT_MULT);
    t.costGrowth = t.branch === 'administration' ? 1.20 : REPEAT_GROWTH;
    changed++;
  } else if (t.cost && Object.keys(t.cost).length) {
    for (const k of Object.keys(t.cost)) t.cost[k] = round(t.cost[k] * mult);
    changed++;
  }
}

doc.costModel = {
  comment: 'Ориентиры суммарной стоимости по тирам. Кривая ×5 за шаг — круче, чем ×3 в первой ' +
           'редакции: при ней всё дерево исследовалось за 20 лет, то есть технологическая эпоха ' +
           'заканчивалась раньше, чем фракции успевали столкнуться.',
  tier1: 800, tier2: 4800, tier3: 35700, tier4: 200000, tier5: 980000,
  repeatBase: '≈40 000, рост ×1.22 за уровень (администрация ×1.20)',
  targetPacing: 'тир 1 к ~15 году, тир 2 к ~60, тир 3 к ~250, тир 4 к ~400. Дальше только повторяемые.',
};

console.log(`Пересчитано узлов: ${changed}`);
console.log(`Множители по тирам: ${JSON.stringify(TIER_MULT)}`);
console.log(`Повторяемые: база ×${REPEAT_MULT}, рост ${REPEAT_GROWTH}`);
if (apply) {
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log('Записано в techs.json');
} else {
  console.log('Пробный прогон. Для записи: node rescale-techs.mjs --apply');
}
