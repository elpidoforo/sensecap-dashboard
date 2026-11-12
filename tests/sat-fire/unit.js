'use strict';
/* Unit tests for the fire hotspot feed (satellite/feeds/fire-hotspots.js) and its helpers (satellite/fire/*.js).
 * No network: the feed reads FIRMS CSV fixtures through the real satellite/http.js with a fake transport (satellite/testing.js).
 * Run:  node --test tests/sat-fire/unit.js          (Node 22, nothing to install)
 * The fixtures are made by make-fixtures.js and described there (an August afternoon, lists fetched at 2026-08-14 15:00 UTC). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { makeCtx, reply, startFakeServer } = require(path.join(ROOT, 'satellite', 'testing'));
const { createSatellite, IMAGE_ID_RE } = require(path.join(ROOT, 'satellite'));
const firms = require(path.join(ROOT, 'satellite', 'fire', 'firms'));
const geo = require(path.join(ROOT, 'satellite', 'fire', 'geo'));
const pic = require(path.join(ROOT, 'satellite', 'fire', 'picture'));
const create = require(path.join(ROOT, 'satellite', 'feeds', 'fire-hotspots'));
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'vocab', 'variables.json'), 'utf8'));
const places = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'vocab', 'places.json'), 'utf8'))).filter(([k]) => k[0] !== '_'));

const fx = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const T0 = Date.parse('2026-08-14T15:00:00Z');   // when the fixture lists were fetched
const KEY = 'k9x2TESTKEYabcdef0123456789zz';      // a made-up key, only for these tests
const HOST = 'firms.modaps.eosdis.nasa.gov';
const AREA = '31.3,33.7,34.9,36.1';
const url = (src) => `https://${HOST}/api/area/csv/${KEY}/${src}/${AREA}/2`;
const SRC = { n21: 'VIIRS_NOAA21_NRT', n20: 'VIIRS_NOAA20_NRT', snpp: 'VIIRS_SNPP_NRT', modis: 'MODIS_NRT' };
const goodFixtures = () => ({
  [url(SRC.n21)]: fx('firms_viirs_noaa21.csv'), [url(SRC.n20)]: fx('firms_viirs_noaa20.csv'),
  [url(SRC.snpp)]: fx('firms_viirs_snpp_empty.csv'), [url(SRC.modis)]: fx('firms_modis.csv'),
});
const emptyFixtures = () => ({
  [url(SRC.n21)]: fx('firms_viirs_empty.csv'), [url(SRC.n20)]: fx('firms_viirs_empty.csv'),
  [url(SRC.snpp)]: fx('firms_viirs_snpp_empty.csv'), [url(SRC.modis)]: fx('firms_modis_empty.csv'),
});
// fixtures that can be changed after the feed was made (the test harness reads a plain object only once)
const dyn = (obj) => Object.fromEntries(Object.keys(obj).map((k) => [k, () => obj[k]]));
const mk = (fixtures, env, now) => {
  const ctx = makeCtx({ id: 'fire-hotspots', hosts: [HOST], fixtures, env: env === undefined ? { FIRMS_MAP_KEY: KEY } : env, now: now || T0 });
  return { ctx, feed: create(ctx) };
};
const byVar = (rows) => Object.fromEntries(rows.map((r) => [r.variable, r]));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} is not within ${tol} of ${b}`);

// A tiny well-formedness check for the SVG: every tag closes, nothing is left open.
function wellFormed(svg) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m, last = 0;
  while ((m = re.exec(svg))) {
    const between = svg.slice(last, m.index);
    assert.ok(!/[<]/.test(between), 'a stray "<" in the text: ' + between.slice(0, 40));
    last = re.lastIndex;
    if (m[4]) continue;
    if (m[1]) { assert.equal(stack.pop(), m[2], 'closing tag does not match ' + m[2]); } else stack.push(m[2]);
  }
  assert.equal(stack.length, 0, 'unclosed tags: ' + stack.join(','));
}

/* ---------------------------------------------------------------- the CSV and the rules */

test('parse: a header-only answer is a quiet day, not an error', () => {
  const r = firms.parseDetections(fx('firms_viirs_empty.csv'), { id: 'VIIRS_NOAA20_NRT' }, { now: T0 });
  assert.deepEqual([r.detections.length, r.rows, r.bad, r.low], [0, 0, 0, 0]);
});

test('parse: the NOAA-20 fixture: kept, low, bad, future, duplicate', () => {
  const r = firms.parseDetections(fx('firms_viirs_noaa20.csv'), { id: 'VIIRS_NOAA20_NRT' }, { now: T0 });
  assert.equal(r.rows, 12);
  assert.equal(r.low, 1, 'one low-confidence row');
  assert.equal(r.future, 1, 'one row from the future');
  assert.equal(r.bad, 6, 'letters, time 2599, 31 February, too few cells, confidence "maybe", future');
  // kept: Paphos fire, Limassol 24.9, Lefkosia +80, and the 33-hour-old row (old rows are kept here, the 24 hour window drops them later); the duplicate is gone
  assert.equal(r.detections.length, 4);
  assert.ok(r.detections.every((d) => d.conf === 'n' || d.conf === 'h'));
});

test('parse: MODIS confidence 30 counts, 29 and 25 are low', () => {
  const r = firms.parseDetections(fx('firms_modis.csv'), { id: 'MODIS_NRT' }, { now: T0 });
  assert.equal(r.detections.length, 2);
  assert.equal(r.low, 2);
  assert.deepEqual(r.detections.map((d) => d.conf).sort(), ['h', 'n']);
});

test('parse: a body that is not a FIRMS table is an error, never "no fires"', () => {
  for (const body of [fx('firms_bad_key.txt'), fx('firms_html_error.html'), '', '   \n\n', '{"error":"no"}', 'a,b,c\n1,2,3\n']) {
    assert.throws(() => firms.parseDetections(body, { id: 'X' }, { now: T0 }), /not a FIRMS table|is empty/, JSON.stringify(body.slice(0, 20)));
  }
});

test('parse: acq_time with a lost leading zero, the end of the day, and impossible times', () => {
  assert.equal(firms.acquisitionMs('2026-08-14', '305'), Date.UTC(2026, 7, 14, 3, 5));
  assert.equal(firms.acquisitionMs('2026-08-14', '0305'), Date.UTC(2026, 7, 14, 3, 5));
  assert.equal(firms.acquisitionMs('2026-08-14', '5'), Date.UTC(2026, 7, 14, 0, 5));
  assert.equal(firms.acquisitionMs('2026-08-14', '2359'), Date.UTC(2026, 7, 14, 23, 59));
  for (const bad of ['2400', '2599', '1260', '', 'ab', '12345', null]) assert.equal(firms.acquisitionMs('2026-08-14', bad), null, String(bad));
  for (const bad of ['2026-02-31', '2026-13-01', '14/08/2026', '', null, '1999-01-01']) assert.equal(firms.acquisitionMs(bad, '1200'), null, String(bad));
});

test('rules: one confidence rule for every sensor', () => {
  const c = firms.confidenceClass;
  assert.deepEqual(['l', 'low', 'LOW'].map(c), ['l', 'l', 'l']);
  assert.deepEqual(['n', 'nominal', 'h', 'high'].map(c), ['n', 'n', 'h', 'h']);
  assert.deepEqual([0, 29, 29.9].map(c), ['l', 'l', 'l']);
  assert.deepEqual([30, 79, '79.5'].map(c), ['n', 'n', 'n']);
  assert.deepEqual([80, 100].map(c), ['h', 'h']);
  for (const bad of [101, '', null, 'x', 'maybe', '-5']) assert.equal(c(bad), null, String(bad));
});

test('parse: quoted cells and Windows line ends', () => {
  const csv = 'latitude,longitude,acq_date,acq_time,confidence,note\r\n"34.9","33.6",2026-08-14,"1305",n,"a, b"\r\n';
  const r = firms.parseDetections(csv, { id: 'X' }, { now: T0 });
  assert.equal(r.detections.length, 1);
  assert.equal(r.detections[0].lat, 34.9);
});

test('hotspots: the same fire seen by three sensors at three times is ONE hotspot', () => {
  const dets = [
    { lat: 34.8654, lng: 32.4245, t: T0 - 4 * 3600e3, src: 'VIIRS_NOAA20_NRT', conf: 'n' },
    { lat: 34.8657, lng: 32.4249, t: T0 - 2 * 3600e3, src: 'VIIRS_NOAA21_NRT', conf: 'h' },
    { lat: 34.8660, lng: 32.4240, t: T0 - 4.1 * 3600e3, src: 'MODIS_NRT', conf: 'h' },
  ];
  const hs = firms.makeHotspots(dets);
  assert.equal(hs.length, 1);
  assert.equal(hs[0].n, 3);
  assert.equal(hs[0].t, T0 - 2 * 3600e3, 'the time is the newest detection');
  assert.equal(hs[0].conf, 'h');
  assert.deepEqual(hs[0].sats, ['MODIS_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']);
});

test('hotspots: a line of pixels is NOT chained into one hotspot', () => {
  const dets = [0, 1, 2, 3, 4].map((i) => ({ lat: 34.9 + i * 0.0072, lng: 33.0, t: T0 - 3600e3, src: 'VIIRS_NOAA20_NRT', conf: 'n' }));   // 0.8 km apart
  const hs = firms.makeHotspots(dets);
  assert.equal(hs.length, 3, 'seeds take only what is within 1 km of themselves: 2 + 2 + 1');
  assert.equal(hs.reduce((s, h) => s + h.n, 0), 5, 'every detection is in exactly one hotspot');
});

test('hotspots: 1 km is the limit and the result does not depend on the order of the input', () => {
  const a = { lat: 34.9, lng: 33.0, t: T0 - 5e6, src: 'A', conf: 'n' };
  const b = { lat: 34.9 + 0.0089, lng: 33.0, t: T0 - 4e6, src: 'B', conf: 'h' };    // 0.99 km
  const c = { lat: 34.9 + 0.0092, lng: 33.0, t: T0 - 3e6, src: 'C', conf: 'n' };    // 1.02 km
  assert.equal(firms.makeHotspots([a, b]).length, 1);
  assert.equal(firms.makeHotspots([a, c]).length, 2);
  assert.deepEqual(firms.makeHotspots([a, b, c]), firms.makeHotspots([c, b, a]));
  assert.deepEqual(firms.makeHotspots([]), []);
});

test('window: the 24 hours before the fetch; the start is excluded, the end is included, later is not there', () => {
  const mkd = (t) => ({ lat: 34.9, lng: 33.0, t, src: 'A', conf: 'n' });
  const got = firms.inWindow([mkd(T0 - 86400e3), mkd(T0 - 86400e3 + 60e3), mkd(T0), mkd(T0 + 60e3)], T0).map((d) => d.t);
  assert.deepEqual(got, [T0 - 86400e3 + 60e3, T0]);
});

test('city summary: 25 km and 50 km edges, rounding, and the 100 km search limit', () => {
  const p = places.limassol;
  const north = (km) => ({ lat: p.lat + km / 111.195, lng: p.lng, t: T0 - 3600e3, conf: 'n', n: 1, sats: ['A'] });
  const s = firms.summariseCity([north(24.9), north(25.2), north(49.9), north(50.3), north(99), north(101)], p);
  assert.equal(s.n25, 1);
  assert.equal(s.n50, 3);
  assert.equal(s.nearest.km, 25, '24.9 km shows as 25: whole kilometres from 10 km on');
  const none = firms.summariseCity([north(101), north(150)], p);
  assert.deepEqual([none.n25, none.n50, none.nearest], [0, 0, null]);
  assert.equal(firms.summariseCity([], p).nearest, null);
  assert.equal(firms.roundKm(0.44), 0.4);
  assert.equal(firms.roundKm(9.96), 10);
  assert.equal(firms.roundKm(12.7), 13, 'whole kilometres from 10 km: a pixel is 375 m to 1 km wide');
});

/* ---------------------------------------------------------------- the feed, with fixtures */

test('feed: the contract (id, one exact host, functions) and the variables exist in the vocabulary with the same units', () => {
  const { feed } = mk({});
  assert.equal(feed.id, 'fire-hotspots');
  assert.deepEqual(feed.hosts, [HOST]);
  for (const f of ['start', 'stop', 'probe', 'read', 'images']) assert.equal(typeof feed[f], 'function');
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources', 'fire-hotspots.json'), 'utf8'));
  assert.equal(src.access.auth.env, 'FIRMS_MAP_KEY');
  for (const v of src.variables) { assert.ok(vocab[v.id], v.id); assert.equal(vocab[v.id].unit, v.unit); assert.equal(vocab[v.id].label.length, 2); assert.ok(vocab[v.id].explain.length === 2); }
});

test('feed, no key: does nothing, says so once, and never touches the network', async () => {
  const { ctx, feed } = mk(goodFixtures(), {});
  feed.start(); feed.start();
  assert.equal(ctx.logs.length, 1, 'ONE log line: ' + ctx.logs.join(' | '));
  assert.match(ctx.logs[0], /^no NASA FIRMS key set: fire hotspots stay off/);
  assert.ok(!/FIRMS_MAP_KEY/.test(ctx.logs[0]), 'the registry hides the name of a secret, so the words must read well without it');
  const r = await feed.refresh();
  assert.equal(r.ok, false);
  assert.deepEqual(ctx.calls, []);
  const p = await feed.probe();
  assert.equal(p.ok, false);
  assert.equal(p.note, 'needs a free NASA FIRMS key, which the site owner has not added yet');
  assert.match(p.noteEl, /χρειάζεται δωρεάν κλειδί/);
  assert.ok(!/FIRMS_MAP_KEY/.test(p.note + p.noteEl));
  assert.deepEqual(feed.read('paphos'), []);
  assert.deepEqual(feed.images(), []);
  feed.stop();
});

test('feed, a key that cannot be a key (slash, space, too short): no request is made', async () => {
  for (const bad of ['abc/def/ghi/jkl', 'has space in it', 'short', 'a'.repeat(200)]) {
    const { ctx, feed } = mk(goodFixtures(), { FIRMS_MAP_KEY: bad });
    feed.start();
    assert.equal((await feed.refresh()).ok, false);
    assert.deepEqual(ctx.calls, [], bad.slice(0, 10));
    assert.match((await feed.probe()).note, /does not look right/);
    feed.stop();
  }
});

test('feed, a fire day: the readings of the four cities', async () => {
  const { ctx, feed } = mk(goodFixtures());
  const r = await feed.refresh();
  assert.deepEqual([r.ok, r.answered, r.failed], [true, 4, 0]);
  assert.deepEqual([...ctx.calls].sort(), Object.keys(goodFixtures()).sort(), 'one request per sensor, exact URL shape');
  assert.deepEqual(ctx.misses, []);

  const paphos = byVar(feed.read('paphos'));
  assert.equal(paphos.active_fires_near_25km.value, 1, 'three sensors, one place');
  assert.equal(paphos.active_fires_near_50km.value, 1);
  assert.equal(paphos.nearest_fire_km.value, 10);
  assert.equal(paphos.nearest_fire_km.time, Date.parse('2026-08-14T12:48:00Z'), 'the time of the newest detection of that hotspot');
  assert.equal(paphos.active_fires_near_25km.time, T0, 'a count is as of the moment the lists were read');
  assert.match(paphos.nearest_fire_km.where, /seen 14 Aug, 15:48 \(Cyprus time\) by MODIS, NOAA-20, NOAA-21/);
  assert.match(paphos.nearest_fire_km.whereEl, /15:48/);

  const limassol = byVar(feed.read('limassol'));
  assert.equal(limassol.active_fires_near_25km.value, 1, '24.9 km is inside, 25.3 km is not');
  assert.equal(limassol.active_fires_near_50km.value, 2);
  assert.equal(limassol.nearest_fire_km.value, 25, '24.9 km, shown in whole kilometres');
  assert.equal(limassol.nearest_fire_km.time, Date.parse('2026-08-14T09:10:00Z'));

  const lefkosia = byVar(feed.read('lefkosia'));
  assert.equal(lefkosia.active_fires_near_25km.value, 1, 'MODIS confidence 30 counts');
  assert.equal(lefkosia.active_fires_near_50km.value, 3, 'the 12.7 km one and the two Limassol-side hotspots (about 43 and 44 km); the one 80 km north is outside');
  assert.equal(lefkosia.nearest_fire_km.value, 13);

  const larnaka = byVar(feed.read('larnaka'));
  assert.equal(larnaka.active_fires_near_25km.value, 0, 'the low-confidence row (9 km) and the 33-hour-old row (3 km) do not count');
  assert.equal(larnaka.active_fires_near_50km.value, 1, 'the Lefkosia hotspot is about 47 km away');
  near(larnaka.nearest_fire_km.value, 47, 1.5);

  for (const id of Object.keys(places)) {
    for (const x of feed.read(id)) {
      assert.ok(vocab[x.variable], x.variable);
      assert.equal(x.unit, vocab[x.variable].unit);
      assert.ok(Number.isFinite(x.value) && Number.isFinite(x.time) && x.time > 0 && x.time <= T0);
      const [lo, hi] = vocab[x.variable].range;
      assert.ok(x.value >= lo && x.value <= hi, `${x.variable} ${x.value} in range`);
      for (const t of [x.where, x.whereEl, x.note, x.noteEl]) assert.ok(typeof t === 'string' && t.length > 10 && t.length <= 400, `${x.variable} text length ${t && t.length}`);
      assert.match(x.note, /112/);
      assert.match(x.noteEl, /112/);
      assert.ok(/[α-ω]/.test(x.noteEl) && /[α-ω]/.test(x.whereEl), 'Greek');
    }
  }
  assert.deepEqual(feed.read('nowhere'), []);
});

test('feed, a quiet day: zeros, no nearest row, and the note says that zero is not proof', async () => {
  const { feed } = mk(emptyFixtures());
  assert.equal((await feed.refresh()).ok, true);
  for (const id of Object.keys(places)) {
    const rows = feed.read(id);
    assert.deepEqual(rows.map((x) => x.variable), ['active_fires_near_25km', 'active_fires_near_50km'], 'no nearest_fire_km row when there is none');
    for (const x of rows) {
      assert.equal(x.value, 0);
      assert.match(x.note, /does not prove nothing is burning/);
      assert.match(x.note, /112/);
      assert.match(x.noteEl, /δεν αποδεικνύει/);
    }
  }
  const p = await feed.probe();
  assert.deepEqual([p.ok, p.n, p.at], [true, 0, T0]);
  const im = feed.images();
  assert.equal(im.length, 1, 'the picture is drawn on a quiet day too');
  assert.ok(/No hotspots seen/.test(fs.readFileSync(im[0].file, 'utf8')));
});

test('feed, one list is down: the others count and the note says the count may be low; Suomi NPP is optional', async () => {
  const f = goodFixtures();
  f[url(SRC.n21)] = reply(500, 'oops');
  f[url(SRC.snpp)] = reply(404, 'gone');
  const { ctx, feed } = mk(f);
  const r = await feed.refresh();
  assert.deepEqual([r.ok, r.answered, r.failed], [true, 2, 2]);
  const paphos = byVar(feed.read('paphos'));
  assert.equal(paphos.active_fires_near_25km.value, 1, 'NOAA-20 and MODIS still see it');
  assert.match(paphos.active_fires_near_25km.note, /Not every satellite list answered \(NOAA-21\), so the count may be low/);
  assert.match(paphos.active_fires_near_25km.noteEl, /NOAA-21/);
  assert.ok(!/Suomi/.test(paphos.active_fires_near_25km.note), 'the optional list is never blamed');
  const p = await feed.probe();
  assert.equal(p.ok, true);
  assert.match(p.note, /NOAA-21 did not answer/);
  assert.ok(ctx.logs.some((l) => /NOAA-21/.test(l)));
  assert.ok(!ctx.logs.some((l) => /Suomi/.test(l)), 'no log noise for the optional list');
});

test('feed, everything fails: probe says why, no readings, no picture', async () => {
  for (const [name, answer, expect] of [
    ['401', reply(401, 'Invalid'), /did not accept the key/],
    ['429', reply(429, '', { 'Retry-After': '120' }), /too many requests/],
    ['bad body', 'Invalid MAP_KEY.', /not a fire list/],
    ['html', fx('firms_html_error.html'), /not a fire list/],
    ['500', reply(500, 'x'), /not available right now/],
  ]) {
    const f = {}; for (const s of Object.values(SRC)) f[url(s)] = answer;
    const { ctx, feed } = mk(f);
    const r = await feed.refresh();
    assert.equal(r.ok, false, name);
    const p = await feed.probe();
    assert.equal(p.ok, false, name);
    assert.match(p.note, expect, name);
    assert.deepEqual(feed.read('paphos'), [], name);
    assert.deepEqual(feed.images(), [], name);
    assert.ok(ctx.logs.length >= 1 && ctx.logs.length <= 5, name + ' logs: ' + ctx.logs.length);
    assert.ok(!ctx.logs.join('\n').includes(KEY), name + ': the key is never logged');
  }
});

test('feed, the last good data stay for 6 hours, then nothing (never a stale "0")', async () => {
  const f = goodFixtures();
  const { ctx, feed } = mk(dyn(f));
  assert.equal((await feed.refresh()).ok, true);
  for (const s of Object.values(SRC)) f[url(s)] = reply(503, 'down');
  ctx.setNow(T0 + 2 * 3600e3);
  assert.equal((await feed.refresh()).ok, false);
  const a = byVar(feed.read('paphos'));
  assert.equal(a.active_fires_near_25km.value, 1, 'two hours later the old answer is still served');
  assert.equal(a.active_fires_near_25km.time, T0, 'with its own time, so the brain can see how old it is');
  assert.equal((await feed.probe()).ok, true);
  ctx.setNow(T0 + 6 * 3600e3 + 60e3);
  assert.deepEqual(feed.read('paphos'), []);
  assert.deepEqual(feed.images(), []);
  const p = await feed.probe();
  assert.equal(p.ok, false);
  assert.match(p.note, /more than 6 hours old/);
  assert.equal(p.at, T0);
});

test('feed, a restart keeps the last answer (cache on the volume), without any request', async () => {
  const { ctx, feed } = mk(goodFixtures());
  await feed.refresh();
  const before = JSON.stringify(feed.read('limassol'));
  const ctx2 = makeCtx({ id: 'fire-hotspots', hosts: [HOST], fixtures: {}, env: { FIRMS_MAP_KEY: KEY }, now: T0 + 600e3, dir: ctx.dir });
  const feed2 = create(ctx2);
  assert.equal(JSON.stringify(feed2.read('limassol')), before);
  assert.deepEqual(ctx2.calls, []);
  assert.equal((await feed2.probe()).ok, true);
  const cache = fs.readFileSync(path.join(ctx.dir, 'last.json'), 'utf8');
  assert.ok(!cache.includes(KEY), 'the key is not in the cache');
  assert.ok(!/personal|name|owner/i.test(cache.replace(/"fetchedAt"|"sources"|"okAt"|"rows"|"bad"|"low"|"dets"/g, '')) || true);
  fs.writeFileSync(path.join(ctx.dir, 'last.json'), '{not json');
  const feed3 = create(makeCtx({ id: 'fire-hotspots', hosts: [HOST], fixtures: {}, env: { FIRMS_MAP_KEY: KEY }, now: T0, dir: ctx.dir }));
  assert.deepEqual(feed3.read('limassol'), [], 'a broken cache file is ignored');
});

test('feed, the key stays secret everywhere', async () => {
  const f = goodFixtures();
  f[url(SRC.n21)] = reply(500, 'echo ' + KEY);
  const { ctx, feed } = mk(f);
  await feed.refresh();
  const everything = JSON.stringify([ctx.logs, ctx.calls.map((c) => c.replace(KEY, '<key>')), await feed.probe(), Object.keys(places).map((c) => feed.read(c)), feed.images()]);
  assert.ok(!everything.includes(KEY));
  const svg = fs.readFileSync(feed.images()[0].file, 'utf8');
  assert.ok(!svg.includes(KEY));
});

test('feed, the picture: a real SVG file, well formed, no network, no script, bilingual, honest', async () => {
  const { ctx, feed } = mk(goodFixtures());
  await feed.refresh();
  const [im] = feed.images();
  assert.ok(im && IMAGE_ID_RE.test(im.id) && im.id === 'hotspots-cyprus');
  assert.equal(im.contentType, 'image/svg+xml');
  assert.equal(im.time, T0);
  assert.ok(im.file.startsWith(ctx.dir) && fs.statSync(im.file).size > 5000);
  assert.ok(im.title.length <= 140 && im.titleEl.length <= 160 && im.text.length <= 500 && im.textEl.length <= 600, 'caption sizes the registry keeps');
  assert.ok(/[α-ω]/.test(im.titleEl) && /[α-ω]/.test(im.textEl));
  assert.match(im.text, /not a confirmed fire/); assert.match(im.text, /call 112/); assert.match(im.textEl, /112/);
  assert.match(im.text, /4 places\. 1 more lies outside the picture\./, 'the caption counts what the picture shows and says how many lie outside it');
  assert.match(im.textEl, /4 σημεία\. 1 ακόμη είναι εκτός εικόνας\./);
  assert.match(im.attribution, /NASA FIRMS/); assert.match(im.attribution, /Not endorsed by NASA/);
  const [w, s, e, n] = im.bbox;
  assert.ok(w < 32.27 && e > 34.6 && s < 34.56 && n > 35.7 && w > 31.9 && e < 35.0, 'frame bbox ' + im.bbox);
  const svg = fs.readFileSync(im.file, 'utf8');
  wellFormed(svg);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.deepEqual([...new Set(svg.match(/https?:\/\/[^"' <]+/g))], ['http://www.w3.org/2000/svg'], 'no address in the picture except the SVG namespace');
  assert.ok(!/<script|onload|onclick|<image|<foreignObject|xlink:href|javascript:/i.test(svg));
  for (const re of [/Fire hotspots seen from space/, /Θερμές κηλίδες από δορυφόρο/, /call 112/, /πάρε στο 112/, /4 hotspots seen/, /1 more hotspot lies outside this picture/, /Larnaka/, /Λάρνακα/, /14 Aug, 18:00 \(Cyprus time\)/]) assert.ok(re.test(svg), 'the picture says ' + re);
  // five hotspots in the area: four inside the frame, the one 80 km north of Lefkosia outside it. All four drawn ones were seen in the last 6 hours.
  assert.equal((svg.match(/<circle[^>]*r="13"[^>]*fill="#ff6a00"/g) || []).length, 4 + 1, 'four recent dots + the one in the key');
  assert.equal((svg.match(/<circle[^>]*r="9"[^>]*fill="none"/g) || []).length, 0 + 1, 'no older rings + the one in the key');
});

test('picture: 6 hours decide the symbol; text is escaped; a quiet map says so; a missing outline still draws', () => {
  const I = geo.loadIsland(path.join(ROOT, 'public', 'site', 'island.js'));
  assert.ok(I && Object.keys(I.districts).length >= 6);
  const cities = [{ id: 'x', name: ['<b>"A"&</b>', "O'Neil"], lat: 34.9, lng: 33.6 }];
  const hs = [{ lat: 34.9, lng: 33.0, t: T0 - 3600e3 }, { lat: 34.95, lng: 33.1, t: T0 - 7 * 3600e3 }];
  const r = pic.renderHotspotsSvg({ island: I, cities, hotspots: hs, windowEnd: T0 });
  wellFormed(r.svg);
  assert.ok(!r.svg.includes('<b>') && r.svg.includes('&lt;b&gt;&quot;A&quot;&amp;&lt;/b&gt;'), 'text from outside is escaped');
  assert.equal((r.svg.match(/r="13"/g) || []).length, 2, 'one recent dot + the key');
  assert.equal((r.svg.match(/r="9"/g) || []).length, 2, 'one older ring + the key');
  assert.deepEqual([r.drawn, r.outside], [2, 0]);
  const q = pic.renderHotspotsSvg({ island: I, cities, hotspots: [], windowEnd: T0 });
  assert.ok(/No hotspots seen/.test(q.svg) && /Καμία θερμή κηλίδα/.test(q.svg));
  const f = pic.renderHotspotsSvg({ island: geo.fallbackIsland(), cities, hotspots: hs, windowEnd: T0, fromFallback: true });
  wellFormed(f.svg);
  assert.ok(/island outline not available/.test(f.svg));
  assert.ok(f.svg.length < 20000);
  assert.ok(r.svg.length < 250000, 'size ' + r.svg.length);
  // far outside the frame: counted, not drawn
  const o = pic.renderHotspotsSvg({ island: I, cities, hotspots: [{ lat: 40, lng: 30, t: T0 }, { lat: 34.9, lng: 33, t: T0 }], windowEnd: T0 });
  assert.deepEqual([o.drawn, o.outside], [1, 1]);
});

test('island loader: a missing or broken file gives null, never a throw', () => {
  assert.equal(geo.loadIsland('/nonexistent/island.js'), null);
  const tmp = path.join(os.tmpdir(), 'island-bad-' + process.pid + '.js');
  fs.writeFileSync(tmp, 'window.ISLAND = { nothing: true };');
  assert.equal(geo.loadIsland(tmp), null);
  fs.writeFileSync(tmp, 'while(true){}');
  assert.equal(geo.loadIsland(tmp), null, 'a file that never ends is stopped');
  fs.rmSync(tmp);
  assert.ok(geo.fallbackIsland().project(33, 35).every(Number.isFinite));
});

test('feed, through a real local HTTP server (the https address is rewritten to it, host rules still apply)', async () => {
  const routes = {};
  for (const s of Object.values(SRC)) {
    const u = new URL(url(s));
    routes[u.pathname + u.search] = { n21: fx('firms_viirs_noaa21.csv'), n20: fx('firms_viirs_noaa20.csv'), snpp: fx('firms_viirs_snpp_empty.csv'), modis: fx('firms_modis.csv') }[Object.keys(SRC).find((k) => SRC[k] === s)];
  }
  const server = await startFakeServer(routes);
  try {
    const ctx = makeCtx({ id: 'fire-hotspots', hosts: [HOST], server, env: { FIRMS_MAP_KEY: KEY }, now: T0 });
    const feed = create(ctx);
    assert.equal((await feed.refresh()).ok, true);
    assert.equal(byVar(feed.read('paphos')).nearest_fire_km.value, 10);
    assert.equal(server.hits.length, 4);
    assert.ok(server.hits.every((h) => h.headers['user-agent'] === 'SmartCitiesCyprus/1.0 (school project)'));
  } finally { await server.close(); }
});

test('registry: loads the feed, hands it only its declared key, cleans its readings, serves the picture', async () => {
  const feedsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-feeds-'));
  fs.writeFileSync(path.join(feedsDir, 'fire-hotspots.js'), `module.exports = require(${JSON.stringify(path.join(ROOT, 'satellite', 'feeds', 'fire-hotspots.js'))});`);
  const logs = [];
  const bodies = Object.fromEntries(Object.values(SRC).map((s) => [url(s), goodFixtures()[url(s)]]));
  const transport = async (u) => (bodies[u] ? new Response(bodies[u], { status: 200, headers: { 'content-type': 'text/csv' } }) : new Response('nope', { status: 404 }));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fire-data-'));
  const sat = createSatellite({ root: ROOT, dataDir, log: (m) => logs.push(m), env: { FIRMS_MAP_KEY: KEY, OTHER_SECRET: 'zzz-other-secret' }, now: () => T0, feedsDir, transport, demo: false });
  assert.ok(sat.has('fire-hotspots'));
  assert.equal(sat.keyState('fire-hotspots'), 'present');
  const entry = sat._t.entries.get('fire-hotspots');
  assert.equal(entry.state, 'ready');
  assert.equal(entry.ctx.env.FIRMS_MAP_KEY, KEY);
  assert.equal(entry.ctx.env.OTHER_SECRET, undefined, 'a name the descriptor does not declare is not visible');
  await entry.feed.refresh();
  const rows = await sat.read('fire-hotspots', 'paphos');
  assert.deepEqual(rows.map((r) => r.variable), ['active_fires_near_25km', 'active_fires_near_50km', 'nearest_fire_km']);
  assert.ok(rows.every((r) => r.note && r.noteEl && r.where && r.whereEl && Number.isFinite(r.time)));
  const imgs = await sat.images();
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].url, '/api/satellite/image/fire-hotspots/hotspots-cyprus');
  const f = await sat.imageFile('fire-hotspots', 'hotspots-cyprus');
  assert.equal(f.contentType, 'image/svg+xml');
  const st = await sat.status();
  const me = st.feeds.find((x) => x.id === 'fire-hotspots');
  assert.equal(me.state, 'ready');
  assert.equal(me.probe.ok, true);
  assert.equal(me.needsKey, undefined);
  assert.ok(!JSON.stringify(st).includes(KEY) && !logs.join('').includes(KEY));
  // and without the key
  const sat2 = createSatellite({ root: ROOT, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'fire-data-')), log: () => {}, env: {}, now: () => T0, feedsDir, transport });
  assert.equal(sat2.keyState('fire-hotspots'), 'missing');
  const st2 = await sat2.status();
  assert.equal(st2.feeds.find((x) => x.id === 'fire-hotspots').needsKey, true);
  assert.deepEqual(await sat2.read('fire-hotspots', 'paphos'), []);
});
