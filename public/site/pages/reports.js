/*
  Reports: the weekly school report and the one-page print summary, both made for paper (A4, no menu).
    #/reports                 released weekly reports, newest week first (teachers also see drafts and withdrawn ones)
    #/reports/<id>            one report as a printable sheet: the summary, the numbers, the Met Office warnings seen, the island picture
    #/reports?tab=summary     the print summary (port of the "5 Present" page of the old Cities site): live school averages, route squares, privacy note
  Sources: /council/api/reports  (SRV-F contract)
             GET /council/api/reports                       released reports; for a signed-in teacher also drafts (asked with ?scope=review, plain list if that fails)
             GET /council/api/reports/<id>                  one report (released, or any for teachers)
             POST /council/api/reports/generate { school: slug | 'all', weekEnding: 'YYYY-MM-DD' }   teacher or admin
             POST /council/api/reports/<id>/release | /withdraw                                       teacher or admin
           The shape of a report is read loosely, because the contract only names the calls: id, school, schoolName, weekEnding, status, summary, ai,
           createdAt, releasedAt, numbers (per school: temp, humidity, co2, min and max, sensors, online, readings), warnings (title, level, from, to, text),
           island (route cells: [lat, lng, visits] per school). A part the server does not send is left out of the sheet and the page says so.
           /cities/api/overview, /api/config   the live print summary
           /app/api/schools/public             the school list (slugs) for the Generate form
  Printing: body gets the class rp-on while this page is open; in reports.css @media print hides the menu and every control and prints the sheet on A4.
  Privacy: no vehicle position anywhere. Route squares are the delayed (2 h), grouped (1 km) cells. No student names.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/reports.css');

  const HOUR = 3600000;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const dateOf = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v); return isFinite(n) && n > 0 ? n : null; };
  const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ymd = /^\d{4}-\d{2}-\d{2}$/;

  const DIST = [
    { id: 'nicosia', school: 'lefkosia', col: '#E07F3F', n: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], d: ['Lefkosia', 'Λευκωσία'], re: /lefkos|nicosia|λευκωσ/ },
    { id: 'larnaca', school: 'larnaca', col: '#2F6FD0', n: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], d: ['Larnaka', 'Λάρνακα'], re: /larnak|larnac|λαρνακ/ },
    { id: 'limassol', school: 'limassol', col: '#2E9E63', n: ['PASCAL Limassol', 'PASCAL Λεμεσός'], d: ['Lemesos', 'Λεμεσός'], re: /limass|lemes|λεμεσ/ },
    { id: 'paphos', school: 'paphos', col: '#7A5FE0', n: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], d: ['Pafos', 'Πάφος'], re: /paph|pafos|παφ/ },
  ];
  const distOf = (...txt) => { const f = fold(txt.filter(Boolean).join(' ')); return DIST.find((d) => d.re.test(f)) || null; };
  const RAMP = [[76, 203, 234], [247, 196, 107], [232, 105, 63]];
  const ramp = (t) => { t = Math.max(0, Math.min(1, t)); const a = t < 0.5 ? RAMP[0] : RAMP[1], b = t < 0.5 ? RAMP[1] : RAMP[2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2; return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * u)).join(',') + ')'; };
  const num = (v, d) => (fin(v) ? SC.num(v, d) : '–');

  /* ---------- dates ---------- */
  const longDay = () => new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const shortDay = () => new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  const dayMs = (s) => { const m = ymd.test(String(s || '')) ? String(s).split('-').map(Number) : null; return m ? Date.UTC(m[0], m[1] - 1, m[2], 12) : null; };
  const fmtLong = (s) => { const t = dayMs(s); return t ? longDay().format(t) : String(s || ''); };
  const fmtShort = (s) => { const t = dayMs(s); return t ? shortDay().format(t) : String(s || ''); };
  const weekStart = (s) => { const t = dayMs(s); return t ? shortDay().format(t - 6 * 86400000) : ''; };
  function lastSunday() {
    const now = new Date(), d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());   // 0 = Sunday: today when it is Sunday
    return d.toISOString().slice(0, 10);
  }
  const todayStr = () => new Date().toISOString().slice(0, 10);

  /* ---------- reading what the server sends ---------- */
  const pick = (o, ...keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };
  const nn = (v) => { const x = typeof v === 'string' ? Number(v) : v; return fin(x) ? x : null; };
  function normRow(r, key) {
    if (!r || typeof r !== 'object') return null;
    const id = pick(r, 'id', 'school', 'slug', 'key') || key || '', name = pick(r, 'name', 'schoolName', 'school_name', 'label') || '';
    return { id: String(id), name: String(name), d: distOf(id, name, key), sensors: nn(pick(r, 'sensors', 'sensorCount')), online: nn(pick(r, 'online', 'sensorsOnline')),
      temp: nn(pick(r, 'temp', 'tempAvg', 'avgTemp', 'temperature', 'temperatureAvg')), tempMin: nn(pick(r, 'tempMin', 'minTemp', 'temperatureMin')), tempMax: nn(pick(r, 'tempMax', 'maxTemp', 'temperatureMax')),
      humidity: nn(pick(r, 'humidity', 'hum', 'humidityAvg', 'avgHumidity')), co2: nn(pick(r, 'co2', 'co2Avg', 'avgCo2')), co2Max: nn(pick(r, 'co2Max', 'maxCo2')), readings: nn(pick(r, 'readings', 'count', 'n')) };
  }
  function normRows(n) {
    if (!n) return [];
    if (Array.isArray(n)) return n.map((r) => normRow(r)).filter(Boolean);
    if (Array.isArray(n.schools)) return n.schools.map((r) => normRow(r)).filter(Boolean);
    if (Array.isArray(n.rows)) return n.rows.map((r) => normRow(r)).filter(Boolean);
    const keys = Object.keys(n).filter((k) => n[k] && typeof n[k] === 'object' && !Array.isArray(n[k]));
    return keys.map((k) => normRow(n[k], k)).filter(Boolean);
  }
  function normWarnings(w) {
    if (!w) return [];
    const list = Array.isArray(w) ? w : Array.isArray(w.items) ? w.items : [];
    return list.map((x) => {
      if (typeof x === 'string') return { title: x, level: '', from: null, to: null, text: '' };
      const lv = fold(pick(x, 'level', 'severity', 'colour', 'color') || '');
      return { title: String(pick(x, 'title', 'headline', 'name', 'text') || ''), level: /red|κοκκιν/.test(lv) ? 'red' : /orange|πορτοκ/.test(lv) ? 'orange' : /yellow|κιτριν/.test(lv) ? 'yellow' : '', from: dateOf(pick(x, 'from', 'start', 'at', 'issued')), to: dateOf(pick(x, 'to', 'end', 'until')), text: String(pick(x, 'detail', 'description', 'body', 'message') || (pick(x, 'title', 'headline', 'name') ? pick(x, 'text') || '' : '')) };
    }).filter((x) => x.title);
  }
  function normCells(isl, fallback) {
    const src = isl && (isl.schools || isl.cells || isl) || fallback;
    const out = [];
    const add = (c, school) => { const a = Array.isArray(c) ? c : [pick(c, 'lat'), pick(c, 'lng', 'lon'), pick(c, 'n', 'count', 'visits')]; if (fin(a[0]) && fin(a[1])) out.push({ la: a[0], ln: a[1], n: fin(a[2]) ? a[2] : 1, d: distOf(school) }); };
    if (Array.isArray(src)) src.forEach((x) => { if (x && Array.isArray(x.cells)) x.cells.forEach((c) => add(c, pick(x, 'id', 'school', 'name'))); else add(x, ''); });
    return out;
  }
  function normReport(r) {
    if (!r || typeof r !== 'object') return null;
    const rows = normRows(pick(r, 'numbers', 'stats', 'data', 'schools'));
    const sch = pick(r, 'school', 'slug') || 'all';
    return {
      id: String(pick(r, 'id', 'reportId') || ''), school: String(sch), schoolName: pick(r, 'schoolName', 'school_name', 'name') || '', weekEnding: String(pick(r, 'weekEnding', 'week_ending', 'week') || ''),
      status: String(pick(r, 'status') || (r.released ? 'released' : 'draft')).toLowerCase(), summary: String(pick(r, 'summary', 'text', 'narrative') || ''), ai: Boolean(pick(r, 'ai', 'aiSummary', 'summaryAi', 'aiWritten')),
      createdAt: dateOf(pick(r, 'createdAt', 'created_at', 'generatedAt')), releasedAt: dateOf(pick(r, 'releasedAt', 'released_at')), rows,
      warnings: normWarnings(pick(r, 'warnings', 'metWarnings', 'met')), hasWarnings: pick(r, 'warnings', 'metWarnings', 'met') != null, cells: normCells(pick(r, 'island', 'route', 'map'), null), hasIsland: pick(r, 'island', 'route', 'map') != null,
      full: Boolean(pick(r, 'numbers', 'stats', 'data', 'warnings', 'island')),
    };
  }
  const nameOfReport = (r) => (r.school === 'all' || /^all\b/i.test(r.schoolName) ? T('All four schools', 'Και τα τέσσερα σχολεία') : (() => { const d = distOf(r.school, r.schoolName); return d ? T(d.n[0], d.n[1]) : r.schoolName || r.school; })());

  /* ---------- the island picture (paper colours) ---------- */
  function islandPicture(o) {   // o: { cells:[{la,ln,n,d}], rows:[{d,temp}], mode: 'squares' | 'temp', label }
    if (typeof ISLAND === 'undefined') return el('div');
    const svg = sv('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, class: 'rp-isl', role: 'img', 'aria-label': o.label });
    const temps = (o.rows || []).filter((r) => r.d && fin(r.temp)).map((r) => r.temp), lo = temps.length ? Math.min(...temps) : 0, hi = temps.length ? Math.max(...temps) : 1;
    Object.keys(ISLAND.districts).forEach((id) => {
      const d = DIST.find((x) => x.id === id), row = (o.rows || []).find((r) => r.d && r.d.id === id);
      let fill = '#EEF3F8';
      if (o.mode === 'temp' && row && fin(row.temp)) fill = ramp(hi > lo ? (row.temp - lo) / (hi - lo) : 0.5);
      svg.append(sv('path', { d: ISLAND.districts[id], fill, stroke: d ? '#5E7C9B' : '#B7C6D6', 'stroke-width': d ? 0.5 : 0.3, 'stroke-linejoin': 'round' }));
    });
    const maxN = (o.cells || []).reduce((m, c) => Math.max(m, c.n), 1);
    const g = 0.01, w = g * ISLAND.k * ISLAND.sx * 2.2, h = g * ISLAND.sx * 2.2;
    (o.cells || []).forEach((c) => { const p = ISLAND.project(c.ln, c.la); svg.append(sv('rect', { x: (p[0] - w / 2).toFixed(1), y: (p[1] - h / 2).toFixed(1), width: w.toFixed(1), height: h.toFixed(1), fill: c.d ? c.d.col : '#1B4A78', opacity: (0.3 + 0.7 * c.n / maxN).toFixed(2) })); });
    DIST.forEach((d) => {
      const s = (o.schools || []).find((x) => x.id === d.school); if (!s) return;
      const p = ISLAND.project(s.lng, s.lat);
      svg.append(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 11, fill: d.col, stroke: '#fff', 'stroke-width': 4 }), sv('text', { x: (p[0] + 17).toFixed(1), y: (p[1] + 6).toFixed(1), class: 'rp-isl-t' }, T(d.d[0], d.d[1])));
    });
    return svg;
  }
  const SCHOOL_PLACES = [{ id: 'larnaca', lat: 34.9217, lng: 33.6232 }, { id: 'lefkosia', lat: 35.1856, lng: 33.3823 }, { id: 'limassol', lat: 34.6841, lng: 33.0379 }, { id: 'paphos', lat: 34.7754, lng: 32.4245 }];

  /* ---------- the sheet ---------- */
  function logo() {
    const s = sv('svg', { viewBox: '0 0 38 38', class: 'rp-logo', 'aria-hidden': 'true' });
    s.innerHTML = '<rect x="1" y="1" width="36" height="36" rx="10" fill="#10223a"/><circle cx="19" cy="19" r="3" fill="#F2A56B"/><path d="M12.5 12.5a9.2 9.2 0 000 13M25.5 12.5a9.2 9.2 0 010 13M8.6 8.6a14.7 14.7 0 000 20.8M29.4 8.6a14.7 14.7 0 010 20.8" fill="none" stroke="#4CCBEA" stroke-width="1.8" stroke-linecap="round"/>';   // static string
    return s;
  }
  function sheet({ title, sub, stamp, children, foot }) {
    return el('article', { class: 'rp-sheet', 'aria-label': title },
      el('header', { class: 'rp-sh-head' }, logo(), el('div', { class: 'rp-sh-brand' }, el('b', null, 'SMART CITIES'), el('small', null, T('Cyprus · live from our schools', 'Κύπρος · ζωντανά από τα σχολεία μας'))),
        stamp ? el('span', { class: 'rp-stamp' }, stamp) : null),
      el('h1', { class: 'rp-sh-title' }, title), sub ? el('p', { class: 'rp-sh-sub' }, sub) : null,
      children,
      el('footer', { class: 'rp-sh-foot' }, foot));
  }
  const PRIVACY = () => T('Privacy: this page shows school averages and delayed, grouped routes only. No live vehicle positions and no student names. Route squares are about 1 km wide and built from points at least 2 hours old.', 'Ιδιωτικότητα: αυτή η σελίδα δείχνει μόνο μέσους όρους σχολείων και ομαδοποιημένες διαδρομές με καθυστέρηση. Καμία ζωντανή θέση οχήματος και κανένα όνομα μαθητή. Τα τετράγωνα διαδρομής έχουν πλάτος περίπου 1 χλμ και φτιάχνονται από σημεία παλαιότερα των 2 ωρών.');
  const SOURCES = () => T('Sources: school sensors (SenseCAP) on buses, cars and in classrooms; Cyprus Department of Meteorology (Met Office) for warnings and stations.', 'Πηγές: αισθητήρες σχολείων (SenseCAP) σε λεωφορεία, αυτοκίνητα και αίθουσες· Τμήμα Μετεωρολογίας Κύπρου (Μετεωρολογική Υπηρεσία) για προειδοποιήσεις και σταθμούς.');

  function numbersTable(rows) {
    const has = (k) => rows.some((r) => fin(r[k]));
    const cols = [
      ['sensors', T('Sensors online', 'Αισθητήρες σε λειτουργία'), (r) => (fin(r.online) && fin(r.sensors) ? r.online + ' / ' + r.sensors : fin(r.sensors) ? String(r.sensors) : '–'), has('sensors') || has('online')],
      ['temp', T('Temperature °C', 'Θερμοκρασία °C'), (r) => num(r.temp, 1) + (fin(r.tempMin) && fin(r.tempMax) ? '  (' + SC.num(r.tempMin, 1) + ' – ' + SC.num(r.tempMax, 1) + ')' : ''), has('temp')],
      ['humidity', T('Humidity %', 'Υγρασία %'), (r) => num(r.humidity, 0), has('humidity')],
      ['co2', T('CO2 ppm', 'CO2 ppm'), (r) => num(r.co2, 0) + (fin(r.co2Max) ? '  (max ' + SC.num(r.co2Max, 0) + ')' : ''), has('co2')],
      ['readings', T('Readings', 'Μετρήσεις'), (r) => (fin(r.readings) ? r.readings.toLocaleString(SC.lang === 'el' ? 'el-GR' : 'en-GB') : '–'), has('readings')],
    ].filter((c) => c[3]);
    return el('div', { class: 'rp-tw' }, el('table', { class: 'rp-table' },
      el('thead', null, el('tr', null, el('th', { scope: 'col' }, T('School', 'Σχολείο')), cols.map((c) => el('th', { scope: 'col' }, c[1])))),
      el('tbody', null, rows.map((r) => { const d = r.d; return el('tr', null, el('th', { scope: 'row' }, d ? el('i', { class: 'rp-dot', style: { background: d.col } }) : null, d ? T(d.n[0], d.n[1]) : r.name || r.id), cols.map((c) => el('td', null, c[2](r)))); }))));
  }
  function warningsBlock(r) {
    if (!r.hasWarnings) return el('p', { class: 'rp-none' }, T('This report does not include the Met Office warnings.', 'Αυτή η αναφορά δεν περιλαμβάνει τις προειδοποιήσεις της Μετεωρολογικής Υπηρεσίας.'));
    if (!r.warnings.length) return el('p', { class: 'rp-none' }, T('No Met Office warning was seen this week.', 'Δεν καταγράφηκε καμία προειδοποίηση της Μετεωρολογικής Υπηρεσίας αυτή την εβδομάδα.'));
    const lv = { yellow: T('Yellow', 'Κίτρινη'), orange: T('Orange', 'Πορτοκαλί'), red: T('Red', 'Κόκκινη') };
    return el('ul', { class: 'rp-warn' }, r.warnings.map((w) => el('li', { class: 'lv-' + (w.level || 'none') },
      el('span', { class: 'rp-lv' }, w.level ? lv[w.level] : T('Warning', 'Προειδοποίηση')),
      el('div', null, el('b', null, w.title), w.from || w.to ? el('small', null, [w.from ? SC.dateTime(w.from) : '', w.to ? SC.dateTime(w.to) : ''].filter(Boolean).join(' → ')) : null, w.text ? el('p', null, w.text) : null))));
  }
  function reportSheet(r, draftNote) {
    const when = r.weekEnding ? T('Week ending ' + fmtLong(r.weekEnding), 'Εβδομάδα που λήγει ' + fmtLong(r.weekEnding)) : '';
    const rows = r.rows;
    const useCells = r.cells.length > 0;
    const pic = (rows.length || useCells) ? islandPicture({ cells: r.cells, rows, mode: useCells ? 'squares' : 'temp', schools: SCHOOL_PLACES, label: T('Map of Cyprus with the four districts' + (useCells ? ' and the route squares of the week' : ', coloured by average temperature'), 'Χάρτης της Κύπρου με τις τέσσερις επαρχίες' + (useCells ? ' και τα τετράγωνα διαδρομής της εβδομάδας' : ', χρωματισμένες ανά μέση θερμοκρασία')) }) : null;
    const temps = rows.filter((x) => x.d && fin(x.temp)).map((x) => x.temp);
    const kids = [
      el('section', { class: 'rp-sec' }, el('h2', null, T('In short', 'Με δυο λόγια')),
        r.summary ? el('p', { class: 'rp-summary' }, r.summary) : el('p', { class: 'rp-none' }, T('No summary was written for this report.', 'Δεν γράφτηκε σύνοψη για αυτή την αναφορά.')),
        r.summary ? el('p', { class: 'rp-ai' }, r.ai ? T('AI summary: written by the assistant from the numbers below and checked by a teacher before release. It can be wrong; the numbers are the record.', 'Σύνοψη τεχνητής νοημοσύνης: γράφτηκε από τον βοηθό με βάση τους αριθμούς παρακάτω και ελέγχθηκε από εκπαιδευτικό πριν τη δημοσίευση. Μπορεί να έχει λάθη· οι αριθμοί είναι το αρχείο.') : T('Written by a teacher.', 'Γράφτηκε από εκπαιδευτικό.')) : null),
      el('section', { class: 'rp-sec' }, el('h2', null, T('The numbers', 'Οι αριθμοί')),
        rows.length ? numbersTable(rows) : el('p', { class: 'rp-none' }, T('This report has no numbers.', 'Αυτή η αναφορά δεν έχει αριθμούς.')),
        rows.length ? el('p', { class: 'rp-small' }, T('Weekly averages of what the school sensors read; the range in brackets is the lowest to the highest reading. Vehicle sensors measure the air around the vehicle, not the weather of the town.', 'Εβδομαδιαίοι μέσοι όροι όσων μέτρησαν οι αισθητήρες των σχολείων· το εύρος σε παρένθεση είναι από τη χαμηλότερη έως την υψηλότερη μέτρηση. Οι αισθητήρες των οχημάτων μετρούν τον αέρα γύρω από το όχημα, όχι τον καιρό της πόλης.')) : null),
      el('section', { class: 'rp-sec rp-keep' }, el('h2', null, T('Met Office warnings seen this week', 'Προειδοποιήσεις της Μετεωρολογικής που καταγράφηκαν')), warningsBlock(r)),
      el('section', { class: 'rp-sec rp-keep' }, el('h2', null, T('The island picture', 'Η εικόνα του νησιού')),
        pic ? el('figure', { class: 'rp-fig' }, pic, el('figcaption', null, useCells
          ? T('Squares show where the schools’ vehicles drove this week, about 1 km wide, from points at least 2 hours old. They are drawn about twice their true width so that they can be seen.', 'Τα τετράγωνα δείχνουν πού κινήθηκαν τα οχήματα των σχολείων αυτή την εβδομάδα, πλάτους περίπου 1 χλμ, από σημεία παλαιότερα των 2 ωρών. Σχεδιάζονται περίπου διπλάσια σε πλάτος ώστε να φαίνονται.')
          : T('Each district is coloured by the average temperature of its school’s sensors' + (temps.length ? ' (' + SC.num(Math.min(...temps), 1) + ' °C cooler end to ' + SC.num(Math.max(...temps), 1) + ' °C warmer end)' : '') + '. Colours are only comparable inside this picture.', 'Κάθε επαρχία χρωματίζεται με τη μέση θερμοκρασία των αισθητήρων του σχολείου της' + (temps.length ? ' (από ' + SC.num(Math.min(...temps), 1) + ' °C στο ψυχρότερο άκρο έως ' + SC.num(Math.max(...temps), 1) + ' °C στο θερμότερο)' : '') + '. Τα χρώματα συγκρίνονται μόνο μέσα σε αυτή την εικόνα.'))) : el('p', { class: 'rp-none' }, T('This report has no island picture.', 'Αυτή η αναφορά δεν έχει εικόνα του νησιού.'))),
    ];
    const stamp = r.status === 'released' ? T('Released' + (r.releasedAt ? ' ' + SC.date(r.releasedAt) : ''), 'Δημοσιεύτηκε' + (r.releasedAt ? ' ' + SC.date(r.releasedAt) : '')) : r.status === 'withdrawn' ? T('Withdrawn', 'Αποσύρθηκε') : T('Draft', 'Πρόχειρο');
    return sheet({ title: T('Weekly school report', 'Εβδομαδιαία αναφορά σχολείου'), sub: nameOfReport(r) + (when ? ' · ' + when : '') + (r.weekEnding ? ' (' + weekStart(r.weekEnding) + ' – ' + fmtShort(r.weekEnding) + ')' : ''), stamp, children: kids,
      foot: [el('p', null, PRIVACY()), el('p', null, SOURCES()), el('p', null, T('Weather Data Copyright The Cyprus Department of Meteorology.', 'Weather Data Copyright The Cyprus Department of Meteorology.'))] });
  }

  /* ---------- the page ---------- */
  SC.register('reports', {
    title: ['Reports', 'Αναφορές'],
    async render(root, ctx) {
      document.body.classList.add('rp-on');
      const me = ctx.me || SC.me;
      const teacher = Boolean(me && (me.role === 'teacher' || me.role === 'admin'));
      const S = { tab: ctx.query.get('tab') === 'summary' ? 'summary' : 'weekly', id: ctx.args[0] || null, list: null, listErr: null, drafts: [], schools: null, genErr: null, genBusy: false, rep: null, repErr: null, busy: null, ov: null, ovErr: null, cfg: null };
      let alive = true, timer = 0;

      const cfg = await SC.cached('/api/config', 600000).catch(() => null);
      S.cfg = cfg;
      const demoTag = cfg && cfg.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [];
      const head = SC.head({
        title: T('Reports', 'Αναφορές'), tags: demoTag,
        lede: T('A weekly report for each school and a one-page summary, both made to print on A4. A teacher checks and releases each weekly report before anyone else can see it.', 'Μια εβδομαδιαία αναφορά για κάθε σχολείο και μια σύνοψη μίας σελίδας, και οι δύο φτιαγμένες για εκτύπωση σε A4. Ένας εκπαιδευτικός ελέγχει και δημοσιεύει κάθε εβδομαδιαία αναφορά πριν τη δει οποιοσδήποτε άλλος.'),
        help: [
          'Weekly reports: open one to read it as a sheet and press Print (or Save as PDF in the print window). Teachers who are signed in can also Generate a report for one school or all, check it in Preview, Release it so that everyone can read it, or Withdraw it again. Print summary: one page for mayors, media and parents with the live school averages and the route squares of the last 24 hours. No vehicle positions and no student names are ever printed.',
          'Εβδομαδιαίες αναφορές: ανοίξτε μία για να τη διαβάσετε ως φύλλο και πατήστε Εκτύπωση (ή Αποθήκευση ως PDF στο παράθυρο εκτύπωσης). Οι εκπαιδευτικοί που έχουν συνδεθεί μπορούν επίσης να δημιουργήσουν μια αναφορά για ένα σχολείο ή για όλα, να την ελέγξουν στην Προεπισκόπηση, να τη Δημοσιεύσουν ώστε να τη διαβάζουν όλοι ή να την Αποσύρουν ξανά. Σύνοψη για εκτύπωση: μία σελίδα για δημάρχους, μέσα ενημέρωσης και γονείς με τους ζωντανούς μέσους όρους των σχολείων και τα τετράγωνα διαδρομής των τελευταίων 24 ωρών. Δεν εκτυπώνονται ποτέ θέσεις οχημάτων ούτε ονόματα μαθητών.',
        ],
      });
      head.classList.add('rp-noprint');
      const tabRow = el('div', { class: 'rp-tabs-row rp-noprint' });
      const stage = el('div', { class: 'rp-stage' }, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      root.append(head, tabRow, stage);

      /* ---------- calls ---------- */
      const rows = (r) => (r && Array.isArray(r.reports) ? r.reports : r && Array.isArray(r.items) ? r.items : Array.isArray(r) ? r : []);
      async function loadList() {
        S.listErr = null;
        try {
          let r;
          if (teacher) { try { r = await SC.api('/council/api/reports?scope=review'); } catch (e) { if (e.status === 401 || e.status === 403) throw e; r = await SC.api('/council/api/reports'); } }
          else r = await SC.api('/council/api/reports');
          const seen = new Set();
          S.list = rows(r).map(normReport).filter((x) => x && x.id && !seen.has(x.id) && seen.add(x.id));
          // drafts made in this visit that the list does not show yet
          S.drafts.forEach((d) => { if (!seen.has(d.id)) S.list.push(d); });
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
        try { const r = await SC.api('/app/api/schools/public'); S.schools = (r.schools || []).map((x) => ({ slug: x.slug, name: x.name })); }
        catch (e) { S.schools = [{ slug: 'pascal-larnaka', name: 'PASCAL Larnaka' }, { slug: 'pascal-lefkosia', name: 'PASCAL Lefkosia' }, { slug: 'pascal-limassol', name: 'PASCAL Limassol' }, { slug: 'paphos-international', name: 'International School of Paphos' }]; }
      }
      const errText = (e) => (e && e.status === 404 ? T('The weekly reports service is not switched on yet. The print summary still works.', 'Η υπηρεσία εβδομαδιαίων αναφορών δεν έχει ενεργοποιηθεί ακόμα. Η σύνοψη για εκτύπωση λειτουργεί κανονικά.') : e && e.status === 403 ? T('Only teachers can do that. Sign in on the Approvals page.', 'Μόνο οι εκπαιδευτικοί μπορούν να το κάνουν. Συνδεθείτε στη σελίδα Εγκρίσεις.') : (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.'));
      const errBox = (msg, retry) => el('div', { class: 'rp-err' }, el('div', { class: 'err', role: 'alert' }, msg), retry ? el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά'))) : null);

      /* ---------- tabs ---------- */
      function drawTabs() {
        tabRow.replaceChildren();
        if (S.id) return;
        const T2 = [['weekly', T('Weekly reports', 'Εβδομαδιαίες αναφορές')], ['summary', T('Print summary', 'Σύνοψη για εκτύπωση')]];
        tabRow.append(el('div', { class: 'nm-pillbar', role: 'tablist', 'aria-label': T('Reports', 'Αναφορές') }, T2.map(([id, label], i) => el('button', { type: 'button', role: 'tab', class: S.tab === id ? 'on' : '', 'aria-selected': S.tab === id ? 'true' : 'false', tabindex: S.tab === id ? '0' : '-1',
          onclick: () => { S.tab = id; try { history.replaceState(history.state, '', '#/reports' + (id === 'summary' ? '?tab=summary' : '')); } catch (e) { /* keep */ } start(); },
          onkeydown: (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); S.tab = T2[(i + d + 2) % 2][0]; start(); } } }, label))),
          el('span', { class: 'rp-hint' }, S.tab === 'weekly' ? T('Made to print on A4.', 'Φτιαγμένες για εκτύπωση σε A4.') : T('One page for mayors, media and parents.', 'Μία σελίδα για δημάρχους, μέσα ενημέρωσης και γονείς.')));
      }

      /* ---------- weekly: the list ---------- */
      const badge = (st) => (st === 'released' ? el('span', { class: 'nm-badge nm-badge--ok' }, T('Released', 'Δημοσιευμένη')) : st === 'withdrawn' ? el('span', { class: 'nm-badge nm-badge--bad' }, T('Withdrawn', 'Αποσυρμένη')) : el('span', { class: 'nm-badge nm-badge--warn' }, T('Draft', 'Πρόχειρο')));
      function confirmAct(kind, r) {
        const rel = kind === 'release';
        SC.modal({
          title: rel ? T('Release this report?', 'Να δημοσιευτεί η αναφορά;') : T('Withdraw this report?', 'Να αποσυρθεί η αναφορά;'),
          body: el('p', null, rel ? T('Everyone who opens this site will be able to read the weekly report for ' + nameOfReport(r) + ' (week ending ' + fmtShort(r.weekEnding) + '). Check the numbers and the summary first.', 'Όλοι όσοι ανοίγουν τον ιστότοπο θα μπορούν να διαβάσουν την εβδομαδιαία αναφορά για ' + nameOfReport(r) + ' (εβδομάδα που λήγει ' + fmtShort(r.weekEnding) + '). Ελέγξτε πρώτα τους αριθμούς και τη σύνοψη.')
            : T('The report will disappear for visitors. Teachers can still see it and release it again.', 'Η αναφορά θα εξαφανιστεί για τους επισκέπτες. Οι εκπαιδευτικοί μπορούν ακόμα να τη δουν και να τη δημοσιεύσουν ξανά.')),
          actions: [{ label: T('Cancel', 'Άκυρο') }, { label: rel ? T('Release', 'Δημοσίευση') : T('Withdraw', 'Απόσυρση'), primary: true, run: () => act(kind, r) }],
        });
      }
      async function act(kind, r) {
        S.busy = r.id; refreshView();
        try {
          const res = await SC.api('/council/api/reports/' + encodeURIComponent(r.id) + '/' + kind, { method: 'POST', body: {} });
          const upd = res && normReport(res.report || res);
          const status = upd && upd.status ? upd.status : kind === 'release' ? 'released' : 'withdrawn';
          const apply = (x) => { if (x && x.id === r.id) { x.status = status; if (kind === 'release') x.releasedAt = (upd && upd.releasedAt) || Date.now(); } };
          (S.list || []).forEach(apply); S.drafts.forEach(apply); apply(S.rep);
          SC.toast(kind === 'release' ? T('Report released.', 'Η αναφορά δημοσιεύτηκε.') : T('Report withdrawn.', 'Η αναφορά αποσύρθηκε.'));
        } catch (e) { SC.toast(errText(e)); }
        S.busy = null; refreshView();
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
          const list = (S.list || []).slice().sort((a, b) => (b.weekEnding || '').localeCompare(a.weekEnding || '') || (b.releasedAt || b.createdAt || 0) - (a.releasedAt || a.createdAt || 0));
          if (!list.length) main.append(el('div', { class: 'empty' }, teacher ? T('No weekly reports yet. Use “Generate a report” to make the first one. It stays a draft until you release it.', 'Δεν υπάρχουν ακόμα εβδομαδιαίες αναφορές. Χρησιμοποιήστε το «Δημιουργία αναφοράς» για την πρώτη. Μένει πρόχειρη μέχρι να τη δημοσιεύσετε.') : T('No weekly report has been released yet. A teacher generates a report each week and releases it here.', 'Δεν έχει δημοσιευτεί ακόμα εβδομαδιαία αναφορά. Ένας εκπαιδευτικός δημιουργεί μια αναφορά κάθε εβδομάδα και τη δημοσιεύει εδώ.')));
          let lastWeek = null;
          list.forEach((r) => {
            if (r.weekEnding !== lastWeek) { lastWeek = r.weekEnding; main.append(el('h2', { class: 'rp-week' }, r.weekEnding ? T('Week ending ' + fmtShort(r.weekEnding), 'Εβδομάδα που λήγει ' + fmtShort(r.weekEnding)) : T('Undated', 'Χωρίς ημερομηνία'))); }
            const href = '#/reports/' + encodeURIComponent(r.id);
            main.append(el('article', { class: 'nm-card nm-lift rp-item' + (r.status !== 'released' ? ' rp-dim' : '') },
              el('div', { class: 'rp-it-top' }, el('span', { class: 'nm-icon-tile' }, SC.icon('file', 22)), el('div', { class: 'rp-it-t' }, el('h3', null, nameOfReport(r)), el('div', { class: 'rp-it-m' }, teacher || r.status !== 'released' ? badge(r.status) : null, r.ai ? el('span', { class: 't ai' }, T('AI summary', 'Σύνοψη ΤΝ')) : null, r.releasedAt ? el('span', { class: 'muted' }, T('Released ' + SC.ago(r.releasedAt), 'Δημοσιεύτηκε ' + SC.ago(r.releasedAt))) : r.createdAt ? el('span', { class: 'muted' }, T('Made ' + SC.ago(r.createdAt), 'Δημιουργήθηκε ' + SC.ago(r.createdAt))) : null))),
              r.summary ? el('p', { class: 'rp-it-s' }, r.summary) : null,
              el('div', { class: 'rp-it-a' }, el('a', { class: 'nm-btn', href }, r.status === 'released' ? T('Open the report', 'Άνοιγμα αναφοράς') : T('Preview', 'Προεπισκόπηση')), actions(r))));
          });
        }
        const side = el('aside', { class: 'rp-side' }, teacher ? generateCard() : el('section', { class: 'nm-card rp-teach' }, el('div', { class: 'card-eye' }, T('Teachers', 'Εκπαιδευτικοί')), el('h2', { class: 'card-h' }, T('Who makes these reports', 'Ποιος φτιάχνει αυτές τις αναφορές')),
          el('p', null, T('A teacher generates each report from the saved data, reads it, and releases it. Until then only teachers can see it. Visitors see released reports only.', 'Ένας εκπαιδευτικός δημιουργεί κάθε αναφορά από τα αποθηκευμένα δεδομένα, τη διαβάζει και τη δημοσιεύει. Μέχρι τότε μόνο οι εκπαιδευτικοί τη βλέπουν. Οι επισκέπτες βλέπουν μόνο δημοσιευμένες αναφορές.')),
          el('a', { class: 'pill-link', href: '#/approvals' }, SC.icon('lock', 14), T('Teachers sign in here', 'Εδώ συνδέονται οι εκπαιδευτικοί'))));
        stage.append(el('div', { class: 'rp-cols' }, main, side));
      }
      function generateCard() {
        const sel = el('select', { class: 'nm-input', id: 'rp-school', 'aria-label': T('School', 'Σχολείο') }, el('option', { value: 'all' }, T('All four schools', 'Και τα τέσσερα σχολεία')), (S.schools || []).map((s) => el('option', { value: s.slug }, s.name)));
        const wk = el('input', { class: 'nm-input', id: 'rp-week', type: 'date', value: lastSunday(), max: todayStr() });
        const go = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', disabled: S.genBusy ? true : null, onclick: async () => {
          if (!ymd.test(wk.value)) { S.genErr = T('Pick the date the week ends on.', 'Επιλέξτε την ημερομηνία που λήγει η εβδομάδα.'); drawWeekly(); return; }
          S.genBusy = true; S.genErr = null; const keepS = sel.value, keepW = wk.value; drawWeekly(); document.getElementById('rp-school').value = keepS; document.getElementById('rp-week').value = keepW;
          try {
            const res = await SC.api('/council/api/reports/generate', { method: 'POST', body: { school: keepS, weekEnding: keepW } });
            const raw = res && (res.report || (Array.isArray(res.reports) ? res.reports[0] : null) || res);
            const rep = normReport(raw);
            if (rep && rep.id) { if (!rep.status || rep.status === 'released' && !raw.status) rep.status = 'draft'; S.drafts.push(rep); await loadList(); SC.toast(T('Draft report ready. Preview it, then release it.', 'Το πρόχειρο είναι έτοιμο. Δείτε την προεπισκόπηση και μετά δημοσιεύστε το.')); }
            else { await loadList(); SC.toast(T('The report was generated.', 'Η αναφορά δημιουργήθηκε.')); }
          } catch (e) { S.genErr = errText(e); }
          S.genBusy = false; if (alive && !S.id && S.tab === 'weekly') drawWeekly();
        } }, S.genBusy ? T('Generating…', 'Δημιουργία…') : T('Generate', 'Δημιουργία'));
        return el('section', { class: 'nm-card nm-card--glow rp-gen', 'aria-labelledby': 'rp-gen-h' },
          el('div', { class: 'card-eye' }, T('For teachers', 'Για εκπαιδευτικούς')), el('h2', { class: 'card-h', id: 'rp-gen-h' }, T('Generate a report', 'Δημιουργία αναφοράς')),
          el('p', { class: 'card-sub' }, T('Builds the weekly numbers from the saved data and, if the assistant is on, a short plain-language summary. The result is a draft: nobody else sees it until you release it.', 'Φτιάχνει τους εβδομαδιαίους αριθμούς από τα αποθηκευμένα δεδομένα και, αν ο βοηθός είναι ενεργός, μια σύντομη σύνοψη σε απλή γλώσσα. Το αποτέλεσμα είναι πρόχειρο: κανείς άλλος δεν το βλέπει μέχρι να το δημοσιεύσετε.')),
          el('label', { class: 'rp-lab', for: 'rp-school' }, T('School', 'Σχολείο')), sel,
          el('label', { class: 'rp-lab', for: 'rp-week' }, T('Week ending', 'Εβδομάδα που λήγει')), wk,
          S.genErr ? el('div', { class: 'err rp-generr', role: 'alert' }, S.genErr) : null,
          el('div', { class: 'rp-gen-a' }, go));
      }

      /* ---------- one report ---------- */
      function drawReport() {
        stage.replaceChildren();
        const back = el('a', { class: 'pill-link rp-noprint', href: '#/reports' }, SC.icon('arrow', 14), T('All reports', 'Όλες οι αναφορές'));
        back.firstChild.style.transform = 'scaleX(-1)';
        if (S.repErr) { stage.append(el('div', { class: 'rp-tools rp-noprint' }, back), errBox(S.repErr.status === 404 ? T('That report was not found. It may have been withdrawn.', 'Η αναφορά δεν βρέθηκε. Ίσως έχει αποσυρθεί.') : errText(S.repErr), S.repErr.status === 404 ? null : async () => { await loadReport(S.id); if (alive) drawReport(); })); return; }
        const r = S.rep; if (!r) return;
        const tools = el('div', { class: 'rp-tools rp-noprint' }, back,
          el('span', { class: 'rp-tools-sp' }),
          teacher ? badge(r.status) : null,
          el('button', { class: 'nm-btn', type: 'button', onclick: () => window.print() }, SC.icon('file', 16), T('Print or save as PDF', 'Εκτύπωση ή αποθήκευση ως PDF')),
          actions(r));
        stage.append(tools);
        if (r.status !== 'released') stage.append(el('div', { class: 'nm-callout nm-callout--warn rp-banner rp-noprint' }, r.status === 'withdrawn' ? T('This report is withdrawn. Only teachers can see it.', 'Αυτή η αναφορά έχει αποσυρθεί. Μόνο οι εκπαιδευτικοί τη βλέπουν.') : T('Draft preview. Only teachers can see this until it is released.', 'Προεπισκόπηση πρόχειρου. Μόνο οι εκπαιδευτικοί το βλέπουν μέχρι να δημοσιευτεί.')));
        if (!r.full) stage.append(el('div', { class: 'nm-callout nm-callout--warn rp-banner rp-noprint' }, T('The service sent only a summary for this report: the numbers, warnings and picture are not included, so the sheet shows what it has.', 'Η υπηρεσία έστειλε μόνο σύνοψη για αυτή την αναφορά: δεν περιλαμβάνονται αριθμοί, προειδοποιήσεις και εικόνα, οπότε το φύλλο δείχνει ό,τι έχει.')));
        stage.append(reportSheet(r));
      }

      /* ---------- the print summary (port of "5 Present") ---------- */
      function drawSummary() {
        stage.replaceChildren();
        if (S.ovErr && !S.ov) { stage.append(errBox(T('Could not load the school averages. ', 'Δεν φορτώθηκαν οι μέσοι όροι των σχολείων. ') + (S.ovErr.message || ''), async () => { stage.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); await loadOverview(); if (alive) drawSummary(); })); return; }
        const ov = S.ov, schools = ov.schools || [];
        const rowsOv = schools.map((s) => ({ id: s.id, name: s.name, d: distOf(s.id, s.name), sensors: nn(s.sensors), online: nn(s.online), temp: nn(s.temp), humidity: nn(s.humidity), co2: nn(s.co2), co2Max: null, tempMin: null, tempMax: null, readings: null }));
        const cells = []; schools.forEach((s) => (Array.isArray(s.cells) ? s.cells : []).forEach((c) => { if (Array.isArray(c) && fin(c[0]) && fin(c[1])) cells.push({ la: c[0], ln: c[1], n: fin(c[2]) ? c[2] : 1, d: distOf(s.id, s.name) }); }));
        const upd = dateOf(ov.updated);
        const tools = el('div', { class: 'rp-tools rp-noprint' }, el('span', { class: 'muted' }, upd ? T('Numbers from ' + SC.dateTime(upd), 'Αριθμοί από ' + SC.dateTime(upd)) : ''), el('span', { class: 'rp-tools-sp' }),
          el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => window.print() }, SC.icon('file', 16), T('Print', 'Εκτύπωση')));
        const noSensors = !rowsOv.some((r) => fin(r.temp) || fin(r.humidity) || fin(r.co2));
        const kids = [
          el('section', { class: 'rp-sec' }, el('h2', null, T('Four schools. One living data classroom.', 'Τέσσερα σχολεία. Μία ζωντανή τάξη δεδομένων.')),
            el('p', { class: 'rp-summary' }, T('Sensors on school buses and cars help students in Larnaka, Lefkosia, Lemesos and Pafos understand heat and air in their own cities. The numbers below are the newest readings; the picture shows where the vehicles drove in the last 24 hours.', 'Αισθητήρες σε σχολικά λεωφορεία και αυτοκίνητα βοηθούν τους μαθητές σε Λάρνακα, Λευκωσία, Λεμεσό και Πάφο να καταλάβουν τη θερμότητα και τον αέρα της πόλης τους. Οι αριθμοί παρακάτω είναι οι νεότερες μετρήσεις· η εικόνα δείχνει πού κινήθηκαν τα οχήματα τις τελευταίες 24 ώρες.'))),
          el('section', { class: 'rp-sec rp-keep' }, el('h2', null, T('The island', 'Το νησί')),
            el('figure', { class: 'rp-fig' }, islandPicture({ cells, rows: rowsOv, mode: 'squares', schools: SCHOOL_PLACES, label: T('Map of Cyprus with the four school districts and ' + cells.length + ' route squares', 'Χάρτης της Κύπρου με τις τέσσερις σχολικές επαρχίες και ' + cells.length + ' τετράγωνα διαδρομής') }),
              el('figcaption', null, cells.length ? T('Dots are schools. Squares are grouped, delayed routes (about ' + (ov.cellKm || 1) + ' km, at least ' + Math.round((ov.delayMinutes || 120) / 60) + ' hours old), drawn about twice their true width so that they can be seen.', 'Οι κουκκίδες είναι σχολεία. Τα τετράγωνα είναι ομαδοποιημένες διαδρομές με καθυστέρηση (περίπου ' + (ov.cellKm || 1) + ' χλμ, παλαιότερες των ' + Math.round((ov.delayMinutes || 120) / 60) + ' ωρών), σχεδιασμένα περίπου διπλάσια σε πλάτος ώστε να φαίνονται.') : T('Dots are schools. No route square yet: squares appear for trips that are more than 2 hours old.', 'Οι κουκκίδες είναι σχολεία. Δεν υπάρχει ακόμα τετράγωνο διαδρομής: τα τετράγωνα εμφανίζονται για διαδρομές παλαιότερες των 2 ωρών.')))),
          el('section', { class: 'rp-sec' }, el('h2', null, T('Latest averages per school', 'Τελευταίοι μέσοι όροι ανά σχολείο')), noSensors ? el('p', { class: 'rp-none' }, T('No school sensor has a reading right now.', 'Κανένας αισθητήρας σχολείου δεν έχει μέτρηση αυτή τη στιγμή.')) : numbersTable(rowsOv),
            el('p', { class: 'rp-small' }, T('Differences between schools are the start of a question, not an answer: vehicle sensors read the air around the vehicle.', 'Οι διαφορές μεταξύ σχολείων είναι η αρχή μιας ερώτησης, όχι απάντηση: οι αισθητήρες των οχημάτων μετρούν τον αέρα γύρω από το όχημα.'))),
        ];
        stage.append(tools, sheet({ title: T('Smart Cities: the one-page summary', 'Smart Cities: η σύνοψη μίας σελίδας'), sub: T('For mayors, media and parents · ' + (upd ? SC.date(upd) : ''), 'Για δημάρχους, μέσα ενημέρωσης και γονείς · ' + (upd ? SC.date(upd) : '')), stamp: T('Live numbers', 'Ζωντανοί αριθμοί'), children: kids,
          foot: [el('p', null, PRIVACY()), el('p', null, SOURCES())] }));
      }

      /* ---------- go ---------- */
      async function start() {
        drawTabs();
        stage.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        if (S.id) {
          await Promise.all([loadReport(S.id), loadSchools()]);
          if (alive) drawReport();
        } else if (S.tab === 'summary') {
          await loadOverview();
          if (alive) drawSummary();
        } else {
          await Promise.all([loadList(), teacher ? loadSchools() : null]);
          if (alive) drawWeekly();
        }
      }
      await start();
      if (S.tab === 'summary' || !S.id) timer = setInterval(async () => { if (!alive || S.id) return; if (S.tab === 'summary') { await loadOverview(); if (alive && S.tab === 'summary' && !S.genBusy) drawSummary(); } }, 120000);
      return () => { alive = false; clearInterval(timer); document.body.classList.remove('rp-on'); };
    },
  });
})();
