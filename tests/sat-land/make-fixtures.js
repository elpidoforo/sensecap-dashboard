'use strict';
/* Makes the fixture files of the modis-lst and modis-ndvi tests (tests/sat-land/fixtures/*.json). Run once: node tests/sat-land/make-fixtures.js
 * The files are checked in so a maintainer can read them. They imitate the answer shape of the ORNL DAAC subset service as its documentation
 * and the MODISTools client describe it (values are raw integers, bands are listed one by one, a date has one item per band), with the
 * "hero" cases written out by hand so the tests can check exact numbers without using the code under test:
 *   - Larnaka Aqua day, newest 8-day composite: 9 pixels = 2 fill (water), 1 cloud-flagged, 1 error class 3 K+, 5 usable (the centre among them)
 *   - Lefkosia Aqua day: one value of 65535 (the top of the valid range, but not a real temperature)
 *   - Limassol Aqua day: the centre pixel is fill, the other 8 are fine
 *   - Paphos Aqua day: the newest composite is all cloud, so the day value must come from the one before
 *   - Lefkosia Terra day: only 3 usable pixels: not enough for a block mean, the centre pixel alone is used
 *   - Paphos Terra day: 2 usable, the centre is not one of them: no value
 *   - NDVI Larnaka Terra (MOD13Q1): fill, cloudy (rel 3), snow (VI Quality bit 14), out of range, 5 usable
 *   - NDVI Larnaka Aqua (MYD13Q1): the newest composite is all cloud
 *   - NDVI Limassol: MODIS products all cloud, only VIIRS (VNP13A1, 500 m, -15000 fill, the VIIRS reliability codes) has a value
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'fixtures');
fs.mkdirSync(dir, { recursive: true });

const CITIES = { larnaka: [34.9229, 33.6233], lefkosia: [35.1856, 33.3823], limassol: [34.6841, 33.0379], paphos: [34.7754, 32.4245] };
let seed = 20261112;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const iso = (code) => { const y = +code.slice(1, 5), d = +code.slice(5); return new Date(Date.UTC(y, 0, 1) + (d - 1) * 86400000).toISOString().slice(0, 10); };
// one band (or one date) per line: readable in a diff, small on disk
function pretty(obj) {
  const key = obj.subset ? 'subset' : 'dates';
  const rest = Object.entries(obj).filter(([k]) => k !== key).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  return '{\n' + rest.join('\n') + (rest.length ? '\n' : '') + ` "${key}": [\n` + obj[key].map((i) => '  ' + JSON.stringify(i)).join(',\n') + '\n ]\n}\n';
}
const write = (name, obj) => fs.writeFileSync(path.join(dir, name), pretty(obj));

/* the date lists: every composite from late 2025 to the newest one */
function dateList(count, step, newest) {   // built backwards from the newest composite (the year boundary is only roughly right: nothing reads it)
  const out = [];
  let y = +newest.slice(1, 5), d = +newest.slice(5);
  for (let k = 0; k < count; k++) {
    const code = 'A' + y + String(d).padStart(3, '0');
    out.unshift({ modis_date: code, calendar_date: iso(code) });
    d -= step;
    if (d < 1) { y--; d += (y % 4 === 0) ? 366 : 365; }
  }
  return out;
}
write('dates-8day.json', { dates: dateList(40, 8, 'A2026297') });        // MOD11A2 / MYD11A2: ... A2026289, A2026297 (24-31 Oct 2026)
write('dates-8day-next.json', { dates: dateList(41, 8, 'A2026305') });   // the same, one composite later (1-8 Nov 2026)
write('dates-16day-terra.json', { dates: dateList(20, 16, 'A2026289') }); // MOD13Q1 / VNP13A1: ... A2026273, A2026289 (16-31 Oct 2026)
write('dates-16day-aqua.json', { dates: dateList(20, 16, 'A2026297') });  // MYD13Q1: ... A2026281, A2026297 (24 Oct-8 Nov 2026)

function envelope(city, nrows, ncols, cellsize, subset) {
  return { xllcorner: '3480000.5', yllcorner: '3850000.2', cellsize: String(cellsize), nrows, ncols, band: 'all', latitude: CITIES[city][0], longitude: CITIES[city][1], header: 'https://modis.ornl.gov/rst/api/v1/', subset };
}
// two spellings of the same item: "docs" follows the ORNL page (title, version), "client" follows MODISTools (tile, calendar_date, scale, units)
function item(shape, band, code, data, extra) {
  const base = { band, data, modis_date: code, proc_date: '2026' + String(300 + (+code.slice(5) % 20)).padStart(3, '0') + '123456' };
  if (shape === 'client') return { ...base, calendar_date: iso(code), tile: 'h21v05', ...(extra || {}) };
  return { ...base, title: 'h21v05', version: '061' };
}

/* ---------- land surface temperature: 3 x 3 pixels of 1 km ---------- */
const N = 9;
const dnOf = (K) => Math.round(K / 0.02);
const bits = (n) => (1 << n) - 1;   // n clear days -> a byte with n bits set
function lstPart(K, noise) {
  const dn = [], qc = [];
  for (let i = 0; i < N; i++) { dn.push(dnOf(K + (rnd() - 0.5) * 2 * noise)); qc.push(rnd() < 0.3 ? 64 : 0); }
  return { dn, qc };
}
function lstItems(shape, product, city, code, o) {
  const day = lstPart(o.dayK, 1.2), night = lstPart(o.nightK, 0.8);
  for (const [i, v] of Object.entries(o.dayPix || {})) { day.dn[i] = v[0]; day.qc[i] = v[1]; }
  for (const [i, v] of Object.entries(o.nightPix || {})) { night.dn[i] = v[0]; night.qc[i] = v[1]; }
  const tD = o.dayTime || (product === 'MYD11A2' ? 136 : 104), tN = o.nightTime || (product === 'MYD11A2' ? 14 : 223);
  const dayT = o.dayViewTimes || Array.from({ length: N }, (_, i) => tD + (i % 3));
  const nightT = Array.from({ length: N }, (_, i) => tN + (i % 3));
  const cl = (n) => Array(N).fill(bits(n));
  const sc = { scale: '0.02', units: 'Kelvin' };
  return [
    item(shape, 'LST_Day_1km', code, day.dn, sc), item(shape, 'QC_Day', code, day.qc, { units: 'bit field' }),
    item(shape, 'Day_view_time', code, dayT, { scale: '0.1', units: 'hrs' }), item(shape, 'Day_view_angl', code, Array(N).fill(95), { scale: '1', units: 'degree' }),
    item(shape, 'LST_Night_1km', code, night.dn, sc), item(shape, 'QC_Night', code, night.qc, { units: 'bit field' }),
    item(shape, 'Night_view_time', code, nightT, { scale: '0.1', units: 'hrs' }), item(shape, 'Night_view_angl', code, Array(N).fill(90), { scale: '1', units: 'degree' }),
    item(shape, 'Emis_31', code, Array(N).fill(240), { scale: '0.002', units: 'none' }), item(shape, 'Emis_32', code, Array(N).fill(245), { scale: '0.002', units: 'none' }),
    item(shape, 'Clear_sky_days', code, cl(o.clearDays == null ? 6 : o.clearDays), { units: 'bit field' }), item(shape, 'Clear_sky_nights', code, cl(o.clearNights == null ? 5 : o.clearNights), { units: 'bit field' }),
  ];
}
const BASE = {   // [day K, night K] for the composite A2026297, Aqua; Terra is a little cooler by day
  larnaka: [304.0, 292.0], lefkosia: [307.5, 290.0], limassol: [303.0, 293.5], paphos: [302.5, 292.0],
};
const CLOUD = [15200, 2];   // a plausible-looking value that the quality byte says is cloud
for (const [product, shape, terraShift] of [['MYD11A2', 'docs', 0], ['MOD11A2', 'client', -3]]) {
  for (const city of Object.keys(CITIES)) {
    const subset = [];
    for (const [code, shift] of [['A2026281', -2], ['A2026289', -1], ['A2026297', 0]]) {
      const [dK, nK] = BASE[city];
      const o = { dayK: dK + terraShift + shift, nightK: nK + shift * 0.5 };
      if (code === 'A2026297' && product === 'MYD11A2') {
        if (city === 'larnaka') {
          o.dayPix = { 0: [0, 3], 1: [0, 3], 2: [15180, 2], 3: [15200, 193], 4: [15200, 0], 5: [15250, 64], 6: [15150, 0], 7: [15300, 65], 8: [15100, 128] };
          o.nightPix = { 0: [14550, 0], 1: [14580, 0], 2: [14600, 0], 3: [14590, 0], 4: [14600, 0], 5: [14610, 64], 6: [14620, 0], 7: [14570, 0], 8: [14560, 0] };
          o.dayViewTimes = [138, 137, 136, 139, 136, 135, 137, 138, 136];
          o.clearDays = 6; o.clearNights = 5;
        }
        if (city === 'lefkosia') o.dayPix = { 8: [65535, 0] };
        if (city === 'limassol') o.dayPix = { 4: [0, 3] };
        if (city === 'paphos') o.dayPix = Object.fromEntries(Array.from({ length: N }, (_, i) => [i, CLOUD]));
      }
      if (code === 'A2026297' && product === 'MOD11A2') {
        if (city === 'lefkosia') o.dayPix = Object.fromEntries(Array.from({ length: N }, (_, i) => [i, i === 4 || i === 1 || i === 7 ? [dnOf(303.5), 0] : [0, 3]]));
        if (city === 'paphos') o.dayPix = Object.fromEntries(Array.from({ length: N }, (_, i) => [i, i === 0 || i === 8 ? [dnOf(300.5), 0] : [0, 2]]));
      }
      subset.push(...lstItems(shape, product, city, code, o));
    }
    write(`subset-${product}-${city}.json`, envelope(city, 3, 3, 926.625433055834, subset));
  }
}

/* ---------- NDVI: 9 x 9 pixels of 250 m (MODIS), 5 x 5 of 500 m (VIIRS) ---------- */
const GOOD_VIQ = 2112;   // land, good quality, low aerosol
function ndviItems(shape, prefix, code, side, base, hero, viirs) {
  const n = side * side, c = (side - 1) / 2;
  const nd = [], rel = [], viq = [], evi = [], doy = [];
  for (let i = 0; i < n; i++) { nd.push(Math.round((base + (rnd() - 0.5) * 0.08) * 10000)); rel.push(0); viq.push(GOOD_VIQ); evi.push(Math.round(base * 0.7 * 10000)); doy.push(+code.slice(5) + 6); }
  const idx = (r, k) => (c - 1 + r) * side + (c - 1 + k);   // r, k in 0..2: the 3 x 3 block around the centre
  for (const [rk, v] of Object.entries(hero || {})) { const i = idx(+rk[0], +rk[1]); nd[i] = v[0]; rel[i] = v[1]; viq[i] = v[2]; }
  const q = (name, data, extra) => item(shape, prefix + name, code, data, extra);
  const sc = { scale: viirs ? '0.0001' : '0.0001', units: 'NDVI' };
  return [q('NDVI', nd, sc), q('EVI', evi, { scale: '0.0001', units: 'EVI' }), q('VI_Quality', viq, { units: 'bit field' }), q('pixel_reliability', rel, { units: 'rank' }), q('composite_day_of_the_year', doy, { units: 'Julian day of the year' })];
}
const allCloud = (viirs) => { const h = {}; for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) h['' + r + k] = [viirs ? 9000 : 8000, viirs ? 9 : 3, viirs ? 2112 + 1024 : 2112 + 2]; return h; };
const NDVI_BASE = { larnaka: 0.22, lefkosia: 0.18, limassol: 0.3, paphos: 0.35 };
for (const [product, prefix, side, cell, codes, shape, viirs] of [
  ['MOD13Q1', '250m_16_days_', 9, 231.656358264, ['A2026257', 'A2026273', 'A2026289'], 'client', false],
  ['MYD13Q1', '250m_16_days_', 9, 231.656358264, ['A2026265', 'A2026281', 'A2026297'], 'docs', false],
  ['VNP13A1', '500_m_16_days_', 5, 463.312716528, ['A2026257', 'A2026273', 'A2026289'], 'client', true],
]) {
  for (const city of Object.keys(CITIES)) {
    const subset = [];
    codes.forEach((code, k) => {
      let hero = null;
      const newest = k === codes.length - 1;
      if (city === 'larnaka' && product === 'MOD13Q1' && newest) {
        // rows of the 3 x 3 block: [ndvi DN, reliability, VI Quality]
        hero = { '00': [9000, 3, 2112 + 2], '01': [2400, 0, 2112], '02': [2500, 1, 2113], '10': [-3000, -1, 65535], '11': [2300, 0, 2112], '12': [2600, 0, 2112], '20': [3000, 1, 2112 + 16384], '21': [2200, 0, 2112], '22': [12000, 0, 2112] };
      }
      if (city === 'larnaka' && product === 'MYD13Q1' && newest) hero = allCloud(false);
      if (city === 'limassol' && !viirs && newest) hero = allCloud(false);
      if (city === 'limassol' && viirs && newest) {
        // VIIRS codes: -15000 fill, 0 excellent, 1 good, 3 marginal (not used), 9 cloud (not used)
        hero = { '00': [-15000, -1, 65535], '01': [3100, 0, 2112], '02': [3000, 1, 2112], '10': [3300, 3, 2112], '11': [3200, 0, 2112], '12': [3400, 1, 2112], '20': [8800, 9, 2112], '21': [3300, 0, 2112], '22': [3200, 0, 2112] };
      }
      subset.push(...ndviItems(shape, prefix, code, side, NDVI_BASE[city] + (k - 2) * 0.01, hero, viirs));
    });
    write(`subset-${product}-${city}.json`, envelope(city, side, side, cell, subset));
  }
}
console.log('fixtures written to', dir, fs.readdirSync(dir).length, 'files');
