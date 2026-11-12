'use strict';
/* satellite/lib/gridfeed.js: the part every "one number per city, from a satellite grid" feed has in common.
 *
 *   makeGridFeed(ctx, spec) -> a feed object for the registry (satellite/index.js)
 *
 * It owns: the schedule (first fetch after a short delay, then every spec.intervalMs, sooner after a failure; every timer is unref'd),
 * one request at a time with a pause (ERDDAP asks users to be kind), the cache on the data volume (a restart keeps the last good
 * numbers; their `time` is the observation time, so an old number simply reads as late), probe() and read(). The feed file only says
 * WHAT to ask for and how to turn a pixel into words.
 *
 * spec = {
 *   id, hosts, label,                       label: short name for the one log line
 *   cacheFile,                              file name inside ctx.dir
 *   intervalMs, firstDelayMs, keepMs,       keepMs: a cached number whose observation is older than this is dropped
 *   inland: ['lefkosia'],                   cities that are never asked (no sea there): read() gives nothing for them
 *   fetchCity(placeId, place, get) -> Promise<entry|null>
 *       entry = { value, obsMs, km, ...anything JSON-safe }. null = no usable pixel (cloud, land only). Throws on network trouble.
 *       get(url, opts) is the ERDDAP request: queued, one at a time, spaced.
 *   toReading(entry, nowMs) -> reading | null          (the reading the registry wants; `time` = entry.obsMs)
 *   probeText({ n, total, newestMs, nowMs }) -> { note, noteEl }
 * }
 */

const fs = require('fs');
const path = require('path');
const { serial } = require('./erddap');

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const plainErr = (e) => String((e && e.message) || e || 'failed').replace(/[\u0000-\u001f]+/g, ' ').slice(0, 160);

function makeGridFeed(ctx, spec) {
  const file = path.join(ctx.dir, spec.cacheFile);
  const inland = new Set(spec.inland || []);
  const pauseMs = (() => { const n = Number(ctx.env && ctx.env.SATELLITE_ERDDAP_PAUSE_MS); return Number.isFinite(n) && n >= 0 ? Math.min(n, 30000) : 500; })();
  const state = { cities: {}, checkedAt: 0, lastOkAt: 0, lastError: '', fails: 0 };
  let timer = null, inflight = null, stopped = true, saidOk = false;

  const coastal = () => Object.keys(ctx.places || {}).filter((id) => !inland.has(id));
  const goodEntry = (e) => e && typeof e === 'object' && Number.isFinite(e.value) && Number.isFinite(e.obsMs) && Number.isFinite(e.km) && e.obsMs > 0;

  function loadCache() {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!j || j.v !== 1 || !j.cities || typeof j.cities !== 'object') return;
      for (const [id, e] of Object.entries(j.cities)) if (ctx.places[id] && !inland.has(id) && goodEntry(e) && ctx.now() - e.obsMs <= spec.keepMs) state.cities[id] = e;
    } catch (e) { /* no cache yet, or an unreadable one: start empty */ }
  }
  function saveCache() {
    try {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, savedAt: ctx.now(), cities: state.cities }));
      fs.renameSync(tmp, file);
    } catch (e) { /* the cache is a convenience */ }
  }

  // The only way the feed asks ERDDAP: queued behind any other ERDDAP request in this process, then a pause.
  const get = (url, opt) => serial(async () => {
    try { return await ctx.get(url, { as: 'json', timeoutMs: 20000, maxBytes: 3 * 1024 * 1024, ...(opt || {}) }); }
    finally { if (pauseMs) await sleep(pauseMs); }
  });

  function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      state.checkedAt = ctx.now();
      let ok = 0, failed = 0, empty = 0, firstErr = '';
      const ids = coastal();
      for (const id of ids) {
        try {
          const e = await spec.fetchCity(id, ctx.places[id], get);
          if (goodEntry(e)) { state.cities[id] = e; ok++; } else empty++;
        } catch (err) { failed++; firstErr = firstErr || plainErr(err); }
      }
      for (const id of Object.keys(state.cities)) if (ctx.now() - state.cities[id].obsMs > spec.keepMs) delete state.cities[id];
      if (ok) { state.lastOkAt = ctx.now(); state.fails = 0; state.lastError = ''; saveCache(); }
      else { state.fails++; state.lastError = firstErr || 'no clear pixel near the coast'; }
      if (ok && !saidOk) { saidOk = true; ctx.log(`${spec.label}: first update done, ${ok} of ${ids.length} coastal cities read`); }   // the one line that says in the logs: it works
      if (failed || (!ok && ids.length)) ctx.log(`${spec.label}: ${ok} of ${ids.length} coastal cities updated${firstErr ? ` (${firstErr})` : empty ? ' (no usable pixel)' : ''}`);
      return { ok, failed, empty };
    })().finally(() => { inflight = null; });
    return inflight;
  }

  function schedule(ms) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      try { await refresh(); } catch (e) { /* refresh never throws, but a timer must never crash the server */ }
      schedule(state.fails ? Math.min(spec.intervalMs, 15 * 60000 * 2 ** (state.fails - 1)) : spec.intervalMs);
    }, ms);
    if (timer.unref) timer.unref();
  }

  const have = () => Object.keys(state.cities).filter((id) => coastal().includes(id) && toReading(id));
  function toReading(id) {
    const e = state.cities[id];
    if (!e) return null;
    try { return spec.toReading(e, ctx.now()); } catch (err) { return null; }
  }

  return {
    id: spec.id,
    hosts: spec.hosts,
    start() {
      if (!stopped) return;
      stopped = false;
      loadCache();
      schedule(spec.firstDelayMs);
    },
    stop() { stopped = true; if (timer) { clearTimeout(timer); timer = null; } },
    async probe() {
      if (!Object.keys(state.cities).length && !state.checkedAt) loadCache();
      const quiet = ctx.now() - state.checkedAt > 10 * 60000;
      // Nothing yet and nothing asked for a while: ask now. A refresh already running: wait for it (at most 6 s; the registry gives a probe 8 s).
      if (inflight || (!have().length && quiet)) await Promise.race([refresh(), sleep(6000)]);
      const ids = have();
      const newest = ids.reduce((m, id) => Math.max(m, state.cities[id].obsMs), 0);
      const t = spec.probeText({ n: ids.length, total: coastal().length, newestMs: newest || null, nowMs: ctx.now(), error: state.lastError });
      return { ok: ids.length > 0, n: ids.length, at: newest || null, note: t.note, noteEl: t.noteEl };
    },
    read(cityId) {
      if (inland.has(cityId) || !ctx.places[cityId]) return [];
      if (!Object.keys(state.cities).length && !state.checkedAt) loadCache();
      const r = toReading(cityId);
      return r ? [r] : [];
    },
    // for tests and for the maintainers' console
    refresh,
    _t: { state, loadCache, saveCache, file },
  };
}

module.exports = { makeGridFeed };
