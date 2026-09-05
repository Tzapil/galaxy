// Автопроектировщик кораблей + дуэльный стенд.
// Запуск: node design.mjs
//
// Реализует алгоритм из решения №10: жадный рюкзак по маржинальной ценности
// с составными ходами (освобождающий + целевой), которые и дают заявленный
// эмерджентный эффект «откатить двигатель на тир вниз ради орудия следующего тира».
//
// Дальше прогоняет проекты через боевую модель решения №12, чтобы проверить,
// что зоны дальности, взаимные слабости оружия и связка скорость→дистанция
// действительно работают, а не остались декларацией.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, loadData, computeValues, bundleCost } from './values.mjs';

const { RES, producedBy } = loadData();
const value = computeValues(RES, producedBy);

const HULLS = JSON.parse(readFileSync(join(HERE, 'hulls.json'), 'utf8')).hulls;
const modulesDoc = JSON.parse(readFileSync(join(HERE, 'modules.json'), 'utf8'));
const MODULES = modulesDoc.modules;
const doctrinesDoc = JSON.parse(readFileSync(join(HERE, 'doctrines.json'), 'utf8'));
const DOCTRINES = doctrinesDoc.doctrines;
const SCORING = doctrinesDoc.scoring;

const HULL = new Map(HULLS.map((h) => [h.id, h]));
const MOD = new Map(MODULES.map((m) => [m.id, m]));
const BANDS = ['long', 'medium', 'short'];

// Стоимость корпуса и модуля в у.е. экономики
const moduleCost = new Map(MODULES.map((m) => [m.id, bundleCost(m.cost, value)]));
const hullCost = new Map(HULLS.map((h) => [h.id, bundleCost(h.buildRecipe, value)]));

// ------------------------------------------------------------------ эпохи из графа технологий
// Раньше здесь были захардкоженные наборы идентификаторов. Теперь эпоха — это срез графа
// по тиру: что фракция успела исследовать к соответствующему моменту партии.

const TECHS = JSON.parse(readFileSync(join(HERE, 'techs.json'), 'utf8')).techs;
const ERA_TIER = { early: 1, mid: 2, late: 3, endgame: 4 };
const ERA_NAMES = Object.keys(ERA_TIER);

function unlocksUpToTier(maxTier) {
  const mods = new Set(), hulls = new Set();
  for (const t of TECHS) {
    if (t.phase !== 1 || t.repeatable || t.tier > maxTier) continue;
    for (const e of t.effects ?? []) {
      if (e.type === 'unlockModule') mods.add(e.id);
      if (e.type === 'unlockHull') hulls.add(e.id);
    }
  }
  return { mods, hulls };
}
const ERA_UNLOCKS = Object.fromEntries(ERA_NAMES.map((k) => [k, unlocksUpToTier(ERA_TIER[k])]));

const availableIn = (era) => MODULES.filter((m) => m.phase === 1 && ERA_UNLOCKS[era].mods.has(m.id));
const hullsIn = (era) => HULLS.filter((h) => h.phase === 1 && ERA_UNLOCKS[era].hulls.has(h.id));

// ------------------------------------------------------------------ характеристики проекта

function stats(d) {
  const h = HULL.get(d.hull);
  const s = {
    mass: h.baseMass, thrust: 0, power: 0, crew: 0, crewCap: h.crewCapacity,
    shieldHp: 0, shieldRegen: 0, armorRating: 0, structure: h.structure,
    dmg: { long: 0, medium: 0, short: 0 }, weapons: [],
    cargo: 0, scan: 0, fuelCap: h.baseFuel, troops: 0, mining: 0,
    colonists: 0, buildPower: 0, intercept: 0,
    used: { weapon: 0, defense: 0, propulsion: 0, utility: 0 },
  };
  for (const id of d.modules) {
    const m = MOD.get(id);
    s.used[m.slot]++;
    s.mass += m.mass ?? 0;
    s.thrust += m.thrust ?? 0;
    s.power += m.powerDraw ?? 0;
    s.crew += m.crew ?? 0;
    s.crewCap += m.crewCapacityBonus ?? 0;
    s.shieldHp += m.shieldHp ?? 0;
    s.shieldRegen += m.shieldRegen ?? 0;
    s.armorRating += m.armorRating ?? 0;
    s.structure += m.structureBonus ?? 0;
    s.cargo += m.cargo ?? 0;
    s.scan += m.scan ?? 0;
    s.fuelCap += m.fuelCap ?? 0;
    s.troops += m.troops ?? 0;
    s.mining += m.mining ?? 0;
    s.colonists += m.colonists ?? 0;
    s.buildPower += m.buildPower ?? 0;
    s.intercept += m.intercept ?? 0;
    if (m.damage) {
      s.weapons.push(m);
      for (const b of m.bands) s.dmg[b] += m.damage;
    }
  }
  s.speed = s.mass > 0 ? (s.thrust / s.mass) : 0;
  return s;
}

function feasible(d, s = stats(d)) {
  const h = HULL.get(d.hull);
  for (const t of ['weapon', 'defense', 'propulsion', 'utility']) if (s.used[t] > h.slots[t]) return false;
  if (s.power > 0) return false;
  if (s.crew > s.crewCap) return false;
  return true;
}

const designCost = (d) => hullCost.get(d.hull) + d.modules.reduce((a, id) => a + moduleCost.get(id), 0);

// ------------------------------------------------------------------ оценка

const SCALE = { dps: 1, ehp: 0.1, cargo: 0.1, scan: 20, mining: 2, colonists: 200, troops: 0.33, intercept: 1 };
// Скорость оценивается с убывающей отдачей: жёсткое требование доктрины уже гарантирует
// минимум, а сверх него лишний узел стоит меньше, чем лишнее орудие. При линейной оценке
// проектировщик выпускал рейдеры и эскорты вообще без вооружения.
const speedScore = (v) => 30 * Math.log(1 + v);

// Броня — не плоское снижение, а рейтинг с убывающей отдачей:
//   доля поглощения = rating / (rating + softening)
// Плоское снижение уходило в расходимость: при рейтинге, близком к типовому удару,
// оценка EHP улетала в десятки тысяч, а лёгкое оружие обнулялось полностью.
const armorReduction = (rating) => rating / (rating + (SCORING.armorSoftening ?? 60));

const computeEhp = (s) => s.structure / (1 - armorReduction(s.armorRating))
  + s.shieldHp * SCORING.shieldEhpFactor
  + s.shieldRegen * (SCORING.expectedBattleRounds ?? 6);

// Профиль противника из разведданных (решение №12). Без него функция оценки не видит
// смысла в лазерах: кинетика имеет больше урона, меньше энергопотребления и ниже цену,
// то есть строго доминирует. Разведка — не украшение, а необходимое условие
// осмысленного проектирования.
const DEFAULT_ENEMY = { shieldFraction: 0.40, armorRating: 30 };

function threatFactor(w, enemy) {
  const red = armorReduction(enemy.armorRating);
  return enemy.shieldFraction * w.vsShield + (1 - enemy.shieldFraction) * w.vsArmor * (1 - red);
}

function score(d, doc, s = stats(d), enemy = DEFAULT_ENEMY) {
  const w = doc.weights;
  let effDps = 0;
  for (const m of s.weapons) {
    effDps += m.damage * (m.bands.includes(doc.preferredBand) ? 1 : SCORING.offBandPenalty) * threatFactor(m, enemy);
  }
  const ehp = computeEhp(s);

  let v = 0;
  v += (w.dps ?? 0) * effDps * SCALE.dps;
  v += (w.ehp ?? 0) * ehp * SCALE.ehp;
  v += (w.speed ?? 0) * speedScore(s.speed);
  v += (w.cargo ?? 0) * s.cargo * SCALE.cargo;
  v += (w.scan ?? 0) * s.scan * SCALE.scan;
  v += (w.mining ?? 0) * s.mining * SCALE.mining;
  v += (w.colonists ?? 0) * s.colonists * SCALE.colonists;
  v += (w.troops ?? 0) * s.troops * SCALE.troops;
  v += (w.intercept ?? 0) * s.intercept * SCALE.intercept;

  // Жёсткие требования доктрины входят как штраф, поэтому жадный алгоритм
  // сначала закрывает их, а уже потом оптимизирует.
  const req = doc.require ?? {};
  const short = (need, have, k) => (have < need ? (need - have) * k : 0);
  let penalty = 0;
  penalty += short(req.minSpeed ?? 0, s.speed, 400);
  penalty += short(req.minCargo ?? 0, s.cargo, 4);
  penalty += short(req.minScan ?? 0, s.scan, 300);
  penalty += short(req.minMining ?? 0, s.mining, 40);
  penalty += short(req.minColonists ?? 0, s.colonists, 3000);
  penalty += short(req.minTroops ?? 0, s.troops, 6);
  return v - penalty;
}

const meetsRequirements = (d, doc, s = stats(d)) => {
  const r = doc.require ?? {};
  return s.speed >= (r.minSpeed ?? 0) && s.cargo >= (r.minCargo ?? 0) && s.scan >= (r.minScan ?? 0)
    && s.mining >= (r.minMining ?? 0) && s.colonists >= (r.minColonists ?? 0) && s.troops >= (r.minTroops ?? 0);
};

// ------------------------------------------------------------------ проектировщик

function singleMoves(d, pool) {
  const h = HULL.get(d.hull);
  const s = stats(d);
  const out = [];
  for (const m of pool) {
    if (s.used[m.slot] < h.slots[m.slot]) out.push({ kind: 'add', mod: m.id, apply: (x) => ({ ...x, modules: [...x.modules, m.id] }) });
  }
  for (let i = 0; i < d.modules.length; i++) {
    const curMod = MOD.get(d.modules[i]);
    for (const m of pool) {
      if (m.id === curMod.id || m.slot !== curMod.slot) continue;
      out.push({ kind: 'swap', idx: i, mod: m.id, apply: (x) => ({ ...x, modules: x.modules.map((v, j) => (j === i ? m.id : v)) }) });
    }
  }
  return out;
}

function designShip(hullId, doc, pool, costCap = Infinity, enemy = DEFAULT_ENEMY) {
  const sc = (x) => score(x, doc, stats(x), enemy);
  // Затравка: самый дешёвый реактор, иначе энергии нет вообще и ни один ход не проходит.
  const reactors = pool.filter((m) => m.family === 'reactor').sort((a, b) => moduleCost.get(a.id) - moduleCost.get(b.id));
  if (!reactors.length) return null;
  let cur = { hull: hullId, modules: [reactors[0].id] };
  if (!feasible(cur)) return null;

  for (let iter = 0; iter < 200; iter++) {
    const base = sc(cur);
    const baseCost = designCost(cur);
    let best = null;

    // --- простые ходы
    for (const mv of singleMoves(cur, pool)) {
      const cand = mv.apply(cur);
      if (!feasible(cand)) continue;
      const c = designCost(cand);
      if (c > costCap) continue;
      const d = sc(cand) - base;
      if (d <= 1e-9) continue;
      const eff = d / Math.max(c - baseCost, 0.01);
      if (!best || eff > best.eff) best = { cand, eff, d };
    }

    // --- составные ходы: освобождающий + целевой.
    // Именно здесь появляется эффект «откатить двигатель ради орудия следующего тира».
    if (!best) {
      const targets = [];
      for (const mv of singleMoves(cur, pool)) {
        const cand = mv.apply(cur);
        if (feasible(cand)) continue;               // интересны только пока недоступные
        const d = sc(cand) - base;
        if (d > 0) targets.push({ mv, d });
      }
      targets.sort((a, b) => b.d - a.d);

      outer:
      for (const t of targets.slice(0, 10)) {
        // Освобождающим ходом может быть и замена (откатить двигатель на тир вниз),
        // и добавление (поставить второй реактор в свободный слот). Ограничение только
        // заменами оставляло проекты с незаполненными слотами.
        for (const en of singleMoves(cur, pool)) {
          const mid = en.apply(cur);
          if (!feasible(mid)) continue;
          const cand = t.mv.apply(mid);
          if (!feasible(cand)) continue;
          const c = designCost(cand);
          if (c > costCap) continue;
          const d = sc(cand) - base;
          if (d <= 1e-9) continue;
          const eff = d / Math.max(c - baseCost, 0.01);
          if (!best || eff > best.eff) { best = { cand, eff, d, compound: [en, t.mv] }; }
        }
        if (best) break outer;
      }
    }

    if (!best) break;
    cur = best.cand;
  }
  return cur;
}

function bestDesign(doc, era, costCap = Infinity, enemy = DEFAULT_ENEMY) {
  let best = null;
  for (const h of hullsIn(era)) {
    if (!doc.hulls.includes(h.id)) continue;
    const d = designShip(h.id, doc, availableIn(era), costCap, enemy);
    if (!d) continue;
    const s = stats(d);
    if (!meetsRequirements(d, doc, s)) continue;
    const sc = score(d, doc, s, enemy);
    if (!best || sc > best.sc) best = { d, s, sc, cost: designCost(d) };
  }
  return best;
}

// ------------------------------------------------------------------ вывод проекта

function composition(d) {
  const counts = new Map();
  for (const id of d.modules) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => MOD.get(a[0]).slot.localeCompare(MOD.get(b[0]).slot) || b[1] - a[1])
    .map(([id, n]) => `${n}× ${MOD.get(id).name}`)
    .join(', ');
}

function printDesign(label, r) {
  if (!r) { console.log(`${label}: проект не найден`); return; }
  const h = HULL.get(r.d.hull);
  const s = r.s;
  const ehp = Math.round(computeEhp(s));
  console.log(`${label}  ·  ${h.name}`);
  console.log(`   слоты  W ${s.used.weapon}/${h.slots.weapon}  D ${s.used.defense}/${h.slots.defense}  P ${s.used.propulsion}/${h.slots.propulsion}  U ${s.used.utility}/${h.slots.utility}`);
  console.log(`   энергия ${(-s.power).toFixed(0)} свободно   экипаж ${s.crew}/${s.crewCap}   масса ${s.mass}   скорость ${s.speed.toFixed(1)}`);
  console.log(`   щиты ${s.shieldHp} (+${s.shieldRegen}/р)   броня ${s.armorRating} (−${(armorReduction(s.armorRating) * 100).toFixed(0)}% урона)   структура ${s.structure}   EHP ${ehp}`);
  console.log(`   урон  дальняя ${s.dmg.long}  средняя ${s.dmg.medium}  ближняя ${s.dmg.short}` +
    (s.cargo ? `   трюм ${s.cargo}` : '') + (s.scan ? `   скан ${s.scan}` : '') +
    (s.mining ? `   добыча ${s.mining}` : '') + (s.troops ? `   десант ${s.troops}` : '') +
    (s.intercept ? `   перехват ${s.intercept}` : ''));
  console.log(`   стоимость ${r.cost.toFixed(0)} у.е.`);
  console.log(`   состав: ${composition(r.d)}`);
}

// ------------------------------------------------------------------ боевая модель (решение №12)

function makeShip(design, doc) {
  const s = stats(design);
  return {
    doc, design, name: HULL.get(design.hull).name,
    maxShield: s.shieldHp, shield: s.shieldHp, regen: s.shieldRegen,
    armor: s.armorRating, armorRed: armorReduction(s.armorRating),
    structure: s.structure, maxStructure: s.structure,
    speed: s.speed, weapons: s.weapons.slice(), intercept: s.intercept, alive: true,
  };
}

function bandStep(cur, fleetA, fleetB) {
  const wantA = fleetA[0].doc.preferredBand, wantB = fleetB[0].doc.preferredBand;
  if (wantA === wantB) return wantA === cur ? cur : moveBand(cur, wantA);
  const avg = (f) => f.reduce((a, s) => a + s.speed, 0) / f.length;
  const faster = avg(fleetA) >= avg(fleetB) ? wantA : wantB;
  return moveBand(cur, faster);
}
function moveBand(cur, target) {
  const i = BANDS.indexOf(cur), j = BANDS.indexOf(target);
  if (i === j) return cur;
  return BANDS[i + Math.sign(j - i)];
}

function resolveCombat(fleetA, fleetB, rng, maxRounds = 40) {
  let band = 'long';
  const initA = fleetA.length, initB = fleetB.length;
  for (let round = 1; round <= maxRounds; round++) {
    const A = fleetA.filter((s) => s.alive), B = fleetB.filter((s) => s.alive);
    if (!A.length || !B.length) return { round, A: A.length, B: B.length, band, initA, initB };
    band = bandStep(band, A, B);

    const volley = (att, def) => {
      const pending = [];
      const totalIntercept = def.reduce((a, s) => a + s.intercept, 0);
      let interceptLeft = totalIntercept;
      for (const sh of att) {
        for (const w of sh.weapons) {
          if (!w.bands.includes(band)) continue;
          let dmg = w.damage;
          if (w.interceptable && interceptLeft > 0) {
            const absorbed = Math.min(interceptLeft, dmg * 0.6);
            interceptLeft -= absorbed;
            dmg -= absorbed;
          }
          if (dmg <= 0) continue;
          const target = def[Math.floor(rng() * def.length)];
          pending.push({ target, dmg, vsShield: w.vsShield, vsArmor: w.vsArmor });
        }
      }
      return pending;
    };

    // одновременный огонь: обе стороны стреляют по состоянию на начало раунда
    const hits = [...volley(A, B), ...volley(B, A)];
    for (const hit of hits) {
      const t = hit.target;
      if (!t.alive) continue;
      let dmg = hit.dmg;
      if (t.shield > 0) {
        const applied = dmg * hit.vsShield;
        const absorbed = Math.min(t.shield, applied);
        t.shield -= absorbed;
        dmg -= absorbed / hit.vsShield;
        if (dmg <= 0) continue;
      }
      const afterArmor = Math.max(1, dmg * hit.vsArmor * (1 - t.armorRed));
      t.structure -= afterArmor;
      if (t.structure <= 0) t.alive = false;
    }
    for (const s of [...A, ...B]) if (s.alive) s.shield = Math.min(s.maxShield, s.shield + s.regen);

    const lossA = 1 - fleetA.filter((s) => s.alive).length / initA;
    const lossB = 1 - fleetB.filter((s) => s.alive).length / initB;
    if (lossA >= A[0].doc.withdrawAt && lossA > lossB) return { round, A: fleetA.filter((s) => s.alive).length, B: fleetB.filter((s) => s.alive).length, band, withdrew: 'A', initA, initB };
    if (lossB >= B[0].doc.withdrawAt && lossB > lossA) return { round, A: fleetA.filter((s) => s.alive).length, B: fleetB.filter((s) => s.alive).length, band, withdrew: 'B', initA, initB };
  }
  return { round: maxRounds, A: fleetA.filter((s) => s.alive).length, B: fleetB.filter((s) => s.alive).length, band, draw: true, initA, initB };
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ отчёт

const line = '─'.repeat(96);
console.log(line);
console.log('АВТОПРОЕКТИРОВЩИК: ЧЕРТЕЖИ ПО ДОКТРИНАМ И ЭПОХАМ');
console.log(line);

const results = {};
for (const era of ERA_NAMES) {
  console.log(`\n═══ Эпоха: ${era} (технологии тира ≤ ${ERA_TIER[era]}) ═══\n`);
  results[era] = {};
  for (const doc of DOCTRINES) {
    const r = bestDesign(doc, era);
    results[era][doc.id] = r;
    printDesign(`[${doc.name}]`, r);
    console.log('');
  }
}

console.log(line);
console.log('ПРОВЕРКА 1: ЭНЕРГИЯ КАК ОГРАНИЧИТЕЛЬ — ЧТО МЕНЯЕТ ЛУЧШИЙ РЕАКТОР');
console.log(line);
{
  const doc = DOCTRINES.find((d) => d.id === 'line_battle');
  const poolFull = availableIn('endgame');
  const poolNoT3Reactor = poolFull.filter((m) => m.id !== 'reactor_t3');
  for (const [label, pool] of [['все реакторы доступны', poolFull], ['реактор Мк3 не исследован', poolNoT3Reactor]]) {
    const d = designShip('cruiser', doc, pool);
    const s = stats(d);
    console.log(`${label}:`);
    console.log(`   скорость ${s.speed.toFixed(1)}  щиты ${s.shieldHp}  броня ${s.armorRating}  урон(ср) ${s.dmg.medium}  стоимость ${designCost(d).toFixed(0)}`);
    console.log(`   ${composition(d)}`);
  }
  console.log('\nЕсли энергия работает как ограничитель, второй проект обязан уйти в броню и кинетику:');
  console.log('они не требуют питания, в отличие от щитов и лазеров.');
}

// Профиль корабля глазами вражеской разведки: доля защиты, приходящаяся на щиты,
// и рейтинг брони. Именно это фракция узнаёт о соседе и закладывает в проектирование.
function profileOf(s) {
  const ehp = computeEhp(s);
  const shieldPart = (s.shieldHp * SCORING.shieldEhpFactor + s.shieldRegen * (SCORING.expectedBattleRounds ?? 6)) / Math.max(ehp, 1);
  return { shieldFraction: Math.min(1, shieldPart), armorRating: s.armorRating };
}

console.log('');
console.log(line);
console.log('ПРОВЕРКА 2: КОЛИЧЕСТВО ПРОТИВ КАЧЕСТВА ПРИ РАВНОМ БЮДЖЕТЕ');
console.log(line);
{
  const doc = DOCTRINES.find((d) => d.id === 'line_battle');
  const budget = 14000;
  // Обе стороны проектируются по разведданным друг о друге, иначе тест случайно
  // сталкивает антиброневой билд со щитовым и меряет не то, что задумано.
  let cheap = bestDesign(doc, 'early');
  let elite = bestDesign(doc, 'endgame', Infinity, profileOf(cheap.s));
  cheap = bestDesign(doc, 'early', Infinity, profileOf(elite.s));
  elite = bestDesign(doc, 'endgame', Infinity, profileOf(cheap.s));

  const nE = Math.floor(budget / elite.cost);
  // Тратим одинаковую сумму, а не одинаковый лимит: иначе дешёвая сторона выкатывает
  // на 40% больше денег и тест меряет размер кошелька, а не качество проектов.
  const spent = nE * elite.cost;
  const nC = Math.floor(spent / cheap.cost);
  console.log(`Бюджет ${budget} у.е., реально потрачено обеими сторонами ${spent.toFixed(0)} у.е.`);
  console.log(`   обе стороны знают состав противника (профиль из разведданных)`);
  console.log(`   поздняя эпоха: ${nE} × ${HULL.get(elite.d.hull).name} по ${elite.cost.toFixed(0)} у.е.  (урон M ${elite.s.dmg.medium}, EHP ${Math.round(computeEhp(elite.s))})`);
  console.log(`   ранняя эпоха:  ${nC} × ${HULL.get(cheap.d.hull).name} по ${cheap.cost.toFixed(0)} у.е.  (урон M ${cheap.s.dmg.medium}, EHP ${Math.round(computeEhp(cheap.s))})`);
  const rng = mulberry32(12345);
  const fa = Array.from({ length: nE }, () => makeShip(elite.d, doc));
  const fb = Array.from({ length: nC }, () => makeShip(cheap.d, doc));
  const res = resolveCombat(fa, fb, rng);
  console.log(`   → раунд ${res.round}, зона ${res.band}: поздних ${res.A}/${nE}, ранних ${res.B}/${nC}` +
    (res.withdrew ? `, отступил ${res.withdrew}` : res.draw ? ', ничья по лимиту раундов' : ''));
  console.log('   Здоровый баланс: превосходство есть, но не абсолютное.');
}

console.log('');
console.log(line);
console.log('ПРОВЕРКА 3: КАМЕНЬ-НОЖНИЦЫ-БУМАГА И ЗОНЫ ДАЛЬНОСТИ');
console.log(line);
{
  // Загрузки заданы явно, а не через проектировщик: тест должен мерить взаимодействие
  // типов оружия и защиты, а не решения оптимизатора.
  const doc = DOCTRINES.find((d) => d.id === 'line_battle');
  const shortDoc = DOCTRINES.find((d) => d.id === 'brawler');
  const longDoc = DOCTRINES.find((d) => d.id === 'raider');
  const variants = [
    { name: 'Лазер + щит', doc, mods: ['laser_t3', 'laser_t3', 'laser_t3', 'laser_t3', 'shield_t3', 'shield_t3', 'armor_t3', 'armor_t3', 'thruster_t2', 'thruster_t2', 'thruster_t2', 'reactor_t3', 'reactor_t3', 'reactor_t3'] },
    { name: 'Кинетика + броня', doc, mods: ['kinetic_t3', 'kinetic_t3', 'kinetic_t3', 'kinetic_t3', 'kinetic_t3', 'armor_t3', 'armor_t3', 'armor_t3', 'armor_t3', 'thruster_t3', 'thruster_t3', 'thruster_t3', 'reactor_t3', 'reactor_t3', 'sensor_t1'] },
    { name: 'Торпеды дальние', doc: longDoc, mods: ['missile_t3', 'missile_t3', 'missile_t3', 'missile_t3', 'missile_t3', 'armor_t1', 'armor_t1', 'shield_t1', 'thruster_t3', 'thruster_t3', 'thruster_t3', 'reactor_t3', 'reactor_t3', 'sensor_t1'] },
    { name: 'Кинетика + ПВО', doc, mods: ['kinetic_t3', 'kinetic_t3', 'kinetic_t3', 'kinetic_t3', 'kinetic_t3', 'pd_t3', 'pd_t3', 'pd_t3', 'armor_t3', 'thruster_t3', 'thruster_t3', 'thruster_t3', 'reactor_t3', 'reactor_t3', 'reactor_t3'] },
    { name: 'Плазма ближняя', doc: shortDoc, mods: ['plasma_t3', 'plasma_t3', 'plasma_t3', 'plasma_t3', 'armor_t2', 'armor_t2', 'shield_t1', 'thruster_t3', 'thruster_t3', 'thruster_t3', 'reactor_t3', 'reactor_t3', 'reactor_t3'] },
  ];
  const built = [];
  for (const v of variants) {
    const d = { hull: 'cruiser', modules: v.mods };
    const s = stats(d);
    built.push({ ...v, d, s, cost: designCost(d), ok: feasible(d, s) });
  }
  for (const b of built) {
    console.log(`${b.name.padEnd(20)} ст.${b.cost.toFixed(0).padStart(5)}  ск.${b.s.speed.toFixed(1).padStart(5)}  щит ${String(b.s.shieldHp).padStart(4)}  бр.${String(b.s.armorRating).padStart(3)}  урон L/M/S ${b.s.dmg.long}/${b.s.dmg.medium}/${b.s.dmg.short}${b.ok ? '' : '  ← НЕВАЛИДЕН'}`);
  }
  console.log('');
  console.log('Дуэли 4 на 4, корпус один и тот же — различается только загрузка:');
  console.log('');
  console.log('                    ' + built.map((b) => b.name.slice(0, 14).padStart(16)).join(''));
  for (const a of built) {
    let row = a.name.padEnd(20);
    for (const b of built) {
      if (a === b) { row += '           —    '; continue; }
      const rng = mulberry32(777);
      const fa = Array.from({ length: 4 }, () => makeShip(a.d, a.doc));
      const fb = Array.from({ length: 4 }, () => makeShip(b.d, b.doc));
      const r = resolveCombat(fa, fb, rng);
      row += `${r.A}:${r.B}`.padStart(16);
    }
    console.log(row);
  }
  console.log('');
  console.log('Читается по строкам: слева проект A, сверху проект B, в клетке выжившие A:B.');
}

console.log('');
console.log(line);
console.log('ПРОВЕРКА 4: РЕЙДЕР ПРОТИВ ЛИНКОРА — РАБОТАЕТ ЛИ СВЯЗКА СКОРОСТЬ → ДИСТАНЦИЯ');
console.log(line);
{
  const raiderDoc = DOCTRINES.find((d) => d.id === 'raider');
  const lineDoc = DOCTRINES.find((d) => d.id === 'line_battle');
  const raider = bestDesign(raiderDoc, 'endgame');
  const liner = bestDesign(lineDoc, 'endgame');
  const nR = Math.max(1, Math.floor(liner.cost * 3 / raider.cost));
  console.log(`${HULL.get(raider.d.hull).name} (рейдер, скорость ${raider.s.speed.toFixed(1)}, урон L ${raider.s.dmg.long}) × ${nR}`);
  console.log(`против`);
  console.log(`${HULL.get(liner.d.hull).name} (линейный, скорость ${liner.s.speed.toFixed(1)}, урон M ${liner.s.dmg.medium}) × 3`);
  const rng = mulberry32(4242);
  const fa = Array.from({ length: nR }, () => makeShip(raider.d, raiderDoc));
  const fb = Array.from({ length: 3 }, () => makeShip(liner.d, lineDoc));
  const r = resolveCombat(fa, fb, rng);
  console.log(`   → раунд ${r.round}, итоговая зона ${r.band}: рейдеров ${r.A}/${nR}, линейных ${r.B}/3` +
    (r.withdrew ? `, отступил ${r.withdrew}` : r.draw ? ', ничья' : ''));
  console.log('   Рейдер быстрее, поэтому удерживает дальнюю зону, где линкор бессилен.');
}

console.log('');
console.log(line);
console.log('ПРОВЕРКА 6: ОТДАЧА НА КРЕДИТ ПО КОРПУСАМ');
console.log(line);
{
  // bestDesign выбирает проект по АБСОЛЮТНОЙ оценке, поэтому больший корпус побеждает
  // всегда, и малые корпуса не выбираются никогда. Но фракция тратит бюджет, а не слоты:
  // при равных деньгах важна отдача на кредит. Эта таблица показывает разницу.
  for (const docId of ['brawler', 'line_battle', 'escort']) {
    const doc = DOCTRINES.find((d) => d.id === docId);
    console.log(`\n[${doc.name}]`);
    console.log('   корпус'.padEnd(26) + 'оценка'.padStart(10) + 'стоимость'.padStart(12) + 'оценка/1000 кр.'.padStart(17));
    const rows = [];
    for (const h of hullsIn('endgame')) {
      if (!doc.hulls.includes(h.id)) continue;
      const d = designShip(h.id, doc, availableIn('endgame'));
      if (!d) continue;
      const s = stats(d);
      if (!meetsRequirements(d, doc, s)) continue;
      const sc = score(d, doc, s), c = designCost(d);
      rows.push({ name: HULL.get(h.id).name, sc, c, eff: sc / c * 1000 });
    }
    rows.sort((a, b) => b.eff - a.eff);
    for (const r of rows) {
      console.log('   ' + r.name.padEnd(23) + r.sc.toFixed(0).padStart(10) + r.c.toFixed(0).padStart(12) + r.eff.toFixed(0).padStart(17));
    }
  }
  console.log('');
  console.log('Верхняя строка каждой доктрины — самый выгодный корпус на единицу бюджета,');
  console.log('а проектировщик выбирает по абсолютной оценке, то есть всегда самый крупный.');
  console.log('Настоящий ИИ должен учитывать бюджет: это разница между одним линкором и роем канонерок.');
}

console.log('');
console.log(line);
console.log(line);
{
  const doc = DOCTRINES.find((d) => d.id === 'line_battle');
  const profiles = [
    ['противник в щитах, брони мало', { shieldFraction: 0.85, armorRating: 8 }],
    ['противник в броне, щитов мало', { shieldFraction: 0.05, armorRating: 80 }],
    ['смешанный (профиль по умолчанию)', DEFAULT_ENEMY],
  ];
  for (const [label, enemy] of profiles) {
    const d = designShip('cruiser', doc, availableIn('endgame'), Infinity, enemy);
    const s = stats(d);
    const guns = [...new Set(s.weapons.map((w) => w.family))].join('+') || '—';
    console.log(`${label.padEnd(34)} оружие: ${guns.padEnd(16)} урон L/M/S ${s.dmg.long}/${s.dmg.medium}/${s.dmg.short}   стоимость ${designCost(d).toFixed(0)}`);
  }
  console.log('');
  console.log('Против щитов ИИ обязан уходить в лазеры, против брони — в кинетику.');
  console.log('Именно это делает разведку необходимой, а не декоративной.');
}

console.log('');
console.log(line);
