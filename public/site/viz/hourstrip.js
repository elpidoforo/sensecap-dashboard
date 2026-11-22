/*
  Hour strip widget: SC.viz.hourstrip.mount(host, model, opts) -> handle. The model is built by hourstrip-data.js.
  ONE station and ONE pollutant at a time: a strip of numbered hour cells on a fixed colour scale, and a thin line of the same
  values under it. The data is one PAST day, so the only thing that moves is a playhead walking through the hours, and the
  canvas always carries the model's sentence "Replay of <date>, not live".
    opts.station, opts.pollutant   first view (default: the model's own)
    opts.hour                      first hour index (default 0)
    opts.autoplay                  default true; ignored (nothing starts by itself) under prefers-reduced-motion
    opts.onHour({hour, index, label:[en,el], value|null, text|null, unit:[en,el], station, stationName, pollutant})
    opts.onPick(item|null)         a click on a cell (same record as onHour), null for a click on nothing
    opts.onState({playing})        play / pause changed
    opts.onChange(view)            after set(): the new view (its textRows / ariaLabel are the ones to list)
  handle = { destroy(), set({station, pollutant}) -> bool, play(), pause(), toggle(), seek(hourIndex), playing, hour, view }
  Keyboard (host is focusable): Left / Right move one hour, Home / End jump, Space plays or pauses.
  All numbers come from the model; this file only places them.
*/
(function (root) {
  'use strict';
  const SC = (root.SC = root.SC || {});
  SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const CYAN = '#7DD3FC', AMBER = '#FBBF24', PANEL = '#050b16', DIM = 'rgba(125,211,252,0.62)';
  const STEP_MS = 600, PULSE_MS = 420;
  const lo = [11, 38, 60], hi = [125, 211, 252];
  const ramp = (t) => 'rgb(' + lo.map((a, i) => Math.round(a + (hi[i] - a) * t)).join(',') + ')';   // one hue: deep blue to cyan

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let st = model.station, pk = model.pollutant, hour = 0, playing = false, timer = 0, raf = 0, pulse0 = 0, dead = false, w = 0, hits = [], btn = null;
    const idx = () => (SC.lang === 'el' ? 1 : 0), L = (p) => (p ? p[idx()] : '');
    const el = (tag, css) => { const e = document.createElement(tag); if (css) e.style.cssText = css; return e; };
    const view = () => (model.available && model.views[st] && model.views[st][pk]) || null;
    if (model.available) {
      if (opts.station != null && model.views[opts.station]) st = String(opts.station);
      if (opts.pollutant != null && model.views[st][opts.pollutant]) pk = opts.pollutant;
      hour = Math.max(0, Math.min(model.hours.length - 1, Math.round(Number(opts.hour) || 0)));
    }
    host.setAttribute('role', 'img');
    if (!host.hasAttribute('tabindex')) host.setAttribute('tabindex', '0');
    host.style.cssText += ';background:' + PANEL + ';color:' + CYAN + ';font-family:' + MONO + ';padding:10px;box-sizing:border-box;border:1px solid rgba(125,211,252,0.18);border-radius:8px;box-shadow:0 0 24px rgba(125,211,252,0.06)';
    const cv = el('canvas', 'display:block;width:100%;cursor:default'), ctx = cv.getContext('2d');
    const txt = el('div', 'margin-top:8px;font-size:11px;line-height:1.5;color:' + DIM);
    host.append(cv, txt);

    const record = () => { const v = view(), c = v.cells[hour]; return { hour: c.hour, index: c.i, label: c.label, value: c.value, text: c.text, unit: v.unit, station: v.station, stationName: v.stationName, pollutant: v.pollutant }; };
    const fire = () => { if (opts.onHour && view()) opts.onHour(record()); };
    const fit = (s, max) => { while (s.length > 3 && ctx.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; };
    function wrap(s, max, lines) {   // word wrap into at most `lines` lines, the last one cut with an ellipsis
      const out = []; let cur = '';
      for (const word of s.split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (ctx.measureText(t).width <= max || !cur) cur = t;
        else if (out.length < lines - 1) { out.push(cur); cur = word; }
        else { cur = t; }
      }
      out.push(fit(cur, max));
      return out;
    }
    function rr(x, y, ww, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + ww, y, x + ww, y + hh, r); ctx.arcTo(x + ww, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + ww, y, r); ctx.closePath(); }

    function draw(now) {
      if (dead) return;
      const v = view();
      host.setAttribute('aria-label', L(v ? v.ariaLabel : model.ariaLabel));
      const dpr = Math.max(1, root.devicePixelRatio || 1);
      w = Math.max(200, Math.floor(host.clientWidth - 22));
      txt.textContent = '';
      const line = (s, col) => { const p = el('p', 'margin:0 0 4px' + (col ? ';color:' + col : '')); p.textContent = s; txt.append(p); };
      hits = []; btn = null;
      if (!v) { cv.width = 1; cv.height = 1; cv.style.height = '1px'; line(L(model.empty), CYAN); return; }
      const n = v.cells.length, narrow = w < 520, per = narrow ? Math.ceil(n / 2) : n, nRows = Math.ceil(n / per);
      const gx = narrow ? 2 : 3, cw = (w - gx * (per - 1)) / per, ch = Math.round(Math.max(30, Math.min(46, cw * 1.05)));
      const headH = 26, nameH = narrow ? 36 : 22, hourH = 14, rowH = hourH + ch + 6, lineTop = 14, lineH = 46, lineBot = 14;
      ctx.font = (narrow ? 10 : 11) + 'px ' + MONO;
      const read = wrap(L(v.cells[hour].label), w, 2), readH = 6 + read.length * 14;
      const yCells = headH + nameH, yLine = yCells + nRows * rowH + 4, hgt = Math.ceil(yLine + lineTop + lineH + lineBot + readH + 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); cv.style.height = hgt + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, hgt);
      ctx.textBaseline = 'middle';

      // 1. play / pause button (right) and the replay sentence (left): always on the picture, in amber
      const bw = 30, bh = 20, bx = w - bw, by = 0;
      btn = { x: bx - 4, y: by - 2, w: bw + 8, h: bh + 6 };
      rr(bx + 0.5, by + 0.5, bw - 1, bh - 1, 5); ctx.fillStyle = playing ? 'rgba(251,191,36,0.16)' : 'rgba(125,211,252,0.10)'; ctx.fill(); ctx.strokeStyle = playing ? AMBER : 'rgba(125,211,252,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = playing ? AMBER : CYAN;
      if (playing) { ctx.fillRect(bx + 10, by + 5, 3.5, 10); ctx.fillRect(bx + 16.5, by + 5, 3.5, 10); }
      else { ctx.beginPath(); ctx.moveTo(bx + 11, by + 5); ctx.lineTo(bx + 21, by + 10); ctx.lineTo(bx + 11, by + 15); ctx.closePath(); ctx.fill(); }
      let fs = narrow ? 10 : 11; const rp = L(model.replay);
      ctx.font = '600 ' + fs + 'px ' + MONO;
      while (fs > 8 && ctx.measureText(rp).width > bx - 26) { fs--; ctx.font = '600 ' + fs + 'px ' + MONO; }
      const rw = Math.min(bx - 12, ctx.measureText(rp).width + 16);
      rr(0.5, 0.5, rw, bh - 1, 5); ctx.fillStyle = 'rgba(251,191,36,0.10)'; ctx.fill(); ctx.strokeStyle = 'rgba(251,191,36,0.7)'; ctx.stroke();
      ctx.fillStyle = AMBER; ctx.textAlign = 'left'; ctx.fillText(fit(rp, rw - 14), 8, bh / 2 + 0.5);
      if (!narrow) {   // word next to the button, only where there is room
        ctx.font = '11px ' + MONO; ctx.fillStyle = DIM; ctx.textAlign = 'right';
        const word = L(playing ? model.ui.pause : model.ui.play);
        if (rw + 16 + ctx.measureText(word).width < bx - 8) ctx.fillText(word, bx - 8, bh / 2 + 0.5);
      }

      // 2. which station, which pollutant
      ctx.textAlign = 'left'; ctx.font = (narrow ? 12 : 13) + 'px ' + MONO; ctx.fillStyle = '#e8f6ff';
      const pol = L(v.pollutantName) + (v.unit[0] ? ' · ' + L(v.unit) : '');
      if (narrow) {
        ctx.fillText(fit(L(v.stationName), w), 0, headH + 9);
        ctx.font = '11px ' + MONO; ctx.fillStyle = CYAN; ctx.fillText(fit(pol, w), 0, headH + 25);
      } else {
        ctx.font = '11px ' + MONO; const pw = ctx.measureText(pol).width;
        ctx.fillStyle = CYAN; ctx.textAlign = 'right'; ctx.fillText(pol, w, headH + 10);
        ctx.font = '13px ' + MONO; ctx.fillStyle = '#e8f6ff'; ctx.textAlign = 'left'; ctx.fillText(fit(L(v.stationName), w - pw - 16), 0, headH + 10);
      }

      // 3. the strip: one cell per hour
      const p = reduce || !pulse0 ? 1 : Math.min(1, ((now || 0) - pulse0) / PULSE_MS), ease = 1 - (1 - p) * (1 - p);
      let cur = null;
      v.cells.forEach((c, i) => {
        const r = Math.floor(i / per), k = i % per, x = k * (cw + gx), y = yCells + r * rowH + hourH;
        hits.push({ x, y: y - hourH, w: cw + gx, h: rowH, i });
        ctx.font = (narrow ? 9 : 10) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = i === hour ? AMBER : DIM;
        ctx.fillText(c.clock.slice(0, 2), x + cw / 2, y - hourH / 2);
        if (c.state === 'blank') {
          ctx.fillStyle = 'rgba(125,211,252,0.05)'; ctx.fillRect(x, y, cw, ch);
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip(); ctx.strokeStyle = 'rgba(125,211,252,0.42)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let q = -ch; q < cw; q += 6) { ctx.moveTo(x + q, y + ch); ctx.lineTo(x + q + ch, y); }
          ctx.stroke(); ctx.restore();
          ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(125,211,252,0.6)'; ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1); ctx.restore();
        } else {
          ctx.fillStyle = ramp(c.t); ctx.fillRect(x, y, cw, ch);
          let f = narrow ? 11 : 13; ctx.font = '600 ' + f + 'px ' + MONO;
          while (f > 8 && ctx.measureText(c.text).width > cw - 3) { f--; ctx.font = '600 ' + f + 'px ' + MONO; }
          ctx.fillStyle = c.t > 0.5 ? '#04121f' : '#dff3ff'; ctx.fillText(c.text, x + cw / 2, y + ch / 2 + 0.5);
        }
        if (i === hour) cur = { x, y };
      });
      if (cur) {   // the playhead cell glows (the glow settles after each step; still under reduced motion)
        ctx.save(); ctx.shadowColor = AMBER; ctx.shadowBlur = 8 + 14 * (1 - ease); ctx.strokeStyle = AMBER; ctx.lineWidth = 2;
        ctx.strokeRect(cur.x + 1, cur.y + 1, cw - 2, ch - 2); ctx.strokeRect(cur.x + 1, cur.y + 1, cw - 2, ch - 2); ctx.restore();
      }

      // 4. the thin line of the same values, on the same fixed scale; gaps stay gaps
      const y0 = yLine + lineTop, yb = y0 + lineH, px = (i) => (narrow ? (i + 0.5) * (w / n) : i * (cw + gx) + cw / 2), py = (t) => yb - t * lineH;
      hits.push({ x: 0, y: y0 - 4, w, h: lineH + 8, scrub: true });
      ctx.strokeStyle = 'rgba(125,211,252,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, yb + 0.5); ctx.lineTo(w, yb + 0.5); ctx.stroke();
      ctx.save(); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, y0 + 0.5); ctx.lineTo(w, y0 + 0.5); ctx.stroke(); ctx.restore();
      if (v.scale) {
        ctx.font = '9px ' + MONO; ctx.fillStyle = DIM; ctx.textAlign = 'right';
        ctx.fillText(v.scale.max + (v.unit[0] ? ' ' + L(v.unit) : ''), w, y0 - 7); ctx.fillText(String(v.scale.min), w, yb + 8);
      }
      if (v.empty) {
        ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillStyle = '#e8f6ff'; ctx.textAlign = 'left';
        wrap(L(v.empty), w, 2).forEach((s, i) => ctx.fillText(s, 0, y0 + 16 + i * 14));
      } else {
        ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.beginPath();
        let pen = false;
        v.cells.forEach((c, i) => { if (c.t === null) { pen = false; return; } if (pen) ctx.lineTo(px(i), py(c.t)); else ctx.moveTo(px(i), py(c.t)); pen = true; });
        ctx.stroke();
        ctx.fillStyle = CYAN; v.cells.forEach((c, i) => { if (c.t !== null) { ctx.beginPath(); ctx.arc(px(i), py(c.t), 1.8, 0, 6.3); ctx.fill(); } });
      }
      const hx = Math.round(px(hour)) + 0.5, hc = v.cells[hour];
      ctx.strokeStyle = 'rgba(251,191,36,0.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, y0 - 2); ctx.lineTo(hx, yb + 2); ctx.stroke();
      if (hc.t !== null) { ctx.save(); ctx.shadowColor = AMBER; ctx.shadowBlur = 8; ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(px(hour), py(hc.t), 3.5, 0, 6.3); ctx.fill(); ctx.restore(); }

      // 5. read-out: the sentence of the playhead hour
      ctx.textAlign = 'left'; ctx.font = (narrow ? 10 : 11) + 'px ' + MONO; ctx.fillStyle = '#e8f6ff';
      read.forEach((s, i) => ctx.fillText(s, 0, yb + lineBot + 12 + i * 14));

      // text under the picture: scale, legend, note (all from the model)
      if (v.scale) line(L(v.scale.text));
      for (const l of model.legend) line(L(l));
      line(L(model.note));
    }

    // glow settles over a short time after each step; one extra frame chain, nothing else animates
    function frame(ts) { raf = 0; if (dead || document.hidden) return; draw(ts); if (pulse0 && ts - pulse0 < PULSE_MS) raf = root.requestAnimationFrame(frame); }
    function redraw(step) {
      if (dead) return;
      if (reduce || !root.requestAnimationFrame) { draw(0); return; }
      if (step) pulse0 = root.performance.now();
      draw(root.performance.now());
      if (step && !raf) raf = root.requestAnimationFrame(frame);
    }
    function go(i) {   // move the playhead; returns true when it moved
      const v = view(); if (!v) return false;
      i = Math.max(0, Math.min(v.cells.length - 1, Math.round(Number(i)) || 0));
      if (i === hour) return false;
      hour = i; redraw(true); fire(); return true;
    }
    function arm() { clearTimeout(timer); timer = 0; if (playing && !dead && !document.hidden) timer = setTimeout(tick, STEP_MS); }
    function tick() {
      timer = 0; const v = view(); if (!playing || !v) return;
      if (hour >= v.cells.length - 1) { setPlaying(false); return; }   // one pass through the day, then it rests on the last hour
      go(hour + 1); arm();
    }
    function setPlaying(on) {
      on = !!on && !!view(); if (on === playing) return;
      playing = on; clearTimeout(timer); timer = 0;
      if (playing) arm();
      redraw(false); if (opts.onState) opts.onState({ playing });
    }
    function play() { const v = view(); if (!v || playing) return; if (hour >= v.cells.length - 1) { hour = 0; redraw(true); fire(); } setPlaying(true); }
    function pause() { setPlaying(false); }
    function seek(i) { if (!view()) return; if (!go(i)) redraw(false); }
    function set(want) {
      if (!model.available || !want) return false;
      const s2 = want.station != null && model.views[want.station] ? String(want.station) : st;
      const p2 = want.pollutant != null && model.views[s2][want.pollutant] ? want.pollutant : pk;
      if (s2 === st && p2 === pk) return false;
      st = s2; pk = p2; redraw(true); fire(); if (opts.onChange) opts.onChange(view());
      return true;
    }

    const at = (e) => {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      if (btn && x >= btn.x && x < btn.x + btn.w && y >= btn.y && y < btn.y + btn.h) return { button: true };
      const h = hits.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h);
      if (!h) return null;
      if (h.scrub) { const n = view().cells.length; return { i: Math.max(0, Math.min(n - 1, Math.floor(x / (w / n)))) }; }
      return { i: h.i, cell: true };
    };
    const onMove = (e) => { const h = at(e); cv.style.cursor = h ? 'pointer' : 'default'; if (h && h.i != null && h.i !== hour) { pause(); go(h.i); } };
    const onClick = (e) => {
      const h = at(e);
      if (h && h.button) { if (playing) pause(); else play(); return; }
      if (h && h.i != null) { pause(); go(h.i); }
      if (opts.onPick) opts.onPick(h && h.i != null ? record() : null);
    };
    const onKey = (e) => {
      const v = view(); if (!v || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowLeft') { pause(); go(hour + (k === 'ArrowRight' ? 1 : -1)); }
      else if (k === 'Home') { pause(); go(0); }
      else if (k === 'End') { pause(); go(v.cells.length - 1); }
      else if (k === ' ' || k === 'Spacebar') { if (playing) pause(); else play(); }
      else return;
      e.preventDefault();
    };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);

    // redraw on size and language changes; the playhead rests while the tab is hidden and walks on when it comes back
    let lang = SC.lang;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw(false)) : null;
    if (ro) ro.observe(host);
    const onVis = () => { if (document.hidden) { clearTimeout(timer); timer = 0; } else { redraw(false); arm(); } };
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(() => { if (SC.lang !== lang && !document.hidden) { lang = SC.lang; redraw(false); } }, 500);
    redraw(false);
    if (view()) { fire(); if (!reduce && opts.autoplay !== false) setPlaying(true); }

    return {
      destroy() { dead = true; playing = false; clearTimeout(timer); clearInterval(poll); if (raf && root.cancelAnimationFrame) root.cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.removeEventListener('keydown', onKey); cv.remove(); txt.remove(); },
      set, play, pause, seek,
      toggle() { if (playing) pause(); else play(); },
      get playing() { return playing; },
      get hour() { return hour; },
      get view() { return view(); },
    };
  }

  SC.viz.hourstrip = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
