/*
  Counter data (pure, tested by tests/viz/counter_test.js). Builds the model of the "big number with a small line beside it" panel
  from the answer of /api/stack/permits. Every number and every sentence on screen is made here, never in the drawing code.

  What is shown: ONE district at a time. The big number is the building permits of the selected month; the line is that district's
  last 36 months (WINDOW); the second line of text is the same month one year earlier and the plain difference (value minus the
  earlier value: "more" or "fewer", nothing else). Districts are never added, ranked or put side by side: the model holds one
  ready-made view per district so the widget can switch between them without doing any arithmetic, and draws only one.

  Missing: a month with no value, or a value CYSTAT marks N.A. (null or text), is missing (v = null), never 0. A real 0 is a figure.
  The year-earlier month is found by its label in the whole series (not only in the 36), so a month absent from the list is
  "no earlier month", never a guess.

  The annotation (July 2024 in the real answer): as in wave-data.js, a month on or after the annotated month whose year-earlier
  month lies before it is NOT comparable. For those months the earlier figure is still shown, but no difference is given
  (diff = null, reason 'notcomparable') and the sentence points to the note, whose text comes from the answer.

  model = { id, n:[en,el], unit:[en,el], windowSize, months:[..], choices:[{code,name:[en,el]}], district, month, index,
            views:{ <code>: { code, name, points:[{ i, m, label, v, missing, valueText, caption, prev, prevM, prevLabel, diff,
                    comparable, reason, second, aria }], max, maxText, defaultIndex, hasValues, textRows, ariaLabel } },
            mark:{ month, label, index, text, url }|null, strings:{..pairs..}, empty:[en,el]|null, textRows, ariaLabel, aria,
            asOf, source, sourceUrl }
  Browser: window.SC.viz.counterData; Node: module.exports.
*/
(function (root) {
  'use strict';
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];
  const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const WINDOW = 36;

  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const monthLabel = (m) => { const r = MONTH_RE.exec(String(m)); return r ? [MON_EN[+r[2] - 1] + ' ' + r[1], MON_EL[+r[2] - 1] + ' ' + r[1]] : [String(m), String(m)]; };
  const yearBefore = (m) => { const r = MONTH_RE.exec(m); return r ? (+r[1] - 1) + '-' + r[2] : null; };
  const pairOf = (x) => (Array.isArray(x) && x.length >= 2 ? [String(x[0]), String(x[1])] : [String(x == null ? '' : x), String(x == null ? '' : x)]);
  // a number as text: thousands grouped the English way and the Greek way
  function fmt(n) {
    if (!isNum(n)) return ['–', '–'];
    const neg = n < 0, parts = String(Math.abs(n)).split('.'), g = (sep) => parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return [(neg ? '-' : '') + g(',') + (parts[1] ? '.' + parts[1] : ''), (neg ? '-' : '') + g('.') + (parts[1] ? ',' + parts[1] : '')];
  }

  const S = {
    what: ['building permits', 'άδειες οικοδομής'],
    noFigure: ['no figure published', 'δεν δημοσιεύτηκε τιμή'],
    dash: ['–', '–'],
    spark: (n) => (n === 1 ? ['the last month', 'ο τελευταίος μήνας'] : ['last ' + n + ' months', 'τελευταίοι ' + n + ' μήνες']),
    hint: ['Move along the line to read a month, click to keep it. Keys: Left, Right, Home, End.', 'Κινήσου πάνω στη γραμμή για να διαβάσεις έναν μήνα, κάνε κλικ για να τον κρατήσεις. Πλήκτρα: Αριστερά, Δεξιά, Home, End.'],
    hintShort: ['Slide along the line to change month.', 'Σύρε πάνω στη γραμμή για να αλλάξεις μήνα.'],
    pinned: ['selected month', 'επιλεγμένος μήνας'],
    gapMark: ['no figure', 'χωρίς τιμή'],
    note: ['Note', 'Σημείωση'],
    district: ['District', 'Επαρχία'],
    oneAtATime: ['One district at a time. Districts are not added together or compared here.', 'Μία επαρχία κάθε φορά. Οι επαρχίες δεν προστίθενται ούτε συγκρίνονται εδώ.'],
  };
  const EMPTY = ['No monthly permit figures are available to show.', 'Δεν υπάρχουν μηνιαίες τιμές αδειών για να εμφανιστούν.'];

  // ---- one month of one district --------------------------------------------------------------------------------------
  // at: Map month -> index in the whole series; ann: annotated month ('YYYY-MM') or null
  function point(i, m, values, at, ann, name) {
    const idx = at.get(m), v = isNum(values[idx]) ? values[idx] : null, lab = monthLabel(m);
    const pm = yearBefore(m), pi = at.has(pm) ? at.get(pm) : -1, prev = pi >= 0 && isNum(values[pi]) ? values[pi] : null, pl = monthLabel(pm);
    let reason = null;
    if (v === null) reason = 'value';
    else if (pi < 0) reason = 'noearlier';
    else if (prev === null) reason = 'earlier';
    else if (ann && m >= ann && pm < ann) reason = 'notcomparable';
    const comparable = reason === null, diff = comparable ? v - prev : null;
    const vt = v === null ? S.dash : fmt(v), pt = prev === null ? null : fmt(prev), al = ann ? monthLabel(ann) : null;
    const caption = [S.what[0] + ', ' + name[0] + ', ' + lab[0] + (v === null ? ': ' + S.noFigure[0] : ''), S.what[1] + ', ' + name[1] + ', ' + lab[1] + (v === null ? ': ' + S.noFigure[1] : '')];
    let second;
    if (reason === 'value') second = pt ? [pl[0] + ': ' + pt[0] + '. Nothing to compare it with: this month has no figure.', pl[1] + ': ' + pt[1] + '. Δεν γίνεται σύγκριση: αυτός ο μήνας δεν έχει τιμή.'] : ['No figure published for this month, so there is nothing to compare.', 'Δεν δημοσιεύτηκε τιμή για αυτόν τον μήνα, άρα δεν γίνεται σύγκριση.'];
    else if (reason === 'noearlier') second = ['The series has no same month a year earlier.', 'Η σειρά δεν έχει τον ίδιο μήνα της προηγούμενης χρονιάς.'];
    else if (reason === 'earlier') second = [pl[0] + ': ' + S.noFigure[0] + ', so no difference.', pl[1] + ': ' + S.noFigure[1] + ', άρα δεν υπάρχει διαφορά.'];
    else if (reason === 'notcomparable') second = [pl[0] + ': ' + pt[0] + '. Not directly comparable: see the note for ' + al[0] + '.', pl[1] + ': ' + pt[1] + '. Δεν συγκρίνονται άμεσα: δες τη σημείωση για ' + al[1] + '.'];
    else if (diff === 0) second = [pl[0] + ': ' + pt[0] + '. The same number as a year earlier.', pl[1] + ': ' + pt[1] + '. Ίδιος αριθμός με ένα χρόνο πριν.'];
    else {
      const a = fmt(Math.abs(diff)), one = Math.abs(diff) === 1;
      second = diff > 0 ? [pl[0] + ': ' + pt[0] + '. ' + a[0] + ' more than a year earlier.', pl[1] + ': ' + pt[1] + '. ' + a[1] + (one ? ' περισσότερη' : ' περισσότερες') + ' από ένα χρόνο πριν.']
        : [pl[0] + ': ' + pt[0] + '. ' + a[0] + ' fewer than a year earlier.', pl[1] + ': ' + pt[1] + '. ' + a[1] + (one ? ' λιγότερη' : ' λιγότερες') + ' από ένα χρόνο πριν.'];
    }
    const head = v === null ? [name[0] + ', ' + lab[0] + ': ' + S.noFigure[0] + '.', name[1] + ', ' + lab[1] + ': ' + S.noFigure[1] + '.']
      : [name[0] + ', ' + lab[0] + ': ' + vt[0] + ' ' + S.what[0] + '.', name[1] + ', ' + lab[1] + ': ' + vt[1] + ' ' + S.what[1] + '.'];
    const aria = [head[0] + ' ' + second[0], head[1] + ' ' + second[1]];
    return { i, m, label: lab, v, missing: v === null, valueText: vt, caption, prev, prevM: pi >= 0 ? pm : null, prevLabel: pi >= 0 ? pl : null, diff, comparable, reason, second, aria };
  }

  // ---- one district ---------------------------------------------------------------------------------------------------
  function view(series, months, win, at, mark, extraRows) {
    const name = pairOf(series.name), ann = mark ? mark.month : null;
    const points = win.map((m, i) => point(i, m, series.values, at, ann, name));
    let max = 0, defaultIndex = -1;
    points.forEach((p) => { if (!p.missing) { if (p.v > max) max = p.v; defaultIndex = p.i; } });
    const hasValues = defaultIndex >= 0; if (!hasValues) defaultIndex = points.length - 1;
    const f = points[0].label, l = points[points.length - 1].label, n = points.length;
    const ariaLabel = [S.what[0].charAt(0).toUpperCase() + S.what[0].slice(1) + ' per month, ' + name[0] + ', ' + (n === 1 ? f[0] : f[0] + ' to ' + l[0]) + ': one large number for the selected month and a line of ' + (n === 1 ? '1 month' : n + ' months') + '. ' + S.oneAtATime[0],
      'Άδειες οικοδομής ανά μήνα, ' + name[1] + ', ' + (n === 1 ? f[1] : f[1] + ' έως ' + l[1]) + ': ένας μεγάλος αριθμός για τον επιλεγμένο μήνα και μια γραμμή ' + (n === 1 ? '1 μήνα' : n + ' μηνών') + '. ' + S.oneAtATime[1]];
    const textRows = points.slice().reverse().map((p) => p.aria).concat(extraRows);
    return { code: String(series.code), name, points, max, maxText: fmt(max), defaultIndex, hasValues, textRows, ariaLabel };
  }

  // ---- model ----------------------------------------------------------------------------------------------------------
  function build(answer, opts) {
    opts = opts || {};
    const a = answer || {}, months = Array.isArray(a.months) ? a.months.map(String) : [];
    const okMonths = months.length > 0 && months.every((m) => MONTH_RE.test(m));
    const list = (Array.isArray(a.permitsByMonth) ? a.permitsByMonth : []).filter((s) => s && Array.isArray(s.values) && s.values.length === months.length && s.code != null);
    const base = { id: 'counter', n: ['Building permits in one month', 'Άδειες οικοδομής σε έναν μήνα'], unit: S.what, windowSize: WINDOW,
      asOf: a.period || (months.length ? months[months.length - 1] : null), source: a.source ? pairOf(a.source) : null, sourceUrl: a.sourceUrl || null,
      strings: { what: S.what, noFigure: S.noFigure, dash: S.dash, hint: S.hint, hintShort: S.hintShort, pinned: S.pinned, gapMark: S.gapMark, note: S.note, district: S.district, oneAtATime: S.oneAtATime, spark: S.spark(0) } };
    if (!okMonths || !list.length) {
      return Object.assign(base, { months: [], choices: [], district: null, month: null, index: -1, views: {}, mark: null, empty: EMPTY, textRows: [EMPTY], ariaLabel: EMPTY, aria: EMPTY });
    }
    const at = new Map(); months.forEach((m, i) => at.set(m, i));
    const win = months.slice(-WINDOW);
    let mark = null;
    if (a.annotation && MONTH_RE.test(String(a.annotation.month)) && at.has(String(a.annotation.month))) {
      const am = String(a.annotation.month);
      mark = { month: am, label: monthLabel(am), index: win.indexOf(am), text: pairOf(a.annotation.text), url: a.annotation.url || null };
    }
    const extra = [];
    if (mark) extra.push([S.note[0] + ', ' + mark.label[0] + ': ' + mark.text[0], S.note[1] + ', ' + mark.label[1] + ': ' + mark.text[1]]);
    if (base.source) extra.push(['Source: ' + base.source[0] + '.', 'Πηγή: ' + base.source[1] + '.']);
    extra.push(S.oneAtATime);
    const choices = list.map((s) => ({ code: String(s.code), name: pairOf(s.name) })), views = {};
    for (const s of list) views[String(s.code)] = view(s, months, win, at, mark, extra);
    const district = opts.district != null && views[String(opts.district)] ? String(opts.district) : choices[0].code;
    const v = views[district], wi = opts.month != null ? win.indexOf(String(opts.month)) : -1, index = wi >= 0 ? wi : v.defaultIndex;
    base.strings.spark = S.spark(win.length);
    return Object.assign(base, { months: win, choices, district, month: win[index], index, views, mark, empty: null, textRows: v.textRows, ariaLabel: v.ariaLabel, aria: v.ariaLabel });
  }

  const api = { build, point, fmt, monthLabel, WINDOW };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.counterData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
