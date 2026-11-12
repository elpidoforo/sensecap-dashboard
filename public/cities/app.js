(function () {
  'use strict';
  var T = {
    en: {
      sub: 'Cyprus · four schools', out: 'Sign out', menu: 'Menu', demo: 'Demo data until live sensors are connected.',
      n_island: 'Island', g_work: 'Our work', n_sensors: '1 Sensors', n_data: '2 Data', n_space: '3 Space view', n_ai: '4 AI insight', n_present: '5 Present',
      g_more: 'More', n_people: 'People', n_portfolio: 'Student tools', n_build: 'Build studio',
      ok: 'works', key: 'needs file', svc: 'needs service', soon: 'planned',
      h_island: 'Four schools. One living data classroom.', p_island: 'Sensors on school buses and cars, satellite views and AI help students in Larnaca, Lefkosia, Limassol and Paphos understand heat and air in their own cities.',
      k_sensors: 'Sensors online', k_temp: 'Air temperature', k_hum: 'Air humidity', k_co2: 'CO2', k_noise: 'Noise', k_sat: 'Satellite heat',
      map_note: 'Stylised map. Dots are schools. Squares are grouped, delayed routes (about 1 km, at least 2 hours old).',
      privacy: 'Privacy: students see school averages and delayed, grouped routes only. No live vehicle positions.',
      h_sensors: '1 Sensors', p_sensors: 'SenseCAP sensors ride on buses and cars. Each school has its own fleet.', school: 'School', online: 'Online', temp: 'Temp °C', hum: 'Humidity %', co2: 'CO2 ppm',
      s_noise: 'Noise sensor', s_air: 'Air quality, temperature, humidity, CO2',
      h_data: '2 Data', p_data: 'Latest averages per school. Differences are the starting point for questions.', cmp: 'Which school is warmest right now? Why might that be?',
      h_space: '3 Space view', p_space: 'Where our vehicles travelled, grouped and delayed, next to what satellites see.', visits: 'visits', cells: 'route squares',
      sat_note: 'Satellite heat and green-cover layers need a prepared satellite file and are not switched on yet.',
      h_ai: '4 AI insight', p_ai: 'Ask the assistant about the data, and build your own idea with Claude.', ai1: 'Ask assistant (needs your own student account)', ai2: 'Build studio: describe an idea, Claude writes a small page, a teacher approves it before others see it.',
      h_present: '5 Present', p_present: 'A one page summary for mayors, media and parents. Use Print or save as PDF.', print: 'Print',
      h_people: 'People', p_people: 'Four schools working together.', h_portfolio: 'Student tools', p_portfolio: 'Tools made by students and approved by a teacher. Open one to use it.', open_app: 'Open student app',
      h_build: 'Build studio', p_build: 'Program your ideas with Claude.', b1: 'Sign in to the student app with your own account.', b2: 'Open Build studio and describe your idea.', b3: 'Claude writes a small page that runs in a safe box, built to block the internet.', b4: 'Submit it. A teacher reviews it before it is shown.',
      mcp: 'Teachers can also connect Claude Code to the /mcp address with a personal token made in the Build studio.',
      loading: 'Loading…', fail: 'Could not load data. Try again in a minute.', nodata: 'no data'
    },
    el: {
      sub: 'Κύπρος · τέσσερα σχολεία', out: 'Αποσύνδεση', menu: 'Μενού', demo: 'Δοκιμαστικά δεδομένα μέχρι να συνδεθούν οι πραγματικοί αισθητήρες.',
      n_island: 'Νησί', g_work: 'Η δουλειά μας', n_sensors: '1 Αισθητήρες', n_data: '2 Δεδομένα', n_space: '3 Διάστημα', n_ai: '4 Τεχνητή νοημοσύνη', n_present: '5 Παρουσίαση',
      g_more: 'Περισσότερα', n_people: 'Άνθρωποι', n_portfolio: 'Εργαλεία μαθητών', n_build: 'Build studio',
      ok: 'λειτουργεί', key: 'θέλει αρχείο', svc: 'θέλει υπηρεσία', soon: 'προγραμματισμένο',
      h_island: 'Τέσσερα σχολεία. Μία ζωντανή τάξη δεδομένων.', p_island: 'Αισθητήρες σε σχολικά λεωφορεία και αυτοκίνητα, δορυφορικές εικόνες και τεχνητή νοημοσύνη βοηθούν τους μαθητές σε Λάρνακα, Λευκωσία, Λεμεσό και Πάφο να καταλάβουν τη θερμότητα και τον αέρα της πόλης τους.',
      k_sensors: 'Αισθητήρες σε λειτουργία', k_temp: 'Θερμοκρασία αέρα', k_hum: 'Υγρασία αέρα', k_co2: 'CO2', k_noise: 'Θόρυβος', k_sat: 'Δορυφορική θερμότητα',
      map_note: 'Σχηματικός χάρτης. Οι κουκκίδες είναι σχολεία. Τα τετράγωνα είναι ομαδοποιημένες διαδρομές με καθυστέρηση (περίπου 1 χλμ, τουλάχιστον 2 ώρες παλιές).',
      privacy: 'Ιδιωτικότητα: οι μαθητές βλέπουν μέσους όρους σχολείων και ομαδοποιημένες διαδρομές με καθυστέρηση. Όχι ζωντανές θέσεις οχημάτων.',
      h_sensors: '1 Αισθητήρες', p_sensors: 'Αισθητήρες SenseCAP ταξιδεύουν σε λεωφορεία και αυτοκίνητα. Κάθε σχολείο έχει τον δικό του στόλο.', school: 'Σχολείο', online: 'Σε λειτουργία', temp: 'Θερμ. °C', hum: 'Υγρασία %', co2: 'CO2 ppm',
      s_noise: 'Αισθητήρας θορύβου', s_air: 'Ποιότητα αέρα, θερμοκρασία, υγρασία, CO2',
      h_data: '2 Δεδομένα', p_data: 'Τελευταίοι μέσοι όροι ανά σχολείο. Οι διαφορές είναι αφετηρία για ερωτήσεις.', cmp: 'Ποιο σχολείο είναι το πιο ζεστό τώρα; Γιατί;',
      h_space: '3 Διάστημα', p_space: 'Πού ταξίδεψαν τα οχήματά μας, ομαδοποιημένα και με καθυστέρηση, δίπλα σε ό,τι βλέπουν οι δορυφόροι.', visits: 'επισκέψεις', cells: 'τετράγωνα διαδρομής',
      sat_note: 'Τα επίπεδα δορυφορικής θερμότητας και πρασίνου θέλουν έτοιμο δορυφορικό αρχείο και δεν είναι ακόμη ενεργά.',
      h_ai: '4 Τεχνητή νοημοσύνη', p_ai: 'Ρώτα τον βοηθό για τα δεδομένα και φτιάξε τη δική σου ιδέα με το Claude.', ai1: 'Βοηθός Ask (θέλει δικό σου λογαριασμό μαθητή)', ai2: 'Build studio: περιέγραψε μια ιδέα, το Claude γράφει μια μικρή σελίδα και ένας εκπαιδευτικός την εγκρίνει πριν τη δουν άλλοι.',
      h_present: '5 Παρουσίαση', p_present: 'Σύνοψη μίας σελίδας για δημάρχους, μέσα ενημέρωσης και γονείς. Χρησιμοποίησε Εκτύπωση ή αποθήκευση PDF.', print: 'Εκτύπωση',
      h_people: 'Άνθρωποι', p_people: 'Τέσσερα σχολεία συνεργάζονται.', h_portfolio: 'Εργαλεία μαθητών', p_portfolio: 'Εργαλεία φτιαγμένα από μαθητές και εγκεκριμένα από εκπαιδευτικό. Άνοιξε ένα για να το χρησιμοποιήσεις.', open_app: 'Άνοιγμα εφαρμογής μαθητών',
      h_build: 'Build studio', p_build: 'Προγραμμάτισε τις ιδέες σου με το Claude.', b1: 'Συνδέσου στην εφαρμογή μαθητών με τον δικό σου λογαριασμό.', b2: 'Άνοιξε το Build studio και περιέγραψε την ιδέα σου.', b3: 'Το Claude γράφει μια μικρή σελίδα που τρέχει σε ασφαλές κουτί, φτιαγμένο να μπλοκάρει το διαδίκτυο.', b4: 'Υπέβαλέ την. Ένας εκπαιδευτικός την ελέγχει πριν εμφανιστεί.',
      mcp: 'Οι εκπαιδευτικοί μπορούν επίσης να συνδέσουν το Claude Code στη διεύθυνση /mcp με προσωπικό διακριτικό από το Build studio.',
      loading: 'Φόρτωση…', fail: 'Δεν φορτώθηκαν τα δεδομένα. Δοκίμασε ξανά σε λίγο.', nodata: 'χωρίς δεδομένα'
    }
  };
  var lang = 'en';
  try { lang = localStorage.getItem('aisc-lang') === 'el' ? 'el' : 'en'; } catch (e) {}
  var data = null, failed = false;
  var $ = function (id) { return document.getElementById(id); };
  var t = function (k) { return T[lang][k] || k; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (v, d) { return typeof v === 'number' ? v.toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB', { maximumFractionDigits: d == null ? 1 : d }) : '—'; };
  var badge = function (k) { return '<span class="badge b-' + k + '">' + esc(t(k)) + '</span>'; };
  var sname = function (s) { return lang === 'el' ? s.el : s.name; };

  var ROUTES = [
    { id: '', n: 'n_island', g: null }, { id: 'sensors', n: 'n_sensors', g: 'g_work' }, { id: 'data', n: 'n_data' }, { id: 'space', n: 'n_space' },
    { id: 'ai', n: 'n_ai' }, { id: 'present', n: 'n_present' }, { id: 'people', n: 'n_people', g: 'g_more' }, { id: 'portfolio', n: 'n_portfolio' }, { id: 'build', n: 'n_build' }
  ];
  var current = function () { return (location.hash.replace(/^#\/?/, '') || '').split('/')[0]; };

  /* Cyprus outline, longitude/latitude pairs, stylised */
  var OUT = [[32.27, 35.07], [32.55, 35.17], [32.85, 35.2], [32.93, 35.4], [33.3, 35.34], [33.9, 35.3], [34.3, 35.55], [34.6, 35.69], [34.55, 35.6], [34.1, 35.3], [33.95, 35.12], [34.08, 34.96], [33.63, 34.9], [33.05, 34.56], [32.9, 34.65], [32.7, 34.65], [32.41, 34.77]];
  var W = 340, H = 190, X0 = 32.15, X1 = 34.75, Y0 = 34.5, Y1 = 35.75;
  var px = function (lng) { return ((lng - X0) / (X1 - X0)) * W; };
  var py = function (lat) { return H - ((lat - Y0) / (Y1 - Y0)) * H; };

  function mapSvg(withCells) {
    var d = 'M' + OUT.map(function (p) { return px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1); }).join('L') + 'Z';
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cyprus"><path d="' + d + '" fill="#CFE8FA" stroke="#3E9BE0" stroke-width="1"/>';
    if (data && withCells) {
      data.schools.forEach(function (sc) {
        var mx = 1; sc.cells.forEach(function (c) { if (c[2] > mx) mx = c[2]; });
        sc.cells.forEach(function (c) { s += '<rect x="' + (px(c[1]) - 2.2).toFixed(1) + '" y="' + (py(c[0]) - 2.2).toFixed(1) + '" width="4.4" height="4.4" fill="#1B6FB5" opacity="' + (0.25 + 0.6 * c[2] / mx).toFixed(2) + '"><title>' + esc(c[2] + ' ' + t('visits')) + '</title></rect>'; });
      });
    }
    if (data) {
      data.schools.forEach(function (sc) {
        s += '<g class="hub" tabindex="0" role="link" aria-label="' + esc(sname(sc)) + '" data-go="sensors"><circle cx="' + px(sc.lng).toFixed(1) + '" cy="' + py(sc.lat).toFixed(1) + '" r="6" fill="#F2B632" stroke="#0B2A4A" stroke-width="1.2"/><text x="' + (px(sc.lng) + 9).toFixed(1) + '" y="' + (py(sc.lat) + 4).toFixed(1) + '" font-size="10" fill="#0B2A4A">' + esc(sc.id === 'paphos' ? 'Paphos' : sc.id === 'larnaca' ? 'Larnaca' : sc.id === 'lefkosia' ? 'Lefkosia' : 'Limassol') + '</text></g>';
      });
    }
    return s + '</svg>';
  }

  function allAvg(key) {
    var v = (data.schools || []).map(function (s) { return s[key]; }).filter(function (x) { return typeof x === 'number'; });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }
  function head(h, p) { return '<h1>' + esc(t(h)) + '</h1><p style="max-width:62ch;color:var(--mute)">' + esc(t(p)) + '</p><div class="demo">' + esc(t('demo')) + '</div>'; }
  function kpi(label, val, b) { return '<div class="kpi"><small>' + esc(label) + '</small><b>' + val + '</b>' + badge(b) + '</div>'; }

  var PAGES = {
    '': function () {
      var on = 0, all = 0; data.schools.forEach(function (s) { on += s.online; all += s.sensors; });
      return head('h_island', 'p_island') + '<div class="mapbox">' + mapSvg(true) + '<p class="note">' + esc(t('map_note')) + '</p></div>' +
        '<div class="kpis">' + kpi(t('k_sensors'), on + ' / ' + all, 'ok') + kpi(t('k_temp'), num(allAvg('temp')) + ' °C', 'ok') + kpi(t('k_hum'), num(allAvg('humidity'), 0) + ' %', 'ok') + kpi(t('k_co2'), num(allAvg('co2'), 0) + ' ppm', 'ok') + kpi(t('k_noise'), '—', 'soon') + kpi(t('k_sat'), '—', 'key') + '</div>' +
        '<p class="note">' + esc(t('privacy')) + '</p>';
    },
    sensors: function () {
      var rows = data.schools.map(function (s) { return '<tr><td>' + esc(sname(s)) + '</td><td>' + s.online + ' / ' + s.sensors + '</td><td>' + num(s.temp) + '</td><td>' + num(s.humidity, 0) + '</td><td>' + num(s.co2, 0) + '</td></tr>'; }).join('');
      return head('h_sensors', 'p_sensors') + '<table><thead><tr><th>' + esc(t('school')) + '</th><th>' + esc(t('online')) + '</th><th>' + esc(t('temp')) + '</th><th>' + esc(t('hum')) + '</th><th>' + esc(t('co2')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="grid" style="margin-top:16px"><div class="tile"><h3>' + esc(t('s_air')) + '</h3>' + badge('ok') + '</div><div class="tile"><h3>' + esc(t('s_noise')) + '</h3>' + badge('soon') + '</div></div>';
    },
    data: function () {
      var temps = data.schools.map(function (s) { return s.temp; }).filter(function (x) { return typeof x === 'number'; });
      var mx = Math.max.apply(null, temps.concat([1]));
      var bars = data.schools.map(function (s) { var w = typeof s.temp === 'number' ? Math.round(s.temp / mx * 100) : 0; return '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:14px"><span>' + esc(sname(s)) + '</span><b>' + num(s.temp) + ' °C</b></div><div style="background:var(--sky2);border-radius:99px;height:12px"><div style="width:' + w + '%;background:var(--blue);height:12px;border-radius:99px"></div></div></div>'; }).join('');
      return head('h_data', 'p_data') + '<div class="card">' + bars + '</div><p style="margin-top:14px"><b>' + esc(t('cmp')) + '</b></p>';
    },
    space: function () {
      var cells = 0; data.schools.forEach(function (s) { cells += s.cells.length; });
      return head('h_space', 'p_space') + '<div class="mapbox">' + mapSvg(true) + '<p class="note">' + esc(t('map_note')) + '</p></div><div class="kpis">' + kpi(t('cells'), String(cells), 'ok') + kpi(t('k_sat'), '—', 'key') + '</div><p class="note">' + esc(t('sat_note')) + '</p>';
    },
    ai: function () {
      return head('h_ai', 'p_ai') + '<div class="grid"><a class="tile" href="/app/"><h3>Ask assistant</h3><p>' + esc(t('ai1')) + '</p>' + badge('ok') + '</a><a class="tile" href="/app/"><h3>Build studio</h3><p>' + esc(t('ai2')) + '</p>' + badge('svc') + '</a></div>';
    },
    present: function () {
      var rows = data.schools.map(function (s) { return '<tr><td>' + esc(sname(s)) + '</td><td>' + num(s.temp) + ' °C</td><td>' + num(s.humidity, 0) + ' %</td><td>' + num(s.co2, 0) + ' ppm</td></tr>'; }).join('');
      return head('h_present', 'p_present') + '<button class="btn noprint" type="button" id="pr">' + esc(t('print')) + '</button><h2 style="margin-top:18px">' + esc(t('h_island')) + '</h2><div class="mapbox">' + mapSvg(true) + '</div><table style="margin-top:14px"><tbody>' + rows + '</tbody></table><p class="note">' + esc(t('privacy')) + '</p>';
    },
    people: function () {
      return head('h_people', 'p_people') + '<div class="grid">' + data.schools.map(function (s) { return '<div class="tile"><h3>' + esc(sname(s)) + '</h3><p>' + s.sensors + ' ' + esc(t('k_sensors').toLowerCase()) + '</p></div>'; }).join('') + '</div>';
    },
    portfolio: function () {
      return head('h_portfolio', 'p_portfolio') + '<a class="btn" href="/app/">' + esc(t('open_app')) + '</a>';
    },
    build: function () {
      return head('h_build', 'p_build') + '<ol class="steps"><li>' + esc(t('b1')) + '</li><li>' + esc(t('b2')) + '</li><li>' + esc(t('b3')) + '</li><li>' + esc(t('b4')) + '</li></ol><p class="note">' + esc(t('mcp')) + '</p><a class="btn" href="/app/">' + esc(t('open_app')) + '</a>';
    }
  };

  var AFTER = {};
  function nav() {
    var cur = current(), h = '', last = null;
    ROUTES.forEach(function (r) {
      if (r.g && r.g !== last) { h += '<div class="grp">' + esc(t(r.g)) + '</div>'; last = r.g; }
      h += '<a href="#/' + r.id + '"' + (r.id === cur ? ' aria-current="page"' : '') + '>' + esc(t(r.n)) + '</a>';
    });
    var tl = (window.AISC && window.AISC.tools) || [];
    if (tl.length) {
      h += '<div class="grp">' + esc(t('n_portfolio')) + '</div>';
      tl.slice(0, 8).forEach(function (p) { h += '<a href="#/tool/' + p.id + '"' + (location.hash === '#/tool/' + p.id ? ' aria-current="page"' : '') + '>' + esc(p.title) + '</a>'; });
    }
    $('nav').innerHTML = h;
  }
  function render() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-l]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.l === lang ? 'true' : 'false'); });
    $('mb').textContent = t('menu');
    nav();
    var m = $('main'), page = PAGES[current()] || PAGES[''];
    if (failed) { m.innerHTML = '<p>' + esc(t('fail')) + '</p>'; return; }
    if (!data) { m.innerHTML = '<p>' + esc(t('loading')) + '</p>'; return; }
    m.innerHTML = page();
    var af = AFTER[current()]; if (af) af(m);
    var pr = $('pr'); if (pr) pr.onclick = function () { window.print(); };
    m.querySelectorAll('[data-go]').forEach(function (g) {
      var go = function () { location.hash = '#/' + g.dataset.go; };
      g.onclick = go; g.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }
  document.querySelectorAll('[data-l]').forEach(function (b) { b.onclick = function () { lang = b.dataset.l; try { localStorage.setItem('aisc-lang', lang); } catch (e) {} render(); }; });
  $('mb').onclick = function () { var o = $('side').classList.toggle('open'); $('mb').setAttribute('aria-expanded', o ? 'true' : 'false'); };
  window.addEventListener('hashchange', function () { $('side').classList.remove('open'); render(); $('main').focus(); window.scrollTo(0, 0); });
  $('out').onclick = function () { fetch('/cities/api/logout', { method: 'POST' }).finally(function () { location.href = '/cities/login.html'; }); };
  window.AISC = { PAGES: PAGES, AFTER: AFTER, T: T, t: t, esc: esc, badge: badge, head: head, render: render, nav: nav, lang: function () { return lang; }, tools: [] };
  window.dispatchEvent(new Event('aisc-ready'));
  render();
  fetch('/cities/api/overview').then(function (r) { if (r.status === 401) { location.href = '/cities/login.html'; throw 0; } if (!r.ok) throw 1; return r.json(); })
    .then(function (d) { data = d; render(); }).catch(function (e) { if (e !== 0) { failed = true; render(); } });
})();
