/*
  drought-data.js: the model for the Drought watch page.
  Pure: no DOM, no clock, no network. Input: public/site/data/drought.json, the Standardized Precipitation Index (SPI) as PUBLISHED
  by the Department of Meteorology for Cyprus and its seven hydrological regions, one sheet per month, nine time windows.
  Nothing is computed here except the class of a published value (WMO SPI User Guide, 2012: the classes of the index) and the
  share of the usual rain (rain so far in the water year divided by the usual amount for the same months).
  A value that is missing or not a number stays missing (null); it is never drawn as zero. Regions keep the Department's order:
  nothing is ranked. SPI describes rain only: not the dams, not the soil, not the water people use (the model says so).
  move(model, a, b, T): the walk from one sheet to a later one, for the animation. The dots travel between two PUBLISHED sheets;
  the months in between are not shown and no value is invented for them.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.droughtData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The drought index could not be loaded.', 'Ο δείκτης ξηρασίας δεν φόρτωσε.'];
  const MONTHS = [['January', 'Ιανουάριος'], ['February', 'Φεβρουάριος'], ['March', 'Μάρτιος'], ['April', 'Απρίλιος'], ['May', 'Μάιος'], ['June', 'Ιούνιος'], ['July', 'Ιούλιος'], ['August', 'Αύγουστος'], ['September', 'Σεπτέμβριος'], ['October', 'Οκτώβριος'], ['November', 'Νοέμβριος'], ['December', 'Δεκέμβριος']];
  // the classes of the WMO SPI User Guide (2012); -2.0 itself is "extremely dry"
  const CLASSES = [
    { id: 'xdry', n: ['extremely dry', 'εξαιρετικά ξηρά'] }, { id: 'sdry', n: ['severely dry', 'πολύ ξηρά'] }, { id: 'mdry', n: ['moderately dry', 'μέτρια ξηρά'] },
    { id: 'normal', n: ['near normal', 'σχεδόν κανονικά'] },
    { id: 'mwet', n: ['moderately wet', 'μέτρια υγρά'] }, { id: 'vwet', n: ['very wet', 'πολύ υγρά'] }, { id: 'xwet', n: ['extremely wet', 'εξαιρετικά υγρά'] }];
  // what a window is usually read as (Department of Meteorology sheets; WMO guide). A reading aid, not a measurement.
  const READS = { 1: ['soil and crops', 'έδαφος και καλλιέργειες'], 6: ['streams and small dams', 'ρυάκια και μικρά φράγματα'], 12: ['reservoirs', 'ταμιευτήρες'], 36: ['reservoirs and groundwater', 'ταμιευτήρες και υπόγεια νερά'] };
  const START = 500, ROW = 330, HOLD1 = 1500, GLIDE = 2400, HOLD2 = 2600;
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const pair = (a, b) => [String(a == null ? '' : a), String(b == null || b === '' ? (a == null ? '' : a) : b)];
  function classify(v) { if (num(v) == null) return null; return v <= -2 ? CLASSES[0] : v <= -1.5 ? CLASSES[1] : v <= -1 ? CLASSES[2] : v < 1 ? CLASSES[3] : v < 1.5 ? CLASSES[4] : v < 2 ? CLASSES[5] : CLASSES[6]; }
  function fmt(v, el) { if (num(v) == null) return '–'; const s = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2); return el ? s.replace('.', ',') : s; }
  function monthText(ym) { const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '')); if (!m || +m[2] < 1 || +m[2] > 12) return null; return [MONTHS[+m[2] - 1][0] + ' ' + m[1], MONTHS[+m[2] - 1][1] + ' ' + m[1]]; }
  const row = (list, n) => { const out = []; for (let i = 0; i < n; i++) out.push(Array.isArray(list) ? num(list[i]) : null); return out; };

  function build(d) {
    const windows = d && Array.isArray(d.windows) ? d.windows.filter((w) => num(w) != null && w > 0) : [], raw = d && Array.isArray(d.sheets) ? d.sheets : [];
    const none = { id: 'drought', available: false, empty: EMPTY, windows: [], regions: [], sheets: [], classes: CLASSES, textRows: [EMPTY], ariaLabel: EMPTY, confirmed: false };
    if (!windows.length) return none;
    const regions = (Array.isArray(d.regions) ? d.regions : []).filter((r) => r && r.id != null).map((r) => ({ id: String(r.id), name: Array.isArray(r.name) ? pair(r.name[0], r.name[1]) : pair(r.id) }));
    const nW = windows.length;
    const sheets = raw.filter((s) => s && monthText(s.ym)).map((s) => {
      const cy = row(s.cyprus, nW), cum = num(s.cumulativeMm), usual = num(s.cumulativeNormalMm), pct = cum != null && usual != null && usual > 0 ? Math.round(cum / usual * 100) : null;
      const regs = regions.map((r) => { const v = s.byRegion && Array.isArray(s.byRegion[r.id]) ? row(s.byRegion[r.id], nW) : null, flag = s.flags && Array.isArray(s.flags[r.id]) ? pair(s.flags[r.id][0], s.flags[r.id][1]) : null; return { id: r.id, name: r.name, values: v, classes: v ? v.map(classify) : null, flag }; });
      const i12 = windows.indexOf(12), iLong = windows.indexOf(48) >= 0 ? windows.indexOf(48) : nW - 1, a = i12 >= 0 ? cy[i12] : null, b = cy[iLong], ca = classify(a), cb = classify(b), label = monthText(s.ym), from = monthText(s.waterYearFrom);
      let say = null;
      if (ca && cb) {
        const lw = windows[iLong], recovering = a > -1 && b <= -1;
        say = recovering
          ? ['The last 12 months were ' + ca.n[0] + ' (' + fmt(a) + '), but the last ' + lw + ' months together are still ' + cb.n[0] + ' (' + fmt(b) + '). A wet season does not erase several dry years.', 'Οι τελευταίοι 12 μήνες ήταν ' + ca.n[1] + ' (' + fmt(a, 1) + '), όμως οι τελευταίοι ' + lw + ' μήνες μαζί παραμένουν ' + cb.n[1] + ' (' + fmt(b, 1) + '). Μια υγρή περίοδος δεν σβήνει αρκετά ξηρά χρόνια.']
          : ['The last 12 months were ' + ca.n[0] + ' (' + fmt(a) + ') and the last ' + lw + ' months together ' + cb.n[0] + ' (' + fmt(b) + ').', 'Οι τελευταίοι 12 μήνες ήταν ' + ca.n[1] + ' (' + fmt(a, 1) + ') και οι τελευταίοι ' + lw + ' μήνες μαζί ' + cb.n[1] + ' (' + fmt(b, 1) + ').'];
      }
      return { ym: String(s.ym), label, from, url: typeof s.url === 'string' && /^https:\/\//.test(s.url) ? s.url : null, cyprus: cy, classes: cy.map(classify), cumulativeMm: cum, usualMm: usual, pct, regions: regs, say };
    }).sort((x, y) => (x.ym < y.ym ? -1 : x.ym > y.ym ? 1 : 0));
    if (!sheets.length) return none;
    const last = sheets[sheets.length - 1], src = Array.isArray(d.source) ? pair(d.source[0], d.source[1]) : pair('Source not stated', 'Η πηγή δεν αναφέρεται'), ref = String(d.reference || '').replace('-', ' to ');
    const refEl = String(d.reference || '').replace('-', ' έως ');
    const head = ['Published drought index (SPI) for Cyprus, ' + last.label[0] + ': ' + windows.map((w, i) => w + ' months ' + fmt(last.cyprus[i])).join(', ') + '. Reference period ' + ref + '.', 'Δημοσιευμένος δείκτης ξηρασίας (SPI) για την Κύπρο, ' + last.label[1] + ': ' + windows.map((w, i) => w + ' μήνες ' + fmt(last.cyprus[i], 1)).join(', ') + '. Περίοδος αναφοράς ' + refEl + '.'];
    const rows = [head];
    sheets.forEach((s) => {
      if (s.say) rows.push([s.label[0] + ': ' + s.say[0], s.label[1] + ': ' + s.say[1]]);
      if (s.pct != null) rows.push([s.label[0] + ': ' + s.cumulativeMm.toFixed(1) + ' mm of rain since ' + (s.from ? s.from[0] : 'the start of the water year') + ', ' + s.pct + '% of the usual ' + s.usualMm.toFixed(1) + ' mm (island average).', s.label[1] + ': ' + s.cumulativeMm.toFixed(1).replace('.', ',') + ' mm βροχής από ' + (s.from ? s.from[1] : 'την αρχή του υδρολογικού έτους') + ', ' + s.pct + '% των συνηθισμένων ' + s.usualMm.toFixed(1).replace('.', ',') + ' mm (μέσος όρος νησιού).']);
      s.regions.forEach((r) => rows.push(r.values ? [s.label[0] + ', ' + r.name[0] + ': ' + windows.map((w, i) => w + ' months ' + fmt(r.values[i])).join(', '), s.label[1] + ', ' + r.name[1] + ': ' + windows.map((w, i) => w + ' μήνες ' + fmt(r.values[i], 1)).join(', ')] : [s.label[0] + ', ' + r.name[0] + ': no value shown. ' + (r.flag ? r.flag[0] : 'Not reported.'), s.label[1] + ', ' + r.name[1] + ': δεν εμφανίζεται τιμή. ' + (r.flag ? r.flag[1] : 'Δεν αναφέρθηκε.')]));
    });
    rows.push(['SPI describes rain only. The dams also depend on earlier years, on inflow and on how much water is taken out, so a wet index and low dams can be true together.', 'Ο SPI περιγράφει μόνο τη βροχή. Τα φράγματα εξαρτώνται και από προηγούμενα χρόνια, από την εισροή και από το πόσο νερό αντλείται, άρα υγρός δείκτης και χαμηλά φράγματα μπορούν να ισχύουν μαζί.']);
    const confirmNote = Array.isArray(d.confirmNote) ? pair(d.confirmNote[0], d.confirmNote[1]) : ['The numbers have not been confirmed with the publisher.', 'Οι αριθμοί δεν έχουν επιβεβαιωθεί με τον εκδότη.'];
    if (d.confirmed !== true) rows.push(confirmNote);
    return { id: 'drought', available: true, empty: null, windows, reads: windows.map((w) => READS[w] || null), regions, sheets, classes: CLASSES, source: src, sourceUrl: typeof d.sourceUrl === 'string' && /^https:\/\//.test(d.sourceUrl) ? d.sourceUrl : null, method: Array.isArray(d.method) ? pair(d.method[0], d.method[1]) : null, reference: [ref, refEl], retrieved: String(d.retrieved || ''), confirmed: d.confirmed === true, confirmNote, textRows: rows, ariaLabel: head };
  }

  // The walk from sheet a to the later sheet b at run time T (ms). pos is where a dot is DRAWN; between the two sheets it is
  // only a position on the way, never a value (value is null while a dot travels).
  function duration(m) { return START + m.windows.length * ROW + HOLD1 + GLIDE + HOLD2; }
  function move(m, a, b, T) {
    const A = m.sheets[a], B = m.sheets[b], n = m.windows.length, t0 = START + n * ROW + HOLD1, g = Math.max(0, Math.min(1, (T - t0) / GLIDE)), e = g * g * (3 - 2 * g);
    const rows = m.windows.map((w, i) => { const shown = Math.max(0, Math.min(1, (T - START - i * ROW) / 260)), from = A ? A.cyprus[i] : null, to = B ? B.cyprus[i] : null;
      let pos = null, value = null, of = null;
      if (g <= 0) { pos = from; value = from; of = 'a'; } else if (g >= 1) { pos = to; value = to; of = 'b'; } else if (from != null && to != null) pos = from + (to - from) * e; else if (to == null) { pos = null; }
      return { window: w, shown, from, to, pos, value, of }; });
    return { phase: T < t0 ? 'a' : g < 1 ? 'moving' : 'b', glide: g, rows, done: T >= duration(m) };
  }
  return { build, classify, fmt, monthText, move, duration, CLASSES };
});
