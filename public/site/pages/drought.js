/*
  Drought watch (#/drought): the Standardized Precipitation Index (SPI) for Cyprus as PUBLISHED by the Department of Meteorology,
  nine time windows, with the seven hydrological regions and the rain so far in the water year.
  The page computes no index. It shows published sheets (public/site/data/drought.json) and says, while that is so, that the
  numbers were read from the Department's PDF sheets and are not yet confirmed against its data file.
  The animation walks the nine dots from one published sheet to a later one. It is a comparison of two sheets, labelled as such:
  the months in between are not shown and a travelling dot carries no number. Historical data, not live.
  Model: drought-data.js (tested).
*/
(function () {
  'use strict';
  const T = SC.t;
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css'); SC.css('/site/pages/drought.css');
  const LIBS = ['/site/viz/drought-data.js', '/site/viz/spilab-data.js'];
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const COL = { xdry: '#b4532a', sdry: '#d98a3a', mdry: '#e8c36a', normal: '#3a4a66', mwet: '#6fb7d9', vwet: '#3f8fd0', xwet: '#2a5fb4' };
  const BANDS = [[-3, -2, 'xdry'], [-2, -1.5, 'sdry'], [-1.5, -1, 'mdry'], [-1, 1, 'normal'], [1, 1.5, 'mwet'], [1.5, 2, 'vwet'], [2, 3, 'xwet']];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const P2 = (p) => (Array.isArray(p) ? T(p[0], p[1]) : String(p == null ? '' : p));
  const isEl = () => SC.lang === 'el';

  function build(root, data) {
    const D = SC.viz.droughtData, m = D.build(data), reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    if (!m.available) { root.append(el('p', 'dr-note', P2(m.empty))); return () => {}; }
    const fmt = (v) => D.fmt(v, isEl());
    if (!m.confirmed) root.append(el('p', 'dr-note', P2(m.confirmNote)));
    const tabs = el('div', 'dr-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', T('Which published sheet to show', 'Ποιο δημοσιευμένο φύλλο να φαίνεται')); root.append(tabs);
    const grid = el('div', 'dr'); root.append(grid);
    // the nine windows
    const c1 = el('section', 'dr-card'); grid.append(c1); const h1 = el('h2', null, T('Cyprus, nine time windows', 'Κύπρος, εννέα χρονικά παράθυρα')); h1.append(el('span', 'dr-tag', T('published, from rain gauges', 'δημοσιευμένο, από βροχόμετρα'))); c1.append(h1);
    const p1 = el('p', 'dr-hint'); c1.append(p1); const cv = el('canvas'); cv.setAttribute('role', 'img'); c1.append(cv);
    const key = el('div', 'dr-key'); m.classes.forEach((k) => { const s = el('span'); const i = el('i'); i.style.background = COL[k.id]; s.append(i, document.createTextNode(P2(k.n))); key.append(s); }); c1.append(key);
    const say = el('div', 'dr-say'); say.setAttribute('aria-live', 'polite'); c1.append(say);
    // the water year and the regions
    const c2 = el('section', 'dr-card'); grid.append(c2); c2.append(el('h2', null, T('Rain since the start of the water year', 'Βροχή από την αρχή του υδρολογικού έτους')));
    const p2 = el('p', 'dr-hint'); const big = el('div', 'dr-big'); const bigs = el('div', 'dr-sub', T('of the usual amount for these months', 'της συνηθισμένης ποσότητας για αυτούς τους μήνες')); const kv = el('div', 'dr-kv'); c2.append(p2, big, bigs, kv);
    c2.append(el('h2', null, T('The seven hydrological regions', 'Οι επτά υδρολογικές περιοχές'))); c2.append(el('p', 'dr-hint', T('The same nine windows, in the Department\'s own order. Colour is the class. This is not a ranking.', 'Τα ίδια εννέα παράθυρα, με τη σειρά του Τμήματος. Το χρώμα δείχνει την κατηγορία. Δεν είναι κατάταξη.')));
    const cv2 = el('canvas'); cv2.setAttribute('role', 'img'); c2.append(cv2); const flagP = el('p', 'dr-sub'); c2.append(flagP);
    // the table
    const c3 = el('section', 'dr-card dr-wide'); grid.append(c3); c3.append(el('h2', null, T('The same numbers as a table', 'Οι ίδιοι αριθμοί σε πίνακα'))); const p3 = el('p', 'dr-hint'); const sc = el('div', 'dr-scroll'); const tb = el('table', 'dr-table'); sc.append(tb); c3.append(p3, sc);
    const foot = el('p', 'dr-foot'); foot.append(document.createTextNode(T('Source: ', 'Πηγή: ') + P2(m.source) + '. ' + (m.method ? P2(m.method) + ' ' : '') + T('Read on ', 'Ανάγνωση στις ') + m.retrieved + '. ' + T('Historical data, not live. SPI describes rain only. The dams also depend on earlier years, on inflow and on how much water is taken out, so a wet index and low dams can be true together.', 'Ιστορικά δεδομένα, όχι ζωντανά. Ο SPI περιγράφει μόνο τη βροχή. Τα φράγματα εξαρτώνται και από προηγούμενα χρόνια, από την εισροή και από το πόσο νερό αντλείται, άρα υγρός δείκτης και χαμηλά φράγματα μπορούν να ισχύουν μαζί.') + ' '));
    if (m.sourceUrl) { const a = el('a', null, T('The Department\'s SPI sheets', 'Τα φύλλα SPI του Τμήματος')); a.href = m.sourceUrl; a.target = '_blank'; a.rel = 'noopener'; foot.append(a); } root.append(foot);

    // ---- two learning tools
    const LB = SC.viz.spilabData;
    // tool: which window answers my question?
    const c4 = el('section', 'dr-card dr-wide'); grid.append(c4); const h4 = el('h2', null, T('Which window answers my question?', 'Ποιο παράθυρο απαντά στην ερώτησή μου;')); const tag4 = el('span', 'dr-tag'); h4.append(tag4); c4.append(h4);
    c4.append(el('p', 'dr-hint', T('The index is published for nine lengths of time. Pick a question and see which lengths are usually read for it.', 'Ο δείκτης δημοσιεύεται για εννέα χρονικά μήκη. Διαλέξτε μια ερώτηση και δείτε ποια μήκη διαβάζονται συνήθως γι\' αυτήν.')));
    const chips = el('div', 'dr-tabs'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', T('Questions', 'Ερωτήσεις')); const win = el('div', 'dr-win'); const say4 = el('div', 'dr-say'); say4.setAttribute('aria-live', 'polite'); const lim4 = el('p', 'dr-lim'); c4.append(chips, win, say4, lim4);
    let qid = 'reservoirs';
    function drawReader() { const r = LB.reader(m, cur, qid); tag4.textContent = T('published values, ', 'δημοσιευμένες τιμές, ') + (r.label ? P2(r.label) : '');
      chips.textContent = ''; r.questions.forEach((q) => { const b = el('button', 'dr-tab', P2(q.q)); b.type = 'button'; b.setAttribute('aria-pressed', String(q.id === r.question.id)); b.onclick = () => { qid = q.id; drawReader(); }; chips.append(b); });
      win.textContent = ''; r.on.forEach((x) => { const d = el('div', x.lit ? 'on' : null); d.append(el('span', null, x.window + (x.window === 1 ? T(' month', ' μήνας') : T(' months', ' μήνες')))); d.append(el('b', null, fmt(x.value))); d.append(el('span', null, x.cls ? P2(x.cls.n) : T('no value', 'χωρίς τιμή'))); const i = el('i'); i.style.background = x.cls ? COL[x.cls.id] : 'transparent'; d.append(i); win.append(d); });
      say4.textContent = P2(r.say); lim4.textContent = r.limit ? T('Limit: ', 'Όριο: ') + P2(r.limit) : ''; }
    // tool: build the index by hand (practice numbers)
    const c5 = el('section', 'dr-card dr-wide'); grid.append(c5); const h5 = el('h2', null, T('Build the index by hand', 'Φτιάξτε τον δείκτη με το χέρι')); h5.append(el('span', 'dr-tag warn', T('practice numbers, not real data', 'αριθμοί εξάσκησης, όχι πραγματικά δεδομένα'))); c5.append(h5);
    c5.append(el('p', 'dr-hint', T('The dots are thirty practice winters of rain. Move the slider to choose this winter\'s rain and see where it lands among them.', 'Οι τελείες είναι τριάντα χειμώνες εξάσκησης. Μετακινήστε τον δείκτη για να διαλέξετε τη βροχή αυτού του χειμώνα και δείτε πού πέφτει ανάμεσά τους.')));
    const lab = el('div', 'dr-lab'); c5.append(lab); const lcol = el('div'), rcol = el('div'); lab.append(lcol, rcol); const cv5 = el('canvas'); cv5.setAttribute('aria-hidden', 'true');
    const sl = el('input', 'dr-slider'); sl.type = 'range'; const L0 = LB.lab(210); sl.min = String(L0.min); sl.max = String(L0.max); sl.step = '5'; sl.value = '210'; sl.setAttribute('aria-label', T('This winter\'s rain in millimetres', 'Η βροχή αυτού του χειμώνα σε χιλιοστά')); lcol.append(cv5, sl);
    const mmBig = el('div', 'dr-big'); rcol.append(el('div', 'dr-sub', T('this winter', 'αυτός ο χειμώνας')), mmBig); const steps = el('div', 'dr-steps'); rcol.append(steps); const say5 = el('div', 'dr-say'); say5.setAttribute('aria-live', 'polite'); rcol.append(say5); c5.append(el('p', 'dr-lim', P2(L0.note)));
    function drawLab() { const r = LB.lab(Number(sl.value)), w = Math.max(260, cv5.clientWidth || 280), H = 230, base = 170, dpr = Math.min(2, window.devicePixelRatio || 1); cv5.width = Math.round(w * dpr); cv5.height = Math.round(H * dpr); cv5.style.height = H + 'px'; const c = cv5.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = (mm) => 10 + (Math.max(r.min, Math.min(r.max, mm)) - r.min) / (r.max - r.min) * (w - 20), ids = ['xdry', 'sdry', 'mdry', 'normal', 'mwet', 'vwet', 'xwet']; let prev = r.min;
      ids.forEach((id, i) => { const hi = i < 6 ? r.edges[i].mm : r.max; c.fillStyle = COL[id]; c.globalAlpha = 0.3; c.fillRect(x(prev), 18, Math.max(0, x(hi) - x(prev)), base - 18); c.globalAlpha = 1; prev = Math.max(prev, hi); });
      let top = 0; for (let mm = r.min; mm <= r.max; mm += 5) top = Math.max(top, r.density(mm)); c.beginPath(); for (let mm = r.min; mm <= r.max; mm += 5) { const y = base - r.density(mm) / top * (base - 40); if (mm === r.min) c.moveTo(x(mm), y); else c.lineTo(x(mm), y); } c.strokeStyle = '#EAF0F7'; c.lineWidth = 1.5; c.stroke();
      r.practice.forEach((p, i) => { c.beginPath(); c.arc(x(p), base + 12 + (i % 3) * 7, 3.2, 0, 7); c.fillStyle = p < r.mm ? '#8fa3c0' : '#5fd4ff'; c.fill(); });
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x(r.mm), 12); c.lineTo(x(r.mm), base + 32); c.stroke();
      c.fillStyle = '#8fa3c0'; c.font = '10px ' + MONO; c.textAlign = 'center'; [100, 300, 500, 700, 900].forEach((mm) => { c.textAlign = mm === 900 ? 'right' : mm === 100 ? 'left' : 'center'; c.fillText(mm + ' mm', x(mm), H - 4); });
      mmBig.textContent = r.mm + ' mm'; steps.textContent = '';
      [[T('1. wetter winters', '1. πιο υγροί χειμώνες'), r.pctWetter + '%', T('of winters on the curve had more rain', 'των χειμώνων της καμπύλης είχαν περισσότερη βροχή'), null], [T('2. the index', '2. ο δείκτης'), fmt(r.spi), T('steps from the usual amount', 'βήματα από τη συνηθισμένη ποσότητα'), null], [T('3. the class', '3. η κατηγορία'), P2(r.cls.n), T('by the WMO table', 'κατά τον πίνακα του WMO'), r.cls.id === 'normal' ? null : COL[r.cls.id]]].forEach((s) => { const d = el('div'); d.append(el('span', 'dr-sub', s[0])); const b = el('b', null, s[1]); if (s[3]) b.style.color = s[3]; d.append(b); d.append(el('span', 'dr-sub', s[2])); steps.append(d); });
      say5.textContent = P2(r.say); sl.setAttribute('aria-valuetext', r.mm + ' mm, ' + P2(r.cls.n)); }
    sl.oninput = drawLab;
    let cur = m.sheets.length - 1, anim = null, raf = 0, dead = false, t0 = 0, Tm = 0;   // anim: { a, b } while the walk plays
    const canWalk = m.sheets.length >= 2;
    function drawLadder(state) {
      const w = Math.max(280, cv.clientWidth || 300), n = m.windows.length, narrow = w < 520, rowH = narrow ? 30 : 34, top = 40, left = narrow ? 64 : 172, right = 56, H = top + n * rowH + 26, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const x = (v) => left + (Math.max(-3, Math.min(3, v)) + 3) / 6 * (w - left - right), y0 = top, y1 = top + n * rowH;
      BANDS.forEach((b) => { c.fillStyle = COL[b[2]]; c.globalAlpha = 0.3; c.fillRect(x(b[0]), y0, x(b[1]) - x(b[0]), y1 - y0); c.globalAlpha = 1; });
      c.font = '10px ' + MONO; c.textAlign = 'center'; [-3, -2, -1, 0, 1, 2, 3].forEach((v) => { c.fillStyle = '#8fa3c0'; c.fillText((v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v), x(v), y1 + 14); c.strokeStyle = v === 0 ? 'rgba(234,240,247,.55)' : 'rgba(234,240,247,.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x(v), y0); c.lineTo(x(v), y1); c.stroke(); });
      c.fillStyle = '#8fa3c0'; c.textAlign = 'left'; c.fillText(narrow ? T('drier', 'πιο ξηρά') : T('drier than usual', 'πιο ξηρά από το συνηθισμένο'), x(-3) + 4, y0 - 8); c.textAlign = 'right'; c.fillText(narrow ? T('wetter', 'πιο υγρά') : T('wetter than usual', 'πιο υγρά από το συνηθισμένο'), x(3) - 4, y0 - 8);
      // which sheet's name stands above the picture
      c.textAlign = 'left'; c.fillStyle = state.phase === 'moving' ? '#FBBF24' : '#EAF0F7'; c.font = '700 11px ' + MONO; c.fillText(state.title, 2, 14);
      state.rows.forEach((r, i) => { if (r.shown <= 0) return; const y = y0 + i * rowH + rowH / 2; c.globalAlpha = r.shown; c.textAlign = 'left'; c.fillStyle = '#EAF0F7'; c.font = '700 12px ' + MONO; c.fillText(r.window + (narrow ? T(' mo', ' μ.') : (r.window === 1 ? T(' month', ' μήνας') : T(' months', ' μήνες'))), 2, y + (!narrow && m.reads[i] ? -1 : 4));
        if (!narrow && m.reads[i]) { c.fillStyle = '#8fa3c0'; c.font = '10px ' + MONO; c.fillText(P2(m.reads[i]), 2, y + 12); }
        // a ring where the earlier sheet had this window, once the dot has left it
        if (state.ghost && r.from != null && state.phase !== 'a') { c.strokeStyle = 'rgba(234,240,247,.55)'; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.beginPath(); c.arc(x(r.from), y, 6.5, 0, 7); c.stroke(); c.setLineDash([]); if (r.pos != null) { c.strokeStyle = 'rgba(234,240,247,.3)'; c.beginPath(); c.moveTo(x(r.from), y); c.lineTo(x(r.pos), y); c.stroke(); } }
        if (r.pos == null) { c.textAlign = 'right'; c.fillStyle = '#8fa3c0'; c.font = '11px ' + MONO; c.fillText(T('no value', 'χωρίς τιμή'), w - 2, y + 4); c.globalAlpha = 1; return; }
        if (!state.ghost) { c.strokeStyle = 'rgba(234,240,247,.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x(0), y); c.lineTo(x(r.pos), y); c.stroke(); }
        const k = r.value != null ? D.classify(r.value) : null; c.beginPath(); c.arc(x(r.pos), y, 7, 0, 7); c.fillStyle = !k ? '#ffffff' : k.id === 'normal' ? '#EAF0F7' : COL[k.id]; c.fill(); c.strokeStyle = '#070d1a'; c.lineWidth = 2; c.stroke();
        c.textAlign = 'right'; c.font = '700 12px ' + MONO; c.fillStyle = r.value != null ? '#EAF0F7' : '#8fa3c0'; c.fillText(r.value != null ? fmt(r.value) : '…', w - 2, y + 4); c.globalAlpha = 1; });
    }
    function drawRegions(s) {
      const w = Math.max(240, cv2.clientWidth || 260), rowH = 24, left = Math.min(118, w * 0.36), H = s.regions.length * rowH + 20, dpr = Math.min(2, window.devicePixelRatio || 1), n = m.windows.length;
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(H * dpr); cv2.style.height = H + 'px'; const c = cv2.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); const cw = (w - left) / n;
      c.font = '9.5px ' + MONO; c.textAlign = 'center'; c.fillStyle = '#8fa3c0'; m.windows.forEach((k, i) => c.fillText(String(k), left + i * cw + cw / 2, 10));
      s.regions.forEach((r, j) => { const y = 15 + j * rowH; c.textAlign = 'left'; c.fillStyle = '#cfe0f5'; c.font = '11px ' + MONO; let nm = P2(r.name); while (nm.length > 3 && c.measureText(nm).width > left - 6) nm = nm.slice(0, -1); c.fillText(nm, 0, y + 15);
        m.windows.forEach((k, i) => { const xx = left + i * cw + 1.5, v = r.values ? r.values[i] : null, cl = v != null ? D.classify(v) : null; if (!cl) { c.strokeStyle = '#6b7c98'; c.lineWidth = 1; c.setLineDash([3, 3]); c.strokeRect(xx + 0.5, y + 2.5, cw - 4, rowH - 6); c.setLineDash([]); return; } c.fillStyle = COL[cl.id]; c.fillRect(xx, y + 2, cw - 3, rowH - 5); }); });
      cv2.setAttribute('aria-label', T('Class of each window for the seven regions, ' + s.label[0] + '. The numbers are in the table below.', 'Κατηγορία κάθε παραθύρου για τις επτά περιοχές, ' + s.label[1] + '. Οι αριθμοί είναι στον πίνακα παρακάτω.'));
      const fl = s.regions.filter((r) => !r.values); flagP.textContent = fl.map((r) => P2(r.name) + ': ' + (r.flag ? P2(r.flag) : T('not reported.', 'δεν αναφέρθηκε.'))).join(' '); flagP.hidden = !fl.length;
    }
    function staticState(i) { const s = m.sheets[i]; return { phase: 'b', ghost: false, title: P2(s.label), rows: m.windows.map((w, k) => ({ window: w, shown: 1, from: null, to: s.cyprus[k], pos: s.cyprus[k], value: s.cyprus[k] })) }; }
    function fill(i) {
      const s = m.sheets[i]; p1.textContent = T('Each row is the rain of the last 1 to ' + m.windows[m.windows.length - 1] + ' months ending in ' + s.label[0] + ', scored against the same months of ' + m.reference[0] + '. Zero is the usual amount.', 'Κάθε γραμμή είναι η βροχή των τελευταίων 1 έως ' + m.windows[m.windows.length - 1] + ' μηνών με τέλος τον μήνα ' + s.label[1] + ', σε σύγκριση με τους ίδιους μήνες του ' + m.reference[1] + '. Το μηδέν είναι η συνηθισμένη ποσότητα.');
      say.textContent = s.say ? P2(s.say) : T('Not every window was published for this month.', 'Δεν δημοσιεύτηκαν όλα τα παράθυρα για αυτόν τον μήνα.');
      cv.setAttribute('aria-label', T('Published SPI for Cyprus, ' + s.label[0] + ': ', 'Δημοσιευμένος SPI για την Κύπρο, ' + s.label[1] + ': ') + m.windows.map((w, k) => w + T(' months ', ' μήνες ') + fmt(s.cyprus[k])).join(', '));
      p2.textContent = (s.from ? P2(s.from) + T(' to ', ' έως ') : '') + P2(s.label) + T(', island average', ', μέσος όρος νησιού'); big.textContent = s.pct == null ? '–' : s.pct + '%';
      kv.textContent = ''; [[T('fell', 'έπεσαν'), s.cumulativeMm], [T('usual', 'συνήθως'), s.usualMm]].forEach((p) => { const d = el('div'); d.append(el('span', 'dr-sub', p[0])); d.append(el('b', null, p[1] == null ? '–' : p[1].toFixed(1).replace('.', isEl() ? ',' : '.') + ' mm')); kv.append(d); });
      drawRegions(s);
      p3.textContent = T('SPI by window in months, ' + s.label[0] + '. ', 'SPI ανά παράθυρο σε μήνες, ' + s.label[1] + '. '); if (s.url) { const a = el('a', null, T('Open the Department\'s sheet for this month', 'Άνοιγμα του φύλλου του Τμήματος για αυτόν τον μήνα')); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; p3.append(a); }
      tb.textContent = ''; const hr = el('tr'); const th0 = el('th', null, T('Area', 'Περιοχή')); th0.scope = 'col'; hr.append(th0); m.windows.forEach((w) => { const th = el('th', null, String(w)); th.scope = 'col'; hr.append(th); }); tb.append(hr);
      [{ name: ['Cyprus', 'Κύπρος'], values: s.cyprus }].concat(s.regions).forEach((r) => { const tr = el('tr'); const th = el('th', null, P2(r.name)); th.scope = 'row'; tr.append(th); m.windows.forEach((w, k) => tr.append(el('td', null, r.values ? fmt(r.values[k]) : T('n/a', 'δ/υ')))); tb.append(tr); });
    }
    function setTabs() { tabs.textContent = ''; m.sheets.forEach((s, i) => { const b = el('button', 'dr-tab', P2(s.label)); b.type = 'button'; b.setAttribute('aria-pressed', String(!anim && i === cur)); b.onclick = () => { stop(); cur = i; show(); }; tabs.append(b); });
      if (canWalk && !reduce.matches) { const b = el('button', 'dr-tab', anim ? T('Stop', 'Διακοπή') : T('Play the change', 'Αναπαραγωγή της αλλαγής')); b.type = 'button'; b.setAttribute('aria-pressed', String(!!anim)); b.onclick = () => { if (anim) { stop(); show(); } else play(); }; tabs.append(b); } }
    function show() { setTabs(); fill(cur); drawLadder(staticState(cur)); drawReader(); }
    function stop() { anim = null; if (raf) cancelAnimationFrame(raf); raf = 0; }
    function frame(now) {
      raf = 0; if (dead || !anim) return; if (!t0) t0 = now; Tm = now - t0; const st = D.move(m, anim.a, anim.b, Tm), A = m.sheets[anim.a], B = m.sheets[anim.b];
      st.ghost = true; st.title = st.phase === 'a' ? P2(A.label) : st.phase === 'moving' ? T('from ' + A.label[0] + ' to ' + B.label[0] + ': two published sheets, the months between are not shown', 'από ' + A.label[1] + ' έως ' + B.label[1] + ': δύο δημοσιευμένα φύλλα, οι ενδιάμεσοι μήνες δεν φαίνονται') : P2(B.label) + T('  (rings: ' + A.label[0] + ')', '  (δακτύλιοι: ' + A.label[1] + ')');
      drawLadder(st); if (st.done) { anim = null; cur = m.sheets.length - 1; setTabs(); if (B.say) say.textContent = P2(B.say); return; } raf = requestAnimationFrame(frame);
    }
    function play() { if (!canWalk || reduce.matches) return; stop(); anim = { a: m.sheets.length - 2, b: m.sheets.length - 1 }; cur = anim.b; t0 = 0; setTabs(); fill(cur); drawReader(); say.textContent = T('Watch the nine dots move from ' + m.sheets[anim.a].label[0] + ' to ' + m.sheets[anim.b].label[0] + '. The short windows move far; the long ones barely move.', 'Δείτε τις εννέα τελείες να μετακινούνται από ' + m.sheets[anim.a].label[1] + ' σε ' + m.sheets[anim.b].label[1] + '. Τα σύντομα παράθυρα μετακινούνται πολύ· τα μακριά ελάχιστα.'); raf = requestAnimationFrame(frame); }
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!anim) { drawLadder(staticState(cur)); drawRegions(m.sheets[cur]); } drawLab(); }) : null; if (ro) { ro.observe(cv); }
    show(); drawLab(); if (canWalk && !reduce.matches) play();
    return () => { dead = true; stop(); if (ro) ro.disconnect(); };
  }

  SC.register('drought', {
    title: ['Drought watch', 'Παρακολούθηση ξηρασίας'],
    render(root) {
      root.append(SC.head({ title: T('Drought watch', 'Παρακολούθηση ξηρασίας'), lede: T('How the rain of the last months and years compares with the same months in the past, from the Department of Meteorology\'s drought index. The index looks only at rain: not at the dams, not at the soil, not at how much water we use.', 'Πώς συγκρίνεται η βροχή των τελευταίων μηνών και ετών με τους ίδιους μήνες του παρελθόντος, από τον δείκτη ξηρασίας του Τμήματος Μετεωρολογίας. Ο δείκτης κοιτά μόνο τη βροχή: όχι τα φράγματα, όχι το έδαφος, όχι πόσο νερό χρησιμοποιούμε.') }));
      const host = document.createElement('div'); root.append(host); let stopFn = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]')) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      const data = fetch('/site/data/drought.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      load(LIBS).then(() => data).then((d) => { if (!gone) stopFn = build(host, d || {}); }).catch(() => { host.textContent = T('The page could not start. Reload to try again.', 'Η σελίδα δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά.'); });
      return () => { gone = true; if (stopFn) stopFn(); };
    },
  });
})();
