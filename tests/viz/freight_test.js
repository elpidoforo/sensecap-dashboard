// freight widget: the model builder. Run: node tests/viz/freight_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/freight-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));

// made-up input (Demo data, only for the test): nulls, zeros, a flag, a port with nothing
const made = { retrieved: '2026-01-01', period: { first: '2020-Q1', last: '2020-Q4' }, unitShort: ['thousand tonnes', 'χιλ. τόνοι'], quarters: ['2020-Q1', '2020-Q2', '2020-Q3', '2020-Q4'],
  ports: [{ code: 'ZZ', name: ['Zeta', 'Ζήτα'] }, { code: 'AA', name: ['Alpha', 'Άλφα'] }],
  cargo: [{ code: 'TOTAL', name: ['Total', 'Σύνολο'] }, { code: 'LBK', name: ['Liquid', 'Υγρά'] }, { code: 'DBK', name: ['Dry', 'Ξηρά'] }, { code: 'UNK', name: ['Unknown', 'Άγνωστο'] }],
  directions: [{ code: 'TOTAL', name: ['Total', 'Σύνολο'] }, { code: 'IN', name: ['Inwards', 'Εισερχόμενα'] }],
  values: { ZZ: { TOTAL: { TOTAL: [100, null, 31, 0], LBK: [60, null, 30, 0], DBK: [41, null, 0, null], UNK: [null, null, null, null] }, IN: { TOTAL: [400, null, null, null], LBK: [null, null, null, null] } }, AA: {} },
  status: { ZZ: { TOTAL: { TOTAL: { '2020-Q2': 'c' }, LBK: { '2020-Q3': 'p' } } } },
  notes: [['Freight measures mass.', 'Το φορτίο μετρά μάζα.']] };
const m = D.build(made);
ok(m.available && m.port === 'ZZ' && m.direction === 'TOTAL' && m.bars.length === 4, 'opens on the first port and first direction of the source');
ok(m.choices.map((c) => c.id).join() === 'ZZ,AA' && m.directions.map((d) => d.id).join() === 'TOTAL,IN', 'ports and directions keep the source order (not sorted)');
ok(m.groups.map((g) => g.code).join() === 'LBK,DBK,UNK' && m.bars[0].parts.length === 3 && m.bars[0].parts.every((p) => p.code !== 'TOTAL'), 'TOTAL is not one of the stacked parts');
ok(m.bars[0].total === 100 && m.bars[0].stackSum === 101 && m.bars[0].parts[1].y0 === 60 && m.bars[0].parts[1].y1 === 101, 'stack positions come from the parts only; the published total stays as published (100, not 101, not 201)');
ok(m.bars[1].published === false && m.bars[1].total === null && m.bars[1].stackSum === null && m.bars[1].tTotal === null && /no value published \(publisher flag c\)/.test(m.bars[1].label[0]), 'empty quarter stays null and carries the publisher flag');
ok(m.bars[2].parts[1].v === 0 && m.bars[2].parts[1].y1 === 30 && m.bars[2].flags.LBK === 'p' && /Liquid 30 \[p\]; Dry 0\./.test(m.bars[2].label[0]), 'a published zero stays zero; a flag travels with its value');
ok(m.bars[3].published && m.bars[3].total === 0 && m.bars[3].parts[0].v === 0 && m.bars[3].parts[1].v === null && /No value published for: Dry; Unknown/.test(m.bars[3].label[0]), 'zero total is published, the missing group is named as not published');
ok(m.latest === '2020-Q4' && m.counts.published === 3 && m.counts.empty === 1 && m.shown.join() === 'LBK,DBK', 'latest published quarter, coverage count, groups that have a value');
ok(m.anyFlag && m.notes.some((n) => /status flag/.test(n[0])), 'flags present: the flag note is added');
const inn = D.select(m, { direction: 'IN' });
ok(inn.port === 'ZZ' && inn.direction === 'IN' && inn.latest === '2020-Q1' && inn.bars[0].total === 400 && inn.bars[0].stackSum === null && inn.shown.length === 0, 'a total with no parts: line only, nothing stacked');
ok(m.scaleMax === 500 && inn.scaleMax === 500 && inn.bars[0].tTotal === 0.8, 'one scale per port, shared by its directions');
const aa = D.select(m, { port: 'AA' });
ok(aa.port === 'AA' && aa.isEmpty && aa.latest === null && aa.bars.every((b) => !b.published && b.total === null) && /No value is published/.test(aa.latestText[0]), 'a port with nothing published: honest empty view, all null');
ok(D.select(m, { port: 'XX' }) === m && D.select(m, { direction: 'OUT' }) === m && D.select(m, 'ZZ', 'IN').direction === 'IN', 'unknown choice keeps the view; positional form works');
ok(D.niceCeil(1061) === 2000 && D.niceCeil(120) === 200 && D.niceCeil(100) === 100 && D.niceCeil(0) === 1 && D.niceCeil(2400) === 2500, 'round scale tops');
ok(D.quarterText('2026-Q1')[0] === '2026-Q1 (January to March 2026)' && pairOk(D.quarterText('2017-Q4')), 'quarter named with its months');
ok([m, inn, aa].every((v) => v.textRows.every(pairOk) && pairOk(v.ariaLabel) && v.bars.every((b) => pairOk(b.label) && pairOk(b.name))) && Object.keys(m.strings).every((k) => pairOk(m.strings[k])), 'every string is an [en, el] pair, no guillemets, no em dashes');
ok(m.textRows.some((r) => /Freight measures mass/.test(r[0])) && !/rank|busiest|largest|top /i.test(JSON.stringify(m.textRows)), 'the mass note is in the text rows; no ranking words');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && !D.build({ quarters: [] }).available, 'honest empty state');

// the real file, with the data pack's own check values (validation.csv, README.txt, source_register.csv row 65)
let real = null; try { real = require(path.join(__dirname, '../../public/site/data/freight.json')); } catch (err) { console.log('note: public/site/data/freight.json not found, real-data checks skipped'); }
if (real) {
  const r = D.build(real);
  let n = 0, cells = 0; for (const p of Object.keys(real.values)) for (const d of Object.keys(real.values[p])) for (const c of Object.keys(real.values[p][d])) for (const v of real.values[p][d][c]) { cells++; if (v !== null) n++; }
  ok(n === 2079 && cells === 5400, '2,079 published numeric values in 5,400 cells (validation.csv)');
  ok(real.quarters.length === 45 && real.quarters[0] === '2015-Q1' && real.quarters[44] === '2026-Q1', '45 quarters, 2015-Q1 to 2026-Q1');
  ok(r.choices.map((c) => c.name[0]).join() === 'Dekeleia,Larnaka,Lemesos,Moni,Zygi' && r.directions.map((d) => d.name[0]).join() === 'Total,Inwards,Outwards', 'five ports and three directions in the source order');
  const z = D.select(r, { port: 'CY_0CYZYY', direction: 'TOTAL' }), zl = z.bars[44];
  ok(zl.q === '2026-Q1' && zl.total === 1061, 'Zygi 2026-Q1 total freight: 1061 thousand tonnes (validation.csv)');
  ok(zl.parts.find((p) => p.code === 'LBK').v === 851 && zl.parts.find((p) => p.code === 'DBK').v === 159 && zl.parts.find((p) => p.code === 'OTH').v === 51 && zl.parts.find((p) => p.code === 'LCNT').v === null && zl.stackSum === 1061, 'Zygi 2026-Q1 parts: 851 liquid bulk, 159 dry bulk, 51 other; containers not published');
  ok(D.select(r, { port: 'CY_0CYZYY', direction: 'IN' }).bars[44].total === 914 && D.select(r, { port: 'CY_0CYZYY', direction: 'OUT' }).bars[44].total === 147, 'Zygi 2026-Q1 inwards 914, outwards 147');
  ok(['CY_0CYDHK', 'CY_0CYLCA', 'CY_0CYLMS', 'CY_0CYZYY'].every((p) => r.ports[p].latest === '2026-Q1') && r.ports.CY_0CYMOI.latest === '2017-Q1', 'latest quarter 2026-Q1 for four ports; Moni last reported in 2017-Q1');
  const moni = D.select(r, { port: 'CY_0CYMOI', direction: 'TOTAL' }); ok(moni.bars.slice(9).every((b) => !b.published && b.total === null) && moni.bars[8].total !== null, 'Moni after 2017-Q1: empty quarters, null, never 0');
  ok(D.select(r, { port: 'CY_0CYDHK', direction: 'OUT' }).isEmpty && r.bars[0].q === '2015-Q1' && r.bars[0].total === 120, 'Dekeleia outwards has nothing published; Dekeleia 2015-Q1 total is 120');
  ok(r.anyFlag === false && Object.keys(real.status).length === 0, 'this extract has no publisher status flags');
  let worst = 0; for (const p of Object.keys(r.ports)) for (const d of Object.keys(r.ports[p].directions)) for (const b of r.ports[p].directions[d].bars) if (b.total != null && b.stackSum != null) worst = Math.max(worst, Math.abs(b.total - b.stackSum));
  ok(worst <= 2, 'parts never differ from the published total by more than 2 thousand tonnes (rounding), so the total is not double counted');
  ok(Object.keys(r.ports).every((p) => Object.keys(r.ports[p].directions).every((d) => { const v = r.ports[p].directions[d]; return v.textRows.every(pairOk) && v.bars.every((b) => pairOk(b.label)) && v.textRows.length + r.notes.length <= 300; })) && r.notes.every(pairOk), 'real text rows and labels are pairs and fit the page list');
  ok(real.sources.length === 1 && /copyright-notice/.test(real.sources[0].licenceUrl) && /Eurostat, mar_go_qm_cy, retrieved 19 November 2026/.test(real.sources[0].credit) && real.retrieved === '2026-11-19', 'source, reuse terms, credit and retrieval date are in the file');
  ok(r.notes.some((n) => /Freight measures mass/.test(n[0]) && /Port calls measure movements/.test(n[0])), 'the pack limit travels with the model');
}
console.log('freight: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
