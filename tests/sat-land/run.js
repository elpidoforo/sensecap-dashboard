'use strict';
/* Tests of the two NASA land feeds (modis-lst, modis-ndvi) and their shared module. No network, no dependencies:
 *     node tests/sat-land/run.js
 * The "service" is a function that answers the ORNL DAAC URLs from tests/sat-land/fixtures (made by make-fixtures.js), behind the
 * REAL satellite/http.js (host rules, size caps, JSON parsing) through satellite/testing.js. Exact numbers in the expectations are
 * worked out here by hand from the raw fixture values, never with the code under test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures');
const { makeCtx, reply } = require(path.join(ROOT, 'satellite', 'testing'));
const M = require(path.join(ROOT, 'satellite', 'lib', 'modis-ornl'));
const createLst = require(path.join(ROOT, 'satellite', 'feeds', 'modis-lst'));
const createNdvi = require(path.join(ROOT, 'satellite', 'feeds', 'modis-ndvi'));
const { createSatellite } = require(path.join(ROOT, 'satellite'));
const { createLayers, loadRegister } = require(path.join(ROOT, 'layers'));

/* ---------- a tiny harness ---------- */
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const approx = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what || 'value'}: ${a} is not within ${tol} of ${b}`);
const json = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const CITIES = { larnaka: [34.9229, 33.6233], lefkosia: [35.1856, 33.3823], limassol: [34.6841, 33.0379], paphos: [34.7754, 32.4245] };
const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);   // 12 Nov 2026, noon UTC
const D = (y, m, d) => Date.UTC(y, m - 1, d);     // m is 1-based
const kToC = (dn) => dn * 0.02 - 273.15;           // worked out by hand from the file specification
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/* the fake service */
function fakeOrnl(o) {
  const opt = o || {};
  const calls = [];
  const datesFile = { MOD11A2: 'dates-8day.json', MYD11A2: 'dates-8day.json', MOD13Q1: 'dates-16day-terra.json', MYD13Q1: 'dates-16day-aqua.json', VNP13A1: 'dates-16day-terra.json' };
  if (opt.next) datesFile.MOD11A2 = datesFile.MYD11A2 = 'dates-8day-next.json';
  const fn = (url) => {
    calls.push(url);
    const m = /\/rst\/api\/v1\/([A-Z0-9]+)\/(dates|subset)\?(.*)$/.exec(url);
    if (!m) return reply(404, 'no such path');
    const [, product, kind, query] = m;
    const q = new URLSearchParams(query);
    if (opt.respond) { const r = opt.respond(product, kind, q, url); if (r !== undefined) return r; }
    if (opt.missing && opt.missing.includes(product)) return reply(404, 'no such product');
    if (kind === 'dates') return json(datesFile[product]);
    assert.equal(q.get('kmAboveBelow'), '1'); assert.equal(q.get('kmLeftRight'), '1');
    assert.match(q.get('startDate'), /^A\d{7}$/); assert.match(q.get('endDate'), /^A\d{7}$/);
    assert.ok(!q.has('band'), 'no band is asked for: the service returns all bands');
    const city = Object.keys(CITIES).find((c) => Math.abs(CITIES[c][0] - Number(q.get('latitude'))) < 1e-3 && Math.abs(CITIES[c][1] - Number(q.get('longitude'))) < 1e-3);
    assert.ok(city, 'the point asked for is a city centre');
    const all = json(`subset-${product}-${city}.json`);
    let items = all.subset;
    if (opt.next && /11A2$/.test(product)) {   // a new composite: the newest one again, a little warmer
      const copy = items.filter((i) => i.modis_date === 'A2026297').map((i) => ({ ...i, modis_date: 'A2026305', calendar_date: '2026-11-01' }));
      items = items.concat(copy);
    }
    const lo = q.get('startDate'), hi = q.get('endDate');
    return { ...all, subset: items.filter((i) => i.modis_date >= lo && i.modis_date <= hi) };
  };
  return { fixtures: { 'https://modis.ornl.gov/rst/api/v1/*': fn }, calls };
}
function newCtx(id, o) {
  const f = fakeOrnl(o);
  const ctx = makeCtx({ id, hosts: ['modis.ornl.gov'], fixtures: f.fixtures, now: NOW, dir: o && o.dir, env: { SATELLITE_MODIS_GAP_MS: '0' } });
  return { ctx, calls: f.calls };
}
// The polite pause between two calls is 1.5 s; the tests set SATELLITE_MODIS_GAP_MS=0 and wait for it only where it is the thing under test.
async function atNow(ms, fn) { const real = Date.now; Date.now = () => ms; try { return await fn(); } finally { Date.now = real; } }   // the layers code reads the clock itself

/* =================== dates =================== */

test('parseModisDate: valid, invalid, leap days', () => {
  const d = M.parseModisDate('A2026297');
  assert.equal(d.ms, D(2026, 10, 24)); assert.equal(d.year, 2026); assert.equal(d.doy, 297); assert.equal(d.code, 'A2026297');
  assert.equal(M.parseModisDate('A2024366').ms, D(2024, 12, 31));
  for (const bad of ['A2026366', 'A1999001', 'A2026000', 'A2026400', '2026297', 'a2026297', '', null, undefined, 42, 'A202629']) assert.equal(M.parseModisDate(bad), null, String(bad));
  assert.equal(M.codeOfMs(D(2026, 10, 24)), 'A2026297'); assert.equal(M.codeOfMs(D(2026, 1, 1)), 'A2026001'); assert.equal(M.codeOfMs(D(2024, 12, 31)), 'A2024366');
});
test('period and periodText: 8 days, 16 days, the short composite at the end of a year, English and Greek', () => {
  const p = M.period(D(2026, 10, 24), 8);
  assert.equal(p.days, 8); assert.equal(p.endMs, D(2026, 11, 1)); assert.equal(p.midMs, D(2026, 10, 28));
  assert.equal(M.periodText(p, false), '24-31 Oct 2026'); assert.equal(M.periodText(p, true), '24-31 Οκτ 2026');
  const q = M.period(D(2026, 10, 28), 8);
  assert.equal(M.periodText(q, false), '28 Oct - 4 Nov 2026'); assert.equal(M.periodText(q, true), '28 Οκτ - 4 Νοε 2026');
  const e = M.period(D(2025, 12, 27), 8);   // the last composite of a year is cut at 1 January
  assert.equal(e.days, 5); assert.equal(e.endMs, D(2026, 1, 1)); assert.equal(M.periodText(e, false), '27-31 Dec 2025');
  assert.equal(M.period(D(2026, 10, 16), 16).midMs, D(2026, 10, 24));
});
test('parseDates: the documented shape, a bare list, strings, calendar dates only, garbage', () => {
  const a = M.parseDates({ dates: [{ modis_date: 'A2026297', calendar_date: '2026-10-24' }, { modis_date: 'A2026289', calendar_date: '2026-10-16' }, { modis_date: 'bad' }, null] });
  assert.deepEqual(a.map((d) => d.code), ['A2026289', 'A2026297']);   // oldest first, the bad entries dropped
  assert.deepEqual(M.parseDates(['A2026297', 'A2026289']).map((d) => d.code), ['A2026289', 'A2026297']);
  assert.deepEqual(M.parseDates({ dates: [{ calendar_date: '2026-10-24' }] }).map((d) => d.code), ['A2026297']);
  assert.deepEqual(M.parseDates({ dates: [{ modis_date: 'A2026297' }, { modis_date: 'A2026297' }] }).length, 1);
  for (const bad of [null, undefined, 'x', 7, {}, { dates: 'x' }]) assert.equal(M.parseDates(bad), null, String(bad));
  assert.deepEqual(M.parseDates({ dates: [] }), []);
});

/* =================== the answer of /subset =================== */

test('parseSubset: the two spellings of the answer (ORNL page and MODISTools)', () => {
  const docs = M.parseSubset(json('subset-MYD11A2-larnaka.json'));   // title, version, no scale
  const client = M.parseSubset(json('subset-MOD11A2-larnaka.json')); // tile, calendar_date, scale, units
  assert.equal(docs.nrows, 3); assert.equal(docs.ncols, 3); approx(docs.cellsize, 926.6254, 0.001);
  assert.equal(docs.items.length, 36); assert.equal(client.items.length, 36);   // 12 bands x 3 dates
  const lstDay = docs.items.find((i) => i.key === 'lstday1km' && i.date.code === 'A2026297');
  assert.equal(lstDay.band, 'LST_Day_1km'); assert.equal(lstDay.scale, null); assert.equal(lstDay.data.length, 9);
  const c = client.items.find((i) => i.key === 'lstday1km');
  assert.equal(c.scale, 0.02); assert.equal(c.units, 'Kelvin'); assert.equal(c.date.code, 'A2026281');
  // a date given only as calendar_date is understood too
  const only = M.parseSubset({ nrows: 1, ncols: 1, subset: [{ band: 'NDVI', data: [1], calendar_date: '2026-10-24' }] });
  assert.equal(only.items[0].date.code, 'A2026297');
});
test('parseSubset: odd answers never throw', () => {
  for (const bad of [null, undefined, 'x', 3, [], {}, { subset: 'x' }, { subset: {} }]) assert.equal(M.parseSubset(bad), null, String(bad));
  const p = M.parseSubset({ nrows: '3', ncols: 3, subset: [
    { band: 'A', data: [1, 2], modis_date: 'A2026297' },                 // fine
    { band: 'B', data: [], modis_date: 'A2026297' },                      // no data: skipped
    { band: 'C', data: [1], modis_date: 'nonsense' },                     // no date: skipped
    { band: '', data: [1], modis_date: 'A2026297' },                      // no band name: skipped
    { band: 'D', data: new Array(6000).fill(1), modis_date: 'A2026297' }, // far too many pixels: skipped
    { band: 'E', data: ['7', null, 'x', '', true, 2.5], modis_date: 'A2026297' },
    null, 'x',
  ] });
  assert.deepEqual(p.items.map((i) => i.band), ['A', 'E']);
  assert.deepEqual(p.items[1].data, [7, null, null, null, null, 2.5]);   // strings become numbers, rubbish becomes null
  assert.equal(p.nrows, 3);
});
test('bandKey and windowOf', () => {
  assert.equal(M.bandKey('LST_Day_1km'), 'lstday1km'); assert.equal(M.bandKey('250m_16_days_NDVI'), '250m16daysndvi'); assert.equal(M.bandKey('500 m 16 days pixel reliability'), '500m16dayspixelreliability');
  let w = M.windowOf(9, 3, 3); assert.equal(w.centre, 4); assert.deepEqual(w.block, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  w = M.windowOf(81, 9, 9); assert.equal(w.centre, 40); assert.deepEqual(w.block, [30, 31, 32, 39, 40, 41, 48, 49, 50]);
  w = M.windowOf(25, 5, 5); assert.equal(w.centre, 12); assert.deepEqual(w.block, [6, 7, 8, 11, 12, 13, 16, 17, 18]);
  w = M.windowOf(81, null, null); assert.equal(w.centre, 40);              // dimensions missing: a square is recognised
  w = M.windowOf(1, 1, 1); assert.deepEqual(w.block, [0]);
  w = M.windowOf(15, 3, 5); assert.equal(w.centre, 7); assert.deepEqual(w.block, [1, 2, 3, 6, 7, 8, 11, 12, 13]);   // not square but odd
  assert.equal(M.windowOf(16, 4, 4), null);   // even: no centre cell
  assert.equal(M.windowOf(9, 3, 4), null);    // does not match the data length
  assert.equal(M.windowOf(10, null, null), null);
});

/* =================== quality flags =================== */

test('lstQa: every bit pattern that matters', () => {
  const t = (qc, want) => { const q = M.lstQa(qc); for (const [k, v] of Object.entries(want)) assert.equal(q[k], v, `qc ${qc}: ${k}`); };
  t(0, { mandatory: 0, lstError: 0, usable: true, good: true, cloud: false });
  t(64, { lstError: 1, usable: true, good: true });                            // error up to 2 K
  t(128, { lstError: 2, usable: true, good: false });                          // error up to 3 K: used, not "good"
  t(192, { lstError: 3, usable: false });                                      // error above 3 K: refused
  t(1, { mandatory: 1, usable: true, good: false });                           // produced, other quality
  t(65, { mandatory: 1, lstError: 1, usable: true, good: false });
  t(193, { mandatory: 1, lstError: 3, usable: false });
  t(2, { mandatory: 2, usable: false, cloud: true });                          // not produced because of cloud
  t(3, { mandatory: 3, usable: false, cloud: false });                         // not produced for another reason (water)
  t(255, { usable: false });
  t(4 | 16, { dataQuality: 1, emissivityError: 1, usable: true });             // other bits do not decide
  for (const bad of [-1, 256, 1.5, null, undefined, 'x', '']) assert.equal(M.lstQa(bad), null, String(bad));
  assert.equal(M.lstQa('64').good, true);   // a number as text is fine
});
test('viQa: every bit pattern that matters', () => {
  const t = (w, want) => { const q = M.viQa(w); for (const [k, v] of Object.entries(want)) assert.equal(q[k], v, `word ${w}: ${k}`); };
  t(2112, { modland: 0, useful: 0, bad: false, good: true });                  // land, good, low aerosol
  t(2113, { modland: 1, bad: false, good: false });                            // produced, check other QA: used, not "good"
  t(2114, { modland: 2, bad: true });                                          // probably cloudy
  t(2115, { modland: 3, bad: true });
  t(2112 + (12 << 2), { useful: 12, bad: false });                             // lowest usable
  t(2112 + (13 << 2), { useful: 13, bad: true });                              // so low it is not useful
  t(2112 + (15 << 2), { useful: 15, bad: true });
  t(2112 + 256, { adjacentCloud: 1, bad: false, good: false });                // next to a cloud: used, not "good"
  t(2112 + 1024, { mixedClouds: 1, bad: true });
  t(2112 + 16384, { snow: 1, bad: true });
  t(2112 + 32768, { shadow: 1, bad: true });
  t(32768, { shadow: 1, bad: true });
  assert.equal(M.viQa(-32768).shadow, 1);                                      // a signed reading is folded back
  for (const bad of [65535, -1, 65536, 1.5, null, undefined, 'x', -40000]) assert.equal(M.viQa(bad), null, String(bad));
});

/* =================== decoding pixels =================== */

const lstT = createLst._t, ndviT = createNdvi._t;
test('LST decodePixel: scale 0.02, kelvin to Celsius, fill values, cloud flags, out-of-range', () => {
  const range = [-10, 80];
  let p = lstT.decodePixel(15200, 0, range); assert.equal(p.ok, true); approx(p.c, 304.0 - 273.15, 1e-9); assert.equal(p.good, true);
  p = lstT.decodePixel(15200, 65, range); assert.equal(p.ok, true); assert.equal(p.good, false);
  assert.equal(lstT.decodePixel(0, 3, range).why, 'fill');                  // 0 is the fill value
  assert.equal(lstT.decodePixel(0, 0, range).why, 'fill');
  assert.equal(lstT.decodePixel(7499, 0, range).why, 'fill');               // under the valid range of 7500
  assert.equal(lstT.decodePixel(null, 0, range).why, 'fill');
  assert.equal(lstT.decodePixel(15200, 2, range).why, 'cloud');             // a plausible number, but the flag says cloud
  assert.equal(lstT.decodePixel(15200, 3, range).why, 'quality');           // not produced for another reason
  assert.equal(lstT.decodePixel(15200, 193, range).why, 'quality');         // error class 3 K or more
  assert.equal(lstT.decodePixel(15200, null, range).why, 'noqa');           // no quality byte: cannot be trusted
  assert.equal(lstT.decodePixel(65535, 0, range).why, 'range');             // the top of the valid range is 1310 K: not a temperature
  assert.equal(lstT.decodePixel(20000, 0, range).why, 'range');             // 126 Celsius
  assert.equal(lstT.decodePixel(Math.round((263.15 - 0.05) / 0.02), 0, range).why, 'range');   // just under -10 Celsius
  assert.equal(lstT.decodePixel(Math.floor(353.15 / 0.02), 0, range).ok, true);                // 79.99 Celsius is allowed
  assert.equal(lstT.decodePixel(Math.round(353.35 / 0.02), 0, range).why, 'range');
});
test('NDVI decodePixel: scale 0.0001, fill -3000 and -15000, reliability, VI Quality', () => {
  const range = [-0.2, 1];
  let p = ndviT.decodePixel(2400, 0, 2112, range); assert.equal(p.ok, true); approx(p.v, 0.24, 1e-12); assert.equal(p.good, true);
  p = ndviT.decodePixel(2500, 1, 2113, range); assert.equal(p.ok, true); assert.equal(p.good, false);
  assert.equal(ndviT.decodePixel(-3000, -1, 65535, range).why, 'fill');         // MODIS fill
  assert.equal(ndviT.decodePixel(-15000, -1, 65535, range).why, 'fill');        // VIIRS fill
  assert.equal(ndviT.decodePixel(9000, 3, 2112, range).why, 'flagged');         // very green, but MODIS says cloudy
  assert.equal(ndviT.decodePixel(9000, 2, 2112, range).why, 'flagged');         // snow/ice
  assert.equal(ndviT.decodePixel(3000, 1, 2112 + 16384, range).why, 'flagged'); // VI Quality: possible snow
  assert.equal(ndviT.decodePixel(3000, 0, 2114, range).why, 'flagged');         // VI Quality: probably cloudy
  for (const r of [3, 4, 5, 6, 7, 8, 9, 10, 11, -1, -4]) assert.equal(ndviT.decodePixel(3000, r, 2112, range).why, 'flagged', 'reliability ' + r);
  assert.equal(ndviT.decodePixel(12000, 0, 2112, range).why, 'range');
  assert.equal(ndviT.decodePixel(10001, 0, 2112, range).why, 'range');
  assert.equal(ndviT.decodePixel(10000, 0, 2112, range).ok, true);              // 1.0 is the top
  assert.equal(ndviT.decodePixel(-2000, 0, 2112, range).ok, true);              // -0.2 is the bottom
  assert.equal(ndviT.decodePixel(-2001, 0, 2112, range).why, 'fill');
  assert.equal(ndviT.decodePixel(3000, 0, null, range).ok, true);               // reliability alone is enough
  assert.equal(ndviT.decodePixel(3000, null, 2112, range).ok, true);            // VI Quality alone is enough
  assert.equal(ndviT.decodePixel(3000, null, 65535, range).why, 'noqa');        // neither: not trusted
  assert.equal(ndviT.decodePixel(3000, null, null, range).why, 'noqa');
});

/* =================== one city, one composite =================== */

const itemsOf = (file, code) => { const p = M.parseSubset(json(file)); return { items: p.items.filter((i) => i.date.code === code), grid: p }; };
const noop = () => {};
test('LST summarise, Larnaka Aqua day: 2 fill, 1 cloud, 1 error class, 5 usable, centre among them', () => {
  const { items, grid } = itemsOf('subset-MYD11A2-larnaka.json', 'A2026297');
  const s = lstT.summarise(items, grid, [-10, 80], noop);
  const usedDn = [15200, 15250, 15150, 15300, 15100];   // pixels 4 to 8 of the fixture (pixel 4 is the centre)
  assert.equal(s.day.n, 5); assert.equal(s.day.of, 9); assert.equal(s.day.basis, 'mean');
  approx(s.day.value, mean(usedDn.map(kToC)), 0.006, 'mean');
  approx(s.day.centre, kToC(15200), 0.006, 'centre');
  approx(s.day.min, kToC(15100), 0.006); approx(s.day.max, kToC(15300), 0.006);
  assert.deepEqual(s.day.rej, { fill: 2, cloud: 1, quality: 1, range: 0, noqa: 0 });
  assert.equal(s.day.good, false);                                       // two used pixels are "other quality" or 2-3 K
  approx(s.day.timeH, mean([136, 135, 137, 138, 136]) / 10, 0.006, 'view time (hours x 10 in the file)');
  assert.equal(s.day.clear, 6);                                          // 0b00111111 has six bits set
  // the night: nine good pixels
  const nightDn = [14550, 14580, 14600, 14590, 14600, 14610, 14620, 14570, 14560];
  assert.equal(s.night.n, 9); approx(s.night.value, mean(nightDn.map(kToC)), 0.006); approx(s.night.centre, kToC(14600), 0.006);
  assert.equal(s.night.good, true); assert.equal(s.night.clear, 5); approx(s.night.timeH, 1.5, 0.006);
});
test('LST summarise: a value of 65535, a missing centre, an all-cloud composite, too few pixels', () => {
  const lefk = itemsOf('subset-MYD11A2-lefkosia.json', 'A2026297');
  let s = lstT.summarise(lefk.items, lefk.grid, [-10, 80], noop);
  const dn = lefk.items.find((i) => i.key === 'lstday1km').data;
  assert.equal(dn[8], 65535); assert.equal(s.day.n, 8); assert.equal(s.day.rej.range, 1);
  approx(s.day.value, mean(dn.slice(0, 8).map(kToC)), 0.006);
  const lim = itemsOf('subset-MYD11A2-limassol.json', 'A2026297');
  s = lstT.summarise(lim.items, lim.grid, [-10, 80], noop);
  assert.equal(s.day.n, 8); assert.equal(s.day.centre, null); assert.equal(s.day.basis, 'mean');   // the centre is fill; the block still has a mean
  const pap = itemsOf('subset-MYD11A2-paphos.json', 'A2026297');
  s = lstT.summarise(pap.items, pap.grid, [-10, 80], noop);
  assert.equal(s.day.value, null); assert.equal(s.day.n, 0); assert.equal(s.day.rej.cloud, 9); assert.ok(s.night.value != null);
  const lefT = itemsOf('subset-MOD11A2-lefkosia.json', 'A2026297');
  s = lstT.summarise(lefT.items, lefT.grid, [-10, 80], noop);
  assert.equal(s.day.n, 3); assert.equal(s.day.basis, 'centre'); approx(s.day.value, 303.5 - 273.15, 0.006);   // fewer than 4: the centre alone
  const papT = itemsOf('subset-MOD11A2-paphos.json', 'A2026297');
  s = lstT.summarise(papT.items, papT.grid, [-10, 80], noop);
  assert.equal(s.day.n, 2); assert.equal(s.day.value, null);   // 2 usable pixels and the centre is not one of them
});
test('LST summarise: odd answers give a plain error, a wrong scale is logged and the documented one is used', () => {
  const { items, grid } = itemsOf('subset-MYD11A2-larnaka.json', 'A2026297');
  assert.throws(() => lstT.summarise(items.filter((i) => !/^lst/.test(i.key)), grid, [-10, 80], noop), /no band named like LST_Day_1km.*bands seen: QC_Day/);
  assert.throws(() => lstT.summarise(items, { ...grid, nrows: 4, ncols: 4 }, [-10, 80], noop), /unexpected shape/);
  assert.throws(() => lstT.summarise([], grid, [-10, 80], noop), /bands seen: none/);
  const logs = [];
  const skewed = items.map((i) => (i.key === 'lstday1km' ? { ...i, scale: 0.01 } : i));
  const s = lstT.summarise(skewed, grid, [-10, 80], (m) => logs.push(m));
  approx(s.day.centre, kToC(15200), 0.006);   // still decoded with 0.02
  assert.equal(logs.length, 1); assert.match(logs[0], /scale 0.01.*documented 0.02/);
  // no QC band at all: nothing can be trusted
  const noQc = lstT.summarise(items.filter((i) => !/^qc/.test(i.key)), grid, [-10, 80], noop);
  assert.equal(noQc.day.value, null); assert.equal(noQc.day.rej.noqa, 7); assert.equal(noQc.day.rej.fill, 2);   // the two fill pixels are named first
});
test('NDVI summarise, Larnaka Terra: fill, cloudy, snow, out of range, 5 usable', () => {
  const { items, grid } = itemsOf('subset-MOD13Q1-larnaka.json', 'A2026289');
  const s = ndviT.summarise(items, grid, [-0.2, 1], noop);
  assert.equal(s.n, 5); assert.equal(s.of, 9); assert.equal(s.basis, 'mean');
  approx(s.value, mean([2400, 2500, 2300, 2600, 2200]) * 1e-4, 1e-9, 'mean');    // 0.24
  approx(s.centre, 0.23, 1e-9); approx(s.min, 0.22, 1e-9); approx(s.max, 0.26, 1e-9);
  assert.deepEqual(s.rej, { fill: 1, flagged: 2, range: 1, noqa: 0 });
  assert.equal(s.good, false);                    // one used pixel has reliability 1
});
test('NDVI summarise, Limassol VIIRS (5 x 5 grid, -15000 fill, VIIRS reliability codes)', () => {
  const { items, grid } = itemsOf('subset-VNP13A1-limassol.json', 'A2026289');
  assert.equal(grid.nrows, 5);
  const s = ndviT.summarise(items, grid, [-0.2, 1], noop);
  assert.equal(s.n, 6); approx(s.value, 0.32, 1e-9); approx(s.centre, 0.32, 1e-9);
  assert.deepEqual(s.rej, { fill: 1, flagged: 2, range: 0, noqa: 0 });   // reliability 3 (marginal) and 9 (cloud) are not used
});
test('NDVI summarise: odd answers give a plain error', () => {
  const { items, grid } = itemsOf('subset-MOD13Q1-larnaka.json', 'A2026289');
  assert.throws(() => ndviT.summarise(items.filter((i) => !/ndvi$/.test(i.key)), grid, [-0.2, 1], noop), /no band named like NDVI.*bands seen/);
  assert.throws(() => ndviT.summarise(items.filter((i) => !/pixelreliability$|viquality$/.test(i.key)), grid, [-0.2, 1], noop), /neither a pixel reliability nor a VI Quality/);
  assert.throws(() => ndviT.summarise(items, { ...grid, nrows: 8, ncols: 8 }, [-0.2, 1], noop), /unexpected shape/);
  // with only the VI Quality band the cloud bits still protect
  const onlyViq = ndviT.summarise(items.filter((i) => !/pixelreliability$/.test(i.key)), grid, [-0.2, 1], noop);
  assert.ok(onlyViq.n >= 1 && onlyViq.n <= 7);
  // a service that reports the HDF divisor 10000 as the scale: logged, the multiplier 0.0001 is used
  const logs = [];
  const s = ndviT.summarise(items.map((i) => (/ndvi$/.test(i.key) ? { ...i, scale: 10000 } : i)), grid, [-0.2, 1], (m) => logs.push(m));
  approx(s.centre, 0.23, 1e-9); assert.equal(logs.length, 1);
});

/* =================== the words =================== */

const ALL_CITIES = Object.keys(CITIES);
const noEmoji = (t) => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t);
const greek = (t) => /[Ͱ-Ͽ]/.test(t);
function checkWords(r, where) {
  for (const k of ['where', 'whereEl', 'note', 'noteEl']) { assert.equal(typeof r[k], 'string', `${where} ${k}`); assert.ok(r[k].length > 20, `${where} ${k} is not empty`); assert.ok(noEmoji(r[k])); }
  assert.ok(r.note.length <= 390 && r.noteEl.length <= 390, `${where}: notes fit the registry's 400 characters (${r.note.length}/${r.noteEl.length})`);
  assert.ok(r.where.length <= 400 && r.whereEl.length <= 400);
  assert.ok(greek(r.whereEl) && greek(r.noteEl), `${where}: Greek text is Greek`);
  assert.ok(!greek(r.where) && !greek(r.note), `${where}: English text is English`);
  assert.ok(/[.]$/.test(r.note) && /[.]$/.test(r.noteEl), `${where}: notes end in a full sentence`);
}

test('the client waits between two calls (1.5 s by default) and is gentler or faster through SATELLITE_MODIS_GAP_MS', async () => {
  const { ctx, calls } = newCtx('modis-lst');
  const slow = M.createClient({ ...ctx, env: {} }, {});   // the default pause
  const t0 = Date.now();
  await slow.dates('MYD11A2', 34.9229, 33.6233); await slow.dates('MYD11A2', 34.9229, 33.6233); await slow.dates('MYD11A2', 34.9229, 33.6233);
  const dt = Date.now() - t0;
  assert.ok(dt >= 2900 && dt < 6000, 'three calls take about two pauses: ' + dt + ' ms');
  assert.equal(calls.length, 3);
  slow.close();
  await assert.rejects(() => slow.dates('MYD11A2', 1, 1), /stopped/);
  assert.throws(() => M.createClient(ctx, {}).dates('bad product', 1, 1) || (() => { throw new Error('x'); })(), /./);   // a bad product name never reaches the network
  ctx.cleanup();
}, 30000);

/* =================== the LST feed, end to end =================== */

test('LST feed: one refresh asks politely, then probe and read answer from what was kept', async () => {
  const { ctx, calls } = newCtx('modis-lst');
  const feed = createLst(ctx);
  assert.equal(feed.id, 'modis-lst'); assert.deepEqual(feed.hosts, ['modis.ornl.gov']);
  assert.deepEqual(feed.read('larnaka'), []);                               // nothing yet
  let p = feed.probe(); assert.equal(p.ok, false); assert.match(p.note, /waiting for the first answer/); assert.ok(greek(p.noteEl));
  const r = await feed.refresh();
  assert.equal(r.bad, 0); assert.equal(r.ok, 8);                            // 2 products x 4 cities
  assert.equal(calls.filter((u) => /\/dates\?/.test(u)).length, 2); assert.equal(calls.filter((u) => /\/subset\?/.test(u)).length, 8);
  assert.ok(calls.every((u) => u.startsWith('https://modis.ornl.gov/rst/api/v1/')));
  assert.ok(calls.filter((u) => /\/subset\?/.test(u)).every((u) => /startDate=A2026281&endDate=A2026297/.test(u)));
  assert.ok(calls.some((u) => /MYD11A2\/subset\?latitude=34\.9229&longitude=33\.6233&/.test(u)), 'coordinates have four decimals');
  assert.equal(ctx.logs.length, 0);
  p = feed.probe();
  assert.equal(p.ok, true); assert.equal(p.n, 4); assert.equal(p.at, D(2026, 10, 28)); assert.match(p.note, /4 of 4 cities.*8-day period 24-31 Oct 2026 \(Aqua\)/); assert.ok(greek(p.noteEl));
  ctx.cleanup();
}, 60000);

test('LST feed: Larnaka readings (units, order, time, honest words)', async () => {
  const { ctx } = newCtx('modis-lst'); const feed = createLst(ctx); await feed.refresh();
  const rows = feed.read('larnaka');
  assert.equal(rows.length, 4);                                             // Aqua day, Terra day, Aqua night, Terra night
  assert.deepEqual(rows.map((r) => /Aqua/.test(r.where) + '-' + (/daytime/.test(r.where) ? 'day' : 'night')), ['true-day', 'false-day', 'true-night', 'false-night']);
  for (const r of rows) {
    assert.equal(r.variable, 'land_surface_temperature'); assert.equal(r.unit, 'Cel'); assert.equal(r.time, D(2026, 10, 28));   // the middle of 24-31 Oct
    assert.ok(Number.isFinite(r.value)); checkWords(r, r.where);
    assert.match(r.where, /not air temperature/); assert.match(r.whereEl, /όχι θερμοκρασία αέρα/);
    assert.match(r.note, /NOT the air temperature/); assert.match(r.noteEl, /ΟΧΙ θερμοκρασία αέρα/);
    assert.match(r.note, /Indicative/); assert.match(r.noteEl, /Ενδεικτικό/);
  }
  const aquaDay = rows[0];
  approx(aquaDay.value, mean([15200, 15250, 15150, 15300, 15100].map(kToC)), 0.06, 'Aqua day');   // the reading is rounded to 0.1
  assert.match(aquaDay.note, /Average of 5 clear pixels of a 3 x 3 block \(about 2\.8 km wide\) around the city centre; the centre pixel alone is \d\d\.\d °C\./);
  assert.match(aquaDay.note, /8-day period 24-31 Oct 2026, 6 of 8 days clear, seen about 13:38 solar time/);
  assert.match(aquaDay.noteEl, /Μέσος όρος 5 καθαρών εικονοστοιχείων σε μπλοκ 3 x 3 \(περίπου 2,8 km\) γύρω από το κέντρο· το κεντρικό μόνο \d\d,\d °C/);   // a decimal comma
  assert.match(aquaDay.noteEl, /Περίοδος 8 ημερών 24-31 Οκτ 2026, 6 από 8 ημέρες καθαρές, γύρω στις 13:38 ηλιακή ώρα/);
  assert.match(aquaDay.note, /lower quality/); assert.match(aquaDay.noteEl, /χαμηλότερης ποιότητας/);   // the day block has pixels of "other quality"
  const aquaNight = rows[2];
  approx(aquaNight.value, mean([14550, 14580, 14600, 14590, 14600, 14610, 14620, 14570, 14560].map(kToC)), 0.06, 'Aqua night');
  assert.match(aquaNight.note, /5 of 8 nights clear, seen about 01:30 solar time/); assert.doesNotMatch(aquaNight.note, /lower quality/);
  assert.ok(aquaDay.value > aquaNight.value + 8, 'the ground is hotter by day than by night');
  ctx.cleanup();
}, 60000);

test('LST feed: the cloudy city falls back one composite; one satellite alone; the centre pixel alone', async () => {
  const { ctx } = newCtx('modis-lst'); const feed = createLst(ctx); await feed.refresh();
  const pap = feed.read('paphos');
  const days = pap.filter((r) => /daytime/.test(r.where));
  assert.equal(days.length, 2);                                             // both satellites: the newest composite (24-31 Oct) has no usable day pixel, so each falls back to the one before
  assert.ok(days.every((r) => r.time === D(2026, 10, 20)));                 // A2026289 (16-23 Oct), the middle is 20 Oct
  assert.match(days[0].where, /Aqua/); assert.match(days[1].where, /Terra/);
  assert.match(days[0].note, /16-23 Oct 2026/); assert.match(days[0].noteEl, /16-23 Οκτ 2026/);
  assert.equal(pap.filter((r) => /night-time/.test(r.where)).length, 2);   // the nights are fine, newest composite
  assert.ok(pap.filter((r) => /night-time/.test(r.where)).every((r) => r.time === D(2026, 10, 28)));
  assert.ok(pap[0].time < pap[pap.length - 1].time && /daytime/.test(pap[0].where));   // the day values (older) come first, then the nights
  const lef = feed.read('lefkosia');
  const terraDay = lef.find((r) => /Terra/.test(r.where) && /daytime/.test(r.where));
  assert.match(terraDay.note, /One clear 1 km pixel at the city centre/); assert.doesNotMatch(terraDay.note, /Average of/);
  approx(terraDay.value, 303.5 - 273.15, 0.06);
  const lim = feed.read('limassol')[0];                                     // Aqua day, the centre pixel is fill: a block mean without a centre value
  assert.match(lim.note, /Average of 8 clear pixels/); assert.doesNotMatch(lim.note, /centre pixel alone/);
  assert.deepEqual(feed.read('nowhere'), []); assert.deepEqual(feed.read(undefined), []);
  ctx.cleanup();
}, 60000);

test('LST feed: a second refresh with nothing new asks only for the dates; a new composite asks only for itself', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-land-'));
  const a = newCtx('modis-lst', { dir }); const feed = createLst(a.ctx); await feed.refresh();
  const first = a.calls.length;
  const r2 = await feed.refresh();
  assert.equal(r2.bad, 0); assert.equal(a.calls.length - first, 2, 'two date lists, no subset');
  // a new composite appears
  const b = newCtx('modis-lst', { dir, next: true }); const feed2 = createLst(b.ctx);
  assert.equal(feed2.read('larnaka').length, 4, 'a fresh feed on the same folder starts from the kept data, with no network');
  const r3 = await feed2.refresh();
  assert.equal(r3.bad, 0);
  const subs = b.calls.filter((u) => /\/subset\?/.test(u));
  assert.equal(subs.length, 8); assert.ok(subs.every((u) => /startDate=A2026305&endDate=A2026305/.test(u)), 'only the new date is asked for');
  assert.equal(feed2.read('larnaka')[0].time, D(2026, 11, 5));              // A2026305 = 1-8 Nov, the middle is 5 Nov
  assert.equal(feed2.probe().at, D(2026, 11, 5));
  a.ctx.cleanup(); b.ctx.cleanup(); fs.rmSync(dir, { recursive: true, force: true });
}, 90000);

test('LST feed: the kept data survives a restart and no network (cache), and says when the refresh failed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-land-'));
  const a = newCtx('modis-lst', { dir }); await createLst(a.ctx).refresh();
  assert.ok(fs.existsSync(path.join(dir, 'state.json')));
  const down = newCtx('modis-lst', { dir, respond: () => reply(503, 'busy') });   // the service is down after the restart
  const feed = createLst(down.ctx);
  const rows = feed.read('lefkosia'); assert.ok(rows.length >= 3);          // the last good data is still shown, with its own old time
  assert.equal(rows[0].time, D(2026, 10, 28));
  let p = feed.probe(); assert.equal(p.ok, true); assert.doesNotMatch(p.note, /problem/);
  const r = await feed.refresh();
  assert.equal(r.ok, 0); assert.ok(r.bad >= 1);
  assert.equal(down.calls.length, 1, 'a 503 ends the round after one call: no hammering');
  assert.equal(down.ctx.logs.length, 1); assert.match(down.ctx.logs[0], /subset service gave 1 problem; first: modis\.ornl\.gov: HTTP 503/);
  assert.doesNotMatch(down.ctx.logs[0], /latitude|longitude|https?:/, 'no URL in a log line');
  p = feed.probe(); assert.equal(p.ok, true); assert.match(p.note, /the last refresh had a problem/); assert.match(p.noteEl, /η τελευταία ανανέωση είχε πρόβλημα/);
  assert.equal(feed.read('lefkosia').length, rows.length);
  a.ctx.cleanup(); down.ctx.cleanup(); fs.rmSync(dir, { recursive: true, force: true });
}, 90000);

test('LST feed: nothing works at all (no network, 404, rubbish): probe says so, read is empty, one log line per round, never a throw', async () => {
  for (const [name, respond, want] of [
    ['404 everywhere', () => reply(404, 'no'), /does not offer MYD11A2, MOD11A2 \(HTTP 404\)/],
    ['not JSON', () => reply(200, '<html>maintenance</html>', { 'content-type': 'text/html' }), /could not be read|parse|JSON|not valid/i],
    ['an object without dates', () => ({ error: 'nothing here' }), /list of dates is empty or not in the expected shape/],
    ['dates but a subset without bands', (p, kind) => (kind === 'subset' ? { nrows: 3, ncols: 3, subset: [{ band: 'Other_band', data: [1, 2, 3, 4, 5, 6, 7, 8, 9], modis_date: 'A2026297' }] } : undefined), /no band named like LST_Day_1km.*bands seen: Other_band/],
    ['a subset of another date', (p, kind) => (kind === 'subset' ? { nrows: 3, ncols: 3, subset: [{ band: 'LST_Day_1km', data: [1, 2, 3, 4, 5, 6, 7, 8, 9], modis_date: 'A2020001' }] } : undefined), /held none of the dates asked for/],
    ['a subset that is not one', (p, kind) => (kind === 'subset' ? { dates: [] } : undefined), /not a subset/],
  ]) {
    const { ctx, calls } = newCtx('modis-lst', { respond });
    const feed = createLst(ctx);
    const r = await feed.refresh();
    assert.equal(r.ok, 0, name); assert.ok(r.bad >= 1 || r.skipped.length >= 1, name);
    assert.ok(calls.length <= 4, `${name}: three failures in a row stop the round (${calls.length} calls)`);
    assert.equal(ctx.logs.length, 1, `${name}: ONE log line (${ctx.logs.join(' | ')})`); assert.match(ctx.logs[0], want, name);
    assert.doesNotMatch(ctx.logs[0], /https?:\/\//, name);
    const p = feed.probe(); assert.equal(p.ok, false, name); assert.equal(p.n, 0); assert.equal(p.at, null);
    assert.match(p.note, /^not available right now:/, name); assert.ok(greek(p.noteEl)); assert.ok(p.note.length <= 160);
    for (const c of ALL_CITIES) assert.deepEqual(feed.read(c), [], name);
    ctx.cleanup();
  }
}, 120000);

test('LST feed: 429 with Retry-After ends the round at once; a hanging service is cut off by the timeout', async () => {
  const a = newCtx('modis-lst', { respond: () => reply(429, 'slow down', { 'Retry-After': '120' }) });
  const feed = createLst(a.ctx); const r = await feed.refresh();
  assert.equal(a.calls.length, 1); assert.equal(r.ok, 0); assert.match(a.ctx.logs[0], /HTTP 429/);
  a.ctx.cleanup();
  const b = newCtx('modis-lst', { respond: () => reply(200, '{}', {}, { hang: true }) });
  const realGet = b.ctx.get; b.ctx.get = (url, o) => realGet(url, { ...o, timeoutMs: 150 });
  const f2 = createLst(b.ctx); const r2 = await f2.refresh();
  assert.equal(r2.ok, 0); assert.match(b.ctx.logs[0], /no answer within 150 ms/); assert.equal(f2.probe().ok, false);
  b.ctx.cleanup();
}, 60000);

test('LST feed: start schedules (unref) and asks nothing at once; stop is safe, twice', async () => {
  const { ctx, calls } = newCtx('modis-lst'); const feed = createLst(ctx);
  feed.start(); feed.start();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 0, 'the first fetch comes after a delay, never at start');
  feed.stop(); feed.stop();
  const r = await feed.refresh();   // a stopped feed does not go on asking
  assert.equal(calls.length, 0); assert.equal(r.ok, 0);
  ctx.cleanup();
});

/* =================== the NDVI feed, end to end =================== */

test('NDVI feed: the newest usable composite over three products wins', async () => {
  const { ctx, calls } = newCtx('modis-ndvi'); const feed = createNdvi(ctx);
  assert.equal(feed.id, 'modis-ndvi'); assert.deepEqual(feed.hosts, ['modis.ornl.gov']);
  const r = await feed.refresh();
  assert.equal(r.bad, 0); assert.equal(r.ok, 12);                           // 3 products x 4 cities
  assert.equal(calls.filter((u) => /\/dates\?/.test(u)).length, 3); assert.equal(calls.filter((u) => /\/subset\?/.test(u)).length, 12);
  assert.equal(ctx.logs.length, 0);
  // Larnaka: Aqua's newest is all cloud, Terra's (A2026289, 16-31 Oct) has a value, VIIRS ties with Terra and loses the tie
  let rows = feed.read('larnaka'); assert.equal(rows.length, 1);
  let x = rows[0]; assert.equal(x.variable, 'ndvi'); assert.equal(x.unit, '{NDVI}'); assert.equal(x.time, D(2026, 10, 24)); approx(x.value, 0.24, 1e-9);
  assert.match(x.where, /Terra satellite \(MOD13Q1\)/); assert.match(x.whereEl, /δορυφόρος Terra \(MOD13Q1\)/); checkWords(x, 'larnaka');
  assert.match(x.note, /Average of 5 clear pixels \(250 m each\) of a 3 x 3 block, about 700 m wide, around the city centre; the centre pixel alone is 0\.23\./);
  assert.match(x.note, /16-day period 16-31 Oct 2026\./); assert.match(x.note, /Not a tree count/);
  assert.match(x.noteEl, /το κεντρικό μόνο 0,23\./); assert.match(x.noteEl, /Περίοδος 16 ημερών 16-31 Οκτ 2026\./); assert.match(x.noteEl, /Δεν μετράει δέντρα/);
  // Lefkosia: everything is clear, Aqua's composite (24 Oct-8 Nov) is the newest
  x = feed.read('lefkosia')[0]; assert.equal(x.time, D(2026, 11, 1)); assert.match(x.where, /Aqua satellite \(MYD13Q1\)/); approx(x.value, 0.18, 0.045);
  // Limassol: both MODIS products are cloudy in their newest composite; VIIRS (500 m) is the newest with a value
  x = feed.read('limassol')[0]; assert.match(x.where, /Suomi NPP satellite \(VNP13A1\)/); approx(x.value, 0.32, 1e-9); assert.equal(x.time, D(2026, 10, 24));
  assert.match(x.note, /Average of 6 clear pixels \(500 m each\) of a 3 x 3 block, about 1\.4 km wide/); assert.match(x.noteEl, /περίπου 1,4 km/); checkWords(x, 'limassol');
  // the probe
  const p = feed.probe(); assert.equal(p.ok, true); assert.equal(p.n, 4); assert.equal(p.at, D(2026, 11, 1)); assert.match(p.note, /4 of 4 cities, newest 16-day period 24 Oct - 8 Nov 2026 \(MYD13Q1\)/);
  assert.deepEqual(feed.read('nowhere'), []);
  ctx.cleanup();
}, 90000);

test('NDVI feed: a product the service does not offer is skipped with one log line; the others carry on', async () => {
  const { ctx, calls } = newCtx('modis-ndvi', { missing: ['MYD13Q1'] }); const feed = createNdvi(ctx);
  const r = await feed.refresh();
  assert.equal(r.ok, 8); assert.equal(r.bad, 0); assert.deepEqual(r.skipped, ['MYD13Q1']);
  assert.equal(ctx.logs.length, 1); assert.match(ctx.logs[0], /does not offer MYD13Q1 \(HTTP 404\)/);
  assert.equal(calls.filter((u) => /MYD13Q1\/subset/.test(u)).length, 0, 'no subset call for a product without dates');
  const x = feed.read('lefkosia')[0]; assert.match(x.where, /MOD13Q1|VNP13A1/);
  const pr = feed.probe(); assert.equal(pr.ok, true); assert.doesNotMatch(pr.note, /problem/, 'a product that is not offered is not a problem while the others work');
  ctx.cleanup();
}, 90000);

test('NDVI feed: no data at all degrades the same way', async () => {
  const { ctx } = newCtx('modis-ndvi', { respond: () => reply(500, 'oops') }); const feed = createNdvi(ctx);
  const r = await feed.refresh(); assert.equal(r.ok, 0);
  const p = feed.probe(); assert.equal(p.ok, false); assert.match(p.note, /^not available right now: modis\.ornl\.gov: HTTP 500/);
  for (const c of ALL_CITIES) assert.deepEqual(feed.read(c), []);
  assert.equal(ctx.logs.length, 1);
  ctx.cleanup();
}, 60000);

/* =================== the descriptors and the vocabulary =================== */

test('descriptors: valid, in step with the vocabulary, with English and Greek', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'check-sources.js'), 'sources/modis-lst.json', 'sources/modis-ndvi.json', 'sources/land-surface-heat.json', 'sources/osm-green-space.json'], { cwd: ROOT }).toString();
  assert.match(out, /ok\s+modis-lst\.json\s+\(model, active\)/); assert.match(out, /ok\s+modis-ndvi\.json\s+\(model, active\)/); assert.match(out, /files are valid/); assert.doesNotMatch(out, /FAIL/);
  const vocab = json2(path.join(ROOT, 'vocab', 'variables.json'));
  for (const id of ['modis-lst', 'modis-ndvi']) {
    const src = json2(path.join(ROOT, 'sources', id + '.json'));
    assert.equal(src.status, 'active'); assert.equal(src.layer, 'model'); assert.equal(src.quality.kind, 'satellite');
    assert.equal(src.licence.checked_on, '2026-11-12'); assert.equal(src.licence.id, 'CC0-1.0'); assert.ok(src.licence.attribution && src.licence.attribution.length <= 160);
    assert.equal(src.access.auth.type, 'none'); assert.equal(src.access.auth.env, undefined, 'no key');
    assert.ok(src.i18n.el.name && src.i18n.el.summary && src.i18n.el.tagline && greek(src.i18n.el.summary));
    assert.ok(src.quality.known_issues.length >= 3 && src.quality.known_issues.some((t) => /area|pixel/i.test(t)));
    assert.ok(src.representativeness.scale_m > 0);
    for (const v of src.variables) { assert.equal(v.unit, vocab[v.id].unit); assert.ok(vocab[v.id].label[0] && greek(vocab[v.id].label[1])); assert.ok(vocab[v.id].explain && greek(vocab[v.id].explain[1])); }
  }
  assert.equal(json2(path.join(ROOT, 'sources', 'modis-lst.json')).variables[0].id, 'land_surface_temperature');
  assert.equal(json2(path.join(ROOT, 'sources', 'modis-ndvi.json')).variables[0].id, 'ndvi');
  // the vocabulary: the existing LST id and unit are kept, ndvi is new; the feeds' fallback ranges equal the vocabulary
  assert.equal(vocab.land_surface_temperature.unit, 'Cel'); assert.deepEqual(vocab.land_surface_temperature.range, [-10, 80]);
  assert.equal(vocab.land_surface_temperature.tolerance, null, 'a surface temperature is never "compared" with air temperature');
  assert.equal(vocab.ndvi.unit, '{NDVI}'); assert.deepEqual(vocab.ndvi.range, [-0.2, 1]); assert.equal(vocab.ndvi.tolerance.abs, 0.1);
  assert.match(vocab.land_surface_temperature.explain[0], /NOT the air temperature/); assert.match(vocab.land_surface_temperature.explain[1], /ΔΕΝ είναι η θερμοκρασία του αέρα/);
  assert.ok(/stale/.test(JSON.stringify(Object.keys(json2(path.join(ROOT, 'sources', 'modis-lst.json')).quality))));
  // a stale limit of at least two composite periods, so one missed composite is not "late"
  assert.equal(json2(path.join(ROOT, 'sources', 'modis-lst.json')).quality.stale_after, 'P24D'); assert.equal(json2(path.join(ROOT, 'sources', 'modis-ndvi.json')).quality.stale_after, 'P48D');
});
function json2(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }

test('land-surface-heat (the Sentinel candidate) no longer claims what is not true', () => {
  const s = json2(path.join(ROOT, 'sources', 'land-surface-heat.json'));
  assert.equal(s.status, 'candidate'); assert.notEqual(s.planned, true);
  assert.doesNotMatch(s.summary, /city blocks/i); assert.doesNotMatch(s.i18n.el.summary, /τετράγωνα/);
  assert.match(s.notes, /stac\.dataspace\.copernicus\.eu/); assert.match(s.notes, /account/i); assert.match(s.notes, /17 Nov(ember)? 2025/);
  assert.equal(s.access.url, 'https://stac.dataspace.copernicus.eu/v1/');
  assert.notEqual(s.access.auth.type, 'none');
  assert.notEqual(s.licence.id, 'unknown'); assert.match(s.licence.attribution, /Copernicus Sentinel data/);
});

/* =================== through the real registry and the Data layers code =================== */

function transportOf(fixtures) {
  const fn = Object.values(fixtures)[0];
  return async (url) => {
    const v = fn(url);
    if (v && v.status && v.body !== undefined) return new Response(v.body, { status: v.status, headers: v.headers || {} });
    return new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}
async function registry(o) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-land-reg-'));
  const feedsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-land-feeds-'));
  for (const f of ['modis-lst.js', 'modis-ndvi.js']) fs.symlinkSync(path.join(ROOT, 'satellite', 'feeds', f), path.join(feedsDir, f));
  const f = fakeOrnl(o);
  const lines = [];
  const sat = createSatellite({ root: ROOT, dataDir, feedsDir, log: (m) => lines.push(m), transport: transportOf(f.fixtures), now: () => NOW, env: { ...process.env, SATELLITE_MODIS_GAP_MS: '0' } });
  return { sat, lines, dataDir, feedsDir, calls: f.calls, done: () => { sat.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); fs.rmSync(feedsDir, { recursive: true, force: true }); } };
}
test('registry: both feeds load, the hosts are exactly modis.ornl.gov, readings pass the registry unchanged', async () => {
  const R = await registry();
  assert.deepEqual(R.sat.ids().sort(), ['modis-lst', 'modis-ndvi']);
  for (const id of ['modis-lst', 'modis-ndvi']) await R.sat._t.entries.get(id).feed.refresh();
  const st = await R.sat.status({ probe: true });
  for (const f of st.feeds) { assert.equal(f.state, 'ready'); assert.deepEqual(f.hosts, ['modis.ornl.gov']); assert.equal(f.needsKey, undefined); assert.ok(f.probe.ok, f.id + ' probe'); assert.equal(f.probe.n, 4); }
  const lst = await R.sat.read('modis-lst', 'larnaka'); assert.equal(lst.length, 4);
  for (const r of lst) { assert.deepEqual(Object.keys(r).sort(), ['note', 'noteEl', 'time', 'unit', 'value', 'variable', 'where', 'whereEl']); assert.ok(r.note.length <= 390); }
  const nd = await R.sat.read('modis-ndvi', 'paphos'); assert.equal(nd.length, 1); assert.equal(nd[0].unit, '{NDVI}');
  assert.equal(R.lines.filter((l) => /modis/.test(l)).length, 0, 'no log line when everything works');
  // a feed can only reach its own host
  const get = R.sat._t.entries.get('modis-lst').ctx.get;
  await assert.rejects(() => get('https://example.org/x'), /not on the feed's list/);
  await assert.rejects(() => get('http://modis.ornl.gov/rst/api/v1/products'), /only https/);
  R.done();
}, 120000);

test('Data layers: the evidence for the master brain keeps the words, the units, the age and the honest caveat', async () => {
  const R = await registry();
  for (const id of ['modis-lst', 'modis-ndvi']) await R.sat._t.entries.get(id).feed.refresh();
  const lines = [];
  const L = createLayers({ root: ROOT, dataDir: R.dataDir, satellite: R.sat, log: (m) => lines.push(m), data: { devices: () => [], latest: async () => ({}) } });
  const ev = await atNow(NOW, () => L._t.evidenceFor('larnaka', ['modis-lst', 'modis-ndvi']));
  const lstRows = ev.rows.filter((r) => r.source === 'modis-lst'), ndRows = ev.rows.filter((r) => r.source === 'modis-ndvi');
  assert.equal(lstRows.length, 4); assert.equal(ndRows.length, 1);
  for (const r of lstRows) { assert.equal(r.variable, 'land_surface_temperature'); assert.equal(r.unit, 'Cel'); assert.equal(r.kind, 'satellite'); assert.equal(r.env, 'outdoor'); assert.match(r.where, /not air temperature/); assert.equal(r.stale, false, 'a 15-day-old 8-day composite is not stale'); }
  assert.equal(ndRows[0].variable, 'ndvi'); assert.equal(ndRows[0].stale, false);
  assert.equal(ev.missing.length, 0);
  // the day value first (the brain shows the first row of a source)
  assert.match(lstRows[0].where, /daytime/);
  const cs = L._t.candidates('larnaka', ev);
  const single = cs.find((c) => c.id === 'single-land_surface_temperature');
  assert.ok(single, 'one candidate, never "agree" or "differ" with an air thermometer'); assert.equal(single.kind, 'single');
  assert.ok(single.caveats.some((t) => /describes an area/.test(t)));
  assert.ok(!cs.some((c) => c.kind === 'agree' || c.kind === 'differ'));
  const tpl = L._t.template(single, 'larnaka');
  assert.match(tpl.body.en, /Ground surface temperature|Ground heat from space/); assert.match(tpl.body.en, /\(satellite\)/); assert.match(tpl.body.el, /δορυφόρος/);
  R.done();
}, 120000);

test('Data layers: an old composite is marked stale (24 days for 8-day, 48 days for 16-day data), not hidden', async () => {
  const R = await registry();
  for (const id of ['modis-lst', 'modis-ndvi']) await R.sat._t.entries.get(id).feed.refresh();
  const lines = [];
  const L = createLayers({ root: ROOT, dataDir: R.dataDir, satellite: R.sat, log: (m) => lines.push(m), data: { devices: () => [], latest: async () => ({}) } });
  const realNow = Date.now;
  try {
    Date.now = () => D(2026, 12, 15);   // ~48 days after the middle of the newest 8-day period, 52 after the NDVI one
    const ev = await L._t.evidenceFor('larnaka', ['modis-lst', 'modis-ndvi']);
    assert.ok(ev.rows.length >= 5); assert.ok(ev.rows.every((r) => r.stale === true));
    Date.now = () => D(2026, 11, 20);   // 23 days after 28 Oct and 27 after 24 Oct: both inside their limit
    const ev2 = await L._t.evidenceFor('larnaka', ['modis-lst', 'modis-ndvi']);
    assert.ok(ev2.rows.every((r) => r.stale === false));
  } finally { Date.now = realNow; }
  R.done();
}, 120000);

test('Data layers card: both layers are live with the probe note, in a registry with the real sources', async () => {
  const R = await registry();
  for (const id of ['modis-lst', 'modis-ndvi']) await R.sat._t.entries.get(id).feed.refresh();
  const L = createLayers({ root: ROOT, dataDir: R.dataDir, satellite: R.sat, log: () => {}, data: { devices: () => [], latest: async () => ({}) } });
  const v = await atNow(NOW, () => L.register(8000));
  for (const id of ['modis-lst', 'modis-ndvi']) {
    const c = v.layers.find((x) => x.id === id);
    assert.ok(c, id); assert.equal(c.kind, 'satellite'); assert.equal(c.group, 'model'); assert.equal(c.licence, 'CC0-1.0');
    assert.ok(['live', 'late'].includes(c.state), `${id}: ${c.state}`); assert.equal(c.count, 4); assert.ok(c.note && greek(c.noteEl));
  }
  R.done();
}, 120000);

/* ---------- run ---------- */
(async () => {
  const keepAlive = setInterval(() => {}, 1000);   // the feeds' own timers are unref'd (a server must never be held up by them); the test run must not end while it waits for one
  let pass = 0, fail = 0;
  const only = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
  for (const t of tests) {
    if (only && !only.test(t.name)) continue;
    const t0 = Date.now();
    try { await t.fn(); pass++; console.log(`ok    ${t.name} (${Date.now() - t0} ms)`); }
    catch (e) { fail++; console.log(`FAIL  ${t.name}\n      ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n      ')}`); }
  }
  clearInterval(keepAlive);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
