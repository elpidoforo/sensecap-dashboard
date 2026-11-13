/*
  My watch: a student builds a rule from blocks (city, measurement, above or below, a number, for how long), tests it on the saved
  day and keeps it in this browser. While the page is open it checks the newest saved readings and says "would fire now".
    - The rule itself has NO free text: selects and one number field only.
    - An optional short title goes through the site's privacy check (POST /watch/api/title, which stores nothing) before it is kept.
    - Rules live in localStorage of this browser only (key sc.watch.v1). No account, nothing saved on the server.
    - It never sends a notification: it only shows on this page.
  Data: GET /layers/api/compare?city=&variable= (the per-source series of the saved day, and the list of measurements a city has).
  One rule reads one source: the first of official station, model, own sensor that has the measurement. The page names it.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/toolkit-b2.css');
  const MIN = 60000;
  const isEl = () => SC.lang === 'el';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const cityName = (c) => (CITY[c] || [c, c])[isEl() ? 1 : 0];
  const lab = (l) => (Array.isArray(l) ? l[isEl() ? 1 : 0] || l[0] : String(l || ''));
  const DUR = [0, 15, 30, 60, 120];
  const durName = (m) => (m === 0 ? T('as soon as one reading shows it', 'μόλις το δείξει μία μέτρηση') : m < 60 ? T('for at least ' + m + ' minutes', 'για τουλάχιστον ' + m + ' λεπτά') : m === 60 ? T('for at least 1 hour', 'για τουλάχιστον 1 ώρα') : T('for at least ' + m / 60 + ' hours', 'για τουλάχιστον ' + m / 60 + ' ώρες'));
  const ENV = { indoor: ['indoors', 'μέσα σε τάξη'], vehicle: ['inside a vehicle', 'μέσα σε όχημα'], outdoor: ['outdoors', 'έξω'] };
  const KEY = 'sc.watch.v1', MAX_RULES = 12, TITLE_MAX = 40, FRESH = 30 * MIN;

  /* ---------- the rule on a series: pure ---------- */
  // points: [[time, value], ...] in time order. A stretch is a run of readings that all pass the test, with no gap longer than maxGap.
  // The rule fires once per stretch, at the first reading where the stretch is at least `mins` long.
  function evaluate(points, rule, every) {
    const need = rule.mins * MIN, maxGap = Math.max(3 * (every || 0), 15 * MIN), out = [];
    let start = null, lastT = null, fired = null;
    const close = () => { if (start != null && fired != null) out.push({ start, fired, end: lastT }); start = null; fired = null; };
    for (const [t, v] of points) {
      const hit = rule.op === 'below' ? v < rule.value : v > rule.value;
      if (hit && start != null && t - lastT > maxGap) close();
      if (hit) { if (start == null) start = t; lastT = t; if (fired == null && t - start >= need) fired = t; } else close();
    }
    const openNow = start != null && fired != null;
    close();
    const newest = points.length ? points[points.length - 1] : null;
    return { fires: out, now: openNow && newest != null && Date.now() - newest[0] <= FRESH, newest, stale: newest != null && Date.now() - newest[0] > FRESH };
  }
  // which source a rule reads: official station first, then a model, then our own sensors
  const ORDER = { official: 0, model: 1, own: 2 };
  function pick(r) {
    const list = ((r && r.series) || []).filter((s) => Array.isArray(s.points) && s.points.length);
    list.sort((a, b) => (ORDER[a.group] == null ? 3 : ORDER[a.group]) - (ORDER[b.group] == null ? 3 : ORDER[b.group]) || String(a.source).localeCompare(String(b.source)));
    return list[0] || null;
  }
  SC.watchCore = { evaluate, pick };

  /* ---------- the rules kept in this browser ---------- */
  const okRule = (r) => r && typeof r === 'object' && Object.hasOwn(CITY, r.city) && /^[a-z0-9_]{1,40}$/.test(String(r.variable)) && (r.op === 'above' || r.op === 'below') && typeof r.value === 'number' && isFinite(r.value) && DUR.includes(r.mins);
  const cleanRule = (r) => ({ id: String(r.id || '').replace(/[^a-z0-9]/gi, '').slice(0, 24) || String(Date.now()), city: r.city, variable: String(r.variable), op: r.op, value: r.value, mins: r.mins,
    title: typeof r.title === 'string' ? r.title.slice(0, TITLE_MAX) : '', unit: typeof r.unit === 'string' ? r.unit.slice(0, 12) : '', label: Array.isArray(r.label) ? [String(r.label[0] || '').slice(0, 60), String(r.label[1] || r.label[0] || '').slice(0, 60)] : [String(r.variable), String(r.variable)] });
  function readRules() { try { const j = JSON.parse(SC.store.get(KEY) || '[]'); return (Array.isArray(j) ? j : []).filter(okRule).slice(0, MAX_RULES).map(cleanRule); } catch (e) { return []; } }
  function writeRules(list) { const text = JSON.stringify(list); SC.store.set(KEY, text); return SC.store.get(KEY) === text; }   // false: this browser does not keep things (private mode)

  const sentence = (r) => T(lab(r.label) + ' in ' + cityName(r.city) + ' is ' + (r.op === 'above' ? 'above ' : 'below ') + num(r.value) + (r.unit ? ' ' + r.unit : '') + ', ' + durName(r.mins),
    lab(r.label) + ' · ' + cityName(r.city) + ': ' + (r.op === 'above' ? 'πάνω από ' : 'κάτω από ') + num(r.value) + (r.unit ? ' ' + r.unit : '') + ', ' + durName(r.mins));

  SC.register('watch', {
    title: ['My watch', 'Η παρακολούθησή μου'],
    render(root) {
      let dead = false, rules = readRules(), kept = true, tested = null, vars = [], timer = 0, seq = 0;
      const status = new Map();   // rule id -> { state, text }
      const fld = (id, label, control) => h('label', { class: 'wa-f', for: id }, h('span', null, label), control);
      const selCity = h('select', { class: 'nm-input', id: 'wa-city' }, Object.keys(CITY).map((c) => h('option', { value: c }, cityName(c))));
      const selVar = h('select', { class: 'nm-input', id: 'wa-var', disabled: true });
      const selOp = h('select', { class: 'nm-input', id: 'wa-op' }, h('option', { value: 'above' }, T('above', 'πάνω από')), h('option', { value: 'below' }, T('below', 'κάτω από')));
      const inVal = h('input', { class: 'nm-input', id: 'wa-val', type: 'number', step: 'any', inputmode: 'decimal', autocomplete: 'off' });
      const unitBox = h('span', { class: 'wa-unit' });
      const selDur = h('select', { class: 'nm-input', id: 'wa-dur' }, DUR.map((m) => h('option', { value: String(m) }, durName(m))));
      const inTitle = h('input', { class: 'nm-input', id: 'wa-title', type: 'text', maxlength: String(TITLE_MAX), autocomplete: 'off', 'aria-describedby': 'wa-title-h' });
      const bTest = h('button', { type: 'button', class: 'nm-btn', onclick: () => test() }, T('Test on the saved day', 'Δοκίμασε στην αποθηκευμένη μέρα'));
      const bSave = h('button', { type: 'button', class: 'nm-btn nm-btn--primary', disabled: true, onclick: () => save() }, T('Save in this browser', 'Αποθήκευσε σε αυτόν τον περιηγητή'));
      const result = h('div', { class: 'wa-res', role: 'status', 'aria-live': 'polite' }, h('p', { class: 't2-note' }, T('Test the rule first. Saving opens after a test, so you know what the rule does.', 'Δοκίμασε πρώτα τον κανόνα. Η αποθήκευση ανοίγει μετά από μια δοκιμή, για να ξέρεις τι κάνει ο κανόνας.')));
      const msg = h('p', { class: 'wa-msg', role: 'alert' });
      const mine = h('div', { class: 'wa-list' });
      const mineNote = h('p', { class: 't2-note' });

      const invalidate = () => { tested = null; bSave.disabled = true; };
      [selCity, selVar, selOp, selDur].forEach((e) => e.addEventListener('change', invalidate));
      inVal.addEventListener('input', invalidate);
      selCity.addEventListener('change', () => loadVars());
      selVar.addEventListener('change', () => paintUnit());
      const curVar = () => vars.find((v) => v.id === selVar.value) || null;
      function paintUnit() { const v = curVar(); unitBox.textContent = v ? v.unit || '' : ''; }

      function loadVars() {
        const my = ++seq, c = selCity.value;
        selVar.disabled = true; selVar.replaceChildren(h('option', { value: '' }, T('loading…', 'φόρτωση…')));
        SC.api('/layers/api/compare?city=' + c).then((r) => {
          if (dead || my !== seq) return;
          vars = (r.variables || []).filter((v) => /^[a-z0-9_]{1,40}$/.test(v.id));
          selVar.replaceChildren(...(vars.length ? vars.map((v) => h('option', { value: v.id }, lab(v.label) + (v.unit ? ' (' + v.unit + ')' : ''))) : [h('option', { value: '' }, T('nothing measured here right now', 'τίποτα δεν μετριέται εδώ τώρα'))]));
          selVar.disabled = !vars.length; bTest.disabled = !vars.length; paintUnit();
        }).catch(() => { if (dead || my !== seq) return; vars = []; selVar.replaceChildren(h('option', { value: '' }, T('could not be loaded', 'δεν φορτώθηκε'))); bTest.disabled = true; paintUnit();
          msg.textContent = T('The list of measurements could not be loaded. Pick the city again in a moment.', 'Η λίστα των μετρήσεων δεν φορτώθηκε. Διάλεξε ξανά την πόλη σε λίγο.'); });
      }

      function draft() {
        const v = curVar(), value = inVal.value.trim() === '' ? NaN : Number(inVal.value);
        if (!v) return { error: T('Pick a measurement first.', 'Διάλεξε πρώτα μια μέτρηση.') };
        if (!isFinite(value)) return { error: T('Write a number, for example 30.', 'Γράψε έναν αριθμό, για παράδειγμα 30.') };
        return { rule: { id: Date.now().toString(36), city: selCity.value, variable: v.id, op: selOp.value === 'below' ? 'below' : 'above', value, mins: DUR.includes(Number(selDur.value)) ? Number(selDur.value) : 0, title: '', unit: v.unit || '', label: Array.isArray(v.label) ? v.label : [v.id, v.id] } };
      }
      const srcLine = (s) => T('It reads one layer: ', 'Διαβάζει ένα στρώμα: ') + (isEl() ? s.nameEl || s.name : s.name) + ' (' + lab(s.kindWord || [s.kind, s.kind]) + ', ' + (ENV[s.env] || ENV.outdoor)[isEl() ? 1 : 0] + ').';

      function chart(points, rule, ev) {
        const W = 600, H = 120, P = 6, ts = points.map((p) => p[0]), vs = points.map((p) => p[1]).concat([rule.value]);
        const t0 = Math.min(...ts), t1 = Math.max(...ts), lo = Math.min(...vs), hi = Math.max(...vs), x = (t) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P), y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
        const g = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'wa-chart', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
        ev.fires.forEach((f) => g.append(sv('rect', { x: x(f.start).toFixed(1), y: 0, width: Math.max(2, x(f.end) - x(f.start)).toFixed(1), height: H, class: 'wa-on' })));
        g.append(sv('line', { x1: P, x2: W - P, y1: y(rule.value).toFixed(1), y2: y(rule.value).toFixed(1), class: 'wa-th' }));
        g.append(sv('polyline', { points: points.map((p) => x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1)).join(' '), class: 'wa-ln' }));
        return g;
      }

      function test() {
        msg.textContent = '';
        const d = draft();
        if (d.error) { msg.textContent = d.error; (curVar() ? inVal : selVar).focus(); return; }
        const rule = d.rule;
        bTest.disabled = true;
        result.replaceChildren(h('p', { class: 't2-note' }, T('Testing…', 'Δοκιμή…')));
        SC.api('/layers/api/compare?city=' + rule.city + '&variable=' + rule.variable).then((r) => {
          if (dead) return;
          bTest.disabled = false;
          const s = pick(r);
          if (!s || s.points.length < 2) { result.replaceChildren(h('p', { class: 't2-empty' }, T('Not enough has been saved for this measurement yet, so the rule cannot be tested. Try again later.', 'Δεν έχουν αποθηκευτεί αρκετά για αυτή τη μέτρηση ακόμη, άρα ο κανόνας δεν μπορεί να δοκιμαστεί. Δοκίμασε αργότερα.'))); return; }
          const ev = evaluate(s.points, rule, r.every), a = s.points[0][0], b = s.points[s.points.length - 1][0];
          tested = JSON.stringify([rule.city, rule.variable, rule.op, rule.value, rule.mins]);
          bSave.disabled = false;
          const vals = s.points.map((p) => p[1]);
          result.replaceChildren(...[
            h('p', { class: 'wa-say' }, h('b', null, ev.fires.length ? T('On the saved day this rule would have fired ' + ev.fires.length + (ev.fires.length === 1 ? ' time.' : ' times.'), 'Στην αποθηκευμένη μέρα αυτός ο κανόνας θα είχε ενεργοποιηθεί ' + ev.fires.length + (ev.fires.length === 1 ? ' φορά.' : ' φορές.')) : T('On the saved day this rule would not have fired.', 'Στην αποθηκευμένη μέρα αυτός ο κανόνας δεν θα είχε ενεργοποιηθεί.'))),
            ev.fires.length ? h('ul', { class: 'wa-fires' }, ev.fires.slice(0, 12).map((f) => h('li', null, T('At ' + SC.dateTime(f.fired) + ' (it had been ' + (rule.op === 'above' ? 'above' : 'below') + ' since ' + SC.time(f.start) + ' and stayed so until ' + SC.time(f.end) + ')', 'Στις ' + SC.dateTime(f.fired) + ' (ήταν ' + (rule.op === 'above' ? 'πάνω' : 'κάτω') + ' από τις ' + SC.time(f.start) + ' και έμεινε έτσι μέχρι τις ' + SC.time(f.end) + ')')))) : null,
            chart(s.points, rule, ev),
            h('p', { class: 't2-note' }, T('Line: the saved readings from ' + SC.dateTime(a) + ' to ' + SC.dateTime(b) + ' (' + s.points.length + ' readings, from ' + num(Math.min(...vals)) + ' to ' + num(Math.max(...vals)) + (rule.unit ? ' ' + rule.unit : '') + '). Dashed line: your number. Shaded: when the rule was on. ', 'Γραμμή: οι αποθηκευμένες μετρήσεις από ' + SC.dateTime(a) + ' έως ' + SC.dateTime(b) + ' (' + s.points.length + ' μετρήσεις, από ' + num(Math.min(...vals)) + ' έως ' + num(Math.max(...vals)) + (rule.unit ? ' ' + rule.unit : '') + '). Διακεκομμένη: ο αριθμός σου. Σκιασμένο: πότε ο κανόνας ήταν ενεργός. ') + srcLine(s)),
            ev.now ? h('p', { class: 'wa-now on' }, T('It would fire now.', 'Θα ενεργοποιούνταν τώρα.')) : null].filter(Boolean));
        }).catch((e) => { if (dead) return; bTest.disabled = false; result.replaceChildren(h('p', { class: 't2-empty' }, h('span', { class: 't2-err' }, e && e.status === 404 ? T('No layer has this measurement for the city right now, so the rule cannot be tested.', 'Κανένα στρώμα δεν έχει αυτή τη μέτρηση για την πόλη τώρα, άρα ο κανόνας δεν μπορεί να δοκιμαστεί.') : T('The saved day could not be loaded. Try again in a moment.', 'Η αποθηκευμένη μέρα δεν φορτώθηκε. Δοκίμασε ξανά σε λίγο.')))); });
      }

      async function save() {
        msg.textContent = '';
        const d = draft();
        if (d.error) { msg.textContent = d.error; return; }
        const rule = d.rule;
        if (tested !== JSON.stringify([rule.city, rule.variable, rule.op, rule.value, rule.mins])) { invalidate(); msg.textContent = T('The rule changed. Test it again before saving.', 'Ο κανόνας άλλαξε. Δοκίμασέ τον ξανά πριν την αποθήκευση.'); return; }
        if (rules.length >= MAX_RULES) { msg.textContent = T('You can keep up to ' + MAX_RULES + ' rules. Delete one first.', 'Μπορείς να κρατήσεις έως ' + MAX_RULES + ' κανόνες. Σβήσε πρώτα έναν.'); return; }
        const raw = inTitle.value.trim();
        let note = '';
        if (raw) {
          bSave.disabled = true;
          try { const r = await SC.api('/watch/api/title', { method: 'POST', body: { title: raw.slice(0, TITLE_MAX) } }); rule.title = String((r && r.title) || '').slice(0, TITLE_MAX); }
          catch (e) {
            if (dead) return;
            bSave.disabled = false;
            if (e && e.status === 422) { msg.textContent = T('Take out phone numbers, e-mail addresses, links and names from the title. Nothing was saved.', 'Βγάλε τηλέφωνα, email, συνδέσμους και ονόματα από τον τίτλο. Δεν αποθηκεύτηκε τίποτα.'); inTitle.focus(); return; }
            note = T(' The title could not be checked just now, so the rule was saved without it.', ' Ο τίτλος δεν μπόρεσε να ελεγχθεί τώρα, άρα ο κανόνας αποθηκεύτηκε χωρίς αυτόν.');
          }
          if (dead) return;
          bSave.disabled = false;
        }
        rules = rules.concat([cleanRule(rule)]);
        kept = writeRules(rules);
        inTitle.value = '';
        SC.toast(T('Rule saved in this browser.', 'Ο κανόνας αποθηκεύτηκε σε αυτόν τον περιηγητή.') + note);
        if (note) msg.textContent = note.trim();
        drawMine(); checkAll();
      }

      function drawMine() {
        mineNote.textContent = (rules.length ? T(rules.length + (rules.length === 1 ? ' rule' : ' rules') + ', kept only in this browser.', rules.length + (rules.length === 1 ? ' κανόνας' : ' κανόνες') + ', μόνο σε αυτόν τον περιηγητή.') : T('No rules yet. Build one above, test it, then save it.', 'Δεν υπάρχουν κανόνες ακόμη. Φτιάξε έναν πιο πάνω, δοκίμασέ τον και μετά αποθήκευσέ τον.'))
          + (kept ? '' : ' ' + T('This browser does not keep things (private window?), so the rules stay only until you close the page.', 'Αυτός ο περιηγητής δεν κρατά δεδομένα (ιδιωτικό παράθυρο;), άρα οι κανόνες μένουν μόνο μέχρι να κλείσεις τη σελίδα.'));
        mine.replaceChildren(...rules.map((r) => {
          const st = status.get(r.id) || { state: 'wait', text: T('checking…', 'έλεγχος…') };
          return h('article', { class: 'wa-c ' + st.state, dataset: { id: r.id } },
            h('div', { class: 'wa-ct' }, r.title ? h('b', null, r.title) : null, h('span', null, sentence(r) + '.'), h('small', { class: 'wa-st' }, h('i', { 'aria-hidden': 'true' }), st.text)),
            h('button', { type: 'button', class: 'wa-del', 'aria-label': T('Delete the rule: ', 'Σβήσε τον κανόνα: ') + (r.title || sentence(r)), onclick: () => { rules = rules.filter((x) => x.id !== r.id); status.delete(r.id); kept = writeRules(rules); drawMine(); } }, SC.icon('close', 18)));
        }));
      }

      function checkAll() {
        if (dead || !rules.length) return;
        const groups = new Map();
        rules.forEach((r) => { const k = r.city + '|' + r.variable; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
        groups.forEach((list, k) => {
          const [c, v] = k.split('|');
          SC.api('/layers/api/compare?city=' + c + '&variable=' + v).then((r) => {
            if (dead) return;
            const s = pick(r);
            list.forEach((rule) => {
              if (!s) { status.set(rule.id, { state: 'none', text: T('No saved readings for this right now.', 'Δεν υπάρχουν αποθηκευμένες μετρήσεις για αυτό τώρα.') }); return; }
              const ev = evaluate(s.points, rule, r.every), n = ev.newest, src = isEl() ? s.nameEl || s.name : s.name;
              const tail = T('Newest reading: ' + num(n[1]) + (rule.unit ? ' ' + rule.unit : '') + ' at ' + SC.dateTime(n[0]) + ', from ' + src + '.', 'Νεότερη μέτρηση: ' + num(n[1]) + (rule.unit ? ' ' + rule.unit : '') + ' στις ' + SC.dateTime(n[0]) + ', από: ' + src + '.');
              status.set(rule.id, ev.now ? { state: 'on', text: T('Would fire now. ', 'Θα ενεργοποιούνταν τώρα. ') + tail }
                : ev.stale ? { state: 'none', text: T('The newest reading is old, so the rule is not checked. ', 'Η νεότερη μέτρηση είναι παλιά, άρα ο κανόνας δεν ελέγχεται. ') + tail }
                  : { state: 'off', text: T('Quiet now. ', 'Ήσυχα τώρα. ') + tail });
            });
            drawMine();
          }).catch((e) => { if (dead) return; list.forEach((rule) => status.set(rule.id, { state: 'none', text: e && e.status === 404 ? T('No layer has this measurement for the city right now.', 'Κανένα στρώμα δεν έχει αυτή τη μέτρηση για την πόλη τώρα.') : T('Could not be checked just now. It is tried again in a minute.', 'Δεν μπόρεσε να ελεγχθεί τώρα. Γίνεται νέα προσπάθεια σε ένα λεπτό.') })); drawMine(); });
        });
      }

      root.append(SC.head({ title: T('My watch', 'Η παρακολούθησή μου'),
        lede: T('Build your own rule from blocks, test it on the saved day, and see on this page when it would fire. Kept in this browser only.', 'Φτιάξε τον δικό σου κανόνα από κομμάτια, δοκίμασέ τον στην αποθηκευμένη μέρα και δες σε αυτή τη σελίδα πότε θα ενεργοποιούνταν. Μένει μόνο σε αυτόν τον περιηγητή.'),
        help: ['Choose a city, a measurement, above or below, a number, and for how long. Press Test: the page runs your rule over the readings saved in the last day and lists when it would have fired. Then you can save it. Saved rules are checked against the newest saved reading every minute while this page is open. Nothing is sent to anyone.',
          'Διάλεξε πόλη, μέτρηση, πάνω ή κάτω, έναν αριθμό και για πόσο. Πάτα Δοκιμή: η σελίδα τρέχει τον κανόνα σου πάνω στις μετρήσεις της τελευταίας μέρας και γράφει πότε θα είχε ενεργοποιηθεί. Μετά μπορείς να τον αποθηκεύσεις. Οι αποθηκευμένοι κανόνες ελέγχονται με τη νεότερη αποθηκευμένη μέτρηση κάθε λεπτό όσο η σελίδα είναι ανοιχτή. Τίποτα δεν στέλνεται σε κανέναν.'] }),
        h('div', { class: 't2' },
          h('div', { class: 't2-body' },
            h('div', { class: 't2-main' },
              h('section', { class: 't2-panel', 'aria-labelledby': 'wa-h1' },
                h('div', { class: 't2-head' }, h('b', { id: 'wa-h1' }, T('Build a rule', 'Φτιάξε έναν κανόνα'))),
                h('div', { class: 'wa-form' },
                  fld('wa-city', T('In the city', 'Στην πόλη'), selCity),
                  fld('wa-var', T('when this measurement', 'όταν αυτή η μέτρηση'), selVar),
                  fld('wa-op', T('is', 'είναι'), selOp),
                  h('label', { class: 'wa-f', for: 'wa-val' }, h('span', null, T('this number', 'αυτόν τον αριθμό')), h('span', { class: 'wa-num' }, inVal, unitBox)),
                  h('label', { class: 'wa-f wa-wide', for: 'wa-dur' }, h('span', null, T('for how long', 'για πόσο')), selDur)),
                h('label', { class: 'wa-f wa-tf', for: 'wa-title' }, h('span', null, T('A short title (optional)', 'Ένας σύντομος τίτλος (προαιρετικά)')), inTitle),
                h('p', { class: 't2-note', id: 'wa-title-h' }, T('Up to ' + TITLE_MAX + ' letters. No names, phone numbers, e-mails or links: the title is checked before it is kept.', 'Έως ' + TITLE_MAX + ' γράμματα. Χωρίς ονόματα, τηλέφωνα, email ή συνδέσμους: ο τίτλος ελέγχεται πριν κρατηθεί.')),
                h('div', { class: 'wa-btns' }, bTest, bSave), msg, result),
              h('section', { class: 't2-panel', 'aria-labelledby': 'wa-h2' },
                h('div', { class: 't2-head' }, h('b', { id: 'wa-h2' }, T('My rules', 'Οι κανόνες μου'))), mineNote, mine)),
            h('aside', { class: 't2-panel t2-side' },
              h('b', null, T('Where your rules live', 'Πού μένουν οι κανόνες σου')),
              h('p', { class: 't2-note' }, T('Only in this browser, on this device. There is no account and nothing is saved on the server. Another phone or computer will not have them, and clearing the browser data deletes them.', 'Μόνο σε αυτόν τον περιηγητή, σε αυτή τη συσκευή. Δεν υπάρχει λογαριασμός και τίποτα δεν αποθηκεύεται στον διακομιστή. Ένα άλλο κινητό ή υπολογιστής δεν θα τους έχει, και αν σβήσεις τα δεδομένα του περιηγητή σβήνονται.')),
              h('b', null, T('No notifications', 'Χωρίς ειδοποιήσεις')),
              h('p', { class: 't2-warn' }, T('This page never sends a notification, a message or a sound. A rule only shows "would fire now" here, while the page is open.', 'Αυτή η σελίδα δεν στέλνει ποτέ ειδοποίηση, μήνυμα ή ήχο. Ένας κανόνας δείχνει «θα ενεργοποιούνταν τώρα» μόνο εδώ, όσο η σελίδα είναι ανοιχτή.')),
              h('b', null, T('How a rule is tested', 'Πώς δοκιμάζεται ένας κανόνας')),
              h('p', { class: 't2-note' }, T('On the readings saved in about the last day, from one layer that the page names. The rule fires once each time the number stays past your limit for as long as you chose. A gap of more than 15 minutes without readings ends a stretch. A rule that fired yesterday is not a forecast for today.', 'Στις μετρήσεις που αποθηκεύτηκαν περίπου την τελευταία μέρα, από ένα στρώμα που γράφει η σελίδα. Ο κανόνας ενεργοποιείται μία φορά κάθε φορά που ο αριθμός μένει πέρα από το όριό σου για όσο διάλεξες. Ένα κενό πάνω από 15 λεπτά χωρίς μετρήσεις τελειώνει ένα διάστημα. Ένας κανόνας που ενεργοποιήθηκε χθες δεν είναι πρόβλεψη για σήμερα.')),
              h('b', null, T('What it cannot do', 'Τι δεν μπορεί να κάνει')),
              h('p', { class: 't2-note' }, T('It cannot watch while the page is closed, and it is not a safety alarm. For official warnings, read the Met Office warnings page.', 'Δεν μπορεί να παρακολουθεί όταν η σελίδα είναι κλειστή, και δεν είναι συναγερμός ασφαλείας. Για επίσημες προειδοποιήσεις, διάβασε τη σελίδα προειδοποιήσεων της Μετεωρολογικής.'))))));
      loadVars(); drawMine(); checkAll();
      timer = setInterval(() => { if (!document.hidden) checkAll(); }, 60000);
      return () => { dead = true; clearInterval(timer); };
    },
  });
})();
