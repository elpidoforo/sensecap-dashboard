/*
  Measurement bubbles (toolkit). Each of the four saved lines of each city (outdoor air, wind, sea, our sensors) as a bubble, drawn in SVG:
    size   = how far the newest value is from that city's own average over the saved day, as a part of that day's lowest-to-highest range
    colour = above the average (amber, with an up arrow) or below it (cyan, with a down arrow)
  A big bubble means "unusual today", not "bad". Press a bubble (or Tab to it and press Enter) to read it in words.
  Under the picture the same numbers are in a table, for screen readers and for anyone who prefers a table.
  Data: GET /layers/api/replay (the saved day), names of layers from GET /layers/api/live. The sums are SC.tk1.stats (tested).
*/
(function () {
  'use strict';
  const T = SC.t, h = SC.el, sv = SC.svgEl;
  SC.css('/site/pages/tk1.css');
  const core = () => (SC.tk1 ? Promise.resolve() : (SC.tk1Loading = SC.tk1Loading || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk1-core.js?v=1';
    s.onload = () => (SC.tk1 ? res() : rej(new Error('toolkit core'))); s.onerror = () => { SC.tk1Loading = null; s.remove(); rej(new Error(T('A part of this page could not be loaded.', 'Ένα κομμάτι της σελίδας δεν φορτώθηκε.'))); };
    document.head.append(s);
  })));

  SC.register('bubbles', {
    title: ['Measurement bubbles', 'Φούσκες μετρήσεων'],
    async render(root) {
      document.title = T('Measurement bubbles', 'Φούσκες μετρήσεων') + ' · Athena';
      root.append(SC.head({ title: T('Measurement bubbles', 'Φούσκες μετρήσεων'),
        lede: T('Which readings are far from their own usual level today? One bubble for each measurement of each city.', 'Ποιες μετρήσεις απέχουν σήμερα από το δικό τους συνηθισμένο επίπεδο; Μία φούσκα για κάθε μέτρηση κάθε πόλης.'),
        help: ['For each city and measurement the page takes the newest saved value and the average of all the values saved over the day. The further the newest value is from that average (compared with the day\'s lowest-to-highest range), the bigger the bubble. Amber with an up arrow means above the average, cyan with a down arrow means below. Big means unusual for today, not bad. Press a bubble to read it in words; the table underneath has the same numbers.',
          'Για κάθε πόλη και μέτρηση η σελίδα παίρνει την πιο πρόσφατη αποθηκευμένη τιμή και τον μέσο όρο όλων των τιμών της μέρας. Όσο πιο μακριά είναι η πιο πρόσφατη τιμή από αυτόν τον μέσο όρο (σε σχέση με το εύρος της μέρας, από το χαμηλότερο ως το ψηλότερο), τόσο μεγαλύτερη η φούσκα. Πορτοκαλί με βέλος πάνω σημαίνει πάνω από τον μέσο όρο, γαλάζιο με βέλος κάτω σημαίνει κάτω. Μεγάλη σημαίνει ασυνήθιστη για σήμερα, όχι κακή. Πάτα μια φούσκα για να τη διαβάσεις με λόγια· ο πίνακας από κάτω έχει τους ίδιους αριθμούς.'] }));
      await core();
      const K = SC.tk1;
      let picked = null, m = null, lastW = 0;

      function draw(d, body) {
        const live = d.live, replay = d.replay, span = K.daySpan(replay);
        if (span.n < 2) { body.append(K.panel(T('The saved day', 'Η αποθηκευμένη μέρα'), h('p', { class: 't1-warn bb-filling' }, K.fillingNote({ n: 0 })), K.note(T('A bubble needs at least two saved moments: without them there is no average to measure from.', 'Μια φούσκα χρειάζεται τουλάχιστον δύο αποθηκευμένες στιγμές: χωρίς αυτές δεν υπάρχει μέσος όρος για να μετρήσουμε.')))); return; }
        // every city x measure
        const cells = [];
        K.MEAS.forEach(([k], row) => K.CITY_IDS.forEach((c, col) => { const s = K.series(replay, c, k); const st = s ? K.stats(s.values, replay.times) : null; cells.push({ id: c + '-' + k, c, k, row, col, s, st: st && st.n >= 2 ? st : null, one: Boolean(st && st.n < 2) }); }));
        const dirOf = (x) => { if (!x.st || x.st.range <= 0) return 'flat'; const r = Math.round(x.st.share * 100); return r > 0 ? 'up' : r < 0 ? 'down' : 'flat'; };
        const label = (x) => K.cityName(x.c) + ', ' + (x.k === 'own' && x.s ? K.measName(x.k) + ' (' + K.varName(x.s.variable, live) + ')' : K.measName(x.k));
        function words(x) {
          if (!x.s) return label(x) + ': ' + T('no layer has saved this, so there is no bubble.', 'κανένα στρώμα δεν το έχει αποθηκεύσει, άρα δεν υπάρχει φούσκα.');
          if (!x.st) return label(x) + ': ' + T('only one saved moment, so there is no average yet.', 'μόνο μία αποθηκευμένη στιγμή, άρα δεν υπάρχει ακόμη μέσος όρος.');
          const u = x.s.unit || '', st = x.st, dir = dirOf(x);
          const head = label(x) + ': ' + K.withUnit(st.last.v, u) + T(' at ', ' στις ') + K.when(st.last.t) + T(', from the layer ', ', από το στρώμα ') + K.layerName(live, x.s.source) + '. ';
          const day = T('Over the saved day (' + K.when(st.first.t) + ' to ' + K.when(st.last.t) + ') its average was ' + K.withUnit(st.mean, u) + ' and it went from ' + K.withUnit(st.min, u) + ' to ' + K.withUnit(st.max, u) + '. ',
            'Στην αποθηκευμένη μέρα (' + K.when(st.first.t) + ' έως ' + K.when(st.last.t) + ') ο μέσος όρος ήταν ' + K.withUnit(st.mean, u) + ' και κινήθηκε από ' + K.withUnit(st.min, u) + ' έως ' + K.withUnit(st.max, u) + '. ');
          const far = st.range <= 0 ? T('It has not moved at all in the saved day, so the bubble is a dot.', 'Δεν κουνήθηκε καθόλου στην αποθηκευμένη μέρα, άρα η φούσκα είναι μια τελεία.')
            : dir === 'flat' ? T('The newest value sits on the average.', 'Η πιο πρόσφατη τιμή είναι πάνω στον μέσο όρο.')
              : T('The newest value is ' + K.withUnit(Math.abs(st.dev), u) + (dir === 'up' ? ' above' : ' below') + ' that average: ' + K.pct(st.share) + ' of the day\'s range.', 'Η πιο πρόσφατη τιμή είναι ' + K.withUnit(Math.abs(st.dev), u) + (dir === 'up' ? ' πάνω από' : ' κάτω από') + ' αυτόν τον μέσο όρο: ' + K.pct(st.share) + ' του εύρους της μέρας.');
          return head + day + far;
        }

        /* ----- the picture ----- */
        const host = h('div', { class: 'bb-host' });
        const said = h('p', { class: 'bb-said', 'aria-live': 'polite' }, T('Press a bubble to read it in words.', 'Πάτα μια φούσκα για να τη διαβάσεις με λόγια.'));
        const pick = (x) => { picked = x.id; said.textContent = words(x) + (x.st && x.st.range > 0 ? ' ' + T('Unusual today is not the same as bad.', 'Ασυνήθιστο σήμερα δεν σημαίνει κακό.') : ''); host.querySelectorAll('.bb-b').forEach((g) => g.classList.toggle('on', g.dataset.id === x.id)); };
        function paint() {
          const W = Math.max(280, Math.floor(host.clientWidth || 600)); lastW = W;
          const colW = W / 4, rMax = Math.min(46, colW / 2 - 8), rMin = 6, rowH = rMax * 2 + 58, top = 30, H = top + rowH * K.MEAS.length + 4;
          const svg = sv('svg', { class: 'bb-svg', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group', 'aria-label': T('Bubbles: four measurements for each of the four cities. The same numbers are in the table below.', 'Φούσκες: τέσσερις μετρήσεις για καθεμία από τις τέσσερις πόλεις. Οι ίδιοι αριθμοί είναι στον πίνακα από κάτω.') });
          K.CITY_IDS.forEach((c, i) => svg.append(sv('text', { class: 'bb-city', x: colW * (i + 0.5), y: 18, 'text-anchor': 'middle' }, K.cityName(c))));
          K.MEAS.forEach(([k], row) => {
            const y0 = top + row * rowH;
            svg.append(sv('line', { class: 'bb-rule', x1: 0, x2: W, y1: y0 + 0.5, y2: y0 + 0.5 }), sv('text', { class: 'bb-meas', x: 4, y: y0 + 18 }, K.measName(k)));
          });
          cells.forEach((x) => {
            const cx = colW * (x.col + 0.5), cy = top + x.row * rowH + 26 + rMax, dir = dirOf(x);
            const r = !x.st ? rMin : x.st.range <= 0 ? 4 : rMin + Math.min(1, Math.abs(x.st.share)) * (rMax - rMin);
            const g = sv('g', { class: 'bb-b ' + (x.st ? dir : 'none') + (picked === x.id ? ' on' : ''), tabindex: 0, role: 'button', 'data-id': x.id, 'aria-label': words(x) });
            g.append(sv('circle', { class: 'bb-ring', cx, cy, r: r + 5 }), sv('circle', { class: 'bb-c', cx, cy, r }));
            if (x.st && dir !== 'flat' && r >= 13) g.append(sv('text', { class: 'bb-arrow', x: cx, y: cy + 5, 'text-anchor': 'middle', 'aria-hidden': 'true' }, dir === 'up' ? '▲' : '▼'));
            g.append(sv('text', { class: 'bb-val', x: cx, y: cy + rMax + 20, 'text-anchor': 'middle', 'aria-hidden': 'true' }, x.st ? (dir !== 'flat' && r < 13 ? (dir === 'up' ? '▲ ' : '▼ ') : '') + K.withUnit(x.st.last.v, x.s.unit) : '–'));
            g.addEventListener('click', () => pick(x));
            g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(x); } });
            svg.append(g);
          });
          host.replaceChildren(svg);
        }
        const legend = h('p', { class: 'bb-legend' },
          h('span', { class: 'bb-k up', 'aria-hidden': 'true' }, '▲'), h('span', { class: 'bb-k down', 'aria-hidden': 'true' }, '▼'),
          T('The bigger the bubble, the further the newest value is from that city\'s own average over the saved day; amber with an up arrow means above that average, cyan with a down arrow means below.',
            'Όσο μεγαλύτερη η φούσκα, τόσο πιο μακριά είναι η πιο πρόσφατη τιμή από τον μέσο όρο της ίδιας της πόλης στην αποθηκευμένη μέρα· πορτοκαλί με βέλος πάνω σημαίνει πάνω από αυτόν τον μέσο όρο, γαλάζιο με βέλος κάτω σημαίνει κάτω.'));
        const pic = K.panel(T('Far from its own average today', 'Μακριά από τον δικό του μέσο όρο σήμερα'), legend,
          h('p', { class: 't1-warn bb-notbad' }, T('A big bubble means "unusual today", not "bad". A cool morning after a hot day makes a big bubble too. And bubbles of two cities are not a contest: each one is measured only against its own day.',
            'Μια μεγάλη φούσκα σημαίνει «ασυνήθιστο σήμερα», όχι «κακό». Ένα δροσερό πρωί μετά από ζεστή μέρα κάνει κι αυτό μεγάλη φούσκα. Και οι φούσκες δύο πόλεων δεν είναι αγώνας: η καθεμία μετριέται μόνο με τη δική της μέρα.')),
          span.ms < K.SHORT ? h('p', { class: 't1-warn bb-filling' }, K.fillingNote(span) + ' ' + T('With so little saved, "unusual" means very little yet.', 'Με τόσο λίγα αποθηκευμένα, το «ασυνήθιστο» δεν λέει ακόμη πολλά.')) : null,
          host, said,
          K.note(T('Saved day: ' + K.when(span.from) + ' to ' + K.when(span.to) + ' (' + K.dur(span.ms) + '). A dashed ring means nothing is saved for that city. A small dot means the value has not moved.', 'Αποθηκευμένη μέρα: ' + K.when(span.from) + ' έως ' + K.when(span.to) + ' (' + K.dur(span.ms) + '). Ένας διακεκομμένος κύκλος σημαίνει ότι δεν έχει αποθηκευτεί κάτι για την πόλη. Μια μικρή τελεία σημαίνει ότι η τιμή δεν κουνήθηκε.')));
        pic.classList.add('bb-pic');
        body.append(pic);
        paint();
        if (picked) { const x = cells.find((c) => c.id === picked); if (x) pick(x); }

        /* ----- the same numbers as a table ----- */
        const dirWord = (x) => { const dd = dirOf(x); return !x.st ? '–' : x.st.range <= 0 ? T('has not moved', 'δεν κουνήθηκε') : dd === 'up' ? T('above', 'πάνω') : dd === 'down' ? T('below', 'κάτω') : T('on the average', 'στον μέσο όρο'); };
        const heads = [T('City', 'Πόλη'), T('Measurement', 'Μέτρηση'), T('Newest', 'Πιο πρόσφατη'), T('Time', 'Ώρα'), T('Day average', 'Μέσος όρος μέρας'), T('Lowest', 'Χαμηλότερη'), T('Highest', 'Ψηλότερη'), T('From the average', 'Από τον μέσο όρο'), T('Part of the range', 'Μέρος του εύρους'), T('Layer', 'Στρώμα')];
        const byCity = cells.slice().sort((p, q) => p.col - q.col || p.row - q.row);
        body.append(K.panel(T('The same numbers as a table', 'Οι ίδιοι αριθμοί σε πίνακα'),
          h('div', { class: 't1-scroll', tabindex: 0, role: 'region', 'aria-label': T('Table of the bubbles', 'Πίνακας με τις φούσκες') }, h('table', { class: 't1-table bb-table' },
            h('caption', { class: 't1-sr' }, T('Each bubble as a row', 'Κάθε φούσκα ως γραμμή')),
            h('thead', null, h('tr', null, heads.map((x) => h('th', { scope: 'col' }, x)))),
            h('tbody', null, byCity.map((x) => {
              const u = x.s ? x.s.unit || '' : '', st = x.st;
              return h('tr', { dataset: { id: x.id } },
                h('th', { scope: 'row' }, K.cityName(x.c)), h('td', null, x.k === 'own' && x.s ? K.measName(x.k) + ': ' + K.varName(x.s.variable, live) : K.measName(x.k)),
                st ? [h('td', { class: 'n' }, K.withUnit(st.last.v, u)), h('td', null, K.when(st.last.t)), h('td', { class: 'n' }, K.withUnit(st.mean, u)), h('td', { class: 'n' }, K.withUnit(st.min, u)), h('td', { class: 'n' }, K.withUnit(st.max, u)),
                  h('td', { class: 'n' }, st.range > 0 ? K.signed(st.dev, u) + ' (' + dirWord(x) + ')' : dirWord(x)), h('td', { class: 'n bb-share' }, st.range > 0 ? K.pct(st.share) : '–'), h('td', null, K.layerName(live, x.s.source))]
                  : h('td', { colspan: 8 }, x.one ? T('only one saved moment', 'μόνο μία αποθηκευμένη στιγμή') : T('nothing saved', 'τίποτα αποθηκευμένο')));
            })))),
          K.note(T('"Part of the range" is what sets the size of a bubble: the distance from the average divided by (highest minus lowest). The average is the plain average of the saved moments.', 'Το «μέρος του εύρους» είναι αυτό που ορίζει το μέγεθος μιας φούσκας: η απόσταση από τον μέσο όρο διά (ψηλότερη μείον χαμηλότερη). Ο μέσος όρος είναι ο απλός μέσος όρος των αποθηκευμένων στιγμών.'))));
        draw.repaint = () => { if (host.isConnected && Math.abs((host.clientWidth || 0) - lastW) > 8) paint(); };
      }

      m = K.mount(root, { cls: 'bb', need: ['live', 'replay'], must: ['replay'], draw });
      const onSize = () => { if (draw.repaint) draw.repaint(); };
      window.addEventListener('resize', onSize);
      return () => { window.removeEventListener('resize', onSize); m.stop(); };
    },
  });
})();
