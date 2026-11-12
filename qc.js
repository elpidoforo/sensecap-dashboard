'use strict';
/* Quality checks for sensor time series. Pure functions: no files, no network, no clock (the caller passes `now`).
 *
 * PORTED, NOT COPIED, from the ideas of ioos/ioos_qc (https://github.com/ioos/ioos_qc, Apache-2.0, read at commit 524de97),
 * the NOAA IOOS real-time quality-control tests (QARTOD). We took the logic of four tests and wrote our own code for them:
 *   gross range     fail outside a hard span, suspect outside a softer span                 (qartod.gross_range_test)
 *   spike           a point far from the midpoint of its two neighbours                     (qartod.spike_test, "average" method)
 *   rate of change  the step between two consecutive readings, per time                     (qartod.rate_of_change_test)
 *   flat line       the same value (within a tolerance) for too long                        (qartod.flat_line_test)
 * Where we differ from ioos_qc, on purpose:
 *   - a spike must also REVERSE (up then down): a step is not a spike, the rate-of-change test owns steps;
 *   - the rate-of-change limit is our vocab/variables.json "max_step" (largest believable change between two consecutive
 *     readings, about step_minutes apart) instead of a rate per second, and it can also say "fail" (3 x the limit);
 *   - the flat-line test uses "<=" tolerance (ioos_qc uses "<", so a tolerance of 0 never flags), finds whole runs instead of
 *     flagging a rolling window, and has a smarter rule for readings that are legitimately constant: humidity at saturation,
 *     a noise floor, calm wind, and light (which only counts while the sun is up, so night-time zeros never raise a flag);
 *   - a flag says why in English and Greek, in plain words.
 * Numbers (limits per variable) live in vocab/qc.json and vocab/variables.json, each with its basis. This file holds none.
 * Nothing here deletes, hides or changes a reading: the result is a list of flags and a one-word summary per sensor.
 *
 *   profileFor(variable, vocab, conf, env)  -> the limits for one variable (null when the vocab does not know it)
 *   runSeries(points, profile)              -> { variable, n, from, to, flags }
 *   grossOne(value, profile)                -> a flag for a single reading, or null
 *   assessSensor(results, { now })          -> { status: 'ok' | 'check', checked, items, note } or null (nothing recent to judge)
 *   sunElevation(ms)                        -> degrees above the horizon over Cyprus
 *
 * A flag: { test, severity: 'suspect' | 'fail', code: 3 | 4 (QARTOD numbers), i, t, reason: { en, el }, ... }
 *   i is the index in the array you passed in, t the time in ms. A run (flat line) also has iEnd, tEnd, since, n.
 */

const MIN = 60000, HOUR = 3600000;
const SUSPECT = 'suspect', FAIL = 'fail';
const CODE = { good: 1, unknown: 2, suspect: 3, fail: 4, missing: 9 };   // QARTOD flag numbers, as in ioos_qc QartodFlags
const TESTS = ['gross_range', 'flat_line', 'rate_of_change', 'spike'];   // when two flags tie, the earlier test is the better explanation

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------- reading the input ---------- */

function toMs(t) {
  if (typeof t === 'number') return Number.isFinite(t) ? (t < 1e11 ? t * 1000 : t) : null;   // seconds or milliseconds
  if (typeof t !== 'string' || !t.trim()) return null;
  const s = t.trim();
  const ms = Date.parse(/[zZ]$|[+-]\d\d:?\d\d$|T/.test(s) ? s : s.replace(' ', 'T') + 'Z');   // "2026-11-11 13:40:02" is UTC
  return Number.isFinite(ms) ? ms : null;
}

// [{ t, v }] or [[t, v]] -> [{ t, v, i }] sorted by time, one row per instant (the last one wins), only finite numbers. i = index in the input.
function clean(points) {
  const rows = [];
  (Array.isArray(points) ? points : []).forEach((p, i) => {
    const t = toMs(Array.isArray(p) ? p[0] : p && p.t);
    const raw = Array.isArray(p) ? p[1] : p && p.v;
    const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (t == null || !fin(v)) return;
    rows.push({ t, v, i });
  });
  rows.sort((a, b) => a.t - b.t || a.i - b.i);
  return rows.filter((r, k) => k === rows.length - 1 || rows[k + 1].t !== r.t);
}

function medianGap(rows) {
  if (rows.length < 2) return 0;
  const d = [];
  for (let k = 1; k < rows.length; k++) d.push(rows[k].t - rows[k - 1].t);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

/* ---------- the sun (so "constant light at night" is not a fault) ---------- */

// Elevation of the sun in degrees, for a place in Cyprus (35.0 N, 33.2 E: the four schools are within 1 degree of it).
// The low-precision formulas of the Astronomical Almanac (good to about 0.01 degree), which is far more than a day/night rule needs.
function sunElevation(ms, lat = 35.0, lon = 33.2) {
  const rad = Math.PI / 180, mod = (x, m) => ((x % m) + m) % m;
  const n = ms / 86400000 + 2440587.5 - 2451545.0;   // days since 2000-01-01 12:00 UTC (2440587.5 is the Julian date of the Unix epoch)
  const L = mod(280.460 + 0.9856474 * n, 360);
  const g = mod(357.528 + 0.9856003 * n, 360) * rad;
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const gmst = mod(18.697374558 + 24.06570982441908 * n, 24);   // hours
  const ha = (gmst * 15 + lon) * rad - ra;
  return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
}

/* ---------- words ---------- */

const UNIT_TEXT = { Cel: '°C', 'ug/m3': 'µg/m³', '[ppm]': 'ppm' };
const unitText = (u) => UNIT_TEXT[u] || u || '';
function num(v, el) {
  const dp = Math.abs(v) >= 100 ? 0 : 1;
  const s = new Intl.NumberFormat(el ? 'el-GR' : 'en-GB', { maximumFractionDigits: dp, useGrouping: Math.abs(v) >= 10000 }).format(Math.round(v * 10 ** dp) / 10 ** dp);
  return s.replace('-', '−');
}
function dur(ms, el) {
  const m = Math.round(ms / MIN);
  if (m < 90) return el ? m + ' λεπτά' : m + ' minutes';
  const h = Math.round((ms / HOUR) * 2) / 2;
  const s = num(h, el);
  return el ? s + (h === 1 ? ' ώρα' : ' ώρες') : s + (h === 1 ? ' hour' : ' hours');
}
const label = (p, el) => (p.label && p.label[el ? 1 : 0]) || p.variable;

const WORDS = {
  gross_fail: (p, x, el) => el
    ? `${label(p, 1)}: ${num(x.value, 1)} ${p.unitText}, εκτός των ορίων που μπορεί να μετρήσει ο αισθητήρας (${num(p.range[0], 1)} έως ${num(p.range[1], 1)} ${p.unitText}). Μπορεί να έχει βλάβη.`
    : `${label(p, 0)}: ${num(x.value)} ${p.unitText} is outside what a sensor can really measure here (${num(p.range[0])} to ${num(p.range[1])} ${p.unitText}). It may be faulty.`,
  gross_suspect: (p, x, el) => el
    ? `${label(p, 1)}: ${num(x.value, 1)} ${p.unitText}, ασυνήθιστο για την Κύπρο (συνήθως μένει ανάμεσα σε ${num(p.suspectRange[0], 1)} και ${num(p.suspectRange[1], 1)} ${p.unitText}). Έλεγξε πού βρίσκεται ο αισθητήρας.`
    : `${label(p, 0)}: ${num(x.value)} ${p.unitText} is unusual for Cyprus (it normally stays between ${num(p.suspectRange[0])} and ${num(p.suspectRange[1])} ${p.unitText}). Check where the sensor is.`,
  spike: (p, x, el) => el
    ? `${label(p, 1)}: μία μέτρηση (${num(x.value, 1)} ${p.unitText}) απέχει πολύ από τις διπλανές της (περίπου ${num(x.ref, 1)} ${p.unitText}). Μπορεί να είναι σύντομη διαταραχή, π.χ. μια πόρτα που άνοιξε.`
    : `${label(p, 0)}: one reading (${num(x.value)} ${p.unitText}) is far from the readings around it (about ${num(x.ref)} ${p.unitText}). It may be a short disturbance, such as a door opening.`,
  rate: (p, x, el) => el
    ? `${label(p, 1)}: άλλαξε κατά ${num(x.change, 1)} ${p.unitText} μέσα σε ${x.minutes} λεπτά. Οι πραγματικές μετρήσεις σπάνια αλλάζουν τόσο γρήγορα, γι’ αυτό έλεγξε τον αισθητήρα.`
    : `${label(p, 0)}: changed by ${num(x.change)} ${p.unitText} in ${x.minutes} minutes. Real readings rarely move that fast, so check the sensor.`,
  flat: (p, x, el) => (x.daylight
    ? (el ? `${label(p, 1)}: έμεινε στα ${num(x.value, 1)} ${p.unitText} για ${dur(x.ms, 1)} με φως ημέρας. Μήπως ο αισθητήρας είναι καλυμμένος ή κολλημένος;`
      : `${label(p, 0)}: stayed at ${num(x.value)} ${p.unitText} through ${dur(x.ms, 0)} of daylight. Is the sensor covered, or stuck?`)
    : (el ? `${label(p, 1)}: ακριβώς η ίδια τιμή (${num(x.value, 1)} ${p.unitText}) εδώ και ${dur(x.ms, 1)}. Ένας αισθητήρας που λειτουργεί κινείται λίγο, άρα μπορεί να έχει κολλήσει.`
      : `${label(p, 0)}: exactly the same value (${num(x.value)} ${p.unitText}) for ${dur(x.ms, 0)}. A working sensor moves a little, so it may be stuck.`)),
};
const say = (kind, p, x) => ({ en: WORDS[kind](p, x, 0), el: WORDS[kind](p, x, 1) });
const flag = (test, severity, row, extra) => Object.assign({ test, severity, code: CODE[severity], i: row.i, t: row.t }, extra);

/* ---------- the limits for one variable ---------- */

/* vocab = vocab/variables.json (range, max_step, unit, label), conf = vocab/qc.json, env = 'vehicle' | 'fixed' (anything else is fixed).
 * A vehicle gets more room: its sensor sits in sun, in a closed cabin, next to air conditioning, so it really does jump (BUILD brief
 * and the scout notes ask for generous limits there, or the tests cry wolf). */
function profileFor(variable, vocab, conf, env) {
  const v = vocab && vocab[variable];
  if (!v || typeof v !== 'object' || !Array.isArray(v.range) || !fin(v.range[0]) || !fin(v.range[1])) return null;
  conf = conf || {};
  const c = (conf.variables && conf.variables[variable]) || {};
  const e = env && conf.environments && conf.environments[env] ? conf.environments[env] : {};
  const f = fin(e.factor) && e.factor > 0 ? e.factor : 1, ff = fin(e.flat_factor) && e.flat_factor > 0 ? e.flat_factor : 1;
  const sr = (e.suspect_range && e.suspect_range[variable]) || c.suspect_range;
  const hr = e.range && Array.isArray(e.range[variable]) && fin(e.range[variable][0]) && fin(e.range[variable][1]) ? e.range[variable] : v.range;   // a closed vehicle can pass the outdoor limit
  const scale = (o, k) => (o && fin(o[k]) ? o[k] * f : null);
  return {
    variable, env: env || 'fixed', label: Array.isArray(v.label) ? v.label : [variable, variable], unit: v.unit, unitText: unitText(v.unit),
    range: [hr[0], hr[1]],
    suspectRange: Array.isArray(sr) && sr.length === 2 && fin(sr[0]) && fin(sr[1]) ? [sr[0], sr[1]] : null,
    maxStep: fin(v.max_step) && v.max_step > 0 ? v.max_step * f : null,
    stepMinutes: fin(conf.step_minutes) && conf.step_minutes > 0 ? conf.step_minutes : 10,
    maxGapFactor: fin(conf.max_gap_factor) && conf.max_gap_factor > 1 ? conf.max_gap_factor : 3,
    rateFailFactor: fin(conf.rate_fail_factor) && conf.rate_fail_factor > 1 ? conf.rate_fail_factor : 3,
    spike: c.spike && fin(c.spike.suspect) && fin(c.spike.fail) ? { suspect: scale(c.spike, 'suspect'), fail: scale(c.spike, 'fail'), rel: fin(c.spike.rel) ? c.spike.rel : 0 } : null,
    flat: c.flat && fin(c.flat.suspect_min) && fin(c.flat.fail_min) ? {
      tol: fin(c.flat.tol) ? c.flat.tol : 0, suspectMin: c.flat.suspect_min * ff, failMin: c.flat.fail_min * ff,
      minPoints: fin(c.flat.min_points) ? c.flat.min_points : 6,
      rest: c.flat.rest && (fin(c.flat.rest.below) || fin(c.flat.rest.above)) ? { below: fin(c.flat.rest.below) ? c.flat.rest.below : null, above: fin(c.flat.rest.above) ? c.flat.rest.above : null } : null,
      daylightOnly: c.flat.count === 'daylight', daylightDeg: fin(c.flat.daylight_deg) ? c.flat.daylight_deg : 8,
    } : null,
  };
}

/* ---------- the four tests (each takes cleaned rows and a profile, and returns flags) ---------- */

function grossFlag(row, p) {
  const v = row.v;
  if (v < p.range[0] || v > p.range[1]) return flag('gross_range', FAIL, row, { value: v, reason: say('gross_fail', p, { value: v }) });
  if (p.suspectRange && (v < p.suspectRange[0] || v > p.suspectRange[1])) return flag('gross_range', SUSPECT, row, { value: v, reason: say('gross_suspect', p, { value: v }) });
  return null;
}
function grossRange(rows, p) { return rows.map((r) => grossFlag(r, p)).filter(Boolean); }

// A single reading with no history (the newest value of /api/latest).
function grossOne(value, p, t) {
  const v = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return p && fin(v) ? grossFlag({ t: toMs(t) || 0, v, i: 0 }, p) : null;
}

// The longest gap between two readings that still counts as "next to each other".
const gapLimit = (rows, p) => Math.max(p.stepMinutes * p.maxGapFactor * MIN, 2.5 * medianGap(rows));

function spikeTest(rows, p) {
  const s = p.spike, out = [];
  if (!s || rows.length < 3) return out;
  const maxGap = gapLimit(rows, p);
  for (let k = 1; k < rows.length - 1; k++) {
    const a = rows[k - 1], b = rows[k], c = rows[k + 1];
    if (b.t - a.t > maxGap || c.t - b.t > maxGap) continue;   // neighbours too far away to say anything
    if ((b.v - a.v) * (c.v - b.v) >= 0) continue;              // went on in the same direction: a step or a ramp, not a spike
    const ref = (a.v + c.v) / 2, d = Math.abs(b.v - ref);
    if (s.rel && d < s.rel * Math.abs(ref)) continue;          // small next to the level around it (particles: 80 on top of 400)
    const sev = d > s.fail ? FAIL : d > s.suspect ? SUSPECT : null;
    if (sev) out.push(flag('spike', sev, b, { value: b.v, ref, deviation: d, reason: say('spike', p, { value: b.v, ref }) }));
  }
  return out;
}

function rateTest(rows, p) {
  const out = [];
  if (!fin(p.maxStep) || rows.length < 2) return out;
  const ref = p.stepMinutes * MIN, maxGap = gapLimit(rows, p);
  for (let k = 1; k < rows.length; k++) {
    const a = rows[k - 1], b = rows[k], dt = b.t - a.t;
    if (dt <= 0 || dt > maxGap) continue;                      // a long silence: the world may really have moved, say nothing
    const allowed = p.maxStep * Math.max(1, dt / ref), d = Math.abs(b.v - a.v);
    if (d <= allowed) continue;
    const sev = d > allowed * p.rateFailFactor ? FAIL : SUSPECT;
    out.push(flag('rate_of_change', sev, b, { value: b.v, change: d, minutes: Math.max(1, Math.round(dt / MIN)), allowed, reason: say('rate', p, { change: d, minutes: Math.max(1, Math.round(dt / MIN)) }) }));
  }
  return out;
}

function flatTest(rows, p) {
  const f = p.flat, out = [];
  if (!f || rows.length < Math.max(3, f.minPoints)) return out;
  const maxGap = gapLimit(rows, p);
  // time of a stretch of the run that counts: all of it, or only the part where the sun is up (light)
  const counted = (a, b) => {
    if (!f.daylightOnly) return b.t - a.t;
    return sunElevation((a.t + b.t) / 2) > f.daylightDeg ? b.t - a.t : 0;
  };
  let s = 0;
  while (s < rows.length) {
    let lo = rows[s].v, hi = lo, e = s;
    while (e + 1 < rows.length && rows[e + 1].t - rows[e].t <= maxGap) {
      const v = rows[e + 1].v, nlo = Math.min(lo, v), nhi = Math.max(hi, v);
      if (nhi - nlo > f.tol) break;
      lo = nlo; hi = nhi; e++;
    }
    const n = e - s + 1;
    if (n >= f.minPoints) {
      const atRest = f.rest && ((f.rest.below != null && hi <= f.rest.below) || (f.rest.above != null && lo >= f.rest.above));   // legitimately constant
      if (!atRest) {
        let acc = 0, first = -1;
        for (let k = s + 1; k <= e; k++) {
          acc += counted(rows[k - 1], rows[k]);
          if (first < 0 && acc >= f.suspectMin * MIN) first = k;
        }
        if (first >= 0) {
          const sev = acc >= f.failMin * MIN ? FAIL : SUSPECT;
          const value = rows[e].v;
          out.push(flag('flat_line', sev, rows[first], { value, iEnd: rows[e].i, tEnd: rows[e].t, since: rows[s].t, n, ms: acc, daylight: f.daylightOnly, reason: say('flat', p, { value, ms: acc, daylight: f.daylightOnly }) }));
        }
      }
    }
    s = e + 1;
  }
  return out;
}

/* ---------- one series ---------- */

function runSeries(points, p) {
  const rows = clean(points);
  if (!p) return { variable: null, n: rows.length, from: rows.length ? rows[0].t : null, to: rows.length ? rows[rows.length - 1].t : null, flags: [] };
  const flags = [].concat(grossRange(rows, p), spikeTest(rows, p), rateTest(rows, p), flatTest(rows, p));
  flags.sort((a, b) => a.t - b.t || TESTS.indexOf(a.test) - TESTS.indexOf(b.test));
  return { variable: p.variable, label: p.label, unit: p.unit, n: rows.length, from: rows.length ? rows[0].t : null, to: rows.length ? rows[rows.length - 1].t : null, cadence: medianGap(rows), flags };
}

/* ---------- one sensor: 'ok' or 'check' ----------
 * results = runSeries results of all the sensor's readings (each may carry an opaque `id`, which comes back on its item). The rule, kept short so students can read it:
 *   - only flags from the last `windowHours` (6) count, and only series whose newest reading is less than `freshHours` (3) old
 *     (a sensor that went quiet is the "sensor quiet" alert's business, not ours);
 *   - 'check' when a reading FAILED, or a reading is stuck right now (a flat line that reaches the newest reading), or at least
 *     `suspectEvents` (3) different suspect readings came in. One or two odd points are normal life (a door, a gust) and stay 'ok'.
 *   - null when there is nothing recent to judge.
 * It never raises an alert, sends nothing and hides nothing: it only gives the page a sentence to show. */
function assessSensor(results, o) {
  o = o || {};
  const now = fin(o.now) ? o.now : 0;
  const windowMs = (fin(o.windowHours) ? o.windowHours : 6) * HOUR, freshMs = (fin(o.freshHours) ? o.freshHours : 3) * HOUR;
  const need = fin(o.suspectEvents) ? o.suspectEvents : 3;
  let checked = 0;
  const items = [];
  for (const r of results || []) {
    if (!r || !r.variable || !fin(r.to) || now - r.to > freshMs || r.n < 3) continue;
    checked++;
    const recent = r.flags.filter((f) => now - (f.tEnd || f.t) <= windowMs);
    const slack = Math.max(2.5 * (r.cadence || 0), 20 * MIN);
    const stuckNow = recent.filter((f) => f.test === 'flat_line' && r.to - f.tEnd <= slack);
    const fails = recent.filter((f) => f.severity === FAIL);
    const suspects = recent.filter((f) => f.severity === SUSPECT && f.test !== 'flat_line');
    const flagged = fails.length > 0 || stuckNow.length > 0 || new Set(suspects.map((f) => f.t)).size >= need;
    if (!flagged) continue;
    const pool = fails.concat(stuckNow.filter((f) => f.severity !== FAIL), suspects);
    const top = pool.slice().sort((a, b) => (b.severity === FAIL) - (a.severity === FAIL) || (stuckNow.includes(b) - stuckNow.includes(a)) || (b.tEnd || b.t) - (a.tEnd || a.t) || TESTS.indexOf(a.test) - TESTS.indexOf(b.test))[0];
    items.push({ id: r.id == null ? null : r.id, variable: r.variable, test: top.test, severity: top.severity, t: top.tEnd || top.t, ongoing: stuckNow.includes(top), reason: top.reason });
  }
  if (!checked) return null;
  items.sort((a, b) => (b.severity === FAIL) - (a.severity === FAIL) || (b.ongoing - a.ongoing) || b.t - a.t);
  return { status: items.length ? 'check' : 'ok', checked, items: items.slice(0, 3), note: items.length ? items[0].reason : null };
}

module.exports = { profileFor, runSeries, grossOne, assessSensor, sunElevation, clean, toMs, medianGap, unitText, num, dur, SUSPECT, FAIL, CODE, TESTS, MIN, HOUR };
