'use strict';
/* satellite/fire/effis.js: reading EFFIS burnt-area perimeters (GeoJSON from the EFFIS WFS layer nrt.ba.poly) and summing them for a city.
 * Pure functions, no network, no files. Only geometry, an area in hectares and two dates are ever read: any other property of a
 * feature (names of places, districts, owners if there were any) is thrown away on purpose.
 *
 * What the feature properties are (from the third-party client "effis-client" README and the EFFIS pages; NOT verified on the live service):
 *   id, fire_id, initialdate "2026-08-01 10:00:00" (start), finaldate (last update), area "160" (hectares, a string)
 * RULES
 *   1. A feature is read only with a Polygon or MultiPolygon in degrees (longitude, latitude), a positive area and a date.
 *      Anything else is a "bad" feature and is left out (and counted).
 *   2. The area in the properties must agree with the outline: the area of the outer rings, worked out here, must be between 0.3 and 3
 *      times the property (holes and rounding explain small gaps). If it is not, the feature is bad. This also protects against a wrong
 *      unit: if the property were square metres or square kilometres, every feature would be bad and nothing would be shown. (Known gap:
 *      a unit that differs by less than a factor of 3, such as acres, would pass.)
 *   3. A perimeter is "recent" when its last update (finaldate, else initialdate) is within 30 days before the moment the list was fetched.
 *   4. A perimeter belongs to a city when its centre (the area-weighted centre of its outer rings) is within 50 km of the city centre.
 *   5. The value is the sum of the areas, in square kilometres, rounded to 0.1.
 */
const { distanceKm } = require('./geo');

const RECENT_MS = 30 * 86400000;
const NEAR_KM = 50;
const MAX_FEATURES = 20000;
const AREA_RATIO = [0.3, 3];

const num = (v) => (v == null || v === '' ? NaN : Number(v));
function dateMs(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?(Z)?$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const d = new Date(t);
  return Number.isFinite(t) && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2000 && +m[1] <= 2100 ? t : null;
}

// ring: [[lng, lat], ...] -> { lat, lng, km2 }: the centre and the area (square kilometres, flat-earth maths: fine for a fire) of one ring
function ringShape(ring) {
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180), ky = 110.574;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x0 = ring[j][0] * kx, y0 = ring[j][1] * ky, x1 = ring[i][0] * kx, y1 = ring[i][1] * ky;
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) > 1e-9) return { lng: cx / (3 * a) / kx, lat: cy / (3 * a) / ky, km2: Math.abs(a) / 2 };
  return { lng: ring.reduce((s, p) => s + p[0], 0) / ring.length, lat: lat0, km2: 0 };
}

const okPoint = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const okRing = (r) => Array.isArray(r) && r.length >= 4 && r.every(okPoint);

// The outer rings of a Polygon / MultiPolygon, or null.
function outerRings(g) {
  if (!g || !Array.isArray(g.coordinates)) return null;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : null;
  if (!polys || !polys.length || polys.length > 5000) return null;
  const rings = polys.map((pl) => (Array.isArray(pl) ? pl[0] : null));
  return rings.every(okRing) ? rings : null;
}

/* Reads the answer of the WFS request. Returns { areas: [{ lat, lng, ha, t0, t1 }], features, bad } or throws Error with a plain message.
 *   opts.now (ms): a date more than one day in the future makes the feature bad */
function parseBurntAreas(text, opts) {
  const o = opts || {};
  const now = Number.isFinite(o.now) ? o.now : Date.now();
  const body = String(text == null ? '' : text).replace(/^﻿/, '').trim();
  if (!body) throw new Error('the answer is empty');
  if (body[0] === '<') throw new Error('EFFIS answered with an error page (XML), not GeoJSON');
  let j;
  try { j = JSON.parse(body); } catch (e) { throw new Error('the answer is not valid JSON'); }
  if (!j || typeof j !== 'object' || !Array.isArray(j.features)) throw new Error('not a GeoJSON FeatureCollection');
  const out = { areas: [], features: j.features.length, bad: 0 };
  for (const f of j.features.slice(0, MAX_FEATURES)) {
    const p = f && f.properties;
    const rings = f ? outerRings(f.geometry) : null;
    const ha = p ? num(p.area) : NaN;
    const t1 = p ? (dateMs(p.finaldate) || dateMs(p.lastupdate) || dateMs(p.initialdate)) : null;
    const t0 = p ? (dateMs(p.initialdate) || dateMs(p.firedate) || t1) : null;
    if (!rings || !(ha > 0 && ha < 1e6) || t1 == null || t1 > now + 86400000) { out.bad++; continue; }
    const shapes = rings.map(ringShape);
    const km2 = shapes.reduce((s, x) => s + x.km2, 0);
    const ratio = km2 * 100 / ha;   // the outline in hectares over the property
    if (!(km2 > 0) || ratio < AREA_RATIO[0] || ratio > AREA_RATIO[1]) { out.bad++; continue; }
    const lat = shapes.reduce((s, x) => s + x.lat * x.km2, 0) / km2, lng = shapes.reduce((s, x) => s + x.lng * x.km2, 0) / km2;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) { out.bad++; continue; }
    out.areas.push({ lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4, ha: Math.round(ha * 10) / 10, t0: t0 || t1, t1 });
  }
  return out;
}

// What one city sees. place = { lat, lng }; endMs = when the list was fetched.
function summariseCity(areas, place, endMs) {
  let ha = 0, n = 0, newest = 0;
  for (const a of areas || []) {
    if (a.t1 > endMs || a.t1 < endMs - RECENT_MS) continue;
    if (distanceKm(place.lat, place.lng, a.lat, a.lng) > NEAR_KM) continue;
    ha += a.ha; n++; if (a.t1 > newest) newest = a.t1;
  }
  return { km2: Math.round(ha / 10) / 10, n, newest: newest || null };   // hectares -> km2 is /100; rounded to 0.1 km2
}

module.exports = { RECENT_MS, NEAR_KM, AREA_RATIO, parseBurntAreas, summariseCity, dateMs, ringShape };
