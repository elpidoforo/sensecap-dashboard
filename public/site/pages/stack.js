/*
  The data stack in 3D (#/stack): every layer Kleanthis holds, from the seabed up to space, stacked over the island and the sea
  around it (the box reaches the coasts of Turkey, Syria and Lebanon), with the source of each layer drawn in the scene beside it. The 3D view is a separate document (/stack.html: three.js needs its own
  canvas and an import map), shown in a same-origin frame, exactly as #/city is. This file builds the frame, forwards the
  language, shows a loading overlay, and an error card with "Try again" if the 3D engine could not start.
  Honest limits: the relief of Cyprus and the sheets marked "example drawing" are drawn rather than fetched, the weather, air
  and waves are model values, the ports are published statistics by quarter, and the seabed is empty until its depth file
  has been imported. The page says so itself; this page says so too, above the frame, so nobody meets the picture without the caveat.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/frame3d.css');

  SC.register('stack', {
    title: ['The data stack in 3D', 'Η στοίβα δεδομένων σε 3D'],
    render(root, ctx) {
      root.append(SC.head({
        title: T('The data stack in 3D', 'Η στοίβα δεδομένων σε 3D'),
        lede: T('Every layer we hold, from the seabed up to the satellites, stacked over Cyprus and the sea around it. Each sheet shows where it comes from: stations beam up from the island, our sensors climb the whole stack, models and published files feed in from the side.',
          'Κάθε στρώμα που κρατάμε, από τον βυθό ως τους δορυφόρους, στοιβαγμένο πάνω από την Κύπρο και τη θάλασσα γύρω της. Κάθε φύλλο δείχνει από πού έρχεται: οι σταθμοί στέλνουν από το νησί, οι αισθητήρες μας ανεβαίνουν όλη τη στοίβα, μοντέλα και δημοσιευμένα αρχεία μπαίνουν από το πλάι.'),
      }));
      root.append(el('p', { class: 'nm-note' },
        T('The sheets that are wired show the newest reading Kleanthis holds, with its source and its age: sensors, wind, air quality and the sea. The wind lines follow the weather model\u2019s grid, point by point, and amber arrows show what the airports measured; rain, cloud and fine particles are the model\u2019s own grid values and are labelled "model", never a gauge. Press "Show the layers one by one" for a key to each sheet: what it shows, its units, its source and what its motion means. The rest say "drawn" \u2014 their picture is made in your browser, not measured \u2014 and the relief under everything is drawn too. The view opens on the whole region; "Cyprus" flies in to the island and "Region" flies back out. The waves are model values with crests that travel the way the model says; the ports show what Eurostat published for a past quarter, not ships now; the seabed stays empty until a depth file has been loaded; and a sheet is left empty wherever its source has no data.',
          'Τα φύλλα που είναι συνδεδεμένα δείχνουν την πιο πρόσφατη μέτρηση που κρατά ο Kleanthis, με την πηγή και την ηλικία της: αισθητήρες, άνεμος, ποιότητα αέρα και θάλασσα. Οι γραμμές του ανέμου ακολουθούν το πλέγμα του μοντέλου καιρού, σημείο προς σημείο, και τα κεχριμπαρένια βέλη δείχνουν τι μέτρησαν τα αεροδρόμια· η βροχή, τα σύννεφα και τα λεπτά σωματίδια είναι τιμές του μοντέλου και γράφουν «μοντέλο», ποτέ μετρητής. Πάτησε «Δείξε τα στρώματα ένα ένα» για το υπόμνημα κάθε φύλλου: τι δείχνει, τις μονάδες του, την πηγή του και τι σημαίνει η κίνησή του. Τα υπόλοιπα λένε «σχεδιασμένο» — η εικόνα τους φτιάχνεται στο πρόγραμμα περιήγησης, δεν μετριέται — και το ανάγλυφο από κάτω είναι επίσης σχεδιασμένο. Η θέα ανοίγει σε όλη την περιοχή· το "Κύπρος" πετά κοντά στο νησί και το "Περιοχή" γυρίζει πίσω. Τα κύματα είναι τιμές μοντέλου, με κορυφές που ταξιδεύουν όπως λέει το μοντέλο· τα λιμάνια δείχνουν ό,τι δημοσίευσε η Eurostat για ένα περασμένο τρίμηνο, όχι πλοία τώρα· ο βυθός μένει άδειος μέχρι να φορτωθεί αρχείο βάθους· και ένα φύλλο μένει άδειο όπου η πηγή του δεν έχει δεδομένα.')));

      root.append(el('p', { class: 'nm-note' },
        T('The stack holds thirty sheets and opens on a main set of about a dozen; the others wait in the list, and "ALL" switches every one on. A sheet is fetched only when it is first switched on. Press a sheet\u2019s ring button to put it on its own, with what it holds and where each number came from. "Measured only" leaves the sheets that stand on a measurement \u2014 in most hours that is very few of the thirty, and that is the honest picture. The tour shows every sheet in turn with its key; press anything to take over. A census, a list of past earthquakes or a past year is drawn standing still (a past period may be replayed with its date on the sheet); only what is live, delayed or planned for this minute keeps moving.',
          'Η στοίβα έχει τριάντα φύλλα και ανοίγει με ένα βασικό σύνολο περίπου δώδεκα· τα υπόλοιπα περιμένουν στη λίστα, και το "ΟΛΑ" τα ανάβει όλα. Ένα φύλλο φορτώνεται μόνο όταν το ανάψεις για πρώτη φορά. Πάτησε το κουμπί με τον δακτύλιο σε ένα φύλλο για να μείνει μόνο αυτό, με ό,τι περιέχει και από πού ήρθε κάθε αριθμός. Το "μόνο μετρημένα" αφήνει τα φύλλα που στηρίζονται σε μέτρηση \u2014 τις περισσότερες ώρες αυτά είναι πολύ λίγα από τα τριάντα, και αυτή είναι η ειλικρινής εικόνα. Η ξενάγηση δείχνει κάθε φύλλο με τη σειρά μαζί με το υπόμνημά του· πάτησε οτιδήποτε για να αναλάβεις. Μια απογραφή, ένας κατάλογος παλιών σεισμών ή μια περασμένη χρονιά σχεδιάζονται ακίνητα (μια περασμένη περίοδος μπορεί να ξαναπαιχτεί με την ημερομηνία της πάνω στο φύλλο)· μόνο ό,τι είναι ζωντανό, καθυστερημένο ή προγραμματισμένο για αυτό το λεπτό συνεχίζει να κινείται.')));

      root.append(el('p', { class: 'nm-note' },
        T('Two marks are added on top of the readings. A ring around a school shows how old that school\u2019s own sensor reading is \u2014 tight when it just arrived, wide and faint after three hours, grey if nothing arrived. Two dots joined by a bar mean two sources measured the same thing in that city and did not agree; the gap is the size of the disagreement, not a place, and the label names the two sources.',
          '\u03a0\u03ac\u03bd\u03c9 \u03b1\u03c0\u03cc \u03c4\u03b9\u03c2 \u03bc\u03b5\u03c4\u03c1\u03ae\u03c3\u03b5\u03b9\u03c2 \u03bc\u03c0\u03b1\u03af\u03bd\u03bf\u03c5\u03bd \u03b4\u03cd\u03bf \u03c3\u03b7\u03bc\u03ac\u03b4\u03b9\u03b1. \u0388\u03bd\u03b1\u03c2 \u03b4\u03b1\u03ba\u03c4\u03cd\u03bb\u03b9\u03bf\u03c2 \u03b3\u03cd\u03c1\u03c9 \u03b1\u03c0\u03cc \u03ad\u03bd\u03b1 \u03c3\u03c7\u03bf\u03bb\u03b5\u03af\u03bf \u03b4\u03b5\u03af\u03c7\u03bd\u03b5\u03b9 \u03c0\u03cc\u03c3\u03bf \u03c0\u03b1\u03bb\u03b9\u03ac \u03b5\u03af\u03bd\u03b1\u03b9 \u03b7 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b7 \u03c4\u03c9\u03bd \u03b4\u03b9\u03ba\u03ce\u03bd \u03c4\u03bf\u03c5 \u03b1\u03b9\u03c3\u03b8\u03b7\u03c4\u03ae\u03c1\u03c9\u03bd \u2014 \u03c3\u03c6\u03b9\u03c7\u03c4\u03cc\u03c2 \u03bc\u03cc\u03bb\u03b9\u03c2 \u03ae\u03c1\u03b8\u03b5, \u03c0\u03bb\u03b1\u03c4\u03cd\u03c2 \u03ba\u03b1\u03b9 \u03be\u03b5\u03b8\u03c9\u03c1\u03b9\u03b1\u03c3\u03bc\u03ad\u03bd\u03bf\u03c2 \u03bc\u03b5\u03c4\u03ac \u03b1\u03c0\u03cc \u03c4\u03c1\u03b5\u03b9\u03c2 \u03ce\u03c1\u03b5\u03c2, \u03b3\u03ba\u03c1\u03af\u03b6\u03bf\u03c2 \u03b1\u03bd \u03b4\u03b5\u03bd \u03ae\u03c1\u03b8\u03b5 \u03c4\u03af\u03c0\u03bf\u03c4\u03b1. \u0394\u03cd\u03bf \u03ba\u03bf\u03c5\u03ba\u03af\u03b4\u03b5\u03c2 \u03c0\u03ac\u03bd\u03c9 \u03c3\u03b5 \u03bc\u03b9\u03b1 \u03bc\u03c0\u03ac\u03c1\u03b1 \u03c3\u03b7\u03bc\u03b1\u03af\u03bd\u03bf\u03c5\u03bd \u03cc\u03c4\u03b9 \u03b4\u03cd\u03bf \u03c0\u03b7\u03b3\u03ad\u03c2 \u03bc\u03ad\u03c4\u03c1\u03b7\u03c3\u03b1\u03bd \u03c4\u03bf \u03af\u03b4\u03b9\u03bf \u03c0\u03c1\u03ac\u03b3\u03bc\u03b1 \u03c3\u03b5 \u03b5\u03ba\u03b5\u03af\u03bd\u03b7 \u03c4\u03b7\u03bd \u03c0\u03cc\u03bb\u03b7 \u03ba\u03b1\u03b9 \u03b4\u03b5\u03bd \u03c3\u03c5\u03bc\u03c6\u03ce\u03bd\u03b7\u03c3\u03b1\u03bd\u0387 \u03c4\u03bf \u03ba\u03b5\u03bd\u03cc \u03b5\u03af\u03bd\u03b1\u03b9 \u03c4\u03bf \u03bc\u03ad\u03b3\u03b5\u03b8\u03bf\u03c2 \u03c4\u03b7\u03c2 \u03b4\u03b9\u03b1\u03c6\u03bf\u03c1\u03ac\u03c2, \u03cc\u03c7\u03b9 \u03b8\u03ad\u03c3\u03b7, \u03ba\u03b1\u03b9 \u03b7 \u03b5\u03c4\u03b9\u03ba\u03ad\u03c4\u03b1 \u03bb\u03ad\u03b5\u03b9 \u03c4\u03b9\u03c2 \u03b4\u03cd\u03bf \u03c0\u03b7\u03b3\u03ad\u03c2.')));

      const params = new URLSearchParams();
      params.set('embed', '1');
      const wantSolo = /[?&]solo=([a-z0-9]+)/.exec(location.hash);   // a link from the Data Vortex lifts that sheet out of the stack
      if (wantSolo) params.set('solo', wantSolo[1]);
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
        T('Nothing here draws a person. No road vehicle is drawn where it is now: the buses are worked out from the timetable (nobody observed them), and our own sensor vehicles are a replay at least two hours old, rounded to about a kilometre, with no name and no school. Aeroplanes are drawn as arrows with no flight name and no aircraft number: places are rounded, nothing is saved, and they are only a picture on this page, never given to the AI. No ship is drawn: the ports show published statistics by quarter. The residents and their age are the census of 1 October 2021; density is not shown because no boundary file joins to the census areas yet.',
          'Τίποτα εδώ δεν σχεδιάζει άνθρωπο. Κανένα όχημα του δρόμου δεν σχεδιάζεται εκεί που βρίσκεται τώρα: τα λεωφορεία υπολογίζονται από το δρομολόγιο (κανείς δεν τα παρατήρησε), και τα δικά μας οχήματα με αισθητήρες είναι μια επανάληψη τουλάχιστον δύο ωρών πριν, στρογγυλεμένη περίπου στο χιλιόμετρο, χωρίς όνομα και χωρίς σχολείο. Τα αεροπλάνα σχεδιάζονται ως βέλη χωρίς όνομα πτήσης και χωρίς αριθμό αεροσκάφους: οι θέσεις είναι στρογγυλεμένες, τίποτα δεν αποθηκεύεται, και είναι μόνο μια εικόνα σε αυτή τη σελίδα, που δεν δίνεται ποτέ στην τεχνητή νοημοσύνη. Δεν σχεδιάζεται κανένα πλοίο: τα λιμάνια δείχνουν δημοσιευμένα στατιστικά ανά τρίμηνο. Οι κάτοικοι και η ηλικία τους είναι η απογραφή της 1ης Οκτωβρίου 2021· η πυκνότητα δεν φαίνεται, γιατί κανένα αρχείο ορίων δεν ενώνεται ακόμη με τις περιοχές της απογραφής.')));

      return () => { timers.splice(0).forEach(clearTimeout); if (frame) frame.src = 'about:blank'; };
    },
  });
}());
