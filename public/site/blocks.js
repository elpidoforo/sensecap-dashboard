/* Build studio: "Build with blocks". pages/studio.js loads this file when a signed-in student opens the Blocks tab.

   SC.blocks.mount(host, o) draws the block builder into `host` and returns { load(project), destroy() }.
     o.onSaved(project, { submitted })  called after the server saved (or sent) the tool
     o.onWords(project)                 called when the student wants to carry on in words: the saved draft opens in the normal workspace

   What the student builds is a "recipe": a few choices (what to show, how far back, how to draw it, alerts, a second school to compare).
   It is sent to the server as data. The server checks every choice, says it back in words (the sentence a teacher reads) and draws the page:
   plain HTML and SVG, no script. Nothing a student types here is ever run.

   Choices made on purpose:
   - A fixed stack with native <select> and <input> fields, not a free drag-and-drop canvas: it works with a keyboard, a screen reader, a phone and Greek input,
     and it is light on a school Chromebook. The palette adds the optional blocks with a press or Enter.
   - The sentence under the stack comes from the server (one place for the words, in both languages), the preview is the server's page in the same safe box
     as every draft (an iframe with sandbox="allow-scripts"). */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  const t = (en, el) => SC.t(en, el);
  const el = (...a) => SC.el(...a);

  const COLOURS = ['red', 'orange', 'green', 'blue'];
  const COLOUR_TEXT = { red: ['red', 'κόκκινο'], orange: ['orange', 'πορτοκαλί'], green: ['green', 'πράσινο'], blue: ['blue', 'μπλε'] };
  const CHART_TEXT = { line: ['Line chart', 'Γραμμικό γράφημα'], bars: ['Bar chart', 'Ραβδογράφημα'], number: ['Big number', 'Μεγάλο νούμερο'], table: ['Small table', 'Μικρός πίνακας'] };
  const hoursText = (h) => (h === 1 ? t('1 hour', '1 ώρα') : h < 72 ? t(h + ' hours', h + ' ώρες') : t(h / 24 + ' days', h / 24 + ' ημέρες'));
  const lang = () => (SC.lang === 'el' ? 'el' : 'en');
  // The shared icon set has no "play"; this draws one the same way (a static string, never student text).
  const icon = (name, size) => { const s = SC.icon(name, size); if (name === 'play') s.innerHTML = '<path d="M8 5.5v13l11-6.5z"/>'; return s; };

  // A starting alert that makes sense for the measurement, written in the site's language.
  function starterAlert(mid) {
    if (String(mid) === '4100') return { when: 'above', value: 1000, colour: 'red', say: t('Open a window!', 'Άνοιξε ένα παράθυρο!') };
    if (String(mid) === '4097') return { when: 'above', value: 28, colour: 'orange', say: t('It is warm', 'Κάνει ζέστη') };
    if (String(mid) === '4098') return { when: 'above', value: 70, colour: 'blue', say: t('Very humid', 'Πολλή υγρασία') };
    return { when: 'above', value: 0, colour: 'red', say: '' };
  }

  function mount(host, o) {
    o = o || {};
    const S = {
      options: null, loadErr: null, recipe: null, title: '', autoTitle: '', id: null, sentence: '', readings: null, sensors: null,
      previewUrl: '', previewState: 'idle', err: '', busy: false, done: '', dirty: false,
    };
    let alive = true, timer = 0, seq = 0;
    const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const root = el('section', { class: 'bk', 'aria-labelledby': 'bk-h' });
    host.append(root, live);

    /* ---------- small helpers ---------- */
    const opt = () => S.options;
    const measOf = (id) => opt().measurements.find((m) => m.id === id);
    const schoolOf = (id) => opt().schools.find((s) => s.id === id);
    const sName = (s) => (lang() === 'el' ? s.el : s.name);
    const mName = (m) => (lang() === 'el' ? m.el : m.name);
    const unitOf = () => { const m = measOf(S.recipe.show.measurement); return m ? m.unit : ''; };

    function blank() {
      const O = opt();
      const m = O.measurements.find((x) => x.id === '4100') || O.measurements.find((x) => x.id === '4097') || O.measurements[0];
      const school = m ? m.schools[0] : (O.schools[0] || {}).id;
      return { show: { measurement: m ? m.id : '', school: school || '' }, last: 24, as: 'line', alerts: [], compare: null };
    }
    function fixAfterMeasurement() {
      const r = S.recipe, m = measOf(r.show.measurement);
      if (!m) return;
      if (!m.schools.includes(r.show.school)) r.show.school = m.schools[0];
      if (r.compare && (!m.schools.includes(r.compare.school) || r.compare.school === r.show.school)) r.compare = null;
    }
    const dirty = () => { S.dirty = true; S.done = ''; };

    /* ---------- calls ---------- */
    function whyText(e) {
      const code = e && e.body && e.body.code, st = e && e.status;
      const m = {
        measurement: t('Pick what to show.', 'Διάλεξε τι να δείξεις.'), school: t('Pick a school.', 'Διάλεξε σχολείο.'),
        nosensor: t('That school has no sensor for this. Pick another school or another measurement.', 'Αυτό το σχολείο δεν έχει αισθητήρα γι’ αυτό. Διάλεξε άλλο σχολείο ή άλλη μέτρηση.'),
        last: t('Pick how far back to look.', 'Διάλεξε πόσο πίσω να κοιτάξεις.'), as: t('Pick how to show it.', 'Διάλεξε πώς θα το δείξεις.'),
        alerts: t('Something is not right with the alert blocks.', 'Κάτι δεν πάει καλά με τα μπλοκ ειδοποίησης.'),
        alert_value: t('Type a number for the alert.', 'Γράψε έναν αριθμό για την ειδοποίηση.'), alert_colour: t('Pick a colour for the alert.', 'Διάλεξε χρώμα για την ειδοποίηση.'),
        alert_say: t('The alert message is too long (60 characters at most).', 'Το μήνυμα της ειδοποίησης είναι πολύ μεγάλο (έως 60 χαρακτήρες).'),
        alert_private: t('Take out phone numbers, e-mail addresses, links and names from the alert message.', 'Βγάλε τηλέφωνα, email, συνδέσμους και ονόματα από το μήνυμα της ειδοποίησης.'),
        title_private: t('Take out phone numbers, e-mail addresses, links and names from the title.', 'Βγάλε τηλέφωνα, email, συνδέσμους και ονόματα από τον τίτλο.'),
        compare: t('Pick a different school to compare with.', 'Διάλεξε ένα άλλο σχολείο για σύγκριση.'),
        rate: t('You are going fast. Wait a moment, then try again.', 'Πας πολύ γρήγορα. Περίμενε λίγο και ξαναδοκίμασε.'),
      };
      if (st === 0) return e.message;
      if (m[code]) return m[code];
      if (st === 401) return t('Sign in with your account to build.', 'Συνδέσου με τον λογαριασμό σου για να φτιάξεις.');
      if (st === 429) return t('You have too many tools. Delete some old drafts first.', 'Έχεις πάρα πολλά εργαλεία. Σβήσε πρώτα μερικά παλιά προσχέδια.');
      return t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκίμασε ξανά.');
    }
    const body = () => ({ recipe: S.recipe, title: S.title.trim(), lang: lang() });

    async function loadOptions() {
      try { S.options = await SC.api('/studio/api/blocks/options'); S.loadErr = null; if (!S.recipe) S.recipe = blank(); }
      catch (e) { S.loadErr = e; }
      if (!alive) return;
      draw();
      if (S.options && S.recipe && S.recipe.show.measurement) preview(0);
    }

    function preview(delay) {
      clearTimeout(timer);
      if (!S.options || !S.recipe || !S.recipe.show.measurement) return;
      const mine = ++seq;
      S.previewState = 'loading'; paintPreview();
      timer = setTimeout(async () => {
        try {
          const r = await SC.api('/studio/api/blocks/preview', { method: 'POST', body: body() });
          if (!alive || mine !== seq) return;
          S.previewUrl = r.url + (r.url.includes('?') ? '&' : '?') + 'lang=' + lang(); S.sentence = r.sentence; S.autoTitle = r.title; S.readings = r.readings; S.sensors = r.sensors;
          S.previewState = 'ok'; S.err = '';
        } catch (e) {
          if (!alive || mine !== seq) return;
          S.previewState = 'error'; S.err = whyText(e);
        }
        paintPreview(); paintWords();
      }, delay == null ? 450 : delay);
    }
    const changed = (delay) => { dirty(); preview(delay); };

    // Saves the draft (and sends it when asked). Returns the project or null.
    async function save(submit, showName) {
      if (S.busy) return null;
      S.busy = true; S.err = ''; drawActions();
      try {
        const payload = body();
        if (S.id) payload.id = S.id;
        if (submit) { payload.submit = true; if (typeof showName === 'boolean') payload.show_name = showName; }
        const r = await SC.api('/studio/api/blocks/save', { method: 'POST', body: payload });
        S.id = r.project.id; S.dirty = false;
        if (!S.title.trim()) S.autoTitle = r.project.title;
        S.done = submit ? t('Sent to your teacher. It appears under In review.', 'Στάλθηκε στον εκπαιδευτικό σου. Εμφανίζεται στο «Σε έλεγχο».') : t('Saved in your drafts.', 'Αποθηκεύτηκε στα προσχέδιά σου.');
        live.textContent = S.done;
        if (o.onSaved) o.onSaved(r.project, { submitted: Boolean(submit) });
        S.busy = false; drawActions(); paintWords(); paintError();
        if (submit) { S.id = null; S.recipe = blank(); S.title = ''; S.dirty = false; draw(); preview(0); }
        return r.project;
      } catch (e) {
        S.err = whyText(e); S.busy = false; drawActions(); paintError();
        return null;
      }
    }

    function sendDialog() {
      const showBox = el('input', { type: 'checkbox', id: 'bk-shown', checked: true });
      const first = String((SC.account && SC.account.name) || '').trim().split(/\s+/);
      const sample = first[0] ? (first.length > 1 ? first[0] + ' ' + [...first[first.length - 1]][0].toUpperCase() + '.' : first[0]) : '';
      const nameRow = el('label', { class: 'sd-nm', for: 'bk-shown' }, showBox, el('span', null, el('b', null, t('Show my name on the tile', 'Εμφάνιση του ονόματός μου στην κάρτα')),
        el('small', null, t('People would see ' + (sample ? '“' + sample + '”' : 'your first name and the first letter of your surname') + ' and your team. Untick it to show only the team. You can change this later.', 'Οι άνθρωποι θα βλέπουν ' + (sample ? '«' + sample + '»' : 'το μικρό σου όνομα και το αρχικό του επωνύμου') + ' και την ομάδα σου. Ξε-τσέκαρέ το για να φαίνεται μόνο η ομάδα. Μπορείς να το αλλάξεις αργότερα.'))));
      SC.modal({
        title: t('Send to your teacher?', 'Αποστολή στον εκπαιδευτικό σου;'),
        body: el('div', null, el('p', null, t('Your teacher reads the sentence under your blocks and checks the tool before anyone else can open it. They may send it back with a note.', 'Ο εκπαιδευτικός σου διαβάζει την πρόταση κάτω από τα μπλοκ σου και ελέγχει το εργαλείο πριν το ανοίξει κάποιος άλλος. Μπορεί να το στείλει πίσω με σημείωμα.')), nameRow),
        actions: [{ label: t('Not yet', 'Όχι ακόμη') }, { label: t('Send to teacher', 'Αποστολή στον εκπαιδευτικό'), primary: true, run: () => save(true, showBox.checked) }],
      });
    }

    /* ---------- the screen ---------- */
    let wordsBox, errBox, frameBox, metaBox, actionsBox, titleIn, stackBox, palBox;

    function select(key, value, options, label, onChange) {
      const s = el('select', { class: 'bk-sel', 'data-k': key, 'aria-label': label }, options.map(([v, text]) => el('option', { value: String(v), selected: String(v) === String(value) }, text)));
      s.addEventListener('change', () => onChange(s.value));
      return s;
    }
    const word = (text) => el('span', { class: 'bk-w' }, text);

    function showBlock() {
      const r = S.recipe, O = opt(), m = measOf(r.show.measurement);
      const schools = m ? O.schools.filter((s) => m.schools.includes(s.id)) : O.schools;
      return el('div', { class: 'bk-blk', style: '--c:#4CA3E8;--bg:#173452' },
        word(t('Show', 'Δείξε')),
        select('measurement', r.show.measurement, O.measurements.map((x) => [x.id, mName(x) + (x.unit ? ' (' + x.unit + ')' : '')]), t('What to show', 'Τι να δείξεις'), (v) => { r.show.measurement = v; fixAfterMeasurement(); r.alerts = r.alerts.length ? [starterAlertFor(v)] : r.alerts; changed(); draw('measurement'); }),
        word(t('at', 'στο')),
        select('school', r.show.school, schools.map((x) => [x.id, sName(x)]), t('Which school', 'Ποιο σχολείο'), (v) => { r.show.school = v; if (r.compare && r.compare.school === v) r.compare = null; changed(); draw('school'); }));
    }
    function starterAlertFor(v) { return starterAlert(v); }
    function lastBlock() {
      const r = S.recipe;
      return el('div', { class: 'bk-blk', style: '--c:#35C2AA;--bg:#123f48' }, word(t('for the last', 'για τις τελευταίες')),
        select('last', r.last, opt().hours.map((h) => [h, hoursText(h)]), t('How far back', 'Πόσο πίσω'), (v) => { r.last = Number(v); changed(); draw('last'); }));
    }
    function asBlock() {
      const r = S.recipe;
      return el('div', { class: 'bk-blk', style: '--c:#F2A56B;--bg:#4a3322' }, word(t('as a', 'ως')),
        select('as', r.as, opt().charts.map((c) => [c, t(CHART_TEXT[c][0], CHART_TEXT[c][1])]), t('How to show it', 'Πώς θα το δείξεις'), (v) => { r.as = v; changed(); draw('as'); }));
    }
    function alertBlock(a, i) {
      const r = S.recipe;
      const num = el('input', { class: 'bk-in bk-num', type: 'number', inputmode: 'decimal', step: 'any', value: String(a.value), 'data-k': 'a' + i + 'v', 'aria-label': t('Alert number', 'Αριθμός ειδοποίησης') });
      num.addEventListener('input', () => { const v = num.value.trim(); a.value = v === '' ? '' : Number(v); changed(); });
      const say = el('input', { class: 'bk-in bk-say', type: 'text', maxlength: 60, value: a.say, placeholder: t('A short message (optional)', 'Ένα σύντομο μήνυμα (προαιρετικό)'), 'data-k': 'a' + i + 's', 'aria-label': t('Alert message', 'Μήνυμα ειδοποίησης') });
      say.addEventListener('input', () => { a.say = say.value; changed(); });
      const rm = el('button', { class: 'bk-x', type: 'button', 'aria-label': t('Remove alert block ' + (i + 1), 'Αφαίρεση μπλοκ ειδοποίησης ' + (i + 1)), onclick: () => { r.alerts.splice(i, 1); changed(0); draw('add-alert'); } }, '×');
      return el('div', { class: 'bk-blk', style: '--c:#F7C46B;--bg:#493f22' },
        word(t('When it', 'Όταν')),
        select('a' + i + 'w', a.when, [['above', t('goes above', 'ανέβει πάνω από')], ['below', t('drops below', 'πέσει κάτω από')]], t('Above or below', 'Πάνω ή κάτω'), (v) => { a.when = v; changed(); draw('a' + i + 'w'); }),
        num, unitOf() ? el('span', { class: 'bk-w' }, unitOf() + ',') : word(','),
        word(t('colour it', 'χρωμάτισέ το')),
        select('a' + i + 'c', a.colour, COLOURS.map((c) => [c, t(COLOUR_TEXT[c][0], COLOUR_TEXT[c][1])]), t('Colour', 'Χρώμα'), (v) => { a.colour = v; changed(); draw('a' + i + 'c'); }),
        word(t('and say', 'και γράψε')), say, rm);
    }
    function compareBlock() {
      const r = S.recipe, O = opt(), m = measOf(r.show.measurement);
      const others = O.schools.filter((s) => s.id !== r.show.school && m && m.schools.includes(s.id));
      return el('div', { class: 'bk-blk', style: '--c:#B79CF2;--bg:#302b55' }, word(t('Compare with', 'Σύγκρινε με')),
        select('compare', r.compare.school, others.map((x) => [x.id, sName(x)]), t('School to compare with', 'Σχολείο για σύγκριση'), (v) => { r.compare = { school: v }; changed(); draw('compare'); }),
        el('button', { class: 'bk-x', type: 'button', 'aria-label': t('Remove the compare block', 'Αφαίρεση του μπλοκ σύγκρισης'), onclick: () => { r.compare = null; changed(0); draw('add-compare'); } }, '×'));
    }

    function palette() {
      const r = S.recipe, O = opt(), m = measOf(r.show.measurement);
      const canCompare = m && O.schools.some((s) => s.id !== r.show.school && m.schools.includes(s.id));
      const item = (c, title, text, count, state, run) => {
        const b = el('button', { class: 'bk-pb' + (state.fixed ? ' bk-pb--fixed' : ''), type: 'button', style: '--c:' + c, disabled: state.disabled, 'data-k': state.key, 'aria-label': title + '. ' + state.label, onclick: run },
          el('span', { class: 'bk-n' }, count), el('strong', null, title), el('small', null, text), el('span', { class: 'bk-st' }, state.label));
        return b;
      };
      const inStack = t('In your tool', 'Στο εργαλείο σου');
      return [
        item('#4CA3E8', t('Show', 'Δείξε'), t('Pick what to look at: a measurement at a school.', 'Διάλεξε τι θα κοιτάξεις: μια μέτρηση σε ένα σχολείο.'), t('always', 'πάντα'), { disabled: true, fixed: true, label: inStack }),
        item('#35C2AA', t('For the last', 'Για τις τελευταίες'), t('Pick how far back: 1 hour to 7 days.', 'Διάλεξε πόσο πίσω: από 1 ώρα έως 7 ημέρες.'), t('always', 'πάντα'), { disabled: true, fixed: true, label: inStack }),
        item('#F2A56B', t('As a', 'Ως'), t('Line chart, bars, one big number or a small table.', 'Γραμμικό γράφημα, ράβδοι, ένα μεγάλο νούμερο ή ένας μικρός πίνακας.'), t('always', 'πάντα'), { disabled: true, fixed: true, label: inStack }),
        item('#F7C46B', t('When it goes above', 'Όταν ανέβει πάνω από'), t('Colour it and say something short when a number is too high or too low.', 'Χρώμασέ το και γράψε κάτι σύντομο όταν ένας αριθμός είναι πολύ ψηλός ή πολύ χαμηλός.'), t('0 to 3', '0 έως 3'),
          { disabled: r.alerts.length >= 3, key: 'add-alert', label: r.alerts.length >= 3 ? t('3 of 3 added', '3 από 3') : t('Press to add', 'Πάτα για προσθήκη') }, () => { r.alerts.push(starterAlert(r.show.measurement)); changed(0); draw('a' + (r.alerts.length - 1) + 'v'); }),
        item('#B79CF2', t('Compare with', 'Σύγκρινε με'), t('Put a second school beside it.', 'Βάλε ένα δεύτερο σχολείο δίπλα του.'), t('0 or 1', '0 ή 1'),
          { disabled: Boolean(r.compare) || !canCompare, key: 'add-compare', label: r.compare ? inStack : canCompare ? t('Press to add', 'Πάτα για προσθήκη') : t('No other school has it', 'Κανένα άλλο σχολείο δεν το έχει') }, () => {
            const others = O.schools.filter((s) => s.id !== r.show.school && m.schools.includes(s.id));
            r.compare = { school: others[0].id }; changed(0); draw('compare');
          }),
      ];
    }

    function paintWords() {
      if (!wordsBox) return;
      wordsBox.replaceChildren(el('h3', null, t('In words, as your teacher will read it', 'Με λόγια, όπως θα το διαβάσει ο εκπαιδευτικός σου')), el('p', null, S.sentence || '…'));
    }
    function paintError() {
      if (!errBox) return;
      errBox.replaceChildren(...(S.err ? [el('div', { class: 'err', role: 'alert' }, S.err)] : []), ...(S.done ? [el('div', { class: 'nm-callout nm-callout--ok bk-done' }, S.done)] : []));
    }
    function paintPreview() {
      if (!frameBox) return;
      const loading = S.previewState === 'loading';
      frameBox.classList.toggle('is-loading', loading);
      if (S.previewUrl && frameBox._src !== S.previewUrl) { frameBox._src = S.previewUrl; frameBox.querySelector('iframe').src = S.previewUrl; }
      if (metaBox) {
        metaBox.textContent = S.previewState === 'error' ? '' : S.sensors === 0 ? t('This school has no sensor for this right now.', 'Αυτό το σχολείο δεν έχει αισθητήρα γι’ αυτό αυτή τη στιγμή.')
          : S.readings === 0 ? t('The sensors sent no numbers in this time window. The page says so.', 'Οι αισθητήρες δεν έστειλαν αριθμούς σε αυτό το διάστημα. Η σελίδα το λέει.') : S.readings ? t(S.sensors + (S.sensors === 1 ? ' sensor' : ' sensors') + ' · ' + S.readings + ' readings in the picture', S.sensors + (S.sensors === 1 ? ' αισθητήρας' : ' αισθητήρες') + ' · ' + S.readings + ' μετρήσεις στην εικόνα') : '';
      }
      paintError();
    }
    function drawActions() {
      if (!actionsBox) return;
      const dis = S.busy || S.previewState === 'error' || !S.recipe || !S.recipe.show.measurement;
      actionsBox.replaceChildren(...[
        el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: S.busy, onclick: () => { preview(0); const f = root.querySelector('.bk-frame iframe'); if (f) f.focus({ preventScroll: true }); } }, icon('play', 18), t('Run my blocks', 'Τρέξε τα μπλοκ μου')),
        el('button', { class: 'nm-btn', type: 'button', disabled: dis, onclick: () => save(false) }, t('Save draft', 'Αποθήκευση προσχεδίου')),
        el('button', { class: 'nm-btn', type: 'button', disabled: dis, onclick: async () => { const p = await save(false); if (p && o.onWords) o.onWords(p); } }, t('Change it with words', 'Άλλαξέ το με λόγια')),
        el('button', { class: 'nm-btn', type: 'button', disabled: dis, onclick: sendDialog }, t('Send to my teacher', 'Αποστολή στον εκπαιδευτικό μου')),
        S.id ? el('button', { class: 'nm-btn nm-btn--danger-outline', type: 'button', disabled: S.busy, onclick: confirmDelete }, t('Delete this draft', 'Διαγραφή προσχεδίου')) : null].filter(Boolean));   // replaceChildren would write a null as the word "null"
    }

    // A saved draft can be thrown away (the same call the studio's own "Discard this draft" makes). The stack starts again, empty of choices.
    function confirmDelete() {
      const id = S.id; if (!id) return;
      SC.modal({
        title: t('Delete this draft?', 'Να διαγραφεί το προσχέδιο;'),
        body: el('p', null, t('"' + (S.title.trim() || S.autoTitle || '') + '" will be deleted from your account. This cannot be undone.', 'Το «' + (S.title.trim() || S.autoTitle || '') + '» θα διαγραφεί από τον λογαριασμό σου. Δεν αναιρείται.')),
        actions: [{ label: t('Keep it', 'Να μείνει') }, { label: t('Delete', 'Διαγραφή'), primary: true, run: async () => {
          try {
            await SC.api('/studio/api/projects/' + id + '/delete', { method: 'POST', body: {} });
            S.id = null; S.title = ''; S.autoTitle = ''; S.recipe = blank(); S.dirty = false; S.done = ''; S.err = '';
            if (o.onSaved) o.onSaved(null, { deleted: true });
            SC.toast(t('Draft deleted.', 'Το προσχέδιο διαγράφηκε.'));
            draw(); preview(0);
          } catch (e) { SC.toast(whyText(e)); }
        } }],
      });
    }

    function draw(focusKey) {
      if (!alive) return;
      if (S.loadErr) {
        root.replaceChildren(el('div', { class: 'err', role: 'alert' }, S.loadErr.status === 401 ? t('Sign in with your account to build with blocks.', 'Συνδέσου με τον λογαριασμό σου για να φτιάξεις με μπλοκ.') : t('The block builder could not be loaded. ', 'Ο δημιουργός μπλοκ δεν φορτώθηκε. ') + ((S.loadErr && S.loadErr.message) || '')),
          el('div', { class: 'sd-actions' }, el('button', { class: 'nm-btn', type: 'button', onclick: () => { S.loadErr = null; root.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); loadOptions(); } }, t('Try again', 'Δοκίμασε ξανά'))));
        return;
      }
      if (!S.options) { root.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); return; }
      if (!S.options.measurements.length || !S.options.schools.length) {
        root.replaceChildren(el('div', { class: 'nm-callout nm-callout--warn' }, t('No school sensors are reporting right now, so there is nothing to build with yet. Try again later, or describe a tool in words.', 'Κανένας αισθητήρας σχολείου δεν στέλνει τώρα, οπότε δεν υπάρχει ακόμη κάτι για να φτιάξεις. Δοκίμασε αργότερα ή περιέγραψε ένα εργαλείο με λόγια.')));
        return;
      }
      const r = S.recipe;
      palBox = el('div', { class: 'bk-pal' }, palette());
      stackBox = el('div', { class: 'bk-stack' }, showBlock(), lastBlock(), asBlock(), ...r.alerts.map(alertBlock), r.compare ? compareBlock() : null);
      wordsBox = el('div', { class: 'bk-words', 'aria-live': 'polite' });
      errBox = el('div', { class: 'bk-err' });
      actionsBox = el('div', { class: 'bk-acts' });
      titleIn = el('input', { class: 'nm-input bk-title', id: 'bk-title', type: 'text', maxlength: 80, value: S.title, placeholder: S.autoTitle || t('A name for your tool', 'Ένα όνομα για το εργαλείο σου') });
      titleIn.addEventListener('input', () => { S.title = titleIn.value; dirty(); preview(700); });
      metaBox = el('p', { class: 'bk-meta' });
      const iframe = el('iframe', { class: 'bk-iframe', sandbox: 'allow-scripts', title: t('Preview of your tool', 'Προεπισκόπηση του εργαλείου σου'), referrerpolicy: 'no-referrer' });
      frameBox = el('div', { class: 'bk-frame' }, el('div', { class: 'bk-pvbar' }, icon('lock', 16), el('span', null, t('Preview in a safe box, built to block the internet', 'Προεπισκόπηση σε ασφαλές κουτί, φτιαγμένο να μπλοκάρει το internet'))), iframe);
      root.replaceChildren(
        el('div', { class: 'bk-grid' },
          el('div', { class: 'bk-card bk-c1' }, el('h2', null, t('Blocks', 'Μπλοκ')), el('p', { class: 'bk-hint' }, t('Press a block to add it to your tool.', 'Πάτα ένα μπλοκ για να το προσθέσεις στο εργαλείο σου.')), palBox),
          el('div', { class: 'bk-card bk-c2', id: 'bk-h' }, el('h2', null, t('Your tool, one block at a time', 'Το εργαλείο σου, ένα μπλοκ τη φορά')), el('p', { class: 'bk-hint' }, t('Read it from top to bottom like a sentence. Change a word with its menu.', 'Διάβασέ το από πάνω προς τα κάτω σαν πρόταση. Άλλαξε μια λέξη από το μενού της.')),
            stackBox, el('label', { class: 'bk-lab', for: 'bk-title' }, t('Name of your tool', 'Όνομα του εργαλείου σου')), titleIn, wordsBox, errBox, actionsBox),
          el('div', { class: 'bk-card bk-c3' }, el('h2', null, t('What it looks like', 'Πώς φαίνεται')), frameBox, metaBox,
            el('ul', { class: 'bk-safe' }, el('li', null, t('Blocks only choose from real data we already show. You cannot type code here.', 'Τα μπλοκ διαλέγουν μόνο από πραγματικά δεδομένα που ήδη δείχνουμε. Εδώ δεν γράφεις κώδικα.')),
              el('li', null, t('A teacher reads the one sentence, then approves it or sends it back with a note.', 'Ένας εκπαιδευτικός διαβάζει την πρόταση και μετά το εγκρίνει ή το στέλνει πίσω με σημείωμα.')),
              el('li', null, t('The page uses fresh numbers each time it is opened.', 'Η σελίδα χρησιμοποιεί φρέσκους αριθμούς κάθε φορά που ανοίγει.'))))));
      paintWords(); paintPreview(); drawActions();
      if (focusKey) { const f = root.querySelector('[data-k="' + focusKey + '"]'); if (f && !f.disabled) f.focus({ preventScroll: true }); }
    }

    /* ---------- go ---------- */
    root.append(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
    loadOptions();

    return {
      // Open a saved blocks draft for changes (the project JSON from GET /studio/api/projects/:id, which carries `recipe`).
      load(p) {
        if (!p || !p.recipe) return false;
        const go = () => {
          S.id = p.id; S.title = p.title || ''; S.recipe = JSON.parse(JSON.stringify(p.recipe)); S.dirty = false; S.done = ''; S.err = '';
          if (!S.recipe.alerts) S.recipe.alerts = [];
          draw(); preview(0);
        };
        if (S.options) go(); else { const w = setInterval(() => { if (S.options || S.loadErr || !alive) { clearInterval(w); if (S.options) go(); } }, 100); }
        return true;
      },
      fresh() { S.id = null; S.title = ''; S.dirty = false; S.done = ''; S.err = ''; if (S.options) { S.recipe = blank(); draw(); preview(0); } },
      destroy() { alive = false; clearTimeout(timer); root.remove(); live.remove(); },
    };
  }

  SC.blocks = { mount };
})();
