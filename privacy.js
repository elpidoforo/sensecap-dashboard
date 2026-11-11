'use strict';
/* Privacy of vehicle positions.
 *
 * The site is open to everybody, so the exact place of a school bus or car must never leave the server for a visitor.
 * What the public (and the AI assistant, and the Build studio) may see of a vehicle is:
 *   - a position that is at least PUBLIC_POS_DELAY_MIN minutes old (default 120), the last one the vehicle reported before that,
 *   - rounded to a grid of PUBLIC_POS_GRID degrees (default 0.01, about 1 km),
 *   - and a trail made only of such old points, rounded, with neighbouring duplicates removed.
 * Teachers and admins (and the holder of DASHBOARD_PASSWORD) get exact data. Nobody else does.
 *
 * This file only holds the maths. server.js decides who is a teacher and where the history comes from.
 * Points are [time in ms, lat, lng, value or null], the same shape as /api/trails.
 */

const GPS_LNG = '4197';
const GPS_LAT = '4198';
const GPS_MIDS = new Set([GPS_LAT, GPS_LNG]);

function number(v, fallback, min, max) {
  const n = Number(v);
  return v !== undefined && v !== '' && isFinite(n) && n >= min && n <= max ? n : fallback;
}

function createPrivacy(env = process.env) {
  const delayMin = number(env.PUBLIC_POS_DELAY_MIN, 120, 0, 10080);
  const delayMs = delayMin * 60000;
  const grid = number(env.PUBLIC_POS_GRID, 0.01, 0.0001, 1) || 0.01;

  // how many decimals the grid needs (0.01 -> 2, 0.025 -> 3), so that rounded values are clean numbers
  let decimals = 0;
  while (decimals < 8 && Math.abs(grid * 10 ** decimals - Math.round(grid * 10 ** decimals)) > 1e-9) decimals++;
  const snap = (v) => Number((Math.round(v / grid) * grid).toFixed(decimals));

  // History to read when looking for the newest old-enough position: the delay plus a day, at most a week.
  const windowHours = Math.min(168, Math.ceil(delayMin / 60) + 24);

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const usable = (p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]) && isNum(p[2]);

  /** A measurement id from a request, as a clean string ("04198" becomes "4198"), or null when it is not an id. */
  function normMid(mid) {
    const s = String(mid == null ? '' : mid);
    return /^\d{1,6}$/.test(s) ? String(parseInt(s, 10)) : null;
  }
  const isGpsMid = (mid) => { const m = normMid(mid); return m != null && GPS_MIDS.has(m); };

  /** latest readings without the GPS measurement ids */
  function stripGpsLatest(latest) {
    const out = {};
    for (const [eui, values] of Object.entries(latest || {})) {
      out[eui] = {};
      for (const [mid, v] of Object.entries(values || {})) if (!GPS_MIDS.has(mid)) out[eui][mid] = v;
    }
    return out;
  }

  /** The public trail: only points older than the delay, rounded, with consecutive duplicates removed. */
  function publicTrail(points, now = Date.now()) {
    const out = [];
    let last = '';
    for (const p of points || []) {
      if (!usable(p) || now - p[0] < delayMs) continue;
      const lat = snap(p[1]), lng = snap(p[2]);
      const key = lat + ',' + lng;
      if (key === last) continue;
      last = key;
      out.push([p[0], lat, lng, p[3] == null ? null : p[3]]);
    }
    return out;
  }

  /** The public position: the newest point that is old enough, rounded. null when there is none. */
  function publicPosition(points, now = Date.now()) {
    let best = null;
    for (const p of points || []) if (usable(p) && now - p[0] >= delayMs && (!best || p[0] > best[0])) best = p;
    return best ? { lat: snap(best[1]), lng: snap(best[2]), at: best[0] } : null;
  }

  /** When the history holds nothing old enough: the position SenseCAP has stored for a vehicle that has been silent
   *  for longer than the delay (it cannot be newer than the last message), rounded. Otherwise null. */
  function silentPosition(dev, lastSeenMs, now = Date.now()) {
    if (!dev || !isNum(dev.lat) || !isNum(dev.lng) || !isNum(lastSeenMs) || now - lastSeenMs < delayMs) return null;
    return { lat: snap(dev.lat), lng: snap(dev.lng), at: lastSeenMs };
  }

  /** A vehicle as the public sees it: lat/lng replaced by the delayed, rounded position. */
  function publicDevice(dev, pos) {
    const { lat, lng, ...rest } = dev;
    return { ...rest, lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, posDelayed: true, posAt: pos ? pos.at : null };
  }

  /** A public vehicle for the assistant and the Build studio: also without the GPS measurement ids, so no tool can ask for them. */
  function toolDevice(pub) {
    const d = { ...pub, measurements: (pub.measurements || []).filter((m) => !GPS_MIDS.has(String(m))), channelOf: {} };
    for (const [m, ch] of Object.entries(pub.channelOf || {})) if (!GPS_MIDS.has(m)) d.channelOf[m] = ch;
    return d;
  }

  /** A whole /api/trails answer for the public. */
  function publicTrails(raw, now = Date.now()) {
    const trails = {}, notes = {};
    for (const [eui, pts] of Object.entries((raw && raw.trails) || {})) {
      trails[eui] = publicTrail(pts, now);
      if (!trails[eui].length) notes[eui] = 'no public GPS points in this window (positions are delayed)';
    }
    for (const [eui, note] of Object.entries((raw && raw.notes) || {})) if (!(eui in trails)) notes[eui] = note;
    return { hours: raw && raw.hours, mid: raw && raw.mid, trails, notes, updated: raw && raw.updated, posDelayed: true, delayMinutes: delayMin, grid };
  }

  return {
    delayMin, delayMs, grid, decimals, windowHours,
    snap, normMid, isGpsMid, stripGpsLatest, publicTrail, publicPosition, silentPosition, publicDevice, toolDevice, publicTrails,
  };
}

module.exports = { createPrivacy, GPS_LAT, GPS_LNG, GPS_MIDS };
