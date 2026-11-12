/* Approvals: the teacher-only page. Teachers check student tools and new accounts here; nothing goes public until a teacher says yes.
   API: /app/api/login, /app/api/logout, /app/api/schools, /app/api/manage/overview, /app/api/manage/users/:id/(approve|reject),
        /app/api/manage/audit (admin only), /studio/api/status, /studio/api/projects?scope=review|gallery, /studio/api/projects/:id/review.
   Tool previews are loaded from /studio/p/:id inside a sandboxed iframe (the site CSP blocks inline scripts in srcdoc). */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;

  /* ---------- small icons (static strings only) ---------- */
  const ICON = {
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
    back: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 016 6"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }
  // The two pictures on the gate cards (static, from the mockup).
  const ART_TOOLS = '<svg viewBox="0 0 150 170" aria-hidden="true"><defs><linearGradient id="apcT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD9A8"/><stop offset="1" stop-color="#F2A56B"/></linearGradient><linearGradient id="apcL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8963F"/><stop offset="1" stop-color="#B25A22"/></linearGradient><linearGradient id="apcR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8581F"/><stop offset="1" stop-color="#6E3412"/></linearGradient><radialGradient id="apcS"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="75" cy="156" rx="52" ry="9" fill="url(#apcS)"/><path d="M20 46L75 78V140L20 108Z" fill="url(#apcL)"/><path d="M130 46L75 78V140L130 108Z" fill="url(#apcR)"/><path d="M75 14L130 46L75 78L20 46Z" fill="url(#apcT)"/><path d="M75 78V140M20 46L75 78L130 46" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.4" stroke-linejoin="round"/><path d="M20 46L75 14L130 46" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M44 66l14 8M44 80l14 8" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/><circle cx="120" cy="14" r="3" fill="#FFD9A8"/><circle cx="14" cy="22" r="2" fill="#FFD9A8" opacity=".7"/></svg>';
  const ART_ACCT = '<svg viewBox="0 0 150 170" aria-hidden="true"><defs><linearGradient id="aprG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#BFF1FF"/><stop offset=".5" stop-color="#4CCBEA"/><stop offset="1" stop-color="#8f7bff"/></linearGradient><linearGradient id="aprD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d6d8a"/><stop offset="1" stop-color="#3a2f8f"/></linearGradient><radialGradient id="aprS"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><radialGradient id="aprO" cx=".35" cy=".3"><stop offset="0" stop-color="#E9FBFF"/><stop offset=".5" stop-color="#4CCBEA"/><stop offset="1" stop-color="#1b5d7a"/></radialGradient></defs><ellipse cx="75" cy="152" rx="54" ry="9" fill="url(#aprS)"/><g transform="translate(75 108) scale(1 .5)"><circle r="52" fill="none" stroke="url(#aprD)" stroke-width="24"/></g><g transform="translate(75 94) scale(1 .5)"><circle r="52" fill="none" stroke="url(#aprG)" stroke-width="24"/><circle r="63" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.2"/></g><circle cx="75" cy="58" r="17" fill="url(#aprO)"/><ellipse cx="69" cy="52" rx="5" ry="3" fill="#fff" opacity=".6"/><circle cx="126" cy="30" r="2.6" fill="#BFF1FF"/><circle cx="22" cy="40" r="2" fill="#BFF1FF" opacity=".7"/></svg>';
  function art(markup) { const d = el('div', { class: 'ap-gate-i', 'aria-hidden': 'true' }); d.innerHTML = markup; return d; }   // constants above, never data

  /* ---------- time ---------- */
  function span(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return t(m + ' min', m + (m === 1 ? ' λεπτό' : ' λεπτά'));
    const h = Math.round(m / 60);
    if (h < 48) return t(h + ' h', h + (h === 1 ? ' ώρα' : ' ώρες'));
    const d = Math.round(h / 24);
    return t(d + ' days', d + ' ημέρες');
  }
  const when = (ms) => (ms ? SC.dateTime(ms) : '');
  const kb = (n) => { const v = n / 1000; return (v < 10 ? v.toFixed(1) : String(Math.round(v))).replace('.', SC.lang === 'el' ? ',' : '.'); };
  // "today 14:05", "yesterday 09:30", "Tuesday 10 Nov, 16:40" (Cyprus time)
  const fmtWd = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'Asia/Nicosia', weekday: 'long', day: 'numeric', month: 'short' });
  const dayKey = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Nicosia' }).format(ms);
  function whenLong(ms) {
    if (!ms) return '';
    const k = dayKey(ms), now = Date.now();
    if (k === dayKey(now)) return t('today ', 'σήμερα ') + SC.time(ms);
    if (k === dayKey(now - 86400000)) return t('yesterday ', 'χθες ') + SC.time(ms);
    return fmtWd.format(ms) + ', ' + SC.time(ms);
  }
  const plural = (n, one, many, oneEl, manyEl) => (n === 1 ? t(n + ' ' + one, n + ' ' + oneEl) : t(n + ' ' + many, n + ' ' + manyEl));

  /* ---------- a sandboxed page asks the site for the live overview ---------- */
  function bridge(root) {
    let cache = null, at = 0;
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.type !== 'cities-get') return;
      if (!Array.from(root.querySelectorAll('iframe.ap-frame')).some((f) => f.contentWindow === e.source)) return;
      const reply = (o) => { o.type = 'cities-result'; o.id = d.id; e.source.postMessage(o, '*'); };
      if (d.what !== 'overview') return reply({ error: 'Unknown data request.' });
      if (cache && Date.now() - at < 60000) return reply({ data: cache });
      SC.api('/cities/api/overview').then((o) => { cache = o; at = Date.now(); reply({ data: o }); }).catch(() => reply({ error: 'Could not load the data.' }));
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }

  const errText = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');

  /* ================= signed out: a calm sign-in card ================= */
  function signIn(root, note) {
    root.append(SC.head({
      title: t('Teacher sign-in', 'Σύνδεση εκπαιδευτικών'),
      help: [
        'Teachers sign in with the name and password of their account, and choose their school. No account yet? Ask to join on the Join page: an admin approves teacher accounts. After signing in, this page shows the student tools and the new accounts that wait for a teacher.',
        'Οι εκπαιδευτικοί συνδέονται με το όνομα και τον κωδικό του λογαριασμού τους και επιλέγουν το σχολείο τους. Δεν έχετε λογαριασμό; Ζητήστε να μπείτε από τη σελίδα εγγραφής: τους λογαριασμούς εκπαιδευτικών τους εγκρίνει ο διαχειριστής. Μετά τη σύνδεση, η σελίδα δείχνει τα εργαλεία μαθητών και τους νέους λογαριασμούς που περιμένουν έγκριση.',
      ],
    }));
    const msg = el('div', { 'aria-live': 'polite' });
    if (note) msg.append(el('div', { class: 'nm-callout nm-callout--info ap-info' }, note));
    const school = el('select', { class: 'nm-input', id: 'ap-school', required: true });
    const name = el('input', { class: 'nm-input', id: 'ap-name', type: 'text', autocomplete: 'username', required: true, maxlength: 60 });
    const pw = el('input', { class: 'nm-input', id: 'ap-pw', type: 'password', autocomplete: 'current-password', required: true, maxlength: 200 });
    const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'submit' }, ic('lock'), t('Sign in', 'Σύνδεση'));
    const errBox = el('div', { 'aria-live': 'assertive' });
    let ready = false;

    async function loadSchools() {
      school.replaceChildren(el('option', { value: '' }, t('Loading schools', 'Φόρτωση σχολείων')));
      school.disabled = true;
      try {
        const r = await SC.api('/app/api/schools');
        const last = SC.store.get('sc.approvals.school') || '';
        school.replaceChildren(
          el('option', { value: '' }, t('Choose your school', 'Επιλέξτε το σχολείο σας')),
          ...(r.schools || []).map((s) => el('option', { value: String(s.id) }, s.name)),
          el('option', { value: 'staff' }, t('Admin (not tied to a school)', 'Διαχειριστής (χωρίς σχολείο)')));
        if (Array.from(school.options).some((o) => o.value === last)) school.value = last;
        school.disabled = false; ready = true;
      } catch (e) {
        school.replaceChildren(el('option', { value: '' }, t('Schools could not be loaded', 'Δεν φορτώθηκαν τα σχολεία')));
        errBox.replaceChildren(el('div', { class: 'err', role: 'alert' }, errText(e), ' ', el('button', { class: 'link', type: 'button', onclick: () => { errBox.replaceChildren(); loadSchools(); } }, t('Try again', 'Δοκιμάστε ξανά'))));
      }
    }

    const form = el('form', { class: 'ap-form', novalidate: true },
      el('div', { class: 'ap-field' }, el('label', { for: 'ap-school' }, t('School', 'Σχολείο')), school),
      el('div', { class: 'ap-field' }, el('label', { for: 'ap-name' }, t('Name', 'Όνομα')), name),
      el('div', { class: 'ap-field' }, el('label', { for: 'ap-pw' }, t('Password', 'Κωδικός')), pw),
      errBox,
      el('div', null, go));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errBox.replaceChildren();
      const bad = (m) => errBox.replaceChildren(el('div', { class: 'err', role: 'alert' }, m));
      if (!ready || !school.value) return bad(t('Choose your school first.', 'Επιλέξτε πρώτα το σχολείο σας.'));
      if (!name.value.trim() || !pw.value) return bad(t('Type your name and your password.', 'Πληκτρολογήστε το όνομα και τον κωδικό σας.'));
      go.disabled = true;
      try {
        const r = await SC.api('/app/api/login', { method: 'POST', body: { name: name.value.trim(), password: pw.value, school_id: school.value } });
        const u = r && r.user;
        SC.store.set('sc.approvals.school', school.value);
        if (u && (u.role === 'teacher' || u.role === 'admin') && u.status === 'active') { location.reload(); return; }
        // Not a teacher, or not approved yet: do not leave a session behind.
        try { await SC.api('/app/api/logout', { method: 'POST', body: {} }); } catch (e) { /* the cookie ends by itself */ }
        go.disabled = false;
        if (u && u.status === 'pending') bad(t('Your account is still waiting for approval. Ask an admin or your head teacher.', 'Ο λογαριασμός σας περιμένει ακόμη έγκριση. Ρωτήστε έναν διαχειριστή ή τον διευθυντή σας.'));
        else bad(t('That account is not a teacher account. Students and visitors do not need to sign in to use this site.', 'Αυτός δεν είναι λογαριασμός εκπαιδευτικού. Οι μαθητές και οι επισκέπτες δεν χρειάζεται να συνδεθούν για να χρησιμοποιήσουν τον ιστότοπο.'));
      } catch (e) {
        go.disabled = false;
        if (e.status === 401) bad(t('That name and password do not match for this school. Check the school too.', 'Το όνομα και ο κωδικός δεν ταιριάζουν για αυτό το σχολείο. Ελέγξτε και το σχολείο.'));
        else if (e.status === 403) bad(t('This account cannot sign in. Ask an admin.', 'Αυτός ο λογαριασμός δεν μπορεί να συνδεθεί. Ρωτήστε έναν διαχειριστή.'));
        else if (e.status === 429) bad(t('Too many tries. Wait a few minutes, then try again.', 'Πάρα πολλές προσπάθειες. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.'));
        else bad(errText(e));
      }
    });

    root.append(el('div', { class: 'ap' },
      el('section', { class: 'nm-card nm-card--glow ap-signin', 'aria-labelledby': 'ap-si-h' },
        el('span', { class: 'ap-tic', style: { width: '46px', marginBottom: '2px' } }, ic('shield')),
        el('h2', { id: 'ap-si-h' }, t('Teachers sign in here', 'Εδώ συνδέονται οι εκπαιδευτικοί')),
        el('p', { class: 'ap-lead' }, t('Sign in to approve student tools and new accounts. Nothing a team builds is public until a teacher says yes.', 'Συνδεθείτε για να εγκρίνετε εργαλεία μαθητών και νέους λογαριασμούς. Τίποτα από ό,τι φτιάχνει μια ομάδα δεν γίνεται δημόσιο αν δεν πει ναι ένας εκπαιδευτικός.')),
        msg, form,
        el('p', { class: 'ap-visitor' }, t('This page is for teachers. Just visiting? You never need to sign in: everything public on this site opens without an account. ', 'Αυτή η σελίδα είναι για εκπαιδευτικούς. Απλώς επισκέπτεστε; Δεν χρειάζεται ποτέ να συνδεθείτε: ό,τι είναι δημόσιο σε αυτόν τον ιστότοπο ανοίγει χωρίς λογαριασμό. '), el('a', { href: '#/' }, t('Back to the whole project', 'Πίσω στο ολόκληρο έργο')), ' · ', el('a', { href: '#/join' }, t('No account yet? Ask to join', 'Δεν έχετε λογαριασμό; Ζητήστε να μπείτε'))))));
    loadSchools();
    return () => {};
  }

  /* ================= signed in ================= */
  const TRAIL = {
    submitted: ['#8FE3F7', 'send'], account: ['#C4B8FF', 'user'], back: ['#F2CF86', 'back'], approved: ['#9BD88F', 'checkc'],
    declined: ['#FFA69B', 'x'], accountok: ['#9BD88F', 'user'],
  };

  function approvals(root, me) {
    const isAdmin = me.role === 'admin';
    const school = me.school || null;
    const S = {
      tab: 'tools', curId: null, tools: [], review: { ok: false, error: null }, ov: null, ovError: null, gallery: [], audit: null, auditError: null,
      decisions: [], maxHtml: 120000, demo: false, loaded: false, busy: false,
    };
    const stopBridge = bridge(root);
    let timer = 0, alive = true;

    const shown = { n: 0 };
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const demoTag = [];
    const headHost = el('div');
    const wrap = el('div', { class: 'ap' });
    const body = el('div', { class: 'ap' });
    root.append(headHost, wrap);

    /* ----- data ----- */
    const accounts = () => (S.ov ? S.ov.members.filter((m) => m.status === 'pending' && (isAdmin || m.role === 'student')) : []);
    const schoolOf = (id) => (S.ov ? S.ov.schools.find((s) => s.id === id) : null);
    const teamOf = (id) => (S.ov && id ? S.ov.teams.find((x) => x.id === id) : null);
    const curTool = () => S.tools.find((p) => p.id === S.curId) || S.tools[0] || null;

    async function fetchAll() {
      const jobs = [
        SC.api('/app/api/manage/overview'),
        SC.api('/studio/api/projects?scope=review'),
        SC.api('/studio/api/status'),
        SC.api('/studio/api/projects?scope=gallery'),
        isAdmin ? SC.api('/app/api/manage/audit') : Promise.resolve(null),
      ];
      const [ov, rv, st, ga, au] = await Promise.allSettled(jobs);
      const gone = [ov, rv].find((x) => x.status === 'rejected' && (x.reason.status === 401));
      if (gone) { const e = new Error('signed-out'); e.signedOut = true; throw e; }
      S.ov = ov.status === 'fulfilled' ? ov.value : S.ov; S.ovError = ov.status === 'rejected' ? ov.reason : null;
      if (rv.status === 'fulfilled') { S.tools = rv.value.projects || []; S.review = { ok: true, error: null }; } else S.review = { ok: false, error: rv.reason };
      if (st.status === 'fulfilled') { S.maxHtml = st.value.maxHtml || S.maxHtml; S.demo = !!st.value.demo; }
      if (ga.status === 'fulfilled') S.gallery = ga.value.projects || [];
      if (au.status === 'fulfilled' && au.value) { S.audit = au.value.rows || []; S.auditError = null; } else if (au.status === 'rejected') S.auditError = au.reason;
      if (!S.tools.some((p) => p.id === S.curId)) S.curId = S.tools[0] ? S.tools[0].id : null;
    }

    /* ----- head, banner, gates, tabs ----- */
    function mkHead() {
      return SC.head({
        title: t('Approve what goes public.', 'Εγκρίνετε ό,τι γίνεται δημόσιο.'),
        lede: t('Check each tool and each new account. Nothing is public until a teacher says yes. Every decision is saved in the trail, so students can see why.', 'Ελέγξτε κάθε εργαλείο και κάθε νέο λογαριασμό. Τίποτα δεν γίνεται δημόσιο αν δεν πει ναι ένας εκπαιδευτικός. Κάθε απόφαση καταγράφεται στο ιστορικό, ώστε οι μαθητές να βλέπουν το γιατί.'),
        tags: S.demo ? [{ text: t('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        help: [
          'Tools that student teams send for review wait here, one card at a time. Open the preview, tick your three checks (safe, honest, clear), then approve it, or send it back with a note the team can read. New student accounts wait on the Accounts tab, and the People tab resets a lost password. Visitors never see this page.',
          'Τα εργαλεία που στέλνουν οι ομάδες για έλεγχο περιμένουν εδώ, μία κάρτα τη φορά. Ανοίξτε την προεπισκόπηση, επιλέξτε τους τρεις ελέγχους (ασφαλές, ειλικρινές, κατανοητό) και μετά εγκρίνετέ το ή στείλτε το πίσω με σημείωμα που μπορεί να διαβάσει η ομάδα. Οι νέοι λογαριασμοί μαθητών περιμένουν στην καρτέλα Λογαριασμοί και η καρτέλα Άτομα κάνει επαναφορά ενός χαμένου κωδικού. Οι επισκέπτες δεν βλέπουν ποτέ αυτή τη σελίδα.',
        ],
      });
    }
    function drawHead() { headHost.replaceChildren(mkHead()); }

    async function signOut(btn) {
      btn.disabled = true;
      try { await SC.api('/app/api/logout', { method: 'POST', body: {} }); } catch (e) { /* reload anyway */ }
      location.reload();
    }

    function banner() {
      const who = isAdmin
        ? t('Signed in as an admin, for all schools.', 'Συνδεδεμένοι ως διαχειριστής, για όλα τα σχολεία.')
        : t('Signed in as a teacher at ' + (school ? school.name : 'your school') + '.', 'Συνδεδεμένοι ως εκπαιδευτικός στο ' + (school ? school.name : 'σχολείο σας') + '.');
      const out = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, t('Sign out', 'Αποσύνδεση'));
      out.addEventListener('click', () => signOut(out));
      return el('div', { class: 'ap-banner', role: 'region', 'aria-label': t('Teacher area', 'Χώρος εκπαιδευτικών') },
        el('span', { class: 'ap-tic' }, ic('shield')),
        el('div', { class: 'ap-bt' }, el('b', null, t('Teacher area. ', 'Χώρος εκπαιδευτικών. ')), el('b', { class: 'soft' }, who),
          el('div', { class: 'l2' }, t('Students and visitors never see this page. You see exact vehicle positions. Everyone else sees them about 2 hours late and rounded to about 1 km.', 'Οι μαθητές και οι επισκέπτες δεν βλέπουν ποτέ αυτή τη σελίδα. Εσείς βλέπετε τις ακριβείς θέσεις των οχημάτων. Όλοι οι άλλοι τις βλέπουν με καθυστέρηση περίπου 2 ωρών και στρογγυλοποιημένες στο 1 χλμ.'))),
        el('div', { class: 'ap-bb' }, el('span', { class: 'nm-badge nm-badge--warn' }, t('Teacher sign-in', 'Σύνδεση εκπαιδευτικού')), out));
    }

    const gatesHost = el('section', { class: 'ap-gates', 'aria-label': t('What is waiting', 'Τι περιμένει') });
    const tabsHost = el('div', { class: 'ap-tabs', role: 'tablist', 'aria-label': t('Approval sections', 'Ενότητες εγκρίσεων') });
    const paneHost = el('div', { role: 'tabpanel', id: 'ap-pane' });
    const trailHost = el('aside', { class: 'nm-card ap-trailc', 'aria-labelledby': 'ap-trail-h' });
    const weekHost = el('aside', { class: 'nm-card ap-week', 'aria-labelledby': 'ap-week-h' });
    const moreHost = el('aside', { class: 'nm-card ap-more', 'aria-labelledby': 'ap-more-h' });

    // [English, Greek] for "at <school>"
    const at = () => (isAdmin ? ['at all schools', 'σε όλα τα σχολεία'] : school ? ['at ' + school.name, 'στο ' + school.name] : ['at your school', 'στο σχολείο σας']);

    function drawGates() {
      const nT = S.tools.length, nA = accounts().length;
      const oldest = S.tools.reduce((m, p) => Math.min(m, p.updatedAt || Date.now()), Date.now());
      const g1 = el('article', { class: 'nm-card nm-card--glow ap-gate' + (nT ? '' : ' zero') },
        el('div', null,
          el('div', { class: 'ap-eb cu' }, t('Gate 1', 'Πύλη 1')),
          el('div', { class: 'ap-gate-n' }, S.review.ok ? String(nT) : '–'),
          el('h3', null, t('Tools waiting', 'Εργαλεία σε αναμονή')),
          el('p', null, !S.review.ok ? t('The list could not be loaded just now.', 'Η λίστα δεν φορτώθηκε αυτή τη στιγμή.')
            : nT ? t('Student tools sent for review by teams ' + at()[0] + '. The oldest has waited ' + span(Date.now() - oldest) + '.', 'Εργαλεία που έστειλαν για έλεγχο ομάδες ' + at()[1] + '. Το παλαιότερο περιμένει ' + span(Date.now() - oldest) + '.')
              : t('Nothing is waiting. A tool shows up here when a team presses Send to teacher.', 'Δεν περιμένει τίποτα. Ένα εργαλείο εμφανίζεται εδώ όταν μια ομάδα πατήσει «Αποστολή στον εκπαιδευτικό».')),
          nT ? el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => setTab('tools', true) }, t('Review ' + nT + (nT === 1 ? ' tool' : ' tools'), 'Έλεγχος ' + nT + (nT === 1 ? ' εργαλείου' : ' εργαλείων'))) : null),
        art(ART_TOOLS));
      const g2 = el('article', { class: 'nm-card ap-gate cy' + (nA ? '' : ' zero') },
        el('div', null,
          el('div', { class: 'ap-eb cy' }, t('Gate 2', 'Πύλη 2')),
          el('div', { class: 'ap-gate-n' }, S.ov ? String(nA) : '–'),
          el('h3', null, t('Accounts to approve', 'Λογαριασμοί προς έγκριση')),
          el('p', null, !S.ov ? t('The list could not be loaded just now.', 'Η λίστα δεν φορτώθηκε αυτή τη στιγμή.')
            : nA ? (nA === 1 ? t('Someone asked to join' + (isAdmin ? '' : ' ' + (school ? school.name : 'your school')) + '. Check you know them, then let them in.', 'Κάποιος ζήτησε να μπει' + (isAdmin ? '' : ' ' + at()[1]) + '. Ελέγξτε ότι τον γνωρίζετε και μετά αφήστε τον να μπει.')
              : t('People asked to join' + (isAdmin ? '' : ' ' + (school ? school.name : 'your school')) + '. Check you know them, then let them in.', 'Άτομα ζήτησαν να μπουν' + (isAdmin ? '' : ' ' + at()[1]) + '. Ελέγξτε ότι τα γνωρίζετε και μετά αφήστε τα να μπουν.'))
              : t('No one is waiting to join.', 'Κανείς δεν περιμένει να μπει.')),
          nA ? el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => setTab('accounts', true) }, t('Review ' + nA + (nA === 1 ? ' account' : ' accounts'), 'Έλεγχος ' + nA + (nA === 1 ? ' λογαριασμού' : ' λογαριασμών'))) : null),
        art(ART_ACCT));
      gatesHost.replaceChildren(g1, g2);
    }

    const TABS = () => [
      ['tools', t('Tools waiting', 'Εργαλεία σε αναμονή') + ' · ' + S.tools.length],
      ['accounts', t('Accounts', 'Λογαριασμοί') + ' · ' + accounts().length],
      ['people', t('People', 'Άτομα')],
      ['rules', t('Approval checklist', 'Λίστα ελέγχου')],
    ];
    function drawTabs() {
      tabsHost.replaceChildren(...TABS().map(([id, label]) => el('button', {
        class: 'nm-tab' + (S.tab === id ? ' on' : ''), type: 'button', role: 'tab', id: 'ap-tab-' + id, 'aria-selected': S.tab === id ? 'true' : 'false', 'aria-controls': 'ap-pane', tabindex: S.tab === id ? 0 : -1,
        onclick: () => setTab(id), onkeydown: (e) => {
          const ids = TABS().map((x) => x[0]); const i = ids.indexOf(id);
          const next = e.key === 'ArrowRight' ? ids[(i + 1) % ids.length] : e.key === 'ArrowLeft' ? ids[(i + ids.length - 1) % ids.length] : null;
          if (next) { e.preventDefault(); setTab(next); const b = tabsHost.querySelector('#ap-tab-' + next); if (b) b.focus(); }
        },
      }, label)));
      paneHost.setAttribute('aria-labelledby', 'ap-tab-' + S.tab);
    }
    function setTab(id, focus) {
      S.tab = id; drawTabs(); drawPane();
      if (focus) { const h = paneHost.querySelector('h2, h3'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: false }); } }
    }

    /* ----- one tool at a time ----- */
    function reviewCard(p, i, n) {
      const waited = Date.now() - (p.updatedAt || Date.now());
      const checks = [['safe', t('Safe', 'Ασφαλές'), t('No names, photos or exact positions.', 'Χωρίς ονόματα, φωτογραφίες ή ακριβείς θέσεις.')],
        ['honest', t('Honest', 'Ειλικρινές'), t('The numbers match the data it reads.', 'Οι αριθμοί ταιριάζουν με τα δεδομένα που διαβάζει.')],
        ['clear', t('Clear', 'Κατανοητό'), t('A classmate would understand it.', 'Ένας συμμαθητής θα το καταλάβαινε.')]];
      const boxes = checks.map(([id]) => el('input', { type: 'checkbox', id: 'ap-ck-' + id }));
      const note = el('textarea', { class: 'nm-input ap-note', id: 'ap-note', maxlength: 300, 'aria-label': t('Note to the team', 'Σημείωμα προς την ομάδα'), placeholder: t('Note to the team. Shown to them if you send it back.', 'Σημείωμα προς την ομάδα. Το διαβάζουν αν στείλετε το εργαλείο πίσω.') });
      const errBox = el('div', { 'aria-live': 'assertive' });
      const ok = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: true }, ic('checkc'), t('Approve and publish', 'Έγκριση και δημοσίευση'));
      const back = el('button', { class: 'nm-btn', type: 'button', disabled: true }, ic('back'), t('Send back', 'Επιστροφή'));
      const skip = n > 1 ? el('button', { class: 'nm-btn nm-btn--ghost', type: 'button', onclick: () => { S.curId = S.tools[(S.tools.indexOf(p) + 1) % S.tools.length].id; drawPane(); focusCard(); } }, t('Skip for now', 'Προσωρινή παράλειψη')) : null;
      const hint = el('p', { class: 'ap-hint', id: 'ap-hint' });
      const sync = () => {
        const all = boxes.every((b) => b.checked), hasNote = note.value.trim().length > 0;
        ok.disabled = S.busy || !all; back.disabled = S.busy || !hasNote;
        hint.textContent = !all ? t('Tick the three checks to approve. To send it back, write a short note for the team.', 'Επιλέξτε τους τρεις ελέγχους για να εγκρίνετε. Για να το στείλετε πίσω, γράψτε ένα σύντομο σημείωμα για την ομάδα.')
          : t('Ready to approve. The tool becomes public for everyone straight away.', 'Έτοιμο για έγκριση. Το εργαλείο γίνεται αμέσως δημόσιο για όλους.');
      };
      boxes.forEach((b) => b.addEventListener('change', sync));
      note.addEventListener('input', sync);
      sync();

      async function decide(decision) {
        if (S.busy) return;
        S.busy = true; sync(); errBox.replaceChildren();
        try {
          await SC.api('/studio/api/projects/' + p.id + '/review', { method: 'POST', body: { decision, note: note.value.trim() } });
          S.decisions.unshift({ at: Date.now(), kind: decision === 'approve' ? 'approved' : 'back', title: p.title, who: p.author_label, note: note.value.trim(), id: p.id });
          S.tools = S.tools.filter((x) => x.id !== p.id);
          S.curId = S.tools[0] ? S.tools[0].id : null;
          const m = decision === 'approve' ? t('Approved. The tool is now public.', 'Εγκρίθηκε. Το εργαλείο είναι πλέον δημόσιο.') : t('Sent back to the team with your note.', 'Επιστράφηκε στην ομάδα με το σημείωμά σας.');
          SC.toast(m); live.textContent = m + ' ' + plural(S.tools.length, 'tool still waiting.', 'tools still waiting.', 'εργαλείο περιμένει ακόμη.', 'εργαλεία περιμένουν ακόμη.');
          S.busy = false;
          drawGates(); drawTabs(); drawPane(); drawTrail(); drawWeek(); focusCard();
          if (isAdmin) refreshAudit();
        } catch (e) {
          S.busy = false; sync();
          if (e.status === 401) { signedOut(); return; }
          errBox.replaceChildren(el('div', { class: 'err', role: 'alert' }, e.status === 404
            ? t('This tool is no longer waiting. Someone may have decided already. The list will refresh.', 'Αυτό το εργαλείο δεν περιμένει πια. Ίσως κάποιος αποφάσισε ήδη. Η λίστα θα ανανεωθεί.')
            : t('The decision was not saved: ', 'Η απόφαση δεν αποθηκεύτηκε: ') + errText(e)));
          if (e.status === 404) reload(true);
        }
      }
      ok.addEventListener('click', () => decide('approve'));
      back.addEventListener('click', () => decide('reject'));

      const flagged = (p.flags || []).includes('coordinates');
      const size = (p.bytes || 0);
      const idea = p.idea && String(p.idea).trim();
      return el('article', { class: 'nm-card nm-card--glow ap-top', 'aria-labelledby': 'ap-card-h' },
        el('div', { class: 'ap-top-h' }, el('span', { class: 'ap-eb cu', id: 'ap-counter' }, t('Card ' + i + ' of ' + n, 'Κάρτα ' + i + ' από ' + n)), el('span', { class: 'ap-sp' }),
          el('span', { class: 'nm-badge nm-badge--warn' }, el('i', { class: 'ap-dot' }), t('Waiting ' + span(waited), 'Αναμονή ' + span(waited)))),
        el('h2', { id: 'ap-card-h', tabindex: -1 }, p.title),
        el('div', { class: 'ap-who' }, el('i'), el('span', null, p.author_label ? String(p.author_label).replace(', ', ' · ') : t('Unknown team', 'Άγνωστη ομάδα')), p.updatedAt ? [el('span', { class: 'dim' }, '·'), el('span', null, t('Sent ', 'Στάλθηκε ') + whenLong(p.updatedAt))] : null),
        el('div', { class: 'ap-preview' }, el('iframe', { class: 'ap-frame', sandbox: 'allow-scripts', src: '/studio/p/' + p.id, title: t('Preview of ' + p.title, 'Προεπισκόπηση: ' + p.title), referrerpolicy: 'no-referrer' }),
          el('span', { class: 'ap-pvtag' }, ic('lock'), t('Preview in a safe box, no internet', 'Προεπισκόπηση σε ασφαλές κουτί, χωρίς internet')),
          el('a', { class: 'nm-btn nm-btn--sm ap-full', href: '/studio/p/' + p.id, target: '_blank', rel: 'noopener' }, ic('ext'), t('Open full screen', 'Άνοιγμα σε πλήρη οθόνη'))),
        el('div', { class: 'ap-cols2' },
          el('div', null, el('div', { class: 'ap-eb' }, t('What the team says it does', 'Τι λέει η ομάδα ότι κάνει')),
            idea ? el('p', null, '“' + idea + '”') : el('p', { class: 'none' }, t('The team did not write a description.', 'Η ομάδα δεν έγραψε περιγραφή.'))),
          el('div', null, el('div', { class: 'ap-eb' }, t('Checked by the studio', 'Έλεγχος από το στούντιο')),
            el('ul', { class: 'ap-autoc' },
              el('li', null, ic('checkc'), t('Runs with no internet', 'Τρέχει χωρίς internet')),
              el('li', null, ic('checkc'), t('Reads only the delayed, rounded overview', 'Διαβάζει μόνο τη συνολική εικόνα με καθυστέρηση και στρογγυλοποίηση')),
              el('li', null, ic('checkc'), t(kb(size) + ' KB of the ' + kb(S.maxHtml) + ' KB limit', kb(size) + ' KB από το όριο των ' + kb(S.maxHtml) + ' KB')),
              flagged
                ? el('li', { class: 'warn' }, ic('warn'), t('The page seems to contain map coordinates. Look for exact positions before you approve.', 'Η σελίδα φαίνεται να περιέχει συντεταγμένες. Ελέγξτε για ακριβείς θέσεις πριν εγκρίνετε.'))
                : el('li', null, ic('checkc'), t('No map coordinates found', 'Δεν βρέθηκαν συντεταγμένες χάρτη'))))),
        el('hr', { class: 'ap-hr' }),
        el('div', { class: 'ap-eb' }, t('Your three checks', 'Οι τρεις έλεγχοί σας')),
        el('div', { class: 'ap-chk3' }, checks.map(([id, h, small], k) => el('label', { for: 'ap-ck-' + id }, boxes[k], el('span', null, el('b', null, h), el('small', null, small))))),
        note, hint, errBox,
        el('div', { class: 'ap-decide' }, ok, back, skip));
    }

    function focusCard() { const h = paneHost.querySelector('h2, h3'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }

    function toolsPane() {
      if (!S.review.ok) return errCard(S.review.error, () => reload());
      const n = S.tools.length;
      shown.n = n;
      if (!n) {
        return el('article', { class: 'nm-card nm-card--glow ap-clear' }, el('div', { class: 'ap-eb cu' }, t('All clear', 'Όλα εντάξει')), el('h2', null, t('No tools are waiting.', 'Κανένα εργαλείο δεν περιμένει.')),
          el('p', null, t('When a team presses Send to teacher in the Build studio, its tool appears here with a preview. Approved tools join the public gallery.', 'Όταν μια ομάδα πατήσει «Αποστολή στον εκπαιδευτικό» στο στούντιο, το εργαλείο της εμφανίζεται εδώ με προεπισκόπηση. Τα εγκεκριμένα εργαλεία μπαίνουν στη δημόσια συλλογή.')),
          el('div', { style: { marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap' } }, el('a', { class: 'nm-btn', href: '#/studio' }, t('Open the Build studio', 'Άνοιγμα του στούντιο'))));
      }
      const p = curTool(), i = S.tools.indexOf(p) + 1;
      shown.n = n;
      const next = n > 1 ? S.tools[i % n] : null;
      return el('div', { class: 'ap-stack' }, reviewCard(p, i, n),
        next ? el('div', { class: 'ap-u1' }, el('span', { class: 'ap-eb' }, t('Next', 'Επόμενο')), el('span', null, el('b', null, next.title), ' · ' + (next.author_label || ''))) : null,
        n > 2 ? el('div', { class: 'ap-u2' }) : null);
    }

    /* ----- accounts ----- */
    function acctCard(m) {
      const sc = schoolOf(m.school_id), tm = teamOf(m.team_id);
      const teams = S.ov ? S.ov.teams.filter((x) => x.school_id === m.school_id) : [];
      const err = el('div', { 'aria-live': 'assertive' });
      const makes = m.role === 'student' && !tm && m.team_request;
      const ok = el('button', { class: 'nm-btn nm-btn--primary', type: 'button' }, ic('checkc'), makes ? t('Approve and create the team', 'Έγκριση και δημιουργία ομάδας') : t('Approve account', 'Έγκριση λογαριασμού'));
      const no = el('button', { class: 'nm-btn nm-btn--danger-outline', type: 'button' }, t('Decline', 'Απόρριψη'));
      // A teacher can change the team before approving. The first choice is what the student asked for.
      const pick = m.role === 'student' && teams.length ? el('select', { class: 'nm-input ap-team', id: 'ap-team-' + m.id, 'aria-label': t('Team', 'Ομάδα') },
        el('option', { value: '' }, tm ? t('Their choice: ' + tm.name, 'Η επιλογή τους: ' + tm.name) : m.team_request ? t('Create the team “' + m.team_request + '”', 'Δημιουργία της ομάδας «' + m.team_request + '»') : t('No team yet', 'Χωρίς ομάδα')),
        ...teams.filter((x) => !tm || x.id !== tm.id).map((x) => el('option', { value: String(x.id) }, x.name))) : null;
      async function act(kind) {
        ok.disabled = no.disabled = true; err.replaceChildren();
        try {
          const body = {};
          if (kind === 'approve' && pick && pick.value) body.team_id = Number(pick.value);
          await SC.api('/app/api/manage/users/' + m.id + '/' + kind, { method: 'POST', body });
          S.decisions.unshift({ at: Date.now(), kind: kind === 'approve' ? 'accountok' : 'declined', title: m.name, who: sc ? sc.short || sc.name : '', id: 'u' + m.id });
          S.ov.members = S.ov.members.filter((x) => x.id !== m.id);
          const msg = kind === 'approve' ? t('Account approved.', 'Ο λογαριασμός εγκρίθηκε.') : t('Account declined.', 'Ο λογαριασμός απορρίφθηκε.');
          SC.toast(msg); live.textContent = msg;
          drawGates(); drawTabs(); drawPane(); drawTrail(); drawWeek(); focusCard();
          refreshOv();
          if (isAdmin) refreshAudit();
        } catch (e) {
          ok.disabled = no.disabled = false;
          if (e.status === 401) { signedOut(); return; }
          err.replaceChildren(el('div', { class: 'err', role: 'alert' }, e.status === 400 || e.status === 404 ? t('This account is no longer waiting. The list will refresh.', 'Αυτός ο λογαριασμός δεν περιμένει πια. Η λίστα θα ανανεωθεί.') : errText(e)));
          if (e.status === 400 || e.status === 404) reload(true);
        }
      }
      ok.addEventListener('click', () => act('approve'));
      no.addEventListener('click', () => SC.modal({
        title: t('Decline this account?', 'Απόρριψη αυτού του λογαριασμού;'),
        body: el('p', null, t(m.name + ' will not be able to sign in. They can ask again with a new account request.', 'Ο/Η ' + m.name + ' δεν θα μπορεί να συνδεθεί. Μπορεί να ζητήσει ξανά με νέο αίτημα λογαριασμού.')),
        actions: [{ label: t('Keep waiting', 'Να περιμένει') }, { label: t('Decline', 'Απόρριψη'), primary: true, run: () => act('reject') }],
      }));
      const roleTxt = m.role === 'teacher' ? t('Teacher account', 'Λογαριασμός εκπαιδευτικού') : t('Student account', 'Λογαριασμός μαθητή');
      return el('article', { class: 'nm-card nm-card--glow ap-acct', 'aria-label': roleTxt + ': ' + m.name },
        el('div', { class: 'ap-top-h' }, el('span', { class: 'ap-eb cy' }, t('Account request', 'Αίτημα λογαριασμού')), el('span', { class: 'ap-sp' }),
          el('span', { class: 'nm-badge nm-badge--warn' }, el('i', { class: 'ap-dot' }), t('Waiting ' + span(Date.now() - (m.created_at || Date.now())), 'Αναμονή ' + span(Date.now() - (m.created_at || Date.now()))))),
        el('h3', null, m.name),
        el('div', { class: 'ap-who' }, el('span', null, roleTxt), el('span', { class: 'dim' }, '·'), el('span', null, sc ? sc.name : t('Unknown school', 'Άγνωστο σχολείο')), el('span', { class: 'dim' }, '·'), el('span', null, t('Asked ', 'Ζήτησε ') + when(m.created_at))),
        el('ul', { class: 'ap-autoc' },
          el('li', null, ic('checkc'), t('Chose this city themselves', 'Διάλεξε μόνος/η την πόλη')),
          m.role === 'teacher' ? el('li', { class: 'neutral' }, ic('user'), t('Teacher accounts need an admin. Check you know this person.', 'Οι λογαριασμοί εκπαιδευτικών χρειάζονται διαχειριστή. Ελέγξτε ότι γνωρίζετε αυτό το πρόσωπο.'))
            : tm ? el('li', null, ic('checkc'), t('Chose the team: ' + tm.name, 'Διάλεξε την ομάδα: ' + tm.name))
              : m.team_request ? el('li', { class: 'warn' }, ic('warn'), t('Asks for a new team: ' + m.team_request + '. Approving creates it.', 'Ζητά νέα ομάδα: ' + m.team_request + '. Η έγκριση τη δημιουργεί.'))
                : el('li', { class: 'neutral' }, ic('user'), t('No team chosen. You can set one below.', 'Δεν έχει επιλεγεί ομάδα. Μπορείτε να ορίσετε μία παρακάτω.'))),
        pick ? el('div', { class: 'ap-field', style: { marginTop: '14px', maxWidth: '360px' } }, el('label', { for: 'ap-team-' + m.id }, t('Team to approve into', 'Ομάδα για την έγκριση')), pick) : null,
        err,
        el('div', { class: 'ap-decide' }, ok, no));
    }
    async function refreshOv() {
      try { S.ov = await SC.api('/app/api/manage/overview'); S.ovError = null; } catch (e) { /* the next quiet refresh tries again */ }
      if (alive && S.tab === 'people' && !paneHost.contains(document.activeElement)) drawPane();
    }
    function accountsPane() {
      if (!S.ov) return errCard(S.ovError, () => reload());
      const list = accounts();
      if (!list.length) {
        return el('article', { class: 'nm-card nm-card--glow ap-clear' }, el('div', { class: 'ap-eb cy' }, t('All clear', 'Όλα εντάξει')), el('h2', null, t('No accounts are waiting.', 'Κανένας λογαριασμός δεν περιμένει.')),
          el('p', null, isAdmin ? t('When someone asks to join, their account appears here until you let them in.', 'Όταν κάποιος ζητήσει να μπει, ο λογαριασμός του εμφανίζεται εδώ μέχρι να τον εγκρίνετε.')
            : t('When a student asks to join ' + (school ? school.name : 'your school') + ', their account appears here until you let them in.', 'Όταν ένας μαθητής ζητήσει να μπει ' + at()[1] + ', ο λογαριασμός του εμφανίζεται εδώ μέχρι να τον εγκρίνετε.')));
      }
      return el('div', { class: 'ap-accts' }, list.map(acctCard), !isAdmin ? el('p', { class: 'muted', style: { margin: '2px 4px 0', fontSize: '13px' } }, t('Teacher accounts are approved by an admin.', 'Τους λογαριασμούς εκπαιδευτικών τους εγκρίνει ένας διαχειριστής.')) : null);
    }

    /* ----- people: everyone approved, and the lost-password button ----- */
    function peoplePane() {
      if (!S.ov) return errCard(S.ovError, () => reload());
      const q = (S.q || '').trim().toLowerCase();
      const list = S.ov.members.filter((m) => m.status === 'active' && m.id !== me.id && (isAdmin || m.role === 'student') && (!q || String(m.name).toLowerCase().includes(q)));
      const search = el('input', { class: 'nm-input ap-search', type: 'search', id: 'ap-q', value: S.q || '', placeholder: t('Find a name', 'Βρείτε ένα όνομα'), 'aria-label': t('Find a name', 'Βρείτε ένα όνομα'), autocomplete: 'off' });
      search.addEventListener('input', () => { S.q = search.value; const keep = search.selectionStart; drawPane(); const again = paneHost.querySelector('#ap-q'); if (again) { again.focus(); again.setSelectionRange(keep, keep); } });
      const rows = list.slice(0, 200).map((m) => {
        const sc = schoolOf(m.school_id), tm = teamOf(m.team_id);
        const rst = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', 'aria-label': t('Reset the password of ' + m.name, 'Επαναφορά κωδικού για ' + m.name) }, ic('refresh'), t('Reset password', 'Επαναφορά κωδικού'));
        rst.addEventListener('click', () => SC.modal({
          title: t('Reset the password of ' + m.name + '?', 'Επαναφορά κωδικού για ' + m.name + ';'),
          body: el('p', null, t(m.name + ' is signed out. You get a temporary password to tell them. They choose a new one the first time they sign in.', 'Ο/Η ' + m.name + ' αποσυνδέεται. Παίρνετε έναν προσωρινό κωδικό για να του/της τον πείτε. Επιλέγει νέο την πρώτη φορά που συνδέεται.')),
          actions: [{ label: t('Cancel', 'Άκυρο') }, { label: t('Reset password', 'Επαναφορά κωδικού'), primary: true, run: () => resetPw(m) }],
        }));
        return el('tr', null,
          el('td', null, el('b', null, m.name), el('small', { class: 'ap-sub' }, m.role === 'teacher' ? t('Teacher', 'Εκπαιδευτικός') : t('Student', 'Μαθητής') + (m.last_seen ? ' · ' + when(m.last_seen) : ''))),
          isAdmin ? el('td', null, sc ? sc.short || sc.name : '–') : null,
          el('td', null, tm ? tm.name : '–'),
          el('td', { class: 'ap-r' }, rst));
      });
      return el('article', { class: 'nm-card nm-card--glow ap-people', 'aria-labelledby': 'ap-ppl-h' },
        el('div', { class: 'ap-eb cy' }, t('Approved accounts', 'Εγκεκριμένοι λογαριασμοί')),
        el('h2', { id: 'ap-ppl-h' }, t('People', 'Άτομα')),
        el('p', null, t('There is no email reset. If someone loses their password, reset it here and tell them the temporary one. Passwords are never stored in a readable form, so nobody can look one up.', 'Δεν υπάρχει επαναφορά με email. Αν κάποιος χάσει τον κωδικό του, κάντε επαναφορά εδώ και πείτε του τον προσωρινό. Οι κωδικοί δεν αποθηκεύονται ποτέ σε αναγνώσιμη μορφή, οπότε κανείς δεν μπορεί να δει έναν.')),
        el('div', { class: 'ap-field', style: { maxWidth: '360px', margin: '12px 0' } }, search),
        list.length ? el('div', { class: 'ap-tbl' }, el('table', { class: 'nm-table' },
          el('thead', null, el('tr', null, el('th', null, t('Person', 'Άτομο')), isAdmin ? el('th', null, t('School', 'Σχολείο')) : null, el('th', null, t('Team', 'Ομάδα')), el('th', null))),
          el('tbody', null, rows)))
          : el('p', { class: 'none' }, q ? t('Nobody with that name.', 'Κανείς με αυτό το όνομα.') : t('Nobody has been approved yet.', 'Κανείς δεν έχει εγκριθεί ακόμη.')),
        list.length > 200 ? el('p', { class: 'muted' }, t('Showing the first 200. Search to find the rest.', 'Εμφανίζονται οι πρώτοι 200. Αναζητήστε για να βρείτε τους υπόλοιπους.')) : null);
    }
    async function resetPw(m) {
      try {
        const r = await SC.api('/app/api/manage/users/' + m.id + '/reset-password', { method: 'POST', body: {} });
        const pw = r && r.temporary_password;
        const copy = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, t('Copy', 'Αντιγραφή'));
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(pw); copy.textContent = t('Copied', 'Αντιγράφηκε'); } catch (e) { copy.textContent = t('Select and copy it', 'Επιλέξτε και αντιγράψτε το'); } });
        SC.modal({
          title: t('Temporary password for ' + m.name, 'Προσωρινός κωδικός για ' + m.name),
          body: el('div', null, el('p', null, t('Tell ' + m.name + ' this password. It is shown only now. They choose a new one when they sign in.', 'Πείτε στον/στην ' + m.name + ' αυτόν τον κωδικό. Εμφανίζεται μόνο τώρα. Επιλέγουν νέο όταν συνδεθούν.')),
            el('div', { class: 'ap-tmp' }, el('code', null, pw || ''), copy)),
          actions: [{ label: t('Done', 'Έτοιμο'), primary: true }],
        });
        if (isAdmin) refreshAudit();
      } catch (e) {
        if (e.status === 401) { signedOut(); return; }
        SC.toast(t('The password was not reset: ', 'Ο κωδικός δεν επαναφέρθηκε: ') + errText(e));
      }
    }

    function rulesPane() {
      const item = (h, text) => el('li', null, ic('checkc'), el('span', null, el('b', null, h), ' ' + text));
      return el('article', { class: 'nm-card ap-rules' }, el('div', { class: 'ap-eb cu' }, t('Approval checklist', 'Λίστα ελέγχου')), el('h2', null, t('What to look for', 'Τι να ελέγξετε')),
        el('ul', { class: 'ap-autoc' },
          item(t('Safe.', 'Ασφαλές.'), t('No student names, photos, exact positions or links out.', 'Χωρίς ονόματα μαθητών, φωτογραφίες, ακριβείς θέσεις ή συνδέσμους προς έξω.')),
          item(t('Honest.', 'Ειλικρινές.'), t('Numbers match the data, units are shown, and it says when they are sample numbers.', 'Οι αριθμοί ταιριάζουν με τα δεδομένα, φαίνονται οι μονάδες και δηλώνεται όταν είναι δείγματα.')),
          item(t('Clear.', 'Κατανοητό.'), t('A student in another school could understand it without help.', 'Ένας μαθητής σε άλλο σχολείο θα μπορούσε να το καταλάβει χωρίς βοήθεια.'))),
        el('div', { class: 'nm-callout nm-callout--info' }, t('If you send a tool back, the team reads your note, fixes it and sends it again. Once you approve a tool, anyone can open it, with no sign-in.', 'Αν στείλετε ένα εργαλείο πίσω, η ομάδα διαβάζει το σημείωμά σας, το διορθώνει και το στέλνει ξανά. Μόλις εγκρίνετε ένα εργαλείο, οποιοσδήποτε μπορεί να το ανοίξει, χωρίς σύνδεση.')));
    }

    function errCard(e, retry) {
      return el('div', null, el('div', { class: 'err', role: 'alert' }, t('This list could not be loaded. ', 'Η λίστα δεν φορτώθηκε. ') + errText(e)),
        el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: retry }, t('Try again', 'Δοκιμάστε ξανά'))));
    }

    function drawPane() {
      paneHost.replaceChildren(S.tab === 'tools' ? toolsPane() : S.tab === 'accounts' ? accountsPane() : S.tab === 'people' ? peoplePane() : rulesPane());
    }

    /* ----- decision trail ----- */
    const lab = (p) => String(p.author_label || '').replace(', ', ' · ');
    function trailItems() {
      const rows = [];
      if (isAdmin && S.audit) {
        const MAP = {
          'studio.submit': ['submitted', t('Tool submitted', 'Υποβλήθηκε εργαλείο')], 'studio.class.submit': ['submitted', t('Tool submitted', 'Υποβλήθηκε εργαλείο')],
          'studio.approve': ['approved', t('Tool approved', 'Εγκρίθηκε εργαλείο')], 'studio.reject': ['back', t('Tool sent back', 'Επιστράφηκε εργαλείο')],
          approve: ['accountok', t('Account approved', 'Εγκρίθηκε λογαριασμός')], reject: ['declined', t('Account declined', 'Απορρίφθηκε λογαριασμός')],
          'studio.class.withdraw': ['declined', t('Tool withdrawn by its team', 'Το εργαλείο αποσύρθηκε από την ομάδα')],
        };
        S.audit.forEach((r) => {
          const m = MAP[r.action]; if (!m) return;
          const isTool = r.action.startsWith('studio.');
          const known = isTool ? S.tools.concat(S.gallery).find((x) => String(x.id) === String(r.target)) : null;
          // class submissions are logged as "<school slug>/<team>"
          const parts = isTool && /\//.test(r.detail || '') ? r.detail.split('/') : null;
          const sch = parts && S.ov ? S.ov.schools.find((x) => String(x.short || '').toLowerCase().replace(/\s+/g, '-') === parts[0]) : null;
          const who = parts ? t('Team ' + parts[1], 'Ομάδα ' + parts[1]) + (sch ? ', ' + sch.short : '') : '';
          rows.push({ at: r.at, kind: m[0], head: m[1], tail: isTool ? (known ? known.title : t('Tool #' + r.target, 'Εργαλείο #' + r.target)) : (r.detail || ''),
            sub: (who ? who + ' · ' : '') + (r.actor && r.actor !== 'system' ? t('by ', 'από ') + r.actor + ' · ' : '') + whenLong(r.at) });
        });
      } else {
        S.tools.forEach((p) => rows.push({ at: p.updatedAt, kind: 'submitted', head: t('Submitted', 'Υποβλήθηκε'), tail: p.title, sub: lab(p) + ' · ' + whenLong(p.updatedAt) }));
        accounts().forEach((m) => rows.push({ at: m.created_at, kind: 'account', head: t('Account requested', 'Αίτημα λογαριασμού'), tail: m.name, sub: whenLong(m.created_at) }));
        const mine = new Set(S.decisions.map((d) => d.id));
        S.gallery.filter((p) => !mine.has(p.id) && (!school || p.school === school.short)).slice(0, 6).forEach((p) => rows.push({ at: p.updatedAt, kind: 'approved', head: t('Approved', 'Εγκρίθηκε'), tail: p.title, sub: lab(p) + ' · ' + whenLong(p.updatedAt) + ' · ' + t('now public', 'δημόσιο τώρα') }));
        S.decisions.forEach((d) => rows.push({ at: d.at, kind: d.kind, head: ({ approved: t('Approved by you', 'Εγκρίθηκε από εσάς'), back: t('Sent back by you', 'Επιστράφηκε από εσάς'), accountok: t('Account approved', 'Εγκρίθηκε λογαριασμός'), declined: t('Account declined', 'Απορρίφθηκε λογαριασμός') })[d.kind], tail: d.title, sub: (d.who ? d.who + ' · ' : '') + whenLong(d.at), note: d.kind === 'back' ? d.note : '' }));
      }
      return rows.sort((a, b) => (b.at || 0) - (a.at || 0));
    }
    function drawTrail() {
      const all = trailItems(), items = all.slice(0, S.trailAll ? 40 : 6);
      const sub = isAdmin ? t('Every approval, send-back and account decision, newest first.', 'Κάθε έγκριση, επιστροφή και απόφαση για λογαριασμό, με τα νεότερα πρώτα.')
        : t('Recent activity ' + at()[0] + ', newest first.', 'Πρόσφατη δραστηριότητα ' + at()[1] + ', με τα νεότερα πρώτα.');
      trailHost.replaceChildren(...[el('h2', { id: 'ap-trail-h' }, t('Decision trail', 'Ιστορικό αποφάσεων')), el('p', { class: 'card-sub' }, sub),
        isAdmin && S.auditError ? el('div', { class: 'err', role: 'alert' }, t('The record could not be loaded. ', 'Το αρχείο δεν φορτώθηκε. ') + errText(S.auditError))
          : items.length ? el('ul', { class: 'ap-trail' }, items.map((r) => {
            const [color, icon] = TRAIL[r.kind] || TRAIL.submitted;
            return el('li', { style: '--nd:' + color }, el('span', { class: 'nd' }, ic(icon)),
              el('div', { class: 'tx' }, el('div', { class: 'tt' }, r.head, r.tail ? [' ', el('span', null, '· ' + r.tail)] : null), el('div', { class: 'tm' }, r.sub), r.note ? el('blockquote', null, r.note) : null));
          })) : el('div', { class: 'empty' }, t('Nothing has happened yet. Decisions and submissions appear here.', 'Δεν έχει γίνει τίποτα ακόμη. Οι αποφάσεις και οι υποβολές εμφανίζονται εδώ.')),
        all.length > 6 ? el('div', { class: 'ap-trail-more' }, el('button', { class: 'link', type: 'button', 'aria-expanded': S.trailAll ? 'true' : 'false', onclick: () => { S.trailAll = !S.trailAll; drawTrail(); } }, S.trailAll ? t('Show fewer', 'Λιγότερες') : t('See all decisions', 'Όλες οι αποφάσεις'))) : null].filter(Boolean));
    }
    async function refreshAudit() {
      try { const r = await SC.api('/app/api/manage/audit'); S.audit = r.rows || []; S.auditError = null; } catch (e) { S.auditError = e; }
      if (alive) { drawTrail(); drawWeek(); }
    }

    /* ----- this week: decisions since Monday (Cyprus time), from what this teacher is allowed to see ----- */
    function weekStart() {
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Nicosia', weekday: 'short' }).format(Date.now());
      const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd);
      const k = dayKey(Date.now() - back * 86400000);   // the Monday, as YYYY-MM-DD
      return { key: k, idx: (ms) => { const d = Math.round((Date.parse(dayKey(ms) + 'T00:00:00Z') - Date.parse(k + 'T00:00:00Z')) / 86400000); return d; } };
    }
    function weekData() {
      const w = weekStart(), days = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
      const seen = new Set();
      const add = (ms, kind, id) => {
        const d = w.idx(ms); if (d < 0 || d > 6) return;
        const key = kind + ':' + id; if (seen.has(key)) return; seen.add(key);
        days[d][kind === 'ok' ? 0 : 1]++;
      };
      S.gallery.filter((p) => isAdmin || !school || p.school === school.short).forEach((p) => add(p.updatedAt, 'ok', p.id));
      S.decisions.forEach((d) => { if (d.kind === 'approved') add(d.at, 'ok', d.id); else if (d.kind === 'back') add(d.at, 'back', d.id); });
      if (isAdmin && S.audit) S.audit.forEach((r) => { if (r.action === 'studio.approve') add(r.at, 'ok', r.target); else if (r.action === 'studio.reject') add(r.at, 'back', r.target); });
      return days;
    }
    function weekChart(days) {
      const last = Math.max(4, days.reduce((m, d, i) => (d[0] || d[1] ? i : m), 0));
      const names = SC.lang === 'el' ? ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const n = last + 1, W = 300, step = (W - 32) / n, top = Math.max(1, ...days.map((d) => d[0] + d[1]));
      const svg = SC.svgEl('svg', { viewBox: '0 0 300 118', width: '100%', role: 'img', 'aria-label': t('Decisions per day this week', 'Αποφάσεις ανά ημέρα αυτή την εβδομάδα') });
      svg.append(SC.svgEl('line', { x1: 8, x2: 292, y1: 82, y2: 82, stroke: 'rgba(255,255,255,.16)' }));
      const lg = SC.lang === 'el' ? [56, 150] : [150, 222];
      svg.append(SC.svgEl('circle', { cx: lg[0], cy: 10, r: 4, fill: '#59d98e' }), SC.svgEl('text', { x: lg[0] + 8, y: 14, 'font-size': 11, fill: '#B9C8DA' }, t('approved', 'εγκρίθηκαν')));
      svg.append(SC.svgEl('circle', { cx: lg[1], cy: 10, r: 4, fill: '#F2B24C' }), SC.svgEl('text', { x: lg[1] + 8, y: 14, 'font-size': 11, fill: '#B9C8DA' }, t('sent back', 'επιστράφηκαν')));
      days.slice(0, n).forEach((d, i) => {
        const cx = 16 + step * i + step / 2, bw = Math.min(22, step - 10);
        let y = 82;
        [[d[0], '#59d98e'], [d[1], '#F2B24C']].forEach(([v, c]) => {
          if (!v) return;
          const h = Math.max(8, Math.round((v / top) * 40)); y -= h;
          svg.append(SC.svgEl('rect', { x: cx - bw / 2, y, width: bw, height: h, rx: 5, fill: c }));
          y -= 2;
        });
        svg.append(SC.svgEl('text', { x: cx, y: 100, 'text-anchor': 'middle', 'font-size': 12, fill: '#8CA0B8' }, names[i]));
      });
      return svg;
    }
    function drawWeek() {
      const days = weekData();
      const ok = days.reduce((a, d) => a + d[0], 0), back = days.reduce((a, d) => a + d[1], 0);
      const waiting = S.tools.length;
      const oldest = S.tools.reduce((m, p) => Math.min(m, p.updatedAt || Date.now()), Date.now());
      const box = (n, en, el2) => el('div', null, el('b', null, String(n)), el('span', null, t(en, el2)));
      weekHost.replaceChildren(...[el('h2', { id: 'ap-week-h' }, t('This week', 'Αυτή την εβδομάδα')),
        el('p', { class: 'card-sub' }, isAdmin ? t('Decisions at all schools since Monday.', 'Αποφάσεις σε όλα τα σχολεία από τη Δευτέρα.') : t('Decisions ' + at()[0] + ' since Monday.', 'Αποφάσεις ' + at()[1] + ' από τη Δευτέρα.')),
        el('div', { class: 'ap-wk-n' }, box(ok, 'approved', 'εγκρίθηκαν'), box(back, 'sent back', 'επιστράφηκαν'), box(S.review.ok ? waiting : '–', 'still waiting', 'σε αναμονή')),
        weekChart(days),
        el('div', { class: 'nm-callout' }, waiting
          ? [t('Oldest tool waiting: ', 'Το παλαιότερο εργαλείο περιμένει: '), el('b', null, span(Date.now() - oldest)), t('. Faster answers keep teams building.', '. Γρηγορότερες απαντήσεις κρατούν τις ομάδες σε κίνηση.')]
          : t('Nothing is waiting right now.', 'Τίποτα δεν περιμένει αυτή τη στιγμή.')),
        !isAdmin ? el('p', { class: 'ap-trail-end' }, t('Sent-back tools are counted only while this page is open. An admin can read the full record.', 'Τα εργαλεία που επιστρέφονται μετρούν μόνο όσο είναι ανοιχτή η σελίδα. Ένας διαχειριστής μπορεί να διαβάσει το πλήρες αρχείο.')) : null].filter(Boolean));
    }

    function drawMore() {
      const reports = S.ov ? (S.ov.reports || []).length : null;
      moreHost.replaceChildren(...[el('h2', { id: 'ap-more-h' }, t('More teacher tools', 'Περισσότερα εργαλεία εκπαιδευτικών')),
        el('p', null, t('Teams, reports, the handbook and member settings live in the student app.', 'Οι ομάδες, οι αναφορές, το εγχειρίδιο και οι ρυθμίσεις μελών βρίσκονται στην εφαρμογή των μαθητών.')),
        reports != null ? el('ul', null, el('li', null, ic('flag'), el('span', null, el('b', null, String(reports)), ' ' + (reports === 1 ? t('open report to look at', 'ανοιχτή αναφορά για έλεγχο') : t('open reports to look at', 'ανοιχτές αναφορές για έλεγχο'))))) : null,
        el('a', { class: 'nm-btn', href: '/app/#/manage' }, ic('gear'), t('Open teacher tools', 'Άνοιγμα εργαλείων εκπαιδευτικών'))].filter(Boolean));
    }

    /* ----- load, refresh, signed out ----- */
    function drawAll() {
      const hd = mkHead();
      headHost.replaceChildren();
      wrap.replaceChildren(hd.querySelector('.how-btn'), banner(), hd.querySelector('.page-head'), gatesHost, tabsHost, el('div', { class: 'ap-split' }, paneHost, el('div', { class: 'ap-aside' }, trailHost, weekHost, moreHost)), live);
      drawGates(); drawTabs(); drawPane(); drawTrail(); drawWeek(); drawMore();
    }
    function signedOut() {
      alive = false; clearInterval(timer); stopBridge();
      root.replaceChildren();
      signIn(root, t('Your sign-in ended. Sign in again to continue.', 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά για να συνεχίσετε.'));
    }
    async function reload(quiet) {
      if (!quiet) { wrap.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); }
      try { await fetchAll(); } catch (e) { if (e.signedOut) return signedOut(); }
      if (alive) drawAll();
    }
    // A quiet refresh of the numbers: the open card is left alone unless it is gone or nothing has been typed yet.
    async function tick() {
      if (S.busy || document.hidden) return;
      const had = S.curId, hadN = shown.n;
      try { await fetchAll(); } catch (e) { if (e.signedOut) signedOut(); return; }
      if (!alive) return;
      drawGates(); drawTabs(); drawTrail(); drawWeek(); drawMore();
      if (S.tab === 'tools') {
        const pristine = !paneHost.querySelector('input:checked') && !(paneHost.querySelector('#ap-note') || { value: '' }).value;
        if (S.curId !== had || !S.tools.length || !hadN || (S.tools.length !== hadN && pristine)) drawPane();
        else if (S.tools.length !== hadN) { const c = paneHost.querySelector('#ap-counter'); if (c) { shown.n = S.tools.length; c.textContent = t('Card ' + (S.tools.indexOf(curTool()) + 1) + ' of ' + shown.n, 'Κάρτα ' + (S.tools.indexOf(curTool()) + 1) + ' από ' + shown.n); } }
      } else if (S.tab === 'accounts' && !paneHost.contains(document.activeElement)) drawPane();
    }

    wrap.append(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
    drawHead();
    return (async () => {
      try { await fetchAll(); } catch (e) {
        if (e.signedOut) { root.replaceChildren(); signIn(root, t('Your sign-in ended. Sign in again to continue.', 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά για να συνεχίσετε.')); return () => {}; }
      }
      drawAll();
      timer = setInterval(tick, 60000);
      return () => { alive = false; clearInterval(timer); stopBridge(); };
    })();
  }

  SC.register('approvals', {
    title: ['Approvals', 'Εγκρίσεις'],
    render(root, ctx) {
      SC.css('/site/pages/approvals.css');
      const me = ctx.me || SC.me;
      if (!me) return signIn(root);
      return approvals(root, me);
    },
  });
})();
