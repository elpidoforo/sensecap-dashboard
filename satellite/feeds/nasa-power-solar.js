'use strict';
/* nasa-power-solar: NASA POWER daily sunshine energy and cloud amount per city (a 1 x 1 degree grid, the newest day is about a week old).
 * Variables: solar_energy_day_nasa (kWh/m2/day) and cloud_amount_nasa (%). Parameters asked: ALLSKY_SFC_SW_DWN, CLRSKY_SFC_SW_DWN, ALLSKY_KT, CLOUD_AMT.
 * Descriptor: sources/nasa-power-solar.json. Shared code: satellite/sun/power.js (what is documented, what is not verified), satellite/sun/common.js.
 * Gentle on NASA: one request per city, one after another, once a day; a restart within 12 hours of the last good answer asks nothing.
 * Why the variable ids end in _nasa: this value is for a day about a week back and a 100 km square, the Open-Meteo feeds give yesterday at 2.5 km.
 * The brain must not compare them as if they were the same thing.
 */
const path = require('path');
const C = require('../sun/common');
const PW = require('../sun/power');

const ID = 'nasa-power-solar';
const EVERY = 20 * C.HOUR;
const STALE = 10 * C.DAY;   // the same as quality.stale_after in the descriptor

const PANEL_EN = 'For solar panels: this is light that arrives, not the electricity a panel makes (size, angle, dirt, heat and efficiency matter too).';
const PANEL_EL = 'Για τα ηλιακά πάνελ: είναι φως που φτάνει, όχι ρεύμα που παράγεται (μετράνε και το μέγεθος, η γωνία, η βρωμιά, η ζέστη, η απόδοση).';

function create(ctx, opts) {
  const o = opts || {};
  const cities = Object.entries(ctx.places || {}).filter(([k]) => k[0] !== '_')
    .map(([id, p]) => ({ id, lat: Number(p.lat), lng: Number(p.lng) })).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
  const byId = Object.fromEntries(cities.map((c) => [c.id, c]));
  const file = path.join(ctx.dir, 'last.json');

  let state = { fetchedAt: 0, cities: {} };
  const saved = C.readJson(file);
  if (saved && saved.cities && typeof saved.cities === 'object') {
    for (const [id, c] of Object.entries(saved.cities)) if (byId[id] && c && Array.isArray(c.days) && c.days.every((d) => d && Number.isFinite(d.endMs) && Number.isFinite(d.kwh))) state.cities[id] = c;
    state.fetchedAt = Number(saved.fetchedAt) || 0;
  }
  let tried = false, loggedFirst = false;

  async function refresh() {
    tried = true;
    const r = await PW.fetchAll(ctx, cities, { pauseMs: o.pauseMs });
    const got = Object.keys(r.byCity);
    for (const p of r.problems) ctx.log(`one city was skipped (${p})`);
    if (!got.length) { ctx.log(`no city answered (${r.problems[0] || 'empty'})`); return false; }
    state = { fetchedAt: ctx.now(), cities: { ...state.cities, ...r.byCity } };
    C.writeJson(file, state);
    if (!loggedFirst) {   // the line to look for after the first deploy: it shows what the real service sent
      loggedFirst = true;
      const any = r.byCity[got[0]], newest = any.days[any.days.length - 1];
      ctx.log(`first answer: ${got.length} of ${cities.length} cities, newest day ${newest.date}, ALLSKY unit "${any.unit}" (from ${any.unitFrom}), API version ${any.version || 'not given'}`);
    }
    return true;
  }

  // A restart soon after a good answer does not ask again: the first request waits until the answer is EVERY old.
  const age = ctx.now() - state.fetchedAt;
  const runner = C.makeRunner({ log: ctx.log, firstMs: state.fetchedAt && age >= 0 && age < 12 * C.HOUR ? Math.max(25000, EVERY - age) : 25000, everyMs: EVERY, backoffMs: [2 * C.HOUR, 4 * C.HOUR, 6 * C.HOUR], work: refresh });

  const latest = (cityId) => (state.cities[cityId] ? PW.latestDay(state.cities[cityId], ctx.now()) : null);

  function probe() {
    let n = 0, at = 0;
    for (const city of cities) { const d = latest(city.id); if (d) { n++; at = Math.max(at, d.endMs); } }
    if (!n) {
      return tried
        ? { ok: false, n: 0, at: null, note: 'not available right now', noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή' }
        : { ok: false, n: 0, at: null, note: 'waiting for the first answer', noteEl: 'αναμονή για την πρώτη απάντηση' };
    }
    const day = C.ymd(at - C.DAY), old = ctx.now() - at > STALE;
    return {
      ok: true, n, at,
      note: old ? 'showing old values: NASA has not answered lately' : `${n} of ${cities.length} cities, newest day ${C.dayText(day, false)}`,
      noteEl: old ? 'δείχνει παλιές τιμές: η NASA δεν απάντησε πρόσφατα' : `${n} από ${cities.length} πόλεις, νεότερη μέρα ${C.dayText(day, true)}`,
    };
  }

  function read(cityId) {
    const d = latest(cityId);
    if (!d) return [];
    const where = 'NASA grid cell about 1° wide (about 100 km) around the city centre';
    const whereEl = 'κελί πλέγματος της NASA περίπου 1° (περίπου 100 χλμ.) γύρω από το κέντρο της πόλης';
    const en = C.dayText(d.date, false), el = C.dayText(d.date, true);
    const out = [{
      variable: 'solar_energy_day_nasa', value: d.kwh, unit: 'kW.h/m2/d', time: d.endMs, where, whereEl,
      note: `Sunshine energy that reached level ground on ${en}, from NASA POWER: worked out from satellite cloud data, on a grid about 100 km wide (nearby cities can share a value). NASA's newest day is about a week old. ${PANEL_EN}`,
      noteEl: `Ενέργεια ήλιου που έφτασε σε οριζόντιο έδαφος στις ${el}, από το NASA POWER: υπολογισμός από δορυφορικά δεδομένα νεφών, σε πλέγμα ~100 χλμ. (γειτονικές πόλεις μπορεί να έχουν ίδια τιμή). Η νεότερη μέρα είναι ~1 εβδομάδα παλιά. ${PANEL_EL}`,
    }];
    if (d.cloud != null) {
      const kt = d.kt == null ? '' : ` Clearness index ${C.numText(d.kt, 2, false)}: the share of the sunlight above the atmosphere that reached the ground.`;
      const ktEl = d.kt == null ? '' : ` Δείκτης διαύγειας ${C.numText(d.kt, 2, true)}: το μέρος του φωτός πάνω από την ατμόσφαιρα που έφτασε στο έδαφος.`;
      const clr = d.clearKwh == null ? '' : ` A cloud-free day would have given ${C.numText(d.clearKwh, 1, false)} kWh/m2.`;
      const clrEl = d.clearKwh == null ? '' : ` Μια μέρα χωρίς σύννεφα θα έδινε ${C.numText(d.clearKwh, 1, true)} kWh/m².`;
      out.push({
        variable: 'cloud_amount_nasa', value: d.cloud, unit: '%', time: d.endMs, where, whereEl,
        note: `Average cloud amount on ${en}: the share of the sky covered by cloud, from NASA POWER (satellite-based), for a square about 100 km wide.${kt}${clr}`,
        noteEl: `Μέση νέφωση στις ${el}: το μέρος του ουρανού που καλύπτουν τα σύννεφα, από το NASA POWER (δορυφορικά δεδομένα), για τετράγωνο περίπου 100 χλμ.${ktEl}${clrEl}`,
      });
    }
    return out;
  }

  return { id: ID, hosts: [PW.HOST], start: () => runner.start(), stop: () => runner.stop(), probe, read, _refresh: refresh, _runner: runner };
}

module.exports = create;
module.exports.ID = ID;
