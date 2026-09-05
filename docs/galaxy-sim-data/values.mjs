// Общий модуль: загрузка данных экономики и расчёт стоимостей.
// Используется и validate.mjs, и design.mjs, чтобы проектировщик считал цену корабля
// в тех же единицах, что и экономика.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const LABOR_VALUE = 0.5; // у.е. за человеко-день
const SOLAR_SEED = 0.5 / 15;    // затравка: солнечная батарея, 1 рабочий на 15 энергии в день

export function loadData() {
  const resourcesDoc = JSON.parse(readFileSync(join(HERE, 'resources.json'), 'utf8'));
  const recipesDoc = JSON.parse(readFileSync(join(HERE, 'recipes.json'), 'utf8'));
  const buildingsDoc = JSON.parse(readFileSync(join(HERE, 'buildings.json'), 'utf8'));

  const RES = new Map(resourcesDoc.resources.map((r) => [r.id, r]));
  const BATCH = recipesDoc.batchRecipes;
  const CONT = recipesDoc.continuous;
  const SINKS = recipesDoc.sinks;
  const BUILDINGS = buildingsDoc.buildings;

  const producedBy = new Map();
  const push = (out, recipe) => {
    if (!producedBy.has(out)) producedBy.set(out, []);
    producedBy.get(out).push(recipe);
  };
  for (const r of BATCH) for (const out of Object.keys(r.outputs)) push(out, r);
  for (const c of CONT) {
    for (const out of Object.keys(c.outputPerDay ?? {})) {
      push(out, {
        id: c.id,
        inputs: { ...(c.inputs ?? {}), ...(c.inputsPerDay ?? {}) },
        outputs: c.outputPerDay,
        workers: c.workers,
        continuous: true,
      });
    }
  }

  return { RES, BATCH, CONT, SINKS, BUILDINGS, producedBy, recipesDoc, resourcesDoc, buildingsDoc };
}

export function recipeUnitCost(recipe, outId, value) {
  let cost = 0;
  for (const [inId, qty] of Object.entries(recipe.inputs ?? {})) {
    const v = value.get(inId);
    if (!Number.isFinite(v)) return Infinity;
    cost += v * qty;
  }
  const days = recipe.continuous ? 1 : recipe.durationDays;
  cost += LABOR_VALUE * (recipe.workers ?? 1) * days;
  const outQty = (recipe.outputs ?? {})[outId] ?? 0;
  return outQty > 0 ? cost / outQty : Infinity;
}

// Итеративная релаксация: циклы через энергию разрешаются поиском фиксированной точки.
export function computeValues(RES, producedBy) {
  const value = new Map([...RES.keys()].map((k) => [k, Infinity]));
  value.set('energy', SOLAR_SEED);

  for (let pass = 0; pass < 200; pass++) {
    let changed = false;
    for (const [resId, recipes] of producedBy) {
      let best = Infinity;
      for (const recipe of recipes) best = Math.min(best, recipeUnitCost(recipe, resId, value));
      if (Number.isFinite(best) && best < value.get(resId) - 1e-9) {
        value.set(resId, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return value;
}

// Развёртка произвольного набора ресурсов до сырья (тот же проход, что делает MRP ИИ).
export function makeExploder(RES, producedBy, value) {
  const rawIds = new Set([...RES.values()].filter((r) => r.category === 'raw').map((r) => r.id));

  return function explode(resId, qty, acc = new Map(), guard = new Set()) {
    if (rawIds.has(resId)) { acc.set(resId, (acc.get(resId) ?? 0) + qty); return acc; }
    if (resId === 'energy' || guard.has(resId)) return acc;
    const recipes = producedBy.get(resId) ?? [];
    if (!recipes.length) return acc;
    let best = recipes[0], bestCost = Infinity;
    for (const r of recipes) {
      const c = recipeUnitCost(r, resId, value);
      if (c < bestCost) { bestCost = c; best = r; }
    }
    const per = (best.outputs ?? {})[resId] ?? 1;
    const g = new Set(guard); g.add(resId);
    for (const [inId, inQty] of Object.entries(best.inputs ?? {})) {
      explode(inId, (inQty / per) * qty, acc, g);
    }
    return acc;
  };
}

// Стоимость произвольного набора ресурсов в у.е.
export function bundleCost(bundle, value) {
  let total = 0;
  for (const [id, qty] of Object.entries(bundle ?? {})) {
    const v = value.get(id);
    if (!Number.isFinite(v)) return Infinity;
    total += v * qty;
  }
  return total;
}
