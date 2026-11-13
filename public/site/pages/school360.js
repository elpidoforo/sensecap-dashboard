/*
  School 360 (toolkit). One school and one topic at a time (air, weather, sea, our sensors):
    1. the school's sensors that are online: counts only, grouped by school the way the home page does it       (GET /api/devices)
    2. the newest readings for the school's city in that topic, each with its time, layer and kind              (GET /layers/api/live)
    3. the saved day for one measurement of that topic, one small line per source                               (GET /layers/api/compare?city=&variable=)
    4. the open differences between sources for that topic                                                      (live.rivers)
  City readings are for the city, not for the school building, and the page says so. A sensor's position is never read or shown.
  Link: #/school360?school=paphos&topic=sea
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/tk1.css');
  const core = () => (SC.tk1 ? Promise.resolve() : (SC.tk1Loading = SC.tk1Loading || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk1-core.js?v=1';
    s.onload = () => (SC.tk1 ? res() : rej(new Error('toolkit core'))); s.onerror = () => { SC.tk1Loading = null; s.remove(); rej(new Error(T('A part of this page could not be loaded.', 'Ένα κομμάτι της σελίδας δεν φορτώθηκε.'))); };
    document.head.append(s);
  })));
  const TOPICS = [['air', 'Air', 'Αέρας'], ['weather', 'Weather', 'Καιρός'], ['sea', 'Sea', 'Θάλασσα'], ['own', 'Our sensors', 'Οι αισθητήρες μας']];
  const topicWord = (t) => ({ air: T('air', 'τον αέρα'), weather: T('weather', 'τον καιρό'), sea: T('sea', 'τη θάλασσα'), own: T('our sensors', 'τους αισθητήρες μας') }[t]);

  SC.register('school360', {
    title: ['School 360', 'Σχολείο 360'],
    async render(root, ctx) {
      document.title = T('School 360', 'Σχολείο 360') + ' · Athena';
      root.append(SC.head({ title: T('School 360', 'Σχολείο 360'),
        lede: T('One school, one topic at a time: its sensors, the readings for its city, the saved day and the places where sources do not agree.', 'Ένα σχολείο, ένα θέμα τη φορά: οι αισθητήρες του, οι μετρήσεις για την πόλη του, η αποθηκευμένη μέρα και τα σημεία όπου οι πηγές δεν συμφωνούν.'),
        help: ['Pick a school and a topic. First you see how many of the school\'s sensors sent a reading in the last hour (a count, never a place). Then the newest readings for the school\'s city from stations, models and our own sensors, each with its time and its layer. Then the saved day, and any measurement where two sources read differently right now.',
          'Διάλεξε σχολείο και θέμα. Πρώτα βλέπεις πόσοι αισθητήρες του σχολείου έστειλαν μέτρηση την τελευταία ώρα (αριθμός, ποτέ τοποθεσία). Μετά τις πιο πρόσφατες μετρήσεις για την πόλη του σχολείου από σταθμούς, μοντέλα και δικούς μας αισθητήρες, καθεμία με την ώρα και το στρώμα της. Μετά την αποθηκευμένη μέρα, και κάθε μέτρηση όπου δύο πηγές δείχνουν διαφορετικά τώρα.'] }));
      await core();
      const K = SC.tk1;
      let school = K.SCHOOLS.some((s) => s.id === ctx.query.get('school')) ? ctx.query.get('school') : K.SCHOOLS[0].id;
      let topic = TOPICS.some((t) => t[0] === ctx.query.get('topic')) ? ctx.query.get('topic') : 'weather';
      let variable = null, m = null, askNo = 0;

      function draw(d, body) {
        const live = d.live, S = K.SCHOOLS.find((s) => s.id === school), city = S.city, name = T(S.n[0], S.n[1]);
        const refocus = (sel) => { const e = body.querySelector(sel); if (e) e.focus({ preventScroll: true }); };
        body.append(h('div', { class: 't1-panel s3-top' },
          h('span', { class: 't1-lab', id: 's3-lab-s' }, T('School', 'Σχολείο')),
          K.chips(T('School', 'Σχολείο'), K.SCHOOLS.map((s) => [s.id, T(s.n[0], s.n[1])]), school, (id) => { school = id; variable = null; m.redraw(); refocus('.s3-schools .t1-chip.on'); }),
          h('span', { class: 't1-lab' }, T('Topic', 'Θέμα')),
          K.chips(T('Topic', 'Θέμα'), TOPICS.map(([id, en, el]) => [id, T(en, el)]), topic, (id) => { topic = id; variable = null; m.redraw(); refocus('.s3-topics .t1-chip.on'); })));
        const groups = body.querySelectorAll('.s3-top .t1-chips'); groups[0].classList.add('s3-schools'); groups[1].classList.add('s3-topics');

        /* ----- 1. the school's sensors ----- */
        const sen = K.panel(T('Sensors of ' + name, 'Αισθητήρες: ' + name));
        sen.classList.add('s3-sensors');
        if (!Array.isArray(d.devices)) sen.append(K.empty(T('The sensor list could not be loaded, so we cannot say how many are online.', 'Η λίστα των αισθητήρων δεν φορτώθηκε, άρα δεν μπορούμε να πούμε πόσοι είναι σε λειτουργία.')));
        else {
          const mine = d.devices.filter((x) => K.schoolOf(x) === school), now = Date.now();
          const seen = (x) => { const t = x.lastSeen ? Date.parse(x.lastSeen) : NaN; return isFinite(t) ? t : 0; };
          const on = mine.filter((x) => { const t = seen(x); return x.online !== false && (!t || now - t <= K.HOUR); }).length;
          const last = Math.max(0, ...mine.map(seen));
          if (!mine.length) sen.append(K.empty(T('No sensors are listed for this school yet.', 'Δεν έχουν καταχωριστεί ακόμη αισθητήρες για αυτό το σχολείο.')));
          else {
            const bus = mine.filter((x) => /\bbus\b|λεωφορ/i.test(x.name || '')).length, car = mine.filter((x) => /\bcar\b|αυτοκίν/i.test(x.name || '')).length, rest = mine.length - bus - car;
            const parts = [bus ? T(bus + ' on buses', bus + ' σε λεωφορεία') : '', car ? T(car + ' on cars', car + ' σε αυτοκίνητα') : '', rest ? T(rest + ' other', rest + ' άλλοι') : ''].filter(Boolean).join(' · ');
            sen.append(h('p', { class: 't1-big s3-count' }, T(on + ' of ' + mine.length + ' online', on + ' από ' + mine.length + ' σε λειτουργία'),
              h('small', null, T('"Online" means a reading in the last hour. ', '«Σε λειτουργία» σημαίνει μέτρηση την τελευταία ώρα. ') + (last ? T('Newest reading at ', 'Πιο πρόσφατη μέτρηση στις ') + K.when(last) + '.' : T('No reading has a time yet.', 'Καμία μέτρηση δεν έχει ώρα ακόμη.')))),
              h('p', { class: 't1-note' }, parts ? T('By name: ', 'Από το όνομα: ') + parts + '.' : ''));
          }
          sen.append(K.note(T('Counts only. Where a bus or a car is, is never shown on this page.', 'Μόνο αριθμοί. Το πού βρίσκεται ένα λεωφορείο ή αυτοκίνητο δεν εμφανίζεται ποτέ σε αυτή τη σελίδα.')));
        }
        body.append(sen);

        /* ----- 2. the newest readings for the city, for this topic ----- */
        const inTopic = (r) => (topic === 'own' ? K.isOwn(live, r.source) : K.TOPIC_VARS[topic].indexOf(r.variable) >= 0 && !K.isOwn(live, r.source));
        const rd = K.panel(topic === 'own' ? T('What our own sensors read in ' + K.cityName(city), 'Τι δείχνουν οι δικοί μας αισθητήρες: ' + K.cityName(city)) : T('Readings for ' + K.cityName(city) + ' from stations and models', 'Μετρήσεις από σταθμούς και μοντέλα: ' + K.cityName(city)));
        rd.classList.add('s3-read');
        let rows = [];
        if (!live) rd.append(K.empty(T('The live readings could not be loaded.', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν.')));
        else {
          rows = ((live.cities[city] || {}).rows || []).filter(inTopic);
          if (!rows.length) rd.append(h('p', { class: 't1-empty s3-none' }, topic === 'own' ? T('None of our own sensors has a reading for ' + K.cityName(city) + ' right now.', 'Κανένας δικός μας αισθητήρας δεν έχει μέτρηση αυτή τη στιγμή: ' + K.cityName(city) + '.')
            : T('No layer has a reading about ' + topicWord(topic) + ' for ' + K.cityName(city) + ' right now. That is a gap in the data, not a zero.', 'Κανένα στρώμα δεν έχει μέτρηση για ' + topicWord(topic) + ' αυτή τη στιγμή: ' + K.cityName(city) + '. Είναι κενό στα δεδομένα, όχι μηδέν.')));
          else {
            rd.append(h('div', { class: 't1-scroll' }, h('table', { class: 't1-table' },
              h('caption', { class: 't1-sr' }, T('Newest readings', 'Πιο πρόσφατες μετρήσεις')),
              h('thead', null, h('tr', null, [T('Measurement', 'Μέτρηση'), T('Value', 'Τιμή'), T('Time', 'Ώρα'), T('Layer', 'Στρώμα'), T('Kind of source', 'Είδος πηγής')].map((x) => h('th', { scope: 'col' }, x)))),
              h('tbody', null, rows.map((r) => h('tr', { class: r.stale ? 'old' : '' },
                h('th', { scope: 'row' }, K.varName(r.variable, live)),
                h('td', { class: 'n' }, K.withUnit(r.value, r.unit)),
                h('td', null, K.when(K.rowTime(live, r)) + (r.stale ? ' · ' + T('old', 'παλιά') : '')),
                h('td', null, K.layerName(live, r.source)),
                h('td', null, K.kindWord(r.kind) + (r.env && r.env !== 'outdoor' ? ' · ' + K.envWord(r.env) : ''))))))));
            rd.append(K.note(topic === 'own'
              ? T('These sensors ride on buses and cars or sit in classrooms. A reading from inside a vehicle or a room is never compared with the street.', 'Αυτοί οι αισθητήρες ταξιδεύουν σε λεωφορεία και αυτοκίνητα ή βρίσκονται σε τάξεις. Μια μέτρηση μέσα σε όχημα ή αίθουσα δεν συγκρίνεται ποτέ με τον δρόμο.')
              : T('These numbers are for the city of ' + K.cityName(city) + ', the nearest the platform has, not for the school building itself. A computer model is an estimate, not a measurement.', 'Οι αριθμοί αυτοί είναι για την πόλη (' + K.cityName(city) + '), ό,τι πιο κοντινό έχει η πλατφόρμα, όχι για το ίδιο το κτίριο του σχολείου. Ένα υπολογιστικό μοντέλο είναι εκτίμηση, όχι μέτρηση.')));
          }
        }
        body.append(rd);

        /* ----- 3. the saved day for one measurement of the topic ----- */
        const dayP = K.panel(T('The saved day', 'Η αποθηκευμένη μέρα'));
        dayP.classList.add('s3-day');
        const vars = [...new Set(rows.filter((r) => !r.stale).map((r) => r.variable))];
        if (variable == null || vars.indexOf(variable) < 0) variable = vars[0] || null;
        const dayBox = h('div', { class: 's3-daybox', 'aria-live': 'polite' });
        if (!variable) dayP.append(K.empty(T('With no reading for this topic there is no saved day to show.', 'Χωρίς μέτρηση γι’ αυτό το θέμα δεν υπάρχει αποθηκευμένη μέρα να δείξουμε.')));
        else {
          if (vars.length > 1) dayP.append(K.chips(T('Measurement', 'Μέτρηση'), vars.map((v) => [v, K.varName(v, live)]), variable, (v) => { variable = v; m.redraw(); refocus('.s3-day .t1-chip.on'); }));
          dayP.append(dayBox);
          dayBox.append(K.empty(T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…')));
          const my = ++askNo, v = variable;
          SC.cached('/layers/api/compare?city=' + encodeURIComponent(city) + '&variable=' + encodeURIComponent(v), 30000).then((cmp) => {
            if (my !== askNo || m.dead) return;
            const list = ((cmp && cmp.series) || []).filter((s) => (topic === 'own') === K.isOwn(live, s.source) && Array.isArray(s.points) && s.points.length);
            if (!list.length) { dayBox.replaceChildren(K.empty(T('Nothing has been saved for ' + K.varName(v, live) + ' in ' + K.cityName(city) + ' yet.', 'Δεν έχει αποθηκευτεί ακόμη κάτι: ' + K.varName(v, live) + ', ' + K.cityName(city) + '.'))); return; }
            const all = list.flatMap((s) => s.points), t0 = Math.min(...all.map((p) => p[0])), t1 = Math.max(...all.map((p) => p[0]));
            const lo = Math.min(...all.map((p) => p[1])), hi = Math.max(...all.map((p) => p[1]));
            const kids = [];
            if (t1 - t0 < K.SHORT) kids.push(h('p', { class: 't1-warn s3-filling' }, K.fillingNote({ n: all.length, ms: t1 - t0, from: t0 })));
            kids.push(h('p', { class: 't1-note' }, K.varName(v, live) + ' · ' + T('from ', 'από ') + K.when(t0) + T(' to ', ' έως ') + K.when(t1) + ' · ' + T('all lines share one scale: ', 'όλες οι γραμμές έχουν την ίδια κλίμακα: ') + K.withUnit(lo, list[0].unit) + T(' to ', ' έως ') + K.withUnit(hi, list[0].unit)));
            list.forEach((s, i) => {
              const st = K.stats(s.points.map((p) => p[1]), s.points.map((p) => p[0])), u = s.unit || '';
              kids.push(h('div', { class: 's3-line', dataset: { source: s.source } },
                h('div', null, h('b', null, (SC.lang === 'el' && s.nameEl) || s.name || K.layerName(live, s.source)), h('small', null, K.kindWord(s.kind) + (s.env && s.env !== 'outdoor' ? ' · ' + K.envWord(s.env) : ''))),
                K.spark(s.points.map((p) => p[1]), lo, hi, i % 2 ? 'b' : 'a'),
                h('div', { class: 's3-nums' }, h('b', null, K.withUnit(st.last.v, u)), h('small', null, T('at ', 'στις ') + K.when(st.last.t) + ' · ' + (st.n < 2 ? T('one saved moment', 'μία αποθηκευμένη στιγμή') : T('lowest ', 'χαμηλότερο ') + K.withUnit(st.min, u) + T(', highest ', ', ψηλότερο ') + K.withUnit(st.max, u))))));
            });
            dayBox.replaceChildren(...kids);
          }).catch(() => { if (my === askNo && !m.dead) dayBox.replaceChildren(K.empty(T('The saved day could not be loaded. It is tried again when you pick the topic again.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. Γίνεται νέα προσπάθεια όταν διαλέξεις ξανά το θέμα.'))); });
        }
        body.append(dayP);

        /* ----- 4. open differences between sources ----- */
        const dif = K.panel(T('Open differences between sources', 'Ανοιχτές διαφορές ανάμεσα στις πηγές'));
        dif.classList.add('s3-differ');
        if (!live) dif.append(K.empty(T('The live readings could not be loaded.', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν.')));
        else {
          const mine = (live.rivers || []).filter((r) => r.cities && r.cities[city] && (topic === 'own' ? r.cities[city].sources.some((id) => K.isOwn(live, id)) : K.TOPIC_VARS[topic].indexOf(r.variable) >= 0));
          const differ = mine.filter((r) => r.cities[city].state === 'differ'), unknown = mine.filter((r) => r.cities[city].state === 'unknown'), agree = mine.filter((r) => r.cities[city].state === 'agree');
          if (differ.length) dif.append(h('ul', { class: 't1-lines' }, differ.map((r) => K.differLine(live, r, city))), K.warn(K.differNote()));
          else dif.append(K.empty(mine.length ? T('No open difference for this topic in ' + K.cityName(city) + ' right now.', 'Καμία ανοιχτή διαφορά γι’ αυτό το θέμα αυτή τη στιγμή: ' + K.cityName(city) + '.')
            : T('For this topic no measurement is read by two sources in ' + K.cityName(city) + ', so there is nothing to compare.', 'Γι’ αυτό το θέμα καμία μέτρηση δεν διαβάζεται από δύο πηγές (' + K.cityName(city) + '), άρα δεν υπάρχει κάτι για σύγκριση.')));
          if (agree.length) dif.append(K.note(T('Agree within the allowed gap: ', 'Συμφωνούν μέσα στην επιτρεπτή απόσταση: ') + agree.map((r) => K.varName(r.variable, live)).join(', ') + '.'));
          if (unknown.length) dif.append(K.note(T('Cannot be judged, because there is no rule for how far apart is too far: ', 'Δεν κρίνονται, επειδή δεν υπάρχει κανόνας για το πόσο μακριά είναι πολύ: ') + unknown.map((r) => K.varName(r.variable, live)).join(', ') + '.'));
          dif.append(h('p', null, h('a', { class: 'nm-btn', href: '#/layers?city=' + city }, T('Open the Data layers page', 'Άνοιξε τα Στρώματα δεδομένων'))));
        }
        body.append(dif);
      }

      m = K.mount(root, { cls: 's3', need: ['live', 'devices'], draw });
      return () => m.stop();
    },
  });
})();
