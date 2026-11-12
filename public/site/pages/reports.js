/*
  Reports: the weekly school report and the one-page print summary, both made for paper (A4, no menu).
    #/reports                 released weekly reports, newest week first (teachers also see drafts and withdrawn ones of their school)
    #/reports/<id>            one report as a printable sheet: the summary, the numbers, the Met Office warnings seen, the island picture
    #/reports?tab=summary     the print summary (port of the "5 Present" page of the old Cities site): live school averages, route squares, privacy note
  Sources: /council/api/reports  (reports.js on the server)
             GET /council/api/reports[?scope=all]           released reports; ?scope=all is for a signed-in teacher (also drafts and withdrawn)
             GET /council/api/reports/<id>                  one report (released, or any of their own for a teacher)
             POST /council/api/reports/generate { school: slug | 'all', weekEnding: 'YYYY-MM-DD' }   teacher or admin, makes a draft
             POST /council/api/reports/<id>/release { dropSummary? } | /withdraw                        teacher or admin
           A report is { id, school, schoolName, weekEnding, status, demo, days[7], overall, schools[{ slug, sensors, onlineNow, reportingShare,
           measurements[{ mid, name, unit, avg, min, max, sensors, readings, daily[7] }] }], warnings{ available, versions, items[{ at, text }],
           startOfWeek, current, note }, notes[], summary{ en, el, ai, note } | null, generatedAt, releasedAt }.
           The server sends no route squares in a weekly report, so the island picture colours the districts by each school's average temperature.
           /cities/api/overview, /api/config   the live print summary
           /app/api/schools/public             the school list (slugs) for the Generate form
  Printing: body gets the class rp-on while this page is open; in reports.css @media print hides the menu and every control and prints the sheet on A4.
  Privacy: no vehicle position anywhere. Route squares (print summary only) are the delayed (2 h), grouped (1 km) cells. No student names.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/reports.css');

  const fin = (v) => typeof v === 'number' && isFinite(v);
  const dateOf = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v); return isFinite(n) && n > 0 ? n : null; };
  const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nn = (v) => { const x = typeof v === 'string' && v !== '' ? Number(v) : v; return fin(x) ? x : null; };
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const loc = () => (SC.lang === 'el' ? 'el-GR' : 'en-GB');

  // district id (as in island.js), colour, school names and district names in both languages, and a pattern that finds the district in a school id or name
  const DIST = [
    { id: 'nicosia', col: '#E07F3F', n: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], d: ['Lefkosia', 'Λευκωσία'], re: /lefkos|nicosia|λευκωσ/ },
    { id: 'larnaca', col: '#2F6FD0', n: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], d: ['Larnaka', 'Λάρνακα'], re: /larnak|larnac|λαρνακ/ },
    { id: 'limassol', col: '#2E9E63', n: ['PASCAL Limassol', 'PASCAL Λεμεσός'], d: ['Lemesos', 'Λεμεσός'], re: /limass|lemes|λεμεσ/ },
    { id: 'paphos', col: '#7A5FE0', n: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], d: ['Pafos', 'Πάφος'], re: /paph|pafos|παφ/ },
  ];
  const distOf = (...txt) => { const f = fold(txt.filter(Boolean).join(' ')); return DIST.find((d) => d.re.test(f)) || null; };
  const RAMP = [[76, 203, 234], [247, 196, 107], [232, 105, 63]];
  const ramp = (t) => { t = Math.max(0, Math.min(1, t)); const a = t < 0.5 ? RAMP[0] : RAMP[1], b = t < 0.5 ? RAMP[1] : RAMP[2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2; return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')'; };
  const num = (v, d) => (fin(v) ? SC.num(v, d) : '–');
  const pct = (v) => (fin(v) ? Math.round(v * 100) + ' %' : '–');
  const MIDN = { 4097: ['Temperature', 'Θερμοκρασία'], 4098: ['Humidity', 'Υγρασία'], 4099: ['Light', 'Φως'], 4100: ['CO2', 'CO2'], 4101: ['Air pressure', 'Πίεση αέρα'] };
  const mname = (m) => (MIDN[m.mid] ? T(MIDN[m.mid][0], MIDN[m.mid][1]) : m.name || '#' + m.mid);
  const decOf = (m) => (m.mid === '4100' || /ppm|lux|pa$/i.test(m.unit || '') ? 0 : 1);

  /* ---------- dates ---------- */
  const fmt = (o) => new Intl.DateTimeFormat(loc(), Object.assign({ timeZone: 'UTC' }, o));
  const dayMs = (s) => { const m = ymd.test(String(s || '')) ? String(s).split('-').map(Number) : null; return m ? Date.UTC(m[0], m[1] - 1, m[2], 12) : null; };
  const fmtLong = (s) => { const t = dayMs(s); return t ? fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(t) : String(s || ''); };
  const fmtShort = (s) => { const t = dayMs(s); return t ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(t) : String(s || ''); };
  const fmtDay = (s) => { const t = dayMs(s); return t ? fmt({ weekday: 'short', day: 'numeric' }).format(t) : String(s || ''); };
  const weekStart = (s) => { const t = dayMs(s); return t ? fmtShort(new Date(t - 6 * 86400000).toISOString().slice(0, 10)) : ''; };
  const addDays = (s, n) => new Date(dayMs(s) + n * 86400000).toISOString().slice(0, 10);
  const todayStr = () => new Date().toISOString().slice(0, 10);
  function lastSunday() { const d = new Date(todayStr() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); }

  /* ---------- reading what the server sends ---------- */
  const langText = (o) => (o && typeof o === 'object' ? (SC.lang === 'el' ? o.el || o.en : o.en || o.el) || '' : String(o || ''));
  function normSummary(s) {
    if (!s) return null;
    if (typeof s === 'string') return { en: s, el: '', ai: false, note: null };
    return { en: String(s.en || ''), el: String(s.el || ''), ai: Boolean(s.ai), note: Array.isArray(s.note) ? s.note : s.note ? [String(s.note), String(s.note)] : null };
  }
  function normSchool(s) {
    if (!s || typeof s !== 'object') return null;
    return { slug: String(s.slug || ''), name: String(s.short || s.name || s.slug || ''), d: distOf(s.slug, s.name, s.short), sensors: nn(s.sensors), onlineNow: nn(s.onlineNow), reportingShare: nn(s.reportingShare),
      measurements: (Array.isArray(s.measurements) ? s.measurements : []).map((m) => ({ mid: String(m.mid), name: String(m.name || ''), unit: String(m.unit || ''), avg: nn(m.avg), min: nn(m.min), max: nn(m.max), sensors: nn(m.sensors), readings: nn(m.readings), daily: Array.isArray(m.daily) ? m.daily.map(nn) : [] })) };
  }
  function normReport(r) {
    if (!r || typeof r !== 'object') return null;
    const w = r.warnings && typeof r.warnings === 'object' ? r.warnings : null;
    return {
      id: r.id == null ? '' : String(r.id), school: String(r.school || 'all'), schoolName: String(r.schoolName || ''), weekEnding: String(r.weekEnding || ''), status: String(r.status || 'released').toLowerCase(), demo: Boolean(r.demo),
      days: Array.isArray(r.days) ? r.days.map(String) : [], overall: r.overall && typeof r.overall === 'object' ? r.overall : null, schools: (Array.isArray(r.schools) ? r.schools : []).map(normSchool).filter(Boolean),
      warnings: w, notes: (Array.isArray(r.notes) ? r.notes : []).map(String), summary: normSummary(r.summary), generatedAt: dateOf(r.generatedAt), releasedAt: dateOf(r.releasedAt), full: Array.isArray(r.schools),
    };
  }
  const nameOfReport = (r) => { if (r.school === 'all') return T('All four schools', 'Και τα τέσσερα σχολεία'); const d = distOf(r.school, r.schoolName); return d ? T(d.n[0], d.n[1]) : r.schoolName || r.school; };
  const summaryText = (r) => (r.summary ? (SC.lang === 'el' ? r.summary.el || r.summary.en : r.summary.en || r.summary.el) : '');

  /* ---------- the island picture (paper colours) ---------- */
  // o: { cells:[{ la, ln, n, d }] route squares, rows:[{ d, temp }] to tint districts, dots:[{ d, lat, lng }] schools, label }
  function islandPicture(o) {
    if (typeof ISLAND === 'undefined') return el('div');
    const svg = sv('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, class: 'rp-isl', role: 'img', 'aria-label': o.label });
    const rows = o.rows || [], temps = rows.filter((r) => r.d && fin(r.temp)).map((r) => r.temp), lo = temps.length ? Math.min(...temps) : 0, hi = temps.length ? Math.max(...temps) : 1;
    Object.keys(ISLAND.districts).forEach((id) => {
      const d = DIST.find((x) => x.id === id), row = rows.find((r) => r.d && r.d.id === id);
      let fill = '#EEF3F8';
      if (row && fin(row.temp)) fill = temps.length > 1 ? ramp(hi > lo ? (row.temp - lo) / (hi - lo) : 0.5) : '#CFE3F5';
      svg.append(sv('path', { d: ISLAND.districts[id], fill, stroke: d ? '#5E7C9B' : '#B7C6D6', 'stroke-width': d ? 0.5 : 0.3, 'stroke-linejoin': 'round' }));
    });
    const cells = o.cells || [], maxN = cells.reduce((m, c) => Math.max(m, c.n), 1);
    const g = 0.01, w = g * ISLAND.k * ISLAND.sx * 3, h = g * ISLAND.sx * 3;
    cells.forEach((c) => { const p = ISLAND.project(c.ln, c.la); svg.append(sv('rect', { x: (p[0] - w / 2).toFixed(1), y: (p[1] - h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1), fill: c.d ? c.d.col : '#1B4A78', opacity: (0.45 + 0.55 * c.n / maxN).toFixed(2) })); });
    (o.dots || []).forEach((s) => {
      const p = ISLAND.project(s.lng, s.lat);
      svg.append(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 7, fill: s.d ? s.d.col : '#1B4A78', stroke: '#fff', 'stroke-width': 3 }), sv('text', { x: (p[0] + 14).toFixed(1), y: (p[1] + 6).toFixed(1), class: 'rp-isl-t' }, s.d ? T(s.d.d[0], s.d.d[1]) : ''));
    });
    return svg;
  }
  const islandDots = (list) => (typeof ISLAND === 'undefined' ? [] : ISLAND.schools.map((s) => ({ d: distOf(s.id, s.name), lat: s.lat, lng: s.lng })).filter((s) => s.d && list.some((x) => x.d && x.d.id === s.d.id)));

  /* ---------- the sheet ---------- */
  function logo() {
    const s = sv('svg', { viewBox: '0 0 38 38', class: 'rp-logo', 'aria-hidden': 'true' });
    s.innerHTML = '<rect x="1" y="1" width="36" height="36" rx="10" fill="#10223a"/><circle cx="19" cy="19" r="3" fill="#F2A56B"/><path d="M12.5 12.5a9.2 9.2 0 000 13M25.5 12.5a9.2 9.2 0 010 13M8.6 8.6a14.7 14.7 0 000 20.8M29.4 8.6a14.7 14.7 0 010 20.8" fill="none" stroke="#4CCBEA" stroke-width="1.8" stroke-linecap="round"/>';   // static string, no data
    return s;
  }
  function sheet({ title, sub, stamps, children, foot, qr }) {
    return el('article', { class: 'rp-sheet', 'aria-label': title },
      el('header', { class: 'rp-sh-head' }, logo(), el('div', { class: 'rp-sh-brand' }, el('b', null, 'SMART CITIES'), el('small', null, T('Cyprus · live from our schools', 'Κύπρος · ζωντανά από τα σχολεία μας'))),
        el('span', { class: 'rp-stamps' }, (stamps || []).map((s) => el('span', { class: 'rp-stamp' + (s.cls ? ' ' + s.cls : '') }, s.text)))),
      el('h2', { class: 'rp-sh-title' }, title), sub ? el('p', { class: 'rp-sh-sub' }, sub) : null,
      children,
      el('footer', { class: 'rp-sh-foot' }, qr || null, foot));   // qr: a small code that opens this sheet online (SC.qrFigure)
  }
  const PRIVACY = () => T('Privacy: this page shows school averages and delayed, grouped routes only. No live vehicle positions and no student names.', 'Ιδιωτικότητα: αυτή η σελίδα δείχνει μόνο μέσους όρους σχολείων και ομαδοποιημένες διαδρομές με καθυστέρηση. Καμία ζωντανή θέση οχήματος και κανένα όνομα μαθητή.');
  const SOURCES = () => T('Sources: school sensors (SenseCAP) on buses and cars; Cyprus Department of Meteorology (Met Office) for the warnings page. Weather Data Copyright The Cyprus Department of Meteorology.', 'Πηγές: αισθητήρες σχολείων (SenseCAP) σε λεωφορεία και αυτοκίνητα· Τμήμα Μετεωρολογίας Κύπρου (Μετεωρολογική Υπηρεσία) για τη σελίδα προειδοποιήσεων. Weather Data Copyright The Cyprus Department of Meteorology.');
  const schoolCell = (s) => el('th', { scope: 'row' }, s.d ? el('i', { class: 'rp-dot', style: { background: s.d.col } }) : null, s.d ? T(s.d.n[0], s.d.n[1]) : s.name);

  // the measurements that any school has, in the order the server sent them
  function mids(r) { const seen = [], out = []; r.schools.forEach((s) => s.measurements.forEach((m) => { if (!seen.includes(m.mid)) { seen.push(m.mid); out.push(m); } })); return out; }
  const measOf = (s, mid) => s.measurements.find((m) => m.mid === mid);

  function numbersTable(r) {
    const ms = mids(r), anyOnline = r.schools.some((s) => fin(s.onlineNow));
    const L = { s: anyOnline ? T('Sensors online now', 'Αισθητήρες σε λειτουργία τώρα') : T('Sensors', 'Αισθητήρες'), t: T('Time with readings', 'Χρόνος με μετρήσεις') };
    return el('div', { class: 'rp-tw' }, el('table', { class: 'rp-table rp-stack' },
      el('caption', { class: 'rp-cap' }, T('Weekly averages per school. In brackets: the lowest and the highest reading of the week.', 'Εβδομαδιαίοι μέσοι όροι ανά σχολείο. Σε παρένθεση: η χαμηλότερη και η υψηλότερη μέτρηση της εβδομάδας.')),
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, T('School', 'Σχολείο')), el('th', { scope: 'col' }, L.s), el('th', { scope: 'col' }, L.t), ms.map((m) => el('th', { scope: 'col' }, mname(m) + (m.unit ? ' ' + m.unit : ''))))),
      el('tbody', null, r.schools.map((s) => el('tr', null, schoolCell(s),
        el('td', { 'data-label': L.s }, fin(s.onlineNow) && fin(s.sensors) ? s.onlineNow + ' / ' + s.sensors : fin(s.sensors) ? String(s.sensors) : '–'), el('td', { 'data-label': L.t }, pct(s.reportingShare)),
        ms.map((m) => { const x = measOf(s, m.mid); return el('td', { 'data-label': mname(m) + (m.unit ? ' ' + m.unit : '') }, el('span', null, x ? num(x.avg, decOf(x)) : '–', x && fin(x.min) && fin(x.max) ? el('small', null, ' (' + SC.num(x.min, decOf(x)) + ' – ' + SC.num(x.max, decOf(x)) + ')') : null)); }))))));
  }
  function dailyTables(r) {
    const days = r.days.length === 7 ? r.days : [];
    if (!days.length) return null;
    return mids(r).map((m) => {
      const have = r.schools.filter((s) => measOf(s, m.mid) && measOf(s, m.mid).daily.some(fin));
      if (!have.length) return null;
      return el('div', { class: 'rp-tw rp-keep' }, el('table', { class: 'rp-table rp-daily' }, el('caption', { class: 'rp-cap' }, T('Day by day: ', 'Μέρα με τη μέρα: ') + mname(m) + (m.unit ? ' ' + m.unit : '') + T(' (daily average)', ' (ημερήσιος μέσος όρος)')),
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, T('School', 'Σχολείο')), days.map((d) => el('th', { scope: 'col' }, fmtDay(d))))),
        el('tbody', null, have.map((s) => { const x = measOf(s, m.mid); return el('tr', null, schoolCell(s), days.map((d, i) => el('td', null, num(x.daily[i], decOf(x))))); }))));
    }).filter(Boolean);
  }
  function headline(r) {
    const o = r.overall; if (!o) return null;
    const tile = (k, v) => el('div', { class: 'rp-tile' }, el('b', null, v), el('span', null, k));
    return el('div', { class: 'rp-tiles' }, tile(T('Sensors in this report', 'Αισθητήρες σε αυτή την αναφορά'), fin(o.sensors) ? String(o.sensors) : '–'),
      tile(T('Time with readings', 'Χρόνος με μετρήσεις'), pct(o.reportingShare)),
      fin(o.onlineNow) ? tile(T('Online now', 'Σε λειτουργία τώρα'), o.onlineNow + ' / ' + o.sensors) : null);
  }
  function warningsBlock(r) {
    const w = r.warnings;
    if (!w) return el('p', { class: 'rp-none' }, T('This report does not include the Met Office warnings.', 'Αυτή η αναφορά δεν περιλαμβάνει τις προειδοποιήσεις της Μετεωρολογικής Υπηρεσίας.'));
    const quote = (label, at, text) => el('li', null, el('div', { class: 'rp-wl' }, label, at ? el('small', null, SC.dateTime(at)) : null), el('blockquote', { lang: 'el' }, text));
    const items = Array.isArray(w.items) ? w.items : [], out = [];
    if (!w.available) out.push(el('p', { class: 'rp-none' }, T('The saved history of the Met Office warnings page is not available, so this report cannot say which warnings were seen.', 'Το αποθηκευμένο ιστορικό της σελίδας προειδοποιήσεων της Μετεωρολογικής Υπηρεσίας δεν είναι διαθέσιμο, οπότε η αναφορά δεν μπορεί να πει ποιες προειδοποιήσεις καταγράφηκαν.')));
    else {
      const lis = [];
      if (w.startOfWeek && w.startOfWeek.text) lis.push(quote(T('At the start of the week the page said', 'Στην αρχή της εβδομάδας η σελίδα έγραφε'), w.startOfWeek.at, w.startOfWeek.text));
      items.forEach((it, i) => lis.push(quote(items.length > 1 ? T('Change ' + (i + 1) + ' of ' + items.length, 'Αλλαγή ' + (i + 1) + ' από ' + items.length) : T('Change saved this week', 'Αλλαγή που αποθηκεύτηκε αυτή την εβδομάδα'), it.at, it.text)));
      if (w.current && w.current.text) lis.push(quote(T('The page now', 'Η σελίδα τώρα'), w.current.fetched, w.current.text));
      out.push(el('p', { class: 'rp-wsum' }, items.length ? T('The Met Office warnings page changed ' + w.versions + ' time' + (w.versions === 1 ? '' : 's') + ' this week and the server saved the text.', 'Η σελίδα προειδοποιήσεων άλλαξε ' + w.versions + (w.versions === 1 ? ' φορά' : ' φορές') + ' αυτή την εβδομάδα και ο διακομιστής αποθήκευσε το κείμενο.') : T('The Met Office warnings page did not change this week, as far as the server saved it.', 'Η σελίδα προειδοποιήσεων δεν άλλαξε αυτή την εβδομάδα, απ’ όσα αποθήκευσε ο διακομιστής.')));
      if (lis.length) out.push(el('ul', { class: 'rp-warn' }, lis));
    }
    out.push(el('p', { class: 'rp-small' }, T('The server saves the page text when it changes (at most every 30 minutes), so a quiet week can have no saved version. The quoted text is the page text as the Met Office wrote it.', 'Ο διακομιστής αποθηκεύει το κείμενο της σελίδας όταν αλλάζει (το πολύ κάθε 30 λεπτά), οπότε μια ήσυχη εβδομάδα μπορεί να μην έχει αποθηκευμένη έκδοση. Το παρατιθέμενο κείμενο είναι το κείμενο της σελίδας όπως το έγραψε η Μετεωρολογική Υπηρεσία.')));
    return out;
  }
  const STANDARD = [/^The sensors are on moving vehicles/, /^Averages are averages/, /^The school vehicle sensor numbers are DEMO/, /^"Online now" is only given/];
  function aboutBlock(r) {
    const extra = r.notes.filter((n) => !STANDARD.some((re) => re.test(n)));
    return el('ul', { class: 'rp-notes' },
      r.demo ? el('li', { class: 'rp-demo' }, T('These are DEMO numbers: simulated sensors, not real vehicles.', 'Αυτοί είναι αριθμοί ΕΠΙΔΕΙΞΗΣ: προσομοιωμένοι αισθητήρες, όχι πραγματικά οχήματα.')) : null,
      el('li', null, T('The sensors are on moving vehicles, not fixed weather stations: averages are for the places the vehicles went. Differences between schools are the start of a question, not an answer.', 'Οι αισθητήρες είναι σε οχήματα που κινούνται, όχι σε σταθερούς μετεωρολογικούς σταθμούς: οι μέσοι όροι αφορούν τα μέρη που πήγαν τα οχήματα. Οι διαφορές μεταξύ σχολείων είναι η αρχή μιας ερώτησης, όχι απάντηση.')),
      el('li', null, T('“Time with readings” is the part of the week that has a reading in the saved history.', 'Ο «Χρόνος με μετρήσεις» είναι το μέρος της εβδομάδας που έχει μέτρηση στο αποθηκευμένο ιστορικό.')),
      extra.map((n) => el('li', { lang: 'en' }, n)));
  }
  function reportSheet(r) {
    const when = r.weekEnding ? T('Week ending ' + fmtLong(r.weekEnding), 'Εβδομάδα που λήγει ' + fmtLong(r.weekEnding)) : '';
    const sum = summaryText(r), ms = mids(r);
    const rows = r.schools.map((s) => { const t = measOf(s, '4097'); return { d: s.d, temp: t ? t.avg : null }; });
    const temps = rows.filter((x) => x.d && fin(x.temp)).map((x) => x.temp);
    const dots = islandDots(r.schools);
    const pic = dots.length ? islandPicture({ rows, dots, label: T('Map of Cyprus with the four districts' + (temps.length > 1 ? ', coloured by average temperature' : ''), 'Χάρτης της Κύπρου με τις τέσσερις επαρχίες' + (temps.length > 1 ? ', χρωματισμένες ανά μέση θερμοκρασία' : '')) }) : null;
    const legend = temps.length > 1 ? el('div', { class: 'rp-leg' }, el('span', null, SC.num(Math.min(...temps), 1) + ' °C'), el('i', { class: 'rp-leg-bar' }), el('span', null, SC.num(Math.max(...temps), 1) + ' °C')) : null;
    const note = r.summary && r.summary.ai ? (r.summary.note ? langText({ en: r.summary.note[0], el: r.summary.note[1] }) : T('AI summary: written by an AI from the numbers in this report. Check the numbers, not the words.', 'Περίληψη ΤΝ: γράφτηκε από τεχνητή νοημοσύνη με βάση τους αριθμούς αυτής της αναφοράς. Ελέγξτε τους αριθμούς, όχι τα λόγια.')) : '';
    const kids = [
      el('section', { class: 'rp-sec' }, el('h3', null, T('In short', 'Με δυο λόγια')),
        sum ? el('p', { class: 'rp-summary' }, sum) : el('p', { class: 'rp-none' }, T('No summary was written for this report. The numbers below are the record.', 'Δεν γράφτηκε σύνοψη για αυτή την αναφορά. Οι αριθμοί παρακάτω είναι το αρχείο.')),
        note ? el('p', { class: 'rp-ai' }, note) : null),
      el('section', { class: 'rp-sec' }, el('h3', null, T('The numbers', 'Οι αριθμοί')), headline(r),
        r.schools.length ? [numbersTable(r), dailyTables(r)] : el('p', { class: 'rp-none' }, T('This report has no numbers.', 'Αυτή η αναφορά δεν έχει αριθμούς.')),
        r.schools.length && !ms.length ? el('p', { class: 'rp-none' }, T('No sensor readings were found for this week.', 'Δεν βρέθηκαν μετρήσεις αισθητήρων για αυτή την εβδομάδα.')) : null),
      el('section', { class: 'rp-sec' }, el('h3', null, T('Met Office warnings seen this week', 'Προειδοποιήσεις της Μετεωρολογικής που καταγράφηκαν')), warningsBlock(r)),
      el('section', { class: 'rp-sec rp-keep' }, el('h3', null, T('The island picture', 'Η εικόνα του νησιού')),
        pic ? el('figure', { class: 'rp-fig' }, pic, legend, el('figcaption', null, temps.length > 1
          ? T('Each district is coloured by the average air temperature of its school’s sensors this week. Colours compare only the schools in this picture; vehicles measure the air where they drove.', 'Κάθε επαρχία χρωματίζεται με τη μέση θερμοκρασία αέρα των αισθητήρων του σχολείου της αυτή την εβδομάδα. Τα χρώματα συγκρίνουν μόνο τα σχολεία αυτής της εικόνας· τα οχήματα μετρούν τον αέρα εκεί που κινήθηκαν.')
          : T('The dot shows where the school is. This report has no temperature to colour the district with. Weekly reports do not include routes.', 'Η κουκκίδα δείχνει πού βρίσκεται το σχολείο. Αυτή η αναφορά δεν έχει θερμοκρασία για να χρωματιστεί η επαρχία. Οι εβδομαδιαίες αναφορές δεν περιλαμβάνουν διαδρομές.'))) : el('p', { class: 'rp-none' }, T('This report has no island picture.', 'Αυτή η αναφορά δεν έχει εικόνα του νησιού.'))),
      el('section', { class: 'rp-sec' }, el('h3', null, T('About these numbers', 'Για αυτούς τους αριθμούς')), aboutBlock(r)),
    ];
    const stamps = [r.status === 'released' ? { text: T('Released' + (r.releasedAt ? ' ' + SC.date(r.releasedAt) : ''), 'Δημοσιεύτηκε' + (r.releasedAt ? ' ' + SC.date(r.releasedAt) : '')) } : r.status === 'withdrawn' ? { text: T('Withdrawn', 'Αποσύρθηκε'), cls: 'rp-st-bad' } : { text: T('Draft', 'Πρόχειρο'), cls: 'rp-st-warn' }];
    if (r.demo) stamps.push({ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'rp-st-demo' });
    return sheet({ title: T('Weekly school report', 'Εβδομαδιαία αναφορά σχολείου'), sub: nameOfReport(r) + (when ? ' · ' + when : '') + (r.weekEnding ? ' (' + weekStart(r.weekEnding) + ' – ' + fmtShort(r.weekEnding) + ')' : ''), stamps, children: kids,
      foot: [el('p', null, PRIVACY()), el('p', null, SOURCES())],
      qr: r.status === 'released' && SC.qrFigure ? SC.qrFigure(location.origin + '/#/reports/' + encodeURIComponent(r.id), { label: T('QR code for the link to this report', 'Κωδικός QR για τον σύνδεσμο αυτής της αναφοράς'), caption: T('Scan to read this report online', 'Σαρώστε για να διαβάσετε την αναφορά στο διαδίκτυο') }) : null });   // only a released report has a public link
  }

  /* ---------- the page ---------- */
  SC.register('reports', {
    title: ['Reports', 'Αναφορές'],
    async render(root, ctx) {
      document.body.classList.add('rp-on');
      const me = ctx.me || SC.me;
      const teacher = Boolean(me && (me.role === 'teacher' || me.role === 'admin'));
      const S = { tab: ctx.query.get('tab') === 'summary' ? 'summary' : 'weekly', id: ctx.args[0] || null, list: null, listErr: null, schools: null, genErr: null, genBusy: false, rep: null, repErr: null, busy: null, ov: null, ovErr: null };
      let alive = true, timer = 0;

      const cfg = await SC.cached('/api/config', 600000).catch(() => null);
      const demo = Boolean(cfg && cfg.demo);
      const head = SC.head({
        title: T('Reports', 'Αναφορές'), tags: demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        lede: T('A weekly report for each school and a one-page summary, both made to print on A4. A teacher checks and releases each weekly report before anyone else can see it.', 'Μια εβδομαδιαία αναφορά για κάθε σχολείο και μια σύνοψη μίας σελίδας, και οι δύο φτιαγμένες για εκτύπωση σε A4. Ένας εκπαιδευτικός ελέγχει και δημοσιεύει κάθε εβδομαδιαία αναφορά πριν τη δει οποιοσδήποτε άλλος.'),
        help: [
          'Weekly reports: open one to read it as a sheet and press Print (or Save as PDF in the print window). Teachers who are signed in can also Generate a report for their school or for all schools, check it in Preview, Release it so that everyone can read it, or Withdraw it again. Print summary: one page for mayors, media and parents with the live school averages and the route squares of the last 24 hours. No vehicle positions and no student names are ever printed.',
          'Εβδομαδιαίες αναφορές: ανοίξτε μία για να τη διαβάσετε ως φύλλο και πατήστε Εκτύπωση (ή Αποθήκευση ως PDF στο παράθυρο εκτύπωσης). Οι εκπαιδευτικοί που έχουν συνδεθεί μπορούν επίσης να δημιουργήσουν μια αναφορά για το σχολείο τους ή για όλα τα σχολεία, να την ελέγξουν στην Προεπισκόπηση, να τη Δημοσιεύσουν ώστε να τη διαβάζουν όλοι ή να την Αποσύρουν ξανά. Σύνοψη για εκτύπωση: μία σελίδα για δημάρχους, μέσα ενημέρωσης και γονείς με τους ζωντανούς μέσους όρους των σχολείων και τα τετράγωνα διαδρομής των τελευταίων 24 ωρών. Δεν εκτυπώνονται ποτέ θέσεις οχημάτων ούτε ονόματα μαθητών.',
        ],
      });
      head.classList.add('rp-noprint');
      const tabRow = el('div', { class: 'rp-tabs-row rp-noprint' });
      const stage = el('div', { class: 'rp-stage' }, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      root.append(head, tabRow, stage);

      /* ---------- calls ---------- */
      async function loadList() {
        S.listErr = null;
        try {
          let r;
          if (teacher) { try { r = await SC.api('/council/api/reports?scope=all'); } catch (e) { r = await SC.api('/council/api/reports'); } }
          else r = await SC.api('/council/api/reports');
          const seen = new Set();
          S.list = (Array.isArray(r && r.reports) ? r.reports : Array.isArray(r) ? r : []).map(normReport).filter((x) => x && x.id && !seen.has(x.id) && seen.add(x.id));
        } catch (e) { S.list = null; S.listErr = e; }
      }
      async function loadReport(id) {
        S.repErr = null; S.rep = null;
        try { const r = await SC.api('/council/api/reports/' + encodeURIComponent(id)); S.rep = normReport(r && (r.report || r)); if (!S.rep) throw new Error(T('The report is empty.', 'Η αναφορά είναι κενή.')); if (!S.rep.id) S.rep.id = id; }
        catch (e) { S.repErr = e; }
      }
      async function loadOverview() {
        S.ovErr = null;
        try { S.ov = await SC.api('/cities/api/overview'); } catch (e) { S.ovErr = e; }
      }
      async function loadSchools() {
        if (S.schools) return;
        try { const r = await SC.api('/app/api/schools/public'); S.schools = (r.schools || []).map((x) => ({ slug: x.slug, name: x.short || x.name })); }
        catch (e) { S.schools = [{ slug: 'pascal-larnaka', name: 'PASCAL Larnaka' }, { slug: 'pascal-lefkosia', name: 'PASCAL Lefkosia' }, { slug: 'pascal-limassol', name: 'PASCAL Limassol' }, { slug: 'paphos-international', name: 'International School of Paphos' }]; }
      }
      const errText = (e) => (e && e.status === 404 && !(e.body && e.body.error && e.body.error !== 'Not found') ? T('The weekly reports service is not switched on yet. The print summary still works.', 'Η υπηρεσία εβδομαδιαίων αναφορών δεν έχει ενεργοποιηθεί ακόμα. Η σύνοψη για εκτύπωση λειτουργεί κανονικά.') : e && (e.status === 401 || e.status === 403) ? T('Only teachers can do that. Sign in on the Approvals page.', 'Μόνο οι εκπαιδευτικοί μπορούν να το κάνουν. Συνδεθείτε στη σελίδα Εγκρίσεις.') : (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.'));
      const errBox = (msg, retry) => el('div', { class: 'rp-err' }, el('div', { class: 'err', role: 'alert' }, msg), retry ? el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά'))) : null);

      /* ---------- tabs ---------- */
      function drawTabs() {
        tabRow.replaceChildren();
        if (S.id) return;
        const T2 = [['weekly', T('Weekly reports', 'Εβδομαδιαίες αναφορές')], ['summary', T('Print summary', 'Σύνοψη για εκτύπωση')]];
        const pick = (id) => { S.tab = id; try { history.replaceState(history.state, '', '#/reports' + (id === 'summary' ? '?tab=summary' : '')); } catch (e) { /* keep */ } start(); };
        tabRow.append(el('div', { class: 'nm-pillbar', role: 'tablist', 'aria-label': T('Reports', 'Αναφορές') }, T2.map(([id, label], i) => el('button', { type: 'button', role: 'tab', class: S.tab === id ? 'on' : '', 'aria-selected': S.tab === id ? 'true' : 'false', tabindex: S.tab === id ? '0' : '-1',
          onclick: () => pick(id), onkeydown: (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); pick(T2[(i + d + 2) % 2][0]); } } }, label))),
          el('span', { class: 'rp-hint' }, S.tab === 'weekly' ? T('Made to print on A4.', 'Φτιαγμένες για εκτύπωση σε A4.') : T('One page for mayors, media and parents.', 'Μία σελίδα για δημάρχους, μέσα ενημέρωσης και γονείς.')));
      }

      /* ---------- weekly: the list ---------- */
      const badge = (st) => (st === 'released' ? el('span', { class: 'nm-badge nm-badge--ok' }, T('Released', 'Δημοσιευμένη')) : st === 'withdrawn' ? el('span', { class: 'nm-badge nm-badge--bad' }, T('Withdrawn', 'Αποσυρμένη')) : el('span', { class: 'nm-badge nm-badge--warn' }, T('Draft', 'Πρόχειρο')));
      function confirmAct(kind, r) {
        const rel = kind === 'release';
        const drop = el('input', { type: 'checkbox', id: 'rp-drop' });
        const hasAi = Boolean(r.summary);
        SC.modal({
          title: rel ? T('Release this report?', 'Να δημοσιευτεί η αναφορά;') : T('Withdraw this report?', 'Να αποσυρθεί η αναφορά;'),
          body: el('div', null, el('p', null, rel
            ? T('Everyone who opens this site will be able to read the weekly report for ' + nameOfReport(r) + ' (week ending ' + fmtShort(r.weekEnding) + '). Check the numbers' + (hasAi ? ' and the summary' : '') + ' first. If a report for this school and week is already released, it is withdrawn and this one replaces it.',
              'Όλοι όσοι ανοίγουν τον ιστότοπο θα μπορούν να διαβάσουν την εβδομαδιαία αναφορά για ' + nameOfReport(r) + ' (εβδομάδα που λήγει ' + fmtShort(r.weekEnding) + '). Ελέγξτε πρώτα τους αριθμούς' + (hasAi ? ' και τη σύνοψη' : '') + '. Αν υπάρχει ήδη δημοσιευμένη αναφορά για το ίδιο σχολείο και την ίδια εβδομάδα, αποσύρεται και την αντικαθιστά αυτή.')
            : T('The report will disappear for visitors. Teachers can still see it and release it again.', 'Η αναφορά θα εξαφανιστεί για τους επισκέπτες. Οι εκπαιδευτικοί μπορούν ακόμα να τη δουν και να τη δημοσιεύσουν ξανά.')),
          rel && hasAi ? el('label', { class: 'rp-drop', for: 'rp-drop' }, drop, T('Release without the AI summary', 'Δημοσίευση χωρίς τη σύνοψη ΤΝ')) : null),
          actions: [{ label: T('Cancel', 'Άκυρο') }, { label: rel ? T('Release', 'Δημοσίευση') : T('Withdraw', 'Απόσυρση'), primary: true, run: () => act(kind, r, drop.checked) }],
        });
      }
      async function act(kind, r, dropSummary) {
        S.busy = r.id; refreshView();
        try {
          const res = await SC.api('/council/api/reports/' + encodeURIComponent(r.id) + '/' + kind, { method: 'POST', body: kind === 'release' && dropSummary ? { dropSummary: true } : {} });
          const upd = normReport(res && (res.report || res));
          const apply = (x) => { if (x && x.id === r.id) { x.status = upd && upd.status ? upd.status : kind === 'release' ? 'released' : 'withdrawn'; x.releasedAt = upd ? upd.releasedAt : x.releasedAt; if (upd && kind === 'release') x.summary = upd.summary; } };
          (S.list || []).forEach(apply); apply(S.rep);
          SC.toast(kind === 'release' ? T('Report released.', 'Η αναφορά δημοσιεύτηκε.') : T('Report withdrawn.', 'Η αναφορά αποσύρθηκε.'));
          if (kind === 'release' && !S.id) await loadList();   // an older released report of the same school and week is withdrawn by the server
        } catch (e) { SC.toast(errText(e)); }
        S.busy = null; if (alive) refreshView();
      }
      function refreshView() { if (S.id) drawReport(); else if (S.tab === 'weekly') drawWeekly(); }
      const actions = (r) => {
        if (!teacher) return [];
        const b = (label, cls, fn) => el('button', { class: 'nm-btn ' + cls, type: 'button', disabled: S.busy === r.id ? true : null, onclick: fn }, label);
        return [r.status === 'released' ? b(T('Withdraw', 'Απόσυρση'), 'nm-btn--danger-outline', () => confirmAct('withdraw', r)) : b(T('Release', 'Δημοσίευση'), 'nm-btn--primary rp-rel', () => confirmAct('release', r))];
      };
      function drawWeekly() {
        stage.replaceChildren();
        const main = el('div', { class: 'rp-main' });
        if (S.listErr) main.append(errBox(errText(S.listErr), async () => { stage.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); await loadList(); if (alive) drawWeekly(); }), el('p', { class: 'muted' }, T('The print summary on the other tab does not need this service.', 'Η σύνοψη για εκτύπωση στην άλλη καρτέλα δεν χρειάζεται αυτή την υπηρεσία.'), ' ', el('button', { class: 'link', type: 'button', onclick: () => { S.tab = 'summary'; start(); } }, T('Open the print summary', 'Άνοιγμα της σύνοψης για εκτύπωση'))));
        else {
          const list = (S.list || []).slice().sort((a, b) => (b.weekEnding || '').localeCompare(a.weekEnding || '') || (b.releasedAt || b.generatedAt || 0) - (a.releasedAt || a.generatedAt || 0));
          if (!list.length) main.append(el('div', { class: 'empty' }, teacher ? T('No weekly reports yet. Use “Generate a report” to make the first one. It stays a draft until you release it.', 'Δεν υπάρχουν ακόμα εβδομαδιαίες αναφορές. Χρησιμοποιήστε το «Δημιουργία αναφοράς» για την πρώτη. Μένει πρόχειρη μέχρι να τη δημοσιεύσετε.') : T('No weekly report has been released yet. A teacher generates a report each week and releases it here.', 'Δεν έχει δημοσιευτεί ακόμα εβδομαδιαία αναφορά. Ένας εκπαιδευτικός δημιουργεί μια αναφορά κάθε εβδομάδα και τη δημοσιεύει εδώ.')));
          let lastWeek = null;
          list.forEach((r) => {
            if (r.weekEnding !== lastWeek) { lastWeek = r.weekEnding; main.append(el('h2', { class: 'rp-week' }, r.weekEnding ? T('Week ending ' + fmtShort(r.weekEnding), 'Εβδομάδα που λήγει ' + fmtShort(r.weekEnding)) : T('Undated', 'Χωρίς ημερομηνία'))); }
            const sum = summaryText(r);
            main.append(el('article', { class: 'nm-card nm-lift rp-item' + (r.status !== 'released' ? ' rp-dim' : '') },
              el('div', { class: 'rp-it-top' }, el('span', { class: 'nm-icon-tile' }, SC.icon('file', 22)), el('div', { class: 'rp-it-t' }, el('h3', null, nameOfReport(r)),
                el('div', { class: 'rp-it-m' }, teacher || r.status !== 'released' ? badge(r.status) : null, r.demo ? el('span', { class: 't demo' }, T('Demo data', 'Δεδομένα επίδειξης')) : null, r.summary && r.summary.ai ? el('span', { class: 't ai' }, T('AI summary', 'Σύνοψη ΤΝ')) : null,
                  r.releasedAt && r.status === 'released' ? el('span', { class: 'muted' }, T('Released ' + SC.ago(r.releasedAt), 'Δημοσιεύτηκε ' + SC.ago(r.releasedAt))) : r.generatedAt ? el('span', { class: 'muted' }, T('Made ' + SC.ago(r.generatedAt), 'Δημιουργήθηκε ' + SC.ago(r.generatedAt))) : null))),
              sum ? el('p', { class: 'rp-it-s' }, sum) : null,
              el('div', { class: 'rp-it-a' }, el('a', { class: 'nm-btn', href: '#/reports/' + encodeURIComponent(r.id) }, r.status === 'released' ? T('Open the report', 'Άνοιγμα αναφοράς') : T('Preview', 'Προεπισκόπηση')), actions(r))));
          });
        }
        const side = el('aside', { class: 'rp-side' }, teacher ? generateCard() : el('section', { class: 'nm-card rp-teach' }, el('div', { class: 'card-eye' }, T('Teachers', 'Εκπαιδευτικοί')), el('h2', { class: 'card-h' }, T('Who makes these reports', 'Ποιος φτιάχνει αυτές τις αναφορές')),
          el('p', null, T('A teacher generates each report from the saved data, reads it, and releases it. Until then only teachers can see it. Visitors see released reports only.', 'Ένας εκπαιδευτικός δημιουργεί κάθε αναφορά από τα αποθηκευμένα δεδομένα, τη διαβάζει και τη δημοσιεύει. Μέχρι τότε μόνο οι εκπαιδευτικοί τη βλέπουν. Οι επισκέπτες βλέπουν μόνο δημοσιευμένες αναφορές.')),
          el('a', { class: 'pill-link', href: '#/approvals' }, SC.icon('lock', 14), T('Teachers sign in here', 'Εδώ συνδέονται οι εκπαιδευτικοί'))));
        stage.append(el('div', { class: 'rp-cols' }, main, side));
      }
      function generateCard() {
        const own = me && me.role === 'teacher' && me.school && me.school.slug ? me.school.slug : null;   // a teacher makes reports for their own school or for all; an admin for any
        const opts = (S.schools || []).filter((s) => !own || s.slug === own);
        const sel = el('select', { class: 'nm-input', id: 'rp-school', 'aria-label': T('School', 'Σχολείο') }, el('option', { value: 'all' }, T('All four schools', 'Και τα τέσσερα σχολεία')), opts.map((s) => el('option', { value: s.slug }, s.name)));
        const wk = el('input', { class: 'nm-input', id: 'rp-week', type: 'date', value: lastSunday(), min: addDays(todayStr(), -21), max: todayStr() });
        const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: S.genBusy ? true : null, onclick: async () => {
          if (!ymd.test(wk.value)) { S.genErr = T('Pick the date the week ends on.', 'Επιλέξτε την ημερομηνία που λήγει η εβδομάδα.'); drawWeekly(); return; }
          const keepS = sel.value, keepW = wk.value;
          S.genBusy = true; S.genErr = null; drawWeekly(); document.getElementById('rp-school').value = keepS; document.getElementById('rp-week').value = keepW;
          try {
            const res = await SC.api('/council/api/reports/generate', { method: 'POST', body: { school: keepS, weekEnding: keepW } });
            await loadList();
            SC.toast(res && res.aiSummary === false ? T('Draft ready, without an AI summary (the assistant is off). Preview it, then release it.', 'Το πρόχειρο είναι έτοιμο, χωρίς σύνοψη ΤΝ (ο βοηθός είναι ανενεργός). Δείτε την προεπισκόπηση και μετά δημοσιεύστε το.')
              : res && res.summaryMade === false ? T('Draft ready, but the assistant could not write a summary this time.', 'Το πρόχειρο είναι έτοιμο, αλλά ο βοηθός δεν μπόρεσε να γράψει σύνοψη αυτή τη φορά.') : T('Draft ready. Preview it, then release it.', 'Το πρόχειρο είναι έτοιμο. Δείτε την προεπισκόπηση και μετά δημοσιεύστε το.'));
          } catch (e) { S.genErr = errText(e); }
          S.genBusy = false; if (alive && !S.id && S.tab === 'weekly') { drawWeekly(); }
        } }, S.genBusy ? T('Generating…', 'Δημιουργία…') : T('Generate', 'Δημιουργία'));
        return el('section', { class: 'nm-card nm-card--glow rp-gen', 'aria-labelledby': 'rp-gen-h' },
          el('div', { class: 'card-eye' }, T('For teachers', 'Για εκπαιδευτικούς')), el('h2', { class: 'card-h', id: 'rp-gen-h' }, T('Generate a report', 'Δημιουργία αναφοράς')),
          el('p', { class: 'card-sub' }, T('Builds the weekly numbers from the saved sensor history and the saved Met Office warnings page and, if the assistant is on, a short AI summary. It can take up to a minute. The result is a draft: nobody else sees it until you release it.', 'Φτιάχνει τους εβδομαδιαίους αριθμούς από το αποθηκευμένο ιστορικό αισθητήρων και την αποθηκευμένη σελίδα προειδοποιήσεων της Μετεωρολογικής και, αν ο βοηθός είναι ενεργός, μια σύντομη σύνοψη ΤΝ. Μπορεί να πάρει έως ένα λεπτό. Το αποτέλεσμα είναι πρόχειρο: κανείς άλλος δεν το βλέπει μέχρι να το δημοσιεύσετε.')),
          el('label', { class: 'rp-lab', for: 'rp-school' }, T('School', 'Σχολείο')), sel,
          el('label', { class: 'rp-lab', for: 'rp-week' }, T('Week ending (a Sunday, up to 21 days back)', 'Εβδομάδα που λήγει (Κυριακή, έως 21 ημέρες πίσω)')), wk,
          S.genErr ? el('div', { class: 'err rp-generr', role: 'alert' }, S.genErr) : null,
          el('div', { class: 'rp-gen-a' }, go));
      }

      /* ---------- one report ---------- */
      function drawReport() {
        stage.replaceChildren();
        const back = el('a', { class: 'pill-link rp-noprint rp-back', href: '#/reports' }, SC.icon('arrow', 14), T('All reports', 'Όλες οι αναφορές'));
        if (S.repErr) { stage.append(el('div', { class: 'rp-tools rp-noprint' }, back), errBox(S.repErr.status === 404 ? T('That report was not found. It may not be released, or it may have been withdrawn.', 'Η αναφορά δεν βρέθηκε. Ίσως δεν έχει δημοσιευτεί ή έχει αποσυρθεί.') : errText(S.repErr), S.repErr.status === 404 ? null : async () => { stage.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); await loadReport(S.id); if (alive) drawReport(); })); return; }
        const r = S.rep; if (!r) return;
        stage.append(el('div', { class: 'rp-tools rp-noprint' }, back, el('span', { class: 'rp-tools-sp' }), teacher ? badge(r.status) : null,
          el('button', { class: 'nm-btn', type: 'button', onclick: () => window.print() }, SC.icon('file', 16), T('Print or save as PDF', 'Εκτύπωση ή αποθήκευση ως PDF')), actions(r)));
        if (r.status !== 'released') stage.append(el('div', { class: 'nm-callout nm-callout--warn rp-banner rp-noprint' }, r.status === 'withdrawn' ? T('This report is withdrawn. Only teachers can see it.', 'Αυτή η αναφορά έχει αποσυρθεί. Μόνο οι εκπαιδευτικοί τη βλέπουν.') : T('Draft preview. Only teachers can see this until it is released. Read the summary and the numbers before you release it.', 'Προεπισκόπηση πρόχειρου. Μόνο οι εκπαιδευτικοί το βλέπουν μέχρι να δημοσιευτεί. Διαβάστε τη σύνοψη και τους αριθμούς πριν το δημοσιεύσετε.')));
        if (!r.full) stage.append(el('div', { class: 'nm-callout nm-callout--warn rp-banner rp-noprint' }, T('The service sent only the headline of this report: the numbers and the Met Office warnings are not included.', 'Η υπηρεσία έστειλε μόνο την επικεφαλίδα αυτής της αναφοράς: δεν περιλαμβάνονται οι αριθμοί και οι προειδοποιήσεις.')));
        stage.append(reportSheet(r));
      }

      /* ---------- the print summary (port of "5 Present") ---------- */
      function drawSummary() {
        stage.replaceChildren();
        if (S.ovErr && !S.ov) { stage.append(errBox(T('Could not load the school averages. ', 'Δεν φορτώθηκαν οι μέσοι όροι των σχολείων. ') + (S.ovErr.message || ''), async () => { stage.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); await loadOverview(); if (alive) drawSummary(); })); return; }
        const ov = S.ov, schools = Array.isArray(ov.schools) ? ov.schools : [];
        const rows = schools.map((s) => ({ name: s.name, d: distOf(s.id, s.name), lat: s.lat, lng: s.lng, sensors: nn(s.sensors), online: nn(s.online), temp: nn(s.temp), humidity: nn(s.humidity), co2: nn(s.co2) }));
        const cells = []; schools.forEach((s) => (Array.isArray(s.cells) ? s.cells : []).forEach((c) => { if (Array.isArray(c) && fin(c[0]) && fin(c[1])) cells.push({ la: c[0], ln: c[1], n: fin(c[2]) ? c[2] : 1, d: distOf(s.id, s.name) }); }));
        const upd = dateOf(ov.updated), hours = Math.round((ov.delayMinutes || 120) / 60);
        const noReadings = !rows.some((r) => fin(r.temp) || fin(r.humidity) || fin(r.co2));
        const SL = [T('Air temperature °C', 'Θερμοκρασία αέρα °C'), T('Humidity %', 'Υγρασία %'), 'CO2 ppm', T('Sensors online', 'Αισθητήρες σε λειτουργία')];
        const table = el('div', { class: 'rp-tw' }, el('table', { class: 'rp-table rp-stack' },
          el('thead', null, el('tr', null, el('th', { scope: 'col' }, T('School', 'Σχολείο')), SL.map((l) => el('th', { scope: 'col' }, l)))),
          el('tbody', null, rows.map((r) => el('tr', null, schoolCell({ d: r.d, name: r.name }), el('td', { 'data-label': SL[0] }, num(r.temp, 1)), el('td', { 'data-label': SL[1] }, num(r.humidity, 0)), el('td', { 'data-label': SL[2] }, num(r.co2, 0)), el('td', { 'data-label': SL[3] }, fin(r.online) && fin(r.sensors) ? r.online + ' / ' + r.sensors : '–'))))));
        const kids = [
          el('section', { class: 'rp-sec' }, el('h3', null, T('Four schools. One living data classroom.', 'Τέσσερα σχολεία. Μία ζωντανή τάξη δεδομένων.')),
            el('p', { class: 'rp-summary' }, T('Sensors on school buses and cars help students in Larnaka, Lefkosia, Lemesos and Pafos understand heat and air in their own cities. The table shows the newest readings; the picture shows where the vehicles drove in the last 24 hours.', 'Αισθητήρες σε σχολικά λεωφορεία και αυτοκίνητα βοηθούν τους μαθητές σε Λάρνακα, Λευκωσία, Λεμεσό και Πάφο να καταλάβουν τη θερμότητα και τον αέρα της πόλης τους. Ο πίνακας δείχνει τις νεότερες μετρήσεις· η εικόνα δείχνει πού κινήθηκαν τα οχήματα τις τελευταίες 24 ώρες.'))),
          el('section', { class: 'rp-sec rp-keep' }, el('h3', null, T('The island', 'Το νησί')),
            el('figure', { class: 'rp-fig' }, islandPicture({ cells, dots: rows.filter((r) => fin(r.lat) && fin(r.lng)), label: T('Map of Cyprus with the four school districts and ' + cells.length + ' route squares', 'Χάρτης της Κύπρου με τις τέσσερις σχολικές επαρχίες και ' + cells.length + ' τετράγωνα διαδρομής') }),
              el('figcaption', null, cells.length ? T('Dots are schools. Squares are grouped, delayed routes (about ' + (ov.cellKm || 1) + ' km wide, at least ' + hours + ' hours old), drawn about three times their true width so that they can be seen.', 'Οι κουκκίδες είναι σχολεία. Τα τετράγωνα είναι ομαδοποιημένες διαδρομές με καθυστέρηση (πλάτους περίπου ' + (ov.cellKm || 1) + ' χλμ, παλαιότερες των ' + hours + ' ωρών), σχεδιασμένα περίπου τριπλάσια σε πλάτος ώστε να φαίνονται.') : T('Dots are schools. No route square yet: squares appear for trips that are more than ' + hours + ' hours old.', 'Οι κουκκίδες είναι σχολεία. Δεν υπάρχει ακόμα τετράγωνο διαδρομής: τα τετράγωνα εμφανίζονται για διαδρομές παλαιότερες των ' + hours + ' ωρών.')))),
          el('section', { class: 'rp-sec' }, el('h3', null, T('Latest averages per school', 'Τελευταίοι μέσοι όροι ανά σχολείο')), noReadings ? el('p', { class: 'rp-none' }, T('No school sensor has a reading right now.', 'Κανένας αισθητήρας σχολείου δεν έχει μέτρηση αυτή τη στιγμή.')) : table,
            el('p', { class: 'rp-small' }, T('Differences between schools are the start of a question, not an answer: vehicle sensors read the air around the vehicle.', 'Οι διαφορές μεταξύ σχολείων είναι η αρχή μιας ερώτησης, όχι απάντηση: οι αισθητήρες των οχημάτων μετρούν τον αέρα γύρω από το όχημα.'))),
        ];
        stage.append(el('div', { class: 'rp-tools rp-noprint' }, el('span', { class: 'muted' }, upd ? T('Numbers from ' + SC.dateTime(upd), 'Αριθμοί από ' + SC.dateTime(upd)) : ''), el('span', { class: 'rp-tools-sp' }),
          el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => window.print() }, SC.icon('file', 16), T('Print', 'Εκτύπωση'))),
          sheet({ title: T('Smart Cities: the one-page summary', 'Smart Cities: η σύνοψη μίας σελίδας'), sub: T('For mayors, media and parents' + (upd ? ' · ' + SC.date(upd) : ''), 'Για δημάρχους, μέσα ενημέρωσης και γονείς' + (upd ? ' · ' + SC.date(upd) : '')),
            stamps: [{ text: T('Live numbers', 'Ζωντανοί αριθμοί') }].concat(demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'rp-st-demo' }] : []), children: kids, foot: [el('p', null, PRIVACY()), el('p', null, SOURCES())],
            qr: SC.qrFigure ? SC.qrFigure(location.origin + '/#/reports?tab=summary', { label: T('QR code for the link to the live summary', 'Κωδικός QR για τον σύνδεσμο της ζωντανής σύνοψης'), caption: T('Scan to see the live numbers', 'Σαρώστε για να δείτε τους ζωντανούς αριθμούς') }) : null }));
      }

      /* ---------- go ---------- */
      async function start() {
        drawTabs();
        stage.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        if (S.id) { await Promise.all([loadReport(S.id), teacher ? loadSchools() : null]); if (alive) drawReport(); }
        else if (S.tab === 'summary') { await loadOverview(); if (alive) drawSummary(); }
        else { await Promise.all([loadList(), teacher ? loadSchools() : null]); if (alive) drawWeekly(); }
      }
      await start();
      timer = setInterval(async () => { if (!alive || S.id || S.tab !== 'summary') return; await loadOverview(); if (alive && !S.id && S.tab === 'summary') drawSummary(); }, 120000);   // the summary keeps up with the data; a report does not change
      return () => { alive = false; clearInterval(timer); document.body.classList.remove('rp-on'); };
    },
  });
})();
