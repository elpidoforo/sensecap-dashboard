/*
  Live Board (#/live): the live weather of Cyprus as motion. Wind streams across the island in the direction and at the speed
  the Met Office stations report now, coloured by temperature; a ring spreads from a station when it sends a new reading and its
  card and the log update. Satellite heat detections and new earthquakes appear where their feeds place them.
  Every motion is driven by a live value from our own answers (/api/stack/...). Between stations the wind and temperature are
  ESTIMATED from the nearest stations and the board says so. Old readings stop taking part; a feed that does not answer is
  named as not answering. Numbers are computed in public/site/viz/live-data.js (tested).
*/
(function () {
  'use strict';
  const T = SC.t, MONO = 'ui-monospace, Menlo, Consolas, monospace';
  SC.css('/site/pages/vortex.css'); SC.css('/site/pages/wall.css'); SC.css('/site/pages/live.css');
  const LIBS = ['/site/island.js', '/site/viz/kit.js', '/site/viz/live-data.js', '/site/viz/liveflow-data.js', '/site/viz/liveflow.js'];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pair = (p) => (Array.isArray(p) ? p[SC.lang === 'el' ? 1 : 0] : String(p == null ? '' : p));
  const fresh = (url) => fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const n1 = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(1) : '–');

  function build(root) {
    const L = SC.viz.liveData, I = window.ISLAND, stops = [];
    const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const board = el('div', 'dw lv'); root.append(board);
    const panel = (cls, title) => { const s = el('section', 'wl-panel ' + cls); s.append(el('h2', 'wl-h', title)); board.append(s); return s; };

    // top strip
    const strip = el('div', 'dw-strip'); board.append(strip);
    const stat = (label) => { const s = el('span'), b = el('b', null, '–'); s.append(b, document.createTextNode(label)); strip.append(s); return b; };
    strip.append(el('span', 'dw-name', 'Kleanthis // Live Board'));
    const bFresh = stat(T('stations with a fresh reading', 'σταθμοί με φρέσκια μέτρηση')), bAge = stat(T('since the newest reading', 'από τη νεότερη μέτρηση')), bNew = stat(T('new readings this visit', 'νέες μετρήσεις σε αυτή την επίσκεψη'));
    const chip = el('span', 'lv-chip'); strip.append(chip);
    const pauseBtn = el('button', 'lv-btn', T('Pause the motion', 'Παύση κίνησης')); pauseBtn.type = 'button'; pauseBtn.setAttribute('aria-pressed', 'false'); strip.append(pauseBtn);

    // the pipeline: one run for every fetch of the live feeds
    const fp = panel('wl-wide lv-flow', T('Every fetch of the live feeds, step by step', 'Κάθε λήψη των ζωντανών πηγών, βήμα βήμα'));
    fp.append(el('p', 'wl-hint', T('Once a minute the board asks every live feed for its latest answer and plays it here: one dot per station or record, amber for readings that are new since the last fetch. A feed that does not answer is hatched.', 'Μία φορά το λεπτό ο πίνακας ζητά από κάθε ζωντανή πηγή την τελευταία της απάντηση και την παίζει εδώ: μία κουκκίδα ανά σταθμό ή εγγραφή, κεχριμπαρί για μετρήσεις που είναι νέες από την τελευταία λήψη. Μια πηγή που δεν απαντά είναι διαγραμμισμένη.')));
    const flowHost = el('div', 'lv-host'); fp.append(flowHost); let flow = null, lastRun = null;
    // player: one clock drives the whole board, so it can be paused, replayed, stepped and scrubbed
    const bar = el('div', 'lv-player'); fp.append(bar);
    const bPlay = el('button', 'lv-btn', T('Pause', 'Παύση')); bPlay.type = 'button'; const bRe = el('button', 'lv-btn', T('Replay', 'Επανάληψη')); bRe.type = 'button';
    const jump = el('select', 'lv-btn'); jump.setAttribute('aria-label', T('Jump to a step', 'Μετάβαση σε βήμα'));
    const scrub = el('input', 'lv-scrub'); scrub.type = 'range'; scrub.min = '0'; scrub.max = '1000'; scrub.value = '0'; scrub.setAttribute('aria-label', T('Position in the run', 'Θέση μέσα στη διαδρομή'));
    const tRead = el('span', 'lv-small lv-time'); bar.append(bPlay, bRe, jump, scrub, tRead);
    let dragging = false, lastSec = '';
    bPlay.onclick = () => { if (!flow) return; if (flow.isPaused() || flow.time() >= flow.duration()) flow.play(); else flow.pause(true); };
    bRe.onclick = () => { if (flow) flow.replay(); };
    jump.onchange = () => { if (!flow || jump.value === '') return; flow.pause(true); flow.seek(Number(jump.value)); jump.value = ''; };
    scrub.oninput = () => { if (!flow) return; dragging = true; flow.pause(true); flow.seek(Number(scrub.value) / 1000 * flow.duration()); };
    scrub.onchange = () => { dragging = false; };
    const onTime = (t, d, playing) => { if (!dragging) scrub.value = String(Math.round(t / d * 1000)); const sec = (t / 1000).toFixed(1) + ' / ' + (d / 1000).toFixed(1) + ' s'; if (sec !== lastSec) { lastSec = sec; tRead.textContent = sec; } const lab = playing ? T('Pause', 'Παύση') : T('Play', 'Αναπαραγωγή'); if (bPlay.textContent !== lab) bPlay.textContent = lab; };
    const fillJump = (run) => { jump.textContent = ''; const o0 = el('option', null, T('Jump to…', 'Μετάβαση…')); o0.value = ''; jump.append(o0); run.feeds.forEach((f, i) => { const o = el('option', null, String(i + 1).padStart(2, '0') + ' ' + pair(f.name)); o.value = String(i * 1800 + 1200); jump.append(o); }); const oe = el('option', null, T('Summary', 'Σύνοψη')); oe.value = String(run.feeds.length * 1800 + 1500); jump.append(oe); };
    if (reduce.matches) { bPlay.hidden = true; bRe.hidden = true; }
    const fdet = el('details', 'wl-list'); fdet.append(el('summary', null, T('The same facts as text', 'Τα ίδια στοιχεία ως κείμενο'))); const ful = el('ul'); fdet.append(ful); fp.append(fdet);

    // map
    const mp = panel('dw-6 lv-map', T('Wind and temperature now', 'Άνεμος και θερμοκρασία τώρα'));
    const host = el('div', 'lv-host'); host.setAttribute('role', 'img'); mp.append(host);
    const cv = el('canvas'); host.append(cv); const ctx = cv.getContext('2d');
    const trail = document.createElement('canvas'), tctx = trail.getContext('2d');
    const keyLine = el('p', 'lv-key'); mp.append(keyLine);
    const note = el('p', 'wl-hint', T('The streams show the wind the stations report now: direction and speed. Their colour is the temperature. Between stations both are estimated from the nearest stations, not measured.', 'Οι ροές δείχνουν τον άνεμο που αναφέρουν τώρα οι σταθμοί: κατεύθυνση και ταχύτητα. Το χρώμα είναι η θερμοκρασία. Ανάμεσα στους σταθμούς και τα δύο εκτιμώνται από τους κοντινότερους σταθμούς, δεν μετρήθηκαν.')); mp.append(note);

    const cp = panel('dw-3 lv-cards', T('Latest stations to report', 'Οι σταθμοί που ανέφεραν τελευταίοι')); const cardBox = el('div', 'lv-cardbox'); cp.append(cardBox);
    const rp = panel('dw-3 lv-side', T('Rain in the last 10 minutes', 'Βροχή στα τελευταία 10 λεπτά')); const rainBox = el('div', 'lv-rain'); rp.append(rainBox);
    rp.append(el('h2', 'wl-h lv-h2', T('From space and from the ground', 'Από το διάστημα και από το έδαφος'))); const feedBox = el('div', 'lv-feeds'); rp.append(feedBox);
    rp.append(el('h2', 'wl-h lv-h2', T('What moves and why', 'Τι κινείται και γιατί')));
    const key = el('ul', 'lv-why'); rp.append(key);
    [['#7DD3FC', T('streams: the wind now', 'ροές: ο άνεμος τώρα')], ['#FBBF24', T('colour: the temperature now', 'χρώμα: η θερμοκρασία τώρα')], ['#FBBF24', T('ring: a station just sent a reading', 'δαχτυλίδι: ένας σταθμός μόλις έστειλε μέτρηση')], ['#f87171', T('diamond: a satellite saw heat', 'ρόμβος: ένας δορυφόρος είδε θερμότητα')], ['#a78bfa', T('purple rings: a new earthquake in the list', 'μοβ δαχτυλίδια: νέος σεισμός στη λίστα')]]
      .forEach((r) => { const li = el('li'); const sw = el('i'); sw.style.background = r[0]; li.append(sw, document.createTextNode(r[1])); key.append(li); });
    const lg = panel('wl-wide lv-logp', T('Live log: each reading as it arrives', 'Ζωντανό ημερολόγιο: κάθε μέτρηση όταν φτάνει')); const log = el('ol', 'dw-log lv-log'); lg.append(log);
    const det = el('details', 'wl-list'); det.append(el('summary', null, T('The same facts as text', 'Τα ίδια στοιχεία ως κείμενο'))); const ul = el('ul'); det.append(ul); lg.append(det);
    board.append(el('p', 'wl-foot', T('Weather stations: Cyprus Department of Meteorology, a new reading about every 10 minutes. Satellite heat: NASA FIRMS. Earthquakes: USGS. A feed that does not answer is named, never filled in.', 'Μετεωρολογικοί σταθμοί: Τμήμα Μετεωρολογίας Κύπρου, νέα μέτρηση περίπου κάθε 10 λεπτά. Θερμότητα από δορυφόρο: NASA FIRMS. Σεισμοί: USGS. Μια πηγή που δεν απαντά κατονομάζεται, δεν συμπληρώνεται ποτέ.')));

    // state
    let model = L.stations(null, Date.now()), fires = null, quakes = null, newCount = 0, paused = false, dead = false, raf = 0, last = 0;
    let W = 0, H = 0, S = 1, ox = 0, oy = 0, grid = null, parts = [], scale = null; const pulses = [], flashes = [], rings = [];
    const paths = Object.values(I.districts).map((d) => new Path2D(d));
    const XY = (lat, lng) => [ox + (lng - I.bbox[0]) * I.k * I.sx * S, oy + (I.bbox[3] - lat) * I.sx * S];
    const LL = (x, y) => [I.bbox[3] - (y - oy) / (I.sx * S), I.bbox[0] + (x - ox) / (I.k * I.sx * S)];
    const col = (t) => { if (t == null || !scale) return 'rgb(125,211,252)'; const k = Math.max(0, Math.min(1, (t - scale.min) / (scale.max - scale.min))), a = [56, 189, 248], b = [251, 191, 36]; return 'rgb(' + a.map((c, i) => Math.round(c + (b[i] - c) * k)).join(',') + ')'; };

    function size() {
      const w = Math.max(280, host.clientWidth || 320), m = w < 520 ? 10 : 34; S = (w - 2 * m) / I.W; ox = m; oy = m; W = w; H = Math.round(I.H * S + 2 * m);
      const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trail.width = cv.width; trail.height = cv.height; tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(500, Math.min(2600, Math.round(W * H / 190))); parts = []; for (let i = 0; i < n; i++) parts.push(seed({}));
      regrid();
    }
    function seed(p) { p.x = Math.random() * W; p.y = Math.random() * H; p.a = Math.random() * 110 | 0; return p; }
    // the field on a coarse grid (recomputed only when the readings change), read with bilinear interpolation
    function regrid() { const gx = 36, gy = 22, g = { gx, gy, u: [], v: [], t: [], ok: false };
      for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) { const ll = LL(i * W / gx, j * H / gy), f = L.field(model, ll[0], ll[1]); g.u.push(f && f.u != null ? f.u : null); g.v.push(f && f.v != null ? f.v : null); g.t.push(f ? f.temp : null); if (f && f.u != null) g.ok = true; }
      grid = g; scale = L.tempScale(model); }
    function at(x, y) { const g = grid, fx = Math.max(0, Math.min(g.gx - 1e-6, x / W * g.gx)), fy = Math.max(0, Math.min(g.gy - 1e-6, y / H * g.gy)), i = fx | 0, j = fy | 0, a = fx - i, b = fy - j, k = j * (g.gx + 1) + i, k2 = k + g.gx + 1;
      const mixv = (q) => (q[k] == null ? null : (q[k] * (1 - a) + q[k + 1] * a) * (1 - b) + (q[k2] * (1 - a) + q[k2 + 1] * a) * b); return [mixv(g.u), mixv(g.v), mixv(g.t)]; }

    function draw(now) {
      const moving = !paused && !reduce.matches && grid && grid.ok, dt = Math.min(3, last ? (now - last) / 16.7 : 1); last = now;
      if (moving) { tctx.globalCompositeOperation = 'destination-out'; tctx.fillStyle = 'rgba(0,0,0,' + (0.06 * dt) + ')'; tctx.fillRect(0, 0, W, H); tctx.globalCompositeOperation = 'lighter'; tctx.lineWidth = 1; tctx.globalAlpha = 0.6;
        const kpx = 0.42 * Math.max(0.6, S * 1.5) * dt;
        for (const p of parts) { const f = at(p.x, p.y); if (f[0] == null) { seed(p); continue; } const nx = p.x + f[0] * kpx, ny = p.y - f[1] * kpx; tctx.strokeStyle = col(f[2]); tctx.beginPath(); tctx.moveTo(p.x, p.y); tctx.lineTo(nx, ny); tctx.stroke(); p.x = nx; p.y = ny; if (++p.a > 130 || nx < 0 || nx > W || ny < 0 || ny > H) { seed(p); p.a = 0; } }
        tctx.globalAlpha = 1; }
      ctx.clearRect(0, 0, W, H);
      ctx.save(); ctx.translate(ox, oy); ctx.scale(S, S); ctx.fillStyle = 'rgba(20,36,60,.6)'; ctx.strokeStyle = 'rgba(125,211,252,.3)'; ctx.lineWidth = 1 / S; for (const p of paths) { ctx.fill(p); ctx.stroke(p); } ctx.restore();
      if (grid && grid.ok && (reduce.matches)) arrows(); else if (grid && grid.ok) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(trail, 0, 0); ctx.restore(); }
      // satellite heat detections: all current ones, new ones flash
      if (fires && fires.available) for (const f of fires.list) { const p = XY(f.lat, f.lng); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.PI / 4); ctx.fillStyle = 'rgba(248,113,113,.85)'; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.restore(); }
      for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i], a = (now - f.t) / 2600; if (a >= 1) { flashes.splice(i, 1); continue; } const p = XY(f.lat, f.lng); ctx.strokeStyle = 'rgba(248,113,113,' + (1 - a) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 8 + a * 34, 0, 7); ctx.stroke(); }
      for (let i = rings.length - 1; i >= 0; i--) { const q = rings[i], a = (now - q.t) / 3200; if (a >= 1) { rings.splice(i, 1); continue; } const p = XY(q.lat, q.lng); for (let k = 0; k < 3; k++) { const r = a * 80 - k * 15; if (r > 0) { ctx.strokeStyle = 'rgba(167,139,250,' + (1 - a) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.stroke(); } } }
      // stations
      const small = W < 520; ctx.font = (small ? 9 : 10) + 'px ' + MONO; ctx.textBaseline = 'alphabetic';
      for (const s of model.list) { const p = XY(s.lat, s.lng);
        ctx.fillStyle = s.stale ? 'rgba(160,175,195,.6)' : '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], small ? 2 : 3, 0, 7); ctx.fill();
        if (!s.stale && s.u != null) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + s.u * 3, p[1] - s.v * 3); ctx.stroke(); }
        if (!small || model.list.length <= 12) { ctx.fillStyle = s.stale ? 'rgba(160,175,195,.7)' : 'rgba(234,240,247,.9)'; ctx.fillText(s.name + (s.temp != null && !s.stale ? ' ' + n1(s.temp) + '°' : ''), p[0] + 6, p[1] - 5); } }
      for (let i = pulses.length - 1; i >= 0; i--) { const u = pulses[i], a = reduce.matches ? 0.5 : (now - u.t) / 1500; if (a >= 1) { pulses.splice(i, 1); continue; } const p = XY(u.lat, u.lng); ctx.strokeStyle = 'rgba(251,191,36,' + (1 - a) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], 6 + a * 46, 0, 7); ctx.stroke(); if (reduce.matches && now - u.t > 4000) pulses.splice(i, 1); }
      if (!model.available || !model.total) msg(pair(model.reason || [T('No station has a place on the map.', 'Κανένας σταθμός δεν έχει θέση στον χάρτη.')]));
      else if (!grid.ok) msg(T('Only old readings right now, so no wind is drawn.', 'Μόνο παλιές μετρήσεις αυτή τη στιγμή, οπότε δεν σχεδιάζεται άνεμος.'));
    }
    function msg(text) { ctx.font = '13px ' + MONO; ctx.textAlign = 'center'; ctx.fillStyle = '#EAF0F7'; const words = text.split(' '); let ln = '', y = H / 2 - 8; for (const w of words) { if (ctx.measureText(ln + ' ' + w).width > W - 60 && ln) { ctx.fillText(ln, W / 2, y); y += 18; ln = w; } else ln = ln ? ln + ' ' + w : w; } ctx.fillText(ln, W / 2, y); ctx.textAlign = 'left'; }
    function arrows() { const step = Math.max(34, W / 18); ctx.lineWidth = 1.5; for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) { const f = at(x, y); if (f[0] == null) continue; const m = Math.hypot(f[0], f[1]); if (m < 0.05) continue; const len = Math.min(step * 0.8, 4 + m * 2.4), ang = Math.atan2(-f[1], f[0]); ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = col(f[2]); ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.lineTo(len / 2 - 4, -3); ctx.moveTo(len / 2, 0); ctx.lineTo(len / 2 - 4, 3); ctx.stroke(); ctx.restore(); } }
    function frame(now) { raf = 0; if (dead) return; draw(now); tick(); if (!document.hidden) raf = requestAnimationFrame(frame); }
    const kick = () => { if (!raf && !dead) raf = requestAnimationFrame(frame); };

    // DOM side
    let lastTick = '';
    function tick() { const age = model.newestMs ? Math.max(0, Math.floor((Date.now() - model.newestMs) / 1000)) : null; const t = age == null ? '–' : (age >= 3600 ? Math.floor(age / 3600) + ' h ' : '') + String(Math.floor(age % 3600 / 60)).padStart(2, '0') + ':' + String(age % 60).padStart(2, '0'); if (t !== lastTick) { lastTick = t; bAge.textContent = t; } }
    function cards() {
      const pick = model.list.slice().sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0)).slice(0, 4); cardBox.textContent = '';
      if (!pick.length) { cardBox.append(el('p', 'wl-empty', pair(model.reason || ['No stations in the answer.', 'Κανένας σταθμός στην απάντηση.']))); return; }
      pick.forEach((s) => { const c = el('div', 'lv-card' + (s.stale ? ' old' : '')); c.dataset.id = s.id; const c1 = el('div');
        c1.append(el('strong', null, s.name)); const big = el('span', 'lv-big', s.temp == null ? '–' : n1(s.temp) + '°'); big.style.color = s.stale ? '#8ea3bf' : col(s.temp); c1.append(big);
        c1.append(el('span', 'lv-small', (s.humidity == null ? '' : T('humidity', 'υγρασία') + ' ' + Math.round(s.humidity) + '%  ') + (s.rain10 == null ? '' : T('rain', 'βροχή') + ' ' + n1(s.rain10) + ' mm')));
        const cw = L.compass(s.windFrom); c1.append(el('span', 'lv-small', s.wind == null ? T('no wind value', 'χωρίς τιμή ανέμου') : T('wind', 'άνεμος') + ' ' + n1(s.wind) + ' m/s' + (cw ? ' ' + T('from the', 'από') + ' ' + pair(cw) : '')));
        c1.append(el('span', 'lv-small lv-age', pair(s.age) + (s.stale ? ' · ' + T('old reading', 'παλιά μέτρηση') : '')));
        const dial = el('div', 'lv-dial'); if (s.u != null && !s.stale) { const ar = el('i'); ar.style.transform = 'rotate(' + (Math.atan2(-s.v, s.u) * 180 / Math.PI) + 'deg)'; dial.append(ar); } dial.setAttribute('aria-hidden', 'true');
        c.append(c1, dial); cardBox.append(c); });
    }
    function flashCard(id) { const c = cardBox.querySelector('.lv-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]'); if (c && !reduce.matches) { c.classList.remove('hot'); void c.offsetWidth; c.classList.add('hot'); } }
    function rain() { const r = L.raining(model); rainBox.textContent = '';
      if (!model.available) { rainBox.append(el('p', 'wl-empty', pair(model.reason))); return; }
      if (!r.length) { rainBox.append(el('p', 'lv-small', T('No station with a fresh reading reports rain in the last 10 minutes.', 'Κανένας σταθμός με φρέσκια μέτρηση δεν αναφέρει βροχή στα τελευταία 10 λεπτά.'))); return; }
      const max = Math.max(2, Math.ceil(r.reduce((m, s) => Math.max(m, s.rain10), 0)));
      r.slice(0, 10).forEach((s) => { const row = el('div', 'lv-rrow'); const bar = el('span', 'lv-bar' + (reduce.matches || paused ? '' : ' wet')); const fill = el('i'); fill.style.width = Math.min(100, s.rain10 / max * 100) + '%'; bar.append(fill); row.append(el('span', null, s.name), bar, el('b', null, n1(s.rain10))); rainBox.append(row); });
      rainBox.append(el('p', 'lv-small', T('mm in 10 minutes; a full bar is ', 'mm σε 10 λεπτά· η γεμάτη ράβδος είναι ') + max + ' mm' + (r.length > 10 ? ' · ' + T('and', 'και') + ' ' + (r.length - 10) + ' ' + T('more stations', 'ακόμη σταθμοί') : '')));
    }
    function feeds() { feedBox.textContent = '';
      const line = (name, p, what) => { const t = !p ? T('loading', 'φορτώνει') : !p.available ? T('not answering', 'δεν απαντά') + (p.reason ? ': ' + pair(p.reason) : '') : p.list.length + ' ' + what + (p.demo ? ' (' + T('test values', 'δοκιμαστικές τιμές') + ')' : ''); const d = el('p', 'lv-small'); d.append(el('b', null, name + ': '), document.createTextNode(t)); feedBox.append(d); };
      line(T('Satellite heat detections, last 24 hours', 'Ανιχνεύσεις θερμότητας από δορυφόρο, τελευταίες 24 ώρες'), fires, T('in the answer', 'στην απάντηση'));
      line(T('Earthquake list', 'Λίστα σεισμών'), quakes, T('events since 2015; a new one rings on the map', 'γεγονότα από το 2015· ένα νέο φαίνεται με δαχτυλίδια στον χάρτη'));
    }
    function say(text, cls) { const li = el('li', cls || ''); li.dataset.n = new Date().toLocaleTimeString(SC.lang === 'el' ? 'el-GR' : 'en-GB', { hour: '2-digit', minute: '2-digit' }); for (const x of log.children) x.classList.remove('on'); li.classList.add('on'); log.append(li); while (log.children.length > 40) log.firstChild.remove(); log.scrollTop = log.scrollHeight;
      if (reduce.matches || paused) { li.textContent = text; return; } let n = 0; const per = Math.max(1, Math.ceil(text.length / 20)); const t = setInterval(() => { n = Math.min(text.length, n + per); li.textContent = text.slice(0, n); if (n >= text.length || !li.isConnected) clearInterval(t); }, 30); }
    function refreshText() {
      bFresh.textContent = model.available ? model.fresh + '/' + model.total : '–'; bNew.textContent = String(newCount);
      chip.textContent = model.demo ? T('TEST VALUES, not real readings', 'ΔΟΚΙΜΑΣΤΙΚΕΣ ΤΙΜΕΣ, όχι πραγματικές μετρήσεις') : !model.available ? T('STATIONS NOT ANSWERING', 'ΟΙ ΣΤΑΘΜΟΙ ΔΕΝ ΑΠΑΝΤΟΥΝ') : model.fresh ? T('LIVE', 'ΖΩΝΤΑΝΑ') : T('OLD READINGS', 'ΠΑΛΙΕΣ ΜΕΤΡΗΣΕΙΣ');
      chip.className = 'lv-chip ' + (model.demo ? 'warn' : model.available && model.fresh ? 'live' : 'warn');
      keyLine.textContent = scale ? T('Colour: ', 'Χρώμα: ') + scale.min + ' °C ' + T('(blue) to', '(μπλε) ως') + ' ' + scale.max + ' °C ' + T('(amber). White lines at the dots: each station’s own wind.', '(κεχριμπαρί). Λευκές γραμμές στις τελείες: ο άνεμος κάθε σταθμού.') : '';
      const rows = L.textRows(model); ul.textContent = ''; rows.slice(0, 300).forEach((r) => ul.append(el('li', null, pair(r))));
      host.setAttribute('aria-label', pair(rows[model.demo ? 1 : 0]) + ' ' + T('A map of Cyprus with wind streams estimated from the stations.', 'Χάρτης της Κύπρου με ροές ανέμου που εκτιμώνται από τους σταθμούς.'));
      cards(); rain(); feeds();
    }

    // loading and polling
    function takeStations(a, first) { const next = L.stations(a, Date.now()), changed = first ? [] : L.diff(model, next); model = next; regrid(); refreshText();
      if (first) { if (model.available) say(model.fresh + ' ' + T('of', 'από') + ' ' + model.total + ' ' + T('stations have a fresh reading. Waiting for the next ones.', 'σταθμούς έχουν φρέσκια μέτρηση. Αναμονή για τις επόμενες.')); else say(pair(model.reason), 'warn'); }
      changed.forEach((s, i) => setTimeout(() => { if (dead) return; newCount++; bNew.textContent = String(newCount); pulses.push({ lat: s.lat, lng: s.lng, t: performance.now() }); flashCard(s.id); say(pair(s.line)); kick(); }, Math.min(i, 12) * 350)); kick(); }
    function takePoints(kind, a, first) { const next = L.points(a, kind), prev = kind === 'fire' ? fires : quakes, add = first ? [] : L.fresh(prev, next); if (kind === 'fire') fires = next; else quakes = next; feeds();
      add.slice(0, 6).forEach((p) => { if (kind === 'fire') { flashes.push({ lat: p.lat, lng: p.lng, t: performance.now() }); say(T('Satellite: heat detected near ', 'Δορυφόρος: θερμότητα κοντά στο ') + p.lat.toFixed(2) + '°, ' + p.lng.toFixed(2) + '°. ' + T('A detection is not a confirmed fire.', 'Η ανίχνευση δεν είναι επιβεβαιωμένη φωτιά.')); } else { rings.push({ lat: p.lat, lng: p.lng, t: performance.now() }); say(T('Earthquake list: new event', 'Λίστα σεισμών: νέο γεγονός') + (p.magnitude != null ? ', M ' + n1(p.magnitude) : '') + (p.place ? ', ' + p.place : '')); } }); kick(); }
    let firstSt = true, firstF = true, firstQ = true; const EVERY = 60000;
    function cycle() {
      Promise.all(['met-stations', 'airports', 'air-stations', 'fire-hotspots', 'earthquakes'].map((id) => fresh('/api/stack/' + id))).then((a) => {
        if (dead) return;
        takeStations(a[0], firstSt); firstSt = false; takePoints('fire', a[3], firstF); firstF = false; takePoints('quake', a[4], firstQ); firstQ = false;
        const run = SC.viz.liveflowData.build({ met: a[0], airports: a[1], air: a[2], fires: a[3], quakes: a[4] }, lastRun, Date.now()); lastRun = run;
        ful.textContent = ''; run.textRows.forEach((r) => ful.append(el('li', null, pair(r))));
        try { const keep = flow && flow.isPaused() && !paused; if (!flow) flow = SC.viz.liveflow.mount(flowHost, run, { onTime }); else if (!keep) flow.run(run); fillJump(run); flow.setNext(Date.now() + EVERY); if (paused) flow.pause(true); } catch (e) { flowHost.textContent = T('This picture could not be drawn. The facts are in the text list below.', 'Η εικόνα δεν μπόρεσε να σχεδιαστεί. Τα στοιχεία είναι στη λίστα παρακάτω.'); }
      });
    }
    size(); refreshText(); kick(); cycle();
    const t1 = setInterval(() => { if (!document.hidden) cycle(); }, EVERY), t2 = 0, t3 = setInterval(() => { if (document.hidden) return; const m2 = L.stations({ available: model.available, refreshSeconds: model.refreshSeconds, demo: model.demo, attribution: model.source, reason: model.reason, features: model.list.map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, time: s.time, temp: s.temp, humidity: s.humidity, wind: s.wind, windFrom: s.windFrom, rain10min: s.rain10 })) }, Date.now()); if (m2.fresh !== model.fresh) { model = m2; regrid(); refreshText(); kick(); } }, 30000);
    pauseBtn.onclick = () => { paused = !paused; pauseBtn.textContent = paused ? T('Play the motion', 'Αναπαραγωγή κίνησης') : T('Pause the motion', 'Παύση κίνησης'); pauseBtn.setAttribute('aria-pressed', String(paused)); rain(); if (flow) flow.pause(paused); kick(); };
    if (reduce.matches) pauseBtn.hidden = true;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - W) > 2) { size(); kick(); } }) : null; if (ro) ro.observe(host);
    const onVis = () => { last = 0; kick(); }; document.addEventListener('visibilitychange', onVis);
    stops.push(() => { dead = true; if (flow) flow.destroy(); cancelAnimationFrame(raf); clearInterval(t1); clearInterval(t2); clearInterval(t3); if (ro) ro.disconnect(); document.removeEventListener('visibilitychange', onVis); });
    return () => stops.forEach((f) => { try { f(); } catch (e) { /* already gone */ } });
  }

  SC.register('live', {
    title: ['Live Board', 'Live Board'],
    render(root) {
      root.append(SC.head({ title: T('Live Board', 'Live Board'), lede: T('The weather over Cyprus right now, as motion: wind streams, temperature, rain, and what satellites and the earthquake feed report.', 'Ο καιρός πάνω από την Κύπρο αυτή τη στιγμή, ως κίνηση: ροές ανέμου, θερμοκρασία, βροχή, και ό,τι αναφέρουν οι δορυφόροι και η λίστα σεισμών.') }));
      const host = document.createElement('div'); root.append(host);
      let stop = null, gone = false;
      const load = (list) => list.reduce((p, s) => p.then(() => new Promise((ok, no) => { if (document.querySelector('script[data-wl="' + s + '"]') || (s === '/site/island.js' && window.ISLAND)) return ok(); const e = document.createElement('script'); e.src = s; e.dataset.wl = s; e.onload = ok; e.onerror = () => no(new Error(s)); document.head.append(e); })), Promise.resolve());
      load(LIBS).then(() => { if (!gone) stop = build(host); }).catch(() => { host.textContent = T('The Live Board could not start. Reload the page to try again.', 'Το Live Board δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
