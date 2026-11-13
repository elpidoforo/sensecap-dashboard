/*
  What changed since yesterday (toolkit). Three plain lists, all from data the platform already has:
    1. per city, the newest saved reading against the oldest one still kept and against the one of an hour ago   (GET /layers/api/replay)
    2. layers that are quiet now, and lines of the saved day that stopped or came back                            (GET /layers/api/live, replay)
    3. measurements where two or more sources do not agree right now                                              (live.rivers)
  Every line carries its unit, both times and the name of the layer. When the saved day is shorter than a few hours the page says so.
  Words used for a change: up, down, no change. Never better or worse.
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

  function draw(d, body) {
    const K = SC.tk1, live = d.live, replay = d.replay, span = K.daySpan(replay);

    /* ----- the saved day ----- */
    const dayP = K.panel(T('The saved day', 'Η αποθηκευμένη μέρα'));
    dayP.classList.add('ch-day');
    if (!replay) dayP.append(K.empty(T('The saved day could not be loaded, so the changes cannot be worked out right now.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε, άρα οι αλλαγές δεν μπορούν να υπολογιστούν τώρα.')));
    else if (span.n < 2) dayP.append(K.warn(K.fillingNote({ n: 0 })));
    else {
      dayP.append(h('p', { class: 't1-big' }, T('From ', 'Από ') + K.when(span.from) + T(' to ', ' έως ') + K.when(span.to), h('small', null, K.dur(span.ms) + ' · ' + T(span.n + ' saved moments', span.n + ' αποθηκευμένες στιγμές'))));
      if (span.ms < K.SHORT) dayP.append(h('p', { class: 't1-warn ch-filling' }, K.fillingNote(span) + ' ' + T('So "since yesterday" on this page means "since ' + K.when(span.from) + '".', 'Άρα το «από χθες» σε αυτή τη σελίδα σημαίνει «από τις ' + K.when(span.from) + '».')));
      else if (span.ms < 20 * K.HOUR) dayP.append(K.note(T('The log does not hold a full day yet, so "yesterday" here means the oldest saved moment, ' + K.when(span.from) + '.', 'Το αρχείο δεν έχει ακόμη ολόκληρη μέρα, άρα το «χθες» εδώ σημαίνει την παλαιότερη αποθηκευμένη στιγμή, ' + K.when(span.from) + '.')));
      else dayP.append(K.note(T('The log keeps about one day. "Yesterday" here means the oldest saved moment.', 'Το αρχείο κρατά περίπου μία μέρα. Το «χθες» εδώ σημαίνει την παλαιότερη αποθηκευμένη στιγμή.')));
    }
    body.append(dayP);

    /* ----- 1. per city ----- */
    if (replay && span.n >= 2) {
      const grid = h('div', { class: 'ch-grid' });
      K.CITY_IDS.forEach((c) => {
        const lines = K.MEAS.map(([k]) => { const s = K.series(replay, c, k); return { k, s, st: s ? K.stats(s.values, replay.times) : null }; });
        // biggest change first: the change since the oldest moment, as a part of that line's own range over the saved day
        const weight = (x) => (x.st && x.st.range > 0 ? Math.abs(x.st.last.v - x.st.first.v) / x.st.range : x.st ? 0 : -1);
        lines.sort((a, b) => weight(b) - weight(a));
        const ul = h('ul', { class: 'ch-list' });
        lines.forEach(({ k, s, st }) => {
          const label = k === 'own' && s ? K.measName(k) + ': ' + K.varName(s.variable, live) : K.measName(k);
          if (!st) { ul.append(h('li', { class: 'ch-li none', dataset: { k } }, h('b', null, label), h('span', { class: 'ch-said' }, T('Nothing saved for this in ' + K.cityName(c) + '.', 'Δεν έχει αποθηκευτεί κάτι γι’ αυτό: ' + K.cityName(c) + '.')))); return; }
          const u = s.unit || '';
          const delta = (from) => {
            const dv = st.last.v - from.v, r = Math.round(dv * 10) / 10;
            const dir = r > 0 ? 'up' : r < 0 ? 'down' : 'same';
            const word = dir === 'up' ? T('up', 'πάνω') : dir === 'down' ? T('down', 'κάτω') : T('no change', 'καμία αλλαγή');
            return h('span', { class: 'ch-d ' + dir }, h('i', { 'aria-hidden': 'true' }, dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'),
              dir === 'same' ? word + T(' since ', ' από τις ') + K.when(from.t) + ' (' + K.withUnit(from.v, u) + ')'
                : word + ' ' + K.withUnit(Math.abs(dv), u) + T(' since ', ' από τις ') + K.when(from.t) + T(' (it was ', ' (ήταν ') + K.withUnit(from.v, u) + ')');
          };
          ul.append(h('li', { class: 'ch-li', dataset: { k } },
            h('b', null, label),
            h('span', { class: 'ch-now' }, K.withUnit(st.last.v, u), h('small', null, T(' at ', ' στις ') + K.when(st.last.t))),
            st.n < 2 ? h('span', { class: 'ch-said' }, T('Only one saved moment, so there is nothing to compare with yet.', 'Μόνο μία αποθηκευμένη στιγμή, άρα δεν υπάρχει ακόμη κάτι για σύγκριση.')) : [
              h('span', { class: 'ch-row' }, h('em', null, T('Oldest saved', 'Παλαιότερη αποθηκευμένη')), delta(st.first)),
              h('span', { class: 'ch-row' }, h('em', null, T('One hour ago', 'Πριν από μία ώρα')), st.hourAgo ? delta(st.hourAgo) : h('span', { class: 'ch-said' }, T('no saved moment close to one hour before ' + K.when(st.last.t), 'καμία αποθηκευμένη στιγμή κοντά στη μία ώρα πριν από τις ' + K.when(st.last.t)))),
            ],
            h('small', { class: 'ch-src' }, T('Layer: ', 'Στρώμα: ') + K.layerName(live, s.source))));
        });
        grid.append(h('article', { class: 't1-card ch-city', dataset: { c } }, h('h3', null, K.cityName(c)), ul));
      });
      body.append(K.panel(T('Biggest changes in each city', 'Οι μεγαλύτερες αλλαγές σε κάθε πόλη'), grid,
        K.note(T('In each city the lines are in order of the change since the oldest saved moment, measured against that line\'s own lowest-to-highest range over the saved day. It is an order by a number and nothing more: "up" and "down" do not mean better or worse.',
          'Σε κάθε πόλη οι γραμμές μπαίνουν με σειρά αλλαγής από την παλαιότερη αποθηκευμένη στιγμή, σε σχέση με το εύρος (από το χαμηλότερο ως το ψηλότερο) της ίδιας γραμμής μέσα στην αποθηκευμένη μέρα. Είναι σειρά με βάση έναν αριθμό και τίποτα παραπάνω: το «πάνω» και το «κάτω» δεν σημαίνουν καλύτερα ή χειρότερα.'))));
    }

    /* ----- 2. layers: quiet, back, speaking ----- */
    const lay = K.panel(T('Layers: quiet or back', 'Στρώματα: σιωπηλά ή ξανά ενεργά'));
    lay.classList.add('ch-layers');
    if (!live) lay.append(K.empty(T('The list of layers could not be loaded.', 'Η λίστα των στρωμάτων δεν φορτώθηκε.')));
    else {
      const L = live.layers || [];
      const nm = (l) => (SC.lang === 'el' && l.nameEl) || l.name;
      const late = L.filter((l) => l.state === 'late'), wentQuiet = L.filter((l) => (l.state === 'down' || l.state === 'off') && l.lastAt);
      const never = L.filter((l) => (l.state === 'down' || l.state === 'off') && !l.lastAt), speaking = L.filter((l) => l.state === 'live');
      const notYet = L.filter((l) => l.state === 'planned' || l.state === 'candidate').length;
      const quietUl = h('ul', { class: 't1-lines ch-quiet' });
      wentQuiet.forEach((l) => quietUl.append(h('li', { class: 't1-line' }, h('b', null, nm(l)), h('span', null, T('Quiet now. Its last reading was at ', 'Σιωπηλό τώρα. Η τελευταία του μέτρηση ήταν στις ') + K.when(l.lastAt) + ' (' + SC.ago(l.lastAt) + ').'))));
      late.forEach((l) => quietUl.append(h('li', { class: 't1-line' }, h('b', null, nm(l)), h('span', null, T('Late: it still answers, but its newest reading is older than it should be', 'Αργεί: απαντά ακόμη, αλλά η πιο πρόσφατη μέτρησή του είναι παλαιότερη απ’ όσο πρέπει') + (l.lastAt ? T(' (last at ', ' (τελευταία στις ') + K.when(l.lastAt) + ').' : '.')))));
      lay.append(h('h3', { class: 't1-h3' }, T('Went quiet', 'Σώπασαν')), wentQuiet.length + late.length ? quietUl : K.empty(T('No layer that was speaking has gone quiet or is late.', 'Κανένα στρώμα που μιλούσε δεν έχει σωπάσει ή αργήσει.')));
      // lines of the saved day that stopped, or stopped and came back
      const gapUl = h('ul', { class: 't1-lines ch-gaps' });
      if (replay && span.n >= 2) K.CITY_IDS.forEach((c) => K.MEAS.forEach(([k]) => {
        const s = K.series(replay, c, k); if (!s) return;
        const g = K.gaps(s.values, replay.times, replay.every); if (!g.length) return;
        const last = g[g.length - 1];
        gapUl.append(h('li', { class: 't1-line' }, h('b', null, K.cityName(c) + ' · ' + K.measName(k)),
          h('span', null, last.back ? T('Nothing was saved from ' + K.when(last.from) + ' to ' + K.when(last.to) + ', then it came back.', 'Δεν αποθηκεύτηκε τίποτα από τις ' + K.when(last.from) + ' έως τις ' + K.when(last.to) + ', και μετά επέστρεψε.')
            : T('Nothing has been saved since ' + K.when(last.from) + '.', 'Δεν έχει αποθηκευτεί τίποτα από τις ' + K.when(last.from) + '.')),
          h('small', null, T('Layer: ', 'Στρώμα: ') + K.layerName(live, s.source) + (s.unit ? ' · ' + T('unit: ', 'μονάδα: ') + s.unit : ''))));
      }));
      lay.append(h('h3', { class: 't1-h3' }, T('Stopped or came back in the saved day', 'Σταμάτησαν ή επέστρεψαν μέσα στην αποθηκευμένη μέρα')),
        gapUl.children.length ? gapUl : K.empty(!replay || span.n < 2 ? T('There is no saved day yet to look for gaps in.', 'Δεν υπάρχει ακόμη αποθηκευμένη μέρα για να ψάξουμε κενά.')
          : T('No gaps: the four lines the saved day keeps for each city (outdoor air, wind, sea, our sensors) were saved without a break since ' + K.when(span.from) + '.', 'Χωρίς κενά: οι τέσσερις γραμμές που κρατά η αποθηκευμένη μέρα για κάθε πόλη (αέρας έξω, άνεμος, θάλασσα, οι αισθητήρες μας) αποθηκεύτηκαν χωρίς διακοπή από τις ' + K.when(span.from) + '.')));
      const det = (cls, sum, list, line) => h('details', { class: 't1-det ' + cls }, h('summary', null, sum), h('ul', { class: 't1-lines' }, list.map((l) => h('li', { class: 't1-line' }, h('b', null, nm(l)), h('span', null, line(l))))));
      lay.append(h('h3', { class: 't1-h3' }, T('Right now', 'Αυτή τη στιγμή')),
        speaking.length ? det('ch-speaking', T(speaking.length + ' layers are speaking', speaking.length + ' στρώματα μιλούν'), speaking, (l) => (l.lastAt ? T('newest reading at ', 'πιο πρόσφατη μέτρηση στις ') + K.when(l.lastAt) : T('answers, with no time on its newest reading', 'απαντά, χωρίς ώρα στην πιο πρόσφατη μέτρηση')))
          : K.empty(T('No layer is speaking right now.', 'Κανένα στρώμα δεν μιλά αυτή τη στιγμή.')),
        never.length ? det('ch-never', T(never.length + ' layers are connected but have given no reading, so we cannot say when they went quiet', never.length + ' στρώματα είναι συνδεδεμένα αλλά δεν έχουν δώσει μέτρηση, άρα δεν μπορούμε να πούμε πότε σώπασαν'), never, () => T('no reading with a time', 'καμία μέτρηση με ώρα')) : null,
        notYet ? K.note(T(notYet + ' more layers are planned and not connected yet. They are not counted as quiet.', 'Άλλα ' + notYet + ' στρώματα είναι σχεδιασμένα και δεν έχουν συνδεθεί ακόμη. Δεν μετρούν ως σιωπηλά.')) : null,
        K.note(T('This list was read at ' + K.when(live.at) + '.', 'Η λίστα διαβάστηκε στις ' + K.when(live.at) + '.')));
    }
    body.append(lay);

    /* ----- 3. sources that differ ----- */
    const dif = K.panel(T('Where sources that measure the same thing differ now', 'Πού διαφέρουν τώρα οι πηγές που μετρούν το ίδιο πράγμα'));
    dif.classList.add('ch-differ');
    if (!live) dif.append(K.empty(T('The live readings could not be loaded.', 'Οι ζωντανές μετρήσεις δεν φορτώθηκαν.')));
    else {
      const all = [];
      (live.rivers || []).forEach((r) => Object.keys(r.cities || {}).forEach((c) => all.push({ r, c, x: r.cities[c] })));
      const differ = all.filter((a) => a.x.state === 'differ').sort((a, b) => b.x.spread / (b.x.tolerance || 1) - a.x.spread / (a.x.tolerance || 1));
      const agree = all.filter((a) => a.x.state === 'agree').length, unknown = all.filter((a) => a.x.state === 'unknown').length;
      if (!all.length) dif.append(K.empty(T('Right now no measurement is read by two sources in the same city, so there is nothing to compare.', 'Αυτή τη στιγμή καμία μέτρηση δεν διαβάζεται από δύο πηγές στην ίδια πόλη, άρα δεν υπάρχει κάτι για σύγκριση.')));
      else {
        dif.append(h('p', { class: 't1-big' }, T(differ.length + ' differ', differ.length + ' διαφέρουν'), h('small', null, T(agree + ' agree', agree + ' συμφωνούν') + (unknown ? ' · ' + T(unknown + ' cannot be judged (no rule for how far apart is too far)', unknown + ' δεν κρίνονται (δεν υπάρχει κανόνας για το πόσο μακριά είναι πολύ)') : ''))));
        if (differ.length) dif.append(h('ul', { class: 't1-lines' }, differ.map((a) => K.differLine(live, a.r, a.c))),
          K.note(T('Ordered by how far past the allowed gap the sources are. Only outdoor readings are put together: an indoor reading is never compared with the street.', 'Με σειρά το πόσο ξεπερνούν οι πηγές την επιτρεπτή απόσταση. Μπαίνουν μαζί μόνο μετρήσεις έξω: μια μέτρηση μέσα σε κτίριο δεν συγκρίνεται ποτέ με τον δρόμο.')));
        else dif.append(K.empty(T('Every shared measurement agrees within its allowed gap right now.', 'Κάθε κοινή μέτρηση συμφωνεί μέσα στην επιτρεπτή απόσταση αυτή τη στιγμή.')));
        dif.append(K.warn(K.differNote()));
      }
      dif.append(h('p', null, h('a', { class: 'nm-btn', href: '#/layers' }, T('Open the Data layers page', 'Άνοιξε τα Στρώματα δεδομένων'))));
    }
    body.append(dif);
  }

  SC.register('changed', {
    title: ['What changed since yesterday', 'Τι άλλαξε από χθες'],
    async render(root) {
      document.title = T('What changed since yesterday', 'Τι άλλαξε από χθες') + ' · Athena';
      root.append(SC.head({ title: T('What changed since yesterday', 'Τι άλλαξε από χθες'),
        lede: T('The newest reading of each city next to the oldest one we still keep and the one from an hour ago. Then the layers that are quiet, and the places where two sources do not agree.', 'Η πιο πρόσφατη μέτρηση κάθε πόλης δίπλα στην παλαιότερη που κρατάμε και σε αυτήν πριν από μία ώρα. Μετά τα στρώματα που σώπασαν και τα σημεία όπου δύο πηγές δεν συμφωνούν.'),
        help: ['The platform saves a reading for each city every few minutes and keeps about one day. This page takes the newest saved reading and subtracts the oldest one and the one from an hour ago. Each line shows the unit, both times and the layer (the source) it came from. A change is only a change: the page does not say why it happened.',
          'Η πλατφόρμα αποθηκεύει μια μέτρηση για κάθε πόλη κάθε λίγα λεπτά και κρατά περίπου μία μέρα. Η σελίδα παίρνει την πιο πρόσφατη αποθηκευμένη μέτρηση και αφαιρεί την παλαιότερη και εκείνη πριν από μία ώρα. Κάθε γραμμή δείχνει τη μονάδα, τις δύο ώρες και το στρώμα (την πηγή) από όπου ήρθε. Μια αλλαγή είναι μόνο αλλαγή: η σελίδα δεν λέει γιατί έγινε.'] }));
      await core();
      const m = SC.tk1.mount(root, { cls: 'ch', need: ['live', 'replay'], draw });
      return () => m.stop();
    },
  });
})();
