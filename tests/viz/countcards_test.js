'use strict';
/* Count cards data: one card per id in the order given, counts by length only, the dot matrix and its "1 dot = N",
   status with the answer's own reason, kind, age of the last fetch, and the hard rule that NO position field exists anywhere
   in the model. Small made-up input AND the saved real answers of /api/stack/<id> (skipped with a note when missing).
   Run: node tests/viz/countcards_test.js */
const fs = require('fs');
const D = require('../../public/site/viz/countcards-data.js');
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };
const pairs = (o, out = []) => { if (Array.isArray(o) && o.length === 2 && o.every((x) => typeof x === 'string')) out.push(o); else if (Array.isArray(o)) o.forEach((x) => pairs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => pairs(x, out)); return out; };
// walks the WHOLE model: any key with a position name, at any depth, is a failure
const BAD_KEYS = ['lat', 'lng', 'lon', 'latitude', 'longitude', 'position', 'coords'];
const badKeys = (o, path = 'model', out = []) => {
  if (Array.isArray(o)) o.forEach((x, i) => badKeys(x, path + '[' + i + ']', out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (BAD_KEYS.indexOf(k.toLowerCase()) >= 0) out.push(path + '.' + k); badKeys(o[k], path + '.' + k, out); }
  return out;
};
const numbers = (o, out = []) => { if (typeof o === 'number') out.push(o); else if (Array.isArray(o)) o.forEach((x) => numbers(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => numbers(x, out)); return out; };
const RANK_EN = /\b(rank|ranking|ranked|best|worst|most|least|top|leader|leading|biggest|smallest)\b/i, RANK_EL = /(κατάταξη|καλύτερ|χειρότερ|περισσότερ|λιγότερ|πρώτο φύλλο)/i;

// ---- made-up input. Coordinates use numbers that appear nowhere else, so a leak is easy to see.
const NOW = Date.parse('2026-05-01T12:00:00Z');
const cat = { sheets: [
  { id: 'pts', title: ['Points', 'Σημεία'], kind: 'snapshot', live: false },
  { id: 'own-vehicles', title: ['Our vehicles', 'Τα οχήματά μας'], kind: 'delayed', live: false },
  { id: 'bus-now', title: ['Buses now', 'Λεωφορεία τώρα'], kind: 'scheduled', live: false },
  { id: 'fires', title: ['Fires', 'Φωτιές'], kind: 'live', live: true },
  { id: 'net', title: ['Network', 'Δίκτυο'], kind: 'periodic', live: false },
  { id: 'silent', title: ['Silent', 'Σιωπηλό'], kind: 'live', live: true },
  { id: 'big', title: ['Big', 'Μεγάλο'], kind: 'census', live: false },
] };
const sheets = {
  pts: { id: 'pts', kind: 'snapshot', available: true, retrieved: '2026-04-20', refreshSeconds: null, features: [{ lat: 77.111, lng: 88.222 }, { lat: 77.333, lng: 88.444 }, { lat: 77.555, lng: 88.666 }] },
  'own-vehicles': { id: 'own-vehicles', kind: 'delayed', available: true, demo: true, updated: '2026-05-01T11:55:00Z', refreshSeconds: 300, counts: { vehicles: 99 },
    vehicles: [{ n: 1, trail: [[1777000000, 77.777, 88.888]], position: [77.9, 88.9], coords: { latitude: 77.91, longitude: 88.91 } }, { n: 2, trail: [] }] },
  'bus-now': { id: 'bus-now', kind: 'scheduled', available: true, updated: '2026-05-01T11:59:30Z', refreshSeconds: 45, counts: { running: 7, shown: 7 }, lines: [{ id: 'L1' }],
    trips: Array.from({ length: 7 }, (_, i) => ({ line: 'L1', path: [[0, 77.2 + i, 88.2], [60, 77.3, 88.3]], lat: 77.2, lon: 88.2 })) },
  fires: { id: 'fires', kind: 'live', live: true, available: true, updated: '2026-05-01T09:00:00Z', refreshSeconds: 1800, features: Array.from({ length: 130 }, () => ({ lat: 77.4, lng: 88.4 })) },
  net: { id: 'net', kind: 'periodic', available: true, updated: '2026-04-29T12:00:00Z', refreshSeconds: 3600, lines: [{ id: 'a', path: [77.5, 88.5] }, { id: 'b' }], stops: { count: 41, points: [[77.6, 88.6]] } },
  silent: { id: 'silent', kind: 'live', live: true, available: false, reason: ['Needs a key.', 'Χρειάζεται κλειδί.'], updated: null, features: [] },
  big: { id: 'big', kind: 'census', available: true, retrieved: '2026-01-02', features: new Array(12345).fill(0).map(() => ({ lat: 77.7, lng: 88.7 })) },
};
const ids = ['fires', 'pts', 'own-vehicles', 'bus-now', 'net', 'silent', 'big', 'ghost'];
const before = JSON.stringify(sheets);
const m = D.build({ catalogue: cat, sheets, ids }, NOW);
ok(JSON.stringify(sheets) === before, 'the answers are not changed');
ok(m.id === 'countcards' && m.available && m.empty === null && m.now === NOW, 'model head');
ok(m.cards.map((c) => c.id).join() === ids.join(), 'cards stay in the order given (never sorted)');
ok(D.build({ catalogue: cat, sheets, ids: ids.slice().reverse() }, NOW).cards.map((c) => c.id).join() === ids.slice().reverse().join(), 'another order in, the same order out');
const by = (id) => m.cards.find((c) => c.id === id);
// THE HARD RULE
ok(badKeys(m).length === 0, 'no key named lat, lng, lon, latitude, longitude, position or coords anywhere in the model' + (badKeys(m).length ? ': ' + badKeys(m).slice(0, 3).join(' ') : ''));
ok(badKeys({ a: [{ b: { Lat: 1 } }] }).length === 1 && badKeys({ position: 0 }).length === 1 && badKeys({ x: { coords: [] } }).length === 1, 'the walker itself finds such keys at any depth');
ok(!numbers(m).some((v) => v > 77 && v < 89 && !Number.isInteger(v)) && !strings(m).some((s) => /\b(77|88)\.\d/.test(s)), 'no coordinate value of the input appears anywhere in the model');
ok(!/"(trail|path|vehicles|trips|features|points)":/.test(JSON.stringify(m)), 'no record, trail or path is copied into the model');
// counts
ok(by('pts').count === 3 && by('pts').noun[0] === 'records' && by('pts').countText[0] === '3', 'features are counted by length');
ok(by('own-vehicles').count === 2 && by('own-vehicles').noun[0] === 'vehicles' && by('own-vehicles').noun[1] === 'οχήματα' && by('own-vehicles').isVehicle, 'vehicles: the length of the list, counts only');
ok(by('bus-now').count === 7 && by('bus-now').noun[0] === 'buses running by the timetable' && by('bus-now').isVehicle && by('bus-now').extra === null, 'bus-now: trips counted by length');
ok(by('net').count === 2 && by('net').noun[0] === 'bus lines' && by('net').extra.count === 41 && by('net').extra.text[0] === '41 stops' && by('net').extra.text[1] === '41 στάσεις', 'bus network: lines, and the published stop count');
ok(by('big').count === 12345 && by('big').countText[0] === '12,345' && by('big').countText[1] === '12.345', 'thousands separator per language');
ok(D.recordCount({ id: 'own-vehicles', counts: { vehicles: 8 } }).count === 8 && D.recordCount({ id: 'bus-now', counts: { running: 4 } }).count === 4 && D.recordCount({ counts: { records: 9 } }).count === 9 && D.recordCount(null).count === 0 && D.recordCount({}).count === 0, 'published counts are used when the list is not there');
// dot matrix
ok(by('pts').grid.per === 1 && by('pts').grid.dots === 3 && by('pts').grid.label[0] === '1 dot = 1 record' && by('pts').grid.label[1] === '1 κουκκίδα = 1 εγγραφή' && !by('pts').grid.capped, 'small sheet: one dot per record');
ok(by('fires').grid.per === 5 && by('fires').grid.dots === 26 && by('fires').grid.cols === 12 && by('fires').grid.rows === 3 && by('fires').grid.label[0] === '1 dot = 5 records; a started dot counts as one', '130 records: 1 dot = 5, 26 dots');
ok(by('big').grid.per === 500 && by('big').grid.dots === 25 && by('big').grid.label[0].startsWith('1 dot = 500 records') && by('big').grid.label[1].startsWith('1 κουκκίδα = 500 εγγραφές'), '12,345 records: 1 dot = 500');
ok(by('own-vehicles').grid.label[0] === '1 dot = 1 vehicle', 'the dot names what is counted');
let capOk = true;
for (const n of [0, 1, 59, 60, 61, 120, 121, 300, 301, 600, 601, 5999, 6000, 6001, 1234567]) { const g = D.dotsFor(n); if (g.dots > D.DOT_CAP || g.dots !== Math.ceil(n / g.per) || g.dots * g.per < n || (n && (g.dots - 1) * g.per >= n) || g.rows * g.cols < g.dots) capOk = false; }
ok(capOk, 'dots never exceed the cap and always cover the count');
ok(D.dotsFor(60).per === 1 && D.dotsFor(61).per === 2 && D.dotsFor(121).per === 5 && D.dotsFor(301).per === 10 && D.dotsFor(0).dots === 0, 'per is the smallest of 1, 2, 5, 10, ...');
// status
ok(by('pts').status === 'available' && by('pts').available && by('pts').reason === null && by('pts').statusLabel[1] === 'διαθέσιμο', 'available');
ok(by('silent').status === 'unavailable' && !by('silent').available && by('silent').reason[0] === 'Needs a key.' && by('silent').reason[1] === 'Χρειάζεται κλειδί.' && by('silent').count === null && by('silent').grid === null && by('silent').countText[0] === '–', 'not available: the reason of the answer, count unknown (null, not 0), no dots');
ok(by('ghost').status === 'noanswer' && !by('ghost').available && by('ghost').count === null && by('ghost').title[0] === 'ghost' && by('ghost').reason[0].includes('no answer') && by('ghost').kindLabel[0] === 'kind not stated', 'no answer and not in the catalogue: said so');
ok(D.build({ catalogue: cat, sheets: { pts: { available: false } }, ids: ['pts'] }, NOW).cards[0].reason[0] === 'The sheet gives no reason.', 'unavailable without a reason');
// kind and age
ok(by('fires').kindClass === 'live' && by('bus-now').kindClass === 'scheduled' && by('own-vehicles').kindClass === 'scheduled' && by('net').kindClass === 'scheduled' && by('pts').kindClass === 'fixed' && by('big').kindClass === 'fixed', 'kind class: live, scheduled, fixed');
ok(by('own-vehicles').kindLabel[0] === 'delayed' && by('own-vehicles').kindLabel[1] === 'με καθυστέρηση' && by('fires').kindLabel[1] === 'ζωντανά' && by('pts').kindLabel[0] === 'fixed', 'kind words');
ok(by('fires').pulse === true && by('silent').pulse === false && m.cards.filter((c) => c.pulse).map((c) => c.id).join() === 'fires', 'only a live and available card may pulse');
ok(by('fires').age.seconds === 10800 && by('fires').age.text[0] === 'fetched 3 h ago' && by('fires').age.text[1] === 'λήψη πριν από 3 ώρες', 'age of the last fetch (hours)');
ok(by('bus-now').age.seconds === 30 && by('bus-now').age.text[0] === 'fetched 30 s ago' && by('own-vehicles').age.text[0] === 'fetched 5 min ago' && by('net').age.text[0] === 'fetched 2 days ago' && by('net').age.text[1] === 'λήψη πριν από 2 ημέρες', 'age of the last fetch (seconds, minutes, days)');
ok(by('pts').age === null && by('pts').retrieved[0] === 'retrieved 2026-04-20' && by('pts').fetchedAt === null && by('big').age === null, 'fixed sheets have no age, only the retrieval date of the answer');
ok(by('silent').age === null && by('ghost').age === null, 'no age for a sheet that is not available');
ok(D.build({ catalogue: cat, sheets: { fires: { kind: 'live', available: true, features: [] } }, ids: ['fires'] }, NOW).cards[0].age.text[0] === 'no fetch time given', 'live sheet without a stamp: said so');
ok(D.build({ catalogue: cat, sheets, ids }, NOW + 60000).cards[0].age.seconds === 10860 && D.build({ catalogue: cat, sheets, ids }).cards[0].age.seconds === null, 'age follows the now that is passed in');
ok(by('own-vehicles').demo && by('own-vehicles').demoLabel[0] === 'Demo data' && by('pts').demoLabel === null, 'demo data is labelled');
// sentences, pick, text
ok(by('own-vehicles').label[0] === 'Our vehicles: available, 2 vehicles in the last answer, delayed, fetched 5 min ago. Demo data. Counts and ages only, no positions.', 'card sentence (en)');
ok(by('silent').label[1] === 'Σιωπηλό: μη διαθέσιμο, ζωντανά. Χρειάζεται κλειδί.', 'card sentence (el), not available');
const p = D.pick(by('fires'));
ok(Object.keys(p).sort().join() === 'available,count,id,status,title' && p.id === 'fires' && p.count === 130 && p.status[0] === 'available' && p.available === true && D.pick(null) === null, 'pick record: id, title, count, status, available');
ok(m.textRows.length === ids.length + 2 && m.textRows[0][0] === '8 sheets, 6 available, 2 not available.' && m.textRows[1] === m.cards[0].label && m.textRows[m.textRows.length - 1] === m.note, 'textRows: head, one row per card in order, note');
ok(m.ariaLabel[0].includes('8 sheets') && m.ariaLabel[0].includes('Counts and ages only') && /[Α-Ωα-ω]/.test(m.ariaLabel[1]), 'aria label');
ok(m.note[0].includes('never positions') && m.note[1].includes('ποτέ θέσεις') && m.note[0].includes('do not compare'), 'note: no positions, dots do not compare sheets');
ok(pairs(m).length > 50 && pairs(m).every((q) => q[0].trim() && q[1].trim()), 'every pair has English and Greek');
ok(!strings(m).some((s) => /[«»]/.test(s)) && !strings(m).some((s) => RANK_EN.test(s)) && !strings(m).some((s) => RANK_EL.test(s)), 'no guillemets, no ranking words');
// ids
ok(D.build({ catalogue: cat, sheets, ids: ['pts', 'pts', '', null, 'big'] }, NOW).cards.map((c) => c.id).join() === 'pts,big', 'duplicate and empty ids are dropped');
ok(D.build({ catalogue: null, sheets, ids: ['pts'] }, NOW).cards[0].title[0] === 'pts' && D.build({ catalogue: null, sheets, ids: ['pts'] }, NOW).cards[0].kindClass === 'fixed', 'without a catalogue the answer alone is used');
for (const bad of [null, undefined, {}, { ids: [] }, { catalogue: cat, sheets }, { ids: 'pts' }]) {
  const e = D.build(bad, NOW); ok(!e.available && e.cards.length === 0 && e.empty[0] && e.empty[1] && e.textRows.length === 1 && e.ariaLabel === e.empty, 'honest empty state: ' + String(JSON.stringify(bad)).slice(0, 40));
}

// ---- the saved real answers of /api/stack/<id> (COUNTCARDS_REAL overrides the folder)
const DIR = process.env.COUNTCARDS_REAL || '/tmp/claude-0/-home-claude/e4f1d26e-6188-56da-a984-013d108508fc/scratchpad';
const RIDS = ['ev-charging', 'crossings', 'flood-reaches', 'bus-network', 'bus-now', 'own-vehicles', 'fire-hotspots', 'burnt-areas'];
const real = {}, missing = [];
for (const id of RIDS) { const f = DIR + '/' + id + '.json'; if (fs.existsSync(f)) real[id] = JSON.parse(fs.readFileSync(f, 'utf8')); else missing.push(id); }
if (missing.length === RIDS.length) console.log('note: no saved sheet answers found in ' + DIR + ', real-data checks skipped');
else {
  if (missing.length) console.log('note: saved answers missing for ' + missing.join(', ') + ' (those cards are checked as "no answer")');
  const stackFile = DIR + '/cc/stack.json', rcat = fs.existsSync(stackFile) ? JSON.parse(fs.readFileSync(stackFile, 'utf8')) : null;
  if (!rcat) console.log('note: saved /api/stack catalogue not found (' + stackFile + '), titles come from the answers');
  const t = Date.parse('2026-11-19T11:06:24.000Z');
  const r = D.build({ catalogue: rcat, sheets: real, ids: RIDS }, t), rb = (id) => r.cards.find((c) => c.id === id);
  ok(r.cards.map((c) => c.id).join() === RIDS.join(), 'real: eight cards in the order given');
  ok(badKeys(r).length === 0, 'real: no position key anywhere in the model' + (badKeys(r).length ? ': ' + badKeys(r).slice(0, 3).join(' ') : ''));
  // every latitude / longitude of Cyprus has decimals between 32 and 36: none may be in the model
  ok(!numbers(r).some((v) => !Number.isInteger(v) && v > 32 && v < 36.5), 'real: no number that could be a coordinate in the model');
  ok(!/"(trail|path|vehicles|trips|features|points)":/.test(JSON.stringify(r)), 'real: no vehicle list, trail or path in the model');
  for (const id of RIDS) {
    const a = real[id], c = rb(id);
    if (!a) { ok(c.status === 'noanswer' && c.count === null, 'real: ' + id + ' without a saved answer is "no answer"'); continue; }
    const want = a.available === false ? null : (Array.isArray(a.features) ? a.features.length : Array.isArray(a.vehicles) ? a.vehicles.length : Array.isArray(a.trips) ? a.trips.length : Array.isArray(a.lines) ? a.lines.length : 0);
    ok(c.count === want && c.available === (a.available !== false) && c.title[0] === a.title[0] && c.title[1] === a.title[1] && c.kind === a.kind, 'real: ' + id + ' count ' + want + ', status and title as in the answer');
    if (a.available === false) ok(c.reason[0] === a.reason[0] && c.reason[1] === a.reason[1] && c.grid === null && c.age === null, 'real: ' + id + ' is not available and gives the answer\'s own reason');
    else ok(c.grid.dots <= D.DOT_CAP && c.grid.dots === Math.ceil(c.count / c.grid.per) && c.grid.label[0].startsWith('1 dot = ' + c.grid.per + ' '), 'real: ' + id + ' dots cover the count (1 dot = ' + c.grid.per + ')');
  }
  if (real['own-vehicles']) { const c = rb('own-vehicles'); ok(c.isVehicle && c.kindClass === 'scheduled' && c.kindLabel[0] === 'delayed' && c.age && c.age.seconds === Math.round((t - Date.parse(real['own-vehicles'].updated)) / 1000) && c.demo === (real['own-vehicles'].demo === true), 'real: own-vehicles shows a count and the age of the fetch, nothing else'); }
  if (real['bus-now']) ok(rb('bus-now').isVehicle && rb('bus-now').kindClass === 'scheduled', 'real: bus-now is a scheduled vehicle sheet');
  if (real['ev-charging']) ok(rb('ev-charging').kindClass === 'fixed' && rb('ev-charging').age === null && rb('ev-charging').retrieved[0] === 'retrieved ' + real['ev-charging'].retrieved && rb('ev-charging').pulse === false, 'real: a fixed sheet has no age and never pulses');
  if (real['fire-hotspots']) ok(rb('fire-hotspots').kindClass === 'live' && rb('fire-hotspots').pulse === (real['fire-hotspots'].available !== false), 'real: the live sheet pulses only when it is available');
  ok(pairs(r).every((q) => q[0].trim() && q[1].trim()) && !strings(r).some((s) => /[«»]/.test(s)), 'real: every pair has both languages, no guillemets');
  ok(r.textRows.length === RIDS.length + 2, 'real: one text row per card');
}
console.log('countcards: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
