'use strict';
/* The first repairs of the research handoff of 13 November 2026 (tickets T02 and T03), on the real layers.js and eea.js with made-up data.
   Run: node tests/layers-repairs/unit_test.js   (no network, no server) */
const path = require('path');
const { createLayers } = require('../../layers.js');
const { snapshotPoint } = require('../../eea.js');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const HOUR = 3600000, now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const hourStart = (ms) => Math.floor(ms / HOUR) * HOUR;

(async () => {
  /* ---- T02: each pollutant keeps its own clock ---- */
  const fresh = hourStart(now) - HOUR, old = fresh - 97 * HOUR;
  let p = snapshotPoint({ id: 'S1', name: 'Station', lat: 34.9, lng: 33.6, pm25: { t: fresh, v: 12 }, pm10: { t: old, v: 40 } });
  ok(p.pm25Time === iso(fresh + HOUR) && p.pm10Time === iso(old + HOUR), 'snapshot: PM2.5 and PM10 each carry their own time');
  ok(p.time === p.pm25Time, 'snapshot: the station label is the newer of the two');
  p = snapshotPoint({ id: 'S1', name: 'Station', lat: 34.9, lng: 33.6, pm25: { t: old, v: 12 }, pm10: { t: fresh, v: 40 } });
  ok(p.pm25Time === iso(old + HOUR) && p.pm10Time === iso(fresh + HOUR), 'snapshot: the reverse case too');
  p = snapshotPoint({ id: 'S1', name: 'Station', lat: 34.9, lng: 33.6, pm25: null, pm10: { t: fresh, v: 40 } });
  ok(p.pm25 === null && p.pm25Time === null && p.pm10Time, 'snapshot: a pollutant with no value has no time (nothing is borrowed)');

  const station = (t25, t10) => ({ points: [{ id: 'S1', name: 'Station', lat: 34.9, lng: 33.63, type: 'traffic', pm25: 12, pm10: 40, pm25Time: t25, pm10Time: t10, time: [t25, t10].filter(Boolean).sort().pop() || null }] });
  let eeaNow = station(iso(fresh + HOUR), iso(old + HOUR));
  let latest = {}, devices = [];
  const data = {
    deviceList: async () => devices, devices: async () => devices, latest: async () => latest, names: () => ({ 4097: ['Air Temperature', '°C'], 4100: ['CO2', 'ppm'] }),
    cydom: async () => ({ points: [] }), metar: async () => ({ points: [] }), weather: async () => ({ points: [] }), air: async () => ({ points: [] }), sea: async () => ({ points: [] }), eea: () => eeaNow,
  };
  const L = createLayers({ root: path.join(__dirname, '..', '..'), data, pulse: false, log: () => {} });
  const T = L._t;
  let ev = await T.evidenceFor('larnaka', ['air-quality-stations-cy']);
  let r25 = ev.rows.find((r) => r.variable === 'pm25'), r10 = ev.rows.find((r) => r.variable === 'pm10');
  ok(r25 && r10 && r25.ageMin < 180 && r10.ageMin > 96 * 60, 'evidence: fresh PM2.5 beside 97-hour-old PM10 keeps both ages (' + (r25 && r25.ageMin) + ', ' + (r10 && r10.ageMin) + ' min)');
  ok(r25 && !r25.stale && r10 && r10.stale, 'evidence: the old PM10 is stale, the PM2.5 is not');
  eeaNow = station(iso(old + HOUR), iso(fresh + HOUR));
  ev = await T.evidenceFor('larnaka', ['air-quality-stations-cy']);
  r25 = ev.rows.find((r) => r.variable === 'pm25'); r10 = ev.rows.find((r) => r.variable === 'pm10');
  ok(r25.stale && !r10.stale && r25.ageMin > 96 * 60 && r10.ageMin < 180, 'evidence: the reverse case too');
  eeaNow = station(null, iso(fresh + HOUR));
  ev = await T.evidenceFor('larnaka', ['air-quality-stations-cy']);
  ok(!ev.rows.some((r) => r.variable === 'pm25') && ev.rows.some((r) => r.variable === 'pm10'), 'evidence: a value whose own time is unknown is left out, not dated by the other pollutant');
  eeaNow = { points: [{ id: 'S1', name: 'Station', lat: 34.9, lng: 33.63, pm25: 12, pm10: 40, time: iso(fresh + HOUR) }] };   // an old cached shape, without the per-pollutant times
  ev = await T.evidenceFor('larnaka', ['air-quality-stations-cy']);
  ok(ev.rows.length === 0, 'evidence: an old saved shape with one shared time is not used for comparison');

  /* ---- T03: a clock in the future, last seen, and lineage ---- */
  devices = [{ eui: 'A1', name: 'Larnaka bus 1', group: 'PASCAL Larnaka' }, { eui: 'A2', name: 'Larnaka bus 2', group: 'PASCAL Larnaka' }];
  latest = { A1: { 4097: { v: 22, t: iso(now + 6 * HOUR) } }, A2: { 4097: { v: 24, t: iso(now - 10 * 60000) } } };
  ev = await T.evidenceFor('larnaka', ['sensecap-buses']);
  let row = ev.rows.find((r) => r.variable === 'temperature');
  ok(row && row.value === 24 && row.n === 1, 'future: a sensor 6 hours ahead is not counted fresh and does not move the average (' + JSON.stringify(row && [row.value, row.n]) + ')');
  ok(row && row.t <= now, 'future: the newest time is never in the future');
  latest = { A1: { 4097: { v: 22, t: iso(now + 6 * HOUR) } }, A2: { 4097: { v: 24, t: iso(now + 2 * HOUR) } } };
  ev = await T.evidenceFor('larnaka', ['sensecap-buses']);
  ok(!ev.rows.length && ev.missing.some((m) => m.source === 'sensecap-buses' && m.why === 'future-time'), 'future: when every clock is ahead the gap says so (' + JSON.stringify(ev.missing) + ')');
  latest = { A1: { 4097: { v: 22, t: iso(now + 2 * 60000) } } };
  ev = await T.evidenceFor('larnaka', ['sensecap-buses']);
  ok(ev.rows.some((r) => r.variable === 'temperature' && r.value === 22), 'future: two minutes ahead is inside the clock tolerance and is used');
  const seen = now - 30 * HOUR;
  latest = { A1: { 4097: { v: 22, t: iso(seen) } }, A2: { 4097: { v: 24, t: iso(seen - HOUR) } } };
  let view = await T.registerView(4000);
  let bus = view.layers.find((l) => l.id === 'sensecap-buses');
  ok(bus.state === 'down' && bus.lastAt === Math.floor(seen / 1000) * 1000 || (bus.state === 'down' && Math.abs(bus.lastAt - seen) < 1000), 'last seen: a group that went quiet is "down" and still says when it was last seen (' + bus.state + ', ' + bus.lastAt + ')');
  ok(/0 of 2/.test(bus.note), 'last seen: the note counts the quiet sensors (' + bus.note + ')');

  const up = { A: ['X'], B: ['Y'], C: ['X', 'Y'], D: [], E: [], M1: [], M2: [] }, kind = { D: 'reference-station', E: 'low-cost-sensor', M1: 'model', M2: 'satellite', A: 'model', B: 'model', C: 'model' };
  const indep = (ids) => T.independent(ids, (id) => up[id], (id) => kind[id]);
  const perms = [['A', 'B', 'C'], ['A', 'C', 'B'], ['B', 'A', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['C', 'B', 'A']];
  ok(perms.every((x) => indep(x) === 1), 'lineage: A[X], B[Y], C[X,Y] is one group in all six orders (' + perms.map(indep).join(',') + ')');
  ok(indep(['A', 'B']) === 2 && indep(['A', 'B', 'D']) === 3, 'lineage: different upstreams and a station are separate');
  ok(indep(['D', 'E']) === 2, 'lineage: two primary measurements with no upstream are two sources');
  ok(indep(['M1', 'M2']) === 1 && indep(['M1', 'M2', 'D']) === 2, 'lineage: models or satellites with an unknown lineage are not counted as independent of each other');
  ok(T.independent(['openmeteo-air', 'cams-atmosphere']) === 1, 'lineage: the two wrappers of the CAMS model in the real register are one piece of evidence');
  ok(T.independent(['openmeteo-air', 'cams-atmosphere', 'air-quality-stations-cy']) === 2, 'lineage: with the official stations they are two');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
