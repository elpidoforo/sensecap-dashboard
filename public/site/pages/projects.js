/* Running projects: team projects in progress, with a progress gauge and a detail sheet.
   Everyone sees the projects a teacher approved (scope=public). A class team (class code, no account) or a signed-in teacher also
   sees their own plans (scope=mine) and can move them between draft, running and done, and send them to a teacher.
   API: GET /studio/api/plans?scope=public|mine, PATCH /studio/api/plans/:id {status}, GET /studio/api/status,
        POST /studio/api/class, POST /studio/api/class/leave, /api/devices (names only), /api/config (names, demo).
   Route: #/projects  or  #/projects/<id> (opens the detail sheet of that project). */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const TEAM_KEY = 'sc.studio.team';   // the Build studio remembers the team name here too

  /* ---------- icons (static strings only) ---------- */
  const ICON = {
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    circle: '<circle cx="12" cy="12" r="8.5"/>',
    sensor: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    inbox: '<path d="M3 13l3-9h12l3 9v7H3zM3 13h5l1 3h6l1-3h5"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- names ---------- */
  const GPS = new Set(['4197', '4198']);
  const MID_EL = { 4097: 'Θερμοκρασία αέρα', 4098: 'Υγρασία αέρα', 4099: 'Φωτεινότητα', 4100: 'CO₂', 4101: 'Βαρομετρική πίεση' };
  const SRC = { metoffice: ['Met Office station', 'Σταθμός Μετεωρολογικής Υπηρεσίας'], air: ['Outdoor air quality', 'Ποιότητα αέρα έξω'] };
  const errMsg = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  const toMs = (x) => (typeof x === 'number' ? x : x ? Date.parse(x) || 0 : 0);
  function schoolColor(short) {
    const s = String(short || '').toLowerCase();
    return /larn/.test(s) ? 'var(--nm-c1)' : /lefk|nicos/.test(s) ? 'var(--nm-c2)' : /lima/.test(s) ? 'var(--nm-c3)' : /paph|pafo/.test(s) ? 'var(--nm-c4)' : 'var(--nm-c5)';
  }

  /* A plan as the page uses it. The server may add fields, so every name is read with a fallback. */
  function normPlan(p) {
    const arr = (x) => (Array.isArray(x) ? x : x == null || x === '' ? [] : [x]);
    const sch = p.school && typeof p.school === 'object' ? p.school.short || p.school.name : p.school;
    const steps = arr(p.steps).map((s, i) => (typeof s === 'string'
      ? { label: s, done: false }
      : { label: String(s.label || s.title || s.text || s.name || s.id || (t('Step ', 'Βήμα ') + (i + 1))), done: Boolean(s.done || s.complete || s.completed || s.status === 'done') }));
    const status = String(p.status || 'draft').toLowerCase();
    const sensors = arr(p.sensors).map((x) => (x && typeof x === 'object' ? { eui: x.eui || x.id || null, name: x.name || null } : { eui: String(x), name: null }));
    const data = arr(p.data).map((x) => String(x && typeof x === 'object' ? x.id || x.key || x.mid || x.source || x.name : x));
    return {
      id: p.id, title: String(p.title || p.question || ''), question: String(p.question || p.title || ''), team: p.team || null, school: sch || null,
      notes: String(p.notes || p.note || ''), status, steps, sensors, data, reviewNote: p.reviewNote || p.review_note || null,
      approved: Boolean(p.approved) || status === 'approved', progress: typeof p.progress === 'number' ? Math.max(0, Math.min(100, Math.round(p.progress))) : null,
      at: toMs(p.updatedAt || p.updated_at || p.at), label: p.author_label || null,
    };
  }
  const isWaiting = (p) => ['submitted', 'pending', 'review', 'in_review'].includes(p.status);
  const isBack = (p) => ['sent_back', 'rejected', 'changes', 'needs_changes'].includes(p.status) || (p.status === 'draft' && Boolean(p.reviewNote));
  const phase = (p) => (p.status === 'done' ? 'done' : p.status === 'running' ? 'running' : p.status === 'draft' ? 'draft' : p.progress === 100 ? 'done' : 'running');
  function progress(p) {
    if (p.status === 'done') return { pct: 100, done: p.steps.length, of: p.steps.length };
    if (p.steps.length) { const d = p.steps.filter((s) => s.done).length; return { pct: Math.round((100 * d) / p.steps.length), done: d, of: p.steps.length }; }
    if (p.progress != null) return { pct: p.progress, done: null, of: null };
    return { pct: null, done: null, of: null };
  }

  /* ---------- a round gauge ---------- */
  function ring(pr, ph) {
    const r = 22, c = 2 * Math.PI * r;
    const label = pr.pct == null ? t('Progress not counted yet', 'Η πρόοδος δεν έχει μετρηθεί ακόμη') : t(pr.pct + ' percent of the steps done', pr.pct + ' τοις εκατό των βημάτων έχουν γίνει');
    const svg = SC.svgEl('svg', { viewBox: '0 0 56 56', class: 'pr-ring ' + ph, role: 'img', 'aria-label': label });
    svg.append(SC.svgEl('circle', { cx: 28, cy: 28, r, class: 'trk' }));
    if (pr.pct != null) svg.append(SC.svgEl('circle', { cx: 28, cy: 28, r, class: 'val', 'stroke-dasharray': ((c * pr.pct) / 100).toFixed(1) + ' ' + c.toFixed(1), transform: 'rotate(-90 28 28)' }));
    svg.append(SC.svgEl('text', { x: 28, y: 32.5, 'text-anchor': 'middle', class: 'txt' }, pr.pct == null ? '–' : pr.pct + '%'));
    return svg;
  }

  /* ================= the page ================= */
  function projects(root, ctx) {
    const S = {
      status: null, pub: [], pubErr: null, mine: [], mineErr: null, loaded: false, devices: new Map(), names: {}, demo: false,
      filter: 'all', school: 'all', joinErr: '', joinBusy: false, gateOpen: false, busyId: null, at: 0,
    };
    let alive = true, timer = 0, sheet = null;
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const headHost = el('div'), statsHost = el('div'), mineHost = el('div'), filterHost = el('div'), gridHost = el('div', { id: 'pr-grid' });
    const codeIn = el('input', { class: 'nm-input', id: 'pr-code', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 40 });
    const teamIn = el('input', { class: 'nm-input', id: 'pr-team', type: 'text', autocomplete: 'off', maxlength: 30 });
    try { teamIn.value = SC.store.get(TEAM_KEY) || ''; } catch (e) { /* no storage */ }
    root.append(headHost, statsHost, mineHost, filterHost, gridHost, live);

    const V = () => (S.status && S.status.viewer) || { kind: 'visitor' };
    const isClass = () => V().kind === 'class';
    const isUser = () => V().kind === 'user';
    const canOwn = () => isClass() || isUser();
    const isTeacher = () => isUser() && (V().role === 'teacher' || V().role === 'admin');
    const schoolName = () => (V().school ? V().school.short || V().school.name : '');
    const asTeam = () => t('Team ' + V().team + (schoolName() ? ', ' + schoolName() : ''), 'Ομάδα ' + V().team + (schoolName() ? ', ' + schoolName() : ''));

    /* ----- names of sensors and data ----- */
    const sensorName = (s) => {
      const d = s.eui && S.devices.get(s.eui);
      return d ? d.name : s.name || t('A sensor', 'Ένας αισθητήρας');
    };
    function dataName(id) {
      if (SRC[id]) return t(SRC[id][0], SRC[id][1]);
      const n = S.names[id];
      if (n) return SC.lang === 'el' && MID_EL[id] ? MID_EL[id] : n[0];
      return t('Reading ' + id, 'Μέτρηση ' + id);
    }
    const dataUnit = (id) => (S.names[id] && S.names[id][1]) || '';
    const dataList = (p) => p.data.filter((d) => !GPS.has(d));

    /* ----- loading ----- */
    async function loadSide() {
      const [dv, cf] = await Promise.allSettled([SC.cached('/api/devices', 60000), SC.cached('/api/config', 300000)]);
      if (dv.status === 'fulfilled' && Array.isArray(dv.value)) S.devices = new Map(dv.value.map((d) => [d.eui, { name: d.name, group: d.group, online: !!d.online }]));   // names only: no position is read
      if (cf.status === 'fulfilled' && cf.value) { S.names = cf.value.names || {}; S.demo = !!cf.value.demo; }
    }
    async function loadStatus() { try { S.status = await SC.api('/studio/api/status'); } catch (e) { S.status = null; } }
    async function loadPublic() {
      try { S.pub = ((await SC.api('/studio/api/plans?scope=public')).plans || []).map(normPlan); S.pubErr = null; S.at = Date.now(); } catch (e) { S.pubErr = e; }
    }
    async function loadMine() {
      if (!canOwn()) { S.mine = []; S.mineErr = null; return; }
      try { S.mine = ((await SC.api('/studio/api/plans?scope=mine')).plans || []).map(normPlan); S.mineErr = null; } catch (e) { S.mineErr = e; if (e.status === 401) S.mine = []; }
    }
    async function loadAll() {
      await Promise.all([loadSide(), loadStatus()]);
      await Promise.all([loadPublic(), loadMine()]);
      S.loaded = true;
    }

    /* ----- head and numbers ----- */
    function drawHead() {
      headHost.replaceChildren(SC.head({
        title: t('Team projects, in progress.', 'Ομαδικά έργα σε εξέλιξη.'),
        lede: t('Student teams ask a question and answer it with our sensors and official data. See what each team is looking into and how far it has got. Teams are shown by name only, never by student.',
          'Οι ομάδες μαθητών θέτουν ένα ερώτημα και το απαντούν με τους αισθητήρες μας και τα επίσημα δεδομένα. Δείτε τι ερευνά κάθε ομάδα και πόσο έχει προχωρήσει. Οι ομάδες εμφανίζονται μόνο με το όνομά τους, ποτέ με μαθητές.'),
        fresh: S.at ? t('Updated ' + SC.ago(S.at), 'Ενημερώθηκε ' + SC.ago(S.at)) : null,
        tags: S.demo ? [{ text: t('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        actions: [el('a', { class: 'nm-btn nm-btn--primary', href: '#/start' }, ic('plus'), t('Start a project', 'Ξεκινήστε ένα έργο'))],
        help: [
          'Each card is a project a student team is working on. The ring shows how many of its steps are done. Press Details to see the question, the sensors, the data it uses and the steps. Only projects a teacher approved are shown to everyone. If your class has a project, enter the class code to see and update your own plans: move them between Draft, Running and Done, and send one to your teacher when it is ready.',
          'Κάθε κάρτα είναι ένα έργο στο οποίο δουλεύει μια ομάδα μαθητών. Ο κύκλος δείχνει πόσα από τα βήματά του έχουν γίνει. Πατήστε «Λεπτομέρειες» για να δείτε το ερώτημα, τους αισθητήρες, τα δεδομένα που χρησιμοποιεί και τα βήματα. Σε όλους εμφανίζονται μόνο τα έργα που ενέκρινε εκπαιδευτικός. Αν η τάξη σας έχει ένα έργο, βάλτε τον κωδικό τάξης για να δείτε και να ενημερώσετε τα δικά σας σχέδια: μετακινήστε τα ανάμεσα σε Προσχέδιο, Σε εξέλιξη και Ολοκληρωμένο και στείλτε ένα στον εκπαιδευτικό σας όταν είναι έτοιμο.',
        ],
      }));
    }
    const nRunning = () => S.pub.filter((p) => phase(p) !== 'done').length;
    const nDone = () => S.pub.filter((p) => phase(p) === 'done').length;
    function drawStats() {
      if (!S.loaded || S.pubErr) { statsHost.replaceChildren(); return; }
      const schools = new Set(S.pub.map((p) => p.school).filter(Boolean)).size;
      const items = [[S.pub.length, S.pub.length === 1 ? t('public project', 'δημόσιο έργο') : t('public projects', 'δημόσια έργα')], [nRunning(), t('running', 'σε εξέλιξη')], [nDone(), t('done', 'ολοκληρωμένα')], [schools, schools === 1 ? t('school', 'σχολείο') : t('schools', 'σχολεία')]];
      statsHost.replaceChildren(el('div', { class: 'pr-stats', role: 'group', 'aria-label': t('Projects in numbers', 'Τα έργα σε αριθμούς') },
        ...items.flatMap(([n, label], i) => [i ? el('span', { class: 'sep', 'aria-hidden': 'true' }) : null, el('span', null, el('b', null, String(n)), ' ' + label)]).filter(Boolean)),
      el('div', { class: 'nm-callout nm-callout--info pr-priv' }, ic('lock'), el('span', null, el('b', null, t('Protecting students.', 'Προστασία των μαθητών.')), ' ' + t('Projects show a team name and a school, never a student. Sensors appear by name, never by position.', 'Τα έργα δείχνουν όνομα ομάδας και σχολείο, ποτέ μαθητή. Οι αισθητήρες εμφανίζονται με το όνομά τους, ποτέ με τη θέση τους.'))));
    }

    /* ----- joining a class (the same panel as the Build studio) ----- */
    async function joinClass() {
      if (S.joinBusy) return;
      const code = codeIn.value.trim(), team = teamIn.value.trim();
      S.joinErr = '';
      if (!code) { S.joinErr = t('Type the class code your teacher gave you.', 'Πληκτρολογήστε τον κωδικό τάξης που σας έδωσε ο εκπαιδευτικός.'); drawMine(); codeIn.focus(); return; }
      if (!team) { S.joinErr = t('Type a team name.', 'Πληκτρολογήστε ένα όνομα ομάδας.'); drawMine(); teamIn.focus(); return; }
      S.joinBusy = true; drawMine();
      try {
        const r = await SC.api('/studio/api/class', { method: 'POST', body: { code, team } });
        SC.store.set(TEAM_KEY, r.team || team);
        codeIn.value = '';
        SC.toast(t('You are working as Team ' + r.team + '.', 'Δουλεύετε ως Ομάδα ' + r.team + '.'));
        await loadStatus(); await loadMine();
      } catch (e) {
        const c2 = e.body && e.body.code;
        S.joinErr = e.status === 403 && c2 === 'code' ? t('That class code is not right. Ask your teacher for the code.', 'Αυτός ο κωδικός τάξης δεν είναι σωστός. Ρωτήστε τον εκπαιδευτικό σας.')
          : e.status === 429 ? t('Too many wrong codes. Wait a few minutes, then ask your teacher for the code.', 'Πάρα πολλοί λάθος κωδικοί. Περιμένετε λίγα λεπτά και ρωτήστε τον εκπαιδευτικό σας.')
            : e.status === 400 && c2 === 'team' ? (SC.lang === 'el' ? 'Το όνομα ομάδας έχει έως 30 χαρακτήρες: μόνο γράμματα, αριθμοί, κενά και παύλες, και όχι αριθμός τηλεφώνου.' : errMsg(e))
              : errMsg(e);
      }
      S.joinBusy = false;
      if (alive) drawAll();
    }
    async function leaveClass() {
      try { await SC.api('/studio/api/class/leave', { method: 'POST', body: {} }); } catch (e) { /* the cookie ends by itself */ }
      await loadStatus(); await loadMine();
      SC.toast(t('You left the class.', 'Αποχωρήσατε από την τάξη.'));
      if (alive) drawAll();
    }
    function gateForm() {
      if (!S.gateOpen && !S.joinErr) {
        return el('div', { class: 'pr-as pr-slim' }, el('span', { class: 'pr-tic' }, ic('user')),
          el('div', { class: 'pr-as-t' }, el('b', null, t('Running a project with your class?', 'Κάνετε ένα έργο με την τάξη σας;')), el('small', null, t('Enter your class code to see and update your team’s own plans.', 'Βάλτε τον κωδικό τάξης για να δείτε και να ενημερώσετε τα δικά σας σχέδια.'))),
          el('button', { class: 'nm-btn', type: 'button', onclick: () => { S.gateOpen = true; drawMine(); codeIn.focus(); } }, ic('lock'), t('Enter class code', 'Βάλτε κωδικό τάξης')));
      }
      const f = el('form', { class: 'pr-gate', novalidate: true },
        el('div', { class: 'pr-eb cu' }, t('Your class', 'Η τάξη σας')),
        el('h2', null, t('Running a project with your class?', 'Κάνετε ένα έργο με την τάξη σας;')),
        el('p', { class: 'pr-hint' }, t('Your teacher gives you the class code. It is not a password and you do not need an account. Pick a team name your class will know. Do not use your real name.', 'Τον κωδικό τάξης τον δίνει ο εκπαιδευτικός σας. Δεν είναι κωδικός πρόσβασης και δεν χρειάζεστε λογαριασμό. Διαλέξτε ένα όνομα ομάδας που θα το γνωρίζει η τάξη σας. Μη χρησιμοποιήσετε το πραγματικό σας όνομα.')),
        el('div', { class: 'pr-fields' },
          el('div', { class: 'pr-field' }, el('label', { for: 'pr-code' }, t('Class code', 'Κωδικός τάξης')), codeIn),
          el('div', { class: 'pr-field' }, el('label', { for: 'pr-team' }, t('Team name', 'Όνομα ομάδας')), teamIn)),
        S.joinErr ? el('div', { class: 'err', role: 'alert' }, S.joinErr) : null,
        el('div', { class: 'pr-actions' }, el('button', { class: 'nm-btn nm-btn--primary', type: 'submit', disabled: S.joinBusy }, ic('lock'), t('See my team’s projects', 'Δείτε τα έργα της ομάδας μου')),
          el('a', { class: 'link', href: '#/approvals' }, t('Teachers: sign in', 'Εκπαιδευτικοί: συνδεθείτε'))));
      f.addEventListener('submit', (ev) => { ev.preventDefault(); joinClass(); });
      return f;
    }

    /* ----- the cards ----- */
    function chips(list, kind, max) {
      const shown = list.slice(0, max), more = list.length - shown.length;
      return el('span', { class: 'pr-chips' }, shown.map((x) => el('span', { class: 'pr-chip' }, ic(kind), x)), more > 0 ? el('span', { class: 'pr-chip more' }, '+' + more) : null);
    }
    function statusBadge(p, mine) {
      if (mine && isWaiting(p)) return el('span', { class: 'nm-badge nm-badge--warn' }, t('Waiting for a teacher', 'Περιμένει εκπαιδευτικό'));
      if (mine && isBack(p)) return el('span', { class: 'nm-badge nm-badge--warn' }, t('Needs changes', 'Χρειάζεται αλλαγές'));
      const ph = phase(p);
      if (ph === 'done') return el('span', { class: 'nm-badge nm-badge--ok' }, ic('check'), t('Done', 'Ολοκληρώθηκε'));
      if (ph === 'draft') return el('span', { class: 'nm-badge' }, t('Draft', 'Προσχέδιο'));
      return el('span', { class: 'nm-badge nm-badge--info pr-run' }, el('i', { 'aria-hidden': 'true' }), t('Running', 'Σε εξέλιξη'));
    }
    function teamLabel(p) { return p.team ? t('Team ' + p.team, 'Ομάδα ' + p.team) : t('A student team', 'Μια ομάδα μαθητών'); }
    function gaugeRow(p) {
      const pr = progress(p), ph = phase(p);
      return el('div', { class: 'pr-gauge' }, ring(pr, ph),
        el('div', { class: 'pr-gt' },
          pr.of ? el('b', null, t(pr.done + ' of ' + pr.of + ' steps', pr.done + ' από ' + pr.of + ' βήματα')) : el('b', null, pr.pct == null ? t('Steps not counted yet', 'Τα βήματα δεν έχουν μετρηθεί ακόμη') : t('Progress ' + pr.pct + '%', 'Πρόοδος ' + pr.pct + '%')),
          el('span', { class: 'pr-bar', 'aria-hidden': 'true' }, el('i', { style: { width: (pr.pct == null ? 0 : Math.max(pr.pct ? 4 : 0, pr.pct)) + '%' } })),
          el('small', null, p.steps.length ? (() => { const nx = p.steps.find((s) => !s.done); return nx && p.status !== 'done' ? t('Next: ', 'Επόμενο: ') + nx.label : t('All steps are done.', 'Όλα τα βήματα έχουν γίνει.'); })() : t('The team has not listed its steps yet.', 'Η ομάδα δεν έχει καταγράψει ακόμη τα βήματά της.'))));
    }
    function card(p, mine) {
      const sensors = p.sensors.map(sensorName), data = dataList(p).map(dataName);
      const seg = mine ? ownerControls(p) : null;
      return el('article', { class: 'pr-card' + (mine ? ' mine' : '') + ' nm-lift', 'data-id': String(p.id), style: '--sc:' + schoolColor(p.school) },
        el('div', { class: 'pr-top' }, el('span', { class: 'pr-sch' }, el('i', { style: { background: schoolColor(p.school) } }), p.school || t('A school', 'Ένα σχολείο')), statusBadge(p, mine)),
        el('h3', { class: 'pr-q' }, p.question),
        el('div', { class: 'pr-team' }, ic('user'), teamLabel(p)),
        gaugeRow(p),
        el('dl', { class: 'pr-use' },
          el('div', null, el('dt', null, t('Sensors', 'Αισθητήρες')), el('dd', null, sensors.length ? chips(sensors, 'sensor', 2) : el('span', { class: 'muted' }, t('None chosen', 'Κανένας')))),
          el('div', null, el('dt', null, t('Data', 'Δεδομένα')), el('dd', null, data.length ? chips(data, 'db', 3) : el('span', { class: 'muted' }, t('None chosen', 'Κανένα'))))),
        mine && isBack(p) ? el('div', { class: 'pr-note' }, p.reviewNote ? t('Teacher note: ', 'Σημείωμα εκπαιδευτικού: ') + p.reviewNote : t('A teacher sent it back.', 'Ένας εκπαιδευτικός το έστειλε πίσω.')) : null,
        seg,
        el('div', { class: 'pr-ft' }, el('span', { class: 'pr-when' }, ic('clock'), p.at ? t('Updated ' + SC.ago(p.at), 'Ενημερώθηκε ' + SC.ago(p.at)) : t('No update yet', 'Καμία ενημέρωση ακόμη')),
          el('button', { class: 'nm-btn nm-btn--sm', type: 'button', 'aria-label': t('Details of ', 'Λεπτομέρειες του ') + p.question, onclick: () => openSheet(p, mine) }, t('Details', 'Λεπτομέρειες'), ic('arrow'))));
    }

    /* ----- owner controls: draft / running / done / send to a teacher ----- */
    async function setStatus(p, status) {
      if (S.busyId) return;
      S.busyId = p.id; drawMine();
      try {
        const r = await SC.api('/studio/api/plans/' + p.id, { method: 'PATCH', body: { status } });
        if (r && r.plan) { const np = normPlan(r.plan); S.mine = S.mine.map((x) => (x.id === p.id ? np : x)); }
        else await loadMine();
        const m = status === 'submitted' ? t('Sent. A teacher will check it.', 'Στάλθηκε. Ένας εκπαιδευτικός θα το ελέγξει.') : t('Saved.', 'Αποθηκεύτηκε.');
        SC.toast(m); live.textContent = m;
      } catch (e) {
        if (e.status === 401) { await loadStatus(); await loadMine(); }
        SC.modal({ title: t('It was not saved', 'Δεν αποθηκεύτηκε'), body: el('p', null, e.status === 401 ? t('Your class session has ended. Enter the class code again.', 'Η συνεδρία της τάξης έληξε. Βάλτε ξανά τον κωδικό τάξης.') : errMsg(e)), actions: [{ label: t('Close', 'Κλείσιμο'), primary: true }] });
      }
      S.busyId = null;
      if (alive) drawAll();
    }
    function confirmSubmit(p) {
      SC.modal({
        title: t('Send to your teacher?', 'Αποστολή στον εκπαιδευτικό σας;'),
        body: el('div', null, el('p', null, t('"' + p.title + '" goes to a teacher. They check it before it is shown to everyone. They may send it back with a note.', 'Το «' + p.title + '» πηγαίνει σε έναν εκπαιδευτικό. Το ελέγχει πριν εμφανιστεί σε όλους. Μπορεί να το στείλει πίσω με σημείωμα.')),
          el('p', { class: 'muted' }, t('Check that the question and the note have no names, photos or exact places.', 'Βεβαιωθείτε ότι το ερώτημα και το σημείωμα δεν έχουν ονόματα, φωτογραφίες ή ακριβή σημεία.'))),
        actions: [{ label: t('Not yet', 'Όχι ακόμη') }, { label: t('Send to teacher', 'Αποστολή στον εκπαιδευτικό'), primary: true, run: () => setStatus(p, 'submitted') }],
      });
    }
    function ownerControls(p) {
      const busy = S.busyId === p.id, locked = isWaiting(p) || p.approved || busy;
      const cur = isWaiting(p) ? '' : isBack(p) ? 'draft' : phase(p);
      const seg = el('div', { class: 'pr-seg', role: 'group', 'aria-label': t('Status of ' + p.title, 'Κατάσταση του ' + p.title) },
        [['draft', t('Draft', 'Προσχέδιο')], ['running', t('Running', 'Σε εξέλιξη')], ['done', t('Done', 'Ολοκληρώθηκε')]].map(([id, label]) => el('button', { type: 'button', class: cur === id ? 'on' : '', 'aria-pressed': cur === id ? 'true' : 'false', disabled: locked, onclick: () => { if (cur !== id) setStatus(p, id); } }, label)));
      const send = el('button', { class: 'nm-btn nm-btn--sm nm-btn--primary', type: 'button', disabled: locked, onclick: () => confirmSubmit(p) }, ic('send'), isBack(p) ? t('Send again', 'Νέα αποστολή') : t('Send to teacher', 'Αποστολή στον εκπαιδευτικό'));
      return el('div', { class: 'pr-own' }, seg, p.approved ? el('span', { class: 'pr-ok' }, ic('checkc'), t('Public', 'Δημόσιο')) : isWaiting(p) ? el('span', { class: 'pr-wait' }, ic('clock'), t('Waiting for a teacher', 'Περιμένει εκπαιδευτικό')) : send);
    }

    /* ----- your team ----- */
    function drawMine() {
      if (!S.loaded) { mineHost.replaceChildren(); return; }
      if (!canOwn()) {
        const g = gateForm();
        mineHost.replaceChildren(g.classList.contains('pr-slim') ? g : el('section', { class: 'nm-card nm-card--glow pr-gatec', 'aria-label': t('Join your class', 'Μπείτε στην τάξη σας') }, g));
        return;
      }
      const strip = el('div', { class: 'pr-as' }, el('span', { class: 'pr-tic' }, ic('user')),
        el('div', { class: 'pr-as-t' }, el('b', null, isClass() ? t('Working as ', 'Δουλεύετε ως ') + asTeam() : t('Signed in as ' + (S.status.user ? S.status.user.name : 'a teacher'), 'Συνδεδεμένοι ως ' + (S.status.user ? S.status.user.name : 'εκπαιδευτικός'))),
          el('small', null, isClass() ? t('Your own plans are below. Others only see them after a teacher approves.', 'Τα δικά σας σχέδια είναι παρακάτω. Οι άλλοι τα βλέπουν μόνο μετά την έγκριση εκπαιδευτικού.') : t('Your plans are below.', 'Τα σχέδιά σας είναι παρακάτω.'))),
        isClass() ? el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: leaveClass }, t('Leave', 'Αποχώρηση')) : null);
      let body;
      if (S.mineErr && S.mineErr.status !== 401) body = el('div', null, el('div', { class: 'err', role: 'alert' }, t('Your plans could not be loaded. ', 'Τα σχέδιά σας δεν φορτώθηκαν. ') + errMsg(S.mineErr)), el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: async () => { await loadMine(); drawMine(); } }, t('Try again', 'Δοκιμάστε ξανά'))));
      else if (!S.mine.length) body = el('div', { class: 'empty' }, el('b', { style: { display: 'block', color: 'var(--nm-ink-soft)' } }, t('Your team has no project yet.', 'Η ομάδα σας δεν έχει ακόμη έργο.')), t('Start one in four steps: a question, sensors, data and a team note.', 'Ξεκινήστε ένα σε τέσσερα βήματα: ένα ερώτημα, αισθητήρες, δεδομένα και ένα σημείωμα ομάδας.'), el('div', { style: { marginTop: '14px' } }, el('a', { class: 'nm-btn nm-btn--primary', href: '#/start' }, ic('plus'), t('Start a project', 'Ξεκινήστε ένα έργο'))));
      else body = el('div', { class: 'pr-grid' }, S.mine.map((p) => card(p, true)));
      const hint = isTeacher() ? el('div', { class: 'nm-callout pr-tnote' }, t('Teachers decide on submitted projects on ', 'Οι εκπαιδευτικοί αποφασίζουν για τα έργα που υποβάλλονται στις '), el('a', { class: 'link', href: '#/submitted' }, t('Submitted work', 'Υποβολές')), '.') : null;
      mineHost.replaceChildren(el('section', { class: 'pr-mine', 'aria-labelledby': 'pr-mine-h' },
        el('div', { class: 'pr-sech' }, el('h2', { id: 'pr-mine-h' }, t('Your projects', 'Τα έργα σας'), el('span', null, '·'), String(S.mineErr ? 0 : S.mine.length)),
          el('a', { class: 'nm-btn nm-btn--sm', href: '#/start' }, ic('plus'), t('New project', 'Νέο έργο'))),
        strip, hint, body));
    }

    /* ----- filters and the public grid ----- */
    function drawFilters() {
      if (!S.loaded || S.pubErr || !S.pub.length) { filterHost.replaceChildren(); return; }
      const schools = Array.from(new Set(S.pub.map((p) => p.school).filter(Boolean))).sort();
      if (S.school !== 'all' && !schools.includes(S.school)) S.school = 'all';
      const f = [['all', t('All', 'Όλα'), S.pub.length], ['running', t('Running', 'Σε εξέλιξη'), nRunning()], ['done', t('Done', 'Ολοκληρωμένα'), nDone()]];
      const sel = el('select', { class: 'nm-input pr-sel', 'aria-label': t('School', 'Σχολείο'), onchange: (e) => { S.school = e.target.value; drawGrid(); } },
        el('option', { value: 'all' }, t('All schools', 'Όλα τα σχολεία')), ...schools.map((s) => el('option', { value: s, selected: s === S.school }, s)));
      filterHost.replaceChildren(el('div', { class: 'pr-filters' },
        el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': t('Show projects', 'Εμφάνιση έργων') }, f.map(([id, label, n]) => el('button', { type: 'button', class: S.filter === id ? 'on' : '', 'aria-pressed': S.filter === id ? 'true' : 'false', onclick: () => { S.filter = id; drawFilters(); drawGrid(); } }, label + ' ' + n))),
        schools.length > 1 ? sel : null));
    }
    function drawGrid() {
      if (!S.loaded) { gridHost.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); return; }
      if (S.pubErr) {
        gridHost.replaceChildren(el('div', null, el('div', { class: 'err', role: 'alert' }, t('The projects could not be loaded. ', 'Τα έργα δεν φορτώθηκαν. ') + errMsg(S.pubErr)),
          el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: reload }, t('Try again', 'Δοκιμάστε ξανά')))));
        return;
      }
      if (!S.pub.length) {
        gridHost.replaceChildren(el('div', { class: 'empty' }, el('b', { style: { display: 'block', color: 'var(--nm-ink-soft)' } }, t('No project is public yet.', 'Κανένα έργο δεν είναι δημόσιο ακόμη.')),
          t('When a teacher approves a team’s plan, it appears here. A class can start one in four steps.', 'Όταν ένας εκπαιδευτικός εγκρίνει το σχέδιο μιας ομάδας, εμφανίζεται εδώ. Μια τάξη μπορεί να ξεκινήσει ένα σε τέσσερα βήματα.'),
          el('div', { style: { marginTop: '14px' } }, el('a', { class: 'nm-btn nm-btn--primary', href: '#/start' }, ic('plus'), t('Start a project', 'Ξεκινήστε ένα έργο')))));
        return;
      }
      const list = S.pub.filter((p) => (S.filter === 'all' || (S.filter === 'done' ? phase(p) === 'done' : phase(p) !== 'done')) && (S.school === 'all' || p.school === S.school));
      list.sort((a, b) => b.at - a.at);
      gridHost.replaceChildren(el('section', { 'aria-labelledby': 'pr-pub-h' },
        el('div', { class: 'pr-sech' }, el('h2', { id: 'pr-pub-h' }, t('Public projects', 'Δημόσια έργα'), el('span', null, '·'), String(list.length)), el('p', { class: 'card-sub' }, t('Approved by a teacher. Anyone can see them.', 'Εγκεκριμένα από εκπαιδευτικό. Μπορεί να τα δει οποιοσδήποτε.'))),
        list.length ? el('div', { class: 'pr-grid' }, list.map((p) => card(p, false))) : el('div', { class: 'empty' }, t('No project matches this filter. Choose All.', 'Κανένα έργο δεν ταιριάζει σε αυτό το φίλτρο. Επιλέξτε «Όλα».'))));
    }

    /* ----- the detail sheet ----- */
    function closeSheet(silent) {
      if (!sheet) return;
      const s = sheet; sheet = null;
      s.scrim.remove(); document.removeEventListener('keydown', s.onKey);
      if (!silent) { try { history.replaceState(null, '', '#/projects'); } catch (e) { /* ignore */ } }
      if (s.prev && s.prev.focus && document.contains(s.prev)) s.prev.focus();
    }
    function openSheet(p, mine) {
      closeSheet(true);
      const prev = document.activeElement;
      const pr = progress(p), ph = phase(p);
      const sensors = p.sensors.map((s) => ({ name: sensorName(s), on: (s.eui && S.devices.get(s.eui) || {}).online, group: (s.eui && S.devices.get(s.eui) || {}).group }));
      const x = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: () => closeSheet() }, ic('x'), t('Close', 'Κλείσιμο'));
      const steps = p.steps.length
        ? el('ol', { class: 'pr-steps' }, p.steps.map((s) => el('li', { class: s.done ? 'done' : '' }, ic(s.done || p.status === 'done' ? 'checkc' : 'circle'), el('span', null, s.label), el('span', { class: 'sr-only' }, s.done ? t(' (done)', ' (έγινε)') : t(' (not yet)', ' (όχι ακόμη)')))))
        : el('p', { class: 'muted' }, t('The team has not listed its steps yet.', 'Η ομάδα δεν έχει καταγράψει ακόμη τα βήματά της.'));
      const body = el('div', { class: 'pr-sheet-b' },
        el('div', { class: 'pr-sheet-top' }, el('span', { class: 'pr-sch' }, el('i', { style: { background: schoolColor(p.school) } }), p.school || t('A school', 'Ένα σχολείο')), statusBadge(p, mine)),
        el('h2', { id: 'pr-sheet-h' }, p.question),
        el('p', { class: 'pr-team' }, ic('user'), teamLabel(p), p.title && p.title !== p.question ? el('span', { class: 'muted' }, ' · ' + p.title) : null),
        el('div', { class: 'pr-bigg' }, ring(pr, ph), el('div', null, el('b', null, pr.of ? t(pr.done + ' of ' + pr.of + ' steps done', pr.done + ' από ' + pr.of + ' βήματα έγιναν') : pr.pct == null ? t('Progress is not counted yet', 'Η πρόοδος δεν έχει μετρηθεί ακόμη') : t(pr.pct + '% done', pr.pct + '% ολοκληρώθηκε')),
          el('small', null, p.at ? t('Updated ' + SC.dateTime(p.at) + ' (' + SC.ago(p.at) + ')', 'Ενημερώθηκε ' + SC.dateTime(p.at) + ' (' + SC.ago(p.at) + ')') : ''))),
        el('div', { class: 'pr-eb' }, t('Steps', 'Βήματα')), steps,
        el('div', { class: 'pr-eb' }, t('Sensors it uses', 'Αισθητήρες που χρησιμοποιεί')),
        sensors.length ? el('ul', { class: 'pr-list' }, sensors.map((s) => el('li', null, ic('sensor'), el('span', null, s.name, s.group ? el('small', null, s.group) : null), s.on == null ? null : el('span', { class: 'nm-badge ' + (s.on ? 'nm-badge--ok' : 'nm-badge--warn') }, s.on ? t('Online', 'Σε λειτουργία') : t('Quiet', 'Σιωπηλός'))))) : el('p', { class: 'muted' }, t('No sensor chosen.', 'Δεν έχει επιλεγεί αισθητήρας.')),
        el('div', { class: 'pr-eb' }, t('Data it reads', 'Δεδομένα που διαβάζει')),
        dataList(p).length ? el('ul', { class: 'pr-list' }, dataList(p).map((d) => el('li', null, ic('db'), el('span', null, dataName(d), dataUnit(d) ? el('small', null, t('Unit: ', 'Μονάδα: ') + dataUnit(d)) : null)))) : el('p', { class: 'muted' }, t('No data chosen.', 'Δεν έχουν επιλεγεί δεδομένα.')),
        p.notes ? el('div', { class: 'pr-notebox' }, el('div', { class: 'pr-eb' }, t('Note from the team', 'Σημείωμα της ομάδας')), el('p', null, p.notes)) : null,
        mine && isBack(p) ? el('div', { class: 'pr-note' }, p.reviewNote ? t('Teacher note: ', 'Σημείωμα εκπαιδευτικού: ') + p.reviewNote : t('A teacher sent it back.', 'Ένας εκπαιδευτικός το έστειλε πίσω.')) : null,
        el('p', { class: 'pr-fine' }, ic('lock'), t('Sensors are listed by name. No position and no student name is shown.', 'Οι αισθητήρες αναφέρονται με το όνομά τους. Δεν εμφανίζεται θέση ούτε όνομα μαθητή.')));
      const box = el('aside', { class: 'pr-sheet nm-enter', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pr-sheet-h' },
        el('div', { class: 'pr-sheet-h' }, el('span', { class: 'pr-eb cu' }, t('Project', 'Έργο') + ' #' + p.id), x), body);
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
        else if (e.key === 'Tab') {
          const f = Array.from(box.querySelectorAll('a[href], button, [tabindex="0"]')).filter((n) => !n.disabled);
          if (!f.length) return;
          const i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
        }
      };
      const scrim = el('div', { class: 'pr-scrim', onclick: (e) => { if (e.target === scrim) closeSheet(); } }, box);
      document.body.append(scrim);
      document.addEventListener('keydown', onKey);
      sheet = { scrim, onKey, prev, id: p.id };
      try { history.replaceState(null, '', '#/projects/' + encodeURIComponent(p.id)); } catch (e) { /* ignore */ }
      x.focus();
    }

    /* ----- put it together ----- */
    function drawAll() {
      if (!alive) return;
      drawHead(); drawStats(); drawMine(); drawFilters(); drawGrid();
    }
    async function reload() {
      S.loaded = false; drawMine(); drawGrid();
      await loadAll();
      if (alive) { drawAll(); openFromRoute(); }
    }
    function openFromRoute() {
      const id = ctx.args && ctx.args[0];
      if (!id || sheet) return;
      const p = S.pub.concat(S.mine).find((x) => String(x.id) === String(id));
      if (p) openSheet(p, S.mine.includes(p));
      else if (S.loaded) SC.toast(t('That project is not public (yet).', 'Αυτό το έργο δεν είναι δημόσιο (ακόμη).'));
      ctx.args = [];
    }
    // A quiet look for a teacher's decision. Nothing is redrawn while a window is open or a field is being used.
    async function tick() {
      if (document.hidden || sheet || S.busyId || S.joinBusy) return;
      if (root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      await Promise.all([loadPublic(), loadMine()]);
      if (alive && !sheet) drawAll();
    }

    drawHead(); drawGrid();
    return (async () => {
      await loadAll();
      if (!alive) return () => {};
      drawAll(); openFromRoute();
      timer = setInterval(tick, 60000);
      return () => { alive = false; clearInterval(timer); closeSheet(true); };
    })();
  }

  SC.register('projects', {
    title: ['Running projects', 'Ενεργά έργα'],
    render(root, ctx) {
      SC.css('/site/pages/projects.css');
      return projects(root, ctx);
    },
  });
})();
