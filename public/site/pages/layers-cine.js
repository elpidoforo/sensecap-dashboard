/*
  Data layers, the "Data core" view (used by pages/layers.js, after layers-day.js): SC.layersLive.cine(host, api).
  The cinematic Cyprus scene of the owner's Nemesis project, fed with this site's live numbers. The engine (the orb, the island,
  the flow lines, the two meters) is pages/layers-cine-gl.js; this file builds the model and the text panels over the scene.
    - left (on a phone: top): the layers that are answering now, with how many readings each gives and when it last spoke
    - right (on a phone: bottom): the four cities and two other views. Press one to open it.
    - every few seconds one real reading travels from its layer into the core and out to its city, and is named in the amber
      box and in the line at the bottom
    - between readings the amber box shows what changed most in the last hour of the saved day
    - "Readings in" adds up the readings of every layer; "Sources agree" counts the comparisons (the rivers) that agree
  Three parts repeat: collect, compare, deliver. Data: /layers/api/live (given by the page) and /layers/api/replay.
  The map is decoration: no number is placed on a place and no vehicle position is used.
  With reduced motion one still picture is drawn and the pause button is hidden. Without WebGL a short note is shown instead.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const nm = (l) => (isEl() && l.nameEl) || l.name;
  const nf = (n) => Number(n).toLocaleString(isEl() ? 'el-GR' : 'en-GB');
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−').replace('.', isEl() ? ',' : '.');
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isLive = (l) => l.state === 'live' || l.state === 'late';
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const VAR = { temperature: ['temperature', 'θερμοκρασία'], relative_humidity: ['humidity', 'υγρασία'], wind_speed: ['wind', 'άνεμος'], wind_direction: ['wind direction', 'κατεύθυνση ανέμου'], pressure: ['pressure', 'πίεση'], co2: ['CO₂', 'CO₂'], pm25: ['fine particles', 'λεπτά σωματίδια'], pm10: ['coarse particles', 'χονδρά σωματίδια'], sea_surface_temperature: ['sea temperature', 'θερμοκρασία θάλασσας'], no2: ['NO₂', 'NO₂'], o3: ['ozone', 'όζον'], wave_height: ['waves', 'κύματα'], uv_index: ['UV', 'UV'] };
  const MEAS = { air: ['outdoor air', 'αέρας έξω', 1], wind: ['wind', 'άνεμος', 1], sea: ['sea', 'θάλασσα', 0.5], own: ['our sensors', 'οι αισθητήρες μας', 0] };
  const BEAT = () => [[T('collect', 'συλλογή'), T('Every layer reports', 'Κάθε στρώμα στέλνει')], [T('compare', 'σύγκριση'), T('Sources are checked against each other', 'Οι πηγές ελέγχονται μεταξύ τους')], [T('deliver', 'παράδοση'), T('Numbers reach the four cities', 'Οι αριθμοί φτάνουν στις τέσσερις πόλεις')]];
  const BEAT_S = 8, EVENT_S = 5.2, HOLD_S = 2.6, TOPIC_S = 2.6, NARROW = 620, HOUR = 3600000;
  const hasGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };
  const ago = (t) => { if (!t) return T('no time given', 'χωρίς ώρα'); const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? T('just now', 'μόλις τώρα') : m < 60 ? T(m + ' min ago', 'πριν ' + m + ' λ.') : m < 1440 ? T(Math.round(m / 60) + ' h ago', 'πριν ' + Math.round(m / 60) + ' ώ.') : T(Math.round(m / 1440) + ' d ago', 'πριν ' + Math.round(m / 1440) + ' ημ.'); };

  // ---------- the model: everything the scene shows, from the live answer and the saved day ----------
  function build(live, replay) {
    const cityIds = Object.keys(live.cities || {}), cname = (c) => (CITY[c] ? CITY[c][isEl() ? 1 : 0] : live.cities[c].name);
    const per = {};   // layer id -> { n, cities }
    let readings = 0;
    cityIds.forEach((c) => (live.cities[c].rows || []).forEach((r) => { if (r.stale) return; readings++; const p = per[r.source] || (per[r.source] = { n: 0, cities: new Set() }); p.n++; p.cities.add(c); }));
    const withRows = (live.layers || []).filter((l) => isLive(l) && per[l.id]);
    const top = withRows.slice().sort((a, b) => per[b.id].n - per[a.id].n || a.id.localeCompare(b.id)).slice(0, 7);
    const sources = top.filter((l) => l.group === 'own').concat(top.filter((l) => l.group !== 'own')).map((l) => ({ id: l.id, n: nm(l), own: l.group === 'own', late: l.state === 'late', total: per[l.id].n, cities: per[l.id].cities.size, lastAt: l.lastAt || null, age: l.lastAt ? Math.max(0, (Date.now() - l.lastAt) / 86400000) : null }));
    let agree = 0, differ = 0;
    (live.rivers || []).forEach((r) => Object.keys(r.cities || {}).forEach((c) => { const s = r.cities[c].state; if (s === 'agree') agree++; else if (s === 'differ') differ++; }));
    const outputs = cityIds.map((c) => ({ kind: 'city', id: c, n: cname(c), sub: T('open', 'άνοιγμα') }))
      .concat([{ kind: 'view', id: 'compare', n: T('Compare the sources', 'Σύγκριση πηγών'), sub: T('open', 'άνοιγμα') }, { kind: 'view', id: 'day', n: T('Replay the day', 'Η μέρα ξανά'), sub: T('open', 'άνοιγμα') }]);
    // one event per fresh reading, the cities taking turns
    const lists = cityIds.map((c, ci) => (live.cities[c].rows || []).filter((r) => !r.stale && r.value != null).map((r) => {
      const l = (live.layers || []).find((x) => x.id === r.source), v = VAR[r.variable];
      return { id: c + '|' + r.source + '|' + r.variable, src: sources.findIndex((s) => s.id === r.source), route: ci, city: cname(c), who: l ? nm(l) : r.source, title: cname(c) + ' · ' + (v ? v[isEl() ? 1 : 0] : String(r.variable).replace(/_/g, ' ')) + ' ' + num(r.value) + (r.unit ? ' ' + r.unit : '') };
    }));
    const events = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) lists.forEach((l) => { if (i < l.length) events.push(l[i]); });
    // what changed most in the last hour of the saved day
    const topics = [], spark = [];
    if (replay && replay.times && replay.times.length > 2) {
      const tt = replay.times, last = tt.length - 1;
      let j = last; while (j > 0 && tt[last] - tt[j] < HOUR) j--;
      if (tt[last] - tt[j] >= HOUR / 2) cityIds.forEach((c) => Object.keys(MEAS).forEach((k) => {
        const s = replay.cities[c] && replay.cities[c][k]; if (!s) return;
        const b = s.values[last], a = s.values[j]; if (a == null || b == null) return;
        const d = b - a, scale = MEAS[k][2] || (s.variable === 'co2' ? 60 : 1), unit = s.unit ? ' ' + s.unit : '';
        if (Math.abs(d) < scale * 0.05) return;
        topics.push({ title: cname(c) + ' · ' + T(MEAS[k][0], MEAS[k][1]), em: (d > 0 ? '+' : '−') + num(Math.abs(d)) + unit, down: d < 0, sub: T('from ', 'από ') + num(a) + T(' to ', ' σε ') + num(b) + unit, mag: Math.abs(d) / scale });
      }));
      topics.sort((x, y) => y.mag - x.mag);
      const step = Math.max(1, Math.ceil(tt.length / 48));
      for (let i = 0; i < tt.length; i += step) { const v = cityIds.map((c) => { const s = replay.cities[c] && replay.cities[c].air; return s ? s.values[i] : null; }).filter((x) => x != null); if (v.length) spark.push(v.reduce((p, q) => p + q, 0) / v.length); }
    }
    return { plate: T('ATHENA', 'ΑΘΗΝΑ'), at: live.at, fresh: Date.now() - live.at < 180000, sources, outputs, events, topics: topics.slice(0, 6), spark,
      gold: topics.length ? 0.6 + Math.min(0.6, topics[0].mag * 0.2) : 0.35,
      totals: { readings, layers: withRows.length, agree, differ, checks: agree + differ } };
  }
  const sig = (m) => JSON.stringify([m.fresh, m.totals, m.sources.map((s) => [s.id, s.total, s.cities, s.late, s.lastAt]), m.outputs.length, m.topics.map((t) => t.title + t.em), m.spark.length]);

  // ---------- the text over the scene ----------
  function mountHud(stage, model, api) {
    const el = h('div', { class: 'cn-hud' }); stage.append(el);
    let M = model, cache = null, dead = false, hotBox = null; const timers = new Set();
    const narrow = () => stage.clientWidth < NARROW;
    const sync = () => { stage.classList.toggle('cn-nar', narrow()); cache = null; };
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); };
    const led = () => h('u', { class: 'cn-led', 'aria-hidden': 'true' });
    const callNodes = (c) => [h('small', null, c.head), h('b', null, c.title, c.em ? ' ' : null, c.em ? h('em', { class: c.down ? 'dn' : null }, c.em) : null), h('span', null, c.sub || '')].filter(Boolean);
    const riserCall = () => (M.topics[0] ? { head: T('BIGGEST CHANGE · LAST HOUR', 'ΜΕΓΑΛΥΤΕΡΗ ΑΛΛΑΓΗ · ΤΕΛΕΥΤΑΙΑ ΩΡΑ'), ...M.topics[0] } : null);
    function spark() {
      const v = M.spark; if (v.length < 2) return null;
      const w = 96, hh = 18, lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
      const s = sv('svg', { viewBox: '0 0 ' + w + ' ' + hh, width: w, height: hh, 'aria-hidden': 'true', focusable: 'false' });
      s.append(sv('polyline', { points: v.map((x, i) => ((i / (v.length - 1)) * w).toFixed(1) + ',' + (hh - 2 - ((x - lo) / sp) * (hh - 4)).toFixed(1)).join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 }));
      return h('span', { class: 'cn-spark' }, s, h('span', null, T('Outdoor temperature over the saved day · now ' + num(v[v.length - 1]) + ' °C', 'Θερμοκρασία έξω στην αποθηκευμένη μέρα · τώρα ' + num(v[v.length - 1]) + ' °C')));
    }
    function render() {
      const t = M.totals, B = BEAT(), mx = Math.max(1, ...M.sources.map((s) => s.total)), r = riserCall();
      const sum = T('Animated scene. ' + nf(t.readings) + ' readings from ' + t.layers + ' layers are coming in now. Of ' + t.checks + ' comparisons between sources, ' + t.agree + ' agree and ' + t.differ + ' differ. The map of Cyprus is decoration; no number is placed on it.',
        'Κινούμενη σκηνή. ' + nf(t.readings) + ' μετρήσεις από ' + t.layers + ' στρώματα μπαίνουν τώρα. Από ' + t.checks + ' συγκρίσεις ανάμεσα σε πηγές, ' + t.agree + ' συμφωνούν και ' + t.differ + ' διαφέρουν. Ο χάρτης της Κύπρου είναι διακοσμητικός· δεν φέρει κανέναν αριθμό.');
      el.replaceChildren(...[
        h('p', { class: 'cn-sr' }, sum),
        h('div', { class: 'cn-top' }, h('b', null, T('ATHENA', 'ΑΘΗΝΑ') + ' · SMART CITIES ' + T('CYPRUS', 'ΚΥΠΡΟΣ')), h('span', { class: 'cn-tot' }, nf(t.readings) + ' ' + T('readings now', 'μετρήσεις τώρα') + ' · ' + t.layers + ' ' + T('layers', 'στρώματα')),
          h('span', { class: 'cn-badge ' + (M.fresh ? 'live' : 'late') }, M.fresh ? T('LIVE', 'ΖΩΝΤΑΝΑ') : T('LAST ANSWER ', 'ΤΕΛΕΥΤΑΙΑ ΑΠΑΝΤΗΣΗ ') + SC.time(M.at))),
        h('div', { class: 'cn-col cn-in', role: 'list', 'aria-label': T('Input: the layers that are answering now', 'Είσοδος: τα στρώματα που απαντούν τώρα') },
          M.sources.map((s, i) => { const bar = h('u'); bar.style.width = Math.max(4, Math.round((100 * s.total) / mx)) + '%'; bar.style.animationDuration = (2.4 + Math.min(12, s.age == null ? 12 : s.age * 24) * 0.35).toFixed(1) + 's'; bar.style.animationDelay = (i * 0.37).toFixed(2) + 's';
            return h('div', { class: 'cn-p cn-pi' + (s.own ? ' own' : ''), role: 'listitem', title: s.n }, h('b', null, s.n), h('span', null, h('em', null, nf(s.total)), ' ' + T(s.total === 1 ? 'reading' : 'readings', s.total === 1 ? 'μέτρηση' : 'μετρήσεις'), h('span', { class: 'cn-x' }, ' · ' + s.cities + ' ' + T(s.cities === 1 ? 'city' : 'cities', s.cities === 1 ? 'πόλη' : 'πόλεις'))),
              h('i', { class: 'cn-age ' + (s.late ? 'stale' : 'fresh') }, T('spoke ', 'μίλησε ') + ago(s.lastAt)), led(), h('i', { class: 'cn-bar', 'aria-hidden': 'true' }, bar)); })),
        h('nav', { class: 'cn-col cn-out', 'aria-label': T('Output: the four cities and two more views', 'Έξοδος: οι τέσσερις πόλεις και δύο ακόμη προβολές') },
          M.outputs.map((o) => h('button', { type: 'button', class: 'cn-p cn-po', title: o.n, onclick: () => (o.kind === 'city' ? api.setCity(o.id) : api.setView(o.id)) }, h('b', null, o.n), h('span', null, o.sub + ' ', h('i', { class: 'cn-arr', 'aria-hidden': 'true' }, '→')), led()))),
        h('div', { class: 'cn-riser', hidden: !r }, r ? callNodes(r) : null),
        h('div', { class: 'cn-beat', 'aria-hidden': 'true' }, h('em', null, B[0][0]), h('span', null, B[0][1]), h('i', { class: 'cn-prog' }, h('u'))),
        h('div', { class: 'cn-bot' }, h('span', { class: 'cn-tick' }, h('span', { class: 'cn-tk' }, T('Replaying the newest readings…', 'Επανάληψη των πιο πρόσφατων μετρήσεων…'))), spark()),
      ].filter(Boolean));
      cache = null;
    }
    render(); sync();
    const ro = new ResizeObserver(sync); ro.observe(stage);
    const find = (t) => { const n = t && t.closest ? t.closest('.cn-pi,.cn-po') : null; if (!n) return null; const inp = n.classList.contains('cn-pi'); return { side: inp ? 'in' : 'out', i: [...el.querySelectorAll(inp ? '.cn-pi' : '.cn-po')].indexOf(n) }; };
    el.addEventListener('pointerover', (e) => { hotBox = find(e.target); }); el.addEventListener('pointerleave', () => { hotBox = null; });
    el.addEventListener('focusin', (e) => { hotBox = find(e.target); }); el.addEventListener('focusout', () => { hotBox = null; });
    const pulse = (node) => { if (!node) return; node.classList.add('on'); later(() => node.classList.remove('on'), 1400); };
    return {
      el,
      update(m) { M = m; render(); },
      blip(side, i) { const n = el.querySelectorAll(side === 'in' ? '.cn-pi' : '.cn-po')[i]; if (!n || n.classList.contains('bl')) return; n.classList.add('bl'); later(() => n.classList.remove('bl'), 170); },
      hot() { return hotBox; },
      arrive(i) { const n = el.querySelectorAll('.cn-po')[i]; if (!n) return; n.classList.add('hit'); later(() => n.classList.remove('hit'), 1500); },
      setCallout(c) { const b = el.querySelector('.cn-riser'); if (!b) return; const v = c || riserCall(); b.hidden = !v; if (!v) return; b.replaceChildren(...callNodes(v)); b.classList.toggle('inc', !!(c && c.flash)); },
      setBeat(i, p) {
        const b = el.querySelector('.cn-beat'); if (!b) return; const B = BEAT()[((i % 3) + 3) % 3], q = Math.max(0, Math.min(1, p || 0));
        if (b.dataset.i !== String(i)) { b.dataset.i = String(i); b.querySelector('em').textContent = B[0]; b.querySelector('span').textContent = B[1]; }
        b.style.opacity = Math.max(0, Math.min(1, Math.sin(q * Math.PI) * 3.2)).toFixed(3);
        b.querySelector('u').style.width = (q * 100).toFixed(1) + '%';
      },
      showEvent(ev) {
        const tk = el.querySelector('.cn-tick'); if (!ev || !tk) return;
        tk.title = ev.who + ' · ' + ev.title;
        tk.replaceChildren(h('span', { class: 'cn-tk in' }, h('b', null, ev.who), h('span', null, ev.title)));
        if (ev.src >= 0) pulse(el.querySelectorAll('.cn-pi')[ev.src]);
      },
      anchors() {
        if (cache) return cache; const hb = stage.getBoundingClientRect(), nar = narrow();
        const pt = (n, side) => { const r = n.getBoundingClientRect(); return nar ? { x: r.left - hb.left + r.width / 2, y: (side === 'in' ? r.bottom : r.top) - hb.top } : { x: (side === 'in' ? r.right : r.left) - hb.left, y: r.top - hb.top + r.height / 2 }; };
        cache = { narrow: nar, inputs: [...el.querySelectorAll('.cn-pi')].map((n) => pt(n, 'in')), outputs: [...el.querySelectorAll('.cn-po')].map((n) => pt(n, 'out')) };
        return cache;
      },
      destroy() { dead = true; ro.disconnect(); timers.forEach(clearTimeout); timers.clear(); el.remove(); },
    };
  }

  function cine(host, api) {
    const stage = h('div', { class: 'cn cn-live' });
    const words = h('p', { class: 'cn-words' });
    host.replaceChildren(h('div', { class: 'cn-wrap' }, stage, words));
    let live = null, replay = null, replayAt = 0, model = null, engine = null, hud = null, dead = false, starting = false, failed = false, shown = '';
    let raf = 0, vis = true, paused = false, beat = -1, bp = 0, evI = 0, evAt = 1.2, lastHud = -1, lastEv = null, clock = 0, prev = performance.now(), callUntil = 0, topicI = -1, topicAt = 0, ro = null, io = null;
    const btn = h('button', { type: 'button', class: 'cn-pause', onclick: () => { paused = !paused; label(); prev = performance.now(); kick(); } });
    function label() { btn.textContent = paused ? T('PLAY', 'ΑΝΑΠΑΡΑΓΩΓΗ') : T('PAUSE', 'ΠΑΥΣΗ'); btn.setAttribute('aria-pressed', String(paused)); btn.setAttribute('aria-label', paused ? T('Play the animation', 'Αναπαραγωγή της κίνησης') : T('Pause the animation', 'Παύση της κίνησης')); stage.classList.toggle('cn-paused', paused); }
    function dock() { const t = stage.querySelector('.cn-top'); if (t && btn.parentNode !== t) t.append(btn); }
    function fail() {
      failed = true; stage.classList.remove('cn-live');
      stage.replaceChildren(h('div', { class: 'cn-fail' }, T('This scene needs 3D graphics, and this browser or device did not start them. The same data is in the "All our data" view.', 'Αυτή η σκηνή χρειάζεται τρισδιάστατα γραφικά, και αυτό το πρόγραμμα περιήγησης ή η συσκευή δεν τα ξεκίνησε. Τα ίδια δεδομένα είναι στην προβολή «Όλα τα δεδομένα».'),
        h('div', null, h('button', { type: 'button', class: 'nm-btn', onclick: () => api.setView('all') }, T('Open "All our data"', 'Άνοιγμα: Όλα τα δεδομένα')))));
    }
    function say() {
      const t = model.totals;
      words.replaceChildren(h('b', null, T('In words: ', 'Με λόγια: ')), T(nf(t.readings) + ' readings from ' + t.layers + ' layers are coming in right now. ', nf(t.readings) + ' μετρήσεις από ' + t.layers + ' στρώματα μπαίνουν αυτή τη στιγμή. '),
        t.checks ? T('Where two or more sources measure the same thing in a city, ' + t.agree + ' of ' + t.checks + ' comparisons agree' + (t.differ ? ' and ' + t.differ + ' differ, which is a good place to ask why. ' : '. '), 'Όπου δύο ή περισσότερες πηγές μετρούν το ίδιο πράγμα σε μια πόλη, ' + t.agree + ' από ' + t.checks + ' συγκρίσεις συμφωνούν' + (t.differ ? ' και ' + t.differ + ' διαφέρουν, και εκεί αξίζει να ρωτήσεις γιατί. ' : '. ')) : T('No two sources measure the same thing right now, so nothing is compared. ', 'Καμία δύο πηγές δεν μετρούν το ίδιο πράγμα τώρα, άρα δεν συγκρίνεται τίποτα. '),
        T('The glowing shape and the map are decoration: they carry no numbers.', 'Το φωτεινό σχήμα και ο χάρτης είναι διακοσμητικά: δεν φέρουν αριθμούς.'));
    }
    const incoming = (ev) => ({ flash: true, head: T('READING · ', 'ΜΕΤΡΗΣΗ · ') + ev.who.toUpperCase(), title: ev.title, sub: ev.who + ' → ' + ev.city });
    const topicCall = (i) => { const tp = model.topics[i]; return tp ? { head: i === 0 ? T('BIGGEST CHANGE · LAST HOUR', 'ΜΕΓΑΛΥΤΕΡΗ ΑΛΛΑΓΗ · ΤΕΛΕΥΤΑΙΑ ΩΡΑ') : T('CHANGE · LAST HOUR', 'ΑΛΛΑΓΗ · ΤΕΛΕΥΤΑΙΑ ΩΡΑ'), ...tp } : null; };
    function fire(ev) { lastEv = ev; hud.showEvent(ev); engine.event(ev); hud.setCallout(incoming(ev)); callUntil = clock + HOLD_S; }
    function frame() {
      raf = 0; if (dead || !engine || !stage.isConnected) return;
      const now = performance.now(), still = reduced() || paused; if (!still) clock += Math.min(0.1, (now - prev) / 1000); prev = now;
      const t = reduced() ? 12 : clock, b = Math.floor((t % (BEAT_S * 3)) / BEAT_S); bp = (t % BEAT_S) / BEAT_S;
      if (b !== beat || Math.abs(t - lastHud) > 0.25) { beat = b; lastHud = t; hud.setBeat(b, bp); }
      if (!still) {
        if (t >= evAt) { evAt = t + EVENT_S; const ev = model.events.length ? model.events[evI++ % model.events.length] : null; if (ev) fire(ev); }
        if (callUntil && t >= callUntil) { callUntil = 0; topicAt = 0; }
        if (!callUntil && t >= topicAt) { topicAt = t + TOPIC_S; if (model.topics.length) { topicI = (topicI + 1) % model.topics.length; hud.setCallout(topicCall(topicI)); } else hud.setCallout(null); }
      }
      engine.render(t, { beat: b, progress: bp, anchors: hud.anchors(), still, hot: hud.hot(), blip: (side, i) => hud.blip(side, i), arrive: (i) => hud.arrive(i) });
      if (vis && !still && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf && !dead && engine) raf = requestAnimationFrame(frame); };
    function apply(force) {
      model = build(live, replay); say();
      if (!engine) return;
      engine.setModel(model);
      const g = sig(model); if (g === shown && !force) return;
      if (!force && hud.el.contains(document.activeElement)) return;   // never pull keyboard focus away; tried again at the next answer
      shown = g; hud.update(model); dock(); hud.setBeat(Math.max(0, beat), bp); if (lastEv) hud.showEvent(lastEv);
      kick();
    }
    async function start() {
      if (starting || engine || failed || dead) return; starting = true;
      if (!hasGL() || !SC.layersLive.cineEngine) { fail(); return; }
      try { engine = await SC.layersLive.cineEngine(stage); } catch (e) { engine = null; if (!dead) fail(); return; }
      if (dead) { engine.destroy(); return; }
      hud = mountHud(stage, model, api); engine.setModel(model); shown = sig(model);
      dock(); label(); btn.hidden = reduced();
      ro = new ResizeObserver(() => { engine.resize(); kick(); }); ro.observe(stage);
      io = new IntersectionObserver((es) => { vis = es[0].isIntersecting; if (vis) { prev = performance.now(); kick(); } }); io.observe(stage);
      document.addEventListener('visibilitychange', kick);
      if (reduced() && model.events[0]) { lastEv = model.events[0]; hud.showEvent(lastEv); hud.setCallout(incoming(lastEv)); }
      kick();
    }
    function loadReplay() {
      if (Date.now() - replayAt < 120000) return;
      replayAt = Date.now();
      SC.api('/layers/api/replay').then((r) => { if (dead) return; replay = r; if (live) apply(false); }).catch(() => { replayAt = 0; });
    }
    words.textContent = T('Loading the scene…', 'Φόρτωση της σκηνής…');
    return {
      update(l) { live = l; apply(false); loadReplay(); start(); },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', kick); if (hud) hud.destroy(); if (engine) engine.destroy(); },
    };
  }
  SC.layersLive = SC.layersLive || {};
  SC.layersLive.cine = cine;
})();
