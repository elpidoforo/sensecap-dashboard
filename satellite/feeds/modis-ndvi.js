'use strict';
/* satellite/feeds/modis-ndvi.js: vegetation greenness (NDVI) from NASA MODIS (Terra, Aqua) and VIIRS (Suomi NPP).
 *
 *   id        modis-ndvi           descriptor: sources/modis-ndvi.json
 *   host      modis.ornl.gov       the ORNL DAAC "MODIS and VIIRS Land Product Subsets" web service, no key
 *   products  MOD13Q1 (Terra, 250 m), MYD13Q1 (Aqua, 250 m), VNP13A1 (VIIRS, 500 m): 16-day composites
 *   variable  ndvi  (new in vocab/variables.json, unit {NDVI}, 0 to 1 in practice)
 *
 * How a value is made (LP DAAC file specifications of MOD13Q1 V061 and VNP13A1, read 2026-11-12):
 *   NDVI band            int16, scale 0.0001 (the service lists it as the multiplier 0.0001; the HDF file calls the same thing
 *                        scale_factor 10000, a DIVISOR: do not mix the two up), valid -2000 to 10000, fill -3000 (VIIRS: -15000)
 *   pixel reliability    MODIS: -1 no data, 0 good, 1 marginal, 2 snow/ice, 3 cloudy.  VIIRS (V002): 0 excellent, 1 good, 2 acceptable,
 *                        3 marginal, 4 pass, 5 questionable, 6 poor, 7 cloud shadow, 8 snow/ice, 9 cloud, 10 estimated, 11 long-term
 *                        average, -1 no data, -4 water.  We use only 0 and 1 in both (the two tables disagree beyond that).
 *   VI Quality           16 bits, decoded by viQa() in ../lib/modis-ornl.js: refused when probably cloudy, not useful, mixed clouds,
 *                        snow/ice or shadow.
 * Both flags must agree. A pixel that fails either one is not used, however green it looks.
 * Window: kmAboveBelow = kmLeftRight = 1 gives 9 x 9 pixels at 250 m (5 x 5 at 500 m); we use the centre pixel and the 3 x 3 block around
 * it (about 700 m at 250 m). The reading is the block mean when at least 4 of 9 pixels are usable, else the centre pixel, else nothing.
 * The reading that is shown is the NEWEST usable composite over the three products (Terra and Aqua are 8 days apart; VIIRS carries on
 * when MODIS ends). `time` is the middle of the 16-day period.
 */

const fs = require('fs');
const path = require('path');
const M = require('../lib/modis-ornl');

const PRODUCTS = [
  { product: 'MOD13Q1', sat: 'Terra', satEl: 'Terra', days: 16, pixel: '250 m', block: ['about 700 m', 'περίπου 700 m'] },
  { product: 'MYD13Q1', sat: 'Aqua', satEl: 'Aqua', days: 16, pixel: '250 m', block: ['about 700 m', 'περίπου 700 m'] },
  { product: 'VNP13A1', sat: 'Suomi NPP', satEl: 'Suomi NPP', days: 16, pixel: '500 m', block: ['about 1.4 km', 'περίπου 1,4 km'] },
];
const SCALE = 0.0001, DN_MIN = -2000, DN_MAX = 10000;
const MIN_BLOCK = 4;
const VARIABLE = 'ndvi';

function vocabRange() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vocab', 'variables.json'), 'utf8'))[VARIABLE];
    if (v && Array.isArray(v.range) && v.range.length === 2) return v.range;
  } catch (e) { /* the file is read only to stay in step with the vocabulary */ }
  return [-0.2, 1];
}

// One pixel: NDVI raw value, pixel reliability, VI Quality word -> { ok: true, v, good } or { ok: false, why }.
function decodePixel(dn, rel, viq, range) {
  const v = M.num(dn);
  if (v == null || v < DN_MIN) return { ok: false, why: 'fill' };            // -3000 and -15000 are the fill values
  if (v > DN_MAX) return { ok: false, why: 'range' };
  const r = M.num(rel), q = M.viQa(viq);
  if (r == null && !q) return { ok: false, why: 'noqa' };
  if (r != null && r !== 0 && r !== 1) return { ok: false, why: 'flagged' };    // snow, cloud, shadow, poor, estimated, water, no data
  if (q && q.bad) return { ok: false, why: 'flagged' };
  const x = v * SCALE;
  if (!(x >= range[0] && x <= range[1])) return { ok: false, why: 'range' };
  return { ok: true, v: x, good: (r == null || r === 0) && (!q || q.good) };
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function summarise(items, grid, range, log) {
  const pick = (re) => items.find((i) => re.test(i.key));
  const ndvi = pick(/ndvi$/), rel = pick(/pixelreliability$/), viq = pick(/viquality$/);
  if (!ndvi) throw new Error(`no band named like NDVI in the answer (bands seen: ${[...new Set(items.map((i) => i.band))].slice(0, 8).join(', ') || 'none'})`);
  if (!rel && !viq) throw new Error('the answer has an NDVI band but neither a pixel reliability nor a VI Quality band, so cloudy pixels could not be told apart');
  const win = M.windowOf(ndvi.data.length, grid.nrows, grid.ncols);
  if (!win) throw new Error(`the pixel grid has an unexpected shape (${ndvi.data.length} values, ${grid.nrows} x ${grid.ncols})`);
  if (ndvi.scale != null && Math.abs(ndvi.scale - SCALE) > 1e-12) log(`the service reports scale ${ndvi.scale} for ${ndvi.band}; the documented multiplier ${SCALE} is used`);
  const used = [], rej = { fill: 0, flagged: 0, range: 0, noqa: 0 };
  let centre = null;
  for (const i of win.block) {
    const p = decodePixel(ndvi.data[i], rel ? rel.data[i] : null, viq ? viq.data[i] : null, range);
    if (p.ok) { used.push(p); if (i === win.centre) centre = p; } else rej[p.why]++;
  }
  let value = null, basis = null;
  if (used.length >= MIN_BLOCK) { value = used.reduce((s, u) => s + u.v, 0) / used.length; basis = 'mean'; }
  else if (centre) { value = centre.v; basis = 'centre'; }
  return {
    value: value == null ? null : round(value, 3), basis, n: used.length, of: win.block.length, centre: centre ? round(centre.v, 3) : null,
    min: used.length ? round(Math.min(...used.map((u) => u.v)), 3) : null, max: used.length ? round(Math.max(...used.map((u) => u.v)), 3) : null,
    good: used.length > 0 && used.every((u) => u.good), rej,
  };
}

function noteFor(s, p, spec) {
  const c = s.centre;
  const en = [
    'Greenness score, about 0 to 1: below 0.2 mostly bare ground, roofs and roads; 0.2 to 0.5 grass and shrubs; above 0.6 dense green plants.',
    s.basis === 'mean'
      ? `Average of ${s.n} clear pixels (${spec.pixel} each) of a 3 x 3 block, ${spec.block[0]} wide, around the city centre${c != null ? `; the centre pixel alone is ${M.fmtNum(c, 2)}` : ''}.`
      : `One clear ${spec.pixel} pixel at the city centre.`,
    `${p.days}-day period ${M.periodText(p, false)}.`,
    'Not a tree count; dry summer grass looks brown to the satellite.',
  ];
  const el = [
    'Βαθμολογία πρασινάδας, περίπου 0 έως 1: κάτω από 0,2 κυρίως γυμνό έδαφος, στέγες, δρόμοι· 0,2 έως 0,5 χορτάρι, θάμνοι· πάνω από 0,6 πυκνά φυτά.',
    s.basis === 'mean'
      ? `Μέσος όρος ${s.n} καθαρών εικονοστοιχείων (${spec.pixel} το καθένα) σε μπλοκ 3 x 3, ${spec.block[1]}${c != null ? `· το κεντρικό μόνο ${M.fmtNum(c, 2, true)}` : ''}.`
      : `Ένα καθαρό εικονοστοιχείο ${spec.pixel} στο κέντρο της πόλης.`,
    `Περίοδος ${p.days} ημερών ${M.periodText(p, true)}.`,
    'Δεν μετράει δέντρα· το ξερό καλοκαιρινό χορτάρι δεν φαίνεται πράσινο.',
  ];
  return { note: M.fit(en, 390), noteEl: M.fit(el, 390) };
}
const whereFor = (spec) => ({
  where: `greenness of plants and fields seen by the ${spec.sat} satellite (${spec.product}), pixels around the city centre; not a tree count`,
  whereEl: `πρασινάδα φυτών και χωραφιών όπως τη βλέπει ο δορυφόρος ${spec.satEl} (${spec.product}), εικονοστοιχεία γύρω από το κέντρο της πόλης· δεν μετράει δέντρα`,
});

module.exports = function create(ctx) {
  const range = vocabRange();
  const R = M.createRefresher(ctx, {
    products: PRODUCTS.map((p) => p.product), history: 3, km: 1,
    startDelayMs: 27000, everyMs: 12 * M.HOUR, gapMs: 1500,
    summarise: (product, items, grid) => summarise(items, grid, range, (m) => ctx.log(`${product}: ${m}`)),
  });

  // The newest usable composite over the products (a tie goes to the product listed first). { reading, p, spec } or null.
  function best(cityId) {
    let pick = null;
    for (const spec of PRODUCTS) {
      const hit = R.entries(spec.product, cityId).find((e) => e.s && e.s.value != null);
      if (!hit) continue;
      const p = M.period(hit.ms, spec.days);
      if (!pick || p.midMs > pick.p.midMs) pick = { spec, p, s: hit.s };
    }
    if (!pick) return null;
    return { p: pick.p, spec: pick.spec, reading: { variable: VARIABLE, value: Math.round(pick.s.value * 100) / 100, unit: '{NDVI}', time: pick.p.midMs, ...whereFor(pick.spec), ...noteFor(pick.s, pick.p, pick.spec) } };
  }

  function probe() {
    const ids = Object.keys(ctx.places).filter((k) => k[0] !== '_');
    let n = 0, at = null, newest = null;
    for (const id of ids) {
      const b = best(id);
      if (!b) continue;
      n++;
      if (at == null || b.reading.time > at) { at = b.reading.time; newest = b; }
    }
    const st = R.status();
    if (n) {
      const bad = !!st.lastError;   // cleared by the next fully good round
      return {
        ok: true, n, at,
        note: `${n} of ${ids.length} cities, newest ${newest.p.days}-day period ${M.periodText(newest.p, false)} (${newest.spec.product})${bad ? '; the last refresh had a problem' : ''}`,
        noteEl: `${n} από ${ids.length} πόλεις, νεότερη περίοδος ${newest.p.days} ημερών ${M.periodText(newest.p, true)} (${newest.spec.product})${bad ? '· η τελευταία ανανέωση είχε πρόβλημα' : ''}`,
      };
    }
    if (!st.attempted) return { ok: false, n: 0, at: null, note: 'waiting for the first answer from the NASA ORNL DAAC service', noteEl: 'αναμονή για την πρώτη απάντηση από την υπηρεσία NASA ORNL DAAC' };
    if (st.lastError) return { ok: false, n: 0, at: null, note: `not available right now: ${st.lastError}`.slice(0, 160), noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή· η υπηρεσία NASA ORNL DAAC δεν έδωσε χρήσιμη απάντηση' };
    return { ok: false, n: 0, at: null, note: 'the service answered, but no clear pixel was found yet', noteEl: 'η υπηρεσία απάντησε, αλλά δεν βρέθηκε ακόμη καθαρό εικονοστοιχείο' };
  }

  return {
    id: 'modis-ndvi', hosts: [M.HOST],
    start: () => R.start(), stop: () => R.stop(),
    refresh: () => R.refresh(),
    probe,
    read: (cityId) => { if (!ctx.places[cityId]) return []; const b = best(cityId); return b ? [b.reading] : []; },
  };
};
module.exports._t = { decodePixel, summarise, noteFor, PRODUCTS, SCALE, DN_MIN, DN_MAX };
