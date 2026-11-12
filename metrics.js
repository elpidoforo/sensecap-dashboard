'use strict';
/* Sensor-versus-reference statistics, for the "my school sensor vs the nearest official station" card. Pure functions, no I/O.
 *
 * Ported (not copied) from the maths of USEPA/sensortoolkit (MIT, https://github.com/USEPA/sensortoolkit, commit 1e89056,
 * files sensortoolkit/calculate/_regression_stats.py, _rmse.py, _cv.py, param/_targets.py, datetime_utils/_time_averaging.py):
 *   - ordinary least squares of the SENSOR (y) on the REFERENCE (x): slope, intercept; R2 = the square of Pearson's r
 *   - RMSE = sqrt(mean((sensor - reference)^2)); NRMSE = RMSE / mean(reference) * 100 (percent)
 *   - at least 3 pairs, otherwise no regression (sensortoolkit refuses N <= 2)
 *   - an hourly mean needs 75 % of its readings, a daily mean 18 of 24 hours (75 %)
 *   - mean bias (sensor minus reference, absolute and in percent) is added here for plain-word reading.
 *
 * The PM2.5 targets are U.S. EPA's "Recommended Target Values" for PM2.5 sensors, "Base Testing" (field test beside an FRM/FEM
 * monitor). Source read for this module: EPA presentation "Sensors for smoke: tools and resources" (R. Duvall, 2021-02-16),
 * slide 17, https://www.epa.gov/system/files/documents/2022-03/presentation_sensorsforsmoke_toolsandresources_2_16_21.pdf :
 *   precision SD <= 5 ug/m3 or CV <= 30 %; bias slope 1.0 +/- 0.35; linearity intercept -5..+5 ug/m3; R2 >= 0.70;
 *   error RMSE <= 7 ug/m3 or NRMSE <= 30 %. The same numbers are in sensortoolkit's _targets.py (slope 0.65-1.35).
 *   EPA states they are for 24-hour averages, for 3 or more identical sensors collocated with a reference monitor for at least
 *   30 consecutive days at 2 sites. A school sensor several km from a station, on a few days, is NOT that test: the card
 *   uses the yardstick loosely and says so. This module never says "certified" or "passed the EPA test".
 */

const HOUR = 3600000, DAY = 86400000;

const EPA_PM25 = Object.freeze({
  id: 'epa-pm25-base-testing',
  name: 'U.S. EPA recommended target values for PM2.5 sensors (Base Testing)',
  url: 'https://www.epa.gov/system/files/documents/2022-03/presentation_sensorsforsmoke_toolsandresources_2_16_21.pdf',
  checked: '2026-11-12',
  averaging: '24-hour',
  completeness: 0.75,          // 18 of 24 hours for a daily mean
  epaDays: 30,                 // EPA asks for at least 30 consecutive days
  epaSensors: 3,               // and at least 3 identical sensors
  targets: Object.freeze({
    r2: Object.freeze({ min: 0.70 }),
    slope: Object.freeze({ min: 0.65, max: 1.35 }),
    intercept: Object.freeze({ min: -5, max: 5, unit: 'ug/m3' }),
    rmse: Object.freeze({ max: 7, unit: 'ug/m3' }),
    nrmse: Object.freeze({ max: 30, unit: '%' }),
    sd: Object.freeze({ max: 5, unit: 'ug/m3' }),
    cv: Object.freeze({ max: 30, unit: '%' }),
  }),
});

const MIN_PAIRS = 3;            // sensortoolkit: a regression needs more than 2 points
const MIN_DAYS_FOR_SCORECARD = 5;   // our own floor: below this the card shows numbers but no pass or not-yet words

const isNum = (v) => typeof v === 'number' && isFinite(v);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const round = (v, d = 3) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/* ---------- regression and error statistics ---------- */

/** pairs: [{ ref, sensor }]. Returns n, slope, intercept, r, r2, rmse, nrmse, means and bias; numbers or null (never NaN). */
function regression(pairs) {
  const p = (pairs || []).filter((q) => q && isNum(q.ref) && isNum(q.sensor));
  const n = p.length;
  const out = { n, slope: null, intercept: null, r: null, r2: null, rmse: null, nrmse: null, meanRef: null, meanSensor: null, meanBias: null, meanBiasPct: null };
  if (!n) return out;
  const mx = mean(p.map((q) => q.ref)), my = mean(p.map((q) => q.sensor));
  out.meanRef = mx; out.meanSensor = my; out.meanBias = my - mx;
  out.meanBiasPct = mx > 0 ? ((my - mx) / mx) * 100 : null;
  if (n < MIN_PAIRS) return out;
  let sxx = 0, syy = 0, sxy = 0, sse = 0;
  for (const q of p) {
    const dx = q.ref - mx, dy = q.sensor - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    sse += (q.sensor - q.ref) ** 2;
  }
  out.rmse = Math.sqrt(sse / n);
  out.nrmse = mx > 0 ? (out.rmse / mx) * 100 : null;
  if (sxx > 1e-12) {
    out.slope = sxy / sxx;
    out.intercept = my - out.slope * mx;
    if (syy > 1e-12) { out.r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy))); out.r2 = out.r * out.r; }
  }
  return out;
}

/* ---------- targets: pass, not yet, or cannot say ---------- */

const within = (v, lim) => isNum(v) && (lim.min == null || v >= lim.min) && (lim.max == null || v <= lim.max);

/** Checks a regression (made on 24-hour means) against EPA's PM2.5 targets. Rows: r2, slope, intercept, error, precision.
 *  state: 'pass' | 'fail' | 'na' (no value to judge) | 'untested' (needs identical sensors side by side). */
function checkTargets(stats, targets = EPA_PM25.targets) {
  const row = (id, value, ok, extra) => ({ id, value: isNum(value) ? value : null, state: !isNum(value) ? 'na' : ok ? 'pass' : 'fail', ...extra });
  const rows = [
    row('r2', stats.r2, within(stats.r2, targets.r2), { target: { ...targets.r2 } }),
    row('slope', stats.slope, within(stats.slope, targets.slope), { target: { ...targets.slope } }),
    row('intercept', stats.intercept, within(stats.intercept, targets.intercept), { target: { min: targets.intercept.min, max: targets.intercept.max }, unit: targets.intercept.unit }),
  ];
  // EPA: "RMSE <= 7 ug/m3 OR NRMSE <= 30 %": either one is enough.
  const rmseOk = isNum(stats.rmse) && stats.rmse <= targets.rmse.max, nrmseOk = isNum(stats.nrmse) && stats.nrmse <= targets.nrmse.max;
  const haveErr = isNum(stats.rmse) || isNum(stats.nrmse);
  rows.push({ id: 'error', value: isNum(stats.rmse) ? stats.rmse : null, nrmse: isNum(stats.nrmse) ? stats.nrmse : null, state: !haveErr ? 'na' : rmseOk || nrmseOk ? 'pass' : 'fail', target: { rmseMax: targets.rmse.max, nrmseMax: targets.nrmse.max }, unit: targets.rmse.unit, by: rmseOk ? 'rmse' : nrmseOk ? 'nrmse' : null });
  // Precision (SD or CV) is measured between identical sensors running together. We have one sensor.
  rows.push({ id: 'precision', value: null, state: 'untested', target: { sdMax: targets.sd.max, cvMax: targets.cv.max } });
  const judged = rows.filter((r) => r.state === 'pass' || r.state === 'fail');
  return { rows, tested: judged.length, passed: judged.filter((r) => r.state === 'pass').length, allPass: judged.length === 4 && judged.every((r) => r.state === 'pass') };
}

/* ---------- averaging: hours and days ---------- */

const dayFmt = new Map();
/** The calendar day of a time in a time zone, as "YYYY-MM-DD" (Cyprus days by default). */
function localDay(t, tz = 'Asia/Nicosia') {
  let f = dayFmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); dayFmt.set(tz, f); }
  return f.format(new Date(t));
}

/** The usual gap between two readings, in minutes (median). */
function readingStepMin(points) {
  const d = [];
  for (let i = 1; i < points.length; i++) { const g = points[i].t - points[i - 1].t; if (g > 0) d.push(g); }
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return d[d.length >> 1] / 60000;
}

/** Hourly means of a sensor series [{t, v}] (ms and value) inside [from, to).
 *  An hour counts when it holds 75 % of the readings expected at the sensor's own step (sensortoolkit's rule); when the step is
 *  30 minutes or more every reading is already an average over its step, so one reading is enough. A step of more than 70
 *  minutes cannot describe single hours: then nothing is returned and `coarse` is true. */
function hourlyMeans(points, { from = -Infinity, to = Infinity, minShare = 0.75 } = {}) {
  const pts = (points || []).filter((p) => p && isNum(p.t) && isNum(p.v) && p.t >= from && p.t < to).sort((a, b) => a.t - b.t);
  const stepMin = readingStepMin(pts);
  const out = new Map();
  if (stepMin == null) return { hours: out, stepMin: null, coarse: false };
  if (stepMin > 70) return { hours: out, stepMin, coarse: true };
  const expected = Math.max(1, 60 / stepMin);
  const need = stepMin >= 30 ? 1 : Math.max(1, Math.ceil(minShare * expected - 1e-9));
  const acc = new Map();
  for (const p of pts) {
    const h = Math.floor(p.t / HOUR) * HOUR;
    const a = acc.get(h) || { s: 0, n: 0 };
    a.s += p.v; a.n++;
    acc.set(h, a);
  }
  for (const [h, a] of acc) if (a.n >= need) out.set(h, { v: a.s / a.n, n: a.n });
  return { hours: out, stepMin, coarse: false };
}

/** Pairs hours present on both sides: sensorHours Map(hour -> {v}) and refHours Map(hour -> number or {v}). */
function pairHours(sensorHours, refHours) {
  const out = [];
  for (const [h, s] of sensorHours) {
    const r = refHours.get(h);
    const rv = r && typeof r === 'object' ? r.v : r;
    if (isNum(rv) && isNum(s.v)) out.push({ t: h, sensor: s.v, ref: rv });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Daily means of hourly pairs: a day counts when it has at least 18 paired hours (75 %). */
function dailyPairs(pairs, { tz = 'Asia/Nicosia', minHours = 18 } = {}) {
  const byDay = new Map();
  for (const p of pairs) {
    const k = localDay(p.t, tz);
    const a = byDay.get(k) || { day: k, sensor: 0, ref: 0, hours: 0 };
    a.sensor += p.sensor; a.ref += p.ref; a.hours++;
    byDay.set(k, a);
  }
  return [...byDay.values()].filter((a) => a.hours >= minHours).map((a) => ({ day: a.day, hours: a.hours, sensor: a.sensor / a.hours, ref: a.ref / a.hours })).sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** How fair a comparison is, from the distance between the sensor and the station.
 *  near: 5 km or less. far: up to 25 km (same city region, but local traffic and dust can differ). too-far: beyond. */
function fairness(distanceKm) {
  if (!isNum(distanceKm)) return 'unknown';
  return distanceKm <= 5 ? 'near' : distanceKm <= 25 ? 'far' : 'too-far';
}

/** The whole comparison.
 *  sensorPoints [{t,v}], refHours Map(hourStart -> value), window { from, to }, distanceKm (optional).
 *  Returns pairs (hourly), hourly stats, daily pairs and stats, the scorecard (on daily means, only with enough days) and flags. */
function compare({ sensorPoints, refHours, from, to, distanceKm = null, tz = 'Asia/Nicosia' }) {
  const sh = hourlyMeans(sensorPoints, { from, to });
  const pairs = pairHours(sh.hours, refHours);
  const hourlyStats = regression(pairs);
  const days = dailyPairs(pairs, { tz });
  const dailyStats = regression(days);
  const enoughDays = days.length >= MIN_DAYS_FOR_SCORECARD;
  const card = enoughDays ? checkTargets(dailyStats) : null;
  return {
    pairs,
    hourly: hourlyStats,
    days,
    daily: dailyStats,
    scorecard: card && { basis: 'daily', ...card },
    minDays: MIN_DAYS_FOR_SCORECARD,
    epaDays: EPA_PM25.epaDays,
    sensorHours: sh.hours.size,
    stepMin: sh.stepMin,
    coarse: sh.coarse,
    fairness: fairness(distanceKm),
  };
}

module.exports = { EPA_PM25, MIN_PAIRS, MIN_DAYS_FOR_SCORECARD, regression, checkTargets, hourlyMeans, pairHours, dailyPairs, localDay, readingStepMin, fairness, compare, round, HOUR, DAY };
