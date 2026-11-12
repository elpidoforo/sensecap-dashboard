/* Build studio: read and change the code of a draft. pages/studio.js loads this file when a draft is open.

   SC.studioCode.workbench(o) gives the draft viewer two tabs, Preview and Code. The Code tab shows the page in plain text with line numbers:
   first coloured and read-only (to read), then a plain <textarea> (to change). "Run my changes" sends the text to the studio, which checks it
   exactly like a page the studio built (size limit, title, private text, teacher review) and shows it in the same safe box.

   Choices:
   - A plain <textarea>, not a contenteditable or a coloured layer on top: it works with Greek and other IME input, phone keyboards, screen
     readers, autofill-free typing and the native undo. Colour is for reading only.
   - The colouring is our own small scanner (below). It never backtracks: each step moves forward, so a half-typed tag or a pile of
     backslashes cannot freeze the page. (The speed-highlight HTML grammar was tried: 30 backslashes in an unclosed attribute took 90 ms,
     60 did not finish.) HTML with inline <style> and <script> is all that student pages use.
   - Tab inserts two spaces, but Escape lets go: press Escape, then Tab, to leave the box. Keyboard users are never trapped. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});

  /* ---------- colouring: HTML with <style> and <script>. tokens(src) = [[class, text], ...]; '' is plain text. ---------- */
  const JS_KW = new Set(('async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield true false null undefined NaN').split(' '));
  const VALUE_WORD = new Set(['this', 'true', 'false', 'null', 'undefined', 'NaN']);   // after these a slash divides; after any other keyword it starts a regex
  const sticky = (re, s, i) => { re.lastIndex = i; return re.exec(s); };
  const R = { id: /[A-Za-z_$][\w$]*/y, num: /(?:0[xX][\da-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/y, fnNext: /\s*\(/y, ws: /\s+/y,
    cssId: /-{0,2}[A-Za-z_][\w-]*/y, cssNum: /-?(?:\d+\.?\d*|\.\d+)[A-Za-z%]*/y, cssHex: /#[\da-fA-F]{3,8}\b/y, colon: /\s*:/y,
    tagName: /<\/?([A-Za-z][\w:-]*)/y, attrName: /[^\s"'>\/=]+/y, eq: /\s*=\s*/y, bare: /[^\s>]+/y };

  // The end of a quoted string that starts at i: the closing quote, or the end of the line when there is none (so one stray quote cannot swallow the page).
  function quoted(s, i, multiLine) {
    const q = s[i], n = s.length;
    let j = i + 1;
    while (j < n && s[j] !== q && (multiLine || s[j] !== '\n')) j += s[j] === '\\' ? 2 : 1;
    return j < n && s[j] === q ? j + 1 : Math.min(j, n);
  }

  function scanJs(s, add) {
    const n = s.length;
    let i = 0, prev = '';   // prev: the last thing that was not a space; it tells a regular expression from a division
    while (i < n) {
      const c = s[i], d = s[i + 1];
      let m;
      if (c === '/' && d === '/') { let e = s.indexOf('\n', i); if (e < 0) e = n; add('cmt', s.slice(i, e)); i = e; continue; }
      if (c === '/' && d === '*') { let e = s.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; add('cmt', s.slice(i, e)); i = e; continue; }
      if (c === '"' || c === "'" || c === '`') { const e = quoted(s, i, c === '`'); add('str', s.slice(i, e)); i = e; prev = 'a'; continue; }
      if (c === '/' && !/[\w$)\]]/.test(prev)) {   // a regular expression: up to the next slash on the same line, not inside [ ]
        let j = i + 1, cls = false;
        while (j < n && s[j] !== '\n' && (cls || s[j] !== '/')) { if (s[j] === '\\') j++; else if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; j++; }
        if (j < n && s[j] === '/') { j++; while (j < n && /[a-z]/.test(s[j])) j++; add('str', s.slice(i, j)); i = j; prev = 'a'; continue; }
      }
      if ((m = (c >= '0' && c <= '9') || (c === '.' && d >= '0' && d <= '9') ? sticky(R.num, s, i) : null)) { add('num', m[0]); i += m[0].length; prev = 'a'; continue; }
      if ((m = sticky(R.id, s, i))) {
        const w = m[0], kw = JS_KW.has(w);
        add(kw ? 'kw' : sticky(R.fnNext, s, i + w.length) ? 'fn' : '', w);
        i += w.length; prev = kw && !VALUE_WORD.has(w) ? '(' : 'a'; continue;
      }
      add('', c); i++;
      if (!/\s/.test(c)) prev = c;
    }
  }

  function scanCss(s, add) {
    const n = s.length, stack = [];   // stack: for each open { whether it holds rules (@media) or declarations
    let i = 0, atRule = '';
    while (i < n) {
      const c = s[i], d = s[i + 1], rules = !stack.length || stack[stack.length - 1];
      let m;
      if (c === '/' && d === '*') { let e = s.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; add('cmt', s.slice(i, e)); i = e; continue; }
      if (c === '"' || c === "'") { const e = quoted(s, i, false); add('str', s.slice(i, e)); i = e; continue; }
      if (c === '{') { stack.push(/^@(media|supports|layer|container|document|keyframes)/.test(atRule)); atRule = ''; add('', c); i++; continue; }
      if (c === '}') { stack.pop(); atRule = ''; add('', c); i++; continue; }
      if (c === ';') { atRule = ''; add('', c); i++; continue; }
      if (c === '@' && (m = sticky(R.cssId, s, i + 1))) { atRule = '@' + m[0]; add('kw', atRule); i += atRule.length; continue; }
      if (c === '!' && (m = sticky(R.cssId, s, i + 1))) { add('kw', '!' + m[0]); i += m[0].length + 1; continue; }
      if (c === '#' && (m = sticky(R.cssHex, s, i)) && !rules) { add('num', m[0]); i += m[0].length; continue; }
      if (c === '#' || (c === '.' && rules) || (c === ':' && rules)) {   // #id, .class and :hover in a selector
        const k = c === ':' && d === ':' ? 2 : 1;
        if ((m = sticky(R.cssId, s, i + k))) { add('tag', s.slice(i, i + k + m[0].length)); i += k + m[0].length; continue; }
      }
      if ((m = c === '-' || c === '.' || (c >= '0' && c <= '9') ? sticky(R.cssNum, s, i) : null)) { add('num', m[0]); i += m[0].length; continue; }
      if ((m = sticky(R.cssId, s, i))) {
        const w = m[0], after = i + w.length;
        add(sticky(R.fnNext, s, after) ? 'fn' : rules ? 'tag' : sticky(R.colon, s, after) ? 'atr' : '', w);
        i = after; continue;
      }
      add('', c); i++;
    }
  }

  function tokens(src) {
    src = String(src);
    const out = [], n = src.length;
    const add = (c, s) => { if (!s) return; const l = out[out.length - 1]; if (l && l[0] === c) l[1] += s; else out.push([c, s]); };
    const text = (seg) => { seg.split(/(&#?\w{1,10};)/).forEach((p, k) => add(k % 2 ? 'num' : '', p)); };   // &amp; and friends
    let i = 0, m;
    while (i < n) {
      const lt = src.indexOf('<', i);
      if (lt < 0) { text(src.slice(i)); break; }
      text(src.slice(i, lt)); i = lt;
      if (src.startsWith('<!--', i)) { let e = src.indexOf('-->', i + 4); e = e < 0 ? n : e + 3; add('cmt', src.slice(i, e)); i = e; continue; }
      if (src[i + 1] === '!' || src[i + 1] === '?') { let e = src.indexOf('>', i); e = e < 0 ? n : e + 1; add('kw', src.slice(i, e)); i = e; continue; }   // <!doctype html>
      if (!(m = sticky(R.tagName, src, i))) { add('', '<'); i++; continue; }
      const name = m[1].toLowerCase(), closing = m[0][1] === '/';
      add('', '<' + (closing ? '/' : '')); add('tag', m[1]); i += m[0].length;
      while (i < n && src[i] !== '>') {   // the attributes
        const c = src[i];
        if (/\s/.test(c)) { const w = sticky(R.ws, src, i)[0]; add('', w); i += w.length; }
        else if (c === '"' || c === "'") { const e = quoted(src, i, false); add('str', src.slice(i, e)); i = e; }
        else if ((m = sticky(R.attrName, src, i))) {
          add('atr', m[0]); i += m[0].length;
          if ((m = sticky(R.eq, src, i))) {
            add('', m[0]); i += m[0].length;
            const q = src[i];
            if (q === '"' || q === "'") { const e = quoted(src, i, true); const close = src[e - 1] === q && e - i > 1; const stop = close ? e : src.indexOf('\n', i) < 0 ? n : src.indexOf('\n', i); add('str', src.slice(i, stop)); i = stop; }
            else if ((m = sticky(R.bare, src, i))) { add('str', m[0]); i += m[0].length; }
          }
        } else { add('', c); i++; }
      }
      if (i < n) { add('', '>'); i++; }
      if (!closing && (name === 'script' || name === 'style')) {   // the text up to the closing tag is JavaScript or CSS
        const re = new RegExp('</' + name, 'gi'); re.lastIndex = i;
        const x = re.exec(src), e = x ? x.index : n;
        (name === 'script' ? scanJs : scanCss)(src.slice(i, e), add);
        i = e;
      }
    }
    return out;
  }
  const colored = (src) => { const f = document.createDocumentFragment(); tokens(src).forEach(([c, s]) => f.append(c ? SC.el('span', { class: 'sd-hl-' + c }, s) : document.createTextNode(s))); return f; };

  /* ---------- the Code panel ---------- */
  const stash = new Map();   // text a student typed and did not run yet, by draft: leaving the draft and coming back keeps it
  const TAB = '  ';
  const BIG = 250000;        // above this the read view stays plain (the server's own limit is far lower)

  // Put text at the cursor the way typing does, so the browser's undo still works; setRangeText is the fallback.
  function insert(ta, text) {
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
    if (!ok) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  // Tab and Shift+Tab: indent or outdent the lines the selection touches (or insert two spaces when nothing is selected).
  function tabKey(ta, back) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd;
    if (s === e && !back) return insert(ta, TAB);
    const a = v.lastIndexOf('\n', s - 1) + 1;
    let b = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e); if (b < 0) b = v.length;
    const out = v.slice(a, b).split('\n').map((l) => (back ? l.replace(/^(?: {1,2}|\t)/, '') : TAB + l)).join('\n');
    ta.setSelectionRange(a, b); insert(ta, out); ta.setSelectionRange(a, a + out.length);
  }

  function panel(o) {
    const T = SC.t, el = SC.el, num = (n) => n.toLocaleString(SC.lang === 'el' ? 'el-GR' : 'en-GB');
    let base = o.text(), text = stash.has(o.key) ? stash.get(o.key) : base, mode = 'read', busy = false, trap = true, stale = true, lines = 0, srvErr = '';
    if (text === base) stash.delete(o.key);

    const lead = el('p', { class: 'sd-code-lead' });
    const change = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: () => setMode(mode === 'read' ? 'edit' : 'read', true) });
    const undoBtn = el('button', { class: 'nm-btn nm-btn--sm nm-btn--ghost', type: 'button', onclick: () => undo() });
    const gut = el('pre', { class: 'sd-code-ln', 'aria-hidden': 'true' });
    const code = el('code', null);
    const pre = el('pre', { class: 'sd-code-pre', tabindex: 0, role: 'region', 'aria-label': T('The code of your draft, read only', 'Ο κώδικας του προσχεδίου σου, μόνο για ανάγνωση') }, code);
    const hint = el('p', { class: 'sd-code-hint', id: 'sd-code-hint-' + o.key });
    const ta = el('textarea', { class: 'sd-code-ta', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-describedby': hint.id, 'aria-label': T('Code of your draft. You can change it.', 'Κώδικας του προσχεδίου σου. Μπορείς να τον αλλάξεις.') });
    ta.value = text;
    const box = el('div', { class: 'sd-code-box' }, gut, pre, ta);
    const count = el('span', { class: 'sd-code-count' });
    const run = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => doRun() });
    const msg = el('p', { class: 'sd-code-msg', role: 'status', 'aria-live': 'polite' });
    const err = el('p', { class: 'sd-code-err', role: 'alert' });
    const actions = el('div', { class: 'sd-code-act' }, run, undoBtn, count);
    const node = el('div', { class: 'sd-code' }, el('div', { class: 'sd-code-bar' }, lead, change), box, hint, actions, msg, err);

    const guideText = () => (o.guide() != null ? o.guide() : base);
    const dirty = () => text !== base;
    const over = () => text.length - o.max;
    const canUndo = () => text !== guideText();
    function paintGutter() {
      const n = text.split('\n').length;
      if (n !== lines) { lines = n; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
    }
    function paint() {   // everything that depends on the text and the mode
      paintGutter();
      if (mode === 'read' && stale) { stale = false; if (text.length > BIG) code.textContent = text; else code.replaceChildren(colored(text)); }
      const edited = o.guide() != null;
      box.dataset.mode = mode; pre.hidden = mode !== 'read'; ta.hidden = mode !== 'edit';
      change.textContent = mode === 'read' ? T('Change the code', 'Άλλαξε τον κώδικα') : T('Back to reading', 'Πίσω στην ανάγνωση');
      lead.textContent = mode === 'edit' ? T('Change the code, then press Run my changes. It runs in the same safe box, with no internet.', 'Άλλαξε τον κώδικα και πάτα «Εκτέλεση των αλλαγών μου». Τρέχει στο ίδιο ασφαλές κουτί, χωρίς internet.')
        : dirty() ? T('This is your version. Some changes are not run yet.', 'Αυτή είναι η δική σου έκδοση. Κάποιες αλλαγές δεν έχουν εκτελεστεί ακόμη.')
        : edited ? T('This is your version, with your changes.', 'Αυτή είναι η δική σου έκδοση, με τις αλλαγές σου.')
        : T('This is the page the studio built, in plain text. Read it. To try a change of your own, press Change the code.', 'Αυτή είναι η σελίδα που έφτιαξε το στούντιο, σε απλό κείμενο. Διάβασέ την. Για να δοκιμάσεις δική σου αλλαγή, πάτα «Άλλαξε τον κώδικα».');
      hint.textContent = T('Tab adds spaces. To leave the box with the keyboard, press Escape, then Tab.', 'Το Tab βάζει κενά. Για να βγεις από το πλαίσιο με το πληκτρολόγιο, πάτα Escape και μετά Tab.');
      hint.hidden = mode !== 'edit';
      run.hidden = mode !== 'edit';
      run.textContent = busy ? T('Running', 'Εκτέλεση') : T('Run my changes', 'Εκτέλεση των αλλαγών μου');
      run.disabled = busy || over() > 0 || !text.trim();
      undoBtn.textContent = T('Undo my edits', 'Αναίρεση των αλλαγών μου');
      undoBtn.hidden = !canUndo();
      undoBtn.disabled = busy;
      undoBtn.title = T('Go back to the version the studio built', 'Επιστροφή στην έκδοση που έφτιαξε το στούντιο');
      count.textContent = T(num(text.length) + ' of ' + num(o.max) + ' characters', num(text.length) + ' από ' + num(o.max) + ' χαρακτήρες');
      count.classList.toggle('bad', over() > 0);
      err.textContent = over() > 0 ? T('The page is ' + num(over()) + ' characters too big. Make it shorter to run it.', 'Η σελίδα είναι κατά ' + num(over()) + ' χαρακτήρες μεγαλύτερη. Μίκρυνέ την για να την εκτελέσεις.')
        : !text.trim() ? T('The page cannot be empty.', 'Η σελίδα δεν μπορεί να είναι κενή.') : srvErr;
      api.onChange();
    }
    // Switching between reading and changing keeps the place in the code: the caret starts on the first line you could see.
    function setMode(m, focus) {
      const from = mode === 'edit' ? ta : pre, st = from.scrollTop, sl = from.scrollLeft;
      mode = m; stale = true; paint();
      const to = m === 'edit' ? ta : pre;
      if (m === 'edit') {
        ta.value = text;
        let at = 0;
        for (let k = Math.round(st / (parseFloat(getComputedStyle(ta).lineHeight) || 20)); k > 0; k--) { const nx = text.indexOf('\n', at); if (nx < 0) break; at = nx + 1; }
        ta.setSelectionRange(at, at);
      }
      to.scrollTop = st; to.scrollLeft = sl;
      if (focus) (m === 'edit' ? ta : change).focus({ preventScroll: true });
      syncScroll();
    }
    let kept = null;   // the scroll place of the box while its tab is hidden (a hidden box forgets it)
    const keep = () => { const s = mode === 'edit' ? ta : pre; kept = { st: s.scrollTop, sl: s.scrollLeft }; };
    const restore = () => { const s = mode === 'edit' ? ta : pre; if (kept) { s.scrollTop = kept.st; s.scrollLeft = kept.sl; } syncScroll(); };
    function syncScroll() { const s = mode === 'edit' ? ta : pre; gut.scrollTop = s.scrollTop; }
    ta.addEventListener('scroll', syncScroll); pre.addEventListener('scroll', syncScroll);
    ta.addEventListener('input', () => {
      text = ta.value; stale = true; trap = true; msg.textContent = ''; srvErr = '';
      if (dirty()) stash.set(o.key, text); else stash.delete(o.key);
      paint(); syncScroll();
    });
    ta.addEventListener('focus', () => { trap = true; });
    ta.addEventListener('keydown', (e) => {
      if (e.isComposing) return;
      if (e.key === 'Escape') { trap = false; return; }   // let go: the next Tab moves on
      if (e.key === 'Tab' && trap && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); tabKey(ta, e.shiftKey); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doRun(); }
    });

    async function doRun(quiet, stay) {   // quiet: the studio runs it before a build or send; stay: undo keeps the student on the Code tab
      if (busy) return false;
      if (over() > 0 || !text.trim()) { setMode('edit', true); return false; }
      busy = true; srvErr = ''; msg.textContent = ''; paint();
      let ok = false;
      try {
        if (dirty()) await o.save(text); else await o.refresh();
        base = text; stash.delete(o.key); ok = true;
        msg.textContent = T('Ran your changes. The preview is updated.', 'Οι αλλαγές σου εκτελέστηκαν. Η προεπισκόπηση ενημερώθηκε.');
      } catch (e) {
        srvErr = o.why(e);
        if (quiet) api.show('code');
      }
      busy = false; paint();
      if (ok && !quiet && !stay) api.afterRun();
      return ok;
    }
    function undo() {
      if (!canUndo()) return;
      SC.modal({
        title: T('Go back to the studio’s version?', 'Να γυρίσεις στην έκδοση του στούντιο;'),
        body: el('p', null, T('Your own changes will be removed from this draft. This cannot be undone.', 'Οι δικές σου αλλαγές θα αφαιρεθούν από αυτό το προσχέδιο. Δεν αναιρείται.')),
        actions: [{ label: T('Keep my changes', 'Κράτα τις αλλαγές μου') }, { label: T('Go back', 'Επιστροφή'), primary: true, run: async () => {
          text = guideText(); ta.value = text; stale = true; srvErr = '';
          if (dirty()) { stash.set(o.key, text); const ok = await doRun(false, true); if (ok) msg.textContent = T('Back to the studio’s version.', 'Επιστροφή στην έκδοση του στούντιο.'); } else { stash.delete(o.key); msg.textContent = T('Back to the studio’s version.', 'Επιστροφή στην έκδοση του στούντιο.'); paint(); }
        } }],
      });
    }
    const guard = (e) => { if (dirty() && document.body.contains(ta)) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);

    const api = {
      node, onChange() {}, show() {}, afterRun() {},
      dirty, canUndo, edited: () => o.guide() != null,
      run: () => doRun(false), commit: () => doRun(true),
      // the saved text changed (the studio built a new version, or a draft was opened): show it, unless the student has unrun changes
      sync() {
        const saved = o.text();
        if (saved !== base) { const keep = dirty(); base = saved; if (!keep) { text = saved; ta.value = saved; stash.delete(o.key); } stale = true; }
        paint();
      },
      focusEditor() { setMode('edit', true); }, keep, restore,
      destroy() { window.removeEventListener('beforeunload', guard); },
    };
    paint();
    return api;
  }

  /* ---------- Preview | Code tabs around the draft viewer ----------
     o: { key, max, preview: node (the existing preview bar and frame), text(), guide(), save(text), refresh(), why(err) }  */
  function workbench(o) {
    const T = SC.t, el = SC.el;
    const p = panel(o);
    let tab = 'preview';
    const ids = { preview: ['sd-tab-p-' + o.key, 'sd-pane-p-' + o.key], code: ['sd-tab-c-' + o.key, 'sd-pane-c-' + o.key] };
    const flag = el('span', { class: 'sd-tab-flag' });
    const btn = (name, label, extra) => el('button', { class: 'sd-tab', type: 'button', role: 'tab', id: ids[name][0], 'aria-controls': ids[name][1], onclick: () => show(name), onkeydown: (e) => keys(e, name) }, label, extra || null);
    const tabP = btn('preview', T('Preview', 'Προεπισκόπηση')), tabC = btn('code', T('Code', 'Κώδικας'), flag);
    const list = el('div', { class: 'sd-tabs', role: 'tablist', 'aria-label': T('Your draft', 'Το προσχέδιό σου') }, tabP, tabC);
    const runNow = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: () => p.run() }, T('Run my changes', 'Εκτέλεση των αλλαγών μου'));
    const note = el('div', { class: 'sd-dirty', role: 'status' }, el('span', null, T('You changed the code but did not run it yet. This preview is the last one you ran.', 'Άλλαξες τον κώδικα αλλά δεν τον εκτέλεσες ακόμη. Αυτή η προεπισκόπηση είναι η τελευταία που έτρεξες.')), runNow);
    const panePreview = el('div', { class: 'sd-pane', role: 'tabpanel', id: ids.preview[1], 'aria-labelledby': ids.preview[0] }, note, o.preview);
    const paneCode = el('div', { class: 'sd-pane', role: 'tabpanel', id: ids.code[1], 'aria-labelledby': ids.code[0], hidden: true }, p.node);
    const node = el('div', { class: 'sd-wb' }, list, panePreview, paneCode);
    function show(name, focus) {
      if (tab === 'code' && name !== 'code') p.keep();
      tab = name;
      [['preview', tabP, panePreview], ['code', tabC, paneCode]].forEach(([k, b, pane]) => { const on = k === name; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; pane.hidden = !on; });
      if (focus) (name === 'code' ? tabC : tabP).focus();
      p.sync();
      if (name === 'code') p.restore();
    }
    function keys(e, name) {
      const to = e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? (name === 'preview' ? 'code' : 'preview') : e.key === 'Home' ? 'preview' : e.key === 'End' ? 'code' : null;
      if (to) { e.preventDefault(); show(to, true); }
    }
    function mark() {
      note.hidden = !p.dirty();
      flag.textContent = p.edited() || p.dirty() ? T(' (changed)', ' (αλλαγμένο)') : '';
      tabC.classList.toggle('changed', p.edited() || p.dirty());
    }
    p.onChange = mark;
    p.show = (name) => show(name, true);
    p.afterRun = () => show('preview', true);
    show('preview');
    mark();
    return { node, panel: p, show, dirty: p.dirty, commit: p.commit, sync: p.sync, destroy: p.destroy, tab: () => tab };
  }

  /* ---------- Share: the link of an approved tool and a QR code for it (the link goes to this site only) ---------- */
  function sharePanel(url, onClose) {
    const T = SC.t, el = SC.el;
    const qrBox = el('div', { class: 'sd-share-qr' });
    const input = el('input', { class: 'nm-input', type: 'text', readonly: true, value: url, 'aria-label': T('Link to this tool', 'Σύνδεσμος για αυτό το εργαλείο'), onfocus: () => input.select() });
    const copy = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: async () => {
      try { await navigator.clipboard.writeText(url); SC.toast(T('Link copied.', 'Ο σύνδεσμος αντιγράφηκε.')); }
      catch (e) { input.focus(); input.select(); SC.toast(T('Press Ctrl+C (or Copy on your phone) to copy the link.', 'Πάτα Ctrl+C (ή Αντιγραφή στο κινητό) για να αντιγράψεις τον σύνδεσμο.')); }
    } }, T('Copy link', 'Αντιγραφή συνδέσμου'));
    const close = el('button', { class: 'nm-btn nm-btn--sm nm-btn--ghost', type: 'button', onclick: () => onClose && onClose() }, T('Close', 'Κλείσιμο'));
    const node = el('div', { class: 'sd-share', role: 'group', 'aria-label': T('Share this tool', 'Μοιράσου αυτό το εργαλείο'), hidden: true }, qrBox,
      el('div', { class: 'sd-share-t' }, el('b', null, T('Share this tool', 'Μοιράσου αυτό το εργαλείο')),
        el('p', null, T('Anyone can open this approved tool with the link or the QR code, with no sign-in. It opens on this site only.', 'Οποιοσδήποτε μπορεί να ανοίξει αυτό το εγκεκριμένο εργαλείο με τον σύνδεσμο ή τον κωδικό QR, χωρίς σύνδεση. Ανοίγει μόνο σε αυτόν τον ιστότοπο.')),
        el('div', { class: 'sd-share-row' }, input, copy, close)));
    let drawn = false;
    function open() {
      node.hidden = false;
      if (drawn) return;
      drawn = true;
      SC.qrLoad().then(() => {
        const svg = SC.qrSvg(url, { size: 152, label: T('QR code for the link to this tool', 'Κωδικός QR για τον σύνδεσμο αυτού του εργαλείου') });
        if (svg) qrBox.append(svg, el('small', null, T('Point a phone camera at it.', 'Στόχευσε το κινητό σου πάνω του.')));
        else qrBox.hidden = true;   // the generator did not load: the link above still works
      });
    }
    return { node, open, close: () => { node.hidden = true; }, isOpen: () => !node.hidden, focus: () => input.focus() };
  }

  SC.studioCode = { workbench, panel, tokens, sharePanel };
})();
