/*
  Live map: the old map page (/map.html) shown inside the shell in a glass frame.
  The page is a separate document (MapLibre needs its own canvas), so this file only builds the frame around it:
    - forwards the shell route query to the iframe (?eui=<vehicle> opens that vehicle and its trail, ?station=<id> opens a Met Office station)
      and the language (?lang=el). The shell re-renders the page on every hash change, so a new query builds a new iframe.
    - loading overlay, and an error card with "Try again" if the map engine could not start (the map needs internet for its map library).
  Privacy: /map.html shows vehicle positions about 2 hours late and rounded to 1 km, and says so in its legend.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/map.css');

  SC.register('map', {
    title: ['Live map', 'Ζωντανός χάρτης'],
    async render(root, ctx) {
      const tags = [];
      let cfg = null;
      try { cfg = await SC.cached('/api/config', 60000); } catch (e) { cfg = null; }
      if (cfg && cfg.demo) tags.push({ cls: 'demo', text: T('Demo data', 'Δοκιμαστικά δεδομένα') });
      const delayed = cfg && cfg.exactPositions === false;
      const hrs = cfg && cfg.posDelayMin ? Math.max(1, Math.round(cfg.posDelayMin / 60)) : 2;
      const lede = T('Schools, vehicles and Met Office stations on one island. Switch layers on the left, press Time-lapse to replay the day.',
        'Σχολεία, οχήματα και σταθμοί της Μετεωρολογικής Υπηρεσίας σε ένα νησί. Αλλάξτε στρώματα αριστερά, πατήστε Χρονική επανάληψη για να δείτε ξανά την ημέρα.');
      root.append(SC.head({
        title: T('Live map', 'Ζωντανός χάρτης'),
        lede,
        fresh: T('Live · updates every 30 s', 'Ζωντανά · ανανέωση κάθε 30 δ.'),
        tags,
        help: [
          'The map shows our schools, the buses and cars that carry a sensor, and the Cyprus Met Office stations. Layers on the left switch things on and off: wind, temperature, rain, air quality and NASA satellite images. Press a vehicle or a station to see its readings and a 24 hour chart. Time-lapse replays the last hours. '
            + (delayed ? 'Vehicle positions are shown about ' + hrs + ' hours late and rounded to 1 km, so nobody can follow a vehicle live. Teachers see exact positions after signing in.' : ''),
          'Ο χάρτης δείχνει τα σχολεία μας, τα λεωφορεία και τα αυτοκίνητα που φέρουν αισθητήρα και τους σταθμούς της Μετεωρολογικής Υπηρεσίας Κύπρου. Τα στρώματα αριστερά ανάβουν και σβήνουν στοιχεία: άνεμο, θερμοκρασία, βροχή, ποιότητα αέρα και δορυφορικές εικόνες της NASA. Πατήστε ένα όχημα ή έναν σταθμό για τις μετρήσεις του και ένα γράφημα 24 ωρών. Η χρονική επανάληψη δείχνει ξανά τις τελευταίες ώρες. '
            + (delayed ? 'Οι θέσεις των οχημάτων εμφανίζονται με καθυστέρηση περίπου ' + hrs + ' ωρών και στρογγυλοποιημένες στο 1 χλμ., ώστε κανείς να μην μπορεί να ακολουθήσει ένα όχημα ζωντανά. Οι εκπαιδευτικοί βλέπουν τις ακριβείς θέσεις μετά τη σύνδεση.' : ''),
        ],
      }));

      // the iframe address: embed mode, language, and the route query (eui, station, ...)
      const params = new URLSearchParams();
      params.set('embed', '1');
      params.set('lang', ctx.lang === 'el' ? 'el' : 'en');
      for (const [k, v] of ctx.query) if (k !== 'embed' && k !== 'lang') params.set(k, v);
      const src = '/map.html?' + params.toString();

      const card = el('div', { class: 'nm-card frame-card mp-frame' });
      const timers = [];
      let frame = null;
      function mount() {
        timers.splice(0).forEach(clearTimeout);
        card.replaceChildren();
        const load = el('div', { class: 'mp-load', role: 'status' }, el('span', { class: 'mp-spin', 'aria-hidden': 'true' }), el('span', null, T('Loading the map…', 'Φόρτωση του χάρτη…')));
        frame = el('iframe', { src, title: T('Live map of Cyprus', 'Ζωντανός χάρτης της Κύπρου'), loading: 'eager', allow: 'fullscreen' });
        card.append(frame, load);
        let done = false;
        const fail = (why) => {
          if (done) return;
          done = true;
          load.className = 'mp-load mp-fail';
          load.setAttribute('role', 'alert');
          load.replaceChildren(
            el('b', null, T('The map could not start.', 'Ο χάρτης δεν μπόρεσε να ξεκινήσει.')),
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
          // the page sets window.__embedReady once the map engine is running; wait a little for slow connections
          let n = 0;
          const poll = () => {
            if (done) return;
            if (check() !== false) return;
            if (++n > 40) return fail(T('The map library did not load. It needs an internet connection.', 'Η βιβλιοθήκη του χάρτη δεν φορτώθηκε. Χρειάζεται σύνδεση στο διαδίκτυο.'));
            timers.push(setTimeout(poll, 500));
          };
          poll();
        });
        frame.addEventListener('error', () => fail(T('The page could not be loaded.', 'Η σελίδα δεν φορτώθηκε.')));
      }
      root.append(card);
      mount();
      root.append(el('p', { class: 'muted mp-note' }, delayed
        ? T('Vehicle positions are about ' + hrs + ' hours late and rounded to 1 km. Teachers see exact positions after signing in.', 'Οι θέσεις των οχημάτων είναι με καθυστέρηση περίπου ' + hrs + ' ωρών και στρογγυλοποιημένες στο 1 χλμ. Οι εκπαιδευτικοί βλέπουν τις ακριβείς θέσεις μετά τη σύνδεση.')
        : T('Map data: OpenStreetMap, EOX, Esri, OpenTopoMap, NASA GIBS, Open-Meteo and the Cyprus Department of Meteorology.', 'Δεδομένα χάρτη: OpenStreetMap, EOX, Esri, OpenTopoMap, NASA GIBS, Open-Meteo και Τμήμα Μετεωρολογίας Κύπρου.')));
      return () => { timers.splice(0).forEach(clearTimeout); if (frame) frame.src = 'about:blank'; };
    },
  });
})();
