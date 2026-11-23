// argo widget: the model builder. Run: node tests/viz/argo_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/argo-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test)
const made = { float: '0000001', retrieved: '2026-01-01', cycles: [
  { file: 'R_002.nc', cycle: '002', profiles: [
    { index: 0, time: '2024-07-11T03:53:00Z', lat: -34.3456, lon: -33.0549, positionQC: '4', mode: 'R', n: 2, p: [10, 20], t: [20, 19], s: [39, 39.1], pq: '11', tq: '11', sq: '11' }] },
  { file: 'R_001.nc', cycle: '001', profiles: [
    { index: 0, time: '2024-07-06T01:52:20Z', lat: 34.3448, lon: 33.0959, positionQC: '1', mode: 'R', n: 6,
      p: [10, 50, 100, null, 400, 1000], t: [26.5, 20, null, 15, 14.25, 13.75], s: [39.4, 39.2, 39.1, 39, 0, 38.8], pq: '111114', tq: '114111', sq: '13111 ' },
    { index: 1, time: '2024-07-06T01:52:20Z', lat: 34.3448, lon: 33.0959, positionQC: '1', mode: 'R', n: 2, p: [0, 2.5], t: [26.6, 26.55], s: [39.41, 39.4], pq: '11', tq: '31', sq: '33' }] },
  { file: 'D_003.nc', cycle: '003', profiles: [
    { index: 0, time: '2024-12-16T05:53:20Z', lat: 34.3, lon: 32.9, positionQC: '1', mode: 'D', n: 2, p: [10, 20], t: [20, 19], s: [39, 39.1], pq: '11', tq: '11', sq: '44',
      pa: [10.1, 20.1], ta: [20.002, null], sa: [39.01, 39.11], paq: '11', taq: '1 ', saq: '11' }] },
] };
const m = D.build(made);
ok(m.available && m.choices.map((c) => c.id).join() === '001,002,003' && m.cycle === '001' && m.qc === 'good' && m.range === 'full', 'dives in time order; first dive, good-only filter and whole range by default');
ok(m.counts.levels === 7 && m.noPressure === 1, 'a level with no pressure is counted and not drawn');
ok(m.levels.map((l) => l.p).join() === '2.5,10,50,100,400', 'levels ordered by pressure; bad pressure (flag 4) and fully flagged levels are left out under good-only');
const l50 = m.levels.find((l) => l.p === 50), l100 = m.levels.find((l) => l.p === 100), l400 = m.levels.find((l) => l.p === 400), l25 = m.levels.find((l) => l.p === 2.5);
ok(l50.tShow && !l50.sShow && l50.sx === null && /salinity not shown \(flag 3, probably bad\)/.test(l50.label[0]), 'a value flagged 3 is hidden under good-only and the label says why');
ok(l100.t === null && !l100.tShow && l100.tx === null && l100.sShow && /temperature missing/.test(l100.label[0]), 'a missing value stays null and is called missing');
ok(l400.s === 0 && l400.sShow && l400.sGood, 'a measured zero is a value, not a gap');
ok(l25.scheme === 1 && l25.tShow && !l25.sShow && /Second profile near the surface/.test(l25.label[0]), 'second profile in the file is kept apart and labelled');
ok(m.counts.tShown === 4 && m.counts.tHave === 6 && m.counts.sShown === 3 && m.counts.sHave === 7 && /Temperature: 4 of 6 values shown\. Salinity: 3 of 7 values shown/.test(m.countText[0]), 'both counts travel with the filter');
const a = D.select(m, { qc: 'all' });
ok(a.qc === 'all' && a.cycle === '001' && a.levels.length === 7 && a.levels[0].p === 0 && a.levels[0].tShow && !a.levels[0].tGood && a.counts.tShown === 6 && a.counts.sShown === 7, 'all values: flagged values are shown and still carry their flags');
ok(/flag 3, probably bad/.test(a.levels[0].label[0]) && a.levels[a.levels.length - 1].pq === '4', 'flags are readable on every value in the all-values view');
const top = D.select(a, { range: 'top' });
ok(top.range === 'top' && top.pTop === 300 && top.levels.every((l) => l.p <= 300) && top.levels.length === 5 && top.qc === 'all' && top.levels[4].y === 100 / 300, 'top 300 dbar keeps the filter and rescales pressure only');
ok(m.scales.p.min === 0 && m.scales.p.max === 1000 && m.scales.t.min === 13 && m.scales.t.max === 27 && Math.abs(m.scales.s.min - 0) < 1e-9 && D.select(m, { cycle: '002' }).scales === m.scales, 'one fixed scale for every dive');
ok(l50.y === 0.05 && Math.abs(l50.tx - 0.5) < 1e-9, 'positions are value over the fixed scale');
const b = D.select(m, { cycle: '002' });
ok(!b.positionGood && b.levels.length === 0 && b.counts.tShown === 0 && b.counts.tHave === 2 && /no value of this dive is shown/.test(b.posText[0]), 'a dive whose position is not flagged good shows nothing under good-only, and says so');
ok(D.select(b, { qc: 'all' }).levels.length === 2, 'the same dive is fully visible with all values');
ok(b.place[0] === '34.35° S, 33.05° W' && m.place[0] === '34.34° N, 33.10° E' && m.place[1] === '34.34° Β, 33.10° Α', 'place is the rounded float position as text');
ok(m.dateText[0] === '6 July 2024, 01:52 UTC' && m.dateText[1] === '6 Ιουλίου 2024, 01:52 UTC', 'date read as written, UTC');
const d = D.select(m, { cycle: '003' });
ok(d.levels[0].p === 10.1 && d.levels[0].t === 20.002 && d.levels[0].adjusted && d.levels[0].sShow && d.levels[0].s === 39.01 && /Adjusted value/.test(d.levels[0].label[0]), 'adjusted values and their flags are preferred where the file has them');
ok(d.levels[1].t === 19 && d.levels[1].tq === '1' && d.nAdjusted === 2 && /adjusted values from the source/.test(d.valueKind[0]) && /real-time values/.test(m.valueKind[0]), 'a missing adjusted value falls back to the real-time one; the kind of value is labelled');
ok(D.select(m, { cycle: '999' }) === m && D.select(m, {}) === m && D.select(m, { qc: 'good' }) === m, 'unknown dive or unchanged choice keeps the current view');
ok([m, a, top, b, d].every((v) => v.textRows.every(pairOk) && pairOk(v.ariaLabel) && v.levels.every((l) => pairOk(l.label))) && Object.keys(m.strings).every((k) => pairOk(m.strings[k])) && m.choices.concat(m.qcChoices, m.rangeChoices).every((c) => pairOk(c.name)), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(m.textRows.some((r) => /One float is not the sea around Cyprus/.test(r[0])) && /One float is not the sea around Cyprus/.test(m.ariaLabel[0]), 'the limit sentence travels with the picture');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0, 'honest empty state');

// the real file, with the check values from the pack (START_HERE_CLAUDE_DAY_3.txt step 4, reading_guide.txt finding 3, manifest.csv)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/argo.json')); } catch (err) { console.log('note: public/site/data/argo.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.choices.length === 6 && r.choices.map((c) => c.id).join() === '011,012,013,014,015,016', 'six source cycles are selectable, in time order');
  ok(real.float === '3902484' && r.floatId === '3902484' && r.totalLevels === 6101 && real.levels === 6101, 'one float, 3902484; 6,101 levels');
  const per = r.choices.map((c) => r.cycles[c.id].all.length);
  ok(per.join() === '1014,1016,1021,1018,1011,1021' && per.reduce((x, y) => x + y, 0) === 6101, 'levels per file match the manifest: 1014, 1016, 1021, 1018, 1011, 1021');
  ok(r.choices[0].name[0] === '6 July 2024 (dive 011)' && r.choices[5].name[0] === '31 July 2024 (dive 016)' && r.choices.every((c) => /July 2024/.test(c.name[0])), 'dives of 6 to 31 July 2024 only');
  ok(r.notes.some((n) => /December 2024 returned no profiles/.test(n[0])) && pairOk(r.strings.noDec), 'the absence of December profiles is said');
  ok(r.cycle === '011' && r.qc === 'good' && r.dateText[0] === '6 July 2024, 01:52 UTC' && r.place[0] === '34.34° N, 33.10° E' && r.positionGood, 'first dive: 6 July 2024 01:52 UTC near 34.34 N, 33.10 E, position flagged good');
  ok(r.counts.levels === 1014 && r.counts.tShown === 1013 && r.counts.sShown === 1010 && r.levels.length === 1013, 'dive 011, good only: 1013 of 1014 temperatures and 1010 of 1014 salinities');
  const first = r.cycles['011'].all.find((l) => l.scheme === 0);
  ok(first.p === 5.7 && first.t === 26.218 && first.s === 39.376 && first.pq === '1' && first.tq === '1' && first.sq === '1', 'first level of the main profile: 5.7 dbar, 26.218 degrees C, 39.376 psu, all flagged 1');
  const all = D.select(r, { qc: 'all' });
  ok(all.levels.length === 1014 && all.counts.tShown === 1014 && all.levels[0].scheme === 1 && all.levels[0].p === 0.2 && all.levels[0].tq === '3' && all.levels[0].sq === '3', 'all values: 1014 levels; the near-surface profile carries the source flag 3');
  ok(r.choices.every((c) => { const cy = r.cycles[c.id]; return cy.schemes.length === 2 && cy.schemes[1].n === 4 && cy.dataMode === 'R' && cy.nAdjusted === 0 && cy.noPressure === 0 && cy.positionGood; }), 'every file: two profiles (the second has 4 levels), real-time mode, no adjusted values, good position');
  ok(r.scales.p.max === 2100 && r.scales.t.min === 13 && r.scales.t.max === 31 && r.scales.s.min === 38.7 && r.units.p === 'dbar' && r.units.s === 'psu', 'fixed scales from the data; units as the source names them');
  ok(real.cycles.every((c) => c.profiles.every((p) => p.p.length === p.n && p.t.length === p.n && p.s.length === p.n && p.pq.length === p.n && p.tq.length === p.n && p.sq.length === p.n)), 'every value in the file has its flag');
  ok(real.cycles.every((c) => c.profiles.every((p) => p.p.every((v) => v === null || Math.abs(v * 10 - Math.round(v * 10)) < 1e-6))) && /0\.1 dbar/.test(real.precision), 'pressure stored to 0.1 dbar and the file says so');
  const s = real.sources[0];
  ok(real.sources.length === 1 && s.doi === '10.17882/42182' && /International Argo Program/.test(s.credit) && pairOk(s.what) && real.retrieved === '2026-11-21' && real.notes.every(pairOk), 'credit, DOI, retrieval date and notes are in the file');
  ok(r.choices.every((c) => ['good', 'all'].every((q) => { const v = D.select(r, { cycle: c.id, qc: q }); return v.textRows.every(pairOk) && pairOk(v.ariaLabel) && v.textRows.length < 60; })), 'real text rows are pairs for every dive and filter');
  ok(D.select(r, { range: 'top' }).levels.every((l) => l.p <= 300) && D.select(r, { range: 'top' }).levels.length > 100, 'top 300 dbar view has the upper levels only');
}
console.log('argo: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
