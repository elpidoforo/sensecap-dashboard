/*
  Feed list: the five outside sources this site reads (SenseCAP, Met Office, Open-Meteo, Sensor.Community, airport METAR):
  last success, working or not, 24 h success and failure counts, what each one feeds, and a link to the source.
  Signed-in teachers can switch a source on or off (POST /api/feeds/<id> {enabled}); everyone else sees the state only.
  Route: #/feeds.   Data: GET /api/feeds { feeds:[{ id, name, what, home, enabled, lastOk, lastError:{at,message}|null, ok24h, fail24h, everyMin }] }.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/feeds.css');

  const MIN = 60000;
  const warnId = () => 'warnings';
  const isTeacher = () => Boolean(SC.me && (SC.me.role === 'teacher' || SC.me.role === 'admin'));
  const errMsg = (e) => (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.');

  /* Pages that really read each source (checked in the page code), so the "what stops" note is not guesswork. */
  const PG = {
    board: ['#/board', T('City board', 'Πίνακας πόλης')], vehicles: ['#/vehicles', T('Vehicles', 'Οχήματα')], map: ['#/map', T('Live map', 'Ζωντανός χάρτης')],
    city3d: ['#/city3d', T('Cyprus 3D', 'Κύπρος 3D')], explore: ['#/explore', T('Explore data', 'Εξερεύνηση')], schools: ['#/schools', T('Schools and teams', 'Σχολεία και ομάδες')],
    alerts: ['#/alerts', T('Alerts', 'Ειδοποιήσεις')], weather: ['#/weather', T('Met Office record', 'Μετεωρολογικό αρχείο')], warnings: ['#/' + warnId(), T('Warnings watch', 'Παρακολούθηση προειδοποιήσεων')],
    ask: ['#/ask', T('Ask', 'Ρωτήστε')], archive: ['#/archive', T('Data archive', 'Αρχείο δεδομένων')],
  };
  const KNOWN = {
    sensecap: {
      name: T('SenseCAP sensors', 'Αισθητήρες SenseCAP'),
      what: T('Our own sensors on buses, cars and in classrooms. This is measured data.', 'Οι δικοί μας αισθητήρες σε λεωφορεία, αυτοκίνητα και αίθουσες. Είναι μετρημένα δεδομένα.'),
      uses: ['board', 'vehicles', 'map', 'city3d', 'explore', 'schools', 'alerts', 'ask'],
      stops: T('New readings from the school sensors stop arriving. The City board, Vehicles, Live map, Cyprus 3D, Explore data, Schools and Alerts show no new numbers, and Ask cannot read live values.', 'Σταματούν να έρχονται νέες μετρήσεις από τους αισθητήρες των σχολείων. Ο Πίνακας πόλης, τα Οχήματα, ο Ζωντανός χάρτης, η Κύπρος 3D, η Εξερεύνηση, τα Σχολεία και οι Ειδοποιήσεις δεν δείχνουν νέους αριθμούς, και το Ρωτήστε δεν μπορεί να διαβάσει ζωντανές τιμές.'),
    },
    dom: {
      name: T('Cyprus Met Office', 'Μετεωρολογική Υπηρεσία Κύπρου'),
      what: T('About 54 automatic stations, warnings, forecast and radar, updated about every 10 minutes.', 'Περίπου 54 αυτόματοι σταθμοί, προειδοποιήσεις, πρόγνωση και ραντάρ, με ενημέρωση περίπου ανά 10 λεπτά.'),
      uses: ['weather', 'warnings', 'board', 'explore', 'map', 'alerts', 'ask', 'archive'],
      stops: T('The Met Office record, the warning tile on the City board, the station comparison in Explore data, the Live map stations and the Warnings watch stop getting new data, and this site stops saving new Met Office days and page copies. What is already saved stays.', 'Το Μετεωρολογικό αρχείο, το πλακίδιο προειδοποιήσεων στον Πίνακα πόλης, η σύγκριση σταθμών στην Εξερεύνηση, οι σταθμοί στον Ζωντανό χάρτη και η Παρακολούθηση προειδοποιήσεων σταματούν να παίρνουν νέα δεδομένα, και ο ιστότοπος σταματά να αποθηκεύει νέες ημέρες και αντίγραφα σελίδων της Υπηρεσίας. Ό,τι έχει ήδη αποθηκευτεί μένει.'),
    },
    openmeteo: {
      name: 'Open-Meteo',
      what: T('A weather and air-quality computer model on a grid over Cyprus. A model estimate, not a measurement.', 'Μοντέλο καιρού και ποιότητας αέρα σε πλέγμα πάνω από την Κύπρο. Εκτίμηση μοντέλου, όχι μέτρηση.'),
      uses: ['board', 'map', 'ask'],
      stops: T('The model values for weather, air quality and sea (on the City board and the Live map layers) stop updating, and Ask cannot give model values.', 'Οι τιμές του μοντέλου για καιρό, ποιότητα αέρα και θάλασσα (στον Πίνακα πόλης και στα επίπεδα του Ζωντανού χάρτη) σταματούν να ενημερώνονται και το Ρωτήστε δεν μπορεί να δώσει τιμές μοντέλου.'),
    },
    sensorcommunity: {
      name: 'Sensor.Community',
      what: T('Particle sensors run by volunteers. Useful for the idea, but a single sensor can be wrong.', 'Αισθητήρες σωματιδίων που τρέχουν εθελοντές. Χρήσιμοι ως ιδέα, αλλά ένας μεμονωμένος αισθητήρας μπορεί να κάνει λάθος.'),
      uses: ['board', 'map', 'alerts'],
      stops: T('The nearby volunteer particle sensors stop updating on the City board, the Live map and in Alerts.', 'Οι κοντινοί αισθητήρες σωματιδίων των εθελοντών σταματούν να ενημερώνονται στον Πίνακα πόλης, στον Ζωντανό χάρτη και στις Ειδοποιήσεις.'),
    },
    metar: {
      name: T('Airport METAR', 'METAR αεροδρομίων'),
      what: T('Weather reports from Larnaka and Pafos airports, about once an hour.', 'Δελτία καιρού από τα αεροδρόμια Λάρνακας και Πάφου, περίπου μία φορά την ώρα.'),
      uses: ['ask'],
      stops: T('The airport weather reports for Larnaka and Pafos stop updating wherever they are shown, including for Ask.', 'Τα δελτία καιρού των αεροδρομίων Λάρνακας και Πάφου σταματούν να ενημερώνονται παντού όπου εμφανίζονται, και στο Ρωτήστε.'),
    },
  };
  const GENERIC_STOPS = () => T('Pages that read this source stop getting new data.', 'Οι σελίδες που διαβάζουν αυτή την πηγή σταματούν να παίρνουν νέα δεδομένα.');
  const nameOf = (f) => (SC.lang === 'el' && KNOWN[f.id] ? KNOWN[f.id].name : f.name || (KNOWN[f.id] && KNOWN[f.id].name) || f.id);
  const whatOf = (f) => (SC.lang === 'el' && KNOWN[f.id] ? KNOWN[f.id].what : f.what || (KNOWN[f.id] && KNOWN[f.id].what) || '');
  const stopsOf = (f) => (KNOWN[f.id] ? KNOWN[f.id].stops : GENERIC_STOPS());
  const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return ''; } };

  /* ---------- status from the numbers the server gives ---------- */
  function statusOf(f) {
    if (!f.enabled) return 'off';
    const limit = Math.max(15 * MIN, 3 * (f.everyMin || 10) * MIN);
    const newerErr = f.lastError && (!f.lastOk || f.lastError.at > f.lastOk);
    if (!f.lastOk) return f.lastError ? 'failing' : 'none';
    if (Date.now() - f.lastOk <= limit) return 'ok';
    return newerErr ? 'failing' : 'late';
  }
  const STATUS = {
    ok: { cls: 'nm-badge--ok', dot: 'ok', label: () => T('Working', 'Λειτουργεί') },
    late: { cls: 'nm-badge--warn', dot: 'late', label: () => T('Late', 'Καθυστερεί') },
    failing: { cls: 'nm-badge--bad', dot: 'bad', label: () => T('Failing', 'Αποτυχία') },
    none: { cls: 'nm-badge--warn', dot: 'late', label: () => T('No success yet', 'Καμία επιτυχία ακόμη') },
    off: { cls: '', dot: 'off', label: () => T('Switched off', 'Απενεργοποιημένη') },
  };

  function bar24(f) {
    const ok = Math.max(0, f.ok24h || 0), bad = Math.max(0, f.fail24h || 0), n = ok + bad;
    if (!n) return h('div', { class: 'fd-24' }, h('div', { class: 'fd-bar none', role: 'img', 'aria-label': T('No checks in the last 24 hours', 'Κανένας έλεγχος τις τελευταίες 24 ώρες') }), h('p', null, f.enabled ? T('No checks in the last 24 hours', 'Κανένας έλεγχος τις τελευταίες 24 ώρες') : T('Switched off, so no checks', 'Απενεργοποιημένη, άρα χωρίς ελέγχους')));
    const pct = Math.round((bad / n) * 1000) / 10;
    const okW = Math.max(0, (ok / n) * 100), badW = bad ? Math.max(3, (bad / n) * 100) : 0;
    const bar = h('div', { class: 'fd-bar', role: 'img', 'aria-label': T(ok + ' checks worked and ' + bad + ' failed in the last 24 hours', ok + ' έλεγχοι πέτυχαν και ' + bad + ' απέτυχαν τις τελευταίες 24 ώρες') },
      h('i', { class: 'ok', style: { width: okW + '%' } }), badW ? h('i', { class: 'bad', style: { width: badW + '%' } }) : null);
    return h('div', { class: 'fd-24' }, bar, h('p', null, h('b', { class: 'ok' }, ok), T(' worked · ', ' πέτυχαν · '), h('b', { class: bad ? 'bad' : '' }, bad), T(' failed', ' απέτυχαν'), bad ? ' (' + pct + '%)' : ''));
  }

  SC.register('feeds', {
    title: ['Feed list', 'Λίστα πηγών'],
    async render(root, ctx) {
      let alive = true, timer = 0, first = true, data = null, busy = null, notice = null;
      let demo = false;
      try { const c = await SC.cached('/api/config', 300000); demo = !!(c && c.demo); } catch (e) { /* no tag */ }
      const teacher = isTeacher();

      const headHost = h('div');
      const body = h('div', { class: 'fd' });
      root.append(headHost, body);

      function head() {
        headHost.replaceChildren(SC.head({
          title: T('Where our numbers come from.', 'Από πού προέρχονται οι αριθμοί μας.'),
          lede: T('Five outside sources feed this site. Each card says when it last worked, how many of its checks worked in the last 24 hours, and which pages depend on it.', 'Πέντε εξωτερικές πηγές τροφοδοτούν τον ιστότοπο. Κάθε κάρτα λέει πότε λειτούργησε τελευταία φορά, πόσοι έλεγχοί της πέτυχαν τις τελευταίες 24 ώρες και ποιες σελίδες εξαρτώνται από αυτήν.'),
          fresh: data ? T('Checked ' + SC.ago(data.at), 'Ελέγχθηκε ' + SC.ago(data.at)) : null,
          tags: demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
          help: [
            'Each row is one outside source. The dot shows whether it is working: green is fine, amber is late, red is failing, grey is switched off by a teacher. "Last success" is the last time the server got good data from it. The bar shows how many of the checks in the last 24 hours worked. Signed-in teachers can switch a source on or off; the page tells you what stops updating before you confirm.',
            'Κάθε γραμμή είναι μία εξωτερική πηγή. Η κουκκίδα δείχνει αν λειτουργεί: πράσινο είναι καλά, κεχριμπαρί καθυστερεί, κόκκινο αποτυγχάνει, γκρι την έχει απενεργοποιήσει εκπαιδευτικός. Η «Τελευταία επιτυχία» είναι η τελευταία φορά που ο διακομιστής πήρε σωστά δεδομένα από αυτήν. Η μπάρα δείχνει πόσοι από τους ελέγχους των τελευταίων 24 ωρών πέτυχαν. Οι εκπαιδευτικοί που έχουν συνδεθεί μπορούν να ενεργοποιήσουν ή να απενεργοποιήσουν μια πηγή· η σελίδα λέει τι σταματά να ενημερώνεται πριν επιβεβαιώσετε.',
          ],
        }));
      }

      /* ----- confirm and send the switch ----- */
      function toggle(f) {
        const turnOff = f.enabled;
        const nm = nameOf(f);
        const bodyEl = h('div', null);
        if (turnOff) {
          bodyEl.append(h('p', null, h('b', null, T('What stops updating: ', 'Τι σταματά να ενημερώνεται: ')), stopsOf(f)),
            h('p', null, T('Where the server still holds a recent copy it keeps showing it, with its age. Everyone who visits the site is affected, not only you. You can switch it on again here at any time.', 'Όπου ο διακομιστής έχει ακόμη πρόσφατο αντίγραφο, συνεχίζει να το δείχνει, με την ηλικία του. Επηρεάζονται όλοι οι επισκέπτες του ιστότοπου, όχι μόνο εσείς. Μπορείτε να την ενεργοποιήσετε ξανά από εδώ οποιαδήποτε στιγμή.')));
        } else {
          bodyEl.append(h('p', null, T('The server starts asking this source again, and the pages that use it get new data within a few minutes.', 'Ο διακομιστής αρχίζει να ρωτά ξανά αυτή την πηγή και οι σελίδες που τη χρησιμοποιούν παίρνουν νέα δεδομένα μέσα σε λίγα λεπτά.')));
        }
        SC.modal({
          title: turnOff ? T('Switch off ' + nm + '?', 'Απενεργοποίηση: ' + nm + ';') : T('Switch on ' + nm + '?', 'Ενεργοποίηση: ' + nm + ';'),
          body: bodyEl,
          actions: [{ label: T('Cancel', 'Άκυρο') }, { label: turnOff ? T('Switch off', 'Απενεργοποίηση') : T('Switch on', 'Ενεργοποίηση'), primary: true, run: () => send(f, !turnOff) }],
        });
      }
      async function send(f, enabled) {
        busy = f.id; notice = null; paint();
        try {
          await SC.api('/api/feeds/' + encodeURIComponent(f.id), { method: 'POST', body: { enabled } });
          SC.toast(enabled ? T(nameOf(f) + ' is on', nameOf(f) + ': ενεργή') : T(nameOf(f) + ' is switched off', nameOf(f) + ': απενεργοποιήθηκε'));
        } catch (e) {
          notice = { id: f.id, text: e.status === 403 || e.status === 401 ? T('Only a signed-in teacher can switch a source. Sign in on the Approvals page and try again.', 'Μόνο ένας εκπαιδευτικός που έχει συνδεθεί μπορεί να αλλάξει μια πηγή. Συνδεθείτε στη σελίδα Εγκρίσεων και δοκιμάστε ξανά.') : T('The switch could not be saved. ', 'Ο διακόπτης δεν αποθηκεύτηκε. ') + errMsg(e) };
        }
        busy = null;
        await load(true);
        const again = alive && body.querySelector('[data-feed="' + f.id + '"]');
        if (again) again.focus({ preventScroll: true });   // the old button is gone; keep keyboard users where they were
      }

      /* ----- one source ----- */
      function row(f) {
        const st = statusOf(f), S = STATUS[st];
        const known = KNOWN[f.id];
        const card = h('article', { class: 'nm-card fd-row fd-' + st, 'aria-labelledby': 'fd-n-' + f.id });
        const main = h('div', { class: 'fd-main' },
          h('div', { class: 'fd-top' }, h('i', { class: 'fd-dot ' + S.dot, 'aria-hidden': 'true' }), h('h2', { class: 'fd-name', id: 'fd-n-' + f.id }, nameOf(f)), h('span', { class: 'nm-badge ' + S.cls }, S.label())),
          h('p', { class: 'fd-eye' }, T('What it feeds', 'Τι τροφοδοτεί')),
          h('p', { class: 'fd-what' }, whatOf(f)));
        if (known && known.uses.length) {
          main.append(h('div', { class: 'fd-uses' }, h('span', { class: 'fd-eye' }, T('Used by', 'Χρησιμοποιείται από')), known.uses.map((k) => h('a', { class: 'fd-use', href: PG[k][0] }, PG[k][1]))));
        }
        const last = h('div', { class: 'fd-col' },
          h('p', { class: 'fd-eye' }, T('Last success', 'Τελευταία επιτυχία')),
          f.lastOk ? h('div', { class: 'fd-big', title: SC.dateTime(f.lastOk) }, SC.ago(f.lastOk)) : h('div', { class: 'fd-big none' }, T('never', 'ποτέ')),
          f.everyMin ? h('p', { class: 'fd-sub' }, T('Checked every ' + f.everyMin + ' min', 'Έλεγχος κάθε ' + f.everyMin + ' λεπτά')) : null);
        if (f.lastError && f.lastError.message) {
          last.append(h('p', { class: 'fd-err' + (st === 'ok' ? ' old' : '') }, h('b', null, T('Last problem ', 'Τελευταίο πρόβλημα ') + (f.lastError.at ? SC.ago(f.lastError.at) : '') + ': '), String(f.lastError.message).slice(0, 160)));
        }
        const mid = h('div', { class: 'fd-col' }, h('p', { class: 'fd-eye' }, T('Last 24 hours', 'Τελευταίες 24 ώρες')), bar24(f));
        const act = h('div', { class: 'fd-col fd-act' });
        if (f.home) act.append(h('a', { class: 'fd-src', href: f.home, target: '_blank', rel: 'noopener' }, hostOf(f.home) || T('Source site', 'Ιστότοπος πηγής'), SC.icon('external', 14)));
        if (teacher) {
          const on = !!f.enabled, isBusy = busy === f.id;
          act.append(h('button', { class: 'fd-switch' + (on ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': T('Feed ' + nameOf(f) + ' is ' + (on ? 'on' : 'off') + '. Change it', 'Η πηγή ' + nameOf(f) + ' είναι ' + (on ? 'ενεργή' : 'ανενεργή') + '. Αλλαγή'), disabled: isBusy, dataset: { feed: f.id }, onclick: () => toggle(f) },
            h('span', { class: 'fd-track' }, h('i')), h('span', { class: 'fd-sw-l' }, isBusy ? T('Saving', 'Αποθήκευση') : on ? T('On', 'Ενεργή') : T('Off', 'Ανενεργή'))));
        } else {
          act.append(h('span', { class: 'fd-state' + (f.enabled ? ' on' : '') }, f.enabled ? T('On', 'Ενεργή') : T('Off', 'Ανενεργή')));
        }
        card.append(main, last, mid, act);
        if (notice && notice.id === f.id) card.append(h('div', { class: 'err fd-notice', role: 'alert' }, notice.text));
        if (!f.enabled) card.append(h('p', { class: 'fd-offnote' }, h('b', null, T('Switched off by a teacher. ', 'Απενεργοποιήθηκε από εκπαιδευτικό. ')), stopsOf(f)));
        return card;
      }

      function paint() {
        if (!alive) return;
        head();
        const keep = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.feed : null;
        const feeds = (data && data.feeds) || [];
        if (!feeds.length) {
          body.replaceChildren(h('div', { class: 'empty' }, T('The server reports no sources. This is not normal: ask whoever runs the server to check it.', 'Ο διακομιστής δεν αναφέρει καμία πηγή. Αυτό δεν είναι φυσιολογικό: ζητήστε από όποιον διαχειρίζεται τον διακομιστή να το ελέγξει.')));
          return;
        }
        const count = { ok: 0, late: 0, failing: 0, none: 0, off: 0 };
        feeds.forEach((f) => { count[statusOf(f)]++; });
        const sum = h('div', { class: 'fd-sum', role: 'status' },
          h('span', { class: 'nm-badge nm-badge--ok' }, T(count.ok + ' working', count.ok + ' λειτουργούν')),
          count.late + count.none ? h('span', { class: 'nm-badge nm-badge--warn' }, T((count.late + count.none) + ' late or waiting', (count.late + count.none) + ' καθυστερούν ή περιμένουν')) : null,
          count.failing ? h('span', { class: 'nm-badge nm-badge--bad' }, T(count.failing + ' failing', count.failing + ' αποτυγχάνουν')) : null,
          count.off ? h('span', { class: 'nm-badge' }, T(count.off + ' switched off', count.off + ' απενεργοποιημένες')) : null);
        const list = h('div', { class: 'fd-list' }, feeds.map(row));
        const foot = teacher
          ? h('div', { class: 'nm-callout nm-callout--info fd-foot' }, h('b', null, T('You are signed in as a teacher. ', 'Έχετε συνδεθεί ως εκπαιδευτικός. ')), T('Use the switch to turn a source on or off. A switched-off source is off for every visitor until you turn it on again.', 'Χρησιμοποιήστε τον διακόπτη για να ενεργοποιήσετε ή να απενεργοποιήσετε μια πηγή. Μια απενεργοποιημένη πηγή είναι ανενεργή για όλους τους επισκέπτες μέχρι να την ενεργοποιήσετε ξανά.'))
          : h('div', { class: 'nm-callout fd-foot' }, h('b', null, T('Only teachers switch sources. ', 'Μόνο οι εκπαιδευτικοί αλλάζουν τις πηγές. ')), T('Teachers: sign in on the ', 'Εκπαιδευτικοί: συνδεθείτε στη σελίδα '), h('a', { class: 'link', href: '#/approvals' }, T('Approvals page', 'Εγκρίσεων')), T(' to see the switches. Everyone else can see the state here but not change it.', ' για να δείτε τους διακόπτες. Οι υπόλοιποι βλέπουν την κατάσταση εδώ αλλά δεν μπορούν να την αλλάξουν.'));
        body.replaceChildren(sum, list, foot);
        if (keep) { const b = body.querySelector('[data-feed="' + keep + '"]'); if (b && !b.disabled) b.focus({ preventScroll: true }); }
      }

      async function load(quiet) {
        if (first && !quiet) body.replaceChildren(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const r = await SC.api('/api/feeds');
          if (!alive) return;
          data = { feeds: (r && r.feeds) || [], at: Date.now() };
          first = false;
          paint();
        } catch (e) {
          if (!alive) return;
          if (data && !first) return;   // a failed refresh keeps what is on screen; the "checked" pill shows its age
          first = true;
          head();
          body.replaceChildren(h('div', { class: 'err', role: 'alert' }, T('The feed list could not be loaded. ', 'Η λίστα πηγών δεν φορτώθηκε. ') + errMsg(e) + ' ',
            h('button', { class: 'nm-btn fd-retry', type: 'button', onclick: () => load() }, T('Try again', 'Δοκιμάστε ξανά'))));
        }
      }

      head();
      await load();
      timer = setInterval(() => load(true), 30000);
      return () => { alive = false; clearInterval(timer); };
    },
  });
})();
