'use strict';
// node tests/viz/pipeline_test.js : pure data tests for public/site/viz/pipeline-data.js (no network)
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/pipeline-data.js'));
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const pair = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1];
const src = (id, count, sheetId, en) => ({ id, title: [en || id, 'Ελ ' + id], count, sheetId, sheetTitle: [(en || id) + ' sheet', 'Φύλλο ' + id] });

// per-record grid sizing
for (const n of [1, 2, 3, 7, 16, 17, 99, 100, 399, 400]) {
  const g = D.gridFor(n);
  ok(g.cells === n && !g.capped && g.per === 1 && g.label === null, 'one cell per record for ' + n);
  ok(g.cols * g.rows >= n && g.cols * g.rows - n < g.cols, 'grid ' + g.cols + 'x' + g.rows + ' fits ' + n + ' tightly');
}
eq(D.gridFor(0).cells, 0, 'zero records, zero cells');
// capped: fixed 20x20 with an honest label
for (const n of [401, 800, 1000, 1234, 5000, 123456]) {
  const g = D.gridFor(n);
  ok(g.capped && g.cols === 20 && g.rows === 20 && g.cells <= 400, 'fixed 20x20 for ' + n);
  ok(g.per === Math.ceil(n / 400), 'N computed for ' + n);
  ok((g.cells - 1) * g.per + g.last === n && g.last >= 1 && g.last <= g.per, 'cells cover exactly ' + n + ' records, nothing sampled');
  ok(g.label[0] === 'one cell = ' + D.fmt(g.per, 'en') + ' records' && pair(g.label) && /ένα κελί/.test(g.label[1]), 'label for ' + n);
}
eq(D.gridFor(800).label[0], 'one cell = 2 records', 'label text 800');
ok(D.gridFor(800).note === null && D.gridFor(401).note && /last cell/.test(D.gridFor(401).note[0]), 'last-cell note only when uneven');

// particle cap
const small = D.build({ sources: [src('a', 10, 's1'), src('b', 5, 's2')] });
eq(small.particles.count, 15, 'one particle per record when under the cap');
eq(small.particles.per, 1, 'per 1'); eq(small.particles.label, null, 'no particle label under cap');
eq(small.particles.bySource, [10, 5], 'particles by source');
const edge = D.build({ sources: [src('a', 600, 's1')] });
eq(edge.particles.count, 600, 'exactly the cap'); eq(edge.particles.per, 1, 'cap boundary is still 1:1');
for (const tot of [601, 1000, 1799, 4321, 100000]) {
  const m = D.build({ sources: [src('a', tot - 1, 's1'), src('b', 1, 's2')] });
  ok(m.particles.count <= D.PARTICLE_CAP && m.particles.count > 0, 'cap holds for total ' + tot);
  ok(m.particles.per === Math.ceil(tot / 600) && m.particles.list.length === m.particles.count, 'per computed for ' + tot);
  ok(m.particles.bySource.reduce((a, b) => a + b, 0) === m.particles.count, 'particles by source add up for ' + tot);
  ok(/one particle = /.test(m.particles.label[0]) && /ένα σωματίδιο/.test(m.particles.label[1]), 'particle label for ' + tot);
}
// a zero-count source gets no particles even between others
const zmid = D.build({ sources: [src('a', 700, 's1'), src('z', 0, 's2'), src('c', 700, 's3')] });
eq(zmid.particles.bySource[1], 0, 'empty source has no particles');
ok(zmid.particles.bySource[0] > 0 && zmid.particles.bySource[2] > 0, 'others have particles');

// counts in / out
const four = D.build({ sources: [src('ev', 1234, 'ev-charging', 'EV'), src('cr', 56, 'crossings', 'Cr'), src('fl', 12, 'flood-reaches', 'Fl'), src('eq', 0, 'earthquakes', 'Eq')] });
eq(four.recordsIn, 1302, 'records in is the sum of counts');
eq(four.sheets.length, 4, 'four sheet pills'); eq(four.sheetsOut, 3, 'sheets out counts only sheets that receive records');
eq(four.sources.map((s) => s.sheetIndex), [0, 1, 2, 3], 'each source points at its sheet');
eq(four.sources.map((s) => s.out), [1, 1, 1, 0], 'one sheet out per source with records');
ok(Math.abs(four.sources.reduce((a, s) => a + s.share, 0) - 1) < 1e-9, 'shares add up to 1');
eq(four.recordsInText, ['1,302', '1.302'], 'number text per language');
const shared = D.build({ sources: [src('a', 3, 'same'), src('b', 4, 'same')] });
eq(shared.sheets.length, 1, 'two sources on one sheet make one pill'); eq(shared.sheets[0].records, 7, 'sheet records summed'); eq(shared.sheetsOut, 1, 'sheetsOut 1');
// bad input
const bad = D.build({ sources: [{ id: 'x', count: -5 }, { id: 'y', count: 'abc' }, { id: 'w', count: 2.9 }] });
eq(bad.sources.map((s) => s.count), [0, 0, 2], 'counts coerced to whole non-negative numbers');
ok(bad.recordsIn === 2, 'bad counts do not leak into the total');
const none = D.build({ sources: [] }); eq(none.recordsIn, 0, 'no sources'); ok(pair(none.empty), 'empty state sentence in both languages');
ok(D.build(null).sheetsOut === 0 && D.build({}).particles.count === 0, 'null or empty input is safe');
ok(four.empty === null, 'no empty state when there are records');

// stage list
eq(four.stages.map((s) => s.id), ['collect', 'check', 'label', 'show'], 'stage list is the four real steps in order');
four.stages.forEach((s) => ok(pair(s.n) && pair(s.d), 'stage ' + s.id + ' has both languages'));
ok(/publisher/.test(four.stages[0].d[0]) && /licence/.test(four.stages[1].d[0]) && /status/.test(four.stages[2].d[0]) && /sheet/.test(four.stages[3].d[0]), 'stage descriptions say the plain steps');

// bilingual strings: every visible string is [en, el], no guillemets
function walk(v, where, out) { if (Array.isArray(v) && typeof v[0] === 'string') out.push([where, v]); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, where + '[' + i + ']', out)); else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], where + '.' + k, out)); }
const strs = []; walk({ s: four.strings, st: four.stages, e: none.empty, p: D.build({ sources: [src('a', 5000, 's')] }).particles.label, g: four.sources.map((s) => s.grid.label), r: four.sources.map((s) => s.recordsText) }, 'm', strs);
ok(strs.length > 15, 'found the strings');
strs.forEach(([w, v]) => { if (v === null) return; ok(pair(v), w + ' is a pair'); ok(!/[«»]/.test(v.join('')), w + ' has no guillemets'); });
ok(four.strings.title[1] !== four.strings.title[0] && /[Ͱ-Ͽ]/.test(four.strings.recordsIn[1]), 'Greek strings are Greek');
ok(four.textRows.every(pair) && four.textRows.length >= 7, 'textRows are pairs');
ok(pair(four.ariaLabel) && /1,302/.test(four.ariaLabel[0]) && /1\.302/.test(four.ariaLabel[1]) && /3 sheets/.test(four.ariaLabel[0]), 'aria label has the counts in both languages');
ok(!/[«»]/.test(JSON.stringify(four)), 'no guillemets anywhere in the model');
eq(four.textRows.filter((r) => /one cell/.test(r[0])).length, 1, 'only the capped source mentions one cell in the text rows');
// source title fallback
eq(D.build({ sources: [{ id: 'q', count: 1 }] }).sources[0].title, ['q', 'q'], 'missing title falls back to the id');
eq(D.records(1), ['1 record', '1 εγγραφή'], 'singular');

// real sheet ids and titles from the repo catalogue
try {
  const { SHEETS } = require(path.join(__dirname, '../../stackdata.js'));
  const ids = { ev: 'ev-charging', cr: 'crossings', fl: 'flood-reaches', eq: 'earthquakes' }, counts = { ev: 211, cr: 87, fl: 64, eq: 1500 };
  const real = D.build({ sources: Object.keys(ids).map((k) => ({ id: k, title: SHEETS[ids[k]].title, count: counts[k], sheetId: ids[k], sheetTitle: SHEETS[ids[k]].title })) });
  eq(real.sheets.map((s) => s.id), ['ev-charging', 'crossings', 'flood-reaches', 'earthquakes'], 'real sheet ids');
  ok(real.sheets.every((s) => pair(s.title)), 'real sheet titles are pairs');
  ok(real.sources[3].grid.capped && real.sources[0].grid.cells === 211, 'real-shaped grids');
  eq(real.recordsIn, 1862, 'real-shaped total');
} catch (e) { ok(false, 'catalogue load: ' + e.message); }

console.log('pipeline: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
