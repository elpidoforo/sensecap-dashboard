'use strict';
/* satellite/index.js: the registry of satellite feeds.
 *
 *   One file per feed in satellite/feeds/<id>.js (CommonJS): module.exports = function create(ctx) { return feed; }
 *   A file whose name starts with "_" is a demo/test feed: it is loaded only with SATELLITE_DEMO=1 and its id is "satellite-<name>"
 *   (satellite/feeds/_demo.js -> "satellite-demo"). Any other file's id is the file name, and sources/<id>.json describes the layer.
 *
 *   ctx  = { id, dir, log(msg), get(url, opts), places, now(), env }            (the contract is in the README of this folder)
 *     dir    this feed's own folder on the data volume (DATA_DIR/satellite/<id>/), created for it
 *     get    satellite/http.js: https only, exact hosts from feed.hosts, redirects checked, time and size caps, secret-free errors
 *     env    a read-only view. A feed sees only the names its descriptor declares (access.auth.env, or x_env: ["NAME", ...]) and the
 *            names that start with SATELLITE_. Any other name reads as undefined (and one log line says why).
 *   feed = { id, hosts: ['exact.host'], start(), stop(), probe() -> { ok, n, at, note, noteEl }, read(cityId) -> readings[], images()? -> images[] }
 *     A feed object must have id, hosts, probe and read. start and stop are optional. images is optional.
 *   image = { id, title, titleEl, text, textEl, time, bbox:[w,s,e,n], file, contentType, attribution, attributionEl?, cloud? }
 *     cloud (optional, 0 to 100): the share of the picture that is cloud, when the feed knows it; the page says "mostly cloud" from 40
 *     id    letters, digits, "-" and "_" only, at most 80 characters (it is part of a web address; anything else is skipped)
 *     file  a file under ctx.dir (a relative path is taken from ctx.dir); contentType one of png, jpeg, webp, gif, svg
 *
 * What the registry guarantees: a feed that throws (or hangs) at load, start, stop, read, probe or images never affects another feed,
 * the server start or a request. A failure is ONE short log line (the same line is not repeated within 10 minutes), the feed shows
 * as "failed" or "not answering" in status(), and its readings are simply absent.
 *
 *   createSatellite({ root, dataDir, log, env, now, demo, off, offReason, feedsDir, places, transport, allowLocalHttp })
 *     -> { enabled, demo, start, stop, status, probe, read, images, imageFile, has, ids, virtualSources, keyState, handle }
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { makeGet, SatelliteHttpError } = require('./http');

const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const IMAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const IMAGE_TYPES = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1, 'image/gif': 1, 'image/svg+xml': 1 };
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES_PER_FEED = 60;     // all kinds of picture of one feed together
const MAX_IMAGES_PER_GROUP = 12;     // the newest ones of one kind of picture
const MAX_READINGS = 24;
const TIMEOUTS = { probe: 8000, read: 5000, images: 4000 };
const PROBE_TTL_OK = 30000, PROBE_TTL_BAD = 10000, LIST_TTL = 10000;

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const msOf = (v) => { const n = num(v); if (n != null) return n > 0 && n < 1e11 ? n * 1000 : n; if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; } return null; };
const withTimeout = (p, ms, what) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`${what} took more than ${ms < 1000 ? ms + ' ms' : Math.round(ms / 1000) + ' s'}`)), ms);   // not unref'd: it is always cleared, and a hanging feed must still be cut off
  Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

/* A feed runs its own timers. An error that escapes one of them (a rejected promise nobody awaits, a throw inside setInterval) would
   otherwise stop the whole server. So the first registry installs two process handlers that are narrow on purpose: they act only on an
   error that comes from satellite code (a SatelliteHttpError, or a stack that passes through satellite/ files), log ONE line and mark that
   feed. Every other error is thrown again exactly as before, so the rest of the app behaves as it always did. */
const registries = new Set();
let guardInstalled = false;
function installGuard() {
  if (guardInstalled) return;
  guardInstalled = true;
  const take = (err, what) => {
    const stack = String((err && err.stack) || '');
    const dirs = [...registries].map((r) => r._t.feedsDir);   // where the feed files really are (the test folders too)
    const fromSatellite = (err instanceof SatelliteHttpError) || stack.includes(__dirname + path.sep) || dirs.some((d) => stack.includes(d + path.sep));
    if (!fromSatellite) return false;
    let id = null;
    for (const d of dirs) { const i = stack.indexOf(d + path.sep); if (i >= 0) { const m = /^(_?[a-z0-9-]+)\.js/.exec(stack.slice(i + d.length + 1)); if (m) { id = m[1]; break; } } }
    for (const r of registries) if (r._t.escaped(id, what, err)) return true;
    return false;
  };
  process.on('unhandledRejection', (reason) => { if (!take(reason, 'an unhandled promise rejection')) throw reason; });
  process.on('uncaughtException', (err) => { if (!take(err, 'an uncaught error')) throw err; });
}

function createSatellite(opts) {
  const o = opts || {};
  const root = o.root || path.join(__dirname, '..');
  const env = o.env || process.env;
  const rawLog = o.log || ((m) => console.error(m));
  const now = o.now || Date.now;
  const demo = o.demo != null ? !!o.demo : env.SATELLITE_DEMO === '1';
  const off = !!o.off, offReason = o.offReason || 'switched off';
  const timeouts = { ...TIMEOUTS, ...(o.timeouts || {}) };   // a test can make them short
  const feedsDir = o.feedsDir || path.join(__dirname, 'feeds');
  const baseDir = path.join(o.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'satellite-')), 'satellite');
  let me = null;
  const entries = new Map();   // id -> entry
  const logged = new Map();    // message -> time (the same line is not repeated within 10 minutes)

  const places = o.places || (() => {
    try { const all = JSON.parse(fs.readFileSync(path.join(root, 'vocab', 'places.json'), 'utf8')); return Object.fromEntries(Object.entries(all).filter(([k]) => k[0] !== '_')); } catch (e) { return {}; }
  })();

  // Secrets never leave: the value of any key a feed declared is cut out of every text the registry keeps or prints.
  const secretValues = () => { const out = []; for (const e of entries.values()) for (const n of e.envNames) { const v = env[n]; if (v && String(v).length >= 4) out.push(String(v)); } return out; };
  const scrub = (text, e, el) => {
    let t = clip(text, 400);
    for (const v of secretValues()) t = t.split(v).join('***');
    if (e) for (const n of e.envNames) t = t.split(n).join(el ? 'κλειδί' : 'key');   // "set FIRMS_MAP_KEY" -> "set key"; the page never shows the name of a secret
    return t;
  };
  // The same, for an error message: it can name a file on the server (a failed require), and status() is public, so paths are cut out too.
  const scrubErr = (text, e) => scrub(String(text == null ? '' : text).replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@~+-]+){2,}/g, '(path)'), e);
  const say = (text, key) => {
    const k = key || text, t = now();
    if (logged.has(k) && t - logged.get(k) < 600000) return;
    logged.set(k, t);
    if (logged.size > 500) for (const [kk, v] of logged) if (t - v > 600000) logged.delete(kk);
    try { rawLog(text); } catch (e) { /* logging must never break anything */ }
  };

  /* ----- descriptors, read only to learn which environment names a feed may see ----- */
  function descriptorOf(id) { try { return JSON.parse(fs.readFileSync(path.join(root, 'sources', id + '.json'), 'utf8')); } catch (e) { return null; } }
  const envNamesOf = (src) => {
    const out = [];
    const a = src && src.access && src.access.auth;
    if (a && typeof a.env === 'string') out.push(a.env);
    if (src && Array.isArray(src.x_env)) out.push(...src.x_env);
    return [...new Set(out.filter((n) => /^[A-Z][A-Z0-9_]{2,63}$/.test(n)))];
  };

  function envView(e) {
    const allowed = (name) => typeof name === 'string' && (e.envNames.includes(name) || /^SATELLITE_[A-Z0-9_]+$/.test(name));
    return new Proxy({}, {
      get: (_t, name) => {
        if (typeof name !== 'string') return undefined;
        if (allowed(name)) return env[name];
        if (/^[A-Z][A-Z0-9_]*$/.test(name) && env[name] != null) say(`Satellite ${e.id}: the feed asked for ${name}, which its source file does not declare (access.auth.env or x_env), so it was not given`, 'env:' + e.id + name);
        return undefined;
      },
      has: (_t, name) => allowed(name) && env[name] != null,
      ownKeys: () => Object.keys(env).filter((n) => allowed(n) && env[n] != null),
      getOwnPropertyDescriptor: (_t, name) => (allowed(name) && env[name] != null ? { value: env[name], enumerable: true, configurable: true } : undefined),
      set: () => false, deleteProperty: () => false, defineProperty: () => false,
    });
  }

  /* ----- loading ----- */
  function scan() {
    let files = [];
    try { files = fs.readdirSync(feedsDir).filter((f) => /^_?[a-z0-9][a-z0-9-]*\.js$/.test(f)).sort(); } catch (e) { say(`Satellite: cannot read the feeds folder (${clip(e.message, 100)})`); }
    for (const f of files) {
      const base = f.slice(0, -3), underscore = base[0] === '_';
      if (underscore && !demo) continue;
      const id = underscore ? 'satellite-' + base.slice(1) : base;
      if (!ID_RE.test(id) || entries.has(id)) continue;
      const e = { id, file: path.join(feedsDir, f), demo: underscore, state: 'loading', error: null, feed: null, ctx: null, hosts: [], envNames: [], source: null, net: { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null, lastError: null }, probeCache: null, probeInflight: null, probeCount: { ok: 0, fail: 0 }, readAt: null, readCount: 0, imgCache: null, started: false };
      entries.set(id, e);
      load(e);
    }
  }

  function load(e) {
    e.source = e.demo ? null : descriptorOf(e.id);
    e.envNames = envNamesOf(e.source);
    if (off && !e.demo) { e.state = 'off'; e.error = offReason; return; }
    try {
      const dir = path.join(baseDir, e.id);
      fs.mkdirSync(dir, { recursive: true });
      let inner = null;
      const get = (url, opt) => (inner ? inner(url, opt) : Promise.reject(new SatelliteHttpError('args', 'the feed has not declared its hosts')));
      const ctx = {
        id: e.id, dir, places: JSON.parse(JSON.stringify(places)), now,
        log: (msg) => say(`Satellite ${e.id}: ${scrub(msg, e)}`.slice(0, 400), 'feed:' + e.id + ':' + String(msg).slice(0, 120)),
        get, env: envView(e),
      };
      e.ctx = ctx;
      const mod = require(e.file);
      const create = typeof mod === 'function' ? mod : mod && typeof mod.create === 'function' ? mod.create : null;
      if (!create) throw new Error('the file must export function create(ctx)');
      const feed = create(ctx);
      if (!feed || typeof feed !== 'object' || typeof feed.then === 'function') throw new Error('create(ctx) must return the feed object (not a promise)');
      if (feed.id !== e.id) throw new Error(`feed.id is "${clip(feed.id, 60)}" but must be "${e.id}"`);
      if (typeof feed.probe !== 'function' || typeof feed.read !== 'function') throw new Error('a feed needs probe() and read(cityId)');
      inner = makeGet({ id: e.id, hosts: feed.hosts, transport: o.transport, allowLocalHttp: !!o.allowLocalHttp, onResult: (err) => { const t = now(); if (err) { e.net.fail++; e.net.lastFailAt = t; e.net.lastError = scrubErr(err.message, e); } else { e.net.ok++; e.net.lastOkAt = t; } } });
      e.hosts = [...new Set(feed.hosts.map((h) => String(h).toLowerCase()))];
      if (e.demo && feed.source && typeof feed.source === 'object') e.source = feed.source;
      e.feed = feed;
      e.state = 'ready';
    } catch (err) {
      e.state = 'failed';
      e.error = scrubErr((err && err.message) || 'could not load', e);
      e.feed = null;
      say(`Satellite ${e.id}: could not load (${e.error})`);
    }
  }

  /* ----- start, stop ----- */
  function start() {
    for (const e of entries.values()) {
      if (e.state !== 'ready' || e.started) continue;
      e.started = true;
      try {
        const r = e.feed.start && e.feed.start();
        if (r && typeof r.then === 'function') r.catch((err) => failFeed(e, 'start', err));
      } catch (err) { failFeed(e, 'start', err); }
    }
  }
  function stop() {
    for (const e of entries.values()) {
      if (!e.started) continue;
      e.started = false;
      try { const r = e.feed && e.feed.stop && e.feed.stop(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (err) { /* stopping must always finish */ }
    }
  }
  function failFeed(e, what, err) {
    e.lastError = scrubErr((err && err.message) || what + ' failed', e);
    e.lastErrorAt = now();
    say(`Satellite ${e.id}: ${what} failed (${e.lastError})`);
  }

  /* ----- the questions the rest of the server asks ----- */
  const has = (id) => entries.has(id);
  const ids = () => [...entries.keys()].filter((id) => entries.get(id).state !== 'off');
  const allIds = () => [...entries.keys()];
  // A source file that a demo/test feed brings with it (the register of layers adds it; check-sources never sees it).
  const virtualSources = () => [...entries.values()].filter((e) => e.demo && e.source && e.state === 'ready').map((e) => ({ id: e.id, src: e.source }));
  // null: the feed needs no key. 'present' | 'missing': it declares an api-key and the key is (not) set on the server.
  function keyState(id) {
    const e = entries.get(id);
    if (!e || !e.source || !e.source.access || !e.source.access.auth || e.source.access.auth.type !== 'api-key') return null;
    const n = e.source.access.auth.env;
    return n && env[n] ? 'present' : 'missing';
  }

  const NOTE_FAIL = { note: 'could not be read just now', noteEl: 'δεν μπόρεσε να διαβαστεί αυτή τη στιγμή' };
  function cleanProbe(r, e) {
    const x = r && typeof r === 'object' ? r : {};
    const at = msOf(x.at);
    return { ok: !!x.ok, n: Math.max(0, Math.min(1e6, Math.round(num(x.n) || 0))), at: at && at > 0 ? at : null, note: scrub(x.note, e), noteEl: scrub(x.noteEl, e, true) };
  }
  async function probe(id) {
    const e = entries.get(id);
    if (!e) return { ok: false, n: 0, at: null, note: 'no such satellite feed', noteEl: 'δεν υπάρχει τέτοια δορυφορική πηγή' };
    if (e.state === 'off') return { ok: false, n: 0, at: null, note: scrub(e.error, e) || 'switched off', noteEl: 'απενεργοποιημένο' };
    if (e.state !== 'ready') return { ok: false, n: 0, at: null, note: 'this feed could not start', noteEl: 'αυτή η πηγή δεν μπόρεσε να ξεκινήσει' };
    const c = e.probeCache;
    if (c && now() - c.at < (c.value.ok ? PROBE_TTL_OK : PROBE_TTL_BAD)) return c.value;
    if (!e.probeInflight) {
      e.probeInflight = (async () => {
        let value;
        try { value = cleanProbe(await withTimeout(e.feed.probe(), timeouts.probe, 'the check'), e); e.probeCount[value.ok ? 'ok' : 'fail']++; }
        catch (err) { failFeed(e, 'probe', err); e.probeCount.fail++; value = { ok: false, n: 0, at: null, ...NOTE_FAIL }; }
        e.probeCache = { at: now(), value };
        return value;
      })().finally(() => { e.probeInflight = null; });
    }
    return e.probeInflight;
  }

  async function read(id, cityId) {
    const e = entries.get(id);
    if (!e || e.state !== 'ready' || typeof cityId !== 'string' || !Object.hasOwn(places, cityId)) return [];
    let list;
    try { list = await withTimeout(Promise.resolve().then(() => e.feed.read(cityId)), timeouts.read, 'read'); }
    catch (err) { failFeed(e, 'read', err); return []; }
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const r of list.slice(0, 400)) {
      if (out.length >= MAX_READINGS) break;
      if (!r || typeof r !== 'object' || typeof r.variable !== 'string') continue;
      const value = num(r.value), time = msOf(r.time);
      if (value == null || time == null || time <= 0) continue;
      out.push({
        variable: clip(r.variable, 60), value, unit: clip(r.unit, 20), time,
        where: scrub(r.where, e), whereEl: scrub(r.whereEl || r.where, e, true),
        ...(r.note ? { note: scrub(r.note, e), noteEl: scrub(r.noteEl || r.note, e, true) } : {}),
      });
    }
    e.readAt = now(); e.readCount = out.length;
    return out;
  }

  /* ----- images ----- */
  function insideDir(e, file) {
    if (typeof file !== 'string' || !file || file.includes('\0')) return null;
    const full = path.resolve(e.ctx.dir, file);
    try {
      const real = fs.realpathSync(full), dirReal = fs.realpathSync(e.ctx.dir);
      if (real !== dirReal && !real.startsWith(dirReal + path.sep)) return null;
      const st = fs.statSync(real);
      if (!st.isFile() || st.size < 1 || st.size > MAX_IMAGE_BYTES) return null;
      return { real, size: st.size, mtimeMs: st.mtimeMs };
    } catch (err) { return null; }
  }
  const bboxOf = (b) => {
    if (!Array.isArray(b) || b.length !== 4) return null;
    const v = b.map(num);
    if (v.some((x) => x == null) || v[0] < -180 || v[2] > 180 || v[1] < -90 || v[3] > 90 || v[0] >= v[2] || v[1] >= v[3]) return null;
    return v.map((x) => Math.round(x * 10000) / 10000);
  };

  async function feedImages(e) {
    if (e.state !== 'ready' || typeof e.feed.images !== 'function') return [];
    let list;
    try { list = await withTimeout(Promise.resolve().then(() => e.feed.images()), timeouts.images, 'images'); }
    catch (err) { failFeed(e, 'images', err); return []; }
    if (!Array.isArray(list)) return [];
    const out = [], seen = new Set();
    for (const im of list) {
      if (!im || typeof im !== 'object') continue;
      const id = String(im.id == null ? '' : im.id);
      if (!IMAGE_ID_RE.test(id)) { say(`Satellite ${e.id}: an image was skipped: its id must be letters, digits, - and _ only`, 'imgid:' + e.id); continue; }
      if (seen.has(id)) continue;
      const type = String(im.contentType || '').toLowerCase().split(';')[0].trim();
      const time = msOf(im.time);
      const f = IMAGE_TYPES[type] && time ? insideDir(e, im.file) : null;
      if (!f) continue;
      seen.add(id);
      out.push({
        feed: e.id, id, title: clip(im.title, 140), titleEl: clip(im.titleEl || im.title, 160), text: clip(im.text, 500), textEl: clip(im.textEl || im.text, 600),
        time, bbox: bboxOf(im.bbox), cloud: num(im.cloud) == null ? null : Math.max(0, Math.min(100, Math.round(num(im.cloud)))), contentType: type, bytes: f.size, attribution: clip(im.attribution, 300), attributionEl: clip(im.attributionEl || im.attribution, 340),
        group: IMAGE_ID_RE.test(String(im.group || '')) ? String(im.group) : null, day: /^\d{4}-\d{2}-\d{2}$/.test(String(im.day || '')) ? String(im.day) : null, latest: im.latest === true,
        groupOrder: Number.isInteger(im.groupOrder) && im.groupOrder >= 0 && im.groupOrder < 100 ? im.groupOrder : null,
        groupLabel: clip(im.groupLabel, 40) || null, groupLabelEl: clip(im.groupLabelEl || im.groupLabel, 40) || null,
        _file: f.real, _mtime: f.mtimeMs,
      });
    }
    out.sort((a, b) => b.time - a.time);
    // A feed with several kinds of picture (a group each) keeps the newest few of every kind, so one busy kind cannot push the others out.
    const perGroup = new Map(), kept = [];
    for (const im of out) {
      const g = im.group || '';
      const n = perGroup.get(g) || 0;
      if (n >= MAX_IMAGES_PER_GROUP) continue;
      perGroup.set(g, n + 1);
      kept.push(im);
    }
    return kept.slice(0, MAX_IMAGES_PER_FEED);
  }

  let listCache = null;
  async function allImages() {
    if (listCache && now() - listCache.at < LIST_TTL) return listCache.value;
    const parts = await Promise.all([...entries.values()].filter((e) => e.state === 'ready').map((e) => feedImages(e)));
    const value = parts.flat();
    listCache = { at: now(), value };
    return value;
  }
  const publicImage = (im) => { const { _file, _mtime, ...rest } = im; return { ...rest, url: `/api/satellite/image/${im.feed}/${im.id}` }; };
  async function images() { return (await allImages()).map(publicImage); }
  // The file behind /api/satellite/image/<feed>/<image>. Both ids are checked here too: an id that is not in the feed's own list gives null.
  async function imageFile(feedId, imageId) {
    if (typeof feedId !== 'string' || typeof imageId !== 'string' || !ID_RE.test(feedId) || !IMAGE_ID_RE.test(imageId)) return null;
    const e = entries.get(feedId);
    if (!e || e.state !== 'ready') return null;
    const im = (await allImages()).find((x) => x.feed === feedId && x.id === imageId);
    if (!im) return null;
    const f = insideDir(e, path.relative(e.ctx.dir, im._file));   // checked again at the moment of serving
    if (!f) return null;
    return { file: f.real, contentType: im.contentType, size: f.size, mtimeMs: f.mtimeMs, time: im.time };
  }

  /* ----- status (cheap and public: no path, no key, no raw error text) ----- */
  async function status(sopt) {
    const refresh = !sopt || sopt.probe !== false;
    if (refresh) {
      let t;
      await Promise.race([Promise.allSettled([...entries.values()].filter((e) => e.state === 'ready').map((e) => probe(e.id))), new Promise((r) => { t = setTimeout(r, 2500); })]);
      clearTimeout(t);
    }
    const imgs = await allImages().catch(() => []);
    return {
      enabled: !off || [...entries.values()].some((e) => e.demo), demo, at: now(),
      feeds: [...entries.values()].map((e) => ({
        id: e.id, state: e.state === 'ready' ? (e.started ? 'running' : 'ready') : e.state, demo: e.demo || undefined,
        error: e.state === 'failed' || e.state === 'off' ? e.error : (e.lastError && now() - (e.lastErrorAt || 0) < 3600000 ? e.lastError : null),
        hosts: e.hosts,
        needsKey: keyState(e.id) === 'missing' ? true : undefined,
        probe: e.probeCache ? { ...e.probeCache.value, checkedAt: e.probeCache.at } : null,
        images: imgs.filter((x) => x.feed === e.id).length,
        network: { ok: e.net.ok, failed: e.net.fail, lastOkAt: e.net.lastOkAt, lastFailAt: e.net.lastFailAt, lastError: e.net.lastError },
        reading: { at: e.readAt, rows: e.readCount },
      })),
    };
  }

  /* ----- HTTP: public, read only, rate limited like the other public views ----- */
  const rate = Math.max(10, Math.min(100000, Number(env.SATELLITE_RATE_PER_MIN) || 240));
  const hits = new Map(), allHits = { n: 0, t: 0 };
  function tooMany(req) {
    const t = now(), ip = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '?').slice(0, 64);
    let h = hits.get(ip);
    if (!h || t - h[1] > 60000) {
      h = [0, t]; hits.set(ip, h);
      if (hits.size > 2000) { for (const [k, v] of hits) if (t - v[1] > 60000) hits.delete(k); if (hits.size > 4000) hits.clear(); }
    }
    if (t - allHits.t > 60000) { allHits.n = 0; allHits.t = t; }
    allHits.n++;
    return ++h[0] > rate || allHits.n > rate * 10;
  }
  const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };
  function sendJson(req, res, code, obj, cache, extra) {
    const body = JSON.stringify(obj);
    const etag = cache && code === 200 ? '"' + crypto.createHash('sha1').update(body).digest('base64url').slice(0, 22) + '"' : null;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache || 'no-store', ...SEC, ...(etag ? { ETag: etag } : {}), ...(extra || {}) };
    if (etag && req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(code, { ...headers, 'Content-Length': Buffer.byteLength(body) });
    res.end(req.method === 'HEAD' ? undefined : body);
  }
  async function handle(req, res, url) {
    const p = url.pathname;
    if (p !== '/api/satellite' && !p.startsWith('/api/satellite/')) return false;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(req, res, 405, { error: 'Use GET.', errorEl: 'Χρησιμοποίησε GET.' }, null, { Allow: 'GET, HEAD' }), true;
      if (tooMany(req)) return sendJson(req, res, 429, { error: 'Too many requests, try again in a minute.', errorEl: 'Πάρα πολλά αιτήματα, δοκίμασε ξανά σε ένα λεπτό.' }, null, { 'Retry-After': '60' }), true;
      if (p === '/api/satellite/status') return sendJson(req, res, 200, await status(), null), true;
      if (p === '/api/satellite/images') return sendJson(req, res, 200, { images: await images() }, 'public, max-age=60'), true;
      const m = /^\/api\/satellite\/image\/([a-z0-9][a-z0-9-]{0,59})\/([A-Za-z0-9][A-Za-z0-9_-]{0,79})$/.exec(p);
      if (m) {
        const f = await imageFile(m[1], m[2]);
        if (!f) return sendJson(req, res, 404, { error: 'No such picture.', errorEl: 'Δεν υπάρχει τέτοια εικόνα.' }, null), true;
        const etag = '"' + crypto.createHash('sha1').update(`${m[1]}/${m[2]}/${f.mtimeMs}/${f.size}`).digest('base64url').slice(0, 22) + '"';
        const headers = { 'Content-Type': f.contentType, 'Cache-Control': 'public, max-age=300', ETag: etag, ...SEC, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' };
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(), true; }
        res.writeHead(200, { ...headers, 'Content-Length': f.size });
        if (req.method === 'HEAD') return res.end(), true;
        const stream = fs.createReadStream(f.file);
        stream.on('error', () => res.destroy());
        stream.pipe(res);
        return true;
      }
      return sendJson(req, res, 404, { error: 'No such page.', errorEl: 'Δεν υπάρχει τέτοια σελίδα.' }, null), true;
    } catch (err) {
      say(`Satellite: ${p.split('/').slice(0, 4).join('/')} failed (${clip(err && err.message, 120)})`);
      if (!res.headersSent) sendJson(req, res, 500, { error: 'Something went wrong on the server.', errorEl: 'Κάτι πήγε στραβά στον διακομιστή.' }, null); else res.end();
      return true;
    }
  }

  // An error that escaped from a feed's own timer (see installGuard). The feed file name tells which feed; true means "handled".
  function escaped(fileBase, what, err) {
    const id = fileBase ? (fileBase[0] === '_' ? 'satellite-' + fileBase.slice(1) : fileBase) : null;
    const e = id && entries.get(id);
    if (e) {
      e.lastError = scrubErr((err && err.message) || what, e); e.lastErrorAt = now();
      say(`Satellite ${e.id}: ${what} came out of the feed (${e.lastError}); the server keeps running`, 'escaped:' + e.id + ':' + String(err && err.message).slice(0, 80));
      return true;
    }
    say(`Satellite: ${what} came out of a feed (${scrub(err && err.message, null) || 'no message'}); the server keeps running`, 'escaped:' + String(err && err.message).slice(0, 80));
    return true;
  }

  scan();
  if (o.guardProcess !== false) { registries.add(api()); installGuard(); }
  return api();

  function api() { return me || (me = { enabled: true, demo, start, stop, status, probe, read, images, imageFile, has, ids, allIds, virtualSources, keyState, handle, _t: { entries, feedsDir, baseDir, scrub, tooMany, escaped } }); }
}

module.exports = { createSatellite, ID_RE, IMAGE_ID_RE };
