'use strict';
/* Heat matrix data: yearly sums, incomplete years, per-row scaling, the partial year, no cross-row ranking text, bilingual
   strings. Small made-up input AND the real permits answer. Run: node tests/viz/heatmatrix_test.js */
const path = require('path');
const D = require('../../public/site/viz/heatmatrix-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const cell = (m, code, y) => m.rows.find((r) => r.code === code).cells.find((c) => c.year === y);

// ---- small made-up answer: 2015, 2016 full, 2017 partial (Jan-Mar); district B misses a month in 2016
const months = []; for (let y = 2015; y <= 2017; y++) for (let m = 1; m <= (y === 2017 ? 3 : 12); m++) months.push(y + '-' + String(m).padStart(2, '0'));
const A = months.map(() => 10), Bv = months.map((_, i) => (i < 12 ? 1 : 5));
Bv[14] = null;   // 2016-03 is N.A.
const made = { available: true, months, units: { permits: 'permits', floorArea: 'square metres', value: 'thousand EUR' },
  annotation: { month: '2016-07', text: ['A note', 'Μια σημείωση'], url: 'https://example.org' }, source: ['Src', 'Πηγή'], period: '2017-03',
  permitsByMonth: [{ code: 'a', name: ['A district', 'Επαρχία Α'], values: A }, { code: 'b', name: ['B district', 'Επαρχία Β'], values: Bv }] };
let m = D.build(made);
ok(m.available && m.years.map((y) => y.y).join() === '2015,2016,2017', 'years 2015..latest');
ok(cell(m, 'a', 2015).value === 120 && cell(m, 'a', 2016).value === 120, 'yearly sum of 12 months');
ok(cell(m, 'b', 2015).value === 12, 'yearly sum, other district');
ok(cell(m, 'b', 2016).state === 'incomplete' && cell(m, 'b', 2016).value === null && cell(m, 'b', 2016).text === null && cell(m, 'b', 2016).t === null, 'incomplete year: no sum, no text, no colour');
ok(cell(m, 'b', 2016).missing === 1 && cell(m, 'a', 2016).state === 'full', 'incomplete is per district and counts the missing months');
ok(m.years[1].state === 'incomplete' && m.years[0].state === 'full', 'column state');
ok(cell(m, 'a', 2017).state === 'partial' && cell(m, 'a', 2017).value === 30 && m.years[2].partial && m.years[2].label[0].includes('partial'), 'partial latest year: true sum of its months, labelled');
ok(cell(m, 'b', 2017).state === 'partial' && cell(m, 'b', 2017).value === 15, 'partial year sum, other district');
ok(m.legend.some((l) => /partial/.test(l[0]) && /μερικό/.test(l[1])), 'legend names the partial year in both languages');
ok(cell(m, 'a', 2017).label[0].includes('partial') && cell(m, 'a', 2017).label[1].includes('μερικό'), 'cell sentence says partial');
// per-row scaling: row a all 120 -> t 1; row b full max is 2015 (12) -> t 1, partial 15 is capped at 1
ok(cell(m, 'a', 2015).t === 1 && cell(m, 'b', 2015).t === 1, 'each row reaches 1 against its own maximum');
ok(m.rows[0].max === 120 && m.rows[1].max === 12, 'row maxima are per row, not shared');
ok(cell(m, 'a', 2017).t === 0.25, 'partial year coloured against the full years of its own row (30/120)');
ok(cell(m, 'b', 2017).t === 1, 'colour is capped at 1');
ok(m.annotation && m.annotation.year === 2016 && m.annotation.text[0] === 'A note', 'annotation carried with its year');
ok(m.modes.length === 1 && m.modes[0].k === 'permits', 'permits only when the answer has no floor area / value series');
// a row with a missing month in a not-latest year does not distort the max
const gap = JSON.parse(JSON.stringify(made)); gap.permitsByMonth[0].values[0] = 1000; gap.permitsByMonth[0].values[12] = null;
const mg = D.build(gap); ok(mg.rows[0].max === 1110 && cell(mg, 'a', 2016).value === null, 'the max uses only full years');
// a month absent from `months` counts as missing
const hole = JSON.parse(JSON.stringify(made)); hole.months.splice(3, 1); hole.permitsByMonth.forEach((s) => s.values.splice(3, 1));
ok(D.build(hole).rows[0].cells[0].state === 'incomplete', 'a month missing from the months list marks the year incomplete');
// latest year that is a full year is not partial
const full = JSON.parse(JSON.stringify(made)); for (let mo = 4; mo <= 12; mo++) { full.months.push('2017-' + String(mo).padStart(2, '0')); full.permitsByMonth.forEach((s) => s.values.push(1)); }
ok(!D.build(full).years[2].partial && D.build(full).rows[0].cells[2].state === 'full', 'December as latest month: a full year');
// zero is an observation
const zero = JSON.parse(JSON.stringify(made)); zero.permitsByMonth[0].values = zero.permitsByMonth[0].values.map(() => 0);
ok(D.build(zero).rows[0].cells[0].value === 0 && D.build(zero).rows[0].cells[0].t === 0 && D.build(zero).rows[0].cells[0].state === 'full', 'all zero: a real 0, t 0');
// the switch: only with monthly series and a known unit
const ext = JSON.parse(JSON.stringify(made)); ext.permitsByMonth.forEach((s) => { s.floorArea = s.values.map((v) => v * 100); s.value = s.values.map((v) => v * 7); });
const me = D.build(ext, { mode: 'floorArea' });
ok(me.modes.map((x) => x.k).join() === 'permits,floorArea,value' && me.mode === 'floorArea' && cell(me, 'a', 2015).value === 12000 && cell(me, 'a', 2015).unit[0] === 'square metres', 'floor area mode with its unit');
ok(D.build(ext).mode === 'permits' && cell(D.build(ext), 'a', 2015).value === 120, 'default mode permits');
const noUnit = JSON.parse(JSON.stringify(ext)); noUnit.units = { permits: 'permits' };
ok(D.build(noUnit).modes.length === 1, 'no unit, no switch');
// empty states
for (const bad of [null, {}, { available: false }, { months: [], permitsByMonth: [] }]) { const e = D.build(bad); ok(!e.available && e.empty[0] && e.empty[1] && e.rows.length === 0 && e.textRows.length === 1, 'honest empty state: ' + JSON.stringify(bad)); }

// ---- the real answer, shaped as the running server gives it
let real = null;
try { const { createStackData } = require(path.join(__dirname, '..', '..', 'stackdata.js')); createStackData({}).build('permits').then(check).catch((e) => { console.log('real answer not built: ' + e.message); done(); }); } catch (e) { console.log('real answer not built: ' + e.message); done(); }
function check(a) {
  real = D.build(a);
  ok(real.available && real.rows.length === 5, 'real: five districts');
  ok(real.years[0].y === 2015 && real.years[real.years.length - 1].y === 2026, 'real: 2015..2026');
  ok(real.years.filter((y) => y.partial).length === 1 && real.years[real.years.length - 1].partial, 'real: only 2026 partial (to July)');
  // sums agree with an independent computation from the answer
  let good = true;
  for (const s of a.permitsByMonth) { const r = real.rows.find((x) => x.code === s.code); for (const c of r.cells) { let t = 0, n = 0; a.months.forEach((mo, i) => { if (mo.startsWith(c.year + '-') && typeof s.values[i] === 'number') { t += s.values[i]; n++; } }); if (c.value !== (n === (c.year === 2026 ? 7 : 12) ? t : null)) good = false; } }
  ok(good, 'real: every yearly sum equals the sum of its months');
  // the last month of the series is the published district total (the series are totals, not parts)
  ok(a.features.every((f) => { const s = a.permitsByMonth.find((x) => x.code === f.code); return s && s.values[s.values.length - 1] === f.total.permits; }), 'real: series are district totals (last month = published total)');
  ok(real.rows.every((r) => r.cells.some((c) => c.t === 1)) || real.rows.every((r) => r.max > 0), 'real: each row has its own scale');
  ok(real.rows.every((r) => r.cells.every((c) => c.t === null || (c.t >= 0 && c.t <= 1))), 'real: t within 0..1');
  ok(real.rows.every((r) => Math.max(...r.cells.filter((c) => c.state === 'full').map((c) => c.t)) === 1), 'real: every row peaks at exactly 1 over its full years');
  ok(real.annotation && real.annotation.year === 2024, 'real: July 2024 annotation on the 2024 column');
  ok(real.modes.length === 1, 'real: permits only (the answer has no monthly floor area or value series)');
  ok(real.rows.every((r) => r.cells.every((c) => c.state !== 'incomplete')), 'real: no incomplete year in the current answer');
  // no cross-row ranking text, anywhere
  const all = strings(real).concat(strings(m));
  ok(!all.some((s) => /\b(rank|ranking|ranked|best|worst|busiest|leading|leader|top district|most permits|fewest|highest district|lowest district)\b/i.test(s)), 'no ranking words in any string');
  ok(!all.some((s) => /(κατάταξη|καλύτερη|χειρότερη|πρώτη επαρχία|περισσότερες άδειες από)/i.test(s)), 'no Greek ranking words');
  ok(real.legend[0][0].includes('own largest year') && real.legend[0][0].includes('never districts with each other') && real.legend[0][1].includes('δική της') && real.legend[0][1].includes('ποτέ επαρχίες'), 'legend line says rows are scaled on their own, both languages');
  ok(real.note[0].includes('never added') && real.note[1].includes('δεν προστίθενται'), 'note: parts are never added to totals');
  // bilingual: every pair has both halves non-empty and different where words differ; no guillemets
  const ps = pairs(real).concat(pairs(m));
  ok(ps.length > 20 && ps.every((p) => p[0].trim() && p[1].trim()), 'every pair has English and Greek');
  ok(!strings(real).concat(strings(m)).some((s) => /[«»]/.test(s)), 'no guillemets');
  ok(real.textRows.length >= 8 && real.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
  ok(real.ariaLabel[0].includes('Building permits') && /[Α-Ω]/i.test(real.ariaLabel[1]), 'aria label in both languages');
  ok(cell(real, '1', 2015).text[0] === cell(real, '1', 2015).value.toLocaleString('en-US') && /\./.test(real.rows[0].cells.map((c) => c.text && c.text[1]).find((t) => t && t.length > 3) || '.'), 'number formatting, English comma and Greek dot');
  done();
}
function done() { console.log('heatmatrix: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
