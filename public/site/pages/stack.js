/*
  The data stack in 3D (#/stack): every layer Kleanthis holds, from the seabed up to space, stacked over the island, with the
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
        T('The sheets that are wired show the newest reading Kleanthis holds, with its source and its age: sensors, wind, air quality and the sea. The wind lines follow the weather model\u2019s grid, point by point, and amber arrows show what the airports measured; rain, cloud and fine particles are the model\u2019s own grid values and are labelled "model", never a gauge. Press "Show the layers one by one" for a key to each sheet: what it shows, its units, its source and what its motion means. The rest say "drawn" \u2014 their picture is made in your browser, not measured \u2014 and the relief under everything is drawn too.',
          'Τα φύλλα που είναι συνδεδεμένα δείχνουν την πιο πρόσφατη μέτρηση που κρατά ο Kleanthis, με την πηγή και την ηλικία της: αισθητήρες, άνεμος, ποιότητα αέρα και θάλασσα. Οι γραμμές του ανέμου ακολουθούν το πλέγμα του μοντέλου καιρού, σημείο προς σημείο, και τα κεχριμπαρένια βέλη δείχνουν τι μέτρησαν τα αεροδρόμια· η βροχή, τα σύννεφα και τα λεπτά σωματίδια είναι τιμές του μοντέλου και γράφουν «μοντέλο», ποτέ μετρητής. Πάτησε «Δείξε τα στρώματα ένα ένα» για το υπόμνημα κάθε φύλλου: τι δείχνει, τις μονάδες του, την πηγή του και τι σημαίνει η κίνησή του. Τα υπόλοιπα λένε «σχεδιασμένο» — η εικόνα τους φτιάχνεται στο πρόγραμμα περιήγησης, δεν μετριέται — και το ανάγλυφο από κάτω είναι επίσης σχεδιασμένο.')));

      root.append(el('p', { class: 'nm-note' },
        T('Press a sheet\u2019s ring button to put it on its own, with what every city has for it and where each reading came from. "Measured only" leaves the sheets that stand on a measurement \u2014 in most hours that is very few of the twelve, and that is the honest picture. A reading that lands travels up the beam from the source that sent it, and the bar across each card shows how far that source is through the wait for its next one.',
          '\u03a0\u03ac\u03c4\u03b7\u03c3\u03b5 \u03c4\u03bf \u03ba\u03bf\u03c5\u03bc\u03c0\u03af \u03bc\u03b5 \u03c4\u03bf\u03bd \u03b4\u03b1\u03ba\u03c4\u03cd\u03bb\u03b9\u03bf \u03c3\u03b5 \u03ad\u03bd\u03b1 \u03c6\u03cd\u03bb\u03bb\u03bf \u03b3\u03b9\u03b1 \u03bd\u03b1 \u03bc\u03b5\u03af\u03bd\u03b5\u03b9 \u03bc\u03cc\u03bd\u03bf \u03b1\u03c5\u03c4\u03cc, \u03bc\u03b5 \u03cc,\u03c4\u03b9 \u03ad\u03c7\u03b5\u03b9 \u03ba\u03ac\u03b8\u03b5 \u03c0\u03cc\u03bb\u03b7 \u03b3\u03b9\u03b1 \u03b1\u03c5\u03c4\u03cc \u03ba\u03b1\u03b9 \u03b1\u03c0\u03cc \u03c0\u03bf\u03cd \u03ae\u03c1\u03b8\u03b5 \u03ba\u03ac\u03b8\u03b5 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b7. \u03a4\u03bf \u00ab\u03bc\u03cc\u03bd\u03bf \u03bc\u03b5\u03c4\u03c1\u03b7\u03bc\u03ad\u03bd\u03b1\u00bb \u03b1\u03c6\u03ae\u03bd\u03b5\u03b9 \u03c4\u03b1 \u03c6\u03cd\u03bb\u03bb\u03b1 \u03c0\u03bf\u03c5 \u03c3\u03c4\u03ad\u03ba\u03bf\u03bd\u03c4\u03b1\u03b9 \u03c3\u03b5 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b7 \u2014 \u03c4\u03b9\u03c2 \u03c0\u03b5\u03c1\u03b9\u03c3\u03c3\u03cc\u03c4\u03b5\u03c1\u03b5\u03c2 \u03ce\u03c1\u03b5\u03c2 \u03b5\u03af\u03bd\u03b1\u03b9 \u03c0\u03bf\u03bb\u03cd \u03bb\u03af\u03b3\u03b1 \u03b1\u03c0\u03cc \u03c4\u03b1 \u03b4\u03ce\u03b4\u03b5\u03ba\u03b1, \u03ba\u03b1\u03b9 \u03b1\u03c5\u03c4\u03ae \u03b5\u03af\u03bd\u03b1\u03b9 \u03b7 \u03b5\u03b9\u03bb\u03b9\u03ba\u03c1\u03b9\u03bd\u03ae\u03c2 \u03b5\u03b9\u03ba\u03cc\u03bd\u03b1. \u039c\u03b9\u03b1 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b7 \u03c0\u03bf\u03c5 \u03c6\u03c4\u03ac\u03bd\u03b5\u03b9 \u03b1\u03bd\u03b5\u03b2\u03b1\u03af\u03bd\u03b5\u03b9 \u03c4\u03b7 \u03b4\u03ad\u03c3\u03bc\u03b7 \u03b1\u03c0\u03cc \u03c4\u03b7\u03bd \u03c0\u03b7\u03b3\u03ae \u03c0\u03bf\u03c5 \u03c4\u03b7\u03bd \u03ad\u03c3\u03c4\u03b5\u03b9\u03bb\u03b5, \u03ba\u03b1\u03b9 \u03b7 \u03bc\u03c0\u03ac\u03c1\u03b1 \u03c3\u03b5 \u03ba\u03ac\u03b8\u03b5 \u03ba\u03ac\u03c1\u03c4\u03b1 \u03b4\u03b5\u03af\u03c7\u03bd\u03b5\u03b9 \u03c0\u03cc\u03c3\u03bf \u03ad\u03c7\u03b5\u03b9 \u03c0\u03c1\u03bf\u03c7\u03c9\u03c1\u03ae\u03c3\u03b5\u03b9 \u03b7 \u03b1\u03bd\u03b1\u03bc\u03bf\u03bd\u03ae \u03b3\u03b9\u03b1 \u03c4\u03b7\u03bd \u03b5\u03c0\u03cc\u03bc\u03b5\u03bd\u03b7.')));

      root.append(el('p', { class: 'nm-note' },
        T('Two marks are added on top of the readings. A ring around a school shows how old that school\u2019s own sensor reading is \u2014 tight when it just arrived, wide and faint after three hours, grey if nothing arrived. Two dots joined by a bar mean two sources measured the same thing in that city and did not agree; the gap is the size of the disagreement, not a place, and the label names the two sources.',
          '\u03a0\u03ac\u03bd\u03c9 \u03b1\u03c0\u03cc \u03c4\u03b9\u03c2 \u03bc\u03b5\u03c4\u03c1\u03ae\u03c3\u03b5\u03b9\u03c2 \u03bc\u03c0\u03b1\u03af\u03bd\u03bf\u03c5\u03bd \u03b4\u03cd\u03bf \u03c3\u03b7\u03bc\u03ac\u03b4\u03b9\u03b1. \u0388\u03bd\u03b1\u03c2 \u03b4\u03b1\u03ba\u03c4\u03cd\u03bb\u03b9\u03bf\u03c2 \u03b3\u03cd\u03c1\u03c9 \u03b1\u03c0\u03cc \u03ad\u03bd\u03b1 \u03c3\u03c7\u03bf\u03bb\u03b5\u03af\u03bf \u03b4\u03b5\u03af\u03c7\u03bd\u03b5\u03b9 \u03c0\u03cc\u03c3\u03bf \u03c0\u03b1\u03bb\u03b9\u03ac \u03b5\u03af\u03bd\u03b1\u03b9 \u03b7 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b7 \u03c4\u03c9\u03bd \u03b4\u03b9\u03ba\u03ce\u03bd \u03c4\u03bf\u03c5 \u03b1\u03b9\u03c3\u03b8\u03b7\u03c4\u03ae\u03c1\u03c9\u03bd \u2014 \u03c3\u03c6\u03b9\u03c7\u03c4\u03cc\u03c2 \u03bc\u03cc\u03bb\u03b9\u03c2 \u03ae\u03c1\u03b8\u03b5, \u03c0\u03bb\u03b1\u03c4\u03cd\u03c2 \u03ba\u03b1\u03b9 \u03be\u03b5\u03b8\u03c9\u03c1\u03b9\u03b1\u03c3\u03bc\u03ad\u03bd\u03bf\u03c2 \u03bc\u03b5\u03c4\u03ac \u03b1\u03c0\u03cc \u03c4\u03c1\u03b5\u03b9\u03c2 \u03ce\u03c1\u03b5\u03c2, \u03b3\u03ba\u03c1\u03af\u03b6\u03bf\u03c2 \u03b1\u03bd \u03b4\u03b5\u03bd \u03ae\u03c1\u03b8\u03b5 \u03c4\u03af\u03c0\u03bf\u03c4\u03b1. \u0394\u03cd\u03bf \u03ba\u03bf\u03c5\u03ba\u03af\u03b4\u03b5\u03c2 \u03c0\u03ac\u03bd\u03c9 \u03c3\u03b5 \u03bc\u03b9\u03b1 \u03bc\u03c0\u03ac\u03c1\u03b1 \u03c3\u03b7\u03bc\u03b1\u03af\u03bd\u03bf\u03c5\u03bd \u03cc\u03c4\u03b9 \u03b4\u03cd\u03bf \u03c0\u03b7\u03b3\u03ad\u03c2 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b1\u03bd \u03c4\u03bf \u03af\u03b4\u03b9\u03bf \u03c0\u03c1\u03ac\u03b3\u03bc\u03b1 \u03c3\u03b5 \u03b5\u03ba\u03b5\u03af\u03bd\u03b7 \u03c4\u03b7\u03bd \u03c0\u03cc\u03bb\u03b7 \u03ba\u03b1\u03b9 \u03b4\u03b5\u03bd \u03c3\u03c5\u03bc\u03c6\u03ce\u03bd\u03b7\u03c3\u03b1\u03bd\u0387 \u03c4\u03bf \u03ba\u03b5\u03bd\u03cc \u03b5\u03af\u03bd\u03b1\u03b9 \u03c4\u03bf \u03bc\u03ad\u03b3\u03b5\u03b8\u03bf\u03c2 \u03c4\u03b7\u03c2 \u03b4\u03b9\u03b1\u03c6\u03bf\u03c1\u03ac\u03c2, \u03cc\u03c7\u03b9 \u03b8\u03ad\u03c3\u03b7, \u03ba\u03b1\u03b9 \u03b7 \u03b5\u03c4\u03b9\u03ba\u03ad\u03c4\u03b1 \u03bb\u03ad\u03b5\u03b9 \u03c4\u03b9\u03c2 \u03b4\u03cd\u03bf \u03c0\u03b7\u03b3\u03ad\u03c2.')));

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
