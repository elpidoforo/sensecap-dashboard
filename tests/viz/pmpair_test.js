// pmpair widget: the model builder. Run: node tests/viz/pmpair_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/pmpair-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test)
const made = { retrieved: '2026-11-21', yearOrder: ['2021', '2020', '2019', '1900'], years: {
  '2021': { day: [1, 2, 3, 5, 32, 60], nictra: [30, 20, 10, 400, 12.5, 0], amx: [10, 20, 14, 100, null, 0] },
  '2020': { day: [60, 61], nictra: [50, 40], amx: [45, 10] },
  '2019': { day: [], nictra: [], amx: [] },
} };
const m = D.build(made);
ok(m.available && m.live === false && m.year === '2021' && m.scale === 'full', 'first year in source order is shown, full scale, not live');
ok(m.choices.map((c) => c.id).join() === '2021,2020,2019', 'years stay in the order of the source, not sorted');
ok(m.days.length === 5 && m.pairedDays === 5 && m.daysInYear === 365 && m.missingDays === 360, 'a day with one null value is not a pair; counts say so');
ok(!m.days.some((d) => d.doy === 32), 'the null day is a gap, never a zero');
ok(m.days[0].diff === 20 && m.days[1].diff === 0 && m.days[2].diff === -4 && m.days[3].diff === 300, 'difference = traffic site minus background site, per day');
ok(m.days[4].date === '2021-03-01' && m.days[4].nictra === 0 && m.days[4].amx === 0 && m.days[4].diff === 0, 'a real zero stays a zero; day 60 of 2021 is 1 March');
ok(m.median === 0 && m.medianDays === 5 && /from 5 paired days/.test(m.medianText[0]), 'median of the same-day differences with the days it is based on');
ok(JSON.stringify(m.runs) === '[[0,1,2],[3],[4]]', 'lines are split into runs at missing days');
ok(/\+20\.0 µg\/m³/.test(m.days[0].label[0]) && /\+20,0 µg\/m³/.test(m.days[0].label[1]) && /−4\.0/.test(m.days[2].label[0]) && /difference 0\.0 /.test(m.days[1].label[0]), 'signed differences, decimal comma in Greek');
ok(/1 January 2021: Nicosia traffic 30\.0 µg\/m³, Agia Marina Xyliatou 10\.0 µg\/m³/.test(m.days[0].label[0]) && /1 Ιανουαρίου 2021/.test(m.days[0].label[1]), 'a day reads both values with unit and date');
ok(m.axisMax === 400 && m.cutDays === 0 && m.scaleText === null, 'full scale holds the largest value');
const z = D.select(m, null, 'zoom');
ok(z.scale === 'zoom' && z.year === '2021' && z.axisMax === D.ZOOM_CAP && z.cutDays === 1 && pairOk(z.scaleText) && z.textRows.includes(z.scaleText), 'close-up stops at the cap and counts the days above it');
const y20 = D.select(z, '2020');
ok(y20.year === '2020' && y20.scale === 'zoom' && y20.daysInYear === 366 && y20.days[0].date === '2020-02-29' && y20.days[1].date === '2020-03-01', 'leap year dates');
ok(y20.median === 17.5 && y20.axisMax === 50 && y20.cutDays === 0, 'median of two days is their mean; close-up changes nothing when no value is above the cap');
const y19 = D.select(m, '2019');
ok(y19.pairedDays === 0 && y19.median === null && y19.maxValue === null && /no median/.test(y19.medianText[0]) && y19.days.length === 0, 'a year with no pairs has no median (null), said in words');
ok(D.select(m, '1999') === m && D.select(m, '2021', 'full') === m && D.select(m, null, 'sideways') === m, 'unknown year or scale keeps the current view');
ok(m.all.pairedDays === 7 && m.all.median === 5, 'all-years count and median');
ok(m.months.length === 12 && m.months[0].pairedDays === 4 && m.months[1].pairedDays === 0 && m.months[1].median === null && /no paired days/.test(m.months[1].text[0]), 'month rows: empty month has no median');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.notes.every(pairOk) && m.choices.concat(m.scaleChoices).every((c) => pairOk(c.name)) && m.days.every((d) => pairOk(d.label)) && Object.values(m.strings).every(pairOk), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(m.textRows.some((r) => /do not show that one causes the other/.test(r[0])) && /does not show what causes it/.test(m.ariaLabel[0]), 'the not-a-cause sentences are in the text');
ok(/outdoor/.test(m.sites.nictra.kind[0]) && /outdoor/.test(m.sites.amx.kind[0]) && m.textRows.some((r) => /Both monitors are outdoors/.test(r[0])), 'both monitors are named as outdoor monitors');
ok(D.median([]) === null && D.median([3, null, 1]) === 2 && D.niceMax(0).max === 10 && D.niceMax(1317).max === 1500, 'median and axis helpers');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && D.select(e, '2020') === e && !D.build({ years: {} }).available, 'honest empty state');
ok(!/\brank|\btop\b|worst|most /i.test(JSON.stringify(m.textRows)), 'no ranking words');

// the real file, with the pack's own check values (START_HERE_CLAUDE_DAY_3: 6,453 paired days, median +17.59 µg/m³)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/pmpair.json')); } catch (err) { console.log('note: public/site/data/pmpair.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.all.pairedDays === 6453 && real.pairedDays === 6453, 'pack check: 6,453 paired days');
  ok(r.all.median.toFixed(2) === '17.59' && /6,453 paired days, median same-day difference \+17\.59 µg\/m³/.test(r.all.text[0]) && /6\.453 .*\+17,59/.test(r.all.text[1]), 'pack check: median same-day difference +17.59 µg/m³');
  ok(r.choices.length === 19 && r.choices[0].id === '2005' && r.choices[18].id === '2023' && r.year === '2005', '19 years, 2005 to 2023, source order');
  ok(r.pairedDays === 356 && r.daysInYear === 365 && r.days[0].date === '2005-01-01' && r.days[0].nictra === 84.18 && r.days[0].amx === 23.948 && r.days[0].diff === 60.232, '2005: 356 paired days; 1 January 2005 as published (to 0.001)');
  const sum = Object.keys(r.years).reduce((s, k) => s + r.years[k].pairedDays, 0);
  ok(sum === 6453 && r.years['2013'].pairedDays === 365 && r.years['2016'].pairedDays === 297, 'yearly paired days add up to the total; 2013 has 365, 2016 has 297');
  const last = D.select(r, '2023');
  ok(last.days[last.days.length - 1].date === '2023-12-31' && last.days[last.days.length - 1].diff === 43.099, 'last day 31 December 2023');
  ok(Object.keys(r.years).every((k) => { const v = D.select(r, k); return v.textRows.every(pairOk) && v.textRows.length <= 300 && v.days.every((d) => d.nictra >= 0 && d.amx >= 0 && d.x > 0 && d.x < 1) && v.median != null && v.medianDays === v.pairedDays && v.axisMax >= v.maxValue; }), 'every year: pairs, a median with its day count, values inside the axis');
  ok(real.sources.length === 1 && real.sources[0].licence === 'CC BY 4.0' && real.sources[0].doi === '10.5281/zenodo.18305165' && real.retrieved === '2026-11-21' && real.yearOrder.length === 19 && real.period.join() === '2005-01-01,2023-12-31' && pairOk(real.rounding) && real.notes.every(pairOk) && !real.termsUnclear, 'source, licence, DOI, dates, rounding note and caveats are in the file');
  ok(/Weather and regional dust affect both sites/.test(real.notes[0][0]), 'the pack limit is the first note');
}
console.log('pmpair: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
