/*
  Cyprus 3D: the old 3D page (/3d.html) shown inside the shell in a glass frame.
  Same idea as map.js: a separate document (three.js needs its own canvas), so this file builds the frame around it,
  forwards the language and the route query, shows a loading overlay, and an error card with "Try again" if the 3D engine
  could not start (three.js is served from /vendor/three-r160/ on our own server, so the page makes no third-party request).
  Styles are shared with the map page (map.css, prefix mp-).
  Privacy: the columns of vehicles stand at the delayed, rounded positions the API gives the public (about 2 hours late, 1 km).
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/map.css');   // shared with the map page
  SC.css('/site/pages/city3d.css');

  SC.register('city3d', {
    title: ['Cyprus 3D', 'Κύπρος 3D'],
    async render(root, ctx) {
      const tags = [];
      let cfg = null;
      try { cfg = await SC.cached('/api/config', 60000); } catch (e) { cfg = null; }
      if (cfg && cfg.demo) tags.push({ cls: 'demo', text: T('Demo data', 'Δοκιμαστικά δεδομένα') });
      const delayed = cfg && cfg.exactPositions === false;
      const hrs = cfg && cfg.posDelayMin ? Math.max(1, Math.round(cfg.posDelayMin / 60)) : 2;
      const lede = T('The island in 3D: mountains, wind and our sensors as columns whose height shows the reading. Drag to turn it, scroll to zoom.',
        'Το νησί σε 3D: βουνά, άνεμος και οι αισθητήρες μας ως στήλες με ύψος ανάλογο της μέτρησης. Σύρετε για να το γυρίσετε, κυλήστε για μεγέθυνση.');
      const head = SC.head({
        title: T('Cyprus 3D', 'Κύπρος 3D'),
        lede,
        fresh: T('Checking…', 'Έλεγχος…'),
        tags,
        help: [
          'The island is built from elevation data. Pick what colours the ground (blue relief, temperature, elevation, air quality, dust) and what the sensor columns show. The taller and warmer the column, the higher the reading. Press a sensor in the list on the right to fly to its column, or press a column to open its history. '
            + (delayed ? 'Vehicle columns stand at positions that are about ' + hrs + ' hours late and rounded to 1 km.' : ''),
          'Το νησί δημιουργείται από δεδομένα υψομέτρου. Διαλέξτε τι χρωματίζει το έδαφος (μπλε ανάγλυφο, θερμοκρασία, υψόμετρο, ποιότητα αέρα, σκόνη) και τι δείχνουν οι στήλες των αισθητήρων. Όσο πιο ψηλή και ζεστή η στήλη, τόσο υψηλότερη η μέτρηση. Πατήστε έναν αισθητήρα στη λίστα δεξιά για να πετάξετε στη στήλη του ή πατήστε μια στήλη για το ιστορικό της. '
            + (delayed ? 'Οι στήλες των οχημάτων βρίσκονται σε θέσεις με καθυστέρηση περίπου ' + hrs + ' ωρών και στρογγυλοποιημένες στο 1 χλμ.' : ''),
        ],
      });
      root.append(head);
      // the freshness pill says how old the newest sensor reading is (the columns refresh every 30 s)
      const pill = head.querySelector('.fresh-pill');
      const setPill = (cls, text) => { if (!pill) return; pill.className = 'fresh-pill' + (cls ? ' ' + cls : ''); pill.lastChild.textContent = text; };
      SC.api('/api/devices').then((devs) => {
        const seen = (Array.isArray(devs) ? devs : []).map((d) => Date.parse(d.lastSeen)).filter((t) => isFinite(t));
        const last = seen.length ? Math.max(...seen) : 0;
        if (!last) setPill('none', T('No readings yet', 'Καμία μέτρηση ακόμα'));
        else if (Date.now() - last > 3600000) setPill('stale', T('Last reading ' + SC.ago(last), 'Τελευταία μέτρηση ' + SC.ago(last)));
        else setPill('', T('Live · ' + SC.ago(last), 'Ζωντανά · ' + SC.ago(last)));
      }).catch(() => setPill('none', T('Sensors unavailable', 'Οι αισθητήρες δεν είναι διαθέσιμοι')));

      // the iframe address: embed mode, language, and the route query (eui, station, ...)
      const params = new URLSearchParams();
      params.set('embed', '1');
      params.set('lang', ctx.lang === 'el' ? 'el' : 'en');
      for (const [k, v] of ctx.query) if (k !== 'embed' && k !== 'lang') params.set(k, v);
      const src = '/3d.html?' + params.toString();

      const card = el('div', { class: 'nm-card frame-card mp-frame' });
      const timers = [];
      let frame = null;
      function mount() {
        timers.splice(0).forEach(clearTimeout);
        card.replaceChildren();
        const load = el('div', { class: 'mp-load', role: 'status' }, el('span', { class: 'mp-spin', 'aria-hidden': 'true' }), el('span', null, T('Building the island… the first time can take a minute.', 'Δημιουργία του νησιού… την πρώτη φορά μπορεί να πάρει ένα λεπτό.')));
        frame = el('iframe', { src, title: T('Cyprus in 3D', 'Η Κύπρος σε 3D'), loading: 'eager', allow: 'fullscreen' });
        card.append(frame, load);
        let done = false;
        const fail = (why) => {
          if (done) return;
          done = true;
          load.className = 'mp-load mp-fail';
          load.setAttribute('role', 'alert');
          load.replaceChildren(
            el('b', null, T('The 3D view could not start.', 'Η τρισδιάστατη προβολή δεν μπόρεσε να ξεκινήσει.')),
            el('span', null, why),
            el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: mount }, T('Try again', 'Δοκιμάστε ξανά')));
        };
        const ok = () => { if (done) return; done = true; load.remove(); };
        const check = () => {
          let w = null;
          try { w = frame.contentWindow; } catch (e) { w = null; }
          if (w && w.__embedReady) return ok();
          if (w && w.__embedFailed) return fail(String(w.__embedFailed));
          return false;
        };
        frame.addEventListener('load', () => {
          // the page sets window.__embedReady once the 3D engine is running; the island can take a while to build, so wait longer
          let n = 0;
          const poll = () => {
            if (done) return;
            if (check() !== false) return;
            if (++n > 120) return fail(T('The 3D library did not load. It needs an internet connection.', 'Η βιβλιοθήκη 3D δεν φορτώθηκε. Χρειάζεται σύνδεση στο διαδίκτυο.'));
            timers.push(setTimeout(poll, 500));
          };
          poll();
        });
        frame.addEventListener('error', () => fail(T('The page could not be loaded.', 'Η σελίδα δεν φορτώθηκε.')));
      }
      root.append(card);
      mount();
      root.append(el('p', { class: 'muted mp-note' }, delayed
        ? T('Vehicle columns stand at positions that are about ' + hrs + ' hours late and rounded to 1 km. Teachers see exact positions after signing in.', 'Οι στήλες των οχημάτων βρίσκονται σε θέσεις με καθυστέρηση περίπου ' + hrs + ' ωρών και στρογγυλοποιημένες στο 1 χλμ. Οι εκπαιδευτικοί βλέπουν τις ακριβείς θέσεις μετά τη σύνδεση.')
        : T('Weather: Open-Meteo. Elevation: Open-Meteo. Sensors: our own SenseCAP devices.', 'Καιρός: Open-Meteo. Υψόμετρο: Open-Meteo. Αισθητήρες: οι δικές μας συσκευές SenseCAP.')));
      return () => { timers.splice(0).forEach(clearTimeout); if (frame) frame.src = 'about:blank'; };
    },
  });
})();
