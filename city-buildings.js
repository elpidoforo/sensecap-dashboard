'use strict';
/* The city centres in 3D (the page #/city, drawn by /city.html): buildings and streets of the four city centres from OpenStreetMap.
 *
 * GET /api/city/<id>   id: larnaka, lefkosia, limassol, paphos
 *   200 { id, at, box: { s, w, n, e, half }, centre: { lat, lng }, buildings: [[h, src, ring, holes?], ...], roads: [[cls, line, name?, nameEl?], ...],
 *         stats: { buildings, tagged, levels, guessed, roads }, source, licence, mock? }
 *     coordinates are metres from the centre, x to the east and y to the north, rounded to 0.1 m: ring = [x0, y0, x1, y1, ...]
 *     h: height in metres. src: 't' height recorded in OpenStreetMap, 'l' worked out from the number of floors, 'd' not recorded, drawn
 *        at a typical height (the page says which is which)
 *     cls: 'major' (main roads), 'minor' (local streets), 'walk' (pedestrian streets, footways, steps), 'coast' (the coastline, no name)
 *   202 { loading: true }   the first fetch of this city is running; ask again in a few seconds
 *   503 { error }           the fetch failed; it is tried again later
 *   404                     not one of the four cities
 *
 * The data is asked from the Overpass service (a read-only copy of OpenStreetMap) once per city and kept in <DATA_DIR>/city-osm-<id>.json
 * for REFRESH_DAYS, then asked again. One city at a time, a pause between cities, a User-Agent that names the site, as the service asks.
 * With mock: true (OPEN_METEO_MOCK=1, the test mode) nothing is fetched: made-up blocks are returned and marked mock, and the page
 * labels them "Demo buildings". OpenStreetMap data is © OpenStreetMap contributors under the Open Database Licence; the page shows that.
 *
 * Privacy: buildings and streets only. No vehicle, no person, no sensor position.
 *
 * createCityBuildings({ dataDir, mock, fetch, overpassUrl, log, now, wait }) -> { handle(req, res, url), start(), status(), _t }
 */
const fs = require('fs');
const path = require('path');

const CITIES = {   // the middle of each city centre (approximate), with the box drawn around it
  larnaka: { lat: 34.9168, lng: 33.6340, name: ['Larnaka centre', 'Κέντρο Λάρνακας'] },
  lefkosia: { lat: 35.1710, lng: 33.3620, name: ['Lefkosia centre', 'Κέντρο Λευκωσίας'] },
  limassol: { lat: 34.6760, lng: 33.0425, name: ['Limassol centre', 'Κέντρο Λεμεσού'] },
  paphos: { lat: 34.7762, lng: 32.4240, name: ['Paphos centre', 'Κέντρο Πάφου'] },
};
const HALF = 900;                 // metres from the middle to each side of the box (a box of 1.8 km)
const REFRESH_DAYS = 30;
const RETRY_MIN = 10;             // after a failed fetch
const GAP_MS = 8000;              // between two cities
const MAX_BYTES = 40 * 1024 * 1024;
const LEVEL_M = 3.2, DEFAULT_H = 9;
const DAY = 86400000;
const UA = 'Athena-Smart-Cities-Cyprus/1.0 (school data platform; buildings of four city centres, fetched once a month)';
const ROAD = {
  motorway: 'major', trunk: 'major', primary: 'major', secondary: 'major', tertiary: 'major', motorway_link: 'major', trunk_link: 'major', primary_link: 'major', secondary_link: 'major', tertiary_link: 'major',
  residential: 'minor', unclassified: 'minor', living_street: 'minor', service: 'minor', road: 'minor',
  pedestrian: 'walk', footway: 'walk', steps: 'walk', path: 'walk',
};

const r1 = (v) => Math.round(v * 10) / 10;
function boxOf(c) {
  const dLat = HALF / 110574, dLng = HALF / (111320 * Math.cos((c.lat * Math.PI) / 180));
  return { s: +(c.lat - dLat).toFixed(5), n: +(c.lat + dLat).toFixed(5), w: +(c.lng - dLng).toFixed(5), e: +(c.lng + dLng).toFixed(5), half: HALF };
}
function projector(c) {
  const kx = 111320 * Math.cos((c.lat * Math.PI) / 180), ky = 110574;
  return (lat, lng) => [r1((lng - c.lng) * kx), r1((lat - c.lat) * ky)];
}
function queryFor(b) {
  const bb = `${b.s},${b.w},${b.n},${b.e}`;
  return `[out:json][timeout:90];(way["building"](${bb});relation["building"]["type"="multipolygon"](${bb});way["highway"](${bb});way["natural"="coastline"](${bb}););out geom qt;`;
}
// "12", "12 m", "12.5m" -> 12; feet and nonsense -> null
function metres(v) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m|metres|meters)?\s*$/i.exec(String(v == null ? '' : v));
  return m ? Number(m[1].replace(',', '.')) : null;
}
function heightOf(tags) {
  const t = metres(tags.height);
  if (t != null && t >= 2 && t <= 200) return [Math.round(t * 10) / 10, 't'];
  const lv = metres(tags['building:levels']);
  if (lv != null && lv >= 1 && lv <= 60) return [Math.round((lv * LEVEL_M + (tags['roof:levels'] ? Number(tags['roof:levels']) * 2 || 0 : 0)) * 10) / 10, 'l'];
  return [DEFAULT_H, 'd'];
}
const ringOf = (geom, proj) => {
  const out = [];
  (geom || []).forEach((p) => { if (p && isFinite(p.lat) && isFinite(p.lon)) { const [x, y] = proj(p.lat, p.lon); out.push(x, y); } });
  if (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;   // the closing point is implied
  return out.length >= 6 ? out : null;
};
const inBox = (ring, half) => { let sx = 0, sy = 0; const n = ring.length / 2; for (let i = 0; i < ring.length; i += 2) { sx += ring[i]; sy += ring[i + 1]; } return Math.abs(sx / n) <= half && Math.abs(sy / n) <= half; };
// join the outer member ways of a multipolygon into closed rings (members may be split into several ways)
function joinWays(ways) {
  const left = ways.map((w) => w.slice()), rings = [];
  while (left.length) {
    let cur = left.shift();
    let grown = true;
    while (grown && !(cur.length > 2 && cur[0].lat === cur[cur.length - 1].lat && cur[0].lon === cur[cur.length - 1].lon)) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i], a = cur[cur.length - 1], same = (p, q) => p.lat === q.lat && p.lon === q.lon;
        if (same(a, w[0])) { cur = cur.concat(w.slice(1)); } else if (same(a, w[w.length - 1])) { cur = cur.concat(w.slice(0, -1).reverse()); } else continue;
        left.splice(i, 1); grown = true; break;
      }
    }
    rings.push(cur);
  }
  return rings;
}

// The Overpass answer -> the compact shape above. All the geometry work is here (tested on known numbers).
function convert(id, osm, at) {
  const c = CITIES[id], proj = projector(c), b = boxOf(c), buildings = [], roads = [], stats = { buildings: 0, tagged: 0, levels: 0, guessed: 0, roads: 0 };
  const addBuilding = (tags, outer, holes) => {
    if (!outer || !inBox(outer, HALF)) return;
    const [h, src] = heightOf(tags || {});
    const row = [h, src, outer];
    if (holes && holes.length) row.push(holes);
    buildings.push(row);
    stats.buildings++; stats[src === 't' ? 'tagged' : src === 'l' ? 'levels' : 'guessed']++;
  };
  (osm && Array.isArray(osm.elements) ? osm.elements : []).forEach((e) => {
    const tags = e.tags || {};
    if (e.type === 'way' && tags.building && tags.building !== 'no') addBuilding(tags, ringOf(e.geometry, proj));
    else if (e.type === 'relation' && tags.building && Array.isArray(e.members)) {
      const geo = (role) => e.members.filter((m) => m.type === 'way' && m.role === role && Array.isArray(m.geometry) && m.geometry.length > 1).map((m) => m.geometry);
      const holes = joinWays(geo('inner')).map((g) => ringOf(g, proj)).filter(Boolean);
      joinWays(geo('outer')).forEach((g) => addBuilding(tags, ringOf(g, proj), holes));
    } else if (e.type === 'way' && ((tags.highway && ROAD[tags.highway] && tags.area !== 'yes') || tags.natural === 'coastline')) {
      const line = [];
      (e.geometry || []).forEach((p) => { if (p && isFinite(p.lat) && isFinite(p.lon)) { const [x, y] = proj(p.lat, p.lon); line.push(x, y); } });
      if (line.length < 4) return;
      let inside = false; for (let i = 0; i < line.length; i += 2) if (Math.abs(line[i]) <= HALF && Math.abs(line[i + 1]) <= HALF) { inside = true; break; }
      if (!inside) return;
      const row = [tags.natural === 'coastline' ? 'coast' : ROAD[tags.highway], line];
      const name = tags['name:en'] || tags.name || '', nameEl = tags['name:el'] || tags.name || '';
      if (name || nameEl) row.push(String(name).slice(0, 80), String(nameEl).slice(0, 80));
      roads.push(row); if (row[0] !== 'coast') stats.roads++;
    }
  });
  return { id, at, name: c.name, centre: { lat: c.lat, lng: c.lng }, box: b, buildings, roads, stats, source: 'OpenStreetMap (Overpass)', licence: '© OpenStreetMap contributors, ODbL 1.0' };
}

// test mode: made-up blocks along a made-up street grid, the same shape as the real answer
function demo(id, at) {
  const c = CITIES[id], b = boxOf(c), buildings = [], roads = [], stats = { buildings: 0, tagged: 0, levels: 0, guessed: 0, roads: 0 };
  let seed = id.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const step = 120;
  for (let g = -HALF; g <= HALF; g += step) { roads.push(['minor', [g, -HALF, g, HALF]]); roads.push(['minor', [-HALF, g, HALF, g]]); stats.roads += 2; }
  roads.push(['major', [-HALF, -60, HALF, -60], 'Demo avenue', 'Δοκιμαστική λεωφόρος']); roads.push(['walk', [-60, -HALF, -60, HALF], 'Demo walk', 'Δοκιμαστικός πεζόδρομος']); stats.roads += 2;
  for (let bx = -HALF; bx < HALF; bx += step) for (let by = -HALF; by < HALF; by += step) {
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.18) continue;
      const x0 = bx + 12 + (k % 2) * 52, y0 = by + 12 + Math.floor(k / 2) * 52, w = 36 + rnd() * 10, d = 36 + rnd() * 10;
      const near = Math.max(0, 1 - Math.hypot(x0, y0) / 900), src = rnd() < 0.3 ? 't' : rnd() < 0.5 ? 'l' : 'd';
      const h = src === 'd' ? DEFAULT_H : Math.round((6 + near * 40 + rnd() * 14) * 10) / 10;
      buildings.push([h, src, [x0, y0, x0 + w, y0, x0 + w, y0 + d, x0, y0 + d].map(r1)]);
      stats.buildings++; stats[src === 't' ? 'tagged' : src === 'l' ? 'levels' : 'guessed']++;
    }
  }
  return { id, at, name: c.name, centre: { lat: c.lat, lng: c.lng }, box: b, buildings, roads, stats, source: 'demo', licence: 'Demo data, not real buildings', mock: true };
}

function createCityBuildings(o) {
  const dataDir = o.dataDir, mock = !!o.mock, log = o.log || (() => {}), now = o.now || Date.now;
  const doFetch = o.fetch || ((...a) => fetch(...a));
  const url = o.overpassUrl || process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
  const wait = o.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const mem = {}, state = {}, json = new WeakMap();   // state[id] = { running, error, retryAt }
  const file = (id) => path.join(dataDir, 'city-osm-' + id + '.json');
  let queue = Promise.resolve();

  function read(id) {
    if (mem[id]) return mem[id];
    try { const d = JSON.parse(fs.readFileSync(file(id), 'utf8')); if (d && d.id === id && Array.isArray(d.buildings)) { mem[id] = d; return d; } } catch (e) { /* not saved yet */ }
    return null;
  }
  function write(id, d) {
    mem[id] = d;
    try { fs.mkdirSync(dataDir, { recursive: true }); const tmp = file(id) + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, file(id)); } catch (e) { log('city-buildings: could not save ' + id + ': ' + e.message); }
  }
  async function fetchCity(id) {
    const b = boxOf(CITIES[id]);
    const r = await doFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Accept: 'application/json' }, body: 'data=' + encodeURIComponent(queryFor(b)), signal: AbortSignal.timeout(120000), redirect: 'error' });
    if (!r.ok) throw new Error('Overpass answered ' + r.status);
    const len = Number(r.headers && r.headers.get ? r.headers.get('content-length') : 0);
    if (len > MAX_BYTES) throw new Error('answer too large');
    let text;
    if (r.body && typeof r.body.getReader === 'function') {   // count bytes while reading, and stop at the limit
      const reader = r.body.getReader(), parts = []; let n = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > MAX_BYTES) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw new Error('answer too large'); } parts.push(value); }
      text = Buffer.concat(parts.map((v) => Buffer.from(v))).toString('utf8');
    } else { text = await r.text(); if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('answer too large'); }
    const osm = JSON.parse(text);
    if (osm && osm.remark && /runtime error|timed out|out of memory/i.test(osm.remark)) throw new Error('Overpass: ' + String(osm.remark).slice(0, 120));
    return convert(id, osm, now());
  }
  function load(id) {   // queue one fetch of this city; one city at a time
    const st = state[id] || (state[id] = {});
    if (st.running) return;
    st.running = true; st.error = null;
    queue = queue.then(async () => {
      try {
        const d = await fetchCity(id);
        write(id, d); st.retryAt = 0;
        log('city-buildings: ' + id + ' ' + d.stats.buildings + ' buildings, ' + d.stats.roads + ' streets');
      } catch (e) {
        st.error = String(e && e.message || e).slice(0, 200); st.retryAt = now() + RETRY_MIN * 60000;
        if (!mock && !o.noRetryTimer) { const t = setTimeout(() => { if (stale(read(id))) load(id); }, RETRY_MIN * 60000 + 1000); if (t.unref) t.unref(); }   // try again by itself, not only when someone opens the city
        log('city-buildings: ' + id + ' failed: ' + st.error);
      } finally { st.running = false; await wait(GAP_MS); }
    });
  }
  const stale = (d) => !d || now() - d.at > REFRESH_DAYS * DAY;
  function view(id) {
    if (mock) { if (!mem[id]) mem[id] = demo(id, now()); return { code: 200, body: mem[id] }; }
    const d = read(id), st = state[id] || {};
    if (stale(d) && !st.running && (!st.retryAt || now() >= st.retryAt)) load(id);
    if (d) return { code: 200, body: d };
    if ((state[id] || {}).running) return { code: 202, body: { loading: true } };
    return { code: 503, body: { error: 'The buildings of this city could not be fetched from OpenStreetMap right now. It is tried again in a few minutes.' } };
  }
  async function handle(req, res, u) {
    const m = /^\/api\/city\/([a-z]+)$/.exec(u.pathname);
    if (!m || req.method !== 'GET') return false;
    if (!Object.prototype.hasOwnProperty.call(CITIES, m[1])) { res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'Unknown city. Use one of: ' + Object.keys(CITIES).join(', ') + '.' })); return true; }
    const v = view(m[1]);
    res.writeHead(v.code, { 'Content-Type': 'application/json', 'Cache-Control': v.code === 200 ? 'public, max-age=3600' : 'no-store' });
    let out = v.body;
    if (v.code === 200) { if (!json.has(v.body)) json.set(v.body, JSON.stringify(v.body)); out = json.get(v.body); } else out = JSON.stringify(v.body);   // a city is serialised once
    res.end(out);
    return true;
  }
  function start() {   // after the server is up: fetch any city that has nothing saved, or is older than REFRESH_DAYS
    if (mock) return;
    Object.keys(CITIES).forEach((id) => { if (stale(read(id))) load(id); });
  }
  const status = () => Object.keys(CITIES).map((id) => ({ id, saved: !!read(id), at: (read(id) || {}).at || null, running: !!(state[id] || {}).running, error: (state[id] || {}).error || null }));
  return { handle, start, status, _t: { convert, demo, heightOf, metres, boxOf, queryFor, joinWays, idle: () => queue } };
}

module.exports = { createCityBuildings, CITIES };
