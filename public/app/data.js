'use strict';
/* Data screens: home, vehicles with history charts, Met Office stations, and the embedded map and 3D island. */
(function () {
  const { h, api, fmt } = App;
  const GPS = ['4197', '4198'];
  const T_ID = '4097', H_ID = '4098', CO2_ID = '4100';

  /* ---------- data cache ---------- */

  const D = (App.data = { cfg: null, devices: [], latest: {}, at: 0, cydom: null, cydomAt: 0 });
  let loading = null;
  D.load = async function (force) {
    if (!force && Date.now() - D.at < 45000 && D.cfg) return D;
    if (loading) return loading;
    loading = (async () => {
      try {
        const [cfg, devices, latest] = await Promise.all([api('/api/config'), api('/api/devices'), api('/api/latest')]);
        Object.assign(D, { cfg, devices, latest, at: Date.now() });
      } finally { loading = null; }
      return D;
    })();
    return loading;
  };
  D.met = async function () {
    if (D.cydom && Date.now() - D.cydomAt < 300000) return D.cydom;
    D.cydom = await api('/api/cydom'); D.cydomAt = Date.now();
    return D.cydom;
  };
  const nameOf = (m) => (D.cfg && D.cfg.names[m] ? D.cfg.names[m][0] : 'Measurement ' + m);
  const unitOf = (m) => (D.cfg && D.cfg.names[m] ? D.cfg.names[m][1] : '');
  const value = (eui, mid) => { const x = D.latest[eui] && D.latest[eui][mid]; return x && isFinite(Number(x.v)) ? Number(x.v) : null; };
  const readings = (eui) => Object.keys(D.latest[eui] || {}).filter((m) => !GPS.includes(m));
  const newest = (eui) => Math.max(0, ...Object.values(D.latest[eui] || {}).map((x) => App.toMs(x.t)).filter((t) => isFinite(t)));
  const unitText = (u) => (u === '°C' ? ' °C' : u ? ' ' + u : '');
  App.dataHelpers = { nameOf, unitOf, value };

  function matches(d, school) {
    if (!school || !school.match) return false;
    const text = `${d.group || ''} ${d.name || ''}`.toLowerCase();
    return school.match.split(',').map((m) => m.trim()).filter(Boolean).some((m) => text.includes(m));
  }
  const dist = (a, b) => {
    const R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
    const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };

  function airLevel(co2) {
    if (co2 == null) return null;
    if (co2 < 600) return { cls: '', text: 'Fresh air' };
    if (co2 < 1000) return { cls: 'fair', text: 'Fair' };
    if (co2 < 1500) return { cls: 'stuffy', text: 'Stuffy' };
    return { cls: 'poor', text: 'Poor ventilation' };
  }

  function vcard(d, extra) {
    const t = value(d.eui, T_ID), hum = value(d.eui, H_ID), co2 = value(d.eui, CO2_ID);
    const level = airLevel(co2);
    const seen = newest(d.eui) || App.toMs(d.lastSeen);
    const rest = readings(d.eui).filter((m) => ![T_ID, H_ID, CO2_ID].includes(m)).slice(0, 2);
    const main = t != null ? [fmt.num(t), '°C'] : (() => { const m = readings(d.eui)[0]; return m ? [fmt.num(value(d.eui, m)), unitOf(m)] : ['–', '']; })();
    return h('a', { class: 'vcard', href: '#/vehicle/' + encodeURIComponent(d.eui) },
      h('div', { class: 'row1' }, h('span', { class: 'dot ' + (d.online ? 'live' : 'off'), title: d.online ? 'Online' : 'Offline' }), h('span', { class: 'name' }, d.name), extra || null, h('span', { class: 'when' }, d.online ? fmt.ago(seen) : 'offline · ' + fmt.ago(seen))),
      h('div', { class: 'main' },
        h('div', { class: 'big num' }, main[0], h('small', null, main[1])),
        h('div', { class: 'side' },
          hum != null ? h('span', null, 'Humidity ', h('b', null, fmt.num(hum, 0), ' %')) : null,
          co2 != null ? h('span', null, 'CO₂ ', h('b', null, fmt.num(co2, 0), ' ppm')) : null,
          rest.map((m) => h('span', null, nameOf(m), ' ', h('b', null, fmt.num(value(d.eui, m)), unitText(unitOf(m)))) ),
          d.battery != null ? h('span', null, 'Battery ', h('b', null, d.battery, ' %')) : null)),
      level ? [h('div', { class: 'air ' + level.cls, role: 'img', 'aria-label': 'Air: ' + level.text }, h('i', { style: `width:${Math.max(6, Math.min(100, ((co2 - 400) / 1600) * 100))}%` })), h('div', { class: 'airtxt' }, h('span', null, level.text), h('span', null, 'CO₂ scale 400 to 2000 ppm'))] : null);
  }

  /* ---------- home ---------- */

  App.route(/^\/home$/, async (view) => {
    const me = App.state.me;
    const page = h('div', { class: 'page' }, h('div', { class: 'hello' }, h('h1', null, 'Hi ', me.name), h('p', null, [me.school ? me.school.name : 'All schools', me.team ? ' · ' + me.team.name : ''].join(''))));
    view.append(page);
    const body = h('div', null, h('p', { class: 'muted' }, 'Loading the latest readings…'));
    page.append(body);
    const redraw = async (force) => {
      try { await D.load(force); } catch (e) { body.replaceChildren(h('p', { class: 'error' }, 'Could not load the sensor data. ' + e.message)); return; }
      let met = null;
      try { met = await D.met(); } catch (e) { /* the weather strip is optional */ }
      const school = me.school;
      const mine = D.devices.filter((d) => matches(d, school));
      const teamDev = me.team && me.team.device ? D.devices.find((d) => d.eui === me.team.device) : null;
      const others = D.devices.filter((d) => !mine.includes(d) && d !== teamDev);
      const ownList = school && mine.length ? mine.filter((d) => d !== teamDev) : [];
      let strip = null;
      if (met && met.points && met.points.length) {
        const here = school && school.lat != null ? [school.lat, school.lng] : null;
        const st = here ? met.points.map((p) => ({ p, d: dist(here, [p.lat, p.lng]) })).sort((a, b) => a.d - b.d)[0] : { p: met.points[0], d: 0 };
        const p = st.p;
        strip = h('a', { class: 'metstrip', href: '#/met/' + encodeURIComponent(p.id) },
          h('div', { class: 'big num' }, p.temp != null ? fmt.num(p.temp) + ' °C' : '–'),
          h('div', { class: 'rest' }, h('b', null, p.name + ' · Met Office'), [p.hum != null ? `Humidity ${fmt.num(p.hum, 0)} %` : '', p.ws != null ? ` · Wind ${fmt.num(p.ws)} m/s` : '', p.time ? ` · ${fmt.ago(Date.parse(p.time))}` : ''].join('')),
          h('span', { 'aria-hidden': 'true' }, '›'));
      }
      const others2 = h('div', { class: 'hidden' }, others.map((d) => vcard(d, h('span', { class: 'tag' }, d.group))));
      const toggle = h('button', { class: 'btn small', onclick: () => { others2.classList.toggle('hidden'); toggle.textContent = others2.classList.contains('hidden') ? `Show other vehicles (${others.length})` : 'Hide other vehicles'; } }, `Show other vehicles (${others.length})`);
      body.replaceChildren(
        strip,
        h('div', { class: 'tiles' },
          h('a', { class: 'tile', href: '#/map' }, App.icon('map'), 'Map'),
          h('a', { class: 'tile', href: '#/3d' }, App.icon('cube'), '3D island'),
          h('a', { class: 'tile', href: '#/met' }, App.icon('sky'), 'Met Office'),
          h('a', { class: 'tile', href: '#/vehicles' }, App.icon('chart'), 'All data')),
        teamDev ? [h('div', { class: 'sechead' }, h('h2', null, 'Your team\'s vehicle')), vcard(teamDev, h('span', { class: 'tag team' }, me.team.name))] : null,
        school ? h('div', { class: 'sechead' }, h('h2', null, school.short + ' vehicles')) : h('div', { class: 'sechead' }, h('h2', null, 'All vehicles')),
        school ? (ownList.length ? ownList.map((d) => vcard(d)) : (teamDev ? null : h('div', { class: 'empty' }, mine.length ? '' : 'No vehicle is linked to your school yet. A teacher can set this up. Meanwhile, look at the other schools below.'))) : D.devices.map((d) => vcard(d, h('span', { class: 'tag' }, d.group))),
        school && others.length ? [h('div', { style: 'margin:14px 0' }, toggle), others2] : null,
        h('p', { class: 'muted small', style: 'margin-top:18px' }, D.cfg && D.cfg.demo ? 'This is demo data, not real vehicles.' : 'Updated ' + fmt.clock(D.at) + '. Sensors report every few minutes.'));
    };
    await redraw(false);
    const timer = setInterval(() => redraw(true), 60000);
    App.cleanup(() => clearInterval(timer));
  }, { tab: 'home' });

  /* ---------- all vehicles ---------- */

  App.route(/^\/vehicles$/, async (view) => {
    App.setTop({ title: 'All vehicles', back: '/home' });
    const page = h('div', { class: 'page' });
    view.append(page);
    await D.load(false);
    const groups = {};
    D.devices.forEach((d) => (groups[d.group || 'Other'] = groups[d.group || 'Other'] || []).push(d));
    page.append(Object.keys(groups).sort().map((g) => [h('div', { class: 'sechead' }, h('h2', null, App.schoolDot(g), ' ', g)), groups[g].map((d) => vcard(d))]));
    if (!D.devices.length) page.append(h('div', { class: 'empty' }, 'No vehicles found.'));
  }, { tab: 'home' });

  /* ---------- charts ---------- */

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function chart(canvas, pts, opts, hover) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    const ink2 = css('--ink2'), line = css('--line'), sea = css('--sea');
    if (pts.length < 2) { g.fillStyle = ink2; g.font = '14px system-ui'; g.textAlign = 'center'; g.fillText('Not enough data in this period yet.', w / 2, hgt / 2); return null; }
    const L = 42, R = 10, Tp = 12, B = 24;
    let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (w - L - R);
    const Y = (v) => Tp + (1 - (v - lo) / (hi - lo)) * (hgt - Tp - B);
    g.strokeStyle = line; g.lineWidth = 1; g.fillStyle = ink2; g.font = '11px system-ui'; g.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const v = lo + ((hi - lo) * i) / 3, y = Y(v);
      g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
      g.fillText(fmt.num(v, hi - lo < 5 ? 1 : 0), L - 6, y + 4);
    }
    g.textAlign = 'center';
    const span = t1 - t0, dayMode = span > 2 * 86400000;
    for (let i = 0; i <= 3; i++) { const t = t0 + (span * i) / 3; g.fillText(dayMode ? fmt.day(t) : fmt.clock(t), Math.min(w - 24, Math.max(L + 16, X(t))), hgt - 7); }
    g.strokeStyle = sea; g.lineWidth = 2.2; g.lineJoin = 'round';
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.t), Y(p.v)) : g.moveTo(X(p.t), Y(p.v)))); g.stroke();
    if (hover != null) {
      const p = pts[hover];
      g.strokeStyle = ink2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(p.t), Tp); g.lineTo(X(p.t), hgt - B); g.stroke(); g.setLineDash([]);
      g.fillStyle = sea; g.beginPath(); g.arc(X(p.t), Y(p.v), 5, 0, 7); g.fill();
    }
    return { X, L, R, w, t0, t1 };
  }
  function chartBox(unit) {
    const canvas = h('canvas', { role: 'img', 'aria-label': 'Line chart of the readings' });
    const note = h('div', { class: 'note' }, 'Touch the chart to read a value.');
    const box = h('div', { class: 'chartbox' }, canvas, note);
    let pts = [], geo = null;
    const draw = (hover) => { geo = chart(canvas, pts, {}, hover); };
    const pick = (e) => {
      if (!geo || pts.length < 2) return;
      const r = canvas.getBoundingClientRect();
      const t = geo.t0 + ((e.clientX - r.left - geo.L) / (geo.w - geo.L - geo.R)) * (geo.t1 - geo.t0);
      let best = 0;
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].t - t) < Math.abs(pts[best].t - t)) best = i;
      draw(best);
      note.textContent = `${fmt.num(pts[best].v, 2)}${unit()} · ${fmt.full(pts[best].t)}`;
    };
    canvas.addEventListener('pointerdown', pick); canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') pick(e); });
    const onResize = () => draw();
    window.addEventListener('resize', onResize); App.cleanup(() => window.removeEventListener('resize', onResize));
    return {
      el: box,
      set(p, text) {
        pts = p; draw();
        if (p.length > 1) { const vs = p.map((x) => x.v); note.textContent = text || `Lowest ${fmt.num(Math.min(...vs), 1)}${unit()} · highest ${fmt.num(Math.max(...vs), 1)}${unit()}. Touch the chart to read a value.`; }
        else note.textContent = text || '';
      },
    };
  }

  /* ---------- one vehicle ---------- */

  App.route(/^\/vehicle\/([^/]+)$/, async (view, [eui]) => {
    await D.load(false);
    const d = D.devices.find((x) => x.eui === eui);
    App.setTop({ title: d ? d.name : 'Vehicle', back: '/home' });
    if (!d) { view.append(h('div', { class: 'page empty' }, 'This vehicle was not found.')); return; }
    const mids = d.measurements.filter((m) => !GPS.includes(m));
    let mid = mids.includes(T_ID) ? T_ID : mids[0], days = 1;
    const box = chartBox(() => unitText(unitOf(mid)));
    const chips = h('div', { class: 'chips' }), ranges = h('div', { class: 'chips' });
    const seen = newest(eui) || App.toMs(d.lastSeen);
    const lat = value(eui, '4198'), lng = value(eui, '4197');
    const draw = async () => {
      chips.replaceChildren(mids.map((m) => h('button', { class: 'chip' + (m === mid ? ' on' : ''), onclick: () => { mid = m; draw(); } }, nameOf(m))));
      ranges.replaceChildren([[1, '24 hours'], [7, '7 days'], [30, '30 days']].map(([n, label]) => h('button', { class: 'chip' + (n === days ? ' on' : ''), onclick: () => { days = n; draw(); } }, label)));
      if (!mid) { box.set([], 'This vehicle has no sensor readings.'); return; }
      box.set([], 'Loading…');
      try {
        const pts = (await api(`/api/series?eui=${encodeURIComponent(eui)}&mid=${mid}&days=${days}`)).map((p) => ({ t: App.toMs(p.t), v: Number(p.v) })).filter((p) => isFinite(p.t) && isFinite(p.v));
        box.set(pts);
      } catch (e) { box.set([], 'Could not load the history. ' + e.message); }
    };
    view.append(h('div', { class: 'page' },
      h('p', null, h('span', { class: 'dot ' + (d.online ? 'live' : 'off') }), ' ', d.online ? 'Online' : 'Offline', ' · last data ', fmt.ago(seen), d.battery != null ? ` · battery ${d.battery} %` : '', d.group ? h('span', { class: 'tag', style: 'margin-left:8px' }, d.group) : null),
      h('div', { class: 'kv' }, readings(eui).map((m) => h('div', null, h('div', { class: 'k' }, nameOf(m)), h('div', { class: 'v num' }, fmt.num(value(eui, m), m === CO2_ID ? 0 : 1), h('small', { class: 'muted' }, unitText(unitOf(m))))))),
      lat != null && lng != null ? h('p', { class: 'muted small' }, `Position ${fmt.num(lat, 4)}, ${fmt.num(lng, 4)} · `, h('a', { href: '#/map' }, 'open the map')) : null,
      h('h2', { style: 'margin:16px 0 8px' }, 'History'), chips, ranges, box.el,
      h('p', { class: 'muted small' }, 'Sensors in a moving vehicle measure the air around the vehicle. Sun, windows and passengers change the numbers. The Ask tab can help you read them.')));
    await draw();
  }, { tab: 'home' });

  /* ---------- Met Office ---------- */

  App.route(/^\/met$/, async (view) => {
    App.setTop({ title: 'Met Office', back: '/home' });
    const me = App.state.me;
    const page = h('div', { class: 'page' });
    view.append(page);
    const warn = h('div', { class: 'card' }, h('b', null, 'Weather warnings'), h('p', { class: 'muted small', style: 'margin:4px 0 0' }, 'Checking…'));
    page.append(warn);
    api('/api/dom/page?name=warnings').then((p) => {
      const t = String(p.text || '').replace(/\s+/g, ' ').trim();
      const none = !t || t.length < 40;
      warn.replaceChildren(h('b', null, 'Weather warnings'), h('p', { class: none ? 'muted small' : '', style: 'margin:4px 0 0' }, none ? 'No weather warnings are in force right now.' : t.slice(0, 600)), h('p', { class: 'muted small', style: 'margin:4px 0 0' }, 'Source: Cyprus Department of Meteorology'));
    }).catch(() => warn.replaceChildren(h('b', null, 'Weather warnings'), h('p', { class: 'muted small', style: 'margin:4px 0 0' }, 'Could not check the warnings page.')));
    let met;
    try { met = await D.met(); } catch (e) { page.append(h('p', { class: 'error' }, 'Could not load the stations. ' + e.message)); return; }
    const here = me.school && me.school.lat != null ? [me.school.lat, me.school.lng] : null;
    const all = met.points.map((p) => ({ p, d: here ? dist(here, [p.lat, p.lng]) : null })).sort((a, b) => (here ? a.d - b.d : a.p.name.localeCompare(b.p.name)));
    const q = h('input', { type: 'search', placeholder: `Search ${all.length} stations`, 'aria-label': 'Search stations' });
    const list = h('div', { class: 'list' });
    let showAll = false;
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      let items = s ? all.filter((x) => x.p.name.toLowerCase().includes(s)) : showAll ? all : all.slice(0, 8);
      list.replaceChildren(items.map(({ p, d }) => h('a', { class: 'item', href: '#/met/' + encodeURIComponent(p.id) },
        h('div', { class: 'grow' }, h('b', null, p.name), h('span', null, [d != null ? Math.round(d) + ' km away' : '', p.hum != null ? `humidity ${fmt.num(p.hum, 0)} %` : '', p.ws != null ? `wind ${fmt.num(p.ws)} m/s` : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'val num' }, p.temp != null ? fmt.num(p.temp) + ' °C' : '–'))));
      if (!items.length) list.replaceChildren(h('div', { class: 'empty' }, 'No station with that name.'));
      more.classList.toggle('hidden', !!s || showAll);
    };
    const more = h('button', { class: 'btn small', onclick: () => { showAll = true; draw(); } }, `Show all ${all.length} stations`);
    q.addEventListener('input', draw);
    page.append(h('div', { class: 'sechead' }, h('h2', null, here ? 'Stations near ' + me.school.short : 'Stations')), h('div', { style: 'margin-bottom:10px' }, q), list, more,
      h('p', { class: 'muted small', style: 'margin-top:16px' }, `Official automatic stations of the Cyprus Department of Meteorology. Updated about every 10 minutes. ${met.copyright || ''}`));
    draw();
  }, { tab: 'home' });

  App.route(/^\/met\/([^/]+)$/, async (view, [id]) => {
    App.setTop({ title: 'Station', back: '/met' });
    const page = h('div', { class: 'page' });
    view.append(page);
    let met;
    try { met = await D.met(); } catch (e) { page.append(h('p', { class: 'error' }, e.message)); return; }
    const p = met.points.find((x) => x.id === id);
    if (!p) { page.append(h('div', { class: 'empty' }, 'This station was not found.')); return; }
    App.setTop({ title: p.name, back: '/met' });
    const cells = [['Temperature', p.temp, '°C'], ['Humidity', p.hum, '%'], ['Wind', p.ws, 'm/s'], ['Rain, 24 h', p.rain24, 'mm'], ['Pressure', p.pmsl, 'hPa'], ['Today max / min', p.tmax != null ? fmt.num(p.tmax) + ' / ' + fmt.num(p.tmin) : null, '°C']];
    let key = 'temp', hours = 24, series = null;
    const box = chartBox(() => (series && series.units[key] && series.units[key].unit ? ' ' + series.units[key].unit : ''));
    const chips = h('div', { class: 'chips' }), ranges = h('div', { class: 'chips' });
    const csv = h('a', { class: 'btn small', download: '', href: `/api/cydom/history.csv?station=${encodeURIComponent(id)}&days=1` }, 'Download CSV');
    const draw = async () => {
      ranges.replaceChildren([[24, '24 hours'], [168, '7 days'], [720, '30 days']].map(([n, label]) => h('button', { class: 'chip' + (n === hours ? ' on' : ''), onclick: () => { hours = n; draw(); } }, label)));
      csv.href = `/api/cydom/history.csv?station=${encodeURIComponent(id)}&days=${Math.ceil(hours / 24)}`;
      box.set([], 'Loading…');
      try {
        series = await api(`/api/cydom/history?station=${encodeURIComponent(id)}&hours=${hours}`);
        const keys = series.keys.filter((k) => ['temp', 'hum', 'ws10', 'ws2', 'pmsl', 'rain10', 'dsr'].includes(k));
        if (!keys.includes(key)) key = keys[0];
        chips.replaceChildren(keys.map((k) => h('button', { class: 'chip' + (k === key ? ' on' : ''), onclick: () => { key = k; draw(); } }, (series.units[k] && series.units[k].name) || k)));
        const i = series.keys.indexOf(key);
        const pts = series.rows.filter((r) => r[i + 1] != null).map((r) => ({ t: r[0], v: Number(r[i + 1]) }));
        box.set(pts, pts.length < 2 ? 'History is saved by this server every 10 minutes. It has just started for this period.' : null);
      } catch (e) { box.set([], 'Could not load the history. ' + e.message); }
    };
    page.append(
      h('p', { class: 'muted' }, p.time ? 'Reading from ' + fmt.full(Date.parse(p.time)) + ' (' + fmt.ago(Date.parse(p.time)) + ')' : ''),
      h('div', { class: 'kv' }, cells.filter((c) => c[1] != null).map(([k, v, u]) => h('div', null, h('div', { class: 'k' }, k), h('div', { class: 'v num' }, typeof v === 'number' ? fmt.num(v) : v, h('small', { class: 'muted' }, ' ' + u))))),
      h('h2', { style: 'margin:16px 0 8px' }, 'History'), chips, ranges, box.el, h('div', null, csv),
      h('p', { class: 'muted small', style: 'margin-top:14px' }, 'Compare this station with the vehicle sensors from the same hours. A big difference often means sun on the vehicle or an open window. ' + (met.copyright || '')));
    await draw();
  }, { tab: 'home' });

  /* ---------- embedded map and 3D ---------- */

  const embed = (title, src) => (view) => {
    App.setTop({ title, back: '/home' });
    const frame = h('iframe', { class: 'embed', src, title, allow: 'fullscreen' });
    view.append(frame);
  };
  App.route(/^\/map$/, embed('Map', '/map.html?embed=1'), { tab: 'home' });
  App.route(/^\/3d$/, embed('3D island', '/3d.html?embed=1'), { tab: 'home' });
})();
