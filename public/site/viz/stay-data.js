/*
  stay-data.js: the model for the "stay" widget (tourists by place of stay, one reporting location at a time).
  Pure: no DOM, no clock, no network. Input is public/site/data/stay.json (CYSTAT table 2022062E, yearly 2017 to 2025, CC BY 4.0).
  The table gives, for each accommodation type and year, the total number of tourists (all locations) and a share (%) for each
  reporting location. Shares are the published one-decimal figures; nothing is recomputed from them and no count per location is
  derived. A cell that carries the publisher's marker (u or ...) stays null with its marker, never 0.
  Two selectors: model.choices (accommodation types) and model.locations (reporting locations), both in the source's own order.
  Nothing is ranked or sorted by value.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.stayData = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = ['The place-of-stay table could not be loaded.', 'Ο πίνακας για τον τόπο διαμονής δεν φόρτωσε.'];
  const BREAKS = {
    2023: ['Series break: Pafos and Polis are one combined category through 2023 and two separate categories from 2024.', 'Διακοπή σειράς: η Πάφος και η Πόλις είναι μία ενιαία κατηγορία έως το 2023 και δύο χωριστές κατηγορίες από το 2024.'],
    2019: ['Series break: hill resorts are their own category through 2019 and are counted with other locations from 2021.', 'Διακοπή σειράς: τα ορεινά θέρετρα είναι δική τους κατηγορία έως το 2019 και μετρούν μαζί με τις άλλες τοποθεσίες από το 2021.'],
  };
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const pairOf = (p) => (Array.isArray(p) ? [String(p[0]), String(p[1] == null ? p[0] : p[1])] : [String(p), String(p)]);
  const strip = (s) => s.replace(/\s*\(%\)\s*$/, '').replace(/\s{2,}/g, ' ');
  // whole numbers with thousands separators: 4,534,073 in English, 4.534.073 in Greek
  const int = (n) => { const s = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return [s, s.replace(/,/g, '.')]; };
  // a published decimal, written as published (English point, Greek comma)
  const dec = (v) => { const s = String(v); return [s, s.replace('.', ',')]; };
  const niceMax = (v) => { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p; return 10 * p; };
  const ceilTo = (v, step) => Math.max(step, Math.ceil(v / step) * step);
  function axisCount(max) {
    const mil = max >= 1e6, div = mil ? 1e6 : max >= 1e3 ? 1e3 : 1, u = mil ? ['M', ' εκ.'] : max >= 1e3 ? ['k', ' χιλ.'] : ['', ''];
    return [0, 0.5, 1].map((t) => { const s = dec(Math.round((max * t / div) * 100) / 100); return { v: max * t, text: t === 0 ? ['0', '0'] : [s[0] + u[0], s[1] + u[1]] }; });
  }

  function build(data, opts) {
    opts = opts || {};
    const bad = !data || !Array.isArray(data.types) || !data.types.length || !Array.isArray(data.locations) || !data.locations.length || !Array.isArray(data.years) || !data.years.length;
    if (bad) return { id: 'stay', available: false, empty: EMPTY, choices: [], locations: [], points: [], textRows: [EMPTY], ariaLabel: EMPTY };
    const choices = data.types.map((t, i) => ({ id: String(i), name: pairOf(t.name).map(strip) }));
    const locations = data.locations.map((l, i) => ({ id: String(i), name: pairOf(l.name).map(strip), source: pairOf(l.name)[0], breakAfter: isNum(l.breakAfter) ? l.breakAfter : null }));
    const notes = (data.notes || []).map(pairOf);
    const markers = {}; Object.keys(data.markers || {}).forEach((k) => { markers[k] = pairOf(data.markers[k]); });
    const y0 = data.years[0], y1 = data.years[data.years.length - 1];
    const model = { id: 'stay', available: true, empty: null, live: false, period: [y0, y1], years: data.years.slice(), retrieved: data.retrieved || null, choices, locations, notes, markers, _d: data,
      strings: {
        still: ['CYSTAT survey, yearly figures ' + y0 + ' to ' + y1 + ', not live', 'Έρευνα CYSTAT, ετήσια στοιχεία ' + y0 + ' έως ' + y1 + ', όχι ζωντανά'],
        shareAxis: ['Share of tourists, % (own scale)', 'Ποσοστό τουριστών, % (δική του κλίμακα)'],
        totalAxis: ['Tourists in this accommodation type, all locations, number (own scale)', 'Τουρίστες σε αυτό το είδος καταλύματος, όλες οι τοποθεσίες, αριθμός (δική του κλίμακα)'],
        accommodation: ['Accommodation', 'Κατάλυμα'], brk: ['series break', 'διακοπή σειράς'],
        markerKey: ['u and ... are the publisher\'s markers: no figure, not zero', 'u και ... είναι σημάνσεις του εκδότη: χωρίς αριθμό, όχι μηδέν'],
        hint: ['Point at a year, or use the left and right arrow keys, to read the share and the total together.', 'Δείξτε ένα έτος ή χρησιμοποιήστε τα βελάκια αριστερά και δεξιά για να διαβάσετε μαζί το ποσοστό και το σύνολο.'],
      } };
    Object.defineProperty(model, '_d', { enumerable: false });
    return select(model, { type: opts.type == null ? '0' : opts.type, location: opts.location == null ? '0' : opts.location });
  }

  // select(model, { type, location }): ids are the strings in model.choices[].id and model.locations[].id. An unknown id keeps the current one.
  function select(model, sel) {
    if (!model || !model.available) return model;
    sel = sel || {};
    const d = model._d, has = (list, id) => id != null && list.some((c) => c.id === String(id));
    const ti = has(model.choices, sel.type) ? String(sel.type) : model.type, li = has(model.locations, sel.location) ? String(sel.location) : model.location;
    if (ti == null || li == null) return model;
    if (ti === model.type && li === model.location) return model;
    const T = d.types[+ti], L = model.locations[+li], tn = model.choices[+ti].name, ln = L.name;
    const points = model.years.map((year, i) => {
      const sv = T.share && T.share[+li] ? T.share[+li][i] : null, sm = (T.marker && T.marker[+li] && T.marker[+li][i]) || '';
      const tv = T.total ? T.total[i] : null, tm = (T.totalMarker && T.totalMarker[i]) || '';
      const share = isNum(sv) ? sv : null, total = isNum(tv) ? tv : null;
      const mk = (m) => (m ? 'publisher marker ' + m : 'not published'), mkEl = (m) => (m ? 'σήμανση εκδότη ' + m : 'δεν δημοσιεύτηκε');
      const st = share == null ? ['no share, ' + mk(sm), 'χωρίς ποσοστό, ' + mkEl(sm)] : dec(share).map((s) => s + '%');
      const tt = total == null ? ['total number: ' + mk(tm), 'συνολικός αριθμός: ' + mkEl(tm)] : [int(total)[0] + ' tourists', int(total)[1] + ' τουρίστες'];
      const join = share != null && total != null ? [' of ', ' από '] : ['; ', '· '];
      return { year, share, marker: share == null ? sm : '', total, totalMarker: total == null ? tm : '', shareText: st, totalText: tt,
        label: [year + ', ' + ln[0] + ': ' + st[0] + join[0] + tt[0] + ' (accommodation: ' + tn[0] + ').', year + ', ' + ln[1] + ': ' + st[1] + join[1] + tt[1] + ' (κατάλυμα: ' + tn[1] + ').'] };
    });
    const maxS = points.reduce((m, p) => (p.share != null && p.share > m ? p.share : m), 0), maxT = points.reduce((m, p) => (p.total != null && p.total > m ? p.total : m), 0);
    const sMax = ceilTo(maxS, 5), tMax = niceMax(maxT);
    const scales = { share: { min: 0, max: sMax, ticks: [0, 0.5, 1].map((t) => ({ v: sMax * t, text: dec(sMax * t).map((s) => s + '%') })) }, total: { min: 0, max: tMax, ticks: axisCount(tMax) } };
    const breaks = L.breakAfter != null && model.years.indexOf(L.breakAfter) >= 0 && model.years.indexOf(L.breakAfter) < model.years.length - 1
      ? [{ after: L.breakAfter, index: model.years.indexOf(L.breakAfter), text: BREAKS[L.breakAfter] || ['Series break: the category changes after ' + L.breakAfter + '.', 'Διακοπή σειράς: η κατηγορία αλλάζει μετά το ' + L.breakAfter + '.'] }] : [];
    const withShare = points.filter((p) => p.share != null).length, marked = {};
    points.forEach((p) => { if (p.share == null) { const k = p.marker || 'none'; marked[k] = (marked[k] || 0) + 1; } });
    const mt = Object.keys(marked).map((k) => marked[k] + ' × ' + (k === 'none' ? '?' : k)).join(', ');
    const count = [withShare + ' of ' + points.length + ' years have a published share' + (mt ? '; without a figure: ' + mt : '') + '.', withShare + ' από ' + points.length + ' έτη έχουν δημοσιευμένο ποσοστό' + (mt ? '· χωρίς αριθμό: ' + mt : '') + '.'];
    const head = [ln[0] + ', accommodation ' + tn[0] + ', ' + model.period[0] + ' to ' + model.period[1] + '. ' + count[0], ln[1] + ', κατάλυμα ' + tn[1] + ', ' + model.period[0] + ' έως ' + model.period[1] + '. ' + count[1]];
    const ariaLabel = ['Share of tourists who said they stayed in the reporting location ' + head[0] + ' A second panel with its own scale shows the total number of tourists for this accommodation type.', 'Ποσοστό τουριστών που είπαν ότι έμειναν στην τοποθεσία αναφοράς ' + head[1] + ' Ένα δεύτερο πλαίσιο με δική του κλίμακα δείχνει τον συνολικό αριθμό τουριστών για αυτό το είδος καταλύματος.'];
    const usedMarkers = Object.keys(model.markers).filter((k) => points.some((p) => p.marker === k || p.totalMarker === k)).map((k) => model.markers[k]);
    const textRows = [head].concat(points.map((p) => p.label), breaks.map((b) => b.text), usedMarkers, model.notes);
    const out = Object.assign({}, model, { type: ti, location: li, typeName: tn, locationName: ln, points, scales, breaks, counts: { years: points.length, withShare, marked, text: count }, textRows, ariaLabel });
    Object.defineProperty(out, '_d', { value: d, enumerable: false });
    return out;
  }
  return { build, select, int, dec, niceMax, EMPTY, BREAKS };
});
