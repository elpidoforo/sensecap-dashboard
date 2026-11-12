'use strict';
/* satellite/feeds/eumetsat-meteosat-view.js: two Meteosat pictures of the eastern Mediterranean from EUMETSAT's EUMETView (a GeoServer WMS).
 *
 *   Pictures, not numbers (variables: [] in sources/eumetsat-meteosat-view.json, read() gives nothing).
 *     geocolour   clouds in natural colours by day (an infrared-based picture at night)     MTG-I1 / Meteosat-12 at 0 degrees, then fallbacks
 *     dust        the "dust RGB": pink to violet is dust                                    MSG at 45.5 E (Indian Ocean service), then MSG 0 degrees, then MTG
 *   Only RGB image products are used (EUMETSAT's data policy calls them "advanced image products", core data, free under CC BY 4.0).
 *   A single-channel picture (for example one infrared channel) is deliberately NOT used: the policy treats Level 1 data of a short
 *   delay differently.
 *
 *   The request (WMS 1.3.0; for EPSG:4326 the box is south,west,north,east, as EUMETSAT's own guide says):
 *     https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetMap&layers=<layer>,backgrounds:ne_10m_coastline,backgrounds:ne_boundary_lines_land
 *       &styles=,,&crs=EPSG:4326&bbox=29,25,41,41&width=1000&height=916&format=image/jpeg&transparent=false&bgcolor=0xCCCCCC&time=2026-11-12T10:20:00.000Z
 *   (the coastline and border layers are the ones EUMETSAT's own example request uses; they are dropped when the server does not know them).
 *   The box is lon 25-41, lat 29-41: Cyprus in the middle, Libya, Egypt, Turkey and the Levant around it, because a dust plume or a
 *   front is a regional story. 1000 x 916 keeps the pixels square on the ground. One Meteosat pixel is about 1 to 5 km at this latitude.
 *
 *   The time. A frame is not on the server the moment it is taken, so we never guess: GetCapabilities gives the newest time of the
 *   layer (read with a few regular expressions) and that exact time is requested. If the capabilities cannot be read we ask without
 *   TIME (EUMETSAT's own example does this for "the newest picture") and the time is marked as approximate.
 *   Capabilities are asked of the workspace service first (/geoserver/<workspace>/wms), then of the whole server, and the way that
 *   worked is remembered.
 *
 *   Polite: every 45 minutes, one request at a time with a pause, nothing when the newest frame we hold is younger than the layer's
 *   rhythm, a back-off after errors (10 min, 20 min ... 3 h, Retry-After respected). EUMETSAT's service queues rather than refuses
 *   when it is busy, so we never stack requests.
 *
 *   What is kept: the newest frame of each kind (id "<kind>-latest"), plus one frame per day for the last 7 days: the first one at or
 *   after 10:30 UTC (before 14:30), which is midday in Cyprus, so that two days can be compared. At most 25 MB; the oldest go first.
 *
 *   NOT verified from the sandbox (no route to view.eumetsat.int): the layer names (mtg_fd:rgb_cloudtype, msg_iodc:rgb_dust,
 *   msg_fes:rgb_naturalenhncd are named on EUMETSAT-related pages; mtg_fd:rgb_geocolour / rgb_truecolour come from a public GitHub
 *   issue and a pull request that use them; msg_fes:rgb_dust and mtg_fd:rgb_dust are guesses by the naming pattern), the format of the
 *   capabilities text, and the maximum image size. Every one degrades to the next candidate, or to "not available right now".
 */
const path = require('path');
const fs = require('fs');
const kit = require('../lib/imagery');

const ID = 'eumetsat-meteosat-view';
const HOST = 'view.eumetsat.int';
const BASE = `https://${HOST}/geoserver`;
const BBOX = [25.0, 29.0, 41.0, 41.0];   // west, south, east, north (what images() reports)
const W = 1000, H = 916;
const KEEP_DAYS = 7;
const MIN = 60000, HOUR = kit.HOUR;
const SLOT = [10.5 * HOUR, 14.5 * HOUR];  // the daily frame is the first one in this window of the UTC day (10:30 to 14:30)
const OVERLAY = ['backgrounds:ne_10m_coastline', 'backgrounds:ne_boundary_lines_land'];
const credit = (year, withOverlay) => `Contains modified EUMETSAT Meteosat data ${year}${withOverlay ? '; coastlines and borders: Natural Earth' : ''}`;
// the licence's own wording stays exact (English); the Greek line after it says the same in plain words
const creditEl = (year, withOverlay) => `${credit(year, withOverlay)} · Περιέχει τροποποιημένα δεδομένα Meteosat του EUMETSAT ${year}${withOverlay ? '· ακτογραμμές και σύνορα: Natural Earth' : ''}`;

const MTG = 'Meteosat-12 (MTG, 0°)', MSG0 = 'Meteosat (MSG, 0°)', IODC = 'Meteosat (MSG, 45.5°E)';

// Short names of the kinds of picture, for the buttons that switch between them in the layer dialog: [English, Greek].
const SHORT = { geocolour: ['Clouds', 'Σύννεφα'], dust: ['Dust map', 'Χάρτης σκόνης'] };
const DEFS = [
  {
    id: 'geocolour', cadenceMin: 10, minBytes: 20000,
    title: 'Clouds over the eastern Mediterranean, from 36,000 km up', titleEl: 'Σύννεφα πάνω από την ανατολική Μεσόγειο, από ύψος 36.000 χλμ.',
    text: 'Look for the white swirls and bands of cloud moving over the sea and the land; by day the colours are natural, and at night the picture is dark or drawn from infrared (heat) data.',
    textEl: 'Δες τις λευκές δίνες και ζώνες των σύννεφων πάνω από τη θάλασσα και τη στεριά· τη μέρα τα χρώματα είναι φυσικά και τη νύχτα η εικόνα είναι σκοτεινή ή φτιαγμένη από υπέρυθρα (θερμικά) δεδομένα.',
    candidates: [
      { layer: 'mtg_fd:rgb_geocolour', platform: MTG },
      { layer: 'mtg_fd:rgb_truecolour', platform: MTG },
      { layer: 'msg_fes:rgb_naturalenhncd', platform: MSG0 },
    ],
  },
  {
    id: 'dust', cadenceMin: 15, minBytes: 20000,
    title: 'Saharan dust and clouds (the dust map)', titleEl: 'Σκόνη από τη Σαχάρα και σύννεφα (ο χάρτης σκόνης)',
    text: 'Look for pink to violet areas (magenta over warm land): that is dust; dark blue or black streaks are thin high clouds, and low clouds are hard to see in this picture.',
    textEl: 'Δες τις ροζ έως βιολετί περιοχές (ματζέντα πάνω από ζεστή στεριά): είναι σκόνη· οι σκούρες μπλε ή μαύρες γραμμές είναι ψηλά λεπτά σύννεφα και τα χαμηλά σύννεφα δύσκολα φαίνονται σε αυτή την εικόνα.',
    candidates: [
      { layer: 'msg_iodc:rgb_dust', platform: IODC },
      { layer: 'msg_fes:rgb_dust', platform: MSG0 },
      { layer: 'mtg_fd:rgb_dust', platform: MTG },
    ],
  },
];
const DEF_BY_ID = Object.fromEntries(DEFS.map((d) => [d.id, d]));
const ws = (layer) => layer.split(':')[0];
const WORKSPACES = [...new Set(DEFS.flatMap((d) => d.candidates.map((c) => ws(c.layer))))];
const ALL_LAYERS = DEFS.flatMap((d) => d.candidates.map((c) => c.layer));

const sleep = (ms) => new Promise((r) => { if (!(ms > 0)) return r(); const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const frameKey = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 13).toLowerCase();   // 20261112t1030
const inSlot = (ms) => { const s = ms % kit.DAY; return s >= SLOT[0] && s < SLOT[1]; };

function mapUrl(layer, overlay, timeIso) {
  const layers = [layer, ...(overlay ? OVERLAY : [])];
  const q = ['service=WMS', 'version=1.3.0', 'request=GetMap', 'layers=' + layers.join(','), 'styles=' + ','.repeat(layers.length - 1), 'crs=EPSG:4326',
    `bbox=${BBOX[1]},${BBOX[0]},${BBOX[3]},${BBOX[2]}`, 'width=' + W, 'height=' + H, 'format=image/jpeg', 'transparent=false', 'bgcolor=0xCCCCCC'];
  if (timeIso) q.push('time=' + timeIso);
  return `${BASE}/wms?${q.join('&')}`;
}
const capsUrl = (workspace) => `${BASE}/${workspace ? workspace + '/' : ''}wms?service=WMS&version=1.3.0&request=GetCapabilities`;

function classify(v) {
  if (v.reason === 'service-exception') {
    const s = `${v.code || ''} ${v.text || ''}`;
    if (/LayerNotDefined|InvalidParameterValue.{0,40}layer|could not find layer|no such layer|layer.{0,30}(not found|not defined)/i.test(s)) return 'layer';
    if (/time|dimension|date/i.test(s)) return 'time';
    return 'exception';
  }
  return 'invalid';
}

/* Which frames stay: the newest of each kind, and the daily frame (the earliest one inside the 10:30-14:30 UTC window) of the last 7 dates. */
function keepFrames(list, defs) {
  const keep = new Set();
  for (const def of defs) {
    const frames = list.filter((e) => e.group === def.id).sort((a, b) => b.time - a.time);
    if (!frames.length) continue;
    keep.add(frames[0].id);
    const newestDay = kit.isoDay(frames[0].time);
    const oldestDay = kit.isoDay(kit.dayMs(newestDay) - (KEEP_DAYS - 1) * kit.DAY);
    const firstOfDay = new Map();
    for (const e of [...frames].reverse()) {                    // oldest first
      const d = kit.isoDay(e.time);
      if (d >= oldestDay && inSlot(e.time) && !firstOfDay.has(d)) firstOfDay.set(d, e);
    }
    for (const e of firstOfDay.values()) keep.add(e.id);
  }
  return keep;
}

module.exports = function create(ctx, opts) {
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const envN = (name) => { try { return num(ctx.env && ctx.env[name]); } catch (e) { return null; } };
  const o = { pauseMs: 2000, firstDelayMs: 40000, everyMs: 45 * MIN, capsTtlMs: 20 * MIN, staleMs: 6 * HOUR, maxBytes: 25 * 1024 * 1024, ...(opts || {}) };
  if (envN('SATELLITE_IMAGERY_PAUSE_MS') != null) o.pauseMs = envN('SATELLITE_IMAGERY_PAUSE_MS');
  if (envN('SATELLITE_IMAGERY_FIRST_DELAY_MS') != null) o.firstDelayMs = envN('SATELLITE_IMAGERY_FIRST_DELAY_MS');   // (the default, 40 s, is already later than the NASA feed's 25 s)
  if (envN('SATELLITE_IMAGERY_MAX_MB') != null) o.maxBytes = Math.max(1, envN('SATELLITE_IMAGERY_MAX_MB')) * 1024 * 1024;

  const store = kit.makeStore(ctx.dir, { maxBytes: o.maxBytes, now: () => ctx.now(), log: (m) => ctx.log(m) });
  const stateFile = path.join(ctx.dir, 'state.json');
  let state = { v: 1, caps: {}, capsMode: 'ws', bad: {}, overlayBadUntil: 0, lastRunAt: 0, lastOkAt: 0, lastError: '' };
  let running = null;

  try { store.load(); } catch (e) { ctx.log(`the picture folder could not be read (${kit.plain(e)})`); }
  try { const s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (s && s.v === 1) state = { ...state, ...s, caps: s.caps || {}, bad: s.bad || {} }; } catch (e) { /* first start */ }
  const saveState = () => { try { kit.writeFileAtomic(stateFile, JSON.stringify(state)); } catch (e) { ctx.log(`the state file could not be written (${kit.plain(e)})`); } };

  const framesOf = (def) => store.list().filter((e) => e.group === def.id).sort((a, b) => b.time - a.time);
  const isBad = (layer, t) => (state.bad[layer] || 0) > t;
  const markBad = (layer, t, why) => { state.bad[layer] = t + 24 * HOUR; ctx.log(`${layer} is skipped for a day (${why})`); };

  /* ---- capabilities: the newest time of each layer ---- */
  async function capsFor(workspace, t, sum) {
    const c = state.caps[workspace];
    if (c && t - c.at < o.capsTtlMs) return c;
    const order = state.capsMode === 'global' ? ['global', 'ws'] : ['ws', 'global'];
    for (const mode of order) {
      try {
        sum.requests++;
        const xml = await ctx.get(capsUrl(mode === 'ws' ? workspace : ''), { as: 'text', maxBytes: 20 * 1024 * 1024, timeoutMs: 20000 });
        const names = mode === 'ws' ? ALL_LAYERS.filter((l) => ws(l) === workspace) : ALL_LAYERS;
        const r = kit.layerTimes(xml, names);
        if (r.layers < 3) throw new Error('the capabilities text looks too short');
        const at = ctx.now();
        for (const w of mode === 'ws' ? [workspace] : WORKSPACES) {
          const latest = {};
          for (const l of ALL_LAYERS.filter((x) => ws(x) === w)) if (r.found[l]) latest[l] = r.found[l].latestMs;
          state.caps[w] = { at, latest, layers: r.layers };
        }
        state.capsMode = mode;
        return state.caps[workspace];
      } catch (e) {
        sum.notes.add(`capabilities (${mode}): ${kit.plain(e)}`);
        if (e && (e.status === 429 || e.status >= 500)) { sum.abort = true; sum.retryInMs = Math.max(sum.retryInMs, ((e && e.retryAfterSec) || 0) * 1000); return null; }
      }
    }
    return null;
  }

  async function attempt(layer, overlay, timeIso, def, sum) {
    let res;
    sum.requests++;
    try { res = await ctx.get(mapUrl(layer, overlay, timeIso), { as: 'buffer', full: true, maxBytes: kit.MAX_IMAGE_BYTES + 4096, timeoutMs: 20000 }); }
    catch (e) { return { kind: 'net', err: e }; }
    const v = kit.validateImage(res.body, { contentType: res.headers && res.headers['content-type'], minBytes: def.minBytes, width: W, height: H });
    return v.ok ? { kind: 'ok', v, buf: res.body } : { kind: classify(v), v };
  }

  // -> 'stored' | 'same' (nothing new) | 'layer' | 'time' | 'abort' | 'fail'
  async function getFrame(def, cand, timeMs, approx, t, sum) {
    const withOverlay = state.overlayBadUntil <= t;
    const iso = timeMs != null && !approx ? new Date(timeMs).toISOString() : null;
    let r = await attempt(cand.layer, withOverlay, iso, def, sum), usedOverlay = withOverlay;
    if (r.kind === 'layer' && withOverlay) {
      await sleep(o.pauseMs);
      const r2 = await attempt(cand.layer, false, iso, def, sum);
      if (r2.kind !== 'layer') { state.overlayBadUntil = t + 24 * HOUR; sum.notes.add('the coastline layers are not used for a day'); r = r2; usedOverlay = false; }
    }
    if (r.kind === 'net') {
      const e = r.err, st = e && e.status;
      sum.netFails++;
      sum.notes.add(kit.plain(e));
      if (st === 429 || st >= 500 || sum.netFails >= 2) { sum.abort = true; sum.retryInMs = Math.max(sum.retryInMs, ((e && e.retryAfterSec) || 0) * 1000); return 'abort'; }
      return st === 400 ? 'layer' : 'fail';
    }
    if (r.kind === 'layer' || r.kind === 'time') return r.kind;
    if (r.kind !== 'ok') { sum.failed++; sum.notes.add(r.v.detail); return 'fail'; }
    sum.netFails = 0;
    const held = framesOf(def);
    if (held.length && held[0].sha256 === r.v.sha256) return 'same';
    const at = timeMs;
    store.put({
      id: `${def.id}--${frameKey(at)}`, group: def.id, key: frameKey(at), time: at, contentType: r.v.type === 'png' ? 'image/png' : 'image/jpeg',
      platform: cand.platform, layer: cand.layer, overlay: usedOverlay, approx: !!approx, width: r.v.width, height: r.v.height,
    }, r.buf);
    sum.stored++;
    return 'stored';
  }

  async function serveDef(def, t, sum) {
    const held = framesOf(def);
    const newestHeld = held.length ? held[0].time : 0;
    if (newestHeld && t - newestHeld < def.cadenceMin * MIN) return;           // the next frame cannot be there yet
    let stale = null;                                                          // the first candidate that works but is late, used only if no fresh one exists
    for (const cand of def.candidates) {
      if (sum.abort) return;
      if (isBad(cand.layer, t)) continue;
      const caps = await capsFor(ws(cand.layer), t, sum);
      if (sum.abort) return;
      let latestMs = null;
      if (caps) {
        if (!(cand.layer in caps.latest)) { markBad(cand.layer, t, 'the service does not list it'); continue; }
        latestMs = caps.latest[cand.layer];
        if (latestMs != null && t - latestMs > o.staleMs) { if (!stale) stale = { cand, latestMs }; continue; }
      }
      const r = await fetchOne(def, cand, latestMs, newestHeld, t, sum);
      if (r === 'layer') { markBad(cand.layer, t, 'the service refused it'); continue; }
      return;
    }
    if (stale && !sum.abort && stale.latestMs > newestHeld) await fetchOne(def, stale.cand, stale.latestMs, newestHeld, t, sum);
  }

  async function fetchOne(def, cand, latestMs, newestHeld, t, sum) {
    let timeMs = latestMs, approx = false;
    if (timeMs != null && timeMs <= newestHeld) return 'same';                 // capabilities say there is nothing newer than what we hold
    if (timeMs == null) { const step = def.cadenceMin * MIN; timeMs = Math.floor((t - 30 * MIN) / step) * step; approx = true; }
    await sleep(o.pauseMs);
    let r = await getFrame(def, cand, timeMs, approx, t, sum);
    if (r === 'time' && !approx && !sum.abort) {   // the time the capabilities named is refused: ask for "the newest" without TIME, time marked approximate
      sum.notes.add('the newest frame was not served at its listed time');
      const step = def.cadenceMin * MIN;
      await sleep(o.pauseMs);
      r = await getFrame(def, cand, Math.floor((t - 30 * MIN) / step) * step, true, t, sum);
    }
    return r;
  }

  async function run() {
    const t = ctx.now();
    for (const k of Object.keys(state.bad)) if (state.bad[k] <= t) delete state.bad[k];
    const sum = { requests: 0, stored: 0, failed: 0, netFails: 0, abort: false, retryInMs: 0, notes: new Set() };
    for (const def of DEFS) { if (sum.abort) break; await serveDef(def, t, sum); }
    try { store.prune((list) => keepFrames(list, DEFS)); } catch (e) { sum.notes.add(`clean-up failed (${kit.plain(e)})`); }
    state.lastRunAt = t;
    const problems = [...sum.notes].slice(0, 3).join('; ');
    if (sum.abort || (sum.stored === 0 && problems && DEFS.some((d) => !framesOf(d).length))) state.lastError = problems || 'no answer';
    else { state.lastOkAt = t; state.lastError = ''; }
    saveState();
    if (problems) ctx.log(`${sum.stored} new picture(s), ${sum.requests} request(s), trouble: ${problems}`);
    else if (sum.stored) ctx.log(`${sum.stored} new picture(s), ${store.list().length} kept`);
    return { ok: !sum.abort, retryInMs: sum.retryInMs, stored: sum.stored, requests: sum.requests };
  }

  function refresh() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }
  const loop = kit.makeLoop(ctx, { run: refresh, firstDelayMs: o.firstDelayMs, everyMs: o.everyMs, failBaseMs: 10 * MIN, failMaxMs: 3 * HOUR, label: 'refresh' });

  /* ---- what the registry asks ---- */
  function probe() {
    const t = ctx.now();
    const list = store.list().filter((e) => DEF_BY_ID[e.group]);
    const fresh = DEFS.filter((d) => { const f = framesOf(d)[0]; return f && t - f.time < 3 * HOUR; }).length;
    const newest = list.reduce((m, e) => Math.max(m, e.time), 0) || null;
    if (!list.length) {
      const late = state.lastError;
      return { ok: false, n: 0, at: null, note: late ? 'no picture yet, the last try failed' : 'no picture yet; the first fetch runs a little after the server starts', noteEl: late ? 'καμία εικόνα ακόμη, η τελευταία προσπάθεια απέτυχε' : 'καμία εικόνα ακόμη· η πρώτη λήψη γίνεται λίγο μετά την εκκίνηση του διακομιστή' };
    }
    const age = newest ? Math.round((t - newest) / MIN) : null;
    return {
      ok: fresh >= 1, n: list.length, at: newest,
      note: `${list.length} pictures kept, ${fresh} of ${DEFS.length} kinds under 3 hours old${age != null ? `, newest ${age < 90 ? age + ' min' : Math.round(age / 60) + ' h'} old` : ''}${state.lastError ? '; the last try failed' : ''}`,
      noteEl: `${list.length} εικόνες αποθηκευμένες, ${fresh} από ${DEFS.length} είδη κάτω από 3 ώρες${age != null ? `, η πιο πρόσφατη πριν από ${age < 90 ? age + ' λεπτά' : Math.round(age / 60) + ' ώρες'}` : ''}${state.lastError ? '· η τελευταία προσπάθεια απέτυχε' : ''}`,
    };
  }

  const read = () => [];

  function images() {
    const order = (id) => DEFS.findIndex((d) => d.id === id);
    const list = store.list().filter((e) => DEF_BY_ID[e.group]).sort((a, b) => b.time - a.time || order(a.group) - order(b.group));
    const newestOf = {};
    for (const e of list) if (!(e.group in newestOf)) newestOf[e.group] = e.id;
    return list.map((e) => {
      const def = DEF_BY_ID[e.group];
      const latest = newestOf[e.group] === e.id, day = kit.isoDay(e.time);
      const c = credit(new Date(e.time).getUTCFullYear(), e.overlay);
      return {
        id: latest ? `${def.id}-latest` : `${def.id}-${day}`,
        title: def.title, titleEl: def.titleEl,
        text: `${def.text} Satellite: ${e.platform}.${e.approx ? ' The time is approximate.' : ''}`,
        textEl: `${def.textEl} Δορυφόρος: ${e.platform}.${e.approx ? ' Η ώρα είναι κατά προσέγγιση.' : ''}`,
        time: e.time, bbox: BBOX, file: e.file, contentType: e.contentType, attribution: c, attributionEl: creditEl(new Date(e.time).getUTCFullYear(), e.overlay),
        group: def.id, day, latest, layer: e.layer, platform: e.platform, fixed: false,
        groupOrder: DEFS.indexOf(def), groupLabel: (SHORT[def.id] || [])[0] || null, groupLabelEl: (SHORT[def.id] || [])[1] || null,
      };
    });
  }

  function start() { try { loop.start(); } catch (e) { ctx.log(`could not start (${kit.plain(e)})`); } }
  function stop() { try { loop.stop(); } catch (e) { /* stopping always finishes */ } }

  return { id: ID, hosts: [HOST], start, stop, probe, read, images, refresh, _t: { store, get state() { return state; }, DEFS, o, loop } };
};
module.exports.DEFS = DEFS;
module.exports.mapUrl = mapUrl;
module.exports.capsUrl = capsUrl;
module.exports.keepFrames = keepFrames;
module.exports.frameKey = frameKey;
module.exports.BBOX = BBOX;
module.exports.SIZE = { width: W, height: H };
