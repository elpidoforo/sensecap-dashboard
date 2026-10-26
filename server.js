const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function api(endpoint, { method = 'GET', query = {}, body } = {}) {
  const url = new URL(HOST + endpoint);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${ID}:${KEY}`).toString('base64'),
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`SenseCAP ${endpoint} returned HTTP ${res.status}`);
  const json = await res.json();
  if (String(json.code) !== '0') throw new Error(`SenseCAP ${endpoint} error code ${json.code}: ${json.message || ''}`);
  return json.data;
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

async function liveDevices() {
  return cached('devices', 60000, async () => {
    const groups = await api('/list_groups').catch(() => []);
    const all = await api('/list_devices', { query: { device_type: 2 } });
    const groupOf = {};
    for (const g of groups) {
      if (!g.group_uuid) continue;
      const inGroup = await api('/list_devices', { query: { device_type: 2, group_uuid: g.group_uuid } }).catch(() => []);
      for (const d of inGroup) groupOf[d.device_eui] = g.group_name;
    }
    const euis = all.map((d) => d.device_eui);
    const details = {};
    const status = {};
    const channels = {};
    for (const part of chunk(euis, 50)) {
      const [det, st, ch] = await Promise.all([
        api('/view_devices', { method: 'POST', body: { device_euis: part, device_type: 2 } }).catch(() => []),
        api('/view_device_running_status', { method: 'POST', body: { device_euis: part } }).catch(() => []),
        api('/list_device_channels', { method: 'POST', body: { device_euis: part } }).catch(() => []),
      ]);
      det.forEach((d) => (details[d.device_eui] = d));
      st.forEach((d) => (status[d.device_eui] = d));
      ch.forEach((d) => (channels[d.device_eui] = d.channels || []));
    }
    return all.map((d) => {
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
  });
}

async function liveLatest() {
  return cached('latest', 60000, async () => {
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
    const out = {};
    for (const r of rows) if (Array.isArray(r)) out[r[0]] = r[1];
    return out;
  });
}

async function liveSeries(eui, mid, channel, days) {
  return cached(`series:${eui}:${mid}:${channel}:${days}`, 120000, async () => {
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
  return cached(`trails:${hours}:${mid}`, hours <= 6 ? 240000 : 900000, async () => {
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
  ['School A bus 1', 'School A', 34.9217, 33.6232],
  ['School A car 1', 'School A', 34.9005, 33.6101],
  ['School B bus 1', 'School B', 35.1856, 33.3823],
  ['School B car 1', 'School B', 35.1701, 33.3611],
  ['School C bus 1', 'School C', 34.6841, 33.0379],
  ['School C car 1', 'School C', 34.7021, 33.0212],
  ['School D bus 1', 'School D', 34.7754, 32.4245],
  ['School D car 1', 'School D', 34.7612, 32.4401],
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

async function omJson(url, locations = 1) {
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
        `https://api.open-meteo.com/v1/elevation?latitude=${T.lats.slice(i, i + 100).join(',')}&longitude=${T.lngs.slice(i, i + 100).join(',')}`,
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
  return cached('weather', 600000, async () => {
    const pts = weatherGridPoints();
    let points;
    if (MOCK) {
      points = pts.map((p, i) => ({ ...p, ...mockWeather(p, i) }));
    } else {
      const j = await omJson(
        'https://api.open-meteo.com/v1/forecast?latitude=' + pts.map((p) => p.lat).join(',') +
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

function air() {
  return cached('air', 1800000, async () => {
    const pts = weatherGridPoints();
    let points;
    if (MOCK) {
      points = pts.map((p, i) => ({ ...p, pm25: 6 + (i % 9) * 2, pm10: 15 + (i % 7) * 4, dust: 10 + (i % 13) * 8, ozone: 70 }));
    } else {
      const j = await omJson(
        'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + pts.map((p) => p.lat).join(',') +
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
  return cached('sea', 1800000, async () => {
    let points;
    if (MOCK) {
      points = SEA_POINTS.map(([lat, lng], i) => ({ lat, lng, wave: 0.4 + (i % 4) * 0.5, sst: 24 + (i % 5) * 0.4 }));
    } else {
      const j = await omJson(
        'https://marine-api.open-meteo.com/v1/marine?latitude=' + SEA_POINTS.map((p) => p[0]).join(',') +
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
  return cached('opensensors', 300000, async () => {
    if (MOCK) {
      return { points: [
        { id: 'm1', lat: 34.92, lng: 33.62, pm25: 9.1, pm10: 18.4, temp: 28.1, hum: 52, time: new Date().toISOString() },
        { id: 'm2', lat: 34.68, lng: 33.04, pm25: 12.5, pm10: 24, temp: 27.2, hum: 58, time: new Date().toISOString() },
      ], updated: new Date().toISOString() };
    }
    const r = await fetch('https://data.sensor.community/airrohr/v1/filter/area=35.0,33.25,150', { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`Sensor.Community returned HTTP ${r.status}`);
    const rows = await r.json();
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
  return cached('metar', 600000, async () => {
    if (MOCK) {
      return { points: [{ id: 'LCLK', name: 'Larnaca airport', lat: 34.88, lng: 33.62, temp: 29, ws: 4.1, wd: 250, time: new Date().toISOString() }], updated: new Date().toISOString() };
    }
    const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${Object.keys(AIRPORTS).join(',')}&format=json`, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`Airport weather returned HTTP ${r.status}`);
    const rows = await r.json();
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

function cydom() {
  return cached('cydom', 600000, async () => {
    if (MOCK) {
      const t = new Date().toISOString();
      return { points: [
        { id: 'ACHNA', name: 'Achna', lat: 35.0255, lng: 33.7744, temp: 26.6, tmax: 29.8, tmin: 15.8, hum: 51, ws: 2.1, wd: 181, rain10: 0, rain24: 0, pmsl: 1015, solar: 481, time: t, obs: [{ name: 'Air Temperature (1.2m)', value: 26.6, unit: 'Celcius' }] },
        { id: 'AGROS', name: 'Agros', lat: 34.9149, lng: 33.0157, temp: 22.7, tmax: 24.9, tmin: 12.9, hum: 42, ws: 2.2, wd: 174, rain10: 0, rain24: 0, pmsl: 1015, solar: 481, time: t, obs: [] },
      ], stationCount: 2, feedTime: t, copyright: 'Weather Data Copyright The Cyprus Department of Meteorology', updated: t };
    }
    const r = await fetch(CYDOM_URL, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`Met Office feed returned HTTP ${r.status}`);
    const out = parseCydom(await r.text());
    if (!out.points.length) throw new Error('Met Office feed had no readable stations');
    return { ...out, updated: new Date().toISOString() };
  });
}

/* ---------- http ---------- */

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function authorised(req) {
  if (!PASS) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [, pw = ''] = Buffer.from(h.slice(6), 'base64').toString().split(/:(.*)/s);
  return pw === PASS;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  if (!authorised(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Sensor dashboard"' });
    return res.end('Password required');
  }
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/config') {
      return sendJson(res, 200, { demo: DEMO, names: measurementNames, gps: [GPS_LAT, GPS_LNG] });
    }
    if (url.pathname === '/api/devices') {
      return sendJson(res, 200, DEMO ? DEMO_DEVICES : await liveDevices());
    }
    if (url.pathname === '/api/latest') {
      return sendJson(res, 200, DEMO ? demoLatest() : await liveLatest());
    }
    if (url.pathname === '/api/series') {
      const eui = url.searchParams.get('eui');
      const mid = url.searchParams.get('mid');
      const days = Math.min(30, Math.max(1, Number(url.searchParams.get('days')) || 1));
      if (!eui || !mid) return sendJson(res, 400, { error: 'eui and mid are required' });
      if (DEMO) return sendJson(res, 200, demoSeries(eui, mid, days));
      const devices = await liveDevices();
      const dev = devices.find((d) => d.eui === eui);
      if (!dev) return sendJson(res, 404, { error: 'Unknown device' });
      return sendJson(res, 200, await liveSeries(eui, mid, dev.channelOf[mid] || 1, days));
    }
    if (url.pathname === '/api/trails') {
      const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours')) || 6));
      const mid = url.searchParams.get('mid') || '4097';
      return sendJson(res, 200, DEMO ? demoTrails(hours, mid) : await liveTrails(hours, mid));
    }
    if (url.pathname === '/api/terrain') {
      const st = terrainStatus();
      return st.ready ? sendJson(res, 200, st.data) : sendJson(res, 202, { loading: true, progress: st.progress, error: st.error });
    }
    const extra = { '/api/weather': weather, '/api/air': air, '/api/sea': sea, '/api/opensensors': openSensors, '/api/metar': metar, '/api/cydom': cydom }[url.pathname];
    if (extra) return sendJson(res, 200, await extra());
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
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
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  } catch (e) {
    console.error(e.message);
    sendJson(res, 502, { error: e.message });
  }
});

loadMeasurementNames().finally(() => {
  server.listen(PORT, () => {
    console.log(`Dashboard on port ${PORT}${DEMO ? ' (demo data)' : ''}`);
  });
});
