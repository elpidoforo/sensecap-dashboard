'use strict';
/* Forecast against reality (the page #/forecast), mounted at GET /api/toolkit/forecast.
 *
 * Once a day the server asks the weather model (Open-Meteo, the same service as the weather layer) what it expects for TOMORROW in
 * each of the four cities and saves the answer. Later two things are written next to that saved forecast:
 *   - "station": what the nearest official Met Office station measured on that day, read from the history this site keeps
 *     (metoffice.js HistoryStore). Only a full day counts (see FULL_HOURS); a thin day stays empty, it is never filled in.
 *   - "model":   what the same model says about that day once it is over (its own later look at the day). This is NOT a measurement.
 * The page compares the saved forecast with both. Nothing is ever changed afterwards: a forecast is written once and kept.
 *
 * The file: <DATA_DIR>/toolkit-forecast.json, at most KEEP_DAYS days, written to a .tmp file and renamed (as layers.js does for its pulse log).
 *   { since: ms, days: { "2026-11-12": { larnaka: { f: {...}, a: {...}, s: {...} }, ... } } }
 *   f (forecast)  { at, tmax, tmin, wind, sim? }          wind: the day's highest hourly wind at 10 m, m/s
 *   a (model)     { at, tmax, tmin, wind, sim? }
 *   s (station)   { at, id, name, km, tmax, tmin, wind, n, hours }   wind: the day's highest 10-minute wind at 10 m, m/s, or null
 * Days are calendar days in Cyprus time. With OPEN_METEO_MOCK=1 nothing is fetched: the numbers are made up by a fixed rule and
 * marked sim: true, and the page labels them as simulated.
 *
 * createToolkitForecast({ root, dataDir, mock, omJson, omBase, enabled, cydom, history, log, timers })
 *   -> { handle(req, res, url), tick(now), view(), _t }
 * Privacy: city-level and station-level numbers only. No vehicle, no person.
 */
const fs = require('fs');
const path = require('path');

const HOUR = 3600000, DAY = 86400000;
const KEEP_DAYS = 120;        // how many days of forecasts are kept
const LOOK_BACK = 7;          // a day older than this that still has no station outcome stays without one
const FULL_HOURS = 20;        // a "full day" at a station: readings in at least this many of the 24 hours
const MAX_KM = 45;            // the station must be this close to the city centre (the same limit the master brain uses)
const TZ = 'Asia/Nicosia';

const r1 = (v) => Math.round(v * 10) / 10;
const fin = (v) => typeof v === 'number' && isFinite(v);
const fmtDay = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayKey = (ms) => fmtDay.format(new Date(ms));
const isDay = (s) => /^\d{4}-\d\d-\d\d$/.test(String(s)) && isFinite(Date.parse(s + 'T00:00:00Z'));
const addDays = (key, n) => new Date(Date.parse(key + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
// the moment (ms) a Cyprus calendar day starts
function dayStart(key) {
  const guess = Date.parse(key + 'T00:00:00Z');
  const off = (t) => Date.parse(fmtFull.format(new Date(t)).replace(' ', 'T') + 'Z') - t;   // how far Cyprus time is ahead of UTC at t
  let t = guess - off(guess);
  t = guess - off(t);   // once more, for the two days a year the clock changes
  return t;
}
function km(aLat, aLng, bLat, bLng) {
  const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
const cleanVals = (o) => (o && typeof o === 'object' && fin(o.tmax) && fin(o.tmin) && o.tmax >= o.tmin && o.tmax < 60 && o.tmin > -30 ? o : null);

// What is known about the errors of one city: only days that have both a saved forecast and an outcome. All the sums are done here.
function errorsOf(rows, against) {
  const out = { n: 0, tmax: null, tmin: null, wind: null };
  const one = (pick) => {
    const d = rows.map((r) => (r.f && r[against] && fin(pick(r.f)) && fin(pick(r[against])) ? pick(r.f) - pick(r[against]) : null)).filter((x) => x != null);
    if (!d.length) return null;
    return { n: d.length, mean_abs: r1(d.reduce((a, x) => a + Math.abs(x), 0) / d.length), bias: r1(d.reduce((a, x) => a + x, 0) / d.length), worst: r1(d.reduce((a, x) => (Math.abs(x) > Math.abs(a) ? x : a), 0)) };
  };
  out.tmax = one((x) => x.tmax); out.tmin = one((x) => x.tmin); out.wind = one((x) => x.wind);
  out.n = out.tmax ? out.tmax.n : 0;
  return out;
}

function createToolkitForecast(opts = {}) {
  const { root = __dirname, dataDir, mock = false, omJson, omBase = 'https://api.open-meteo.com', enabled = () => true, cydom, history = () => null, log = () => {} } = opts;
  const file = dataDir ? path.join(dataDir, 'toolkit-forecast.json') : null;
  let places = {};
  try { places = JSON.parse(fs.readFileSync(path.join(root, 'vocab', 'places.json'), 'utf8')); } catch (e) { log('Forecast log: the list of cities could not be read: ' + e.message); }
  const cityIds = Object.keys(places).filter((k) => k[0] !== '_' && fin(places[k].lat) && fin(places[k].lng));

  const store = { since: null, days: {} };
  let state = { lastTry: 0, lastOk: null, error: null, busy: null };
  try {
    const saved = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (saved && typeof saved === 'object') {
      if (fin(saved.since)) store.since = saved.since;
      for (const [day, rec] of Object.entries(saved.days || {})) {
        if (!isDay(day) || !rec || typeof rec !== 'object') continue;
        const cleanDay = {};
        for (const c of cityIds) {
          const x = rec[c];
          if (!x || typeof x !== 'object') continue;
          const one = {};
          if (cleanVals(x.f)) one.f = x.f;
          if (cleanVals(x.a)) one.a = x.a;
          if (cleanVals(x.s)) one.s = x.s;
          if (one.f || one.a || one.s) cleanDay[c] = one;
        }
        if (Object.keys(cleanDay).length) store.days[day] = cleanDay;
      }
    }
  } catch (e) { /* no file yet */ }

  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify({ at: Date.now(), since: store.since, days: store.days }));
      fs.renameSync(file + '.tmp', file);
    } catch (e) { log('Forecast log: could not be saved: ' + String(e && e.message).slice(0, 120)); }
  }
  function prune(today) {
    const cut = addDays(today, -KEEP_DAYS);
    for (const d of Object.keys(store.days)) if (d < cut) delete store.days[d];
  }
  const slot = (day, city) => { store.days[day] = store.days[day] || {}; store.days[day][city] = store.days[day][city] || {}; return store.days[day][city]; };

  // Test mode: numbers from a fixed rule (the same day and city always give the same number), never fetched.
  function mockDaily(keys) {
    return cityIds.map((c, ci) => ({
      daily: {
        time: keys,
        temperature_2m_max: keys.map((k) => { const n = Date.parse(k + 'T00:00:00Z') / DAY; return r1(24 + 3 * Math.sin(n / 3 + ci) + ci * 0.6); }),
        temperature_2m_min: keys.map((k) => { const n = Date.parse(k + 'T00:00:00Z') / DAY; return r1(14 + 2 * Math.sin(n / 4 + ci) + ci * 0.4); }),
        wind_speed_10m_max: keys.map((k) => { const n = Date.parse(k + 'T00:00:00Z') / DAY; return r1(4 + 2 * Math.abs(Math.sin(n / 2 + ci))); }),
      },
    }));
  }

  // One request for the four cities: yesterday (the model's later look), today, tomorrow (the forecast we keep).
  async function fetchModel(now) {
    const today = dayKey(now), yesterday = addDays(today, -1), tomorrow = addDays(today, 1);
    let list;
    if (mock) list = mockDaily([yesterday, today, tomorrow]);
    else {
      if (typeof omJson !== 'function') throw new Error('no weather service is connected');
      const j = await omJson(
        omBase + '/v1/forecast?latitude=' + cityIds.map((c) => places[c].lat).join(',') + '&longitude=' + cityIds.map((c) => places[c].lng).join(',') +
        '&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FNicosia&past_days=1&forecast_days=2',
        cityIds.length
      );
      list = Array.isArray(j) ? j : [j];
    }
    let wrote = 0;
    cityIds.forEach((c, i) => {
      const d = list[i] && list[i].daily;
      if (!d || !Array.isArray(d.time)) return;
      const at = (key) => {
        const k = d.time.indexOf(key);
        if (k < 0) return null;
        const v = { at: now, tmax: Number((d.temperature_2m_max || [])[k]), tmin: Number((d.temperature_2m_min || [])[k]), wind: Number((d.wind_speed_10m_max || [])[k]) };
        if ((d.temperature_2m_max || [])[k] == null || (d.temperature_2m_min || [])[k] == null) return null;
        if (!fin(v.wind) || (d.wind_speed_10m_max || [])[k] == null) v.wind = null;
        if (mock) v.sim = true;
        return cleanVals(v);
      };
      const f = at(tomorrow), a = at(yesterday);
      if (f && !slot(tomorrow, c).f) { slot(tomorrow, c).f = f; wrote++; }                      // a forecast is written once, never replaced
      if (a && store.days[yesterday] && store.days[yesterday][c] && store.days[yesterday][c].f && !store.days[yesterday][c].a) { store.days[yesterday][c].a = a; wrote++; }
    });
    for (const d of Object.keys(store.days)) for (const c of Object.keys(store.days[d])) if (!Object.keys(store.days[d][c]).length) delete store.days[d][c];
    for (const d of Object.keys(store.days)) if (!Object.keys(store.days[d]).length) delete store.days[d];
    return wrote;
  }

  // What the nearest official station measured on one finished day, for every city that has a saved forecast for it.
  async function stationOutcome(day, now) {
    const h = history();
    if (!h || typeof h.each !== 'function' || typeof cydom !== 'function') return 0;
    const need = cityIds.filter((c) => store.days[day] && store.days[day][c] && store.days[day][c].f && !store.days[day][c].s);
    if (!need.length) return 0;
    let stations;
    try { stations = ((await cydom()) || {}).points || []; } catch (e) { return 0; }   // the station list is not there right now: try again at the next round
    stations = stations.filter((p) => p && p.id && fin(Number(p.lat)) && fin(Number(p.lng)));
    if (!stations.length) return 0;
    const from = dayStart(day), to = dayStart(addDays(day, 1)) - 1;
    const by = new Map();   // station -> { n, hours:Set, tmax, tmin, wind }
    const windUnit = String((((h.units || {}).ws10) || {}).unit || '').toLowerCase();
    const windK = /^m\/s$|^ms$|^m s-1$/.test(windUnit) ? 1 : /^kn|knot/.test(windUnit) ? 0.5144 : null;   // an unknown unit is not guessed: the wind is left out
    h.each(from, to, null, (r) => {
      const t = r.v && r.v.temp;
      if (!fin(t) || t < -30 || t > 60) return;
      let b = by.get(r.s);
      if (!b) { b = { n: 0, hours: new Set(), tmax: -Infinity, tmin: Infinity, wind: null }; by.set(r.s, b); }
      b.n++; b.hours.add(Math.floor((r.t - from) / HOUR));
      if (t > b.tmax) b.tmax = t;
      if (t < b.tmin) b.tmin = t;
      const w = r.v.ws10;
      if (windK != null && fin(w) && w >= 0 && w < 150) b.wind = Math.max(b.wind == null ? 0 : b.wind, w * windK);
    });
    let wrote = 0;
    for (const c of need) {
      const here = places[c];
      const near = stations.map((p) => ({ p, d: km(here.lat, here.lng, Number(p.lat), Number(p.lng)) })).filter((x) => x.d <= MAX_KM && by.has(x.p.id) && by.get(x.p.id).hours.size >= FULL_HOURS).sort((a, b) => a.d - b.d)[0];
      if (!near) continue;
      const b = by.get(near.p.id);
      store.days[day][c].s = { at: now, id: String(near.p.id).slice(0, 40), name: String(near.p.name || near.p.id).slice(0, 60), km: r1(near.d), tmax: r1(b.tmax), tmin: r1(b.tmin), wind: b.wind == null ? null : r1(b.wind), n: b.n, hours: b.hours.size };
      wrote++;
    }
    return wrote;
  }

  async function tick(now = Date.now()) {
    if (state.busy) return state.busy;
    state.busy = (async () => {
      if (!cityIds.length) return 0;
      const today = dayKey(now), yesterday = addDays(today, -1), tomorrow = addDays(today, 1);
      let wrote = 0;
      const haveF = cityIds.every((c) => store.days[tomorrow] && store.days[tomorrow][c] && store.days[tomorrow][c].f);
      const needA = cityIds.some((c) => store.days[yesterday] && store.days[yesterday][c] && store.days[yesterday][c].f && !store.days[yesterday][c].a);
      if ((!haveF || needA) && (mock || enabled()) && now - state.lastTry >= HOUR - 60000) {
        state.lastTry = now;
        try { wrote += await fetchModel(now); state.lastOk = now; state.error = null; }
        catch (e) { state.error = 'the weather model did not answer'; log('Forecast log: ' + String(e && e.message).slice(0, 160)); }
      }
      for (let i = 1; i <= LOOK_BACK; i++) {
        try { wrote += await stationOutcome(addDays(today, -i), now); } catch (e) { log('Forecast log: station outcome failed: ' + String(e && e.message).slice(0, 160)); }
      }
      if (wrote) {
        if (store.since == null) store.since = now;
        prune(today);
        save();
      }
      return wrote;
    })().finally(() => { state.busy = null; });
    return state.busy;
  }

  function view(now = Date.now()) {
    const today = dayKey(now);
    const days = Object.keys(store.days).sort();
    const cities = {};
    let pairs = 0, waiting = 0;
    for (const c of cityIds) {
      const rows = days.map((d) => ({ day: d, ...(store.days[d][c] || {}) })).filter((r) => r.f || r.a || r.s)
        .map((r) => ({ day: r.day, done: r.day < today, f: r.f ? { at: r.f.at, tmax: r.f.tmax, tmin: r.f.tmin, wind: r.f.wind == null ? null : r.f.wind, sim: !!r.f.sim } : null,
          a: r.a ? { at: r.a.at, tmax: r.a.tmax, tmin: r.a.tmin, wind: r.a.wind == null ? null : r.a.wind, sim: !!r.a.sim } : null,
          s: r.s ? { at: r.s.at, id: r.s.id, name: r.s.name, km: r.s.km, tmax: r.s.tmax, tmin: r.s.tmin, wind: r.s.wind == null ? null : r.s.wind, n: r.s.n, hours: r.s.hours, sim: !!r.s.sim } : null }));
      const full = rows.filter((r) => r.f && (r.s || r.a));
      pairs += full.length;
      waiting += rows.filter((r) => r.f && !r.s && !r.a).length;
      cities[c] = { name: places[c].name, rows, pairs: full.length, station: errorsOf(rows, 's'), model: errorsOf(rows, 'a') };
    }
    const sim = mock || Object.values(cities).some((c) => c.rows.some((r) => (r.f && r.f.sim) || (r.a && r.a.sim) || (r.s && r.s.sim)));
    return {
      at: now, today, since: store.since, firstDay: days[0] || null, lastDay: days[days.length - 1] || null, keepDays: KEEP_DAYS, fullHours: FULL_HOURS, maxKm: MAX_KM,
      simulated: sim, on: mock || !!enabled(), lastOk: state.lastOk, error: state.error, pairs, waiting, cities,
      units: { temperature: '°C', wind: 'm/s' },
      source: { forecast: 'Open-Meteo weather model (openmeteo-weather)', station: 'Cyprus Department of Meteorology stations (cydom-stations), from the history this site keeps', model: 'Open-Meteo weather model, read again after the day' },
    };
  }

  async function handle(req, res, url) {
    if (url.pathname !== '/api/toolkit/forecast') return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'GET' }); res.end(JSON.stringify({ error: 'Read only.' })); return true; }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(view()));
    return true;
  }

  if (opts.timers !== false) {
    const firstMs = Math.max(200, Math.floor(Number(process.env.TOOLKIT_FORECAST_FIRST_MS)) || 45000);
    const first = setTimeout(() => tick().catch(() => { /* the next round tries again */ }), firstMs);
    const every = setInterval(() => tick().catch(() => { /* the next round tries again */ }), HOUR);
    if (first.unref) first.unref();
    if (every.unref) every.unref();
  }

  return { handle, tick, view, _t: { store, state: () => state, dayKey, dayStart, addDays, errorsOf, km, stationOutcome, fetchModel, file } };
}

module.exports = { createToolkitForecast, errorsOf, dayStart, dayKey, addDays };
