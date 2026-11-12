/* Join the project: students (and teachers) ask for their own account here, and sign in.
   No email and no class code: a teacher or an admin approves every request. Until then the account sees the same public pages as a visitor.
   Signed in, this page is "My account": the waiting screen, a way to change the password and to sign out.
   API: GET /app/api/schools, GET /app/api/schools/public (teams), POST /app/api/join, POST /app/api/login, POST /app/api/logout,
        GET /app/api/me, POST /app/api/me/password. Nothing here is stored in the browser except the last school chosen on the sign-in form. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const ic = (n, s) => SC.icon(n, s || 18);
  const LAST = 'sc.join.school';

  /* ---------- messages: the server's English text, or ours in Greek ---------- */
  function errText(e, doing) {
    const code = e && e.body && e.body.code;
    const st = e && e.status;
    if (st === 0) return e.message;
    if (st === 429 && code === 'full') return t('Many requests are waiting. Ask a teacher to approve some first, then try again.', 'Πολλά αιτήματα περιμένουν. Ζητήστε από έναν εκπαιδευτικό να εγκρίνει μερικά και δοκιμάστε ξανά.');
    if (st === 429) return t('Many tries just now. Wait a few minutes, then try again.', 'Πολλές προσπάθειες αυτή τη στιγμή. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.');
    if (doing === 'login') {
      if (st === 401) return t('That name and password do not match for this school. Check the school too. Lost your password? Ask a teacher for a temporary one.', 'Το όνομα και ο κωδικός δεν ταιριάζουν για αυτό το σχολείο. Ελέγξτε και το σχολείο. Χάσατε τον κωδικό; Ζητήστε προσωρινό από έναν εκπαιδευτικό.');
      if (st === 403) return t('Your request was not approved. Ask your teacher.', 'Το αίτημά σας δεν εγκρίθηκε. Ρωτήστε τον εκπαιδευτικό σας.');
    }
    if (SC.lang === 'el') {
      if (st === 409) return 'Κάποιος στο σχολείο σας χρησιμοποιεί ήδη αυτό το όνομα. Προσθέστε αρχικό ή αριθμό.';
      if (code === 'name') return 'Χρησιμοποιήστε 2 έως 24 γράμματα ή αριθμούς για το όνομα (χωρίς @ ή σύμβολα). Ένα όνομα που μοιάζει με όνομα προσωπικού δεν επιτρέπεται.';
      if (code === 'password') return 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες, δεν μπορεί να είναι το όνομά σας και δεν πρέπει να είναι πολύ εύκολος.';
      if (code === 'team') return 'Διαλέξτε μια ομάδα του σχολείου σας ή ζητήστε νέα. Το όνομα ομάδας έχει 2 έως 40 γράμματα ή αριθμούς.';
      if (code === 'school') return 'Διαλέξτε πρώτα την πόλη και το σχολείο σας.';
      if (code === 'consent') return 'Επιλέξτε το πλαίσιο για να επιβεβαιώσετε ότι καταλαβαίνετε πώς λειτουργεί ο ιστότοπος.';
    }
    return (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  }

  const roleName = (r) => (r === 'admin' ? t('Admin', 'Διαχειριστής') : r === 'teacher' ? t('Teacher', 'Εκπαιδευτικός') : t('Student', 'Μαθητής'));

  async function signOut(btn) {
    if (btn) btn.disabled = true;
    try { await SC.api('/app/api/logout', { method: 'POST', body: {} }); } catch (e) { /* the cookie ends by itself */ }
    location.hash = '#/join';
    location.reload();
  }

  function mkHead(signedIn) {
    return SC.head({
      title: signedIn ? t('My account', 'Ο λογαριασμός μου') : t('Join the project', 'Ελάτε στο έργο'),
      lede: signedIn
        ? t('Your name, your school and your team. Change your password or sign out here.', 'Το όνομά σας, το σχολείο σας και η ομάδα σας. Εδώ αλλάζετε τον κωδικό σας ή αποσυνδέεστε.')
        : t('Make your own account to build and propose tools in the Build studio. Pick your city and team, choose a name and a password, and a teacher approves you. Everyone can look around the whole site while they wait.',
          'Φτιάξτε τον δικό σας λογαριασμό για να δημιουργείτε και να προτείνετε εργαλεία στο Στούντιο. Διαλέξτε πόλη και ομάδα, ένα όνομα και έναν κωδικό, και ένας εκπαιδευτικός σας εγκρίνει. Όλοι μπορούν να δουν ολόκληρο τον ιστότοπο όσο περιμένουν.'),
      tags: signedIn ? [] : [{ text: t('No email · no class code', 'Χωρίς email · χωρίς κωδικό τάξης'), cls: 'live' }],
      help: signedIn
        ? ['This is your account page. While you wait for approval you can look at every public page. Once a teacher or an admin approves you, the Build studio opens for you. If you lose your password, ask a teacher: they can give you a temporary one.',
          'Αυτή είναι η σελίδα του λογαριασμού σας. Όσο περιμένετε έγκριση μπορείτε να δείτε κάθε δημόσια σελίδα. Μόλις σας εγκρίνει ένας εκπαιδευτικός ή ο διαχειριστής, ανοίγει το Στούντιο. Αν χάσετε τον κωδικό σας, ρωτήστε έναν εκπαιδευτικό: μπορεί να σας δώσει προσωρινό.']
        : ['Pick your city, then your team, then choose a display name and a password. Use a first name and an initial, never your surname. A teacher or an admin checks every request. There is no email: if you lose your password, a teacher gives you a temporary one.',
          'Διαλέξτε πόλη, μετά ομάδα και μετά ένα όνομα εμφάνισης και έναν κωδικό. Χρησιμοποιήστε μικρό όνομα και αρχικό, ποτέ το επώνυμό σας. Ένας εκπαιδευτικός ή ο διαχειριστής ελέγχει κάθε αίτημα. Δεν υπάρχει email: αν χάσετε τον κωδικό σας, ένας εκπαιδευτικός σάς δίνει προσωρινό.'],
    });
  }

  /* ================= signed out: ask to join, or sign in ================= */
  function visitor(root) {
    const F = { teacher: false, school: null, team: null, addTeam: false, busy: false, err: '', show: false };
    let schools = [];
    let loadFailed = null;

    const name = el('input', { class: 'nm-input', id: 'jn-name', type: 'text', autocomplete: 'username', maxlength: 24, required: true });
    const pw = el('input', { class: 'nm-input', id: 'jn-pw', type: 'password', autocomplete: 'new-password', maxlength: 100, required: true });
    const newTeam = el('input', { class: 'nm-input', id: 'jn-newteam', type: 'text', autocomplete: 'off', maxlength: 40 });
    const consent = el('input', { type: 'checkbox', id: 'jn-consent' });
    const createHost = el('section', { class: 'nm-card jn-card', 'aria-labelledby': 'jn-create-h' });
    const signHost = el('section', { class: 'nm-card jn-card', 'aria-labelledby': 'jn-sign-h' });

    const chip = (label, on, click, extra) => el('button', { class: 'jn-chip' + (extra ? ' ' + extra : ''), type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', onclick: click }, extra === 'add' ? null : el('i'), label);
    const schoolOf = () => schools.find((s) => s.id === F.school) || null;

    function stepBox(n, done, title, hint, body) {
      return el('div', { class: 'jn-step' + (done ? ' done' : '') }, el('span', { class: 'jn-n' }, done ? '✓' : String(n)), el('div', null, el('h3', null, title), hint ? el('p', null, hint) : null), el('div', { class: 'jn-body' }, body));
    }

    function drawCreate() {
      const sc = schoolOf();
      let n = 0;
      const steps = [];
      // 1. city
      n++;
      steps.push(stepBox(n, !!sc, t('Your city', 'Η πόλη σας'), t('The school you belong to.', 'Το σχολείο στο οποίο ανήκετε.'),
        loadFailed
          ? el('div', null, el('div', { class: 'err', role: 'alert' }, errText(loadFailed)), el('button', { class: 'jn-link', type: 'button', onclick: load }, t('Try again', 'Δοκιμάστε ξανά')))
          : !schools.length ? el('p', { class: 'jn-none' }, t('Loading', 'Φόρτωση'))
            : el('div', { class: 'jn-chips', role: 'radiogroup', 'aria-label': t('Your city', 'Η πόλη σας') }, schools.map((s) => chip(s.name, F.school === s.id, () => { F.school = s.id; F.team = null; F.addTeam = false; drawCreate(); })))));
      // 2. team (students only)
      if (!F.teacher) {
        n++;
        const teams = sc ? sc.teams || [] : [];
        const picked = F.team != null || (F.addTeam && newTeam.value.trim().length >= 2);
        steps.push(stepBox(n, picked, t('Your team', 'Η ομάδα σας'),
          sc ? t('The teams already at ' + sc.name + '. Not listed? Ask for yours: a teacher confirms it.', 'Οι ομάδες που υπάρχουν ήδη στο ' + sc.name + '. Δεν υπάρχει η δική σας; Ζητήστε την: την επιβεβαιώνει ένας εκπαιδευτικός.') : t('Pick your city first.', 'Διαλέξτε πρώτα πόλη.'),
          sc ? el('div', null,
            el('div', { class: 'jn-chips', role: 'radiogroup', 'aria-label': t('Your team', 'Η ομάδα σας') },
              teams.map((tm) => chip(tm.name, F.team === tm.id, () => { F.team = tm.id; F.addTeam = false; drawCreate(); })),
              chip(t('+ My team is not here', '+ Η ομάδα μου δεν υπάρχει'), F.addTeam, () => { F.addTeam = true; F.team = null; drawCreate(); newTeam.focus(); }, 'add')),
            teams.length ? null : el('p', { class: 'jn-none', style: { marginTop: '8px' } }, t('No team here yet. Be the first: ask for yours.', 'Καμία ομάδα ακόμη. Γίνετε οι πρώτοι: ζητήστε τη δική σας.')),
            F.addTeam ? el('div', { class: 'jn-f jn-newteam' }, el('label', { for: 'jn-newteam' }, t('Name of your team', 'Όνομα της ομάδας σας')), newTeam,
              el('span', { class: 'hint' }, t('Something your class will know. No real names.', 'Κάτι που θα το γνωρίζει η τάξη σας. Χωρίς πραγματικά ονόματα.'))) : null) : null));
      }
      // 3. name and password
      n++;
      const pwBox = el('div', { class: 'jn-pw' }, pw, el('button', { type: 'button', 'aria-pressed': F.show ? 'true' : 'false', onclick: () => { F.show = !F.show; pw.type = F.show ? 'text' : 'password'; drawCreate(); } }, F.show ? t('Hide', 'Απόκρυψη') : t('Show', 'Εμφάνιση')));
      pw.type = F.show ? 'text' : 'password';
      steps.push(stepBox(n, name.value.trim().length >= 2 && pw.value.length >= 8, t('Name and password', 'Όνομα και κωδικός'),
        t('Use a first name and an initial. No surname, no photo, no email.', 'Χρησιμοποιήστε μικρό όνομα και αρχικό. Χωρίς επώνυμο, φωτογραφία ή email.'),
        el('div', { class: 'jn-row' },
          el('div', { class: 'jn-f' }, el('label', { for: 'jn-name' }, t('Display name', 'Όνομα εμφάνισης')), name, el('span', { class: 'hint' }, t('Your teacher must recognise you.', 'Ο εκπαιδευτικός σας πρέπει να σας αναγνωρίζει.'))),
          el('div', { class: 'jn-f' }, el('label', { for: 'jn-pw' }, t('Password', 'Κωδικός')), pwBox, el('span', { class: 'hint' }, t('At least 8 characters. Tell no one. There is no email reset.', 'Τουλάχιστον 8 χαρακτήρες. Μην το πείτε σε κανέναν. Δεν υπάρχει επαναφορά με email.'))))));
      // 4. ask
      n++;
      const go = el('button', { class: 'nm-btn nm-btn--primary big', type: 'submit', disabled: F.busy }, F.busy ? t('Sending', 'Αποστολή') : F.teacher ? t('Ask for a teacher account', 'Αίτημα λογαριασμού εκπαιδευτικού') : t('Ask to join', 'Αίτημα συμμετοχής'));
      steps.push(stepBox(n, false, t('Ask to join', 'Αίτημα συμμετοχής'), F.teacher ? t('An admin approves teacher accounts.', 'Τους λογαριασμούς εκπαιδευτικών τους εγκρίνει ο διαχειριστής.') : t('Your request goes to a teacher.', 'Το αίτημά σας πάει σε έναν εκπαιδευτικό.'),
        el('div', null,
          el('label', { class: 'jn-cb', for: 'jn-consent' }, consent, el('span', null, t('I understand that tools I build are checked by a teacher before anyone else can open them. My name is shown only inside this site, except when I choose to show my first name and the first letter of my surname on a tool’s public tile. I can untick that choice whenever I send a tool and change it later.', 'Καταλαβαίνω ότι τα εργαλεία που φτιάχνω ελέγχονται από έναν εκπαιδευτικό πριν τα ανοίξει κάποιος άλλος. Το όνομά μου εμφανίζεται μόνο μέσα σε αυτόν τον ιστότοπο, εκτός αν επιλέξω να φαίνεται το μικρό μου όνομα και το αρχικό του επωνύμου στη δημόσια κάρτα ενός εργαλείου. Μπορώ να ξε-τσεκάρω την επιλογή όταν στέλνω ένα εργαλείο και να την αλλάξω αργότερα.'))),
          F.err ? el('div', { class: 'err', role: 'alert' }, F.err) : null,
          el('div', { class: 'jn-go' }, go))));
      const form = el('form', { novalidate: true }, ...steps);
      form.addEventListener('submit', (ev) => { ev.preventDefault(); submit(); });
      createHost.replaceChildren(
        el('span', { class: 'jn-lbl' }, F.teacher ? t('Teacher account', 'Λογαριασμός εκπαιδευτικού') : t('New here', 'Νέοι εδώ')),
        el('h2', { id: 'jn-create-h' }, t('Create your account', 'Φτιάξτε τον λογαριασμό σας')),
        el('p', { class: 'jn-sub' }, F.teacher ? t('Three quick steps. An admin checks every teacher request.', 'Τρία γρήγορα βήματα. Ο διαχειριστής ελέγχει κάθε αίτημα εκπαιδευτικού.') : t('Four quick steps. A teacher checks every request before you can build.', 'Τέσσερα γρήγορα βήματα. Ένας εκπαιδευτικός ελέγχει κάθε αίτημα πριν μπορέσετε να φτιάξετε.')),
        form,
        el('div', { style: { marginTop: '14px' } }, el('button', { class: 'jn-link', type: 'button', onclick: () => { F.teacher = !F.teacher; F.err = ''; drawCreate(); } }, F.teacher ? t('I am a student', 'Είμαι μαθητής') : t('I am a teacher', 'Είμαι εκπαιδευτικός'))));
    }

    async function submit() {
      if (F.busy) return;
      F.err = '';
      const sc = schoolOf();
      const bad = (m) => { F.err = m; drawCreate(); };
      if (!sc) return bad(t('Pick your city first.', 'Διαλέξτε πρώτα πόλη.'));
      if (!F.teacher && F.team == null && !(F.addTeam && newTeam.value.trim().length >= 2)) return bad(t('Pick your team, or ask for a new one.', 'Διαλέξτε την ομάδα σας ή ζητήστε νέα.'));
      if (name.value.trim().length < 2) return bad(t('Type your display name.', 'Πληκτρολογήστε το όνομα εμφάνισης.'));
      if (pw.value.length < 8) return bad(t('The password needs at least 8 characters.', 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.'));
      if (!consent.checked) return bad(t('Tick the box to say you understand how the site works.', 'Επιλέξτε το πλαίσιο για να επιβεβαιώσετε ότι καταλαβαίνετε πώς λειτουργεί ο ιστότοπος.'));
      F.busy = true; drawCreate();
      const body = { school_id: sc.id, role: F.teacher ? 'teacher' : 'student', name: name.value.trim(), password: pw.value, consent: true };
      if (!F.teacher) { if (F.team != null) body.team_id = F.team; else body.new_team = newTeam.value.trim(); }
      try {
        await SC.api('/app/api/join', { method: 'POST', body });
        location.hash = '#/join';
        location.reload();
      } catch (e) {
        F.busy = false;
        F.err = errText(e, 'join');
        drawCreate();
        const box = createHost.querySelector('.err'); if (box) box.scrollIntoView({ block: 'nearest' });
      }
    }

    /* ----- sign in ----- */
    function drawSign() {
      const sel = el('select', { class: 'nm-input', id: 'jn-s-school', required: true },
        el('option', { value: '' }, t('Choose your school', 'Επιλέξτε το σχολείο σας')),
        ...schools.map((s) => el('option', { value: String(s.id) }, s.name)),
        el('option', { value: 'staff' }, t('Admin (not tied to a school)', 'Διαχειριστής (χωρίς σχολείο)')));
      let last = ''; try { last = SC.store.get(LAST) || ''; } catch (e) { /* no storage */ }
      if (Array.from(sel.options).some((o) => o.value === last)) sel.value = last;
      const nm = el('input', { class: 'nm-input', id: 'jn-s-name', type: 'text', autocomplete: 'username', maxlength: 60, required: true });
      const pwd = el('input', { class: 'nm-input', id: 'jn-s-pw', type: 'password', autocomplete: 'current-password', maxlength: 200, required: true });
      const errBox = el('div', { 'aria-live': 'assertive' });
      const go = el('button', { class: 'nm-btn nm-btn--primary big', type: 'submit' }, t('Sign in', 'Σύνδεση'));
      const form = el('form', { class: 'jn-form', novalidate: true },
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-s-school' }, t('City and school', 'Πόλη και σχολείο')), sel),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-s-name' }, t('Display name', 'Όνομα εμφάνισης')), nm),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-s-pw' }, t('Password', 'Κωδικός')), pwd),
        errBox, go);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        errBox.replaceChildren();
        const bad = (m) => errBox.replaceChildren(el('div', { class: 'err', role: 'alert' }, m));
        if (!sel.value) return bad(t('Choose your school first.', 'Επιλέξτε πρώτα το σχολείο σας.'));
        if (!nm.value.trim() || !pwd.value) return bad(t('Type your name and your password.', 'Πληκτρολογήστε το όνομα και τον κωδικό σας.'));
        go.disabled = true;
        try {
          await SC.api('/app/api/login', { method: 'POST', body: { name: nm.value.trim(), password: pwd.value, school_id: sel.value } });
          try { SC.store.set(LAST, sel.value); } catch (e) { /* no storage */ }
          location.hash = '#/join';
          location.reload();
        } catch (e) { go.disabled = false; bad(errText(e, 'login')); }
      });
      signHost.replaceChildren(
        el('span', { class: 'jn-lbl' }, t('Already have an account', 'Έχετε ήδη λογαριασμό')),
        el('h2', { id: 'jn-sign-h' }, t('Sign in', 'Σύνδεση')),
        el('p', { class: 'jn-sub' }, t('Same school, same name, same password. Teachers and admins sign in here too.', 'Ίδιο σχολείο, ίδιο όνομα, ίδιος κωδικός. Εδώ συνδέονται και οι εκπαιδευτικοί και οι διαχειριστές.')),
        form);
    }

    async function load() {
      loadFailed = null;
      try {
        const r = await SC.api('/app/api/schools/public');
        schools = (r.schools || []).filter((s) => s.id != null);
      } catch (e) { loadFailed = e; }
      drawCreate(); drawSign();
    }

    const lost = el('section', { class: 'nm-card nm-card--well jn-card', style: { padding: '18px 20px' } },
      el('div', { class: 'jn-lost' }, ic('lock', 22), el('div', null,
        el('b', { style: { color: '#fff' } }, t('Lost your password?', 'Χάσατε τον κωδικό σας;')),
        el('p', null, t('There is no email reset. Ask your teacher: they give you a temporary password, and you choose a new one the first time you sign in.', 'Δεν υπάρχει επαναφορά με email. Ρωτήστε τον εκπαιδευτικό σας: σας δίνει προσωρινό κωδικό και επιλέγετε νέο την πρώτη φορά που συνδέεστε.')))));

    /* ----- owner set-up: the first admin makes their own account with the setup code from the server settings ----- */
    function ownerCard() {
      const code = el('input', { class: 'nm-input', id: 'jn-o-code', type: 'password', autocomplete: 'off', maxlength: 200, required: true });
      const nm = el('input', { class: 'nm-input', id: 'jn-o-name', type: 'text', autocomplete: 'username', maxlength: 60, required: true });
      const p1 = el('input', { class: 'nm-input', id: 'jn-o-pw', type: 'password', autocomplete: 'new-password', maxlength: 100, required: true });
      const p2 = el('input', { class: 'nm-input', id: 'jn-o-pw2', type: 'password', autocomplete: 'new-password', maxlength: 100, required: true });
      const errBox = el('div', { 'aria-live': 'assertive' });
      const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'submit' }, t('Create the admin account', 'Δημιουργία λογαριασμού διαχειριστή'));
      const form = el('form', { class: 'jn-form', novalidate: true },
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-o-code' }, t('Setup code', 'Κωδικός εγκατάστασης')), code,
          el('span', { class: 'hint' }, t('The value of ADMIN_SETUP_CODE in the Railway Variables tab.', 'Η τιμή του ADMIN_SETUP_CODE στην καρτέλα Variables του Railway.'))),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-o-name' }, t('Admin name', 'Όνομα διαχειριστή')), nm),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-o-pw' }, t('New password', 'Νέος κωδικός')), p1,
          el('span', { class: 'hint' }, t('At least 8 characters. Pick one nobody else knows. Do not share it in a chat.', 'Τουλάχιστον 8 χαρακτήρες. Διαλέξτε έναν που δεν τον ξέρει κανείς άλλος. Μην τον μοιραστείτε σε συνομιλία.'))),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-o-pw2' }, t('Type the password again', 'Πληκτρολογήστε ξανά τον κωδικό')), p2),
        errBox, go);
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        errBox.replaceChildren();
        const bad = (m) => errBox.replaceChildren(el('div', { class: 'err', role: 'alert' }, m));
        if (!code.value.trim() || !nm.value.trim() || !p1.value) return bad(t('Fill in the setup code, a name and a password.', 'Συμπληρώστε τον κωδικό εγκατάστασης, ένα όνομα και έναν κωδικό.'));
        if (p1.value !== p2.value) return bad(t('The two passwords are not the same.', 'Οι δύο κωδικοί δεν είναι ίδιοι.'));
        go.disabled = true;
        try {
          await SC.api('/app/api/admin-join', { method: 'POST', body: { setup_code: code.value.trim(), name: nm.value.trim(), password: p1.value } });
          code.value = p1.value = p2.value = '';
          location.hash = '#/approvals';
          location.reload();
        } catch (e) {
          go.disabled = false;
          const c = e && e.body && e.body.code;
          bad(e.status === 403 && c === 'code' ? (SC.lang === 'el' ? 'Ο κωδικός εγκατάστασης δεν είναι σωστός, ή η δημιουργία διαχειριστή είναι απενεργοποιημένη στον διακομιστή.' : (e.message || 'That setup code is not right.'))
            : e.status === 409 ? t('An admin already uses that name. Sign in above and choose “Admin (not tied to a school)”.', 'Ένας διαχειριστής χρησιμοποιεί ήδη αυτό το όνομα. Συνδεθείτε παραπάνω και επιλέξτε «Διαχειριστής (χωρίς σχολείο)».')
              : errText(e, 'owner'));
        }
      });
      return el('section', { class: 'nm-card nm-card--well jn-card', style: { padding: '18px 20px' }, 'aria-label': t('Owner set-up', 'Εγκατάσταση ιδιοκτήτη') },
        el('details', { class: 'jn-own' },
          el('summary', null, t('Site owner: make the first admin account', 'Ιδιοκτήτης: δημιουργήστε τον πρώτο λογαριασμό διαχειριστή')),
          el('p', { class: 'jn-sub', style: { marginTop: '12px' } }, t('The admin approves accounts and tools for every school. Only someone who has the setup code can make one. When the admins exist, delete ADMIN_SETUP_CODE in Railway so nobody can make more.', 'Ο διαχειριστής εγκρίνει λογαριασμούς και εργαλεία για όλα τα σχολεία. Μόνο όποιος έχει τον κωδικό εγκατάστασης μπορεί να δημιουργήσει έναν. Όταν υπάρχουν οι διαχειριστές, διαγράψτε το ADMIN_SETUP_CODE στο Railway ώστε να μη δημιουργηθούν άλλοι.')),
          form));
    }

    const head = mkHead(false);
    root.append(head.querySelector('.how-btn'), el('div', { class: 'jn' }, head.querySelector('.page-head'), el('div', { class: 'jn-grid' }, createHost, el('div', { class: 'jn-side' }, signHost, lost, ownerCard()))));
    drawCreate(); drawSign();
    load();
    return () => {};
  }

  /* ================= signed in: my account ================= */
  function account(root) {
    const me = SC.account;
    const pending = me.status === 'pending';
    const staff = me.role === 'teacher' || me.role === 'admin';
    let timer = 0;
    const school = me.school ? me.school.name : '';
    const team = me.team ? me.team.name : '';

    const who = el('div', { class: 'jn-who' },
      el('span', { class: 'nm-badge nm-badge--violet' }, roleName(me.role)),
      school ? el('span', { class: 'nm-badge nm-badge--info' }, school) : null,
      team ? el('span', { class: 'nm-badge nm-badge--violet' }, t('Team ' + team, 'Ομάδα ' + team)) : null,
      pending ? el('span', { class: 'nm-badge nm-badge--warn' }, t('Waiting for approval', 'Περιμένει έγκριση')) : el('span', { class: 'nm-badge nm-badge--ok' }, t('Approved', 'Εγκρίθηκε')));

    const out = el('button', { class: 'nm-btn', type: 'button' }, t('Sign out', 'Αποσύνδεση'));
    out.addEventListener('click', () => signOut(out));

    /* ----- must choose a new password (after a teacher gave a temporary one) ----- */
    function mustChange() {
      const a = el('input', { class: 'nm-input', id: 'jn-m1', type: 'password', autocomplete: 'new-password', maxlength: 100 });
      const b = el('input', { class: 'nm-input', id: 'jn-m2', type: 'password', autocomplete: 'new-password', maxlength: 100 });
      const err = el('div', { 'aria-live': 'assertive' });
      const form = el('form', { class: 'jn-form', novalidate: true },
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-m1' }, t('New password', 'Νέος κωδικός')), a, el('span', { class: 'hint' }, t('At least 8 characters.', 'Τουλάχιστον 8 χαρακτήρες.'))),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-m2' }, t('Type it again', 'Πληκτρολογήστε τον ξανά')), b), err,
        el('div', null, el('button', { class: 'nm-btn nm-btn--primary big', type: 'submit' }, t('Save my password', 'Αποθήκευση κωδικού'))));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault(); err.replaceChildren();
        const bad = (m) => err.replaceChildren(el('div', { class: 'err', role: 'alert' }, m));
        if (a.value.length < 8) return bad(t('The password needs at least 8 characters.', 'Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες.'));
        if (a.value !== b.value) return bad(t('The two passwords are not the same.', 'Οι δύο κωδικοί δεν είναι ίδιοι.'));
        try { await SC.api('/app/api/me/password', { method: 'POST', body: { password: a.value } }); SC.toast(t('Password saved.', 'Ο κωδικός αποθηκεύτηκε.')); location.reload(); } catch (e) { bad(errText(e)); }
      });
      return el('section', { class: 'nm-card jn-card jn-must', 'aria-labelledby': 'jn-must-h' },
        el('span', { class: 'jn-lbl' }, t('One more step', 'Ένα ακόμη βήμα')),
        el('h2', { id: 'jn-must-h' }, t('Choose a new password', 'Διαλέξτε νέο κωδικό')),
        el('p', { class: 'jn-sub' }, t('You signed in with a temporary password. Choose your own now, so only you know it.', 'Συνδεθήκατε με προσωρινό κωδικό. Διαλέξτε τώρα τον δικό σας, ώστε να τον ξέρετε μόνο εσείς.')), form);
    }

    /* ----- waiting ----- */
    function waiting() {
      return el('section', { class: 'nm-card jn-card', 'aria-labelledby': 'jn-wait-h' },
        el('span', { class: 'jn-lbl' }, t('Your request', 'Το αίτημά σας')),
        el('div', { class: 'jn-wait' },
          el('div', null,
            el('h2', { id: 'jn-wait-h' }, t('You are on the list, ' + me.name + '.', 'Είστε στη λίστα, ' + me.name + '.')), who,
            el('p', { class: 'jn-sub', style: { marginBottom: '14px' } }, staff
              ? t('An admin will check your request. This page updates by itself.', 'Ο διαχειριστής θα ελέγξει το αίτημά σας. Η σελίδα ενημερώνεται μόνη της.')
              : t('A teacher will check your request. You can look around the whole site while you wait. The Build studio opens for you as soon as you are approved, and this page updates by itself.', 'Ένας εκπαιδευτικός θα ελέγξει το αίτημά σας. Μπορείτε να δείτε ολόκληρο τον ιστότοπο όσο περιμένετε. Το Στούντιο ανοίγει για εσάς μόλις εγκριθείτε και η σελίδα ενημερώνεται μόνη της.')),
            me.team_request ? el('p', { class: 'jn-sub' }, t('You asked for the team “' + me.team_request + '”. It is created when you are approved.', 'Ζητήσατε την ομάδα «' + me.team_request + '». Δημιουργείται όταν εγκριθείτε.')) : null,
            el('div', { class: 'jn-acts' }, el('a', { class: 'nm-btn nm-btn--ghost', href: '#/' }, t('Look around the site', 'Δείτε τον ιστότοπο')), out)),
          el('ol', { class: 'jn-tl' },
            el('li', null, el('b', null, '✓'), el('div', null, el('strong', null, t('Request sent', 'Το αίτημα στάλθηκε')), el('small', null, t('Your name, school and team are with a teacher.', 'Το όνομα, το σχολείο και η ομάδα σας είναι στον εκπαιδευτικό.')))),
            el('li', { class: 'now' }, el('b', null, '2'), el('div', null, el('strong', null, staff ? t('An admin checks it', 'Το ελέγχει ο διαχειριστής') : t('A teacher checks it', 'Το ελέγχει ένας εκπαιδευτικός')), el('small', null, t('Usually the same school day.', 'Συνήθως την ίδια σχολική μέρα.')))),
            el('li', { class: 'next' }, el('b', null, '3'), el('div', null, el('strong', null, staff ? t('The teacher tools open', 'Ανοίγουν τα εργαλεία εκπαιδευτικού') : t('The Build studio opens', 'Ανοίγει το Στούντιο')), el('small', null, staff ? t('Approve students and tools.', 'Εγκρίνετε μαθητές και εργαλεία.') : t('Describe a tool, preview it, send it to a teacher.', 'Περιγράψτε ένα εργαλείο, δείτε το και στείλτε το σε εκπαιδευτικό.')))))));
    }

    /* ----- approved ----- */
    function approved() {
      const link = (href, icon, h, s) => el('a', { href }, ic(icon, 22), el('div', null, el('b', null, h), el('small', null, s)));
      return el('section', { class: 'nm-card jn-card', 'aria-labelledby': 'jn-in-h' },
        el('span', { class: 'jn-lbl' }, t('Signed in', 'Συνδεδεμένοι')),
        el('h2', { id: 'jn-in-h' }, t('Hello, ' + me.name + '.', 'Γεια σας, ' + me.name + '.')), who,
        el('p', { class: 'jn-sub' }, staff ? t('You can approve accounts and tools, and see everything a visitor sees.', 'Μπορείτε να εγκρίνετε λογαριασμούς και εργαλεία και να δείτε ό,τι βλέπει ένας επισκέπτης.')
          : t('You are approved. Build tools in the Build studio and send them to a teacher. Teachers check every tool before it goes public.', 'Έχετε εγκριθεί. Φτιάξτε εργαλεία στο Στούντιο και στείλτε τα σε έναν εκπαιδευτικό. Οι εκπαιδευτικοί ελέγχουν κάθε εργαλείο πριν γίνει δημόσιο.')),
        el('div', { class: 'jn-can' },
          staff ? link('#/approvals', 'check', t('Approvals', 'Εγκρίσεις'), t('Accounts, tools and plans waiting for you.', 'Λογαριασμοί, εργαλεία και σχέδια που σας περιμένουν.')) : null,
          link('#/studio', 'pencil', t('Build studio', 'Στούντιο'), t('Describe a tool, preview it, send it to a teacher.', 'Περιγράψτε ένα εργαλείο, δείτε το και στείλτε το σε εκπαιδευτικό.')),
          link('#/start', 'layers', t('Start a project', 'Νέο έργο'), t('Question, sensors, data, team.', 'Ερώτηση, αισθητήρες, δεδομένα, ομάδα.')),
          link('#/submitted', 'inbox', t('Submitted work', 'Υποβολές'), t('What teachers decided.', 'Τι αποφάσισαν οι εκπαιδευτικοί.'))),
        el('div', { class: 'jn-acts', style: { marginTop: '18px' } }, out));
    }

    /* ----- change password ----- */
    function changePw() {
      const o = el('input', { class: 'nm-input', id: 'jn-c0', type: 'password', autocomplete: 'current-password', maxlength: 100 });
      const a = el('input', { class: 'nm-input', id: 'jn-c1', type: 'password', autocomplete: 'new-password', maxlength: 100 });
      const err = el('div', { 'aria-live': 'assertive' });
      const form = el('form', { class: 'jn-form', novalidate: true },
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-c0' }, t('Current password', 'Τρέχων κωδικός')), o),
        el('div', { class: 'jn-f' }, el('label', { for: 'jn-c1' }, t('New password', 'Νέος κωδικός')), a, el('span', { class: 'hint' }, t('At least 8 characters.', 'Τουλάχιστον 8 χαρακτήρες.'))), err,
        el('div', null, el('button', { class: 'nm-btn', type: 'submit' }, t('Change password', 'Αλλαγή κωδικού'))));
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault(); err.replaceChildren();
        const bad = (m) => err.replaceChildren(el('div', { class: 'err', role: 'alert' }, m));
        if (!o.value) return bad(t('Type your current password.', 'Πληκτρολογήστε τον τρέχοντα κωδικό σας.'));
        if (a.value.length < 8) return bad(t('The new password needs at least 8 characters.', 'Ο νέος κωδικός θέλει τουλάχιστον 8 χαρακτήρες.'));
        try { await SC.api('/app/api/me/password', { method: 'POST', body: { old: o.value, password: a.value } }); o.value = a.value = ''; SC.toast(t('Password changed.', 'Ο κωδικός άλλαξε.')); } catch (e) { bad(e.status === 403 ? t('The current password is not right.', 'Ο τρέχων κωδικός δεν είναι σωστός.') : errText(e)); }
      });
      return el('details', null, el('summary', null, t('Change my password', 'Αλλαγή του κωδικού μου')), form);
    }

    const head = mkHead(true);
    const body = el('div', { class: 'jn' }, head.querySelector('.page-head'));
    if (me.must_change) body.append(mustChange());
    body.append(pending ? waiting() : approved());
    if (!pending) { const last = body.lastElementChild; last.append(changePw()); }
    root.append(head.querySelector('.how-btn'), body);

    // While the request waits, ask now and then. When a teacher approves it the page opens the studio links by itself.
    if (pending) {
      const check = async () => {
        if (document.hidden) return;
        try {
          const r = await SC.api('/app/api/me');
          const u = r && r.user;
          if (u && u.status === 'active') { SC.toast(t('You are approved. Welcome!', 'Εγκριθήκατε. Καλώς ήρθατε!')); location.reload(); }
        } catch (e) { if (e.status === 401) location.reload(); }
      };
      timer = setInterval(check, 15000);
    }
    return () => { clearInterval(timer); };
  }

  SC.register('join', {
    title: ['Join or sign in', 'Εγγραφή ή σύνδεση'],
    render(root) {
      SC.css('/site/pages/join.css');
      return SC.account ? account(root) : visitor(root);
    },
  });
})();
