/*
  Met Office record. What the Cyprus Department of Meteorology publishes, shown as published:
  warnings (with earlier versions), the five-day forecast, radar, sea and aviation texts, the NET list and the stations
  with a trend each and a station detail with a history chart. Route: #/weather and #/weather/<STATION>.
  Data: /api/dom/page, /api/dom/pages/history, /api/dom/img, /api/dom/net, /api/cydom, /api/cydom/history(.csv|/info),
  and /api/forecast (a model forecast; the Department itself publishes its forecast only as pictures, tables A, B and C).
  If /api/forecast is not there, the pictures are shown instead of the day cards.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/weather.css');

  const HOUR = 3600000, TZ = 'Asia/Nicosia';
  const isOld = (ms) => !ms || Date.now() - ms > 3 * HOUR;
  const compass = (d) => (d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((d % 360) + 360) % 360) / 45) % 8]);
  const nice = (s) => String(s).replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  // The Met Office pages carry their logo and a quality badge; they are not worth showing again.
  const useful = (list) => (list || []).filter((u) => !/meteo_new|ISO_9001|logo|banner|spacer/i.test(u));
  const imgUrl = (name) => '/api/dom/img?name=' + encodeURIComponent(name);
  const imgByAddress = (u) => '/api/dom/img?u=' + encodeURIComponent(u);
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const when = (ms) => (ms && isFinite(ms) ? SC.dateTime(ms) : T('unknown time', 'άγνωστη ώρα'));
  const hhmm = (ms) => (ms && isFinite(ms) ? SC.time(ms) : '–');
  const fmtDur = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 90) return m + ' min';
    const hh = Math.floor(m / 60), mm = m % 60;
    return hh + ' h' + (mm ? ' ' + mm + ' min' : '');
  };
  const lt = (t) => {   // local Cyprus date and time of an instant
    const o = {};
    LT.formatToParts(t).forEach((x) => { o[x.type] = x.value; });
    return { h: +o.hour % 24, m: +o.minute, key: o.year + '-' + o.month + '-' + o.day };
  };
  const LT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  // replaceChildren() would print an array or null as text, so flatten and skip empty values first.
  const fill = (el, ...kids) => { el.replaceChildren(...kids.flat(Infinity).filter((x) => x != null && x !== false)); return el; };

  function errBox(whatEn, whatEl, e, retry) {
    return h('div', { class: 'err', role: 'alert' },
      T('Could not load ' + whatEn + '. ', 'Δεν ήταν δυνατή η φόρτωση ' + whatEl + '. '), e && e.message ? h('span', { class: 'wx-errmsg' }, e.message + ' ') : null,
      h('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά')));
  }
  function pic(src, alt) {
    const wrap = h('div', { class: 'wx-picwrap' });
    const img = h('img', { class: 'wx-pic', src, alt, loading: 'lazy' });
    img.addEventListener('error', () => fill(wrap, h('p', { class: 'wx-miss', role: 'status' }, T('This picture is not available from the Met Office right now.', 'Αυτή η εικόνα δεν είναι διαθέσιμη αυτή τη στιγμή από την Μετεωρολογική Υπηρεσία.'))));
    wrap.append(img);
    return wrap;
  }
  function sourceLine(page) {
    return h('p', { class: 'wx-hint' }, T('Read from ', 'Διαβάστηκε από '),
      page.url ? h('a', { class: 'wx-lnk', href: page.url, target: '_blank', rel: 'noopener' }, T('the Met Office page', 'τη σελίδα της Υπηρεσίας')) : T('the Met Office page', 'τη σελίδα της Υπηρεσίας'),
      ' ' + SC.ago(Date.parse(page.fetched)) + T(', text as published.', ', κείμενο όπως δημοσιεύεται.'));
  }
  // chips: [[id, label]]; returns { el, set }
  function chipRow(items, current, onPick, label, cls) {
    const row = h('div', { class: 'wx-chips' + (cls ? ' ' + cls : ''), role: 'group', 'aria-label': label });
    const btns = new Map();
    const set = (id) => btns.forEach((b, k) => { b.classList.toggle('on', k === id); b.setAttribute('aria-pressed', String(k === id)); });
    items.forEach(([id, text]) => {
      const b = h('button', { class: 'wx-chip', type: 'button', 'aria-pressed': 'false', onclick: () => { set(id); onPick(id); } }, text);
      btns.set(id, b); row.append(b);
    });
    set(current);
    return { el: row, set };
  }
  // draws into box by calling run() (async, returns nodes). Shows loading and error states; refresh keeps old content on failure.
  function loader(box, whatEn, whatEl, run) {
    let first = true;
    const go = async (silent) => {
      if (!silent || first) fill(box, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      try { const nodes = await run(); fill(box, nodes); first = false; }
      catch (e) { if (first || !silent) { fill(box, errBox(whatEn, whatEl, e, () => go(false))); first = false; } }
    };
    go(false);
    return go;
  }

  /* ---------- which district a station is in: point in polygon on the real district outlines ---------- */
  const DNAME = { nicosia: ['Lefkosia district', 'Επαρχία Λευκωσίας'], larnaca: ['Larnaka district', 'Επαρχία Λάρνακας'], limassol: ['Limassol district', 'Επαρχία Λεμεσού'],
    paphos: ['Paphos district', 'Επαρχία Πάφου'], famagusta: ['Famagusta district', 'Επαρχία Αμμοχώστου'], kyrenia: ['Kyrenia district', 'Επαρχία Κερύνειας'] };
  let polyCache = null;
  function polys() {
    if (polyCache) return polyCache;
    polyCache = [];
    if (typeof ISLAND === 'undefined') return polyCache;
    Object.keys(ISLAND.districts).forEach((name) => ISLAND.districts[name].split('Z').forEach((s) => {
      if (!s) return;
      const pts = s.replace(/^M/, '').split('L').map((p) => p.split(' ').map(Number)).filter((p) => p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
      if (pts.length > 2) polyCache.push({ name, pts });
    }));
    return polyCache;
  }
  function inPoly(x, y, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y) && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  }
  const distCache = new Map();
  function districtOf(p) {
    if (!p || p.lat == null || p.lng == null || typeof ISLAND === 'undefined') return '';
    if (distCache.has(p.id)) return distCache.get(p.id);
    const q = ISLAND.project(p.lng, p.lat);
    let best = null, bd = Infinity;
    for (const poly of polys()) if (inPoly(q[0], q[1], poly.pts)) { best = poly.name; break; }
    if (!best) {   // on the coast the point can fall just outside the outline: take the nearest outline point
      for (const poly of polys()) for (const pt of poly.pts) { const d = (pt[0] - q[0]) * (pt[0] - q[0]) + (pt[1] - q[1]) * (pt[1] - q[1]); if (d < bd) { bd = d; best = poly.name; } }
      if (Math.sqrt(bd) > 40) best = null;   // far from any land: no district is claimed
    }
    const out = best && DNAME[best] ? T(DNAME[best][0], DNAME[best][1]) : '';
    distCache.set(p.id, out);
    return out;
  }

  /* ---------- forecast day cards: icons drawn from the weather code ---------- */
  const WMO = (c) => {
    if (c === 0) return ['sun', 'Sunny', 'Ηλιοφάνεια'];
    if (c === 1) return ['sun', 'Mostly sunny', 'Κυρίως ηλιοφάνεια'];
    if (c === 2) return ['part', 'Sunny spells, some cloud', 'Ηλιοφάνεια με λίγη νέφωση'];
    if (c === 3) return ['cloud', 'Cloudy', 'Συννεφιά'];
    if (c === 45 || c === 48) return ['cloud', 'Fog', 'Ομίχλη'];
    if (c >= 51 && c <= 57) return ['rain', 'Light drizzle', 'Ελαφριά ψιχάλα'];
    if (c >= 61 && c <= 67) return ['rain', 'Rain', 'Βροχή'];
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['snow', 'Snow', 'Χιόνι'];
    if (c >= 80 && c <= 82) return ['rain', 'Showers', 'Μπόρες'];
    if (c >= 95) return ['storm', 'Thunderstorms', 'Καταιγίδες'];
    return ['cloud', 'Cloudy', 'Συννεφιά'];
  };
  let icN = 0;
  function wxIcon(kind) {
    const n = ++icN;
    const grad = (id, y2, a, b) => sv('linearGradient', { id: id + n, x1: 0, y1: 0, x2: y2 ? 0 : 1, y2: 1 }, sv('stop', { offset: 0, 'stop-color': a }), sv('stop', { offset: 1, 'stop-color': b }));
    const s = sv('svg', { class: 'wx-fc-ic', viewBox: '0 0 64 64', 'aria-hidden': 'true' }, sv('defs', null, grad('s', 0, '#F7C46B', '#E8963F'), grad('c', 1, '#F4F8FC', '#B9C8DA'), grad('d', 1, '#C6D3E3', '#7F97B5')));
    const sun = (cx, cy, r, ray) => {
      const g = sv('g', { stroke: '#F7C46B', 'stroke-width': 3, 'stroke-linecap': 'round' });
      [0, 45, 90, 135, 180, 225, 270, 315].forEach((a) => g.append(sv('path', { d: 'M' + cx + ' ' + (cy - r - 5) + 'v' + ray, transform: 'rotate(' + a + ' ' + cx + ' ' + cy + ')' })));
      s.append(g, sv('circle', { cx, cy, r, fill: 'url(#s' + n + ')' }));
    };
    const cloud = (dx, dy, sc, f) => s.append(sv('path', { transform: 'translate(' + dx + ' ' + dy + ') scale(' + sc + ')', d: 'M18 46a10 10 0 0 1 1.5-19.9A14.5 14.5 0 0 1 47.6 28.6 9 9 0 0 1 47 46z', fill: 'url(#' + f + n + ')' }));
    if (kind === 'sun') sun(32, 32, 12, 6);
    else if (kind === 'part') { sun(24, 24, 9.5, 5); cloud(8, 5, 0.9, 'c'); }
    else if (kind === 'cloud') cloud(0, 2, 1, 'c');
    else if (kind === 'rain') { cloud(0, -7, 1, 'd'); s.append(sv('path', { d: 'M23 44l-3 8M33 44l-3 8M43 44l-3 8', stroke: '#4CCBEA', 'stroke-width': 3.2, 'stroke-linecap': 'round', fill: 'none' })); }
    else if (kind === 'storm') { cloud(0, -7, 1, 'd'); s.append(sv('path', { d: 'M34 40l-7 10h6l-3 9 10-12h-6l3-7z', fill: '#F7C46B' })); }
    else if (kind === 'snow') { cloud(0, -7, 1, 'd'); [[22, 49], [32, 52], [42, 49]].forEach(([x, y]) => s.append(sv('circle', { cx: x, cy: y, r: 2.4, fill: '#EAF0F7' }))); }
    return s;
  }
  const windArrow = (deg) => sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', style: 'transform:rotate(' + (((deg || 0) + 180) % 360) + 'deg)' }, sv('path', { d: 'M12 20V5M6 11l6-6 6 6' }));

  /* ---------- the station history chart: gradient area, open gaps, round local times, readout bubble ---------- */
  const lpf = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
  const lparts = (t) => { const o = {}; lpf.formatToParts(t).forEach((x) => { o[x.type] = x.value; }); return { h: +o.hour % 24, m: +o.minute, day: +o.day, mon: o.month }; };
  const pad2 = (n) => String(n).padStart(2, '0');
  const hmS = (t) => { const p = lparts(t); return pad2(p.h) + ':' + pad2(p.m); };
  const dmS = (t) => { const p = lparts(t); return p.day + ' ' + p.mon; };
  const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  let gid = 0;
  function wxChart(box, o) {
    const W = o.w || 470, H = o.h || 236, m = { l: 40, r: 14, t: 34, b: 26 };
    const id = 'wxg' + (++gid), ink = '#8CA0B8', bg = '#16243b';
    box.replaceChildren();
    const pts = o.pts;
    let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
    if (o.zero) lo = 0;
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const step = niceStep((hi - lo) / (o.ticks || 6));
    const y0 = Math.floor(lo / step + 1e-9) * step, y1 = Math.ceil(hi / step - 1e-9) * step;
    const axisDec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    const t0 = o.t0, t1 = o.t1;
    const X = (t) => m.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const s = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', tabindex: '0', 'aria-label': o.aria });
    s.style.display = 'block'; s.style.touchAction = 'pan-y';
    const lg = sv('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: 0, 'stop-color': o.color, 'stop-opacity': 0.3 }), sv('stop', { offset: 1, 'stop-color': o.color, 'stop-opacity': 0 }));
    s.append(sv('defs', null, lg));
    const n = Math.round((y1 - y0) / step);
    for (let i = 0; i <= n; i++) {
      const v = y0 + i * step, y = Y(v);
      s.append(sv('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, stroke: 'rgba(255,255,255,.08)' }), sv('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: ink }, SC.num(v, axisDec)));
    }
    if (o.unit) s.append(sv('text', { x: m.l - 8, y: m.t - 12, 'text-anchor': 'end', 'font-size': 10.5, 'font-weight': 600, fill: ink }, o.unit));
    // day lines at local midnight, with the date
    for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += HOUR) {
      const p = lparts(t);
      if (p.h !== 0 || p.m !== 0) continue;
      const x = X(t);
      if (x < m.l + 2 || x > W - m.r - 2) continue;
      s.append(sv('line', { x1: x, x2: x, y1: m.t - 4, y2: H - m.b, stroke: 'rgba(255,255,255,.2)', 'stroke-dasharray': '2 4' }), sv('text', { x: x + 5, y: m.t - 9, 'font-size': 10.5, 'font-weight': 600, fill: ink }, dmS(t)));
    }
    // time labels on whole local hours (or on midnights for long periods)
    const long = t1 - t0 > 36 * HOUR, cand = [];
    for (let t = Math.ceil(t0 / 1800000) * 1800000; t <= t1; t += 1800000) { const p = lparts(t); if (p.m === 0 && (!long || p.h === 0)) cand.push({ t, h: p.h }); }
    const steps = long ? [1, 2, 3, 5, 7, 10, 14] : [1, 2, 3, 4, 6, 12], maxL = W < 520 ? 6 : 9;
    const pick = (k) => cand.filter((c, i) => (long ? i % k === 0 : c.h % k === 0));
    const k = steps.find((q) => pick(q).length <= maxL) || steps[steps.length - 1];
    pick(k).forEach((c) => {
      const x = X(c.t);
      if (x < m.l + 14 || x > W - m.r - 14) return;
      s.append(sv('line', { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 4, stroke: 'rgba(255,255,255,.22)' }), sv('text', { x, y: H - 6, 'text-anchor': 'middle', 'font-size': 11, fill: ink }, long ? dmS(c.t) : hmS(c.t)));
    });
    // gaps: an amber band where more than an hour of readings is missing
    const gaps = [];
    for (let i = 1; i < pts.length; i++) if (pts[i].t - pts[i - 1].t > (o.gapMs || HOUR)) gaps.push({ a: pts[i - 1].t, b: pts[i].t, label: pts[i].t - pts[i - 1].t >= 90 * 60000 ? T('No readings', 'Χωρίς μετρήσεις') : '' });
    gaps.forEach((g) => {
      const xa = X(g.a), xb = X(g.b);
      s.append(sv('rect', { x: xa, y: m.t - 4, width: Math.max(1, xb - xa), height: H - m.b - m.t + 4, fill: 'rgba(240,185,74,.08)' }),
        sv('line', { x1: xa, x2: xa, y1: m.t - 4, y2: H - m.b, stroke: 'rgba(242,207,134,.55)', 'stroke-dasharray': '3 3' }),
        sv('line', { x1: xb, x2: xb, y1: m.t - 4, y2: H - m.b, stroke: 'rgba(242,207,134,.55)', 'stroke-dasharray': '3 3' }));
      if (g.label && xb - xa > 40) s.append(sv('text', { x: (xa + xb) / 2, y: m.t + 9, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 600, fill: '#F2CF86', stroke: bg, 'stroke-width': 3, 'paint-order': 'stroke' }, g.label));
    });
    if (o.bars) {
      const bw = Math.max(1.6, ((W - m.l - m.r) / Math.max(1, (t1 - t0) / (10 * 60000))) * 0.72);
      pts.forEach((p) => { if (p.v > 0) s.append(sv('rect', { x: X(p.t) - bw / 2, y: Y(p.v), width: bw, height: Math.max(1, Y(y0) - Y(p.v)), rx: 1, fill: o.color })); });
    } else {
      const segs = []; let cur = [];
      pts.forEach((p, i) => { if (i && p.t - pts[i - 1].t > (o.gapMs || HOUR)) { segs.push(cur); cur = []; } cur.push(p); });
      if (cur.length) segs.push(cur);
      segs.forEach((sg) => {
        if (sg.length < 2) { s.append(sv('circle', { cx: X(sg[0].t), cy: Y(sg[0].v), r: 2, fill: o.color })); return; }
        const d = sg.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
        s.append(sv('path', { d: d + 'L' + X(sg[sg.length - 1].t).toFixed(1) + ' ' + Y(y0).toFixed(1) + 'L' + X(sg[0].t).toFixed(1) + ' ' + Y(y0).toFixed(1) + 'Z', fill: 'url(#' + id + ')', stroke: 'none' }),
          sv('path', { d, fill: 'none', stroke: o.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      });
    }
    const guide = sv('line', { y1: m.t - 4, y2: H - m.b, stroke: 'rgba(255,255,255,.55)', 'stroke-dasharray': '3 3' });
    const dot = sv('circle', { r: 4.5, fill: o.color, stroke: '#0C1626', 'stroke-width': 2 });
    s.append(guide, dot);
    const tip = h('div', { class: 'wx-tip' });
    const readout = h('div', { class: 'wx-readout', 'aria-live': 'polite' });
    box.append(s, tip, readout);
    let idx = pts.length - 1;
    const show = (i) => {
      idx = Math.max(0, Math.min(pts.length - 1, i));
      const p = pts[idx], x = X(p.t), y = Y(p.v);
      guide.setAttribute('x1', x); guide.setAttribute('x2', x);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      const txt = SC.num(p.v, o.dec) + ' ' + (o.unit || '');
      fill(tip, h('b', null, txt), h('span', null, dmS(p.t) + ' ' + hmS(p.t)));
      tip.style.display = 'block';
      const rc = s.getBoundingClientRect(), kk = rc.width / W || 1, tw = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(x * kk, tw / 2 + 2), Math.max(tw / 2 + 2, rc.width - tw / 2 - 2)) + 'px';
      if (y * kk < 64) { tip.style.top = (y * kk + 14) + 'px'; tip.style.transform = 'translate(-50%, 0)'; }
      else { tip.style.top = (y * kk - 12) + 'px'; tip.style.transform = 'translate(-50%, -100%)'; }
      readout.textContent = idx === pts.length - 1 ? T('Latest ', 'Τελευταία ') + txt + ' · ' + dmS(p.t) + ' ' + hmS(p.t) : txt + ' · ' + dmS(p.t) + ' ' + hmS(p.t);
    };
    const nearest = (t) => { let b = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[b].t - t)) b = i; return b; };
    const at = (cx) => { const rc = s.getBoundingClientRect(); show(nearest(t0 + ((((cx - rc.left) / Math.max(1, rc.width)) * W - m.l) / (W - m.l - m.r)) * (t1 - t0))); };
    s.addEventListener('pointermove', (e) => at(e.clientX));
    s.addEventListener('pointerdown', (e) => at(e.clientX));
    s.addEventListener('pointerleave', () => show(pts.length - 1));
    s.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); } else if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); } else if (e.key === 'End') { e.preventDefault(); show(pts.length - 1); }
    });
    requestAnimationFrame(() => show(pts.length - 1));
    return { gaps };
  }

  SC.register('weather', {
    title: ['Met Office record', 'Μετεωρολογικό αρχείο'],
    render(root, ctx) {
      let alive = true;
      const timers = [];
      const every = (fn, ms) => timers.push(setInterval(() => { if (alive && !document.hidden) fn(); }, ms));

      const feedMeta = h('span', { class: 'wx-meta-a' });
      const pageMeta = h('span', { class: 'wx-meta-b' });
      root.append(SC.head({
        title: T('Met Office record', 'Μετεωρολογικό αρχείο'),
        fresh: T('Official source', 'Επίσημη πηγή'),
        lede: T('What the Cyprus Department of Meteorology publishes: warnings, the forecast, radar, sea and aviation texts, and readings from its weather stations. We show it as published and never change it. Our own sensors sit beside it on the other pages.',
          'Όσα δημοσιεύει το Τμήμα Μετεωρολογίας Κύπρου: προειδοποιήσεις, πρόγνωση, ραντάρ, κείμενα για τη θάλασσα και την αεροπλοΐα, και μετρήσεις από τους μετεωρολογικούς του σταθμούς. Τα εμφανίζουμε όπως δημοσιεύονται και δεν τα αλλάζουμε. Οι δικοί μας αισθητήρες βρίσκονται δίπλα τους στις άλλες σελίδες.'),
        help: ['Everything here comes from the Cyprus Department of Meteorology (dom.org.cy), except the five day cards, which are a weather model and say so. Use the buttons under the title to jump to warnings, the forecast, the radar picture, the sea and aviation texts or the weather stations. Click a station to see its history, download it as a CSV file, or open it on the map. Our server keeps its own copy of each station reading, about every 10 minutes, so history charts are possible.',
          'Όλα εδώ προέρχονται από το Τμήμα Μετεωρολογίας Κύπρου (dom.org.cy), εκτός από τις κάρτες των πέντε ημερών, που είναι μετεωρολογικό μοντέλο και το αναφέρουν. Χρησιμοποιήστε τα κουμπιά κάτω από τον τίτλο για να μεταβείτε στις προειδοποιήσεις, την πρόγνωση, το ραντάρ, τα κείμενα για τη θάλασσα και την αεροπλοΐα ή τους μετεωρολογικούς σταθμούς. Πατήστε έναν σταθμό για να δείτε το ιστορικό του, να το κατεβάσετε ως αρχείο CSV ή να τον ανοίξετε στον χάρτη. Ο διακομιστής μας κρατά δικό του αντίγραφο κάθε μέτρησης σταθμού, περίπου ανά 10 λεπτά, ώστε να υπάρχουν διαγράμματα ιστορικού.'],
      }));

      /* ---------- section pills ---------- */
      const SECTIONS = [['warnings', T('Warnings', 'Προειδοποιήσεις')], ['forecast', T('Forecast', 'Πρόγνωση')], ['radar', T('Radar', 'Ραντάρ')], ['sea', T('Sea and aviation', 'Θάλασσα και αεροπλοΐα')], ['stations', T('Stations', 'Σταθμοί')]];
      const pills = h('nav', { class: 'nm-pillbar wx-pills', 'aria-label': T('Sections of the Met Office record', 'Ενότητες του μετεωρολογικού αρχείου') });
      const pillBtn = new Map();
      const setPill = (id) => pillBtn.forEach((b, k) => { b.classList.toggle('on', k === id); if (k === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
      const secEl = {};
      SECTIONS.forEach(([id, label]) => {
        const b = h('button', { type: 'button', onclick: () => { setPill(id); secEl[id].scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); } }, label);
        pillBtn.set(id, b); pills.append(b);
      });
      root.append(h('div', { class: 'wx-tabs-row' }, pills, h('span', { class: 'wx-meta' }, feedMeta, pageMeta)));
      const sec = (id, ...kids) => { const s = h('section', { class: 'wx-sec', id: 'wx-' + id, 'aria-label': SECTIONS.find((x) => x[0] === id)[1] }, ...kids); secEl[id] = s; return s; };

      /* ---------- warnings ---------- */
      const warnBox = h('div');
      const oldBox = h('div', { class: 'wx-old', hidden: true });
      const oldBtn = h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', 'aria-expanded': 'false', onclick: () => toggleOld() }, T('Earlier versions, last 30 days', 'Προηγούμενες εκδόσεις, τελευταίες 30 ημέρες'));
      let oldLoaded = false, warnChecked = null;
      async function drawWarnings() {
        const p = await SC.api('/api/dom/page?name=warnings');
        const text = (p.text || '').trim();
        // With nothing in force the page shows only its heading ("ISSUED WEATHER WARNINGS").
        const none = text.replace(/\s+/g, ' ').length < 40;
        warnChecked = Date.parse(p.fetched);
        pageMeta.textContent = ' · ' + T('warnings page checked ', 'η σελίδα προειδοποιήσεων ελέγχθηκε ') + hhmm(warnChecked);
        const icon = h('span', { class: 'wx-wn-ic' + (none ? '' : ' warn') }, SC.icon(none ? 'check' : 'bell'));
        const lv = (c, en, el) => h('span', { class: 'wx-lv' }, h('i', { style: { background: c } }), T(en, el));
        const page = h('a', { class: 'wx-lnk', href: p.url, target: '_blank', rel: 'noopener' }, T('warnings page', 'σελίδα προειδοποιήσεων'));
        const levels = h('p', null, T('The Department warns at three levels: ', 'Το Τμήμα εκδίδει προειδοποιήσεις σε τρία επίπεδα: '),
          lv('#F0B94A', 'yellow', 'κίτρινο'), ', ', lv('#F28C3F', 'orange', 'πορτοκαλί'), T(' and ', ' και '), lv('#FF5C6C', 'red', 'κόκκινο'), '. ',
          none ? [T('Its ', 'Η '), page, T(' lists none right now.', ' δεν αναφέρει καμία αυτή τη στιγμή.')] : [T('Read the text below, exactly as published, from its ', 'Διαβάστε το κείμενο παρακάτω, όπως ακριβώς δημοσιεύεται, από τη '), page, '.']);
        const head = h('div', { class: 'wx-wn nm-callout ' + (none ? 'nm-callout--ok' : 'nm-callout--warn'), role: 'status' }, icon,
          h('div', { class: 'wx-wn-body' },
            h('div', null, h('b', null, none ? T('No warnings in force.', 'Δεν υπάρχουν ενεργές προειδοποιήσεις.') : T('Warnings may be in force.', 'Ενδέχεται να ισχύουν προειδοποιήσεις.')),
              h('span', { class: 'wx-when' + (none ? '' : ' warn') }, T('Checked ', 'Έλεγχος ') + when(warnChecked) + ' · ' + SC.ago(warnChecked))), levels),
          oldBtn);
        const extra = [];
        if (!none) extra.push(h('pre', { class: 'wx-txt' }, text));
        useful(p.images).slice(0, 4).forEach((u) => extra.push(pic(imgByAddress(u), T('Picture from the Met Office warnings page', 'Εικόνα από τη σελίδα προειδοποιήσεων της Υπηρεσίας'))));
        return [head, ...extra];
      }
      const reloadWarnings = loader(warnBox, 'the warnings', 'των προειδοποιήσεων', drawWarnings);
      async function loadOld() {
        fill(oldBox, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const v = (await SC.api('/api/dom/pages/history?name=warnings&days=30')).slice().reverse().slice(0, 20);
          oldLoaded = true;
          if (!v.length) { fill(oldBox, h('div', { class: 'empty' }, T('No earlier versions are saved yet. The server saves one each time the warnings text changes.', 'Δεν έχουν αποθηκευτεί ακόμη προηγούμενες εκδόσεις. Ο διακομιστής αποθηκεύει μία κάθε φορά που αλλάζει το κείμενο των προειδοποιήσεων.'))); return; }
          fill(oldBox, h('p', { class: 'wx-hint' }, T(v.length + ' saved versions, newest first. The server keeps a copy whenever the text changes.', v.length + ' αποθηκευμένες εκδόσεις, οι νεότερες πρώτα. Ο διακομιστής κρατά αντίγραφο κάθε φορά που αλλάζει το κείμενο.')),
            v.map((x) => h('details', { class: 'wx-ver' }, h('summary', null, when(x.t) + ' · ' + ((x.text || '').replace(/\s+/g, ' ').slice(0, 90) || T('empty', 'κενό'))), h('pre', { class: 'wx-txt' }, x.text || ''))));
        } catch (e) { fill(oldBox, errBox('the earlier versions', 'των προηγούμενων εκδόσεων', e, loadOld)); }
      }
      function toggleOld() {
        const open = oldBox.hidden;
        oldBox.hidden = !open; oldBtn.setAttribute('aria-expanded', String(open));
        if (open && !oldLoaded) loadOld();
      }
      root.append(sec('warnings', warnBox, oldBox));

      /* ---------- forecast: five day cards, and the Department's own tables behind a link ---------- */
      const fcBox = h('div', { class: 'wx-fc' }, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      const fcNote = h('span', { class: 'wx-small' });
      const tablesPic = h('div');
      let fcId = 'table_a', tablesOpen = false;
      const drawTablePic = (id) => {
        fcId = id;
        fill(tablesPic, pic(imgUrl(id), T('Met Office forecast, table ' + id.slice(-1).toUpperCase(), 'Πρόγνωση Μετεωρολογικής Υπηρεσίας, πίνακας ' + id.slice(-1).toUpperCase())),
          h('p', { class: 'wx-hint' }, h('a', { class: 'wx-lnk', href: imgUrl(id), target: '_blank', rel: 'noopener' }, T('Open the picture full size', 'Άνοιγμα της εικόνας σε πλήρες μέγεθος')),
            ' · ' + T('Pictures published by the Met Office, shown through this server.', 'Εικόνες που δημοσιεύει η Μετεωρολογική Υπηρεσία, εμφανίζονται μέσω του διακομιστή μας.')));
      };
      const tabChips = chipRow([['table_a', T('Table A', 'Πίνακας Α')], ['table_b', T('Table B', 'Πίνακας Β')], ['table_c', T('Table C', 'Πίνακας Γ')]], fcId, drawTablePic, T('Forecast tables', 'Πίνακες πρόγνωσης'));
      const tablesCard = h('div', { class: 'nm-card wx-br wx-tables', id: 'wx-tables', hidden: true },
        h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('The Department’s forecast tables', 'Οι πίνακες πρόγνωσης του Τμήματος')), h('span', { class: 'wx-sp' }), tabChips.el), tablesPic);
      drawTablePic(fcId);
      const tablesBtn = h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'wx-tables', onclick: () => setTables(!tablesOpen) }, T('Full tables A, B and C', 'Πλήρεις πίνακες Α, Β και Γ'));
      function setTables(open) {
        tablesOpen = open; tablesCard.hidden = !open; tablesBtn.setAttribute('aria-expanded', String(open));
        tablesBtn.textContent = open ? T('Hide the full tables', 'Απόκρυψη των πινάκων') : T('Full tables A, B and C', 'Πλήρεις πίνακες Α, Β και Γ');
      }
      const weekday = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: TZ, weekday: 'long' });
      const weekdayS = new Intl.DateTimeFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB', { timeZone: TZ, weekday: 'short' });
      async function drawForecast() {
        let f = null;
        try { f = await SC.api('/api/forecast'); } catch (e) { f = null; }
        if (!alive) return;
        const days = f && Array.isArray(f.days) ? f.days.filter((d) => d && d.date && isFinite(d.tmax) && isFinite(d.tmin)).slice(0, 5) : [];
        if (!days.length) {
          fill(fcBox, h('div', { class: 'wx-fc-none', role: 'status' }, T('The Department publishes its forecast as pictures (tables A, B and C). They are shown here as published.', 'Το Τμήμα δημοσιεύει την πρόγνωσή του ως εικόνες (πίνακες Α, Β και Γ). Εμφανίζονται εδώ όπως δημοσιεύονται.')));
          fcNote.textContent = '';
          tablesBtn.hidden = true;
          setTables(true);
          return;
        }
        tablesBtn.hidden = false;
        const upd = f.updated ? Date.parse(f.updated) : null;
        const place = !f.place || /^central cyprus$/i.test(f.place) ? T('central Cyprus', 'κεντρική Κύπρος') : f.place;
        const meta = [f.source, place, upd ? hhmm(upd) : null].filter(Boolean).join(', ');
        fcNote.textContent = T('Model forecast, not the Department’s (' + meta + '). Big number is the high, small the low.', 'Πρόγνωση μοντέλου, όχι του Τμήματος (' + meta + '). Μεγάλος αριθμός η μέγιστη, μικρός η ελάχιστη.');
        const lo = Math.min(...days.map((d) => d.tmin)) - 2, hi = Math.max(...days.map((d) => d.tmax)) + 2;
        const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(Date.now());
        fill(fcBox, days.map((d, i) => {
          const noon = Date.parse(d.date + 'T12:00:00Z'), isToday = d.date === todayKey, w = WMO(d.code);
          const a = ((d.tmin - lo) / (hi - lo)) * 100, b = ((d.tmax - lo) / (hi - lo)) * 100;
          const wind = d.wind != null && isFinite(d.wind) ? T('Wind ' + compass(d.windDir) + ', ' + Math.round(d.wind) + ' m/s', 'Άνεμος ' + compass(d.windDir) + ', ' + Math.round(d.wind) + ' m/s') : T('Wind not given', 'Χωρίς στοιχεία ανέμου');
          return h('article', { class: 'nm-glass wx-fc-t nm-lift' + (isToday ? ' today' : '') },
            h('div', { class: 'wx-fc-d' }, h('b', null, isToday ? T('Today', 'Σήμερα') : weekday.format(noon)), h('span', null, (isToday ? weekdayS.format(noon) + ' ' : '') + SC.date(noon))),
            h('div', { class: 'wx-fc-mid' }, wxIcon(w[0]), h('div', { class: 'wx-fc-cond' }, T(w[1], w[2]))),
            h('div', null, h('div', { class: 'wx-fc-temp', title: T('High ' + Math.round(d.tmax) + ' °C, low ' + Math.round(d.tmin) + ' °C', 'Μέγιστη ' + Math.round(d.tmax) + ' °C, ελάχιστη ' + Math.round(d.tmin) + ' °C') }, h('b', null, Math.round(d.tmax) + '°'), h('span', null, Math.round(d.tmin) + '°')),
              h('div', { class: 'wx-fc-range', 'aria-hidden': 'true' }, h('i', { style: { left: a.toFixed(1) + '%', right: (100 - b).toFixed(1) + '%' } }))),
            h('div', { class: 'wx-fc-wind' }, d.wind != null && isFinite(d.wind) ? windArrow(d.windDir) : null, h('span', null, wind)));
        }));
      }
      drawForecast();
      every(drawForecast, 1800000);
      root.append(sec('forecast',
        h('div', { class: 'wx-sec-h' }, h('span', { class: 'kpi-label' }, T('Forecast · next 5 days', 'Πρόγνωση · επόμενες 5 ημέρες')), fcNote, h('span', { class: 'wx-sp' }), tablesBtn),
        fcBox, tablesCard));

      /* ---------- radar: the Department's picture in a frame, with its animation behind the play button ---------- */
      const radBox = h('div', { class: 'wx-radar' });
      const radStamp = h('span', { class: 'wx-tag wx-tag-r' });
      let radId = 'radar', radAnim = false, radLoaded = 0;
      const radNames = { radar: T('Cyprus', 'Κύπρος'), radar_pfo: T('Paphos', 'Πάφος'), radar_lca: T('Larnaka', 'Λάρνακα') };
      const playBtn = h('button', { class: 'wx-play', type: 'button', 'aria-label': T('Play the Department’s radar animation', 'Αναπαραγωγή της κίνησης του ραντάρ του Τμήματος'), 'aria-pressed': 'false', onclick: () => { setAnim(!radAnim); } });
      const playIc = (on) => sv('svg', { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': 'true' }, sv('path', { d: on ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M7 4.5v15l13-7.5z' }));
      const modePills = h('div', { class: 'wx-tl-pills', role: 'group', 'aria-label': T('Radar view', 'Προβολή ραντάρ') });
      const drawRadar = (bust) => {
        radLoaded = Date.now();
        const id = radAnim ? 'radar_anim' : radId;
        const label = radAnim ? T('Animation', 'Κίνηση') : radNames[radId];
        const img = h('img', { class: 'wx-radar-img', src: imgUrl(id) + (bust ? '&r=' + Date.now() : ''), alt: T('Met Office radar picture, ' + label, 'Εικόνα ραντάρ της Μετεωρολογικής Υπηρεσίας, ' + label) });
        img.addEventListener('error', () => fill(radBox, h('p', { class: 'wx-miss', role: 'status' }, T('This radar picture is not available from the Met Office right now. Try again in a few minutes.', 'Αυτή η εικόνα ραντάρ δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγα λεπτά.'))));
        const back = h('img', { class: 'wx-radar-bg', src: imgUrl(id) + (bust ? '&r=' + Date.now() : ''), alt: '', 'aria-hidden': 'true' });
        fill(radBox, back, img, h('span', { class: 'wx-tag wx-tag-l' }, T('Rain radar', 'Ραντάρ βροχής') + (radAnim ? ' · ' + label : '')), radStamp);
        fill(radStamp, h('i'), T('Loaded ', 'Φορτώθηκε ') + hhmm(radLoaded));
        fill(playBtn, playIc(radAnim)); playBtn.setAttribute('aria-pressed', String(radAnim));
        fill(modePills, [[false, T('Still picture', 'Στατική εικόνα')], [true, T('Animation', 'Κίνηση')]].map(([a, l]) => h('button', { type: 'button', class: a === radAnim ? 'on' : '', 'aria-pressed': String(a === radAnim), disabled: a && radId !== 'radar' ? true : null, onclick: () => setAnim(a) }, l)));
      };
      function setAnim(on) { radAnim = on && radId === 'radar'; drawRadar(false); }
      const radChips = chipRow([['radar', radNames.radar], ['radar_pfo', radNames.radar_pfo], ['radar_lca', radNames.radar_lca]], radId, (id) => { radId = id; radAnim = false; drawRadar(false); }, T('Radar pictures', 'Εικόνες ραντάρ'));
      drawRadar(false);
      const radarCard = h('div', { class: 'nm-card wx-br wx-radar-card' },
        h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Radar · rain over Cyprus', 'Ραντάρ · βροχή πάνω από την Κύπρο')), h('span', { class: 'wx-sp' }), radChips.el),
        radBox,
        h('div', { class: 'wx-tl' }, playBtn, modePills),
        h('p', { class: 'wx-cap' }, h('b', null, T('The Department’s own picture, shown as published.', 'Η εικόνα του ίδιου του Τμήματος, όπως δημοσιεύεται.')), ' ', T('It updates about every 10 minutes. ', 'Ανανεώνεται περίπου ανά 10 λεπτά. '),
          h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', onclick: () => drawRadar(true) }, T('Reload picture', 'Ανανέωση εικόνας'))));
      every(() => drawRadar(true), 600000);

      /* ---------- sea and aviation ---------- */
      const SEA = [['sea', T('Sea', 'Θάλασσα'), 'sea_a'], ['navtex', 'NAVTEX', 'navtex'], ['fir', T('Flight region', 'Περιοχή πτήσεων'), 'fir'], ['laf', T('Aviation', 'Αεροπορικά'), 'laf']];
      const SEA_PAGES = [['sea_a', 'A'], ['sea_b', 'B'], ['sea_c', 'C'], ['sea_d', 'D']];
      const seaBox = h('div');
      let seaGroup = 'sea', seaId = 'sea_a', seaToken = 0;
      async function drawSea() {
        const my = ++seaToken, id = seaId;
        fill(seaBox, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        try {
          const p = await SC.api('/api/dom/page?name=' + id);
          if (my !== seaToken || !alive) return;
          const text = (p.text || '').trim();
          fill(seaBox,
            text ? h('pre', { class: 'wx-txt wx-sea-txt' }, text) : h('div', { class: 'empty' }, T('This Met Office page has no text right now.', 'Αυτή η σελίδα της Υπηρεσίας δεν έχει κείμενο αυτή τη στιγμή.')),
            useful(p.images).slice(0, 3).map((u) => pic(imgByAddress(u), T('Picture from the Met Office page', 'Εικόνα από τη σελίδα της Υπηρεσίας'))),
            sourceLine(p));
        } catch (e) { if (my === seaToken && alive) fill(seaBox, errBox('this page', 'αυτής της σελίδας', e, drawSea)); }
      }
      const seaChips = chipRow(SEA.map(([k, l]) => [k, l]), seaGroup, (k) => { seaGroup = k; seaId = SEA.find((x) => x[0] === k)[2]; subChips.set(seaId); seaSub.hidden = k !== 'sea'; drawSea(); }, T('Sea and aviation texts', 'Κείμενα θάλασσας και αεροπλοΐας'));
      const subChips = chipRow(SEA_PAGES, seaId, (id) => { seaId = id; drawSea(); }, T('Sea forecast pages', 'Σελίδες πρόγνωσης θάλασσας'), 'wx-sub-chips');
      const seaSub = h('div', { class: 'wx-sea-sub' }, h('span', null, T('Sea pages', 'Σελίδες θάλασσας')), subChips.el);
      drawSea();
      every(drawSea, 300000);

      /* ---------- NET (feels like) ---------- */
      const netBox = h('div'), netInner = h('div'), netTitle = h('span', { class: 'kpi-label' });
      const netState = { rows: [], time: null, all: false, order: -1, sort: { key: 'net', dir: -1 } };
      function drawNet() {
        const rows = netState.rows;
        const sorted = rows.filter((r) => r.net != null).sort((a, b) => (b.net - a.net) * (netState.order === -1 ? 1 : -1));   // order -1: warmest first
        netTitle.textContent = T('Feels like (NET) · ' + (netState.order === -1 ? 'warmest first' : 'coolest first'), 'Αίσθηση θερμοκρασίας (NET) · ' + (netState.order === -1 ? 'πρώτα τα θερμότερα' : 'πρώτα τα δροσερότερα'));
        const list = h('ul', { class: 'wx-net' }, sorted.slice(0, 6).map((r) => {
          const tt = Math.max(0.05, Math.min(1, (r.net - 4) / 20));   // a fixed scale of 4 to 24 on the bar, so a small gap looks small
          return h('li', { title: [r.temp != null ? SC.num(r.temp) + ' °C' : '', r.hum != null ? SC.num(r.hum, 0) + ' %' : '', r.wind != null ? SC.num(r.wind) + ' kn' : ''].filter(Boolean).join(' · ') },
            h('span', { class: 'wx-net-n' }, nice(r.station)), h('span', { class: 'wx-net-tr', 'aria-hidden': 'true' }, h('i', { style: { width: Math.round(100 * tt) + '%' } })), h('b', null, SC.num(r.net)));
        }));
        const foot = h('div', { class: 'wx-net-foot' },
          h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', onclick: () => { netState.order = netState.order === -1 ? 1 : -1; drawNet(); } }, netState.order === -1 ? T('Coolest first', 'Πρώτα τα δροσερότερα') : T('Warmest first', 'Πρώτα τα θερμότερα')),
          h('button', { class: 'wx-lnk wx-linkbtn', type: 'button', 'aria-expanded': String(netState.all), onclick: () => { netState.all = !netState.all; drawNet(); } }, netState.all ? T('Hide the table', 'Απόκρυψη πίνακα') : T('Show all ' + rows.length + ' stations', 'Εμφάνιση και των ' + rows.length + ' σταθμών')));
        const parts = [
          h('p', { class: 'wx-sub wx-net-sub' }, T('Net effective temperature mixes temperature, humidity and wind into one number. Higher feels warmer. Reference time ' + (netState.time ? when(netState.time) : 'unknown') + '.',
            'Η καθαρή ενεργός θερμοκρασία συνδυάζει θερμοκρασία, υγρασία και άνεμο σε έναν αριθμό. Όσο μεγαλύτερος, τόσο πιο ζεστά αισθάνεται κανείς. Ώρα αναφοράς ' + (netState.time ? when(netState.time) : 'άγνωστη') + '.')),
          list, foot];
        if (netState.all) {
          const cols = [['station', T('Station', 'Σταθμός'), (r) => r.station, (r) => nice(r.station)], ['temp', T('Temperature °C', 'Θερμοκρασία °C'), (r) => r.temp, (r) => SC.num(r.temp)], ['hum', T('Humidity %', 'Υγρασία %'), (r) => r.hum, (r) => SC.num(r.hum, 0)],
            ['wind', T('Wind kn', 'Άνεμος kn'), (r) => r.wind, (r) => SC.num(r.wind)], ['net', 'NET', (r) => r.net, (r) => SC.num(r.net)]];
          const col = cols.find((c) => c[0] === netState.sort.key) || cols[4];
          const all = rows.slice().sort((a, b) => { const x = col[2](a), y = col[2](b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * netState.sort.dir; });
          parts.push(h('div', { class: 'nm-table-wrap wx-scroll' }, h('table', { class: 'nm-table wx-table' },
            h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c[0] === 'station' ? '' : 'n', 'aria-sort': netState.sort.key === c[0] ? (netState.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
              h('button', { class: 'wx-th', type: 'button', onclick: () => { netState.sort = { key: c[0], dir: netState.sort.key === c[0] ? -netState.sort.dir : (c[0] === 'station' ? 1 : -1) }; drawNet(); } }, c[1] + (netState.sort.key === c[0] ? (netState.sort.dir > 0 ? ' ▲' : ' ▼') : '')))))),
            h('tbody', null, all.map((r) => h('tr', null, cols.map((c) => h('td', { class: c[0] === 'station' ? '' : 'n' }, c[3](r)))))))));
        }
        fill(netInner, ...parts);
      }
      const reloadNet = loader(netBox, 'the feels-like list', 'της λίστας αίσθησης θερμοκρασίας', async () => {
        const n = await SC.api('/api/dom/net');
        netState.rows = n.rows || []; netState.time = n.time ? Date.parse(n.time) : null;
        if (!netState.rows.length) return h('div', { class: 'empty' }, T('The Met Office list has no stations right now.', 'Η λίστα της Υπηρεσίας δεν έχει σταθμούς αυτή τη στιγμή.'));
        drawNet();
        return netInner;
      });
      netTitle.textContent = T('Feels like (NET)', 'Αίσθηση θερμοκρασίας (NET)');
      every(() => reloadNet(true), 600000);
      const netCard = h('div', { class: 'nm-card wx-br' }, h('div', { class: 'wx-ch' }, netTitle), netBox);

      root.append(h('div', { class: 'wx-row' },
        sec('radar', radarCard),
        h('div', { class: 'wx-col' },
          sec('sea', h('div', { class: 'nm-card wx-br' },
            h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Sea and aviation', 'Θάλασσα και αεροπλοΐα'))), seaChips.el, seaSub, seaBox)),
          netCard)));

      /* ---------- stations ---------- */
      const S = { points: [], stationCount: 0, feedTime: null, copyright: '', q: '', sel: null, key: 'temp', more: false, hours: 24, sort: { key: 'name', dir: 1 }, trend: new Map(), hist: new Map(), token: 0, info: null };
      const tableBody = h('tbody');
      const tableHead = h('thead');
      const countEl = h('span', { class: 'wx-sub wx-count' });
      const search = h('input', { class: 'nm-input', type: 'search', placeholder: T('Search stations', 'Αναζήτηση σταθμών'), 'aria-label': T('Search stations', 'Αναζήτηση σταθμών') });
      search.addEventListener('input', () => { S.q = search.value; drawTable(); });
      const titleEl = h('span', { class: 'kpi-label' }, T('Stations', 'Σταθμοί'));
      const histNote = h('p', { class: 'wx-hint wx-histnote' });
      const tableWrap = h('div', { class: 'wx-scrollbox' }, h('div', { class: 'nm-table-wrap wx-scroll' }, h('table', { class: 'nm-table wx-table wx-st', id: 'wx-sttable' }, tableHead, tableBody)));
      const stState = h('div');
      const detailCard = h('div', { class: 'nm-card wx-br wx-detail', id: 'wx-detail' });

      const COLS = [
        { k: 'name', label: T('Station', 'Σταθμός'), get: (p) => p.name },
        { k: 'temp', label: T('Temp °C', 'Θερμ. °C'), get: (p) => p.temp },
        { k: 'hum', label: T('Humidity %', 'Υγρασία %'), get: (p) => p.hum },
        { k: 'ws', label: T('Wind m/s', 'Άνεμος m/s'), get: (p) => p.ws },
        { k: 'trend', label: T('Last 24 h', 'Τελευταίες 24 ώρες'), get: null },
      ];
      function drawTable() {
        const q = S.q.trim().toLowerCase();
        const rows = q ? S.points.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || districtOf(p).toLowerCase().includes(q)) : S.points;
        countEl.textContent = rows.length === S.points.length ? '' : T(rows.length + ' of ' + S.points.length + ' stations', rows.length + ' από ' + S.points.length + ' σταθμούς');
        fill(tableHead, h('tr', null, COLS.map((c) => h('th', { class: c.k === 'name' ? '' : c.k === 'trend' ? 'wx-th-sp' : 'n', 'aria-sort': S.sort.key === c.k ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
          c.get ? h('button', { class: 'wx-th', type: 'button', onclick: () => { S.sort = { key: c.k, dir: S.sort.key === c.k ? -S.sort.dir : (c.k === 'name' ? 1 : -1) }; drawTable(); } }, c.label + (S.sort.key === c.k ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : '')) : c.label))));
        const col = COLS.find((c) => c.k === S.sort.key) || COLS[0];
        const sorted = rows.slice().sort((a, b) => {
          const x = col.get(a), y = col.get(b);
          if (x == null && y == null) return 0;
          if (x == null) return 1;
          if (y == null) return -1;
          return (typeof x === 'string' ? x.localeCompare(y) : x - y) * S.sort.dir;
        });
        fill(tableBody, sorted.map((p) => {
          const tm = p.time ? Date.parse(p.time) : null, old = isOld(tm), dist = districtOf(p);
          const tr = h('tr', { class: p.id === S.sel ? 'sel' : '', 'data-id': p.id },
            h('td', null, h('button', { class: 'wx-stbtn', type: 'button', 'aria-current': p.id === S.sel ? 'true' : null, onclick: (e) => { e.stopPropagation(); selectStation(p.id, true); } }, h('span', { class: 'wx-nm1' }, p.name)),
              h('div', { class: 'wx-nm2' + (old ? ' old' : '') }, !tm ? T('no reading time', 'χωρίς ώρα μέτρησης') : old ? T('Reading ' + hhmm(tm) + ', old', 'Μέτρηση ' + hhmm(tm) + ', παλιά') : (dist || hhmm(tm) + ' · ' + SC.ago(tm)))),
            h('td', { class: 'n' }, h('b', null, SC.num(p.temp))), h('td', { class: 'n' }, SC.num(p.hum, 0)),
            h('td', { class: 'n' }, p.ws == null ? '–' : [SC.num(p.ws), h('small', null, compass(p.wd))]),
            h('td', { class: 'n wx-spk' }, trendCell(p.id)));
          tr.addEventListener('click', () => selectStation(p.id, true));
          return tr;
        }));
        const wrap = tableBody.closest('.wx-scroll'), selRow = tableBody.querySelector('tr.sel');
        if (wrap && selRow && S.scrolledTo !== S.sel) { S.scrolledTo = S.sel; wrap.scrollTop = Math.max(0, selRow.offsetTop - wrap.clientHeight / 2 + selRow.offsetHeight / 2); }
        if (!rows.length) tableBody.append(h('tr', null, h('td', { colspan: String(COLS.length), class: 'wx-none' }, T('No station with that name.', 'Κανένας σταθμός με αυτό το όνομα.'))));
      }
      function trendCell(id) {
        const pts = S.trend.get(id);
        if (!pts || pts.length < 3) return S.trend.size ? h('span', { class: 'wx-sub' }, '–') : '';
        const w = 92, hh = 26, pad = 3, lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1;
        const X = (i) => pad + (i / (pts.length - 1)) * (w - 2 * pad), Y = (v) => hh - pad - ((v - lo) / span) * (hh - 2 * pad);
        const col = SCChart.COLORS[1];
        const s = sv('svg', { viewBox: '0 0 ' + w + ' ' + hh, width: w, height: hh, role: 'img', 'aria-label': T('Temperature, last 24 hours: from ' + SC.num(pts[0]) + ' to ' + SC.num(pts[pts.length - 1]) + ' °C', 'Θερμοκρασία, τελευταίες 24 ώρες: από ' + SC.num(pts[0]) + ' έως ' + SC.num(pts[pts.length - 1]) + ' °C') },
          sv('path', { d: pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(''), fill: 'none', stroke: col, 'stroke-width': 1.7, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
          sv('circle', { cx: X(pts.length - 1).toFixed(1), cy: Y(pts[pts.length - 1]).toFixed(1), r: 2.4, fill: col }));
        return s;
      }
      // One CSV for all stations gives every trend in a single request.
      async function loadTrends() {
        try {
          const text = await SC.api('/api/cydom/history.csv?days=1', { text: true });
          const lines = text.replace(/^﻿/, '').split('\n');
          const head = (lines[0] || '').split(',');
          const iT = head.findIndex((c) => /^temp\b/.test(c)), iS = head.indexOf('station'), iU = head.indexOf('time_utc');
          if (iT < 0 || iS < 0 || iU < 0) return;
          const m = new Map();
          for (let i = 1; i < lines.length; i++) {
            if (!lines[i]) continue;
            const c = lines[i].split(',');
            const v = c[iT] === '' || c[iT] == null ? NaN : Number(c[iT]);
            if (!isFinite(v)) continue;
            if (!m.has(c[iS])) m.set(c[iS], []);
            m.get(c[iS]).push(v);
          }
          m.forEach((v, k) => { const step = Math.max(1, Math.round(v.length / 48)); m.set(k, v.filter((x, i) => i % step === 0 || i === v.length - 1)); });
          S.trend = m;
          if (alive) drawTable();
        } catch (e) { /* the trend column stays empty; the table itself is fine */ }
      }
      async function loadInfo() {
        try {
          const i = await SC.api('/api/cydom/history/info');
          S.info = i;
          const first = i.firstT ? SC.date(i.firstT) : null;
          fill(histNote, first ? T('This server saves every new reading. History starts ' + first + ': ' + i.files + ' days saved, ' + i.stations + ' stations.', 'Ο διακομιστής αποθηκεύει κάθε νέα μέτρηση. Το ιστορικό ξεκινά στις ' + first + ': ' + i.files + ' ημέρες αποθηκευμένες, ' + i.stations + ' σταθμοί.')
            : T('This server saves every new reading. No history has been saved yet.', 'Ο διακομιστής αποθηκεύει κάθε νέα μέτρηση. Δεν έχει αποθηκευτεί ακόμη ιστορικό.'),
          i.persistent === false ? h('span', { class: 'wx-banner' }, T('This server has no storage volume, so the saved history is lost whenever it restarts.', 'Αυτός ο διακομιστής δεν έχει όγκο αποθήκευσης, οπότε το ιστορικό χάνεται σε κάθε επανεκκίνηση.')) : null);
        } catch (e) { histNote.textContent = ''; }
      }
      async function loadStations(silent) {
        try {
          const d = await SC.api('/api/cydom');
          S.points = d.points || []; S.stationCount = d.stationCount || S.points.length; S.feedTime = d.feedTime ? Date.parse(d.feedTime) : null; S.copyright = d.copyright || '';
          if (!alive) return;
          const old = S.feedTime && isOld(S.feedTime);
          fill(feedMeta, S.feedTime ? T('Newest station reading ' + hhmm(S.feedTime) + (old ? ', which is old' : ''), 'Νεότερη μέτρηση σταθμού ' + hhmm(S.feedTime) + (old ? ', η οποία είναι παλιά' : '')) : T('No station reading time', 'Χωρίς ώρα μέτρησης σταθμών'));
          feedMeta.classList.toggle('old', Boolean(old));
          titleEl.textContent = T('Stations · ' + S.points.length + ' reporting', 'Σταθμοί · ' + S.points.length + ' με μετρήσεις');
          fill(stState, !S.points.length ? h('div', { class: 'empty' }, T('The Met Office feed has no station readings right now. Try again in a few minutes.', 'Η πηγή της Υπηρεσίας δεν έχει μετρήσεις σταθμών αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγα λεπτά.')) : null);
          if (!S.sel && S.points.length && !S.picked) {   // show a station by default so the detail card is not empty
            const def = S.points.find((x) => /larnaca.*airport|airport.*larnaca/i.test(x.id + ' ' + x.name)) || S.points.slice().sort((a, b) => a.name.localeCompare(b.name))[0];
            S.sel = def.id; S.picked = true;
          }
          drawTable();
          if (S.sel) {
            const cur = S.points.find((x) => x.id === S.sel), sig = cur ? cur.time : 'none';
            if (!silent || sig !== S.sig) { S.sig = sig; S.hist.clear(); drawDetail(); }   // a refresh only redraws the detail when its reading changed
          }
        } catch (e) {
          if (!alive) return;
          if (S.sel && !S.points.length) drawDetail();   // the saved history can still be shown
          if (!S.points.length) fill(stState, errBox('the stations', 'των σταθμών', e, () => { fill(stState, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); loadStations(false); }));
          feedMeta.textContent = T('Station readings could not be loaded', 'Δεν φορτώθηκαν οι μετρήσεις σταθμών');
        }
      }

      /* ----- station detail ----- */
      const KEYS = [
        ['temp', T('Temperature', 'Θερμοκρασία'), 1, 0], ['hum', T('Humidity', 'Υγρασία'), 0, 0], ['ws10', T('Wind 10 m', 'Άνεμος 10 m'), 1, 0], ['pmsl', T('Pressure', 'Πίεση'), 1, 0], ['rain10', T('Rain', 'Βροχή'), 1, 0],
        ['ws2', T('Wind 2 m', 'Άνεμος 2 m'), 1, 1], ['pstn', T('Station pressure', 'Πίεση σταθμού'), 1, 1], ['dsr', T('Direct sun', 'Άμεσος ήλιος'), 0, 1], ['tmax', T('Day max', 'Μέγιστη ημέρας'), 1, 1], ['tmin', T('Day min', 'Ελάχιστη ημέρας'), 1, 1],
      ];
      const COLORS = { temp: SCChart.COLORS[1], hum: SCChart.COLORS[0], ws10: SCChart.COLORS[2], ws2: SCChart.COLORS[2], pmsl: SCChart.COLORS[3], pstn: SCChart.COLORS[3], rain10: '#4CCBEA', dsr: SCChart.COLORS[4], tmax: SCChart.COLORS[1], tmin: SCChart.COLORS[0] };
      const pointsOf = (s, key) => { const i = s.keys.indexOf(key); return i < 0 ? [] : s.rows.filter((r) => r[i + 1] != null).map((r) => ({ t: r[0], v: Number(r[i + 1]) })); };
      function loadHist(id, hours) {
        const k = id + '|' + hours;
        if (!S.hist.has(k)) {
          const p = SC.api('/api/cydom/history?station=' + encodeURIComponent(id) + '&hours=' + hours);
          S.hist.set(k, p); p.catch(() => S.hist.delete(k));
        }
        return S.hist.get(k);
      }
      function selectStation(id, scroll) {
        S.sel = id; S.hist.clear();
        try { history_replace('#/weather/' + encodeURIComponent(id)); } catch (e) { /* the address stays as it is */ }
        drawTable(); drawDetail();
        if (scroll && window.matchMedia('(max-width: 1180px)').matches) detailCard.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      }
      const history_replace = (hash) => window.history.replaceState(null, '', hash);

      async function drawDetail() {
        const my = ++S.token;
        const p = S.points.find((x) => x.id === S.sel);
        if (!S.sel) {
          fill(detailCard, h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Station detail', 'Λεπτομέρειες σταθμού'))), h('div', { class: 'empty' }, T('Choose a station in the table to see its readings and history.', 'Επιλέξτε έναν σταθμό στον πίνακα για να δείτε τις μετρήσεις και το ιστορικό του.')));
          return;
        }
        const name = p ? p.name : nice(S.sel);
        const tm = p && p.time ? Date.parse(p.time) : null, old = isOld(tm), dist = p ? districtOf(p) : '';
        const stats = p ? [
          [T('Humidity', 'Υγρασία'), SC.num(p.hum, 0), '%'],
          [T('Wind 10 m', 'Άνεμος 10 m'), p.ws == null ? '–' : SC.num(p.ws), 'm/s' + (p.ws != null && p.wd != null ? ' ' + compass(p.wd) : '')],
          [T('Pressure', 'Πίεση'), SC.num(p.pmsl, 0), 'hPa'],
          [T('Rain 24 h', 'Βροχή 24 ω'), SC.num(p.rain24), 'mm'],
        ] : [];
        const big = h('div', { class: 'wx-d-big' }, h('span', { class: 'wx-bt' }, p ? SC.num(p.temp) : '–'), h('span', { class: 'wx-bu' }, '°C'), h('div', { class: 'wx-bd' }));
        const chipsBox = h('div'), chartBox = h('div', { class: 'wx-chart' }, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))), noteBox = h('p', { class: 'wx-hint wx-chart-note' });
        const rangeBtns = h('span', { class: 'wx-rng', role: 'group', 'aria-label': T('Period', 'Περίοδος') });
        const csvLink = h('a', { class: 'nm-btn', download: '', href: '#' }, SC.icon('download', 17), h('span'));
        fill(detailCard,
          h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Station detail', 'Λεπτομέρειες σταθμού'))),
          h('div', { class: 'wx-d-head' }, h('div', null, h('h2', { class: 'wx-d-name' }, name),
            h('p', { class: 'wx-sub' }, (dist ? dist + ' · ' : '') + (tm ? T('reading ' + hhmm(tm) + ', ' + SC.ago(tm), 'μέτρηση ' + hhmm(tm) + ', ' + SC.ago(tm)) : T('no current reading in the Met Office feed', 'καμία τρέχουσα μέτρηση στην πηγή της Υπηρεσίας')))),
            p ? h('span', { class: 'nm-badge ' + (old ? 'nm-badge--warn' : 'nm-badge--ok') }, old ? T('Old reading', 'Παλιά μέτρηση') : T('Up to date', 'Ενημερωμένη')) : null),
          big,
          p ? h('div', { class: 'wx-d-stats' }, stats.map(([k, v, u]) => h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, h('small', null, ' ' + u))))) : null,
          chipsBox,
          h('div', { class: 'wx-d-chart-h' }, h('b', { class: 'wx-chart-title' }), rangeBtns),
          chartBox, noteBox,
          h('div', { class: 'wx-d-btns' }, csvLink, h('a', { class: 'nm-btn nm-btn--primary', href: '#/map?station=' + encodeURIComponent(S.sel) }, SC.icon('pin', 17), T('Open on the map', 'Άνοιγμα στον χάρτη'))),
          p && p.obs && p.obs.length ? h('details', { class: 'wx-all' }, h('summary', null, T('All ' + p.obs.length + ' readings in the feed', 'Και οι ' + p.obs.length + ' μετρήσεις της πηγής')),
            h('div', { class: 'nm-table-wrap' }, h('table', { class: 'nm-table wx-table' }, h('tbody', null, p.obs.map((o) => h('tr', null, h('td', null, o.name), h('td', { class: 'n' }, SC.num(o.value, 2) + ' ' + (/celcius|celsius/i.test(o.unit) ? '°C' : o.unit || ''))))))))
            : null);
        if (!p) detailCard.querySelector('.wx-d-head .wx-sub').after(h('p', { class: 'wx-sub' }, T('This station is not in the latest feed, so only saved history can be shown.', 'Αυτός ο σταθμός δεν βρίσκεται στην πιο πρόσφατη πηγή, οπότε μπορεί να εμφανιστεί μόνο το αποθηκευμένο ιστορικό.')));
        // the numbers next to the big temperature: change since 06:00 local (or in the last 3 hours), and the 24 h range
        const drawBig = async () => {
          try {
            const s24 = await loadHist(S.sel, 24);
            if (my !== S.token) return;
            const tp = pointsOf(s24, 'temp');
            const bd = big.querySelector('.wx-bd');
            if (!tp.length) { bd.textContent = ''; return; }
            const last = tp[tp.length - 1];
            const lo = Math.min(...tp.map((q) => q.v)), hi = Math.max(...tp.map((q) => q.v));
            const lines = [];
            const lk = lt(last.t);
            const six = tp.find((q) => { const x = lt(q.t); return x.key === lk.key && x.h * 60 + x.m >= 360 && x.h * 60 + x.m <= 400; });
            if (six && lk.h * 60 + lk.m > 400 && last.t - six.t > HOUR) { const d = last.v - six.v; lines.push(T((d >= 0 ? 'Up ' : 'Down ') + SC.num(Math.abs(d)) + ' °C since 06:00', (d >= 0 ? 'Ανεβαίνει ' : 'Κατεβαίνει ') + SC.num(Math.abs(d)) + ' °C από τις 06:00'), h('br')); }
            else {
              const ref = tp.reduce((b, q) => (Math.abs(q.t - (last.t - 3 * HOUR)) < Math.abs(b.t - (last.t - 3 * HOUR)) ? q : b), tp[0]);
              if (last.t - ref.t > 2 * HOUR && last.t - ref.t < 4 * HOUR) { const d = last.v - ref.v; lines.push(T((d >= 0 ? 'Up ' : 'Down ') + SC.num(Math.abs(d)) + ' °C in the last 3 hours', (d >= 0 ? 'Ανεβαίνει ' : 'Κατεβαίνει ') + SC.num(Math.abs(d)) + ' °C τις τελευταίες 3 ώρες'), h('br')); }
            }
            lines.push(T('Last 24 h: low ', 'Τελευταίες 24 ώρες: χαμηλότερη '), h('b', null, SC.num(lo)), T(', high ', ', υψηλότερη '), h('b', null, SC.num(hi)));
            fill(bd, ...lines);
            if (!p) big.querySelector('.wx-bt').textContent = SC.num(last.v);
          } catch (e) { /* the big number alone is fine */ }
        };
        drawBig();
        const draw = async () => {
          fill(rangeBtns, [[24, T('24 h', '24 ώρες')], [168, T('7 days', '7 ημέρες')], [720, T('30 days', '30 ημέρες')]].map(([n, label]) => h('button', { type: 'button', class: n === S.hours ? 'on' : '', 'aria-pressed': String(n === S.hours), onclick: () => { S.hours = n; drawDetail(); } }, label)));
          csvLink.href = '/api/cydom/history.csv?station=' + encodeURIComponent(S.sel) + '&days=' + Math.ceil(S.hours / 24);
          csvLink.querySelector('span').textContent = T('Download CSV', 'Λήψη CSV');
          csvLink.title = T('All readings of this station for the last ' + (S.hours === 24 ? '24 hours' : S.hours / 24 + ' days'), 'Όλες οι μετρήσεις αυτού του σταθμού για ' + (S.hours === 24 ? 'τις τελευταίες 24 ώρες' : 'τις τελευταίες ' + S.hours / 24 + ' ημέρες'));
          try {
            const s = await loadHist(S.sel, S.hours);
            if (my !== S.token) return;
            const avail = KEYS.filter((k) => pointsOf(s, k[0]).length > 1);
            if (!avail.length) {
              fill(chipsBox);
              if (!p) { fill(chartBox, h('div', { class: 'empty' }, T('This station is not in the Met Office list and we have no saved readings for it. Pick a station from the table.', 'Αυτός ο σταθμός δεν υπάρχει στη λίστα της Μετεωρολογικής Υπηρεσίας και δεν έχουμε αποθηκευμένες μετρήσεις γι’ αυτόν. Επιλέξτε σταθμό από τον πίνακα.'))); noteBox.textContent = ''; detailCard.querySelector('.wx-chart-title').textContent = ''; return; }
              fill(chartBox, h('div', { class: 'empty' }, T('Not enough readings saved for this period yet. The server saves a reading every 10 minutes, so check back soon.', 'Δεν έχουν αποθηκευτεί αρκετές μετρήσεις για αυτή την περίοδο. Ο διακομιστής αποθηκεύει μία μέτρηση ανά 10 λεπτά, οπότε ελέγξτε ξανά σύντομα.')));
              noteBox.textContent = ''; detailCard.querySelector('.wx-chart-title').textContent = '';
              return;
            }
            if (!avail.some((k) => k[0] === S.key)) S.key = avail[0][0];
            const cur = KEYS.find((k) => k[0] === S.key) || [];
            const label = cur[1] || S.key;
            if (cur[3]) S.more = true;
            const main = avail.filter((k) => !k[3]), more = avail.filter((k) => k[3]);
            const chip = ([k, l]) => h('button', { type: 'button', class: 'wx-chip' + (k === S.key ? ' on' : ''), 'aria-pressed': String(k === S.key), onclick: () => { S.key = k; draw(); } }, l);
            fill(chipsBox, h('div', { class: 'wx-chips wx-detail-chips', role: 'group', 'aria-label': T('Reading to chart', 'Μέτρηση για το διάγραμμα') },
              main.map(chip),
              more.length ? h('button', { type: 'button', class: 'wx-chip wx-more', 'aria-expanded': String(S.more), 'aria-label': S.more ? T('Fewer readings', 'Λιγότερες μετρήσεις') : T('More readings', 'Περισσότερες μετρήσεις'), title: S.more ? T('Fewer readings', 'Λιγότερες μετρήσεις') : T('More readings: wind at 2 m, station pressure, direct sun, day high and low', 'Περισσότερες μετρήσεις: άνεμος στα 2 m, πίεση σταθμού, άμεσος ήλιος, μέγιστη και ελάχιστη ημέρας'), onclick: () => { S.more = !S.more; draw(); } }, S.more ? '−' : '+') : null,
              S.more ? more.map(chip) : null));
            let unit = (s.units[S.key] || {}).unit || '', f = 1;
            if (/^kn/i.test(unit)) { f = 0.514444; unit = 'm/s'; }
            let pts = pointsOf(s, S.key).map((q) => ({ t: q.t, v: q.v * f }));
            const all = pts;
            if (pts.length > 1500) { const st = Math.ceil(pts.length / 1200); pts = pts.filter((q, i) => i % st === 0 || i === pts.length - 1); }
            detailCard.querySelector('.wx-chart-title').textContent = label + (S.key === 'rain10' ? T(', per 10 min', ', ανά 10 λεπτά') : '') + ', ' + (S.hours === 24 ? T('last 24 hours', 'τελευταίες 24 ώρες') : T('last ' + S.hours / 24 + ' days', 'τελευταίες ' + S.hours / 24 + ' ημέρες'));
            const lastT = all[all.length - 1].t, endT = Math.max(Date.now(), lastT);
            const info = wxChart(chartBox, { pts, unit, dec: cur[2] == null ? 1 : cur[2], color: COLORS[S.key] || SCChart.COLORS[0], bars: S.key === 'rain10', zero: S.key === 'rain10' || S.key === 'dsr',
              t0: endT - S.hours * HOUR, t1: endT, w: Math.max(300, Math.round(chartBox.getBoundingClientRect().width) || 470), h: 236,
              aria: name + ', ' + label + ', ' + (S.hours === 24 ? T('last 24 hours', 'τελευταίες 24 ώρες') : T('last ' + S.hours / 24 + ' days', 'τελευταίες ' + S.hours / 24 + ' ημέρες')) + T('. Latest ', '. Τελευταία ') + SC.num(all[all.length - 1].v, cur[2] == null ? 1 : cur[2]) + ' ' + unit + T('. Use the left and right arrow keys to read other values.', '. Χρησιμοποιήστε τα βέλη αριστερά και δεξιά για να διαβάσετε άλλες τιμές.') });
            const bits = [T('Point at the chart to read a value. Where readings are missing, the line is left open and an amber band marks the time.', 'Στρέψτε τον δείκτη στο διάγραμμα για να διαβάσετε μια τιμή. Όπου λείπουν μετρήσεις, η γραμμή μένει ανοιχτή και μια κεχριμπαρί ζώνη σημειώνει την ώρα.')];
            if (info.gaps.length) bits.push(T(info.gaps.length + (info.gaps.length === 1 ? ' gap' : ' gaps') + ' in this period, the longest ' + fmtDur(Math.max(...info.gaps.map((b) => b.b - b.a))) + '.', info.gaps.length + (info.gaps.length === 1 ? ' κενό' : ' κενά') + ' στην περίοδο, το μεγαλύτερο ' + fmtDur(Math.max(...info.gaps.map((b) => b.b - b.a))) + '.'));
            if (isOld(lastT)) bits.push(T('The newest saved reading is from ' + when(lastT) + ' (' + SC.ago(lastT) + ').', 'Η νεότερη αποθηκευμένη μέτρηση είναι από ' + when(lastT) + ' (' + SC.ago(lastT) + ').'));
            if (S.key === 'rain10') { const sum = all.reduce((a, q) => a + q.v, 0); bits.push(T('Rain saved in this period: ' + SC.num(sum) + ' mm (the sum of the 10-minute readings we hold).', 'Βροχή που αποθηκεύτηκε στην περίοδο: ' + SC.num(sum) + ' mm (άθροισμα των μετρήσεων 10 λεπτών που διαθέτουμε).')); }
            if (/^kn/i.test((s.units[S.key] || {}).unit || '')) bits.push(T('The Department publishes this wind in knots; it is shown here in m/s.', 'Το Τμήμα δημοσιεύει αυτόν τον άνεμο σε κόμβους· εδώ εμφανίζεται σε m/s.'));
            noteBox.textContent = bits.join(' ');
            noteBox.classList.toggle('old', isOld(lastT));
          } catch (e) {
            if (my !== S.token) return;
            fill(chartBox, errBox('the history', 'του ιστορικού', e, () => { S.hist.clear(); draw(); }));
          }
        };
        draw();
      }

      const stCard = h('div', { class: 'nm-card wx-br nm-table-card wx-stcard' },
        h('div', { class: 'wx-ch' }, titleEl, h('span', { class: 'wx-sp' }), h('span', { class: 'wx-sub' }, T('Saved about every 10 minutes', 'Αποθηκεύονται περίπου ανά 10 λεπτά'))),
        h('div', { class: 'wx-tools' }, h('label', { class: 'wx-search' }, SC.icon('search', 17), search),
          h('a', { class: 'wx-lnk wx-csv', href: '/api/cydom/history.csv?days=1', download: '' }, T('All stations, 24 h (CSV)', 'Όλοι οι σταθμοί, 24 ώρες (CSV)'))),
        countEl,
        stState, tableWrap,
        h('p', { class: 'wx-legend' }, h('i'), T('Amber means the newest reading is more than 3 hours old. Click a row to see its history.', 'Το κεχριμπαρί σημαίνει ότι η νεότερη μέτρηση είναι παλαιότερη από 3 ώρες. Πατήστε μια γραμμή για να δείτε το ιστορικό.')),
        h('p', { class: 'wx-hint wx-histnote' }, h('a', { class: 'wx-lnk', href: '/api/cydom/history.csv?days=7', download: '' }, T('All stations, 7 days (CSV)', 'Όλοι οι σταθμοί, 7 ημέρες (CSV)'))),
        histNote);
      fill(stState, h('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      if (ctx.args && ctx.args[0]) { S.sel = ctx.args[0]; fill(detailCard, h('div', { class: 'wx-ch' }, h('span', { class: 'kpi-label' }, T('Station detail', 'Λεπτομέρειες σταθμού'))), h('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); } else drawDetail();
      root.append(sec('stations', h('div', { class: 'wx-st-grid' }, stCard, detailCard)));
      const src = h('p', { class: 'wx-src' }, T('Source: Cyprus Department of Meteorology, ', 'Πηγή: Τμήμα Μετεωρολογίας Κύπρου, '), h('a', { class: 'wx-lnk', href: 'https://www.dom.org.cy', target: '_blank', rel: 'noopener' }, 'dom.org.cy'),
        T('. Weather data copyright The Cyprus Department of Meteorology', '. Τα μετεωρολογικά δεδομένα ανήκουν στο Τμήμα Μετεωρολογίας Κύπρου'),
        T('. We keep our own copy of each reading so the charts can show history. Check the Department’s terms before using the data outside a classroom.', '. Κρατάμε δικό μας αντίγραφο κάθε μέτρησης ώστε τα διαγράμματα να δείχνουν ιστορικό. Ελέγξτε τους όρους του Τμήματος πριν χρησιμοποιήσετε τα δεδομένα εκτός τάξης.'));
      root.append(src);

      /* ---------- start ---------- */
      const deepLink = Boolean(ctx.args && ctx.args[0]);   // only a station address scrolls down; the default station must not
      (async () => {
        await loadStations(false);
        if (deepLink && S.sel) {
          setPill('stations');
          setTimeout(() => { if (alive) secEl.stations.scrollIntoView({ behavior: 'auto', block: 'start' }); }, 60);
        }
      })();
      loadTrends(); loadInfo();
      every(() => loadStations(true), 300000);
      every(() => { reloadWarnings(true); }, 300000);
      every(loadTrends, 600000);
      setPill(ctx.args && ctx.args[0] ? 'stations' : 'warnings');

      // the pill follows the section in view
      let observer = null;
      if ('IntersectionObserver' in window) {
        const visible = new Map();
        observer = new IntersectionObserver((entries) => {
          entries.forEach((e) => visible.set(e.target.id.replace('wx-', ''), e.isIntersecting));
          const first = SECTIONS.map((x) => x[0]).find((id) => visible.get(id));
          if (first) setPill(first);
        }, { rootMargin: '-25% 0px -55% 0px' });
        SECTIONS.forEach(([id]) => secEl[id] && observer.observe(secEl[id]));
      }

      return () => { alive = false; timers.forEach(clearInterval); if (observer) observer.disconnect(); };
    },
  });
})();
