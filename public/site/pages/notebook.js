/*
  Field notebook: a student logs what they observe at this moment with choices only (sky, wind felt, windows, smell or dust seen)
  and an optional short note. Each entry is shown next to what the layers read for that city at that moment.

  Where the entries live: ONLY in this browser (localStorage key sc.tk4.notebook.v1). Nothing a student picks or types here is
  sent to the server. The site's submission flow (plans and tools that a teacher reviews) was not reused, because it stores team
  plans with their own limits and would list every observation as a project; so this page keeps the honest smaller version:
  private to the device, with a clear note saying so. The note passes TK4.checkText (the copy of the site's privacy check) before
  it is stored and again before it is shown, and is only ever written into the page as text.
  No names, no photos, no place beyond the city of the school.
  Data: GET /layers/api/live at the moment of saving (the city's fresh rows are copied into the entry, with their layer and age).
*/
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const kit = () => (window.TK4 ? Promise.resolve(window.TK4) : (window.__tk4p = window.__tk4p || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk4-kit.js?v=1';
    s.onload = () => res(window.TK4); s.onerror = () => { window.__tk4p = null; s.remove(); rej(new Error('kit')); }; document.head.append(s);
  })));
  const KEY = 'sc.tk4.notebook.v1', CITY_KEY = 'sc.tk4.city', MAX = 60, NOTE_MAX = 100;
  const Q = [
    { id: 'sky', q: ['The sky looks', 'Ο ουρανός φαίνεται'], opts: [['clear', 'clear', 'καθαρός'], ['hazy', 'hazy', 'θολός'], ['dusty', 'dusty', 'με σκόνη'], ['cloudy', 'cloudy', 'συννεφιασμένος']] },
    { id: 'wind', q: ['The wind feels', 'Ο άνεμος μοιάζει'], opts: [['calm', 'calm', 'ήρεμος'], ['breeze', 'a breeze', 'αεράκι'], ['strong', 'strong', 'δυνατός']] },
    { id: 'win', q: ['The windows are', 'Τα παράθυρα είναι'], opts: [['open', 'open', 'ανοιχτά'], ['closed', 'closed', 'κλειστά']] },
    { id: 'dust', q: ['A smell or dust you can notice', 'Μυρωδιά ή σκόνη που προσέχεις'], opts: [['yes', 'yes', 'ναι'], ['no', 'no', 'όχι']] },
  ];
  const optWord = (q, v) => { const o = q.opts.find((x) => x[0] === v); return o ? t(o[1], o[2]) : ''; };

  SC.register('notebook', {
    title: ['Field notebook', 'Τετράδιο πεδίου'],
    render(root) {
      SC.css('/site/pages/tk4.css');
      const head = SC.head({
        title: t('Field notebook', 'Τετράδιο πεδίου'),
        lede: t('Write down what you see and feel right now, then look at what the sensors read at the same moment. Do your eyes and the numbers tell the same story?',
          'Σημείωσε τι βλέπεις και τι νιώθεις τώρα, και μετά δες τι έδειχναν οι αισθητήρες την ίδια στιγμή. Λένε τα μάτια σου και οι αριθμοί την ίδια ιστορία;'),
        help: ['Pick your school’s city, then tap one answer for the sky, the wind, the windows, and whether you notice a smell or dust. You may add a very short note. Press Save. The page copies the readings the layers have for that city at that moment and shows them beside your entry. Everything stays in this browser on this device: nothing is sent to the site, and nobody else sees it unless you show them the screen or print it. Do not write names or exact places.',
          'Διάλεξε την πόλη του σχολείου σου και μετά πάτησε μία απάντηση για τον ουρανό, τον άνεμο, τα παράθυρα και για το αν προσέχεις μυρωδιά ή σκόνη. Μπορείς να προσθέσεις μια πολύ σύντομη σημείωση. Πάτα Αποθήκευση. Η σελίδα αντιγράφει τις μετρήσεις που έχουν τα στρώματα για την πόλη εκείνη τη στιγμή και τις δείχνει δίπλα στην καταγραφή σου. Όλα μένουν σε αυτό το πρόγραμμα περιήγησης, σε αυτή τη συσκευή: τίποτα δεν στέλνεται στον ιστότοπο και κανείς άλλος δεν τα βλέπει, εκτός αν δείξεις την οθόνη ή τα εκτυπώσεις. Μη γράφεις ονόματα ή ακριβή σημεία.'],
        tags: [{ text: t('Stays on this device', 'Μένει σε αυτή τη συσκευή'), cls: 'arch' }],
      });
      root.append(head);
      const host = el('div', { class: 'k4 k4-nb' }, el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      root.append(host);
      let alive = true, K = null, memory = null, canStore = true;
      const S = { city: SC.store.get(CITY_KEY) || '', sky: null, wind: null, win: null, dust: null };

      /* ----- storage: this browser only ----- */
      function read() {
        if (memory) return memory;
        let a = [];
        try { a = JSON.parse(SC.store.get(KEY) || '[]'); } catch (e) { a = []; }
        return (Array.isArray(a) ? a : []).filter((e) => e && typeof e === 'object' && isFinite(e.at) && K.CITY_IDS.includes(e.city)).slice(0, MAX);
      }
      function write(list) {
        const s = JSON.stringify(list.slice(0, MAX));
        SC.store.set(KEY, s);
        canStore = SC.store.get(KEY) === s;
        memory = canStore ? null : list.slice(0, MAX);   // private mode: keep them while the page is open, and say so
      }

      /* ----- one entry ----- */
      function snapshot(live, city) {
        const c = live && live.cities && live.cities[city];
        if (!c) return { at: (live && live.at) || Date.now(), rows: [] };
        const names = {};
        (live.layers || []).forEach((l) => { names[l.id] = [l.name, l.nameEl || l.name]; });
        const rows = (c.rows || []).filter((r) => K.VARS[r.variable] && !r.stale && r.value != null && isFinite(r.value))
          .map((r) => ({ v: r.variable, x: Number(r.value), u: String(r.unit || '').slice(0, 12), s: names[r.source] || [r.source, r.source], k: r.kind, e: r.env || 'outdoor', a: Number(r.ageMin) || 0, n: r.n || null }));
        return { at: live.at || Date.now(), rows };
      }
      function readings(e) {
        if (!e.live) return el('p', { class: 'k4-none' }, t('The sensor readings could not be read at that moment, so this entry has only what you saw.', 'Οι μετρήσεις των αισθητήρων δεν διαβάστηκαν εκείνη τη στιγμή, άρα αυτή η καταγραφή έχει μόνο ό,τι είδες.'));
        const rows = (Array.isArray(e.live.rows) ? e.live.rows : []).filter((r) => r && K.VARS[r.v] && isFinite(r.x));
        if (!rows.length) return el('p', { class: 'k4-none' }, t('No layer had a fresh reading for this city at that moment.', 'Κανένα στρώμα δεν είχε φρέσκια μέτρηση για αυτή την πόλη εκείνη τη στιγμή.'));
        const order = Object.keys(K.VARS);
        rows.sort((a, b) => order.indexOf(a.v) - order.indexOf(b.v));
        return el('table', { class: 'k4-tbl' }, el('tbody', null, rows.map((r) => el('tr', null,
          el('th', { scope: 'row' }, K.varName(r.v)),
          el('td', null, el('b', null, K.val(r.x, r.u)),
            el('small', null, t('at ', 'στις ') + SC.time(e.live.at - r.a * 60000) + ' · ' + t('layer: ', 'στρώμα: ') + String((Array.isArray(r.s) ? r.s[SC.lang === 'el' ? 1 : 0] : r.s) || '').slice(0, 60) + ' (' + K.kindWord(r.k) + ', ' + K.envWord(r.e) + ')'))))));
      }
      function entryCard(e) {
        const note = e.note ? K.checkText(e.note, NOTE_MAX) : { ok: true, text: '' };   // checked again before it is shown
        return el('article', { class: 'k4-entry' },
          el('header', null, el('b', null, K.cityName(e.city)), el('span', null, SC.dateTime(e.at)),
            el('button', { type: 'button', class: 'k4-noprint', 'aria-label': t('Delete the entry of ', 'Διαγραφή της καταγραφής: ') + SC.dateTime(e.at), onclick: () => { write(read().filter((x) => x.id !== e.id)); drawList(); } }, t('Delete', 'Διαγραφή'))),
          el('div', null, el('p', { class: 'k4-tblcap' }, t('What we saw', 'Τι είδαμε')),
            el('div', { class: 'k4-saw' }, Q.filter((q) => e[q.id]).map((q) => el('span', null, t(q.q[0], q.q[1]) + ': ' + optWord(q, e[q.id]))),
              note.ok && note.text ? el('p', null, el('b', null, t('Note: ', 'Σημείωση: ')), note.text) : null,
              e.note && !note.ok ? el('p', { class: 'k4-fine' }, t('A note was hidden because it did not pass the privacy check.', 'Μια σημείωση κρύφτηκε γιατί δεν πέρασε τον έλεγχο ιδιωτικότητας.')) : null)),
          el('div', null, el('p', { class: 'k4-tblcap' }, t('What the layers read at that moment', 'Τι έδειχναν τα στρώματα εκείνη τη στιγμή')), readings(e)));
      }

      /* ----- the page ----- */
      let listEl, form;
      function drawList() {
        const list = read();
        listEl.replaceChildren(...[
          el('div', { class: 'k4-top' }, el('h2', { class: 'k4-h' }, t('Your entries', 'Οι καταγραφές σου') + ' (' + list.length + ')'),
            list.length ? el('span', { class: 'k4-links k4-noprint' }, K.printBtn(t('Print the notebook', 'Εκτύπωσε το τετράδιο')),
              el('button', { class: 'nm-btn nm-btn--danger-outline', type: 'button', onclick: () => SC.modal({ title: t('Delete every entry?', 'Διαγραφή όλων των καταγραφών;'), body: el('p', null, t('This removes all ' + list.length + ' entries from this browser. It cannot be undone.', 'Αυτό αφαιρεί και τις ' + list.length + ' καταγραφές από αυτό το πρόγραμμα περιήγησης. Δεν αναιρείται.')),
                actions: [{ label: t('Keep them', 'Κράτησέ τες') }, { label: t('Delete all', 'Διαγραφή όλων'), primary: true, run: () => { write([]); drawList(); } }] }) }, t('Delete all', 'Διαγραφή όλων'))) : null),
          !canStore ? el('div', { class: 'err', role: 'alert' }, t('This browser does not let the page save (private mode?). Your entries stay only while this page is open.', 'Αυτό το πρόγραμμα περιήγησης δεν αφήνει τη σελίδα να αποθηκεύσει (ιδιωτική λειτουργία;). Οι καταγραφές σου μένουν μόνο όσο η σελίδα είναι ανοιχτή.')) : null,
          list.length ? el('div', { class: 'k4-entries' }, list.map(entryCard))
            : el('div', { class: 'empty' }, t('No entries yet. Make your first observation above. Nothing here is invented: an empty notebook stays empty.', 'Καμία καταγραφή ακόμη. Κάνε την πρώτη σου παρατήρηση πιο πάνω. Τίποτα εδώ δεν είναι φτιαχτό: ένα άδειο τετράδιο μένει άδειο.')),
          list.length ? el('div', { class: 'k4-panel k4-honest' }, el('b', null, t('How to read your notebook honestly', 'Πώς να διαβάσεις το τετράδιό σου με ειλικρίνεια')),
            el('ul', null,
              el('li', null, t('Your eyes and a sensor measure different things. When they do not match, that is a finding to write down, not a mistake to hide.', 'Τα μάτια σου και ένας αισθητήρας μετρούν διαφορετικά πράγματα. Όταν δεν ταιριάζουν, είναι ένα εύρημα που το γράφεις, όχι λάθος που το κρύβεις.')),
              el('li', null, t('The numbers are for the whole city, and some are model estimates or come from inside vehicles. They are not the air exactly where you stand.', 'Οι αριθμοί είναι για όλη την πόλη, και κάποιοι είναι εκτιμήσεις μοντέλου ή προέρχονται από το εσωτερικό οχημάτων. Δεν είναι ο αέρας ακριβώς εκεί που στέκεσαι.')),
              el('li', null, t('One entry proves nothing. Look for a pattern over many entries, and even then a pattern is not a cause.', 'Μία καταγραφή δεν αποδεικνύει τίποτα. Ψάξε για μοτίβο σε πολλές καταγραφές, και ακόμη και τότε ένα μοτίβο δεν είναι αιτία.'))),
            el('div', { class: 'k4-links k4-noprint' }, K.toolLink('claims'), K.toolLink('methods', '/sample-size', t('How many entries are enough?', 'Πόσες καταγραφές αρκούν;')))) : null,
        ].filter(Boolean));
      }
      function drawForm() {
        const status = el('p', { class: 'k4-fine', 'aria-live': 'polite' });
        const citySel = K.select({ id: 'k4-nb-city', label: t('City of your school', 'Η πόλη του σχολείου σου'), opts: [['', t('Choose a city', 'Διάλεξε πόλη')]].concat(K.CITY_IDS.map((c) => [c, K.cityName(c)])), value: K.CITY_IDS.includes(S.city) ? S.city : '', onPick: (v) => { S.city = v; SC.store.set(CITY_KEY, v); } });
        const groups = Q.map((q) => { const c = K.choice({ label: t(q.q[0], q.q[1]), value: S[q.id], opts: q.opts.map((o) => [o[0], t(o[1], o[2])]), onPick: (v) => { S[q.id] = v; } }); return { q, c }; });
        const noteF = K.noteField({ max: NOTE_MAX, label: t('A short note (optional)', 'Μια σύντομη σημείωση (προαιρετικά)'), placeholder: t('For example: the hills look blurry today', 'Για παράδειγμα: οι λόφοι φαίνονται θολοί σήμερα'),
          hint: t('Optional. Stays on this device. No names, no links, no phone numbers, no exact places.', 'Προαιρετικό. Μένει σε αυτή τη συσκευή. Χωρίς ονόματα, συνδέσμους, τηλέφωνα ή ακριβή σημεία.') });
        const save = el('button', { class: 'nm-btn nm-btn--primary', type: 'button' }, t('Save this observation', 'Αποθήκευσε την παρατήρηση'));
        save.addEventListener('click', async () => {
          const miss = Q.filter((q) => !S[q.id]);
          if (!K.CITY_IDS.includes(S.city)) { status.textContent = t('Choose the city of your school first.', 'Διάλεξε πρώτα την πόλη του σχολείου σου.'); citySel.focus(); return; }
          if (miss.length) { status.textContent = t('Answer every question first. Missing: ', 'Απάντησε πρώτα σε όλες τις ερωτήσεις. Λείπει: ') + miss.map((q) => t(q.q[0], q.q[1])).join(', ') + '.'; return; }
          const note = noteF.state();
          if (!note.ok) { status.textContent = t('Fix the note first, or clear it. ', 'Διόρθωσε πρώτα τη σημείωση ή σβήσε την. ') + note.why; noteF.input.focus(); return; }
          if (read().length >= MAX) { status.textContent = t('The notebook is full (' + MAX + ' entries). Print it, then delete old entries.', 'Το τετράδιο γέμισε (' + MAX + ' καταγραφές). Εκτύπωσέ το και μετά σβήσε παλιές καταγραφές.'); return; }
          save.disabled = true; status.textContent = t('Reading the sensors for this moment', 'Διαβάζω τους αισθητήρες για αυτή τη στιγμή');
          let live = null;
          try { live = snapshot(await SC.api('/layers/api/live'), S.city); } catch (e) { live = null; }
          if (!alive) return;
          const now = Date.now();
          const entry = { id: now.toString(36) + Math.floor(Math.random() * 1e6).toString(36), at: now, city: S.city, sky: S.sky, wind: S.wind, win: S.win, dust: S.dust, note: note.text, live };
          write([entry].concat(read()));
          Q.forEach((q) => { S[q.id] = null; }); groups.forEach((g) => g.c.set(null)); noteF.set('');
          save.disabled = false;
          status.textContent = live ? t('Saved in this browser, with the readings of ' + SC.time(now) + '.', 'Αποθηκεύτηκε σε αυτό το πρόγραμμα περιήγησης, με τις μετρήσεις των ' + SC.time(now) + '.') : t('Saved, but the sensor readings could not be read just now.', 'Αποθηκεύτηκε, αλλά οι μετρήσεις των αισθητήρων δεν διαβάστηκαν αυτή τη στιγμή.');
          drawList();
        });
        form = el('section', { class: 'k4-panel k4-nb-form k4-noprint', 'aria-labelledby': 'k4-nb-h' },
          el('h2', { id: 'k4-nb-h' }, t('What do you observe right now?', 'Τι παρατηρείς αυτή τη στιγμή;')),
          el('div', { class: 'k4-q' }, el('label', { for: 'k4-nb-city', class: 'k4-lab' }, t('City of your school (the only place that is written down)', 'Η πόλη του σχολείου σου (το μόνο μέρος που καταγράφεται)')), citySel),
          el('div', { class: 'k4-grid2' }, groups.map((g) => el('div', { class: 'k4-q' }, el('span', null, t(g.q.q[0], g.q.q[1])), g.c.node))),
          noteF.node,
          el('div', { class: 'k4-act' }, save, status));
        return form;
      }
      async function load() {
        try { K = await kit(); } catch (e) { host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('This page could not be loaded. Reload and try again.', 'Η σελίδα δεν φορτώθηκε. Κάνε ανανέωση και δοκίμασε ξανά.'))); return; }
        if (!alive) return;
        K.demoTag(head);
        listEl = el('section', { class: 'k4-out', 'aria-label': t('Your entries', 'Οι καταγραφές σου') });
        host.replaceChildren(
          el('div', { class: 'k4-panel k4-private' }, el('span', { class: 'k4-lock', 'aria-hidden': 'true' }, '⌂'),
            el('p', null, el('b', null, t('This notebook is private to this device. ', 'Αυτό το τετράδιο είναι ιδιωτικό σε αυτή τη συσκευή. ')),
              t('Your entries are kept only in this browser. They are not sent to the site, not seen by a teacher or anyone else, and not published. If you clear the browser’s data or use another device, they are gone. To hand them in, print the notebook. No names, no photos, and no place more exact than the city.',
                'Οι καταγραφές σου μένουν μόνο σε αυτό το πρόγραμμα περιήγησης. Δεν στέλνονται στον ιστότοπο, δεν τις βλέπει εκπαιδευτικός ή άλλος, και δεν δημοσιεύονται. Αν σβήσεις τα δεδομένα του προγράμματος ή αλλάξεις συσκευή, χάνονται. Για να τις παραδώσεις, εκτύπωσε το τετράδιο. Χωρίς ονόματα, χωρίς φωτογραφίες, και κανένα μέρος πιο ακριβές από την πόλη.'))),
          drawForm(), listEl);
        drawList();
      }
      document.body.classList.add('k4-on');
      load();
      return () => { alive = false; document.body.classList.remove('k4-on'); };
    },
  });
})();
