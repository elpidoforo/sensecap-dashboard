'use strict';
/* Day bars data: one site at a time, one bar per day, missing days without a bar, an axis from zero fitted to the site's own
   days, the column wording, no ranking or site-against-site text, bilingual strings. Small made-up input AND the saved real
   answer of /api/stack/aerosol-sites when it exists. Run: node tests/viz/daybars_test.js */
const fs = require('fs');
const path = require('path');
const D = require('../../public/site/viz/daybars-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---- small made-up answer: site a has 5 listed days (one null, one day skipped in the list); site b has other numbers
const made = { available: true, unit: 'AOD (500 nm)', period: '2022-07-01 / 2022-07-06', source: ['Src', 'Πηγή'], honesty: ['A past month, not now', 'Περασμένος μήνας, όχι τώρα'],
  note: ['Column note from the sheet.', 'Σημείωση «στήλης» από το φύλλο.'],
  features: [
    { id: 'a', name: ['Site A', 'Σταθμός Α'], days: ['2022-07-01', '2022-07-02', '2022-07-03', '2022-07-05', '2022-07-06'], aod: [0.1, 0.2, null, 0.4, 0.05] },
    { id: 'b', name: ['Site B', 'Σταθμός Β'], days: ['2022-07-01', '2022-07-02'], aod: [3, 1.5] },
  ] };
let m = D.build(made);
ok(m.available && m.id === 'daybars' && m.site === 'a', 'first site is shown by default');
ok(m.choices.length === 2 && m.choices[1].id === 'b' && m.choices[1].name[1] === 'Σταθμός Β', 'choices list every site with both names');
ok(m.days.length === 6 && m.days.map((d) => d.dom).join() === '1,2,3,4,5,6', 'one entry per calendar day, first to last');
ok(m.days[2].missing && m.days[2].value === null && m.days[2].t === null && m.days[2].text === null, 'a null day is missing: no value, no height, no text');
ok(m.days[3].missing && m.days[3].day === '2022-07-04', 'a day skipped in the list is missing, not hidden');
ok(m.counts.days === 6 && m.counts.measured === 4 && m.counts.missing === 2, 'counts of days with and without a value');
ok(m.axis.ticks[0].v === 0 && m.axis.ticks[0].t === 0 && m.axis.max >= 0.4 && near(m.axis.max, 0.4), 'axis starts at zero and reaches a round top at or above the largest day');
ok(m.axis.ticks.length >= 3 && m.axis.ticks.length <= 7 && near(m.axis.ticks[m.axis.ticks.length - 1].t, 1), 'a handful of ticks, the last at the top');
ok(near(m.days[0].t, 0.25) && near(m.days[3 + 1].t, 1) && near(m.days[5].t, 0.125), 'bar height is value / axis top');
ok(m.days[0].text[0] === '0.100' && m.days[0].text[1] === '0,100', 'three decimals, Greek decimal comma');
ok(m.days[0].label[0] === 'Site A, 1 July 2022: aerosol optical depth at 500 nm 0.100 (no unit)' && m.days[0].label[1].includes('1 Ιουλίου 2022') && m.days[0].label[1].includes('0,100'), 'day sentence in both languages');
ok(m.days[2].label[0] === 'Site A, 3 July 2022: no value' && m.days[2].label[1].endsWith('χωρίς τιμή'), 'missing day sentence');
ok(m.axis.label[0] === 'aerosol optical depth (no unit)' && m.axis.label[1].includes('χωρίς μονάδα'), 'y axis label says no unit');
ok(m.axis.month[0] === 'July 2022' && m.axis.month[1] === 'Ιούλιος 2022', 'month and year for the x axis');
ok(m.range && near(m.range.min, 0.05) && near(m.range.max, 0.4) && near(m.range.tMax, 1) && /0\.050/.test(m.range.text[0]) && /0,050/.test(m.range.text[1]), 'band: the site\'s own lowest to highest day');
ok(m.wavelength === 500 && m.strings.measure[0].includes('500 nm'), 'wavelength read from the unit');
ok(m.columnNote[0].includes('whole column') && m.columnNote[0].includes('not the amount of particles') && m.columnNote[1].includes('στήλη') && m.columnNote[1].includes('κοντά στο έδαφος'), 'column wording: not ground-level particles');
ok(m.ariaLabel[0].includes('Site A') && m.ariaLabel[0].includes('whole column') && !m.ariaLabel[0].includes('Site B'), 'aria label is about the shown site only');
ok(m.textRows.length >= 6 + 5 && m.textRows.every((r) => Array.isArray(r) && r.length === 2 && r[0] && r[1]), 'textRows are pairs');
ok(m.textRows.some((r) => r[0] === '3 July 2022: no value') && m.textRows.some((r) => r[0] === '5 July 2022: 0.400'), 'textRows list each day, missing ones said');
ok(!strings(m.textRows).some((s) => s.includes('Site B')), 'the text of one site never mentions the other');
// the other site: own view, own axis
const b = D.select(m, 'b');
ok(b.site === 'b' && b.days.length === 2 && near(b.axis.max, 3) && near(b.days[1].t, 0.5) && m.site === 'a', 'select gives the other site with its own axis and leaves the first model alone');
ok(D.build(made, { site: 'b' }).site === 'b' && D.build(made, { site: 'nope' }).site === 'a' && D.select(m, 'nope') === m, 'opts.site, with an unknown id falling back');
ok(Object.keys(m.sites).join() === 'a,b' && m.sites.b.days[0].value === 3 && m.sites.a.days[0].value === 0.1, 'every site has its own view');
// odd input
const odd = { features: [{ name: ['X', 'Χ'], days: ['2022-02-27', 'rubbish', '2022-03-01', '2022-02-30'], aod: [0.5, 9, 'x', 7] }, { id: 'e', name: ['E', 'Ε'], days: [], aod: [] }, { id: 'n', name: ['N', 'Ν'], days: ['2022-01-01'], aod: [null] }] };
const mo = D.build(odd);
ok(mo.site === 'site-1' && mo.days.length === 3 && mo.days[0].value === 0.5 && mo.days[1].missing && mo.days[2].missing, 'bad dates dropped, non-numbers missing, id made when absent');
ok(mo.axis.month[0] === '27 February 2022 to 1 March 2022' && mo.axis.month[1].includes('έως'), 'a span over two months is written out');
ok(mo.range === null && mo.wavelength === null && mo.strings.measure[0] === 'aerosol optical depth', 'no band from one value; no wavelength invented');
const e = D.select(mo, 'e'), nn = D.select(mo, 'n');
ok(e.hasDays === false && e.days.length === 0 && e.textRows[0][1].includes('δεν έχει ημέρες'), 'a site without days says so');
ok(nn.hasDays && nn.days[0].missing && nn.axis.ticks.length === 1 && nn.axis.ticks[0].v === 0 && nn.counts.measured === 0, 'a site with only missing days: no scale invented');
const zero = D.build({ features: [{ id: 'z', name: ['Z', 'Ζ'], days: ['2022-01-01', '2022-01-02'], aod: [0, 0] }] });
ok(zero.days[0].value === 0 && zero.days[0].t === 0 && !zero.days[0].missing && zero.days[0].text[0] === '0.000', 'zero is a value, not a missing day');
for (const bad of [null, {}, { available: false, features: made.features }, { features: [] }, { features: 'x' }]) { const x = D.build(bad); ok(!x.available && x.empty[0] && x.empty[1] && x.days.length === 0 && x.choices.length === 0 && x.textRows.length === 1, 'honest empty state: ' + JSON.stringify(bad).slice(0, 40)); }
ok(!strings(m).some((s) => /[«»]/.test(s)), 'no guillemets, also when the sheet note has them');

// ---- the saved real answer
const file = process.env.DAYBARS_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad/aerosol-sites.json';
let real = null;
try { real = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); } catch (err) { console.log('note: saved real answer not found (' + file + '), real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.available && r.choices.length === 2 && r.choices.map((c) => c.id).join() === 'CUT-TEPAK,Nicosia', 'real: two sites to choose from');
  ok(r.site === 'CUT-TEPAK' && r.days.length === 31 && r.axis.month[0] === 'July 2022' && r.axis.month[1] === 'Ιούλιος 2022', 'real: 31 days of July 2022');
  ok(r.counts.missing === 2 && r.days[8].missing && r.days[15].missing && r.counts.measured === 29, 'real: Limassol has no value on 9 and 16 July');
  const n = D.select(r, 'Nicosia');
  ok(n.counts.missing === 0 && n.counts.measured === 31 && n.siteName[1] === 'Λευκωσία', 'real: Nicosia has all 31 days');
  let good = true;
  for (const f of real.features) { const v = D.select(r, f.id); f.aod.forEach((a, i) => { const d = v.days[i]; if (d.day !== f.days[i] || (a === null ? !d.missing : d.value !== a || Math.abs(d.t - a / v.axis.max) > 1e-12)) good = false; }); if (v.axis.max < Math.max(...f.aod.filter((x) => x !== null))) good = false; }
  ok(good, 'real: every bar is the answer\'s own value over the axis top; nulls stay missing');
  ok(r.days[0].text[0] === '0.151' && r.days[0].text[1] === '0,151' && r.days[30].text[0] === '0.213', 'real: values printed to three decimals');
  ok(r.axis.ticks.every((t) => t.t >= 0 && t.t <= 1) && r.axis.ticks[0].v === 0, 'real: ticks inside the axis, from zero');
  ok(r.note && r.note[0].includes('atmospheric column') && r.honesty[0].includes('not now') && r.textRows.some((x) => x[0] === r.note[0]) && r.textRows.some((x) => x[0].startsWith('Source: NASA AERONET')), 'real: the sheet\'s note, honesty line and source are in the text');
  const all = strings(r);
  ok(!all.some((s) => /\b(rank|ranking|ranked|best|worst|cleaner|cleanest|dirtier|dirtiest|hazier than|higher than|lower than|more than|less than|compared with|versus|vs)\b/i.test(s)), 'real: no ranking or site-against-site words');
  ok(!all.some((s) => /(κατάταξη|καλύτερ|χειρότερ|πιο καθαρ|σε σύγκριση|περισσότερο από|λιγότερο από)/i.test(s)), 'real: no Greek ranking words');
  ok(!all.some((s) => /(µg|μg|PM2|PM10|pollution level|air quality index)/i.test(s)), 'real: no particle-concentration wording');
  ok(!strings(r.textRows).some((s) => s.includes('Nicosia') || s.includes('Λευκωσία')) || real.attribution.includes('Nicosia'), 'real: the shown site\'s text does not bring in the other site');
  const ps = pairs(r);
  ok(ps.length > 100 && ps.every((p) => p[0].trim() && p[1].trim()), 'real: every pair has English and Greek');
  ok(ps.filter((p) => /[A-Za-z]{4,}/.test(p[0])).every((p) => /[Ͱ-Ͽ]/.test(p[1]) || p[0] === p[1]), 'real: worded pairs have Greek letters in the Greek half');
  ok(!all.some((s) => /[«»]/.test(s)), 'real: no guillemets');
}
console.log('daybars: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
