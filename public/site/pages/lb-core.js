/*
  The engine behind the lesson builders (Lesson builder today, the STEAM builder next). It knows nothing about any one
  subject: a page hands it a bank of starting points, a list of fields, and a function that writes the plan. The engine
  gives back the two screens.

  Screen one, the chooser: the starting points as cards, because a teacher begins with a question, not a blank form.
  Screen two, the editor: the plan itself in the middle, as paper, and the parts that can change are underlined inside
  it - press the words "six stops" and the choices open on that phrase. There is no form: what you see is what prints.
  Around the paper sit the plan's own outline (left), how the minutes are spent (above) and the plan assistant (right).

  Where a plan lives: ONLY in the address of the page, after the #. That part is never sent to a server, so a teacher
  can mail the link to a colleague and nothing about their class is stored here. Free-text fields pass TK4.checkText,
  the site's privacy check, when they are typed and again when a link is opened.

  The assistant sends the plan as words, with the choices that exist, to the same assistant as #/ask. It answers in
  words and may end with one line of proposed changes; the page reads only that line, keeps the values that exist in
  the banks, and shows them as buttons. Nothing is applied until a teacher presses one.

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
  // holds, and the ribbon shows the balance: a lesson that is all listening is visible at a glance.
  const TYPES = {
    acquire: ['Listening', 'Ακούν', '#9db0c8'],
    investigate: ['Finding out', 'Ερευνούν', '#4CCBEA'],
    practise: ['Practising', 'Εξασκούνται', '#5EE0A8'],
    discuss: ['Talking', 'Συζητούν', '#F7C46B'],
    collaborate: ['Together', 'Μαζί', '#C4B8FF'],
    produce: ['Making', 'Φτιάχνουν', '#ff9a6b'],
  };

  function ribbon(minutes) {
    const keys = Object.keys(minutes).filter((k) => minutes[k] > 0 && TYPES[k]);
    const total = keys.reduce((a, k) => a + minutes[k], 0) || 1;
    const bar = el('div', { class: 'lb-ribbon' }, ...keys.map((k) => el('span', {
      class: 'lb-seg', style: 'width:' + ((minutes[k] / total) * 100).toFixed(2) + '%;background:' + TYPES[k][2],
      title: T([TYPES[k][0], TYPES[k][1]]) + ' · ' + minutes[k] + SC.t(' min', ' λεπτά'),
    }, el('b', null, T([TYPES[k][0], TYPES[k][1]])), el('small', null, minutes[k] + '′'))));
    // Doing, in this count, is the three types where the class works: investigating, practising, making.
    const doing = (minutes.investigate || 0) + (minutes.practise || 0) + (minutes.produce || 0);
    const ok = doing * 3 >= total;
    const line = ok
      ? SC.t('Good balance: at least a third of this lesson is the class working and finding things out for themselves.',
        'Καλή ισορροπία: τουλάχιστον το ένα τρίτο του μαθήματος η τάξη δουλεύει και ερευνά μόνη της.')
      : SC.t('Most of this lesson is listening and talking. The platform is at its best when they are finding things out themselves.',
        'Το μεγαλύτερο μέρος είναι ακρόαση και συζήτηση. Η πλατφόρμα αξίζει περισσότερο όταν ερευνούν οι ίδιοι.');
    return el('div', { class: 'lb-time' },
      el('div', { class: 'lb-timehead' },
        el('span', null, SC.t('HOW THE TIME IS SPENT', 'ΠΩΣ ΠΕΡΝΑ Ο ΧΡΟΝΟΣ')),
        el('span', null, total + SC.t(' MIN IN ALL', ' ΛΕΠΤΑ ΣΥΝΟΛΙΚΑ'))),
      bar,
      el('p', { class: 'lb-timenote' + (ok ? ' ok' : '') }, line));
  }

  /* ---------- the assistant ---------- */
  function assistant(spec, S, apply, K) {
    const feed = el('div', { class: 'lb-feed', role: 'log', 'aria-live': 'polite' });
    const input = el('input', { type: 'text', class: 'lb-askin', maxlength: 300, 'aria-label': SC.t('Ask about this plan', 'Ρώτα για αυτό το σχέδιο'),
      placeholder: SC.t('Ask about this plan…', 'Ρώτα για αυτό το σχέδιο…') });
    let busy = false, ctl = null;
    const ideas = spec.chat.ideas || [
      ['Mine are 10 and new to this', 'Είναι 10 ετών και άπειροι'],
      ['Only one 45-minute lesson', 'Μόνο ένα μάθημα 45 λεπτών'],
      ['We cannot go outside', 'Δεν μπορούμε να βγούμε έξω'],
      ['Harder maths', 'Πιο δύσκολα μαθηματικά'],
    ];

    function readChanges(text) {
      const m = /(?:^|\n)\s*CHANGES\s*:\s*([^\n]+)/i.exec(String(text || ''));
      if (!m) return [];
      const out = [];
      m[1].split(/[;,]/).forEach((bit) => {
        const kv = /^\s*([a-z0-9_]+)\s*=\s*([a-z0-9_.-]+)\s*$/i.exec(bit);
        if (!kv) return;
        const f = spec.fields.find((x) => x.key === kv[1]);
        if (!f || f.kind === 'text') return;                     // only a choice can be applied, never free text
        const opt = (f.opts || []).find((o) => o.id === kv[2]);
        if (!opt) return;                                        // a value that is not on the page is not applied
        out.push({ key: f.key, id: opt.id, label: T(f.short || f.step.title) + ' → ' + T(opt.label) });
      });
      return out;
    }
    const strip = (t) => String(t || '').replace(/(?:^|\n)\s*CHANGES\s*:[^\n]*/i, '').trim();

    async function send(raw) {
      if (busy || !raw) return;
      // The same privacy check the written parts of the plan go through: nothing with a name,
      // a link, an email or a phone number in it leaves this page.
      const checked = K.checkText(raw, 300);
      if (!checked.ok) {
        feed.append(el('div', { class: 'lb-oops' }, checked.why || SC.t('That line cannot be sent.', 'Αυτή η γραμμή δεν μπορεί να σταλεί.')));
        feed.scrollTop = feed.scrollHeight;
        return;
      }
      const q = checked.text;
      busy = true; input.value = '';
      feed.append(el('div', { class: 'lb-me' }, q));
      const working = el('div', { class: 'lb-working' }, SC.t('Thinking…', 'Σκέφτεται…'));
      feed.append(working); feed.scrollTop = feed.scrollHeight;
      const banks = spec.fields.filter((f) => f.kind !== 'text')
        .map((f) => f.key + ' = ' + (f.opts || []).map((o) => o.id).join(' | ')).join('\n');
      const ask = [q, '',
        SC.t('This is the lesson plan I am building on Kleanthis, the school data platform:', 'Αυτό είναι το σχέδιο μαθήματος που φτιάχνω στον Κλεάνθη, την πλατφόρμα σχολικών δεδομένων:'),
        spec.chat.summary(S, K), '',
        SC.t('Answer in a few sentences, for a teacher. If a change to the plan would help, end with one line exactly like CHANGES: key=value; key=value using only these keys and values:', 'Απάντησε σε λίγες προτάσεις, για εκπαιδευτικό. Αν βοηθά μια αλλαγή στο σχέδιο, τελείωσε με μία γραμμή ακριβώς έτσι: CHANGES: key=value; key=value χρησιμοποιώντας μόνο αυτά τα κλειδιά και τις τιμές:'),
        banks].join('\n');
      try {
        ctl = new AbortController();
        const r = await fetch('/app/api/ask', { method: 'POST', credentials: 'same-origin', signal: ctl.signal,
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: ask, history: [] }) });
        let text = '', err = '';
        if (!r.ok) {
          let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
          err = r.status === 503
            ? SC.t('The assistant is not switched on yet. The plan works without it.', 'Ο βοηθός δεν έχει ενεργοποιηθεί ακόμη. Το σχέδιο δουλεύει και χωρίς αυτόν.')
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
        if (err || !text) feed.append(el('div', { class: 'lb-oops' }, err || SC.t('No answer came back.', 'Δεν ήρθε απάντηση.')));
        else {
          const box = el('div', { class: 'lb-them' });
          strip(text).split('\n').forEach((line) => { const s = line.replace(/\*\*/g, '').trim(); if (s) box.append(el('p', null, s)); });
          const changes = readChanges(text);
          if (changes.length) box.append(el('div', { class: 'lb-applies' }, ...changes.map((c) => el('button', {
            type: 'button', class: 'lb-apply',
            onclick: (e) => { apply(c.key, c.id); e.currentTarget.disabled = true; e.currentTarget.classList.add('done'); },
          }, el('span', null, c.label), el('small', null, SC.t('APPLY', 'ΕΦΑΡΜΟΓΗ'))))));
          feed.append(box);
        }
      } catch (e) {
        working.remove();
        if (!(e && e.name === 'AbortError')) feed.append(el('div', { class: 'lb-oops' }, SC.t('The assistant could not be reached.', 'Δεν ήταν δυνατή η σύνδεση με τον βοηθό.')));
      }
      ctl = null;
      feed.scrollTop = feed.scrollHeight; busy = false;
    }

    const side = el('aside', { class: 'lb-side k4-noprint' },
      el('h2', null, SC.t('Adapt this plan', 'Προσάρμοσε το σχέδιο')),
      el('p', { class: 'lb-sidehint' }, SC.t('Tell it about your class. It can only choose from the options you can, and nothing changes until you press.',
        'Πες του για την τάξη σου. Μπορεί να διαλέξει μόνο από τις επιλογές που έχεις κι εσύ, και τίποτα δεν αλλάζει μέχρι να πατήσεις.')),
      el('div', { class: 'lb-sugs' }, ...ideas.map((p) => el('button', { type: 'button', class: 'lb-sug', onclick: () => send(T(p)) }, T(p)))),
      feed,
      el('div', { class: 'lb-ask' }, input,
        el('button', { type: 'button', class: 'lb-askgo', onclick: () => send(input.value.trim()) }, SC.t('Ask', 'Ρώτα'))),
      el('p', { class: 'lb-fine' }, SC.t('AI ASSISTANT · NOT A PERSON · YOU CHECK THE PLAN', 'ΒΟΗΘΟΣ AI · ΟΧΙ ΑΝΘΡΩΠΟΣ · ΤΟ ΣΧΕΔΙΟ ΤΟ ΕΛΕΓΧΕΙΣ ΕΣΥ')));
    side.__stop = () => { if (ctl) { try { ctl.abort(); } catch (e) { /* already finished */ } ctl = null; } };
    return side;
  }

  /* ---------- the screen ---------- */
  function mount(root, ctx, spec) {
    let alive = true, K = null, pop = null, dropped = false;
    // One outside-click listener and one timer for the whole page, taken down with the popover.
    let awayOn = false, awayTimer = 0, popNote = null, popPaint = null, stopAsk = null;
    const q = ctx.query || new URLSearchParams('');
    const S = {};
    spec.fields.forEach((f) => { S[f.key] = f.kind === 'many' ? (f.value || []).slice() : (f.value != null ? f.value : ''); });
    const field = (key) => spec.fields.find((f) => f.key === key);
    const prime = () => field(spec.primary);

    const host = el('div', { class: 'lb' }, el('div', { class: 'loading' }, SC.t('Loading', 'Φόρτωση')));
    root.append(host);

    function fromLink() {
      spec.fields.forEach((f) => {
        const raw = q.get(f.key);
        if (raw == null) return;
        if (f.kind === 'many') S[f.key] = raw.split('.')
          .filter((id, i, a) => a.indexOf(id) === i && (f.opts || []).some((o) => o.id === id)).slice(0, f.max || 8);
        else if (f.kind === 'text') { const r = K.checkText(raw, f.max || 160); if (r.ok) S[f.key] = r.text; else dropped = true; }
        else if ((f.opts || []).some((o) => o.id === raw)) S[f.key] = raw;
      });
    }
    function link() {
      const p = new URLSearchParams();
      spec.fields.forEach((f) => {
        const v = S[f.key];
        if (f.kind === 'many') { if (v && v.length) p.set(f.key, v.join('.')); } else if (v) p.set(f.key, v);
      });
      const s = p.toString();
      return location.origin + location.pathname + location.search + '#/' + spec.id + (s ? '?' + s : '');
    }
    const filled = (f) => (f.kind === 'many' ? S[f.key].length > 0 : !!S[f.key]);

    function set(key, val) {
      const f = field(key); if (!f) return;
      if (f.kind === 'many') {
        const list = S[key].slice(), i = list.indexOf(val);
        if (i >= 0) { if (list.length > 1 || !f.atLeastOne) list.splice(i, 1); } else if (list.length < (f.max || 8)) list.push(val);
        S[key] = list;
      } else S[key] = (S[key] === val && f.clearable) ? '' : val;
      if (f.kind !== 'many') closePop(); else if (popPaint) popPaint();
      draw();
    }

    /* ---- the popover that edits a phrase where it stands ---- */
    function away(ev) { if (pop && !pop.contains(ev.target) && ev.target !== pop.__anchor) closePop(true); }
    function closePop(redraw) {
      clearTimeout(awayTimer);
      if (awayOn) { document.removeEventListener('mousedown', away); awayOn = false; }
      const hadNote = !!popNote;
      if (pop) { pop.remove(); pop = null; }
      popNote = null; popPaint = null;
      if (hadNote && redraw) draw();          // a typed line is kept whether you press Done or click away
    }
    function openPop(key, anchor) {
      closePop();
      const f = field(key); if (!f) return;
      let note = null;
      if (f.kind === 'text') {
        note = K.noteField({ max: f.max || 160, value: S[f.key], label: T(f.step.title),
          hint: SC.t('No names, no links, no phone numbers, no exact places.', 'Χωρίς ονόματα, συνδέσμους, τηλέφωνα ή ακριβή σημεία.'),
          onChange: (r) => { S[f.key] = r && r.ok ? r.text : ''; if (r && r.ok && r.text) dropped = false; } });
      }
      // The choices stay in step with the plan: a many-choice pick repaints the ticks in place.
      const marks = [];
      const opts = note ? null : el('div', { class: 'lb-opts' }, ...(f.opts || []).map((o) => {
        const tick = el('i', null, '✓');
        const btn = el('button', { type: 'button', class: 'lb-opt', onclick: () => set(f.key, o.id) },
          el('span', null, el('b', null, T(o.label)), o.sub ? el('small', null, T(o.sub)) : null), tick);
        marks.push(() => {
          const on = f.kind === 'many' ? S[f.key].includes(o.id) : S[f.key] === o.id;
          btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); tick.hidden = !on;
        });
        return btn;
      }));
      const box = el('div', { class: 'lb-pop', role: 'dialog', 'aria-label': T(f.step.title) },
        el('h5', null, T(f.step.title)),
        el('p', null, T(f.step.hint)),
        note ? note.node : opts,
        f.kind === 'many' ? el('p', { class: 'lb-popfine' }, SC.t('Press to add or remove. Up to ', 'Πάτα για προσθήκη ή αφαίρεση. Έως ') + (f.max || 8) + '.') : null,
        el('button', { type: 'button', class: 'lb-popx', onclick: () => closePop(true) }, SC.t('Done', 'Έτοιμο')));
      popPaint = () => marks.forEach((m) => m());
      popPaint();
      document.body.append(box);
      const r = anchor.getBoundingClientRect();
      if (innerWidth < 760) { box.classList.add('sheet'); } else {
        // Room below the phrase, else above it: the words being changed stay readable either way.
        const w = box.offsetWidth, h = box.offsetHeight;
        const below = innerHeight - r.bottom - 18, above = r.top - 18;
        const left = Math.min(Math.max(12, r.left - 24), innerWidth - w - 14);
        let top;
        if (below >= h || below >= above) { top = r.bottom + scrollY + 10; box.style.maxHeight = Math.max(220, below) + 'px'; }
        else { top = r.top + scrollY - Math.min(h, above) - 10; box.style.maxHeight = Math.max(220, above) + 'px'; }
        box.style.left = left + 'px'; box.style.top = top + 'px'; box.style.overflowY = 'auto';
      }
      pop = box; box.__anchor = anchor; popNote = note;
      awayTimer = setTimeout(() => { document.addEventListener('mousedown', away); awayOn = true; }, 0);
    }

    // what a plan uses to mark a phrase as changeable
    function E(key, text) {
      const b = el('button', { type: 'button', class: 'lb-edit', 'aria-haspopup': 'dialog',
        title: SC.t('Change this', 'Άλλαξέ το'), onclick: (ev) => { ev.stopPropagation(); openPop(key, ev.currentTarget); } }, text);
      return b;
    }

    /* ---- the two screens ---- */
    function chooser() {
      const f = prime();
      return el('div', { class: 'lb-choose' },
        el('div', { class: 'lb-hero' },
          el('div', null,
            el('p', { class: 'lb-crumb' }, T(spec.head.crumb || ['Classroom', 'Τάξη'])),
            el('h1', null, T(spec.head.big)),
            el('p', { class: 'lb-lede' }, T(spec.head.lede))),
          el('div', { class: 'lb-facts' }, ...(spec.head.facts || []).map((p, i) =>
            el('div', { class: 'lb-fact' }, el('i', null, String(i + 1)), el('span', null, T(p)))))),
        el('div', { class: 'lb-cards' }, ...(f.opts || []).map((o) => el('button', {
          type: 'button', class: 'lb-card', onclick: () => {
            S[f.key] = o.id;
            if (spec.seed) spec.seed(o, S);        // a starting point brings its own stops, measures and shape with it
            draw(); window.scrollTo(0, 0);
          },
        },
          el('span', { class: 'lb-spark', style: 'background:' + (o.hue || '#4CCBEA'), 'aria-hidden': 'true' }),
          el('h3', null, T(o.label)),
          o.blurb ? el('p', null, T(o.blurb)) : null,
          el('span', { class: 'lb-tags' }, ...((o.tags || []).map((t) => el('span', { class: 'lb-tag' }, T(t))))),
          el('span', { class: 'lb-cardfoot' }, el('span', null, T(o.meta || ['', ''])), el('span', { class: 'lb-go' }, SC.t('Use this →', 'Χρήση →')))))));
    }

    function editor() {
      const p = spec.plan(S, K, E);
      const paper = el('article', { class: 'lb-paper' },
        el('div', { class: 'lb-ph' }, el('span', null, T(spec.head.stamp || ['Kleanthis', 'Κλεάνθης'])), el('span', null, SC.t('PAGE 1 OF 3', 'ΣΕΛΙΔΑ 1 ΑΠΟ 3'))),
        el('h1', null, p.title),
        el('p', { class: 'lb-sub' }, ...p.meta),
        ...p.sections.map((sec) => el('section', { class: 'lb-s' + (sec.page ? ' lb-break' : ''), id: 'lb-s-' + sec.key },
          el('h4', null, sec.h), ...(Array.isArray(sec.body) ? sec.body : [sec.body]).filter(Boolean))));

      const need = (sec) => (sec.need || []).every((k) => { const f = field(k); return f && filled(f); });
      const doneN = p.sections.filter(need).length;
      const pct = Math.round((doneN / p.sections.length) * 100);
      const outline = el('nav', { class: 'lb-out k4-noprint', 'aria-label': SC.t('The plan', 'Το σχέδιο') },
        el('h2', null, SC.t('THE PLAN', 'ΤΟ ΣΧΕΔΙΟ')),
        ...p.sections.map((sec) => el('a', { class: 'lb-o' + (need(sec) ? ' done' : ''), href: '#lb-s-' + sec.key,
          onclick: (ev) => { ev.preventDefault(); const n = document.getElementById('lb-s-' + sec.key); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); } },
          el('i', null), sec.h)),
        el('div', { class: 'lb-outfoot' },
          el('div', { class: 'lb-pct' }, el('span', null, el('b', { style: 'width:' + pct + '%' })), el('em', null, pct + '%')),
          el('p', null, (() => {
            const left = p.sections.length - doneN;
            if (!left) return SC.t('Every section has what it needs.', 'Κάθε ενότητα έχει ό,τι χρειάζεται.');
            return left === 1
              ? SC.t('One section still needs a choice.', 'Μία ενότητα θέλει ακόμη μια επιλογή.')
              : SC.t(left + ' sections still need a choice.', left + ' ενότητες θέλουν ακόμη μια επιλογή.');
          })())));

      const top = el('header', { class: 'lb-top k4-noprint' },
        el('button', { type: 'button', class: 'lb-back', onclick: () => { S[spec.primary] = ''; closePop(); draw(); } },
          SC.t('← All questions', '← Όλες οι ερωτήσεις')),
        el('div', { class: 'lb-tt' }, el('b', null, p.title), el('small', null, p.line || '')),
        el('div', { class: 'lb-acts' },
          el('span', { class: 'lb-saved' }, el('i', null), SC.t('Saved in the link', 'Αποθηκευμένο στον σύνδεσμο')),
          el('button', { type: 'button', class: 'lb-act', onclick: copyLink }, SC.t('Copy link', 'Αντιγραφή συνδέσμου')),
          K.printBtn(SC.t('Download PDF', 'Κατέβασε PDF'))));

      if (stopAsk) stopAsk();                       // the previous panel is being replaced; let its request go
      const side = assistant(spec, S, (k, v) => { const f = field(k); if (!f) return;
        if (f.kind === 'many') {
          // The same ceiling a teacher works under: the assistant cannot push the list past it.
          if (S[k].includes(v)) return;
          if (S[k].length >= (f.max || 8)) { SC.toast(SC.t('That list is full. Remove one first.', 'Η λίστα είναι γεμάτη. Αφαίρεσε ένα πρώτα.')); return; }
          S[k] = S[k].concat([v]);
        } else S[k] = v;
        draw(); SC.toast(SC.t('Changed: ', 'Άλλαξε: ') + T(f.short || f.step.title)); }, K);
      stopAsk = side.__stop;

      return el('div', { class: 'lb-editor' }, top,
        el('div', { class: 'lb-shell' }, outline,
          el('main', { class: 'lb-mid' }, p.minutes ? ribbon(p.minutes) : null, paper,
            el('p', { class: 'lb-paperfine k4-noprint' }, SC.t('Press any underlined phrase to change it. What you see is what prints.',
              'Πάτα οποιαδήποτε υπογραμμισμένη φράση για να την αλλάξεις. Ό,τι βλέπεις είναι ό,τι εκτυπώνεται.'))),
          side));
    }

    function copyLink() {
      const i = el('input', { class: 'lb-hidden', value: link() });
      document.body.append(i); i.select();
      try { document.execCommand('copy'); SC.toast(SC.t('Link copied', 'Ο σύνδεσμος αντιγράφηκε')); } catch (e) { SC.toast(SC.t('Copy the address from the bar above', 'Αντίγραψε τη διεύθυνση από τη γραμμή')); }
      i.remove();
    }

    function draw() {
      try { history.replaceState(null, '', link()); } catch (e) { /* the plan still works, only the address stays as it was */ }
      const screens = [];
      if (dropped) screens.push(el('p', { class: 'lb-drop k4-noprint' }, SC.t('A line in that link was left out because it did not pass the privacy check.',
        'Μια γραμμή του συνδέσμου παραλείφθηκε γιατί δεν πέρασε τον έλεγχο ιδιωτικότητας.')));
      screens.push(S[spec.primary] ? editor() : chooser());
      host.replaceChildren(...screens);
      document.body.classList.toggle('lb-wide', !!S[spec.primary]);
    }

    kit().then((k) => {
      if (!alive) return;
      K = k; K.printMode(true);
      fromLink();
      draw();
    }).catch(() => { if (alive) host.replaceChildren(el('div', { class: 'err', role: 'alert' }, SC.t('This page could not be loaded.', 'Η σελίδα δεν φόρτωσε.'))); });

    return () => {
      alive = false;
      closePop();                                   // takes the outside-click listener and its timer with it
      if (stopAsk) stopAsk();                       // an answer still on its way is abandoned, not written to a dead page
      document.body.classList.remove('lb-wide');
      if (K) K.printMode(false);
    };
  }

  SC.LB = { mount, TYPES };
}());
