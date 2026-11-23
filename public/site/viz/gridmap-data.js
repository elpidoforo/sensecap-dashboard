/*
  gridmap-data.js: the model for the "gridmap" widget (a regular lat/lon grid of cells around Cyprus, one layer at a time).
  Pure: no DOM, no clock, no network. One builder for two data files:
    public/site/data/shipdensity.json  vessel density, EMODnet Human Activities / Cogea Srl (CC BY 4.0): 3 ship classes x 2 months, 80 x 200 cells
    public/site/data/blackcarbon.json  EDGAR v8.1 black-carbon emission ESTIMATES, EC JRC: 4 sectors, year 2022, 20 x 30 cells
  A file gives `grid` {rows, cols, lats (north to south), lons (west to east), cellSizeDeg?}, `layers` (id, name [en,el], group,
  period, and either `values` (row-major, null = no data) or `packed` with the file's shared `mask.runs`), `scales` per group and `unit`.
  Three cell states are kept apart everywhere: a value above zero, a published zero, and no data (null, never 0).
  The colour scale is fixed per GROUP (ship class, or all four sectors), so layers of one group can be compared by eye.
  All arithmetic (scale positions, counts, sums, unit change Gg -> tonnes) happens here. Nothing is ranked.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.gridmapData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The grid data could not be loaded.', 'Τα δεδομένα του πλέγματος δεν φόρτωσαν.'];
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  // a number as text: enough digits to read, never an exponent; very small values are said in words
  function fmt(v) {
    if (!isNum(v)) return ['–', '–'];
    if (v === 0) return ['0', '0'];
    const a = Math.abs(v);
    if (a < 0.0001) return ['under 0.0001', 'κάτω από 0.0001'];
    const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : String(Number(v.toPrecision(3)));
    return [s, s];
  }
  const pos = (v, d) => [Math.abs(v).toFixed(d), Math.abs(v).toFixed(d)];
  function coord(lat, lon, d) {
    const a = pos(lat, d)[0], o = pos(lon, d)[0];
    return [a + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + o + '° ' + (lon >= 0 ? 'E' : 'W'), a + '° ' + (lat >= 0 ? 'Β' : 'Ν') + ', ' + o + '° ' + (lon >= 0 ? 'Α' : 'Δ')];
  }

  // layer.packed + mask.runs -> row-major array with null for no data (see `packing` in shipdensity.json)
  function unpack(packed, runs, n) {
    const out = new Array(n).fill(null), valid = [];
    let at = 0, has = true;
    for (const len of runs) { if (has) for (let k = 0; k < len; k++) valid.push(at + k); at += len; has = !has; }
    if (at !== n) return null;
    let i = 0;
    for (const p of packed) {
      if (!isNum(p)) return null;
      if (p < 0) { for (let k = 0; k < -p; k++) { if (i >= valid.length) return null; out[valid[i++]] = 0; } }
      else { if (i >= valid.length) return null; out[valid[i++]] = p; }
    }
    return i === valid.length ? out : null;
  }

  // cell edges from cell centres: exact half cells when the file gives the cell size, else half way between neighbours
  function edges(c, size) {
    const n = c.length, e = new Array(n + 1);
    if (isNum(size) && size > 0) { const s = c[n - 1] >= c[0] ? size : -size; for (let i = 0; i < n; i++) e[i] = c[i] - s / 2; e[n] = c[n - 1] + s / 2; return e; }
    if (n === 1) return [c[0] - 0.05, c[0] + 0.05];
    e[0] = c[0] - (c[1] - c[0]) / 2; for (let i = 1; i < n; i++) e[i] = (c[i - 1] + c[i]) / 2; e[n] = c[n - 1] + (c[n - 1] - c[n - 2]) / 2;
    return e;
  }
  function gridOf(g) {
    if (!g || !Array.isArray(g.lats) || !Array.isArray(g.lons) || g.lats.length !== g.rows || g.lons.length !== g.cols || !g.rows || !g.cols) return null;
    const latE = edges(g.lats, g.cellSizeDeg), lonE = edges(g.lons, g.cellSizeDeg);
    const north = latE[0], south = latE[g.rows], west = lonE[0], east = lonE[g.cols];
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    const k = Math.cos(((north + south) / 2) * Math.PI / 180);
    const span = Math.min(north - south, east - west), step = span < 1.5 ? 0.5 : 1;
    const lines = (lo, hi) => { const out = []; for (let v = Math.ceil(r6(lo) / step) * step; v <= r6(hi); v += step) out.push(v); return out; };
    return { rows: g.rows, cols: g.cols, lats: g.lats, lons: g.lons, decimals: isNum(g.cellSizeDeg) ? 2 : 3,
      bbox: { west: r6(west), south: r6(south), east: r6(east), north: r6(north) },
      // 0..1 positions of the cell edges inside the box: gx west to east, gy north to south
      gx: lonE.map((v) => (v - west) / (east - west)), gy: latE.map((v) => (north - v) / (north - south)),
      aspect: ((east - west) * k) / (north - south),
      graticule: {
        lats: lines(south, north).map((v) => ({ v, f: (north - v) / (north - south), label: [fmtDeg(v) + '° N', fmtDeg(v) + '° Β'] })),
        lons: lines(west, east).map((v) => ({ v, f: (v - west) / (east - west), label: [fmtDeg(v) + '° E', fmtDeg(v) + '° Α'] })),
      } };
  }
  const fmtDeg = (v) => String(Math.round(v * 10) / 10);

  // one fixed scale for a group of layers: log (each step ten times the one before) or square root, top rounded up to 1, 2 or 5
  function niceUp(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 5, 10]) if (m * p >= v * (1 - 1e-12)) return m * p; return 10 * p; }
  function scaleOf(spec, max) {
    const type = spec && spec.type === 'sqrt' ? 'sqrt' : 'log', hi = niceUp(max);
    const lo = type === 'log' ? (spec && isNum(spec.min) && spec.min > 0 && spec.min < hi ? spec.min : hi / 1e5) : 0;
    const ticks = [];
    if (type === 'log') { for (let e = Math.ceil(Math.log10(lo) - 1e-9); Math.pow(10, e) < hi * (1 - 1e-9); e++) ticks.push(Math.pow(10, e)); ticks.push(hi); }
    else for (const f of [0, 0.25, 0.5, 1]) ticks.push(hi * f * f);
    const sc = { type, min: lo, max: hi, dataMax: max };
    sc.ticks = ticks.map((v) => { const n = String(Number(v.toPrecision(3))); return { v, t: position(sc, v), label: [n, n] }; });
    return sc;
  }
  // where a value sits on the scale: null = no data, -1 = published zero (drawn in its own colour), 0..1 = above zero
  function position(sc, v) {
    if (!isNum(v)) return null;
    if (v === 0) return -1;
    if (v < 0) return null;
    const t = sc.type === 'sqrt' ? Math.sqrt(v / sc.max) : Math.log(v / sc.min) / Math.log(sc.max / sc.min);
    return Math.max(0, Math.min(1, t));
  }

  function build(data, opts) {
    opts = opts || {};
    const off = (why) => ({ id: (data && data.id) || 'gridmap', widget: 'gridmap', available: false, empty: EMPTY, why: why || '', choices: [], layers: {}, textRows: [EMPTY], ariaLabel: EMPTY });
    if (!data || !Array.isArray(data.layers) || !data.layers.length) return off('no layers');
    const grid = gridOf(data.grid); if (!grid) return off('bad grid');
    const n = grid.rows * grid.cols, unit = data.unit || ['', ''], estimate = data.kind === 'estimate';
    const layers = {}, choices = [], groups = {};
    for (const L of data.layers) {
      let values = null;
      if (Array.isArray(L.values) && L.values.length === n) values = L.values.map((v) => (isNum(v) && v >= 0 ? v : null));
      else if (Array.isArray(L.packed) && data.mask && Array.isArray(data.mask.runs)) values = unpack(L.packed, data.mask.runs, n);
      if (!values) continue;
      const flags = {}; for (const f of (Array.isArray(L.flags) ? L.flags : [])) if (Array.isArray(f) && f[0] >= 0 && f[0] < n && f[1]) flags[f[0]] = String(f[1]);
      let valid = 0, zero = 0, max = 0, sum = 0;
      for (const v of values) if (v != null) { valid++; if (v === 0) zero++; if (v > max) max = v; sum += v; }
      const group = L.group || L.id;
      layers[L.id] = { id: L.id, code: L.code || L.id, group, name: L.name, groupName: L.groupName || L.name, period: L.period || '', periodName: L.periodName || ['', ''],
        values, flags, counts: { cells: n, valid, zero, positive: valid - zero, nodata: n - valid, flagged: Object.keys(flags).length }, max, sum };
      (groups[group] = groups[group] || []).push(L.id);
      choices.push({ id: L.id, name: L.name, group, period: L.period || '' });   // the file's own order, nothing sorted
    }
    if (!choices.length) return off('no readable layer');
    const scales = {};
    for (const g in groups) scales[g] = scaleOf(data.scales && data.scales[g], groups[g].reduce((m, id) => Math.max(m, layers[id].max), 0));
    for (const id in layers) { const L = layers[id], sc = scales[L.group]; L.t = L.values.map((v) => position(sc, v)); }
    const two = (v) => (Array.isArray(v) ? v : [String(v || ''), String(v || '')]);   // a licence name may come as one string or as an [en, el] pair
    const src = (data.sources || []).map((s) => ({ name: s.name, licence: two(s.licence), url: s.url, credit: s.credit, what: s.what }));
    const model = { id: data.id || 'gridmap', widget: 'gridmap', available: true, empty: null, live: false, estimate, title: data.title || ['', ''], unit, quantity: data.quantity || ['', ''],
      period: data.period || ['', ''], still: data.still || ['Not live', 'Όχι ζωντανά'], retrieved: data.retrieved || '', sourceShort: data.sourceShort || (src[0] && src[0].name) || '',
      sources: src, grid, choices, layers, groups, scales, compare: data.compare || ['Same cell, other layers', 'Ίδιο κελί, άλλα επίπεδα'],
      notes: (data.notes || []).slice(), changes: data.changes || null, sumLabel: data.sumLabel || null, national: nationalOf(data.national),
      strings: {
        zero: ['0: a published zero', '0: δημοσιευμένο μηδέν'], nodata: ['no data in the source', 'χωρίς δεδομένα στην πηγή'], flagged: ['marked by the source', 'με σήμανση από την πηγή'],
        log: ['Logarithmic scale: each step is ten times the one before.', 'Λογαριθμική κλίμακα: κάθε βήμα είναι δέκα φορές το προηγούμενο.'],
        sqrt: ['Square-root scale.', 'Κλίμακα τετραγωνικής ρίζας.'],
        orLess: ['or less', 'ή λιγότερο'], sameScale: ['Same colours for', 'Ίδια χρώματα για'],
        estimate: ['model estimate', 'εκτίμηση μοντέλου'], cell: ['cell centre', 'κέντρο κελιού'],
        hint: ['Point at a cell, or use the arrow keys (Shift for bigger steps), to read its value.', 'Δείξτε ένα κελί ή χρησιμοποιήστε τα βελάκια (με Shift για μεγαλύτερα βήματα) για να διαβάσετε την τιμή του.'],
        outline: ['Thin line: the island drawing of this site, a guide only, not part of the data.', 'Λεπτή γραμμή: το σχέδιο του νησιού αυτής της ιστοσελίδας, μόνο ως οδηγός, όχι μέρος των δεδομένων.'],
        source: ['Source', 'Πηγή'], retrieved: ['copied on', 'αντιγράφηκε στις'],
      } };
    return select(model, layers[opts.layer] ? opts.layer : choices[0].id);
  }

  // EDGAR country series (Gg per year) -> also in tonnes (1 Gg = 1000 tonnes); kept apart from the grid, different geography
  function nationalOf(nat) {
    if (!nat || !Array.isArray(nat.years) || !Array.isArray(nat.totalGg) || nat.years.length !== nat.totalGg.length) return null;
    return { what: nat.what || ['', ''], years: nat.years, totalGg: nat.totalGg.map((v) => (isNum(v) ? v : null)), totalTonnes: nat.totalGg.map((v) => (isNum(v) ? v * 1000 : null)) };
  }

  function stateOf(L, i) { const v = L.values[i]; return v == null ? 'nodata' : v === 0 ? 'zero' : 'value'; }
  function valueText(model, L, i) {
    const v = L.values[i], S = model.strings;
    if (v == null) return S.nodata;
    const f = fmt(v), pre = model.estimate ? [S.estimate[0] + ' ', S.estimate[1] + ' '] : ['', ''];
    return [pre[0] + f[0], pre[1] + f[1]];
  }

  // read ONE cell of the selected layer (and the same cell in the other layers of its group, for the by-eye comparison)
  function cell(model, row, col) {
    if (!model || !model.available || !model.grid) return null;
    const g = model.grid; if (!(row >= 0 && row < g.rows && col >= 0 && col < g.cols)) return null;
    const L = model.layers[model.layer], i = row * g.cols + col, lat = g.lats[row], lon = g.lons[col], c = coord(lat, lon, g.decimals);
    const vt = valueText(model, L, i), state = stateOf(L, i), flag = L.flags[i] || null, S = model.strings;
    const others = model.groups[L.group].filter((id) => id !== L.id).map((id) => { const O = model.layers[id]; return { layer: id, name: O.period !== L.period ? O.periodName : O.name, value: O.values[i], state: stateOf(O, i), text: valueText(model, O, i) }; });
    const withUnit = (k) => (state === 'nodata' ? vt[k] : vt[k] + ' ' + model.unit[k]) + (flag ? ' (' + S.flagged[k] + ': ' + flag + ')' : '');
    const where = [S.cell[0] + ' ' + c[0], S.cell[1] + ' ' + c[1]];
    const otherLine = others.length ? [0, 1].map((k) => model.compare[k] + ': ' + others.map((o) => o.name[k] + ' ' + o.text[k]).join('; ')) : null;
    const lines = [[L.name[0] + ' · ' + where[0], L.name[1] + ' · ' + where[1]], [withUnit(0), withUnit(1)]].concat(otherLine ? [otherLine] : []);
    const label = [0, 1].map((k) => L.name[k] + ', ' + where[k] + ': ' + withUnit(k) + '.' + (otherLine ? ' ' + otherLine[k] + '.' : '') + ' ' + S.source[k] + ': ' + model.sourceShort + '.');
    return { row, col, index: i, lat, lon, value: L.values[i], state, flag, unit: model.unit, layer: L.id, layerName: L.name, period: L.period, t: L.t[i], others, lines, label };
  }
  // which cell holds a point of the box: fx 0..1 west to east, fy 0..1 north to south
  function locate(model, fx, fy) {
    const g = model && model.grid; if (!g || !(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return null;
    const find = (e, f) => { let lo = 0, hi = e.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (e[m] <= f) lo = m; else hi = m - 1; } return lo; };
    return { row: find(g.gy, fy), col: find(g.gx, fx) };
  }

  function select(model, layerId) {
    const L = model.layers && model.layers[layerId]; if (!L) return model;
    const sc = model.scales[L.group], S = model.strings, u = model.unit, c = L.counts, b = model.grid.bbox;
    const rows = [];
    rows.push([model.title[0] + '. ' + L.name[0] + '. ' + model.still[0] + '.', model.title[1] + '. ' + L.name[1] + '. ' + model.still[1] + '.']);
    rows.push([c.cells + ' cells (' + model.grid.rows + ' rows by ' + model.grid.cols + ' columns) between ' + b.west + ' and ' + b.east + '° E and ' + b.south + ' and ' + b.north + '° N: ' + c.valid + ' with a value (' + c.zero + ' of them a published zero), ' + c.nodata + ' with no data in the source.',
      c.cells + ' κελιά (' + model.grid.rows + ' σειρές επί ' + model.grid.cols + ' στήλες) ανάμεσα σε ' + b.west + ' και ' + b.east + '° Α και ' + b.south + ' και ' + b.north + '° Β: ' + c.valid + ' με τιμή (τα ' + c.zero + ' είναι δημοσιευμένο μηδέν), ' + c.nodata + ' χωρίς δεδομένα στην πηγή.']);
    if (c.flagged) rows.push([c.flagged + ' cells are marked by the source; they carry a white dot.', c.flagged + ' κελιά έχουν σήμανση από την πηγή· έχουν μια άσπρη τελεία.']);
    const top = fmt(L.max), lo = fmt(sc.min), hi = fmt(sc.max);
    rows.push(['Values on this map go from 0 up to ' + top[0] + ' ' + u[0] + '.', 'Οι τιμές σε αυτόν τον χάρτη πάνε από 0 έως ' + top[1] + ' ' + u[1] + '.']);
    const same = model.groups[L.group].length > 1 ? [' ' + S.sameScale[0] + ': ' + model.groups[L.group].map((id) => model.layers[id].name[0]).join('; ') + '.', ' ' + S.sameScale[1] + ': ' + model.groups[L.group].map((id) => model.layers[id].name[1]).join('; ') + '.'] : ['', ''];
    rows.push([(sc.type === 'log' ? 'Colour scale from ' + lo[0] + ' ' + S.orLess[0] + ' to ' + hi[0] + ' ' + u[0] + '. ' + S.log[0] : 'Colour scale from 0 to ' + hi[0] + ' ' + u[0] + '. ' + S.sqrt[0]) + ' Zero has its own colour.' + same[0],
      (sc.type === 'log' ? 'Κλίμακα χρωμάτων από ' + lo[1] + ' ' + S.orLess[1] + ' έως ' + hi[1] + ' ' + u[1] + '. ' + S.log[1] : 'Κλίμακα χρωμάτων από 0 έως ' + hi[1] + ' ' + u[1] + '. ' + S.sqrt[1]) + ' Το μηδέν έχει δικό του χρώμα.' + same[1]]);
    let sumText = null;
    if (model.sumLabel) { sumText = [model.sumLabel[0] + ', ' + L.name[0] + ', ' + L.periodName[0] + ': ' + L.sum.toFixed(2) + ' tonnes.', model.sumLabel[1] + ', ' + L.name[1] + ', ' + L.periodName[1] + ': ' + L.sum.toFixed(2) + ' τόνοι.']; rows.push(sumText); }
    if (model.national) {
      const k = model.national.years.indexOf(Number(L.period)), gg = k >= 0 ? model.national.totalGg[k] : null;
      if (gg != null) rows.push([model.national.what[0] + ', ' + L.period + ': ' + fmt(gg)[0] + ' Gg per year (' + model.national.totalTonnes[k].toFixed(0) + ' tonnes). This is a separate estimate with a different geography from the rectangle; it is not the sum of these maps.',
        model.national.what[1] + ', ' + L.period + ': ' + fmt(gg)[1] + ' Gg τον χρόνο (' + model.national.totalTonnes[k].toFixed(0) + ' τόνοι). Είναι ξεχωριστή εκτίμηση με διαφορετική γεωγραφία από το ορθογώνιο· δεν είναι το άθροισμα αυτών των χαρτών.']);
    }
    for (const nrow of model.notes) rows.push(nrow);
    if (model.changes) rows.push(model.changes);
    for (const s of model.sources) rows.push([S.source[0] + ': ' + s.credit + ' ' + s.licence[0] + '. ' + S.retrieved[0] + ' ' + model.retrieved + '. ' + s.url, S.source[1] + ': ' + s.credit + ' ' + s.licence[1] + '. ' + S.retrieved[1] + ' ' + model.retrieved + '. ' + s.url]);
    const aria = ['Grid map, ' + L.name[0] + ': ' + model.quantity[0] + ' in ' + u[0] + '. ' + rows[1][0] + ' ' + model.still[0] + '.', 'Χάρτης πλέγματος, ' + L.name[1] + ': ' + model.quantity[1] + ' σε ' + u[1] + '. ' + rows[1][1] + ' ' + model.still[1] + '.'];
    return Object.assign({}, model, { layer: L.id, layerName: L.name, group: L.group, groupName: L.groupName, layerPeriod: L.period, values: L.values, t: L.t, flags: L.flags, counts: L.counts, max: L.max, sum: L.sum, sumText, scale: sc, textRows: rows, ariaLabel: aria });
  }
  return { build, select, cell, locate, unpack, edges, scaleOf, position, niceUp, fmt, EMPTY };
});
