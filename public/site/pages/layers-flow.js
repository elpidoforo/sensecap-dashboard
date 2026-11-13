/*
  Data layers, the "All our data" view (used by pages/layers.js, after pages/layers-live.js): SC.layersLive.all(host, api).
  1. Data flow: one big scene. Every connected layer is a glowing dot at its own height. Dots of data stream from it into the
     master brain, faster for a layer that updates more often. Layers that measure the same thing first join into a "river";
     a river runs smooth when its sources agree for the chosen city and sparks when they differ. The brain sends a beam to each
     of the four cities. Press a layer, a river or a city to light up its path and read the numbers.
  2. Every level, from space down to the sea: the connected layers (solid chips, with their live value) and the sources on the
     list to add (dashed chips), each explained in one line.
  Data: GET /layers/api/live (layers, rivers, cities). The list to add that is not in the register yet comes from the research
  handoff of 13 November 2026 and is written here (ROADMAP). Vehicles are a count and a city-level number, never a position.
  Motion stops for reduced motion, off screen and in a hidden tab.
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const nm = (l) => (isEl() && l.nameEl) || l.name;
  const lab = (a) => (Array.isArray(a) ? a[isEl() ? 1 : 0] : a) || '';
  const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COL = { own: '#F2A56B', official: '#4CCBEA', model: '#B6A7F0', context: '#7FD3A0', bad: '#FF8B7D', gold: '#F7C46B' };
  const isLive = (l) => l.state === 'live' || l.state === 'late';
  const num = (v) => (v == null || !isFinite(v) ? '–' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)).replace('-', '−');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const setVar = (e, k, v) => e.style.setProperty(k, v);
  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const SHORT = { temperature: ['Temperature', 'Θερμοκρασία'], relative_humidity: ['Humidity', 'Υγρασία'], wind_speed: ['Wind', 'Άνεμος'], pressure: ['Pressure', 'Πίεση'], co2: ['CO₂', 'CO₂'], pm25: ['PM2.5', 'PM2.5'], pm10: ['PM10', 'PM10'], sea_surface_temperature: ['Sea heat', 'Θάλασσα'], aerosol_optical_depth: ['Haze', 'Θολούρα'], ozone: ['Ozone', 'Όζον'], solar_irradiance: ['Sunshine', 'Ήλιος'] };
  const shortOf = (r) => lab(SHORT[r.variable] || r.label);

  // the levels, top to bottom; a layer of the register falls into one of them
  const LEVELS = [
    { id: 'space', col: COL.model, name: ['Satellites', 'Δορυφόροι'], height: ['Space · 700 to 36,000 km up', 'Διάστημα · 700 έως 36.000 km ψηλά'], what: ['Cameras and instruments in orbit that see the whole island at once, when the sky is clear.', 'Κάμερες και όργανα σε τροχιά που βλέπουν όλο το νησί μαζί, όταν ο ουρανός είναι καθαρός.'] },
    { id: 'model', col: COL.model, name: ['Weather and air models', 'Μοντέλα καιρού και αέρα'], height: ['Air · computer models', 'Αέρας · υπολογιστικά μοντέλα'], what: ['Computers that work out the weather and the air for squares about 11 km wide. An estimate, not a measurement.', 'Υπολογιστές που εκτιμούν τον καιρό και τον αέρα για τετράγωνα πλάτους περίπου 11 km. Εκτίμηση, όχι μέτρηση.'] },
    { id: 'official', col: COL.official, name: ['Official stations', 'Επίσημοι σταθμοί'], height: ['Ground · official', 'Έδαφος · επίσημα'], what: ['Checked instruments run by public services. The most trusted numbers we have.', 'Ελεγμένα όργανα δημόσιων υπηρεσιών. Οι πιο αξιόπιστοι αριθμοί που έχουμε.'] },
    { id: 'own', col: COL.own, name: ['Our own sensors', 'Οι δικοί μας αισθητήρες'], height: ['Ground · 2 m above it', 'Έδαφος · 2 m πάνω του'], what: ['Sensors that students of four schools placed themselves. Vehicles are only counted, never shown on a map.', 'Αισθητήρες που τοποθέτησαν οι ίδιοι οι μαθητές τεσσάρων σχολείων. Τα οχήματα μόνο μετριούνται, ποτέ δεν μπαίνουν σε χάρτη.'] },
    { id: 'context', col: COL.context, name: ['City context', 'Πλαίσιο πόλης'], height: ['The city', 'Η πόλη'], what: ['Facts about the city itself that help explain the measurements.', 'Στοιχεία για την ίδια την πόλη που βοηθούν να εξηγηθούν οι μετρήσεις.'] },
    { id: 'sea', col: COL.model, name: ['The sea', 'Η θάλασσα'], height: ['Sea · at the surface', 'Θάλασσα · στην επιφάνεια'], what: ['How warm the sea is and how high the waves are around the coast.', 'Πόσο ζεστή είναι η θάλασσα και πόσο ψηλά τα κύματα γύρω από την ακτή.'] },
  ];
  const levelOf = (l) => (/marine/.test(l.id) ? 'sea' : l.kind === 'satellite' ? 'space' : l.group === 'model' ? 'model' : l.group);
  // sources on the list to add that have no file in the register yet (research handoff, 13 November 2026). star: the first three to add.
  const ROADMAP = [
    ['space', 'Street-level heat (Landsat)', 'Ζέστη σε επίπεδο δρόμου (Landsat)', 'Ground heat sharp enough to tell one neighbourhood from the next.', 'Ζέστη του εδάφους τόσο λεπτομερής που ξεχωρίζει τη μια γειτονιά από την άλλη.'],
    ['space', 'Tree cover', 'Κάλυψη από δέντρα', 'How much of each area is under trees.', 'Πόσο από κάθε περιοχή βρίσκεται κάτω από δέντρα.'],
    ['space', 'Sealed ground', 'Σφραγισμένο έδαφος', 'How much ground is covered by roads and buildings, where rain cannot sink in.', 'Πόσο έδαφος καλύπτεται από δρόμους και κτίρια, όπου η βροχή δεν απορροφάται.'],
    ['space', 'Land cover', 'Κάλυψη γης', 'What covers the land: buildings, crops, forest, bare ground or water.', 'Τι καλύπτει τη γη: κτίρια, καλλιέργειες, δάσος, γυμνό έδαφος ή νερό.'],
    ['space', 'Surface water', 'Επιφανειακά νερά', 'Where lakes and reservoirs have grown or shrunk over the years.', 'Πού μεγάλωσαν ή μίκρυναν λίμνες και φράγματα με τα χρόνια.'],
    ['space', 'Soil moisture', 'Υγρασία εδάφους', 'How wet the top of the soil is.', 'Πόσο υγρό είναι το πάνω μέρος του εδάφους.'],
    ['space', 'Height of the land', 'Υψόμετρο', 'How high every place is, which explains why Troodos is cooler.', 'Πόσο ψηλά βρίσκεται κάθε τόπος, κάτι που εξηγεί γιατί το Τρόοδος είναι πιο δροσερό.'],
    ['model', 'Solar panel scenarios', 'Σενάρια φωτοβολταϊκών', 'How much electricity a solar panel could make in each city, as a worked example.', 'Πόσο ρεύμα θα μπορούσε να παράγει ένα φωτοβολταϊκό σε κάθε πόλη, ως παράδειγμα υπολογισμού.', true],
    ['model', 'Drought indicator', 'Δείκτης ξηρασίας', 'A European warning level for drought.', 'Ένα ευρωπαϊκό επίπεδο προειδοποίησης για ξηρασία.'],
    ['official', 'Bathing-water quality', 'Ποιότητα νερών κολύμβησης', 'The yearly grade of each beach, from official samples.', 'Ο ετήσιος βαθμός κάθε παραλίας, από επίσημα δείγματα.', true],
    ['official', 'Earthquakes', 'Σεισμοί', 'Recent earthquakes around Cyprus.', 'Πρόσφατοι σεισμοί γύρω από την Κύπρο.'],
    ['official', 'City noise maps', 'Χάρτες θορύβου πόλεων', 'Official maps of traffic noise in the cities.', 'Επίσημοι χάρτες θορύβου κυκλοφορίας στις πόλεις.'],
    ['context', 'Waste we produce', 'Τα απορρίμματά μας', 'How much household waste Cyprus makes each year.', 'Πόσα οικιακά απορρίμματα παράγει η Κύπρος κάθε χρόνο.', true],
    ['context', 'Live public bus times', 'Ζωντανοί χρόνοι δημόσιων λεωφορείων', 'Whether public buses run on time, from the official live feed.', 'Αν τα δημόσια λεωφορεία είναι στην ώρα τους, από την επίσημη ζωντανή ροή.'],
    ['context', 'Population (census)', 'Πληθυσμός (απογραφή)', 'How many people live in each area.', 'Πόσοι άνθρωποι ζουν σε κάθε περιοχή.'],
    ['context', 'Flood scenarios', 'Σενάρια πλημμύρας', 'Official maps of where a flood could reach.', 'Επίσημοι χάρτες για το πού θα μπορούσε να φτάσει μια πλημμύρα.'],
    ['context', 'Protected nature areas', 'Προστατευόμενες περιοχές φύσης', 'The Natura 2000 areas.', 'Οι περιοχές Natura 2000.'],
    ['context', 'Recycling points', 'Σημεία ανακύκλωσης', 'Where the municipal green points are.', 'Πού βρίσκονται τα δημοτικά πράσινα σημεία.'],
    ['context', 'Wildlife sightings', 'Παρατηρήσεις άγριας ζωής', 'Where plants and animals have been recorded.', 'Πού έχουν καταγραφεί φυτά και ζώα.'],
    ['context', 'District borders', 'Όρια επαρχιών', 'Official borders, so numbers can be counted per area.', 'Επίσημα όρια, ώστε οι αριθμοί να μετριούνται ανά περιοχή.'],
    ['sea', 'Depth of the sea floor', 'Βάθος του βυθού', 'How deep the sea is around the island.', 'Πόσο βαθιά είναι η θάλασσα γύρω από το νησί.'],
  ].map(([level, en, el, wen, wel, star]) => ({ level, name: en, nameEl: el, what: [wen, wel], star: !!star }));

  /* ------------------------------------------------------------------ small animated drawings, one per level ---- */
  const ART = {
    space: () => { const s = sv('svg', { viewBox: '0 0 240 150', 'aria-hidden': 'true' });
      for (let i = 0; i < 24; i++) s.append(sv('circle', { cx: (i * 71) % 240, cy: ((i * 37) % 130) + 6, r: 0.8 + (i % 3) * 0.5, fill: '#fff', opacity: 0.3 + (i % 4) * 0.15 }));
      s.append(sv('path', { d: 'M-10 130 Q120 -30 250 120', fill: 'none', stroke: COL.model, 'stroke-opacity': 0.5, 'stroke-dasharray': '4 7' }),
        sv('g', { class: 'lv-sat' }, sv('path', { d: 'M0 12 L-34 120 L34 120 Z', fill: COL.model, opacity: 0.22 }), sv('rect', { x: -9, y: -9, width: 18, height: 18, rx: 3, fill: '#cfc6f7', stroke: COL.model }), sv('rect', { x: -38, y: -6, width: 25, height: 12, fill: '#6f63b8', stroke: COL.model }), sv('rect', { x: 13, y: -6, width: 25, height: 12, fill: '#6f63b8', stroke: COL.model })));
      return s; },
    model: () => { const s = sv('svg', { viewBox: '0 0 240 150', 'aria-hidden': 'true' });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) s.append(sv('rect', { class: 'lv-cell', style: 'animation-delay:' + (-((c * 3 + r * 5) % 7) * 0.5) + 's', x: 14 + c * 54, y: 62 + r * 29, width: 48, height: 24, rx: 5, fill: COL.model, 'fill-opacity': 0.14 + ((c * 3 + r * 5) % 5) * 0.08, stroke: COL.model, 'stroke-opacity': 0.55 }));
      [[20, 18, 80], [110, 36, 100], [40, 50, 60]].forEach(([x, y, l], i) => s.append(sv('g', { class: 'lv-arrow', style: 'animation-delay:' + (-i) + 's' }, sv('path', { d: 'M' + x + ' ' + y + 'h' + l + 'm-9 -6l9 6l-9 6', fill: 'none', stroke: '#CFEFFA', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))));
      return s; },
    official: () => { const s = sv('svg', { viewBox: '0 0 240 150', 'aria-hidden': 'true' });
      s.append(sv('path', { d: 'M0 132 L70 124 L150 134 L240 122 L240 150 L0 150Z', fill: '#14281f', stroke: COL.context, 'stroke-opacity': 0.4 }), sv('path', { d: 'M80 130 V34 M58 48 h44', stroke: COL.official, 'stroke-width': 4, fill: 'none' }), sv('circle', { class: 'lv-beat', cx: 80, cy: 26, r: 12, fill: 'none', stroke: COL.official, 'stroke-width': 2 }), sv('circle', { cx: 80, cy: 26, r: 8, fill: '#0C1626', stroke: COL.official, 'stroke-width': 4 }),
        sv('path', { class: 'lv-wave', d: 'M112 70 q20 -11 40 0 M112 86 q20 -11 40 0', stroke: COL.official, 'stroke-opacity': 0.7, fill: 'none', 'stroke-width': 3 }));
      return s; },
    own: () => { const s = sv('svg', { viewBox: '0 0 240 150', 'aria-hidden': 'true' });
      s.append(sv('path', { d: 'M0 132 L70 124 L150 134 L240 122 L240 150 L0 150Z', fill: '#14281f', stroke: COL.context, 'stroke-opacity': 0.4 }), sv('rect', { x: 14, y: 48, width: 112, height: 80, rx: 5, fill: '#20344f', stroke: COL.own, 'stroke-opacity': 0.8 }));
      [0, 1, 2].forEach((i) => s.append(sv('rect', { x: 28 + i * 32, y: 64, width: 20, height: 20, rx: 3, fill: COL.own, opacity: i === 1 ? 1 : 0.35 })));
      s.append(sv('circle', { class: 'lv-beat', cx: 70, cy: 74, r: 18, fill: 'none', stroke: COL.own, 'stroke-width': 2.5 }));
      const bus = sv('g', { class: 'lv-bus' }, sv('rect', { x: 146, y: 96, width: 78, height: 30, rx: 8, fill: COL.own, stroke: '#1c0f06', 'stroke-width': 2.5 }), sv('circle', { cx: 166, cy: 128, r: 6, fill: '#0C1626' }), sv('circle', { cx: 206, cy: 128, r: 6, fill: '#0C1626' }));
      [0, 1, 2].forEach((i) => bus.append(sv('rect', { x: 154 + i * 22, y: 102, width: 16, height: 10, rx: 2, fill: '#0C1626' })));
      s.append(bus); return s; },
    context: () => { const s = sv('svg', { viewBox: '0 0 240 150', 'aria-hidden': 'true' });
      s.append(sv('path', { d: 'M0 132 H240 V150 H0Z', fill: '#14281f' }));
      [0, 1, 2, 3, 4].forEach((i) => s.append(sv('rect', { class: 'lv-cell', style: 'animation-delay:' + (-i * 0.6) + 's', x: 20 + i * 30, y: 132 - 46 - (i % 3) * 24, width: 22, height: 46 + (i % 3) * 24, fill: COL.context, opacity: 0.4 + i * 0.1 })));
      s.append(sv('circle', { cx: 200, cy: 82, r: 22, fill: COL.context, opacity: 0.7 }), sv('rect', { x: 196, y: 98, width: 8, height: 34, fill: '#3d6b52' }));
      return s; },
    sea: () => { const s = sv('svg', { viewBox: '0 0 240 150', 'aria-hidden': 'true' });
      const wave = (y, a, o) => { let d = 'M-30 ' + y; for (let x = -30; x <= 270; x += 20) d += 'L' + x + ' ' + (y + Math.sin((x + o) / 24) * a).toFixed(1); return d; };
      s.append(sv('path', { class: 'lv-swell', d: wave(46, 6, 0) + ' L270 150 L-30 150Z', fill: 'rgba(47,183,201,.45)' }), sv('path', { class: 'lv-swell b', d: wave(84, 5, 40), fill: 'none', stroke: '#CFEFFA', 'stroke-opacity': 0.45, 'stroke-width': 2 }), sv('path', { class: 'lv-swell', d: wave(116, 5, 90), fill: 'none', stroke: '#CFEFFA', 'stroke-opacity': 0.3, 'stroke-width': 2 }),
        sv('g', { class: 'lv-buoy' }, sv('path', { d: 'M120 44 v-26', stroke: COL.model, 'stroke-width': 4 }), sv('circle', { cx: 120, cy: 56, r: 12, fill: '#0C1626', stroke: COL.model, 'stroke-width': 4 })));
      return s; },
  };

  function all(host, api) {
    let live = null, dead = false, sel = null, raf = 0, visible = true, lastT = 0;
    const canvas = h('canvas', { class: 'fl-cv', 'aria-hidden': 'true' });
    const nodes = h('div', { class: 'fl-nodes' });
    const stage = h('div', { class: 'fl-stage' }, canvas, nodes);
    const info = h('p', { class: 'fl-info', 'aria-live': 'polite' });
    const levels = h('div', { class: 'fl-levels' });
    host.replaceChildren(h('div', { class: 'fl' },
      h('div', { class: 'lv-hd' }, h('h3', null, T('Data flow', 'Ροή δεδομένων')), h('span', { class: 'lv-live' }, h('i'), T('Live', 'Ζωντανά')), h('span', { class: 'lv-sub' }, T('press a dot, a river or a city', 'πάτα μια τελεία, ένα ποτάμι ή μια πόλη'))),
      stage, info,
      h('div', { class: 'fl-key' },
        h('span', null, h('i', { class: 'k1' }), T('a layer that is connected', 'ένα συνδεδεμένο στρώμα')),
        h('span', null, h('i', { class: 'k2' }), T('a river: layers that measure the same thing', 'ένα ποτάμι: στρώματα που μετρούν το ίδιο πράγμα')),
        h('span', null, h('i', { class: 'k3' }), T('sources agree', 'οι πηγές συμφωνούν')),
        h('span', null, h('i', { class: 'k4' }), T('sources differ', 'οι πηγές διαφέρουν'))),
      h('h3', { class: 'fl-h' }, T('Every level, from space down to the sea', 'Κάθε επίπεδο, από το διάστημα μέχρι τη θάλασσα')),
      h('p', { class: 'lv-fine' }, T('Solid chips are connected today and show their live value. Dashed chips are on the list to add. A star marks the first three to add. Press a chip to read about it.', 'Τα γεμάτα κουμπιά είναι συνδεδεμένα σήμερα και δείχνουν τη ζωντανή τους τιμή. Τα διακεκομμένα είναι στη λίστα για προσθήκη. Το αστέρι δείχνει τα τρία πρώτα που θα προστεθούν. Πάτα ένα κουμπί για να διαβάσεις γι’ αυτό.')),
      levels));

    /* ----- the scene: where everything sits (in CSS pixels of the stage) ----- */
    let G = null;   // { w, h, src: [{l, x, y, col, period, rivers}], riv: [{r, x, y}], brain: {x, y}, cities: [{id, x, y}] }
    function layout() {
      const w = stage.clientWidth || 600, narrow = w < 560;
      const hgt = narrow ? Math.round(w * 1.5) : Math.round(clamp(w * 0.78, 460, 640));
      stage.style.height = hgt + 'px';
      const on = live.layers.filter(isLive);
      const rows = LEVELS.map((lv) => ({ lv, list: on.filter((l) => levelOf(l) === lv.id) })).filter((r) => r.list.length);
      const top = 0.07, bottomSrc = 0.5, padL = narrow ? 0.3 : 0.24;
      const src = [], labels = [];
      rows.forEach((row, i) => {
        const y = (top + (rows.length > 1 ? (i / (rows.length - 1)) * (bottomSrc - top) : 0)) * hgt;
        labels.push({ lv: row.lv, y, n: row.list.length });
        row.list.forEach((l, k) => {
          const x = (padL + ((k + 0.5) / row.list.length) * (1 - padL - 0.04)) * w;
          const rivers = (live.rivers || []).filter((r) => r.sources.includes(l.id));
          src.push({ l, x, y, col: COL[l.group] || '#fff', period: clamp((l.everyMs || 3600000) / 600000, 0.5, 5), rivers, next: Math.random() * 2 });
        });
      });
      const rv = (live.rivers || []).slice(0, narrow ? 4 : 6);
      // on a narrow screen the rivers sit two by two, so every name fits
      const riv = rv.map((r, i) => (narrow ? { r, x: (((i % 2) + 0.5) / 2) * w, y: (0.61 + Math.floor(i / 2) * 0.075) * hgt } : { r, x: ((i + 0.5) / rv.length) * w, y: 0.66 * hgt }));
      G = { w, h: hgt, narrow, src, labels, riv, brain: { x: w / 2, y: (narrow ? 0.83 : 0.82) * hgt }, cities: Object.keys(CITY).map((id, i) => ({ id, x: ((i + 0.5) / 4) * w, y: 0.955 * hgt })) };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = hgt + 'px';
    }
    const cityNow = () => api.city();
    const riverState = (r) => ((r.cities || {})[cityNow()] || {}).state || 'none';
    const riverCol = (r) => (riverState(r) === 'differ' ? COL.bad : riverState(r) === 'agree' ? '#7EE0C0' : '#C9D6E6');

    /* ----- what is lit: everything, or the path of what was pressed ----- */
    const litSrc = (s) => !sel || (sel.kind === 'src' && sel.id === s.l.id) || (sel.kind === 'river' && s.rivers.some((r) => r.variable === sel.id)) || sel.kind === 'city';
    const litRiv = (rv) => !sel || (sel.kind === 'river' && sel.id === rv.r.variable) || (sel.kind === 'src' && rv.r.sources.includes(sel.id)) || (sel.kind === 'city' && rv.r.cities[sel.id]);
    function say() {
      if (!sel) { info.textContent = T('Dots of data fall from every connected layer into the master brain. A layer that updates more often sends dots faster.', 'Τελείες δεδομένων πέφτουν από κάθε συνδεδεμένο στρώμα στον κύριο εγκέφαλο. Ένα στρώμα που ενημερώνεται πιο συχνά στέλνει τελείες πιο γρήγορα.'); return; }
      if (sel.kind === 'src') {
        const l = live.layers.find((x) => x.id === sel.id), rivs = (live.rivers || []).filter((r) => r.sources.includes(sel.id));
        info.replaceChildren(h('b', null, nm(l)), ': ' + (l.sensors ? T(l.fresh + ' of ' + l.sensors + ' sensors reporting', l.fresh + ' από ' + l.sensors + ' αισθητήρες στέλνουν') + (l.head ? ', ' : '') : '') + (l.head ? num(l.head.value) + ' ' + l.head.unit + ' (' + lab(l.head.label).toLowerCase() + ')' : '') + (l.lastAt ? ', ' + SC.ago(l.lastAt) : '') + '. ' +
          (rivs.length ? T('It flows into: ', 'Ρέει προς: ') + rivs.map(shortOf).join(', ') + '. ' : T('Nothing else measures the same thing, so it goes straight to the brain. ', 'Τίποτε άλλο δεν μετρά το ίδιο πράγμα, άρα πηγαίνει κατευθείαν στον εγκέφαλο. ')),
          h('button', { type: 'button', class: 'fl-more', onclick: () => api.openLayer(l.id) }, T('About this layer', 'Για αυτό το στρώμα')));
      } else if (sel.kind === 'river') {
        const r = live.rivers.find((x) => x.variable === sel.id), c = r.cities[cityNow()], cn = lab(CITY[cityNow()] || [cityNow(), cityNow()]);
        const names = r.sources.map((id) => nm(live.layers.find((l) => l.id === id) || { name: id })).join(', ');
        info.replaceChildren(h('b', null, lab(r.label)), ': ' + T(r.sources.length + ' layers measure it (' + names + '). ', r.sources.length + ' στρώματα το μετρούν (' + names + '). ') +
          (!c ? T('In ' + cn + ' only one of them has a reading right now.', cn + ': μόνο ένα από αυτά έχει μέτρηση αυτή τη στιγμή.')
            : c.state === 'differ' ? T('In ' + cn + ' they differ: from ' + num(c.low) + ' to ' + num(c.high) + ' ' + r.unit + ', further apart than the ' + num(c.tolerance) + ' ' + r.unit + ' we accept.', cn + ': διαφέρουν, από ' + num(c.low) + ' έως ' + num(c.high) + ' ' + r.unit + ', περισσότερο από τα ' + num(c.tolerance) + ' ' + r.unit + ' που δεχόμαστε.')
              : c.state === 'agree' ? T('In ' + cn + ' they agree: from ' + num(c.low) + ' to ' + num(c.high) + ' ' + r.unit + ', within the ' + num(c.tolerance) + ' ' + r.unit + ' we accept.', cn + ': συμφωνούν, από ' + num(c.low) + ' έως ' + num(c.high) + ' ' + r.unit + ', εντός των ' + num(c.tolerance) + ' ' + r.unit + ' που δεχόμαστε.')
                : T('In ' + cn + ' they read from ' + num(c.low) + ' to ' + num(c.high) + ' ' + r.unit + '. We have no agreed tolerance for this one yet.', cn + ': δείχνουν από ' + num(c.low) + ' έως ' + num(c.high) + ' ' + r.unit + '. Δεν έχουμε ακόμη συμφωνημένη ανοχή γι’ αυτό.')));
      } else {
        const cn = lab(CITY[sel.id]), rs = (live.rivers || []).filter((r) => r.cities[sel.id]);
        const ag = rs.filter((r) => r.cities[sel.id].state === 'agree').map(shortOf), df = rs.filter((r) => r.cities[sel.id].state === 'differ').map(shortOf);
        const n = ((live.cities[sel.id] || {}).rows || []).length;
        info.replaceChildren(h('b', null, cn), ': ' + T(n + ' readings reach the brain for this city. ', n + ' μετρήσεις φτάνουν στον εγκέφαλο για αυτή την πόλη. ') + (ag.length ? T('Sources agree on: ', 'Οι πηγές συμφωνούν για: ') + ag.join(', ') + '. ' : '') + (df.length ? T('Sources differ on: ', 'Οι πηγές διαφέρουν για: ') + df.join(', ') + '. ' : '') + T('The rivers now show this city.', 'Τα ποτάμια δείχνουν τώρα αυτή την πόλη.'));
      }
    }
    function pick(kind, id) {
      sel = sel && sel.kind === kind && sel.id === id ? null : { kind, id };
      if (kind === 'city' && sel && api.setCity) api.setCity(id);
      drawNodes(); say(); if (still()) drawStill();
    }

    /* ----- the buttons over the canvas (so every label is real text and can be pressed) ----- */
    function drawNodes() {
      const kids = [];
      G.labels.forEach((lb) => { const e = h('span', { class: 'fl-lv' }, lab(lb.lv.name), h('small', null, String(lb.n))); e.style.top = lb.y + 'px'; setVar(e, '--c', lb.lv.col); kids.push(e); });
      G.src.forEach((s) => {
        const b = h('button', { type: 'button', class: 'fl-src' + (litSrc(s) ? '' : ' dim') + (sel && sel.kind === 'src' && sel.id === s.l.id ? ' on' : ''), title: nm(s.l), 'aria-label': nm(s.l), 'aria-pressed': sel && sel.kind === 'src' && sel.id === s.l.id ? 'true' : 'false', onclick: () => pick('src', s.l.id) }, h('i'));
        b.style.left = s.x + 'px'; b.style.top = s.y + 'px'; setVar(b, '--c', s.col); setVar(b, '--beat', clamp(s.period * 1.2, 1.2, 5) + 's');
        kids.push(b);
      });
      G.riv.forEach((rv) => {
        const st = riverState(rv.r);
        const b = h('button', { type: 'button', class: 'fl-riv ' + st + (litRiv(rv) ? '' : ' dim') + (sel && sel.kind === 'river' && sel.id === rv.r.variable ? ' on' : ''), 'aria-pressed': sel && sel.kind === 'river' && sel.id === rv.r.variable ? 'true' : 'false', 'aria-label': lab(rv.r.label) + ', ' + (st === 'differ' ? T('sources differ', 'οι πηγές διαφέρουν') : st === 'agree' ? T('sources agree', 'οι πηγές συμφωνούν') : T('one source here', 'μία πηγή εδώ')), onclick: () => pick('river', rv.r.variable) },
          shortOf(rv.r), h('small', null, st === 'differ' ? '≠' : st === 'agree' ? '✓' : '·'));
        b.style.left = rv.x + 'px'; b.style.top = rv.y + 'px';
        kids.push(b);
      });
      const br = h('div', { class: 'fl-brain' }, h('i'), h('b', null, T('Master brain', 'Κύριος εγκέφαλος')));
      br.style.left = G.brain.x + 'px'; br.style.top = G.brain.y + 'px';
      kids.push(br);
      G.cities.forEach((c) => {
        const b = h('button', { type: 'button', class: 'fl-city' + (cityNow() === c.id ? ' cur' : '') + (sel && sel.kind === 'city' && sel.id === c.id ? ' on' : ''), 'aria-pressed': sel && sel.kind === 'city' && sel.id === c.id ? 'true' : 'false', onclick: () => pick('city', c.id) }, lab(CITY[c.id]));
        b.style.left = c.x + 'px'; b.style.top = c.y + 'px';
        kids.push(b);
      });
      nodes.replaceChildren(...kids);
    }

    /* ----- the particles ----- */
    let parts = [], beams = [], sparks = [], pulse = 0;
    const bez = (a, c, b, t) => [(1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y];
    const ctrl = (a, b) => ({ x: a.x + (b.x - a.x) * 0.15, y: a.y + (b.y - a.y) * 0.75 });
    function emit(s) {
      const rv = s.rivers.length ? G.riv.find((x) => x.r.variable === s.rivers[Math.floor(Math.random() * s.rivers.length)].variable) : null;
      parts.push({ s, rv: rv || null, leg: 0, t: 0, sp: 0.5 + Math.random() * 0.25 });
    }
    function step(dt) {
      for (const s of G.src) { s.next -= dt; if (s.next <= 0) { s.next = s.period * (0.7 + Math.random() * 0.6); if (parts.length < (G.narrow ? 160 : 260)) emit(s); } }
      for (const p of parts) {
        p.t += dt * p.sp * (p.leg === 0 && p.rv ? 0.9 : 1.1);
        if (p.t >= 1) {
          if (p.leg === 0 && p.rv) { p.leg = 1; p.t = 0; if (riverState(p.rv.r) === 'differ' && sparks.length < 80) for (let i = 0; i < 3; i++) sparks.push({ x: p.rv.x, y: p.rv.y, vx: (Math.random() - 0.5) * 70, vy: (Math.random() - 0.7) * 60, life: 0.5 }); }
          else { p.done = true; pulse = 1; if (Math.random() < 0.3 && beams.length < 24) beams.push({ c: G.cities[Math.floor(Math.random() * 4)], t: 0 }); }
        }
      }
      parts = parts.filter((p) => !p.done);
      for (const b of beams) b.t += dt * 1.1; beams = beams.filter((b) => b.t < 1);
      for (const k of sparks) { k.life -= dt; k.x += k.vx * dt; k.y += k.vy * dt; k.vy += 90 * dt; } sparks = sparks.filter((k) => k.life > 0);
      pulse = Math.max(0, pulse - dt * 2.2);
    }
    function lines(ctx) {
      ctx.lineWidth = 1;
      for (const s of G.src) {
        const a = litSrc(s) ? 0.16 : 0.04;
        const targets = s.rivers.length ? s.rivers.map((r) => G.riv.find((x) => x.r.variable === r.variable)).filter(Boolean) : [];
        ctx.strokeStyle = 'rgba(200,214,232,' + a + ')';
        if (!targets.length) { const c = ctrl(s, G.brain); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(c.x, c.y, G.brain.x, G.brain.y); ctx.stroke(); }
        for (const rv of targets) { if (sel && sel.kind === 'river' && sel.id !== rv.r.variable) continue; const c = ctrl(s, rv); ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(c.x, c.y, rv.x, rv.y); ctx.stroke(); }
      }
      for (const rv of G.riv) { ctx.strokeStyle = riverCol(rv.r); ctx.globalAlpha = litRiv(rv) ? 0.5 : 0.12; ctx.lineWidth = 2 + Math.min(4, rv.r.sources.length); const c = ctrl(rv, G.brain); ctx.beginPath(); ctx.moveTo(rv.x, rv.y + 12); ctx.quadraticCurveTo(c.x, c.y, G.brain.x, G.brain.y); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      for (const c of G.cities) { ctx.strokeStyle = 'rgba(247,196,107,' + (!sel || sel.kind !== 'city' || sel.id === c.id ? 0.45 : 0.12) + ')'; ctx.beginPath(); ctx.moveTo(G.brain.x, G.brain.y); ctx.lineTo(c.x, c.y - 14); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    function dot(ctx, x, y, r, col, a) { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = a * 0.25; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }
    function paint() {
      const ctx = canvas.getContext('2d'), k = canvas.width / G.w;
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, G.w, G.h);
      lines(ctx);
      for (const p of parts) {
        const lit = litSrc(p.s) && (!p.rv || litRiv(p.rv) || (sel && sel.kind === 'src'));
        const a = p.leg === 0 ? p.s : p.rv, b = p.leg === 0 ? (p.rv || G.brain) : G.brain, c = ctrl(a, b);
        let [x, y] = bez(a, c, b, p.t);
        if (p.leg === 1 && riverState(p.rv.r) === 'differ') { x += Math.sin(p.t * 40 + p.sp * 50) * 5; }   // a river whose sources differ runs rough
        dot(ctx, x, y, p.leg === 1 ? 3 : 2.6, p.leg === 1 ? riverCol(p.rv.r) : p.s.col, lit ? 0.95 : 0.12);
      }
      for (const s of sparks) dot(ctx, s.x, s.y, 1.6, COL.bad, clamp(s.life * 2, 0, 1));
      for (const b of beams) { const x = G.brain.x + (b.c.x - G.brain.x) * b.t, y = G.brain.y + (b.c.y - 14 - G.brain.y) * b.t; dot(ctx, x, y, 3.2, COL.gold, !sel || sel.kind !== 'city' || sel.id === b.c.id ? 0.95 : 0.15); }
      ctx.globalAlpha = 0.18 + pulse * 0.3; ctx.fillStyle = COL.own; ctx.beginPath(); ctx.arc(G.brain.x, G.brain.y, 30 + pulse * 14, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
    }
    function drawStill() {   // reduced motion: the paths, and one still dot half way along each
      const ctx = canvas.getContext('2d'), k = canvas.width / G.w;
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, G.w, G.h); lines(ctx);
      for (const s of G.src) { const rv = s.rivers.length ? G.riv.find((x) => x.r.variable === s.rivers[0].variable) : null; const b = rv || G.brain, [x, y] = bez(s, ctrl(s, b), b, 0.5); dot(ctx, x, y, 2.6, s.col, litSrc(s) ? 0.9 : 0.15); }
    }
    function frame(t) {
      raf = 0;
      if (dead || !G || !visible || document.hidden) { lastT = 0; return; }
      const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016; lastT = t;
      step(dt); paint();
      raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (dead || !G) return; if (still()) { drawStill(); return; } if (!raf) raf = requestAnimationFrame(frame); };
    let lastW = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!live || Math.abs(stage.clientWidth - lastW) < 2) return; lastW = stage.clientWidth; parts = []; beams = []; layout(); drawNodes(); kick(); }) : null;
    if (ro) ro.observe(stage);
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }) : null;
    if (io) io.observe(stage);
    const onVis = () => kick();
    document.addEventListener('visibilitychange', onVis);

    /* ----- the levels under the scene ----- */
    let openChip = null;
    function drawLevels() {
      levels.replaceChildren(...LEVELS.map((lv) => {
        const mine = live.layers.filter((l) => levelOf(l) === lv.id);
        const on = mine.filter(isLive), wait = mine.filter((l) => !isLive(l)), road = ROADMAP.filter((r) => r.level === lv.id);
        const detail = h('p', { class: 'fl-detail', 'aria-live': 'polite', hidden: true });
        const show = (key, kids) => { if (openChip === key) { openChip = null; detail.hidden = true; return; } openChip = key; detail.hidden = false; detail.replaceChildren(...kids); };
        const chips = [
          ...on.map((l) => h('button', { type: 'button', class: 'fl-chip', onclick: () => show(l.id, [h('b', null, nm(l)), ': ' + (l.sensors ? T(l.fresh + ' of ' + l.sensors + ' sensors reporting', l.fresh + ' από ' + l.sensors + ' αισθητήρες στέλνουν') + (l.head ? ', ' : '') : '') + (l.head ? num(l.head.value) + ' ' + l.head.unit + ' (' + lab(l.head.label).toLowerCase() + T(', average of the cities)', ', μέσος όρος των πόλεων)') : (isEl() ? l.noteEl : l.note) || '') + (l.lastAt ? ', ' + SC.ago(l.lastAt) : '') + '. ', h('button', { type: 'button', class: 'fl-more', onclick: () => api.openLayer(l.id) }, T('About this layer', 'Για αυτό το στρώμα'))]) },
            nm(l), l.head ? h('u', null, num(l.head.value) + ' ' + l.head.unit) : l.sensors ? h('u', null, l.fresh + '/' + l.sensors) : null)),
          ...wait.map((l) => h('button', { type: 'button', class: 'fl-chip soon', onclick: () => show(l.id, [h('b', null, nm(l)), ': ' + (l.state === 'planned' ? T('planned, not connected yet. ', 'σχεδιάζεται, δεν έχει συνδεθεί ακόμη. ') : l.state === 'candidate' ? T('a candidate, not connected yet. ', 'υποψήφιο, δεν έχει συνδεθεί ακόμη. ') : T('connected, but not answering right now. ', 'συνδεδεμένο, αλλά δεν απαντά αυτή τη στιγμή. ')), h('button', { type: 'button', class: 'fl-more', onclick: () => api.openLayer(l.id) }, T('About this layer', 'Για αυτό το στρώμα'))]) }, nm(l), l.state === 'down' || l.state === 'off' || l.state === 'checking' ? h('u', { class: 'q' }, T('quiet', 'σιωπή')) : null)),
          ...road.map((r) => h('button', { type: 'button', class: 'fl-chip soon' + (r.star ? ' star' : ''), onclick: () => show(r.name, [h('b', null, (r.star ? '★ ' : '') + nm(r)), ': ' + lab(r.what) + ' ' + (r.star ? T('One of the first three to add.', 'Ένα από τα τρία πρώτα που θα προστεθούν.') : T('On the list to add, not connected yet.', 'Στη λίστα για προσθήκη, δεν έχει συνδεθεί ακόμη.'))]) }, (r.star ? '★ ' : '') + nm(r))),
        ];
        const sec = h('section', { class: 'fl-band fl-' + lv.id }, h('div', { class: 'fl-art' }, ART[lv.id]()), h('div', { class: 'fl-body' }, h('em', null, lab(lv.height)), h('h4', null, h('i'), lab(lv.name), h('small', null, T(on.length + ' connected', on.length + ' συνδεδεμένα'))), h('p', null, lab(lv.what)), h('div', { class: 'fl-chips' }, chips), detail));
        setVar(sec, '--c', lv.col);
        return sec;
      }), h('div', { class: 'lv-brainbar' }, h('i', { 'aria-hidden': 'true' }), h('span', null, h('b', null, T('The master brain', 'Ο κύριος εγκέφαλος')), T(' reads every connected layer, compares the sources for each city and says “not enough data” instead of guessing.', ' διαβάζει κάθε συνδεδεμένο στρώμα, συγκρίνει τις πηγές για κάθε πόλη και λέει «δεν υπάρχουν αρκετά δεδομένα» αντί να μαντεύει.'))));
    }

    return {
      update(l) {
        const firstTime = !live, same = live && live.layers.filter(isLive).map((x) => x.id).join() === l.layers.filter(isLive).map((x) => x.id).join() && (live.rivers || []).length === (l.rivers || []).length;
        live = l;
        if (sel && ((sel.kind === 'src' && !l.layers.some((x) => x.id === sel.id && isLive(x))) || (sel.kind === 'river' && !(l.rivers || []).some((r) => r.variable === sel.id)))) sel = null;
        if (!same) { parts = []; beams = []; }
        lastW = stage.clientWidth; layout(); drawNodes(); say();
        if (firstTime || !openChip) drawLevels();
        kick();
      },
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', onVis); },
    };
  }

  SC.layersLive = SC.layersLive || {};
  SC.layersLive.all = all;
})();
