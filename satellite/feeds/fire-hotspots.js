'use strict';
/* satellite/feeds/fire-hotspots.js: fire hotspots seen from space around the four cities (NASA FIRMS).
 *
 * WHAT IT READS
 *   NASA FIRMS "area" API, CSV, one request per sensor, every 30 minutes, for a box around Cyprus (AREA below):
 *     https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/<SOURCE>/<west,south,east,north>/2
 *     SOURCE: VIIRS_NOAA21_NRT, VIIRS_NOAA20_NRT, VIIRS_SNPP_NRT (optional: NASA says Suomi NPP has stopped delivering), MODIS_NRT.
 *   It needs a free MAP_KEY (env FIRMS_MAP_KEY). Without it the feed does nothing, says so in probe() and logs ONE line.
 *   The key sits in the URL path, so it is never logged, never put in a note or an error text (ctx.get already leaves the path out).
 *
 * WHAT IT GIVES (readings for a city centre; the rules for "hotspot" are in satellite/fire/firms.js)
 *   active_fires_near_25km, active_fires_near_50km   hotspots (places, repeats merged) in the last 24 h within 25 / 50 km
 *   nearest_fire_km                                  distance to the closest hotspot within 100 km (no row when there is none)
 *   images(): one SVG, "hotspots over Cyprus", drawn on the server (satellite/fire/picture.js)
 *
 * TIMES: the 24 hours END when NASA's lists were read (fetchedAt), so a count and its time agree. The reading time of the two counts is
 * that moment. The reading time of nearest_fire_km is the overpass time of that hotspot (its newest detection).
 * Everything the feed knows is cached in <ctx.dir>/last.json; after a restart it serves the cache for up to 6 hours, then nothing.
 *
 * NOT VERIFIED from the build sandbox (no route to NASA): the live answers. The URL shape, the sources, the limits (5,000 requests per
 * 10 minutes per key) and the column names come from the FIRMS pages (see the report next to this file); what an answer looks like
 * for an empty area (assumed: the header line only) and for a bad key (assumed: HTTP 401/400, or text that is not a table) is a guess.
 */
const fs = require('fs');
const path = require('path');
const firms = require('../fire/firms');
const geo = require('../fire/geo');
const pic = require('../fire/picture');

const ID = 'fire-hotspots';
const HOST = 'firms.modaps.eosdis.nasa.gov';
const AREA = '31.3,33.7,34.9,36.1';           // west,south,east,north: 100 km round every city centre, and the picture
const DAYS = 2;                               // today and yesterday (UTC): the 24 hours before any moment are always in it
const EVERY_MS = 30 * 60000;
const FIRST_MS = 17000;
const SERVE_MS = 6 * 3600000;                 // no reading, no picture, probe not ok when the last good fetch is older than this
const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const KEEP_MS = 49 * 3600000;                 // detections older than this are never kept

const SAT_NAME = { VIIRS_NOAA21_NRT: 'NOAA-21', VIIRS_NOAA20_NRT: 'NOAA-20', VIIRS_SNPP_NRT: 'Suomi NPP', MODIS_NRT: 'MODIS' };

module.exports = function create(ctx) {
  const cacheFile = path.join(ctx.dir, 'last.json');
  const pictureFile = path.join(ctx.dir, 'hotspots-cyprus.svg');
  const island = geo.loadIsland(path.join(__dirname, '..', '..', 'public', 'site', 'island.js'));
  let state = loadCache();         // { fetchedAt, sources: { [id]: { okAt, rows, bad, low, dets: [[lat, lng, t, conf]] } } }
  let timer = null, stopped = true, inflight = null, failures = 0;
  let lastFail = null;             // { kind: 'key' | 'limit' | 'format' | 'network', at }
  let memo = null, pictureFor = 0, noKeyLogged = false;

  const key = () => { const k = ctx.env && ctx.env.FIRMS_MAP_KEY; return typeof k === 'string' ? k.trim() : ''; };
  const keyOk = () => KEY_RE.test(key());

  /* ---------- the cache on the volume ---------- */
  function loadCache() {
    try {
      const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (!j || typeof j !== 'object' || !Number.isFinite(j.fetchedAt) || typeof j.sources !== 'object' || !j.sources) return null;
      const sources = {};
      for (const s of firms.SOURCES) {
        const x = j.sources[s.id];
        if (!x || !Array.isArray(x.dets)) continue;
        sources[s.id] = { okAt: Number.isFinite(x.okAt) ? x.okAt : 0, rows: x.rows | 0, bad: x.bad | 0, low: x.low | 0, dets: x.dets.filter((d) => Array.isArray(d) && d.length === 4 && Number.isFinite(d[0]) && Number.isFinite(d[1]) && Number.isFinite(d[2]) && (d[3] === 'n' || d[3] === 'h')).slice(0, firms.MAX_DETECTIONS) };
      }
      return { fetchedAt: j.fetchedAt, sources };
    } catch (e) { return null; }
  }
  function saveCache() {
    try {
      fs.writeFileSync(cacheFile + '.tmp', JSON.stringify({ v: 1, ...state }));
      fs.renameSync(cacheFile + '.tmp', cacheFile);
    } catch (e) { ctx.log('could not save the cache (' + String(e && e.code || 'error').slice(0, 30) + ')'); }
  }

  /* ---------- fetching ---------- */
  const scrubKey = (text) => { const k = key(); let t = String(text == null ? '' : text); if (k.length >= 4) t = t.split(k).join('***'); return t.slice(0, 160); };
  const kindOf = (e) => (e && e.code === 'http' && (e.status === 401 || e.status === 403 || e.status === 400)) ? 'key' : (e && e.code === 'http' && e.status === 429) ? 'limit' : (e && /not a FIRMS table|is empty/.test(e.message || '')) ? 'format' : 'network';

  async function fetchOne(s, t0) {
    const url = `https://${HOST}/api/area/csv/${encodeURIComponent(key())}/${s.id}/${AREA}/${DAYS}`;
    const text = await ctx.get(url, { as: 'text', timeoutMs: 20000, maxBytes: 4 * 1024 * 1024 });
    const r = firms.parseDetections(text, s, { now: t0 });
    return { s, r };
  }

  // One round: all sensors, at the same time. Returns { ok, answered, failed }. Never throws.
  async function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      if (!keyOk()) return { ok: false, why: key() ? 'bad-key-shape' : 'no-key' };
      const t0 = ctx.now();
      const results = await Promise.allSettled(firms.SOURCES.map((s) => fetchOne(s, t0)));
      const next = { fetchedAt: state ? state.fetchedAt : 0, sources: { ...(state ? state.sources : {}) } };
      let answered = 0, failed = 0, worst = null;
      results.forEach((res, i) => {
        const s = firms.SOURCES[i];
        if (res.status === 'fulfilled') {
          const { r } = res.value;
          answered++;
          next.sources[s.id] = { okAt: t0, rows: r.rows, bad: r.bad, low: r.low, dets: r.detections.filter((d) => d.t >= t0 - KEEP_MS).map((d) => [d.lat, d.lng, d.t, d.conf]) };
        } else {
          failed++;
          const e = res.reason;
          const kind = kindOf(e);
          if (!worst || ['key', 'limit', 'format', 'network'].indexOf(kind) < ['key', 'limit', 'format', 'network'].indexOf(worst.kind)) worst = { kind, e };
          if (!s.optional) ctx.log(`${s.short}: ${scrubKey(e && e.message) || 'no answer'}`);
        }
      });
      const needed = firms.SOURCES.filter((s) => !s.optional);
      const gotNeeded = needed.some((s) => next.sources[s.id] && next.sources[s.id].okAt === t0);
      if (!gotNeeded) {   // nothing usable this time: keep what we had, say why once
        failures++;
        lastFail = { kind: worst ? worst.kind : 'network', at: t0, retryAfterSec: worst && worst.e && worst.e.retryAfterSec };
        const hint = lastFail.kind === 'key' ? 'NASA FIRMS refused the key (check the key that was set)' : lastFail.kind === 'limit' ? 'NASA FIRMS says too many requests, waiting' : lastFail.kind === 'format' ? 'NASA FIRMS gave an answer that is not a fire list (check FIRMS_MAP_KEY)' : 'NASA FIRMS did not answer';
        ctx.log(`${hint}; the last good data (if any) stay`);
        return { ok: false, answered, failed };
      }
      next.fetchedAt = t0;
      state = next; memo = null; failures = 0; lastFail = null;
      saveCache();
      const k = current();
      ctx.log(`NASA FIRMS answered: ${answered} of ${firms.SOURCES.length} lists, ${k ? k.hotspots.length : 0} hotspots in the last 24 h around Cyprus`);
      return { ok: true, answered, failed };
    })().catch((e) => { failures++; lastFail = { kind: 'network', at: ctx.now() }; ctx.log('the refresh failed (' + scrubKey(e && e.message) + ')'); return { ok: false }; })
      .finally(() => { inflight = null; });
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
      if (!r.ok) next = lastFail && lastFail.kind === 'limit' ? Math.max(10 * 60000, Math.min(3600000, ((lastFail.retryAfterSec || 0) * 1000))) : lastFail && lastFail.kind === 'key' ? 3600000 : Math.min(EVERY_MS, [5, 15, 30][Math.min(2, Math.max(0, failures - 1))] * 60000);
      schedule(next);
    }, ms);
    if (timer && timer.unref) timer.unref();
  }

  /* ---------- what the feed knows now ---------- */
  function current() {
    if (!state || !state.fetchedAt) return null;
    const age = ctx.now() - state.fetchedAt;
    if (age > SERVE_MS || age < -300000) return null;
    if (memo && memo.at === state.fetchedAt) return memo;
    const all = [];
    for (const s of firms.SOURCES) { const x = state.sources[s.id]; if (x) for (const d of x.dets) all.push({ lat: d[0], lng: d[1], t: d[2], conf: d[3], src: s.id }); }
    const inWin = firms.inWindow(firms.uniqueDetections(all), state.fetchedAt);
    const hotspots = firms.makeHotspots(inWin);
    const late = firms.SOURCES.filter((s) => !s.optional && !(state.sources[s.id] && state.sources[s.id].okAt >= state.fetchedAt - 120000)).map((s) => s.short);
    memo = { at: state.fetchedAt, hotspots, raw: inWin.length, late };
    return memo;
  }

  const hhmm = (ms, el) => pic.cyprusTime(ms, el);
  const satList = (ids) => ids.map((i) => SAT_NAME[i] || i).join(', ');

  // The words of the readings. The registry keeps 400 characters of a note, so each one (late warning included) stays well under that.
  const CALL = ['If you see smoke or fire, call 112.', 'Αν δεις καπνό ή φωτιά, πάρε στο 112.'];
  const lateNote = (k) => (k.late.length ? [` Not every satellite list answered (${k.late.join(', ')}), so the count may be low.`, ` Δεν απάντησαν όλες οι λίστες (${k.late.join(', ')}), οπότε ο αριθμός μπορεί να είναι χαμηλός.`] : ['', '']);

  function read(cityId) {
    const place = ctx.places && ctx.places[cityId];
    const k = current();
    if (!place || !k) return [];
    const sum = firms.summariseCity(k.hotspots, place);
    const [lEn, lEl] = lateNote(k);
    const out = [];
    const ring = (km, n, variable) => out.push({
      variable, value: n, unit: '{hotspots}', time: k.at,
      where: `within ${km} km of the city centre, last 24 hours`, whereEl: `σε ακτίνα ${km} km από το κέντρο της πόλης, τελευταίες 24 ώρες`,
      note: n > 0
        ? `Places where satellites saw heat in the last 24 h; repeat sightings of one place count once. Not a confirmed fire: flares, industry and farm burning show up too. ${CALL[0]}${lEn}`
        : `No heat spot seen within ${km} km in the last 24 h. That does not prove nothing is burning: satellites pass only a few times a day and cloud or smoke can hide a small fire. ${CALL[0]}${lEn}`,
      noteEl: n > 0
        ? `Σημεία όπου δορυφόροι είδαν θερμότητα τις τελευταίες 24 ώρες· οι επαναλήψεις του ίδιου σημείου μετρούν μία φορά. Δεν είναι επιβεβαιωμένη φωτιά: φλόγες αερίων, βιομηχανία και αγροτικές καύσεις φαίνονται κι αυτές. ${CALL[1]}${lEl}`
        : `Δεν φάνηκε θερμή κηλίδα σε ακτίνα ${km} km τις τελευταίες 24 ώρες. Αυτό δεν αποδεικνύει ότι δεν καίγεται κάτι: οι δορυφόροι περνούν λίγες φορές τη μέρα και σύννεφα ή καπνός μπορεί να κρύψουν μια μικρή φωτιά. ${CALL[1]}${lEl}`,
    });
    ring(firms.RADII_KM.near, sum.n25, 'active_fires_near_25km');
    ring(firms.RADII_KM.around, sum.n50, 'active_fires_near_50km');
    if (sum.nearest) {
      const n = sum.nearest;
      out.push({
        variable: 'nearest_fire_km', value: n.km, unit: 'km', time: n.t,
        where: `closest hotspot within ${firms.RADII_KM.search} km of the city centre, seen ${hhmm(n.t, false)} (Cyprus time) by ${satList(n.sats)}`,
        whereEl: `πλησιέστερη θερμή κηλίδα σε ακτίνα ${firms.RADII_KM.search} km από το κέντρο της πόλης, είδε ${satList(n.sats)} στις ${hhmm(n.t, true)} (ώρα Κύπρου)`,
        note: `The closest place to the city centre where a satellite saw heat in the last 24 h. The pixel is 375 m to 1 km wide, so the distance is good to about 1 km. Not a confirmed fire. ${CALL[0]}${lEn}`,
        noteEl: `Το πιο κοντινό σημείο στο κέντρο της πόλης όπου δορυφόρος είδε θερμότητα τις τελευταίες 24 ώρες. Το εικονοστοιχείο έχει πλάτος 375 m έως 1 km, άρα η απόσταση είναι σωστή περίπου ως 1 km. Δεν είναι επιβεβαιωμένη φωτιά. ${CALL[1]}${lEl}`,
      });
    }
    return out;
  }

  function probe() {
    const none = (note, noteEl, extra) => ({ ok: false, n: 0, at: null, note, noteEl, ...(extra || {}) });
    if (!key()) return none('needs a free NASA FIRMS key, which the site owner has not added yet', 'χρειάζεται δωρεάν κλειδί NASA FIRMS, που δεν το έχει προσθέσει ακόμη ο διαχειριστής');
    if (!keyOk()) return none('the NASA FIRMS key that was set does not look right (letters and digits only)', 'το κλειδί NASA FIRMS που ορίστηκε δεν φαίνεται σωστό (μόνο γράμματα και ψηφία)');
    const k = current();
    if (!k) {
      if (lastFail && lastFail.kind === 'key') return none('NASA FIRMS did not accept the key', 'η NASA FIRMS δεν δέχτηκε το κλειδί');
      if (lastFail && lastFail.kind === 'limit') return none('NASA FIRMS says too many requests, waiting', 'η NASA FIRMS λέει πολλά αιτήματα, περιμένουμε');
      if (lastFail && lastFail.kind === 'format') return none('NASA FIRMS gave an answer that is not a fire list (is the key right?)', 'η NASA FIRMS έδωσε απάντηση που δεν είναι λίστα φωτιών (είναι σωστό το κλειδί;)');
      if (state) return none('the last list from NASA FIRMS is more than 6 hours old', 'η τελευταία λίστα της NASA FIRMS είναι παλαιότερη από 6 ώρες', { at: state.fetchedAt });
      return none(lastFail ? 'not available right now' : 'waiting for the first answer from NASA FIRMS', lastFail ? 'δεν είναι διαθέσιμο αυτή τη στιγμή' : 'περιμένουμε την πρώτη απάντηση της NASA FIRMS');
    }
    const n = k.hotspots.length;
    const lateEn = k.late.length ? `; ${k.late.join(', ')} did not answer` : '', lateEl = k.late.length ? `· δεν απάντησε: ${k.late.join(', ')}` : '';
    return { ok: true, n, at: k.at, note: `${n} hotspot${n === 1 ? '' : 's'} around Cyprus in the last 24 h${lateEn}`, noteEl: `${n} θερμ${n === 1 ? 'ή κηλίδα' : 'ές κηλίδες'} γύρω από την Κύπρο τις τελευταίες 24 ώρες ${lateEl}`.trim() };
  }

  /* ---------- the picture ---------- */
  function images() {
    const k = current();
    if (!k) return [];
    const cities = Object.entries(ctx.places || {}).filter(([id]) => id[0] !== '_').map(([id, p]) => ({ id, name: p.name, lat: p.lat, lng: p.lng }));
    if (pictureFor !== k.at || !k.pic || !fs.existsSync(pictureFile)) {
      const r = pic.renderHotspotsSvg({ island: island || geo.fallbackIsland(), cities, hotspots: k.hotspots, windowEnd: k.at, fromFallback: !island });
      try { fs.writeFileSync(pictureFile + '.tmp', r.svg); fs.renameSync(pictureFile + '.tmp', pictureFile); }
      catch (e) { ctx.log('could not write the picture (' + String(e && e.code || 'error').slice(0, 30) + ')'); return []; }
      pictureFor = k.at; k.pic = { bbox: r.bbox, outside: r.outside, drawn: r.drawn };
    }
    const pm = k.pic;
    const when = hhmm(k.at, false), whenEl = hhmm(k.at, true);
    const n = pm.drawn, out = pm.outside || 0;
    const outEn = out ? ` ${out === 1 ? '1 more lies' : out + ' more lie'} outside the picture.` : '', outEl = out ? ` ${out === 1 ? '1 ακόμη είναι' : out + ' ακόμη είναι'} εκτός εικόνας.` : '';
    return [{
      id: 'hotspots-cyprus',
      title: 'Fire hotspots seen from space over Cyprus', titleEl: 'Θερμές κηλίδες φωτιάς από δορυφόρο πάνω από την Κύπρο',
      text: `Where NASA's fire satellites saw heat in the last 24 hours, up to ${when} (Cyprus time): ${n === 0 ? 'none in this picture' : n === 1 ? '1 place' : n + ' places'}.${outEn} A hotspot is a heat spot seen as a satellite passed over, not a confirmed fire: gas flares, industry and farm burning show up too, and cloud can hide a fire. The dashed rings are 25 km and 50 km from each city centre. If you see smoke or fire, call 112.`,
      textEl: `Πού είδαν θερμότητα οι δορυφόροι πυρκαγιών της NASA τις τελευταίες 24 ώρες, έως ${whenEl} (ώρα Κύπρου): ${n === 0 ? 'καμία στην εικόνα' : n === 1 ? '1 σημείο' : n + ' σημεία'}.${outEl} Μια θερμή κηλίδα είναι θερμό σημείο που είδε δορυφόρος καθώς περνούσε, όχι επιβεβαιωμένη φωτιά: καύση αερίων, βιομηχανία και αγροτικές καύσεις φαίνονται κι αυτές και τα σύννεφα μπορεί να κρύψουν μια φωτιά. Οι διακεκομμένοι κύκλοι απέχουν 25 km και 50 km από το κέντρο κάθε πόλης. Αν δεις καπνό ή φωτιά, πάρε στο 112.`,
      time: k.at, bbox: pm.bbox, file: pictureFile, contentType: 'image/svg+xml',
      attribution: 'Fire data: NASA FIRMS (LANCE, NASA ESDIS). Picture drawn by Smart Cities Cyprus. Not endorsed by NASA.',
      attributionEl: 'Δεδομένα πυρκαγιών: NASA FIRMS (LANCE, NASA ESDIS). Εικόνα από το Smart Cities Cyprus. Χωρίς έγκριση της NASA.',
    }];
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    if (!key()) {
      if (!noKeyLogged) { noKeyLogged = true; ctx.log('no NASA FIRMS key set: fire hotspots stay off (a free key is at firms.modaps.eosdis.nasa.gov/api/map_key)'); }
      return;
    }
    if (!keyOk()) { ctx.log('the NASA FIRMS key that was set does not look like a key (letters and digits only): fire hotspots stay off'); return; }
    const age = state ? ctx.now() - state.fetchedAt : Infinity;
    schedule(age < EVERY_MS - FIRST_MS ? EVERY_MS - age : FIRST_MS);
  }
  function stop() { stopped = true; clearTimeout(timer); timer = null; }

  return { id: ID, hosts: [HOST], start, stop, probe, read, images, refresh, _t: { AREA, DAYS, current, get state() { return state; } } };
};
