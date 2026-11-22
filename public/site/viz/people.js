/*
  People widget: SC.viz.people.mount(host, model, opts) -> { destroy(), set({city}), model() }.
  The model is built by people-data.js (one city at a time: residents as a field of blocks, age bands as horizontal bars).
  Still data (a census): nothing moves, apart from one fill-in when the widget first appears (none under reduced motion,
  none while the tab is hidden). After that the picture is redrawn only on resize, language change, hover, pick or set().
  opts.city       key of the city to show first (default: the model's own).
  opts.chooser    false hides the built-in city buttons (the page then calls handle.set({city}) from its own control).
  opts.onPick({band, count, share, label:[en,el], city}) when an age bar is hovered, clicked or reached with Up/Down;
                  null when nothing is under the pointer and nothing is picked.
  opts.onSet({city}) after the shown city changed through the built-in buttons.
  handle.set({city}) returns the view model now shown (with textRows and ariaLabel).
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)', WHITE = '#e8f6ff';
  const pickCity = (m, id) => (m && m.cities && m.cities[id] ? Object.assign({}, m, m.cities[id], { city: String(id) }) : m);

  function mount(host, model0, opts) {
    opts = opts || {};
    let model = opts.city != null ? pickCity(model0, String(opts.city)) : model0;
    let hover = -1, picked = -1, w = 0, hits = [], grow = 1, raf = 0, dead = false;
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    const still = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    host.setAttribute('role', 'img');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const sw = el('div', 'display:none;gap:6px;margin:0 0 8px;flex-wrap:wrap;font-size:11px');
    const cv = el('canvas', 'display:block;width:100%;cursor:default;outline:none;border-radius:4px'), ctx = cv.getContext('2d');
    const read = el('p', 'margin:6px 0 0;min-height:2.9em;font-size:11px;line-height:1.45;color:' + DIM);
    const txt = el('div', 'margin-top:6px;font-size:11px;line-height:1.5;color:' + DIM);
    cv.tabIndex = 0;
    host.append(sw, cv, read, txt);
    const drawable = () => !!(model.available && (model.residents.available || model.age.bands.length));

    function buildSwitch() {
      sw.textContent = '';
      if (opts.chooser === false || !model.available || model.choices.length < 2) { sw.style.display = 'none'; return; }
      sw.style.display = 'flex';
      const lab = el('span', 'align-self:center;color:' + DIM); lab.textContent = L(model.strings.choose); sw.append(lab);
      for (const c of model.choices) {
        const on = c.id === model.city;
        const b = el('button', 'font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;background:' + (on ? 'rgba(125,211,252,0.18)' : 'transparent') + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,0.4)');
        b.type = 'button'; b.textContent = L(c.name); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', () => { if (c.id === model.city) return; show(c.id); if (opts.onSet) opts.onSet({ city: c.id }); });
        sw.append(b);
      }
    }
    function show(id) {
      const next = pickCity(model, String(id)); if (next === model || next.city === model.city) return model;
      model = next; hover = -1; picked = -1; grow = 1; if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
      buildSwitch(); draw(); if (opts.onPick) opts.onPick(null);
      return model;
    }
    const item = (i) => { const b = model.age.bands[i]; return b ? { band: b.band, count: b.count, share: b.share, label: b.label, city: model.city } : null; };

    // the residents part: the plain number, what a block is, then the blocks (how many comes from the model)
    function drawResidents(x, y, ww, narrow, measure) {
      const r = model.residents, s = narrow ? 8 : 9, gap = 3, pitch = s + gap, cols = Math.max(1, Math.floor((ww + gap) / pitch)), rows = Math.ceil(r.blocks / cols);
      const top = y + 62, h = 62 + rows * pitch + 4;
      if (measure) return h;
      ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = '600 ' + (narrow ? 26 : 30) + 'px ' + MONO; ctx.fillText(r.text[idx()], x, y + 18);
      const nw = ctx.measureText(r.text[idx()]).width;
      ctx.fillStyle = CYAN; ctx.font = (narrow ? 11 : 12) + 'px ' + MONO; ctx.fillText(L(model.strings.residents), x + nw + 8, y + 22);
      // key: one sample block and what it stands for
      ctx.fillStyle = CYAN; ctx.fillRect(x, y + 41, s, s);
      ctx.fillStyle = DIM; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillText(L(r.unitText), x + s + 6, y + 46);
      const shown = Math.floor(r.blocks * grow + 1e-9);
      ctx.save(); ctx.shadowColor = 'rgba(125,211,252,0.35)'; ctx.shadowBlur = 4; ctx.fillStyle = CYAN; ctx.globalAlpha = 0.86;
      for (let i = 0; i < shown; i++) ctx.fillRect(x + (i % cols) * pitch, top + Math.floor(i / cols) * pitch, s, s);
      ctx.restore();
      return h;
    }

    // the age part: one row per band (name, count and share from the model, a bar whose length is the share)
    function drawAge(x, y, ww, narrow, measure) {
      const a = model.age, pitch = narrow ? 42 : 46, barH = 12, h = 22 + a.bands.length * pitch + 22 + (a.meanAge ? 22 : 0);
      if (measure) return h;
      ctx.textAlign = 'left'; ctx.fillStyle = CYAN; ctx.font = '600 ' + (narrow ? 11 : 12) + 'px ' + MONO; ctx.fillText(L(model.strings.ages), x, y + 7);
      const y0 = y + 22;
      a.bands.forEach((b, i) => {
        const ry = y0 + i * pitch, on = i === picked, hv = i === hover, col = on ? AMBER : (hv ? WHITE : CYAN);
        hits.push({ x, y: ry - 2, w: ww, h: pitch, i });
        if (on || hv) { ctx.fillStyle = on ? 'rgba(251,191,36,0.07)' : 'rgba(125,211,252,0.07)'; ctx.fillRect(x - 4, ry - 2, ww + 8, pitch - 4); }
        ctx.font = (narrow ? 11 : 12) + 'px ' + MONO; ctx.textAlign = 'left'; ctx.fillStyle = on || hv ? col : WHITE; ctx.fillText(L(b.name), x, ry + 8);
        ctx.textAlign = 'right'; ctx.fillStyle = col; ctx.fillText(b.countText[idx()] + ' · ' + b.shareText[idx()], x + ww, ry + 8);
        const by = ry + 20;
        ctx.fillStyle = 'rgba(125,211,252,0.08)'; ctx.fillRect(x, by, ww, barH);
        ctx.save(); ctx.shadowColor = on ? 'rgba(251,191,36,0.55)' : 'rgba(125,211,252,0.45)'; ctx.shadowBlur = on || hv ? 10 : 5; ctx.fillStyle = col; ctx.globalAlpha = on || hv ? 1 : 0.86;
        ctx.fillRect(x, by, Math.max(b.count > 0 ? 1 : 0, b.t * ww * grow), barH); ctx.restore();
      });
      // scale under the bars
      const ay = y0 + a.bands.length * pitch + 2;
      ctx.font = (narrow ? 9 : 10) + 'px ' + MONO; ctx.fillStyle = DIM;
      for (const tk of a.axis.ticks) {
        const tx = x + tk.t * ww; ctx.fillStyle = 'rgba(125,211,252,0.4)'; ctx.fillRect(Math.round(Math.min(tx, x + ww - 1)), ay - 6, 1, 4);
        ctx.fillStyle = DIM; ctx.textAlign = tk.t <= 0 ? 'left' : (tk.t >= 1 ? 'right' : 'center'); ctx.fillText(tk.text[idx()], tx, ay + 6);
      }
      if (a.meanAge) { ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; fit(L(a.meanAge.short), x, ay + 28, ww); }
      return h;
    }
    // one line of canvas text that never runs past its box (the full sentence is always in the text below as well)
    function fit(s, x, y, ww) { let t = s; if (ctx.measureText(t).width > ww) { while (t.length > 4 && ctx.measureText(t + '…').width > ww) t = t.slice(0, -1); t += '…'; } ctx.fillText(t, x, y); }

    // words of one sentence broken into at most two canvas lines
    function wrap(s, ww) {
      const out = ['']; for (const word of String(s).split(' ')) { const t = out[out.length - 1] ? out[out.length - 1] + ' ' + word : word; if (ctx.measureText(t).width <= ww || !out[out.length - 1]) out[out.length - 1] = t; else out.push(word); }
      return out.length > 2 ? [out[0], out.slice(1).join(' ')] : out;
    }

    function draw() {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel)); cv.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = ''; hits = [];
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!drawable()) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; read.textContent = ''; read.style.minHeight = '0';
        if (!model.available) line(L(model.empty), CYAN);
        else { line(L(model.cityName), WHITE); line(L(model.residents.empty), CYAN); if (model.age.empty) line(L(model.age.empty), CYAN); if (model.age.meanAge) line(L(model.age.meanAge.label)); }
        return;
      }
      const res = model.residents.available, age = model.age.bands.length > 0, narrow = w < 600, both = res && age, side = both && !narrow;
      const sub = L(model.boundary || model.honesty || model.title); ctx.font = (narrow ? 10 : 11) + 'px ' + MONO;
      const subLines = wrap(sub, w - 4), head = 26 + subLines.length * 14, gapX = 32, leftW = side ? Math.floor((w - gapX) * 0.46) : w - 2, rightX = side ? leftW + gapX : 0, rightW = (side ? w - rightX : w) - 6;
      const hRes = res ? drawResidents(0, 0, leftW, narrow, true) : 0, hAge = age ? drawAge(0, 0, rightW, narrow, true) : 0;
      const hgt = head + (side ? Math.max(hRes, hAge) : hRes + (both ? 16 : 0) + hAge) + 2;
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt); ctx.textBaseline = 'middle';
      // header: the city shown, then which boundary and census the numbers belong to
      ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = '600 ' + (narrow ? 13 : 14) + 'px ' + MONO; ctx.fillText(L(model.cityName), 0, 9);
      ctx.fillStyle = DIM; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; subLines.forEach((t, i) => ctx.fillText(t, 0, 27 + i * 14));
      if (res) drawResidents(0, head, leftW, narrow, false);
      if (age) drawAge(rightX, side ? head : head + (res ? hRes + 16 : 0), rightW, narrow, false);
      if (side) { ctx.fillStyle = 'rgba(125,211,252,0.14)'; ctx.fillRect(leftW + gapX / 2, head, 1, hgt - head - 4); }
      // text under the picture: the read-out, then what the picture does and does not say (all from the model)
      const sel = hover >= 0 ? hover : picked, b = sel >= 0 ? model.age.bands[sel] : null;
      read.style.minHeight = age ? '2.9em' : '0';
      read.textContent = b ? L(b.label) : (age ? L(model.strings.hint) : ''); read.style.color = b ? WHITE : DIM;
      if (!res) line(L(model.residents.empty), CYAN);
      if (!age) { line(L(model.age.empty), CYAN); if (model.age.meanAge) line(L(model.age.meanAge.label)); }
      model.notes.forEach((n, i) => line(L(n), i === 0 && model.honesty ? AMBER : (model.age.matches === false && n === model.age.sumNote ? AMBER : '')));
    }

    const at = (e) => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; const h = hits.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h); return h ? h.i : -1; };
    const tell = () => { if (opts.onPick) opts.onPick(item(hover >= 0 ? hover : picked)); };
    const onMove = (e) => { const i = at(e); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'pointer' : 'default'; draw(); tell(); } };
    const onLeave = () => { if (hover >= 0) { hover = -1; draw(); tell(); } };
    const onClick = (e) => { const i = at(e); picked = i; draw(); if (opts.onPick) opts.onPick(item(i)); };
    const onKey = (e) => {
      const n = model.age.bands.length; if (!n) return;
      let i = picked;
      if (e.key === 'ArrowDown') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1);
      else if (e.key === 'ArrowUp') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1; else if (e.key === 'Escape') i = -1; else return;
      e.preventDefault(); hover = -1; picked = i; draw(); if (opts.onPick) opts.onPick(item(i));
    };
    const onFocus = () => { cv.style.boxShadow = '0 0 0 2px ' + AMBER; }, onBlur = () => { cv.style.boxShadow = 'none'; };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);
    cv.addEventListener('keydown', onKey); cv.addEventListener('focus', onFocus); cv.addEventListener('blur', onBlur);

    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (document.hidden) { if (raf) { root.cancelAnimationFrame(raf); raf = 0; } grow = 1; } else draw(); };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; buildSwitch(); draw(); } }, 500);
    buildSwitch();
    // the one entrance: blocks and bars fill in once. Never again, and not at all under reduced motion or in a hidden tab.
    if (!still() && !document.hidden && root.requestAnimationFrame && drawable()) {
      grow = 0; let t0 = 0;
      const step = (t) => { if (dead) return; if (!t0) t0 = t; const k = Math.min(1, (t - t0) / 650); grow = 1 - Math.pow(1 - k, 3); draw(); raf = k < 1 ? root.requestAnimationFrame(step) : 0; };
      draw(); raf = root.requestAnimationFrame(step);
    } else draw();

    return {
      set(o) { if (o && o.city != null) show(o.city); return model; },
      model() { return model; },
      destroy() { dead = true; if (raf) root.cancelAnimationFrame(raf); clearInterval(poll); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); sw.remove(); read.remove(); txt.remove(); },
    };
  }

  SC.viz.people = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
