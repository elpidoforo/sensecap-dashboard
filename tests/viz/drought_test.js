// Drought watch: the model. Run: node tests/viz/drought_test.js
'use strict';
const path = require('path'), fs = require('fs');
const D = require(path.join(__dirname, '../../public/site/viz/drought-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
// classes (WMO SPI User Guide 2012)
ok(D.classify(-2).id === 'xdry' && D.classify(-1.99).id === 'sdry' && D.classify(-1.5).id === 'sdry' && D.classify(-1.49).id === 'mdry' && D.classify(-1).id === 'mdry', 'dry classes; -2.0 itself is extremely dry, -1.0 itself moderately dry');
ok(D.classify(-0.99).id === 'normal' && D.classify(0).id === 'normal' && D.classify(0.99).id === 'normal' && D.classify(1).id === 'mwet' && D.classify(1.5).id === 'vwet' && D.classify(2).id === 'xwet', 'normal and wet classes');
ok(D.classify(null) === null && D.classify('1') === null && D.classify(NaN) === null, 'a missing value has no class');
ok(D.fmt(1.3) === '+1.30' && D.fmt(-0.5, true) === '−0,50' && D.fmt(0) === '0.00' && D.fmt(null) === '–', 'numbers are written with a sign, a comma in Greek, and a dash when missing');
ok(D.monthText('2026-04')[1] === 'Απρίλιος 2026' && D.monthText('2026-13') === null && D.monthText('x') === null, 'months by name; a bad month is refused');
// made-up sheets (Demo data, only for the test)
const demo = { windows: [1, 12, 48], reference: '1971-2010', source: ['Demo', 'Δοκιμή'], confirmed: false,
  regions: [{ id: 'b', name: ['Beta', 'Βήτα'] }, { id: 'a', name: ['Alpha', 'Άλφα'] }, { name: ['no id', 'x'] }],
  sheets: [
    { ym: '2026-04', waterYearFrom: '2025-10', cumulativeMm: 500, cumulativeNormalMm: 400, cyprus: [1.2, 0.5, -1.0], byRegion: { b: [1, 2, 3], a: [0.1, 'x', -2] }, flags: {} },
    { ym: '2025-09', waterYearFrom: '2024-10', cumulativeMm: 300, cumulativeNormalMm: 0, cyprus: [-0.5, -1.6], byRegion: { b: null }, flags: { b: ['Flagged.', 'Με σημείωση.'] } },
    { ym: 'nonsense', cyprus: [9, 9, 9] }] };
const m = D.build(demo);
ok(m.available && m.sheets.map((s) => s.ym).join() === '2025-09,2026-04', 'sheets are put in time order; a sheet with a bad month is dropped');
ok(m.regions.map((r) => r.id).join() === 'b,a', 'regions keep the given order (no ranking) and need an id');
const s0 = m.sheets[0], s1 = m.sheets[1];
ok(s0.cyprus[2] === null && s0.classes[2] === null && s0.pct === null, 'a missing window stays missing; a share of a zero usual amount is not computed');
ok(s1.pct === 125 && s1.regions[1].values[1] === null && s1.regions[1].classes[2].id === 'xdry', 'share of the usual rain; a non-number in a region stays missing');
ok(s0.regions[0].values === null && s0.regions[0].flag[1] === 'Με σημείωση.' && s0.regions[1].values === null, 'a flagged or absent region has no values');
ok(/near normal \(\+0\.50\), but the last 48 months together are still moderately dry \(−1\.00\)/.test(s1.say[0]) && /does not erase/.test(s1.say[0]), 'the sentence for a wet year after dry years');
ok(s0.say === null, 'no sentence when the long window is missing');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.classes.every((c) => pairOk(c.n)), 'every string is an [en, el] pair, no guillemets');
ok(m.textRows.some((r) => /rain only/.test(r[0])) && m.textRows.some((r) => /not been confirmed/.test(r[0])), 'rain-only and not-confirmed notes are in the text');
ok(!D.build(Object.assign({}, demo, { confirmed: true })).textRows.some((r) => /not been confirmed/.test(r[0])), 'the not-confirmed note goes when the data are confirmed');
ok(!D.build({}).available && !D.build({ windows: [1], sheets: [] }).available && pairOk(D.build(null).empty), 'honest empty state');
// the walk between two sheets
const dur = D.duration(m), first = D.move(m, 0, 1, 0), early = D.move(m, 0, 1, 500 + 3 * 330 + 100), mid = D.move(m, 0, 1, 500 + 3 * 330 + 1500 + 1200), end = D.move(m, 0, 1, dur);
ok(first.phase === 'a' && first.rows.every((r) => r.shown === 0), 'nothing is shown at the start');
ok(early.phase === 'a' && early.rows[0].value === -0.5 && early.rows[0].of === 'a' && early.rows[0].shown === 1, 'first the earlier sheet, with its published values');
ok(mid.phase === 'moving' && mid.rows[0].value === null && mid.rows[0].pos > -0.5 && mid.rows[0].pos < 1.2, 'on the way a dot has a position but NO value');
ok(mid.rows[2].pos === null && mid.rows[2].from === null, 'a window missing in the earlier sheet does not travel');
ok(end.phase === 'b' && end.done && end.rows.map((r) => r.value).join() === '1.2,0.5,-1' && end.rows[2].pos === -1, 'at the end every dot is on the later sheet\'s published value');
// the real file
const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/site/data/drought.json'), 'utf8')), R = D.build(real);
ok(R.available && R.windows.join() === '1,3,6,9,12,24,36,48,60' && R.regions.length === 7 && R.sheets.length >= 2, 'the data file loads: nine windows, seven regions');
ok(R.sheets.every((s) => s.cyprus.length === 9 && s.cyprus.every((v) => v !== null && Math.abs(v) < 4) && s.url && s.pct > 0), 'every sheet has nine Cyprus values in a sane range, a link and a share');
ok(R.sheets.every((s) => s.regions.every((r) => (r.values && r.values.length === 9 && r.values.every((v) => v !== null && Math.abs(v) < 4)) || (r.values === null && r.flag))), 'every region has nine values or a stated reason');
ok(R.confirmed === false && pairOk(R.confirmNote) && pairOk(R.source) && /^https:\/\/www\.dom\.org\.cy\//.test(R.sourceUrl), 'the file says it is not yet confirmed and names its source');
ok(R.textRows.every(pairOk), 'the real text rows are all pairs');
console.log('drought: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
