// gridmap widget: the model builder, for both data files. Run: node tests/viz/gridmap_test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '../../public/site/viz/gridmap-data.js'));
let pass = 0, fail = 0; const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL: ' + name); } };
const pairOk = (p) => Array.isArray(p) && p.length === 2 && p.every((s) => typeof s === 'string' && s.length > 0 && !/[«»—]/.test(s));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// made-up input (Demo data, only for the test): 2 rows x 3 columns, plain values, with a null, a zero and a flagged cell
const made = { id: 'demo', kind: 'estimate', unit: ['tonnes', 'τόνοι'], title: ['Demo', 'Δοκιμή'], quantity: ['thing', 'πράγμα'], still: ['Demo, not live', 'Δοκιμή, όχι ζωντανά'], retrieved: '2026-01-01', sourceShort: 'Demo source',
  sources: [{ name: 'Demo', licence: 'none', url: 'https://example.org', credit: 'Demo credit.', what: ['x', 'χ'] }],
  grid: { rows: 2, cols: 3, lats: [35.05, 34.95], lons: [33.05, 33.15, 33.25], cellSizeDeg: 0.1 },
  scales: { g: { type: 'log', min: 0.01 } }, compare: ['Same cell, other layer', 'Ίδιο κελί, άλλο επίπεδο'], sumLabel: ['Sum', 'Άθροισμα'],
  national: { what: ['Country estimate', 'Εκτίμηση χώρας'], years: [2021, 2022], totalGg: [null, 0.5] },
  notes: [['A note.', 'Μια σημείωση.']],
  layers: [
    { id: 'a', group: 'g', period: '2022', name: ['Layer A', 'Επίπεδο Α'], periodName: ['2022', '2022'], values: [0, 0.01, 1, null, 30, 0.000001], flags: [[4, 'gap-filled']] },
    { id: 'b', group: 'g', period: '2022', name: ['Layer B', 'Επίπεδο Β'], periodName: ['2022', '2022'], values: [null, 0, 0, 5, 5, 5] },
    { id: 'c', group: 'h', period: '2021', name: ['Layer C', 'Επίπεδο Γ'], periodName: ['2021', '2021'], values: [1, 2, 3, 4, 5, 6] },
    { id: 'bad', group: 'g', name: ['Bad', 'Κακό'], values: [1, 2] },
  ] };
const m = D.build(made);
ok(m.available && m.layer === 'a' && m.choices.map((c) => c.id).join() === 'a,b,c', 'layers in the file order; a layer of the wrong length is left out');
ok(m.counts.cells === 6 && m.counts.valid === 5 && m.counts.zero === 1 && m.counts.nodata === 1 && m.counts.flagged === 1, 'counts: values, published zeros and no data kept apart');
ok(m.values[3] === null && m.t[3] === null && m.values[0] === 0 && m.t[0] === -1, 'no data stays null, zero is its own state');
ok(m.scale.max === 50 && m.scale.min === 0.01 && m.scales.g === D.select(m, 'b').scale && m.scales.h.max === 10, 'one fixed scale per group (top of both layers rounded up to 1, 2 or 5), shared by its layers');
ok(m.t[1] === 0 && m.t[5] === 0 && m.t[2] > 0.5 && m.t[2] < 0.6 && m.t[4] > m.t[2] && m.t[4] < 1, 'log positions; a value under the bottom of the scale sits at the bottom, not at zero');
ok(m.scale.ticks.map((t) => t.v).join() === '0.01,0.1,1,10,50' && m.scale.ticks.map((t) => t.label[0]).join() === '0.01,0.1,1,10,50' && m.scale.ticks[0].t === 0 && m.scale.ticks[4].t === 1, 'key ticks at each power of ten and the top');
ok(near(m.grid.bbox.west, 33, 1e-9) && near(m.grid.bbox.east, 33.3, 1e-9) && near(m.grid.bbox.north, 35.1, 1e-9) && near(m.grid.bbox.south, 34.9, 1e-9) && m.grid.gx.length === 4 && m.grid.gy.length === 3, 'box from the cell centres and the cell size');
const c4 = D.cell(m, 1, 1);
ok(c4.value === 30 && c4.state === 'value' && c4.flag === 'gap-filled' && c4.lat === 34.95 && c4.lon === 33.15 && c4.layer === 'a', 'one cell: centre, value, layer, flag');
ok(/Layer A, cell centre 34\.95° N, 33\.15° E: model estimate 30\.0 tonnes \(marked by the source: gap-filled\)\. Same cell, other layer: Layer B model estimate 5\.00\. Source: Demo source\./.test(c4.label[0]), 'label: estimate said as estimate, unit, flag, same cell on the other layer of the group, source');
ok(/Επίπεδο Α, κέντρο κελιού 34\.95° Β, 33\.15° Α: εκτίμηση μοντέλου 30\.0 τόνοι/.test(c4.label[1]) && pairOk(c4.label) && c4.lines.every(pairOk), 'Greek label');
const c3 = D.cell(m, 1, 0), c0 = D.cell(m, 0, 0), c5 = D.cell(m, 1, 2);
ok(c3.value === null && c3.state === 'nodata' && /no data in the source\./.test(c3.label[0]) && !/ 0 /.test(c3.lines[1][0]) && !/tonnes/.test(c3.lines[1][0]), 'a cell with no data says so and shows no number');
ok(c0.value === 0 && c0.state === 'zero' && /model estimate 0 tonnes/.test(c0.label[0]) && c0.others[0].state === 'nodata' && /Layer B no data in the source/.test(c0.label[0]), 'a zero reads as zero; the other layer has no data there and says so');
ok(/under 0\.0001 tonnes/.test(c5.label[0]) && c5.state === 'value', 'a tiny value is not printed as 0');
ok(D.cell(m, 2, 0) === null && D.cell(m, 0, 3) === null, 'outside the grid: nothing');
ok(JSON.stringify(D.locate(m, 0.5, 0.75)) === '{"row":1,"col":1}' && JSON.stringify(D.locate(m, 0, 0)) === '{"row":0,"col":0}' && JSON.stringify(D.locate(m, 1, 1)) === '{"row":1,"col":2}' && D.locate(m, 1.01, 0.5) === null, 'point to cell');
ok(near(m.sum, 31.010001, 1e-12) && /Sum, Layer A, 2022: 31\.01 tonnes\./.test(m.sumText[0]), 'sum over valid cells');
ok(m.national.totalTonnes[1] === 500 && m.national.totalTonnes[0] === null && m.textRows.some((r) => /Country estimate, 2022: 0\.5 Gg per year \(500 tonnes\)/.test(r[0])), 'country series: Gg to tonnes, missing year stays null');
ok(!D.select(m, 'c').textRows.some((r) => /Country estimate/.test(r[0])), 'a year with no country figure prints no figure');
ok(m.textRows.every(pairOk) && pairOk(m.ariaLabel) && Object.values(m.strings).every(pairOk) && m.grid.graticule.lats.concat(m.grid.graticule.lons).every((a) => pairOk(a.label)), 'every string is an [en, el] pair, no guillemets, no em dashes');
ok(D.select(m, 'nope') === m && D.select(m, 'b').layer === 'b' && D.select(m, 'b').counts.zero === 2, 'select: unknown layer keeps the view');
const e = D.build(null); ok(!e.available && pairOk(e.empty) && e.choices.length === 0 && !D.build({ layers: [{ id: 'x', values: [1] }], grid: { rows: 1, cols: 2, lats: [1], lons: [1, 2] } }).available, 'honest empty state');
ok(!/"rank|worst|"top"/.test(JSON.stringify(m)), 'no ranking field');
// packing
ok(JSON.stringify(D.unpack([1.5, -2, 3], [2, 1, 2, 1], 6)) === '[1.5,0,null,0,3,null]' && D.unpack([1], [2, 1], 3) === null && D.unpack([1, 2], [2, 2], 3) === null, 'unpack: runs of zeros and the no-data mask; a wrong length is refused');
const sq = D.scaleOf({ type: 'sqrt' }, 90); ok(sq.max === 100 && D.position(sq, 25) === 0.5 && D.position(sq, 0) === -1 && D.position(sq, null) === null, 'square-root scale');
ok(D.niceUp(1385.7) === 2000 && D.niceUp(65.1) === 100 && D.niceUp(1) === 1 && D.niceUp(0) === 1, 'scale top rounded up to 1, 2 or 5');
const irregular = D.edges([35.19, 35.18, 35.16]); ok(near(irregular[0], 35.195, 1e-9) && near(irregular[1], 35.185, 1e-9) && near(irregular[2], 35.17, 1e-9) && near(irregular[3], 35.15, 1e-9), 'edges half way between uneven centres');

// the real files, with the data pack's own check values
const load = (f) => { try { return require(path.join(__dirname, '../../public/site/data/' + f)); } catch (err) { console.log('note: public/site/data/' + f + ' not found, its checks are skipped'); return null; } };
const ship = load('shipdensity.json');
if (ship) {
  const s = D.build(ship);
  ok(s.available && s.choices.map((c) => c.id).join() === 'passenger-2024-07,passenger-2024-12,cargo-2024-07,cargo-2024-12,tanker-2024-07,tanker-2024-12', 'ships: six layers, class 08 passenger, 09 cargo, 10 tanker, each July then December 2024');
  // marine_grid_checks.csv: clipped_cells 16000, valid_cells 11948, valid_zero_cells per layer
  const zeros = { 'passenger-2024-07': 10975, 'passenger-2024-12': 11143, 'cargo-2024-07': 2388, 'cargo-2024-12': 2322, 'tanker-2024-07': 7148, 'tanker-2024-12': 4936 };
  ok(Object.keys(zeros).every((id) => { const c = s.layers[id].counts; return c.cells === 16000 && c.valid === 11948 && c.nodata === 4052 && c.zero === zeros[id]; }), 'ships: 16000 cells, 11948 with data, published zeros per layer as in marine_grid_checks.csv');
  ok(ship.layers.every((L) => L.check.valid === 11948 && L.check.validZero === zeros[L.id] && L.check.cells === 16000), 'ships: the check values travel in the file');
  ok(s.grid.rows === 80 && s.grid.cols === 200 && s.grid.lats[0] === 35.192427 && s.grid.lats[79] === 34.204631 && s.grid.lons[0] === 32.011001 && s.grid.lons[199] === 34.492536, 'ships: 80 by 200 centres, corners as in the table');
  ok(near(s.grid.bbox.west, 32.0, 0.01) && near(s.grid.bbox.east, 34.5, 0.01) && near(s.grid.bbox.south, 34.2, 0.01) && near(s.grid.bbox.north, 35.2, 0.01), 'ships: box 32 to 34.5 E, 34.2 to 35.2 N');
  // table maxima rounded to 3 significant figures: 776.05, 1048.71, 796.38, 1280.08, 403.05, 1385.72
  ok(Object.keys(zeros).map((id) => s.layers[id].max).join() === '776,1050,796,1280,403,1390', 'ships: layer maxima (3 significant figures)');
  ok(['passenger', 'cargo', 'tanker'].every((g) => s.scales[g].max === 2000 && s.scales[g].min === 0.01 && s.scales[g].type === 'log') && D.select(s, 'cargo-2024-12').scale === D.select(s, 'cargo-2024-07').scale, 'ships: July and December of a class share one fixed log scale');
  const cj = D.select(s, 'cargo-2024-07'), cc = D.cell(cj, 40, 3);   // ship0907_bounded.csv row 8004: 34.693751, 32.048411, 0.3733328580856323
  ok(cc.lat === 34.693751 && cc.lon === 32.048411 && cc.value === 0.373 && cc.others.length === 1 && cc.others[0].layer === 'cargo-2024-12' && /December 2024/.test(cc.others[0].name[0]), 'ships: one cell of cargo July, and the same cell in December of the same class');
  ok(/Cargo ships, July 2024, cell centre 34\.694° N, 32\.048° E: 0\.373 vessel-hours per km² per month\. Same cell, same ship class, the other month: December 2024 /.test(cc.label[0]) && /EMODnet/.test(cc.label[0]) && !/estimate/.test(cc.label[0]), 'ships: label with unit, month and source; observed, not called an estimate');
  const first = D.cell(s, 0, 0); ok(first.layer === 'passenger-2024-07' && first.value === 0 && first.state === 'zero', 'ships: first row of ship0807 is a published zero, kept as zero');
  const nd = cj.values.indexOf(null); ok(nd > 0 && D.cell(cj, Math.floor(nd / 200), nd % 200).state === 'nodata' && D.cell(D.select(s, 'tanker-2024-12'), Math.floor(nd / 200), nd % 200).state === 'nodata', 'ships: no-data cells are the same in every layer and never read as zero');
  ok(cj.values.every((v) => v === null || (v >= 0 && Number(v.toPrecision(3)) === v)), 'ships: values are the published ones at 3 significant figures');
  ok(/3 significant figures/.test(ship.rounding) && s.textRows.some((r) => /rounded each value to 3 significant figures/.test(r[0])), 'ships: the rounding is said in the file and in the text');
  ok(s.textRows.every(pairOk) && pairOk(s.ariaLabel) && s.choices.every((c) => pairOk(c.name)), 'ships: text pairs');
  ok(s.textRows.some((r) => /cannot show a busy hour/.test(r[0])) && s.textRows.some((r) => /activity, not pollution/.test(r[0])) && s.textRows.some((r) => /can change far from the coast/.test(r[0])), 'ships: the three limits from the pack are in the text');
  ok(ship.sources[0].licence === 'CC BY 4.0' && /Cogea Srl/.test(ship.sources[0].credit) && /EMODnet Portal/.test(ship.sources[0].credit) && s.textRows.some((r) => /CC BY 4\.0/.test(r[0])) && ship.retrieved === '2026-11-20' && ship.registerId === 75, 'ships: licence, credit and date');
  ok(/11948 with a value \(2388 of them a published zero\), 4052 with no data/.test(cj.textRows[1][0]), 'ships: counts sentence');
}
const bc = load('blackcarbon.json');
if (bc) {
  const b = D.build(bc);
  ok(b.available && b.estimate && b.choices.map((c) => c.id).join() === 'TRO,TNR_Ship,TNR_Aviation_CRS,TNR_Aviation_LTO', 'black carbon: four sector layers, EDGAR codes');
  // emission_downloads.csv: valid_bbox_cells 600, missing 0, total_tonnes_in_valid_cells per sector
  const tot = { TRO: 109.51985235454049, TNR_Aviation_LTO: 2.1842429343945557, TNR_Aviation_CRS: 2.820601434319542, TNR_Ship: 331.7469929293711 };
  ok(Object.keys(tot).every((id) => { const L = b.layers[id]; return L.counts.cells === 600 && L.counts.valid === 600 && L.counts.nodata === 0 && L.counts.flagged === 0 && near(L.sum, tot[id], 1e-9); }), 'black carbon: 600 valid cells and the rectangle sums of emission_downloads.csv');
  ok(bc.layers.every((L) => L.check.totalTonnesInValidCells === tot[L.id] && L.values.length === 600 && L.flags.length === 0), 'black carbon: check values in the file; no cell is flagged in the pack table');
  ok(b.grid.rows === 20 && b.grid.cols === 30 && JSON.stringify(b.grid.bbox) === '{"west":32,"south":34,"east":35,"north":36}', 'black carbon: 20 by 30 cells of 0.1 degree, 32 to 35 E, 34 to 36 N');
  ok(Object.keys(b.scales).length === 1 && b.scales.all.max === 100 && b.scales.all.min === 0.001 && b.choices.every((c) => D.select(b, c.id).scale === b.scales.all), 'black carbon: ONE colour scale for the four sectors');
  ok(b.layers.TRO.max === 9.861479759216309 && near(b.layers.TNR_Ship.max, 65.10569763183594, 1e-12) && b.layers.TRO.counts.zero === 477 && b.layers.TNR_Aviation_LTO.counts.positive === 8, 'black carbon: published precision kept, true zeros kept');
  const c = D.cell(b, 0, 0);
  ok(c.lat === 35.95 && c.lon === 32.05 && c.value === 0 && c.others.length === 3 && /Road transport, cell centre 35\.95° N, 32\.05° E: model estimate 0 tonnes of black carbon per cell per year\./.test(c.label[0]) && /EDGAR v8\.1/.test(c.label[0]), 'black carbon: a cell reads as a model estimate with unit and source, other sectors alongside');
  ok(/εκτίμηση μοντέλου/.test(c.label[1]) && /MODEL ESTIMATES/.test(b.still[0]) && /ΕΚΤΙΜΗΣΕΙΣ ΜΟΝΤΕΛΟΥ/.test(b.still[1]), 'black carbon: called model estimates in both languages');
  ok(/109\.52 tonnes/.test(b.sumText[0]) && /not a Cyprus total/.test(b.sumText[0]), 'black carbon: rectangle sum is said not to be a Cyprus total');
  ok(bc.national.years.length === 53 && bc.national.years[52] === 2022 && bc.national.totalGg[52] === 0.34918755623819 && bc.national.totalGg[0] === 0.2627606782512 && b.textRows.some((r) => /Cyprus, all sectors together, 2022: 0\.349 Gg per year \(349 tonnes\)\. This is a separate estimate/.test(r[0])), 'black carbon: EDGAR country total for Cyprus 2022, 0.34918755623819 Gg, kept apart from the grid');
  ok(b.textRows.every(pairOk) && pairOk(b.ariaLabel) && b.choices.every((x) => pairOk(x.name)), 'black carbon: text pairs');
  ok(b.textRows.some((r) => /cannot be pinned on one road, one ship, one flight, one station or one school/.test(r[0])) && b.textRows.some((r) => /not a concentration/.test(r[0])) && b.textRows.some((r) => /climbing and descending/.test(r[0])), 'black carbon: limits from methods.txt are in the text');
  ok(/EDGAR v8\.1 AP, release August 2024/.test(bc.sources[0].credit) && /dataset_ap81#conditions/.test(bc.sources[0].licenceUrl) && pairOk(bc.sources[0].licence) && pairOk(D.build(bc).sources[0].licence) && bc.retrieved === '2026-11-23' && bc.registerId === 106, 'black carbon: credit, conditions link and date');
}
if (ship && bc) ok(D.build(ship).grid.cols !== D.build(bc).grid.cols && D.build(ship).widget === 'gridmap' && D.build(bc).widget === 'gridmap', 'one builder for both grid sizes');
console.log('gridmap: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
