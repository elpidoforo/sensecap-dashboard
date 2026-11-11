/*
  Met Office record. What the Cyprus Department of Meteorology publishes, shown as published:
  warnings (with earlier versions), forecast tables, radar, sea and aviation texts, the NET list and 54 stations
  with a trend each and a station detail with a history chart. Route: #/weather and #/weather/<STATION>.
  Data: /api/dom/page, /api/dom/pages/history, /api/dom/img, /api/dom/net, /api/cydom, /api/cydom/history(.csv|/info).
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el;
  SC.css('/site/pages/weather.css');

  const HOUR = 3600000;
  const isOld = (ms) => !ms || Date.now() - ms > 3 * HOUR;
  const compass = (d) => (d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((d % 360) + 360) % 360) / 45) % 8]);
  const nice = (s) => String(s).replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  // The Met Office pages carry their logo and a quality badge; they are not worth showing again.
  const useful = (list) => (list || []).filter((u) => !/meteo_new|ISO_9001|logo|banner|spacer/i.test(u));
  const imgUrl = (name) => '/api/dom/img?name=' + encodeURIComponent(name);
  const imgByAddress = (u) => '/api/dom/img?u=' + encodeURIComponent(u);
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const when = (ms) => (ms && isFinite(ms) ? SC.dateTime(ms) : T('unknown time', 'άγνωστη ώρα'));
  const hhmm = (ms) => (ms && isFinite(ms) ? SC.time(ms) : '–');
  const fmtDur = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 90) return m + ' min';
    const hh = Math.floor(m / 60), mm = m % 60;
    return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  };

  // replaceChildren() would print an array or null as text, so flatten and skip empty values first.
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false)); return el; };

  function errBox(whatEn, whatEl, e, retry) {
    return h('div', { class: 'err', role: 'alert' },
      T('Could not load ' + whatEn + '. ', 'Δεν ήταν δυνατή η φόρτωση ' + whatEl + '. '), e && e.message ? h('span', { class: 'wx-errmsg' }, e.message + ' ') : null,
      h('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά')));
  }
  function pic(src, alt) {
    const wrap = h('div', { class: 'wx-picwrap' });
    const img = h('img', { class: 'wx-pic', src, alt, loading: 'lazy' });
    img.addEventListener('error', () => fill(wrap, h('p', { class: 'wx-miss', role: 'status' }, T('This picture is not available from the Met Office right now.', 'Αυτή η εικόνα δεν είναι διαθέσιμη αυτή τη στιγμή από την Μετεωρολογική Υπηρεσία.'))));
    wrap.append(img);
    return wrap;
  }
  function sourceLine(page) {
    return h('p', { class: 'wx-hint' }, T('Read from ', 'Διαβάστηκε από '),
      page.url ? h('a', { class: 'wx-lnk', href: page.url, target: '_blank', rel: 'noopener' }, T('the Met Office page', 'τη σελίδα της Υπηρεσίας')) : T('the Met Office page', 'τη σελίδα της Υπηρεσίας'),
      ' ' + SC.ago(Date.parse(page.fetched)) + '.');
  }
  // chips: [[id, label]]; returns { el, set }
  function chipRow(items, current, onPick, label) {
    const row = h('div', { class: 'wx-chips', role: 'group', 'aria-label': label });
    const btns = new Map();
    const set = (id) => btns.forEach((b, k) => { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); });
    items.forEach(([id, text]) => {
      const b = h('button', { class: 'wx-chip', type: 'button', 'aria-pressed': 'false', onclick: () => { set(id); onPick(id); } }, text);
      btns.set(id, b); row.append(b);
    });
    set(current);
    return { el: row, set };
  }
  // draws into box by calling run() (async, returns nodes). Shows loading and error states; refresh keeps old content on failure.
  function loader(box, whatEn, whatEl, run) {
    let first = true;
    const go = async (silent) => {
      if (!silent || first) fill(box, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      try { const nodes = await run(); fill(box, nodes); first = false; }
      catch (e) { if (first || !silent) { fill(box, errBox(whatEn, whatEl, e, () => go(false))); first = false; } }
    };
    go(false);
    return go;
  }

  SC.register('weather', {
    title: ['Met Office record', 'Μετεωρολογικό αρχείο'],
    render(root, ctx) {
      let alive = true;
      const timers = [];
      const every = (fn, ms) => timers.push(setInterval(() => { if (alive && !document.hidden) fn(); }, ms));

      const feedMeta = h('span', { class: 'wx-meta-a' });
      const pageMeta = h('span', { class: 'wx-meta-b' });
      root.append(SC.head({
        title: T('Met Office record', 'Μετεωρολογικό αρχείο'),
        fresh: T('Official source', 'Επίσημη πηγή'),
        lede: T('What the Cyprus Department of Meteorology publishes: warnings, the forecast, radar, sea and aviation texts, and readings from its weather stations. We show it as published and never change it. Our own sensors sit beside it on the other pages.',
          'Όσα δημοσιεύει το Τμήμα Μετεωρολογίας Κύπρου: προειδοποιήσεις, πρόγνωση, ραντάρ, κείμενα για τη θάλασσα και την αεροπλοΐα, και μετρήσεις από τους μετεωρολογικούς του σταθμούς. Τα εμφανίζουμε όπως δημοσιεύονται και δεν τα αλλάζουμε. Οι δικοί μας αισθητήρες βρίσκονται δίπλα τους στις άλλες σελίδες.'),
        help: ['Everything here comes from the Cyprus Department of Meteorology (dom.org.cy). Use the buttons under the title to jump to warnings, the forecast tables, the radar picture, the sea and aviation texts or the weather stations. Click a station to see its history, download it as a CSV file, or open it on the map. Our server keeps its own copy of each station reading, about every 10 minutes, so history charts are possible.',
          'Όλα εδώ προέρχονται από το Τμήμα Μετεωρολογίας Κύπρου (dom.org.cy). Χρησιμοποιήστε τα κουμπιά κάτω από τον τίτλο για να μεταβείτε στις προειδοποιήσεις, τους πίνακες πρόγνωσης, το ραντάρ, τα κείμενα για τη θάλασσα και την αεροπλοΐα ή τους μετεωρολογικούς σταθμούς. Πατήστε έναν σταθμό για να δείτε το ιστορικό του, να το κατεβάσετε ως αρχείο CSV ή να τον ανοίξετε στον χάρτη. Ο διακομιστής μας κρατά δικό του αντίγραφο κάθε μέτρησης σταθμού, περίπου ανά 10 λεπτά, ώστε να υπάρχουν διαγράμματα ιστορικού.'],
      }));

      /* ---------- section pills ---------- */
      const SECTIONS = [['warnings', T('Warnings', 'Προειδοποιήσεις')], ['forecast', T('Forecast', 'Πρόγνωση')], ['radar', T('Radar', 'Ραντάρ')], ['sea', T('Sea and aviation', 'Θάλασσα και αεροπλοΐα')], ['stations', T('Stations', 'Σταθμοί')]];
      const pills = h('nav', { class: 'nm-pillbar wx-pills', 'aria-label': T('Sections of the Met Office record', 'Ενότητες του μετεωρολογικού αρχείου') });
      const pillBtn = new Map();
      const setPill = (id) => pillBtn.forEach((b, k) => { b.classList.toggle('on', k === id); if (k === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      const secEl = {};
      SECTIONS.forEach(([id, label]) => {
        const b = h('button', { type: 'button', onclick: () => { setPill(id); secEl[id].scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); } }, label);
        pillBtn.set(id, b); pills.append(b);
      });
      root.append(h('div', { class: 'wx-tabs-row' }, pills, h('span', { class: 'wx-meta' }, feedMeta, pageMeta)));
      const sec = (id, ...kids) => { const s = h('section', { class: 'wx-sec', id: 'wx-' + id, 'aria-label': SECTIONS.find((x) => x[0] === id)[1] }, ...kids); secEl[id] = s; return s; };

      /* ---------- warnings ---------- */
      const warnBox = h('div');
      const oldBox = h('div', { class: 'wx-old', hidden: true });
      const oldBtn = h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', 'aria-expanded': 'false', onclick: () => toggleOld() }, T('Earlier versions, last 30 days', 'Προηγούμενες εκδόσεις, τελευταίες 30 ημέρες'));
      let oldLoaded = false, warnChecked = null;
      async function drawWarnings() {
        const p = await SC.api('/api/dom/page?name=warnings');
        const text = (p.text || '').trim();
        // With nothing in force the page shows only its heading ("ISSUED WEATHER WARNINGS").
        const none = text.replace(/\s+/g, ' ').length < 40;
        warnChecked = Date.parse(p.fetched);
        pageMeta.textContent = ' · ' + T('warnings page checked ', 'η σελίδα προειδοποιήσεων ελέγχθηκε ') + hhmm(warnChecked);
        const icon = h('span', { class: 'wx-wn-ic' + (none ? '' : ' warn') }, SC.icon(none ? 'check' : 'bell'));
        const levels = h('p', null, T('The Department warns at three levels: ', 'Το Τμήμα εκδίδει προειδοποιήσεις σε τρία επίπεδα: '),
          h('span', { class: 'wx-lv' }, h('i', { style: { background: '#F0B94A' } }), T('yellow', 'κίτρινο')), ', ', h('span', { class: 'wx-lv' }, h('i', { style: { background: '#F28C3F' } }), T('orange', 'πορτοκαλί')), T(' and ', ' και '),
          h('span', { class: 'wx-lv' }, h('i', { style: { background: '#FF5C6C' } }), T('red', 'κόκκινο')), '. ',
          none ? T('Its warnings page lists none right now.', 'Η σελίδα προειδοποιήσεών του δεν αναφέρει καμία αυτή τη στιγμή.') : T('Read the text below, exactly as published.', 'Διαβάστε το κείμενο παρακάτω, όπως ακριβώς δημοσιεύεται.'));
        const head = h('div', { class: 'wx-wn nm-callout ' + (none ? 'nm-callout--ok' : 'nm-callout--warn'), role: 'status' }, icon,
          h('div', { class: 'wx-wn-body' },
            h('div', null, h('b', null, none ? T('No warnings in force.', 'Δεν υπάρχουν ενεργές προειδοποιήσεις.') : T('Warnings may be in force.', 'Ενδέχεται να ισχύουν προειδοποιήσεις.')),
              h('span', { class: 'wx-when' + (none ? '' : ' warn') }, T('Checked ', 'Έλεγχος ') + when(warnChecked) + ' · ' + SC.ago(warnChecked))), levels),
          oldBtn);
        const extra = [];
        if (!none) extra.push(h('pre', { class: 'wx-txt' }, text));
        useful(p.images).slice(0, 4).forEach((u) => extra.push(pic(imgByAddress(u), T('Picture from the Met Office warnings page', 'Εικόνα από τη σελίδα προειδοποιήσεων της Υπηρεσίας'))));
        extra.push(h('p', { class: 'wx-hint' }, T('Read from the Met Office ', 'Διαβάστηκε από τη '), h('a', { class: 'wx-lnk', href: p.url, target: '_blank', rel: 'noopener' }, T('warnings page', 'σελίδα προειδοποιήσεων')), ' ' + SC.ago(warnChecked) + T('. This server keeps a copy whenever the text changes.', '. Ο διακομιστής κρατά αντίγραφο κάθε φορά που αλλάζει το κείμενο.')));
        return [head, ...extra];
      }
      const reloadWarnings = loader(warnBox, 'the warnings', 'των προειδοποιήσεων', drawWarnings);
      async function loadOld() {
        fill(oldBox, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const v = (await SC.api('/api/dom/pages/history?name=warnings&days=30')).slice().reverse().slice(0, 20);
          oldLoaded = true;
          if (!v.length) { fill(oldBox, h('div', { class: 'empty' }, T('No earlier versions are saved yet. The server saves one each time the warnings text changes.', 'Δεν έχουν αποθηκευτεί ακόμη προηγούμενες εκδόσεις. Ο διακομιστής αποθηκεύει μία κάθε φορά που αλλάζει το κείμενο των προειδοποιήσεων.'))); return; }
          fill(oldBox, h('p', { class: 'wx-hint' }, T(v.length + ' saved versions, newest first.', v.length + ' αποθηκευμένες εκδόσεις, οι νεότερες πρώτα.')),
            v.map((x) => h('details', { class: 'wx-ver' }, h('summary', null, when(x.t) + ' · ' + ((x.text || '').replace(/\s+/g, ' ').slice(0, 90) || T('empty', 'κενό'))), h('pre', { class: 'wx-txt' }, x.text || ''))));
        } catch (e) { fill(oldBox, errBox('the earlier versions', 'των προηγούμενων εκδόσεων', e, loadOld)); }
      }
      function toggleOld() {
        const open = oldBox.hidden;
        oldBox.hidden = !open; oldBtn.setAttribute('aria-expanded', String(open));
        if (open && !oldLoaded) loadOld();
      }
      root.append(sec('warnings', warnBox, oldBox));

      /* ---------- forecast tables ---------- */
      const fcPic = h('div');
      let fcId = 'table_a';
      const drawFc = (id) => {
        fcId = id;
        fill(fcPic, pic(imgUrl(id), T('Met Office forecast, table ' + id.slice(-1).toUpperCase(), 'Πρόγνωση Μετεωρολογικής Υπηρεσίας, πίνακας ' + id.slice(-1).toUpperCase())),
          h('p', { class: 'wx-hint' }, h('a', { class: 'wx-lnk', href: imgUrl(id), target: '_blank', rel: 'noopener' }, T('Open the picture full size', 'Άνοιγμα της εικόνας σε πλήρες μέγεθος')),
            ' · ' + T('Pictures published by the Met Office, shown through this server.', 'Εικόνες που δημοσιεύει η Μετεωρολογική Υπηρεσία, εμφανίζονται μέσω του διακομιστή μας.')));
      };
      const fcChips = chipRow([['table_a', T('Table A', 'Πίνακας Α')], ['table_b', T('Table B', 'Πίνακας Β')], ['table_c', T('Table C', 'Πίνακας Γ')]], fcId, drawFc, T('Forecast tables', 'Πίνακες πρόγνωσης'));
      drawFc(fcId);
      root.append(sec('forecast', h('div', { class: 'nm-card wx-br' },
        h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Forecast · the Department’s tables', 'Πρόγνωση · οι πίνακες του Τμήματος')), h('span', { class: 'wx-sp' }), fcChips.el),
        fcPic)));

      /* ---------- radar ---------- */
      const radBox = h('div', { class: 'wx-radar' });
      const radStamp = h('span', { class: 'wx-tag wx-tag-r' });
      let radId = 'radar', radLoaded = 0;
      const drawRadar = (bust) => {
        radLoaded = Date.now();
        const names = { radar: T('Cyprus', 'Κύπρος'), radar_anim: T('Animation', 'Κίνηση'), radar_pfo: T('Paphos', 'Πάφος'), radar_lca: T('Larnaca', 'Λάρνακα') };
        const img = h('img', { class: 'wx-radar-img', src: imgUrl(radId) + (bust ? '&r=' + Date.now() : ''), alt: T('Met Office radar picture, ' + names[radId], 'Εικόνα ραντάρ της Μετεωρολογικής Υπηρεσίας, ' + names[radId]) });
        img.addEventListener('error', () => fill(radBox, h('p', { class: 'wx-miss', role: 'status' }, T('This radar picture is not available from the Met Office right now. Try again in a few minutes.', 'Αυτή η εικόνα ραντάρ δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγα λεπτά.'))));
        fill(radBox, img, h('span', { class: 'wx-tag wx-tag-l' }, T('Rain radar · ', 'Ραντάρ βροχής · ') + names[radId]), radStamp);
        fill(radStamp, h('i'), T('Loaded ', 'Φορτώθηκε ') + hhmm(radLoaded));
      };
      const radChips = chipRow([['radar', T('Cyprus', 'Κύπρος')], ['radar_anim', T('Animation', 'Κίνηση')], ['radar_pfo', T('Paphos', 'Πάφος')], ['radar_lca', T('Larnaca', 'Λάρνακα')]], radId, (id) => { radId = id; drawRadar(false); }, T('Radar pictures', 'Εικόνες ραντάρ'));
      drawRadar(false);
      const radarCard = h('div', { class: 'nm-card wx-br wx-radar-card' },
        h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Radar · rain over Cyprus', 'Ραντάρ · βροχή πάνω από την Κύπρο')), h('span', { class: 'wx-sp' }), radChips.el),
        radBox,
        h('p', { class: 'wx-cap' }, T('The picture is published by the Department and updates about every 10 minutes. ', 'Η εικόνα δημοσιεύεται από το Τμήμα και ανανεώνεται περίπου ανά 10 λεπτά. '),
          h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', onclick: () => drawRadar(true) }, T('Reload picture', 'Ανανέωση εικόνας'))));
      every(() => drawRadar(true), 600000);

      /* ---------- sea and aviation ---------- */
      const SEA = [['sea_a', T('Sea A', 'Θάλασσα Α')], ['sea_b', T('Sea B', 'Θάλασσα Β')], ['sea_c', T('Sea C', 'Θάλασσα Γ')], ['sea_d', T('Sea D', 'Θάλασσα Δ')], ['navtex', 'NAVTEX'], ['fir', T('Flight information region', 'Περιοχή πληροφοριών πτήσεων')], ['laf', T('Aviation (LAF)', 'Αεροπορικά (LAF)')]];
      const seaBox = h('div');
      let seaId = 'sea_a', seaToken = 0;
      async function drawSea() {
        const my = ++seaToken, id = seaId;
        fill(seaBox, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const p = await SC.api('/api/dom/page?name=' + id);
          if (my !== seaToken || !alive) return;
          const text = (p.text || '').trim();
          fill(seaBox, 
            p.title ? h('h3', { class: 'wx-h3' }, p.title) : null,
            text ? h('pre', { class: 'wx-txt' }, text) : h('div', { class: 'empty' }, T('This Met Office page has no text right now.', 'Αυτή η σελίδα της Υπηρεσίας δεν έχει κείμενο αυτή τη στιγμή.')),
            useful(p.images).slice(0, 3).map((u) => pic(imgByAddress(u), T('Picture from the Met Office page', 'Εικόνα από τη σελίδα της Υπηρεσίας'))),
            sourceLine(p));
        } catch (e) { if (my === seaToken && alive) fill(seaBox, errBox('this page', 'αυτής της σελίδας', e, drawSea)); }
      }
      const seaChips = chipRow(SEA, seaId, (id) => { seaId = id; drawSea(); }, T('Sea and aviation texts', 'Κείμενα θάλασσας και αεροπλοΐας'));
      drawSea();
      every(drawSea, 300000);

      /* ---------- NET (feels like) ---------- */
      const netBox = h('div'), netInner = h('div');
      const netState = { rows: [], time: null, all: false, order: -1, sort: { key: 'net', dir: -1 } };
      function drawNet() {
        const rows = netState.rows;
        const sorted = rows.filter((r) => r.net != null).sort((a, b) => (a.net - b.net) * -netState.order);   // order -1: warmest first
        const vals = sorted.map((r) => r.net), lo = Math.min(...vals), hi = Math.max(...vals);
        const list = h('ul', { class: 'wx-net' }, sorted.slice(0, 8).map((r) => {
          const tt = hi > lo ? (r.net - lo) / (hi - lo) : 0.5;
          return h('li', { title: [r.temp != null ? SC.num(r.temp) + ' °C' : '', r.hum != null ? SC.num(r.hum, 0) + ' %' : '', r.wind != null ? SC.num(r.wind) + ' kn' : ''].filter(Boolean).join(' · ') },
            h('span', { class: 'wx-net-n' }, nice(r.station)), h('span', { class: 'wx-net-tr', 'aria-hidden': 'true' }, h('i', { style: { width: Math.round(8 + 92 * tt) + '%' } })), h('b', null, SC.num(r.net)));
        }));
        const order = chipRow([['warm', T('Warmest first', 'Πρώτα τα θερμότερα')], ['cool', T('Coolest first', 'Πρώτα τα δροσερότερα')]], netState.order === -1 ? 'warm' : 'cool', (id) => { netState.order = id === 'warm' ? -1 : 1; drawNet(); }, T('Order', 'Σειρά'));
        const tableBtn = h('button', { class: 'nm-btn', type: 'button', 'aria-expanded': String(netState.all), onclick: () => { netState.all = !netState.all; drawNet(); } }, netState.all ? T('Hide the table', 'Απόκρυψη πίνακα') : T('Show all ' + rows.length + ' stations', 'Εμφάνιση και των ' + rows.length + ' σταθμών'));
        const parts = [
          h('p', { class: 'wx-sub' }, T('Net effective temperature mixes temperature, humidity and wind into one number. Higher feels warmer. Reference time ' + (netState.time ? when(netState.time) : 'unknown') + ' (' + rows.length + ' stations). The Met Office explains the official comfort bands on its site.',
            'Η καθαρή ενεργός θερμοκρασία συνδυάζει θερμοκρασία, υγρασία και άνεμο σε έναν αριθμό. Όσο μεγαλύτερος, τόσο πιο ζεστά αισθάνεται κανείς. Ώρα αναφοράς ' + (netState.time ? when(netState.time) : 'άγνωστη') + ' (' + rows.length + ' σταθμοί). Η Υπηρεσία εξηγεί τα επίσημα επίπεδα άνεσης στον ιστότοπό της.')),
          order.el, list, h('div', { class: 'wx-actions' }, tableBtn)];
        if (netState.all) {
          const cols = [['station', T('Station', 'Σταθμός'), (r) => r.station, (r) => nice(r.station)], ['temp', T('Temperature °C', 'Θερμοκρασία °C'), (r) => r.temp, (r) => SC.num(r.temp)], ['hum', T('Humidity %', 'Υγρασία %'), (r) => r.hum, (r) => SC.num(r.hum, 0)],
            ['wind', T('Wind kn', 'Άνεμος kn'), (r) => r.wind, (r) => SC.num(r.wind)], ['net', 'NET', (r) => r.net, (r) => SC.num(r.net)]];
          const col = cols.find((c) => c[0] === netState.sort.key) || cols[4];
          const all = rows.slice().sort((a, b) => { const x = col[2](a), y = col[2](b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * netState.sort.dir; });
          parts.push(h('div', { class: 'nm-table-wrap wx-scroll' }, h('table', { class: 'nm-table wx-table' },
            h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c[0] === 'station' ? '' : 'n', 'aria-sort': netState.sort.key === c[0] ? (netState.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
              h('button', { class: 'wx-th', type: 'button', onclick: () => { netState.sort = { key: c[0], dir: netState.sort.key === c[0] ? -netState.sort.dir : (c[0] === 'station' ? 1 : -1) }; drawNet(); } }, c[1] + (netState.sort.key === c[0] ? (netState.sort.dir > 0 ? ' ▲' : ' ▼') : '')))))),
            h('tbody', null, all.map((r) => h('tr', null, cols.map((c) => h('td', { class: c[0] === 'station' ? '' : 'n' }, c[3](r)))))))));
        }
        fill(netInner, ...parts);
      }
      const reloadNet = loader(netBox, 'the feels-like list', 'της λίστας αίσθησης θερμοκρασίας', async () => {
        const n = await SC.api('/api/dom/net');
        netState.rows = n.rows || []; netState.time = n.time ? Date.parse(n.time) : null;
        if (!netState.rows.length) return h('div', { class: 'empty' }, T('The Met Office list has no stations right now.', 'Η λίστα της Υπηρεσίας δεν έχει σταθμούς αυτή τη στιγμή.'));
        drawNet();
        return netInner;
      });
      every(() => reloadNet(true), 600000);
      const netCard = h('div', { class: 'nm-card wx-br' }, h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Feels like (NET)', 'Αίσθηση θερμοκρασίας (NET)'))), netBox);

      root.append(h('div', { class: 'wx-row' },
        sec('radar', radarCard),
        h('div', { class: 'wx-col' },
          sec('sea', h('div', { class: 'nm-card wx-br' },
            h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Sea and aviation', 'Θάλασσα και αεροπλοΐα'))), seaChips.el, seaBox)),
          netCard)));

      /* ---------- stations ---------- */
      const S = { points: [], stationCount: 0, feedTime: null, copyright: '', q: '', sel: null, key: 'temp', hours: 24, sort: { key: 'name', dir: 1 }, trend: new Map(), hist: new Map(), token: 0, info: null };
      const tableBody = h('tbody');
      const tableHead = h('thead');
      const countEl = h('span', { class: 'wx-sub' });
      const search = h('input', { class: 'nm-input', type: 'search', placeholder: T('Search stations', 'Αναζήτηση σταθμών'), 'aria-label': T('Search stations', 'Αναζήτηση σταθμών') });
      search.addEventListener('input', () => { S.q = search.value; drawTable(); });
      const titleEl = h('span', { class: 'kpi-label' }, T('Stations', 'Σταθμοί'));
      const histNote = h('p', { class: 'wx-hint' });
      const tableWrap = h('div', { class: 'nm-table-wrap wx-scroll' }, h('table', { class: 'nm-table wx-table wx-st', id: 'wx-sttable' }, tableHead, tableBody));
      const stState = h('div');
      const detailCard = h('div', { class: 'nm-card wx-br wx-detail', id: 'wx-detail' });

      const COLS = [
        { k: 'name', label: T('Station', 'Σταθμός'), get: (p) => p.name },
        { k: 'temp', label: T('Temp °C', 'Θερμ. °C'), get: (p) => p.temp },
        { k: 'hum', label: T('Humidity %', 'Υγρασία %'), get: (p) => p.hum },
        { k: 'ws', label: T('Wind m/s', 'Άνεμος m/s'), get: (p) => p.ws },
        { k: 'trend', label: T('Last 24 h', 'Τελευταίες 24 ώρες'), get: null },
      ];
      function drawTable() {
        const q = S.q.trim().toLowerCase();
        const rows = q ? S.points.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : S.points;
        countEl.textContent = rows.length === S.points.length ? T(rows.length + ' stations', rows.length + ' σταθμοί') : T(rows.length + ' of ' + S.points.length + ' stations', rows.length + ' από ' + S.points.length + ' σταθμούς');
        fill(tableHead, h('tr', null, COLS.map((c) => h('th', { class: c.k === 'name' ? '' : 'n', 'aria-sort': S.sort.key === c.k ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
          c.get ? h('button', { class: 'wx-th', type: 'button', onclick: () => { S.sort = { key: c.k, dir: S.sort.key === c.k ? -S.sort.dir : (c.k === 'name' ? 1 : -1) }; drawTable(); } }, c.label + (S.sort.key === c.k ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : '')) : c.label))));
        const col = COLS.find((c) => c.k === S.sort.key) || COLS[0];
        const sorted = rows.slice().sort((a, b) => {
          const x = col.get(a), y = col.get(b);
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.sort.dir;
        });
        fill(tableBody, sorted.map((p) => {
          const tm = p.time ? Date.parse(p.time) : null, old = isOld(tm);
          const tr = h('tr', { class: p.id === S.sel ? 'sel' : '', 'data-id': p.id },
            h('td', null, h('button', { class: 'wx-stbtn', type: 'button', 'aria-current': p.id === S.sel ? 'true' : null, onclick: (e) => { e.stopPropagation(); selectStation(p.id, true); } }, h('span', { class: 'wx-nm1' }, p.name)),
              h('div', { class: 'wx-nm2' + (old ? ' old' : '') }, tm ? (old ? T('Reading ' + hhmm(tm) + ', old', 'Μέτρηση ' + hhmm(tm) + ', παλιά') : hhmm(tm) + ' · ' + SC.ago(tm)) : T('no reading time', 'χωρίς ώρα μέτρησης'))),
            h('td', { class: 'n' }, h('b', null, SC.num(p.temp))), h('td', { class: 'n' }, SC.num(p.hum, 0)),
            h('td', { class: 'n' }, p.ws == null ? '–' : [SC.num(p.ws), h('small', null, compass(p.wd))]),
            h('td', { class: 'n wx-spk' }, trendCell(p.id)));
          tr.addEventListener('click', () => selectStation(p.id, true));
          return tr;
        }));
        if (!rows.length) tableBody.append(h('tr', null, h('td', { colspan: String(COLS.length), class: 'wx-none' }, T('No station with that name.', 'Κανένας σταθμός με αυτό το όνομα.'))));
      }
      function trendCell(id) {
        const pts = S.trend.get(id);
        if (!pts || pts.length < 3) return S.trend.size ? h('span', { class: 'wx-sub' }, '–') : '';
        const s = SCChart.spark(pts, { w: 92, h: 26, color: SCChart.COLORS[1], area: false });
        s.setAttribute('role', 'img');
        s.removeAttribute('aria-hidden');
        s.setAttribute('aria-label', T('Temperature, last 24 hours: from ' + SC.num(pts[0]) + ' to ' + SC.num(pts[pts.length - 1]) + ' °C', 'Θερμοκρασία, τελευταίες 24 ώρες: από ' + SC.num(pts[0]) + ' έως ' + SC.num(pts[pts.length - 1]) + ' °C'));
        return s;
      }
      // One CSV for all stations gives every trend in a single request.
      async function loadTrends() {
        try {
          const text = await SC.api('/api/cydom/history.csv?days=1', { text: true });
          const lines = text.replace(/^﻿/, '').split('\n');
          const head = (lines[0] || '').split(',');
          const iT = head.findIndex((c) => /^temp\b/.test(c)), iS = head.indexOf('station'), iU = head.indexOf('time_utc');
          if (iT < 0 || iS < 0 || iU < 0) return;
          const m = new Map();
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const c = lines[i].split(',');
            const v = c[iT] === '' || c[iT] == null ? NaN : Number(c[iT]);
            if (!isFinite(v)) continue;
            if (!m.has(c[iS])) m.set(c[iS], []);
            m.get(c[iS]).push(v);
          }
          m.forEach((v, k) => { const step = Math.max(1, Math.round(v.length / 48)); m.set(k, v.filter((x, i) => i % step === 0 || i === v.length - 1)); });
          S.trend = m;
          if (alive) drawTable();
        } catch (e) { /* the trend column stays empty; the table itself is fine */ }
      }
      async function loadInfo() {
        try {
          const i = await SC.api('/api/cydom/history/info');
          S.info = i;
          const first = i.firstT ? SC.date(i.firstT) : null;
          fill(histNote, first ? T('This server saves every new reading (about every 10 minutes). History starts ' + first + ': ' + i.files + ' days saved, ' + i.stations + ' stations.', 'Ο διακομιστής αποθηκεύει κάθε νέα μέτρηση (περίπου ανά 10 λεπτά). Το ιστορικό ξεκινά στις ' + first + ': ' + i.files + ' ημέρες αποθηκευμένες, ' + i.stations + ' σταθμοί.')
            : T('This server saves every new reading, about every 10 minutes. No history has been saved yet.', 'Ο διακομιστής αποθηκεύει κάθε νέα μέτρηση, περίπου ανά 10 λεπτά. Δεν έχει αποθηκευτεί ακόμη ιστορικό.'),
          i.persistent === false ? h('span', { class: 'wx-banner' }, T('This server has no storage volume, so the saved history is lost whenever it restarts.', 'Αυτός ο διακομιστής δεν έχει όγκο αποθήκευσης, οπότε το ιστορικό χάνεται σε κάθε επανεκκίνηση.')) : null);
        } catch (e) { histNote.textContent = ''; }
      }
      async function loadStations(silent) {
        try {
          const d = await SC.api('/api/cydom');
          S.points = d.points || []; S.stationCount = d.stationCount || S.points.length; S.feedTime = d.feedTime ? Date.parse(d.feedTime) : null; S.copyright = d.copyright || '';
          if (!alive) return;
          const old = S.feedTime && isOld(S.feedTime);
          fill(feedMeta, S.feedTime ? T('Newest station reading ' + hhmm(S.feedTime) + (old ? ', which is old' : ''), 'Νεότερη μέτρηση σταθμού ' + hhmm(S.feedTime) + (old ? ', η οποία είναι παλιά' : '')) : T('No station reading time', 'Χωρίς ώρα μέτρησης σταθμών'));
          feedMeta.classList.toggle('old', Boolean(old));
          titleEl.textContent = T('Stations · ' + S.points.length + ' reporting', 'Σταθμοί · ' + S.points.length + ' με μετρήσεις');
          fill(stState, !S.points.length ? h('div', { class: 'empty' }, T('The Met Office feed has no station readings right now. Try again in a few minutes.', 'Η πηγή της Υπηρεσίας δεν έχει μετρήσεις σταθμών αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγα λεπτά.')) : null);
          if (!S.sel && S.points.length && !S.picked) {   // show a station by default so the detail card is not empty
            const def = S.points.find((x) => /larnaca.*airport|airport.*larnaca/i.test(x.id + ' ' + x.name)) || S.points.slice().sort((a, b) => a.name.localeCompare(b.name))[0];
            S.sel = def.id; S.picked = true;
          }
          drawTable();
          if (S.sel) {
            const cur = S.points.find((x) => x.id === S.sel), sig = cur ? cur.time : 'none';
            if (!silent || sig !== S.sig) { S.sig = sig; S.hist.clear(); drawDetail(); }   // a refresh only redraws the detail when its reading changed
          }
        } catch (e) {
          if (!alive) return;
          if (S.sel && !S.points.length) drawDetail();   // the saved history can still be shown
          if (!S.points.length) fill(stState, errBox('the stations', 'των σταθμών', e, () => { fill(stState, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); loadStations(false); }));
          feedMeta.textContent = T('Station readings could not be loaded', 'Δεν φορτώθηκαν οι μετρήσεις σταθμών');
        }
      }

      /* ----- station detail ----- */
      const KEYS = [
        ['temp', T('Temperature', 'Θερμοκρασία'), 1], ['hum', T('Humidity', 'Υγρασία'), 0], ['ws10', T('Wind 10 m', 'Άνεμος 10 m'), 1], ['ws2', T('Wind 2 m', 'Άνεμος 2 m'), 1],
        ['pmsl', T('Pressure', 'Πίεση'), 1], ['pstn', T('Station pressure', 'Πίεση σταθμού'), 1], ['rain10', T('Rain (10 min)', 'Βροχή (10 λεπτά)'), 1], ['dsr', T('Direct sun', 'Άμεσος ήλιος'), 0], ['tmax', T('Day max', 'Μέγιστη ημέρας'), 1], ['tmin', T('Day min', 'Ελάχιστη ημέρας'), 1],
      ];
      const COLORS = { temp: SCChart.COLORS[1], hum: SCChart.COLORS[0], ws10: SCChart.COLORS[2], ws2: SCChart.COLORS[2], pmsl: SCChart.COLORS[3], pstn: SCChart.COLORS[3], rain10: '#4CCBEA', dsr: SCChart.COLORS[4], tmax: SCChart.COLORS[1], tmin: SCChart.COLORS[0] };
      const pointsOf = (s, key) => { const i = s.keys.indexOf(key); return i < 0 ? [] : s.rows.filter((r) => r[i + 1] != null).map((r) => ({ t: r[0], v: Number(r[i + 1]) })); };
      function loadHist(id, hours) {
        const k = id + '|' + hours;
        if (!S.hist.has(k)) {
          const p = SC.api('/api/cydom/history?station=' + encodeURIComponent(id) + '&hours=' + hours);
          S.hist.set(k, p); p.catch(() => S.hist.delete(k));
        }
        return S.hist.get(k);
      }
      function gapBands(pts, gap) {
        const bands = [];
        for (let i = 1; i < pts.length; i++) if (pts[i].t - pts[i - 1].t > gap) bands.push({ from: pts[i - 1].t, to: pts[i].t, label: pts[i].t - pts[i - 1].t >= 90 * 60000 ? T('No readings', 'Χωρίς μετρήσεις') : '' });
        return bands;
      }
      function selectStation(id, scroll) {
        S.sel = id; S.hist.clear();
        try { history_replace('#/weather/' + encodeURIComponent(id)); } catch (e) { /* the address stays as it is */ }
        drawTable(); drawDetail();
        if (scroll && window.matchMedia('(max-width: 1180px)').matches) detailCard.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      }
      const history_replace = (hash) => window.history.replaceState(null, '', hash);

      async function drawDetail() {
        const my = ++S.token;
        const p = S.points.find((x) => x.id === S.sel);
        if (!S.sel) {
          fill(detailCard, h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Station detail', 'Λεπτομέρειες σταθμού'))), h('div', { class: 'empty' }, T('Choose a station in the table to see its readings and history.', 'Επιλέξτε έναν σταθμό στον πίνακα για να δείτε τις μετρήσεις και το ιστορικό του.')));
          return;
        }
        const name = p ? p.name : nice(S.sel);
        const tm = p && p.time ? Date.parse(p.time) : null, old = isOld(tm);
        const stats = p ? [
          [T('Humidity', 'Υγρασία'), SC.num(p.hum, 0), '%'],
          [T('Wind 10 m', 'Άνεμος 10 m'), p.ws == null ? '–' : SC.num(p.ws) + (p.wd != null ? ' ' + compass(p.wd) : ''), 'm/s'],
          [T('Pressure', 'Πίεση'), SC.num(p.pmsl, 0), 'hPa'],
          [T('Rain, 24 h', 'Βροχή, 24 ώρες'), SC.num(p.rain24), 'mm'],
          [T('Today max / min', 'Σήμερα μέγ. / ελάχ.'), p.tmax != null && p.tmin != null ? SC.num(p.tmax) + ' / ' + SC.num(p.tmin) : '–', '°C'],
        ] : [];
        const big = h('div', { class: 'wx-d-big' }, h('span', { class: 'wx-bt' }, p ? SC.num(p.temp) : '–'), h('span', { class: 'wx-bu' }, '°C'), h('div', { class: 'wx-bd' }));
        const chipsBox = h('div'), chartBox = h('div', { class: 'wx-chart' }, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))), noteBox = h('p', { class: 'wx-hint' });
        const rangeBtns = h('span', { class: 'wx-rng', role: 'group', 'aria-label': T('Period', 'Περίοδος') });
        const csvLink = h('a', { class: 'nm-btn', download: '', href: '#' }, SC.icon('download', 17), h('span'));
        fill(detailCard, 
          h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Station detail', 'Λεπτομέρειες σταθμού'))),
          h('div', { class: 'wx-d-head' }, h('div', null, h('h2', { class: 'wx-d-name' }, name),
            h('p', { class: 'wx-sub' }, tm ? T('Reading ' + when(tm) + ' (' + SC.ago(tm) + ')', 'Μέτρηση ' + when(tm) + ' (' + SC.ago(tm) + ')') : T('No current reading in the Met Office feed', 'Καμία τρέχουσα μέτρηση στην πηγή της Υπηρεσίας'))),
            p ? h('span', { class: 'nm-badge ' + (old ? 'nm-badge--warn' : 'nm-badge--ok') }, old ? T('Old reading', 'Παλιά μέτρηση') : T('Up to date', 'Ενημερωμένη')) : null),
          big,
          p ? h('div', { class: 'wx-d-stats' }, stats.map(([k, v, u]) => h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, h('small', null, ' ' + u))))) : null,
          chipsBox,
          h('div', { class: 'wx-d-chart-h' }, h('b', { class: 'wx-chart-title' }), rangeBtns),
          chartBox, noteBox,
          h('div', { class: 'wx-d-btns' }, csvLink, h('a', { class: 'nm-btn nm-btn--primary', href: '#/map?station=' + encodeURIComponent(S.sel) }, SC.icon('pin', 17), T('Open on the map', 'Άνοιγμα στον χάρτη'))),
          p && p.obs && p.obs.length ? h('details', { class: 'wx-all' }, h('summary', null, T('All ' + p.obs.length + ' readings in the feed', 'Και οι ' + p.obs.length + ' μετρήσεις της πηγής')),
            h('div', { class: 'nm-table-wrap' }, h('table', { class: 'nm-table wx-table' }, h('tbody', null, p.obs.map((o) => h('tr', null, h('td', null, o.name), h('td', { class: 'n' }, SC.num(o.value, 2) + ' ' + (/celcius|celsius/i.test(o.unit) ? '°C' : o.unit || ''))))))))
            : null);
        if (!p) detailCard.querySelector('.wx-d-head .wx-sub').after(h('p', { class: 'wx-sub' }, T('This station is not in the latest feed, so only saved history can be shown.', 'Αυτός ο σταθμός δεν βρίσκεται στην πιο πρόσφατη πηγή, οπότε μπορεί να εμφανιστεί μόνο το αποθηκευμένο ιστορικό.')));
        // the 24 h numbers next to the big temperature
        const drawBig = async () => {
          try {
            const s24 = await loadHist(S.sel, 24);
            if (my !== S.token) return;
            const tp = pointsOf(s24, 'temp');
            const bd = big.querySelector('.wx-bd');
            if (!tp.length) { bd.textContent = ''; return; }
            const last = tp[tp.length - 1];
            const ref = tp.reduce((b, q) => (Math.abs(q.t - (last.t - 3 * HOUR)) < Math.abs(b.t - (last.t - 3 * HOUR)) ? q : b), tp[0]);
            const lo = Math.min(...tp.map((q) => q.v)), hi = Math.max(...tp.map((q) => q.v));
            const lines = [];
            if (last.t - ref.t > 2 * HOUR && last.t - ref.t < 4 * HOUR) { const d = last.v - ref.v; lines.push(T((d >= 0 ? 'Up ' : 'Down ') + SC.num(Math.abs(d)) + ' °C in the last 3 hours', (d >= 0 ? 'Ανεβαίνει ' : 'Κατεβαίνει ') + SC.num(Math.abs(d)) + ' °C τις τελευταίες 3 ώρες'), h('br')); }
            lines.push(T('Last 24 h: low ', 'Τελευταίες 24 ώρες: χαμηλότερη '), h('b', null, SC.num(lo)), T(', high ', ', υψηλότερη '), h('b', null, SC.num(hi)));
            fill(bd, ...lines);
            if (!p) big.querySelector('.wx-bt').textContent = SC.num(last.v);
          } catch (e) { /* the big number alone is fine */ }
        };
        drawBig();
        const draw = async () => {
          fill(rangeBtns, [[24, T('24 h', '24 ώρες')], [168, T('7 days', '7 ημέρες')], [720, T('30 days', '30 ημέρες')]].map(([n, label]) => h('button', { type: 'button', class: n === S.hours ? 'on' : '', 'aria-pressed': String(n === S.hours), onclick: () => { S.hours = n; drawDetail(); } }, label)));
          csvLink.href = '/api/cydom/history.csv?station=' + encodeURIComponent(S.sel) + '&days=' + Math.ceil(S.hours / 24);
          csvLink.querySelector('span').textContent = T('Download CSV', 'Λήψη CSV') + ' (' + (S.hours === 24 ? T('24 hours', '24 ώρες') : T(S.hours / 24 + ' days', S.hours / 24 + ' ημέρες')) + ')';
          try {
            const s = await loadHist(S.sel, S.hours);
            if (my !== S.token) return;
            const avail = KEYS.filter((k) => pointsOf(s, k[0]).length > 1);
            if (!avail.length) {
              fill(chipsBox);
              fill(chartBox, h('div', { class: 'empty' }, T('Not enough readings saved for this period yet. The server saves a reading every 10 minutes, so check back soon.', 'Δεν έχουν αποθηκευτεί αρκετές μετρήσεις για αυτή την περίοδο. Ο διακομιστής αποθηκεύει μία μέτρηση ανά 10 λεπτά, οπότε ελέγξτε ξανά σύντομα.')));
              noteBox.textContent = ''; detailCard.querySelector('.wx-chart-title').textContent = '';
              return;
            }
            if (!avail.some((k) => k[0] === S.key)) S.key = avail[0][0];
            const label = (KEYS.find((k) => k[0] === S.key) || [])[1] || S.key;
            fill(chipsBox, h('div', { class: 'wx-chips wx-detail-chips', role: 'group', 'aria-label': T('Reading to chart', 'Μέτρηση για το διάγραμμα') },
              avail.map(([k, l]) => h('button', { type: 'button', class: 'wx-chip' + (k === S.key ? ' on' : ''), 'aria-pressed': String(k === S.key), onclick: () => { S.key = k; draw(); } }, l))));
            let unit = (s.units[S.key] || {}).unit || '', f = 1;
            if (/^kn/i.test(unit)) { f = 0.514444; unit = 'm/s'; }
            let pts = pointsOf(s, S.key).map((q) => ({ t: q.t, v: q.v * f }));
            const all = pts;
            if (pts.length > 1500) { const st = Math.ceil(pts.length / 1200); pts = pts.filter((q, i) => i % st === 0 || i === pts.length - 1); }
            detailCard.querySelector('.wx-chart-title').textContent = label + ', ' + (S.hours === 24 ? T('last 24 hours', 'τελευταίες 24 ώρες') : T('last ' + S.hours / 24 + ' days', 'τελευταίες ' + S.hours / 24 + ' ημέρες'));
            const bands = gapBands(pts, HOUR);
            SCChart.line(chartBox, [{ name: label, color: COLORS[S.key] || SCChart.COLORS[0], pts, area: S.key === 'rain10' }], { unit, dec: (KEYS.find((k) => k[0] === S.key) || [0, 0, 1])[2], w: Math.max(300, Math.round(chartBox.getBoundingClientRect().width) || 460), h: 240, label: name + ', ' + label, band: bands, latest: T('Latest ', 'Τελευταία ') });
            const lastT = all[all.length - 1].t;
            const bits = [];
            if (bands.length) bits.push(T(bands.length + (bands.length === 1 ? ' gap' : ' gaps') + ' with no readings (longest ' + fmtDur(Math.max(...bands.map((b) => b.to - b.from))) + '). The line is left open there.', bands.length + (bands.length === 1 ? ' κενό' : ' κενά') + ' χωρίς μετρήσεις (το μεγαλύτερο ' + fmtDur(Math.max(...bands.map((b) => b.to - b.from))) + '). Η γραμμή μένει ανοιχτή εκεί.'));
            if (isOld(lastT)) bits.push(T('The newest saved reading is from ' + when(lastT) + ' (' + SC.ago(lastT) + ').', 'Η νεότερη αποθηκευμένη μέτρηση είναι από ' + when(lastT) + ' (' + SC.ago(lastT) + ').'));
            if (S.key === 'rain10') { const sum = all.reduce((a, q) => a + q.v, 0); bits.push(T('Rain saved in this period: ' + SC.num(sum) + ' mm (the sum of the 10-minute readings we hold).', 'Βροχή που αποθηκεύτηκε στην περίοδο: ' + SC.num(sum) + ' mm (άθροισμα των μετρήσεων 10 λεπτών που διαθέτουμε).')); }
            if (/^kn/i.test((s.units[S.key] || {}).unit || '')) bits.push(T('The Department publishes this wind in knots; it is shown here in m/s.', 'Το Τμήμα δημοσιεύει αυτόν τον άνεμο σε κόμβους· εδώ εμφανίζεται σε m/s.'));
            bits.push(T('Point at the chart to read a value.', 'Στρέψτε τον δείκτη στο διάγραμμα για να διαβάσετε μια τιμή.'));
            noteBox.textContent = bits.join(' ');
            noteBox.classList.toggle('old', isOld(lastT));
          } catch (e) {
            if (my !== S.token) return;
            fill(chartBox, errBox('the history', 'του ιστορικού', e, () => { S.hist.clear(); draw(); }));
          }
        };
        draw();
      }

      const stCard = h('div', { class: 'nm-card wx-br nm-table-card wx-stcard' },
        h('div', { class: 'wx-ch' }, titleEl, h('span', { class: 'wx-sp' }), h('span', { class: 'wx-sub' }, T('Saved about every 10 minutes', 'Αποθηκεύονται περίπου ανά 10 λεπτά'))),
        histNote,
        h('div', { class: 'wx-tools' }, h('label', { class: 'wx-search' }, SC.icon('search', 17), search), countEl),
        h('div', { class: 'wx-csv' }, h('a', { class: 'wx-lnk', href: '/api/cydom/history.csv?days=1', download: '' }, T('All stations, 24 h (CSV)', 'Όλοι οι σταθμοί, 24 ώρες (CSV)')), h('a', { class: 'wx-lnk', href: '/api/cydom/history.csv?days=7', download: '' }, T('7 days (CSV)', '7 ημέρες (CSV)'))),
        stState, tableWrap,
        h('p', { class: 'wx-legend' }, h('i'), T('Amber means the newest reading is more than 3 hours old. Click a row to see its history.', 'Το κεχριμπαρί σημαίνει ότι η νεότερη μέτρηση είναι παλαιότερη από 3 ώρες. Πατήστε μια γραμμή για να δείτε το ιστορικό.')));
      fill(stState, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      if (ctx.args && ctx.args[0]) { S.sel = ctx.args[0]; fill(detailCard, h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Station detail', 'Λεπτομέρειες σταθμού'))), h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); } else drawDetail();
      root.append(sec('stations', h('div', { class: 'wx-st-grid' }, stCard, detailCard)));
      const src = h('p', { class: 'wx-src' }, T('Source: Cyprus Department of Meteorology, ', 'Πηγή: Τμήμα Μετεωρολογίας Κύπρου, '), h('a', { class: 'wx-lnk', href: 'https://www.dom.org.cy', target: '_blank', rel: 'noopener' }, 'dom.org.cy'),
        T('. Shown as published. ', '. Εμφανίζεται όπως δημοσιεύεται. '), h('span', { class: 'wx-copy' }, T('Weather data copyright The Cyprus Department of Meteorology', 'Τα μετεωρολογικά δεδομένα ανήκουν στο Τμήμα Μετεωρολογίας Κύπρου')),
        T('. We keep our own copy of each station reading so the charts can show history. Check the Department’s terms before using the data outside a classroom.', '. Κρατάμε δικό μας αντίγραφο κάθε μέτρησης σταθμού ώστε τα διαγράμματα να δείχνουν ιστορικό. Ελέγξτε τους όρους του Τμήματος πριν χρησιμοποιήσετε τα δεδομένα εκτός τάξης.'));
      root.append(src);

      /* ---------- start ---------- */
      (async () => {
        await loadStations(false);
        if (S.sel) {
          setPill('stations');
          setTimeout(() => { if (alive) secEl.stations.scrollIntoView({ behavior: 'auto', block: 'start' }); }, 60);
        }
      })();
      loadTrends(); loadInfo();
      every(() => loadStations(true), 300000);
      every(() => { reloadWarnings(true); }, 300000);
      every(loadTrends, 600000);
      setPill(ctx.args && ctx.args[0] ? 'stations' : 'warnings');

      // the pill follows the section in view
      let observer = null;
      if ('IntersectionObserver' in window) {
        const visible = new Map();
        observer = new IntersectionObserver((entries) => {
          entries.forEach((e) => visible.set(e.target.id.replace('wx-', ''), e.isIntersecting));
          const first = SECTIONS.map((x) => x[0]).find((id) => visible.get(id));
          if (first) setPill(first);
        }, { rootMargin: '-25% 0px -55% 0px' });
        SECTIONS.forEach(([id]) => secEl[id] && observer.observe(secEl[id]));
      }

      return () => { alive = false; timers.forEach(clearInterval); if (observer) observer.disconnect(); };
    },
  });
})();
