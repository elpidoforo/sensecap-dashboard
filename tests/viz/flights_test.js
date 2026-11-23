// flights widget: the model builder. Run: node tests/viz/flights_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/flights-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test): a leap year with a missing day, a zero day and a half-published day
const fill = (n, v) => Array.from({ length: n }, () => v);
const a20 = fill(366, 10), d20 = fill(366, 20);
a20[1] = null; d20[1] = null;      // 2 January: no row
a20[2] = 0; d20[2] = 0;            // 3 January: published zero
a20[3] = 7; d20[3] = null;         // 4 January: departures not published
a20[59] = 95;                      // 29 February
a20[365] = null; d20[365] = null;  // 31 December: no row
const made = { retrieved: '2026-11-20', notes: [['Note.', 'Σημείωση.'], ['These do not show that one causes the other.', 'Δεν δείχνουν ότι το ένα προκαλεί το άλλο.']], airports: [
  { icao: 'AAAA', name: ['Alpha field', 'Πεδίο Άλφα'], years: { 2020: { a: a20, d: d20 }, 2021: { a: fill(365, 1), d: fill(365, 2) } } },
  { icao: 'BBBB', name: ['Beta field', 'Πεδίο Βήτα'], years: { 2021: { a: fill(365, 500), d: fill(365, 3) } } },
] };
const m = D.build(made, { airport: 'AAAA', year: '2020' });
ok(m.available && m.airport === 'AAAA' && m.year === '2020' && m.days.length === 366, 'one airport and one year, leap year has 366 days');
ok(m.choices.map((c) => c.id).join() === 'AAAA,BBBB' && m.years.map((y) => y.id).join() === '2020,2021', 'airports in source order, years oldest first');
ok(m.days[1].missing && m.days[1].a === null && m.days[1].d === null && m.days[1].tA === null, 'a day with no row stays null, never 0');
ok(!m.days[2].missing && m.days[2].a === 0 && m.days[2].tA === 0 && /0 international arrivals and 0 international departures/.test(m.days[2].label[0]), 'a published zero stays a zero');
ok(!m.days[3].missing && m.days[3].d === null && /departures not published/.test(m.days[3].label[0]) && /7 international arrivals/.test(m.days[3].label[0]), 'half-published day keeps the one count and says the other is not published');
ok(m.days[59].date === '2020-02-29' && m.days[59].dom === 29 && m.days[59].month === 1 && /Saturday 29 February 2020/.test(m.days[59].label[0]) && /Σάββατο 29 Φεβρουαρίου 2020/.test(m.days[59].label[1]), '29 February 2020 is a Saturday, in both languages');
ok(m.counts.covered === 364 && m.counts.missing === 2 && m.counts.zeroDays === 1, 'covered, missing and zero days counted');
ok(m.lastCoveredYear === '2020-12-30' && m.lastCovered === '2021-12-31' && /31 December 2021/.test(m.lastText[0]), 'last covered day of the year and of the record');
ok(m.months[0].days === 31 && m.months[0].covered === 30 && m.months[0].sumA === 10 * 28 + 0 + 7 && m.months[0].sumD === 20 * 28, 'January sums use only published counts');
ok(m.months[1].days === 29 && m.months[1].sumA === 28 * 10 + 95, 'February sum');
ok(m.counts.medianA === 10 && m.counts.medianD === 20 && D.median([1, null, 3, 2, 10]) === 2.5 && D.median([]) === null, 'medians of the covered days');
ok(m.scaleMax === 100 && m.days[59].tA === 0.95, 'scale is a round number at or above the largest count of THIS airport');
const b = D.select(m, { airport: 'BBBB' });
ok(b.airport === 'BBBB' && b.year === '2021' && b.scaleMax === 500 && m.scaleMax === 100, 'the other airport has its own scale, and falls to a year it has');
ok(D.select(m, { year: '2021' }).year === '2021' && D.select(m, { year: '2021' }).airport === 'AAAA' && D.select(m, 'AAAA', '2021').counts.sumA === 365, 'year selector keeps the airport; positional form works');
ok(D.select(m, { airport: 'ZZZZ' }) === m && D.select(m, { year: '1999' }) === m && D.select(m, {}) === m, 'unknown airport or year keeps the current view');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.days.every((d) => pairOk(d.label)) && m.months.every((x) => pairOk(x.name) && pairOk(x.text)) && Object.keys(m.strings).every((k) => pairOk(m.strings[k])), 'every string is an [en, el] pair, no guillemets, no em dashes');
ok(m.textRows.length === 3 + 12 + 2 && m.textRows.some((r) => /do not show that one causes the other/.test(r[0])), 'text rows: head, totals, scale, 12 months, then the notes');
ok(!/busier|busiest|rank|top /i.test(JSON.stringify(m.textRows)), 'no ranking words');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && D.build({ airports: [] }).available === false, 'honest empty state');

// the real file, with the data pack's own check values (START_HERE_CLAUDE_DAY_2.txt and source_register.csv rows 71, 72)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/flights.json')); } catch (err) { console.log('note: public/site/data/flights.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(r.choices.map((c) => c.id).join() === 'LCLK,LCPH' && r.years.map((y) => y.id).join() === '2018,2019,2020,2021,2022,2023', 'two airports in register order, six years');
  ok(r.airport === 'LCLK' && r.year === '2023', 'opens on the first airport and its latest year');
  for (const ap of ['LCLK', 'LCPH']) {
    let n = 0, miss = 0; for (const y of Object.keys(r.airports[ap].years)) { n += r.airports[ap].years[y].counts.covered; miss += r.airports[ap].years[y].counts.missing; }
    ok(n === 2191 && miss === 0, ap + ': 2,191 distinct dates with a count, no missing day');
    ok(r.airports[ap].lastCovered === '2023-12-31' && r.airports[ap].firstCovered === '2018-01-01', ap + ': covered 2018-01-01 to 2023-12-31');
  }
  const l = D.select(r, { airport: 'LCLK', year: '2023' }).days[0], p = D.select(r, { airport: 'LCPH', year: '2023' }).days[0];
  ok(l.date === '2023-01-01' && l.a === 46 && l.d === 46, '1 January 2023, Larnaka: 46 arrivals and 46 departures');
  ok(p.date === '2023-01-01' && p.a === 17 && p.d === 18, '1 January 2023, Pafos: 17 arrivals and 18 departures');
  ok(JSON.stringify(D.select(r, { airport: 'LCPH', year: '2023' }).days.map((d) => d.a)) !== JSON.stringify(D.select(r, { airport: 'LCLK', year: '2023' }).days.map((d) => d.a)), 'switching airport changes the underlying values');
  const z = D.select(r, { airport: 'LCLK', year: '2020' }); ok(z.days.length === 366 && z.counts.zeroDays >= 1 && z.days.find((d) => d.date === '2020-04-19').a === 0 && z.days.find((d) => d.date === '2020-04-19').d === 0 && !z.days.find((d) => d.date === '2020-04-19').missing && z.days.find((d) => d.date === '2020-04-05').a === 2 && z.days.find((d) => d.date === '2020-04-05').d === 0, '2020 is a leap year; 19 April 2020 at Larnaka is a published zero (0 and 0), not a gap; 5 April is 2 and 0');
  const d1 = D.select(r, { airport: 'LCLK', year: '2018' }).days[0]; ok(d1.a === 41 && d1.d === 42, '1 January 2018, Larnaka: 41 and 42 as in the table');
  ok(Object.keys(r.airports).every((a) => Object.keys(r.airports[a].years).every((y) => r.airports[a].years[y].textRows.every(pairOk) && r.airports[a].years[y].days.every((d) => pairOk(d.label)))) && r.notes.every(pairOk), 'real text rows, day labels and notes are pairs');
  ok(real.sources.length === 2 && real.sources.every((s) => s.licence === 'CC BY 4.0' && /data\.gov\.cy/.test(s.url) && s.credit && pairOk(s.what)) && real.retrieved === '2026-11-20' && real.period.last === '2023-12-31', 'sources, licence, retrieval date and period are in the file');
  ok(r.notes.some((n) => /no hour of the day/.test(n[0])) && r.notes.some((n) => /noise or air quality/.test(n[0])) && r.notes.some((n) => /not compared/.test(n[0])), 'the pack limits travel with the model');
  ok(r.textRows.length <= 300, 'text rows fit the page list');
}
console.log('flights: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
