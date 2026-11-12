'use strict';
/* satellite/sun/power.js: reading NASA POWER daily point data for the feed nasa-power-solar.
 *
 * What is documented (power.larc.nasa.gov/docs/services/api/ and /docs/tutorials/service-data-request/api/, read 2026-11-12):
 *   host   power.larc.nasa.gov, path /api/temporal/daily/point, parameters= (up to 20 for daily), community=RE, latitude, longitude, start, end (YYYYMMDD),
 *          format=JSON. No key. Please no more than five requests at once; repeated requests for the same place may be blocked.
 *   data   solar: CERES SYN1deg (to about 3-4 months ago) then CERES FLASHFlux (to within about 5-7 days of today), a global 1 x 1 degree grid.
 *          These are computed fluxes: satellite cloud observations feed a radiation model, with weather inputs from NASA's GEOS reanalysis system.
 *   licence CC BY 4.0, no restrictions on use, please cite POWER (registry.opendata.aws/nasa-power, power.larc.nasa.gov/docs/referencing/).
 * What is NOT verified (the sandbox cannot reach the service): the exact JSON of a real answer (the usual shape is used: properties.parameter.NAME.YYYYMMDD,
 * header.fill_value, and a parameters block with units), the units POWER reports for community RE (kW-hr/m^2/day is expected), and that CLOUD_AMT is
 * served for community RE. So: the unit is READ from the answer; if the answer has none, the unit is worked out from ALLSKY_KT and the top-of-atmosphere
 * energy; if that fails too, the value is dropped. Fill values (-999) and any negative number are "no data".
 */
const { num, round, DAY, ymd, topOfAtmosphereKwh } = require('./common');

const HOST = 'power.larc.nasa.gov';
const PARAMS_ALL = ['ALLSKY_SFC_SW_DWN', 'CLRSKY_SFC_SW_DWN', 'ALLSKY_KT', 'CLOUD_AMT'];
const WINDOW_DAYS = 14;
const MAX_KWH = 12;

const compact = (ms) => ymd(ms).replace(/-/g, '');

function buildUrl(place, nowMs, params) {
  const end = compact(nowMs - DAY), start = compact(nowMs - WINDOW_DAYS * DAY);   // up to yesterday (UTC): never a day that has not happened
  return `https://${HOST}/api/temporal/daily/point?parameters=${(params || PARAMS_ALL).join(',')}&community=RE&latitude=${place.lat.toFixed(4)}&longitude=${place.lng.toFixed(4)}` +
    `&start=${start}&end=${end}&format=JSON`;
}

/* 'kW-hr/m^2/day', 'kWh/m2/day', 'kW.h/m2/d' -> 1;  'MJ/m^2/day' -> 1/3.6;  'Wh/m^2/day' -> 0.001;  anything else -> null (never guessed). */
function energyFactor(unit) {
  if (typeof unit !== 'string') return null;
  const s = unit.toLowerCase().replace(/[\s^_*]/g, '').replace(/[-·.]/g, '').replace(/²/g, '2');
  if (/^(kwhr|kwh)\/m2\/(day|d)$/.test(s)) return 1;
  if (/^mj\/m2\/(day|d)$/.test(s)) return 1 / 3.6;
  if (/^(whr|wh)\/m2\/(day|d)$/.test(s)) return 0.001;
  return null;
}

// Where POWER puts the unit of a parameter (the usual place first).
function unitOf(body, name) {
  for (const holder of [body && body.parameters, body && body.header && body.header.parameters, body && body.properties && body.properties.parameters]) {
    const u = holder && holder[name] && holder[name].units;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

// No unit in the answer: the clearness index is ALLSKY divided by the top-of-atmosphere energy, so ALLSKY / KT must be that energy in the answer's unit.
function factorFromKt(allsky, kt, h0) {
  if (!(kt > 0.05) || !(allsky >= 0) || !(h0 > 0)) return null;
  const implied = allsky / kt;
  if (Math.abs(implied / h0 - 1) < 0.2) return 1;               // kWh/m2/day
  if (Math.abs(implied / (3.6 * h0) - 1) < 0.2) return 1 / 3.6;   // MJ/m2/day
  return null;
}

const safeText = (s) => String(s == null ? '' : s).replace(/[^\w ./^%-]/g, '').slice(0, 30);

/* One POWER answer -> { days: [{ date, endMs, kwh, clearKwh|null, cloud|null, kt|null }] (oldest first), unit, unitFrom, version } or { why }. */
function cleanResponse(body, place) {
  const par = body && body.properties && body.properties.parameter;
  if (!par || typeof par !== 'object' || !par.ALLSKY_SFC_SW_DWN || typeof par.ALLSKY_SFC_SW_DWN !== 'object') return { why: 'no ALLSKY_SFC_SW_DWN in the answer' };
  const fill = num(body.header && body.header.fill_value);
  const val = (name, date) => {
    const x = par[name] && num(par[name][date]);
    if (x == null || x < 0 || x <= -900 || (fill != null && x === fill)) return null;   // -999 is "no data"; nothing here can be negative
    return x;
  };
  const dates = Object.keys(par.ALLSKY_SFC_SW_DWN).filter((d) => /^\d{8}$/.test(d)).sort();
  if (!dates.length) return { why: 'no days in the answer' };
  const toMs = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)));

  let unit = unitOf(body, 'ALLSKY_SFC_SW_DWN'), unitFrom = 'answer', factor = energyFactor(unit);
  if (unit && factor == null) return { why: `unit "${safeText(unit)}" is not one this reader knows` };
  if (factor == null) {   // no unit in the answer: work it out from the clearness index, or give up
    for (let i = dates.length - 1; i >= 0 && factor == null; i--) {
      const a = val('ALLSKY_SFC_SW_DWN', dates[i]), kt = val('ALLSKY_KT', dates[i]);
      if (a != null && kt != null) factor = factorFromKt(a, kt, topOfAtmosphereKwh(place.lat, toMs(dates[i])));
    }
    if (factor == null) return { why: 'the answer has no unit and it could not be worked out from the clearness index' };
    unit = factor === 1 ? 'kWh/m2/day (worked out)' : 'MJ/m2/day (worked out)'; unitFrom = 'clearness index';
  }
  const clearUnit = unitOf(body, 'CLRSKY_SFC_SW_DWN');
  const clearFactor = clearUnit ? energyFactor(clearUnit) : factor;   // the clear-sky value is in the same unit as the all-sky one unless it says otherwise
  const cloudUnit = unitOf(body, 'CLOUD_AMT');
  const cloudOk = !cloudUnit || cloudUnit.includes('%');
  const days = [];
  for (const d of dates) {
    const a = val('ALLSKY_SFC_SW_DWN', d);
    if (a == null) continue;
    const kwh = a * factor;
    const startMs = toMs(d);
    if (kwh > MAX_KWH || kwh > topOfAtmosphereKwh(place.lat, startMs) * 1.05) continue;   // more than the top of the atmosphere: not believable
    const c = val('CLRSKY_SFC_SW_DWN', d), cl = val('CLOUD_AMT', d), kt = val('ALLSKY_KT', d);
    days.push({
      date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, endMs: startMs + DAY, kwh: round(kwh, 2),
      clearKwh: c != null && clearFactor != null && c * clearFactor <= MAX_KWH ? round(c * clearFactor, 2) : null,
      cloud: cl != null && cloudOk && cl <= 100 ? round(cl, 0) : null,
      kt: kt != null && kt <= 1.2 ? round(kt, 2) : null,
    });
  }
  if (!days.length) return { why: 'every day was empty (-999) or not believable' };
  const version = body.header && body.header.api && body.header.api.version;
  return { days, unit: safeText(unit), unitFrom, version: version ? safeText(version) : null };
}

// The newest day that has ended.
function latestDay(c, now) {
  if (!c || !Array.isArray(c.days)) return null;
  for (let i = c.days.length - 1; i >= 0; i--) if (c.days[i].endMs <= now) return c.days[i];
  return null;
}

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });

/* One request per city, one after another (NASA asks for at most five at once and warns against repeating the same place).
   A 422 or 400 (a parameter this community does not have) is asked again with the solar value alone. HTTP 429 stops the round. */
async function fetchAll(ctx, cities, opt) {
  const pause = opt && opt.pauseMs != null ? opt.pauseMs : 2500;
  const now = ctx.now();
  const byCity = {}, problems = [];
  let first = true;
  for (const city of cities) {
    if (!first && pause) await sleep(pause);
    first = false;
    let body;
    try {
      try { body = await ctx.get(buildUrl(city, now), { as: 'json' }); }
      catch (e) {
        if (e && (e.status === 422 || e.status === 400)) { ctx.log(`${city.id}: a parameter was refused (HTTP ${e.status}): asking again for the solar value alone`); body = await ctx.get(buildUrl(city, now, ['ALLSKY_SFC_SW_DWN']), { as: 'json' }); }
        else throw e;
      }
    } catch (e) {
      if (e && e.status === 429) throw e;
      problems.push(`${city.id}: ${String((e && e.message) || 'failed').slice(0, 80)}`);
      continue;
    }
    const r = cleanResponse(body, city);
    if (r.why) { problems.push(`${city.id}: ${r.why}`); continue; }
    byCity[city.id] = r;
  }
  return { byCity, problems };
}

module.exports = { HOST, PARAMS_ALL, buildUrl, energyFactor, unitOf, factorFromKt, cleanResponse, latestDay, fetchAll };
