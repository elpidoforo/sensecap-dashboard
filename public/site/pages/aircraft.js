/*
  Aeroplanes over Cyprus (#/aircraft): where aeroplanes around the island are right now, drawn on the site's own outline (island.js).

  What the page gets from GET /api/aircraft (server.js, aircraft()): points with a place rounded to 2 decimals, a height rounded to
  100 ft, a speed and a heading, and a 'phase' that is only a guess from the height. No callsign, no aircraft id: the id ("a1") is an
  index inside one answer. So this is the sky as a whole, not a tracker of one flight. Nothing is saved, here or on the server.
  The positions come from adsb.fi (volunteer receivers), so the picture has gaps; the page says so and credits adsb.fi with a link.
  Phase is shown by shape as well as colour, and again as words in the table.
*/
(function () {
  'use strict';
  const { el: h, svgEl: sv, t: T } = SC;
  const POLL_MS = 20000, OLD_MS = 90000;
  const PHASES = ['high', 'low', 'ground', 'unknown'];
  const PHASE = {
    high: () => T('High: likely passing over', 'Ψηλά: μάλλον περνά από πάνω'),
    low: () => T('Low: likely arriving or departing', 'Χαμηλά: μάλλον φτάνει ή φεύγει'),
    ground: () => T('On the ground', 'Στο έδαφος'),
    unknown: () => T('Height not reported', 'Χωρίς αναφορά ύψους'),
  };
  const SHAPE = {
    high: () => T('filled arrow', 'γεμάτο βέλος'), low: () => T('hollow arrow', 'κενό βέλος'),
    ground: () => T('square', 'τετράγωνο'), unknown: () => T('ring', 'δαχτυλίδι'),
  };
  const COMPASS = [['north', 'βόρεια'], ['north-east', 'βορειοανατολικά'], ['east', 'ανατολικά'], ['south-east', 'νοτιοανατολικά'], ['south', 'νότια'], ['south-west', 'νοτιοδυτικά'], ['west', 'δυτικά'], ['north-west', 'βορειοδυτικά']];
  const AIRPORTS = { 'larnaka-ap': ['Larnaka airport', 'Αεροδρόμιο Λάρνακας'], 'paphos-ap': ['Pafos airport', 'Αεροδρόμιο Πάφου'] };   // their places are in island.js (ISLAND.stations)
  const nf = (v) => Number(v).toLocaleString(SC.lang === 'el' ? 'el-GR' : 'en-GB');
  const heading = (p) => { if (p.track == null) return null; const c = COMPASS[Math.round(p.track / 45) % 8]; return T(c[0], c[1]); };
  const height = (p) => (p.onGround ? T('on the ground', 'στο έδαφος') : p.altFt == null ? T('not reported', 'δεν αναφέρεται')
    : T(nf(p.altFt) + ' ft (about ' + nf(Math.round(p.altFt * 0.3048 / 100) * 100) + ' m)', nf(p.altFt) + ' ft (περίπου ' + nf(Math.round(p.altFt * 0.3048 / 100) * 100) + ' m)'));
  const speed = (p) => (p.gs == null ? T('not reported', 'δεν αναφέρεται')
    : T(nf(p.gs) + ' knots (about ' + nf(Math.round(p.gs * 1.852 / 10) * 10) + ' km/h)', nf(p.gs) + ' κόμβοι (περίπου ' + nf(Math.round(p.gs * 1.852 / 10) * 10) + ' km/h)'));
  const one = (p) => [PHASE[p.phase](), height(p), speed(p), heading(p) ? T('heading ' + heading(p), 'κατεύθυνση ' + heading(p)) : null].filter(Boolean).join(' · ');

  // One marker, centred on 0,0 and pointing north; the caller moves and turns it.
  function mark(phase, hasTrack) {
    if (phase === 'ground') return sv('rect', { x: -17, y: -17, width: 34, height: 34, rx: 4, class: 'ac-m ac-ground' });
    if (phase === 'unknown') return sv('circle', { r: 19, class: 'ac-m ac-unknown' });
    if (!hasTrack) return sv('circle', { r: 17, class: 'ac-m ac-' + phase });   // no direction reported: a dot, not an arrow that would point somewhere
    return sv('path', { d: 'M0-40L26 30L0 16L-26 30Z', class: 'ac-m ac-' + phase });
  }
  const legendMark = (phase) => sv('svg', { viewBox: '-46 -46 92 92', class: 'ac-lg', 'aria-hidden': 'true' }, mark(phase, true));

  SC.register('aircraft', {
    title: ['Aeroplanes over Cyprus', 'Αεροπλάνα πάνω από την Κύπρο'],
    render(root) {
      SC.css('/site/pages/aircraft.css');
      const island = window.ISLAND;
      let data = null, failed = null, timer = 0, tick = 0, gone = false, busy = false;

      const headHost = h('div');
      const status = h('p', { class: 'ac-status', role: 'status', 'aria-live': 'polite' });
      const age = h('span', { class: 'ac-age' });
      const mapHost = h('div', { class: 'ac-map' });
      const side = h('div', { class: 'ac-side' });
      const tableHost = h('div');
      const again = h('button', { class: 'nm-btn', type: 'button', onclick: () => load() }, T('Look again now', 'Κοίτα ξανά τώρα'));
      root.append(headHost,
        h('section', { class: 'nm-card ac-card' }, h('div', { class: 'ac-grid' }, mapHost, side)),
        h('section', { class: 'nm-card ac-card' },
          h('h2', { class: 'card-h' }, T('The same picture as a list', 'Η ίδια εικόνα σε λίστα')), tableHost),
        h('section', { class: 'nm-card ac-card ac-about' },
          h('h2', { class: 'card-h' }, T('Read this picture with care', 'Διάβασε αυτή την εικόνα προσεκτικά')),
          h('p', null, T('Aeroplanes send their position by radio. Volunteers with small receivers pick it up and share it through adsb.fi. So coverage has gaps, especially far out at sea and close to the ground. A missing aeroplane does not mean an empty sky.',
            'Τα αεροπλάνα στέλνουν τη θέση τους με ραδιοκύματα. Εθελοντές με μικρούς δέκτες τη λαμβάνουν και τη μοιράζονται μέσω του adsb.fi. Γι’ αυτό η κάλυψη έχει κενά, ειδικά μακριά στη θάλασσα και κοντά στο έδαφος. Αν λείπει ένα αεροπλάνο, δεν σημαίνει ότι ο ουρανός είναι άδειος.')),
          h('p', null, T('"Likely arriving or departing" and "likely passing over" are guesses from the height alone (below or above 10,000 ft). The page does not know where any aeroplane is going.',
            'Το "μάλλον φτάνει ή φεύγει" και το "μάλλον περνά από πάνω" είναι εικασίες μόνο από το ύψος (κάτω ή πάνω από 10.000 ft). Η σελίδα δεν ξέρει πού πηγαίνει κανένα αεροπλάνο.')),
          h('p', null, T('We show the sky as a whole: places are rounded, there are no flight names, and nothing is saved. The numbers in the list are only a count for this moment and change every time.',
            'Δείχνουμε τον ουρανό συνολικά: οι θέσεις είναι στρογγυλεμένες, δεν υπάρχουν ονόματα πτήσεων και τίποτα δεν αποθηκεύεται. Οι αριθμοί στη λίστα είναι απλή αρίθμηση για αυτή τη στιγμή και αλλάζουν κάθε φορά.')),
          h('p', { class: 'ac-credit' }, T('Aircraft positions: ', 'Θέσεις αεροσκαφών: '),
            h('a', { href: 'https://adsb.fi/', target: '_blank', rel: 'noopener noreferrer' }, 'adsb.fi'),
            T(' (open data from volunteer receivers, for personal and non-commercial use).', ' (ανοιχτά δεδομένα από δέκτες εθελοντών, για προσωπική και μη εμπορική χρήση).'))));

      function head() {
        headHost.replaceChildren(SC.head({
          title: T('Aeroplanes over Cyprus', 'Αεροπλάνα πάνω από την Κύπρο'),
          lede: T('Where aeroplanes around the island are right now, as far as volunteer radio receivers can hear them. The picture renews every 20 seconds.',
            'Πού βρίσκονται τώρα τα αεροπλάνα γύρω από το νησί, όσο μπορούν να τα ακούσουν οι ραδιοδέκτες εθελοντών. Η εικόνα ανανεώνεται κάθε 20 δευτερόλεπτα.'),
          tags: data && data.mock ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
          help: ['Each mark is one aeroplane heard by a volunteer receiver. An arrow points the way the aeroplane is moving. The shape and colour show a guess from its height: a filled arrow is high and likely passing over, a hollow arrow is low and likely arriving or departing, a square is on the ground. The dashed circle is how far we ask. There are no flight names, places are rounded and nothing is saved.',
            'Κάθε σημάδι είναι ένα αεροπλάνο που άκουσε ένας δέκτης εθελοντή. Το βέλος δείχνει προς τα πού κινείται. Το σχήμα και το χρώμα δείχνουν μια εικασία από το ύψος του: γεμάτο βέλος σημαίνει ψηλά και μάλλον περνά από πάνω, κενό βέλος σημαίνει χαμηλά και μάλλον φτάνει ή φεύγει, τετράγωνο σημαίνει στο έδαφος. Ο διακεκομμένος κύκλος δείχνει μέχρι πού ρωτάμε. Δεν υπάρχουν ονόματα πτήσεων, οι θέσεις είναι στρογγυλεμένες και τίποτα δεν αποθηκεύεται.'],
        }));
      }

      function ageText() {
        if (!data || !data.updated) { age.textContent = ''; return; }
        const s = Math.max(0, Math.round((Date.now() - Date.parse(data.updated)) / 1000));
        age.textContent = s < 5 ? T('updated just now', 'ενημερώθηκε μόλις τώρα')
          : s < 120 ? T('updated ' + s + ' seconds ago', 'ενημερώθηκε πριν ' + s + ' δευτερόλεπτα')
            : T('updated ' + SC.ago(Date.parse(data.updated)), 'ενημερώθηκε ' + SC.ago(Date.parse(data.updated)));
        age.classList.toggle('old', s * 1000 > OLD_MS);
      }

      function drawMap(points) {
        if (!island || !island.districts) {
          mapHost.replaceChildren(h('p', { class: 'empty' }, T('The map outline could not be loaded. The list below still works.', 'Το περίγραμμα του χάρτη δεν φορτώθηκε. Η λίστα πιο κάτω λειτουργεί κανονικά.')));
          return 0;
        }
        const c = (data && data.centre) || { lat: 35.0, lng: 33.2, distNm: 120 };
        const [cx, cy] = island.project(c.lng, c.lat);
        const R = (c.distNm / 60) * island.sx, pad = 70;   // one minute of latitude is one nautical mile
        const x0 = cx - R - pad, y0 = cy - R - pad, size = 2 * (R + pad);
        const km = Math.round(c.distNm * 1.852 / 10) * 10;
        const label = T('Map of Cyprus and the sea around it with ' + points.length + ' aeroplanes', 'Χάρτης της Κύπρου και της θάλασσας γύρω της με ' + points.length + ' αεροπλάνα');
        const svg = sv('svg', { class: 'ac-svg', viewBox: [x0, y0, size, size].map((v) => Math.round(v)).join(' '), role: 'img', 'aria-label': label });
        svg.append(sv('circle', { cx, cy, r: R, class: 'ac-ring' }),
          sv('text', { x: cx, y: cy - R + 58, class: 'ac-ringt', 'text-anchor': 'middle' }, T('We ask up to ' + c.distNm + ' nautical miles (about ' + km + ' km) from here', 'Ρωτάμε μέχρι ' + c.distNm + ' ναυτικά μίλια (περίπου ' + km + ' km) από εδώ')));
        for (const d of Object.values(island.districts)) svg.append(sv('path', { d, class: 'ac-land' }));
        for (const s of island.stations || []) {
          const name = AIRPORTS[s.id];
          if (!name) continue;
          const [x, y] = island.project(s.lng, s.lat);
          svg.append(sv('path', { d: `M${x - 14} ${y}h28M${x} ${y - 14}v28`, class: 'ac-ap' }), sv('text', { x: x - 24, y: y + 50, class: 'ac-apt', 'text-anchor': 'end' }, T(name[0], name[1])));
        }
        let outside = 0;
        for (const p of points) {
          const [x, y] = island.project(p.lng, p.lat);
          if (x < x0 || x > x0 + size || y < y0 || y > y0 + size) { outside++; continue; }
          const hasTrack = p.track != null && (p.phase === 'high' || p.phase === 'low');
          const g = sv('g', { class: 'ac-pt', 'data-phase': p.phase, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` + (hasTrack ? ` rotate(${p.track})` : '') },
            sv('title', null, p.id.replace('a', '') + ' · ' + one(p)), mark(p.phase, hasTrack));
          svg.append(g);
        }
        mapHost.replaceChildren(svg);
        return outside;
      }

      function draw() {
        head();
        const points = data && Array.isArray(data.points) ? data.points.filter((p) => p && isFinite(p.lat) && isFinite(p.lng) && PHASE[p.phase]) : [];
        const outside = drawMap(points);
        const n = Object.fromEntries(PHASES.map((k) => [k, points.filter((p) => p.phase === k).length]));
        const beyond = outside + ((data && Number(data.more)) || 0);

        side.replaceChildren();
        if (failed) {
          side.append(h('div', { class: 'err', role: 'alert' }, failed.status === 503
            ? T('A teacher has switched this source off, so there is no picture to show.', 'Ένας εκπαιδευτικός έχει απενεργοποιήσει αυτή την πηγή, οπότε δεν υπάρχει εικόνα για να δείξουμε.')
            : T('We could not get the positions just now. This is a problem with the connection to adsb.fi, not a sign that the sky is empty. The page tries again by itself.', 'Δεν μπορέσαμε να πάρουμε τις θέσεις αυτή τη στιγμή. Είναι πρόβλημα στη σύνδεση με το adsb.fi, όχι ένδειξη ότι ο ουρανός είναι άδειος. Η σελίδα ξαναδοκιμάζει μόνη της.')));
          if (data) side.append(h('p', { class: 'ac-note' }, T('The map still shows the last picture we got.', 'Ο χάρτης δείχνει ακόμη την τελευταία εικόνα που πήραμε.')));
        }
        if (data && data.mock) side.append(h('div', { class: 'nm-callout nm-callout--warn' }, T('Demo data: these points are made-up examples for testing, not real aeroplanes.', 'Δεδομένα επίδειξης: αυτά τα σημεία είναι φτιαχτά παραδείγματα για δοκιμή, όχι πραγματικά αεροπλάνα.')));
        if (data) {
          status.textContent = points.length
            ? T(points.length === 1 ? '1 aeroplane in range right now' : points.length + ' aeroplanes in range right now', points.length === 1 ? '1 αεροπλάνο εντός εμβέλειας τώρα' : points.length + ' αεροπλάνα εντός εμβέλειας τώρα')
            : T('No aeroplanes in range right now', 'Κανένα αεροπλάνο εντός εμβέλειας αυτή τη στιγμή');
          side.append(h('div', { class: 'ac-now' }, status, age));
          if (!points.length) side.append(h('p', { class: 'empty' }, T('No aeroplanes in range right now. That can also mean no receiver heard them: a missing aeroplane does not mean an empty sky.', 'Κανένα αεροπλάνο εντός εμβέλειας αυτή τη στιγμή. Μπορεί και να μην τα άκουσε κανένας δέκτης: αν λείπει ένα αεροπλάνο, δεν σημαίνει ότι ο ουρανός είναι άδειος.')));
        } else if (!failed) side.append(h('div', { class: 'loading' }, T('Listening for aeroplanes', 'Ακούμε για αεροπλάνα')));

        side.append(h('h2', { class: 'card-h ac-lh' }, T('What the marks mean', 'Τι σημαίνουν τα σημάδια')),
          h('ul', { class: 'ac-legend' }, PHASES.map((k) => h('li', { 'data-phase': k }, legendMark(k),
            h('span', { class: 'ac-ln' }, PHASE[k](), h('small', null, SHAPE[k]())), h('b', { class: 'ac-count' }, data ? String(n[k]) : '–')))),
          h('p', { class: 'ac-note' }, T('An arrow points the way the aeroplane is moving. A round dot means the direction was not reported. The words after "likely" are a guess from the height, not a fact.', 'Το βέλος δείχνει προς τα πού κινείται το αεροπλάνο. Στρογγυλή κουκκίδα σημαίνει ότι η κατεύθυνση δεν αναφέρθηκε. Οι λέξεις μετά το "μάλλον" είναι εικασία από το ύψος, όχι γεγονός.')));
        if (beyond > 0) side.append(h('p', { class: 'ac-note ac-more' }, T(beyond + ' more beyond the map', beyond + ' ακόμη έξω από τον χάρτη')));
        side.append(h('div', { class: 'btn-row' }, again));

        if (!data) tableHost.replaceChildren(h('p', { class: 'ac-note' }, failed ? T('No list yet.', 'Δεν υπάρχει ακόμη λίστα.') : T('Loading', 'Φόρτωση')));
        else if (!points.length) tableHost.replaceChildren(h('p', { class: 'empty' }, T('No aeroplanes in range right now', 'Κανένα αεροπλάνο εντός εμβέλειας αυτή τη στιγμή')));
        else {
          tableHost.replaceChildren(h('div', { class: 'nm-table-wrap ac-tw' }, h('table', { class: 'nm-table ac-table' },
            h('caption', null, T('One row for each mark on the map, from south to north. The number is only a count for this moment.', 'Μία γραμμή για κάθε σημάδι στον χάρτη, από τον νότο προς τον βορρά. Ο αριθμός είναι απλή αρίθμηση για αυτή τη στιγμή.')),
            h('thead', null, h('tr', null, [T('No.', 'Α/Α'), T('Guess from the height', 'Εικασία από το ύψος'), T('Height', 'Ύψος'), T('Speed over the ground', 'Ταχύτητα ως προς το έδαφος'), T('Moving towards', 'Κινείται προς')].map((x) => h('th', { scope: 'col' }, x)))),
            h('tbody', null, points.map((p) => h('tr', { 'data-phase': p.phase },
              h('td', null, p.id.replace('a', '')), h('td', null, h('span', { class: 'ac-tm' }, legendMark(p.phase)), PHASE[p.phase]()),
              h('td', null, height(p)), h('td', null, speed(p)), h('td', null, heading(p) || T('not reported', 'δεν αναφέρεται'))))))));
        }
        ageText();
      }

      async function load() {
        if (busy || gone) return;
        busy = true; again.disabled = true;
        try { const d = await SC.api('/api/aircraft'); if (gone) return; data = d && typeof d === 'object' ? d : { points: [] }; failed = null; }
        catch (e) { if (gone) return; failed = e; if (e.status === 503) data = null; }
        finally { busy = false; again.disabled = false; }
        draw();
      }

      draw();
      load();
      timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);   // a hidden tab does not ask
      tick = setInterval(ageText, 1000);
      return () => { gone = true; clearInterval(timer); clearInterval(tick); };
    },
  });
})();
