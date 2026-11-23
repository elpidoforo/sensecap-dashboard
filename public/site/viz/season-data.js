/*
  season-data.js: the model for the "season" widget (hotel bedplace occupancy and electricity available to the internal market,
  month by month, on two separate charts).
  Pure: no DOM, no clock, no network. Input is public/site/data/season.json (Eurostat tour_occ_mnor and nrg_cb_em, Cyprus,
  common months only). The only arithmetic is GWh per calendar day = the month's GWh divided by the days of that month; it is
  computed here from the published monthly figure. GWh stays GWh: nothing is converted to MW. A month with no value stays null.
  One selector: model.choices = GWh per month | GWh per calendar day.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.seasonData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The monthly occupancy and electricity table could not be loaded.', 'Ο μηνιαίος πίνακας πληρότητας και ηλεκτρισμού δεν φόρτωσε.'];
  const MONTHS = [['January', 'Ιανουάριος'], ['February', 'Φεβρουάριος'], ['March', 'Μάρτιος'], ['April', 'Απρίλιος'], ['May', 'Μάιος'], ['June', 'Ιούνιος'], ['July', 'Ιούλιος'], ['August', 'Αύγουστος'], ['September', 'Σεπτέμβριος'], ['October', 'Οκτώβριος'], ['November', 'Νοέμβριος'], ['December', 'Δεκέμβριος']];
  const UNITS = [{ id: 'month', name: ['GWh per month', 'GWh τον μήνα'] }, { id: 'day', name: ['GWh per calendar day', 'GWh ανά ημερολογιακή ημέρα'] }];
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const dec = (s) => [String(s), String(s).replace('.', ',')];
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const perDay = (gwh, y, m) => (isNum(gwh) ? gwh / daysIn(y, m) : null);
  const ceilTo = (v, step) => Math.max(step, Math.ceil(v / step) * step);
  const niceMax = (v) => { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 2, 2.5, 3, 4, 5, 6, 7, 8, 10]) if (k * p >= v) return k * p; return 10 * p; };
  const parse = (s) => { const m = /^(\d{4})-(\d{2})$/.exec(String(s)); return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2] } : null; };

  function build(data, opts) {
    opts = opts || {};
    const src = data && Array.isArray(data.months) ? data.months.map(parse) : [];
    if (!src.length || src.some((p) => !p)) return { id: 'season', available: false, empty: EMPTY, choices: [], months: [], textRows: [EMPTY], ariaLabel: EMPTY };
    const at = {}; src.forEach((p, i) => { at[p.y * 12 + p.m - 1] = i; });
    const keys = Object.keys(at).map(Number), k0 = Math.min.apply(null, keys), k1 = Math.max.apply(null, keys);
    const months = [];
    for (let k = k0; k <= k1; k++) {
      const y = Math.floor(k / 12), mo = (k % 12) + 1, i = at[k], inFile = i != null;
      const occ = inFile && isNum(data.occupancy[i]) ? data.occupancy[i] : null, gwh = inFile && isNum(data.electricityGWh[i]) ? data.electricityGWh[i] : null;
      const os = (inFile && data.occupancyStatus && data.occupancyStatus[i]) || '', es = (inFile && data.electricityStatus && data.electricityStatus[i]) || '';
      const days = daysIn(y, mo), pd = perDay(gwh, y, mo), name = [MONTHS[mo - 1][0] + ' ' + y, MONTHS[mo - 1][1] + ' ' + y];
      const fl = (s) => (s ? [' [Eurostat flag ' + s + ']', ' [σήμανση Eurostat ' + s + ']'] : ['', '']);
      const occText = occ == null ? ['occupancy: no value' + fl(os)[0], 'πληρότητα: χωρίς τιμή' + fl(os)[1]] : [dec(occ)[0] + '% of hotel bedplaces occupied' + fl(os)[0], dec(occ)[1] + '% των κλινών ξενοδοχείων κατειλημμένες' + fl(os)[1]];
      const monthText = gwh == null ? ['electricity: no value' + fl(es)[0], 'ηλεκτρισμός: χωρίς τιμή' + fl(es)[1]] : [dec(gwh)[0] + ' GWh in the month (' + days + ' days)' + fl(es)[0], dec(gwh)[1] + ' GWh στον μήνα (' + days + ' ημέρες)' + fl(es)[1]];
      const dayText = gwh == null ? monthText : [dec(pd.toFixed(4))[0] + ' GWh per calendar day (' + dec(gwh)[0] + ' GWh over ' + days + ' days)' + fl(es)[0], dec(pd.toFixed(4))[1] + ' GWh ανά ημερολογιακή ημέρα (' + dec(gwh)[1] + ' GWh σε ' + days + ' ημέρες)' + fl(es)[1]];
      const both = gwh == null ? monthText : [dec(gwh)[0] + ' GWh available to the internal market in the month, ' + dec(pd.toFixed(4))[0] + ' GWh per calendar day (' + days + ' days)' + fl(es)[0], dec(gwh)[1] + ' GWh διαθέσιμες στην εσωτερική αγορά στον μήνα, ' + dec(pd.toFixed(4))[1] + ' GWh ανά ημερολογιακή ημέρα (' + days + ' ημέρες)' + fl(es)[1]];
      const gap = inFile ? ['', ''] : [' This month is not in the table.', ' Αυτός ο μήνας δεν υπάρχει στον πίνακα.'];
      months.push({ ym: y + '-' + (mo < 10 ? '0' : '') + mo, year: y, month: mo, days, inFile, occ, occStatus: os, gwh, gwhStatus: es, perDay: pd, name, occText, monthText, dayText,
        label: [name[0] + ': ' + occText[0] + '; ' + both[0] + '.' + gap[0], name[1] + ': ' + occText[1] + '· ' + both[1] + '.' + gap[1]] });
    }
    const n = (f) => months.filter(f).length, maxOf = (f) => months.reduce((m, x) => (f(x) != null && f(x) > m ? f(x) : m), 0);
    const first = months[0], last = months[months.length - 1];
    const c = { months: months.length, common: n((x) => x.occ != null && x.gwh != null), missingOcc: n((x) => x.occ == null), missingElec: n((x) => x.gwh == null), flaggedOcc: n((x) => x.occStatus), flaggedElec: n((x) => x.gwhStatus) };
    c.text = [c.common + ' months with both values, ' + first.name[0] + ' to ' + last.name[0] + '. Months without a value: ' + c.missingOcc + ' occupancy, ' + c.missingElec + ' electricity. Months with a Eurostat status flag: ' + c.flaggedOcc + ' occupancy, ' + c.flaggedElec + ' electricity.',
      c.common + ' μήνες με τις δύο τιμές, ' + first.name[1] + ' έως ' + last.name[1] + '. Μήνες χωρίς τιμή: ' + c.missingOcc + ' πληρότητα, ' + c.missingElec + ' ηλεκτρισμός. Μήνες με σήμανση κατάστασης της Eurostat: ' + c.flaggedOcc + ' πληρότητα, ' + c.flaggedElec + ' ηλεκτρισμός.'];
    c.flagText = [c.flaggedOcc + c.flaggedElec === 0 ? 'Eurostat status flags: none in these months' : 'Eurostat status flags are written above the point', c.flaggedOcc + c.flaggedElec === 0 ? 'Σημάνσεις κατάστασης Eurostat: καμία σε αυτούς τους μήνες' : 'Οι σημάνσεις κατάστασης της Eurostat γράφονται πάνω από το σημείο'];
    const ticks = (max, d) => [0, 0.5, 1].map((t) => ({ v: max * t, text: dec(+(max * t).toFixed(d)) }));
    const oMax = Math.max(100, ceilTo(maxOf((x) => x.occ), 10)), mMax = niceMax(maxOf((x) => x.gwh)), dMax = niceMax(maxOf((x) => x.perDay));
    const scales = { occ: { min: 0, max: oMax, ticks: [0, 50, 100].map((v) => ({ v, text: [v + '%', v + '%'] })), full: 100 }, month: { min: 0, max: mMax, ticks: ticks(mMax, 1) }, day: { min: 0, max: dMax, ticks: ticks(dMax, 2) } };
    const notes = (data.notes || []).map((p) => [String(p[0]), String(p[1])]);
    const model = { id: 'season', available: true, empty: null, live: false, period: [first.ym, last.ym], retrieved: data.retrieved || null, choices: UNITS, months, counts: c, scales, notes,
      yearTicks: months.map((x, i) => ({ i, year: x.year, jan: x.month === 1 })).filter((t) => t.jan || t.i === 0).map((t) => ({ i: t.i, year: t.year })),
      strings: {
        still: ['Eurostat, monthly figures ' + first.name[0] + ' to ' + last.name[0] + ', not live', 'Eurostat, μηνιαία στοιχεία ' + first.name[1] + ' έως ' + last.name[1] + ', όχι ζωντανά'],
        occTitle: ['Hotel bedplaces occupied, % (own scale)', 'Κατειλημμένες κλίνες ξενοδοχείων, % (δική του κλίμακα)'],
        elecTitle: { month: ['Electricity available to the internal market, GWh per month (own scale)', 'Ηλεκτρισμός διαθέσιμος στην εσωτερική αγορά, GWh τον μήνα (δική του κλίμακα)'], day: ['Electricity available to the internal market, GWh per calendar day (own scale)', 'Ηλεκτρισμός διαθέσιμος στην εσωτερική αγορά, GWh ανά ημερολογιακή ημέρα (δική του κλίμακα)'] },
        noCause: notes[0] || ['The two charts do not show that one causes the other.', 'Τα δύο γραφήματα δεν δείχνουν ότι το ένα προκαλεί το άλλο.'],
        noValue: ['no value', 'χωρίς τιμή'],
        hint: ['Point at a month, or use the arrow keys (up and down jump one year), to read it on both charts.', 'Δείξτε έναν μήνα ή χρησιμοποιήστε τα βελάκια (πάνω και κάτω για έναν χρόνο) για να τον διαβάσετε και στα δύο γραφήματα.'],
      } };
    return select(model, opts.unit === 'day' ? 'day' : 'month');
  }

  // select(model, 'month' | 'day') or select(model, { unit }): which electricity figure the lower chart draws. Unknown keeps the current one.
  function select(model, sel) {
    if (!model || !model.available) return model;
    const unit = sel && typeof sel === 'object' ? sel.unit : sel;
    if ((unit !== 'month' && unit !== 'day') || unit === model.unit) return model;
    const u = UNITS[unit === 'day' ? 1 : 0], first = model.months[0], last = model.months[model.months.length - 1];
    const head = ['Two separate charts, ' + first.name[0] + ' to ' + last.name[0] + ': share of hotel bedplaces occupied (%), and electricity available to the internal market (' + u.name[0] + '). ' + model.counts.text[0], 'Δύο χωριστά γραφήματα, ' + first.name[1] + ' έως ' + last.name[1] + ': ποσοστό κατειλημμένων κλινών ξενοδοχείων (%) και ηλεκτρισμός διαθέσιμος στην εσωτερική αγορά (' + u.name[1] + '). ' + model.counts.text[1]];
    return Object.assign({}, model, { unit, unitName: u.name, elecScale: model.scales[unit], elecTitle: model.strings.elecTitle[unit],
      textRows: [head].concat(model.months.map((x) => x.label), model.notes), ariaLabel: [head[0] + ' ' + model.strings.noCause[0], head[1] + ' ' + model.strings.noCause[1]] });
  }
  return { build, select, perDay, daysIn, EMPTY, UNITS };
});
