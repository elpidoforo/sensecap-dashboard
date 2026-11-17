/*
  The engine behind the lesson builders (Lesson builder today, the STEAM builder next). It knows nothing about any one
  subject: a page hands it a list of steps, each step a bank of choices, and a function that turns the choices into the
  printed plan. The engine gives back the three-column screen (steps, choices, the plan as it will print), the link that
  carries the whole plan, the print button, the balance of learning types, and the plan assistant.

  Where a plan lives: ONLY in the address of the page, after the #. The part after # is never sent to a server, so a
  teacher can mail the link to a colleague and nothing about their class is stored here. The one free-text field (the
  aim in the teacher's own words) passes TK4.checkText, the site's privacy check, when it is typed and again when a
  link is opened, exactly as the Experiment builder does.

  The assistant: the panel sends the plan as words, together with the choices that exist, to the same assistant as
  #/ask (POST /app/api/ask). It answers in words and may end with one line of proposed changes. The page reads only
  that line, keeps the changes whose values exist in the banks, and shows them as buttons. Nothing is applied until a
  teacher presses one: a model may suggest a lesson, it may not write one unseen.

  SC.LB.mount(root, ctx, spec) - see lessonbuilder.js for a full spec.
*/
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const T = (p) => (Array.isArray(p) ? SC.t(p[0], p[1]) : p);
  const el = (tag, attrs, ...kids) => SC.el(tag, attrs, ...kids);

  const kit = () => (window.TK4 ? Promise.resolve(window.TK4) : (window.__tk4p = window.__tk4p || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk4-kit.js?v=1';
    s.onload = () => res(window.TK4); s.onerror = () => { window.__tk4p = null; s.remove(); rej(new Error('kit')); };
    document.head.append(s);
  })));

  // The six ways of learning (Laurillard's learning types), in plain words. A plan says how many minutes of each it
  // holds, and the bar shows the balance: a lesson that is all listening is visible at a glance.
  const TYPES = {
    acquire: ['Listening and reading', 'Ακούν και διαβάζουν', '#9db0c8'],
    investigate: ['Finding out', 'Ερευνούν', '#4CCBEA'],
    practise: ['Doing it themselves', 'Εξασκούνται', '#5EE0A8'],
    discuss: ['Talking it through', 'Συζητούν', '#F7C46B'],
    collaborate: ['Working together', 'Συνεργάζονται', '#C4B8FF'],
    produce: ['Making something', 'Φτιάχνουν κάτι', '#ff9a6b'],
  };

  function balanceBar(minutes) {
    const rows = Object.keys(minutes).filter((k) => minutes[k] > 0);
    const total = rows.reduce((a, k) => a + minutes[k], 0) || 1;
    const bar = el('div', { class: 'lb-bal' });
    rows.forEach((k) => {
      const w = (minutes[k] / total) * 100;
      bar.append(el('span', { class: 'lb-balseg', style: 'width:' + w.toFixed(1) + '%;background:' + TYPES[k][2],
        title: T([TYPES[k][0], TYPES[k][1]]) + ' · ' + minutes[k] + ' min' }));
    });
    const key = el('div', { class: 'lb-balkey' }, ...rows.map((k) => el('span', null,
      el('i', { style: 'background:' + TYPES[k][2] }), T([TYPES[k][0], TYPES[k][1]]), ' ', el('b', null, minutes[k] + '′'))));
    const most = rows.sort((a, c) => minutes[c] - minutes[a])[0];
    const nudge = most === 'acquire' && minutes.acquire / total > 0.45
      ? SC.t('Most of this lesson is listening. The platform is at its best when they are finding things out themselves.',
        'Το μεγαλύτερο μέρος του μαθήματος είναι ακρόαση. Η πλατφόρμα αξίζει περισσότερο όταν ερευνούν οι ίδιοι.')
      : '';
    return el('div', { class: 'lb-balance' },
      el('h4', null, SC.t('How the time is spent', 'Πώς περνά ο χρόνος')),
      bar, key, nudge ? el('p', { class: 'lb-nudge' }, nudge) : null);
  }

  /* ---------- the plan assistant ---------- */
  function assistant(spec, S, apply, K) {
    const feed = el('div', { class: 'lb-chatfeed', role: 'log', 'aria-live': 'polite' });
    const input = el('input', { type: 'text', class: 'nm-input', 'aria-label': SC.t('Ask about this plan', 'Ρώτα για αυτό το σχέδιο'),
      placeholder: SC.t('My class is 10 and new to this…', 'Η τάξη μου είναι 10 ετών και άπειρη…') });
    let busy = false;

    const ideas = [
      ['Make this work for a class of 10-year-olds.', 'Κάνε το να ταιριάζει σε τάξη 10 ετών.'],
      ['We only have one 45-minute lesson.', 'Έχουμε μόνο ένα μάθημα 45 λεπτών.'],
      ['Add something for the fastest students.', 'Πρόσθεσε κάτι για τους πιο γρήγορους μαθητές.'],
      ['We cannot go outside. What changes?', 'Δεν μπορούμε να βγούμε έξω. Τι αλλάζει;'],
      ['Make the maths harder.', 'Κάνε τα μαθηματικά πιο δύσκολα.'],
    ];

    // The one line the page reads back: CHANGES: key=value; key=value
    function readChanges(text) {
      const m = /(?:^|\n)\s*CHANGES\s*:\s*([^\n]+)/i.exec(String(text || ''));
      if (!m) return [];
      const out = [];
      m[1].split(/[;,]/).forEach((bit) => {
        const kv = /^\s*([a-z0-9_]+)\s*=\s*([a-z0-9_.-]+)\s*$/i.exec(bit);
        if (!kv) return;
        const f = spec.fields.find((x) => x.key === kv[1]);
        if (!f || f.kind === 'text') return;                        // only a choice can be applied, never free text
        const opt = (f.opts || []).find((o) => o.id === kv[2]);
        if (!opt) return;                                           // a value that is not on the page is not applied
        out.push({ key: f.key, id: opt.id, label: T(f.step.title) + ': ' + T(opt.label) });
      });
      return out;
    }

    const strip = (text) => String(text || '').replace(/(?:^|\n)\s*CHANGES\s*:[^\n]*/i, '').trim();

    async function send(q) {
      if (busy || !q) return;
      busy = true; input.value = '';
      feed.append(el('div', { class: 'lb-you' }, q));
      const working = el('div', { class: 'lb-work' }, SC.t('Thinking…', 'Σκέφτεται…'));
      feed.append(working);
      feed.scrollTop = feed.scrollHeight;
      const banks = spec.fields.filter((f) => f.kind !== 'text')
        .map((f) => f.key + ' = ' + (f.opts || []).map((o) => o.id).join(' | ')).join('\n');
      const ask = [
        q,
        '',
        SC.t('This is the lesson plan I am building on Kleanthis, the school data platform:', 'Αυτό είναι το σχέδιο μαθήματος που φτιάχνω στον Κλεάνθη, την πλατφόρμα σχολικών δεδομένων:'),
        spec.chat.summary(S, K),
        '',
        SC.t('Answer in a few sentences, for a teacher. If a change to the plan would help, end with one line exactly like CHANGES: key=value; key=value using only these keys and values:', 'Απάντησε σε λίγες προτάσεις, για εκπαιδευτικό. Αν βοηθά μια αλλαγή στο σχέδιο, τελείωσε με μία γραμμή ακριβώς έτσι: CHANGES: key=value; key=value χρησιμοποιώντας μόνο αυτά τα κλειδιά και τις τιμές:'),
        banks,
      ].join('\n');
      try {
        const r = await fetch('/app/api/ask', { method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: ask, history: [] }) });
        let text = '', err = '';
        if (!r.ok) {
          let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
          err = r.status === 503
            ? SC.t('The assistant is not switched on yet. The plan still works without it.', 'Ο βοηθός δεν έχει ενεργοποιηθεί ακόμη. Το σχέδιο δουλεύει και χωρίς αυτόν.')
            : (b && b.error) || SC.t('The assistant could not answer just now.', 'Ο βοηθός δεν μπόρεσε να απαντήσει τώρα.');
        } else {
          const reader = r.body.getReader(), dec = new TextDecoder();
          let buf = '';
          const handle = (line) => {
            let ev; try { ev = JSON.parse(line); } catch (e) { return; }
            if (ev.type === 'answer') text = String(ev.text || '');
            else if (ev.type === 'error') err = ev.message || '';
          };
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(line); }
          }
          if (buf.trim()) handle(buf.trim());
        }
        working.remove();
        if (err || !text) { feed.append(el('div', { class: 'lb-err' }, err || SC.t('No answer came back.', 'Δεν ήρθε απάντηση.'))); }
        else {
          const box = el('div', { class: 'lb-them' });
          strip(text).split('\n').forEach((line) => { const s = line.replace(/\*\*/g, '').trim(); if (s) box.append(el('p', null, s)); });
          const changes = readChanges(text);
          if (changes.length) {
            box.append(el('p', { class: 'lb-chatfine' }, SC.t('Suggested changes. Nothing changes until you press one:', 'Προτεινόμενες αλλαγές. Τίποτα δεν αλλάζει μέχρι να πατήσεις:')));
            box.append(el('div', { class: 'lb-applies' }, ...changes.map((c) => el('button', {
              type: 'button', class: 'lb-apply', onclick: (e) => { apply(c.key, c.id); e.target.disabled = true; e.target.classList.add('done'); },
            }, c.label))));
          }
          feed.append(box);
        }
      } catch (e) {
        working.remove();
        feed.append(el('div', { class: 'lb-err' }, SC.t('The assistant could not be reached.', 'Δεν ήταν δυνατή η σύνδεση με τον βοηθό.')));
      }
      feed.scrollTop = feed.scrollHeight;
      busy = false;
    }

    return el('section', { class: 'lb-chat k4-noprint' },
      el('h3', null, SC.t('Adapt this plan', 'Προσάρμοσε το σχέδιο')),
      el('p', { class: 'lb-hint' }, SC.t('Tell the assistant about your class and it will suggest changes you can apply with one press. It can only choose from the same options you can.',
        'Πες στον βοηθό για την τάξη σου και θα προτείνει αλλαγές που εφαρμόζεις με ένα πάτημα. Μπορεί να διαλέξει μόνο από τις ίδιες επιλογές που έχεις κι εσύ.')),
      el('div', { class: 'lb-ideas' }, ...ideas.map((p) => el('button', { type: 'button', class: 'lb-idea', onclick: () => send(T(p)) }, T(p)))),
      feed,
      el('div', { class: 'lb-chatin' }, input,
        el('button', { type: 'button', class: 'nm-btn nm-btn--primary', onclick: () => send(input.value.trim()) }, SC.t('Ask', 'Ρώτα'))),
      el('p', { class: 'lb-chatfine' }, SC.t('AI assistant · not a person. A plan it suggests is still yours to check.', 'Βοηθός AI · όχι άνθρωπος. Το σχέδιο που προτείνει το ελέγχεις εσύ.')));
  }

  /* ---------- the screen ---------- */
  function mount(root, ctx, spec) {
    let alive = true, K = null;
    const q = ctx.query || new URLSearchParams('');
    const S = {};
    spec.fields.forEach((f) => { S[f.key] = f.kind === 'many' ? (f.value || []).slice() : (f.value != null ? f.value : ''); });

    const head = SC.head({
      title: T(spec.head.title), lede: T(spec.head.lede), help: spec.head.help,
      tags: [{ text: SC.t('Nothing is saved', 'Δεν αποθηκεύεται τίποτα'), cls: 'arch' }],
    });
    root.append(head);
    const host = el('div', { class: 'k4 lb' }, el('div', { class: 'loading' }, SC.t('Loading', 'Φόρτωση')));
    root.append(host);

    let dropped = false;
    function fromLink() {
      spec.fields.forEach((f) => {
        const raw = q.get(f.key);
        if (raw == null) return;
        if (f.kind === 'many') S[f.key] = raw.split('.').filter((id) => (f.opts || []).some((o) => o.id === id)).slice(0, f.max || 8);
        else if (f.kind === 'text') { const r = K.checkText(raw, f.max || 140); if (r.ok) S[f.key] = r.text; else dropped = true; }
        else if ((f.opts || []).some((o) => o.id === raw)) S[f.key] = raw;
      });
    }
    function link() {
      const p = new URLSearchParams();
      spec.fields.forEach((f) => {
        const v = S[f.key];
        if (f.kind === 'many') { if (v && v.length) p.set(f.key, v.join('.')); }
        else if (v) p.set(f.key, v);
      });
      const s = p.toString();
      return location.origin + location.pathname + location.search + '#/' + spec.id + (s ? '?' + s : '');
    }

    let stepsEl, panelEl, planEl, linkIn, open = 0;

    function set(key, val) {
      const f = spec.fields.find((x) => x.key === key); if (!f) return;
      if (f.kind === 'many') {
        const list = S[key].slice(), i = list.indexOf(val);
        if (i >= 0) list.splice(i, 1); else if (list.length < (f.max || 8)) list.push(val);
        S[key] = list;
      } else S[key] = val;
      draw();
    }
    function applyFromChat(key, val) {
      const f = spec.fields.find((x) => x.key === key); if (!f) return;
      if (f.kind === 'many') { if (!S[key].includes(val)) S[key] = S[key].concat([val]); } else S[key] = val;
      draw();
      SC.toast(SC.t('Changed: ', 'Άλλαξε: ') + T(f.step.title));
    }

    const filled = (f) => (f.kind === 'many' ? S[f.key].length > 0 : !!S[f.key]);

    function drawSteps() {
      stepsEl.replaceChildren(el('h2', null, SC.t('STEPS', 'ΒΗΜΑΤΑ')),
        ...spec.fields.map((f, i) => el('button', {
          type: 'button', class: 'lb-step' + (i === open ? ' on' : '') + (filled(f) ? ' done' : ''),
          'aria-current': i === open ? 'step' : 'false',
          onclick: () => { open = i; draw(); },
        }, el('i', null, filled(f) && i !== open ? '✓' : String(i + 1)),
          el('span', null, el('b', null, T(f.step.title)), el('small', null, filled(f) ? valueWords(f) : T(f.step.hint))))));
    }
    function valueWords(f) {
      if (f.kind === 'text') return S[f.key];
      if (f.kind === 'many') return S[f.key].map((id) => T((f.opts.find((o) => o.id === id) || {}).label)).join(' · ');
      const o = f.opts.find((x) => x.id === S[f.key]);
      return o ? T(o.label) : '';
    }

    function drawPanel() {
      const f = spec.fields[open];
      const body = [];
      if (f.kind === 'text') {
        const note = K.noteField({ max: f.max || 140, value: S[f.key], label: T(f.label || f.step.title),
          hint: SC.t('No names, no links, no phone numbers, no exact places.', 'Χωρίς ονόματα, συνδέσμους, τηλέφωνα ή ακριβή σημεία.'),
          onChange: (r) => { S[f.key] = r && r.ok ? r.text : ''; drawPlan(); drawSteps(); } });
        body.push(note.node);
      } else {
        const chips = el('div', { class: 'lb-chips' }, ...(f.opts || []).map((o) => el('button', {
          type: 'button', class: 'lb-chip' + ((f.kind === 'many' ? S[f.key].includes(o.id) : S[f.key] === o.id) ? ' on' : ''),
          'aria-pressed': String(f.kind === 'many' ? S[f.key].includes(o.id) : S[f.key] === o.id),
          onclick: () => set(f.key, o.id),
        }, el('b', null, T(o.label)), o.sub ? el('small', null, T(o.sub)) : null)));
        body.push(chips);
      }
      if (f.after) body.push(f.after(S, K));
      panelEl.replaceChildren(
        el('h3', null, T(f.step.title)),
        el('p', { class: 'lb-hint' }, T(f.step.hint)),
        ...body.filter(Boolean),
        el('div', { class: 'lb-move' },
          open > 0 ? el('button', { type: 'button', class: 'nm-btn', onclick: () => { open--; draw(); } }, SC.t('← Back', '← Πίσω')) : null,
          open < spec.fields.length - 1 ? el('button', { type: 'button', class: 'nm-btn nm-btn--primary', onclick: () => { open++; draw(); } }, SC.t('Next →', 'Επόμενο →')) : null));
    }

    function drawPlan() {
      try { history.replaceState(null, '', link()); } catch (e) { /* the plan still works, only the address stays as it was */ }
      if (linkIn) linkIn.value = link();
      const p = spec.plan(S, K);
      planEl.replaceChildren(...[
        el('div', { class: 'lb-paper' },
          el('h2', null, p.title),
          el('p', { class: 'lb-meta' }, p.meta.join(' · ')),
          ...p.sections.map((sec) => el('section', { class: 'lb-sec' + (sec.page ? ' lb-break' : '') },
            el('h4', null, sec.h), ...(Array.isArray(sec.body) ? sec.body : [sec.body]).filter(Boolean)))),
        p.minutes ? balanceBar(p.minutes) : null,
      ].filter(Boolean));
    }

    function draw() { drawSteps(); drawPanel(); drawPlan(); }

    kit().then((k) => {
      if (!alive) return;
      K = k;
      K.printMode(true);
      fromLink();
      stepsEl = el('aside', { class: 'lb-rail k4-noprint' });
      panelEl = el('main', { class: 'lb-panel k4-noprint' });
      planEl = el('div', { class: 'lb-prev' });
      linkIn = el('input', { class: 'nm-input', readonly: true, 'aria-label': SC.t('Link to this plan', 'Σύνδεσμος για αυτό το σχέδιο') });
      const tools = el('div', { class: 'lb-tools k4-noprint' },
        K.printBtn(SC.t('Download the PDF (print)', 'Κατέβασε το PDF (εκτύπωση)')),
        el('button', { type: 'button', class: 'nm-btn', onclick: () => { linkIn.select(); try { document.execCommand('copy'); SC.toast(SC.t('Link copied', 'Ο σύνδεσμος αντιγράφηκε')); } catch (e) { /* the box is there to copy by hand */ } } }, SC.t('Copy the link', 'Αντίγραψε τον σύνδεσμο')),
        linkIn);
      host.replaceChildren(...[
        dropped ? el('p', { class: 'lb-drop k4-noprint' }, SC.t('A line in that link was left out because it did not pass the privacy check.', 'Μια γραμμή του συνδέσμου παραλείφθηκε γιατί δεν πέρασε τον έλεγχο ιδιωτικότητας.')) : null,
        el('div', { class: 'lb-cols' }, stepsEl, el('div', null, panelEl, assistant(spec, S, applyFromChat, K)), el('div', { class: 'lb-side' }, tools, planEl)),
      ].filter(Boolean));
      draw();
    }).catch(() => { if (alive) host.replaceChildren(el('div', { class: 'err', role: 'alert' }, SC.t('This page could not be loaded.', 'Η σελίδα δεν φόρτωσε.'))); });

    return () => { alive = false; if (K) K.printMode(false); };
  }

  SC.LB = { mount, TYPES };
}());
