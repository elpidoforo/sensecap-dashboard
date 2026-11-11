/*
  Research: one box that searches the Met Office pages (now), the Met Office history this site saved, and the public handbook.
  Route: #/research and #/research?q=<words>.
  Data: GET /api/search?q=&limit= (Met Office pages now and saved history), GET /app/api/handbook/public (searched here, in the browser).
  Recent searches are kept in this browser only (localStorage).
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/research.css');

  const RECENT_KEY = 'sc.research.recent';
  const SHOW_FIRST = 6;

  /* ---------- text matching that ignores case and Greek accents (same length in, same length out, so highlights line up) ---------- */
  function fold(s) {
    return String(s == null ? '' : s).split('').map((c) => {
      const d = c.normalize('NFD')[0] || c;
      const l = d.toLowerCase();
      return l.length === 1 ? (l === 'ς' ? 'σ' : l) : d;
    }).join('');
  }
  const termsOf = (q) => Array.from(new Set(fold(q).split(/\s+/).filter((x) => x.length >= 2)));

  // Returns DOM nodes: the text with each match wrapped in <mark>. Never uses innerHTML.
  function marked(text, terms) {
    const src = String(text == null ? '' : text);
    const f = fold(src);
    const spans = [];
    terms.forEach((t) => { let i = 0; while ((i = f.indexOf(t, i)) !== -1) { spans.push([i, i + t.length]); i += t.length; } });
    if (!spans.length) return [src];
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [spans[0].slice()];
    for (let k = 1; k < spans.length; k++) {
      const last = merged[merged.length - 1];
      if (spans[k][0] <= last[1]) last[1] = Math.max(last[1], spans[k][1]); else merged.push(spans[k].slice());
    }
    const out = [];
    let pos = 0;
    merged.forEach(([a, b]) => {
      if (a > pos) out.push(src.slice(pos, a));
      out.push(h('mark', { class: 'rs-mark' }, src.slice(a, b)));
      pos = b;
    });
    if (pos < src.length) out.push(src.slice(pos));
    return out;
  }

  // A short piece of text around the first match.
  function around(text, terms, len) {
    const src = String(text || '').replace(/\s+/g, ' ').trim();
    const f = fold(src);
    let at = -1;
    terms.forEach((t) => { const i = f.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; });
    if (at === -1 || at < 50) return src.length > len ? src.slice(0, len).replace(/\s+\S*$/, '') + ' …' : src;
    let start = at - 60;
    const sp = src.indexOf(' ', start);
    if (sp !== -1 && sp < at) start = sp + 1;
    const piece = src.slice(start, start + len);
    return '… ' + piece + (start + len < src.length ? ' …' : '');
  }

  // The server names a page in both languages (label/labelEl); the page's own title is the fallback.
  const titleOf = (r) => (SC.lang === 'el' && r.labelEl ? r.labelEl : r.label) || r.title || '';
  const plain = (s) => String(s || '').replace(/<\/?mark>/gi, '').replace(/\s+/g, ' ').trim();
  const when = (ms) => (ms && isFinite(ms) ? SC.dateTime(ms) : '');
  const warnId = () => 'warnings';

  /* ---------- where a result opens ---------- */
  function destination(r, group) {
    const u = String(r.url || '');
    let external = null, href = null;
    if (/^https?:\/\//i.test(u)) external = u;
    else if (u.startsWith('#/')) href = u;
    else if (u.startsWith('/#/')) href = u.slice(1);
    // Saved copies of the warnings page are read in the Warnings watch; other saved pages are counted in the Data archive.
    if (group === 'archive' && (r.page === 'warnings' || /warning/i.test(r.title || ''))) href = '#/' + warnId();
    if (!href) {
      if (group === 'handbook') href = '#/library?doc=' + encodeURIComponent(r.title);
      else if (group === 'metoffice') href = '#/weather';
      else href = '#/archive';
    }
    let label;
    if (/^#\/weather/.test(href)) label = T('Open in Met Office record', 'Άνοιγμα στο μετεωρολογικό αρχείο');
    else if (/^#\/library/.test(href)) label = T('Open in Library', 'Άνοιγμα στη Βιβλιοθήκη');
    else if (/^#\/archive/.test(href)) label = T('Open in Data archive', 'Άνοιγμα στο αρχείο δεδομένων');
    else if (/^#\/warn/.test(href)) label = T('Open in Warnings watch', 'Άνοιγμα στην Παρακολούθηση προειδοποιήσεων');
    else label = T('Open', 'Άνοιγμα');
    return { href, label, external, saved: group === 'archive' && /^\/api\/dom\/pages\/history/.test(String(r.api || '')) ? r.api : null };
  }

  const GROUPS = [
    { id: 'metoffice', icon: 'shield', title: T('Met Office pages, now', 'Σελίδες Μετεωρολογικής Υπηρεσίας, τώρα'), sub: T('What the Met Office publishes at this moment.', 'Ό,τι δημοσιεύει η Υπηρεσία αυτή τη στιγμή.'), tag: ['live', T('Now', 'Τώρα')], pill: T('Met Office now', 'Υπηρεσία τώρα') },
    { id: 'archive', icon: 'layers', title: T('Saved Met Office history', 'Αποθηκευμένο ιστορικό Υπηρεσίας'), sub: T('Earlier versions of those pages that this site kept.', 'Παλαιότερες εκδόσεις αυτών των σελίδων που κρατά ο ιστότοπος.'), tag: ['arch', T('Saved', 'Αποθηκευμένο')], pill: T('Saved history', 'Ιστορικό') },
    { id: 'handbook', icon: 'db', title: T('Handbook', 'Εγχειρίδιο'), sub: T('Public pages written by our teachers: sensor guides, how we read data.', 'Δημόσιες σελίδες των εκπαιδευτικών μας: οδηγοί αισθητήρων, πώς διαβάζουμε τα δεδομένα.'), tag: ['team', T('Handbook', 'Εγχειρίδιο')], pill: T('Handbook', 'Εγχειρίδιο') },
  ];

  /* ---------- handbook (public) is fetched once and searched here ---------- */
  let handbookP = null;
  const handbook = () => handbookP || (handbookP = SC.api('/app/api/handbook/public').then((r) => (r && r.docs) || []).catch((e) => { handbookP = null; throw e; }));
  function searchHandbook(docs, terms) {
    const out = [];
    docs.forEach((d) => {
      const ft = fold(d.title), fb = fold(d.body);
      if (!terms.every((t) => ft.includes(t) || fb.includes(t))) return;
      let score = 0;
      terms.forEach((t) => {
        if (ft.includes(t)) score += 6;
        let i = 0, n = 0;
        while (n < 20 && (i = fb.indexOf(t, i)) !== -1) { n++; i += t.length; }
        score += n;
      });
      out.push({ source: 'handbook', title: d.title, snippet: around(d.body, terms, 230), at: d.updated_at || null, url: '', score });
    });
    return out.sort((a, b) => b.score - a.score);
  }

  /* ---------- recent searches ---------- */
  function recent() { try { const a = JSON.parse(SC.store.get(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch (e) { return []; } }
  function remember(q) { SC.store.set(RECENT_KEY, JSON.stringify([q].concat(recent().filter((x) => x.toLowerCase() !== q.toLowerCase())).slice(0, 8))); }

  const errMsg = (e) => (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.');

  SC.register('research', {
    title: ['Research', 'Έρευνα'],
    async render(root, ctx) {
      let alive = true, token = 0;
      const S = { q: '', terms: [], res: { metoffice: null, archive: null, handbook: null }, err: { server: null, handbook: null }, loading: false, only: 'all', open: {} };

      // demo tag (best effort)
      const tags = [];
      try { const c = await SC.cached('/api/config', 300000); if (c && c.demo) tags.push({ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }); } catch (e) { /* no tag */ }

      root.append(SC.head({
        title: T('Find it in one box.', 'Βρείτε το σε ένα πλαίσιο.'),
        lede: T('Search the Met Office pages, the history this site saved and the public handbook. Every result opens the page it came from.', 'Αναζητήστε στις σελίδες της Μετεωρολογικής Υπηρεσίας, στο ιστορικό που αποθήκευσε ο ιστότοπος και στο δημόσιο εγχειρίδιο. Κάθε αποτέλεσμα ανοίγει τη σελίδα από την οποία προήλθε.'),
        tags,
        help: [
          'Type one or more words and press Search. Results are grouped by where they come from: the Met Office pages as they are right now, earlier versions of those pages that this site saved, and the public handbook. Matching words are highlighted. Use the buttons above the results to look at one group only. Your last searches are remembered in this browser only.',
          'Πληκτρολογήστε μία ή περισσότερες λέξεις και πατήστε Αναζήτηση. Τα αποτελέσματα ομαδοποιούνται ανά πηγή: οι σελίδες της Μετεωρολογικής Υπηρεσίας όπως είναι τώρα, παλαιότερες εκδόσεις τους που αποθήκευσε ο ιστότοπος και το δημόσιο εγχειρίδιο. Οι λέξεις που ταιριάζουν επισημαίνονται. Χρησιμοποιήστε τα κουμπιά πάνω από τα αποτελέσματα για να δείτε μία μόνο ομάδα. Οι τελευταίες αναζητήσεις σας θυμούνται μόνο σε αυτό το πρόγραμμα περιήγησης.',
        ],
      }));

      /* ----- the search box ----- */
      const input = h('input', { class: 'nm-input rs-input', id: 'rs-q', type: 'search', name: 'q', autocomplete: 'off', maxlength: 120, placeholder: T('Search warnings, sea forecasts, sensor guides…', 'Αναζήτηση προειδοποιήσεων, προγνώσεων θάλασσας, οδηγών αισθητήρων…'), 'aria-label': T('Search words', 'Λέξεις αναζήτησης') });
      const hint = h('p', { class: 'rs-hint', role: 'status', 'aria-live': 'polite' });
      const go = h('button', { class: 'nm-btn nm-btn--primary', type: 'submit' }, SC.icon('search', 18), T('Search', 'Αναζήτηση'));
      const form = h('form', { class: 'rs-form', role: 'search' },
        h('div', { class: 'rs-field' }, SC.icon('search', 20), input), go);
      const recentBox = h('div', { class: 'rs-recent' });
      const searchCard = h('section', { class: 'nm-card nm-card--glow rs-card', 'aria-label': T('Search', 'Αναζήτηση') }, form, hint, recentBox);

      const out = h('div', { class: 'rs-out' });
      root.append(h('div', { class: 'rs' }, searchCard, out));

      function drawRecent() {
        const r = recent();
        if (!r.length) { recentBox.replaceChildren(); recentBox.hidden = true; return; }
        recentBox.hidden = false;
        recentBox.replaceChildren(...[
          h('span', { class: 'rs-recent-l' }, T('Recent', 'Πρόσφατες')),
          ...r.map((q) => h('button', { class: 'rs-chip', type: 'button', onclick: () => { input.value = q; run(q); } }, q)),
          h('button', { class: 'rs-clear', type: 'button', onclick: () => { SC.store.set(RECENT_KEY, '[]'); drawRecent(); input.focus(); } }, T('Clear', 'Καθαρισμός'))]);
      }

      /* ----- result pieces ----- */
      function resultItem(r, group) {
        const dest = destination(r, group.id);
        const li = h('li', { class: 'rs-item' });
        li.append(
          h('div', { class: 'rs-item-top' },
            h('span', { class: 't ' + group.tag[0] }, group.tag[1]),
            h('b', { class: 'rs-item-t' }, marked(titleOf(r), S.terms)),
            r.at ? h('time', { class: 'rs-item-at mono', datetime: new Date(r.at).toISOString(), title: when(r.at) }, group.id === 'metoffice' ? T('read ', 'διαβάστηκε ') + SC.ago(r.at) : group.id === 'archive' ? T('saved ', 'αποθηκεύτηκε ') + SC.ago(r.at) : SC.ago(r.at)) : null),
          r.snippet ? h('p', { class: 'rs-snip' }, marked(plain(r.snippet), S.terms)) : null,
          h('div', { class: 'rs-item-go' },
            h('a', { class: 'rs-open', href: dest.href }, dest.label, SC.icon('arrow', 15)),
            dest.saved ? h('a', { class: 'rs-ext', href: dest.saved, target: '_blank', rel: 'noopener' }, T('Saved versions (JSON)', 'Αποθηκευμένες εκδόσεις (JSON)'), SC.icon('external', 13)) : null,
            dest.external ? h('a', { class: 'rs-ext', href: dest.external, target: '_blank', rel: 'noopener' }, T('Met Office original', 'Πρωτότυπο της Υπηρεσίας'), SC.icon('external', 13)) : null,
            r.at ? h('span', { class: 'rs-item-when' }, when(r.at)) : null));
        return li;
      }

      function groupCard(g) {
        const items = S.res[g.id];
        const sourceErr = g.id === 'handbook' ? S.err.handbook : S.err.server;
        const card = h('section', { class: 'nm-card rs-group', id: 'rs-g-' + g.id, 'aria-labelledby': 'rs-gh-' + g.id });
        if (S.only !== 'all' && S.only !== g.id) card.hidden = true;
        const count = items ? items.length : null;
        card.append(h('div', { class: 'rs-gh' },
          h('span', { class: 'nm-icon-tile rs-gi' }, SC.icon(g.icon, 20)),
          h('div', { class: 'rs-gt' }, h('h2', { class: 'card-h', id: 'rs-gh-' + g.id }, g.title), h('p', { class: 'card-sub' }, g.sub)),
          count != null ? h('span', { class: 'nm-badge' + (count ? ' nm-badge--info' : '') }, String(count)) : null));
        if (sourceErr) {
          card.append(h('div', { class: 'err', role: 'alert' }, (g.id === 'handbook' ? T('The handbook could not be searched. ', 'Δεν ήταν δυνατή η αναζήτηση στο εγχειρίδιο. ') : T('The Met Office search could not be reached. ', 'Δεν ήταν δυνατή η πρόσβαση στην αναζήτηση της Υπηρεσίας. ')) + errMsg(sourceErr) + ' ',
            h('button', { class: 'nm-btn rs-retry', type: 'button', onclick: () => run(S.q, true) }, T('Try again', 'Δοκιμάστε ξανά'))));
        } else if (!items) {
          card.append(h('div', { class: 'loading' }, T('Searching', 'Αναζήτηση')));
        } else if (!items.length) {
          card.append(h('div', { class: 'empty rs-none' }, g.id === 'handbook'
            ? T('No handbook page mentions all of these words. Try fewer words.', 'Καμία σελίδα του εγχειριδίου δεν αναφέρει όλες αυτές τις λέξεις. Δοκιμάστε λιγότερες λέξεις.')
            : g.id === 'archive'
              ? T('Nothing in the saved history matches. The server saves a page again only when its text changes, so older wording may not be there.', 'Τίποτα στο αποθηκευμένο ιστορικό δεν ταιριάζει. Ο διακομιστής αποθηκεύει μια σελίδα ξανά μόνο όταν αλλάζει το κείμενό της, οπότε η παλαιότερη διατύπωση μπορεί να λείπει.')
              : T('None of the Met Office pages mentions these words right now.', 'Καμία σελίδα της Υπηρεσίας δεν αναφέρει αυτές τις λέξεις αυτή τη στιγμή.')));
        } else {
          const all = S.open[g.id];
          const list = h('ul', { class: 'rs-list' }, (all ? items : items.slice(0, SHOW_FIRST)).map((r) => resultItem(r, g)));
          card.append(list);
          if (!all && items.length > SHOW_FIRST) card.append(h('button', { class: 'nm-btn rs-more', type: 'button', onclick: () => { S.open[g.id] = true; paint(); } }, T('Show all ' + items.length, 'Εμφάνιση και των ' + items.length)));
        }
        return card;
      }

      function paint() {
        if (!alive) return;
        out.replaceChildren();
        if (!S.q) {
          out.append(h('div', { class: 'nm-card rs-intro' },
            h('div', { class: 'rs-intro-t' }, h('span', { class: 'nm-icon-tile' }, SC.icon('search', 20)), h('div', null, h('b', null, T('Start with a word.', 'Ξεκινήστε με μια λέξη.')), h('p', null, T('Results are grouped by source, and each one links to the page it came from.', 'Τα αποτελέσματα ομαδοποιούνται ανά πηγή και το καθένα οδηγεί στη σελίδα από την οποία προήλθε.')))),
            h('div', { class: 'rs-try' }, h('span', { class: 'rs-recent-l' }, T('Try', 'Δοκιμάστε')),
              ['warning', 'sea', 'temperature', 'CO2'].map((q) => h('button', { class: 'rs-chip', type: 'button', onclick: () => { input.value = q; run(q); } }, q))),
            h('p', { class: 'rs-fine' }, T('Only the public handbook is searched, never teachers’ private notes. The Met Office history is what this server saved; see the Data archive for what is kept.', 'Αναζητείται μόνο το δημόσιο εγχειρίδιο, ποτέ οι ιδιωτικές σημειώσεις των εκπαιδευτικών. Το ιστορικό της Υπηρεσίας είναι ό,τι αποθήκευσε ο διακομιστής· δείτε το Αρχείο δεδομένων για το τι κρατιέται.'))));
          return;
        }
        const total = GROUPS.reduce((n, g) => n + (S.res[g.id] ? S.res[g.id].length : 0), 0);
        const pending = GROUPS.some((g) => S.res[g.id] == null && !(g.id === 'handbook' ? S.err.handbook : S.err.server));
        const bar = h('div', { class: 'rs-bar' },
          h('p', { class: 'rs-sum', role: 'status', 'aria-live': 'polite' }, pending ? T('Searching for “' + S.q + '”…', 'Αναζήτηση για «' + S.q + '»…')
            : total ? T(total + (total === 1 ? ' result' : ' results') + ' for “' + S.q + '”', total + (total === 1 ? ' αποτέλεσμα' : ' αποτελέσματα') + ' για «' + S.q + '»')
              : T('No results for “' + S.q + '”', 'Κανένα αποτέλεσμα για «' + S.q + '»')),
          h('div', { class: 'nm-pillbar rs-pills', role: 'group', 'aria-label': T('Show results from', 'Εμφάνιση αποτελεσμάτων από') },
            [['all', T('All', 'Όλα'), total]].concat(GROUPS.map((g) => [g.id, g.pill, S.res[g.id] ? S.res[g.id].length : null])).map(([id, label, n]) =>
              h('button', { type: 'button', class: S.only === id ? 'on' : '', 'aria-pressed': S.only === id ? 'true' : 'false', onclick: () => { S.only = id; paint(); } }, label + (n != null && !pending ? ' ' + n : '')))));
        out.append(bar);
        if (!pending && !total && !S.err.server && !S.err.handbook) {
          out.append(h('div', { class: 'nm-callout nm-callout--info rs-tip' }, T('Nothing matched. Try fewer words, a different spelling, or just one key word such as “warning” or “sea”.', 'Δεν βρέθηκε τίποτα. Δοκιμάστε λιγότερες λέξεις, άλλη ορθογραφία ή μία μόνο λέξη-κλειδί όπως «warning» ή «θάλασσα».')));
        }
        GROUPS.forEach((g) => out.append(groupCard(g)));
      }

      /* ----- running a search ----- */
      function setUrl(q) { try { history.replaceState(null, '', '#/research' + (q ? '?q=' + encodeURIComponent(q) : '')); } catch (e) { /* the address stays as it is */ } }

      async function run(raw, again) {
        const q = String(raw || '').trim();
        if (q.length < 2) {
          hint.textContent = T('Type at least two letters.', 'Πληκτρολογήστε τουλάχιστον δύο γράμματα.');
          hint.classList.add('bad');
          input.focus();
          return;
        }
        hint.textContent = ''; hint.classList.remove('bad');
        const my = ++token;
        S.q = q; S.terms = termsOf(q); S.res = { metoffice: null, archive: null, handbook: null }; S.err = { server: null, handbook: null }; S.only = again ? S.only : 'all'; S.open = {};
        if (!again) { remember(q); drawRecent(); }
        setUrl(q);
        input.value = q;
        paint();
        const server = SC.api('/api/search?q=' + encodeURIComponent(q) + '&limit=40').then((r) => {
          if (!alive || my !== token) return;
          const list = (r && r.results) || [];
          S.res.metoffice = list.filter((x) => x.source === 'metoffice');
          S.res.archive = list.filter((x) => x.source !== 'metoffice');
        }).catch((e) => { if (alive && my === token) S.err.server = e; });
        const hb = handbook().then((docs) => { if (alive && my === token) S.res.handbook = searchHandbook(docs, S.terms); }).catch((e) => { if (alive && my === token) S.err.handbook = e; });
        server.then(() => { if (alive && my === token) paint(); });
        hb.then(() => { if (alive && my === token) paint(); });
      }

      form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });
      input.addEventListener('input', () => { if (hint.textContent) { hint.textContent = ''; hint.classList.remove('bad'); } });

      drawRecent();
      const q0 = ctx.query && ctx.query.get('q');
      if (q0) run(q0); else { paint(); input.focus({ preventScroll: true }); }

      return () => { alive = false; token++; };
    },
  });
})();
