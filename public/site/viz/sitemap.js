/*
  sitemap.js: the Site Map board. The site's own menu builds itself as a graph: a white root, one coloured hub per part of
  the menu, and one node per page, appearing one at a time in menu order. The open group spreads out; finished groups pull in
  and stay joined. The list on the side, the segmented bar, the counters, the ring on the newest node and the footer all read
  the same clock, so pause, replay and seek keep them together. Click a node or a row to open that page.
  SC.viz.sitemap.mount(host, model, { onOpen(id), onTime(t, d, playing) }) -> { play, pause, replay, seek, time, duration, isPaused, destroy }.
*/
(function () {
  'use strict';
  window.SC = window.SC || {}; SC.viz = SC.viz || {};
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const C = { bg: '#02060d', pan: 'rgba(8,18,34,.94)', line: 'rgba(125,211,252,.22)', ink: '#EAF0F7', mute: '#7f93ad', white: '#ffffff', amber: '#FBBF24' };
  const lg = () => (window.SC && SC.lang === 'el' ? 1 : 0), tx = (p) => (Array.isArray(p) ? p[lg()] : String(p == null ? '' : p));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), c01 = (v) => clamp(v, 0, 1), ease = (t) => { t = c01(t); return t * t * (3 - 2 * t); }, lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function mount(host, model, opts) {
    opts = opts || {};
    const D = SC.viz.sitemapData, reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const cv = document.createElement('canvas'); cv.style.display = 'block'; cv.style.width = '100%'; host.textContent = ''; host.append(cv); host.setAttribute('role', 'img'); host.tabIndex = 0;
    const ctx = cv.getContext('2d'), m = model;
    let W = 0, H = 0, L = null, raf = 0, dead = false, paused = false, T = 0, amb = 0, lastNow = 0, hover = -1, places = [], rows = [], userScroll = 0, listMax = 0;

    const rr = (x, y, w, h, r) => { r = Math.min(r, h / 2, w / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
    const fit = (s, w) => { if (ctx.measureText(s).width <= w) return s; while (s.length > 3 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };

    function layout() {
      const w = Math.max(300, host.clientWidth || 320), wide = w >= 820, pad = wide ? 12 : 8, top = 58, foot = 54; let o;
      if (wide) { const h = clamp(Math.round(w * 0.56), 600, 820), lw = Math.round(w * 0.24); o = { wide, pad, top, list: { x: pad, y: top, w: lw, h: h - top - pad }, graph: { x: pad + lw + 10, y: top, w: w - lw - pad * 2 - 10, h: h - top - pad - foot - 8 } }; o.foot = { x: o.graph.x, y: h - pad - foot, w: o.graph.w, h: foot }; W = w; H = h; }
      else { const gh = Math.round(w * 1.0); o = { wide, pad, top, graph: { x: pad, y: top, w: w - pad * 2, h: gh } }; o.foot = { x: pad, y: top + gh + 8, w: w - pad * 2, h: 64 }; o.list = { x: pad, y: o.foot.y + 72, w: w - pad * 2, h: 230 }; W = w; H = o.list.y + 230 + pad; }
      L = o; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // how open a group is at time T (1 = spread out, 0 = pulled in)
    function openness(g) { const a = ease((T - (g.start - 500)) / 600), b = ease((T - (g.end + m.hold * 0.25)) / 700); return T >= m.duration - D.END ? 0.45 * (1 - 0) + 0 : a * (1 - 0.62 * b); }
    function geometry() {
      const o = L, G = o.graph, st = D.at(m, T), s = Math.min(G.w, G.h), cx = G.x + G.w / 2, cy = G.y + G.h / 2, fin = T >= m.duration - D.END;
      // the view drifts toward the open group, then back to the middle when the map is complete
      let camx = 0, camy = 0, wsum = 0; m.groups.forEach((g) => { const w = openness(g) * (fin ? 0 : 1); camx += Math.cos(g.angle) * w; camy += Math.sin(g.angle) * w; wsum += w; });
      const drift = s * 0.16, sway = reduce.matches ? 0 : 1; const ox = -camx / Math.max(1, wsum) * drift + Math.sin(amb / 4200) * 4 * sway, oy = -camy / Math.max(1, wsum) * drift + Math.cos(amb / 5100) * 3 * sway;
      const root = [cx + ox, cy + oy], hubs = m.groups.map((g) => { const op = openness(g), d = s * (0.27 + 0.08 * op); return { x: root[0] + Math.cos(g.angle) * d * (G.w > G.h ? Math.min(1.7, G.w / G.h * 0.95) : 1), y: root[1] + Math.sin(g.angle) * d, R: s * (0.12 + 0.13 * op), op }; });
      places = m.items.map((it) => { const h = hubs[it.group], pop = reduce.matches ? (it.at <= T ? 1 : 0) : c01((T - it.at) / 260); if (pop <= 0) return null; const rad = it.r * h.R * (0.35 + 0.65 * ease(pop)), a = it.a + (reduce.matches ? 0 : amb / 9000) * (it.group % 2 ? 1 : -1); return { x: h.x + Math.cos(a) * rad, y: h.y + Math.sin(a) * rad, pop, k: it.k }; });
      return { st, root, hubs, fin };
    }

    function drawHeader(st) {
      const o = L, t = m.totals, cur = st.current >= 0 ? m.items[st.current] : null, g = st.group >= 0 ? m.groups[st.group] : null;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 15 : 13) + 'px ' + MONO; ctx.fillText('map / kleanthis', o.pad + 2, 20);
      ctx.fillStyle = g ? g.hue : C.mute; ctx.font = '700 10.5px ' + MONO; ctx.fillText(fit((g ? tx(g.name) : st.done ? (lg() ? 'ολόκληρος ο χάρτης' : 'the whole map') : '').toUpperCase(), o.wide ? 190 : 130), o.pad + 2, 36);
      ctx.textAlign = 'right'; ctx.fillStyle = C.ink; ctx.font = '700 ' + (o.wide ? 20 : 15) + 'px ' + MONO; ctx.fillText(st.shown + '/' + t.pages, W - o.pad - 2, 24); ctx.fillStyle = C.mute; ctx.font = '9px ' + MONO; ctx.fillText(lg() ? 'ΣΕΛΙΔΕΣ' : 'PAGES', W - o.pad - 2, 37); ctx.textAlign = 'left';
      // segmented bar: one segment per part of the menu, as wide as its number of pages
      const bx = o.wide ? 230 : 150, bw = W - bx - (o.wide ? 120 : 76), by = 14; let x = bx;
      m.groups.forEach((gr, i) => { const w = (bw - (m.groups.length - 1) * 4) * gr.count / t.pages, part = st.perGroup[i] / gr.count; ctx.fillStyle = 'rgba(125,211,252,.12)'; rr(x, by, w, 8, 3); ctx.fill(); if (part > 0) { ctx.fillStyle = gr.hue; rr(x, by, Math.max(4, w * part), 8, 3); ctx.fill(); }
        ctx.font = '8.5px ' + MONO; ctx.fillStyle = st.group === i ? gr.hue : C.mute; ctx.fillText(fit(tx(gr.name) + ' ' + st.perGroup[i] + '/' + gr.count, w - 2), x, by + 22); x += w + 4; });
    }

    function drawGraph(geo) {
      const o = L, G = o.graph, st = geo.st;
      rr(G.x, G.y, G.w, G.h, 8); ctx.fillStyle = '#030914'; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      ctx.save(); rr(G.x, G.y, G.w, G.h, 8); ctx.clip();
      for (let i = 0; i < 150; i++) { const x = G.x + rnd(i) * G.w, y = G.y + rnd(i + 500) * G.h; ctx.fillStyle = '#9fc7ff'; ctx.globalAlpha = 0.1 + 0.25 * rnd(i + 900); ctx.fillRect(x, y, 1.2, 1.2); } ctx.globalAlpha = 1; // a still field of faint dots, decoration only
      const root = geo.root;
      geo.hubs.forEach((h, gi) => { const g = m.groups[gi], on = c01((T - (g.start - 500)) / 400); if (on <= 0) return;
        ctx.strokeStyle = g.hue; ctx.globalAlpha = 0.5 * on; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(root[0], root[1]); ctx.lineTo(lerp(root[0], h.x, on), lerp(root[1], h.y, on)); ctx.stroke(); ctx.globalAlpha = 1;
        const gl = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.R * 1.5); gl.addColorStop(0, g.hue + '30'); gl.addColorStop(1, g.hue + '00'); ctx.fillStyle = gl; ctx.globalAlpha = on; ctx.beginPath(); ctx.arc(h.x, h.y, h.R * 1.5, 0, 7); ctx.fill(); ctx.globalAlpha = 1; });
      // links hub -> node, then the nodes
      m.items.forEach((it) => { const p = places[it.k]; if (!p) return; const h = geo.hubs[it.group], g = m.groups[it.group]; ctx.strokeStyle = g.hue; ctx.globalAlpha = (0.12 + 0.25 * h.op) * p.pop; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }); ctx.globalAlpha = 1;
      m.items.forEach((it) => { const p = places[it.k]; if (!p) return; const g = m.groups[it.group], h = geo.hubs[it.group], cur = it.k === st.current && !geo.fin, hv = it.k === hover, r = (it.big ? 6.5 : 4.4) * (0.7 + 0.5 * h.op) * (0.4 + 0.6 * ease(p.pop)) * (cur || hv ? 1.5 : 1);
        ctx.fillStyle = g.hue; ctx.globalAlpha = p.pop; if (cur || hv) { ctx.shadowColor = g.hue; ctx.shadowBlur = 16; } ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85 * p.pop; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.35, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        if (cur) { const k = reduce.matches ? 0.5 : ((T - it.at) % 900) / 900; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1 - k * 0.7; ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + k * 10, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } });
      // hubs on top, with their names
      geo.hubs.forEach((h, gi) => { const g = m.groups[gi], on = c01((T - (g.start - 500)) / 400); if (on <= 0) return; ctx.globalAlpha = on; ctx.fillStyle = '#06101f'; ctx.strokeStyle = g.hue; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, 9 + 3 * h.op, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = g.hue; ctx.beginPath(); ctx.arc(h.x, h.y, 3.5, 0, 7); ctx.fill();
        ctx.font = '700 ' + (o.wide ? 11 : 10) + 'px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = g.hue; ctx.fillText(tx(g.name).toUpperCase() + ' ' + st.perGroup[gi], h.x, h.y - h.R - 8 < G.y + 14 ? h.y + h.R + 16 : h.y - h.R - 8); ctx.textAlign = 'left'; ctx.globalAlpha = 1; });
      const pr = 15; ctx.shadowColor = '#fff'; ctx.shadowBlur = 22; ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.arc(root[0], root[1], pr, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#0b2a4a'; ctx.font = '700 9px ' + MONO; ctx.textAlign = 'center'; ctx.fillText('K', root[0], root[1] + 3); ctx.textAlign = 'left';
      // the label of the newest (or pointed) node
      const lab = hover >= 0 ? hover : (!geo.fin ? st.current : -1); if (lab >= 0 && places[lab]) { const p = places[lab], it = m.items[lab], g = m.groups[it.group], txt = tx(it.name); ctx.font = '700 11px ' + MONO; const tw = ctx.measureText(txt).width + 14, lx = clamp(p.x + 12, G.x + 6, G.x + G.w - tw - 6), ly = clamp(p.y - 26, G.y + 6, G.y + G.h - 24); rr(lx, ly, tw, 20, 4); ctx.fillStyle = 'rgba(6,14,28,.95)'; ctx.fill(); ctx.strokeStyle = g.hue; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = C.ink; ctx.fillText(txt, lx + 7, ly + 14); }
      ctx.restore();
    }

    function drawFoot(st, fin) {
      const o = L, r = o.foot, k = hover >= 0 ? hover : st.current; rr(r.x, r.y, r.w, r.h, 6); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke(); ctx.textAlign = 'left';
      if (k < 0) { ctx.fillStyle = C.mute; ctx.font = '11px ' + MONO; ctx.fillText(lg() ? 'Ο χάρτης ξεκινά.' : 'The map is starting.', r.x + 12, r.y + 22); return; }
      const it = m.items[k], g = m.groups[it.group], al = reduce.matches || hover >= 0 ? 1 : c01((T - it.at) / 200); ctx.globalAlpha = fin && hover < 0 ? 1 : al;
      if (fin && hover < 0) { ctx.fillStyle = C.ink; ctx.font = '700 13px ' + MONO; ctx.fillText(fit(m.totals.pages + (lg() ? ' σελίδες στον χάρτη. Πατήστε μια τελεία ή μια γραμμή για να ανοίξετε τη σελίδα.' : ' pages on the map. Click a dot or a row to open that page.'), r.w - 24), r.x + 12, r.y + 22); ctx.fillStyle = C.mute; ctx.font = '10px ' + MONO; ctx.fillText(fit(lg() ? 'Ο χάρτης δείχνει το μενού του ιστοτόπου, όχι πόσο χρησιμοποιείται κάθε σελίδα.' : 'The map shows the menu of the site, not how much each page is used.', r.w - 24), r.x + 12, r.y + 40); ctx.globalAlpha = 1; return; }
      ctx.fillStyle = g.hue; ctx.font = '9px ' + MONO; ctx.fillText(tx(g.name).toUpperCase() + ' · ' + String(it.k + 1).padStart(2, '0') + '/' + m.totals.pages, r.x + 12, r.y + 15);
      ctx.fillStyle = C.ink; ctx.font = '700 14px ' + MONO; ctx.fillText(fit(tx(it.name), r.w - 24), r.x + 12, r.y + 32); ctx.fillStyle = '#b9c7da'; ctx.font = '10.5px ' + MONO; ctx.fillText(fit(tx(it.desc), r.w - 24), r.x + 12, r.y + 47); ctx.globalAlpha = 1;
    }

    function drawList(st, fin) {
      const o = L, r = o.list, rowH = 21; rr(r.x, r.y, r.w, r.h, 8); ctx.fillStyle = C.pan; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
      // rows: a header per part of the menu, then its pages; the list glides so the newest page stays in view
      const all = []; m.groups.forEach((g) => { all.push({ head: g }); m.items.filter((it) => it.group === g.i).forEach((it) => all.push({ it })); });
      const curRow = st.current < 0 ? 0 : all.findIndex((x) => x.it && x.it.k === st.current), next = st.current + 1 < m.items.length ? m.items[st.current + 1] : null, frac = st.current >= 0 && next && !fin ? c01((T - m.items[st.current].at) / Math.max(1, next.at - m.items[st.current].at)) : 0;
      const nextRow = next ? all.findIndex((x) => x.it && x.it.k === next.k) : curRow, pos = lerp(curRow, nextRow, ease(frac)), maxS = Math.max(0, all.length * rowH - (r.h - 16)), scroll = fin ? clamp(userScroll, 0, maxS) : clamp(pos * rowH - (r.h - 16) * 0.5, 0, maxS); listMax = maxS;
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y + 6, r.w, r.h - 12); ctx.clip(); rows = [];
      all.forEach((x, i) => { const y = r.y + 8 + i * rowH - scroll; if (y < r.y - rowH || y > r.y + r.h) return;
        if (x.head) { ctx.fillStyle = x.head.hue; ctx.font = '700 9.5px ' + MONO; ctx.fillText(fit(tx(x.head.name).toUpperCase() + '  ' + st.perGroup[x.head.i] + '/' + x.head.count, r.w - 20), r.x + 10, y + 14); ctx.fillStyle = x.head.hue; ctx.globalAlpha = 0.35; ctx.fillRect(r.x + 10, y + 18, r.w - 20, 1); ctx.globalAlpha = 1; return; }
        const it = x.it, g = m.groups[it.group], out = it.at <= T, cur = it.k === st.current && !fin, hv = it.k === hover; rows.push({ k: it.k, y, h: rowH });
        if (cur || hv) { rr(r.x + 6, y + 1, r.w - 12, rowH - 2, 4); ctx.fillStyle = g.hue + '26'; ctx.fill(); ctx.strokeStyle = g.hue; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.fillStyle = out ? g.hue : 'rgba(127,147,173,.35)'; ctx.beginPath(); ctx.arc(r.x + 16, y + rowH / 2, out ? 3 : 2, 0, 7); ctx.fill();
        ctx.fillStyle = cur || hv ? C.white : out ? '#c6d3e6' : 'rgba(127,147,173,.55)'; ctx.font = (cur || hv ? '700 ' : '') + '10.5px ' + MONO; ctx.fillText(fit(tx(it.name), r.w - 40), r.x + 26, y + rowH / 2 + 3.5); });
      ctx.restore();
    }

    function frame(now) {
      raf = 0; if (dead) return; const dt = lastNow ? Math.min(100, now - lastNow) : 0; lastNow = now;
      if (!paused && !reduce.matches) { amb += dt; if (T < m.duration) T += dt; } T = clamp(T, 0, m.duration);
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
      if (!m.available) { ctx.fillStyle = C.ink; ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.fillText(fit(tx(m.empty), W - 30), W / 2, H / 2); ctx.textAlign = 'left'; return; }
      const geo = geometry(); drawHeader(geo.st); drawGraph(geo); drawFoot(geo.st, geo.fin); drawList(geo.st, geo.fin);
      if (opts.onTime) { try { opts.onTime(T, m.duration, !paused && T < m.duration); } catch (e) { /* page handler */ } }
      if (document.hidden || reduce.matches || paused) { lastNow = 0; return; }
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };
    function hit(ev) { const b = cv.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top, o = L; let best = -1, bd = 16 * 16;
      for (const p of places) { if (!p) continue; const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = p.k; } }
      if (best < 0 && x >= o.list.x && x <= o.list.x + o.list.w && y >= o.list.y && y <= o.list.y + o.list.h) for (const r of rows) if (y >= r.y && y < r.y + r.h && m.items[r.k].at <= T) { best = r.k; break; }
      return best; }
    const onMove = (ev) => { const k = hit(ev); if (k !== hover) { hover = k; cv.style.cursor = k >= 0 ? 'pointer' : 'default'; host.setAttribute('aria-label', k >= 0 ? tx(m.items[k].name) + '. ' + tx(m.items[k].desc) : tx(m.ariaLabel)); kick(); } };
    const onLeave = () => { if (hover !== -1) { hover = -1; kick(); } };
    const onClick = (ev) => { const k = hit(ev); if (k >= 0 && opts.onOpen) opts.onOpen(m.items[k].id); };
    // when the map is complete the list can be scrolled with the wheel (the list of links under the picture is the keyboard route)
    const onWheel = (ev) => { const b = cv.getBoundingClientRect(), x = ev.clientX - b.left, y = ev.clientY - b.top, o = L; if (T < m.duration - D.END || x < o.list.x || x > o.list.x + o.list.w || y < o.list.y || y > o.list.y + o.list.h) return; const n = clamp(userScroll + ev.deltaY, 0, listMax); if (n !== userScroll) { userScroll = n; ev.preventDefault(); kick(); const at = { clientX: ev.clientX, clientY: ev.clientY }; requestAnimationFrame(() => requestAnimationFrame(() => { if (!dead) onMove(at); })); } };
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mouseleave', onLeave); cv.addEventListener('click', onClick);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs((host.clientWidth || 0) - W) > 2) { layout(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => kick(); document.addEventListener('visibilitychange', onVis);
    layout(); host.setAttribute('aria-label', tx(m.ariaLabel)); if (reduce.matches) T = m.duration; kick();
    return { play() { paused = false; if (T >= m.duration) T = 0; lastNow = 0; kick(); }, pause(on) { paused = on !== false; lastNow = 0; kick(); }, replay() { T = 0; userScroll = 0; paused = false; lastNow = 0; kick(); },
      seek(ms) { T = clamp(ms, 0, m.duration); lastNow = 0; if (raf) { cancelAnimationFrame(raf); raf = 0; } kick(); }, time: () => T, duration: () => m.duration, isPaused: () => paused,
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); cv.removeEventListener('wheel', onWheel); cv.removeEventListener('mousemove', onMove); cv.removeEventListener('mouseleave', onLeave); cv.removeEventListener('click', onClick); host.textContent = ''; host.removeAttribute('role'); host.removeAttribute('aria-label'); host.removeAttribute('tabindex'); } };
  }
  SC.viz.sitemap = { mount };
})();
