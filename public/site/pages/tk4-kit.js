/*
  Shared helper of the classroom tools (claims, notebook, experiment, lessons, methods). Not a page: it is loaded by those pages
  and puts a few functions on window.TK4.

  Student text. The only free text in these tools is an optional short note. It is never sent anywhere: the check below runs in
  this browser. It is a copy of the site's privacy check for student text (unsafeText in school.js, and the cleaning that
  planText in studio.js does before a plan is saved), plus two stricter rules of its own (a sentence that gives a name, and
  a pair of map coordinates). tests/toolkit/batch4_test.js compares this copy with the real server function on a list of
  samples, so that the two cannot drift apart unnoticed. The text is only ever put into the page as a text node.
*/
(function () {
  'use strict';
  const SC = window.SC, t = SC.t, el = SC.el;
  const isEl = () => SC.lang === 'el';

  /* ---------- the privacy check (mirror of school.js unsafeText) ---------- */
  const PHONE_RE = /(?:(?:\+|\b00)\d{2,3}[\s-]?\d{6,10}|\b\d{8,}\b|\b\d{2}[\s-]\d{6}\b|\b\d{3}[\s-]\d{3}[\s-]\d{3,4}\b)/;
  const NAME_RE = /(\bmy name\b|\bi am called\b|\bi'm called\b|\bcalled me\b|με λένε|με λενε|ονομάζομαι|ονομαζομαι|το όνομά μου|το ονομα μου|το όνομα μου)/i;
  const COORD_RE = /-?\d{1,3}[.,]\d{3,}\s*[,;\s]\s*-?\d{1,3}[.,]\d{3,}/;
  function unsafeCode(body) {
    body = String(body == null ? '' : body);
    if (/https?:\/\/|www\./i.test(body)) return 'link';
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(body)) return 'email';
    if (/\b[\w-]{2,}\.(com|org|net|io|cy|gr|uk|me|ly|gg|tv|app|xyz)\b/i.test(body)) return 'link';
    if (PHONE_RE.test(body.replace(/\d+[.,]\d+/g, 'N'))) return 'phone';
    if (/(^|\s)@\w{3,}/.test(body)) return 'handle';
    if (body.indexOf('@') >= 0) return 'handle';   // stricter than the server: no @ at all
    if (NAME_RE.test(body)) return 'name';         // stricter than the server
    if (COORD_RE.test(body)) return 'place';       // stricter than the server: a pair of map coordinates
    return null;
  }
  const WHY = {
    link: ['Links are not allowed here.', 'Οι σύνδεσμοι δεν επιτρέπονται εδώ.'],
    email: ['E-mail addresses are not allowed here.', 'Οι διευθύνσεις email δεν επιτρέπονται εδώ.'],
    phone: ['Phone numbers and long numbers are not allowed here.', 'Τα τηλέφωνα και οι μεγάλοι αριθμοί δεν επιτρέπονται εδώ.'],
    handle: ['Social media names and the @ sign are not allowed here.', 'Τα ονόματα σε κοινωνικά δίκτυα και το σύμβολο @ δεν επιτρέπονται εδώ.'],
    name: ['Do not write your name or anybody’s name.', 'Μη γράφεις το όνομά σου ή το όνομα κάποιου άλλου.'],
    place: ['Do not write an exact place. The city is enough.', 'Μη γράφεις ακριβές σημείο. Η πόλη αρκεί.'],
  };
  const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
  // the same cleaning the server does before it saves a plan: no tags, no control or invisible characters, single spaces
  function cleanText(v) {
    return String(v == null ? '' : v).normalize('NFC').replace(CTRL_RE, '').replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  }
  /** { ok, text, code, why }: text is the cleaned text when ok, else ''. An empty note is ok. */
  function checkText(v, max) {
    const text = cleanText(v), n = [...text].length;
    if (!text) return { ok: true, text: '', code: null, why: '' };
    if (n > (max || 140)) return { ok: false, text: '', code: 'long', why: t('The note is too long (' + n + ' of ' + (max || 140) + ' characters).', 'Η σημείωση είναι πολύ μεγάλη (' + n + ' από ' + (max || 140) + ' χαρακτήρες).') };
    const code = unsafeCode(text);
    if (code) return { ok: false, text: '', code, why: t(WHY[code][0], WHY[code][1]) + ' ' + t('This keeps everyone safe.', 'Έτσι μένουμε όλοι ασφαλείς.') };
    return { ok: true, text, code: null, why: '' };
  }

  /* An optional note field with the check under it. onChange(result) runs on every key. */
  let seq = 0;
  function noteField(o) {
    const id = 'k4-note-' + (++seq), max = o.max || 140;
    const input = el('textarea', { class: 'nm-input k4-note-in', id, rows: 2, maxlength: max + 60, 'aria-describedby': id + '-m', placeholder: o.placeholder || '' });
    input.value = o.value || '';
    const msg = el('p', { class: 'k4-note-m', id: id + '-m', 'aria-live': 'polite' });
    const count = el('span', { class: 'k4-note-n', 'aria-hidden': 'true' });
    const state = () => checkText(input.value, max);
    const paint = () => {
      const r = state(), n = [...cleanText(input.value)].length;
      count.textContent = n + ' / ' + max;
      msg.textContent = r.ok ? (o.hint || t('Optional. No names, no links, no phone numbers, no exact places.', 'Προαιρετικό. Χωρίς ονόματα, συνδέσμους, τηλέφωνα ή ακριβή σημεία.')) : r.why;
      msg.classList.toggle('bad', !r.ok); input.classList.toggle('bad', !r.ok);
      input.setAttribute('aria-invalid', r.ok ? 'false' : 'true');
      if (o.onChange) o.onChange(r);
    };
    input.addEventListener('input', paint);
    const node = el('div', { class: 'k4-note' }, el('label', { for: id }, o.label || t('A short note (optional)', 'Μια σύντομη σημείωση (προαιρετικά)')), input, el('div', { class: 'k4-note-b' }, msg, count));
    paint();
    return { node, input, state, set(v) { input.value = v || ''; paint(); } };
  }

  /* ---------- words ---------- */
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const CITY_IDS = Object.keys(CITY);
  const cityName = (c) => (CITY[c] || [c, c])[isEl() ? 1 : 0];
  const VARS = {
    temperature: ['Air temperature', 'Θερμοκρασία αέρα', '°C'], relative_humidity: ['Relative humidity', 'Σχετική υγρασία', '%'], wind_speed: ['Wind speed', 'Ταχύτητα ανέμου', 'm/s'],
    co2: ['Carbon dioxide (CO₂)', 'Διοξείδιο του άνθρακα (CO₂)', 'ppm'], pressure: ['Air pressure', 'Ατμοσφαιρική πίεση', 'hPa'], dust: ['Dust (model)', 'Σκόνη (μοντέλο)', 'µg/m³'],
    ozone: ['Ozone', 'Όζον', 'µg/m³'], pm10: ['PM10 particles', 'Σωματίδια PM10', 'µg/m³'], pm25: ['PM2.5 particles', 'Σωματίδια PM2.5', 'µg/m³'],
  };
  const varName = (v, label) => (label && label[isEl() ? 1 : 0]) || (VARS[v] ? VARS[v][isEl() ? 1 : 0] : v);
  const varUnit = (v) => (VARS[v] ? VARS[v][2] : '');
  const KIND = {
    'reference-station': ['official station', 'επίσημος σταθμός'], 'calibrated-network': ['calibrated network', 'βαθμονομημένο δίκτυο'], 'low-cost-sensor': ['low-cost sensor', 'αισθητήρας χαμηλού κόστους'],
    'crowd-sourced': ['volunteer sensor', 'αισθητήρας εθελοντή'], model: ['model estimate', 'εκτίμηση μοντέλου'], reanalysis: ['model estimate', 'εκτίμηση μοντέλου'], satellite: ['satellite', 'δορυφόρος'],
  };
  const KINDS = {
    'reference-station': ['Official stations', 'Επίσημοι σταθμοί'], 'calibrated-network': ['Calibrated network', 'Βαθμονομημένο δίκτυο'], 'low-cost-sensor': ['Low-cost sensors', 'Αισθητήρες χαμηλού κόστους'],
    'crowd-sourced': ['Volunteer sensors', 'Αισθητήρες εθελοντών'], model: ['Model estimates', 'Εκτιμήσεις μοντέλου'], reanalysis: ['Model estimates', 'Εκτιμήσεις μοντέλου'], satellite: ['Satellite', 'Δορυφόρος'],
  };
  const ENV = { outdoor: ['outdoors', 'έξω'], vehicle: ['inside vehicles', 'μέσα σε οχήματα'], indoor: ['indoors', 'μέσα σε κτίριο'] };
  const kindWord = (k) => (KIND[k] || [k || '', k || ''])[isEl() ? 1 : 0];
  const envWord = (e) => (ENV[e] || [e || '', e || ''])[isEl() ? 1 : 0];
  const groupName = (kind, env) => (KINDS[kind] || [kind, kind])[isEl() ? 1 : 0] + ', ' + envWord(env);
  const num = (v, d) => {
    if (v == null || !isFinite(v)) return '–';
    const p = d != null ? d : Math.abs(v) >= 100 ? 0 : 1;
    return String(Math.round(v * 10 ** p) / 10 ** p).replace('-', '−').replace('.', isEl() ? ',' : '.');
  };
  const val = (v, unit) => num(v) + (unit ? ' ' + unit : '');

  /* ---------- links to other tools: only when the page exists ---------- */
  const TOOL = {
    layers: ['Data layers', 'Στρώματα δεδομένων'], claims: ['Claim check', 'Έλεγχος ισχυρισμού'], notebook: ['Field notebook', 'Τετράδιο πεδίου'], experiment: ['Experiment builder', 'Σχεδίασε ένα πείραμα'],
    lessons: ['Lesson packs', 'Πακέτα μαθημάτων'], methods: ['Methods library', 'Βιβλιοθήκη μεθόδων'], beforeafter: ['Before and after', 'Πριν και μετά'], districts: ['Districts and neighbourhoods', 'Επαρχίες και γειτονιές'],
    weather: ['Met Office record', 'Μετεωρολογικό αρχείο'], explore: ['Explore data', 'Εξερεύνηση'], guides: ['Sensor guides', 'Οδηγοί αισθητήρων'], board: ['City board', 'Πίνακας πόλης'], start: ['Start a project', 'Νέο έργο'],
    whatif: ['What-if', 'Σενάρια'], map: ['Live map', 'Ζωντανός χάρτης'], library: ['Library', 'Βιβλιοθήκη'],
  };
  const routable = (id) => Boolean(SC.ready && SC.ready.has(id));
  const toolName = (id) => (TOOL[id] ? t(TOOL[id][0], TOOL[id][1]) : id);
  /** an <a> to #/<id><rest> or null when that page does not exist on this site */
  function toolLink(id, rest, label, cls) {
    if (!routable(id)) return null;
    return el('a', { class: cls || 'k4-go', href: '#/' + id + (rest || '') }, (label || t('Open: ', 'Άνοιξε: ') + toolName(id)), el('span', { 'aria-hidden': 'true' }, ' →'));
  }

  /* ---------- small pieces ---------- */
  // a row of choices: one is on. opts: [[value, label]]. Works as a radio group with the keyboard.
  function choice(o) {
    const box = el('div', { class: 'k4-choice' + (o.cls ? ' ' + o.cls : ''), role: 'radiogroup', 'aria-label': o.label });
    let cur = o.value;
    const paint = () => [...box.children].forEach((b) => { const on = b.dataset.v === String(cur); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on || (cur == null && b === box.firstChild) ? 0 : -1; });
    o.opts.forEach(([v, label]) => box.append(el('button', { type: 'button', role: 'radio', 'data-v': String(v), onclick: () => { cur = v; paint(); o.onPick(v); } }, label)));
    box.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const kids = [...box.children], i = Math.max(0, kids.indexOf(document.activeElement));
      const nx = kids[(i + d + kids.length) % kids.length]; nx.focus(); nx.click();
    });
    paint();
    return { node: box, set(v) { cur = v; paint(); }, get: () => cur };
  }
  function select(o) {
    const s = el('select', { class: 'nm-input k4-sel', 'aria-label': o.label, id: o.id || null });
    o.opts.forEach(([v, label]) => s.append(el('option', { value: v }, label)));
    if (o.value != null) s.value = o.value;
    s.addEventListener('change', () => o.onPick(s.value));
    return s;
  }
  const printBtn = (label) => el('button', { class: 'nm-btn k4-noprint', type: 'button', onclick: () => window.print() }, label || t('Print this page', 'Εκτύπωσε τη σελίδα'));
  // while one of these pages is open the body carries k4-on, so the print rules in tk4.css hide the menu and the bars
  const printMode = (on) => document.body.classList.toggle('k4-on', !!on);
  const demoTag = (head) => SC.cached('/api/config', 300000).then((c) => {
    if (!c || !c.demo || !head.isConnected) return;
    const ph = head.querySelector('.page-head');
    if (ph && !ph.querySelector('.t.demo')) ph.insertBefore(el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης')), ph.querySelector('.lede'));
  }).catch(() => {});
  const errBox = (msg, again) => el('div', { class: 'k4-err' }, el('div', { class: 'err', role: 'alert' }, msg), again ? el('button', { class: 'nm-btn', type: 'button', onclick: again }, t('Try again', 'Δοκίμασε ξανά')) : null);

  window.TK4 = { unsafeCode, cleanText, checkText, noteField, CITY_IDS, cityName, VARS, varName, varUnit, kindWord, envWord, groupName, num, val, routable, toolName, toolLink, choice, select, printBtn, printMode, demoTag, errBox };
})();
