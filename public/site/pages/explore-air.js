/*
  Explore data: "My school sensor vs the nearest official station". A modest card under the five tools.
  Loaded on its own by explore.js (airSlot), so the five tools never depend on it: delete this file, explore-air.css and the
  airSlot lines in explore.js and nothing else changes.
  Data: /api/eea/compare (eea.js and metrics.js on the server do every calculation; this file only draws it and puts it in plain words).
  The distance is measured from the city centre, never from a sensor position: no position is printed or asked for here.
*/
(function () {
  'use strict';
  if (window.SCExploreAir) return;
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/explore-air.css');

  const HOUR = 3600000;
  const UG = 'µg/m³';
  const PM25 = /pm\s*2[._ ]?5/i;
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false)); return el; };
  const lang = (pair) => (Array.isArray(pair) ? (SC.lang === 'el' && pair[1]) || pair[0] : pair || '');
  const n0 = (v) => SC.num(v, 0), n1 = (v) => SC.num(v, 1), n2 = (v) => SC.num(v, 2);
  const sgn = (v, d) => (v == null || !isFinite(v) ? '–' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d == null ? 1 : d));
  const TYPE = { traffic: ['traffic station', 'σταθμός κυκλοφορίας'], background: ['background station', 'σταθμός υποβάθρου'], industrial: ['industrial station', 'βιομηχανικός σταθμός'] };
  const AREA = { urban: ['urban area', 'αστική περιοχή'], suburban: ['suburban area', 'προαστιακή περιοχή'], rural: ['rural area', 'αγροτική περιοχή'] };
  let uid = 0;

  /* ---------- the chart: two lines, hour by hour ---------- */
  const STEPS = [5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000];
  function chart(pairs, days, width) {
    const W = Math.max(280, Math.min(680, Math.round(width || 680))), H = W < 480 ? 210 : 232, L = 42, R = 12, Tp = 26, B = 28;   // drawn at the width it is shown at, so the letters stay readable on a phone
    const pts = pairs.filter((p) => isFinite(p[0])).sort((a, b) => a[0] - b[0]);
    if (pts.length < 2) return null;
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0] + HOUR;
    let max = 0;
    pts.forEach((p) => { if (p[1] != null) max = Math.max(max, p[1]); if (p[2] != null) max = Math.max(max, p[2]); });
    const top = STEPS.find((s) => s >= max) || Math.ceil(max / 100) * 100;
    const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
    const y = (v) => Tp + (1 - v / top) * (H - Tp - B);
    const line = (i) => {
      let d = '', prev = null;
      pts.forEach((p) => {
        if (p[i] == null) { prev = null; return; }
        d += (prev != null && p[0] - prev <= 1.5 * HOUR ? 'L' : 'M') + x(p[0] + HOUR / 2).toFixed(1) + ' ' + y(p[i]).toFixed(1);
        prev = p[0];
      });
      return d;
    };
    const svg = SC.svgEl('svg', { class: 'ea-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': T('Hourly PM2.5 of your sensor and of the official station, last ' + days + ' day' + (days === 1 ? '' : 's') + '. The numbers are in the table below.', 'Ωριαία PM2.5 του αισθητήρα σου και του επίσημου σταθμού, τελευταίες ' + days + (days === 1 ? ' ημέρα' : ' ημέρες') + '. Οι αριθμοί υπάρχουν στον πίνακα παρακάτω.') });
    [0, top / 2, top].forEach((v) => {
      svg.append(SC.svgEl('line', { class: 'ea-grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }), SC.svgEl('text', { class: 'ea-ax', x: L - 7, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
    });
    svg.append(SC.svgEl('text', { class: 'ea-ax', x: 4, y: 11, 'text-anchor': 'start' }, UG));
    // labels sit on whole hours (a day or less) or on Cyprus midnights (longer), so the dates never skip
    const short = (t1 - t0) <= 36 * HOUR, marks = [];
    for (let t = Math.ceil(t0 / HOUR) * HOUR; t < t1; t += HOUR) {
      const label = SC.time(t), hour = Number(label.slice(0, 2));
      if (short ? hour % 6 === 0 : label === '00:00') marks.push([t, short ? label : SC.date(t)]);
    }
    const every = Math.max(1, Math.ceil((marks.length * 52) / (W - L - R)));
    marks.filter((_, i) => i % every === 0).forEach(([t, label]) => {
      const px = x(t), edge = px < L + 22 ? 'start' : px > W - R - 22 ? 'end' : 'middle';
      svg.append(SC.svgEl('line', { class: 'ea-tick', x1: px, x2: px, y1: H - B, y2: H - B + 4 }), SC.svgEl('text', { class: 'ea-ax', x: px, y: H - 8, 'text-anchor': edge }, label));
    });
    svg.append(SC.svgEl('path', { class: 'ea-line ea-line-st', d: line(2) }), SC.svgEl('path', { class: 'ea-line ea-line-se', d: line(1) }));
    return svg;
  }
  const swatch = (cls) => SC.svgEl('svg', { class: 'ea-sw', viewBox: '0 0 30 8', width: 30, height: 8, 'aria-hidden': 'true' }, SC.svgEl('path', { class: 'ea-line ' + cls, d: 'M1 4H29' }));

  /* ---------- the scorecard rows, in plain words ---------- */
  const STATE = {
    pass: { glyph: '✓', en: 'Within the target', el: 'Μέσα στον στόχο' },
    fail: { glyph: '✕', en: 'Outside the target for now', el: 'Έξω από τον στόχο προς το παρόν' },
    na: { glyph: '–', en: 'Cannot say', el: 'Δεν μπορούμε να πούμε' },
    untested: { glyph: '○', en: 'Not tested', el: 'Δεν ελέγχθηκε' },
    novd: { glyph: '–', en: 'No verdict: too far', el: 'Χωρίς κρίση: πολύ μακριά' },
  };
  const ROW = {
    r2: {
      en: 'Goes up and down with the station', el: 'Ανεβοκατεβαίνει μαζί με τον σταθμό',
      hint: [' R² · 1.00 would be a perfect match', ' R² · το 1.00 θα ήταν τέλεια ταύτιση'],
      val: (r) => 'R² ' + n2(r.value), target: (r) => T(n2(r.target.min) + ' or more', n2(r.target.min) + ' ή περισσότερο'),
    },
    slope: {
      en: 'Size of the ups and downs', el: 'Μέγεθος των ανεβοκατεβασμάτων',
      hint: [' slope · 1.00 means the same size as the station', ' κλίση · το 1.00 σημαίνει ίδιο μέγεθος με τον σταθμό'],
      val: (r) => '× ' + n2(r.value), target: (r) => T('between ' + n2(r.target.min) + ' and ' + n2(r.target.max), 'από ' + n2(r.target.min) + ' έως ' + n2(r.target.max)),
    },
    intercept: {
      en: 'Reading when the station reads zero', el: 'Τιμή όταν ο σταθμός δείχνει μηδέν',
      hint: [' intercept · a steady offset', ' σταθερή μετατόπιση'],
      val: (r) => sgn(r.value) + ' ' + UG, target: (r) => T('between −' + Math.abs(r.target.min) + ' and +' + r.target.max + ' ' + UG, 'από −' + Math.abs(r.target.min) + ' έως +' + r.target.max + ' ' + UG),
    },
    error: {
      en: 'Typical gap from the station', el: 'Τυπική απόκλιση από τον σταθμό',
      hint: [' RMSE and NRMSE · either one is enough', ' RMSE και NRMSE · αρκεί το ένα'],
      val: (r) => (r.value == null ? '–' : 'RMSE ' + n1(r.value) + ' ' + UG) + (r.nrmse != null ? ' · NRMSE ' + n0(r.nrmse) + ' %' : ''),
      target: (r) => T('RMSE ' + r.target.rmseMax + ' ' + UG + ' or less, or NRMSE ' + r.target.nrmseMax + ' % or less', 'RMSE έως ' + r.target.rmseMax + ' ' + UG + ' ή NRMSE έως ' + r.target.nrmseMax + ' %'),
    },
    precision: {
      en: 'Identical sensors agree with each other', el: 'Ίδιοι αισθητήρες συμφωνούν μεταξύ τους',
      hint: [' precision · needs 3 identical sensors side by side', ' ακρίβεια επαναληψιμότητας · θέλει 3 ίδιους αισθητήρες δίπλα-δίπλα'],
      val: () => '–', target: () => T('not tested with one sensor', 'δεν ελέγχεται με έναν αισθητήρα'),
    },
  };

  function scoreList(c, noVerdict) {
    const rows = (c.scorecard && c.scorecard.rows) || [];
    return h('ul', { class: 'ea-rows', 'aria-label': T('Scorecard', 'Πίνακας αποτελεσμάτων') }, rows.map((r) => {
      const def = ROW[r.id];
      if (!def) return null;
      const key = noVerdict && r.state !== 'untested' ? 'novd' : r.state;
      const st = STATE[key] || STATE.na;
      return h('li', { class: 'ea-row ea-' + key },
        h('span', { class: 'ea-state' }, h('i', { 'aria-hidden': 'true' }, st.glyph), T(st.en, st.el)),
        h('span', { class: 'ea-what' }, h('b', null, T(def.en, def.el)), h('small', null, T(def.hint[0], def.hint[1]).trim())),
        h('span', { class: 'ea-val' }, def.val(r)),
        h('span', { class: 'ea-tgt' }, h('small', null, T('EPA target', 'Στόχος EPA')), def.target(r)));
    }));
  }

  function verdict(c) {
    const callout = (cls, ...kids) => h('div', { class: 'nm-callout ' + cls + ' ea-verdict', role: 'status' }, ...kids);
    if (c.coarse) return callout('nm-callout--info', T('This sensor sends a reading only about every ' + (c.sensor.stepMin || '?') + ' minutes: too rarely to compare hour by hour.', 'Αυτός ο αισθητήρας στέλνει μέτρηση μόνο περίπου κάθε ' + (c.sensor.stepMin || '?') + ' λεπτά: πολύ αραιά για σύγκριση ανά ώρα.'));
    if (!c.hourly || c.hourly.n < 3) return callout('nm-callout--info', T('Not enough hours with both readings yet (' + (c.hourly ? c.hourly.n : 0) + '). Come back later or choose a longer period.', 'Δεν υπάρχουν ακόμα αρκετές ώρες με και τις δύο μετρήσεις (' + (c.hourly ? c.hourly.n : 0) + '). Ξαναδές αργότερα ή διάλεξε μεγαλύτερη περίοδο.'));
    if (c.fairness === 'too-far' || c.fairness === 'unknown') return callout('nm-callout--warn', T('No verdict: the station is too far away to say anything fair about your sensor. The numbers are shown for curiosity only.', 'Χωρίς κρίση: ο σταθμός είναι πολύ μακριά για να πούμε κάτι δίκαιο για τον αισθητήρα σου. Οι αριθμοί φαίνονται μόνο για περιέργεια.'));
    const sc = c.scorecard;
    if (!sc) return callout('nm-callout--info', T('Too early for a verdict. We need ' + c.minDays + ' days with at least 18 hours of both readings, and so far there are ' + c.days.length + '. Choose 7 days, or come back later.', 'Είναι νωρίς για κρίση. Χρειαζόμαστε ' + c.minDays + ' ημέρες με τουλάχιστον 18 ώρες και από τις δύο μετρήσεις, και μέχρι τώρα υπάρχουν ' + c.days.length + '. Διάλεξε 7 ημέρες ή ξαναδές αργότερα.'));
    const n = c.days.length, p = sc.passed, t = sc.tested;
    if (sc.allPass) return callout('nm-callout--ok', h('b', null, T('Looks good. ', 'Φαίνεται καλό. ')), T('On these ' + n + ' days your sensor met all ' + t + ' of the numbers EPA suggests for PM2.5 sensors. That is a good sign for a low-cost sensor, not a certificate.', 'Αυτές τις ' + n + ' ημέρες ο αισθητήρας σου πέτυχε και τους ' + t + ' αριθμούς που προτείνει η EPA για αισθητήρες PM2.5. Είναι καλό σημάδι για έναν φθηνό αισθητήρα, όχι πιστοποιητικό.'));
    const gap = T(' Some of the gap can come from the distance and from the air being different where the station stands.', ' Μέρος της διαφοράς μπορεί να οφείλεται στην απόσταση και στο ότι ο αέρας είναι διαφορετικός εκεί που βρίσκεται ο σταθμός.');
    if (p === 0) return callout('nm-callout--warn', h('b', null, T('Not close yet. ', 'Όχι ακόμα κοντά. ')), T('On these ' + n + ' days your sensor met none of the ' + t + ' numbers EPA suggests for PM2.5 sensors.', 'Αυτές τις ' + n + ' ημέρες ο αισθητήρας σου δεν πέτυχε κανέναν από τους ' + t + ' αριθμούς που προτείνει η EPA για αισθητήρες PM2.5.') + gap);
    return callout('nm-callout--info', h('b', null, T('Partly close. ', 'Εν μέρει κοντά. ')), T('On these ' + n + ' days your sensor met ' + p + ' of the ' + t + ' numbers EPA suggests for PM2.5 sensors.', 'Αυτές τις ' + n + ' ημέρες ο αισθητήρας σου πέτυχε τους ' + p + ' από τους ' + t + ' αριθμούς που προτείνει η EPA για αισθητήρες PM2.5.') + gap);
  }

  /* ---------- one answer from the server ---------- */
  function stationBlock(c) {
    const st = c.station;
    const kind = [st.type && TYPE[st.type] ? lang(TYPE[st.type]) : null, st.area && AREA[st.area] ? lang(AREA[st.area]) : null].filter(Boolean).join(', ');
    const near = { near: T('Close enough for a fair look, but still not the same air.', 'Αρκετά κοντά για δίκαιη σύγκριση, αλλά όχι ακριβώς ο ίδιος αέρας.'), far: T('Far enough that the air can differ. A gap does not prove the sensor is wrong.', 'Αρκετά μακριά ώστε ο αέρας να διαφέρει. Μια διαφορά δεν αποδεικνύει ότι ο αισθητήρας είναι λάθος.'), 'too-far': T('Too far to judge the sensor: we show the numbers but write no verdict.', 'Πολύ μακριά για να κριθεί ο αισθητήρας: δείχνουμε τους αριθμούς αλλά δεν γράφουμε κρίση.'), unknown: T('We cannot tell the distance, so we write no verdict.', 'Δεν ξέρουμε την απόσταση, γι’ αυτό δεν γράφουμε κρίση.') }[c.fairness];
    return h('div', { class: 'ea-station' },
      h('div', null, h('small', null, T('Nearest official station with PM2.5', 'Πλησιέστερος επίσημος σταθμός με PM2.5')), h('b', null, st.name), kind ? h('span', null, kind) : null),
      h('div', null, h('small', null, T('Distance from the city centre (' + lang(c.sensor.place) + ')', 'Απόσταση από το κέντρο της πόλης (' + lang(c.sensor.place) + ')')), h('b', { class: 'ea-km' }, n1(st.distanceKm) + ' km'), h('span', null, near)));
  }

  function answer(c, days, width) {
    const pairs = c.pairs || [];
    const hs = c.hourly || {};
    const bias = hs.meanBias;
    const biasLine = bias == null ? null : h('p', { class: 'ea-bias' }, T('On average your sensor read ' + n1(Math.abs(bias)) + ' ' + UG + (bias >= 0 ? ' higher' : ' lower') + ' than the station' + (hs.meanBiasPct != null ? ' (' + n0(Math.abs(hs.meanBiasPct)) + ' %)' : '') + '.',
      'Κατά μέσο όρο ο αισθητήρας σου έδειξε ' + n1(Math.abs(bias)) + ' ' + UG + (bias >= 0 ? ' περισσότερο' : ' λιγότερο') + ' από τον σταθμό' + (hs.meanBiasPct != null ? ' (' + n0(Math.abs(hs.meanBiasPct)) + ' %)' : '') + '.'));
    const svg = pairs.length >= 2 ? chart(pairs, days, width - 26) : null;
    const rows = pairs.slice(-24).reverse();
    const noVerdict = c.fairness === 'too-far' || c.fairness === 'unknown';
    const age = c.eea && c.eea.ageMin != null ? SC.ago(Date.now() - c.eea.ageMin * 60000) : null;
    return [
      stationBlock(c),
      verdict(c),
      svg ? h('figure', { class: 'ea-fig' },
        h('div', { class: 'ea-legend' }, h('span', null, swatch('ea-line-se'), T('Your sensor', 'Ο αισθητήρας σου')), h('span', null, swatch('ea-line-st'), T('Official station (EEA)', 'Επίσημος σταθμός (EEA)'))),
        svg) : null,
      h('dl', { class: 'ea-stats' },
        [[T('Hours paired', 'Ώρες σε ζεύγη'), String(hs.n || 0)], [T('Days used', 'Ημέρες που μετρήθηκαν'), String(c.days.length)], [T('Sensor average', 'Μέσος όρος αισθητήρα'), n1(hs.meanSensor) + ' ' + UG], [T('Station average', 'Μέσος όρος σταθμού'), n1(hs.meanRef) + ' ' + UG]]
          .map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
      biasLine,
      c.scorecard ? h('div', { class: 'ea-score' }, h('h3', null, T('Scorecard against EPA’s numbers for PM2.5 sensors', 'Πίνακας με τους αριθμούς της EPA για αισθητήρες PM2.5')), h('p', { class: 'ea-scoresub' }, T('Computed on 24-hour averages of the ' + c.days.length + ' days above. EPA’s targets are a yardstick we borrow, not a pass mark.', 'Υπολογισμένο σε μέσους όρους 24 ωρών των ' + c.days.length + ' ημερών παραπάνω. Οι στόχοι της EPA είναι ένα μέτρο που δανειζόμαστε, όχι βάση επιτυχίας.')), scoreList(c, noVerdict)) : null,
      rows.length ? h('details', { class: 'ea-details' },
        h('summary', null, T('Show the hourly numbers (latest ' + rows.length + ' hours with both readings)', 'Δες τους ωριαίους αριθμούς (τελευταίες ' + rows.length + ' ώρες με και τις δύο μετρήσεις)')),
        h('div', { class: 'ea-tablewrap' }, h('table', { class: 'ea-table' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, T('Hour starting (Cyprus time)', 'Ώρα έναρξης (ώρα Κύπρου)')), h('th', { scope: 'col' }, T('Your sensor', 'Ο αισθητήρας σου') + ' (' + UG + ')'), h('th', { scope: 'col' }, T('Station', 'Σταθμός') + ' (' + UG + ')'), h('th', { scope: 'col' }, T('Difference', 'Διαφορά')))),
          h('tbody', null, rows.map((p) => h('tr', null, h('th', { scope: 'row' }, SC.date(p[0]) + ' ' + SC.time(p[0])), h('td', null, n1(p[1])), h('td', null, n1(p[2])), h('td', null, p[1] != null && p[2] != null ? sgn(p[1] - p[2]) : '–'))))))) : null,
      h('div', { class: 'ea-caveats' },
        h('h3', null, T('Read this before you trust a number', 'Διάβασέ το πριν εμπιστευτείς έναν αριθμό')),
        h('ul', null,
          h('li', null, h('b', null, T('Distance. ', 'Απόσταση. ')), T('The station is ' + n1(c.station.distanceKm) + ' km from the centre of ' + lang(c.sensor.place) + '. Air can differ a lot between a school yard and a station next to a road or a factory. A gap is not proof that the sensor is wrong.', 'Ο σταθμός απέχει ' + n1(c.station.distanceKm) + ' km από το κέντρο της πόλης (' + lang(c.sensor.place) + '). Ο αέρας μπορεί να διαφέρει πολύ ανάμεσα στην αυλή ενός σχολείου και σε έναν σταθμό δίπλα σε δρόμο ή εργοστάσιο. Μια διαφορά δεν αποδεικνύει ότι ο αισθητήρας είναι λάθος.')),
          h('li', null, h('b', null, T('Low-cost optical sensor. ', 'Φθηνός οπτικός αισθητήρας. ')), T('Our sensor estimates the dust from how light bounces off the particles. It can read too high in humid air or fog, and it is not a reference instrument.', 'Ο αισθητήρας μας εκτιμά τη σκόνη από το πώς σκεδάζεται το φως στα σωματίδια. Μπορεί να δείχνει πολύ υψηλές τιμές με υγρό αέρα ή ομίχλη και δεν είναι όργανο αναφοράς.')),
          h('li', null, h('b', null, T('Indicative only. ', 'Μόνο ενδεικτικό. ')), T('The station values are the newest the EEA has and nobody has checked them yet. EPA’s real test uses 3 identical sensors beside a station for at least ' + c.epaDays + ' days. This is not that test, so we never call a sensor certified.', 'Οι τιμές του σταθμού είναι οι πιο πρόσφατες του EEA και κανείς δεν τις έχει ελέγξει ακόμα. Ο πραγματικός έλεγχος της EPA χρησιμοποιεί 3 ίδιους αισθητήρες δίπλα σε σταθμό για τουλάχιστον ' + c.epaDays + ' ημέρες. Αυτός δεν είναι εκείνος ο έλεγχος, γι’ αυτό δεν λέμε ποτέ ότι ένας αισθητήρας είναι πιστοποιημένος.')))),
      h('p', { class: 'ea-credit' },
        T('Station data: European Environment Agency (EEA), Air Quality Download Service, reported by the Cyprus Department of Labour Inspection' + (age ? '; checked with the EEA ' + age : '') + '. Yardstick: ', 'Δεδομένα σταθμού: Ευρωπαϊκός Οργανισμός Περιβάλλοντος (EEA), Air Quality Download Service, όπως τα αναφέρει το Τμήμα Επιθεώρησης Εργασίας της Κύπρου' + (age ? '· έλεγχος με τον EEA ' + age : '') + '. Μέτρο σύγκρισης: '),
        h('a', { href: (c.targets && c.targets.source) || 'https://www.epa.gov/', target: '_blank', rel: 'noopener noreferrer' }, T('U.S. EPA recommended targets for PM2.5 sensors', 'προτεινόμενοι στόχοι της U.S. EPA για αισθητήρες PM2.5')),
        T(' (24-hour averages).', ' (μέσοι όροι 24 ωρών).')),
    ];
  }

  /* ---------- the card ---------- */
  const REASONS = {
    'no-place': [
      'We cannot tell from the sensor’s name or group which city it is in, so we cannot choose a station. Ask a teacher to put the city name in the sensor’s group.',
      'Δεν μπορούμε να καταλάβουμε από το όνομα ή την ομάδα του αισθητήρα σε ποια πόλη βρίσκεται, οπότε δεν μπορούμε να διαλέξουμε σταθμό. Ζήτα από έναν εκπαιδευτικό να βάλει το όνομα της πόλης στην ομάδα του αισθητήρα.'],
    'not-pm25': ['This reading is not PM2.5, so it cannot be compared here.', 'Αυτή η μέτρηση δεν είναι PM2.5, οπότε δεν μπορεί να συγκριθεί εδώ.'],
    'unknown-sensor': ['We could not find this sensor just now.', 'Δεν βρήκαμε αυτόν τον αισθητήρα αυτή τη στιγμή.'],
    'sensor-series-failed': ['The sensor’s readings could not be loaded just now. Try again in a minute.', 'Οι μετρήσεις του αισθητήρα δεν φορτώθηκαν αυτή τη στιγμή. Δοκίμασε ξανά σε ένα λεπτό.'],
  };
  const DOWN = ['Official station data is not available right now. Our server asks the EEA again every hour, so try again later. This is about the station data, not about your sensor.', 'Τα δεδομένα των επίσημων σταθμών δεν είναι διαθέσιμα αυτή τη στιγμή. Ο διακομιστής μας ρωτά ξανά τον EEA κάθε ώρα, οπότε δοκίμασε ξανά αργότερα. Αφορά τα δεδομένα του σταθμού, όχι τον αισθητήρα σου.'];

  function mount(host, o) {
    const sensors = (o && o.sensors) || [], names = (o && o.names) || {};
    const alive = (o && o.alive) || (() => true);
    const opts = [];
    sensors.forEach((s) => (s.mids || []).forEach((mid) => { const nm = names[mid]; if (nm && PM25.test(String(nm[0]))) opts.push({ eui: s.eui, mid: String(mid), label: s.name + (s.group && s.group !== s.name ? ' · ' + s.group : '') }); }));
    const id = 'ea' + ++uid;
    const card = h('section', { class: 'nm-card ex-br ea-card', 'aria-labelledby': id + '-t' });
    const head = h('div', { class: 'card-h' }, h('span', { class: 'kpi-label', id: id + '-t' }, T('My school sensor vs the nearest official station', 'Ο αισθητήρας του σχολείου μου και ο πλησιέστερος επίσημος σταθμός')));
    card.append(head, h('p', { class: 'ea-intro' }, T('Pick one of our PM2.5 sensors. We put its hourly readings next to the nearest official station of the European Environment Agency (EEA) and say in plain words how close they are. This is a classroom comparison, not a test.', 'Διάλεξε έναν από τους αισθητήρες PM2.5 που έχουμε. Βάζουμε τις ωριαίες μετρήσεις του δίπλα στον πλησιέστερο επίσημο σταθμό του Ευρωπαϊκού Οργανισμού Περιβάλλοντος (EEA) και λέμε με απλά λόγια πόσο κοντά είναι. Είναι σύγκριση για την τάξη, όχι έλεγχος.')));
    host.append(card);
    if (!opts.length) {
      card.append(h('div', { class: 'empty', role: 'status' }, T('None of the school sensors that report right now measures PM2.5, the small particles. When one does, you can compare it here with the official station.', 'Κανένας από τους αισθητήρες των σχολείων που αναφέρουν τώρα δεν μετρά PM2.5, τα μικρά σωματίδια. Όταν κάποιος αρχίσει να τα μετρά, θα μπορείς να τον συγκρίνεις εδώ με τον επίσημο σταθμό.')));
      return () => { card.remove(); };
    }
    let cur = opts[0], days = 7, tok = 0, last = null, drawn = 0, ro = null;
    const sel = h('select', { id: id + '-s', class: 'ex-sel', onchange: () => { cur = opts[Number(sel.value)] || opts[0]; run(); } }, opts.map((x, i) => h('option', { value: String(i) }, x.label)));
    const rng = h('span', { class: 'ex-rng', role: 'group', 'aria-label': T('Period', 'Περίοδος') });
    const btns = new Map();
    const setDays = (d) => btns.forEach((b, k) => { b.classList.toggle('on', k === d); b.setAttribute('aria-pressed', String(k === d)); });
    [[1, T('24 hours', '24 ώρες')], [3, T('3 days', '3 ημέρες')], [7, T('7 days', '7 ημέρες')]].forEach(([d, text]) => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { days = d; setDays(d); run(); } }, text); btns.set(d, b); rng.append(b); });
    setDays(days);
    head.append(rng);
    const out = h('div', { class: 'ea-out', 'aria-live': 'polite' });
    card.append(h('div', { class: 'ea-pick ex-pick' }, h('label', { for: id + '-s' }, T('School sensor', 'Αισθητήρας σχολείου')), sel), out);

    const retry = () => run(true);
    const problem = (reason) => {
      const down = !reason || reason === 'eea-unavailable' || reason === 'no-station-pm25' || reason === 'error' || reason === 'no-sensor-data';
      const text = down ? DOWN : REASONS[reason] || DOWN;
      return h('div', { class: 'ea-problem ' + (down ? 'ea-down' : ''), role: 'status' }, h('p', null, T(text[0], text[1])), h('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκίμασε ξανά')));
    };
    async function run(fresh) {
      const my = ++tok;
      fill(out, h('div', { class: 'loading', role: 'status' }, T('Comparing the two', 'Σύγκριση των δύο')));
      const url = '/api/eea/compare?eui=' + encodeURIComponent(cur.eui) + '&mid=' + encodeURIComponent(cur.mid) + '&days=' + days;
      let c;
      try { c = await (fresh ? SC.api(url) : SC.cached(url, 60000)); } catch (e) { c = { ok: false, reason: 'error' }; }
      if (my !== tok || !alive()) return;
      last = c && c.ok === true ? { c, days } : null;
      try { drawn = out.clientWidth; fill(out, last ? answer(c, days, drawn) : problem(c && c.reason)); } catch (e) { fill(out, problem('error')); }
    }
    run();
    // turning the phone: draw the chart again at the new width
    if (typeof ResizeObserver === 'function') {
      let timer = 0;
      ro = new ResizeObserver(() => { clearTimeout(timer); timer = setTimeout(() => { if (last && alive() && out.isConnected && Math.abs(out.clientWidth - drawn) > 40) { try { drawn = out.clientWidth; fill(out, answer(last.c, last.days, drawn)); } catch (e) { /* keep what is shown */ } } }, 150); });
      ro.observe(out);
    }
    return () => { tok++; if (ro) ro.disconnect(); card.remove(); };
  }

  window.SCExploreAir = { mount };
})();
