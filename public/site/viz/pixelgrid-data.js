/*
  Pixel grid data (pure, tested by tests/viz/pixelgrid_test.js). Model builder for the pixelgrid widget, fed by the answer of
  /api/stack/buildings: up to four city-centre grids (1.8 km by 1.8 km), cells row by row from the SOUTH-WEST corner
  (first west to east, then north). share[i] = percent of the cell under a building footprint.

  Everything on screen is computed here: the summary per city (cells, cells with any building, mean share), the colour of a
  share on ONE fixed 0 to 100 percent scale for every city, the layout and the hover facts. Cities are listed in the order
  of the answer and are never ranked, sorted or compared.

  model = { id, title, available, demo, demoLabel, emptyReason|null, emptyLine, coverage, note, gridText, attribution,
            scale:{ min, max, title, ticks:[{v, label}], stops:[{v, color}] },
            cities:[{ key, name, available, reason|null, rows, cols, cellMetres, fetched, demo, share:[], summary:{cells, withBuilding, meanShare}, summaryText }],
            drawn: number of cities with pixels, textRows:[[en, el]], ariaLabel:[en, el], hint }
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.pixelgridData) and as CommonJS.
*/
(function (root) {
  'use strict';

  const SCALE_MIN = 0, SCALE_MAX = 100;
  // one hue (blue to cyan), dark to light, so a lighter pixel always means a larger share
  const RAMP = [[0, [8, 22, 40]], [50, [29, 111, 165]], [100, [186, 236, 255]]];
  const TICKS = [0, 25, 50, 75, 100];

  const T = {
    title: ['Built-up ground, pixel by pixel', 'Δομημένο έδαφος, τετραγωνάκι προς τετραγωνάκι'],
    emptyLine: ['No pixels are drawn without data.', 'Χωρίς δεδομένα δεν σχεδιάζεται κανένα τετραγωνάκι.'],
    noAnswer: ['The built-up ground answer has not arrived.', 'Η απάντηση για το δομημένο έδαφος δεν έχει φτάσει.'],
    noCities: ['No city centre has been fetched yet.', 'Κανένα κέντρο πόλης δεν έχει κατέβει ακόμη.'],
    badGrid: ['The grid of this city does not match its size, so it is not drawn.', 'Το πλέγμα αυτής της πόλης δεν ταιριάζει με το μέγεθός του, γι’ αυτό δεν σχεδιάζεται.'],
    demo: ['Demo data', 'Δοκιμαστικά δεδομένα'],
    legend: ['Share of the ground in a cell under a building. The same scale for every city.', 'Ποσοστό του εδάφους ενός κελιού κάτω από κτίριο. Η ίδια κλίμακα για κάθε πόλη.'],
    hint: ['Hover or touch a pixel for its city, row, column and share. North is up.', 'Περάστε ή αγγίξτε ένα τετραγωνάκι για πόλη, γραμμή, στήλη και ποσοστό. Το βορρά είναι πάνω.'],
    noHover: ['No pixel selected.', 'Κανένα τετραγωνάκι επιλεγμένο.'],
    notDrawn: ['not drawn', 'δεν σχεδιάζεται'],
  };

  const isPair = (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'string' && typeof p[1] === 'string';
  const pair = (p, fb) => (isPair(p) ? [p[0], p[1]] : fb);
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  // 1 decimal, comma in Greek, point in English. Digits are the only thing computed from the cells, here.
  const fmt = (v, el, dec) => { const s = Number(v).toFixed(dec == null ? 1 : dec); return el ? s.replace('.', ',') : s; };
  const both = (f) => [f(false), f(true)];

  /* ---------- colour on the fixed scale ---------- */
  function clampShare(v) { return Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)); }
  function rgbFor(share) {
    if (!num(share)) return null;
    const v = clampShare(share);
    for (let i = 1; i < RAMP.length; i++) {
      if (v <= RAMP[i][0]) {
        const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (v - a) / (b - a);
        return ca.map((c, k) => Math.round(c + (cb[k] - c) * t));
      }
    }
    return RAMP[RAMP.length - 1][1].slice();
  }
  const hex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');
  const colorFor = (share) => { const r = rgbFor(share); return r ? hex(r) : null; };
  const scale = () => ({ min: SCALE_MIN, max: SCALE_MAX, title: T.legend, ticks: TICKS.map((v) => ({ v, label: v + ' %' })), stops: RAMP.map(([v, c]) => ({ v, color: hex(c) })) });

  /* ---------- cells: index i counts from the south-west corner, west to east, then north ---------- */
  function cellOf(city, i) {
    const row = Math.floor(i / city.cols), col = i % city.cols;   // row 0 = southernmost, col 0 = westernmost
    return { i, row, col, rowFromSouth: row + 1, colFromWest: col + 1, share: city.share[i], sx: col, sy: city.rows - 1 - row };   // sx, sy: screen column and row (north up)
  }
  // indices in the reading order of the picture: top (north) row first, west to east
  function screenOrder(city) {
    const out = [];
    for (let sy = 0; sy < city.rows; sy++) for (let sx = 0; sx < city.cols; sx++) out.push((city.rows - 1 - sy) * city.cols + sx);
    return out;
  }
  function summarize(share) {
    let cells = 0, withBuilding = 0, sum = 0;
    for (const v of share) if (num(v)) { cells++; sum += v; if (v > 0) withBuilding++; }
    return { cells, withBuilding, meanShare: cells ? sum / cells : null };
  }
  const summaryText = (name, s) => s.cells
    ? both((el) => name[el ? 1 : 0] + ': ' + (el ? s.cells + ' κελιά, ' + s.withBuilding + ' με κάποιο κτίριο, μέσο ποσοστό ' + fmt(s.meanShare, true) + ' %'
      : s.cells + ' cells, ' + s.withBuilding + ' with any building, mean share ' + fmt(s.meanShare, false) + ' %'))
    : [name[0] + ': 0 cells', name[1] + ': 0 κελιά'];
  const cellLabel = (city, c) => both((el) => el
    ? city.name[1] + ', γραμμή ' + c.rowFromSouth + ' από νότο, στήλη ' + c.colFromWest + ' από δυτικά: ' + fmt(c.share, true, 0) + ' % του εδάφους κάτω από κτίριο'
    : city.name[0] + ', row ' + c.rowFromSouth + ' from the south, column ' + c.colFromWest + ' from the west: ' + fmt(c.share, false, 0) + ' % of the ground under a building');

  /* ---------- the model ---------- */
  function build(answer) {
    const a = answer && typeof answer === 'object' ? answer : null;
    const feats = a && Array.isArray(a.features) ? a.features : [];
    const cities = feats.map((f, n) => {
      const name = pair(f && f.name, [String((f && f.key) || 'City ' + (n + 1)), String((f && f.key) || 'Πόλη ' + (n + 1))]);
      const base = { key: String((f && f.key) || n), name, available: false, reason: null, rows: 0, cols: 0, cellMetres: null, fetched: (f && f.fetched) || null, demo: !!(f && f.demo), share: [], summary: { cells: 0, withBuilding: 0, meanShare: null }, summaryText: [name[0] + ': ' + T.notDrawn[0], name[1] + ': ' + T.notDrawn[1]] };
      if (!f || f.available === false) return { ...base, reason: pair(f && f.reason, T.noCities) };
      const rows = f.rows, cols = f.cols;
      const okGrid = Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0 && Array.isArray(f.share) && f.share.length === rows * cols && f.share.every(num);
      if (!okGrid) return { ...base, reason: T.badGrid };
      const summary = summarize(f.share);
      return { ...base, available: true, rows, cols, cellMetres: num(f.cellMetres) ? f.cellMetres : null, share: f.share.slice(), summary, summaryText: summaryText(name, summary) };
    });
    const drawn = cities.filter((c) => c.available).length;
    const available = !!(a && a.available !== false && drawn > 0);
    const demo = !!(a && a.demo) || cities.some((c) => c.available && c.demo);
    const emptyReason = available ? null : pair(a && a.reason, cities.map((c) => c.reason).find(Boolean) || (a ? T.noCities : T.noAnswer));
    const coverage = pair(a && a.coverage, null), note = pair(a && a.note, null), gridText = pair(a && a.grid, null);
    const attribution = a && a.attribution ? [String(a.attribution), String(a.attributionEl || a.attribution)] : null;

    const textRows = [];
    if (!available) { textRows.push(emptyReason, T.emptyLine); }
    else {
      for (const c of cities) textRows.push(c.available ? c.summaryText : [c.name[0] + ': ' + c.reason[0], c.name[1] + ': ' + c.reason[1]]);
      if (coverage) textRows.push(coverage);
      if (note) textRows.push(note);
      textRows.push(T.legend);
      if (demo) textRows.push(T.demo);
    }
    const ariaLabel = available
      ? both((el) => (el ? 'Εικονοψηφιδωτό δομημένου εδάφους για ' + drawn + (drawn === 1 ? ' κέντρο πόλης' : ' κέντρα πόλεων') + ', ίδια κλίμακα 0 έως 100 % για όλες. ' : 'Pixel map of built-up ground for ' + drawn + (drawn === 1 ? ' city centre' : ' city centres') + ', the same 0 to 100 % scale for all. ') + (demo ? T.demo[el ? 1 : 0] + '.' : ''))
      : [T.title[0] + '. ' + emptyReason[0] + ' ' + T.emptyLine[0], T.title[1] + '. ' + emptyReason[1] + ' ' + T.emptyLine[1]];
    return { id: 'pixelgrid', title: T.title, available, demo, demoLabel: T.demo, emptyReason, emptyLine: T.emptyLine, coverage, note, gridText, attribution, scale: scale(), cities, drawn, textRows, ariaLabel, hint: T.hint, noHover: T.noHover };
  }

  /* ---------- layout (pure, so the drawing code only follows it) ---------- */
  const PAD = 12, GAP = 14, TITLE_H = 18, LEGEND_H = 40, MIN_PX = 8;
  function layout(model, width) {
    const idx = model.cities.map((c, i) => (c.available ? i : -1)).filter((i) => i >= 0);
    const n = idx.length, W = Math.max(120, Math.floor(width));
    if (!n) return { width: W, height: 0, tiles: [], legend: null, px: 0 };
    const maxCols = Math.max(...idx.map((i) => model.cities[i].cols));
    const maxRows = Math.max(...idx.map((i) => model.cities[i].rows));
    const pxFor = (c) => Math.floor((W - 2 * PAD - (c - 1) * GAP) / c / maxCols);
    let best = 1;
    for (let c = 1; c <= n; c++) { if (Math.ceil(n / c) < Math.ceil(n / best) && pxFor(c) >= MIN_PX) best = c; }   // fewest rows that keep the pixels readable
    if (pxFor(best) < MIN_PX) { best = 1; for (let c = 2; c <= n; c++) if (pxFor(c) > pxFor(best)) best = c; }
    const px = Math.max(1, pxFor(best)), perRow = best, rowsN = Math.ceil(n / perRow), tileH = TITLE_H + px * maxRows;
    const rowW = perRow * px * maxCols + (perRow - 1) * GAP, x0 = Math.max(PAD, Math.floor((W - rowW) / 2));
    const tiles = idx.map((ci, k) => {
      const c = model.cities[ci], r = Math.floor(k / perRow), q = k % perRow;
      return { ci, x: x0 + q * (px * maxCols + GAP), y: PAD + r * (tileH + GAP) + TITLE_H, px, w: px * c.cols, h: px * c.rows, titleY: PAD + r * (tileH + GAP) + TITLE_H - 5 };
    });
    const ly = PAD + rowsN * tileH + (rowsN - 1) * GAP + GAP;
    const lw = Math.min(260, W - 2 * PAD);
    return { width: W, height: ly + LEGEND_H + PAD, tiles, legend: { x: PAD, y: ly, w: lw, h: 10 }, px, perRow };
  }
  // which cell of which city is under the point (x, y) in canvas pixels; null when none
  function hit(model, lay, x, y) {
    for (const t of lay.tiles) {
      if (x < t.x || y < t.y || x >= t.x + t.w || y >= t.y + t.h) continue;
      const city = model.cities[t.ci], sx = Math.floor((x - t.x) / t.px), sy = Math.floor((y - t.y) / t.px);
      const i = (city.rows - 1 - sy) * city.cols + sx, c = cellOf(city, i);
      return { city: city.key, cityName: city.name, ci: t.ci, row: c.rowFromSouth, col: c.colFromWest, share: c.share, i, sx, sy, label: cellLabel(city, c) };
    }
    return null;
  }

  const api = { build, colorFor, rgbFor, cellOf, screenOrder, summarize, layout, hit, cellLabel, fmt, SCALE_MIN, SCALE_MAX, RAMP, TICKS, T };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.pixelgridData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
