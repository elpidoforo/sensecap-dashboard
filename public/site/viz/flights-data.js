/*
  flights-data.js: the model for the "flights" widget (international arrivals and departures per day, ONE airport and ONE year).
  Pure: no DOM, no clock, no network. Input is public/site/data/flights.json (Cyprus Department of Civil Aviation, Larnaka and
  Pafos ATC tower daily records 2018 to 2023, CC BY 4.0). Every sum, median and count of covered days is computed here from the
  published daily counts. A day with no row in the source stays null (never 0); a published 0 stays 0.
  The two airports are never put side by side and nothing is ranked: each airport has its own scale, said on the picture.

  build(data, { airport, year }) -> model            select(model, { airport, year }) -> model for that airport and year
  Selector lists for the page: model.choices (airports, source order) and model.years (years, oldest first).
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.flightsData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The airport day counts could not be loaded.', 'Οι ημερήσιες μετρήσεις των αεροδρομίων δεν φόρτωσαν.'];
  const MONTHS = [['January', 'Ιανουάριος', 'Ιανουαρίου'], ['February', 'Φεβρουάριος', 'Φεβρουαρίου'], ['March', 'Μάρτιος', 'Μαρτίου'], ['April', 'Απρίλιος', 'Απριλίου'], ['May', 'Μάιος', 'Μαΐου'], ['June', 'Ιούνιος', 'Ιουνίου'],
    ['July', 'Ιούλιος', 'Ιουλίου'], ['August', 'Αύγουστος', 'Αυγούστου'], ['September', 'Σεπτέμβριος', 'Σεπτεμβρίου'], ['October', 'Οκτώβριος', 'Οκτωβρίου'], ['November', 'Νοέμβριος', 'Νοεμβρίου'], ['December', 'Δεκέμβριος', 'Δεκεμβρίου']];
  const DOW = [['Sunday', 'Κυριακή'], ['Monday', 'Δευτέρα'], ['Tuesday', 'Τρίτη'], ['Wednesday', 'Τετάρτη'], ['Thursday', 'Πέμπτη'], ['Friday', 'Παρασκευή'], ['Saturday', 'Σάββατο']];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const val = (v) => (isNum(v) && v >= 0 ? v : null);
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  const ceilTo = (v, step) => Math.max(step, Math.ceil(v / step) * step);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  function median(list) { const a = list.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; }
  const fmt = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1));
  // long date in both languages: 'Sunday 1 January 2023' / 'Κυριακή 1 Ιανουαρίου 2023'
  function dateText(iso) { const y = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10), w = new Date(Date.UTC(y, m, d)).getUTCDay(); return [DOW[w][0] + ' ' + d + ' ' + MONTHS[m][0] + ' ' + y, DOW[w][1] + ' ' + d + ' ' + MONTHS[m][2] + ' ' + y]; }
  const shortDate = (iso) => { if (!iso) return ['none', 'καμία']; const m = +iso.slice(5, 7) - 1, d = +iso.slice(8, 10); return [d + ' ' + MONTHS[m][0] + ' ' + iso.slice(0, 4), d + ' ' + MONTHS[m][2] + ' ' + iso.slice(0, 4)]; };

  function dayLabel(day, ap) {
    const dt = dateText(day.date), who = [ap.name[0] + ' (' + ap.icao + ')', ap.name[1] + ' (' + ap.icao + ')'];
    if (day.missing) return [dt[0] + ', ' + who[0] + ': the source table has no count for this day. This is unknown, not zero.', dt[1] + ', ' + who[1] + ': ο πίνακας της πηγής δεν έχει μέτρηση για αυτή την ημέρα. Είναι άγνωστο, όχι μηδέν.'];
    const a = day.a == null ? ['arrivals not published', 'οι αφίξεις δεν δημοσιεύτηκαν'] : [day.a + (day.a === 1 ? ' international arrival' : ' international arrivals'), day.a + (day.a === 1 ? ' διεθνής άφιξη' : ' διεθνείς αφίξεις')];
    const d = day.d == null ? ['departures not published', 'οι αναχωρήσεις δεν δημοσιεύτηκαν'] : [day.d + (day.d === 1 ? ' international departure' : ' international departures'), day.d + (day.d === 1 ? ' διεθνής αναχώρηση' : ' διεθνείς αναχωρήσεις')];
    return [dt[0] + ', ' + who[0] + ': ' + a[0] + ' and ' + d[0] + ' (tower count for that day).', dt[1] + ', ' + who[1] + ': ' + a[1] + ' και ' + d[1] + ' (μέτρηση του πύργου για εκείνη την ημέρα).'];
  }

  function yearView(ap, year, rec, scaleMax, lastCovered, period) {
    const y = +year, n = Math.round((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5);
    const A = (rec && rec.a) || [], Dp = (rec && rec.d) || [];
    const days = [], months = MONTHS.map((mn, i) => ({ m: i, name: [mn[0], mn[1]], first: -1, days: 0, covered: 0, sumA: 0, sumD: 0 }));
    for (let i = 0; i < n; i++) {
      const t = new Date(Date.UTC(y, 0, 1 + i)), mo = t.getUTCMonth(), dom = t.getUTCDate();
      const a = val(A[i]), d = val(Dp[i]);
      const day = { i, date: y + '-' + p2(mo + 1) + '-' + p2(dom), month: mo, dom, dow: t.getUTCDay(), a, d, missing: a == null && d == null, tA: a == null ? null : a / scaleMax, tD: d == null ? null : d / scaleMax };
      day.label = dayLabel(day, ap); days.push(day);
      const M = months[mo]; if (M.first < 0) M.first = i; M.days++; if (!day.missing) M.covered++; M.sumA += a || 0; M.sumD += d || 0;
    }
    const covered = days.filter((d) => !d.missing), missing = n - covered.length, zeroDays = covered.filter((d) => d.a === 0 && d.d === 0).length;
    const medianA = median(covered.map((d) => d.a)), medianD = median(covered.map((d) => d.d));
    const sumA = sum(months.map((m) => m.sumA)), sumD = sum(months.map((m) => m.sumD));
    const lastInYear = covered.length ? covered[covered.length - 1].date : null;
    const last = shortDate(lastCovered), lastY = shortDate(lastInYear);
    const who = [ap.name[0] + ' (' + ap.icao + ')', ap.name[1] + ' (' + ap.icao + ')'];
    const cov = [covered.length + ' of ' + n + ' days have a count, ' + missing + ' missing.', covered.length + ' από ' + n + ' ημέρες έχουν μέτρηση, ' + missing + ' λείπουν.'];
    const lastText = ['Last covered day in the record: ' + last[0] + '.', 'Τελευταία ημέρα με μέτρηση στο αρχείο: ' + last[1] + '.'];
    const scaleText = ['A full bar is ' + scaleMax + ' movements in one day (scale for this airport only).', 'Μια πλήρης μπάρα είναι ' + scaleMax + ' κινήσεις σε μία ημέρα (κλίμακα μόνο για αυτό το αεροδρόμιο).'];
    const head = [who[0] + ', ' + year + ': ' + cov[0] + ' Last covered day in ' + year + ': ' + lastY[0] + '. ' + lastText[0], who[1] + ', ' + year + ': ' + cov[1] + ' Τελευταία ημέρα με μέτρηση το ' + year + ': ' + lastY[1] + '. ' + lastText[1]];
    const totals = covered.length
      ? ['In ' + year + ' the tower counted ' + sumA + ' international arrivals and ' + sumD + ' international departures on the covered days. Median per covered day: ' + fmt(medianA) + ' arrivals, ' + fmt(medianD) + ' departures.' + (zeroDays ? ' Days with a published count of zero for both: ' + zeroDays + '.' : ''),
        'Το ' + year + ' ο πύργος μέτρησε ' + sumA + ' διεθνείς αφίξεις και ' + sumD + ' διεθνείς αναχωρήσεις στις ημέρες με μέτρηση. Διάμεσος ανά ημέρα με μέτρηση: ' + fmt(medianA) + ' αφίξεις, ' + fmt(medianD) + ' αναχωρήσεις.' + (zeroDays ? ' Ημέρες με δημοσιευμένη μέτρηση μηδέν και στα δύο: ' + zeroDays + '.' : '')]
      : ['No day of ' + year + ' has a count in the record.', 'Καμία ημέρα του ' + year + ' δεν έχει μέτρηση στο αρχείο.'];
    months.forEach((M) => { M.text = M.covered
      ? [M.name[0] + ' ' + year + ': ' + M.sumA + ' international arrivals and ' + M.sumD + ' international departures, ' + M.covered + ' of ' + M.days + ' days covered.', M.name[1] + ' ' + year + ': ' + M.sumA + ' διεθνείς αφίξεις και ' + M.sumD + ' διεθνείς αναχωρήσεις, ' + M.covered + ' από ' + M.days + ' ημέρες με μέτρηση.']
      : [M.name[0] + ' ' + year + ': no day has a count.', M.name[1] + ' ' + year + ': καμία ημέρα δεν έχει μέτρηση.']; });
    return { airport: ap.icao, airportName: ap.name, year: String(year), days, months, scaleMax, scaleText, lastCovered, lastCoveredYear: lastInYear, lastText,
      counts: { days: n, covered: covered.length, missing, zeroDays, sumA, sumD, medianA, medianD, text: cov }, period,
      textRows: [head, totals, scaleText].concat(months.map((M) => M.text)),
      ariaLabel: ['Calendar of daily bars: international arrivals and departures at ' + who[0] + ' in ' + year + ', tower counts, not live. ' + cov[0] + ' ' + lastText[0], 'Ημερολόγιο με ημερήσιες μπάρες: διεθνείς αφίξεις και αναχωρήσεις, ' + who[1] + ', ' + year + ', μετρήσεις του πύργου, όχι ζωντανά. ' + cov[1] + ' ' + lastText[1]] };
  }

  function build(data, opts) {
    opts = opts || {};
    const list = data && Array.isArray(data.airports) ? data.airports.filter((a) => a && a.icao && a.years && Object.keys(a.years).length) : [];
    if (!list.length) return { id: 'flights', available: false, empty: EMPTY, choices: [], years: [], airports: {}, textRows: [EMPTY], ariaLabel: EMPTY };
    const yearIds = []; list.forEach((a) => Object.keys(a.years).forEach((y) => { if (yearIds.indexOf(y) < 0) yearIds.push(y); })); yearIds.sort();
    const airports = {}, choices = [];
    for (const src of list) {
      const ap = { icao: src.icao, name: Array.isArray(src.name) ? src.name : [src.icao, src.icao] };
      let max = 0, last = null, first = null;
      for (const y of Object.keys(src.years).sort()) { const r = src.years[y]; ['a', 'd'].forEach((k) => (r[k] || []).forEach((v, i) => { if (val(v) == null) return; if (v > max) max = v; const t = new Date(Date.UTC(+y, 0, 1 + i)), iso = t.getUTCFullYear() + '-' + p2(t.getUTCMonth() + 1) + '-' + p2(t.getUTCDate()); if (!last || iso > last) last = iso; if (!first || iso < first) first = iso; })); }
      const scaleMax = ceilTo(max, 20), views = {};
      for (const y of Object.keys(src.years).sort()) views[y] = yearView(ap, y, src.years[y], scaleMax, last, { first, last });
      airports[ap.icao] = { icao: ap.icao, name: ap.name, scaleMax, lastCovered: last, firstCovered: first, years: views };
      choices.push({ id: ap.icao, name: ap.name });
    }
    const notes = Array.isArray(data.notes) ? data.notes.filter((n) => Array.isArray(n) && n.length === 2) : [];
    const model = { id: 'flights', available: true, empty: null, live: false, choices, years: yearIds.map((y) => ({ id: y, name: [y, y] })), airports, notes,
      unit: data.unit || ['international aircraft movements per airport day (counts)', 'διεθνείς κινήσεις αεροσκαφών ανά ημέρα αεροδρομίου (πλήθος)'], retrieved: data.retrieved || null, sources: data.sources || [],
      monthNames: MONTHS.map((m) => [m[0], m[1]]),
      strings: { arrivals: ['international arrivals (up)', 'διεθνείς αφίξεις (πάνω)'], departures: ['international departures (down)', 'διεθνείς αναχωρήσεις (κάτω)'], missing: ['no count in the source', 'χωρίς μέτρηση στην πηγή'], zero: ['published zero', 'δημοσιευμένο μηδέν'],
        still: ['tower record, not live', 'αρχείο του πύργου, όχι ζωντανά'], perDay: ['counts per airport day', 'πλήθος ανά ημέρα αεροδρομίου'],
        hint: ['Point at a day, or use the arrow keys (left and right: one day, up and down: one week), to read its two counts.', 'Δείξτε μια ημέρα ή χρησιμοποιήστε τα βελάκια (αριστερά και δεξιά: μία ημέρα, πάνω και κάτω: μία εβδομάδα) για να διαβάσετε τις δύο μετρήσεις της.'],
        source: ['Cyprus Department of Civil Aviation, ATC tower, CC BY 4.0', 'Τμήμα Πολιτικής Αεροπορίας Κύπρου, πύργος ελέγχου, CC BY 4.0'] } };
    const a0 = airports[opts.airport] ? opts.airport : choices[0].id;
    const ys = Object.keys(airports[a0].years); const y0 = airports[a0].years[opts.year] ? String(opts.year) : ys[ys.length - 1];
    return select(model, { airport: a0, year: y0 });
  }
  // select(model, { airport, year }) or select(model, airport, year); an unknown airport or year keeps the current one
  function select(model, sel, year) {
    if (!model || !model.airports) return model;
    if (typeof sel === 'string' || typeof sel === 'number') sel = { airport: sel, year };
    sel = sel || {};
    const aId = sel.airport != null && model.airports[sel.airport] ? String(sel.airport) : model.airport; const ap = model.airports[aId]; if (!ap) return model;
    let yId = sel.year != null && ap.years[sel.year] ? String(sel.year) : model.year; if (!ap.years[yId]) { const ys = Object.keys(ap.years); yId = ys[ys.length - 1]; }
    if (aId === model.airport && yId === model.year) return model;
    const v = ap.years[yId];
    return Object.assign({}, model, v, { textRows: v.textRows.concat(model.notes), ariaLabel: v.ariaLabel });
  }
  return { build, select, median, dateText, EMPTY };
});
