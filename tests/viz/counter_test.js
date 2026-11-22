'use strict';
/* Counter widget data: selected month, year-earlier month, plain difference, the "not comparable" rule of the annotation, missing
   months, one district at a time, bilingual strings, empty state, and the real permits answer when a saved copy exists. */
const fs = require('fs'), path = require('path');
const C = require('../../public/site/viz/counter-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const isPair = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] !== '' && p[1] !== '';
const GREEK = /[Ͱ-Ͽ]/;

// ---- made-up answer: 2019-01..2022-12 (48 months), two districts ---------------------------------------------------------
const months = []; for (let y = 2019; y <= 2022; y++) for (let m = 1; m <= 12; m++) months.push(y + '-' + String(m).padStart(2, '0'));
const idx = (m) => months.indexOf(m);
const va = months.map((_, i) => 100 + i);   // 100..147
va[idx('2022-12')] = null;                  // latest month has no figure
va[idx('2022-10')] = 'N.A.';                // text mark = missing
va[idx('2021-06')] = null;                  // so 2022-06 has a missing year-earlier month
va[idx('2022-03')] = 0;                     // a real zero
va[idx('2022-05')] = va[idx('2021-05')];    // same number as a year earlier
va[idx('2022-02')] = va[idx('2021-02')] - 1; // one fewer
va[idx('2022-01')] = 1500;                  // thousands separator
const vb = months.map(() => 7);
const ann = { month: '2020-07', text: ['EN note text.', 'Κείμενο σημείωσης.'], url: 'https://x.test/note' };
const answer = { period: '2022-12', months, annotation: ann, source: ['Made-up office', 'Φανταστική υπηρεσία'], sourceUrl: 'https://x.test/',
  permitsByMonth: [{ code: 'a', name: ['Alpha district', 'Επαρχία Άλφα'], values: va }, { code: 'b', name: ['Beta district', 'Επαρχία Βήτα'], values: vb }] };
const m = C.build(answer);
const A = m.views.a, at = (mm) => A.points[m.months.indexOf(mm)];

eq(C.WINDOW, 36, 'window is 36 months');
eq(m.months.length, 36, '36 months in the line');
eq([m.months[0], m.months[35]], ['2020-01', '2022-12'], 'the line is the LAST 36 months');
eq(m.choices.map((c) => c.code), ['a', 'b'], 'choices');
eq(m.district, 'a', 'default district is the first');
eq(m.month, '2022-11', 'default month is the latest month that has a figure (2022-12 has none)');
eq(m.index, 34, 'index of the default month');
eq(A.defaultIndex, 34, 'view default index');
eq(A.points.length, 36, 'one point per month');
ok(A.points.every((p, i) => p.i === i && p.m === m.months[i]), 'points are in month order');
// plain difference
eq([at('2022-11').v, at('2022-11').prev, at('2022-11').prevM, at('2022-11').diff], [146, 134, '2021-11', 12], 'value, year-earlier value, plain difference');
ok(/Nov 2021: 134\. 12 more than a year earlier\./.test(at('2022-11').second[0]), 'sentence says more: ' + at('2022-11').second[0]);
ok(/Νοέ 2021: 134\. 12 περισσότερες από ένα χρόνο πριν\./.test(at('2022-11').second[1]), 'Greek sentence says more');
eq(at('2022-02').diff, -1, 'one fewer');
ok(/1 fewer than a year earlier/.test(at('2022-02').second[0]) && /1 λιγότερη από/.test(at('2022-02').second[1]), 'fewer, singular in Greek');
eq(at('2022-05').diff, 0, 'same number: difference 0');
ok(/The same number/.test(at('2022-05').second[0]) && /Ίδιος αριθμός/.test(at('2022-05').second[1]), 'same number sentence');
// a real zero is a figure
eq([at('2022-03').v, at('2022-03').missing, at('2022-03').valueText[0], at('2022-03').diff], [0, false, '0', -(100 + idx('2021-03'))], 'zero is a figure, not a gap');
// missing months
for (const mm of ['2022-12', '2022-10']) {
  const p = at(mm);
  ok(p.missing && p.v === null && p.diff === null && p.reason === 'value', mm + ' is missing, no difference');
  eq(p.valueText, ['–', '–'], mm + ' shows an en dash');
  ok(/no figure published/.test(p.caption[0]) && /δεν δημοσιεύτηκε τιμή/.test(p.caption[1]), mm + ' says no figure published');
}
ok(at('2022-06').reason === 'earlier' && at('2022-06').diff === null && /Jun 2021: no figure published/.test(at('2022-06').second[0]), 'year-earlier month without a figure: no difference');
// the annotation: on or after 2020-07 with a year-earlier month before it = not comparable, the 12 months 2020-07..2021-06
const nc = A.points.filter((p) => p.reason === 'notcomparable').map((p) => p.m);
eq([nc[0], nc[nc.length - 1]], ['2020-07', '2021-05'], 'not comparable from the annotated month for a year (2021-06 has no figure)');
ok(nc.length === 11 && nc.every((x) => x >= '2020-07' && x <= '2021-06'), 'only months inside that year');
const q = at('2020-09');
eq([q.v, q.prev, q.diff, q.comparable], [120, 108, null, false], 'not comparable: both figures kept, NO difference');
ok(/Sep 2019: 108\. Not directly comparable: see the note for Jul 2020\./.test(q.second[0]), 'says not comparable instead of a difference: ' + q.second[0]);
ok(/Δεν συγκρίνονται άμεσα/.test(q.second[1]) && !/more|fewer|περισσότερ|λιγότερ/.test(q.second[0] + q.second[1]), 'no more/fewer on a not comparable month');
ok(at('2021-06').reason === 'value' && at('2020-05').comparable && at('2021-07').comparable, 'before the annotation and a year after it: comparable');
eq(at('2021-07').diff, va[idx('2021-07')] - va[idx('2020-07')], 'both months after the annotation: difference given');
eq([m.mark.month, m.mark.index, m.mark.text, m.mark.url], ['2020-07', 6, ann.text, ann.url], 'mark carries the answer text');
// year-earlier month is looked up in the whole series, also for the first months of the line
eq([at('2020-01').prev, at('2020-01').prevM, at('2020-01').diff], [100, '2019-01', 12], 'first month of the line compares with a month before the line');
// number text
eq(at('2022-01').valueText, ['1,500', '1.500'], 'thousands grouped per language');
eq(C.fmt(1234567), ['1,234,567', '1.234.567'], 'fmt');
eq(C.fmt(null), ['–', '–'], 'fmt of nothing');
eq([A.max, A.maxText], [1500, ['1,500', '1.500']], 'largest month of the line');
// options
eq(C.build(answer, { district: 'b' }).district, 'b', 'district option');
eq(C.build(answer, { district: 'zz' }).district, 'a', 'unknown district falls back to the first');
eq(C.build(answer, { month: '2021-03' }).index, 14, 'month option');
eq(C.build(answer, { month: '2019-03' }).month, '2022-11', 'a month outside the line falls back to the default');
eq(C.build(answer, { month: '2022-12' }).month, '2022-12', 'a missing month can be selected');
// one district at a time, never added
const B = m.views.b;
ok(B.points.every((p) => p.v === 7 && (p.reason === 'notcomparable' ? p.diff === null : p.diff === 0)), 'district b keeps its own figures');
ok(A.points.every((p) => p.missing || p.v === va[idx(p.m)]), 'district a keeps its own figures (no sum)');
ok(!('total' in m) && !('rank' in m) && Object.keys(m.views).length === 2, 'no total, no ranking');
ok(A.points.every((p) => p.caption[0].includes('Alpha district') && !p.caption[0].includes('Beta')), 'a caption names one district only');
eq(B.defaultIndex, 35, 'district b default is the last month');
// a district with no figures at all in the line
const none = C.build({ months, permitsByMonth: [{ code: 'n', name: ['N', 'Ν'], values: months.map(() => null) }] });
eq([none.views.n.hasValues, none.index, none.views.n.points[35].valueText[0], none.views.n.max], [false, 35, '–', 0], 'all missing: en dash on the last month');
eq(none.mark, null, 'no annotation: no mark');
// short series
const short = C.build({ months: ['2022-01', '2022-02'], permitsByMonth: [{ code: 's', name: ['S', 'Σ'], values: [3, 5] }] });
eq([short.months.length, short.views.s.points[1].reason, short.views.s.points[1].diff], [2, 'noearlier', null], 'fewer than 36 months: no earlier month, no difference');
ok(/2 months/.test(short.strings.spark[0]), 'line label counts the months it has');
// a series whose length does not match the months is left out, never padded
const mis = C.build({ months, permitsByMonth: [{ code: 'x', name: ['X', 'Χ'], values: [1, 2, 3] }, { code: 'b', name: ['B', 'Β'], values: vb }] });
eq(mis.choices.map((c) => c.code), ['b'], 'mismatched series dropped');
// empty states
for (const bad of [null, {}, { months: [], permitsByMonth: [] }, { months: ['x'], permitsByMonth: [{ code: 'a', name: ['A', 'Α'], values: [1] }] }, { months: ['2020-01'], permitsByMonth: [{ code: 'a', name: ['A', 'Α'], values: [] }] }]) {
  const e = C.build(bad);
  ok(isPair(e.empty) && e.choices.length === 0 && e.index === -1 && isPair(e.ariaLabel) && e.textRows.length === 1 && isPair(e.textRows[0]) && GREEK.test(e.empty[1]), 'honest empty state ' + JSON.stringify(bad));
}
// strings
function strings(o, out) { if (isPair(o)) out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; }
ok(Object.values(m.strings).every(isPair), 'model.strings are pairs');
ok(A.points.every((p) => isPair(p.label) && isPair(p.valueText) && isPair(p.caption) && isPair(p.second) && isPair(p.aria)), 'every point carries its strings as pairs');
ok(A.points.every((p) => GREEK.test(p.caption[1]) && GREEK.test(p.second[1]) && !GREEK.test(p.caption[0]) && !GREEK.test(p.second[0])), 'English and Greek each in their own script');
ok(isPair(m.ariaLabel) && isPair(m.aria) && isPair(m.n) && isPair(m.unit), 'aria label and title pairs');
eq(m.textRows, A.textRows, 'model.textRows are those of the selected district');
eq(m.textRows.length, 36 + 3, 'text rows: 36 months, the note, the source, one-at-a-time');
ok(m.textRows.every(isPair), 'text rows are pairs');
ok(m.textRows[0][0].startsWith('Alpha district, Dec 2022'), 'text rows start with the latest month');
ok(m.textRows.some((r) => r[0].includes('EN note text.')) && m.textRows.some((r) => r[1].includes('Κείμενο σημείωσης.')), 'the note is in the text rows');
ok(!/[«»]/.test(JSON.stringify(m)), 'no guillemets');
ok(!/better|worse|καλύτερ|χειρότερ/i.test(JSON.stringify(m)), 'never better or worse');
eq(JSON.stringify(C.build(answer)), JSON.stringify(m), 'pure: same input, same model');

// ---- the real answer -----------------------------------------------------------------------------------------------------
const saved = [process.env.COUNTER_PERMITS, '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/permits-answer.json'].filter(Boolean).find((f) => fs.existsSync(f));
const field = path.join(__dirname, '..', '..', 'fieldwork', 'stack', 'permits.json');
let real = null;
if (saved) real = JSON.parse(fs.readFileSync(saved, 'utf8'));
else if (fs.existsSync(field)) { // the repo copy, reshaped the way the server answers
  const d = JSON.parse(fs.readFileSync(field, 'utf8'));
  if (d && Array.isArray(d.months) && Array.isArray(d.permitsByMonth)) real = { period: d.latestMonth, months: d.months, annotation: d.annotation ? { month: d.annotation.month, text: [d.annotation.text, d.annotation.textEl], url: d.annotation.url } : null,
    permitsByMonth: d.permitsByMonth.map((s) => ({ code: s.code, name: Array.isArray(s.name) ? s.name : [s.name, s.name], values: s.values })) };
}
if (real) {
  const r = C.build(real), N = real.months.length;
  eq(N, 139, 'real: 139 months');
  eq(r.choices.length, real.permitsByMonth.length, 'real: one choice per district');
  eq([r.months.length, r.months[0], r.months[35]], [36, real.months[N - 36], real.months[N - 1]], 'real: the line is the last 36 months');
  eq(r.empty, null, 'real: not empty');
  eq([r.mark.month, r.mark.index], ['2024-07', r.months.indexOf('2024-07')], 'real: July 2024 note');
  eq(r.mark.text, real.annotation.text, 'real: note text is the answer text');
  for (const s of real.permitsByMonth) {
    const v = r.views[String(s.code)], tag = 'real ' + s.name[0];
    let bad = 0, badPrev = 0, badRule = 0;
    v.points.forEach((p) => {
      const gi = N - 36 + p.i, val = s.values[gi], prev = s.values[gi - 12];
      if (p.v !== (typeof val === 'number' ? val : null)) bad++;
      if (p.prev !== (typeof prev === 'number' ? prev : null) || p.prevM !== real.months[gi - 12]) badPrev++;
      const blocked = p.m >= '2024-07' && p.prevM < '2024-07';
      if (p.v !== null && p.prev !== null) { if (blocked ? !(p.diff === null && p.reason === 'notcomparable') : p.diff !== val - prev) badRule++; }
    });
    eq([bad, badPrev, badRule], [0, 0, 0], tag + ': figures, year-earlier figures and differences match the answer');
    eq(v.points.filter((p) => p.reason === 'notcomparable').map((p) => p.m), real.months.filter((x) => x >= '2024-07' && x <= '2025-06'), tag + ': Jul 2024 to Jun 2025 are not comparable');
    let last = -1; v.points.forEach((p) => { if (!p.missing) last = p.i; });
    eq(v.defaultIndex, last, tag + ': default is the latest month with a figure');
    eq(v.max, Math.max(...v.points.filter((p) => !p.missing).map((p) => p.v)), tag + ': largest month');
    eq(v.textRows.length, 36 + (real.source ? 3 : 2), tag + ': text rows');
    ok(v.points.every((p) => p.caption[0].includes(s.name[0]) && p.caption[1].includes(s.name[1])), tag + ': captions name the district in both languages');
  }
  const f = real.permitsByMonth[0], fv = r.views[String(f.code)], lastP = fv.points[fv.defaultIndex];
  eq(lastP.diff, f.values[N - 36 + lastP.i] - f.values[N - 48 + lastP.i], 'real: difference of the default month is value minus value 12 months earlier');
  ok(!/better|worse|καλύτερ|χειρότερ/i.test(JSON.stringify(r.views)) && !/[«»]/.test(JSON.stringify(r.views)), 'real: wording');
} else console.log('note: no saved permits answer found, real-data tests skipped');

console.log('counter: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
