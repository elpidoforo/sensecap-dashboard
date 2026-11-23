// Live Board arithmetic. Run: node tests/viz/live_test.js
'use strict';
const path = require('path');
const L = require(path.join(__dirname, '../../public/site/viz/live-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const near = (a, b, e) => Math.abs(a - b) < (e || 1e-9);
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const NOW = Date.parse('2026-11-23T18:00:00Z');
// made-up input (Demo data, only for the test)
const A = { available: true, refreshSeconds: 600, attribution: 'Weather Data Copyright X', features: [
  { id: 'A', name: 'Alpha', lat: 35.0, lng: 33.0, time: '2026-11-23T17:55:00Z', temp: 20, humidity: 50, wind: 4, windFrom: 270, rain10min: 0, rain24h: 0 },
  { id: 'B', name: 'Beta', lat: 35.0, lng: 34.0, time: '2026-11-23T17:55:00Z', temp: 30, humidity: 40, wind: 4, windFrom: 180, rain10min: 0.4 },
  { id: 'C', name: 'Gamma', lat: 34.7, lng: 33.5, time: '2026-11-23T16:00:00Z', temp: 99, wind: 50, windFrom: 0, rain10min: 9 },
  { id: 'D', name: 'Delta', lat: 34.8, lng: 33.2, time: '2026-11-23T17:58:00Z', temp: null, humidity: null, wind: null, windFrom: null },
  { id: 'E', name: 'NoPlace', time: '2026-11-23T17:58:00Z', temp: 10 } ] };
const w = L.uv(4, 270); ok(near(w.u, 4, 1e-9) && near(w.v, 0, 1e-9), 'wind from the west blows toward the east');
const s2 = L.uv(4, 180); ok(near(s2.u, 0, 1e-9) && near(s2.v, 4, 1e-9), 'wind from the south blows toward the north');
ok(L.uv(null, 10) === null && L.uv(3, null) === null, 'no wind value gives no vector');
ok(L.compass(0)[0] === 'north' && L.compass(225)[0] === 'south-west' && L.compass(359)[0] === 'north' && L.compass(null) === null, 'compass words');
const m = L.stations(A, NOW);
ok(m.available && m.total === 4 && m.fresh === 3, 'a station with no place is left out; one old reading is not fresh');
ok(m.list[2].stale && m.list[2].ageS === 7200 && !m.list[0].stale && m.list[0].ageS === 300, 'age and the old-reading rule (more than two refresh intervals)');
ok(m.list[3].temp === null && m.list[3].u === null && m.list[3].rain10 === null, 'missing values stay null, never 0');
const f = L.field(m, 35.0, 33.0); ok(f && f.temp > 20 && f.temp < 21 && f.u > 3, 'at a station the field is close to that station');
const mid = L.field(m, 35.0, 33.5); ok(near(mid.temp, 25, 1e-6) && near(mid.u, 2, 1e-6) && near(mid.v, 2, 1e-6), 'halfway between two stations is their mean');
ok(mid.temp < 31 && Math.hypot(mid.u, mid.v) < 5, 'the old reading (99 degrees, 50 m/s) takes no part in the field');
const none = L.stations({ available: true, refreshSeconds: 600, features: [A.features[2]] }, NOW); ok(L.field(none, 35, 33) === null, 'only old readings: no field at all');
const off = L.stations({ available: false, reason: ['not answering', 'δεν απαντά'] }, NOW); ok(!off.available && off.total === 0 && pairOk(off.reason) && L.field(off, 35, 33) === null, 'unavailable answer: the reason, no stations, no field');
const off2 = L.stations(null, NOW); ok(!off2.available && pairOk(off2.reason), 'missing answer: an honest sentence');
const B = JSON.parse(JSON.stringify(A)); B.features[0].time = '2026-11-23T18:05:00Z'; B.features[0].temp = 21;
const d = L.diff(m, L.stations(B, NOW + 300000)); ok(d.length === 1 && d[0].id === 'A' && d[0].temp === 21, 'diff finds the one station with a new reading');
ok(L.diff(m, L.stations(A, NOW + 1000)).length === 0 && L.diff(null, m).length === 0, 'same answer again or a first answer: nothing new');
const sc = L.tempScale(m); ok(sc.min === 20 && sc.max === 30, 'temperature scale from fresh readings only');
ok(L.tempScale(none) === null, 'no fresh temperature: no scale');
const r = L.raining(m); ok(r.length === 1 && r[0].id === 'B', 'raining: fresh stations with rain above zero, in source order');
ok(m.list.every((s) => pairOk(s.line) && pairOk(s.age)) && L.textRows(m).every(pairOk), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(/old reading/.test(m.list[2].line[0]) && /estimated from the nearest stations/.test(L.textRows(m).map((x) => x[0]).join(' ')), 'old readings and the estimate are said in words');
ok(/Test values/.test(L.textRows(L.stations(Object.assign({ demo: true }, A), NOW))[0][0]), 'test values are labelled first');
const q1 = L.points({ available: true, features: [{ id: 'q1', lat: 34.8, lng: 32.3, magnitude: 3.1, time: 't1', place: 'P' }] }, 'quake'), q2 = L.points({ available: true, features: [{ id: 'q1', lat: 34.8, lng: 32.3 }, { id: 'q2', lat: 35, lng: 33, magnitude: 2 }, { id: 'bad' }] }, 'quake');
ok(q2.list.length === 2 && L.fresh(q1, q2).length === 1 && L.fresh(q1, q2)[0].id === 'q2' && L.fresh(null, q2).length === 0, 'new events are those with an unseen id; a first answer shows none as new');
const fx = L.points({ available: false, reason: ['test mode', 'απενεργοποιημένο'] }, 'fire'); ok(!fx.available && fx.list.length === 0 && pairOk(fx.reason), 'unavailable satellite feed: no points');
ok(L.points({ available: true, features: [{ lat: 35, lng: 33, time: 'a' }, { lat: 35, lng: 33, time: 'b' }] }, 'fire').list.map((p) => p.id).join() !== 'x' && new Set(L.points({ available: true, features: [{ lat: 35, lng: 33, time: 'a' }, { lat: 35, lng: 33, time: 'b' }] }, 'fire').list.map((p) => p.id)).size === 2, 'points without an id get a stable one from place and time');
console.log('live: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
