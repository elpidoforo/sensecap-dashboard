/*
  lidar-data.js: the model for the "lidar" widget (aerosol classes above Limassol on ONE day, by hour and altitude band).
  Pure: no DOM, no clock, no network. Input is public/site/data/lidar.json (ACTRIS Cloudnet classification product,
  CARO Limassol, 2 July 2024, CC BY 4.0). Each share is computed here as class cells / grid cells of that hour and
  band, and both counts travel with it. Class 8 (aerosol only) and class 10 (aerosol with insects) are two separate
  measures and are never added together. A cell with no classified data is unknown (null), never zero.
  select(model, measure): measure is 'only' or 'insects' (the list is model.choices).
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.lidarData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The Limassol aerosol classification could not be loaded.', 'Η ταξινόμηση αερολυμάτων της Λεμεσού δεν φόρτωσε.'];
  const MEASURES = [
    { id: 'only', code: 8, name: ['Aerosol only (class 8)', 'Μόνο αερολύματα (κατηγορία 8)'], short: ['aerosol only (class 8)', 'μόνο αερολύματα (κατηγορία 8)'] },
    { id: 'insects', code: 10, name: ['Aerosol with insects (class 10)', 'Αερολύματα με έντομα (κατηγορία 10)'], short: ['aerosol with insects (class 10)', 'αερολύματα με έντομα (κατηγορία 10)'] },
  ];
  const MONTHS = [['January', 'Ιανουαρίου'], ['February', 'Φεβρουαρίου'], ['March', 'Μαρτίου'], ['April', 'Απριλίου'], ['May', 'Μαΐου'], ['June', 'Ιουνίου'], ['July', 'Ιουλίου'], ['August', 'Αυγούστου'], ['September', 'Σεπτεμβρίου'], ['October', 'Οκτωβρίου'], ['November', 'Νοεμβρίου'], ['December', 'Δεκεμβρίου']];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const cnt = (v) => (isNum(v) && v >= 0 ? v : null);
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const pct = (a, b) => (isNum(a) && isNum(b) && b > 0 ? (a / b) * 100 : null);
  const p1 = (v) => (v == null ? ['–', '–'] : [v.toFixed(1) + '%', v.toFixed(1).replace('.', ',') + '%']);

  function cell(hour, bi, band, row) {
    const grid = row ? cnt(row[3]) : null, classified = row ? cnt(row[4]) : null, only = row ? cnt(row[5]) : null, insects = row ? cnt(row[6]) : null;
    const unknown = !grid || !classified;                 // no grid or nothing classified: unknown, drawn hatched
    const incomplete = !unknown && classified < grid;      // some cells were not classified: the share may be too low
    const shareOnly = unknown ? null : pct(only, grid), shareInsects = unknown ? null : pct(insects, grid);
    const hEn = pad2(hour) + ':00 to ' + pad2(hour + 1) + ':00 UTC', hEl = pad2(hour) + ':00 έως ' + pad2(hour + 1) + ':00 UTC';
    const bEn = band.lower + ' to ' + band.upper + ' m above sea level', bEl = band.lower + ' έως ' + band.upper + ' μ. πάνω από τη θάλασσα';
    const part = (m, n, share) => {
      if (unknown || n == null) return [m.short[0] + ': unknown', m.short[1] + ': άγνωστο'];
      const s = p1(share); return [m.short[0] + ' ' + n + ' of ' + grid + ' grid cells (' + s[0] + ')', m.short[1] + ' ' + n + ' από ' + grid + ' κελιά πλέγματος (' + s[1] + ')'];
    };
    const onlyText = part(MEASURES[0], only, shareOnly), insectsText = part(MEASURES[1], insects, shareInsects);
    const statusText = !row ? ['no row for this hour and band in the source table: unknown, not zero', 'δεν υπάρχει γραμμή για αυτή την ώρα και ζώνη στον πίνακα της πηγής: άγνωστο, όχι μηδέν']
      : unknown ? ['no classified data (' + (classified == null ? 'no count' : classified) + ' of ' + (grid == null ? 'an unknown number of' : grid) + ' grid cells classified): unknown, not zero', 'χωρίς ταξινομημένα δεδομένα (ταξινομήθηκαν ' + (classified == null ? 'άγνωστο πόσα' : classified) + ' από ' + (grid == null ? 'άγνωστο αριθμό' : grid) + ' κελιά πλέγματος): άγνωστο, όχι μηδέν']
        : incomplete ? ['only ' + classified + ' of ' + grid + ' grid cells were classified, so the shares may be too low', 'ταξινομήθηκαν μόνο ' + classified + ' από ' + grid + ' κελιά πλέγματος, άρα τα ποσοστά ίσως είναι χαμηλότερα από τα πραγματικά']
          : [classified + ' of ' + grid + ' grid cells classified', 'ταξινομήθηκαν ' + classified + ' από ' + grid + ' κελιά πλέγματος'];
    const where = [hEn + ', ' + bEn, hEl + ', ' + bEl];
    const label = unknown ? [where[0] + ': ' + statusText[0] + '.', where[1] + ': ' + statusText[1] + '.']
      : [where[0] + ': ' + onlyText[0] + '; ' + insectsText[0] + '; ' + statusText[0] + '.', where[1] + ': ' + onlyText[1] + '· ' + insectsText[1] + '· ' + statusText[1] + '.'];
    return { hour, band: bi, lower: band.lower, upper: band.upper, grid, classified, only: unknown ? null : only, insects: unknown ? null : insects, shareOnly, shareInsects, unknown, incomplete, hasRow: !!row,
      whereText: where, onlyText, insectsText, statusText, label };
  }

  function build(data, opts) {
    opts = opts || {};
    const rows = data && Array.isArray(data.rows) ? data.rows.filter((r) => Array.isArray(r) && isNum(r[0]) && isNum(r[1]) && isNum(r[2])) : [];
    if (!rows.length) return { id: 'lidar', available: false, live: false, empty: EMPTY, choices: [], cells: [], bands: [], hours: [], textRows: [EMPTY], ariaLabel: EMPTY };
    // bands in the source's order (lowest first); hours 0 to 23 UTC
    const bandList = Array.isArray(data.bands) && data.bands.length ? data.bands.map((b) => [b[0], b[1]]) : [];
    for (const r of rows) if (!bandList.some((b) => b[0] === r[1] && b[1] === r[2])) bandList.push([r[1], r[2]]);
    const bands = bandList.map((b) => ({ lower: b[0], upper: b[1], thickness: b[1] - b[0], name: [b[0] + '–' + b[1] + ' m', b[0] + '–' + b[1] + ' μ.'] }));
    const hours = []; for (let h = 0; h < 24; h++) hours.push(h);
    const cells = [];
    for (let bi = 0; bi < bands.length; bi++) for (const h of hours) {
      const row = rows.find((r) => r[0] === h && r[1] === bands[bi].lower && r[2] === bands[bi].upper) || null;
      cells.push(cell(h, bi, bands[bi], row));
    }
    const known = cells.filter((c) => !c.unknown).length, incomplete = cells.filter((c) => c.incomplete).length;
    const d = String(data.date || '').split('-').map(Number), okDate = d.length === 3 && d.every(isNum) && MONTHS[d[1] - 1];
    const dateText = okDate ? [d[2] + ' ' + MONTHS[d[1] - 1][0] + ' ' + d[0], d[2] + ' ' + MONTHS[d[1] - 1][1] + ' ' + d[0]] : [String(data.date || 'date not given'), String(data.date || 'χωρίς ημερομηνία')];
    const countText = [known + ' of ' + cells.length + ' hour-by-band cells have classified data; ' + (cells.length - known) + ' are unknown and hatched' + '.' + (incomplete ? ' Only partly classified: ' + incomplete + '.' : ''),
      known + ' από ' + cells.length + ' κελιά ώρας και ζώνης έχουν ταξινομημένα δεδομένα· ' + (cells.length - known) + ' είναι άγνωστα και έχουν διαγράμμιση' + '.' + (incomplete ? ' Μόνο εν μέρει ταξινομημένα: ' + incomplete + '.' : '')];
    const src = (data.sources && data.sources[0]) || {}, credit = src.credit || 'ACTRIS Cloudnet / CARO Limassol, CC BY 4.0';
    const sourceText = ['Source: ' + credit + ', ' + (src.pid || src.url || '') + '. Retrieved ' + (data.retrieved || '') + '. Counts are per hour and altitude band.', 'Πηγή: ' + credit + ', ' + (src.pid || src.url || '') + '. Λήψη ' + (data.retrieved || '') + '. Οι μετρήσεις κελιών είναι ανά ώρα και ζώνη ύψους.'];
    const notes = [
      [(data.site && data.site.name ? data.site.name[0] : 'Limassol') + ', ' + dateText[0] + '. ' + (data.instrument ? data.instrument[0] : 'Radar and lidar classification') + '.', (data.site && data.site.name ? data.site.name[1] : 'Λεμεσός') + ', ' + dateText[1] + '. ' + (data.instrument ? data.instrument[1] : 'Ταξινόμηση με ραντάρ και lidar') + '.'],
      ['Aerosols are tiny particles that float in the air. Class 8 means the method saw aerosol only; class 10 means aerosol together with insects. The two classes are shown one at a time and are not added.', 'Τα αερολύματα είναι πολύ μικρά σωματίδια που αιωρούνται στον αέρα. Κατηγορία 8 σημαίνει ότι η μέθοδος είδε μόνο αερολύματα· κατηγορία 10 σημαίνει αερολύματα μαζί με έντομα. Οι δύο κατηγορίες φαίνονται μία τη φορά και δεν προστίθενται.'],
    ].concat(Array.isArray(data.notes) ? data.notes : [], [sourceText]);
    const model = { id: 'lidar', available: true, empty: null, live: false, date: data.date || null, dateText, retrieved: data.retrieved || null, timeZone: 'UTC', hours, bands, cells, measures: MEASURES, choices: MEASURES.map((m) => ({ id: m.id, name: m.name })),
      scale: { min: 0, max: 100 }, counts: { cells: cells.length, known, unknown: cells.length - known, incomplete, text: countText }, notes,
      strings: {
        title: ['Aerosol classes above Limassol', 'Κατηγορίες αερολυμάτων πάνω από τη Λεμεσό'],
        still: [dateText[0] + ', one day, not live', dateText[1] + ', μία ημέρα, όχι ζωντανά'],
        xAxis: ['hour of the day (UTC)', 'ώρα της ημέρας (UTC)'], yAxis: ['height, m above sea level', 'ύψος, μ. πάνω από τη θάλασσα'],
        keyOf: ['of the grid cells in an hour and band', 'των κελιών πλέγματος σε μία ώρα και ζώνη'],
        unknown: ['no classified data', 'χωρίς ταξινομημένα δεδομένα'], partly: ['partly classified', 'εν μέρει ταξινομημένο'],
        hint: ['Point at a cell, or use the arrow keys, to read both classes with their counts.', 'Δείξτε ένα κελί ή χρησιμοποιήστε τα βελάκια για να διαβάσετε και τις δύο κατηγορίες με τους αριθμούς τους.'],
        limit: ['The classification cannot tell dust from ship exhaust.', 'Η ταξινόμηση δεν μπορεί να ξεχωρίσει τη σκόνη από τα καυσαέρια πλοίων.'],
        source: ['Source: ' + credit, 'Πηγή: ' + credit],
      } };
    return select(model, opts.measure === 'insects' ? 'insects' : 'only');
  }

  function select(model, measure) {
    if (!model || !model.available) return model;
    const ms = model.measures.find((m) => m.id === measure); if (!ms || ms.id === model.measure) return model;
    const k = ms.id === 'only' ? 'shareOnly' : 'shareInsects';
    const ariaLabel = ['Grid of ' + model.hours.length + ' hours (UTC) by ' + model.bands.length + ' altitude bands above Limassol on ' + model.dateText[0] + '. Each cell is coloured by the share of its grid cells classed as ' + ms.short[0] + '. ' + model.counts.text[0] + ' ' + model.strings.limit[0],
      'Πλέγμα με ' + model.hours.length + ' ώρες (UTC) και ' + model.bands.length + ' ζώνες ύψους πάνω από τη Λεμεσό στις ' + model.dateText[1] + '. Κάθε κελί χρωματίζεται με το ποσοστό των κελιών πλέγματός του στην κατηγορία: ' + ms.short[1] + '. ' + model.counts.text[1] + ' ' + model.strings.limit[1]];
    const head = [[model.strings.title[0] + ', ' + model.dateText[0] + ', times in UTC. Coloured measure: ' + ms.name[0] + '.', model.strings.title[1] + ', ' + model.dateText[1] + ', ώρες σε UTC. Μέτρο με χρώμα: ' + ms.name[1] + '.'], model.counts.text];
    return Object.assign({}, model, { measure: ms.id, measureName: ms.name, shareKey: k, textRows: head.concat(model.cells.map((c) => c.label), model.notes), ariaLabel });
  }
  return { build, select, cell, pct, MEASURES, EMPTY };
});
