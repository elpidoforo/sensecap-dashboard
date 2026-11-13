/*
  Forecast against reality. Route: #/forecast
  Once a day the server saves what the weather model expects for tomorrow in each of the four cities (toolkit-forecast.js). After the day
  the page puts that saved forecast next to (1) what the nearest official Met Office station measured, from the history this site
  keeps, and (2) what the same model says about the day afterwards. The second one is not a measurement and the page says so.
  Data: GET /api/toolkit/forecast  { since, today, simulated, on, pairs, waiting, fullHours, maxKm, cities: { id: { rows: [{ day, done, f, a, s }],
        station: { n, tmax: { n, mean_abs, bias, worst }, tmin, wind }, model: {...} } } }
  All the sums (average error, too warm or too cold) are done on the server; this page only draws them and puts them into words.
  Until one full pair exists the page says exactly that, and since when forecasts are being saved. No ranking of cities.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/toolkit-b3.css');
  const lib = () => (SC.tk3 ? Promise.resolve(SC.tk3) : (SC.tk3p = SC.tk3p || new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/site/pages/toolkit-b3-lib.js'; s.onload = () => (SC.tk3 ? ok(SC.tk3) : no(new Error('helpers'))); s.onerror = () => { SC.tk3p = null; no(new Error(T('A part of this page could not be loaded.', 'Ένα μέρος της σελίδας δεν φορτώθηκε.'))); }; document.head.append(s); })));

  const loc = () => (SC.lang === 'el' ? 'el-GR' : 'en-GB');
  const dayMs = (key) => Date.parse(key + 'T12:00:00Z');
  const dayShort = (key) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(dayMs(key));
  const dayLong = (key) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(dayMs(key));
  const MEAS = [
    ['tmax', 'Highest temperature', 'Υψηλότερη θερμοκρασία', '°C', 'the day’s highest temperature', 'την υψηλότερη θερμοκρασία της μέρας'],
    ['tmin', 'Lowest temperature', 'Χαμηλότερη θερμοκρασία', '°C', 'the day’s lowest temperature', 'τη χαμηλότερη θερμοκρασία της μέρας'],
    ['wind', 'Strongest wind', 'Δυνατότερος άνεμος', 'm/s', 'the day’s strongest wind', 'τον δυνατότερο άνεμο της μέρας'],
  ];

  function render(root) {
    let alive = true, timer = 0, K = null, D = null, meas = 'tmax';
    const head = SC.head({
      title: T('Forecast against reality', 'Πρόβλεψη και πραγματικότητα'),
      lede: T('Every day the server keeps what the weather model expects for tomorrow. When that day is over, we put the forecast next to what was really measured. How far off was it?',
        'Κάθε μέρα ο διακομιστής κρατά τι περιμένει το μοντέλο καιρού για αύριο. Όταν περάσει εκείνη η μέρα, βάζουμε την πρόβλεψη δίπλα σε αυτό που μετρήθηκε στ’ αλήθεια. Πόσο έξω έπεσε;'),
      help: ['A weather model is a computer program that works out tomorrow’s weather. Once a day this site saves its forecast for the next day, for each of our four cities, and never changes it afterwards. Later we add two things: what the nearest official Met Office station measured that day (a real measurement, but at the station, not at your school), and what the same model says about the day once it is over (not a measurement). The difference between forecast and measurement is the error. A few days are not enough to judge a model.',
        'Ένα μοντέλο καιρού είναι ένα πρόγραμμα υπολογιστή που υπολογίζει τον αυριανό καιρό. Μία φορά τη μέρα ο ιστότοπος αποθηκεύει την πρόβλεψή του για την επόμενη μέρα, για καθεμία από τις τέσσερις πόλεις μας, και δεν την αλλάζει ποτέ μετά. Αργότερα προσθέτουμε δύο πράγματα: τι μέτρησε εκείνη τη μέρα ο κοντινότερος επίσημος σταθμός της Μετεωρολογικής Υπηρεσίας (πραγματική μέτρηση, αλλά στον σταθμό, όχι στο σχολείο σου) και τι λέει το ίδιο μοντέλο για τη μέρα αφού περάσει (δεν είναι μέτρηση). Η διαφορά πρόβλεψης και μέτρησης είναι το σφάλμα. Λίγες μέρες δεν φτάνουν για να κρίνεις ένα μοντέλο.'],
    });
    root.append(head);
    const host = h('div', { class: 't3' }, h('p', { class: 't3-empty', role: 'status' }, T('Loading', 'Φόρτωση')));
    root.append(host);

    const unitOf = (m) => MEAS.find((x) => x[0] === m)[3];
    const val = (v, m) => (v == null ? '–' : K.n(v, 1) + ' ' + unitOf(m));

    function statusPanel() {
      const p = h('section', { class: 't3-panel', 'aria-labelledby': 'fc-st' });
      const title = h('h2', { class: 't3-h', id: 'fc-st' });
      p.append(title);
      if (D.since == null) {
        title.textContent = T('No forecast has been saved yet', 'Δεν έχει αποθηκευτεί καμία πρόβλεψη ακόμη');
        p.append(h('p', { class: 't3-say' }, D.on
          ? T('The server saves the first forecast within an hour of starting. Come back later: the first comparison needs a saved forecast and then the whole day it was made for.', 'Ο διακομιστής αποθηκεύει την πρώτη πρόβλεψη μέσα σε μία ώρα από την εκκίνηση. Έλα ξανά αργότερα: η πρώτη σύγκριση χρειάζεται μια αποθηκευμένη πρόβλεψη και μετά ολόκληρη τη μέρα για την οποία έγινε.')
          : T('The weather model is switched off by a teacher, so no forecast is being saved.', 'Το μοντέλο καιρού είναι απενεργοποιημένο από εκπαιδευτικό, γι’ αυτό δεν αποθηκεύεται πρόβλεψη.')));
        return p;
      }
      const since = SC.dateTime(D.since);
      if (!D.pairs) {
        title.textContent = T('No full pair yet', 'Κανένα πλήρες ζευγάρι ακόμη');
        p.append(h('p', { class: 't3-say', 'data-k': 'nopair' }, T('A pair is one saved forecast plus what was measured on the day it was made for. There is not one full pair yet, so there is nothing to compare.', 'Ένα ζευγάρι είναι μία αποθηκευμένη πρόβλεψη μαζί με αυτό που μετρήθηκε τη μέρα για την οποία έγινε. Δεν υπάρχει ακόμη ούτε ένα πλήρες ζευγάρι, άρα δεν υπάρχει τίποτα να συγκρίνουμε.')),
          h('p', { class: 't3-note', 'data-k': 'since' }, T('Forecasts are being saved since ' + since + '. ', 'Οι προβλέψεις αποθηκεύονται από ' + since + '. ') +
            (D.waiting ? T(D.waiting + ' saved forecasts are waiting for their day to finish. The first comparison appears the day after.', D.waiting + ' αποθηκευμένες προβλέψεις περιμένουν να τελειώσει η μέρα τους. Η πρώτη σύγκριση εμφανίζεται την επόμενη μέρα.') : '')));
        return p;
      }
      title.textContent = T('What we can compare so far', 'Τι μπορούμε να συγκρίνουμε ως τώρα');
      p.append(h('p', { class: 't3-note', 'data-k': 'since' }, T('Forecasts are being saved since ' + since + ', one per city per day, and kept for ' + D.keepDays + ' days. A forecast is written once and never changed.', 'Οι προβλέψεις αποθηκεύονται από ' + since + ', μία για κάθε πόλη κάθε μέρα, και κρατιούνται ' + D.keepDays + ' μέρες. Μια πρόβλεψη γράφεται μία φορά και δεν αλλάζει ποτέ.')));
      if (D.error) p.append(h('p', { class: 't3-warn' }, T('The last try to read the model failed. The server tries again within the hour.', 'Η τελευταία προσπάθεια να διαβαστεί το μοντέλο απέτυχε. Ο διακομιστής δοκιμάζει ξανά μέσα στην ώρα.')));
      return p;
    }

    // forecast against the outcome, one point per day
    function chart(c, rows) {
      const W = window.innerWidth < 620 ? 330 : 560, H = 210, L = 40, R = 12, Tp = 14, B = 30;
      const pts = rows.filter((r) => r.f && r.f[meas] != null);
      const all = [];
      pts.forEach((r) => { all.push(r.f[meas]); if (r.s && r.s[meas] != null) all.push(r.s[meas]); if (r.a && r.a[meas] != null) all.push(r.a[meas]); });
      if (!all.length) return h('p', { class: 't3-note' }, T('No saved forecast has this number.', 'Καμία αποθηκευμένη πρόβλεψη δεν έχει αυτόν τον αριθμό.'));
      let lo = Math.floor(Math.min(...all) - 1), hi = Math.ceil(Math.max(...all) + 1);
      if (meas === 'wind') lo = Math.max(0, lo);
      const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
      const y = (v) => Tp + ((hi - v) * (H - Tp - B)) / (hi - lo);
      const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 't3-chart', role: 'img', 'aria-label': T('Chart for ' + K.cityName(c) + ': forecast and outcome by day. The same numbers are in the table below.', 'Διάγραμμα για ' + K.cityName(c) + ': πρόβλεψη και αποτέλεσμα ανά μέρα. Οι ίδιοι αριθμοί είναι στον πίνακα από κάτω.') });
      const steps = 4;
      for (let i = 0; i <= steps; i++) { const v = lo + ((hi - lo) * i) / steps; svg.append(sv('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 't3-grid' }), sv('text', { x: L - 6, y: y(v) + 4, class: 't3-ax', 'text-anchor': 'end' }, K.n(v, (hi - lo) % steps ? 1 : 0))); }
      svg.append(sv('text', { x: 4, y: 11, class: 't3-ax' }, unitOf(meas)));
      const every = Math.max(1, Math.ceil(pts.length / 6));
      pts.forEach((r, i) => { if (i % every === 0 || i === pts.length - 1) svg.append(sv('text', { x: x(i), y: H - 8, class: 't3-ax', 'text-anchor': i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle' }, dayShort(r.day))); });
      // the gap between forecast and station measurement, one thin bar per day
      pts.forEach((r, i) => { if (r.s && r.s[meas] != null) svg.append(sv('line', { x1: x(i), x2: x(i), y1: y(r.f[meas]), y2: y(r.s[meas]), class: 't3-gap' })); });
      const line = (pick, cls) => {
        let d = '', open = false;
        pts.forEach((r, i) => { const v = pick(r); if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); open = true; });
        if (d) svg.append(sv('path', { d, class: cls }));
      };
      line((r) => (r.a ? r.a[meas] : null), 't3-l-model');
      line((r) => r.f[meas], 't3-l-fc');
      line((r) => (r.s ? r.s[meas] : null), 't3-l-st');
      pts.forEach((r, i) => {
        svg.append(sv('circle', { cx: x(i), cy: y(r.f[meas]), r: 4, class: 't3-p-fc' }, sv('title', null, dayLong(r.day) + ': ' + T('forecast ', 'πρόβλεψη ') + val(r.f[meas], meas))));
        if (r.s && r.s[meas] != null) svg.append(sv('rect', { x: x(i) - 4, y: y(r.s[meas]) - 4, width: 8, height: 8, class: 't3-p-st' }, sv('title', null, dayLong(r.day) + ': ' + T('measured ', 'μετρήθηκε ') + val(r.s[meas], meas))));
      });
      return svg;
    }

    function words(c, city) {
      const out = [], m = MEAS.find((x) => x[0] === meas), what = T(m[4], m[5]);
      const st = city.station[meas], mo = city.model[meas];
      const lean = (b) => {
        if (meas === 'wind') return Math.abs(b) < 0.3 ? T('It leaned neither clearly too strong nor too weak.', 'Δεν έγερνε καθαρά ούτε προς το πιο δυνατό ούτε προς το πιο αδύναμο.') : b > 0 ? T('More often it expected more wind than was measured (on average ' + K.n(b, 1) + ' m/s more).', 'Πιο συχνά περίμενε περισσότερο άνεμο απ’ όσο μετρήθηκε (κατά μέσο όρο ' + K.n(b, 1) + ' m/s περισσότερο).') : T('More often it expected less wind than was measured (on average ' + K.n(-b, 1) + ' m/s less).', 'Πιο συχνά περίμενε λιγότερο άνεμο απ’ όσο μετρήθηκε (κατά μέσο όρο ' + K.n(-b, 1) + ' m/s λιγότερο).');
        return Math.abs(b) < 0.3 ? T('It leaned neither clearly too warm nor too cold.', 'Δεν έγερνε καθαρά ούτε προς το πιο ζεστό ούτε προς το πιο κρύο.') : b > 0 ? T('More often it was too warm (on average ' + K.n(b, 1) + ' °C above the measurement).', 'Πιο συχνά ήταν πολύ ζεστή (κατά μέσο όρο ' + K.n(b, 1) + ' °C πάνω από τη μέτρηση).') : T('More often it was too cold (on average ' + K.n(-b, 1) + ' °C below the measurement).', 'Πιο συχνά ήταν πολύ κρύα (κατά μέσο όρο ' + K.n(-b, 1) + ' °C κάτω από τη μέτρηση).');
      };
      const days = (k) => (k === 1 ? T('1 day', '1 μέρα') : T(k + ' days', k + ' μέρες'));
      if (st) {
        const last = city.rows.filter((r) => r.s).slice(-1)[0];
        out.push(h('p', { class: 't3-say', 'data-k': 'say-station' }, T('Against the station, over ' + days(st.n) + ': the forecast for ' + what + ' was off by ' + K.n(st.mean_abs, 1) + ' ' + m[3] + ' on average. ', 'Σε σχέση με τον σταθμό, σε ' + days(st.n) + ': η πρόβλεψη για ' + what + ' έπεσε έξω κατά ' + K.n(st.mean_abs, 1) + ' ' + m[3] + ' κατά μέσο όρο. ') + lean(st.bias)));
        out.push(h('p', { class: 't3-note' }, T('Biggest miss: ' + K.n(Math.abs(st.worst), 1) + ' ' + m[3] + '. Measured at the official station ' + last.s.name + ', ' + K.n(last.s.km, 0) + ' km from the city centre. The model works out an area of a few kilometres, the station measures one spot: a small difference is normal.', 'Μεγαλύτερη αστοχία: ' + K.n(Math.abs(st.worst), 1) + ' ' + m[3] + '. Μετρήθηκε στον επίσημο σταθμό ' + last.s.name + ', ' + K.n(last.s.km, 0) + ' km από το κέντρο της πόλης. Το μοντέλο υπολογίζει μια περιοχή λίγων χιλιομέτρων, ο σταθμός μετρά ένα σημείο: μια μικρή διαφορά είναι φυσιολογική.')));
        if (meas === 'wind') out.push(h('p', { class: 't3-warn' }, T('Careful with wind: the forecast is the strongest hourly average, the station number is the strongest 10-minute reading. They are not the same thing, so the station is often higher.', 'Προσοχή με τον άνεμο: η πρόβλεψη είναι ο δυνατότερος ωριαίος μέσος όρος, ενώ ο αριθμός του σταθμού είναι η δυνατότερη μέτρηση 10 λεπτών. Δεν είναι το ίδιο πράγμα, γι’ αυτό ο σταθμός είναι συχνά πιο ψηλά.')));
        if (st.n < 7) out.push(h('p', { class: 't3-warn', 'data-k': 'few' }, T(days(st.n) + ' is very little. Do not judge the model on it: wait for more days.', days(st.n) + ' είναι πολύ λίγο. Μην κρίνεις το μοντέλο από αυτό: περίμενε περισσότερες μέρες.')));
      } else {
        out.push(h('p', { class: 't3-say', 'data-k': 'no-station' }, meas === 'wind' && city.station.n
          ? T('No station wind was saved for these days, so the wind forecast cannot be checked against a measurement.', 'Δεν αποθηκεύτηκε άνεμος σταθμού για αυτές τις μέρες, άρα η πρόβλεψη ανέμου δεν μπορεί να ελεγχθεί με μέτρηση.')
          : T('No station measurement for a full day yet: a day counts only when a station within ' + D.maxKm + ' km has readings in at least ' + D.fullHours + ' of its 24 hours.', 'Δεν υπάρχει ακόμη μέτρηση σταθμού για ολόκληρη μέρα: μια μέρα μετρά μόνο όταν ένας σταθμός σε απόσταση έως ' + D.maxKm + ' km έχει μετρήσεις σε τουλάχιστον ' + D.fullHours + ' από τις 24 ώρες της.')));
      }
      if (mo) out.push(h('p', { class: 't3-note', 'data-k': 'say-model' }, T('Against the model’s own later look at the day (' + days(mo.n) + '): off by ' + K.n(mo.mean_abs, 1) + ' ' + m[3] + ' on average. This is the model checking itself, not a measurement.', 'Σε σχέση με τη μεταγενέστερη ματιά του ίδιου του μοντέλου στη μέρα (' + days(mo.n) + '): έξω κατά ' + K.n(mo.mean_abs, 1) + ' ' + m[3] + ' κατά μέσο όρο. Εδώ το μοντέλο ελέγχει τον εαυτό του, δεν είναι μέτρηση.')));
      return out;
    }

    function table(city) {
      const m = MEAS.find((x) => x[0] === meas);
      const diff = (r) => (r.f && r.s && r.f[meas] != null && r.s[meas] != null ? (r.f[meas] - r.s[meas] > 0 ? '+' : r.f[meas] - r.s[meas] < 0 ? '−' : '') + K.n(Math.abs(r.f[meas] - r.s[meas]), 1) : '–');
      const tb = h('table', { class: 't3-table' },
        h('thead', null, h('tr', null, [T('Day', 'Μέρα'), T('Forecast, saved the day before', 'Πρόβλεψη, αποθηκευμένη την προηγούμενη μέρα'), T('Measured (station)', 'Μετρήθηκε (σταθμός)'), T('Forecast minus measured', 'Πρόβλεψη μείον μέτρηση'), T('Model afterwards', 'Το μοντέλο εκ των υστέρων')].map((x) => h('th', { scope: 'col' }, x)))),
        h('tbody', null, city.rows.slice().reverse().map((r) => h('tr', null,
          h('th', { scope: 'row' }, dayLong(r.day)),
          h('td', null, r.f ? val(r.f[meas], meas) : '–', r.f ? h('small', null, T('saved ', 'αποθηκεύτηκε ') + SC.dateTime(r.f.at)) : null),
          h('td', null, r.s ? val(r.s[meas], meas) : r.done ? T('no full day at a station', 'όχι πλήρης μέρα σε σταθμό') : T('the day is not over', 'η μέρα δεν τελείωσε'), r.s ? h('small', null, r.s.name + ', ' + r.s.hours + T(' of 24 hours', ' από 24 ώρες')) : null),
          h('td', null, diff(r) === '–' ? '–' : diff(r) + ' ' + m[3]),
          h('td', null, r.a ? val(r.a[meas], meas) : '–')))));
      return h('details', { class: 't3-details' }, h('summary', null, T('Every day as a table', 'Κάθε μέρα σε πίνακα')), h('div', { class: 't3-scroll', tabindex: '0', role: 'group', 'aria-label': T('Table of days', 'Πίνακας ημερών') }, tb));
    }

    function draw() {
      const kids = [statusPanel()];
      if (D.since != null && Object.values(D.cities).some((c) => c.rows.length)) {
        const chips = h('div', { class: 't3-chips', role: 'group', 'aria-label': T('Which number to compare', 'Ποιον αριθμό να συγκρίνουμε') },
          MEAS.map((m) => h('button', { type: 'button', class: 't3-chip' + (meas === m[0] ? ' on' : ''), 'aria-pressed': meas === m[0] ? 'true' : 'false', 'data-m': m[0], onclick: () => { meas = m[0]; draw(); const b = host.querySelector('.t3-chip[data-m="' + m[0] + '"]'); if (b) b.focus(); } }, T(m[1], m[2]))));
        const legend = h('div', { class: 't3-legend' },
          h('span', null, h('i', { class: 'k-fc' }), T('Forecast (weather model, saved the day before)', 'Πρόβλεψη (μοντέλο καιρού, αποθηκευμένη την προηγούμενη μέρα)')),
          h('span', null, h('i', { class: 'k-st' }), T('Measured (official station)', 'Μετρήθηκε (επίσημος σταθμός)')),
          h('span', null, h('i', { class: 'k-mo' }), T('The model afterwards (not a measurement)', 'Το μοντέλο εκ των υστέρων (δεν είναι μέτρηση)')));
        kids.push(h('section', { class: 't3-panel' }, chips, legend));
        if (D.pairs) {
          kids.push(h('div', { class: 't3-grid2' }, Object.keys(D.cities).map((c) => {
            const city = D.cities[c];
            return h('section', { class: 't3-panel t3-city', 'data-city': c, 'aria-labelledby': 'fc-c-' + c },
              h('h2', { class: 't3-h', id: 'fc-c-' + c }, K.cityName(c)),
              city.rows.some((r) => r.f) ? chart(c, city.rows) : h('p', { class: 't3-note' }, T('No forecast saved for this city yet.', 'Δεν έχει αποθηκευτεί ακόμη πρόβλεψη για αυτή την πόλη.')),
              words(c, city), city.rows.length ? table(city) : null);
          })));
          kids.push(h('p', { class: 't3-note t3-foot' }, T('The cities are in a fixed order, not ranked. An error here says something about the model at that spot, not about a city or a school.', 'Οι πόλεις είναι σε σταθερή σειρά, όχι σε κατάταξη. Ένα σφάλμα εδώ λέει κάτι για το μοντέλο σε εκείνο το σημείο, όχι για μια πόλη ή ένα σχολείο.')));
        } else {
          kids.push(h('section', { class: 't3-panel' }, h('h2', { class: 't3-h' }, T('Saved and waiting', 'Αποθηκευμένες, σε αναμονή')),
            h('ul', { class: 't3-list' }, Object.keys(D.cities).map((c) => { const r = D.cities[c].rows.filter((x) => x.f).slice(-1)[0]; return h('li', null, h('b', null, K.cityName(c)), r ? T(' forecast for ' + dayLong(r.day) + ': highest ' + val(r.f.tmax, 'tmax') + ', lowest ' + val(r.f.tmin, 'tmin') + ' (weather model, saved ' + SC.dateTime(r.f.at) + ')', ' πρόβλεψη για ' + dayLong(r.day) + ': υψηλότερη ' + val(r.f.tmax, 'tmax') + ', χαμηλότερη ' + val(r.f.tmin, 'tmin') + ' (μοντέλο καιρού, αποθηκεύτηκε ' + SC.dateTime(r.f.at) + ')') : T(' nothing saved yet', ' τίποτα αποθηκευμένο ακόμη')); }))));
        }
      }
      host.replaceChildren(...kids);
      const ph = head.querySelector('.page-head'), old = ph.querySelector('.t.demo');
      if (old) old.remove();
      if (D.simulated) ph.insertBefore(h('span', { class: 't demo' }, T('Test mode: simulated numbers', 'Δοκιμαστική λειτουργία: προσομοιωμένοι αριθμοί')), ph.querySelector('.lede'));
    }

    async function load(first) {
      try {
        K = await lib();
        const d = await SC.api('/api/toolkit/forecast');
        if (!alive) return;
        if (!d || !d.cities) throw new Error(T('The answer had no cities in it.', 'Η απάντηση δεν είχε πόλεις.'));
        const sig = JSON.stringify([d.since, d.pairs, d.waiting, d.lastDay, d.error]);
        if (first || !D || sig !== load.sig) { load.sig = sig; D = d; draw(); }
      } catch (e) {
        if (!alive || (!first && D)) return;
        host.replaceChildren(h('div', { class: 'err', role: 'alert' }, T('The saved forecasts could not be loaded. ', 'Οι αποθηκευμένες προβλέψεις δεν φορτώθηκαν. ') + ((e && e.message) || '')),
          h('div', null, h('button', { class: 'nm-btn', type: 'button', onclick: () => { host.replaceChildren(h('p', { class: 't3-empty', role: 'status' }, T('Loading', 'Φόρτωση'))); load(true); } }, T('Try again', 'Δοκίμασε ξανά'))));
      }
    }
    load(true);
    timer = setInterval(() => { if (!document.hidden) load(false); }, 300000);
    return () => { alive = false; clearInterval(timer); };
  }

  SC.register('forecast', { title: ['Forecast against reality', 'Πρόβλεψη και πραγματικότητα'], render });
})();
