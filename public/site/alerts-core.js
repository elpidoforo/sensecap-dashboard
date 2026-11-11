/*
  Alerts core. Shared by the Alerts page, the Today's desk page, the Follow one trip page and the menu badge.

    SC.alertsEvaluate({ force })  -> Promise<{ at, alerts, ended, rules, rulesFrom, problems, checked }>
        Reads the rules (GET /app/api/alerts/rules, or the built-in defaults when the server has none yet) and checks
        every enabled rule in the browser against public data: /api/devices /api/latest /api/cydom /api/opensensors
        /api/dom/page?name=warnings (+ /api/series to find when a reading crossed its line). Cached for 60 s.
        An alert names its source and its rule, never a person, and never carries a coordinate.
    SC.alertCount()               -> Promise<number>   open alerts that are not muted on this device. Never rejects (0 on failure).
                                     The menu badge and the Alerts page both read this, so they agree.
    SC.alerts                     helpers: mute / unmute / isMuted, SCHOOLS, schoolOf, cyDay, cyStart, desk (Today's desk progress)

  Today's desk visits are tracked here too (a hashchange listener), so the checklist knows which pages the class opened today.
  Load this file once from index.html for a complete record; each of the three pages also loads it when it is missing.
*/
(function () {
  'use strict';
  const SC = (window.SC = window.SC || {});
  if (SC.alertsEvaluate) return;

  const T = (en, el) => (SC.t ? SC.t(en, el) : en);
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const FRESH = 90 * MIN;   // a reading older than this is not "now": the sensor-quiet rule speaks for that sensor
  const TTL = 60000;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const settle = async (p) => { try { return { ok: true, v: await p }; } catch (e) { return { ok: false, e }; } };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  /* ---------- Cyprus clock ---------- */
  const TZ = 'Asia/Nicosia';
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const cyDay = (t) => dayFmt.format(t == null ? Date.now() : t);   // 'YYYY-MM-DD'
  function cyOff(t) {
    const p = {};
    partsFmt.formatToParts(t).forEach((x) => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / MIN) * MIN;
  }
  function cyStart(t) {   // the instant (ms) when the Cyprus day that holds t began
    t = t == null ? Date.now() : t;
    const local = t + cyOff(t), startLocal = Math.floor(local / DAY) * DAY;
    return startLocal - cyOff(startLocal - cyOff(t));
  }
  const when = (t) => {   // 15:40 today, "yesterday 14:10", or "10 Nov 14:10"
    if (!t) return '–';
    const d = cyDay(t), today = cyDay(), yest = cyDay(Date.now() - DAY);
    if (d === today) return SC.time(t);
    if (d === yest) return T('yesterday ', 'χθες ') + SC.time(t);
    return SC.dateTime(t);
  };
  const numA = (v) => num(v, fin(v) && v % 1 ? 1 : 0);   // 25 or 25.5
  const num = (v, dec) => {
    if (!fin(v)) return '–';
    return Number(v).toLocaleString(SC.lang === 'el' ? 'el-GR' : 'en-GB', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }).replace('-', '−');
  };
  const dur = (ms, long) => {   // 25 min / 3 h 05 min / 2 days   (long: 25 minutes / 3 hours / 2 days)
    const m = Math.max(1, Math.round(ms / MIN));
    if (m < 90) return long ? T(m + ' minutes', m + ' λεπτά') : T(m + ' min', m + ' λεπτά');
    if (m < 2 * 1440) {
      const h = Math.floor(m / 60), mm = m % 60, p = (mm < 10 ? '0' : '') + mm;
      if (long) { const hr = Math.round(m / 60); return T(hr + ' hours', hr + ' ώρες'); }
      return mm ? T(h + ' h ' + p + ' min', h + ' ώρες ' + p + ' λεπτά') : T(h + ' h', h + ' ώρες');
    }
    const d = Math.round(m / 1440);
    return T(d + ' days', d + ' ημέρες');
  };

  /* ---------- schools ---------- */
  const SCHOOLS = [
    { id: 'larnaka', name: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], re: /larnak|larnac|λάρνακ/i },
    { id: 'lefkosia', name: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], re: /lefkos|nicosia|λευκωσ/i },
    { id: 'limassol', name: ['PASCAL Limassol', 'PASCAL Λεμεσός'], re: /limass|lemes|λεμεσ/i },
    { id: 'paphos', name: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], re: /paph|pafos|πάφ|παφ/i },
  ];
  const schoolName = (s) => (s ? T(s.name[0], s.name[1]) : '');
  const schoolOf = (d) => { for (const txt of [d.group, d.name]) for (const s of SCHOOLS) if (s.re.test(txt || '')) return s; return null; };
  const rad = (x) => (x * Math.PI) / 180;
  function km(a, b, c, d) {
    const dLat = rad(c - a), dLng = rad(d - b), x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }
  function nearestSchool(lat, lng) {   // the school sites are public and fixed; a point is only ever put in words
    const list = (window.ISLAND && window.ISLAND.schools) || [];
    let best = null;
    list.forEach((s) => { const k = km(lat, lng, s.lat, s.lng); if (!best || k < best.k) best = { k, s: SCHOOLS.find((x) => x.id === s.id) }; });
    return best && best.s ? best : null;
  }
  const roundKm = (k) => Math.max(1, k < 20 ? Math.round(k) : Math.round(k / 5) * 5);

  /* ---------- the six rules and their defaults ---------- */
  const DEFAULTS = [
    { id: 'co2_high', key: 'co2_high', name: ['CO2 high', 'Υψηλό CO2'], text: ['A sensor reads more than the limit of CO2.', 'Ένας αισθητήρας μετρά περισσότερο CO2 από το όριο.'], enabled: true, threshold: 1000, unit: 'ppm', severity: 'warn' },
    { id: 'pm25_spike', key: 'pm25_spike', name: ['PM2.5 spike', 'Αιχμή PM2.5'], text: ['A school sensor, or a public sensor within 5 km of a school, reads more than the limit of PM2.5.', 'Ένας αισθητήρας σχολείου, ή δημόσιος αισθητήρας σε απόσταση έως 5 χλμ. από σχολείο, μετρά περισσότερο PM2.5 από το όριο.'], enabled: true, threshold: 25, unit: 'µg/m³', severity: 'watch' },
    { id: 'met_warning', key: 'met_warning', name: ['Met Office warning', 'Προειδοποίηση Μετεωρολογικής'], text: ['The Met Office warnings page lists a warning in force.', 'Η σελίδα προειδοποιήσεων της Μετεωρολογικής αναφέρει προειδοποίηση σε ισχύ.'], enabled: true, threshold: null, unit: '', severity: 'watch' },
    { id: 'sensor_quiet', key: 'sensor_quiet', name: ['Sensor quiet', 'Αισθητήρας σιωπηλός'], text: ['A sensor has sent no reading for longer than the limit.', 'Ένας αισθητήρας δεν έχει στείλει μέτρηση για περισσότερο από το όριο.'], enabled: true, threshold: 60, unit: 'min', severity: 'watch' },
    { id: 'battery_low', key: 'battery_low', name: ['Battery low', 'Χαμηλή μπαταρία'], text: ['A sensor battery is under the limit.', 'Η μπαταρία ενός αισθητήρα είναι κάτω από το όριο.'], enabled: true, threshold: 20, unit: '%', severity: 'info' },
    { id: 'temp_high', key: 'temp_high', name: ['High temperature', 'Υψηλή θερμοκρασία'], text: ['A school sensor or a Met Office station reads more than the limit.', 'Ένας αισθητήρας σχολείου ή σταθμός της Μετεωρολογικής μετρά περισσότερο από το όριο.'], enabled: true, threshold: 35, unit: '°C', severity: 'info' },
  ];
  const LEVEL = { warn: 'high', watch: 'medium', info: 'info' };

  async function loadRules(fresh) {
    try {
      const r = await SC.api('/app/api/alerts/rules');
      const list = r && Array.isArray(r.rules) ? r.rules : null;
      if (list && list.length) {
        const rules = list.filter((x) => x && x.key).map((x) => {
          const d = DEFAULTS.find((y) => y.key === x.key) || {};
          const nm = Array.isArray(x.name) ? x.name : d.name || [x.key, x.key];
          const tx = Array.isArray(x.text) ? x.text : d.text || ['', ''];
          let thr = null;
          if (x.threshold !== null && x.threshold !== undefined && x.threshold !== '' && isFinite(Number(x.threshold))) thr = Number(x.threshold);
          else if (x.threshold === undefined && d.threshold != null) thr = d.threshold;
          return {
            id: x.id != null ? x.id : x.key, key: x.key, name: nm, text: tx, enabled: x.enabled !== false, threshold: thr,
            unit: x.unit != null ? String(x.unit) : d.unit || '', severity: LEVEL[x.severity] ? x.severity : d.severity || 'watch',
          };
        });
        if (rules.length) return { rules, from: 'server' };
      }
    } catch (e) { /* not built yet, or not reachable: the defaults below are used */ }
    void fresh;
    return { rules: DEFAULTS.map((d) => ({ ...d })), from: 'default' };
  }

  /* ---------- what a reading is ---------- */
  const KINDS = [
    { k: 'temp', ids: ['4097'], re: /temp/i, not: /soil|water|ground|dew|surface|probe|internal|core|wet/i, unit: '°C', dec: 1, en: 'Temperature', el: 'Θερμοκρασία', color: '#E07F3F' },
    { k: 'hum', ids: ['4098'], re: /humid/i, not: /soil|leaf|moisture/i, unit: '%', dec: 0, en: 'Humidity', el: 'Υγρασία', color: '#4CCBEA' },
    { k: 'co2', ids: ['4100'], re: /\bco2\b|carbon dioxide/i, unit: 'ppm', dec: 0, en: 'CO2', el: 'CO2', color: '#59d98e' },
    { k: 'pm25', ids: [], re: /pm\s*2[._]?5/i, unit: 'µg/m³', dec: 1, en: 'PM2.5', el: 'PM2.5', color: '#4C8BEA' },
  ];
  function kindOf(cfg, mid) {
    mid = String(mid);
    const nm = cfg && cfg.names && cfg.names[mid], name = nm ? String(nm[0]) : '';
    return KINDS.find((k) => name && k.re.test(name) && !(k.not && k.not.test(name))) || KINDS.find((k) => k.ids.includes(mid) && !(name && k.not && k.not.test(name))) || null;
  }
  const GPS = new Set(['4197', '4198']);
  const VEH = /\b(bus|car|van|minibus|coach|vehicle|taxi|truck|shuttle)\b|λεωφορ|αυτοκίν|όχημα/i;
  const FIXED = /\b(class(room)?|lab|room|office|library|hall|gym|indoor|outdoor|roof|yard|playground|garden|fixed|station)\b|τάξη|αίθουσα|εργαστήρι/i;
  const BUS = /\b(bus|minibus|coach|shuttle)\b|λεωφορ/i;
  const seenMs = (d) => { const m = d.lastSeen ? Date.parse(d.lastSeen) : NaN; return isFinite(m) ? m : 0; };
  const timeOf = (s) => {   // ISO, or the "2026-11-11 13:40:02" UTC stamp that Sensor.Community uses
    if (!s) return 0;
    const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$|T/.test(String(s)) ? s : String(s).replace(' ', 'T') + 'Z');
    return isFinite(t) ? t : 0;
  };

  /* ---------- finding when a reading crossed its line ---------- */
  const seriesUrl = (eui, mid, days) => '/api/series?eui=' + encodeURIComponent(eui) + '&mid=' + encodeURIComponent(mid) + '&days=' + (days || 1);
  async function readSeries(eui, mid, days, fresh) {
    const rows = await (fresh ? SC.api(seriesUrl(eui, mid, days)) : SC.cached(seriesUrl(eui, mid, days), 120000));
    const now = Date.now();
    return (Array.isArray(rows) ? rows : []).map((p) => ({ t: Date.parse(p.t), v: Number(p.v) })).filter((p) => fin(p.t) && fin(p.v) && p.t <= now + MIN).sort((a, b) => a.t - b.t);
  }
  function crossing(pts, thr) {   // the run of readings above thr that ends at the newest reading
    let i = pts.length - 1;
    if (i < 0 || !(pts[i].v > thr)) return null;
    while (i > 0 && pts[i - 1].v > thr) i--;
    const run = pts.slice(i);
    let peak = run[0];
    run.forEach((p) => { if (p.v > peak.v) peak = p; });
    return { since: run[0].t, atLeast: i === 0, peak };
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  /* ---------- the warnings page (same reading as the City board) ---------- */
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/^issued weather warnings\s*/i, '').trim();
  const warnNone = (text) => String(text || '').replace(/\s+/g, ' ').trim().length < 40;
  function warnLevel(text) {   // 0 none, 1 yellow, 2 orange, 3 red, -1 in force but the level is not in the text
    if (warnNone(text)) return 0;
    const low = String(text).toLowerCase();
    return /\bred\b/.test(low) ? 3 : /\borange\b/.test(low) ? 2 : /\byellow\b/.test(low) ? 1 : -1;
  }
  const WL = [['', ''], ['yellow', 'κίτρινη'], ['orange', 'πορτοκαλί'], ['red', 'κόκκινη']];

  /* ---------- the evaluation ---------- */
  async function collect(fresh) {
    const now = Date.now();
    const get = (u, ttl) => (fresh ? SC.api(u) : SC.cached(u, ttl));
    const [cfgR, rulesR, devR, latR, cyR, warnR, openR] = await Promise.all([
      settle(get('/api/config', 300000)), settle(loadRules(fresh)), settle(get('/api/devices', 30000)), settle(get('/api/latest', 30000)),
      settle(get('/api/cydom', 120000)), settle(get('/api/dom/page?name=warnings', 120000)), settle(get('/api/opensensors', 300000))]);
    const cfg = cfgR.ok ? cfgR.v : { names: {}, gps: ['4198', '4197'] };
    const rules = rulesR.ok ? rulesR.v.rules : DEFAULTS.map((d) => ({ ...d }));
    const rulesFrom = rulesR.ok ? rulesR.v.from : 'default';
    const problems = [];
    const emsg = (r) => (r && r.e && r.e.message ? r.e.message : '');
    if (!devR.ok) problems.push({ what: 'sensors', msg: emsg(devR) });
    else if (!latR.ok) problems.push({ what: 'readings', msg: emsg(latR) });
    if (!cyR.ok) problems.push({ what: 'stations', msg: emsg(cyR) });
    if (!warnR.ok) problems.push({ what: 'warnings', msg: emsg(warnR) });
    if (!openR.ok) problems.push({ what: 'public', msg: emsg(openR) });

    const rule = (key) => rules.find((r) => r.key === key && r.enabled);
    const mk = (r, o) => {
      const a = Object.assign({ key: r.key, level: LEVEL[r.severity] || 'medium', ruleName: T(r.name[0], r.name[1]), ruleText: T(r.text[0], r.text[1]), threshold: r.threshold, unit: r.unit, state: 'open', since: null, sinceKind: 'now', school: null }, o);
      a.title = a.mk(a);
      return a;
    };
    const alerts = [], ended = [];
    const devices = devR.ok && Array.isArray(devR.v) ? devR.v : [];
    const latest = latR.ok && latR.v ? latR.v : {};
    const delayH = Math.max(1, Math.round((cfg.posDelayMin || 120) / 60));
    const sensorsOk = devR.ok && latR.ok;

    const place = (d, sc) => { const nm = d.name || d.eui; const s = schoolName(sc); return s && !String(nm).toLowerCase().includes(s.toLowerCase()) ? nm + ' · ' + s : nm; };
    const isVeh = (d) => !FIXED.test(d.name || '') && (VEH.test(d.name || '') || (d.measurements || []).some((m) => GPS.has(String(m))));
    const kindWord = (d) => (isVeh(d) ? (BUS.test(d.name || '') ? T('bus', 'λεωφορείο') : T('vehicle', 'όχημα')) : T('school', 'σχολείο'));
    const sensorLine = (d) => (isVeh(d)
      ? T('SenseCAP tracker on a ' + (BUS.test(d.name || '') ? 'bus' : 'vehicle'), 'Αισθητήρας SenseCAP σε ' + (BUS.test(d.name || '') ? 'λεωφορείο' : 'όχημα'))
      : T('SenseCAP sensor at the school', 'Αισθητήρας SenseCAP στο σχολείο'));
    const sensorHome = (d, sc) => (isVeh(d) ? '#/vehicles/' + encodeURIComponent(d.eui) : '#/schools' + (sc ? '?school=' + sc.id : ''));
    const sensorHomeLabel = (d) => (isVeh(d) ? T('Open the vehicle', 'Άνοιγμα οχήματος') : T('Open the school', 'Άνοιγμα σχολείου'));
    const posNote = (d) => (isVeh(d) ? T('Position shown about ' + delayH + ' h late and rounded to 1 km', 'Η θέση εμφανίζεται με καθυστέρηση περίπου ' + delayH + ' ωρών και στρογγυλοποιημένη στο 1 χλμ.') : T('Fixed at the school', 'Σταθερός στο σχολείο'));
    const src = (d) => ({ label: 'SenseCAP · ' + (d.name || d.eui), kind: 'sensecap' });

    if (sensorsOk) {
      devices.forEach((d) => {
        const sc = schoolOf(d), L = latest[d.eui] || {}, seen = seenMs(d);
        const base = { eui: d.eui, school: sc ? sc.id : null, schoolName: schoolName(sc), where: place(d, sc), sensor: sensorLine(d), sensorNote: posNote(d), source: src(d), home: sensorHome(d, sc), homeLabel: sensorHomeLabel(d), device: d.name || d.eui };

        // sensor quiet
        const rq = rule('sensor_quiet');
        if (rq && seen) {
          const lim = (fin(rq.threshold) ? rq.threshold : 60) * (/^h/i.test(rq.unit) ? 60 : /^d/i.test(rq.unit) ? 1440 : 1) * MIN;
          if (now - seen > lim) {
            alerts.push(mk(rq, Object.assign({}, base, {
              id: 'sensor_quiet:' + d.eui, cat: 'sensors', icon: isVeh(d) ? 'bus' : 'sensor',
              mk: (a) => T((isVeh(d) ? 'Vehicle' : 'Sensor') + ' quiet for ' + dur(now - seen, true), (isVeh(d) ? 'Όχημα' : 'Αισθητήρας') + ' σιωπηλό για ' + dur(now - seen, true)),
              limit: { value: lim / MIN, unit: T('minutes', 'λεπτά'), text: dur(lim) }, nowText: T('Quiet for ' + dur(now - seen), 'Σιωπηλός για ' + dur(now - seen)),
              since: seen, sinceKind: 'seen', last: seen, readingAt: seen, quietMs: now - seen, viz: { type: 'cells', eui: d.eui, mids: (d.measurements || []).filter((m) => !GPS.has(String(m))), last: seen },
              why: T('A sensor reports every few minutes while it is switched on. A parked vehicle, a switched-off sensor or a school holiday goes quiet by design, so this is a prompt to check the power and the battery, not proof of a fault.',
                'Ένας αισθητήρας στέλνει μετρήσεις κάθε λίγα λεπτά όσο είναι ανοιχτός. Ένα σταθμευμένο όχημα, ένας κλειστός αισθητήρας ή μια σχολική αργία σιωπούν από σχεδιασμό, άρα είναι υπενθύμιση για έλεγχο ρεύματος και μπαταρίας, όχι απόδειξη βλάβης.'),
            })));
          }
        }
        // battery low
        const rb = rule('battery_low');
        if (rb && fin(Number(d.battery)) && d.battery !== null) {
          const lim = fin(rb.threshold) ? rb.threshold : 20, b = Number(d.battery);
          if (b < lim) {
            alerts.push(mk(rb, Object.assign({}, base, {
              id: 'battery_low:' + d.eui, cat: 'sensors', icon: 'battery',
              mk: () => T('Battery low on a ' + kindWord(d) + ' sensor', 'Χαμηλή μπαταρία σε αισθητήρα (' + kindWord(d) + ')'),
              limit: { value: lim, unit: '%', text: numA(lim) + ' %' }, nowText: num(b) + ' %', value: b,
              since: null, sinceKind: 'now', last: seen, readingAt: seen,
              viz: { type: 'bar', v: b, thr: lim, max: 100, unit: '%', label: T('Battery', 'Μπαταρία') },
              why: T('A sensor that runs flat leaves a gap in the record. Charging it or swapping the battery keeps the readings unbroken.',
                'Ένας αισθητήρας που αδειάζει αφήνει κενό στο αρχείο. Η φόρτιση ή η αλλαγή μπαταρίας κρατά τις μετρήσεις αδιάλειπτες.'),
            })));
          }
        }
        // readings: CO2, PM2.5, temperature (only a reading that is recent counts as "now")
        const kinds = {};
        (d.measurements || []).forEach((mid) => {
          mid = String(mid); if (GPS.has(mid)) return;
          const k = kindOf(cfg, mid), r = L[mid];
          if (!k || !r) return;
          const v = Number(r.v), t = Date.parse(r.t);
          if (!fin(v) || !fin(t) || now - t > FRESH) return;
          if (!kinds[k.k] || t > kinds[k.k].t) kinds[k.k] = { k, mid, v, t };
        });
        const val = (key, kk, rr, extra) => {
          const x = kinds[kk]; if (!x || !rr) return;
          const lim = fin(rr.threshold) ? rr.threshold : extra.def;
          if (!(x.v > lim)) return;
          alerts.push(mk(rr, Object.assign({}, base, {
            id: key + ':' + d.eui, cat: extra.cat, icon: extra.icon, value: x.v, valueMid: x.mid, readingAt: x.t, last: x.t, kind: kk,
            mk: (a) => extra.title(a, lim),
            limit: { value: lim, unit: x.k.unit, text: numA(lim) + ' ' + x.k.unit }, nowText: num(x.v, x.k.dec) + ' ' + x.k.unit,
            viz: { type: 'series', eui: d.eui, mid: x.mid, thr: lim, unit: x.k.unit, color: x.k.color, label: T(x.k.en, x.k.el) + ' · ' + T('last hours', 'τελευταίες ώρες'), dec: x.k.dec },
            why: extra.why,
          })));
        };
        const dm = (a, lim, en, el) => { const f = a.sinceKind === 'crossed' ? dur(Date.now() - a.since, true) : ''; return T(en + ' above ' + lim + (f ? ' for ' + f : ''), el + ' πάνω από ' + lim + (f ? ' για ' + f : '')); };
        val('co2_high', 'co2', rule('co2_high'), {
          def: 1000, cat: 'air', icon: 'air',
          title: (a, lim) => dm(a, numA(lim) + ' ppm', 'CO2', 'CO2'),
          why: T('Above 1,000 ppm a closed classroom starts to feel stuffy and focus drops. An open window or a fan usually brings it down. The alert clears by itself when a reading is back under the line.',
            'Πάνω από 1.000 ppm μια κλειστή τάξη αρχίζει να βαραίνει και η προσοχή πέφτει. Ένα ανοιχτό παράθυρο ή ένας ανεμιστήρας συνήθως το κατεβάζει. Η ειδοποίηση σβήνει μόνη της όταν μια μέτρηση ξανακατέβει κάτω από το όριο.'),
        });
        val('pm25_spike', 'pm25', rule('pm25_spike'), {
          def: 25, cat: 'air', icon: 'air',
          title: (a, lim) => dm(a, numA(lim) + ' µg/m³', 'PM2.5', 'PM2.5'),
          why: T('Fine dust can rise from a bonfire, traffic or a fan placed next to the sensor. Compare it with the other sensors before drawing a conclusion.',
            'Η λεπτή σκόνη μπορεί να ανέβει από φωτιά, κίνηση ή έναν ανεμιστήρα δίπλα στον αισθητήρα. Συγκρίνετε με τους άλλους αισθητήρες πριν βγάλετε συμπέρασμα.'),
        });
        val('temp_high', 'temp', rule('temp_high'), {
          def: 35, cat: 'sensors', icon: 'temp',
          title: (a, lim) => dm(a, numA(lim) + ' °C', 'Temperature', 'Θερμοκρασία'),
          why: T('A sensor in direct sun, or in a closed vehicle, can read much hotter than the air. Check where it sits before trusting the number, then compare with the nearest Met Office station.',
            'Ένας αισθητήρας στον ήλιο, ή σε κλειστό όχημα, μπορεί να δείχνει πολύ υψηλότερα από τον αέρα. Ελέγξτε πού βρίσκεται πριν εμπιστευτείτε τον αριθμό και συγκρίνετε με τον πλησιέστερο σταθμό της Μετεωρολογικής.'),
        });
      });
    }

    // temperature at Met Office stations
    const rt = rule('temp_high');
    if (rt && cyR.ok && cyR.v && Array.isArray(cyR.v.points)) {
      const lim = fin(rt.threshold) ? rt.threshold : 35;
      cyR.v.points.forEach((p) => {
        const t = timeOf(p.time);
        if (!fin(p.temp) || !(p.temp > lim) || !t || now - t > 3 * HOUR) return;
        alerts.push(mk(rt, {
          id: 'temp_high:met:' + p.id, cat: 'weather', icon: 'temp', school: null, schoolName: '', where: T('Met Office station ' + p.name, 'Σταθμός Μετεωρολογικής: ' + p.name),
          sensor: T('Official Met Office weather station', 'Επίσημος μετεωρολογικός σταθμός'), sensorNote: T('Not one of our sensors', 'Δεν είναι δικός μας αισθητήρας'),
          source: { label: T('Met Office · ' + p.name, 'Μετεωρολογική · ' + p.name), kind: 'metoffice' }, home: '#/weather/' + encodeURIComponent(p.id), homeLabel: T('Open the station', 'Άνοιγμα σταθμού'),
          mk: () => T('Temperature above ' + numA(lim) + ' °C at ' + p.name, 'Θερμοκρασία πάνω από ' + numA(lim) + ' °C στον σταθμό ' + p.name),
          limit: { value: lim, unit: '°C', text: numA(lim) + ' °C' }, nowText: num(p.temp, 1) + ' °C', value: p.temp, readingAt: t, last: t, since: null, sinceKind: 'now',
          viz: { type: 'station', station: p.id, key: 'temp', thr: lim, unit: '°C', color: '#E07F3F', label: T('Temperature', 'Θερμοκρασία') + ' · ' + T('last hours', 'τελευταίες ώρες') },
          why: T('The Met Office measures the air in the shade at 1.2 m. We copy the reading without changes.', 'Η Μετεωρολογική μετρά τον αέρα στη σκιά, σε ύψος 1,2 μ. Αντιγράφουμε τη μέτρηση χωρίς αλλαγές.'),
        }));
      });
    }

    // public PM2.5 sensors within 5 km of a school (Sensor.Community, volunteers)
    const rp = rule('pm25_spike');
    if (rp && openR.ok && openR.v && Array.isArray(openR.v.points)) {
      const lim = fin(rp.threshold) ? rp.threshold : 25, per = new Map();
      openR.v.points.forEach((p) => {
        const t = timeOf(p.time);
        if (!fin(p.pm25) || !fin(p.lat) || !fin(p.lng) || !t || now - t > 3 * HOUR) return;
        const n = nearestSchool(p.lat, p.lng);
        if (!n || n.k > 5) return;
        const e = per.get(n.s.id) || { s: n.s, hits: [], all: 0 };
        e.all++;
        if (p.pm25 > lim) e.hits.push({ p, t, k: n.k });
        per.set(n.s.id, e);
      });
      per.forEach((e) => {
        if (!e.hits.length) return;
        const top = e.hits.slice().sort((a, b) => b.p.pm25 - a.p.pm25)[0], r = roundKm(top.k), nm = schoolName(e.s);
        alerts.push(mk(rp, {
          id: 'pm25_spike:open:' + e.s.id, cat: 'air', icon: 'air', school: e.s.id, schoolName: nm,
          where: T('Public Sensor.Community sensor, about ' + r + ' km from ' + nm, 'Δημόσιος αισθητήρας Sensor.Community, περίπου ' + r + ' χλμ. από ' + nm),
          sensor: T('Sensor.Community public sensor', 'Δημόσιος αισθητήρας Sensor.Community'), sensorNote: T('Not one of ours. Location rounded, never shown as coordinates.', 'Δεν είναι δικός μας. Η θέση στρογγυλοποιείται και δεν εμφανίζεται ως συντεταγμένες.'),
          source: { label: 'Sensor.Community', kind: 'sensorcommunity' }, home: '#/map', homeLabel: T('Show on the live map', 'Εμφάνιση στον ζωντανό χάρτη'),
          mk: () => T('PM2.5 above ' + numA(lim) + ' µg/m³ near ' + nm, 'PM2.5 πάνω από ' + numA(lim) + ' µg/m³ κοντά στο ' + nm),
          limit: { value: lim, unit: 'µg/m³', text: numA(lim) + ' µg/m³' }, nowText: num(top.p.pm25, 1) + ' µg/m³' + (e.hits.length > 1 ? T(' (highest of ' + e.hits.length + ' public sensors above the line)', ' (το υψηλότερο από ' + e.hits.length + ' δημόσιους αισθητήρες πάνω από το όριο)') : ''),
          value: top.p.pm25, readingAt: top.t, last: top.t, since: null, sinceKind: 'now',
          viz: { type: 'bar', v: top.p.pm25, thr: lim, max: Math.max(50, Math.ceil(top.p.pm25 / 10) * 10), unit: 'µg/m³', label: 'PM2.5' },
          why: T('Public sensors are run by volunteers. They can spike from a bonfire, a traffic jam or a fan next to them, so check this against the school’s own air reading before drawing a conclusion.',
            'Οι δημόσιοι αισθητήρες λειτουργούν από εθελοντές. Μπορεί να ανεβούν από φωτιά, κίνηση ή έναν ανεμιστήρα δίπλα τους, γι’ αυτό συγκρίνετέ το με την μέτρηση αέρα του σχολείου πριν βγάλετε συμπέρασμα.'),
        }));
      });
    }

    // Met Office warnings
    const rw = rule('met_warning');
    let warnInfo = null;
    if (rw && warnR.ok) {
      const p = warnR.v || {}, text = String(p.text || ''), level = warnLevel(text), fetched = p.fetched ? Date.parse(p.fetched) : now;
      warnInfo = { level, fetched, url: p.url || 'https://www.dom.org.cy/WARNING/' };
      if (level !== 0) {
        const lvl = level >= 2 ? 'high' : LEVEL[rw.severity] || 'medium', colour = level > 0 ? WL[level] : null;
        alerts.push(mk(rw, {
          id: 'met_warning:now', cat: 'weather', icon: 'sun', school: null, schoolName: '', level: lvl,
          where: T('Cyprus · copied as published', 'Κύπρος · αντιγραφή όπως δημοσιεύθηκε'),
          sensor: T('Cyprus Department of Meteorology', 'Τμήμα Μετεωρολογίας Κύπρου'), sensorNote: T('Official warnings page', 'Επίσημη σελίδα προειδοποιήσεων'),
          source: { label: 'dom.org.cy', kind: 'metoffice' }, home: '#/weather', homeLabel: T('Open the Met Office record', 'Άνοιγμα μετεωρολογικού αρχείου'), external: warnInfo.url,
          mk: () => (colour ? T('Met Office ' + colour[0] + ' warning in force', 'Προειδοποίηση Μετεωρολογικής σε ισχύ (' + colour[1] + ')') : T('Met Office warning in force', 'Προειδοποίηση Μετεωρολογικής σε ισχύ')),
          limit: { value: null, unit: '', text: T('Any warning in force', 'Οποιαδήποτε προειδοποίηση σε ισχύ') }, nowText: colour ? T('Level ' + colour[0], 'Επίπεδο: ' + colour[1]) : T('Level not stated in the text', 'Το επίπεδο δεν αναφέρεται στο κείμενο'),
          excerpt: clean(text).slice(0, 260), readingAt: fetched, last: fetched, since: fetched, sinceKind: 'checked', warnText: text,
          viz: { type: 'warn' },
          why: T('We copy every warning from the Department of Meteorology without changes. An orange or red warning is always shown as High, whatever level the rule has.',
            'Αντιγράφουμε κάθε προειδοποίηση από το Τμήμα Μετεωρολογίας χωρίς αλλαγές. Μια πορτοκαλί ή κόκκινη προειδοποίηση εμφανίζεται πάντα ως Υψηλή, όποιο επίπεδο κι αν έχει ο κανόνας.'),
        }));
      }
    }

    // sort: level, then newest
    const ord = { high: 0, medium: 1, info: 2 };
    alerts.sort((a, b) => ord[a.level] - ord[b.level] || (b.since || b.readingAt || now) - (a.since || a.readingAt || now) || String(a.where).localeCompare(String(b.where)));

    return { now, cfg, rules, rulesFrom, problems, alerts, ended, warnInfo, devices, latest, cydom: cyR.ok ? cyR.v : null, rw, rulesR, fresh, checked: { sensors: sensorsOk ? devices.length : 0, stations: cyR.ok && cyR.v && cyR.v.points ? cyR.v.points.length : 0, warnings: warnR.ok, publicSensors: openR.ok && openR.v && openR.v.points ? openR.v.points.length : 0 } };
  }

  /* Second step: when did each reading cross its line, and which warnings ended recently. Failures leave "now". */
  async function enrich(c) {
    const jobs = [];
    c.alerts.forEach((a) => {
      if (a.viz && a.viz.type === 'series') {
        jobs.push(withTimeout(readSeries(a.viz.eui, a.viz.mid, 1, c.fresh), 8000).then((pts) => {
          a.series = pts;
          const x = crossing(pts, a.viz.thr);
          if (x) { a.since = x.since; a.sinceKind = 'crossed'; a.atLeast = x.atLeast; a.peak = x.peak; a.title = a.mk(a); }
        }).catch(() => { /* stays "now" */ }));
      }
    });
    if (c.rw && c.warnInfo) {
      jobs.push(withTimeout(SC.api('/api/dom/pages/history?name=warnings&days=2'), 8000).then((vs) => {
        const list = (Array.isArray(vs) ? vs : []).filter((v) => v && fin(v.t)).sort((a, b) => a.t - b.t);
        if (!list.length) return;
        const now = Date.now();
        if (c.warnInfo.level !== 0) {
          const a = c.alerts.find((x) => x.id === 'met_warning:now'); if (!a) return;
          const same = (v) => clean(v.text) === clean(a.warnText);
          let i = list.length - 1;
          if (!same(list[i])) return;
          while (i > 0 && same(list[i - 1])) i--;
          a.since = list[i].t; a.sinceKind = 'copied';
        } else {
          // none now: was there a warning in the last 24 hours? Then it ended when the page first showed none.
          let lastW = -1;
          list.forEach((v, i) => { if (!warnNone(v.text) && now - v.t < DAY) lastW = i; });
          if (lastW < 0 || lastW >= list.length - 1) return;
          const prev = list[lastW], end = list[lastW + 1];
          const level = warnLevel(prev.text), colour = level > 0 ? WL[level] : null, r = c.rw;
          c.ended.push({
            id: 'met_warning:ended', key: 'met_warning', state: 'ended', cat: 'weather', icon: 'sun', level: 'info', school: null, schoolName: '',
            ruleName: T(r.name[0], r.name[1]), ruleText: T(r.text[0], r.text[1]), where: T('Cyprus · copied as published', 'Κύπρος · αντιγραφή όπως δημοσιεύθηκε'),
            sensor: T('Cyprus Department of Meteorology', 'Τμήμα Μετεωρολογίας Κύπρου'), sensorNote: '', source: { label: 'dom.org.cy', kind: 'metoffice' },
            home: '#/weather', homeLabel: T('Open the Met Office record', 'Άνοιγμα μετεωρολογικού αρχείου'), external: c.warnInfo.url,
            title: colour ? T('Met Office ' + colour[0] + ' warning ended', 'Η προειδοποίηση Μετεωρολογικής (' + colour[1] + ') έληξε') : T('Met Office warning ended', 'Η προειδοποίηση Μετεωρολογικής έληξε'),
            limit: { value: null, unit: '', text: T('Any warning in force', 'Οποιαδήποτε προειδοποίηση σε ισχύ') }, nowText: T('None in force now', 'Καμία σε ισχύ τώρα'), excerpt: clean(prev.text).slice(0, 260),
            since: end.t, sinceKind: 'ended', readingAt: c.warnInfo.fetched, last: c.warnInfo.fetched, mute: false,
            why: T('We keep an ended warning here for 24 hours, then it lives on in the Met Office record.', 'Κρατάμε μια λήξασα προειδοποίηση εδώ για 24 ώρες και μετά παραμένει στο μετεωρολογικό αρχείο.'),
          });
        }
      }).catch(() => { /* no saved copies yet */ }));
    }
    await Promise.all(jobs);
    const ord = { high: 0, medium: 1, info: 2 };
    c.alerts.sort((a, b) => ord[a.level] - ord[b.level] || (b.since || b.readingAt || 0) - (a.since || a.readingAt || 0) || String(a.where).localeCompare(String(b.where)));
    return c;
  }

  /* ---------- the cache: one evaluation per minute, shared by the page, the badge and the desk ---------- */
  let coreMemo = null, fullMemo = null;
  function core(force) {
    if (!force && coreMemo && Date.now() - coreMemo.at < TTL) return coreMemo.p;
    const p = collect(force);
    coreMemo = { at: Date.now(), p }; fullMemo = null;
    p.catch(() => { if (coreMemo && coreMemo.p === p) coreMemo = null; });
    return p;
  }
  SC.alertsEvaluate = function (o) {
    const force = !!(o && o.force);
    if (!force && fullMemo && Date.now() - fullMemo.at < TTL) return fullMemo.p;
    const base = core(force);
    const p = base.then((c) => enrich(c)).then((c) => ({ at: c.now, alerts: c.alerts, ended: c.ended, rules: c.rules, rulesFrom: c.rulesFrom, problems: c.problems, checked: c.checked, warn: c.warnInfo, cfg: c.cfg }));
    fullMemo = { at: Date.now(), p };
    p.catch(() => { if (fullMemo && fullMemo.p === p) fullMemo = null; });
    return p;
  };
  SC.alertCount = async function () {
    try {
      const c = await core(false);
      return c.alerts.filter((a) => !SC.alerts.isMuted(a.id)).length;
    } catch (e) { return 0; }
  };

  /* ---------- mutes: this browser only, one day ---------- */
  const MUTE_KEY = 'sc.alerts.muted.v1';
  function mutes() {
    try {
      const o = JSON.parse(ls.get(MUTE_KEY) || '{}'), now = Date.now(), out = {};
      Object.keys(o || {}).forEach((k) => { if (fin(o[k]) && o[k] > now) out[k] = o[k]; });
      return out;
    } catch (e) { return {}; }
  }
  const mute = (id) => { const m = mutes(); m[id] = Date.now() + DAY; ls.set(MUTE_KEY, JSON.stringify(m)); };
  const unmute = (id) => { const m = mutes(); delete m[id]; ls.set(MUTE_KEY, JSON.stringify(m)); };
  const isMuted = (id) => Boolean(mutes()[id]);

  /* ---------- Today's desk: one record per Cyprus day, on this device only ---------- */
  const DESK_KEY = 'sc.desk.v1';
  const CHECKS = ['sensor', 'official', 'warnings', 'question', 'change'];
  function deskLoad() {
    try { const o = JSON.parse(ls.get(DESK_KEY) || 'null'); if (o && o.v === 1 && o.days && typeof o.days === 'object') return o; } catch (e) { /* start fresh */ }
    return { v: 1, days: {} };
  }
  function deskSave(o) {
    const keys = Object.keys(o.days).sort();
    while (keys.length > 60) delete o.days[keys.shift()];
    ls.set(DESK_KEY, JSON.stringify(o));
    try { window.dispatchEvent(new CustomEvent('sc-desk')); } catch (e) { /* old browser */ }
  }
  const desk = {
    CHECKS,
    get(day) { return deskLoad().days[day || cyDay()] || {}; },
    mark(kind, at) { const o = deskLoad(), d = cyDay(); const e = o.days[d] || (o.days[d] = {}); if (e[kind]) return false; e[kind] = at || Date.now(); deskSave(o); return true; },
    write(kind, text) { const o = deskLoad(), d = cyDay(); const e = o.days[d] || (o.days[d] = {}); e[kind] = { text: String(text).slice(0, 400), at: Date.now() }; deskSave(o); },
    clear(kind) { const o = deskLoad(), e = o.days[cyDay()]; if (e) { delete e[kind]; deskSave(o); } },
    reset() { const o = deskLoad(); delete o.days[cyDay()]; deskSave(o); },
    count(day) { const e = desk.get(day); return CHECKS.filter((k) => e[k]).length; },
    streak() {   // consecutive Cyprus days, ending today or yesterday, on which all five checks were done
      const o = deskLoad(); let n = 0, t = Date.now();
      if (CHECKS.filter((k) => (o.days[cyDay(t)] || {})[k]).length < CHECKS.length) t -= DAY;
      for (let i = 0; i < 60; i++) { const e = o.days[cyDay(t)] || {}; if (CHECKS.every((k) => e[k])) { n++; t -= DAY; } else break; }
      return n;
    },
  };
  function trackRoute() {
    const h = String(location.hash || '').replace(/^#\/?/, ''), q = h.split('?'), id = (q[0].split('/')[0] || '').toLowerCase();
    let params; try { params = new URLSearchParams(q[1] || ''); } catch (e) { params = new URLSearchParams(''); }
    if (id === 'vehicles' || id === 'schools') desk.mark('sensor');
    else if (id === 'explore' && (params.get('tool') === 'official')) desk.mark('official');
    else if (id === 'weather' || id === 'warnwatch' || id === 'warnings') desk.mark('warnings');
  }
  window.addEventListener('hashchange', trackRoute);
  ['pushState', 'replaceState'].forEach((m) => {   // the Explore page changes its address with replaceState, which sends no hashchange
    const orig = history[m];
    if (typeof orig !== 'function') return;
    history[m] = function () { const r = orig.apply(this, arguments); setTimeout(trackRoute, 0); return r; };
  });
  trackRoute();

  SC.alerts = { mute, unmute, isMuted, mutes, SCHOOLS, schoolOf, schoolName, nearestSchool, roundKm, km, cyDay, cyStart, cyOff, when, num, dur, DEFAULTS, desk, numA, KINDS, kindOf, readSeries, crossing, warnLevel, warnNone, clean, LEVEL, timeOf };
})();
