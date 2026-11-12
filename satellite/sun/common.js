'use strict';
/* satellite/sun/common.js: small helpers shared by the three sunshine feeds (sat-sun package).
 * Not a feed itself (the registry only loads satellite/feeds/*.js): no network here, no state, nothing that can throw at load.
 *
 *   sunElevation(ms, lat, lng)            degrees above the horizon (NOAA low-precision formulas, good to about 0.1 degree)
 *   topOfAtmosphereKwh(lat, ms)           daily sunshine energy at the top of the atmosphere, kWh/m2/day (FAO-56, equation 21)
 *   isNight(ms, lat, lng)                 true when the sun is below the horizon for the whole hour that ENDS at ms
 *   makeRunner({ log, firstMs, everyMs, work })   a timer that never throws, never overlaps, backs off after a failure, is unref'd
 *   readJson / writeJson                  the last good answer on the data volume (best effort)
 *   localHM, dayText, numText             words for the notes (Cyprus time, English and Greek)
 */
const fs = require('fs');
const path = require('path');

const RAD = Math.PI / 180;
const HOUR = 3600000, DAY = 86400000;

const num = (v) => (v == null || v === '' || typeof v === 'boolean' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const round = (v, d) => { const k = Math.pow(10, d == null ? 1 : d); return Math.round(v * k) / k; };

/* ---------- the sun ---------- */

function sunElevation(tMs, lat, lng) {
  const n = tMs / DAY + 2440587.5 - 2451545.0;   // days since J2000
  const L = 280.460 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmstHours = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
  const hourAngle = (gmstHours * 15 + lng) * RAD - ra;
  const s = Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

// An hourly value stamped T is the average over the hour BEFORE T. It is night when the sun stays below the horizon for all of that hour.
function isNight(tEndMs, lat, lng) {
  return [tEndMs - HOUR, tEndMs - HOUR / 2, tEndMs].every((t) => sunElevation(t, lat, lng) <= 0);
}

// Daily energy on a horizontal surface at the top of the atmosphere (kWh/m2/day): no ground value can be bigger. FAO-56 eq. 21.
function topOfAtmosphereKwh(lat, dayMs) {
  const d = new Date(dayMs);
  const J = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
  const phi = lat * RAD;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * J) / 365);
  const dec = 0.409 * Math.sin((2 * Math.PI * J) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(dec))));
  const raMj = ((24 * 60) / Math.PI) * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.sin(ws));
  return raMj / 3.6;
}

/* ---------- time and words ---------- */

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (ms) => Math.floor(ms / DAY) * DAY;
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EL_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
// '2026-11-05' -> '5 Nov' / '5 Νοε'
function dayText(ymdStr, el) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymdStr));
  if (!m) return String(ymdStr);
  return `${Number(m[3])} ${(el ? EL_MONTHS : EN_MONTHS)[Number(m[2]) - 1]}`;
}
let hmFormat = null;
function localHM(ms) {   // 'HH:MM' on a Cyprus clock; the plain UTC time (with its name) when this Node has no time-zone data
  try {
    if (!hmFormat) hmFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Nicosia', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return hmFormat.format(new Date(ms));
  } catch (e) { return new Date(ms).toISOString().slice(11, 16) + ' UTC'; }
}
// 4.2 -> '4.2' in English, '4,2' in Greek
const numText = (v, d, el) => { const s = round(v, d).toFixed(d); return el ? s.replace('.', ',') : s; };

const km = (a, b) => {
  const dLat = (b[0] - a[0]) * RAD, dLng = (b[1] - a[1]) * RAD;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

/* ---------- the last good answer, on the data volume ---------- */

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } }
function writeJson(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
    fs.renameSync(file + '.tmp', file);
    return true;
  } catch (e) { return false; }
}

/* ---------- the timer ---------- */

// work() resolves to true (fine: wait everyMs), or false / throws (failed: wait with a back-off). A thrown error with retryAfterSec
// (HTTP 429 from ctx.get) is respected. ONE log line per failure, never a stack, never a URL.
function makeRunner(o) {
  const log = o.log || (() => {});
  const backoff = o.backoffMs || [HOUR / 2, HOUR, 2 * HOUR, 4 * HOUR];
  let timer = null, stopped = true, running = false, fails = 0;
  const arm = (ms) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(tick, Math.max(1000, ms));
    if (timer.unref) timer.unref();
  };
  async function tick(force) {
    if ((stopped && force !== true) || running) return;
    running = true;
    let next;
    try {
      const ok = await o.work();
      if (ok) { fails = 0; next = o.everyMs; }
      else { fails++; next = backoff[Math.min(fails - 1, backoff.length - 1)]; }
    } catch (e) {
      fails++;
      next = backoff[Math.min(fails - 1, backoff.length - 1)];
      if (e && Number.isFinite(e.retryAfterSec) && e.retryAfterSec > 0) next = Math.min(Math.max(next, e.retryAfterSec * 1000), 6 * HOUR);
      try { log(`refresh failed (${String((e && e.message) || 'unknown').replace(/\s+/g, ' ').slice(0, 120)}), trying again in ${Math.round(next / 60000)} min`); } catch (e2) { /* a log line must never break the timer */ }
    } finally { running = false; }
    arm(next);
  }
  return {
    start() { if (!stopped) return; stopped = false; arm(o.firstMs); },
    stop() { stopped = true; clearTimeout(timer); timer = null; },
    tick: () => tick(true),   // for tests: one round now, even when the timer is not started
    get fails() { return fails; },
  };
}

module.exports = { HOUR, DAY, num, round, sunElevation, isNight, topOfAtmosphereKwh, ymd, dayStart, dayText, localHM, numText, km, readJson, writeJson, makeRunner };
