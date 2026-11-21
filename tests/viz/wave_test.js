'use strict';
/* Wave widget data: year-on-year maths, gaps, annotation band, counts, bilingual strings, and the real permits file. */
const fs = require('fs'), path = require('path');
const W = require('../../public/site/viz/wave-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const isPair = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1];

// ---- made-up series: 2020-01..2021-06, with gaps ----------------------------------------------------------------------
const months = []; for (let y = 2020; y <= 2021; y++) for (let m = 1; m <= 12; m++) { if (y === 2021 && m > 6) break; months.push(y + '-' + String(m).padStart(2, '0')); }
const v = months.map((_, i) => 100 + i);          // 100..117
v[0] = 120;   // 2020-01 = 120, so 2021-01 (112) is a fall of 8
v[13] = null; // 2021-02 N.A.
v[3] = 'N.A.'; // 2020-04 N.A. text mark
v[14] = 0;    // 2021-03 a real zero
const y = W.yoy(months, v);
eq(y.length, months.length, 'one point per month');
ok(y.slice(0, 12).every((p) => p.gap && p.change === null && p.change !== 0), 'first year has no earlier year: gaps, never 0');
eq(y[0].reason, 'noearlier', 'reason for first year');
eq(y[12].change, 112 - 120, '2021-01 against 2020-01');
ok(y[13].gap && y[13].reason === 'value' && y[13].change === null, 'null month is a gap');
eq(y[14].v, 0, 'zero stays 0');
eq(y[14].change, 0 - 102, '2021-03 zero vs 2020-03 (102): a fall of 102');
ok(y[15].gap && y[15].reason === 'earlier', 'month whose year-earlier month is N.A. is a gap (2021-04)');
eq(y[16].change, 116 - 104, '2021-05');
eq(y[17].change, 117 - 105, '2021-06');
eq(y[16].prevM, '2020-05', 'prevM');
// a month missing from the list has no year-earlier month
const y2 = W.yoy(['2020-02', '2021-01', '2021-02'], [5, 7, 9]);
ok(y2[1].gap && y2[1].reason === 'noearlier', 'absent earlier month is a gap');
eq(y2[2].change, 4, 'present earlier month');
// stats
const st = W.stats(y);
eq([st.up, st.down, st.flat, st.gaps, st.comparable, st.months], [2, 2, 0, 14, 4, 18], 'counts up/down/flat/gaps');
ok(st.up + st.down + st.flat + st.gaps === st.months, 'counts add to the months');
eq(st.maxRise && [st.maxRise.m, st.maxRise.change], ['2021-05', 12], 'largest rise');
eq(st.maxFall && [st.maxFall.m, st.maxFall.change], ['2021-03', -102], 'largest fall');
eq(W.stats(W.yoy(['2020-01', '2021-01'], [5, 5])).flat, 1, 'no change counts as flat, not up or down');
eq(W.stats(W.yoy(['2020-01', '2021-01'], [5, 9])).maxFall, null, 'no fall: maxFall null');
// turning points
const tp = W.turns(W.yoy((() => { const a = []; for (let yr = 2019; yr <= 2021; yr++) for (let m = 1; m <= 12; m++) a.push(yr + '-' + String(m).padStart(2, '0')); return a; })(),
  Array.from({ length: 36 }, (_, i) => (i < 12 ? 100 : i < 24 ? 100 + [0, 1, 2, 3, 4, 20, 4, 3, 2, 1, 0, 0][i - 12] : 100 - [0, 0, 1, 2, 3, 15, 3, 2, 1, 0, 0, 0][i - 24] + 0))));
ok(tp.some((t) => t.kind === 'peak' && t.i === 17), 'peak found');
ok(tp.every((t) => t.kind === 'peak' || t.kind === 'trough'), 'kinds');
// band
const ann = { month: '2020-07', text: ['EN note', 'EL note'], url: 'https://x.test/' };
const b = W.band(ann, months);
eq([b.from, b.to], [6, 17], 'band from 2020-07 to 12 months on, cut at the last month');
eq(b.text, ['EN note', 'EL note'], 'band text comes from the answer');
eq(W.band({ month: '2019-01', text: ['a', 'b'] }, months), null, 'annotation outside the series: no band');
eq(W.band(null, months), null, 'no annotation: no band');
eq(W.band({ month: '2021-05', text: ['a', 'b'] }, months).to, 17, 'band cut at the end');

// ---- model from a server-shaped answer ---------------------------------------------------------------------------------
const answer = { period: '2021-06', months, annotation: ann, source: ['CYSTAT', 'CYSTAT'], sourceUrl: 'https://x.test/',
  permitsByMonth: [{ code: '0', name: ['Alpha district', 'Επαρχία Άλφα'], values: v }, { code: '1', name: ['Beta district', 'Επαρχία Βήτα'], values: months.map(() => 50) }] };
const m = W.build(answer);
eq(m.scope, 'district', 'no total series: one district');
eq(m.series.code, '0', 'default first district');
eq(W.build(answer, { district: '1' }).series.code, '1', 'district option');
eq(m.points.length, 18, 'points');
eq(m.stats.up, 2, 'model counts');
ok(m.band && m.band.from === 6, 'model band');
eq(m.textRows.length, 18, 'text rows for the last 24 months (18 available)');
eq(m.empty, null, 'not empty');
ok(m.panel.length === 5 && m.panel.every((p) => isPair(p.label) && isPair(p.text)), 'panel pairs');
const full = W.build(Object.assign({}, answer, { reportingTotalByMonth: months.map((_, i) => 1000 + i) }));
eq(full.scope, 'total', 'a monthly total series is used when the answer has one');
const sumOnly = W.build({ months, permitsByMonth: [{ code: '0', name: ['A', 'Α'], values: months.map(() => 1) }, { code: '1', name: ['B', 'Β'], values: months.map(() => 2) }] });
ok(sumOnly.points.every((p) => p.gap || p.v === 1), 'districts are never added together');
// empty states
for (const bad of [null, {}, { months: [], permitsByMonth: [] }, { months: ['2020-01', '2020-02'], permitsByMonth: [{ code: '0', name: ['A', 'Α'], values: [1, 2] }] }]) {
  const e = W.build(bad);
  ok(e.empty && isPair(e.empty) && e.points.length === 0 && isPair(e.aria) && e.textRows.length === 1, 'honest empty state ' + JSON.stringify(bad));
}
// bilingual: every visible string is a pair, no guillemets
function strings(o, out) { if (isPair(o)) out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; }
const pairs = strings({ n: m.n, unit: m.unit, note: m.note, legend: m.legend, band: m.band && { span: m.band.span, text: m.band.text }, panel: m.panel, textRows: m.textRows, aria: m.aria, series: m.series }, []);
ok(pairs.length > 20 && pairs.every(isPair), 'visible strings are non-empty [en, el] pairs');
const all = JSON.stringify([m.n, m.note, m.legend, m.band, m.panel, m.textRows, m.aria]);
ok(!/[«»]/.test(all), 'no guillemets');
ok(m.textRows.every((r) => /[Ͱ-Ͽ]/.test(r[1]) && !/[Ͱ-Ͽ]/.test(r[0])), 'Greek and English rows each in their own script');
ok(m.textRows.some((r) => /gap/.test(r[0])) && m.textRows.some((r) => /κενό/.test(r[1])), 'gap rows named in both languages');
ok(/Jan 2021/.test(W.monthLabel('2021-01')[0]) && /Ιαν 2021/.test(W.monthLabel('2021-01')[1]), 'month labels');
ok(m.legend.up[0].startsWith('▲') && m.legend.down[0].startsWith('▼'), 'arrow glyphs in the legend');

// ---- the real data -----------------------------------------------------------------------------------------------------
const file = path.join(__dirname, '..', '..', 'fieldwork', 'stack', 'permits.json');
if (fs.existsSync(file)) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const real = { period: d.latestMonth, months: d.months, annotation: { month: d.annotation.month, text: [d.annotation.text, d.annotation.textEl], url: d.annotation.url },
    permitsByMonth: d.permitsByMonth.map((s) => ({ code: s.code, name: [s.name, s.name], values: s.values })) };
  eq(real.months.length, 139, 'real: 139 months');
  for (const s of d.permitsByMonth) {
    const mm = W.build(real, { district: s.code });
    eq(mm.points.length, 139, 'real ' + s.name + ': points');
    ok(mm.points.slice(0, 12).every((p) => p.gap), 'real ' + s.name + ': first 12 months are gaps');
    let bad = 0; mm.points.forEach((p, i) => { if (i >= 12 && !p.gap && p.change !== s.values[i] - s.values[i - 12]) bad++; });
    eq(bad, 0, 'real ' + s.name + ': change = value minus value 12 months earlier');
    const up = mm.points.filter((p) => p.change > 0).length, dn = mm.points.filter((p) => p.change < 0).length;
    eq([mm.stats.up, mm.stats.down], [up, dn], 'real ' + s.name + ': counts');
    ok(mm.stats.up + mm.stats.down + mm.stats.flat + mm.stats.gaps === 139, 'real ' + s.name + ': counts add to 139');
    eq(mm.textRows.length, 24, 'real ' + s.name + ': 24 text rows');
    ok(mm.stats.maxRise && mm.stats.maxRise.change === Math.max(...mm.points.filter((p) => !p.gap).map((p) => p.change)), 'real ' + s.name + ': largest rise');
  }
  const mm = W.build(real);
  eq([mm.band.month, mm.band.from, mm.band.to], ['2024-07', 114, 125], 'real: band for July 2024');
  eq(mm.band.text, [d.annotation.text, d.annotation.textEl], 'real: band text is the answer text');
  eq(mm.points[138].m, '2026-07', 'real: last month');
  // thirty real values as a fixed fixture: Lefkosia 2024-01..2026-06 values are hand-checked against the file below
  const L = d.permitsByMonth[0].values.slice(100, 130), fm = d.months.slice(100, 130);
  const fx = W.yoy(fm, L);
  ok(fx.slice(0, 12).every((p) => p.gap), 'fixture: first 12 of the 30 are gaps');
  eq(fx[12].change, L[12] - L[0], 'fixture: first comparable month');
} else console.log('note: real permits file not found, real-data tests skipped');

console.log('wave: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
