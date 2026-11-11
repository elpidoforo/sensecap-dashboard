/*
  Today's desk: a daily checklist for a class, kept on this device only (localStorage, no accounts).
    Five checks. Three tick by themselves when the class opens the page (a vehicle or school page, the Explore tool "Sensor vs
    official", the Met Office record: /site/alerts-core.js watches the address bar). Two are written by the class: a daily
    question and one sentence about what changed since yesterday.
    "Since yesterday": the latest reading of a school against the same time yesterday, and today against yesterday in four
    small charts, all from /api/latest and /api/series (and the Met Office history for the station nearest the school).
  Sources: /api/config /api/devices /api/latest /api/series /api/cydom /api/cydom/history /api/dom/page?name=warnings
  /api/dom/pages/history. Nothing here prints a position or a student name. Refreshes every 60 s.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/desk.css');
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };
  const HOUR = 3600000, DAY = 86400000, GPS = new Set(['4197', '4198']);
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function loadCore() {
    if (SC.alerts) return Promise.resolve();
    return new Promise((ok, no) => {
      let s = document.getElementById('alerts-core');
      if (!s) { s = document.createElement('script'); s.id = 'alerts-core'; s.src = '/site/alerts-core.js'; document.head.append(s); }
      s.addEventListener('error', () => no(new Error('alerts-core.js could not be loaded')));
      let n = 0;
      const poll = setInterval(() => { if (SC.alerts) { clearInterval(poll); ok(); } else if (++n > 100) { clearInterval(poll); no(new Error('alerts-core.js could not be loaded')); } }, 50);
    });
  }

  const PATH = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  function ico(name) {
    const s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'dk-svg' });
    s.innerHTML = PATH[name] || '';   // static strings above, never data
    return s;
  }

  /* ---------- the five checks ---------- */
  const QUESTIONS = [
    ['Which of the four schools is warmest right now, and is the nearest Met Office station warmer or cooler?', 'Ποιο από τα τέσσερα σχολεία είναι το θερμότερο αυτή τη στιγμή και ο πλησιέστερος σταθμός της Μετεωρολογικής είναι θερμότερος ή ψυχρότερος;', '#/board'],
    ['Did the CO2 in a classroom rise during a lesson and fall at break? What does that tell you?', 'Ανέβηκε το CO2 σε μια τάξη κατά το μάθημα και έπεσε στο διάλειμμα; Τι σας λέει αυτό;', '#/explore?tool=timeline&mid=4100'],
    ['Is the humidity higher or lower than yesterday at the same time? What could explain it?', 'Η υγρασία είναι υψηλότερη ή χαμηλότερη από χθες την ίδια ώρα; Τι θα μπορούσε να το εξηγεί;', '#/explore?tool=compare'],
    ['Read the Met Office warnings. Does anything in them matter for your school today?', 'Διαβάστε τις προειδοποιήσεις της Μετεωρολογικής. Αφορά κάτι από αυτές το σχολείο σας σήμερα;', '#/weather'],
    ['Pick one vehicle. Where did its last trip go, and what was the temperature along it?', 'Διαλέξτε ένα όχημα. Πού πήγε η τελευταία του διαδρομή και ποια ήταν η θερμοκρασία κατά μήκος της;', '#/trip'],
    ['Which reading changed most since yesterday at your school? Why do you think so?', 'Ποια μέτρηση άλλαξε περισσότερο από χθες στο σχολείο σας; Γιατί νομίζετε;', '#/explore?tool=compare'],
    ['Is our sensor higher or lower than the nearest official station? By how much?', 'Ο αισθητήρας μας δείχνει υψηλότερα ή χαμηλότερα από τον πλησιέστερο επίσημο σταθμό; Πόσο;', '#/explore?tool=official'],
    ['What is the highest temperature at any Met Office station today?', 'Ποια είναι η υψηλότερη θερμοκρασία σε οποιονδήποτε σταθμό της Μετεωρολογικής σήμερα;', '#/weather'],
    ['Which sensors have gone quiet, and what could be the reasons?', 'Ποιοι αισθητήρες έχουν σιωπήσει και ποιοι θα μπορούσαν να είναι οι λόγοι;', '#/alerts'],
    ['Is the air outside cleaner or dirtier than the 15 µg/m³ PM2.5 guide? Where did you find out?', 'Ο αέρας έξω είναι καθαρότερος ή πιο βρόμικος από το όριο των 15 µg/m³ PM2.5; Πού το βρήκατε;', '#/board'],
    ['If the CO2 in your classroom went over 1,000 ppm, what could the class do?', 'Αν το CO2 στην τάξη σας ξεπερνούσε τα 1.000 ppm, τι θα μπορούσε να κάνει η τάξη;', '#/alerts'],
    ['What is one thing the data cannot tell us about today?', 'Ποιο είναι ένα πράγμα που τα δεδομένα δεν μπορούν να μας πουν για σήμερα;', '#/board'],
    ['How far apart are the warmest and the coldest of our schools right now?', 'Πόσο απέχουν το θερμότερο και το ψυχρότερο από τα σχολεία μας αυτή τη στιγμή;', '#/board'],
    ['Which reading would you add to our sensors if you could? Why?', 'Ποια μέτρηση θα προσθέτατε στους αισθητήρες μας αν μπορούσατε; Γιατί;', '#/explore'],
  ];
  const GREEK_N = ['κανένας', 'ένας', 'δύο', 'τρεις', 'τέσσερις', 'πέντε'], EN_N = ['None', 'One', 'Two', 'Three', 'Four', 'Five'];

  /* ---------- the tilted progress ring (five segments) ---------- */
  function ringSvg(n) {
    const R = 112, CIR = 2 * Math.PI * R, SEG = CIR / 5, GAP = 11, DASH = SEG - GAP, cx = 150, cy = 140, sw = 38, ex = 16;
    const pat = (k) => { const a = []; for (let i = 0; i < k; i++) a.push(DASH, GAP); return a.length ? a.join(' ') + ' 0.01 ' + CIR : '0.01 ' + CIR; };
    const all = DASH + ' ' + GAP;
    const g = (y, stroke, dash) => sv('circle', { cx, cy: cy + y, r: R, fill: 'none', stroke, 'stroke-width': sw, 'stroke-dasharray': dash, transform: 'rotate(-90 ' + cx + ' ' + (cy + y) + ')' });
    return sv('svg', { viewBox: '0 0 300 300', 'aria-hidden': 'true' },
      sv('defs', null,
        sv('linearGradient', { id: 'dkgp', x1: 0, y1: 0, x2: 1, y2: 1 }, sv('stop', { offset: 0, 'stop-color': '#F7C46B' }), sv('stop', { offset: 0.55, 'stop-color': '#E8963F' }), sv('stop', { offset: 1, 'stop-color': '#E07F3F' })),
        sv('linearGradient', { id: 'dkgt', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: 0, 'stop-color': '#4a6486' }), sv('stop', { offset: 1, 'stop-color': '#2c4260' }))),
      g(ex, '#0f1b2e', all), g(ex, '#7a3d15', pat(n)), g(0, 'url(#dkgt)', all), g(0, 'url(#dkgp)', pat(n)),
      sv('circle', { cx, cy, r: R + 17, fill: 'none', stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1.2, 'stroke-dasharray': pat(n), transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }));
  }

  SC.register('desk', {
    title: ["Today's desk", 'Το γραφείο σήμερα'],
    async render(root, ctx) {
      await loadCore();
      const A = SC.alerts, D = A.desk;
      void ctx;
      const head = SC.head({
        title: T('Today’s desk', 'Το γραφείο σήμερα'), fresh: T('Loading…', 'Φόρτωση…'),
        lede: SC.day(Date.now()),
        help: ['Today’s desk is a small daily routine for a class, with five checks. Three tick by themselves when you open the right page: a vehicle or school page, the Sensor vs official tool in Explore, and the Met Office record. Two you write yourselves: an answer to the daily question and one sentence about what changed since yesterday. Your progress is kept in this browser only, on this device. Nothing is sent anywhere and nobody signs in. The numbers under "Since yesterday" are real readings of the school you choose, compared with the same time yesterday.',
          'Το γραφείο της ημέρας είναι μια μικρή καθημερινή ρουτίνα για μια τάξη, με πέντε ελέγχους. Οι τρεις συμπληρώνονται μόνοι τους όταν ανοίξετε τη σωστή σελίδα: σελίδα οχήματος ή σχολείου, το εργαλείο «Αισθητήρας και επίσημος σταθμός» στην Εξερεύνηση και το μετεωρολογικό αρχείο. Τους δύο τους γράφετε εσείς: μια απάντηση στην ερώτηση της ημέρας και μία πρόταση για το τι άλλαξε από χθες. Η πρόοδός σας κρατιέται μόνο σε αυτόν τον περιηγητή, σε αυτή τη συσκευή. Τίποτα δεν στέλνεται πουθενά και κανείς δεν συνδέεται. Οι αριθμοί στο «Από χθες» είναι πραγματικές μετρήσεις του σχολείου που επιλέγετε, σε σύγκριση με την ίδια ώρα χθες.'],
      });
      root.append(head);
      const pill = head.querySelector('.fresh-pill'), pageHead = head.querySelector('.page-head'), lede = head.querySelector('.lede');
      const heroBox = el('section', { class: 'nm-card dk-hero', 'aria-label': T('Progress today', 'Πρόοδος σήμερα') });
      const momBox = el('section', { class: 'nm-card dk-mom', 'aria-label': T('Since yesterday', 'Από χθες') });
      const questBox = el('section', { class: 'nm-card dk-quests', 'aria-label': T('Checks', 'Έλεγχοι') });
      const chartBox = el('section', { class: 'nm-card dk-charts', 'aria-label': T('Over the day', 'Μέσα στην ημέρα') });
      root.append(heroBox, momBox, el('div', { class: 'dk-two' }, questBox, chartBox));

      const S = { cfg: null, devices: [], latest: {}, cy: null, warn: null, whist: null, school: null, kinds: {}, met: null, errs: {}, loaded: false, edit: new Set(), busy: false };
      let alive = true;
      const kindLabel = { temp: T('Temperature', 'Θερμοκρασία'), hum: T('Humidity', 'Υγρασία'), co2: 'CO2' };
      const KCOL = { temp: '#E07F3F', hum: '#4CCBEA', co2: '#59d98e' };
      const KUNIT = { temp: '°C', hum: '%', co2: 'ppm' }, KDEC = { temp: 1, hum: 0, co2: 0 };

      /* ----- helpers on the data ----- */
      const schoolSite = () => (window.ISLAND && ISLAND.schools || []).find((s) => s.id === S.school);
      const devsOf = () => S.devices.filter((d) => { const sc = A.schoolOf(d); return sc && sc.id === S.school; });
      function freshest(kind) {   // the school device whose latest reading of this kind is newest
        let best = null;
        devsOf().forEach((d) => (d.measurements || []).forEach((mid) => {
          mid = String(mid); if (GPS.has(mid)) return;
          const k = A.kindOf(S.cfg, mid), r = S.latest[d.eui] && S.latest[d.eui][mid];
          if (!k || k.k !== kind || !r) return;
          const t = Date.parse(r.t), v = Number(r.v);
          if (fin(t) && fin(v) && (!best || t > best.t)) best = { d, mid, t, v };
        }));
        return best;
      }
      function nearestStation() {
        const site = schoolSite(), pts = S.cy && Array.isArray(S.cy.points) ? S.cy.points : [];
        if (!site) return null;
        let best = null;
        pts.forEach((p) => {
          const t = A.timeOf(p.time);
          if (!fin(p.temp) || !fin(p.lat) || !fin(p.lng) || !t || Date.now() - t > 3 * HOUR) return;
          const k = A.km(site.lat, site.lng, p.lat, p.lng);
          if (!best || k < best.k) best = { p, k, t };
        });
        return best;
      }
      const fmtV = (kind, v) => A.num(v, KDEC[kind]);
      const delta = (kind, d) => { const dec = KDEC[kind], z = Math.abs(d) < Math.pow(10, -dec) / 2; return z ? '= 0' : (d > 0 ? '▲ +' : '▼ −') + Math.abs(d).toFixed(dec); };

      /* ----- the data load ----- */
      async function loadKind(kind) {
        const pick = freshest(kind);
        if (!pick) return { none: true };
        if (Date.now() - pick.t > 3 * HOUR) return { none: true, stale: pick.t, d: pick.d };
        const out = { pick, now: pick.v, t: pick.t, d: pick.d, pts: [], today: [], yest: [] };
        try {
          const pts = await A.readSeries(pick.d.eui, pick.mid, 2);
          const m0 = A.cyStart(Date.now()), ref = pick.t - DAY;
          out.pts = pts;
          out.today = pts.filter((p) => p.t >= m0);
          out.yest = pts.filter((p) => p.t >= m0 - DAY && p.t <= Date.now() - DAY + 20 * 60000);
          const near = pts.filter((p) => Math.abs(p.t - ref) <= 30 * 60000);
          if (near.length) { out.then = near.reduce((a, p) => a + p.v, 0) / near.length; out.thenAt = ref; }
        } catch (e) { out.err = e; }
        return out;
      }
      async function loadAll(force) {
        const get = (u, ttl) => (force ? SC.api(u) : SC.cached(u, ttl));
        const [cfg, dev, lat, cy, warn] = await Promise.all([settle(get('/api/config', 300000)), settle(get('/api/devices', 30000)), settle(get('/api/latest', 30000)), settle(get('/api/cydom', 120000)), settle(get('/api/dom/page?name=warnings', 120000))]);
        S.cfg = cfg.ok ? cfg.v : { names: {} };
        S.devices = dev.ok && Array.isArray(dev.v) ? dev.v : [];
        S.latest = lat.ok && lat.v ? lat.v : {};
        S.cy = cy.ok ? cy.v : null; S.warn = warn.ok ? warn.v : null;
        S.errs = { devices: dev.ok ? null : dev.e, latest: lat.ok ? null : lat.e, cy: cy.ok ? null : cy.e, warn: warn.ok ? null : warn.e };
        if (!S.school) {
          const saved = SC.store.get('sc.desk.school');
          const withData = A.SCHOOLS.find((sc) => S.devices.some((d) => { const x = A.schoolOf(d); return x && x.id === sc.id && Date.now() - (Date.parse(d.lastSeen) || 0) < 6 * HOUR; }));
          S.school = A.SCHOOLS.some((sc) => sc.id === saved) ? saved : withData ? withData.id : A.SCHOOLS[0].id;
        }
        S.loaded = true;
        paintHead(); paintAll();
        await loadSchoolData();
      }
      async function loadSchoolData() {
        const school = S.school;
        const kinds = await Promise.all(['temp', 'hum', 'co2'].map(async (k) => [k, await loadKind(k)]));
        if (!alive || school !== S.school) return;
        S.kinds = Object.fromEntries(kinds);
        paintTiles(); paintCharts(); paintQuests(); paintHero();
        // the Met Office station nearest the school, today against yesterday
        const ns = nearestStation();
        S.met = null;
        if (ns) {
          const r = await settle(SC.cached('/api/cydom/history?station=' + encodeURIComponent(ns.p.id) + '&hours=48&keys=temp', 300000));
          if (!alive || school !== S.school) return;
          const i = r.ok && r.v && Array.isArray(r.v.keys) ? r.v.keys.indexOf('temp') : -1;
          const pts = i < 0 ? [] : (r.v.rows || []).map((x) => ({ t: x[0], v: x[i + 1] })).filter((p) => fin(p.t) && fin(p.v));
          S.met = { st: ns, pts, err: r.ok ? null : r.e };
        } else S.met = { st: null, pts: [] };
        paintCharts();
        if (S.whist == null) {
          const h = await settle(SC.api('/api/dom/pages/history?name=warnings&days=2'));
          if (alive) { S.whist = h.ok && Array.isArray(h.v) ? h.v : []; paintTiles(); }
        }
      }

      /* ----- head ----- */
      function paintHead() {
        const seen = S.devices.map((d) => Date.parse(d.lastSeen) || 0).filter(Boolean), last = seen.length ? Math.max(...seen) : 0, now = Date.now();
        if (S.errs.devices) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('Sensors unavailable', 'Οι αισθητήρες δεν είναι διαθέσιμοι'); }
        else if (!last) { pill.className = 'fresh-pill none'; pill.lastChild.textContent = T('No readings yet', 'Καμία μέτρηση ακόμα'); }
        else if (now - last > HOUR) { pill.className = 'fresh-pill stale'; pill.lastChild.textContent = T('Last reading ' + SC.ago(last), 'Τελευταία μέτρηση ' + SC.ago(last)); }
        else { pill.className = 'fresh-pill'; pill.lastChild.textContent = T('Live · ' + SC.ago(last), 'Ζωντανά · ' + SC.ago(last)); }
        lede.textContent = SC.day(now) + (last ? ' · ' + T('readings up to ' + SC.time(last), 'μετρήσεις έως ' + SC.time(last)) : '');
        const has = pageHead.querySelector('.t.demo');
        if (S.cfg && S.cfg.demo && !has) pageHead.insertBefore(el('span', { class: 't demo' }, T('Demo data', 'Δεδομένα επίδειξης')), lede);
        if (!(S.cfg && S.cfg.demo) && has) has.remove();
      }

      /* ----- the five checks ----- */
      const dayIdx = () => Math.floor((A.cyStart(Date.now()) + 12 * HOUR) / DAY);
      const todayQ = () => QUESTIONS[((dayIdx() % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length];
      function hintSensor() {
        const best = ['temp', 'hum', 'co2'].map((k) => freshest(k)).filter(Boolean).sort((a, b) => b.t - a.t)[0];
        const sc = A.SCHOOLS.find((s) => s.id === S.school);
        if (S.errs.devices || S.errs.latest) return T('The sensor readings could not be loaded right now. You can still open the pages.', 'Οι μετρήσεις των αισθητήρων δεν φορτώθηκαν αυτή τη στιγμή. Μπορείτε όμως να ανοίξετε τις σελίδες.');
        if (!best) return T('No sensor of ' + A.schoolName(sc) + ' has sent a reading in the last hours. Open the school page to see why.', 'Κανένας αισθητήρας του σχολείου ' + A.schoolName(sc) + ' δεν έστειλε μέτρηση τις τελευταίες ώρες. Ανοίξτε τη σελίδα του σχολείου για να δείτε γιατί.');
        const bits = [];
        ['temp', 'hum', 'co2'].forEach((k) => { const f = freshest(k); if (f && f.d.eui === best.d.eui) bits.push(fmtV(k, f.v) + ' ' + KUNIT[k] + (k === 'hum' ? ' ' + T('humidity', 'υγρασία') : k === 'co2' ? ' CO2' : '')); });
        return [el('b', null, best.d.name || best.d.eui), T(' reads ' + bits.join(', ') + ' · ' + SC.ago(best.t), ' μετρά ' + bits.join(', ') + ' · ' + SC.ago(best.t))];
      }
      function hintOfficial() {
        if (S.errs.cy && !S.cy) return T('The Met Office stations are not available right now.', 'Οι σταθμοί της Μετεωρολογικής δεν είναι διαθέσιμοι αυτή τη στιγμή.');
        const ns = nearestStation(), tk = S.kinds.temp;
        if (!ns) return T('No Met Office station has a recent temperature reading right now.', 'Κανένας σταθμός της Μετεωρολογικής δεν έχει πρόσφατη μέτρηση θερμοκρασίας αυτή τη στιγμή.');
        const ours = tk && tk.now != null ? T('Our sensor reads ' + A.num(tk.now, 1) + ' °C. ', 'Ο αισθητήρας μας μετρά ' + A.num(tk.now, 1) + ' °C. ') : '';
        return ours + T('The nearest Met Office station, ' + ns.p.name + ', reads ' + A.num(ns.p.temp, 1) + ' °C. Which one is closer to the air outside?', 'Ο πλησιέστερος σταθμός της Μετεωρολογικής, ' + ns.p.name + ', μετρά ' + A.num(ns.p.temp, 1) + ' °C. Ποιος είναι πιο κοντά στον αέρα έξω;');
      }
      function hintWarn() {
        if (S.errs.warn && !S.warn) return T('The warnings page could not be read right now.', 'Η σελίδα προειδοποιήσεων δεν διαβάστηκε αυτή τη στιγμή.');
        if (!S.warn) return T('Loading', 'Φόρτωση');
        const lvl = A.warnLevel(S.warn.text);
        return lvl === 0 ? T('The Met Office lists no warnings in force right now. Reading it is still the check.', 'Η Μετεωρολογική δεν αναφέρει προειδοποιήσεις σε ισχύ αυτή τη στιγμή. Ο έλεγχος είναι να τη διαβάσετε.') : T('In force: ' + A.clean(S.warn.text).slice(0, 140) + (A.clean(S.warn.text).length > 140 ? '…' : ''), 'Σε ισχύ: ' + A.clean(S.warn.text).slice(0, 140) + (A.clean(S.warn.text).length > 140 ? '…' : ''));
      }
      function changeSentence() {   // the biggest change among the three readings, in words
        let best = null;
        ['temp', 'hum', 'co2'].forEach((k) => { const x = S.kinds[k]; if (x && x.then != null) { const d = x.now - x.then, rel = Math.abs(d) / Math.max(1, Math.abs(x.then)); if (!best || rel > best.rel) best = { k, d, rel }; } });
        if (!best) return null;
        const up = best.d > 0, v = Math.abs(best.d).toFixed(KDEC[best.k]);
        const neuter = best.k === 'co2', el1 = { temp: 'Η θερμοκρασία', hum: 'Η υγρασία', co2: 'Το CO2' }[best.k];
        return T(kindLabel[best.k] + ' is ' + v + ' ' + KUNIT[best.k] + (up ? ' higher' : ' lower') + ' than yesterday at the same time.', el1 + ' είναι ' + v + ' ' + KUNIT[best.k] + (up ? (neuter ? ' υψηλότερο' : ' υψηλότερη') : (neuter ? ' χαμηλότερο' : ' χαμηλότερη')) + ' από χθες την ίδια ώρα.');
      }
      function quests() {
        const q = todayQ(), sc = A.SCHOOLS.find((s) => s.id === S.school);
        return [
          { id: 'sensor', tag: ['ok', T('Sensor', 'Αισθητήρας')], mins: 3, title: T('Check a sensor', 'Ελέγξτε έναν αισθητήρα'), hint: hintSensor(), how: T('Ticks when you open a vehicle or a school page today.', 'Συμπληρώνεται όταν ανοίξετε σήμερα σελίδα οχήματος ή σχολείου.'),
            go: [['#/vehicles', T('Open Vehicles', 'Άνοιγμα Οχημάτων')], ['#/schools?school=' + (sc ? sc.id : ''), T('Open the school', 'Άνοιγμα σχολείου')]] },
          { id: 'official', tag: ['warn', T('Compare', 'Σύγκριση')], mins: 5, title: T('Compare a sensor with an official station', 'Συγκρίνετε έναν αισθητήρα με επίσημο σταθμό'), hint: hintOfficial(), how: T('Ticks when you open the Sensor vs official tool in Explore.', 'Συμπληρώνεται όταν ανοίξετε το εργαλείο «Αισθητήρας και επίσημος σταθμός» στην Εξερεύνηση.'),
            go: [['#/explore?tool=official', T('Open Sensor vs official', 'Άνοιγμα Αισθητήρας και επίσημος')]] },
          { id: 'warnings', tag: ['info', T('Met Office', 'Μετεωρολογική')], mins: 2, title: T('Read today’s Met Office warnings', 'Διαβάστε τις σημερινές προειδοποιήσεις της Μετεωρολογικής'), hint: hintWarn(), how: T('Ticks when you open the Met Office record today.', 'Συμπληρώνεται όταν ανοίξετε σήμερα το μετεωρολογικό αρχείο.'),
            go: [['#/weather', T('Open the Met Office record', 'Άνοιγμα μετεωρολογικού αρχείου')]] },
          { id: 'question', tag: ['violet', T('Question', 'Ερώτηση')], mins: 3, text: true, title: T('Answer today’s question', 'Απαντήστε στην ερώτηση της ημέρας'), hint: T(q[0], q[1]), how: T('Ticks when you save your answer.', 'Συμπληρώνεται όταν αποθηκεύσετε την απάντησή σας.'),
            go: [[q[2], T('Find the data', 'Βρείτε τα δεδομένα')]], ph: T('Our answer, in one or two sentences', 'Η απάντησή μας, σε μία ή δύο προτάσεις') },
          { id: 'change', tag: ['violet', T('Team log', 'Ημερολόγιο ομάδας')], mins: 2, text: true, title: T('Write one sentence about what changed since yesterday', 'Γράψτε μία πρόταση για το τι άλλαξε από χθες'), hint: changeSentence() || T('Use the numbers under “Since yesterday”.', 'Χρησιμοποιήστε τους αριθμούς στο «Από χθες».'), how: T('Ticks when you save the sentence.', 'Συμπληρώνεται όταν αποθηκεύσετε την πρόταση.'),
            go: [], ph: T('Today, compared with yesterday, we saw that…', 'Σήμερα, σε σύγκριση με χθες, είδαμε ότι…') },
        ];
      }

      function paintHero() {
        const st = D.get(), n = D.CHECKS.filter((k) => st[k]).length, left = 5 - n, streak = D.streak();
        const qs = quests(), next = qs.find((q) => !st[q.id]);
        const h1 = el('h1', null,
          el('span', null, T(n + ' of 5 checks done.', n === 1 ? 'Έγινε 1 από 5 έλεγχος.' : 'Έγιναν ' + n + ' από 5 έλεγχοι.')),
          el('span', null, left ? T(EN_N[left] + ' to go.', left === 1 ? 'Απομένει ένας.' : 'Απομένουν ' + GREEK_N[left] + '.') : T('Well done.', 'Μπράβο.')));
        h1.setAttribute('aria-live', 'polite');
        const go = () => {
          if (!next) { location.hash = '#/board'; return; }
          if (next.text) { const c = questBox.querySelector('[data-q="' + next.id + '"]'); if (c) { c.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' }); const ta = c.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true }); } return; }
          location.hash = next.go[0][0];
        };
        fill(heroBox,
          el('div', null,
            el('div', { class: 'dk-eb' }, T('Today’s desk · team check-in', 'Το γραφείο σήμερα · έλεγχος ομάδας'), streak ? el('span', { class: 'dk-streak' }, ico('flame'), T(streak + (streak === 1 ? ' day' : ' days') + ' in a row', streak + (streak === 1 ? ' ημέρα' : ' ημέρες') + ' στη σειρά')) : null),
            h1,
            el('p', null, T('Each check takes a few minutes and uses live readings from our schools and the Met Office. ', 'Κάθε έλεγχος παίρνει λίγα λεπτά και χρησιμοποιεί ζωντανές μετρήσεις από τα σχολεία μας και τη Μετεωρολογική. ') +
              (left ? (streak ? T('Finish all five today to keep your ' + streak + '-day streak going.', 'Ολοκληρώστε και τους πέντε σήμερα για να συνεχίσει η σειρά των ' + streak + ' ημερών.') : T('Finish all five today to start a streak.', 'Ολοκληρώστε και τους πέντε σήμερα για να ξεκινήσετε μια σειρά ημερών.')) : T('Come back tomorrow for five new checks.', 'Ελάτε αύριο για πέντε νέους ελέγχους.'))),
            el('div', { class: 'dk-acts' },
              el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: go }, next ? T('Start the next check', 'Ξεκινήστε τον επόμενο έλεγχο') : T('See the City board', 'Δείτε τον Πίνακα πόλης')),
              el('button', { class: 'nm-btn', type: 'button', onclick: () => questBox.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'start' }) }, T('See all checks', 'Δείτε όλους τους ελέγχους')))),
          el('div', { class: 'dk-ringwrap', role: 'img', 'aria-label': T(n + ' of 5 checks done today', n + ' από 5 έλεγχοι ολοκληρώθηκαν σήμερα') },
            el('div', { class: 'dk-ring-tilt' }, ringSvg(n)), el('div', { class: 'dk-ring-num' }, el('b', null, String(n))),
            el('div', { class: 'dk-ring-cap' }, T('of 5 checks done today', 'από 5 έλεγχοι σήμερα'))));
      }

      function paintQuests() {
        const st = D.get(), qs = quests(), next = qs.find((q) => !st[q.id]), n = D.CHECKS.filter((k) => st[k]).length;
        const card = (q) => {
          const done = Boolean(st[q.id]), saved = q.text && done ? st[q.id] : null, editing = q.text && (!done || S.edit.has(q.id));
          const isNext = next && next.id === q.id;
          let body = null;
          if (q.text) {
            if (editing) {
              const ta = el('textarea', { class: 'nm-input', maxlength: 300, rows: 3, placeholder: q.ph, 'aria-label': q.title });
              if (saved) ta.value = saved.text;
              const save = el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: () => {
                const v = ta.value.trim();
                if (v.length < 3) { SC.toast(T('Write a few words first.', 'Γράψτε πρώτα μερικές λέξεις.')); ta.focus(); return; }
                D.write(q.id, v); S.edit.delete(q.id); SC.toast(T('Saved on this device.', 'Αποθηκεύτηκε σε αυτή τη συσκευή.'));
              } }, T('Save', 'Αποθήκευση'));
              body = el('div', { class: 'dk-write' }, ta, el('div', { class: 'row' }, save, saved ? el('button', { class: 'nm-btn', type: 'button', onclick: () => { S.edit.delete(q.id); paintQuests(); } }, T('Cancel', 'Άκυρο')) : null,
                el('span', { class: 'muted', style: { fontSize: '12.5px' } }, T('Kept on this device only.', 'Κρατιέται μόνο σε αυτή τη συσκευή.'))));
            } else body = [el('p', { class: 'dk-saved' }, saved.text), el('div', { class: 'dk-go' }, el('button', { class: 'nm-btn', type: 'button', onclick: () => { S.edit.add(q.id); paintQuests(); } }, T('Edit', 'Επεξεργασία')),
              el('span', { class: 'muted', style: { fontSize: '12.5px', alignSelf: 'center' } }, T('Saved ' + A.when(saved.at), 'Αποθηκεύτηκε ' + A.when(saved.at))))];
          }
          const links = q.go.length && !(q.text && done) ? el('div', { class: 'dk-go' }, q.go.map(([href, label]) => el('a', { class: 'nm-btn', href }, label, ico('arrow')))) : null;
          return el('article', { class: 'dk-quest' + (done ? ' done' : '') + (isNext ? ' next' : ''), dataset: { q: q.id } },
            el('span', { class: 'cb', role: 'img', 'aria-label': done ? T('Done', 'Έγινε') : T('Not done yet', 'Δεν έγινε ακόμα') }, ico('check')),
            el('div', { class: 'qt' }, el('h3', null, q.title), el('small', null, q.hint),
              done && !q.text ? el('small', null, T('Done at ' + SC.time(st[q.id]) + '.', 'Έγινε στις ' + SC.time(st[q.id]) + '.')) : null,
              body, links, !done ? el('p', { class: 'dk-how' }, q.how) : null),
            el('div', { class: 'qm' }, el('span', { class: 'nm-badge nm-badge--' + (isNext ? 'warn' : q.tag[0]) }, isNext ? T('Next up', 'Επόμενο') : q.tag[1]), el('span', { class: 'mins' }, T(q.mins + ' min', q.mins + ' λεπτά'))));
        };
        fill(questBox,
          el('div', { class: 'dk-card-h' }, el('div', null, el('h2', null, T('The five checks', 'Οι πέντε έλεγχοι')), el('p', { class: 'sub' }, T('Three tick by themselves when you open the page. Two you write.', 'Οι τρεις συμπληρώνονται μόνοι τους όταν ανοίξετε τη σελίδα. Τους δύο τους γράφετε.'))),
            el('span', { class: 'nm-badge nm-badge--' + (n === 5 ? 'ok' : 'info') }, T(n + ' of 5 done', n + ' από 5 έγιναν'))),
          el('div', { class: 'dk-q-list' }, qs.map(card)),
          el('div', { class: 'dk-q-foot' }, el('span', { class: 'grow' }, ico('clock'), ' ', T('A new day starts at midnight, Cyprus time. Progress stays on this device and is not sent anywhere.', 'Μια νέα ημέρα ξεκινά τα μεσάνυχτα, ώρα Κύπρου. Η πρόοδος μένει σε αυτή τη συσκευή και δεν στέλνεται πουθενά.')),
            n ? el('button', { class: 'nm-btn', type: 'button', onclick: () => SC.modal({ title: T('Start again for another class?', 'Νέα εκκίνηση για άλλη τάξη;'), body: el('p', null, T('This clears today’s checks and the two sentences on this device.', 'Αυτό διαγράφει τους σημερινούς ελέγχους και τις δύο προτάσεις σε αυτή τη συσκευή.')),
              actions: [{ label: T('Cancel', 'Άκυρο') }, { label: T('Clear today', 'Διαγραφή σήμερα'), primary: true, run: () => { D.reset(); S.edit.clear(); } }] }) }, T('Start again for another class', 'Νέα εκκίνηση για άλλη τάξη')) : null));
      }

      /* ----- since yesterday ----- */
      function tile(kind) {
        const x = S.kinds[kind], c = KCOL[kind], sch = A.SCHOOLS.find((s) => s.id === S.school);
        const wrap = (kids) => { const n = el('div', { class: 'dk-tile' }, kids); n.style.setProperty('--tc', c); return n; };
        if (!x) return wrap([el('div', { class: 'dk-tile-h' }, el('span', { class: 'td' }), kindLabel[kind]), el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))]);
        if (x.none) {
          return wrap([el('div', { class: 'dk-tile-h' }, el('span', { class: 'td' }), kindLabel[kind]),
            el('div', { class: 'dk-tile-n' }, el('b', null, '–')),
            el('div', { class: 'none' }, x.stale ? T('No reading in the last 3 hours (last ' + A.when(x.stale) + ').', 'Καμία μέτρηση τις τελευταίες 3 ώρες (τελευταία ' + A.when(x.stale) + ').') : devsOf().length ? T('No sensor of this school reports ' + kindLabel[kind].toLowerCase() + '.', 'Κανένας αισθητήρας του σχολείου δεν στέλνει ' + kindLabel[kind].toLowerCase() + '.') : T('No sensor of ' + A.schoolName(sch) + ' is listed yet.', 'Δεν έχει καταχωριστεί ακόμα αισθητήρας για το σχολείο ' + A.schoolName(sch) + '.'))]);
        }
        const hasThen = x.then != null, d = hasThen ? x.now - x.then : null;
        const spark = x.today.length > 1 ? SCChart.spark(x.today.map((p) => p.v), { w: 220, h: 40, color: c }) : null;
        if (spark) spark.setAttribute('preserveAspectRatio', 'none');
        return wrap([
          el('div', { class: 'dk-tile-h' }, el('span', { class: 'td' }), kindLabel[kind], hasThen ? el('span', { class: 'nm-badge nm-badge--info', title: T('Compared with the same time yesterday', 'Σε σύγκριση με την ίδια ώρα χθες') }, delta(kind, d)) : null),
          el('div', { class: 'dk-tile-n' }, el('b', null, fmtV(kind, x.now)), el('small', null, KUNIT[kind] + ' · ' + SC.ago(x.t))),
          el('div', { class: 'dk-tile-ch' }, spark),
          el('div', { class: 'dk-tile-f' }, x.err ? T('Yesterday’s readings could not be loaded.', 'Οι χθεσινές μετρήσεις δεν φορτώθηκαν.') : hasThen ? T('Yesterday at ' + SC.time(x.thenAt) + ' ' + fmtV(kind, x.then) + ' ' + KUNIT[kind] + ' · ', 'Χθες στις ' + SC.time(x.thenAt) + ' ' + fmtV(kind, x.then) + ' ' + KUNIT[kind] + ' · ') + (x.d.name || '') : T('No reading at this time yesterday. ', 'Δεν υπάρχει μέτρηση αυτή την ώρα χθες. ') + (x.d.name || ''))]);
      }
      function warnTile() {
        const wrap = (kids) => { const n = el('div', { class: 'dk-tile' }, kids); n.style.setProperty('--tc', '#F0B94A'); return n; };
        const h = el('div', { class: 'dk-tile-h' }, el('span', { class: 'td' }), T('Met Office warnings', 'Προειδοποιήσεις Μετεωρολογικής'));
        if (!S.warn) return wrap([h, S.errs.warn ? el('div', { class: 'none' }, T('The warnings page could not be read.', 'Η σελίδα προειδοποιήσεων δεν διαβάστηκε.')) : el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))]);
        const lvl = A.warnLevel(S.warn.text), names = ['', T('yellow', 'κίτρινη'), T('orange', 'πορτοκαλί'), T('red', 'κόκκινη')];
        const wh = Array.isArray(S.whist) ? S.whist.filter((v) => Date.now() - v.t < DAY) : null;
        const checked = S.warn.fetched ? Date.parse(S.warn.fetched) : 0;
        return wrap([h,
          el('div', { class: 'dk-tile-n' }, el('b', null, lvl === 0 ? T('None', 'Καμία') : T('In force', 'Σε ισχύ')), el('small', null, lvl > 0 ? names[lvl] : T('in force', 'σε ισχύ'))),
          el('div', { class: 'dk-tile-ch' }),
          el('div', { class: 'dk-tile-f' }, (wh && wh.length > 1 ? T((wh.length - 1) + ' change' + (wh.length > 2 ? 's' : '') + ' in the last 24 hours · ', (wh.length - 1) + ' αλλαγ' + (wh.length > 2 ? 'ές' : 'ή') + ' τις τελευταίες 24 ώρες · ') : wh ? T('No change in the last 24 hours · ', 'Καμία αλλαγή τις τελευταίες 24 ώρες · ') : '') + (checked ? T('checked ' + SC.ago(checked), 'έλεγχος ' + SC.ago(checked)) : ''))]);
      }
      function paintTiles() {
        const sel = el('select', { class: 'nm-input', id: 'dk-school', onchange: (e) => { S.school = e.target.value; SC.store.set('sc.desk.school', S.school); S.kinds = {}; S.met = undefined; paintTiles(); paintCharts(); paintQuests(); loadSchoolData(); } },
          A.SCHOOLS.map((s) => el('option', { value: s.id, selected: s.id === S.school || null }, A.schoolName(s))));
        fill(momBox,
          el('div', { class: 'dk-card-h' }, el('div', null, el('h2', null, T('Since yesterday', 'Από χθες')), el('p', { class: 'sub' }, T('The latest readings of one school against the same time yesterday. Numbers only, no opinions. The arrow shows the change.', 'Οι τελευταίες μετρήσεις ενός σχολείου σε σύγκριση με την ίδια ώρα χθες. Μόνο αριθμοί, χωρίς γνώμες. Το βέλος δείχνει την αλλαγή.'))),
            el('label', { class: 'dk-sel', for: 'dk-school' }, T('School', 'Σχολείο'), sel)),
          S.errs.devices && !S.devices.length ? el('div', { class: 'err', role: 'alert' }, T('The sensors could not be loaded. ', 'Οι αισθητήρες δεν φορτώθηκαν. ') + (S.errs.devices.message || ''), ' ', el('button', { class: 'nm-btn', type: 'button', onclick: () => loadAll(true) }, T('Try again', 'Δοκιμάστε ξανά'))) : el('div', { class: 'dk-tiles' }, tile('temp'), tile('hum'), tile('co2'), warnTile()));
      }

      /* ----- over the day: today against yesterday ----- */
      function chartCard(kind, x) {
        const color = KCOL[kind], box = el('div');
        const head = el('div', { class: 'dk-cbox-h' }, el('div', null, el('div', { class: 'k' }, kindLabel[kind]), el('div', { class: 's' }, x && x.d ? x.d.name : '')),
          x && x.now != null ? el('div', { class: 'v' }, fmtV(kind, x.now), el('small', null, KUNIT[kind])) : null);
        if (!x) return el('div', { class: 'dk-cbox' }, head, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        if (x.none || x.today.length < 2) return el('div', { class: 'dk-cbox' }, head, el('div', { class: 'none' }, x.none ? T('No recent reading from this school.', 'Καμία πρόσφατη μέτρηση από αυτό το σχολείο.') : x.err ? T('The history could not be loaded.', 'Το ιστορικό δεν φορτώθηκε.') : T('Not enough readings today yet to draw a line.', 'Δεν υπάρχουν ακόμα αρκετές μετρήσεις σήμερα για γραμμή.')));
        SCChart.line(box, [{ name: T('Today', 'Σήμερα'), color, pts: x.today, area: true }, { name: T('Yesterday', 'Χθες'), color: '#8CA0B8', dash: true, pts: x.yest.map((p) => ({ t: p.t + DAY, v: p.v })) }],
          { unit: KUNIT[kind], dec: KDEC[kind], w: 300, h: 190, gap: 45 * 60000, label: kindLabel[kind] + ' ' + T('today and yesterday', 'σήμερα και χθες'), latest: '' });
        return el('div', { class: 'dk-cbox' }, head, box);
      }
      function metCard() {
        const m = S.met, head = (ns, v) => el('div', { class: 'dk-cbox-h' }, el('div', null, el('div', { class: 'k' }, T('Met Office station', 'Σταθμός Μετεωρολογικής')), el('div', { class: 's' }, ns ? ns.p.name : '')),
          v != null ? el('div', { class: 'v' }, A.num(v, 1), el('small', null, '°C')) : null);
        if (m === undefined || m === null) return el('div', { class: 'dk-cbox' }, head(null), el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
        if (!m.st) return el('div', { class: 'dk-cbox' }, head(null), el('div', { class: 'none' }, T('No Met Office station has a recent reading right now.', 'Κανένας σταθμός της Μετεωρολογικής δεν έχει πρόσφατη μέτρηση αυτή τη στιγμή.')));
        const m0 = A.cyStart(Date.now()), now = Date.now();
        const today = m.pts.filter((p) => p.t >= m0), yest = m.pts.filter((p) => p.t >= m0 - DAY && p.t <= now - DAY + 20 * 60000);
        if (today.length < 2) return el('div', { class: 'dk-cbox' }, head(m.st, m.st.p.temp), el('div', { class: 'none' }, T('The history of this station is still being collected on this server.', 'Το ιστορικό αυτού του σταθμού συλλέγεται ακόμα σε αυτόν τον διακομιστή.')));
        const box = el('div');
        SCChart.line(box, [{ name: T('Today', 'Σήμερα'), color: '#F2A56B', pts: today, area: true }, { name: T('Yesterday', 'Χθες'), color: '#8CA0B8', dash: true, pts: yest.map((p) => ({ t: p.t + DAY, v: p.v })) }],
          { unit: '°C', dec: 1, w: 300, h: 190, gap: 45 * 60000, label: T('Met Office temperature today and yesterday', 'Θερμοκρασία Μετεωρολογικής σήμερα και χθες'), latest: '' });
        return el('div', { class: 'dk-cbox' }, head(m.st, m.st.p.temp), box);
      }
      function paintCharts() {
        fill(chartBox,
          el('div', { class: 'dk-card-h' }, el('div', null, el('h2', null, T('Over the day', 'Μέσα στην ημέρα')), el('p', { class: 'sub' }, T('Today from midnight (solid) with yesterday on the same hours (dashed), for the school chosen above. The fourth chart is the nearest Met Office station.', 'Σήμερα από τα μεσάνυχτα (συνεχής γραμμή) με τη χθεσινή ημέρα στις ίδιες ώρες (διακεκομμένη), για το σχολείο που επιλέξατε. Το τέταρτο γράφημα είναι ο πλησιέστερος σταθμός της Μετεωρολογικής.')))),
          el('div', { class: 'dk-cgrid' }, chartCard('temp', S.kinds.temp), chartCard('hum', S.kinds.hum), chartCard('co2', S.kinds.co2), metCard()),
          el('div', { class: 'dk-q-foot' }, el('span', { class: 'grow' }, T('A line stops where there is no reading. For CO2 in a classroom, 1,000 ppm is the usual line to stay under.', 'Η γραμμή σταματά όπου δεν υπάρχει μέτρηση. Για το CO2 σε τάξη, τα 1.000 ppm είναι το συνηθισμένο όριο, κάτω από το οποίο θέλουμε να μένουμε.'))));
      }

      function paintAll() { paintHero(); paintTiles(); paintQuests(); paintCharts(); }

      // the desk repaints when a check is ticked (a page was opened, or another tab wrote)
      const onDesk = () => { if (alive) { paintHero(); paintQuests(); } };
      window.addEventListener('sc-desk', onDesk);
      window.addEventListener('storage', onDesk);
      let dayNow = A.cyDay();
      const timer = setInterval(() => { if (!alive) return; if (A.cyDay() !== dayNow) { dayNow = A.cyDay(); S.edit.clear(); paintHero(); paintQuests(); } loadAll(false); }, 60000);

      fill(heroBox, el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      await loadAll(false);
      return () => { alive = false; clearInterval(timer); window.removeEventListener('sc-desk', onDesk); window.removeEventListener('storage', onDesk); };
    },
  });
})();
