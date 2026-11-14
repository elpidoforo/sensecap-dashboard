'use strict';
/* city-buildings.js: the Overpass answer turned into buildings and streets, heights, holes, the box, caching and the answers of
   GET /api/city/<id>. No network: the Overpass service is a fake. Run: node tests/city/unit_test.js */
const fs = require('fs'), os = require('os'), path = require('path');
const { createCityBuildings, CITIES } = require('../../city-buildings');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const near = (a, b, d) => Math.abs(a - b) <= (d || 0.15);

// a point m metres east and n metres north of a city's middle
const C = CITIES.larnaka, kx = 111320 * Math.cos((C.lat * Math.PI) / 180), ky = 110574;
const at = (e, n) => ({ lat: C.lat + n / ky, lon: C.lng + e / kx });
const sq = (e, n, s) => [at(e, n), at(e + s, n), at(e + s, n + s), at(e, n + s), at(e, n)];
const OSM = { elements: [
  { type: 'way', id: 1, tags: { building: 'yes', height: '24 m' }, geometry: sq(0, 0, 20) },
  { type: 'way', id: 2, tags: { building: 'apartments', 'building:levels': '5' }, geometry: sq(100, 100, 20) },
  { type: 'way', id: 3, tags: { building: 'house' }, geometry: sq(-200, 50, 10) },
  { type: 'way', id: 4, tags: { building: 'yes', height: '80 ft' }, geometry: sq(300, -300, 10) },           // feet are not trusted: drawn at 9 m
  { type: 'way', id: 5, tags: { building: 'yes', height: '12' }, geometry: sq(2000, 0, 10) },                // outside the box: left out
  { type: 'way', id: 6, tags: { building: 'no' }, geometry: sq(10, 10, 5) },                                  // not a building
  { type: 'relation', id: 7, tags: { building: 'yes', type: 'multipolygon', 'building:levels': '2' }, members: [   // outer split in two ways, one hole
    { type: 'way', role: 'outer', geometry: [at(400, 0), at(460, 0), at(460, 60)] },
    { type: 'way', role: 'outer', geometry: [at(460, 60), at(400, 60), at(400, 0)] },
    { type: 'way', role: 'inner', geometry: [at(420, 20), at(440, 20), at(440, 40), at(420, 40), at(420, 20)] }] },
  { type: 'way', id: 8, tags: { highway: 'primary', name: 'Ermou', 'name:el': 'Ερμού' }, geometry: [at(-500, 0), at(500, 0)] },
  { type: 'way', id: 9, tags: { highway: 'footway' }, geometry: [at(0, -100), at(0, 100)] },
  { type: 'way', id: 10, tags: { highway: 'bus_stop' }, geometry: [at(0, 0), at(1, 1)] },                    // not a street class we draw
  { type: 'way', id: 11, tags: { highway: 'residential' }, geometry: [at(1500, 1500), at(1600, 1600)] },     // wholly outside: left out
  { type: 'way', id: 12, tags: { natural: 'coastline' }, geometry: [at(-900, -800), at(900, -700)] },
] };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'city-'));
  const make = (over) => createCityBuildings({ dataDir: dir, wait: async () => {}, log: () => {}, noRetryTimer: true, ...over });
  const T = make({ fetch: async () => { throw new Error('no'); } })._t;

  // heights
  ok(JSON.stringify(T.heightOf({ height: '24 m' })) === '[24,"t"]' && JSON.stringify(T.heightOf({ height: '12,5' })) === '[12.5,"t"]', 'a recorded height is read, with or without "m"');
  ok(JSON.stringify(T.heightOf({ 'building:levels': '5' })) === '[16,"l"]', 'floors become 3.2 m each');
  ok(JSON.stringify(T.heightOf({})) === '[9,"d"]' && JSON.stringify(T.heightOf({ height: '80 ft' })) === '[9,"d"]' && JSON.stringify(T.heightOf({ height: '900' })) === '[9,"d"]', 'no height, feet or nonsense: drawn at 9 m and marked as not recorded');
  // the box
  const b = T.boxOf(C);
  ok(near((b.n - C.lat) * ky, 900, 1) && near((b.e - C.lng) * kx, 900, 1), 'the box reaches 900 m from the middle each way');
  ok(/\(way\["building"\]\(34\.9\d+,33\.6\d+,34\.9\d+,33\.6\d+\);relation\["building"\]/.test(T.queryFor(b)) && /natural"="coastline"/.test(T.queryFor(b)), 'the query asks for buildings, streets and the coast in that box');

  const d = T.convert('larnaka', OSM, 1000);
  ok(d.stats.buildings === 5, 'buildings inside the box are kept, others left out (' + d.stats.buildings + ')');
  const first = d.buildings[0];
  ok(first[0] === 24 && first[1] === 't' && first[2].length === 8 && near(first[2][0], 0) && near(first[2][1], 0) && near(first[2][2], 20) && near(first[2][5], 20), 'a building ring is in metres from the middle, without the closing point');
  ok(d.stats.tagged === 1 && d.stats.levels === 2 && d.stats.guessed === 2, 'the counts of recorded, floor-based and guessed heights are right (' + JSON.stringify(d.stats) + ')');
  const rel = d.buildings.find((x) => x[3]);
  ok(rel && rel[0] === 6.4 && rel[2].length === 8 && rel[3].length === 1 && rel[3][0].length === 8, 'a multipolygon building has its split outline joined and keeps its courtyard as a hole');
  ok(d.roads.length === 3 && d.stats.roads === 2, 'streets of known classes are kept, the coast is drawn but not counted as a street');
  const erm = d.roads.find((r) => r[2] === 'Ermou');
  ok(erm && erm[0] === 'major' && erm[3] === 'Ερμού' && near(erm[1][0], -500) && near(erm[1][2], 500), 'a street keeps its class and both names');
  ok(d.roads.some((r) => r[0] === 'walk') && d.roads.some((r) => r[0] === 'coast'), 'footways and the coastline have their own classes');
  ok(/OpenStreetMap contributors/.test(d.licence) && d.at === 1000 && !d.mock, 'the answer carries the licence and when it was fetched');

  // the route: first a fetch runs (202), then the saved answer (200), and the file is kept
  let calls = 0, body = '';
  const fake = async (url, opts) => { calls++; body = opts.body; return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(OSM) }; };
  const cb = make({ fetch: fake });
  const res = () => { const r = { code: 0, head: null, body: '' }; r.writeHead = (c, hd) => { r.code = c; r.head = hd; }; r.end = (t) => { r.body = t; }; return r; };
  const ask = async (p) => { const r = res(); const handled = await cb.handle({ method: 'GET' }, r, new URL('http://x' + p)); return { handled, ...r }; };
  let a = await ask('/api/city/larnaka');
  ok(a.handled && a.code === 202 && JSON.parse(a.body).loading, 'the first request starts a fetch and says it is loading');
  await cb._t.idle();
  a = await ask('/api/city/larnaka');
  ok(a.code === 200 && JSON.parse(a.body).stats.buildings === 5 && calls === 1, 'once fetched, the city is answered from what was saved');
  ok(/^data=/.test(body) && decodeURIComponent(body.slice(5)).includes('out geom'), 'the fetch posts an Overpass query');
  ok(fs.existsSync(path.join(dir, 'city-osm-larnaka.json')), 'the city is kept in the data folder');
  const cb2 = make({ fetch: async () => { throw new Error('should not fetch'); } });
  const r2 = res(); await cb2.handle({ method: 'GET' }, r2, new URL('http://x/api/city/larnaka'));
  ok(r2.code === 200, 'after a restart the saved city is used without fetching again');
  a = await ask('/api/city/atlantis');
  ok(a.handled && a.code === 404, 'an unknown city is refused');
  a = await ask('/api/cityx');
  ok(!a.handled, 'other addresses are not taken');

  // a failed fetch: 503, then not asked again until the wait is over
  let n = 0, clock = 5000;
  const bad = make({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'city-')), fetch: async () => { n++; return { ok: false, status: 504, headers: { get: () => null }, text: async () => '' }; }, now: () => clock });
  const r3 = res(); await bad.handle({ method: 'GET' }, r3, new URL('http://x/api/city/paphos')); await bad._t.idle();
  const r4 = res(); await bad.handle({ method: 'GET' }, r4, new URL('http://x/api/city/paphos'));
  ok(r3.code === 202 && r4.code === 503 && n === 1 && /tried again/.test(JSON.parse(r4.body).error), 'a failed fetch is reported and not repeated at once');
  clock += 11 * 60000; const r5 = res(); await bad.handle({ method: 'GET' }, r5, new URL('http://x/api/city/paphos')); await bad._t.idle();
  ok(n === 2, 'after ten minutes it is tried again');
  // too large, and the test mode
  const big = make({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'city-')), fetch: async () => ({ ok: true, status: 200, headers: { get: () => String(50 * 1024 * 1024) }, text: async () => '{}' }) });
  const r6 = res(); await big.handle({ method: 'GET' }, r6, new URL('http://x/api/city/limassol')); await big._t.idle();
  ok(big.status().find((s) => s.id === 'limassol').error === 'answer too large', 'an answer that is too large is refused');
  const demo = make({ mock: true, fetch: async () => { throw new Error('should not fetch'); } });
  const r7 = res(); await demo.handle({ method: 'GET' }, r7, new URL('http://x/api/city/lefkosia'));
  const dj = JSON.parse(r7.body);
  ok(r7.code === 200 && dj.mock === true && dj.buildings.length > 100 && /Demo/.test(dj.licence), 'the test mode answers with made-up blocks marked as demo');

  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL: the run stopped: ' + e.stack); process.exit(1); });
