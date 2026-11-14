/*
  City centres in 3D (#/city): the island, then the centre of a city with its buildings and streets from OpenStreetMap.
  The 3D view is a separate document (/city.html, three.js needs its own canvas and an import map), shown in a same-origin frame,
  as the Cyprus 3D page does. This file builds the frame, forwards the language and ?city=, shows a loading overlay, and an error
  card with "Try again" if the 3D engine could not start. Styles are shared with the map page (map.css, prefix mp-).
  Privacy: buildings and streets only; no vehicle and no person is drawn.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/map.css');

  SC.register('city', {
    title: ['City centres in 3D', 'Τα κέντρα των πόλεων σε 3D'],
    render(root, ctx) {
      root.append(SC.head({
        title: T('City centres in 3D', 'Τα κέντρα των πόλεων σε 3D'),
        lede: T('Start from the whole island, then fly down to the centre of a city: its buildings and streets, where our sensor cars drive.', 'Ξεκίνα από όλο το νησί και πέτα στο κέντρο μιας πόλης: τα κτίρια και οι δρόμοι της, εκεί που κινούνται τα αυτοκίνητα με τους αισθητήρες μας.'),
      }));
      const params = new URLSearchParams();
      params.set('embed', '1');
      params.set('lang', ctx && ctx.lang === 'el' ? 'el' : SC.lang === 'el' ? 'el' : 'en');
      const c = ctx && ctx.query ? ctx.query.get('city') : null;
      if (c && /^[a-z]{3,12}$/.test(c)) params.set('city', c);
      const card = el('div', { class: 'nm-card frame-card mp-frame city-frame' });
      const timers = [];
      let frame = null;
      function mount() {
        timers.splice(0).forEach(clearTimeout);
        card.replaceChildren();
        const load = el('div', { class: 'mp-load', role: 'status' }, el('span', { class: 'mp-spin', 'aria-hidden': 'true' }), el('span', null, T('Starting the 3D view…', 'Ξεκινά η τρισδιάστατη προβολή…')));
        frame = el('iframe', { src: '/city.html?' + params.toString(), title: T('Cyprus and its city centres in 3D', 'Η Κύπρος και τα κέντρα των πόλεων σε 3D'), loading: 'eager', allow: 'fullscreen' });
        card.append(frame, load);
        let done = false;
        const fail = (why) => {
          if (done) return;
          done = true;
          load.className = 'mp-load mp-fail';
          load.setAttribute('role', 'alert');
          load.replaceChildren(el('b', null, T('The 3D view could not start.', 'Η τρισδιάστατη προβολή δεν μπόρεσε να ξεκινήσει.')), el('span', null, why),
            el('button', { class: 'nm-btn nm-btn--primary', type: 'button', onclick: mount }, T('Try again', 'Δοκίμασε ξανά')));
        };
        const ok = () => { if (!done) { done = true; load.remove(); } };
        frame.addEventListener('load', () => {
          let n = 0;
          const check = () => {
            if (done) return;
            let w = null;
            try { w = frame.contentWindow; } catch (e) { w = null; }
            if (w && w.__embedReady) return ok();
            if (w && w.__embedFailed) return fail(String(w.__embedFailed));
            if (++n > 60) return fail(T('The 3D engine did not answer. A newer browser may help.', 'Η μηχανή 3D δεν απάντησε. Ένα νεότερο πρόγραμμα περιήγησης ίσως βοηθήσει.'));
            timers.push(setTimeout(check, 500));
          };
          check();
        });
        frame.addEventListener('error', () => fail(T('The page could not be loaded.', 'Η σελίδα δεν φορτώθηκε.')));
      }
      root.append(card);
      mount();
      root.append(el('p', { class: 'muted mp-note' }, T('Buildings and streets: © OpenStreetMap contributors (Open Database Licence). Buildings without a recorded height are drawn at 9 m, and a layer shows which ones. The sensor cars are never shown as positions.', 'Κτίρια και δρόμοι: © συντελεστές του OpenStreetMap (Open Database Licence). Τα κτίρια χωρίς καταγεγραμμένο ύψος σχεδιάζονται στα 9 μ., και ένα στρώμα δείχνει ποια είναι. Τα αυτοκίνητα με αισθητήρες δεν εμφανίζονται ποτέ ως θέσεις.')));
      return () => { timers.splice(0).forEach(clearTimeout); if (frame) frame.src = 'about:blank'; };
    },
  });
})();
