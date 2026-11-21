'use strict';
/* Tile grid: the pure data side (public/site/viz/tilegrid-data.js). Run: node tests/viz/tilegrid_test.js (no network, no server) */
const path = require('path');
const TG = require(path.join(__dirname, '..', '..', 'public', 'site', 'viz', 'tilegrid-data.js'));
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const bi = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1];

const NOW = Date.parse('2026-11-22T12:00:00Z');
const iso = (secAgo) => new Date(NOW - secAgo * 1000).toISOString();
const one = (det, id = 'x') => TG.build([{ id, title: ['X', 'Χ'], band: 'AIR', kind: 'live', live: true }], { [id]: det }, NOW).tiles[0];

// 1. status boundaries (exactly 1 and 3 intervals)
const IV = 600;
const at = (age) => one({ available: true, refreshSeconds: IV, updated: iso(age) }).status;
ok(at(0) === 'fresh' && at(IV - 1) === 'fresh', 'younger than 1 interval is fresh');
ok(at(IV) === 'ageing', 'exactly 1 interval is ageing');
ok(at(3 * IV) === 'ageing', 'exactly 3 intervals is still ageing');
ok(at(3 * IV + 1) === 'overdue' && at(50 * IV) === 'overdue', 'more than 3 intervals is overdue');
ok(one({ available: true, refreshSeconds: IV, updated: iso(-300) }).status === 'fresh', 'a time slightly in the future (clock skew) counts as age 0, fresh');
ok(one({ available: true, refreshSeconds: IV, updated: iso(30) }).ageSeconds === 30, 'age is computed from now');
ok(one({ available: true, refreshSeconds: IV, retrieved: '2026-11-22', generated: iso(5) }).ageSeconds === 12 * 3600, 'time field order: retrieved is used before generated');
ok(one({ available: true, refreshSeconds: IV, updated: iso(2000), generated: iso(1) }).status === 'overdue', 'updated is used before generated');
ok(one({ available: true, refreshSeconds: IV, generated: iso(10) }).status === 'fresh', 'generated is used when it is the only time');
ok(one({ available: true, refreshSeconds: IV }).status === 'unknown', 'a timed sheet without any time is unknown, not guessed');
ok(one({ available: true, refreshSeconds: IV, updated: 'not a date' }).status === 'unknown', 'an unreadable time is unknown');

// 2. fixed by design is never fresh or stale
for (const det of [{ available: true, refreshSeconds: null, retrieved: '2026-11-19', period: '2021-10-01' }, { available: true, retrieved: '2001-01-01' }, { available: true, refreshSeconds: 0, generated: iso(1) }]) {
  const t = one(det);
  ok(t.status === 'fixed' && t.glyph === 'square' && t.ageSeconds === null && t.ageText === null && !t.pulse, 'no interval means fixed by design with no age');
}
ok(/2026-11-19/.test(one({ available: true, refreshSeconds: null, retrieved: '2026-11-19', period: '2021' }).line[0]), 'fixed tile shows the retrieved date');
ok(/2025/.test(one({ available: true, refreshSeconds: null, period: '2025' }).line[0]), 'fixed tile without retrieved shows the period');
ok(bi(one({ available: true }).line), 'fixed tile without any date still says something in both languages');
ok(one({ available: true, retrieved: '1999-01-01' }).statusLabel[0] === 'Fixed by design', 'the label is "Fixed by design"');

// 3. unavailable keeps the sheet's own reason
const R = ['No official station has reported yet.', 'Κανένας επίσημος σταθμός δεν έχει αναφέρει ακόμη.'];
const un = one({ available: false, reason: R, refreshSeconds: 1800, updated: iso(1) });
ok(un.status === 'unavailable' && un.reason[0] === R[0] && un.reason[1] === R[1] && un.glyph === 'cross' && !un.pulse, 'unavailable keeps its reason and does not pulse');
ok(one({ available: false, reason: R }, 'y').status === 'unavailable', 'unavailable with no interval is still unavailable, not fixed');
const fail1 = one(null), fail2 = one({ error: 'boom' }), fail3 = TG.build([{ id: 'x', title: ['X', 'Χ'], band: 'AIR' }], {}, NOW).tiles[0];
ok([fail1, fail2, fail3].every((t) => t.status === 'unavailable' && bi(t.reason)), 'a failed fetch is unavailable with a bilingual generic reason');
ok(TG.build([{ id: 'x', title: ['X', 'Χ'], band: 'AIR' }], { x: { available: false, reason: R } }, NOW).textRows[0][0].includes(R[0]), 'the reason reaches the text row');

// 4. pulse only for live and fresh
ok(one({ available: true, refreshSeconds: IV, updated: iso(1) }).pulse === true, 'live and fresh pulses');
ok(one({ available: true, refreshSeconds: IV, updated: iso(IV) }).pulse === false, 'live but ageing does not pulse');
ok(TG.build([{ id: 'x', title: ['X', 'Χ'], band: 'AIR', live: false }], { x: { available: true, refreshSeconds: IV, updated: iso(1) } }, NOW).tiles[0].pulse === false, 'not live does not pulse');

// 5. real catalogue shape: 6 sheets hand-copied from /api/stack and /api/stack/<id>
const CAT = { name: 'Kleanthis data stack', sheets: [
  { id: 'population', url: '/api/stack/population', title: ['Residents', 'Κάτοικοι'], band: 'CITY', kind: 'census', live: false, geometry: 'points', unit: 'residents', honesty: ['Census of 1 October 2021 — not live', 'Απογραφή 1ης Οκτωβρίου 2021 — όχι ζωντανά δεδομένα'] },
  { id: 'own-vehicles', url: '/api/stack/own-vehicles', title: ['Own vehicles', 'Δικά μας οχήματα'], band: 'CITY', kind: 'delayed', live: false, geometry: 'points', unit: 'n', honesty: ['Delayed and rounded', 'Καθυστερημένα και στρογγυλεμένα'] },
  { id: 'flood-reaches', url: '/api/stack/flood-reaches', title: ['Flood reaches', 'Τμήματα ποταμών με κίνδυνο πλημμύρας'], band: 'WATER', kind: 'snapshot', live: false, geometry: 'lines', unit: 'n', honesty: ['Snapshot', 'Στιγμιότυπο'] },
  { id: 'earthquakes', url: '/api/stack/earthquakes', title: ['Earthquakes', 'Σεισμοί'], band: 'GROUND', kind: 'catalogue', live: false, geometry: 'points', unit: 'M', honesty: ['Catalogue', 'Κατάλογος'] },
  { id: 'air-stations', url: '/api/stack/air-stations', title: ['Air stations', 'Σταθμοί αέρα'], band: 'AIR', kind: 'live', live: true, geometry: 'points', unit: 'µg/m³', honesty: ['Live', 'Ζωντανά'] },
  { id: 'met-stations', url: '/api/stack/met-stations', title: ['Weather stations', 'Μετεωρολογικοί σταθμοί'], band: 'AIR', kind: 'live', live: true, geometry: 'points', unit: '°C', honesty: ['Live', 'Ζωντανά'] },
] };
const DET = {
  population: { id: 'population', kind: 'census', available: true, refreshSeconds: null, generated: '2026-11-22T11:59:00.000Z', retrieved: '2026-11-19', period: '2021-10-01', source: ['Statistical Service of Cyprus (CYSTAT), Census of Population and Housing 2021', 'Στατιστική Υπηρεσία Κύπρου (CYSTAT), Απογραφή Πληθυσμού και Κατοικιών 2021'], licence: 'CYSTAT data reuse terms.' },
  'own-vehicles': { id: 'own-vehicles', kind: 'delayed', available: true, refreshSeconds: 300, generated: '2026-11-22T11:59:50.000Z', updated: '2026-11-22T11:50:00.000Z', source: ['Kleanthis: the SenseCAP sensors', 'Κλεάνθης: οι αισθητήρες SenseCAP'], licence: 'Own data of the project.' },
  'flood-reaches': { id: 'flood-reaches', kind: 'snapshot', available: true, refreshSeconds: null, generated: '2026-11-22T11:59:00.000Z', retrieved: '2026-11-16', period: 'scenarios last edited 2024-01-30', source: ['Water Development Department', 'Τμήμα Αναπτύξεως Υδάτων'], licence: 'CC BY 4.0' },
  earthquakes: { id: 'earthquakes', kind: 'catalogue', available: true, refreshSeconds: null, retrieved: '2026-11-19', period: '2015-01-01 / 2026-11-19', source: ['US Geological Survey', 'US Geological Survey'], licence: 'Public domain' },
  'air-stations': { id: 'air-stations', kind: 'live', available: false, reason: R, refreshSeconds: 1800, generated: '2026-11-22T11:59:00.000Z', updated: null, source: ['EEA', 'ΕΟΠ'], licence: 'EEA reuse policy' },
  'met-stations': { id: 'met-stations', kind: 'live', available: true, refreshSeconds: 600, generated: '2026-11-22T11:59:00.000Z', updated: '2026-11-22T11:57:00.000Z', source: ['Dept of Meteorology', 'Τμήμα Μετεωρολογίας'], licence: 'Open data' },
};
const M = TG.build(CAT, DET, NOW), byId = (id) => M.tiles.find((t) => t.id === id);
ok(M.total === 6 && M.tiles.length === 6 && M.empty === null, 'one tile per sheet');
ok(byId('population').status === 'fixed' && byId('earthquakes').status === 'fixed' && byId('flood-reaches').status === 'fixed', 'census, catalogue and snapshot are fixed by design');
ok(byId('own-vehicles').status === 'ageing' && byId('own-vehicles').ageSeconds === 600, 'delayed sheet 10 min old on a 5 min interval is ageing (2 intervals)');
ok(byId('met-stations').status === 'fresh' && byId('met-stations').pulse === true && byId('met-stations').ageText[0] === '3 min ago', 'live weather 3 min old on a 10 min interval is fresh and pulses');
ok(byId('air-stations').status === 'unavailable' && byId('air-stations').reason[0] === R[0], 'real unavailable live sheet keeps its reason');
ok(M.counts.fixed === 3 && M.counts.ageing === 1 && M.counts.fresh === 1 && M.counts.unavailable === 1 && Object.values(M.counts).reduce((a, b) => a + b, 0) === 6, 'counts add up');
ok(byId('population').licence === 'CYSTAT data reuse terms.' && byId('population').retrieved === '2026-11-19' && bi(byId('population').source), 'tile keeps source, licence and retrieved for the hover');
ok(byId('population').honesty[0].includes('not live'), 'the honesty line of the catalogue is kept');
ok(TG.build(CAT.sheets, DET, new Date(NOW)).total === 6, 'accepts the sheets array and a Date for now');
ok(TG.build(CAT, DET, new Date(NOW).toISOString()).tiles[1].status === M.tiles[1].status, 'accepts an ISO string for now');
ok(JSON.stringify(TG.build(CAT, DET, NOW)) === JSON.stringify(M), 'same input and same now give the same model');
let threw = false; try { TG.build(CAT, DET, undefined); } catch (e) { threw = true; } ok(threw, 'now is required');

// 6. band grouping order (WATER, GROUND, CITY, AIR, SPACE); empty bands left out; catalogue order kept inside a band; no ranking
ok(M.bands.map((b) => b.k).join() === 'WATER,GROUND,CITY,AIR', 'bands in stack order, SPACE left out when it has no sheet');
ok(M.bands.find((b) => b.k === 'CITY').tiles.map((t) => t.id).join() === 'population,own-vehicles', 'inside a band the catalogue order is kept (no sorting by status)');
ok(M.tiles.map((t) => t.id).join() === 'flood-reaches,earthquakes,population,own-vehicles,air-stations,met-stations', 'flat tiles follow the band order');
ok(TG.BAND_ORDER.join() === 'WATER,GROUND,CITY,AIR,SPACE', 'band order constant');
const withSpace = TG.build([{ id: 'a', title: ['A', 'Α'], band: 'SPACE' }, { id: 'b', title: ['B', 'Β'], band: 'WATER' }, { id: 'c', title: ['C', 'Γ'], band: 'MARS' }], {}, NOW);
ok(withSpace.bands.map((b) => b.k).join() === 'WATER,SPACE,OTHER', 'SPACE comes after the other bands and an unknown band is kept at the end, not dropped');
ok(!('score' in M) && !('rank' in M) && M.tiles.every((t) => !('score' in t) && !('rank' in t)), 'no score and no rank anywhere');

// 7. bilingual strings
const strs = [];
(function walk(o) { if (Array.isArray(o) && o.length === 2 && typeof o[0] === 'string' && typeof o[1] === 'string') strs.push(o); else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v); })(M);
ok(strs.length > 20 && strs.every(bi), 'every visible string is a non-empty [en, el] pair');
ok(strs.every((p) => !/[«»]/.test(p[0] + p[1])), 'no guillemets');
ok(strs.every((p) => !/null|undefined|NaN/.test(p[0] + p[1])), 'no null/undefined/NaN reaches the screen');
ok(Object.values(TG.STATUS).every((s) => bi(s.label)) && Object.values(TG.BAND_NAME).every(bi), 'status and band names are pairs');
ok(M.tiles.every((t) => /[Α-Ωα-ω]/.test(t.statusLabel[1])), 'status labels have Greek letters');
ok(bi(M.ariaLabel) && /6 data sheets/.test(M.ariaLabel[0]) && /6/.test(M.ariaLabel[1]) && /fixed by design/.test(M.ariaLabel[0]), 'aria label sentence from the model');

// 8. text rows: one per sheet, colour is never the only signal
ok(M.textRows.length === M.tiles.length && M.textRows.every(bi), 'one text row per sheet');
ok(M.textRows[4][0].includes('Air stations') && M.textRows[4][0].includes('Unavailable') && M.textRows[4][0].includes('EEA'), 'text row has title, status and source');
ok(M.textRows[5][0].includes('3 min ago') && M.textRows[5][1].includes('πριν 3 λ.'), 'text row has the age in both languages');
ok(M.textRows[2][0].includes('Fixed by design') && M.textRows[2][0].includes('2026-11-19'), 'fixed row shows its date');
ok(M.tiles.every((t) => t.glyph && t.glyphChar && t.statusLabel[0]), 'every tile has a glyph and a text status besides colour');
ok(new Set(Object.values(TG.STATUS).map((s) => s.glyph)).size === 6, 'six statuses, six different glyphs');

// 9. empty state
const E = TG.build({ sheets: [] }, {}, NOW);
ok(E.total === 0 && bi(E.empty) && E.bands.length === 0 && E.textRows.length === 0 && bi(E.ariaLabel), 'no sheets gives an honest empty sentence');
ok(TG.build(null, null, NOW).total === 0, 'null input does not throw');

// 10. age text
ok(TG.ageText(5)[0] === '5 s ago' && TG.ageText(59.9)[0] === '59 s ago' && TG.ageText(60)[0] === '1 min ago' && TG.ageText(3600)[0] === '1 h ago' && TG.ageText(86400 * 2)[0] === '2 d ago', 'age text units');

console.log('tilegrid: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
