'use strict';
/* The server side of the sensor quality checks: it reads the last day of each sensor's readings, runs qc.js on them and hands
 * the result to /api/devices and /api/latest as an extra `qc` field. Nothing is deleted, hidden or sent anywhere: a flagged
 * sensor only gets a sentence, in English and Greek, that the pages can show. It never raises an alert, an e-mail or a push.
 *
 *   createQcWatch({ root, names, devices, series, log, now, pauseMs }) -> { enabled, ready(ms), annotateDevices(list), annotateLatest(map),
 *                                                               counts(), statusByDevice(), refresh() }
 *     root     the folder that holds vocab/variables.json and vocab/qc.json
 *     names()  -> { [measurement id]: [name, unit] }   (the SenseCAP measurement names)
 *     devices() -> Promise<[{ eui, name, measurements, channelOf }]>
 *     series(eui, mid, channel) -> Promise<[{ t, v }]>  the last day, about 10 minutes apart (the same call the charts use)
 *   Set QC=0 to switch it all off. A missing or broken vocab file switches it off too, with one line in the log, and the site
 *   goes on without the extra field.
 *
 * Load on the sensor service: the last-day series are asked for one at a time (about 5 a second at most is what the upstream
 * gate allows anyway), only when somebody asks for devices or readings, and at most once every 30 minutes.
 */
const fs = require('fs');
const path = require('path');
const Q = require('./qc');

const MIN = 60000, HOUR = 3600000;
const TTL = 30 * MIN;                 // how long a set of results is used before the series are read again (the shared SenseCAP gate is often busy)
const FRESH = 3 * HOUR;               // a reading older than this is the "sensor quiet" alert's business, not ours
const PAUSE = 500;                    // ms between two series reads, so the upstream is never hammered
const BUDGET = 4 * MIN;               // one refresh never runs longer than this
const GPS = new Set(['4197', '4198']);

// Which vocab variable is this measurement? By the well-known SenseCAP ids first, then by the name.
const MID_VAR = { 4097: 'temperature', 4098: 'relative_humidity', 4099: 'light', 4100: 'co2', 4101: 'pressure' };
const NAME_VAR = [
  [/pm\s*2[._ ]?5/i, null, 'pm25'], [/pm\s*10\b/i, null, 'pm10'], [/\bco2\b|carbon dioxide/i, null, 'co2'],
  [/temp/i, /soil|water|ground|dew|surface|probe|internal|core|wet|sea|sst/i, 'temperature'], [/humid/i, /soil|leaf|moisture/i, 'relative_humidity'],
  [/press|baro/i, null, 'pressure'], [/noise|sound|decibel/i, null, 'noise'], [/light|lux|illumin/i, null, 'light'], [/wind\s*speed/i, null, 'wind_speed'], [/\bozone\b|\bo3\b/i, null, 'ozone'],
];
const VEH = /\b(bus|car|van|minibus|coach|vehicle|taxi|truck|shuttle)\b|λεωφορ|αυτοκίν|όχημα/i;
const FIXED = /\b(class(room)?|lab|room|office|library|hall|gym|indoor|outdoor|roof|yard|playground|garden|fixed|station)\b|τάξη|αίθουσα|εργαστήρι/i;   // the same words the Alerts page uses

function variableOf(mid, info) {
  const m = String(mid);
  if (GPS.has(m)) return null;
  const name = info && info[0] ? String(info[0]) : '';
  if (name) {
    if (/^(longitude|latitude|gps|position)/i.test(name)) return null;
    for (const [re, not, v] of NAME_VAR) if (re.test(name) && !(not && not.test(name))) return v;
  }
  const v = MID_VAR[m];
  const rule = v && NAME_VAR.find((r) => r[2] === v);
  return v && !(name && rule && rule[1] && rule[1].test(name)) ? v : null;   // an id we know, unless its own name says it is something else (soil temperature)
}
// SenseCAP sends pressure in pascals; the vocab is in hectopascals.
function scaleFor(variable, info) {
  const unit = info && info[1] ? String(info[1]).trim().toLowerCase() : '';
  if (variable === 'pressure') return unit === 'pa' ? 0.01 : unit === 'kpa' ? 10 : 1;
  return 1;
}
const envOf = (d) => (!FIXED.test(d.name || '') && (VEH.test(d.name || '') || (d.measurements || []).some((m) => GPS.has(String(m)))) ? 'vehicle' : 'fixed');
const ms = (t) => Q.toMs(t);
const sleep = (n) => new Promise((r) => setTimeout(r, n));

function createQcWatch(opts) {
  const root = opts.root || __dirname;
  const log = opts.log || (() => {});
  const now = opts.now || Date.now;
  const off = (why) => { if (why) log('Quality checks are off: ' + why); return { enabled: false, ready: async () => {}, annotateDevices: (l) => l, annotateLatest: (m) => m, counts: () => null, statusByDevice: () => ({}), refresh: async () => {} }; };
  if (process.env.QC === '0') return off('QC=0');
  let vocab, conf;
  try {
    vocab = JSON.parse(fs.readFileSync(path.join(root, 'vocab', 'variables.json'), 'utf8'));
    conf = JSON.parse(fs.readFileSync(path.join(root, 'vocab', 'qc.json'), 'utf8'));
  } catch (e) { return off('cannot read vocab/variables.json or vocab/qc.json (' + (e && e.message) + ')'); }
  const pause = Number.isFinite(opts.pauseMs) ? opts.pauseMs : PAUSE;
  const sum = conf.summary || {};
  const assessOpts = () => ({ now: now(), windowHours: sum.window_hours, freshHours: sum.fresh_hours, suspectEvents: sum.suspect_events });

  const state = new Map();        // eui -> { at, env, series: Map(mid -> { mid, variable, scale, unit, profile, result }) }
  let inflight = null, lastAt = 0, started = false;
  const warned = new Set();
  const warnOnce = (m) => { const k = String(m).replace(/\d+/g, '#'); if (!warned.has(k) && warned.size < 20) { warned.add(k); log('Quality checks: ' + m); } };   // the same trouble with another number of seconds is the same line

  async function refreshNow() {
    const t0 = now();
    const devices = await opts.devices();
    const names = opts.names() || {};
    const seen = new Set();
    for (const d of Array.isArray(devices) ? devices : []) {
      if (now() - t0 > BUDGET) break;
      const env = envOf(d);
      const prev = state.get(d.eui);
      const entry = { at: prev ? prev.at : 0, env, series: new Map(prev ? prev.series : []) };
      seen.add(d.eui);
      for (const mid of d.measurements || []) {
        const info = names[mid] || names[Number(mid)];
        const variable = variableOf(mid, info);
        const profile = variable && Q.profileFor(variable, vocab, conf, env);
        if (!profile) continue;
        const scale = scaleFor(variable, info);
        try {
          const raw = await opts.series(d.eui, String(mid), (d.channelOf && d.channelOf[mid]) || 1);
          const pts = (Array.isArray(raw) ? raw : []).map((p) => ({ t: p.t, v: Number(p.v) * scale }));
          entry.series.set(String(mid), { mid: String(mid), variable, scale, profile, result: Object.assign(Q.runSeries(pts, profile), { id: String(mid) }) });
          entry.at = now();
        } catch (e) { warnOnce('could not read a series (' + String((e && e.message) || e).slice(0, 100) + '); the last result is kept'); }
        await sleep(pause);
      }
      state.set(d.eui, entry);
    }
    for (const k of [...state.keys()]) if (!seen.has(k) && seen.size) state.delete(k);
    lastAt = now();
  }
  function refresh() {
    if (inflight) return inflight;
    started = true;
    inflight = refreshNow().catch((e) => { warnOnce('refresh failed (' + String((e && e.message) || e).slice(0, 100) + ')'); lastAt = now() - TTL + 60000; })
      .finally(() => { inflight = null; });   // after a failure it is tried again in a minute
    return inflight;
  }
  // Wait a short while for the very first results, so the first answer already has them; after that never wait.
  async function ready(waitMs) {
    if (!started || now() - lastAt > TTL) { const p = refresh(); if (!state.size) await Promise.race([p, sleep(waitMs == null ? 1200 : waitMs)]); }
  }

  const latestOf = (latest, eui, mid) => {
    const r = latest && latest[eui] && latest[eui][mid];
    const t = r ? ms(r.t) : null, v = r ? Number(r.v) : NaN;
    return r && t != null && Number.isFinite(v) ? { v, t } : null;
  };

  // One sensor: its series results (with the newest reading's own range check added), judged by qc.assessSensor.
  function assess(eui, latest) {
    const e = state.get(eui);
    if (!e || !e.series.size) return null;
    const results = [];
    for (const s of e.series.values()) {
      let res = s.result;
      const l = latestOf(latest, eui, s.mid);
      if (l && now() - l.t <= FRESH) {
        const g = Q.grossOne(l.v * s.scale, s.profile, l.t);
        if (g && !res.flags.some((f) => f.test === 'gross_range' && f.t === l.t)) res = Object.assign({}, res, { to: Math.max(res.to || 0, l.t), flags: res.flags.concat(g) });
        else if (l.t > (res.to || 0)) res = Object.assign({}, res, { to: l.t });
      }
      results.push(res);
    }
    const a = Q.assessSensor(results, assessOpts());
    return a ? { eui, env: e.env, at: e.at, a } : null;
  }

  // What a page gets for one sensor.
  function deviceView(x) {
    const a = x.a;
    return {
      status: a.status, checked: a.checked, at: x.at,
      note: a.note ? { en: a.note.en, el: a.note.el } : null,
      items: a.items.map((i) => ({ mid: i.id, variable: i.variable, test: i.test, severity: i.severity, t: i.t, ongoing: i.ongoing, reason: { en: i.reason.en, el: i.reason.el } })),
    };
  }
  // What a page gets for one reading: the worst flag that touches the newest reading.
  function readingView(eui, s, latest) {
    const l = latestOf(latest, eui, s.mid);
    if (!l || now() - l.t > FRESH) return null;
    const res = s.result;
    const g = Q.grossOne(l.v * s.scale, s.profile, l.t);
    const cur = res.flags.filter((f) => (f.tEnd || f.t) >= res.to).concat(g ? [g] : []);   // flags on the newest reading of the series, and the range check of the newest value
    const fail = cur.filter((f) => f.severity === Q.FAIL), worst = fail.length ? fail : cur;
    return { status: fail.length ? 'fail' : cur.length ? 'suspect' : 'ok', flags: worst.slice(-2).map((f) => ({ test: f.test, severity: f.severity, reason: { en: f.reason.en, el: f.reason.el } })) };
  }

  function annotateDevices(list, latest) {
    if (!Array.isArray(list)) return list;
    return list.map((d) => { const x = assess(d.eui, latest); return x ? Object.assign({}, d, { qc: deviceView(x) }) : d; });
  }
  function annotateLatest(map) {
    if (!map || typeof map !== 'object') return map;
    const out = {};
    for (const eui of Object.keys(map)) {
      const e = state.get(eui), row = map[eui];
      if (!e || !row || typeof row !== 'object') { out[eui] = row; continue; }
      const copy = {};
      for (const mid of Object.keys(row)) {
        const s = e.series.get(mid), v = s ? readingView(eui, s, map) : null;
        copy[mid] = v && row[mid] && typeof row[mid] === 'object' ? Object.assign({}, row[mid], { qc: v }) : row[mid];
      }
      out[eui] = copy;
    }
    return out;
  }
  function statusByDevice(latest) {
    const out = {};
    for (const eui of state.keys()) { const x = assess(eui, latest); if (x) out[eui] = x.a.status; }
    return out;
  }
  function counts(latest) {
    const st = statusByDevice(latest), ids = Object.keys(st);
    return { at: lastAt || null, judged: ids.length, check: ids.filter((k) => st[k] === 'check').length };
  }

  return { enabled: true, ready, annotateDevices, annotateLatest, counts, statusByDevice, refresh, _state: state };
}

module.exports = { createQcWatch, variableOf, scaleFor, envOf };
