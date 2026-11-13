'use strict';
/* Official air-quality stations of Cyprus (PM2.5 and PM10, hourly) from the European Environment Agency (EEA) Air Quality
 * Download Service, and the "my school sensor vs the nearest official station" comparison. Mounted at /api/eea/*.
 *
 *   GET /api/eea/stations                      stations with the latest hour and the 24-hour mean, the four school places with their
 *                                              nearest station, and the state of the feed
 *   GET /api/eea/series?station=&pollutant=&hours=     one station, hourly values (pollutant pm25 | pm10)
 *   GET /api/eea/compare?eui=&mid=&days=       one school sensor with PM2.5 against its nearest official station (metrics.js)
 *   GET /api/eea/status                        the feed state only
 *
 * What it does (all server side; a student's browser never talks to the EEA):
 *   1. Once a week: the station list (name, coordinates, station type and area, sampling points) from the EEA metadata download
 *      (a zip with one CSV for all of Europe, read as a stream, only the Cyprus rows are kept), or, when that fails, from the
 *      EEA station map service (coordinates and names only).
 *   2. Every hour: asks the download service for the list of Parquet files for country CY, PM2.5 and PM10, hourly values, the
 *      unverified up-to-date dataset (E2a, dataset 1), downloads each file (conditional, with the ETag), reads it with the vendored
 *      hyparquet (vendor/hyparquet, MIT), keeps the last EEA_DAYS days and saves a small JSON file on the volume.
 *   3. Anything that goes wrong becomes one log line and a "not available right now" state; the last saved data keep being served.
 *
 * Only fixed EEA hosts are ever called (see allowedHost). Requests have a User-Agent, a size cap and a time limit.
 * NOT VERIFIED from the build sandbox (no route to the EEA): the live endpoints, whether they ask for a key, the real column types
 * of the files and the time zone of their timestamps. The shapes used here come from the EEA "How to download" guide, the
 * airbase client (MIT, JohnPaton/airbase, commit efa69ce) and its test resources. See the report next to this change.
 *
 * createEea({ dataDir, root, log, getData, off, apiBase, metaUrl, stationsUrl, extraHosts, ... }) ->
 *   { start, stop, refresh, handle, snapshot, stations, series, status, nearestFor, compare, _x }
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pathToFileURL } = require('url');
const metrics = require('./metrics');
const { cleaner } = require('./feeds');

const HOUR = 3600000, DAY = 86400000;
const UA = 'SmartCitiesCyprus/1.0 (school project)';

const DEFAULTS = {
  apiBase: 'https://eeadmz1-downloads-api-appservice.azurewebsites.net',
  metaUrl: 'https://discomap.eea.europa.eu/App/AQViewer/download?fqn=Airquality_Dissem.b2g.measurements&f=csv',
  stationsUrl: 'https://air.discomap.eea.europa.eu/arcgis/rest/services/AirQuality/AirQualityDownloadServiceEUMonitoringStations/MapServer/0/query',
};
// The only hosts this module talks to (besides test hosts handed in through extraHosts).
const FIXED_HOSTS = new Set(['eeadmz1-downloads-api-appservice.azurewebsites.net', 'discomap.eea.europa.eu', 'air.discomap.eea.europa.eu']);
const BLOB_HOST = /^eeadmz1[a-z0-9-]*\.blob\.core\.windows\.net$/;   // the EEA download service's Azure storage accounts

const POLLUTANTS = { pm25: { notation: 'PM2.5', code: '6001', re: /pm\s*2[._]?5/i }, pm10: { notation: 'PM10', code: '5', re: /pm\s*10/i } };
const ID_RANGE = { pm25: [0, 1000], pm10: [0, 2000] };   // the same plausible ranges as vocab/variables.json

const clampInt = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.floor(Number(v)) || d));
const isNum = (v) => typeof v === 'number' && isFinite(v);
const r1 = (v) => (isNum(v) ? Math.round(v * 10) / 10 : null);

/* ---------- small parsers (exported for the tests) ---------- */

// One CSV row. Quotes, doubled quotes and commas inside quotes are handled.
function parseCsvRow(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const quotesOpen = (line) => (line.match(/"/g) || []).length % 2 === 1;

// "dd/mm/yyyy hh:mm:ss" as in the EEA metadata file -> ms (UTC, clock time only), or null.
function csvDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(String(s || '').trim());
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null;
}

function pollutantKey(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (/(^|\/)0*6001$/.test(s) || POLLUTANTS.pm25.re.test(s)) return 'pm25';
  if (/(^|\/)0*5$/.test(s) || POLLUTANTS.pm10.re.test(s)) return 'pm10';
  return null;
}

// Station code from a sampling point id: "SPO-CY0001A_06001_100" -> "CY0001A" (the pattern of the EEA metadata sample).
function stationOfSpo(spo) {
  const m = /(?:^|\/)SPO-([A-Z0-9]+?)_/i.exec(String(spo || '').trim());   // also "CY/SPO-...": the download files may carry the country in front
  return m ? m[1].toUpperCase() : null;
}
// ...and its pollutant: the middle number "06001" is PM2.5, "00005" is PM10.
function pollutantOfSpo(spo) {
  const m = /(?:^|\/)SPO-[A-Z0-9]+?_0*(\d+)_/i.exec(String(spo || '').trim());
  return m ? pollutantKey(m[1]) : null;
}

/* Station metadata CSV (the "DataExtract.csv" of the EEA metadata download). Streaming: feed lines in, read the result out. */
function metaCollector(country = 'CY', countryName = 'Cyprus') {
  let head = null, pending = '';
  const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const cheap = new RegExp(`SPO-${esc(country)}|"${esc(countryName)}"|^${esc(countryName)},`, 'i');
  const stations = new Map();
  let rows = 0, kept = 0;
  const col = (name) => (head ? head.get(name) : undefined);
  function row(f) {
    const get = (n) => { const i = col(n); return i == null ? '' : String(f[i] || '').trim(); };
    const spo = get('sampling point id');
    const cname = get('country');
    if (!(stationOfSpo(spo) || '').startsWith(country) && cname.toLowerCase() !== countryName.toLowerCase()) return;
    const pk = pollutantKey(get('air pollutant'));
    if (!pk) return;
    const id = (get('air quality station eoi code') || stationOfSpo(spo) || '').toUpperCase();
    const lat = Number(get('latitude')), lng = Number(get('longitude'));
    if (!id || !isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return;
    kept++;
    const end = csvDate(get('operational activity end'));
    const st = stations.get(id) || { id, name: get('air quality station name') || id, lat, lng, type: null, area: null, municipality: null, tz: null, spo: {} };
    st.type = (get('air quality station type') || st.type || '').toLowerCase() || null;
    st.area = (get('air quality station area') || st.area || '').toLowerCase() || null;
    st.municipality = get('municipality') || st.municipality || null;
    st.tz = get('timezone') || st.tz || null;
    if (spo) st.spo[spo] = { p: pk, end };
    stations.set(id, st);
  }
  function line(l) {
    if (!l) return;
    if (pending) { pending += '\n' + l; if (quotesOpen(pending)) return; l = pending; pending = ''; }
    else if (quotesOpen(l)) { pending = l; return; }
    if (!head) {
      const f = parseCsvRow(l.replace(/^﻿/, ''));
      head = new Map(f.map((n, i) => [n.trim().toLowerCase(), i]));
      return;
    }
    if (!cheap.test(l)) { rows++; return; }   // cheap filter before parsing: the file holds all of Europe
    rows++;
    row(parseCsvRow(l));
  }
  return { line, result: () => ({ stations: [...stations.values()], rows, kept, hasHeader: !!head }) };
}

// Cyprus is on UTC+2 all year in the EEA files ("UTC+02"); the offset is read from the metadata when present.
function tzHours(tz, dflt = 2) {
  const m = /^UTC\s*([+-]\d{1,2})(?::?(\d{2}))?$/i.exec(String(tz || '').trim());
  return m ? Number(m[1]) + (m[2] ? Math.sign(Number(m[1]) || 1) * Number(m[2]) / 60 : 0) : dflt;
}

/* A Parquet "Start" value (Date, ms number, bigint or text) -> the real instant in ms.
 * Dates and "2026-11-12 14:00:00" text carry no zone, so they are read as local time of the station (UTC+offset hours): an
 * ASSUMPTION about the EEA files (the guide only says "yyyy-mm-dd H:M:S"); text with an explicit zone is taken as written. */
function instantOf(v, offsetH) {
  if (v == null) return null;
  if (v instanceof Date) return isFinite(v.getTime()) ? v.getTime() - offsetH * HOUR : null;
  if (typeof v === 'bigint') v = Number(v);
  if (typeof v === 'number') {
    if (!isFinite(v)) return null;
    const a = Math.abs(v);
    const ms = a >= 1e17 ? v / 1e6 : a >= 1e14 ? v / 1e3 : a < 1e11 ? v * 1000 : v;   // nanoseconds, microseconds, seconds or milliseconds
    return ms - offsetH * HOUR;
  }
  const s = String(v).trim();
  const z = /(Z|[+-]\d{2}:?\d{2})$/.exec(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (z) { const o = z[1] === 'Z' ? 0 : (z[1][0] === '-' ? -1 : 1) * (Number(z[1].slice(1, 3)) * 60 + Number(z[1].slice(-2))) / 60; return naive - o * HOUR; }
  return naive - offsetH * HOUR;
}

function unitFactor(u) {
  const s = String(u == null ? 'ug/m3' : u).toLowerCase().replace(/[µμ]/g, 'u').replace(/³/g, '3').replace(/\^/g, '').replace(/\s+/g, '');
  if (/^ug[./]?m-?3$/.test(s)) return 1;
  if (/^mg[./]?m-?3$/.test(s)) return 1000;
  if (/^ng[./]?m-?3$/.test(s)) return 0.001;
  return null;
}

const lower = (o) => { const m = {}; for (const k of Object.keys(o)) m[k.toLowerCase()] = k; return m; };

// One station for the Layers page. Each pollutant keeps the end of ITS OWN newest hour (pm25Time, pm10Time): a fresh PM2.5 value must not
// lend its time to an old PM10 value. "time" is the newer of the two and is only a label for the station. An unknown time stays null.
function snapshotPoint(s) {
  const end = (x) => (x && isFinite(x.t) ? new Date(x.t + HOUR).toISOString() : null);
  const t25 = end(s.pm25), t10 = end(s.pm10);
  return { id: s.id, name: s.name, lat: s.lat, lng: s.lng, type: s.type, area: s.area, pm25: s.pm25 ? s.pm25.v : null, pm10: s.pm10 ? s.pm10.v : null, pm25Time: t25, pm10Time: t10,
    time: t25 || t10 ? new Date(Math.max(t25 ? Date.parse(t25) : 0, t10 ? Date.parse(t10) : 0)).toISOString() : null };
}

/* The rows of one Parquet file -> hourly values per sampling point: Map("STATION|pm25|SPO-ID") -> { hours: Map(hourStartMs -> [sum, n]),
 * first: earliest Start seen (any row), station, pk, spo }. Keeps hourly rows that are valid (Validity > 0) with a plausible value
 * and reports what it skipped. */
function foldRows(rows, { offsetOf, fromMs, nowMs, spoHint }) {
  const out = new Map();
  const info = { rows: rows.length, kept: 0, invalid: 0, notHourly: 0, unit: 0, range: 0, future: 0, old: 0, noStation: 0, firstStart: null, lastStart: null, resultTime: null };
  if (!rows.length) return { out, info };
  const keys = lower(rows[0]);
  const K = (n) => keys[n];
  for (const r of rows) {
    const spo = String(r[K('samplingpoint')] != null ? r[K('samplingpoint')] : spoHint || '').trim();
    const station = stationOfSpo(spo);
    const pk = pollutantKey(r[K('pollutant')]) || pollutantOfSpo(spo);
    if (!station || !pk) { info.noStation++; continue; }
    const agg = r[K('aggtype')];
    if (agg != null && !/^(hour|1|hourly)$/i.test(String(agg))) { info.notHourly++; continue; }
    const off = offsetOf(station);
    const t0 = instantOf(r[K('start')], off);
    if (t0 == null) { info.notHourly++; continue; }
    const t1 = r[K('end')] != null ? instantOf(r[K('end')], off) : t0 + HOUR;
    if (t1 != null && Math.abs(t1 - t0 - HOUR) > 1000) { info.notHourly++; continue; }
    const h = Math.floor(t0 / HOUR) * HOUR;
    const key = station + '|' + pk + '|' + spo;
    let m = out.get(key);
    if (!m) { m = { hours: new Map(), first: h, station, pk, spo }; out.set(key, m); }
    if (h < m.first) m.first = h;
    if (info.firstStart == null || r[K('start')] < info.firstStart) info.firstStart = r[K('start')];
    if (info.lastStart == null || r[K('start')] > info.lastStart) info.lastStart = r[K('start')];
    if (r[K('resulttime')] != null) info.resultTime = r[K('resulttime')];
    const val = Number(r[K('value')]);
    const validity = r[K('validity')];
    if ((validity != null && !(Number(validity) > 0)) || !isFinite(val) || r[K('value')] == null) { info.invalid++; continue; }
    const f = unitFactor(r[K('unit')]);
    if (f == null) { info.unit++; continue; }
    const v = val * f;
    if (v < ID_RANGE[pk][0] || v > ID_RANGE[pk][1]) { info.range++; continue; }
    if (h < fromMs) { info.old++; continue; }
    if (h > nowMs + 90 * 60000) { info.future++; continue; }   // an hour that has not happened: a wrong time zone or a bad row
    const a = m.hours.get(h);
    if (a) { a[0] += v; a[1]++; } else m.hours.set(h, [v, 1]);
    info.kept++;
  }
  return { out, info };
}

/* ---------- the module ---------- */

function createEea(opts = {}) {
  const root = opts.root || __dirname;
  const log = opts.log || ((m) => console.log(m));
  const clean = cleaner([]);
  const getData = opts.getData || (() => null);
  const apiBase = String(opts.apiBase || DEFAULTS.apiBase).replace(/\/$/, '');
  const metaUrl = opts.metaUrl || DEFAULTS.metaUrl;
  const stationsUrl = opts.stationsUrl || DEFAULTS.stationsUrl;
  const days = clampInt(opts.days, 2, 60, 35);                           // how many days of hours are kept
  const everyMs = clampInt(opts.everyMin, 1, 1440, 60) * 60000;
  const timeoutMs = clampInt(opts.timeoutMs, 200, 20000, 20000);         // per request, never more than 20 s
  const metaDeadlineMs = clampInt(opts.metaDeadlineMs, 1000, 120000, 90000);   // the metadata download may be big: idle limit above, overall limit here
  const maxFileBytes = clampInt(opts.maxFileBytes, 1000, 60e6, 25e6);
  const maxTotalBytes = clampInt(opts.maxTotalBytes, 1000, 400e6, 150e6);
  const maxMetaBytes = clampInt(opts.maxMetaBytes, 1000, 300e6, 120e6);
  const maxRowsPerFile = clampInt(opts.maxRowsPerFile, 100, 5e6, 800000);
  const maxFiles = clampInt(opts.maxFiles, 1, 400, 120);
  const metaEveryMs = clampInt(opts.metaEveryDays, 1, 60, 7) * DAY;
  const off = Boolean(opts.off);
  const offReason = opts.offReason || '';
  const dir = opts.dataDir ? path.join(opts.dataDir, 'eea') : null;
  const file = dir ? path.join(dir, 'cy-pm.json') : null;
  const extra = new Set((opts.extraHosts || []).map((h) => String(h).toLowerCase()));
  const nowFn = opts.now || Date.now;

  let places = null;
  const loadPlaces = () => {
    if (places) return places;
    try { const p = JSON.parse(fs.readFileSync(path.join(root, 'vocab', 'places.json'), 'utf8')); places = Object.fromEntries(Object.entries(p).filter(([k, v]) => k[0] !== '_' && v && isFinite(v.lat))); } catch (e) { places = {}; }
    return places;
  };

  /* ----- state: what is saved on the volume ----- */
  let S = { v: 2, savedAt: null, meta: null, series: {}, etags: {} };
  const st = { running: false, lastRun: null, lastOk: null, lastError: null, nextRun: null, fails: 0, lastInfo: null, loaded: false, startedAt: null };
  const warned = new Set();
  const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); log(msg); } };

  function load() {
    if (!file) return;
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (j && j.v === 2 && j.series && typeof j.series === 'object') { S = { v: 2, savedAt: j.savedAt || null, meta: j.meta || null, series: j.series, etags: Object.keys(j.series).length ? (j.etags || {}) : {} }; st.loaded = true; }   // no values saved: forget the ETags too, or an unchanged file would never be read again
    } catch (e) { /* nothing saved yet, or damaged: start empty */ }
  }
  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      S.savedAt = nowFn();
      fs.writeFileSync(file + '.tmp', JSON.stringify(S));
      fs.renameSync(file + '.tmp', file);
    } catch (e) { warnOnce('save', `EEA air quality: cannot save the cache: ${clean(e.message)}`); }
  }

  /* ----- network: fixed hosts only, redirects checked, size and time limits ----- */
  function allowedHost(u) {
    let x;
    try { x = new URL(u); } catch (e) { return false; }
    if (x.username || x.password) return false;
    const h = x.hostname.toLowerCase(), hp = x.host.toLowerCase();
    if (extra.has(hp) || extra.has(h)) return x.protocol === 'https:' || x.protocol === 'http:';
    if (x.protocol !== 'https:') return false;
    return FIXED_HOSTS.has(h) || BLOB_HOST.test(h);
  }
  async function request(url, { method = 'GET', headers = {}, body = null, timeout = timeoutMs, signal = null } = {}) {
    let cur = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!allowedHost(cur)) throw Object.assign(new Error('refused to call a host that is not on the EEA list'), { code: 'host' });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeout);
      if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
      let res;
      try {
        res = await fetch(cur, { method, headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, body, redirect: 'manual', signal: ctl.signal });
      } catch (e) { clearTimeout(timer); throw Object.assign(new Error(ctl.signal.aborted ? `no answer within ${Math.round(timeout / 1000)} s` : (e.cause && e.cause.code) || e.message || 'network error'), { code: ctl.signal.aborted ? 'timeout' : 'network' }); }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        clearTimeout(timer);
        try { await res.body.cancel(); } catch (e) { /* ignore */ }
        cur = new URL(res.headers.get('location'), cur).href;
        continue;
      }
      return { res, ctl, timer, url: cur };
    }
    throw Object.assign(new Error('too many redirects'), { code: 'redirect' });
  }
  // Reads a body up to maxBytes; the time limit is an idle limit (a new chunk resets it) plus an overall one.
  async function readBody(call, maxBytes, { overallMs = null, onChunk = null } = {}) {
    const reader = call.res.body.getReader();
    const chunks = [];
    let total = 0, timer = call.timer;
    const overall = overallMs ? setTimeout(() => call.ctl.abort(), overallMs) : null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        clearTimeout(timer); timer = setTimeout(() => call.ctl.abort(), timeoutMs);
        total += value.length;
        if (total > maxBytes) { try { await reader.cancel(); } catch (e) { /* ignore */ } throw Object.assign(new Error(`answer is bigger than ${Math.round(maxBytes / 1e6)} MB`), { code: 'size' }); }
        if (onChunk) { if (await onChunk(value) === false) { try { await reader.cancel(); } catch (e2) { /* ignore */ } break; } } else chunks.push(value);
      }
    } catch (e) {
      if (e && e.code) throw e;
      throw Object.assign(new Error(call.ctl.signal.aborted ? 'the download stopped (no data for too long)' : e.message), { code: call.ctl.signal.aborted ? 'timeout' : 'network' });
    } finally { clearTimeout(timer); if (overall) clearTimeout(overall); }
    return { buf: onChunk ? null : Buffer.concat(chunks), total };
  }
  async function getBuffer(url, opts2 = {}) {
    const call = await request(url, opts2);
    if (call.res.status === 304) { clearTimeout(call.timer); return { status: 304, headers: call.res.headers, buf: null }; }
    if (!call.res.ok) { clearTimeout(call.timer); try { await call.res.body.cancel(); } catch (e) { /* ignore */ } throw Object.assign(new Error(`HTTP ${call.res.status}`), { code: 'http', status: call.res.status }); }
    const len = Number(call.res.headers.get('content-length'));
    if (len > (opts2.maxBytes || maxFileBytes)) { clearTimeout(call.timer); try { await call.res.body.cancel(); } catch (e) { /* ignore */ } throw Object.assign(new Error(`answer is bigger than ${Math.round((opts2.maxBytes || maxFileBytes) / 1e6)} MB`), { code: 'size' }); }
    const { buf } = await readBody(call, opts2.maxBytes || maxFileBytes);
    return { status: call.res.status, headers: call.res.headers, buf };
  }

  /* ----- step 1: stations ----- */
  async function downloadMeta() {
    const call = await request(metaUrl);
    if (!call.res.ok) { clearTimeout(call.timer); throw Object.assign(new Error(`metadata download: HTTP ${call.res.status}`), { code: 'http' }); }
    const col = metaCollector('CY', 'Cyprus');
    const dec = new TextDecoder('utf-8');
    let tail = '';
    const onText = (u8) => {
      const txt = tail + dec.decode(u8, { stream: true });
      const parts = txt.split(/\r?\n/);
      tail = parts.pop();
      for (const l of parts) col.line(l);
    };
    // A zip with one deflated CSV (as in the airbase client: DataExtract.csv.zip), or the CSV itself.
    let head = Buffer.alloc(0), mode = null, inflater = null, endedFlag = false, stored = 0;
    const ended = new Promise((resolve) => { call._done = resolve; });
    const feed = async (u8) => {
      let b = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
      if (mode === null) {
        head = Buffer.concat([head, b]);
        if (head.length < 30) return true;
        if (head.readUInt32LE(0) !== 0x04034b50) { mode = 'text'; onText(head); head = null; return true; }
        const need = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
        if (head.length < need) return true;
        const flags = head.readUInt16LE(6), method = head.readUInt16LE(8), csize = head.readUInt32LE(18);
        b = head.subarray(need); head = null;
        if (method === 8) {
          mode = 'zip';
          inflater = zlib.createInflateRaw();
          inflater.on('data', (d) => onText(d));
          inflater.on('end', () => { endedFlag = true; call._done(); });
          inflater.on('error', (e) => { call._err = e; call._done(); });
        } else if (method === 0 && !(flags & 8)) { mode = 'stored'; stored = csize; }
        else throw Object.assign(new Error('the metadata zip uses a layout this server cannot read'), { code: 'zip' });
      }
      if (mode === 'text') { onText(b); return true; }
      if (mode === 'stored') { const part = b.subarray(0, stored); stored -= part.length; onText(part); if (!stored) { endedFlag = true; call._done(); return false; } return true; }
      if (mode === 'zip') {
        if (endedFlag || call._err) return false;
        if (!inflater.write(b)) await new Promise((r) => {
          const done = () => { inflater.off('drain', done); inflater.off('end', done); inflater.off('error', done); r(); };
          inflater.once('drain', done); inflater.once('end', done); inflater.once('error', done);
        });
        return !(endedFlag || call._err);
      }
      return true;
    };
    await readBody(call, maxMetaBytes, { overallMs: metaDeadlineMs, onChunk: feed });
    if (mode === 'zip' && !endedFlag && !call._err) { inflater.end(); await Promise.race([ended, new Promise((r) => setTimeout(r, 2000))]); }
    if (mode === 'zip' && !endedFlag && !call._err) call._err = new Error('truncated');
    if (call._err) throw Object.assign(new Error('the metadata zip is damaged'), { code: 'zip' });
    if (tail) col.line(tail);
    const r = col.result();
    if (!r.hasHeader) throw Object.assign(new Error('the metadata file had no header line'), { code: 'format' });
    if (!r.stations.length) throw Object.assign(new Error(`the metadata file held no PM2.5 or PM10 sampling points for Cyprus (${r.rows} rows read)`), { code: 'format' });
    return { src: 'csv', at: nowFn(), stations: r.stations };
  }

  // Fallback: the EEA station map service (ArcGIS REST). Coordinates and names only; the type is not read.
  async function downloadStationsMap() {
    const u = stationsUrl + (stationsUrl.includes('?') ? '&' : '?') + new URLSearchParams({ where: "CountryCode='CY'", outFields: 'AirQualityStationEoICode,AQStationName,stationClass', returnGeometry: 'true', outSR: '4326', f: 'json' }).toString();
    const { buf } = await getBuffer(u, { maxBytes: 5e6 });
    let j;
    try { j = JSON.parse(buf.toString('utf8')); } catch (e) { throw Object.assign(new Error('the station map service did not send JSON'), { code: 'format' }); }
    const stations = [];
    for (const f of (j && j.features) || []) {
      const a = f.attributes || {}, g = f.geometry || {};
      const id = String(a.AirQualityStationEoICode || '').toUpperCase();
      if (id && isFinite(g.x) && isFinite(g.y)) stations.push({ id, name: a.AQStationName || id, lat: g.y, lng: g.x, type: null, area: null, municipality: null, tz: null, spo: {} });
    }
    if (!stations.length) throw Object.assign(new Error('the station map service listed no Cyprus stations'), { code: 'format' });
    return { src: 'arcgis', at: nowFn(), stations };
  }

  async function ensureMeta() {
    const m = S.meta;
    if (m && m.stations && m.stations.length && nowFn() - m.at < metaEveryMs && m.src === 'csv') return m;
    try { S.meta = await downloadMeta(); return S.meta; } catch (e1) {
      warnOnce('meta1:' + e1.message, `EEA air quality: station metadata download failed (${clean(e1.message)}); trying the station map service`);
      try {
        const g = await downloadStationsMap();
        // keep the types we already know from an older metadata file
        if (m && m.stations) for (const s of g.stations) { const o = m.stations.find((x) => x.id === s.id); if (o) { s.type = o.type; s.area = o.area; s.municipality = o.municipality; s.tz = o.tz; s.spo = o.spo; } }
        S.meta = g; return g;
      } catch (e2) {
        if (m && m.stations && m.stations.length) { warnOnce('meta2:' + e2.message, `EEA air quality: no new station list (${clean(e2.message)}); keeping the saved one`); return m; }
        throw Object.assign(new Error(`no station list: ${clean(e1.message)}; ${clean(e2.message)}`), { code: 'meta' });
      }
    }
  }

  /* ----- step 2: the Parquet files ----- */
  let hq = null;
  async function hyparquet() {
    if (!hq) hq = await import(pathToFileURL(path.join(root, 'vendor', 'hyparquet', 'src', 'index.js')).href);
    return hq;
  }
  // hyparquet reads uncompressed and Snappy files itself. The other codecs come from node:zlib; LZ4 and LZO have no reader here.
  const compressors = {
    GZIP: (input) => new Uint8Array(zlib.gunzipSync(input)),
    BROTLI: (input) => new Uint8Array(zlib.brotliDecompressSync(input)),
  };
  if (typeof zlib.zstdDecompressSync === 'function') compressors.ZSTD = (input) => new Uint8Array(zlib.zstdDecompressSync(input));
  const supportedCodecs = () => ['UNCOMPRESSED', 'SNAPPY', ...Object.keys(compressors)];

  async function readParquet(buf) {
    const lib = await hyparquet();
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    let meta;
    try { meta = lib.parquetMetadata(ab); } catch (e) { throw Object.assign(new Error(`not a readable Parquet file: ${e.message}`), { code: 'format' }); }
    if (Number(meta.num_rows) > maxRowsPerFile) throw Object.assign(new Error(`file has ${meta.num_rows} rows, more than the limit ${maxRowsPerFile}`), { code: 'size' });
    const names = (meta.schema || []).map((s) => s.name);
    const want = ['samplingpoint', 'pollutant', 'start', 'end', 'value', 'unit', 'aggtype', 'validity', 'verification', 'resulttime'];
    const columns = names.filter((n) => want.includes(String(n).toLowerCase()));
    if (!columns.some((n) => String(n).toLowerCase() === 'value') || !columns.some((n) => String(n).toLowerCase() === 'start')) throw Object.assign(new Error(`file has no Start/Value columns (columns: ${names.slice(1, 12).join(', ')})`), { code: 'format' });
    try {
      return await lib.parquetReadObjects({ file: ab, columns, compressors });
    } catch (e) {
      const m = /unsupported compression codec: (\w+)/.exec(e.message || '');
      if (m) throw Object.assign(new Error(`the files use the ${m[1]} compression codec, which this server cannot read (it reads ${supportedCodecs().join(', ')})`), { code: 'codec', codec: m[1] });
      throw Object.assign(new Error(`not a readable Parquet file: ${e.message}`), { code: 'format' });
    }
  }

  async function listUrls(nowMs) {
    const mk = (withDates) => JSON.stringify({
      countries: ['CY'], cities: [], pollutants: [POLLUTANTS.pm25.notation, POLLUTANTS.pm10.notation], dataset: 1, source: 'API', aggregationType: 'hour',
      ...(withDates ? { dateTimeStart: new Date(nowMs - (days + 2) * DAY).toISOString().replace(/\.\d+Z$/, 'Z'), dateTimeEnd: new Date(nowMs).toISOString().replace(/\.\d+Z$/, 'Z') } : {}),
    });
    const ask = async (withDates) => {
      const { buf } = await getBuffer(apiBase + '/ParquetFile/urls', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/csv, text/plain, */*' }, body: mk(withDates), maxBytes: 2e6 });
      const text = buf.toString('utf8');
      let lines;
      try { const j = text.trim().startsWith('[') ? JSON.parse(text) : null; lines = Array.isArray(j) ? j.map((x) => (typeof x === 'string' ? x : x && (x.url || x.fileUrl || x.ParquetFileUrl))) : null; } catch (e) { lines = null; }
      if (!lines) lines = text.split(/\r?\n/);   // the documented answer: a CSV with one address per line (header "ParquetFileUrl")
      return [...new Set(lines.map((l) => String(l || '').trim().replace(/^"|"$/g, '')).filter((l) => /^https?:\/\//i.test(l)))];
    };
    let urls = await ask(true);
    if (!urls.length) urls = await ask(false);   // some services ignore or reject a date range: ask once without it
    const ok = urls.filter((u) => allowedHost(u));
    if (ok.length < urls.length) warnOnce('urlhost', `EEA air quality: ${urls.length - ok.length} file addresses are on hosts that are not on the EEA list and were skipped`);
    return ok.slice(0, maxFiles);
  }

  const offsetOfStation = (id) => {
    if (opts.tzForce != null && opts.tzForce !== '' && isFinite(Number(opts.tzForce))) return Number(opts.tzForce);   // EEA_TZ_HOURS: a quick fix if the real files turn out to use another clock
    const s = S.meta && S.meta.stations && S.meta.stations.find((x) => x.id === id);
    return tzHours(s && s.tz, opts.tzHours != null ? Number(opts.tzHours) : 2);
  };

  // S.series[station][pollutant][samplingPoint] = { t0, v: [hourly values or null] }. A file is the whole truth for its sampling
  // point from its first row on, so the stored hours from there on are replaced (a value that became invalid disappears).
  function merge(folded, nowMs) {
    const cut = Math.floor((nowMs - days * DAY) / HOUR) * HOUR;
    let touched = 0;
    for (const m of folded.values()) {
      const byPk = (S.series[m.station] = S.series[m.station] || {});
      const bySpo = (byPk[m.pk] = byPk[m.pk] || {});
      const cur = bySpo[m.spo] || { t0: cut, v: [] };
      const map = new Map();
      cur.v.forEach((v, i) => { if (v != null) map.set(cur.t0 + i * HOUR, v); });
      for (const h of [...map.keys()]) if (h >= m.first) map.delete(h);
      for (const [h, a] of m.hours) { map.set(h, r1(a[0] / a[1])); touched++; }
      for (const h of [...map.keys()]) if (h < cut) map.delete(h);
      if (!map.size) { delete bySpo[m.spo]; continue; }
      const t0 = Math.min(...map.keys()), t1 = Math.max(...map.keys());
      const v = new Array((t1 - t0) / HOUR + 1).fill(null);
      for (const [h, x] of map) v[(h - t0) / HOUR] = x;
      bySpo[m.spo] = { t0, v };
    }
    for (const stn of Object.keys(S.series)) {
      for (const pk of Object.keys(S.series[stn])) if (!Object.keys(S.series[stn][pk]).length) delete S.series[stn][pk];
      if (!Object.keys(S.series[stn]).length) delete S.series[stn];
    }
    return touched;
  }

  const ekey = (u) => String(u).split('?')[0];   // a file address may carry an access token: the saved ETag list keeps no query string
  let running = null;
  function refresh() {
    if (off) return Promise.resolve(false);
    if (running) return running;
    running = (async () => {
      st.running = true; st.lastRun = nowFn();
      const info = { files: 0, ok: 0, notModified: 0, failed: 0, rows: 0, kept: 0, bytes: 0, codecs: [], skipped: {}, firstStart: null, lastStart: null, resultTime: null };
      try {
        const nowMs = nowFn();
        await ensureMeta();
        const urls = await listUrls(nowMs);
        info.files = urls.length;
        if (!urls.length) throw Object.assign(new Error('the download service listed no files for Cyprus PM2.5 / PM10'), { code: 'empty' });
        const folded = new Map();
        const errs = [];
        let next = 0, diagDone = false;
        const fromMs = Math.floor((nowMs - days * DAY) / HOUR) * HOUR;
        const worker = async () => {
          while (next < urls.length) {
            const url = urls[next++];
            if (info.bytes > maxTotalBytes) { info.skipped.budget = (info.skipped.budget || 0) + 1; continue; }
            try {
              const hdr = S.etags[ekey(url)] ? { 'If-None-Match': S.etags[ekey(url)] } : {};
              const got = await getBuffer(url, { headers: hdr });
              if (got.status === 304) { info.notModified++; continue; }
              info.bytes += got.buf.length;
              const rows = await readParquet(got.buf);
              const spoHint = (/\/(SPO-[^/]+?)\.parquet/i.exec(url) || [])[1] || null;
              const f = foldRows(rows, { offsetOf: offsetOfStation, fromMs, nowMs, spoHint });
              if (f.info.noStation && !diagDone) {   // once per update: what a file really looks like, so a wrong guess about its columns can be read from the log
                diagDone = true;
                try { log(`EEA air quality: ${f.info.noStation} of ${rows.length} rows matched no station; file ...${ekey(url).slice(-60)}; spoHint ${spoHint}; columns ${Object.keys(rows[0] || {}).slice(0, 24).join(',')}; first row ${JSON.stringify(rows[0] || {}, (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 400)}`); } catch (e) { /* diagnostic only */ }
              }
              info.rows += f.info.rows; info.kept += f.info.kept;
              for (const k of ['invalid', 'notHourly', 'unit', 'range', 'future', 'noStation']) if (f.info[k]) info.skipped[k] = (info.skipped[k] || 0) + f.info[k];
              if (f.info.firstStart != null && info.firstStart == null) info.firstStart = f.info.firstStart;
              if (f.info.lastStart != null) info.lastStart = f.info.lastStart;
              if (f.info.resultTime != null) info.resultTime = f.info.resultTime;
              for (const [k, m] of f.out) {
                const have = folded.get(k);
                if (!have) { folded.set(k, m); continue; }
                have.first = Math.min(have.first, m.first);
                for (const [h, a] of m.hours) { const c = have.hours.get(h); if (c) { c[0] += a[0]; c[1] += a[1]; } else have.hours.set(h, [a[0], a[1]]); }
              }
              const et = got.headers.get('etag');
              if (et && !(f.info.noStation && !f.info.kept)) S.etags[ekey(url)] = et;   // a file we could not use is not remembered as done
              info.ok++;
            } catch (e) {
              info.failed++;
              errs.push(e);
              if (e.code === 'codec' && !info.codecs.includes(e.codec)) info.codecs.push(e.codec);
            }
          }
        };
        await Promise.all([worker(), worker()]);
        if (!info.ok && !info.notModified) {
          const first = errs.find((e) => e.code === 'codec') || errs[0];
          throw Object.assign(new Error(`none of the ${urls.length} files could be read: ${first ? first.message : 'unknown'}`), { code: first && first.code });
        }
        // ETags only for files we read: drop the ones for addresses that are no longer listed
        const live = new Set(urls.map(ekey));
        for (const u of Object.keys(S.etags)) if (!live.has(u)) delete S.etags[u];
        const touched = merge(folded, nowMs);
        save();
        if (st.fails) { log('EEA air quality: working again'); for (const k of [...warned]) if (k.startsWith('err:') || k.startsWith('partial:')) warned.delete(k); }
        st.lastOk = nowFn(); st.lastError = null; st.fails = 0;
        st.lastInfo = info;
        if (!st.firstOkLogged) { st.firstOkLogged = true; log(`EEA air quality: first update done: ${info.ok} files read, ${info.notModified} unchanged, ${info.failed} failed, ${info.kept} hourly values kept (${touched} hours), first Start ${fmtRaw(info.firstStart)}, last Start ${fmtRaw(info.lastStart)}, ResultTime ${fmtRaw(info.resultTime)}, skipped ${JSON.stringify(info.skipped)}`); }
        else if (info.failed) warnOnce('partial:' + info.failed, `EEA air quality: ${info.failed} of ${info.files} files could not be read this time`);
        return true;
      } catch (e) {
        st.lastError = { at: nowFn(), message: clean(e.message), code: e.code || null };
        st.fails++;
        st.lastInfo = info;
        warnOnce('err:' + (e.code || '') + ':' + clean(e.message), `EEA air quality: not available right now: ${clean(e.message)}${st.loaded || S.savedAt ? ' (serving the last saved data)' : ''}`);
        return false;
      } finally { st.running = false; running = null; }
    })();
    return running;
  }
  const fmtRaw = (v) => (v == null ? 'none' : v instanceof Date ? v.toISOString() : String(v).slice(0, 25));

  /* ----- scheduling ----- */
  let timer = null, stopped = false;
  function plan(ms) {
    if (stopped) return;
    st.nextRun = nowFn() + ms;
    timer = setTimeout(async () => { try { await refresh(); } finally { plan(st.fails ? Math.min(everyMs, 15 * 60000 * 2 ** Math.min(2, st.fails - 1)) : everyMs); } }, ms);
    if (timer.unref) timer.unref();
  }
  function start({ firstDelayMs = 15000 } = {}) {
    if (off) { log(`EEA air quality: off${offReason ? ' (' + offReason + ')' : ''}`); return; }
    load();
    st.startedAt = nowFn();
    stopped = false;
    log(`EEA air quality: ${st.loaded ? 'saved data loaded' : 'no saved data yet'}; first update in ${Math.round(firstDelayMs / 1000)} s, then every ${Math.round(everyMs / 60000)} min`);
    plan(firstDelayMs);
  }
  function stop() { stopped = true; if (timer) clearTimeout(timer); }

  /* ----- reading what we hold ----- */
  const stationMeta = () => (S.meta && S.meta.stations) || [];
  // Hourly values of a station: the mean over its sampling points of that pollutant.
  const hoursOf = (station, pk) => {
    const bySpo = (S.series[station] && S.series[station][pk]) || {};
    const acc = new Map();
    for (const s of Object.values(bySpo)) s.v.forEach((v, i) => { if (v == null) return; const h = s.t0 + i * HOUR, a = acc.get(h); if (a) { a[0] += v; a[1]++; } else acc.set(h, [v, 1]); });
    const m = new Map();
    for (const [h, a] of acc) m.set(h, r1(a[0] / a[1]));
    return m;
  };
  function summary(station, pk, nowMs) {
    const m = hoursOf(station, pk);
    if (!m.size) return null;
    const last = Math.max(...m.keys());
    const from = nowMs - 24 * HOUR;
    const v24 = [...m].filter(([h]) => h >= from).map(([, v]) => v);
    return { t: last, v: m.get(last), n24: v24.length, mean24: v24.length ? r1(v24.reduce((a, b) => a + b, 0) / v24.length) : null, ageMin: Math.max(0, Math.round((nowMs - (last + HOUR)) / 60000)) };
  }
  function stations() {
    const nowMs = nowFn();
    const out = [];
    for (const s of stationMeta()) {
      const pm25 = summary(s.id, 'pm25', nowMs), pm10 = summary(s.id, 'pm10', nowMs);
      if (!pm25 && !pm10) continue;
      out.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, type: s.type, area: s.area, municipality: s.municipality, pm25, pm10 });
    }
    return out;
  }
  const km = (a, b) => {
    const R = 6371, rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  // The nearest station with PM data of the kind asked for in the last `withinH` hours.
  function nearestFor(lat, lng, pk = 'pm25', withinH = 24 * 7) {
    const nowMs = nowFn();
    let best = null;
    for (const s of stationMeta()) {
      const m = hoursOf(s.id, pk);
      if (!m.size || Math.max(...m.keys()) < nowMs - withinH * HOUR) continue;
      const d = km([lat, lng], [s.lat, s.lng]);
      if (!best || d < best.km) best = { station: s, km: d };
    }
    return best;
  }
  function series(stationId, pk, hours = 48) {
    const nowMs = nowFn();
    const m = hoursOf(stationId, pk);
    const from = nowMs - hours * HOUR;
    return [...m].filter(([h]) => h >= from).sort((a, b) => a[0] - b[0]);
  }

  function status() {
    const nowMs = nowFn();
    const list = stations();
    const newest = list.reduce((t, s) => Math.max(t, (s.pm25 && s.pm25.t) || 0, (s.pm10 && s.pm10.t) || 0), 0);
    return {
      state: off ? 'off' : list.length ? 'ok' : st.lastError ? 'down' : st.lastOk ? 'empty' : 'waiting',
      off, reason: off ? offReason : null, lastRun: st.lastRun, lastOk: st.lastOk, nextRun: st.nextRun, running: st.running,
      lastError: st.lastError, fails: st.fails, stations: list.length, newestHour: newest || null, ageMin: newest ? Math.max(0, Math.round((nowMs - (newest + HOUR)) / 60000)) : null,
      savedAt: S.savedAt, metaFrom: S.meta ? S.meta.src : null, metaAt: S.meta ? S.meta.at : null, days,
      lastInfo: st.lastInfo && { files: st.lastInfo.files, ok: st.lastInfo.ok, notModified: st.lastInfo.notModified, failed: st.lastInfo.failed, kept: st.lastInfo.kept, codecs: st.lastInfo.codecs, skipped: st.lastInfo.skipped },
    };
  }

  // For layers.js: the same shape as the Met Office feed (points with a time), values are the latest hour.
  function snapshot() {
    const list = stations();
    return {
      points: list.map(snapshotPoint),
      updated: S.savedAt ? new Date(S.savedAt).toISOString() : null,
      status: status(),
    };
  }

  /* ----- the comparison ----- */
  const PM25_NAME = /pm\s*2[._ ]?5/i;
  const placeOf = (dev) => {
    const text = `${dev.group || ''} ${dev.name || ''}`.toLowerCase();
    const p = loadPlaces();
    const id = Object.keys(p).find((k) => (p[k].words || []).some((w) => text.includes(w)));
    return id ? { id, name: p[id].name, lat: p[id].lat, lng: p[id].lng } : null;
  };
  const cmpCache = new Map();
  async function compare({ eui, mid, days: d }) {
    const data = getData();
    if (!data || !data.devices || !data.series) return { ok: false, reason: 'no-sensor-data' };
    const nd = clampInt(d, 1, 7, 7);
    const key = `${eui}|${mid}|${nd}`;
    const hit = cmpCache.get(key);
    if (hit && nowFn() - hit.at < 60000) return hit.v;
    const names = data.names ? data.names() : {};
    const nm = names[mid] && names[mid][0];
    if (!nm || !PM25_NAME.test(String(nm))) return { ok: false, reason: 'not-pm25' };
    const devices = await data.devices();
    const dev = (devices || []).find((x) => x.eui === eui);
    if (!dev || !(dev.measurements || []).map(String).includes(String(mid))) return { ok: false, reason: 'unknown-sensor' };
    const place = placeOf(dev);
    if (!place) return { ok: false, reason: 'no-place' };
    const near = nearestFor(place.lat, place.lng, 'pm25');
    if (!near) return { ok: false, reason: S.series && Object.keys(S.series).length ? 'no-station-pm25' : 'eea-unavailable', eea: status() };
    const nowMs = nowFn();
    const from = nowMs - nd * DAY;
    let pts;
    try { pts = (await data.series(eui, String(mid), nd)).filter((p) => isNum(p.t) && isNum(p.v)); } catch (e) { return { ok: false, reason: 'sensor-series-failed', error: clean(e.message, 120) }; }
    const ref = hoursOf(near.station.id, 'pm25');
    const c = metrics.compare({ sensorPoints: pts, refHours: ref, from, to: nowMs, distanceKm: near.km });
    const out = {
      ok: true, updated: nowMs,
      sensor: { name: dev.name, group: dev.group || null, points: pts.length, stepMin: c.stepMin == null ? null : Math.round(c.stepMin), place: place.name },
      station: { id: near.station.id, name: near.station.name, type: near.station.type, area: near.station.area, municipality: near.station.municipality, distanceKm: Math.round(near.km * 10) / 10, lat: near.station.lat, lng: near.station.lng },
      window: { from, to: nowMs, days: nd },
      fairness: c.fairness, coarse: c.coarse, sensorHours: c.sensorHours,
      pairs: c.pairs.slice(-24 * 7).map((p) => [p.t, r1(p.sensor), r1(p.ref)]),
      hourly: roundStats(c.hourly), daily: roundStats(c.daily),
      days: c.days.map((x) => ({ day: x.day, hours: x.hours, sensor: r1(x.sensor), station: r1(x.ref) })),
      scorecard: c.scorecard && { ...c.scorecard, rows: c.scorecard.rows.map((r) => ({ ...r, value: r.value == null ? null : Math.round(r.value * 1000) / 1000, nrmse: r.nrmse == null ? undefined : Math.round(r.nrmse * 10) / 10 })) },
      minDays: c.minDays, epaDays: c.epaDays,
      eea: { ageMin: status().ageMin, unverified: true },
      targets: { source: metrics.EPA_PM25.url, averaging: metrics.EPA_PM25.averaging },
    };
    if (cmpCache.size > 60) cmpCache.delete(cmpCache.keys().next().value);
    cmpCache.set(key, { at: nowMs, v: out });
    return out;
  }
  const roundStats = (s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 1000) / 1000 : v]));

  /* ----- HTTP ----- */
  const sendJson = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(b); };
  async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/eea/')) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { sendJson(res, 405, { error: 'Use GET.' }); return true; }
    const q = (k) => url.searchParams.get(k);
    try {
      if (url.pathname === '/api/eea/status') { sendJson(res, 200, status()); return true; }
      if (url.pathname === '/api/eea/stations') {
        const list = stations(), p = loadPlaces();
        const near = Object.entries(p).map(([id, c]) => {
          const n = nearestFor(c.lat, c.lng, 'pm25') || nearestFor(c.lat, c.lng, 'pm10');
          return { id, name: c.name, nearest: n ? { id: n.station.id, name: n.station.name, type: n.station.type, km: Math.round(n.km * 10) / 10 } : null };
        });
        sendJson(res, 200, { ok: list.length > 0, stations: list, places: near, status: status(), source: { name: 'European Environment Agency (EEA), Air Quality Download Service', provider: 'Cyprus Department of Labour Inspection (as reported to the EEA)', dataset: 'E2a, unverified up-to-date data', unvalidated: true } });
        return true;
      }
      if (url.pathname === '/api/eea/series') {
        const id = String(q('station') || '').toUpperCase(), pk = q('pollutant') === 'pm10' ? 'pm10' : 'pm25';
        if (!/^[A-Z0-9]{3,12}$/.test(id)) { sendJson(res, 400, { error: 'station is required' }); return true; }
        const hours = clampInt(q('hours'), 1, days * 24, 48);
        const s = stationMeta().find((x) => x.id === id);
        if (!s) { sendJson(res, 404, { error: 'Unknown station' }); return true; }
        sendJson(res, 200, { station: id, name: s.name, pollutant: pk, unit: 'ug/m3', hours, rows: series(id, pk, hours), status: { state: status().state, ageMin: status().ageMin } });
        return true;
      }
      if (url.pathname === '/api/eea/compare') {
        const eui = String(q('eui') || ''), mid = String(q('mid') || '');
        if (!/^[A-Za-z0-9_-]{4,40}$/.test(eui) || !/^\d{3,6}$/.test(mid)) { sendJson(res, 400, { error: 'eui and mid are required' }); return true; }
        sendJson(res, 200, await compare({ eui, mid, days: q('days') }));
        return true;
      }
      sendJson(res, 404, { error: 'Unknown EEA route' });
    } catch (e) {
      log(`EEA air quality: ${req.url.split('?')[0]} failed: ${clean(e.message)}`);
      sendJson(res, 200, { ok: false, reason: 'error' });
    }
    return true;
  }

  load();
  return { start, stop, refresh, handle, snapshot, stations, series, status, nearestFor, compare, _x: { S: () => S, allowedHost, readParquet, downloadMeta, downloadStationsMap, listUrls, merge, hoursOf, compressors, supportedCodecs } };
}

module.exports = { createEea, parseCsvRow, csvDate, stationOfSpo, pollutantOfSpo, pollutantKey, metaCollector, instantOf, unitFactor, foldRows, tzHours, UA, FIXED_HOSTS, BLOB_HOST, DEFAULTS, snapshotPoint };
