/*
  Ventilation coach: what the CO2 readings of our own sensors over the saved day say about fresh air.
  FIRST it checks where the CO2 comes from, because that decides what may be said:
    - classroom sensors (layer "sensecap-classrooms", environment "indoor": the layer a sensor belongs to is decided on the server by
      layers.js placeOf(), from the teacher-reviewed assignments or else from the sensor's name): per school, the share of the saved
      time above the guidance levels, the peak, and an "open the windows" timeline;
    - buses and cars only (environment "vehicle"): the page says so plainly, shows the numbers as "air inside our vehicles", never as
      a classroom, and gives general ventilation guidance instead of classroom advice.
  Data: GET /layers/api/compare?city=<c>&variable=co2 (every own source that has CO2 for the city, with its environment and series)
        and GET /layers/api/replay (cities[c].own, for a source that is quiet at this moment but is still in the saved day).
  The levels (about 1000 and 1500 ppm) are common ventilation guidance, not health limits. Nothing here is medical advice.
  One number per school: the average of the sensors that reported. Indoor numbers are never compared with outdoor ones.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/toolkit-b2.css');
  const HOUR = 3600000, MIN = 60000;
  const AIR = 1000, NOW = 1500;   // ppm: common guidance levels for rooms
  const isEl = () => SC.lang === 'el';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const CITY = {
    larnaka: ['Larnaka', 'Λάρνακα', 'PASCAL Larnaka'], lefkosia: ['Lefkosia', 'Λευκωσία', 'PASCAL Lefkosia'],
    limassol: ['Limassol', 'Λεμεσός', 'PASCAL Limassol'], paphos: ['Paphos', 'Πάφος', 'International School of Paphos'],
  };
  const CITIES = Object.keys(CITY);
  const cityName = (c) => CITY[c][isEl() ? 1 : 0];
  const pct = (x) => (x > 0 && x < 0.01 ? T('under 1', 'κάτω από 1') : String(Math.round(x * 100))) + '%';

  /* ---------- the numbers: pure ---------- */
  // points [[t, v]...]. Each reading stands for the time until the next one, at most maxGap (a longer silence is not counted at all).
  function summary(points, every) {
    const maxGap = Math.max(3 * (every || 0), 15 * MIN);
    let covered = 0, above1 = 0, above2 = 0, peak = null;
    points.forEach(([t, v], i) => {
      if (!peak || v > peak[1]) peak = [t, v];
      if (i === points.length - 1) return;
      const dt = Math.min(points[i + 1][0] - t, maxGap);
      if (!(dt > 0)) return;
      covered += dt; if (v > AIR) above1 += dt; if (v > NOW) above2 += dt;
    });
    return { covered, share1: covered ? above1 / covered : null, share2: covered ? above2 / covered : null, peak, newest: points.length ? points[points.length - 1] : null, n: points.length };
  }
  // the saved day as hours (or up to 24 equal parts when less than 6 hours were saved): the highest reading in each
  function hours(points) {
    if (points.length < 2) return { hourly: false, cells: [] };
    const t0 = points[0][0], t1 = points[points.length - 1][0], hourly = t1 - t0 >= 6 * HOUR;
    const k0 = Math.floor(t0 / HOUR), n = hourly ? Math.floor(t1 / HOUR) - k0 + 1 : Math.min(24, points.length), w = hourly ? HOUR : (t1 - t0) / n || 1;
    const cells = Array.from({ length: n }, (_, i) => ({ t: hourly ? (k0 + i) * HOUR : t0 + i * w, w, max: null }));
    points.forEach(([t, v]) => { const i = Math.min(n - 1, hourly ? Math.floor(t / HOUR) - k0 : Math.floor((t - t0) / w)); if (cells[i].max == null || v > cells[i].max) cells[i].max = v; });
    return { hourly, cells: cells.slice(-27) };
  }
  // runs of hours whose highest reading passed the first level
  function windows(cells) {
    const out = []; let cur = null;
    cells.forEach((c) => { if (c.max != null && c.max > AIR) { if (!cur) { cur = { a: c.t, b: c.t + c.w, peak: c.max }; out.push(cur); } else { cur.b = c.t + c.w; cur.peak = Math.max(cur.peak, c.max); } } else cur = null; });
    return out;
  }
  SC.ventCore = { summary, hours, windows, AIR, NOW };

  SC.register('vent', {
    title: ['Ventilation coach', 'Οδηγός αερισμού'],
    render(root) {
      let dead = false;
      const box = h('div', { class: 't2-main' }, h('p', { class: 't2-empty', role: 'status' }, T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…')));
      const p = (t) => h('p', { class: 't2-note' }, t);
      const aside = h('aside', { class: 't2-panel t2-side' },
        h('b', null, T('The levels used here', 'Τα επίπεδα που χρησιμοποιούνται εδώ')),
        p(T('CO₂ (carbon dioxide) is what we breathe out. In a room with people and closed windows it builds up, so it is a handy sign of how much fresh air the room gets. It is measured in ppm (parts per million).', 'Το CO₂ (διοξείδιο του άνθρακα) είναι αυτό που εκπνέουμε. Σε ένα δωμάτιο με ανθρώπους και κλειστά παράθυρα μαζεύεται, άρα είναι ένα χρήσιμο σημάδι για το πόσο φρέσκο αέρα παίρνει το δωμάτιο. Μετριέται σε ppm (μέρη στο εκατομμύριο).')),
        h('ul', { class: 've-lv' },
          h('li', null, h('i', { class: 'ok', 'aria-hidden': 'true' }), T('Up to about ' + AIR + ' ppm: the usual aim for a room in use.', 'Μέχρι περίπου ' + AIR + ' ppm: ο συνηθισμένος στόχος για ένα δωμάτιο που χρησιμοποιείται.')),
          h('li', null, h('i', { class: 'air', 'aria-hidden': 'true' }), T('Above about ' + AIR + ' ppm: a good moment to open the windows.', 'Πάνω από περίπου ' + AIR + ' ppm: καλή στιγμή να ανοίξουν τα παράθυρα.')),
          h('li', null, h('i', { class: 'now', 'aria-hidden': 'true' }), T('Above about ' + NOW + ' ppm: the room is stuffy, air it now.', 'Πάνω από περίπου ' + NOW + ' ppm: το δωμάτιο έχει βαρύ αέρα, αέρισέ το τώρα.'))),
        h('p', { class: 't2-warn' }, T('These two levels are common ventilation guidance for rooms. They are not health limits and not a diagnosis, and this page gives no medical advice. If someone feels unwell, tell a teacher.', 'Αυτά τα δύο επίπεδα είναι συνηθισμένες οδηγίες αερισμού για δωμάτια. Δεν είναι όρια υγείας ούτε διάγνωση, και αυτή η σελίδα δεν δίνει ιατρικές συμβουλές. Αν κάποιος δεν νιώθει καλά, πες το σε έναν εκπαιδευτικό.')),
        h('b', null, T('Good habits for any room', 'Καλές συνήθειες για κάθε δωμάτιο')),
        h('ul', { class: 've-tips' },
          h('li', null, T('Open windows wide for a few minutes between lessons. A short, full airing changes the air faster than a window left a little open.', 'Άνοιξε διάπλατα τα παράθυρα για λίγα λεπτά ανάμεσα στα μαθήματα. Ένας σύντομος, πλήρης αερισμός αλλάζει τον αέρα πιο γρήγορα από ένα παράθυρο μισάνοιχτο.')),
          h('li', null, T('Open on two sides if you can (a window and the door), so the air moves through.', 'Άνοιξε σε δύο πλευρές αν γίνεται (ένα παράθυρο και την πόρτα), για να περνά ο αέρας.')),
          h('li', null, T('More people and more time with everything shut means more CO₂.', 'Περισσότεροι άνθρωποι και περισσότερη ώρα με όλα κλειστά σημαίνει περισσότερο CO₂.')),
          h('li', null, T('On a very hot, dusty or stormy day a teacher decides when to open.', 'Σε μια πολύ ζεστή μέρα, με σκόνη ή καταιγίδα, αποφασίζει ο εκπαιδευτικός πότε θα ανοίξουν.'))),
        h('b', null, T('What this page cannot say', 'Τι δεν μπορεί να πει αυτή η σελίδα')),
        p(T('CO₂ tells about fresh air only. It does not measure germs, dust or smells, and a sensor in one spot does not describe a whole building. Schools are listed in a fixed order; this is not a ranking.', 'Το CO₂ μιλά μόνο για τον φρέσκο αέρα. Δεν μετρά μικρόβια, σκόνη ή μυρωδιές, και ένας αισθητήρας σε ένα σημείο δεν περιγράφει ένα ολόκληρο κτίριο. Τα σχολεία είναι σε σταθερή σειρά· δεν είναι κατάταξη.')));
      root.append(SC.head({ title: T('Ventilation coach', 'Οδηγός αερισμού'),
        lede: T('When would opening the windows have helped? Read from the CO₂ our own sensors saved in the last day.', 'Πότε θα βοηθούσε να ανοίξουν τα παράθυρα; Από το CO₂ που αποθήκευσαν οι δικοί μας αισθητήρες την τελευταία μέρα.'),
        help: ['The page first checks where each CO₂ number was measured. If it comes from a classroom sensor, you see how much of the saved time the room was above the guidance levels, the highest reading, and the hours when airing would have helped. If it comes only from sensors on buses and cars, the page says so and does not pretend to know about a classroom.',
          'Η σελίδα ελέγχει πρώτα πού μετρήθηκε κάθε αριθμός CO₂. Αν έρχεται από αισθητήρα τάξης, βλέπεις πόσο από τον αποθηκευμένο χρόνο το δωμάτιο ήταν πάνω από τα επίπεδα των οδηγιών, την υψηλότερη μέτρηση και τις ώρες που ο αερισμός θα βοηθούσε. Αν έρχεται μόνο από αισθητήρες σε λεωφορεία και αυτοκίνητα, η σελίδα το λέει και δεν προσποιείται ότι ξέρει κάτι για μια τάξη.'] }),
        h('div', { class: 't2' }, h('div', { class: 't2-body' }, box, aside)));

      const nameOf = (s) => (isEl() && s.nameEl) || s.name || s.source;
      function roomCard(c, s, every) {
        const sm = summary(s.points, every), hr = hours(s.points), win = windows(hr.cells), unit = s.unit || 'ppm';
        const cls = (m) => (m == null ? 'none' : m > NOW ? 'now' : m > AIR ? 'air' : 'ok');
        const word = (m) => (m == null ? T('nothing saved', 'τίποτα αποθηκευμένο') : m > NOW ? T('air it now', 'αέρισε τώρα') : m > AIR ? T('open the windows', 'άνοιξε τα παράθυρα') : T('fine', 'εντάξει'));
        return h('article', { class: 't2-panel ve-c room', dataset: { c } },
          h('div', { class: 't2-head' }, h('b', null, CITY[c][2] + ' · ' + cityName(c)), h('span', { class: 've-tag room' }, T('classroom sensors, indoors', 'αισθητήρες τάξης, μέσα'))),
          sm.covered ? h('div', { class: 've-nums' },
            h('div', null, h('b', null, pct(sm.share1)), h('span', null, T('of the saved time above about ' + AIR + ' ' + unit, 'του αποθηκευμένου χρόνου πάνω από περίπου ' + AIR + ' ' + unit))),
            h('div', null, h('b', null, pct(sm.share2)), h('span', null, T('of the saved time above about ' + NOW + ' ' + unit, 'του αποθηκευμένου χρόνου πάνω από περίπου ' + NOW + ' ' + unit))),
            h('div', null, h('b', null, num(sm.peak[1]) + ' ' + unit), h('span', null, T('highest reading, at ' + SC.dateTime(sm.peak[0]), 'υψηλότερη μέτρηση, στις ' + SC.dateTime(sm.peak[0]))))) : p(T('Only one reading has been saved, so shares cannot be worked out yet.', 'Έχει αποθηκευτεί μόνο μία μέτρηση, άρα τα ποσοστά δεν μπορούν να υπολογιστούν ακόμη.')),
          hr.cells.length ? h('div', { class: 've-strip', role: 'img', 'aria-label': T('The saved day, part by part: ', 'Η αποθηκευμένη μέρα, κομμάτι προς κομμάτι: ') + hr.cells.map((x) => SC.time(x.t) + ' ' + word(x.max)).join(', ') },
            hr.cells.map((x, i) => h('span', { class: 've-cell ' + cls(x.max), title: SC.time(x.t) + ' · ' + (x.max == null ? word(null) : num(x.max) + ' ' + unit + ' · ' + word(x.max)) }, h('small', null, i === 0 || i === hr.cells.length - 1 || i % 6 === 0 ? SC.time(x.t) : '')))) : null,
          h('div', { class: 've-win' }, h('b', null, T('Open the windows', 'Άνοιξε τα παράθυρα')),
            win.length ? h('ul', null, win.map((w) => h('li', null, SC.dateTime(w.a) + '–' + SC.time(w.b) + T(': the highest reading was ', ': η υψηλότερη μέτρηση ήταν ') + num(w.peak) + ' ' + unit + (w.peak > NOW ? T(' (above about ' + NOW + ')', ' (πάνω από περίπου ' + NOW + ')') : ''))))
              : p(T('No part of the saved day passed about ' + AIR + ' ' + unit + '. Keep airing between lessons as usual.', 'Κανένα κομμάτι της αποθηκευμένης μέρας δεν πέρασε τα περίπου ' + AIR + ' ' + unit + '. Συνέχισε να αερίζεις ανάμεσα στα μαθήματα όπως συνήθως.'))),
          p(T('Newest: ' + num(sm.newest[1]) + ' ' + unit + ' at ' + SC.dateTime(sm.newest[0]) + '. Layer: ' + nameOf(s) + '. ' + sm.n + ' saved readings covering ' + num(sm.covered / HOUR) + ' hours' + (hr.hourly ? '' : ' (less than 6 hours, so the strip shows equal parts, not clock hours)') + '. One number for the school: the average of the classroom sensors that reported. These hours are what happened on the saved day, not a forecast for today.',
            'Νεότερη: ' + num(sm.newest[1]) + ' ' + unit + ' στις ' + SC.dateTime(sm.newest[0]) + '. Στρώμα: ' + nameOf(s) + '. ' + sm.n + ' αποθηκευμένες μετρήσεις που καλύπτουν ' + num(sm.covered / HOUR) + ' ώρες' + (hr.hourly ? '' : ' (λιγότερες από 6 ώρες, άρα η λωρίδα δείχνει ίσα κομμάτια, όχι ώρες του ρολογιού)') + '. Ένας αριθμός για το σχολείο: ο μέσος όρος των αισθητήρων τάξης που ανέφεραν. Αυτές οι ώρες είναι ό,τι έγινε στην αποθηκευμένη μέρα, όχι πρόβλεψη για σήμερα.')));
      }
      function vehicleCard(c, list) {
        return h('article', { class: 't2-panel ve-c veh', dataset: { c } },
          h('div', { class: 't2-head' }, h('b', null, CITY[c][2] + ' · ' + cityName(c)), h('span', { class: 've-tag veh' }, T('air inside our vehicles, not a classroom', 'αέρας μέσα στα οχήματά μας, όχι τάξη'))),
          h('ul', { class: 've-veh' }, list.map((s) => { const vals = s.points.map((x) => x[1]), n = s.points[s.points.length - 1], unit = s.unit || 'ppm';
            return h('li', null, h('b', null, nameOf(s) + ': ' + num(n[1]) + ' ' + unit), h('span', null, T(' at ' + SC.dateTime(n[0]) + '. Over the saved day: from ' + num(Math.min(...vals)) + ' to ' + num(Math.max(...vals)) + ' ' + unit + ' (' + s.points.length + ' saved readings, one number for all the ' + (s.source === 'sensecap-cars' ? 'cars' : 'buses') + ' of the city).', ' στις ' + SC.dateTime(n[0]) + '. Στην αποθηκευμένη μέρα: από ' + num(Math.min(...vals)) + ' έως ' + num(Math.max(...vals)) + ' ' + unit + ' (' + s.points.length + ' αποθηκευμένες μετρήσεις, ένας αριθμός για όλα τα ' + (s.source === 'sensecap-cars' ? 'αυτοκίνητα' : 'λεωφορεία') + ' της πόλης).'))); })),
          p(T('No classroom sensor has saved CO₂ for this school in the last day, so this page cannot say when to open the classroom windows here. The room levels on the right are not applied to a vehicle: a bus or car is a small space that fills and empties with every stop. In a vehicle, fresh air comes from the vents or a window; the driver decides.',
            'Κανένας αισθητήρας τάξης δεν έχει αποθηκεύσει CO₂ για αυτό το σχολείο την τελευταία μέρα, άρα η σελίδα δεν μπορεί να πει πότε να ανοίξουν τα παράθυρα της τάξης εδώ. Τα επίπεδα για δωμάτια δεξιά δεν εφαρμόζονται σε όχημα: ένα λεωφορείο ή αυτοκίνητο είναι μικρός χώρος που γεμίζει και αδειάζει σε κάθε στάση. Σε ένα όχημα ο φρέσκος αέρας έρχεται από τον εξαερισμό ή ένα παράθυρο· αποφασίζει ο οδηγός.')));
      }
      const noneCard = (c) => h('article', { class: 't2-panel ve-c none', dataset: { c } }, h('div', { class: 't2-head' }, h('b', null, CITY[c][2] + ' · ' + cityName(c))),
        p(T('None of our own sensors has saved a CO₂ reading for this school in the last day.', 'Κανένας δικός μας αισθητήρας δεν έχει αποθηκεύσει μέτρηση CO₂ για αυτό το σχολείο την τελευταία μέρα.')));

      function load() {
        const ok = (pr) => pr.then((v) => v, (e) => ({ failed: !(e && e.status === 404) }));
        return Promise.all([ok(SC.api('/layers/api/replay')), ...CITIES.map((c) => ok(SC.api('/layers/api/compare?city=' + c + '&variable=co2')))]).then(([replay, ...cmp]) => {
          if (dead) return;
          if (replay.failed && cmp.every((r) => r.failed)) {
            box.replaceChildren(h('p', { class: 't2-empty' }, h('span', { class: 't2-err', role: 'alert' }, T('The saved day could not be loaded. ', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. ')), h('button', { type: 'button', class: 't2-go', onclick: () => load() }, T('Try again', 'Δοκίμασε ξανά'))));
            return;
          }
          const per = {}, every = (replay && replay.every) || 300000;
          CITIES.forEach((c, i) => {
            const list = ((cmp[i] && cmp[i].series) || []).filter((s) => s.kind === 'low-cost-sensor' || s.group === 'own').map((s) => ({ source: s.source, name: s.name, nameEl: s.nameEl, env: s.env, unit: s.unit, points: (s.points || []).filter((x) => isFinite(x[0]) && isFinite(x[1])) })).filter((s) => s.points.length);
            const own = replay && replay.cities && replay.cities[c] && replay.cities[c].own;
            if (own && own.variable === 'co2' && !list.some((s) => s.source === own.source)) {
              const pts = own.values.map((v, k) => [replay.times[k], v]).filter((x) => x[1] != null && isFinite(x[1]));
              if (pts.length) list.push({ source: own.source, name: own.source === 'sensecap-classrooms' ? 'Classrooms' : own.source === 'sensecap-cars' ? 'Cars' : 'Buses', nameEl: own.source === 'sensecap-classrooms' ? 'Τάξεις' : own.source === 'sensecap-cars' ? 'Αυτοκίνητα' : 'Λεωφορεία', env: own.source === 'sensecap-classrooms' ? 'indoor' : 'vehicle', unit: own.unit, points: pts });
            }
            per[c] = { room: list.find((s) => s.source === 'sensecap-classrooms' || s.env === 'indoor') || null, veh: list.filter((s) => s.source !== 'sensecap-classrooms' && s.env !== 'indoor').sort((a, b) => a.source.localeCompare(b.source)) };
          });
          const rooms = CITIES.filter((c) => per[c].room).length, vehs = CITIES.filter((c) => !per[c].room && per[c].veh.length).length;
          const banner = rooms === 0 && vehs > 0 ? h('div', { class: 't2-panel ve-banner veh', role: 'note' }, h('b', null, T('The only CO₂ we have right now comes from buses and cars, not from classrooms.', 'Το μόνο CO₂ που έχουμε τώρα έρχεται από λεωφορεία και αυτοκίνητα, όχι από τάξεις.')),
            p(T('So this page shows it as "air inside our vehicles" and gives general advice about fresh air. It says nothing about any classroom until a classroom sensor reports.', 'Γι’ αυτό η σελίδα το δείχνει ως «αέρας μέσα στα οχήματά μας» και δίνει γενικές συμβουλές για φρέσκο αέρα. Δεν λέει τίποτα για καμία τάξη μέχρι να αναφέρει ένας αισθητήρας τάξης.')))
            : rooms === 0 ? h('div', { class: 't2-panel ve-banner', role: 'note' }, h('b', null, T('No CO₂ reading from our own sensors has been saved in the last day.', 'Καμία μέτρηση CO₂ από τους δικούς μας αισθητήρες δεν έχει αποθηκευτεί την τελευταία μέρα.')), p(T('The general advice on this page still holds. Come back when the sensors report.', 'Οι γενικές συμβουλές της σελίδας ισχύουν. Έλα ξανά όταν αναφέρουν οι αισθητήρες.')))
              : rooms < CITIES.length ? h('div', { class: 't2-panel ve-banner', role: 'note' }, h('b', null, T('Classroom sensors have saved CO₂ for ' + rooms + ' of the 4 schools.', 'Αισθητήρες τάξης έχουν αποθηκεύσει CO₂ για ' + rooms + ' από τα 4 σχολεία.')), p(T('For the others the page shows only what buses and cars measured, clearly marked, or says that nothing was saved.', 'Για τα υπόλοιπα η σελίδα δείχνει μόνο ό,τι μέτρησαν λεωφορεία και αυτοκίνητα, με σαφή ένδειξη, ή λέει ότι δεν αποθηκεύτηκε τίποτα.'))) : null;
          box.replaceChildren(...[banner].concat(CITIES.map((c) => (per[c].room ? roomCard(c, per[c].room, every) : per[c].veh.length ? vehicleCard(c, per[c].veh) : noneCard(c)))).filter(Boolean));
        });
      }
      load();
      const timer = setInterval(() => { if (!document.hidden && !dead) load(); }, 300000);
      return () => { dead = true; clearInterval(timer); };
    },
  });
})();
