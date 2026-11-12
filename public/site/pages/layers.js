/*
  Data layers: every open source we know about for Cyprus's cities, stacked as layers, and the master brain that reads
  the layers that are switched on and writes findings for one city at a time.
  Route: #/layers.   Data: GET /layers/api/register, GET /layers/api/layers/<id>, POST /layers/api/brain { city, layers, question? },
  PUT /layers/api/mission and POST /layers/api/mission/reset (teachers).   Needs window.ISLAND (island.js) for the map shapes.
  The brain never gets coordinates: the planes below are a drawing of where the schools and stations are, not of any vehicle.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/layers.css');

  const API = '/layers/api';
  const SOURCES_URL = 'https://github.com/elpidoforo/sensecap-dashboard/tree/main/sources';
  const HOUR = 3600000;
  const isEl = () => SC.lang === 'el';
  const nameOf = (l) => (isEl() && l.nameEl) || l.name;
  const errMsg = (e) => (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.');
  const isTeacher = () => Boolean(SC.me && (SC.me.role === 'teacher' || SC.me.role === 'admin'));

  const GROUPS = {
    own: { en: 'Our sensors', el: 'Οι αισθητήρες μας', col: '#F2A56B', short: ['Our sensors', 'Οι αισθητήρες μας'] },
    official: { en: 'Official stations', el: 'Επίσημοι σταθμοί', col: '#4CCBEA' },
    model: { en: 'Models and satellites', el: 'Μοντέλα και δορυφόροι', col: '#B6A7F0' },
    context: { en: 'City context', el: 'Πλαίσιο πόλης', col: '#7FD3A0' },
  };
  const LIST_ORDER = ['own', 'official', 'model', 'context'];
  const PLANE_ORDER = ['context', 'model', 'official', 'own'];   // bottom of the stack first
  const STATE = {
    live: ['Live', 'Ζωντανό', 'live'], checking: ['Checking', 'Έλεγχος', 'off'], late: ['Late', 'Αργεί', 'late'], down: ['Down', 'Εκτός', 'down'], off: ['Off', 'Κλειστό', 'off'],
    planned: ['Planned', 'Σχεδιάζεται', 'plan'], candidate: ['Candidate', 'Υποψήφιο', 'cand'], retired: ['Retired', 'Αποσυρμένο', 'off'],
  };
  const CONF = { high: [3, 'High', 'Υψηλή'], medium: [2, 'Medium', 'Μέτρια'], low: [1, 'Low', 'Χαμηλή'] };
  const GAP_WHY = {
    'too-far': ['no point close enough to this city', 'κανένα σημείο αρκετά κοντά σε αυτή την πόλη'],
    'on-but-empty': ['it is on, but gave no reading for this city', 'είναι ενεργό, αλλά δεν έδωσε μέτρηση για αυτή την πόλη'],
    planned: ['planned, not connected yet', 'προγραμματισμένο, δεν έχει συνδεθεί ακόμη'],
    candidate: ['a candidate source, not connected', 'υποψήφια πηγή, δεν έχει συνδεθεί'],
  };
  const SUGGEST = [
    ['Where is it hottest today?', 'Πού κάνει τη μεγαλύτερη ζέστη σήμερα;'],
    ['Is the air inside our vehicles different from outside?', 'Ο αέρας μέσα στα οχήματά μας διαφέρει από τον έξω;'],
    ['Which source should I trust least here?', 'Ποια πηγή να εμπιστεύομαι λιγότερο εδώ;'],
  ];
  const OFF_KEY = 'sc.layers.off';
  const loadOff = () => { try { const a = JSON.parse(SC.store.get(OFF_KEY) || '[]'); return new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []); } catch (e) { return new Set(); } };
  const saveOff = (set) => SC.store.set(OFF_KEY, JSON.stringify([...set]));

  const placeName = (p) => (Array.isArray(p) ? p[isEl() ? 1 : 0] : p) || '';
  const btn = (cls, label, on) => h('button', { class: cls, type: 'button', onclick: on }, label);
  const dayLine = (n, one, many) => (n === 1 ? one : many);
  const unitIn = (f) => (f.readings && f.readings[0] && f.readings[0].unit) || '';

  /* ------------------------------------------------------------------ the drawing: island planes ---- */
  function projectPt(lng, lat) { return ISLAND.project(lng, lat); }
  function schoolAt(id) { return (ISLAND.schools || []).find((s) => s.id === id); }
  function featureNodes(group, on) {
    const col = GROUPS[group].col, nodes = [];
    const dist = SC.svgEl('g', { fill: col, 'fill-opacity': on ? 0.28 : 0.1, stroke: 'none' });
    Object.keys(ISLAND.districts).forEach((n) => dist.append(SC.svgEl('path', { d: ISLAND.districts[n] })));
    nodes.push(dist);
    if (!on) return nodes;
    if (group === 'own') {
      const g = SC.svgEl('g', { fill: 'none', stroke: col, 'stroke-width': 3, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round', opacity: 0.85 });
      [['larnaka', 'lefkosia'], ['larnaka', 'limassol'], ['limassol', 'paphos']].forEach(([a, b]) => {
        const A = schoolAt(a), B = schoolAt(b); if (!A || !B) return;
        const p = projectPt(A.lng, A.lat), q = projectPt(B.lng, B.lat);
        const mx = (p[0] + q[0]) / 2 + (q[1] - p[1]) * 0.18, my = (p[1] + q[1]) / 2 - (q[0] - p[0]) * 0.18;
        g.append(SC.svgEl('path', { d: 'M' + p.join(' ') + 'Q' + mx + ' ' + my + ' ' + q.join(' ') }));
      });
      nodes.push(g);
      (ISLAND.schools || []).forEach((s) => { const q = projectPt(s.lng, s.lat); nodes.push(SC.svgEl('circle', { cx: q[0], cy: q[1], r: 15, fill: col, 'fill-opacity': 0.35 }), SC.svgEl('circle', { cx: q[0], cy: q[1], r: 8, fill: col })); });
    } else if (group === 'official') {
      (ISLAND.stations || []).forEach((s) => { const q = projectPt(s.lng, s.lat); nodes.push(SC.svgEl('circle', { cx: q[0], cy: q[1], r: 9, fill: '#0C1626', stroke: col, 'stroke-width': 3 }), SC.svgEl('circle', { cx: q[0], cy: q[1], r: 3, fill: col })); });
    } else if (group === 'model') {
      (ISLAND.schools || []).forEach((s) => { const q = projectPt(s.lng, s.lat); nodes.push(SC.svgEl('circle', { cx: q[0], cy: q[1], r: 48, fill: col, 'fill-opacity': 0.12 }), SC.svgEl('circle', { cx: q[0], cy: q[1], r: 26, fill: col, 'fill-opacity': 0.24 })); });
    } else {
      (ISLAND.schools || []).forEach((s) => { const q = projectPt(s.lng, s.lat); nodes.push(SC.svgEl('circle', { cx: q[0], cy: q[1], r: 20, fill: col, 'fill-opacity': 0.32 })); });
    }
    return nodes;
  }
  function planeSvg(group, on) {
    const svg = SC.svgEl('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    featureNodes(group, on).forEach((n) => svg.append(n));
    return svg;
  }
  function flatSvg(on) {
    const svg = SC.svgEl('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, role: 'img', 'aria-label': T('Cyprus with the layers that are on', 'Η Κύπρος με τα στρώματα που είναι ενεργά') });
    const base = SC.svgEl('g', { fill: 'rgba(255,255,255,.06)', stroke: 'rgba(143,227,247,.3)', 'stroke-width': 0.6 });
    Object.keys(ISLAND.districts).forEach((n) => base.append(SC.svgEl('path', { d: ISLAND.districts[n] })));
    svg.append(base);
    PLANE_ORDER.forEach((g) => { if (!on[g]) return; featureNodes(g, true).slice(1).forEach((n) => svg.append(n)); });
    (ISLAND.schools || []).forEach((s) => {
      const q = projectPt(s.lng, s.lat), id = s.id.charAt(0).toUpperCase() + s.id.slice(1);
      svg.append(SC.svgEl('text', { x: q[0] + 14, y: q[1] - 12, fill: '#E6EEF8', 'font-size': 15, 'font-family': 'inherit', 'font-weight': 600, 'paint-order': 'stroke', stroke: '#0C1626', 'stroke-width': 3 }, placeLabel(id)));
    });
    return svg;
  }
  function placeLabel(id) { return ({ larnaka: T('Larnaka', 'Λάρνακα'), lefkosia: T('Lefkosia', 'Λευκωσία'), limassol: T('Limassol', 'Λεμεσός'), paphos: T('Paphos', 'Πάφος') })[id.toLowerCase()] || id; }

  /* ---------------------------------------------------------------- satellite pictures in a layer's dialog ----
     A satellite feed (satellite/index.js) may keep its newest pictures. GET /api/satellite/images lists them (newest first, with the
     feed id); the dialog of a layer shows the ones of that layer: the latest large, the earlier days as small pictures you can press.
     Pictures load from our own server only. If the list cannot be read, or the layer has no picture, nothing is drawn. */
  const quietWord = () => T('satellite', 'δορυφόρος');
  const kindChip = () => h('em', { class: 'ly-kd' }, quietWord());
  const utcLong = () => new Intl.DateTimeFormat(isEl() ? 'el-GR' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const utcShort = () => new Intl.DateTimeFormat(isEl() ? 'el-GR' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const takenAt = (t) => T('Taken ', 'Λήψη ') + utcLong().format(t) + ' UTC';
  function satelliteStrip(images) {
    const all = (images || []).slice(0, 60);
    if (!all.length) return null;
    // A feed with several kinds of picture (natural colours, night lights, ...) gets one button per kind; the small pictures below are the days of the chosen kind.
    const kinds = [];
    all.forEach((im) => { if (im.group && !kinds.some((k) => k.id === im.group)) kinds.push({ id: im.group, o: im.groupOrder == null ? 99 : im.groupOrder, en: im.groupLabel || im.title, el: im.groupLabelEl || im.groupLabel || im.title }); });
    kinds.sort((a, b) => a.o - b.o);   // the feed's own order, so the buttons do not jump around from day to day
    let kindId = kinds.length > 1 ? kinds[0].id : null;
    const pick = () => (kindId ? all.filter((im) => im.group === kindId) : all).slice(0, 8);
    let list = pick();
    const lt = (im, k) => (isEl() ? im[k + 'El'] : im[k]) || im[k] || '';
    let cur = 0;
    const big = h('img', { class: 'ly-sat-img', decoding: 'async', width: '640', height: '392' });
    const title = h('b', null), when = h('span', null), what = h('p', { class: 'ly-sat-what' }), credit = h('p', { class: 'ly-fine ly-sat-credit' });
    const cloudy = h('p', { class: 'ly-sat-cloud', hidden: true });
    const miss = h('p', { class: 'ly-fine', hidden: true }, T('This picture is not available right now.', 'Αυτή η εικόνα δεν είναι διαθέσιμη αυτή τη στιγμή.'));
    big.addEventListener('error', () => { big.hidden = true; miss.hidden = false; });
    big.addEventListener('load', () => { big.hidden = false; miss.hidden = true; });
    const thumbs = h('div', { class: 'ly-sat-th', role: 'group', 'aria-label': T('Earlier pictures', 'Προηγούμενες εικόνες') });
    function show(i) {
      cur = i;
      const im = list[i];
      big.hidden = false; miss.hidden = true;
      big.src = im.url;
      big.alt = lt(im, 'title') + '. ' + takenAt(im.time) + '.' + (im.cloud != null && im.cloud >= 40 ? ' ' + T('Lots of cloud.', 'Πολλά σύννεφα.') : '');
      title.textContent = lt(im, 'title');
      when.textContent = takenAt(im.time);
      what.replaceChildren(h('b', null, T('What you are looking at: ', 'Τι βλέπεις: ')), lt(im, 'text'));
      credit.textContent = lt(im, 'attribution') ? T('Picture credit: ', 'Πηγή εικόνας: ') + lt(im, 'attribution') : '';
      credit.hidden = !credit.textContent;
      cloudy.hidden = !(im.cloud != null && im.cloud >= 40);
      cloudy.textContent = T('Lots of cloud in this picture, so the ground is hard to see.', 'Αυτή η εικόνα έχει πολλά σύννεφα, γι’ αυτό το έδαφος δεν φαίνεται καλά.');
      [...thumbs.children].forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    }
    function drawThumbs() {
      thumbs.replaceChildren(...list.map((im, i) => h('button', { type: 'button', class: 'ly-sat-b', 'aria-pressed': 'false', 'aria-label': T('Show the picture from ', 'Δες την εικόνα της ') + utcShort().format(im.time), title: takenAt(im.time), onclick: () => show(i) },
        h('img', { src: im.url, alt: '', loading: 'lazy', decoding: 'async', width: '64', height: '40' }),
        h('span', null, i === 0 ? T('Latest', 'Τελευταία') : utcShort().format(im.time)))));
      thumbs.hidden = list.length < 2;
    }
    const kindBar = kinds.length > 1 ? h('div', { class: 'ly-sat-kinds', role: 'group', 'aria-label': T('Kinds of picture', 'Είδη εικόνων') }) : null;
    function setKind(id) {
      kindId = id; list = pick(); drawThumbs(); show(0);
      if (kindBar) [...kindBar.children].forEach((b, k) => b.setAttribute('aria-pressed', kinds[k].id === id ? 'true' : 'false'));
    }
    if (kindBar) kinds.forEach((k) => kindBar.append(h('button', { type: 'button', class: 'ly-sat-k', 'aria-pressed': 'false', onclick: () => setKind(k.id) }, isEl() ? k.el : k.en)));
    drawThumbs();
    show(0);
    if (kindBar) [...kindBar.children].forEach((b, k) => b.setAttribute('aria-pressed', kinds[k].id === kindId ? 'true' : 'false'));
    return h('section', { class: 'ly-sat', 'aria-label': T('Satellite pictures', 'Δορυφορικές εικόνες') },
      h('div', { class: 'ly-eb' }, T('Satellite pictures', 'Δορυφορικές εικόνες')),
      kindBar,
      h('figure', { class: 'ly-sat-fig' }, big, miss, h('figcaption', null, title, when)),
      what, cloudy,
      thumbs,
      h('p', { class: 'ly-sat-note' }, T('Satellite picture, not a photo of today. It shows what the satellite saw when it passed over, and if it is cloudy the clouds hide the ground.', 'Δορυφορική εικόνα, όχι φωτογραφία της σημερινής μέρας. Δείχνει ό,τι είδε ο δορυφόρος όταν πέρασε από πάνω, και αν έχει σύννεφα, τα σύννεφα κρύβουν το έδαφος.')),
      credit);
  }

  /* ---------------------------------------------------------------------------- the page ---- */
  SC.register('layers', {
    title: ['Data layers', 'Στρώματα δεδομένων'],
    render(root, ctx) {
      root.classList.add('ly-page');
      let dead = false;
      const timers = [];
      const S = {
        reg: null, off: loadOff(), view: 'stack', city: 'larnaka', cityList: [],
        results: new Map(), loading: false, err: null, answer: null, asking: false, question: '', brainTok: 0,
      };
      const R = {};   // the parts of the page we redraw

      /* ----- helpers on the register ----- */
      const layers = () => (S.reg ? S.reg.layers : []);
      const live = (l) => l.state === 'live' || l.state === 'late';
      const isOn = (l) => live(l) && !S.off.has(l.id);
      const onIds = () => layers().filter(isOn).map((l) => l.id).sort();
      const inGroup = (g) => layers().filter((l) => l.group === g);
      const onCount = (g) => inGroup(g).filter(isOn).length;
      const groupOn = () => { const o = {}; LIST_ORDER.forEach((g) => { o[g] = onCount(g) > 0; }); return o; };
      const layerById = (id) => layers().find((l) => l.id === id);

      /* ----- head ----- */
      const head = SC.head({
        title: T('Data layers', 'Στρώματα δεδομένων'),
        fresh: T('Checking the layers…', 'Έλεγχος στρωμάτων…'),
        lede: T('Every open source we know about for Cyprus’s cities, stacked as layers. Switch layers on and the master brain reads exactly those, together with our own sensors.',
          'Κάθε ανοιχτή πηγή που γνωρίζουμε για τις πόλεις της Κύπρου, στοιβαγμένη ως στρώματα. Ενεργοποιήστε στρώματα και ο κύριος εγκέφαλος διαβάζει ακριβώς αυτά, μαζί με τους δικούς μας αισθητήρες.'),
        help: [
          'Each layer is one source of data: our own sensors, official stations, models and satellites, or context about the city such as transport and green space. A switch turns a layer on or off for the master brain. A layer that is not connected yet is locked: it is planned or only a candidate. Pick a city and the brain writes findings from the layers that are on. Every finding names its sources, says how sure we are and shows when sources disagree. Where there is not enough data, it says so instead of guessing.',
          'Κάθε στρώμα είναι μια πηγή δεδομένων: οι δικοί μας αισθητήρες, επίσημοι σταθμοί, μοντέλα και δορυφόροι, ή πλαίσιο της πόλης όπως συγκοινωνίες και πράσινο. Ο διακόπτης ενεργοποιεί ή απενεργοποιεί ένα στρώμα για τον κύριο εγκέφαλο. Ένα στρώμα που δεν έχει συνδεθεί ακόμη είναι κλειδωμένο: είναι προγραμματισμένο ή μόνο υποψήφιο. Διαλέξτε μια πόλη και ο εγκέφαλος γράφει ευρήματα από τα στρώματα που είναι ενεργά. Κάθε εύρημα δείχνει τις πηγές του, πόσο σίγουροι είμαστε και πού διαφωνούν οι πηγές. Όπου δεν υπάρχουν αρκετά δεδομένα, το λέει αντί να μαντεύει.',
        ],
      });
      const pill = head.querySelector('.fresh-pill');
      const setPill = (txt) => { pill.lastChild.textContent = txt; };
      const demoTag = h('span', { class: 't demo', style: { display: 'none' }, title: T('sample numbers, not real readings', 'δειγματικοί αριθμοί, όχι πραγματικές μετρήσεις') }, T('SAMPLE', 'ΔΕΙΓΜΑ'));
      pill.after(demoTag);

      /* ----- mission ----- */
      R.mission = h('section', { class: 'nm-card ly-br ly-mission', 'aria-label': T('Our mission', 'Η αποστολή μας') });
      function drawMission() {
        const m = (S.reg && S.reg.mission) || { en: '', el: '' };
        const text = isEl() ? m.el : m.en;
        R.mission.replaceChildren(
          h('span', { class: 'ly-mk' }, SC.icon('flag')),
          h('p', null, h('b', null, T('Our mission.', 'Η αποστολή μας.')), ' ', text),
          isTeacher() ? h('button', { class: 'ly-edit', type: 'button', onclick: editMission }, T('Edit the mission', 'Επεξεργασία αποστολής')) : h('span', { class: 'ly-edit' }, T('Teachers can edit the mission', 'Οι εκπαιδευτικοί μπορούν να επεξεργαστούν την αποστολή')),
        );
      }
      function editMission() {
        const m = S.reg.mission;
        const en = h('textarea', { id: 'ly-m-en', maxlength: '400', rows: '4' }, m.en);
        const el = h('textarea', { id: 'ly-m-el', maxlength: '500', rows: '4', lang: 'el' }, m.el);
        const msg = h('div', { class: 'err', role: 'alert', hidden: true });
        const body = h('div', { class: 'ly-edit-f' },
          h('label', { for: 'ly-m-en' }, 'English'), en, h('label', { for: 'ly-m-el' }, 'Ελληνικά'), el, msg,
          h('p', { class: 'ly-fine' }, T('The mission is shown on this page and guides the master brain. Write it in both languages.', 'Η αποστολή εμφανίζεται σε αυτή τη σελίδα και καθοδηγεί τον κύριο εγκέφαλο. Γράψτε την και στις δύο γλώσσες.')));
        let close = null;
        const save = async () => {
          try { const r = await SC.api(API + '/mission', { method: 'PUT', body: { en: en.value, el: el.value } }); S.reg.mission = r.mission; drawMission(); SC.toast(T('Mission saved', 'Η αποστολή αποθηκεύτηκε')); if (close) close(); } catch (e) { msg.hidden = false; msg.textContent = errMsg(e); }
        };
        close = SC.modal({
          title: T('Edit the mission', 'Επεξεργασία αποστολής'), body,
          actions: [
            { label: T('Save', 'Αποθήκευση'), primary: true, run: null },
            { label: T('Back to the standard text', 'Επαναφορά στο κανονικό κείμενο'), run: async () => { try { const r = await SC.api(API + '/mission/reset', { method: 'POST', body: {} }); S.reg.mission = r.mission; drawMission(); SC.toast(T('Mission reset', 'Η αποστολή επανήλθε')); } catch (e) { SC.toast(errMsg(e)); } } },
            { label: T('Cancel', 'Άκυρο') },
          ],
        });
        // The first button is "Save": keep the dialog open when it fails, so it needs its own handler.
        const saveBtn = document.querySelector('.mod .nm-btn--primary');
        if (saveBtn) { const fresh2 = saveBtn.cloneNode(true); saveBtn.replaceWith(fresh2); fresh2.addEventListener('click', save); fresh2.focus(); }
      }

      /* ----- layer list ----- */
      R.list = h('section', { class: 'nm-card ly-br ly-list', 'aria-label': T('Layer list', 'Λίστα στρωμάτων') });
      function toggle(l) {
        if (!live(l)) return;
        if (S.off.has(l.id)) S.off.delete(l.id); else S.off.add(l.id);
        saveOff(S.off);
        drawList(); drawStage(); drawBrainLeft(); schedule();
      }
      function layerLabel(l) {
        const n = nameOf(l);
        return (l.group === 'own' || l.id === 'cydom-stations') && l.count > 0 ? n + ' (' + l.count + ')' : n;
      }
      function drawList() {
        const total = layers().length, liveN = layers().filter(live).length;
        const kids = [h('div', { class: 'ly-hd' }, h('b', null, T('The layers', 'Τα στρώματα')), h('span', null, T(total + ' known · ' + liveN + ' live', total + ' γνωστά · ' + liveN + ' ζωντανά')))];
        LIST_ORDER.forEach((g) => {
          const items = inGroup(g);
          if (!items.length) return;
          const n = items.filter(live).length, on = onCount(g);
          kids.push(h('div', { class: 'ly-grp ly-' + g },
            h('h4', null, T(GROUPS[g].en, GROUPS[g].el), h('small', null, T(on + ' of ' + n + ' on', on + ' από ' + n + ' ενεργά'))),
            items.map((l) => {
              const st = STATE[l.state] || STATE.off, locked = !live(l), checked = isOn(l);
              const sub = locked || l.state === 'late' ? (l.state === 'late' || l.state === 'down' ? (isEl() ? l.noteEl : l.note) : (isEl() ? l.taglineEl : l.tagline)) : (isEl() ? l.taglineEl : l.tagline);
              return h('div', { class: 'ly-row' + (locked ? ' ly-dim' : '') },
                h('button', { class: 'ly-tg', type: 'button', role: 'switch', 'aria-checked': checked ? 'true' : 'false', disabled: locked, 'aria-label': T('Read ' + nameOf(l) + ' in the findings', 'Ανάγνωση «' + nameOf(l) + '» στα ευρήματα'), onclick: () => toggle(l) }),
                h('button', { class: 'ly-nm', type: 'button', onclick: () => openLayer(l.id) }, layerLabel(l), l.kind === 'satellite' ? kindChip() : null, sub ? h('small', null, sub) : null),
                h('span', { class: 'ly-pl ' + st[2] }, T(st[0], st[1])));
            })));
        });
        kids.push(h('a', { class: 'ly-add', href: SOURCES_URL, target: '_blank', rel: 'noopener' }, '+ ', T('Suggest a source', 'Προτείνετε μια πηγή')));
        R.list.replaceChildren(...kids);
      }

      /* ----- the centre: stack, flat map, timeline ----- */
      R.stage = h('section', { class: 'nm-card ly-br ly-stagecard', 'aria-label': T('Layers stacked over Cyprus', 'Στρώματα στοιβαγμένα πάνω από την Κύπρο') });
      R.viewbox = h('div', { class: 'ly-viewbox' });
      R.cover = h('div', { class: 'ly-cover' });
      const seg = h('div', { class: 'nm-pillbar', role: 'tablist', 'aria-label': T('View', 'Προβολή') },
        [['stack', 'Stack', 'Στοίβα'], ['flat', 'Flat map', 'Επίπεδος χάρτης'], ['time', 'Timeline', 'Χρονολόγιο']].map(([id, en, el]) =>
          h('button', { type: 'button', role: 'tab', 'data-v': id, 'aria-selected': id === S.view ? 'true' : 'false', class: id === S.view ? 'on' : '', onclick: () => { S.view = id; seg.querySelectorAll('button').forEach((b) => { const on = b.dataset.v === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); drawStage(); } }, T(en, el))));
      R.stage.append(
        h('div', { class: 'ly-top' }, h('div', null, h('div', { class: 'ly-eb' }, T('Cyprus · layers stacked', 'Κύπρος · στρώματα στοιβαγμένα')),
          h('p', { 'data-ly': 'cap' })), seg),
        R.viewbox, R.cover);

      let stackParts = null, scale = 1, ro = null;
      function buildStack() {
        const inner = h('div', { class: 'ly-inner' });
        const brain = h('div', { class: 'ly-brain' }, h('div', { class: 'ly-orb' }, SC.icon('sparkle')), h('b', null, T('Master brain', 'Κύριος εγκέφαλος')), h('small', null, T('reads the layers that are on', 'διαβάζει τα στρώματα που είναι ενεργά')));
        const beams = h('div', { class: 'ly-beams' }, [-70, 0, 70].map((x) => h('span', { style: { left: x + 'px' } })));
        const stack = h('div', { class: 'ly-stack' });
        const planes = PLANE_ORDER.map((g, i) => {
          const pl = h('div', { class: 'ly-plane ly-' + g });
          pl.style.setProperty('--z', i * 130 + 'px');
          const corners = [[0, 0], [100, 0], [0, 100], [100, 100]].map(([x, y]) => h('i', { class: 'ly-cn', style: { left: x + '%', top: y + '%' } }));
          corners.forEach((c) => pl.append(c));
          stack.append(pl);
          const lab = h('div', { class: 'ly-lbl ly-' + g }, h('i'), h('span', null, '', h('small')));
          inner.append(lab);
          return { g, pl, corners, lab };
        });
        inner.prepend(brain, beams, stack);
        stackParts = { inner, planes };
        return inner;
      }
      function paintStack() {
        const on = groupOn();
        stackParts.planes.forEach(({ g, pl, lab }) => {
          pl.classList.toggle('ly-off', !on[g]);
          pl.querySelector('svg') && pl.querySelector('svg').remove();
          pl.prepend(planeSvg(g, on[g]));
          const names = inGroup(g).filter(isOn).map((l) => nameOf(l));
          const any = inGroup(g).some(live);
          lab.firstChild.nextSibling.firstChild.textContent = T(GROUPS[g].en, GROUPS[g].el);
          lab.querySelector('small').textContent = names.length ? names.join(', ') : any ? T('all switched off', 'όλα απενεργοποιημένα') : T('none connected yet', 'κανένα συνδεδεμένο ακόμη');
        });
      }
      function fitStack() {
        if (!stackParts) return;
        const w = R.viewbox.clientWidth || 760;
        const narrow = w < 560;   // on a phone the labels would be tiny: they are left out (the list above has the names) and the planes fill the width
        scale = narrow ? w / 560 : Math.min(1.1, w / 760);
        stackParts.inner.classList.toggle('ly-narrow', narrow);
        stackParts.inner.style.transform = 'scale(' + scale + ')';
        stackParts.inner.style.left = narrow ? '0px' : Math.max(0, (w - 760 * scale) / 2) + 'px';
        R.viewbox.style.height = Math.round(710 * scale) + 'px';
        // the labels sit at the right-most corner of each plane
        const ir = stackParts.inner.getBoundingClientRect();
        stackParts.planes.forEach(({ corners, lab }) => {
          let best = null;
          corners.forEach((c) => { const r = c.getBoundingClientRect(); if (!best || r.left > best.x) best = { x: r.left, y: r.top }; });
          if (!best) return;
          lab.style.left = (best.x - ir.left) / scale + 6 + 'px';
          lab.style.top = (best.y - ir.top) / scale - 14 + 'px';
        });
      }
      function drawFlat() {
        const on = groupOn();
        R.viewbox.style.height = '';
        R.viewbox.replaceChildren(h('div', { class: 'ly-flat' }, flatSvg(on),
          h('div', { class: 'ly-legend' }, LIST_ORDER.map((g) => h('span', { class: 'ly-' + g, style: { opacity: on[g] ? 1 : 0.55 } }, h('i'), T(GROUPS[g].en, GROUPS[g].el), ' · ', on[g] ? T('on', 'ενεργό') : T('off', 'ανενεργό'))),
            h('span', null, T('Schools are marked as circles. Vehicles are never drawn.', 'Τα σχολεία σημειώνονται με κύκλους. Τα οχήματα δεν σχεδιάζονται ποτέ.')))));
      }
      function drawTimeline() {
        R.viewbox.style.height = '';
        const rows = layers().filter((l) => l.status === 'active');
        const now = Date.now();
        R.viewbox.replaceChildren(h('div', { class: 'ly-tl', role: 'list' },
          rows.map((l) => {
            const age = l.lastAt ? now - l.lastAt : null;
            const pos = age == null ? null : 100 - Math.min(1, Math.max(0, age / (24 * HOUR))) * 100;
            return h('div', { class: 'ly-tl-r ly-' + l.group, role: 'listitem', style: { opacity: isOn(l) ? 1 : 0.5 } },
              h('span', { title: nameOf(l) }, nameOf(l)),
              h('div', { class: 'ly-tl-t' }, pos == null ? null : h('i', { style: { left: Math.min(98, Math.max(2, pos)) + '%' } }), h('em', null, l.lastAt ? SC.ago(l.lastAt) : T('no reading yet', 'καμία μέτρηση ακόμη'))));
          }),
          h('div', { class: 'ly-tl-ax' }, h('span'), h('div', null, h('span', null, T('24 hours ago', 'πριν 24 ώρες')), h('span', null, T('now', 'τώρα')))),
          h('p', { class: 'ly-fine' }, T('Each dot is the newest reading of that layer. Layers that are switched off are dimmed.', 'Κάθε τελεία είναι η πιο πρόσφατη μέτρηση του στρώματος. Τα απενεργοποιημένα στρώματα εμφανίζονται αχνά.'))));
      }
      function drawCover() {
        const c = (S.reg && S.reg.counts) || { total: 0 };
        const tot = Math.max(1, c.total), pc = (n) => Math.round((n / tot) * 1000) / 10 + '%';
        const bad = (c.down || 0) + (c.off || 0);
        R.cover.replaceChildren(
          h('div', null, h('div', { class: 'ly-bar', role: 'img', 'aria-label': T('Coverage of the known layers', 'Κάλυψη των γνωστών στρωμάτων') },
            h('i', { style: { width: pc(c.connected || 0), background: 'var(--nm-dot-ok)' } }), h('i', { style: { width: pc(bad), background: 'var(--nm-bad)' } }),
            h('i', { style: { width: pc(c.planned || 0), background: '#F2CF86' } }), h('i', { style: { width: pc(c.candidate || 0), background: 'rgba(255,255,255,.22)' } }))),
          h('a', { href: SOURCES_URL, onclick: (e) => { e.preventDefault(); howWeFind(); } }, T('How we find new layers', 'Πώς βρίσκουμε νέα στρώματα'), ' ↗'),
          h('div', { class: 'ly-nums' },
            h('span', null, h('b', null, c.connected || 0), ' ', T('live', 'ζωντανά')),
            bad ? h('span', null, h('b', null, bad), ' ', T('not answering', 'δεν απαντούν')) : null,
            h('span', null, h('b', null, c.planned || 0), ' ', T('planned', 'προγραμματισμένα')),
            h('span', null, h('b', null, c.candidate || 0), ' ', T(dayLine(c.candidate, 'candidate', 'candidates'), 'υποψήφια')),
            h('span', null, S.reg ? T('Checked ', 'Έλεγχος ') + SC.ago(S.reg.at) : '')));
      }
      function drawStage() {
        const cap = R.stage.querySelector('[data-ly="cap"]');
        cap.textContent = S.view === 'stack' ? T('Each plane is one group of layers over the same island. The brain at the top reads every plane that is on.', 'Κάθε επίπεδο είναι μια ομάδα στρωμάτων πάνω από το ίδιο νησί. Ο εγκέφαλος στην κορυφή διαβάζει κάθε επίπεδο που είναι ενεργό.')
          : S.view === 'flat' ? T('The same island seen from above. Only the groups that are on are drawn.', 'Το ίδιο νησί από ψηλά. Σχεδιάζονται μόνο οι ομάδες που είναι ενεργές.')
            : T('When each layer last gave us a reading.', 'Πότε έδωσε μέτρηση το κάθε στρώμα τελευταία φορά.');
        if (S.view === 'stack') {
          if (!stackParts) buildStack();
          if (R.viewbox.firstChild !== stackParts.inner) { R.viewbox.replaceChildren(stackParts.inner); }
          paintStack();
          requestAnimationFrame(fitStack);
        } else if (S.view === 'flat') drawFlat(); else drawTimeline();
        drawCover();
      }

      /* ----- the master brain band ----- */
      R.brain = h('section', { class: 'nm-card ly-br ly-bp', 'aria-label': T('Master brain', 'Κύριος εγκέφαλος') });
      R.left = h('div', { class: 'ly-bl' });
      R.right = h('div', { class: 'ly-right', 'aria-live': 'polite' });
      R.brain.append(R.left, R.right);
      let askInput = null, askBtn = null;
      function cityChips() {
        const list = S.cityList;
        return h('div', { class: 'ly-cities', role: 'tablist', 'aria-label': T('City', 'Πόλη') },
          list.map((c) => h('button', { class: 'ly-chip' + (S.city === c.id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': S.city === c.id ? 'true' : 'false', onclick: () => pickCity(c.id) }, c.name)),
          h('button', { class: 'ly-chip' + (S.city === 'all' ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': S.city === 'all' ? 'true' : 'false', onclick: () => pickCity('all') }, T('All four', 'Και οι τέσσερις')));
      }
      function readingLine() {
        const parts = [h('span', null, T('Reading', 'Διαβάζει'))];
        LIST_ORDER.forEach((g) => { parts.push(h('i', { class: 'ly-' + g, 'aria-hidden': 'true' }), h('span', { 'aria-label': T(GROUPS[g].en, GROUPS[g].el) }, String(onCount(g)))); });
        parts.push(h('span', null, T('layers on', 'ενεργά στρώματα')));
        return h('div', { class: 'ly-reading' }, parts);
      }
      function drawBrainLeft() {
        const configured = Boolean(S.reg && S.reg.brain && S.reg.brain.configured);
        const cityName = S.city === 'all' ? '' : (S.cityList.find((c) => c.id === S.city) || {}).name || '';
        askInput = h('input', { type: 'text', maxlength: '300', 'aria-label': T('Ask the master brain', 'Ρωτήστε τον κύριο εγκέφαλο'), placeholder: !configured ? T('Questions are off for now', 'Ερωτήσεις κλειστές') : S.city === 'all' ? T('Pick one city to ask', 'Διαλέξτε μια πόλη για να ρωτήσετε') : T('Ask about ' + cityName + '…', 'Ρωτήστε για ' + cityName + '…'), disabled: !configured || S.city === 'all', value: S.question, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(askInput.value); } } });
        askInput.addEventListener('input', () => { S.question = askInput.value; });
        askBtn = h('button', { type: 'button', disabled: !configured || S.city === 'all' || S.asking, onclick: () => ask(askInput.value) }, S.asking ? T('Reading…', 'Διαβάζω…') : T('Ask', 'Ρώτα'));
        R.left.replaceChildren(
          h('div', { class: 'ly-hd' }, h('span', { class: 'ly-mk' }, SC.icon('sparkle')), h('div', null, h('b', null, T('Master brain', 'Κύριος εγκέφαλος')), h('small', null, T('Findings for one city at a time', 'Ευρήματα για μία πόλη τη φορά')))),
          cityChips(), readingLine(),
          h('div', { class: 'ly-ask' },
            h('div', { class: 'ly-q' }, SC.icon('sparkle'), askInput, askBtn),
            h('div', { class: 'ly-sug' }, h('button', { type: 'button', onclick: () => pickCity('all') }, T('Compare the four cities', 'Συγκρίνετε τις τέσσερις πόλεις')),
              configured ? SUGGEST.map(([en, el]) => h('button', { type: 'button', disabled: S.city === 'all', onclick: () => ask(T(en, el)) }, T(en, el))) : null),
            !configured ? h('p', { class: 'ly-fine' }, T('Questions need the assistant to be switched on. The findings are still written from the layers.', 'Οι ερωτήσεις χρειάζονται ενεργό βοηθό. Τα ευρήματα γράφονται και πάλι από τα στρώματα.')) : null,
            h('p', { class: 'ly-fine' }, T('The brain only uses layers that are on, quotes its sources, and says “not enough data” when a layer is missing.', 'Ο εγκέφαλος χρησιμοποιεί μόνο στρώματα που είναι ενεργά, αναφέρει τις πηγές του και λέει «δεν υπάρχουν αρκετά δεδομένα» όταν λείπει ένα στρώμα.'))));
      }

      /* ----- findings ----- */
      function sourceChips(list) {
        return (list || []).map((s) => h('button', { type: 'button', class: 'ly-' + (s.group || 'own'), title: T('About this layer', 'Σχετικά με αυτό το στρώμα'), onclick: () => openLayer(s.id) }, (isEl() && s.nameEl) || s.name, s.kind === 'satellite' ? kindChip() : null));
      }
      function confidence(level) {
        const c = CONF[level] || CONF.low;
        return h('span', { class: 'ly-conf ' + level, title: T('How sure we are: decided by the code from how many independent sources agree', 'Πόσο σίγουροι είμαστε: το αποφασίζει ο κώδικας από το πόσες ανεξάρτητες πηγές συμφωνούν') },
          T(c[1], c[2]), h('u', { 'aria-hidden': 'true' }, [1, 2, 3].map((i) => h('i', { class: i <= c[0] ? 'f' : '' }))));
      }
      function findingCard(f) {
        const title = isEl() ? f.title.el : f.title.en, body = isEl() ? f.body.el : f.body.en;
        const why = (f.why || []).concat(f.caveats || []);
        const readings = (f.readings || []);
        const lic = (f.sources || []).filter((s) => s.licence).map((s) => ((isEl() && s.nameEl) || s.name) + ': ' + (s.licence === 'unknown' ? T('licence not confirmed', 'η άδεια δεν έχει επιβεβαιωθεί') : s.licence) + (s.attribution ? ' · ' + s.attribution : ''));
        return h('article', { class: 'ly-find' },
          h('h5', null, title),
          h('p', null, body),
          f.kind === 'differ' && f.spread != null ? h('div', { class: 'ly-warn' }, T('Sources differ by ' + f.spread + ' ' + unitIn(f) + '; we accept ' + (f.tolerance == null ? 'a small gap' : f.tolerance + ' ' + unitIn(f)) + ' as agreement.', 'Οι πηγές διαφέρουν κατά ' + f.spread + ' ' + unitIn(f) + '· δεχόμαστε ' + (f.tolerance == null ? 'μικρή διαφορά' : f.tolerance + ' ' + unitIn(f)) + ' ως συμφωνία.')) : null,
          h('div', { class: 'ly-src' }, sourceChips(f.sources), confidence(f.confidence)),
          (why.length || readings.length || lic.length) ? h('details', null,
            h('summary', null, T('How we got this', 'Πώς το βρήκαμε')),
            h('ul', null, why.map((x) => h('li', null, x)),
              readings.map((r) => { const l = layerById(r.source); return h('li', null, (l ? nameOf(l) : r.source) + ': ' + r.value + ' ' + r.unit + (r.ageMin != null ? ' · ' + (r.ageMin < 2 ? T('just now', 'μόλις τώρα') : T(r.ageMin + ' min ago', 'πριν ' + r.ageMin + ' λεπτά')) : '')); }),
              lic.map((x) => h('li', null, T('Licence ', 'Άδεια ') + x))),
            h('p', { class: 'ly-fine' }, f.by === 'ai' ? T('Wording by AI. Every number was checked against the readings.', 'Διατύπωση από ΤΝ. Κάθε αριθμός ελέγχθηκε με τις μετρήσεις.') : T('Standard wording written by the code, not by AI.', 'Τυπική διατύπωση από τον κώδικα, όχι από ΤΝ.'))) : null);
      }
      function gapCard(gaps) {
        if (!gaps || !gaps.length) return null;
        const shown = gaps.slice(0, 6);
        return h('article', { class: 'ly-find ly-gap' },
          h('h5', null, T('Not enough data', 'Δεν υπάρχουν αρκετά δεδομένα')),
          h('p', null, T('These layers are not feeding the brain for this city, so it will not guess about them:', 'Αυτά τα στρώματα δεν τροφοδοτούν τον εγκέφαλο για αυτή την πόλη, γι’ αυτό δεν θα μαντέψει γι’ αυτά:')),
          h('ul', { class: 'ly-fine', style: { paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '3px' } },
            shown.map((g) => { const w = GAP_WHY[g.kind] || GAP_WHY.candidate; return h('li', null, h('button', { type: 'button', class: 'ly-link', onclick: () => openLayer(g.layer) }, (isEl() && g.nameEl) || g.name), ': ', T(w[0], w[1])); }),
            gaps.length > shown.length ? h('li', null, T('and ' + (gaps.length - shown.length) + ' more', 'και ακόμη ' + (gaps.length - shown.length))) : null),
          h('a', { class: 'ly-btn', href: SOURCES_URL, target: '_blank', rel: 'noopener' }, T('Connect or suggest a layer', 'Συνδέστε ή προτείνετε ένα στρώμα')));
      }
      function answerCard(a, note) {
        if (note) return h('article', { class: 'ly-find ly-answer' }, h('h5', null, S.lastQuestion || T('Your question', 'Η ερώτησή σας')), h('p', null, note));
        const cites = (a.cites || []).map((id) => layerById(id)).filter(Boolean);
        return h('article', { class: 'ly-find ly-answer' },
          h('h5', null, S.lastQuestion || T('Your question', 'Η ερώτησή σας')),
          h('p', null, isEl() ? a.el : a.en),
          cites.length ? h('div', { class: 'ly-src' }, cites.map((l) => h('button', { type: 'button', class: 'ly-' + l.group, onclick: () => openLayer(l.id) }, nameOf(l)))) : null,
          h('p', { class: 'ly-fine' }, T('Written by AI from the layers that are on. Every number was checked against the readings.', 'Γράφτηκε από ΤΝ με βάση τα στρώματα που είναι ενεργά. Κάθε αριθμός ελέγχθηκε με τις μετρήσεις.')));
      }
      function drawRight() {
        if (!S.reg) { R.right.replaceChildren(h('div', { class: 'ly-skel' })); return; }
        if (S.city === 'all') { drawAll(); return; }
        const r = S.results.get(resultKey(S.city));
        const kids = [];
        if (S.answerNode) kids.push(S.answerNode);
        if (S.loading && !r) kids.push(h('div', { class: 'ly-wait' }, T('The brain is reading the layers…', 'Ο εγκέφαλος διαβάζει τα στρώματα…')), h('div', { class: 'ly-finds' }, h('div', { class: 'ly-skel' }), h('div', { class: 'ly-skel' })));
        else if (S.err) kids.push(h('div', { class: 'err', role: 'alert' }, S.err), btn('nm-btn', T('Try again', 'Δοκιμάστε ξανά'), () => fetchBrain(true)));
        else if (r) {
          const noLayers = r.layersRead.length === 0;
          kids.push(h('p', { class: 'ly-headline' }, noLayers ? T('No layer is switched on, so there is nothing to read.', 'Κανένα στρώμα δεν είναι ενεργό, άρα δεν υπάρχει τι να διαβαστεί.') : (isEl() ? r.headline.el : r.headline.en)));
          const cards = (r.findings || []).map(findingCard), gap = gapCard(r.gaps);
          kids.push(h('div', { class: 'ly-finds' }, cards, gap));
        }
        R.right.replaceChildren(...kids);
      }
      function drawAll() {
        const kids = [h('p', { class: 'ly-headline' }, T('The four cities side by side, each from the layers that are on.', 'Οι τέσσερις πόλεις δίπλα-δίπλα, η καθεμία από τα στρώματα που είναι ενεργά.'))];
        const cards = S.cityList.map((c) => {
          const r = S.results.get(resultKey(c.id));
          if (!r) return h('article', { class: 'ly-find' }, h('h5', null, c.name), h('div', { class: 'ly-wait' }, T('Reading the layers…', 'Διαβάζω τα στρώματα…')), h('div', { class: 'ly-skel' }));
          if (r.error) return h('article', { class: 'ly-find' }, h('h5', null, c.name), h('p', null, r.error));
          return h('article', { class: 'ly-find' },
            h('h5', null, c.name),
            h('p', null, isEl() ? r.headline.el : r.headline.en),
            h('ul', { class: 'ly-fine', style: { paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' } },
              (r.findings || []).slice(0, 3).map((f) => h('li', null, (isEl() ? f.title.el : f.title.en), ' ', h('span', { class: 'ly-conf ' + f.confidence, style: { marginLeft: '4px' } }, T((CONF[f.confidence] || CONF.low)[1], (CONF[f.confidence] || CONF.low)[2])))),
              (r.gaps || []).length ? h('li', null, T((r.gaps.length) + ' layers missing for this city', 'λείπουν ' + r.gaps.length + ' στρώματα για αυτή την πόλη')) : null),
            btn('ly-btn', T('Open ' + c.name, 'Άνοιγμα: ' + c.name), () => pickCity(c.id)));
        });
        kids.push(h('div', { class: 'ly-finds' }, cards));
        R.right.replaceChildren(...kids);
      }

      /* ----- calls to the brain ----- */
      const resultKey = (city) => city + '|' + onIds().join(',');
      let debounce = 0;
      function schedule() { clearTimeout(debounce); debounce = setTimeout(() => { S.answerNode = null; fetchBrain(false); }, 450); }
      timers.push(() => clearTimeout(debounce));
      async function brainFor(city) {
        const key = resultKey(city);
        if (S.results.has(key)) return S.results.get(key);
        const ids = onIds();
        const r = ids.length ? await SC.api(API + '/brain', { method: 'POST', body: { city, layers: ids } }) : { city, layersRead: [], findings: [], gaps: [], headline: { en: '', el: '' } };
        S.results.set(key, r);
        if (S.results.size > 40) S.results.delete(S.results.keys().next().value);
        return r;
      }
      async function fetchBrain(force) {
        if (!S.reg) return;
        const tok = ++S.brainTok;
        S.err = null;
        if (force) for (const k of [...S.results.keys()]) S.results.delete(k);
        const cities = S.city === 'all' ? S.cityList.map((c) => c.id) : [S.city];
        if (cities.every((c) => S.results.has(resultKey(c)))) { S.loading = false; drawRight(); return; }
        S.loading = true; drawRight();
        await Promise.all(cities.map(async (c) => {
          try { await brainFor(c); } catch (e) { if (S.city === 'all') S.results.set(resultKey(c), { error: errMsg(e) }); else if (tok === S.brainTok) S.err = errMsg(e); }
        }));
        if (dead || tok !== S.brainTok) return;
        S.loading = false; drawRight();
      }
      function pickCity(id) {
        if (S.city === id) return;
        S.city = id; S.answerNode = null; S.err = null; S.lastQuestion = '';
        drawBrainLeft(); fetchBrain(false);
      }
      async function ask(q) {
        q = String(q || '').trim();
        if (S.asking || S.city === 'all') return;
        if ([...q].length < 6) { SC.toast(T('Write a few more words, then ask.', 'Γράψτε λίγες λέξεις ακόμη και ρωτήστε.')); return; }
        if (!onIds().length) { SC.toast(T('Switch a layer on first.', 'Ενεργοποιήστε πρώτα ένα στρώμα.')); return; }
        S.asking = true; S.question = q; S.lastQuestion = q; drawBrainLeft();
        try {
          const r = await SC.api(API + '/brain', { method: 'POST', body: { city: S.city, layers: onIds(), question: q } });
          S.answerNode = r.answer ? answerCard(r.answer) : answerCard(null, (isEl() && r.noteEl) || r.note || T('The brain could not answer that.', 'Ο εγκέφαλος δεν μπόρεσε να το απαντήσει.'));
        } catch (e) {
          S.answerNode = answerCard(null, e.body && e.body.code === 'not_configured' ? T('Questions need the assistant to be switched on. The findings are still written from the layers.', 'Οι ερωτήσεις χρειάζονται ενεργό βοηθό. Τα ευρήματα γράφονται και πάλι από τα στρώματα.') : e.status === 429 ? T('Too many questions for now. Try again in a little while.', 'Πάρα πολλές ερωτήσεις προς το παρόν. Δοκιμάστε ξανά σε λίγο.') : errMsg(e));
        }
        S.asking = false; drawBrainLeft(); drawRight();
      }

      /* ----- a layer in a dialog ----- */
      async function openLayer(id) {
        const known = layerById(id);
        const body = h('div', { class: 'ly-det' }, h('p', { class: 'ly-wait' }, T('Loading…', 'Φόρτωση…')));
        SC.modal({ title: known ? nameOf(known) : id, body, actions: [{ label: T('Close', 'Κλείσιμο'), primary: true }] });
        try {
          const r = await SC.api(API + '/layers/' + encodeURIComponent(id));
          const s = r.layer, st = r.status, i18n = (s.i18n && s.i18n.el) || {};
          const row = (k, v) => (v == null || v === '' ? null : [h('dt', null, k), h('dd', null, v)]);
          const link = (u) => (u ? h('a', { href: u, target: '_blank', rel: 'noopener' }, u.replace(/^https?:\/\//, '').slice(0, 60)) : null);
          const stt = STATE[(known && known.state) || st.state] || STATE.off;
          const sat = h('div', { class: 'ly-sat-slot' });   // the satellite pictures of this layer, when its feed has any
          body.replaceChildren(
            h('p', null, isEl() && i18n.summary ? i18n.summary : s.summary),
            sat,
            h('dl', null,
              row(T('Group', 'Ομάδα'), T(GROUPS[s.layer].en, GROUPS[s.layer].el)),
              row(T('Status', 'Κατάσταση'), T(stt[0], stt[1]) + (st.note ? ' · ' + (isEl() ? st.noteEl : st.note) : '')),
              row(T('Last reading', 'Τελευταία μέτρηση'), st.at ? SC.ago(st.at) : null),
              row(T('Publisher', 'Εκδότης'), s.publisher && s.publisher.name),
              row(T('Licence', 'Άδεια'), s.licence && (s.licence.id === 'unknown' ? T('not confirmed yet', 'δεν έχει επιβεβαιωθεί ακόμη') : s.licence.id) + (s.licence && s.licence.attribution ? ' · ' + s.licence.attribution : '')),
              row(T('Measures', 'Μετρά'), (s.variables || []).map((v) => { const lb = r.varLabels && r.varLabels[v.id]; return lb ? lb[isEl() ? 1 : 0] : v.id.replace(/_/g, ' '); }).join(', ')),
              row(T('Kind of data', 'Είδος δεδομένων'), r.kindLabel ? r.kindLabel[isEl() ? 1 : 0] : null),
              row(T('Where it is from', 'Από πού προέρχεται'), link(s.publisher && s.publisher.url) || link(s.access && s.access.url)),
              row(T('Limits', 'Όρια'), s.representativeness && s.representativeness.notes ? s.representativeness.notes : null)),
            isTeacher() && (r.warnings || []).length ? h('div', { class: 'ly-warn' }, T('For teachers: ', 'Για εκπαιδευτικούς: ') + r.warnings.map((w) => w.replace(/^\$[^:]*:\s*/, '')).join(' ')) : '');   // not null: replaceChildren(null) would write the word "null" into the dialog
          SC.cached('/api/satellite/images', 60000).then((d) => { const strip = satelliteStrip(((d && d.images) || []).filter((im) => im.feed === id)); if (strip) sat.append(strip); }).catch(() => { /* no pictures: nothing to draw */ });
        } catch (e) { body.replaceChildren(h('div', { class: 'err', role: 'alert' }, errMsg(e))); }
      }
      function howWeFind() {
        SC.modal({
          title: T('How we find new layers', 'Πώς βρίσκουμε νέα στρώματα'),
          body: h('div', { class: 'ly-det' },
            h('p', null, T('Every layer is one small file in the sources folder of our code. It says who publishes the data, the licence, how often it changes, what it measures and where it is not representative.', 'Κάθε στρώμα είναι ένα μικρό αρχείο στον φάκελο sources του κώδικά μας. Λέει ποιος δημοσιεύει τα δεδομένα, την άδεια, πόσο συχνά αλλάζουν, τι μετρούν και πού δεν είναι αντιπροσωπευτικά.')),
            h('p', null, T('Anyone on the team can suggest a source by adding a file. A checker refuses a file that guesses a licence or copies a provider’s text. A teacher reads it before it joins. It starts as a candidate, and becomes live once someone writes the connection that reads it.', 'Οποιοσδήποτε στην ομάδα μπορεί να προτείνει μια πηγή προσθέτοντας ένα αρχείο. Ένας έλεγχος απορρίπτει αρχείο που μαντεύει άδεια ή αντιγράφει κείμενο του εκδότη. Ένας εκπαιδευτικός το διαβάζει πριν ενταχθεί. Ξεκινά ως υποψήφιο και γίνεται ζωντανό όταν κάποιος γράψει τη σύνδεση που το διαβάζει.')),
            h('p', null, h('a', { href: SOURCES_URL, target: '_blank', rel: 'noopener' }, T('Open the sources folder', 'Άνοιγμα του φακέλου sources')), ' ↗')),
        });
      }

      /* ----- load ----- */
      function paintAll() {
        const c = S.reg.counts;
        setPill(T(c.connected + ' of ' + c.total + ' layers connected', c.connected + ' από ' + c.total + ' στρώματα συνδεδεμένα') + (c.checking ? T(' · checking ' + c.checking, ' · έλεγχος ' + c.checking) : ''));
        drawMission(); drawList(); drawStage(); drawBrainLeft();
      }
      function setRegister(reg) {
        S.reg = reg;
        S.cityList = Object.keys(reg.places || {}).map((id) => ({ id, name: placeName(reg.places[id].name) }));
        if (!S.cityList.find((c) => c.id === S.city) && S.city !== 'all') S.city = (S.cityList[0] || {}).id || 'larnaka';
      }
      let recheck = 0;
      async function load(first) {
        try {
          const reg = await SC.api(API + '/register');
          if (dead) return;
          const before = first ? '' : onIds().join(',');
          setRegister(reg);
          if (first && ctx.query && ctx.query.city && S.cityList.find((c) => c.id === ctx.query.city)) S.city = ctx.query.city;
          paintAll();
          // a source that was slow to answer is still being checked on the server: ask again soon
          if (reg.counts && reg.counts.checking > 0 && recheck++ < 6) { const t = setTimeout(() => load(false), 3500); timers.push(() => clearTimeout(t)); }
          if (first || before !== onIds().join(',')) fetchBrain(false); else drawRight();
        } catch (e) {
          if (dead) return;
          if (first) {
            R.right.replaceChildren(h('div', { class: 'err', role: 'alert' }, errMsg(e)), btn('nm-btn', T('Try again', 'Δοκιμάστε ξανά'), () => load(true)));
            setPill(T('Layers unavailable', 'Τα στρώματα δεν είναι διαθέσιμα'));
          }
        }
      }
      // A demo tag only when the site is running on sample data.
      SC.api('/api/config').then((c) => { if (!dead && c && (c.demo === true || c.mode === 'demo')) demoTag.style.display = ''; }).catch(() => { /* no tag */ });

      root.append(head, R.mission, h('div', { class: 'ly-work' }, R.list, R.stage), R.brain);
      drawBrainLeft(); drawRight();
      R.list.replaceChildren(h('div', { class: 'ly-skel', style: { height: '420px' } }));
      load(true);
      const poll = setInterval(() => { if (!document.hidden) load(false); }, 60000);
      timers.push(() => clearInterval(poll));
      if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (S.view === 'stack') fitStack(); }); ro.observe(R.viewbox); }
      const onResize = () => { if (S.view === 'stack') fitStack(); };
      window.addEventListener('resize', onResize);

      return () => { dead = true; timers.forEach((t) => t()); if (ro) ro.disconnect(); window.removeEventListener('resize', onResize); };
    },
  });
})();
