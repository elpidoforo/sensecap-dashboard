/*
  Depth line widget: SC.viz.depthline.mount(host, model, opts) -> { destroy(), set({profile}), model() }.
  The model is built by depthline-data.js (one seabed profile at a time: x = km along the line from its start,
  y = metres below the sea surface, the surface drawn at 0, water filled above the seabed line).
  Points the sheet marks interpolated are hollow and their line is dashed; a point with no value leaves a gap.
  Still data: nothing moves, apart from one reveal when the widget first appears (none under reduced motion, none while
  the tab is hidden). After that the picture is redrawn only on resize, language change, pointer move, pick or set().
  opts.profile    id of the profile to show first (default: the model's own).
  opts.chooser    false hides the built-in profile buttons (the page then calls handle.set({profile}) from its own control).
  opts.onPick({km, elevation, interpolated, missing, label:[en,el], profile}) when the marker sits on a point (pointer move,
                  click, Left/Right keys); null when nothing is under the pointer and nothing is picked.
  opts.onSet({profile}) after the shown profile changed through the built-in buttons.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)', WHITE = '#e8f6ff';
  const pickProfile = (m, id) => (m && m.profiles && Object.prototype.hasOwnProperty.call(m.profiles, id) ? Object.assign({}, m, m.profiles[id], { profile: String(id) }) : m);

  function mount(host, model0, opts) {
    opts = opts || {};
    let model = opts.profile != null ? pickProfile(model0, String(opts.profile)) : model0;
    let hover = -1, picked = -1, w = 0, geo = null, grow = 1, raf = 0, dead = false;
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
        const on = c.id === model.profile;
        const b = el('button', 'font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;background:' + (on ? 'rgba(125,211,252,0.18)' : 'transparent') + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,0.4)');
        b.type = 'button'; b.textContent = L(c.name); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', () => { if (c.id === model.profile) return; show(c.id); if (opts.onSet) opts.onSet({ profile: c.id }); });
        sw.append(b);
      }
    }
    function show(id) {
      const next = pickProfile(model, String(id)); if (next === model) return model;
      model = next; hover = -1; picked = -1; grow = 1; if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
      buildSwitch(); draw(); if (opts.onPick) opts.onPick(null);
      return model;
    }
    const item = (i) => { const p = model.points[i]; return p ? { km: p.km, elevation: p.elevation, interpolated: p.interpolated, missing: p.missing, label: p.label, profile: model.profile } : null; };

    function dot(x, y, r, hollow, col) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (hollow) { ctx.fillStyle = PANEL; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); }
    }

    function draw() {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel)); cv.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!model.available || !model.hasPoints) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; geo = null; read.textContent = ''; read.style.minHeight = '0';
        line(model.available ? L(model.ariaLabel) : L(model.empty), CYAN); return;
      }
      read.style.minHeight = '2.9em';
      const pts = model.points, narrow = w < 520, ax = model.axis;
      const padL = narrow ? 34 : 42, padR = 10, top = 66, plotH = narrow ? 160 : 210, bottom = 42, hgt = top + plotH + bottom, plotW = w - padL - padR;
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt); ctx.textBaseline = 'middle'; ctx.setLineDash([]);
      const X = (p) => padL + p.tx * plotW, Y = (t) => top + t * plotH, ySurf = Y(ax.y.tSurface), yBot = top + plotH;
      // header: the profile shown and where its line starts, then what the y axis is, then the key for the two kinds of point
      ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = '600 ' + (narrow ? 12 : 13) + 'px ' + MONO;
      const nm = L(model.profileName); ctx.fillText(nm, 0, 9);
      if (model.startName) { const nw = ctx.measureText(nm).width; ctx.fillStyle = DIM; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; const s = L(model.strings.startsAt) + ': ' + L(model.startName); if (nw + 12 + ctx.measureText(s).width <= w) ctx.fillText(s, nw + 12, 9.5); }
      ctx.fillStyle = DIM; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillText('↓ ' + L(ax.y.label), 0, 27);
      let kx = 5; ctx.font = (narrow ? 9 : 10) + 'px ' + MONO;
      ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(kx - 5, 45); ctx.lineTo(kx + 9, 45); ctx.stroke(); dot(kx + 2, 45, 3, false, CYAN);
      ctx.fillStyle = DIM; ctx.fillText(L(model.strings.keySolid), kx + 14, 45.5); kx += 14 + ctx.measureText(L(model.strings.keySolid)).width + 18;
      ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = CYAN; ctx.beginPath(); ctx.moveTo(kx - 5, 45); ctx.lineTo(kx + 9, 45); ctx.stroke(); ctx.restore(); dot(kx + 2, 45, 3, true, CYAN);
      ctx.fillStyle = DIM; ctx.fillText(L(model.strings.keyHollow), kx + 14, 45.5);
      // grid and depth numbers (from the model); the sea surface is the strong line at 0
      ctx.font = (narrow ? 9 : 10) + 'px ' + MONO; ctx.textAlign = 'right'; ctx.lineWidth = 1;
      for (const tk of ax.y.ticks) {
        const y = Math.round(Y(tk.t)) + 0.5;
        if (tk.v !== 0) { ctx.strokeStyle = 'rgba(125,211,252,0.12)'; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke(); }
        ctx.fillStyle = DIM; ctx.fillText(tk.text[idx()], padL - 5, y);
      }
      // the reveal clip (entrance only), then water, ground, line and dots for each unbroken run of points
      ctx.save(); ctx.beginPath(); ctx.rect(0, top - 8, padL + (plotW + padR) * grow, plotH + 16); ctx.clip();
      const runs = []; let cur = [];
      pts.forEach((p, i) => { if (p.missing) { if (cur.length) runs.push(cur); cur = []; } else cur.push(i); }); if (cur.length) runs.push(cur);
      for (const run of runs) {
        if (run.length < 2) continue;
        const a = pts[run[0]], b = pts[run[run.length - 1]];
        const g = ctx.createLinearGradient(0, ySurf, 0, yBot); g.addColorStop(0, 'rgba(125,211,252,0.26)'); g.addColorStop(1, 'rgba(125,211,252,0.05)');
        ctx.beginPath(); ctx.moveTo(X(a), ySurf); for (const i of run) ctx.lineTo(X(pts[i]), Math.max(ySurf, Y(pts[i].ty))); ctx.lineTo(X(b), ySurf); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.moveTo(X(a), yBot); for (const i of run) ctx.lineTo(X(pts[i]), Y(pts[i].ty)); ctx.lineTo(X(b), yBot); ctx.closePath(); ctx.fillStyle = 'rgba(251,191,36,0.07)'; ctx.fill();
        for (let k = 1; k < run.length; k++) {
          const p = pts[run[k - 1]], q = pts[run[k]], dash = p.interpolated || q.interpolated;
          ctx.save(); ctx.setLineDash(dash ? [5, 4] : []); ctx.strokeStyle = CYAN; ctx.lineWidth = dash ? 1.5 : 2; ctx.shadowColor = 'rgba(125,211,252,0.5)'; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.moveTo(X(p), Y(p.ty)); ctx.lineTo(X(q), Y(q.ty)); ctx.stroke(); ctx.restore();
        }
      }
      pts.forEach((p) => {
        if (p.missing) { ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = 'rgba(125,211,252,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(X(p)) + 0.5, top); ctx.lineTo(Math.round(X(p)) + 0.5, yBot); ctx.stroke(); ctx.restore(); }
        else dot(X(p), Y(p.ty), narrow ? 3 : 3.5, p.interpolated, CYAN);
      });
      ctx.restore();
      // the sea surface on top of the fill
      ctx.strokeStyle = 'rgba(125,211,252,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Math.round(ySurf) + 0.5); ctx.lineTo(padL + plotW, Math.round(ySurf) + 0.5); ctx.stroke();
      ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.font = (narrow ? 9 : 10) + 'px ' + MONO; ctx.fillText(L(model.strings.surface), padL + plotW, ySurf - 8);
      // x ticks
      ctx.textAlign = 'center';
      for (const tk of ax.x.ticks) { const x = padL + tk.t * plotW; ctx.strokeStyle = 'rgba(125,211,252,0.4)'; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, yBot); ctx.lineTo(Math.round(x) + 0.5, yBot + 4); ctx.stroke(); ctx.fillStyle = DIM; ctx.fillText(tk.text[idx()], x, yBot + 13); }
      ctx.fillStyle = CYAN; ctx.font = (narrow ? 10 : 12) + 'px ' + MONO; ctx.fillText(L(ax.x.label), padL + plotW / 2, hgt - 9);
      // the marker on the chosen point
      const sel = hover >= 0 ? hover : picked;
      if (sel >= 0 && pts[sel]) {
        const p = pts[sel], x = X(p), col = sel === picked && hover < 0 ? AMBER : WHITE, y = p.missing ? yBot : Y(p.ty);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Math.min(ySurf, y)); ctx.lineTo(Math.round(x) + 0.5, p.missing ? yBot : Math.max(ySurf, y)); ctx.stroke(); ctx.globalAlpha = 1;
        if (!p.missing) { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 12; dot(x, y, narrow ? 4.5 : 5, p.interpolated, col); ctx.restore(); }
        ctx.fillStyle = col; ctx.fillRect(x - 4, yBot + 1, 8, 2);
        const s = L(p.kmText) + ' · ' + (p.missing ? L(model.strings.missing) : L(p.text));
        ctx.font = '600 ' + (narrow ? 10 : 11) + 'px ' + MONO; const tw = ctx.measureText(s).width;
        const tx = Math.max(padL + tw / 2 + 4, Math.min(w - tw / 2 - 4, x)), ty = p.missing ? top + plotH / 2 : (y - 16 < ySurf + 20 ? y + 18 : y - 16);
        ctx.fillStyle = 'rgba(5,11,22,0.88)'; ctx.fillRect(tx - tw / 2 - 4, ty - 9, tw + 8, 18);
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(s, tx, ty);
      }
      geo = { padL, plotW };
      // text under the picture: the read-out, then what the picture does and does not say (all from the model)
      read.textContent = sel >= 0 && pts[sel] ? L(pts[sel].label) : L(model.strings.hint); read.style.color = sel >= 0 ? WHITE : DIM;
      if (model.counts.text) line(L(model.counts.text), AMBER);
      for (const l of model.legend) line(L(l));
      if (model.honesty) line(L(model.honesty));
    }

    // the marker snaps to the nearest real point: no value is read between two points
    const at = (e) => {
      if (!geo || !model.points.length) return -1;
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left; let best = -1, bd = Infinity;
      model.points.forEach((p, i) => { const d = Math.abs(geo.padL + p.tx * geo.plotW - x); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    const tell = () => { if (opts.onPick) opts.onPick(item(hover >= 0 ? hover : picked)); };
    const onMove = (e) => { const i = at(e); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'crosshair' : 'default'; draw(); tell(); } };
    const onLeave = () => { if (hover >= 0) { hover = -1; draw(); tell(); } };
    const onClick = (e) => { const i = at(e); picked = i; draw(); if (opts.onPick) opts.onPick(item(i)); };
    const onKey = (e) => {
      const n = model.points.length; if (!n) return;
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
    // the one entrance: the line is revealed from its start outwards, once. Never again, not under reduced motion, not in a hidden tab.
    if (!still() && !document.hidden && root.requestAnimationFrame && model.available && model.hasPoints) {
      grow = 0; let t0 = 0;
      const step = (t) => { if (dead) return; if (!t0) t0 = t; const k = Math.min(1, (t - t0) / 700); grow = 1 - Math.pow(1 - k, 3); draw(); raf = k < 1 ? root.requestAnimationFrame(step) : 0; };
      draw(); raf = root.requestAnimationFrame(step);
    } else draw();

    return {
      set(o) { if (o && o.profile != null) show(o.profile); else if (SC.lang !== lang) { lang = SC.lang; buildSwitch(); draw(); } return model; },
      model() { return model; },
      destroy() { dead = true; if (raf) root.cancelAnimationFrame(raf); clearInterval(poll); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); sw.remove(); read.remove(); txt.remove(); },
    };
  }

  SC.viz.depthline = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
