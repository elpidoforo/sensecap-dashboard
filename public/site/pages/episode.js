/*
  How an event unfolded: one event of the Event radar, hour by hour, one row per source.
    #/episode?e=<id>     the event with that id (ids come from the radar cards)
    #/episode            the list of events to pick from
  It uses the same loading and the same rule as pages/radar.js (SC.radar), so the two pages can never disagree.
  Data: GET /layers/api/live, /layers/api/replay and /layers/api/compare?city=&variable= (the saved day only).
  The table shows every source that has the event's measurements for that city, also the ones that did NOT move: a quiet source
  is part of the story. Indoor and vehicle rows are labelled and are not compared with outdoor rows.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/toolkit-b2.css');
  function core() {   // pages/radar.js holds the rule; load it once if the radar page has not been opened yet
    if (SC.radar) return Promise.resolve(SC.radar);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/site/pages/radar.js?v=1';
      s.onload = () => (SC.radar ? res(SC.radar) : rej(new Error('radar')));
      s.onerror = () => { s.remove(); rej(new Error('radar')); };
      document.head.append(s);
    });
  }

  SC.register('episode', {
    title: ['How an event unfolded', 'Πώς εξελίχθηκε ένα γεγονός'],
    render(root, ctx) {
      let dead = false;
      const want = (ctx && ctx.query && ctx.query.get('e')) || '';
      const box = h('div', { class: 't2' }, h('p', { class: 't2-empty', role: 'status' }, T('Loading the saved day…', 'Φόρτωση της αποθηκευμένης μέρας…')));
      root.append(SC.head({ title: T('How an event unfolded', 'Πώς εξελίχθηκε ένα γεγονός'),
        lede: T('One event from the radar, hour by hour, with one row for every source. Saved readings only.', 'Ένα γεγονός από το ραντάρ, ώρα με την ώρα, με μία γραμμή για κάθε πηγή. Μόνο αποθηκευμένες μετρήσεις.'),
        help: ['Each row is one source. Each column is one hour of the saved day, and the number is that source\'s average in that hour. A marked box is an hour when the source moved more than the rule allows. Rows that never get a mark measured the same thing and stayed calm.',
          'Κάθε γραμμή είναι μία πηγή. Κάθε στήλη είναι μία ώρα της αποθηκευμένης μέρας και ο αριθμός είναι ο μέσος όρος της πηγής εκείνη την ώρα. Ένα σημειωμένο κουτί είναι μια ώρα που η πηγή κινήθηκε περισσότερο από όσο επιτρέπει ο κανόνας. Οι γραμμές χωρίς σημάδι μέτρησαν το ίδιο πράγμα και έμειναν ήρεμες.'] }), box);

      function picker(R, res, note) {
        box.replaceChildren(h('div', { class: 't2-panel' },
          h('div', { class: 't2-head' }, h('b', null, note || T('Pick an event', 'Διάλεξε ένα γεγονός'))),
          res.events.length ? h('ul', { class: 'ep-pick' }, res.events.slice(0, 20).map((ev) => h('li', null, h('a', { class: 't2-go', href: '#/episode?e=' + encodeURIComponent(ev.id) }, R.cityName(ev.city) + ' · ' + R.span(ev)), h('span', { class: 't2-note' }, ' ' + ev.variables.map(R.lab).join(', ') + ' · ' + T('score ', 'βαθμός ') + R.num(ev.score)))))
            : h('p', { class: 't2-empty', role: 'status' }, T('The radar found no events in the saved day, so there is nothing to open.', 'Το ραντάρ δεν βρήκε γεγονότα στην αποθηκευμένη μέρα, άρα δεν υπάρχει κάτι να ανοίξεις.')),
          h('a', { class: 't2-go', href: '#/radar' }, T('Back to the radar', 'Πίσω στο ραντάρ'))));
      }

      function show(R, data, res, ev) {
        const pl = res.plan, num = R.num, lab = R.lab;
        const a = Math.max(0, ev.i0 - 3), b = Math.min(pl.n - 1, ev.i1 + 3), cols = [];
        for (let i = a; i <= b; i++) cols.push(i);
        const vars = new Set(ev.signals.map((sg) => (sg.type === 'move' ? sg.series.variable : sg.variable)));
        const rows = data.series.filter((s) => s.city === ev.city && vars.has(s.variable)).sort((x, y) => x.variable.localeCompare(y.variable) || x.kind.localeCompare(y.kind) || x.source.localeCompare(y.source));
        const moved = new Map();   // series|hour -> signal
        ev.signals.forEach((sg) => { if (sg.type === 'move') moved.set(sg.series.source + '|' + sg.series.variable + '|' + sg.i, sg); });
        const table = h('table', { class: 'ep-tb' },
          h('caption', null, T('Hourly averages. A box with an arrow is an hour the rule marked.', 'Ωριαίοι μέσοι όροι. Ένα κουτί με βέλος είναι μια ώρα που σημείωσε ο κανόνας.')),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, T('Source', 'Πηγή')), cols.map((i) => h('th', { scope: 'col', class: i >= ev.i0 && i <= ev.i1 ? 'in' : '' }, SC.time(pl.start(i)))))),
          h('tbody', null, rows.map((s) => h('tr', null,
            h('th', { scope: 'row' }, h('b', null, lab(s.name)), h('small', null, lab(s.label) + (s.unit ? ' (' + s.unit + ')' : '') + ' · ' + R.kindName(s.kind) + ' · ' + R.envName(s.env))),
            cols.map((i) => { const sg = moved.get(s.source + '|' + s.variable + '|' + i), v = s.hours[i];
              return h('td', { class: sg ? 'hit' : v == null ? 'none' : '', 'aria-label': sg ? T('marked: ', 'σημειωμένο: ') + R.sayMove(sg) : null }, v == null ? '–' : num(v), sg ? h('em', { 'aria-hidden': 'true' }, sg.step > 0 ? ' ▲' : ' ▼') : null); })))));
        const calm = rows.filter((s) => !ev.signals.some((sg) => sg.type === 'move' && sg.series === s));
        box.replaceChildren(
          h('div', { class: 't2-panel' },
            h('div', { class: 't2-head' }, h('b', null, R.cityName(ev.city) + ' · ' + R.span(ev)),
              h('span', { class: 't2-note' }, T(ev.kinds.length + (ev.kinds.length === 1 ? ' kind of source' : ' kinds of source') + ': ', ev.kinds.length + (ev.kinds.length === 1 ? ' είδος πηγής' : ' είδη πηγών') + ': ') + ev.kinds.map(R.kindName).join(', '))),
            h('p', { class: 't2-warn' }, R.CAUTION())),
          h('div', { class: 't2-panel' },
            h('div', { class: 't2-head' }, h('b', null, T('Hour by hour', 'Ώρα με την ώρα'))),
            h('div', { class: 'ep-scroll', tabindex: '0', role: 'region', 'aria-label': T('The event hour by hour. Scroll sideways to see every hour.', 'Το γεγονός ώρα με την ώρα. Κύλισε στο πλάι για να δεις κάθε ώρα.') }, table),
            h('p', { class: 't2-note' }, T('Columns with a bright heading are the hours of the event; three hours before and after are shown for comparison. Rows measured indoors or inside a vehicle are labelled and are not compared with outdoor rows.', 'Οι στήλες με φωτεινή επικεφαλίδα είναι οι ώρες του γεγονότος· φαίνονται και τρεις ώρες πριν και μετά για σύγκριση. Οι γραμμές που μετρήθηκαν μέσα σε τάξη ή σε όχημα έχουν ετικέτα και δεν συγκρίνονται με τις εξωτερικές.'))),
          h('div', { class: 't2-panel' },
            h('div', { class: 't2-head' }, h('b', null, T('What each source saw, in order', 'Τι είδε κάθε πηγή, με τη σειρά'))),
            h('ol', { class: 'ep-steps' }, ev.signals.slice().sort((x, y) => x.i - y.i).map((sg) => h('li', null, h('b', null, SC.dateTime(pl.start(sg.i)) + ' · ' + (sg.type === 'move' ? lab(sg.series.name) : sg.sources.map((s) => lab(s.name)).join(', '))), h('span', null, (sg.type === 'move' ? R.sayMove(sg) : R.sayDiffer(sg)) + '.')))),
            calm.length ? h('p', { class: 't2-note ep-calm' }, T('Measured the same thing here and did not pass the rule: ', 'Μέτρησαν το ίδιο πράγμα εδώ και δεν πέρασαν τον κανόνα: ') + calm.map((s) => lab(s.name) + ' (' + lab(s.label).toLowerCase() + ')').join(', ') + '.') : null,
            h('p', { class: 't2-why' }, R.formula(ev)),
            h('p', { class: 't2-note' }, T('Every number is an hourly average of saved readings from the layer named in its row. The page does not know why this happened.', 'Κάθε αριθμός είναι ωριαίος μέσος όρος αποθηκευμένων μετρήσεων από το στρώμα που γράφει η γραμμή του. Η σελίδα δεν ξέρει γιατί συνέβη αυτό.')),
            h('a', { class: 't2-go', href: '#/radar' }, T('Back to the radar', 'Πίσω στο ραντάρ'))));
      }

      core().then((R) => R.load(false).then((data) => {
        if (dead) return;
        const res = R.detect(data);
        if (res.plan.n < 2) { box.replaceChildren(h('p', { class: 't2-empty', role: 'status' }, T('Nothing has been saved yet, so there is no event to show. Come back in a little while.', 'Δεν έχει αποθηκευτεί τίποτα ακόμη, άρα δεν υπάρχει γεγονός να δείξουμε. Έλα ξανά σε λίγο.'))); return; }
        const ev = want ? res.events.find((x) => x.id === want) : null;
        if (ev) show(R, data, res, ev);
        else picker(R, res, want ? T('That event is no longer in the saved day. Pick another one.', 'Αυτό το γεγονός δεν είναι πια στην αποθηκευμένη μέρα. Διάλεξε ένα άλλο.') : null);
      })).catch((e) => { if (dead) return; box.replaceChildren(h('p', { class: 't2-empty' }, h('span', { class: 't2-err', role: 'alert' }, e && e.message !== 'radar' && e.message ? e.message : T('The event could not be loaded. Try again in a moment.', 'Το γεγονός δεν φορτώθηκε. Δοκίμασε ξανά σε λίγο.')), ' ', h('a', { class: 't2-go', href: '#/radar' }, T('Back to the radar', 'Πίσω στο ραντάρ')))); });
      return () => { dead = true; };
    },
  });
})();
