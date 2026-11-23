// season widget: the model builder. Run: node tests/viz/season_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/season-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test): a leap February, a null, a zero, a flag and a month missing from the table
const made = { months: ['2024-01', '2024-02', '2024-03', '2024-05', '2025-02'], occupancy: [50, 0, null, 120.5, 10], occupancyStatus: ['', '', 'u', 'p', ''],
  electricityGWh: [310, 290, 0, null, 280], electricityStatus: ['', 'e', '', '', ''], notes: [['They happen together. The two charts do not show that one causes the other.', 'Συμβαίνουν μαζί. Τα δύο γραφήματα δεν δείχνουν ότι το ένα προκαλεί το άλλο.']] };
const m = D.build(made);
ok(m.available && m.unit === 'month' && m.months.length === 14 && m.months[0].ym === '2024-01' && m.months[13].ym === '2025-02', 'a continuous month axis from the first to the last month');
ok(m.months[0].perDay === 10 && m.months[0].days === 31, 'GWh per calendar day: 310 GWh over 31 days is 10');
ok(m.months[1].days === 29 && m.months[1].perDay === 10 && m.months[13].days === 28 && m.months[13].perDay === 10, 'leap and plain February use 29 and 28 days');
ok(m.months[1].occ === 0 && /^0% of hotel bedplaces/.test(m.months[1].occText[0]), 'a real zero stays a zero');
ok(m.months[2].occ === null && m.months[2].occStatus === 'u' && /occupancy: no value \[Eurostat flag u\]/.test(m.months[2].label[0]) && m.months[2].gwh === 0 && m.months[2].perDay === 0, 'a null stays null and keeps its flag; zero GWh stays zero');
ok(m.months[3].inFile === false && m.months[3].occ === null && m.months[3].gwh === null && m.months[3].perDay === null && /not in the table/.test(m.months[3].label[0]), 'a month missing from the table is a gap, not a zero');
ok(m.months[4].occ === 120.5 && m.months[4].occStatus === 'p' && m.months[4].gwh === null && m.months[4].perDay === null && /electricity: no value/.test(m.months[4].label[0]), 'missing electricity gives no per-day value');
ok(m.months[1].gwhStatus === 'e' && /\[Eurostat flag e\]/.test(m.months[1].monthText[0]) && /\[σήμανση Eurostat e\]/.test(m.months[1].dayText[1]), 'status flags are shown in both units and both languages');
ok(m.counts.months === 14 && m.counts.common === 3 && m.counts.missingOcc === 10 && m.counts.missingElec === 10 && m.counts.flaggedOcc === 2 && m.counts.flaggedElec === 1, 'counts of common, missing and flagged months');
ok(m.scales.occ.max === 130 && m.scales.occ.full === 100 && m.scales.occ.min === 0 && m.scales.month.max === 400 && m.scales.day.max === 10 && m.elecScale === m.scales.month, 'each chart has its own zero-based scale; occupancy above 100 fits');
const d = D.select(m, 'day');
ok(d.unit === 'day' && d.elecScale === d.scales.day && d.months === m.months && /GWh per calendar day/.test(d.elecTitle[0]) && D.select(d, { unit: 'month' }).unit === 'month', 'the switch changes only the electricity unit');
ok(D.select(m, 'month') === m && D.select(m, 'MW') === m && D.select(m, null) === m, 'unchanged or unknown unit keeps the current model');
ok(m.choices.map((c) => c.id).join() === 'month,day' && m.choices.every((c) => pairOk(c.name) && /GWh/.test(c.name[0])), 'two choices, both in GWh');
ok(!/\bMW\b/.test(JSON.stringify([m.months, m.choices, m.strings, m.scales, m.counts])), 'nothing is converted to MW');
ok(m.textRows.every(pairOk) && d.textRows.every(pairOk) && pairOk(m.ariaLabel) && /do not show that one causes the other/.test(m.ariaLabel[0]) && /do not show that one causes the other/.test(m.strings.noCause[0]), 'pairs everywhere; the not-a-cause sentence is in the label');
ok(m.yearTicks.length === 2 && m.yearTicks[0].i === 0 && m.yearTicks[1].year === 2025 && m.yearTicks[1].i === 12, 'year ticks at each January');
ok(/10\.0000 GWh per calendar day \(310 GWh over 31 days\)/.test(m.months[0].dayText[0]) && /10,0000 GWh ανά ημερολογιακή ημέρα/.test(m.months[0].dayText[1]), 'per-day text carries the month figure and the days');
const e = D.build({ months: ['2024-13'] }); ok(!e.available && pairOk(e.empty) && !D.build(null).available && D.select(e, 'day') === e, 'honest empty state');

// the real file, with the data pack's own check values (START_HERE_CLAUDE_DAY_4.txt, check 3)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/season.json')); } catch (err) { console.log('note: public/site/data/season.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real), at = (ym) => r.months.find((x) => x.ym === ym);
  ok(real.months.length === 104 && r.months.length === 104 && r.counts.common === 104 && r.counts.missingOcc === 0 && r.counts.missingElec === 0, 'check: 104 common months, none missing between January 2018 and August 2026');
  ok(r.period[0] === '2018-01' && r.period[1] === '2026-08', 'January 2018 to August 2026');
  const aug = at('2026-08');
  ok(aug.occ === 98 && aug.gwh === 658.476, 'check: August 2026 shows 98% and 658.476 GWh');
  ok(/August 2026: 98% of hotel bedplaces occupied; 658\.476 GWh available to the internal market in the month, 21\.2412 GWh per calendar day \(31 days\)\./.test(aug.label[0]) && /Αύγουστος 2026: 98% .*658,476 GWh .*21,2412 GWh/.test(aug.label[1]), 'August 2026 label in both languages');
  ok(at('2026-07').occ === 88.1 && at('2026-07').gwh === 666.514, 'July 2026: 88.1% and 666.514 GWh (student investigation row in the pack)');
  ok(r.months.every((x, i) => x.perDay.toFixed(4) === real.packPerDay[i].toFixed(4)), 'GWh per calendar day computed here equals the pack column for all 104 months (4 decimals)');
  ok(at('2020-02').days === 29 && at('2024-02').days === 29 && at('2026-02').days === 28, 'February lengths');
  ok(r.counts.flaggedOcc === 0 && r.counts.flaggedElec === 0 && /none/.test(r.counts.flagText[0]), 'the pack table carries no status flag on these months, and the model says so');
  ok(at('2025-08').occ === 105.9 && r.scales.occ.max === 110 && r.scales.occ.full === 100, 'August 2025 is shown as published (105.9%), above the 100% line');
  ok(r.scales.month.max >= 666.514 && r.scales.day.max >= 21.5005 && r.scales.month.min === 0 && r.scales.day.min === 0, 'electricity scales hold every value and start at zero');
  ok(r.textRows.length === 1 + 104 + real.notes.length && r.textRows.every(pairOk), 'one text row per month plus the notes');
  const all = r.textRows.map((x) => x[0]).join(' ');
  ok(/seasonal changes that happen together/.test(all) && /temperature, available hotel beds, non-tourism demand and finer local electricity data/.test(all) && /National supply includes many users/.test(all), 'the pack wording on what students can and cannot say');
  ok(real.sources.length === 2 && real.sources.every((s) => /Eurostat/.test(s.credit) && s.licenceUrl && pairOk(s.what)) && real.retrieved === '2026-11-22' && !real.termsUnclear, 'two Eurostat sources with terms and dates in the file');
}
console.log('season: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
