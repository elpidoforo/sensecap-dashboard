'use strict';
/* satellite/sun/openmeteo.js: reading the Open-Meteo "Satellite Radiation API" for the two feeds
 * openmeteo-satellite-solar (the latest hour) and openmeteo-satellite-solar-day (the last full day).
 *
 * What is documented (https://open-meteo.com/en/docs/satellite-radiation-api, read 2026-11-12):
 *   host   satellite-api.open-meteo.com, path /v1/archive, hourly=shortwave_radiation,... models=satellite_radiation_seamless, past_days, forecast_days
 *   units  W/m2. "Solar radiation is averaged over the past hour": the value stamped T is the mean of the hour BEFORE T.
 *   data   over Europe and Africa the "seamless" model uses the DWD product made from the EUMETSAT MTG imager (about 2.5 km, a new scan every 10 min,
 *          about 20 min late). shortwave_radiation_clear_sky exists for that product only.
 * What is NOT verified (the sandbox cannot reach the service): the exact JSON of a real answer, how night hours are written (0 or null), and whether
 * the clear-sky column is filled for Cyprus. This file therefore accepts both 0 and null at night, treats a null in daylight as a real gap, and
 * works without the clear-sky column.
 *
 * Pure parsing is in cleanLocation / latestHour / lastFullDay (tested with fixtures in scratchpad/gh/tests/sat-sun/). fetchAll is the only part that
 * uses ctx.get.
 */
const { num, round, HOUR, DAY, isNight, dayStart, ymd, km, topOfAtmosphereKwh } = require('./common');

const HOST = 'satellite-api.open-meteo.com';
const MODEL = 'satellite_radiation_seamless';
const PAST_DAYS = 3;
const MAX_WM2 = 1400;     // the same upper bound as vocab/variables.json for solar_irradiance
const MAX_KWH = 12;       // vocab bound for a whole day
const LOOKBACK = 12 * HOUR;   // an hour older than this is not "the latest hour"

function buildUrl(cities, withClearSky) {
  const vars = withClearSky ? 'shortwave_radiation,shortwave_radiation_clear_sky' : 'shortwave_radiation';
  return `https://${HOST}/v1/archive?latitude=${cities.map((c) => c.lat.toFixed(4)).join(',')}&longitude=${cities.map((c) => c.lng.toFixed(4)).join(',')}` +
    `&hourly=${vars}&models=${MODEL}&past_days=${PAST_DAYS}&forecast_days=1&timeformat=unixtime`;
}

const toMs = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? (v < 1e11 ? v * 1000 : v) : null;
  if (typeof v !== 'string') return null;
  const s = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) ? v + 'Z' : v;   // no zone in the text: the API's default zone is GMT
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
};

// A value of the radiation series: a number from 0 to MAX_WM2, else null. A hair below zero (-0.2) is 0; anything else negative is not sunlight.
const cleanValue = (v) => {
  const x = num(v);
  if (x == null) return null;
  if (x < 0) return x > -1 ? 0 : null;
  return x > MAX_WM2 ? null : x;
};

/* One location of the answer -> { times (ms, hour-ENDING stamps), sw, cs|null, cellLat, cellLng } or { why } when it cannot be used. */
function cleanLocation(loc) {
  const h = loc && typeof loc === 'object' ? loc.hourly : null;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.shortwave_radiation)) return { why: 'no hourly shortwave_radiation in the answer' };
  const unit = loc.hourly_units && loc.hourly_units.shortwave_radiation;
  if (unit != null && !/^w\s*\/\s*m(2|²)$/i.test(String(unit).trim())) return { why: `shortwave_radiation is in "${String(unit).replace(/[^\w/² .%-]/g, '').slice(0, 20)}", not W/m2` };
  const times = h.time.map(toMs);
  if (times.length < 2 || times.length > 400 || times.some((t) => t == null)) return { why: 'the time list is empty, too long or not readable' };
  for (let i = 1; i < times.length; i++) if (times[i] <= times[i - 1]) return { why: 'the time list is not in order' };
  if (h.shortwave_radiation.length !== times.length) return { why: 'the value list and the time list differ in length' };
  const sw = h.shortwave_radiation.map(cleanValue);
  const cs = Array.isArray(h.shortwave_radiation_clear_sky) && h.shortwave_radiation_clear_sky.length === times.length ? h.shortwave_radiation_clear_sky.map(cleanValue) : null;
  return { times, sw, cs, cellLat: num(loc.latitude), cellLng: num(loc.longitude) };
}

/* The latest hour that has ended. Night hours count as 0 whether the service writes 0 or null for them. A null in daylight is a gap: look further back.
   Hours stamped after "now" are forecast slots (or a wrong clock): never used. */
function latestHour(c, now, place) {
  if (!c || !c.times) return null;
  for (let i = c.times.length - 1; i >= 0; i--) {
    const T = c.times[i];
    if (T > now + 60000) continue;      // the future
    if (now - T > LOOKBACK) return null;
    const v = c.sw[i];
    if (v != null) return { value: v, time: T, night: isNight(T, place.lat, place.lng) && v === 0 };
    if (isNight(T, place.lat, place.lng)) return { value: 0, time: T, night: true };
  }
  return null;
}

// The energy of one UTC day in Wh/m2, or null when an hour of daylight is missing. A UTC day holds all the sunshine of the Cyprus calendar day
// (the sun is up between about 03:00 and 17:00 UTC all year), so the two are the same day.
function daySum(c, idx, series, dayMs, place) {
  let sum = 0, positive = 0;
  for (let h = 0; h < 24; h++) {
    const T = dayMs + (h + 1) * HOUR;
    const i = idx.get(T);
    const v = i == null ? null : series[i];
    if (v == null) { if (isNight(T, place.lat, place.lng)) continue; return null; }
    sum += v;
    if (v > 0) positive++;
  }
  return { wh: sum, positive };
}

/* The newest complete UTC day (it must have ended) whose daylight hours are all present:
   { date, endMs, kwh, clearKwh|null, share|null } (kWh/m2, share in %), or null. */
function lastFullDay(c, now, place) {
  if (!c || !c.times) return null;
  const idx = new Map(c.times.map((t, i) => [t, i]));
  const days = [...new Set(c.times.map((t) => dayStart(t - HOUR)))].sort((a, b) => b - a);
  for (const d of days) {
    if (d + DAY > now) continue;                       // today, or later: not complete
    if (now - (d + DAY) > 6 * DAY) break;
    const all = daySum(c, idx, c.sw, d, place);
    if (!all || all.positive < 3 || all.wh < 50) continue;
    const kwh = all.wh / 1000;
    if (kwh > MAX_KWH || kwh > topOfAtmosphereKwh(place.lat, d) * 1.05) continue;   // more than the top of the atmosphere gets: not believable
    let clearKwh = null, share = null;
    if (c.cs) {
      const clear = daySum(c, idx, c.cs, d, place);
      if (clear && clear.positive >= 3 && clear.wh >= 500) {
        clearKwh = clear.wh / 1000;
        const s = (kwh / clearKwh) * 100;
        if (s >= 0 && s <= 130) share = round(s, 1);
      }
    }
    return { date: ymd(d), endMs: d + DAY, kwh: round(kwh, 2), clearKwh: clearKwh == null ? null : round(clearKwh, 2), share };
  }
  return null;
}

const shortReason = (b) => String((b && (b.reason || b.error)) || 'unknown').replace(/[^\w ,.:'()/-]/g, '').slice(0, 100);

/* Asks for all cities at once (one request, an array comes back). When the answer is not a list of the right length, asks city by city.
   Returns { byCity: { id: cleaned }, clearSky: bool, problems: [short reasons] }. Throws (a short message) when nothing usable came back. */
async function fetchAll(ctx, cities, opt) {
  const pause = (opt && opt.pauseMs != null) ? opt.pauseMs : 400;
  let clear = true;
  const ask = async (list) => {
    let body;
    try { body = await ctx.get(buildUrl(list, clear), { as: 'json' }); }
    catch (e) {
      if (clear && e && e.status === 400) { clear = false; ctx.log('the clear-sky column was refused (HTTP 400): asking again without it'); body = await ctx.get(buildUrl(list, false), { as: 'json' }); }
      else throw e;
    }
    if (body && !Array.isArray(body) && body.error) throw new Error('Open-Meteo says: ' + shortReason(body));
    return Array.isArray(body) ? body : [body];
  };
  const byCity = {}, problems = [];
  const take = (list, locs) => {
    list.forEach((city, i) => {
      const r = cleanLocation(locs[i]);
      if (r.why) { problems.push(`${city.id}: ${r.why}`); return; }
      byCity[city.id] = r;
    });
  };
  const locs = await ask(cities);
  if (locs.length === cities.length) take(cities, locs);
  else {
    problems.push(`asked for ${cities.length} places, got ${locs.length}: asking one by one`);
    for (const city of cities) {
      try { take([city], await ask([city])); } catch (e) { problems.push(`${city.id}: ${String(e.message).slice(0, 80)}`); if (e && e.status === 429) throw e; }
      if (pause) await new Promise((r) => { const t = setTimeout(r, pause); if (t.unref) t.unref(); });
    }
  }
  if (!Object.keys(byCity).length) throw new Error('no usable answer (' + (problems[0] || 'empty') + ')');
  return { byCity, clearSky: clear, problems };
}

// How far the grid cell Open-Meteo used is from the city centre (km), or null when the answer did not say or it is far.
const cellKm = (c, place) => (c && c.cellLat != null && c.cellLng != null ? (() => { const d = km([place.lat, place.lng], [c.cellLat, c.cellLng]); return d <= 30 ? round(d, 1) : null; })() : null);

module.exports = { HOST, MODEL, PAST_DAYS, MAX_WM2, buildUrl, toMs, cleanValue, cleanLocation, latestHour, lastFullDay, fetchAll, cellKm };
