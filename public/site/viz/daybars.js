/*
  Day bars widget: SC.viz.daybars.mount(host, model, opts) -> { destroy(), set({site}), model() }.
  The model is built by daybars-data.js (one site at a time, one bar per day, missing days hatched with no bar).
  Still data: the bars do not move, apart from one grow-in when the widget first appears (none under reduced motion,
  none while the tab is hidden). After that the picture is redrawn only on resize, language change, hover, pick or set().
  opts.site       id of the site to show first (default: the model's own).
  opts.chooser    false hides the built-in site buttons (the page then calls handle.set({site}) from its own control).
  opts.onPick({day, value, label:[en,el], missing, site}) when a bar is hovered, clicked or reached with Left/Right;
                  null when nothing is under the pointer and nothing is picked.
  opts.onSet({site}) after the shown site changed through the built-in buttons.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)';
  const pickSite = (m, id) => (m && m.sites && m.sites[id] ? Object.assign({}, m, m.sites[id], { site: String(id) }) : m);

  function mount(host, model0, opts) {
    opts = opts || {};
    let model = opts.site != null ? pickSite(model0, String(opts.site)) : model0;
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

    function buildSwitch() {
      sw.textContent = '';
      if (opts.chooser === false || !model.available || model.choices.length < 2) { sw.style.display = 'none'; return; }
      sw.style.display = 'flex';
      const lab = el('span', 'align-self:center;color:' + DIM); lab.textContent = L(model.strings.choose); sw.append(lab);
      for (const c of model.choices) {
        const on = c.id === model.site;
        const b = el('button', 'font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;background:' + (on ? 'rgba(125,211,252,0.18)' : 'transparent') + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,0.4)');
        b.type = 'button'; b.textContent = L(c.name); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', () => { if (c.id === model.site) return; show(c.id); if (opts.onSet) opts.onSet({ site: c.id }); });
        sw.append(b);
      }
    }
    function show(id) {
      const next = pickSite(model, String(id)); if (next === model) return model;
      model = next; hover = -1; picked = -1; grow = 1; if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
      buildSwitch(); draw(); if (opts.onPick) opts.onPick(null);
      return model;
    }
    const item = (i) => { const d = model.days[i]; return d ? { day: d.day, value: d.value, label: d.label, missing: d.missing, site: model.site } : null; };

    function hatch(x, y, ww, hh) {
      ctx.fillStyle = 'rgba(125,211,252,0.05)'; ctx.fillRect(x, y, ww, hh);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip(); ctx.strokeStyle = 'rgba(125,211,252,0.4)'; ctx.lineWidth = 1; ctx.beginPath();
      for (let k = -hh; k < ww; k += 6) { ctx.moveTo(x + k, y + hh); ctx.lineTo(x + k + hh, y); }
      ctx.stroke(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(125,211,252,0.55)'; ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1); ctx.restore();
    }

    function draw() {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel)); cv.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!model.available || !model.hasDays) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; hits = []; read.textContent = ''; read.style.minHeight = '0';
        line(model.available ? L(model.ariaLabel) : L(model.empty), CYAN); return;
      }
      read.style.minHeight = '2.9em';
      const days = model.days, n = days.length, narrow = w < 520;
      const padL = narrow ? 34 : 42, padR = 4, top = 44, plotH = narrow ? 150 : 200, bottom = 40, hgt = top + plotH + bottom;
      const plotW = w - padL - padR, slot = plotW / n, bw = Math.max(1.5, Math.min(26, slot * 0.66));
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      ctx.textBaseline = 'middle';
      // header: the site shown, then what the y axis is
      ctx.textAlign = 'left'; ctx.fillStyle = '#e8f6ff'; ctx.font = '600 ' + (narrow ? 12 : 13) + 'px ' + MONO; ctx.fillText(L(model.siteName), 0, 9);
      ctx.fillStyle = DIM; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillText('↑ ' + L(model.axis.label), 0, 27);
      const yOf = (t) => top + plotH - t * plotH;
      // the band of this site's own lowest to highest day
      if (model.range) {
        const y1 = yOf(model.range.tMax), y2 = yOf(model.range.tMin);
        ctx.fillStyle = 'rgba(125,211,252,0.07)'; ctx.fillRect(padL, y1, plotW, y2 - y1);
        ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(125,211,252,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(padL, Math.round(y1) + 0.5); ctx.lineTo(padL + plotW, Math.round(y1) + 0.5); ctx.moveTo(padL, Math.round(y2) + 0.5); ctx.lineTo(padL + plotW, Math.round(y2) + 0.5); ctx.stroke(); ctx.restore();
      }
      // grid and tick numbers (from the model)
      ctx.font = (narrow ? 9 : 10) + 'px ' + MONO; ctx.textAlign = 'right';
      for (const tk of model.axis.ticks) {
        const y = Math.round(yOf(tk.t)) + 0.5;
        ctx.strokeStyle = tk.v === 0 ? 'rgba(125,211,252,0.55)' : 'rgba(125,211,252,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
        ctx.fillStyle = DIM; ctx.fillText(tk.text[idx()], padL - 5, y);
      }
      hits = [];
      const every = slot >= 17 ? 1 : (slot >= 8.5 ? 2 : 5);
      days.forEach((d, i) => {
        const x0 = padL + i * slot, cx = x0 + slot / 2, on = i === picked, hv = i === hover;
        hits.push({ x: x0, w: slot, i });
        if (d.missing) hatch(cx - bw / 2, top, bw, plotH);
        else {
          const h = Math.max(d.value > 0 ? 1 : 0, d.t * plotH * grow), y = top + plotH - h;
          ctx.save(); ctx.shadowColor = on ? 'rgba(251,191,36,0.55)' : 'rgba(125,211,252,0.45)'; ctx.shadowBlur = on || hv ? 12 : 6;
          ctx.fillStyle = on ? AMBER : (hv ? '#e8f6ff' : CYAN); ctx.globalAlpha = on || hv ? 1 : 0.86; ctx.fillRect(cx - bw / 2, y, bw, h); ctx.restore();
        }
        if (on || hv) {   // a marker under the day, also for a missing day
          ctx.fillStyle = on ? AMBER : '#e8f6ff'; ctx.fillRect(cx - Math.max(bw, 6) / 2, top + plotH + 2, Math.max(bw, 6), 2);
        }
        const lab = every === 1 || d.dom === 1 || (every === 2 ? d.dom % 2 === 1 : d.dom % 5 === 0);
        if (lab) { ctx.fillStyle = on ? AMBER : (d.missing ? 'rgba(125,211,252,0.4)' : DIM); ctx.textAlign = 'center'; ctx.font = (narrow ? 9 : 10) + 'px ' + MONO; ctx.fillText(String(d.dom), cx, top + plotH + 13); }
      });
      // the number of the chosen day above its bar
      const sel = hover >= 0 ? hover : picked;
      if (sel >= 0 && days[sel]) {
        const d = days[sel], cx = padL + sel * slot + slot / 2, s = d.missing ? L(model.strings.missing) : d.text[idx()];
        ctx.font = '600 ' + (narrow ? 10 : 11) + 'px ' + MONO; const tw = ctx.measureText(s).width;
        const tx = Math.max(padL + tw / 2 + 2, Math.min(w - tw / 2 - 2, cx)), ty = Math.max(top - 6, (d.missing ? top + plotH / 2 : yOf(d.t * grow) - 9));
        ctx.fillStyle = 'rgba(5,11,22,0.85)'; ctx.fillRect(tx - tw / 2 - 3, ty - 8, tw + 6, 16);
        ctx.fillStyle = sel === picked && hover < 0 ? AMBER : '#e8f6ff'; ctx.textAlign = 'center'; ctx.fillText(s, tx, ty);
      }
      ctx.fillStyle = CYAN; ctx.textAlign = 'center'; ctx.font = (narrow ? 11 : 12) + 'px ' + MONO; ctx.fillText(L(model.axis.month), padL + plotW / 2, hgt - 9);
      // text under the picture: the read-out, then what the picture does and does not say (all from the model)
      read.textContent = sel >= 0 && days[sel] ? L(days[sel].label) : L(model.strings.hint); read.style.color = sel >= 0 ? '#e8f6ff' : DIM;
      line(L(model.columnNote), AMBER);
      if (model.counts.text) line(L(model.counts.text));
      if (model.range) line(L(model.range.text));
      for (const l of model.legend) line(L(l));
      if (model.honesty) line(L(model.honesty));
    }

    const at = (e) => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left; const h = hits.find((q) => x >= q.x && x < q.x + q.w); return h ? h.i : -1; };
    const tell = () => { if (opts.onPick) opts.onPick(item(hover >= 0 ? hover : picked)); };
    const onMove = (e) => { const i = at(e); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'pointer' : 'default'; draw(); tell(); } };
    const onLeave = () => { if (hover >= 0) { hover = -1; draw(); tell(); } };
    const onClick = (e) => { const i = at(e); picked = i; draw(); if (opts.onPick) opts.onPick(item(i)); };
    const onKey = (e) => {
      const n = model.days.length; if (!n) return;
      let i = picked;
      if (e.key === 'ArrowRight') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1);
      else if (e.key === 'ArrowLeft') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
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
    // the one entrance: bars grow in once. Never again, and not at all under reduced motion or in a hidden tab.
    if (!still() && !document.hidden && root.requestAnimationFrame && model.available && model.hasDays) {
      grow = 0; let t0 = 0;
      const step = (t) => { if (dead) return; if (!t0) t0 = t; const k = Math.min(1, (t - t0) / 650); grow = 1 - Math.pow(1 - k, 3); draw(); raf = k < 1 ? root.requestAnimationFrame(step) : 0; };
      draw(); raf = root.requestAnimationFrame(step);
    } else draw();

    return {
      set(o) { if (o && o.site != null) show(o.site); return model; },
      model() { return model; },
      destroy() { dead = true; if (raf) root.cancelAnimationFrame(raf); clearInterval(poll); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); sw.remove(); read.remove(); txt.remove(); },
    };
  }

  SC.viz.daybars = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
