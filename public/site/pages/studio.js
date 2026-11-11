/* Build studio: a public gallery of approved student tools, and a place for a class team (or a signed-in teacher) to build one.
   Students need no account: the teacher gives the class code, the team picks a team name, drafts stay in this browser (localStorage)
   until "Send to teacher". Teachers then approve them on the Approvals page.
   API: GET /studio/api/status, GET /studio/api/projects?scope=gallery|mine, POST /studio/api/class, POST /studio/api/class/leave,
        POST /studio/api/build (streamed, one JSON object per line), POST /studio/api/preview, POST /studio/api/projects/submit,
        POST /studio/api/projects/:id/(submit|delete), GET /studio/api/projects/:id, pages at /studio/p/:id and /studio/preview/:token. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;

  const KEY = 'sc.studio.drafts.v1', TEAM_KEY = 'sc.studio.team';
  const MAX_DRAFTS = 20, MAX_TEXT = 600;

  /* ---------- small icons (static strings only) ---------- */
  const ICON = {
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- the studio's working words (the server sends tool names while it works) ---------- */
  const WORK = {
    get_vehicles: ['Looking at the vehicles', 'Εξετάζω τα οχήματα'], get_vehicle_history: ['Reading sensor history', 'Διαβάζω το ιστορικό των αισθητήρων'],
    get_vehicle_trip: ['Checking the route', 'Ελέγχω τη διαδρομή'], get_vehicle_series: ['Reading a sensor series', 'Διαβάζω μια σειρά μετρήσεων'],
    get_forecast_model_now: ['Checking the weather model', 'Ελέγχω το μοντέλο καιρού'], get_met_office_now: ['Checking Met Office stations', 'Ελέγχω τους σταθμούς της Μετεωρολογικής Υπηρεσίας'],
    get_met_office_history: ['Reading Met Office history', 'Διαβάζω το ιστορικό της Μετεωρολογικής Υπηρεσίας'], get_met_office_text: ['Reading the Met Office pages', 'Διαβάζω τις σελίδες της Μετεωρολογικής Υπηρεσίας'],
    search_handbook: ['Searching the handbook', 'Ψάχνω στο εγχειρίδιο'], save_project: ['Writing the page', 'Γράφω τη σελίδα'],
    list_my_projects: ['Looking at your pages', 'Κοιτάζω τις σελίδες σας'], get_project: ['Reading your page', 'Διαβάζω τη σελίδα σας'], submit_project: ['Sending the page', 'Στέλνω τη σελίδα'],
  };
  const working = (name) => (WORK[name] ? t(WORK[name][0], WORK[name][1]) : t('Working on it', 'Δουλεύω πάνω σε αυτό'));

  const TRIES = [
    ['Compare my school with the airport station', 'Σύγκρινε το σχολείο μου με τον σταθμό του αεροδρομίου'],
    ['Is the bus air worse than the air outside?', 'Είναι χειρότερος ο αέρας στο λεωφορείο από τον αέρα έξω;'],
    ['Map of the windiest hour', 'Χάρτης της πιο θυελλώδους ώρας'],
  ];

  /* ---------- helpers ---------- */
  const rid = () => Math.random().toString(36).slice(2, 8);
  const sameTeam = (a, b) => String(a || '').normalize('NFC').toLowerCase() === String(b || '').normalize('NFC').toLowerCase();
  const kb = (n) => Math.round(n / 1000);
  function ago(ms) { return ms ? SC.ago(ms) : ''; }
  function schoolColor(short) {
    const s = String(short || '').toLowerCase();
    return /larn/.test(s) ? 'var(--nm-c1)' : /lefk|nicos/.test(s) ? 'var(--nm-c2)' : /lima/.test(s) ? 'var(--nm-c3)' : /paph|pafo/.test(s) ? 'var(--nm-c4)' : 'var(--nm-c5)';
  }
  // A plain picture for a card. It is decoration only (bars from the tool's number), it never shows data.
  function thumb(seed, color) {
    let x = (Number(String(seed).replace(/\D/g, '')) * 2654435761 + 12345) >>> 0 || 99991;
    const next = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
    const svg = SC.svgEl('svg', { viewBox: '0 0 200 98', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.append(SC.svgEl('path', { d: 'M0 70 C40 50 70 80 110 56 S170 48 200 38 V98 H0Z', fill: '#fff', 'fill-opacity': '.07' }));
    for (let i = 0; i < 9; i++) { const h = 16 + next() * 52; svg.append(SC.svgEl('rect', { x: 14 + i * 20, y: 88 - h, width: 12, height: h, rx: 4, fill: '#fff', 'fill-opacity': (0.3 + next() * 0.4).toFixed(2) })); }
    const box = el('div', { class: 'sd-th', 'aria-hidden': 'true', style: { '--sc': color || 'var(--nm-c5)' } }, svg);
    return box;
  }
  const galleryLabel = (p) => (p.team ? t('Team ' + p.team, 'Ομάδα ' + p.team) : t('A student team', 'Μια ομάδα μαθητών')) + (p.school ? ' · ' + p.school : '');   // never a person's name
  function paras(text) { return String(text || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean).map((s) => el('p', null, s)); }
  const errMsg = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');

  // Why a call failed, in the site's language where the server gave a code.
  function why(e, kind) {
    const code = e && e.body && e.body.code, st = e && e.status;
    if (st === 0) return e.message;
    if (st === 401 && code === 'class') return t('Your class session has ended. Enter the class code again. Your drafts are still in this browser.', 'Η συνεδρία της τάξης έληξε. Βάλτε ξανά τον κωδικό τάξης. Τα προσχέδιά σας είναι ακόμη σε αυτό το πρόγραμμα περιήγησης.');
    if (st === 503 || code === 'not_configured') return t('The Build studio is not switched on yet. Ask your teacher or an admin.', 'Το στούντιο δεν έχει ενεργοποιηθεί ακόμη. Ρωτήστε τον εκπαιδευτικό σας ή έναν διαχειριστή.');
    if (st === 413) return t('The page is too big. Ask for a smaller one.', 'Η σελίδα είναι πολύ μεγάλη. Ζητήστε μια μικρότερη.');
    if (st === 429) {
      const m = {
        rate: t('You are going fast. Wait a minute, then try again.', 'Πάτε πολύ γρήγορα. Περιμένετε ένα λεπτό και δοκιμάστε ξανά.'),
        school_daily: t('Your school used its builds for today. They come back during the day.', 'Το σχολείο σας χρησιμοποίησε τις δημιουργίες του για σήμερα. Επιστρέφουν μέσα στη μέρα.'),
        ip_daily: t('This network used its builds for today. They come back during the day.', 'Αυτό το δίκτυο χρησιμοποίησε τις δημιουργίες του για σήμερα. Επιστρέφουν μέσα στη μέρα.'),
        daily: t('You used your builds for today. They come back during the day.', 'Χρησιμοποιήσατε τις δημιουργίες σας για σήμερα. Επιστρέφουν μέσα στη μέρα.'),
        global: t('The Build studio is resting because the whole project used its daily limit. Try again later.', 'Το στούντιο ξεκουράζεται επειδή όλο το έργο χρησιμοποίησε το ημερήσιο όριό του. Δοκιμάστε αργότερα.'),
        team_pending: t('Your team already has 3 pages waiting for a teacher. Wait for a review, or withdraw one from In review.', 'Η ομάδα σας έχει ήδη 3 σελίδες που περιμένουν έναν εκπαιδευτικό. Περιμένετε έλεγχο ή αποσύρετε μία από τις «Σε έλεγχο».'),
        pending_full: t('Your school already has many pages waiting. Ask your teacher to review them first.', 'Το σχολείο σας έχει ήδη πολλές σελίδες σε αναμονή. Ζητήστε από τον εκπαιδευτικό σας να τις ελέγξει πρώτα.'),
      };
      if (m[code]) return m[code];
      return e.message;
    }
    if (SC.lang === 'el' && kind === 'build') return 'Το στούντιο δεν μπόρεσε να απαντήσει τώρα. Δοκιμάστε ξανά σε λίγο.';
    return errMsg(e);
  }

  /* ---------- drafts kept in this browser ---------- */
  function readDrafts() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      return j && Array.isArray(j.drafts) ? j.drafts.filter((d) => d && d.id && typeof d.html === 'string' && typeof d.title === 'string') : [];
    } catch (e) { return []; }
  }
  function writeDrafts(list) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, drafts: list.slice(0, MAX_DRAFTS) })); return true; } catch (e) { return false; }
  }

  /* ---------- a sandboxed page asks the site for the live overview ---------- */
  function bridge() {
    let cache = null, at = 0;
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.type !== 'cities-get') return;
      if (!Array.from(document.querySelectorAll('iframe.sd-frame')).some((f) => f.contentWindow === e.source)) return;
      const reply = (o) => { o.type = 'cities-result'; o.id = d.id; e.source.postMessage(o, '*'); };
      if (d.what !== 'overview') return reply({ error: 'Unknown data request.' });
      if (cache && Date.now() - at < 60000) return reply({ data: cache });
      SC.api('/cities/api/overview').then((o) => { cache = o; at = Date.now(); reply({ data: o }); }).catch(() => reply({ error: 'Could not load the data.' }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }

  /* ---------- a published tool in a big sandboxed window ---------- */
  function openViewer(p, label, badge) {
    const prev = document.activeElement;
    const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') {   // keep the focus inside the window
        const f = Array.from(box.querySelectorAll('a[href], button, iframe')).filter((n) => !n.disabled);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      }
    };
    const x = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: close }, ic('x'), t('Close', 'Κλείσιμο'));
    const box = el('div', { class: 'sd-view nm-enter', role: 'dialog', 'aria-modal': 'true', 'aria-label': p.title },
      el('div', { class: 'sd-view-h' },
        el('div', { class: 'sd-view-t' }, el('h2', null, p.title), el('div', { class: 'sd-who' }, el('i', { style: { background: schoolColor(p.school) } }), el('span', null, label), badge || null)),
        el('a', { class: 'nm-btn nm-btn--sm', href: '/studio/p/' + p.id, target: '_blank', rel: 'noopener' }, ic('ext'), t('Open in a new tab', 'Άνοιγμα σε νέα καρτέλα')), x),
      el('div', { class: 'sd-view-f' }, el('iframe', { class: 'sd-frame', sandbox: 'allow-scripts', src: '/studio/p/' + p.id, title: p.title, referrerpolicy: 'no-referrer' })),
      el('p', { class: 'sd-view-n' }, ic('lock'), t('Runs in a safe box: no internet, no cookies. It can only read the delayed, rounded overview of the data.', 'Τρέχει σε ασφαλές κουτί: χωρίς internet, χωρίς cookies. Μπορεί να διαβάσει μόνο τη συνολική εικόνα των δεδομένων, με καθυστέρηση και στρογγυλοποίηση.')));
    const scrim = el('div', { class: 'sd-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, box);
    document.body.append(scrim);
    document.addEventListener('keydown', onKey);
    x.focus();
  }

  /* ================= the page ================= */
  function studio(root) {
    const S = {
      status: null, statusErr: null, gallery: [], galErr: null, mine: [], mineErr: null, loaded: false,
      drafts: readDrafts(), cur: null, convo: [], mode: 'update', building: false, work: '', reply: null, buildErr: null, ctrl: null,
      preview: { state: 'none' }, joinErr: '', joinBusy: false, tick: 0,
    };
    let alive = true, timer = 0;
    const stopBridge = bridge();
    const outside = { fn: null };
    const onDoc = (e) => { if (outside.fn) outside.fn(e); };
    document.addEventListener('click', onDoc);

    const V = () => (S.status && S.status.viewer) || { kind: 'visitor' };
    const isClass = () => V().kind === 'class';
    const isUser = () => V().kind === 'user';
    const canBuild = () => isClass() || isUser();
    const configured = () => !S.status || S.status.configured !== false;
    const maxHtml = () => (S.status && S.status.maxHtml) || 120000;
    const schoolName = () => (V().school ? V().school.short || V().school.name : '');
    const asTeam = () => t('Team ' + V().team + (schoolName() ? ', ' + schoolName() : ''), 'Ομάδα ' + V().team + (schoolName() ? ', ' + schoolName() : ''));

    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const headHost = el('div'), statsHost = el('div'), makerHost = el('section', { class: 'nm-card nm-card--glow sd-maker', 'aria-labelledby': 'sd-maker-h' });
    const workHost = el('div'), boardHost = el('div', { id: 'sd-board' });
    const ta = el('textarea', { class: 'nm-input sd-ta', id: 'sd-ta', maxlength: MAX_TEXT, rows: 4 });
    const counter = el('span', { class: 'sd-cc' });
    const codeIn = el('input', { class: 'nm-input', id: 'sd-code', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 40 });
    const teamIn = el('input', { class: 'nm-input', id: 'sd-team', type: 'text', autocomplete: 'off', maxlength: 30 });
    try { teamIn.value = SC.store.get(TEAM_KEY) || ''; } catch (e) { /* no storage */ }
    root.append(headHost, statsHost, makerHost, workHost, boardHost, live);

    /* ----- what the viewer owns ----- */
    const myLocal = () => S.drafts.filter((d) => isClass() && V().school && d.school === V().school.slug && sameTeam(d.team, V().team)).sort((a, b) => b.at - a.at);
    const pendingMine = () => S.mine.filter((p) => p.status === 'pending');
    const rejectedMine = () => S.mine.filter((p) => p.status === 'rejected' && !S.drafts.some((d) => d.fromId === p.id));
    const serverDrafts = () => (isUser() ? S.mine.filter((p) => p.status === 'draft') : []);
    const draftCount = () => myLocal().length + serverDrafts().length + rejectedMine().length;

    function persist() { if (!writeDrafts(S.drafts)) SC.toast(t('This browser could not keep the draft. Free some space or use another browser.', 'Αυτό το πρόγραμμα περιήγησης δεν μπόρεσε να κρατήσει το προσχέδιο. Ελευθερώστε χώρο ή χρησιμοποιήστε άλλο.')); }

    /* ----- limits ----- */
    function limitInfo() {
      const L = S.status && S.status.limits; if (!L) return null;
      const parts = [['build', L.build], ['school', L.school], ['ip', L.ip], ['global', L.global]].filter(([, v]) => v && typeof v.left === 'number');
      if (!parts.length) return null;
      const b = parts.reduce((m, x) => (!m || x[1].left < m[1].left ? x : m), null);
      return { left: L.buildsLeft != null ? L.buildsLeft : b[1].left, of: b[1].perDay, scope: b[0], resetsAt: b[1].resetsAt };
    }
    const scopeText = (s) => ({ school: t('for your school', 'για το σχολείο σας'), ip: t('on this network', 'σε αυτό το δίκτυο'), global: t('for the whole project', 'για όλο το έργο'), build: t('for you', 'για εσάς') }[s] || '');

    /* ----- data ----- */
    const get = (u) => SC.api(u);
    async function loadStatus() {
      try { S.status = await get('/studio/api/status'); S.statusErr = null; } catch (e) { S.statusErr = e; }
    }
    async function loadMine() {
      if (!canBuild()) { S.mine = []; S.mineErr = null; return; }
      try { S.mine = (await get('/studio/api/projects?scope=mine')).projects || []; S.mineErr = null; } catch (e) { S.mineErr = e; if (e.status === 401) S.mine = []; }
    }
    async function loadGallery() {
      try { S.gallery = (await get('/studio/api/projects?scope=gallery')).projects || []; S.galErr = null; } catch (e) { S.galErr = e; }
    }
    async function loadAll() {
      await loadStatus();
      await Promise.all([loadGallery(), loadMine()]);
      S.loaded = true;
    }

    /* ----- head, stats ----- */
    function galleryBtn() {
      return el('button', { class: 'nm-btn nm-btn--sm sd-galbtn', type: 'button', onclick: () => { const bd = document.getElementById('sd-board'); if (bd) bd.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } }, ic('ext'), t('Open the public gallery', 'Άνοιγμα της δημόσιας συλλογής'));
    }
    function drawHead() {
      headHost.replaceChildren(SC.head({
        title: t('From an idea to a public tool.', 'Από μια ιδέα σε δημόσιο εργαλείο.'),
        lede: t('Describe a small tool in plain words. A draft is built from our live data. A teacher checks it, then anyone can open it.', 'Περιγράψτε ένα μικρό εργαλείο με απλά λόγια. Φτιάχνεται ένα προσχέδιο από τα ζωντανά μας δεδομένα. Ένας εκπαιδευτικός το ελέγχει και μετά μπορεί να το ανοίξει οποιοσδήποτε.'),
        tags: S.status && S.status.demo ? [{ text: t('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        actions: [galleryBtn()],
        help: [
          'Students build with the class code from their teacher and a team name: no account and no password. Describe a tool, the studio builds a draft, you preview it and change it, then send it to your teacher. Drafts stay in this browser until you send them. A teacher checks every tool before anyone else can open it. Approved tools are in the public gallery below.',
          'Οι μαθητές φτιάχνουν με τον κωδικό τάξης από τον εκπαιδευτικό τους και ένα όνομα ομάδας: χωρίς λογαριασμό και χωρίς κωδικό πρόσβασης. Περιγράφετε ένα εργαλείο, το στούντιο φτιάχνει ένα προσχέδιο, το βλέπετε και το αλλάζετε και μετά το στέλνετε στον εκπαιδευτικό σας. Τα προσχέδια μένουν σε αυτό το πρόγραμμα περιήγησης μέχρι να τα στείλετε. Ένας εκπαιδευτικός ελέγχει κάθε εργαλείο πριν το ανοίξει οποιοσδήποτε άλλος. Τα εγκεκριμένα εργαλεία είναι στη δημόσια συλλογή παρακάτω.',
        ],
      }));
    }
    function drawStats() {
      const items = [];
      if (canBuild()) {
        const n = draftCount(), w = pendingMine().length, tot = n + w + (S.galErr ? 0 : S.gallery.length);
        items.push([tot, tot === 1 ? t('tool', 'εργαλείο') : t('tools', 'εργαλεία')], [n, n === 1 ? t('draft', 'προσχέδιο') : t('drafts', 'προσχέδια')], [w, t('waiting for a teacher', 'περιμένουν εκπαιδευτικό')]);
      }
      items.push([S.galErr ? '–' : S.gallery.length, t('public', 'δημόσια')]);
      statsHost.replaceChildren(el('div', { class: 'sd-stats', role: 'group', 'aria-label': t('Tools in numbers', 'Τα εργαλεία σε αριθμούς') },
        ...items.flatMap(([n, label], i) => [i ? el('span', { class: 'sep', 'aria-hidden': 'true' }) : null, el('span', null, el('b', null, String(n)), ' ' + label)]).filter(Boolean)),
      el('div', { class: 'nm-callout nm-callout--info sd-open' }, ic('eye'), el('span', null, el('b', null, t('Anyone can open a published tool, no sign-in needed.', 'Οποιοσδήποτε μπορεί να ανοίξει ένα δημοσιευμένο εργαλείο, χωρίς σύνδεση.')), ' ' + t('Students build with their class code. Teachers sign in to approve.', 'Οι μαθητές φτιάχνουν με τον κωδικό τάξης. Οι εκπαιδευτικοί συνδέονται για να εγκρίνουν.'))));
    }

    /* ----- the maker ----- */
    async function joinClass() {
      if (S.joinBusy) return;
      const code = codeIn.value.trim(), team = teamIn.value.trim();
      S.joinErr = '';
      if (!code) { S.joinErr = t('Type the class code your teacher gave you.', 'Πληκτρολογήστε τον κωδικό τάξης που σας έδωσε ο εκπαιδευτικός.'); drawMaker(); codeIn.focus(); return; }
      if (!team) { S.joinErr = t('Type a team name.', 'Πληκτρολογήστε ένα όνομα ομάδας.'); drawMaker(); teamIn.focus(); return; }
      S.joinBusy = true; drawMaker();
      try {
        const r = await SC.api('/studio/api/class', { method: 'POST', body: { code, team } });
        SC.store.set(TEAM_KEY, r.team || team);
        codeIn.value = '';
        SC.toast(t('You are building as Team ' + r.team + '.', 'Φτιάχνετε ως Ομάδα ' + r.team + '.'));
        S.joinErr = '';
        await loadStatus(); await loadMine();
      } catch (e) {
        const code2 = e.body && e.body.code;
        S.joinErr = e.status === 403 && code2 === 'code' ? t('That class code is not right. Ask your teacher for the code.', 'Αυτός ο κωδικός τάξης δεν είναι σωστός. Ρωτήστε τον εκπαιδευτικό σας.')
          : e.status === 429 ? t('Too many wrong codes. Wait a few minutes, then ask your teacher for the code.', 'Πάρα πολλοί λάθος κωδικοί. Περιμένετε λίγα λεπτά και ρωτήστε τον εκπαιδευτικό σας.')
            : e.status === 400 && code2 === 'team' ? (SC.lang === 'el' ? 'Το όνομα ομάδας έχει έως 30 χαρακτήρες: μόνο γράμματα, αριθμοί, κενά και παύλες, και όχι αριθμός τηλεφώνου.' : e.message)
              : errMsg(e);
      }
      S.joinBusy = false;
      if (!alive) return;
      drawAll();
    }
    async function leaveClass() {
      try { await SC.api('/studio/api/class/leave', { method: 'POST', body: {} }); } catch (e) { /* the cookie ends by itself */ }
      S.cur = null; S.convo = []; S.reply = null; S.buildErr = null; S.preview = { state: 'none' }; ta.value = '';
      await loadStatus(); await loadMine();
      SC.toast(t('You left the class.', 'Αποχωρήσατε από την τάξη.'));
      if (alive) drawAll();
    }

    function gateForm() {
      const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'submit', disabled: S.joinBusy }, ic('lock'), t('Start building', 'Έναρξη δημιουργίας'));
      const f = el('form', { class: 'sd-gate', novalidate: true },
        el('div', { class: 'sd-gate-h' }, el('b', null, t('Step 0: join your class', 'Βήμα 0: μπείτε στην τάξη σας'))),
        el('p', { class: 'sd-hint' }, t('Your teacher gives you the class code. It is not a password and you do not need an account. Pick a team name your class will know. Do not use your real name.', 'Τον κωδικό τάξης τον δίνει ο εκπαιδευτικός σας. Δεν είναι κωδικός πρόσβασης και δεν χρειάζεστε λογαριασμό. Διαλέξτε ένα όνομα ομάδας που θα το γνωρίζει η τάξη σας. Μη χρησιμοποιήσετε το πραγματικό σας όνομα.')),
        el('div', { class: 'sd-fields' },
          el('div', { class: 'sd-field' }, el('label', { for: 'sd-code' }, t('Class code', 'Κωδικός τάξης')), codeIn),
          el('div', { class: 'sd-field' }, el('label', { for: 'sd-team' }, t('Team name', 'Όνομα ομάδας')), teamIn)),
        S.joinErr ? el('div', { class: 'err', role: 'alert' }, S.joinErr) : null,
        el('div', { class: 'sd-actions' }, go, el('a', { class: 'link', href: '#/approvals' }, t('Teachers: sign in to build with your account', 'Εκπαιδευτικοί: συνδεθείτε για να φτιάξετε με τον λογαριασμό σας'))));
      f.addEventListener('submit', (ev) => { ev.preventDefault(); joinClass(); });
      return f;
    }

    // The "Team: Hermes" pill by the Build button: it opens a small panel with who is building, the school and how long the class session lasts.
    function whoPill() {
      const v = V();
        const strip = el('div', { class: 'sd-as' }, el('span', { class: 'sd-tic' }, ic('user')),
          el('div', { class: 'sd-as-t' }, el('b', null, v.kind === 'class' ? t('Building as ', 'Φτιάχνετε ως ') + asTeam() : t('Building as ' + (S.status.user ? S.status.user.name : 'you') + (v.role === 'teacher' ? ' (teacher)' : v.role === 'admin' ? ' (admin)' : ''), 'Φτιάχνετε ως ' + (S.status.user ? S.status.user.name : 'εσείς') + (v.role === 'teacher' ? ' (εκπαιδευτικός)' : v.role === 'admin' ? ' (διαχειριστής)' : ''))),
            v.kind === 'class' && v.expiresAt ? el('small', null, t('This class session lasts until ' + SC.time(v.expiresAt) + '.', 'Αυτή η συνεδρία τάξης διαρκεί έως τις ' + SC.time(v.expiresAt) + '.')) : v.kind === 'user' ? el('small', null, t('Your drafts are saved to your account.', 'Τα προσχέδιά σας αποθηκεύονται στον λογαριασμό σας.')) : null),
          v.kind === 'class' ? el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: leaveClass }, t('Leave', 'Αποχώρηση')) : null);
      const name = v.kind === 'class' ? v.team : (S.status.user ? S.status.user.name : '');
      const pop = el('div', { class: 'sd-pop', role: 'group', 'aria-label': t('Who is building', 'Ποιος φτιάχνει'), hidden: true }, strip);
      const btn = el('button', { class: 'sd-pill', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, v.kind === 'class' ? t('Team: ', 'Ομάδα: ') : t('Signed in: ', 'Συνδεδεμένος: '), el('b', null, name), ic('chev'));
      const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
      btn.addEventListener('click', () => { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true'); });
      const wrap = el('div', { class: 'sd-pillw' }, btn, pop);
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { close(); btn.focus(); } });
      outside.fn = (e) => { if (!pop.hidden && !wrap.contains(e.target)) close(); };
      return wrap;
    }

    function buildForm() {
      const D = S.cur, lim = limitInfo();
      const out = lim && lim.left <= 0;
      const label = !D ? t('Describe a tool', 'Περιγράψτε ένα εργαλείο') : S.mode === 'rebuild' ? t('Your description. The draft is built again from it.', 'Η περιγραφή σας. Το προσχέδιο φτιάχνεται ξανά από αυτήν.') : t('What should change?', 'Τι να αλλάξει;');
      ta.setAttribute('aria-label', label);
      ta.placeholder = !D ? t('Say what you want to show and who it is for.', 'Πείτε τι θέλετε να δείξετε και για ποιον είναι.') : S.mode === 'rebuild' ? '' : t('For example: make the bars blue, or add the school name.', 'Για παράδειγμα: κάντε τις μπάρες μπλε ή προσθέστε το όνομα του σχολείου.');
      ta.disabled = S.building;
      const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: S.building || !configured() || out || !ta.value.trim() }, ic('sparkle'),
        !D ? t('Build a draft', 'Φτιάξτε ένα προσχέδιο') : S.mode === 'rebuild' ? t('Rebuild the draft', 'Ξαναφτιάξτε το προσχέδιο') : t('Update the draft', 'Ενημερώστε το προσχέδιο'));
      go.id = 'sd-go';
      go.addEventListener('click', build);
      const stop = el('button', { class: 'nm-btn', type: 'button', onclick: () => { if (S.ctrl) S.ctrl.abort(); } }, ic('stop'), t('Stop', 'Διακοπή'));
      const row = el('div', { class: 'sd-actions' }, S.building ? stop : go, S.building ? null : whoPill());
      if (D && !S.building) {
        if (S.mode === 'rebuild') row.append(el('button', { class: 'nm-btn nm-btn--ghost', type: 'button', onclick: () => { S.mode = 'update'; ta.value = ''; drawMaker(); ta.focus(); } }, t('Keep changing the draft', 'Συνεχίστε να αλλάζετε το προσχέδιο')));
        else if (D.prompt) row.append(el('button', { class: 'nm-btn nm-btn--ghost', type: 'button', onclick: () => { S.mode = 'rebuild'; ta.value = D.prompt.slice(0, MAX_TEXT); drawMaker(); ta.focus(); } }, ic('pencil'), t('Edit my description and rebuild', 'Αλλάξτε την περιγραφή και ξαναφτιάξτε')));
      }
      const tries = !D && !S.building ? el('div', { class: 'sd-tries' }, el('b', null, t('Try one', 'Δοκιμάστε ένα')), ...TRIES.map(([en, el2]) => el('button', { class: 'sd-try', type: 'button', onclick: () => { ta.value = t(en, el2); upd(); drawMaker(); ta.focus(); } }, t(en, el2).replace(/\.$/, '')))) : null;
      return el('div', null,
        el('label', { class: 'sd-lab' + (D ? '' : ' sr-only'), for: 'sd-ta' }, label), ta,
        el('div', { class: 'sd-below' }, el('span', null, t('Write it like you would tell a classmate. No names or personal details.', 'Γράψτε το όπως θα το λέγατε σε έναν συμμαθητή. Χωρίς ονόματα ή προσωπικά στοιχεία.')), counter),
        tries, row, statusBlock(), usageBlock(lim, out));
    }

    function statusBlock() {
      const box = el('div', { class: 'sd-state', 'aria-live': 'polite' });
      if (S.building) box.append(el('div', { class: 'sd-working' }, el('span', { class: 'sd-dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), el('span', null, S.work ? working(S.work) : t('Thinking about your tool', 'Σκέφτομαι το εργαλείο σας'))));
      else if (S.buildErr) box.append(el('div', { class: 'err', role: 'alert' }, S.buildErr));
      else if (S.reply) {
        const looked = Array.from(new Set((S.reply.tools || []).filter((x) => x !== 'save_project').map((x) => (WORK[x] ? t(WORK[x][0], WORK[x][1]) : x))));
        box.append(el('div', { class: 'sd-reply' }, el('div', { class: 'sd-eb' }, ic('sparkle'), t('The studio says', 'Το στούντιο λέει')), ...paras(S.reply.text),
        looked.length ? el('div', { class: 'sd-eb sd-tools' }, t('It looked at: ', 'Κοίταξε: ') + looked.join(', ')) : null));
      }
      return box;
    }
    function usageBlock(lim, out) {
      if (!lim) return null;
      const used = Math.max(0, lim.of - lim.left);
      const sub = isClass() && S.status.limits && S.status.limits.submissions ? S.status.limits.submissions : null;
      return el('div', { class: 'sd-usage' },
        el('span', { class: 'sd-meter', role: 'img', 'aria-label': t(lim.left + ' of ' + lim.of + ' builds left', 'Απομένουν ' + lim.left + ' από ' + lim.of + ' δημιουργίες') }, el('i', { style: { width: Math.max(2, Math.min(100, (lim.of ? used / lim.of : 0) * 100)) + '%' } })),
        el('span', null, el('b', null, t('Builds left today: ' + lim.left + ' of ' + lim.of, 'Απομένουν σήμερα: ' + lim.left + ' από ' + lim.of)), ' ' + scopeText(lim.scope) + '. ' + (out ? (lim.resetsAt ? t('More come back at ' + SC.time(lim.resetsAt) + '.', 'Επιστρέφουν περισσότερες στις ' + SC.time(lim.resetsAt) + '.') : '') : t('Teachers approve before a tool goes public.', 'Οι εκπαιδευτικοί εγκρίνουν πριν ένα εργαλείο γίνει δημόσιο.')),
          sub ? el('span', { class: 'muted' }, ' ' + t('Your team has ' + (sub.teamPendingMax - sub.teamPendingLeft) + ' of ' + sub.teamPendingMax + ' pages waiting.', 'Η ομάδα σας έχει ' + (sub.teamPendingMax - sub.teamPendingLeft) + ' από ' + sub.teamPendingMax + ' σελίδες σε αναμονή.')) : null));
    }

    function stepsPanel() {
      const stage = S.cur ? 2 : 1;
      const steps = [[t('Describe it', 'Περιγράψτε το'), t('You write what you want to see.', 'Γράφετε τι θέλετε να δείτε.')], [t('A draft is built', 'Φτιάχνεται προσχέδιο'), t('It runs in a safe box with no internet.', 'Τρέχει σε ασφαλές κουτί χωρίς internet.')],
        [t('A teacher approves', 'Εγκρίνει ένας εκπαιδευτικός'), t('Or sends it back with a note.', 'Ή το στέλνει πίσω με σημείωμα.')], [t('It joins the gallery', 'Μπαίνει στη συλλογή'), t('Anyone can open it, no sign-in.', 'Οποιοσδήποτε μπορεί να το ανοίξει, χωρίς σύνδεση.')]];
      return el('div', { class: 'sd-maker-r' },
        el('div', { class: 'sd-eb' }, t('How a tool goes public', 'Πώς γίνεται ένα εργαλείο δημόσιο')),
        el('ol', { class: 'sd-steps' }, steps.map(([h, s], i) => el('li', { class: 'sd-step' + (i + 1 === stage ? ' on' : ''), 'aria-current': i + 1 === stage ? 'step' : null }, el('span', { class: 'num' }, String(i + 1)), el('div', null, el('b', null, h), el('small', null, s))))),
        el('div', { class: 'nm-callout sd-safe' }, el('b', null, t('Every draft runs in a safe box.', 'Κάθε προσχέδιο τρέχει σε ασφαλές κουτί.')), ' ' + t('No internet, no cookies, ' + kb(maxHtml()) + ' KB at most. It can only read the delayed, rounded overview of the data.', 'Χωρίς internet, χωρίς cookies, έως ' + kb(maxHtml()) + ' KB. Μπορεί να διαβάσει μόνο τη συνολική εικόνα των δεδομένων, με καθυστέρηση και στρογγυλοποίηση.')));
    }

    function drawMaker() {
      const v = V();
      let who = null;
      if (S.statusErr && !S.status) {
        who = el('div', null, el('div', { class: 'err', role: 'alert' }, t('The studio could not be reached. ', 'Δεν έγινε σύνδεση με το στούντιο. ') + errMsg(S.statusErr)), el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: reload }, t('Try again', 'Δοκιμάστε ξανά'))));
      } else if (!S.loaded) who = el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'));
      else if (v.kind === 'visitor') who = gateForm();
      else {
        who = el('div', null, !configured() ? el('div', { class: 'nm-callout nm-callout--warn', style: { margin: '0 0 14px' } }, t('The Build studio is not switched on yet. You can still open the public gallery below. Ask your teacher or an admin to switch it on.', 'Το στούντιο δεν έχει ενεργοποιηθεί ακόμη. Μπορείτε να ανοίξετε τη δημόσια συλλογή παρακάτω. Ζητήστε από τον εκπαιδευτικό σας ή έναν διαχειριστή να το ενεργοποιήσει.')) : null, buildForm());
      }
      makerHost.replaceChildren(el('div', { class: 'sd-maker-l' }, el('div', { class: 'sd-eb cu' }, t('New tool', 'Νέο εργαλείο')), el('h2', { id: 'sd-maker-h' }, t('Describe a tool', 'Περιγράψτε ένα εργαλείο')),
        el('p', { class: 'sd-lede2' }, t('Say what you want to show and who it is for. The studio builds a draft from the same live readings you see on the City board. You can change it before you send it.', 'Πείτε τι θέλετε να δείξετε και για ποιον είναι. Το στούντιο φτιάχνει ένα προσχέδιο από τις ίδιες ζωντανές μετρήσεις που βλέπετε στον Πίνακα πόλης. Μπορείτε να το αλλάξετε πριν το στείλετε.')), who), stepsPanel());
      upd();
    }
    function upd() { counter.textContent = t(ta.value.length + ' of ' + MAX_TEXT, ta.value.length + ' από ' + MAX_TEXT); const g = document.getElementById('sd-go'); if (g) g.disabled = S.building || !configured() || !ta.value.trim() || (limitInfo() ? limitInfo().left <= 0 : false); }
    ta.addEventListener('input', upd);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build(); } });

    /* ----- building ----- */
    async function build() {
      const text = ta.value.trim();
      if (!text || S.building || !canBuild() || !configured()) return;
      const lim = limitInfo();
      if (lim && lim.left <= 0) { S.buildErr = t('No builds are left right now. ', 'Δεν απομένουν δημιουργίες αυτή τη στιγμή. ') + (lim.resetsAt ? t('More come back at ' + SC.time(lim.resetsAt) + '.', 'Επιστρέφουν περισσότερες στις ' + SC.time(lim.resetsAt) + '.') : ''); drawMaker(); return; }
      const D = S.cur, fresh = !D || S.mode === 'rebuild';
      const before = fresh ? [] : (D ? D.msgs : S.convo).slice(-8);
      const msgs = before.concat([{ role: 'user', text }]);
      const body = { messages: msgs.map((m) => ({ role: m.role, text: m.text })) };
      if (!fresh && D && isClass() && D.html) body.draft = { title: D.title, html: D.html };
      if (!fresh && D && D.serverId) body.messages[body.messages.length - 1].text = '(I am working on my saved page "' + D.title + '", project id ' + D.serverId + '.) ' + text;
      S.building = true; S.work = ''; S.reply = null; S.buildErr = null; S.ctrl = new AbortController();
      drawMaker();
      let draftEv = null, ans = null, errText = '', aborted = false, httpErr = null;
      try {
        const r = await fetch('/studio/api/build', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: S.ctrl.signal });
        if (!r.ok) {
          let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
          httpErr = { status: r.status, body: b, message: (b && b.error) || 'HTTP ' + r.status };
        } else {
          const reader = r.body.getReader(), dec = new TextDecoder();
          let buf = '', finished = false;
          const handle = (line) => {
            let ev; try { ev = JSON.parse(line); } catch (e) { return; }
            if (ev.type === 'tool') { S.work = ev.name; if (alive) { const w = makerHost.querySelector('.sd-working span:last-child'); if (w) w.textContent = working(ev.name); } }
            else if (ev.type === 'draft') draftEv = { title: ev.title, idea: ev.idea, html: ev.html };
            else if (ev.type === 'answer') ans = ev;
            else if (ev.type === 'error') errText = ev.message || '';
          };
          while (!finished) {
            const { value, done } = await reader.read();
            if (value) buf += dec.decode(value, { stream: true });
            finished = done;
            let i;
            while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(line); }
          }
          if (buf.trim()) handle(buf.trim());
        }
      } catch (e) {
        if (e && e.name === 'AbortError') aborted = true; else httpErr = { status: 0, message: t('No connection. Check your network and try again.', 'Δεν υπάρχει σύνδεση. Ελέγξτε το δίκτυό σας και δοκιμάστε ξανά.') };
      }
      S.building = false; S.ctrl = null; S.work = '';
      const finalDraft = (ans && ans.draft) || draftEv;
      let note = '', produced = false;
      if (finalDraft && finalDraft.html) {
        if (isClass()) {
          const d = (D || { id: 'd' + Date.now().toString(36) + rid(), school: V().school.slug, team: V().team, fromId: null, prompt: '', msgs: [] });
          if (!S.drafts.includes(d)) S.drafts.unshift(d);
          if (fresh || !d.prompt) d.prompt = text;
          d.title = finalDraft.title || d.title || t('My tool', 'Το εργαλείο μου'); d.html = finalDraft.html; d.at = Date.now();
          d.msgs = msgs.concat(ans ? [{ role: 'assistant', text: ans.text }] : []).slice(-10);
          S.cur = d; S.convo = []; produced = true;
          persist();
        }
      } else if (isUser() && ans && ans.projectId) {
        try {
          const r = await SC.api('/studio/api/projects/' + ans.projectId);
          const p = r.project;
          S.cur = { id: 's' + p.id, serverId: p.id, title: p.title, prompt: (D && !fresh ? D.prompt : text) || text, html: p.html || '', msgs: msgs.concat([{ role: 'assistant', text: ans.text }]).slice(-10), at: Date.now() };
          S.convo = []; produced = true;
          await loadMine();
        } catch (e) { note = t('The draft was saved, but it could not be opened here. Find it in Draft below.', 'Το προσχέδιο αποθηκεύτηκε, αλλά δεν άνοιξε εδώ. Βρείτε το στα Προσχέδια παρακάτω.'); }
      } else if (ans && ans.text) {
        // The studio asked a question or explained something: keep the conversation going.
        if (D && !fresh) D.msgs = msgs.concat([{ role: 'assistant', text: ans.text }]).slice(-10); else S.convo = msgs.concat([{ role: 'assistant', text: ans.text }]).slice(-10);
        if (D && isClass()) persist();
      }
      if (aborted) S.buildErr = t('Stopped. Your draft is unchanged.', 'Διακόπηκε. Το προσχέδιό σας δεν άλλαξε.');
      else if (httpErr) S.buildErr = why(httpErr, 'build');
      else if (errText) S.buildErr = SC.lang === 'el' ? 'Το στούντιο δεν μπόρεσε να απαντήσει τώρα. Δοκιμάστε ξανά σε λίγο.' : errText;
      else if (!ans && !finalDraft) S.buildErr = t('The studio did not send an answer. Try again.', 'Το στούντιο δεν έστειλε απάντηση. Δοκιμάστε ξανά.');
      else { S.reply = { text: (ans && ans.text) || note || t('Your draft is ready.', 'Το προσχέδιό σας είναι έτοιμο.'), tools: (ans && ans.tools) || [] }; ta.value = ''; S.mode = 'update'; if (note) S.reply.text = note; }
      if (httpErr && httpErr.status === 401 && httpErr.body && httpErr.body.code === 'class') { S.cur = null; await loadStatus(); await loadMine(); }
      live.textContent = S.buildErr || (S.reply ? t('The studio answered: ', 'Το στούντιο απάντησε: ') + S.reply.text.slice(0, 160) : '');
      if (!alive) return;
      loadStatus().then(() => { if (alive) { drawMaker(); drawStats(); } });
      drawAll();
      if (produced && S.cur) { makePreview(); const h = workHost.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
    }

    /* ----- the open draft: preview, title, send ----- */
    const W = { key: null, frame: null, state: null, title: null, send: null, meta: null, refresh: null, full: null, count: null };
    function drawWork() {
      const D = S.cur;
      if (!D) { W.key = null; W.frame = null; workHost.replaceChildren(); return; }
      if (W.key !== D.id) {
        W.key = D.id;
        W.frame = el('iframe', { class: 'sd-frame', sandbox: 'allow-scripts', title: t('Preview of your draft', 'Προεπισκόπηση του προσχεδίου σας'), referrerpolicy: 'no-referrer' });
        W.state = el('div', { class: 'sd-pv-state', role: 'status' });
        W.title = el('input', { class: 'nm-input', id: 'sd-title', type: 'text', maxlength: 80, value: D.title });
        W.title.addEventListener('input', () => { D.title = W.title.value; if (!D.serverId) persist(); syncWork(); });
        W.send = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: confirmSend }, ic('send'), isClass() ? t('Send to teacher', 'Αποστολή στον εκπαιδευτικό') : t('Send for review', 'Αποστολή για έλεγχο'));
        W.refresh = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: makePreview }, ic('refresh'), t('Refresh preview', 'Ανανέωση προεπισκόπησης'));
        W.full = el('a', { class: 'nm-btn nm-btn--sm', target: '_blank', rel: 'noopener', hidden: true }, ic('ext'), t('Open full screen', 'Άνοιγμα σε πλήρη οθόνη'));
        W.meta = el('p', { class: 'sd-meta' });
        const disc = el('button', { class: 'nm-btn nm-btn--danger-outline', type: 'button', onclick: () => confirmDiscard(D) }, ic('trash'), t('Discard this draft', 'Απόρριψη προσχεδίου'));
        workHost.replaceChildren(el('section', { class: 'nm-card nm-card--glow sd-work', 'aria-labelledby': 'sd-work-h' },
          el('div', { class: 'sd-work-l' },
            el('div', { class: 'sd-eb cu' }, t('Your draft', 'Το προσχέδιό σας')), el('h2', { id: 'sd-work-h' }, t('Preview and check', 'Προεπισκόπηση και έλεγχος')),
            el('div', { class: 'sd-pvbar' }, el('span', { class: 'sd-pvtag' }, ic('lock'), t('Preview in a safe box, no internet', 'Προεπισκόπηση σε ασφαλές κουτί, χωρίς internet')), el('span', { class: 'sd-sp' }), W.refresh, W.full),
            el('div', { class: 'sd-preview' }, W.frame, W.state)),
          el('div', { class: 'sd-work-r' },
            el('div', { class: 'sd-field' }, el('label', { for: 'sd-title' }, t('Title', 'Τίτλος')), W.title),
            W.meta,
            el('div', { class: 'sd-eb' }, t('What you asked for', 'Τι ζητήσατε')), el('p', { class: 'sd-ask' }, D.prompt || t('No description saved.', 'Δεν αποθηκεύτηκε περιγραφή.')),
            el('p', { class: 'sd-hint' }, isClass() ? t('Look at it first. Does it say where the numbers come from? Would a classmate understand it? Use the box above to change it. When it is ready, send it to your teacher. Nobody else can open it until a teacher approves it.', 'Κοιτάξτε το πρώτα. Λέει από πού προέρχονται οι αριθμοί; Θα το καταλάβαινε ένας συμμαθητής; Χρησιμοποιήστε το πλαίσιο παραπάνω για να το αλλάξετε. Όταν είναι έτοιμο, στείλτε το στον εκπαιδευτικό σας. Κανείς άλλος δεν μπορεί να το ανοίξει μέχρι να το εγκρίνει.') : t('Check it, then send it for review. A teacher approves it before anyone else can open it.', 'Ελέγξτε το και στείλτε το για έλεγχο. Ένας εκπαιδευτικός το εγκρίνει πριν το ανοίξει κάποιος άλλος.')),
            el('div', { class: 'sd-actions' }, W.send, disc))));
      }
      syncWork();
    }
    function syncWork() {
      const D = S.cur; if (!D || !W.meta) return;
      const n = (D.html || '').length;
      W.meta.textContent = t(n.toLocaleString('en-GB') + ' of ' + maxHtml().toLocaleString('en-GB') + ' characters', n.toLocaleString('el-GR') + ' από ' + maxHtml().toLocaleString('el-GR') + ' χαρακτήρες') + (isClass() ? ' · ' + t('saved in this browser only', 'αποθηκευμένο μόνο σε αυτό το πρόγραμμα περιήγησης') : '');
      if (document.activeElement !== W.title && W.title.value !== D.title) W.title.value = D.title;
      W.send.disabled = !(D.title || '').trim() || !(D.html || '').trim();
      const p = S.preview;
      W.state.hidden = p.state === 'ok';
      W.state.textContent = p.state === 'loading' ? t('Getting the preview ready', 'Ετοιμάζεται η προεπισκόπηση') : p.state === 'error' ? t('The preview could not be made. ', 'Δεν έγινε η προεπισκόπηση. ') + why(p.error) : '';
      W.state.className = 'sd-pv-state' + (p.state === 'error' ? ' bad' : '');
      if (p.state === 'ok' && W.frame.getAttribute('src') !== p.url) W.frame.setAttribute('src', p.url);
      if (p.state === 'ok') { W.full.setAttribute('href', p.url); W.full.hidden = false; } else W.full.hidden = true;
    }
    async function makePreview() {
      const D = S.cur; if (!D) return;
      S.preview = { state: 'loading', for: D.id }; drawWork();
      try {
        const url = D.serverId ? '/studio/p/' + D.serverId + '?v=' + Date.now() : (await SC.api('/studio/api/preview', { method: 'POST', body: { html: D.html, title: D.title } })).url;
        if (S.cur !== D) return;
        S.preview = { state: 'ok', url, for: D.id };
      } catch (e) {
        if (S.cur !== D) return;
        S.preview = { state: 'error', error: e, for: D.id };
        if (e.status === 401) { await loadStatus(); drawAll(); }
      }
      drawWork();
    }

    function confirmDiscard(D) {
      SC.modal({
        title: t('Discard this draft?', 'Να απορριφθεί το προσχέδιο;'),
        body: el('p', null, t('"' + D.title + '" will be removed from this browser. This cannot be undone.', 'Το «' + D.title + '» θα αφαιρεθεί από αυτό το πρόγραμμα περιήγησης. Δεν αναιρείται.')),
        actions: [{ label: t('Keep it', 'Να μείνει') }, { label: t('Discard', 'Απόρριψη'), primary: true, run: () => removeDraft(D) }],
      });
    }
    async function removeDraft(D) {
      if (D.serverId && !String(D.id).startsWith('d')) { try { await SC.api('/studio/api/projects/' + D.serverId + '/delete', { method: 'POST', body: {} }); } catch (e) { SC.toast(why(e)); return; } await loadMine(); }
      S.drafts = S.drafts.filter((x) => x !== D && x.id !== D.id); persist();
      if (S.cur && S.cur.id === D.id) { S.cur = null; S.reply = null; S.preview = { state: 'none' }; S.mode = 'update'; ta.value = ''; }
      SC.toast(t('Draft removed.', 'Το προσχέδιο αφαιρέθηκε.'));
      drawAll();
    }

    function confirmSend() {
      const D = S.cur; if (!D) return;
      if (!(D.title || '').trim()) { SC.toast(t('Give the tool a title first.', 'Δώστε πρώτα έναν τίτλο στο εργαλείο.')); return; }
      SC.modal({
        title: t('Send to your teacher?', 'Αποστολή στον εκπαιδευτικό σας;'),
        body: el('div', null, el('p', null, t('"' + D.title + '" goes to a teacher' + (schoolName() ? ' at ' + schoolName() : '') + '. They check it before anyone else can open it. They may send it back with a note.', 'Το «' + D.title + '» πηγαίνει σε έναν εκπαιδευτικό' + (schoolName() ? ' στο ' + schoolName() : '') + '. Το ελέγχει πριν το ανοίξει κάποιος άλλος. Μπορεί να το στείλει πίσω με σημείωμα.')),
          el('p', { class: 'muted' }, t('Check that it has no names, photos or exact places.', 'Βεβαιωθείτε ότι δεν έχει ονόματα, φωτογραφίες ή ακριβή σημεία.'))),
        actions: [{ label: t('Not yet', 'Όχι ακόμη') }, { label: t('Send to teacher', 'Αποστολή στον εκπαιδευτικό'), primary: true, run: () => doSend(D) }],
      });
    }
    async function doSend(D) {
      if (W.send) W.send.disabled = true;
      try {
        if (D.serverId) await SC.api('/studio/api/projects/' + D.serverId + '/submit', { method: 'POST', body: {} });
        else await SC.api('/studio/api/projects/submit', { method: 'POST', body: { title: D.title.trim(), prompt: String(D.prompt || '').slice(0, MAX_TEXT), html: D.html } });
        if (D.fromId) { try { await SC.api('/studio/api/projects/' + D.fromId + '/delete', { method: 'POST', body: {} }); } catch (e) { /* the old page stays listed */ } }
        S.drafts = S.drafts.filter((x) => x.id !== D.id); persist();
        S.cur = null; S.reply = null; S.preview = { state: 'none' }; S.mode = 'update'; S.buildErr = null; ta.value = '';
        SC.toast(t('Sent. A teacher will check it.', 'Στάλθηκε. Ένας εκπαιδευτικός θα το ελέγξει.'));
        live.textContent = t('Sent to your teacher. It is now in review.', 'Στάλθηκε στον εκπαιδευτικό σας. Είναι πλέον σε έλεγχο.');
        await Promise.all([loadMine(), loadStatus()]);
        if (!alive) return;
        drawAll();
        const b = document.getElementById('sd-board'); if (b) b.scrollIntoView({ behavior: 'auto', block: 'start' });
      } catch (e) {
        if (W.send) W.send.disabled = false;
        if (e.status === 401) { await loadStatus(); drawAll(); }
        SC.modal({ title: t('It was not sent', 'Δεν στάλθηκε'), body: el('p', null, why(e)), actions: [{ label: t('Close', 'Κλείσιμο'), primary: true }] });
      }
    }

    /* ----- the board: draft / in review / published, or just the gallery ----- */
    function card(o) {
      return el('article', { class: 'sd-kc' + (o.sel ? ' sel' : '') },
        thumb(o.seed, o.color),
        el('div', { class: 'sd-kx' }, el('h3', null, o.title), el('div', { class: 'sd-who' }, el('i', { style: { background: o.color } }), el('span', null, o.who))),
        o.note ? el('div', { class: 'sd-note' }, o.note) : null,
        el('div', { class: 'sd-ft' }, el('span', { class: 'nm-badge' + (o.badge[0] ? ' nm-badge--' + o.badge[0] : '') }, o.badge[1]),
          (o.meta || o.buttons.some((b) => b.link)) ? el('span', { class: 'sd-fm' }, el('span', null, o.meta || ''),
            o.buttons.filter((b) => b.link).map((b) => el('button', { class: 'sd-link', type: 'button', 'aria-label': b.label + ': ' + o.title, onclick: b.run }, b.label))) : null,
          el('span', { class: 'sd-fb' }, o.buttons.filter((b) => !b.link).map((b) => el('button', { class: 'nm-btn nm-btn--sm' + (b.ghost ? ' nm-btn--ghost' : ''), type: 'button', 'aria-label': b.label + ': ' + o.title, onclick: b.run }, b.label)))));
    }
    const galCard = (p) => card({ title: p.title, who: galleryLabel(p), color: schoolColor(p.school), seed: p.id, badge: ['ok', t('Public', 'Δημόσιο')], meta: t('Published ', 'Δημοσιεύτηκε ') + SC.date(p.updatedAt), buttons: [{ label: t('Open', 'Άνοιγμα'), run: () => openViewer(p, galleryLabel(p), el('span', { class: 'nm-badge nm-badge--ok' }, t('Public', 'Δημόσιο'))) }] });

    async function editServer(p) {
      try {
        const r = await SC.api('/studio/api/projects/' + p.id);
        const q = r.project;
        if (isClass()) {
          const d = { id: 'd' + Date.now().toString(36) + rid(), school: V().school.slug, team: V().team, title: q.title, prompt: q.idea || '', html: q.html || '', msgs: [], at: Date.now(), fromId: q.status === 'rejected' ? q.id : null };
          S.drafts.unshift(d); persist(); S.cur = d;
        } else S.cur = { id: 's' + q.id, serverId: q.id, title: q.title, prompt: q.idea || '', html: q.html || '', msgs: [], at: Date.now() };
        S.convo = []; S.reply = null; S.buildErr = null; S.mode = 'update';
        drawAll(); makePreview(); const h = workHost.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); }
      } catch (e) { SC.toast(why(e)); }
    }
    function openLocal(d) {
      S.cur = d; S.convo = []; S.reply = null; S.buildErr = null; S.mode = 'update'; ta.value = '';
      drawAll(); makePreview(); const h = workHost.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); }
    }
    function withdraw(p) {
      SC.modal({
        title: t('Withdraw this page?', 'Να αποσυρθεί η σελίδα;'),
        body: el('p', null, t('"' + p.title + '" goes back to being yours only. The teacher will not see it. You can send a new copy later.', 'Το «' + p.title + '» επιστρέφει σε εσάς μόνο. Ο εκπαιδευτικός δεν θα το βλέπει. Μπορείτε να στείλετε νέο αντίγραφο αργότερα.')),
        actions: [{ label: t('Keep it in review', 'Να μείνει σε έλεγχο') }, { label: t('Withdraw', 'Απόσυρση'), primary: true, run: async () => {
          try {
            let added = null;
            if (isClass()) { const r = await SC.api('/studio/api/projects/' + p.id); const q = r.project; added = { id: 'd' + Date.now().toString(36) + rid(), school: V().school.slug, team: V().team, title: q.title, prompt: q.idea || '', html: q.html || '', msgs: [], at: Date.now(), fromId: null }; S.drafts.unshift(added); persist(); }
            try { await SC.api('/studio/api/projects/' + p.id + '/delete', { method: 'POST', body: {} }); } catch (e) { if (added) { S.drafts = S.drafts.filter((x) => x !== added); persist(); } throw e; }
            await Promise.all([loadMine(), loadStatus()]); SC.toast(t('Withdrawn. It is in your drafts again.', 'Αποσύρθηκε. Είναι ξανά στα προσχέδιά σας.')); if (alive) drawAll();
          } catch (e) { SC.toast(why(e)); }
        } }],
      });
    }

    function ownCards() {
      const color = schoolColor(schoolName());
      const who = isClass() ? asTeam() : t('You', 'Εσείς');
      const draft = [
        ...rejectedMine().map((p) => card({ title: p.title, who, color, seed: p.id, badge: ['warn', t('Needs changes', 'Χρειάζεται αλλαγές')], meta: t('Sent back ' + ago(p.updatedAt), 'Επιστράφηκε ' + ago(p.updatedAt)), note: p.reviewNote ? t('Teacher note: ', 'Σημείωμα εκπαιδευτικού: ') + p.reviewNote : t('A teacher sent it back.', 'Ένας εκπαιδευτικός το έστειλε πίσω.'), buttons: [{ label: t('Edit', 'Επεξεργασία'), run: () => editServer(p) }] })),
        ...myLocal().map((d) => card({ title: d.title, who, color, seed: d.id, sel: S.cur && S.cur.id === d.id, badge: ['', t('Draft', 'Προσχέδιο')], meta: t('Edited ' + ago(d.at), 'Επεξεργάστηκε ' + ago(d.at)), buttons: [{ label: t('Open', 'Άνοιγμα'), run: () => openLocal(d) }, { label: t('Delete', 'Διαγραφή'), ghost: true, run: () => confirmDiscard(d) }] })),
        ...serverDrafts().map((p) => card({ title: p.title, who, color, seed: p.id, sel: S.cur && S.cur.serverId === p.id, badge: ['', t('Draft', 'Προσχέδιο')], meta: t('Edited ' + ago(p.updatedAt), 'Επεξεργάστηκε ' + ago(p.updatedAt)), buttons: [{ label: t('Edit', 'Επεξεργασία'), run: () => editServer(p) }] })),
      ];
      const review = pendingMine().map((p) => card({ title: p.title, who, color, seed: p.id, badge: ['warn', t('Waiting for a teacher', 'Περιμένει εκπαιδευτικό')], meta: t('Sent ' + ago(p.updatedAt), 'Στάλθηκε ' + ago(p.updatedAt)),
        buttons: [{ label: t('View', 'Προβολή'), run: () => openViewer(p, who, el('span', { class: 'nm-badge nm-badge--warn' }, t('Not public yet', 'Δεν είναι δημόσιο ακόμη'))) }, { label: t('Withdraw', 'Απόσυρση'), link: true, run: () => withdraw(p) }] }));
      return { draft, review };
    }
    function col(icon, title, n, sub, cards, slot) {
      return el('section', { class: 'nm-card sd-col', 'aria-label': title }, el('div', { class: 'sd-col-h' }, el('span', { class: 'ic' }, ic(icon)), el('h2', null, title, el('span', null, '·'), String(n))), el('p', { class: 'sd-col-sub' }, sub),
        el('div', { class: 'sd-cards' }, cards, !cards.length && slot ? el('div', { class: 'sd-slot' }, el('b', null, slot[0]), slot[1]) : null));
    }
    function drawBoard() {
      if (!S.loaded) { boardHost.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); return; }
      const own = canBuild() ? ownCards() : { draft: [], review: [] };
      const pubErr = S.galErr ? el('div', null, el('div', { class: 'err', role: 'alert' }, t('The public gallery could not be loaded. ', 'Η δημόσια συλλογή δεν φορτώθηκε. ') + errMsg(S.galErr)), el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: async () => { await loadGallery(); drawStats(); drawBoard(); } }, t('Try again', 'Δοκιμάστε ξανά')))) : null;
      const pub = S.gallery.map(galCard);
      const errNote = S.mineErr && canBuild() && S.mineErr.status !== 401 ? el('div', { class: 'err', role: 'alert' }, t('Your own pages could not be loaded. ', 'Οι δικές σας σελίδες δεν φορτώθηκαν. ') + errMsg(S.mineErr) + ' ', el('button', { class: 'link', type: 'button', onclick: async () => { await loadMine(); drawStats(); drawBoard(); } }, t('Try again', 'Δοκιμάστε ξανά'))) : null;
      if (own.draft.length || own.review.length) {
        boardHost.replaceChildren(...[el('div', { class: 'sd-kan' },
          col('file', t('Draft', 'Προσχέδιο'), own.draft.length, isClass() ? t('Only in this browser. Send one to a teacher when it is ready.', 'Μόνο σε αυτό το πρόγραμμα περιήγησης. Στείλτε ένα στον εκπαιδευτικό όταν είναι έτοιμο.') : t('Saved to your account. Only you and the teachers can see these.', 'Αποθηκευμένα στον λογαριασμό σας. Μόνο εσείς και οι εκπαιδευτικοί τα βλέπετε.'), own.draft, [t('No drafts yet.', 'Δεν υπάρχουν προσχέδια ακόμη.'), t('Describe a tool above.', 'Περιγράψτε ένα εργαλείο παραπάνω.')]),
          col('clock', t('In review', 'Σε έλεγχο'), own.review.length, t('Waiting for a teacher to check them.', 'Περιμένουν έναν εκπαιδευτικό να τα ελέγξει.'), own.review, [t('Finished a draft?', 'Τελειώσατε ένα προσχέδιο;'), t('Press Send to teacher. It moves here.', 'Πατήστε «Αποστολή στον εκπαιδευτικό». Μετακινείται εδώ.')]),
          pubErr ? el('section', { class: 'nm-card sd-col' }, el('h2', { class: 'sd-gh' }, t('Published', 'Δημοσιευμένα')), pubErr) : col('checkc', t('Published', 'Δημοσιευμένα'), pub.length, t('In the public gallery. No sign-in needed.', 'Στη δημόσια συλλογή. Χωρίς σύνδεση.'), pub, [t('Nothing public yet.', 'Τίποτα δημόσιο ακόμη.'), t('The first approved tool appears here.', 'Το πρώτο εγκεκριμένο εργαλείο εμφανίζεται εδώ.')])), errNote].filter(Boolean));
      } else {
        boardHost.replaceChildren(el('section', { class: 'sd-gal', 'aria-labelledby': 'sd-gal-h' },
          el('div', { class: 'sd-gal-h' }, el('h2', { id: 'sd-gal-h' }, t('Public gallery', 'Δημόσια συλλογή'), el('span', null, '·'), String(pubErr ? 0 : pub.length)), el('p', { class: 'card-sub' }, t('Tools that teachers approved. Anyone can open them, no sign-in needed.', 'Εργαλεία που ενέκριναν εκπαιδευτικοί. Οποιοσδήποτε μπορεί να τα ανοίξει, χωρίς σύνδεση.'))),
          pubErr || (pub.length ? el('div', { class: 'sd-grid' }, pub) : el('div', { class: 'empty' }, el('b', { style: { display: 'block', color: 'var(--nm-ink-soft)' } }, t('No tool is public yet.', 'Κανένα εργαλείο δεν είναι δημόσιο ακόμη.')), canBuild() ? t('Describe a tool above, build a draft and send it to a teacher.', 'Περιγράψτε ένα εργαλείο παραπάνω, φτιάξτε ένα προσχέδιο και στείλτε το σε έναν εκπαιδευτικό.') : t('When a teacher approves a student tool, it appears here. Students can build one with their class code.', 'Όταν ένας εκπαιδευτικός εγκρίνει ένα εργαλείο μαθητών, εμφανίζεται εδώ. Οι μαθητές μπορούν να φτιάξουν ένα με τον κωδικό τάξης.'))), errNote));
      }
    }

    function drawAll() {
      if (!alive) return;
      drawStats(); drawMaker(); drawWork(); drawBoard();
    }
    async function reload() {
      S.loaded = false; S.statusErr = null; drawMaker(); drawBoard();
      await loadAll();
      if (alive) { drawHead(); drawAll(); }
    }
    // Quietly look for a teacher's decision and for builds coming back. Anything the person is typing is left alone.
    async function tickRefresh() {
      if (S.building || document.hidden) return;
      const hadFocus = root.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      await Promise.all([loadStatus(), loadGallery(), loadMine()]);
      if (!alive) return;
      drawStats(); drawBoard();
      if (!hadFocus) drawMaker();
    }

    drawHead(); drawStats(); drawMaker(); drawBoard();
    return (async () => {
      await loadAll();
      if (!alive) return () => {};
      drawHead(); drawAll();
      timer = setInterval(tickRefresh, 60000);
      return () => { alive = false; clearInterval(timer); stopBridge(); document.removeEventListener('click', onDoc); if (S.ctrl) S.ctrl.abort(); };
    })();
  }

  SC.register('studio', {
    title: ['Build studio', 'Στούντιο'],
    render(root) {
      SC.css('/site/pages/studio.css');
      return studio(root);
    },
  });
})();
