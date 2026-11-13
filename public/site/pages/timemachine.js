/*
  Time machine. Route: #/timemachine   (#/timemachine?y=2012 opens a year)
  A year slider over the reviewed bathing-water history: the quality label every bathing site was given for each season, 2004 to 2025,
  exactly as reported (EEA and DG Environment, CC BY 4.0). Drawn on the island by district (shapes of island.js).
  Data: GET /layers/api/context/bathing-water-history (places of the newest list) and its .csv (every site and season), read once by
        toolkit-b3-lib.js bathing().
  Honest wording kept from context/README.md: this is history, not today's water; full reported labels; no score, no "improved" count,
  no safety badge. A district is coloured only when every one of its sites has the same label that year; otherwise it is striped
  ("mixed") and the counts are written out. A district with fewer than 3 reported sites, or none, stays grey and says so. A site that
  is not in the newest list has no place and is counted but not drawn. Play steps a year at a time; with reduced motion one step per press.
  No other yearly record is drawn: the Met Office record of this site holds readings and forecasts, not a yearly history.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/toolkit-b3.css');
  const lib = () => (SC.tk3 ? Promise.resolve(SC.tk3) : (SC.tk3p = SC.tk3p || new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/site/pages/toolkit-b3-lib.js'; s.onload = () => (SC.tk3 ? ok(SC.tk3) : no(new Error('helpers'))); s.onerror = () => { SC.tk3p = null; no(new Error(T('A part of this page could not be loaded.', 'Ένα μέρος της σελίδας δεν φορτώθηκε.'))); }; document.head.append(s); })));
  const THIN = 3;   // fewer reported sites than this in a district: grey, not coloured
  const DORDER = ['paphos', 'limassol', 'larnaca', 'famagusta', 'nicosia', 'kyrenia'];

  function render(root, ctx) {
    let alive = true, K = null, B = null, year = null, timer = 0, playing = false;
    root.append(SC.head({
      title: T('Time machine', 'Μηχανή του χρόνου'),
      lede: T('Slide through the years and see the label each bathing site of Cyprus was given, season by season, from 2004 to 2025. This is history. It does not tell you what the water is like today.',
        'Σύρε μέσα στα χρόνια και δες τον χαρακτηρισμό που πήρε κάθε σημείο κολύμβησης της Κύπρου, περίοδο με περίοδο, από το 2004 ως το 2025. Αυτό είναι ιστορία. Δεν σου λέει πώς είναι το νερό σήμερα.'),
      help: ['Every year the water at each official bathing site is tested during the swimming season and the site gets one label for that season (for example Excellent or Poor). This page shows those labels exactly as they were reported, on a map of the island. A district takes a colour only when all its sites had the same label that year; if they differ it is striped and the counts are written next to it. Districts with fewer than 3 reported sites stay grey. There is no score and no ranking.',
        'Κάθε χρόνο το νερό σε κάθε επίσημο σημείο κολύμβησης ελέγχεται στη διάρκεια της κολυμβητικής περιόδου και το σημείο παίρνει έναν χαρακτηρισμό για εκείνη την περίοδο (για παράδειγμα Εξαιρετική ή Ανεπαρκής). Η σελίδα δείχνει αυτούς τους χαρακτηρισμούς ακριβώς όπως αναφέρθηκαν, σε χάρτη του νησιού. Μια επαρχία παίρνει χρώμα μόνο όταν όλα τα σημεία της είχαν τον ίδιο χαρακτηρισμό εκείνη τη χρονιά· αν διαφέρουν γίνεται ριγέ και οι αριθμοί γράφονται δίπλα. Οι επαρχίες με λιγότερα από 3 σημεία μένουν γκρίζες. Δεν υπάρχει βαθμολογία ούτε κατάταξη.'],
      tags: [{ text: T('History, not today', 'Ιστορία, όχι σήμερα'), cls: 'arch' }],
    }));
    const host = h('div', { class: 't3' }, h('p', { class: 't3-empty', role: 'status' }, T('Loading', 'Φόρτωση')));
    root.append(host);

    const counts = (ids) => { const c = {}; ids.forEach((l) => { c[l] = (c[l] || 0) + 1; }); return K.LABEL_ORDER.filter((l) => c[l]).map((l) => [l, c[l]]).concat(Object.keys(c).filter((l) => !K.LABELS[l]).map((l) => [l, c[l]])); };
    const countWords = (cs) => cs.map(([l, k]) => k + ' ' + K.labelName(l)).join(', ');
    function yearData(y) {
      const m = B.byYear.get(y);
      if (!m) return null;
      const by = {}, noPlace = [];
      DORDER.forEach((d) => { by[d] = []; });
      const dots = [];
      m.forEach((label, id) => {
        const s = B.sites.get(id);
        if (!s || s.lat == null || !s.district) { noPlace.push(label); return; }
        (by[s.district] = by[s.district] || []).push(label);
        dots.push({ s, label });
      });
      return { total: m.size, all: counts([...m.values()]), by, noPlace, dots };
    }
    function stateOf(labels) {
      if (!labels.length) return { k: 'none' };
      if (labels.length < THIN) return { k: 'thin', n: labels.length };
      const cs = counts(labels);
      return cs.length === 1 ? { k: 'one', label: cs[0][0], n: labels.length, cs } : { k: 'mixed', n: labels.length, cs };
    }
    const bar = (cs, total) => h('span', { class: 't3-stack', 'aria-hidden': 'true' }, cs.map(([l, k]) => h('i', { style: { flex: k + ' 1 0', background: K.labelColour(l) } })), total ? null : h('i', { class: 'void' }));

    let ui = null;
    function build() {
      const isl = K.island({ label: T('Map of Cyprus by district, coloured by the bathing-water labels of the chosen year. The list next to it says the same in words.', 'Χάρτης της Κύπρου ανά επαρχία, χρωματισμένος με τους χαρακτηρισμούς των νερών κολύμβησης της επιλεγμένης χρονιάς. Η λίστα δίπλα λέει το ίδιο με λόγια.') });
      const big = h('b', { class: 't3-year', 'data-k': 'year' });
      const sum = h('p', { class: 't3-say', 'data-k': 'summary' });
      const slider = h('input', { type: 'range', class: 't3-range', id: 'tm-year', min: B.years[0], max: B.years[B.years.length - 1], step: 1, 'aria-label': T('Year', 'Χρονιά'), oninput: () => { stop(); go(Number(slider.value)); } });
      const still = K.still();
      const bPrev = h('button', { type: 'button', class: 't3-round', 'aria-label': T('Year before', 'Προηγούμενη χρονιά'), onclick: () => { stop(); go(year - 1); } }, '◀');
      const bPlay = h('button', { type: 'button', class: 't3-round play', 'data-k': 'play', onclick: () => toggle() }, '▶');
      const bNext = h('button', { type: 'button', class: 't3-round', 'aria-label': T('Year after', 'Επόμενη χρονιά'), onclick: () => { stop(); go(year + 1); } }, '▶▶');
      const strip = h('div', { class: 't3-strip', role: 'group', 'aria-label': T('All the years. Press one to jump to it.', 'Όλες οι χρονιές. Πάτα μία για να πας σε αυτή.') });
      const maxTotal = Math.max(...B.years.map((y) => B.byYear.get(y).size));
      const stripBtns = new Map();
      for (let y = B.years[0]; y <= B.years[B.years.length - 1]; y++) {
        const yd = yearData(y);
        const b = h('button', { type: 'button', class: 't3-sb' + (yd ? '' : ' none'), 'aria-label': yd ? T(y + ': ' + yd.total + ' sites, ' + countWords(yd.all), y + ': ' + yd.total + ' σημεία, ' + countWords(yd.all)) : T(y + ': no season in the release', y + ': καμία περίοδος στην έκδοση'), onclick: () => { stop(); go(y); } },
          h('span', { class: 't3-sbcol', style: { height: (yd ? Math.max(8, (yd.total / maxTotal) * 100) : 8) + '%' } }, yd ? yd.all.map(([l, k]) => h('i', { style: { flex: k + ' 1 0', background: K.labelColour(l) } })) : h('i', { class: 'void' })),
          h('small', null, String(y).slice(2)));
        stripBtns.set(y, b); strip.append(b);
      }
      const list = h('ul', { class: 't3-dlist', 'data-k': 'districts' });
      const extra = h('p', { class: 't3-note', 'data-k': 'noplace' });
      const said = h('p', { class: 't3-sr', 'aria-live': 'polite' });
      const legend = h('div', { class: 't3-legend' }, K.LABEL_ORDER.map((l) => h('span', null, h('i', { style: { background: K.labelColour(l) } }), K.labelName(l))),
        h('span', null, h('i', { class: 'k-mixed' }), T('district with different labels (mixed)', 'επαρχία με διαφορετικούς χαρακτηρισμούς (μικτή)')), h('span', null, h('i', { class: 'k-grey' }), T('fewer than ' + THIN + ' sites or none: not coloured', 'λιγότερα από ' + THIN + ' σημεία ή κανένα: χωρίς χρώμα')));
      host.replaceChildren(
        h('section', { class: 't3-panel t3-tmctl', 'aria-label': T('Choose a year', 'Διάλεξε χρονιά') },
          h('div', { class: 't3-tmhead' }, h('div', null, h('span', { class: 't3-kl' }, T('Bathing season', 'Κολυμβητική περίοδος')), big), h('span', { class: 't3-ctl' }, bPrev, bPlay, bNext)),
          slider, strip, sum),
        h('div', { class: 't3-cols' },
          h('section', { class: 't3-panel', 'aria-label': T('The island', 'Το νησί') }, isl ? isl.svg : h('p', { class: 't3-warn' }, T('The island picture could not be loaded. The list still shows every district.', 'Η εικόνα του νησιού δεν φορτώθηκε. Η λίστα δείχνει κάθε επαρχία.')), legend),
          h('section', { class: 't3-panel', 'aria-labelledby': 'tm-dl' }, h('h2', { class: 't3-h', id: 'tm-dl' }, T('By district', 'Ανά επαρχία')), list, extra)),
        h('section', { class: 't3-panel t3-warnbox', 'aria-labelledby': 'tm-hon' }, h('h2', { class: 't3-h', id: 'tm-hon' }, T('Read this first', 'Διάβασε πρώτα αυτό')),
          h('ul', { class: 't3-list' },
            h('li', { 'data-k': 'history' }, T('This is history, not today’s water. A label sums up one whole season after it ended. It cannot tell you whether to swim today.', 'Αυτό είναι ιστορία, όχι το σημερινό νερό. Ένας χαρακτηρισμός συνοψίζει μια ολόκληρη περίοδο αφού τελειώσει. Δεν μπορεί να σου πει αν θα κολυμπήσεις σήμερα.')),
            h('li', { 'data-k': 'noscore' }, T('No score. The labels are shown exactly as they were reported; nothing is added up, averaged or ranked. "Good or Sufficient" belongs to an older scheme and stays its own label.', 'Καμία βαθμολογία. Οι χαρακτηρισμοί εμφανίζονται ακριβώς όπως αναφέρθηκαν· τίποτα δεν αθροίζεται, δεν βγαίνει μέσος όρος, δεν γίνεται κατάταξη. Το "Καλή ή Επαρκής" ανήκει σε παλιότερο σύστημα και μένει ξεχωριστός χαρακτηρισμός.')),
            h('li', null, T('The number of sites changes over the years, so two years are not the same list of beaches. A site missing in a year was not reported for that season: that is "no data", not "bad".', 'Ο αριθμός των σημείων αλλάζει με τα χρόνια, άρα δύο χρονιές δεν έχουν την ίδια λίστα παραλιών. Ένα σημείο που λείπει μια χρονιά δεν αναφέρθηκε για εκείνη την περίοδο: αυτό σημαίνει "χωρίς δεδομένα", όχι "κακό".')),
            h('li', null, T('The district of a site is our own rule on a simplified outline of the island, not an official boundary. The release has no site in some districts; those stay grey.', 'Η επαρχία ενός σημείου είναι δικός μας κανόνας πάνω σε απλοποιημένο περίγραμμα του νησιού, όχι επίσημο όριο. Η έκδοση δεν έχει σημεία σε ορισμένες επαρχίες· αυτές μένουν γκρίζες.')),
            h('li', { 'data-k': 'second' }, T('Only this yearly record is drawn. The Met Office record on this site holds readings and forecasts, not a history by year, so no second line is added.', 'Σχεδιάζεται μόνο αυτό το ετήσιο αρχείο. Το μετεωρολογικό αρχείο του ιστότοπου έχει μετρήσεις και προγνώσεις, όχι ιστορικό ανά έτος, γι’ αυτό δεν προστίθεται δεύτερη σειρά.'))),
          h('p', { class: 't3-note', 'data-k': 'source' }, T('Source: ', 'Πηγή: ') + B.meta.attribution + '. ' + T('Release ', 'Έκδοση ') + B.meta.release + (B.meta.published ? T(', published ', ', δημοσιεύτηκε ') + B.meta.published : '') + '. ' + T('Places are those of the ' + B.meta.placesFrom + ' list.', 'Οι θέσεις είναι εκείνες της λίστας του ' + B.meta.placesFrom + '.'))),
        said);
      ui = { isl, big, sum, slider, bPrev, bPlay, bNext, stripBtns, list, extra, said, still };
      setPlay();
    }

    function setPlay() {
      const u = ui; if (!u) return;
      const atEnd = year >= B.years[B.years.length - 1];
      u.bPlay.classList.toggle('on', playing);
      u.bPlay.textContent = u.still ? '▶|' : playing ? '❚❚' : '▶';
      u.bPlay.setAttribute('aria-label', u.still ? T('Step to the next year (motion is reduced on this device)', 'Πήγαινε στην επόμενη χρονιά (η κίνηση είναι μειωμένη σε αυτή τη συσκευή)') : playing ? T('Pause', 'Παύση') : atEnd ? T('Play again from the first year', 'Παίξε ξανά από την πρώτη χρονιά') : T('Play year by year', 'Παίξε χρονιά με χρονιά'));
      u.bPrev.disabled = year <= B.years[0]; u.bNext.disabled = atEnd;
    }
    function stop() { if (timer) clearInterval(timer); timer = 0; if (playing) { playing = false; setPlay(); if (ui) ui.said.textContent = ui.sum.textContent; } }
    function toggle() {
      const last = B.years[B.years.length - 1];
      if (ui.still) { go(year >= last ? B.years[0] : year + 1); return; }   // reduced motion: one step per press
      if (playing) { stop(); return; }
      if (year >= last) go(B.years[0]);
      playing = true; setPlay();
      timer = setInterval(() => { if (year >= last) { stop(); return; } go(year + 1, true); if (year >= last) stop(); }, 1100);
    }

    function go(y, quiet) {
      const u = ui;
      year = Math.max(B.years[0], Math.min(B.years[B.years.length - 1], y));
      u.slider.value = year; u.slider.setAttribute('aria-valuetext', String(year));
      u.big.textContent = String(year);
      u.stripBtns.forEach((b, k) => { b.classList.toggle('cur', k === year); if (k === year) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      const yd = yearData(year);
      if (u.isl) u.isl.layer.replaceChildren();
      const rows = [];
      DORDER.forEach((d) => {
        const st = yd ? stateOf(yd.by[d] || []) : { k: 'none' };
        const p = u.isl && u.isl.paths[d];
        let words;
        if (!yd) words = T('no season in the release for ' + year, 'καμία περίοδος στην έκδοση για το ' + year);
        else if (st.k === 'none') words = T('no site reported here in ' + year + ': no data, left grey', 'κανένα σημείο δεν αναφέρθηκε εδώ το ' + year + ': χωρίς δεδομένα, μένει γκρίζα');
        else if (st.k === 'thin') words = T('only ' + st.n + (st.n === 1 ? ' site' : ' sites') + ' reported in ' + year + ' (' + countWords(counts(yd.by[d])) + '): too few to colour the district, left grey', 'μόνο ' + st.n + (st.n === 1 ? ' σημείο' : ' σημεία') + ' το ' + year + ' (' + countWords(counts(yd.by[d])) + '): πολύ λίγα για να χρωματιστεί η επαρχία, μένει γκρίζα');
        else if (st.k === 'one') words = T('all ' + st.n + ' sites: ' + K.labelName(st.label), 'και τα ' + st.n + ' σημεία: ' + K.labelName(st.label));
        else words = T(st.n + ' sites, mixed: ' + countWords(st.cs), st.n + ' σημεία, μικτή: ' + countWords(st.cs));
        if (p) {
          p.setAttribute('class', 't3-d ' + st.k);
          p.style.fill = st.k === 'one' ? K.labelColour(st.label) : st.k === 'mixed' ? 'url(#t3-mixed)' : '';
          p.style.fillOpacity = st.k === 'one' ? '0.42' : '';
          p.querySelector('title').textContent = K.dName(d) + ': ' + words;
        }
        rows.push(h('li', { class: 't3-dl ' + st.k, 'data-d': d, 'data-state': st.k }, h('b', null, K.dName(d)), bar(st.cs || (yd && yd.by[d] && yd.by[d].length ? counts(yd.by[d]) : []), st.k === 'one' || st.k === 'mixed' || st.k === 'thin'), h('span', null, words)));
      });
      if (yd && u.isl) yd.dots.forEach(({ s, label }) => { const q = ISLAND.project(s.lng, s.lat); u.isl.layer.append(sv('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 4.2, class: 't3-site', fill: K.labelColour(label) }, sv('title', null, s.name + ', ' + year + ': ' + K.labelName(label)))); });
      if (u.isl) K.schoolMarks(u.isl.layer);
      u.list.replaceChildren(...rows);
      u.sum.textContent = yd ? T('Season ' + year + ': ' + yd.total + ' bathing sites were reported. ' + countWords(yd.all) + '.', 'Περίοδος ' + year + ': αναφέρθηκαν ' + yd.total + ' σημεία κολύμβησης. ' + countWords(yd.all) + '.') : T('Season ' + year + ' is not in the release. Nothing is shown and nothing is assumed.', 'Η περίοδος ' + year + ' δεν υπάρχει στην έκδοση. Δεν εμφανίζεται και δεν υποτίθεται τίποτα.');
      u.extra.textContent = yd && yd.noPlace.length ? T(yd.noPlace.length + (yd.noPlace.length === 1 ? ' site' : ' sites') + ' of ' + year + ' (' + countWords(counts(yd.noPlace)) + ') cannot be drawn: not in the ' + B.meta.placesFrom + ' list of places, or too far from a district outline. Counted for the island, not for a district.', yd.noPlace.length + (yd.noPlace.length === 1 ? ' σημείο' : ' σημεία') + ' του ' + year + ' (' + countWords(counts(yd.noPlace)) + ') δεν μπορούν να σχεδιαστούν: δεν είναι στη λίστα θέσεων του ' + B.meta.placesFrom + ' ή είναι πολύ μακριά από περίγραμμα επαρχίας. Μετρούν για το νησί, όχι για επαρχία.') : '';
      if (!quiet) u.said.textContent = u.sum.textContent;
      setPlay();
    }

    (async () => {
      try {
        K = await lib(); B = await K.bathing();
        if (!alive) return;
        if (!B.years.length) throw new Error(T('The file has no season in it.', 'Το αρχείο δεν έχει καμία περίοδο.'));
        build();
        const want = Number(ctx && ctx.query && (ctx.query.get ? ctx.query.get('y') : ctx.query.y));
        go(B.years.indexOf(want) >= 0 ? want : B.years[B.years.length - 1]);
      } catch (e) {
        if (!alive) return;
        host.replaceChildren(h('div', { class: e && e.unavailable ? 'empty' : 'err', role: 'alert', 'data-k': 'unavailable' }, e && e.unavailable ? e.message : T('The bathing-water history could not be loaded. ', 'Το ιστορικό των νερών κολύμβησης δεν φορτώθηκε. ') + ((e && e.message) || '')),
          h('p', { class: 't3-note' }, T('Nothing is shown instead: a missing file is never replaced by a guess.', 'Δεν εμφανίζεται τίποτα στη θέση του: ένα αρχείο που λείπει δεν αντικαθίσταται ποτέ από εικασία.')));
      }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); };
  }

  SC.register('timemachine', { title: ['Time machine', 'Μηχανή του χρόνου'], render });
})();
