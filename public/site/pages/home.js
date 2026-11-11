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

  // The eight windows in the order the data travels. to: the page of that window, or the nearest built page after it.
  // A window with no built page is shown as "coming soon", never as a dead link. gate: a person decides here.
  const WIN = [
    { c: '#59d98e', n: T('Sensors in', 'Αισθητήρες'), s: T('Buses, cars, classrooms and open data', 'Λεωφορεία, αυτοκίνητα, τάξεις και ανοιχτά δεδομένα'), to: ['feeds', 'vehicles'] },
    { c: '#F7C46B', gate: 1, n: T('Check', 'Έλεγχος'), s: T('Is it fresh and believable?', 'Είναι πρόσφατο και αξιόπιστο;'), to: ['warnings', 'weather'] },
    { c: '#5BA8FF', n: T('Archive', 'Αρχείο'), s: T('History kept every 10 minutes', 'Ιστορικό που κρατιέται ανά 10 λεπτά'), to: ['archive', 'explore'] },
    { c: '#4CCBEA', n: T('The picture', 'Η εικόνα'), s: T('Map, 3D and city board', 'Χάρτης, 3D και πίνακας πόλης'), to: ['board'] },
    { c: '#A5B4FC', n: T('Schools and teams', 'Σχολεία και ομάδες'), s: T('Four schools, student teams of five or more', 'Τέσσερα σχολεία, ομάδες μαθητών 5 ή περισσότερων'), to: ['schools'] },
    { c: '#F0ABFC', n: T('Think', 'Σκέψη'), s: T('Council room and what-if', 'Αίθουσα συμβουλίου και σενάρια'), to: ['council', 'whatif'] },
    { c: '#C4B8FF', n: T('Output', 'Παραγωγή'), s: T('Reports and the build studio', 'Αναφορές και στούντιο δημιουργίας'), to: ['reports', 'studio'] },
    { c: '#F7C46B', gate: 1, n: T('Oversight', 'Εποπτεία'), s: T('Teachers approve what goes public', 'Οι εκπαιδευτικοί εγκρίνουν ό,τι δημοσιεύεται'), to: ['approvals'] },
  ];
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

  const CARDS = [
    { ic: 'board', id: 'board', h: T('See the city now', 'Δείτε την πόλη τώρα'), p: T('Open the City board for live readings from the four schools, with the Met Office warnings and forecast beside them.', 'Ανοίξτε τον Πίνακα πόλης για ζωντανές μετρήσεις από τα τέσσερα σχολεία, με τις προειδοποιήσεις και την πρόγνωση της Μετεωρολογικής δίπλα τους.'), a: T('City board', 'Πίνακας πόλης') },
    { ic: 'globe', id: 'city3d', h: T('Explore the island', 'Εξερευνήστε το νησί'), p: T('Turn the 3D island or open the layered map: sensors, Met Office stations, radar and warnings, one layer at a time.', 'Γυρίστε το νησί σε 3D ή ανοίξτε τον χάρτη με επίπεδα: αισθητήρες, σταθμούς της Μετεωρολογικής, ραντάρ και προειδοποιήσεις, ένα επίπεδο τη φορά.'), a: T('Cyprus 3D', 'Κύπρος 3D') },
    { ic: 'sparkle', id: 'ask', h: T('Ask, then check the source', 'Ρωτήστε και ελέγξτε την πηγή'), p: T('Ask in plain words. Helpers answer from the data and show the readings and the official pages they used.', 'Ρωτήστε με απλά λόγια. Οι βοηθοί απαντούν από τα δεδομένα και δείχνουν τις μετρήσεις και τις επίσημες σελίδες που χρησιμοποίησαν.'), a: T('Ask', 'Ρωτήστε') },
    { ic: 'bus', id: 'trip', alt: 'vehicles', h: T('Follow a bus trip', 'Ακολουθήστε μια διαδρομή λεωφορείου'), p: T('Watch one trip on the map. Positions are shown about 2 hours late and rounded to about 1 km, to protect students.', 'Παρακολουθήστε μία διαδρομή στον χάρτη. Οι θέσεις εμφανίζονται με καθυστέρηση περίπου 2 ωρών και στρογγυλοποιημένες στο 1 χλμ., για την προστασία των μαθητών.'), a: T('Follow one trip', 'Ακολουθήστε μία διαδρομή'),
      altP: T('Pick a bus or car, then follow its trip on the map. Positions are shown about 2 hours late and rounded to about 1 km, to protect students.', 'Διαλέξτε ένα λεωφορείο ή αυτοκίνητο και ακολουθήστε τη διαδρομή του στον χάρτη. Οι θέσεις εμφανίζονται με καθυστέρηση περίπου 2 ωρών και στρογγυλοποιημένες στο 1 χλμ., για την προστασία των μαθητών.'), altA: T('Vehicles', 'Οχήματα') },
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
        help: ['Each of the eight windows is a stage the data passes through. Click a window to open its page. The four light pillars are the four school sites: a taller pillar means more of that school’s sensors are online right now. Copper dots are buses and cars, shown about 2 hours late and rounded to about 1 km to protect the students. A window marked "coming soon" has no page yet.',
          'Κάθε ένα από τα οκτώ παράθυρα είναι ένα στάδιο από το οποίο περνούν τα δεδομένα. Πατήστε ένα παράθυρο για να ανοίξει η σελίδα του. Οι τέσσερις στήλες φωτός είναι τα τέσσερα σχολεία: όσο ψηλότερη η στήλη, τόσοι περισσότεροι αισθητήρες του σχολείου είναι σε λειτουργία τώρα. Οι χάλκινες τελείες είναι λεωφορεία και αυτοκίνητα, με καθυστέρηση περίπου 2 ωρών και στρογγυλοποίηση περίπου 1 χλμ. για την προστασία των μαθητών. Ένα παράθυρο με την ένδειξη «σύντομα» δεν έχει ακόμα σελίδα.'],
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

      const target = (w) => w.to.find(ready) || null;
      const nodes = WIN.map((w, i) => {
        const id = target(w);
        const kids = [el('i', { class: 'n' }, i + 1), w.n, w.gate ? diamond() : null];
        const small = el('small', null, w.s);
        const cls = 'hm-node' + (w.gate ? ' gate' : '') + (i === 0 ? ' up' : '') + (id ? '' : ' soon');
        const style = '--c:' + w.c + ';animation-delay:' + (i * 0.07) + 's';
        if (id) return el('a', { class: cls, href: link(id), style, title: w.gate ? T('A person decides here', 'Εδώ αποφασίζει άνθρωπος') : null }, kids, small);
        return el('span', { class: cls, style, title: T('Coming soon', 'Έρχεται σύντομα') }, kids, el('span', { class: 'soon-tag' }, T('soon', 'σύντομα')), small);
      });
      const stage = el('div', { class: 'hm-stage' }, ringSvg, plane, pil, tags, nodes);

      const list = el('ul', { class: 'hm-list', 'aria-label': T('The eight windows', 'Τα οκτώ παράθυρα') }, WIN.map((w, i) => {
        const id = target(w);
        const inner = [el('span', { class: 'n' }, i + 1), el('span', null, el('b', null, w.n), el('small', null, id ? w.s : T('Coming soon', 'Έρχεται σύντομα')))];
        const style = '--c:' + w.c;
        return el('li', null, id ? el('a', { class: 'hm-li' + (w.gate ? ' gate' : ''), href: link(id), style }, inner) : el('div', { class: 'hm-li soon' + (w.gate ? ' gate' : ''), style }, inner));
      }));

      /* ---------- legend, status note, cards ---------- */
      const lgIcon = (kids) => sv('svg', { viewBox: '0 0 22 22', 'aria-hidden': 'true' }, ...[].concat(kids));
      const legend = el('div', { class: 'hm-legend nm-glass' }, [
        [lgIcon(sv('path', { d: 'M11 3l7.5 8L11 19 3.5 11z', fill: '#F7C46B', opacity: 0.95 })), T('A person decides here.', 'Εδώ αποφασίζει άνθρωπος.'), T(' Check and Oversight are the two gates.', ' Ο Έλεγχος και η Εποπτεία είναι οι δύο πύλες.')],
        [lgIcon(sv('ellipse', { cx: 11, cy: 11, rx: 9, ry: 6, fill: 'none', stroke: '#8FE3F7', 'stroke-width': 1.6, 'stroke-dasharray': '3 3' })), T('Dashed ring.', 'Διακεκομμένος κύκλος.'), T(' The order the data travels, clockwise from 1.', ' Η σειρά που ταξιδεύουν τα δεδομένα, δεξιόστροφα από το 1.')],
        [lgIcon([sv('rect', { x: 9.5, y: 2, width: 3, height: 16, rx: 1.5, fill: '#BFEFFC' }), sv('ellipse', { cx: 11, cy: 18.5, rx: 7, ry: 2.5, fill: '#4CCBEA', opacity: 0.6 })]), T('Light pillar.', 'Στήλη φωτός.'), T(' A school. Taller means more sensors online.', ' Ένα σχολείο. Ψηλότερη σημαίνει περισσότεροι αισθητήρες σε λειτουργία.')],
        [lgIcon([sv('circle', { cx: 11, cy: 11, r: 8, fill: 'rgba(224,127,63,.25)' }), sv('circle', { cx: 11, cy: 11, r: 4, fill: '#F2A56B' })]), T('Copper dots.', 'Χάλκινες τελείες.'), T(' Buses and cars, shown late and rounded to about 1 km.', ' Λεωφορεία και αυτοκίνητα, με καθυστέρηση και στρογγυλοποίηση περίπου 1 χλμ.')],
      ].map(([ic, b, rest]) => el('div', { class: 'hm-lg' }, ic, el('span', null, el('b', null, b), rest))));

      const status = el('div');
      const arrow = () => SC.icon('arrow', 16);
      const cards = el('div', { class: 'hm-cards' }, CARDS.map((c) => (ready(c.id) || !c.alt ? c : Object.assign({}, c, { id: c.alt, p: c.altP, a: c.altA }))).filter((c) => ready(c.id)).map((c) =>
        el('a', { class: 'nm-card nm-lift hm-card', href: link(c.id) }, el('span', { class: 'nm-icon-tile' }, SC.icon(c.ic)), el('h3', null, c.h), el('p', null, c.p), el('span', { class: 'go' }, c.a, ' ', arrow()))));
      const sec = el('section', { class: 'hm-sec' },
        el('div', null, el('div', { class: 'eyebrow' }, T('No sign-in needed', 'Χωρίς σύνδεση')), el('h2', null, T('What you can do right now', 'Τι μπορείτε να κάνετε τώρα'))),
        cards,
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
