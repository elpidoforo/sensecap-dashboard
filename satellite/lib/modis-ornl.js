'use strict';
/* satellite/lib/modis-ornl.js: the shared part of the two NASA land feeds (satellite/feeds/modis-lst.js, modis-ndvi.js).
 *
 * What it talks to: the RESTful "MODIS and VIIRS Land Product Subsets" web service of the ORNL DAAC (TESViS), keyless.
 *   base      https://modis.ornl.gov/rst/api/v1
 *   dates     GET /{product}/dates?latitude=..&longitude=..                       the composite dates that exist for that place
 *   subset    GET /{product}/subset?latitude=..&longitude=..&startDate=AYYYYDDD&endDate=AYYYYDDD&kmAboveBelow=1&kmLeftRight=1
 *             (no band = all bands; at most 10 dates per call; km values are whole numbers, at most 100)
 * Written from the provider's documentation (https://modis.ornl.gov/data/modis_webservice.html, read 2026-11-12). The sandbox that
 * wrote this code cannot reach the service, so the call shapes and the answer shape below are UNVERIFIED against the live service.
 * The parser is deliberately tolerant (field names that the documentation and the community client MODISTools spell differently
 * are all accepted) and a surprise gives ONE clear log line, never a crash. See the report of the "sat-land" package.
 *
 * What is here (all pure functions except createClient and createRefresher):
 *   dates      parseModisDate, parseDates, period, periodText, codeOfMs
 *   answers    parseSubset, windowOf (centre pixel and the 3 x 3 block around it), bandKey
 *   quality    lstQa (QC_Day / QC_Night byte of MOD11A2/MYD11A2), viQa (VI Quality word of MOD13Q1/MYD13Q1/VNP13A1)
 *   network    createClient (polite: one call at a time, a pause between calls), createRefresher (schedule, cache on disk, backoff)
 *   words      fmtNum (decimal point or Greek decimal comma), hhmm
 */

const fs = require('fs');
const path = require('path');

const HOST = 'modis.ornl.gov';
const BASE = 'https://' + HOST + '/rst/api/v1';
const DAY = 86400000, HOUR = 3600000;
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
};

const num = (v) => (v == null || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const posInt = (v) => { const n = num(v); return n != null && Number.isInteger(n) && n > 0 && n < 10000 ? n : null; };
const short = (e, n) => String((e && e.message) || e || 'unknown error').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 140);

/* ---------- dates ---------- */

// "A2026297" -> { code, year, doy, ms (that day, 00:00 UTC) }; null when it is not a MODIS date.
function parseModisDate(s) {
  const m = /^A(\d{4})(\d{3})$/.exec(String(s == null ? '' : s).trim());
  if (!m) return null;
  const year = Number(m[1]), doy = Number(m[2]);
  if (year < 2000 || year > 2100 || doy < 1 || doy > 366) return null;
  const ms = Date.UTC(year, 0, 1) + (doy - 1) * DAY;
  if (new Date(ms).getUTCFullYear() !== year) return null;   // day 366 of a normal year is not a date
  return { code: 'A' + m[1] + m[2], year, doy, ms };
}
function codeOfMs(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  const doy = Math.round((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / DAY) + 1;
  return 'A' + y + String(doy).padStart(3, '0');
}
function fromIsoDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s == null ? '' : s));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? parseModisDate(codeOfMs(ms)) : null;
}
const dateOf = (modisDate, calendarDate) => parseModisDate(modisDate) || fromIsoDay(calendarDate);

// The answer of /dates: { dates: [ { modis_date, calendar_date } ] } (a bare array and plain strings are accepted too). Oldest first.
function parseDates(json) {
  const list = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray(json.dates) ? json.dates : null;
  if (!list) return null;
  const out = new Map();
  for (const e of list) {
    const d = typeof e === 'string' ? parseModisDate(e) : e && typeof e === 'object' ? dateOf(e.modis_date || e.modisDate, e.calendar_date || e.calendarDate) : null;
    if (d) out.set(d.code, d);
  }
  return [...out.values()].sort((a, b) => a.ms - b.ms);
}

// A composite stands for a period: it starts on the date in its name and lasts `days` days (the last one of a year is shorter).
function period(startMs, days) {
  const y = new Date(startMs).getUTCFullYear();
  const endMs = Math.min(startMs + days * DAY, Date.UTC(y + 1, 0, 1));
  return { startMs, endMs, midMs: Math.round((startMs + endMs) / 2), days: Math.round((endMs - startMs) / DAY) };
}
function periodText(p, el) {
  const a = new Date(p.startMs), b = new Date(p.endMs - DAY), M = MONTHS[el ? 'el' : 'en'];
  const da = a.getUTCDate(), db = b.getUTCDate(), ma = a.getUTCMonth(), mb = b.getUTCMonth(), ya = a.getUTCFullYear(), yb = b.getUTCFullYear();
  if (ya !== yb) return `${da} ${M[ma]} ${ya} - ${db} ${M[mb]} ${yb}`;
  if (ma !== mb) return `${da} ${M[ma]} - ${db} ${M[mb]} ${yb}`;
  return `${da}-${db} ${M[ma]} ${yb}`;
}

/* ---------- words ---------- */

// 47.2 -> "47.2" (always `dec` decimals), or "47,2" for Greek, which writes a decimal comma.
function fmtNum(v, dec, el) {
  const s = (Math.round(v * 10 ** dec) / 10 ** dec).toFixed(dec);
  return el ? s.replace('.', ',') : s;
}
// hours as a number (13.6) -> "13:36"
function hhmm(h) {
  if (!Number.isFinite(h) || h < 0 || h >= 24) return null;
  const total = Math.round(h * 60), hh = Math.floor(total / 60) % 24, mm = total % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
// Several sentences, most important first, joined until the text would pass `max` characters.
function fit(parts, max) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    const next = out ? out + ' ' + p : p;
    if (next.length > max) { if (!out) return p.slice(0, max); continue; }
    out = next;
  }
  return out;
}

/* ---------- the answer of /subset ---------- */

// "LST_Day_1km" -> "lstday1km", "250m_16_days_NDVI" -> "250m16daysndvi": the band names are matched without punctuation or case.
const bandKey = (name) => String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
const MAX_PIXELS = 5000;

/* The answer: { nrows, ncols, cellsize, subset: [ { band, data: [...], modis_date, calendar_date, proc_date, tile|title, scale, units } ] }.
   Each item is ONE band on ONE date. The documentation names the date field modis_date ("A2018049"); the community client also shows
   calendar_date ("2018-02-18"); both are accepted. Returns { nrows, ncols, cellsize, items: [ { band, key, date, data, scale, units } ] }
   or null when the answer does not look like a subset at all. data is a flat list, one row after the other. */
function parseSubset(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.subset)) return null;
  const items = [];
  for (const it of json.subset) {
    if (!it || typeof it !== 'object' || !Array.isArray(it.data) || !it.data.length || it.data.length > MAX_PIXELS) continue;
    const band = String(it.band == null ? '' : it.band).slice(0, 80);
    const date = dateOf(it.modis_date || it.modisDate, it.calendar_date || it.calendarDate);
    if (!band || !date) continue;
    items.push({ band, key: bandKey(band), date, data: it.data.map(num), scale: num(it.scale), units: it.units == null ? null : String(it.units).slice(0, 40) });
  }
  return { nrows: posInt(json.nrows), ncols: posInt(json.ncols), cellsize: num(json.cellsize), items };
}

/* The service centres the grid on the pixel that holds the requested point, so a grid with an odd number of rows and columns has the
   city centre in its middle cell. Returns the index of that cell and of the 3 x 3 block around it (fewer cells at an edge), or null
   when the shape is not understood (not odd, not as long as the data). For a square odd grid the answer does not depend on whether
   the service lists rows or columns first. */
function windowOf(len, nrows, ncols) {
  let r = posInt(nrows), c = posInt(ncols);
  if (!r || !c) { const s = Math.round(Math.sqrt(len)); if (s * s === len) { r = s; c = s; } }
  if (!r || !c || r * c !== len || r % 2 === 0 || c % 2 === 0) return null;
  const cr = (r - 1) / 2, cc = (c - 1) / 2, block = [];
  for (let i = Math.max(0, cr - 1); i <= Math.min(r - 1, cr + 1); i++) for (let j = Math.max(0, cc - 1); j <= Math.min(c - 1, cc + 1); j++) block.push(i * c + j);
  return { rows: r, cols: c, centre: cr * c + cc, block };
}

/* ---------- quality flags ---------- */

/* QC_Day / QC_Night of MOD11A2 and MYD11A2 (uint8). From the LP DAAC file specification (read 2026-11-12):
     bits 0-1  mandatory QA: 0 LST produced, good quality | 1 produced, other quality | 2 not produced because of cloud | 3 not produced for another reason
     bits 2-3  data quality flag (0 good, 1 other quality)
     bits 4-5  emissivity error: 0 <= 0.01, 1 <= 0.02, 2 <= 0.04, 3 > 0.04
     bits 6-7  LST error: 0 <= 1 K, 1 <= 2 K, 2 <= 3 K, 3 > 3 K
   We use a pixel when it was produced (0 or 1) and its LST error class is at most 3 K. "good" = produced with good quality and <= 2 K. */
function lstQa(qc) {
  const q = num(qc);
  if (q == null || !Number.isInteger(q) || q < 0 || q > 255) return null;
  const mandatory = q & 3, err = (q >> 6) & 3;
  return { mandatory, dataQuality: (q >> 2) & 3, emissivityError: (q >> 4) & 3, lstError: err, usable: mandatory <= 1 && err <= 2, good: mandatory === 0 && err <= 1, cloud: mandatory === 2 };
}

/* "VI Quality" of MOD13Q1, MYD13Q1 and VNP13A1 (uint16, the same layout in the three; LP DAAC file specifications, read 2026-11-12):
     bits 0-1   MODLAND QA: 0 good | 1 produced, check other QA | 2 produced but most probably cloudy | 3 not produced
     bits 2-5   VI usefulness: 0 highest ... 12 lowest, 13 so low it is not useful, 14 L1B data faulty, 15 not useful / not processed
     bits 6-7   aerosol quantity (0 climatology, 1 low, 2 average or intermediate, 3 high)
     bit 8      adjacent cloud detected      bit 9  atmosphere BRDF correction    bit 10  mixed clouds
     bits 11-13 land/water flag (the two products code it differently, so it is not used)
     bit 14     possible snow/ice            bit 15 possible shadow
   65535 is the fill value. A signed reading (-32768 to -1) is folded back to unsigned. A pixel is refused when MODLAND QA is 2 or 3,
   usefulness is 13 or more, or one of mixed clouds, snow/ice or shadow is set. */
function viQa(word) {
  let w = num(word);
  if (w == null || !Number.isInteger(w)) return null;
  if (w < 0 && w >= -32768) w += 65536;
  if (w < 0 || w >= 65535) return null;
  const modland = w & 3, useful = (w >> 2) & 15, adjacentCloud = (w >> 8) & 1, mixedClouds = (w >> 10) & 1, snow = (w >> 14) & 1, shadow = (w >> 15) & 1;
  const bad = modland >= 2 || useful >= 13 || mixedClouds === 1 || snow === 1 || shadow === 1;
  return { modland, useful, aerosol: (w >> 6) & 3, adjacentCloud, mixedClouds, snow, shadow, bad, good: !bad && modland === 0 && adjacentCloud === 0 };
}

/* ---------- the network, politely ---------- */

function createClient(ctx, opts) {
  const o = opts || {};
  const gapMs = o.gapMs == null ? 1500 : o.gapMs;
  let last = 0, closed = false, wake = null;
  const sleep = (ms) => new Promise((resolve) => {
    if (ms <= 0 || closed) return resolve();
    const t = setTimeout(() => { wake = null; resolve(); }, ms);
    if (t.unref) t.unref();
    wake = () => { clearTimeout(t); wake = null; resolve(); };
  });
  async function call(rest) {
    if (closed) throw new Error('stopped');
    await sleep(last + gapMs - Date.now());
    if (closed) throw new Error('stopped');
    last = Date.now();
    return ctx.get(BASE + rest, { as: 'json', timeoutMs: 20000, maxBytes: 4 * 1024 * 1024, headers: { accept: 'application/json' } });
  }
  const pt = (lat, lng) => `latitude=${Number(lat).toFixed(4)}&longitude=${Number(lng).toFixed(4)}`;
  const product = (p) => { if (!/^[A-Z0-9]{5,12}$/.test(String(p))) throw new Error('bad product name'); return String(p); };
  return {
    dates: (p, lat, lng) => call(`/${product(p)}/dates?${pt(lat, lng)}`),
    // km: the service takes whole kilometres; 1 gives 3 x 3 pixels at 1 km and 9 x 9 at 250 m
    subset: (p, lat, lng, startCode, endCode, km) => call(`/${product(p)}/subset?${pt(lat, lng)}&startDate=${startCode}&endDate=${endCode}&kmAboveBelow=${km}&kmLeftRight=${km}`),
    close() { closed = true; if (wake) wake(); },
    reopen() { closed = false; },
  };
}

/* The refresher: keeps `state` (what the service said, already decoded) in memory and in ctx.dir/state.json.
 *   spec = {
 *     products: ['MYD11A2', ...]   asked in this order
 *     history: 3                   how many of the newest composites are kept for every city
 *     km: 1, gapMs, startDelayMs, everyMs, retryMs: [...]
 *     summarise(product, items, grid) -> a plain object (what we keep for that city and date). May throw an Error with a plain message
 *                                        when the answer is not what was expected: that is logged once and the date is asked again later
 *   }
 * Returns { start, stop, refresh, entries(product, cityId), status, state }. Nothing here throws to the caller. */
function createRefresher(ctx, spec) {
  const cityIds = Object.keys(ctx.places || {}).filter((k) => k[0] !== '_');
  const file = path.join(ctx.dir, 'state.json');
  const client = createClient(ctx, { gapMs: spec.gapMs });
  const history = spec.history || 3;
  const everyMs = spec.everyMs || 12 * HOUR;
  const retryMs = spec.retryMs || [HOUR, 2 * HOUR, 4 * HOUR, 6 * HOUR];
  let timer = null, running = null, closed = false, failedRounds = 0, pauseUntil = 0, attempted = false;

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (j && j.v === 1 && j.products && typeof j.products === 'object') return j;
    } catch (e) { /* no cache yet, or it cannot be read: start empty */ }
    return { v: 1, products: {} };
  }
  const state = load();
  let saveWarned = false;
  function save() {
    try {
      state.savedAt = ctx.now();
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, file);
    } catch (e) { if (!saveWarned) { saveWarned = true; ctx.log('could not save the cache (' + short(e, 80) + ')'); } }
  }

  // The kept answers for one product and city, newest composite first: [ { code, ms, at, s } ]
  function entries(product, cityId) {
    const city = state.products[product] && state.products[product].cities && state.products[product].cities[cityId];
    if (!city) return [];
    return Object.keys(city).map((code) => ({ code, ms: (parseModisDate(code) || {}).ms, at: city[code].at, s: city[code].s })).filter((e) => e.ms).sort((a, b) => b.ms - a.ms);
  }

  async function refresh() {
    if (running) return running;
    running = (async () => {
      attempted = true;
      let ok = 0, bad = 0;
      const problems = [];
      const note = (e) => { if (closed) return; const t = short(e); if (!problems.includes(t)) problems.push(t); if (e && e.retryAfterSec) pauseUntil = Math.max(pauseUntil, ctx.now() + Math.min(6 * HOUR, Math.max(5 * 60000, e.retryAfterSec * 1000))); };
      client.reopen();
      try {
        const ref = ctx.places[cityIds[0]];
        for (const product of spec.products) {
          if (closed) break;
          let dates;
          try {
            dates = parseDates(await client.dates(product, ref.lat, ref.lng));
            if (!dates || !dates.length) throw new Error(`${product}: the list of dates is empty or not in the expected shape`);
          } catch (e) { bad++; note(e); continue; }
          const wanted = dates.slice(-history);
          const P = state.products[product] = state.products[product] || { cities: {} };
          P.dates = wanted.map((d) => d.code);
          P.datesAt = ctx.now();
          for (const cityId of cityIds) {
            if (closed) break;
            const have = P.cities[cityId] = P.cities[cityId] || {};
            const missing = wanted.filter((d) => !have[d.code]);
            if (!missing.length) continue;
            const place = ctx.places[cityId];
            try {
              const parsed = parseSubset(await client.subset(product, place.lat, place.lng, missing[0].code, missing[missing.length - 1].code, spec.km || 1));
              if (!parsed) throw new Error(`${product}: the answer is not a subset (no "subset" list)`);
              let got = 0;
              for (const d of missing) {
                const items = parsed.items.filter((i) => i.date.code === d.code);
                if (!items.length) continue;   // the service has nothing for that date yet: asked again next time
                have[d.code] = { at: ctx.now(), s: spec.summarise(product, items, parsed) };
                got++;
              }
              if (got) ok++; else { bad++; note(new Error(`${product}: the answer held none of the dates asked for`)); }
            } catch (e) { bad++; note(e); }
          }
          // keep the newest few composites per city, so the cache stays small
          for (const cityId of Object.keys(P.cities)) {
            const codes = Object.keys(P.cities[cityId]).sort().reverse();
            for (const c of codes.slice(history + 2)) delete P.cities[cityId][c];
          }
        }
      } finally {
        state.lastAttemptAt = ctx.now();
        if (closed) { /* stopped in the middle: say nothing, keep what we have */ }
        else if (ok && !bad) { state.lastOkAt = ctx.now(); state.lastError = null; }
        else if (bad) { state.lastError = problems[0] || 'unknown problem'; state.lastErrorAt = ctx.now(); }
        if (problems.length && !closed) ctx.log(`the NASA/ORNL subset service gave ${bad} problem${bad === 1 ? '' : 's'}; first: ${problems[0]}`);
        save();
      }
      return { ok, bad };
    })().finally(() => { running = null; });
    return running;
  }

  function schedule(delayMs) {
    if (closed) return;
    clearTimeout(timer);
    timer = setTimeout(run, Math.max(1000, delayMs));
    if (timer.unref) timer.unref();
  }
  function run() {
    timer = null;
    if (closed) return;
    refresh().then((r) => {
      failedRounds = r.bad && !r.ok ? failedRounds + 1 : r.bad ? Math.max(1, failedRounds) : 0;
      const wait = failedRounds ? retryMs[Math.min(failedRounds - 1, retryMs.length - 1)] : everyMs * (0.9 + Math.random() * 0.2);
      schedule(Math.max(wait, pauseUntil - ctx.now()));
    }, (e) => { ctx.log('refresh failed (' + short(e, 100) + ')'); failedRounds++; schedule(retryMs[Math.min(failedRounds - 1, retryMs.length - 1)]); });
  }
  function start() { closed = false; if (!timer && !running) schedule(spec.startDelayMs == null ? 15000 : spec.startDelayMs); }
  function stop() { closed = true; clearTimeout(timer); timer = null; client.close(); }

  return {
    start, stop, refresh, entries, state,
    status: () => ({ attempted, running: !!running, lastOkAt: state.lastOkAt || null, lastAttemptAt: state.lastAttemptAt || null, lastError: state.lastError || null, cities: cityIds }),
  };
}

module.exports = {
  HOST, BASE, DAY, HOUR,
  parseModisDate, codeOfMs, parseDates, period, periodText, fmtNum, hhmm, fit, short,
  bandKey, parseSubset, windowOf, lstQa, viQa, createClient, createRefresher, num,
};
