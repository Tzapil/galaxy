// Многофракционный прогон: казна, флоты, блокады, дипломатия, расколы.
// Запуск: node war.mjs [лет] [--systems=N] [--factions=N] [--seed=N] [--verbose]
//
// Надмножество galaxy.mjs. Проверяет пять утверждений ТЗ, которые невозможно проверить
// на одной фракции:
//
//   A. Блокада → срыв поставок → скачок цен → остановка верфи → военная слабость
//      (центральная цепочка решения №12)
//   B. Война объявляется по экономической причине из MRP, а не броском кубика (№15)
//   C. Казна ограничивает размер флота (№4, №14)
//   D. Административная ёмкость ограничивает размер империи, перерасширение даёт раскол (№15)
//   E. Коалиции против лидера мешают снежному кому (№15)
//
// Каждое крупное решение ИИ порождает событие с ПРИЧИНОЙ — это требование решения №15,
// а не украшение: без него невозможно понять, почему фракция сделала глупость.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, loadData, computeValues } from "./values.mjs";

const { RES, BATCH, CONT, BUILDINGS } = loadData();
const VALUE = computeValues(
  RES,
  BATCH.reduce((m, r) => {
    for (const o of Object.keys(r.outputs)) {
      if (!m.has(o)) m.set(o, []);
      m.get(o).push(r);
    }
    return m;
  }, new Map())
);
const TECHS = JSON.parse(readFileSync(join(DATA_DIR, "techs.json"), "utf8")).techs;
const PKG = JSON.parse(readFileSync(join(DATA_DIR, "start-package.json"), "utf8"));

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.slice(k.length + 3)) : d;
};
const YEARS = Number(process.argv.find((a) => /^\d+$/.test(a))) || 300;
const SYSTEM_COUNT = arg("systems", 24);
const FACTION_COUNT = arg("factions", 4);
const SEED = arg("seed", 20260904);
const VERBOSE = process.argv.includes("--verbose");
const DAYS = Math.round(YEARS * 365);

const B = new Map(BUILDINGS.map((b) => [b.id, b]));
const R = new Map(BATCH.map((r) => [r.id, r]));
const T = new Map(TECHS.map((t) => [t.id, t]));
const POWER = new Map(CONT.filter((c) => c.kind === "power").map((p) => [p.building, p]));
const NEEDS = CONT.find((c) => c.kind === "consumption");
const VITAL = Object.keys(NEEDS.perThousandPopPerDay);
const DATA_TYPES = ["physics", "engineering", "bio"];
const RARE = ["rare_earth_vein", "crystal_vein", "radioactive_vein"];
const RARE_RES = {
  rare_earth_vein: "rare_earth",
  crystal_vein: "crystals",
  radioactive_vein: "radioactives"
};

const GROWTH_R = 0.00012,
  ENERGY_CAP = 260,
  EMPLOYMENT = PKG.population.employmentRate;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const pick = (a) => a[Math.floor(rng() * a.length)];

// ------------------------------------------------------------------ галактика

const BODY_TPL = [
  { type: "planet", features: ["habitable"], slots: [12, 26], w: 0.9 },
  { type: "planet", features: ["ore_deposit", "silicate_deposit"], slots: [8, 18], w: 2.0 },
  { type: "planet", features: ["ice_deposit"], slots: [5, 12], w: 1.4 },
  { type: "planet", features: ["gas_giant_orbit"], slots: [4, 10], w: 1.2 },
  { type: "asteroid", features: ["ore_deposit"], slots: [6, 14], w: 1.0 }
];
const NAMES = [
  "Кайрос",
  "Вельта",
  "Ор",
  "Тессера",
  "Гелиос",
  "Нидр",
  "Аркад",
  "Мора",
  "Секст",
  "Виндра",
  "Тарн",
  "Эол",
  "Кассий",
  "Реген",
  "Ксант",
  "Дельта",
  "Ирис",
  "Ном",
  "Веспер",
  "Крон",
  "Атрия",
  "Селен",
  "Фарос",
  "Лид",
  "Обер",
  "Пирр",
  "Сигма",
  "Тавр",
  "Улла",
  "Фрея"
];

function homeBodies() {
  return PKG.homeSystem.bodies.map((b) => ({ ...b, used: 0, energy: 0, energyCap: 0 }));
}
function randomBodies(id) {
  const out = [],
    n = 3 + Math.floor(rng() * 4),
    total = BODY_TPL.reduce((a, t) => a + t.w, 0);
  for (let i = 0; i < n; i++) {
    let r = rng() * total,
      tpl = BODY_TPL[0];
    for (const t of BODY_TPL) {
      r -= t.w;
      if (r <= 0) {
        tpl = t;
        break;
      }
    }
    const features = [...tpl.features];
    if (rng() < 0.22) features.push(pick(RARE));
    out.push({
      id: `${id}-${i}`,
      type: tpl.type,
      features,
      slots: tpl.slots[0] + Math.floor(rng() * (tpl.slots[1] - tpl.slots[0])),
      yield: 0.7 + rng() * 0.6,
      used: 0,
      energy: 0,
      energyCap: 0
    });
  }
  return out;
}

const systems = [];
for (let i = 0; i < SYSTEM_COUNT; i++) {
  systems.push({
    id: i,
    name: NAMES[i % NAMES.length] + (i >= NAMES.length ? `-${i}` : ""),
    bodies: null,
    res: new Map(),
    owner: null,
    buildings: [],
    pop: 0,
    construction: [],
    satEma: new Map(),
    capitalSpend: new Map(),
    foundedAt: -1
  });
}

const gates = [],
  gateSet = new Set();
const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
function addGate(a, b) {
  if (a === b || gateSet.has(key(a, b))) return;
  gateSet.add(key(a, b));
  gates.push({ id: gates.length, a, b, days: 3 + Math.floor(rng() * 5), blockadedBy: null });
}
for (let i = 0; i < SYSTEM_COUNT; i++) addGate(i, (i + 1) % SYSTEM_COUNT);
let guard = 0;
while (gates.length < Math.round(SYSTEM_COUNT * 1.5) && guard++ < 400) {
  addGate(Math.floor(rng() * SYSTEM_COUNT), Math.floor(rng() * SYSTEM_COUNT));
}
const adj = systems.map(() => []);
for (const g of gates) {
  adj[g.a].push({ to: g.b, g });
  adj[g.b].push({ to: g.a, g });
}

// Маршрутизация с учётом блокад: блокированные врата непроходимы для чужих (решение №12).
function route(from, to, factionId) {
  if (from === to) return { days: 0, hops: 0 };
  const d = new Array(SYSTEM_COUNT).fill(Infinity),
    h = new Array(SYSTEM_COUNT).fill(Infinity);
  d[from] = 0;
  h[from] = 0;
  const seen = new Set();
  while (seen.size < SYSTEM_COUNT) {
    let u = -1,
      best = Infinity;
    for (let i = 0; i < SYSTEM_COUNT; i++)
      if (!seen.has(i) && d[i] < best) {
        best = d[i];
        u = i;
      }
    if (u < 0) break;
    seen.add(u);
    for (const e of adj[u]) {
      if (e.g.blockadedBy !== null && e.g.blockadedBy !== factionId) continue;
      if (d[u] + e.g.days < d[e.to]) {
        d[e.to] = d[u] + e.g.days;
        h[e.to] = h[u] + 1;
      }
    }
  }
  return Number.isFinite(d[to]) ? { days: d[to], hops: h[to] } : null;
}
// расстояние без учёта блокад — для оценки колонизации и дипломатии
const rawDist = systems.map((_, s) => {
  const d = new Array(SYSTEM_COUNT).fill(Infinity);
  d[s] = 0;
  const seen = new Set();
  while (seen.size < SYSTEM_COUNT) {
    let u = -1,
      best = Infinity;
    for (let i = 0; i < SYSTEM_COUNT; i++)
      if (!seen.has(i) && d[i] < best) {
        best = d[i];
        u = i;
      }
    if (u < 0) break;
    seen.add(u);
    for (const e of adj[u]) if (d[u] + e.g.days < d[e.to]) d[e.to] = d[u] + e.g.days;
  }
  return d;
});

// ------------------------------------------------------------------ фракции

const PERSONALITIES = [
  { id: "militarist", name: "милитарист", war: 1.6, expand: 1.0, trade: 0.7, admin: 0.9 },
  { id: "trader", name: "торговец", war: 0.6, expand: 1.1, trade: 1.6, admin: 1.1 },
  { id: "isolationist", name: "изоляционист", war: 0.7, expand: 0.7, trade: 0.9, admin: 1.4 },
  { id: "expansionist", name: "экспансионист", war: 1.1, expand: 1.6, trade: 0.9, admin: 0.8 }
];
const FNAMES = [
  "Республика Векта",
  "Синдикат Ор",
  "Ковенант Тайра",
  "Лига Мендо",
  "Directorate Ксан",
  "Дом Аврелий"
];

const factions = [];
// стартовые системы разносим как можно дальше друг от друга
const starts = [0];
while (starts.length < FACTION_COUNT) {
  let best = -1,
    bestMin = -1;
  for (let i = 0; i < SYSTEM_COUNT; i++) {
    if (starts.includes(i)) continue;
    const m = Math.min(...starts.map((s) => rawDist[s][i]));
    if (m > bestMin) {
      bestMin = m;
      best = i;
    }
  }
  starts.push(best);
}
for (let f = 0; f < FACTION_COUNT; f++) {
  factions.push({
    id: f,
    name: FNAMES[f % FNAMES.length],
    p: PERSONALITIES[f % PERSONALITIES.length],
    credits: PKG.treasury.credits,
    researched: new Set(PKG.technologies),
    data: { physics: 0, engineering: 0, bio: 0 },
    colonies: [starts[f]],
    unlocked: new Set(),
    ships: [],
    warships: 0,
    warshipQuality: 1,
    relations: new Map(),
    warExhaustion: 0,
    capital: starts[f],
    seceded: false,
    alive: true
  });
}
for (const f of factions)
  for (const g of factions)
    if (f !== g) f.relations.set(g.id, { war: false, opinion: 0, since: 0 });

function refreshUnlocked(f) {
  f.unlocked = new Set();
  for (const id of f.researched)
    for (const e of T.get(id)?.effects ?? []) if (e.type === "unlockBuilding") f.unlocked.add(e.id);
}
for (const f of factions) refreshUnlocked(f);

const get = (s, id) => s.res.get(id) ?? 0;
const add = (s, id, q) => s.res.set(id, Math.max(0, get(s, id) + q));

function placeBuilding(sys, bid, bodyId) {
  const b = B.get(bid),
    body = sys.bodies.find((x) => x.id === bodyId);
  if (!b || !body || body.used + b.slots > body.slots) return false;
  if (b.placement.requires && !body.features.includes(b.placement.requires)) return false;
  body.used += b.slots;
  if (POWER.has(bid)) body.energyCap += ENERGY_CAP;
  sys.buildings.push({
    bid,
    body: bodyId,
    recipe: b.recipe,
    workers: b.recipe
      ? (R.get(b.recipe)?.workers ?? POWER.get(bid)?.workers ?? 0)
      : (b.workers ?? 0),
    busyUntil: -1,
    idleReason: ""
  });
  return true;
}

// инициализация домашних систем
for (const f of factions) {
  const s = systems[f.capital];
  s.bodies = homeBodies();
  s.owner = f.id;
  s.pop = PKG.population.start;
  s.foundedAt = 0;
  for (const [k, v] of Object.entries(PKG.stockpiles)) if (RES.has(k)) s.res.set(k, v);
  for (const b of PKG.buildings) placeBuilding(s, b.id, b.body);
}
for (const s of systems) if (!s.bodies) s.bodies = randomBodies(s.id);

// ------------------------------------------------------------------ корабли

let shipSeq = 0;
function makeShip(f, role, at) {
  const p =
    role === "hauler"
      ? { cargoCapacity: 1600, fuelCapacity: 220, fuelPerJump: 7 }
      : { cargoCapacity: 400, fuelCapacity: 320, fuelPerJump: 10 };
  const sh = {
    id: ++shipSeq,
    f: f.id,
    role,
    at,
    ...p,
    fuel: 0,
    cargo: new Map(),
    arriveAt: -1,
    dest: at,
    foundHere: false
  };
  f.ships.push(sh);
  return sh;
}
for (const f of factions) {
  for (let i = 0; i < 7; i++) makeShip(f, "hauler", f.capital);
  makeShip(f, "colonizer", f.capital);
}

// ------------------------------------------------------------------ цены и спрос

const demandCache = new Map();
function demandRate(sys) {
  const c = demandCache.get(sys.id);
  if (c && c.day === state.day) return c.map;
  const m = new Map();
  for (const b of sys.buildings) {
    const p = POWER.get(b.bid);
    if (p) {
      for (const [id, q] of Object.entries(p.inputsPerDay ?? {})) m.set(id, (m.get(id) ?? 0) + q);
      continue;
    }
    const rec = R.get(b.recipe);
    if (!rec) continue;
    for (const [id, q] of Object.entries(rec.inputs))
      if (id !== "energy") m.set(id, (m.get(id) ?? 0) + q / rec.durationDays);
  }
  for (const [id, rate] of Object.entries(NEEDS.perThousandPopPerDay))
    m.set(id, (m.get(id) ?? 0) + sys.pop * rate);
  demandCache.set(sys.id, { day: state.day, map: m });
  return m;
}
const targetStock = (s, id) => Math.max(40, (demandRate(s).get(id) ?? 0) * 60);
function price(s, id) {
  const ratio = get(s, id) / targetStock(s, id);
  return (VALUE.get(id) ?? 1) * Math.max(0.15, Math.min(4.0, 2.5 - 2 * ratio));
}

// ------------------------------------------------------------------ экономика колонии

function colonyTick(sys, f, d) {
  const pe = new Map();
  for (const b of sys.buildings) {
    const p = POWER.get(b.bid);
    if (!p) continue;
    if (!Object.entries(p.inputsPerDay ?? {}).every(([id, q]) => get(sys, id) >= q)) {
      b.idleReason = "нет топлива";
      continue;
    }
    for (const [id, q] of Object.entries(p.inputsPerDay ?? {})) add(sys, id, -q);
    pe.set(b.body, (pe.get(b.body) ?? 0) + p.outputPerDay.energy);
  }
  for (const body of sys.bodies)
    body.energy = Math.min(body.energyCap, body.energy + (pe.get(body.id) ?? 0));

  for (const [id, rate] of Object.entries(NEEDS.perThousandPopPerDay)) {
    const need = sys.pop * rate,
      taken = Math.min(get(sys, id), need);
    add(sys, id, -taken);
    const s = need > 0 ? taken / need : 1;
    const prev = sys.satEma.get(id) ?? 1;
    sys.satEma.set(id, prev + (s - prev) / 30);
  }
  const ema = Math.min(sys.satEma.get("food") ?? 1, sys.satEma.get("water") ?? 1);
  const growth = ema >= 0.98 ? 1 : ema >= 0.9 ? 0 : ema >= 0.6 ? -0.15 : -0.6;
  const housing = sys.buildings.filter((b) => b.bid === "housing").length;
  sys.popCap = 120 + housing * 90 + sys.buildings.length * 2;
  sys.pop = Math.max(0.5, sys.pop + GROWTH_R * sys.pop * (1 - sys.pop / sys.popCap) * growth);

  for (const b of sys.buildings) {
    if (b.busyUntil !== d) continue;
    const rec = R.get(b.recipe),
      y = sys.bodies.find((x) => x.id === b.body)?.yield ?? 1;
    for (const [id, q] of Object.entries(rec.outputs)) add(sys, id, q * y);
    b.busyUntil = -1;
  }
  let workers = sys.pop * EMPLOYMENT;
  for (const b of sys.buildings) if (b.busyUntil > d) workers -= b.workers;
  for (const b of sys.buildings) {
    if (b.busyUntil >= d || !b.recipe || POWER.has(b.bid)) continue;
    const rec = R.get(b.recipe);
    if (!rec || workers < b.workers) {
      if (rec) b.idleReason = "нет рабочих";
      continue;
    }
    const body = sys.bodies.find((x) => x.id === b.body),
      eN = rec.inputs.energy ?? 0;
    if (body.energy < eN) {
      b.idleReason = "нет энергии";
      continue;
    }
    const miss = Object.entries(rec.inputs).find(([id, q]) => id !== "energy" && get(sys, id) < q);
    if (miss) {
      b.idleReason = `нет ${miss[0]}`;
      continue;
    }
    body.energy -= eN;
    for (const [id, q] of Object.entries(rec.inputs)) if (id !== "energy") add(sys, id, -q);
    workers -= b.workers;
    b.busyUntil = d + rec.durationDays;
    b.idleReason = "";
  }
  for (const c of sys.construction) if (c.doneAt === d) placeBuilding(sys, c.bid, c.body);
  sys.construction = sys.construction.filter((c) => c.doneAt > d);
  if (d % 30 === sys.id % 30) builderAI(sys, f, d);
}

// РАЗВЁРТКА СПРОСА НАЗАД ПО ГРАФУ РЕЦЕПТОВ — это и есть MRP из решения №8.
// Без неё ИИ видит только ПРЯМОЕ потребление: корпусные секции в спросе есть, а композиты,
// без которых верфь не построить, — нет, потому что их пока никто не потребляет. В прогоне
// это дало ноль корпусных верфей у всех четырёх фракций и, как следствие, ноль военных
// кораблей за триста лет. Один уровень вложенности — не MRP, а просто учёт расхода.
function explodeDemand(resId, perDay, cons, depth = 0) {
  if (depth > 6 || perDay <= 0) return;
  cons.set(resId, (cons.get(resId) ?? 0) + perDay);
  const rec = BATCH.find((r) => r.outputs[resId]);
  if (!rec) return;
  const per = rec.outputs[resId];
  for (const [inId, q] of Object.entries(rec.inputs)) {
    if (inId === "energy") continue;
    explodeDemand(inId, (q / per) * perDay, cons, depth + 1);
  }
}

function supplyRates(sys, f) {
  const prod = new Map(),
    cons = new Map(demandRate(sys));
  for (const b of sys.buildings) {
    const rec = R.get(b.recipe);
    if (!rec || POWER.has(b.bid)) continue;
    const y = sys.bodies.find((x) => x.id === b.body)?.yield ?? 1;
    for (const [id, q] of Object.entries(rec.outputs))
      prod.set(id, (prod.get(id) ?? 0) + (q * y) / rec.durationDays);
  }
  const days = Math.max(365, state.day);
  for (const [id, sp] of sys.capitalSpend) cons.set(id, (cons.get(id) ?? 0) + sp / days);
  cons.set("fuel", (cons.get("fuel") ?? 0) + 2 + sys.pop * 0.012);
  // Флотский спрос размазан по ВСЕЙ империи, а не только по столице: столичная система
  // насыщается по слотам к второму году, и оружейный завод там уже не поставить — фракция
  // остаётся с одним военным кораблём на всю партию.
  const share = 1 / Math.max(1, f.colonies.length);
  explodeDemand("hull_frames", 1.6 * share, cons);
  explodeDemand("thrusters", 1.0 * share, cons);
  explodeDemand("reactors", 0.7 * share, cons);
  explodeDemand("weapons", 0.9 * share, cons);
  explodeDemand("armor", 0.9 * share, cons);
  explodeDemand("life_support", 0.6 * share, cons);
  return { prod, cons };
}

function tryBuild(sys, f, bid) {
  const b = B.get(bid);
  if (!b || !f.unlocked.has(bid)) return false;
  const cost = b.buildCost ?? {};
  if (!Object.entries(cost).every(([id, q]) => get(sys, id) >= q)) return false;
  const cands = sys.bodies.filter((body) => {
    if (body.used + b.slots > body.slots) return false;
    if (b.placement.requires && !body.features.includes(b.placement.requires)) return false;
    if (b.recipe && !POWER.has(bid) && body.energyCap === 0) return false;
    return true;
  });
  if (!cands.length) return false;
  const t = cands.sort((x, z) => z.slots - z.used - (x.slots - x.used))[0];
  for (const [id, q] of Object.entries(cost)) {
    add(sys, id, -q);
    sys.capitalSpend.set(id, (sys.capitalSpend.get(id) ?? 0) + q);
  }
  sys.construction.push({ bid, body: t.id, doneAt: state.day + b.buildDays });
  return true;
}

function builderAI(sys, f, d) {
  if (sys.construction.length >= 2) return;

  // АРСЕНАЛ. Жадный послотовый строитель принципиально не умеет выделить место под
  // многослотовый стратегический объект: корпусная верфь требует три слота и конкурирует
  // с текущими дефицитами, которые всегда острее. За триста лет ни одна из четырёх фракций
  // не построила ни одной верфи и осталась вовсе без флота.
  // Решение — стратегический резерв: фракция назначает одну колонию арсеналом, и там
  // военная цепочка имеет абсолютный приоритет. Реальные империи так и делают.
  if (f.arsenal === undefined) f.arsenal = f.capital;
  if (sys.id === f.arsenal) {
    const NAVAL = ["hull_yard", "reactor_works", "weapon_works", "armor_works", "thruster_works"];
    for (const bid of NAVAL) {
      if (sys.buildings.some((b) => b.bid === bid)) continue;
      if (tryBuild(sys, f, bid)) return;
      if (demolish(sys, f, B.get(bid).slots)) return;
      break; // строим цепочку по порядку, не перескакивая
    }
  }

  const starved = sys.bodies.find(
    (body) =>
      sys.buildings.some((b) => b.body === body.id && b.idleReason === "нет энергии") ||
      (body.energyCap === 0 && sys.buildings.some((b) => b.body === body.id && b.recipe))
  );
  if (starved) {
    for (const gen of ["fusion_plant", "fission_plant", "solar_array"]) {
      const g = B.get(gen);
      if (!f.unlocked.has(gen) || starved.used + g.slots > starved.slots) continue;
      if (!Object.entries(g.buildCost).every(([id, q]) => get(sys, id) >= q)) continue;
      for (const [id, q] of Object.entries(g.buildCost)) add(sys, id, -q);
      sys.construction.push({ bid: gen, body: starved.id, doneAt: d + g.buildDays });
      return;
    }
  }
  const crunch =
    sys.buildings.filter((b) => b.idleReason === "нет рабочих").length > sys.buildings.length * 0.1;
  const vitalOk = Math.min(sys.satEma.get("food") ?? 0, sys.satEma.get("water") ?? 0) >= 0.85;
  if (crunch || (vitalOk && sys.pop > 0.85 * (sys.popCap ?? 120))) {
    if (tryBuild(sys, f, "housing")) return;
    if (crunch) return;
  }
  const { prod, cons } = supplyRates(sys, f);
  const defs = [];
  for (const [id, need] of cons) {
    if (need <= 0) continue;
    const days = get(sys, id) / need;
    if (days > 90) continue;
    const ratio = (prod.get(id) ?? 0) / need;
    if (ratio < 1.1) defs.push({ id, ratio, days, vital: VITAL.includes(id) });
  }
  defs.sort((a, b) => b.vital - a.vital || a.days - b.days || a.ratio - b.ratio);
  for (const def of defs)
    for (const rec of BATCH.filter((r) => r.outputs[def.id])) {
      const bld = BUILDINGS.find((x) => x.recipe === rec.id);
      if (!bld) continue;
      if (tryBuild(sys, f, bld.id)) return;
      if (demolish(sys, f, bld.slots)) return;
    }
  if (defs.length && demolish(sys, f, 1)) return;
  for (const bid of [
    "engineering_lab",
    "physics_lab",
    "bio_lab",
    "alloy_works",
    "electronics_plant"
  ]) {
    if (tryBuild(sys, f, bid)) return;
  }
}

// Снос избыточного ради освобождения нужного числа слотов на ОДНОМ теле.
// Без учёта требуемого размера колония никогда не построит корпусную верфь: она занимает
// три слота, а снос освобождает по одному.
function demolish(sys, f, needSlots = 1) {
  if (sys.bodies.some((b) => b.slots - b.used >= needSlots)) return false;
  let freed = false;
  for (let attempt = 0; attempt < needSlots + 1; attempt++) {
    if (sys.bodies.some((b) => b.slots - b.used >= needSlots)) break;
    if (!demolishOne(sys, f)) break;
    freed = true;
  }
  return freed;
}

function demolishOne(sys, f) {
  const cap = sys.popCap ?? 120;
  if (cap > sys.pop * 1.4) {
    const h = sys.buildings.find((b) => b.bid === "housing");
    if (h) {
      sys.buildings.splice(sys.buildings.indexOf(h), 1);
      sys.bodies.find((x) => x.id === h.body).used -= B.get("housing").slots;
      return true;
    }
  }
  const { prod, cons } = supplyRates(sys, f);
  let best = null;
  for (const b of sys.buildings) {
    if (!b.recipe || POWER.has(b.bid) || b.bid === "housing") continue;
    const rec = R.get(b.recipe);
    if (!rec) continue;
    let ok = true,
      slack = Infinity;
    for (const [id, q] of Object.entries(rec.outputs)) {
      const need = cons.get(id) ?? 0;
      if (need <= 0) {
        ok = false;
        break;
      }
      const after = (prod.get(id) ?? 0) - q / rec.durationDays;
      const flowOk = after >= need * 1.05;
      const years = after >= need ? Infinity : get(sys, id) / ((need - after) * 365);
      if (!flowOk && years < 5) {
        ok = false;
        break;
      }
      slack = Math.min(slack, flowOk ? after / need : 1 + years / 100);
    }
    if (ok && (!best || slack > best.slack)) best = { b, slack };
  }
  if (!best) return false;
  sys.buildings.splice(sys.buildings.indexOf(best.b), 1);
  sys.bodies.find((x) => x.id === best.b.body).used -= B.get(best.b.bid).slots;
  return true;
}

// ------------------------------------------------------------------ логистика

function refreshJobs(f) {
  f.jobs = [];
  const cols = f.colonies.map((i) => systems[i]);
  for (const res of RES.values()) {
    if (!res.transportable || res.phase !== 1) continue;
    for (const src of cols) {
      if (get(src, res.id) < 60) continue;
      const ps = price(src, res.id);
      for (const dst of cols) {
        if (src === dst) continue;
        const pd = price(dst, res.id);
        if (pd <= ps * 1.25) continue;
        const r = route(src.id, dst.id, f.id);
        if (!r) continue; // маршрут перерезан блокадой
        const qty = Math.min(get(src, res.id) * 0.4, 1600 / (res.unitVolume || 1));
        f.jobs.push({
          res: res.id,
          from: src.id,
          to: dst.id,
          qty,
          score: ((pd - ps) * qty) / Math.max(1, r.days)
        });
      }
    }
  }
  f.jobs.sort((a, b) => b.score - a.score);
  f.jobs = f.jobs.slice(0, 80);
}

function refuel(sh, sys) {
  const room = sh.fuelCapacity - sh.fuel;
  const avail = Math.max(0, get(sys, "fuel") - (sys.pop > 1 ? 40 : 0));
  const take = Math.min(room, avail);
  if (take > 0) {
    add(sys, "fuel", -take);
    sh.fuel += take;
  }
}
function depart(sh, from, toId, f, d) {
  const r = route(from.id, toId, f.id);
  if (!r) {
    state.blockadeBlocked++;
    return false;
  }
  refuel(sh, from);
  const need = sh.fuelPerJump * Math.max(1, r.hops);
  if (sh.fuel < need) {
    state.fuelBlocked++;
    return false;
  }
  sh.fuel -= need;
  sh.dest = toId;
  sh.arriveAt = d + Math.max(1, r.days);
  state.trips++;
  return true;
}

function shipTick(f, d) {
  for (const sh of f.ships) {
    if (sh.arriveAt === d) {
      sh.at = sh.dest;
      sh.arriveAt = -1;
      const sys = systems[sh.at];
      for (const [id, q] of sh.cargo) {
        add(sys, id, q);
        state.moved += q;
      }
      sh.cargo.clear();
      if (sh.role === "colonizer" && sh.foundHere) {
        foundColony(sys, f, d);
        sh.foundHere = false;
      }
    }
    if (sh.arriveAt > 0 || sh.role !== "hauler") continue;
    const at = systems[sh.at];
    const idx = f.jobs.findIndex((j) => j.from === sh.at);
    if (idx < 0) {
      const j = f.jobs[0];
      if (j && j.from !== sh.at) depart(sh, at, j.from, f, d);
      continue;
    }
    const job = f.jobs.splice(idx, 1)[0];
    const res = RES.get(job.res);
    const take = Math.min(
      job.qty,
      get(at, job.res),
      Math.floor(sh.cargoCapacity / (res.unitVolume || 1))
    );
    if (take < 10) continue;
    add(at, job.res, -take);
    sh.cargo.set(job.res, take);
    if (!depart(sh, at, job.to, f, d)) {
      add(at, job.res, take);
      sh.cargo.clear();
    }
  }
}

// ------------------------------------------------------------------ колонизация

function colonyScore(sys, f) {
  let s = 0;
  for (const b of sys.bodies) {
    if (b.features.includes("habitable")) s += 40 * b.yield;
    for (const ft of b.features) {
      if (RARE.includes(ft)) s += 25 * b.yield;
      if (ft === "ore_deposit") s += 6 * b.yield;
      if (ft === "ice_deposit") s += 8 * b.yield;
      if (ft === "gas_giant_orbit") s += 7 * b.yield;
    }
    s += b.slots * 0.6;
  }
  const near = Math.min(...f.colonies.map((c) => rawDist[c][sys.id]));
  return s / (1 + near / 12);
}

function foundColony(sys, f, d) {
  if (sys.owner !== null) return;
  sys.owner = f.id;
  sys.pop = 12;
  sys.foundedAt = d;
  f.colonies.push(sys.id);
  for (const bid of [
    "solar_array",
    "solar_array",
    "housing",
    "mine",
    "ice_drill",
    "water_plant",
    "farm",
    "food_plant",
    "pharma_plant",
    "consumer_plant",
    "smelter"
  ]) {
    const b = B.get(bid);
    const body = sys.bodies.find(
      (x) =>
        x.used + b.slots <= x.slots &&
        (!b.placement.requires || x.features.includes(b.placement.requires))
    );
    if (body) placeBuilding(sys, bid, body.id);
  }
  for (const [id, q] of Object.entries({
    food: 120,
    water: 120,
    medicine: 30,
    consumer_goods: 40,
    metal: 300,
    alloys: 120,
    polymers: 80,
    biomass: 60,
    electronics: 60,
    composites: 60,
    fuel: 220
  }))
    add(sys, id, q);
  ev(d, `${f.name}: основана колония ${sys.name}`);
}

// ------------------------------------------------------------------ казна (решение №4)

function treasuryTick(f, d) {
  if (d % 30 !== 0) return;
  let tax = 0;
  for (const c of f.colonies) tax += systems[c].pop * 0.02 * 30;
  const upkeep = (f.ships.length * 2.5 + f.warships * 14) * 30;
  f.credits += tax - upkeep;
  f.lastTax = tax / 30;
  f.lastUpkeep = upkeep / 30;
  if (f.credits < 0) {
    // Казна в минусе — флот распускается. Это и есть ограничитель размера флота (решение №14).
    if (f.warships > 0) {
      f.warships--;
      ev(
        d,
        `${f.name}: расформирован военный корабль. Причина: казна в минусе (${f.credits.toFixed(0)} кр.)`
      );
    }
    f.credits = Math.max(f.credits, -200);
  }
}

// ------------------------------------------------------------------ военное строительство

function militaryTick(f, d) {
  if (d % 60 !== 0) return;
  const atWar = [...f.relations.values()].some((r) => r.war);
  const want = atWar ? 16 : 6;
  if (f.warships >= want) return;
  const cost = { hull_frames: 4, weapons: 3, armor: 3, reactors: 1, thrusters: 2 };
  // Верфь работает там, где есть материалы, а не обязательно в столице
  const yard = f.colonies
    .map((c) => systems[c])
    .filter((s) => Object.entries(cost).every(([id, q]) => get(s, id) >= q))
    .sort((a, b) => get(b, "hull_frames") - get(a, "hull_frames"))[0];
  if (!yard) {
    f.shipyardBlocked = (f.shipyardBlocked ?? 0) + 1;
    return;
  }
  if (f.credits < 300) {
    f.creditBlocked = (f.creditBlocked ?? 0) + 1;
    return;
  }
  for (const [id, q] of Object.entries(cost)) add(yard, id, -q);
  f.credits -= 300;
  f.warships++;
  f.builtWarships = (f.builtWarships ?? 0) + 1;
}

const strength = (f) => f.warships * (1 + 0.05 * f.researched.size);

// ------------------------------------------------------------------ дипломатия и блокады (решения №12, №15)

function bottleneck(f) {
  // Узкое место фракции по редкому сырью — то самое, что MRP выдаёт как casus belli
  let worst = null;
  for (const resId of Object.values(RARE_RES)) {
    let prod = 0,
      need = 0;
    for (const c of f.colonies) {
      const s = systems[c];
      need += demandRate(s).get(resId) ?? 0;
      for (const b of s.buildings) {
        const rec = R.get(b.recipe);
        if (rec?.outputs[resId]) prod += rec.outputs[resId] / rec.durationDays;
      }
    }
    const ratio = need > 0 ? prod / need : 2;
    if (!worst || ratio < worst.ratio) worst = { res: resId, ratio, need };
  }
  return worst;
}

function diplomacyTick(f, d) {
  if (d % 365 !== 0 || !f.alive) return;
  const others = factions.filter((x) => x.alive && x !== f);
  if (!others.length) return;
  const myStr = strength(f);
  const total = factions.filter((x) => x.alive).reduce((a, x) => a + x.colonies.length, 0);

  for (const o of others) {
    const rel = f.relations.get(o.id);
    if (rel.war) {
      f.warExhaustion += 0.02 + 0.01 * (strength(o) / Math.max(1, myStr));
      const losing = strength(o) > myStr * 1.4;
      if (f.warExhaustion > 0.7 || losing) {
        rel.war = false;
        o.relations.get(f.id).war = false;
        f.warExhaustion = 0;
        o.warExhaustion = 0;
        for (const g of gates)
          if (g.blockadedBy === f.id || g.blockadedBy === o.id) g.blockadedBy = null;
        ev(
          d,
          `${f.name} заключает мир с ${o.name}. Причина: ${losing ? "превосходство противника" : "усталость от войны"}`
        );
      }
      continue;
    }
    // Решение о войне: нужда (MRP) × способность / цена, плюс характер (решение №15)
    const bn = bottleneck(f);
    const theyHave = o.colonies.some((c) =>
      systems[c].bodies.some((b) => b.features.some((ft) => RARE_RES[ft] === bn.res))
    );
    const need = bn.ratio < 0.8 && theyHave ? (1 - bn.ratio) * 2.2 : 0.15;
    const capable = myStr / Math.max(1, strength(o));
    const hegemon = o.colonies.length / Math.max(1, total) > 0.45 ? 1.5 : 1; // коалиция против лидера
    const score = need * capable * f.p.war * hegemon + rel.opinion * -0.01;
    if (score > 1.5 && myStr > 3) {
      rel.war = true;
      o.relations.get(f.id).war = true;
      rel.since = d;
      const why =
        theyHave && bn.ratio < 0.8
          ? `дефицит ${bn.res} (обеспеченность ${(bn.ratio * 100).toFixed(0)}%), ближайший источник — территория противника`
          : hegemon > 1
            ? "противник слишком усилился, коалиция против гегемона"
            : "благоприятный баланс сил";
      ev(d, `${f.name} ОБЪЯВЛЯЕТ ВОЙНУ ${o.name}. Причина: ${why}`);
      state.wars.push({ from: f.name, to: o.name, day: d, why });
    }
  }
}

function blockadeTick(f, d) {
  if (d % 90 !== 0) return;
  const enemies = factions.filter((x) => x.alive && f.relations.get(x.id)?.war);
  for (const g of gates) if (g.blockadedBy === f.id) g.blockadedBy = null;
  if (!enemies.length || f.warships < 4) return;
  // Блокируем врата, ведущие в системы противника: это статус ребра, боя не требует (№12)
  let placed = 0;
  const budget = Math.floor(f.warships / 4);
  for (const g of gates) {
    if (placed >= budget) break;
    const oa = systems[g.a].owner,
      ob = systems[g.b].owner;
    const hitsEnemy = enemies.some((e) => oa === e.id || ob === e.id);
    if (!hitsEnemy) continue;
    g.blockadedBy = f.id;
    placed++;
    state.blockadeDays += 90;
    if (!state.blockadeNoted.has(g.id)) {
      state.blockadeNoted.add(g.id);
      ev(d, `${f.name}: блокада врат ${systems[g.a].name}–${systems[g.b].name}`);
    }
  }
}

// ------------------------------------------------------------------ административная ёмкость и расколы (№15)

function cohesionTick(f, d) {
  if (d % 365 !== 0 || !f.alive || f.colonies.length < 4) return;
  const adminTech = [...f.researched].filter((t) => T.get(t)?.branch === "administration").length;
  const capacity = (8 + adminTech * 9) * f.p.admin;
  for (const c of [...f.colonies]) {
    if (c === f.capital) continue;
    const s = systems[c];
    const distance = rawDist[f.capital][c];
    // Свежесть считается только для ЗАВОЁВАННЫХ систем: колония, основанная собственными
    // колонистами, лояльна с первого дня. Без этой оговорки любая новая дальняя колония
    // откалывалась сразу после основания, и империи вечно колебались вокруг трёх систем.
    const freshness = s.conquered ? Math.max(0, 1 - (d - s.conqueredAt) / (365 * 40)) : 0;
    const shortage = 1 - Math.min(s.satEma.get("consumer_goods") ?? 1, s.satEma.get("food") ?? 1);
    const tension =
      distance * 0.55 +
      freshness * 14 +
      shortage * 16 +
      f.warExhaustion * 8 +
      Math.max(0, f.colonies.length - capacity) * 1.8;
    if (tension > 40 && rng() < 0.3) {
      f.colonies = f.colonies.filter((x) => x !== c);
      s.owner = null;
      s.pop = Math.max(8, s.pop * 0.6);
      state.secessions.push({ f: f.name, sys: s.name, day: d, tension });
      ev(
        d,
        `РАСКОЛ: ${s.name} откалывается от ${f.name}. Напряжение ${tension.toFixed(0)} ` +
          `(удалённость ${distance}, дефицит ${(shortage * 100).toFixed(0)}%, ёмкость ${capacity.toFixed(0)} при ${f.colonies.length + 1} колониях)`
      );
      break;
    }
  }
}

// ------------------------------------------------------------------ прочее

function researchTick(f) {
  for (const dt of DATA_TYPES)
    for (const c of f.colonies) {
      const s = systems[c],
        q = get(s, `data_${dt}`);
      if (q > 0) {
        f.data[dt] += q;
        add(s, `data_${dt}`, -q);
      }
    }
  const avail = TECHS.filter(
    (t) =>
      !t.repeatable &&
      t.phase === 1 &&
      !f.researched.has(t.id) &&
      (t.requires ?? []).every((x) => f.researched.has(x))
  );
  const sum = (t) => Object.values(t.cost ?? {}).reduce((a, b) => a + b, 0);
  for (const t of avail.sort((a, b) => sum(a) - sum(b))) {
    if (DATA_TYPES.every((dt) => f.data[dt] >= (t.cost?.[dt] ?? 0))) {
      for (const dt of DATA_TYPES) f.data[dt] -= t.cost?.[dt] ?? 0;
      f.researched.add(t.id);
      refreshUnlocked(f);
      break;
    }
  }
}

function expansionTick(f, d) {
  if (d % 365 !== 0) return;
  const idleH = f.ships.filter((s) => s.role === "hauler" && s.arriveAt < 0).length;
  if ((f.jobs?.length ?? 0) > idleH * 4 + 6) {
    const cap = systems[f.capital];
    if (
      cap.owner === f.id &&
      get(cap, "hull_frames") >= 3 &&
      get(cap, "thrusters") >= 2 &&
      get(cap, "reactors") >= 1 &&
      f.credits > 150
    ) {
      add(cap, "hull_frames", -3);
      add(cap, "thrusters", -2);
      add(cap, "reactors", -1);
      f.credits -= 150;
      makeShip(f, "hauler", f.capital);
    }
  }
  const free = systems.filter((s) => s.owner === null);
  if (!free.length) return;
  const idle = f.ships.find((s) => s.role === "colonizer" && s.arriveAt < 0);
  if (!idle) {
    const cap = systems[f.capital];
    if (
      cap.owner === f.id &&
      get(cap, "hull_frames") >= 6 &&
      get(cap, "life_support") >= 8 &&
      f.credits > 400
    ) {
      add(cap, "hull_frames", -6);
      add(cap, "life_support", -8);
      f.credits -= 400;
      makeShip(f, "colonizer", f.capital);
    }
    return;
  }
  if (rng() > 0.35 * f.p.expand) return;
  const t = free.map((s) => ({ s, v: colonyScore(s, f) })).sort((a, b) => b.v - a.v)[0];
  if (!t) return;
  idle.foundHere = true;
  depart(idle, systems[idle.at], t.s.id, f, d);
}

const ev = (d, text) => state.events.push({ year: d / 365, text });

// ------------------------------------------------------------------ главный цикл

const state = {
  day: 0,
  events: [],
  wars: [],
  secessions: [],
  moved: 0,
  trips: 0,
  fuelBlocked: 0,
  blockadeBlocked: 0,
  blockadeDays: 0,
  blockadeNoted: new Set(),
  history: []
};

for (let i = 0; i < DAYS; i++) {
  for (const f of factions) {
    if (!f.alive) continue;
    if (!f.colonies.length) {
      f.alive = false;
      ev(state.day, `${f.name} прекращает существование`);
      continue;
    }
    for (const c of f.colonies) colonyTick(systems[c], f, state.day);
    if (state.day % 10 === 0) refreshJobs(f);
    shipTick(f, state.day);
    researchTick(f, state.day);
    treasuryTick(f, state.day);
    militaryTick(f, state.day);
    expansionTick(f, state.day);
    diplomacyTick(f, state.day);
    blockadeTick(f, state.day);
    cohesionTick(f, state.day);
  }
  if (state.day % 365 === 0) {
    state.history.push({
      year: state.day / 365,
      f: factions.map((f) => ({
        col: f.colonies.length,
        pop: f.colonies.reduce((a, c) => a + systems[c].pop, 0),
        tech: f.researched.size,
        war: f.warships,
        cr: f.credits,
        atWar: [...f.relations.values()].filter((r) => r.war).length
      })),
      blockaded: gates.filter((g) => g.blockadedBy !== null).length
    });
  }
  state.day++;
}

// ------------------------------------------------------------------ отчёт

const line = "─".repeat(112);
console.log(line);
console.log(
  `МНОГОФРАКЦИОННЫЙ ПРОГОН — ${YEARS} лет, ${SYSTEM_COUNT} систем, ${FACTION_COUNT} фракции, seed ${SEED}`
);
console.log(line);
for (const f of factions)
  console.log(`  ${f.name.padEnd(20)} ${f.p.name.padEnd(14)} столица ${systems[f.capital].name}`);
console.log("");

console.log(
  "год".padStart(5) +
    factions.map((f) => `${f.name.split(" ")[1] ?? f.name}`.slice(0, 8).padStart(14)).join("") +
    "блокад".padStart(9)
);
console.log("     " + factions.map(() => "кол/нас/флот".padStart(14)).join("") + "");
for (const h of state.history) {
  if (h.year % Math.max(1, Math.round(YEARS / 15)) !== 0 && h.year !== 1) continue;
  console.log(
    String(h.year).padStart(5) +
      h.f.map((x) => `${x.col}/${x.pop.toFixed(0)}/${x.war}`.padStart(14)).join("") +
      String(h.blockaded).padStart(9)
  );
}
console.log("");

console.log(line);
console.log("ВОЙНЫ И ИХ ПРИЧИНЫ (решение №15: каждое решение объясняет себя)");
console.log(line);
if (!state.wars.length) console.log("Войн не было.");
for (const w of state.wars.slice(0, 14))
  console.log(`  [${(w.day / 365) | 0} г.] ${w.from} → ${w.to}: ${w.why}`);
console.log("");

console.log(line);
console.log("РАСКОЛЫ ИМПЕРИЙ (решение №15)");
console.log(line);
if (!state.secessions.length) console.log("Расколов не было.");
for (const s of state.secessions.slice(0, 12))
  console.log(
    `  [${(s.day / 365) | 0} г.] ${s.sys} откололась от ${s.f} (напряжение ${s.tension.toFixed(0)})`
  );
console.log("");

console.log(line);
console.log("ЛОГИСТИКА И БЛОКАДЫ");
console.log(line);
console.log(`Рейсов:                        ${state.trips.toLocaleString("ru-RU")}`);
console.log(`Груза перевезено:              ${Math.round(state.moved).toLocaleString("ru-RU")}`);
console.log(`Рейсов сорвано блокадой:       ${state.blockadeBlocked.toLocaleString("ru-RU")}`);
console.log(`Рейсов сорвано без топлива:    ${state.fuelBlocked.toLocaleString("ru-RU")}`);
console.log(`Врато-дней под блокадой:       ${state.blockadeDays.toLocaleString("ru-RU")}`);
console.log("");

console.log(line);
console.log("ИТОГ ПО ФРАКЦИЯМ");
console.log(line);
console.log(
  "фракция".padEnd(20) +
    "характер".padEnd(15) +
    "колоний".padStart(9) +
    "население".padStart(11) +
    "технол.".padStart(9) +
    "флот".padStart(7) +
    "казна".padStart(10) +
    "верфь стоп".padStart(12) +
    "казна стоп".padStart(12)
);
for (const f of factions) {
  const pop = f.colonies.reduce((a, c) => a + systems[c].pop, 0);
  console.log(
    f.name.padEnd(20) +
      f.p.name.padEnd(15) +
      String(f.colonies.length).padStart(9) +
      pop.toFixed(0).padStart(11) +
      String(f.researched.size).padStart(9) +
      String(f.warships).padStart(7) +
      f.credits.toFixed(0).padStart(10) +
      String(f.shipyardBlocked ?? 0).padStart(12) +
      String(f.creditBlocked ?? 0).padStart(12)
  );
}
const totalCol = factions.reduce((a, f) => a + f.colonies.length, 0);
const lead = factions.slice().sort((a, b) => b.colonies.length - a.colonies.length)[0];
console.log("");
console.log(
  `Доля лидера: ${((lead.colonies.length / Math.max(1, totalCol)) * 100).toFixed(0)}% колонизированных систем ` +
    `(${lead.name}). Нейтральных систем: ${systems.filter((s) => s.owner === null).length}`
);
console.log("");

console.log(line);
console.log("ПРОМЫШЛЕННОСТЬ: КЛЮЧЕВЫЕ ЗАВОДЫ ПО ФРАКЦИЯМ");
console.log(line);
const KEYB = [
  "hull_yard",
  "weapon_works",
  "armor_works",
  "reactor_works",
  "thruster_works",
  "lifesupport_works",
  "alloy_works",
  "electronics_plant",
  "composite_plant",
  "refinery"
];
console.log(
  "фракция".padEnd(20) + KEYB.map((b) => B.get(b).name.slice(0, 9).padStart(11)).join("")
);
for (const f of factions) {
  const cnt = new Map();
  for (const c of f.colonies)
    for (const b of systems[c].buildings) cnt.set(b.bid, (cnt.get(b.bid) ?? 0) + 1);
  console.log(f.name.padEnd(20) + KEYB.map((b) => String(cnt.get(b) ?? 0).padStart(11)).join(""));
}
console.log("");
console.log("Ключевые склады столиц (материалы для военного корабля):");
for (const f of factions) {
  const best = f.colonies
    .map((c) => systems[c])
    .sort((a, b) => get(b, "hull_frames") - get(a, "hull_frames"))[0];
  if (!best) continue;
  console.log(
    `  ${f.name.padEnd(20)} ${["hull_frames", "weapons", "armor", "reactors", "thrusters"]
      .map((r) => `${r} ${get(best, r).toFixed(0)}`)
      .join(", ")}`
  );
}
console.log("");

if (VERBOSE) {
  console.log(line);
  for (const e of state.events.slice(0, 90)) console.log(`  [${e.year.toFixed(0)} г.] ${e.text}`);
}
console.log(line);
