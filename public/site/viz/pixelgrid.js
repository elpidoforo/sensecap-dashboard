/*
  Pixel grid widget: the built-up ground of up to four city centres as squares of square pixels (canvas 2D, no libraries).
  SC.viz.pixelgrid.mount(host, model, opts) -> { destroy() }. The model comes from pixelgrid-data.js (all numbers are computed there).
  Pixels appear once in reading order (north row first, west to east), then everything is still. With prefers-reduced-motion
  one still frame is drawn. Without data nothing but the honest sentence is shown: no placeholder pattern.
*/
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  SC.viz = SC.viz || {};
  const D = () => SC.viz.pixelgridData;
  const L = () => (SC.lang === 'el' ? 1 : 0);
  const pick = (p) => (p ? p[L()] : '');
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', BG = '#050b16', DIM = 'rgba(125,211,252,0.62)', LINE = 'rgba(125,211,252,0.22)';
  const ENTRANCE_MS = 1600;

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const doc = host.ownerDocument;
    const el = (tag, css, text) => { const e = doc.createElement(tag); if (css) Object.assign(e.style, css); if (text != null) e.textContent = text; return e; };

    host.setAttribute('role', 'img');
    const wrap = el('div', { background: BG, border: '1px solid ' + LINE, borderRadius: '10px', padding: '0', color: DIM, font: '11px/1.5 ' + MONO, overflow: 'hidden', boxShadow: '0 0 24px rgba(125,211,252,0.06)' });
    const canvas = el('canvas', { display: 'block', width: '100%' });
    const empty = el('div', { padding: '18px 16px', font: '12px/1.6 ' + MONO, color: CYAN });
    const readout = el('div', { padding: '6px 14px 0', minHeight: '1.6em', color: CYAN });
    const small = el('div', { padding: '4px 14px 12px', color: DIM, fontSize: '10.5px' });
    wrap.append(canvas, empty, readout, small);
    host.appendChild(wrap);

    const ctx = canvas.getContext('2d');
    let lay = null, hover = null, shown = 0, raf = 0, t0 = 0, elapsedBase = 0, done = false, destroyed = false;
    const total = model.cities.reduce((a, c) => a + (c.available ? c.share.length : 0), 0);

    // text under the picture: DOM, so it wraps, scales and is read by screen readers
    function fillText() {
      host.setAttribute('aria-label', pick(model.ariaLabel));
      small.textContent = '';
      empty.textContent = '';
      if (!model.available) {
        empty.append(el('div', null, pick(model.emptyReason)), el('div', { marginTop: '6px', color: AMBER }, pick(model.emptyLine)));
        canvas.style.display = 'none'; readout.style.display = 'none'; empty.style.display = 'block';
        return;
      }
      canvas.style.display = 'block'; readout.style.display = 'block'; empty.style.display = 'none';
      const line = (t, css) => small.appendChild(el('div', css || null, t));
      for (const c of model.cities) line(c.available ? pick(c.summaryText) : pick(c.name) + ': ' + pick(c.reason));
      if (model.coverage) line(pick(model.coverage));
      if (model.note) line(pick(model.note), { color: AMBER });
      if (model.attribution) line(pick(model.attribution));
      if (model.demo) line(pick(model.demoLabel), { color: AMBER });
      line(pick(model.hint));
      readout.textContent = hover ? pick(hover.label) : pick(model.noHover);
    }

    function size() {
      const w = Math.max(120, Math.floor(host.clientWidth || wrap.clientWidth || 320));
      lay = D().layout(model, w);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(lay.width * dpr); canvas.height = Math.round(lay.height * dpr);
      canvas.style.height = lay.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      if (!lay || !model.available) return;
      const d = D();
      ctx.clearRect(0, 0, lay.width, lay.height);
      ctx.fillStyle = BG; ctx.fillRect(0, 0, lay.width, lay.height);
      ctx.textBaseline = 'alphabetic';
      for (const t of lay.tiles) {
        const city = model.cities[t.ci];
        ctx.font = '11px ' + MONO; ctx.fillStyle = CYAN; ctx.textAlign = 'left';
        ctx.fillText(pick(city.name), t.x, t.titleY);
        const order = d.screenOrder(city);
        const upTo = done ? order.length : Math.min(order.length, Math.floor(shown * order.length / total));
        const gap = t.px >= 6 ? 1 : 0;   // a hairline between pixels only when they are big enough
        for (let k = 0; k < upTo; k++) {
          const c = d.cellOf(city, order[k]);
          ctx.fillStyle = d.colorFor(c.share);
          ctx.fillRect(t.x + c.sx * t.px, t.y + c.sy * t.px, t.px - gap, t.px - gap);
        }
        if (hover && hover.ci === t.ci) {
          ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5;
          ctx.strokeRect(t.x + hover.sx * t.px + 0.5, t.y + hover.sy * t.px + 0.5, t.px - 1, t.px - 1);
        }
      }
      // legend: the same fixed scale for every city
      const g = lay.legend, sc = model.scale, grad = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
      for (const s of sc.stops) grad.addColorStop((s.v - sc.min) / (sc.max - sc.min), s.color);
      ctx.fillStyle = grad; ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1);
      ctx.font = '10px ' + MONO; ctx.fillStyle = DIM; ctx.textAlign = 'center';
      for (const tk of sc.ticks) {
        const x = g.x + (tk.v - sc.min) / (sc.max - sc.min) * g.w;
        ctx.fillRect(Math.round(x), g.y + g.h, 1, 3);
        ctx.textAlign = tk.v === sc.min ? 'left' : tk.v === sc.max ? 'right' : 'center';
        ctx.fillText(tk.label, tk.v === sc.min ? g.x : tk.v === sc.max ? g.x + g.w : x, g.y + g.h + 14);
      }
    }

    function frame(now) {
      raf = 0;
      if (destroyed || document.hidden) return;
      if (!t0) t0 = now;
      const e = elapsedBase + (now - t0);
      shown = Math.min(total, Math.round(e / ENTRANCE_MS * total));
      if (e >= ENTRANCE_MS) { done = true; shown = total; }
      draw();
      if (!done) raf = requestAnimationFrame(frame);
    }
    function start() {
      if (raf || done || destroyed) return;
      t0 = 0; raf = requestAnimationFrame(frame);
    }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (t0) { elapsedBase = Math.min(ENTRANCE_MS, elapsedBase + (performance.now() - t0)); t0 = 0; } }
    const onVis = () => { if (document.hidden) stop(); else if (!done) start(); };

    function point(ev) {
      const r = canvas.getBoundingClientRect();
      return D().hit(model, lay, (ev.clientX - r.left) * (lay.width / r.width), (ev.clientY - r.top) * (lay.height / r.height));
    }
    function onMove(ev) {
      if (!done) return;   // the entrance is still running: nothing to read yet
      const h = point(ev);
      if ((h && hover && h.ci === hover.ci && h.i === hover.i) || (!h && !hover)) return;
      hover = h; readout.textContent = hover ? pick(hover.label) : pick(model.noHover);
      draw();
      if (typeof opts.onPick === 'function') opts.onPick(h ? { city: h.city, row: h.row, col: h.col, share: h.share, label: h.label } : null);
    }
    function onLeave() { if (!hover) return; hover = null; readout.textContent = pick(model.noHover); draw(); if (typeof opts.onPick === 'function') opts.onPick(null); }

    fillText();
    if (model.available) {
      size();
      if (reduce) { done = true; shown = total; draw(); } else { draw(); start(); }
    }
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (model.available) { size(); draw(); } }) : null;
    if (ro) ro.observe(host);
    // the language can change while the page is open: the page calls refresh() after setting SC.lang
    return {
      refresh() { fillText(); draw(); },
      destroy() { destroyed = true; stop(); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); wrap.remove(); host.removeAttribute('role'); host.removeAttribute('aria-label'); },
    };
  }

  SC.viz.pixelgrid = { mount };
})();
