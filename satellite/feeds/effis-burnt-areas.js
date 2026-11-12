'use strict';
/* satellite/feeds/effis-burnt-areas.js: burnt areas near the four cities, mapped from satellites by EFFIS (European Forest Fire Information
 * System, Copernicus Emergency Management Service, Joint Research Centre of the European Commission). Best effort, shipped as a PLANNED layer.
 *
 * WHAT IT READS
 *   One WFS request, no key, every 6 hours, for a box around Cyprus (BBOX below):
 *     https://maps.effis.emergency.copernicus.eu/gwis?service=WFS&version=1.1.0&request=GetFeature&typename=nrt.ba.poly&bbox=<west,south,east,north>
 *   The answer is a GeoJSON FeatureCollection of burnt-area perimeters with the properties id, fire_id, initialdate, finaldate, area (hectares).
 *   Only geometry, area and the two dates are ever read (satellite/fire/effis.js has the rules); no name of any place or person is kept.
 *
 * WHAT IT GIVES (a reading for each city centre)
 *   burnt_area_near_km2   area EFFIS mapped as burnt in the last 30 days, for perimeters centred within 50 km. 0 when none is mapped.
 *   Not an active-fire layer: EFFIS' hotspots are NASA FIRMS data republished as WMS (no WFS, no JSON), so hotspots come from fire-hotspots.
 *   There is no picture: the picture of fire hotspots is made by fire-hotspots.
 *
 * NOT VERIFIED from the build sandbox (no route to EFFIS). The layer name, the request shape and the property names come from the README of
 * a third-party client (effis-client) and from the EFFIS pages (see the report next to this file), NOT from a page of the EFFIS service
 * itself; the live answer, the axis order of the box and whether the service still answers at all are guesses. That is why the descriptor says
 * candidate + planned: a teacher flips it to active after the first log line below has been seen in production.
 *   First thing to check: the line "EFFIS answered: N perimeters ..." (or "EFFIS did not answer ..." / "EFFIS gave an answer that is not GeoJSON ...").
 * Never shows 0 as "safe": the notes say that only larger fires are mapped and that a map can come a day or more after the fire.
 */
const fs = require('fs');
const path = require('path');
const effis = require('../fire/effis');

const ID = 'effis-burnt-areas';
const HOST = 'maps.effis.emergency.copernicus.eu';
const LAYER = 'nrt.ba.poly';
const BBOX = '31.3,33.7,34.9,36.1';            // west,south,east,north (longitude first): 100 km round every city centre
const EVERY_MS = 6 * 3600000;                  // EFFIS says burnt areas are updated daily: no need to ask more often
const FIRST_MS = 29000;
const SERVE_MS = 48 * 3600000;                 // no reading, probe not ok when the last good answer is older than this
const KEEP_MS = 31 * 86400000;
const MAX_BYTES = 10 * 1024 * 1024;

const CALL = ['If you see smoke or fire, call 112.', 'Αν δεις καπνό ή φωτιά, πάρε στο 112.'];

// "12 Aug" / "12 Αυγ" in Cyprus time (the day only: EFFIS dates are not good to the minute).
function dayText(ms, el) {
  try { return new Intl.DateTimeFormat(el ? 'el-GR' : 'en-GB', { timeZone: 'Asia/Nicosia', day: 'numeric', month: 'short' }).format(new Date(ms)); }
  catch (e) { return new Date(ms).toISOString().slice(0, 10); }
}

module.exports = function create(ctx) {
  const cacheFile = path.join(ctx.dir, 'last.json');
  let state = loadCache();      // { fetchedAt, features, bad, areas: [[lat, lng, ha, t0, t1]] }
  let timer = null, stopped = true, inflight = null, failures = 0, lastFail = null;

  /* ---------- the cache on the volume ---------- */
  function loadCache() {
    try {
      const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (!j || typeof j !== 'object' || !Number.isFinite(j.fetchedAt) || !Array.isArray(j.areas)) return null;
      const areas = j.areas.filter((a) => Array.isArray(a) && a.length === 5 && a.every(Number.isFinite) && a[2] > 0).slice(0, 20000);
      return { fetchedAt: j.fetchedAt, features: j.features | 0, bad: j.bad | 0, areas };
    } catch (e) { return null; }
  }
  function saveCache() {
    try {
      fs.writeFileSync(cacheFile + '.tmp', JSON.stringify({ v: 1, ...state }));
      fs.renameSync(cacheFile + '.tmp', cacheFile);
    } catch (e) { ctx.log('could not save the cache (' + String(e && e.code || 'error').slice(0, 30) + ')'); }
  }

  /* ---------- fetching ---------- */
  const kindOf = (e) => (e && e.code === 'http' && e.status === 429) ? 'limit' : (e && e.code === 'parse') || (e && /GeoJSON|JSON|XML|is empty|could be read/.test(e.message || '')) ? 'format' : 'network';
  const clean = (s) => String(s == null ? '' : s).replace(/[^\x20-\x7E]/g, '?').slice(0, 160);

  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      const t0 = ctx.now();
      const url = `https://${HOST}/gwis?service=WFS&version=1.1.0&request=GetFeature&typename=${LAYER}&bbox=${BBOX}`;
      try {
        const text = await ctx.get(url, { as: 'text', timeoutMs: 20000, maxBytes: MAX_BYTES });
        const r = effis.parseBurntAreas(text, { now: t0 });
        // Features came, none could be read: that is a format change or a wrong unit, never "nothing burnt".
        if (r.features > 0 && r.areas.length === 0) throw new Error(`none of the ${r.features} features could be read`);
        state = { fetchedAt: t0, features: r.features, bad: r.bad, areas: r.areas.filter((a) => a.t1 >= t0 - KEEP_MS).map((a) => [a.lat, a.lng, a.ha, a.t0, a.t1]) };
        failures = 0; lastFail = null;
        saveCache();
        const recent = recentAreas().length;
        ctx.log(`EFFIS answered: ${r.features} perimeters around Cyprus, ${recent} updated in the last 30 days${r.bad ? `, ${r.bad} could not be read` : ''}`);
        return { ok: true };
      } catch (e) {
        failures++;
        lastFail = { kind: kindOf(e), at: t0, retryAfterSec: e && e.retryAfterSec };
        const hint = lastFail.kind === 'format' ? 'EFFIS gave an answer that is not GeoJSON burnt areas' : lastFail.kind === 'limit' ? 'EFFIS says too many requests, waiting' : 'EFFIS did not answer';
        ctx.log(`${hint} (${clean(e && e.message) || 'no detail'}); the last good data (if any) stay`);
        return { ok: false };
      }
    })().finally(() => { inflight = null; });
    return inflight;
  }

  function schedule(ms) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      let r;
      try { r = await refresh(); } catch (e) { r = { ok: false }; }
      let next = EVERY_MS;
      if (!r.ok) next = lastFail && lastFail.kind === 'limit' ? Math.max(30 * 60000, Math.min(3600000, (lastFail.retryAfterSec || 0) * 1000)) : Math.min(EVERY_MS, [10, 30, 60][Math.min(2, Math.max(0, failures - 1))] * 60000);
      schedule(next);
    }, ms);
    if (timer && timer.unref) timer.unref();
  }

  /* ---------- what the feed knows now ---------- */
  function fresh() {
    if (!state || !state.fetchedAt) return null;
    const age = ctx.now() - state.fetchedAt;
    return age > SERVE_MS || age < -300000 ? null : state;
  }
  const recentAreas = () => {
    if (!state) return [];
    return state.areas.map((a) => ({ lat: a[0], lng: a[1], ha: a[2], t0: a[3], t1: a[4] })).filter((a) => a.t1 <= state.fetchedAt && a.t1 >= state.fetchedAt - effis.RECENT_MS);
  };

  function read(cityId) {
    const place = ctx.places && ctx.places[cityId];
    const s = fresh();
    if (!place || !s) return [];
    const sum = effis.summariseCity(state.areas.map((a) => ({ lat: a[0], lng: a[1], ha: a[2], t0: a[3], t1: a[4] })), place, s.fetchedAt);
    const n = sum.n;
    return [{
      variable: 'burnt_area_near_km2', value: sum.km2, unit: 'km2', time: s.fetchedAt,
      where: n > 0
        ? `${n} mapped burnt ${n === 1 ? 'area' : 'areas'} centred within ${effis.NEAR_KM} km of the city centre, updated in the last 30 days (newest ${dayText(sum.newest, false)})`
        : `burnt areas centred within ${effis.NEAR_KM} km of the city centre, updated in the last 30 days`,
      whereEl: n > 0
        ? `${n} ${n === 1 ? 'χαρτογραφημένη καμένη έκταση' : 'χαρτογραφημένες καμένες εκτάσεις'} με κέντρο σε ακτίνα ${effis.NEAR_KM} km από το κέντρο της πόλης, ενημερωμένες τις τελευταίες 30 ημέρες (πιο πρόσφατη ${dayText(sum.newest, true)})`
        : `καμένες εκτάσεις με κέντρο σε ακτίνα ${effis.NEAR_KM} km από το κέντρο της πόλης, ενημερωμένες τις τελευταίες 30 ημέρες`,
      note: n > 0
        ? `Land that EFFIS mapped as burnt from satellite pictures. Only larger fires are mapped (roughly 30 hectares or more) and a map can come a day or more after the fire. A big fire can reach beyond ${effis.NEAR_KM} km. ${CALL[0]}`
        : `EFFIS mapped no burnt land near here in the last 30 days. That does not mean there was no fire: only larger fires (roughly 30 hectares or more) are mapped, and a map can come a day or more after the fire. ${CALL[0]}`,
      noteEl: n > 0
        ? `Γη που η EFFIS χαρτογράφησε ως καμένη από δορυφορικές εικόνες. Χαρτογραφούνται μόνο οι μεγαλύτερες πυρκαγιές (περίπου 30 εκτάρια ή περισσότερο) και ο χάρτης μπορεί να έρθει μία ή περισσότερες μέρες μετά τη φωτιά. Μια μεγάλη φωτιά μπορεί να φτάνει πέρα από τα ${effis.NEAR_KM} km. ${CALL[1]}`
        : `Η EFFIS δεν χαρτογράφησε καμένη γη εδώ κοντά τις τελευταίες 30 ημέρες. Αυτό δεν σημαίνει ότι δεν έγινε φωτιά: χαρτογραφούνται μόνο οι μεγαλύτερες πυρκαγιές (περίπου 30 εκτάρια ή περισσότερο) και ο χάρτης μπορεί να έρθει μία ή περισσότερες μέρες μετά τη φωτιά. ${CALL[1]}`,
    }];
  }

  function probe() {
    const none = (note, noteEl, extra) => ({ ok: false, n: 0, at: null, note, noteEl, ...(extra || {}) });
    const s = fresh();
    if (!s) {
      if (lastFail && lastFail.kind === 'format') return none('EFFIS gave an answer that is not a list of burnt areas (the service may have changed)', 'η EFFIS έδωσε απάντηση που δεν είναι λίστα καμένων εκτάσεων (η υπηρεσία μπορεί να άλλαξε)');
      if (lastFail && lastFail.kind === 'limit') return none('EFFIS says too many requests, waiting', 'η EFFIS λέει πολλά αιτήματα, περιμένουμε');
      if (state) return none('the last list from EFFIS is more than 2 days old', 'η τελευταία λίστα της EFFIS είναι παλαιότερη από 2 ημέρες', { at: state.fetchedAt });
      return none(lastFail ? 'not available right now' : 'waiting for the first answer from EFFIS', lastFail ? 'δεν είναι διαθέσιμο αυτή τη στιγμή' : 'περιμένουμε την πρώτη απάντηση της EFFIS');
    }
    const n = recentAreas().length;
    return { ok: true, n, at: s.fetchedAt, note: `${n} burnt area${n === 1 ? '' : 's'} mapped around Cyprus in the last 30 days`, noteEl: `${n} ${n === 1 ? 'καμένη έκταση χαρτογραφημένη' : 'καμένες εκτάσεις χαρτογραφημένες'} γύρω από την Κύπρο τις τελευταίες 30 ημέρες` };
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    const age = state ? ctx.now() - state.fetchedAt : Infinity;
    schedule(age < EVERY_MS - FIRST_MS ? EVERY_MS - age : FIRST_MS);
  }
  function stop() { stopped = true; clearTimeout(timer); timer = null; }

  return { id: ID, hosts: [HOST], start, stop, probe, read, images: () => [], refresh, _t: { BBOX, LAYER, get state() { return state; } } };
};
