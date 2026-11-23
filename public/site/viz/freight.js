/*
  freight.js: stacked quarterly bars of freight by cargo group for ONE port and ONE direction, in thousand tonnes.
  The publisher's TOTAL row is a separate white line over the bars; it is never stacked on its own parts.
  A quarter with no published value is left empty (a grey mark under the axis says so); publisher flags are drawn over the bar.
  SC.viz.freight.mount(host, model, { port, direction, onPick }) -> { set({ port, direction }), model(), destroy() }.
  The page builds two <select>s: ports from model.choices and directions from model.directions, and calls set(), which returns the current model.
  Historical data: nothing moves except one entrance when mounted (none under prefers-reduced-motion).
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const AM = '#FBBF24', INK = '#EAF0F7', DIM = '#9fb2cc';
  const COL = { LBK: '#7DD3FC', DBK: '#FBBF24', LCNT: '#34D399', RO_MSP: '#A78BFA', RO_MNSP: '#F472B6', OTH: '#94A3B8', UNK: '#F87171' };
  const SPARE = ['#7DD3FC', '#FBBF24', '#34D399', '#A78BFA', '#F472B6', '#94A3B8', '#F87171', '#FDE68A'];
  const tx = (p) => (Array.isArray(p) ? p[(window.SC && SC.lang === 'el') ? 1 : 0] : String(p == null ? '' : p));
  const num = (v) => (v == null ? null : Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.freightData;
    let m = model, picked = -1, pinned = -1, W = 0, H = 0, L = null, raf = 0, dead = false, grow = 1, t0 = 0;
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%';
    host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d');
    if (D && (opts.port || opts.direction)) m = D.select(m, { port: opts.port, direction: opts.direction });
    const ok = () => m && m.available && Array.isArray(m.bars);
    const color = (code, i) => COL[code] || SPARE[i % SPARE.length];
    const aria = () => host.setAttribute('aria-label', tx(ok() && picked >= 0 ? m.bars[picked].label : m.ariaLabel));
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    function lines(s, font, w) { ctx.font = font; const out = []; let line = ''; for (const word of String(s).split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
    function fit(s, w) { if (ctx.measureText(s).width <= w) return s; while (s.length > 4 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
    function layout() {
      const w = Math.max(240, host.clientWidth || 320), pad = 10; W = w;
      if (!ok()) { H = 90; size(); return; }
      const inner = w - 2 * pad, f11 = '11px ' + MONO;
      const head = [
        { t: tx(m.portName) + ' · ' + tx(m.directionName), f: '700 14px ' + MONO, c: INK, h: 19 },
        { t: tx(m.strings.still) + ' · ' + tx(m.unit), f: f11, c: AM, h: 15 },
        { t: tx(m.latestText), f: f11, c: DIM, h: 15 },
      ].map((r) => Object.assign(r, { ls: lines(r.t, r.f, inner) }));
      let y = pad; head.forEach((r) => { r.y = y; y += r.ls.length * r.h; });
      const axisW = 46, plotX = pad + axisW, plotW = inner - axisW, plotY = y + 16, plotH = w >= 760 ? 260 : 190, bw = plotW / m.bars.length;
      const tableY = plotY + plotH + 34 + 22, cols = w >= 760 ? 2 : 1, rowH = 18;
      const rows = [{ code: 'TOTAL', name: m.strings.total, total: true }].concat(m.groups.map((g, i) => ({ code: g.code, name: g.name, gi: i })));
      const colW = (inner - (cols - 1) * 24) / cols, perCol = Math.ceil(rows.length / cols);
      rows.forEach((r, i) => { r.x = pad + Math.floor(i / perCol) * (colW + 24); r.y = tableY + (i % perCol) * rowH; r.w = colW; });
      const footY = tableY + perCol * rowH + 8, foot = lines(tx(m.strings.mass) + ' ' + tx(m.strings.source) + '.', '10px ' + MONO, inner);
      H = footY + foot.length * 14 + pad;
      L = { pad, inner, head, plotX, plotW, plotY, plotH, bw, tableY, rows, footY, foot };
      size();
    }
    function size() { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function draw() {
      raf = 0; if (dead) return; ctx.clearRect(0, 0, W, H); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      if (!ok()) { ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; lines(tx(m.empty || m.ariaLabel), ctx.font, W - 20).forEach((s, i) => ctx.fillText(s, 10, 28 + i * 16)); return; }
      const { pad, inner, head, plotX, plotW, plotY, plotH, bw, tableY, rows, footY, foot } = L;
      head.forEach((r) => { ctx.font = r.f; ctx.fillStyle = r.c; r.ls.forEach((s, i) => ctx.fillText(s, pad, r.y + r.h * (i + 1) - 4)); });
      const Y = (t) => plotY + plotH - t * plotH, base = plotY + plotH;
      // axis: 0, half and full scale, in the unit; one scale per port
      ctx.font = '10px ' + MONO; ctx.textAlign = 'right';
      [0, .5, 1].forEach((t) => { const y = Math.round(Y(t)) + .5; ctx.strokeStyle = t ? 'rgba(125,211,252,.12)' : 'rgba(160,175,195,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); ctx.stroke(); ctx.fillStyle = DIM; ctx.fillText(num(m.scaleMax * t), plotX - 6, y + 3); });
      ctx.textAlign = 'left'; ctx.fillStyle = '#6f84a3'; ctx.fillText(tx(m.unit), pad, plotY - 6);
      const gap = bw >= 8 ? 2 : 1, w = Math.max(1.5, bw - gap);
      // year marks under the first quarter of a year
      const every = bw * 4 >= 34 ? 1 : bw * 8 >= 34 ? 2 : 3; let yi = 0;
      m.bars.forEach((b, i) => { if (b.qn !== 'Q1' && i !== 0) return; const x = plotX + i * bw; ctx.strokeStyle = 'rgba(160,175,195,.35)'; ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, base); ctx.lineTo(Math.round(x) + .5, base + 5); ctx.stroke(); if (yi++ % every === 0) { ctx.fillStyle = DIM; ctx.fillText(b.year, x + 1, base + 28); } });
      if (m.isEmpty) { ctx.fillStyle = DIM; ctx.font = '12px ' + MONO; lines(tx(m.latestText), ctx.font, plotW - 20).forEach((s, i) => ctx.fillText(s, plotX + 10, plotY + 40 + i * 16)); }
      m.bars.forEach((b, i) => {
        const x = plotX + i * bw + (bw - w) / 2;
        if (!b.published) { ctx.fillStyle = 'rgba(160,175,195,.55)'; ctx.fillRect(x + w / 2 - 1.5, base + 9, 3, 1.5); }
        else b.parts.forEach((s, gi) => { if (s.v == null || s.v === 0) return; const y1 = Y(s.t1 * grow), y0 = Y(s.t0 * grow); ctx.fillStyle = color(s.code, gi); ctx.globalAlpha = picked < 0 || picked === i ? 1 : .7; ctx.fillRect(x, y1, w, Math.max(.75, y0 - y1 - (y0 - y1 > 2 ? .5 : 0))); ctx.globalAlpha = 1; });
        const flags = Object.keys(b.flags).map((k) => b.flags[k]).concat(b.totalFlag ? [b.totalFlag] : []).filter((f, k, a) => a.indexOf(f) === k).join('');
        if (flags) { ctx.fillStyle = '#fff'; ctx.font = '700 9px ' + MONO; ctx.textAlign = 'center'; const top = b.published ? Y(Math.max(b.tTotal || 0, b.parts.length ? b.parts[b.parts.length - 1].t1 : 0)) - 6 : base - 6; ctx.fillText(flags, x + w / 2, top); ctx.textAlign = 'left'; }
        if (i === picked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.strokeRect(plotX + i * bw - .5, plotY - 2, bw + 1, plotH + 14); }
      });
      // the publisher's total: its own line, broken where no total is published
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.25; ctx.beginPath(); let pen = false;
      m.bars.forEach((b, i) => { if (b.tTotal == null) { pen = false; return; } const x = plotX + (i + .5) * bw, y = Y(b.tTotal * grow); if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; }); ctx.stroke();
      ctx.fillStyle = '#fff'; m.bars.forEach((b, i) => { if (b.tTotal == null) return; ctx.beginPath(); ctx.arc(plotX + (i + .5) * bw, Y(b.tTotal * grow), bw >= 8 ? 2.2 : 1.6, 0, Math.PI * 2); ctx.fill(); });
      // key for an empty quarter
      ctx.font = '10px ' + MONO; ctx.textAlign = 'right'; ctx.fillStyle = '#6f84a3'; const ek = tx(m.strings.emptyQuarter); ctx.fillText(ek, pad + inner, plotY - 6); ctx.fillStyle = 'rgba(160,175,195,.75)'; ctx.fillRect(pad + inner - ctx.measureText(ek).width - 9, plotY - 9, 4, 1.5); ctx.textAlign = 'left';
      // read-out line, then the legend that doubles as the table of values for the picked quarter
      const b = picked >= 0 ? m.bars[picked] : null; ctx.font = (b ? '700 ' : '') + '12px ' + MONO; ctx.fillStyle = b ? '#fff' : '#8ea3bf';
      const rl = lines(b ? tx(b.name) + (b.published ? '' : ': ' + tx(m.strings.emptyQuarter)) : tx(m.strings.hint), ctx.font, inner); ctx.fillText(rl[0] + (rl.length > 1 ? '…' : ''), pad, tableY - 10);
      ctx.font = '11px ' + MONO;
      rows.forEach((r) => {
        const has = r.total || m.shown.indexOf(r.code) >= 0, y = r.y + 12;
        if (r.total) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(r.x, y - 4); ctx.lineTo(r.x + 12, y - 4); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r.x + 6, y - 4, 2, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillStyle = color(r.code, r.gi); ctx.globalAlpha = has ? 1 : .35; ctx.fillRect(r.x + 1, y - 9, 10, 10); ctx.globalAlpha = 1; }
        let v = '';
        if (b) { const s = r.total ? { v: b.total, flag: b.totalFlag } : b.parts[r.gi]; v = s.v == null ? tx(m.strings.notPublished) : num(s.v) + (s.flag ? ' [' + s.flag + ']' : ''); ctx.fillStyle = s.v == null ? '#6f84a3' : '#fff'; ctx.textAlign = 'right'; ctx.fillText(v, r.x + r.w, y); ctx.textAlign = 'left'; }
        ctx.fillStyle = has ? INK : '#6f84a3'; ctx.fillText(fit(tx(r.name), r.w - 20 - (v ? ctx.measureText(v).width + 10 : 0)), r.x + 18, y);
      });
      ctx.fillStyle = '#6f84a3'; ctx.font = '10px ' + MONO; foot.forEach((s, i) => ctx.fillText(s, pad, footY + 10 + i * 14));
    }
    const ask = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    function enter(ts) { if (dead) return; if (!t0) t0 = ts; const k = Math.min(1, (ts - t0) / 500); grow = 1 - Math.pow(1 - k, 3); draw(); if (k < 1 && !document.hidden) requestAnimationFrame(enter); else if (grow < 1) { grow = 1; draw(); } }
    function hit(ev) { if (!ok() || !L) return -1; const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top; if (y < L.plotY - 4 || y > L.plotY + L.plotH + 14 || x < L.plotX || x >= L.plotX + L.plotW) return -1; const i = Math.floor((x - L.plotX) / L.bw); return i >= 0 && i < m.bars.length ? i : -1; }
    function pick(i, quiet) { if (i === picked) return; picked = i; aria(); ask(); if (!quiet && opts.onPick) { const b = i >= 0 ? m.bars[i] : null; opts.onPick(b ? { quarter: b.q, total: b.total, parts: b.parts.map((s) => ({ code: s.code, name: s.name, value: s.v, flag: s.flag })), published: b.published, port: m.port, direction: m.direction, label: b.label } : null); } }
    const onMove = (ev) => { const i = hit(ev); pick(i >= 0 ? i : pinned); cv.style.cursor = i >= 0 ? 'pointer' : 'default'; };
    const onLeave = () => pick(pinned);
    const onClick = (ev) => { const i = hit(ev); pinned = i; pick(i); };
    const onKey = (ev) => { if (!ok()) return; const n = m.bars.length; let i = picked;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') i = picked < 0 ? 0 : Math.min(n - 1, picked + 1); else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') i = picked < 0 ? n - 1 : Math.max(0, picked - 1);
      else if (ev.key === 'Home') i = 0; else if (ev.key === 'End') i = n - 1; else if (ev.key === 'Escape') i = -1; else return;
      ev.preventDefault(); pinned = i; pick(i); };
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick); host.addEventListener('keydown', onKey);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { layout(); ask(); }) : null; if (ro) ro.observe(host);
    layout(); aria();
    if (still || document.hidden || !ok()) draw(); else { grow = 0; requestAnimationFrame(enter); }
    return {
      set(o) { if (o && D && (o.port != null || o.direction != null)) { const n = D.select(m, { port: o.port, direction: o.direction }); if (n !== m) { m = n; picked = pinned = -1; if (opts.onPick) opts.onPick(null); } } layout(); aria(); ask(); return m; },
      model: () => m,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.removeEventListener('keydown', onKey); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); },
    };
  }
  SC.viz.freight = { mount };
})();
