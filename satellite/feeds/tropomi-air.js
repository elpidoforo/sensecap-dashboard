'use strict';
/* satellite/feeds/tropomi-air.js: Sentinel-5P / TROPOMI air products over the four cities: nitrogen dioxide, carbon monoxide, ozone
 * and sulphur dioxide (whole air column) and the UV aerosol index (a dust and smoke signal), about once a day, where the sky is clear.
 *
 * NEEDS A FREE ACCOUNT. TROPOMI has no keyless point service. This feed uses the Sentinel Hub "Statistical API" on the Copernicus
 * Data Space Ecosystem (CDSE), which needs an OAuth client (client id + client secret) that anyone can create for free in a CDSE
 * account (dashboard: https://shapps.dataspace.copernicus.eu/dashboard/#/account/settings). The two values are set on the server as
 *   CDSE_CLIENT_ID and CDSE_CLIENT_SECRET   (declared in sources/tropomi-air.json: access.auth.env and x_env; never written anywhere)
 * Without both, the feed does nothing: no timer, no request; probe() says "needs a free Copernicus account: set ...".
 * With the secret set, the Layers page treats the (candidate, planned) layer as active (layers.js withSatellite).
 *
 * Request shapes, written from the providers' documentation on 2026-11-12. The sandbox that wrote this CANNOT reach the services,
 * so everything below is UNVERIFIED against the live service (see the report of the "sat-air" package for the first thing to check):
 *   token   POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token
 *           content-type application/x-www-form-urlencoded, body grant_type=client_credentials&client_id=..&client_secret=..
 *           answer { access_token, expires_in, ... }; reused until shortly before it expires (token requests are rate limited)
 *           (docs: https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Overview/Authentication.html, https://docs.sentinel-hub.com/api/latest/api/overview/authentication/)
 *   stats   POST https://sh.dataspace.copernicus.eu/api/v1/statistics        header Authorization: Bearer <access_token>
 *           { input: { bounds: { bbox: [w,s,e,n], properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
 *                      data: [ { type: "S5PL2" } ] },
 *             aggregation: { timeRange: { from, to }, aggregationInterval: { of: "P1D" }, evalscript, resx: 0.05, resy: 0.05 } }
 *           answer { data: [ { interval: { from, to }, outputs: { default: { bands: { B0: { stats: { min, max, mean, stDev, sampleCount,
 *                    noDataCount } } } } } } ], status: "OK" }
 *           (docs: https://docs.sentinel-hub.com/api/latest/api/statistical , https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html)
 *   data    collection S5PL2, bands (docs: https://docs.sentinel-hub.com/api/latest/data/sentinel-5p-l2): NO2, CO, O3, SO2 in mol/m2 (whole
 *           column; NO2 is the TROPOSPHERIC column), AER_AI_340_380 unitless, dataMask. Only ONE band at a time may be asked for
 *           (CDSE limit for this collection), so one request per band and city. Default quality filter (minQa) is the service's own.
 * Units: NO2 mol/m2 x 1e6 = umol/m2; CO mol/m2 x 1e3 = mmol/m2; O3 and SO2 mol/m2 / 4.4615e-4 = Dobson units (1 DU = 4.4615e-4 mol/m2).
 *
 * A pass over Cyprus is at about 13:30 local solar time (about 11 UTC). The daily mosaic has no exact time; the reading's time is that
 * day at 11:00 UTC (never in the future). Pixels are about 5.5 x 3.5 km; the value is the mean of the clear pixels inside a box about
 * 18 km wide around the city centre, and at least 3 clear pixels are needed (else that day counts as "no data": cloud, or no pass).
 *
 * Licence: Copernicus Sentinel data licence (free, full, open; "Contains modified Copernicus Sentinel data <year>" because we average).
 * Never throws, never blocks start-up, never logs a key or an address. The last good answer is kept in ctx.dir/latest.json.
 */

const fs = require('fs');
const path = require('path');

const API_HOST = 'sh.dataspace.copernicus.eu';
const AUTH_HOST = 'identity.dataspace.copernicus.eu';
const TOKEN_URL = `https://${AUTH_HOST}/auth/realms/CDSE/protocol/openid-connect/token`;
const STATS_URL = `https://${API_HOST}/api/v1/statistics`;
const CRS84 = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';
const HOUR = 3600000, DAY = 86400000;
const DU = 4.4615e-4;                       // mol/m2 in one Dobson unit
const HALF_LAT = 0.08, HALF_LNG = 0.1;      // the box: about 18 km x 18 km
const RES = 0.05;                           // degrees, about the size of a TROPOMI pixel
const DAYS_BACK = 2;                        // today and the two days before
const PASS_HOUR_UTC = 11;
const MIN_VALID = 3;                        // clear pixels needed
const REFRESH_MS = 6 * HOUR;
const RETRY_MS = [30, 60, 120, 240].map((m) => m * 60000);
const PAUSE_MS = 400;                       // between two requests: polite to a free service
const ID_ENV = 'CDSE_CLIENT_ID', SECRET_ENV = 'CDSE_CLIENT_SECRET';

const PRODUCTS = [
  { band: 'NO2', variable: 'no2_column', unit: 'umol/m2', factor: 1e6, dec: 1 },
  { band: 'CO', variable: 'co_column', unit: 'mmol/m2', factor: 1e3, dec: 1 },
  { band: 'O3', variable: 'o3_column', unit: 'DU', factor: 1 / DU, dec: 1 },
  { band: 'SO2', variable: 'so2_column', unit: 'DU', factor: 1 / DU, dec: 2 },
  { band: 'AER_AI_340_380', variable: 'uv_aerosol_index', unit: '{index}', factor: 1, dec: 2 },
];
const VARS = PRODUCTS.map((p) => p.variable);
const BY_VAR = Object.fromEntries(PRODUCTS.map((p) => [p.variable, p]));

const num = (v) => (v == null || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
const short = (e) => String((e && e.message) || e || 'unknown error').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

/* ---------- the words ---------- */

const WHERE = {
  en: 'area about 18 km wide around the city centre (Sentinel-5P pixels are about 5.5 x 3.5 km)',
  el: 'περιοχή πλάτους περίπου 18 km γύρω από το κέντρο της πόλης (τα εικονοστοιχεία του Sentinel-5P είναι περίπου 5,5 × 3,5 km)',
};
const NOTES = {
  no2_column: (day) => ({
    en: `Nitrogen dioxide in the whole column of air from the ground to space, averaged over an area about 18 km wide, from the Sentinel-5P pass of ${day} (about 13:30 local solar time). It is not the air at street level, and the satellite sees only where the sky is clear. More NO2 usually means more burning of fuel.`,
    el: `Διοξείδιο του αζώτου σε όλη τη στήλη αέρα από το έδαφος ως το διάστημα, μέσος όρος σε περιοχή πλάτους περίπου 18 km, από το πέρασμα του Sentinel-5P της ${day} (περίπου 13:30 τοπική ηλιακή ώρα). Δεν είναι ο αέρας στο επίπεδο του δρόμου και ο δορυφόρος βλέπει μόνο όπου ο ουρανός είναι καθαρός. Περισσότερο NO2 συνήθως σημαίνει περισσότερη καύση καυσίμων.`,
  }),
  co_column: (day) => ({
    en: `Carbon monoxide in the whole air column, averaged over an area about 18 km wide, from the Sentinel-5P pass of ${day}. Most of it is high above the ground and may come from far away, so it says little about local traffic. The satellite sees only where the sky is clear.`,
    el: `Μονοξείδιο του άνθρακα σε όλη τη στήλη αέρα, μέσος όρος σε περιοχή πλάτους περίπου 18 km, από το πέρασμα του Sentinel-5P της ${day}. Το μεγαλύτερο μέρος είναι ψηλά πάνω από το έδαφος και μπορεί να έρχεται από μακριά, οπότε λέει λίγα για την τοπική κυκλοφορία. Ο δορυφόρος βλέπει μόνο όπου ο ουρανός είναι καθαρός.`,
  }),
  o3_column: (day) => ({
    en: `Thickness of the ozone layer: all the ozone in the air column, in Dobson units (DU), averaged over an area about 18 km wide, Sentinel-5P pass of ${day}. Most of it is high in the sky where it shields us from UV; it is not the ozone you breathe near the ground. Roughly 250 to 350 DU is usual at this latitude.`,
    el: `Πάχος του στρώματος όζοντος: όλο το όζον της στήλης αέρα, σε μονάδες Dobson (DU), μέσος όρος σε περιοχή πλάτους περίπου 18 km, πέρασμα του Sentinel-5P της ${day}. Το περισσότερο είναι ψηλά στον ουρανό και μας προστατεύει από την υπεριώδη ακτινοβολία· δεν είναι το όζον που αναπνέεις κοντά στο έδαφος. Περίπου 250 έως 350 DU είναι συνηθισμένο σε αυτό το γεωγραφικό πλάτος.`,
  }),
  so2_column: (day) => ({
    en: `Sulphur dioxide in the whole air column, averaged over an area about 18 km wide, Sentinel-5P pass of ${day}. Over Cyprus it is usually tiny, and values near zero or slightly below zero are just instrument noise. It stands out when a volcano or a big plume passes.`,
    el: `Διοξείδιο του θείου σε όλη τη στήλη αέρα, μέσος όρος σε περιοχή πλάτους περίπου 18 km, πέρασμα του Sentinel-5P της ${day}. Πάνω από την Κύπρο συνήθως είναι πολύ μικρό και οι τιμές κοντά στο μηδέν ή λίγο κάτω από το μηδέν είναι απλώς θόρυβος του οργάνου. Ξεχωρίζει όταν περνά ηφαίστειο ή μεγάλο σύννεφο.`,
  }),
  uv_aerosol_index: (day) => ({
    en: `UV aerosol index: a signal, not an amount. Clearly positive values (as a rule of thumb above 1) hint at dust or smoke high in the air, which is how Saharan dust shows up from space; near 0 means none seen. Averaged over about 18 km, Sentinel-5P pass of ${day}. Clouds can disturb it.`,
    el: `Δείκτης αερολυμάτων UV: ένδειξη, όχι ποσότητα. Σαφώς θετικές τιμές (ως εμπειρικός κανόνας πάνω από 1) δείχνουν σκόνη ή καπνό ψηλά στον αέρα, έτσι φαίνεται η σκόνη της Σαχάρας από το διάστημα· κοντά στο 0 σημαίνει ότι δεν φάνηκε. Μέσος όρος περίπου 18 km, πέρασμα του Sentinel-5P της ${day}. Τα σύννεφα μπορεί να τον διαταράξουν.`,
  }),
};

/* ---------- building the request ---------- */

function evalscript(band) {
  return [
    '//VERSION=3',
    'function setup() {',
    `  return { input: [{ bands: ["${band}", "dataMask"] }], output: [{ id: "default", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] };`,
    '}',
    'function evaluatePixel(s) {',
    `  return { default: [s.${band}], dataMask: [s.dataMask] };`,
    '}',
  ].join('\n');
}

// The three UTC days (today and the two before). `to` is the start of tomorrow, so the three one-day intervals fit exactly.
function timeRange(nowMs) {
  const dayStart = Math.floor(nowMs / DAY) * DAY;
  return { from: new Date(dayStart - DAYS_BACK * DAY).toISOString().replace('.000Z', 'Z'), to: new Date(dayStart + DAY).toISOString().replace('.000Z', 'Z') };
}

function statsBody(place, band, nowMs) {
  const w = round(place.lng - HALF_LNG, 4), e = round(place.lng + HALF_LNG, 4), s = round(place.lat - HALF_LAT, 4), n = round(place.lat + HALF_LAT, 4);
  return {
    input: { bounds: { bbox: [w, s, e, n], properties: { crs: CRS84 } }, data: [{ type: 'S5PL2' }] },
    aggregation: { timeRange: timeRange(nowMs), aggregationInterval: { of: 'P1D' }, evalscript: evalscript(band), resx: RES, resy: RES },
  };
}

/* ---------- reading the answer ---------- */

// The newest day with enough clear pixels -> { v (converted, rounded), day (ms of 00:00 UTC), t (reading time), valid, total } or null.
function parseStats(json, product, nowMs) {
  const list = json && Array.isArray(json.data) ? json.data : null;
  if (!list) throw new Error('the answer has no "data" list');
  let best = null;
  for (const d of list) {
    if (!d || d.error || !d.interval || !d.outputs) continue;
    const day = Date.parse(d.interval.from);
    if (!Number.isFinite(day)) continue;
    const out = d.outputs.default || Object.entries(d.outputs).find(([k]) => k !== 'dataMask')?.[1];   // the output we named "default"
    const band = out && out.bands ? Object.values(out.bands)[0] : null;
    const st = band && band.stats;
    if (!st) continue;
    const total = num(st.sampleCount), nodata = num(st.noDataCount) || 0, mean = num(st.mean);   // "NaN" text (no clear pixel) gives null
    if (total == null || mean == null || total - nodata < MIN_VALID) continue;
    if (!best || day > best.day) best = { day, valid: total - nodata, total, mean };
  }
  if (!best) return null;
  return { v: round(best.mean * product.factor, product.dec), day: best.day, t: Math.min(nowMs, best.day + PASS_HOUR_UTC * HOUR), valid: best.valid, total: best.total };
}

module.exports = function create(ctx) {
  const ids = Object.keys(ctx.places);
  const file = path.join(ctx.dir, 'latest.json');
  let state = { at: null, cities: {} };    // { at, cities: { id: { variable: { v, t, day } } } }
  let token = null;                         // { value, until }
  let timer = null, inflight = null, stopped = false, tried = false, fails = 0, lastError = null, authRefused = false;

  // The two values are read each time and never kept in a log or a message.
  const creds = () => ({ id: String(ctx.env[ID_ENV] || '').trim(), secret: String(ctx.env[SECRET_ENV] || '').trim() });
  const haveKeys = () => { const c = creds(); return !!(c.id && c.secret); };

  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (j && typeof j === 'object' && j.cities && typeof j.cities === 'object') {
        const cities = {};
        for (const id of ids) {
          const c = j.cities[id];
          if (!c || typeof c !== 'object') continue;
          for (const variable of VARS) { const x = c[variable]; if (x && num(x.v) != null && num(x.t) != null && num(x.day) != null) (cities[id] = cities[id] || {})[variable] = { v: Number(x.v), t: Number(x.t), day: Number(x.day) }; }
        }
        state = { at: num(j.at), cities };
      }
    } catch (e) { /* no cache yet, or an unreadable one */ }
  }
  function save() {
    try { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(state)); fs.renameSync(tmp, file); }
    catch (e) { ctx.log('could not save the last answer (' + short(e) + ')'); }
  }
  load();

  async function getToken() {
    const now = ctx.now();
    if (token && token.until > now) return token.value;
    const c = creds();
    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(c.id)}&client_secret=${encodeURIComponent(c.secret)}`;
    const j = await ctx.get(TOKEN_URL, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, timeoutMs: 20000 });
    if (!j || typeof j.access_token !== 'string' || !j.access_token) throw new Error('the sign-in answer has no access token');
    const life = num(j.expires_in);
    token = { value: j.access_token, until: now + Math.max(30, (life == null ? 300 : life) - 30) * 1000 };
    return token.value;
  }

  async function one(place, product) {
    const auth = { authorization: 'Bearer ' + (await getToken()) };
    let json;
    try {
      json = await ctx.get(STATS_URL, { method: 'POST', body: statsBody(place, product.band, ctx.now()), headers: auth, timeoutMs: 20000 });
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) token = null;   // an expired or refused token: sign in again next time
      throw e;
    }
    return parseStats(json, product, ctx.now());
  }

  async function fetchAll() {
    const cities = {};
    let firstErr = null, consecutive = 0, asked = 0;
    for (const id of ids) {
      for (const product of PRODUCTS) {
        if (asked++) await sleep(PAUSE_MS);
        try {
          const x = await one(ctx.places[id], product);
          consecutive = 0;
          if (x) (cities[id] = cities[id] || {})[product.variable] = { v: x.v, t: x.t, day: x.day };
        } catch (e) {
          firstErr = firstErr || e;
          consecutive++;
          if (e && (e.status === 401 || e.status === 403 || e.code === 'parse')) throw e;   // refused: do not hammer the service
          if (consecutive >= 3) throw firstErr;
        }
      }
    }
    if (!Object.keys(cities).length) {
      if (firstErr) throw firstErr;
      return { empty: true, at: ctx.now(), cities: {} };   // the service answered, but no clear pixel in three days (cloud): not an error
    }
    return { at: ctx.now(), cities };
  }

  function refresh() {
    if (inflight) return inflight;
    if (!haveKeys()) return Promise.resolve();
    tried = true;
    inflight = (async () => {
      try {
        const r = await fetchAll();
        if (r.empty) { fails = 0; lastError = null; authRefused = false; ctx.log('answered, but no clear pixel over the cities in the last three days'); return; }
        state = r; save();
        if (fails || lastError) ctx.log('answering again');
        fails = 0; lastError = null; authRefused = false;
      } catch (e) {
        fails++;
        lastError = short(e);
        authRefused = !!(e && (e.status === 401 || e.status === 403));
        ctx.log(authRefused ? `the account was refused (${lastError}); check ${ID_ENV} and ${SECRET_ENV}` : `not available right now (${lastError})`);
      } finally { inflight = null; }
    })();
    return inflight;
  }

  function schedule(ms) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await refresh();
      schedule(fails ? RETRY_MS[Math.min(fails, RETRY_MS.length) - 1] : REFRESH_MS);
    }, ms);
    if (timer.unref) timer.unref();
  }

  function readings(cityId) {
    const c = state.cities[cityId];
    if (!c) return [];
    return VARS.filter((v) => c[v]).map((variable) => {
      const p = BY_VAR[variable], n = NOTES[variable](isoDay(c[variable].day));
      return { variable, value: c[variable].v, unit: p.unit, time: c[variable].t, where: WHERE.en, whereEl: WHERE.el, note: n.en, noteEl: n.el };
    });
  }

  function needsKeyNote() {
    const c = creds();
    const missing = [!c.id ? ID_ENV : null, !c.secret ? SECRET_ENV : null].filter(Boolean);
    return {
      note: `needs a free Copernicus account: set ${missing.join(' and ')}`,
      noteEl: `χρειάζεται δωρεάν λογαριασμό Copernicus: όρισε ${missing.join(' και ')}`,
    };
  }

  async function probe() {
    if (!haveKeys() && !Object.keys(state.cities).length) return { ok: false, n: 0, at: null, ...needsKeyNote() };
    if (haveKeys() && !tried && !Object.keys(state.cities).length) await refresh();
    const have = ids.filter((id) => state.cities[id]);
    let newest = 0;
    for (const id of have) for (const x of Object.values(state.cities[id])) newest = Math.max(newest, x.t);
    if (!have.length) {
      if (!haveKeys()) return { ok: false, n: 0, at: null, ...needsKeyNote() };
      if (authRefused) return { ok: false, n: 0, at: null, note: 'the Copernicus account was refused: check the client id and secret', noteEl: 'ο λογαριασμός Copernicus απορρίφθηκε: έλεγξε το client id και το secret' };
      return { ok: false, n: 0, at: null, note: lastError ? 'not available right now' : 'no clear sky over the cities in the last three days', noteEl: lastError ? 'δεν είναι διαθέσιμο αυτή τη στιγμή' : 'ο ουρανός δεν ήταν καθαρός πάνω από τις πόλεις τις τελευταίες τρεις μέρες' };
    }
    return {
      ok: true, n: have.length, at: newest || state.at,
      note: `${have.length} of ${ids.length} cities · one pass a day, clear sky only${lastError ? ' · last update failed, showing the previous values' : ''}`,
      noteEl: `${have.length} από ${ids.length} πόλεις · ένα πέρασμα την ημέρα, μόνο με καθαρό ουρανό${lastError ? ' · η τελευταία ενημέρωση απέτυχε, φαίνονται οι προηγούμενες τιμές' : ''}`,
    };
  }

  return {
    id: 'tropomi-air',
    hosts: [API_HOST, AUTH_HOST],
    start() {
      stopped = false;
      if (!haveKeys()) return;   // no account: nothing is asked for, ever
      schedule(11000 + (hash('tropomi-air') % 9000));
    },
    stop() { stopped = true; clearTimeout(timer); timer = null; },
    probe,
    read: (cityId) => readings(cityId),
  };
};
module.exports._t = { PRODUCTS, VARS, NOTES, WHERE, statsBody, evalscript, timeRange, parseStats, TOKEN_URL, STATS_URL, DU, MIN_VALID };
