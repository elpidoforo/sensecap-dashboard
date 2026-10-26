const http = require('http');
const fs = require('fs');
const path = require('path');

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
  measurements: ['4097', '4098', '4100'],
  channelOf: { 4097: 1, 4098: 1, 4100: 2 },
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

function demoLatest() {
  const out = {};
  DEMO_DEVICES.forEach((d, i) => {
    const t = d.online ? Date.now() : Date.now() - 3 * 3600000;
    out[d.eui] = {};
    d.measurements.forEach((m) => (out[d.eui][m] = { v: demoValue(i, m, t), t: new Date(t).toISOString(), ch: d.channelOf[m] }));
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

async function omJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`Open-Meteo returned HTTP ${r.status}`);
  return r.json();
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

function terrain() {
  return cached('terrain', 24 * 3600000, async () => {
    const rows = Math.round((B.lat1 - B.lat0) / B.step) + 1;
    const cols = Math.round((B.lng1 - B.lng0) / B.step) + 1;
    const lats = [];
    const lngs = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        lats.push(r2(B.lat0 + r * B.step));
        lngs.push(r2(B.lng0 + c * B.step));
      }
    }
    let elev = new Array(rows * cols).fill(0);
    if (MOCK) {
      elev = lats.map((la, i) => mockElevation(la, lngs[i]));
    } else {
      for (let i = 0; i < lats.length; i += 100) {
        const j = await omJson(
          `https://api.open-meteo.com/v1/elevation?latitude=${lats.slice(i, i + 100).join(',')}&longitude=${lngs.slice(i, i + 100).join(',')}`
        );
        (j.elevation || []).forEach((v, k) => {
          const n = Number(v);
          elev[i + k] = isFinite(n) && n > 0 ? n : 0;
        });
      }
    }
    return { rows, cols, lat0: B.lat0, lat1: B.lat1, lng0: B.lng0, lng1: B.lng1, elev: elev.map((v) => Math.round(v)), mock: MOCK };
  });
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
        '&wind_speed_unit=ms&timezone=UTC'
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
        '&longitude=' + pts.map((p) => p.lng).join(',') + '&current=pm2_5,pm10,dust,ozone&timezone=UTC'
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
        '&longitude=' + SEA_POINTS.map((p) => p[1]).join(',') + '&current=wave_height,sea_surface_temperature&timezone=UTC'
      );
      points = asArray(j).map((o, i) => ({
        lat: SEA_POINTS[i][0], lng: SEA_POINTS[i][1], wave: o.current.wave_height, sst: o.current.sea_surface_temperature,
      }));
    }
    return { points, updated: new Date().toISOString(), mock: MOCK };
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
    const extra = { '/api/terrain': terrain, '/api/weather': weather, '/api/air': air, '/api/sea': sea }[url.pathname];
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
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    console.error(e.message);
    sendJson(res, 502, { error: e.message });
  }
});

loadMeasurementNames().finally(() => {
  server.listen(PORT, () => console.log(`Dashboard on port ${PORT}${DEMO ? ' (demo data)' : ''}`));
});
