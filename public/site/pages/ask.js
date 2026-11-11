/* Ask: the assistant, open to every visitor. Chats live only in this browser (localStorage), nothing is stored per person on the server.
   API: POST /app/api/ask (streamed, one JSON object per line), GET /app/api/ask/status, POST /app/api/ask/:id/report. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;

  const KEY = 'sc.ask.chats.v1';
  const MAX_CHATS = 20, MAX_MSGS = 60;

  /* ---------- small icons (the shell set has no plus, send, stop, copy, book or wave) ---------- */
  const ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    book: '<path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h10"/>',
    wave: '<path d="M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    chats: '<path d="M4 5h16v11H9l-5 4z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  };
  function ic(name) {
    const s = SC.svgEl('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- what the assistant looked at (names come from the server's tool list) ---------- */
  const SOURCE = {
    get_vehicles: { en: 'Live sensors', el: 'Ζωντανοί αισθητήρες', dot: 'live', href: '#/vehicles' },
    get_vehicle_history: { en: 'Sensor history', el: 'Ιστορικό αισθητήρων', dot: 'live', href: '#/explore' },
    get_vehicle_trip: { en: 'Route summary (delayed)', el: 'Σύνοψη διαδρομής (με καθυστέρηση)', dot: 'warn', href: '#/vehicles' },
    get_forecast_model_now: { en: 'Weather model', el: 'Μοντέλο καιρού', dot: 'info', href: '#/weather' },
    get_met_office_now: { en: 'Met Office stations', el: 'Σταθμοί Μετεωρολογικής Υπηρεσίας', dot: 'info', href: '#/weather' },
    get_met_office_history: { en: 'Met Office history', el: 'Ιστορικό Μετεωρολογικής Υπηρεσίας', dot: 'info', href: '#/weather' },
    get_met_office_text: { en: 'Met Office pages', el: 'Σελίδες Μετεωρολογικής Υπηρεσίας', dot: 'info', href: '#/weather' },
    search_handbook: { en: 'Handbook', el: 'Εγχειρίδιο', dot: 'info', href: null },
  };
  const LIVE_TOOLS = ['get_vehicles', 'get_vehicle_history', 'get_met_office_now', 'get_met_office_history'];
  const sourceLabel = (name) => { const s = SOURCE[name]; return s ? t(s.en, s.el) : String(name); };

  // The server sends these English words while it works. The page shows them in the language of the site.
  const WORKING = {
    'Looking at the vehicles': 'Εξετάζω τα οχήματα', 'Reading sensor history': 'Διαβάζω το ιστορικό των αισθητήρων', 'Checking the route': 'Ελέγχω τη διαδρομή',
    'Checking the weather model': 'Ελέγχω το μοντέλο καιρού', 'Checking Met Office stations': 'Ελέγχω τους σταθμούς της Μετεωρολογικής Υπηρεσίας',
    'Reading Met Office history': 'Διαβάζω το ιστορικό της Μετεωρολογικής Υπηρεσίας', 'Reading the Met Office pages': 'Διαβάζω τις σελίδες της Μετεωρολογικής Υπηρεσίας',
    'Searching the handbook': 'Ψάχνω στο εγχειρίδιο',
  };
  const working = (label) => (SC.lang === 'el' && WORKING[label] ? WORKING[label] : label || t('Thinking', 'Σκέφτομαι'));

  const SUGGEST = [
    ['bars', ['Is it warmer in Lefkosia or Larnaka right now?', 'Είναι πιο ζεστά τώρα στη Λευκωσία ή στη Λάρνακα;']],
    ['wave', ['Why can CO2 get high in a classroom?', 'Γιατί το CO2 μπορεί να ανεβαίνει σε μια αίθουσα;']],
    ['sensor', ['Compare a school sensor with the nearest official station', 'Σύγκρινε έναν αισθητήρα σχολείου με τον πλησιέστερο επίσημο σταθμό']],
    ['book', ['What does PM2.5 mean?', 'Τι σημαίνει PM2.5;']],
  ];
  const REASONS = [
    ['inappropriate', 'Not appropriate', 'Δεν είναι κατάλληλο'],
    ['private', 'Asked for private details', 'Ζήτησε προσωπικά στοιχεία'],
    ['other', 'It was wrong or unclear', 'Ήταν λάθος ή ασαφές'],
  ];

  /* ---------- chats kept in this browser ---------- */
  let storageOk = true;
  function checkStorage() {
    try { localStorage.setItem('sc.ask.probe', '1'); const ok = localStorage.getItem('sc.ask.probe') === '1'; localStorage.removeItem('sc.ask.probe'); return ok; } catch (e) { return false; }
  }
  function validMsg(m) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string'; }
  function loadChats() {
    try {
      const a = JSON.parse(SC.store.get(KEY) || '[]');
      if (!Array.isArray(a)) return [];
      return a.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.msgs)).map((c) => ({ id: c.id, title: String(c.title || ''), at: Number(c.at) || 0, msgs: c.msgs.filter(validMsg).slice(-MAX_MSGS) }))
        .sort((x, y) => y.at - x.at).slice(0, MAX_CHATS);
    } catch (e) { return []; }
  }
  const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* ---------- answer text: plain paragraphs, "-" lists and **bold**; never HTML ---------- */
  // A server that leaked an exact position would be a bug. Show no Cyprus coordinate pair, and say so in the console.
  // A pair with only two decimals is the 1 km cell the assistant may use, but the site never prints coordinates either.
  const PAIR = /(-?\d{1,3}\.(\d{2,}))\s*[,;/]\s*(-?\d{1,3}\.(\d{2,}))/g;
  const inCyprus = (a, b) => (a >= 34 && a <= 36 && b >= 32 && b <= 35) || (b >= 34 && b <= 36 && a >= 32 && a <= 35);
  const warned = new Set();
  function scrub(text) {
    return String(text).replace(PAIR, (all, a, da, b, db) => {
      if (!inCyprus(parseFloat(a), parseFloat(b))) return all;
      if (da.length >= 3 || db.length >= 3) { if (!warned.has(all)) { warned.add(all); console.warn('Ask: an answer contained exact coordinates. The server should never send them.'); } return t('(position hidden)', '(η θέση αποκρύπτεται)'); }
      return t('(approximate area, about 1 km)', '(κατά προσέγγιση περιοχή, περίπου 1 χλμ.)');
    });
  }
  function inline(s, parent) {
    s.split(/(\*\*[^*]+\*\*)/).forEach((p) => { if (/^\*\*[^*]+\*\*$/.test(p)) parent.append(el('b', null, p.slice(2, -2))); else if (p) parent.append(p); });
  }
  function renderText(text) {
    const box = el('div', { class: 'ak-body' });
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

  function whenText(at) {   // "14:32" today, "tomorrow at 02:10" otherwise (Cyprus time)
    return SC.date(at) === SC.date(Date.now()) ? SC.time(at) : t('tomorrow at ', 'αύριο στις ') + SC.time(at);
  }
  const stamp = (at) => (SC.date(at) === SC.date(Date.now()) ? t('Today, ', 'Σήμερα, ') + SC.time(at) : SC.date(at) === SC.date(Date.now() - 86400000) ? t('Yesterday, ', 'Χθες, ') + SC.time(at) : SC.date(at) + ', ' + SC.time(at));
  const listWhen = (at) => (SC.date(at) === SC.date(Date.now()) ? t('Today, ', 'Σήμερα, ') + SC.time(at) : SC.date(at) === SC.date(Date.now() - 86400000) ? t('Yesterday', 'Χθες') : SC.date(at));

  // A calm sentence for a limit, with the time the next question frees up.
  function limitText(code, b) {
    const at = b && b.retry_at ? Number(b.retry_at) : b && b.retry_after ? Date.now() + Number(b.retry_after) * 1000 : 0;
    const when = at ? whenText(at) : '';
    const lim = b && b.limit;
    if (code === 'rate') return t('You are asking quickly. Please wait a moment' + (when ? ' (until ' + when + ')' : '') + ', then ask again.', 'Ρωτάτε πολύ γρήγορα. Περιμένετε λίγο' + (when ? ' (μέχρι τις ' + when + ')' : '') + ' και ρωτήστε ξανά.');
    if (code === 'daily') return t('You have used all ' + (lim || 'your') + ' questions for the last 24 hours. ' + (when ? 'You can ask again at ' + when + ' (Cyprus time).' : 'They come back later today.'), 'Χρησιμοποιήσατε ' + (lim ? 'και τις ' + lim : 'όλες τις') + ' ερωτήσεις των τελευταίων 24 ωρών. ' + (when ? 'Μπορείτε να ρωτήσετε ξανά στις ' + when + ' (ώρα Κύπρου).' : 'Επιστρέφουν αργότερα σήμερα.'));
    if (code === 'ip') return t('Many questions came from this network today. ' + (when ? 'You can ask again at ' + when + ' (Cyprus time).' : 'Please try again later.'), 'Πολλές ερωτήσεις ήρθαν σήμερα από αυτό το δίκτυο. ' + (when ? 'Μπορείτε να ρωτήσετε ξανά στις ' + when + ' (ώρα Κύπρου).' : 'Δοκιμάστε ξανά αργότερα.'));
    if (code === 'global') return t('The assistant is resting because everyone together used the daily limit. ' + (when ? 'It is free again at ' + when + ' (Cyprus time).' : 'Please try again later.'), 'Ο βοηθός ξεκουράζεται επειδή όλοι μαζί χρησιμοποίησαν το ημερήσιο όριο. ' + (when ? 'Θα είναι ξανά διαθέσιμος στις ' + when + ' (ώρα Κύπρου).' : 'Δοκιμάστε ξανά αργότερα.'));
    return (b && b.error) || t('The assistant could not answer just now. Try again in a moment.', 'Ο βοηθός δεν μπόρεσε να απαντήσει τώρα. Δοκιμάστε ξανά σε λίγο.');
  }

  /* ---------- the page ---------- */
  SC.register('ask', {
    title: ['Ask', 'Ρωτήστε'],
    render(root, ctx) {
      SC.css('/site/pages/ask.css');
      let chats = loadChats();
      storageOk = checkStorage();
      let cur = chats[0] ? chats[0].id : null;
      let busy = false, workLabel = '', ctrl = null, alive = true, status = null, cfg = null, listOpen = false;

      const chatById = (id) => chats.find((c) => c.id === id) || null;
      const current = () => chatById(cur);
      function save() {
        chats = chats.sort((a, b) => b.at - a.at).slice(0, MAX_CHATS);
        if (cur && !chatById(cur)) cur = null;
        SC.store.set(KEY, JSON.stringify(chats));
      }

      /* ---- parts of the screen ---- */
      const listBox = el('nav', { class: 'ak-list', 'aria-label': t('Chats on this device', 'Συνομιλίες σε αυτή τη συσκευή') });
      const bar = el('div', { class: 'ak-bar' });
      const feed = el('div', { class: 'ak-feed', role: 'region', 'aria-label': t('Conversation', 'Συνομιλία') });
      const ta = el('textarea', { rows: 1, maxlength: 600, placeholder: t('Ask about the air, the weather or our sensors', 'Ρωτήστε για τον αέρα, τον καιρό ή τους αισθητήρες μας'), 'aria-label': t('Your question', 'Η ερώτησή σας') });
      const count = el('span', { class: 'ak-count', hidden: true });
      const sendBtn = el('button', { type: 'submit', class: 'nm-btn nm-btn--primary' });
      const form = el('form', { class: 'ak-in' },
        el('div', { class: 'ak-row' }, ta, count, sendBtn),
        el('p', { class: 'ak-guard' }, ic('lock'), el('span', null, t('Answers come from our data and the handbook. The assistant never shares where a vehicle is exactly. Check the source chips.', 'Οι απαντήσεις προέρχονται από τα δεδομένα μας και το εγχειρίδιο. Ο βοηθός δεν δείχνει ποτέ ακριβώς πού βρίσκεται ένα όχημα. Ελέγξτε τις πηγές.'))));
      const main = el('section', { class: 'ak-main' }, bar, feed, form);
      const card = el('div', { class: 'nm-card ak' }, listBox, main);

      const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
      root.append(SC.head({
        title: t('Ask about our cities', 'Ρωτήστε για τις πόλεις μας'),
        help: ['Type a question in plain words. The assistant looks at the live sensors, the Cyprus Met Office and the class handbook, then answers and shows what it looked at. It can be wrong, so use the Report button on an answer that is. Your chats stay in this browser: nothing is stored under your name, and nobody needs to sign in.',
          'Γράψτε μια ερώτηση με απλά λόγια. Ο βοηθός κοιτάζει τους ζωντανούς αισθητήρες, τη Μετεωρολογική Υπηρεσία Κύπρου και το εγχειρίδιο της τάξης, και μετά απαντά και δείχνει τι κοίταξε. Μπορεί να κάνει λάθος, γι’ αυτό χρησιμοποιήστε το κουμπί αναφοράς σε μια λανθασμένη απάντηση. Οι συνομιλίες μένουν σε αυτό το πρόγραμμα περιήγησης: τίποτα δεν αποθηκεύεται με το όνομά σας και κανείς δεν χρειάζεται να συνδεθεί.'],
      }), card, live);

      /* ---- usage and availability ---- */
      function left() { return status && status.limit != null && status.remaining != null ? status.remaining : null; }
      function drawBar() {
        const c = current();
        const rem = left(), lim = status && status.limit;
        const used = rem != null && lim ? Math.max(0, lim - rem) : null;
        const pct = used != null && lim ? Math.min(100, (used / lim) * 100) : 0;
        bar.replaceChildren(
          el('button', { type: 'button', class: 'nm-btn ak-toggle', 'aria-expanded': listOpen ? 'true' : 'false', onclick: () => { listOpen = !listOpen; card.classList.toggle('list-open', listOpen); } }, ic('chats'), t('Chats', 'Συνομιλίες')),
          el('div', { class: 'ak-ttl' }, el('span', { class: 'tx' }, c && c.title ? c.title : t('New chat', 'Νέα συνομιλία'))),
          el('span', { class: 'ak-pill', title: t('Each visitor can ask this many questions in 24 hours', 'Κάθε επισκέπτης μπορεί να κάνει τόσες ερωτήσεις σε 24 ώρες') },
            el('span', null, t('Questions today: ', 'Ερωτήσεις σήμερα: '), el('b', null, used != null ? used + t(' of ', ' από ') + lim : '–')),
            el('span', { class: 'ak-meter' + (pct >= 80 ? ' hot' : ''), role: 'img', 'aria-label': used != null ? t(rem + ' questions left', 'Απομένουν ' + rem + ' ερωτήσεις') : '' }, el('b', { style: { width: pct + '%' } }))));
      }
      async function loadStatus() {
        try { status = await SC.api('/app/api/ask/status'); } catch (e) { status = status || null; }
        if (!alive) return;
        drawBar(); drawInput(); drawFeed(false);
      }
      const off = () => status && status.enabled === false;
      const wait = () => status && status.available === false && status.retry_at ? Number(status.retry_at) : 0;
      const blocked = () => off() || (left() === 0) || (wait() && wait() > Date.now());

      /* ---- left column ---- */
      const readsBox = el('div', { class: 'ak-reads' });
      function drawReads(devs) {
        const online = devs ? devs.filter((d) => d.online).length : 0;
        const seen = devs ? devs.map((d) => (d.lastSeen ? new Date(d.lastSeen).getTime() : 0)).filter(Boolean) : [];
        const last = seen.length ? Math.max(...seen) : 0;
        readsBox.replaceChildren(el('span', { class: 'ak-lab', style: { marginLeft: 0 } }, t('Reads live from', 'Διαβάζει ζωντανά από')),
          el('ul', null,
            el('li', null, el('i', { class: devs && online ? '' : 'off' }), el('span', null, t('Sensors', 'Αισθητήρες'), el('small', null, devs ? t(online + ' of ' + devs.length + ' online' + (last ? ', last reading ' + SC.ago(last) : ''), online + ' από ' + devs.length + ' σε λειτουργία' + (last ? ', τελευταία μέτρηση ' + SC.ago(last) : '')) : t('Checking…', 'Έλεγχος…')))),
            el('li', null, el('i', { class: 'cy' }), el('span', null, t('Weather', 'Καιρός'), el('small', null, t('Cyprus Met Office, forecast and warnings', 'Μετεωρολογική Υπηρεσία Κύπρου, πρόγνωση και προειδοποιήσεις')))),
            el('li', null, el('i', { class: 'gold' }), el('span', null, t('Vehicles', 'Οχήματα'), el('small', null, t('Shown about 2 h late, rounded to 1 km', 'Εμφανίζονται με καθυστέρηση περίπου 2 ωρών, στρογγυλοποιημένα στο 1 χλμ.')))),
            el('li', null, el('i', { class: 'cy' }), el('span', null, t('Handbook', 'Εγχειρίδιο'), el('small', null, t('Written by teachers', 'Γραμμένο από εκπαιδευτικούς'))))));
      }
      function drawList() {
        const ul = el('ul', { class: 'ak-chats' }, chats.map((c) => el('li', null,
          el('button', { type: 'button', class: c.id === cur ? 'on' : '', 'aria-current': c.id === cur ? 'true' : null, onclick: () => openChat(c.id) },
            el('span', { class: 'ak-tt' }, c.title || t('New chat', 'Νέα συνομιλία')), el('small', null, listWhen(c.at))))));
        listBox.replaceChildren(...[
          el('button', { type: 'button', class: 'nm-btn ak-new', onclick: newChat }, ic('plus'), t('New chat', 'Νέα συνομιλία')),
          el('div', null, el('span', { class: 'ak-lab' }, t('Recent chats', 'Πρόσφατες συνομιλίες')),
            chats.length ? ul : el('p', { class: 'ak-nochats' }, t('Your questions will be listed here.', 'Οι ερωτήσεις σας θα εμφανίζονται εδώ.'))),
          chats.length ? el('button', { type: 'button', class: 'nm-btn nm-btn--ghost ak-clear', onclick: clearAll }, ic('trash'), t('Clear all chats', 'Διαγραφή όλων των συνομιλιών')) : null,
          readsBox,
          el('p', { class: 'ak-note' }, storageOk ? t('Chats stay on this device (the last ' + MAX_CHATS + '). No sign-in needed.', 'Οι συνομιλίες μένουν σε αυτή τη συσκευή (οι τελευταίες ' + MAX_CHATS + '). Δεν χρειάζεται σύνδεση.')
            : t('This browser does not let the page save chats, so they are kept only until you leave.', 'Αυτό το πρόγραμμα περιήγησης δεν επιτρέπει την αποθήκευση συνομιλιών, γι’ αυτό μένουν μόνο μέχρι να φύγετε.'))].filter(Boolean));
      }
      function openChat(id) { cur = id; listOpen = false; card.classList.remove('list-open'); drawAll(); }
      function newChat() {
        if (busy) return;
        cur = null; listOpen = false; card.classList.remove('list-open'); drawAll(); ta.focus();
      }
      function clearAll() {
        SC.modal({
          title: t('Clear all chats?', 'Διαγραφή όλων των συνομιλιών;'),
          body: el('p', null, t('This removes the chats saved in this browser. Nothing else changes, and nothing is stored on the server under your name.', 'Αυτό διαγράφει τις συνομιλίες που έχουν αποθηκευτεί σε αυτό το πρόγραμμα περιήγησης. Τίποτε άλλο δεν αλλάζει και τίποτα δεν αποθηκεύεται στον διακομιστή με το όνομά σας.')),
          actions: [{ label: t('Keep them', 'Να μείνουν') }, { label: t('Clear all', 'Διαγραφή όλων'), primary: true, run: () => { if (ctrl) ctrl.abort(); chats = []; cur = null; busy = false; save(); drawAll(); SC.toast(t('Chats cleared', 'Οι συνομιλίες διαγράφηκαν')); } }],
        });
      }

      /* ---- the feed ---- */
      function answerCard(m, idx) {
        const tools = Array.isArray(m.tools) ? m.tools.filter((x) => typeof x === 'string') : [];
        const live = tools.some((x) => LIVE_TOOLS.includes(x));
        const used = tools.map(sourceLabel);
        const tagsEl = [];
        if (live && cfg && cfg.demo) tagsEl.push(el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης')));
        else if (live) tagsEl.push(el('span', { class: 't live' }, t('Live data', 'Ζωντανά δεδομένα')));
        else tagsEl.push(el('span', { class: 't ai' }, t('AI answer', 'Απάντηση ΤΝ')));
        const art = el('article', { class: 'nm-card ak-ans', 'aria-label': t('Answer', 'Απάντηση') },
          el('header', { class: 'ak-ans-h' }, el('span', { class: 'ak-av' }, SC.icon('sparkle')),
            el('div', null, el('b', null, t('Smart Cities assistant', 'Βοηθός Smart Cities')), el('small', null, SC.time(m.at || Date.now()) + (used.length ? ', ' + t('read ', 'διάβασε ') + used.join(', ') : ', ' + t('no data lookups', 'χωρίς αναζήτηση δεδομένων')))), tagsEl),
          renderText(m.text));
        if (tools.length) {
          art.append(el('div', { class: 'ak-srcs' }, el('span', { class: 'ak-lab' }, t('Sources', 'Πηγές')),
            tools.map((n, i) => { const s = SOURCE[n]; const inner = [el('i', { class: 'n' }, String(i + 1)), sourceLabel(n)]; return s && s.href ? el('a', { class: 'ak-chip', href: s.href }, inner) : el('span', { class: 'ak-chip' }, inner); })));
        }
        const rep = m.id ? el('button', { type: 'button', class: 'nm-btn nm-btn--ghost', disabled: m.reported ? true : null, onclick: () => reportDialog(m) }, ic('flag'), m.reported ? t('Reported, thank you', 'Αναφέρθηκε, ευχαριστούμε') : t('Report this answer', 'Αναφορά αυτής της απάντησης')) : null;
        art.append(el('div', { class: 'ak-fb' },
          m.remaining != null ? el('span', null, t('Questions left today: ', 'Ερωτήσεις που απομένουν σήμερα: ') + m.remaining) : null,
          el('span', { class: 'sp' }),
          el('button', { type: 'button', class: 'nm-btn nm-btn--ghost', onclick: () => copyText(m.text) }, ic('copy'), t('Copy', 'Αντιγραφή')), rep));
        return art;
      }
      function copyText(text) {
        const done = () => SC.toast(t('Copied', 'Αντιγράφηκε'));
        try { navigator.clipboard.writeText(scrub(text)).then(done, () => SC.toast(t('Could not copy', 'Δεν ήταν δυνατή η αντιγραφή'))); } catch (e) { SC.toast(t('Could not copy', 'Δεν ήταν δυνατή η αντιγραφή')); }
      }
      function noteCard(m) {
        const cls = m.kind === 'stopped' ? 'nm-callout' : m.kind === 'limit' || m.kind === 'off' ? 'nm-callout nm-callout--info' : 'nm-callout nm-callout--warn';
        return el('div', { class: cls + ' ak-callout', role: 'status' }, m.text);
      }
      function userRow(m) { return el('div', { class: 'ak-me' }, el('div', { class: 'ak-b' }, m.text), el('small', null, t('You, ', 'Εσείς, ') + SC.time(m.at || Date.now()))); }

      function drawFeed(toBottom) {
        const c = current();
        const msgs = c ? c.msgs : [];
        const keep = feed.scrollTop, atEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
        const kids = [];
        if (off()) {
          kids.push(el('div', { class: 'nm-callout nm-callout--info ak-callout' }, el('b', null, t('The assistant is switched off for now.', 'Ο βοηθός είναι προσωρινά απενεργοποιημένος.')), ' ', t('Please try again later, or ask a teacher.', 'Δοκιμάστε ξανά αργότερα ή ρωτήστε έναν εκπαιδευτικό.')));
        }
        if (!msgs.length) {
          kids.push(el('div', { class: 'ak-hero' }, el('span', { class: 'ak-mark' }, SC.icon('sparkle')), el('h2', null, t('What would you like to know?', 'Τι θα θέλατε να μάθετε;')),
            el('p', null, t('Plain answers from live sensors, the Met Office and the class handbook.', 'Απλές απαντήσεις από ζωντανούς αισθητήρες, τη Μετεωρολογική Υπηρεσία και το εγχειρίδιο της τάξης.'))));
          kids.push(el('div', { class: 'ak-sug' }, SUGGEST.map(([icon, q]) => el('button', { type: 'button', disabled: busy || blocked() ? true : null, onclick: () => send(t(q[0], q[1])) }, el('span', { class: 'ak-ic' }, ic(icon)), t(q[0], q[1])))));
        } else {
          kids.push(el('div', { class: 'ak-stamp' }, stamp(msgs[0].at || Date.now())));
        }
        msgs.forEach((m, i) => {
          if (m.role === 'user') kids.push(userRow(m));
          else if (m.error || m.note) kids.push(noteCard(m));
          else kids.push(answerCard(m, i));
        });
        const lastM = msgs[msgs.length - 1];
        if (busy) kids.push(el('div', { class: 'ak-typing', role: 'status' }, el('i'), el('i'), el('i'), el('span', null, working(workLabel))));
        else if (lastM && lastM.role === 'user' && !blocked()) kids.push(el('div', null, el('div', { class: 'nm-callout nm-callout--warn ak-callout' }, t('This question has no answer yet.', 'Αυτή η ερώτηση δεν έχει απάντηση ακόμη.'), el('div', null, el('button', { type: 'button', class: 'nm-btn', onclick: () => send(lastM.text, true) }, t('Ask it again', 'Ρωτήστε ξανά'))))));
        feed.replaceChildren(...kids);
        if (toBottom || atEnd) feed.scrollTop = feed.scrollHeight; else feed.scrollTop = keep;
      }

      function drawInput() {
        const dis = blocked() && !busy;
        ta.disabled = off();
        ta.placeholder = off() ? t('The assistant is switched off for now', 'Ο βοηθός είναι προσωρινά απενεργοποιημένος') : left() === 0 || (wait() && wait() > Date.now()) ? t('You can ask again later', 'Μπορείτε να ρωτήσετε ξανά αργότερα') : t('Ask about the air, the weather or our sensors', 'Ρωτήστε για τον αέρα, τον καιρό ή τους αισθητήρες μας');
        sendBtn.replaceChildren(busy ? ic('stop') : ic('send'), el('span', { class: 'lbl' }, busy ? t('Stop', 'Διακοπή') : t('Send', 'Αποστολή')));
        sendBtn.setAttribute('aria-label', busy ? t('Stop the answer', 'Διακοπή της απάντησης') : t('Send your question', 'Αποστολή της ερώτησης'));
        sendBtn.disabled = busy ? false : dis || !ta.value.trim();
        const n = ta.value.length;
        count.hidden = n < 420; count.textContent = n + '/600';
      }
      function drawAll() { drawList(); drawBar(); drawFeed(true); drawInput(); }

      /* ---- sending ---- */
      async function send(text, again) {
        text = String(text || '').trim();
        if (!text || busy || off()) return;
        let c = current();
        if (!c) { c = { id: newId(), title: text.slice(0, 60), at: Date.now(), msgs: [] }; chats.unshift(c); cur = c.id; }
        const hist = c.msgs.filter((m) => !m.error && !m.note).slice(-8).map((m) => ({ role: m.role, text: m.text }));
        if (again && hist.length && hist[hist.length - 1].role === 'user') hist.pop();   // the question is re-sent below
        if (!again) c.msgs.push({ role: 'user', text, at: Date.now() });
        c.at = Date.now();
        c.msgs = c.msgs.slice(-MAX_MSGS);
        save();
        ta.value = ''; ta.style.height = '';
        busy = true; workLabel = ''; ctrl = new AbortController();
        drawAll();
        const mine = c, signal = ctrl.signal;
        let got = null;
        try {
          const r = await fetch('/app/api/ask', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text, history: hist }), signal });
          if (!r.ok) {
            let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
            if (r.status === 429) { if (b && b.remaining != null) status = Object.assign({}, status, { remaining: b.remaining, limit: b.limit != null ? b.limit : status && status.limit }); got = { role: 'assistant', error: true, kind: 'limit', text: limitText(b && b.code, b), at: Date.now() }; }
            else if (r.status === 503) { status = Object.assign({}, status, { enabled: false }); got = { role: 'assistant', error: true, kind: 'off', text: t('The assistant is not switched on yet. Please try again later.', 'Ο βοηθός δεν έχει ενεργοποιηθεί ακόμη. Δοκιμάστε ξανά αργότερα.'), at: Date.now() }; }
            else got = { role: 'assistant', error: true, kind: 'error', text: (b && b.error) || t('The assistant could not answer just now. Try again in a moment.', 'Ο βοηθός δεν μπόρεσε να απαντήσει τώρα. Δοκιμάστε ξανά σε λίγο.'), at: Date.now() };
          } else {
            const reader = r.body.getReader(), dec = new TextDecoder();
            let buf = '', finished = false;
            const handle = (line) => {
              let ev; try { ev = JSON.parse(line); } catch (e) { return; }
              if (ev.type === 'tool') { workLabel = ev.name; if (alive && cur === mine.id) drawFeed(true); }
              else if (ev.type === 'answer') {
                got = { role: 'assistant', text: String(ev.text || ''), id: ev.id || null, tools: Array.isArray(ev.tools) ? ev.tools : [], remaining: ev.remaining != null ? ev.remaining : null, at: Date.now() };
                if (ev.remaining != null) status = Object.assign({}, status, { remaining: ev.remaining, limit: ev.limit != null ? ev.limit : status && status.limit });
              } else if (ev.type === 'error') {
                got = { role: 'assistant', error: true, kind: 'error', text: ev.message || t('The assistant could not answer just now. Try again in a moment.', 'Ο βοηθός δεν μπόρεσε να απαντήσει τώρα. Δοκιμάστε ξανά σε λίγο.'), at: Date.now() };
                if (ev.remaining != null) status = Object.assign({}, status, { remaining: ev.remaining, limit: ev.limit != null ? ev.limit : status && status.limit });
              }
            };
            while (!finished) {
              const { value, done } = await reader.read();
              if (value) buf += dec.decode(value, { stream: true });
              finished = done;
              let i;
              while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(line); }
            }
            if (buf.trim()) handle(buf.trim());
            if (!got) got = { role: 'assistant', error: true, kind: 'error', text: t('The assistant did not send an answer. Try again.', 'Ο βοηθός δεν έστειλε απάντηση. Δοκιμάστε ξανά.'), at: Date.now() };
          }
        } catch (e) {
          if (e && e.name === 'AbortError') got = { role: 'assistant', note: true, kind: 'stopped', text: t('Stopped. Ask again when you are ready.', 'Διακόπηκε. Ρωτήστε ξανά όποτε θέλετε.'), at: Date.now() };
          else got = { role: 'assistant', error: true, kind: 'error', text: t('No connection. Check your network and try again.', 'Δεν υπάρχει σύνδεση. Ελέγξτε το δίκτυό σας και δοκιμάστε ξανά.'), at: Date.now() };
        }
        busy = false; ctrl = null; workLabel = '';
        live.textContent = got.error || got.note ? got.text : t('Answer ready: ', 'Η απάντηση είναι έτοιμη: ') + got.text.slice(0, 160);
        if (chatById(mine.id)) { mine.msgs.push(got); mine.msgs = mine.msgs.slice(-MAX_MSGS); mine.at = Date.now(); save(); }
        if (!alive) return;
        drawAll();
        if (ta && !matchMedia('(pointer: coarse)').matches) ta.focus();
        loadStatus();
      }

      function reportDialog(m) {
        let reason = 'other';
        const note = el('textarea', { class: 'nm-input ak-rnote', maxlength: 300, placeholder: t('What was wrong? (optional)', 'Τι ήταν λάθος; (προαιρετικό)'), 'aria-label': t('Note', 'Σημείωση') });
        const sel = el('div', { class: 'ak-reasons' });
        const paint = () => sel.replaceChildren(...REASONS.map(([k, en, gr]) => el('button', { type: 'button', class: k === reason ? 'on' : '', 'aria-pressed': k === reason ? 'true' : 'false', onclick: () => { reason = k; paint(); } }, t(en, gr))));
        paint();
        const msg = el('p', { class: 'muted', role: 'status' });
        let close = () => {};
        const sendRep = el('button', { type: 'button', class: 'nm-btn nm-btn--primary', onclick: async () => {
          sendRep.disabled = true;
          try { await SC.api('/app/api/ask/' + encodeURIComponent(m.id) + '/report', { method: 'POST', body: { reason, note: note.value } }); m.reported = true; save(); close(); SC.toast(t('Thank you. A teacher will look at it.', 'Ευχαριστούμε. Ένας εκπαιδευτικός θα το δει.')); if (alive) drawFeed(false); }
          catch (e) { sendRep.disabled = false; msg.textContent = e.status === 404 ? t('This answer can no longer be reported from this browser.', 'Αυτή η απάντηση δεν μπορεί πλέον να αναφερθεί από αυτό το πρόγραμμα περιήγησης.') : e.message; }
        } }, t('Send report', 'Αποστολή αναφοράς'));
        close = SC.modal({ title: t('Report this answer', 'Αναφορά αυτής της απάντησης'), body: el('div', null, el('p', null, t('A teacher will read this. No name is sent with it.', 'Ένας εκπαιδευτικός θα το διαβάσει. Δεν στέλνεται κανένα όνομα.')), sel, note, msg, sendRep), actions: [{ label: t('Cancel', 'Ακύρωση') }] });
      }

      /* ---- input behaviour ---- */
      function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(132, ta.scrollHeight) + 'px'; }
      ta.addEventListener('input', () => { grow(); drawInput(); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', (e) => { e.preventDefault(); if (busy) { if (ctrl) ctrl.abort(); return; } send(ta.value); });

      /* ---- start ---- */
      drawReads(null);
      drawAll();
      if (ctx.query && ctx.query.get('q')) { ta.value = ctx.query.get('q').slice(0, 600); grow(); drawInput(); }
      SC.cached('/api/config', 600000).then((c) => { cfg = c; if (c && c.demo) { const h = root.querySelector('.page-head'); if (h && alive) h.append(el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης'))); } if (alive) drawFeed(false); }).catch(() => {});
      SC.cached('/api/devices', 60000).then((d) => { if (alive && Array.isArray(d)) { drawReads(d); } }).catch(() => { if (alive) drawReads(null); });
      loadStatus();

      return () => { alive = false; if (ctrl) ctrl.abort(); };
    },
  });
})();
