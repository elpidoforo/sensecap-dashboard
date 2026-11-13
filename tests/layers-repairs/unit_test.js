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

  /* ---- T03: reviewed sensor assignments with installation dates ---- */
  const os = require('os'), fs = require('fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assign-'));
  const L2 = createLayers({ root: path.join(__dirname, '..', '..'), dataDir: dir, data, pulse: false, log: () => {} }), A = L2._t;
  const day = (n) => new Date(now + n * 24 * HOUR).toISOString().slice(0, 10);
  devices = [{ eui: 'B1', name: 'Larnaka bus 1', group: 'PASCAL Larnaka' }, { eui: 'B2', name: 'Sensor 7', group: 'spare' }];
  latest = { B1: { 4097: { v: 21, t: iso(now - 5 * 60000) } }, B2: { 4097: { v: 26, t: iso(now - 5 * 60000) } } };
  let v = await A.assignmentsView();
  ok(v.rev === 0 && v.sensors.length === 2 && v.sensors.find((x) => x.eui === 'B1').guess.kind === 'bus' && v.sensors.find((x) => x.eui === 'B1').guess.city === 'larnaka' && v.sensors.every((x) => x.reviewed === null), 'assignments: before any review the list shows what the names suggest');
  ev = await A.evidenceFor('larnaka', ['sensecap-buses']);
  ok(ev.rows.some((r) => r.variable === 'temperature' && r.value === 21), 'assignments: an unreviewed sensor is still placed by its name');
  // the name says "Larnaka bus", the reviewed list says it is in a Limassol classroom; the unnamed sensor is a Paphos car
  v = await A.putAssignments({ rev: 0, sensors: [{ eui: 'B1', kind: 'classroom', city: 'limassol', from: day(-30), note: 'room 12' }, { eui: 'B2', kind: 'car', city: 'paphos', from: day(-10) }] }, { id: 7, role: 'teacher' });
  ok(v.rev === 1 && v.sensors.find((x) => x.eui === 'B1').reviewed.city === 'limassol', 'assignments: saved as revision 1');
  ev = await A.evidenceFor('larnaka', ['sensecap-buses']);
  ok(!ev.rows.length, 'assignments: the reviewed line wins over the name (no longer a Larnaka bus)');
  ev = await A.evidenceFor('limassol', ['sensecap-classrooms']);
  ok(ev.rows.some((r) => r.variable === 'temperature' && r.value === 21), 'assignments: it now counts as a Limassol classroom');
  ev = await A.evidenceFor('paphos', ['sensecap-cars']);
  ok(ev.rows.some((r) => r.value === 26), 'assignments: a sensor with a meaningless name can be placed');
  let rejected = null; try { await A.putAssignments({ rev: 0, sensors: [] }, {}); } catch (e) { rejected = e; }
  ok(rejected && rejected.status === 409, 'assignments: saving on top of an old revision is refused (' + (rejected && rejected.status) + ')');
  for (const [bad, why] of [[{ eui: 'ZZ', kind: 'bus', city: 'larnaka', from: day(-1) }, 'unknown sensor'], [{ eui: 'B1', kind: 'boat', city: 'larnaka', from: day(-1) }, 'unknown kind'], [{ eui: 'B1', kind: 'bus', city: 'atlantis', from: day(-1) }, 'unknown city'], [{ eui: 'B1', kind: 'bus', city: 'larnaka', from: day(3) }, 'a date in the future'], [{ eui: 'B1', kind: 'bus', city: 'larnaka', from: day(-40) }, 'a move dated before the earlier line']]) {
    rejected = null; try { await A.putAssignments({ rev: 1, sensors: [bad] }, {}); } catch (e) { rejected = e; }
    ok(rejected && rejected.status === 400, 'assignments: ' + why + ' is refused');
  }
  // a move: B1 goes from the Limassol classroom to a Lefkosia bus today. A reading taken before today stays with Limassol.
  v = await A.putAssignments({ rev: 1, sensors: [{ eui: 'B1', kind: 'bus', city: 'lefkosia', from: day(0) }] }, { id: 7, role: 'teacher' });
  const b1 = v.sensors.find((x) => x.eui === 'B1');
  ok(v.rev === 2 && b1.reviewed.city === 'lefkosia' && b1.earlier.length === 1 && b1.earlier[0].city === 'limassol' && b1.earlier[0].to === day(0), 'assignments: a move ends the earlier line on the day the new one starts');
  const midnight = Date.parse(day(0) + 'T00:00:00Z');
  latest = { B1: { 4097: { v: 21, t: iso(Math.max(midnight, now - 60000)) }, 4100: { v: 500, t: iso(midnight - 60000) } } };   // temperature just now (after the move), CO2 a minute before midnight (before it)
  ev = await A.evidenceFor('lefkosia', ['sensecap-buses']);
  ok(ev.rows.some((r) => r.variable === 'temperature') && !ev.rows.some((r) => r.variable === 'co2'), 'assignments: after a move, only readings taken since the move count for the new place');
  ok(A.placeOf({ eui: 'B1', name: 'Larnaka bus 1' }, midnight - 1).city === 'limassol' && A.placeOf({ eui: 'B1', name: 'Larnaka bus 1' }, midnight).city === 'lefkosia', 'assignments: the day boundary is exact (up to, but not including, the day of the move)');
  ok(A.placeOf({ eui: 'B1', name: 'Larnaka bus 1' }, Date.parse(day(-60) + 'T00:00:00Z')).city === null, 'assignments: before its first reviewed line a reviewed sensor belongs nowhere (the name is not used again)');
  const hist = fs.readFileSync(path.join(dir, 'layers-assignments-history.jsonl'), 'utf8').trim().split('\n');
  ok(hist.length === 2 && JSON.parse(hist[0]).rev === 1 && JSON.parse(hist[1]).rev === 2 && JSON.parse(hist[1]).by.role === 'teacher', 'assignments: every revision is kept in the history file, with who saved it');
  const L3 = createLayers({ root: path.join(__dirname, '..', '..'), dataDir: dir, data, pulse: false, log: () => {} });
  ok((await L3._t.assignmentsView()).rev === 2, 'assignments: the list survives a restart');
  v = await A.putAssignments({ rev: 2, sensors: [{ eui: 'B2', clear: true }] }, {});
  ok(v.sensors.find((x) => x.eui === 'B2').reviewed === null && A.placeOf({ eui: 'B2', name: 'Sensor 7', group: 'spare' }).reviewed === false, 'assignments: a sensor can be taken off the list again');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
