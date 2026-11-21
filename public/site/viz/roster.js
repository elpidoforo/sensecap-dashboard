/* Roster widget (drawing only). All numbers come from roster-data.js. SC.viz.roster.mount(host, model, opts) -> { destroy(), update(model) }.
   Click a row: toggles its glowing expanded view (honesty line and licence). Click the step counter, or press the arrow keys:
   walks through the rows (a reading aid only). opts.onPick(row|null) reports the hovered or clicked row. */
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {}); SC.viz = SC.viz || {};
  const BG = '#050b16', CY = '#7DD3FC', AM = '#FBBF24', INK = '#d6e6f5', DIM = '#7f93aa', LINE = 'rgba(125,211,252,0.22)', RED = '#fda4af';
  const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const L = () => (SC.lang === 'el' ? 1 : 0);
  const DOT = { ok: CY, past: AM, unavailable: RED, noanswer: RED, nostamp: DIM };

  function mount(host, model, opts) {
    opts = opts || {};
    const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const cv = document.createElement('canvas'); cv.style.cssText = 'display:block;width:100%;background:' + BG + ';border-radius:10px;';
    host.appendChild(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    let m = model, step = (model.step && model.step.index) || 0, openId = model.openId || null, hover = -1, hit = [], W = 0, H = 0, raf = 0, dead = false, t0 = performance.now();

    const label = () => host.setAttribute('aria-label', m.ariaLabel[L()]);
    function wrap(text, maxW, font) {
      ctx.font = font; const words = String(text).split(/\s+/), out = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }
      if (cur) out.push(cur); return out;
    }
    function layout() {
      const w = Math.max(240, host.clientWidth || 360), dpr = Math.min(2, window.devicePixelRatio || 1);
      const pad = 14, narrow = w < 520, rowH = narrow ? 58 : 50, skyH = 92;
      let y = pad + 22 + skyH + 22; const rows = [];
      m.rows.forEach((r, i) => {
        const open = openId === r.id, tx = pad + 34, tw = w - tx - pad - 8;
        const lines = open ? wrap(r.honesty[L()], tw, '11px ' + MONO).concat(wrap((L() ? 'Άδεια: ' : 'Licence: ') + r.licence[L()], tw, '11px ' + MONO)).concat(r.reason ? wrap(r.reason[L()], tw, '11px ' + MONO) : []) : [];
        const h = rowH + (open ? 10 + lines.length * 15 : 0); rows.push({ y, h, open, lines, r }); y += h + 6;
      });
      const total = y + 30;
      cv.width = Math.round(w * dpr); cv.height = Math.round(total * dpr); cv.style.height = total + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = total; return { rows, pad, narrow, skyH };
    }
    function draw(now) {
      const g = layout(), pad = g.pad, lang = L(); ctx.clearRect(0, 0, W, H); ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); hit = [];
      ctx.textBaseline = 'alphabetic';
      // header: title and step counter
      ctx.fillStyle = INK; ctx.font = '600 13px ' + MONO; ctx.textAlign = 'left'; ctx.fillText(m.title[lang], pad, pad + 12);
      const st = m.step.text[lang]; ctx.textAlign = 'right'; ctx.fillStyle = CY; ctx.fillText(st, W - pad, pad + 12);
      const sw = ctx.measureText(st).width; hit.push({ kind: 'step', x: W - pad - sw - 8, y: 4, w: sw + 16, h: 26 });
      ctx.textAlign = 'left';
      if (m.empty) { ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; ctx.fillText(m.empty[lang], pad, pad + 50); return; }
      // skyline: one column per row, one pixel tile per tiles count
      const sky = m.skyline, n = sky.columns.length, top = pad + 24, bw = (W - pad * 2) / n, tile = Math.max(3, Math.min(9, Math.floor((g.skyH - 4) / sky.cap) - 1));
      ctx.fillStyle = DIM; ctx.font = '10px ' + MONO; ctx.fillText(sky.title[lang], pad, top + 8);
      ctx.strokeStyle = LINE; ctx.beginPath(); ctx.moveTo(pad, top + g.skyH + 0.5); ctx.lineTo(W - pad, top + g.skyH + 0.5); ctx.stroke();
      sky.columns.forEach((c, i) => {
        const cx = pad + bw * i + bw / 2, tw = Math.max(6, Math.min(18, bw - 16)), sel = i === step;
        for (let k = 0; k < c.tiles; k++) {
          ctx.fillStyle = sel ? AM : CY; ctx.globalAlpha = sel ? 0.95 : 0.55;
          ctx.fillRect(Math.round(cx - tw / 2), top + g.skyH - (k + 1) * (tile + 1), Math.round(tw), tile);
        }
        ctx.globalAlpha = 1;
        if (!c.available) { ctx.fillStyle = DIM; ctx.font = '10px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('–', cx, top + g.skyH - 4); ctx.textAlign = 'left'; }
      });
      ctx.fillStyle = DIM; ctx.font = '10px ' + MONO; ctx.fillText(sky.oneTileText[lang], pad, top + g.skyH + 14);
      // rail
      const g0 = g.rows[0], gN = g.rows[g.rows.length - 1], rx = pad + 10;
      ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rx + 0.5, g0.y + 16); ctx.lineTo(rx + 0.5, gN.y + 16); ctx.stroke();
      const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin((now - t0) / 700);
      g.rows.forEach((o, i) => {
        const r = o.r, x = pad + 26, w = W - x - pad, sel = i === step, hov = i === hover;
        // card
        ctx.fillStyle = o.open ? 'rgba(125,211,252,0.07)' : 'rgba(255,255,255,0.02)'; ctx.fillRect(x, o.y, w, o.h);
        if (o.open) { ctx.save(); ctx.shadowColor = CY; ctx.shadowBlur = 8 + 8 * pulse; ctx.strokeStyle = CY; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, o.y + 0.5, w - 1, o.h - 1); ctx.restore(); }
        else { ctx.strokeStyle = sel || hov ? 'rgba(251,191,36,0.6)' : LINE; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, o.y + 0.5, w - 1, o.h - 1); }
        // dot
        const col = DOT[r.status] || DIM; ctx.save(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = r.status === 'ok' ? 6 : 0; ctx.beginPath(); ctx.arc(rx + 0.5, o.y + 16, 5, 0, 6.2832); ctx.fill(); ctx.restore();
        // text
        const tx = x + 12, tw = w - 24; ctx.fillStyle = INK; ctx.font = '600 12px ' + MONO;
        let ttl = r.title[lang]; while (ctx.measureText(ttl).width > tw && ttl.length > 4) ttl = ttl.slice(0, -2); if (ttl !== r.title[lang]) ttl += '…';
        ctx.fillText(ttl, tx, o.y + 18);
        ctx.fillStyle = DIM; ctx.font = '10px ' + MONO; let src = r.source[lang]; while (ctx.measureText(src).width > tw && src.length > 4) src = src.slice(0, -2); if (src !== r.source[lang]) src += '…';
        ctx.fillText(src, tx, o.y + 32);
        // age line and bar
        const info = r.available ? (lang ? 'τελευταία λήψη ' : 'last fetched ') + r.ageText[lang] : r.statusLabel[lang];
        ctx.fillStyle = r.available ? INK : RED; ctx.fillText(info, tx, o.y + 46);
        ctx.font = '10px ' + MONO; const bx = tx + ctx.measureText(info).width + 14, bwid = x + w - 12 - 44 - bx;
        if (r.available && bwid > 40) {
          ctx.fillStyle = 'rgba(125,211,252,0.12)'; ctx.fillRect(bx, o.y + 39, bwid, 6);
          if (r.progress != null) { ctx.fillStyle = r.progress >= 100 ? AM : CY; ctx.fillRect(bx, o.y + 39, bwid * r.progress / 100, 6); }
          ctx.fillStyle = DIM; ctx.textAlign = 'right'; ctx.fillText(r.progress == null ? '–' : r.progress + '%', x + w - 12, o.y + 46); ctx.textAlign = 'left';
        }
        if (o.open) { ctx.fillStyle = INK; ctx.font = '11px ' + MONO; o.lines.forEach((ln, k) => { ctx.fillText(ln, tx, o.y + 66 + k * 15); }); }
        hit.push({ kind: 'row', i, x, y: o.y, w, h: o.h });
      });
      ctx.fillStyle = DIM; ctx.font = '10px ' + MONO; const hint = wrap(m.step.hint[lang], W - pad * 2, '10px ' + MONO); hint.forEach((ln, k) => ctx.fillText(ln, pad, H - 22 + k * 12));
    }
    const at = (e) => { const b = cv.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top; return hit.find((h) => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) || null; };
    function go(d) { const n = m.rows.length; if (!n) return; step = (step + d + n) % n; m.step.index = step; m.step.n = step + 1; m.step.text = ['step ' + (step + 1) + '/' + n, 'βήμα ' + (step + 1) + '/' + n]; redraw(); if (opts.onPick) opts.onPick(m.rows[step]); }
    function onClick(e) {
      const h = at(e); if (!h) return;
      if (h.kind === 'step') { go(1); return; }
      step = h.i; m.step.index = step; m.step.n = step + 1; m.step.text = ['step ' + (step + 1) + '/' + m.rows.length, 'βήμα ' + (step + 1) + '/' + m.rows.length];
      const id = m.rows[h.i].id; openId = openId === id ? null : id; redraw(); if (opts.onPick) opts.onPick(openId ? m.rows[h.i] : null);
    }
    function onMove(e) { const h = at(e), i = h && h.kind === 'row' ? h.i : -1; cv.style.cursor = h ? 'pointer' : 'default'; if (i !== hover) { hover = i; redraw(); if (opts.onPick && i >= 0) opts.onPick(m.rows[i]); } }
    function onKey(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if ((e.key === 'Enter' || e.key === ' ') && m.rows[step]) { e.preventDefault(); const id = m.rows[step].id; openId = openId === id ? null : id; redraw(); }
    }
    function redraw() { if (!dead) draw(performance.now()); }
    function loop(t) { if (dead) return; if (!document.hidden && openId) draw(t); raf = requestAnimationFrame(loop); }
    cv.addEventListener('click', onClick); cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', () => { hover = -1; redraw(); if (opts.onPick) opts.onPick(null); }); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(redraw) : null; if (ro) ro.observe(host);
    const onVis = () => { if (!document.hidden) redraw(); }; document.addEventListener('visibilitychange', onVis);
    label(); redraw(); if (!reduce) raf = requestAnimationFrame(loop);
    return {
      update(next) { m = next; if (step >= m.rows.length) step = 0; label(); redraw(); },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); host.removeEventListener('keydown', onKey); if (cv.parentNode) cv.parentNode.removeChild(cv); }
    };
  }
  SC.viz.roster = { mount };
})();
