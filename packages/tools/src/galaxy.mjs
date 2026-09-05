// Многосистемный прогон: логистика, теневые цены, доска задач, колонизация.
// Запуск: node galaxy.mjs [лет] [--seed=N] [--verbose]
//
// Расширение bootstrap.mjs на несколько систем. Ключевое отличие: у КАЖДОЙ СИСТЕМЫ
// свой склад. Ресурсы перестают быть общим пулом, и всё, что между системами, обязано
// ехать на корабле. Это включает механики, которых в одиночном прогоне не было:
//
//   • теневые цены как сигнал дефицита (решение №3)
//   • доска задач с резервированием (решение №14)
//   • топливо, списываемое при вылете из склада точки отправления (решение №14)
//   • колонизация как ответ на насыщение домашней системы
//   • сеть врат и маршрутизация через неё (решение №9)
//
// Проверяемая гипотеза: колебания снабжения, в которые упёрся одиночный прогон, —
// не дефект эвристики, а следствие замкнутости системы. Насыщенная система в игре
// должна расширяться, а не перераспределять.

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

const YEARS = Number(process.argv.find((a) => /^\d+$/.test(a))) || 150;
const SEED = Number((process.argv.find((a) => a.startsWith("--seed=")) ?? "").slice(7)) || 20260904;
const VERBOSE = process.argv.includes("--verbose");
const DAYS = Math.round(YEARS * 365);

const B = new Map(BUILDINGS.map((b) => [b.id, b]));
const R = new Map(BATCH.map((r) => [r.id, r]));
const T = new Map(TECHS.map((t) => [t.id, t]));
const POWER = new Map(CONT.filter((c) => c.kind === "power").map((p) => [p.building, p]));
const NEEDS = CONT.find((c) => c.kind === "consumption");
const DATA_TYPES = ["physics", "engineering", "bio"];
const VITAL = Object.keys(NEEDS.perThousandPopPerDay);

const GROWTH_R = 0.00012;
const ENERGY_CAP = 260;
const EMPLOYMENT = PKG.population.employmentRate;

// ------------------------------------------------------------------ PRNG (детерминизм)

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
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

// ------------------------------------------------------------------ генерация среза галактики

const SYSTEM_COUNT =
  Number((process.argv.find((a) => a.startsWith("--systems=")) ?? "").slice(10)) || 7;
const BODY_TEMPLATES = [
  { type: "planet", features: ["habitable"], slotsRange: [12, 26], w: 0.9 },
  { type: "planet", features: ["ore_deposit", "silicate_deposit"], slotsRange: [8, 18], w: 2.0 },
  { type: "planet", features: ["ice_deposit"], slotsRange: [5, 12], w: 1.4 },
  { type: "planet", features: ["gas_giant_orbit"], slotsRange: [4, 10], w: 1.2 },
  { type: "asteroid", features: ["ore_deposit"], slotsRange: [6, 14], w: 1.0 }
];
const RARE = ["rare_earth_vein", "crystal_vein", "radioactive_vein"];

function makeSystem(id, name, isHome) {
  if (isHome) {
    return {
      id,
      name,
      bodies: PKG.homeSystem.bodies.map((b) => ({ ...b, used: 0, energy: 0, energyCap: 0 })),
      res: new Map(),
      colony: true,
      buildings: [],
      pop: PKG.population.start,
      construction: [],
      satEma: new Map(),
      capitalSpend: new Map()
    };
  }
  const bodies = [];
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    // взвешенный выбор шаблона: пригодные миры редки
    const total = BODY_TEMPLATES.reduce((a, t) => a + t.w, 0);
    let r = rng() * total,
      tpl = BODY_TEMPLATES[0];
    for (const t of BODY_TEMPLATES) {
      r -= t.w;
      if (r <= 0) {
        tpl = t;
        break;
      }
    }
    const features = [...tpl.features];
    // редкие жилы кучные: 20% тел их несут, и обычно только одну
    if (rng() < 0.2) features.push(pick(RARE));
    bodies.push({
      id: `${id}-${i}`,
      name: `${name}-${i + 1}`,
      type: tpl.type,
      slots: tpl.slotsRange[0] + Math.floor(rng() * (tpl.slotsRange[1] - tpl.slotsRange[0])),
      features,
      yield: 0.7 + rng() * 0.6,
      used: 0,
      energy: 0,
      energyCap: 0
    });
  }
  return {
    id,
    name,
    bodies,
    res: new Map(),
    colony: false,
    buildings: [],
    pop: 0,
    construction: [],
    satEma: new Map(),
    capitalSpend: new Map()
  };
}

const NAMES = [
  "Дом",
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
  "Фарос"
];
const systems = Array.from({ length: SYSTEM_COUNT }, (_, i) =>
  makeSystem(i, NAMES[i] ?? `Сис-${i}`, i === 0)
);

// сеть врат: кольцо гарантирует связность, плюс хорды до средней степени ~3
const gates = [];
const gateKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const gateSet = new Set();
function addGate(a, b) {
  if (a === b || gateSet.has(gateKey(a, b))) return;
  gateSet.add(gateKey(a, b));
  gates.push({ a, b, days: 3 + Math.floor(rng() * 5) });
}
for (let i = 0; i < SYSTEM_COUNT; i++) addGate(i, (i + 1) % SYSTEM_COUNT);
const targetEdges = Math.round(SYSTEM_COUNT * 1.5);
let guard = 0;
while (gates.length < targetEdges && guard++ < 200) {
  addGate(Math.floor(rng() * SYSTEM_COUNT), Math.floor(rng() * SYSTEM_COUNT));
}

const adj = systems.map(() => []);
for (const g of gates) {
  adj[g.a].push({ to: g.b, days: g.days });
  adj[g.b].push({ to: g.a, days: g.days });
}

// кратчайшие пути (Дейкстра на семи узлах — считается мгновенно)
const dist = systems.map(() => new Array(SYSTEM_COUNT).fill(Infinity));
const hops = systems.map(() => new Array(SYSTEM_COUNT).fill(Infinity));
for (let s = 0; s < SYSTEM_COUNT; s++) {
  dist[s][s] = 0;
  hops[s][s] = 0;
  const seen = new Set();
  while (seen.size < SYSTEM_COUNT) {
    let u = -1,
      best = Infinity;
    for (let i = 0; i < SYSTEM_COUNT; i++)
      if (!seen.has(i) && dist[s][i] < best) {
        best = dist[s][i];
        u = i;
      }
    if (u < 0) break;
    seen.add(u);
    for (const e of adj[u])
      if (dist[s][u] + e.days < dist[s][e.to]) {
        dist[s][e.to] = dist[s][u] + e.days;
        hops[s][e.to] = hops[s][u] + 1;
      }
  }
}

// ------------------------------------------------------------------ состояние фракции

const faction = {
  credits: PKG.treasury.credits,
  researched: new Set(PKG.technologies),
  data: { physics: 0, engineering: 0, bio: 0 },
  colonies: [0]
};
let UNLOCKED = new Set();
function refreshUnlocked() {
  UNLOCKED = new Set();
  for (const id of faction.researched) {
    for (const e of T.get(id)?.effects ?? []) if (e.type === "unlockBuilding") UNLOCKED.add(e.id);
  }
}
refreshUnlocked();

const home = systems[0];
for (const [k, v] of Object.entries(PKG.stockpiles)) if (RES.has(k)) home.res.set(k, v);

const get = (sys, id) => sys.res.get(id) ?? 0;
const add = (sys, id, q) => sys.res.set(id, Math.max(0, get(sys, id) + q));

function placeBuilding(sys, buildingId, bodyId) {
  const b = B.get(buildingId);
  const body = sys.bodies.find((x) => x.id === bodyId);
  if (!b || !body || body.used + b.slots > body.slots) return false;
  if (b.placement.requires && !body.features.includes(b.placement.requires)) return false;
  body.used += b.slots;
  if (POWER.has(buildingId)) body.energyCap += ENERGY_CAP;
  sys.buildings.push({
    bid: buildingId,
    body: bodyId,
    recipe: b.recipe,
    workers: b.recipe
      ? (R.get(b.recipe)?.workers ?? POWER.get(buildingId)?.workers ?? 0)
      : (b.workers ?? 0),
    busyUntil: -1,
    idleReason: ""
  });
  return true;
}
for (const s of PKG.buildings) placeBuilding(home, s.id, s.body);

// ------------------------------------------------------------------ корабли

let shipSeq = 0;
const ships = [];
function makeShip(role, at) {
  const profile =
    role === "hauler"
      ? { cargoCapacity: 1600, fuelCapacity: 220, fuelPerJump: 7 }
      : { cargoCapacity: 400, fuelCapacity: 320, fuelPerJump: 10 };
  ships.push({
    id: ++shipSeq,
    role,
    at,
    job: null,
    ...profile,
    fuel: 0,
    cargo: new Map(),
    departAt: -1,
    arriveAt: -1,
    dest: at,
    foundHere: false
  });
}
for (const s of PKG.ships) {
  const role = s.doctrine === "hauler" ? "hauler" : s.doctrine === "colonizer" ? "colonizer" : null;
  if (role) for (let i = 0; i < s.count; i++) makeShip(role, 0);
}
for (let i = 0; i < 4; i++) makeShip("hauler", 0); // стартовый торговый флот

// ------------------------------------------------------------------ теневые цены (решение №3)

function targetStock(sys, id) {
  const daily = demandRate(sys).get(id) ?? 0;
  return Math.max(40, daily * 60);
}
const demandCache = new Map();
function demandRate(sys) {
  const cached = demandCache.get(sys.id);
  if (cached && cached.day === state.day) return cached.map;
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
// Цена — вычисляемый сигнал дефицита, а не деньги (решение №4). Мало на складе — дорого.
function price(sys, id) {
  const base = VALUE.get(id) ?? 1;
  const ratio = get(sys, id) / targetStock(sys, id);
  const scarcity = Math.max(0.15, Math.min(4.0, 2.5 - 2 * ratio));
  return base * scarcity;
}

// ------------------------------------------------------------------ экономика колонии

function colonyTick(sys, d) {
  const prodEnergy = new Map();
  for (const b of sys.buildings) {
    const p = POWER.get(b.bid);
    if (!p) continue;
    const ok = Object.entries(p.inputsPerDay ?? {}).every(([id, q]) => get(sys, id) >= q);
    if (!ok) {
      b.idleReason = "нет топлива";
      continue;
    }
    for (const [id, q] of Object.entries(p.inputsPerDay ?? {})) add(sys, id, -q);
    prodEnergy.set(b.body, (prodEnergy.get(b.body) ?? 0) + p.outputPerDay.energy);
  }
  for (const body of sys.bodies)
    body.energy = Math.min(body.energyCap, body.energy + (prodEnergy.get(body.id) ?? 0));

  const sat = {};
  for (const [id, rate] of Object.entries(NEEDS.perThousandPopPerDay)) {
    const need = sys.pop * rate;
    const taken = Math.min(get(sys, id), need);
    add(sys, id, -taken);
    sat[id] = need > 0 ? taken / need : 1;
    const prev = sys.satEma.get(id) ?? 1;
    const ema = prev + (sat[id] - prev) / 30;
    sys.satEma.set(id, ema);
    if (ema < 0.75) state.starved.set(id, (state.starved.get(id) ?? 0) + 1);
  }

  const ema = Math.min(sys.satEma.get("food") ?? 1, sys.satEma.get("water") ?? 1);
  const growth = ema >= 0.98 ? 1 : ema >= 0.9 ? 0 : ema >= 0.6 ? -0.15 : -0.6;
  const housing = sys.buildings.filter((b) => b.bid === "housing").length;
  sys.popCap = 120 + housing * 90 + sys.buildings.length * 2;
  sys.pop = Math.max(0.5, sys.pop + GROWTH_R * sys.pop * (1 - sys.pop / sys.popCap) * growth);

  for (const b of sys.buildings) {
    if (b.busyUntil !== d) continue;
    const rec = R.get(b.recipe);
    const y = sys.bodies.find((x) => x.id === b.body)?.yield ?? 1;
    for (const [id, q] of Object.entries(rec.outputs)) add(sys, id, q * y);
    b.busyUntil = -1;
  }

  let workers = sys.pop * EMPLOYMENT;
  for (const b of sys.buildings) if (b.busyUntil > d) workers -= b.workers;
  for (const b of sys.buildings) {
    if (b.busyUntil >= d || !b.recipe || POWER.has(b.bid)) continue;
    const rec = R.get(b.recipe);
    if (!rec) continue;
    if (workers < b.workers) {
      b.idleReason = "нет рабочих";
      continue;
    }
    const body = sys.bodies.find((x) => x.id === b.body);
    const eNeed = rec.inputs.energy ?? 0;
    if (body.energy < eNeed) {
      b.idleReason = "нет энергии";
      continue;
    }
    const missing = Object.entries(rec.inputs).find(
      ([id, q]) => id !== "energy" && get(sys, id) < q
    );
    if (missing) {
      b.idleReason = `нет ${missing[0]}`;
      continue;
    }
    body.energy -= eNeed;
    for (const [id, q] of Object.entries(rec.inputs)) if (id !== "energy") add(sys, id, -q);
    workers -= b.workers;
    b.busyUntil = d + rec.durationDays;
    b.idleReason = "";
  }

  for (const c of sys.construction)
    if (c.doneAt === d) {
      placeBuilding(sys, c.bid, c.body);
      if (VERBOSE)
        state.events.push(`[${(d / 365).toFixed(1)}] ${sys.name}: построено ${B.get(c.bid).name}`);
    }
  sys.construction = sys.construction.filter((c) => c.doneAt > d);
  if (d % 30 === sys.id % 30) builderAI(sys, d);
}

// ------------------------------------------------------------------ строительный ИИ колонии

function tryBuild(sys, bid, why) {
  const b = B.get(bid);
  if (!b || !UNLOCKED.has(bid)) return false;
  const cost = b.buildCost ?? {};
  if (!Object.entries(cost).every(([id, q]) => get(sys, id) >= q)) return false;
  const cands = sys.bodies.filter((body) => {
    if (body.used + b.slots > body.slots) return false;
    if (b.placement.requires && !body.features.includes(b.placement.requires)) return false;
    if (b.recipe && !POWER.has(bid) && body.energyCap === 0) return false;
    return true;
  });
  if (!cands.length) return false;
  const target = cands.sort((x, z) => z.slots - z.used - (x.slots - x.used))[0];
  for (const [id, q] of Object.entries(cost)) {
    add(sys, id, -q);
    sys.capitalSpend.set(id, (sys.capitalSpend.get(id) ?? 0) + q);
  }
  sys.construction.push({ bid, body: target.id, doneAt: state.day + b.buildDays, why });
  return true;
}

function supplyRates(sys) {
  const prod = new Map(),
    cons = demandRate(sys);
  for (const b of sys.buildings) {
    const rec = R.get(b.recipe);
    if (!rec || POWER.has(b.bid)) continue;
    const y = sys.bodies.find((x) => x.id === b.body)?.yield ?? 1;
    for (const [id, q] of Object.entries(rec.outputs))
      prod.set(id, (prod.get(id) ?? 0) + (q * y) / rec.durationDays);
  }
  const days = Math.max(365, state.day);
  const c2 = new Map(cons);
  for (const [id, spent] of sys.capitalSpend) c2.set(id, (c2.get(id) ?? 0) + spent / days);

  // ФЛОТСКИЙ СПРОС. Корабли потребляют топливо, а верфи — корпуса и системные блоки, но
  // ни то, ни другое не является входом ни одного рецепта. Без явного учёта строительный
  // ИИ никогда не поставит ни топливный завод, ни верфь: по его модели спроса на них нет.
  // Это второе после капитального требование к настоящему MRP из решения №8.
  c2.set("fuel", (c2.get("fuel") ?? 0) + 2 + sys.pop * 0.012);
  if (sys.id === faction.colonies[0]) {
    c2.set("hull_frames", (c2.get("hull_frames") ?? 0) + 0.5);
    c2.set("thrusters", (c2.get("thrusters") ?? 0) + 0.4);
    c2.set("reactors", (c2.get("reactors") ?? 0) + 0.25);
    c2.set("life_support", (c2.get("life_support") ?? 0) + 0.25);
  }
  return { prod, cons: c2 };
}

function builderAI(sys, d) {
  if (sys.construction.length >= 2) return;

  const starved = sys.bodies.find(
    (body) =>
      sys.buildings.some((b) => b.body === body.id && b.idleReason === "нет энергии") ||
      (body.energyCap === 0 && sys.buildings.some((b) => b.body === body.id && b.recipe))
  );
  if (starved) {
    for (const gen of ["fusion_plant", "fission_plant", "solar_array"]) {
      const g = B.get(gen);
      if (!UNLOCKED.has(gen) || starved.used + g.slots > starved.slots) continue;
      if (!Object.entries(g.buildCost).every(([id, q]) => get(sys, id) >= q)) continue;
      for (const [id, q] of Object.entries(g.buildCost)) add(sys, id, -q);
      sys.construction.push({
        bid: gen,
        body: starved.id,
        doneAt: d + g.buildDays,
        why: "энергия"
      });
      return;
    }
  }

  const crunch =
    sys.buildings.filter((b) => b.idleReason === "нет рабочих").length > sys.buildings.length * 0.1;
  const vitalOk = Math.min(sys.satEma.get("food") ?? 0, sys.satEma.get("water") ?? 0) >= 0.85;
  if (crunch || (vitalOk && sys.pop > 0.85 * (sys.popCap ?? 120))) {
    if (tryBuild(sys, "housing", crunch ? "рабочие" : "потолок")) return;
    if (crunch) return;
  }

  const { prod, cons } = supplyRates(sys);
  const deficits = [];
  for (const [id, need] of cons) {
    if (need <= 0) continue;
    const days = get(sys, id) / need;
    if (days > 90) continue;
    const ratio = (prod.get(id) ?? 0) / need;
    if (ratio < 1.1) deficits.push({ id, ratio, days, vital: VITAL.includes(id) });
  }
  deficits.sort((a, b) => b.vital - a.vital || a.days - b.days || a.ratio - b.ratio);

  for (const def of deficits) {
    for (const rec of BATCH.filter((r) => r.outputs[def.id])) {
      const bld = BUILDINGS.find((x) => x.recipe === rec.id);
      if (bld && tryBuild(sys, bld.id, `дефицит ${def.id}`)) return;
    }
  }
  for (const bid of [
    "engineering_lab",
    "physics_lab",
    "bio_lab",
    "alloy_works",
    "electronics_plant"
  ]) {
    if (tryBuild(sys, bid, "развитие")) return;
  }
  if (deficits.length && !sys.saturatedAt) sys.saturatedAt = d;
}

// ------------------------------------------------------------------ логистика: доска задач

function refreshJobBoard() {
  state.jobs = [];
  const colonies = faction.colonies.map((i) => systems[i]);
  for (const res of RES.values()) {
    if (!res.transportable || res.phase !== 1) continue;
    for (const src of colonies) {
      const have = get(src, res.id);
      if (have < 60) continue;
      const pSrc = price(src, res.id);
      for (const dst of colonies) {
        if (src === dst) continue;
        const pDst = price(dst, res.id);
        if (pDst <= pSrc * 1.25) continue; // разница не покрывает дорогу
        const travel = dist[src.id][dst.id];
        const qty = Math.min(have * 0.4, 1600 / (res.unitVolume || 1));
        const gain = (pDst - pSrc) * qty;
        state.jobs.push({
          res: res.id,
          from: src.id,
          to: dst.id,
          qty,
          gain,
          score: gain / Math.max(1, travel)
        });
      }
    }
  }
  state.jobs.sort((a, b) => b.score - a.score);
  state.jobs = state.jobs.slice(0, 60);
}

function shipTick(d) {
  for (const sh of ships) {
    if (sh.arriveAt === d) {
      // прибытие
      sh.at = sh.dest;
      sh.arriveAt = -1;
      const sys = systems[sh.at];
      for (const [id, q] of sh.cargo) {
        add(sys, id, q);
        state.moved += q;
      }
      sh.cargo.clear();
      if (sh.role === "colonizer" && sh.foundHere) {
        foundColony(systems[sh.at], d);
        sh.foundHere = false;
      }
      sh.job = null;
    }
    if (sh.arriveAt > 0) continue; // в пути
    if (sh.role !== "hauler") continue;

    // Берём лучшую задачу с доски. Взял — снял (резервирование, решение №14):
    // без него два десятка транспортов летят за одним и тем же грузом.
    const at = systems[sh.at];
    let idx = state.jobs.findIndex((j) => j.from === sh.at);
    if (idx < 0) {
      // Работы здесь нет — идём порожняком туда, где её больше всего
      const j = state.jobs[0];
      if (!j || j.from === sh.at) continue;
      departShip(sh, at, j.from, d);
      continue;
    }
    const job = state.jobs.splice(idx, 1)[0];
    const res = RES.get(job.res);
    const capUnits = Math.floor(sh.cargoCapacity / (res.unitVolume || 1));
    const take = Math.min(job.qty, get(at, job.res), capUnits);
    if (take < 10) continue;
    add(at, job.res, -take);
    sh.cargo.set(job.res, take);
    if (!departShip(sh, at, job.to, d)) {
      add(at, job.res, take);
      sh.cargo.clear();
    }
  }
}

// Топливо у корабля в собственном баке. Списывается при вылете (решение №14), но берётся
// из бака, а не напрямую со склада порта. Без бака транспорт, доставивший груз в колонию
// без топлива, застревает там навсегда: решение №14 гарантирует, что корабль не зависнет
// в пустоте, но не то, что он сможет покинуть порт.
function refuel(sh, sys) {
  const room = sh.fuelCapacity - sh.fuel;
  if (room <= 0) return;
  const reserve = sys.pop > 1 ? 40 : 0; // колонии оставляем неснижаемый запас
  const avail = Math.max(0, get(sys, "fuel") - reserve);
  const take = Math.min(room, avail);
  if (take <= 0) return;
  add(sys, "fuel", -take);
  sh.fuel += take;
}

function departShip(sh, from, toId, d) {
  refuel(sh, from);
  const need = sh.fuelPerJump * Math.max(1, hops[from.id][toId]);
  if (sh.fuel < need) {
    state.fuelBlocked++;
    return false;
  }
  sh.fuel -= need;
  sh.dest = toId;
  sh.departAt = d;
  sh.arriveAt = d + Math.max(1, dist[from.id][toId]);
  state.trips++;
  return true;
}

// ------------------------------------------------------------------ колонизация

function colonyScore(sys) {
  let s = 0;
  for (const b of sys.bodies) {
    if (b.features.includes("habitable")) s += 40 * b.yield;
    for (const f of b.features) {
      if (RARE.includes(f)) s += 25 * b.yield;
      if (f === "ore_deposit") s += 6 * b.yield;
      if (f === "ice_deposit") s += 8 * b.yield;
      if (f === "gas_giant_orbit") s += 7 * b.yield;
    }
    s += b.slots * 0.6;
  }
  const nearest = Math.min(...faction.colonies.map((c) => dist[c][sys.id]));
  return s / (1 + nearest / 12);
}

function foundColony(sys, d) {
  if (sys.colony) return;
  sys.colony = true;
  sys.pop = 12;
  faction.colonies.push(sys.id);
  const seed = [
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
  ];
  for (const bid of seed) {
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
  })) {
    add(sys, id, q);
  }
  state.events.push(
    `[${(d / 365).toFixed(1)}] ОСНОВАНА КОЛОНИЯ: ${sys.name} (оценка ${colonyScore(sys).toFixed(0)})`
  );
}

function colonizationAI(d) {
  // Флот растёт вместе с объёмом торговли: если доска задач стабильно длиннее, чем есть
  // свободных транспортов, фракция закладывает новый. Иначе семь кораблей обслуживают
  // десяток колоний и торговля упирается не в цены, а в тоннаж.
  const idleHaulers = ships.filter((s) => s.role === "hauler" && s.arriveAt < 0).length;
  if (state.jobs.length > idleHaulers * 4 + 6) {
    const src = systems[faction.colonies[0]];
    if (get(src, "hull_frames") >= 3 && get(src, "thrusters") >= 2 && get(src, "reactors") >= 1) {
      add(src, "hull_frames", -3);
      add(src, "thrusters", -2);
      add(src, "reactors", -1);
      makeShip("hauler", src.id);
      state.builtHaulers++;
    }
  }

  const free = systems.filter((s) => !s.colony);
  if (!free.length) return;
  const idle = ships.find((s) => s.role === "colonizer" && s.arriveAt < 0);
  if (!idle) {
    // строим колонизатор, если есть чем: упрощённо — по стоимости корпуса и модуля
    const src = systems[faction.colonies[0]];
    if (get(src, "hull_frames") >= 6 && get(src, "life_support") >= 8 && faction.credits > 400) {
      add(src, "hull_frames", -6);
      add(src, "life_support", -8);
      faction.credits -= 400;
      makeShip("colonizer", src.id);
      state.events.push(`[${(d / 365).toFixed(1)}] заложен колониальный транспорт`);
    }
    return;
  }
  const target = free.map((s) => ({ s, v: colonyScore(s) })).sort((a, b) => b.v - a.v)[0];
  if (!target) return;
  idle.foundHere = true;
  departShip(idle, systems[idle.at], target.s.id, d);
}

// ------------------------------------------------------------------ исследования

function researchTick() {
  for (const dt of DATA_TYPES) {
    for (const c of faction.colonies) {
      const sys = systems[c];
      const q = get(sys, `data_${dt}`);
      if (q > 0) {
        faction.data[dt] += q;
        add(sys, `data_${dt}`, -q);
      }
    }
  }
  const avail = TECHS.filter(
    (t) =>
      !t.repeatable &&
      t.phase === 1 &&
      !faction.researched.has(t.id) &&
      (t.requires ?? []).every((x) => faction.researched.has(x))
  );
  const sum = (t) => Object.values(t.cost ?? {}).reduce((a, b) => a + b, 0);
  for (const t of avail.sort((a, b) => sum(a) - sum(b))) {
    if (DATA_TYPES.every((dt) => faction.data[dt] >= (t.cost?.[dt] ?? 0))) {
      for (const dt of DATA_TYPES) faction.data[dt] -= t.cost?.[dt] ?? 0;
      faction.researched.add(t.id);
      refreshUnlocked();
      break;
    }
  }
}

// ------------------------------------------------------------------ главный цикл

const state = {
  day: 0,
  jobs: [],
  events: [],
  starved: new Map(),
  moved: 0,
  trips: 0,
  fuelBlocked: 0,
  builtHaulers: 0,
  history: []
};

for (let i = 0; i < DAYS; i++) {
  for (const c of faction.colonies) colonyTick(systems[c], state.day);
  if (state.day % 10 === 0) refreshJobBoard();
  shipTick(state.day);
  researchTick(state.day);
  if (state.day % 365 === 0) colonizationAI(state.day);
  if (state.day % 365 === 0) {
    state.history.push({
      year: state.day / 365,
      pop: faction.colonies.reduce((a, c) => a + systems[c].pop, 0),
      colonies: faction.colonies.length,
      buildings: faction.colonies.reduce((a, c) => a + systems[c].buildings.length, 0),
      techs: faction.researched.size,
      ships: ships.length,
      moved: state.moved,
      spread: priceSpread()
    });
  }
  state.day++;
}

function priceSpread() {
  // средний разброс цен по колониям для жизненно важных ресурсов: если рынок работает,
  // разброс должен сужаться со временем
  let acc = 0,
    n = 0;
  for (const id of ["food", "water", "medicine", "metal", "alloys"]) {
    const ps = faction.colonies.map((c) => price(systems[c], id));
    if (ps.length < 2) continue;
    acc += (Math.max(...ps) - Math.min(...ps)) / Math.max(0.01, Math.min(...ps));
    n++;
  }
  return n ? acc / n : 0;
}

// ------------------------------------------------------------------ отчёт

const line = "─".repeat(100);
console.log(line);
console.log(`МНОГОСИСТЕМНЫЙ ПРОГОН — ${YEARS} лет, seed ${SEED}`);
console.log(line);
console.log(
  `Систем: ${SYSTEM_COUNT}, врат: ${gates.length} (средняя связность ${((2 * gates.length) / SYSTEM_COUNT).toFixed(1)})`
);
console.log("");
for (const s of systems) {
  const rare = new Set(s.bodies.flatMap((b) => b.features.filter((f) => RARE.includes(f))));
  console.log(
    `  ${s.name.padEnd(10)} тел ${String(s.bodies.length).padStart(2)}, слотов ${String(s.bodies.reduce((a, b) => a + b.slots, 0)).padStart(3)}` +
      `, пригодных ${s.bodies.filter((b) => b.features.includes("habitable")).length}` +
      `, редкие: ${rare.size ? [...rare].map((r) => r.replace("_vein", "")).join(", ") : "—"}` +
      `  расстояние от дома ${dist[0][s.id]} дн.`
  );
}
console.log("");

console.log(
  "год".padStart(5) +
    "население".padStart(12) +
    "колоний".padStart(9) +
    "зданий".padStart(8) +
    "технол.".padStart(9) +
    "кораблей".padStart(10) +
    "перевезено".padStart(12) +
    "разброс цен".padStart(13)
);
for (const h of state.history) {
  if (h.year % Math.max(1, Math.round(YEARS / 15)) !== 0 && h.year !== 1) continue;
  console.log(
    String(h.year).padStart(5) +
      h.pop.toFixed(0).padStart(12) +
      String(h.colonies).padStart(9) +
      String(h.buildings).padStart(8) +
      String(h.techs).padStart(9) +
      String(h.ships).padStart(10) +
      Math.round(h.moved).toLocaleString("ru-RU").padStart(12) +
      h.spread.toFixed(2).padStart(13)
  );
}
console.log("");

console.log(line);
console.log("ЛОГИСТИКА");
console.log(line);
console.log(`Рейсов выполнено:            ${state.trips.toLocaleString("ru-RU")}`);
console.log(`Единиц груза перевезено:     ${Math.round(state.moved).toLocaleString("ru-RU")}`);
console.log(`Вылетов сорвано без топлива: ${state.fuelBlocked.toLocaleString("ru-RU")}`);
console.log(
  `Транспортов в строю:         ${ships.filter((s) => s.role === "hauler").length} (построено за партию: ${state.builtHaulers})`
);
console.log("");

console.log(line);
console.log("ГОЛОД ПО ВСЕЙ ФРАКЦИИ (среднее за месяц ниже 0.75)");
console.log(line);
if (!state.starved.size) console.log("Голода не было ни в одной колонии.");
for (const id of VITAL) {
  const days = state.starved.get(id) ?? 0;
  console.log(
    `${id.padEnd(18)} ${String(days).padStart(7)} колонио-дней (${((days / DAYS) * 100).toFixed(1)}% от длины партии)`
  );
}
console.log("");

console.log(line);
console.log("КОЛОНИИ НА КОНЕЦ ПРОГОНА");
console.log(line);
for (const c of faction.colonies) {
  const s = systems[c];
  const slots = s.bodies.reduce((a, b) => a + b.slots, 0);
  const used = s.bodies.reduce((a, b) => a + b.used, 0);
  console.log(
    `${s.name.padEnd(10)} население ${s.pop.toFixed(0).padStart(5)}  зданий ${String(s.buildings.length).padStart(3)}` +
      `  слоты ${used}/${slots}  еда ${(s.satEma.get("food") ?? 1).toFixed(2)}  вода ${(s.satEma.get("water") ?? 1).toFixed(2)}` +
      (s.saturatedAt ? `  насыщена с ${(s.saturatedAt / 365).toFixed(0)} г.` : "")
  );
}
console.log("");

if (VERBOSE) {
  console.log(line);
  for (const e of state.events.slice(0, 60)) console.log("  " + e);
} else {
  console.log(line);
  console.log("СОБЫТИЯ КОЛОНИЗАЦИИ");
  console.log(line);
  for (const e of state.events.filter((x) => x.includes("КОЛОНИЯ") || x.includes("транспорт")))
    console.log("  " + e);
}
console.log(line);
