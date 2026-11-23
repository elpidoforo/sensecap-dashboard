// Data Journey: the model. Run: node tests/viz/journey_test.js
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
const D = require(path.join(ROOT, 'public/site/viz/journey-data.js'));
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL: ' + n); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const NOW = Date.parse('2026-11-23T18:00:00Z');
// made-up input (Demo data, only for the test)
const cat = { sheets: [
  { id: 'met-stations', title: ['Met stations', 'Σταθμοί'], band: 'AIR', kind: 'live', live: true },
  { id: 'crossings', title: ['Crossings', 'Διαβάσεις'], band: 'CITY', kind: 'inventory' },
  { id: 'drought', title: ['Drought', 'Ξηρασία'], band: 'GROUND', kind: 'snapshot' },
  { id: 'fire-hotspots', title: ['Fire', 'Φωτιά'], band: 'SPACE', kind: 'live', live: true },
  { id: 'made-up-sheet', title: ['Other', 'Άλλο'], band: 'WATER', kind: 'snapshot' } ] };
const sheets = {
  'met-stations': { available: true, source: ['Met Office, automatic stations', 'Μετεωρολογική, αυτόματοι σταθμοί'], updated: '2026-11-23T17:50:00Z', features: [{}, {}, {}] },
  crossings: { available: true, source: 'Public Works (PWD)', features: new Array(7).fill({}) },
  drought: { available: true, source: ['Met Office: archive', 'Μετεωρολογική: αρχείο'], features: [{}, {}] },
  'fire-hotspots': { available: false, reason: ['test mode', 'απενεργοποιημένο'], source: 'NASA FIRMS' } };
const m = D.build({ catalogue: cat, sheets }, NOW);
ok(m.available && m.sheets.map((s) => s.id).join() === cat.sheets.map((s) => s.id).join(), 'sheets stay in catalogue order');
ok(m.sheets[0].count === 3 && m.sheets[1].count === 7 && m.sheets[3].count === null && m.sheets[4].count === null, 'record counts from the answers; no answer or no data gives null, never 0');
ok(m.sheets[0].available && /3 records, 10 min ago/.test(m.sheets[0].status[0]) && m.sheets[1].age === null && /fixed by design/.test(m.sheets[1].kind[0]), 'age only for sheets that update; fixed sheets are never called old or fresh');
ok(!m.sheets[3].available && m.sheets[3].reason[0] === 'test mode' && !m.sheets[4].available && pairOk(m.sheets[4].reason), 'an unavailable sheet keeps its own reason; a missing answer is not answering');
ok(m.publishers.length === 3 && m.publishers[0].name[0] === 'Met Office' && m.publishers[0].sheets.join() === '0,2' && m.publishers[0].cited.length === 2, 'two wordings of one publisher are joined, and both citations are kept');
ok(m.totals.sheets === 5 && m.totals.answered === 3 && m.totals.records === 12 && m.totals.publishers === 3, 'totals count only sheets that answered');
const pg = (id) => m.pages.find((p) => p.id === id);
ok(pg('stack').sheets.length === 5 && pg('wall').sheets.length === 5, 'pages that show every sheet get all of them');
ok(pg('layers').sheets.join() === '1,2' && pg('live').sheets.join() === '0,3' && pg('vortex').sheets.join() === '1', 'listed pages get only the sheets that exist in the catalogue');
ok(pg('flow').sheets.join() === '0,1,3', 'Data Flow shows its record sets plus every sheet that updates');
ok(m.totals.links === m.pages.reduce((n, p) => n + p.sheets.length, 0) && m.sheets[4].pages.length === 2 && m.sheets[0].pages.length === 4, 'links add up; each sheet knows its pages');
ok(pg('live').answered === 1 && pg('stack').answered === 3, 'answered count per page');
ok(m.pages.map((p) => p.id).join() === D.PAGES.map((p) => p.id).join(), 'pages stay in menu order, never sorted');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && m.sheets.every((s) => pairOk(s.title) && pairOk(s.kind) && pairOk(s.status)) && m.pages.every((p) => pairOk(p.title)) && m.stages.every(pairOk), 'every string is an [en, el] pair, no guillemets or em dashes');
ok(/as wired in the site/.test(m.textRows[0][0]) && /not a measurement/.test(m.textRows[m.textRows.length - 1][0]), 'the page map is said to be written down, not measured');
const e = D.build({}, NOW); ok(!e.available && pairOk(e.empty) && e.sheets.length === 0 && e.totals.answered === 0, 'honest empty state');
const walk = (o, bad) => { if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (/^(rank|score|lat|lng|lon|position|coords)$/i.test(k)) bad.push(k); walk(o[k], bad); } return bad; };
ok(walk(m, []).length === 0, 'no rank, score or position field anywhere in the model');
// the page map against the site's own code: every listed sheet id must appear in that page's source file
const ALL = ['population', 'age', 'buildings', 'bus-network', 'bus-now', 'own-vehicles', 'earthquakes', 'ev-charging', 'crossings', 'flood-reaches', 'fire-hotspots', 'burnt-areas', 'air-stations', 'met-stations', 'airports', 'permits', 'air-day', 'drought', 'bathing-water', 'seabed-profiles', 'aerosol-sites'];
D.PAGES.forEach((p) => { let src = ''; try { src = fs.readFileSync(path.join(ROOT, p.file), 'utf8'); } catch (err) { ok(false, 'source file exists: ' + p.file); return; }
  if (p.uses === 'all') ok(/\/api\/stack\/' \+|\/api\/stack\//.test(src), p.id + ': reads the stack sheets generically');
  else { let where = src; if (p.via) { where = fs.readFileSync(path.join(ROOT, p.via), 'utf8'); ok(/VD\.SOURCE/.test(src), p.id + ' takes its record sets from the shared list in ' + p.via); }
    p.uses.forEach((id) => ok(new RegExp("['\"/]" + id + "['\"]").test(where), p.id + ' really uses ' + id)); }
  if (p.plus === 'updating') ok(/isRoster/.test(src), p.id + ': also lists the sheets that update'); });
ok(D.PAGES.every((p) => p.uses === 'all' || p.uses.every((id) => ALL.indexOf(id) >= 0)), 'every listed id is a real sheet id');
console.log('journey: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
