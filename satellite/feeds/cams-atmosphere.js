'use strict';
/* satellite/feeds/cams-atmosphere.js: haze, UV index and three gases for the four cities, from the CAMS atmospheric-composition
 * MODEL, read through the free Open-Meteo air-quality API (the same service the "openmeteo-air" layer uses).
 *
 * WHAT THIS IS (say it plainly, to students too): a computer MODEL, not a satellite measurement. CAMS (the Copernicus Atmosphere
 * Monitoring Service, run by ECMWF) starts its forecasts from a picture of the atmosphere that is corrected with satellite
 * measurements ("data assimilation"): for haze the global system takes in MODIS aerosol data from the Terra and Aqua satellites,
 * for ozone and carbon monoxide it takes in several satellite instruments. So satellites FEED the model, but the numbers here are
 * model numbers for a grid cell, never a satellite pixel and never a sensor at the school. quality.kind is "model" for that reason.
 *
 * API (read from https://open-meteo.com/en/docs/air-quality-api on 2026-11-12; the real service cannot be reached from the build sandbox):
 *   GET https://air-quality-api.open-meteo.com/v1/air-quality
 *       ?latitude=a,b,c,d&longitude=a,b,c,d            several places in one call: the answer is then a LIST with one object per place
 *       &hourly=aerosol_optical_depth,uv_index,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide
 *       &past_days=1&forecast_days=1                    yesterday and today: the newest hour that is not in the future is used
 *       &timeformat=unixtime&timezone=GMT               times are seconds since 1970 (UTC)
 *   answer per place: { hourly: { time: [...], <variable>: [...] }, hourly_units: { <variable>: "..." }, ... }
 *   units (docs): gases ug/m3 near the ground (10 m); aerosol_optical_depth dimensionless, at 550 nm, whole atmosphere;
 *   uv_index "index", considering clouds. Free for non-commercial use; attribution to Open-Meteo and to the CAMS data provider.
 *   Model domains: CAMS Europe 0.1 deg (about 11 km), CAMS global 0.4 deg (about 45 km), "auto" (the default) combines them; the
 *   answer does not say which one answered which variable, so the cell is described as 11 to 45 km wide.
 *   An unknown variable name gives HTTP 400 {"error":true,"reason":...}: then each variable is asked for on its own and the ones
 *   that are refused are left out (one log line), so a renamed variable never takes the others down.
 *
 * Safety nets: a unit that is not the expected one drops that variable (a silent change of unit would be a wrong number on a
 * school page). The last good answer is kept in ctx.dir/latest.json, so a restart or a dead network still shows the last values
 * (their `time` is old, which the Layers page shows as "late"). Never throws, never blocks start-up.
 */

const fs = require('fs');
const path = require('path');

const HOST = 'air-quality-api.open-meteo.com';
const BASE = 'https://' + HOST + '/v1/air-quality';
const HOUR = 3600000;
const VARS = ['aerosol_optical_depth', 'uv_index', 'nitrogen_dioxide', 'sulphur_dioxide', 'carbon_monoxide'];
// the unit each variable must have in vocab/variables.json, and what the API may call it in hourly_units
const UNIT = { aerosol_optical_depth: '{AOD}', uv_index: '{UVI}', nitrogen_dioxide: 'ug/m3', sulphur_dioxide: 'ug/m3', carbon_monoxide: 'ug/m3' };
const GAS_UNIT = /^[µμu]g\s*\/\s*m(3|³)$/i;
const NO_UNIT = /^(|dimensionless|unitless|1|index|uvi)$/i;
const API_UNIT = { aerosol_optical_depth: NO_UNIT, uv_index: NO_UNIT, nitrogen_dioxide: GAS_UNIT, sulphur_dioxide: GAS_UNIT, carbon_monoxide: GAS_UNIT };
const DECIMALS = { aerosol_optical_depth: 3, uv_index: 2, nitrogen_dioxide: 2, sulphur_dioxide: 2, carbon_monoxide: 1 };
const LOOK_BACK_H = 3;         // when the newest hour has no value for a variable, up to this many hours earlier are tried
const REFRESH_MS = HOUR;       // the value for "this hour" changes every hour
const RETRY_MS = [10, 20, 40, 60].map((m) => m * 60000);

const num = (v) => (v == null || v === '' || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };
const short = (e) => String((e && e.message) || e || 'unknown error').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
const hash = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

// A time from the API: seconds since 1970 (timeformat=unixtime) or an ISO text without a zone, which is UTC because timezone=GMT.
function timeMs(t) {
  if (typeof t === 'number' && Number.isFinite(t)) return t < 1e11 ? t * 1000 : t;
  if (typeof t === 'string' && t) {
    if (/^\d{9,13}$/.test(t)) return timeMs(Number(t));
    const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z');
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/* ---------- the words (English and Greek), one note per variable. A note is cut at 400 characters by the registry, so they stay short. ---------- */

const WHERE = {
  en: 'model grid cell around the city centre (the model cells are about 11 to 45 km wide)',
  el: 'κελί πλέγματος μοντέλου γύρω από το κέντρο της πόλης (τα κελιά του μοντέλου είναι περίπου 11 έως 45 km πλάτος)',
};

function hazeLevel(v) {
  if (v < 0.15) return { en: 'A clear sky.', el: 'Καθαρός ουρανός.' };
  if (v < 0.4) return { en: 'A little haze.', el: 'Λίγη θολούρα.' };
  return { en: 'A hazy sky: Saharan dust, smoke or sea salt can cause this; compare the dust and PM10 values.', el: 'Θολός ουρανός: μπορεί να φταίει σκόνη από τη Σαχάρα, καπνός ή αλάτι· σύγκρινε τις τιμές σκόνης και PM10.' };
}

const NOTES = {
  aerosol_optical_depth: (v) => {
    const l = hazeLevel(v);
    return {
      en: `${l.en} Haze is how much sunlight the particles in the whole air column above the city block out: usually 0.1 to 0.3, often above 0.5 on dust days. A computer model gives this number; satellite haze data (MODIS) feed the model, so it is not a satellite pixel and not a sensor at your school.`,
      el: `${l.el} Η θολούρα δείχνει πόσο φως του ήλιου εμποδίζουν τα σωματίδια σε όλη τη στήλη αέρα: συνήθως 0,1 έως 0,3, συχνά πάνω από 0,5 τις μέρες με σκόνη. Την τιμή τη δίνει μοντέλο· δορυφορικά δεδομένα (MODIS) τροφοδοτούν το μοντέλο, άρα δεν είναι εικονοστοιχείο δορυφόρου ούτε αισθητήρας στο σχολείο σου.`,
    };
  },
  uv_index: () => ({
    en: 'UV index for this hour from the CAMS model (it counts clouds). UV depends on the height of the sun, on clouds and on the thickness of the ozone layer, which satellites measure. 0 at night; 11 or more is the top of the scale. It is not a UV sensor at your school: shade changes what you get.',
    el: 'Δείκτης UV για αυτή την ώρα από το μοντέλο CAMS (υπολογίζει τα σύννεφα). Το UV εξαρτάται από το ύψος του ήλιου, από τα σύννεφα και από το πάχος του στρώματος όζοντος, που το μετρούν δορυφόροι. 0 τη νύχτα· 11 και πάνω είναι η κορυφή της κλίμακας. Δεν είναι αισθητήρας UV στο σχολείο σου: η σκιά αλλάζει αυτό που παίρνεις.',
  }),
  nitrogen_dioxide: () => ({
    en: 'Nitrogen dioxide near the ground, estimated by a model for a grid cell much bigger than a street. It comes mostly from traffic and power stations, so a busy road will read higher than this. Satellites (Sentinel-5P) see NO2 in the whole air column and help to check models like this one; this value is the model\'s own.',
    el: 'Διοξείδιο του αζώτου κοντά στο έδαφος, εκτίμηση μοντέλου για κελί πλέγματος πολύ μεγαλύτερο από έναν δρόμο. Προέρχεται κυρίως από την κυκλοφορία και τους σταθμούς ηλεκτροπαραγωγής, οπότε ένας πολυσύχναστος δρόμος θα δείχνει περισσότερο. Οι δορυφόροι (Sentinel-5P) βλέπουν το NO2 σε όλη τη στήλη αέρα και βοηθούν να ελέγχονται τέτοια μοντέλα· η τιμή εδώ είναι του μοντέλου.',
  }),
  sulphur_dioxide: () => ({
    en: 'Sulphur dioxide near the ground, estimated by a model. It comes from burning fuels that contain sulphur (power stations, ships, industry) and from volcanoes, and it is usually small. Satellites can see big plumes high in the air, but this value is the model\'s estimate for a grid cell, not a measurement.',
    el: 'Διοξείδιο του θείου κοντά στο έδαφος, εκτίμηση μοντέλου. Προέρχεται από καύση καυσίμων με θείο (σταθμοί ηλεκτροπαραγωγής, πλοία, βιομηχανία) και από ηφαίστεια, και συνήθως είναι μικρό. Οι δορυφόροι βλέπουν μεγάλα σύννεφα ψηλά στον αέρα, αλλά αυτή η τιμή είναι εκτίμηση του μοντέλου για ένα κελί πλέγματος, όχι μέτρηση.',
  }),
  carbon_monoxide: () => ({
    en: 'Carbon monoxide near the ground, estimated by a model. It comes from burning that lacks air: traffic, wood fires and wildfires. Satellites (MOPITT, IASI) see CO high in the air and the model is corrected with them, but this near-ground value is the model\'s estimate for a grid cell, not a measurement.',
    el: 'Μονοξείδιο του άνθρακα κοντά στο έδαφος, εκτίμηση μοντέλου. Προέρχεται από καύση με λίγο αέρα: κυκλοφορία, φωτιές με ξύλα και πυρκαγιές. Οι δορυφόροι (MOPITT, IASI) βλέπουν το CO ψηλά στον αέρα και το μοντέλο διορθώνεται με αυτούς, αλλά αυτή η τιμή κοντά στο έδαφος είναι εκτίμηση του μοντέλου για ένα κελί πλέγματος, όχι μέτρηση.',
  }),
};

/* ---------- parsing the answer ---------- */

// For every variable of one place: { v, t } for the newest hour that is not in the future (looking back a few hours when it is empty).
function pickNow(place, nowMs, dropped) {
  const h = place && place.hourly;
  const out = {};
  if (!h || !Array.isArray(h.time)) return out;
  const times = h.time.map(timeMs);
  let last = -1;
  for (let i = 0; i < times.length; i++) if (times[i] != null && times[i] <= nowMs && (last < 0 || times[i] > times[last])) last = i;
  if (last < 0) return out;
  for (const variable of VARS) {
    const arr = h[variable];
    if (!Array.isArray(arr)) continue;
    const unit = place.hourly_units && typeof place.hourly_units[variable] === 'string' ? place.hourly_units[variable].trim() : null;
    if (unit != null && !API_UNIT[variable].test(unit)) { if (dropped) dropped.add(variable); continue; }   // a different unit: the number cannot be used
    for (let back = 0; back <= LOOK_BACK_H; back++) {
      const i = last - back;
      if (i < 0 || times[i] == null || times[i] > nowMs || times[i] < times[last] - LOOK_BACK_H * HOUR) break;
      const v = num(arr[i]);
      if (v != null && v >= 0) { out[variable] = { v: round(v, DECIMALS[variable]), t: times[i] }; break; }
    }
  }
  return out;
}

// The answer (an object for one place, a list for several) -> { cityId: { variable: { v, t } } }. `ids` is the order of the places in the request.
function parseAnswer(json, ids, nowMs, dropped) {
  const list = Array.isArray(json) ? json : json && typeof json === 'object' ? [json] : null;
  if (!list) throw new Error('the answer is not a place or a list of places');
  if (list.length !== ids.length) throw new Error(`the answer holds ${list.length} places, ${ids.length} were asked for`);
  const out = {};
  ids.forEach((id, i) => { const p = pickNow(list[i], nowMs, dropped); if (Object.keys(p).length) out[id] = p; });
  return out;
}

const mergeCities = (a, b) => { const out = { ...a }; for (const [id, vars] of Object.entries(b || {})) out[id] = { ...(out[id] || {}), ...vars }; return out; };

module.exports = function create(ctx) {
  const ids = Object.keys(ctx.places);
  const file = path.join(ctx.dir, 'latest.json');
  let state = { at: null, cities: {} };     // the last good answer: { at: fetch time, cities: { id: { variable: { v, t } } } }
  let timer = null, inflight = null, stopped = false, tried = false, fails = 0, lastError = null, retryAfterMs = 0;

  /* ----- the disk cache ----- */
  function load() {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (j && typeof j === 'object' && j.cities && typeof j.cities === 'object') {
        const cities = {};
        for (const id of ids) {
          const c = j.cities[id];
          if (!c || typeof c !== 'object') continue;
          for (const variable of VARS) { const x = c[variable]; if (x && num(x.v) != null && num(x.t) != null) (cities[id] = cities[id] || {})[variable] = { v: Number(x.v), t: Number(x.t) }; }
        }
        state = { at: num(j.at), cities };
      }
    } catch (e) { /* no cache yet, or an unreadable one: start empty */ }
  }
  function save() {
    try {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, file);
    } catch (e) { ctx.log('could not save the last answer (' + short(e) + ')'); }
  }

  load();   // the last good answer of the previous run is there at once (its times are old, so the page shows it as late)

  /* ----- asking the service ----- */
  const url = (vars) => `${BASE}?latitude=${ids.map((id) => ctx.places[id].lat).join(',')}&longitude=${ids.map((id) => ctx.places[id].lng).join(',')}` +
    `&hourly=${vars.join(',')}&past_days=1&forecast_days=1&timeformat=unixtime&timezone=GMT`;

  async function fetchAll() {
    const now = ctx.now();
    const dropped = new Set();
    let cities;
    try {
      cities = parseAnswer(await ctx.get(url(VARS), { timeoutMs: 20000 }), ids, now, dropped);
    } catch (e) {
      if (!e || e.status !== 400) throw e;
      // a variable name that the service does not know gives HTTP 400: ask for each variable alone and keep the ones that work
      ctx.log('one of the variables was refused (HTTP 400), asking for each one alone');
      cities = {};
      let firstErr = null;
      for (const variable of VARS) {
        try { cities = mergeCities(cities, parseAnswer(await ctx.get(url([variable]), { timeoutMs: 20000 }), ids, now, dropped)); }
        catch (e2) { firstErr = firstErr || e2; ctx.log(`${variable} is not available (${short(e2)})`); }
      }
      if (!Object.keys(cities).length && firstErr) throw firstErr;
    }
    if (dropped.size) ctx.log(`unit not as expected for ${[...dropped].join(', ')}: left out`);
    if (!Object.keys(cities).length) throw new Error('the answer had no usable value');
    return { at: now, cities };
  }

  function refresh() {
    if (inflight) return inflight;
    tried = true;
    inflight = (async () => {
      try {
        state = await fetchAll();
        save();
        if (fails || lastError) ctx.log('answering again');
        fails = 0; lastError = null; retryAfterMs = 0;
      } catch (e) {
        fails++;
        lastError = short(e);
        retryAfterMs = e && Number.isFinite(e.retryAfterSec) ? e.retryAfterSec * 1000 : 0;   // a 429 may say how long to wait
        ctx.log(`not available right now (${lastError})`);
      } finally { inflight = null; }
    })();
    return inflight;
  }

  function schedule(ms) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await refresh();
      schedule(fails ? Math.max(RETRY_MS[Math.min(fails, RETRY_MS.length) - 1], Math.min(retryAfterMs, 6 * HOUR)) : REFRESH_MS);
    }, ms);
    if (timer.unref) timer.unref();
  }

  /* ----- what the rest of the server asks for ----- */
  function readings(cityId) {
    const c = state.cities[cityId];
    if (!c) return [];
    return VARS.filter((v) => c[v]).map((variable) => {
      const n = NOTES[variable](c[variable].v);
      return {
        variable, value: c[variable].v, unit: UNIT[variable], time: c[variable].t,
        where: WHERE.en, whereEl: WHERE.el, note: n.en, noteEl: n.el,
      };
    });
  }

  async function probe() {
    if (!tried && !Object.keys(state.cities).length) await refresh();
    const have = ids.filter((id) => state.cities[id]);
    let newest = 0;
    for (const id of have) for (const x of Object.values(state.cities[id])) newest = Math.max(newest, x.t);
    if (!have.length) return { ok: false, n: 0, at: null, note: 'not available right now', noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή' };
    return {
      ok: true, n: have.length, at: newest || state.at,
      note: `${have.length} of ${ids.length} cities · hourly model values${lastError ? ' · last update failed, showing the previous values' : ''}`,
      noteEl: `${have.length} από ${ids.length} πόλεις · ωριαίες τιμές μοντέλου${lastError ? ' · η τελευταία ενημέρωση απέτυχε, φαίνονται οι προηγούμενες τιμές' : ''}`,
    };
  }

  return {
    id: 'cams-atmosphere',
    hosts: [HOST],
    start() {
      stopped = false;
      schedule(8000 + (hash('cams-atmosphere') % 9000));   // the first answer comes a few seconds after start-up, spread from the other feeds
    },
    stop() { stopped = true; clearTimeout(timer); timer = null; },
    probe,
    read: (cityId) => readings(cityId),
    _t: { parseAnswer, pickNow, url, NOTES, hazeLevel, timeMs, refresh, load, state: () => state },
  };
};
module.exports._t = { parseAnswer, pickNow, NOTES, hazeLevel, timeMs, VARS, UNIT, API_UNIT, WHERE };
