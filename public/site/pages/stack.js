/*
  The data stack in 3D (#/stack): every layer Athena holds, from the seabed up to space, stacked over the island, with the
  source of each layer drawn in the scene beside it. The 3D view is a separate document (/stack.html: three.js needs its own
  canvas and an import map), shown in a same-origin frame, exactly as #/city is. This file builds the frame, forwards the
  language, shows a loading overlay, and an error card with "Try again" if the 3D engine could not start.
  Honest limits: the values on that page are illustrative and its relief and rasters are drawn rather than fetched. The page
  says so itself; this page says so too, above the frame, so nobody meets the picture without the caveat.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/map.css');

  SC.register('stack', {
    title: ['The data stack in 3D', 'Η στοίβα δεδομένων σε 3D'],
    render(root, ctx) {
      root.append(SC.head({
        title: T('The data stack in 3D', 'Η στοίβα δεδομένων σε 3D'),
        lede: T('Every layer we hold, from the seabed up to the satellites, stacked over Cyprus. Each sheet shows where it comes from: stations beam up from the island, our sensors climb the whole stack, models and published files feed in from the side.',
          'Κάθε στρώμα που κρατάμε, από τον βυθό ως τους δορυφόρους, στοιβαγμένο πάνω από την Κύπρο. Κάθε φύλλο δείχνει από πού έρχεται: οι σταθμοί στέλνουν από το νησί, οι αισθητήρες μας ανεβαίνουν όλη τη στοίβα, μοντέλα και δημοσιευμένα αρχεία μπαίνουν από το πλάι.'),
      }));
      root.append(el('p', { class: 'nm-note' },
        T('The sheets that are wired show the newest reading Athena holds, with its source and its age: sensors, wind, air quality and the sea. The rest say "drawn" — their picture is made in your browser, not measured — and the relief under everything is drawn too.',
          'Τα φύλλα που είναι συνδεδεμένα δείχνουν την πιο πρόσφατη μέτρηση που κρατά η Athena, με την πηγή και την ηλικία της: αισθητήρες, άνεμος, ποιότητα αέρα και θάλασσα. Τα υπόλοιπα λένε «σχεδιασμένο» — η εικόνα τους φτιάχνεται στο πρόγραμμα περιήγησης, δεν μετριέται — και το ανάγλυφο από κάτω είναι επίσης σχεδιασμένο.')));

      const params = new URLSearchParams();
      params.set('embed', '1');
      params.set('lang', ctx && ctx.lang === 'el' ? 'el' : SC.lang === 'el' ? 'el' : 'en');
      const card = el('div', { class: 'nm-card frame-card mp-frame city-frame' });
      const timers = [];
      let frame = null;

      function mount() {
        timers.splice(0).forEach(clearTimeout);
        card.replaceChildren();
        const load = el('div', { class: 'mp-load', role: 'status' },
          el('span', { class: 'mp-spin', 'aria-hidden': 'true' }),
          el('span', null, T('Starting the 3D view…', 'Ξεκινά η τρισδιάστατη προβολή…')));
        frame = el('iframe', {
          src: '/stack.html?' + params.toString(),
          title: T('The data stack over Cyprus in 3D', 'Η στοίβα δεδομένων πάνω από την Κύπρο σε 3D'),
          loading: 'eager', allow: 'fullscreen',
        });
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

      root.append(el('p', { class: 'nm-note' },
        T('Nothing here draws a vehicle or a person. The only positions on the island are the four school sites and the weather stations in the source register.',
          'Τίποτα εδώ δεν σχεδιάζει όχημα ή άνθρωπο. Οι μόνες θέσεις στο νησί είναι τα τέσσερα σχολεία και οι μετεωρολογικοί σταθμοί του μητρώου πηγών.')));

      return () => { timers.splice(0).forEach(clearTimeout); if (frame) frame.src = 'about:blank'; };
    },
  });
}());
