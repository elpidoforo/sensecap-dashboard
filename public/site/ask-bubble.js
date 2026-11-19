/* Ask Kleanthis, on every page: a bubble at the corner that opens a small panel with questions written for the page
   you are on, and a box to type your own. It talks to the same assistant as #/ask (POST /app/api/ask, one JSON object
   per line), so a visitor needs no account and the conversation lives only in this tab - nothing about a student is
   kept on the server beyond the question log the assistant already keeps.
   SC.askBubble.setPage(id, name) is called by the shell on every route. The bubble is not shown on the Ask page itself.
   The questions are plain data in /site/ask-questions.js, loaded the first time the panel is opened.
   Honesty: every answer carries a line saying this is an AI assistant and not a person, and the panel never claims a
   number it was not given - it only passes the question on and shows what came back. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const T = (en, el) => SC.t(en, el);
  const el = (tag, attrs, ...kids) => SC.el(tag, attrs, ...kids);

  // Greek capitals carry no accents, so the name of a page in capitals loses them with the rest of the word.
  const caps = (s2) => s2.toUpperCase().normalize('NFD').replace(/[\u0301\u0300\u0342\u0308]/g, '').normalize('NFC');

  let root = null, panel = null, btn = null, open = false, pageId = null, pageName = '';
  let qLoaded = null, busy = false, stop = null;
  const history = [];                      // the last few turns, this tab only, never saved

  function loadQuestions() {
    if (qLoaded) return qLoaded;
    qLoaded = new Promise((done) => {
      if (SC.ASK_Q) return done(SC.ASK_Q);
      const s = document.createElement('script');
      s.src = '/site/ask-questions.js';
      s.onload = () => done(SC.ASK_Q || {});
      s.onerror = () => { s.remove(); qLoaded = null; done({}); };
      document.head.append(s);
    });
    return qLoaded;
  }

  function questionsFor(id) {
    const all = SC.ASK_Q || {};
    const list = all[id] || all._default || [];
    return list.slice(0, 5).map((q) => T(q[0], q[1]));
  }

  /* ---------- the answer, as plain paragraphs: student and assistant text is never put in as markup ---------- */
  function renderAnswer(text) {
    const box = el('div', { class: 'kb-a' });
    String(text || '').split('\n').forEach((line) => {
      const s = line.replace(/^\s*[-*•]\s+/, '• ').replace(/\*\*/g, '').trim();
      if (s) box.append(el('p', null, s));
    });
    return box;
  }

  function say(node) {
    const feed = panel.querySelector('.kb-feed');
    feed.append(node);
    feed.scrollTop = feed.scrollHeight;
  }

  async function ask(text) {
    if (busy || !text) return;
    busy = true;
    const input = panel.querySelector('.kb-in input');
    const send = panel.querySelector('.kb-in button');
    input.value = ''; send.disabled = true;
    say(el('div', { class: 'kb-you' }, text));
    const working = el('div', { class: 'kb-work' }, el('span', { class: 'kb-dot' }), el('span', null, T('Looking…', 'Ψάχνει…')));
    say(working);
    // The question says which page it was asked from, in words the reader can see for themselves.
    const asked = text + '\n\n(' + T('Asked from the ', 'Ρωτήθηκε από τη σελίδα ') + pageName + T(' page.', '.') + ')';
    const ctrl = new AbortController();
    stop = () => ctrl.abort();
    try {
      const r = await fetch('/app/api/ask', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: asked, history: history.slice(-6) }), signal: ctrl.signal,
      });
      if (!r.ok) {
        let b = null; try { b = await r.json(); } catch (e) { /* not JSON */ }
        working.remove();
        say(el('div', { class: 'kb-err' }, r.status === 503
          ? T('The assistant is not switched on yet.', 'Ο βοηθός δεν έχει ενεργοποιηθεί ακόμη.')
          : (b && b.error) || T('The assistant could not answer just now. Try again in a moment.', 'Ο βοηθός δεν μπόρεσε να απαντήσει τώρα. Δοκίμασε ξανά σε λίγο.')));
      } else {
        const reader = r.body.getReader(), dec = new TextDecoder();
        let buf = '', answered = false;
        const handle = (line) => {
          let ev; try { ev = JSON.parse(line); } catch (e) { return; }
          if (ev.type === 'tool') { working.querySelector('span:last-child').textContent = T('Looking at ', 'Κοιτάζει ') + String(ev.name || '').replace(/_/g, ' '); }
          else if (ev.type === 'answer') {
            answered = true; working.remove();
            say(renderAnswer(ev.text));
            history.push({ role: 'user', text }, { role: 'assistant', text: String(ev.text || '') });
          } else if (ev.type === 'error') {
            working.remove();
            say(el('div', { class: 'kb-err' }, ev.message || T('The assistant could not answer just now.', 'Ο βοηθός δεν μπόρεσε να απαντήσει τώρα.')));
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handle(line); }
        }
        if (buf.trim()) handle(buf.trim());
        if (!answered && working.isConnected) {
          working.remove();
          say(el('div', { class: 'kb-err' }, T('The answer stopped before it arrived. Try again.', 'Η απάντηση σταμάτησε πριν φτάσει. Δοκίμασε ξανά.')));
        }
      }
    } catch (e) {
      working.remove();
      if (!ctrl.signal.aborted) say(el('div', { class: 'kb-err' }, T('The assistant could not be reached.', 'Δεν ήταν δυνατή η σύνδεση με τον βοηθό.')));
    }
    busy = false; stop = null; send.disabled = false;
  }

  function fillQuestions() {
    const box = panel.querySelector('.kb-qs');
    const list = questionsFor(pageId);
    box.replaceChildren(...list.map((q) => el('button', { type: 'button', class: 'kb-q', onclick: () => ask(q) }, q)));
    box.hidden = !list.length;
  }

  function build() {
    SC.css('/site/ask-bubble.css');
    panel = el('div', { class: 'kb-panel', hidden: true, role: 'dialog', 'aria-label': T('Ask Kleanthis about this page', 'Ρώτα τον Κλεάνθη για αυτή τη σελίδα') },
      el('div', { class: 'kb-h' },
        el('i', { class: 'kb-face', 'aria-hidden': 'true' }),
        el('div', { class: 'kb-ht' }, el('b', null, T('Ask Kleanthis', 'Ρώτα τον Κλεάνθη')), el('small', null, '')),
        el('button', { type: 'button', class: 'kb-x', 'aria-label': T('Close', 'Κλείσιμο'), onclick: () => toggle(false) }, '×')),
      el('div', { class: 'kb-b' },
        el('p', { class: 'kb-lede' }, T('Ask about what you see on this page, or about the data behind it.', 'Ρώτα για όσα βλέπεις σε αυτή τη σελίδα ή για τα δεδομένα από πίσω.')),
        el('div', { class: 'kb-qs' }),
        el('div', { class: 'kb-feed', role: 'log', 'aria-live': 'polite' }),
        el('div', { class: 'kb-in' },
          el('input', { type: 'text', 'aria-label': T('Your question', 'Η ερώτησή σου'), placeholder: T('Ask anything about this page…', 'Ρώτα οτιδήποτε για αυτή τη σελίδα…'),
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(e.target.value.trim()); } } }),
          el('button', { type: 'button', onclick: () => ask(panel.querySelector('.kb-in input').value.trim()) }, T('Ask', 'Ρώτα')))),
      el('div', { class: 'kb-f' },
        el('span', null, T('AI assistant · not a person', 'Βοηθός AI · όχι άνθρωπος')),
        el('a', { href: '#/ask' }, T('Open the full chat →', 'Άνοιξε όλη τη συνομιλία →'))));

    btn = el('button', { type: 'button', class: 'kb-bubble', 'aria-expanded': 'false', onclick: () => toggle(!open) },
      el('i', { class: 'kb-face', 'aria-hidden': 'true' }),
      el('span', null, T('Ask about this page', 'Ρώτα για αυτή τη σελίδα')));

    root = el('div', { class: 'kb-root' }, panel, btn);
    document.body.append(root);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) toggle(false); });
  }

  function toggle(next) {
    open = !!next;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      if (SC.guide) SC.guide.close();   // one panel at a time
      loadQuestions().then(() => { if (open) fillQuestions(); });
      const input = panel.querySelector('.kb-in input');
      setTimeout(() => input.focus(), 30);
    } else if (stop) { stop(); }
  }

  SC.askBubble = {
    close() { if (root && open) toggle(false); },
    setPage(id, name) {
      if (!root) build();
      pageId = id; pageName = name || id;
      panel.querySelector('.kb-ht small').textContent = caps(T('ABOUT THIS PAGE · ', 'ΓΙΑ ΑΥΤΗ ΤΗ ΣΕΛΙΔΑ · ') + pageName);
      const hide = id === 'ask';                       // the full chat does not need a bubble to itself
      root.hidden = hide;
      if (hide && open) toggle(false);
      if (SC.ASK_Q && open) fillQuestions();
    },
  };
}());
