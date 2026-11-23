// lidar widget: the model builder. Run: node tests/viz/lidar_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/lidar-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test): rows are hour, lower, upper, grid, classified, class 8, class 10
const made = { date: '2024-07-02', retrieved: '2026-11-21', bands: [[0, 500], [500, 1500]], rows: [
  [0, 0, 500, 200, 200, 50, 100],
  [1, 0, 500, 200, 0, 0, 0],        // nothing classified: unknown
  [2, 0, 500, 200, 100, 20, 0],     // partly classified, a real zero for class 10
  [3, 0, 500, 200, null, null, null],
  [0, 500, 1500, 400, 400, 0, 400],
  [4, 0, 500, 0, 0, 0, 0],          // no grid at all
] };
const m = D.build(made);
const at = (mm, h, b) => mm.cells.find((c) => c.hour === h && c.band === b);
ok(m.available && m.live === false && m.measure === 'only' && m.shareKey === 'shareOnly' && m.timeZone === 'UTC', 'starts on class 8 (aerosol only), UTC, not live');
ok(m.hours.length === 24 && m.bands.length === 2 && m.cells.length === 48, 'a full 24 hour grid for every band');
ok(at(m, 0, 0).shareOnly === 25 && at(m, 0, 0).shareInsects === 50, 'shares are class cells / grid cells, the two classes kept apart');
ok(!('shareBoth' in at(m, 0, 0)) && !/75/.test(at(m, 0, 0).label[0]), 'the two classes are never added');
ok(/aerosol only \(class 8\) 50 of 200 grid cells \(25\.0%\); aerosol with insects \(class 10\) 100 of 200 grid cells \(50\.0%\); 200 of 200 grid cells classified\./.test(at(m, 0, 0).label[0]) && /25,0%/.test(at(m, 0, 0).label[1]), 'both counts travel with each share; decimal comma in Greek');
const u = at(m, 1, 0);
ok(u.unknown && u.shareOnly === null && u.shareInsects === null && u.only === null && /unknown, not zero/.test(u.label[0]), 'nothing classified: unknown (null), never 0');
const p = at(m, 2, 0);
ok(!p.unknown && p.incomplete && p.shareOnly === 10 && p.shareInsects === 0 && /only 100 of 200 grid cells were classified/.test(p.label[0]), 'partly classified is flagged; a real zero stays a zero');
ok(at(m, 3, 0).unknown && at(m, 3, 0).hasRow && at(m, 4, 0).unknown && at(m, 4, 0).shareOnly === null, 'null counts and an empty grid are unknown');
ok(at(m, 5, 0).unknown && !at(m, 5, 0).hasRow && /no row for this hour and band/.test(at(m, 5, 0).label[0]) && at(m, 1, 1).unknown, 'an hour and band missing from the table is unknown');
ok(at(m, 0, 1).shareOnly === 0 && at(m, 0, 1).shareInsects === 100, 'shares from 0 to 100');
ok(m.counts.cells === 48 && m.counts.known === 3 && m.counts.unknown === 45 && m.counts.incomplete === 1 && /3 of 48/.test(m.counts.text[0]), 'counts of known, unknown and partly classified cells');
const s = D.select(m, 'insects');
ok(s.measure === 'insects' && s.shareKey === 'shareInsects' && s.cells === m.cells && /class 10/.test(s.ariaLabel[0]) && /class 8/.test(m.ariaLabel[0]), 'switching the measure changes the colour key only');
ok(D.select(m, 'both') === m && D.select(m, 'only') === m, 'unknown or same measure keeps the current view');
ok(m.choices.map((c) => c.id).join() === 'only,insects' && m.measures[0].code === 8 && m.measures[1].code === 10 && m.scale.max === 100, 'two switchable measures, one fixed scale');
ok(m.textRows.every(pairOk) && s.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.notes.every(pairOk) && m.cells.every((c) => pairOk(c.label) && pairOk(c.whereText)) && Object.values(m.strings).every(pairOk) && m.bands.every((b) => pairOk(b.name)) && m.choices.every((c) => pairOk(c.name)), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(/cannot tell dust from ship exhaust/.test(m.ariaLabel[0]) && /2 July 2024/.test(m.dateText[0]) && /2 Ιουλίου 2024/.test(m.dateText[1]) && /UTC/.test(at(m, 0, 0).label[0]), 'limit, date and UTC are in the text');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && D.select(e, 'insects') === e && !D.build({ rows: [] }).available, 'honest empty state');
ok(D.pct(1, 0) === null && D.pct(null, 5) === null && D.pct(0, 5) === 0, 'share helper');

// the real file, with the pack's own check values (START_HERE_CLAUDE_DAY_3: 24 hours x 4 altitude bands, one dated day)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/lidar.json')); } catch (err) { console.log('note: public/site/data/lidar.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  ok(real.rows.length === 96 && r.hours.length === 24 && r.bands.length === 4 && r.cells.length === 96, 'pack check: 24 hours x 4 altitude bands = 96 cells');
  ok(real.date === '2024-07-02' && r.dateText[0] === '2 July 2024' && real.timeZone === 'UTC' && /mean sea level/.test(real.heightReference), 'the day is 2 July 2024, UTC, heights above mean sea level');
  ok(r.bands.map((b) => b.lower + '-' + b.upper).join() === '0-500,500-1500,1500-3000,3000-6000', 'four bands in the source order');
  ok(r.counts.known === 96 && r.counts.unknown === 0 && r.counts.incomplete === 0 && r.cells.every((c) => c.hasRow), 'every cell of this day has classified data');
  const a = at(r, 7, 2);
  ok(a.grid === 5760 && a.classified === 5760 && a.only === 725 && a.insects === 4239 && a.shareOnly.toFixed(1) === '12.6' && a.shareInsects.toFixed(1) === '73.6', '07:00 UTC, 1500 to 3000 m: 725 and 4239 of 5760 cells');
  const b = at(r, 0, 0), c = at(r, 23, 3);
  ok(b.grid === 1320 && b.only === 802 && b.insects === 518 && c.grid === 11640 && c.only === 0 && c.insects === 0 && c.shareOnly === 0 && !c.unknown, 'first and last rows as published; a classified zero is a zero, not unknown');
  ok(r.cells.every((x) => x.only + x.insects <= x.classified && x.classified <= x.grid && x.shareOnly >= 0 && x.shareOnly <= 100 && x.shareInsects <= 100), 'counts are consistent with their denominators');
  ok(r.textRows.every(pairOk) && r.textRows.length <= 300 && D.select(r, 'insects').textRows.every(pairOk), 'real text rows are pairs');
  ok(real.sources.length === 1 && real.sources[0].licence === 'CC BY 4.0' && /hdl\.handle\.net\/21\.12132\/1\.f3758ef1ace943d9/.test(real.sources[0].pid) && real.retrieved === '2026-11-21' && real.notes.every(pairOk) && !real.termsUnclear && real.classes.aerosolOnly.code === 8 && real.classes.aerosolWithInsects.code === 10, 'source, licence, PID, dates, classes and caveats are in the file');
  ok(/cannot tell dust from ship exhaust/.test(real.notes[0][0]), 'the pack limit is the first note');
}
console.log('lidar: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
