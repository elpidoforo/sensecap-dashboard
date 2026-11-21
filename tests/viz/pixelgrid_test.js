'use strict';
/* Run: node tests/viz/pixelgrid_test.js   (no network, well under 5 s) */
const path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'public/site/viz/pixelgrid-data.js'));
const F = require('./pixelgrid_fixture.js');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const isPair = (p) => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0] && p[1];

(async () => {
  const m = D.build(F.answer());

  // ---- orientation: index 0 is the south-west cell and is drawn bottom-left; north is up
  const a = m.cities[0];
  eq(D.cellOf(a, 0), { i: 0, row: 0, col: 0, rowFromSouth: 1, colFromWest: 1, share: 100, sx: 0, sy: 5 }, 'cell 0 is SW, drawn bottom-left');
  eq([D.cellOf(a, 5).sx, D.cellOf(a, 5).sy], [5, 5], 'cell 5 is the south-east cell, bottom-right');
  eq([D.cellOf(a, 30).sx, D.cellOf(a, 30).sy], [0, 0], 'cell 30 is the north-west cell, top-left');
  eq([D.cellOf(a, 35).sx, D.cellOf(a, 35).sy, D.cellOf(a, 35).share], [5, 0, 55], 'cell 35 is the north-east cell, top-right');
  eq(D.cellOf(a, 7).colFromWest, 2, 'second row starts again in the west');
  const order = D.screenOrder(a);
  eq(order.slice(0, 7), [30, 31, 32, 33, 34, 35, 24], 'reading order starts at the north-west corner, north row first');
  eq(order[35], 5, 'reading order ends at the south-east corner');
  eq(new Set(order).size, 36, 'every cell once in the reading order');
  const lay = D.layout(m, 900);
  const t0 = lay.tiles[0], h = D.hit(m, lay, t0.x + 1, t0.y + t0.h - 1);   // bottom-left pixel
  eq([h.row, h.col, h.share], [1, 1, 100], 'hit at the bottom-left of the tile reads row 1, column 1 from the south-west');
  const h2 = D.hit(m, lay, t0.x + t0.w - 1, t0.y + 1);   // top-right
  eq([h2.row, h2.col, h2.share], [6, 6, 55], 'hit at the top-right reads the north-east cell');
  ok(D.hit(m, lay, 0, 0) === null, 'no hit outside a tile');

  // ---- share to colour on the fixed scale
  eq(D.colorFor(0), '#081628', '0 % is the dark end');
  eq(D.colorFor(100), '#baecff', '100 % is the light end');
  eq(D.colorFor(-20), D.colorFor(0), 'below 0 clamps to the 0 colour');
  eq(D.colorFor(250), D.colorFor(100), 'above 100 clamps to the 100 colour');
  ok(D.colorFor(NaN) === null && D.colorFor(null) === null && D.colorFor('5') === null, 'not a number has no colour');
  const lum = (s) => { const [r, g, b] = D.rgbFor(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  let mono = true; for (let s = 1; s <= 100; s++) if (lum(s) <= lum(s - 1)) mono = false;
  ok(mono, 'a larger share is always lighter');
  eq(D.colorFor(m.cities[0].share[0]), D.colorFor(m.cities[1].share[0] + 100), 'the same share has the same colour in every city (one scale)');
  eq(m.scale.min, 0, 'scale starts at 0'); eq(m.scale.max, 100, 'scale ends at 100');
  eq(m.scale.ticks.map((t) => t.v), [0, 25, 50, 75, 100], 'legend ticks');
  ok(m.scale.ticks.every((t) => /%$/.test(t.label)), 'legend labels are percents');
  eq(m.scale.stops[0].color, D.colorFor(0), 'legend starts at the 0 colour');
  eq(m.scale.stops[m.scale.stops.length - 1].color, D.colorFor(100), 'legend ends at the 100 colour');
  const clone = JSON.stringify(D.build(F.answer()).scale);
  const alone = F.answer(); alone.features.pop();
  eq(JSON.stringify(D.build(alone).scale), clone, 'the scale does not depend on which cities are shown');

  // ---- summary, computed from the cells
  const sumA = F.A.flat().reduce((x, y) => x + y, 0), sumB = F.Bg.flat().reduce((x, y) => x + y, 0);
  eq(m.cities[0].summary, { cells: 36, withBuilding: 12, meanShare: sumA / 36 }, 'summary of town A');
  eq(m.cities[1].summary, { cells: 36, withBuilding: 30, meanShare: sumB / 36 }, 'summary of town B');
  ok(/36 cells, 12 with any building, mean share 16\.9 %/.test(m.cities[0].summaryText[0]), 'English summary text: ' + m.cities[0].summaryText[0]);
  ok(/36 κελιά, 12 με κάποιο κτίριο, μέσο ποσοστό 16,9 %/.test(m.cities[0].summaryText[1]), 'Greek summary text with decimal comma: ' + m.cities[0].summaryText[1]);
  eq(D.summarize([]), { cells: 0, withBuilding: 0, meanShare: null }, 'summary of nothing');

  // ---- multiple cities: answer order, no ranking, side by side when there is room
  eq(m.cities.map((c) => c.key), ['demoA', 'demoB'], 'cities keep the order of the answer');
  const rev = F.answer(); rev.features.reverse();
  eq(D.build(rev).cities.map((c) => c.key), ['demoB', 'demoA'], 'order is not sorted by any value');
  ok(m.drawn === 2 && m.available, 'two cities drawn');
  eq(lay.tiles.length, 2, 'two tiles'); ok(lay.tiles[0].y === lay.tiles[1].y && lay.tiles[1].x > lay.tiles[0].x + lay.tiles[0].w, 'wide screen: side by side on one row');
  ok(lay.tiles[0].px === lay.tiles[1].px, 'same pixel size in every city');
  const narrow = D.layout(m, 200);
  ok(narrow.tiles.every((t) => t.x >= 0 && t.x + t.w <= 200), 'narrow layout stays inside the width');
  ok(lay.legend && lay.legend.y >= lay.tiles[0].y + lay.tiles[0].h, 'legend is below the pictures');
  const four = F.answer(); four.features.push({ ...four.features[0], key: 'c' }, { ...four.features[1], key: 'd' });
  const big = (f) => ({ ...f, cols: 18, rows: 18, share: new Array(324).fill(7) });   // real size: 18 x 18 cells
  four.features = four.features.map(big);
  const m4 = D.build(four), phone = D.layout(m4, 360), wide = D.layout(m4, 900);
  ok(new Set(wide.tiles.map((t) => t.y)).size === 1, 'four cities side by side on 900 px');
  ok(new Set(phone.tiles.map((t) => t.y)).size === 2 && phone.tiles.every((t) => t.x + t.w <= 360), 'four cities in two rows on 360 px');
  const text = JSON.stringify(m.textRows).toLowerCase();
  ok(!/(most|least|highest|lowest|rank|denser|more built)/.test(text), 'no ranking words in the text rows');
  eq(m.textRows.filter((r) => /cells/.test(r[0])).length, 2, 'one summary row per city');
  ok(m.textRows.some((r) => r === m.coverage || r[0] === F.answer().coverage[0]), 'the answer coverage is shown');
  ok(m.textRows.some((r) => r[0] === F.answer().note[0]), 'the answer note is shown');
  ok(m.demo && m.textRows.some((r) => r[0] === 'Demo data'), 'demo answers are labelled Demo data');

  // ---- empty states
  const e = D.build(F.empty());
  ok(!e.available && e.drawn === 0 && e.cities.length === 0, 'empty answer: nothing drawn');
  eq(e.emptyReason, F.empty().reason, "empty state shows the answer's own reason");
  ok(/no pixels are drawn without data/i.test(e.emptyLine[0]), 'honest line in English');
  ok(e.textRows.length === 2 && e.textRows[1] === e.emptyLine, 'text rows are only the reason and the honest line');
  eq(D.layout(e, 600).tiles, [], 'empty layout has no tiles');
  ok(!('share' in e) && e.cities.every((c) => c.share.length === 0), 'no pixel data in the empty model');
  for (const bad of [null, undefined, {}, { available: false }, { features: 'x' }]) { const b = D.build(bad); ok(!b.available && isPair(b.emptyReason) && b.drawn === 0, 'empty model for ' + JSON.stringify(bad)); }
  const noneAvail = F.answer(); noneAvail.available = false; noneAvail.reason = ['It is being fetched.', 'Κατεβαίνει.'];
  noneAvail.features = noneAvail.features.map((f) => ({ key: f.key, name: f.name, available: false, reason: ['Not yet.', 'Όχι ακόμη.'] }));
  const na = D.build(noneAvail);
  ok(!na.available && na.emptyReason[0] === 'It is being fetched.', 'answer-level reason wins');
  const partial = F.answer(); partial.features[1] = { key: 'demoB', name: ['Demo town B', 'Δοκιμαστική πόλη Β'], available: false, reason: ['Not yet.', 'Όχι ακόμη.'] };
  const pm = D.build(partial);
  ok(pm.available && pm.drawn === 1 && D.layout(pm, 900).tiles.length === 1, 'one city missing: the other is drawn alone');
  ok(pm.textRows.some((r) => /Demo town B: Not yet\./.test(r[0]) && /Όχι ακόμη/.test(r[1])), 'the missing city says why, in both languages');
  const broken = F.answer(); broken.features[0].share = broken.features[0].share.slice(0, 20);
  const bm = D.build(broken);
  ok(!bm.cities[0].available && bm.cities[0].share.length === 0 && bm.cities[1].available, 'a grid whose length does not match is not drawn');
  const nan = F.answer(); nan.features[0].share[3] = null;
  ok(!D.build(nan).cities[0].available, 'a grid with a missing value is not drawn (nothing is guessed)');

  // ---- bilingual: every visible string is a non-empty pair, no guillemets
  const strings = [];
  const walk = (v, key) => { if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') strings.push(v); else if (v && typeof v === 'object' && key !== 'share') for (const k of Object.keys(v)) walk(v[k], k); };
  walk(m); walk(e);
  ok(strings.length > 10, 'found the pairs in the models');
  ok(strings.every(isPair), 'every string is a non-empty [en, el] pair');
  ok(strings.every((p) => !/[«»]/.test(p[0] + p[1])), 'no guillemets');
  ok(strings.every((p) => p[0] !== p[1] || /^[A-Za-z0-9 ]+$/.test(p[0]) === false || p[0].length < 4), 'Greek is not a copy of English');
  ok(/[Α-Ωα-ω]/.test(m.ariaLabel[1]) && /[A-Za-z]/.test(m.ariaLabel[0]) && !/[Α-Ωα-ω]/.test(m.ariaLabel[0]), 'aria label is a pair in two languages');
  ok(/Pixel map/.test(m.ariaLabel[0]) && /0 to 100/.test(m.ariaLabel[0]), 'aria label says what the picture is');
  const lab = D.hit(m, lay, t0.x + 1, t0.y + t0.h - 1).label;
  ok(/Demo town A, row 1 from the south, column 1 from the west: 100 %/.test(lab[0]), 'hover label English: ' + lab[0]);
  ok(/Δοκιμαστική πόλη Α, γραμμή 1 από νότο, στήλη 1 από δυτικά: 100 %/.test(lab[1]), 'hover label Greek: ' + lab[1]);
  for (const k of ['emptyLine', 'noAnswer', 'noCities', 'badGrid', 'demo', 'legend', 'hint', 'noHover', 'title']) ok(isPair(D.T[k]), 'T.' + k + ' is a pair');

  // ---- the real answers of the server (demo mode, no network): available:false without data, a real-shaped grid with the mock
  const { createStackData } = require(path.join(ROOT, 'stackdata'));
  const cbm = require(path.join(ROOT, 'city-buildings'));
  const noData = await createStackData({ root: ROOT, mock: true }).build('buildings');
  ok(noData.available === false && !noData.features.some((f) => f.available), 'real answer without data is unavailable');
  const rn = D.build(noData);
  ok(!rn.available && rn.emptyReason[0] === noData.reason[0] && rn.emptyReason[1] === noData.reason[1], "real unavailable answer: the answer's own reason is shown");
  ok(rn.emptyLine[0].length > 0, 'and the honest line');
  const cb = cbm.createCityBuildings({ dataDir: require('fs').mkdtempSync(path.join(os.tmpdir(), 'pg-')), mock: true });
  const real = await createStackData({ root: ROOT, mock: true, cityBuildings: cb }).build('buildings');
  const rm = D.build(real);
  ok(real.available && rm.available && rm.drawn === real.features.filter((f) => f.available).length && rm.drawn >= 1, 'real-shaped answer is drawn: ' + rm.drawn + ' cities');
  ok(rm.demo, 'the mock answer is labelled demo');
  for (const c of rm.cities.filter((c) => c.available)) {
    ok(c.share.length === c.rows * c.cols && c.rows === c.cols, c.key + ': square grid with rows*cols cells');
    ok(c.share.every((v) => v >= 0 && v <= 100) && c.summary.cells === c.share.length, c.key + ': shares are percents');
    ok(c.summary.meanShare >= 0 && c.summary.meanShare <= 100, c.key + ': mean share is a percent');
  }
  ok(rm.coverage[0] === real.coverage[0] && rm.note[0] === real.note[0], "the answer's coverage and note are carried over");
  ok(D.layout(rm, 900).tiles.length === rm.drawn, 'layout has one tile per drawn city');

  console.log('pixelgrid: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL: ' + e.stack); console.log('pixelgrid: ' + passed + ' passed, ' + (failed + 1) + ' failed'); process.exit(1); });
