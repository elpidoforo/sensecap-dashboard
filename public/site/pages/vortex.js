/*
  Data Vortex (#/vortex): every record of the data sets that come as a list of single records, one sphere each, in a funnel.
  Choose a data set on top, then a group on the left: its records light up and connect to a hub. Click a sphere to read it, and
  open it on the map (the 3D stack lifts that sheet out). The same records are listed as plain text under the picture, so nothing
  depends on the animation. Ported from the Nemesis Data Vortex; the data comes from /api/stack/<id>, the numbers from
  /site/vortexdata.js (tested). Honest limits: layers that are readings or grids (wind, air, waves, clouds, weather stations,
  aeroplanes) are not lists of records and are not here; vehicles never appear (no positions of vehicles are used).
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/vortex.css');

  const NAMES = { all: ['All data sets', 'Όλα τα συνόλα'], ev: ['EV charging points', 'Φόρτιση ηλεκτρικών'], crossings: ['Pedestrian crossings', 'Διαβάσεις πεζών'], flood: ['Flood-risk rivers', 'Ποτάμια με κίνδυνο πλημμύρας'], quakes: ['Earthquakes', 'Σεισμοί'] };
  const LANGI = () => (SC.lang === 'el' ? 1 : 0);
  const L = (p) => (p ? p[LANGI()] : '');
  const LS = (x) => (Array.isArray(x) ? L(x) : String(x == null ? '' : x));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const nf = (n) => new Intl.NumberFormat(SC.lang === 'el' ? 'el-GR' : 'en-GB').format(n);
  const day = (iso) => (/^\d{4}-\d\d-\d\d/.test(String(iso || '')) ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(SC.lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : String(iso || ''));
  const noLoad = () => T('These records could not be loaded right now. Choose another data set, or try again in a moment.', 'Οι εγγραφές δεν φόρτωσαν αυτή τη στιγμή. Επιλέξτε άλλο σύνολο δεδομένων ή δοκιμάστε ξανά σε λίγο.');
  const short = (n) => L(n).replace(/ \(.*\)$/, '');

  const RAW = new Map();   // /api/stack answers, kept for the visit
  const getRaw = (id) => {
    if (!RAW.has(id)) RAW.set(id, fetch('/api/stack/' + id, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(id + ' ' + r.status); return r.json(); }).catch((e) => { RAW.delete(id); throw e; }));
    return RAW.get(id);
  };
  const load = (view) => {
    const VD = SC.vortexData;
    if (view === 'all') return Promise.all(['ev', 'crossings', 'flood', 'quakes'].map((v) => getRaw(VD.SOURCE[v]).then(VD.BUILD[v]))).then(VD.allModel);
    return getRaw(VD.SOURCE[view]).then(VD.BUILD[view]);
  };

  function mount(root) {
    const VD = SC.vortexData;
    const st = { root, view: 'all', model: null, sel: -1, tour: true, timer: 0, delay: 0, eng: null, pick: null, token: 0 };
    const want = /[?&]v=([a-z]+)/.exec(location.hash);
    if (want && VD.VIEWS.indexOf(want[1]) >= 0) st.view = want[1];
    root.innerHTML = '<div class="vx-top"><div class="vx-views" role="group" aria-label="' + esc(T('Data set', 'Σύνολο δεδομένων')) + '">'
      + VD.VIEWS.map((v) => '<button class="vx-v" type="button" data-v="' + v + '" aria-pressed="false">' + esc(L(NAMES[v])) + '</button>').join('') + '</div></div>'
      + '<div class="vx-grid"><aside class="vx-side" aria-label="' + esc(T('Legend and groups', 'Υπόμνημα και ομάδες')) + '"><div class="vx-stat" aria-live="polite"></div>'
      + '<h2 class="vx-h"><span data-bt></span><span>' + esc(T('records', 'εγγραφές')) + '</span></h2><div class="vx-bands"></div>'
      + '<h2 class="vx-h"><span data-gt></span><span>' + esc(T('records', 'εγγραφές')) + '</span></h2><div class="vx-groups"></div></aside>'
      + '<div class="vx-stage"><canvas class="vx-c" aria-hidden="true"></canvas><div class="vx-vig" aria-hidden="true"></div><p class="vx-load" role="status"></p>'
      + '<button class="vx-tour" type="button" aria-pressed="true"></button><section class="vx-nums" aria-label="' + esc(T('Numbers for what is shown', 'Αριθμοί για ό,τι φαίνεται')) + '"></section><div class="vx-card" aria-live="polite" hidden></div><p class="vx-foot"></p></div></div>'
      + '<p class="vx-note"></p><details class="vx-list"><summary></summary><div class="vx-rows"></div></details>';
    const $ = (s) => root.querySelector(s);
    st.eng = SC.mountVortex($('.vx-c'), { onPick: (it) => { stopTour(st); st.pick = it; card(st); } });
    if (st.eng.still) st.tour = false;
    root.addEventListener('click', (e) => {
      const v = e.target.closest('.vx-v'); if (v) { show(st, v.dataset.v); return; }
      const g = e.target.closest('.vx-g'); if (g) { stopTour(st); choose(st, Number(g.dataset.i) === st.sel ? -1 : Number(g.dataset.i)); return; }
      if (e.target.closest('.vx-tour')) { if (st.tour) stopTour(st); else { st.tour = true; tourBtn(st); tick(st); startTimer(st); } return; }
      if (e.target.closest('.vx-x')) { st.pick = null; st.eng.clearPick(); card(st); }
    });
    $('.vx-list').addEventListener('toggle', () => { if ($('.vx-list').open) stopTour(st); rows(st); });
    // someone reading the lists with the keyboard must not have them rewritten under their focus
    ['.vx-side', '.vx-list'].forEach((sel) => $(sel).addEventListener('focusin', () => { if (st.tour) stopTour(st); }));
    tourBtn(st); show(st, st.view);
    return () => destroy(st);
  }
  function stopTimers(st) { clearInterval(st.timer); clearTimeout(st.delay); st.timer = 0; st.delay = 0; }
  function destroy(st) { if (!st) return; st.token++; stopTimers(st); if (st.eng) st.eng.destroy(); }
  function tourBtn(st) { const b = st.root.querySelector('.vx-tour'); b.hidden = st.eng.still; b.setAttribute('aria-pressed', String(st.tour)); b.textContent = st.tour ? T('❚❚ Pause the tour', '❚❚ Παύση περιήγησης') : T('▶ Play the tour', '▶ Έναρξη περιήγησης'); st.eng.setPaused(false); }
  function stopTour(st) { st.tour = false; stopTimers(st); tourBtn(st); }
  function tick(st) { if (!st.model || !st.model.groups.length) return; choose(st, (st.sel + 1) % st.model.groups.length); }
  function startTimer(st) { stopTimers(st); st.timer = setInterval(() => { if (!st.root.isConnected) { destroy(st); return; } if (st.tour && !document.hidden) tick(st); }, 2700); }

  function show(st, view) {
    const root = st.root, $ = (s) => root.querySelector(s), tok = ++st.token;
    st.view = view; st.model = null; st.sel = -1; st.pick = null; stopTimers(st); numbers(st);
    st.tour = !st.eng.still;   // every data set opens with the tour playing, except when the device asks for reduced motion
    root.querySelectorAll('.vx-v').forEach((b) => { const on = b.dataset.v === view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $('.vx-load').textContent = T('Loading the records…', 'Φόρτωση εγγραφών…'); $('.vx-load').hidden = false; $('.vx-card').hidden = true;
    const fail = () => { if (tok !== st.token) return; $('.vx-load').hidden = false; $('.vx-load').textContent = noLoad(); };
    load(view).then((m) => {
      if (tok !== st.token || !root.isConnected) return;
      try { st.model = m; $('.vx-load').hidden = true; st.eng.setModel(m); legend(st); choose(st, -1); tourBtn(st); } catch (e) { st.model = null; fail(); return; }
      if (st.tour) { stopTimers(st); st.delay = setTimeout(() => { if (tok !== st.token || !st.tour) return; tick(st); startTimer(st); }, 2400); }
    }).catch(fail);
  }
  function legend(st) {
    const m = st.model, $ = (s) => st.root.querySelector(s), cnt = new Map(); m.items.forEach((i) => cnt.set(i.b, (cnt.get(i.b) || 0) + 1));
    $('[data-bt]').textContent = L(m.bandsTitle); $('[data-gt]').textContent = L(m.groupsTitle);
    $('.vx-stat').innerHTML = '<b>' + nf(m.total) + '</b> ' + esc(L(m.unit)) + (m.asOf ? ' · ' + esc(T('data as of', 'δεδομένα έως')) + ' ' + esc(day(m.asOf)) : '');
    $('.vx-bands').innerHTML = m.bands.filter((b) => cnt.get(b.k)).map((b) => '<div class="vx-b"><span><i style="background:' + esc(b.c) + '"></i>' + esc(L(b.n)) + '</span><small>' + nf(cnt.get(b.k)) + '</small></div>').join('');
    $('.vx-groups').innerHTML = m.groups.map((g, i) => '<button class="vx-g" type="button" data-i="' + i + '" aria-pressed="false"><span>' + esc(short(g.n)) + '</span><small>' + nf(g.count) + '</small></button>').join('');
    $('.vx-note').textContent = L(m.note) + (m.sizeNote ? ' ' + L(m.sizeNote) + '.' : '');
  }
  function choose(st, i) {
    const m = st.model; if (!m) return; st.sel = i; st.pick = null; st.eng.clearPick();
    st.root.querySelectorAll('.vx-g').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-pressed', String(k === i)); });
    const g = m.groups[i]; st.eng.select(g ? g.k : null, g ? short(g.n) : '', i, m.groups.length);
    const its = g ? m.items.filter((x) => x.g === g.k) : m.items, cnt = new Map(); its.forEach((x) => cnt.set(x.b, (cnt.get(x.b) || 0) + 1));
    st.root.querySelector('.vx-foot').textContent = (g ? short(g.n) + ': ' : '') + nf(its.length) + ' ' + L(m.unit) + ' — ' + m.bands.filter((b) => cnt.get(b.k)).map((b) => nf(cnt.get(b.k)) + ' ' + L(b.n)).join(' · ');
    st.root.querySelector('.vx-list summary').textContent = g ? T('List the ' + nf(its.length) + ' ' + L(m.unit) + ' of ' + short(g.n), 'Λίστα: ' + nf(its.length) + ' ' + L(m.unit) + ', ' + short(g.n)) : T('List all ' + nf(its.length) + ' ' + L(m.unit), 'Λίστα: και οι ' + nf(its.length) + ' ' + L(m.unit));
    numbers(st); card(st); rows(st);
  }
  // The numbers panel: counts and sums of exactly what the picture shows (stats() in vortexdata.js, tested).
  function numbers(st) {
    const m = st.model, box = st.root.querySelector('.vx-nums'); if (!m) { box.innerHTML = ''; return; }
    const g = m.groups[st.sel], s = SC.vortexData.stats(m, g ? g.k : null), gname = g ? short(g.n) : '';
    const pct = (p) => (p > 0 && p < 1 ? '<1' : p > 99 && p < 100 ? '>99' : nf(Math.round(p))) + '%';
    box.innerHTML = '<p class="vx-nl">' + esc(g ? gname : T('All records', 'Όλες οι εγγραφές')) + '</p>'
      + '<p class="vx-big"><b>' + nf(s.n) + '</b><span>' + esc(L(m.unit)) + '</span></p>'
      + '<p class="vx-ns">' + esc(g ? T(pct(s.share) + ' of the ' + nf(s.total) + ' shown', pct(s.share) + ' από τις ' + nf(s.total) + ' που φαίνονται') : T('in ' + nf(s.groups) + ' groups', 'σε ' + nf(s.groups) + ' ομάδες') + (s.biggest ? T('; largest: ', ' · μεγαλύτερη: ') + short(s.biggest.n) + ' (' + nf(s.biggest.count) + ')' : '')) + '</p>'
      + '<div class="vx-bars">' + s.bands.map((b) => '<div class="vx-bar"><span>' + esc(L(b.n)) + '</span><b>' + nf(b.count) + '</b><em>' + pct(b.pct) + '</em><i><u style="width:' + Math.max(2, b.pct).toFixed(1) + '%;background:' + esc(b.c) + '"></u></i></div>').join('') + '</div>'
      + (s.measure ? '<div class="vx-kv"><span>' + esc(L(s.measure.n)) + '</span><b>' + nf(Math.round(s.measure.sum * 10) / 10) + '</b>' + (s.measure.top ? '<small>' + esc(L(s.measure.top.label)) + ': ' + esc(s.measure.top.t) + ' (' + nf(s.measure.top.v) + ')</small>' : '') + '</div>' : '')
      + (s.dated ? '<div class="vx-kv"><span>' + esc(T('Dated records', 'Εγγραφές με ημερομηνία')) + '</span><b>' + nf(s.dated) + '</b><small>' + esc(day(s.first)) + ' – ' + esc(day(s.last)) + '</small></div>' : '');
  }
  const link = (it, text) => (it.href ? '<a href="' + esc(it.href) + '"' + (it.ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(text) + (it.ext ? ' ↗' : ' →') + '</a>' : '<em>' + esc(T('no link on file', 'χωρίς σύνδεσμο στο αρχείο')) + '</em>');
  function card(st) {
    const box = st.root.querySelector('.vx-card'), m = st.model, it = st.pick; if (!m || !it) { box.hidden = true; box.innerHTML = ''; return; }
    const b = m.bands.find((x) => x.k === it.b) || { n: ['', ''], c: '#CBD5E1' }, g = m.groups.find((x) => x.k === it.g);
    box.hidden = false;
    box.innerHTML = '<button class="vx-x" type="button" aria-label="' + esc(T('Close', 'Κλείσιμο')) + '">✕</button><span class="vx-chip" style="color:' + esc(b.c) + ';border-color:' + esc(b.c) + '">' + esc(L(b.n)) + '</span><b>' + esc(it.t) + '</b>'
      + '<small>' + esc(LS(it.sub)) + (it.d ? (LS(it.sub) ? ' · ' : '') + esc(day(it.d)) : '') + (g ? '<br>' + esc(L(m.groupsTitle)) + ': ' + esc(short(g.n)) : '') + '</small>'
      + link(it, it.ext ? T('Open the original', 'Άνοιγμα πρωτοτύπου') : T('Open on the map', 'Άνοιγμα στον χάρτη'));
  }
  // the same records as text: reachable by keyboard and screen reader, and the honest fallback for the picture
  function rows(st) {
    const d = st.root.querySelector('.vx-list'), box = st.root.querySelector('.vx-rows'), m = st.model; if (!m || !d.open) { box.innerHTML = ''; return; }
    const g = m.groups[st.sel], its = g ? m.items.filter((x) => x.g === g.k) : m.items, MAX = 200, band = new Map(m.bands.map((b) => [b.k, b])), bo = (k) => band.get(k) || { n: ['', ''], c: '#CBD5E1' };
    box.innerHTML = '<ol>' + its.slice(0, MAX).map((it) => '<li><span class="vx-chip" style="color:' + esc(bo(it.b).c) + ';border-color:' + esc(bo(it.b).c) + '">' + esc(L(bo(it.b).n)) + '</span> ' + link(it, it.t) + ' <small>' + esc(LS(it.sub)) + (it.d ? ' · ' + esc(day(it.d)) : '') + '</small></li>').join('') + '</ol>'
      + (its.length > MAX ? '<p class="vx-more">' + esc(T('The first ' + MAX + ' of ' + nf(its.length) + ' are listed. Choose a group to narrow the list.', 'Εμφανίζονται οι πρώτες ' + MAX + ' από ' + nf(its.length) + '. Επιλέξτε ομάδα για να περιορίσετε τη λίστα.')) + '</p>' : '');
  }

  function loadScript(src) {
    return new Promise((ok, no) => { if (document.querySelector('script[data-vx="' + src + '"]')) return ok(); const s = document.createElement('script'); s.src = src; s.dataset.vx = src; s.onload = ok; s.onerror = () => no(new Error(src)); document.head.append(s); });
  }
  SC.register('vortex', {
    title: ['Data Vortex', 'Data Vortex'],
    render(root) {
      root.append(SC.head({
        title: T('Data Vortex', 'Data Vortex'),
        lede: T('Every sphere is one record Kleanthis holds. Choose a data set, then a group, to see everything connected to it. Click a sphere to read it, and open it on the map.',
          'Κάθε σφαίρα είναι μία εγγραφή που κρατά ο Kleanthis. Επιλέξτε σύνολο δεδομένων και μετά ομάδα, για να δείτε ό,τι συνδέεται με αυτήν. Πατήστε μια σφαίρα για να τη διαβάσετε και να την ανοίξετε στον χάρτη.'),
      }));
      const box = el('div', { class: 'vx', id: 'vx-root' });
      root.append(box);
      let stop = null, gone = false;
      Promise.all([loadScript('/site/vortexdata.js'), loadScript('/site/vortex-engine.js')]).then(() => { if (!gone) stop = mount(box); })
        .catch(() => { box.append(el('p', { class: 'nm-note', role: 'alert' }, T('The Data Vortex could not start. Reload the page to try again.', 'Το Data Vortex δεν μπόρεσε να ξεκινήσει. Φορτώστε ξανά τη σελίδα.'))); });
      return () => { gone = true; if (stop) stop(); };
    },
  });
})();
