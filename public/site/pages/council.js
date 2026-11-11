/*
  Council room: six AI role-play seats argue a city decision from our (public) data, a Chair scores the options, a teacher decides what is published.
    #/council            ask a question, watch the seats and the Chair stream in, read published sessions, (teachers) review the queue
  API (SRV-F, mounted at /council/*):
    GET  /council/api/status                    { enabled, remaining, limit, seats:[{id,name:[en,el],focus:[en,el]}] }
    POST /council/api/ask {question}            streamed, one JSON object per line:
                                                  {type:'seat', id, stance:'support'|'oppose'|'mixed', text, dataUsed:[...]}
                                                  {type:'chair', scores:[{option,score,why}], verdict, risks, needs:[...]}
                                                  {type:'done', sessionId}      ({type:'error', message} on a failure)
    GET  /council/api/sessions?scope=public|review|mine
    POST /council/api/sessions/<id>/review {decision:'publish'|'reject', note}     (teacher or admin)
  Everything on this page is AI role-play and is labelled so. The page only shows what the server sends: no number is made up here.
  The list endpoints are read tolerantly (an array, or {sessions:[...]} or {items:[...]}; a session may carry its seats and chair).
  Privacy: nothing here is a position; coordinates in AI text are hidden if one ever slips through. No names are shown, only team labels the server sends.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/council.css');
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICON = {
    leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c2-5 5-8 9-10"/>',
    heart: '<path d="M12 20s-7-4.6-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.4-7 10-7 10z"/>',
    coin: '<path d="M16.5 8.2a5 5 0 100 7.6"/><path d="M6.5 10.5h7M6.5 13.5h7"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    help: '<path d="M9.2 9.3a2.9 2.9 0 114.2 2.6c-1 .6-1.4 1.1-1.4 2.2M12 17.6v.4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.4"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14.3c2 .7 3.5 2.6 3.5 5.7"/>',
  };
  function ic(name, size) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  const SEAT_UI = {
    environment: { c: '#7BC47F', ic: 'leaf' }, health: { c: '#E3A6C2', ic: 'heart' }, transport: { c: '#4CCBEA', ic: 'bus' },
    economy: { c: '#C9A25A', ic: 'coin' }, planning: { c: '#B28CF0', ic: 'map' }, youth: { c: '#E07F3F', ic: 'cap' },
  };
  const FALLBACK_SEATS = [
    { id: 'environment', name: ['Environment', 'Περιβάλλον'], focus: ['Air, noise and heat', 'Αέρας, θόρυβος και ζέστη'] },
    { id: 'health', name: ['Health', 'Υγεία'], focus: ['Lungs and hearts', 'Πνεύμονες και καρδιά'] },
    { id: 'transport', name: ['Transport', 'Μεταφορές'], focus: ['Buses and roads', 'Λεωφορεία και δρόμοι'] },
    { id: 'economy', name: ['Economy', 'Οικονομία'], focus: ['Cost and shops', 'Κόστος και καταστήματα'] },
    { id: 'planning', name: ['Planning', 'Πολεοδομία'], focus: ['Roads and rules', 'Δρόμοι και κανόνες'] },
    { id: 'youth', name: ['Youth', 'Νέοι'], focus: ['The students\' view', 'Η οπτική των μαθητών'] },
  ];
  const EXAMPLES = [
    ['Should the school buses switch to electric?', 'Να γίνουν ηλεκτρικά τα σχολικά λεωφορεία;'],
    ['Close the street outside the school at drop-off?', 'Να κλείνει ο δρόμος έξω από το σχολείο την ώρα της άφιξης;'],
    ['Should the school bus avoid the city centre between 7:30 and 8:30 for four weeks?', 'Να αποφεύγει το σχολικό λεωφορείο το κέντρο της πόλης από τις 7:30 έως τις 8:30 για τέσσερις εβδομάδες;'],
    ['Should we plant trees along the road to the school gate?', 'Να φυτέψουμε δέντρα στον δρόμο προς την είσοδο του σχολείου;'],
  ];
  const STANCE = {
    support: { cls: 'ok', ic: 'check', en: 'For', el: 'Υπέρ' },
    oppose: { cls: 'bad', ic: 'x', en: 'Against', el: 'Κατά' },
    mixed: { cls: 'warn', ic: 'help', en: 'Mixed', el: 'Μικτή στάση' },
  };

  /* ---------- text: plain paragraphs, "-" lists, **bold**; never HTML. A coordinate pair is hidden if one ever slips through. ---------- */
  const PAIR = /(-?\d{1,3}\.(\d{2,}))\s*[,;/]\s*(-?\d{1,3}\.(\d{2,}))/g;
  const inCyprus = (a, b) => (a >= 34 && a <= 36 && b >= 32 && b <= 35) || (b >= 34 && b <= 36 && a >= 32 && a <= 35);
  const scrub = (text) => String(text == null ? '' : text).replace(PAIR, (all, a, da, b, db) => (inCyprus(parseFloat(a), parseFloat(b)) ? T('(position hidden)', '(η θέση αποκρύπτεται)') : all));
  function inline(s, parent) { s.split(/(\*\*[^*]+\*\*)/).forEach((p) => { if (/^\*\*[^*]+\*\*$/.test(p)) parent.append(el('b', null, p.slice(2, -2))); else if (p) parent.append(p); }); }
  function renderText(text, cls) {
    const box = el('div', { class: cls || 'cn-text' });
    let list = null;
    scrub(text).replace(/\r/g, '').split('\n').forEach((line) => {
      const li = /^\s*[-*•]\s+(.*)$/.exec(line);
      if (li) { if (!list) { list = el('ul'); box.append(list); } const x = el('li'); inline(li[1], x); list.append(x); return; }
      list = null;
      if (!line.trim()) return;
      const p = el('p'); inline(line.replace(/^#+\s*/, ''), p); box.append(p);
    });
    return box;
  }

  /* ---------- reading what the server sends, tolerantly ---------- */
  const toMs = (v) => { if (fin(v)) return v < 1e11 ? v * 1000 : v; const t = Date.parse(v); return isFinite(t) ? t : 0; };
  const asList = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
  const stanceOf = (v) => { v = String(v || '').toLowerCase(); return /^(support|for|yes|pro|agree)/.test(v) ? 'support' : /^(oppose|against|no|con|disagree)/.test(v) ? 'oppose' : 'mixed'; };
  function dataItem(d) {
    if (d == null) return null;
    if (typeof d === 'string' || typeof d === 'number') return { label: String(d), value: null, unit: '', source: '' };
    if (typeof d === 'object') { const label = String(d.label || d.name || d.title || d.id || d.what || ''); if (!label && d.value == null) return null; return { label, value: d.value != null ? d.value : null, unit: String(d.unit || ''), source: String(d.source || d.src || '') }; }
    return null;
  }
  const dataText = (i) => (i.value != null ? (i.label ? i.label + ': ' : '') + i.value + (i.unit ? ' ' + i.unit : '') : i.label) + (i.source && i.value != null ? ' (' + i.source + ')' : '');
  function normSeat(x, id) {
    const s = x && x.seat && typeof x.seat === 'object' ? Object.assign({}, x, x.seat) : x || {};
    return { id: String(id || s.id || s.seat || ''), stance: stanceOf(s.stance), text: String(s.text || s.argument || s.say || ''), dataUsed: asList(s.dataUsed || s.data_used || s.data).map(dataItem).filter(Boolean), score: fin(Number(s.score)) && s.score != null ? Number(s.score) : null };
  }
  function normChair(x) {
    const c = x && x.chair && typeof x.chair === 'object' ? Object.assign({}, x, x.chair) : x || {};
    let sc = c.scores;
    if (sc && !Array.isArray(sc) && typeof sc === 'object') sc = Object.keys(sc).map((k) => (typeof sc[k] === 'object' ? Object.assign({ option: k }, sc[k]) : { option: k, score: sc[k] }));
    const scores = asList(sc).map((o) => ({ option: String((o && (o.option || o.name || o.label)) || ''), score: Number(o && o.score), why: String((o && (o.why || o.reason)) || '') })).filter((o) => o.option && fin(o.score));
    return { scores, verdict: String(c.verdict || c.summary || ''), risks: asList(c.risks).map(String).filter(Boolean), needs: asList(c.needs || c.missing).map(String).filter(Boolean) };
  }
  function normStatus(v) { v = String(v || '').toLowerCase(); return /publish|approved/.test(v) ? 'published' : /reject|declin|send_back/.test(v) ? 'rejected' : 'pending'; }
  function normSession(x) {
    const seats = {};
    if (Array.isArray(x.seats)) x.seats.forEach((s) => { const n = normSeat(s); if (n.id) seats[n.id] = n; });
    else if (x.seats && typeof x.seats === 'object') Object.keys(x.seats).forEach((k) => { seats[k] = normSeat(x.seats[k], k); });
    const hasChair = x.chair || x.verdict || x.scores;
    return { id: x.id != null ? String(x.id) : null, question: String(x.question || ''), at: toMs(x.at || x.created_at || x.createdAt || x.ts), status: normStatus(x.status), seats,
      chair: hasChair ? normChair(x.chair ? x : { chair: x }) : null, by: x.author_label || x.asked_by || x.by || null, school: x.school || null, note: x.note || x.review_note || '', done: true, live: false };
  }
  const listOf = (r) => (Array.isArray(r) ? r : r && Array.isArray(r.sessions) ? r.sessions : r && Array.isArray(r.items) ? r.items : []);
  const counts = (m) => { const c = { support: 0, mixed: 0, oppose: 0 }; Object.keys(m.seats).forEach((k) => { c[m.seats[k].stance]++; }); return c; };

  // A calm sentence for a limit, with the time the next question frees up.
  function limitText(code, b) {
    const at = b && b.retry_at ? Number(b.retry_at) : b && b.retry_after ? Date.now() + Number(b.retry_after) * 1000 : 0;
    const when = at ? (SC.date(at) === SC.date(Date.now()) ? T('at ', 'στις ') : T('tomorrow at ', 'αύριο στις ')) + SC.time(at) : '';
    const lim = b && b.limit;
    if (code === 'rate') return T('You are asking quickly. Please wait a moment' + (at ? ' (until ' + SC.time(at) + ')' : '') + ', then ask again.', 'Ρωτάτε πολύ γρήγορα. Περιμένετε λίγο' + (at ? ' (μέχρι τις ' + SC.time(at) + ')' : '') + ' και ρωτήστε ξανά.');
    if (code === 'ip') return T('Many questions came from this network today. ' + (when ? 'You can ask again ' + when + ' (Cyprus time).' : 'Please try again later.'), 'Πολλές ερωτήσεις ήρθαν σήμερα από αυτό το δίκτυο. ' + (when ? 'Μπορείτε να ρωτήσετε ξανά ' + when + ' (ώρα Κύπρου).' : 'Δοκιμάστε ξανά αργότερα.'));
    if (code === 'global') return T('The council is resting because everyone together used the daily limit. ' + (when ? 'It is free again ' + when + ' (Cyprus time).' : 'Please try again later.'), 'Το συμβούλιο ξεκουράζεται επειδή όλοι μαζί χρησιμοποίησαν το ημερήσιο όριο. ' + (when ? 'Θα είναι ξανά διαθέσιμο ' + when + ' (ώρα Κύπρου).' : 'Δοκιμάστε ξανά αργότερα.'));
    return T('You have used all ' + (lim || 'your') + ' questions for today. ' + (when ? 'You can ask again ' + when + ' (Cyprus time).' : 'They come back later today.'), 'Χρησιμοποιήσατε ' + (lim ? 'τις ' + lim : 'όλες τις') + ' ερωτήσεις σας για σήμερα. ' + (when ? 'Μπορείτε να ρωτήσετε ξανά ' + when + ' (ώρα Κύπρου).' : 'Επιστρέφουν αργότερα σήμερα.'));
  }

  SC.register('council', {
    title: ['Council room', 'Αίθουσα συμβουλίου'],
    render(root, ctx) {
      const S = { status: null, statusErr: null, cfg: null, busy: false, ctrl: null, note: null, again: false, text: '' };
      const L = { pub: { st: 'loading', items: [] }, review: { st: 'idle', items: [] }, mine: { st: 'idle', items: [] } };
      let M = null;   // the session on screen: { id, question, at, status, seats:{id:seat}, chair, done, live, fresh:Set }
      let alive = true;
      const teacher = () => Boolean(SC.me && (SC.me.role === 'teacher' || SC.me.role === 'admin'));
      const seatsMeta = () => (S.status && Array.isArray(S.status.seats) && S.status.seats.length ? S.status.seats : FALLBACK_SEATS);
      const off = () => S.status && S.status.enabled === false;
      const left = () => (S.status && S.status.remaining != null ? Number(S.status.remaining) : null);
      const blocked = () => off() || left() === 0;

      const headHolder = el('div');
      const note = el('p', { class: 'nm-callout nm-callout--info cn-bar' }, el('b', null, T('The seats are AI role-plays written from our data.', 'Τα μέλη του συμβουλίου είναι παιχνίδια ρόλων ΤΝ γραμμένα από τα δεδομένα μας.')), ' ',
        T('They do not decide, and this is AI role-play, not advice. A teacher approves what the class publishes.', 'Δεν αποφασίζουν και πρόκειται για παιχνίδι ρόλων ΤΝ, όχι συμβουλή. Ένας εκπαιδευτικός εγκρίνει ό,τι δημοσιεύει η τάξη.'));
      const qBox = el('section', { class: 'nm-card cn-q', 'aria-labelledby': 'cn-qh' });
      const resBox = el('div', { class: 'cn-res' });
      const needBox = el('div');
      const queueBox = el('section', { class: 'cn-sec' });
      const galBox = el('section', { class: 'cn-sec' });
      const mineBox = el('section', { class: 'cn-sec' });
      const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
      root.append(headHolder, note, qBox, resBox, needBox, queueBox, galBox, mineBox, live);

      function head() {
        headHolder.replaceChildren(SC.head({
          title: T('Council room', 'Αίθουσα συμβουλίου'),
          lede: T('Six seats argue one school question from our data. A Chair writes a verdict. A teacher decides.', 'Έξι μέλη συζητούν μια ερώτηση του σχολείου με βάση τα δεδομένα μας. Ένας πρόεδρος γράφει την κρίση. Ένας εκπαιδευτικός αποφασίζει.'),
          help: ['Type a decision a school or a city could face, or pick an example. Six AI seats (environment, health, transport, economy, planning and youth) each read our public data and argue it from their own point of view. You see them arrive one by one, with the readings each one used. Then the Chair scores the options, names the risks and says what data is missing. All of it is AI role-play, not advice. A teacher reads each session and publishes or rejects it; only published sessions are shown to everyone below. The number of questions you can ask each day is limited.',
            'Γράψτε μια απόφαση που θα μπορούσε να αντιμετωπίσει ένα σχολείο ή μια πόλη ή διαλέξτε ένα παράδειγμα. Έξι μέλη ΤΝ (περιβάλλον, υγεία, μεταφορές, οικονομία, πολεοδομία και νέοι) διαβάζουν τα δημόσια δεδομένα μας και επιχειρηματολογούν το καθένα από τη δική του σκοπιά. Τα βλέπετε να εμφανίζονται ένα ένα, με τις μετρήσεις που χρησιμοποίησε το καθένα. Μετά ο πρόεδρος βαθμολογεί τις επιλογές, αναφέρει τους κινδύνους και λέει ποια δεδομένα λείπουν. Όλα είναι παιχνίδι ρόλων ΤΝ, όχι συμβουλή. Ένας εκπαιδευτικός διαβάζει κάθε συνεδρία και τη δημοσιεύει ή την απορρίπτει· μόνο οι δημοσιευμένες φαίνονται σε όλους παρακάτω. Ο αριθμός των ερωτήσεων που μπορείτε να κάνετε κάθε μέρα είναι περιορισμένος.'],
          tags: [{ text: T('AI role-play', 'Παιχνίδι ρόλων ΤΝ'), cls: 'ai' }].concat(S.cfg && S.cfg.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : []),
        }));
      }
      head();

      /* ---------- the question card ---------- */
      function steps() {
        const nSeats = M ? Object.keys(M.seats).length : 0, all = seatsMeta().length;
        const seatsDone = M && (M.chair || (M.done && nSeats > 0) || (nSeats >= all));
        const chairDone = M && M.chair;
        const decided = M && (M.status === 'published' || M.status === 'rejected');
        const st = [
          [T('Question set', 'Η ερώτηση τέθηκε'), M ? 'done' : 'todo', 'check'],
          [T('Seats argued', 'Τα μέλη συζήτησαν'), seatsDone ? 'done' : M ? 'now' : 'todo', seatsDone ? 'check' : 'clock'],
          [T('Chair scored', 'Ο πρόεδρος βαθμολόγησε'), chairDone ? 'done' : seatsDone && M && !M.done ? 'now' : 'todo', chairDone ? 'check' : 'clock'],
          [M && M.status === 'rejected' ? T('Not published', 'Δεν δημοσιεύτηκε') : M && M.status === 'published' ? T('Published', 'Δημοσιεύτηκε') : T('Teacher approval', 'Έγκριση εκπαιδευτικού'), decided ? (M.status === 'rejected' ? 'no' : 'done') : chairDone ? 'now' : 'todo', decided ? (M.status === 'rejected' ? 'x' : 'check') : 'clock'],
        ];
        return el('ol', { class: 'cn-steps', 'aria-label': T('Progress', 'Πρόοδος') }, st.map(([t, c, i]) => el('li', { class: c }, el('i', null, ic(i)), t)));
      }
      function usagePill() {
        const rem = left(), lim = S.status && S.status.limit;
        if (rem == null) return null;
        const used = lim ? Math.max(0, lim - rem) : null, pct = used != null && lim ? Math.min(100, (used / lim) * 100) : 0;
        const meter = el('span', { class: 'cn-meter' + (pct >= 80 ? ' hot' : ''), role: 'img', 'aria-label': T(rem + ' questions left today', 'Απομένουν ' + rem + ' ερωτήσεις σήμερα') }, el('b'));
        meter.firstChild.style.width = pct + '%';
        return el('span', { class: 'cn-pill', title: T('Each visitor can ask this many questions a day', 'Κάθε επισκέπτης μπορεί να κάνει τόσες ερωτήσεις την ημέρα') },
          el('span', null, T('Questions left today: ', 'Ερωτήσεις που απομένουν σήμερα: '), el('b', null, lim ? rem + T(' of ', ' από ') + lim : String(rem))), meter);
      }
      let ta = null, askBtn = null;
      function paintQuestion() {
        const showForm = !M || S.again;
        const kids = [el('div', { class: 'cn-q-top' }, el('span', { class: 'cn-lab' }, el('span', { class: 'info' }, T('The question', 'Η ερώτηση')),
          M && !S.again && (M.by || M.at) ? el('span', { class: 'by' }, (M.by ? T('Asked by ', 'Ρωτήθηκε από ') + M.by + (M.at ? ', ' : '') : T('Asked ', 'Ρωτήθηκε ')) + (M.at ? SC.dateTime(M.at) : '')) : null), M ? steps() : null)];
        if (S.statusErr) {
          kids.push(el('div', { class: 'err', role: 'alert' }, T('The council room could not be reached. ', 'Η αίθουσα συμβουλίου δεν είναι προσβάσιμη. ') + (S.statusErr.message || '')),
            el('div', null, el('button', { type: 'button', class: 'nm-btn', onclick: () => start() }, T('Try again', 'Δοκιμάστε ξανά'))));
        }
        if (S.status && off()) kids.push(el('div', { class: 'nm-callout nm-callout--info cn-callout' }, el('b', null, T('The council is switched off for now.', 'Το συμβούλιο είναι προσωρινά απενεργοποιημένο.')), ' ', T('You can still read the sessions a teacher has published below. Please try again later, or ask a teacher.', 'Μπορείτε ακόμα να διαβάσετε παρακάτω τις συνεδρίες που έχει δημοσιεύσει ένας εκπαιδευτικός. Δοκιμάστε ξανά αργότερα ή ρωτήστε έναν εκπαιδευτικό.')));
        else if (S.status && left() === 0) kids.push(el('div', { class: 'nm-callout nm-callout--info cn-callout', role: 'status' }, S.note && S.note.kind === 'limit' ? S.note.text : limitText('daily', { limit: S.status.limit, retry_at: S.status.retry_at })));
        else if (S.note) kids.push(el('div', { class: 'nm-callout ' + (S.note.kind === 'stopped' || S.note.kind === 'limit' ? 'nm-callout--info' : 'nm-callout--warn') + ' cn-callout', role: 'status' }, S.note.text));
        if (showForm) {
          ta = el('textarea', { class: 'nm-input', rows: 2, maxlength: 400, id: 'cn-qh', placeholder: off() ? T('The council is switched off for now', 'Το συμβούλιο είναι προσωρινά απενεργοποιημένο') : T('Ask the council a decision, for example: Should the school buses switch to electric?', 'Ρωτήστε το συμβούλιο για μια απόφαση, για παράδειγμα: Να γίνουν ηλεκτρικά τα σχολικά λεωφορεία;'), 'aria-label': T('Your question for the council', 'Η ερώτησή σας προς το συμβούλιο') });
          ta.value = S.text || '';
          ta.disabled = blocked() || S.busy;
          askBtn = el('button', { type: 'submit', class: 'nm-btn nm-btn--primary' }, ic('send'), el('span', null, S.busy ? T('The council is meeting…', 'Το συμβούλιο συνεδριάζει…') : T('Ask the council', 'Ρωτήστε το συμβούλιο')));
          const sync = () => { S.text = ta.value; askBtn.disabled = S.busy ? false : blocked() || ta.value.trim().length < 8; if (S.busy) { askBtn.replaceChildren(ic('stop'), el('span', null, T('Stop', 'Διακοπή'))); } };
          ta.addEventListener('input', sync);
          ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
          const form = el('form', { class: 'cn-form' }, el('div', { class: 'cn-row' }, ta, askBtn),
            el('div', { class: 'cn-ex' }, el('span', { class: 'cn-lab', style: { margin: 0 } }, T('Try one of these', 'Δοκιμάστε ένα από αυτά')),
              EXAMPLES.map(([en, gr]) => el('button', { type: 'button', class: 'cn-chip', disabled: blocked() || S.busy ? true : null, onclick: () => { ta.value = T(en, gr); sync(); ta.focus(); } }, T(en, gr)))),
            el('div', { class: 'cn-use' }, usagePill()));
          form.addEventListener('submit', (e) => { e.preventDefault(); if (S.busy) { if (S.ctrl) S.ctrl.abort(); return; } ask(ta.value); });
          kids.push(form);
          sync();
        } else {
          kids.push(el('h2', { class: 'cn-qtext', id: 'cn-qh' }, M.question),
            el('div', { class: 'cn-q-act' }, el('button', { type: 'button', class: 'nm-btn', disabled: S.busy ? true : null, onclick: () => { S.again = true; S.note = null; S.text = ''; paintQuestion(); if (ta) ta.focus(); } }, ic('send'), T('Ask a new question', 'Νέα ερώτηση')),
              M.live ? null : el('span', { class: 'muted' }, T('This is a saved session, not a live answer.', 'Αυτή είναι αποθηκευμένη συνεδρία, όχι ζωντανή απάντηση.')), el('span', { class: 'cn-use' }, usagePill())),
            dataTiles());
        }
        fill(qBox, kids);
      }
      function dataTiles() {
        const seen = new Map();
        if (M) Object.keys(M.seats).forEach((k) => M.seats[k].dataUsed.forEach((d) => { const key = dataText(d); if (key && !seen.has(key)) seen.set(key, d); }));
        if (!seen.size) return null;
        return el('div', { class: 'cn-given' }, el('div', { class: 'cn-lab' }, T('Data the seats read', 'Δεδομένα που διάβασαν τα μέλη')),
          el('div', { class: 'cn-tiles' }, [...seen.values()].slice(0, 12).map((d) => el('div', { class: 'cn-tile' },
            d.value != null ? el('span', { class: 'l' }, d.label || '') : null,
            d.value != null ? el('span', { class: 'v' }, String(d.value), d.unit ? el('small', null, d.unit) : null) : el('span', { class: 'l txt' }, d.label),
            d.source || d.value != null ? el('span', { class: 's' }, el('i'), d.source || T('From our public data', 'Από τα δημόσια δεδομένα μας')) : null))));
      }

      /* ---------- the seats and the Chair ---------- */
      function seatCard(meta) {
        const ui = SEAT_UI[meta.id] || { c: '#8CA0B8', ic: 'users' };
        const s = M && M.seats[meta.id];
        const head2 = (badge) => el('header', null, el('span', { class: 'cn-ico' }, ic(ui.ic)), el('div', null, el('h3', null, T(meta.name[0], meta.name[1])), el('small', null, T(meta.focus[0], meta.focus[1]))), badge);
        const card = el('article', { class: 'nm-card cn-seat' + (s ? '' : ' wait'), 'aria-label': T(meta.name[0], meta.name[1]) });
        card.style.setProperty('--c', ui.c);
        if (!s) {
          const waiting = M && !M.done && S.busy;
          card.append(head2(null), waiting ? el('div', { class: 'cn-typing', role: 'status' }, el('i'), el('i'), el('i'), el('span', null, T('Reading the data…', 'Διαβάζει τα δεδομένα…')))
            : el('p', { class: 'cn-idle' }, M && M.done ? T('This seat gave no answer.', 'Αυτό το μέλος δεν έδωσε απάντηση.') : T('Waiting for a question. This seat looks at: ', 'Περιμένει μια ερώτηση. Αυτό το μέλος εξετάζει: ') + T(meta.focus[0], meta.focus[1]).toLowerCase() + '.'));
          return card;
        }
        const st = STANCE[s.stance];
        card.append(head2(el('span', { class: 'nm-badge nm-badge--' + st.cls }, ic(st.ic, 13), T(st.en, st.el))));
        if (s.score != null) {
          const n = Math.max(0, Math.min(10, Math.round(s.score)));
          card.append(el('div', { class: 'cn-sc' }, el('b', null, String(s.score)), el('em', null, '/10'), el('span', { class: 'pips', 'aria-hidden': 'true' }, Array.from({ length: 10 }, (_, i) => el('i', { class: i < n ? 'on' : '' })))));
        }
        card.append(renderText(s.text));
        card.append(el('footer', null, ic('sensor'), s.dataUsed.length ? el('span', null, el('b', null, T('Used: ', 'Χρησιμοποίησε: ')), s.dataUsed.map(dataText).join(' · ')) : el('span', null, T('Used no readings. It argued from general knowledge, so weigh it less.', 'Δεν χρησιμοποίησε μετρήσεις. Επιχειρηματολόγησε από γενικές γνώσεις, γι’ αυτό δώστε του λιγότερο βάρος.'))));
        return card;
      }
      function decide(kind) {
        if (!M || !M.id) return;
        const id = M.id, mine = M;
        const send = async (note) => {
          try {
            await SC.api('/council/api/sessions/' + encodeURIComponent(id) + '/review', { method: 'POST', body: { decision: kind, note: note || '' } });
            mine.status = kind === 'publish' ? 'published' : 'rejected';
            SC.toast(kind === 'publish' ? T('Published. Everyone can now read this session.', 'Δημοσιεύτηκε. Όλοι μπορούν πλέον να διαβάσουν αυτή τη συνεδρία.') : T('Rejected. It stays hidden.', 'Απορρίφθηκε. Παραμένει κρυφή.'));
            if (alive) { paintAll(); loadLists(); }
          } catch (e) { SC.toast(e.status === 403 ? T('Only teachers can do this.', 'Μόνο οι εκπαιδευτικοί μπορούν να το κάνουν.') : e.message || T('That did not work. Try again.', 'Δεν λειτούργησε. Δοκιμάστε ξανά.')); }
        };
        if (kind === 'publish') return send('');
        const noteIn = el('textarea', { class: 'nm-input', maxlength: 300, rows: 3, placeholder: T('Why? (optional, the class will not see it unless you share it)', 'Γιατί; (προαιρετικό, η τάξη δεν θα το δει αν δεν το μοιραστείτε)'), 'aria-label': T('Note', 'Σημείωση') });
        SC.modal({ title: T('Reject this session?', 'Απόρριψη αυτής της συνεδρίας;'), body: el('div', null, el('p', null, T('It will not be shown to visitors.', 'Δεν θα εμφανιστεί στους επισκέπτες.')), noteIn),
          actions: [{ label: T('Cancel', 'Ακύρωση') }, { label: T('Reject', 'Απόρριψη'), primary: true, run: () => send(noteIn.value) }] });
      }
      function chairCard() {
        const c = M && M.chair;
        const hd = el('div', { class: 'hd' }, el('span', { class: 'nm-icon-tile' }, ic('shield', 22)), el('div', null, el('h2', null, T('Chair verdict', 'Κρίση του προέδρου')), el('small', null, T('Reads all six seats, then scores', 'Διαβάζει και τα έξι μέλη και μετά βαθμολογεί'))));
        const card = el('section', { class: 'nm-card nm-card--glow cn-verdict' + (c ? '' : ' wait'), 'aria-label': T('Chair verdict', 'Κρίση του προέδρου') }, hd);
        if (!c) {
          card.append(M && !M.done && S.busy ? el('div', { class: 'cn-typing', role: 'status' }, el('i'), el('i'), el('i'), el('span', null, T('The Chair is waiting for the seats…', 'Ο πρόεδρος περιμένει τα μέλη…')))
            : el('p', { class: 'cn-idle' }, M && M.done ? T('The Chair did not give a verdict for this question. Try asking again.', 'Ο πρόεδρος δεν έδωσε κρίση για αυτή την ερώτηση. Δοκιμάστε να ρωτήσετε ξανά.') : T('After the six seats have spoken, the Chair scores the options, names the risks and says what data is missing.', 'Αφού μιλήσουν τα έξι μέλη, ο πρόεδρος βαθμολογεί τις επιλογές, αναφέρει τους κινδύνους και λέει ποια δεδομένα λείπουν.')),
            el('span', { class: 'nm-badge cn-ai' }, ic('alert', 14), T('AI role-play, not advice', 'Παιχνίδι ρόλων ΤΝ, όχι συμβουλή')));
          return card;
        }
        const stt = M.status === 'published' ? ['ok', 'check', T('Published by a teacher', 'Δημοσιεύτηκε από εκπαιδευτικό')] : M.status === 'rejected' ? ['bad', 'x', T('Not published', 'Δεν δημοσιεύτηκε')] : ['warn', 'clock', T('Waiting for teacher approval', 'Αναμονή έγκρισης εκπαιδευτικού')];
        card.append(el('span', { class: 'nm-badge nm-badge--' + stt[0] + ' cn-state' }, ic(stt[1], 14), stt[2]));
        if (c.verdict) {
          const m = /^(.+?[.!?…])(\s+[\s\S]*)?$/.exec(c.verdict.trim());
          card.append(el('p', { class: 'cn-lean' }, m ? m[1] : c.verdict), m && m[2] && m[2].trim() ? renderText(m[2].trim(), 'cn-act') : null);
        }
        if (c.scores.length) {
          const mx = Math.max(...c.scores.map((o) => o.score)), scale = mx <= 10 ? 10 : 100, top = c.scores.reduce((a, b) => (b.score > a.score ? b : a));
          card.append(el('div', { class: 'cn-opts' }, el('div', { class: 'cn-lab' }, T('Options, scored by the Chair', 'Επιλογές, βαθμολογημένες από τον πρόεδρο')),
            c.scores.map((o) => {
              const bar = el('span', { class: 'bar', role: 'img', 'aria-label': o.option + ': ' + o.score + '/' + scale }, el('i'));
              bar.firstChild.style.width = Math.max(2, Math.min(100, (o.score / scale) * 100)) + '%';
              return el('div', { class: 'cn-opt' + (o === top ? ' top' : '') }, el('div', { class: 'row' }, el('span', { class: 'n' }, o.option), el('b', null, SC.num(o.score, Number.isInteger(o.score) ? 0 : 1), el('small', null, '/' + scale))), bar, o.why ? el('p', null, scrub(o.why)) : null);
            })));
        }
        const cn = counts(M), tot = cn.support + cn.mixed + cn.oppose;
        if (tot) {
          const seg = (n, k) => { const i = el('i', { class: k }); i.style.flex = String(n || 0.0001); return n ? i : null; };
          card.append(el('div', { class: 'cn-stats' }, el('div', { class: 'cn-seg', role: 'img', 'aria-label': T(cn.support + ' for, ' + cn.mixed + ' mixed, ' + cn.oppose + ' against', cn.support + ' υπέρ, ' + cn.mixed + ' μικτή στάση, ' + cn.oppose + ' κατά') }, seg(cn.support, 'f'), seg(cn.mixed, 'u'), seg(cn.oppose, 'a')),
            el('div', { class: 'cn-seg-l' }, el('span', { class: 'f' }, el('b', null, cn.support), T(' For', ' Υπέρ')), el('span', { class: 'u' }, el('b', null, cn.mixed), T(' Mixed', ' Μικτή')), el('span', { class: 'a' }, el('b', null, cn.oppose), T(' Against', ' Κατά')),
              tot < seatsMeta().length ? el('span', { class: 'm' }, T('of ' + tot + ' seats heard', 'από ' + tot + ' μέλη που ακούστηκαν')) : null)));
        }
        const decideRow = el('div', { class: 'cn-decide' });
        const canDecide = teacher() && M.id && M.status === 'pending';
        if (teacher() && M.id) decideRow.append(el('button', { type: 'button', class: 'nm-btn nm-btn--primary', disabled: canDecide ? null : true, onclick: () => decide('publish') }, ic('check', 18), T('Publish', 'Δημοσίευση')),
          el('button', { type: 'button', class: 'nm-btn', disabled: canDecide ? null : true, onclick: () => decide('reject') }, T('Reject', 'Απόρριψη')));
        else decideRow.append(el('button', { type: 'button', class: 'nm-btn nm-btn--primary', disabled: true }, ic('check', 18), T('Publish', 'Δημοσίευση')), el('button', { type: 'button', class: 'nm-btn', disabled: true }, T('Reject', 'Απόρριψη')),
          el('span', { class: 'note' }, ic('lock', 14), T('Teachers only', 'Μόνο εκπαιδευτικοί')));
        card.append(decideRow, el('p', { class: 'cn-fine' }, M.status === 'pending' ? T('A teacher reads each session. Only published sessions are shown to everyone.', 'Ένας εκπαιδευτικός διαβάζει κάθε συνεδρία. Μόνο οι δημοσιευμένες εμφανίζονται σε όλους.') : M.note ? T('Teacher note: ', 'Σημείωση εκπαιδευτικού: ') + M.note : ''),
          el('span', { class: 'nm-badge cn-ai' }, ic('alert', 14), T('AI role-play, not advice', 'Παιχνίδι ρόλων ΤΝ, όχι συμβουλή')));
        return card;
      }
      function risksCard() {
        const c = M && M.chair;
        if (!c || !c.risks.length) return null;
        return el('section', { class: 'nm-card cn-lcard' }, el('div', { class: 'hd' }, el('span', { class: 'cn-ic warn' }, ic('alert')), el('h3', null, T('Risks', 'Κίνδυνοι'))), el('ul', { class: 'cn-lst' }, c.risks.map((r) => el('li', null, scrub(r)))));
      }
      function paintResult() {
        const fresh = M && M.fresh ? new Set(M.fresh) : new Set();
        if (M && M.fresh) M.fresh.clear();
        const metas = seatsMeta();
        const grid = el('div', { class: 'cn-seats' }, metas.map((m) => { const n = seatCard(m); if (fresh.has(m.id)) n.classList.add('nm-enter'); return n; }));
        const chair = chairCard(); if (fresh.has('chair')) chair.classList.add('nm-enter');
        fill(resBox, el('div', { class: 'cn-cgrid' }, el('section', { 'aria-label': T('The six seats', 'Τα έξι μέλη') },
          el('div', { class: 'cn-sec-h' }, el('span', { class: 'cn-lab info' }, T('Six seats', 'Έξι μέλη')), el('span', { class: 'm' }, M && Object.values(M.seats).some((s) => s.score != null) ? T('Score 1 to 10. A 10 means strongly for the change.', 'Βαθμολογία 1 έως 10. Το 10 σημαίνει έντονα υπέρ της αλλαγής.') : T('Each seat argues from its own point of view and shows the readings it used.', 'Κάθε μέλος επιχειρηματολογεί από τη δική του σκοπιά και δείχνει τις μετρήσεις που χρησιμοποίησε.'))), grid),
          el('aside', { class: 'cn-chair', 'aria-label': T('Chair verdict', 'Κρίση του προέδρου') }, chair, risksCard())));
        const c = M && M.chair;
        fill(needBox, c && c.needs.length ? el('section', { class: 'nm-card cn-lcard cn-mcard', 'aria-label': T('What data is missing', 'Ποια δεδομένα λείπουν') },
          el('div', { class: 'hd' }, el('span', { class: 'cn-ic info' }, ic('sensor')), el('h3', null, T('What data is missing', 'Ποια δεδομένα λείπουν')), el('span', { class: 'm' }, T('What we would need to measure to be surer', 'Τι θα χρειαζόταν να μετρήσουμε για να είμαστε πιο σίγουροι'))),
          el('ol', { class: 'cn-mgrid' }, c.needs.map((n, i) => el('li', null, el('i', null, String(i + 1)), el('span', null, scrub(n)))))) : null);
      }

      /* ---------- lists: published, review queue, mine ---------- */
      function sessCard(raw, kind) {
        const m = normSession(raw), cn = counts(m), tot = cn.support + cn.mixed + cn.oppose;
        const top = m.chair && m.chair.scores.length ? m.chair.scores.reduce((a, b) => (b.score > a.score ? b : a)) : null;
        const snippet = m.chair && m.chair.verdict ? m.chair.verdict.split(/(?<=[.!?…])\s/)[0] : '';
        const canOpen = Object.keys(m.seats).length > 0 || m.chair;
        const acts = [canOpen ? el('button', { type: 'button', class: 'nm-btn', onclick: () => openSession(m) }, T('Read the session', 'Διαβάστε τη συνεδρία')) : null];
        if (kind === 'review' && m.id) {
          acts.push(el('button', { type: 'button', class: 'nm-btn nm-btn--primary', onclick: () => quick(m, 'publish') }, ic('check', 16), T('Publish', 'Δημοσίευση')), el('button', { type: 'button', class: 'nm-btn', onclick: () => quick(m, 'reject') }, T('Reject', 'Απόρριψη')));
        }
        return el('article', { class: 'nm-card cn-sess' },
          el('div', { class: 'top' }, tot ? el('span', { class: 'cn-mini', role: 'img', 'aria-label': T(cn.support + ' for, ' + cn.mixed + ' mixed, ' + cn.oppose + ' against', cn.support + ' υπέρ, ' + cn.mixed + ' μικτή στάση, ' + cn.oppose + ' κατά') },
            el('i', { class: 'f' }), cn.support, el('i', { class: 'u' }), cn.mixed, el('i', { class: 'a' }), cn.oppose) : null,
            kind === 'mine' ? el('span', { class: 'nm-badge nm-badge--' + (m.status === 'published' ? 'ok' : m.status === 'rejected' ? 'bad' : 'warn') }, m.status === 'published' ? T('Published', 'Δημοσιεύτηκε') : m.status === 'rejected' ? T('Not published', 'Δεν δημοσιεύτηκε') : T('Waiting for a teacher', 'Αναμονή εκπαιδευτικού')) : null,
            el('span', { class: 'when' }, (m.by ? m.by + ', ' : '') + (m.at ? SC.dateTime(m.at) : ''))),
          el('h3', null, m.question || T('(no question text)', '(χωρίς κείμενο ερώτησης)')),
          snippet ? el('p', { class: 'v' }, scrub(snippet)) : null,
          top ? el('p', { class: 'o' }, T('Top option: ', 'Κορυφαία επιλογή: ') + top.option) : null,
          el('div', { class: 'acts' }, acts));
      }
      async function quick(m, kind) {
        const go = async (note) => {
          try { await SC.api('/council/api/sessions/' + encodeURIComponent(m.id) + '/review', { method: 'POST', body: { decision: kind, note: note || '' } }); SC.toast(kind === 'publish' ? T('Published', 'Δημοσιεύτηκε') : T('Rejected', 'Απορρίφθηκε')); loadLists(); }
          catch (e) { SC.toast(e.message || T('That did not work. Try again.', 'Δεν λειτούργησε. Δοκιμάστε ξανά.')); }
        };
        if (kind === 'publish') return go('');
        const noteIn = el('textarea', { class: 'nm-input', maxlength: 300, rows: 3, placeholder: T('Why? (optional)', 'Γιατί; (προαιρετικό)'), 'aria-label': T('Note', 'Σημείωση') });
        SC.modal({ title: T('Reject this session?', 'Απόρριψη αυτής της συνεδρίας;'), body: el('div', null, el('p', null, m.question), noteIn), actions: [{ label: T('Cancel', 'Ακύρωση') }, { label: T('Reject', 'Απόρριψη'), primary: true, run: () => go(noteIn.value) }] });
      }
      function openSession(m) {
        if (S.busy && S.ctrl) S.ctrl.abort();
        M = Object.assign({}, m, { fresh: new Set() });
        S.again = false; S.note = null;
        paintAll();
        qBox.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      }
      function listSection(box, L1, title, sub, empty, kind, retry) {
        const h = el('div', { class: 'cn-sec-h' }, el('h2', { class: 'card-h' }, title), el('span', { class: 'm' }, sub));
        if (L1.st === 'loading') return fill(box, h, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        if (L1.st === 'err') return fill(box, h, el('div', { class: 'err', role: 'alert' }, T('This list could not be loaded. ', 'Η λίστα δεν φορτώθηκε. ') + (L1.err && L1.err.message ? L1.err.message : '')), el('div', { style: { marginTop: '10px' } }, el('button', { type: 'button', class: 'nm-btn', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά'))));
        if (!L1.items.length) return fill(box, h, el('div', { class: 'empty' }, empty));
        fill(box, h, el('div', { class: 'cn-gal' }, L1.items.slice(0, 24).map((x) => sessCard(x, kind))));
      }
      function paintLists() {
        listSection(galBox, L.pub, T('Published sessions', 'Δημοσιευμένες συνεδρίες'), T('Read and approved by a teacher. Still AI role-play, not advice.', 'Διαβάστηκαν και εγκρίθηκαν από εκπαιδευτικό. Παραμένουν παιχνίδι ρόλων ΤΝ, όχι συμβουλή.'),
          T('No session has been published yet. Ask a question above: a teacher reads it and can publish it here.', 'Δεν έχει δημοσιευτεί ακόμα καμία συνεδρία. Κάντε μια ερώτηση παραπάνω: ένας εκπαιδευτικός τη διαβάζει και μπορεί να τη δημοσιεύσει εδώ.'), 'public', () => loadLists());
        if (teacher()) listSection(queueBox, L.review, T('Review queue', 'Ουρά ελέγχου'), T('Teachers only. Read each session, then publish or reject it.', 'Μόνο για εκπαιδευτικούς. Διαβάστε κάθε συνεδρία και μετά δημοσιεύστε ή απορρίψτε την.'), T('Nothing is waiting for review.', 'Δεν περιμένει τίποτα για έλεγχο.'), 'review', () => loadLists());
        else fill(queueBox);
        if (L.mine.st === 'ok' && L.mine.items.length) listSection(mineBox, L.mine, T('Your questions', 'Οι ερωτήσεις σας'), T('Sessions asked from this browser and their state.', 'Συνεδρίες που ξεκίνησαν από αυτό το πρόγραμμα περιήγησης και η κατάστασή τους.'), '', 'mine', () => loadLists());
        else fill(mineBox);
      }
      async function loadLists() {
        L.pub.st = 'loading'; L.review.st = teacher() ? 'loading' : 'idle'; paintLists();
        const one = async (key, scope) => { try { L[key].items = listOf(await SC.api('/council/api/sessions?scope=' + scope)); L[key].st = 'ok'; } catch (e) { L[key].st = 'err'; L[key].err = e; L[key].items = []; } };
        await Promise.all([one('pub', 'public'), teacher() ? one('review', 'review') : null, one('mine', 'mine')]);
        if (alive) paintLists();
      }

      /* ---------- asking ---------- */
      function paintAll() { paintQuestion(); paintResult(); paintLists(); }
      async function ask(text) {
        text = String(text || '').trim();
        if (text.length < 8 || S.busy || blocked()) return;
        S.busy = true; S.note = null; S.again = false; S.text = '';
        S.ctrl = new AbortController();
        const mine = { id: null, question: text, at: Date.now(), status: 'pending', seats: {}, chair: null, done: false, live: true, by: null, fresh: new Set() };
        M = mine;
        paintAll();
        resBox.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
        let failed = null;
        try {
          const r = await fetch('/council/api/ask', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text }), signal: S.ctrl.signal });
          if (!r.ok) {
            let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
            if (r.status === 429) { S.status = Object.assign({}, S.status, { remaining: b && b.remaining != null ? b.remaining : 0, limit: b && b.limit != null ? b.limit : S.status && S.status.limit }); failed = { kind: 'limit', text: limitText(b && b.code, b) }; }
            else if (r.status === 503) { S.status = Object.assign({}, S.status, { enabled: false }); failed = { kind: 'off', text: T('The council is not switched on right now. Please try again later.', 'Το συμβούλιο δεν είναι ενεργό αυτή τη στιγμή. Δοκιμάστε ξανά αργότερα.') }; }
            else failed = { kind: 'error', text: (b && b.error) || T('The council could not meet just now. Try again in a moment.', 'Το συμβούλιο δεν μπόρεσε να συνεδριάσει τώρα. Δοκιμάστε ξανά σε λίγο.') };
          } else {
            const reader = r.body.getReader(), dec = new TextDecoder();
            let buf = '', finished = false;
            const handle = (line) => {
              let ev; try { ev = JSON.parse(line); } catch (e) { return; }
              if (!alive || M !== mine) return;
              if (ev.type === 'seat') { const n = normSeat(ev); if (!n.id) return; mine.seats[n.id] = n; mine.fresh.add(n.id); live.textContent = T('A seat has answered: ', 'Ένα μέλος απάντησε: ') + n.id; paintQuestion(); paintResult(); }
              else if (ev.type === 'chair') { mine.chair = normChair(ev); mine.fresh.add('chair'); live.textContent = T('The Chair has given a verdict.', 'Ο πρόεδρος έδωσε κρίση.'); paintQuestion(); paintResult(); }
              else if (ev.type === 'done') { mine.done = true; mine.id = ev.sessionId != null ? String(ev.sessionId) : ev.id != null ? String(ev.id) : null; if (ev.status) mine.status = normStatus(ev.status); if (ev.remaining != null) S.status = Object.assign({}, S.status, { remaining: ev.remaining }); paintQuestion(); paintResult(); }
              else if (ev.type === 'error') { failed = { kind: 'error', text: ev.message || T('The council could not finish. Try again in a moment.', 'Το συμβούλιο δεν μπόρεσε να ολοκληρώσει. Δοκιμάστε ξανά σε λίγο.') }; if (ev.remaining != null) S.status = Object.assign({}, S.status, { remaining: ev.remaining }); }
            };
            while (!finished) {
              const { value, done } = await reader.read();
              if (value) buf += dec.decode(value, { stream: true });
              finished = done;
              let i;
              while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(line); }
            }
            if (buf.trim()) handle(buf.trim());
            if (!failed && !mine.chair) failed = { kind: 'error', text: T('The council did not finish. What arrived is shown above. Try asking again.', 'Το συμβούλιο δεν ολοκλήρωσε. Αυτά που έφτασαν φαίνονται παραπάνω. Δοκιμάστε να ρωτήσετε ξανά.') };
          }
        } catch (e) {
          if (e && e.name === 'AbortError') failed = { kind: 'stopped', text: T('Stopped. Ask again when you are ready.', 'Διακόπηκε. Ρωτήστε ξανά όποτε θέλετε.') };
          else failed = { kind: 'error', text: T('No connection. Check your network and try again.', 'Δεν υπάρχει σύνδεση. Ελέγξτε το δίκτυό σας και δοκιμάστε ξανά.') };
        }
        S.busy = false; S.ctrl = null;
        if (!alive) return;
        mine.done = true;
        if (failed) S.note = failed;
        if (failed && !Object.keys(mine.seats).length && M === mine) { M = null; S.text = text; }
        paintAll();
        loadStatus().then(() => { if (alive) { paintQuestion(); } });
        if (!failed) loadLists();
      }

      /* ---------- start ---------- */
      async function loadStatus() {
        try { S.status = await SC.api('/council/api/status'); S.statusErr = null; } catch (e) { S.statusErr = e; }
      }
      async function start() {
        S.statusErr = null;
        fill(qBox, el('div', { class: 'loading' }, T('Loading the council room', 'Φόρτωση της αίθουσας συμβουλίου')));
        const cfg = SC.cached('/api/config', 600000).then((c) => { S.cfg = c; }, () => {});
        await Promise.all([loadStatus(), cfg]);
        if (!alive) return;
        head();
        paintQuestion(); paintResult();
        loadLists();
      }
      start();
      return () => { alive = false; if (S.ctrl) S.ctrl.abort(); };
    },
  });
})();
