'use strict';
/* Feeds, and what the server has saved from the Met Office.
 *
 * createFeeds   Book-keeping for the five outside sources (SenseCAP, the Met Office, Open-Meteo, Sensor.Community, airport METAR):
 *               when each last worked, its last error, how many calls worked or failed in the last 24 hours, and a switch that a
 *               teacher can turn off. A switched-off feed makes no calls at all (the callers get a SwitchedOff error, which the
 *               server turns into a 503 'switched off by a teacher'); the answers already in the caches are still served.
 *               The switch is saved in the student database (table meta) when it exists, otherwise in DATA_DIR/feeds.json.
 *               The counters are small (10 minute buckets, 24 hours) and are saved to DATA_DIR/feeds-stats.json so a deploy does
 *               not blank them. Nothing here holds a key or a password, and every error text is cleaned before it is stored.
 * createArchive What the saved Met Office history holds (days and readings, page versions), a search over the Met Office pages
 *               and their saved versions, and a list of what changed on those pages. Everything it reads is bounded: files are
 *               counted once and remembered by size and time, parsed months live in a small cache.
 * No dependencies.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { createCache } = require('./cache');

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const BUCKET = 10 * MIN;      // counters are kept in 10 minute buckets for 24 hours (144 per feed at most)

const DEFS = [
  { id: 'sensecap', name: ['SenseCAP sensors', 'Αισθητήρες SenseCAP'], home: 'https://sensecap.seeed.cc/', everyMin: 1, background: false,
    what: ['The sensors on buses, cars and in classrooms: readings, battery and position, through the SenseCAP cloud.', 'Οι αισθητήρες στα λεωφορεία, τα αυτοκίνητα και τις τάξεις: μετρήσεις, μπαταρία και θέση, μέσω του SenseCAP cloud.'] },
  { id: 'dom', name: ['Cyprus Met Office', 'Μετεωρολογική Υπηρεσία Κύπρου'], home: 'https://www.dom.org.cy/', everyMin: 5, background: true,
    what: ['Official stations, warnings, forecasts, sea and radar pages of the Department of Meteorology.', 'Επίσημοι σταθμοί, προειδοποιήσεις, προγνώσεις, θάλασσα και ραντάρ του Τμήματος Μετεωρολογίας.'] },
  { id: 'openmeteo', name: ['Open-Meteo', 'Open-Meteo'], home: 'https://open-meteo.com/', everyMin: 10, background: false,
    what: ['Weather, air quality, sea and terrain on a grid over Cyprus (free, non-commercial).', 'Καιρός, ποιότητα αέρα, θάλασσα και ανάγλυφο σε πλέγμα πάνω από την Κύπρο (δωρεάν, μη εμπορική χρήση).'] },
  { id: 'sensorcommunity', name: ['Sensor.Community', 'Sensor.Community'], home: 'https://sensor.community/', everyMin: 5, background: false,
    what: ['Air sensors run by volunteers around the island (dust, temperature, humidity).', 'Αισθητήρες αέρα εθελοντών σε όλο το νησί (σκόνη, θερμοκρασία, υγρασία).'] },
  { id: 'metar', name: ['Airport weather (METAR)', 'Καιρός αεροδρομίων (METAR)'], home: 'https://aviationweather.gov/', everyMin: 10, background: false,
    what: ['Observations at the airports of Larnaca, Paphos, Ercan and Akrotiri.', 'Παρατηρήσεις από τα αεροδρόμια Λάρνακας, Πάφου, Ercan και Ακρωτηρίου.'] },
];
const FEED_IDS = DEFS.map((d) => d.id);

class SwitchedOff extends Error {
  constructor(feed) { super('switched off by a teacher'); this.name = 'SwitchedOff'; this.switchedOff = true; this.feed = feed; }
}

const clamp = (v, min, max, dflt) => Math.min(max, Math.max(min, Math.floor(Number(v)) || dflt));

/* Error texts become part of a public page, so no address, key, token or password may stay in them. */
function cleaner(secrets) {
  const secret = (secrets || []).map(String).filter((s) => s.length >= 4);
  return function clean(text, max = 200) {
    let s = String(text == null ? '' : text);
    for (const x of secret) s = s.split(x).join('***');
    s = s
      .replace(/https?:\/\/[^\s)'"]+/gi, '[address]')
      .replace(/\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=._-]{6,}/gi, '$1 ***')
      .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '[address]')
      .replace(/[A-Za-z0-9_+/=-]{32,}/g, '***')
      .replace(/\s+/g, ' ')
      .trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  };
}
function errorText(e) {
  if (!e) return 'Unknown error';
  const cause = e.cause && (e.cause.code || e.cause.name);
  return (e.message || String(e)) + (cause ? ' (' + cause + ')' : '');
}

function createFeeds({ dataDir, log = () => {}, simulated = {}, secrets = [], now = Date.now } = {}) {
  const clean = cleaner(secrets);
  const defs = new Map(DEFS.map((d) => [d.id, d]));
  const state = new Map(DEFS.map((d) => [d.id, { lastOk: null, lastErr: null, buckets: new Map() }]));
  const off = new Map();            // feed id -> { at }
  const stateFile = dataDir ? path.join(dataDir, 'feeds.json') : null;
  const statsFile = dataDir ? path.join(dataDir, 'feeds-stats.json') : null;
  let db = null, dirty = false, countsSince = now();

  /* ----- the switch: saved in the student database when there is one, else in a small file ----- */
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    for (const [id, v] of Object.entries((saved && saved.off) || {})) if (defs.has(id)) off.set(id, { at: Number(v && v.at) || now() });
  } catch (e) { /* nothing saved yet */ }
  try {
    const saved = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    if (Number(saved.since) > 0) countsSince = Number(saved.since);
    for (const [id, s] of Object.entries((saved && saved.feeds) || {})) {
      const st = state.get(id);
      if (!st || !s) continue;
      st.lastOk = Number(s.lastOk) || null;
      if (s.lastErr && Number(s.lastErr.at)) st.lastErr = { at: Number(s.lastErr.at), message: clean(s.lastErr.message) };
      for (const b of Array.isArray(s.buckets) ? s.buckets.slice(-200) : []) if (Array.isArray(b) && Number(b[0]) > 0) st.buckets.set(Number(b[0]), [Number(b[1]) || 0, Number(b[2]) || 0]);
      prune(st, now());
    }
  } catch (e) { /* nothing saved yet */ }

  function prune(st, t) {
    const min = Math.floor((t - DAY) / BUCKET);
    for (const k of st.buckets.keys()) if (k < min) st.buckets.delete(k);
  }
  function writeFile(file, obj) {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(obj));
      fs.renameSync(file + '.tmp', file);
    } catch (e) { log('Feeds: cannot save ' + path.basename(file) + ': ' + clean(e.message)); }
  }
  function persist() {
    if (db) {
      try {
        db.run("INSERT OR REPLACE INTO meta(key, value) VALUES ('feeds_state', '1')");
        for (const id of FEED_IDS) {
          if (off.has(id)) db.run('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', 'feed_off:' + id, JSON.stringify({ at: off.get(id).at }));
          else db.run('DELETE FROM meta WHERE key = ?', 'feed_off:' + id);
        }
        return;
      } catch (e) { log('Feeds: cannot save the switch in the database, using a file: ' + clean(e.message)); db = null; }
    }
    writeFile(stateFile, { off: Object.fromEntries([...off].map(([id, v]) => [id, { at: v.at }])) });
  }
  // Once the student app is ready its database takes over. A state saved there wins; otherwise the file's state moves in.
  function attach(core) {
    if (!core || !core.enabled || !core.db) return;
    try {
      const marker = core.db.get("SELECT value FROM meta WHERE key = 'feeds_state'");
      db = core.db;
      if (marker) {
        off.clear();
        for (const r of core.db.all("SELECT key, value FROM meta WHERE key LIKE 'feed_off:%'")) {
          const id = String(r.key).slice(9);
          let v = null;
          try { v = JSON.parse(r.value); } catch (e) { /* damaged row: treat as switched off */ }
          if (defs.has(id)) off.set(id, { at: Number(v && v.at) || now() });
        }
      } else persist();
    } catch (e) { db = null; log('Feeds: the student database cannot hold the switch: ' + clean(e.message)); }
  }

  /* ----- calls ----- */
  const enabled = (id) => !off.has(id);
  function guard(id) { if (off.has(id)) throw new SwitchedOff(id); }
  function record(id, ok, err) {
    const st = state.get(id);
    if (!st || simulated[id]) return;
    const t = now(), idx = Math.floor(t / BUCKET);
    let b = st.buckets.get(idx);
    if (!b) { b = [0, 0]; st.buckets.set(idx, b); prune(st, t); }
    if (ok) { b[0]++; st.lastOk = t; } else { b[1]++; st.lastErr = { at: t, message: clean(errorText(err)) }; }
    dirty = true;
  }
  // One call to an outside source: refused when the feed is off, counted when it ends.
  async function track(id, fn) {
    guard(id);
    try {
      const v = await fn();
      record(id, true);
      return v;
    } catch (e) {
      if (!(e && e.switchedOff)) record(id, false, e);
      throw e;
    }
  }

  function setEnabled(id, on) {
    if (!defs.has(id)) throw new Error('Unknown feed');
    if (on) off.delete(id);
    else if (!off.has(id)) off.set(id, { at: now() });
    persist();
    return view(id);
  }

  function statusOf(d, st, t) {
    if (off.has(d.id)) return 'off';
    if (simulated[d.id]) return 'demo';
    if (st.lastErr && (!st.lastOk || st.lastErr.at > st.lastOk) && t - st.lastErr.at < DAY) return 'error';
    if (!st.lastOk) return 'idle';
    if (t - st.lastOk <= Math.max(3 * d.everyMin * MIN, 10 * MIN)) return 'ok';
    return d.background ? 'late' : 'idle';
  }
  function view(id) {
    const d = defs.get(id), st = state.get(id), t = now();
    prune(st, t);
    let ok = 0, fail = 0;
    for (const b of st.buckets.values()) { ok += b[0]; fail += b[1]; }
    return {
      id, name: d.name[0], nameEl: d.name[1], what: d.what[0], whatEl: d.what[1], home: d.home,
      enabled: !off.has(id),
      lastOk: st.lastOk, lastError: st.lastErr ? { at: st.lastErr.at, message: st.lastErr.message } : null,
      ok24h: ok, fail24h: fail, everyMin: d.everyMin,
      mode: simulated[id] ? 'demo' : 'live',
      status: statusOf(d, st, t),
      offSince: off.has(id) ? off.get(id).at : null,
      countsSince: Math.max(countsSince, t - DAY),
    };
  }
  const list = () => FEED_IDS.map(view);

  function flush() {
    if (!dirty) return;
    dirty = false;
    writeFile(statsFile, {
      since: countsSince,
      feeds: Object.fromEntries(FEED_IDS.map((id) => {
        const st = state.get(id);
        return [id, { lastOk: st.lastOk, lastErr: st.lastErr, buckets: [...st.buckets].slice(-150).map(([k, b]) => [k, b[0], b[1]]) }];
      })),
    });
  }
  const timer = setInterval(flush, 2 * MIN);
  timer.unref();

  return {
    ids: FEED_IDS, has: (id) => defs.has(id), enabled, guard, track, record, setEnabled, attach, list, get: view, flush, clean,
    off: (id) => new SwitchedOff(id), isOff: (e) => Boolean(e && e.switchedOff),
  };
}

/* ---------- what the server has saved from the Met Office ---------- */

const PAGE_LABELS = {
  warnings: ['Weather warnings', 'Προειδοποιήσεις καιρού'],
  sea_a: ['Sea forecast, area A', 'Πρόγνωση θάλασσας, περιοχή Α'], sea_b: ['Sea forecast, area B', 'Πρόγνωση θάλασσας, περιοχή Β'],
  sea_c: ['Sea forecast, area C', 'Πρόγνωση θάλασσας, περιοχή Γ'], sea_d: ['Sea forecast, area D', 'Πρόγνωση θάλασσας, περιοχή Δ'],
  navtex: ['NAVTEX', 'NAVTEX'], fir: ['Aviation, FIR forecast', 'Αεροπλοΐα, πρόγνωση FIR'], laf: ['Local area forecast', 'Πρόγνωση τοπικής περιοχής'],
  net: ['Discomfort index', 'Δείκτης δυσφορίας'],
};
const labelOf = (name) => PAGE_LABELS[name] || [name, name];
const normText = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const dayText = (ms) => new Date(ms).toISOString().slice(0, 10);

// Lines of a warnings page that belong to the page itself and say nothing about a warning.
const CHROME = /^(issued\s+)?(weather\s+)?warnings?:?$|department of meteorology|^copyright|©|^(home|back|print|menu|contact|refresh|top)$/i;
const NO_WARNING = /\b(no (\w+ )?warnings?|none|nil|nothing|not (currently )?(issued|in force|active))\b|δεν υπαρχ|καμια προειδοπ|καμια ειδοπ/;
const relevantLines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !CHROME.test(l));
const calm = (lines) => !lines.length || NO_WARNING.test(normText(lines.join(' ')));
const short = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function createArchive({ getHistory, getPageStore, getLive, pageNames = [], retentionDays = 400, log = () => {} }) {
  const lineCounts = new Map();     // saved day file -> { size, mtimeMs, n }: a file is only counted again when it changes
  const pageCounts = new Map();     // saved month file of pages -> { size, mtimeMs, byName, firstT, lastT }
  const parsed = createCache({ max: 3, maxBytes: 90e6, sizeOf: (v) => v.size });    // a few months of page versions, parsed
  const summaryCache = createCache({ max: 2 });
  const searchCache = createCache({ max: 100 });
  const watchCache = createCache({ max: 20 });
  const MAX_DAYS = 1000, MAX_FILE = 40e6, SEARCH_MONTHS = 12;
  const tick = () => new Promise((ok) => setImmediate(ok));

  const pageFiles = () => {
    const ps = getPageStore();
    if (!ps || !ps.dir) return [];
    try { return fs.readdirSync(ps.dir).filter((f) => /^\d{4}-\d\d\.jsonl$/.test(f)).sort().map((f) => path.join(ps.dir, f)); } catch (e) { return []; }
  };
  async function stamp(file) { const st = await fsp.stat(file); return { size: st.size, mtimeMs: st.mtimeMs }; }

  async function countLines(file) {
    const st = await stamp(file);
    const hit = lineCounts.get(file);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.n;
    const buf = await fsp.readFile(file);
    let n = 0, i = -1;
    while ((i = buf.indexOf(10, i + 1)) !== -1) n++;
    lineCounts.set(file, { ...st, n });
    return n;
  }
  // Counts the versions of each page in a month file without parsing the page texts.
  async function countVersions(file) {
    const st = await stamp(file);
    const hit = pageCounts.get(file);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit;
    const byName = {};
    let firstT = null, lastT = null;
    for (const line of (await fsp.readFile(file, 'utf8')).split('\n')) {
      const m = /^\{"t":(\d+),"name":"([a-z0-9_]{1,30})"/.exec(line);
      if (!m) continue;
      const t = Number(m[1]);
      byName[m[2]] = (byName[m[2]] || 0) + 1;
      if (firstT == null || t < firstT) firstT = t;
      if (lastT == null || t > lastT) lastT = t;
    }
    const out = { ...st, byName, firstT, lastT };
    pageCounts.set(file, out);
    return out;
  }

  async function build() {
    const h = getHistory();
    const cydom = { firstDay: null, lastDay: null, days: [], stations: 0, readings: 0, bytes: 0, error: null };
    if (h) {
      const files = h.files().slice(-MAX_DAYS);
      const keep = new Set(files.map((f) => path.join(h.dir, f)));
      for (const k of lineCounts.keys()) if (!keep.has(k)) lineCounts.delete(k);
      for (const f of files) {
        let n = null;
        try { n = await countLines(path.join(h.dir, f)); } catch (e) { /* removed meanwhile */ }
        if (n == null) continue;
        cydom.days.push({ day: f.slice(0, 10), readings: n });
        cydom.readings += n;
        await tick();
      }
      const info = h.info();
      cydom.firstDay = cydom.days.length ? cydom.days[0].day : null;
      cydom.lastDay = cydom.days.length ? cydom.days[cydom.days.length - 1].day : null;
      cydom.stations = info.stations || 0;
      cydom.bytes = info.bytes || 0;
      cydom.error = info.error ? String(info.error).slice(0, 120) : null;
    }
    const pages = { firstDay: null, lastDay: null, versions: {}, bytes: 0, error: null };
    for (const n of pageNames) pages.versions[n] = 0;
    const files = pageFiles();
    const keep = new Set(files);
    for (const k of pageCounts.keys()) if (!keep.has(k)) pageCounts.delete(k);
    let first = null, last = null;
    for (const f of files) {
      let c = null;
      try { c = await countVersions(f); } catch (e) { /* removed meanwhile */ }
      if (!c) continue;
      pages.bytes += c.size;
      for (const [n, k] of Object.entries(c.byName)) if (Object.hasOwn(pages.versions, n) || Object.keys(pages.versions).length < 20) pages.versions[n] = (pages.versions[n] || 0) + k;
      if (c.firstT != null && (first == null || c.firstT < first)) first = c.firstT;
      if (c.lastT != null && (last == null || c.lastT > last)) last = c.lastT;
      await tick();
    }
    pages.firstDay = first == null ? null : dayText(first);
    pages.lastDay = last == null ? null : dayText(last);
    const ps = getPageStore();
    pages.error = ps && ps.error ? String(ps.error).slice(0, 120) : null;

    const downloads = [];
    if (cydom.readings) {
      downloads.push({ label: 'Met Office station readings, all stations, last day (CSV)', labelEl: 'Μετρήσεις σταθμών της Μετεωρολογικής, όλοι οι σταθμοί, τελευταία ημέρα (CSV)', url: '/api/cydom/history.csv?days=1' });
      downloads.push({ label: 'Met Office station readings, all stations, last 30 days (CSV)', labelEl: 'Μετρήσεις σταθμών της Μετεωρολογικής, όλοι οι σταθμοί, τελευταίες 30 ημέρες (CSV)', url: '/api/cydom/history.csv?days=30' });
      if (retentionDays > 30) downloads.push({ label: `Met Office station readings, everything saved (CSV)`, labelEl: 'Μετρήσεις σταθμών της Μετεωρολογικής, όλα τα αποθηκευμένα (CSV)', url: `/api/cydom/history.csv?days=${retentionDays}` });
    }
    for (const [name, n] of Object.entries(pages.versions)) {
      if (!n) continue;
      const l = labelOf(name);
      downloads.push({ label: `${l[0]}: saved versions of the page (JSON)`, labelEl: `${l[1]}: αποθηκευμένες εκδόσεις της σελίδας (JSON)`, url: `/api/dom/pages/history?name=${name}&days=${retentionDays}` });
    }
    return { updated: Date.now(), updatedIso: new Date().toISOString(), cydom, pages, downloads: downloads.slice(0, 30) };
  }
  // Counting every saved file can take a moment the first time; it happens once and is shared, then it is kept for 5 minutes.
  const summary = () => summaryCache.get('s', 5 * MIN, build);

  /* ----- saved page versions, newest month first ----- */
  async function loadMonth(file) {
    const st = await stamp(file);
    return parsed.get(`${file}|${st.size}|${st.mtimeMs}`, Infinity, async () => {
      if (st.size > MAX_FILE) { log('Archive: ' + path.basename(file) + ' is too large to search'); return { size: 0, versions: [], skipped: true }; }
      const versions = [];
      let chars = 0;
      for (const line of (await fsp.readFile(file, 'utf8')).split('\n')) {
        if (!line) continue;
        let r;
        try { r = JSON.parse(line); } catch (e) { continue; }
        if (!r || typeof r.name !== 'string' || !Number(r.t)) continue;
        const v = { t: Number(r.t), name: r.name, title: String(r.title || ''), text: String(r.text || ''), nt: null };
        chars += v.text.length;
        versions.push(v);
      }
      return { size: chars * 3 + versions.length * 200, versions };
    });
  }

  function snippetOf(orig, nt, tokens) {
    let pos = -1;
    for (const t of tokens) { const p = nt.indexOf(t); if (p >= 0 && (pos < 0 || p < pos)) pos = p; }
    if (pos < 0 || nt.length !== orig.length) pos = 0;
    const start = Math.max(0, pos - 60), end = Math.min(orig.length, pos + 140);
    return (start > 0 ? '…' : '') + orig.slice(start, end).replace(/\s+/g, ' ').trim() + (end < orig.length ? '…' : '');
  }

  async function search(q, limit) {
    const query = String(q == null ? '' : q).replace(/\s+/g, ' ').trim().slice(0, 100);
    limit = clamp(limit, 1, 50, 20);
    const tokens = normText(query).split(' ').filter(Boolean).slice(0, 6);
    if (!tokens.length) return { q: query, results: [] };
    return searchCache.get(tokens.join(' ') + '|' + limit, 30000, async () => {
      const results = [];
      const liveNorm = new Map();
      const hit = (nt) => tokens.every((t) => nt.includes(t));
      // the pages as the server last read them
      for (const [name, page] of getLive()) {
        const orig = (page.title || '') + '\n' + (page.text || '');
        const nt = normText(orig);
        liveNorm.set(name, normText(page.text || ''));
        if (!hit(nt)) continue;
        const l = labelOf(name);
        results.push({ source: 'metoffice', title: page.title || l[0], label: l[0], labelEl: l[1], snippet: snippetOf(orig, nt, tokens), at: Date.parse(page.fetched) || null, url: '/#/weather', page: name, api: `/api/dom/page?name=${encodeURIComponent(name)}` });
        if (results.length >= limit) return { q: query, results };
      }
      // what was saved earlier, newest first, a few per page so one busy page does not fill the list
      const perPage = new Map();
      const files = pageFiles().slice(-SEARCH_MONTHS).reverse();
      for (const file of files) {
        let m;
        try { m = await loadMonth(file); } catch (e) { continue; }
        for (let i = m.versions.length - 1; i >= 0; i--) {
          const v = m.versions[i];
          const orig = v.title + '\n' + v.text;
          if (!v.nt) v.nt = normText(orig);
          if (!hit(v.nt) || liveNorm.get(v.name) === normText(v.text)) continue;
          if ((perPage.get(v.name) || 0) >= 5) continue;
          perPage.set(v.name, (perPage.get(v.name) || 0) + 1);
          const l = labelOf(v.name);
          results.push({ source: 'archive', title: v.title || l[0], label: l[0], labelEl: l[1], snippet: snippetOf(orig, v.nt, tokens), at: v.t, url: v.name === 'warnings' ? '/#/warnings' : '/#/archive', page: v.name, api: `/api/dom/pages/history?name=${encodeURIComponent(v.name)}&days=${Math.min(retentionDays, Math.ceil((Date.now() - v.t) / DAY) + 1)}` });
          if (results.length >= limit) return { q: query, results };
        }
        await tick();
      }
      return { q: query, results };
    });
  }

  /* ----- what changed on the pages ----- */
  const WATCHED = new Set(pageNames.filter((n) => n !== 'net'));   // the discomfort index changes every hour: that is data, not news
  async function watch(days, limit) {
    days = clamp(days, 1, retentionDays, 30);
    limit = clamp(limit, 1, 200, 50);
    return watchCache.get(`${days}|${limit}`, 60000, async () => {
      if (!getPageStore()) return { items: [], days, saved: false };
      const from = Date.now() - days * DAY;
      const byName = new Map();
      for (const file of pageFiles().reverse()) {
        const month = path.basename(file).slice(0, 7);
        const [y, mo] = month.split('-').map(Number);
        if (Date.UTC(y, mo, 1) < from - 45 * DAY) break;      // older than the window and its starting point
        let m;
        try { m = await loadMonth(file); } catch (e) { continue; }
        for (const v of m.versions) if (WATCHED.has(v.name)) { if (!byName.has(v.name)) byName.set(v.name, []); byName.get(v.name).push(v); }
        await tick();
      }
      const items = [];
      for (const [name, list] of byName) {
        list.sort((a, b) => a.t - b.t);
        const l = labelOf(name);
        for (let i = 1; i < list.length; i++) {
          const prev = list[i - 1], cur = list[i];
          if (cur.t < from || prev.text === cur.text) continue;
          const pl = relevantLines(prev.text), cl = relevantLines(cur.text);
          let kind = 'changed', text;
          if (name === 'warnings') {
            const pc = calm(pl), cc = calm(cl);
            if (pc && !cc) { kind = 'issued'; text = short(cl.join(' · '), 220); }
            else if (!pc && cc) { kind = 'ended'; text = short(pl.join(' · '), 220); }
          }
          if (!text) {
            const before = new Set(pl), after = new Set(cl);
            const added = cl.filter((x) => !before.has(x)), removed = pl.filter((x) => !after.has(x));
            text = added.length ? short(added.slice(0, 2).join(' · '), 220) : removed.length ? '− ' + short(removed[0], 200) : short(cl.slice(0, 1).join(' '), 220);
          }
          items.push({ at: cur.t, page: name, kind, text, title: l[0], titleEl: l[1] });
        }
      }
      items.sort((a, b) => b.at - a.at);
      return { items: items.slice(0, limit), days, saved: true };
    });
  }

  return { summary, search, watch, labelOf };
}

module.exports = { createFeeds, createArchive, SwitchedOff, FEED_IDS, PAGE_LABELS, cleaner, errorText };
