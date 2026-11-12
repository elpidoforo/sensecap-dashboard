'use strict';
/* Unit tests for the EFFIS burnt-area feed (satellite/feeds/effis-burnt-areas.js) and its reader (satellite/fire/effis.js).
 * No network: the feed reads GeoJSON fixtures through the real satellite/http.js with a fake transport (satellite/testing.js).
 * The fixtures are made by make-fixtures.js (the scenario is described in its header). The GeoJSON shape is what a third-party client's
 * README says the EFFIS WFS answers with: nothing here was ever checked against the live service.
 * Run:  node --test tests/sat-fire/unit_effis.js          (Node 22, nothing to install) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const { makeCtx, reply, startFakeServer } = require(path.join(ROOT, 'satellite', 'testing'));
const { createSatellite } = require(path.join(ROOT, 'satellite'));
const effis = require(path.join(ROOT, 'satellite', 'fire', 'effis'));
const geo = require(path.join(ROOT, 'satellite', 'fire', 'geo'));
const create = require(path.join(ROOT, 'satellite', 'feeds', 'effis-burnt-areas'));
const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'vocab', 'variables.json'), 'utf8'));
const places = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'vocab', 'places.json'), 'utf8'))).filter(([k]) => k[0] !== '_'));

const fx = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const T0 = Date.parse('2026-08-14T15:00:00Z');   // when the list was fetched
const HOST = 'maps.effis.emergency.copernicus.eu';
const URL_ = `https://${HOST}/gwis?service=WFS&version=1.1.0&request=GetFeature&typename=nrt.ba.poly&bbox=31.3,33.7,34.9,36.1`;
const dyn = (obj) => Object.fromEntries(Object.keys(obj).map((k) => [k, () => obj[k]]));
const mk = (body, now) => {
  const ctx = makeCtx({ id: 'effis-burnt-areas', hosts: [HOST], fixtures: dyn({ [URL_]: body }), env: {}, now: now || T0 });
  return { ctx, feed: create(ctx) };
};
const mkWith = (box, now) => {   // the answer can be changed after the feed was made: box.body
  const ctx = makeCtx({ id: 'effis-burnt-areas', hosts: [HOST], fixtures: { [URL_]: () => box.body }, env: {}, now: now || T0 });
  return { ctx, feed: create(ctx) };
};
const only = (rows) => { assert.equal(rows.length, 1); return rows[0]; };
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
const square = (lat, lng, ha) => {
  const side = Math.sqrt(ha / 100), dy = side / 110.574 / 2, dx = side / (111.32 * Math.cos((lat * Math.PI) / 180)) / 2;
  return [[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]];
};
const one = (props, geometry, lat = 34.8, lng = 33.0, ha = 100) => ({ type: 'Feature', geometry: geometry === undefined ? { type: 'Polygon', coordinates: [square(lat, lng, ha)] } : geometry, properties: { initialdate: '2026-08-10 00:00:00', finaldate: '2026-08-12 00:00:00', area: String(ha), ...props } });

/* ---------------------------------------------------------------- the reader */

test('parse: the fixture: 16 features, 7 readable, 9 bad (and which ones)', () => {
  const r = effis.parseBurntAreas(fx('effis_burnt_areas.json'), { now: T0 });
  assert.deepEqual([r.features, r.areas.length, r.bad], [16, 7, 9]);
  assert.deepEqual(r.areas.map((a) => a.ha), [160, 40, 500, 300, 150, 80, 60], 'area in hectares, also from a string and a number');
  assert.ok(r.areas.every((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && a.t1 >= a.t0));
});

test('parse: only numbers come out; no commune, province or owner ever does', () => {
  const body = fx('effis_burnt_areas.json');
  assert.ok(/Some Village/.test(body) && /A\. Person/.test(body), 'the fixture has them');
  const out = JSON.stringify(effis.parseBurntAreas(body, { now: T0 }));
  assert.ok(!/Village|District|Person|commune|province|owner|fire_id/i.test(out), out.slice(0, 200));
  for (const a of effis.parseBurntAreas(body, { now: T0 }).areas) assert.deepEqual(Object.keys(a).sort(), ['ha', 'lat', 'lng', 't0', 't1']);
});

test('parse: the centre of a MultiPolygon is weighted by the area of its parts', () => {
  const g = { type: 'MultiPolygon', coordinates: [[square(34.9, 33.0, 300)], [square(35.1, 33.2, 100)]] };
  const r = effis.parseBurntAreas(fc([one({ area: '400' }, g)]), { now: T0 });
  assert.equal(r.areas.length, 1);
  assert.ok(Math.abs(r.areas[0].lat - 34.95) < 0.003 && Math.abs(r.areas[0].lng - 33.05) < 0.003, `${r.areas[0].lat}, ${r.areas[0].lng}`);
});

test('parse: dates in the forms the service uses, and nothing else', () => {
  const d = effis.dateMs;
  assert.equal(d('2026-08-12 10:00:00'), Date.UTC(2026, 7, 12, 10));
  assert.equal(d('2026-08-12T10:00:00Z'), Date.UTC(2026, 7, 12, 10));
  assert.equal(d('2026-08-12'), Date.UTC(2026, 7, 12));
  for (const bad of ['', null, undefined, '2026-02-31', '12/08/2026', '1999-01-01', 'yesterday', '2026-13-01 00:00:00']) assert.equal(d(bad), null, String(bad));
  // finaldate missing: initialdate stands in for the last update
  const r = effis.parseBurntAreas(fc([one({ finaldate: null, initialdate: '2026-08-11 00:00:00' })]), { now: T0 });
  assert.equal(r.areas[0].t1, Date.UTC(2026, 7, 11));
});

test('parse: the stated area must agree with the outline (0.3 to 3 times), so a unit mix-up shows nothing', () => {
  const ok = (ha, stated) => effis.parseBurntAreas(fc([one({ area: String(stated) }, undefined, 34.8, 33.0, ha)]), { now: T0 }).areas.length;
  assert.equal(ok(100, 100), 1);
  assert.equal(ok(100, 300), 1, 'outline is a third of the stated area: the edge of the rule');
  assert.equal(ok(100, 40), 1, 'outline is 2.5 times');
  assert.equal(ok(100, 20), 0, 'outline is 5 times');
  assert.equal(ok(100, 1000), 0, 'outline is a tenth');
  assert.equal(ok(100, 1000000), 0, 'the same area in square metres');
  assert.equal(ok(100, 247), 1, 'known gap: acres (a factor of 2.5) would pass the rule; square metres, square kilometres and any factor of 3 or more would not');
});

test('parse: bad features are counted and left out, never thrown', () => {
  const polyOf = (a) => ({ type: 'Polygon', coordinates: [a] });
  const bads = [
    one({}, { type: 'Point', coordinates: [33, 34.8] }), one({}, null), one({}, polyOf([[33, 34.8], [33.1, 34.8], [33, 34.8]])),
    one({}, polyOf([[33, 34.8], [33.1, 34.8], [33.1, 34.9], [NaN, 34.9], [33, 34.8]])), one({}, polyOf([[33, 34.8], [33.1, 34.8], [33.1, 134.9], [33, 134.9], [33, 34.8]])),
    one({ area: 'abc' }), one({ area: '0' }), one({ area: '-5' }), one({ area: '' }), one({ area: null }), one({ area: '2000000' }),
    one({ initialdate: null, finaldate: null }), one({ finaldate: '2026-08-20 00:00:00', initialdate: '2026-08-19 00:00:00' }),
    { type: 'Feature' }, null, 7, 'x', [],
  ];
  const r = effis.parseBurntAreas(fc([...bads, one({})]), { now: T0 });
  assert.equal(r.features, bads.length + 1);
  assert.equal(r.areas.length, 1);
  assert.equal(r.bad, bads.length);
});

test('parse: an answer that is not a list of burnt areas is an error, never "nothing burnt"', () => {
  for (const [body, re] of [
    [fx('effis_exception.xml'), /XML/], [fx('effis_html_error.html'), /XML/], ['', /empty/], ['   \n', /empty/], [null, /empty/],
    ['not json', /JSON/], ['{"error":"x"}', /FeatureCollection/], ['[]', /FeatureCollection/], ['{"features":"no"}', /FeatureCollection/], ['null', /FeatureCollection/],
  ]) assert.throws(() => effis.parseBurntAreas(body, { now: T0 }), re, JSON.stringify(String(body).slice(0, 20)));
  assert.deepEqual(effis.parseBurntAreas(fx('effis_empty.json'), { now: T0 }), { areas: [], features: 0, bad: 0 }, 'an empty list is a quiet answer');
  assert.equal(effis.parseBurntAreas('﻿' + fx('effis_empty.json'), { now: T0 }).features, 0, 'a byte-order mark is fine');
});

test('summarise: each city, the 30-day edge (to the second) and the 50 km edge', () => {
  const a = effis.parseBurntAreas(fx('effis_burnt_areas.json'), { now: T0 }).areas;
  const s = (c) => effis.summariseCity(a, places[c], T0);
  assert.deepEqual(s('limassol'), { km2: 2, n: 2, newest: Date.UTC(2026, 7, 13) }, 'F1 160 + F2 40 (48.9 km); F3 is 51.3 km away');
  assert.deepEqual(s('lefkosia'), { km2: 6.9, n: 3, newest: Date.UTC(2026, 7, 13) }, 'F2 40 + F3 500 + the Larnaka-side MultiPolygon 150 (36 km)');
  assert.deepEqual(s('larnaka'), { km2: 1.5, n: 1, newest: Date.UTC(2026, 7, 10) });
  assert.deepEqual(s('paphos'), { km2: 0.8, n: 1, newest: Date.UTC(2026, 6, 15, 15) }, 'exactly 30 days counts, one second more does not, 55 days does not');
  const lim = places.limassol;
  for (const x of [a[1], a[2]]) assert.ok(Math.abs(geo.distanceKm(lim.lat, lim.lng, x.lat, x.lng) - (x === a[1] ? 48.9 : 51.3)) < 0.2);
  assert.deepEqual(effis.summariseCity([], lim, T0), { km2: 0, n: 0, newest: null });
  assert.deepEqual(effis.summariseCity(null, lim, T0), { km2: 0, n: 0, newest: null });
  assert.deepEqual(effis.summariseCity(a, lim, T0 - 40 * 86400e3), { km2: 0, n: 0, newest: null }, 'nothing was updated yet 40 days earlier');
  assert.equal(effis.summariseCity([{ lat: 34.8, lng: 33.05, ha: 0.04, t0: T0, t1: T0 }], lim, T0).km2, 0, 'rounded to 0.1 km2');
  assert.equal(effis.summariseCity([{ lat: 34.8, lng: 33.05, ha: 5, t0: T0, t1: T0 }], lim, T0).km2, 0.1, '5 ha is 0.05 km2, shown as 0.1');
});

/* ---------------------------------------------------------------- the feed */

test('feed: asks EFFIS once, with the documented request, and needs no key', async () => {
  const { ctx, feed } = mk(fx('effis_burnt_areas.json'));
  assert.deepEqual(feed.hosts, [HOST]);
  assert.equal(feed.id, 'effis-burnt-areas');
  assert.deepEqual((await feed.refresh()).ok, true);
  assert.deepEqual(ctx.calls, [URL_]);
  assert.ok(ctx.logs.length === 1 && /EFFIS answered: 16 perimeters around Cyprus, 5 updated in the last 30 days, 9 could not be read/.test(ctx.logs[0]), ctx.logs.join('|'));
  const p = await feed.probe();
  assert.deepEqual([p.ok, p.n, p.at], [true, 5, T0]);
  assert.deepEqual(feed.images(), [], 'no picture: the picture is the fire-hotspots one');
});

test('feed: the readings for four cities, in range, bilingual, with 112 and without any name', async () => {
  const { feed } = mk(fx('effis_burnt_areas.json'));
  await feed.refresh();
  const want = { limassol: 2, lefkosia: 6.9, larnaka: 1.5, paphos: 0.8 };
  for (const id of Object.keys(places)) {
    const x = only(feed.read(id));
    assert.equal(x.variable, 'burnt_area_near_km2');
    assert.equal(x.value, want[id], id);
    assert.equal(x.unit, vocab.burnt_area_near_km2.unit);
    assert.equal(x.time, T0);
    const [lo, hi] = vocab.burnt_area_near_km2.range;
    assert.ok(x.value >= lo && x.value <= hi);
    for (const t of [x.where, x.whereEl, x.note, x.noteEl]) assert.ok(typeof t === 'string' && t.length > 10 && t.length <= 400, `${id} text length ${t && t.length}`);
    assert.match(x.note, /112/); assert.match(x.noteEl, /112/);
    assert.match(x.note, /30 hectares/); assert.match(x.noteEl, /30 εκτάρια/);
    assert.ok(/[α-ω]/.test(x.whereEl) && /[α-ω]/.test(x.noteEl));
    assert.ok(!/Village|District|Person/.test(JSON.stringify(x)));
  }
  assert.match(only(feed.read('limassol')).where, /2 mapped burnt areas centred within 50 km .*\(newest 13 Aug\)/);
  assert.match(only(feed.read('larnaka')).where, /1 mapped burnt area centred/);
  assert.deepEqual(feed.read('nowhere'), []);
});

test('feed: a quiet answer is a real 0, and the note says 0 is not proof', async () => {
  const { feed } = mk(fx('effis_empty.json'));
  assert.equal((await feed.refresh()).ok, true);
  for (const id of Object.keys(places)) {
    const x = only(feed.read(id));
    assert.equal(x.value, 0);
    assert.match(x.note, /does not mean there was no fire/);
    assert.match(x.noteEl, /δεν σημαίνει ότι δεν έγινε φωτιά/);
    assert.match(x.note, /112/);
  }
  const p = await feed.probe();
  assert.deepEqual([p.ok, p.n], [true, 0]);
});

test('feed: every way EFFIS can fail gives no reading and a plain reason, never a 0', async () => {
  for (const [name, answer, expect] of [
    ['xml exception with HTTP 200', fx('effis_exception.xml'), /not a list of burnt areas/],
    ['html', fx('effis_html_error.html'), /not a list of burnt areas/],
    ['empty body', '', /not a list of burnt areas/],
    ['json, wrong shape', '{"error":"x"}', /not a list of burnt areas/],
    ['all features unreadable', fx('effis_all_unreadable.json'), /not a list of burnt areas/],
    ['429', reply(429, '', { 'Retry-After': '120' }), /too many requests/],
    ['500', reply(500, 'x'), /not available right now/],
    ['404', reply(404, 'gone'), /not available right now/],
  ]) {
    const { ctx, feed } = mk(answer);
    assert.equal((await feed.refresh()).ok, false, name);
    const p = await feed.probe();
    assert.equal(p.ok, false, name);
    assert.match(p.note, expect, name);
    assert.deepEqual(feed.read('limassol'), [], name);
    assert.equal(ctx.logs.length, 1, name + ': one log line');
    assert.match(ctx.logs[0], /^EFFIS /);
    assert.ok(!fs.existsSync(path.join(ctx.dir, 'last.json')), name + ': nothing cached');
  }
});

test('feed: the answer "none could be read" says how many, so the first log line is useful', async () => {
  const { ctx, feed } = mk(fx('effis_all_unreadable.json'));
  await feed.refresh();
  assert.match(ctx.logs[0], /none of the 3 features could be read/);
});

test('feed: a failure keeps the last good data for 48 hours, with their own time; then nothing', async () => {
  const box = { body: fx('effis_burnt_areas.json') };
  const { ctx, feed } = mkWith(box);
  assert.equal((await feed.refresh()).ok, true);
  box.body = reply(503, 'down');
  ctx.setNow(T0 + 6 * 3600e3);
  assert.equal((await feed.refresh()).ok, false);
  const x = only(feed.read('limassol'));
  assert.equal(x.value, 2);
  assert.equal(x.time, T0, 'the old answer keeps its own time');
  assert.equal((await feed.probe()).ok, true);
  ctx.setNow(T0 + 48 * 3600e3 + 60e3);
  assert.deepEqual(feed.read('limassol'), []);
  const p = await feed.probe();
  assert.equal(p.ok, false);
  assert.match(p.note, /more than 2 days old/);
  assert.equal(p.at, T0);
});

test('feed: the sum is made at the fetch moment, so a reading and its time always agree', async () => {
  const { ctx, feed } = mk(fx('effis_burnt_areas.json'));
  await feed.refresh();
  ctx.setNow(T0 + 3600e3);
  assert.equal(only(feed.read('paphos')).value, 0.8, 'summed at the fetch moment, not at the moment of asking: a reading and its time always agree');
});

test('feed: a restart keeps the last answer (cache on the volume), without any request', async () => {
  const { ctx, feed } = mk(fx('effis_burnt_areas.json'));
  await feed.refresh();
  const before = JSON.stringify(feed.read('limassol'));
  const cache = fs.readFileSync(path.join(ctx.dir, 'last.json'), 'utf8');
  assert.ok(!/Village|District|Person|commune|owner/i.test(cache), 'the cache has numbers only');
  const ctx2 = makeCtx({ id: 'effis-burnt-areas', hosts: [HOST], fixtures: {}, env: {}, now: T0 + 600e3, dir: ctx.dir });
  const feed2 = create(ctx2);
  assert.equal(JSON.stringify(feed2.read('limassol')), before);
  assert.deepEqual(ctx2.calls, []);
  assert.equal((await feed2.probe()).ok, true);
  fs.writeFileSync(path.join(ctx.dir, 'last.json'), '{not json');
  assert.deepEqual(create(makeCtx({ id: 'effis-burnt-areas', hosts: [HOST], fixtures: {}, env: {}, now: T0, dir: ctx.dir })).read('limassol'), [], 'a broken cache file is ignored');
  fs.writeFileSync(path.join(ctx.dir, 'last.json'), JSON.stringify({ fetchedAt: T0, areas: [[1, 2, 3], 'x', [34.8, 33.05, 160, T0 - 1e9, T0 - 1e8]] }));
  assert.equal(only(create(makeCtx({ id: 'effis-burnt-areas', hosts: [HOST], fixtures: {}, env: {}, now: T0, dir: ctx.dir })).read('limassol')).value, 1.6, 'bad rows in the cache are skipped');
});

test('feed: start() twice and stop() are harmless, and nothing is asked before the timer fires', async () => {
  const { ctx, feed } = mk(fx('effis_burnt_areas.json'));
  feed.start();
  feed.start();   // twice is harmless
  feed.stop();
  assert.deepEqual(ctx.calls, [], 'nothing is asked before the timer fires');
});

test('feed, through a real local HTTP server (the https address is rewritten to it, host rules still apply)', async () => {
  const u = new URL(URL_);
  const server = await startFakeServer({ [u.pathname + u.search]: fx('effis_burnt_areas.json') });
  try {
    const ctx = makeCtx({ id: 'effis-burnt-areas', hosts: [HOST], server, env: {}, now: T0 });
    const feed = create(ctx);
    assert.equal((await feed.refresh()).ok, true);
    assert.equal(only(feed.read('paphos')).value, 0.8);
    assert.equal(server.hits.length, 1);
    assert.equal(server.hits[0].headers['user-agent'], 'SmartCitiesCyprus/1.0 (school project)');
    assert.equal(server.hits[0].headers.cookie, undefined);
  } finally { await server.close(); }
});

test('registry: loads the feed, no key needed, cleans its readings; the layer stays planned (a candidate)', async () => {
  const feedsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effis-feeds-'));
  fs.writeFileSync(path.join(feedsDir, 'effis-burnt-areas.js'), `module.exports = require(${JSON.stringify(path.join(ROOT, 'satellite', 'feeds', 'effis-burnt-areas.js'))});`);
  const logs = [];
  const transport = async (u) => (u === URL_ ? new Response(fx('effis_burnt_areas.json'), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('nope', { status: 404 }));
  const sat = createSatellite({ root: ROOT, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'effis-data-')), log: (m) => logs.push(m), env: {}, now: () => T0, feedsDir, transport, demo: false });
  assert.ok(sat.has('effis-burnt-areas'));
  assert.equal(sat.keyState('effis-burnt-areas'), null, 'no key');
  const entry = sat._t.entries.get('effis-burnt-areas');
  assert.equal(entry.state, 'ready');
  await entry.feed.refresh();
  const rows = await sat.read('effis-burnt-areas', 'limassol');
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].variable, rows[0].value, rows[0].unit], ['burnt_area_near_km2', 2, 'km2']);
  assert.ok(rows[0].note && rows[0].noteEl && rows[0].where && rows[0].whereEl && Number.isFinite(rows[0].time));
  assert.deepEqual(await sat.images(), []);
  const st = await sat.status();
  const me = st.feeds.find((x) => x.id === 'effis-burnt-areas');
  assert.equal(me.state, 'ready');
  assert.equal(me.probe.ok, true);
  // the descriptor: a planned candidate, CC BY with an attribution line, no key
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources', 'effis-burnt-areas.json'), 'utf8'));
  assert.deepEqual([d.status, d.planned, d.licence.id, d.access.auth.type], ['candidate', true, 'CC-BY-4.0', 'none']);
  assert.ok(d.licence.attribution.length <= 160 && /EFFIS/.test(d.licence.attribution) && /changed/i.test(d.licence.attribution));
  assert.ok(d.quality.known_issues.some((t) => /UNVERIFIED/.test(t)), 'the descriptor says what was not verified');
  assert.deepEqual(d.variables.map((v) => v.id), ['burnt_area_near_km2']);
});
