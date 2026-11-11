/*
  Data archive: the history this site keeps on its own, days stored, coverage, downloads.
  Route: #/archive.
  Data: GET /api/archive { updated, cydom:{ firstDay, lastDay, days:[{day, readings}], stations, readings, bytes },
        pages:{ firstDay, lastDay, versions:{ <page>: n } }, downloads:[{label, url}] } and /api/cydom/history/info (retention, volume).
  The CSV builder uses /api/cydom/history.csv?days=. School sensor history is NOT kept here; it lives at SenseCAP.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/archive.css');

  const DAY = 86400000;
  const loc = () => (SC.lang === 'el' ? 'el-GR' : 'en-GB');
  const fmtInt = (n) => (n == null || !isFinite(n) ? '–' : new Intl.NumberFormat(loc()).format(Math.round(n)));
  const parseDay = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dayFull = (ms) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  const dayShort = (ms) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(ms);
  const dayYear = (ms) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
  const monthName = (ms) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', month: 'short' }).format(ms);
  const weekdayName = (ms) => new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', weekday: 'short' }).format(ms);
  function bytesText(n) {
    if (n == null || !isFinite(n)) return '–';
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  const errMsg = (e) => (e && e.message) || T('Something went wrong.', 'Κάτι πήγε στραβά.');
  const PAGE_NAMES = {
    warnings: [T('Weather warnings', 'Προειδοποιήσεις καιρού')], sea_a: [T('Sea forecast, area A', 'Πρόγνωση θάλασσας, περιοχή Α')], sea_b: [T('Sea forecast, area B', 'Πρόγνωση θάλασσας, περιοχή Β')],
    sea_c: [T('Sea forecast, area C', 'Πρόγνωση θάλασσας, περιοχή Γ')], sea_d: [T('Sea forecast, area D', 'Πρόγνωση θάλασσας, περιοχή Δ')], navtex: ['NAVTEX'],
    fir: [T('Aviation, FIR forecast', 'Αεροπλοΐα, πρόγνωση FIR')], laf: [T('Local area forecast', 'Πρόγνωση τοπικής περιοχής')], net: [T('Discomfort index', 'Δείκτης δυσφορίας')],
  };
  const pageName = (k) => (PAGE_NAMES[k] ? PAGE_NAMES[k][0] : String(k).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
  const warnId = () => 'warnings';

  /* ---------- coverage calendar ---------- */
  function coverage(a) {
    const rows = ((a.cydom && a.cydom.days) || []).filter((d) => parseDay(d.day) != null);
    const map = new Map(rows.map((d) => [d.day, Number(d.readings) || 0]));
    const withData = rows.filter((d) => d.readings > 0);
    if (!withData.length) return null;
    const first = Math.min(...rows.map((d) => parseDay(d.day)));
    const lastData = Math.max(...withData.map((d) => parseDay(d.day)));
    const today = parseDay(keyOf(Date.now()));
    const end = Math.max(lastData, today);
    const startWeek = first - ((new Date(first).getUTCDay() + 6) % 7) * DAY;
    const weeks = Math.ceil((end - startWeek + DAY) / (7 * DAY));
    // A "full day" is the busiest finished day, so a short day (a restart, an outage) shows lighter.
    const finished = rows.filter((d) => d.day !== keyOf(today)).map((d) => d.readings);
    const full = Math.max(1, ...(finished.length ? finished : rows.map((d) => d.readings)));
    // longest run of days without readings inside the range
    let gap = null, run = null;
    for (let t = first; t <= end; t += DAY) {
      const r = map.get(keyOf(t)) || 0;
      if (r === 0 && t !== today) { if (!run) run = { from: t, to: t }; else run.to = t; if (!gap || run.to - run.from > gap.to - gap.from) gap = { from: run.from, to: run.to }; } else run = null;
    }
    const days = Math.round((end - first) / DAY) + 1;
    return { map, first, end, today, startWeek, weeks, full, gap, days, daysWith: withData.length, missing: Math.max(0, days - withData.length) };
  }
  const level = (r, full) => (!r ? 0 : r / full < 0.25 ? 1 : r / full < 0.5 ? 2 : r / full < 0.85 ? 3 : 4);

  function calendarCard(a, info) {
    const cv = coverage(a);
    const card = h('section', { class: 'nm-card ar-card ar-calcard', 'aria-labelledby': 'ar-cal-h' });
    card.append(h('div', { class: 'ar-ch' },
      h('div', null, h('p', { class: 'card-eye' }, T('Coverage calendar', 'Ημερολόγιο κάλυψης')), h('h2', { class: 'card-h', id: 'ar-cal-h' }, T('Which days have Met Office readings', 'Ποιες ημέρες έχουν μετρήσεις της Υπηρεσίας'))),
      h('span', { class: 't arch' }, T('Kept by this site', 'Κρατιέται από τον ιστότοπο'))));
    if (!cv) {
      card.append(h('div', { class: 'empty' }, T('No days are saved yet. The server saves the Met Office station readings every 10 minutes; the first day appears here after the first save. If this stays empty, ask a teacher to check the Feed list.', 'Δεν έχει αποθηκευτεί καμία ημέρα ακόμη. Ο διακομιστής αποθηκεύει τις μετρήσεις των σταθμών της Υπηρεσίας κάθε 10 λεπτά· η πρώτη ημέρα εμφανίζεται εδώ μετά την πρώτη αποθήκευση. Αν παραμείνει κενό, ζητήστε από έναν εκπαιδευτικό να ελέγξει τη Λίστα πηγών.')));
      return { card, stale: false, fit: () => {} };
    }
    const dDate = h('div', { class: 'ar-d-date' }), dNum = h('div', { class: 'ar-d-num mono' }), dSub = h('div', { class: 'ar-d-sub' });
    const readout = h('div', { class: 'ar-detail', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'kpi-label' }, T('Day', 'Ημέρα')), dDate, dNum, dSub);
    const show = (t) => {
      const r = cv.map.get(keyOf(t)) || 0;
      dDate.textContent = dayFull(t);
      dNum.textContent = r ? fmtInt(r) : '0';
      if (t === cv.today) dSub.textContent = r ? T('readings so far today, still filling', 'μετρήσεις μέχρι στιγμής σήμερα, συνεχίζει να γεμίζει') : T('no readings yet today', 'καμία μέτρηση ακόμη σήμερα');
      else if (!r) dSub.textContent = T('readings saved: none this day', 'αποθηκευμένες μετρήσεις: καμία αυτή την ημέρα');
      else dSub.textContent = T('readings saved, ' + Math.round((r / cv.full) * 100) + '% of a full day', 'αποθηκευμένες μετρήσεις, ' + Math.round((r / cv.full) * 100) + '% μιας πλήρους ημέρας');
    };
    const cells = new Map();   // day key -> button
    let selected = null;

    const labelFor = (t) => {
      const k = keyOf(t), r = cv.map.get(k) || 0;
      const base = dayFull(t);
      if (t === cv.today) return base + ': ' + (r ? T(fmtInt(r) + ' readings so far today', fmtInt(r) + ' μετρήσεις μέχρι στιγμής σήμερα') : T('no readings yet today', 'καμία μέτρηση ακόμη σήμερα'));
      if (!r) return base + ': ' + T('no readings saved', 'καμία αποθηκευμένη μέτρηση');
      const pct = Math.round((r / cv.full) * 100);
      return base + ': ' + T(fmtInt(r) + ' readings (' + pct + '% of a full day)', fmtInt(r) + ' μετρήσεις (' + pct + '% μιας πλήρους ημέρας)');
    };
    const select = (t, focus) => {
      const k = keyOf(t);
      if (!cells.has(k)) return;
      if (selected && cells.has(selected)) { cells.get(selected).tabIndex = -1; cells.get(selected).classList.remove('sel'); }
      selected = k;
      const b = cells.get(k); b.tabIndex = 0; b.classList.add('sel');
      show(t);
      if (focus) b.focus();
    };

    const grid = h('div', { class: 'ar-grid', role: 'group', 'aria-label': T('Days from ' + dayYear(cv.first) + ' to ' + dayYear(cv.end) + ', ' + cv.daysWith + ' with readings. Use the arrow keys to move between days.', 'Ημέρες από ' + dayYear(cv.first) + ' έως ' + dayYear(cv.end) + ', ' + cv.daysWith + ' με μετρήσεις. Χρησιμοποιήστε τα βέλη για να μετακινηθείτε.') });
    grid.style.setProperty('--weeks', cv.weeks);
    for (let i = 0; i < cv.weeks * 7; i++) {
      const t = cv.startWeek + i * DAY;
      if (t < cv.first || t > cv.end) { grid.append(h('span', { class: 'ar-cell void', 'aria-hidden': 'true' })); continue; }
      const r = cv.map.get(keyOf(t)) || 0;
      const b = h('button', { class: 'ar-cell l' + level(r, cv.full) + (t === cv.today ? ' today' : ''), type: 'button', tabindex: -1, 'aria-label': labelFor(t), 'aria-pressed': 'false' });
      b.addEventListener('mouseenter', () => show(t));
      b.addEventListener('mouseleave', () => { if (selected) show(parseDay(selected)); });
      b.addEventListener('click', () => select(t, false));
      b.addEventListener('focus', () => select(t, false));
      cells.set(keyOf(t), b);
      grid.append(b);
    }
    grid.addEventListener('keydown', (e) => {
      if (!selected) return;
      const step = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (step == null) return;
      e.preventDefault();
      select(parseDay(selected) + step * DAY, true);
    });

    const months = h('div', { class: 'ar-months', 'aria-hidden': 'true' });
    months.style.setProperty('--weeks', cv.weeks);
    let prevMonth = -1;
    for (let w = 0; w < cv.weeks; w++) {
      const mon = cv.startWeek + w * 7 * DAY;
      const m = new Date(mon + 3 * DAY).getUTCMonth();   // the month most of that week falls in
      if (m !== prevMonth) {
        const lab = h('span', { class: 'ar-mlabel' }, monthName(mon + 3 * DAY));
        lab.style.gridColumn = (w + 1) + ' / span 4';
        months.append(lab);
        prevMonth = m;
      }
    }
    const wd = h('div', { class: 'ar-wd', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5, 6].map((i) => h('span', null, i % 2 === 0 ? weekdayName(cv.startWeek + i * DAY) : '')));
    const scroll = h('div', { class: 'ar-scroll' }, h('div', { class: 'ar-cal' }, months, grid));
    const calwrap = h('div', { class: 'ar-calwrap' }, h('div', { class: 'ar-wdcol' }, h('div', { class: 'ar-mspace' }), wd), scroll);
    card.append(h('div', { class: 'ar-calbody' }, calwrap, readout));
    const lg = h('div', { class: 'ar-legend' },
      h('span', { class: 'ar-lg' }, h('i', { class: 'ar-cell l0' }), T('no readings', 'καμία μέτρηση')),
      h('span', { class: 'ar-lg' }, T('Fewer', 'Λιγότερες'), h('i', { class: 'ar-cell l1' }), h('i', { class: 'ar-cell l2' }), h('i', { class: 'ar-cell l3' }), h('i', { class: 'ar-cell l4' }), T('More', 'Περισσότερες')),
      h('span', { class: 'ar-lg-n' }, T('A full day is about ' + fmtInt(cv.full) + ' readings (every 10 minutes, all stations).', 'Μια πλήρης ημέρα είναι περίπου ' + fmtInt(cv.full) + ' μετρήσεις (ανά 10 λεπτά, όλοι οι σταθμοί).')));
    card.append(lg);
    // facts, only what the data says
    const facts = h('ul', { class: 'ar-facts' });
    facts.append(h('li', null, h('b', null, cv.daysWith + ' / ' + cv.days), ' ' + T('days have readings, ' + dayYear(cv.first) + ' to ' + dayYear(cv.end) + '.', 'ημέρες έχουν μετρήσεις, ' + dayYear(cv.first) + ' έως ' + dayYear(cv.end) + '.')));
    if (cv.gap && cv.gap.to - cv.gap.from >= DAY) facts.append(h('li', null, h('b', null, (Math.round((cv.gap.to - cv.gap.from) / DAY) + 1) + ' ' + T('days', 'ημέρες')), ' ' + T('is the longest stretch without readings (' + dayShort(cv.gap.from) + ' to ' + dayShort(cv.gap.to) + '). The server was off or the Met Office feed was down.', 'είναι το μεγαλύτερο διάστημα χωρίς μετρήσεις (' + dayShort(cv.gap.from) + ' έως ' + dayShort(cv.gap.to) + '). Ο διακομιστής ήταν εκτός λειτουργίας ή η πηγή της Υπηρεσίας δεν λειτουργούσε.')));
    else if (cv.missing === 0) facts.append(h('li', null, T('No gaps: every day in this range has readings.', 'Χωρίς κενά: κάθε ημέρα σε αυτό το διάστημα έχει μετρήσεις.')));
    const lastData = Math.max(...Array.from(cv.map.entries()).filter(([, r]) => r > 0).map(([k]) => parseDay(k)));
    if (cv.today - lastData >= 2 * DAY) facts.append(h('li', { class: 'warn' }, T('The newest saved day is ' + Math.round((cv.today - lastData) / DAY) + ' days old. Saving may have stopped; see the Feed list.', 'Η νεότερη αποθηκευμένη ημέρα είναι ' + Math.round((cv.today - lastData) / DAY) + ' ημερών. Η αποθήκευση μπορεί να έχει σταματήσει· δείτε τη Λίστα πηγών.')));
    if (info && info.retentionDays) facts.append(h('li', null, T('Days older than ' + info.retentionDays + ' are deleted automatically.', 'Οι ημέρες παλαιότερες από ' + info.retentionDays + ' διαγράφονται αυτόματα.')));
    card.append(facts);
    // start on the newest day with readings, so keyboard users land somewhere useful
    select(lastData, false);
    // squares grow to use the width when there are few weeks, and shrink (then scroll) when there are many
    const fit = () => {
      const avail = scroll.clientWidth - 6;
      if (avail <= 0) return;
      const cs = Math.max(12, Math.min(24, Math.floor((avail + 4) / cv.weeks) - 4));
      calwrap.style.setProperty('--cs', cs + 'px');
      scroll.scrollLeft = scroll.scrollWidth;
    };
    return { card, stale: cv.today - lastData >= 2 * DAY, fit };
  }

  /* ---------- the rest of the page ---------- */
  function tile(label, value, sub) {
    return h('div', { class: 'tile ar-tile' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-num mono' }, value), h('small', null, sub));
  }

  function pagesCard(a) {
    const card = h('section', { class: 'nm-card ar-card', 'aria-labelledby': 'ar-pg-h' });
    const pg = a.pages || {};
    const ver = Object.entries(pg.versions || {}).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]);
    card.append(h('p', { class: 'card-eye' }, T('Saved pages', 'Αποθηκευμένες σελίδες')), h('h2', { class: 'card-h', id: 'ar-pg-h' }, T('Copies of Met Office pages', 'Αντίγραφα σελίδων της Υπηρεσίας')));
    if (!ver.length) { card.append(h('div', { class: 'empty' }, T('No page copies yet. A copy is saved the first time each Met Office page is read, and again whenever its text changes.', 'Δεν υπάρχουν αντίγραφα ακόμη. Ένα αντίγραφο αποθηκεύεται την πρώτη φορά που διαβάζεται κάθε σελίδα και ξανά όταν αλλάζει το κείμενό της.'))); return card; }
    const sum = ver.reduce((n, [, v]) => n + v, 0), max = ver[0][1];
    card.append(h('p', { class: 'card-sub' }, T(fmtInt(sum) + ' versions' + (pg.firstDay ? ', ' + dayYear(parseDay(pg.firstDay)) + ' to ' + (pg.lastDay ? dayYear(parseDay(pg.lastDay)) : '–') : '') + '. A new copy is saved only when the text changes.', fmtInt(sum) + ' εκδόσεις' + (pg.firstDay ? ', ' + dayYear(parseDay(pg.firstDay)) + ' έως ' + (pg.lastDay ? dayYear(parseDay(pg.lastDay)) : '–') : '') + '. Νέο αντίγραφο αποθηκεύεται μόνο όταν αλλάζει το κείμενο.')));
    card.append(h('ul', { class: 'ar-vers' }, ver.map(([k, n]) => {
      const row = h('li', null, k === 'warnings' ? h('a', { class: 'ar-vn', href: '#/' + warnId() }, pageName(k)) : h('span', { class: 'ar-vn' }, pageName(k)),
        h('span', { class: 'ar-vbar', 'aria-hidden': 'true' }, h('i', { style: { width: Math.max(3, (n / max) * 100) + '%' } })), h('b', { class: 'mono' }, fmtInt(n)));
      return row;
    })));
    return card;
  }

  function downloadsCard(a, info, days) {
    const card = h('section', { class: 'nm-card ar-card', 'aria-labelledby': 'ar-dl-h' });
    card.append(h('p', { class: 'card-eye' }, T('Downloads', 'Λήψεις')), h('h2', { class: 'card-h', id: 'ar-dl-h' }, T('Take the data with you', 'Πάρτε τα δεδομένα μαζί σας')));
    const listed = (a.downloads || []).filter((d) => d && d.url && d.label);
    const text = (d) => (SC.lang === 'el' && d.labelEl ? d.labelEl : d.label);
    const csv = listed.filter((d) => /\.csv(\?|$)/.test(d.url)), other = listed.filter((d) => !csv.includes(d));
    if (csv.length) card.append(h('div', { class: 'ar-dl' }, csv.map((d) => h('a', { class: 'nm-btn ar-dlbtn', href: d.url, download: '' }, SC.icon('download', 18), text(d)))));
    if (other.length) {
      card.append(h('details', { class: 'ar-csvbox' },
        h('summary', null, T('Saved versions of Met Office pages (JSON, ' + other.length + ' files)', 'Αποθηκευμένες εκδόσεις σελίδων της Υπηρεσίας (JSON, ' + other.length + ' αρχεία)')),
        h('ul', { class: 'ar-dllist' }, other.map((d) => h('li', null, h('a', { class: 'ar-dla', href: d.url, download: '' }, SC.icon('download', 15), text(d)))))));
    }
    if (!listed.length) card.append(h('div', { class: 'empty' }, T('Nothing to download yet: no readings or page copies are saved.', 'Δεν υπάρχει τίποτα για λήψη ακόμη: δεν έχουν αποθηκευτεί μετρήσεις ή αντίγραφα σελίδων.')));
    // CSV of the station readings for a number of days of your choice
    const opts = [1, 7, 30, 90].filter((n) => n <= Math.max(1, days));
    let pick = opts.includes(7) ? 7 : opts[opts.length - 1] || 1;
    if (days > 0) {
      const link = h('a', { class: 'nm-btn ar-csv', href: '/api/cydom/history.csv?days=' + pick, download: '' });
      const paintLink = () => { link.replaceChildren(SC.icon('download', 18), T('Download CSV, ' + pick + (pick === 1 ? ' day' : ' days'), 'Λήψη CSV, ' + pick + (pick === 1 ? ' ημέρα' : ' ημέρες'))); link.setAttribute('href', '/api/cydom/history.csv?days=' + pick); };
      const bar = h('div', { class: 'nm-pillbar ar-pick', role: 'group', 'aria-label': T('Days to download', 'Ημέρες για λήψη') }, opts.map((n) => h('button', { type: 'button', class: n === pick ? 'on' : '', 'aria-pressed': n === pick ? 'true' : 'false', onclick: (e) => { pick = n; bar.querySelectorAll('button').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); paintLink(); } }, String(n))));
      paintLink();
      card.append(h('details', { class: 'ar-csvbox' },
        h('summary', null, T('Another number of days', 'Άλλος αριθμός ημερών')),
        h('p', { class: 'card-sub' }, T('One row per station and 10 minutes, with temperature, humidity, wind, pressure and rain. A long period can be a large file.', 'Μία γραμμή ανά σταθμό και 10 λεπτά, με θερμοκρασία, υγρασία, άνεμο, πίεση και βροχή. Μια μεγάλη περίοδος μπορεί να δώσει μεγάλο αρχείο.')),
        h('div', { class: 'ar-csvrow' }, bar, link)));
    }
    return card;
  }

  function noteCard(info, a) {
    const wrap = h('div', { class: 'ar-notes' });
    wrap.append(h('div', { class: 'nm-callout nm-callout--info ar-note' },
      h('b', null, T('What this archive is, and is not. ', 'Τι είναι και τι δεν είναι αυτό το αρχείο. ')),
      T('We keep two things ourselves: the Cyprus Met Office station readings (every 10 minutes) and a copy of each Met Office page when its text changes. The history of the school sensors lives at SenseCAP, in their service: this site shows it live and does not copy it here, so those readings are not counted on this page.', 'Κρατάμε οι ίδιοι δύο πράγματα: τις μετρήσεις των σταθμών της Μετεωρολογικής Υπηρεσίας (κάθε 10 λεπτά) και ένα αντίγραφο κάθε σελίδας της Υπηρεσίας όταν αλλάζει το κείμενό της. Το ιστορικό των αισθητήρων των σχολείων βρίσκεται στο SenseCAP, στην υπηρεσία τους: ο ιστότοπος το δείχνει ζωντανά και δεν το αντιγράφει εδώ, γι’ αυτό αυτές οι μετρήσεις δεν υπολογίζονται σε αυτή τη σελίδα.')));
    if (info && info.persistent === false) wrap.append(h('div', { class: 'nm-callout nm-callout--warn ar-note' }, h('b', null, T('No storage volume is attached. ', 'Δεν έχει συνδεθεί χώρος αποθήκευσης. ')), T('Everything on this page is lost the next time the server is updated. Ask whoever runs the server to attach a volume.', 'Ό,τι υπάρχει σε αυτή τη σελίδα χάνεται την επόμενη φορά που θα ενημερωθεί ο διακομιστής. Ζητήστε από όποιον διαχειρίζεται τον διακομιστή να συνδέσει χώρο αποθήκευσης.')));
    if (a && a.cydom && a.cydom.error) wrap.append(h('div', { class: 'nm-callout nm-callout--bad ar-note' }, h('b', null, T('The readings store reports a problem. ', 'Ο χώρος μετρήσεων αναφέρει πρόβλημα. ')), String(a.cydom.error)));
    if (a && a.pages && a.pages.error) wrap.append(h('div', { class: 'nm-callout nm-callout--bad ar-note' }, h('b', null, T('The page copies store reports a problem. ', 'Ο χώρος αντιγράφων σελίδων αναφέρει πρόβλημα. ')), String(a.pages.error)));
    if (info && info.error) wrap.append(h('div', { class: 'nm-callout nm-callout--bad ar-note' }, h('b', null, T('The history store reports a problem. ', 'Ο χώρος ιστορικού αναφέρει πρόβλημα. ')), String(info.error)));
    return wrap;
  }

  SC.register('archive', {
    title: ['Data archive', 'Αρχείο δεδομένων'],
    async render(root, ctx) {
      let alive = true, timer = 0, first = true, fit = () => {};
      const onResize = () => fit();
      window.addEventListener('resize', onResize);
      let demo = false;
      try { const c = await SC.cached('/api/config', 300000); demo = !!(c && c.demo); } catch (e) { /* no tag */ }

      const headHost = h('div');
      const body = h('div', { class: 'ar' });
      root.append(headHost, body);

      function head(a, stale) {
        const upd = a ? Number(a.updatedAt) || (isFinite(Date.parse(a.updated)) ? Date.parse(a.updated) : Number(a.updated)) || null : null;
        headHost.replaceChildren(SC.head({
          title: T('The history we keep.', 'Το ιστορικό που κρατάμε.'),
          lede: T('Met Office readings and page copies saved by this site: how many days, where the gaps are, and how to download them. School sensor history stays at SenseCAP.', 'Μετρήσεις και αντίγραφα σελίδων της Μετεωρολογικής Υπηρεσίας που αποθηκεύει ο ιστότοπος: πόσες ημέρες, πού υπάρχουν κενά και πώς να τα κατεβάσετε. Το ιστορικό των αισθητήρων των σχολείων μένει στο SenseCAP.'),
          fresh: upd ? T('Updated ' + SC.ago(upd), 'Ενημερώθηκε ' + SC.ago(upd)) : null,
          tags: demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
          help: [
            'This page shows what the site stores on its own disk. The calendar has one square per day: darker means more Met Office readings were saved that day, an empty square means none. Hover or use the arrow keys to read a day. The two download boxes give you the files. Readings from the school sensors are not stored here; they stay at SenseCAP.',
            'Αυτή η σελίδα δείχνει ό,τι αποθηκεύει ο ιστότοπος στον δικό του δίσκο. Το ημερολόγιο έχει ένα τετράγωνο ανά ημέρα: πιο σκούρο σημαίνει περισσότερες μετρήσεις της Υπηρεσίας εκείνη την ημέρα, κενό τετράγωνο σημαίνει καμία. Περάστε το δείκτη ή χρησιμοποιήστε τα βέλη για να διαβάσετε μια ημέρα. Τα δύο πλαίσια λήψης δίνουν τα αρχεία. Οι μετρήσεις των αισθητήρων των σχολείων δεν αποθηκεύονται εδώ· μένουν στο SenseCAP.',
          ],
        }));
        const pill = headHost.querySelector('.fresh-pill');
        if (pill && stale) pill.classList.add('ar-stale');
      }

      async function load() {
        if (first) body.replaceChildren(h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const [a, info] = await Promise.all([SC.api('/api/archive'), SC.api('/api/cydom/history/info').catch(() => null)]);
          if (!alive) return;
          first = false;
          const cy = a.cydom || {};
          const cal = calendarCard(a, info);
          head(a, cal.stale);
          const daysStored = (cy.days || []).filter((d) => d.readings > 0).length;
          const spanDays = cy.firstDay ? Math.max(1, Math.round((parseDay(keyOf(Date.now())) - parseDay(cy.firstDay)) / DAY) + 1) : 0;
          const tiles = h('div', { class: 'cols-4 ar-tiles' },
            tile(T('Days stored', 'Ημέρες αποθηκευμένες'), fmtInt(daysStored), cy.firstDay ? T('first day ' + dayYear(parseDay(cy.firstDay)) + (cy.lastDay ? ', latest ' + dayYear(parseDay(cy.lastDay)) : ''), 'πρώτη ημέρα ' + dayYear(parseDay(cy.firstDay)) + (cy.lastDay ? ', τελευταία ' + dayYear(parseDay(cy.lastDay)) : '')) : T('nothing saved yet', 'τίποτα ακόμη')),
            tile(T('Readings saved', 'Μετρήσεις αποθηκευμένες'), fmtInt(cy.readings), T('one per station every 10 minutes, all readings counted once', 'μία ανά σταθμό ανά 10 λεπτά')),
            tile(T('Stations', 'Σταθμοί'), fmtInt(cy.stations), T('Met Office automatic stations in the saved files', 'αυτόματοι σταθμοί της Υπηρεσίας στα αποθηκευμένα αρχεία')),
            tile(T('Size on disk', 'Μέγεθος στο δίσκο'), bytesText(cy.bytes), info && info.retentionDays ? T('kept up to ' + info.retentionDays + ' days, then deleted', 'διατηρούνται έως ' + info.retentionDays + ' ημέρες και μετά διαγράφονται') : T('Met Office readings only', 'μόνο μετρήσεις της Υπηρεσίας')));
          body.replaceChildren(tiles, cal.card, h('div', { class: 'cols-2 ar-two' }, downloadsCard(a, info, spanDays || daysStored), pagesCard(a)), noteCard(info, a));
          fit = cal.fit;
          fit();
        } catch (e) {
          if (!alive) return;
          if (!first) return;   // keep what is on screen when a refresh fails
          head(null, false);
          body.replaceChildren(h('div', { class: 'err', role: 'alert' }, T('The archive could not be loaded. ', 'Δεν ήταν δυνατή η φόρτωση του αρχείου. ') + errMsg(e) + ' ',
            h('button', { class: 'nm-btn ar-retry', type: 'button', onclick: () => { first = true; load(); } }, T('Try again', 'Δοκιμάστε ξανά'))));
        }
      }
      await load();
      timer = setInterval(load, 300000);
      return () => { alive = false; clearInterval(timer); window.removeEventListener('resize', onResize); };
    },
  });
})();
