'use strict';
/* satellite/lib/erddap.js: small, pure helpers for reading a few pixels from an ERDDAP "griddap" server (NOAA CoastWatch).
 * No network here: the feed calls ctx.get(url) and hands the parsed JSON to these functions, so every part can be tested with fixtures.
 *
 * What an ERDDAP griddap request looks like (docs: https://coastwatch.pfeg.noaa.gov/erddap/griddap/documentation.html):
 *   https://<host>/erddap/griddap/<datasetID>.json?<variable>[<time>][<altitude>][<lat>][<lon>],<variable2>[...]...
 *   - one [start:stride:stop] per dimension, in the dataset's own dimension order; `(value)` means "the nearest dimension value",
 *     `last` / `last-n` are indices counted from the end, `(last)` is the last value. Brackets must be percent-encoded for Tomcat.
 *   - if latitude is stored from high to low, ERDDAP swaps a [(low):(high)] pair itself (stated in the griddap documentation).
 *   - .json answers { table: { columnNames, columnTypes, columnUnits, rows } }, one row per grid cell, times as ISO 8601 strings,
 *     missing values as null.
 * A satellite pixel is an AREA. Nothing in here turns a pixel into a point measurement.
 */

const R_EARTH = 6371;
const rad = Math.PI / 180;

function kmBetween(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Values the providers use for "no data" (packed fill values that sometimes leak through, and ERDDAP's own). Compared with a tiny tolerance.
const FILL_VALUES = [-9.99, -7.768, -327.68, -999, -9999, -32767, -32768, -1.28, 9.96921e36];
const isFill = (v) => FILL_VALUES.some((f) => Math.abs(v - f) <= Math.max(1e-6, Math.abs(f) * 1e-6));

// A number, or null for null / NaN / "" / "NaN" / a fill value / anything that is not a finite number.
function cleanNumber(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/.test(v) ? Number(v) : NaN);
  if (!Number.isFinite(n) || isFill(n)) return null;
  return n;
}

// Sea temperature in degrees Celsius from whatever the file says: degree_C, Kelvin by its unit, or a Kelvin-looking number with a wrong unit.
// null when the result is not a possible sea temperature (-3 to 45 C).
function toCelsius(value, unit) {
  const v = cleanNumber(value);
  if (v == null) return null;
  const u = String(unit == null ? '' : unit).trim().toLowerCase();
  let c = v;
  if (/^(k|kelvin|degk|deg_k|degrees_k|degrees kelvin)$/.test(u)) c = v - 273.15;
  else if (v > 200 && v < 340) c = v - 273.15;   // a Kelvin value under a Celsius label (or no label): no sea is 200 C
  return c >= -3 && c <= 45 ? Math.round(c * 1000) / 1000 : null;
}

const enc = (s) => encodeURIComponent(s);
const deg = (x) => String(Math.round(x * 10000) / 10000);

// griddap URL for a small box. `pre` = the constraints before latitude/longitude, e.g. ['(last)'] or ['last-6:last', '0'].
// `latDesc: true` writes the latitude pair high:low (for a dataset that stores latitude from north to south).
function griddapUrl(o) {
  const la = o.latDesc ? [o.lat[1], o.lat[0]] : o.lat;
  const lat = `[(${deg(la[0])}):(${deg(la[1])})]`, lng = `[(${deg(o.lng[0])}):(${deg(o.lng[1])})]`;
  const pre = (o.pre || []).map((c) => `[${c}]`).join('');
  const q = o.vars.map((v) => `${v}${pre}${lat}${lng}`).join(',');
  return `https://${o.host}/erddap/griddap/${o.dataset}.json?${enc(q)}`;
}

// Asks for a box. The latitude pair is written in the order the dataset is believed to use (`state.latDesc`); the griddap documentation says
// ERDDAP swaps a wrong order itself, but if the server answers 400/404/416 anyway the other order is tried once and remembered in `state`.
async function getBox(get, spec, state) {
  const st = state || {};
  const ask = (latDesc) => get(griddapUrl({ ...spec, latDesc }));
  try { return await ask(!!st.latDesc); }
  catch (err) {
    if (!err || ![400, 404, 416].includes(err.status)) throw err;
    const json = await ask(!st.latDesc);
    st.latDesc = !st.latDesc;
    return json;
  }
}

// The box around a point: half sizes in degrees.
const boxAround = (lat, lng, halfLat, halfLng) => ({ lat: [lat - halfLat, lat + halfLat], lng: [lng - halfLng, lng + halfLng] });

// ERDDAP .json -> { cells: [{ t (ms), lat, lng, v: { column: number|null } }], units: { column: unit } }
// `want` = the data column names. Throws a short plain message when the answer is not an ERDDAP table.
function parseGrid(json, want) {
  const t = json && typeof json === 'object' ? json.table : null;
  if (!t || !Array.isArray(t.columnNames) || !Array.isArray(t.rows)) throw new Error('the answer is not an ERDDAP table');
  const names = t.columnNames.map(String);
  const ix = (n) => names.indexOf(n);
  const iT = ix('time'), iLat = ix('latitude'), iLng = ix('longitude');
  if (iT < 0 || iLat < 0 || iLng < 0) throw new Error('the table has no time/latitude/longitude columns');
  const cols = (want || []).map((n) => [n, ix(n)]).filter(([, i]) => i >= 0);
  if (!cols.length) throw new Error('the table has none of the expected data columns');
  const units = {};
  names.forEach((n, i) => { units[n] = Array.isArray(t.columnUnits) ? t.columnUnits[i] : undefined; });
  const cells = [];
  for (const r of t.rows) {
    if (!Array.isArray(r)) continue;
    const ms = Date.parse(r[iT]), lat = Number(r[iLat]), lng = Number(r[iLng]);
    if (!Number.isFinite(ms) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const v = {};
    for (const [n, i] of cols) v[n] = r[i];
    cells.push({ t: ms, lat, lng, v });
  }
  return { cells, units };
}

// The nearest cell (to lat/lng) that `ok(cell)` accepts and that is within maxKm. null when there is none.
function nearestCell(cells, lat, lng, maxKm, ok) {
  let best = null;
  for (const c of cells) {
    if (ok && !ok(c)) continue;
    const d = kmBetween(lat, lng, c.lat, c.lng);
    if (d <= maxKm && (!best || d < best.km)) best = { cell: c, km: d };
  }
  return best;
}

// One request at a time for everything in this process that talks to an ERDDAP server (its documentation asks users to be kind:
// "run just one script or curl command at a time"). Feeds queue their requests here.
let tail = Promise.resolve();
function serial(fn) {
  const run = tail.then(() => fn());
  tail = run.then(() => undefined, () => undefined);
  return run;
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
// 2.4 / 7 / 12 (one decimal below 10, whole numbers above): for distances and for small numbers in the texts
const kmText = (km) => (km < 10 ? String(Math.round(km * 10) / 10) : String(Math.round(km)));
const numText = kmText;

module.exports = { kmBetween, FILL_VALUES, isFill, cleanNumber, toCelsius, griddapUrl, getBox, boxAround, parseGrid, nearestCell, serial, isoDay, kmText, numText };
