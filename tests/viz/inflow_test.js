// inflow widget: the model builder. Run: node tests/viz/inflow_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/inflow-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const P = ['OCTOBER', 'NOVEMBER', 'DECEMBER', 'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY-SEPTEMBER'];

// made-up input (Demo data, only for the test)
const made = { periods: P, lastPopulated: 'December 2002', retrieved: '2026-01-01', years: [
  { y: '2000-01', v: ['1.000', '2.000', '3.000', '0', '0.500', '0.250', '0.125', '0.100', '0.025', '0.000'], total: '7.000', partial: false },
  { y: '2001-02', v: ['0.100', '0.200', '0.300', '0.400', '0.500', '0.600', '0.700', '0.800', '0.900', null], total: '4.5', partial: false },
  { y: '2002-03', v: ['1.004', '1.004', '1.004', null, null, null, null, null, null, null], total: '3.0', partial: true },
  { y: '2003-04', v: ['10.000', '20.000', null, null, null, null, null, null, null, null], total: '25', partial: false },
  { y: '2004-05', v: [null, null, null, null, null, null, null, null, null, null], total: null, partial: false },
] };
const m = D.build(made, { year: '2000-01' });
ok(m.available && m.year === '2000-01' && m.intervals.length === 10, 'one water year at a time, ten reporting intervals');
ok(m.intervals.every((it) => it.k !== 'TOTAL') && m.intervals[9].k === 'JULY-SEPTEMBER' && m.intervals[9].months === 3 && m.intervals.slice(0, 9).every((it) => it.months === 1), 'no TOTAL in the series; summer is one interval of three months');
ok(m.intervals[3].value === 0 && m.intervals[3].t === 0 && m.intervals[3].published === '0' && m.intervals[9].value === 0, 'a published zero stays a zero');
ok(m.check.kind === 'equal' && m.sumText === '7.000' && m.nBlank === 0, 'intervals add up to the total exactly (whole thousandths)');
ok(m.intervals[0].calendarYear === 2000 && m.intervals[3].calendarYear === 2001 && /^October 2000: 1\.000 million m³/.test(m.intervals[0].label[0]), 'October to December belong to the first calendar year, the rest to the second');
const b = D.select(m, '2001-02');
ok(b.intervals[9].value === null && b.intervals[9].t === null && b.intervals[9].published === null && /Blank is not zero/.test(b.intervals[9].label[0]), 'a blank interval stays null, never 0, and says so');
ok(b.check.kind === 'equal' && b.nBlank === 1 && b.nPublished === 9 && /1 interval is blank/.test(b.check.text[0]), 'total with fewer decimals that matches is equal; the blank is counted');
const c = D.select(m, '2002-03');
ok(c.partial && c.check.kind === 'rounding' && c.check.diffText === '0.012' && /fits rounding/.test(c.check.text[0]) && /3\.012/.test(c.check.text[0]), 'a rounding difference is stated, not hidden');
ok(c.partialText && /only up to December 2002/.test(c.partialText[0]) && /partial/.test(c.totalText[0]), 'partial year says up to which month');
const d = D.select(m, '2003-04');
ok(d.check.kind === 'larger' && d.check.diffText === '5.000' && /more than rounding can explain/.test(d.check.text[0]), 'a difference larger than rounding is called that');
const e5 = D.select(m, '2004-05');
ok(e5.total === null && e5.sum === null && e5.check.kind === 'none' && e5.intervals.every((it) => it.value === null) && e5.yMax === 1, 'a year with nothing published stays empty');
ok(m.strip.map((s) => s.year).join() === '2000-01,2001-02,2002-03,2003-04,2004-05' && m.strip[3].total === 25 && m.strip[4].total === null && m.strip[4].t === null, 'strip is in time order, not sorted; missing total is null');
ok(m.strip[2].partial && /partial year/.test(m.strip[2].label[0]) && m.stripMax === 50, 'partial year is flagged in the strip');
ok(D.build({ periods: P, years: made.years.slice(0, 3) }).year === '2001-02' && D.build(made).year === '2004-05', 'default is the latest year that is not partial');
ok(D.select(m, '1900-01') === m, 'unknown year keeps the current view');
ok(m.choices.length === 5 && m.choices.every((x) => pairOk(x.name)) && /partial/.test(m.choices[2].name[0]), 'choices in the source order');
ok([m, b, c, d, e5].every((v) => v.textRows.every(pairOk) && pairOk(v.ariaLabel) && v.intervals.every((it) => pairOk(it.label) && pairOk(it.name) && pairOk(it.short))) && Object.keys(m.strings).every((k) => pairOk(m.strings[k])), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(m.textRows.some((r) => /Inflow is not storage/.test(r[0])) && /Inflow is not storage/.test(m.ariaLabel[0]), 'the limit sentence travels with the picture');
ok(D.scaled('118.110', 3) === 118110 && D.scaled('129', 3) === 129000 && D.unscaled(43700, 3) === '43.700' && D.unscaled(5, 3) === '0.005', 'thousandths arithmetic');
// a file whose column order differs, with a TOTAL column in the list: still read by name
const odd = D.build({ periods: ['TOTAL'].concat(P), years: [{ y: '2010-11', v: ['99'].concat(made.years[0].v), total: '7.000', partial: false }] });
ok(odd.intervals[0].published === '1.000' && odd.check.kind === 'equal', 'intervals are read by name, so a TOTAL column cannot enter the series');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && e.textRows.length === 1, 'honest empty state');

// the real file, with the check values from the pack (START_HERE_CLAUDE_DAY_4.txt, check 2)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/inflow.json')); } catch (err) { console.log('note: public/site/data/inflow.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real, { year: '2018-19' });
  ok(real.years.length === 36 && r.choices[0].id === '1987-88' && r.choices[35].id === '2022-23', '36 water years, 1987-88 to 2022-23');
  ok(r.totalPublished === '265.042' && r.total === 265.042, '2018-19 published total is 265.042 million m3');
  ok(r.intervals.length === 10 && r.intervals.every((it) => it.k !== 'TOTAL') && real.periods.indexOf('TOTAL') === -1, 'TOTAL row is not in the monthly series');
  ok(r.intervals[9].k === 'JULY-SEPTEMBER' && r.intervals[9].published === '2.066' && r.intervals[9].months === 3, 'July to September is one interval (2.066)');
  ok(r.intervals[3].published === '118.110' && r.check.kind === 'equal' && r.sumText === '265.042', '2018-19 intervals add up to the published total');
  const p = D.select(r, '2022-23');
  ok(p.partial && p.nPublished === 3 && p.intervals.slice(0, 3).map((it) => it.published).join() === '3.946,2.976,2.922' && p.intervals.slice(3).every((it) => it.value === null), '2022-23 has values to December only; later intervals are null');
  ok(/only up to December 2022/.test(p.partialText[0]) && p.totalPublished === '9.844' && p.check.kind === 'equal', '2022-23 is marked partial after December; its total 9.844 covers three months');
  ok(r.strip.filter((s) => s.partial).map((s) => s.year).join() === '2022-23' && real.years.filter((y) => y.partial).length === 1, 'only 2022-23 is partial');
  const f = D.select(r, '1987-88');
  ok(f.check.kind === 'larger' && f.sumText === '198.000' && f.totalPublished === '154.3' && f.check.diffText === '43.700' && f.intervals[9].value === null, '1987-88: intervals add to 198.000 but the published total is 154.3; stated, not hidden');
  const kinds = r.choices.map((ch) => r.years[ch.id].check.kind);
  ok(kinds.filter((k) => k === 'equal').length === 35 && kinds.filter((k) => k === 'larger').length === 1, 'the other 35 years add up exactly');
  ok(r.choices.slice(0, 11).every((ch) => r.years[ch.id].intervals[9].value === null) && r.years['2000-01'].intervals[9].value === 0, 'summer is blank (not zero) for 1987-88 to 1997-98; 2000-01 summer is a published zero');
  ok(r.strip.map((s) => s.year).join() === real.years.map((y) => y.y).join() && r.stripMax === 300, 'strip keeps the published time order');
  ok(real.years[0].v[0] === '0.140', 'published precision kept (trailing zeros)');
  const s = real.sources[0];
  ok(real.sources.length === 1 && s.licence === 'CC BY-SA 4.0' && s.shareAlike === true && /Water Development Department/.test(s.credit) && /creativecommons\.org\/licenses\/by-sa\/4\.0/.test(s.licenceUrl) && pairOk(s.what), 'licence CC BY-SA 4.0 with attribution and share-alike in the file');
  ok(real.retrieved === '2026-11-22' && real.notes.every(pairOk) && r.textRows.some((t) => /CC BY-SA 4\.0/.test(t[0])), 'retrieval date and notes in the file; licence in the text rows');
  ok(r.choices.every((ch) => { const v = D.select(r, ch.id); return v.textRows.every(pairOk) && pairOk(v.ariaLabel); }), 'real text rows are pairs for every year');
  ok(D.build(real).year === '2021-22', 'default view is 2021-22, the latest full year');
}
console.log('inflow: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
