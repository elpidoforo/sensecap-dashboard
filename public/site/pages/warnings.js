/*
  Warnings watch: what the Cyprus Met Office warnings page says now, how it has changed, and every saved version of it.
  Top: the current state. Then a 30-day strip (was a warning on the page that day?), a timeline of changes (issued / ended /
  changed, with the text) and the older saved versions. Route: #/warnings (also reached as #/warnwatch).
  Data: GET /api/dom/page?name=warnings (now), GET /api/dom/watch (changes, derived from the saved page copies),
        GET /api/dom/pages/history?name=warnings&days= (the saved versions). Radar pictures are not saved, so the radar has no history here.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/warnings.css');

  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const STRIP_DAYS = 30;

  /* ---------- reading a warnings page (same rules the server uses to find "issued" and "ended") ---------- */
  const CHROME = /^(issued\s+)?(weather\s+)?warnings?:?$|department of meteorology|^copyright|©|^(home|back|print|menu|contact|refresh|top)$/i;
  const NO_WARNING = /\b(no (\w+ )?warnings?|none|nil|nothing|not (currently )?(issued|in force|active))\b|δεν υπαρχ|καμια προειδοπ|καμια ειδοπ/;
  const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const lines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !CHROME.test(l));
  const isCalm = (text) => { const l = lines(text); return !l.length || NO_WARNING.test(norm(l.join(' '))); };
  const LEVELS = { red: 3, orange: 2, yellow: 1 };
  function levelOf(text) {
    let best = 0;
    for (const m of String(text || '').matchAll(/\b(red|orange|yellow)\s+warning/gi)) best = Math.max(best, LEVELS[m[1].toLowerCase()]);
    return best;   // 0: a warning, level not stated
  }
  const LEVEL_NAME = () => ({ 0: T('warning', 'προειδοποίηση'), 1: T('yellow', 'κίτρινη'), 2: T('orange', 'πορτοκαλί'), 3: T('red', 'κόκκινη') });
  const LEVEL_CLS = { 0: 'w0', 1: 'w1', 2: 'w2', 3: 'w3' };
  const errMsg = (e) => (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.');
  const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  const when = (ms) => (ms && isFinite(ms) ? SC.dateTime(ms) : T('unknown time', 'άγνωστη ώρα'));

  /* ---------- Cyprus calendar days (the Met Office speaks in local time) ---------- */
  const TZ = 'Asia/Nicosia';
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function parts(ms) { const o = {}; dtf.formatToParts(ms).forEach((p) => { o[p.type] = p.value; }); return o; }
  const offsetAt = (ms) => { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
  const keyAt = (ms) => { const p = parts(ms); return p.year + '-' + p.month + '-' + p.day; };
  const keyShift = (key, n) => new Date(Date.parse(key + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const dayStart = (key) => { const g = Date.parse(key + 'T00:00:00Z'); return g - offsetAt(g); };
  const fmtLong = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const dayLabel = (key) => fmtLong.format(Date.parse(key + 'T12:00:00Z'));
  const dayNum = (key) => String(Number(key.slice(8)));
  const fmtDur = (ms) => { const m = Math.round(ms / MIN); if (m < 90) return m + ' min'; const hh = Math.round(m / 6) / 10; return (hh % 1 ? hh.toFixed(1) : String(hh)) + ' h'; };

  const KIND = {
    issued: { color: '#F2CF86', icon: 'bell', label: () => T('Issued', 'Εκδόθηκε') },
    ended: { color: '#9BD88F', icon: 'check', label: () => T('Ended', 'Έληξε') },
    changed: { color: '#8FE3F7', icon: 'refresh', label: () => T('Changed', 'Άλλαξε') },
  };

  /* ---------- states from the saved copies ---------- */
  function statesFrom(hist) {
    return hist.filter((v) => v && Number(v.t)).map((v) => ({ t: Number(v.t), text: String(v.text || ''), calm: isCalm(v.text), level: isCalm(v.text) ? -1 : levelOf(v.text) })).sort((a, b) => a.t - b.t);
  }
  // When did the page last switch between "a warning" and "no warning"?
  function sinceOf(states) {
    if (!states.length) return null;
    const last = states[states.length - 1];
    let i = states.length - 1;
    while (i > 0 && states[i - 1].calm === last.calm) i--;
    return { at: states[i].t, complete: i > 0 };   // complete: we saw the state change; otherwise the page was already like this at our first copy
  }
  function stripCells(states, now) {
    const today = keyAt(now);
    const keys = [];
    for (let i = STRIP_DAYS - 1; i >= 0; i--) keys.push(keyShift(today, -i));
    return keys.map((key) => {
      const ds = dayStart(key), de = key === today ? now : dayStart(keyShift(key, 1));
      let covered = 0, warn = 0, level = -1;
      states.forEach((s, i) => {
        const a = Math.max(s.t, ds), b = Math.min(i + 1 < states.length ? states[i + 1].t : now, de);
        if (b <= a) return;
        covered += b - a;
        if (!s.calm) { warn += b - a; level = Math.max(level, s.level); }
      });
      const len = Math.max(1, de - ds);
      return { key, covered, warn, level, len, state: covered < 0.02 * len ? 'none' : warn > 0 ? 'warn' : 'calm', partial: covered < 0.95 * len && covered >= 0.02 * len };
    });
  }

  SC.register('warnings', {
    title: ['Warnings watch', 'Παρακολούθηση προειδοποιήσεων'],
    async render(root, ctx) {
      let alive = true, timer = 0, firstLoad = true;
      const S = { live: null, hist: null, watch: null, only: null, olderN: 12 };
      let demo = false;
      try { const c = await SC.cached('/api/config', 300000); demo = !!(c && c.demo); } catch (e) { /* no tag */ }

      const headHost = h('div');
      const nowBox = h('div');
      const stripBox = h('div');
      const lower = h('div', { class: 'cols-main wn-lower' });
      const tlBox = h('div'), oldBox = h('div');
      lower.append(tlBox, oldBox);
      root.append(headHost, h('div', { class: 'wn' }, nowBox, stripBox, lower));

      /* ----- head ----- */
      function head() {
        const live = S.live && S.live.ok ? Date.parse(S.live.v.fetched) : null;
        const saved = !live && S.hist && S.hist.ok && S.hist.v.length ? S.hist.v[S.hist.v.length - 1].t : null;
        headHost.replaceChildren(SC.head({
          title: T('Warnings, as they change.', 'Οι προειδοποιήσεις, καθώς αλλάζουν.'),
          lede: T('The Cyprus Met Office warnings page now, and a record of every change this site has seen on it: when a warning was issued, when it ended and when its text changed.', 'Η σελίδα προειδοποιήσεων της Μετεωρολογικής Υπηρεσίας Κύπρου τώρα και ένα αρχείο κάθε αλλαγής που έχει δει αυτός ο ιστότοπος: πότε εκδόθηκε μια προειδοποίηση, πότε έληξε και πότε άλλαξε το κείμενό της.'),
          fresh: live ? T('Page read ' + SC.ago(live), 'Η σελίδα διαβάστηκε ' + SC.ago(live)) : saved ? T('Showing the saved copy from ' + SC.ago(saved), 'Εμφανίζεται το αποθηκευμένο αντίγραφο ' + SC.ago(saved)) : null,
          tags: demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
          help: [
            'The top card says whether the Met Office warnings page lists a warning right now, and since when. The strip below it has one square for each of the last 30 days: green means the page showed no warning that day, amber, orange or red means a warning (of that colour) was on the page, and hatched means this site has no saved copy for that day. The timeline lists each change in the text, newest first. At the bottom you can open every older saved version. This site saves a copy of the page whenever its text changes, so the record starts when the saving started. Radar pictures are not saved, only the text of the pages.',
            'Η επάνω κάρτα λέει αν η σελίδα προειδοποιήσεων της Υπηρεσίας αναφέρει κάποια προειδοποίηση αυτή τη στιγμή και από πότε. Η λωρίδα από κάτω έχει ένα τετράγωνο για κάθε μία από τις τελευταίες 30 ημέρες: πράσινο σημαίνει ότι η σελίδα δεν έδειχνε προειδοποίηση εκείνη την ημέρα, κεχριμπαρί, πορτοκαλί ή κόκκινο σημαίνει ότι υπήρχε προειδοποίηση (αυτού του χρώματος) και γραμμοσκιασμένο σημαίνει ότι ο ιστότοπος δεν έχει αποθηκευμένο αντίγραφο για εκείνη την ημέρα. Η χρονολογική λίστα δείχνει κάθε αλλαγή στο κείμενο, τις νεότερες πρώτα. Στο τέλος μπορείτε να ανοίξετε κάθε παλαιότερη αποθηκευμένη έκδοση. Ο ιστότοπος αποθηκεύει αντίγραφο της σελίδας κάθε φορά που αλλάζει το κείμενό της, οπότε το αρχείο ξεκινά όταν ξεκίνησε η αποθήκευση. Οι εικόνες ραντάρ δεν αποθηκεύονται, μόνο το κείμενο των σελίδων.',
          ],
        }));
      }

      /* ----- the current state ----- */
      function paintNow() {
        const live = S.live, hist = S.hist;
        const states = hist && hist.ok ? statesFrom(hist.v) : [];
        let text = null, at = null, fromLive = false, url = null, images = [];
        if (live && live.ok) { text = String(live.v.text || ''); at = Date.parse(live.v.fetched); fromLive = true; url = live.v.url; images = live.v.images || []; }
        else if (states.length) { const l = states[states.length - 1]; text = l.text; at = l.t; }
        if (text == null) {
          nowBox.replaceChildren(h('div', { class: 'nm-card wn-now' }, h('div', { class: 'err', role: 'alert' }, T('The warnings page could not be read, and no saved copy exists yet. ', 'Η σελίδα προειδοποιήσεων δεν μπόρεσε να διαβαστεί και δεν υπάρχει ακόμη αποθηκευμένο αντίγραφο. ') + (live && !live.ok ? errMsg(live.e) + ' ' : ''),
            h('button', { class: 'nm-btn wn-retry', type: 'button', onclick: () => load() }, T('Try again', 'Δοκιμάστε ξανά')))));
          return;
        }
        const calm = isCalm(text), lv = calm ? -1 : levelOf(text), names = LEVEL_NAME();
        const since = sinceOf(states);
        const card = h('section', { class: 'nm-card wn-now ' + (calm ? 'calm' : 'warn ' + LEVEL_CLS[lv]), 'aria-labelledby': 'wn-now-h' });
        card.append(h('div', { class: 'wn-now-top' },
          h('span', { class: 'wn-badge', 'aria-hidden': 'true' }, SC.icon(calm ? 'check' : 'bell', 30)),
          h('div', { class: 'wn-now-t' },
            h('p', { class: 'card-eye' }, fromLive ? T('Now, on the Met Office page', 'Τώρα, στη σελίδα της Υπηρεσίας') : T('Latest saved copy', 'Τελευταίο αποθηκευμένο αντίγραφο')),
            h('h2', { class: 'wn-h', id: 'wn-now-h' }, calm ? T('No warning on the page.', 'Καμία προειδοποίηση στη σελίδα.') : lv > 0 ? T('A ' + names[lv] + ' warning is on the page.', 'Υπάρχει ' + names[lv] + ' προειδοποίηση στη σελίδα.') : T('A warning is on the page.', 'Υπάρχει προειδοποίηση στη σελίδα.')),
            h('p', { class: 'wn-since' },
              since ? (since.complete ? (calm ? T('Quiet since ' + when(since.at) + '.', 'Ήρεμα από ' + when(since.at) + '.') : T('In force on the page since ' + when(since.at) + '.', 'Στη σελίδα από ' + when(since.at) + '.'))
                : (calm ? T('Quiet at every copy we have, back to ' + when(since.at) + '.', 'Ήρεμα σε κάθε αντίγραφο που έχουμε, από ' + when(since.at) + '.') : T('On the page at every copy we have, back to ' + when(since.at) + '.', 'Στη σελίδα σε κάθε αντίγραφο που έχουμε, από ' + when(since.at) + '.')))
                : T('No saved copy to say since when.', 'Δεν υπάρχει αποθηκευμένο αντίγραφο για να πούμε από πότε.'),
              ' ', h('span', { class: 'wn-chk' }, (fromLive ? T('Read ', 'Διαβάστηκε ') : T('Saved ', 'Αποθηκεύτηκε ')) + when(at) + ' · ' + SC.ago(at)))),
          h('div', { class: 'wn-now-links' },
            url ? h('a', { class: 'nm-btn', href: url, target: '_blank', rel: 'noopener' }, T('Met Office page', 'Σελίδα Υπηρεσίας'), SC.icon('external', 16)) : null,
            h('a', { class: 'nm-btn', href: '#/weather' }, T('Radar and forecast', 'Ραντάρ και πρόγνωση'), SC.icon('arrow', 16)))));
        if (!fromLive) card.append(h('div', { class: 'nm-callout nm-callout--warn wn-note' }, h('b', null, T('The Met Office page could not be reached just now. ', 'Η σελίδα της Υπηρεσίας δεν ήταν προσβάσιμη αυτή τη στιγμή. ')), T('This is the newest copy this site saved, so a newer warning may exist. ', 'Αυτό είναι το νεότερο αντίγραφο που αποθήκευσε ο ιστότοπος, οπότε μπορεί να υπάρχει νεότερη προειδοποίηση. '), live && live.e ? errMsg(live.e) : ''));
        if (!calm) card.append(h('pre', { class: 'wn-text' }, text.trim()));
        else if (fromLive && text.trim() && lines(text).length) card.append(h('pre', { class: 'wn-text calm' }, text.trim()));
        const pics = images.filter((u) => !/meteo_new|ISO_9001|logo|banner|spacer/i.test(u)).slice(0, 2);
        if (!calm && pics.length) card.append(h('div', { class: 'wn-pics' }, pics.map((u) => { const img = h('img', { class: 'wn-pic', src: '/api/dom/img?u=' + encodeURIComponent(u), alt: T('Picture from the Met Office warnings page', 'Εικόνα από τη σελίδα προειδοποιήσεων της Υπηρεσίας'), loading: 'lazy' }); img.addEventListener('error', () => img.remove()); return img; })));
        card.append(h('div', { class: 'wn-levels' }, T('The Department warns at three levels: ', 'Το Τμήμα εκδίδει προειδοποιήσεις σε τρία επίπεδα: '),
          h('span', { class: 'wn-lv' }, h('i', { class: 'w1' }), T('yellow', 'κίτρινο')), ', ', h('span', { class: 'wn-lv' }, h('i', { class: 'w2' }), T('orange', 'πορτοκαλί')), T(' and ', ' και '), h('span', { class: 'wn-lv' }, h('i', { class: 'w3' }), T('red', 'κόκκινο')), '.'));
        nowBox.replaceChildren(card);
      }

      /* ----- the 30-day strip ----- */
      function paintStrip() {
        const hist = S.hist;
        const card = h('section', { class: 'nm-card wn-strip', 'aria-labelledby': 'wn-strip-h' });
        card.append(h('div', { class: 'wn-sh' }, h('div', null, h('p', { class: 'card-eye' }, T('The last 30 days', 'Οι τελευταίες 30 ημέρες')), h('h2', { class: 'card-h', id: 'wn-strip-h' }, T('Was a warning on the page?', 'Υπήρχε προειδοποίηση στη σελίδα;'))), h('span', { class: 't arch' }, T('Saved copies', 'Αποθηκευμένα αντίγραφα'))));
        if (!hist) { card.append(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); stripBox.replaceChildren(card); return; }
        if (!hist.ok) { card.append(h('div', { class: 'err', role: 'alert' }, T('The saved copies could not be loaded. ', 'Τα αποθηκευμένα αντίγραφα δεν φορτώθηκαν. ') + errMsg(hist.e) + ' ', h('button', { class: 'nm-btn wn-retry', type: 'button', onclick: () => load() }, T('Try again', 'Δοκιμάστε ξανά')))); stripBox.replaceChildren(card); return; }
        const states = statesFrom(hist.v);
        if (!states.length) { card.append(h('div', { class: 'empty' }, T('No copy of the warnings page is saved yet. The server saves one the first time it reads the page and again each time the text changes, so this strip fills in as days pass.', 'Δεν έχει αποθηκευτεί ακόμη αντίγραφο της σελίδας προειδοποιήσεων. Ο διακομιστής αποθηκεύει ένα την πρώτη φορά που διαβάζει τη σελίδα και ξανά κάθε φορά που αλλάζει το κείμενο, οπότε η λωρίδα γεμίζει όσο περνούν οι ημέρες.'))); stripBox.replaceChildren(card); return; }
        const cells = stripCells(states, Date.now()), names = LEVEL_NAME();
        const readout = h('p', { class: 'wn-readout', role: 'status', 'aria-live': 'polite' });
        const text = (c) => {
          const base = dayLabel(c.key) + ': ';
          if (c.state === 'none') return base + T('no saved copy of the page covers this day.', 'κανένα αποθηκευμένο αντίγραφο δεν καλύπτει αυτή την ημέρα.');
          const tail = c.partial ? ' ' + T('(copies cover only part of this day)', '(τα αντίγραφα καλύπτουν μέρος μόνο της ημέρας)') : '';
          if (c.state === 'calm') return base + T('no warning on the page.', 'καμία προειδοποίηση στη σελίδα.') + tail;
          return base + T('a ' + (names[c.level] || names[0]) + ' warning was on the page for about ' + fmtDur(c.warn) + '.', 'υπήρχε ' + (names[c.level] || names[0]) + ' προειδοποίηση στη σελίδα για περίπου ' + fmtDur(c.warn) + '.') + tail;
        };
        const btns = [];
        let sel = cells.length - 1;
        const select = (i, focus) => { btns[sel].tabIndex = -1; btns[sel].classList.remove('sel'); sel = Math.max(0, Math.min(cells.length - 1, i)); btns[sel].tabIndex = 0; btns[sel].classList.add('sel'); readout.textContent = text(cells[sel]); if (focus) btns[sel].focus(); };
        const strip = h('div', { class: 'wn-cells', role: 'group', 'aria-label': T('Warnings on the page, day by day. Use the left and right arrow keys.', 'Προειδοποιήσεις στη σελίδα, ημέρα προς ημέρα. Χρησιμοποιήστε τα αριστερά και δεξιά βέλη.') });
        cells.forEach((c, i) => {
          const b = h('button', { type: 'button', class: 'wn-cell ' + (c.state === 'warn' ? LEVEL_CLS[c.level] : c.state) + (c.partial ? ' part' : ''), tabindex: -1, 'aria-label': text(c) }, h('span', { class: 'wn-cn', 'aria-hidden': 'true' }, i % 5 === 0 || i === cells.length - 1 ? dayNum(c.key) : ''));
          b.addEventListener('mouseenter', () => { readout.textContent = text(c); });
          b.addEventListener('mouseleave', () => { readout.textContent = text(cells[sel]); });
          b.addEventListener('focus', () => { if (btns[sel] !== b) select(i, false); else readout.textContent = text(c); });
          b.addEventListener('click', () => select(i, false));
          btns.push(b); strip.append(b);
        });
        strip.addEventListener('keydown', (e) => { const d = { ArrowLeft: -1, ArrowRight: 1, Home: -999, End: 999 }[e.key]; if (d == null) return; e.preventDefault(); select(d === -999 ? 0 : d === 999 ? cells.length - 1 : sel + d, true); });
        btns[sel].tabIndex = 0; btns[sel].classList.add('sel'); readout.textContent = text(cells[sel]);
        const warnDays = cells.filter((c) => c.state === 'warn').length, calmDays = cells.filter((c) => c.state === 'calm').length, none = cells.filter((c) => c.state === 'none').length;
        card.append(strip, readout,
          h('div', { class: 'wn-legend' },
            h('span', null, h('i', { class: 'wn-sw calm' }), T('no warning', 'καμία προειδοποίηση')), h('span', null, h('i', { class: 'wn-sw w1' }), T('yellow', 'κίτρινη')), h('span', null, h('i', { class: 'wn-sw w2' }), T('orange', 'πορτοκαλί')), h('span', null, h('i', { class: 'wn-sw w3' }), T('red', 'κόκκινη')), h('span', null, h('i', { class: 'wn-sw none' }), T('no saved copy', 'χωρίς αντίγραφο')),
            h('span', { class: 'wn-sum' }, T(warnDays + ' days with a warning · ' + calmDays + ' quiet' + (none ? ' · ' + none + ' without a copy' : ''), warnDays + ' ημέρες με προειδοποίηση · ' + calmDays + ' ήρεμες' + (none ? ' · ' + none + ' χωρίς αντίγραφο' : '')))));
        stripBox.replaceChildren(card);
      }

      /* ----- the timeline ----- */
      function paintTimeline() {
        const w = S.watch;
        const card = h('section', { class: 'nm-card wn-tl', 'aria-labelledby': 'wn-tl-h' });
        card.append(h('p', { class: 'card-eye' }, T('Changes, newest first', 'Αλλαγές, οι νεότερες πρώτα')), h('h2', { class: 'card-h', id: 'wn-tl-h' }, T('What changed on the Met Office pages', 'Τι άλλαξε στις σελίδες της Υπηρεσίας')));
        if (!w) { card.append(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); tlBox.replaceChildren(card); return; }
        if (!w.ok) { card.append(h('div', { class: 'err', role: 'alert' }, T('The list of changes could not be loaded. ', 'Η λίστα αλλαγών δεν φορτώθηκε. ') + errMsg(w.e) + ' ', h('button', { class: 'nm-btn wn-retry', type: 'button', onclick: () => load() }, T('Try again', 'Δοκιμάστε ξανά')))); tlBox.replaceChildren(card); return; }
        const all = (w.v && w.v.items) || [];
        const warn = all.filter((x) => x.page === 'warnings'), other = all.filter((x) => x.page !== 'warnings');
        if (S.only == null) S.only = warn.length || !other.length ? 'warnings' : 'all';
        const items = S.only === 'warnings' ? warn : S.only === 'other' ? other : all;
        card.append(h('div', { class: 'nm-pillbar wn-pills', role: 'group', 'aria-label': T('Show changes of', 'Εμφάνιση αλλαγών για') },
          [['warnings', T('Warnings', 'Προειδοποιήσεις'), warn.length], ['other', T('Forecast and other pages', 'Προγνώσεις και άλλες σελίδες'), other.length], ['all', T('All', 'Όλα'), all.length]].map(([id, label, n]) =>
            h('button', { type: 'button', class: S.only === id ? 'on' : '', 'aria-pressed': S.only === id ? 'true' : 'false', onclick: () => { S.only = id; paintTimeline(); } }, label + ' ' + n))));
        if (w.v && w.v.saved === false) card.append(h('div', { class: 'empty' }, T('This server is not saving page copies, so there is no history of changes.', 'Αυτός ο διακομιστής δεν αποθηκεύει αντίγραφα σελίδων, οπότε δεν υπάρχει ιστορικό αλλαγών.')));
        else if (!items.length) card.append(h('div', { class: 'empty' }, S.only === 'warnings'
          ? T('No change to the warnings in the last 30 days that this site has seen. A change appears here when the page text changes: a warning issued, ended or reworded.', 'Καμία αλλαγή στις προειδοποιήσεις τις τελευταίες 30 ημέρες που να έχει δει ο ιστότοπος. Μια αλλαγή εμφανίζεται εδώ όταν αλλάζει το κείμενο της σελίδας: εκδίδεται, λήγει ή αλλάζει μια προειδοποίηση.')
          : T('No changes to show for this choice.', 'Δεν υπάρχουν αλλαγές για αυτή την επιλογή.')));
        else {
          const ol = h('ol', { class: 'wn-list' });
          let lastDay = '';
          items.forEach((x) => {
            const k = KIND[x.kind] || KIND.changed;
            const dk = keyAt(x.at);
            if (dk !== lastDay) { lastDay = dk; ol.append(h('li', { class: 'wn-day', 'aria-hidden': 'true' }, SC.day(x.at))); }
            const ttl = (SC.lang === 'el' && x.titleEl ? x.titleEl : x.title) || x.page;
            const lv = x.page === 'warnings' && x.kind !== 'ended' ? levelOf(x.text) : 0;
            ol.append(h('li', { class: 'wn-item', style: { '--nd': k.color } },
              h('span', { class: 'wn-nd', 'aria-hidden': 'true' }, SC.icon(k.icon, 16)),
              h('div', { class: 'wn-tx' },
                h('div', { class: 'wn-tt' }, h('b', null, k.label()), x.page === 'warnings' ? null : h('span', { class: 'wn-pg' }, ttl), lv ? h('span', { class: 'wn-lvl ' + LEVEL_CLS[lv] }, LEVEL_NAME()[lv]) : null),
                h('div', { class: 'wn-tm' }, SC.time(x.at) + ' · ' + SC.ago(x.at)),
                x.text ? h('p', { class: 'wn-body' }, x.kind === 'ended' ? T('What ended: ', 'Τι έληξε: ') : '', x.text) : null)));
          });
          card.append(ol);
        }
        card.append(h('p', { class: 'wn-fine' }, T('Radar pictures are not saved by this site, only the text of the pages, so there is no radar history here. The radar as it is now is on the Met Office record.', 'Οι εικόνες ραντάρ δεν αποθηκεύονται από τον ιστότοπο, μόνο το κείμενο των σελίδων, οπότε δεν υπάρχει ιστορικό ραντάρ εδώ. Το ραντάρ όπως είναι τώρα βρίσκεται στο Μετεωρολογικό αρχείο.'), ' ', h('a', { class: 'link', href: '#/weather' }, T('Open the Met Office record', 'Άνοιγμα Μετεωρολογικού αρχείου'))));
        tlBox.replaceChildren(card);
      }

      /* ----- the older versions ----- */
      function paintOld() {
        const hist = S.hist;
        const card = h('section', { class: 'nm-card wn-old', 'aria-labelledby': 'wn-old-h' });
        card.append(h('p', { class: 'card-eye' }, T('Saved versions', 'Αποθηκευμένες εκδόσεις')), h('h2', { class: 'card-h', id: 'wn-old-h' }, T('Every copy of the page', 'Κάθε αντίγραφο της σελίδας')));
        if (!hist) { card.append(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); oldBox.replaceChildren(card); return; }
        if (!hist.ok) { card.append(h('div', { class: 'err', role: 'alert' }, T('The saved versions could not be loaded. ', 'Οι αποθηκευμένες εκδόσεις δεν φορτώθηκαν. ') + errMsg(hist.e) + ' ', h('button', { class: 'nm-btn wn-retry', type: 'button', onclick: () => load() }, T('Try again', 'Δοκιμάστε ξανά')))); oldBox.replaceChildren(card); return; }
        const from = Date.now() - 30 * DAY;
        const v = hist.v.filter((x) => x.t >= from).slice().reverse();
        if (!v.length) { card.append(h('div', { class: 'empty' }, T('No saved versions in the last 30 days. The server saves one each time the warnings text changes.', 'Δεν υπάρχουν αποθηκευμένες εκδόσεις τις τελευταίες 30 ημέρες. Ο διακομιστής αποθηκεύει μία κάθε φορά που αλλάζει το κείμενο των προειδοποιήσεων.'))); oldBox.replaceChildren(card); return; }
        card.append(h('p', { class: 'card-sub' }, T(v.length + (v.length === 1 ? ' version' : ' versions') + ' in the last 30 days, newest first. Open one to read it as it was.', v.length + (v.length === 1 ? ' έκδοση' : ' εκδόσεις') + ' τις τελευταίες 30 ημέρες, οι νεότερες πρώτα. Ανοίξτε μία για να τη διαβάσετε όπως ήταν.')));
        const shown = v.slice(0, S.olderN);
        card.append(h('div', { class: 'wn-vers' }, shown.map((x, i) => {
          const calm = isCalm(x.text), lv = calm ? -1 : levelOf(x.text), first = lines(x.text)[0] || '';
          return h('details', { class: 'wn-ver' }, h('summary', null,
            h('span', { class: 'wn-vt' }, when(x.t), i === 0 ? h('em', null, T('newest', 'νεότερη')) : null),
            h('span', { class: 'wn-vs' }, calm ? h('span', { class: 'wn-lvl calm' }, T('no warning', 'καμία προειδοποίηση')) : h('span', { class: 'wn-lvl ' + LEVEL_CLS[lv] }, LEVEL_NAME()[lv]), calm ? '' : ' ' + first.slice(0, 80))),
            h('pre', { class: 'wn-vp' }, String(x.text || '').trim() || T('(the page was empty)', '(η σελίδα ήταν κενή)')));
        })));
        if (v.length > shown.length) card.append(h('button', { class: 'nm-btn wn-more', type: 'button', onclick: () => { S.olderN += 12; paintOld(); } }, T('Show ' + Math.min(12, v.length - shown.length) + ' more', 'Εμφάνιση ' + Math.min(12, v.length - shown.length) + ' ακόμη')));
        card.append(h('p', { class: 'wn-fine' }, h('a', { class: 'link', href: '/api/dom/pages/history?name=warnings&days=90', target: '_blank', rel: 'noopener' }, T('The same list as data (JSON)', 'Η ίδια λίστα ως δεδομένα (JSON)')), ' · ', h('a', { class: 'link', href: '#/archive' }, T('What else is saved', 'Τι άλλο αποθηκεύεται'))));
        oldBox.replaceChildren(card);
      }

      function paintAll() { if (!alive) return; head(); paintNow(); paintStrip(); paintTimeline(); paintOld(); }
      const sig = (r) => JSON.stringify(r && r.ok ? r.v : r ? String(r.e && r.e.message) : null);
      let sigs = { hist: '', watch: '' };

      async function load() {
        if (firstLoad) { S.live = S.hist = S.watch = null; head(); nowBox.replaceChildren(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); paintStrip(); paintTimeline(); paintOld(); }
        const [live, hist, watch] = await Promise.all([
          settle(SC.api('/api/dom/page?name=warnings')),
          settle(SC.api('/api/dom/pages/history?name=warnings&days=90').then((r) => (Array.isArray(r) ? r : []))),
          settle(SC.api('/api/dom/watch?days=30&limit=100')),
        ]);
        if (!alive) return;
        const again = !firstLoad;
        S.live = live; S.hist = hist; S.watch = watch; firstLoad = false;
        if (!again) { sigs = { hist: sig(hist), watch: sig(watch) }; paintAll(); return; }
        // A refresh redraws only what can have changed, so a version you opened stays open.
        head(); paintNow();
        const hs = sig(hist), ws = sig(watch);
        if (hs !== sigs.hist) { sigs.hist = hs; paintStrip(); paintOld(); }
        if (ws !== sigs.watch) { sigs.watch = ws; paintTimeline(); }
      }

      await load();
      timer = setInterval(() => { load(); }, 120000);
      return () => { alive = false; clearInterval(timer); };
    },
  });
})();
