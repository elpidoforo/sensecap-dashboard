/*
  Counter widget: one big glowing number with a small line beside it, on one canvas (2D, no libraries). All numbers and sentences
  come from the model built by counter-data.js; this file only draws and moves between months that the model already holds.
  One district at a time. The line is the district's last months; the amber dot is the selected month.

  Motion: nothing moves on its own. When the reader changes the month (hover, drag, click, keys, set()), the digits of the big
  number roll once to the new figure (old digits slide out, new ones slide in; no in-between numbers are ever shown). Under
  prefers-reduced-motion, or while the page is hidden, the change is instant.

  SC.viz.counter = { mount(host, model, opts) } -> { set({district, month}), get(), destroy() }
    opts.district  code from model.choices (default model.district)
    opts.month     'YYYY-MM' within model.months (default model.month = latest month with a figure)
    opts.onPick({ month, label:[en,el], value, district, districtName:[en,el], pinned })  on every change of the shown month
  Pointer: moving along the line previews a month, leaving returns to the kept month; click or drag keeps (pins) the month.
  Keys (host is focusable): Left/Right one month, Home/End first/last month of the line.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {}); SC.viz = SC.viz || {};
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', INK = '#E2EEF9', DIM = '#7f93a8', BG = '#050b16', LINE = 'rgba(125,211,252,0.35)', FAINT = 'rgba(125,211,252,0.12)';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const ROLL_MS = 260;

  function mount(host, model, opts) {
    opts = opts || {};
    const doc = host.ownerDocument, win = doc.defaultView || root;
    const L = () => (SC.lang === 'el' ? 1 : 0), tx = (pair) => (Array.isArray(pair) ? pair[L()] : String(pair == null ? '' : pair));
    const canvas = doc.createElement('canvas');
    canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.touchAction = 'pan-y';
    host.appendChild(canvas);
    const hadTab = host.hasAttribute('tabindex'), oldTab = host.getAttribute('tabindex');
    host.setAttribute('role', 'img');
    if (!model.empty && !hadTab) host.setAttribute('tabindex', '0');
    const ctx = canvas.getContext('2d');
    const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const views = model.views || {};
    let code = opts.district != null && views[String(opts.district)] ? String(opts.district) : model.district;
    let view = code != null ? views[code] : null;
    const idxOfMonth = (m) => (m == null ? -1 : (model.months || []).indexOf(String(m)));
    let pinned = -1;
    if (view) { const i = idxOfMonth(opts.month); pinned = i >= 0 ? i : (code === model.district && model.index >= 0 ? model.index : view.defaultIndex); }
    let hover = -1, dragging = false, focused = false;
    let W = 0, H = 0, dpr = 1, geo = null, raf = 0, dead = false, roll = null, lastShown = -1, lastCode = code;

    const shown = () => (hover >= 0 ? hover : pinned);
    const pt = (i) => (view && i >= 0 ? view.points[i] : null);
    const pickOf = (i) => { const p = pt(i); return p ? { month: p.m, label: p.label, value: p.v, district: view.code, districtName: view.name, pinned: i === pinned } : null; };
    function setAria() {
      const p = pt(pinned);
      host.setAttribute('aria-label', view && p ? tx(view.ariaLabel) + ' ' + tx(p.aria) : tx(model.ariaLabel || model.empty));
    }
    setAria();

    function wrap(text, maxW, maxLines) {
      const words = String(text).split(/\s+/), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      if (maxLines && lines.length > maxLines) { lines.length = maxLines; let s = lines[maxLines - 1]; while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); lines[maxLines - 1] = s + '…'; }
      return lines;
    }

    // fixed slots, so the picture does not jump when the sentence under the number changes length
    function layout() {
      const narrow = W < 560, pad = narrow ? 14 : 22;
      const g = { narrow, pad };
      ctx.font = '10px ' + MONO;
      g.cap = model.mark ? wrap(tx(model.strings.note) + ', ' + model.mark.label[L()] + ': ' + tx(model.mark.text), W - pad * 2) : [];
      const capH = g.cap.length ? g.cap.length * 13 + 12 : 0;
      if (narrow) {
        g.numX = pad; g.numW = W - pad * 2; g.numSize = 76; g.titleY = 14; g.numY = 34; g.capY = 122; g.secY = 160; g.textW = W - pad * 2;
        g.headX = pad; g.headY = 222; g.x0 = pad + 30; g.x1 = W - pad - 6; g.y0 = 262; g.y1 = 372; g.hintX = pad; g.hintY = 398; g.hintW = W - pad * 2; g.hintLines = 2;
        g.noteY = 398 + 2 * 13 + 10;
      } else {
        const lw = Math.max(220, Math.min(360, Math.round(W * 0.38)));
        g.numX = pad; g.numW = lw; g.numSize = 104; g.titleY = 18; g.numY = 44; g.capY = 164; g.secY = 204; g.textW = lw;
        g.headX = pad + lw + 30; g.headY = 18; g.x0 = g.headX + 34; g.x1 = W - pad - 8; g.y0 = 62; g.y1 = 204; g.hintX = g.headX; g.hintY = 232; g.hintW = W - pad - g.headX; g.hintLines = 2;
        g.noteY = 270;
      }
      g.H = g.noteY + capH + (capH ? 0 : -6);
      const n = Math.max(1, (view ? view.points.length : 1) - 1), max = view && view.max > 0 ? view.max : 1;
      g.xOf = (i) => (view && view.points.length === 1 ? (g.x0 + g.x1) / 2 : g.x0 + ((g.x1 - g.x0) * i) / n);
      g.yOf = (v) => g.y1 - (v / max) * (g.y1 - g.y0);
      return g;
    }

    function drawNumber(g, p, now) {
      const target = tx(p.valueText);
      let size = g.numSize;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const fontOf = (s) => '600 ' + s + 'px ' + MONO;
      const longest = roll && roll.from.length > target.length ? roll.from : target;
      ctx.font = fontOf(size);
      const need = ctx.measureText(longest).width; if (need > g.numW) { size = Math.max(28, Math.floor((size * g.numW) / need)); ctx.font = fontOf(size); }
      const cw = ctx.measureText('0').width, y = g.numY + (g.numSize - size) / 2;
      let e = 1; if (roll) { const t = Math.min(1, (now - roll.t0) / ROLL_MS); e = 1 - Math.pow(1 - t, 3); if (t >= 1) roll = null; }
      const glyph = (ch, x, yy, alpha, dim) => {
        if (alpha <= 0.01 || ch === ' ') return;
        ctx.globalAlpha = alpha;
        if (dim) { ctx.font = '300 ' + size + 'px ' + MONO; ctx.fillStyle = DIM; ctx.fillText(ch, x, yy); ctx.font = fontOf(size); }
        else { ctx.shadowColor = 'rgba(125,211,252,0.8)'; ctx.shadowBlur = size * 0.22; ctx.fillStyle = CYAN; ctx.fillText(ch, x, yy); ctx.shadowBlur = 0; ctx.fillStyle = '#E6F7FF'; ctx.fillText(ch, x, yy); }
        ctx.globalAlpha = 1;
      };
      ctx.save(); ctx.beginPath(); ctx.rect(0, g.numY - 10, g.narrow ? W : g.numX + g.numW + 20, g.numSize + 4); ctx.clip();
      if (!roll) { for (let k = 0; k < target.length; k++) glyph(target[k], g.numX + k * cw, y, 1, p.missing); }
      else {
        const n = Math.max(roll.from.length, target.length), d = roll.dir * size * 0.55;
        for (let k = 0; k < n; k++) {
          const oc = roll.from[k] || ' ', nc = target[k] || ' ', x = g.numX + k * cw;
          if (oc === nc && roll.fromDim === p.missing) glyph(nc, x, y, 1, p.missing);
          else { glyph(oc, x, y - d * e, 1 - e, roll.fromDim); glyph(nc, x, y + d * (1 - e), e, p.missing); }
        }
      }
      ctx.restore();
    }

    function drawSpark(g) {
      const ps = view.points, s = model.strings;
      ctx.font = '11px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
      ctx.fillText(tx(s.spark), g.headX, g.headY);
      // frame: baseline (0) and the line of the largest month, both labelled
      ctx.font = '10px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(g.x0, g.y1 + 0.5); ctx.lineTo(g.x1, g.y1 + 0.5); ctx.stroke();
      ctx.fillStyle = DIM; ctx.fillText('0', g.x0 - 7, g.y1);
      if (view.hasValues && view.max > 0) {
        ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(g.x0, g.y0 + 0.5); ctx.lineTo(g.x1, g.y0 + 0.5); ctx.stroke();
        ctx.fillText(tx(view.maxText), g.x0 - 7, g.y0);
      }
      // annotated month: dashed line with its month as a tag (the text of the note is the caption under the picture)
      const mk = model.mark;
      if (mk && mk.index >= 0) {
        const x = Math.round(g.xOf(mk.index)) + 0.5;
        ctx.strokeStyle = 'rgba(125,211,252,0.6)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, g.y0 - 4); ctx.lineTo(x, g.y1); ctx.stroke(); ctx.setLineDash([]);
      }
      // the series: runs of months with a figure; a month without one breaks the line
      let i = 0;
      while (i < ps.length) {
        if (ps[i].missing) { i++; continue; }
        let j = i; while (j + 1 < ps.length && !ps[j + 1].missing) j++;
        if (j > i) {
          ctx.beginPath(); ctx.moveTo(g.xOf(i), g.y1); for (let k = i; k <= j; k++) ctx.lineTo(g.xOf(k), g.yOf(ps[k].v)); ctx.lineTo(g.xOf(j), g.y1); ctx.closePath();
          const gr = ctx.createLinearGradient(0, g.y0, 0, g.y1); gr.addColorStop(0, 'rgba(125,211,252,0.26)'); gr.addColorStop(1, 'rgba(125,211,252,0.02)'); ctx.fillStyle = gr; ctx.fill();
          ctx.beginPath(); for (let k = i; k <= j; k++) { const x = g.xOf(k), y = g.yOf(ps[k].v); if (k === i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
          ctx.strokeStyle = CYAN; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.shadowColor = 'rgba(125,211,252,0.6)'; ctx.shadowBlur = 6; ctx.stroke(); ctx.shadowBlur = 0; ctx.lineWidth = 1;
        } else { ctx.fillStyle = CYAN; ctx.beginPath(); ctx.arc(g.xOf(i), g.yOf(ps[i].v), 2, 0, Math.PI * 2); ctx.fill(); }
        i = j + 1;
      }
      // months with no figure: a short grey mark under the baseline, never a point on the line
      ctx.fillStyle = DIM; ps.forEach((p) => { if (p.missing) ctx.fillRect(Math.round(g.xOf(p.i)) - 2, g.y1 + 3, 4, 2); });
      // first and last month under the line
      ctx.font = '10px ' + MONO; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
      ctx.textAlign = 'left'; ctx.fillText(ps[0].label[L()], g.x0, g.y1 + 9);
      if (ps.length > 1) { ctx.textAlign = 'right'; ctx.fillText(ps[ps.length - 1].label[L()], g.x1, g.y1 + 9); }
      if (mk && mk.index > 3 && mk.index < ps.length - 4) { ctx.textAlign = 'center'; ctx.fillStyle = '#9fdcf7'; ctx.fillText(mk.label[L()], g.xOf(mk.index), g.y1 + 9); }
      // kept month (amber dot) and, while previewing another month, a ring on that one
      const mark = (idx, kept) => {
        const p = ps[idx]; if (!p) return;
        const x = g.xOf(idx), y = p.missing ? g.y1 : g.yOf(p.v);
        ctx.strokeStyle = kept ? 'rgba(251,191,36,0.55)' : 'rgba(226,238,249,0.45)'; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, g.y0 - 4); ctx.lineTo(Math.round(x) + 0.5, g.y1); ctx.stroke();
        if (kept) {
          if (p.missing) { ctx.strokeStyle = AMBER; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = BG; ctx.fill(); ctx.stroke(); ctx.lineWidth = 1; }
          else { ctx.shadowColor = 'rgba(251,191,36,0.9)'; ctx.shadowBlur = 10; ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
        } else { ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillStyle = BG; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.lineWidth = 1; }
      };
      const sh = shown();
      mark(pinned, true); if (sh !== pinned) mark(sh, false);
      // tag with the shown month above the line, kept inside the frame
      const p = ps[sh]; if (p) {
        ctx.font = '11px ' + MONO; const t = p.label[L()], w = ctx.measureText(t).width;
        const x = Math.max(g.x0 + w / 2, Math.min(g.x1 - w / 2, g.xOf(sh)));
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = sh === pinned ? AMBER : INK; ctx.fillText(t, x, g.y0 - 7);
      }
      ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
      wrap(tx(g.narrow ? s.hintShort : s.hint), g.hintW, g.hintLines).forEach((l, k) => ctx.fillText(l, g.hintX, g.hintY + k * 13));
    }

    function draw(now) {
      if (dead || !W) return;
      const g = (geo = layout());
      if (g.H !== H && !model.empty) { H = g.H; canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
      if (model.empty || !view) {
        ctx.fillStyle = DIM; ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const ls = wrap(tx(model.empty || model.ariaLabel), W - 40); ls.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (ls.length - 1) / 2) * 18)); return;
      }
      const p = pt(shown());
      ctx.font = '11px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = DIM;
      ctx.fillText(wrap(tx(model.n), g.textW, 1)[0], g.numX, g.titleY);
      drawNumber(g, p, now == null ? (win.performance ? win.performance.now() : Date.now()) : now);
      ctx.font = '12px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = INK;
      wrap(tx(p.caption), g.textW, 2).forEach((l, k) => ctx.fillText(l, g.numX, g.capY + k * 16));
      ctx.font = '11px ' + MONO; ctx.fillStyle = p.reason === 'notcomparable' ? '#9fdcf7' : DIM;
      wrap(tx(p.second), g.textW, 3).forEach((l, k) => ctx.fillText(l, g.numX, g.secY + k * 15));
      if (!g.narrow) { ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(g.headX - 15.5, 16); ctx.lineTo(g.headX - 15.5, g.noteY - 16); ctx.stroke(); }
      drawSpark(g);
      if (g.cap.length) {
        ctx.strokeStyle = FAINT; ctx.beginPath(); ctx.moveTo(g.pad, g.noteY - 5.5); ctx.lineTo(W - g.pad, g.noteY - 5.5); ctx.stroke();
        ctx.font = '10px ' + MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#9fdcf7';
        g.cap.forEach((l, k) => ctx.fillText(l, g.pad, g.noteY + 2 + k * 13));
      }
      if (focused) { ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2); ctx.lineWidth = 1; }
    }

    function tick(now) { raf = 0; if (dead) return; if (doc.hidden) { roll = null; draw(now); return; } draw(now); if (roll) raf = win.requestAnimationFrame(tick); }

    // the shown month (or district) changed: start the digit roll, redraw, tell the page
    function changed(silent) {
      const sh = shown(), p = pt(sh); if (!p) return;
      if (sh !== lastShown || code !== lastCode) {
        const old = lastCode != null && views[lastCode] ? views[lastCode].points[lastShown] : null;
        const from = old ? tx(old.valueText) : null, to = tx(p.valueText);
        if (from !== null && from !== to && !reduce && !doc.hidden && W) {
          const dir = old.v !== null && p.v !== null ? (p.v > old.v ? 1 : -1) : 1;
          roll = { from, fromDim: old.missing, dir, t0: win.performance ? win.performance.now() : Date.now() };
        } else roll = null;
        lastShown = sh; lastCode = code;
        if (!silent && opts.onPick) { try { opts.onPick(pickOf(sh)); } catch (e) { /* a page handler error must not stop the drawing */ } }
      }
      if (roll) { if (!raf) raf = win.requestAnimationFrame(tick); } else draw();
    }

    function size() {
      const r = host.getBoundingClientRect(); const w = Math.max(240, Math.round(r.width || host.clientWidth || 600));
      dpr = Math.min(2, win.devicePixelRatio || 1); W = w;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      H = model.empty || !view ? 160 : layout().H;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px';
      draw();
    }

    function indexAt(ev, anyY) {
      if (!geo || !view) return -1;
      const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top, n = view.points.length;
      if (!anyY && (x < geo.x0 - 12 || x > geo.x1 + 12 || y < geo.y0 - 26 || y > geo.y1 + 26)) return -1;
      if (n === 1) return 0;
      return Math.max(0, Math.min(n - 1, Math.round(((x - geo.x0) / (geo.x1 - geo.x0)) * (n - 1))));
    }
    const pin = (i) => { if (i < 0 || !pt(i)) return; const was = pinned; pinned = i; hover = -1; if (was !== i) setAria(); if (was !== i && lastShown === i) { lastShown = -2; } changed(); };
    const onDown = (ev) => { if (ev.button != null && ev.button > 0) return; const i = indexAt(ev, false); if (i < 0) return; dragging = true; try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* not capturable */ } pin(i); };
    const onMove = (ev) => {
      if (!view) return;
      if (dragging) { const i = indexAt(ev, true); if (i >= 0 && i !== pinned) pin(i); return; }
      if (ev.pointerType === 'touch') return;
      const i = indexAt(ev, false); canvas.style.cursor = i >= 0 ? 'pointer' : 'default';
      if (i !== hover) { hover = i; changed(); }
    };
    const onUp = (ev) => { if (!dragging) return; dragging = false; try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* already released */ } };
    const onLeave = () => { if (dragging) return; if (hover !== -1) { hover = -1; changed(); } };
    const onKey = (ev) => {
      if (!view || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const n = view.points.length; let i = pinned;
      if (ev.key === 'ArrowLeft') i = Math.max(0, pinned - 1);
      else if (ev.key === 'ArrowRight') i = Math.min(n - 1, pinned + 1);
      else if (ev.key === 'Home') i = 0;
      else if (ev.key === 'End') i = n - 1;
      else return;
      ev.preventDefault(); hover = -1; if (i !== pinned) pin(i); else changed();
    };
    const onFocus = () => { let kb = true; try { kb = host.matches(':focus-visible'); } catch (e) { /* older browser: always show the ring */ } focused = kb; draw(); }, onBlur = () => { focused = false; draw(); };
    const onVis = () => { if (!doc.hidden) draw(); };
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp); canvas.addEventListener('pointerleave', onLeave);
    host.addEventListener('keydown', onKey); host.addEventListener('focus', onFocus); host.addEventListener('blur', onBlur);
    doc.addEventListener('visibilitychange', onVis);
    let ro = null; if (win.ResizeObserver) { ro = new win.ResizeObserver(() => size()); ro.observe(host); } else win.addEventListener('resize', size);
    lastShown = pinned; lastCode = code;
    size();

    return {
      // change district and/or month from the page; unknown values are ignored. Returns the record now shown. Does not call onPick.
      set(o) {
        o = o || {};
        if (dead || model.empty) return null;
        if (o.district != null && views[String(o.district)]) { code = String(o.district); view = views[code]; }
        if (o.month != null) { const i = idxOfMonth(o.month); if (i >= 0) pinned = i; }
        hover = -1; setAria(); changed(true);
        return pickOf(pinned);
      },
      get() { return model.empty || !view ? null : pickOf(pinned); },
      destroy() {
        dead = true; if (raf) win.cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else win.removeEventListener('resize', size);
        doc.removeEventListener('visibilitychange', onVis);
        canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('pointerleave', onLeave);
        host.removeEventListener('keydown', onKey); host.removeEventListener('focus', onFocus); host.removeEventListener('blur', onBlur);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        host.removeAttribute('role'); host.removeAttribute('aria-label');
        if (!hadTab) host.removeAttribute('tabindex'); else host.setAttribute('tabindex', oldTab);
      },
    };
  }

  SC.viz.counter = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
