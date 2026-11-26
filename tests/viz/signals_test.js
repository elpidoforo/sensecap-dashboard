// Signals over Cyprus: the model. Run: node tests/viz/signals_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/signals-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const NOW = Date.UTC(2026, 10, 26, 19, 30), ago = (min) => new Date(NOW - min * 60000).toISOString();
// made-up answers (Demo data, only for the test)
const met = { refreshSeconds: 600, features: [
  { id: 'A', name: 'Alpha', lat: 35.0, lng: 33.3, time: ago(5), temp: 18.2, wind: 3.1, rain10min: 0 },
  { id: 'B', name: 'Beta', lat: 34.8, lng: 32.6, time: ago(8), temp: 21.6, wind: 1.0, rain10min: 0.4 },
  { id: 'C', name: 'Old', lat: 35.1, lng: 33.9, time: ago(300), temp: 40, wind: 30, rain10min: 9 },
  { id: 'D', name: 'Nowhere', time: ago(2), temp: 19.0 },
  { id: 'E', name: 'Far', lat: 40, lng: 20, time: ago(2), temp: 20.0, wind: 2 }, null] };
const quakes = { features: Array.from({ length: 70 }, (_, i) => ({ id: 'q' + i, lat: 34.9, lng: 33.0, time: ago(i * 60), magnitude: 3 })) };
const m = D.build({ met, airports: { available: false, reason: ['Switched off.', 'Εκτός.'] }, fires: { features: [] }, quakes }, NOW);
const S = (id) => m.sources.find((s) => s.id === id), C = (id) => m.cards.find((c) => c.id === id);
ok(m.available && m.sources.map((s) => s.id).join() === 'met,airports,air,fires,quakes', 'five sources in a fixed order');
ok(S('met').total === 5 && S('met').placed.length === 3 && S('met').outside === 2, 'records without a place, or outside the drawing, are counted but not placed');
ok(!S('airports').available && S('airports').reason[1] === 'Εκτός.' && S('airports').placed.length === 0 && S('airports').start === null, 'a source that is off keeps its reason and sends nothing');
ok(!S('air').available && pairOk(S('air').reason), 'a source with no answer is "not answering"');
ok(S('fires').available && S('fires').total === 0, 'an answer with no records is an answer');
ok(S('quakes').placed.length === 60 && S('quakes').left === 10 && S('quakes').placed[0].id === 'q0', 'only the newest 60 records are placed and the rest are counted');
ok(C('temp').known && C('temp').lo === 18.2 && C('temp').hi === 21.6 && C('temp').n === 4 && /18\.2 to 21\.6 °C/.test(C('temp').text[0]) && /18,2 έως 21,6/.test(C('temp').text[1]), 'temperature range from fresh readings only (the old 40 °C is left out)');
ok(C('wind').hi === 3.1 && C('wind').lo === 1.0, 'wind range from fresh readings only');
ok(/1 of 2 stations/.test(C('rain').text[0]), 'rain: how many fresh stations with a rain reading saw rain');
ok(!C('pm25').known && C('pm25').text[0] === 'not answering right now' && !C('pm10').known, 'cards of a silent source say so; they do not show zero');
ok(C('fires').known && C('fires').text[0] === '0 detections' && C('quakes').text[0] === '70 events', 'counts, with zero as a real answer');
const one = D.build({ met: { features: [{ id: 'A', lat: 35, lng: 33, time: ago(1), temp: 20 }] } }, NOW); ok(one.cards[0].text[0] === '20.0 °C' && one.cards[1].text[0] === 'no reading', 'one reading is a value, not a range; a missing measure is "no reading"');
ok(m.totals.answering === 3 && m.totals.records === 75 && m.totals.placed === 63, 'totals');
ok(/3 of 5 sources answered at 19:30 UTC with 75 records; 63 are placed/.test(m.textRows[0][0]), 'headline');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.sources.every((s) => pairOk(s.name) && pairOk(s.sub)) && m.cards.every((c) => pairOk(c.name) && pairOk(c.text)), 'every string is an [en, el] pair, no guillemets');
ok(m.textRows.some((r) => /arrived together in one fetch/.test(r[0])) && m.textRows.some((r) => /10 older ones not drawn/.test(r[0])), 'the walk-through and the cap are explained');
ok(!m.demo && D.build({ met: Object.assign({ demo: true }, met) }, NOW).textRows.some((r) => /Test values/.test(r[0])), 'test values are named as test values');
ok(C('temp').values.join() === '18.2,21.6,19,20' && C('quakes').values.length === 40 && C('fires').values === undefined, 'the small bars carry the readings themselves, in the order given, never more than 40');
ok(m.ticker.length === 63 && /^Alpha 18\.2 °C wind 3\.1 m\/s$/.test(m.ticker[0].text[0]) && /^M 3\.0 /.test(m.ticker[5].text[0]) && m.ticker.every((t) => pairOk(t.text)), 'one short line per placed record for the running line');
// the clock
const a0 = D.at(m, 0), mid = D.at(m, S('met').start + 250), end = D.at(m, m.duration);
ok(a0.active === -1 && a0.landed === 0 && a0.cards.every((v) => v === 0), 'nothing is lit before the first source');
ok(mid.active === 0 && mid.lit.met === 0.5 && mid.cards[0] === 0.5 && mid.cards[3] === 0 && mid.landed === 0, 'a source lights its own cards only');
ok(S('fires').start > S('met').start && S('quakes').start > S('fires').start && S('quakes').start - S('fires').start === S('fires').start - S('met').start, 'silent sources take no slot in the walk');
ok(end.done && end.landed === 63 && m.sources.every((s) => s.placed.every((r) => r.at >= s.start && r.at + m.fall <= m.duration)), 'at the end every placed record has landed');
const e = D.build({}, NOW); ok(!e.available && pairOk(e.empty) && e.duration === 0 && e.cards.every((c) => !c.known), 'honest empty state');
ok(D.build(null, undefined).when[0] === 'time not stated', 'a missing time is said to be missing');
console.log('signals: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
