const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ID = process.env.SENSECAP_API_ID;
const KEY = process.env.SENSECAP_API_KEY;
const HOST = process.env.SENSECAP_HOST || 'https://sensecap.seeed.cc/openapi';
const PASS = process.env.DASHBOARD_PASSWORD || '';
const PORT = process.env.PORT || 3000;
const DEMO = process.env.DEMO === '1' || !ID || !KEY;

const GPS_LNG = '4197';
const GPS_LAT = '4198';

const FALLBACK_NAMES = {
  4097: ['Air temperature', '°C'],
  4098: ['Air humidity', '%RH'],
  4099: ['Light intensity', 'Lux'],
  4100: ['CO2', 'ppm'],
  4101: ['Barometric pressure', 'Pa'],
  4197: ['Longitude', '°'],
  4198: ['Latitude', '°'],
};
let measurementNames = { ...FALLBACK_NAMES };

const { createCache } = require('./cache');
const { createPrivacy, GPS_MIDS } = require('./privacy');
const priv = createPrivacy();
const { createFeeds, createArchive } = require('./feeds');
const { createQcWatch } = require('./qcwatch');   // quality checks on the sensors' series: an extra `qc` field, never an alert

// Every cache is bounded. `cached` holds the fixed keys (devices, weather, Met Office pages...). The keys that come from a
// request have their own caches with a small cap each, so odd query strings cannot make the memory grow.
const cachedStore = createCache({ max: 100, staleMs: 30 * 60000 });
const cached = cachedStore.get;   // when a refresh fails, the last good answer (up to 30 min old) is served
const seriesCache = createCache({ max: 200, staleMs: 6 * 3600000 });
const trailCache = createCache({ max: 60, staleMs: 30 * 60000 });                  // a trail answer is large, so fewer of them
const imageCache = createCache({ max: 100, maxBytes: 60e6, sizeOf: (v) => v.buf.length });
const publicViews = createCache({ max: 200 });                // answers for visitors, see "who sees what" below

/* A feed a teacher has switched off makes no calls. Its endpoints still serve what the caches hold, however old (a time to live of
 * Infinity), and answer 503 'switched off by a teacher' when the cache has nothing. `getFrom` is the get of one of the caches above. */
function viaFeed(feed, getFrom, key, ttl, fn) {
  if (feeds.enabled(feed)) return getFrom(key, ttl, fn);
  return getFrom(key, Infinity, async () => { throw feeds.off(feed); });
}

const whole = (v, dflt, min, max) => Math.min(max, Math.max(min, Math.round(Number(v) || dflt)));   // hours and days are whole numbers

/* The SenseCAP API answers with a web page instead of data when it is asked too often (about ten calls in a second were
 * enough). So every call goes through a gate: at most UP_PARALLEL at the same time, UP_GAP_MS apart, and after a bad answer
 * all calls wait UP_COOL_MS before the next try. The caches serve the last good answer in the meantime. */
const UP_PARALLEL = Number(process.env.SENSECAP_PARALLEL) || 3;
const UP_GAP_MS = Number(process.env.SENSECAP_GAP_MS) || 250;
const UP_COOL_MS = Number(process.env.SENSECAP_COOL_MS) || 45000;
const UP_GAP_MAX = 2000;
const upstream = { active: 0, queue: [], lastStart: 0, coolUntil: 0, gap: UP_GAP_MS, good: 0 };
/* How fast SenseCAP lets us ask is not published. So the gap between calls adapts: a "busy" answer doubles it (up to 2 s)
 * and every 60 good answers in a row bring it back a quarter of the way to UP_GAP_MS. */
function upstreamBad() {
  upstream.good = 0;
  const g = Math.min(UP_GAP_MAX, Math.max(UP_GAP_MS * 2, upstream.gap * 2));
  if (g !== upstream.gap) { upstream.gap = g; console.log(`SenseCAP said busy: calls are now ${g} ms apart`); }
}
function upstreamGood() {
  if (++upstream.good >= 60 && upstream.gap > UP_GAP_MS) {
    upstream.good = 0;
    upstream.gap = Math.max(UP_GAP_MS, Math.round(upstream.gap * 0.75));
    console.log(`SenseCAP is answering well: calls are now ${upstream.gap} ms apart`);
  }
}

function upstreamNext() {
  while (upstream.active < UP_PARALLEL && upstream.queue.length) {
    const wait = upstream.lastStart + upstream.gap - Date.now();
    if (wait > 0) { setTimeout(upstreamNext, wait).unref(); return; }
    upstream.active++;
    upstream.lastStart = Date.now();
    upstream.queue.shift()();
  }
}
function upstreamSlot() {
  return new Promise((resolve) => { upstream.queue.push(resolve); upstreamNext(); });
}
function upstreamDone() { upstream.active--; upstreamNext(); }

async function api(endpoint, { method = 'GET', query = {}, body } = {}) {
  feeds.guard('sensecap');                                   // a teacher can switch the feed off: no call is made then
  if (Date.now() < upstream.coolUntil) throw new Error(`SenseCAP is busy, waiting ${Math.ceil((upstream.coolUntil - Date.now()) / 1000)} s before asking again`);
  const url = new URL(HOST + endpoint);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  await upstreamSlot();
  try {
    if (Date.now() < upstream.coolUntil) throw new Error('SenseCAP is busy, waiting before asking again');
    feeds.guard('sensecap');
    // Only a call that was really sent is counted for the feed list; waiting at the gate above is not an answer from SenseCAP.
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${ID}:${KEY}`).toString('base64'),
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* a web page, not data */ }
      if (!res.ok || json === null) {
        if (res.status === 429 || res.status >= 500 || json === null) { upstream.coolUntil = Date.now() + UP_COOL_MS; upstreamBad(); }
        // what SenseCAP said, without tags, so the Feeds page shows the real reason
        const said = json === null ? text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) : '';
        throw new Error(`SenseCAP ${endpoint} returned ${json === null ? 'a web page instead of data' : 'HTTP ' + res.status} (HTTP ${res.status})${said ? ': "' + said + '"' : ''}`);
      }
      if (String(json.code) !== '0') throw new Error(`SenseCAP ${endpoint} error code ${json.code}: ${json.message || ''}`);
      feeds.record('sensecap', true);
      upstreamGood();
      return json.data;
    } catch (e) {
      feeds.record('sensecap', false, e);
      throw e;
    }
  } finally {
    upstreamDone();
  }
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]);
      } catch (e) {
        results[i] = { error: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function loadMeasurementNames() {
  try {
    const res = await fetch('https://sensecap-statics.seeed.cn/refer/def/sensor.json');
    const json = await res.json();
    const en = json.en && json.en.measurementId;
    if (en) measurementNames = { ...FALLBACK_NAMES, ...en };
  } catch (e) {
    console.warn('Could not load measurement names, using fallback list');
  }
}

function fixLatLng(lat, lng) {
  lat = Number(lat);
  lng = Number(lng);
  if (!isFinite(lat) || !isFinite(lng)) return [null, null];
  if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) return [lng, lat];
  return [lat, lng];
}

/* ---------- live data ---------- */

// A failed optional call becomes an empty list, unless the API is busy: then the whole refresh fails and the cache serves the last good answer.
const softFail = (e) => { if (feeds.isOff(e) || Date.now() < upstream.coolUntil) throw e; return []; };

let lastDevices = null;   // counts only (never a position): how many vehicles the last answer had and how many were online
async function liveDevices() {
  return viaFeed('sensecap', cached, 'devices', sensecapStream.restTtl(60000, 'devices'), async () => {   // longer only while the live stream is healthy
    const groups = await api('/list_groups').catch(softFail);
    const all = await api('/list_devices', { query: { device_type: 2 } });
    const groupOf = {};
    for (const g of groups) {
      if (!g.group_uuid) continue;
      const inGroup = await api('/list_devices', { query: { device_type: 2, group_uuid: g.group_uuid } }).catch(softFail);
      for (const d of inGroup) groupOf[d.device_eui] = g.group_name;
    }
    const euis = all.map((d) => d.device_eui);
    const details = {};
    const status = {};
    const channels = {};
    for (const part of chunk(euis, 50)) {
      const [det, st, ch] = await Promise.all([
        api('/view_devices', { method: 'POST', body: { device_euis: part, device_type: 2 } }).catch(softFail),
        api('/view_device_running_status', { method: 'POST', body: { device_euis: part } }).catch(softFail),
        api('/list_device_channels', { method: 'POST', body: { device_euis: part } }).catch(softFail),
      ]);
      det.forEach((d) => (details[d.device_eui] = d));
      st.forEach((d) => (status[d.device_eui] = d));
      ch.forEach((d) => (channels[d.device_eui] = d.channels || []));
    }
    const out = all.map((d) => {
      const det = details[d.device_eui] || {};
      const st = status[d.device_eui] || {};
      const pos = det.position || {};
      const [lat, lng] = fixLatLng(pos.latitude, pos.longitude);
      const measurements = [];
      const chanMap = {};
      for (const c of channels[d.device_eui] || []) {
        for (const m of c.measurement_ids || []) {
          if (!measurements.includes(String(m))) measurements.push(String(m));
          chanMap[String(m)] = c.channel_index;
        }
      }
      return {
        eui: d.device_eui,
        name: d.device_name,
        group: groupOf[d.device_eui] || 'Default',
        lat,
        lng,
        online: st.online_status === 1,
        battery: st.battery_digit ?? null,
        lastSeen: st.latest_message_time || null,
        measurements,
        channelOf: chanMap,
      };
    });
    lastDevices = { at: Date.now(), total: out.length, online: out.filter((d) => d.online).length };
    return out;
  });
}

async function liveLatest() {
  return viaFeed('sensecap', cached, 'latest', sensecapStream.restTtl(60000, 'latest'), async () => {   // the slow safety poll while the live stream is healthy
    const devices = await liveDevices();
    const rows = await mapLimit(devices, 5, async (d) => {
      const data = await api('/view_latest_telemetry_data', { query: { device_eui: d.eui } });
      const values = {};
      for (const ch of data || []) {
        for (const p of ch.points || []) {
          values[String(p.measurement_id)] = { v: p.measurement_value, t: p.time, ch: ch.channel_index };
        }
      }
      return [d.eui, values];
    });
    if (rows.some((r) => r && r.error) && Date.now() < upstream.coolUntil) throw new Error('SenseCAP is busy; keeping the last readings');
    const out = {};
    for (const r of rows) if (Array.isArray(r)) out[r[0]] = r[1];
    return out;
  });
}

async function liveSeries(eui, mid, channel, days) {
  return viaFeed('sensecap', seriesCache.get, `series:${eui}:${mid}:${channel}:${days}`, 120000, async () => {
    const end = Date.now();
    const start = end - days * 86400000;
    const interval = Math.max(10, Math.round((days * 24 * 60) / 240));
    const data = await api('/aggregate_chart_points', {
      query: { device_eui: eui, measurement_id: mid, channel_index: channel, interval, time_start: start, time_end: end },
    });
    const points = [];
    for (const ch of data || []) {
      for (const p of ch.lists || []) {
        if (String(p.measurement_id) === String(mid)) points.push({ t: p.time, v: p.average_value });
      }
    }
    return points;
  });
}

/* ---------- GPS trails (raw history of latitude and longitude, with a measurement along the route) ---------- */

const toMs = (t) => {
  if (typeof t === 'number') return t < 1e12 ? t * 1000 : t;
  const str = String(t).trim();
  if (/^\d+(\.\d+)?$/.test(str)) { const n = Number(str); return n < 1e12 ? n * 1000 : n; }
  const ms = Date.parse(str);
  return isFinite(ms) ? ms : null;
};

// list_telemetry_data answers { list: [ [[channel, measurement_id], ...], [ [[value, time], ...], ... ] ] }
function parseRawSeries(data, mid) {
  const list = data && data.list;
  if (!Array.isArray(list) || list.length < 2) return [];
  const heads = list[0], series = list[1];
  const out = [];
  const take = (rows) => {
    for (const row of rows || []) {
      const v = Number(Array.isArray(row) ? row[0] : row && row.value);
      const t = toMs(Array.isArray(row) ? row[1] : row && row.time);
      if (isFinite(v) && t != null) out.push({ t, v });
    }
  };
  if (Array.isArray(heads) && Array.isArray(series)) {
    heads.forEach((h, i) => { if (heads.length === 1 || (Array.isArray(h) && String(h[1]) === String(mid))) take(series[i]); });
    if (!out.length && series.length && Array.isArray(series[0]) && !Array.isArray(series[0][0])) take(series);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function rawSeries(eui, mid, channel, hours) {
  const end = Date.now(), start = end - hours * 3600000;
  const slices = Math.min(7, Math.max(1, Math.ceil(hours / 24)));
  const span = (end - start) / slices;
  const parts = [];
  for (let i = 0; i < slices; i++) {
    const data = await api('/list_telemetry_data', {
      query: { device_eui: eui, measurement_id: mid, channel_index: channel, time_start: Math.round(start + i * span), time_end: Math.round(start + (i + 1) * span), limit: 1000 },
    });
    parts.push(...parseRawSeries(data, mid));
  }
  parts.sort((a, b) => a.t - b.t);
  return parts.filter((p, i) => i === 0 || p.t !== parts[i - 1].t);
}

function nearestIn(list, t, tol, from) {
  // list is sorted by time; returns [item, index] closest to t within tol
  let i = from || 0;
  while (i + 1 < list.length && Math.abs(list[i + 1].t - t) <= Math.abs(list[i].t - t)) i++;
  return list[i] && Math.abs(list[i].t - t) <= tol ? [list[i], i] : [null, i];
}

function pairTrack(lats, lngs, vals) {
  const out = [];
  let j = 0, k = 0;
  for (const la of lats) {
    const [lo, nj] = nearestIn(lngs, la.t, 90000, j);
    j = nj;
    if (!lo) continue;
    const [lat, lng] = fixLatLng(la.v, lo.v);
    if (lat == null || (lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const [va, nk] = vals.length ? nearestIn(vals, la.t, 20 * 60000, k) : [null, k];
    k = nk;
    out.push([la.t, Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, va ? Math.round(va.v * 100) / 100 : null]);
  }
  return out;
}

async function liveTrail(dev, hours, mid) {
  const latCh = dev.channelOf[GPS_LAT] || 1, lngCh = dev.channelOf[GPS_LNG] || 1;
  const lats = await rawSeries(dev.eui, GPS_LAT, latCh, hours);
  const lngs = await rawSeries(dev.eui, GPS_LNG, lngCh, hours);
  const wantValue = mid && mid !== GPS_LAT && mid !== GPS_LNG && dev.measurements.includes(String(mid));
  const vals = wantValue ? await rawSeries(dev.eui, String(mid), dev.channelOf[String(mid)] || 1, hours) : [];
  const pts = pairTrack(lats, lngs, vals);
  const step = Math.ceil(pts.length / 1500); // keep long windows small
  return { points: step > 1 ? pts.filter((_, i) => i % step === 0 || i === pts.length - 1) : pts };
}

async function liveTrails(hours, mid) {
  return viaFeed('sensecap', trailCache.get, `trails:${hours}:${mid}`, hours <= 6 ? 240000 : 900000, async () => {
    const devices = await liveDevices();
    const rows = await mapLimit(devices, 3, (d) => liveTrail(d, hours, mid));
    return assembleTrails(devices, rows, hours, mid);
  });
}

function assembleTrails(devices, rows, hours, mid) {
  const trails = {}, notes = {};
  devices.forEach((d, i) => {
    const r = rows[i] || {};
    if (r.error) notes[d.eui] = r.error;
    else {
      trails[d.eui] = r.points;
      if (!r.points.length) notes[d.eui] = 'no GPS points in this window';
    }
  });
  return { hours, mid, trails, notes, updated: new Date().toISOString() };
}

/* ---------- demo data ---------- */

const DEMO_DEVICES = [
  ['PASCAL Larnaka bus 1', 'PASCAL Larnaka', 34.9217, 33.6232],
  ['PASCAL Larnaka car 1', 'PASCAL Larnaka', 34.9005, 33.6101],
  ['PASCAL Lefkosia bus 1', 'PASCAL Lefkosia', 35.1856, 33.3823],
  ['PASCAL Lefkosia car 1', 'PASCAL Lefkosia', 35.1701, 33.3611],
  ['PASCAL Limassol bus 1', 'PASCAL Limassol', 34.6841, 33.0379],
  ['PASCAL Limassol car 1', 'PASCAL Limassol', 34.7021, 33.0212],
  ['International School of Paphos bus 1', 'International School of Paphos', 34.7754, 32.4245],
  ['International School of Paphos car 1', 'International School of Paphos', 34.7612, 32.4401],
].map(([name, group, lat, lng], i) => ({
  eui: 'DEMO' + String(i + 1).padStart(12, '0'),
  name,
  group,
  lat,
  lng,
  online: i !== 5,
  battery: [84, 77, 91, 62, 55, 12, 70, 88][i],
  lastSeen: new Date(Date.now() - (i === 5 ? 3 * 3600000 : (i + 1) * 90000)).toISOString(),
  measurements: ['4097', '4098', '4100', GPS_LAT, GPS_LNG],
  channelOf: { 4097: 1, 4098: 1, 4100: 2, [GPS_LAT]: 3, [GPS_LNG]: 3 },
}));

function seeded(n) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}
function demoValue(i, mid, t) {
  const hour = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
  const wave = Math.sin(((hour - 9) / 24) * Math.PI * 2);
  const noise = (seeded(i * 1000 + Math.floor(t / 600000)) - 0.5);
  if (mid === '4097') return +(24 + i * 0.4 + wave * 5 + noise * 1.2).toFixed(1);
  if (mid === '4098') return +(55 - wave * 15 + noise * 4).toFixed(1);
  return Math.round(420 + i * 8 + (1 - wave) * 40 + noise * 25);
}

// Demo vehicles drive loops around their school so trails and movement can be seen without real GPS.
function demoPos(i, ms) {
  const d = DEMO_DEVICES[i];
  const t = d.online ? ms : Math.min(ms, Date.now() - 3 * 3600000);
  const a = (t / ((i % 2 === 0 ? 38 : 24) * 60000)) * Math.PI * 2 + i;
  const r = i % 2 === 0 ? 0.035 : 0.02;
  return [d.lat + r * 0.8 * Math.sin(a) + r * 0.25 * Math.sin(a * 3), d.lng + r * 1.25 * Math.cos(a) + r * 0.2 * Math.cos(a * 2)];
}

function demoTrails(hours, mid) {
  const now = Date.now();
  const step = Math.max(60000, (hours * 3600000) / 300);
  const rows = DEMO_DEVICES.map((d, i) => {
    const end = d.online ? now : now - 3 * 3600000;
    const points = [];
    for (let t = now - hours * 3600000; t <= end; t += step) {
      if (i === 1 && t > now - 70 * 60000 && t < now - 55 * 60000) continue; // a signal gap, drawn dashed
      const [lat, lng] = demoPos(i, t);
      points.push([t, Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, mid && mid !== GPS_LAT && mid !== GPS_LNG ? demoValue(i, String(mid), t) : null]);
    }
    return { points };
  });
  return assembleTrails(DEMO_DEVICES, rows, hours, mid);
}

function demoLatest() {
  const out = {};
  DEMO_DEVICES.forEach((d, i) => {
    const t = d.online ? Date.now() : Date.now() - 3 * 3600000;
    out[d.eui] = {};
    d.measurements.forEach((m) => { if (m !== GPS_LAT && m !== GPS_LNG) out[d.eui][m] = { v: demoValue(i, m, t), t: new Date(t).toISOString(), ch: d.channelOf[m] }; });
    const pos = demoPos(i, t);
    out[d.eui][GPS_LAT] = { v: pos[0], t: new Date(t).toISOString(), ch: d.channelOf[GPS_LAT] };
    out[d.eui][GPS_LNG] = { v: pos[1], t: new Date(t).toISOString(), ch: d.channelOf[GPS_LNG] };
  });
  return out;
}

function demoSeries(eui, mid, days) {
  const i = DEMO_DEVICES.findIndex((d) => d.eui === eui);
  const points = [];
  const end = Date.now();
  const step = Math.max(600000, (days * 86400000) / 240);
  for (let t = end - days * 86400000; t <= end; t += step) {
    points.push({ t: new Date(t).toISOString(), v: demoValue(Math.max(i, 0), mid, t) });
  }
  return points;
}

/* ---------- terrain and weather (Open-Meteo: free, no key, non-commercial use) ---------- */

const MOCK = process.env.OPEN_METEO_MOCK === '1';
// The addresses of the free weather services. The variables only exist so a test can point them at a fake service.
const OM_BASE = (process.env.OPEN_METEO_BASE || 'https://api.open-meteo.com').replace(/\/$/, '');
const OM_AIR_BASE = (process.env.OPEN_METEO_AIR_BASE || 'https://air-quality-api.open-meteo.com').replace(/\/$/, '');
const OM_MARINE_BASE = (process.env.OPEN_METEO_MARINE_BASE || 'https://marine-api.open-meteo.com').replace(/\/$/, '');
const SC_BASE = (process.env.SENSOR_COMMUNITY_BASE || 'https://data.sensor.community').replace(/\/$/, '');
const METAR_BASE = (process.env.METAR_BASE || 'https://aviationweather.gov').replace(/\/$/, '');
const B = { lat0: 34.5, lat1: 35.75, lng0: 32.2, lng1: 34.7, step: 0.04 };
const WG = { lat0: 34.5, latStep: 0.25, rows: 6, lng0: 32.3, lngStep: 0.25, cols: 10 };
const SEA_POINTS = [
  [34.4, 32.6], [34.4, 33.2], [34.4, 33.8], [34.7, 34.4], [35.1, 34.5],
  [35.65, 33.0], [35.6, 33.6], [35.3, 32.2], [34.8, 32.1], [35.1, 32.0],
];

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const omLog = [];
async function omBudget(n) {
  for (;;) {
    const now = Date.now();
    while (omLog.length && now - omLog[0][0] > 60000) omLog.shift();
    const used = omLog.reduce((a, x) => a + x[1], 0);
    if (used + n <= 450) {
      omLog.push([now, n]);
      return;
    }
    await sleep(2000);
  }
}

const omJson = (url, locations = 1) => feeds.track('openmeteo', () => omJsonRetry(url, locations));   // one logical request, counted once
async function omJsonRetry(url, locations) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    await omBudget(locations);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
      lastErr = new Error(`Open-Meteo returned HTTP ${r.status}`);
      lastErr.status = r.status;
      if (r.status === 429) {
        omLog.push([Date.now(), 600]);
        await sleep(65000);
      } else if (r.status >= 500) {
        await sleep(3000 * 2 ** attempt);
      } else {
        throw lastErr;
      }
    } catch (e) {
      if (e === lastErr && lastErr.status && lastErr.status < 500 && lastErr.status !== 429) throw e;
      lastErr = e;
      if (!e.status) await sleep(3000);
    }
  }
  throw lastErr;
}
const asArray = (j) => (Array.isArray(j) ? j : [j]);
const r2 = (n) => Math.round(n * 100) / 100;

function weatherGridPoints() {
  const pts = [];
  for (let r = 0; r < WG.rows; r++) {
    for (let c = 0; c < WG.cols; c++) pts.push({ lat: r2(WG.lat0 + r * WG.latStep), lng: r2(WG.lng0 + c * WG.lngStep) });
  }
  return pts;
}

function mockLand(lat, lng) {
  const a = ((lat - 35.0) / 0.4) ** 2 + ((lng - 33.2) / 1.0) ** 2 < 1;
  const karpas = lat > 35.25 && lat < 35.65 && lng > 33.7 && lng < 34.55 && Math.abs(lat - (35.3 + (lng - 33.7) * 0.28)) < 0.12;
  return a || karpas;
}
function mockElevation(lat, lng) {
  if (!mockLand(lat, lng)) return 0;
  const tro = 1950 * Math.exp(-(((lat - 34.93) / 0.2) ** 2 + ((lng - 32.87) / 0.3) ** 2));
  const kyr = 950 * Math.exp(-(((lat - 35.3) / 0.07) ** 2 + ((lng - 33.3) / 0.7) ** 2));
  return 5 + tro + kyr;
}

const TERRAIN_STEP = 0.05;
const T = { done: null, elev: null, next: 0, running: false, error: null, retryAt: 0, lats: [], lngs: [], rows: 0, cols: 0 };

const TERRAIN_FILE = path.join(os.tmpdir(), 'cyprus-terrain-v2.json');
function saveTerrainProgress() {
  try {
    fs.writeFileSync(TERRAIN_FILE, JSON.stringify({ next: T.next, elev: T.elev }));
  } catch (e) { /* best effort */ }
}

function prepareTerrain() {
  T.rows = Math.round((B.lat1 - B.lat0) / TERRAIN_STEP) + 1;
  T.cols = Math.round((B.lng1 - B.lng0) / TERRAIN_STEP) + 1;
  T.lats = [];
  T.lngs = [];
  for (let r = 0; r < T.rows; r++) {
    for (let c = 0; c < T.cols; c++) {
      T.lats.push(r2(B.lat0 + r * TERRAIN_STEP));
      T.lngs.push(r2(B.lng0 + c * TERRAIN_STEP));
    }
  }
  T.elev = new Array(T.rows * T.cols).fill(0);
  T.next = 0;
  try {
    const saved = JSON.parse(fs.readFileSync(TERRAIN_FILE, 'utf8'));
    if (Array.isArray(saved.elev) && saved.elev.length === T.elev.length) {
      T.elev = saved.elev;
      T.next = saved.next || 0;
    }
  } catch (e) { /* nothing saved yet */ }
}

async function terrainJob() {
  T.running = true;
  T.error = null;
  try {
    while (T.next < T.lats.length) {
      const i = T.next;
      const j = await omJson(
        `${OM_BASE}/v1/elevation?latitude=${T.lats.slice(i, i + 100).join(',')}&longitude=${T.lngs.slice(i, i + 100).join(',')}`,
        Math.min(100, T.lats.length - i)
      );
      (j.elevation || []).forEach((v, k) => {
        const n = Number(v);
        T.elev[i + k] = isFinite(n) && n > 0 ? n : 0;
      });
      T.next = i + 100;
      saveTerrainProgress();
    }
    saveTerrainProgress();
    T.done = {
      rows: T.rows, cols: T.cols, lat0: B.lat0, lat1: B.lat1, lng0: B.lng0, lng1: B.lng1,
      elev: T.elev.map((v) => Math.round(v)), mock: false,
    };
  } catch (e) {
    T.error = e.message;
    T.retryAt = Date.now() + 30000;
    console.warn('Terrain download paused:', e.message);
  } finally {
    T.running = false;
  }
}

function terrainStatus() {
  if (MOCK) {
    const rows = Math.round((B.lat1 - B.lat0) / TERRAIN_STEP) + 1;
    const cols = Math.round((B.lng1 - B.lng0) / TERRAIN_STEP) + 1;
    const elev = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) elev.push(Math.round(mockElevation(B.lat0 + r * TERRAIN_STEP, B.lng0 + c * TERRAIN_STEP)));
    }
    return { ready: true, data: { rows, cols, lat0: B.lat0, lat1: B.lat1, lng0: B.lng0, lng1: B.lng1, elev, mock: true } };
  }
  if (T.done) return { ready: true, data: T.done };
  if (!T.elev) {
    prepareTerrain();
    if (T.next >= T.lats.length) {
      T.done = { rows: T.rows, cols: T.cols, lat0: B.lat0, lat1: B.lat1, lng0: B.lng0, lng1: B.lng1, elev: T.elev.map((v) => Math.round(v)), mock: false };
      return { ready: true, data: T.done };
    }
  }
  if (!T.running && Date.now() >= T.retryAt) terrainJob();
  return { ready: false, progress: Math.min(1, T.next / T.lats.length), error: T.error };
}

function mockWeather(p, i) {
  const t = 24 + Math.sin(i) * 2 - Math.max(0, mockElevation(p.lat, p.lng)) / 150 + (Date.now() % 600000) / 600000;
  return {
    t, rh: 50 + Math.cos(i) * 15, ws: 4 + (i % 5), wd: 250 + (i % 7) * 10,
    rain: i % 11 === 0 ? 0.6 : 0, cloud: (i * 13) % 100, p: 1012,
  };
}

function weather() {
  return viaFeed('openmeteo', cached, 'weather', 600000, async () => {
    const pts = weatherGridPoints();
    let points;
    if (MOCK) {
      points = pts.map((p, i) => ({ ...p, ...mockWeather(p, i) }));
    } else {
      const j = await omJson(
        OM_BASE + '/v1/forecast?latitude=' + pts.map((p) => p.lat).join(',') +
        '&longitude=' + pts.map((p) => p.lng).join(',') +
        '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,pressure_msl' +
        '&wind_speed_unit=ms&timezone=UTC',
        pts.length
      );
      points = asArray(j).map((o, i) => ({
        ...pts[i], t: o.current.temperature_2m, rh: o.current.relative_humidity_2m, ws: o.current.wind_speed_10m,
        wd: o.current.wind_direction_10m, rain: o.current.precipitation, cloud: o.current.cloud_cover, p: o.current.pressure_msl,
      }));
    }
    return { ...WG, points, updated: new Date().toISOString(), mock: MOCK };
  });
}

/* Five-day forecast for central Cyprus from the Open-Meteo model. The Department itself publishes its forecast only as
 * pictures, so the weather page shows these day cards and keeps the Department's tables one click away. */
const FORECAST_POINT = { lat: 35.0, lng: 33.2, place: 'Central Cyprus' };
function forecast() {
  return viaFeed('openmeteo', cached, 'forecast', 1800000, async () => {
    let days;
    if (MOCK) {
      const base = Date.now();
      days = [0, 1, 2, 3, 4].map((i) => ({
        date: new Date(base + i * 86400000).toISOString().slice(0, 10),
        tmax: 27 - i + (i % 2), tmin: 17 - (i % 3), code: [0, 1, 2, 3, 61][i], wind: 3 + (i % 3), windDir: 250 + i * 12,
      }));
    } else {
      const j = await omJson(
        OM_BASE + '/v1/forecast?latitude=' + FORECAST_POINT.lat + '&longitude=' + FORECAST_POINT.lng +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant' +
        '&wind_speed_unit=ms&timezone=Asia%2FNicosia&forecast_days=5'
      );
      const d = j && j.daily;
      if (!d || !Array.isArray(d.time)) throw new Error('Open-Meteo sent no daily forecast');
      days = d.time.map((date, i) => ({
        date, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], code: d.weather_code[i],
        wind: d.wind_speed_10m_max[i], windDir: d.wind_direction_10m_dominant[i],
      })).filter((x) => isFinite(x.tmax) && isFinite(x.tmin));
    }
    return { source: 'Open-Meteo', place: FORECAST_POINT.place, days, updated: new Date().toISOString(), mock: MOCK };
  });
}

function air() {
  return viaFeed('openmeteo', cached, 'air', 1800000, async () => {
    const pts = weatherGridPoints();
    let points;
    if (MOCK) {
      points = pts.map((p, i) => ({ ...p, pm25: 6 + (i % 9) * 2, pm10: 15 + (i % 7) * 4, dust: 10 + (i % 13) * 8, ozone: 70 }));
    } else {
      const j = await omJson(
        OM_AIR_BASE + '/v1/air-quality?latitude=' + pts.map((p) => p.lat).join(',') +
        '&longitude=' + pts.map((p) => p.lng).join(',') + '&current=pm2_5,pm10,dust,ozone&timezone=UTC',
        pts.length
      );
      points = asArray(j).map((o, i) => ({
        ...pts[i], pm25: o.current.pm2_5, pm10: o.current.pm10, dust: o.current.dust, ozone: o.current.ozone,
      }));
    }
    return { ...WG, points, updated: new Date().toISOString(), mock: MOCK };
  });
}

function sea() {
  return viaFeed('openmeteo', cached, 'sea', 1800000, async () => {
    let points;
    if (MOCK) {
      points = SEA_POINTS.map(([lat, lng], i) => ({ lat, lng, wave: 0.4 + (i % 4) * 0.5, sst: 24 + (i % 5) * 0.4 }));
    } else {
      const j = await omJson(
        OM_MARINE_BASE + '/v1/marine?latitude=' + SEA_POINTS.map((p) => p[0]).join(',') +
        '&longitude=' + SEA_POINTS.map((p) => p[1]).join(',') + '&current=wave_height,sea_surface_temperature&timezone=UTC',
        SEA_POINTS.length
      );
      points = asArray(j).map((o, i) => ({
        lat: SEA_POINTS[i][0], lng: SEA_POINTS[i][1], wave: o.current.wave_height, sst: o.current.sea_surface_temperature,
      }));
    }
    return { points, updated: new Date().toISOString(), mock: MOCK };
  });
}

/* ---------- open data: Sensor.Community and airport weather (METAR) ---------- */

const OPEN_BOUNDS = { lat0: 34.4, lat1: 35.9, lng0: 31.9, lng1: 34.9 };

function openSensors() {
  return viaFeed('sensorcommunity', cached, 'opensensors', 300000, async () => {
    if (MOCK) {
      return { points: [
        { id: 'm1', lat: 34.92, lng: 33.62, pm25: 9.1, pm10: 18.4, temp: 28.1, hum: 52, time: new Date().toISOString() },
        { id: 'm2', lat: 34.68, lng: 33.04, pm25: 12.5, pm10: 24, temp: 27.2, hum: 58, time: new Date().toISOString() },
      ], updated: new Date().toISOString() };
    }
    const rows = await feeds.track('sensorcommunity', async () => {
      const r = await fetch(SC_BASE + '/airrohr/v1/filter/area=35.0,33.25,150', { signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(`Sensor.Community returned HTTP ${r.status}`);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error('Sensor.Community did not send a list of sensors');
      return j;
    });
    const byLoc = new Map();
    for (const e of rows) {
      const loc = e.location || {};
      const lat = Number(loc.latitude), lng = Number(loc.longitude);
      if (!isFinite(lat) || !isFinite(lng)) continue;
      if (lat < OPEN_BOUNDS.lat0 || lat > OPEN_BOUNDS.lat1 || lng < OPEN_BOUNDS.lng0 || lng > OPEN_BOUNDS.lng1) continue;
      const p = byLoc.get(loc.id) || { id: String(loc.id), lat, lng, pm25: null, pm10: null, temp: null, hum: null, time: e.timestamp };
      for (const v of e.sensordatavalues || []) {
        const n = Number(v.value);
        if (!isFinite(n)) continue;
        // volunteer sensors sometimes report garbage, so keep only plausible values
        if (v.value_type === 'P2' && n >= 0 && n <= 1000) p.pm25 = n;
        else if (v.value_type === 'P1' && n >= 0 && n <= 2000) p.pm10 = n;
        else if (v.value_type === 'temperature' && n > -30 && n < 60) p.temp = n;
        else if (v.value_type === 'humidity' && n >= 0 && n <= 100) p.hum = n;
      }
      byLoc.set(loc.id, p);
    }
    return { points: [...byLoc.values()], updated: new Date().toISOString() };
  });
}

const AIRPORTS = { LCLK: 'Larnaca airport', LCPH: 'Paphos airport', LCEN: 'Ercan airport', LCRA: 'Akrotiri air base' };
function metar() {
  return viaFeed('metar', cached, 'metar', 600000, async () => {
    if (MOCK) {
      return { points: [{ id: 'LCLK', name: 'Larnaca airport', lat: 34.88, lng: 33.62, temp: 29, ws: 4.1, wd: 250, time: new Date().toISOString() }], updated: new Date().toISOString() };
    }
    const rows = await feeds.track('metar', async () => {
      const r = await fetch(`${METAR_BASE}/api/data/metar?ids=${Object.keys(AIRPORTS).join(',')}&format=json`, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(`Airport weather returned HTTP ${r.status}`);
      return r.json();
    });
    const points = (Array.isArray(rows) ? rows : []).filter((m) => isFinite(Number(m.lat)) && isFinite(Number(m.lon))).map((m) => ({
      id: m.icaoId, name: AIRPORTS[m.icaoId] || m.icaoId, lat: Number(m.lat), lng: Number(m.lon),
      temp: m.temp == null ? null : Number(m.temp),
      ws: m.wspd == null ? null : Math.round(Number(m.wspd) * 0.5144 * 10) / 10,
      wd: typeof m.wdir === 'number' ? m.wdir : null,
      time: m.obsTime ? new Date(Number(m.obsTime) * 1000).toISOString() : null,
    }));
    return { points, updated: new Date().toISOString() };
  });
}

/* ---------- Cyprus Department of Meteorology automatic stations (official open data) ---------- */

const CYDOM_URL = process.env.CYDOM_URL || 'https://www.dom.org.cy/AWS/OpenData/CyDoM.xml';
const xmlText = (s) => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
const xmlTag = (block, name) => {
  const m = new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>').exec(block);
  return m ? xmlText(m[1]) : null;
};
const numOrNull = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return v === null || v === '' || !isFinite(n) ? null : n;
};
const niceStation = (code) => String(code).replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// The feed says "2026-10-25 14:20 (Local Time)", which is Cyprus time, so turn it into a real instant.
function nicosiaIso(text) {
  const m = /(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)/.exec(text || '');
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Nicosia', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const local = (ms) => {
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  };
  return new Date(asUtc - (local(asUtc) - asUtc)).toISOString();
}

function parseCydom(xml) {
  const stations = new Map();
  for (const m of xml.matchAll(/<station>([\s\S]*?)<\/station>/g)) {
    const code = xmlTag(m[1], 'station_code');
    const lat = numOrNull(xmlTag(m[1], 'station_latitude'));
    const lng = numOrNull(xmlTag(m[1], 'station_longitude'));
    if (code && lat != null && lng != null) stations.set(code, { id: code, name: niceStation(code), lat, lng });
  }
  const latest = new Map(); // newest observation block per station
  for (const m of xml.matchAll(/<observations>([\s\S]*?)<\/observations>/g)) {
    const code = xmlTag(m[1], 'station_code');
    const timeText = xmlTag(m[1], 'date_time');
    const iso = nicosiaIso(timeText);
    if (!code || !stations.has(code)) continue;
    const prev = latest.get(code);
    if (prev && prev.iso && iso && prev.iso >= iso) continue;
    const obs = [];
    for (const o of m[1].matchAll(/<observation>([\s\S]*?)<\/observation>/g)) {
      const name = xmlTag(o[1], 'observation_name');
      const value = numOrNull(xmlTag(o[1], 'observation_value'));
      if (name && value != null) obs.push({ name, value, unit: xmlTag(o[1], 'observation_unit') || '' });
    }
    latest.set(code, { iso, obs });
  }
  const find = (obs, names, startsWith) => {
    const lower = names.map((n) => n.toLowerCase());
    let hit = obs.find((o) => lower.includes(o.name.toLowerCase()));
    if (!hit && startsWith) hit = obs.find((o) => o.name.toLowerCase().startsWith(startsWith.toLowerCase()));
    return hit || null;
  };
  const points = [];
  for (const [code, st] of stations) {
    const l = latest.get(code);
    if (!l) continue;
    const o = l.obs;
    const wind10 = find(o, ['Wind Speed (10m)'], 'Wind Speed (10m)');
    const wind2 = find(o, ['Wind Speed (2m)']);
    const wdir = find(o, ['Wind Direction (10m)'], 'Wind Direction (10m)');
    const pick = (names, sw) => { const h = find(o, names, sw); return h ? h.value : null; };
    const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
    points.push({
      ...st,
      temp: pick(['Air Temperature (1.2m)']),
      tmax: pick(['Extreme Day Max. Temp.']),
      tmin: pick(['Extreme Day Min. Temp.']),
      hum: pick(['Relative Humidity (1.2m)']),
      ws: wind10 ? r1(wind10.value * (/knot/i.test(wind10.unit) ? 0.5144 : 1)) : wind2 ? r1(wind2.value) : null,
      wd: wdir ? wdir.value : null,
      rain10: pick(['Accumulated Rainfall (10 min.)']),
      rain24: pick(['Accumulated Rainfall (24 hours)']),
      pmsl: pick(['Atmospheric Pressure (Mean Sea Level)']),
      solar: pick(['Global Radiation']),
      time: l.iso,
      obs: o,
    });
  }
  const times = points.map((p) => p.time).filter(Boolean).sort();
  return { points, stationCount: stations.size, feedTime: times.length ? times[times.length - 1] : null, copyright: xmlTag(xml, 'copyright') || 'Weather Data Copyright The Cyprus Department of Meteorology' };
}

function fetchCydomFeed() {
  return feeds.track('dom', async () => {
    const r = await fetch(CYDOM_URL, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`Met Office feed returned HTTP ${r.status}`);
    const out = parseCydom(await r.text());
    if (!out.points.length) throw new Error('Met Office feed had no readable stations');
    return out;
  });
}
function cydom() {
  return viaFeed('dom', cached, 'cydom', 600000, async () => {
    if (MOCK) {
      const t = new Date().toISOString();
      return { points: [
        { id: 'ACHNA', name: 'Achna', lat: 35.0255, lng: 33.7744, temp: 26.6, tmax: 29.8, tmin: 15.8, hum: 51, ws: 2.1, wd: 181, rain10: 0, rain24: 0, pmsl: 1015, solar: 481, time: t, obs: [{ name: 'Air Temperature (1.2m)', value: 26.6, unit: 'Celcius' }] },
        { id: 'AGROS', name: 'Agros', lat: 34.9149, lng: 33.0157, temp: 22.7, tmax: 24.9, tmin: 12.9, hum: 42, ws: 2.2, wd: 174, rain10: 0, rain24: 0, pmsl: 1015, solar: 481, time: t, obs: [] },
      ], stationCount: 2, feedTime: t, copyright: 'Weather Data Copyright The Cyprus Department of Meteorology', updated: t };
    }
    const out = await fetchCydomFeed();
    ingestCydom(out);
    return { ...out, updated: new Date().toISOString() };
  });
}

/* ---------- Met Office history and pages ----------
   The feed only holds the newest reading of every station, so the server saves each new one (every 10 minutes) in daily files.
   On Railway attach a volume (RAILWAY_VOLUME_MOUNT_PATH is then set) or the files vanish at the next deploy. */

const mo = require('./metoffice');
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const PERSISTENT = Boolean(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS) || 400;
let history = null, pageStore = null;

/* The five outside sources, what they did lately and the teachers' on/off switch (feeds.js). SenseCAP counts as simulated in demo
 * mode and the weather services in test mode (OPEN_METEO_MOCK), because nothing is fetched from them then. */
const feeds = createFeeds({
  dataDir: DATA_DIR, log: (m) => console.error(m),
  simulated: { sensecap: DEMO, openmeteo: MOCK, sensorcommunity: MOCK, metar: MOCK },
  secrets: [ID, KEY, PASS, process.env.ANTHROPIC_API_KEY, process.env.ADMIN_SETUP_CODE, process.env.CLASS_LOGIN_PASSWORD, process.env.STUDIO_CLASS_SECRET],
});
// SenseCAP by push (Seeed's OpenStream MQTT feed). OFF unless SENSECAP_MQTT=1 plus an organisation id and a TLS port (see
// sensecap_stream.js); while it is off every call on this object does nothing and the REST polling above is exactly as before.
const sensecapStream = require('./sensecap_stream').createSenseCapStream({ env: process.env, isEnabled: () => feeds.enabled('sensecap'), toMs, log: (m) => console.log(m) });
// What the two savers did, for the helper list (see helpersView).
const CYDOM_EVERY = 300000, PAGES_EVERY = 900000;
const savers = { cydom: { lastRun: null, nextRun: null, ok: null, error: null }, pages: { lastRun: null, nextRun: null, ok: null, error: null, failed: [] }, collecting: false };
const lastPages = new Map();   // page name -> the page as last read (at most one per Met Office page), for the search

function ingestCydom(out) {
  if (!history) return 0;
  Object.assign(savers.cydom, { lastRun: Date.now(), ok: true, error: null });
  const n = history.append(out.points);
  if (n) console.log(`Met Office history: stored ${n} new readings (feed time ${out.feedTime})`);
  return n;
}

const DOM = process.env.DOM_BASE || 'https://www.dom.org.cy';   // DOM_BASE lets tests point at a fake site
const DOM_PAGES = {
  warnings: DOM + '/WARNING/',
  sea_a: DOM + '/FORECAST/sea_a_en.html', sea_b: DOM + '/FORECAST/sea_b_en.html', sea_c: DOM + '/FORECAST/sea_c_en.html', sea_d: DOM + '/FORECAST/sea_d_en.html',
  navtex: DOM + '/FORECAST/navtex.html', fir: DOM + '/FORECAST/fir.html', laf: DOM + '/FORECAST/laf.html',
};
const DOM_IMAGES = {
  radar: DOM + '/RADAR_IMG/RADAR_Static.png', radar_anim: DOM + '/RADAR_IMG/RADAR_Animation.gif',
  radar_pfo: DOM + '/RADAR_IMG/RADAR_PFO_MAX_Static.png', radar_lca: DOM + '/RADAR_IMG/RADAR_LCA_MAX_Static.png',
  table_a: DOM + '/FORECAST/table_a_en.png', table_b: DOM + '/FORECAST/table_b_en.png', table_c: DOM + '/FORECAST/table_c_en.png',
};
const DOM_NET = DOM + '/AWS/AWS_NET.txt';
const loggedPages = new Set();

function domPage(name) {
  return viaFeed('dom', cached, 'dompage:' + name, 600000, async () => {
    const url = DOM_PAGES[name];
    const { html, page } = await feeds.track('dom', async () => {
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(`Met Office page ${name} returned HTTP ${r.status}`);
      const html = mo.decodeBody(new Uint8Array(await r.arrayBuffer()), r.headers.get('content-type'));
      return { html, page: { name, url, fetched: new Date().toISOString(), ...mo.extractPage(html, url) } };
    });
    lastPages.set(name, page);
    if (!loggedPages.has(name)) {   // once per run, so the structure of each page can be checked in the logs
      loggedPages.add(name);
      console.log(`Met Office page ${name}: ${html.length} chars of HTML, title "${page.title}", ${page.text.length} chars of text, ${page.images.length} images ${JSON.stringify(page.images.slice(0, 4))}, ${page.frames.length} frames ${JSON.stringify(page.frames.slice(0, 3))}, ${page.links.length} links; text starts: ${JSON.stringify(page.text.slice(0, 200))}`);
    }
    if (pageStore && pageStore.save(name, page, Date.now(), 1800000)) console.log(`Met Office page ${name}: new version stored`);
    return page;
  });
}

function domNet() {
  return viaFeed('dom', cached, 'domnet', 600000, async () => {
    const { text, out } = await feeds.track('dom', async () => {
      const r = await fetch(DOM_NET, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(`Met Office discomfort index returned HTTP ${r.status}`);
      const text = mo.decodeBody(new Uint8Array(await r.arrayBuffer()), r.headers.get('content-type'));
      const out = mo.parseNet(text);
      if (!out.rows.length) throw new Error('Met Office discomfort index had no rows');
      return { text, out };
    });
    if (pageStore) pageStore.save('net', { title: 'Discomfort index', text }, Date.now(), 1800000);
    return { ...out, updated: new Date().toISOString() };
  });
}

function domImage(url) {
  return viaFeed('dom', imageCache.get, url, 300000, () => feeds.track('dom', async () => {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`Met Office image returned HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4000000) throw new Error('Met Office image is too large');
    return { type: r.headers.get('content-type') || 'image/png', buf };
  }));
}
// Only pictures from the Met Office site, either by a known name or by address (for pictures found inside its pages).
function domImageUrl(name, u) {
  if (name) return Object.hasOwn(DOM_IMAGES, name) ? DOM_IMAGES[name] : null;
  try {
    const x = new URL(u);
    if (x.origin !== DOM || !/\.(png|gif|jpe?g)$/i.test(x.pathname)) return null;
    x.search = ''; x.hash = ''; x.username = ''; x.password = '';   // one cache entry per picture, whatever the query string says
    return x.href;
  } catch (e) { return null; }
}

let lastCollectError = {};
function collectError(what, e) {
  if (lastCollectError[what] !== e.message) { lastCollectError[what] = e.message; console.error(`Met Office collector (${what}): ${e.message}`); }
}
async function collectCydom() {
  savers.cydom.nextRun = Date.now() + CYDOM_EVERY;
  if (!feeds.enabled('dom')) return;   // switched off by a teacher: the saver rests and makes no call
  try { ingestCydom(await fetchCydomFeed()); delete lastCollectError.stations; } catch (e) {
    Object.assign(savers.cydom, { lastRun: Date.now(), ok: false, error: feeds.clean(e.message) });
    collectError('stations', e);
  }
}
async function collectPages() {
  savers.pages.nextRun = Date.now() + PAGES_EVERY;
  if (!feeds.enabled('dom')) return;
  const failed = [];
  let firstError = null;
  const one = async (name, fn) => {
    try { await fn(); delete lastCollectError[name]; } catch (e) {
      if (feeds.isOff(e)) return;
      failed.push(name);
      firstError = firstError || feeds.clean(e.message);
      collectError(name, e);
    }
  };
  for (const name of Object.keys(DOM_PAGES)) {
    await one(name, () => domPage(name));
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  await one('net', domNet);
  Object.assign(savers.pages, { lastRun: Date.now(), ok: failed.length === 0, error: firstError, failed: failed.slice(0, 10) });
}
function startMetOffice() {
  history = new mo.HistoryStore(DATA_DIR, { log: (m) => console.error(m) });
  pageStore = new mo.PageStore(DATA_DIR, { log: (m) => console.error(m) });
  console.log(`Met Office history in ${PERSISTENT ? DATA_DIR : DATA_DIR + ' (no volume attached: it is lost at the next deploy)'}; ${history.info().files} day files`);
  if (MOCK) return;   // test mode serves fake data
  history.prune(HISTORY_DAYS);
  savers.collecting = true;
  savers.cydom.nextRun = Date.now() + 3000;
  savers.pages.nextRun = Date.now() + 20000;
  setTimeout(collectCydom, 3000);
  setInterval(collectCydom, CYDOM_EVERY);
  setTimeout(collectPages, 20000);
  setInterval(collectPages, PAGES_EVERY);
  setInterval(() => history.prune(HISTORY_DAYS), 6 * 3600000);
  setTimeout(() => archive.summary().catch(() => {}), 60000).unref();   // count the saved files once in the background, so the first visitor to the archive does not wait
}

/* ---------- student and team app (accounts, chat, assistant) ---------- */

const { createApp } = require('./school');
const { createBot } = require('./bot');
const { createStudio } = require('./studio');
const { createNotifier } = require('./notify');
const { createCouncil } = require('./council');
const { createReports } = require('./reports');
const { createLayers } = require('./layers');
const citiesApi = require('./cities');
const { createClassLogin } = require('./classlogin');
const classLogin = createClassLogin();
let appCore = null;
let notifier = null;
let studio = null;
let council = null;
let reports = null;
let layers = null;
let assistant = null;   // the Ask assistant (bot.js), for the helper list

/* ---------- who sees what (vehicle positions) ----------
   'exact': teachers, admins and the holder of DASHBOARD_PASSWORD get today's exact data.
   'public': everybody else gets positions that are at least PUBLIC_POS_DELAY_MIN minutes old and rounded to PUBLIC_POS_GRID
   degrees, a trail made of such points only, and no GPS measurement ids (see privacy.js).
   The caches below this line only ever hold exact data inside the data layer (rawTrails and friends); every answer that
   leaves the server goes through devicesFor / latestFor / trailsFor with a level, and the answers that are cached
   (publicViews) are keyed by that level, so exact data cannot reach a visitor from a cache. */

// In demo mode there is nothing to fetch, but the teachers' switch for SenseCAP still applies, so the pages behave the same way.
const demoGuard = () => feeds.guard('sensecap');
const rawDevices = async () => (DEMO ? (demoGuard(), DEMO_DEVICES) : await liveDevices());
// The live stream (sensecap_stream.js, off unless SENSECAP_MQTT=1) lays its newer readings over the REST answer, and stands in for it when
// the REST refresh fails while the stream is healthy. Whoever asks (latestFor, the overview) still gets GPS only through the privacy rules.
const rawLatest = async () => sensecapStream.overlay(DEMO ? (demoGuard(), demoLatest()) : await liveLatest().catch((e) => { if (sensecapStream.serving()) return {}; throw e; }));
// Trails are fetched from SenseCAP for a few fixed windows only (then cut to the hours asked for), so a visitor cannot make the
// server ask SenseCAP for something new with every request by changing the number of hours.
const HOUR_STEPS = [1, 3, 6, 12, 24, 48, 72, 120, 168];
async function rawTrails(hours, mid) {
  const win = HOUR_STEPS.find((h) => h >= hours) || 168;
  const raw = DEMO ? (demoGuard(), demoTrails(win, mid)) : await liveTrails(win, mid);
  if (win === hours) return raw;
  const from = Date.now() - hours * 3600000;
  const trails = {};
  for (const [eui, pts] of Object.entries(raw.trails)) trails[eui] = pts.filter((p) => p[0] >= from);
  return { ...raw, hours, trails };
}
// The measurement ids a trail can be coloured by (every id some vehicle has, except GPS).
async function trailMeasurements() {
  const ids = new Set();
  for (const d of await rawDevices()) for (const m of d.measurements || []) if (!GPS_MIDS.has(String(m))) ids.add(String(m));
  return ids;
}

let lastWarning = '';
function warnOnce(msg) { if (msg !== lastWarning) { lastWarning = msg; console.error(msg); } }

// A level-keyed cache of what visitors get. Exact answers are never stored here.
const viewTtl = 15000;
function publicView(level, key, fn) {
  if (level !== 'public') throw new Error('Only public answers are cached');
  return publicViews.get(level + '|' + key, viewTtl, fn);
}

async function publicPositions(devices) {
  const now = Date.now();
  let trails = {};
  try { trails = (await rawTrails(priv.windowHours, '')).trails || {}; }
  catch (e) { warnOnce('Public positions: could not read the GPS history: ' + e.message); }
  const out = new Map();
  for (const d of devices) out.set(d.eui, priv.publicPosition(trails[d.eui], now) || priv.silentPosition(d, toMs(d.lastSeen), now));
  return out;
}

function devicesFor(level) {
  if (level === 'exact') return rawDevices();
  return publicView(level, 'devices', async () => {
    const devices = await rawDevices();
    const pos = await publicPositions(devices);
    return devices.map((d) => priv.publicDevice(d, pos.get(d.eui)));
  });
}
async function latestFor(level) {
  const latest = await rawLatest();
  return level === 'exact' ? latest : priv.stripGpsLatest(latest);
}
// Quality checks (qc.js, limits in vocab/qc.json): the last day of each sensor's readings is checked for range, spikes, steps and
// stuck values. The answer is an extra `qc` field on /api/devices and /api/latest, a sentence the pages may show. It never deletes
// or hides a reading and never sends an alert. QC=0 switches it off.
const qcWatch = createQcWatch({ root: __dirname, names: () => measurementNames, devices: () => rawDevices(), log: (m) => console.log(m), pauseMs: DEMO ? 0 : undefined,
  series: async (eui, mid, ch) => (DEMO ? (demoGuard(), demoSeries(eui, mid, 1)) : liveSeries(eui, mid, ch, 1)) });
function trailsFor(level, hours, mid) {
  if (level === 'exact') return rawTrails(hours, mid);
  return publicView(level, `trails|${hours}|${mid}`, async () => priv.publicTrails(await rawTrails(hours, mid)));
}

// What the assistant and the Build studio may read. Everything is read-only and ALWAYS the public view, even when a teacher
// is the one asking: delayed and rounded positions, no GPS measurement ids, no GPS history. The tools can never leak a position.
const botData = {
  get demo() { return DEMO; },
  names: () => measurementNames,
  devices: async () => (await devicesFor('public')).map((d) => priv.toolDevice(d)),
  latest: async () => latestFor('public'),
  // Names and groups only, never a position: for counting sensors without waiting for the GPS history.
  deviceList: async () => (await rawDevices()).map((d) => ({ eui: d.eui, name: d.name, group: d.group, online: d.online, lastSeen: d.lastSeen })),
  qcStatus: () => qcWatch.statusByDevice(),   // { eui: 'ok' | 'check' } from the quality checks, for the Layers page notes
  series: async (eui, mid, days) => {
    const m = priv.normMid(mid);
    if (m == null) throw new Error('Unknown measurement');
    if (priv.isGpsMid(m)) throw new Error('GPS history is not available to the assistant.');
    days = whole(days, 1, 1, 30);
    let pts;
    if (DEMO) { demoGuard(); pts = demoSeries(eui, m, days); }
    else {
      const dev = (await liveDevices()).find((d) => d.eui === eui);
      if (!dev) throw new Error('Unknown device');
      pts = await liveSeries(eui, m, dev.channelOf[m] || 1, days);
    }
    return pts.map((p) => ({ t: toMs(p.t), v: p.v }));
  },
  trail: async (eui, hours) => {
    const t = await rawTrails(whole(hours, 6, 1, 168), '4097');
    return priv.publicTrail((t.trails && t.trails[eui]) || [], Date.now());
  },
  weather, air, sea, cydom, metar,
  history: () => history,
  domPage, domNet,
};

function startApp() {
  const bot = createBot({
    apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.BOT_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL,
    data: botData, log: (m) => console.error(m),
  });
  assistant = bot;
  notifier = createNotifier({ log: (m) => console.log(m) });   // an email to the admin when something waits for approval (off until RESEND_API_KEY and NOTIFY_EMAIL are set)
  appCore = createApp({ dataDir: DATA_DIR, bot, notify: notifier, log: (m) => console.log(m) });
  layers = createLayers({ root: __dirname, dataDir: DATA_DIR, appCore, data: botData, feeds, apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.BOT_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL, log: (m) => console.error(m) });   // works without the student app too (only editing the mission needs a teacher sign-in)
  if (!appCore.enabled) return console.error('Student app is off: ' + appCore.reason);
  feeds.attach(appCore);   // from now on the on/off switches of the feeds are kept in the student database
  studio = createStudio({ appCore, notify: notifier, layers, classValid: (req) => classLogin.enabled && classLogin.valid(req), bot, data: botData, apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.BOT_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL, log: (m) => console.error(m) });
  council = createCouncil({ appCore, bot, data: botData, apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.BOT_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL, viewer: (req) => (studio && studio.viewer ? studio.viewer(req) : null), log: (m) => console.error(m) });
  reports = createReports({ appCore, data: botData, apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.BOT_MODEL, baseUrl: process.env.ANTHROPIC_BASE_URL, log: (m) => console.error(m) });
  const st = bot.status();
  console.log(`Student app ready (${appCore.info().users} accounts). Assistant ${st.configured ? 'on, model ' + st.model : 'off: set ANTHROPIC_API_KEY'}. Admin sign-up ${process.env.ADMIN_SETUP_CODE ? 'enabled' : 'disabled: set ADMIN_SETUP_CODE'}.`);
}

/* ---------- sources, helpers, archive, operations map ----------
   Public views for the Data sources and Operations pages. They show state and counts only: no key, no password, no address of
   a vehicle and no person. Every text that can come from an outside error goes through feeds.clean first. Only the on/off switch
   of a feed (POST /api/feeds/<id>) needs a teacher or admin session. Texts come in two languages: `detail` and `detailEl`. */

const archive = createArchive({
  getHistory: () => history, getPageStore: () => pageStore, getLive: () => lastPages,
  pageNames: [...Object.keys(DOM_PAGES), 'net'], retentionDays: HISTORY_DAYS, log: (m) => console.error(m),
});

const P = (en, el) => ({ en, el });
const mb = (bytes) => Math.round((bytes / 1e6) * 10) / 10;
function duration(sec) {
  const m = Math.round(sec / 60), h = Math.round(sec / 3600), d = Math.round(sec / 86400);
  if (sec < 5400) return P(`${Math.max(1, m)} min`, `${Math.max(1, m)} λεπτά`);
  if (sec < 129600) return P(`${h} h`, `${h} ώρες`);
  return P(`${d} days`, `${d} ημέρες`);
}
// The start of today in Cyprus time (the Ask assistant's questions are counted from then).
const dayStartNicosia = (t = Date.now()) => Date.parse(nicosiaIso(mo.localText(t).slice(0, 10) + ' 00:00'));

let askStats = { at: 0, v: null };
function askToday() {
  if (Date.now() - askStats.at < 15000) return askStats.v;
  let v = null;
  if (appCore && appCore.enabled && appCore.db) {
    try {
      const r = appCore.db.get('SELECT COUNT(*) AS n FROM bot_logs WHERE created_at >= ?', dayStartNicosia());
      const l = appCore.db.get('SELECT created_at AS at, error FROM bot_logs ORDER BY id DESC LIMIT 1');
      v = { n: Number(r && r.n) || 0, last: l ? Number(l.at) || null : null, lastFailed: Boolean(l && l.error) };
    } catch (e) { v = null; }
  }
  askStats = { at: Date.now(), v };
  return v;
}
function studioCounts() {
  if (!appCore || !appCore.enabled || !appCore.db) return null;
  try {
    const by = {};
    for (const r of appCore.db.all('SELECT status, COUNT(*) AS n FROM studio_projects GROUP BY status')) by[r.status] = Number(r.n) || 0;
    const l = appCore.db.get('SELECT MAX(updated_at) AS at FROM studio_projects');
    return { pending: by.pending || 0, approved: by.approved || 0, last: l && l.at ? Number(l.at) : null };
  } catch (e) { return null; }
}

function helpersView() {
  const t = Date.now();
  const young = process.uptime() * 1000 < 3 * CYDOM_EVERY;       // a collector that has not run yet is normal in the first minutes
  const domOff = !feeds.enabled('dom');
  const rest = P('Resting: the Met Office feed is switched off by a teacher.', 'Σε παύση: η πηγή της Μετεωρολογικής έχει απενεργοποιηθεί από εκπαιδευτικό.');
  const helpers = [];
  const add = (h) => helpers.push({ id: h.id, name: h.name[0], nameEl: h.name[1], what: h.what[0], whatEl: h.what[1], kind: h.kind, status: h.status, lastRun: h.lastRun || null, nextRun: h.nextRun || null, detail: h.detail.en, detailEl: h.detail.el });

  { // the Met Office readings saver
    const sv = savers.cydom, info = history ? history.info() : null;
    let status = 'ok', detail;
    if (!history) { status = 'off'; detail = P('Not started yet.', 'Δεν έχει ξεκινήσει ακόμη.'); }
    else if (MOCK) { status = 'off'; detail = P('Test mode: nothing is collected.', 'Δοκιμαστική λειτουργία: δεν συλλέγεται τίποτα.'); }
    else if (domOff) { status = 'off'; detail = rest; }
    else if (info.error) { status = 'error'; detail = P('Cannot save: ' + feeds.clean(info.error), 'Δεν μπορεί να αποθηκεύσει: ' + feeds.clean(info.error)); }
    else if (sv.ok === false) { status = 'error'; detail = P('The last try failed: ' + sv.error, 'Η τελευταία προσπάθεια απέτυχε: ' + sv.error); }
    else if ((sv.lastRun && t - sv.lastRun > 3 * CYDOM_EVERY) || (!sv.lastRun && !young)) { status = 'late'; detail = P('No new readings for a while.', 'Δεν υπάρχουν νέες μετρήσεις εδώ και ώρα.'); }
    else detail = P(`${info.stations} stations, ${info.writtenSinceStart} readings saved since the server started, ${info.files} day files.`, `${info.stations} σταθμοί, ${info.writtenSinceStart} μετρήσεις αποθηκεύτηκαν από την εκκίνηση του διακομιστή, ${info.files} αρχεία ημέρας.`);
    add({ id: 'history-saver', kind: 'saver', status, detail, lastRun: sv.lastRun, nextRun: savers.collecting && !domOff ? sv.nextRun : null,
      name: ['Met Office history saver', 'Αποθήκευση ιστορικού Μετεωρολογικής'], what: ['Saves every new reading of the official stations (every 10 minutes) in daily files, so the history can be charted and downloaded.', 'Αποθηκεύει κάθε νέα μέτρηση των επίσημων σταθμών (κάθε 10 λεπτά) σε ημερήσια αρχεία, ώστε το ιστορικό να εμφανίζεται σε γραφήματα και να κατεβαίνει.'] });
  }
  { // the saver of the Met Office pages (warnings, sea, aviation)
    const sv = savers.pages;
    let status = 'ok', detail;
    if (!pageStore) { status = 'off'; detail = P('Not started yet.', 'Δεν έχει ξεκινήσει ακόμη.'); }
    else if (MOCK) { status = 'off'; detail = P('Test mode: nothing is collected.', 'Δοκιμαστική λειτουργία: δεν συλλέγεται τίποτα.'); }
    else if (domOff) { status = 'off'; detail = rest; }
    else if (pageStore.error) { status = 'error'; detail = P('Cannot save: ' + feeds.clean(pageStore.error), 'Δεν μπορεί να αποθηκεύσει: ' + feeds.clean(pageStore.error)); }
    else if (sv.ok === false) { status = 'error'; detail = P(`Could not read: ${sv.failed.join(', ')}. ${sv.error || ''}`.trim(), `Δεν διαβάστηκαν: ${sv.failed.join(', ')}. ${sv.error || ''}`.trim()); }
    else if ((sv.lastRun && t - sv.lastRun > 3 * PAGES_EVERY) || (!sv.lastRun && process.uptime() * 1000 > 3 * PAGES_EVERY)) { status = 'late'; detail = P('The pages have not been read for a while.', 'Οι σελίδες δεν έχουν διαβαστεί εδώ και ώρα.'); }
    else detail = P(`Keeps a new copy of each page when its text changes. ${pageStore.hash.size} of ${Object.keys(DOM_PAGES).length + 1} pages have a saved copy.`, `Κρατά νέο αντίγραφο κάθε σελίδας όταν αλλάζει το κείμενό της. ${pageStore.hash.size} από ${Object.keys(DOM_PAGES).length + 1} σελίδες έχουν αποθηκευμένο αντίγραφο.`);
    add({ id: 'pages-saver', kind: 'saver', status, detail, lastRun: sv.lastRun, nextRun: savers.collecting && !domOff ? sv.nextRun : null,
      name: ['Warnings and pages saver', 'Αποθήκευση προειδοποιήσεων και σελίδων'], what: ['Reads the Met Office warnings, sea, aviation and local forecast pages every 15 minutes and saves a copy whenever the text changes.', 'Διαβάζει κάθε 15 λεπτά τις σελίδες προειδοποιήσεων, θάλασσας, αεροπλοΐας και τοπικής πρόγνωσης και αποθηκεύει αντίγραφο όταν αλλάζει το κείμενο.'] });
  }
  { // caches and the SenseCAP call gate
    const kept = cachedStore.size + seriesCache.size + trailCache.size + imageCache.size + publicViews.size;
    const resting = Math.max(0, Math.ceil((upstream.coolUntil - t) / 1000));
    let status = 'ok', detail = P(`${kept} answers kept in memory, pictures ${mb(imageCache.bytes)} MB.`, `${kept} απαντήσεις στη μνήμη, εικόνες ${mb(imageCache.bytes)} MB.`);
    if (resting) { status = 'late'; detail = P(`SenseCAP answered "busy", so calls rest for ${resting} s and the last good readings are shown. ${kept} answers kept.`, `Το SenseCAP απάντησε "απασχολημένο", οπότε οι κλήσεις περιμένουν ${resting} δευτ. και εμφανίζονται οι τελευταίες καλές μετρήσεις. ${kept} απαντήσεις στη μνήμη.`); }
    else if (upstream.queue.length) detail = P(`${kept} answers kept; ${upstream.queue.length} SenseCAP calls waiting their turn.`, `${kept} απαντήσεις στη μνήμη· ${upstream.queue.length} κλήσεις SenseCAP περιμένουν τη σειρά τους.`);
    const live = sensecapStream.describe();   // one more line about the live stream; null (nothing added) unless SENSECAP_MQTT=1
    if (live) detail = P(detail.en + ' ' + live.en, detail.el + ' ' + live.el);
    add({ id: 'caches', kind: 'cache', status, detail, lastRun: null, nextRun: null,
      name: ['Caches', 'Προσωρινή μνήμη'], what: ['Keeps the last good answer of every source and spaces out the calls to SenseCAP, so the site stays up when a source is slow or busy.', 'Κρατά την τελευταία καλή απάντηση κάθε πηγής και αραιώνει τις κλήσεις προς το SenseCAP, ώστε ο ιστότοπος να λειτουργεί όταν μια πηγή είναι αργή ή απασχολημένη.'] });
  }
  { // the Ask assistant
    const st = assistant ? assistant.status() : { configured: false };
    const q = askToday();
    let status = 'ok', detail;
    if (!st.configured) { status = 'off'; detail = P('Not switched on: no assistant key is set on the server.', 'Δεν έχει ενεργοποιηθεί: δεν έχει οριστεί κλειδί βοηθού στον διακομιστή.'); }
    else {
      const n = q ? q.n : null;
      detail = n == null ? P(`On, model ${st.model}. Questions today: not available.`, `Ενεργός, μοντέλο ${st.model}. Ερωτήσεις σήμερα: δεν είναι διαθέσιμες.`)
        : P(`On, model ${st.model}. ${n} question${n === 1 ? '' : 's'} today.`, `Ενεργός, μοντέλο ${st.model}. ${n} ${n === 1 ? 'ερώτηση' : 'ερωτήσεις'} σήμερα.`);
      if (q && q.lastFailed && q.last && t - q.last < 3600000) { status = 'error'; detail = P(detail.en + ' The last question could not be answered.', detail.el + ' Η τελευταία ερώτηση δεν απαντήθηκε.'); }
    }
    add({ id: 'assistant', kind: 'assistant', status, detail, lastRun: q ? q.last : null, nextRun: null,
      name: ['Ask assistant', 'Βοηθός Ask'], what: ['Answers visitors\' questions from the public data of the project. It never sees exact vehicle positions.', 'Απαντά στις ερωτήσεις των επισκεπτών από τα δημόσια δεδομένα του έργου. Δεν βλέπει ποτέ ακριβείς θέσεις οχημάτων.'] });
  }
  { // the Build studio
    const sc = studioCounts();
    const on = Boolean(studio && studio.enabled && studio.status && studio.status().configured);
    let status = on ? 'ok' : 'off', detail;
    if (!studio || !studio.enabled) detail = P('Off: the student app is not running.', 'Ανενεργό: η εφαρμογή μαθητών δεν λειτουργεί.');
    else if (!on) detail = P('Off for building: it needs the assistant to be switched on. The gallery still works.', 'Ανενεργό για δημιουργία: χρειάζεται να είναι ενεργοποιημένος ο βοηθός. Η γκαλερί λειτουργεί κανονικά.');
    else detail = sc ? P(`On. ${sc.pending} page${sc.pending === 1 ? '' : 's'} waiting for a teacher, ${sc.approved} approved.`, `Ενεργό. ${sc.pending} ${sc.pending === 1 ? 'σελίδα περιμένει' : 'σελίδες περιμένουν'} εκπαιδευτικό, ${sc.approved} εγκεκριμένες.`) : P('On.', 'Ενεργό.');
    add({ id: 'studio', kind: 'studio', status, detail, lastRun: sc ? sc.last : null, nextRun: null,
      name: ['Build studio', 'Εργαστήρι δημιουργίας'], what: ['Students build small data tools with the assistant; a teacher approves each one before it is public.', 'Οι μαθητές φτιάχνουν μικρά εργαλεία δεδομένων με τον βοηθό· κάθε εργαλείο εγκρίνεται από εκπαιδευτικό πριν γίνει δημόσιο.'] });
  }
  return helpers;
}

const FEED_NODE_STATUS = { ok: 'ok', demo: 'ok', idle: 'ok', late: 'late', off: 'off', error: 'error' };
function opsView() {
  const t = Date.now();
  const nodes = [];
  const add = (id, label, kind, status, detail) => nodes.push({ id, label: label[0], labelEl: label[1], kind, status, detail: detail.en, detailEl: detail.el });
  const feedList = feeds.list();

  { // the sensors themselves: counts only
    let total = null, online = null;
    if (DEMO) { total = DEMO_DEVICES.length; online = DEMO_DEVICES.filter((d) => d.online).length; }
    else if (lastDevices) { total = lastDevices.total; online = lastDevices.online; }
    let status, detail;
    if (total == null) { status = feeds.enabled('sensecap') ? 'late' : 'off'; detail = P('No reading yet.', 'Δεν υπάρχει ακόμη μέτρηση.'); }
    else {
      status = online > 0 ? 'ok' : 'late';
      detail = DEMO ? P(`Demo data: ${online} of ${total} simulated vehicles online.`, `Δοκιμαστικά δεδομένα: ${online} από ${total} προσομοιωμένα οχήματα συνδεδεμένα.`)
        : P(`${online} of ${total} vehicles online in the last reading.`, `${online} από ${total} οχήματα συνδεδεμένα στην τελευταία μέτρηση.`);
    }
    const qn = qcWatch.counts();   // sensors whose readings look odd: a sentence only, the status above does not change
    if (qn && qn.check) detail = P(`${detail.en} ${qn.check} sensor${qn.check === 1 ? ' has' : 's have'} readings worth a check.`, `${detail.el} ${qn.check} ${qn.check === 1 ? 'αισθητήρας έχει' : 'αισθητήρες έχουν'} μετρήσεις που αξίζει να ελεγχθούν.`);
    add('sensors', ['Sensors on buses, cars and in classrooms', 'Αισθητήρες σε λεωφορεία, αυτοκίνητα και τάξεις'], 'sensors', status, detail);
  }
  for (const f of feedList) {
    let detail;
    if (f.status === 'off') detail = P('Switched off by a teacher.', 'Απενεργοποιήθηκε από εκπαιδευτικό.');
    else if (f.status === 'demo') detail = P('Simulated: demo data, nothing is fetched.', 'Προσομοίωση: δοκιμαστικά δεδομένα, δεν γίνεται λήψη.');
    else if (f.status === 'error') detail = P('The last call failed: ' + (f.lastError ? f.lastError.message : ''), 'Η τελευταία κλήση απέτυχε: ' + (f.lastError ? f.lastError.message : ''));
    else if (f.status === 'late') detail = P('No answer for a while.', 'Καμία απάντηση εδώ και ώρα.');
    else if (f.status === 'idle') detail = P('Asked when someone opens a page that needs it.', 'Ρωτιέται όταν κάποιος ανοίγει σελίδα που τη χρειάζεται.');
    else detail = P(`${f.ok24h} calls worked and ${f.fail24h} failed in the last 24 hours.`, `${f.ok24h} κλήσεις πέτυχαν και ${f.fail24h} απέτυχαν τις τελευταίες 24 ώρες.`);
    add(f.id, [f.name, f.nameEl], 'feed', FEED_NODE_STATUS[f.status] || 'ok', detail);
  }
  add('server', ['Dashboard server', 'Διακομιστής του ιστότοπου'], 'server', 'ok', P(`Running for ${duration(process.uptime()).en}.`, `Λειτουργεί εδώ και ${duration(process.uptime()).el}.`));
  { // the saved Met Office history and page copies
    const info = history ? history.info() : null;
    let status = 'ok', detail;
    if (!info) { status = 'off'; detail = P('Not started yet.', 'Δεν έχει ξεκινήσει ακόμη.'); }
    else if (info.error || (pageStore && pageStore.error)) { status = 'error'; detail = P('Cannot save: ' + feeds.clean(info.error || pageStore.error), 'Δεν μπορεί να αποθηκεύσει: ' + feeds.clean(info.error || pageStore.error)); }
    else {
      detail = P(`${info.files} days of station readings (${mb(info.bytes)} MB) and copies of ${pageStore ? pageStore.hash.size : 0} pages.`, `${info.files} ημέρες μετρήσεων σταθμών (${mb(info.bytes)} MB) και αντίγραφα ${pageStore ? pageStore.hash.size : 0} σελίδων.`);
      if (!PERSISTENT) { status = 'late'; detail = P(detail.en + ' No permanent volume is attached, so it is lost at the next deploy.', detail.el + ' Δεν υπάρχει μόνιμος δίσκος, οπότε χάνονται στην επόμενη ανάπτυξη.'); }
    }
    add('archive', ['Saved history', 'Αποθηκευμένο ιστορικό'], 'store', status, detail);
  }
  { // the student app database
    let status = 'off', detail = P('Off: the student app is not running.', 'Ανενεργή: η εφαρμογή μαθητών δεν λειτουργεί.');
    if (appCore && appCore.enabled) {
      status = 'ok';
      try { const i = appCore.info(); detail = P(`Teacher and student accounts, announcements, studio pages and assistant log: ${i.schools} schools, ${i.users} accounts.`, `Λογαριασμοί, ανακοινώσεις, σελίδες εργαστηρίου και αρχείο βοηθού: ${i.schools} σχολεία, ${i.users} λογαριασμοί.`); }
      catch (e) { status = 'error'; detail = P('The database did not answer.', 'Η βάση δεδομένων δεν απάντησε.'); }
    } else if (appCore && appCore.reason) detail = P('Off: ' + feeds.clean(appCore.reason), 'Ανενεργή: ' + feeds.clean(appCore.reason));
    add('database', ['Student app database', 'Βάση δεδομένων εφαρμογής μαθητών'], 'store', status, detail);
  }
  const helpers = helpersView();
  const asst = helpers.find((h) => h.id === 'assistant'), stud = helpers.find((h) => h.id === 'studio');
  nodes.push({ id: 'assistant', label: 'Ask assistant', labelEl: 'Βοηθός Ask', kind: 'assistant', status: asst.status, detail: asst.detail, detailEl: asst.detailEl });
  nodes.push({ id: 'studio', label: 'Build studio', labelEl: 'Εργαστήρι δημιουργίας', kind: 'site', status: stud.status, detail: stud.detail, detailEl: stud.detailEl });
  add('site', ['The Smart Cities site', 'Ο ιστότοπος Smart Cities'], 'site', 'ok', P('The pages, map and 3D view that visitors open.', 'Οι σελίδες, ο χάρτης και η τρισδιάστατη προβολή που ανοίγουν οι επισκέπτες.'));
  const edges = [
    ['sensors', 'sensecap'], ['sensecap', 'server'], ['openmeteo', 'server'], ['sensorcommunity', 'server'], ['metar', 'server'], ['dom', 'server'],
    ['server', 'archive'], ['server', 'database'], ['server', 'assistant'], ['database', 'assistant'], ['server', 'studio'], ['database', 'studio'],
    ['assistant', 'site'], ['studio', 'site'], ['server', 'site'],
  ].map(([from, to]) => ({ from, to }));
  return { at: t, nodes, edges };
}

// A small limit per address for the views that read files (search, archive, watch).
const viewHits = new Map();
function tooMany(req, max) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (fwd || req.socket.remoteAddress || '?').slice(0, 64);
  const t = Date.now();
  let h = viewHits.get(ip);
  if (!h || t - h[1] > 60000) {
    h = [0, t];
    viewHits.set(ip, h);
    if (viewHits.size > 2000) { for (const [k, v] of viewHits) if (t - v[1] > 60000) viewHits.delete(k); if (viewHits.size > 4000) viewHits.clear(); }
  }
  return ++h[0] > max;
}

function readJsonBody(req, limit = 2048) {
  return new Promise((ok, bad) => {
    const chunks = [];
    let n = 0, big = false;
    req.on('data', (c) => { n += c.length; if (n > limit) big = true; else chunks.push(c); });
    req.on('end', () => {
      if (big) return bad(Object.assign(new Error('That request is too large.'), { status: 413 }));
      try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { bad(Object.assign(new Error('Send JSON, for example {"enabled":false}.'), { status: 400 })); }
    });
    req.on('error', bad);
  });
}

const reply = (res, status, obj) => { sendJson(res, status, obj); return true; };
async function sourceRoutes(req, res, url) {
  const p = url.pathname;
  const get = req.method === 'GET' || req.method === 'HEAD';
  const feedMatch = /^\/api\/feeds(?:\/([a-z]{1,20}))?$/.exec(p);
  if (feedMatch) {
    const id = feedMatch[1];
    if (get) {
      if (!id) return reply(res, 200, { at: Date.now(), demo: DEMO, feeds: feeds.list() });
      return feeds.has(id) ? reply(res, 200, { feed: feeds.get(id) }) : reply(res, 404, { error: 'Unknown feed', feeds: feeds.ids });
    }
    if (req.method !== 'POST' || !id) return reply(res, 405, { error: 'Use GET to read the feeds and POST /api/feeds/<id> to switch one.' });
    const origin = req.headers.origin;
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === req.headers.host; } catch (e) { /* bad origin */ }
      if (!same) return reply(res, 403, { error: 'Blocked: the request came from another site.' });
    }
    const user = appCore && appCore.authorise(req);
    if (!user || user.status !== 'active' || (user.role !== 'teacher' && user.role !== 'admin')) return reply(res, 403, { error: 'Only teachers can switch a feed on or off.' });
    if (!feeds.has(id)) return reply(res, 404, { error: 'Unknown feed', feeds: feeds.ids });
    let body;
    try { body = await readJsonBody(req); } catch (e) { return reply(res, e.status || 400, { error: e.message }); }
    if (!body || typeof body.enabled !== 'boolean') return reply(res, 400, { error: 'enabled must be true or false.' });
    const feed = feeds.setEnabled(id, body.enabled);
    publicViews.clear();   // the answers kept for visitors are rebuilt, so the switch shows at once
    try { appCore.db.run('INSERT INTO audit(at, actor_id, action, target, detail) VALUES (?,?,?,?,?)', Date.now(), user.id, 'feed_switch', id, body.enabled ? 'on' : 'off'); } catch (e) { /* the audit is best effort */ }
    console.log(`Feed ${id} switched ${body.enabled ? 'on' : 'off'} by a teacher`);
    return reply(res, 200, { ok: true, feed });
  }
  if (!get) return false;
  if (p === '/api/helpers') return reply(res, 200, { at: Date.now(), demo: DEMO, helpers: helpersView() });
  if (p === '/api/ops') return reply(res, 200, opsView());
  if (p === '/api/archive' || p === '/api/search' || p === '/api/dom/watch') {
    if (tooMany(req, 60) || tooMany({ headers: {}, socket: { remoteAddress: '*' } }, 600)) return reply(res, 429, { error: 'Too many requests, try again in a minute.' });
    if (p === '/api/archive') return reply(res, 200, await archive.summary());
    if (p === '/api/search') return reply(res, 200, await archive.search(url.searchParams.get('q'), url.searchParams.get('limit')));
    return reply(res, 200, await archive.watch(url.searchParams.get('days'), url.searchParams.get('limit')));
  }
  return false;
}

/* ---------- http ---------- */

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

// The whole site is open to everybody. It is only locked when someone switches a gate on again: DASHBOARD_PASSWORD (any
// username), LOCK_DASHBOARD=1 or the shared class sign-in (CLASS_LOGIN_USER and CLASS_LOGIN_PASSWORD). Members of the student
// app get through a gate with their own sign-in, so they never see a password box.
const LOCKED = Boolean(PASS) || process.env.LOCK_DASHBOARD === '1' || classLogin.enabled;

// A valid DASHBOARD_PASSWORD in a Basic authorization header (any username).
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
function passwordOk(req) {
  if (!PASS) return false;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [, pw = ''] = Buffer.from(h.slice(6), 'base64').toString().split(/:(.*)/s);
  return sameText(pw, PASS);
}
function authorised(req) {
  if (!LOCKED) return true;
  if (passwordOk(req)) return true;
  return classLogin.valid(req) || Boolean(appCore && appCore.authorise(req));
}

// Exact vehicle positions are for teachers and admins (a student-app session with that role) and for the holder of
// DASHBOARD_PASSWORD, and for nobody else. Switching a gate off or on does not change that: a visitor, a student and a
// signed-in student all get the delayed, rounded view (see "who sees what" above and privacy.js).
function privileged(req) {
  if (passwordOk(req)) return true;
  const u = appCore && appCore.authorise(req);
  return Boolean(u && (u.role === 'teacher' || u.role === 'admin'));
}
const levelOf = (req) => (privileged(req) ? 'exact' : 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
// One byte range of a static file (iOS Safari will not play a video without 206 answers): "bytes=a-b", "bytes=a-" or "bytes=-n".
// Returns { start, end }, null when there is no usable single range (the whole file is sent) or 'bad' when it cannot be satisfied (416).
function parseRange(header, size) {
  const m = /^bytes=(\d{0,15})-(\d{0,15})$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {   // the last n bytes
    const n = Number(m[2]);
    return n > 0 && size > 0 ? { start: Math.max(0, size - n), end: size - 1 } : 'bad';
  }
  const start = Number(m[1]), last = m[2] === '' ? size - 1 : Number(m[2]);
  if (m[2] !== '' && last < start) return null;   // not a valid range: ignore the header
  return start >= size ? 'bad' : { start, end: Math.min(last, size - 1) };
}
const CITIES_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const APP_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
// The site shell: / and /site/*. It loads the map and the 3D view in same-origin frames. The 3D page (/3d.html) has its own strict
// policy (csp3d.js: three.js is served from /vendor/three-r160/, so nothing is loaded from another host). The map page still keeps
// no policy of its own because it uses CDN scripts and inline code.
const { policy3d } = require('./csp3d');
const SITE_CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

// The old pages now live inside the site shell. Opened on their own they send people there. With ?embed=1 the shell (or the
// student app) gets the page itself, to show in a same-origin frame.
const SHELL_ROUTES = { '/metoffice.html': '/#/weather', '/dashboard.html': '/#/vehicles', '/map.html': '/#/map', '/3d.html': '/#/city3d' };
function redirectFor(url) {
  const p = url.pathname;
  if (p === '/index.html') return '/';
  if (p === '/cities' || p === '/cities/' || p === '/cities/index.html') return '/#/';
  if (p === '/cities/login.html' && !classLogin.enabled) return '/';   // with the class sign-in switched on, this page is the sign-in
  if (p === '/teachers' || p === '/teachers/') return '/app/#/staff';   // teachers sign in inside the student app
  if (Object.hasOwn(SHELL_ROUTES, p) && url.searchParams.get('embed') !== '1') return SHELL_ROUTES[p];
  return null;
}

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end('Bad request'); }
  try {
    if (appCore && (await appCore.handle(req, res, url))) return;   // /app/api/*: the app does its own sign-in
    if (await classLogin.handle(req, res, url)) return;              // /cities/api/login: the shared class sign-in
    if (studio && (await studio.handle(req, res, url))) return;     // /studio/* and /mcp: the Build studio does its own sign-in
    if (council && (await council.handle(req, res, url))) return;     // /council/api/*: the Council room
    if (reports && (await reports.handle(req, res, url))) return;     // /council/api/reports*: weekly reports
    if (layers && (await layers.handle(req, res, url))) return;       // /layers/api/*: data layers and the master brain
    if (url.pathname === '/app') { res.writeHead(302, { Location: '/app/' }); return res.end(); }
    const inApp = url.pathname.startsWith('/app/');
    const openAsset = /^\/cities\/(login\.html|login\.js|cities\.css|logo\.svg)$|^\/teachers\/?$/.test(url.pathname);   // what the class sign-in page needs, and the teachers' way in (it only redirects into the app)
    if (!inApp && !openAsset && !authorised(req)) {
      if (PASS) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Sensor dashboard"' });
        return res.end('Password required');
      }
      if (/\.html$|\/$/.test(url.pathname)) { res.writeHead(302, { Location: classLogin.enabled ? '/cities/login.html' : '/app/' }); return res.end(); }
      return sendJson(res, 401, { error: 'Sign in to the student app first.' });
    }
    const to = redirectFor(url);
    if (to) { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' }); return res.end(); }
    if (await sourceRoutes(req, res, url)) return;   // /api/feeds, helpers, archive, ops, search, dom/watch
    if (url.pathname === '/cities/api/overview') {
      return sendJson(res, 200, await citiesApi.overview({
        devices: rawDevices,
        latest: rawLatest,
        trails: (h) => rawTrails(h, '4097'),
      }));
    }
    if (url.pathname === '/api/config') {
      return sendJson(res, 200, { demo: DEMO, names: measurementNames, gps: [GPS_LAT, GPS_LNG], exactPositions: privileged(req), posDelayMin: priv.delayMin, posGrid: priv.grid });
    }
    if (url.pathname === '/api/devices') {
      const list = await devicesFor(levelOf(req));
      await qcWatch.ready();
      return sendJson(res, 200, qcWatch.annotateDevices(list));
    }
    if (url.pathname === '/api/latest') {
      const latest = await latestFor(levelOf(req));
      await qcWatch.ready();
      return sendJson(res, 200, qcWatch.annotateLatest(latest));
    }
    if (url.pathname === '/api/series') {
      const eui = url.searchParams.get('eui');
      const midParam = url.searchParams.get('mid');
      const days = whole(url.searchParams.get('days'), 1, 1, 30);
      if (!eui || !midParam) return sendJson(res, 400, { error: 'eui and mid are required' });
      const mid = priv.normMid(midParam);
      if (mid == null) return sendJson(res, 400, { error: 'mid must be a measurement id such as 4097' });
      if (priv.isGpsMid(mid) && levelOf(req) !== 'exact') return sendJson(res, 403, { error: 'The history of GPS positions is for teachers.' });
      if (DEMO) { demoGuard(); return sendJson(res, 200, demoSeries(eui, mid, days)); }
      const devices = await liveDevices();
      const dev = devices.find((d) => d.eui === eui);
      if (!dev) return sendJson(res, 404, { error: 'Unknown device' });
      if (!dev.measurements.includes(mid)) return sendJson(res, 404, { error: 'This vehicle has no such measurement' });
      return sendJson(res, 200, await liveSeries(eui, mid, dev.channelOf[mid] || 1, days));
    }
    if (url.pathname === '/api/trails') {
      const hours = whole(url.searchParams.get('hours'), 6, 1, 168);
      const mid = priv.normMid(url.searchParams.get('mid') || '4097');
      if (mid == null) return sendJson(res, 400, { error: 'mid must be a measurement id such as 4097' });
      const out = await trailsFor(levelOf(req), hours, (await trailMeasurements()).has(mid) ? mid : '');   // an id nobody has colours nothing: one shared answer
      return sendJson(res, 200, out.mid === mid ? out : { ...out, mid });
    }
    if (url.pathname === '/api/terrain') {
      if (!feeds.enabled('openmeteo') && !MOCK && !T.done) throw feeds.off('openmeteo');   // nothing to show yet and the feed is off
      const st = terrainStatus();
      return st.ready ? sendJson(res, 200, st.data) : sendJson(res, 202, { loading: true, progress: st.progress, error: st.error });
    }
    if (url.pathname === '/api/cydom/history/info') {
      return sendJson(res, 200, { persistent: PERSISTENT, retentionDays: HISTORY_DAYS, ...(history ? history.info() : {}), pages: pageStore ? { error: pageStore.error } : null });
    }
    if (url.pathname === '/api/cydom/history') {
      const station = url.searchParams.get('station');
      if (!station || !history) return sendJson(res, 400, { error: 'station is required' });
      const hours = Math.min(720, Math.max(1, Number(url.searchParams.get('hours')) || 24));
      const keys = (url.searchParams.get('keys') || '').split(',').filter(Boolean);
      return sendJson(res, 200, history.series(station, hours, keys));
    }
    if (url.pathname === '/api/cydom/history.csv') {
      if (!history) return sendJson(res, 503, { error: 'History is not ready' });
      const station = url.searchParams.get('station') || null;
      const days = Math.min(HISTORY_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 1));
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="metoffice-${station || 'all-stations'}-${days}d.csv"`, 'Cache-Control': 'no-store' });
      history.csv(Date.now() - days * 86400000, Date.now(), station, (t) => res.write(t));
      return res.end();
    }
    if (url.pathname === '/api/dom/page') {
      const name = url.searchParams.get('name');
      if (!Object.hasOwn(DOM_PAGES, name)) return sendJson(res, 404, { error: 'Unknown page', pages: Object.keys(DOM_PAGES) });
      return sendJson(res, 200, await domPage(name));
    }
    if (url.pathname === '/api/dom/pages/history') {
      const name = url.searchParams.get('name');
      if (!pageStore || (!Object.hasOwn(DOM_PAGES, name) && name !== 'net')) return sendJson(res, 404, { error: 'Unknown page' });
      return sendJson(res, 200, pageStore.versions(name, Math.min(HISTORY_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 30))));
    }
    if (url.pathname === '/api/dom/net') return sendJson(res, 200, await domNet());
    if (url.pathname === '/api/dom/img') {
      const target = domImageUrl(url.searchParams.get('name'), url.searchParams.get('u'));
      if (!target) return sendJson(res, 404, { error: 'Unknown picture', pictures: Object.keys(DOM_IMAGES) });
      const img = await domImage(target);
      res.writeHead(200, { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=300' });
      return res.end(img.buf);
    }
    const extra = { '/api/weather': weather, '/api/forecast': forecast, '/api/air': air, '/api/sea': sea, '/api/opensensors': openSensors, '/api/metar': metar, '/api/cydom': cydom }[url.pathname];
    if (extra) return sendJson(res, 200, await extra());
    let file = url.pathname === '/' ? '/index.html' : url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
    const full = path.join(__dirname, 'public', path.normalize(file));
    if (!full.startsWith(path.join(__dirname, 'public'))) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(full, (err, buf) => {
      if (err) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const csp = inApp ? APP_CSP : url.pathname.startsWith('/cities') ? CITIES_CSP : url.pathname === '/3d.html' ? policy3d(buf) : url.pathname === '/' || url.pathname.startsWith('/site/') ? SITE_CSP : null;
      const headers = { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': url.pathname.startsWith('/vendor/three-r160/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'Accept-Ranges': 'bytes', ...(csp ? { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' } : {}) };
      const range = req.headers.range ? parseRange(req.headers.range, buf.length) : null;
      if (range === 'bad') {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${buf.length}`, 'Content-Length': 0 });
        return res.end();
      }
      if (range) {
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${buf.length}`, 'Content-Length': range.end - range.start + 1 });
        return res.end(buf.subarray(range.start, range.end + 1));
      }
      res.writeHead(200, { ...headers, 'Content-Length': buf.length });
      res.end(buf);
    });
  } catch (e) {
    if (feeds.isOff(e)) return sendJson(res, 503, { error: 'switched off by a teacher', feed: e.feed });   // a teacher switched this source off and nothing is cached
    console.error(e.message);
    sendJson(res, 502, { error: e.message });
  }
});

// A deploy sends SIGTERM: save the feed counters first, so they are not blank after every deploy.
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { feeds.flush(); } catch (e) { /* best effort */ } process.exit(0); });

loadMeasurementNames().finally(() => {
  server.listen(PORT, () => {
    console.log(`Dashboard on port ${PORT}${DEMO ? ' (demo data)' : ''}`);
    startApp();
    startMetOffice();
    try { sensecapStream.start(); } catch (e) { console.error('SenseCAP live stream could not start: ' + e.message); }   // does nothing unless SENSECAP_MQTT=1
  });
});
