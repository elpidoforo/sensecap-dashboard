/*
  Before and after. Route: #/beforeafter
  Pick a city, a measurement and the date and time of an action (a car-free morning, a new rule, a tree planting ...). The page takes
  the same stretch of time before and after that moment from SAVED data and compares them:
    - the Data archive when it holds enough: the Met Office station nearest to the city (within 45 km), GET /api/cydom/history?station=&hours=720
      { keys, units, rows: [[t, v...]] } (the station list and places come from GET /api/cydom);
    - else the saved day: GET /layers/api/replay { times, cities: { id: { air, wind, own } } } (at most 26 hours, city-level numbers).
  It shows both averages, how much the number moves from one block of time to the next anyway (the normal spread), and says in words
  when the difference is smaller than that spread: "you cannot tell from this". It always warns that the weather is another
  explanation and never says the action caused anything. Nothing is typed by the student except a date; nothing is saved.
  The sums live in compare() below (also on SC.pages.beforeafter._t for the tests).
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/toolkit-b3.css');
  const lib = () => (SC.tk3 ? Promise.resolve(SC.tk3) : (SC.tk3p = SC.tk3p || new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/site/pages/toolkit-b3-lib.js'; s.onload = () => (SC.tk3 ? ok(SC.tk3) : no(new Error('helpers'))); s.onerror = () => { SC.tk3p = null; no(new Error(T('A part of this page could not be loaded.', 'Ένα μέρος της σελίδας δεν φορτώθηκε.'))); }; document.head.append(s); })));

  const HOUR = 3600000, DAY = 86400000, MAX_KM = 45;
  const WINDOWS = [
    { id: '3h', span: 3 * HOUR, unit: HOUR, n: ['3 hours', '3 ώρες'] }, { id: '6h', span: 6 * HOUR, unit: HOUR, n: ['6 hours', '6 ώρες'] }, { id: '12h', span: 12 * HOUR, unit: HOUR, n: ['12 hours', '12 ώρες'] },
    { id: '3d', span: 3 * DAY, unit: DAY, n: ['3 days', '3 μέρες'] }, { id: '7d', span: 7 * DAY, unit: DAY, n: ['7 days', '7 μέρες'] }, { id: '14d', span: 14 * DAY, unit: DAY, n: ['14 days', '14 μέρες'] },
  ];
  // measurement: the key in the archive (first one the station has) and in the saved day
  const MEAS = [
    { id: 'temp', n: ['Outdoor air temperature', 'Θερμοκρασία αέρα έξω'], arch: ['temp'], day: 'air' },
    { id: 'hum', n: ['Outdoor humidity', 'Υγρασία έξω'], arch: ['hum'], day: null },
    { id: 'wind', n: ['Wind speed', 'Ταχύτητα ανέμου'], arch: ['ws10', 'ws2'], day: 'wind' },
    { id: 'own', n: ['Our own sensors (saved day only)', 'Οι δικοί μας αισθητήρες (μόνο η αποθηκευμένη μέρα)'], arch: [], day: 'own' },
  ];
  const OWN = { 'sensecap-classrooms': ['our classroom sensors (indoors)', 'οι αισθητήρες των τάξεών μας (εσωτερικός χώρος)'], 'sensecap-buses': ['the sensors on our school buses', 'οι αισθητήρες στα σχολικά μας λεωφορεία'], 'sensecap-cars': ['the sensors on our school cars', 'οι αισθητήρες στα σχολικά μας αυτοκίνητα'],
    'cydom-stations': ['official Met Office station', 'επίσημος σταθμός της Μετεωρολογικής Υπηρεσίας'], 'metar-airports': ['airport weather report', 'μετεωρολογική αναφορά αεροδρομίου'], 'openmeteo-weather': ['weather model (not a measurement)', 'μοντέλο καιρού (δεν είναι μέτρηση)'] };
  const VARS = { co2: ['CO₂', 'CO₂'], temperature: ['temperature', 'θερμοκρασία'], wind_speed: ['wind speed', 'ταχύτητα ανέμου'] };

  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

  /* points: [[t, v]] oldest first. Blocks of `unit` are counted away from t0 on both sides. A block counts when it has at least half of the
     readings a full block would have (worked out from how often this source usually saves). A side is usable with 60 % of its blocks. */
  function compare(points, t0, span, unit) {
    const pts = points.filter((p) => p && isFinite(p[0]) && isFinite(p[1]));
    const gaps = []; for (let i = 1; i < pts.length; i++) gaps.push(pts[i][0] - pts[i - 1][0]);
    const step = Math.max(60000, median(gaps) || unit);
    const need = Math.max(1, Math.floor((unit / step) * 0.5));
    const blocks = Math.round(span / unit);
    const side = (dir) => {
      const units = [];
      for (let k = 0; k < blocks; k++) {
        const a = dir < 0 ? t0 - (k + 1) * unit : t0 + k * unit, b = a + unit;
        const vals = pts.filter((p) => p[0] >= a && p[0] < b).map((p) => p[1]);
        if (vals.length >= need) units.push({ t: a, mean: mean(vals), n: vals.length });
      }
      units.sort((x, y) => x.t - y.t);
      const ms = units.map((u) => u.mean);
      return { from: dir < 0 ? t0 - span : t0, to: dir < 0 ? t0 : t0 + span, expected: blocks, units, n: units.reduce((s, u) => s + u.n, 0), ok: units.length >= Math.ceil(blocks * 0.6), mean: ms.length ? mean(ms) : null, sd: sd(ms) };
    };
    const before = side(-1), after = side(1);
    const out = { before, after, ok: before.ok && after.ok, diff: null, spread: null, verdict: 'nodata', step };
    if (!out.ok) return out;
    out.diff = after.mean - before.mean;
    if (before.units.length < 3 || after.units.length < 3 || before.sd == null || after.sd == null) { out.verdict = 'few'; return out; }
    out.spread = Math.sqrt((before.sd ** 2 + after.sd ** 2) / 2);
    out.verdict = Math.abs(out.diff) <= out.spread ? 'within' : 'beyond';
    return out;
  }

  const pad = (x) => String(x).padStart(2, '0');
  const toLocalInput = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fromLocalInput = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };

  function render(root) {
    let alive = true, K = null;
    const S = { city: 'larnaka', meas: 'temp', win: null, t0: null, touched: false };
    const D = { stations: null, stationErr: null, arch: new Map(), replay: null, replayErr: null };
    root.append(SC.head({
      title: T('Before and after', 'Πριν και μετά'),
      lede: T('Did something change after an action? Pick a city, a measurement and the moment of the action. We compare the same stretch of time before and after, from saved data, and tell you honestly whether the difference is big enough to notice.',
        'Άλλαξε κάτι μετά από μια δράση; Διάλεξε πόλη, μέτρηση και τη στιγμή της δράσης. Συγκρίνουμε το ίδιο χρονικό διάστημα πριν και μετά, από αποθηκευμένα δεδομένα, και σου λέμε ειλικρινά αν η διαφορά είναι αρκετά μεγάλη για να φανεί.'),
      help: ['The page cuts the time before and after your moment into equal blocks (hours or days) and takes the average of each block. Numbers like temperature move from block to block anyway: that is the normal spread. If the difference between before and after is smaller than the normal spread, you cannot tell it apart from an ordinary change. Even a big difference does not prove your action caused it: the weather, the season or the day of the week may explain it.',
        'Η σελίδα κόβει τον χρόνο πριν και μετά τη στιγμή σου σε ίσα κομμάτια (ώρες ή μέρες) και παίρνει τον μέσο όρο κάθε κομματιού. Αριθμοί όπως η θερμοκρασία αλλάζουν έτσι κι αλλιώς από κομμάτι σε κομμάτι: αυτή είναι η φυσιολογική διακύμανση. Αν η διαφορά πριν και μετά είναι μικρότερη από τη φυσιολογική διακύμανση, δεν ξεχωρίζει από μια συνηθισμένη αλλαγή. Ακόμη και μια μεγάλη διαφορά δεν αποδεικνύει ότι την προκάλεσε η δράση σου: μπορεί να την εξηγεί ο καιρός, η εποχή ή η μέρα της εβδομάδας.'],
    }));
    const host = h('div', { class: 't3' }, h('p', { class: 't3-empty', role: 'status' }, T('Loading', 'Φόρτωση')));
    root.append(host);
    const out = h('div', { class: 't3-out' });
    const said = h('p', { class: 't3-sr', 'aria-live': 'polite' });

    const site = (c) => (window.ISLAND && ISLAND.schools || []).find((s) => s.id === c);
    function stationFor(c) {
      const s = site(c);
      if (!s || !D.stations) return null;
      return D.stations.map((p) => ({ p, d: K.km(s.lat, s.lng, Number(p.lat), Number(p.lng)) })).filter((x) => isFinite(x.d) && x.d <= MAX_KM).sort((a, b) => a.d - b.d)[0] || null;
    }
    async function archiveFor(c) {
      const st = stationFor(c);
      if (!st) return null;
      if (!D.arch.has(st.p.id)) {
        try { D.arch.set(st.p.id, await SC.api('/api/cydom/history?station=' + encodeURIComponent(st.p.id) + '&hours=720')); }
        catch (e) { D.arch.set(st.p.id, { error: (e && e.message) || 'error', rows: [], keys: [], units: {} }); setTimeout(() => D.arch.delete(st.p.id), 20000); }
      }
      return { st, data: D.arch.get(st.p.id) };
    }
    // the series of the chosen measurement from each saved source, or null
    function archSeries(a, m) {
      if (!a || !a.data || !(a.data.rows || []).length) return null;
      const key = m.arch.find((k) => a.data.keys.indexOf(k) >= 0);
      if (!key) return null;
      const i = a.data.keys.indexOf(key) + 1;
      const pts = a.data.rows.map((r) => [r[0], r[i]]).filter((p) => p[1] != null && isFinite(p[1]));
      if (!pts.length) return null;
      const unit = ((a.data.units || {})[key] || {}).unit || '';
      return { kind: 'archive', pts, unit, key, name: T('official Met Office station ' + a.st.p.name + ', ' + K.n(a.st.d, 0) + ' km from the city centre (Data archive)', 'επίσημος σταθμός της Μετεωρολογικής Υπηρεσίας ' + a.st.p.name + ', ' + K.n(a.st.d, 0) + ' km από το κέντρο της πόλης (Αρχείο δεδομένων)'), what: T(m.n[0], m.n[1]), indoor: false };
    }
    function daySeries(c, m) {
      const r = D.replay;
      if (!r || !m.day || !r.cities || !r.cities[c] || !r.cities[c][m.day]) return null;
      const s = r.cities[c][m.day];
      const pts = (r.times || []).map((t, i) => [t, s.values[i]]).filter((p) => p[1] != null && isFinite(p[1]));
      if (!pts.length) return null;
      const src = (OWN[s.source] || [s.source, s.source])[K.isEl() ? 1 : 0], v = (VARS[s.variable] || [s.variable, s.variable])[K.isEl() ? 1 : 0];
      return { kind: 'day', pts, unit: s.unit || '', name: src + T(' (the saved day)', ' (η αποθηκευμένη μέρα)'), what: m.id === 'own' ? v + T(', city average', ', μέσος όρος πόλης') : T(m.n[0], m.n[1]), indoor: s.source === 'sensecap-classrooms', model: s.source === 'openmeteo-weather' };
    }
    const span = (pts) => (pts && pts.length ? [pts[0][0], pts[pts.length - 1][0]] : null);
    const range = (r) => (r ? SC.dateTime(r[0]) + ' – ' + SC.dateTime(r[1]) : T('nothing', 'τίποτα'));

    function bandChart(series, res, w) {
      const W = window.innerWidth < 620 ? 330 : 620, H = 220, L = 46, R = 12, Tp = 16, B = 30;
      const us = res.before.units.concat(res.after.units);
      const vals = us.map((u) => u.mean);
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (res.spread != null) { lo = Math.min(lo, res.before.mean - res.spread); hi = Math.max(hi, res.before.mean + res.spread); }
      const padv = (hi - lo) * 0.15 || 1; lo -= padv; hi += padv;
      const x = (t) => L + ((t - (S.t0 - w.span)) * (W - L - R)) / (2 * w.span), y = (v) => Tp + ((hi - v) * (H - Tp - B)) / (hi - lo);
      const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 't3-chart', role: 'img', 'aria-label': T('Chart: the average of each block of time before and after the action. The numbers are in the cards and the sentence around it.', 'Διάγραμμα: ο μέσος όρος κάθε χρονικού κομματιού πριν και μετά τη δράση. Οι αριθμοί είναι στις κάρτες και στην πρόταση γύρω του.') });
      for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4; svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 't3-grid' }), sv('text', { x: L - 6, y: y(v) + 4, class: 't3-ax', 'text-anchor': 'end' }, K.n(v, hi - lo < 8 ? 1 : 0))); }
      svg.append(sv('text', { x: 4, y: 11, class: 't3-ax' }, series.unit));
      if (res.spread != null) svg.append(sv('rect', { x: L, width: W - L - R, y: y(res.before.mean + res.spread), height: Math.max(1, y(res.before.mean - res.spread) - y(res.before.mean + res.spread)), class: 't3-band' }, sv('title', null, T('The normal spread around the average before', 'Η φυσιολογική διακύμανση γύρω από τον μέσο όρο πριν'))));
      svg.append(sv('line', { x1: x(S.t0 - w.span), x2: x(S.t0), y1: y(res.before.mean), y2: y(res.before.mean), class: 't3-m-b' }), sv('line', { x1: x(S.t0), x2: x(S.t0 + w.span), y1: y(res.after.mean), y2: y(res.after.mean), class: 't3-m-a' }));
      svg.append(sv('line', { x1: x(S.t0), x2: x(S.t0), y1: Tp - 6, y2: H - B, class: 't3-act' }), sv('text', { x: x(S.t0), y: H - 8, class: 't3-ax t3-ax-hot', 'text-anchor': 'middle' }, T('the action', 'η δράση')));
      svg.append(sv('text', { x: L, y: H - 8, class: 't3-ax' }, SC.dateTime(S.t0 - w.span)), sv('text', { x: W - R, y: H - 8, class: 't3-ax', 'text-anchor': 'end' }, SC.dateTime(S.t0 + w.span)));
      res.before.units.forEach((u) => svg.append(sv('circle', { cx: x(u.t + w.unit / 2), cy: y(u.mean), r: 5, class: 't3-u-b' }, sv('title', null, SC.dateTime(u.t) + ': ' + K.n(u.mean, 1) + ' ' + series.unit))));
      res.after.units.forEach((u) => svg.append(sv('circle', { cx: x(u.t + w.unit / 2), cy: y(u.mean), r: 5, class: 't3-u-a' }, sv('title', null, SC.dateTime(u.t) + ': ' + K.n(u.mean, 1) + ' ' + series.unit))));
      return svg;
    }

    async function show() {
      const m = MEAS.find((x) => x.id === S.meas), c = S.city;
      out.replaceChildren(h('p', { class: 't3-empty', role: 'status' }, T('Reading the saved data', 'Διαβάζω τα αποθηκευμένα δεδομένα')));
      const a = await archiveFor(c);
      if (!alive || c !== S.city || m.id !== S.meas) return;
      const sA = archSeries(a, m), sD = daySeries(c, m);
      // first visit: put the action in the middle of what is saved and take the longest stretch that fits
      if (!S.touched) {
        const base = sA && span(sA.pts)[1] - span(sA.pts)[0] >= 6 * HOUR ? sA : sD || sA;
        if (base) {
          const r = span(base.pts), len = r[1] - r[0];
          const fit = WINDOWS.slice().reverse().find((w) => w.span <= 7 * DAY && 2 * w.span <= len) || WINDOWS[0];
          S.win = fit.id;
          S.t0 = Math.round((r[0] + r[1]) / 2 / (fit.unit === DAY ? HOUR : 600000)) * (fit.unit === DAY ? HOUR : 600000);
        } else { S.win = S.win || '6h'; S.t0 = S.t0 || Date.now() - 6 * HOUR; }
        sync();
      }
      const w = WINDOWS.find((x) => x.id === S.win) || WINDOWS[1];
      let series = null, res = null;
      for (const s of [sA, w.unit === HOUR ? sD : null]) { if (!s) continue; const r = compare(s.pts, S.t0, w.span, w.unit); if (r.ok) { series = s; res = r; break; } }
      const kids = [];
      const wn = T(w.n[0], w.n[1]), unitWord = w.unit === DAY ? T('24-hour blocks', 'κομμάτια 24 ωρών') : T('one-hour blocks', 'ωριαία κομμάτια');
      if (!res) {
        kids.push(h('section', { class: 't3-panel', 'data-k': 'nodata' },
          h('h2', { class: 't3-h' }, T('Not enough saved data for this comparison', 'Δεν υπάρχουν αρκετά αποθηκευμένα δεδομένα για αυτή τη σύγκριση')),
          h('p', { class: 't3-say' }, T('You asked for ' + wn + ' before and ' + wn + ' after ' + SC.dateTime(S.t0) + ' (' + SC.dateTime(S.t0 - w.span) + ' – ' + SC.dateTime(S.t0 + w.span) + '). The saved data does not cover both sides, so no averages are shown. Nothing is guessed.', 'Ζήτησες ' + wn + ' πριν και ' + wn + ' μετά τις ' + SC.dateTime(S.t0) + ' (' + SC.dateTime(S.t0 - w.span) + ' – ' + SC.dateTime(S.t0 + w.span) + '). Τα αποθηκευμένα δεδομένα δεν καλύπτουν και τις δύο πλευρές, γι’ αυτό δεν εμφανίζονται μέσοι όροι. Τίποτα δεν μαντεύεται.')),
          h('ul', { class: 't3-list' },
            h('li', null, h('b', null, T('Data archive: ', 'Αρχείο δεδομένων: ')), !a ? T('no official station within ' + MAX_KM + ' km of this city in the list right now.', 'κανένας επίσημος σταθμός σε απόσταση ' + MAX_KM + ' km από αυτή την πόλη στη λίστα αυτή τη στιγμή.') : a.data.error ? T('could not be read just now.', 'δεν διαβάστηκε αυτή τη στιγμή.') : !m.arch.length ? T('does not hold this measurement (school sensors are not kept in the archive).', 'δεν κρατά αυτή τη μέτρηση (οι σχολικοί αισθητήρες δεν φυλάσσονται στο αρχείο).') : sA ? T('station ' + a.st.p.name + ' has this measurement from ' + range(span(sA.pts)) + ' (the page can read the last 30 days).', 'ο σταθμός ' + a.st.p.name + ' έχει αυτή τη μέτρηση από ' + range(span(sA.pts)) + ' (η σελίδα διαβάζει τις τελευταίες 30 μέρες).') : T('station ' + a.st.p.name + ' has no saved readings of this measurement in the last 30 days.', 'ο σταθμός ' + a.st.p.name + ' δεν έχει αποθηκευμένες μετρήσεις αυτού του είδους τις τελευταίες 30 μέρες.')),
            h('li', null, h('b', null, T('The saved day: ', 'Η αποθηκευμένη μέρα: ')), D.replayErr ? T('could not be read just now.', 'δεν διαβάστηκε αυτή τη στιγμή.') : !m.day ? T('does not hold this measurement.', 'δεν κρατά αυτή τη μέτρηση.') : sD ? T('holds ' + range(span(sD.pts)) + ' (at most 26 hours, so only stretches in hours fit).', 'κρατά ' + range(span(sD.pts)) + ' (το πολύ 26 ώρες, άρα χωρούν μόνο διαστήματα σε ώρες).') : T('has nothing for this city and measurement yet.', 'δεν έχει ακόμη τίποτα για αυτή την πόλη και μέτρηση.'))),
          h('p', { class: 't3-note' }, T('Try a shorter stretch, or a moment well inside the saved time.', 'Δοκίμασε μικρότερο διάστημα ή μια στιγμή αρκετά μέσα στον αποθηκευμένο χρόνο.'))));
        said.textContent = T('Not enough saved data for this comparison.', 'Δεν υπάρχουν αρκετά αποθηκευμένα δεδομένα για αυτή τη σύγκριση.');
        out.replaceChildren(...kids);
        return;
      }
      const dec = Math.abs(res.before.mean) >= 100 ? 0 : 1, u = series.unit, f = (v) => K.n(v, dec) + (u ? ' ' + u : '');
      const sign = res.diff > 0 ? T('higher', 'ψηλότερα') : res.diff < 0 ? T('lower', 'χαμηλότερα') : T('the same', 'ίδια');
      const zero = Math.abs(res.diff) < (dec ? 0.05 : 0.5);
      const delta = zero ? T('the same (to the precision shown)', 'ίδιος (με την ακρίβεια που φαίνεται)') : f(Math.abs(res.diff)) + ' ' + sign;
      let verdict, cls;
      if (res.verdict === 'within') { cls = 'no'; verdict = T('You cannot tell from this. After the action the average was ' + delta + ', but this number moves by about ' + f(res.spread) + ' from one block to the next anyway. The difference is inside the normal spread.', 'Δεν μπορείς να το πεις από αυτό. Μετά τη δράση ο μέσος όρος ήταν ' + delta + ', αλλά αυτός ο αριθμός αλλάζει έτσι κι αλλιώς κατά περίπου ' + f(res.spread) + ' από το ένα κομμάτι στο άλλο. Η διαφορά είναι μέσα στη φυσιολογική διακύμανση.'); }
      else if (res.verdict === 'beyond') { cls = 'yes'; verdict = T('The numbers are different. After the action the average was ' + delta + ', more than the normal spread of about ' + f(res.spread) + '. This shows that the numbers changed. It does not show why.', 'Οι αριθμοί διαφέρουν. Μετά τη δράση ο μέσος όρος ήταν ' + delta + ', περισσότερο από τη φυσιολογική διακύμανση των περίπου ' + f(res.spread) + '. Αυτό δείχνει ότι οι αριθμοί άλλαξαν. Δεν δείχνει το γιατί.'); }
      else { cls = 'no'; verdict = T('You cannot tell from this. With fewer than 3 blocks on a side we cannot know the normal spread, so the difference of ' + f(Math.abs(res.diff)) + (zero ? '' : ' (' + sign + ')') + ' cannot be judged. Try a longer stretch.', 'Δεν μπορείς να το πεις από αυτό. Με λιγότερα από 3 κομμάτια σε μια πλευρά δεν ξέρουμε τη φυσιολογική διακύμανση, άρα η διαφορά των ' + f(Math.abs(res.diff)) + (zero ? '' : ' (' + sign + ')') + ' δεν μπορεί να κριθεί. Δοκίμασε μεγαλύτερο διάστημα.'); }
      const card = (label, s, k) => h('div', { class: 't3-kpi ' + k },
        h('span', { class: 't3-kl' }, label), h('b', null, f(s.mean)),
        h('small', null, SC.dateTime(s.from) + ' – ' + SC.dateTime(s.to)),
        h('small', null, T(s.units.length + ' of ' + s.expected + ' ' + unitWord + ', ' + s.n + ' readings', s.units.length + ' από ' + s.expected + ' ' + unitWord + ', ' + s.n + ' μετρήσεις')),
        h('small', null, s.sd == null ? T('spread: not known', 'διακύμανση: άγνωστη') : T('moves by about ± ' + f(s.sd) + ' between blocks', 'αλλάζει κατά περίπου ± ' + f(s.sd) + ' ανάμεσα στα κομμάτια')));
      kids.push(h('section', { class: 't3-panel', 'data-k': 'result', 'data-verdict': res.verdict, 'data-source': series.kind },
        h('h2', { class: 't3-h' }, series.what + ', ' + K.cityName(c)),
        h('p', { class: 't3-verdict ' + cls, 'data-k': 'verdict' }, verdict),
        h('div', { class: 't3-kpis' }, card(T('Average before', 'Μέσος όρος πριν'), res.before, 'b'), card(T('Average after', 'Μέσος όρος μετά'), res.after, 'a'),
          h('div', { class: 't3-kpi d' }, h('span', { class: 't3-kl' }, T('Difference (after minus before)', 'Διαφορά (μετά μείον πριν)')), h('b', null, (res.diff > 0 ? '+' : '') + f(res.diff)),
            h('small', null, res.spread == null ? T('normal spread: not known', 'φυσιολογική διακύμανση: άγνωστη') : T('normal spread: about ' + f(res.spread), 'φυσιολογική διακύμανση: περίπου ' + f(res.spread))))),
        bandChart(series, res, w),
        h('div', { class: 't3-legend' }, h('span', null, h('i', { class: 'k-st' }), T('before: average of each block', 'πριν: μέσος όρος κάθε κομματιού')), h('span', null, h('i', { class: 'k-fc' }), T('after', 'μετά')), res.spread != null ? h('span', null, h('i', { class: 'k-band' }), T('normal spread', 'φυσιολογική διακύμανση')) : null),
        h('p', { class: 't3-note', 'data-k': 'source' }, T('Source: ', 'Πηγή: ') + series.name + '. ' + T('Unit: ', 'Μονάδα: ') + (u || '–') + '. ' + T('Blocks: ', 'Κομμάτια: ') + unitWord + T(', counted from the moment of the action.', ', μετρημένα από τη στιγμή της δράσης.'))));
      const warns = [
        h('li', { 'data-k': 'weather' }, T('The weather is another explanation. A change of wind, rain, a heat wave or a dusty day moves these numbers without any action. Look at the weather of both stretches before you say anything.', 'Ο καιρός είναι μια άλλη εξήγηση. Μια αλλαγή στον άνεμο, η βροχή, ένας καύσωνας ή μια μέρα με σκόνη αλλάζουν αυτούς τους αριθμούς χωρίς καμία δράση. Κοίτα τον καιρό και των δύο διαστημάτων πριν πεις οτιδήποτε.')),
        h('li', null, w.unit === HOUR ? T('The time of day matters too: a morning and an afternoon are different even on the same day.', 'Μετρά και η ώρα της μέρας: το πρωί και το απόγευμα διαφέρουν ακόμη και την ίδια μέρα.') : T('The season and the days of the week matter too: a week with a holiday is not like a school week.', 'Μετρούν και η εποχή και οι μέρες της εβδομάδας: μια εβδομάδα με αργία δεν μοιάζει με σχολική εβδομάδα.')),
        h('li', { 'data-k': 'nocause' }, T('This page compares numbers. It never says that the action caused the difference.', 'Η σελίδα αυτή συγκρίνει αριθμούς. Δεν λέει ποτέ ότι η δράση προκάλεσε τη διαφορά.')),
        series.kind === 'archive' ? h('li', null, T('The station is not at your school. It tells you about the area, not about one street.', 'Ο σταθμός δεν βρίσκεται στο σχολείο σου. Μιλά για την περιοχή, όχι για έναν δρόμο.')) : null,
        series.indoor ? h('li', null, T('These are indoor readings. Do not put them next to outdoor numbers.', 'Αυτές είναι μετρήσεις εσωτερικού χώρου. Μην τις βάζεις δίπλα σε αριθμούς εξωτερικού χώρου.')) : null,
        series.model ? h('li', null, T('For this city the saved day holds a weather model, not a measurement.', 'Για αυτή την πόλη η αποθηκευμένη μέρα κρατά μοντέλο καιρού, όχι μέτρηση.')) : null,
      ];
      kids.push(h('section', { class: 't3-panel t3-warnbox', 'aria-labelledby': 'ba-w' }, h('h2', { class: 't3-h', id: 'ba-w' }, T('Before you draw a conclusion', 'Πριν βγάλεις συμπέρασμα')), h('ul', { class: 't3-list' }, warns)));
      said.textContent = verdict;
      out.replaceChildren(...kids);
    }

    // controls
    const selCity = h('select', { class: 'nm-input', id: 'ba-city', onchange: () => { S.city = selCity.value; S.touched = false; show(); } });
    const selMeas = h('select', { class: 'nm-input', id: 'ba-meas', onchange: () => { S.meas = selMeas.value; S.touched = false; show(); } });
    const inWhen = h('input', { class: 'nm-input', id: 'ba-when', type: 'datetime-local', step: '600', onchange: () => { const t = fromLocalInput(inWhen.value); if (t != null) { S.t0 = t; S.touched = true; show(); } } });
    const selWin = h('select', { class: 'nm-input', id: 'ba-win', onchange: () => { S.win = selWin.value; S.touched = true; show(); } });
    function sync() { if (S.t0 != null) inWhen.value = toLocalInput(S.t0); if (S.win) selWin.value = S.win; }
    const field = (id, label, ctl) => h('div', { class: 't3-field' }, h('label', { for: id }, label), ctl);

    (async () => {
      try { K = await lib(); } catch (e) { host.replaceChildren(h('div', { class: 'err', role: 'alert' }, (e && e.message) || '')); return; }
      const [cy, rp] = await Promise.all([SC.cached('/api/cydom', 300000).catch((e) => { D.stationErr = e; return null; }), SC.api('/layers/api/replay').catch((e) => { D.replayErr = e; return null; })]);
      if (!alive) return;
      D.stations = cy && Array.isArray(cy.points) ? cy.points.filter((p) => p && p.id && p.lat != null && p.lng != null) : [];
      D.replay = rp;
      Object.keys(K.CITY).forEach((c) => selCity.append(h('option', { value: c }, K.cityName(c))));
      MEAS.forEach((m) => selMeas.append(h('option', { value: m.id }, T(m.n[0], m.n[1]))));
      WINDOWS.forEach((w) => selWin.append(h('option', { value: w.id }, T(w.n[0] + ' before and after', w.n[1] + ' πριν και μετά'))));
      host.replaceChildren(
        h('section', { class: 't3-panel', 'aria-label': T('What to compare', 'Τι να συγκρίνουμε') },
          h('div', { class: 't3-form' }, field('ba-city', T('City', 'Πόλη'), selCity), field('ba-meas', T('Measurement', 'Μέτρηση'), selMeas), field('ba-when', T('Date and time of the action', 'Ημερομηνία και ώρα της δράσης'), inWhen), field('ba-win', T('How long on each side', 'Πόσο χρόνο σε κάθε πλευρά'), selWin)),
          h('p', { class: 't3-note' }, T('Only saved data is used: the Data archive (official stations, the last 30 days) when it holds enough, otherwise the saved day (at most 26 hours). Nothing you choose here is stored.', 'Χρησιμοποιούνται μόνο αποθηκευμένα δεδομένα: το Αρχείο δεδομένων (επίσημοι σταθμοί, οι τελευταίες 30 μέρες) όταν έχει αρκετά, αλλιώς η αποθηκευμένη μέρα (το πολύ 26 ώρες). Τίποτα από όσα διαλέγεις εδώ δεν αποθηκεύεται.'))),
        out, said);
      show();
    })();
    return () => { alive = false; };
  }

  SC.register('beforeafter', { title: ['Before and after', 'Πριν και μετά'], render, _t: { compare } });
})();
