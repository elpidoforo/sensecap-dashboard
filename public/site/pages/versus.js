/*
  City vs city (toolkit). Two of the four cities side by side on the same measures:
    - the four lines of the saved day (outdoor air temperature, wind, sea, our own sensors): newest value, its time, its layer, a small line of the day
    - every measurement that both cities have right now, with each source, its kind, its time                (GET /layers/api/live, /layers/api/replay)
  Rules: a reading is only put next to a reading taken in the same kind of place (outdoors with outdoors, a vehicle with a vehicle;
  indoor never against outdoor). There is no winner and no "better": a gap is given as a number, with the kinds of the two sources.
  Link: #/versus?a=larnaka&b=paphos
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

  SC.register('versus', {
    title: ['City vs city', 'Πόλη με πόλη'],
    async render(root, ctx) {
      document.title = T('City vs city', 'Πόλη με πόλη') + ' · Athena';
      root.append(SC.head({ title: T('City vs city', 'Πόλη με πόλη'),
        lede: T('Pick two cities and read them side by side, measure by measure. Every number shows its time and the layer it came from.', 'Διάλεξε δύο πόλεις και διάβασέ τες δίπλα δίπλα, μέτρηση προς μέτρηση. Κάθε αριθμός δείχνει την ώρα του και το στρώμα από όπου ήρθε.'),
        help: ['Choose two cities. For each measure you see the newest number of each city, when it was read and which layer (source) gave it, plus a small line of the saved day. Under it, every measurement both cities have right now. The page never says which city is better: it puts numbers side by side and tells you when they come from different kinds of sources.',
          'Διάλεξε δύο πόλεις. Για κάθε μέτρηση βλέπεις τον πιο πρόσφατο αριθμό κάθε πόλης, πότε διαβάστηκε και ποιο στρώμα (πηγή) τον έδωσε, μαζί με μια μικρή γραμμή της αποθηκευμένης μέρας. Από κάτω, κάθε μέτρηση που έχουν και οι δύο πόλεις τώρα. Η σελίδα δεν λέει ποτέ ποια πόλη είναι καλύτερη: βάζει αριθμούς δίπλα δίπλα και σου λέει πότε έρχονται από διαφορετικά είδη πηγών.'] }));
      await core();
      const K = SC.tk1;
      const ok = (c) => K.CITY_IDS.indexOf(c) >= 0;
      let a = ok(ctx.query.get('a')) ? ctx.query.get('a') : 'larnaka', b = ok(ctx.query.get('b')) ? ctx.query.get('b') : 'lefkosia';
      if (a === b) b = K.CITY_IDS.find((c) => c !== a);
      let m = null;

      function picker(which) {
        const cur = which === 'a' ? a : b, other = which === 'a' ? b : a, id = 'vs-pick-' + which;
        const sel = h('select', { id, class: 'nm-input vs-sel', onchange: () => { if (which === 'a') a = sel.value; else b = sel.value; m.redraw(); const again = document.getElementById(id); if (again) again.focus(); } },
          K.CITY_IDS.map((c) => { const o = h('option', { value: c, disabled: c === other ? true : null }, K.cityName(c)); if (c === cur) o.selected = true; return o; }));
        return h('label', { class: 'vs-pick', for: id }, h('span', null, which === 'a' ? T('First city', 'Πρώτη πόλη') : T('Second city', 'Δεύτερη πόλη')), sel);
      }

      function draw(d, body) {
        const live = d.live, replay = d.replay, span = K.daySpan(replay);
        body.append(h('div', { class: 't1-panel vs-top' },
          h('div', { class: 'vs-picks' }, picker('a'), h('span', { class: 'vs-and', 'aria-hidden': 'true' }, T('and', 'και')), picker('b'),
            h('button', { type: 'button', class: 'nm-btn vs-swap', onclick: () => { const x = a; a = b; b = x; m.redraw(); } }, T('Swap sides', 'Άλλαξε πλευρές'))),
          h('p', { class: 't1-warn vs-honest' }, T('No winner here. Two cities may be read by different kinds of sources: an official station in one, a computer model or our own low-cost sensor in the other. So a small gap between two numbers may be the instruments, not the cities.',
            'Εδώ δεν υπάρχει νικητής. Δύο πόλεις μπορεί να μετρώνται από διαφορετικά είδη πηγών: επίσημος σταθμός στη μία, υπολογιστικό μοντέλο ή δικός μας αισθητήρας χαμηλού κόστους στην άλλη. Άρα μια μικρή απόσταση ανάμεσα σε δύο αριθμούς μπορεί να είναι τα όργανα και όχι οι πόλεις.'))));

        /* ----- the four lines of the saved day ----- */
        const dayP = K.panel(T('The same four measures', 'Οι ίδιες τέσσερις μετρήσεις'));
        dayP.classList.add('vs-day');
        if (!replay) dayP.append(K.empty(T('The saved day could not be loaded. The live readings are still listed below.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. Οι ζωντανές μετρήσεις φαίνονται παρακάτω.')));
        else if (!span.n) dayP.append(K.warn(K.fillingNote(span)));
        else {
          if (span.ms < K.SHORT) dayP.append(K.warn(K.fillingNote(span) + ' ' + T('The small lines are short for now.', 'Οι μικρές γραμμές είναι κοντές προς το παρόν.')));
          K.MEAS.forEach(([k]) => {
            const S = [a, b].map((c) => { const s = K.series(replay, c, k); return { c, s, st: s ? K.stats(s.values, replay.times) : null, env: s ? K.envOf(live, c, s.source, s.variable) : null }; });
            const both = S[0].st && S[1].st;
            const sameVar = both && S[0].s.variable === S[1].s.variable && (S[0].s.unit || '') === (S[1].s.unit || '');
            const mixedPlace = both && S[0].env && S[1].env && S[0].env !== S[1].env && (S[0].env === 'indoor' || S[1].env === 'indoor' || S[0].env === 'outdoor' || S[1].env === 'outdoor');
            const shared = sameVar && !mixedPlace;
            const lo = shared ? Math.min(S[0].st.min, S[1].st.min) : null, hi = shared ? Math.max(S[0].st.max, S[1].st.max) : null;
            const col = (x, i) => {
              if (!x.st) return h('div', { class: 'vs-col none', dataset: { c: x.c } }, h('b', { class: 'vs-city' }, K.cityName(x.c)), h('span', { class: 'vs-v' }, '–'),
                h('small', null, T('No layer has saved this for ' + K.cityName(x.c) + '.', 'Κανένα στρώμα δεν το έχει αποθηκεύσει: ' + K.cityName(x.c) + '.')));
              const u = x.s.unit || '', kind = K.layerKind(live, x.s.source);
              return h('div', { class: 'vs-col', dataset: { c: x.c } }, h('b', { class: 'vs-city' }, K.cityName(x.c)),
                h('span', { class: 'vs-v' }, K.withUnit(x.st.last.v, u)),
                h('small', { class: 'vs-meta' }, (k === 'own' ? K.varName(x.s.variable, live) + ' · ' : '') + T('at ', 'στις ') + K.when(x.st.last.t) + ' · ' + K.layerName(live, x.s.source) + (kind ? ' · ' + K.kindWord(kind) : '') + (x.env && x.env !== 'outdoor' ? ' · ' + K.envWord(x.env) : '')),
                K.spark(x.s.values, shared ? lo : x.st.min, shared ? hi : x.st.max, i ? 'b' : 'a'),
                h('small', { class: 'vs-range' }, x.st.n < 2 ? T('one saved moment', 'μία αποθηκευμένη στιγμή') : T('saved day: ', 'αποθηκευμένη μέρα: ') + K.withUnit(x.st.min, u) + T(' to ', ' έως ') + K.withUnit(x.st.max, u)));
            };
            let foot;
            if (!both) foot = T('No gap is given: one of the two cities has nothing saved for this.', 'Δεν δίνεται απόσταση: η μία από τις δύο πόλεις δεν έχει κάτι αποθηκευμένο γι’ αυτό.');
            else if (!sameVar) foot = T('No gap is given: here the two cities measure different things (' + K.varName(S[0].s.variable, live) + ' and ' + K.varName(S[1].s.variable, live) + ').', 'Δεν δίνεται απόσταση: εδώ οι δύο πόλεις μετρούν διαφορετικά πράγματα (' + K.varName(S[0].s.variable, live) + ' και ' + K.varName(S[1].s.variable, live) + ').');
            else if (mixedPlace) foot = T('No gap is given: one reading was taken ' + K.envWord(S[0].env) + ' and the other ' + K.envWord(S[1].env) + '. Readings from different kinds of places are not compared.', 'Δεν δίνεται απόσταση: η μία μέτρηση έγινε ' + K.envWord(S[0].env) + ' και η άλλη ' + K.envWord(S[1].env) + '. Μετρήσεις από διαφορετικά είδη χώρων δεν συγκρίνονται.');
            else {
              const gap = Math.round((S[0].st.last.v - S[1].st.last.v) * 10) / 10, u = S[0].s.unit || '';
              const k0 = K.layerKind(live, S[0].s.source), k1 = K.layerKind(live, S[1].s.source);
              foot = (gap === 0 ? T('The two newest numbers are the same.', 'Οι δύο πιο πρόσφατοι αριθμοί είναι ίδιοι.')
                : T('Gap between the two newest numbers: ' + K.withUnit(Math.abs(gap), u) + ' (' + K.cityName(gap > 0 ? a : b) + ' reads the higher number).', 'Απόσταση ανάμεσα στους δύο πιο πρόσφατους αριθμούς: ' + K.withUnit(Math.abs(gap), u) + ' (τον μεγαλύτερο αριθμό τον δείχνει: ' + K.cityName(gap > 0 ? a : b) + ').'))
                + ' ' + (k0 && k1 && k0 !== k1 ? T('Read by different kinds of sources: ' + K.kindWord(k0) + ' and ' + K.kindWord(k1) + '.', 'Από διαφορετικά είδη πηγών: ' + K.kindWord(k0) + ' και ' + K.kindWord(k1) + '.')
                  : S[0].s.source === S[1].s.source ? T('Both come from the same layer.', 'Και οι δύο έρχονται από το ίδιο στρώμα.') : T('Both come from the same kind of source.', 'Και οι δύο έρχονται από το ίδιο είδος πηγής.'))
                + ' ' + T('The two small lines share one scale.', 'Οι δύο μικρές γραμμές έχουν την ίδια κλίμακα.');
            }
            dayP.append(h('article', { class: 't1-card vs-row', dataset: { k } }, h('h3', null, K.measName(k)), h('div', { class: 'vs-pair' }, col(S[0], 0), col(S[1], 1)), h('p', { class: 'vs-foot' }, foot)));
          });
        }
        body.append(dayP);

        /* ----- every measurement both cities have right now ----- */
        const nowP = K.panel(T('Every measurement both cities have right now', 'Κάθε μέτρηση που έχουν τώρα και οι δύο πόλεις'));
        nowP.classList.add('vs-now');
        if (!live) nowP.append(K.empty(T('The live readings could not be loaded.', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν.')));
        else {
          const rowsOf = (c) => ((live.cities[c] || {}).rows || []).filter((r) => !r.stale);
          const key = (r) => r.variable + '|' + (r.env || '');
          const A = rowsOf(a), B = rowsOf(b), keysA = new Set(A.map(key)), keysB = new Set(B.map(key));
          const sharedKeys = [...keysA].filter((x) => keysB.has(x));
          const cell = (c, list) => h('div', { class: 'vs-col', dataset: { c } }, h('b', { class: 'vs-city' }, K.cityName(c)),
            h('ul', { class: 'vs-srcs' }, list.map((r) => h('li', null, h('span', { class: 'vs-v2' }, K.withUnit(r.value, r.unit)), h('small', null, K.layerName(live, r.source) + ' · ' + K.kindWord(r.kind) + ' · ' + T('at ', 'στις ') + K.when(K.rowTime(live, r)))))));
          if (!sharedKeys.length) nowP.append(K.empty(T('Right now these two cities have no measurement in common.', 'Αυτή τη στιγμή οι δύο πόλεις δεν έχουν καμία κοινή μέτρηση.')));
          sharedKeys.forEach((x) => {
            const [variable, env] = x.split('|');
            const la = A.filter((r) => key(r) === x), lb = B.filter((r) => key(r) === x);
            const kindsA = new Set(la.map((r) => r.kind)), common = lb.some((r) => kindsA.has(r.kind));
            nowP.append(h('article', { class: 't1-card vs-row', dataset: { variable, env } },
              h('h3', null, K.varName(variable, live), env ? h('span', { class: 't1-tag' }, K.envWord(env)) : null),
              h('div', { class: 'vs-pair' }, cell(a, la), cell(b, lb)),
              common ? null : h('p', { class: 'vs-foot' }, T('These two cities have no kind of source in common for this, so the numbers are not like for like.', 'Οι δύο πόλεις δεν έχουν κανένα κοινό είδος πηγής γι’ αυτό, άρα οι αριθμοί δεν είναι ίδιου τύπου.'))));
          });
          const only = (keys, other) => [...keys].filter((x) => !other.has(x)).map((x) => { const [v, e] = x.split('|'); return K.varName(v, live) + (e && e !== 'outdoor' ? ' (' + K.envWord(e) + ')' : ''); });
          const oa = only(keysA, keysB), ob = only(keysB, keysA);
          if (oa.length) nowP.append(K.note(T('Only ' + K.cityName(a) + ' has: ', 'Μόνο εδώ υπάρχει (' + K.cityName(a) + '): ') + oa.join(', ') + '.'));
          if (ob.length) nowP.append(K.note(T('Only ' + K.cityName(b) + ' has: ', 'Μόνο εδώ υπάρχει (' + K.cityName(b) + '): ') + ob.join(', ') + '.'));
          const old = [a, b].map((c) => ((live.cities[c] || {}).rows || []).filter((r) => r.stale).length);
          if (old[0] + old[1]) nowP.append(K.note(T('Left out because they are too old: ' + old[0] + ' readings for ' + K.cityName(a) + ' and ' + old[1] + ' for ' + K.cityName(b) + '.', 'Έμειναν έξω επειδή είναι πολύ παλιές: ' + old[0] + ' μετρήσεις (' + K.cityName(a) + ') και ' + old[1] + ' (' + K.cityName(b) + ').')));
          nowP.append(K.note(T('A reading is only put next to readings taken in the same kind of place: outdoors with outdoors, a bus or car with a bus or car. An indoor reading is never set against an outdoor one. Read at ' + K.when(live.at) + '.',
            'Μια μέτρηση μπαίνει δίπλα μόνο σε μετρήσεις από το ίδιο είδος χώρου: έξω με έξω, λεωφορείο ή αυτοκίνητο με λεωφορείο ή αυτοκίνητο. Μια μέτρηση μέσα σε κτίριο δεν μπαίνει ποτέ απέναντι σε μέτρηση έξω. Διαβάστηκαν στις ' + K.when(live.at) + '.')));
        }
        body.append(nowP);
        body.append(h('p', { class: 'vs-links' }, h('a', { class: 'nm-btn nm-btn--primary', href: '#/layers' }, T('Open the Data layers page', 'Άνοιξε τα Στρώματα δεδομένων')),
          h('span', { class: 't1-note' }, T('There you can compare all the sources of one city on a chart.', 'Εκεί μπορείς να συγκρίνεις όλες τις πηγές μιας πόλης σε ένα διάγραμμα.'))));
      }

      m = K.mount(root, { cls: 'vs', need: ['live', 'replay'], draw });
      return () => m.stop();
    },
  });
})();
