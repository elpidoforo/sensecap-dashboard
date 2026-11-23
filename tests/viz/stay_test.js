// stay widget: the model builder. Run: node tests/viz/stay_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/stay-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test)
const made = { years: [2001, 2002, 2003, 2004], retrieved: '2026-01-01',
  markers: { u: ['marker u', 'σήμανση u'], '...': ['marker dots', 'σήμανση τελείες'] },
  locations: [{ name: ['Zeta (%)', 'Ζήτα (%)'], breakAfter: null }, { name: ['Alpha (from 2003) (%)', 'Άλφα (από το 2003) (%)'], breakAfter: 2002 }, { name: ['Mid (%)', 'Μέση (%)'], breakAfter: 2004 }],
  types: [
    { name: ['ALL', 'ΟΛΑ'], total: [1000, null, 2500000, 0], totalMarker: ['', 'u', '', ''], share: [[40, null, 0, 12.5], [null, null, 60.1, 99], [1, 2, 3, null]], marker: [['', 'u', '', ''], ['...', '...', '', ''], ['', '', '', '']] },
    { name: ['Tents', 'Σκηνές'], total: [null, null, null, null], totalMarker: ['u', 'u', 'u', 'u'], share: [[null, null, null, null], [null, null, null, null], [null, null, null, null]], marker: [['u', 'u', 'u', 'u'], ['...', '...', 'u', 'u'], ['u', 'u', 'u', 'u']] },
  ],
  notes: [['A note.', 'Μια σημείωση.']] };
const m = D.build(made);
ok(m.available && m.type === '0' && m.location === '0' && m.points.length === 4, 'first type and first location by default, one point per year');
ok(m.choices.map((c) => c.name[0]).join() === 'ALL,Tents' && m.locations.map((l) => l.name[0]).join() === 'Zeta,Alpha (from 2003),Mid', 'both selector lists keep the source order (not sorted by name or value)');
ok(m.locations[0].source === 'Zeta (%)', 'the source label is kept beside the display name');
ok(m.points[0].share === 40 && m.points[0].total === 1000 && /2001, Zeta: 40% of 1,000 tourists \(accommodation: ALL\)\./.test(m.points[0].label[0]), 'share and total travel together in the label');
ok(/40% από 1\.000 τουρίστες/.test(m.points[0].label[1]), 'Greek number format');
ok(m.points[1].share === null && m.points[1].marker === 'u' && m.points[1].total === null && m.points[1].totalMarker === 'u' && /no share, publisher marker u; total number: publisher marker u/.test(m.points[1].label[0]), 'a marker stays null with its marker, never 0');
ok(m.points[2].share === 0 && m.points[2].marker === '' && /2003, Zeta: 0% of 2,500,000 tourists/.test(m.points[2].label[0]), 'a real zero share stays a zero');
ok(m.points[3].total === 0 && m.points[3].share === 12.5 && /12\.5% of 0 tourists/.test(m.points[3].label[0]) && /12,5%/.test(m.points[3].label[1]), 'a real zero total stays a zero; decimals as published');
ok(m.scales.share.max === 40 && m.scales.share.min === 0 && m.scales.total.max === 2500000 && m.scales.total.min === 0 && m.scales.share !== m.scales.total, 'two separate zero-based scales');
ok(m.scales.total.ticks[2].text[0] === '2.5M' && m.scales.total.ticks[2].text[1] === '2,5 εκ.', 'count axis labels');
ok(m.breaks.length === 0 && m.counts.withShare === 3 && m.counts.marked.u === 1, 'no break for a plain location; counts of years with and without a figure');
const a = D.select(m, { location: '1' });
ok(a.location === '1' && a.type === '0' && a.breaks.length === 1 && a.breaks[0].after === 2002 && a.breaks[0].index === 1 && pairOk(a.breaks[0].text), 'series break after the stated year');
ok(a.points[0].marker === '...' && a.points[0].share === null && a.counts.marked['...'] === 2 && a.scales.share.max === 100, 'the ... marker is kept; scale follows the selected location');
ok(D.select(m, { location: '2' }).breaks.length === 0, 'a break after the last year is not drawn');
const t = D.select(a, { type: '1' });
ok(t.type === '1' && t.location === '1' && t.points.every((p) => p.share === null && p.total === null) && t.scales.share.max === 5 && t.scales.total.max === 1 && t.counts.withShare === 0, 'all-marker selection: nothing drawn as zero, scales still valid');
ok(D.select(m, { type: '9' }) === m && D.select(m, { location: 'x' }) === m && D.select(m, {}) === m && D.select(m, { type: '0', location: '0' }) === m, 'unknown or unchanged selection keeps the current model');
ok(m.textRows.every(pairOk) && a.textRows.every(pairOk) && t.textRows.every(pairOk) && pairOk(m.ariaLabel) && Object.keys(m.strings).every((k) => pairOk(m.strings[k])), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(m.textRows.some((r) => r[0] === 'marker u') && !m.textRows.some((r) => r[0] === 'marker dots') && a.textRows.some((r) => r[0] === 'marker dots'), 'marker explanations appear when the marker is on screen');
ok(!/rank|"top|most|worst/i.test(JSON.stringify(m)) && JSON.stringify(m).indexOf('"types"') === -1, 'no ranking words; raw table not serialised with the model');
const e = D.build({ types: [] }); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && D.select(e, { type: '0' }) === e, 'honest empty state');

// the real file, with the data pack's own check values (START_HERE_CLAUDE_DAY_4.txt, check 1)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/stay.json')); } catch (err) { console.log('note: public/site/data/stay.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  const loc = (name) => r.locations.find((l) => l.source === name).id, at = (mm, y) => mm.points.find((p) => p.year === y);
  ok(r.choices.length === 26 && r.locations.length === 10 && r.years.join() === '2017,2018,2019,2020,2021,2022,2023,2024,2025', '26 accommodation types, 10 reporting locations, 2017 to 2025');
  ok(r.choices[0].name[0] === 'TOTAL' && r.typeName[0] === 'TOTAL', 'TOTAL is the first accommodation type');
  ok(r.locations.map((l) => l.source).join('|') === 'Paralimni (%)|Ayia Napa (%)|Larnaka (%)|Lemesos (%)|Pafos (from 2024) (%)|Polis (from 2024) (%)|Pafos/Polis (2017 until 2023) (%)|Lefkosia (%)|Hill Resorts (2017 until 2019) (%)|Other Location / Two or More (Hill Resorts from 2021) (%)', 'locations in the order of the source table');
  const pafos = D.select(r, { location: loc('Pafos (from 2024) (%)') }), polis = D.select(r, { location: loc('Polis (from 2024) (%)') }), comb = D.select(r, { location: loc('Pafos/Polis (2017 until 2023) (%)') });
  ok(at(pafos, 2025).share === 28.6, 'check: TOTAL 2025 Pafos 28.6%');
  ok(at(D.select(r, { location: loc('Larnaka (%)') }), 2025).share === 15.4, 'check: TOTAL 2025 Larnaka 15.4%');
  ok(at(D.select(r, { location: loc('Lemesos (%)') }), 2025).share === 12.3, 'check: TOTAL 2025 Lemesos 12.3%');
  ok(at(D.select(r, { location: loc('Lefkosia (%)') }), 2025).share === 5.4, 'check: TOTAL 2025 Lefkosia 5.4%');
  ok(at(polis, 2025).share === 0.9 && polis.location !== pafos.location, 'check: Polis shown separately, 0.9%');
  ok(at(pafos, 2025).total === 4534073 && /28\.6% of 4,534,073 tourists/.test(at(pafos, 2025).label[0]) && /28,6% από 4\.534\.073 τουρίστες/.test(at(pafos, 2025).label[1]), 'check: national total 4,534,073 tourists for TOTAL 2025');
  ok([2017, 2018, 2019, 2021, 2022, 2023].every((y) => at(comb, y).share != null && at(pafos, y).share === null && at(pafos, y).marker === '...' && at(polis, y).marker === '...'), 'through 2023 only the combined Pafos/Polis category has a figure');
  ok(at(comb, 2023).share === 34.2 && at(comb, 2024).share === null && at(comb, 2024).marker === '...' && at(comb, 2025).marker === '...' && at(pafos, 2024).share === 31.5 && at(polis, 2024).share === 1.1, 'the split in 2024');
  ok([pafos, polis, comb].every((x) => x.breaks.length === 1 && x.breaks[0].after === 2023 && /2024/.test(x.breaks[0].text[0])) && D.select(r, { location: loc('Larnaka (%)') }).breaks.length === 0, 'the 2024 split is a marked break on the three Pafos/Polis series only');
  ok(at(pafos, 2020).marker === 'u' && at(pafos, 2020).share === null && at(pafos, 2020).total === 631609 && /no share, publisher marker u; 631,609 tourists/.test(at(pafos, 2020).label[0]), '2020: marker u on the share, total still published');
  const five = D.select(polis, { type: r.choices.find((c) => c.name[0] === '5-Star Hotel').id });
  ok(at(five, 2025).marker === 'u' && at(five, 2025).total === 534533 && at(five, 2020).totalMarker === 'u' && at(five, 2020).total === null, 'markers kept in other accommodation types');
  let cells = 0, u = 0, dots = 0, plain = 0;
  for (const c of r.choices) for (const l of r.locations) for (const p of D.select(r, { type: c.id, location: l.id }).points) { cells++; if (p.marker === 'u') u++; else if (p.marker === '...') dots++; else if (p.share != null) plain++; }
  let tu = 0, td = 0, tn = 0; for (const c of r.choices) for (const p of D.select(r, { type: c.id }).points) { if (p.totalMarker === 'u') tu++; else if (p.totalMarker === '...') td++; else if (p.total != null) tn++; }
  ok(cells === 2340 && tu + td + tn === 234 && u + tu === 473 && dots + td === 969 && plain + tn === 1132, 'all 2,574 cells of the pack table: 473 u, 969 ..., 1,132 values');
  ok(pafos.textRows.some((x) => /not guest-nights/.test(x[0])) && pafos.textRows.some((x) => /not the municipalities formed in 2024/.test(x[0])) && pafos.textRows.some((x) => /Nothing is ranked/.test(x[0])), 'the limits are in the text rows');
  ok(!/guest-nights/.test(pafos.ariaLabel[0]) && !/guest-nights/.test(at(pafos, 2025).label[0]), 'figures are never called guest-nights');
  ok(real.sources.length === 1 && real.sources[0].licence === 'CC BY 4.0' && real.retrieved === '2026-11-22' && real.period === '2017-2025' && !real.termsUnclear, 'source, licence and dates are in the file');
  ok(r.choices.every((c) => pairOk(c.name)) && r.locations.every((l) => pairOk(l.name)) && pafos.textRows.every(pairOk), 'real names and text rows are pairs');
}
console.log('stay: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
