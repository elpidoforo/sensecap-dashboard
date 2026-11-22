/*
  Site cells widget: SC.viz.sitecells.mount(host, model, opts) -> { destroy(), set(), filter(text), model() }.
  The model is built by sitecells-data.js (one small cell per bathing site, grouped by the label reported for the season,
  alphabetical inside a group, never ranked; a site without a label sits in its own "no label for this season" group).
  Each label has its own shape as well as its own colour. No score and no "safe" badge is drawn.
  Still data: nothing moves, apart from one fade-in when the widget first appears (none under reduced motion, none while
  the tab is hidden). After that the picture is redrawn only on resize, language change, hover, pick, filter() or set().
  opts.onPick({id, name, label, labelText:[en,el]}) when a cell is hovered, clicked or reached with the arrow keys;
                  null when nothing is under the pointer and nothing is picked.
  handle.filter(text)  dims the cells whose name does not contain text (case and accents ignored) and returns the number
                  of matching sites; filter('') shows all again. The page supplies the input box.
  handle.set()    redraws (call it after a language change); returns the model.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)', WHITE = '#e8f6ff';
  const rgba = (hex, a) => { const n = parseInt(String(hex).slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };

  function mount(host, model, opts) {
    opts = opts || {};
    let hover = -1, picked = -1, w = 0, hits = [], fade = 1, raf = 0, dead = false, query = '', found = null;
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    const still = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const matcher = () => (SC.viz.sitecellsData && SC.viz.sitecellsData.match ? SC.viz.sitecellsData.match(model, query) : { active: false, count: model.sites.length, total: model.sites.length, on: model.sites.map(() => true), text: null });
    host.setAttribute('role', 'img');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const cv = el('canvas', 'display:block;width:100%;cursor:default;outline:none;border-radius:4px'), ctx = cv.getContext('2d');
    const read = el('p', 'margin:6px 0 0;min-height:2.9em;font-size:11px;line-height:1.45;color:' + DIM);
    const txt = el('div', 'margin-top:6px;font-size:11px;line-height:1.5;color:' + DIM);
    cv.tabIndex = 0;
    host.append(cv, read, txt);
    found = matcher();
    const item = (i) => { const s = model.sites[i]; return s ? { id: s.id, name: s.name, label: s.label, labelText: s.labelText } : null; };

    // one shape per label, drawn inside a box of half-size r around (cx, cy)
    function glyph(kind, cx, cy, r, col) {
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, r * 0.36); ctx.lineCap = 'butt'; ctx.beginPath();
      const poly = (n, rot) => { for (let k = 0; k < n; k++) { const a = rot + k * 2 * Math.PI / n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); };
      if (kind === 'circle') { ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.fill(); }
      else if (kind === 'square') { ctx.fillRect(cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6); }
      else if (kind === 'triangle') { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath(); ctx.fill(); }
      else if (kind === 'diamond') { poly(4, -Math.PI / 2); ctx.fill(); }
      else if (kind === 'hexagon') { poly(6, 0); ctx.fill(); }
      else if (kind === 'plus') { ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke(); }
      else if (kind === 'bars') { ctx.moveTo(cx - r, cy - r * 0.45); ctx.lineTo(cx + r, cy - r * 0.45); ctx.moveTo(cx - r, cy + r * 0.45); ctx.lineTo(cx + r, cy + r * 0.45); ctx.stroke(); }
      else if (kind === 'ring') { ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.stroke(); }
      else if (kind === 'cross') { ctx.moveTo(cx - r * 0.8, cy - r * 0.8); ctx.lineTo(cx + r * 0.8, cy + r * 0.8); ctx.moveTo(cx + r * 0.8, cy - r * 0.8); ctx.lineTo(cx - r * 0.8, cy + r * 0.8); ctx.stroke(); }
      else { ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke(); }   // dash: no label
    }
    function box(x, y, s, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + s, y, x + s, y + s, r); ctx.arcTo(x + s, y + s, x, y + s, r); ctx.arcTo(x, y + s, x, y, r); ctx.arcTo(x, y, x + s, y, r); ctx.closePath(); }

    function draw() {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel)); cv.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!model.available || !model.sites.length) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; hits = []; read.textContent = ''; read.style.minHeight = '0';
        line(L(model.empty || model.ariaLabel), CYAN); return;
      }
      read.style.minHeight = '2.9em';
      const narrow = w < 520, cell = narrow ? 24 : 28, gap = narrow ? 4 : 5, cols = Math.max(1, Math.floor((w + gap) / (cell + gap))), headH = 26, top = 30;
      // layout first (so the canvas height is known), then paint
      hits = []; const heads = []; let y = top;
      model.groups.forEach((g, gi) => {
        heads.push({ y, g }); y += headH;
        for (let k = 0; k < g.count; k++) hits.push({ i: g.from + k, x: (k % cols) * (cell + gap), y: y + Math.floor(k / cols) * (cell + gap), g: gi });
        y += Math.ceil(g.count / cols) * (cell + gap) + (gi < model.groups.length - 1 ? 8 : 0);
      });
      const hgt = y + 4;
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt); ctx.textBaseline = 'middle'; ctx.setLineDash([]);
      ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = '600 ' + (narrow ? 12 : 13) + 'px ' + MONO; ctx.fillText(L(model.seasonText), 0, 9);
      for (const h of heads) {
        glyph(h.g.glyph, 7, h.y + 10, 5, h.g.tone);
        ctx.fillStyle = h.g.tone; ctx.font = '600 ' + (narrow ? 11 : 12) + 'px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(L(h.g.heading), 20, h.y + 10.5);
        const tw = ctx.measureText(L(h.g.heading)).width; ctx.strokeStyle = rgba(h.g.tone, 0.25); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(20 + tw + 10, h.y + 10.5); ctx.lineTo(w, h.y + 10.5); ctx.stroke();
      }
      const sel = hover >= 0 ? hover : picked;
      for (const h of hits) {
        const g = model.groups[h.g], on = found.on[h.i] !== false, isSel = h.i === sel, isPick = h.i === picked, none = g.label == null;
        ctx.save(); ctx.globalAlpha = (on ? 1 : 0.16) * fade;
        if (isSel) { ctx.shadowColor = isPick && hover < 0 ? AMBER : g.tone; ctx.shadowBlur = 14; }
        box(h.x + 0.5, h.y + 0.5, cell - 1, 5); ctx.fillStyle = rgba(g.tone, isSel ? 0.34 : (none ? 0.03 : 0.11)); ctx.fill();
        ctx.shadowBlur = 0; if (none) ctx.setLineDash([3, 3]);
        ctx.lineWidth = isSel ? 2 : 1; ctx.strokeStyle = isSel ? (isPick && hover < 0 ? AMBER : WHITE) : rgba(g.tone, 0.5); ctx.stroke(); ctx.setLineDash([]);
        glyph(g.glyph, h.x + cell / 2, h.y + cell / 2, cell * 0.2, isSel ? WHITE : g.tone);
        ctx.restore();
      }
      // the name of the chosen site next to its cell
      if (sel >= 0 && model.sites[sel]) {
        const h = hits[sel], s = model.sites[sel].name; ctx.font = '600 ' + (narrow ? 10 : 11) + 'px ' + MONO;
        // beside the cell (right, or left when there is no room), so it never covers a group heading
        const tw = Math.min(w - 12, ctx.measureText(s).width), right = h.x + cell + 8 + tw + 6 <= w, left = h.x - 8 - tw - 6 >= 0;
        const tx = right ? h.x + cell + 8 + tw / 2 : (left ? h.x - 8 - tw / 2 : Math.max(tw / 2 + 6, Math.min(w - tw / 2 - 6, h.x + cell / 2))), ty = right || left ? h.y + cell / 2 : h.y + cell + 12;
        ctx.fillStyle = 'rgba(5,11,22,0.92)'; ctx.fillRect(tx - tw / 2 - 5, ty - 9, tw + 10, 18); ctx.strokeStyle = 'rgba(125,211,252,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(tx - tw / 2 - 4.5, ty - 8.5, tw + 9, 17);
        ctx.fillStyle = sel === picked && hover < 0 ? AMBER : WHITE; ctx.textAlign = 'center'; ctx.fillText(s, tx, ty, w - 10);
      }
      hits.cell = cell; hits.gap = gap;
      // text under the picture: the read-out, then what the picture does and does not say (all from the model)
      read.textContent = sel >= 0 && model.sites[sel] ? L(model.sites[sel].sentence) : (found.active ? L(found.text) : L(model.strings.hint)); read.style.color = sel >= 0 || found.active ? WHITE : DIM;
      if (model.counts.text) line(L(model.counts.text), AMBER);
      for (const l of model.legend) line(L(l));
      if (model.note) line(L(model.note));
      if (model.honesty) line(L(model.honesty));
    }

    const at = (e) => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, c = hits.cell || 0; const h = hits.find((q) => x >= q.x && x < q.x + c && y >= q.y && y < q.y + c); return h ? h.i : -1; };
    const tell = () => { if (opts.onPick) opts.onPick(item(hover >= 0 ? hover : picked)); };
    const onMove = (e) => { const i = at(e); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'pointer' : 'default'; draw(); tell(); } };
    const onLeave = () => { if (hover >= 0) { hover = -1; draw(); tell(); } };
    const onClick = (e) => { const i = at(e); picked = i; draw(); if (opts.onPick) opts.onPick(item(i)); };
    // arrow keys walk the cells that are not dimmed: Left/Right in drawing order, Up/Down to the nearest cell in the next row
    const onKey = (e) => {
      const live = hits.filter((h) => found.on[h.i] !== false); if (!live.length) return;
      const cur = hits[picked]; let i = picked;
      const pos = cur ? live.findIndex((h) => h.i === picked) : -1;
      if (e.key === 'ArrowRight') i = live[pos < 0 ? 0 : Math.min(live.length - 1, pos + 1)].i;
      else if (e.key === 'ArrowLeft') i = live[pos < 0 ? live.length - 1 : Math.max(0, pos - 1)].i;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!cur) i = live[e.key === 'ArrowDown' ? 0 : live.length - 1].i;
        else {
          const down = e.key === 'ArrowDown', rows = live.filter((h) => (down ? h.y > cur.y : h.y < cur.y));
          if (rows.length) { const ry = down ? Math.min.apply(null, rows.map((h) => h.y)) : Math.max.apply(null, rows.map((h) => h.y)); let best = null; for (const h of rows) if (h.y === ry && (!best || Math.abs(h.x - cur.x) < Math.abs(best.x - cur.x))) best = h; i = best.i; }
        }
      } else if (e.key === 'Home') i = live[0].i; else if (e.key === 'End') i = live[live.length - 1].i; else if (e.key === 'Escape') i = -1; else return;
      e.preventDefault(); hover = -1; picked = i; draw(); if (opts.onPick) opts.onPick(item(i));
    };
    const onFocus = () => { cv.style.boxShadow = '0 0 0 2px ' + AMBER; }, onBlur = () => { cv.style.boxShadow = 'none'; };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);
    cv.addEventListener('keydown', onKey); cv.addEventListener('focus', onFocus); cv.addEventListener('blur', onBlur);

    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (document.hidden) { if (raf) { root.cancelAnimationFrame(raf); raf = 0; } fade = 1; } else draw(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; draw(); } }, 500);
    // the one entrance: the cells fade in once. Never again, not under reduced motion, not in a hidden tab.
    if (!still() && !document.hidden && root.requestAnimationFrame && model.available && model.sites.length) {
      fade = 0; let t0 = 0;
      const step = (t) => { if (dead) return; if (!t0) t0 = t; const k = Math.min(1, (t - t0) / 500); fade = 1 - Math.pow(1 - k, 3); draw(); raf = k < 1 ? root.requestAnimationFrame(step) : 0; };
      draw(); raf = root.requestAnimationFrame(step);
    } else draw();

    return {
      set() { lang = SC.lang; draw(); return model; },
      filter(text) {
        query = text == null ? '' : String(text); found = matcher();
        if (picked >= 0 && found.on[picked] === false) { picked = -1; if (opts.onPick) opts.onPick(null); }
        hover = -1; draw(); return found.count;
      },
      model() { return model; },
      destroy() { dead = true; if (raf) root.cancelAnimationFrame(raf); clearInterval(poll); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); read.remove(); txt.remove(); },
    };
  }

  SC.viz.sitecells = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
