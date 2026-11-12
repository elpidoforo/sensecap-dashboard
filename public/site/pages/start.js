/* Start a project: a four-step wizard (question, sensors, data, team) and a review screen. It creates a plan.
   An approved student or a signed-in teacher can create one; a visitor or a pending account is sent to the Join page in step 4
   (the same panel as the Build studio). The draft is kept in this browser (localStorage) until the plan is created.
   API: GET /api/devices (names only), GET /api/config (names, demo), GET /studio/api/status,
        POST /studio/api/plans {title, question, sensors:[eui], data:[mid|source], team, notes}. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const KEY = 'sc.start.draft.v1', TEAM_KEY = 'sc.studio.team';
  const MAX_Q = 200, MAX_NOTE = 300, MAX_SENSORS = 6, MIN_Q = 10;

  /* ---------- icons (static strings only) ---------- */
  const ICON = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>',
    dot: '<circle cx="12" cy="12" r="3"/>',
    sensor: '<circle cx="12" cy="12" r="2.2"/><path d="M7.8 7.8a6 6 0 000 8.4M16.2 7.8a6 6 0 010 8.4M4.9 4.9a10 10 0 000 14.2M19.1 4.9a10 10 0 010 14.2"/>',
    db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    pencil: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- words ---------- */
  const GPS = new Set(['4197', '4198']);
  const MID_EL = { 4097: 'Θερμοκρασία αέρα', 4098: 'Υγρασία αέρα', 4099: 'Φωτεινότητα', 4100: 'CO₂', 4101: 'Βαρομετρική πίεση' };
  const SRC = {
    metoffice: { name: ['Met Office station', 'Σταθμός Μετεωρολογικής Υπηρεσίας'], what: ['Official readings from the nearest Cyprus Department of Meteorology station. Good for checking our sensor against an official one.', 'Επίσημες μετρήσεις από τον πλησιέστερο σταθμό του Τμήματος Μετεωρολογίας Κύπρου. Κατάλληλο για να ελέγξετε τον αισθητήρα μας με έναν επίσημο.'] },
    air: { name: ['Outdoor air quality', 'Ποιότητα αέρα έξω'], what: ['Dust and air readings from open sensors around the island, for comparing with the air in your classroom.', 'Μετρήσεις σκόνης και αέρα από ανοιχτούς αισθητήρες στο νησί, για σύγκριση με τον αέρα στην τάξη σας.'] },
  };
  const EXAMPLES = [
    ['Is the CO2 in our classroom higher at lunchtime than in the morning?', 'Είναι το CO2 στην τάξη μας υψηλότερο το μεσημέρι από ό,τι το πρωί;'],
    ['Is the bus hotter than the classroom on a sunny day?', 'Είναι το λεωφορείο πιο ζεστό από την τάξη μια ηλιόλουστη μέρα;'],
    ['How different is our school’s temperature from the nearest Met Office station?', 'Πόσο διαφέρει η θερμοκρασία του σχολείου μας από τον πλησιέστερο σταθμό της Μετεωρολογικής Υπηρεσίας;'],
    ['Does the air get worse (PM2.5) near the road at rush hour?', 'Χειροτερεύει ο αέρας (PM2.5) κοντά στον δρόμο την ώρα αιχμής;'],
  ];
  const errMsg = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  const sameStr = (a, b) => String(a || '').normalize('NFC').toLowerCase() === String(b || '').normalize('NFC').toLowerCase();

  /* ---------- is it a measurable question? (a hint for the team, the teacher decides) ---------- */
  const plain = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ');
  const rx = (src) => new RegExp(plain(src));   // the patterns are written naturally and normalised like the text
  const RE_Q_START = rx('^(is|are|was|were|does|do|did|how|what|which|when|where|why|can|will|would|should|είναι|ήταν|πόσο|πόσα|ποια|ποιο|ποιος|ποιοι|τι|πώς|γιατί|όταν|πού|μήπως|έχει|έχουν|αλλάζει|χειροτερεύει|βελτιώνεται|ανεβαίνει|πέφτει)(?![a-z\\u0370-\\u03ff])');
  const RE_MEASURE = rx('(temperat|degree|hot|warm|cold|cool|heat|humid|moist|dry|co2|carbon|air quality|\\bair\\b|pm\\s?2|pm\\s?10|dust|particle|pollut|smog|light|bright|dark|lux|pressure|wind|breez|rain|sea|wave|noise|loud|sound|battery|reading|sensor|ppm|θερμοκρασ|βαθμ|ζεστ|κρύο|ψυχρ|δροσ|υγρασ|ξηρ|co₂|διοξείδι|άνθρακ|ποιότητα αέρα|αέρα|αέρας|σωματίδ|σκόν|ρύπ|φως|φωτ|σκοτ|πίεσ|άνεμ|βροχ|θάλασσ|κυμ|θόρυβ|ήχο|μπαταρ|μετρήσ|αισθητήρ)');
  const RE_WHERE_WHEN = rx('(than|compare|between|versus|\\bvs\\b|higher|lower|more|less|hotter|colder|warmer|cooler|before|after|during|morning|afternoon|lunch|night|evening|break|rush|week|weekend|day|hour|school|class|bus|car|road|yard|inside|outside|near|station|same|differ|change|από|περισσότερ|λιγότερ|υψηλότερ|χαμηλότερ|πιο |μεταξύ|σε σχέση|διαφέρ|αλλάζ|πριν|μετά|όταν|κατά τη|πρωί|μεσημέρι|απόγευμα|βράδυ|διάλειμμα|ώρα|μέρα|εβδομάδ|σχολείο|τάξη|λεωφορεί|αυτοκίνητ|δρόμ|αυλή|μέσα|έξω|κοντά|σταθμ)');
  const RE_PERSONAL = /(@|\b\d{8,}\b|\bmy name\b|\bwww\.|https?:)/i;
  function checkQuestion(text) {
    const raw = String(text || '').trim(), p = plain(raw);
    const isQ = raw.length >= 6 && (/[?;;]\s*$/.test(raw) || RE_Q_START.test(p));
    const measurable = RE_MEASURE.test(p);
    const where = RE_WHERE_WHEN.test(p);
    const clean = !RE_PERSONAL.test(raw);
    return { isQ, measurable, where, clean, ok: isQ && measurable && clean };
  }
  // suggestions for the data step, from the words of the question
  function suggestFrom(text) {
    const p = plain(text), out = new Set();
    if (rx('(temperat|hot|warm|cold|cool|heat|θερμοκρασ|ζεστ|κρύο|ψυχρ|δροσ)').test(p)) out.add('4097');
    if (rx('(humid|moist|dry|υγρασ|ξηρ)').test(p)) out.add('4098');
    if (rx('(light|bright|dark|lux|φως|φωτ|σκοτ)').test(p)) out.add('4099');
    if (rx('(co2|co₂|carbon|διοξείδι|άνθρακ)').test(p)) out.add('4100');
    if (rx('(pressure|πίεσ)').test(p)) out.add('4101');
    if (rx('(met office|station|official|forecast|rain|wind|σταθμ|επίσημ|μετεωρολογ|πρόγνωσ|βροχ|άνεμ)').test(p)) out.add('metoffice');
    if (rx('(air quality|pm\\s?2|pm\\s?10|dust|particle|pollut|smog|ποιότητα αέρα|σωματίδ|σκόν|ρύπ|αέρα)').test(p)) out.add('air');
    return out;
  }

  const autoTitle = (q) => String(q || '').trim().replace(/[?;\u037e]+$/, '').slice(0, 80);

  /* ---------- the draft kept in this browser ---------- */
  function readDraft() {
    try {
      const j = JSON.parse(SC.store.get(KEY) || 'null');
      if (!j || j.v !== 1) return null;
      const arr = (x, n) => (Array.isArray(x) ? x.filter((y) => typeof y === 'string' && y.length < 80).slice(0, n) : []);
      return { step: Math.max(1, Math.min(5, Number(j.step) || 1)), q: String(j.q || '').slice(0, MAX_Q), sensors: arr(j.sensors, MAX_SENSORS), data: arr(j.data, 20), team: String(j.team || '').slice(0, 30), title: String(j.title || '').slice(0, 80), note: String(j.note || '').slice(0, MAX_NOTE), at: Number(j.at) || 0 };
    } catch (e) { return null; }
  }
  const draftHasContent = (d) => Boolean(d && (d.q || d.sensors.length || d.data.length || d.note || d.title));

  /* ================= the page ================= */
  function start(root) {
    const S = {
      step: 1, maxStep: 1, q: '', sensors: [], data: [], team: '', title: '', titleTouched: false, note: '',
      status: null, devices: null, devErr: null, names: {}, demo: false, group: 'all', loaded: false,
      created: null, creating: false, err: '', joinErr: '', joinBusy: false, restoredAt: 0, schools: null, schoolsAsked: false, schoolSlug: '',
    };
    let alive = true;
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const headHost = el('div'), restoreHost = el('div'), stepHost = el('div'), mainHost = el('div', { class: 'st-wrap' });
    const panel = el('section', { class: 'nm-card nm-card--glow st-panel' }), aside = el('aside', { class: 'st-aside', 'aria-label': t('Your plan so far', 'Το σχέδιό σας μέχρι τώρα') });
    mainHost.append(panel, aside);
    root.append(headHost, restoreHost, stepHost, mainHost, live);

    // fields that keep their text while the panel is redrawn
    const qIn = el('textarea', { class: 'nm-input st-ta', id: 'st-q', maxlength: MAX_Q, rows: 3, 'aria-describedby': 'st-qcheck st-qcount' });
    const qCount = el('span', { class: 'st-cc', id: 'st-qcount' });
    const qCheck = el('div', { class: 'st-check', id: 'st-qcheck', 'aria-live': 'polite' });
    const titleIn = el('input', { class: 'nm-input', id: 'st-title', type: 'text', maxlength: 80, autocomplete: 'off' });
    const noteIn = el('textarea', { class: 'nm-input st-note', id: 'st-note', maxlength: MAX_NOTE, rows: 3 });
    const noteCount = el('span', { class: 'st-cc' });
    const teamIn = el('input', { class: 'nm-input', id: 'st-team', type: 'text', maxlength: 30, autocomplete: 'off' });

    const V = () => (S.status && S.status.viewer) || { kind: 'visitor' };
    const isClass = () => V().kind === 'class';
    const isUser = () => V().kind === 'user';
    const canCreate = () => isClass() || isUser();
    // A signed-in admin has no school of their own: they pick the school the plan is for.
    const needsSchool = () => isUser() && !V().school;
    const pickedSchool = () => ((S.schools || []).find((x) => x.slug === S.schoolSlug) || null);
    const schoolName = () => (V().school ? V().school.short || V().school.name : needsSchool() && pickedSchool() ? pickedSchool().short : '');
    const teamName = () => (isClass() ? V().team : S.team.trim());
    const asTeam = () => t('Team ' + V().team + (schoolName() ? ', ' + schoolName() : ''), 'Ομάδα ' + V().team + (schoolName() ? ', ' + schoolName() : ''));

    /* ----- names ----- */
    const dev = (eui) => (S.devices || []).find((d) => d.eui === eui);
    const sensorName = (eui) => (dev(eui) ? dev(eui).name : t('A sensor', 'Ένας αισθητήρας'));
    function dataName(id) {
      if (SRC[id]) return t(SRC[id].name[0], SRC[id].name[1]);
      const n = S.names[id];
      if (n) return SC.lang === 'el' && MID_EL[id] ? MID_EL[id] : n[0];
      return t('Reading ' + id, 'Μέτρηση ' + id);
    }
    const unitOf = (id) => (S.names[id] && S.names[id][1]) || '';
    const midsOf = (d) => (d.measurements || []).map(String).filter((m) => !GPS.has(m));

    /* ----- saving the draft ----- */
    function persist() {
      if (S.created) return;
      const d = { v: 1, step: S.step, q: S.q, sensors: S.sensors, data: S.data, team: isClass() ? '' : S.team, title: S.title, note: S.note, at: Date.now() };
      if (!draftHasContent(d)) { SC.store.set(KEY, ''); return; }
      SC.store.set(KEY, JSON.stringify(d));
    }

    /* ----- steps: what is filled ----- */
    const qOk = () => S.q.trim().length >= MIN_Q;
    const sensorsOk = () => S.sensors.length >= 1;
    const dataOk = () => S.data.length >= 1;
    const teamOk = () => canCreate() && teamName().length > 0 && S.title.trim().length > 0 && (!needsSchool() || Boolean(S.schoolSlug));
    const okOf = (n) => (n === 1 ? qOk() : n === 2 ? sensorsOk() : n === 3 ? dataOk() : n === 4 ? teamOk() : false);
    function go(n, focus) {
      S.step = Math.max(1, Math.min(5, n)); S.maxStep = Math.max(S.maxStep, S.step);
      S.err = '';
      persist(); drawAll();
      if (focus !== false) { const h = panel.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: false }); } }
    }

    /* ----- loading ----- */
    async function loadStatus() { try { S.status = await SC.api('/studio/api/status'); } catch (e) { S.status = null; } }
    async function loadSide() {
      const [dv, cf] = await Promise.allSettled([SC.api('/api/devices'), SC.cached('/api/config', 300000)]);
      if (dv.status === 'fulfilled' && Array.isArray(dv.value)) {
        // only what the page needs: name, group, online, last reading, which measurements. No position is read.
        S.devices = dv.value.map((d) => ({ eui: d.eui, name: d.name, group: d.group || '', online: !!d.online, lastSeen: d.lastSeen ? Date.parse(d.lastSeen) : 0, measurements: d.measurements || [] })); S.devErr = null;
      } else S.devErr = dv.status === 'rejected' ? dv.reason : new Error('No list');
      if (cf.status === 'fulfilled' && cf.value) { S.names = cf.value.names || {}; S.demo = !!cf.value.demo; }
    }
    async function loadAll() {
      await Promise.all([loadStatus(), loadSide()]);
      if (S.devices) S.sensors = S.sensors.filter((e) => S.devices.some((d) => d.eui === e));
      if (isClass()) { S.team = V().team; if (S.group === 'all' && schoolName() && S.devices && S.devices.some((d) => sameStr(d.group, schoolName()))) S.group = schoolName(); }
      else if (isUser() && !S.team && V().team) S.team = V().team;
      S.loaded = true;
    }

    /* ----- head, restore note, stepper ----- */
    function drawHead() {
      headHost.replaceChildren(SC.head({
        title: t('Start a project.', 'Ξεκινήστε ένα έργο.'),
        lede: t('Four short steps turn a question into a plan: the question, the sensors, the data and your team. Then it appears in Running projects.', 'Τέσσερα σύντομα βήματα μετατρέπουν ένα ερώτημα σε σχέδιο: το ερώτημα, οι αισθητήρες, τα δεδομένα και η ομάδα σας. Μετά εμφανίζεται στα Ενεργά έργα.'),
        tags: S.demo ? [{ text: t('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        help: [
          'Step 1: write one question that numbers can answer. Step 2: pick the sensors that will give the numbers. Step 3: pick which readings to use, and add official Met Office data or outdoor air if you want to compare. Step 4: give your team name and a short note. Then check everything and create the plan. Your work is kept in this browser until you create it. A plan starts as a draft that only your team and teachers can see; you send it to a teacher from Running projects.',
          'Βήμα 1: γράψτε ένα ερώτημα που μπορούν να απαντήσουν οι αριθμοί. Βήμα 2: διαλέξτε τους αισθητήρες που θα δώσουν τους αριθμούς. Βήμα 3: διαλέξτε ποιες μετρήσεις θα χρησιμοποιήσετε και προσθέστε επίσημα δεδομένα της Μετεωρολογικής Υπηρεσίας ή τον αέρα έξω αν θέλετε να συγκρίνετε. Βήμα 4: γράψτε το όνομα της ομάδας σας και ένα σύντομο σημείωμα. Μετά ελέγξτε τα πάντα και δημιουργήστε το σχέδιο. Η δουλειά σας μένει σε αυτό το πρόγραμμα περιήγησης μέχρι να το δημιουργήσετε. Ένα σχέδιο ξεκινά ως προσχέδιο που το βλέπουν μόνο η ομάδα σας και οι εκπαιδευτικοί· το στέλνετε σε εκπαιδευτικό από τα Ενεργά έργα.',
        ],
      }));
    }
    function drawRestore() {
      if (!S.restoredAt || S.created) { restoreHost.replaceChildren(); return; }
      restoreHost.replaceChildren(el('div', { class: 'nm-callout nm-callout--info st-restore' }, ic('refresh'),
        el('span', null, el('b', null, t('Your draft is back. ', 'Το προσχέδιό σας επέστρεψε. ')), t('It was kept in this browser (last changed ' + SC.ago(S.restoredAt) + ').', 'Είχε κρατηθεί σε αυτό το πρόγραμμα περιήγησης (τελευταία αλλαγή ' + SC.ago(S.restoredAt) + ').')),
        el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: confirmReset }, t('Start over', 'Ξεκινήστε από την αρχή'))));
    }
    function confirmReset() {
      SC.modal({
        title: t('Start over?', 'Να ξεκινήσετε από την αρχή;'),
        body: el('p', null, t('Your question, sensors, data and note will be cleared from this browser. This cannot be undone.', 'Το ερώτημα, οι αισθητήρες, τα δεδομένα και το σημείωμά σας θα διαγραφούν από αυτό το πρόγραμμα περιήγησης. Δεν αναιρείται.')),
        actions: [{ label: t('Keep my draft', 'Κρατήστε το προσχέδιο') }, { label: t('Clear it', 'Διαγραφή'), primary: true, run: reset }],
      });
    }
    function reset() {
      S.step = 1; S.maxStep = 1; S.q = ''; S.sensors = []; S.data = []; S.title = ''; S.titleTouched = false; S.note = ''; if (!isClass()) S.team = ''; S.restoredAt = 0; S.created = null; S.err = '';
      qIn.value = ''; titleIn.value = ''; noteIn.value = ''; teamIn.value = isUser() ? S.team : '';
      SC.store.set(KEY, '');
      drawAll();
    }
    const STEPS = () => [[t('Question', 'Ερώτημα'), 1], [t('Sensors', 'Αισθητήρες'), 2], [t('Data', 'Δεδομένα'), 3], [t('Team', 'Ομάδα'), 4], [t('Review', 'Έλεγχος'), 5]];
    function drawSteps() {
      if (S.created) { stepHost.replaceChildren(); return; }
      stepHost.replaceChildren(el('ol', { class: 'st-steps', 'aria-label': t('Steps', 'Βήματα') }, STEPS().map(([label, n]) => {
        const done = n < 5 ? okOf(n) && n < S.step : false;
        return el('li', { class: (S.step === n ? 'on ' : '') + (done ? 'done' : '') },
          el('button', { type: 'button', disabled: n > S.maxStep, 'aria-current': S.step === n ? 'step' : null, onclick: () => go(n) },
            el('span', { class: 'num' }, done ? ic('check') : String(n)), el('span', { class: 'lb' }, label)));
      })));
    }

    /* ----- shared bits of the panel ----- */
    function navRow(opts) {
      const row = el('div', { class: 'st-nav' });
      if (S.step > 1) row.append(el('button', { class: 'nm-btn', type: 'button', onclick: () => go(S.step - 1) }, ic('back'), t('Back', 'Πίσω')));
      row.append(el('span', { class: 'st-sp' }));
      if (opts.hint) row.append(el('span', { class: 'st-navhint' }, opts.hint));
      row.append(el('button', { class: 'nm-btn nm-btn--primary', id: 'st-next', type: 'button', disabled: !!opts.disabled, onclick: opts.run }, opts.label, ic(opts.icon || 'arrow')));
      return row;
    }
    const head2 = (eb, h, p) => [el('div', { class: 'st-eb cu' }, eb), el('h2', null, h), el('p', { class: 'st-lede' }, p)];

    /* ----- step 1: the question ----- */
    function drawQCheck() {
      const c = checkQuestion(S.q);
      qCount.textContent = t(S.q.length + ' of ' + MAX_Q, S.q.length + ' από ' + MAX_Q);
      if (!S.q.trim()) {
        qCheck.replaceChildren(el('div', { class: 'st-check-h' }, el('b', null, t('Is it a measurable question?', 'Είναι μετρήσιμο ερώτημα;')), el('span', { class: 'nm-badge' }, t('Waiting for your question', 'Περιμένει το ερώτημά σας'))),
          el('p', { class: 'st-hint' }, t('A good question can be answered with numbers from a sensor. We check it as you type.', 'Ένα καλό ερώτημα απαντιέται με αριθμούς από έναν αισθητήρα. Το ελέγχουμε καθώς γράφετε.')));
        return;
      }
      const rows = [
        [c.isQ, t('It is a question', 'Είναι ερώτηση'), t('Write it as a question, for example starting with Is, Does or How much.', 'Γράψτε το ως ερώτηση, π.χ. με «Είναι», «Αλλάζει» ή «Πόσο».')],
        [c.measurable, t('It names something a sensor can measure', 'Αναφέρει κάτι που μπορεί να μετρήσει ένας αισθητήρας'), t('Name what you measure: temperature, humidity, CO2, light, pressure, air quality, wind or rain.', 'Πείτε τι μετράτε: θερμοκρασία, υγρασία, CO2, φως, πίεση, ποιότητα αέρα, άνεμο ή βροχή.')],
        [c.where, t('It compares or says when or where', 'Συγκρίνει ή λέει πότε ή πού'), t('Add a comparison, a time or a place: morning or afternoon, classroom or bus.', 'Προσθέστε σύγκριση, χρόνο ή τόπο: πρωί ή απόγευμα, τάξη ή λεωφορείο.'), true],
        [c.clean, t('It has no personal details', 'Δεν έχει προσωπικά στοιχεία'), t('Take out names, emails and phone numbers.', 'Αφαιρέστε ονόματα, email και τηλέφωνα.')],
      ];
      qCheck.replaceChildren(
        el('div', { class: 'st-check-h' }, el('b', null, t('Is it a measurable question?', 'Είναι μετρήσιμο ερώτημα;')),
          el('span', { class: 'nm-badge ' + (c.ok ? 'nm-badge--ok' : 'nm-badge--warn') }, c.ok ? t('Yes, we can measure it', 'Ναι, μπορούμε να το μετρήσουμε') : t('Not measurable yet', 'Δεν είναι μετρήσιμο ακόμη'))),
        el('ul', { class: 'st-checks' }, rows.map(([ok, label, tip, soft]) => el('li', { class: ok ? 'ok' : soft ? 'soft' : 'no' }, ic(ok ? 'checkc' : soft ? 'dot' : 'warn'), el('span', null, el('b', null, label), ok ? null : el('small', null, tip))))));
    }
    function panel1() {
      const tries = el('div', { class: 'st-tries' }, el('b', null, t('Try one', 'Δοκιμάστε ένα')), ...EXAMPLES.map(([en, gr]) => el('button', { class: 'st-try', type: 'button', onclick: () => { qIn.value = t(en, gr).slice(0, MAX_Q); S.q = qIn.value; persist(); drawQCheck(); drawAside(); drawSteps(); syncNext(); qIn.focus(); } }, t(en, gr))));
      qIn.setAttribute('aria-label', t('Your question', 'Το ερώτημά σας'));
      qIn.placeholder = t('For example: Is the CO2 in our classroom higher at lunchtime than in the morning?', 'Για παράδειγμα: Είναι το CO2 στην τάξη μας υψηλότερο το μεσημέρι από ό,τι το πρωί;');
      drawQCheck();
      panel.replaceChildren(...head2(t('Step 1 of 4', 'Βήμα 1 από 4'), t('What do you want to find out?', 'Τι θέλετε να ανακαλύψετε;'), t('Write one question that numbers from a sensor can answer. Short and clear works best.', 'Γράψτε ένα ερώτημα που μπορούν να απαντήσουν οι μετρήσεις ενός αισθητήρα. Το σύντομο και σαφές δουλεύει καλύτερα.')),
        el('label', { class: 'st-lab', for: 'st-q' }, t('Your question', 'Το ερώτημά σας')), qIn,
        el('div', { class: 'st-below' }, el('span', null, t('Write it like you would ask a classmate. No names or personal details.', 'Γράψτε το όπως θα ρωτούσατε έναν συμμαθητή. Χωρίς ονόματα ή προσωπικά στοιχεία.')), qCount),
        tries, qCheck,
        navRow({ label: t('Next: sensors', 'Επόμενο: αισθητήρες'), disabled: !qOk(), hint: !qOk() ? t('Write at least ' + MIN_Q + ' characters.', 'Γράψτε τουλάχιστον ' + MIN_Q + ' χαρακτήρες.') : '', run: nextFrom1 }));
    }
    function nextFrom1() {
      if (!qOk()) return;
      if (checkQuestion(S.q).ok) { go(2); return; }
      SC.modal({
        title: t('This question may be hard to measure', 'Αυτό το ερώτημα ίσως είναι δύσκολο να μετρηθεί'),
        body: el('div', null, el('p', null, t('We could not find something a sensor can measure, or it does not look like a question. A teacher will read it, and may send it back.', 'Δεν βρήκαμε κάτι που μπορεί να μετρήσει ένας αισθητήρας ή δεν μοιάζει με ερώτηση. Ένας εκπαιδευτικός θα το διαβάσει και ίσως το στείλει πίσω.')), el('p', { class: 'muted' }, t('Tip: name what you measure and compare two things.', 'Συμβουλή: πείτε τι μετράτε και συγκρίνετε δύο πράγματα.'))),
        actions: [{ label: t('Change the question', 'Αλλάξτε το ερώτημα'), run: () => qIn.focus() }, { label: t('Continue anyway', 'Συνέχεια παρ’ όλα αυτά'), primary: true, run: () => go(2) }],
      });
    }

    /* ----- step 2: the sensors ----- */
    function toggleSensor(eui) {
      const i = S.sensors.indexOf(eui);
      if (i >= 0) S.sensors.splice(i, 1);
      else if (S.sensors.length >= MAX_SENSORS) { SC.toast(t('You can pick up to ' + MAX_SENSORS + ' sensors.', 'Μπορείτε να διαλέξετε έως ' + MAX_SENSORS + ' αισθητήρες.')); return false; }
      else S.sensors.push(eui);
      // data picked from a sensor that is no longer chosen is dropped, so the plan never names a reading nobody collects
      const avail = new Set(S.sensors.flatMap((e) => (dev(e) ? midsOf(dev(e)) : [])));
      S.data = S.data.filter((d) => SRC[d] || avail.has(d));
      persist(); return true;
    }
    function agoText(ms) { return ms ? t('last reading ' + SC.ago(ms), 'τελευταία μέτρηση ' + SC.ago(ms)) : t('no reading yet', 'καμία μέτρηση ακόμη'); }
    function panel2() {
      const kids = [...head2(t('Step 2 of 4', 'Βήμα 2 από 4'), t('Which sensors will you use?', 'Ποιους αισθητήρες θα χρησιμοποιήσετε;'), t('Pick up to ' + MAX_SENSORS + '. Sensors are shown by name, never by position.', 'Διαλέξτε έως ' + MAX_SENSORS + '. Οι αισθητήρες εμφανίζονται με το όνομά τους, ποτέ με τη θέση τους.'))];
      if (!S.loaded) kids.push(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      else if (S.devErr || !S.devices) kids.push(el('div', null, el('div', { class: 'err', role: 'alert' }, t('The sensor list could not be loaded. ', 'Η λίστα αισθητήρων δεν φορτώθηκε. ') + errMsg(S.devErr)), el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: async () => { S.loaded = false; drawAll(); await loadSide(); S.loaded = true; if (alive) drawAll(); } }, t('Try again', 'Δοκιμάστε ξανά')))));
      else if (!S.devices.length) kids.push(el('div', { class: 'empty' }, el('b', { style: { display: 'block', color: 'var(--nm-ink-soft)' } }, t('No sensors are listed right now.', 'Δεν υπάρχουν αισθητήρες στη λίστα αυτή τη στιγμή.')), t('Come back later, or ask your teacher to check the sensors.', 'Ξαναπεράστε αργότερα ή ζητήστε από τον εκπαιδευτικό σας να ελέγξει τους αισθητήρες.')));
      else {
        const groups = Array.from(new Set(S.devices.map((d) => d.group).filter(Boolean))).sort();
        if (S.group !== 'all' && !groups.includes(S.group)) S.group = 'all';
        let list = S.devices.filter((d) => S.group === 'all' || d.group === S.group);
        list = list.slice().sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
        const counter = el('span', { class: 'st-count', 'aria-live': 'polite' });
        const upd = () => { counter.textContent = t(S.sensors.length + ' of ' + MAX_SENSORS + ' chosen', S.sensors.length + ' από ' + MAX_SENSORS + ' επιλεγμένοι'); };
        upd();
        if (groups.length > 1) kids.push(el('div', { class: 'st-bar' }, el('div', { class: 'nm-pillbar', role: 'group', 'aria-label': t('Show sensors of', 'Εμφάνιση αισθητήρων του') }, [['all', t('All', 'Όλοι')], ...groups.map((g) => [g, g])].map(([id, label]) => el('button', { type: 'button', class: S.group === id ? 'on' : '', 'aria-pressed': S.group === id ? 'true' : 'false', onclick: () => { S.group = id; drawPanel(); } }, label))), counter));
        else kids.push(el('div', { class: 'st-bar' }, counter));
        kids.push(el('div', { class: 'st-grid', role: 'group', 'aria-label': t('Sensors', 'Αισθητήρες') }, list.map((d) => {
          const on = S.sensors.includes(d.eui);
          const box = el('input', { type: 'checkbox', id: 'st-s-' + d.eui, checked: on });
          box.addEventListener('change', () => { if (!toggleSensor(d.eui)) { box.checked = false; return; } lab.classList.toggle('on', box.checked); upd(); drawAside(); drawSteps(); syncNext(); });
          const mids = midsOf(d);
          const lab = el('label', { class: 'st-sc' + (on ? ' on' : ''), for: 'st-s-' + d.eui }, box,
            el('span', { class: 'st-tick', 'aria-hidden': 'true' }, ic('check')),
            el('span', { class: 'st-sb' }, el('b', null, d.name), el('small', null, d.group),
              el('span', { class: 'st-state' + (d.online ? ' ok' : '') }, el('i', { 'aria-hidden': 'true' }), d.online ? t('Online', 'Σε λειτουργία') : t('Quiet', 'Σιωπηλός'), ' · ' + agoText(d.lastSeen)),
              mids.length ? el('span', { class: 'st-ms' }, mids.slice(0, 4).map((m) => el('span', { class: 'st-m' }, dataName(m))), mids.length > 4 ? el('span', { class: 'st-m' }, '+' + (mids.length - 4)) : null) : null));
          return lab;
        })));
      }
      kids.push(navRow({ label: t('Next: data', 'Επόμενο: δεδομένα'), disabled: !sensorsOk(), hint: !sensorsOk() ? t('Pick at least one sensor.', 'Διαλέξτε τουλάχιστον έναν αισθητήρα.') : '', run: () => go(3) }));
      panel.replaceChildren(...kids);
    }

    /* ----- step 3: the data ----- */
    function panel3() {
      const sug = suggestFrom(S.q);
      const avail = Array.from(new Set(S.sensors.flatMap((e) => (dev(e) ? midsOf(dev(e)) : [])))).sort();
      const row = (id, name, sub) => {
        const on = S.data.includes(id);
        const box = el('input', { type: 'checkbox', id: 'st-d-' + id, checked: on });
        box.addEventListener('change', () => { const i = S.data.indexOf(id); if (box.checked && i < 0) S.data.push(id); else if (!box.checked && i >= 0) S.data.splice(i, 1); lab.classList.toggle('on', box.checked); persist(); drawAside(); drawSteps(); syncNext(); });
        const lab = el('label', { class: 'st-dr' + (on ? ' on' : ''), for: 'st-d-' + id }, box, el('span', { class: 'st-tick', 'aria-hidden': 'true' }, ic('check')),
          el('span', { class: 'st-sb' }, el('b', null, name, sug.has(id) ? el('span', { class: 'nm-badge nm-badge--info st-sug' }, ic('sparkle'), t('Suggested', 'Προτείνεται')) : null), sub ? el('small', null, sub) : null));
        return lab;
      };
      const kids = [...head2(t('Step 3 of 4', 'Βήμα 3 από 4'), t('Which data will you read?', 'Ποια δεδομένα θα διαβάσετε;'), t('Pick the readings that can answer your question. Add official Met Office data or outdoor air if you want to compare.', 'Διαλέξτε τις μετρήσεις που μπορούν να απαντήσουν στο ερώτημά σας. Προσθέστε επίσημα δεδομένα της Μετεωρολογικής Υπηρεσίας ή τον αέρα έξω αν θέλετε να συγκρίνετε.'))];
      kids.push(el('div', { class: 'st-eb' }, ic('sensor'), t('Readings from your sensors', 'Μετρήσεις από τους αισθητήρες σας')),
        avail.length ? el('div', { class: 'st-list' }, avail.map((m) => row(m, dataName(m), unitOf(m) ? t('Unit: ', 'Μονάδα: ') + unitOf(m) : ''))) : el('p', { class: 'muted st-none' }, t('The sensors you picked do not list any readings. Use official data below, or go back and pick other sensors.', 'Οι αισθητήρες που διαλέξατε δεν έχουν μετρήσεις στη λίστα. Χρησιμοποιήστε τα επίσημα δεδομένα παρακάτω ή γυρίστε πίσω και διαλέξτε άλλους αισθητήρες.')));
      kids.push(el('div', { class: 'st-eb' }, ic('db'), t('Official data and the air outside', 'Επίσημα δεδομένα και ο αέρας έξω')),
        el('div', { class: 'st-list' }, row('metoffice', t(SRC.metoffice.name[0], SRC.metoffice.name[1]), t(SRC.metoffice.what[0], SRC.metoffice.what[1])), row('air', t(SRC.air.name[0], SRC.air.name[1]), t(SRC.air.what[0], SRC.air.what[1]))));
      kids.push(el('p', { class: 'st-hint' }, S.data.length ? t(S.data.length + ' chosen. Pick what you need, not everything.', S.data.length + ' επιλεγμένα. Διαλέξτε ό,τι χρειάζεστε, όχι τα πάντα.') : t('Pick at least one.', 'Διαλέξτε τουλάχιστον ένα.')));
      kids.push(navRow({ label: t('Next: team', 'Επόμενο: ομάδα'), disabled: !dataOk(), hint: '', run: () => go(4) }));
      panel.replaceChildren(...kids);
    }

    /* ----- step 4: the team (join the class first if needed) ----- */
    function gateForm() {
      const acct = SC.account;
      const waiting = Boolean(acct && acct.status === 'pending') || Boolean(V().pending);
      return el('div', { class: 'st-gate' },
        el('div', { class: 'st-gate-h' }, el('b', null, waiting ? t('Your account is waiting for approval', 'Ο λογαριασμός σας περιμένει έγκριση') : t('Sign in to save your plan', 'Συνδεθείτε για να αποθηκεύσετε το σχέδιο'))),
        el('p', { class: 'st-hint' }, waiting
          ? t('A teacher or an admin is checking your request. You can save the plan as soon as you are approved. Your plan so far stays in this browser.', 'Ένας εκπαιδευτικός ή ο διαχειριστής ελέγχει το αίτημά σας. Θα μπορείτε να αποθηκεύσετε το σχέδιο μόλις εγκριθείτε. Το σχέδιό σας μέχρι τώρα μένει σε αυτό το πρόγραμμα περιήγησης.')
          : t('Make your own account, with your city and team (no email, no class code), or sign in. A teacher approves new accounts. Your plan so far stays in this browser.', 'Φτιάξτε τον δικό σας λογαριασμό, με την πόλη και την ομάδα σας (χωρίς email, χωρίς κωδικό τάξης), ή συνδεθείτε. Ένας εκπαιδευτικός εγκρίνει τους νέους λογαριασμούς. Το σχέδιό σας μέχρι τώρα μένει σε αυτό το πρόγραμμα περιήγησης.')),
        el('div', { class: 'st-actions' }, el('a', { class: 'nm-btn nm-btn--primary', href: '#/join' }, ic('lock'), waiting ? t('See my request', 'Δείτε το αίτημά μου') : t('Join or sign in', 'Εγγραφή ή σύνδεση'))));
    }
    async function loadSchools() {
      S.schoolsAsked = true;   // ask only once
      try { const r = await SC.cached('/app/api/schools/public', 300000); S.schools = ((r && r.schools) || []).filter((x) => x && x.slug).map((x) => ({ slug: x.slug, short: x.short || x.name })); } catch (e) { S.schools = []; }
      if (alive && S.step === 4) drawPanel();
    }
    function panel4() {
      const kids = [...head2(t('Step 4 of 4', 'Βήμα 4 από 4'), t('Name your team.', 'Δώστε όνομα στην ομάδα σας.'), t('Your team name and a short note go with the project. No real names, photos or exact places.', 'Το όνομα της ομάδας και ένα σύντομο σημείωμα συνοδεύουν το έργο. Χωρίς πραγματικά ονόματα, φωτογραφίες ή ακριβή σημεία.'))];
      if (!S.loaded) kids.push(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      else if (!S.status) kids.push(el('div', null, el('div', { class: 'err', role: 'alert' }, t('The studio could not be reached, so a plan cannot be saved yet.', 'Δεν έγινε σύνδεση με το στούντιο, οπότε το σχέδιο δεν μπορεί να αποθηκευτεί ακόμη.')), el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: async () => { await loadStatus(); drawAll(); } }, t('Try again', 'Δοκιμάστε ξανά')))));
      else if (!canCreate()) kids.push(gateForm());
      else {
        kids.push(el('div', { class: 'st-field' }, el('label', { for: 'st-team' }, t('Team name', 'Όνομα ομάδας')), teamIn, el('p', { class: 'st-hint' }, t('The team this plan is shown under, for example “Hermes”.', 'Η ομάδα με την οποία εμφανίζεται το σχέδιο, π.χ. «Hermes».'))));
        if (needsSchool()) {
          if (!S.schoolsAsked) loadSchools();
          const sel = el('select', { class: 'nm-input st-sel', id: 'st-school', onchange: (e) => { S.schoolSlug = e.target.value; drawAside(); syncNext(); } },
            el('option', { value: '' }, S.schools === null ? t('Loading', 'Φόρτωση') : t('Choose a school', 'Επιλέξτε σχολείο')),
            ...(S.schools || []).map((x) => el('option', { value: x.slug, selected: x.slug === S.schoolSlug }, x.short)));
          kids.push(el('div', { class: 'st-field' }, el('label', { for: 'st-school' }, t('School', 'Σχολείο')), sel, el('p', { class: 'st-hint' }, t('Your account is not tied to one school, so say which school this plan is for.', 'Ο λογαριασμός σας δεν είναι δεμένος με ένα σχολείο, γι’ αυτό πείτε για ποιο σχολείο είναι το σχέδιο.'))));
        }
        if (!S.titleTouched) { S.title = autoTitle(S.q); titleIn.value = S.title; }
        kids.push(el('div', { class: 'st-field' }, el('label', { for: 'st-title' }, t('Project name', 'Όνομα έργου')), titleIn, el('p', { class: 'st-hint' }, t('A short title for the card. You can keep the one we made from your question.', 'Ένας σύντομος τίτλος για την κάρτα. Μπορείτε να κρατήσετε αυτόν που φτιάξαμε από το ερώτημά σας.'))));
        noteCount.textContent = t(S.note.length + ' of ' + MAX_NOTE, S.note.length + ' από ' + MAX_NOTE);
        kids.push(el('div', { class: 'st-field' }, el('label', { for: 'st-note' }, t('A note for your teacher (optional)', 'Σημείωμα για τον εκπαιδευτικό σας (προαιρετικό)')), noteIn,
          el('div', { class: 'st-below' }, el('span', null, t('What do you expect to see? Why does it matter?', 'Τι περιμένετε να δείτε; Γιατί έχει σημασία;')), noteCount)));
      }
      kids.push(navRow({ label: t('Review the plan', 'Έλεγχος του σχεδίου'), disabled: !teamOk(), hint: canCreate() && !teamOk() ? t('Add a team name and a project name.', 'Προσθέστε όνομα ομάδας και όνομα έργου.') : '', run: () => go(5) }));
      panel.replaceChildren(...kids);
    }

    /* ----- step 5: review ----- */
    async function create() {
      if (S.creating || !teamOk()) return;
      S.creating = true; S.err = ''; drawPanel();
      try {
        const r = await SC.api('/studio/api/plans', { method: 'POST', body: { title: S.title.trim().slice(0, 80), question: S.q.trim(), sensors: S.sensors.slice(), data: S.data.slice(), team: teamName(), notes: S.note.trim(), ...(needsSchool() ? { school: S.schoolSlug } : {}) } });
        S.created = { plan: r && r.plan ? r.plan : null, q: S.q.trim(), title: S.title.trim(), sensors: S.sensors.slice(), data: S.data.slice(), team: teamName(), school: schoolName(), note: S.note.trim() };
        SC.store.set(KEY, '');
        live.textContent = t('Your project plan was created.', 'Το σχέδιο του έργου σας δημιουργήθηκε.');
      } catch (e) {
        if (e.status === 401) { await loadStatus(); S.err = t('Your class session has ended. Join the class again in step 4. Your plan is still here.', 'Η συνεδρία της τάξης έληξε. Μπείτε ξανά στην τάξη στο βήμα 4. Το σχέδιό σας είναι ακόμη εδώ.'); }
        else if (e.status === 404 || e.status === 503) S.err = t('Plans cannot be saved yet. Try again a little later. Your plan is still here.', 'Τα σχέδια δεν μπορούν να αποθηκευτούν ακόμη. Δοκιμάστε ξανά λίγο αργότερα. Το σχέδιό σας είναι ακόμη εδώ.');
        else if (e.status === 429) S.err = t('You are going fast. Wait a minute, then try again.', 'Πάτε πολύ γρήγορα. Περιμένετε ένα λεπτό και δοκιμάστε ξανά.');
        else S.err = (SC.lang === 'el' && e.status === 400 ? 'Το σχέδιο δεν αποθηκεύτηκε: ' : '') + errMsg(e);
      }
      S.creating = false;
      if (alive) { drawAll(); if (S.created) { const h = panel.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus(); } } }
    }
    function panel5() {
      const sec = (n, label, body) => el('div', { class: 'st-rv' }, el('div', { class: 'st-rv-h' }, el('span', { class: 'st-eb' }, label), el('button', { class: 'link', type: 'button', 'aria-label': t('Change ', 'Αλλαγή: ') + label, onclick: () => go(n) }, ic('pencil'), t('Change', 'Αλλαγή'))), body);
      const chipsOf = (ids, fn, kind) => (ids.length ? el('div', { class: 'st-chips' }, ids.map((x) => el('span', { class: 'st-chip' }, ic(kind), fn(x)))) : el('p', { class: 'muted' }, t('Nothing chosen.', 'Δεν έχει επιλεγεί τίποτα.')));
      const c = checkQuestion(S.q);
      const kids = [...head2(t('Review', 'Έλεγχος'), t('Check your plan.', 'Ελέγξτε το σχέδιό σας.'), t('This is what a teacher will see. When you create it, it is saved as a draft that only your team and teachers can see. You send it to a teacher from Running projects.', 'Αυτό θα δει ο εκπαιδευτικός. Όταν το δημιουργήσετε, αποθηκεύεται ως προσχέδιο που το βλέπουν μόνο η ομάδα σας και οι εκπαιδευτικοί. Το στέλνετε σε εκπαιδευτικό από τα Ενεργά έργα.'))];
      kids.push(el('div', { class: 'st-review' },
        sec(1, t('Question', 'Ερώτημα'), el('div', null, el('p', { class: 'st-rq' }, S.q.trim()), c.ok ? el('span', { class: 'nm-badge nm-badge--ok' }, ic('check'), t('Measurable', 'Μετρήσιμο')) : el('span', { class: 'nm-badge nm-badge--warn' }, t('May be hard to measure', 'Ίσως δύσκολο να μετρηθεί')))),
        sec(2, t('Sensors', 'Αισθητήρες'), chipsOf(S.sensors, sensorName, 'sensor')),
        sec(3, t('Data', 'Δεδομένα'), chipsOf(S.data, dataName, 'db')),
        sec(4, t('Team', 'Ομάδα'), el('div', null, el('p', { class: 'st-rt' }, el('b', null, t('Team ', 'Ομάδα ') + teamName()), schoolName() ? ' · ' + schoolName() : ''), el('p', { class: 'muted' }, t('Project name: ', 'Όνομα έργου: ') + S.title.trim()), S.note.trim() ? el('p', { class: 'st-rn' }, S.note.trim()) : el('p', { class: 'muted' }, t('No note.', 'Χωρίς σημείωμα.'))))));
      kids.push(el('div', { class: 'nm-callout nm-callout--info st-priv' }, ic('lock'), el('span', null, el('b', null, t('Before you create it.', 'Πριν το δημιουργήσετε.')), ' ' + t('Check that nothing names a student or a person, and that no exact place is written. Sensors are listed by name only.', 'Βεβαιωθείτε ότι δεν αναφέρεται μαθητής ή άλλο πρόσωπο και ότι δεν γράφεται ακριβές σημείο. Οι αισθητήρες αναφέρονται μόνο με το όνομά τους.'))));
      if (S.err) kids.push(el('div', { class: 'err', role: 'alert' }, S.err));
      const nav = el('div', { class: 'st-nav' }, el('button', { class: 'nm-btn', type: 'button', onclick: () => go(4) }, ic('back'), t('Back', 'Πίσω')), el('span', { class: 'st-sp' }),
        el('button', { class: 'nm-btn nm-btn--primary', id: 'st-next', type: 'button', disabled: S.creating || !(qOk() && sensorsOk() && dataOk() && teamOk()), onclick: create }, ic('flag'), S.creating ? t('Creating', 'Δημιουργία') : t('Create the project', 'Δημιουργία του έργου')));
      kids.push(nav);
      panel.replaceChildren(...kids);
    }

    /* ----- success ----- */
    function drawDone() {
      const c = S.created;
      panel.className = 'nm-card nm-card--glow st-panel st-done';
      panel.replaceChildren(el('span', { class: 'st-bigtick', 'aria-hidden': 'true' }, ic('check')),
        el('div', { class: 'st-eb cu' }, t('Plan created', 'Το σχέδιο δημιουργήθηκε')), el('h2', null, t('Your project is saved as a draft.', 'Το έργο σας αποθηκεύτηκε ως προσχέδιο.')),
        el('p', { class: 'st-lede' }, t('Only your team and teachers can see it for now. Open Running projects to start it, follow its steps and send it to a teacher when it is ready.', 'Προς το παρόν το βλέπουν μόνο η ομάδα σας και οι εκπαιδευτικοί. Ανοίξτε τα Ενεργά έργα για να το ξεκινήσετε, να παρακολουθείτε τα βήματά του και να το στείλετε σε εκπαιδευτικό όταν είναι έτοιμο.')),
        el('div', { class: 'st-sum' }, el('b', null, c.q), el('span', { class: 'muted' }, t('Team ' + c.team, 'Ομάδα ' + c.team) + (c.school ? ' · ' + c.school : '') + ' · ' + t(c.sensors.length + (c.sensors.length === 1 ? ' sensor' : ' sensors'), c.sensors.length + (c.sensors.length === 1 ? ' αισθητήρας' : ' αισθητήρες')) + ' · ' + t(c.data.length + ' data', c.data.length + ' δεδομένα'))),
        el('div', { class: 'st-actions' }, el('a', { class: 'nm-btn nm-btn--primary', href: '#/projects' }, ic('flag'), t('Open Running projects', 'Άνοιγμα Ενεργών έργων')),
          el('button', { class: 'nm-btn', type: 'button', onclick: () => { reset(); panel.className = 'nm-card nm-card--glow st-panel'; drawAll(); } }, ic('plus'), t('Start another', 'Ξεκινήστε άλλο'))));
      aside.replaceChildren();
    }

    /* ----- the summary on the side ----- */
    function drawAside() {
      if (S.created) { aside.replaceChildren(); return; }
      const rowOf = (n, label, ok, body) => el('li', { class: ok ? 'ok' : '' }, el('span', { class: 'st-ai', 'aria-hidden': 'true' }, ok ? ic('check') : String(n)), el('div', null, el('b', null, label), body));
      const none = (en, gr) => el('small', { class: 'muted' }, t(en, gr));
      aside.replaceChildren(el('div', { class: 'nm-card st-sumcard' },
        el('div', { class: 'st-eb' }, t('Your plan so far', 'Το σχέδιό σας μέχρι τώρα')),
        el('ul', { class: 'st-sum-l' },
          rowOf(1, t('Question', 'Ερώτημα'), qOk(), qOk() ? el('p', null, S.q.trim()) : none('Not written yet', 'Δεν έχει γραφτεί ακόμη')),
          rowOf(2, t('Sensors', 'Αισθητήρες'), sensorsOk(), sensorsOk() ? el('p', null, S.sensors.map(sensorName).join(', ')) : none('None picked yet', 'Δεν έχει επιλεγεί ακόμη')),
          rowOf(3, t('Data', 'Δεδομένα'), dataOk(), dataOk() ? el('p', null, S.data.map(dataName).join(', ')) : none('None picked yet', 'Δεν έχει επιλεγεί ακόμη')),
          rowOf(4, t('Team', 'Ομάδα'), teamOk(), teamOk() ? el('p', null, t('Team ', 'Ομάδα ') + teamName()) : none('Not named yet', 'Δεν έχει ονομαστεί ακόμη'))),
        el('div', { class: 'nm-callout st-safe' }, el('b', null, t('Kept in this browser.', 'Κρατιέται σε αυτό το πρόγραμμα περιήγησης.')), ' ' + t('Nothing is sent until you create the project in the last step. A teacher approves a plan before it is public.', 'Τίποτα δεν στέλνεται μέχρι να δημιουργήσετε το έργο στο τελευταίο βήμα. Ένας εκπαιδευτικός εγκρίνει ένα σχέδιο πριν γίνει δημόσιο.'))));
    }

    function syncNext() {
      const b = document.getElementById('st-next'); if (!b) return;
      const dis = S.step === 1 ? !qOk() : S.step === 2 ? !sensorsOk() : S.step === 3 ? !dataOk() : S.step === 4 ? !teamOk() : S.creating || !(qOk() && sensorsOk() && dataOk() && teamOk());
      b.disabled = dis;
    }
    function drawPanel() {
      if (S.created) { drawDone(); return; }
      panel.className = 'nm-card nm-card--glow st-panel';
      (S.step === 1 ? panel1 : S.step === 2 ? panel2 : S.step === 3 ? panel3 : S.step === 4 ? panel4 : panel5)();
    }
    function drawAll() {
      if (!alive) return;
      drawHead(); drawRestore(); drawSteps(); drawPanel(); drawAside();
    }

    /* ----- field listeners ----- */
    qIn.addEventListener('input', () => { S.q = qIn.value; persist(); drawQCheck(); drawAside(); syncNext(); drawSteps(); });
    titleIn.addEventListener('input', () => { S.title = titleIn.value; S.titleTouched = true; persist(); drawAside(); syncNext(); });
    noteIn.addEventListener('input', () => { S.note = noteIn.value; noteCount.textContent = t(S.note.length + ' of ' + MAX_NOTE, S.note.length + ' από ' + MAX_NOTE); persist(); });
    teamIn.addEventListener('input', () => { S.team = teamIn.value; persist(); drawAside(); syncNext(); });
    document.addEventListener('keydown', onKey);
    function onKey(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && S.step === 1) { e.preventDefault(); nextFrom1(); } }

    /* ----- start: restore a draft, load the lists ----- */
    const d0 = readDraft();
    if (d0 && draftHasContent(d0)) {
      S.q = d0.q; S.sensors = d0.sensors; S.data = d0.data; S.team = d0.team; S.title = d0.title; S.titleTouched = Boolean(d0.title) && d0.title !== autoTitle(d0.q); S.note = d0.note; S.step = d0.step; S.maxStep = Math.max(1, Math.min(5, d0.step)); S.restoredAt = d0.at;
      // every step before the one reached was finished, so it can be opened again
      if (qOk()) S.maxStep = Math.max(S.maxStep, sensorsOk() ? (dataOk() ? 4 : 3) : 2);
      if (S.step > S.maxStep) S.step = S.maxStep;
      qIn.value = S.q; titleIn.value = S.title; noteIn.value = S.note; teamIn.value = S.team;
    }
    drawAll();
    return (async () => {
      await loadAll();
      if (!alive) return () => {};
      // a draft saved on step 5 or 4 cannot go on for a visitor who has not joined a class yet
      if (!canCreate() && S.step === 5) S.step = 4;
      qIn.value = S.q;
      drawAll();
      return () => { alive = false; document.removeEventListener('keydown', onKey); };
    })();
  }

  SC.register('start', {
    title: ['Start a project', 'Νέο έργο'],
    render(root) {
      SC.css('/site/pages/start.css');
      return start(root);
    },
  });
})();
