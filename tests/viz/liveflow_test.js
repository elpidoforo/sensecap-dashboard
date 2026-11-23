// Live Board pipeline: one run per fetch. Run: node tests/viz/liveflow_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/liveflow-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const NOW = Date.parse('2026-11-23T18:00:00Z');
// made-up answers (Demo data, only for the test)
const met = { available: true, refreshSeconds: 600, features: [
  { id: 'A', name: 'Alpha', lat: 35, lng: 33, time: '2026-11-23T17:55:00Z', temp: 20, wind: 4, windFrom: 270, humidity: 50, rain10min: 0 },
  { id: 'B', name: 'Beta', lat: 35, lng: 34, time: '2026-11-23T15:00:00Z', temp: 30, wind: 2, windFrom: 90 } ] };
const air = { available: true, refreshSeconds: 1800, features: [{ id: 'N', name: 'North', pm25: 8.04, pm10: 18, pm25HourEnds: '2026-11-23T17:30:00Z' }, { id: 'S', name: 'South', pm25: null, pm10: 30, pm10HourEnds: '2026-11-23T10:00:00Z' }] };
const quakes = { available: true, features: [{ id: 'q1', lat: 34.8, lng: 32.3, magnitude: 3.1, time: '2026-10-01T00:00:00Z', place: 'P' }] };
const fires = { available: false, reason: ['test mode', 'απενεργοποιημένο'] };
const r1 = D.build({ met, air, quakes, fires }, null, NOW);
ok(r1.feeds.map((f) => f.id).join() === 'met,airports,air,fires,quakes', 'feeds in a fixed order, never sorted');
ok(r1.feeds[0].total === 2 && r1.feeds[0].fresh === 1 && r1.feeds[0].added === 0 && r1.feeds[0].first, 'first run: counts, one old reading, nothing called new');
ok(r1.feeds[0].dots.length === 2 && r1.feeds[0].dots[1].state === 'old' && !r1.feeds[0].dots[0].isNew, 'one dot per station with its state');
ok(!r1.feeds[1].available && r1.feeds[1].total === 0 && pairOk(r1.feeds[1].reason), 'a missing answer is not answering and counts nothing');
ok(!r1.feeds[3].available && r1.feeds[3].reason[0] === 'test mode' && /test mode/.test(r1.feeds[3].line[0]), 'an unavailable feed keeps its own reason');
ok(r1.feeds[2].total === 2 && r1.feeds[2].fresh === 1 && /PM2\.5 8\.0, PM10 18\.0/.test(r1.feeds[2].newest.text[0]) && /mean of one hour/.test(r1.feeds[2].newest.text[0]), 'air stations: hourly means, freshness from the hour stamp');
ok(r1.feeds[4].total === 1 && /magnitude 3\.1/.test(r1.feeds[4].newest.text[0]), 'earthquake list: latest event in words');
ok(r1.totals.feeds === 5 && r1.totals.answering === 3 && r1.totals.records === 5 && r1.totals.fresh === 3 && r1.totals.added === 0, 'totals count only feeds that answered');
const met2 = JSON.parse(JSON.stringify(met)); met2.features[0].time = '2026-11-23T18:05:00Z'; met2.features[0].temp = 21;
const air2 = JSON.parse(JSON.stringify(air)); air2.features[0].pm25HourEnds = '2026-11-23T18:30:00Z';
const quakes2 = { available: true, features: quakes.features.concat([{ id: 'q2', lat: 35, lng: 33, magnitude: 2.2, time: '2026-11-23T18:01:00Z' }]) };
const r2 = D.build({ met: met2, air: air2, quakes: quakes2, fires }, r1, NOW + 6 * 60000);
ok(r2.feeds[0].added === 1 && r2.feeds[0].dots[0].isNew && !r2.feeds[0].dots[1].isNew && /1 new since the last fetch/.test(r2.feeds[0].line[0]), 'second run: the one station with a new time stamp is new');
ok(r2.feeds[2].added === 1 && r2.feeds[4].added === 1 && r2.totals.added === 3, 'new hour at an air station and a new earthquake id are counted as new');
const r3 = D.build({ met: met2, air: air2, quakes: quakes2, fires }, r2, NOW + 7 * 60000);
ok(r3.totals.added === 0, 'the same answers again: nothing new');
ok(D.build({ met: Object.assign({ demo: true }, met) }, null, NOW).totals.demo === true && /test values/.test(D.build({ met: Object.assign({ demo: true }, met) }, null, NOW).feeds[0].line[0]), 'test values are flagged');
ok([r1, r2].every((r) => r.textRows.every(pairOk) && pairOk(r.ariaLabel) && r.feeds.every((f) => pairOk(f.name) && pairOk(f.sub) && pairOk(f.sheet) && pairOk(f.noun) && pairOk(f.line))) && r1.stages.every(pairOk), 'every string is an [en, el] pair, no guillemets or em dashes');
const walk = (o, bad) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (/^(rank|score|best|worst)$/i.test(k)) bad.push(k); walk(o[k], bad); } return bad; };
ok(walk(r2, []).length === 0, 'no rank or score field anywhere');
const e = D.build(null, null, NOW); ok(e.totals.answering === 0 && e.totals.records === 0 && e.feeds.every((f) => !f.available), 'no answers at all: five feeds, none answering');
console.log('liveflow: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
