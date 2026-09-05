// Прогон стартового пакета фракции.
// Запуск: node bootstrap.mjs [лет] [--verbose]
//
// Крутит экономику домашней системы по тикам (1 тик = 1 игровой день) и проверяет,
// что она раскручивается: население не вымирает, все три вида данных производятся,
// строительство идёт, ни один ресурс не висит на нуле годами.
//
// Это самый важный из инструментов: если стартовый пакет заклинит, партия не заведётся
// вообще, и никакие последующие механики значения не имеют.
//
// Важные особенности модели, повторяющие решения ТЗ:
//   • энергия НЕ ТРАНСПОРТИРУЕТСЯ и считается отдельно для каждого тела (решение №5);
//   • производство идёт дискретными партиями с резервированием входов (решение №5);
//   • рабочая сила ограничена населением, здание без рабочих простаивает (решение №6);
//   • слоты ограничены телом и его особенностями (решение №6).
// Внутрисистемная логистика абстрагирована: ресурсы, кроме энергии, лежат в общем пуле.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERE, loadData } from './values.mjs';

const { RES, BATCH, CONT, BUILDINGS } = loadData();
const TECHS = JSON.parse(readFileSync(join(HERE, 'techs.json'), 'utf8')).techs;
const PKG = JSON.parse(readFileSync(join(HERE, 'start-package.json'), 'utf8'));

const YEARS = Number(process.argv[2]) || 50;
const VERBOSE = process.argv.includes('--verbose');
const DAYS = Math.round(YEARS * 365);

const B = new Map(BUILDINGS.map((b) => [b.id, b]));
const R = new Map(BATCH.map((r) => [r.id, r]));
const T = new Map(TECHS.map((t) => [t.id, t]));
const POWER = CONT.filter((c) => c.kind === 'power');
const POWER_BY_BUILDING = new Map(POWER.map((p) => [p.building, p]));
const NEEDS = CONT.find((c) => c.kind === 'consumption');

const DATA = ['physics', 'engineering', 'bio'];
const GROWTH_R = 0.00012;         // ~4.4% в год: при 14.6% строительство не успевает,
                                  // население выстреливает вдвое выше устойчивого уровня
                                  // и потом десятилетиями сползает обратно через дефицит
const ENERGY_CAP_PER_SOURCE = 260;

// ------------------------------------------------------------------ состояние

const state = {
  day: 0,
  res: new Map(Object.entries(PKG.stockpiles).filter(([k]) => RES.has(k))),
  bodies: PKG.homeSystem.bodies.map((b) => ({ ...b, used: 0, energy: 0, energyCap: 0 })),
  buildings: [],
  pop: PKG.population.start,
  credits: PKG.treasury.credits,
  researched: new Set(PKG.technologies),
  data: { physics: 0, engineering: 0, bio: 0 },
  construction: [],
  starvedDays: new Map(),
  tightDays: new Map(),
  capitalSpend: new Map(),
  satEma: new Map(),
  events: [],
  history: [],
};
const bodyOf = new Map(state.bodies.map((b) => [b.id, b]));
const get = (id) => state.res.get(id) ?? 0;
const add = (id, q) => state.res.set(id, Math.max(0, get(id) + q));

function unlockedBuildings() {
  const s = new Set();
  for (const id of state.researched) {
    for (const e of T.get(id)?.effects ?? []) if (e.type === 'unlockBuilding') s.add(e.id);
  }
  return s;
}
let UNLOCKED = unlockedBuildings();

function placeBuilding(buildingId, bodyId) {
  const b = B.get(buildingId), body = bodyOf.get(bodyId);
  if (!b || !body) return false;
  if (body.used + b.slots > body.slots) return false;
  if (b.placement.requires && !body.features.includes(b.placement.requires)) return false;
  if (!b.placement.on.includes(body.type === 'asteroid' ? 'planet' : body.type)
      && !b.placement.on.includes('asteroid')) {
    if (!(body.type === 'asteroid' && b.placement.on.includes('planet'))) return false;
  }
  body.used += b.slots;
  const p = POWER_BY_BUILDING.get(buildingId);
  if (p) body.energyCap += ENERGY_CAP_PER_SOURCE;
  state.buildings.push({
    bid: buildingId, body: bodyId, recipe: b.recipe,
    workers: b.recipe ? (R.get(b.recipe)?.workers ?? p?.workers ?? b.workers ?? 0) : (b.workers ?? 0),
    busyUntil: -1, reserved: null, idleReason: '',
  });
  return true;
}

for (const s of PKG.buildings) {
  if (!placeBuilding(s.id, s.body)) state.events.push(`[старт] не удалось разместить ${s.id} на ${s.body}`);
}

// ------------------------------------------------------------------ тик

function tick() {
  const d = state.day;
  const bodyEnergyProd = new Map();

  // 1. энергия (непрерывно, отдельно на каждом теле)
  for (const b of state.buildings) {
    const p = POWER_BY_BUILDING.get(b.bid);
    if (!p) continue;
    const inputsOk = Object.entries(p.inputsPerDay ?? {}).every(([id, q]) => get(id) >= q);
    if (!inputsOk) { b.idleReason = 'нет топлива'; continue; }
    for (const [id, q] of Object.entries(p.inputsPerDay ?? {})) add(id, -q);
    bodyEnergyProd.set(b.body, (bodyEnergyProd.get(b.body) ?? 0) + p.outputPerDay.energy);
  }
  for (const body of state.bodies) {
    body.energy = Math.min(body.energyCap, body.energy + (bodyEnergyProd.get(body.id) ?? 0));
  }

  // 2. потребление населением (непрерывно, плавная деградация)
  const sat = {};
  for (const [id, rate] of Object.entries(NEEDS.perThousandPopPerDay)) {
    const need = state.pop * rate;
    const have = get(id);
    const taken = Math.min(have, need);
    add(id, -taken);
    sat[id] = need > 0 ? taken / need : 1;
    // Считаем не отдельный день, а сглаженное среднее за месяц. Партийное производство
    // даёт пилу: в низшей точке каждого цикла запас проседает, и посуточный счёт
    // объявляет голодом обычные колебания. Голод — это когда просела СРЕДНЯЯ.
    const prev = state.satEma.get(id) ?? 1;
    const ema = prev + (sat[id] - prev) / 30;
    state.satEma.set(id, ema);
    // Порог 0.75 отделяет НАСТОЯЩИЙ голод от жизни без запаса. Насыщенная система стоит
    // на пределе ёмкости, и её продовольственный баланс по определению зажат в паритет:
    // порог 0.9 объявлял бы голодом нормальное состояние колонии на потолке роста.
    if (ema < 0.75) state.starvedDays.set(id, (state.starvedDays.get(id) ?? 0) + 1);
    if (ema < 0.95) state.tightDays.set(id, (state.tightDays.get(id) ?? 0) + 1);
  }
  const vital = Math.min(sat.food ?? 1, sat.water ?? 1);
  const comfort = Math.min(sat.medicine ?? 1, sat.consumer_goods ?? 1);
  state.sat = sat;

  // 3. рост населения.
  // Растём от ПРОФИЦИТА, а не «пока не начали голодать». Логистический рост, ограниченный
  // едой, по определению садится в точку, где рост обнуляется — то есть в вечный лёгкий
  // дефицит (мальтузианское равновесие). Модель ниже останавливает рост ещё при полном
  // снабжении, и колония стоит сытой, а не впроголодь.
  const ema = Math.min(state.satEma.get('food') ?? 1, state.satEma.get('water') ?? 1);
  const growthFactor = ema >= 0.98 ? 1 : ema >= 0.90 ? 0 : ema >= 0.60 ? -0.15 : -0.6;
  const popCap = currentPopCap();
  state.pop += GROWTH_R * state.pop * (1 - state.pop / popCap) * growthFactor * (comfort < 0.5 ? 0.5 : 1);
  state.pop = Math.max(0.1, state.pop);

  // 4. завершение партий
  for (const b of state.buildings) {
    if (b.busyUntil !== d || !b.reserved) continue;
    const rec = R.get(b.recipe);
    for (const [id, q] of Object.entries(rec.outputs)) add(id, q * (bodyOf.get(b.body)?.yield ?? 1));
    b.busyUntil = -1;
    b.reserved = null;
  }

  // 5. запуск партий: слева направо по рабочей силе
  let workersLeft = state.pop * PKG.population.employmentRate;
  for (const b of state.buildings) if (b.busyUntil > d) workersLeft -= b.workers;
  for (const b of state.buildings) {
    if (b.busyUntil >= d || !b.recipe || POWER_BY_BUILDING.has(b.bid)) continue;
    const rec = R.get(b.recipe);
    if (!rec) continue;
    if (workersLeft < b.workers) { b.idleReason = 'нет рабочих'; continue; }
    const body = bodyOf.get(b.body);
    const energyNeed = rec.inputs.energy ?? 0;
    if (body.energy < energyNeed) { b.idleReason = 'нет энергии'; continue; }
    const missing = Object.entries(rec.inputs).find(([id, q]) => id !== 'energy' && get(id) < q);
    if (missing) { b.idleReason = `нет ${missing[0]}`; continue; }
    body.energy -= energyNeed;
    for (const [id, q] of Object.entries(rec.inputs)) if (id !== 'energy') add(id, -q);
    workersLeft -= b.workers;
    b.busyUntil = d + rec.durationDays;
    b.reserved = true;
    b.idleReason = '';
  }

  // 6. исследования
  for (const dt of DATA) {
    const id = `data_${dt}`;
    const q = get(id);
    if (q > 0) { state.data[dt] += q; add(id, -q); }
  }
  const candidates = TECHS.filter((t) => !t.repeatable && t.phase === 1 && !state.researched.has(t.id)
    && (t.requires ?? []).every((x) => state.researched.has(x)));
  for (const t of candidates.sort((a, b) => sumCost(a) - sumCost(b))) {
    if (DATA.every((dt) => state.data[dt] >= (t.cost?.[dt] ?? 0))) {
      for (const dt of DATA) state.data[dt] -= (t.cost?.[dt] ?? 0);
      state.researched.add(t.id);
      UNLOCKED = unlockedBuildings();
      state.events.push(`[год ${(d / 365).toFixed(1)}] исследовано: ${t.name}`);
      break;
    }
  }

  // 7. стройка
  for (const c of state.construction) {
    if (c.doneAt !== d) continue;
    placeBuilding(c.bid, c.body);
    state.events.push(`[год ${(d / 365).toFixed(1)}] построено: ${B.get(c.bid).name} на ${bodyOf.get(c.body).name}`);
  }
  state.construction = state.construction.filter((c) => c.doneAt > d);
  if (d % 30 === 0) builderAI(d);

  state.day++;
}

const sumCost = (t) => Object.values(t.cost ?? {}).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ строительный ИИ

function rates() {
  const prod = new Map(), cons = new Map();
  for (const b of state.buildings) {
    const p = POWER_BY_BUILDING.get(b.bid);
    if (p) { for (const [id, q] of Object.entries(p.inputsPerDay ?? {})) cons.set(id, (cons.get(id) ?? 0) + q); continue; }
    const rec = R.get(b.recipe);
    if (!rec) continue;
    for (const [id, q] of Object.entries(rec.outputs)) prod.set(id, (prod.get(id) ?? 0) + q / rec.durationDays);
    for (const [id, q] of Object.entries(rec.inputs)) if (id !== 'energy') cons.set(id, (cons.get(id) ?? 0) + q / rec.durationDays);
  }
  for (const [id, rate] of Object.entries(NEEDS.perThousandPopPerDay)) cons.set(id, (cons.get(id) ?? 0) + state.pop * rate);
  // КАПИТАЛЬНЫЙ СПРОС. Без него модель дефицита видит только потребление рецептами,
  // и конструкционные материалы выглядят профицитными ровно тогда, когда стройка стоит
  // без них: 55 тысяч сплавов на складе при нуле металла и невозможности заложить
  // ни одного здания. В настоящем MRP из решения №8 это обязано учитываться так же.
  const days = Math.max(365, state.day);
  for (const [id, spent] of state.capitalSpend) cons.set(id, (cons.get(id) ?? 0) + spent / days);
  return { prod, cons };
}

function tryBuild(bid, why) {
  const b = B.get(bid);
  if (!b || !UNLOCKED.has(bid)) return false;
  const cost = b.buildCost ?? {};
  if (!Object.entries(cost).every(([id, q]) => get(id) >= q)) return false;
  // Выбираем тело с НАИБОЛЬШИМ запасом свободных слотов, а не первое подходящее:
  // иначе всё генерическое сваливается на родной мир и съедает его слоты целиком.
  const candidates = state.bodies.filter((body) => {
    if (body.used + b.slots > body.slots) return false;
    if (b.placement.requires && !body.features.includes(b.placement.requires)) return false;
    // производственному зданию нужна энергия на месте
    if (b.recipe && !POWER_BY_BUILDING.has(bid) && body.energyCap === 0) return false;
    return true;
  });
  if (!candidates.length) return false;
  const target = candidates.sort((a, z) => (z.slots - z.used) - (a.slots - a.used))[0];
  for (const [id, q] of Object.entries(cost)) { add(id, -q); state.capitalSpend.set(id, (state.capitalSpend.get(id) ?? 0) + q); }
  state.construction.push({ bid, body: target.id, doneAt: state.day + b.buildDays, why });
  return true;
}

function currentPopCap() {
  const housing = state.buildings.filter((b) => b.bid === 'housing').length;
  return 120 + housing * 90 + state.buildings.length * 2;
}

// Снос избыточного здания ради критической нужды. Без этого колония, один раз
// насытившая слоты неудачным составом, остаётся в вечном дефиците: строить негде,
// а на складе при этом 36 тысяч металла при еде на один день.
//
// Правило намеренно строгое. Первая редакция сносила по «запасу на складе» — и уничтожила
// колонию за десять лет: при щедрых стартовых складах избыточным выглядит любой
// производитель. Теперь смотрим не на запас, а на ПОТОК, и только при полном насыщении.
function demolishForSpace() {
  if (state.bodies.some((b) => b.used < b.slots)) return false;   // ещё есть куда строить

  // Избыточное жильё — первый кандидат. Оно не производит ничего, а слот занимает,
  // и ИИ, однажды настроив его с запасом, иначе никогда его не тронет.
  const cap = currentPopCap();
  if (cap > state.pop * 1.4) {
    const h = state.buildings.find((b) => b.bid === 'housing');
    if (h) {
      state.buildings.splice(state.buildings.indexOf(h), 1);
      bodyOf.get(h.body).used -= B.get('housing').slots;
      state.events.push(`[год ${(state.day / 365).toFixed(1)}] снесён жилой комплекс: ` +
        `потолок ${cap.toFixed(0)} при населении ${state.pop.toFixed(0)}`);
      return true;
    }
  }

  const { prod, cons } = rates();
  let best = null;
  for (const b of state.buildings) {
    if (!b.recipe || POWER_BY_BUILDING.has(b.bid) || b.bid === 'housing') continue;
    const rec = R.get(b.recipe);
    if (!rec) continue;
    let redundant = true, minSlack = Infinity;
    for (const [id, q] of Object.entries(rec.outputs)) {
      const need = cons.get(id) ?? 0;
      if (need <= 0) { redundant = false; break; }        // выход никем не потребляется — иной случай
      const after = (prod.get(id) ?? 0) - q / rec.durationDays;
      // Здание избыточно, если после сноса либо поток всё ещё покрывает спрос,
      // либо накопленного запаса хватит не меньше чем на пять лет. Только поток —
      // слишком строго: плавильня с профицитом 2 в день не «избыточна», хотя на складе
      // лежит 58 тысяч металла и он продолжает расти.
      const flowOk = after >= need * 1.05;
      const yearsOfBuffer = after >= need ? Infinity : get(id) / ((need - after) * 365);
      if (!flowOk && yearsOfBuffer < 5) { redundant = false; break; }
      minSlack = Math.min(minSlack, flowOk ? after / need : 1 + yearsOfBuffer / 100);
    }
    if (!redundant) continue;
    if (!best || minSlack > best.slack) best = { b, slack: minSlack };
  }
  if (!best) return false;
  state.buildings.splice(state.buildings.indexOf(best.b), 1);
  bodyOf.get(best.b.body).used -= B.get(best.b.bid).slots;
  state.events.push(`[год ${(state.day / 365).toFixed(1)}] снесено: ${B.get(best.b.bid).name} ` +
    `(даже без него выход превышает спрос в ${best.slack.toFixed(1)}×)`);
  return true;
}

function builderAI(d) {
  if (state.construction.length >= 2) return;

  // 1. энергия: тело, где здания стоят без питания, либо тело вовсе без генерации
  const starvedBody = state.bodies.find((body) =>
    state.buildings.some((b) => b.body === body.id && b.idleReason === 'нет энергии')
    || (body.energyCap === 0 && state.buildings.some((b) => b.body === body.id && b.recipe)));
  if (starvedBody) {
    for (const gen of ['fusion_plant', 'fission_plant', 'solar_array']) {
      if (!UNLOCKED.has(gen)) continue;
      const g = B.get(gen);
      if (starvedBody.used + g.slots > starvedBody.slots) continue;
      if (!Object.entries(g.buildCost).every(([id, q]) => get(id) >= q)) continue;
      for (const [id, q] of Object.entries(g.buildCost)) add(id, -q);
      state.construction.push({ bid: gen, body: starvedBody.id, doneAt: d + g.buildDays, why: 'энергия' });
      return;
    }
  }

  // 2. рабочая сила. Если заметная доля зданий стоит без людей, единственное осмысленное
  // действие — жильё. Строить в этот момент новое производство означает копать яму глубже:
  // рабочих не прибавится, а простой вырастет.
  const housing = state.buildings.filter((b) => b.bid === 'housing').length;
  const idleForWorkers = state.buildings.filter((b) => b.idleReason === 'нет рабочих').length;
  const workerCrunch = idleForWorkers > state.buildings.length * 0.10;
  const vitalOk = Math.min(state.sat?.food ?? 0, state.sat?.water ?? 0) >= 0.85;

  if (workerCrunch || (vitalOk && state.pop > 0.85 * currentPopCap())) {
    if (tryBuild('housing', workerCrunch ? 'нехватка рабочих' : 'потолок населения')) return;
    if (workerCrunch) {
      // жильё построить не вышло (слоты или ресурсы) — новое производство всё равно
      // бессмысленно, выходим и ждём
      if (!state.crunchNoted) {
        state.crunchNoted = true;
        state.events.push(`[год ${(d / 365).toFixed(1)}] нехватка рабочей силы, жильё поставить негде`);
      }
      return;
    }
  }

  // 3. узкое место по ресурсам: минимальное отношение производство/потребление.
  // Учитываем ЗАПАС, а не только ставки. Без этого возникает контур обратной связи:
  // ИИ видит «дефицит металла» по ставкам, строит плавильню, та поднимает потребление
  // руды, руда становится дефицитной, и так далее — при 24 тысячах металла на складе
  // и еде, которой хватает на день.
  const VITAL = ['food', 'water', 'medicine', 'consumer_goods'];
  const { prod, cons } = rates();
  const deficits = [];
  for (const [id, need] of cons) {
    if (need <= 0) continue;
    const daysOfStock = get(id) / need;
    if (daysOfStock > 90) continue;                       // склад полон — расширять незачем
    const ratio = (prod.get(id) ?? 0) / need;
    if (ratio < 1.1) deficits.push({ id, ratio, daysOfStock, vital: VITAL.includes(id) });
  }
  // Жизненно важное идёт первым при любом запасе: без этого металл с нулевым складом
  // конкурирует с едой на равных, и ИИ уводит колонию в промышленность, пока люди голодают.
  deficits.sort((a, b) => (b.vital - a.vital) || a.daysOfStock - b.daysOfStock || a.ratio - b.ratio);

  for (const def of deficits) {
    const producers = BATCH.filter((r) => r.outputs[def.id]);
    for (const rec of producers) {
      const bld = BUILDINGS.find((x) => x.recipe === rec.id);
      if (bld && tryBuild(bld.id, `дефицит ${def.id}`)) return;
    }
  }

  // 3b. Строить негде, а дефицит жизненно важного остаётся — сносим избыточное.
  const vitalShort = deficits.find((x) => ['food', 'water', 'medicine', 'consumer_goods'].includes(x.id) && x.daysOfStock < 10);
  if (vitalShort && demolishForSpace()) return;

  // 4. иначе — наука и промышленность
  for (const bid of ['engineering_lab', 'physics_lab', 'bio_lab', 'alloy_works', 'electronics_plant']) {
    if (tryBuild(bid, 'развитие')) return;
  }

  // 5. строить негде и нечего — домашняя система насыщена, нужна экспансия
  if (deficits.length && !state.saturatedAt) {
    state.saturatedAt = d;
    state.events.push(`[год ${(d / 365).toFixed(1)}] домашняя система насыщена: ` +
      `все ${state.bodies.reduce((a, b) => a + b.slots, 0)} слотов заняты, ` +
      `а дефицит остаётся (${deficits.slice(0, 3).map((x) => x.id).join(', ')}). Дальше только колонизация.`);
  }
}

// ------------------------------------------------------------------ прогон

const KEY = ['food', 'water', 'medicine', 'consumer_goods', 'metal', 'alloys', 'electronics', 'fuel'];
for (let i = 0; i < DAYS; i++) {
  tick();
  if (state.day % 365 === 0) {
    state.history.push({
      year: state.day / 365,
      pop: state.pop,
      buildings: state.buildings.length,
      techs: state.researched.size,
      stocks: Object.fromEntries(KEY.map((k) => [k, Math.round(get(k))])),
      idle: state.buildings.filter((b) => b.busyUntil < state.day && b.idleReason).length,
    });
  }
}

// ------------------------------------------------------------------ отчёт

const line = '─'.repeat(96);
console.log(line);
console.log(`ПРОГОН СТАРТОВОГО ПАКЕТА — ${YEARS} игровых лет`);
console.log(line);
console.log(`Слотов в домашней системе: ${state.bodies.reduce((a, b) => a + b.slots, 0)}`);
console.log(`Стартовых зданий: ${PKG.buildings.length}, население: ${PKG.population.start} тыс.`);
console.log('');

console.log('год'.padStart(5) + 'население'.padStart(12) + 'зданий'.padStart(9) + 'технол.'.padStart(9) +
  'простой'.padStart(9) + KEY.map((k) => k.slice(0, 7).padStart(9)).join(''));
for (const h of state.history) {
  if (h.year % Math.max(1, Math.round(YEARS / 12)) !== 0 && h.year !== 1) continue;
  console.log(
    String(h.year).padStart(5) + h.pop.toFixed(1).padStart(12) + String(h.buildings).padStart(9) +
    String(h.techs).padStart(9) + String(h.idle).padStart(9) +
    KEY.map((k) => String(h.stocks[k]).padStart(9)).join(''));
}
console.log('');

console.log(line);
console.log('СНАБЖЕНИЕ НАСЕЛЕНИЯ');
console.log(line);
console.log('Голод — среднее за месяц ниже 0.75. Без запаса — ниже 0.95: это нормальное');
console.log('состояние системы, стоящей на пределе ёмкости, а не отказ снабжения.');
console.log('');
const allNeeds = Object.keys(NEEDS.perThousandPopPerDay);
console.log('ресурс'.padEnd(18) + 'голод, дней'.padStart(14) + 'без запаса, дней'.padStart(19));
for (const id of allNeeds) {
  const s = state.starvedDays.get(id) ?? 0, t = state.tightDays.get(id) ?? 0;
  console.log(id.padEnd(18) + `${s} (${(s / DAYS * 100).toFixed(1)}%)`.padStart(14) +
    `${t} (${(t / DAYS * 100).toFixed(1)}%)`.padStart(19) + (s > 730 ? '  ← КРИТИЧНО' : ''));
}
console.log('');

console.log(line);
console.log('ПРОСТОИ ЗДАНИЙ НА КОНЕЦ ПРОГОНА');
console.log(line);
const idleBy = new Map();
for (const b of state.buildings) {
  if (b.busyUntil >= state.day || !b.idleReason) continue;
  const k = `${B.get(b.bid).name} — ${b.idleReason}`;
  idleBy.set(k, (idleBy.get(k) ?? 0) + 1);
}
if (!idleBy.size) console.log('Простаивающих зданий нет.');
for (const [k, n] of [...idleBy.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
console.log('');

console.log(line);
console.log('СОСТАВ КОЛОНИИ НА КОНЕЦ ПРОГОНА');
console.log(line);
for (const body of state.bodies) {
  const here = state.buildings.filter((b) => b.body === body.id);
  const counts = new Map();
  for (const b of here) counts.set(b.bid, (counts.get(b.bid) ?? 0) + 1);
  console.log(`${body.name.padEnd(20)} слоты ${String(body.used).padStart(2)}/${String(body.slots).padEnd(3)} энергия ${body.energy.toFixed(0).padStart(4)}/${body.energyCap}`);
  if (counts.size) console.log('   ' + [...counts.entries()].map(([id, n]) => `${n}× ${B.get(id).name}`).join(', '));
}
console.log('');

console.log(line);
console.log('КРИТЕРИИ УСПЕХА');
console.log(line);
if (state.saturatedAt) {
  console.log(`Домашняя система насыщена на ${(state.saturatedAt / 365).toFixed(1)} году — дальше требуется колонизация.`);
  console.log('');
}
const C = PKG.successCriteria;
const minPop = Math.min(...state.history.map((h) => h.pop));
const y50 = state.history.find((h) => h.year === Math.min(50, YEARS)) ?? state.history.at(-1);
const dataYear = state.history.find((h) => h.techs > 1);
const worstStarve = Math.max(0, ...state.starvedDays.values());
const checks = [
  [`Население не падало ниже ${C.populationNeverBelow}`, minPop >= C.populationNeverBelow, `минимум ${minPop.toFixed(1)}`],
  [`Наука пошла до ${C.allThreeDataFlowingByYear} года`, dataYear && dataYear.year <= C.allThreeDataFlowingByYear, dataYear ? `первая технология к ${dataYear.year} году` : 'ни одной технологии'],
  [`Население выросло в ${C.populationMultipleByYear50}× к ${Math.min(50, YEARS)} году`, y50.pop >= PKG.population.start * C.populationMultipleByYear50, `${(y50.pop / PKG.population.start).toFixed(2)}×`],
  [`Зданий не меньше ${C.buildingsByYear50} к ${Math.min(50, YEARS)} году`, y50.buildings >= C.buildingsByYear50, `${y50.buildings}`],
  [`Ни один ресурс не голодал дольше ${C.noResourceStarvedLongerThanDays} дней`, worstStarve <= C.noResourceStarvedLongerThanDays, `максимум ${worstStarve} дней`],
];
let failed = 0;
for (const [label, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(58)} ${detail}`);
}
console.log('');

if (VERBOSE) {
  console.log(line);
  console.log('ЖУРНАЛ СОБЫТИЙ');
  console.log(line);
  for (const e of state.events.slice(0, 120)) console.log('  ' + e);
  console.log('');
}
console.log(line);
process.exit(failed ? 1 : 0);
