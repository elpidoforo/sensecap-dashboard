/*
  What-if: sliders (cars, electric buses, trees, heat wave) and a small, documented model that starts from the latest REAL readings
  of one school and gives an estimate with an 80 % range. Always marked "Estimate, not a measurement".
    #/whatif                 the first school that has readings
    #/whatif?school=<slug>   a school (the slug of /app/api/schools/public)
  Real data: /api/devices + /api/latest + /api/config (CO2, temperature and PM2.5 of the school's sensors),
    /api/opensensors and /api/air (PM2.5 from volunteer sensors or the Open-Meteo model, only when no school sensor reports PM2.5),
    /app/api/schools/public (the four schools).
  Nothing is invented: when there is no baseline for a quantity the page says so and shows no estimate for it.
  The coefficients are assumptions with a stated basis (see "How this estimate is made"); they are listed, editable and not fitted to our data.
  No vehicle position is read or shown.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const sv = (tag, attrs, ...kids) => SC.svgEl(tag, attrs, ...kids.flat(Infinity));
  SC.css('/site/pages/whatif.css');
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const HOUR = 3600000, DAY = 86400000, FRESH = 3 * HOUR;
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const f1 = (x) => SC.num(x, 1);
  const f0 = (x) => SC.num(x, 0);
  const kspan = (c, ...kids) => { const n = el('span', null, ...kids); n.style.setProperty('--k', c); return n; };   // custom properties go through the CSSOM
  const sgn = (x, d) => (x > 0 ? '+' : '') + SC.num(x, d == null ? 1 : d);

  const ICON = {
    sliders: '<path d="M5 6h9M18 6h1M5 12h2M11 12h8M5 18h11M20 18h-1"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.4v.4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.6v.2"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    reset: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5"/>',
  };
  function ic(name) {
    const s = sv('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.innerHTML = ICON[name] || (SC.icons && SC.icons[name]) || '';   // static strings only
    return s;
  }

  /* ---------- the model: every number below is a stated assumption, editable in the page ---------- */
  const WHO = 15;                       // WHO 2021 guideline, PM2.5, 24-hour mean, µg/m3
  const DEFAULTS = { roadShare: 0.25, busShare: 0.30, evCut: 0.5, tree100: 0.02, treeCap: 0.10, heatOut: 0.15, heatRoad: 0.10, varPct: 0.20, unc: 0.5,
    co2Bg: 425, co2Traffic: 0.5, varCo2: 0.05, heatT: 5, treeT100: 0.3, treeTCap: 1.0, varT: 1.5 };
  // k, label, unit, mult (shown value = stored value x mult), step, min, max (shown), range text, basis text
  const COEF = [
    { k: 'roadShare', l: ['Road traffic share of the PM2.5 at the school', 'Μερίδιο της κυκλοφορίας στο PM2.5 του σχολείου'], u: '%', m: 100, step: 1, min: 0, max: 80, r: '10 to 40 %',
      b: ['Assumption (ours). Source-apportionment studies of European cities put traffic at roughly 10 to 40 % of urban PM2.5. Nobody has measured it at these schools.', 'Παραδοχή (δική μας). Μελέτες πηγών ρύπανσης σε ευρωπαϊκές πόλεις δίνουν στην κυκλοφορία περίπου 10 έως 40 % του αστικού PM2.5. Δεν έχει μετρηθεί σε αυτά τα σχολεία.'] },
    { k: 'busShare', l: ['School buses, share of the road traffic part', 'Σχολικά λεωφορεία, μερίδιο του μέρους της κυκλοφορίας'], u: '%', m: 100, step: 1, min: 0, max: 100, r: '10 to 50 %',
      b: ['Assumption (ours). We have no count of cars and buses at the gate. The rest of the road part is cars.', 'Παραδοχή (δική μας). Δεν έχουμε μέτρηση αυτοκινήτων και λεωφορείων στην είσοδο. Το υπόλοιπο της κυκλοφορίας είναι αυτοκίνητα.'] },
    { k: 'evCut', l: ['PM2.5 an electric bus no longer makes', 'PM2.5 που δεν παράγει πια ένα ηλεκτρικό λεωφορείο'], u: '%', m: 100, step: 5, min: 0, max: 100, r: '30 to 70 %',
      b: ['Assumption informed by the EMEP/EEA emission inventory guidebook: the exhaust goes, brake, tyre and road dust stay, so the cut is far from 100 %.', 'Παραδοχή βασισμένη στον οδηγό απογραφής εκπομπών EMEP/EEA: η εξάτμιση εξαφανίζεται, η σκόνη από φρένα, ελαστικά και δρόμο μένει, άρα η μείωση απέχει πολύ από το 100 %.'] },
    { k: 'tree100', l: ['PM2.5 trimmed by every 100 trees', 'PM2.5 που μειώνουν κάθε 100 δέντρα'], u: '%', m: 100, step: 0.5, min: 0, max: 10, r: '0 to 5 %',
      b: ['Rule of thumb inside published ranges: Nowak et al. 2013 (Environmental Pollution 178) find trees remove well under 1 % of city-wide PM2.5; Abhijith et al. 2017 (Atmospheric Environment 162) show a row of trees beside an open road can do more, and trees in a narrow street can trap pollution.', 'Εμπειρικός κανόνας εντός δημοσιευμένων τιμών: οι Nowak και συν. 2013 (Environmental Pollution 178) βρίσκουν ότι τα δέντρα αφαιρούν πολύ λιγότερο από 1 % του PM2.5 μιας πόλης· οι Abhijith και συν. 2017 (Atmospheric Environment 162) δείχνουν ότι μια σειρά δέντρων δίπλα σε ανοιχτό δρόμο μπορεί να κάνει περισσότερα, ενώ σε στενό δρόμο τα δέντρα μπορούν να παγιδεύσουν τη ρύπανση.'] },
    { k: 'treeCap', l: ['Most the trees can trim', 'Το μέγιστο που μπορούν να μειώσουν τα δέντρα'], u: '%', m: 100, step: 1, min: 0, max: 30, r: '5 to 15 %',
      b: ['Assumption (ours): a cap so that the slider cannot promise a cleaner road than the studies support.', 'Παραδοχή (δική μας): ένα όριο ώστε το ρυθμιστικό να μην υπόσχεται πιο καθαρό δρόμο από όσο στηρίζουν οι μελέτες.'] },
    { k: 'heatOut', l: ['Heat wave: outside part of the PM2.5 gets bigger by', 'Καύσωνας: το εξωτερικό μέρος του PM2.5 αυξάνεται κατά'], u: '%', m: 100, step: 1, min: 0, max: 60, r: '0 to 30 %',
      b: ['Assumption (ours). Hot, still air and dust episodes raise particles, but the size is not measured here, so the range is wide.', 'Παραδοχή (δική μας). Ο ζεστός, ακίνητος αέρας και τα επεισόδια σκόνης αυξάνουν τα σωματίδια, αλλά το μέγεθος δεν μετράται εδώ, γι’ αυτό το εύρος είναι μεγάλο.'] },
    { k: 'heatRoad', l: ['Heat wave: road part of the PM2.5 gets bigger by', 'Καύσωνας: το μέρος του δρόμου στο PM2.5 αυξάνεται κατά'], u: '%', m: 100, step: 1, min: 0, max: 60, r: '0 to 20 %',
      b: ['Assumption (ours): more road dust is lifted when the surface is hot and dry.', 'Παραδοχή (δική μας): περισσότερη σκόνη του δρόμου αιωρείται όταν το οδόστρωμα είναι ζεστό και ξηρό.'] },
    { k: 'varPct', l: ['How much the PM2.5 differs from one reading to the next', 'Πόσο διαφέρει το PM2.5 από μέτρηση σε μέτρηση'], u: '%', m: 100, step: 1, min: 5, max: 60, r: '10 to 30 %',
      b: ['Assumption (ours). It can be measured once a school sensor keeps a PM2.5 history.', 'Παραδοχή (δική μας). Μπορεί να μετρηθεί όταν ένας αισθητήρας σχολείου κρατά ιστορικό PM2.5.'] },
    { k: 'unc', l: ['Doubt about each effect, as a share of its size', 'Αβεβαιότητα κάθε επίδρασης, ως μερίδιο του μεγέθους της'], u: '%', m: 100, step: 5, min: 0, max: 100, r: '30 to 100 %',
      b: ['Our choice. It makes the 80 % range grow when you pull a slider far, because the effect itself is uncertain.', 'Δική μας επιλογή. Κάνει το εύρος 80 % να μεγαλώνει όταν τραβάτε πολύ ένα ρυθμιστικό, επειδή η ίδια η επίδραση είναι αβέβαιη.'] },
    { k: 'co2Bg', l: ['Outdoor CO2 background', 'Υπόβαθρο CO2 στο ύπαιθρο'], u: 'ppm', m: 1, step: 1, min: 380, max: 480, r: '420 to 430 ppm',
      b: ['Rounded global outdoor level (NOAA Global Monitoring Laboratory).', 'Στρογγυλεμένο παγκόσμιο επίπεδο στο ύπαιθρο (NOAA Global Monitoring Laboratory).'] },
    { k: 'co2Traffic', l: ['Share of CO2 above the background that comes from traffic', 'Μερίδιο του CO2 πάνω από το υπόβαθρο που προέρχεται από την κυκλοφορία'], u: '%', m: 100, step: 5, min: 0, max: 100, r: '20 to 80 %',
      b: ['Assumption (ours). Sensors on buses, cars and in classrooms also read people\'s breath, so most of a high reading is not traffic.', 'Παραδοχή (δική μας). Οι αισθητήρες σε λεωφορεία, αυτοκίνητα και αίθουσες διαβάζουν και την αναπνοή των ανθρώπων, άρα το μεγαλύτερο μέρος μιας υψηλής τιμής δεν είναι κυκλοφορία.'] },
    { k: 'varCo2', l: ['How much CO2 differs from one reading to the next', 'Πόσο διαφέρει το CO2 από μέτρηση σε μέτρηση'], u: '%', m: 100, step: 1, min: 1, max: 30, r: '3 to 10 %',
      b: ['Assumption (ours).', 'Παραδοχή (δική μας).'] },
    { k: 'heatT', l: ['Heat wave: temperature goes up by', 'Καύσωνας: η θερμοκρασία ανεβαίνει κατά'], u: '°C', m: 1, step: 0.5, min: 0, max: 12, r: '3 to 8 °C',
      b: ['Assumption (ours): a heat wave day is several degrees above the reading of today.', 'Παραδοχή (δική μας): μια ημέρα καύσωνα είναι αρκετούς βαθμούς πάνω από τη σημερινή μέτρηση.'] },
    { k: 'treeT100', l: ['Cooling from every 100 trees', 'Δροσισμός από κάθε 100 δέντρα'], u: '°C', m: 1, step: 0.1, min: 0, max: 2, r: '0.1 to 0.6 °C',
      b: ['Rounded from Bowler et al. 2010 (Landscape and Urban Planning 97): green areas are on average about 1 °C cooler than built ones. Young trees give less.', 'Στρογγυλεμένο από τους Bowler και συν. 2010 (Landscape and Urban Planning 97): οι πράσινες περιοχές είναι κατά μέσο όρο περίπου 1 °C δροσερότερες από τις δομημένες. Τα νεαρά δέντρα δίνουν λιγότερο.'] },
    { k: 'treeTCap', l: ['Most the trees can cool', 'Το μέγιστο που μπορούν να δροσίσουν τα δέντρα'], u: '°C', m: 1, step: 0.1, min: 0, max: 3, r: '0.5 to 2 °C',
      b: ['Assumption (ours), inside the range of the same review.', 'Παραδοχή (δική μας), εντός του εύρους της ίδιας ανασκόπησης.'] },
    { k: 'varT', l: ['How much the temperature differs from one reading to the next', 'Πόσο διαφέρει η θερμοκρασία από μέτρηση σε μέτρηση'], u: '°C', m: 1, step: 0.1, min: 0.2, max: 5, r: '1 to 2 °C',
      b: ['Assumption (ours).', 'Παραδοχή (δική μας).'] },
  ];
  const ZERO = { cars: 0, ev: 0, trees: 0, heat: false };
  const PRESETS = [
    { id: 'now', l: ['As measured now', 'Όπως μετρήθηκε τώρα'], s: { cars: 0, ev: 0, trees: 0, heat: false } },
    { id: 'pilot', l: ['Our pilot idea', 'Η ιδέα του πιλότου μας'], s: { cars: -20, ev: 20, trees: 0, heat: false } },
    { id: 'big', l: ['Big change', 'Μεγάλη αλλαγή'], s: { cars: -50, ev: 100, trees: 100, heat: false } },
    { id: 'heat', l: ['Heat wave', 'Καύσωνας'], s: { cars: 0, ev: 0, trees: 0, heat: true } },
  ];
  const same = (a, b) => a.cars === b.cars && a.ev === b.ev && a.trees === b.trees && a.heat === b.heat;

  function pmParts(B, s, K) {
    const road0 = B * K.roadShare, out0 = B - road0, cars0 = road0 * (1 - K.busShare), bus0 = road0 * K.busShare;
    const tree = Math.min(K.treeCap, (s.trees / 100) * K.tree100), hO = s.heat ? 1 + K.heatOut : 1, hR = s.heat ? 1 + K.heatRoad : 1;
    const cars = cars0 * (1 + s.cars / 100) * (1 - tree) * hR, bus = bus0 * (1 - (s.ev / 100) * K.evCut) * (1 - tree) * hR, out = out0 * hO;
    return { out, cars, bus, mean: out + cars + bus };
  }
  function co2Parts(C, s, K) {
    const tr = Math.max(0, C - K.co2Bg) * K.co2Traffic, rest = C - tr, cars0 = tr * (1 - K.busShare), bus0 = tr * K.busShare;
    const cars = cars0 * (1 + s.cars / 100), bus = bus0 * (1 - s.ev / 100);   // an electric bus has no tailpipe, its CO2 comes from the power station
    return { rest, cars, bus, mean: rest + cars + bus };
  }
  function tempParts(Tn, s, K) {
    const heat = s.heat ? K.heatT : 0, tree = Math.min(K.treeTCap, (s.trees / 100) * K.treeT100);
    return { heat, tree, mean: Tn + heat - tree };
  }
  // the size of each slider's own effect, one at a time from "as measured": used for the doubt (80 % range)
  function oneAtATime(fn, base, s, K) {
    const m0 = fn(base, ZERO, K).mean;
    return ['cars', 'ev', 'trees', 'heat'].map((k) => fn(base, Object.assign({}, ZERO, { [k]: s[k] }), K).mean - m0);
  }

  /* ---------- 2,000 possible readings: the same standard-normal draws every time, so the picture moves smoothly with the sliders ---------- */
  const N = 2000;
  const Z = (function () {
    let a = 2026 >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const z = [];
    for (let i = 0; i < N; i++) z.push(Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()));
    return z.sort((x, y) => x - y);
  })();
  const lower = (x) => { let lo = 0, hi = N; while (lo < hi) { const mid = (lo + hi) >> 1; if (Z[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
  function dist(mean0, varShare, effs, unc, absSd) {
    const eff = Math.sqrt(effs.reduce((s, e) => s + e * e, 0));
    const sd = Math.max(1e-6, Math.sqrt(Math.pow(absSd != null ? absSd : varShare * Math.abs(mean0), 2) + Math.pow(unc * eff, 2)));
    return { mean: mean0, sd, q: (p) => mean0 + sd * Z[Math.min(N - 1, Math.max(0, Math.floor(p * N)))], below: (x) => lower((x - mean0) / sd) / N };
  }

  /* ---------- schools, devices and readings ---------- */
  const SCHOOL_NAMES = {
    'pascal-larnaka': { n: ['PASCAL Larnaka', 'PASCAL Λάρνακα'], s: ['Larnaka', 'Λάρνακα'] },
    'pascal-lefkosia': { n: ['PASCAL Lefkosia', 'PASCAL Λευκωσία'], s: ['Lefkosia', 'Λευκωσία'] },
    'pascal-limassol': { n: ['PASCAL Limassol', 'PASCAL Λεμεσός'], s: ['Limassol', 'Λεμεσός'] },
    'paphos-international': { n: ['International School of Paphos', 'Διεθνές Σχολείο Πάφου'], s: ['Paphos', 'Πάφος'] },
  };
  const nameOf = (s) => { const k = SCHOOL_NAMES[s.slug]; return k ? T(k.n[0], k.n[1]) : s.name; };
  const shortOf = (s) => { const k = SCHOOL_NAMES[s.slug]; return k ? T(k.s[0], k.s[1]) : s.short || s.name; };
  const CAT = [
    { id: 'temp', ids: ['4097'], re: /temp/i, not: /soil|water|ground|dew|surface|probe|internal|core|wet/i },
    { id: 'co2', ids: ['4100'], re: /\bco2\b|carbon dioxide/i },
    { id: 'pm25', ids: [], re: /pm\s*2[._]?5/i },
  ];
  const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const spanText = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); if (m < 90) return T(m + ' min', m + ' λεπτά'); const h = Math.round(m / 60); if (h < 36) return T(h + ' h', h + ' ώρες'); const d = Math.round(h / 24); return T(d + ' days', d + ' ημέρες'); };
  const agoText = (t) => (t ? T(spanText(Date.now() - t) + ' ago', 'πριν ' + spanText(Date.now() - t)) : '');

  /* ---------- the page ---------- */
  SC.register('whatif', {
    title: ['What-if', 'Σενάρια'],
    render(root, ctx) {
      const D = { cfg: null, devices: [], latest: {}, schools: [], air: null, open: null, at: 0 };
      const S = { school: null, cars: 0, ev: 0, trees: 0, heat: false, K: Object.assign({}, DEFAULTS), how: null };
      let alive = true, timer = 0, rz = 0, announce = 0;
      const A = {};   // the parts of the page that are redrawn

      const headHolder = el('div');
      root.append(headHolder);
      const body = el('div', { class: 'wf-page' });
      root.append(body);
      const live = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
      root.append(live);

      const help = ['Pick a school, then move the sliders. The page starts from what that school\'s sensors read now (CO2, temperature and PM2.5 where it is reported) and shows what the model says could change. The estimate always comes with an 80 % range and the measured value beside it. Open "How this estimate is made" to see every formula and number, and change the assumptions yourself.',
        'Διαλέξτε ένα σχολείο και μετακινήστε τα ρυθμιστικά. Η σελίδα ξεκινά από όσα διαβάζουν τώρα οι αισθητήρες του σχολείου (CO2, θερμοκρασία και PM2.5 όπου αναφέρεται) και δείχνει τι λέει το μοντέλο ότι θα μπορούσε να αλλάξει. Η εκτίμηση συνοδεύεται πάντα από εύρος 80 % και τη μετρημένη τιμή δίπλα της. Ανοίξτε το «Πώς γίνεται αυτή η εκτίμηση» για να δείτε κάθε τύπο και αριθμό και αλλάξτε μόνοι σας τις παραδοχές.'];
      function head(extra) {
        headHolder.replaceChildren(SC.head(Object.assign({
          title: T('What-if', 'Σενάρια'),
          lede: T('Change what happens on the school road and see how the air at the school could change. It is a model, not a forecast.', 'Αλλάξτε τι συμβαίνει στον δρόμο του σχολείου και δείτε πώς θα μπορούσε να αλλάξει ο αέρας στο σχολείο. Είναι μοντέλο, όχι πρόγνωση.'),
          help,
          tags: [{ text: T('Modelled', 'Μοντελοποιημένο'), cls: 'arch' }].concat(D.cfg && D.cfg.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : []),
        }, extra || {})));
      }
      head();

      /* ---------- data ---------- */
      const settle = (p) => p.then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
      async function load(force) {
        const get = (u, ttl) => (force ? SC.api(u) : SC.cached(u, ttl));
        const [cfg, dev, lat, sch, air, open] = await Promise.all([settle(get('/api/config', 300000)), settle(get('/api/devices', 20000)), settle(get('/api/latest', 20000)),
          settle(get('/app/api/schools/public', 300000)), settle(get('/api/air', 600000)), settle(get('/api/opensensors', 300000))]);
        const bad = [cfg, dev, lat, sch].find((r) => !r.ok);
        if (bad) throw bad.e;
        D.cfg = cfg.v; D.devices = Array.isArray(dev.v) ? dev.v : []; D.latest = lat.v || {}; D.schools = (sch.v && sch.v.schools) || [];
        D.air = air.ok ? air.v : null; D.open = open.ok ? open.v : null; D.at = Date.now();
      }
      function catOf(mid) {
        const n = D.cfg && D.cfg.names && D.cfg.names[mid], name = n ? String(n[0]) : '';
        for (const c of CAT) if (c.ids.includes(String(mid)) || (name && c.re.test(name) && !(c.not && c.not.test(name)))) return c.id;
        return null;
      }
      const wordsOf = (s) => String(s.match || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      const inSchool = (s, d) => { const g = String(d.group || '').toLowerCase() + ' ' + String(d.name || '').toLowerCase(); return wordsOf(s).some((w) => g.includes(w)); };
      function readSchool(s, cat) {
        const now = Date.now(), vals = []; let newest = 0;
        D.devices.forEach((d) => {
          if (!inSchool(s, d)) return;
          const l = D.latest[d.eui]; if (!l) return;
          for (const mid of Object.keys(l)) {
            if (catOf(mid) !== cat) continue;
            const r = l[mid], v = Number(r && r.v), t = Date.parse(r && r.t);
            if (!fin(v) || !isFinite(t) || now - t > DAY) continue;
            vals.push(v); newest = Math.max(newest, t); break;
          }
        });
        return vals.length ? { v: mean(vals), n: vals.length, t: newest } : null;
      }
      function pmBaseline(s) {
        const own = readSchool(s, 'pm25');
        if (own) return Object.assign({ src: 'sensors' }, own);
        const now = Date.now();
        const op = D.open && Array.isArray(D.open.points) ? D.open.points.filter((p) => fin(p.pm25) && fin(p.lat) && fin(p.lng) && km(s, p) <= 12 && (!p.time || now - Date.parse(p.time) < 3 * HOUR)) : [];
        if (op.length) {
          const ts = op.map((p) => Date.parse(p.time)).filter(isFinite);
          return { src: 'open', v: mean(op.map((p) => p.pm25)), n: op.length, t: ts.length ? Math.max(...ts) : Date.parse(D.open.updated) || now };
        }
        const pts = D.air && Array.isArray(D.air.points) ? D.air.points.filter((p) => fin(p.pm25) && fin(p.lat) && fin(p.lng)) : [];
        if (pts.length) {
          const best = pts.map((p) => ({ p, d: km(s, p) })).sort((a, b) => a.d - b.d)[0];
          return { src: 'model', v: best.p.pm25, n: 1, km: Math.round(best.d), t: Date.parse(D.air.updated) || now };
        }
        return null;
      }
      const baseOf = (s) => ({ pm: pmBaseline(s), co2: readSchool(s, 'co2'), temp: readSchool(s, 'temp') });
      const sourceText = (b) => (b.src === 'sensors' ? T('Our school sensors (' + b.n + ')', 'Οι αισθητήρες του σχολείου (' + b.n + ')')
        : b.src === 'open' ? T('Sensor.Community, ' + b.n + ' volunteer sensor' + (b.n === 1 ? '' : 's') + ' within 12 km', 'Sensor.Community, ' + b.n + ' αισθητήρες εθελοντών σε απόσταση έως 12 χλμ.')
          : b.src === 'model' ? T('Open-Meteo air-quality model, nearest point about ' + Math.max(1, b.km) + ' km away', 'Μοντέλο ποιότητας αέρα Open-Meteo, κοντινότερο σημείο σε περίπου ' + Math.max(1, b.km) + ' χλμ.')
            : T('Our school sensors (' + b.n + ')', 'Οι αισθητήρες του σχολείου (' + b.n + ')'));
      const sensorText = (b) => T(b.n + ' sensor' + (b.n === 1 ? '' : 's') + ' at the school', b.n + ' αισθητήρες στο σχολείο');

      /* ---------- small pieces ---------- */
      function loadingBox() { return el('div', { class: 'loading' }, T('Loading the latest readings', 'Φόρτωση των τελευταίων μετρήσεων')); }
      function errBox(e, retry) {
        return el('div', null, el('div', { class: 'err', role: 'alert' }, T('The readings could not be loaded. ', 'Δεν φορτώθηκαν οι μετρήσεις. ') + (e && e.message ? e.message : '')),
          el('div', { style: { marginTop: '10px' } }, el('button', { type: 'button', class: 'nm-btn', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά'))));
      }
      const delta = (d, unit, dec) => {
        const r = Math.round(d * Math.pow(10, dec)) / Math.pow(10, dec);
        const cls = r > 0 ? ' up' : r === 0 ? ' eq' : '';
        return el('span', { class: 'wf-delta' + cls }, r === 0 ? null : ic(r < 0 ? 'down' : 'up'), r === 0 ? T('Same as measured', 'Ίδιο με τη μέτρηση') : sgn(r, dec) + ' ' + unit + T(' vs measured', ' έναντι της μέτρησης'));
      };
      const staleBadge = (t) => (t && Date.now() - t > FRESH ? el('span', { class: 'nm-badge nm-badge--warn' }, T('Old reading', 'Παλιά μέτρηση')) : null);

      /* ---------- gauge (41 ticks) ---------- */
      function gauge(p) {
        const TK = 41, cx = 110, cy = 112, lit = Math.round(p * (TK - 1)), g = [];
        const col = (i) => { const q = i / (TK - 1); return q <= 0.34 ? '#E07F3F' : q <= 0.67 ? '#F2B24C' : '#4CCBEA'; };
        for (let i = 0; i < TK; i++) {
          const a = Math.PI + (i / (TK - 1)) * Math.PI, major = i % 5 === 0, r0 = major ? 74 : 77, r1 = 92;
          g.push(sv('line', { x1: (cx + Math.cos(a) * r0).toFixed(1), y1: (cy + Math.sin(a) * r0).toFixed(1), x2: (cx + Math.cos(a) * r1).toFixed(1), y2: (cy + Math.sin(a) * r1).toFixed(1),
            stroke: i <= lit ? col(i) : 'rgba(140,160,184,.22)', 'stroke-width': major ? 3 : 2.2, 'stroke-linecap': 'round' }));
        }
        [0, 25, 50, 75, 100].forEach((k) => { const a = Math.PI + (k / 100) * Math.PI; g.push(sv('text', { class: 'gl', x: (cx + Math.cos(a) * 104).toFixed(1), y: (cy + Math.sin(a) * 104 + 3).toFixed(1), 'text-anchor': 'middle' }, String(k))); });
        const ang = -90 + p * 180;
        return sv('svg', { class: 'wf-gauge', viewBox: '0 0 220 126', role: 'img', 'aria-label': T('Chance the reading stays under ' + WHO + ': ' + Math.round(p * 100) + ' percent', 'Πιθανότητα η τιμή να μείνει κάτω από ' + WHO + ': ' + Math.round(p * 100) + ' τοις εκατό') },
          sv('defs', null, sv('radialGradient', { id: 'wf-gg', cx: '50%', cy: '100%', r: '70%' }, sv('stop', { offset: 0, 'stop-color': '#F2B24C', 'stop-opacity': 0.26 }), sv('stop', { offset: 1, 'stop-color': '#F2B24C', 'stop-opacity': 0 }))),
          sv('path', { d: 'M ' + (cx - 70) + ' ' + cy + ' A 70 70 0 0 1 ' + (cx + 70) + ' ' + cy + ' Z', fill: 'url(#wf-gg)' }), g,
          sv('g', { transform: 'rotate(' + ang.toFixed(1) + ' ' + cx + ' ' + cy + ')' }, sv('line', { x1: cx, y1: cy - 44, x2: cx, y2: cy - 68, stroke: '#EFE9DD', 'stroke-width': 2, 'stroke-linecap': 'round' }), sv('circle', { cx, cy: cy - 69, r: 2.8, fill: '#F7C46B' })),
          sv('circle', { cx, cy, r: 4, fill: '#F2A56B' }), sv('text', { class: 'gv', x: cx, y: cy - 14, 'text-anchor': 'middle' }, Math.round(p * 100) + '%'));
      }

      /* ---------- histogram of the 2,000 possible readings, with the 80 % range bar ---------- */
      const niceStep = (raw) => [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((x) => x >= raw) || 100;
      function histogram(W, est, base) {
        const H = 262, PL = 10, PR = 10, BASE = 188, TOP = 34, RY = 232;
        let lo = Math.min(est.q(0.005), base.q(0.005), WHO - 3), hi = Math.max(est.q(0.995), base.q(0.995), WHO + 3);
        const step = niceStep((hi - lo) / (W < 460 ? 14 : 26));
        lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step;
        const nb = Math.max(4, Math.round((hi - lo) / step)), bw = (W - PL - PR) / nb;
        const xs = (v) => PL + ((v - lo) / (hi - lo)) * (W - PL - PR);
        const bins = (d) => Array.from({ length: nb }, (_, i) => Math.max(0, d.below(lo + (i + 1) * step) - d.below(lo + i * step)));
        const b = bins(est), bb = bins(base), mx = Math.max(...b, ...bb, 0.05) * 1.1;
        const y = (v) => BASE - (v / mx) * (BASE - TOP), p10 = est.q(0.1), p90 = est.q(0.9);
        const kids = [sv('defs', null,
          sv('linearGradient', { id: 'wf-hp', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: 0, 'stop-color': '#F7C46B' }), sv('stop', { offset: 1, 'stop-color': '#E07F3F', 'stop-opacity': 0.32 })),
          sv('linearGradient', { id: 'wf-hf', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: 0, 'stop-color': '#7fa7d6' }), sv('stop', { offset: 1, 'stop-color': '#4c6ea0', 'stop-opacity': 0.25 })),
          sv('linearGradient', { id: 'wf-hr', x1: 0, y1: 0, x2: 1, y2: 0 }, sv('stop', { offset: 0, 'stop-color': '#F7C46B' }), sv('stop', { offset: 1, 'stop-color': '#E07F3F' })))];
        b.forEach((v, i) => {
          if (v < 0.0008) return;
          const mid = lo + (i + 0.5) * step, inr = mid >= p10 && mid <= p90, x = PL + i * bw + 0.8, w = Math.max(1, bw - 1.6), yy = y(v), hh = BASE - yy, rr = Math.min(3.5, w / 2, hh / 2);
          kids.push(sv('path', { d: 'M' + x.toFixed(1) + ',' + BASE + ' V' + (yy + rr).toFixed(1) + ' a' + rr.toFixed(1) + ',' + rr.toFixed(1) + ' 0 0 1 ' + rr.toFixed(1) + ',-' + rr.toFixed(1) + ' h' + (w - 2 * rr).toFixed(1) + ' a' + rr.toFixed(1) + ',' + rr.toFixed(1) + ' 0 0 1 ' + rr.toFixed(1) + ',' + rr.toFixed(1) + ' V' + BASE + ' Z', fill: 'url(#' + (inr ? 'wf-hp' : 'wf-hf') + ')' }));
        });
        kids.push(sv('polyline', { fill: 'none', stroke: '#EFE9DD', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: 0.85, 'stroke-linejoin': 'round', points: bb.map((v, i) => (PL + (i + 0.5) * bw).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') }));
        const wx = xs(WHO);
        kids.push(sv('line', { x1: wx.toFixed(1), x2: wx.toFixed(1), y1: TOP - 10, y2: BASE, stroke: '#4CCBEA', 'stroke-width': 2 }));
        const left = wx > W - 150;
        kids.push(sv('text', { class: 'who', x: (left ? wx - 7 : wx + 7).toFixed(1), y: TOP - 14, 'text-anchor': left ? 'end' : 'start' }, T('WHO 24-hour guide: ', 'Οδηγός ΠΟΥ 24 ωρών: ') + WHO));
        kids.push(sv('line', { x1: PL, x2: W - PR, y1: BASE, y2: BASE, stroke: 'rgba(140,160,184,.4)' }));
        const ts = niceStep((hi - lo) / 6);
        for (let v = Math.ceil(lo / ts) * ts; v <= hi + 1e-9; v += ts) kids.push(sv('text', { x: xs(v).toFixed(1), y: BASE + 18, 'text-anchor': 'middle' }, String(Math.round(v * 100) / 100)));
        const a = xs(Math.max(lo, p10)), c = xs(Math.min(hi, p90)), m = xs(Math.min(hi, Math.max(lo, est.mean)));
        kids.push(sv('text', { x: ((a + c) / 2).toFixed(1), y: RY - 11, 'text-anchor': 'middle' }, T('8 in 10 possible readings land here', '8 στις 10 πιθανές τιμές βρίσκονται εδώ')));
        kids.push(sv('rect', { x: a.toFixed(1), y: RY - 4, width: Math.max(2, c - a).toFixed(1), height: 8, rx: 4, fill: 'url(#wf-hr)' }));
        kids.push(sv('circle', { cx: m.toFixed(1), cy: RY, r: 6, fill: '#fff', stroke: '#E07F3F', 'stroke-width': 3 }));
        kids.push(sv('text', { class: 'ink', x: Math.max(14, a).toFixed(1), y: RY + 24, 'text-anchor': 'middle' }, f1(Math.max(0, p10))));
        kids.push(sv('text', { class: 'ink', x: Math.min(W - 14, c).toFixed(1), y: RY + 24, 'text-anchor': 'middle' }, f1(p90)));
        return sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': T('Spread of 2,000 simulated readings. The middle 80 percent run from ' + f1(Math.max(0, p10)) + ' to ' + f1(p90) + ' micrograms per cubic metre.', 'Κατανομή 2.000 προσομοιωμένων τιμών. Το κεντρικό 80 τοις εκατό κυμαίνεται από ' + f1(Math.max(0, p10)) + ' έως ' + f1(p90) + ' μικρογραμμάρια ανά κυβικό μέτρο.') }, kids);
      }

      /* ---------- the controls (drawn once per school change) ---------- */
      const sliders = {};
      function slider(key, label, min, max, step, ends, hint, fmt) {
        const input = el('input', { id: 'wf-' + key, type: 'range', min, max, step, value: S[key] });
        const out = el('output', { for: 'wf-' + key }, fmt(S[key]));
        const fillP = () => input.style.setProperty('--p', ((input.value - input.min) / (input.max - input.min)) * 100 + '%');
        input.addEventListener('input', () => { S[key] = Number(input.value); out.textContent = fmt(S[key]); fillP(); update(); });
        fillP();
        sliders[key] = { input, out, fmt, fillP };
        const zero = key === 'cars' ? ((0 - min) / (max - min)) * 100 : null;
        return el('div', { class: 'wf-sl' },
          el('div', { class: 'wf-sl-top' }, el('label', { for: 'wf-' + key }, label), out), input,
          el('div', { class: 'wf-ends' }, el('span', { class: 'l' }, ends[0]), zero != null ? el('span', { class: 'z', style: { left: zero + '%' } }, T('today', 'σήμερα')) : null, el('span', { class: 'r' }, ends[1])),
          hint ? el('p', { class: 'wf-h', 'data-hint': key }, hint) : null);
      }
      const pc = (x) => Math.round(x * 100) + ' %';
      const hints = () => {
        const K = S.K;
        return {
          cars: T('In the model cars make about ' + pc(K.roadShare * (1 - K.busShare)) + ' of the PM2.5 at the school, so this is the biggest lever.', 'Στο μοντέλο τα αυτοκίνητα παράγουν περίπου ' + pc(K.roadShare * (1 - K.busShare)) + ' του PM2.5 στο σχολείο, άρα είναι ο μεγαλύτερος μοχλός.'),
          ev: T('Buses make about ' + pc(K.roadShare * K.busShare) + ' of it. An electric bus loses its exhaust (' + pc(K.evCut) + ' of its PM2.5 in the model) but keeps brake, tyre and road dust.', 'Τα λεωφορεία παράγουν περίπου ' + pc(K.roadShare * K.busShare) + '. Ένα ηλεκτρικό λεωφορείο χάνει την εξάτμιση (' + pc(K.evCut) + ' του PM2.5 του στο μοντέλο) αλλά κρατά τη σκόνη από φρένα, ελαστικά και δρόμο.'),
          trees: T('Young trees catch only a little dust. In the model every 100 trees trim the road\'s part by ' + SC.num(K.tree100 * 100, 1).replace('.0', '') + ' % (at most ' + pc(K.treeCap) + ') and cool the air by ' + SC.num(K.treeT100, 1) + ' °C.', 'Τα νεαρά δέντρα συγκρατούν λίγη σκόνη. Στο μοντέλο κάθε 100 δέντρα μειώνουν το μέρος του δρόμου κατά ' + SC.num(K.tree100 * 100, 1).replace('.0', '') + ' % (το πολύ ' + pc(K.treeCap) + ') και δροσίζουν τον αέρα κατά ' + SC.num(K.treeT100, 1) + ' °C.'),
        };
      };
      function controls() {
        const h = hints();
        const heat = el('input', { type: 'checkbox', id: 'wf-heat', checked: S.heat ? true : null });
        heat.addEventListener('change', () => { S.heat = heat.checked; update(); });
        A.heat = heat;
        const heatHint = el('small', { 'data-hint': 'heat' });
        A.heatHint = heatHint;
        A.hints = () => {
          const h2 = hints();
          Object.keys(h2).forEach((k) => { const p = A.ctl.querySelector('[data-hint="' + k + '"]'); if (p) p.textContent = h2[k]; });
          heatHint.textContent = T('Hot, still air lets dust build up. The model adds ' + pc(S.K.heatOut) + ' to the outside part of the PM2.5, ' + pc(S.K.heatRoad) + ' to the road\'s part, and ' + SC.num(S.K.heatT, 1) + ' °C to the temperature.',
            'Ο ζεστός, ακίνητος αέρας αφήνει τη σκόνη να συσσωρεύεται. Το μοντέλο προσθέτει ' + pc(S.K.heatOut) + ' στο εξωτερικό μέρος του PM2.5, ' + pc(S.K.heatRoad) + ' στο μέρος του δρόμου και ' + SC.num(S.K.heatT, 1) + ' °C στη θερμοκρασία.');
        };
        const ctl = el('div', { class: 'wf-ctl' },
          el('span', { class: 'wf-lab info' }, T('Change the day', 'Αλλάξτε την ημέρα')),
          slider('cars', T('Cars on the school road', 'Αυτοκίνητα στον δρόμο του σχολείου'), -50, 20, 5, ['−50 %', '+20 %'], h.cars, (v) => (v > 0 ? '+' : '') + String(v).replace('-', '−') + ' %'),
          slider('ev', T('Buses switching to electric', 'Λεωφορεία που γίνονται ηλεκτρικά'), 0, 100, 10, ['0 %', '100 %'], h.ev, (v) => v + ' %'),
          slider('trees', T('Trees planted along the route', 'Δέντρα που φυτεύονται στη διαδρομή'), 0, 200, 10, ['0', '200'], h.trees, (v) => String(v)),
          el('label', { class: 'wf-tg', for: 'wf-heat' }, heat, el('span', { class: 'sw' }), el('span', null, el('b', null, T('Heat wave day', 'Ημέρα καύσωνα')), heatHint)),
          el('button', { type: 'button', class: 'nm-btn', onclick: () => apply(PRESETS[0].s) }, ic('reset'), T('Back to today\'s readings', 'Πίσω στις σημερινές μετρήσεις')));
        A.ctl = ctl;
        A.hints();
        return ctl;
      }
      function apply(s) {
        S.cars = s.cars; S.ev = s.ev; S.trees = s.trees; S.heat = s.heat;
        ['cars', 'ev', 'trees'].forEach((k) => { const sl = sliders[k]; if (!sl) return; sl.input.value = S[k]; sl.out.textContent = sl.fmt(S[k]); sl.fillP(); });
        if (A.heat) A.heat.checked = S.heat;
        update();
      }

      /* ---------- results ---------- */
      function pmBlock(school, b) {
        if (!b.pm) {
          return el('section', { class: 'wf-card' }, el('div', { class: 'wf-k' }, 'PM2.5'),
            el('div', { class: 'empty' }, T('No PM2.5 reading for this school yet. The school sensors do not report it, and the open feeds (Sensor.Community and the Open-Meteo model) returned nothing. No estimate is shown for PM2.5 rather than a made-up one. CO2 and temperature below still work.',
              'Δεν υπάρχει ακόμα μέτρηση PM2.5 για αυτό το σχολείο. Οι αισθητήρες του σχολείου δεν την αναφέρουν και οι ανοιχτές πηγές (Sensor.Community και το μοντέλο Open-Meteo) δεν επέστρεψαν τίποτα. Δεν εμφανίζεται εκτίμηση PM2.5 αντί για επινοημένη. Το CO2 και η θερμοκρασία παρακάτω λειτουργούν κανονικά.')));
        }
        const K = S.K, B = b.pm.v, s = { cars: S.cars, ev: S.ev, trees: S.trees, heat: S.heat };
        const r = pmParts(B, s, K), r0 = pmParts(B, ZERO, K);
        const effs = oneAtATime(pmParts, B, s, K);
        const est = dist(r.mean, K.varPct, effs, K.unc), base = dist(r0.mean, K.varPct, [], K.unc);
        const under = est.below(WHO), under0 = base.below(WHO), dp = Math.round((under - under0) * 100);
        const p10 = Math.max(0, est.q(0.1)), p90 = est.q(0.9), tot = r.mean || 1;
        const chart = el('div', { class: 'wf-hist' });
        A.draw = () => { const W = Math.max(300, Math.min(620, Math.round(chart.clientWidth || 560))); fill(chart, histogram(W, est, base)); };
        const seg = (v, c) => el('i', { style: { flex: String(Math.max(0.0001, v)), background: c } });
        const node = el('section', { class: 'wf-card', 'aria-label': 'PM2.5' },
          el('div', { class: 'wf-k lab' }, T('PM2.5 at ' + nameOf(school), 'PM2.5 · ' + nameOf(school))),
          el('div', { class: 'wf-stats' },
            el('div', { class: 'wf-stat st-base' }, el('span', { class: 'k' }, T('Measured now', 'Μετρήθηκε τώρα')),
              el('strong', null, f1(B), el('small', null, 'µg/m³')),
              el('span', { class: 'sub' }, sourceText(b.pm)), el('span', { class: 'sub' }, T('Reading ', 'Μέτρηση ') + agoText(b.pm.t)), staleBadge(b.pm.t)),
            el('div', { class: 'wf-stat st-mean' }, el('span', { class: 'k' }, T('Estimate with your changes', 'Εκτίμηση με τις αλλαγές σας')),
              el('strong', null, f1(r.mean), el('small', null, 'µg/m³')), delta(r.mean - B, 'µg/m³', 1)),
            el('div', { class: 'wf-stat st-range' }, el('span', { class: 'k' }, T('80 % range of the estimate', 'Εύρος 80 % της εκτίμησης')),
              el('strong', null, f1(p10) + T(' to ', ' έως ') + f1(p90)), el('span', { class: 'sub' }, T('µg/m³, where 8 in 10 possible readings land', 'µg/m³, όπου βρίσκονται 8 στις 10 πιθανές τιμές'))),
            el('div', { class: 'wf-stat st-gauge' }, el('span', { class: 'k' }, T('Chance the reading stays under ' + WHO + ' µg/m³', 'Πιθανότητα η τιμή να μείνει κάτω από ' + WHO + ' µg/m³')),
              gauge(under),
              el('small', null, dp === 0 ? T('As measured: ' + Math.round(under0 * 100) + ' %', 'Όπως μετρήθηκε: ' + Math.round(under0 * 100) + ' %')
                : el('span', null, el('b', { class: dp < 0 ? 'dn' : '' }, (dp > 0 ? '+' : '−') + Math.abs(dp) + T(' points', ' μονάδες')), T(' vs as measured (' + Math.round(under0 * 100) + ' %)', ' έναντι της μέτρησης (' + Math.round(under0 * 100) + ' %)'))),
              el('small', null, T('WHO\'s ' + WHO + ' is a 24-hour average. One reading is not, so take this as a guide only.', 'Το ' + WHO + ' του ΠΟΥ είναι μέσος όρος 24 ωρών. Μία μέτρηση δεν είναι, γι’ αυτό δείτε το μόνο ως οδηγό.')))),
          el('figure', { class: 'wf-fig' },
            el('div', { class: 'wf-fig-h' }, el('span', { class: 'lab' }, T('2,000 possible readings', '2.000 πιθανές τιμές')),
              el('div', { class: 'lg' }, kspan('#E8963F', el('i'), T('Middle 80 %', 'Κεντρικό 80 %')), kspan('#6f93c4', el('i'), T('Rest', 'Υπόλοιπο')),
                el('span', null, el('i', { class: 'ln' }), T('As measured', 'Όπως μετρήθηκε')), kspan('#4CCBEA', el('i'), T('WHO guide', 'Οδηγός ΠΟΥ')))),
            chart,
            el('figcaption', null, el('span', { class: 'sim' }, T('Simulation', 'Προσομοίωση')), el('span', null, T('A taller bar means more of the 2,000 possible readings. Values in µg/m³.', 'Μεγαλύτερη μπάρα σημαίνει περισσότερες από τις 2.000 πιθανές τιμές. Τιμές σε µg/m³.')))),
          el('div', { class: 'wf-split' }, el('span', { class: 'lab' }, T('Where the dust comes from, with your settings', 'Από πού προέρχεται η σκόνη, με τις ρυθμίσεις σας')),
            el('div', { class: 'seg', role: 'img', 'aria-label': T('Split of PM2.5 by source', 'Κατανομή του PM2.5 ανά πηγή') }, seg(r.out, '#8CA0B8'), seg(r.cars, '#E07F3F'), seg(r.bus, '#4CCBEA')),
            el('div', { class: 'seg-l' }, kspan('#8CA0B8', T('Outside ', 'Εξωτερικό '), el('b', null, f1(r.out))), kspan('#E07F3F', T('Cars ', 'Αυτοκίνητα '), el('b', null, f1(r.cars))),
              kspan('#4CCBEA', T('Buses ', 'Λεωφορεία '), el('b', null, f1(r.bus))), kspan('transparent', T('Total ', 'Σύνολο '), el('b', null, f1(tot)), ' µg/m³'))));
        A.pmData = { B, est, p10, p90, under, under0, r };
        return node;
      }
      function miniBlock(title, b, fn, partsOf, varShare, unit, dec, extra, absSd) {
        if (!b) {
          return el('section', { class: 'wf-card wf-mini' }, el('div', { class: 'wf-k lab' }, title),
            el('div', { class: 'empty' }, T('No recent reading from this school\'s sensors (none in the last 24 hours). No estimate is shown.', 'Καμία πρόσφατη μέτρηση από τους αισθητήρες του σχολείου (καμία τις τελευταίες 24 ώρες). Δεν εμφανίζεται εκτίμηση.')));
        }
        const s = { cars: S.cars, ev: S.ev, trees: S.trees, heat: S.heat }, K = S.K;
        const r = fn(b.v, s, K), effs = oneAtATime(fn, b.v, s, K), d = dist(r.mean, varShare, effs, K.unc, absSd);
        const p10 = d.q(0.1), p90 = d.q(0.9);
        return el('section', { class: 'wf-card wf-mini', 'aria-label': title },
          el('div', { class: 'wf-k lab' }, title),
          el('div', { class: 'wf-mini-g' },
            el('div', null, el('span', { class: 'k' }, T('Measured now', 'Μετρήθηκε τώρα')), el('strong', null, SC.num(b.v, dec), el('small', null, unit)), el('span', { class: 'sub' }, sensorText(b) + ', ' + agoText(b.t)), staleBadge(b.t)),
            el('div', null, el('span', { class: 'k' }, T('Estimate', 'Εκτίμηση')), el('strong', null, SC.num(r.mean, dec), el('small', null, unit)), delta(r.mean - b.v, unit, dec)),
            el('div', null, el('span', { class: 'k' }, T('80 % range', 'Εύρος 80 %')), el('strong', { class: 'sm' }, SC.num(p10, dec) + T(' to ', ' έως ') + SC.num(p90, dec)), el('span', { class: 'sub' }, unit))),
          extra ? el('p', { class: 'wf-note' }, extra) : null);
      }
      function paintResults() {
        const school = D.schools.find((s) => s.slug === S.school);
        const b = baseOf(school);
        A.base = b; A.pmData = null; A.draw = null;
        const co2 = miniBlock('CO2', b.co2, co2Parts, null, S.K.varCo2, 'ppm', 0,
          T('Our CO2 sensors sit on buses, cars and in classrooms, so a reading also holds people\'s breath. The model touches only the part above the outdoor background (about ' + S.K.co2Bg + ' ppm) and assumes ' + pc(S.K.co2Traffic) + ' of that part is traffic. Electric buses have no tailpipe; the CO2 made at the power station is not counted. Trees and heat change nothing here.',
            'Οι αισθητήρες CO2 βρίσκονται σε λεωφορεία, αυτοκίνητα και αίθουσες, άρα μια μέτρηση περιέχει και την αναπνοή των ανθρώπων. Το μοντέλο αγγίζει μόνο το μέρος πάνω από το υπόβαθρο στο ύπαιθρο (περίπου ' + S.K.co2Bg + ' ppm) και υποθέτει ότι το ' + pc(S.K.co2Traffic) + ' αυτού του μέρους είναι κυκλοφορία. Τα ηλεκτρικά λεωφορεία δεν έχουν εξάτμιση· το CO2 του σταθμού παραγωγής ρεύματος δεν υπολογίζεται. Τα δέντρα και η ζέστη δεν αλλάζουν τίποτα εδώ.'));
        const tmp = miniBlock(T('Temperature', 'Θερμοκρασία'), b.temp, tempParts, null, 0, '°C', 1,
          T('Only trees (cooling) and the heat wave change the temperature. Engine heat from cars and buses is tiny at street scale and is not modelled.', 'Μόνο τα δέντρα (δροσισμός) και ο καύσωνας αλλάζουν τη θερμοκρασία. Η θερμότητα των κινητήρων είναι ασήμαντη σε κλίμακα δρόμου και δεν μοντελοποιείται.'), S.K.varT);
        fill(A.res, pmBlock(school, b), el('div', { class: 'wf-two' }, co2, tmp));
        if (A.draw) A.draw();
      }
      function summaryText() {
        const school = D.schools.find((s) => s.slug === S.school), b = A.base || baseOf(school), K = S.K;
        const s = { cars: S.cars, ev: S.ev, trees: S.trees, heat: S.heat };
        const L = [];
        L.push(T('What-if for ', 'Σενάριο για ') + nameOf(school) + ' (' + T('ESTIMATE, NOT A MEASUREMENT', 'ΕΚΤΙΜΗΣΗ, ΟΧΙ ΜΕΤΡΗΣΗ') + ')');
        L.push(T('Changes: cars ', 'Αλλαγές: αυτοκίνητα ') + sgn(S.cars, 0).replace('-', '−') + ' %, ' + T('electric buses ', 'ηλεκτρικά λεωφορεία ') + S.ev + ' %, ' + T('trees planted ', 'δέντρα ') + S.trees + ', ' + T('heat wave ', 'καύσωνας ') + (S.heat ? T('on', 'ναι') : T('off', 'όχι')));
        if (b.pm) {
          const B = b.pm.v, r = pmParts(B, s, K), d = dist(r.mean, K.varPct, oneAtATime(pmParts, B, s, K), K.unc), d0 = dist(pmParts(B, ZERO, K).mean, K.varPct, [], K.unc);
          L.push('PM2.5: ' + T('measured ', 'μετρήθηκε ') + f1(B) + ' µg/m³ (' + sourceText(b.pm) + ', ' + agoText(b.pm.t) + '), ' + T('estimate ', 'εκτίμηση ') + f1(r.mean) + ' µg/m³, ' + T('80 % range ', 'εύρος 80 % ') + f1(Math.max(0, d.q(0.1))) + T(' to ', ' έως ') + f1(d.q(0.9)) + '. ' + T('Chance under ', 'Πιθανότητα κάτω από ') + WHO + ' µg/m³: ' + Math.round(d.below(WHO) * 100) + ' % (' + T('as measured ', 'όπως μετρήθηκε ') + Math.round(d0.below(WHO) * 100) + ' %).');
        } else L.push('PM2.5: ' + T('no reading available, no estimate.', 'δεν υπάρχει μέτρηση, δεν υπάρχει εκτίμηση.'));
        [['CO2', b.co2, co2Parts, K.varCo2, 'ppm', 0, null], [T('Temperature', 'Θερμοκρασία'), b.temp, tempParts, 0, '°C', 1, K.varT]].forEach(([nm, bb, fn, vs, u, dec, abs]) => {
          if (!bb) { L.push(nm + ': ' + T('no recent reading, no estimate.', 'καμία πρόσφατη μέτρηση, καμία εκτίμηση.')); return; }
          const r = fn(bb.v, s, K), d = dist(r.mean, vs, oneAtATime(fn, bb.v, s, K), K.unc, abs);
          L.push(nm + ': ' + T('measured ', 'μετρήθηκε ') + SC.num(bb.v, dec) + ' ' + u + ' (' + agoText(bb.t) + '), ' + T('estimate ', 'εκτίμηση ') + SC.num(r.mean, dec) + ' ' + u + ', ' + T('80 % range ', 'εύρος 80 % ') + SC.num(d.q(0.1), dec) + T(' to ', ' έως ') + SC.num(d.q(0.9), dec) + '.');
        });
        L.push(T('Model: a simple source split with assumed coefficients, listed on the page ("How this estimate is made"). Not tested against a trial.', 'Μοντέλο: απλός διαχωρισμός πηγών με παραδοχές που αναφέρονται στη σελίδα («Πώς γίνεται αυτή η εκτίμηση»). Δεν έχει ελεγχθεί με πείραμα.'));
        L.push(T('Made ', 'Δημιουργήθηκε ') + SC.dateTime(Date.now()) + ' (' + T('Cyprus time', 'ώρα Κύπρου') + ')');
        return L.join('\n');
      }
      function copySummary() {
        const text = A.sum.value;
        const done = () => SC.toast(T('Summary copied', 'Η περίληψη αντιγράφηκε'));
        const fallback = () => { A.sum.focus(); A.sum.select(); try { if (document.execCommand('copy')) return done(); } catch (e) { /* ignore */ } SC.toast(T('Select the text and copy it', 'Επιλέξτε το κείμενο και αντιγράψτε το')); };
        try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
      }
      function update() {
        if (!alive || !A.res) return;
        paintResults();
        A.sum.value = summaryText();
        document.querySelectorAll('.wf-presets button').forEach((bt) => { const q = PRESETS.find((p) => p.id === bt.dataset.p); const on = same(q.s, S); bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        clearTimeout(announce);
        announce = setTimeout(() => { if (A.pmData) live.textContent = T('Estimate: PM2.5 ' + f1(A.pmData.r.mean) + ' micrograms per cubic metre, 80 percent range ' + f1(A.pmData.p10) + ' to ' + f1(A.pmData.p90) + '.', 'Εκτίμηση: PM2.5 ' + f1(A.pmData.r.mean) + ' μικρογραμμάρια ανά κυβικό μέτρο, εύρος 80 τοις εκατό ' + f1(A.pmData.p10) + ' έως ' + f1(A.pmData.p90) + '.'); }, 700);
      }

      /* ---------- "How this estimate is made" ---------- */
      function howBlock() {
        const K = S.K;
        const rows = COEF.map((c) => {
          const inp = el('input', { type: 'number', class: 'nm-input wf-num', value: String(Math.round(K[c.k] * c.m * 100) / 100), min: c.min, max: c.max, step: c.step, 'aria-label': T(c.l[0], c.l[1]) });
          inp.addEventListener('input', () => { const v = Number(inp.value); if (!isFinite(v)) return; K[c.k] = Math.min(c.max, Math.max(c.min, v)) / c.m; A.hints(); update(); });
          return el('tr', null, el('td', null, T(c.l[0], c.l[1])), el('td', { class: 'num' }, inp, el('span', { class: 'u' }, c.u)), el('td', null, c.r), el('td', { class: 'b' }, T(c.b[0], c.b[1])));
        });
        const det = el('details', { class: 'wf-how nm-callout nm-callout--info' });
        det.open = typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;
        det.append(el('summary', null, ic('info'), T('How this estimate is made', 'Πώς γίνεται αυτή η εκτίμηση')),
          el('div', { class: 'wf-how-g' },
            el('ol', null,
              el('li', null, el('b', null, T('Start from what we measured. ', 'Ξεκινάμε από ό,τι μετρήσαμε. ')), T('The latest CO2, temperature and PM2.5 of the school you picked. If no school sensor reports PM2.5, the page uses nearby volunteer sensors (Sensor.Community) or the Open-Meteo model and says so. A regional value describes the area, not the gate itself.', 'Οι τελευταίες τιμές CO2, θερμοκρασίας και PM2.5 του σχολείου που διαλέξατε. Αν κανένας αισθητήρας σχολείου δεν αναφέρει PM2.5, η σελίδα χρησιμοποιεί κοντινούς αισθητήρες εθελοντών (Sensor.Community) ή το μοντέλο Open-Meteo και το λέει. Μια περιφερειακή τιμή περιγράφει την περιοχή, όχι την ίδια την είσοδο.')),
              el('li', null, el('b', null, T('Split it by source. ', 'Το χωρίζουμε ανά πηγή. ')), T('Part comes from the road (cars and buses), the rest from outside. The split is an assumption (table below).', 'Ένα μέρος προέρχεται από τον δρόμο (αυτοκίνητα και λεωφορεία), το υπόλοιπο από έξω. Ο διαχωρισμός είναι παραδοχή (πίνακας παρακάτω).')),
              el('li', null, el('b', null, T('Each slider changes only its own part. ', 'Κάθε ρυθμιστικό αλλάζει μόνο το δικό του μέρος. ')), T('Fewer cars cut the car part. Electric buses cut the bus part. Trees trim the road part. A heat wave makes the outside and road parts bigger.', 'Λιγότερα αυτοκίνητα μειώνουν το μέρος των αυτοκινήτων. Τα ηλεκτρικά λεωφορεία μειώνουν το μέρος των λεωφορείων. Τα δέντρα μειώνουν το μέρος του δρόμου. Ο καύσωνας μεγαλώνει το εξωτερικό μέρος και του δρόμου.')),
              el('li', null, el('b', null, T('Add the wobble of real life. ', 'Προσθέτουμε τη διακύμανση της πραγματικής ζωής. ')), T('Readings differ from one moment to the next, and every effect is itself uncertain, so we draw 2,000 possible readings. The 80 % range is where 8 in 10 of them land. The more you change, the wider it gets.', 'Οι μετρήσεις διαφέρουν από στιγμή σε στιγμή και κάθε επίδραση είναι αβέβαιη, γι’ αυτό σχεδιάζουμε 2.000 πιθανές τιμές. Το εύρος 80 % είναι όπου βρίσκονται οι 8 στις 10. Όσο περισσότερα αλλάζετε, τόσο μεγαλώνει.'))),
            el('div', { class: 'rt' },
              el('pre', { class: 'wf-formula', tabindex: 0 }, 'PM2.5 = outside + road\noutside = (B − B × traffic) × (1 + heat wave outside)\nroad    = (cars + buses) × (1 − trees) × (1 + heat wave road)\ncars    = B × traffic × (1 − bus share) × (1 + change in cars)\nbuses   = B × traffic × bus share × (1 − electric share × cut)\ntrees   = min(cap, trees ÷ 100 × trim per 100)\nCO2     = (CO2 − traffic part) + cars × (1 + change) + buses × (1 − electric share)\ntemp    = T + heat wave rise − min(cap, trees ÷ 100 × cooling per 100)\nsd      = √( (variation × value)² + (doubt × √Σ effect²)² )\n80 % range = value ± 1.28 × sd      (B = baseline reading)'),
              el('p', { class: 'wf-untested' }, el('b', null, T('Not tested yet. ', 'Δεν έχει δοκιμαστεί ακόμα. ')), T('No trial has checked this model and the numbers below are not fitted to our data. A pilot with a PM2.5 sensor at the gate would show how far off it is. Read the result as "what would happen if these assumptions were right".', 'Κανένα πείραμα δεν έχει ελέγξει αυτό το μοντέλο και οι αριθμοί παρακάτω δεν έχουν προσαρμοστεί στα δεδομένα μας. Ένας πιλότος με αισθητήρα PM2.5 στην είσοδο θα έδειχνε πόσο απέχει. Διαβάστε το αποτέλεσμα ως «τι θα γινόταν αν οι παραδοχές ήταν σωστές».')))),
          el('div', { class: 'wf-tbl' }, el('div', { class: 'nm-table-wrap' }, el('table', { class: 'nm-table' },
            el('thead', null, el('tr', null, el('th', null, T('Setting', 'Ρύθμιση')), el('th', null, T('Value (you can change it)', 'Τιμή (μπορείτε να την αλλάξετε)')), el('th', null, T('Sensible range', 'Λογικό εύρος')), el('th', null, T('Where it comes from', 'Από πού προέρχεται')))),
            el('tbody', null, rows))),
            el('button', { type: 'button', class: 'nm-btn nm-btn--ghost', onclick: () => { Object.assign(S.K, DEFAULTS); S.how = null; drawPage(); } }, ic('reset'), T('Back to the starting assumptions', 'Πίσω στις αρχικές παραδοχές'))),
          el('p', { class: 'wf-src' }, T('Sources named above: Nowak et al. 2013, Environmental Pollution 178:395-402; Abhijith et al. 2017, Atmospheric Environment 162:71-86; Bowler et al. 2010, Landscape and Urban Planning 97:147-155; EMEP/EEA air pollutant emission inventory guidebook (road transport, non-exhaust); WHO global air quality guidelines 2021 (PM2.5, 24-hour guide ' + WHO + ' µg/m³); NOAA Global Monitoring Laboratory (CO2). Values are rounded rules of thumb taken from those ranges, not numbers copied from one table.',
            'Πηγές που αναφέρονται παραπάνω: Nowak και συν. 2013, Environmental Pollution 178:395-402· Abhijith και συν. 2017, Atmospheric Environment 162:71-86· Bowler και συν. 2010, Landscape and Urban Planning 97:147-155· οδηγός απογραφής εκπομπών EMEP/EEA (οδική μεταφορά, μη καυσαέρια)· Παγκόσμιες οδηγίες ΠΟΥ για την ποιότητα του αέρα 2021 (PM2.5, οδηγός 24 ωρών ' + WHO + ' µg/m³)· NOAA Global Monitoring Laboratory (CO2). Οι τιμές είναι στρογγυλεμένοι εμπειρικοί κανόνες από αυτά τα εύρη, όχι αριθμοί αντιγραμμένοι από έναν πίνακα.')));
        return det;
      }

      /* ---------- the page body ---------- */
      function drawPage() {
        if (!D.schools.length) { fill(body, el('div', { class: 'empty' }, T('No schools are listed yet, so there is nothing to start from.', 'Δεν υπάρχουν ακόμα σχολεία στη λίστα, άρα δεν υπάρχει από πού να ξεκινήσουμε.'))); return; }
        if (!S.school || !D.schools.some((s) => s.slug === S.school)) {
          const want = ctx.query && ctx.query.get('school');
          const withData = D.schools.find((s) => { const b = baseOf(s); return b.pm || b.co2 || b.temp; });
          S.school = D.schools.some((s) => s.slug === want) ? want : (withData || D.schools[0]).slug;
        }
        const school = D.schools.find((s) => s.slug === S.school);
        const sch = el('div', { class: 'nm-pillbar wf-schools', role: 'group', 'aria-label': T('School', 'Σχολείο') }, D.schools.map((s) => el('button', { type: 'button', class: s.slug === S.school ? 'on' : '', 'aria-pressed': s.slug === S.school ? 'true' : 'false', onclick: () => { S.school = s.slug; drawPage(); } }, shortOf(s))));
        const pre = el('div', { class: 'nm-pillbar wf-presets', role: 'group', 'aria-label': T('Starting points', 'Αφετηρίες') }, PRESETS.map((p) => el('button', { type: 'button', 'data-p': p.id, onclick: () => apply(p.s) }, T(p.l[0], p.l[1]))));
        A.res = el('div', { class: 'wf-res' });
        A.sum = el('textarea', { class: 'nm-input wf-sum', readonly: true, rows: 9, 'aria-label': T('Summary to copy', 'Περίληψη για αντιγραφή') });
        const b = baseOf(school);
        const seen = [b.pm, b.co2, b.temp].filter(Boolean).map((x) => x.t).filter(Boolean);
        head({ fresh: seen.length ? T('Readings ', 'Μετρήσεις ') + agoText(Math.max(...seen)) : null });
        fill(body,
          el('div', { class: 'wf-bar' }, el('div', null, el('span', { class: 'wf-lab' }, T('School', 'Σχολείο')), sch), el('div', null, el('span', { class: 'wf-lab' }, T('Starting point', 'Αφετηρία')), pre)),
          el('section', { class: 'nm-card wf', 'aria-labelledby': 'wf-h' },
            el('header', { class: 'wf-hd' }, el('span', { class: 'nm-icon-tile' }, ic('sliders')),
              el('div', { class: 'tt' }, el('h2', { id: 'wf-h' }, T('Air at ' + nameOf(school) + ', starting from the latest readings', 'Ο αέρας στο ' + nameOf(school) + ', ξεκινώντας από τις τελευταίες μετρήσεις')),
                el('p', null, T('How clean could it get if the road around the school changes?', 'Πόσο καθαρός θα μπορούσε να γίνει αν αλλάξει ο δρόμος γύρω από το σχολείο;'))),
              el('span', { class: 'wf-est' }, ic('alert'), T('Estimate, not a measurement', 'Εκτίμηση, όχι μέτρηση'))),
            el('div', { class: 'wf-grid' }, controls(), A.res)),
          el('section', { class: 'nm-card wf-sumcard' }, el('div', { class: 'wf-sum-h' }, el('div', null, el('h2', { class: 'card-h' }, T('Summary you can copy', 'Περίληψη για αντιγραφή')), el('p', { class: 'card-sub' }, T('Plain text with the measured values, the estimates and their ranges, for a report or a chat.', 'Απλό κείμενο με τις μετρημένες τιμές, τις εκτιμήσεις και τα εύρη τους, για μια αναφορά ή μια συνομιλία.'))),
            el('button', { type: 'button', class: 'nm-btn nm-btn--primary', onclick: copySummary }, ic('copy'), T('Copy summary', 'Αντιγραφή περίληψης'))), A.sum),
          howBlock());
        apply({ cars: S.cars, ev: S.ev, trees: S.trees, heat: S.heat });
      }

      /* ---------- start ---------- */
      async function start(force) {
        fill(body, loadingBox());
        try { await load(force); } catch (e) { if (alive) fill(body, errBox(e, () => start(true))); return; }
        if (!alive) return;
        head();
        drawPage();
      }
      async function refresh() {
        if (!alive || !D.schools.length) return;
        try { await load(false); } catch (e) { return; }   // keep what is on screen; the age of the reading says how old it is
        if (alive && A.res) { head({ fresh: (() => { const b = baseOf(D.schools.find((s) => s.slug === S.school)); const t = [b.pm, b.co2, b.temp].filter(Boolean).map((x) => x.t); return t.length ? T('Readings ', 'Μετρήσεις ') + agoText(Math.max(...t)) : null; })() }); update(); }
      }
      const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (alive && A.draw && A.res && A.res.isConnected) A.draw(); }, 200); };
      window.addEventListener('resize', onResize);
      timer = setInterval(refresh, 60000);
      start(false);
      return () => { alive = false; clearInterval(timer); clearTimeout(rz); clearTimeout(announce); window.removeEventListener('resize', onResize); };
    },
  });
})();
