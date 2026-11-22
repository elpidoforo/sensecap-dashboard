/*
  Station widget: SC.viz.station.mount(host, model, opts) -> { destroy(), set({station}), update(answer, now), model() }.
  The model is built by station-data.js: ONE station of a live sheet (met-stations, airports or air-stations), its newest reading.
  A wind dial (the arrow starts on the side the wind comes FROM), reading tiles with value, unit and plain name, the reading's own
  time and age, and the status of the answer. Every number and sentence comes from the model.
  Motion: this is live data, so two things may move and nothing else does.
    - the wind arrow sways gently ONLY while model.sway is true (live answer, not stale, not test values). When the reading gets
      old the arrow stops, is drawn faint and the picture says "old reading".
    - after update(answer, now) the readings whose value changed flash once.
    None of it under reduced motion or while the tab is hidden. The age text is re-made every 15 s from the same answer.
  opts.station    id of the station to show first (default: the model's own).
  opts.chooser    false hides the built-in station chooser (the page then calls handle.set({station}) from its own control).
  opts.onPick({key, value, unit:[en,el], label:[en,el]}) when the dial or a tile is hovered, clicked or reached with the arrow keys;
                  null when nothing is under the pointer and nothing is picked.
  opts.onSet({station}) after the shown station changed through the built-in chooser.
  handle.update(answer, now)  a newer answer of the same sheet (now = ms, default Date.now()); returns the new model.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)', WHITE = '#e8f6ff';
  const data = () => (root.SC && root.SC.viz && root.SC.viz.stationData) || null;
  const pickStation = (m, id) => { const D = data(); if (D) return D.select(m, id); return m && m.stations && m.stations[id] ? Object.assign({}, m, m.stations[id], { station: String(id) }) : m; };

  function mount(host, model0, opts) {
    opts = opts || {};
    let model = opts.station != null ? pickStation(model0, String(opts.station)) : model0;
    let hover = -1, picked = -1, w = 0, hits = [], raf = 0, dead = false, flash = new Set(), flashEnd = 0, phase = 0, lastT = 0, lastDraw = 0;
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
      const go = (id) => { if (id === model.station) return; show(id); if (opts.onSet) opts.onSet({ station: id }); };
      if (model.choices.length > 6) {   // many stations (the Met Office has dozens): a list, in the answer's own order
        const s = el('select', 'font:inherit;font-size:11px;padding:3px 6px;border-radius:6px;background:' + PANEL + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,0.4);max-width:100%');
        s.setAttribute('aria-label', L(model.strings.choose));
        for (const c of model.choices) { const o = el('option'); o.value = c.id; o.textContent = L(c.name); if (c.id === model.station) o.selected = true; s.append(o); }
        s.addEventListener('change', () => go(s.value)); sw.append(s); return;
      }
      for (const c of model.choices) {
        const on = c.id === model.station;
        const b = el('button', 'font:inherit;font-size:11px;padding:3px 9px;border-radius:999px;cursor:pointer;background:' + (on ? 'rgba(125,211,252,0.18)' : 'transparent') + ';color:' + CYAN + ';border:1px solid rgba(125,211,252,0.4)');
        b.type = 'button'; b.textContent = L(c.name); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.addEventListener('click', () => go(c.id)); sw.append(b);
      }
    }
    function show(id) {
      const next = pickStation(model, String(id)); if (next === model) return model;
      model = next; hover = -1; picked = -1; flash = new Set(); flashEnd = 0;
      buildSwitch(); draw(); run(); if (opts.onPick) opts.onPick(null);
      return model;
    }
    const item = (i) => { const p = model.picks && model.picks[i]; return p ? { key: p.key, value: p.value, unit: p.unit, label: p.label } : null; };

    // break a sentence into lines that fit (the font must already be set)
    function wrap(s, maxW, maxLines) {
      const out = []; let cur = '';
      for (const word of String(s).split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (cur && ctx.measureText(t).width > maxW) { out.push(cur); cur = word; } else cur = t;
      }
      if (cur) out.push(cur);
      return maxLines && out.length > maxLines ? out.slice(0, maxLines) : out;
    }
    function chip(s, x, y, col) {
      ctx.font = '600 10px ' + MONO; const tw = ctx.measureText(s).width, ww = tw + 14;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.fillStyle = col === AMBER ? 'rgba(251,191,36,0.12)' : 'rgba(125,211,252,0.12)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 0.5, y + 0.5, ww, 17, 8) : ctx.rect(x + 0.5, y + 0.5, ww, 17); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.fillText(s, x + 7, y + 9.5);
      return ww;
    }

    function drawDial(d, cx, cy, R, on, hv, glow) {
      const old = model.stale, col = on ? AMBER : CYAN;
      ctx.save();
      ctx.lineWidth = 1; ctx.strokeStyle = on ? AMBER : (hv ? WHITE : 'rgba(125,211,252,0.5)');
      ctx.shadowColor = glow > 0 ? 'rgba(232,246,255,' + (0.8 * glow).toFixed(3) + ')' : 'rgba(125,211,252,0.35)'; ctx.shadowBlur = glow > 0 ? 6 + 16 * glow : (on || hv ? 12 : 6);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(125,211,252,0.16)'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2); ctx.stroke();
      // ticks every 30 degrees, longer at the four points; bearing 0 = north = up, clockwise
      for (let a = 0; a < 360; a += 30) {
        const r = (a - 90) * Math.PI / 180, long = a % 90 === 0, r1 = R - (long ? 9 : 5);
        ctx.strokeStyle = long ? 'rgba(125,211,252,0.7)' : 'rgba(125,211,252,0.3)'; ctx.beginPath(); ctx.moveTo(cx + Math.cos(r) * r1, cy + Math.sin(r) * r1); ctx.lineTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); ctx.stroke();
      }
      ctx.font = '600 11px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = DIM;
      const C = model.strings.compass, rr = R + 11;
      ctx.fillText(L(C[0]), cx, cy - rr); ctx.fillText(L(C[1]), cx + rr + 1, cy); ctx.fillText(L(C[2]), cx, cy + rr + 1); ctx.fillText(L(C[3]), cx - rr - 1, cy);
      if (d.arrow) {
        // the arrow starts at the rim on the side the wind comes from and points across the middle, the way the wind blows
        const sway = model.sway && !still() ? Math.sin(phase) * 4 : 0;
        const r = (d.from + sway - 90) * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r);
        const x1 = cx + ux * (R - 4), y1 = cy + uy * (R - 4), x2 = cx - ux * R * 0.56, y2 = cy - uy * R * 0.56;
        ctx.save(); ctx.globalAlpha = old ? 0.38 : 1; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        if (!old) { ctx.shadowColor = on ? 'rgba(251,191,36,0.6)' : 'rgba(125,211,252,0.6)'; ctx.shadowBlur = 10; } else ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 + ux * 8, y2 + uy * 8); ctx.stroke(); ctx.setLineDash([]);
        const px = -uy, py = ux, hl = 13, hw = 6.5;
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 + ux * hl + px * hw, y2 + uy * hl + py * hw); ctx.lineTo(x2 + ux * hl - px * hw, y2 + uy * hl - py * hw); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, Math.PI * 2); ctx.fill();   // the dot marks the side the wind comes from
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(125,211,252,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    function draw() {
      if (dead) return;
      host.setAttribute('aria-label', L(model.ariaLabel)); cv.setAttribute('aria-label', L(model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      if (!model.available) {
        cv.width = 1; cv.height = 1; cv.style.height = '1px'; hits = []; read.textContent = ''; read.style.minHeight = '0';
        line(L(model.title), DIM); line(L(model.empty), CYAN); if (model.source) line(L(model.source));
        return;
      }
      read.style.minHeight = '2.9em';
      const narrow = w < 520, d = model.dial, tiles = model.tiles, S = model.strings, now = (root.performance && root.performance.now()) || 0;
      const glowK = flashEnd > now && !still() ? Math.max(0, (flashEnd - now) / 900) : 0;
      // ---- measure first (all text from the model), then size the canvas
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textBaseline = 'middle';
      ctx.font = '10px ' + MONO; const timeL = wrap(L(model.timeLine), w - 2, 3);
      const headH = 65 + timeL.length * 13, R = narrow ? 62 : 70, dialW = d ? (narrow ? w : 2 * R + 60) : 0;
      ctx.font = '10px ' + MONO;
      const dialLines = d ? wrap(L(d.line), narrow ? w - 8 : dialW + 10, 3) : [];
      const dialH = d ? 2 * R + 34 + 30 + dialLines.length * 14 + 4 : 0;
      const gx = narrow || !d ? 0 : dialW + 26, gw = w - gx, gap = 8;
      const cols = Math.max(1, Math.min(tiles.length || 1, narrow ? 2 : Math.floor((gw + gap) / (150 + gap))));
      const tw = (gw - gap * (cols - 1)) / cols, inner = tw - 20;
      const lay = tiles.map((t) => {
        ctx.font = '10px ' + MONO; const nameL = wrap(L(t.name), inner, 2);
        const unitL = t.missing ? [] : wrap(L(t.unit), inner, 2), timeL = t.timeLine && !t.missing ? wrap(L(t.timeLine), inner, 6) : [];
        return { nameL, unitL, timeL };
      });
      const mx = (f) => lay.reduce((a, l) => Math.max(a, f(l)), 0);
      const nN = mx((l) => l.nameL.length), nU = mx((l) => l.unitL.length), nT = mx((l) => l.timeL.length);
      const th = 12 + nN * 13 + 34 + nU * 13 + (nT ? 4 + nT * 12 : 0) + 8;
      const rows = Math.ceil(tiles.length / cols), tilesH = rows ? rows * th + (rows - 1) * gap : 0;
      const dialY = headH, tilesY = narrow && d ? headH + dialH + 10 : headH;
      const hgt = Math.ceil(Math.max(d && !narrow ? headH + dialH : 0, tilesY + tilesH) + 6);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt); ctx.textBaseline = 'middle';
      // ---- header: the station, the status of the answer, the reading's own time and its age
      ctx.textAlign = 'left'; ctx.fillStyle = WHITE; ctx.font = '600 ' + (narrow ? 13 : 14) + 'px ' + MONO; ctx.fillText(L(model.stationName), 0, 10);
      let x = 0; const stCol = model.stale ? AMBER : CYAN;
      x += chip(L(model.status.label), x, 23, stCol) + 6;
      if (model.demo) x += chip(L(S.demoChip), x, 23, AMBER) + 6;
      ctx.font = '10px ' + MONO; ctx.fillStyle = DIM; ctx.textAlign = 'left'; timeL.forEach((s, k) => ctx.fillText(s, 0, 53 + k * 13));
      ctx.fillStyle = model.stale ? AMBER : WHITE; ctx.font = '600 11px ' + MONO; if (model.timeMs != null) ctx.fillText(L(model.ageText), 0, 55 + timeL.length * 13);
      hits = [];
      // ---- wind dial
      if (d) {
        const cx = narrow ? w / 2 : dialW / 2 + 4, cy = dialY + R + 20, on = picked === 0, hv = hover === 0;
        hits.push({ x: narrow ? 0 : 0, y: dialY, w: narrow ? w : dialW + 8, h: dialH, i: 0 });
        drawDial(d, cx, cy, R, on, hv, flash.has('wind') ? glowK : 0);
        let y = cy + R + 34; ctx.textAlign = 'center';
        if (d.speedText) {
          ctx.font = '600 20px ' + MONO; const a = L(d.speedText), aw = ctx.measureText(a).width; ctx.font = '11px ' + MONO; const u = ' ' + L(d.unit), uw = ctx.measureText(u).width;
          ctx.textAlign = 'left'; ctx.font = '600 20px ' + MONO; ctx.fillStyle = on ? AMBER : WHITE; ctx.fillText(a, cx - (aw + uw) / 2, y);
          ctx.font = '11px ' + MONO; ctx.fillStyle = DIM; ctx.fillText(u, cx - (aw + uw) / 2 + aw, y + 2);
        } else { ctx.font = '11px ' + MONO; ctx.fillStyle = DIM; ctx.fillText('·', cx, y); }
        y += 22; ctx.textAlign = 'center'; ctx.font = '10px ' + MONO; ctx.fillStyle = on ? AMBER : (hv ? WHITE : DIM);
        for (const s of dialLines) { ctx.fillText(s, cx, y); y += 14; }
      }
      // ---- reading tiles
      tiles.forEach((t, k) => {
        const i = k + (d ? 1 : 0), c = k % cols, r = Math.floor(k / cols), x0 = gx + c * (tw + gap), y0 = tilesY + r * (th + gap), on = picked === i, hv = hover === i, l = lay[k];
        hits.push({ x: x0, y: y0, w: tw, h: th, i });
        const g = flash.has(t.key) ? glowK : 0;
        ctx.save(); ctx.fillStyle = g > 0 ? 'rgba(125,211,252,' + (0.05 + 0.22 * g).toFixed(3) + ')' : (on ? 'rgba(251,191,36,0.08)' : 'rgba(125,211,252,0.05)');
        ctx.strokeStyle = on ? AMBER : (hv || g > 0 ? WHITE : 'rgba(125,211,252,0.28)'); ctx.lineWidth = 1;
        if (on || hv || g > 0) { ctx.shadowColor = on ? 'rgba(251,191,36,0.5)' : 'rgba(125,211,252,0.5)'; ctx.shadowBlur = 10; }
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0 + 0.5, y0 + 0.5, tw - 1, th - 1, 6) : ctx.rect(x0 + 0.5, y0 + 0.5, tw - 1, th - 1); ctx.fill(); ctx.stroke(); ctx.restore();
        let y = y0 + 15; ctx.textAlign = 'left'; ctx.font = '10px ' + MONO; ctx.fillStyle = DIM;
        for (const s of l.nameL) { ctx.fillText(s, x0 + 10, y); y += 13; }
        y = y0 + 12 + nN * 13 + 17;
        if (t.missing) { ctx.font = '11px ' + MONO; ctx.fillStyle = 'rgba(125,211,252,0.5)'; ctx.fillText(L(S.notReported), x0 + 10, y); }
        else {
          ctx.font = '600 22px ' + MONO; ctx.fillStyle = on ? AMBER : WHITE; ctx.fillText(L(t.text), x0 + 10, y);
          y = y0 + 12 + nN * 13 + 34 + 6; ctx.font = '10px ' + MONO; ctx.fillStyle = t.unitStated ? CYAN : AMBER;
          for (const s of l.unitL) { ctx.fillText(s, x0 + 10, y); y += 13; }
          y = y0 + 12 + nN * 13 + 34 + nU * 13 + 4 + 6; ctx.fillStyle = DIM; ctx.font = '9px ' + MONO;
          for (const s of l.timeL) { ctx.fillText(s, x0 + 10, y); y += 12; }
        }
      });
      // ---- text under the picture: the read-out, then what the picture does and does not say (all from the model)
      const sel = hover >= 0 ? hover : picked, it = sel >= 0 ? model.picks[sel] : null;
      read.textContent = it ? L(it.label) : L(S.hint); read.style.color = it ? WHITE : DIM;
      if (model.demo) line(L(model.demoText), AMBER);
      if (model.staleText) line(L(model.staleText), AMBER);
      for (const f of model.facts) line(L(f));
      if (d && d.arrow) line(L(S.arrowKey));
      if (model.note) line(L(model.note));
      if (model.honesty) line(L(model.honesty), CYAN);
      line(L(S.oneStation));
      if (model.source) line(L(model.source));
      if (model.credit) line(L(model.credit));
    }

    // one loop for the two allowed motions; it stops by itself when neither applies
    const moving = () => !dead && !document.hidden && !still() && model.available && (model.sway || flashEnd > ((root.performance && root.performance.now()) || 0));
    function step(t) {
      raf = 0; if (!moving()) { draw(); return; }
      if (lastT) phase += Math.min(100, t - lastT) / 1000 * 1.1; lastT = t;
      if (t - lastDraw > 45) { lastDraw = t; draw(); }
      raf = root.requestAnimationFrame(step);
    }
    function run() { if (!raf && root.requestAnimationFrame && moving()) { lastT = 0; raf = root.requestAnimationFrame(step); } }

    const at = (e) => { const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; const h = hits.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h); return h ? h.i : -1; };
    const tell = () => { if (opts.onPick) opts.onPick(item(hover >= 0 ? hover : picked)); };
    const onMove = (e) => { const i = at(e); if (i !== hover) { hover = i; cv.style.cursor = i >= 0 ? 'pointer' : 'default'; draw(); tell(); } };
    const onLeave = () => { if (hover >= 0) { hover = -1; draw(); tell(); } };
    const onClick = (e) => { const i = at(e); picked = i; draw(); if (opts.onPick) opts.onPick(item(i)); };
    const onKey = (e) => {
      const n = model.picks ? model.picks.length : 0; if (!n) return;
      let i = picked;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1; else if (e.key === 'Escape') i = -1; else return;
      e.preventDefault(); hover = -1; picked = i; draw(); if (opts.onPick) opts.onPick(item(i));
    };
    const onFocus = () => { cv.style.boxShadow = '0 0 0 2px ' + AMBER; }, onBlur = () => { cv.style.boxShadow = 'none'; };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);
    cv.addEventListener('keydown', onKey); cv.addEventListener('focus', onFocus); cv.addEventListener('blur', onBlur);

    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (document.hidden) { if (raf) { root.cancelAnimationFrame(raf); raf = 0; } } else { age(); draw(); run(); } };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; buildSwitch(); draw(); } }, 500);
    // the age grows by itself: re-make the model from the same answer with the clock of now (this may turn the reading old)
    function age() {
      const D = data(); if (!D || !model.available || dead) return;
      const next = D.retime(model, Date.now());
      if (next && next.available) { const was = L(model.ageText) + model.status.key; model = next; if (L(model.ageText) + model.status.key !== was) draw(); }
    }
    const clock = setInterval(() => { if (!document.hidden) age(); }, 15000);
    buildSwitch(); draw(); run();

    return {
      set(o) { if (o && o.station != null) show(o.station); return model; },
      update(answer, now) {
        const D = data(); if (!D) return model;
        const next = D.build(answer, { station: model.station }, typeof now === 'number' ? now : Date.now());
        const keys = D.changed(model, next), sameList = model.choices.map((c) => c.id).join('|') === next.choices.map((c) => c.id).join('|');
        const keepPick = model.station === next.station && (model.picks || []).length === next.picks.length;
        model = next; if (!keepPick) { hover = -1; picked = -1; }
        if (keys.length && !still() && !document.hidden) { flash = new Set(keys); flashEnd = ((root.performance && root.performance.now()) || 0) + 900; } else { flash = new Set(); flashEnd = 0; }
        if (!sameList || !next.available) buildSwitch();
        draw(); run();
        if (opts.onPick && picked >= 0) opts.onPick(item(picked));
        return model;
      },
      model() { return model; },
      destroy() { dead = true; if (raf) root.cancelAnimationFrame(raf); clearInterval(poll); clearInterval(clock); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.remove(); sw.remove(); read.remove(); txt.remove(); },
    };
  }

  SC.viz.station = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
