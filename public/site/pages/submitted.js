/* Submitted work: the queue of things students and the report builder send for a decision, in one place.
   Teachers see the combined queue (tools, team projects, council sessions, reports), filter it, open a preview and decide.
   Visitors and students see a friendly gallery of what was approved, and a sign-in card for teachers.
   API: GET /studio/api/submitted (teachers: the queue, everyone else: approved items only), GET /studio/api/status,
        tools:   GET /studio/api/projects/:id, preview /studio/p/:id, POST /studio/api/projects/:id/review {decision:'approve'|'reject', note}
        plans:   GET /studio/api/plans?scope=review, POST /studio/api/plans/:id/review {decision:'approve'|'send_back', note}
        council: GET /council/api/sessions/:id, POST /council/api/sessions/:id/review {decision:'publish'|'reject', note}
        reports: GET /council/api/reports/:id, POST /council/api/reports/:id/release | /withdraw
   Items: { kind:'tool'|'plan'|'council'|'report', id, title, author_label, school, at, status }. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;

  /* ---------- icons (static strings only) ---------- */
  const ICON = {
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    inbox: '<path d="M3 13l3-9h12l3 9v7H3zM3 13h5l1 3h6l1-3h5"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    back: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 016 6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    sensor: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- kinds ---------- */
  const KINDS = ['tool', 'plan', 'council', 'report'];
  const KIND = {
    tool: { icon: 'pencil', name: ['Tool', 'Εργαλείο'], plural: ['Tools', 'Εργαλεία'], color: 'var(--nm-c2)' },
    plan: { icon: 'flag', name: ['Project', 'Έργο'], plural: ['Projects', 'Έργα'], color: 'var(--nm-c1)' },
    council: { icon: 'shield', name: ['Council session', 'Συνεδρία συμβουλίου'], plural: ['Council', 'Συμβούλιο'], color: 'var(--nm-c4)' },
    report: { icon: 'file', name: ['Report', 'Αναφορά'], plural: ['Reports', 'Αναφορές'], color: 'var(--nm-c3)' },
  };
  const kname = (k) => t(KIND[k].name[0], KIND[k].name[1]);
  const kplural = (k) => t(KIND[k].plural[0], KIND[k].plural[1]);
  const DECIDED = new Set(['approved', 'published', 'released', 'rejected', 'sent_back', 'withdrawn', 'done']);
  const isDecided = (it) => DECIDED.has(String(it.status || '').toLowerCase());
  const GPS = new Set(['4197', '4198']);
  const MID_EL = { 4097: 'Θερμοκρασία αέρα', 4098: 'Υγρασία αέρα', 4099: 'Φωτεινότητα', 4100: 'CO₂', 4101: 'Βαρομετρική πίεση' };
  const SRC = { metoffice: ['Met Office station', 'Σταθμός Μετεωρολογικής Υπηρεσίας'], air: ['Outdoor air quality', 'Ποιότητα αέρα έξω'] };
  const errMsg = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  const toMs = (x) => (typeof x === 'number' ? x : x ? Date.parse(x) || 0 : 0);
  const key = (it) => it.kind + ':' + it.id;
  const ttl = (it) => (SC.lang === 'el' && it.titleEl ? it.titleEl : it.title);
  const plural = (n, one, many, oneEl, manyEl) => (n === 1 ? t(n + ' ' + one, n + ' ' + oneEl) : t(n + ' ' + many, n + ' ' + manyEl));
  function schoolColor(short) {
    const s = String(short || '').toLowerCase();
    return /larn/.test(s) ? 'var(--nm-c1)' : /lefk|nicos/.test(s) ? 'var(--nm-c2)' : /lima/.test(s) ? 'var(--nm-c3)' : /paph|pafo/.test(s) ? 'var(--nm-c4)' : 'var(--nm-c5)';
  }
  const tx = (v) => (Array.isArray(v) ? t(v[0], v[1]) : v == null ? '' : String(v));   // [en, el] pairs or plain text
  const paras = (text) => String(text || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).map((s) => el('p', null, s));

  /* ---------- a sandboxed tool page asks the site for the live overview ---------- */
  function bridge(root) {
    let cache = null, at = 0;
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.type !== 'cities-get') return;
      if (!Array.from(document.querySelectorAll('iframe.sb-frame')).some((f) => f.contentWindow === e.source)) return;
      const reply = (o) => { o.type = 'cities-result'; o.id = d.id; e.source.postMessage(o, '*'); };
      if (d.what !== 'overview') return reply({ error: 'Unknown data request.' });
      if (cache && Date.now() - at < 60000) return reply({ data: cache });
      SC.api('/cities/api/overview').then((o) => { cache = o; at = Date.now(); reply({ data: o }); }).catch(() => reply({ error: 'Could not load the data.' }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }

  /* ================= the page ================= */
  function submitted(root, ctx) {
    const S = {
      status: null, items: [], err: null, loaded: false, kind: 'all', school: 'all', cur: null, detail: new Map(),
      devices: new Map(), names: {}, demo: false, busy: false, log: [], at: 0,
    };
    let alive = true, timer = 0, viewer = null;
    const stopBridge = bridge(root);
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const headHost = el('div'), statsHost = el('div'), bodyHost = el('div');
    root.append(headHost, statsHost, bodyHost, live);

    const V = () => (S.status && S.status.viewer) || { kind: 'visitor' };
    const staff = () => Boolean((ctx.me && (ctx.me.role === 'teacher' || ctx.me.role === 'admin')) || (V().kind === 'user' && (V().role === 'teacher' || V().role === 'admin')));

    /* ----- names for plans ----- */
    const sensorName = (s) => { const d = S.devices.get(s && s.eui ? s.eui : s); return d ? d : (s && s.name) || t('A sensor', 'Ένας αισθητήρας'); };
    function dataName(id) {
      if (SRC[id]) return t(SRC[id][0], SRC[id][1]);
      const n = S.names[id];
      if (n) return SC.lang === 'el' && MID_EL[id] ? MID_EL[id] : n[0];
      return t('Reading ' + id, 'Μέτρηση ' + id);
    }

    /* ----- loading ----- */
    async function loadStatus() { try { S.status = await SC.api('/studio/api/status'); } catch (e) { S.status = null; } }
    async function loadSide() {
      const [dv, cf] = await Promise.allSettled([SC.cached('/api/devices', 60000), SC.cached('/api/config', 300000)]);
      if (dv.status === 'fulfilled' && Array.isArray(dv.value)) S.devices = new Map(dv.value.map((d) => [d.eui, d.name]));   // names only
      if (cf.status === 'fulfilled' && cf.value) { S.names = cf.value.names || {}; S.demo = !!cf.value.demo; }
    }
    async function loadItems() {
      try {
        const r = await SC.api('/studio/api/submitted');
        S.items = ((r && (r.items || r.queue)) || []).filter((x) => x && KINDS.includes(x.kind) && x.id != null).map((x) => ({ kind: x.kind, id: x.id, title: String(x.title || ''), titleEl: x.title_el ? String(x.title_el) : '', author: x.author_label || x.author || '', school: x.school || '', at: toMs(x.at || x.updatedAt), status: String(x.status || (staff() ? 'pending' : 'approved')).toLowerCase() }));
        S.err = null; S.at = Date.now();
      } catch (e) { S.err = e; }
    }
    async function loadAll() {
      await Promise.all([loadStatus(), loadSide()]);
      await loadItems();
      S.loaded = true;
    }

    /* ----- head, numbers ----- */
    function drawHead() {
      const st = staff();
      headHost.replaceChildren(SC.head({
        title: st ? t('Work waiting for a decision.', 'Εργασίες που περιμένουν απόφαση.') : t('Published student work.', 'Δημοσιευμένες εργασίες μαθητών.'),
        lede: st ? t('Tools, team projects, council sessions and reports sent for a decision, in one queue. Open one, look at it, then approve it or send it back with a note.', 'Εργαλεία, ομαδικά έργα, συνεδρίες συμβουλίου και αναφορές που στάλθηκαν για απόφαση, σε μία ουρά. Ανοίξτε μία, δείτε την και μετά εγκρίνετέ την ή στείλτε την πίσω με σημείωμα.')
          : t('Tools, projects, council sessions and reports that teachers checked and approved. Anyone can open them, no sign-in needed.', 'Εργαλεία, έργα, συνεδρίες συμβουλίου και αναφορές που έλεγξαν και ενέκριναν εκπαιδευτικοί. Μπορεί να τα ανοίξει οποιοσδήποτε, χωρίς σύνδεση.'),
        fresh: S.at ? t('Updated ' + SC.ago(S.at), 'Ενημερώθηκε ' + SC.ago(S.at)) : null,
        tags: S.demo ? [{ text: t('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        help: st ? [
          'Everything students and the report builder send for a decision arrives here. Use the filters to look at one kind or one school. Pick an item to see its preview. Tick the check box to say you looked at it, then approve it. To send it back, write a short note: the team can read it. Reports are released with one press and can be withdrawn again.',
          'Ό,τι στέλνουν οι μαθητές και ο δημιουργός αναφορών για απόφαση φτάνει εδώ. Χρησιμοποιήστε τα φίλτρα για να δείτε ένα είδος ή ένα σχολείο. Διαλέξτε ένα στοιχείο για να δείτε την προεπισκόπησή του. Επιλέξτε το πλαίσιο ότι το κοιτάξατε και μετά εγκρίνετέ το. Για να το στείλετε πίσω, γράψτε ένα σύντομο σημείωμα: η ομάδα μπορεί να το διαβάσει. Οι αναφορές δημοσιεύονται με ένα πάτημα και μπορούν να αποσυρθούν ξανά.',
        ] : [
          'This page shows work that a teacher approved: student tools, team projects, council sessions and weekly reports. Press Open to look at one. Nothing appears here until a teacher says yes. Teachers sign in to decide on new work.',
          'Αυτή η σελίδα δείχνει εργασίες που ενέκρινε εκπαιδευτικός: εργαλεία μαθητών, ομαδικά έργα, συνεδρίες συμβουλίου και εβδομαδιαίες αναφορές. Πατήστε «Άνοιγμα» για να δείτε μία. Τίποτα δεν εμφανίζεται εδώ αν δεν πει ναι ένας εκπαιδευτικός. Οι εκπαιδευτικοί συνδέονται για να αποφασίσουν για νέες εργασίες.',
        ],
      }));
    }
    const count = (k, f) => S.items.filter((x) => (k === 'all' || x.kind === k) && (!f || f(x))).length;
    function drawStats() {
      if (!S.loaded || S.err) { statsHost.replaceChildren(); return; }
      const st = staff();
      const base = st ? S.items.filter((x) => !isDecided(x)) : S.items;
      const parts = [[base.length, st ? t('waiting', 'σε αναμονή') : (base.length === 1 ? t('published piece', 'δημοσιευμένο στοιχείο') : t('published pieces', 'δημοσιευμένα στοιχεία'))],
        ...KINDS.map((k) => { const n = base.filter((x) => x.kind === k).length; return [n, (n === 1 ? kname(k) : kplural(k)).toLowerCase()]; })];
      statsHost.replaceChildren(el('div', { class: 'sb-stats', role: 'group', 'aria-label': t('Work in numbers', 'Οι εργασίες σε αριθμούς') },
        ...parts.flatMap(([n, label], i) => [i ? el('span', { class: 'sep', 'aria-hidden': 'true' }) : null, el('span', null, el('b', null, String(n)), ' ' + label)]).filter(Boolean)));
    }

    /* ================= teachers ================= */
    const shown = () => S.items.filter((x) => (S.kind === 'all' || x.kind === S.kind) && (S.school === 'all' || x.school === S.school))
      .sort((a, b) => a.at - b.at);   // the one waiting longest on top
    const curItem = () => S.items.find((x) => key(x) === S.cur) || null;
    function pickDefault() {
      const list = shown();
      if (!list.some((x) => key(x) === S.cur)) S.cur = list[0] ? key(list[0]) : null;
    }

    function badgeOf(it) {
      const s = it.status;
      if (['approved', 'published', 'released'].includes(s)) return el('span', { class: 'nm-badge nm-badge--ok' }, ic('check'), s === 'released' ? t('Released', 'Δημοσιεύτηκε') : s === 'published' ? t('Published', 'Δημοσιεύτηκε') : t('Approved', 'Εγκρίθηκε'));
      if (['rejected', 'sent_back'].includes(s)) return el('span', { class: 'nm-badge nm-badge--bad' }, t('Sent back', 'Επιστράφηκε'));
      if (s === 'withdrawn') return el('span', { class: 'nm-badge' }, t('Withdrawn', 'Αποσύρθηκε'));
      return el('span', { class: 'nm-badge nm-badge--warn' }, t('Waiting', 'Σε αναμονή'));
    }
    function kindTile(k) { return el('span', { class: 'sb-kt', style: '--kc:' + KIND[k].color, title: kname(k) }, ic(KIND[k].icon)); }

    function drawTeacher() {
      pickDefault();
      const schools = Array.from(new Set(S.items.map((x) => x.school).filter(Boolean))).sort();
      if (S.school !== 'all' && !schools.includes(S.school)) S.school = 'all';
      const base = S.items.filter((x) => S.school === 'all' || x.school === S.school);
      const kinds = [['all', t('All', 'Όλα'), base.length], ...KINDS.map((k) => [k, kplural(k), base.filter((x) => x.kind === k).length])];
      const sel = el('select', { class: 'nm-input sb-sel', 'aria-label': t('School', 'Σχολείο'), onchange: (e) => { S.school = e.target.value; drawTeacher(); } },
        el('option', { value: 'all' }, t('All schools', 'Όλα τα σχολεία')), ...schools.map((s) => el('option', { value: s, selected: s === S.school }, s)));
      const bar = el('div', { class: 'sb-filters' },
        el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': t('Kind of work', 'Είδος εργασίας') }, kinds.map(([id, label, n]) => el('button', { type: 'button', class: S.kind === id ? 'on' : '', 'aria-pressed': S.kind === id ? 'true' : 'false', onclick: () => { S.kind = id; drawTeacher(); } }, label + ' ' + n))),
        schools.length > 1 ? sel : null);
      const list = shown();
      const queue = el('section', { class: 'nm-card sb-queue', 'aria-label': t('Queue', 'Ουρά') },
        el('div', { class: 'sb-qh' }, el('h2', null, t('Queue', 'Ουρά'), el('span', null, '·'), String(list.length))),
        list.length ? el('ul', { class: 'sb-qlist' }, list.map((it) => el('li', null, el('button', { type: 'button', class: 'sb-row' + (key(it) === S.cur ? ' on' : ''), 'aria-current': key(it) === S.cur ? 'true' : null, 'data-k': key(it), onclick: () => select(it) },
          kindTile(it.kind),
          el('span', { class: 'sb-rx' }, el('b', null, ttl(it) || kname(it.kind)),
            el('small', null, kname(it.kind) + (it.author ? ' · ' + it.author : '') + (it.at ? ' · ' + SC.ago(it.at) : ''))),
          badgeOf(it)))))
          : el('div', { class: 'empty sb-empty' }, el('b', { style: { display: 'block', color: 'var(--nm-ink-soft)' } }, S.items.length ? t('Nothing matches these filters.', 'Τίποτα δεν ταιριάζει με αυτά τα φίλτρα.') : t('Nothing is waiting. All clear.', 'Τίποτα δεν περιμένει. Όλα καθαρά.')),
            S.items.length ? t('Choose All, or another kind or school.', 'Επιλέξτε «Όλα» ή άλλο είδος ή σχολείο.') : t('New work shows up here when a team presses Send to teacher, a council session is put forward, or a report is made.', 'Νέες εργασίες εμφανίζονται εδώ όταν μια ομάδα πατήσει «Αποστολή στον εκπαιδευτικό», όταν προταθεί μια συνεδρία συμβουλίου ή όταν φτιαχτεί μια αναφορά.')));
      const detail = el('section', { class: 'nm-card nm-card--glow sb-detail', id: 'sb-detail', 'aria-label': t('Preview and decision', 'Προεπισκόπηση και απόφαση') });
      bodyHost.replaceChildren(el('div', { class: 'nm-callout sb-callout' }, ic('shield'), el('span', null, el('b', null, t('You decide here.', 'Εσείς αποφασίζετε εδώ.')), ' ' + t('Nothing is public until a teacher says yes. Notes you write are read by the team.', 'Τίποτα δεν γίνεται δημόσιο αν δεν πει ναι ένας εκπαιδευτικός. Τα σημειώματά σας τα διαβάζει η ομάδα.'))),
        bar, el('div', { class: 'sb-split' }, queue, detail), ...[logCard()].filter(Boolean));
      drawDetail();
      drawStats();
    }
    function logCard() {
      if (!S.log.length) return null;
      return el('section', { class: 'nm-card sb-log', 'aria-label': t('Decided in this visit', 'Αποφάσεις σε αυτή την επίσκεψη') }, el('div', { class: 'sb-eb' }, t('Decided in this visit', 'Αποφάσεις σε αυτή την επίσκεψη')),
        el('ul', null, S.log.slice(0, 8).map((l) => el('li', null, kindTile(l.kind), el('span', null, el('b', null, l.title), el('small', null, l.text + ' · ' + SC.time(l.at)))))));
    }
    function select(it) {
      S.cur = key(it);
      drawTeacher();
      const row = bodyHost.querySelector('.sb-row.on'); if (row) row.focus({ preventScroll: true });
      if (matchMedia('(max-width: 1000px)').matches) { const d = document.getElementById('sb-detail'); if (d) d.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
    }

    /* ----- details of one item ----- */
    async function fetchDetail(it) {
      if (it.kind === 'tool') { const r = await SC.api('/studio/api/projects/' + it.id); return r.project || r; }
      if (it.kind === 'plan') {
        for (const scope of ['review', 'public']) {
          try { const r = await SC.api('/studio/api/plans?scope=' + scope); const p = (r.plans || []).find((x) => String(x.id) === String(it.id)); if (p) return p; } catch (e) { if (scope === 'public') throw e; }
        }
        const e = new Error(t('This project is no longer in the list. Someone may have decided already.', 'Αυτό το έργο δεν είναι πια στη λίστα. Ίσως κάποιος αποφάσισε ήδη.')); e.status = 404; throw e;
      }
      if (it.kind === 'council') { const r = await SC.api('/council/api/sessions/' + it.id); return r.session || r; }
      const r = await SC.api('/council/api/reports/' + it.id);
      return r.report || r;
    }
    async function loadDetail(it, force) {
      const k = key(it), c = S.detail.get(k);
      if (c && !force && c.state !== 'error') return;
      S.detail.set(k, { state: 'loading' }); if (S.cur === k) drawDetail();
      try { S.detail.set(k, { state: 'ok', data: await fetchDetail(it) }); } catch (e) { S.detail.set(k, { state: 'error', err: e }); }
      if (alive && S.cur === k) drawDetail();
    }

    // one labelled block of the preview
    const block = (label, ...kids) => el('div', { class: 'sb-blk' }, el('div', { class: 'sb-eb' }, label), ...kids);
    function previewTool(d) {
      const idea = d.idea && String(d.idea).trim();
      return [
        (d.flags || []).includes('coordinates') ? el('div', { class: 'nm-callout nm-callout--warn' }, ic('lock'), el('span', null, t('This page may contain an exact position. Look before you approve.', 'Αυτή η σελίδα ίσως περιέχει ακριβή θέση. Κοιτάξτε προτού εγκρίνετε.'))) : null,
        el('div', { class: 'sb-pvbar' }, el('span', { class: 'sb-pvtag' }, ic('lock'), t('Preview in a safe box, no internet', 'Προεπισκόπηση σε ασφαλές κουτί, χωρίς internet')), el('span', { class: 'sb-sp' }), el('a', { class: 'nm-btn nm-btn--sm', href: '/studio/p/' + d.id, target: '_blank', rel: 'noopener' }, ic('ext'), t('Open in a new tab', 'Άνοιγμα σε νέα καρτέλα'))),
        el('div', { class: 'sb-preview' }, el('iframe', { class: 'sb-frame', sandbox: 'allow-scripts', src: '/studio/p/' + d.id, title: t('Preview of ' + d.title, 'Προεπισκόπηση: ' + d.title), referrerpolicy: 'no-referrer' })),
        block(t('What the team asked for', 'Τι ζήτησε η ομάδα'), idea ? el('p', null, idea) : el('p', { class: 'muted' }, t('No description was saved.', 'Δεν αποθηκεύτηκε περιγραφή.'))),
      ];
    }
    function previewPlan(p) {
      const sens = (Array.isArray(p.sensors) ? p.sensors : []).map((s) => (typeof s === 'object' && s ? (S.devices.get(s.eui || s.id) || s.name) : S.devices.get(String(s))) || t('A sensor', 'Ένας αισθητήρας'));
      const data = (Array.isArray(p.data) ? p.data : []).map((x) => String(x && typeof x === 'object' ? x.id || x.key || x.mid || x.source || x.name : x)).filter((x) => !GPS.has(x)).map(dataName);
      const steps = (Array.isArray(p.steps) ? p.steps : []).map((s) => (typeof s === 'string' ? { label: s, done: false } : { label: String(s.label || s.title || s.text || s.name || ''), done: Boolean(s.done || s.complete || s.completed || s.status === 'done') })).filter((s) => s.label);
      const chips = (arr, kind) => (arr.length ? el('div', { class: 'sb-chips' }, arr.map((x) => el('span', { class: 'sb-chip' }, ic(kind), x))) : el('p', { class: 'muted' }, t('None chosen.', 'Δεν έχει επιλεγεί τίποτα.')));
      const notes = String(p.notes || p.note || '').trim();
      return [
        block(t('The question', 'Το ερώτημα'), el('p', { class: 'sb-big' }, String(p.question || p.title || ''))),
        el('div', { class: 'sb-two' }, block(t('Sensors', 'Αισθητήρες'), chips(sens, 'sensor')), block(t('Data', 'Δεδομένα'), chips(data, 'db'))),
        steps.length ? block(t('Steps', 'Βήματα'), el('ul', { class: 'sb-steps' }, steps.map((s) => el('li', { class: s.done ? 'done' : '' }, ic(s.done ? 'checkc' : 'x'), s.label)))) : null,
        block(t('Note from the team', 'Σημείωμα της ομάδας'), notes ? el('p', null, notes) : el('p', { class: 'muted' }, t('No note.', 'Χωρίς σημείωμα.'))),
      ];
    }
    const STANCE = { support: ['ok', 'Supports', 'Υποστηρίζει'], oppose: ['bad', 'Opposes', 'Αντιτίθεται'], mixed: ['warn', 'Mixed', 'Μεικτή στάση'] };
    const LEAN = { yes: ['ok', 'Yes', 'Ναι'], lean_yes: ['ok', 'Leans yes', 'Κλίνει προς το ναι'], unclear: ['warn', 'Unclear', 'Ασαφές'], lean_no: ['warn', 'Leans no', 'Κλίνει προς το όχι'], no: ['bad', 'No', 'Όχι'] };
    function previewCouncil(s) {
      const seats = Array.isArray(s.seats) ? s.seats : [];
      const ch = s.chair || {};
      const lean = LEAN[ch.lean] || null;
      const list = (a) => (Array.isArray(a) && a.length ? el('ul', { class: 'sb-bul' }, a.map((x) => el('li', null, typeof x === 'string' ? x : tx(x.text || x.label || x.name || '')))) : null);
      return [
        el('div', { class: 'nm-callout nm-callout--info' }, ic('sparkle'), el('span', null, el('b', null, t('AI role-play.', 'Παιχνίδι ρόλων με AI.')), ' ' + t('Every seat below is written by an AI from our public data. It is not a person and not an official opinion.', 'Κάθε θέση παρακάτω γράφτηκε από AI με βάση τα δημόσια δεδομένα μας. Δεν είναι πρόσωπο ούτε επίσημη γνώμη.'))),
        block(t('The question', 'Το ερώτημα'), el('p', { class: 'sb-big' }, String(s.question || s.title || ''))),
        seats.length ? block(t('The seats', 'Οι θέσεις'), el('ul', { class: 'sb-seats' }, seats.map((x) => { const st = STANCE[x.stance] || null; return el('li', null, el('div', { class: 'sb-seat-h' }, el('b', null, tx(x.name) || x.id || t('A seat', 'Μια θέση')), st ? el('span', { class: 'nm-badge nm-badge--' + st[0] }, t(st[1], st[2])) : null), el('p', null, x.failed ? t('This seat did not answer.', 'Αυτή η θέση δεν απάντησε.') : String(x.text || ''))); }))) : null,
        (ch.verdict || (ch.scores && ch.scores.length)) ? block(t('The Chair', 'Ο Πρόεδρος'),
          lean ? el('p', null, el('span', { class: 'nm-badge nm-badge--' + lean[0] }, t(lean[1], lean[2]))) : null,
          ch.verdict ? el('p', null, String(ch.verdict)) : null,
          Array.isArray(ch.scores) && ch.scores.length ? el('ul', { class: 'sb-scores' }, ch.scores.map((x) => el('li', null, el('b', null, String(x.option || '')), el('span', { class: 'sb-sc' }, String(x.score == null ? '' : x.score)), x.why ? el('small', null, String(x.why)) : null))) : null,
          ch.action ? el('div', null, el('div', { class: 'sb-eb sb-sub' }, t('Suggested next step', 'Προτεινόμενο επόμενο βήμα')), el('p', null, String(ch.action))) : null,
          list(ch.risks) ? el('div', null, el('div', { class: 'sb-eb sb-sub' }, t('Risks', 'Κίνδυνοι')), list(ch.risks)) : null,
          list(ch.needs) ? el('div', null, el('div', { class: 'sb-eb sb-sub' }, t('What it still needs', 'Τι χρειάζεται ακόμη')), list(ch.needs)) : null) : null,
        Array.isArray(s.gaps) && s.gaps.length ? block(t('Gaps in the data', 'Κενά στα δεδομένα'), list(s.gaps)) : null,
      ];
    }
    const pct = (x) => (x == null || isNaN(x) ? '-' : Math.round(x * 100) + '%');
    const num = (x) => (x == null || isNaN(x) ? '-' : String(Math.round(x * 10) / 10));
    function previewReport(r) {
      const ov = r.overall || {};
      const schools = Array.isArray(r.schools) ? r.schools : [];
      const sm = r.summary && typeof r.summary === 'object' ? r.summary : r.summary ? { en: String(r.summary) } : null;
      const text = sm ? String((SC.lang === 'el' ? sm.el || sm.en : sm.en || sm.el) || '').trim() : '';
      const notes = Array.isArray(r.notes) ? r.notes.filter(Boolean).slice(0, 6) : [];
      const warn = r.warnings && typeof r.warnings === 'object' ? r.warnings : null;
      return [
        el('div', { class: 'sb-meta' }, r.schoolName || r.school ? el('span', { class: 'sb-sch' }, el('i', { style: { background: schoolColor(r.schoolName || r.school) } }), String(r.schoolName || r.school)) : null,
          r.weekEnding ? el('span', null, t('Week ending ', 'Εβδομάδα που λήγει ') + r.weekEnding) : null, r.demo ? el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης')) : null),
        block(t('The numbers', 'Οι αριθμοί'), el('div', { class: 'sb-kv' },
          [[t('Sensors', 'Αισθητήρες'), ov.sensors == null ? '-' : String(ov.sensors)], [t('Online now', 'Σε σύνδεση τώρα'), ov.onlineNow == null ? t('this week only', 'μόνο η τρέχουσα εβδομάδα') : String(ov.onlineNow)], [t('Reporting share', 'Ποσοστό αναφοράς'), pct(ov.reportingShare)], [t('Met Office warnings saved', 'Αποθηκευμένες προειδοποιήσεις'), warn && warn.versions != null ? String(warn.versions) : '-']]
            .map(([k, v]) => el('div', null, el('b', { class: 'mono' }, v), el('small', null, k))))),
        ...schools.slice(0, 6).map((sc) => block(String(sc.short || sc.name || ''),
          Array.isArray(sc.measurements) && sc.measurements.length
            ? el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table sb-tab' }, el('thead', null, el('tr', null, [t('Reading', 'Μέτρηση'), t('Average', 'Μέσος όρος'), t('Lowest', 'Χαμηλότερη'), t('Highest', 'Υψηλότερη')].map((h) => el('th', { scope: 'col' }, h)))),
              el('tbody', null, sc.measurements.slice(0, 8).map((m) => el('tr', null, el('td', null, String(m.name || '')), el('td', { class: 'mono' }, num(m.avg) + (m.unit ? ' ' + m.unit : '')), el('td', { class: 'mono' }, num(m.min)), el('td', { class: 'mono' }, num(m.max)))))))
            : el('p', { class: 'muted' }, t('No sensor readings for this week.', 'Δεν υπάρχουν μετρήσεις αισθητήρων για αυτή την εβδομάδα.')))),
        notes.length ? block(t('Notes in the report', 'Σημειώσεις της αναφοράς'), el('ul', { class: 'sb-bul' }, notes.map((n) => el('li', null, String(n))))) : null,
        block(t('Summary', 'Περίληψη'), text ? el('div', { class: 'sb-sum' }, el('span', { class: 't ai' }, t('Assistant text', 'Κείμενο βοηθού')), ...paras(text)) : el('p', { class: 'muted' }, t('No summary was written. The numbers above are the report.', 'Δεν γράφτηκε περίληψη. Οι αριθμοί παραπάνω είναι η αναφορά.'))),
      ];
    }

    /* ----- the decision ----- */
    async function decide(it, decision, note, extra) {
      if (S.busy) return;
      S.busy = true; drawDetail();
      const url = it.kind === 'tool' ? '/studio/api/projects/' + it.id + '/review' : it.kind === 'plan' ? '/studio/api/plans/' + it.id + '/review' : it.kind === 'council' ? '/council/api/sessions/' + it.id + '/review' : '/council/api/reports/' + it.id + '/' + decision;
      const body = it.kind === 'report' ? (extra || {}) : { decision, note };
      try {
        await SC.api(url, { method: 'POST', body });
        const good = ['approve', 'publish', 'release'].includes(decision);
        const text = decision === 'withdraw' ? t('Withdrawn', 'Αποσύρθηκε') : good ? (it.kind === 'report' ? t('Released', 'Δημοσιεύτηκε') : it.kind === 'council' ? t('Published', 'Δημοσιεύτηκε') : t('Approved', 'Εγκρίθηκε')) : t('Sent back', 'Επιστράφηκε');
        S.log.unshift({ kind: it.kind, title: ttl(it) || kname(it.kind), text, at: Date.now() });
        S.detail.delete(key(it));
        const m = text + ': ' + (ttl(it) || kname(it.kind));
        SC.toast(m); live.textContent = m;
        S.busy = false;
        await loadItems();
        // the server may keep decided items in the queue or drop them; either way, move on to the next one waiting
        S.cur = null;
        if (alive) drawTeacher();
      } catch (e) {
        S.busy = false;
        if (e.status === 401 || e.status === 403) { S.err = e; drawBody(); return; }
        const m = e.status === 404 ? t('This one is no longer waiting. Someone may have decided already. The list will refresh.', 'Αυτό δεν περιμένει πια. Ίσως κάποιος αποφάσισε ήδη. Η λίστα θα ανανεωθεί.') : t('The decision was not saved: ', 'Η απόφαση δεν αποθηκεύτηκε: ') + errMsg(e);
        S.detail.set('err:' + key(it), m);
        if (e.status === 404) { await loadItems(); S.cur = null; if (alive) drawTeacher(); S.detail.set('err:' + key(it), m); return; }
        drawDetail();
      }
    }
    function decisionBox(it, d) {
      if (it.kind === 'report') {
        const hasSummary = (x) => Boolean(x && x.summary && (x.summary.en || x.summary.el || typeof x.summary === 'string'));
        const drop = el('input', { type: 'checkbox', id: 'sb-drop' });
        const released = ['released', 'approved', 'published'].includes(it.status) || ['released', 'published'].includes(String(d.status || '').toLowerCase());
        return el('div', { class: 'sb-decide' }, el('div', { class: 'sb-eb' }, t('Decision', 'Απόφαση')),
          el('p', { class: 'sb-hint' }, released ? t('This report is public. You can withdraw it.', 'Αυτή η αναφορά είναι δημόσια. Μπορείτε να την αποσύρετε.') : t('Releasing makes the report public for everyone. You can withdraw it later.', 'Η δημοσίευση κάνει την αναφορά δημόσια για όλους. Μπορείτε να την αποσύρετε αργότερα.')),
          released ? null : (hasSummary(d) ? el('label', { class: 'sb-sure', for: 'sb-drop' }, drop, el('span', null, t('Release the numbers only, without the assistant text.', 'Δημοσίευση μόνο των αριθμών, χωρίς το κείμενο του βοηθού.'))) : null),
          el('div', { class: 'sb-act' }, released ? el('button', { class: 'nm-btn', type: 'button', disabled: S.busy, onclick: () => decide(it, 'withdraw', '') }, ic('back'), t('Withdraw', 'Απόσυρση')) : el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: S.busy, onclick: () => decide(it, 'release', '', drop.checked ? { dropSummary: true } : {}) }, ic('send'), t('Release the report', 'Δημοσίευση της αναφοράς'))));
      }
      if (isDecided(it)) return el('div', { class: 'sb-decide' }, el('div', { class: 'nm-callout nm-callout--ok' }, t('This one was decided already.', 'Για αυτό έχει ήδη αποφασιστεί.')));
      const yes = it.kind === 'council' ? 'publish' : 'approve', no = it.kind === 'plan' ? 'send_back' : 'reject';
      const sure = el('input', { type: 'checkbox', id: 'sb-sure' });
      const note = el('textarea', { class: 'nm-input sb-note', id: 'sb-note', maxlength: 300, 'aria-label': t('Note to the team', 'Σημείωμα προς την ομάδα'), placeholder: t('Note to the team. They read it if you send this back.', 'Σημείωμα προς την ομάδα. Το διαβάζουν αν το στείλετε πίσω.') });
      const ok = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: true, onclick: () => decide(it, yes, note.value.trim()) }, ic('checkc'), it.kind === 'council' ? t('Publish', 'Δημοσίευση') : t('Approve and publish', 'Έγκριση και δημοσίευση'));
      const back = el('button', { class: 'nm-btn', type: 'button', disabled: true, onclick: () => decide(it, no, note.value.trim()) }, ic('back'), it.kind === 'council' ? t('Reject', 'Απόρριψη') : t('Send back', 'Επιστροφή'));
      const hint = el('p', { class: 'sb-hint' });
      const sync = () => {
        ok.disabled = S.busy || !sure.checked; back.disabled = S.busy || (it.kind !== 'council' && !note.value.trim());
        hint.textContent = !sure.checked ? t('Tick the box to approve. To send it back, write a short note for the team.', 'Επιλέξτε το πλαίσιο για να εγκρίνετε. Για να το στείλετε πίσω, γράψτε ένα σύντομο σημείωμα για την ομάδα.') : t('Ready. Approving makes it public for everyone straight away.', 'Έτοιμο. Η έγκριση το κάνει αμέσως δημόσιο για όλους.');
      };
      sure.addEventListener('change', sync); note.addEventListener('input', sync); sync();
      const lead = it.kind === 'tool' ? t('I looked at it: no names, photos or exact places, and the numbers match the data.', 'Το κοίταξα: χωρίς ονόματα, φωτογραφίες ή ακριβή σημεία και οι αριθμοί ταιριάζουν με τα δεδομένα.')
        : it.kind === 'plan' ? t('I read it: no names or exact places, and the question can be answered with data.', 'Το διάβασα: χωρίς ονόματα ή ακριβή σημεία και το ερώτημα απαντιέται με δεδομένα.')
          : t('I read it: it is labelled as AI role-play and shows no private details.', 'Το διάβασα: φέρει σήμανση παιχνιδιού ρόλων με AI και δεν δείχνει προσωπικά στοιχεία.');
      const msg = S.detail.get('err:' + key(it));
      return el('div', { class: 'sb-decide' }, el('div', { class: 'sb-eb' }, t('Decision', 'Απόφαση')),
        el('label', { class: 'sb-sure', for: 'sb-sure' }, sure, el('span', null, lead)), note, hint,
        msg ? el('div', { class: 'err', role: 'alert' }, msg) : null,
        el('div', { class: 'sb-act' }, ok, back));
    }

    function drawDetail() {
      const host = document.getElementById('sb-detail'); if (!host) return;
      const it = curItem();
      if (!it) { host.replaceChildren(el('div', { class: 'sb-none' }, el('span', { class: 'sb-bigtick', 'aria-hidden': 'true' }, ic('inbox')), el('h2', null, S.items.length ? t('Pick something from the queue.', 'Διαλέξτε κάτι από την ουρά.') : t('All clear.', 'Όλα καθαρά.')), el('p', { class: 'muted' }, S.items.length ? t('Its preview and the decision buttons appear here.', 'Η προεπισκόπηση και τα κουμπιά απόφασης εμφανίζονται εδώ.') : t('Nothing is waiting for you right now.', 'Τίποτα δεν περιμένει εσάς αυτή τη στιγμή.')))); return; }
      loadDetail(it);
      const c = S.detail.get(key(it)) || { state: 'loading' };
      const head = el('div', { class: 'sb-dh' }, el('div', { class: 'sb-dtags' }, kindTile(it.kind), el('span', { class: 'sb-eb cu' }, kname(it.kind)), badgeOf(it)),
        el('h2', { id: 'sb-dh' }, ttl(it) || kname(it.kind)),
        el('div', { class: 'sb-who' }, el('i', { style: { background: schoolColor(it.school) } }), el('span', null, [it.author, it.school && !String(it.author).includes(it.school) ? it.school : '', it.at ? t('sent ' + SC.ago(it.at), 'στάλθηκε ' + SC.ago(it.at)) : ''].filter(Boolean).join(' · '))));
      let body;
      if (c.state === 'loading') body = el('div', { class: 'loading' }, t('Loading the preview', 'Φόρτωση της προεπισκόπησης'));
      else if (c.state === 'error') body = el('div', null, el('div', { class: 'err', role: 'alert' }, t('The preview could not be loaded. ', 'Η προεπισκόπηση δεν φορτώθηκε. ') + errMsg(c.err)), el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: () => loadDetail(it, true) }, t('Try again', 'Δοκιμάστε ξανά'))));
      else {
        const d = c.data || {};
        const pv = it.kind === 'tool' ? previewTool(d.id != null ? d : Object.assign({ id: it.id, title: it.title }, d)) : it.kind === 'plan' ? previewPlan(d) : it.kind === 'council' ? previewCouncil(d) : previewReport(d);
        body = el('div', { class: 'sb-pv' }, ...pv, decisionBox(it, d));
      }
      host.replaceChildren(head, body);
    }

    /* ================= everyone else: the gallery ================= */
    function open(it) {
      if (it.kind === 'tool') { openViewer(it); return; }
      location.hash = it.kind === 'plan' ? '#/projects/' + encodeURIComponent(it.id) : it.kind === 'council' ? '#/council' : '#/reports';
    }
    function openViewer(it) {
      const prev = document.activeElement;
      const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
      const onKey = (e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'Tab') {
          const f = Array.from(box.querySelectorAll('a[href], button, iframe')).filter((n) => !n.disabled);
          if (!f.length) return;
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
        }
      };
      const x = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: close }, ic('x'), t('Close', 'Κλείσιμο'));
      const box = el('div', { class: 'sb-view nm-enter', role: 'dialog', 'aria-modal': 'true', 'aria-label': ttl(it) },
        el('div', { class: 'sb-view-h' }, el('div', { class: 'sb-view-t' }, el('h2', null, ttl(it)), el('div', { class: 'sb-who' }, el('i', { style: { background: schoolColor(it.school) } }), el('span', null, it.author || it.school))),
          el('a', { class: 'nm-btn nm-btn--sm', href: '/studio/p/' + it.id, target: '_blank', rel: 'noopener' }, ic('ext'), t('Open in a new tab', 'Άνοιγμα σε νέα καρτέλα')), x),
        el('div', { class: 'sb-view-f' }, el('iframe', { class: 'sb-frame', sandbox: 'allow-scripts', src: '/studio/p/' + it.id, title: ttl(it), referrerpolicy: 'no-referrer' })),
        el('p', { class: 'sb-view-n' }, ic('lock'), t('Runs in a safe box: no internet, no cookies. It can only read the delayed, rounded overview of the data.', 'Τρέχει σε ασφαλές κουτί: χωρίς internet, χωρίς cookies. Μπορεί να διαβάσει μόνο τη συνολική εικόνα των δεδομένων, με καθυστέρηση και στρογγυλοποίηση.')));
      const scrim = el('div', { class: 'sb-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
      document.body.append(scrim); document.addEventListener('keydown', onKey); x.focus();
    }
    function galCard(it) {
      return el('article', { class: 'sb-gc nm-lift', style: '--kc:' + KIND[it.kind].color },
        el('div', { class: 'sb-gt' }, kindTile(it.kind), el('span', { class: 'sb-eb' }, kname(it.kind)), el('span', { class: 'nm-badge nm-badge--ok sb-pub' }, ic('check'), t('Approved', 'Εγκρίθηκε'))),
        el('h3', null, ttl(it) || kname(it.kind)),
        el('div', { class: 'sb-who' }, el('i', { style: { background: schoolColor(it.school) } }), el('span', null, [it.author || t('A student team', 'Μια ομάδα μαθητών'), it.school && !String(it.author || '').includes(it.school) ? it.school : ''].filter(Boolean).join(' · '))),
        el('div', { class: 'sb-gf' }, el('span', { class: 'sb-when' }, it.at ? t('Approved ' + SC.date(it.at), 'Εγκρίθηκε ' + SC.date(it.at)) : ''),
          el('button', { class: 'nm-btn nm-btn--sm', type: 'button', 'aria-label': t('Open: ', 'Άνοιγμα: ') + (ttl(it) || kname(it.kind)), onclick: () => open(it) }, t('Open', 'Άνοιγμα'), ic(it.kind === 'tool' ? 'arrow' : 'ext'))));
    }
    function drawGallery() {
      const list = S.items.filter((x) => (S.kind === 'all' || x.kind === S.kind)).sort((a, b) => b.at - a.at);
      const kinds = [['all', t('All', 'Όλα'), S.items.length], ...KINDS.map((k) => [k, kplural(k), S.items.filter((x) => x.kind === k).length])];
      const pills = el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': t('Kind of work', 'Είδος εργασίας') }, kinds.map(([id, label, n]) => el('button', { type: 'button', class: S.kind === id ? 'on' : '', 'aria-pressed': S.kind === id ? 'true' : 'false', onclick: () => { S.kind = id; drawGallery(); } }, label + ' ' + n)));
      const main = el('div', { class: 'sb-gmain' }, S.items.length ? pills : null,
        list.length ? el('div', { class: 'sb-ggrid' }, list.map(galCard))
          : el('div', { class: 'empty' }, el('b', { style: { display: 'block', color: 'var(--nm-ink-soft)' } }, S.items.length ? t('Nothing of this kind yet.', 'Δεν υπάρχει ακόμη τίποτα από αυτό το είδος.') : t('Nothing is published yet.', 'Τίποτα δεν έχει δημοσιευτεί ακόμη.')),
            S.items.length ? t('Choose All to see everything.', 'Επιλέξτε «Όλα» για να δείτε τα πάντα.') : t('When a teacher approves a student tool, a team project, a council session or a report, it appears here. Students can make one in the Build studio.', 'Όταν ένας εκπαιδευτικός εγκρίνει ένα εργαλείο μαθητών, ένα ομαδικό έργο, μια συνεδρία συμβουλίου ή μια αναφορά, εμφανίζεται εδώ. Οι μαθητές μπορούν να φτιάξουν ένα στο Στούντιο.'),
            el('div', { style: { marginTop: '14px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' } }, el('a', { class: 'nm-btn', href: '#/studio' }, ic('pencil'), t('Build studio', 'Στούντιο')), el('a', { class: 'nm-btn', href: '#/start' }, ic('flag'), t('Start a project', 'Ξεκινήστε ένα έργο')))));
      const side = el('aside', { class: 'sb-gside' },
        el('section', { class: 'nm-card nm-card--glow sb-signin', 'aria-labelledby': 'sb-si-h' },
          el('span', { class: 'sb-tic' }, ic('shield')),
          el('h2', { id: 'sb-si-h' }, t('Teachers decide here', 'Εδώ αποφασίζουν οι εκπαιδευτικοί')),
          el('p', null, t('New tools, projects, council sessions and reports wait for a teacher. Teachers sign in to look at them and approve or send them back.', 'Τα νέα εργαλεία, έργα, συνεδρίες συμβουλίου και αναφορές περιμένουν έναν εκπαιδευτικό. Οι εκπαιδευτικοί συνδέονται για να τα δουν και να τα εγκρίνουν ή να τα στείλουν πίσω.')),
          el('a', { class: 'nm-btn nm-btn--primary', href: '#/approvals' }, ic('lock'), t('Teacher sign-in', 'Σύνδεση εκπαιδευτικών')),
          el('p', { class: 'sb-visitor' }, t('Just looking? You never need to sign in to open what is published.', 'Απλώς κοιτάτε; Δεν χρειάζεται ποτέ να συνδεθείτε για να ανοίξετε ό,τι έχει δημοσιευτεί.'))),
        el('section', { class: 'nm-card sb-how', 'aria-labelledby': 'sb-how-h' }, el('div', { class: 'sb-eb' }, t('How work gets here', 'Πώς φτάνει η δουλειά εδώ')),
          el('ol', null, [[t('A team makes something', 'Μια ομάδα φτιάχνει κάτι'), t('A tool in the Build studio or a project plan.', 'Ένα εργαλείο στο Στούντιο ή ένα σχέδιο έργου.')], [t('It is sent to a teacher', 'Στέλνεται σε εκπαιδευτικό'), t('Nobody else can open it yet.', 'Κανείς άλλος δεν μπορεί να το ανοίξει ακόμη.')], [t('A teacher approves it', 'Το εγκρίνει εκπαιδευτικός'), t('Or sends it back with a note.', 'Ή το στέλνει πίσω με σημείωμα.')], [t('It appears on this page', 'Εμφανίζεται σε αυτή τη σελίδα'), t('Anyone can open it, no sign-in.', 'Μπορεί να το ανοίξει οποιοσδήποτε, χωρίς σύνδεση.')]].map(([h, s], i) => el('li', null, el('span', { class: 'num' }, String(i + 1)), el('div', null, el('b', null, h), el('small', null, s)))))));
      bodyHost.replaceChildren(el('div', { class: 'sb-gwrap' }, main, side));
      drawStats();
    }

    /* ----- put it together ----- */
    function drawBody() {
      if (!S.loaded) { bodyHost.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); return; }
      if (S.err) {
        const signed = S.err.status === 401 || S.err.status === 403;
        bodyHost.replaceChildren(el('div', null, el('div', { class: 'err', role: 'alert' }, (signed ? t('Your teacher session has ended. ', 'Η συνεδρία σας ως εκπαιδευτικού έληξε. ') : t('The list could not be loaded. ', 'Η λίστα δεν φορτώθηκε. ')) + errMsg(S.err)),
          el('div', { style: { marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' } }, el('button', { class: 'nm-btn', type: 'button', onclick: reload }, t('Try again', 'Δοκιμάστε ξανά')), signed ? el('a', { class: 'nm-btn nm-btn--primary', href: '#/approvals' }, ic('lock'), t('Teacher sign-in', 'Σύνδεση εκπαιδευτικών')) : null)));
        statsHost.replaceChildren();
        return;
      }
      if (staff()) drawTeacher(); else drawGallery();
    }
    function drawAll() { if (!alive) return; drawHead(); drawBody(); if (S.loaded && !S.err) drawStats(); }
    async function reload() {
      S.loaded = false; S.err = null; drawBody();
      await loadAll();
      if (alive) drawAll();
    }
    // A quiet look for new work. Nothing is redrawn while a teacher is writing a note or has a window open.
    async function tick() {
      if (document.hidden || S.busy || document.querySelector('.sb-scrim')) return;
      if (root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      const before = S.items.map(key).join('|');
      await loadItems();
      if (!alive || before === S.items.map(key).join('|')) return;
      if (S.loaded && !S.err) { if (staff()) drawTeacher(); else drawGallery(); drawHead(); }
    }

    drawHead(); drawBody();
    return (async () => {
      await loadAll();
      if (!alive) return () => {};
      drawAll();
      timer = setInterval(tick, 60000);
      return () => { alive = false; clearInterval(timer); stopBridge(); const s = document.querySelector('.sb-scrim'); if (s) s.remove(); };
    })();
  }

  SC.register('submitted', {
    title: ['Submitted work', 'Υποβολές'],
    render(root, ctx) {
      SC.css('/site/pages/submitted.css');
      return submitted(root, ctx);
    },
  });
})();
