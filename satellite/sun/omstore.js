'use strict';
/* satellite/sun/omstore.js: what the two Open-Meteo sunshine feeds have in common: the four city points, one request for all of them, the
 * answer kept in memory (cleaned) and on the data volume (last.json), and the timer. Each feed turns the stored hours into readings itself,
 * at the moment it is asked, so "the latest hour" and "night" always use the clock of that moment.
 */
const path = require('path');
const C = require('./common');
const OM = require('./openmeteo');

const sane = (c) => c && Array.isArray(c.times) && Array.isArray(c.sw) && c.times.length === c.sw.length && c.times.length > 1 && c.times.length < 400
  && c.times.every((t) => Number.isFinite(t)) && (c.cs == null || (Array.isArray(c.cs) && c.cs.length === c.times.length));

function makeStore(ctx, opts, timing) {
  const o = opts || {};
  const cities = Object.entries(ctx.places || {}).filter(([k]) => k[0] !== '_')
    .map(([id, p]) => ({ id, name: p.name || [id, id], lat: Number(p.lat), lng: Number(p.lng) }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const byId = Object.fromEntries(cities.map((c) => [c.id, c]));
  const file = path.join(ctx.dir, 'last.json');

  let state = { fetchedAt: 0, cities: {} };
  const saved = C.readJson(file);
  if (saved && saved.cities && typeof saved.cities === 'object') {
    for (const [id, c] of Object.entries(saved.cities)) if (byId[id] && sane(c)) state.cities[id] = c;
    state.fetchedAt = Number(saved.fetchedAt) || 0;
  }
  let tried = false, lastError = null, loggedFirst = false;

  async function refresh() {
    tried = true;
    let r;
    try { r = await OM.fetchAll(ctx, cities, { pauseMs: o.pauseMs }); }
    catch (e) { lastError = String((e && e.message) || 'failed'); throw e; }
    lastError = null;
    state = { fetchedAt: ctx.now(), cities: { ...state.cities, ...r.byCity } };
    C.writeJson(file, state);
    for (const p of r.problems) ctx.log(`one place was skipped (${p})`);
    if (!loggedFirst) {   // the line to look for after the first deploy: it shows what the real service sent
      loggedFirst = true;
      const newest = Math.max(...Object.values(r.byCity).map((c) => { let t = 0; c.times.forEach((x, i) => { if (c.sw[i] != null && x > t) t = x; }); return t; }));
      ctx.log(`first answer: ${Object.keys(r.byCity).length} of ${cities.length} places, newest non-empty hour ${new Date(newest).toISOString().slice(0, 16)}Z (${Math.round((ctx.now() - newest) / 60000)} min old), clear-sky column ${r.clearSky ? 'asked' : 'refused'}`);
    }
    return true;
  }

  const runner = C.makeRunner({ log: ctx.log, firstMs: timing.firstMs, everyMs: timing.everyMs, work: refresh });
  return {
    cities, byId, get: (id) => state.cities[id] || null,
    info: () => ({ tried, lastError, fetchedAt: state.fetchedAt }),
    refresh, runner,
    start() { runner.start(); }, stop() { runner.stop(); },
  };
}

module.exports = { makeStore, sane };
