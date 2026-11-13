/*
  Experiment builder: guided steps (question, guess, measurement and city, how long, how to compare) that make a one-page plan
  to print. Nothing is stored on the server: the whole plan lives in the address of the page (after the #), so the link reopens
  it. The part of an address after # is never sent to a server by the browser.
  The only free text is an optional short line "in our own words". It passes TK4.checkText (the copy of the site's privacy
  check) when it is typed and again when a link is opened; a text that fails is dropped and the page says so. It is written
  into the page as text only, and marked on the plan as not reviewed by a teacher.
  Link: #/experiment?q=windows&g=lower&v=co2&c=larnaka&d=lesson&m=before&n=...
*/
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const kit = () => (window.TK4 ? Promise.resolve(window.TK4) : (window.__tk4p = window.__tk4p || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk4-kit.js?v=1';
    s.onload = () => res(window.TK4); s.onerror = () => { window.__tk4p = null; s.remove(); rej(new Error('kit')); }; document.head.append(s);
  })));
  const NOTE_MAX = 120;
  // id, question (en, el), the measurement and the way of comparing that fit it
  const QUESTIONS = [
    ['midday', 'Is it warmer in our city at midday than in the morning, and by how much?', 'Είναι πιο ζεστά στην πόλη μας το μεσημέρι από ό,τι το πρωί, και πόσο;', 'temperature', 'times'],
    ['windows', 'Does the CO₂ in a closed space go down after the windows are opened?', 'Πέφτει το CO₂ σε έναν κλειστό χώρο αφού ανοίξουν τα παράθυρα;', 'co2', 'before'],
    ['windy', 'Is there less dust in the air on windy hours than on calm hours?', 'Υπάρχει λιγότερη σκόνη στον αέρα τις ώρες με άνεμο από ό,τι τις ήρεμες ώρες;', 'dust', 'times'],
    ['station', 'How close is a low-cost sensor to the official station for the same measurement?', 'Πόσο κοντά είναι ένας αισθητήρας χαμηλού κόστους στον επίσημο σταθμό για την ίδια μέτρηση;', 'temperature', 'station'],
    ['sea', 'Is the air more humid in a city by the sea than in an inland city?', 'Είναι ο αέρας πιο υγρός σε μια πόλη δίπλα στη θάλασσα από ό,τι σε μια πόλη της ενδοχώρας;', 'relative_humidity', 'cities'],
    ['own', 'Our own question (write it below)', 'Η δική μας ερώτηση (γράψε την πιο κάτω)', null, null],
  ];
  const GUESS = [['higher', 'We think it will be higher', 'Πιστεύουμε ότι θα είναι υψηλότερο'], ['lower', 'We think it will be lower', 'Πιστεύουμε ότι θα είναι χαμηλότερο'], ['same', 'We think it will be about the same', 'Πιστεύουμε ότι θα είναι περίπου ίδιο'], ['unsure', 'We are not sure yet', 'Δεν είμαστε ακόμη σίγουροι']];
  const LONG = [['lesson', 'One lesson (45 minutes)', 'Ένα μάθημα (45 λεπτά)'], ['day', 'One school day', 'Μία σχολική μέρα'], ['week', 'One week', 'Μία εβδομάδα'], ['weeks2', 'Two weeks', 'Δύο εβδομάδες']];
  const HOW = [
    ['before', 'Before and after one change', 'Πριν και μετά από μία αλλαγή', 'Something else may have changed at the same moment (the weather, how many people are in the room). Change only one thing, and repeat it on another day.', 'Κάτι άλλο μπορεί να άλλαξε την ίδια στιγμή (ο καιρός, πόσα άτομα είναι στον χώρο). Άλλαξε μόνο ένα πράγμα και επανάλαβέ το άλλη μέρα.'],
    ['times', 'Two times of the day', 'Δύο ώρες της μέρας', 'One day is a very small sample: tomorrow may be different. Use the same two times on several days.', 'Μία μέρα είναι πολύ μικρό δείγμα: αύριο μπορεί να είναι αλλιώς. Χρησιμοποίησε τις ίδιες δύο ώρες σε αρκετές μέρες.'],
    ['cities', 'Two cities, same kind of source', 'Δύο πόλεις, ίδιο είδος πηγής', 'Two different sensors differ a little even in the same air. Compare only the same kind of source, and expect a gap smaller than their usual disagreement to mean nothing.', 'Δύο διαφορετικοί αισθητήρες διαφέρουν λίγο ακόμη και στον ίδιο αέρα. Σύγκρινε μόνο το ίδιο είδος πηγής, και μια διαφορά μικρότερη από τη συνηθισμένη τους διαφωνία δεν σημαίνει τίποτα.'],
    ['station', 'Our sensor against the official station', 'Ο αισθητήρας μας απέναντι στον επίσημο σταθμό', 'The station is not in the same spot as our sensor, so some difference is normal. A sensor indoors or inside a vehicle must not be compared with outdoor air.', 'Ο σταθμός δεν είναι στο ίδιο σημείο με τον αισθητήρα μας, άρα κάποια διαφορά είναι φυσιολογική. Αισθητήρας μέσα σε κτίριο ή όχημα δεν συγκρίνεται με τον αέρα έξω.'],
  ];
  const find = (list, id) => list.find((x) => x[0] === id) || null;
  const word = (row) => (row ? t(row[1], row[2]) : '');

  SC.register('experiment', {
    title: ['Experiment builder', 'Σχεδίασε ένα πείραμα'],
    render(root, ctx) {
      SC.css('/site/pages/tk4.css');
      const head = SC.head({
        title: t('Experiment builder', 'Σχεδίασε ένα πείραμα'),
        lede: t('Five short steps turn a question into a one-page plan you can print. A good plan says what you expect before you look at the numbers.',
          'Πέντε σύντομα βήματα κάνουν μια ερώτηση σχέδιο μίας σελίδας που εκτυπώνεται. Ένα καλό σχέδιο λέει τι περιμένεις πριν δεις τους αριθμούς.'),
        help: ['Step 1: choose a question. Step 2: say what you expect, before you measure. Step 3: choose the measurement and the city. Step 4: choose how long you will measure. Step 5: choose how you will compare. The plan on the page updates as you go. Print it, or copy the link: the link holds the whole plan, and nothing is saved on the site. Do not write names or exact places in the optional line.',
          'Βήμα 1: διάλεξε μια ερώτηση. Βήμα 2: πες τι περιμένεις, πριν μετρήσεις. Βήμα 3: διάλεξε τη μέτρηση και την πόλη. Βήμα 4: διάλεξε για πόσο θα μετράς. Βήμα 5: διάλεξε πώς θα συγκρίνεις. Το σχέδιο στη σελίδα αλλάζει όσο προχωράς. Εκτύπωσέ το ή αντίγραψε τον σύνδεσμο: ο σύνδεσμος κρατά όλο το σχέδιο και τίποτα δεν αποθηκεύεται στον ιστότοπο. Μη γράφεις ονόματα ή ακριβή σημεία στην προαιρετική γραμμή.'],
        tags: [{ text: t('Nothing is saved', 'Δεν αποθηκεύεται τίποτα'), cls: 'arch' }],
      });
      root.append(head);
      const host = el('div', { class: 'k4 k4-exp' }, el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      root.append(host);
      let alive = true, K = null, dropped = false;
      const q = ctx.query || new URLSearchParams('');
      const S = { q: '', g: '', v: '', c: '', d: '', m: '', n: '' };

      function fromLink() {
        S.q = find(QUESTIONS, q.get('q')) ? q.get('q') : '';
        S.g = find(GUESS, q.get('g')) ? q.get('g') : '';
        S.v = K.VARS[q.get('v')] ? q.get('v') : '';
        S.c = K.CITY_IDS.includes(q.get('c')) ? q.get('c') : '';
        S.d = find(LONG, q.get('d')) ? q.get('d') : '';
        S.m = find(HOW, q.get('m')) ? q.get('m') : '';
        const raw = q.get('n') || '';
        if (raw) { const r = K.checkText(raw, NOTE_MAX); if (r.ok) S.n = r.text; else dropped = true; }   // a link is checked like typed text
      }
      function link() {
        const p = new URLSearchParams();
        ['q', 'g', 'v', 'c', 'd', 'm', 'n'].forEach((k) => { if (S[k]) p.set(k, S[k]); });
        const s = p.toString();
        return location.origin + location.pathname + location.search + '#/experiment' + (s ? '?' + s : '');
      }
      const done = () => Boolean(S.q && S.g && S.v && S.c && S.d && S.m && (S.q !== 'own' || S.n));

      let planEl, linkIn;
      function drawPlan() {
        const Qr = find(QUESTIONS, S.q), how = find(HOW, S.m);
        const blank = () => el('span', { class: 'k4-fine' }, t('not chosen yet', 'δεν έχει επιλεγεί ακόμη'));
        const qText = !Qr ? null : S.q === 'own' ? (S.n || null) : word(Qr);
        const item = (label, value) => [el('dt', null, label), el('dd', null, value || blank())];
        try { history.replaceState(null, '', link()); } catch (e) { /* the plan still works, only the address stays as it was */ }
        if (linkIn) linkIn.value = link();
        const sameV = S.v && S.c ? '?v=' + encodeURIComponent(S.v) + '&c=' + encodeURIComponent(S.c) + '&a=' + encodeURIComponent(S.c) : '';
        planEl.replaceChildren(...[
          el('p', { class: 'k4-eye' }, t('Experiment plan', 'Σχέδιο πειράματος') + ' · ' + SC.date(Date.now())),
          el('h2', null, qText || t('Your question will appear here', 'Η ερώτησή σου θα εμφανιστεί εδώ')),
          S.q && S.q !== 'own' && S.n ? el('p', { class: 'k4-stu' }, t('In our own words: ', 'Με δικά μας λόγια: '), S.n) : null,
          S.n ? el('p', { class: 'k4-fine' }, t('The line in the team’s own words was written by students and has not been reviewed by a teacher.', 'Τη γραμμή με τα λόγια της ομάδας την έγραψαν μαθητές και δεν την έχει ελέγξει εκπαιδευτικός.')) : null,
          el('dl', null,
            item(t('Our guess, before measuring', 'Η πρόβλεψή μας, πριν μετρήσουμε'), word(find(GUESS, S.g))),
            item(t('What we measure', 'Τι μετράμε'), S.v ? K.varName(S.v) + ' (' + K.varUnit(S.v) + ')' : null),
            item(t('Where (city only)', 'Πού (μόνο η πόλη)'), S.c ? K.cityName(S.c) : null),
            item(t('For how long', 'Για πόσο'), word(find(LONG, S.d))),
            item(t('How we compare', 'Πώς συγκρίνουμε'), how ? t(how[1], how[2]) : null),
            item(t('How the result could be wrong', 'Πώς θα μπορούσε να είναι λάθος το αποτέλεσμα'), how ? t(how[3], how[4]) : null),
            item(t('What we will write down each time', 'Τι θα γράφουμε κάθε φορά'), t('The number, its unit, the time, and the layer or sensor it came from.', 'Τον αριθμό, τη μονάδα του, την ώρα, και το στρώμα ή τον αισθητήρα από όπου ήρθε.'))),
          el('p', { class: 'k4-eye' }, t('What we found (fill in by hand)', 'Τι βρήκαμε (συμπληρώνεται με το χέρι)')),
          el('div', { class: 'k4-lines', 'aria-hidden': 'true' }),
          el('p', { class: 'k4-fine' }, t('Remember: if two things change together, that does not show that one causes the other. Say what you saw, and what else could explain it.', 'Θυμήσου: αν δύο πράγματα αλλάζουν μαζί, αυτό δεν δείχνει ότι το ένα προκαλεί το άλλο. Πες τι είδες και τι άλλο θα μπορούσε να το εξηγεί.')),
          el('div', { class: 'k4-links k4-noprint' },
            done() ? null : el('span', { class: 'k4-fine' }, t('Finish every step to complete the plan.', 'Ολοκλήρωσε όλα τα βήματα για να συμπληρωθεί το σχέδιο.')),
            S.m === 'before' ? K.toolLink('beforeafter', sameV, t('Open “Before and after” with these settings', 'Άνοιξε το «Πριν και μετά» με αυτές τις ρυθμίσεις')) : null,
            S.v && S.c ? K.toolLink('claims', sameV, t('Check a claim about this measurement', 'Έλεγξε έναν ισχυρισμό για αυτή τη μέτρηση')) : null,
            K.toolLink('methods', '', t('Methods library', 'Βιβλιοθήκη μεθόδων'))),
        ].filter(Boolean));
      }

      function draw() {
        const step = (title, ...body) => el('section', { class: 'k4-panel k4-step' }, el('h3', null, title), body);
        const noteF = K.noteField({ max: NOTE_MAX, value: S.n, label: t('In our own words (optional, needed for “our own question”)', 'Με δικά μας λόγια (προαιρετικό, χρειάζεται για «τη δική μας ερώτηση»)'),
          hint: t('Optional. It goes into the link and onto the printed plan, and nowhere else. No names, links, phone numbers or exact places.', 'Προαιρετικό. Μπαίνει στον σύνδεσμο και στο εκτυπωμένο σχέδιο, και πουθενά αλλού. Χωρίς ονόματα, συνδέσμους, τηλέφωνα ή ακριβή σημεία.'),
          onChange: (r) => { const nv = r.ok ? r.text : ''; if (nv !== S.n) { S.n = nv; if (planEl) drawPlan(); } } });
        const vSel = K.select({ label: t('Measurement', 'Μέτρηση'), opts: [['', t('Choose a measurement', 'Διάλεξε μέτρηση')]].concat(Object.keys(K.VARS).map((v) => [v, K.varName(v) + ' (' + K.varUnit(v) + ')'])), value: S.v, onPick: (v) => { S.v = v; drawPlan(); } });
        const cSel = K.select({ label: t('City', 'Πόλη'), opts: [['', t('Choose a city', 'Διάλεξε πόλη')]].concat(K.CITY_IDS.map((c) => [c, K.cityName(c)])), value: S.c, onPick: (v) => { S.c = v; drawPlan(); } });
        const mC = K.choice({ label: t('How you will compare', 'Πώς θα συγκρίνεις'), value: S.m || null, opts: HOW.map((h) => [h[0], t(h[1], h[2])]), onPick: (v) => { S.m = v; drawPlan(); } });
        const qC = K.choice({ cls: 'k4-col', label: t('Question', 'Ερώτηση'), value: S.q || null, opts: QUESTIONS.map((x) => [x[0], t(x[1], x[2])]),
          onPick: (v) => { S.q = v; const r = find(QUESTIONS, v); if (r && r[3] && !S.v) { S.v = r[3]; vSel.value = r[3]; } if (r && r[4] && !S.m) { S.m = r[4]; mC.set(r[4]); } drawPlan(); } });
        const gC = K.choice({ label: t('Your guess', 'Η πρόβλεψή σου'), value: S.g || null, opts: GUESS.map((g) => [g[0], t(g[1], g[2])]), onPick: (v) => { S.g = v; drawPlan(); } });
        const dC = K.choice({ label: t('How long', 'Για πόσο'), value: S.d || null, opts: LONG.map((d) => [d[0], t(d[1], d[2])]), onPick: (v) => { S.d = v; drawPlan(); } });
        planEl = el('article', { class: 'k4-plan', 'aria-label': t('The plan', 'Το σχέδιο'), 'aria-live': 'polite' });
        linkIn = el('input', { class: 'nm-input', type: 'text', readonly: true, id: 'k4-exp-link', 'aria-label': t('Link that reopens this plan', 'Σύνδεσμος που ανοίγει ξανά αυτό το σχέδιο') });
        linkIn.addEventListener('focus', () => linkIn.select());
        const copy = el('button', { class: 'nm-btn', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(linkIn.value); SC.toast(t('Link copied', 'Ο σύνδεσμος αντιγράφηκε')); } catch (e) { linkIn.focus(); linkIn.select(); SC.toast(t('Select the link and copy it', 'Επίλεξε τον σύνδεσμο και αντίγραψέ τον')); } } }, t('Copy the link', 'Αντίγραψε τον σύνδεσμο'));
        const reset = el('button', { class: 'nm-btn nm-btn--ghost', type: 'button', onclick: () => { Object.keys(S).forEach((k) => { S[k] = ''; }); dropped = false; draw(); } }, t('Start again', 'Ξεκίνα ξανά'));
        host.replaceChildren(...[
          dropped ? el('div', { class: 'err k4-noprint', role: 'alert' }, t('This link held a line of text that did not pass the privacy check, so it was left out.', 'Αυτός ο σύνδεσμος είχε μια γραμμή κειμένου που δεν πέρασε τον έλεγχο ιδιωτικότητας, γι’ αυτό έμεινε εκτός.')) : null,
          el('div', { class: 'k4-two' },
            el('div', { class: 'k4-steps k4-noprint' },
              step(t('Your question', 'Η ερώτησή σου'), qC.node, noteF.node),
              step(t('Your guess, before you measure', 'Η πρόβλεψή σου, πριν μετρήσεις'), gC.node, el('p', { class: 'k4-fine' }, t('Writing the guess first keeps you honest: you cannot change it after you see the numbers.', 'Αν γράψεις πρώτα την πρόβλεψη, μένεις ειλικρινής: δεν μπορείς να την αλλάξεις αφού δεις τους αριθμούς.'))),
              step(t('What you measure, and in which city', 'Τι μετράς, και σε ποια πόλη'), el('div', { class: 'k4-grid2' }, vSel, cSel), el('p', { class: 'k4-fine' }, t('Only the city is written down, never an exact place.', 'Καταγράφεται μόνο η πόλη, ποτέ ακριβές σημείο.'))),
              step(t('For how long', 'Για πόσο'), dC.node, el('p', { class: 'k4-fine' }, t('Longer usually means more readings, and more readings make a stronger answer.', 'Περισσότερος χρόνος σημαίνει συνήθως περισσότερες μετρήσεις, και περισσότερες μετρήσεις δίνουν πιο δυνατή απάντηση.'))),
              step(t('How you will compare', 'Πώς θα συγκρίνεις'), mC.node)),
            el('div', { class: 'k4-out' }, planEl,
              el('div', { class: 'k4-panel k4-linkbox k4-noprint' }, el('label', { class: 'k4-lab', for: 'k4-exp-link' }, t('Link that reopens this plan', 'Σύνδεσμος που ανοίγει ξανά αυτό το σχέδιο')), linkIn,
                el('p', { class: 'k4-fine' }, t('The plan is kept inside this link and nowhere else. Anyone who has the link can read the plan, so share it only with your team and your teacher.', 'Το σχέδιο βρίσκεται μέσα σε αυτόν τον σύνδεσμο και πουθενά αλλού. Όποιος έχει τον σύνδεσμο μπορεί να διαβάσει το σχέδιο, γι’ αυτό μοιράσου τον μόνο με την ομάδα και τον εκπαιδευτικό σου.')),
                el('div', { class: 'k4-links' }, K.printBtn(t('Print the plan', 'Εκτύπωσε το σχέδιο')), copy, reset)))),
        ].filter(Boolean));
        drawPlan();
      }
      async function load() {
        try { K = await kit(); } catch (e) { host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('This page could not be loaded. Reload and try again.', 'Η σελίδα δεν φορτώθηκε. Κάνε ανανέωση και δοκίμασε ξανά.'))); return; }
        if (!alive) return;
        fromLink(); draw();
      }
      document.body.classList.add('k4-on');
      load();
      return () => { alive = false; document.body.classList.remove('k4-on'); };
    },
  });
})();
