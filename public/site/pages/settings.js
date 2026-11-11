/* Settings: the teacher-only page for the things a teacher or admin may change on the site.
   Sections: Alert rules, Feeds, League switch, School codes, Handbook, Announcements, Team and roles.
   API: /app/api/login, /app/api/logout, /app/api/schools (sign-in card), GET|PUT /app/api/alerts/rules[/:id], GET /api/feeds + POST /api/feeds/:id,
        GET|PUT /app/api/league, GET /app/api/manage/overview + POST /app/api/manage/schools/:id (codes, vehicle words),
        GET /app/api/handbook + POST /app/api/manage/handbook[/:id/delete], GET /app/api/announcements + POST /app/api/messages (channel all)
        + POST /app/api/manage/messages/:id/delete. Everything is done with the teacher's own session; the server decides what is allowed. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;

  /* ---------- small icons (static strings only) ---------- */
  const ICON = {
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    megaphone: '<path d="M4 10v4l12 5V5z"/><path d="M16 9a3 3 0 010 6M7 15l1.5 5"/>',
  };
  function ic(name, size) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  const errText = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  const pick = (v) => (Array.isArray(v) ? t(v[0], v[1] != null ? v[1] : v[0]) : String(v == null ? '' : v));
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch (e) { return null; } };

  /* a message line under a control: green when it worked, red when it did not. Always says what happened in words. */
  function msgBox() {
    const d = el('div', { class: 'st-msg', 'aria-live': 'polite' });
    d.ok = (text) => { d.className = 'st-msg ok'; d.setAttribute('role', 'status'); d.replaceChildren(ic('check', 16), el('span', null, text)); };
    d.bad = (text) => { d.className = 'st-msg bad'; d.setAttribute('role', 'alert'); d.replaceChildren(ic('warn', 16), el('span', null, text)); };
    d.clear = () => { d.className = 'st-msg'; d.removeAttribute('role'); d.replaceChildren(); };
    return d;
  }

  function sw(checked, label, onchange) {
    const b = el('button', { class: 'st-switch', type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false', 'aria-label': label }, el('i'));
    b.addEventListener('click', () => { if (b.disabled) return; const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); onchange(v, b); });
    b.set = (v) => b.setAttribute('aria-checked', v ? 'true' : 'false');
    return b;
  }

  function confirmBox(title, text, label, run, danger) {
    SC.modal({ title, body: el('p', null, text), actions: [{ label: t('Cancel', 'Άκυρο') }, { label, primary: !danger, run }] });
  }

  async function copyText(text, node) {
    try { await navigator.clipboard.writeText(text); SC.toast(t('Copied', 'Αντιγράφηκε')); return true; } catch (e) {
      if (node) { try { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (x) { /* no selection */ } }
      SC.toast(t('Press Ctrl+C to copy the selected text.', 'Πατήστε Ctrl+C για να αντιγράψετε το επιλεγμένο κείμενο.'));
      return false;
    }
  }

  /* ================= signed out: a calm sign-in card (same pattern as Approvals) ================= */
  function signIn(root, note) {
    root.append(SC.head({
      title: t('Teacher sign-in', 'Σύνδεση εκπαιδευτικών'),
      help: [
        'Settings is for teachers and admins. Sign in with the name and password you made in the student app and choose your school. After signing in you can change alert rules, switch feeds and the league, read your school codes, edit the handbook and post announcements.',
        'Οι Ρυθμίσεις είναι για εκπαιδευτικούς και διαχειριστές. Συνδεθείτε με το όνομα και τον κωδικό που δημιουργήσατε στην εφαρμογή των μαθητών και επιλέξτε το σχολείο σας. Μετά τη σύνδεση μπορείτε να αλλάξετε κανόνες ειδοποιήσεων, να ενεργοποιείτε πηγές και το πρωτάθλημα, να διαβάζετε τους κωδικούς του σχολείου, να επεξεργάζεστε το εγχειρίδιο και να δημοσιεύετε ανακοινώσεις.',
      ],
    }));
    const school = el('select', { class: 'nm-input', id: 'st-school', required: true });
    const name = el('input', { class: 'nm-input', id: 'st-name', type: 'text', autocomplete: 'username', required: true, maxlength: 60 });
    const pw = el('input', { class: 'nm-input', id: 'st-pw', type: 'password', autocomplete: 'current-password', required: true, maxlength: 200 });
    const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'submit' }, ic('lock'), t('Sign in', 'Σύνδεση'));
    const errBox = el('div', { 'aria-live': 'assertive' });
    let ready = false;
    async function loadSchools() {
      school.replaceChildren(el('option', { value: '' }, t('Loading schools', 'Φόρτωση σχολείων')));
      school.disabled = true;
      try {
        const r = await SC.api('/app/api/schools');
        const last = SC.store.get('sc.approvals.school') || '';
        school.replaceChildren(el('option', { value: '' }, t('Choose your school', 'Επιλέξτε το σχολείο σας')),
          ...(r.schools || []).map((s) => el('option', { value: String(s.id) }, s.name)),
          el('option', { value: 'staff' }, t('Admin (not tied to a school)', 'Διαχειριστής (χωρίς σχολείο)')));
        if (Array.from(school.options).some((o) => o.value === last)) school.value = last;
        school.disabled = false; ready = true;
      } catch (e) {
        school.replaceChildren(el('option', { value: '' }, t('Schools could not be loaded', 'Δεν φορτώθηκαν τα σχολεία')));
        errBox.replaceChildren(el('div', { class: 'err', role: 'alert' }, errText(e), ' ', el('button', { class: 'link', type: 'button', onclick: () => { errBox.replaceChildren(); loadSchools(); } }, t('Try again', 'Δοκιμάστε ξανά'))));
      }
    }
    const form = el('form', { class: 'st-form', novalidate: true },
      el('div', { class: 'st-fld' }, el('label', { for: 'st-school' }, t('School', 'Σχολείο')), school),
      el('div', { class: 'st-fld' }, el('label', { for: 'st-name' }, t('Name', 'Όνομα')), name),
      el('div', { class: 'st-fld' }, el('label', { for: 'st-pw' }, t('Password', 'Κωδικός')), pw),
      errBox, el('div', null, go));
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
        try { await SC.api('/app/api/logout', { method: 'POST', body: {} }); } catch (e) { /* the cookie ends by itself */ }
        go.disabled = false;
        if (u && u.status === 'pending') bad(t('Your account is still waiting for approval. Ask an admin or your head teacher.', 'Ο λογαριασμός σας περιμένει ακόμη έγκριση. Ρωτήστε έναν διαχειριστή ή τον διευθυντή σας.'));
        else bad(t('That account is not a teacher account. Settings is only for teachers and admins.', 'Αυτός δεν είναι λογαριασμός εκπαιδευτικού. Οι Ρυθμίσεις είναι μόνο για εκπαιδευτικούς και διαχειριστές.'));
      } catch (e) {
        go.disabled = false;
        if (e.status === 401) bad(t('That name and password do not match for this school. Check the school too.', 'Το όνομα και ο κωδικός δεν ταιριάζουν για αυτό το σχολείο. Ελέγξτε και το σχολείο.'));
        else if (e.status === 403) bad(t('This account cannot sign in. Ask an admin.', 'Αυτός ο λογαριασμός δεν μπορεί να συνδεθεί. Ρωτήστε έναν διαχειριστή.'));
        else if (e.status === 429) bad(t('Too many tries. Wait a few minutes, then try again.', 'Πάρα πολλές προσπάθειες. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.'));
        else bad(errText(e));
      }
    });
    root.append(el('div', { class: 'st' },
      el('section', { class: 'nm-card nm-card--glow st-signin', 'aria-labelledby': 'st-si-h' },
        el('span', { class: 'st-tic', style: { marginBottom: '2px' } }, ic('gear')),
        el('h2', { id: 'st-si-h' }, t('Teachers sign in here', 'Εδώ συνδέονται οι εκπαιδευτικοί')),
        el('p', { class: 'st-lead' }, t('Sign in to change alert rules, feeds, the league, the handbook and announcements.', 'Συνδεθείτε για να αλλάξετε κανόνες ειδοποιήσεων, πηγές, το πρωτάθλημα, το εγχειρίδιο και τις ανακοινώσεις.')),
        note ? el('div', { class: 'nm-callout nm-callout--info st-info' }, note) : null,
        form,
        el('p', { class: 'st-visitor' }, t('This page is for teachers. Just visiting? You never need to sign in: everything public on this site opens without an account. ', 'Αυτή η σελίδα είναι για εκπαιδευτικούς. Απλώς επισκέπτεστε; Δεν χρειάζεται ποτέ να συνδεθείτε: ό,τι είναι δημόσιο σε αυτόν τον ιστότοπο ανοίγει χωρίς λογαριασμό. '), el('a', { href: '#/' }, t('Back to the whole project', 'Πίσω στο ολόκληρο έργο'))))));
    loadSchools();
    return () => {};
  }

  /* ================= the page ================= */
  function settings(root, ctx, me) {
    const isAdmin = me.role === 'admin';
    const school = me.school || null;
    let alive = true;
    const cleanups = [];

    const head = SC.head({
      title: t('Settings', 'Ρυθμίσεις'),
      lede: t('The things a teacher can change: alert rules, data feeds, the league, school codes, the handbook and announcements. Visitors and students never see this page.', 'Όσα μπορεί να αλλάξει ένας εκπαιδευτικός: κανόνες ειδοποιήσεων, πηγές δεδομένων, το πρωτάθλημα, κωδικοί σχολείου, το εγχειρίδιο και ανακοινώσεις. Οι επισκέπτες και οι μαθητές δεν βλέπουν ποτέ αυτή τη σελίδα.'),
      help: [
        'Pick a section with the tabs. Every change shows a message that says if it was saved or why it was not. Alert rules and feeds change what the whole site does, so take care. Codes and the handbook belong to your school; admins can also see the other schools.',
        'Επιλέξτε ενότητα από τις καρτέλες. Κάθε αλλαγή δείχνει μήνυμα που λέει αν αποθηκεύτηκε ή γιατί όχι. Οι κανόνες ειδοποιήσεων και οι πηγές αλλάζουν τι κάνει ολόκληρος ο ιστότοπος, γι’ αυτό προσοχή. Οι κωδικοί και το εγχειρίδιο ανήκουν στο σχολείο σας· οι διαχειριστές βλέπουν και τα άλλα σχολεία.'],
      tags: [{ text: t('Teachers', 'Εκπαιδευτικοί'), cls: 'team' }],
    });
    SC.cached('/api/config', 300000).then((c) => { if (c && c.demo && alive) { const ph = head.querySelector('.page-head'); ph.insertBefore(el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης')), ph.querySelector('.lede')); } }).catch(() => {});

    async function signOut(btn) {
      btn.disabled = true;
      try { await SC.api('/app/api/logout', { method: 'POST', body: {} }); } catch (e) { /* reload anyway */ }
      location.reload();
    }
    const outBtn = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, t('Sign out', 'Αποσύνδεση'));
    outBtn.addEventListener('click', () => signOut(outBtn));
    const banner = el('div', { class: 'st-banner', role: 'region', 'aria-label': t('Teacher area', 'Χώρος εκπαιδευτικών') },
      el('span', { class: 'st-tic' }, ic('shield')),
      el('div', { class: 'st-bt' }, el('b', null, t('Teacher area. ', 'Χώρος εκπαιδευτικών. ')), el('b', { class: 'soft' }, isAdmin
        ? t('Signed in as an admin, for all schools.', 'Συνδεδεμένοι ως διαχειριστής, για όλα τα σχολεία.')
        : t('Signed in as a teacher at ' + (school ? school.name : 'your school') + '.', 'Συνδεδεμένοι ως εκπαιδευτικός στο ' + (school ? school.name : 'σχολείο σας') + '.'))),
      el('div', { class: 'st-bb' }, el('span', { class: 'nm-badge nm-badge--warn' }, isAdmin ? t('Admin', 'Διαχειριστής') : t('Teacher', 'Εκπαιδευτικός')), outBtn));

    function signedOut() {
      alive = false; cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
      root.replaceChildren();
      signIn(root, t('Your sign-in ended. Sign in again to continue.', 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά για να συνεχίσετε.'));
    }
    // Every failed call goes through here: a 401 means the session ended, anything else is shown to the person.
    const lost = (e) => { if (e && e.status === 401) { signedOut(); return true; } return false; };
    const failText = (e, what) => {
      if (e && e.status === 403) return t('You are not allowed to ' + what + '. Only teachers and admins can; admins can do a little more than teachers.', 'Δεν επιτρέπεται να ' + what + '. Μόνο εκπαιδευτικοί και διαχειριστές μπορούν· οι διαχειριστές μπορούν λίγο περισσότερα.');
      if (e && e.status === 429) return t('Too many tries. Wait a minute, then try again.', 'Πάρα πολλές προσπάθειες. Περιμένετε ένα λεπτό και δοκιμάστε ξανά.');
      return errText(e);
    };

    /* a section card: loads, shows the error with Try again, then draws */
    function mount(host, loader) {
      host.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      const my = (host.__run = (host.__run || 0) + 1);
      loader().catch((e) => {
        if (!alive || host.__run !== my || lost(e)) return;
        host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('This section could not be loaded. ', 'Αυτή η ενότητα δεν φορτώθηκε. ') + errText(e)),
          el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: () => mount(host, loader) }, t('Try again', 'Δοκιμάστε ξανά'))));
      });
    }
    const sectionHead = (eye, h, sub) => [el('p', { class: 'card-eye' }, eye), el('h2', { class: 'card-h st-h' }, h), sub ? el('p', { class: 'card-sub st-sub' }, sub) : null];

    // The manage overview is used by two sections; keep it for a few seconds and forget it after a change.
    let ovMemo = null;
    const overview = (force) => {
      if (!force && ovMemo && Date.now() - ovMemo.at < 15000) return ovMemo.p;
      const p = SC.api('/app/api/manage/overview');
      ovMemo = { at: Date.now(), p };
      p.catch(() => { if (ovMemo && ovMemo.p === p) ovMemo = null; });
      return p;
    };

    /* ---------- alert rules ---------- */
    const SEV = {
      info: [['Information', 'Πληροφορία'], ['a quiet note', 'ένα ήσυχο σημείωμα']],
      watch: [['Watch', 'Προσοχή'], ['worth a look', 'αξίζει μια ματιά']],
      warn: [['Warning', 'Προειδοποίηση'], ['needs action', 'χρειάζεται ενέργεια']],
    };
    const BOUNDS = { co2_high: [300, 10000], pm25_spike: [1, 1000], battery_low: [1, 100], temp_high: [-20, 60] };
    function boundsFor(rule) {
      if (rule.key === 'sensor_quiet') return /^h/i.test(rule.unit || '') ? [1, 720] : [1, 10080];
      return BOUNDS[rule.key] || [-1000000, 1000000];
    }
    function checkThreshold(rule, text) {
      const s = String(text).trim().replace(',', '.');
      if (!s) return { msg: t('Type a number for the threshold.', 'Πληκτρολογήστε έναν αριθμό για το όριο.') };
      if (!/^-?\d+(\.\d+)?$/.test(s)) return { msg: t('Use digits only, for example 1000 or 37.5.', 'Χρησιμοποιήστε μόνο ψηφία, για παράδειγμα 1000 ή 37,5.') };
      const n = Number(s), [lo, hi] = boundsFor(rule), u = rule.unit ? ' ' + rule.unit : '';
      if (!isFinite(n) || n < lo || n > hi) return { msg: t('Choose a number between ' + lo + ' and ' + hi + u + '.', 'Επιλέξτε αριθμό από ' + lo + ' έως ' + hi + u + '.') };
      return { value: n };
    }

    function ruleCard(rule) {
      const saved = { enabled: Boolean(rule.enabled), threshold: rule.threshold == null ? null : Number(rule.threshold), severity: rule.severity };
      const hasTh = rule.threshold != null;
      const draft = { enabled: saved.enabled, th: hasTh ? String(saved.threshold) : '', severity: saved.severity };
      const id = 'st-r' + rule.id;
      const name = pick(rule.name) || rule.key;
      const msg = msgBox();
      const thMsg = el('div', { class: 'st-hint', id: id + '-th-m', 'aria-live': 'polite' });
      const onTxt = el('span', { class: 'st-sw-t' });
      const toggle = sw(draft.enabled, t('Rule on: ', 'Κανόνας ενεργός: ') + name, (v) => { draft.enabled = v; refresh(); });
      const th = el('input', { class: 'nm-input st-num', id: id + '-th', type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: 8, value: draft.th, 'aria-describedby': id + '-th-m', disabled: !hasTh });
      th.addEventListener('input', () => { draft.th = th.value; refresh(); });
      const sev = el('select', { class: 'nm-input st-sel', id: id + '-sev' }, Object.keys(SEV).map((k) => el('option', { value: k }, t(SEV[k][0][0], SEV[k][0][1]) + ' · ' + t(SEV[k][1][0], SEV[k][1][1]))));
      if (!SEV[draft.severity]) sev.append(el('option', { value: draft.severity }, String(draft.severity)));
      sev.value = draft.severity;
      sev.addEventListener('change', () => { draft.severity = sev.value; refresh(); });
      const save = el('button', { class: 'nm-btn nm-btn--primary st-save', type: 'button', disabled: true }, ic('save', 18), t('Save', 'Αποθήκευση'));
      const undo = el('button', { class: 'link', type: 'button', hidden: true }, t('Undo changes', 'Αναίρεση αλλαγών'));
      const card = el('li', { class: 'nm-card st-rule' });
      let busy = false;

      function parsed() {
        if (!hasTh) return { value: null };
        return checkThreshold(rule, draft.th);
      }
      function dirty() {
        const p = parsed();
        return draft.enabled !== saved.enabled || draft.severity !== saved.severity || (hasTh && p.value != null && p.value !== saved.threshold) || (hasTh && p.value == null && draft.th.trim() !== String(saved.threshold));
      }
      function refresh() {
        onTxt.textContent = draft.enabled ? t('On', 'Ενεργός') : t('Off', 'Ανενεργός');
        card.classList.toggle('off', !draft.enabled);
        const p = parsed(), d = dirty();
        thMsg.textContent = hasTh && d && p.msg ? p.msg : '';
        th.setAttribute('aria-invalid', hasTh && p.msg ? 'true' : 'false');
        save.disabled = busy || !d || Boolean(p.msg);
        undo.hidden = !d || busy;
        if (d) msg.clear();
      }
      undo.addEventListener('click', () => { draft.enabled = saved.enabled; draft.th = hasTh ? String(saved.threshold) : ''; draft.severity = saved.severity; toggle.set(draft.enabled); th.value = draft.th; sev.value = draft.severity; refresh(); msg.clear(); });
      save.addEventListener('click', async () => {
        const p = parsed();
        if (p.msg) return;
        const body = {};
        if (draft.enabled !== saved.enabled) body.enabled = draft.enabled;
        if (hasTh && p.value !== saved.threshold) body.threshold = p.value;
        if (draft.severity !== saved.severity) body.severity = draft.severity;
        if (!Object.keys(body).length) return;
        busy = true; refresh(); msg.clear();
        try {
          const r = await SC.api('/app/api/alerts/rules/' + encodeURIComponent(rule.id), { method: 'PUT', body });
          if (!alive) return;
          const nr = (r && r.rule) || null;
          saved.enabled = nr && nr.enabled != null ? Boolean(nr.enabled) : draft.enabled;
          saved.threshold = nr && nr.threshold !== undefined ? (nr.threshold == null ? null : Number(nr.threshold)) : (hasTh ? p.value : null);
          saved.severity = nr && nr.severity ? nr.severity : draft.severity;
          draft.enabled = saved.enabled; draft.severity = saved.severity; if (hasTh) { draft.th = String(saved.threshold); th.value = draft.th; } toggle.set(draft.enabled); sev.value = draft.severity;
          busy = false; refresh();
          msg.ok(t('Saved at ' + SC.time(Date.now()) + '. The new rule is used from the next check.', 'Αποθηκεύτηκε στις ' + SC.time(Date.now()) + '. Ο νέος κανόνας χρησιμοποιείται από τον επόμενο έλεγχο.'));
          SC.toast(t('Saved: ', 'Αποθηκεύτηκε: ') + name);
        } catch (e) {
          if (!alive || lost(e)) return;
          busy = false; refresh();
          msg.bad(t('Not saved. ', 'Δεν αποθηκεύτηκε. ') + failText(e, t('change alert rules', 'αλλάξετε κανόνες ειδοποιήσεων')));
        }
      });
      card.append(
        el('div', { class: 'st-rule-main' }, el('h3', null, name), el('p', null, pick(rule.text))),
        el('div', { class: 'st-rule-ctl' },
          el('div', { class: 'st-ctl' }, el('span', { class: 'st-lb' }, t('Rule', 'Κανόνας')), el('div', { class: 'st-swrow' }, toggle, onTxt)),
          el('div', { class: 'st-ctl' }, el('label', { class: 'st-lb', for: id + '-th' }, t('Threshold', 'Όριο')),
            hasTh ? el('div', { class: 'st-unit' }, th, rule.unit ? el('span', null, rule.unit) : null) : el('div', { class: 'st-na' }, t('No number to set', 'Δεν υπάρχει αριθμός να οριστεί')), thMsg),
          el('div', { class: 'st-ctl' }, el('label', { class: 'st-lb', for: id + '-sev' }, t('How serious', 'Πόσο σοβαρό')), sev),
          el('div', { class: 'st-act' }, save, undo)),
        msg);
      refresh();
      return card;
    }
    async function secRules(host) {
      const d = await SC.api('/app/api/alerts/rules');
      if (!alive) return;
      const rules = Array.isArray(d && d.rules) ? d.rules : [];
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('Alerts', 'Ειδοποιήσεις'), t('Alert rules', 'Κανόνες ειδοποιήσεων'),
          t('When a reading crosses a threshold, the site raises an alert of the seriousness you choose. Turn a rule off to stop that kind of alert. Each rule is saved on its own.', 'Όταν μια μέτρηση περνά ένα όριο, ο ιστότοπος δημιουργεί ειδοποίηση με τη σοβαρότητα που επιλέγετε. Απενεργοποιήστε έναν κανόνα για να σταματήσει αυτό το είδος ειδοποίησης. Κάθε κανόνας αποθηκεύεται χωριστά.')),
          el('a', { class: 'pill-link', href: '#/alerts' }, SC.icon('bell', 16), t('See the alerts page', 'Δείτε τη σελίδα ειδοποιήσεων'))),
        rules.length ? el('ul', { class: 'st-rules' }, rules.map(ruleCard)) : el('div', { class: 'empty' }, t('No alert rules are set up yet.', 'Δεν έχουν οριστεί ακόμη κανόνες ειδοποιήσεων.'))));
    }

    /* ---------- feeds ---------- */
    function feedRow(f) {
      const msg = msgBox();
      const fname = (SC.lang === 'el' && f.nameEl) || f.name, fwhat = (SC.lang === 'el' && f.whatEl) || f.what || '';
      let enabled = Boolean(f.enabled);
      const every = Number(f.everyMin) || 0;
      // The server says how a feed is doing (ok, demo, idle, late, off, error); without that, work it out from the last good answer.
      const state = () => {
        if (!enabled) return ['off', t('Switched off', 'Απενεργοποιημένη')];
        if (f.status === 'demo') return ['info', t('Demo: simulated', 'Επίδειξη: προσομοίωση')];
        if (f.status === 'error') return ['bad', t('Last call failed', 'Η τελευταία κλήση απέτυχε')];
        if (f.status === 'idle') return ['ok', t('Asked when needed', 'Ρωτιέται όταν χρειάζεται')];
        if (f.status === 'late') return ['late', t('Running late', 'Καθυστερεί')];
        if (f.status === 'ok') return ['ok', t('Working', 'Λειτουργεί')];
        if (!f.lastOk) return ['late', t('No good answer yet', 'Καμία επιτυχής απάντηση ακόμη')];
        const late = every && Date.now() - f.lastOk > every * 60000 * 3;
        return late ? ['late', t('Running late', 'Καθυστερεί')] : ['ok', t('Working', 'Λειτουργεί')];
      };
      const badgeHost = el('span');
      const meta = el('div', { class: 'st-feed-meta' });
      const lab = el('span', { class: 'st-sw-t' });
      const url = safeUrl(f.home);
      const draw = () => {
        const [k, w] = state();
        badgeHost.replaceChildren(el('span', { class: 'st-badge s-' + k }, el('i', { 'aria-hidden': 'true' }), w));
        lab.textContent = enabled ? t('On', 'Ενεργή') : t('Off', 'Ανενεργή');
        const bits = [];
        bits.push(f.lastOk ? t('Last good answer ' + SC.ago(f.lastOk) + '.', 'Τελευταία επιτυχής απάντηση ' + SC.ago(f.lastOk) + '.') : t('No good answer saved yet.', 'Δεν έχει αποθηκευτεί επιτυχής απάντηση.'));
        if (every) bits.push(t('Asked about every ' + every + ' min.', 'Ερώτηση περίπου κάθε ' + every + ' λεπτά.'));
        if (f.ok24h != null || f.fail24h != null) bits.push(t('Last 24 h: ' + (f.ok24h || 0) + ' good, ' + (f.fail24h || 0) + ' failed.', 'Τελευταίες 24 ώρες: ' + (f.ok24h || 0) + ' επιτυχημένες, ' + (f.fail24h || 0) + ' αποτυχημένες.'));
        meta.replaceChildren(...[el('span', null, bits.join(' ')), f.lastError && f.lastError.message ? el('span', { class: 'st-feed-err' }, t('Last problem ' + SC.ago(f.lastError.at) + ': ', 'Τελευταίο πρόβλημα ' + SC.ago(f.lastError.at) + ': ') + String(f.lastError.message).slice(0, 160)) : null].filter(Boolean));
      };
      const toggle = sw(enabled, t('Feed on: ', 'Πηγή ενεργή: ') + fname, (v) => { v ? apply(true) : confirmBox(t('Switch off ' + fname + '?', 'Απενεργοποίηση της πηγής ' + fname + ';'), t('The site stops asking this source. Pages that used it show the last saved data where they have some, or say the source is switched off. You can switch it on again at any time.', 'Ο ιστότοπος σταματά να ρωτά αυτή την πηγή. Οι σελίδες που τη χρησιμοποιούσαν δείχνουν τα τελευταία αποθηκευμένα δεδομένα όπου υπάρχουν, ή λένε ότι η πηγή είναι απενεργοποιημένη. Μπορείτε να την ενεργοποιήσετε ξανά οποιαδήποτε στιγμή.'), t('Switch off', 'Απενεργοποίηση'), () => apply(false), true); if (!v) toggle.set(true); });
      async function apply(v) {
        toggle.disabled = true; msg.clear();
        try {
          const r = await SC.api('/api/feeds/' + encodeURIComponent(f.id), { method: 'POST', body: { enabled: v } });
          if (!alive) return;
          if (r && r.feed && typeof r.feed === 'object') Object.assign(f, r.feed);
          enabled = r && r.feed && r.feed.enabled != null ? Boolean(r.feed.enabled) : v;
          f.enabled = enabled;
          toggle.set(enabled); draw();
          msg.ok(enabled ? t(fname + ' is switched on. It is asked again at the next check.', 'Η πηγή ' + fname + ' ενεργοποιήθηκε. Θα ρωτηθεί ξανά στον επόμενο έλεγχο.') : t(fname + ' is switched off.', 'Η πηγή ' + fname + ' απενεργοποιήθηκε.'));
          SC.toast(enabled ? t('Feed on: ', 'Πηγή ενεργή: ') + fname : t('Feed off: ', 'Πηγή ανενεργή: ') + fname);
        } catch (e) {
          if (!alive || lost(e)) return;
          toggle.set(enabled);
          msg.bad(t('Not changed. ', 'Δεν άλλαξε. ') + failText(e, t('switch feeds', 'αλλάξετε πηγές')));
        } finally { toggle.disabled = false; }
      }
      const row = el('li', { class: 'nm-card st-feed' },
        el('div', { class: 'st-feed-main' }, el('div', { class: 'st-feed-h' }, el('h3', null, fname), badgeHost), el('p', null, fwhat), meta,
          url ? el('a', { class: 'link st-ext', href: url, target: '_blank', rel: 'noopener noreferrer' }, t('Source website', 'Ιστότοπος πηγής'), ' ', ic('external', 14)) : null),
        el('div', { class: 'st-swrow st-feed-sw' }, toggle, lab),
        msg);
      draw();
      return row;
    }
    async function secFeeds(host) {
      const d = await SC.api('/api/feeds');
      if (!alive) return;
      const feeds = Array.isArray(d && d.feeds) ? d.feeds : [];
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('Data sources', 'Πηγές δεδομένων'), t('Feeds', 'Πηγές'),
          t('Each feed is a place the site asks for data. Switch one off if it misbehaves or is not needed; the others carry on.', 'Κάθε πηγή είναι ένα μέρος από όπου ο ιστότοπος ζητά δεδομένα. Απενεργοποιήστε μια πηγή αν δυσλειτουργεί ή δεν χρειάζεται· οι υπόλοιπες συνεχίζουν.')),
          el('a', { class: 'pill-link', href: '#/feeds' }, SC.icon('sensor', 16), t('Open the Feed list', 'Άνοιγμα της λίστας πηγών'))),
        feeds.length ? el('ul', { class: 'st-rules' }, feeds.map(feedRow)) : el('div', { class: 'empty' }, t('No feeds are listed.', 'Δεν υπάρχουν καταχωρημένες πηγές.'))));
    }

    /* ---------- league switch ---------- */
    async function secLeague(host) {
      const d = await SC.api('/app/api/league');
      if (!alive) return;
      let on = Boolean(d && d.enabled);
      const msg = msgBox();
      const lab = el('span', { class: 'st-sw-t' });
      const stateTx = el('p', { class: 'st-state' });
      const paint = () => { lab.textContent = on ? t('On', 'Ενεργό') : t('Off', 'Ανενεργό'); stateTx.textContent = on ? t('The league is on. Anyone visiting can see the school ranking.', 'Το πρωτάθλημα είναι ενεργό. Όποιος επισκέπτεται τον ιστότοπο μπορεί να δει την κατάταξη των σχολείων.') : t('The league is off. Visitors see a short note that it is switched off.', 'Το πρωτάθλημα είναι ανενεργό. Οι επισκέπτες βλέπουν ένα σύντομο σημείωμα ότι είναι απενεργοποιημένο.'); };
      async function apply(v) {
        toggle.disabled = true; msg.clear();
        try {
          const r = await SC.api('/app/api/league', { method: 'PUT', body: { enabled: v } });
          if (!alive) return;
          on = r && typeof r.enabled === 'boolean' ? r.enabled : v;
          toggle.set(on); paint();
          msg.ok(on ? t('Saved. The league is now on.', 'Αποθηκεύτηκε. Το πρωτάθλημα είναι τώρα ενεργό.') : t('Saved. The league is now off.', 'Αποθηκεύτηκε. Το πρωτάθλημα είναι τώρα ανενεργό.'));
          SC.toast(on ? t('League on', 'Πρωτάθλημα ενεργό') : t('League off', 'Πρωτάθλημα ανενεργό'));
        } catch (e) {
          if (!alive || lost(e)) return;
          toggle.set(on);
          msg.bad(t('Not changed. ', 'Δεν άλλαξε. ') + failText(e, t('switch the league', 'αλλάξετε το πρωτάθλημα')));
        } finally { toggle.disabled = false; }
      }
      const toggle = sw(on, t('League on', 'Πρωτάθλημα ενεργό'), (v) => {
        if (!v) return apply(false);
        toggle.set(false);
        confirmBox(t('Turn the league on?', 'Ενεργοποίηση του πρωταθλήματος;'), t('Anyone who visits the site will be able to see a ranking of the schools. It ranks schools only, from data collected, never people. You can turn it off again at any time.', 'Όποιος επισκέπτεται τον ιστότοπο θα μπορεί να δει κατάταξη των σχολείων. Κατατάσσει μόνο σχολεία, από δεδομένα που έχουν συλλεχθεί, ποτέ ανθρώπους. Μπορείτε να το απενεργοποιήσετε ξανά οποιαδήποτε στιγμή.'), t('Turn on', 'Ενεργοποίηση'), () => apply(true));
      });
      paint();
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('Optional', 'Προαιρετικό'), t('League', 'Πρωτάθλημα'),
          t('A friendly ranking of schools by how much data they have collected: sensors online, approved tools and finished plans. It is off by default. It never ranks or names people.', 'Μια φιλική κατάταξη σχολείων με βάση τα δεδομένα που έχουν συλλέξει: αισθητήρες σε λειτουργία, εγκεκριμένα εργαλεία και ολοκληρωμένα σχέδια. Είναι ανενεργό από προεπιλογή. Δεν κατατάσσει ούτε κατονομάζει ανθρώπους.'))),
        el('section', { class: 'nm-card st-league' },
          el('div', { class: 'st-swrow st-big' }, toggle, el('div', null, el('b', null, t('Show the league on the site', 'Εμφάνιση του πρωταθλήματος στον ιστότοπο')), lab)),
          stateTx, msg,
          el('a', { class: 'pill-link', href: '#/league' }, SC.icon('trophy', 16), t('Open the League page', 'Άνοιγμα της σελίδας πρωταθλήματος')))));
    }

    /* ---------- school codes ---------- */
    function schoolCard(s, redraw) {
      const msg = msgBox();
      const studentCode = el('span', { class: 'st-code', tabindex: '0', 'aria-label': t('Student code', 'Κωδικός μαθητών') }, s.student_code || '');
      const teacherShown = { v: false };
      const teacherCode = el('span', { class: 'st-code', tabindex: '0', 'aria-label': t('Teacher code', 'Κωδικός εκπαιδευτικών') }, '••••••');
      const eye = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', 'aria-pressed': 'false' }, ic('eye', 16), t('Show', 'Εμφάνιση'));
      eye.addEventListener('click', () => { teacherShown.v = !teacherShown.v; teacherCode.textContent = teacherShown.v ? s.teacher_code : '••••••'; eye.replaceChildren(ic('eye', 16), teacherShown.v ? t('Hide', 'Απόκρυψη') : t('Show', 'Εμφάνιση')); eye.setAttribute('aria-pressed', teacherShown.v ? 'true' : 'false'); });
      async function regenerate(kind, btn) {
        btn.disabled = true; msg.clear();
        try {
          const r = await SC.api('/app/api/manage/schools/' + encodeURIComponent(s.id), { method: 'POST', body: { regenerate: kind } });
          if (!alive) return;
          const ns = r && r.school;
          if (ns) { if (kind === 'student') { s.student_code = ns.student_code; studentCode.textContent = s.student_code; } else { s.teacher_code = ns.teacher_code; teacherCode.textContent = teacherShown.v ? s.teacher_code : '••••••'; } }
          ovMemo = null;
          msg.ok(kind === 'student' ? t('Made a new student code. The old one no longer works; people who already joined are not affected.', 'Δημιουργήθηκε νέος κωδικός μαθητών. Ο παλιός δεν λειτουργεί πια· όσοι έχουν ήδη εγγραφεί δεν επηρεάζονται.') : t('Made a new teacher code. The old one no longer works.', 'Δημιουργήθηκε νέος κωδικός εκπαιδευτικών. Ο παλιός δεν λειτουργεί πια.'));
        } catch (e) {
          if (!alive || lost(e)) return;
          msg.bad(t('No new code was made. ', 'Δεν δημιουργήθηκε νέος κωδικός. ') + failText(e, t('change codes', 'αλλάξετε κωδικούς')));
        } finally { btn.disabled = false; }
      }
      const codeRow = (label, node, extra, kind) => {
        const copy = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, ic('copy', 16), t('Copy', 'Αντιγραφή'));
        copy.addEventListener('click', () => copyText(kind === 'student' ? s.student_code : s.teacher_code, node));
        const nw = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, ic('refresh', 16), t('New code', 'Νέος κωδικός'));
        nw.addEventListener('click', () => confirmBox(kind === 'student' ? t('Make a new student code?', 'Νέος κωδικός μαθητών;') : t('Make a new teacher code?', 'Νέος κωδικός εκπαιδευτικών;'), kind === 'student' ? t('The old code stops working. People who already joined are not affected.', 'Ο παλιός κωδικός σταματά να λειτουργεί. Όσοι έχουν ήδη εγγραφεί δεν επηρεάζονται.') : t('The old code stops working. Give the new one only to teachers.', 'Ο παλιός κωδικός σταματά να λειτουργεί. Δώστε τον νέο μόνο σε εκπαιδευτικούς.'), t('New code', 'Νέος κωδικός'), () => regenerate(kind, nw)));
        return el('div', { class: 'st-coderow' }, el('span', { class: 'st-lb' }, label), el('div', { class: 'st-codeline' }, node, extra, copy, nw));
      };
      const match = el('input', { class: 'nm-input', id: 'st-match-' + s.id, type: 'text', value: s.match || '', maxlength: 200, placeholder: 'larnaka, larnaca', autocomplete: 'off' });
      const matchBtn = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, ic('save', 16), t('Save', 'Αποθήκευση'));
      matchBtn.addEventListener('click', async () => {
        matchBtn.disabled = true; msg.clear();
        try {
          const r = await SC.api('/app/api/manage/schools/' + encodeURIComponent(s.id), { method: 'POST', body: { match: match.value } });
          if (!alive) return;
          if (r && r.school) { s.match = r.school.match; match.value = s.match || ''; }
          ovMemo = null;
          msg.ok(t('Saved. Vehicles whose name contains one of these words now belong to this school.', 'Αποθηκεύτηκε. Τα οχήματα με όνομα που περιέχει μία από αυτές τις λέξεις ανήκουν πλέον σε αυτό το σχολείο.'));
        } catch (e) {
          if (!alive || lost(e)) return;
          msg.bad(t('Not saved. ', 'Δεν αποθηκεύτηκε. ') + failText(e, t('change vehicle words', 'αλλάξετε τις λέξεις οχημάτων')));
        } finally { matchBtn.disabled = false; }
      });
      return el('li', { class: 'nm-card st-school' },
        el('h3', null, s.name),
        codeRow(t('Student code', 'Κωδικός μαθητών'), studentCode, null, 'student'),
        s.teacher_code != null ? codeRow(t('Teacher code (give only to teachers)', 'Κωδικός εκπαιδευτικών (μόνο σε εκπαιδευτικούς)'), teacherCode, eye, 'teacher') : null,
        isAdmin ? el('div', { class: 'st-coderow' }, el('label', { class: 'st-lb', for: 'st-match-' + s.id }, t('Vehicle words (separated by commas)', 'Λέξεις οχημάτων (χωρισμένες με κόμμα)')),
          el('p', { class: 'st-hint2' }, t('A vehicle belongs to this school when its name or SenseCAP group contains one of these words.', 'Ένα όχημα ανήκει σε αυτό το σχολείο όταν το όνομά του ή η ομάδα SenseCAP περιέχει μία από αυτές τις λέξεις.')),
          el('div', { class: 'st-codeline' }, el('div', { class: 'st-grow' }, match), matchBtn)) : null,
        msg);
    }
    async function secCodes(host) {
      const ov = await overview(true);
      if (!alive) return;
      const schools = Array.isArray(ov && ov.schools) ? ov.schools : [];
      const link = location.origin + '/app/';
      const linkNode = el('span', { class: 'st-code st-link', tabindex: '0' }, link);
      const copyLink = el('button', { class: 'nm-btn nm-btn--sm', type: 'button' }, ic('copy', 16), t('Copy link', 'Αντιγραφή συνδέσμου'));
      copyLink.addEventListener('click', () => copyText(link, linkNode));
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('Joining', 'Εγγραφή'), t('School codes', 'Κωδικοί σχολείου'),
          t('People join with the link below and the code of their school. New accounts wait for a teacher in Approvals. Treat codes like keys: share them only with the people who should join.', 'Οι άνθρωποι εγγράφονται με τον παρακάτω σύνδεσμο και τον κωδικό του σχολείου τους. Οι νέοι λογαριασμοί περιμένουν έναν εκπαιδευτικό στις Εγκρίσεις. Μεταχειριστείτε τους κωδικούς σαν κλειδιά: μοιραστείτε τους μόνο με όσους πρέπει να εγγραφούν.')),
          el('div', { class: 'st-codeline' }, linkNode, copyLink)),
        schools.length ? el('ul', { class: 'st-rules' }, schools.map((s) => schoolCard(s))) : el('div', { class: 'empty' }, t('No schools are listed.', 'Δεν υπάρχουν καταχωρημένα σχολεία.')),
        !isAdmin ? el('p', { class: 'muted st-fine' }, t('You see your own school. Only an admin can see the teacher code, change it, or change which vehicles belong to a school.', 'Βλέπετε το δικό σας σχολείο. Μόνο ένας διαχειριστής μπορεί να δει τον κωδικό εκπαιδευτικών, να τον αλλάξει ή να αλλάξει ποια οχήματα ανήκουν σε σχολείο.')) : null));
    }

    /* ---------- handbook ---------- */
    const PRIVATE = /^\s*(staff|private|internal)\b/i;
    const GUIDE = /^\s*sensor guide:/i;
    async function secHandbook(host) {
      const d = await SC.api('/app/api/handbook');
      if (!alive) return;
      let docs = (Array.isArray(d && d.docs) ? d.docs : []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
      let filter = '', cur = null, dirty = false;   // cur: { id|null, title, body } being edited
      const listHost = el('div'), editHost = el('aside', { class: 'nm-card st-hb-edit', 'aria-live': 'polite' }), findBox = el('input', { class: 'nm-input', type: 'search', 'aria-label': t('Find a page', 'Αναζήτηση σελίδας'), placeholder: t('Find a page', 'Αναζήτηση σελίδας'), maxlength: 60 });
      const flash = msgBox();

      const badgeFor = (title) => (PRIVATE.test(title) ? el('span', { class: 'st-badge s-off' }, ic('lock', 12), t('Staff only', 'Μόνο προσωπικό')) : GUIDE.test(title) ? el('span', { class: 'st-badge s-info' }, t('Sensor guide', 'Οδηγός αισθητήρα')) : el('span', { class: 'st-badge s-ok' }, t('Public', 'Δημόσιο')));
      function drawList() {
        const q = filter.trim().toLowerCase();
        const shown = docs.filter((x) => !q || String(x.title).toLowerCase().includes(q) || String(x.body).toLowerCase().includes(q));
        listHost.replaceChildren(shown.length ? el('ul', { class: 'st-hb-list' }, shown.map((x) => {
          const on = cur && cur.id === x.id;
          const b = el('button', { class: 'st-hb-item' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false' },
            el('div', { class: 'st-hb-t' }, el('b', null, x.title), badgeFor(x.title)),
            el('span', { class: 'st-hb-s' }, String(x.body).replace(/\s+/g, ' ').slice(0, 110)),
            el('small', null, x.updated_at ? t('Changed ' + SC.ago(x.updated_at), 'Άλλαξε ' + SC.ago(x.updated_at)) : ''));
          b.addEventListener('click', () => openDoc({ id: x.id, title: x.title, body: x.body }));
          return el('li', null, b);
        })) : el('div', { class: 'empty' }, docs.length ? t('No page matches that. Clear the box to see all pages.', 'Καμία σελίδα δεν ταιριάζει. Καθαρίστε το πλαίσιο για να δείτε όλες.') : t('There are no handbook pages yet. Add the first one.', 'Δεν υπάρχουν ακόμη σελίδες εγχειριδίου. Προσθέστε την πρώτη.')));
      }
      function openDoc(doc) {
        const go = () => { cur = doc; dirty = false; drawList(); drawEditor(); if (doc && matchMedia('(max-width: 900px)').matches) editHost.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
        if (dirty) confirmBox(t('Leave without saving?', 'Έξοδος χωρίς αποθήκευση;'), t('Your changes to this page have not been saved.', 'Οι αλλαγές σας σε αυτή τη σελίδα δεν έχουν αποθηκευτεί.'), t('Leave', 'Έξοδος'), go, true);
        else go();
      }
      function drawEditor() {
        if (!cur) {
          editHost.replaceChildren(el('p', { class: 'card-eye' }, t('Editor', 'Επεξεργασία')), el('h2', { class: 'card-h st-h' }, t('Choose a page', 'Επιλέξτε μια σελίδα')),
            el('p', { class: 'st-sub' }, t('Pick a page on the left to change it, or start a new one.', 'Επιλέξτε μια σελίδα αριστερά για να την αλλάξετε, ή ξεκινήστε νέα.')));
          return;
        }
        const isNew = cur.id == null;
        const msg = msgBox();
        const title = el('input', { class: 'nm-input', id: 'st-hb-title', type: 'text', maxlength: 80, autocomplete: 'off', value: cur.title, 'aria-describedby': 'st-hb-tm', spellcheck: 'true' });
        const body = el('textarea', { class: 'nm-input st-hb-body', id: 'st-hb-body', maxlength: 6000, rows: 12, 'aria-describedby': 'st-hb-bm', spellcheck: 'true' });
        body.value = cur.body;   // textarea text is plain text, never HTML
        const tm = el('div', { class: 'st-hint', id: 'st-hb-tm', 'aria-live': 'polite' });
        const bm = el('div', { class: 'st-hint', id: 'st-hb-bm' });
        const vis = el('span', { class: 'st-vis' });
        const save = el('button', { class: 'nm-btn nm-btn--primary', type: 'button' }, ic('save', 18), t('Save page', 'Αποθήκευση σελίδας'));
        const orig = { title: cur.title, body: cur.body };
        const upd = () => {
          bm.textContent = t(body.value.length + ' of 6000 characters', body.value.length + ' από 6000 χαρακτήρες');
          vis.replaceChildren(badgeFor(title.value));
          dirty = title.value !== orig.title || body.value !== orig.body;
          save.disabled = !dirty && !isNew;
          if (dirty) msg.clear();
        };
        title.addEventListener('input', () => { tm.textContent = ''; upd(); });
        body.addEventListener('input', upd);
        save.addEventListener('click', async () => {
          tm.textContent = '';
          const ti = title.value.trim(), tx = body.value.replace(/\r\n/g, '\n').trim();
          if (!ti) { tm.textContent = t('Give the page a title.', 'Δώστε στη σελίδα έναν τίτλο.'); title.focus(); return; }
          if (!tx) { msg.bad(t('Write some text on the page first.', 'Γράψτε πρώτα κάποιο κείμενο στη σελίδα.')); body.focus(); return; }
          save.disabled = true; msg.clear();
          try {
            await SC.api('/app/api/manage/handbook', { method: 'POST', body: { id: cur.id == null ? undefined : cur.id, title: ti, body: tx } });
            if (!alive) return;
            const r = await SC.api('/app/api/handbook');
            docs = (Array.isArray(r && r.docs) ? r.docs : []).slice().sort((a, b) => String(a.title).localeCompare(String(b.title)));
            const found = docs.find((x) => x.title === ti);
            cur = found ? { id: found.id, title: found.title, body: found.body } : null; dirty = false;
            drawList(); drawEditor();
            const m2 = editHost.querySelector('.st-msg'); if (m2 && m2.ok) m2.ok(t('Saved at ' + SC.time(Date.now()) + '. The assistant uses it from now on.', 'Αποθηκεύτηκε στις ' + SC.time(Date.now()) + '. Ο βοηθός τη χρησιμοποιεί από τώρα.'));
            SC.toast(t('Page saved', 'Η σελίδα αποθηκεύτηκε'));
          } catch (e) {
            if (!alive || lost(e)) return;
            save.disabled = false;
            if (e.status === 409) { tm.textContent = t('A page with that title already exists. Choose another title.', 'Υπάρχει ήδη σελίδα με αυτόν τον τίτλο. Επιλέξτε άλλον τίτλο.'); title.focus(); }
            else msg.bad(t('Not saved. ', 'Δεν αποθηκεύτηκε. ') + failText(e, t('edit the handbook', 'επεξεργαστείτε το εγχειρίδιο')));
          }
        });
        const del = isNew ? null : el('button', { class: 'nm-btn nm-btn--danger-outline', type: 'button' }, ic('trash', 18), t('Delete', 'Διαγραφή'));
        if (del) del.addEventListener('click', () => confirmBox(t('Delete this page?', 'Διαγραφή αυτής της σελίδας;'), t('“' + cur.title + '” will be removed from the handbook. The assistant will no longer use it.', 'Η «' + cur.title + '» θα αφαιρεθεί από το εγχειρίδιο. Ο βοηθός δεν θα τη χρησιμοποιεί πια.'), t('Delete', 'Διαγραφή'), async () => {
          try {
            await SC.api('/app/api/manage/handbook/' + encodeURIComponent(cur.id) + '/delete', { method: 'POST', body: {} });
            if (!alive) return;
            docs = docs.filter((x) => x.id !== cur.id); cur = null; dirty = false; drawList(); drawEditor();
            flash.ok(t('The page was deleted.', 'Η σελίδα διαγράφηκε.')); SC.toast(t('Page deleted', 'Η σελίδα διαγράφηκε'));
          } catch (e) { if (!alive || lost(e)) return; msg.bad(t('Not deleted. ', 'Δεν διαγράφηκε. ') + failText(e, t('delete handbook pages', 'διαγράψετε σελίδες του εγχειριδίου'))); }
        }, true));
        const cancel = el('button', { class: 'nm-btn', type: 'button' }, t('Close', 'Κλείσιμο'));
        cancel.addEventListener('click', () => openDoc(null));
        editHost.replaceChildren(
          el('p', { class: 'card-eye' }, isNew ? t('New page', 'Νέα σελίδα') : t('Edit page', 'Επεξεργασία σελίδας')),
          el('h2', { class: 'card-h st-h' }, isNew ? t('Add a handbook page', 'Προσθήκη σελίδας εγχειριδίου') : cur.title),
          el('p', { class: 'st-sub' }, t('The assistant reads these pages before it answers. Write facts, deadlines and instructions, in English, Greek or both. Visitors can ask the assistant too, so keep private details out. A title that starts with Staff, Private or Internal is never given to visitors.', 'Ο βοηθός διαβάζει αυτές τις σελίδες πριν απαντήσει. Γράψτε γεγονότα, προθεσμίες και οδηγίες, στα αγγλικά, στα ελληνικά ή και στα δύο. Και οι επισκέπτες μπορούν να ρωτήσουν τον βοηθό, γι’ αυτό μη βάζετε ιδιωτικές λεπτομέρειες. Ένας τίτλος που ξεκινά με Staff, Private ή Internal δεν δίνεται ποτέ στους επισκέπτες.')),
          el('div', { class: 'st-fld' }, el('label', { for: 'st-hb-title' }, t('Title', 'Τίτλος')), title, tm, el('div', { class: 'st-visrow' }, el('span', null, t('Who can read it: ', 'Ποιος μπορεί να τη διαβάσει: ')), vis)),
          el('div', { class: 'st-fld' }, el('label', { for: 'st-hb-body' }, t('Text', 'Κείμενο')), body, bm,
            el('p', { class: 'st-hint2' }, t('Plain text only. Line breaks are kept. Anything that looks like a link or code is shown as typed and never runs.', 'Μόνο απλό κείμενο. Οι αλλαγές γραμμής διατηρούνται. Ό,τι μοιάζει με σύνδεσμο ή κώδικα εμφανίζεται όπως γράφτηκε και δεν εκτελείται ποτέ.'))),
          el('div', { class: 'st-act st-act2' }, save, cancel, del), msg);
        upd();
        if (isNew) title.focus();
      }
      findBox.addEventListener('input', () => { filter = findBox.value; drawList(); });
      const addBtn = el('button', { class: 'nm-btn nm-btn--primary', type: 'button' }, ic('plus', 18), t('New page', 'Νέα σελίδα'));
      addBtn.addEventListener('click', () => openDoc({ id: null, title: '', body: '' }));
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('Assistant', 'Βοηθός'), t('Handbook', 'Εγχειρίδιο'),
          t('The pages the assistant reads before it answers questions about the project. Sensor guides are handbook pages too: a page titled “Sensor guide: <name>” shows on the Sensor guides page.', 'Οι σελίδες που διαβάζει ο βοηθός πριν απαντήσει σε ερωτήσεις για το έργο. Οι οδηγοί αισθητήρων είναι επίσης σελίδες εγχειριδίου: μια σελίδα με τίτλο «Sensor guide: <όνομα>» εμφανίζεται στη σελίδα Οδηγοί αισθητήρων.')),
          addBtn),
        flash,
        el('div', { class: 'st-hb' }, el('div', { class: 'st-hb-left' }, findBox, listHost), editHost)));
      drawList(); drawEditor();
      cleanups.push(() => { dirty = false; });
    }

    /* ---------- announcements ---------- */
    async function secNews(host) {
      const msg = msgBox();
      const listHost = el('div');
      const ta = el('textarea', { class: 'nm-input st-news-ta', id: 'st-news-ta', maxlength: 800, rows: 4, 'aria-describedby': 'st-news-c' });
      const counter = el('div', { class: 'st-hint', id: 'st-news-c' });
      const post = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: true }, ic('megaphone', 18), t('Post announcement', 'Δημοσίευση ανακοίνωσης'));
      const upd = () => { counter.textContent = t(ta.value.length + ' of 800 characters', ta.value.length + ' από 800 χαρακτήρες'); post.disabled = !ta.value.trim(); };
      ta.addEventListener('input', () => { upd(); msg.clear(); });
      async function load() {
        // the list is cached for a short time on the way to visitors; a fresh query string makes sure teachers see their own post at once
        const r = await SC.api('/app/api/announcements?_=' + Date.now());
        if (!alive) return;
        const items = Array.isArray(r && r.items) ? r.items : [];
        listHost.replaceChildren(items.length ? el('ul', { class: 'st-news' }, items.map((a) => {
          const del = el('button', { class: 'nm-btn nm-btn--sm nm-btn--danger-outline', type: 'button', 'aria-label': t('Delete this announcement', 'Διαγραφή αυτής της ανακοίνωσης') }, ic('trash', 16), t('Delete', 'Διαγραφή'));
          del.addEventListener('click', () => confirmBox(t('Delete this announcement?', 'Διαγραφή αυτής της ανακοίνωσης;'), t('It disappears from the Schools page for everyone.', 'Εξαφανίζεται από τη σελίδα Σχολεία για όλους.'), t('Delete', 'Διαγραφή'), async () => {
            msg.clear();
            try {
              await SC.api('/app/api/manage/messages/' + encodeURIComponent(a.id) + '/delete', { method: 'POST', body: {} });
              if (!alive) return;
              await load(); msg.ok(t('The announcement was deleted.', 'Η ανακοίνωση διαγράφηκε.')); SC.toast(t('Announcement deleted', 'Η ανακοίνωση διαγράφηκε'));
            } catch (e) {
              if (!alive || lost(e)) return;
              msg.bad(t('Not deleted. ', 'Δεν διαγράφηκε. ') + (e.status === 403 ? t('Only an admin, or the teacher who wrote it, can delete an announcement.', 'Μόνο ένας διαχειριστής ή ο εκπαιδευτικός που την έγραψε μπορεί να τη διαγράψει.') : failText(e, t('delete announcements', 'διαγράψετε ανακοινώσεις'))));
            }
          }, true));
          return el('li', { class: 'nm-card st-new' }, el('p', { class: 'st-new-t' }, a.text), el('div', { class: 'st-new-m' }, el('span', null, String(a.by || '') + (a.at ? ' · ' + SC.dateTime(a.at) : '')), del));
        })) : el('div', { class: 'empty' }, t('No announcements yet. Write one above; it appears on the Schools page.', 'Δεν υπάρχουν ακόμη ανακοινώσεις. Γράψτε μία παραπάνω· εμφανίζεται στη σελίδα Σχολεία.')));
      }
      post.addEventListener('click', async () => {
        const text = ta.value.replace(/\r\n/g, '\n').trim();
        if (!text) return;
        post.disabled = true; msg.clear();
        try {
          await SC.api('/app/api/messages', { method: 'POST', body: { channel: 'all', body: text } });
          if (!alive) return;
          ta.value = ''; upd();
          await load();
          msg.ok(t('Posted. Visitors see it on the Schools page within about a minute.', 'Δημοσιεύτηκε. Οι επισκέπτες την βλέπουν στη σελίδα Σχολεία σε περίπου ένα λεπτό.'));
          SC.toast(t('Announcement posted', 'Η ανακοίνωση δημοσιεύτηκε'));
        } catch (e) {
          if (!alive || lost(e)) return;
          upd();
          msg.bad(t('Not posted. ', 'Δεν δημοσιεύτηκε. ') + (e.status === 400 || e.status === 403 || e.status === 429 ? errText(e) : failText(e, t('post announcements', 'δημοσιεύσετε ανακοινώσεις'))));
        }
      });
      await load();
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('Schools page', 'Σελίδα Σχολεία'), t('Announcements', 'Ανακοινώσεις'),
          t('A short note for everyone who visits the Schools page. It is read-only: nobody can reply. It shows as “Teacher” or “Admin” with the school name, never your own name. The last 10 are shown.', 'Ένα σύντομο σημείωμα για όλους όσους επισκέπτονται τη σελίδα Σχολεία. Είναι μόνο για ανάγνωση: κανείς δεν μπορεί να απαντήσει. Εμφανίζεται ως «Teacher» ή «Admin» με το όνομα του σχολείου, ποτέ με το δικό σας όνομα. Εμφανίζονται οι τελευταίες 10.')),
          el('div', { class: 'st-fld' }, el('label', { for: 'st-news-ta' }, t('New announcement', 'Νέα ανακοίνωση')), ta, counter),
          el('div', { class: 'st-act st-act2' }, post), msg),
        listHost));
      upd();
    }

    /* ---------- team and roles ---------- */
    async function secTeam(host) {
      const ov = await overview(true);
      if (!alive) return;
      const members = (ov.members || []).filter((m) => m.status === 'active').length;
      const waiting = Number(ov.pending) || 0, teams = (ov.teams || []).length, reports = (ov.reports || []).length;
      const stat = (n, w1, w2, ew1, ew2) => el('div', { class: 'st-stat' }, el('b', null, String(n)), el('span', null, n === 1 ? t(w1, ew1) : t(w2, ew2)));
      const lnk = (href, icon, label, primary) => el('a', { class: 'nm-btn' + (primary ? ' nm-btn--primary' : ''), href }, ic(icon, 18), label);
      host.replaceChildren(el('div', { class: 'st-sec' },
        el('section', { class: 'nm-card st-intro' }, ...sectionHead(t('People', 'Άνθρωποι'), t('Team and roles', 'Ομάδα και ρόλοι'),
          t('Adding and removing members, muting, resetting passwords, teams, reports and the history live in the teacher tools of the student app. You are already signed in there.', 'Η προσθήκη και αφαίρεση μελών, η σίγαση, η επαναφορά κωδικών, οι ομάδες, οι αναφορές και το ιστορικό βρίσκονται στα εργαλεία εκπαιδευτικών της εφαρμογής των μαθητών. Είστε ήδη συνδεδεμένοι εκεί.')),
          el('div', { class: 'st-stats' },
            stat(members, 'active member', 'active members', 'ενεργό μέλος', 'ενεργά μέλη'),
            stat(waiting, 'account waiting', 'accounts waiting', 'λογαριασμός περιμένει', 'λογαριασμοί περιμένουν'),
            stat(teams, 'team', 'teams', 'ομάδα', 'ομάδες'),
            stat(reports, 'open report', 'open reports', 'ανοιχτή αναφορά', 'ανοιχτές αναφορές')),
          el('div', { class: 'st-links' }, lnk('/app/#/manage', 'users', t('Open teacher tools', 'Άνοιγμα εργαλείων εκπαιδευτικών'), true), lnk('/app/#/manage/members', 'users', t('Members', 'Μέλη')), lnk('/app/#/manage/teams', 'flag', t('Teams', 'Ομάδες')), lnk('#/approvals', 'check', t('Approvals', 'Εγκρίσεις')))),
        el('section', { class: 'nm-card st-roles', 'aria-labelledby': 'st-roles-h' }, el('h2', { class: 'card-h st-h', id: 'st-roles-h' }, t('Who can do what', 'Ποιος μπορεί τι')),
          el('ul', null,
            el('li', null, el('b', null, t('Admin. ', 'Διαχειριστής. ')), t('Sees every school. Can approve teachers, see and change teacher codes, set which vehicles belong to a school, and read the history.', 'Βλέπει όλα τα σχολεία. Μπορεί να εγκρίνει εκπαιδευτικούς, να δει και να αλλάξει τους κωδικούς εκπαιδευτικών, να ορίσει ποια οχήματα ανήκουν σε σχολείο και να διαβάσει το ιστορικό.')),
            el('li', null, el('b', null, t('Teacher. ', 'Εκπαιδευτικός. ')), t('Works with their own school: approves students, makes new student codes, edits the handbook, posts announcements and changes alert rules and feeds.', 'Δουλεύει με το δικό του σχολείο: εγκρίνει μαθητές, φτιάχνει νέους κωδικούς μαθητών, επεξεργάζεται το εγχειρίδιο, δημοσιεύει ανακοινώσεις και αλλάζει κανόνες ειδοποιήσεων και πηγές.')),
            el('li', null, el('b', null, t('Visitors and students. ', 'Επισκέπτες και μαθητές. ')), t('Never see this page and cannot change anything here.', 'Δεν βλέπουν ποτέ αυτή τη σελίδα και δεν μπορούν να αλλάξουν τίποτα εδώ.'))))));
    }

    /* ---------- tabs ---------- */
    const SECTIONS = [
      { id: 'rules', label: ['Alert rules', 'Κανόνες ειδοποιήσεων'], run: secRules },
      { id: 'feeds', label: ['Feeds', 'Πηγές'], run: secFeeds },
      { id: 'league', label: ['League', 'Πρωτάθλημα'], run: secLeague },
      { id: 'codes', label: ['School codes', 'Κωδικοί σχολείου'], run: secCodes },
      { id: 'handbook', label: ['Handbook', 'Εγχειρίδιο'], run: secHandbook },
      { id: 'news', label: ['Announcements', 'Ανακοινώσεις'], run: secNews },
      { id: 'team', label: ['Team and roles', 'Ομάδα και ρόλοι'], run: secTeam },
    ];
    let tab = SECTIONS.some((s) => s.id === (ctx.args || [])[0]) ? ctx.args[0] : 'rules';
    const tabs = el('div', { class: 'st-tabs', role: 'tablist', 'aria-label': t('Settings sections', 'Ενότητες ρυθμίσεων') });
    const pane = el('div', { role: 'tabpanel', id: 'st-pane', 'aria-labelledby': 'st-tab-' + tab, tabindex: '-1' });
    function drawTabs() {
      tabs.replaceChildren(...SECTIONS.map((s) => {
        const on = s.id === tab;
        const b = el('button', { class: 'nm-tab' + (on ? ' on' : ''), type: 'button', role: 'tab', id: 'st-tab-' + s.id, 'aria-selected': on ? 'true' : 'false', 'aria-controls': 'st-pane', tabindex: on ? '0' : '-1', dataset: { id: s.id } }, t(s.label[0], s.label[1]));
        b.addEventListener('click', () => choose(s.id));
        b.addEventListener('keydown', (e) => {
          const i = SECTIONS.findIndex((x) => x.id === s.id);
          const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? SECTIONS.length - 1 : null;
          if (n == null) return;
          e.preventDefault();
          const to = SECTIONS[(n + SECTIONS.length) % SECTIONS.length].id;
          choose(to); const nb = tabs.querySelector('[data-id="' + to + '"]'); if (nb) nb.focus();
        });
        return b;
      }));
      pane.setAttribute('aria-labelledby', 'st-tab-' + tab);
    }
    function choose(id) {
      tab = id;
      try { history.replaceState(null, '', '#/settings/' + id); } catch (e) { /* the address stays as it is */ }
      drawTabs();
      show(id);
    }
    // each visit to a section gets its own box, so a slow section that finishes after the person moved on cannot draw over the new one
    function show(id) {
      const sec = SECTIONS.find((s) => s.id === id);
      const box = el('div');
      pane.replaceChildren(box);
      mount(box, () => sec.run(box));
    }

    root.append(el('div', { class: 'st' }, head, banner, tabs, pane));
    drawTabs();
    show(tab);
    return () => { alive = false; cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); };
  }

  SC.register('settings', {
    title: ['Settings', 'Ρυθμίσεις'],
    render(root, ctx) {
      SC.css('/site/pages/settings.css');
      const me = ctx.me || SC.me;
      if (!me || !(me.role === 'teacher' || me.role === 'admin')) return signIn(root);
      return settings(root, ctx, me);
    },
  });
})();
