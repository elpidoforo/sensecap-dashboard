'use strict';
/* The places the two fire feeds hand to the data stack, and the registry's guard around them. No network, no server.
   Run: node tests/stackdata/points_test.js */
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { createSatellite } = require(path.join(ROOT, 'satellite'));
const hotspots = require(path.join(ROOT, 'satellite', 'feeds', 'fire-hotspots'));
const burnt = require(path.join(ROOT, 'satellite', 'feeds', 'effis-burnt-areas'));
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), n));
const T = Date.UTC(2026, 7, 10, 12, 0, 0), HOUR = 3600000, DAY = 24 * HOUR;

(async () => {
  /* ---------- fire hotspots: exactly the hotspots of the last 24 hours ---------- */
  let dir = tmp('sd-fire-'), clock = T;
  const src = (dets) => ({ okAt: T - 60000, rows: dets.length, bad: 0, low: 0, dets });
  fs.writeFileSync(path.join(dir, 'last.json'), JSON.stringify({ v: 1, fetchedAt: T - 60000, sources: {
    VIIRS_NOAA21_NRT: src([[34.9, 33.1, T - 2 * HOUR, 'n'], [35.1, 32.6, T - 30 * HOUR, 'n']]),       // the second one is older than 24 hours
    VIIRS_NOAA20_NRT: src([[34.9005, 33.1005, T - 3 * HOUR, 'h']]),                                  // the same place again: one hotspot
    MODIS_NRT: src([[34.7, 32.5, T - 5 * HOUR, 'n']]),
  } }));
  let feed = hotspots({ id: 'fire-hotspots', dir, now: () => clock, env: { FIRMS_MAP_KEY: 'abcd1234efgh' }, log: () => {}, places: {}, get: async () => { throw new Error('no network in this test'); } });
  let got = feed.points();
  ok(got && got.at === T - 60000 && got.windowHours === 24 && got.points.length === 2, 'hotspots: two places from four detections (one repeat, one too old): ' + (got && got.points.length));
  ok(got.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.t <= T && Array.isArray(p.sats) && p.sats.length >= 1), 'hotspots: each place has a position, the time it was last seen and the satellites that saw it');
  ok(got.points.some((p) => p.sats.join() === 'NOAA-20,NOAA-21' || p.sats.join() === 'NOAA-21,NOAA-20'), 'hotspots: a place seen by two satellites names both');
  ok(!JSON.stringify(got).includes('abcd1234efgh'), 'hotspots: the key is nowhere in the answer');
  clock = T + 7 * HOUR;
  ok(feed.points() === null, 'hotspots: a list older than six hours gives nothing, not old points');
  feed = hotspots({ id: 'fire-hotspots', dir: tmp('sd-fire0-'), now: () => T, env: {}, log: () => {}, places: {}, get: async () => { throw new Error('no network'); } });
  ok(feed.points() === null, 'hotspots: without a key and without a saved list there are no points');

  /* ---------- burnt areas: the middle and the area of each perimeter of the last 30 days ---------- */
  dir = tmp('sd-effis-'); clock = T;
  fs.writeFileSync(path.join(dir, 'last.json'), JSON.stringify({ v: 1, fetchedAt: T - HOUR, features: 3, bad: 0, areas: [
    [34.85, 33.2, 120.5, T - 4 * DAY, T - 3 * DAY], [35.0, 32.7, 45, T - 29 * DAY, T - 29 * DAY], [34.9, 33.0, 300, T - 31 * DAY - HOUR, T - 31 * DAY - HOUR],
  ] }));
  feed = burnt({ id: 'effis-burnt-areas', dir, now: () => clock, env: {}, log: () => {}, places: {}, get: async () => { throw new Error('no network'); } });
  got = feed.points();
  ok(got && got.at === T - HOUR && got.windowDays === 30 && got.points.length === 2, 'burnt areas: two of three perimeters were updated in the last 30 days');
  ok(got.points[0].ha === 120.5 && got.points[0].lat === 34.85 && got.points[0].t0 < got.points[0].t1, 'burnt areas: hectares and both dates are passed on as they were saved');
  clock = T + 3 * DAY;
  ok(feed.points() === null, 'burnt areas: a list older than two days gives nothing');

  /* ---------- the registry: only clean points get through, and a feed that throws gives null ---------- */
  const feedsDir = tmp('sd-feeds-');
  const write = (name, body) => fs.writeFileSync(path.join(feedsDir, name + '.js'), `'use strict';\nmodule.exports = (ctx) => ({ id: ctx.id, hosts: ['example.org'], probe: () => ({ ok: true, n: 1, at: 1 }), read: () => [], ${body} });\n`);
  write('good', `points: () => ({ at: 1790000000000, windowHours: 24, late: ['A', 7], secret: { a: 1 }, points: [
    { lat: 34.9, lng: 33.1, t: 5, name: 'x'.repeat(200), sats: ['NOAA-21', 3, 'y'.repeat(99)], nested: { a: 1 }, fn: () => 1, 'bad key': 1, nan: NaN },
    { lat: 'x', lng: 33 }, { lat: 91, lng: 33 }, null, { lat: 35, lng: 33.5 } ] })`);
  write('thrower', `points: () => { throw new Error('boom at /home/somebody/secret/file.js'); }`);
  write('silent', `points: () => null`);
  write('plain', `images: () => []`);
  const lines = [];
  const reg = createSatellite({ root: ROOT, dataDir: tmp('sd-reg-'), feedsDir, guardProcess: false, log: (m) => lines.push(m) });
  got = await reg.points('good');
  ok(got && got.at === 1790000000000 && got.windowHours === 24 && got.late.join() === 'A' && got.secret === undefined, 'registry: the head keeps numbers and short lists of words only');
  ok(got.points.length === 2 && got.points[1].lat === 35, 'registry: a point without a real position is dropped (' + got.points.length + ' kept)');
  const p0 = got.points[0];
  ok(p0.t === 5 && p0.name.length === 40 && p0.sats.join('|') === 'NOAA-21|' + 'y'.repeat(40) && p0.nested === undefined && p0.fn === undefined && p0['bad key'] === undefined && p0.nan === undefined, 'registry: only numbers, short words and short lists of words stay on a point');
  ok((await reg.points('thrower')) === null && lines.some((l) => /points failed/.test(l) && !/somebody/.test(l)), 'registry: a feed that throws gives null and one log line without a path');
  ok((await reg.points('silent')) === null && (await reg.points('plain')) === null && (await reg.points('nosuch')) === null, 'registry: nothing fresh, no points() and an unknown feed all give null');
  const off = createSatellite({ root: ROOT, dataDir: tmp('sd-off-'), feedsDir, off: true, offReason: 'test mode', guardProcess: false, log: () => {} });
  ok((await off.points('good')) === null, 'registry: a switched-off registry gives no points');

  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
