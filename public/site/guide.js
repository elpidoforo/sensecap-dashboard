/* Guide me: Kleanthis as a teacher for the page you are on. A second round button above the Ask bubble.
   - He explains the screen (read aloud by the browser's own voice, and always shown as text), asks the student a question,
     and gives steps for finding the answer with the website.
   - A red light glides to the thing to press. When the student presses it, the next step is spoken. No new request is
     made per step: one answer carries up to four steps, so following them costs one question, not four.
   - Pointing is safe by design: this file sends a list of the things on the screen (menu links, and the buttons of the page),
     the server keeps only steps whose id is in that list, and the light only ever goes to an element this file itself listed.
   - Voice: the browser's speech synthesis, on this device. Nothing is recorded: there is no microphone here. The student
     types or presses a ready-made reply. A typed question passes the same privacy check as the classroom notes (TK4.checkText)
     before it is sent; if that check cannot be loaded, typing is switched off and the buttons still work.
   - Same assistant and the same daily limits as the Ask bubble (POST /app/api/ask). An AI, and the panel says so.
   SC.guide.setPage(id, name) is called by the shell on every route; SC.guide.close() by the Ask bubble. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const T = (en, el) => SC.t(en, el);
  const el = (tag, attrs, ...kids) => SC.el(tag, attrs, ...kids);
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } } };

  let root = null, panel = null, btn = null, dot = null, open = false, busy = false, stop = null;
  let pageId = null, pageName = '';
  const OWN_PAGES = new Set(['home', 'layers', 'weather', 'explore', 'library', 'city3d', 'city', 'stack', 'health', 'fieldwork', 'alerts', 'warnings', 'feeds', 'helpers', 'research', 'archive', 'guides', 'districts', 'vehicles', 'aircraft']);
  let voiceOn = store.get('sc.guide.voice') !== '0';
  let targets = new Map();            // id -> element, as listed for the last request
  let steps = [], at = -1, watch = null, arrived = false;
  const history = [];

  /* ---------- what is on the screen ---------- */
  const visible = (n) => { if (!n || !n.isConnected) return false; const r = n.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(n).visibility !== 'hidden'; };
  const labelOf = (n) => String(n.getAttribute('aria-label') || n.textContent || '').replace(/\s+/g, ' ').trim();
  function collect() {
    targets = new Map();
    const list = [];
    document.querySelectorAll('a.nm-side-a[data-id]').forEach((a) => {
      const id = 'nav:' + String(a.getAttribute('data-id')).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32), label = labelOf(a);
      if (id.length > 4 && label && !targets.has(id) && a.getAttribute('data-id') !== pageId) { targets.set(id, a); list.push({ id, label: label.slice(0, 48) }); }
    });
    // Buttons of the page are listed only on pages whose words are the site's own. Pages that show what students wrote (titles,
    // team names, notes) send the menu links alone, so nothing a student typed can reach the assistant as a "label".
    const view = OWN_PAGES.has(pageId) ? document.getElementById('view') : null;
    let n = 0;
    if (view) view.querySelectorAll('button, a.nm-btn, [role="tab"], select, summary').forEach((b) => {
      if (n >= 28 || b.disabled || !visible(b)) return;
      const label = String(b.textContent || '').replace(/\s+/g, ' ').trim() || labelOf(b);
      if (b.closest('[data-student], form') || label.length < 2 || label.length > 48) return;
      const id = 'el:' + (++n);
      targets.set(id, b); list.push({ id, label });
    });
    return list;
  }

  // A menu link is looked up afresh each time (the shell redraws the menu); a button of the page is the very element that was listed.
  function nodeOf(id) {
    if (!targets.has(id)) return null;
    if (!id.startsWith('nav:')) return targets.get(id);
    return [...document.querySelectorAll('a.nm-side-a[data-id]')].find((a) => 'nav:' + String(a.getAttribute('data-id')).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) === id) || null;
  }

  /* ---------- the voice (this device only) ---------- */
  const synth = () => (typeof speechSynthesis === 'object' && typeof SpeechSynthesisUtterance === 'function' ? speechSynthesis : null);
  function hush() { const s = synth(); if (s) { try { s.cancel(); } catch (e) { /* nothing was speaking */ } } }
  function speak(text) {
    const s = synth();
    if (!s || !voiceOn || !text) return;
    hush();
    const want = SC.lang === 'el' ? 'el' : 'en';
    let voices = []; try { voices = s.getVoices() || []; } catch (e) { voices = []; }
    const voice = voices.find((v) => String(v.lang || '').toLowerCase().startsWith(want));
    if (want === 'el' && voices.length && !voice) { note(T('', 'Αυτή η συσκευή δεν έχει ελληνική φωνή. Διάβασε το κείμενο.')); return; }   // an English voice reading Greek helps nobody
    const u = new SpeechSynthesisUtterance(text);
    u.lang = want === 'el' ? 'el-GR' : 'en-GB';
    if (voice) u.voice = voice;
    u.rate = 0.88;   // a little slower than normal speech: easier to follow, above all for younger students
    try { s.speak(u); } catch (e) { /* the text is on the screen anyway */ }
  }

  /* ---------- the red light ---------- */
  function burgerFor(node) {            // a menu link inside the closed drawer of a phone: point at the menu button first
    const burger = document.getElementById('burger');
    return node && node.classList.contains('nm-side-a') && !visible(node) && visible(burger) ? burger : null;
  }
  let lit = null;
  function unlight() { if (lit) { lit.classList.remove('kg-target'); lit = null; } }
  let pressed = false;                  // between a press and the next step the menu may be redrawn: do not judge the old link in that moment
  function place() {
    if (pressed) return;
    if (at < 0 || !steps[at]) { dot.hidden = true; unlight(); return; }
    const node = nodeOf(steps[at].id);
    if (!node || !node.isConnected) { finish(T('That button is not on the screen any more, so I stopped the steps.', 'Αυτό το κουμπί δεν είναι πια στην οθόνη, γι’ αυτό σταμάτησα τα βήματα.')); return; }
    const show = burgerFor(node) || node;
    if (!visible(show)) { dot.hidden = true; unlight(); return; }
    const r = show.getBoundingClientRect();
    if (!scrolled && (r.bottom < 0 || r.top > innerHeight)) { scrolled = true; try { show.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { show.scrollIntoView(); } }
    if (lit !== show) { unlight(); lit = show; lit.classList.add('kg-target'); }
    if (r.bottom < 0 || r.top > innerHeight) { dot.hidden = true; return; }   // the student scrolled away to read: the outline stays, the light waits
    dot.hidden = false;
    panel.classList.toggle('up', innerWidth <= 640 && r.top + r.height / 2 > innerHeight / 2);   // on a phone the panel moves out of the way of the thing to press
    // the light sits in the top right corner of the thing (so its words stay readable) and a red outline goes round all of it
    dot.style.transform = 'translate(' + Math.round(r.right - Math.min(16, r.width / 2) - 13) + 'px,' + Math.round(r.top + Math.min(12, r.height / 2) - 13) + 'px)';
    if (lit !== show) { unlight(); lit = show; lit.classList.add('kg-target'); }
  }
  function onClick(e) {
    if (at < 0 || !steps[at] || pressed) return;
    const node = nodeOf(steps[at].id);
    if (node && node.contains(e.target)) { const nav = steps[at].id.startsWith('nav:'), mine = at, run = runId; pressed = true; setTimeout(() => { pressed = false; if (at === mine && run === runId) next(nav); }, 350); return; }
    if (!e.target.closest || !e.target.closest('#view')) return;   // the menu, a dialog the step opened, our own panels: not a wrong answer
    note(T('Not that one. Look for the red light.', 'Όχι αυτό. Ψάξε το κόκκινο φως.'));
  }
  let runId = 0, scrolled = false, arrivedAt = 0;
  function startSteps(list) {
    runId++; scrolled = false;
    steps = list; at = list.length ? 0 : -1; arrived = false;
    drawSteps();
    if (at >= 0) { clearInterval(watch); watch = setInterval(place, 300); place(); }
  }
  function next(wasNav) {
    if (at < 0) return;
    const done = steps[at];
    at++; scrolled = false;
    if (touring) {                      // the written tour: say what this page is, then point at the next link (or finish)
      const here = wasNav && done && done.after ? done.after : '';
      if (here) say(el('div', { class: 'kg-a' }, el('p', null, here)));
      if (at >= steps.length) { const bye = tourEnd(); speak((here ? here + ' ' : '') + bye); return; }
      drawSteps(); place(); speak((here ? here + ' ' : '') + steps[at].say); return;
    }
    if (at >= steps.length) {
      arrived = !!wasNav; arrivedAt = Date.now();
      finish(wasNav ? T('You are there. Press "What do I do here?" and we carry on.', 'Έφτασες. Πάτησε «Τι κάνω εδώ;» και συνεχίζουμε.')
        : T('Well done, that was the last step. What did you notice?', 'Μπράβο, αυτό ήταν το τελευταίο βήμα. Τι παρατήρησες;'), true);
      return;
    }
    drawSteps(); place(); speak(steps[at].say);
  }
  function finish(text, aloud) {
    touring = false; runId++; clearInterval(watch); watch = null; steps = []; at = -1; dot.hidden = true; panel.classList.remove('up'); unlight();
    drawSteps();
    if (text) { note(text); if (aloud) speak(text); }
    chips();
  }

  /* ---------- the panel ---------- */
  const feed = () => panel.querySelector('.kg-feed');
  function say(node) { const f = feed(); f.append(node); f.scrollTop = f.scrollHeight; }
  function note(text) { if (!text) return; const old = feed().querySelector('.kg-note:last-child'); if (old && old.textContent === text) return; say(el('div', { class: 'kg-note' }, text)); }
  function drawSteps() {
    const box = panel.querySelector('.kg-steps');
    box.replaceChildren(...steps.map((st, i) => el('li', { class: i < at ? 'done' : i === at ? 'now' : '', 'aria-current': i === at ? 'step' : null }, st.say)));
    box.hidden = !steps.length;
    panel.querySelector('.kg-ctl').hidden = !steps.length;
    panel.classList.toggle('stepping', steps.length > 0);   // on a phone the panel shrinks to the current step, so it does not cover the thing to press
  }
  function chips() {
    const box = panel.querySelector('.kg-chips');
    const list = [];
    if (arrived) list.push(['here', T('What do I do here?', 'Τι κάνω εδώ;')]);
    list.push(['explain', T('Explain this page', 'Εξήγησέ μου τη σελίδα')], ['challenge', T('Give me a challenge', 'Δώσε μου μια πρόκληση')]);
    box.replaceChildren(...list.map(([mode, text]) => el('button', { type: 'button', class: 'kg-chip', onclick: () => ask(text, mode) }, text)),
      el('button', { type: 'button', class: 'kg-chip kg-quiet', onclick: tour }, T('Show me round', 'Ξενάγησέ με')),
      el('button', { type: 'button', class: 'kg-chip kg-quiet', onclick: welcome }, T('Change who is here', 'Άλλαξε ποιος είναι εδώ')));
  }

  /* ---------- the welcome: who Kleanthis is, three questions, and a short tour ----------
   * The three answers are choices pressed on the page (who is here, which age group, what they want to do). No name and no
   * exact age is ever asked. They are kept in this browser only and sent with a question as three words, so that Kleanthis
   * can speak to a primary class differently from one older student. The tour is written here, not made by the assistant:
   * it is the same for everyone, costs no question, and points only at menu links. */
  const WHO_KEY = 'sc.guide.who.v1';
  let who = null;
  try { const w = JSON.parse(store.get(WHO_KEY) || 'null'); if (w && typeof w === 'object') who = { who: w.who || null, age: w.age || null, goal: w.goal || null }; } catch (e) { who = null; }
  const QUESTIONS = [
    { key: 'who', q: ['First: who is here with me?', 'Πρώτα: ποιος είναι εδώ μαζί μου;'],
      opts: [['student', 'Just me', 'Μόνο εγώ'], ['class', 'A class with a teacher', 'Μια τάξη με εκπαιδευτικό'], ['teacher', 'I am a teacher', 'Είμαι εκπαιδευτικός']] },
    { key: 'age', q: ['Which school are the students in?', 'Σε ποιο σχολείο πάνε οι μαθητές;'],
      opts: [['primary', 'Primary school', 'Δημοτικό'], ['lower', 'Gymnasium (12 to 14)', 'Γυμνάσιο (12 έως 14)'], ['upper', 'Lyceum (15 to 18)', 'Λύκειο (15 έως 18)']] },
    { key: 'goal', q: ['And what would you like to do today?', 'Και τι θα ήθελες να κάνεις σήμερα;'],
      opts: [['look', 'Look around', 'Να ρίξω μια ματιά'], ['question', 'Answer a question with data', 'Να απαντήσω μια ερώτηση με δεδομένα'], ['build', 'Build something', 'Να φτιάξω κάτι']] },
  ];
  function welcome() {
    hush(); finish('');
    const hello = T('Hello! I am Kleanthis, your guide on this site. I am an AI, not a person. I will show you where to press with a red light, so that you find the answers yourself. I have three quick questions, so I can explain things in the way that suits you.',
      'Γεια σου! Είμαι ο Κλεάνθης, ο οδηγός σου σε αυτόν τον ιστότοπο. Είμαι τεχνητή νοημοσύνη, όχι άνθρωπος. Θα σου δείχνω με ένα κόκκινο φως πού να πατήσεις, για να βρίσκεις μόνος σου τις απαντήσεις. Έχω τρεις σύντομες ερωτήσεις, για να σου εξηγώ με τον τρόπο που σου ταιριάζει.');
    const box = el('div', { class: 'kg-a' }, el('p', null, hello)); say(box);
    who = { who: null, age: null, goal: null };
    askWho(0, hello);
  }
  function askWho(i, lead) {
    const box = panel.querySelector('.kg-chips');
    if (i >= QUESTIONS.length) {
      store.set(WHO_KEY, JSON.stringify(who));
      const done = who.who === 'teacher'
        ? T('Thank you. I will speak to you as a colleague. Shall I show you round in one minute?', 'Ευχαριστώ. Θα σου μιλάω ως συνάδελφος. Να σε ξεναγήσω σε ένα λεπτό;')
        : T('Thank you. Shall I show you round in one minute? We start with where all the data comes from.', 'Ευχαριστώ. Να σε ξεναγήσω σε ένα λεπτό; Ξεκινάμε από το πού έρχονται όλα τα δεδομένα.');
      say(el('div', { class: 'kg-a' }, el('p', null, done))); speak(done);
      box.replaceChildren(
        el('button', { type: 'button', class: 'kg-chip', onclick: tour }, T('Yes, show me round', 'Ναι, ξενάγησέ με')),
        el('button', { type: 'button', class: 'kg-chip', onclick: () => { hush(); chips(); } }, T('Not now', 'Όχι τώρα')));
      return;
    }
    const Q = QUESTIONS[i];
    if (Q.key === 'age' && who.who === 'teacher') { who.age = null; return askWho(i + 1, ''); }   // a teacher on their own: no students to ask about
    const q = T(Q.q[0], Q.q[1]);
    say(el('div', { class: 'kg-a' }, el('p', null, q))); speak((lead ? lead + ' ' : '') + q);
    box.replaceChildren(...Q.opts.map(([v, en, gr]) => el('button', { type: 'button', class: 'kg-chip', onclick: () => {
      who[Q.key] = v; say(el('div', { class: 'kg-you' }, T(en, gr))); askWho(i + 1, '');
    } }, T(en, gr))));
    const first = box.querySelector('.kg-chip'); if (first && open) first.focus();
  }
  // The tour: each step points at a menu link, and says something once the student has arrived there.
  const TOUR = [
    { id: 'nav:layers',
      say: ['Let us start with where the data comes from. Press Data layers in the menu.', 'Ας ξεκινήσουμε από το πού έρχονται τα δεδομένα. Πάτησε Στρώματα δεδομένων στο μενού.'],
      after: ['Here they are. Each card is one source of data: our own sensors on buses, cars and in classrooms, the official weather stations, weather models and satellites. A card says who publishes the data and how fresh it is.',
        'Εδώ είναι. Κάθε κάρτα είναι μία πηγή δεδομένων: οι δικοί μας αισθητήρες σε λεωφορεία, αυτοκίνητα και τάξεις, οι επίσημοι μετεωρολογικοί σταθμοί, τα μοντέλα καιρού και οι δορυφόροι. Η κάρτα λέει ποιος δημοσιεύει τα δεδομένα και πόσο πρόσφατα είναι.'] },
    { id: 'nav:stack',
      say: ['Now let us see all of it together. Press The data stack in 3D.', 'Τώρα ας τα δούμε όλα μαζί. Πάτησε Η στοίβα δεδομένων σε 3D.'],
      after: ['Each sheet is one kind of data, one on top of the other, over the same map. You can turn it, and press a sheet to see what it measures and where its numbers come from.',
        'Κάθε φύλλο είναι ένα είδος δεδομένων, το ένα πάνω στο άλλο, πάνω στον ίδιο χάρτη. Μπορείς να το γυρίσεις και να πατήσεις ένα φύλλο για να δεις τι μετρά και από πού έρχονται οι αριθμοί του.'] },
  ];
  let touring = false;
  function tour() {
    hush(); collect();
    const list = TOUR.map((st) => ({ id: st.id, say: T(st.say[0], st.say[1]), after: T(st.after[0], st.after[1]) }));
    touring = true;
    // a link that is not in the menu of this visitor cannot be pointed at: leave that step out and say so
    const usable = list.filter((st) => [...document.querySelectorAll('a.nm-side-a[data-id]')].some((a) => 'nav:' + a.getAttribute('data-id') === st.id));
    usable.forEach((st) => targets.set(st.id, null));
    if (!usable.length) { touring = false; note(T('I cannot find the menu here, so the tour has to wait.', 'Δεν βρίσκω το μενού εδώ, οπότε η ξενάγηση θα περιμένει.')); chips(); return; }
    panel.querySelector('.kg-chips').replaceChildren();
    startSteps(usable);
    speak(usable[0].say);
  }
  function tourEnd() {
    touring = false;
    const bye = T('That was the tour. Now it is your turn: ask me something, or press Give me a challenge.', 'Αυτή ήταν η ξενάγηση. Τώρα είναι η σειρά σου: ρώτησέ με κάτι ή πάτησε Δώσε μου μια πρόκληση.');
    finish(bye, false); return bye;
  }

  let kit = null;                       // the privacy check for typed text, loaded when the panel first opens
  function loadKit() {
    if (kit) return kit;
    kit = new Promise((done) => {
      if (window.TK4 && window.TK4.checkText) return done(true);
      const s = document.createElement('script');
      s.src = '/site/pages/tk4-kit.js';
      s.onload = () => done(!!(window.TK4 && window.TK4.checkText));
      s.onerror = () => { s.remove(); kit = null; done(false); };
      document.head.append(s);
    });
    return kit;
  }
  async function typed() {
    const input = panel.querySelector('.kg-in input');
    const raw = input.value.trim();
    if (!raw || busy) return;
    if (!(await loadKit())) { note(T('Typing is switched off because the privacy check did not load. Use the buttons.', 'Η πληκτρολόγηση είναι κλειστή γιατί δεν φορτώθηκε ο έλεγχος ιδιωτικότητας. Χρησιμοποίησε τα κουμπιά.')); return; }
    const c = window.TK4.checkText(raw, 300);
    if (!c.ok) { note(T('Not sent. ', 'Δεν στάλθηκε. ') + c.why); return; }
    input.value = '';
    ask(c.text, 'ask');
  }

  async function ask(text, mode) {
    if (busy || !text) return;
    busy = true; hush(); finish('');
    arrived = false; chips();
    panel.querySelectorAll('.kg-chip, .kg-in button').forEach((b) => { b.disabled = true; });
    say(el('div', { class: 'kg-you' }, text));
    const working = el('div', { class: 'kg-work' }, T('Thinking…', 'Σκέφτεται…'));
    say(working);
    const list = collect(), from = pageId;
    const ctrl = new AbortController();
    stop = () => ctrl.abort();
    const fail = (msg) => { working.remove(); say(el('div', { class: 'kg-err' }, msg)); };
    try {
      const r = await fetch('/app/api/ask', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ question: text, history: history.slice(-6), guide: { page: pageId, name: pageName, lang: SC.lang === 'el' ? 'el' : 'en', mode, targets: list, who: who && who.who, age: who && who.age, goal: who && who.goal } }),
      });
      if (!r.ok) {
        let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
        fail(r.status === 503 ? T('Kleanthis is not switched on yet.', 'Ο Κλεάνθης δεν έχει ενεργοποιηθεί ακόμη.')
          : (b && b.error) || T('Kleanthis could not answer just now. Try again in a moment.', 'Ο Κλεάνθης δεν μπόρεσε να απαντήσει τώρα. Δοκίμασε ξανά σε λίγο.'));
      } else {
        const body = await r.text();
        let got = null, err = null;
        body.split('\n').forEach((line) => { let ev; try { ev = JSON.parse(line); } catch (e) { return; } if (ev.type === 'answer') got = ev; else if (ev.type === 'error') err = ev; });
        if (!got) fail((err && err.message) || T('The answer stopped before it arrived. Try again.', 'Η απάντηση σταμάτησε πριν φτάσει. Δοκίμασε ξανά.'));
        else {
          working.remove();
          const mine = (from !== pageId ? [] : Array.isArray(got.steps) ? got.steps : []).filter((st) => st && targets.has(st.id) && typeof st.say === 'string').slice(0, 4);   // only things this page listed
          const words = String(got.text || '').replace(/\*\*/g, '').trim();
          if (!words && !mine.length) say(el('div', { class: 'kg-err' }, T('Kleanthis had nothing to say to that. Try again in other words.', 'Ο Κλεάνθης δεν είχε κάτι να πει. Δοκίμασε με άλλα λόγια.')));
          if (words) { const box = el('div', { class: 'kg-a' }); words.split('\n').forEach((l) => { if (l.trim()) box.append(el('p', null, l.trim())); }); say(box); }
          history.push({ role: 'user', text }, { role: 'assistant', text: words });
          startSteps(mine);
          speak([words, mine[0] && mine[0].say].filter(Boolean).join(' '));
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) fail(T('Kleanthis could not be reached.', 'Δεν ήταν δυνατή η σύνδεση με τον Κλεάνθη.')); else working.remove();
    }
    busy = false; stop = null;
    chips();
    panel.querySelectorAll('.kg-in button').forEach((b) => { b.disabled = false; });
  }

  function build() {
    SC.css('/site/guide.css');
    const voiceBtn = el('button', { type: 'button', class: 'kg-voice', 'aria-pressed': String(voiceOn), onclick: () => {
      voiceOn = !voiceOn; store.set('sc.guide.voice', voiceOn ? '1' : '0'); if (!voiceOn) hush();
      voiceBtn.setAttribute('aria-pressed', String(voiceOn)); voiceBtn.textContent = voiceOn ? T('Voice on', 'Φωνή ανοιχτή') : T('Voice off', 'Φωνή κλειστή');
    } }, voiceOn ? T('Voice on', 'Φωνή ανοιχτή') : T('Voice off', 'Φωνή κλειστή'));
    if (!synth()) voiceBtn.hidden = true;   // a browser with no voice: the text is all there is, and no switch pretends otherwise
    panel = el('div', { class: 'kg-panel', hidden: true, role: 'dialog', 'aria-label': T('Kleanthis guides you through this page', 'Ο Κλεάνθης σε οδηγεί σε αυτή τη σελίδα') },
      el('div', { class: 'kg-h' },
        el('div', { class: 'kg-ht' }, el('b', null, T('Guide me', 'Οδήγησέ με')), el('small', null, '')),
        voiceBtn,
        el('button', { type: 'button', class: 'kg-x', 'aria-label': T('Close', 'Κλείσιμο'), onclick: () => toggle(false) }, '×')),
      el('div', { class: 'kg-b' },
        el('p', { class: 'kg-lede' }, T('Kleanthis explains this page, asks you a question and shows you where to press with a red light.', 'Ο Κλεάνθης εξηγεί τη σελίδα, σου κάνει μια ερώτηση και σου δείχνει με ένα κόκκινο φως πού να πατήσεις.')),
        el('div', { class: 'kg-feed', role: 'log', 'aria-live': 'polite' }),
        el('ol', { class: 'kg-steps', hidden: true, 'aria-live': 'polite' }),
        el('div', { class: 'kg-ctl', hidden: true },
          el('button', { type: 'button', onclick: () => next(false) }, T('Skip this step', 'Παράλειψε το βήμα')),
          el('button', { type: 'button', onclick: () => { hush(); finish(T('Steps stopped.', 'Τα βήματα σταμάτησαν.')); } }, T('Stop', 'Στοπ'))),
        el('div', { class: 'kg-chips' }),
        el('div', { class: 'kg-in' },
          el('input', { type: 'text', maxlength: 300, 'aria-label': T('Your answer or question', 'Η απάντηση ή η ερώτησή σου'), placeholder: T('Type your answer or a question…', 'Γράψε την απάντηση ή μια ερώτηση…'),
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); typed(); } } }),
          el('button', { type: 'button', onclick: typed }, T('Send', 'Στείλε')))),
      el('div', { class: 'kg-f' }, T('AI assistant · not a person · no microphone, nothing is recorded', 'Βοηθός AI · όχι άνθρωπος · χωρίς μικρόφωνο, τίποτα δεν ηχογραφείται')));
    btn = el('button', { type: 'button', class: 'kg-btn', 'aria-expanded': 'false', onclick: () => toggle(!open) },
      el('i', { class: 'kg-ic', 'aria-hidden': 'true' }), el('span', null, T('Guide me', 'Οδήγησέ με')));
    dot = el('div', { class: 'kg-dot' + (reduced() ? ' still' : ''), hidden: true, 'aria-hidden': 'true' });
    root = el('div', { class: 'kg-root' }, panel, btn);
    document.body.append(root, dot);
    document.addEventListener('click', onClick, true);
    addEventListener('keydown', (e) => {   // Escape closes the guide, unless the student is closing a dialog of the page
      if (e.key !== 'Escape' || !open || e.defaultPrevented) return;
      const other = [...document.querySelectorAll('[role="dialog"], dialog[open]')].some((d) => !root.contains(d) && !d.closest('.kb-root') && visible(d));
      if (!other) toggle(false);
    });
    addEventListener('scroll', () => { if (at >= 0) place(); }, true);
    addEventListener('pagehide', hush);
  }

  function toggle(want) {
    open = !!want;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) { if (SC.askBubble && SC.askBubble.close) SC.askBubble.close(); loadKit(); if (!who && !feed().children.length) welcome(); else chips(); setTimeout(() => { const c = panel.querySelector('.kg-chip'); if (c && open) c.focus(); }, 30); }
    else { if (stop) stop(); hush(); finish(''); if (panel.contains(document.activeElement)) btn.focus(); }
  }

  SC.guide = {
    setPage(id, name) {
      if (!root) build();
      const moved = id !== pageId;
      pageId = id; pageName = name || id;
      if (moved) { hush(); if (arrived && Date.now() - arrivedAt > 2000) {   // the move that brought the student here can be reported a moment after the press; any later move is a new page
        arrived = false; if (open) chips(); } }
      panel.querySelector('.kg-ht small').textContent = pageName;
      root.hidden = id === 'ask';
      if (root.hidden && open) toggle(false);
      // the buttons of the old page are gone; a step that pointed at one of them cannot be followed any more (a menu link still can)
      if (moved && at >= 0 && steps[at] && steps[at].id.startsWith('el:')) finish(T('The page changed, so I stopped the steps.', 'Η σελίδα άλλαξε, γι’ αυτό σταμάτησα τα βήματα.'));
    },
    close() { if (root && open) toggle(false); },
  };
}());
