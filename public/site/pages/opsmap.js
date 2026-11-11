/* Operations map: the parts behind the site (sensors, data feeds, server, saved history, assistant, website) as nodes in layers,
   with a live status each. Nodes can be dragged (mouse; on touch use the dots), moved with the arrow keys, and their places are kept in this
   browser only. Nothing here changes anything on the server, so visitors may open it too.
   API: GET /api/ops -> { at, nodes:[{ id, label, kind, status, detail }], edges:[{ from, to }] } (no secrets). Refreshes every 30 s. */
(function () {
  'use strict';
  const t = SC.t, el = SC.el;

  const STATUS = {
    ok: ['Working', 'Λειτουργεί'],
    late: ['Running late', 'Καθυστερεί'],
    off: ['Switched off', 'Απενεργοποιημένο'],
    error: ['Problem', 'Πρόβλημα'],
    unknown: ['Unknown', 'Άγνωστο'],
  };
  const COUNT = {   // "3 working"
    ok: ['working', 'λειτουργούν'], late: ['running late', 'καθυστερούν'], off: ['switched off', 'απενεργοποιημένα'], error: ['with a problem', 'με πρόβλημα'], unknown: ['unknown', 'άγνωστα'],
  };
  const WORST = { error: 4, late: 3, unknown: 2, off: 1, ok: 0 };
  const KIND = {
    sensors: ['Sensors', 'Αισθητήρες', 'sensor'],
    feed: ['Data feed', 'Πηγή δεδομένων', 'download'],
    server: ['Server', 'Διακομιστής', 'layers'],
    store: ['Saved history', 'Αποθηκευμένο ιστορικό', 'db'],
    assistant: ['Assistant', 'Βοηθός', 'sparkle'],
    site: ['Website', 'Ιστότοπος', 'globe'],
  };
  const LAYERS = [
    { id: 'in', kinds: ['sensors', 'feed'], title: ['Where data comes from', 'Από πού έρχονται τα δεδομένα'] },
    { id: 'core', kinds: ['server', 'store'], title: ['Our server', 'Ο διακομιστής μας'] },
    { id: 'help', kinds: ['assistant'], title: ['Helpers', 'Βοηθοί'] },
    { id: 'out', kinds: ['site'], title: ['What people see', 'Τι βλέπουν οι άνθρωποι'] },
  ];
  // Greek names for the parts we know by id; anything else keeps the name the server sends.
  const EL_LABEL = { sensors: 'Αισθητήρες', server: 'Διακομιστής', sensecap: 'SenseCAP', dom: 'Μετεωρολογία', openmeteo: 'Open-Meteo', sensorcommunity: 'Sensor.Community', metar: 'METAR', assistant: 'Βοηθός', store: 'Ιστορικό', site: 'Ιστότοπος' };

  const stOf = (s) => (STATUS[s] ? s : 'unknown');
  const stWord = (s) => t(STATUS[stOf(s)][0], STATUS[stOf(s)][1]);
  const kindOf = (k) => KIND[k] || ['Part', 'Μέρος', 'layers'];
  const labelOf = (n) => (SC.lang === 'el' && EL_LABEL[n.id]) || n.label;
  const layerOf = (kind) => { const i = LAYERS.findIndex((l) => l.kinds.includes(kind)); return i < 0 ? 1 : i; };
  const errText = (e) => (e && e.message) || t('Something went wrong. Try again.', 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.');
  const badge = (s) => el('span', { class: 'om-badge s-' + stOf(s) }, el('i', { 'aria-hidden': 'true' }), stWord(s));

  function normalise(d) {
    if (!d || !Array.isArray(d.nodes)) throw new Error(t('The status service sent an answer this page cannot read.', 'Η υπηρεσία κατάστασης έστειλε απάντηση που η σελίδα δεν μπορεί να διαβάσει.'));
    const seen = new Set();
    const nodes = [];
    d.nodes.forEach((n) => {
      if (!n || typeof n.id !== 'string' || seen.has(n.id)) return;
      seen.add(n.id);
      nodes.push({ id: n.id, label: String(n.label || n.id), kind: String(n.kind || ''), status: stOf(n.status), detail: n.detail == null ? '' : String(n.detail) });
    });
    const edges = (Array.isArray(d.edges) ? d.edges : []).filter((e) => e && seen.has(e.from) && seen.has(e.to) && e.from !== e.to).map((e) => ({ from: e.from, to: e.to }));
    return { at: Number(d.at) || Date.now(), nodes, edges };
  }

  /* ---------- default places: layers stacked top to bottom, nodes in rows inside each layer ---------- */
  const H = 78, HEAD = 32, GAPY = 20, BANDGAP = 30, PADB = 14, EDGE = 4;
  function plan(W, nodes) {
    const narrow = W < 520;
    const padX = narrow ? 12 : 18, gapX = narrow ? 12 : 18;
    const maxCols = narrow ? 2 : Math.max(1, Math.floor((W - 2 * padX + gapX) / (150 + gapX)));
    const groups = LAYERS.map(() => []);
    nodes.forEach((n) => groups[layerOf(n.kind)].push(n));
    const rowsOf = groups.map((g) => { if (!g.length) return []; const rows = Math.ceil(g.length / maxCols), per = Math.ceil(g.length / rows); const out = []; for (let i = 0; i < g.length; i += per) out.push(g.slice(i, i + per)); return out; });
    const cols = Math.max(1, ...rowsOf.map((r) => Math.max(0, ...r.map((x) => x.length))));
    const w = Math.max(120, Math.min(200, Math.floor((W - 2 * padX - (cols - 1) * gapX) / cols)));
    const pos = new Map(), bands = [];
    let y = 10;
    rowsOf.forEach((rows, li) => {
      if (!rows.length) return;
      const top = y, bh = HEAD + rows.length * H + (rows.length - 1) * GAPY + PADB;
      rows.forEach((row, ri) => {
        const rw = row.length * w + (row.length - 1) * gapX, x0 = Math.round((W - rw) / 2);
        row.forEach((n, ci) => pos.set(n.id, { x: x0 + ci * (w + gapX), y: top + HEAD + ri * (H + GAPY) }));
      });
      bands.push({ layer: li, y: top, h: bh });
      y = top + bh + BANDGAP;
    });
    return { w, h: H, H: Math.max(120, y - BANDGAP + 10), pos, bands, narrow };
  }

  /* ---------- page ---------- */
  function build(root, ctx) {
    const keyOf = (narrow) => 'sc.opsmap.pos.' + (narrow ? 'n' : 'w');
    const S = { data: null, nodes: new Map(), pos: new Map(), saved: {}, plan: null, W: 0, sel: null, dragEnd: 0, lastFetch: 0, failed: null };
    const loadSaved = (narrow) => {
      let o = {};
      try { o = JSON.parse(SC.store.get(keyOf(narrow)) || '{}') || {}; } catch (e) { o = {}; }
      const clean = {};
      Object.keys(o).forEach((k) => { const v = o[k]; if (v && isFinite(v.fx) && isFinite(v.y)) clean[k] = { fx: Math.max(0, Math.min(1, v.fx)), y: v.y }; });
      return clean;
    };
    const persistNow = () => { SC.store.set(keyOf(S.plan.narrow), JSON.stringify(S.saved)); };
    let persistTimer = 0;
    const persist = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 250); };

    const live = el('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    const summary = el('div', { class: 'om-sum' });
    const notice = el('div', { 'aria-live': 'polite' });
    const board = el('div', { class: 'om-board', role: 'group', 'aria-label': t('Map of the parts of the site. Each part is a button; arrow keys move it.', 'Χάρτης των μερών του ιστότοπου. Κάθε μέρος είναι κουμπί· τα βέλη το μετακινούν.') });
    const bandHost = el('div', { class: 'om-bands', 'aria-hidden': 'true' });
    const svg = SC.svgEl('svg', { class: 'om-links', 'aria-hidden': 'true', focusable: 'false' });
    const defs = SC.svgEl('defs');
    ['ok', 'late', 'off', 'error'].forEach((s) => defs.append(SC.svgEl('marker', { id: 'om-ar-' + s, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, SC.svgEl('path', { d: 'M1 1.5L9 5 1 8.5z', class: 'om-ah s-' + s }))));
    svg.append(defs);
    const linkLayer = SC.svgEl('g');
    svg.append(linkLayer);
    const nodeHost = el('div', { class: 'om-nodes' });
    board.append(bandHost, svg, nodeHost);
    const detail = el('aside', { class: 'nm-card om-detail', 'aria-live': 'polite', 'aria-label': t('Details of the chosen part', 'Λεπτομέρειες του επιλεγμένου μέρους') });
    const hint = el('p', { class: 'om-hint' }, t('Drag a part to move it (on a touch screen, drag the dots). With the keyboard, focus a part and use the arrow keys; Shift moves it further. Press Enter to read its details. Your arrangement is kept in this browser only.',
      'Σύρετε ένα μέρος για να το μετακινήσετε (σε οθόνη αφής σύρετε τις τελείες). Με το πληκτρολόγιο εστιάστε σε ένα μέρος και χρησιμοποιήστε τα βέλη· το Shift το μετακινεί περισσότερο. Πατήστε Enter για λεπτομέρειες. Η διάταξή σας κρατιέται μόνο σε αυτόν τον browser.'));
    const resetBtn = el('button', { class: 'nm-btn nm-btn--sm', type: 'button', onclick: () => { S.saved = {}; persistNow(); layout(true); live.textContent = t('Layout reset.', 'Η διάταξη επανήλθε.'); } }, SC.icon('refresh', 16), t('Reset layout', 'Επαναφορά διάταξης'));
    const wrap = el('div', { class: 'om' },
      summary, notice,
      el('div', { class: 'om-main' }, el('div', { class: 'om-left' }, el('div', { class: 'nm-card om-boardcard' }, board), hint), detail),
      live);
    root.replaceChildren(wrap);

    /* ----- nodes ----- */
    function makeNode(n) {
      const rec = { id: n.id, el: null };
      const node = el('div', { class: 'om-n', tabindex: '0', role: 'button', 'aria-pressed': 'false' },
        el('span', { class: 'om-bar', 'aria-hidden': 'true' }),
        el('div', { class: 'om-top' }, el('span', { class: 'om-ic', 'aria-hidden': 'true' }), el('div', { class: 'om-tx' }, el('b', { class: 'om-lb' }), el('small', { class: 'om-kd' }))),
        el('div', { class: 'om-bt' }),
        el('span', { class: 'om-grip', 'aria-hidden': 'true' }, dots()));
      rec.el = node;
      let drag = null;
      node.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.pointerType !== 'mouse' && !e.target.closest('.om-grip')) return;   // touch: only the dots drag, so the page can still scroll
        const p = S.pos.get(n.id); if (!p) return;
        drag = { sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
        try { node.setPointerCapture(e.pointerId); } catch (x) { /* not capturable */ }
      });
      node.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        if (!drag.moved) { drag.moved = true; node.classList.add('drag'); }
        moveTo(n.id, drag.ox + dx, drag.oy + dy, true);
      });
      const end = () => {
        if (!drag) return;
        const d = drag; drag = null; node.classList.remove('drag');
        if (d.moved) { S.dragEnd = performance.now(); persistNow(); live.textContent = t('Moved ' + rec.name + '. Position kept.', 'Μετακινήθηκε: ' + rec.name + '. Η θέση κρατήθηκε.'); }
      };
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
      node.addEventListener('click', () => { if (performance.now() - S.dragEnd < 120) return; select(n.id, true); });
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n.id, true); return; }
        const step = e.shiftKey ? 48 : 12;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!d) return;
        e.preventDefault();
        const p = S.pos.get(n.id); if (!p) return;
        moveTo(n.id, p.x + d[0], p.y + d[1], true);
        persist();
        live.textContent = t('Moved ' + rec.name + '. Position kept.', 'Μετακινήθηκε: ' + rec.name + '. Η θέση κρατήθηκε.');
      });
      return rec;
    }
    function dots() {
      const s = SC.svgEl('svg', { viewBox: '0 0 12 18', width: 12, height: 18, 'aria-hidden': 'true' });
      [[3, 3], [9, 3], [3, 9], [9, 9], [3, 15], [9, 15]].forEach(([x, y]) => s.append(SC.svgEl('circle', { cx: x, cy: y, r: 1.4, fill: 'currentColor' })));
      return s;
    }
    function paintNode(rec, n) {
      rec.name = labelOf(n);
      const k = kindOf(n.kind);
      const e = rec.el;
      e.dataset.status = n.status;
      e.querySelector('.om-lb').textContent = rec.name;
      const kd = e.querySelector('.om-kd'); kd.textContent = t(k[0], k[1]); kd.hidden = kd.textContent.toLowerCase() === rec.name.toLowerCase();
      const ic = e.querySelector('.om-ic'); ic.replaceChildren(SC.icon(k[2], 18));
      e.querySelector('.om-bt').replaceChildren(badge(n.status));
      e.setAttribute('aria-label', rec.name + ', ' + t(k[0], k[1]) + ', ' + stWord(n.status));
      e.title = rec.name;
    }

    /* ----- placing ----- */
    function place(id) {
      const rec = S.nodes.get(id), p = S.pos.get(id);
      if (!rec || !p) return;
      rec.el.style.width = S.plan.w + 'px';
      rec.el.style.transform = 'translate(' + Math.round(p.x) + 'px,' + Math.round(p.y) + 'px)';
    }
    const span = () => Math.max(1, S.W - S.plan.w - 2 * EDGE);
    function moveTo(id, x, y, remember) {
      const nx = Math.max(EDGE, Math.min(S.W - S.plan.w - EDGE, x)), ny = Math.max(EDGE, Math.min(S.plan.H - H - EDGE, y));
      S.pos.set(id, { x: nx, y: ny });
      if (remember) S.saved[id] = { fx: (nx - EDGE) / span(), y: ny };
      place(id); drawLinks();
    }
    function layout(force) {
      if (!S.data) return;
      const W = Math.max(280, Math.round(board.clientWidth) || 640);
      if (!force && W === S.W && S.plan) return;
      S.W = W;
      const p = plan(W, S.data.nodes);
      if (!S.plan || S.plan.narrow !== p.narrow) S.saved = loadSaved(p.narrow);
      S.plan = p;
      S.data.nodes.forEach((n) => {
        const sv = S.saved[n.id], d = p.pos.get(n.id);
        if (sv) S.pos.set(n.id, { x: Math.max(EDGE, Math.min(W - p.w - EDGE, EDGE + sv.fx * span())), y: Math.max(EDGE, Math.min(p.H - H - EDGE, sv.y)) });
        else S.pos.set(n.id, d);
      });
      board.style.height = p.H + 'px';
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + p.H);
      bandHost.replaceChildren(...p.bands.map((b, i) => {
        const L = LAYERS[b.layer];
        return el('div', { class: 'om-band b' + (i % 2), style: { top: b.y + 'px', height: b.h + 'px' } }, el('span', null, t(L.title[0], L.title[1])));
      }));
      S.data.nodes.forEach((n) => place(n.id));
      drawLinks();
    }

    /* ----- links ----- */
    const rect = (id) => { const p = S.pos.get(id); return p ? { x: p.x, y: p.y, w: S.plan.w, h: H } : null; };
    function pathFor(a, b) {
      const acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
      if (b.y >= a.y + a.h + 6) { const x1 = acx, y1 = a.y + a.h, x2 = bcx, y2 = b.y, m = (y2 - y1) / 2; return 'M' + x1 + ' ' + y1 + 'C' + x1 + ' ' + (y1 + m) + ' ' + x2 + ' ' + (y2 - m) + ' ' + x2 + ' ' + y2; }
      if (a.y >= b.y + b.h + 6) { const x1 = acx, y1 = a.y, x2 = bcx, y2 = b.y + b.h, m = (y2 - y1) / 2; return 'M' + x1 + ' ' + y1 + 'C' + x1 + ' ' + (y1 + m) + ' ' + x2 + ' ' + (y2 - m) + ' ' + x2 + ' ' + y2; }
      const right = bcx >= acx, x1 = right ? a.x + a.w : a.x, x2 = right ? b.x : b.x + b.w, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, m = (x2 - x1) / 2;
      return 'M' + x1 + ' ' + y1 + 'C' + (x1 + m) + ' ' + y1 + ' ' + (x2 - m) + ' ' + y2 + ' ' + x2 + ' ' + y2;
    }
    function drawLinks() {
      if (!S.data || !S.plan) return;
      const kids = Array.from(linkLayer.childNodes);
      S.data.edges.forEach((e, i) => {
        const a = rect(e.from), b = rect(e.to);
        if (!a || !b) return;
        const sa = S.data.nodes.find((n) => n.id === e.from).status, sb = S.data.nodes.find((n) => n.id === e.to).status;
        const worst = WORST[sa] >= WORST[sb] ? sa : sb;
        const s = worst === 'unknown' ? 'off' : worst;
        let p = kids[i];
        if (!p) { p = SC.svgEl('path', { fill: 'none' }); linkLayer.append(p); }
        p.setAttribute('d', pathFor(a, b));
        p.setAttribute('class', 'om-link s-' + s + (S.sel && (e.from === S.sel || e.to === S.sel) ? ' hot' : S.sel ? ' dim' : ''));
        p.setAttribute('marker-end', 'url(#om-ar-' + s + ')');
      });
      for (let i = S.data.edges.length; i < kids.length; i++) kids[i].remove();
    }

    /* ----- summary and detail ----- */
    function drawSummary() {
      const counts = {};
      S.data.nodes.forEach((n) => { counts[n.status] = (counts[n.status] || 0) + 1; });
      const all = S.data.nodes.length;
      const bad = (counts.error || 0) + (counts.late || 0);
      summary.replaceChildren(
        el('div', { class: 'om-chips', role: 'list', 'aria-label': t('Status of all parts', 'Κατάσταση όλων των μερών') },
          ['ok', 'late', 'error', 'off', 'unknown'].filter((s) => counts[s]).map((s) => el('span', { class: 'om-chip s-' + s, role: 'listitem' }, el('i', { 'aria-hidden': 'true' }), el('b', null, String(counts[s])), ' ' + t(COUNT[s][0], COUNT[s][1])))),
        el('p', { class: 'om-sumtx' }, !bad && (counts.ok || 0) === all ? t('All ' + all + ' parts are working.', 'Και τα ' + all + ' μέρη λειτουργούν.')
          : bad ? t(bad + (bad === 1 ? ' part needs a look.' : ' parts need a look.'), bad + (bad === 1 ? ' μέρος θέλει έλεγχο.' : ' μέρη θέλουν έλεγχο.'))
            : t('Nothing is broken. Some parts are switched off or unknown.', 'Τίποτα δεν είναι χαλασμένο. Κάποια μέρη είναι απενεργοποιημένα ή άγνωστα.')),
        el('span', { class: 'om-sp' }), resetBtn);
    }
    function drawDetail() {
      const n = S.data.nodes.find((x) => x.id === S.sel);
      if (!n) { detail.replaceChildren(el('p', { class: 'empty' }, t('Choose a part on the map to read what it does and how it is doing.', 'Επιλέξτε ένα μέρος στον χάρτη για να διαβάσετε τι κάνει και πώς τα πάει.'))); return; }
      const k = kindOf(n.kind);
      const byId = (id) => S.data.nodes.find((x) => x.id === id);
      const fedBy = S.data.edges.filter((e) => e.to === n.id).map((e) => byId(e.from));
      const feeds = S.data.edges.filter((e) => e.from === n.id).map((e) => byId(e.to));
      const chips = (list) => el('ul', { class: 'om-conn' }, list.map((m) => el('li', null, el('button', { class: 'om-cb s-' + m.status, type: 'button', onclick: () => { select(m.id, true); const r = S.nodes.get(m.id); if (r) r.el.focus({ preventScroll: true }); } }, el('i', { 'aria-hidden': 'true' }), labelOf(m)))));
      detail.replaceChildren(el('div', null,
        el('p', { class: 'card-eye' }, t(k[0], k[1])),
        el('h2', { class: 'card-h om-dh' }, labelOf(n)),
        el('div', { class: 'om-ds' }, badge(n.status)),
        el('p', { class: 'om-dt' }, n.detail || t('No further detail for this part.', 'Δεν υπάρχουν περισσότερες λεπτομέρειες για αυτό το μέρος.')),
        fedBy.length ? el('div', { class: 'om-cg' }, el('h3', null, t('Gets data from', 'Παίρνει δεδομένα από')), chips(fedBy)) : null,
        feeds.length ? el('div', { class: 'om-cg' }, el('h3', null, t('Passes data to', 'Δίνει δεδομένα σε')), chips(feeds)) : null,
        !fedBy.length && !feeds.length ? el('p', { class: 'muted om-dn' }, t('This part is not linked to another one on the map.', 'Αυτό το μέρος δεν συνδέεται με άλλο στον χάρτη.')) : null,
        el('p', { class: 'muted om-dn' }, t('Status checked at ', 'Η κατάσταση ελέγχθηκε στις ') + SC.time(S.data.at) + '.')));
    }
    function select(id, user) {
      S.sel = id;
      S.nodes.forEach((rec, k) => { const on = k === id; rec.el.classList.toggle('on', on); rec.el.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      drawDetail(); drawLinks();
      if (user && window.matchMedia('(max-width: 1100px)').matches) detail.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
    const worstNode = (nodes) => nodes.slice().sort((a, b) => WORST[b.status] - WORST[a.status])[0];

    /* ----- new data ----- */
    function apply(d) {
      S.data = d;
      const ids = new Set(d.nodes.map((n) => n.id));
      S.nodes.forEach((rec, id) => { if (!ids.has(id)) { rec.el.remove(); S.nodes.delete(id); S.pos.delete(id); } });
      d.nodes.forEach((n) => {
        let rec = S.nodes.get(n.id);
        if (!rec) { rec = makeNode(n); S.nodes.set(n.id, rec); nodeHost.append(rec.el); }
        paintNode(rec, n);
      });
      if (!S.sel || !ids.has(S.sel)) S.sel = worstNode(d.nodes).id;
      drawSummary();
      layout(true);
      S.nodes.forEach((rec, id) => { const on = id === S.sel; rec.el.classList.toggle('on', on); rec.el.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      drawDetail(); drawLinks();
    }
    const dragging = () => Array.from(S.nodes.values()).some((r) => r.el.classList.contains('drag'));

    let ro = null;
    if (window.ResizeObserver) {
      let raf = 0;
      ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (S.data && Math.round(board.clientWidth) !== S.W) layout(false); }); });
      ro.observe(board);
    }
    return { S, apply, notice, dragging, destroy: () => { clearTimeout(persistTimer); if (ro) ro.disconnect(); } };
  }

  SC.register('opsmap', {
    title: ['Operations map', 'Χάρτης λειτουργιών'],
    render(root, ctx) {
      SC.css('/site/pages/opsmap.css');
      const visitor = !(ctx.me || SC.me);
      const head = SC.head({
        title: t('Operations map', 'Χάρτης λειτουργιών'),
        lede: t('How the parts behind this site fit together, and whether each one is working right now: sensors and data feeds on top, then our server, the helpers and the pages people see. You can look, but nothing here changes anything.',
          'Πώς ταιριάζουν τα μέρη πίσω από αυτόν τον ιστότοπο και αν το καθένα λειτουργεί αυτή τη στιγμή: αισθητήρες και πηγές δεδομένων πάνω, μετά ο διακομιστής μας, οι βοηθοί και οι σελίδες που βλέπουν οι άνθρωποι. Μπορείτε να κοιτάξετε, αλλά τίποτα εδώ δεν αλλάζει κάτι.'),
        help: [
          'Each box is one part of the system. The colour and the word show if it is working, running late, switched off or has a problem. Arrows show where data flows. Choose a box to read more about it. You can drag the boxes to arrange the map; this only changes your own screen. The map checks again every 30 seconds.',
          'Κάθε κουτί είναι ένα μέρος του συστήματος. Το χρώμα και η λέξη δείχνουν αν λειτουργεί, καθυστερεί, είναι απενεργοποιημένο ή έχει πρόβλημα. Τα βέλη δείχνουν πού ρέουν τα δεδομένα. Επιλέξτε ένα κουτί για περισσότερα. Μπορείτε να σύρετε τα κουτιά για να τακτοποιήσετε τον χάρτη· αυτό αλλάζει μόνο τη δική σας οθόνη. Ο χάρτης ελέγχει ξανά κάθε 30 δευτερόλεπτα.'],
        fresh: t('Live', 'Ζωντανά'),
        tags: visitor ? [{ text: t('View only', 'Μόνο προβολή'), cls: 'arch' }] : [],
      });
      root.append(head);
      const pill = head.querySelector('.fresh-pill');
      const setPill = (text, stale) => {
        if (!pill) return;
        pill.lastChild.textContent = text;
        pill.style.borderColor = stale ? 'var(--nm-warn-line)' : '';
        pill.style.background = stale ? 'var(--nm-warn-bg)' : '';
        pill.style.color = stale ? 'var(--nm-warn)' : '';
      };
      SC.cached('/api/config', 300000).then((c) => { if (c && c.demo && alive) { const ph = head.querySelector('.page-head'); ph.insertBefore(el('span', { class: 't demo' }, t('Demo data', 'Δεδομένα επίδειξης')), ph.querySelector('.lede')); } }).catch(() => {});

      const host = el('div');
      root.append(host);
      let alive = true, ui = null, timer = 0, busy = false;

      const showError = (e) => {
        ui = null;
        host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('The map could not be loaded. ', 'Ο χάρτης δεν φορτώθηκε. ') + errText(e)),
          el('div', { style: { marginTop: '12px' } }, el('button', { class: 'nm-btn', type: 'button', onclick: () => { host.replaceChildren(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση'))); fetchNow(true); } }, t('Try again', 'Δοκιμάστε ξανά'))));
        setPill(t('Not available', 'Μη διαθέσιμο'), true);
      };
      async function fetchNow(first) {
        if (busy) return;
        busy = true;
        try {
          const d = normalise(await SC.api('/api/ops'));
          if (!alive) return;
          if (!d.nodes.length) {
            ui = null;
            host.replaceChildren(el('div', { class: 'empty' }, t('The status service has no parts to show yet. Check back in a minute.', 'Η υπηρεσία κατάστασης δεν έχει ακόμη μέρη να δείξει. Ελέγξτε ξανά σε ένα λεπτό.')));
            setPill(t('Nothing to show', 'Τίποτα προς εμφάνιση'), true);
            return;
          }
          if (!ui) ui = build(host, ctx);
          if (!ui.dragging()) ui.apply(d); else ui.S.data = d;
          ui.notice.replaceChildren();
          ui.S.lastFetch = Date.now(); ui.S.failed = null; ui.S.at = d.at;
          tickPill();
        } catch (e) {
          if (!alive) return;
          if (!ui) showError(e);
          else {
            ui.S.failed = e;
            ui.notice.replaceChildren(el('div', { class: 'nm-callout nm-callout--warn om-note' }, t('Could not refresh the map (' + errText(e) + '). Showing what it looked like ' + SC.ago(ui.S.at) + '. ', 'Δεν ανανεώθηκε ο χάρτης (' + errText(e) + '). Εμφανίζεται η εικόνα από ' + SC.ago(ui.S.at) + '. '),
              el('button', { class: 'link', type: 'button', onclick: () => fetchNow(false) }, t('Try again', 'Δοκιμάστε ξανά'))));
            tickPill();
          }
        } finally { busy = false; }
      }
      function tickPill() {
        if (!ui || !ui.S.at) return;
        const age = Date.now() - ui.S.at;
        setPill(ui.S.failed ? t('Old picture · ' + SC.ago(ui.S.at), 'Παλιά εικόνα · ' + SC.ago(ui.S.at)) : t('Live · checked ' + SC.ago(ui.S.at), 'Ζωντανά · έλεγχος ' + SC.ago(ui.S.at)), Boolean(ui.S.failed) || age > 120000);
      }
      host.append(el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      fetchNow(true);
      timer = setInterval(() => {
        if (document.hidden) return;
        tickPill();
        if (!ui || Date.now() - ui.S.lastFetch >= 29000) fetchNow(false);
      }, 10000);
      return () => { alive = false; clearInterval(timer); if (ui) ui.destroy(); };
    },
  });
})();
