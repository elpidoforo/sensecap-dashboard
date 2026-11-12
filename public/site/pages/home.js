/*
  Home: "Eight windows, one city".
  The island with four light pillars (the real school sites, ISLAND.schools), a ring of eight numbered windows that link to the
  real pages, the data-type tags, the tour route and what a visitor can do without signing in.
  Real data: sensors online per school from /api/devices (grouped by device.group), vehicle dots from the delayed, rounded
  positions in /api/devices (never raw GPS). Nothing here is invented: with no data the pillars say so.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/home.css');

  const HOUR = 3600000;
  // The four schools, top to bottom of the island. re: how a device's group or name says which school it belongs to.
  const SCH = [
    { id: 'lefkosia', n: T('PASCAL Lefkosia', 'PASCAL Λευκωσία'), re: /lefkos|nicosia|λευκωσ/i, dx: -6 },
    { id: 'larnaka', n: T('PASCAL Larnaka', 'PASCAL Λάρνακα'), re: /larnak|larnac|λάρνακ/i, dx: 4 },
    { id: 'limassol', n: T('PASCAL Limassol', 'PASCAL Λεμεσός'), re: /limass|lemes|λεμεσ/i, dx: -22 },
    { id: 'paphos', n: T('International School of Paphos', 'Διεθνές Σχολείο Πάφου'), re: /paph|pafos|πάφ|παφ/i, dx: 0, wrap: true },
  ];
  const FIXED = /\b(class(room)?|lab|room|office|library|hall|gym|indoor|outdoor|roof|yard|playground|garden|fixed|station)\b|τάξη|αίθουσα|εργαστήρι/i;

  const schoolOf = (d) => { for (const txt of [d.group, d.name]) for (const s of SCH) if (s.re.test(txt || '')) return s.id; return null; };
  const seenMs = (d) => { const m = d.lastSeen ? Date.parse(d.lastSeen) : NaN; return isFinite(m) ? m : 0; };
  const isOn = (d, now) => { const m = seenMs(d); return d.online !== false && (!m || now - m <= HOUR); };
  const isFixed = (d) => FIXED.test(d.name || '');

  // ---------- the eight windows: each holds the tools of its stage (every page of the site sits in exactly one) ----------
  // Pictures are small static SVG strings with numbers worked out from live data (the same "static strings only" rule as the other pages).
  // A picture drawn from data says so in its tile text; the others are schematic and drawn dim, so nobody reads them as a chart.
  const fmtN = (n) => (typeof n === 'number' && isFinite(n) ? n.toLocaleString(SC.L === 'el' ? 'el-GR' : 'en-GB') : null);
  const svgs = (w, h, body) => '<svg viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + body + '</svg>';
  const P = {
    stack: () => svgs(120, 52, '<g fill="none" stroke="var(--c)" stroke-width="1.4" stroke-linejoin="round"><path d="M60 4l40 11-40 11-40-11z" fill="color-mix(in srgb,var(--c) 22%,transparent)"/><path d="M20 24l40 11 40-11" opacity=".7"/><path d="M20 33l40 11 40-11" opacity=".45"/></g><circle cx="60" cy="15" r="2.4" fill="#fff"/>'),
    dots: (n, on) => { const k = Math.max(1, Math.min(n, 8)); let o = ''; for (let i = 0; i < k; i++) o += '<circle cx="' + (12 + i * (96 / Math.max(1, k - 1))).toFixed(1) + '" cy="10" r="5" fill="' + (i < on ? 'var(--c)' : 'none') + '" stroke="var(--c)" stroke-width="1.4" opacity="' + (i < on ? 1 : 0.5) + '"/>'; return svgs(120, 20, o); },
    road: (n) => svgs(120, 40, '<path d="M6 30C30 30 40 10 62 16S100 8 114 12" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2" stroke-dasharray="3 4"/>' + [[30, 26], [64, 16], [96, 11], [46, 21], [80, 13]].slice(0, Math.min(n, 5)).map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="#F2A56B"/>').join('')),
    chips: (a) => '<span class="hm-chips">' + a.map((x) => '<i>' + x + '</i>').join('') + '</span>',
    ticks: () => svgs(120, 30, '<line x1="2" y1="15" x2="118" y2="15" stroke="rgba(255,255,255,.2)"/>' + [.1, .22, .5, .56, .9].map((x) => '<line x1="' + (x * 116 + 2) + '" y1="6" x2="' + (x * 116 + 2) + '" y2="24" stroke="var(--c)" stroke-width="2.4" stroke-linecap="round"/>').join('')),
    spark: () => svgs(120, 44, '<polyline points="2,42 2,34 14,30 28,31 42,22 56,10 70,14 84,24 98,20 112,30 118,34 118,42" fill="color-mix(in srgb,var(--c) 18%,transparent)" stroke="none"/><polyline points="2,34 14,30 28,31 42,22 56,10 70,14 84,24 98,20 112,30 118,34" fill="none" stroke="var(--c)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    range: () => svgs(120, 30, '<rect x="2" y="11" width="116" height="8" rx="4" fill="rgba(255,255,255,.1)"/><rect x="34" y="11" width="50" height="8" rx="4" fill="var(--c)"/><circle cx="62" cy="15" r="6" fill="#fff"/>'),
    bars: (a) => svgs(120, 44, a.map((v, i) => '<rect x="' + (2 + i * 116 / a.length).toFixed(1) + '" y="' + (42 - v * 38).toFixed(1) + '" width="' + (116 / a.length - 2).toFixed(1) + '" height="' + (v * 38).toFixed(1) + '" rx="1.5" fill="var(--c)" opacity="' + (0.45 + v * 0.5).toFixed(2) + '"/>').join('')),
    two: () => svgs(120, 44, '<polyline points="2,34 18,30 34,22 50,18 66,20 82,14 98,10 118,16" fill="none" stroke="var(--c)" stroke-width="2" stroke-linecap="round"/><polyline points="2,32 18,31 34,24 50,19 66,22 82,16 98,12 118,17" fill="none" stroke="#F2A56B" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round"/>'),
    tabs: () => svgs(120, 30, [0, 1, 2, 3].map((i) => '<rect x="' + (3 + i * 29) + '" y="' + (i ? 9 : 5) + '" width="26" height="' + (i ? 16 : 20) + '" rx="5" fill="' + (i ? 'rgba(255,255,255,.08)' : 'color-mix(in srgb,var(--c) 28%,transparent)') + '" stroke="var(--c)" stroke-opacity="' + (i ? 0.3 : 0.8) + '"/>').join('')),
    search: () => svgs(120, 30, '<rect x="2" y="4" width="116" height="22" rx="11" fill="rgba(255,255,255,.07)" stroke="var(--c)" stroke-opacity=".6"/><circle cx="16" cy="15" r="4" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M19 18l4 4" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><path d="M32 15h46" stroke="rgba(255,255,255,.45)" stroke-width="1.5" stroke-linecap="round"/>'),
    columns: (a) => svgs(120, 50, '<ellipse cx="60" cy="44" rx="56" ry="5" fill="rgba(0,0,0,.35)"/>' + a.map((h, i) => '<rect x="' + (14 + i * 28) + '" y="' + (44 - h * 38).toFixed(1) + '" width="6" height="' + (h * 38).toFixed(1) + '" rx="3" fill="#BFEFFC"/><ellipse cx="' + (17 + i * 28) + '" cy="44" rx="9" ry="3" fill="var(--c)" opacity=".6"/>').join('')),
    island: () => ISLAND.svg ? ISLAND.svg({ fill: { nicosia: 'rgba(110,214,255,.66)', larnaca: 'rgba(84,150,240,.62)', limassol: 'rgba(120,190,255,.54)', paphos: 'rgba(120,150,250,.50)', famagusta: 'rgba(62,120,205,.46)', kyrenia: 'rgba(52,96,176,.42)' }, stroke: 'rgba(170,236,252,.38)', sw: 0.5, attrs: 'aria-hidden="true"' }) : '',
    map: () => svgs(120, 48, '<rect x="2" y="3" width="116" height="42" rx="6" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.14)"/><path d="M2 30c20-14 38 6 60-6s38-8 56-2" fill="none" stroke="var(--c)" stroke-width="1.6"/><circle cx="30" cy="22" r="3" fill="#F2A56B"/><circle cx="74" cy="20" r="3" fill="#59d98e"/><circle cx="96" cy="14" r="3" fill="#59d98e"/><circle cx="50" cy="34" r="12" fill="color-mix(in srgb,var(--c) 18%,transparent)"/>'),
    route: () => svgs(120, 40, '<path d="M8 32C30 32 28 10 54 12S86 30 112 8" fill="none" stroke="var(--c)" stroke-width="2" stroke-dasharray="4 3" stroke-linecap="round"/><circle cx="8" cy="32" r="3.4" fill="#59d98e"/><circle cx="112" cy="8" r="3.4" fill="#F2A56B"/><circle cx="64" cy="14" r="4.6" fill="#fff"/>'),
    cities: (a) => svgs(120, 40, a.map((v, i) => '<rect x="' + (6 + i * 28) + '" y="' + (38 - v * 32).toFixed(1) + '" width="20" height="' + (v * 32).toFixed(1) + '" rx="3" fill="var(--c)" opacity="' + (0.45 + v * 0.5).toFixed(2) + '"/>').join('')),
    check: () => svgs(120, 40, [0, 1, 2].map((i) => '<rect x="4" y="' + (3 + i * 12) + '" width="9" height="9" rx="2.5" fill="' + (i < 2 ? 'var(--c)' : 'none') + '" stroke="var(--c)" stroke-width="1.3"/><line x1="20" y1="' + (7.5 + i * 12) + '" x2="' + (64 + i * 18) + '" y2="' + (7.5 + i * 12) + '" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round"/>').join('')),
    progress: () => svgs(120, 40, [[0.8, 'var(--c)'], [0.5, '#59d98e'], [0.25, '#F2A56B']].map((q, i) => '<rect x="4" y="' + (4 + i * 12) + '" width="112" height="6" rx="3" fill="rgba(255,255,255,.1)"/><rect x="4" y="' + (4 + i * 12) + '" width="' + 112 * q[0] + '" height="6" rx="3" fill="' + q[1] + '"/>').join('')),
    steps: () => svgs(120, 24, '<line x1="14" y1="12" x2="106" y2="12" stroke="rgba(255,255,255,.2)" stroke-dasharray="3 3"/>' + [14, 44, 76, 106].map((x, i) => '<circle cx="' + x + '" cy="12" r="7" fill="var(--c)"/><text x="' + x + '" y="15.5" text-anchor="middle" font-size="9" font-weight="800" fill="#04121f">' + (i + 1) + '</text>').join('')),
    seats: () => svgs(120, 44, [0, 1, 2, 3, 4, 5].map((i) => { const a = i / 6 * Math.PI * 2 - Math.PI / 2; return '<circle cx="' + (60 + Math.cos(a) * 30).toFixed(1) + '" cy="' + (22 + Math.sin(a) * 15).toFixed(1) + '" r="5.5" fill="var(--c)" opacity="' + (0.5 + (i % 3) * 0.2).toFixed(1) + '"/>'; }).join('') + '<circle cx="60" cy="22" r="4" fill="#fff"/>'),
    lanes: () => svgs(120, 42, '<g stroke-linecap="round" stroke-width="3.4"><line x1="6" y1="8" x2="48" y2="8" stroke="#59d98e"/><line x1="6" y1="21" x2="74" y2="21" stroke="var(--c)"/><line x1="6" y1="34" x2="108" y2="34" stroke="#F2A56B"/></g>'),
    slider: () => svgs(120, 40, '<line x1="6" y1="10" x2="114" y2="10" stroke="rgba(255,255,255,.18)" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="10" x2="70" y2="10" stroke="var(--c)" stroke-width="3" stroke-linecap="round"/><circle cx="70" cy="10" r="5.5" fill="#fff"/><line x1="6" y1="30" x2="114" y2="30" stroke="rgba(255,255,255,.18)" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="30" x2="38" y2="30" stroke="var(--c)" stroke-width="3" stroke-linecap="round"/><circle cx="38" cy="30" r="5.5" fill="#fff"/>'),
    bubble: () => svgs(120, 44, '<rect x="6" y="4" width="76" height="16" rx="8" fill="rgba(255,255,255,.1)"/><rect x="38" y="24" width="76" height="16" rx="8" fill="color-mix(in srgb,var(--c) 30%,transparent)" stroke="var(--c)" stroke-opacity=".7"/><path d="M48 32h40" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M16 12h40" stroke="rgba(255,255,255,.5)" stroke-width="1.6" stroke-linecap="round"/>'),
    pages: () => svgs(120, 48, '<g fill="none" stroke="var(--c)" stroke-width="1.5"><rect x="14" y="8" width="26" height="34" rx="3" opacity=".5"/><rect x="48" y="4" width="26" height="38" rx="3" fill="color-mix(in srgb,var(--c) 18%,transparent)"/><rect x="82" y="8" width="26" height="34" rx="3" opacity=".5"/></g><path d="M54 16h14M54 22h14M54 28h9" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>'),
    gear: () => svgs(120, 36, '<g fill="none" stroke="var(--c)" stroke-width="1.6" stroke-linecap="round"><path d="M8 10h50M74 10h38M8 26h24M48 26h64"/><circle cx="66" cy="10" r="5" fill="rgba(255,255,255,.12)"/><circle cx="40" cy="26" r="5" fill="rgba(255,255,255,.12)"/></g>'),
  };
  // what a window shows, from what was loaded: S = { devices, live, reg, feeds, archive, schools, plans, reports, gallery, council, alerts }. A number that cannot be worked out is left out, never guessed.
  const regOf = (S) => { const ls = S.reg && Array.isArray(S.reg.layers) ? S.reg.layers : null; if (!ls) return null; const cnt = (f) => ls.filter(f).length; return { total: ls.length, live: cnt((l) => l.state === 'live'), planned: cnt((l) => l.state === 'planned'), bad: cnt((l) => l.state === 'late' || l.state === 'down') }; };
  const feedsOf = (S) => { const fs = S.feeds && Array.isArray(S.feeds.feeds) ? S.feeds.feeds.filter((f) => f.enabled !== false) : null; if (!fs) return null; const c = (st) => fs.filter((f) => f.status === st).length; return { n: fs.length, ok: c('ok'), demo: c('demo'), bad: c('late') + c('error') }; };
  const vehiclesOf = (S) => (S.devices ? S.devices.filter((d) => !isFixed(d) && isOn(d, Date.now()) && typeof d.lat === 'number' && typeof d.lng === 'number').length : null);
  const devOn = (S) => (S.devices ? { on: S.devices.filter((d) => isOn(d, Date.now())).length, total: S.devices.length } : null);
  const archOf = (S) => { const cy = S.archive && S.archive.cydom; return cy ? { days: (cy.days || []).filter((d) => d.readings > 0), readings: cy.readings, stations: cy.stations } : null; };
  const noteT = (en, el) => T(en, el);
  const WINS = [
    { c: '#59d98e', n: T('Sensors in', 'Αισθητήρες'), s: T('What comes in, and from where', 'Τι μπαίνει και από πού'), tags: ['live', 'daily'],
      bigs: [
        (S) => { const d = devOn(S); return d ? [d.on + '/' + d.total, T('sensors online', 'αισθητήρες ενεργοί')] : null; },
        (S) => { const r = regOf(S); return r ? [r.live + '/' + r.total, T('data layers live', 'στρώματα ζωντανά')] : null; },
        (S) => { const f = feedsOf(S); return f ? (f.ok === 0 && f.demo > 0 ? [T('demo', 'επίδειξη'), T('feeds simulated', 'πηγές σε προσομοίωση')] : [f.ok + '/' + f.n, T('feeds working', 'πηγές που λειτουργούν')]) : null; }],
      tiles: [
        { id: 'layers', ic: 'layers', n: T('Data layers', 'Στρώματα δεδομένων'), isNew: 1, v: () => P.stack(), f: (S) => { const r = regOf(S); return r ? T(r.total + ' open sources' + (r.planned ? ', ' + r.planned + ' planned' : '') + '. The master brain reads them.', r.total + ' ανοιχτές πηγές' + (r.planned ? ', ' + r.planned + ' σχεδιάζονται' : '') + '. Ο εγκέφαλος τις διαβάζει.') : T('Every open source as a layer, and the master brain.', 'Κάθε ανοιχτή πηγή ως στρώμα, και ο κεντρικός εγκέφαλος.'); } },
        { id: 'feeds', ic: 'sensor', n: T('Feed list', 'Λίστα πηγών'), v: (S) => { const f = feedsOf(S); return f ? P.dots(f.n, f.ok) : P.dots(5, 0); }, f: (S) => { const f = feedsOf(S); return f ? (f.ok === 0 && f.demo > 0 ? T('Demo mode: nothing is fetched', 'Λειτουργία επίδειξης: δεν γίνεται λήψη') : T(f.ok + ' of ' + f.n + ' feeds working', f.ok + ' από ' + f.n + ' πηγές λειτουργούν')) : T('Last success of every feed', 'Τελευταία επιτυχία κάθε πηγής'); } },
        { id: 'vehicles', ic: 'bus', n: T('Vehicles', 'Οχήματα'), v: (S) => P.road(vehiclesOf(S) || 0), f: (S) => { const n = vehiclesOf(S); return n == null ? T('Each bus and car: status and mini readings', 'Κάθε λεωφορείο και αυτοκίνητο: κατάσταση και μετρήσεις') : T(n + ' on the road · positions late and rounded', n + ' στον δρόμο · θέσεις με καθυστέρηση'); } },
        { id: 'helpers', ic: 'bolt', n: T('Helpers', 'Βοηθοί'), v: () => P.dots(4, 4), f: () => T('The background savers and the assistant', 'Οι βοηθοί αποθήκευσης και ο βοηθός ΤΝ'), sch: 1 }] },
    { c: '#F7C46B', gate: 1, n: T('Check', 'Έλεγχος'), s: T('Is it fresh and believable?', 'Είναι πρόσφατο και αξιόπιστο;'), tags: ['live', 'daily', 'gate'],
      bigs: [
        (S) => (typeof S.alerts === 'number' ? [String(S.alerts), T('open alerts', 'ανοιχτές ειδοποιήσεις')] : null),
        (S) => { const r = regOf(S); return r ? [String(r.bad), T('layers late or down', 'στρώματα με καθυστέρηση ή εκτός')] : null; },
        (S) => { const f = feedsOf(S); return f ? [String(f.bad), T('feeds with a problem', 'πηγές με πρόβλημα')] : null; }],
      tiles: [
        { id: 'alerts', ic: 'bell', n: T('Alerts', 'Ειδοποιήσεις'), v: () => P.chips(['CO2', 'PM2.5', 'Met']), f: (S) => (typeof S.alerts === 'number' ? T(S.alerts + ' open · each names its rule', S.alerts + ' ανοιχτές · η καθεμία δείχνει τον κανόνα') : T('Rules teachers write; each names its source', 'Κανόνες των εκπαιδευτικών· η καθεμία δείχνει την πηγή')), sch: 1 },
        { id: 'warnings', ic: 'mic', n: T('Warnings watch', 'Παρακολούθηση προειδοποιήσεων'), v: () => P.ticks(), f: () => T('Changes to Met Office warnings and radar', 'Αλλαγές στις προειδοποιήσεις και το ραντάρ'), sch: 1 },
        { id: 'weather', ic: 'check', n: T('Met Office record', 'Μετεωρολογικό αρχείο'), v: () => P.spark(), f: () => T('Warnings, forecast, radar, sea and aviation', 'Προειδοποιήσεις, πρόγνωση, ραντάρ, θάλασσα, αεροπορικός καιρός'), sch: 1 },
        { id: 'guides', ic: 'bolt', n: T('Sensor guides', 'Οδηγοί αισθητήρων'), v: () => P.range(), f: () => T('Normal range, one sheet per sensor', 'Φυσιολογικό εύρος, ένα φύλλο ανά αισθητήρα'), sch: 1 }] },
    { c: '#5BA8FF', n: T('Archive', 'Αρχείο'), s: T('What we keep, with a date', 'Τι κρατάμε, με ημερομηνία'), tags: ['arch'],
      bigs: [
        (S) => { const a = archOf(S); return a ? [fmtN(a.days.length), T('days kept', 'ημέρες αρχείου')] : null; },
        (S) => { const a = archOf(S); return a && fmtN(a.readings) != null ? [fmtN(a.readings), T('readings saved', 'μετρήσεις')] : null; },
        (S) => { const a = archOf(S); return a && fmtN(a.stations) != null ? [fmtN(a.stations), T('stations in the files', 'σταθμοί στα αρχεία')] : null; }],
      tiles: [
        { id: 'archive', ic: 'layers', n: T('Data archive', 'Αρχείο δεδομένων'), v: (S) => { const a = archOf(S); const days = a ? a.days.slice(-12) : []; if (!days.length) return P.bars([0.08, 0.08, 0.08, 0.08, 0.08, 0.08]); const m = Math.max(...days.map((d) => d.readings)) || 1; return P.bars(days.map((d) => Math.max(0.08, d.readings / m))); }, f: (S) => { const a = archOf(S); return a && a.days.length ? T('Readings saved per day, last ' + Math.min(12, a.days.length) + ' days', 'Μετρήσεις ανά ημέρα, τελευταίες ' + Math.min(12, a.days.length) + ' ημέρες') : T('Coverage by day and downloads', 'Κάλυψη ανά ημέρα και λήψεις'); } },
        { id: 'explore', ic: 'search', n: T('Explore data', 'Εξερεύνηση'), v: () => P.two(), f: () => T('Our sensor against the official station', 'Ο αισθητήρας μας απέναντι στον επίσημο σταθμό'), sch: 1 },
        { id: 'library', ic: 'db', n: T('Library', 'Βιβλιοθήκη'), v: () => P.tabs(), f: () => T('Handbook, guides, sources, glossary', 'Εγχειρίδιο, οδηγοί, πηγές, γλωσσάρι'), sch: 1 },
        { id: 'research', ic: 'search', n: T('Research', 'Έρευνα'), v: () => P.search(), f: () => T('One box for archive, handbook and Met pages', 'Ένα πλαίσιο για αρχείο, εγχειρίδιο και σελίδες Μετεωρολογικής'), sch: 1 }] },
    { c: '#4CCBEA', n: T('The picture', 'Η εικόνα'), s: T('What is happening now', 'Τι συμβαίνει τώρα'), tags: ['live', 'arch'],
      bigs: [
        () => [String((window.ISLAND && ISLAND.schools || []).length), T('school sites', 'σχολεία')],
        (S) => { const n = vehiclesOf(S); return n == null ? null : [String(n), T('vehicles on the road', 'οχήματα στον δρόμο')]; },
        () => [String((window.ISLAND && ISLAND.stations || []).length), T('Met Office stations on the map', 'σταθμοί Μετεωρολογικής στον χάρτη')]],
      tiles: [
        { id: 'board', ic: 'board', n: T('City board', 'Πίνακας πόλης'), v: (S) => { const mx = Math.max(1, ...SCH.map((s) => (S.live && S.live[s.id] ? S.live[s.id].total : 0))); return P.columns(SCH.map((s) => { const i = S.live && S.live[s.id]; return i && i.total ? Math.max(0.15, i.on / mx) : 0.1; })); }, f: (S) => { const d = devOn(S); return d ? T(d.on + ' of ' + d.total + ' sensors online, a column at each school', d.on + ' από ' + d.total + ' αισθητήρες ενεργοί, μια στήλη σε κάθε σχολείο') : T('A light column at each school', 'Μια στήλη φωτός σε κάθε σχολείο'); } },
        { id: 'city3d', ic: 'globe', n: T('Cyprus 3D', 'Κύπρος 3D'), v: () => P.island(), f: () => T('Turn the island, switch layers', 'Γυρίστε το νησί, αλλάξτε επίπεδα') },
        { id: 'map', ic: 'map', n: T('Live map', 'Ζωντανός χάρτης'), v: () => P.map(), f: () => T('Satellite, radar, wind and stations', 'Δορυφόρος, ραντάρ, άνεμος και σταθμοί'), sch: 1 },
        { id: 'trip', ic: 'route', n: T('Follow one trip', 'Ακολουθήστε μια διαδρομή'), v: () => P.route(), f: () => T('Replay with readings · delayed, rounded', 'Επανάληψη με μετρήσεις · με καθυστέρηση'), sch: 1 }] },
    { c: '#A5B4FC', n: T('Schools and teams', 'Σχολεία και ομάδες'), s: T('Who is doing the work', 'Ποιος κάνει τη δουλειά'), tags: ['team'],
      bigs: [
        (S) => (S.schools ? [String(S.schools.length), T('schools', 'σχολεία')] : null),
        (S) => (S.schools ? [String(S.schools.reduce((n, x) => n + ((x.teams || []).length), 0)), T('teams signed up', 'ομάδες εγγεγραμμένες')] : null),
        (S) => (S.plans ? [String(S.plans.length), T('shared project plans', 'κοινά σχέδια έργων')] : null)],
      tiles: [
        { id: 'schools', ic: 'users', n: T('Schools and teams', 'Σχολεία και ομάδες'), v: () => P.dots(4, 4), f: () => T('Team names and topics only. No student names.', 'Μόνο ονόματα και θέματα ομάδων. Χωρίς ονόματα μαθητών.'), sch: 1 },
        { id: 'districts', ic: 'bars', n: T('Districts and neighbourhoods', 'Επαρχίες και γειτονιές'), v: () => P.cities([0.9, 0.6, 0.75, 0.4]), f: () => T('Lefkosia, Larnaka, Lemesos and Pafos side by side', 'Λευκωσία, Λάρνακα, Λεμεσός και Πάφος δίπλα-δίπλα'), sch: 1 },
        { id: 'desk', ic: 'home', n: T('Today’s desk', 'Το γραφείο της ημέρας'), v: () => P.check(), f: () => T('A daily checklist for a class', 'Καθημερινή λίστα για μια τάξη'), sch: 1 },
        { id: 'projects', ic: 'flag', n: T('Running projects', 'Έργα σε εξέλιξη'), v: () => P.progress(), f: () => T('Team projects and their status', 'Ομαδικά έργα και η κατάστασή τους'), sch: 1 },
        { id: 'start', ic: 'layers', n: T('Start a project', 'Ξεκινήστε ένα έργο'), v: () => P.steps(), f: () => T('Question, sensors, data, team', 'Ερώτηση, αισθητήρες, δεδομένα, ομάδα'), wide: 1, sch: 1 }] },
    { c: '#F0ABFC', n: T('Think', 'Σκέψη'), s: T('Use the data to reason', 'Χρησιμοποιήστε τα δεδομένα για να σκεφτείτε'), tags: ['ai'],
      bigs: [
        () => ['6', T('council seats', 'θέσεις συμβουλίου')],
        (S) => { const r = regOf(S); return r ? [String(r.live), T('layers the brain reads', 'στρώματα που διαβάζει ο εγκέφαλος')] : null; },
        (S) => (S.council && typeof S.council.enabled === 'boolean' ? [S.council.enabled ? T('on', 'ενεργός') : T('resting', 'σε ανάπαυση'), T('AI assistant', 'βοηθός ΤΝ')] : null)],
      tiles: [
        { id: 'council', ic: 'shield', n: T('Council room', 'Αίθουσα συμβουλίου'), v: () => P.seats(), f: () => T('Six AI seats argue, a teacher approves', 'Έξι θέσεις ΤΝ συζητούν, ένας εκπαιδευτικός εγκρίνει'), sch: 1 },
        { id: 'mirror', ic: 'users', n: T('Mirror', 'Καθρέφτης'), v: () => P.lanes(), f: () => T('Walk, bus or car: the PM2.5 each would breathe', 'Περπάτημα, λεωφορείο ή αυτοκίνητο: το PM2.5 που θα αναπνέατε'), sch: 1 },
        { id: 'whatif', ic: 'refresh', n: T('What-if', 'Σενάρια'), v: () => P.slider(), f: () => T('An estimate with a range, not a measurement', 'Εκτίμηση με εύρος, όχι μέτρηση'), sch: 1 },
        { id: 'ask', ic: 'chat', n: T('Ask', 'Ρωτήστε'), v: () => P.bubble(), f: () => T('Answers show their sources', 'Οι απαντήσεις δείχνουν τις πηγές'), sch: 1 }] },
    { c: '#C4B8FF', n: T('Output', 'Παραγωγή'), s: T('What we hand to others', 'Τι παραδίδουμε σε άλλους'), tags: ['team', 'ai'],
      bigs: [
        (S) => (S.reports ? [String(S.reports.length), T('reports released', 'αναφορές δημοσιευμένες')] : null),
        (S) => (S.gallery ? [String(S.gallery.length), T('tools approved', 'εργαλεία εγκεκριμένα')] : null)],
      tiles: [
        { id: 'reports', ic: 'file', n: T('Reports', 'Αναφορές'), v: () => P.pages(), f: () => T('Weekly school report and print summary', 'Εβδομαδιαία αναφορά και περίληψη εκτύπωσης'), sch: 1 },
        { id: 'studio', ic: 'pencil', n: T('Build studio', 'Στούντιο'), v: () => P.bubble(), f: () => T('Describe a tool, the AI drafts it', 'Περιγράψτε ένα εργαλείο, η ΤΝ το σχεδιάζει'), sch: 1 },
        { id: 'submitted', ic: 'inbox', n: T('Submitted work', 'Υποβολές'), v: () => P.chips([T('Tools', 'Εργαλεία'), T('Reports', 'Αναφορές')]), f: () => T('The queue of tools and reports', 'Η ουρά εργαλείων και αναφορών'), wide: 1, sch: 1 }] },
    { c: '#F7C46B', gate: 1, teacher: 1, n: T('Oversight', 'Εποπτεία'), s: T('Teachers approve what goes public', 'Οι εκπαιδευτικοί εγκρίνουν ό,τι δημοσιεύεται'), tags: ['gate'], bigs: [],
      tiles: [
        { id: 'approvals', ic: 'check', n: T('Approvals', 'Εγκρίσεις'), v: () => P.chips([T('Tool', 'Εργαλείο'), T('Report', 'Αναφορά'), T('Account', 'Λογαριασμός')]), f: () => T('Tools, reports and accounts waiting', 'Εργαλεία, αναφορές και λογαριασμοί σε αναμονή'), sch: 1 },
        { id: 'opsmap', ic: 'layers', n: T('Operations map', 'Χάρτης λειτουργιών'), v: () => P.dots(6, 6), f: () => T('Sensors, server, feeds, assistant', 'Αισθητήρες, διακομιστής, πηγές, βοηθός'), sch: 1 },
        { id: 'league', ic: 'trophy', n: T('League', 'Πρωτάθλημα'), v: () => P.cities([0.6, 0.9, 0.5, 0.7]), f: () => T('Off unless teachers switch it on', 'Ανενεργό εκτός αν το ενεργοποιήσουν'), sch: 1 },
        { id: 'settings', ic: 'gear', n: T('Settings', 'Ρυθμίσεις'), v: () => P.gear(), f: () => T('Thresholds, school codes, handbook, feeds', 'Όρια, κωδικοί σχολείων, εγχειρίδιο, πηγές'), sch: 1 }] },
  ];
  const TAG_GATE = ['gate', T('TEACHER ◆', 'ΕΚΠΑΙΔΕΥΤΙΚΟΣ ◆'), T('a person decides here', 'εδώ αποφασίζει άνθρωπος')];
  const isTeacher = () => Boolean(SC.me && (SC.me.role === 'teacher' || SC.me.role === 'admin'));

  const TOUR_LABEL = {
    city3d: T('Cyprus 3D', 'Κύπρος 3D'), board: T('City board', 'Πίνακας πόλης'), weather: T('Met Office record', 'Μετεωρολογικό αρχείο'),
    explore: T('Explore data', 'Εξερεύνηση'), council: T('Council room', 'Αίθουσα συμβουλίου'), map: T('Live map', 'Ζωντανός χάρτης'), ask: T('Ask', 'Ρωτήστε'),
  };
  // the same six steps as the Tour mode switch in the menu (the shell decides: Council room, or Live map until that page exists)
  const tourIds = () => (SC.tourSteps ? SC.tourSteps() : ['city3d', 'board', 'weather', 'explore', 'map', 'ask']);

  const TAGS = [
    ['live', T('LIVE', 'ΖΩΝΤΑΝΟ'), T('read from the sensors and the Met Office as it arrives', 'διαβάζεται από τους αισθητήρες και τη Μετεωρολογική μόλις φτάνει')],
    ['daily', T('DAILY', 'ΗΜΕΡΗΣΙΟ'), T('refreshed once a day', 'ανανεώνεται μία φορά την ημέρα')],
    ['arch', T('ARCHIVE', 'ΑΡΧΕΙΟ'), T('a dated collection, kept every 10 minutes', 'συλλογή με ημερομηνία, κάθε 10 λεπτά')],
    ['ai', T('AI HELPER', 'ΒΟΗΘΟΣ ΤΝ'), T('a helper answers from the data and shows its source', 'ένας βοηθός απαντά από τα δεδομένα και δείχνει την πηγή')],
    ['team', T('TEAM WORK', 'ΟΜΑΔΙΚΗ ΕΡΓΑΣΙΑ'), T('made by student teams of five or more', 'φτιάχνεται από ομάδες μαθητών 5 ή περισσότερων')],
  ];

  const link = (id) => '#/' + id;
  const ready = (id) => SC.ready && SC.ready.has(id);

  function diamond() { return sv('svg', { class: 'dia', viewBox: '0 0 12 12', 'aria-hidden': 'true' }, sv('path', { d: 'M6 .8L11.2 6 6 11.2.8 6z', fill: '#F7C46B' })); }

  SC.register('home', {
    title: ['The whole project', 'Όλο το έργο'],
    render(root) {
      let alive = true;
      let cfg = null;
      const live = {};          // school id -> { total, on }
      let loaded = false, first = true, compact = false;
      const pos = {};           // school id -> { x, y } on the stage, in px
      const timers = [];

      /* ---------- head ---------- */
      const head = SC.head({
        title: T('Eight windows, one city', 'Οκτώ παράθυρα, μία πόλη'),
        lede: T('Every page of Smart Cities sits in one of eight windows, in the order the data travels: it comes in from buses, cars and classrooms, it is checked, it is kept, it becomes a picture, schools and teams work with it, the council room tests it, it becomes a report, and a teacher approves what goes public.',
          'Κάθε σελίδα του Smart Cities βρίσκεται σε ένα από οκτώ παράθυρα, με τη σειρά που ταξιδεύουν τα δεδομένα: έρχονται από λεωφορεία, αυτοκίνητα και τάξεις, ελέγχονται, αποθηκεύονται, γίνονται εικόνα, τα σχολεία και οι ομάδες δουλεύουν μαζί τους, η αίθουσα συμβουλίου τα εξετάζει, γίνονται αναφορά και ένας εκπαιδευτικός εγκρίνει ό,τι δημοσιεύεται.'),
        help: ['Each of the eight windows is a stage the data passes through. Click a window on the ring to jump to its box. Every box holds the tools of that stage: click a tool to open its page. The four light pillars are the four school sites: a taller pillar means more of that school’s sensors are online right now. Copper dots are buses and cars, shown about 2 hours late and rounded to about 1 km to protect the students.',
          'Κάθε ένα από τα οκτώ παράθυρα είναι ένα στάδιο από το οποίο περνούν τα δεδομένα. Πατήστε ένα παράθυρο στον κύκλο για να μεταβείτε στο πλαίσιό του. Κάθε πλαίσιο περιέχει τα εργαλεία του σταδίου: πατήστε ένα εργαλείο για να ανοίξει η σελίδα του. Οι τέσσερις στήλες φωτός είναι τα τέσσερα σχολεία: όσο ψηλότερη η στήλη, τόσοι περισσότεροι αισθητήρες του σχολείου είναι σε λειτουργία τώρα. Οι χάλκινες τελείες είναι λεωφορεία και αυτοκίνητα, με καθυστέρηση περίπου 2 ωρών και στρογγυλοποίηση περίπου 1 χλμ. για την προστασία των μαθητών.'],
      });
      const pageHead = head.querySelector('.page-head');
      pageHead.classList.add('hm-head');
      pageHead.prepend(el('div', { class: 'eyebrow' }, 'Smart Cities · ' + T('the whole project from above', 'όλο το έργο από ψηλά')));
      const tagRow = el('div', { class: 'tag-row' }, TAGS.map(([k, l, d]) => el('span', { class: 't ' + k, title: d }, l)),
        el('span', { class: 'hm-tagnote' }, T('Each badge says what kind of data a window holds.', 'Κάθε ετικέτα δείχνει τι είδους δεδομένα έχει ένα παράθυρο.')));
      pageHead.append(tagRow);

      /* ---------- tour route ---------- */
      const steps = tourIds().filter((id) => TOUR_LABEL[id]);
      const routeKids = [];
      steps.forEach((id, i) => {
        if (i) routeKids.push(el('em', { 'aria-hidden': 'true' }, '›'));
        routeKids.push(el('a', { class: 'hm-step', href: link(id) }, el('i', null, i + 1), TOUR_LABEL[id]));
      });
      const route = el('div', { class: 'hm-route' },
        el('span', { class: 'hm-rl' }, T('Tour mode', 'Ξενάγηση')),
        el('div', { class: 'hm-steps' }, routeKids),
        el('button', { type: 'button', class: 'nm-btn nm-btn--primary hm-go', onclick: () => SC.startTour() },
          sv('svg', { viewBox: '0 0 12 12', fill: 'currentColor', 'aria-hidden': 'true' }, sv('path', { d: 'M2 1l9 5-9 5z' })), T('Start', 'Ξεκινήστε')));

      /* ---------- stage: island + pillars + ring ---------- */
      const FILL = { nicosia: 'rgba(110,214,255,.66)', larnaca: 'rgba(84,150,240,.62)', limassol: 'rgba(120,190,255,.54)', paphos: 'rgba(120,150,250,.50)', famagusta: 'rgba(62,120,205,.46)', kyrenia: 'rgba(52,96,176,.42)' };
      const island = sv('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, role: 'img', 'aria-label': T('Cyprus by district, with the four school sites', 'Η Κύπρος ανά επαρχία, με τους τέσσερις χώρους των σχολείων') });
      Object.keys(ISLAND.districts).forEach((n) => island.append(sv('path', { 'data-d': n, d: ISLAND.districts[n], fill: FILL[n] || 'rgba(76,203,234,.10)', stroke: 'rgba(170,236,252,.38)', 'stroke-width': 0.6 })));
      const dots = sv('g', { 'aria-hidden': 'true' });
      island.append(dots);
      const plane = el('div', { class: 'hm-plane' }, island);
      SCH.forEach((s) => {
        const sc = ISLAND.schools.find((x) => x.id === s.id);
        const p = ISLAND.project(sc.lng, sc.lat);
        plane.append(el('i', { class: 'hm-mk', dataset: { id: s.id }, style: { left: (p[0] / ISLAND.W * 100).toFixed(2) + '%', top: (p[1] / ISLAND.H * 100).toFixed(2) + '%' } }));
      });
      const ringSvg = sv('svg', { class: 'hm-ring', 'aria-hidden': 'true' });
      const pil = sv('svg', { class: 'hm-pil', 'aria-hidden': 'true' });
      const tags = el('div', { class: 'hm-tags' });

      const nodes = WINS.map((w, i) => {
        const kids = [el('i', { class: 'n' }, i + 1), w.n, w.gate ? diamond() : null];
        const cls = 'hm-node' + (w.gate ? ' gate' : '') + (i === 0 ? ' up' : '');
        const style = '--c:' + w.c + ';animation-delay:' + (i * 0.07) + 's';
        return el('a', { class: cls, href: link('home'), style, title: w.gate ? T('A person decides here', 'Εδώ αποφασίζει άνθρωπος') : null, onclick: (e) => { e.preventDefault(); jump(i); } }, kids, el('small', null, w.s));
      });
      const stage = el('div', { class: 'hm-stage' }, ringSvg, plane, pil, tags, nodes);

      const list = el('ul', { class: 'hm-list', 'aria-label': T('The eight windows', 'Τα οκτώ παράθυρα') }, WINS.map((w, i) => el('li', null,
        el('a', { class: 'hm-li' + (w.gate ? ' gate' : ''), href: link('home'), style: '--c:' + w.c, onclick: (e) => { e.preventDefault(); jump(i); } },
          el('span', { class: 'n' }, i + 1), el('span', null, el('b', null, w.n), el('small', null, w.s))))));

      /* ---------- the eight floating windows, one per stage, each holding its tools ---------- */
      const S = { devices: null, live, reg: null, feeds: null, archive: null, schools: null, plans: null, reports: null, gallery: null, council: null, alerts: null };
      const pic = () => el('span', { class: 'hm-mv' });
      const tagChip = (k) => { const d = k === 'gate' ? TAG_GATE : TAGS.find((x) => x[0] === k); return d ? el('span', { class: 't ' + k, title: d[2] }, d[1]) : null; };
      const winEls = [];
      const built = WINS.map((w, i) => {
        const bigEls = w.bigs.map(() => el('div', { class: 'hm-bg', hidden: true }, el('b'), el('span')));
        const big = el('div', { class: 'hm-big', hidden: true }, bigEls);
        const lock = w.teacher ? el('div', { class: 'hm-lock' }, SC.icon('lock', 18), el('span', null, T('Teachers sign in to open this window. Visitors never need an account.', 'Οι εκπαιδευτικοί συνδέονται για να ανοίξουν αυτό το παράθυρο. Οι επισκέπτες δεν χρειάζονται λογαριασμό.'))) : null;
        const tiles = w.tiles.map((t) => {
          const mv = pic(), foot = el('span', { class: 'hm-tf' });
          const kids = [el('span', { class: 'hm-tn' }, SC.icon(t.ic, 15), el('span', null, t.n), t.isNew ? el('i', { class: 'hm-new' }, T('NEW', 'ΝΕΟ')) : null), mv, foot];
          const cls = 'hm-tile' + (t.wide ? ' wide' : '') + (t.sch ? ' sch' : '');
          const node = ready(t.id) ? el('a', { class: cls, href: link(t.id) }, kids) : el('span', { class: cls + ' soon', title: T('Coming soon', 'Έρχεται σύντομα') }, kids);
          return { t, node, mv, foot };
        });
        const box = el('article', { class: 'hm-win' + (w.gate ? ' gate' : '') + (w.teacher ? ' locked' : ''), id: 'hm-win' + (i + 1), style: '--c:' + w.c + ';animation-delay:' + (0.1 + i * 0.06) + 's', 'aria-label': w.n },
          el('header', { class: 'hm-wh' }, el('span', { class: 'hm-wn' }, i + 1), el('div', { class: 'hm-wt' }, el('b', null, w.n), el('small', null, w.s)), el('div', { class: 'hm-wb' }, w.tags.map(tagChip))),
          big, lock, el('div', { class: 'hm-tl' }, tiles.map((x) => x.node)));
        winEls.push(box);
        return { w, big, bigEls, lock, tiles, box };
      });
      function updateWindows() {
        if (!alive) return;
        const teacher = isTeacher();
        built.forEach((b) => {
          const locked = Boolean(b.w.teacher) && !teacher;
          b.box.classList.toggle('locked', locked);
          if (b.lock) b.lock.hidden = !locked;
          b.w.bigs.forEach((fn, k) => {
            let r = null; try { r = fn(S); } catch (e) { r = null; }
            const slot = b.bigEls[k]; slot.hidden = !r;
            if (r) { slot.firstChild.textContent = r[0]; slot.lastChild.textContent = r[1]; }
          });
          b.big.hidden = !b.bigEls.some((x) => !x.hidden);
          b.tiles.forEach((x) => {
            try {
              const html = x.t.v(S);
              if (x.mv.dataset.k !== html) { x.mv.innerHTML = html; x.mv.dataset.k = html; }   // static strings and numbers only
              x.foot.textContent = x.t.f(S);
            } catch (e) { /* keep what is shown */ }
            if (x.node.tagName === 'A') { if (locked) x.node.removeAttribute('href'); else x.node.setAttribute('href', link(x.t.id)); x.node.setAttribute('aria-disabled', locked ? 'true' : 'false'); }
          });
        });
      }
      function jump(i) {
        const t = winEls[i]; if (!t) return;
        t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
        t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true });
      }
      async function loadWindows() {
        const get = (u, ttl) => SC.cached(u, ttl).catch(() => null);
        const [reg, feeds, archive, schools, plans, reports, gallery, council] = await Promise.all([
          get('/layers/api/register', 60000), get('/api/feeds', 30000), get('/api/archive', 300000), get('/app/api/schools/public', 300000),
          get('/studio/api/plans?scope=public', 60000), get('/council/api/reports', 120000), get('/studio/api/projects?scope=gallery', 120000), get('/council/api/status', 300000)]);
        if (!alive) return;
        S.reg = reg; S.feeds = feeds; S.archive = archive;
        S.schools = schools && Array.isArray(schools.schools) ? schools.schools : null;
        S.plans = plans && Array.isArray(plans.plans) ? plans.plans : null;
        S.reports = reports && Array.isArray(reports.reports) ? reports.reports : null;
        S.gallery = gallery && Array.isArray(gallery.projects) ? gallery.projects : null;
        S.council = council;
        S.alerts = null;
        if (typeof SC.alertCount === 'function') { try { const n = await SC.alertCount(); if (typeof n === 'number') S.alerts = n; } catch (e) { /* no count */ } }
        updateWindows();
      }

      /* ---------- legend, status note, cards ---------- */
      const lgIcon = (kids) => sv('svg', { viewBox: '0 0 22 22', 'aria-hidden': 'true' }, ...[].concat(kids));
      const legend = el('div', { class: 'hm-legend nm-glass' }, [
        [lgIcon(sv('path', { d: 'M11 3l7.5 8L11 19 3.5 11z', fill: '#F7C46B', opacity: 0.95 })), T('A person decides here.', 'Εδώ αποφασίζει άνθρωπος.'), T(' Check and Oversight are the two gates.', ' Ο Έλεγχος και η Εποπτεία είναι οι δύο πύλες.')],
        [lgIcon(sv('ellipse', { cx: 11, cy: 11, rx: 9, ry: 6, fill: 'none', stroke: '#8FE3F7', 'stroke-width': 1.6, 'stroke-dasharray': '3 3' })), T('Dashed ring.', 'Διακεκομμένος κύκλος.'), T(' The order the data travels, clockwise from 1.', ' Η σειρά που ταξιδεύουν τα δεδομένα, δεξιόστροφα από το 1.')],
        [lgIcon([sv('rect', { x: 9.5, y: 2, width: 3, height: 16, rx: 1.5, fill: '#BFEFFC' }), sv('ellipse', { cx: 11, cy: 18.5, rx: 7, ry: 2.5, fill: '#4CCBEA', opacity: 0.6 })]), T('Light pillar.', 'Στήλη φωτός.'), T(' A school. Taller means more sensors online.', ' Ένα σχολείο. Ψηλότερη σημαίνει περισσότεροι αισθητήρες σε λειτουργία.')],
        [lgIcon([sv('circle', { cx: 11, cy: 11, r: 8, fill: 'rgba(224,127,63,.25)' }), sv('circle', { cx: 11, cy: 11, r: 4, fill: '#F2A56B' })]), T('Copper dots.', 'Χάλκινες τελείες.'), T(' Buses and cars, shown late and rounded to about 1 km.', ' Λεωφορεία και αυτοκίνητα, με καθυστέρηση και στρογγυλοποίηση περίπου 1 χλμ.')],
      ].map(([ic, b, rest]) => el('div', { class: 'hm-lg' }, ic, el('span', null, el('b', null, b), rest))));

      const status = el('div');
      const sec = el('section', { class: 'hm-sec' },
        el('div', { class: 'hm-wins-head' },
          el('div', null, el('div', { class: 'eyebrow' }, T('Every tool of the project', 'Κάθε εργαλείο του έργου')), el('h2', null, T('Open any box', 'Ανοίξτε όποιο πλαίσιο θέλετε'))),
          el('p', null, T('Click a tool to open its page. The numbers in the boxes are live; the dim pictures only show what a page holds.', 'Πατήστε ένα εργαλείο για να ανοίξει η σελίδα του. Οι αριθμοί στα πλαίσια είναι ζωντανοί· οι αχνές εικόνες δείχνουν μόνο τι περιέχει μια σελίδα.'))),
        el('div', { class: 'hm-wins' }, built.map((b) => b.box)),
        el('div', { class: 'nm-callout nm-callout--info' }, T('There is no account for visitors. Teachers sign in only to approve work and change settings.', 'Οι επισκέπτες δεν χρειάζονται λογαριασμό. Οι εκπαιδευτικοί συνδέονται μόνο για να εγκρίνουν εργασίες και να αλλάξουν ρυθμίσεις.')));

      const hm = el('div', { class: 'hm' }, el('div', { class: 'hm-sky', 'aria-hidden': 'true' }), head, route, stage, list, status, legend, sec);
      root.append(hm);

      /* ---------- layout: ring, chevrons, travelling dots and the light pillars ---------- */
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

      function layout() {
        if (!alive) return;
        compact = hm.clientWidth < 900;
        hm.classList.toggle('compact', compact);
        const W = stage.clientWidth, H = stage.clientHeight;
        if (!W || !H) return;
        if (!compact) {
          const cx = W / 2, cy = H * 0.52, rx = W * 0.405, ry = H * 0.395;
          ringSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
          const d = 'M' + cx + ' ' + (cy - ry) + 'A' + rx + ' ' + ry + ' 0 1 1 ' + (cx - 0.01) + ' ' + (cy - ry);
          const kids = [sv('path', { d, fill: 'none', stroke: 'rgba(143,227,247,.34)', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-dasharray': '4 10', class: 'hm-dash' })];
          for (let i = 0; i < 8; i++) {   // an arrowhead halfway between each pair of windows
            const th = (i + 0.5) / 8 * Math.PI * 2 - Math.PI / 2;
            const x = cx + rx * Math.cos(th), y = cy + ry * Math.sin(th);
            const ang = Math.atan2(ry * Math.cos(th), -rx * Math.sin(th)) * 180 / Math.PI;
            kids.push(sv('path', { d: 'M-5 -5L4 0-5 5z', transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')', fill: '#8FE3F7', opacity: 0.7 }));
          }
          if (!reduce) ['#59d98e', '#F7C46B', '#C4B8FF'].forEach((c, k) => kids.push(sv('circle', { r: 4, fill: c, style: 'filter:drop-shadow(0 0 6px ' + c + ')' },
            sv('animateMotion', { dur: '15s', begin: '-' + (k * 5) + 's', repeatCount: 'indefinite', path: d }))));
          ringSvg.replaceChildren(...kids);
          nodes.forEach((n, i) => {
            const a = i / 8 * Math.PI * 2 - Math.PI / 2;
            n.style.left = (cx + rx * Math.cos(a)).toFixed(1) + 'px';
            n.style.top = (cy + ry * Math.sin(a)).toFixed(1) + 'px';
          });
        }
        // pillars stand on each school's marker, which sits inside the tilted island: project it to the screen, then draw upright light
        const sr = stage.getBoundingClientRect();
        plane.querySelectorAll('.hm-mk').forEach((m) => {
          const r = m.getBoundingClientRect();
          pos[m.dataset.id] = { x: r.left + r.width / 2 - sr.left, y: r.top + r.height / 2 - sr.top };
        });
        drawPillars();
      }

      function drawPillars() {
        const W = stage.clientWidth, H = stage.clientHeight;
        pil.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        const k = compact ? 0.62 : 1;
        const kids = [sv('defs', null,
          sv('linearGradient', { id: 'hm-pc', x1: 0, y1: 1, x2: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': '#4CCBEA' }), sv('stop', { offset: 0.7, 'stop-color': '#BFEFFC' }), sv('stop', { offset: 1, 'stop-color': '#fff' })),
          sv('linearGradient', { id: 'hm-ph', x1: 0, y1: 1, x2: 0, y2: 0 }, sv('stop', { offset: 0, 'stop-color': '#4CCBEA', 'stop-opacity': 0.42 }), sv('stop', { offset: 1, 'stop-color': '#4CCBEA', 'stop-opacity': 0 })),
          sv('radialGradient', { id: 'hm-pb' }, sv('stop', { offset: 0, 'stop-color': '#C8F3FF', 'stop-opacity': 0.85 }), sv('stop', { offset: 0.45, 'stop-color': '#4CCBEA', 'stop-opacity': 0.35 }), sv('stop', { offset: 1, 'stop-color': '#4CCBEA', 'stop-opacity': 0 })),
          sv('filter', { id: 'hm-gl', x: '-200%', y: '-20%', width: '500%', height: '140%' }, sv('feGaussianBlur', { stdDeviation: 2.4, result: 'b' }), sv('feMerge', null, sv('feMergeNode', { in: 'b' }), sv('feMergeNode', { in: 'SourceGraphic' }))))];
        const labels = [];
        SCH.forEach((s, i) => {
          const p = pos[s.id]; if (!p) return;
          const info = live[s.id];
          const empty = loaded && (!info || info.total === 0);
          const on = info ? info.on : null;
          const h = Math.round((!loaded ? 84 : empty ? 38 : 46 + Math.min(on, 6) * 20) * k);
          const dim = loaded && (empty || on === 0);
          const g = sv('g', { transform: 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')', opacity: dim ? 0.55 : 1 },
            sv('ellipse', { rx: 40 * k, ry: 15 * k, fill: 'url(#hm-pb)' }),
            sv('ellipse', { rx: 22 * k, ry: 8 * k, fill: 'none', stroke: '#8FE3F7', 'stroke-width': 1.2, opacity: 0.8 }),
            reduce ? null : sv('ellipse', { rx: 22 * k, ry: 8 * k, fill: 'none', stroke: '#8FE3F7', 'stroke-width': 1.2, class: 'hm-pulse', style: 'animation-delay:' + (i * 0.7) + 's' }),
            sv('g', { class: first ? 'hm-grow' : null, style: first ? 'animation-delay:' + (0.25 + i * 0.12) + 's' : null },
              sv('rect', { x: -10, y: -h, width: 20, height: h, fill: 'url(#hm-ph)' }),
              sv('rect', { x: -2.2, y: -h, width: 4.4, height: h, rx: 2.2, fill: 'url(#hm-pc)', filter: 'url(#hm-gl)' }),
              sv('circle', { cy: -h, r: 11, fill: '#fff', opacity: 0.16 }),
              sv('circle', { cy: -h, r: 4.6, fill: '#fff', filter: 'url(#hm-gl)', class: reduce ? null : 'hm-bl', style: 'animation-delay:' + (i * 0.5) + 's' })));
          kids.push(g);
          let small = null;
          if (loaded) small = info && info.total ? T(on + ' of ' + info.total + ' online', on + ' από ' + info.total + ' σε λειτουργία') : T('no sensors listed', 'δεν έχουν καταχωριστεί αισθητήρες');
          const cls = 'hm-pl' + (s.wrap ? ' wrap' : '') + (loaded ? (empty ? ' none' : on === 0 ? ' warn' : '') : '');
          labels.push({ s, el: el('div', { class: cls, style: { left: (p.x + s.dx * k).toFixed(1) + 'px', top: (p.y - h - 14).toFixed(1) + 'px' } }, el('span', { class: 'tx' }, el('span', null, s.n), small ? el('small', null, small) : null)), y: p.y });
        });
        pil.replaceChildren(...kids);
        tags.replaceChildren(...labels.map((l) => l.el));
        // keep the name tags from covering each other: lowest on screen first, push a tag up when it overlaps one already placed
        const placed = [];
        labels.sort((a, b) => b.y - a.y).forEach((l) => {
          const w = l.el.offsetWidth, hh = l.el.offsetHeight;
          let left = parseFloat(l.el.style.left), top = parseFloat(l.el.style.top);
          left = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, left));
          for (let guard = 0; guard < 6; guard++) {
            const hit = placed.find((b) => left - w / 2 < b.x1 + 6 && left + w / 2 > b.x0 - 6 && top - hh < b.y1 + 4 && top > b.y0 - 4);
            if (!hit) break;
            top = hit.y0 - 6;
          }
          l.el.style.left = left.toFixed(1) + 'px'; l.el.style.top = top.toFixed(1) + 'px';
          placed.push({ x0: left - w / 2, x1: left + w / 2, y0: top - hh, y1: top });
        });
        first = false;
      }

      function drawDots(devices) {
        // copper dots: the delayed, rounded position the server gives for buses and cars (never an exact one)
        dots.replaceChildren();
        (devices || []).filter((d) => !isFixed(d) && typeof d.lat === 'number' && typeof d.lng === 'number' && isFinite(d.lat) && isFinite(d.lng) && !(d.lat === 0 && d.lng === 0)).forEach((d) => {
          const p = ISLAND.project(d.lng, d.lat);
          if (!(p[0] > -20 && p[0] < ISLAND.W + 20 && p[1] > -20 && p[1] < ISLAND.H + 20)) return;
          dots.append(sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 9, fill: 'rgba(224,127,63,.22)' }), sv('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 4.4, fill: '#F2A56B' }));
        });
      }

      /* ---------- live data ---------- */
      function note(kind, text, retry) {
        status.replaceChildren();
        if (!text) return;
        status.append(el('div', { class: 'hm-note ' + (kind === 'err' ? 'err' : 'nm-callout nm-callout--info'), role: kind === 'err' ? 'alert' : null }, el('span', null, text),
          retry ? el('button', { class: 'nm-btn', type: 'button', onclick: () => load(true) }, T('Try again', 'Δοκιμάστε ξανά')) : null));
      }

      async function load(manual) {
        if (manual) note(null, T('Loading live sensor counts…', 'Φόρτωση ζωντανών στοιχείων…'));
        let devices;
        try {
          [cfg, devices] = await Promise.all([SC.cached('/api/config', 300000).catch(() => cfg), SC.cached('/api/devices', 30000)]);
        } catch (e) {
          if (!alive) return;
          loaded = false;
          note('err', T('The live sensor counts could not be loaded, so the pillars show only the school names. ', 'Δεν φορτώθηκαν τα ζωντανά στοιχεία των αισθητήρων, γι’ αυτό οι στήλες δείχνουν μόνο τα ονόματα των σχολείων. ') + (e && e.message ? '(' + e.message + ')' : ''), true);
          drawPillars();
          return;
        }
        if (!alive) return;
        devices = Array.isArray(devices) ? devices : [];
        const now = Date.now();
        SCH.forEach((s) => { live[s.id] = { total: 0, on: 0 }; });
        devices.forEach((d) => { const id = schoolOf(d); if (!id) return; live[id].total++; if (isOn(d, now)) live[id].on++; });
        loaded = true;
        S.devices = devices;
        updateWindows();
        if (cfg && cfg.demo && !tagRow.querySelector('.t.demo')) tagRow.insertBefore(el('span', { class: 't demo', title: T('sample numbers, not real readings', 'δειγματικοί αριθμοί, όχι πραγματικές μετρήσεις') }, T('SAMPLE', 'ΔΕΙΓΜΑ')), tagRow.querySelector('.hm-tagnote'));
        drawDots(devices);
        drawPillars();
        if (!devices.length) note('info', T('No sensors are listed yet. When the sensor feed is connected, the pillars show how many are online at each school.', 'Δεν έχουν καταχωριστεί ακόμα αισθητήρες. Όταν συνδεθεί η τροφοδοσία αισθητήρων, οι στήλες θα δείχνουν πόσοι είναι σε λειτουργία σε κάθε σχολείο.'));
        else {
          // the name tags on the pillars already say "n of m online": a line here only when readings are old
          const on = devices.filter((d) => isOn(d, now)).length;
          const last = Math.max(0, ...devices.map(seenMs));
          if (!last || now - last > HOUR) note('info', T(on + ' of ' + devices.length + ' sensors online', on + ' από ' + devices.length + ' αισθητήρες σε λειτουργία') + (last ? ' · ' + T('last reading ' + SC.ago(last), 'τελευταία μέτρηση ' + SC.ago(last)) : ''));
          else note(null, '');
        }
      }

      /* ---------- go ---------- */
      let raf = 0;
      const relayout = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
      window.addEventListener('resize', relayout);
      let ro = null;
      if (window.ResizeObserver) { ro = new ResizeObserver(relayout); ro.observe(hm); }
      raf = requestAnimationFrame(layout);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
      load(false);
      timers.push(setInterval(() => load(false), 60000));
      loadWindows();
      timers.push(setTimeout(loadWindows, 3000));   // the alert count joins a moment after the first page
      timers.push(setInterval(loadWindows, 60000));
      updateWindows();

      return () => {
        alive = false;
        timers.forEach(clearInterval);
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', relayout);
        if (ro) ro.disconnect();
      };
    },
  });
})();
