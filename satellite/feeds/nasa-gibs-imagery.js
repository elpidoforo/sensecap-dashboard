'use strict';
/* satellite/feeds/nasa-gibs-imagery.js: six daily pictures of Cyprus from NASA GIBS (Global Imagery Browse Services).
 *
 *   Pictures, not numbers: the descriptor (sources/nasa-gibs-imagery.json) has variables: [] and read() gives nothing. The feed fetches
 *   WMS pictures of the box [32.0, 34.4, 34.9, 35.9], keeps the last 7 days of each, and tells the registry about them through images().
 *
 *   What is fetched (DEFS below, in the order a student should meet them):
 *     true-colour       natural colours                     VIIRS on NOAA-21, then NOAA-20, then MODIS Aqua, then MODIS Terra
 *     night-lights      Earth at night                      VIIRS day/night band on NOAA-20 (a fixed 2012 picture as the very last resort)
 *     aerosol           dust and haze (optical depth)       VIIRS Deep Blue on NOAA-20, then MODIS
 *     land-temperature  ground surface heat, daytime        VIIRS on NOAA-20, then MODIS Aqua, then Terra
 *     sea-temperature   sea surface temperature             GHRSST MUR (a gap-filled analysis), then the other GHRSST products
 *     fires             hot spots over the natural colours  VIIRS thermal anomalies (375 m) on NOAA-21, NOAA-20, MODIS Aqua
 *   Suomi NPP is NOT used: NASA says it stopped delivering new data on 2026-11-02. Terra and Aqua are last in line because NASA says they
 *   will start shutting down from late 2026. The first candidate that the service says is current wins; the others are the fallback.
 *
 *   The request (WMS 1.1.1, so the box is west,south,east,north without any axis-order puzzle):
 *     https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?service=WMS&version=1.1.1&request=GetMap&layers=<id>[,<overlay>]&styles=
 *       &format=image/jpeg|image/png&transparent=FALSE&bgcolor=0x......&srs=EPSG:4326&bbox=32.0,34.4,34.9,35.9&width=1000&height=633&time=YYYY-MM-DD
 *   1000 x 633 is the true shape of the box (about 264 km by 167 km at this latitude), so the pixels are square on the ground (about 260 m).
 *
 *   The date. Every GIBS layer says "nearestValue=1": a date the layer does not have snaps to the nearest one it has, so asking for
 *   "today" can silently give an older picture. So: (1) GetCapabilities gives the real newest date of each layer (read with a few regular
 *   expressions, once every 90 minutes at the most, and only while a picture is missing); we never ask for a later date. (2) Without
 *   capabilities we ask for the dates from the oldest to the newest and throw away a picture that is byte-for-byte the same as one we hold
 *   for another date (that is the snapped copy). (3) A date is asked for only when its data is normally in: day pictures from 15:00 UTC
 *   the same day, the night picture from 04:00 UTC the next day, the sea temperature 36 hours after the date started.
 *
 *   Polite: at most one request every 1.5 s, nothing at all when every picture we want is already here, a back-off after errors
 *   (10 min, 20 min ... 3 h, and the server's Retry-After when it sends one). A restart never fetches again what the volume holds.
 *   Everything that is fetched is checked (satellite/lib/imagery.js: magic bytes, PNG checksums, JPEG end marker, size, pixel size, XML
 *   exception documents that arrive with HTTP 200) and written atomically. The folder is capped at 25 MB, the oldest pictures go first.
 *
 *   NOT verified from the sandbox (no route to gibs.earthdata.nasa.gov): the layer ids (taken from NASA's own product lists, see the
 *   report), the format of the capabilities text, and the reference layer id for coastlines ("Coastlines", else "Coastlines_15m", else none).
 *   Every one of these degrades: a layer the service does not know is skipped for 24 hours and the next candidate is tried.
 */
const path = require('path');
const fs = require('fs');
const kit = require('../lib/imagery');

const ID = 'nasa-gibs-imagery';
const HOST = 'gibs.earthdata.nasa.gov';
const ENDPOINT = `https://${HOST}/wms/epsg4326/best/wms.cgi`;
const CAPS_URL = `${ENDPOINT}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`;
const BBOX = [32.0, 34.4, 34.9, 35.9];
const W = 1000, H = 633;
const KEEP_DAYS = 7;
const HOUR = kit.HOUR, DAY = kit.DAY;
const ATTRIBUTION = "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).";
const ATTRIBUTION_EL = `${ATTRIBUTION} · Εικόνες από το Global Imagery Browse Services (GIBS) της NASA.`;   // NASA's wording stays exact; the Greek line explains it
const COAST_IDS = ['Coastlines', 'Coastlines_15m'];   // a thin outline for the science pictures; the first one the service knows is kept

const NOAA21 = 'NOAA-21 (VIIRS)', NOAA20 = 'NOAA-20 (VIIRS)', AQUA = 'Aqua (MODIS)', TERRA = 'Terra (MODIS)';

const DEFS = [
  {
    id: 'true-colour', format: 'image/jpeg', bg: '0x000000', overlay: false, readyHours: 15, hour: 12, minBytes: 15000, staleDays: 5,
    title: 'Cyprus from space, in natural colours', titleEl: 'Η Κύπρος από το διάστημα, με φυσικά χρώματα',
    text: 'Look for the brown and green land, the dark blue sea, white clouds with their shadows, and a pale haze or brown streaks when there is dust or smoke; black patches mean no picture was taken there that day.',
    textEl: 'Δες το καφέ και πράσινο έδαφος, τη σκούρα μπλε θάλασσα, τα λευκά σύννεφα με τις σκιές τους και μια ανοιχτόχρωμη θολούρα ή καφέ γραμμές όταν υπάρχει σκόνη ή καπνός· τα μαύρα σημεία σημαίνουν ότι δεν τραβήχτηκε εικόνα εκεί εκείνη τη μέρα.',
    candidates: [
      { layers: ['VIIRS_NOAA21_CorrectedReflectance_TrueColor'], platform: NOAA21 },
      { layers: ['VIIRS_NOAA20_CorrectedReflectance_TrueColor'], platform: NOAA20 },
      { layers: ['MODIS_Aqua_CorrectedReflectance_TrueColor'], platform: AQUA },
      { layers: ['MODIS_Terra_CorrectedReflectance_TrueColor'], platform: TERRA },
    ],
  },
  {
    id: 'night-lights', format: 'image/png', bg: '0x0B1220', overlay: true, readyHours: 28, hour: 23, minBytes: 1500, staleDays: 5,
    title: 'Cyprus at night', titleEl: 'Η Κύπρος τη νύχτα',
    text: 'Look for the bright glow of the cities and the thin lines of the main roads, and remember that moonlight and clouds also change what the satellite sees.',
    textEl: 'Δες τη λαμπερή λάμψη των πόλεων και τις λεπτές γραμμές των κύριων δρόμων, και θυμήσου ότι το φεγγάρι και τα σύννεφα αλλάζουν αυτό που βλέπει ο δορυφόρος.',
    candidates: [
      { layers: ['VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance'], platform: NOAA20 },
      { layers: ['VIIRS_NOAA20_DayNightBand_AtSensor_M15'], platform: NOAA20 },
      {
        layers: ['VIIRS_CityLights_2012'], platform: 'Suomi NPP (VIIRS), 2012', static: true, format: 'image/jpeg', staticTime: Date.UTC(2012, 9, 31, 12), overlay: false,
        title: 'Cyprus at night (a 2012 picture)', titleEl: 'Η Κύπρος τη νύχτα (εικόνα του 2012)',
        text: 'This is a fixed picture made from 2012 data, not last night: look for the bright cities and the lines of the main roads.',
        textEl: 'Αυτή είναι μια σταθερή εικόνα από δεδομένα του 2012, όχι της περασμένης νύχτας: δες τις φωτεινές πόλεις και τις γραμμές των κύριων δρόμων.',
      },
    ],
  },
  {
    id: 'aerosol', format: 'image/png', bg: '0xDDE3EA', overlay: true, readyHours: 15, hour: 12, minBytes: 1000, staleDays: 5,
    title: 'Dust and haze in the air', titleEl: 'Σκόνη και θολούρα στον αέρα',
    text: 'Look for the warmer colours (yellow, orange, red): they mean more tiny particles, often Saharan dust, in the air above; empty or grey areas have no measurement, often because of clouds.',
    textEl: 'Δες τα θερμά χρώματα (κίτρινο, πορτοκαλί, κόκκινο): δείχνουν περισσότερα μικροσκοπικά σωματίδια στον αέρα, συχνά σκόνη από τη Σαχάρα· τα άδεια ή γκρι σημεία δεν έχουν μέτρηση, συχνά λόγω σύννεφων.',
    candidates: [
      { layers: ['VIIRS_NOAA20_AOT_Deep_Blue_Best_Estimate'], platform: NOAA20 },
      { layers: ['MODIS_Combined_Value_Added_AOD'], platform: 'Terra and Aqua (MODIS)' },
      { layers: ['MODIS_Terra_Aerosol'], platform: TERRA },
    ],
  },
  {
    id: 'land-temperature', format: 'image/png', bg: '0xDDE3EA', overlay: true, readyHours: 15, hour: 12, minBytes: 1000, staleDays: 5,
    title: 'How hot is the ground?', titleEl: 'Πόσο ζεστό είναι το έδαφος;',
    text: 'Look for the hottest colours on dry plains and in towns and the cooler colours on the Troodos and Kyrenia mountains; this is the temperature of the ground surface when the satellite passed, not of the air, and clouds leave empty gaps.',
    textEl: 'Δες τα πιο ζεστά χρώματα στις ξερές πεδιάδες και στις πόλεις και τα πιο δροσερά στα βουνά του Τροόδους και του Πενταδακτύλου· είναι η θερμοκρασία της επιφάνειας του εδάφους τη στιγμή που πέρασε ο δορυφόρος, όχι του αέρα, και τα σύννεφα αφήνουν κενά.',
    candidates: [
      { layers: ['VIIRS_NOAA20_Land_Surface_Temp_Day'], platform: NOAA20 },
      { layers: ['MODIS_Aqua_Land_Surface_Temp_Day'], platform: AQUA },
      { layers: ['MODIS_Terra_Land_Surface_Temp_Day'], platform: TERRA },
    ],
  },
  {
    id: 'sea-temperature', format: 'image/png', bg: '0xDDE3EA', overlay: true, readyHours: 36, hour: 12, minBytes: 1000, staleDays: 6,
    title: 'How warm is the sea?', titleEl: 'Πόσο ζεστή είναι η θάλασσα;',
    text: 'Look for warmer and cooler patches of sea around Cyprus and the swirls where they mix; the map combines several satellites and fills the gaps left by clouds.',
    textEl: 'Δες τα θερμότερα και τα πιο δροσερά σημεία της θάλασσας γύρω από την Κύπρο και τις δίνες όπου αναμειγνύονται· ο χάρτης συνδυάζει πολλούς δορυφόρους και συμπληρώνει τα κενά που αφήνουν τα σύννεφα.',
    candidates: [
      { layers: ['GHRSST_L4_MUR_Sea_Surface_Temperature'], platform: 'several satellites (GHRSST MUR)' },
      { layers: ['GHRSST_L4_G1SST_Sea_Surface_Temperature'], platform: 'several satellites (GHRSST G1SST)' },
      { layers: ['GHRSST_L4_AVHRR-OI_Sea_Surface_Temperature'], platform: 'several satellites (GHRSST AVHRR-OI)' },
    ],
  },
  {
    id: 'fires', format: 'image/jpeg', bg: '0x000000', overlay: false, readyHours: 15, hour: 12, minBytes: 15000, staleDays: 5,
    title: 'Fires and hot spots', titleEl: 'Φωτιές και θερμά σημεία',
    text: 'Look for small coloured dots (usually red or orange): they mark places that looked unusually hot to the satellite, mostly fires; no dots means none were seen, but thick cloud can hide a fire.',
    textEl: 'Δες τις μικρές έγχρωμες κουκκίδες (συνήθως κόκκινες ή πορτοκαλί): δείχνουν σημεία που φάνηκαν ασυνήθιστα ζεστά στον δορυφόρο, κυρίως φωτιές· αν δεν υπάρχουν κουκκίδες, δεν είδε καμία, αλλά τα πυκνά σύννεφα μπορούν να κρύψουν μια φωτιά.',
    candidates: [
      { layers: ['VIIRS_NOAA21_CorrectedReflectance_TrueColor', 'VIIRS_NOAA21_Thermal_Anomalies_375m_All'], platform: NOAA21 },
      { layers: ['VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'VIIRS_NOAA20_Thermal_Anomalies_375m_All'], platform: NOAA20 },
      { layers: ['MODIS_Aqua_CorrectedReflectance_TrueColor', 'MODIS_Aqua_Thermal_Anomalies_All'], platform: AQUA },
    ],
  },
];
const DEF_BY_ID = Object.fromEntries(DEFS.map((d) => [d.id, d]));
const ALL_LAYERS = [...new Set([...DEFS.flatMap((d) => d.candidates.flatMap((c) => c.layers)), ...COAST_IDS])];

const ckey = (c) => c.layers.join('+');
const sleep = (ms) => new Promise((r) => { if (!(ms > 0)) return r(); const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const targetDate = (def, t) => kit.isoDay(t - def.readyHours * HOUR);
const wantDates = (newest) => Array.from({ length: KEEP_DAYS }, (_, i) => kit.isoDay(kit.dayMs(newest) - i * DAY));   // newest first
const dayTime = (def, date) => kit.dayMs(date) + def.hour * HOUR;

function mapUrl(layers, fmt, bg, date) {
  const q = ['service=WMS', 'version=1.1.1', 'request=GetMap', 'layers=' + layers.join(','), 'styles=' + ','.repeat(layers.length - 1),
    'format=' + fmt, 'transparent=FALSE', 'bgcolor=' + bg, 'srs=EPSG:4326', 'bbox=' + BBOX.join(','), 'width=' + W, 'height=' + H];
  if (date) q.push('time=' + date);
  return ENDPOINT + '?' + q.join('&');
}

// What a map server's exception means for us.
function classify(v) {
  if (v.reason === 'service-exception') {
    const s = `${v.code || ''} ${v.text || ''}`;
    if (/LayerNotDefined|invalid layer|could not find layer|no such layer|layer.{0,30}(not found|not defined|disabled)/i.test(s)) return 'layer';
    if (/time|dimension|date/i.test(s)) return 'time';
    return 'exception';
  }
  if (v.reason === 'too-small') return 'time';   // an empty picture: nothing for that date
  return 'invalid';
}

module.exports = function create(ctx, opts) {
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const envN = (name) => { try { return num(ctx.env && ctx.env[name]); } catch (e) { return null; } };
  const o = {
    pauseMs: 1500, firstDelayMs: 25000, everyMs: 3 * HOUR, maxRequests: 80, capsEveryMs: 90 * 60000, maxBytes: 25 * 1024 * 1024,
    ...(opts || {}),
  };
  if (envN('SATELLITE_IMAGERY_PAUSE_MS') != null) o.pauseMs = envN('SATELLITE_IMAGERY_PAUSE_MS');
  if (envN('SATELLITE_IMAGERY_FIRST_DELAY_MS') != null) o.firstDelayMs = envN('SATELLITE_IMAGERY_FIRST_DELAY_MS');
  if (envN('SATELLITE_IMAGERY_MAX_MB') != null) o.maxBytes = Math.max(1, envN('SATELLITE_IMAGERY_MAX_MB')) * 1024 * 1024;

  const store = kit.makeStore(ctx.dir, { maxBytes: o.maxBytes, now: () => ctx.now(), log: (m) => ctx.log(m) });
  const stateFile = path.join(ctx.dir, 'state.json');
  let state = { v: 1, caps: null, bad: {}, miss: {}, overlayBad: {}, lastRunAt: 0, lastOkAt: 0, lastError: '' };
  let running = null;

  try { store.load(); } catch (e) { ctx.log(`the picture folder could not be read (${kit.plain(e)})`); }
  try { const s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (s && s.v === 1) state = { ...state, ...s, bad: s.bad || {}, miss: s.miss || {}, overlayBad: s.overlayBad || {} }; } catch (e) { /* first start */ }
  const saveState = () => { try { kit.writeFileAtomic(stateFile, JSON.stringify(state)); } catch (e) { ctx.log(`the state file could not be written (${kit.plain(e)})`); } };

  /* ---- what we hold ---- */
  const entryId = (def, key) => `${def.id}--${key}`;
  const have = (def, date) => !!store.get(entryId(def, date));
  const datedOf = (def) => store.list().filter((e) => e.group === def.id && !e.static);
  const isBad = (key, t) => (state.bad[key] || 0) > t;
  const isMiss = (def, date, t) => (state.miss[`${def.id}|${date}`] || 0) > t;
  const markBad = (c, ms, t, why) => { state.bad[ckey(c)] = t + ms; ctx.log(`${ckey(c).split('+')[0]} is skipped for a while (${why})`); };
  const markMiss = (def, date, t) => { state.miss[`${def.id}|${date}`] = t + 6 * HOUR; };
  const cleanState = (t) => {
    for (const k of Object.keys(state.bad)) if (state.bad[k] <= t) delete state.bad[k];
    for (const k of Object.keys(state.miss)) if (state.miss[k] <= t) delete state.miss[k];
    for (const k of Object.keys(state.overlayBad)) if (state.overlayBad[k] <= t) delete state.overlayBad[k];
  };

  /* ---- the capabilities text: the real newest date of every layer ---- */
  async function ensureCaps(t, sum) {
    const c = state.caps;
    if (c && t - c.at < o.capsEveryMs) return;
    try {
      const xml = await ctx.get(CAPS_URL, { as: 'text', maxBytes: 24 * 1024 * 1024, timeoutMs: 20000 });
      sum.requests++;
      const r = kit.layerTimes(xml, ALL_LAYERS);
      if (r.layers < 50) throw new Error('the capabilities text looks too short');
      const latest = {};
      for (const [name, v] of Object.entries(r.found)) latest[name] = v.latestMs;   // null = a layer without a time (static)
      state.caps = { at: t, layers: r.layers, latest };
    } catch (e) {
      sum.requests++;
      sum.notes.add(`no capabilities (${kit.plain(e)})`);
      state.caps = c && t - c.at < 12 * HOUR ? c : null;   // an old copy is kept for a while; after that we go without
    }
  }

  function pickCandidate(def, t, tried) {
    const caps = state.caps;
    const hasDated = datedOf(def).length > 0;
    for (const c of def.candidates) {
      const key = ckey(c);
      if (tried.has(key) || isBad(key, t)) continue;
      if (c.static && hasDated) continue;                  // a fixed picture only when there is nothing better at all
      if (caps) {
        const times = c.layers.map((l) => caps.latest[l]);
        if (times.some((x) => x === undefined)) { markBad(c, 24 * HOUR, t, 'the service does not list it'); continue; }
        if (c.static) return { cand: c, latestMs: null, caps: true };
        const known = times.filter((x) => x != null);
        const latestMs = known.length ? Math.min(...known) : null;
        if (latestMs != null && t - latestMs > def.staleDays * DAY) continue;     // retired or long late: the next one is tried
        return { cand: c, latestMs, caps: latestMs != null };
      }
      return { cand: c, latestMs: null, caps: false };
    }
    return null;
  }

  /* ---- one request ---- */
  async function attempt(def, cand, date, overlayId, sum) {
    const layers = [...cand.layers, ...(overlayId ? [overlayId] : [])];
    const fmt = cand.format || def.format;
    let res;
    sum.requests++;
    try { res = await ctx.get(mapUrl(layers, fmt, def.bg, date), { as: 'buffer', full: true, maxBytes: kit.MAX_IMAGE_BYTES + 4096, timeoutMs: 20000 }); }
    catch (e) { return { kind: 'net', err: e }; }
    const v = kit.validateImage(res.body, { contentType: res.headers && res.headers['content-type'], minBytes: cand.static ? 3000 : def.minBytes, width: W, height: H });
    if (v.ok) return { kind: 'ok', v, buf: res.body };
    return { kind: classify(v), v };
  }

  const pickOverlay = (def, t) => (def.overlay ? COAST_IDS.find((id) => (state.overlayBad[id] || 0) <= t && !(state.caps && state.caps.latest[id] === undefined)) || null : null);

  // -> 'stored' | 'missing' (no picture for that date) | 'layer' (this candidate is wrong) | 'abort' | 'fail'
  async function getPicture(def, cand, date, t, sum) {
    const overlay = cand.static ? null : pickOverlay(def, t);
    let r = await attempt(def, cand, date, overlay, sum);
    if (r.kind === 'layer' && overlay) {     // the outline layer may be the one the service does not know
      await sleep(o.pauseMs);
      const r2 = await attempt(def, cand, date, null, sum);
      if (r2.kind !== 'layer') { state.overlayBad[overlay] = t + 24 * HOUR; sum.notes.add(`the outline layer ${overlay} is not used for a day`); r = { ...r2, usedOverlay: null }; }
    } else r.usedOverlay = overlay;
    if (r.kind === 'net') {
      const e = r.err, st = e && e.status;
      sum.netFails++;
      sum.notes.add(kit.plain(e));
      if (st === 429 || st >= 500 || sum.netFails >= 3) { sum.abort = true; sum.retryInMs = Math.max(sum.retryInMs, ((e && e.retryAfterSec) || 0) * 1000); return 'abort'; }
      if (st === 400) return 'layer';
      return 'fail';
    }
    if (r.kind === 'layer') return 'layer';
    if (r.kind === 'time') return 'missing';
    if (r.kind !== 'ok') { sum.failed++; sum.notes.add(r.v.detail); if (date) markMiss(def, date, t); return 'fail'; }   // rests like a missing day, so the next run reaches the older days
    sum.netFails = 0;
    const same = cand.static ? null : store.list().find((e) => e.group === def.id && !e.static && e.key !== date && e.sha256 === r.v.sha256);
    if (same) {
      // The service gave the picture of another date (nearestValue snaps a date it does not have to the nearest one it has). The real
      // date of that picture is the EARLIER of the two: the later one is the copy. Asked newest first, the copy may already be stored.
      sum.snapped++;
      if (!same.day || same.day < date) return 'missing';
      store.remove(same.id);
      if (same.savedAt >= t) sum.stored--;
      markMiss(def, same.day, t);
    }
    const key = cand.static ? 'static' : date;
    store.put({
      id: entryId(def, key), group: def.id, key, time: cand.static ? cand.staticTime : dayTime(def, date), contentType: r.v.type === 'png' ? 'image/png' : 'image/jpeg',
      day: cand.static ? null : date, platform: cand.platform, layer: cand.layers.join('+'), overlay: r.usedOverlay || null, static: !!cand.static, width: r.v.width, height: r.v.height,
    }, r.buf);
    sum.stored++;
    return 'stored';
  }

  async function fetchDates(def, pick, t, sum) {
    const cand = pick.cand;
    if (cand.static) {
      const e = store.get(entryId(def, 'static'));
      if (e && t - e.savedAt < 30 * DAY) return 'done';
      await sleep(o.pauseMs);
      const r = await getPicture(def, cand, null, t, sum);
      return r === 'layer' ? (markBad(cand, 24 * HOUR, t, 'the service refused it'), 'next') : r === 'abort' ? 'abort' : 'done';
    }
    const target = targetDate(def, t);
    const newest = pick.latestMs != null && kit.isoDay(pick.latestMs) < target ? kit.isoDay(pick.latestMs) : target;
    let dates = wantDates(newest).filter((d) => !have(def, d) && !isMiss(def, d, t));
    if (!pick.caps) dates = dates.reverse();   // oldest first: a date past the real newest comes back as a copy of the last real picture, and is recognised
    let bads = 0;
    const snapped0 = sum.snapped, stored0 = sum.stored;
    const noted = [];
    const giveUp = () => { for (const d of noted) delete state.miss[`${def.id}|${d}`]; return 'next'; };   // those misses were this candidate's, not the next one's
    for (const date of dates) {
      if (sum.abort) return 'abort';
      if (sum.requests >= o.maxRequests) { sum.notes.add('stopped for now: that was a lot of requests'); return 'done'; }
      await sleep(o.pauseMs);
      const r = await getPicture(def, cand, date, t, sum);
      if (r === 'abort') return 'abort';
      if (r === 'layer') { markBad(cand, 24 * HOUR, t, 'the service refused it'); return giveUp(); }
      if (r === 'missing') { markMiss(def, date, t); noted.push(date); bads++; }
      else if (r === 'fail') { noted.push(date); bads++; }
      else bads = 0;
      if (bads >= 3 && sum.stored === stored0) break;
    }
    // Without capabilities we went from the oldest date up. If every date after the first came back as a copy, the layer ended before
    // these dates (a satellite that stopped): the first picture is then an old one under a wrong date, so it goes and the candidate rests.
    if (!pick.caps && dates.length >= 3 && sum.snapped - snapped0 >= dates.length - 1) {
      const first = store.get(entryId(def, dates[0]));
      if (first && first.savedAt >= t) { store.remove(first.id); sum.stored--; }
      markBad(cand, 12 * HOUR, t, 'it has no new pictures');
      return giveUp();
    }
    return 'done';
  }

  async function serveDef(def, t, sum) {
    const tried = new Set();
    for (let i = 0; i < def.candidates.length && !sum.abort; i++) {
      const pick = pickCandidate(def, t, tried);
      if (!pick) return;
      const r = await fetchDates(def, pick, t, sum);
      if (r === 'next') { tried.add(ckey(pick.cand)); continue; }
      return;
    }
  }

  // The newest 7 dates of each picture type stay; a fixed fallback picture goes as soon as a real one exists.
  const keepFn = (list) => {
    const keep = new Set();
    for (const def of DEFS) {
      const dated = list.filter((e) => e.group === def.id && !e.static).sort((a, b) => b.time - a.time);
      dated.slice(0, KEEP_DAYS).forEach((e) => keep.add(e.id));
      if (!dated.length) list.filter((e) => e.group === def.id && e.static).forEach((e) => keep.add(e.id));
    }
    return keep;
  };

  async function run() {
    const t = ctx.now();
    cleanState(t);
    const sum = { requests: 0, stored: 0, failed: 0, snapped: 0, netFails: 0, abort: false, retryInMs: 0, notes: new Set() };
    const lacking = DEFS.filter((def) => wantDates(targetDate(def, t)).some((d) => !have(def, d) && !isMiss(def, d, t)) || (!datedOf(def).length && !store.get(entryId(def, 'static'))));
    if (lacking.length) {
      await ensureCaps(t, sum);
      for (const def of lacking) { if (sum.abort) break; await serveDef(def, t, sum); }
      try { store.prune(keepFn); } catch (e) { sum.notes.add(`clean-up failed (${kit.plain(e)})`); }
    }
    state.lastRunAt = t;
    const problems = [...sum.notes].slice(0, 3).join('; ');
    if (sum.abort || (sum.stored === 0 && lacking.length && problems)) { state.lastError = problems || 'no answer'; }
    else if (sum.stored || !lacking.length) { state.lastOkAt = t; state.lastError = ''; }
    saveState();
    if (problems) ctx.log(`${sum.stored} new picture(s), ${sum.requests} request(s), trouble: ${problems}`);
    else if (sum.stored) ctx.log(`${sum.stored} new picture(s), ${store.list().length} kept`);
    return { ok: !sum.abort, retryInMs: sum.retryInMs, stored: sum.stored, requests: sum.requests };
  }

  function refresh() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }

  const loop = kit.makeLoop(ctx, { run: refresh, firstDelayMs: o.firstDelayMs, everyMs: o.everyMs, failBaseMs: 10 * 60000, failMaxMs: 3 * HOUR, label: 'refresh' });

  /* ---- what the registry asks ---- */
  function probe() {
    const t = ctx.now();
    const list = store.list().filter((e) => DEF_BY_ID[e.group]);
    const fresh = DEFS.filter((def) => list.some((e) => e.group === def.id && !e.static && t - e.time < (def.staleDays + 1) * DAY)).length;
    const newest = list.filter((e) => !e.static).reduce((m, e) => Math.max(m, e.time), 0) || null;
    if (!list.length) {
      const late = state.lastError;
      return { ok: false, n: 0, at: null, note: late ? 'no picture yet, the last try failed' : 'no picture yet; the first fetch runs a little after the server starts', noteEl: late ? 'καμία εικόνα ακόμη, η τελευταία προσπάθεια απέτυχε' : 'καμία εικόνα ακόμη· η πρώτη λήψη γίνεται λίγο μετά την εκκίνηση του διακομιστή' };
    }
    const ok = fresh >= 1;
    return {
      ok, n: list.length, at: newest,
      note: `${list.length} pictures kept, ${fresh} of ${DEFS.length} kinds up to date${newest ? ', newest for ' + kit.isoDay(newest) : ''}${state.lastError ? '; the last try failed' : ''}`,
      noteEl: `${list.length} εικόνες αποθηκευμένες, ${fresh} από ${DEFS.length} είδη ενημερωμένα${newest ? ', η πιο πρόσφατη για ' + kit.isoDay(newest) : ''}${state.lastError ? '· η τελευταία προσπάθεια απέτυχε' : ''}`,
    };
  }

  const read = () => [];   // pictures only: nothing is read at a point

  function images() {
    const order = (id) => DEFS.findIndex((d) => d.id === id);
    const list = store.list().filter((e) => DEF_BY_ID[e.group]).sort((a, b) => b.time - a.time || order(a.group) - order(b.group));
    const newestOf = {};
    for (const e of list) if (!(e.group in newestOf)) newestOf[e.group] = e.id;
    return list.map((e) => {
      const def = DEF_BY_ID[e.group];
      const cand = def.candidates.find((c) => c.layers.join('+') === e.layer);
      const src = e.static && cand ? cand : def;
      return {
        id: e.static ? `${def.id}-fixed` : `${def.id}-${e.day}`,
        title: src.title, titleEl: src.titleEl,
        text: `${src.text} Satellite: ${e.platform}.`, textEl: `${src.textEl} Δορυφόρος: ${e.platform}.`,
        time: e.time, bbox: BBOX, file: e.file, contentType: e.contentType,
        attribution: ATTRIBUTION, attributionEl: ATTRIBUTION_EL,
        // extras for a viewer that groups the pictures by kind (the registry may drop them): kind, day, newest of its kind, the layer
        group: def.id, day: e.day, latest: newestOf[e.group] === e.id, layer: e.layer, platform: e.platform, fixed: !!e.static,
      };
    });
  }

  function start() { try { loop.start(); } catch (e) { ctx.log(`could not start (${kit.plain(e)})`); } }
  function stop() { try { loop.stop(); } catch (e) { /* stopping always finishes */ } }

  return { id: ID, hosts: [HOST], start, stop, probe, read, images, refresh, _t: { store, get state() { return state; }, DEFS, o, loop } };
};
module.exports.DEFS = DEFS;
module.exports.mapUrl = mapUrl;
module.exports.ATTRIBUTION = ATTRIBUTION;
module.exports.BBOX = BBOX;
module.exports.SIZE = { width: W, height: H };
