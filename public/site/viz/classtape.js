/*
  Class tape widget: SC.viz.classtape.mount(host, model, opts) -> { destroy(), set({place, highlight}), model() }.
  The model is built by classtape-data.js: one place at a time, one cell per ten-day period, grouped by month.
  The classes are categories, not a scale: EVERY cell is drawn with the same height, whatever its class. A class shows as a
  colour AND a glyph; 'no data' cells are hatched. Still data: nothing moves. The picture is redrawn only on resize,
  language change, hover, pick, a press on the key, or set().
  opts.place      id of the place to show first (default: the model's own).
  opts.chooser    false hides the built-in place buttons (the page then calls handle.set({place}) from its own control).
  opts.onPick({period, periodEnd, code, className:[en,el], state, label:[en,el], place}) when a cell is hovered, clicked or
                  reached with Left/Right; null when nothing is under the pointer and nothing is picked.
  opts.onSet({place}) after the shown place changed through the built-in buttons.
  opts.onHighlight({code, state, name, periods}|null) when a class in the key is switched on or off.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)';
  const pickPlace = (m, id) => (m && m.places && m.places[id] ? Object.assign({}, m, m.places[id], { place: String(id) }) : m);
  const kid = (k) => k.state + ':' + k.code;

  // one cell: the same drawing for the tape and for the key. (x, y, w, h) is the box; the class decides colour and glyph only.
  function cell(ctx, x, y, w, h, c) {
    if (c.state === 'class') { ctx.fillStyle = c.color; ctx.fillRect(x, y, w, h); }
    else {
      ctx.fillStyle = 'rgba(125,211,252,0.05)'; ctx.fillRect(x, y, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = 'rgba(125,211,252,0.45)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = -h; k < w; k += 5) { ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); }
      ctx.stroke(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(125,211,252,0.6)'; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.restore();
    }
    const s = Math.max(5, Math.min(w - 5, h - 8, 15)), r = s / 2, cx = x + w / 2, cy = y + h / 2;
    ctx.save(); ctx.strokeStyle = c.ink; ctx.fillStyle = c.ink; ctx.lineWidth = Math.max(1.4, s * 0.17); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    switch (c.glyph) {
      case 'ring': ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.stroke(); break;
      case 'triangle': ctx.moveTo(cx, cy - r * 0.9); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath(); ctx.stroke(); break;
      case 'diamond': ctx.moveTo(cx, cy - r * 1.1); ctx.lineTo(cx + r * 0.9, cy); ctx.lineTo(cx, cy + r * 1.1); ctx.lineTo(cx - r * 0.9, cy); ctx.closePath(); ctx.fill(); break;
      case 'square': ctx.fillRect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6); break;
      case 'check': ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r * 0.3, cy + r * 0.75); ctx.lineTo(cx + r, cy - r * 0.8); ctx.stroke(); break;
      case 'wave': ctx.moveTo(cx - r, cy); ctx.bezierCurveTo(cx - r * 0.5, cy - r * 1.3, cx - r * 0.1, cy - r * 1.3, cx, cy); ctx.bezierCurveTo(cx + r * 0.1, cy + r * 1.3, cx + r * 0.5, cy + r * 1.3, cx + r, cy); ctx.stroke(); break;
      case 'plus': ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); break;
      case 'digit': case 'question': ctx.font = '600 ' + Math.round(s) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.glyph === 'question' ? '?' : String(c.code), cx, cy + 0.5); break;
      default: break;
    }
    ctx.restore();
  }

  function mount(host, model0, opts) {
    opts = opts || {};
    let model = opts.place != null ? pickPlace(model0, String(opts.place)) : model0;
    let hover = -1, picked = -1, lit = null, w = 0, hits = [], dead = false;
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    host.setAttribute('role', 'img');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const sw = el('div', 'display:none;gap:6px;margin:0 0 8px;flex-wrap:wrap;font-size:11px');
    const cv = el('canvas', 'display:block;width:100%;cursor:default;outline:none;border-radius:4px'), ctx = cv.getContext('2d');
    const read = el('p', 'margin:6px 0 0;min-height:2.9em;font-size:11px;line-height:1.45;color:' + DIM);
    const keyHead = el('p', 'margin:6px 0 5px;font-size:11px;color:' + DIM);
    const keyBox = el('div', 'display:flex;flex-wrap:wrap;gap:5px;font-size:11px');
    const txt = el('div', 'margin-top:8px;font-size:11px;line-height:1.5;color:' + DIM);
    cv.tabIndex = 0;
    host.append(sw, cv, read, keyHead, keyBox, txt);
    const pill = (on) => 'font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;background:' + (on ? 'rgba(125,211,252,0.18)' : 'transparent') + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,' + (on ? '0.9' : '0.4') + ')';

    function buildSwitch() {
      sw.textContent = '';
      if (opts.chooser === false || !model.available || model.choices.length < 2) { sw.style.display = 'none'; return; }
      sw.style.display = 'flex';
      const lab = el('span', 'align-self:center;color:' + DIM); lab.textContent = L(model.strings.choose); sw.append(lab);
      for (const c of model.choices) {
        const on = c.id === model.place, b = el('button', pill(on));
        b.type = 'button'; b.textContent = L(c.name); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', () => { if (c.id === model.place) return; show(c.id); if (opts.onSet) opts.onSet({ place: c.id }); });
        sw.append(b);
      }
    }
    // the key: every class of the sheet with its colour, glyph and how many periods of this place carry it. Pressing one
    // keeps its periods bright and dims the rest; pressing it again shows all of them.
    function buildKey() {
      keyBox.textContent = ''; keyHead.textContent = model.available ? L(model.strings.key) : '';
      if (!model.available) return;
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      for (const k of model.key) {
        const on = lit === kid(k), b = el('button', pill(on) + ';display:inline-flex;align-items:center;gap:6px;border-radius:6px;padding:3px 7px;text-align:left' + (k.count ? '' : ';opacity:0.55'));
        b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = L(k.text);
        const c = el('canvas', 'width:18px;height:18px;flex:none'); c.width = Math.round(18 * dpr); c.height = Math.round(18 * dpr);
        const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); cell(x, 0, 0, 18, 18, k); c.setAttribute('aria-hidden', 'true');
        const t = el('span'); t.textContent = L(k.name) + ' · ' + k.count;
        b.append(c, t);
        b.addEventListener('click', () => light(on ? null : kid(k), true));
        keyBox.append(b);
      }
    }
    function light(id, tell) {
      lit = id && model.key.some((k) => kid(k) === id) ? id : null; buildKey(); draw();
      if (tell && opts.onHighlight) { const k = model.key.find((q) => kid(q) === lit); opts.onHighlight(k ? { code: k.code, state: k.state, name: k.name, periods: k.periods.map((i) => model.cells[i].period) } : null); }
    }
    function show(id) {
      const next = pickPlace(model, String(id)); if (next === model) return model;
      model = next; hover = -1; picked = -1;
      buildSwitch(); buildKey(); draw(); if (opts.onPick) opts.onPick(null);
      return model;
    }
    const item = (i) => { const c = model.cells[i]; return c ? { period: c.period, periodEnd: c.periodEnd, code: c.code, className: c.className, state: c.state, label: c.label, place: model.place } : null; };

    function draw() {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel)); cv.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!model.available) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; hits = []; read.textContent = ''; read.style.minHeight = '0';
        line(L(model.empty), CYAN); return;
      }
      const cells = model.cells, months = model.months, narrow = w < 520, gap = 2, mgap = narrow ? 7 : 9;
      // months per row: the whole year on one line when the cells stay readable, else 6, 4, 3, 2 or 1 months per line
      let perRow = months.length, cw = 0;
      const fit = (k) => { let most = 0, mm = 0; for (let a = 0; a < months.length; a += k) { const part = months.slice(a, a + k), n = part.reduce((s, m) => s + m.count, 0); if (n > most) { most = n; mm = part.length; } } return (w - (mm - 1) * mgap - (most - mm) * gap) / most; };
      for (const k of [months.length, 6, 4, 3, 2, 1]) { if (k > months.length) continue; perRow = k; cw = fit(k); if (cw >= 17) break; }
      cw = Math.max(6, Math.min(34, cw));
      const CH = narrow ? 30 : 34;   // ONE height for every cell: a class is never a height
      const top = 44, rowH = CH + 26, rowsN = Math.ceil(months.length / perRow), hgt = top + rowsN * rowH;
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = '#e8f6ff'; ctx.font = '600 ' + (narrow ? 12 : 13) + 'px ' + MONO; ctx.fillText(L(model.placeName), 0, 9);
      ctx.fillStyle = DIM; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillText(L(model.span) + ' · ' + L(model.strings.each), 0, 27);
      hits = [];
      const litKey = lit ? model.key.find((k) => kid(k) === lit) : null, litSet = litKey ? new Set(litKey.periods) : null;
      months.forEach((m, mi) => {
        const row = Math.floor(mi / perRow), y = top + row * rowH;
        let x = 0; for (let j = row * perRow; j < mi; j++) x += months[j].count * (cw + gap) - gap + mgap;
        const mw = m.count * (cw + gap) - gap;
        for (let j = 0; j < m.count; j++) {
          const i = m.from + j, c = cells[i], cx = x + j * (cw + gap), dim = litSet && !litSet.has(i);
          hits.push({ x: cx - gap / 2, y, w: cw + gap, h: CH, i });
          ctx.save(); if (dim) ctx.globalAlpha = 0.18; cell(ctx, cx, y, cw, CH, c); ctx.restore();
          const on = i === picked, hv = i === hover;
          if (on || hv) { ctx.strokeStyle = on ? AMBER : '#ffffff'; ctx.lineWidth = 2; ctx.strokeRect(cx - 1, y - 1, cw + 2, CH + 2); }
        }
        // month bracket and name under its cells
        ctx.strokeStyle = 'rgba(125,211,252,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 0.5, y + CH + 4); ctx.lineTo(x + 0.5, y + CH + 7.5); ctx.lineTo(x + mw - 0.5, y + CH + 7.5); ctx.lineTo(x + mw - 0.5, y + CH + 4); ctx.stroke();
        ctx.fillStyle = DIM; ctx.textAlign = 'center'; ctx.font = (narrow ? 10 : 10) + 'px ' + MONO; ctx.fillText(L(m.name), x + mw / 2, y + CH + 16);
      });
      const sel = hover >= 0 ? hover : picked;
      read.style.minHeight = '2.9em';
      read.textContent = sel >= 0 && cells[sel] ? L(cells[sel].label) : (litKey ? L(model.strings.showing) + ': ' + L(litKey.text) : L(model.strings.hint));
      read.style.color = sel >= 0 || litKey ? '#e8f6ff' : DIM;
      if (model.warning) line(L(model.warning), AMBER);
      for (const l of model.legend) line(L(l));
      if (model.honesty) line(L(model.honesty));
    }

    const at = (e) => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; const h = hits.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h); return h ? h.i : -1; };
    const tell = () => { if (opts.onPick) opts.onPick(item(hover >= 0 ? hover : picked)); };
    const onMove = (e) => { const i = at(e); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'pointer' : 'default'; draw(); tell(); } };
    const onLeave = () => { if (hover >= 0) { hover = -1; draw(); tell(); } };
    const onClick = (e) => { const i = at(e); picked = i; draw(); if (opts.onPick) opts.onPick(item(i)); };
    const onKey = (e) => {
      const n = model.cells.length; if (!n) return;
      let i = picked;
      if (e.key === 'ArrowRight') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1);
      else if (e.key === 'ArrowLeft') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1; else if (e.key === 'Escape') i = -1; else return;
      e.preventDefault(); hover = -1; picked = i; draw(); if (opts.onPick) opts.onPick(item(i));
    };
    const onFocus = () => { cv.style.boxShadow = '0 0 0 2px ' + AMBER; }, onBlur = () => { cv.style.boxShadow = 'none'; };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);
    cv.addEventListener('keydown', onKey); cv.addEventListener('focus', onFocus); cv.addEventListener('blur', onBlur);

    // nothing moves, so there is nothing to pause: redraw on size and language changes and when the tab comes back
    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) draw(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; buildSwitch(); buildKey(); draw(); } }, 500);
    buildSwitch(); buildKey(); draw();

    return {
      set(o) {
        if (o && o.place != null) show(o.place);
        if (o && 'highlight' in o) { const k = o.highlight == null ? null : model.key.find((q) => (q.state === 'class' ? q.code === o.highlight : q.state === o.highlight)); light(k ? kid(k) : null, false); }
        return model;
      },
      model() { return model; },
      destroy() { dead = true; clearInterval(poll); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); for (const e of [sw, cv, read, keyHead, keyBox, txt]) e.remove(); },
    };
  }

  SC.viz.classtape = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
