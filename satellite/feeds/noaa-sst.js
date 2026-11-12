'use strict';
/* satellite/feeds/noaa-sst.js: satellite sea surface temperature for the coastal cities (Larnaka, Limassol, Paphos).
 * Lefkosia is inland: it has no sea, so nothing is asked for it and read('lefkosia') is always [].
 *
 * Source: NOAA CoastWatch / ERD ERDDAP (keyless), https://coastwatch.pfeg.noaa.gov/erddap/ , read with griddap (.json):
 *   1. jplMURSST41     "MUR SST Analysis fv04.1, Global, 0.01 degree, 2002-present, Daily" (NASA JPL, GHRSST). Variable analysed_sst
 *                      (degree_C on this server), analysis_error (degree_C), mask (1 open sea, 2 land, 4 lake ...). dims: time, latitude, longitude.
 *                      A gap-free L4 "foundation SST" ANALYSIS: clouds are filled in by interpolation of several satellites (infrared, microwave)
 *                      and a little in-situ data. Newest map was 3 days old on 2026-11-12 (nominal latency 4 days, the last 7 days are revised).
 *   2. ncdcOisst21NrtAgg  backup: "SST, Daily Optimum Interpolation (OI), AVHRR Only, Version 2.1, Preliminary, Global, 0.25 degree".
 *                      Variable sst (degree_C), err. dims: time, zlev, latitude, longitude (longitude 0..360). Also gap-free L4, 25 km pixels.
 * Both pages were read on 2026-11-12 (dataset id, variable names, units, fill values, time range). The real service cannot be reached from
 * the build sandbox, so the requests below follow the documentation and the fixtures in tests/satellite-sea/, not a live answer.
 *
 * Per city: ONE small box around the city centre (about 25 x 31 MUR pixels), the latest map, the nearest pixel that is open sea
 * (mask, not null, plausible) within a few km. The distance is part of the reading's `where`. A satellite pixel is an AREA.
 */

const E = require('../lib/erddap');
const { makeGridFeed } = require('../lib/gridfeed');

const HOST = 'coastwatch.pfeg.noaa.gov';
const DAY = 86400000;
const MAX_ERR = 3;          // a pixel whose own error estimate is above this (degrees C) is not used
const FRESH_ENOUGH = 10 * DAY;   // a map older than this and the backup is tried too (the newer of the two is kept)

const DATASETS = [
  { key: 'mur', name: 'MUR', dataset: 'jplMURSST41', value: 'analysed_sst', err: 'analysis_error', mask: 'mask', pre: ['(last)'], halfLat: 0.12, halfLng: 0.15, maxKm: 15, grid: '1 km', coarse: false },
  { key: 'oisst', name: 'OISST', dataset: 'ncdcOisst21NrtAgg', value: 'sst', err: 'err', mask: null, pre: ['(last)', '0'], halfLat: 0.4, halfLng: 0.4, maxKm: 40, grid: '25 km', coarse: true },
];
const BY_KEY = Object.fromEntries(DATASETS.map((d) => [d.key, d]));

// One dataset, one city: the nearest open-sea pixel of the newest map, or null.
async function readOne(ds, place, get) {
  const box = E.boxAround(place.lat, place.lng, ds.halfLat, ds.halfLng);
  const vars = [ds.value, ds.err, ds.mask].filter(Boolean);
  const json = await get(E.griddapUrl({ host: HOST, dataset: ds.dataset, vars, pre: ds.pre, lat: box.lat, lng: box.lng }));
  const { cells, units } = E.parseGrid(json, vars);
  if (!cells.length) return null;
  const newest = cells.reduce((m, c) => Math.max(m, c.t), 0);
  for (const c of cells) {
    c.sst = E.toCelsius(c.v[ds.value], units[ds.value]);
    c.err = ds.err ? E.cleanNumber(c.v[ds.err]) : null;
    const m = ds.mask ? E.cleanNumber(c.v[ds.mask]) : null;
    c.sea = m == null || ((m & 1) === 1 && (m & 2) === 0 && (m & 4) === 0);   // MUR mask: 1 open sea; land (2) and lakes (4) are not the sea
  }
  const hit = E.nearestCell(cells, place.lat, place.lng, ds.maxKm, (c) => c.t === newest && c.sea && c.sst != null && (c.err == null || c.err <= MAX_ERR));
  if (!hit) return null;
  return { value: Math.round(hit.cell.sst * 100) / 100, obsMs: newest, km: Math.round(hit.km * 10) / 10, ds: ds.key, err: hit.cell.err == null ? null : Math.round(hit.cell.err * 100) / 100 };
}

module.exports = function create(ctx) {
  async function fetchCity(id, place, get) {
    let best = null, firstErr = null;
    for (const ds of DATASETS) {
      try {
        const e = await readOne(ds, place, get);
        if (e && (!best || e.obsMs > best.obsMs)) best = e;
        if (best && ctx.now() - best.obsMs <= FRESH_ENOUGH) break;
      } catch (err) { firstErr = firstErr || err; }
    }
    if (best) return best;
    if (firstErr) throw firstErr;
    return null;
  }

  function toReading(e, now) {
    const ds = BY_KEY[e.ds] || DATASETS[0];
    const km = E.kmText(e.km), day = E.isoDay(e.obsMs);
    const errEn = e.err != null ? ` The map's own error estimate for this pixel is about ${E.numText(e.err)} °C.` : '';
    const errEl = e.err != null ? ` Η δική του εκτίμηση σφάλματος για αυτό το εικονοστοιχείο είναι περίπου ${E.numText(e.err)} °C.` : '';
    const backEn = ds.coarse ? ' This is the backup map with coarse 25 km pixels.' : '';
    const backEl = ds.coarse ? ' Αυτός είναι ο εφεδρικός χάρτης με αδρά εικονοστοιχεία 25 km.' : '';
    return {
      variable: 'sea_surface_temperature', value: e.value, unit: 'Cel', time: e.obsMs,
      where: `nearest open-sea satellite pixel, ${km} km from the city centre (${ds.name} map, ${ds.grid} grid)`,
      whereEl: `πλησιέστερο εικονοστοιχείο ανοιχτής θάλασσας από δορυφόρο, ${km} km από το κέντρο της πόλης (χάρτης ${ds.name}, πλέγμα ${ds.grid})`,
      note: `Map of ${day}. A satellite sees only the top skin of the sea and cannot see through cloud; this map fills cloudy gaps by interpolation, so it is a smooth estimate for one pixel, not a thermometer at the beach.${errEn}${backEn}`,
      noteEl: `Χάρτης της ${day}. Ο δορυφόρος βλέπει μόνο το λεπτό επιφανειακό στρώμα της θάλασσας και δεν βλέπει μέσα από σύννεφα· ο χάρτης συμπληρώνει τα κενά με παρεμβολή, άρα είναι ομαλή εκτίμηση για ένα εικονοστοιχείο, όχι θερμόμετρο στην παραλία.${errEl}${backEl}`,
    };
  }

  function probeText({ n, total, newestMs }) {
    if (!n) return { note: 'not available right now · coastal cities only', noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή · μόνο παράκτιες πόλεις' };
    const day = E.isoDay(newestMs);
    return { note: `${n} of ${total} coastal cities · map of ${day} · coastal cities only`, noteEl: `${n} από ${total} παράκτιες πόλεις · χάρτης της ${day} · μόνο παράκτιες πόλεις` };
  }

  return makeGridFeed(ctx, {
    id: 'noaa-sst', hosts: [HOST], label: 'Sea temperature (NOAA ERDDAP)', cacheFile: 'sst.json',
    intervalMs: 6 * 3600000, firstDelayMs: 12000, keepMs: 21 * DAY, inland: ['lefkosia'],
    fetchCity, toReading, probeText,
  });
};
module.exports._t = { DATASETS, readOne };
