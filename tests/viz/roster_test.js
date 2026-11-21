'use strict';
// node tests/viz/roster_test.js. No network. Fixture: 4 sheet answers copied by hand from /api/stack/<id>, shortened.
const D = require('../../public/site/viz/roster-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

const NOW = Date.parse('2026-11-22T00:00:00.000Z');
const cat = { sheets: [
  { id: 'population', kind: 'census', live: false, title: ['Residents', 'Κάτοικοι'] },
  { id: 'own-vehicles', kind: 'delayed', live: false },
  { id: 'bus-now', kind: 'scheduled', live: false },
  { id: 'air-stations', kind: 'live', live: true },
  { id: 'fire-hotspots', kind: 'live', live: true }
] };
const sheets = {
  'fire-hotspots': { id: 'fire-hotspots', title: ['Fire hotspots from space', 'Θερμές κηλίδες φωτιάς από δορυφόρο'], kind: 'live', live: true, available: false, refreshSeconds: 1800,
    honesty: ['Heat seen by a passing satellite in the last 24 hours — not a confirmed fire', 'Θερμότητα που είδε δορυφόρος'], source: ['NASA FIRMS', 'NASA FIRMS'], licence: 'NASA open data; acknowledgement requested', updated: null, features: [],
    reason: ['No FIRMS key is set on this server.', 'Δεν έχει οριστεί κλειδί FIRMS σε αυτόν τον διακομιστή.'], generated: '2026-11-21T23:30:52.038Z' },
  'air-stations': { id: 'air-stations', title: ['Official air-quality stations', 'Επίσημοι σταθμοί ποιότητας αέρα'], kind: 'live', live: true, available: true, refreshSeconds: 1800,
    honesty: ['Hourly values', 'Ωριαίες τιμές'], source: ['EEA', 'ΕΟΠ'], licence: 'EEA reuse policy', updated: '2026-11-21T23:45:00.000Z',
    features: [{ lat: 35.1234, lng: 33.4567, pm25: 8 }, { lat: 34.9876, lng: 33.1111, pm25: 5 }, { lat: 35.0011, lng: 33.2222, pm25: 6 }] },
  'bus-now': { id: 'bus-now', title: ['Buses by the timetable', 'Λεωφορεία σύμφωνα με το δρομολόγιο'], kind: 'scheduled', live: false, available: true, refreshSeconds: 45,
    honesty: ['Timetable, not observed buses', 'Δρομολόγιο, όχι λεωφορεία που παρατηρήθηκαν'], source: ['traffic4cyprus', 'traffic4cyprus'], licence: 'CC BY 4.0', updated: '2026-11-21T23:00:00.000Z',
    trips: [{ path: [[0, 35.123456, 33.654321], [60, 35.2, 33.7]] }, { path: [[0, 34.912345, 33.012345]] }], counts: { running: 2, shown: 2 } },
  'own-vehicles': { id: 'own-vehicles', title: ['Our sensor vehicles', 'Τα οχήματα με τους αισθητήρες μας'], kind: 'delayed', live: false, available: true, refreshSeconds: 300, demo: true,
    honesty: ['About two hours late and rounded to 1 km', 'Περίπου δύο ώρες αργότερα'], source: ['Kleanthis', 'Κλεάνθης'], licence: 'Own data of the project.', updated: '2026-11-21T23:57:00.000Z',
    vehicles: [{ id: 'v1', trail: [[1795000000, 35.01, 33.02], [1795000300, 35.02, 33.03]] }, { id: 'v2', trail: [[1795000000, 34.91, 33.52]] }], counts: { vehicles: 2, withTrail: 2 } }
};

// age and progress maths
eq(D.ageSeconds('2026-11-21T23:45:00.000Z', NOW), 900, 'age 15 min');
eq(D.ageSeconds('2026-11-22T00:05:00.000Z', NOW), 0, 'future stamp floors at 0');
eq(D.ageSeconds(null, NOW), null, 'no stamp -> null');
eq(D.ageSeconds('garbage', NOW), null, 'bad stamp -> null');
eq(D.progressPct(900, 1800), 50, '900/1800 = 50');
eq(D.progressPct(1, 3), 33.3, 'rounds to one decimal');
eq(D.progressPct(5000, 1800), 100, 'capped at 100');
eq(D.progressPct(1800, 1800), 100, 'exactly 100');
eq(D.progressPct(0, 300), 0, 'zero age -> 0');
eq(D.progressPct(10, 0), null, 'zero interval -> null');
eq(D.progressPct(10, null), null, 'no interval -> null');
eq(D.progressPct(null, 300), null, 'no age -> null');
eq(D.ageText(30)[0], '30 s ago', 'age text s'); eq(D.ageText(900)[0], '15 min ago', 'age text min'); eq(D.ageText(7200)[0], '2 h ago', 'age text h'); eq(D.ageText(null)[0], 'not fetched yet', 'age text none');

const m = D.buildModel({ catalogue: cat, sheets }, NOW, { step: 1 });
eq(m.rows.map((r) => r.id), ['fire-hotspots', 'air-stations', 'bus-now', 'own-vehicles'], 'rows: roster sheets only, in board order (census left out)');
const by = (id) => m.rows.find((r) => r.id === id);
// unavailable row shows its own reason
ok(!by('fire-hotspots').available && by('fire-hotspots').status === 'unavailable', 'fire unavailable');
eq(by('fire-hotspots').reason, sheets['fire-hotspots'].reason, 'reason copied as given');
eq(by('fire-hotspots').progress, null, 'unavailable has no progress');
eq(by('fire-hotspots').count, 0, 'unavailable has zero count');
ok(m.textRows.some((t) => t[0].indexOf('No FIRMS key') >= 0 && t[1].indexOf('κλειδί FIRMS') >= 0), 'reason in textRows both languages');
// available rows
eq(by('air-stations').progress, 50, 'air progress 50'); eq(by('air-stations').status, 'ok', 'air ok');
eq(by('bus-now').ageSeconds, 3600, 'bus age'); eq(by('bus-now').progress, 100, 'bus capped'); ok(by('bus-now').capped && by('bus-now').status === 'past', 'bus past interval flag');
eq(by('own-vehicles').progress, 60, 'vehicles 180/300 = 60');
ok(by('own-vehicles').demo, 'demo flag kept');
eq(by('own-vehicles').count, 2, 'vehicle count from vehicles'); eq(by('bus-now').count, 2, 'bus count from trips'); eq(by('air-stations').count, 3, 'air count = features');
// no stamp but available: honest, no progress
const noStamp = D.buildModel({ sheets: { 'air-stations': Object.assign({}, sheets['air-stations'], { updated: null }) } }, NOW);
eq(noStamp.rows[0].status, 'nostamp', 'available without stamp'); eq(noStamp.rows[0].progress, null, 'no stamp, no progress');
// a sheet the server did not answer
const none = D.buildModel({ catalogue: cat, sheets: {} }, NOW);
ok(none.rows.length === 4 && none.rows.every((r) => r.status === 'noanswer' && r.reason), 'no answers -> every row says so');
// empty
const empty = D.buildModel({ sheets: {} }, NOW);
ok(empty.empty && empty.empty.length === 2 && empty.rows.length === 0 && empty.step.m === 0, 'empty state pair');

// tiles and the one-tile rule
eq(D.tileUnit([0, 3, 7], 24), 1, 'small counts: one tile = 1');
eq(D.tileUnit([100], 24), 5, '100 records, cap 24 -> 5');
eq(D.tileUnit([24], 24), 1, 'exactly cap -> 1'); eq(D.tileUnit([25], 24), 2, 'just over cap -> 2');
eq(D.tileUnit([1000], 24), 50, '1000 -> 50'); eq(D.tileUnit([], 24), 1, 'no counts -> 1');
eq(D.tilesOf(0, 5), 0, '0 records, 0 tiles'); eq(D.tilesOf(1, 5), 1, 'started tile counts'); eq(D.tilesOf(11, 5), 3, '11/5 -> 3');
eq(m.skyline.oneTile, 1, 'fixture: one tile = 1'); eq(m.skyline.oneTileText[0], 'one tile = 1 record', 'one-tile text en');
eq(m.skyline.columns.map((c) => c.tiles), [0, 3, 2, 2], 'columns tiles');
const big = D.buildModel({ sheets: { 'air-stations': Object.assign({}, sheets['air-stations'], { features: new Array(130).fill({ lat: 1, lng: 1 }) }) } }, NOW, { cap: 24 });
eq(big.skyline.oneTile, 10, '130 records -> one tile = 10'); eq(big.skyline.columns[0].tiles, 13, '130/10 tiles');
ok(big.skyline.oneTileText[0] === 'one tile = 10 records' && big.skyline.oneTileText[1].indexOf('10') > 0, 'one-tile text names N in both languages');
ok(big.skyline.columns.every((c) => c.tiles <= 24), 'no column above cap');

// step counter
eq(m.step.text, ['step 2/4', 'βήμα 2/4'], 'step text'); eq(m.step.m, 4, 'step m = rows');
eq(D.buildModel({ catalogue: cat, sheets }, NOW, { step: 99 }).step.n, 4, 'step clamps high'); eq(D.buildModel({ catalogue: cat, sheets }, NOW, { step: -3 }).step.n, 1, 'step clamps low');

// no coordinates anywhere in the model (vehicle sheets and the rest)
const dump = JSON.stringify(m);
ok(!/\d+\.\d{4,}/.test(dump) && !/"lat"|"lng"|trail|path/.test(dump), 'model holds no coordinates, trails or paths');
ok(!m.textRows.some((t) => /\d{2}\.\d{3,}/.test(t[0] + t[1])), 'textRows have no coordinates');
const veh = m.textRows.filter((t) => /vehicles|buses/i.test(t[0]));
ok(veh.length >= 2 && veh.every((t) => /records?|ago|Not available/.test(t[0])), 'vehicle textRows show counts and ages only');

// bilingual: every string in the model is a pair [en, el] with both filled, no guillemets
const bad = [];
(function walk(o, path) {
  if (Array.isArray(o) && o.length === 2 && typeof o[0] === 'string') { if (!o[0] || !o[1]) bad.push(path); if (/[\u00ab\u00bb]/.test(o[0] + o[1])) bad.push(path + ' guillemet'); return; }
  if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], path + '.' + k);
})({ title: m.title, note: m.note, step: m.step.text, hint: m.step.hint, aria: m.ariaLabel, rows: m.rows.map((r) => ({ t: r.title, s: r.statusLabel, a: r.ageText, src: r.source, l: r.licence, h: r.honesty })), sky: m.skyline.oneTileText, tr: m.textRows }, 'm');
eq(bad, [], 'all strings are filled pairs');
ok(m.textRows.every((t) => Array.isArray(t) && t.length === 2 && /[\u0370-\u03ff]/.test(t[1])), 'textRows pairs with Greek');
ok(/[\u0370-\u03ff]/.test(m.ariaLabel[1]) && !/[\u0370-\u03ff]/.test(m.ariaLabel[0]), 'aria label per language');
ok(m.textRows.some((t) => /not a score/.test(t[0])), 'never-a-score line');

console.log('roster: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
