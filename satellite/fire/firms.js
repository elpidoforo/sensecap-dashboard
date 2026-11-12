'use strict';
/* satellite/fire/firms.js: reading NASA FIRMS fire detections (CSV from the FIRMS "area" API) and turning them into hotspots.
 * Pure functions, no network, no files. The feed (satellite/feeds/fire-hotspots.js) does the fetching.
 *
 * THE RULES (one place, so a teacher can read them; the same words are in sources/fire-hotspots.json under x_rules):
 *   1. A row is read only when its latitude, longitude, date, time (UTC) and confidence are valid. Anything else is a "bad row" and is
 *      counted and skipped. A body that is not a FIRMS table at all (no header with those columns) is an error, never "no fires".
 *   2. Low confidence is dropped for every sensor in the same way. VIIRS says low / nominal / high (letters l, n, h). MODIS gives 0 to 100:
 *      under 30 counts as low, 30 to 79 as nominal, 80 and over as high (the MODIS class limits; see MODIS_LOW_BELOW and MODIS_HIGH_FROM).
 *      Nominal and high are kept.
 *   3. The same row seen twice (same sensor, place and time, for example from two overlapping requests) counts once.
 *   4. A HOTSPOT is one place. Every kept detection, from any sensor and at any time inside the 24 hours, that lies within MERGE_KM (1 km,
 *      about the size of the biggest pixel, MODIS) of a "seed" detection belongs to that seed's hotspot. Seeds are taken best first
 *      (high before nominal, then newest). Detections are NOT chained, so a long fire line becomes several hotspots, not one.
 *      So one fire seen by three satellites at four passes is ONE hotspot, and the counts are hotspots, not raw detections.
 *   5. The count window is the 24 hours that END at the moment the list was fetched (not at "now"), so the count and its time agree.
 */
const { distanceKm } = require('./geo');

const MERGE_KM = 1;
const MODIS_LOW_BELOW = 30;   // MODIS confidence under 30 % = low
const MODIS_HIGH_FROM = 80;   // MODIS confidence 80 % and over = high
const WINDOW_MS = 24 * 3600 * 1000;
const MAX_DETECTIONS = 5000;  // a safety cap on what one fetch may hold (the real number around Cyprus is tens)
const RADII_KM = { near: 25, around: 50, search: 100 };

// The FIRMS sources used, newest satellites first. optional: its failure is not a problem (NASA says Suomi NPP has stopped delivering).
const SOURCES = [
  { id: 'VIIRS_NOAA21_NRT', short: 'NOAA-21', name: 'NOAA-21 VIIRS', pixelM: 375 },
  { id: 'VIIRS_NOAA20_NRT', short: 'NOAA-20', name: 'NOAA-20 VIIRS', pixelM: 375 },
  { id: 'VIIRS_SNPP_NRT', short: 'Suomi NPP', name: 'Suomi NPP VIIRS', pixelM: 375, optional: true },
  { id: 'MODIS_NRT', short: 'MODIS', name: 'Terra and Aqua MODIS', pixelM: 1000 },
];

// One CSV line, with quotes. FIRMS does not quote anything, but a plain split would break if it ever did.
function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// 'l' | 'n' | 'h' for a FIRMS confidence cell (letters, words, or a number 0..100); null when it is none of those.
function confidenceClass(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'l' || s === 'low') return 'l';
  if (s === 'n' || s === 'nominal') return 'n';
  if (s === 'h' || s === 'high') return 'h';
  if (/^\d{1,3}(\.\d+)?$/.test(s)) {
    const x = Number(s);
    if (x > 100) return null;
    return x >= MODIS_HIGH_FROM ? 'h' : x >= MODIS_LOW_BELOW ? 'n' : 'l';
  }
  return null;
}

// acq_date "2026-11-12" + acq_time "1305" (UTC, HHMM; a leading zero may have been lost) -> ms, or null.
function acquisitionMs(date, time) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  const tm = /^\d{1,4}$/.exec(String(time == null ? '' : time).trim());
  if (!d || !tm) return null;
  const hhmm = String(time).trim().padStart(4, '0');
  const hh = Number(hhmm.slice(0, 2)), mm = Number(hhmm.slice(2));
  const y = Number(d[1]), mo = Number(d[2]), da = Number(d[3]);
  if (hh > 23 || mm > 59 || mo < 1 || mo > 12 || da < 1 || da > 31 || y < 2000 || y > 2100) return null;
  const t = Date.UTC(y, mo - 1, da, hh, mm);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === da ? t : null;   // 31 February is not a date
}

/* Reads one FIRMS CSV answer. Returns { detections, rows, bad, low, future } or throws Error('not a FIRMS table') when the body is not one.
 *   opts.now (ms): rows more than one hour in the future are bad (a garbled date), default Date.now() */
function parseDetections(text, source, opts) {
  const o = opts || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const src = (source && source.id) || String(source || 'FIRMS');
  const lines = String(text == null ? '' : text).replace(/^﻿/, '').split(/\r?\n/);
  let hi = 0;
  while (hi < lines.length && !lines[hi].trim()) hi++;
  if (hi >= lines.length) throw new Error('the answer is empty');
  const header = splitCsvLine(lines[hi]).map((h) => h.toLowerCase());
  const col = {};
  header.forEach((h, i) => { if (!(h in col)) col[h] = i; });
  for (const need of ['latitude', 'longitude', 'acq_date', 'acq_time', 'confidence']) if (!(need in col)) throw new Error('not a FIRMS table');
  const out = { detections: [], rows: 0, bad: 0, low: 0, future: 0 };
  const seen = new Set();
  for (let i = hi + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    out.rows++;
    const c = splitCsvLine(lines[i]);
    if (c.length !== header.length) { out.bad++; continue; }
    const latS = c[col.latitude], lngS = c[col.longitude];
    const lat = /^-?\d+(\.\d+)?$/.test(latS) ? Number(latS) : NaN, lng = /^-?\d+(\.\d+)?$/.test(lngS) ? Number(lngS) : NaN;
    const t = acquisitionMs(c[col.acq_date], c[col.acq_time]);
    const conf = confidenceClass(c[col.confidence]);
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || t == null || conf == null) { out.bad++; continue; }
    if (t > now + 3600000) { out.future++; out.bad++; continue; }
    if (conf === 'l') { out.low++; continue; }
    const key = `${lat}|${lng}|${t}`;   // rule 3: the same sensor, place and time
    if (seen.has(key)) continue;
    seen.add(key);
    out.detections.push({ lat, lng, t, src, conf });
    if (out.detections.length >= MAX_DETECTIONS) break;
  }
  return out;
}

// Rule 3 across several lists (the same detection can come back in two requests): one row per sensor, place and time.
function uniqueDetections(list) {
  const seen = new Set(), out = [];
  for (const d of list || []) {
    const k = `${d.src}|${d.lat}|${d.lng}|${d.t}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(d);
  }
  return out;
}

function inWindow(list, endMs, windowMs) {
  const w = windowMs || WINDOW_MS;
  return (list || []).filter((d) => d.t > endMs - w && d.t <= endMs);
}

// Rule 4. Returns hotspots: { lat, lng, t (newest detection), first (oldest), n (detections merged), conf ('h'|'n', best), sats [source ids] }.
function makeHotspots(detections, mergeKm) {
  const km = Number.isFinite(mergeKm) ? mergeKm : MERGE_KM;
  const rank = { h: 2, n: 1 };
  const order = (detections || []).slice(0, MAX_DETECTIONS).sort((a, b) => (rank[b.conf] || 0) - (rank[a.conf] || 0) || b.t - a.t || a.lat - b.lat || a.lng - b.lng);
  const used = new Array(order.length).fill(false);
  const dLat = km / 111 + 1e-6;
  const out = [];
  for (let i = 0; i < order.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const seed = order[i];
    const members = [seed];
    for (let j = i + 1; j < order.length; j++) {
      if (used[j] || Math.abs(order[j].lat - seed.lat) > dLat) continue;
      if (distanceKm(seed.lat, seed.lng, order[j].lat, order[j].lng) <= km) { used[j] = true; members.push(order[j]); }
    }
    out.push({
      lat: seed.lat, lng: seed.lng, conf: seed.conf, n: members.length,
      t: Math.max(...members.map((m) => m.t)), first: Math.min(...members.map((m) => m.t)),
      sats: [...new Set(members.map((m) => m.src))].sort(),
    });
  }
  return out.sort((a, b) => b.t - a.t || a.lat - b.lat || a.lng - b.lng);
}

const roundKm = (d) => (d < 10 ? Math.round(d * 10) / 10 : Math.round(d));   // a pixel is 375 m to 1 km wide: no false precision

// What one city sees. place = { lat, lng }. Hotspots are already inside the 24 hours.
function summariseCity(hotspots, place) {
  let n25 = 0, n50 = 0, best = null;
  for (const h of hotspots || []) {
    const d = distanceKm(place.lat, place.lng, h.lat, h.lng);
    if (d <= RADII_KM.near) n25++;
    if (d <= RADII_KM.around) n50++;
    if (d <= RADII_KM.search && (!best || d < best.d || (d === best.d && h.t > best.h.t))) best = { d, h };
  }
  return { n25, n50, nearest: best ? { km: Math.min(RADII_KM.search, roundKm(best.d)), t: best.h.t, conf: best.h.conf, n: best.h.n, sats: best.h.sats } : null };
}

module.exports = {
  MERGE_KM, MODIS_LOW_BELOW, MODIS_HIGH_FROM, WINDOW_MS, RADII_KM, SOURCES, MAX_DETECTIONS,
  splitCsvLine, confidenceClass, acquisitionMs, parseDetections, uniqueDetections, inWindow, makeHotspots, summariseCity, roundKm,
};
