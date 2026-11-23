// quarters widget: the model builder. Run: node tests/viz/quarters_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/quarters-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»]/.test(s));

// made-up input (Demo data, only for the test)
const sq = (x, y) => [[[[x, y], [x + 0.01, y], [x + 0.01, y + 0.01], [x, y + 0.01], [x, y]]]];
const made = { features: [
  { code: '1', city: 'Pafos', name: 'Beta', residents: 200, age65plus: 50, validPixels: 1000, treePixels: 100, builtPixels: 800, polygons: sq(32.4, 34.7) },
  { code: '2', city: 'Pafos', name: 'Alpha', residents: null, age65plus: null, validPixels: 500, treePixels: 0, builtPixels: 500, polygons: sq(32.41, 34.7) },
  { code: '3', city: 'Larnaka', name: 'Gamma', residents: 0, age65plus: 0, validPixels: 0, treePixels: 0, builtPixels: 0, polygons: sq(33.6, 34.9) },
] };
const m = D.build(made, { city: 'Pafos' });
ok(m.available && m.city === 'Pafos' && m.quarters.length === 2, 'one city at a time');
ok(m.quarters[0].name === 'Alpha' && m.quarters[1].name === 'Beta', 'alphabetical order, not ranked');
ok(m.quarters[1].old === 25 && m.quarters[1].tree === 10, 'shares computed from the two counts');
ok(m.quarters[0].noCensus && m.quarters[0].old === null && m.quarters[0].tOld === null && m.quarters[0].residents === null, 'no census figure stays null, never 0');
ok(m.quarters[0].tree === 0 && m.quarters[0].tTree === 0, 'a real zero stays a zero');
const g = D.select(m, 'Larnaka').quarters[0];
ok(g.old === null && g.tree === null && !g.noCensus && /no residents counted/.test(g.oldText[0]), 'zero residents and zero pixels give no share, said in words');
ok(m.scales.old.max === 25 && m.scales.tree.max === 10 && D.select(m, 'Larnaka').scales === m.scales, 'one fixed scale shared by all cities');
ok(m.choices.map((c) => c.id).join() === 'Larnaka,Pafos', 'cities in the fixed order, only those present');
ok(m.quarters.every((q) => q.shape && !q.polygons && q.shape[0][0].every((p) => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1)), 'shapes projected into the unit box');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.notes.every(pairOk) && m.measures.every((x) => pairOk(x.name) && pairOk(x.of)), 'every string is an [en, el] pair, no guillemets');
ok(m.textRows.some((r) => /do not show that one causes the other/.test(r[0])), 'the not-a-cause sentence is in the text rows');
ok(/Beta: 50 of 200 residents aged 65 and over \(25\.00%\); tree class 100 of 1000 pixels \(10\.000%\)\./.test(m.quarters[1].label[0]), 'both counts travel with each share');
ok(D.select(m, 'Nowhere') === m, 'unknown city keeps the current view');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0, 'honest empty state');
ok(JSON.stringify(m).indexOf('rank') === -1 || /nothing is ranked/.test(JSON.stringify(m)), 'no ranking field');

// the real file
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/quarters.json')); } catch (err) { console.log('note: public/site/data/quarters.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real, { city: 'Larnaka' });
  ok(real.features.length === 65, '65 quarters in the file');
  const k = r.quarters.find((q) => q.code === '400010');
  ok(k && k.name === 'Kamares' && k.age65plus === 167 && k.residents === 480 && k.old.toFixed(2) === '34.79' && k.tree.toFixed(3) === '1.128', 'Kamares, Larnaka: 167 of 480 aged 65+, tree class 1.128%');
  const n = D.select(r, 'Lefkosia');
  ok(n.counts.quarters === 29 && n.counts.withCensus === 19, 'Lefkosia: 29 quarters, 10 without a census figure');
  ok(n.quarters.filter((q) => q.noCensus).every((q) => q.old === null && q.tree != null), 'quarters without census keep their land cover and no age share');
  ok(r.choices.length === 4 && ['Lemesos', 'Larnaka', 'Pafos'].every((c) => r.cities[c].counts.withCensus === r.cities[c].counts.quarters), 'four cities; the other three have a census figure for every quarter');
  ok(Object.keys(r.cities).every((c) => r.cities[c].textRows.every(pairOk)), 'real text rows are pairs');
  ok(real.censusDate === '2021-10-01' && real.geometryRetrieved === '2026-11-19' && real.sources.length === 3, 'dates and three sources are in the file');
}
console.log('quarters: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
