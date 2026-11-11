/*
  Follow one trip: replay one vehicle on one day on the stylised island, with a reading along the way.
    Vehicle and day come from /api/trails (the public view: positions at least 2 hours old, rounded to about 1 km, repeats removed).
    The reading (temperature, humidity or CO2) comes from /api/series and is read at the time of the dot, so the route is coloured by it
    and a small chart shows the whole trip with a marker that moves with the dot.
  Privacy: the page never prints a coordinate. A position is only ever put in words ("about 2 km north-east of Larnaka"), and it is the
    rounded one. A signed-in teacher gets the exact trail from the server (cfg.exactPositions) and the page draws it as given, still
    without printing it. Nothing here shows a student name or a photo. The dot glides in a straight line between two reported
    positions, which is not the road, and the page says so.
  Sources: /api/config /api/devices /api/trails /api/series. Route: #/trip, #/trip/<eui>, optional ?day=YYYY-MM-DD&mid=4097|4098|4100.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/trip.css');
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };
  const MIN = 60000, HOUR = 3600000, DAY = 86400000, GAP = 100 * MIN;
  const KM_PER_UNIT = 111.2 / 523.48;   // one unit of the island picture, in km (island.js: 1 degree of latitude is 523.48 units)
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enc = encodeURIComponent;

  function loadCore() {
    if (window.SC && SC.alerts) return Promise.resolve();
    return new Promise((ok, no) => {
      let s = document.getElementById('alerts-core');
      if (!s) { s = document.createElement('script'); s.id = 'alerts-core'; s.src = '/site/alerts-core.js'; document.head.append(s); }
      let n = 0;
      const poll = setInterval(() => { if (SC.alerts) { clearInterval(poll); ok(); } else if (++n > 100) { clearInterval(poll); no(new Error('alerts-core.js could not be loaded')); } }, 50);
    });
  }

  /* ---------- readings that can colour the route ---------- */
  const READ = [
    { k: 'temp', mid: '4097', name: ['Temperature', 'Θερμοκρασία'], unit: '°C', dec: 1, stops: ['#4CCBEA', '#F2CF86', '#E07F3F'] },
    { k: 'hum', mid: '4098', name: ['Humidity', 'Υγρασία'], unit: '%', dec: 0, stops: ['#F2CF86', '#4CCBEA', '#4F7BE0'] },
    { k: 'co2', mid: '4100', name: ['CO2', 'CO2'], unit: 'ppm', dec: 0, stops: ['#59d98e', '#F0B94A', '#FF7A6A'] },
  ];
  const rname = (r) => T(r.name[0], r.name[1]);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function ramp(stops, u) {   // u 0..1 along the stops
    u = Math.max(0, Math.min(1, u));
    const x = u * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i, a = hex(stops[i]), b = hex(stops[i + 1]);
    return 'rgb(' + a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(',') + ')';
  }

  /* ---------- a position in words (never a coordinate), as on the Vehicles page ---------- */
  const SCH = [
    { id: 'larnaka', en: 'PASCAL Larnaka', el: 'PASCAL Λάρνακα' },
    { id: 'lefkosia', en: 'PASCAL Lefkosia', el: 'PASCAL Λευκωσία' },
    { id: 'limassol', en: 'PASCAL Limassol', el: 'PASCAL Λεμεσός' },
    { id: 'paphos', en: 'International School of Paphos', el: 'Διεθνές Σχολείο Πάφου', gen: 'Διεθνούς Σχολείου Πάφου' },
  ];
  const TOWNS = [
    { en: 'Lefkosia', acc: 'τη Λευκωσία', gen: 'της Λευκωσίας', lat: 35.1856, lng: 33.3823 },
    { en: 'Limassol', acc: 'τη Λεμεσό', gen: 'της Λεμεσού', lat: 34.6841, lng: 33.0379 },
    { en: 'Larnaka', acc: 'τη Λάρνακα', gen: 'της Λάρνακας', lat: 34.9229, lng: 33.6233 },
    { en: 'Paphos', acc: 'την Πάφο', gen: 'της Πάφου', lat: 34.7720, lng: 32.4297 },
    { en: 'Famagusta', acc: 'την Αμμόχωστο', gen: 'της Αμμοχώστου', lat: 35.1264, lng: 33.9419 },
    { en: 'Paralimni', acc: 'το Παραλίμνι', gen: 'του Παραλιμνίου', lat: 35.0381, lng: 33.9836 },
    { en: 'Ayia Napa', acc: 'την Αγία Νάπα', gen: 'της Αγίας Νάπας', lat: 34.9882, lng: 34.0125 },
    { en: 'Troodos', acc: 'το Τρόοδος', gen: 'του Τροόδους', lat: 34.9333, lng: 32.8667 },
    { en: 'Kakopetria', acc: 'την Κακοπετριά', gen: 'της Κακοπετριάς', lat: 34.9917, lng: 32.9 },
    { en: 'Agros', acc: 'τον Άγρο', gen: 'του Άγρου', lat: 34.9149, lng: 33.0157 },
    { en: 'Lefkara', acc: 'τα Λεύκαρα', gen: 'των Λευκάρων', lat: 34.8667, lng: 33.3 },
    { en: 'Polis', acc: 'την Πόλη Χρυσοχούς', gen: 'της Πόλης Χρυσοχούς', lat: 35.0361, lng: 32.4258 },
    { en: 'Pissouri', acc: 'το Πισσούρι', gen: 'του Πισσουρίου', lat: 34.67, lng: 32.7 },
  ];
  const DIR_EN = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const DIR_EL = ['βόρεια', 'βορειοανατολικά', 'ανατολικά', 'νοτιοανατολικά', 'νότια', 'νοτιοδυτικά', 'δυτικά', 'βορειοδυτικά'];
  const rad = (d) => d * Math.PI / 180;
  function km(a, b, c, d) {
    const dLat = rad(c - a), dLng = rad(d - b), x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }
  function bearing(a, b, c, d) {
    const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  const roundKm = (k) => Math.max(1, k < 20 ? Math.round(k) : Math.round(k / 5) * 5);
  function describe(lat, lng) {   // lower-case words to follow "At 14:20, "
    let bs = null;
    ((window.ISLAND && ISLAND.schools) || []).forEach((s) => { const k = km(lat, lng, s.lat, s.lng); if (!bs || k < bs.k) bs = { k, s, n: SCH.find((x) => x.id === s.id) }; });
    if (bs && bs.n && bs.k <= 1.5) return T('near ' + bs.n.en, 'κοντά στο ' + bs.n.el);
    let ref = null;
    if (bs && bs.n && bs.k <= 3) ref = { en: bs.n.en, acc: 'το ' + bs.n.el, gen: 'του ' + (bs.n.gen || bs.n.el), k: bs.k, p: bs.s };
    else TOWNS.forEach((t) => { const k = km(lat, lng, t.lat, t.lng); if (!ref || k < ref.k) ref = { en: t.en, acc: t.acc, gen: t.gen, k, p: t }; });
    if (!ref) return T('in Cyprus', 'στην Κύπρο');
    const r = roundKm(ref.k);
    if (ref.k < 2.5) return T('about ' + r + ' km from ' + ref.en, 'περίπου ' + r + ' χλμ. από ' + ref.acc);
    const i = Math.round(bearing(ref.p.lat, ref.p.lng, lat, lng) / 45) % 8;
    return T('about ' + r + ' km ' + DIR_EN[i] + ' of ' + ref.en, 'περίπου ' + r + ' χλμ. ' + DIR_EL[i] + ' ' + ref.gen);
  }

  const PATH = {
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor" stroke="none"/>',
    back: '<path d="M4 4.5v15M20 5v14l-11-7z" fill="none"/>',
    shield: '<path d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6z"/>',
  };
  function ico(name) {
    const s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'tr-ico' });
    s.innerHTML = PATH[name] || '';   // static strings above, never data
    return s;
  }

  /* ---------- trips out of the trails ---------- */
  function buildVehicles(trails, devices, exact, delayMs, grid) {
    const byEui = new Map(devices.map((d) => [d.eui, d]));
    const now = Date.now(), g = grid > 0 ? grid : 0.01, out = [];
    Object.keys(trails || {}).forEach((eui) => {
      let pts = (trails[eui] || []).map((r) => ({ t: Number(r[0]), lat: Number(r[1]), lng: Number(r[2]) })).filter((p) => fin(p.t) && fin(p.lat) && fin(p.lng)).sort((a, b) => a.t - b.t);
      if (!exact) {   // the server already does this for visitors; doing it again costs nothing and keeps a stray exact point off the page
        pts = pts.filter((p) => p.t <= now - delayMs).map((p) => ({ t: p.t, lat: Math.round(p.lat / g) * g, lng: Math.round(p.lng / g) * g }));
        pts = pts.filter((p, i) => !i || p.lat.toFixed(4) !== pts[i - 1].lat.toFixed(4) || p.lng.toFixed(4) !== pts[i - 1].lng.toFixed(4));
      }
      const days = new Map();
      pts.forEach((p) => { const k = SC.alerts.cyDay(p.t); if (!days.has(k)) days.set(k, []); days.get(k).push(p); });
      const list = [];
      days.forEach((arr, key) => {
        const distinct = new Set(arr.map((p) => p.lat.toFixed(4) + ',' + p.lng.toFixed(4))).size;
        if (arr.length >= 3 && distinct >= 2) list.push({ key, pts: arr });
      });
      if (!list.length) return;
      list.sort((a, b) => (a.key < b.key ? -1 : 1));
      const d = byEui.get(eui);
      out.push({ eui, name: (d && d.name) || T('Vehicle', 'Όχημα'), measurements: d && Array.isArray(d.measurements) ? d.measurements.map(String) : null, days: list, last: list[list.length - 1].pts[list[list.length - 1].pts.length - 1].t });
    });
    out.sort((a, b) => (a.name < b.name ? -1 : 1));
    return out;
  }

  function valueAt(ser, t) {   // linear between two readings, but never across a long gap
    if (!ser || !ser.length) return null;
    const n = ser.length;
    if (t <= ser[0].t) return ser[0].t - t <= GAP / 2 ? ser[0].v : null;
    if (t >= ser[n - 1].t) return t - ser[n - 1].t <= GAP / 2 ? ser[n - 1].v : null;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ser[m].t <= t) lo = m; else hi = m; }
    const a = ser[lo], b = ser[hi];
    if (b.t - a.t > GAP) return t - a.t <= GAP / 2 ? a.v : b.t - t <= GAP / 2 ? b.v : null;
    return a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1, b.t - a.t);
  }
  const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

  SC.register('trip', {
    title: ['Follow one trip', 'Ακολουθήστε μία διαδρομή'],
    async render(root, ctx) {
      await loadCore();
      const A = SC.alerts;
      const dayFmt = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'Asia/Nicosia', weekday: 'short', day: 'numeric', month: 'short' });
      const dayLong = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'Asia/Nicosia', weekday: 'long', day: 'numeric', month: 'long' });
      const keyMs = (key) => Date.parse(key + 'T12:00:00Z');
      const dayLabel = (key) => (key === A.cyDay() ? T('Today', 'Σήμερα') : key === A.cyDay(Date.now() - DAY) ? T('Yesterday', 'Χθες') : dayFmt.format(keyMs(key)));

      const head = SC.head({
        title: T('Follow one trip', 'Ακολουθήστε μία διαδρομή'), fresh: T('Loading…', 'Φόρτωση…'),
        lede: T('Replay one day of one vehicle on the island, with a reading along the way. Positions are rounded to about 1 km and are at least 2 hours late.', 'Επαναλάβετε μία ημέρα ενός οχήματος στο νησί, με μια μέτρηση κατά μήκος της διαδρομής. Οι θέσεις είναι στρογγυλοποιημένες στο 1 χλμ. περίπου και έχουν καθυστέρηση τουλάχιστον 2 ωρών.'),
        help: ['Pick a vehicle and a day. The dot then replays that trip on the island: press Play, change the speed, or drag the slider to any moment. Choose temperature, humidity or CO2 and the route is coloured by that reading from the vehicle’s own sensor, with a chart below that follows the dot. Positions are published at least 2 hours late and rounded to about 1 km to protect the students on board, so this is a replay of the past and never shows where a vehicle is now. The page never prints a coordinate, it only says where in words. The dot glides in a straight line between two reported positions, so it is not the road the vehicle took. Teachers who sign in see the exact route.',
          'Διαλέξτε ένα όχημα και μια ημέρα. Η κουκκίδα επαναλαμβάνει τη διαδρομή στο νησί: πατήστε Αναπαραγωγή, αλλάξτε ταχύτητα ή σύρετε το ρυθμιστικό σε οποιαδήποτε στιγμή. Διαλέξτε θερμοκρασία, υγρασία ή CO2 και η διαδρομή χρωματίζεται με αυτή τη μέτρηση από τον αισθητήρα του οχήματος, με ένα γράφημα από κάτω που ακολουθεί την κουκκίδα. Οι θέσεις δημοσιεύονται με καθυστέρηση τουλάχιστον 2 ωρών και στρογγυλοποιημένες στο 1 χλμ., για την προστασία των μαθητών που επιβαίνουν. Έτσι αυτή είναι επανάληψη του παρελθόντος και δεν δείχνει ποτέ πού βρίσκεται ένα όχημα τώρα. Η σελίδα δεν γράφει ποτέ συντεταγμένες, μόνο πού βρίσκεται με λόγια. Η κουκκίδα γλιστρά σε ευθεία γραμμή ανάμεσα σε δύο καταγεγραμμένες θέσεις, άρα δεν είναι ο δρόμος που ακολούθησε το όχημα. Οι εκπαιδευτικοί που συνδέονται βλέπουν την ακριβή διαδρομή.'],
      });
      root.append(head);
      const pill = head.querySelector('.fresh-pill'), pageHead = head.querySelector('.page-head'), lede = head.querySelector('.lede');
      const noteBox = el('div', { class: 'tr-note-wrap' });
      const pickBox = el('section', { class: 'nm-card tr-pick', 'aria-label': T('Choose a trip', 'Επιλογή διαδρομής') });
      const mapCard = el('section', { class: 'nm-card tr-mapcard', 'aria-label': T('The route', 'Η διαδρομή') });
      const readCard = el('section', { class: 'nm-card tr-readcard', 'aria-label': T('Readings along the way', 'Μετρήσεις κατά μήκος της διαδρομής') });
      root.append(noteBox, pickBox, el('div', { class: 'tr-grid' }, mapCard, readCard));

      const S = { cfg: { names: {} }, devices: [], vehicles: [], eui: null, day: null, kind: 'temp', exact: false, delayMs: 120 * MIN, grid: 0.01,
        pts: [], xy: [], times: [], n: 0, cum: [], p: 0, playing: false, speed: 1, series: {}, tok: 0, raf: 0, last: 0, stepAt: 0, bright: 0, seg: [], loadErr: null, loaded: false };
      let alive = true, M = null, CH = null;   // M: the map's moving parts, CH: the chart's
      const vehicle = () => S.vehicles.find((v) => v.eui === S.eui);
      const dayOf = () => { const v = vehicle(); return v && v.days.find((d) => d.key === S.day); };
      const R = () => READ.find((r) => r.k === S.kind);
      const delayH = () => Math.max(1, Math.round(S.delayMs / HOUR));
      const gridKm = () => Math.max(1, Math.round(S.grid * 111.2));

      /* ----- head and the privacy note ----- */
      function paintHead() {
        const last = S.vehicles.length ? Math.max(...S.vehicles.map((v) => v.last)) : 0;
        if (S.loadErr) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('Trips unavailable', 'Οι διαδρομές δεν είναι διαθέσιμες'); }
        else if (!last) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('No trips yet', 'Καμία διαδρομή ακόμα'); }
        else { pill.className = 'fresh-pill'; pill.lastChild.textContent = T('Positions up to ' + SC.time(last), 'Θέσεις έως ' + SC.time(last)); }
        const has = pageHead.querySelector('.t.demo');
        if (S.cfg && S.cfg.demo && !has) pageHead.insertBefore(el('span', { class: 't demo' }, T('Demo data', 'Δεδομένα επίδειξης')), lede);
        if (!(S.cfg && S.cfg.demo) && has) has.remove();
        const h = delayH(), g = gridKm();
        fill(noteBox, el('div', { class: 'tr-note' }, ico('shield'), el('div', null,
          S.exact
            ? [el('b', null, T('You are signed in as a teacher, so this route is exact.', 'Έχετε συνδεθεί ως εκπαιδευτικός, άρα η διαδρομή είναι ακριβής.')), ' ', T('It is drawn as the server gives it to you. This page still never prints a coordinate, and visitors see the route about ' + g + ' km out and at least ' + h + ' hours late.', 'Σχεδιάζεται όπως την δίνει ο διακομιστής. Η σελίδα εξακολουθεί να μην γράφει ποτέ συντεταγμένες και οι επισκέπτες βλέπουν τη διαδρομή με απόκλιση περίπου ' + g + ' χλμ. και καθυστέρηση τουλάχιστον ' + h + ' ωρών.')]
            : [el('b', null, T('Positions are about ' + g + ' km out and at least ' + h + ' hours late.', 'Οι θέσεις έχουν απόκλιση περίπου ' + g + ' χλμ. και καθυστέρηση τουλάχιστον ' + h + ' ωρών.')), ' ', T('This protects the students on board, so you are watching a replay of the past, never where a vehicle is now. Teachers see the exact route after signing in.', 'Αυτό προστατεύει τους μαθητές που επιβαίνουν, άρα βλέπετε επανάληψη του παρελθόντος και ποτέ πού βρίσκεται ένα όχημα τώρα. Οι εκπαιδευτικοί βλέπουν την ακριβή διαδρομή μετά τη σύνδεση.')])));
      }

      /* ----- vehicle and day pickers ----- */
      function paintPick() {
        const v = vehicle();
        const sel = el('select', { class: 'nm-input', id: 'tr-veh', onchange: (e) => { choose(e.target.value, null); } },
          S.vehicles.map((x) => el('option', { value: x.eui, selected: x.eui === S.eui || null }, x.name)));
        fill(pickBox,
          el('div', { class: 'tr-pickrow' },
            el('label', { class: 'tr-lab', for: 'tr-veh' }, T('Vehicle', 'Όχημα'), sel),
            el('div', { class: 'tr-lab' }, el('span', { id: 'tr-days-l' }, T('Day', 'Ημέρα')),
              el('div', { class: 'tr-days', role: 'group', 'aria-labelledby': 'tr-days-l' }, v ? v.days.map((d) => el('button', { type: 'button', class: 'tr-day', 'aria-pressed': d.key === S.day ? 'true' : 'false', onclick: () => choose(S.eui, d.key) },
                el('b', null, dayLabel(d.key)), el('small', null, T(A.num(d.pts.length) + ' positions', A.num(d.pts.length) + ' θέσεις'))))
                : null))));
      }

      /* ----- choosing a trip ----- */
      function choose(eui, day) {
        const v = S.vehicles.find((x) => x.eui === eui) || S.vehicles[0];
        if (!v) return;
        S.eui = v.eui;
        S.day = day && v.days.some((d) => d.key === day) ? day : (v.days.some((d) => d.key === S.day) ? S.day : v.days[v.days.length - 1].key);
        try { history.replaceState(null, '', '#/trip/' + enc(S.eui) + '?day=' + S.day + (S.kind !== 'temp' ? '&mid=' + R().mid : '')); } catch (e) { /* ignore */ }
        paintPick();
        openTrip();
      }

      function pause() { S.playing = false; cancelAnimationFrame(S.raf); paintPlay(); }
      function openTrip() {
        pause();
        const d = dayOf(), tok = ++S.tok;
        if (!d) return;
        S.pts = d.pts; S.n = d.pts.length; S.times = d.pts.map((p) => p.t);
        S.xy = d.pts.map((p) => ISLAND.project(p.lng, p.lat));
        S.p = 0; S.bright = 0; S.series = {};
        drawMap();
        drawControls();
        paintReadings();
        setP(0);
        loadSeries(tok);
      }
      async function loadSeries(tok) {
        const v = vehicle(), t0 = S.times[0] - 2 * HOUR, t1 = S.times[S.n - 1] + 2 * HOUR;
        const days = Math.max(2, Math.min(10, Math.ceil((Date.now() - t0) / DAY) + 1));
        const kinds = READ.filter((r) => !v.measurements || v.measurements.includes(r.mid));
        await Promise.all(kinds.map(async (r) => {
          const res = await settle(A.readSeries(v.eui, r.mid, days));
          if (!alive || tok !== S.tok) return;
          S.series[r.mid] = res.ok ? { pts: res.v.filter((p) => p.t >= t0 && p.t <= t1) } : { err: res.e };
          if (r.k === S.kind) { colourRoute(); paintReadings(); setP(S.p); }
        }));
        if (!alive || tok !== S.tok) return;
        paintReadings();
      }

      /* ----- the map ----- */
      function drawMap() {
        const n = S.n, xy = S.xy;
        if (!window.ISLAND || !ISLAND.districts) { fill(mapCard, el('div', { class: 'err', role: 'alert' }, T('The island picture could not be loaded.', 'Η εικόνα του νησιού δεν φορτώθηκε.'))); M = null; return; }
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        xy.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
        const ASP = 0.62, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        let vw = Math.max((x1 - x0) * 1.35 + 20, 80), vh = vw * ASP;
        if ((y1 - y0) * 1.35 + 14 > vh) { vh = (y1 - y0) * 1.35 + 14; vw = vh / ASP; }
        const vx = cx - vw / 2, vy = cy - vh / 2, fs = vw / 40, rr = vw / 75;
        const svg = sv('svg', { viewBox: [vx, vy, vw, vh].map((x) => x.toFixed(2)).join(' '), class: 'tr-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet',
          'aria-label': T('Map of the island with the route of the trip', 'Χάρτης του νησιού με τη διαδρομή της διαδρομής') });
        svg.append(sv('g', null, Object.keys(ISLAND.districts).map((k) => sv('path', { d: ISLAND.districts[k], class: 'tr-land' }))));
        if (!S.exact) {   // the grid the public positions are rounded to: every dot sits on a crossing
          const g = S.grid, lng0 = ISLAND.bbox[0], lat0 = ISLAND.bbox[1];
          const gx = g * ISLAND.k * ISLAND.sx, gy = g * ISLAND.sx;
          if (gx > 0 && gy > 0 && vw / gx < 70) {
            let d = '';
            for (let x = Math.ceil((vx - 0 - (lng0 * 0)) / gx) * gx; x <= vx + vw; x += gx) d += 'M' + x.toFixed(2) + ' ' + vy.toFixed(2) + 'V' + (vy + vh).toFixed(2);
            const yBase = ISLAND.H - 0;   // y of the southern edge of the picture is ISLAND.H, lat0
            for (let y = yBase - Math.floor((yBase - vy) / gy) * gy; y <= vy + vh; y += gy) d += 'M' + vx.toFixed(2) + ' ' + y.toFixed(2) + 'H' + (vx + vw).toFixed(2);
            svg.append(sv('path', { d, class: 'tr-grid-l' }));
          }
        }
        // schools that are in view
        const sg = sv('g', { class: 'tr-schools' });
        (ISLAND.schools || []).forEach((s) => {
          const [x, y] = ISLAND.project(s.lng, s.lat);
          if (x < vx + 2 || x > vx + vw - 2 || y < vy + 2 || y > vy + vh - 2) return;
          const nm = SCH.find((q) => q.id === s.id);
          sg.append(sv('rect', { x: (x - rr * 0.9).toFixed(2), y: (y - rr * 0.9).toFixed(2), width: (rr * 1.8).toFixed(2), height: (rr * 1.8).toFixed(2), rx: (rr * 0.35).toFixed(2), class: 'tr-school' }),
            sv('text', { x: (x + rr * 1.6).toFixed(2), y: (y + fs * 0.35).toFixed(2), 'font-size': fs.toFixed(2), class: 'tr-lbl tr-lbl-s' }, nm ? T(nm.en, nm.el) : s.name));
        });
        svg.append(sg);
        // the route: a dark casing, then one short piece per step so each can carry a colour
        const dAll = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('');
        svg.append(sv('path', { d: dAll, class: 'tr-casing' }));
        const seg = [], rg = sv('g', { class: 'tr-route' });
        for (let i = 0; i < n - 1; i++) {
          const a = xy[i], b = xy[i + 1];
          const l = sv('line', { x1: a[0].toFixed(2), y1: a[1].toFixed(2), x2: b[0].toFixed(2), y2: b[1].toFixed(2), class: 'tr-seg' });
          seg.push(l); rg.append(l);
        }
        svg.append(rg);
        // start and end
        const st = xy[0], en = xy[n - 1];
        svg.append(sv('circle', { cx: st[0].toFixed(2), cy: st[1].toFixed(2), r: (rr * 0.8).toFixed(2), class: 'tr-start' }),
          sv('text', { x: (st[0] + rr * 1.5).toFixed(2), y: (st[1] - rr * 1.2).toFixed(2), 'font-size': fs.toFixed(2), class: 'tr-lbl' }, T('Start ', 'Αρχή ') + SC.time(S.times[0])),
          sv('circle', { cx: en[0].toFixed(2), cy: en[1].toFixed(2), r: (rr * 0.8).toFixed(2), class: 'tr-end' }),
          sv('text', { x: (en[0] + rr * 1.5).toFixed(2), y: (en[1] + rr * 2.6).toFixed(2), 'font-size': fs.toFixed(2), class: 'tr-lbl' }, T('End ', 'Τέλος ') + SC.time(S.times[n - 1])));
        // the dot
        const halo = sv('circle', { r: (rr * 2.2).toFixed(2), class: 'tr-halo' }), dot = sv('circle', { r: rr.toFixed(2), class: 'tr-dotc' });
        const dg = sv('g', { class: 'tr-dot' }, halo, dot);
        svg.append(dg);
        // a scale bar
        const steps = [1, 2, 5, 10, 20, 50], maxKm = vw * KM_PER_UNIT * 0.28;
        const sk = steps.filter((x) => x <= maxKm).pop() || 1, sl = sk / KM_PER_UNIT, bx = vx + vw * 0.035, by = vy + vh * 0.94;
        svg.append(sv('path', { d: 'M' + bx.toFixed(2) + ' ' + (by - fs * 0.5).toFixed(2) + 'V' + by.toFixed(2) + 'H' + (bx + sl).toFixed(2) + 'V' + (by - fs * 0.5).toFixed(2), class: 'tr-scale' }),
          sv('text', { x: bx.toFixed(2), y: (by - fs * 0.8).toFixed(2), 'font-size': (fs * 0.9).toFixed(2), class: 'tr-lbl' }, sk + ' ' + T('km', 'χλμ.')));
        // the island in miniature, with the part in view and the dot
        const mini = sv('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, class: 'tr-mini', 'aria-hidden': 'true' },
          Object.keys(ISLAND.districts).map((k) => sv('path', { d: ISLAND.districts[k], class: 'tr-mini-land' })),
          sv('rect', { x: vx.toFixed(1), y: vy.toFixed(1), width: vw.toFixed(1), height: vh.toFixed(1), class: 'tr-mini-view', 'stroke-width': 3 }));
        const mdot = sv('circle', { r: 9, class: 'tr-mini-dot' });
        mini.append(mdot);
        const wrap = el('div', { class: 'tr-mapwrap' }, svg, el('div', { class: 'tr-mini-box' }, mini, el('span', null, T('Whole island', 'Όλο το νησί'))));
        M = { svg, seg, dg, mdot, halo, dot, rr, wrap, nowT: null, nowW: null, scrub: null, play: null, restart: null, speeds: [], legend: null };
        const v = vehicle(), d = dayOf();
        const meta = el('div', { class: 'tr-mapcap' });
        fill(mapCard,
          el('div', { class: 'tr-card-h' }, el('div', null, el('h2', null, v.name), el('p', { class: 'sub' }, dayLong.format(keyMs(d.key)) + ' · ' + T(A.num(n) + ' reported positions', A.num(n) + ' καταγεγραμμένες θέσεις'))),
            el('span', { class: 'nm-badge nm-badge--' + (S.exact ? 'warn' : 'info') }, S.exact ? T('Exact route · teacher view', 'Ακριβής διαδρομή · προβολή εκπαιδευτικού') : T('Rounded to about ' + gridKm() + ' km · replay', 'Στρογγυλοποίηση στο ' + gridKm() + ' χλμ. · επανάληψη'))),
          wrap, meta);
        M.meta = meta;
      }

      function drawControls() {
        if (!M) return;
        const n = S.n;
        const nowT = el('b', { class: 'tr-now-t' }), nowW = el('span', { class: 'tr-now-w' });
        const play = el('button', { type: 'button', class: 'nm-btn nm-btn--primary tr-play', onclick: () => { if (S.playing) pause(); else start(); } });
        const restart = el('button', { type: 'button', class: 'nm-btn', onclick: () => { pause(); setP(0); } }, ico('back'), T('Start over', 'Από την αρχή'));
        const speeds = [1, 2, 4].map((k) => el('button', { type: 'button', class: 'tr-speed', 'aria-pressed': k === S.speed ? 'true' : 'false', onclick: () => { S.speed = k; M.speeds.forEach((b, i) => b.setAttribute('aria-pressed', [1, 2, 4][i] === S.speed ? 'true' : 'false')); } }, k + '×'));
        const scrub = el('input', { type: 'range', class: 'tr-scrub', min: 0, max: 1000, step: 1, value: 0, 'aria-label': T('Moment of the trip', 'Στιγμή της διαδρομής'),
          oninput: (e) => { setP((Number(e.target.value) / 1000) * (n - 1)); } });
        M.nowT = nowT; M.nowW = nowW; M.scrub = scrub; M.play = play; M.restart = restart; M.speeds = speeds;
        const legend = el('div', { class: 'tr-legend' });
        M.legend = legend;
        M.meta.replaceChildren(
          el('div', { class: 'tr-now', 'aria-live': 'off' }, nowT, nowW),
          el('div', { class: 'tr-ctl' }, play, restart, el('div', { class: 'tr-speeds', role: 'group', 'aria-label': T('Speed', 'Ταχύτητα') }, el('span', null, T('Speed', 'Ταχύτητα')), speeds), scrub),
          legend,
          el('p', { class: 'tr-fine' }, T('The dot glides in a straight line from one reported position to the next, so it is not the road. Where it is shown is about ' + gridKm() + ' km out. The colours are the vehicle’s own sensor, read at the time of the dot.',
            'Η κουκκίδα γλιστρά σε ευθεία από τη μία καταγεγραμμένη θέση στην επόμενη, άρα δεν είναι ο δρόμος. Το σημείο που δείχνεται έχει απόκλιση περίπου ' + gridKm() + ' χλμ. Τα χρώματα είναι από τον αισθητήρα του οχήματος, στην ώρα της κουκκίδας.')));
        paintPlay();
        paintLegend();
      }
      function paintPlay() {
        if (!M || !M.play) return;
        const end = S.p >= S.n - 1 - 1e-6;
        M.play.replaceChildren(ico(S.playing ? 'pause' : 'play'), S.playing ? T('Pause', 'Παύση') : end ? T('Replay', 'Επανάληψη') : T('Play', 'Αναπαραγωγή'));
        M.play.setAttribute('aria-pressed', S.playing ? 'true' : 'false');
      }

      /* ----- playing ----- */
      function start() {
        if (!S.n) return;
        if (S.p >= S.n - 1 - 1e-6) setP(0);
        S.playing = true; S.last = 0; S.stepAt = 0; paintPlay();
        S.raf = requestAnimationFrame(tick);
      }
      function tick(ts) {
        if (!S.playing || !alive) return;
        const n = S.n;
        if (!S.last) S.last = ts;
        const dt = Math.min(100, ts - S.last); S.last = ts;
        if (reduce()) {   // no gliding: a step every half second
          if (!S.stepAt || ts - S.stepAt >= 600 / S.speed) { S.stepAt = ts; setP(Math.min(n - 1, Math.floor(S.p + 1e-6) + 1)); }
        } else {
          const rate = Math.max(2, Math.min(60, n / 30)) * S.speed;   // positions per second: a trip takes about 30 s at 1×
          setP(Math.min(n - 1, S.p + (rate * dt) / 1000));
        }
        if (S.p >= n - 1 - 1e-6) { pause(); return; }
        S.raf = requestAnimationFrame(tick);
      }

      let wordsCache = { i: -1, s: '' };
      function wordsAt(i) {
        if (wordsCache.i !== i || wordsCache.lang !== SC.lang) { wordsCache = { i, lang: SC.lang, s: describe(S.pts[i].lat, S.pts[i].lng) }; }
        return wordsCache.s;
      }
      function timeToP(t) {
        const ts = S.times, n = ts.length;
        if (t <= ts[0]) return 0;
        if (t >= ts[n - 1]) return n - 1;
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
        return lo + (t - ts[lo]) / Math.max(1, ts[hi] - ts[lo]);
      }
      function setP(p) {
        const n = S.n;
        if (!M || n < 2) return;
        p = Math.max(0, Math.min(n - 1, p));
        S.p = p;
        const i = Math.min(n - 2, Math.floor(p)), f = p - i, a = S.xy[i], b = S.xy[i + 1];
        const x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, t = S.times[i] + (S.times[i + 1] - S.times[i]) * f;
        S.t = t;
        M.dg.setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
        M.mdot.setAttribute('cx', x.toFixed(1)); M.mdot.setAttribute('cy', y.toFixed(1));
        const bright = f > 0 ? i + 1 : i;
        if (bright > S.bright) for (let k = S.bright; k < bright; k++) M.seg[k].classList.add('on');
        else if (bright < S.bright) for (let k = bright; k < S.bright; k++) M.seg[k].classList.remove('on');
        S.bright = bright;
        if (M.scrub) { M.scrub.value = Math.round((p / (n - 1)) * 1000); M.scrub.setAttribute('aria-valuetext', SC.time(t)); }
        M.nowT.textContent = SC.time(t);
        M.nowW.textContent = ' · ' + wordsAt(Math.round(p)).replace(/^./, (c) => c.toUpperCase()) + ' ' + T('(rounded)', '(στρογγυλοποιημένη)');
        if (CH) {
          const v = valueAt(CH.pts, t);
          CH.line.setAttribute('x1', CH.X(t).toFixed(1)); CH.line.setAttribute('x2', CH.X(t).toFixed(1));
          if (v == null) CH.dot.setAttribute('visibility', 'hidden'); else { CH.dot.setAttribute('cx', CH.X(t).toFixed(1)); CH.dot.setAttribute('cy', CH.Y(v).toFixed(1)); CH.dot.setAttribute('visibility', 'visible'); }
          CH.big.textContent = v == null ? '–' : A.num(v, R().dec);
          CH.bigS.textContent = v == null ? T('no reading at this moment', 'καμία μέτρηση αυτή τη στιγμή') : R().unit + ' · ' + SC.time(t);
        }
        if (!S.playing && M.play) paintPlay();
      }

      /* ----- colouring the route by the chosen reading ----- */
      function seriesOf() { const s = S.series[R().mid]; return s && s.pts ? s.pts : null; }
      function colourRoute() {
        if (!M) return;
        const ser = seriesOf(), r = R(), ts = S.times;
        let lo = Infinity, hi = -Infinity;
        const vals = M.seg.map((_, i) => { const v = ser ? valueAt(ser, (ts[i] + ts[i + 1]) / 2) : null; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } return v; });
        S.range = lo <= hi ? [lo, hi] : null;
        M.seg.forEach((l, i) => { l.setAttribute('stroke', vals[i] == null ? '#8CA0B8' : ramp(r.stops, hi - lo < 1e-9 ? 0.5 : (vals[i] - lo) / (hi - lo))); });
        S.noneSegs = vals.some((v) => v == null);
        paintLegend();
      }
      function paintLegend() {
        if (!M || !M.legend) return;
        const r = R(), id = 'trg-' + r.k, s = S.series[r.mid];
        if (!s) { M.legend.replaceChildren(el('span', { class: 'tr-leg-n' }, T('Loading the ' + rname(r).toLowerCase() + ' readings…', 'Φόρτωση των μετρήσεων ' + rname(r).toLowerCase() + '…'))); return; }
        if (!S.range) { M.legend.replaceChildren(el('span', { class: 'tr-leg-n' }, T('No ' + rname(r).toLowerCase() + ' readings during this trip, so the route is not coloured.', 'Δεν υπάρχουν μετρήσεις ' + rname(r).toLowerCase() + ' κατά τη διαδρομή, άρα η διαδρομή δεν χρωματίζεται.'))); return; }
        const bar = sv('svg', { viewBox: '0 0 120 10', class: 'tr-leg-bar', 'aria-hidden': 'true', preserveAspectRatio: 'none' },
          sv('defs', null, sv('linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 }, r.stops.map((c, i) => sv('stop', { offset: i / (r.stops.length - 1), 'stop-color': c })))),
          sv('rect', { x: 0, y: 0, width: 120, height: 10, rx: 5, fill: 'url(#' + id + ')' }));
        M.legend.replaceChildren(el('span', { class: 'tr-leg-t' }, T('Route coloured by ' + rname(r).toLowerCase(), 'Η διαδρομή χρωματίζεται με ' + rname(r).toLowerCase())),
          el('span', { class: 'tr-leg-v' }, A.num(S.range[0], r.dec) + ' ' + r.unit), bar, el('span', { class: 'tr-leg-v' }, A.num(S.range[1], r.dec) + ' ' + r.unit),
          S.noneSegs ? el('span', { class: 'tr-leg-n' }, el('i', { class: 'tr-leg-sw' }), T('grey: no reading', 'γκρι: χωρίς μέτρηση')) : null);
      }

      /* ----- the reading card: choice, the number at the dot, the chart and three facts ----- */
      function paintReadings() {
        const v = vehicle();
        if (!v || !S.n) return;
        const avail = READ.filter((r) => !v.measurements || v.measurements.includes(r.mid));
        CH = null;
        if (!avail.length) { fill(readCard, el('div', { class: 'tr-card-h' }, el('div', null, el('h2', null, T('Along the way', 'Κατά μήκος της διαδρομής')))), el('div', { class: 'tr-empty' }, T('This vehicle has no temperature, humidity or CO2 sensor, so there is nothing to show along the route.', 'Αυτό το όχημα δεν έχει αισθητήρα θερμοκρασίας, υγρασίας ή CO2, άρα δεν υπάρχει κάτι να δειχθεί κατά μήκος της διαδρομής.'))); return; }
        if (!avail.some((r) => r.k === S.kind)) S.kind = avail[0].k;
        const r = R(), s = S.series[r.mid];
        const kinds = el('div', { class: 'tr-kinds', role: 'group', 'aria-label': T('Reading', 'Μέτρηση') }, avail.map((x) => el('button', { type: 'button', class: 'tr-kind', 'aria-pressed': x.k === S.kind ? 'true' : 'false', onclick: () => { S.kind = x.k; try { history.replaceState(null, '', '#/trip/' + enc(S.eui) + '?day=' + S.day + (x.k !== 'temp' ? '&mid=' + x.mid : '')); } catch (e) { /* ignore */ } colourRoute(); paintReadings(); setP(S.p); } }, rname(x))));
        const headEl = el('div', { class: 'tr-card-h' }, el('div', null, el('h2', null, T('Along the way', 'Κατά μήκος της διαδρομής')), el('p', { class: 'sub' }, T('The vehicle’s own sensor, read at the time of the dot.', 'Ο αισθητήρας του ίδιου του οχήματος, στην ώρα της κουκκίδας.'))));
        if (!s) { fill(readCard, headEl, kinds, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); return; }
        if (s.err) { fill(readCard, headEl, kinds, el('div', { class: 'err', role: 'alert' }, T('The readings could not be loaded. ', 'Οι μετρήσεις δεν φορτώθηκαν. ') + (s.err.message || ''), ' ', el('button', { class: 'nm-btn', type: 'button', onclick: () => { delete S.series[r.mid]; paintReadings(); loadSeries(S.tok); } }, T('Try again', 'Δοκιμάστε ξανά')))); return; }
        const t0 = S.times[0], t1 = S.times[S.n - 1];
        let pts = s.pts.filter((p) => p.t >= t0 && p.t <= t1);
        const e0 = valueAt(s.pts, t0), e1 = valueAt(s.pts, t1);
        if (e0 != null && (!pts.length || pts[0].t > t0)) pts.unshift({ t: t0, v: e0 });
        if (e1 != null && (!pts.length || pts[pts.length - 1].t < t1)) pts.push({ t: t1, v: e1 });
        if (pts.length < 2) { fill(readCard, headEl, kinds, el('div', { class: 'tr-empty' }, T('No ' + rname(r).toLowerCase() + ' readings from this vehicle during this trip. The sensor may have been off or out of range.', 'Δεν υπάρχουν μετρήσεις ' + rname(r).toLowerCase() + ' από αυτό το όχημα κατά τη διαδρομή. Ο αισθητήρας μπορεί να ήταν κλειστός ή εκτός εμβέλειας.'))); return; }
        const big = el('b', null, '–'), bigS = el('small', null, '');
        const box = el('div', { class: 'tr-chart' });
        const facts = el('div', { class: 'tr-facts' });
        fill(readCard, headEl, kinds, el('div', { class: 'tr-big' }, big, bigS), box, facts);
        // the chart
        const W = 560, H = 230, m = { l: 46, r: 12, t: 12, b: 26 };
        let lo = Infinity, hi = -Infinity;
        pts.forEach((p) => { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
        if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
        const step = niceStep((hi - lo) / 4), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
        const X = (t) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r), Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
        const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'tr-chart-svg', role: 'img', 'aria-label': rname(r) + ': ' + A.num(lo, r.dec) + ' ' + T('to', 'έως') + ' ' + A.num(hi, r.dec) + ' ' + r.unit + ', ' + SC.time(t0) + ' ' + T('to', 'έως') + ' ' + SC.time(t1) });
        for (let v = y0; v <= y1 + step / 2; v += step) svg.append(sv('line', { x1: m.l, x2: W - m.r, y1: Y(v).toFixed(1), y2: Y(v).toFixed(1), class: 'tr-gl' }), sv('text', { x: m.l - 7, y: (Y(v) + 4).toFixed(1), 'text-anchor': 'end', class: 'tr-ax' }, A.num(v, step < 1 ? 1 : 0)));
        const span = t1 - t0, hs = [1, 2, 3, 4, 6, 12].find((k) => span / (k * HOUR) <= 6) || 12, ticks = [];
        for (let t = A.cyStart(t0); t <= t1; t += hs * HOUR) if (t >= t0) ticks.push(t);
        (ticks.length ? ticks : [t0, t1]).forEach((t) => svg.append(sv('text', { x: X(t).toFixed(1), y: H - 7, 'text-anchor': 'middle', class: 'tr-ax' }, SC.time(t))));
        let d = '', prev = null, runs = [], cur = [];
        pts.forEach((p) => { if (prev && p.t - prev.t > GAP) { runs.push(cur); cur = []; } cur.push(p); prev = p; });
        runs.push(cur);
        runs.forEach((run) => {
          if (run.length < 2) { if (run.length) svg.append(sv('circle', { cx: X(run[0].t).toFixed(1), cy: Y(run[0].v).toFixed(1), r: 2.5, fill: ramp(r.stops, 0.6) })); return; }
          d = run.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
          svg.append(sv('path', { d: d + 'L' + X(run[run.length - 1].t).toFixed(1) + ' ' + Y(y0).toFixed(1) + 'L' + X(run[0].t).toFixed(1) + ' ' + Y(y0).toFixed(1) + 'Z', fill: ramp(r.stops, 0.65), opacity: 0.14 }),
            sv('path', { d, fill: 'none', stroke: ramp(r.stops, 0.7), 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        });
        const line = sv('line', { y1: m.t, y2: H - m.b, class: 'tr-ph', x1: m.l, x2: m.l }), dot = sv('circle', { r: 5, class: 'tr-phd', visibility: 'hidden' });
        svg.append(line, dot);
        const seek = (e) => { const b = svg.getBoundingClientRect(); const t = t0 + (((e.clientX - b.left) / Math.max(1, b.width)) * W - m.l) / (W - m.l - m.r) * (t1 - t0); pause(); setP(timeToP(t)); };
        svg.addEventListener('pointerdown', (e) => { seek(e); try { svg.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
        svg.addEventListener('pointermove', (e) => { if (e.buttons) seek(e); });
        box.append(svg, el('div', { class: 'tr-hint' }, T('Click or drag on the chart to jump to that moment of the trip.', 'Πατήστε ή σύρετε πάνω στο γράφημα για να πάτε σε εκείνη τη στιγμή της διαδρομής.')));
        CH = { X, Y, line, dot, big, bigS, pts: s.pts };
        // three facts, each with where the vehicle was, in words
        const fact = (label, v, t) => {
          const i = Math.round(timeToP(t));
          return el('div', { class: 'tr-fact' }, el('small', null, label), el('b', null, A.num(v, r.dec), el('i', null, ' ' + r.unit)), el('span', null, SC.time(t) + ' · ' + describe(S.pts[i].lat, S.pts[i].lng)));
        };
        let mx = pts[0], mn = pts[0], sum = 0, cnt = 0;
        pts.forEach((p) => { if (p.v > mx.v) mx = p; if (p.v < mn.v) mn = p; sum += p.v; cnt++; });
        facts.append(fact(T('Highest', 'Υψηλότερη'), mx.v, mx.t), fact(T('Lowest', 'Χαμηλότερη'), mn.v, mn.t),
          el('div', { class: 'tr-fact' }, el('small', null, T('Average over the trip', 'Μέσος όρος διαδρομής')), el('b', null, A.num(sum / cnt, r.dec), el('i', null, ' ' + r.unit)), el('span', null, T(A.num(cnt) + ' readings', A.num(cnt) + ' μετρήσεις'))));
        colourRoute();
        setP(S.p);
      }

      /* ----- loading ----- */
      function showError(e) {
        S.loadErr = e; paintHead();
        const box = el('div', { class: 'err', role: 'alert' }, T('The trips could not be loaded. ', 'Οι διαδρομές δεν φορτώθηκαν. ') + (e && e.message ? e.message : ''), ' ', el('button', { class: 'nm-btn', type: 'button', onclick: () => load(true) }, T('Try again', 'Δοκιμάστε ξανά')));
        fill(pickBox, box); fill(mapCard); fill(readCard); mapCard.hidden = true; readCard.hidden = true;
      }
      async function load(force) {
        fill(pickBox, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        mapCard.hidden = false; readCard.hidden = false;
        fill(mapCard, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); fill(readCard);
        const get = (u, ttl) => (force ? SC.api(u) : SC.cached(u, ttl));
        const [cfg, dev, tr] = await Promise.all([settle(get('/api/config', 300000)), settle(get('/api/devices', 30000)), settle(get('/api/trails?hours=168&mid=4097', 120000))]);
        if (!alive) return;
        S.cfg = cfg.ok && cfg.v ? cfg.v : { names: {} };
        S.devices = dev.ok && Array.isArray(dev.v) ? dev.v : [];
        if (!tr.ok || !tr.v || typeof tr.v.trails !== 'object') { showError(tr.ok ? new Error('The server sent no trails.') : tr.e); return; }
        S.loadErr = null;
        S.exact = S.cfg.exactPositions === true || tr.v.posDelayed === false;
        S.delayMs = (fin(tr.v.delayMinutes) ? tr.v.delayMinutes : fin(S.cfg.posDelayMin) ? S.cfg.posDelayMin : 120) * MIN;
        S.grid = fin(tr.v.grid) && tr.v.grid > 0 ? tr.v.grid : fin(S.cfg.posGrid) && S.cfg.posGrid > 0 ? S.cfg.posGrid : 0.01;
        S.vehicles = buildVehicles(tr.v.trails, S.devices, S.exact, S.delayMs, S.grid);
        paintHead();
        if (!S.vehicles.length) {
          fill(pickBox, el('div', { class: 'tr-empty' }, el('b', null, T('No trips to replay yet.', 'Δεν υπάρχουν ακόμα διαδρομές για επανάληψη.')), ' ',
            T('A trip appears here once a vehicle with a GPS has moved and its positions are at least ' + delayH() + ' hours old. Vehicles that stayed where they were do not make a trip.', 'Μια διαδρομή εμφανίζεται εδώ όταν ένα όχημα με GPS έχει κινηθεί και οι θέσεις του είναι τουλάχιστον ' + delayH() + ' ωρών. Τα οχήματα που έμειναν στη θέση τους δεν κάνουν διαδρομή.'), ' ',
            el('a', { class: 'nm-btn', href: '#/vehicles' }, T('Open Vehicles', 'Άνοιγμα Οχημάτων'))));
          mapCard.hidden = true; readCard.hidden = true;
          return;
        }
        const want = ctx && ctx.args && ctx.args[0] ? ctx.args[0] : null, wantDay = ctx && ctx.query ? ctx.query.get('day') : null, wantMid = ctx && ctx.query ? ctx.query.get('mid') : null;
        if (wantMid) { const r = READ.find((x) => x.mid === wantMid); if (r) S.kind = r.k; }
        const keep = S.vehicles.find((v) => v.eui === (S.eui || want));
        const newest = S.vehicles.slice().sort((a, b) => b.last - a.last)[0];
        const first = !S.eui;
        choose((keep || newest).eui, first ? wantDay : S.day);
      }

      load(false);
      return () => { alive = false; S.playing = false; cancelAnimationFrame(S.raf); };
    },
  });
})();
