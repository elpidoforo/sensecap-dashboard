/*
  Helpers: the background savers, the caches and the assistants that keep the site running, each with what it does,
  last run, next run, health and a plain detail line. Nothing here is made up: every card is one entry of GET /api/helpers
  { at, demo, helpers:[{ id, name, nameEl, what, whatEl, kind:'saver'|'assistant'|'cache'|'studio', status:'ok'|'late'|'off'|'error',
  lastRun, nextRun, detail, detailEl }] }. Route: #/helpers.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/helpers.css');

  const errMsg = (e) => (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.');
  const pick = (o, k) => (SC.lang === 'el' && o[k + 'El'] ? o[k + 'El'] : o[k]) || '';

  const KIND = {
    saver: { icon: 'db', tag: ['arch', () => T('Saver', 'Αποθήκευση')], word: () => T('Background saver', 'Αποθηκευτής στο παρασκήνιο') },
    cache: { icon: 'refresh', tag: ['daily', () => T('Cache', 'Μνήμη')], word: () => T('Keeps the site fast', 'Κρατά τον ιστότοπο γρήγορο') },
    assistant: { icon: 'sparkle', tag: ['ai', () => T('AI assistant', 'Βοηθός ΤΝ')], word: () => T('Assistant', 'Βοηθός') },
    studio: { icon: 'pencil', tag: ['team', () => T('Studio', 'Εργαστήρι')], word: () => T('Students and teachers', 'Μαθητές και εκπαιδευτικοί') },
  };
  // Where to read more about each helper (only pages that exist in the menu).
  const LINK = {
    'history-saver': ['#/archive', () => T('See what it saved', 'Δείτε τι αποθήκευσε')],
    'pages-saver': ['#/warnings', () => T('See the warnings watch', 'Δείτε την παρακολούθηση')],
    caches: ['#/feeds', () => T('See the feed list', 'Δείτε τη λίστα πηγών')],
    assistant: ['#/ask', () => T('Open Ask', 'Άνοιγμα του Ρωτήστε')],
    studio: ['#/studio', () => T('Open the Build studio', 'Άνοιγμα του Εργαστηρίου')],
  };
  const STATUS = {
    ok: { cls: 'nm-badge--ok', dot: 'ok', label: () => T('Healthy', 'Σε καλή κατάσταση') },
    late: { cls: 'nm-badge--warn', dot: 'late', label: () => T('Late', 'Καθυστερεί') },
    error: { cls: 'nm-badge--bad', dot: 'bad', label: () => T('Problem', 'Πρόβλημα') },
    off: { cls: '', dot: 'off', label: () => T('Off', 'Ανενεργό') },
  };

  function until(ms) {
    const s = Math.round((ms - Date.now()) / 1000);
    if (s <= 60) return T('due now', 'τώρα');
    const m = Math.round(s / 60);
    if (m < 90) return T('in ' + m + ' min', 'σε ' + m + ' λεπτά');
    const hh = Math.round(m / 60);
    if (hh < 36) return T('in ' + hh + ' h', 'σε ' + hh + ' ώρες');
    return T('in ' + Math.round(hh / 24) + ' days', 'σε ' + Math.round(hh / 24) + ' ημέρες');
  }

  function card(x) {
    const st = STATUS[x.status] || STATUS.ok;
    const kd = KIND[x.kind] || KIND.saver;
    const link = LINK[x.id];
    const nm = pick(x, 'name') || x.id;
    const c = h('article', { class: 'nm-card hp-card hp-' + (x.status || 'ok'), 'aria-labelledby': 'hp-n-' + x.id });
    c.append(
      h('div', { class: 'hp-top' },
        h('span', { class: 'nm-icon-tile hp-ic' }, SC.icon(kd.icon, 22), h('i', { class: 'hp-dot ' + st.dot, 'aria-hidden': 'true' })),
        h('div', { class: 'hp-tt' }, h('h2', { class: 'hp-name', id: 'hp-n-' + x.id }, nm), h('p', { class: 'hp-kind' }, kd.word())),
        h('span', { class: 'nm-badge ' + st.cls }, st.label())),
      h('p', { class: 'hp-what' }, pick(x, 'what')),
      h('dl', { class: 'hp-facts' },
        h('div', null, h('dt', null, T('Last run', 'Τελευταία εκτέλεση')),
          h('dd', { title: x.lastRun ? SC.dateTime(x.lastRun) : '' }, x.lastRun ? SC.ago(x.lastRun) : h('span', { class: 'hp-none' }, x.kind === 'cache' ? T('not recorded', 'δεν καταγράφεται') : T('not yet', 'όχι ακόμη')))),
        h('div', null, h('dt', null, T('Next run', 'Επόμενη εκτέλεση')),
          h('dd', { title: x.nextRun ? SC.dateTime(x.nextRun) : '' }, x.nextRun ? until(x.nextRun) : h('span', { class: 'hp-none' }, x.kind === 'saver' ? T('not scheduled', 'δεν έχει προγραμματιστεί') : T('when needed', 'όταν χρειαστεί'))))),
      h('p', { class: 'hp-detail' }, pick(x, 'detail')),
      h('div', { class: 'hp-foot' },
        h('span', { class: 't ' + kd.tag[0] }, kd.tag[1]()),
        link ? h('a', { class: 'hp-link', href: link[0] }, link[1](), SC.icon('arrow', 14)) : null));
    return c;
  }

  SC.register('helpers', {
    title: ['Helpers', 'Βοηθοί'],
    async render(root, ctx) {
      let alive = true, timer = 0, data = null, first = true;
      let demo = false;
      try { const c = await SC.cached('/api/config', 300000); demo = !!(c && c.demo); } catch (e) { /* no tag */ }

      const headHost = h('div');
      const body = h('div', { class: 'hp' });
      root.append(headHost, body);

      function head() {
        headHost.replaceChildren(SC.head({
          title: T('The helpers behind the site.', 'Οι βοηθοί πίσω από τον ιστότοπο.'),
          lede: T('Small programs that work in the background: they save the Met Office readings, keep copies of its pages, keep the site quick, and answer questions. Each card shows when it last ran and whether it is healthy.', 'Μικρά προγράμματα που δουλεύουν στο παρασκήνιο: αποθηκεύουν τις μετρήσεις της Μετεωρολογικής, κρατούν αντίγραφα των σελίδων της, κρατούν τον ιστότοπο γρήγορο και απαντούν σε ερωτήσεις. Κάθε κάρτα δείχνει πότε έτρεξε τελευταία φορά και αν είναι σε καλή κατάσταση.'),
          fresh: data ? T('Checked ' + SC.ago(data.at), 'Ελέγχθηκε ' + SC.ago(data.at)) : null,
          tags: (demo || (data && data.demo)) ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
          help: [
            'Each card is one helper that runs inside the server. "Last run" is the last time it did its job and "Next run" is when it will do it again, when it works on a timetable. The coloured dot and the word show its health: healthy, late (it has not run when it should have), a problem (the last try failed) or off. The line under them says in plain words what it is doing or why it is resting. Nothing is shown here that the server did not report.',
            'Κάθε κάρτα είναι ένας βοηθός που τρέχει μέσα στον διακομιστή. Η «Τελευταία εκτέλεση» είναι η τελευταία φορά που έκανε τη δουλειά του και η «Επόμενη εκτέλεση» πότε θα την ξανακάνει, όταν δουλεύει με πρόγραμμα. Η έγχρωμη κουκκίδα και η λέξη δείχνουν την κατάστασή του: σε καλή κατάσταση, καθυστερεί (δεν έτρεξε όταν έπρεπε), πρόβλημα (η τελευταία προσπάθεια απέτυχε) ή ανενεργό. Η γραμμή από κάτω λέει με απλά λόγια τι κάνει ή γιατί ξεκουράζεται. Δεν εμφανίζεται τίποτα που δεν το ανέφερε ο διακομιστής.',
          ],
        }));
      }

      function paint() {
        if (!alive) return;
        head();
        const list = (data && data.helpers) || [];
        if (!list.length) { body.replaceChildren(h('div', { class: 'empty' }, T('The server reports no helpers. This is not normal: ask whoever runs the server to check it.', 'Ο διακομιστής δεν αναφέρει κανέναν βοηθό. Αυτό δεν είναι φυσιολογικό: ζητήστε από όποιον διαχειρίζεται τον διακομιστή να το ελέγξει.'))); return; }
        const n = { ok: 0, late: 0, error: 0, off: 0 };
        list.forEach((x) => { n[x.status] = (n[x.status] || 0) + 1; });
        const sum = h('div', { class: 'hp-sum', role: 'status' },
          h('span', { class: 'hp-total' }, T(list.length + (list.length === 1 ? ' helper' : ' helpers'), list.length + (list.length === 1 ? ' βοηθός' : ' βοηθοί'))),
          n.ok ? h('span', { class: 'nm-badge nm-badge--ok' }, T(n.ok + ' healthy', n.ok + ' σε καλή κατάσταση')) : null,
          n.late ? h('span', { class: 'nm-badge nm-badge--warn' }, T(n.late + ' late', n.late + ' καθυστερούν')) : null,
          n.error ? h('span', { class: 'nm-badge nm-badge--bad' }, T(n.error + ' with a problem', n.error + ' με πρόβλημα')) : null,
          n.off ? h('span', { class: 'nm-badge' }, T(n.off + ' off', n.off + ' ανενεργοί')) : null);
        // how the pieces connect: the same chain the Feed list and the Data archive show
        const flow = h('ol', { class: 'hp-flow', 'aria-label': T('How data travels', 'Πώς ταξιδεύουν τα δεδομένα') },
          [[T('Outside sources', 'Εξωτερικές πηγές'), '#/feeds'], [T('Savers and caches', 'Αποθηκευτές και μνήμες'), null], [T('Saved history', 'Αποθηκευμένο ιστορικό'), '#/archive'], [T('Pages and Ask', 'Σελίδες και Ρωτήστε'), '#/ask']]
            .map(([label, href], i) => h('li', null, i ? SC.icon('arrow', 14) : null, href ? h('a', { href }, label) : h('span', null, label))));
        body.replaceChildren(h('div', { class: 'hp-bar' }, sum, flow), h('div', { class: 'hp-grid' }, list.map(card)));
      }

      async function load(quiet) {
        if (first && !quiet) body.replaceChildren(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const r = await SC.api('/api/helpers');
          if (!alive) return;
          data = { helpers: (r && r.helpers) || [], at: Number(r && r.at) || Date.now(), demo: Boolean(r && r.demo) };
          first = false;
          paint();
        } catch (e) {
          if (!alive) return;
          if (data && !first) return;   // a failed refresh keeps what is on screen
          first = true;
          head();
          body.replaceChildren(h('div', { class: 'err', role: 'alert' }, T('The helpers could not be loaded. ', 'Δεν φορτώθηκαν οι βοηθοί. ') + errMsg(e) + ' ',
            h('button', { class: 'nm-btn hp-retry', type: 'button', onclick: () => load() }, T('Try again', 'Δοκιμάστε ξανά'))));
        }
      }

      head();
      await load();
      timer = setInterval(() => load(true), 30000);
      return () => { alive = false; clearInterval(timer); };
    },
  });
})();
