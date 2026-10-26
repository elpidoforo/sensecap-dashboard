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
