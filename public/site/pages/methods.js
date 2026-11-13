/*
  Methods library: ten short cards on measuring well, for students. Each card has a tiny worked example whose numbers are
  made up and labelled as such (they are never mixed with real readings), and a link to the tool where the idea matters, shown
  only when that page exists on this site (SC.ready). No data is read and no text is typed on this page.
  #/methods/<id> opens the page at one card (ids: average-median, range-spread, why-differ, calibration, indoor-outdoor,
  sample-size, correlation, rounding-units, model-says, honest-chart).
*/
(function () {
  'use strict';
  const t = SC.t, el = SC.el;
  const kit = () => (window.TK4 ? Promise.resolve(window.TK4) : (window.__tk4p = window.__tk4p || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/tk4-kit.js?v=1';
    s.onload = () => res(window.TK4); s.onerror = () => { window.__tk4p = null; s.remove(); rej(new Error('kit')); }; document.head.append(s);
  })));

  // Every text is [English, Greek]. ex: the lines of the worked example (made-up numbers). tool: [page id, what follows it, link words].
  const CARDS = [
    { id: 'average-median', title: ['Average and median', 'Μέσος όρος και διάμεσος'],
      body: [['The average adds all the readings and divides by how many there are. The median is the middle reading when you put them in order.', 'Ο μέσος όρος προσθέτει όλες τις μετρήσεις και διαιρεί με το πλήθος τους. Η διάμεσος είναι η μεσαία μέτρηση όταν τις βάλεις στη σειρά.'],
        ['One strange reading pulls the average a long way but hardly moves the median. If the two are far apart, look for the strange reading.', 'Μία παράξενη μέτρηση τραβά πολύ τον μέσο όρο αλλά σχεδόν δεν κουνά τη διάμεσο. Αν οι δύο απέχουν πολύ, ψάξε την παράξενη μέτρηση.']],
      ex: [['Five CO₂ readings: 420, 430, 440, 450, 1200 ppm', 'Πέντε μετρήσεις CO₂: 420, 430, 440, 450, 1200 ppm'], ['Average = 2940 ÷ 5 = 588 ppm', 'Μέσος όρος = 2940 ÷ 5 = 588 ppm'], ['Median = the middle one = 440 ppm', 'Διάμεσος = η μεσαία = 440 ppm'], ['The single 1200 moved the average by about 150 ppm.', 'Το ένα 1200 μετακίνησε τον μέσο όρο περίπου 150 ppm.']],
      tool: ['claims', '?v=co2&a=larnaka&n=600&op=lower&per=day', ['Check a claim over the saved day (it uses averages)', 'Έλεγξε έναν ισχυρισμό για όλη τη μέρα (χρησιμοποιεί μέσους όρους)']] },
    { id: 'range-spread', title: ['Range and spread', 'Εύρος και διασπορά'],
      body: [['The range is the highest reading minus the lowest. It tells you how much the readings move around.', 'Το εύρος είναι η μεγαλύτερη μέτρηση μείον τη μικρότερη. Σου λέει πόσο κουνιούνται οι μετρήσεις.'],
        ['Two days can have the same average and feel completely different. Always give the spread next to the average.', 'Δύο μέρες μπορεί να έχουν τον ίδιο μέσο όρο και να είναι εντελώς διαφορετικές. Δίνε πάντα το εύρος δίπλα στον μέσο όρο.']],
      ex: [['Day A: 22, 23, 24, 25, 26 °C → average 24, range 4', 'Μέρα Α: 22, 23, 24, 25, 26 °C → μέσος όρος 24, εύρος 4'], ['Day B: 14, 19, 24, 29, 34 °C → average 24, range 20', 'Μέρα Β: 14, 19, 24, 29, 34 °C → μέσος όρος 24, εύρος 20'], ['Same average. Very different days.', 'Ίδιος μέσος όρος. Πολύ διαφορετικές μέρες.']],
      tool: ['layers', '', ['See the spread between sources in Data layers', 'Δες το εύρος ανάμεσα στις πηγές στα Στρώματα δεδομένων']] },
    { id: 'why-differ', title: ['Why two sensors differ', 'Γιατί διαφέρουν δύο αισθητήρες'],
      body: [['Two sensors almost never show exactly the same number. They stand in different spots, in sun or shade, at different heights, and they report at different minutes.', 'Δύο αισθητήρες σχεδόν ποτέ δεν δείχνουν ακριβώς τον ίδιο αριθμό. Βρίσκονται σε διαφορετικά σημεία, σε ήλιο ή σκιά, σε διαφορετικό ύψος, και στέλνουν σε διαφορετικά λεπτά.'],
        ['Every sensor also has its own small error. So a gap between two places only means something when it is bigger than the gap you get between two sensors in the same place.', 'Κάθε αισθητήρας έχει και το δικό του μικρό σφάλμα. Άρα μια διαφορά ανάμεσα σε δύο τόπους σημαίνει κάτι μόνο όταν είναι μεγαλύτερη από τη διαφορά που βλέπεις ανάμεσα σε δύο αισθητήρες στο ίδιο μέρος.']],
      ex: [['Two sensors side by side on one desk: 24.1 and 24.9 °C (gap 0.8)', 'Δύο αισθητήρες δίπλα δίπλα σε ένα θρανίο: 24,1 και 24,9 °C (διαφορά 0,8)'], ['City X reads 25.0 °C, city Y reads 25.5 °C (gap 0.5)', 'Η πόλη Χ δείχνει 25,0 °C, η πόλη Ψ δείχνει 25,5 °C (διαφορά 0,5)'], ['0.5 is smaller than 0.8: we cannot say Y is warmer.', 'Το 0,5 είναι μικρότερο από το 0,8: δεν μπορούμε να πούμε ότι η Ψ είναι πιο ζεστή.']],
      tool: ['claims', '', ['Claim check answers “cannot tell” in exactly this case', 'Ο Έλεγχος ισχυρισμού απαντά «δεν μπορούμε να πούμε» ακριβώς σε αυτή την περίπτωση']] },
    { id: 'calibration', title: ['Calibration', 'Βαθμονόμηση'],
      body: [['To calibrate a sensor is to compare it with a trusted instrument and write down how far off it is.', 'Βαθμονομώ έναν αισθητήρα σημαίνει τον συγκρίνω με ένα όργανο εμπιστοσύνης και γράφω πόσο έξω πέφτει.'],
        ['A low-cost sensor can be steadily too high or too low. If you know by how much, you can correct for it. If nobody checked, treat its exact number with care and trust its changes more than its level.', 'Ένας αισθητήρας χαμηλού κόστους μπορεί να δείχνει σταθερά λίγο πάνω ή λίγο κάτω. Αν ξέρεις πόσο, μπορείς να το διορθώσεις. Αν δεν τον έλεγξε κανείς, πρόσεχε τον ακριβή αριθμό του και εμπιστεύσου περισσότερο τις αλλαγές του παρά το επίπεδό του.']],
      ex: [['Next to a trusted thermometer for three hours:', 'Δίπλα σε θερμόμετρο εμπιστοσύνης για τρεις ώρες:'], ['trusted 20.0, 22.0, 25.0 °C · ours 21.1, 22.9, 26.0 °C', 'εμπιστοσύνης 20,0 · 22,0 · 25,0 °C · δικό μας 21,1 · 22,9 · 26,0 °C'], ['Ours is about 1 °C too high each time, so we subtract 1.', 'Το δικό μας δείχνει περίπου 1 °C πάνω κάθε φορά, άρα αφαιρούμε 1.']],
      tool: ['guides', '', ['Sensor guides: what each sensor measures and its common mistakes', 'Οδηγοί αισθητήρων: τι μετρά κάθε αισθητήρας και τα συνηθισμένα λάθη του']] },
    { id: 'indoor-outdoor', title: ['Indoor against outdoor', 'Μέσα απέναντι σε έξω'],
      body: [['Air inside a room or a vehicle is its own small world: people breathe, windows close, the sun heats the glass.', 'Ο αέρας μέσα σε ένα δωμάτιο ή ένα όχημα είναι ένας δικός του μικρός κόσμος: άνθρωποι αναπνέουν, παράθυρα κλείνουν, ο ήλιος ζεσταίνει το τζάμι.'],
        ['So an indoor reading and an outdoor reading do not measure the same thing. Never put them in one comparison as if they did. Compare indoor with indoor and outdoor with outdoor.', 'Άρα μια μέτρηση μέσα και μια μέτρηση έξω δεν μετρούν το ίδιο πράγμα. Μην τις βάζεις ποτέ στην ίδια σύγκριση σαν να το μετρούσαν. Σύγκρινε μέσα με μέσα και έξω με έξω.']],
      ex: [['Inside a full bus: CO₂ 1100 ppm', 'Μέσα σε γεμάτο λεωφορείο: CO₂ 1100 ppm'], ['Outdoors on the same street: CO₂ 420 ppm', 'Έξω στον ίδιο δρόμο: CO₂ 420 ppm'], ['Wrong: “this street has 1100 ppm”. Right: “the air inside the bus had 1100 ppm”.', 'Λάθος: «αυτός ο δρόμος έχει 1100 ppm». Σωστό: «ο αέρας μέσα στο λεωφορείο είχε 1100 ppm».']],
      tool: ['claims', '?v=co2&a=larnaka&b=paphos&op=higher', ['See how Claim check keeps the kinds apart', 'Δες πώς ο Έλεγχος ισχυρισμού κρατά τα είδη χωριστά']] },
    { id: 'sample-size', title: ['Sample size and time of day', 'Μέγεθος δείγματος και ώρα της μέρας'],
      body: [['One reading is a snapshot. A handful is a hint. Many readings, on several days, begin to be evidence.', 'Μία μέτρηση είναι ένα στιγμιότυπο. Λίγες είναι μια ένδειξη. Πολλές μετρήσεις, σε αρκετές μέρες, αρχίζουν να είναι στοιχείο.'],
        ['The hour matters too. Air is cooler at dawn and warmer after midday, so compare the same hours. A morning in one city against an afternoon in another tells you about the clock, not the cities.', 'Μετράει και η ώρα. Ο αέρας είναι πιο δροσερός την αυγή και πιο ζεστός μετά το μεσημέρι, άρα σύγκρινε τις ίδιες ώρες. Ένα πρωί σε μια πόλη απέναντι σε ένα απόγευμα σε άλλη σου μιλά για το ρολόι, όχι για τις πόλεις.']],
      ex: [['City X at 08:00: 18 °C. City Y at 14:00: 27 °C.', 'Πόλη Χ στις 08:00: 18 °C. Πόλη Ψ στις 14:00: 27 °C.'], ['Is Y 9 °C warmer? We cannot say: the hours differ.', 'Είναι η Ψ 9 °C πιο ζεστή; Δεν μπορούμε να πούμε: οι ώρες διαφέρουν.'], ['Both at 14:00: X 26 °C, Y 27 °C. Now the gap is 1 °C.', 'Και οι δύο στις 14:00: Χ 26 °C, Ψ 27 °C. Τώρα η διαφορά είναι 1 °C.']],
      tool: ['notebook', '', ['Field notebook: collect many entries, at the same hour', 'Τετράδιο πεδίου: μάζεψε πολλές καταγραφές, την ίδια ώρα']] },
    { id: 'correlation', title: ['Correlation is not cause', 'Η συσχέτιση δεν είναι αιτία'],
      body: [['When two things rise and fall together we say they are correlated. That alone does not show that one makes the other happen.', 'Όταν δύο πράγματα ανεβαίνουν και πέφτουν μαζί, λέμε ότι συσχετίζονται. Αυτό μόνο του δεν δείχνει ότι το ένα προκαλεί το άλλο.'],
        ['Often a third thing moves both. Before you write “because”, ask what else changed at the same time, and whether it could be chance.', 'Συχνά ένα τρίτο πράγμα κινεί και τα δύο. Πριν γράψεις «επειδή», ρώτα τι άλλο άλλαξε την ίδια στιγμή, και αν θα μπορούσε να είναι τύχη.']],
      ex: [['On days when more ice cream is sold, the sea is also warmer.', 'Τις μέρες που πουλιέται περισσότερο παγωτό, η θάλασσα είναι επίσης πιο ζεστή.'], ['Ice cream does not heat the sea. Summer sun does both.', 'Το παγωτό δεν ζεσταίνει τη θάλασσα. Ο καλοκαιρινός ήλιος κάνει και τα δύο.'], ['Write: “they went together”. Not: “one caused the other”.', 'Γράψε: «πήγαιναν μαζί». Όχι: «το ένα προκάλεσε το άλλο».']],
      tool: ['experiment', '', ['Plan an experiment that changes only one thing', 'Σχεδίασε ένα πείραμα που αλλάζει μόνο ένα πράγμα']] },
    { id: 'rounding-units', title: ['Rounding and units', 'Στρογγυλοποίηση και μονάδες'],
      body: [['A number without its unit means nothing: 25 what? Always write the unit, and check that two numbers use the same one before you compare them.', 'Ένας αριθμός χωρίς τη μονάδα του δεν σημαίνει τίποτα: 25 τι; Γράφε πάντα τη μονάδα, και έλεγξε ότι δύο αριθμοί έχουν την ίδια πριν τους συγκρίνεις.'],
        ['Do not show more digits than the sensor can really tell apart. Extra decimals look precise but are just noise.', 'Μη δείχνεις περισσότερα ψηφία από όσα μπορεί πραγματικά να ξεχωρίσει ο αισθητήρας. Τα επιπλέον δεκαδικά φαίνονται ακριβή αλλά είναι απλώς θόρυβος.']],
      ex: [['Wind: 5 m/s and 18 km/h. Which is stronger?', 'Άνεμος: 5 m/s και 18 km/h. Ποιος είναι πιο δυνατός;'], ['5 m/s × 3.6 = 18 km/h. They are the same wind.', '5 m/s × 3,6 = 18 km/h. Είναι ο ίδιος άνεμος.'], ['A sensor good to ±0.5 °C that shows 23.4871 °C: write 23.5 °C.', 'Αισθητήρας με ακρίβεια ±0,5 °C που δείχνει 23,4871 °C: γράψε 23,5 °C.']],
      tool: ['weather', '', ['Met Office record: read the units on every station', 'Μετεωρολογικό αρχείο: διάβασε τις μονάδες σε κάθε σταθμό']] },
    { id: 'model-says', title: ['What “the model says” means', 'Τι σημαίνει «το μοντέλο λέει»'],
      body: [['A model is a calculation. A computer takes measurements from many places and the rules of physics, and works out a likely value for a place where nobody measured.', 'Το μοντέλο είναι ένας υπολογισμός. Ένας υπολογιστής παίρνει μετρήσεις από πολλά μέρη και τους κανόνες της φυσικής, και υπολογίζει μια πιθανή τιμή για ένα μέρος όπου κανείς δεν μέτρησε.'],
        ['That is very useful, and it is not a measurement. A model gives one value for a wide square of land, so it can miss what happens on your street. Say “the model estimates”, not “it measured”.', 'Αυτό είναι πολύ χρήσιμο, και δεν είναι μέτρηση. Το μοντέλο δίνει μία τιμή για ένα πλατύ τετράγωνο γης, άρα μπορεί να χάσει ό,τι συμβαίνει στον δρόμο σου. Λέγε «το μοντέλο εκτιμά», όχι «μέτρησε».']],
      ex: [['Model for the whole city square: PM10 = 30 µg/m³', 'Μοντέλο για όλο το τετράγωνο της πόλης: PM10 = 30 µg/m³'], ['A sensor beside a building site in that square: 85 µg/m³', 'Αισθητήρας δίπλα σε εργοτάξιο μέσα στο τετράγωνο: 85 µg/m³'], ['Both can be right: one is the wide picture, one is one spot.', 'Μπορεί να έχουν και οι δύο δίκιο: το ένα είναι η μεγάλη εικόνα, το άλλο ένα σημείο.']],
      tool: ['layers', '', ['Data layers labels every source: station, sensor or model', 'Τα Στρώματα δεδομένων γράφουν για κάθε πηγή: σταθμός, αισθητήρας ή μοντέλο']] },
    { id: 'honest-chart', title: ['Reading a chart honestly', 'Διαβάζω ένα διάγραμμα με ειλικρίνεια'],
      body: [['Before you look at the line, read the axes: what is measured, in which unit, over what time, and where the upright axis starts.', 'Πριν κοιτάξεις τη γραμμή, διάβασε τους άξονες: τι μετριέται, σε ποια μονάδα, σε ποιο χρονικό διάστημα, και από πού ξεκινά ο κάθετος άξονας.'],
        ['An axis that does not start at zero makes small changes look large. Gaps in the line are missing data, not zero. A line between two points is a guess about what happened in between.', 'Ένας άξονας που δεν ξεκινά από το μηδέν κάνει τις μικρές αλλαγές να φαίνονται μεγάλες. Τα κενά στη γραμμή είναι δεδομένα που λείπουν, όχι μηδέν. Μια γραμμή ανάμεσα σε δύο σημεία είναι υπόθεση για το τι έγινε ενδιάμεσα.']],
      ex: [['Humidity goes from 60 % to 63 %.', 'Η υγρασία πηγαίνει από 60 % σε 63 %.'], ['On an axis from 0 to 100 the line is almost flat.', 'Σε άξονα από 0 έως 100 η γραμμή είναι σχεδόν επίπεδη.'], ['On an axis from 59 to 64 it looks like a cliff. The change is still 3.', 'Σε άξονα από 59 έως 64 μοιάζει με γκρεμό. Η αλλαγή είναι ακόμη 3.']],
      tool: ['explore', '', ['Explore data: check the axes of a real chart', 'Εξερεύνηση: έλεγξε τους άξονες ενός πραγματικού διαγράμματος']] },
  ];
  const T2 = (p) => t(p[0], p[1]);

  SC.register('methods', {
    title: ['Methods library', 'Βιβλιοθήκη μεθόδων'],
    render(root, ctx) {
      SC.css('/site/pages/tk4.css');
      root.append(SC.head({
        title: t('Methods library', 'Βιβλιοθήκη μεθόδων'),
        lede: t('Ten short cards on measuring well. Each has a tiny worked example with made-up numbers, and a link to the tool where the idea matters.',
          'Δέκα σύντομες κάρτες για το πώς μετράμε σωστά. Καθεμία έχει ένα μικρό λυμένο παράδειγμα με φτιαχτούς αριθμούς και έναν σύνδεσμο προς το εργαλείο όπου η ιδέα μετράει.'),
        help: ['Read a card when a tool uses a word you are not sure about, such as median, spread or model. The numbers inside the dashed boxes are made up to explain the idea. They are not readings from our sensors. The link under a card opens the tool where you can try the idea on real data.',
          'Διάβασε μια κάρτα όταν ένα εργαλείο χρησιμοποιεί μια λέξη για την οποία δεν είσαι σίγουρος, όπως διάμεσος, εύρος ή μοντέλο. Οι αριθμοί μέσα στα πλαίσια με τη διακεκομμένη γραμμή είναι φτιαχτοί, για να εξηγήσουν την ιδέα. Δεν είναι μετρήσεις από τους αισθητήρες μας. Ο σύνδεσμος κάτω από την κάρτα ανοίγει το εργαλείο όπου μπορείς να δοκιμάσεις την ιδέα σε πραγματικά δεδομένα.'],
        tags: [{ text: t('Examples use made-up numbers', 'Τα παραδείγματα έχουν φτιαχτούς αριθμούς'), cls: 'demo' }],
      }));
      const host = el('div', { class: 'k4 k4-methods' }, el('div', { class: 'loading' }, t('Loading', 'Φόρτωση')));
      root.append(host);
      let alive = true;
      kit().then((K) => {
        if (!alive) return;
        const card = (C, i) => el('article', { class: 'k4-panel k4-card', id: 'k4-m-' + C.id, tabindex: '-1' },
          el('span', { class: 'k4-n' }, t('Card ', 'Κάρτα ') + (i + 1)),
          el('h2', null, T2(C.title)),
          C.body.map((p) => el('p', null, T2(p))),
          el('div', { class: 'k4-ex' }, el('b', null, t('Example with made-up numbers (not real readings)', 'Παράδειγμα με φτιαχτούς αριθμούς (όχι πραγματικές μετρήσεις)')), C.ex.map((line) => el('code', null, T2(line)))),
          el('div', { class: 'k4-links k4-noprint' }, K.toolLink(C.tool[0], C.tool[1], T2(C.tool[2]))));
        const jump = (id, focus) => {
          const n = host.querySelector('#k4-m-' + id); if (!n) return;
          host.querySelectorAll('.k4-card.hit').forEach((x) => x.classList.remove('hit'));
          n.classList.add('hit'); n.scrollIntoView({ block: 'start' }); if (focus) n.focus({ preventScroll: true });
        };
        host.replaceChildren(
          el('div', { class: 'k4-panel' },
            el('div', { class: 'k4-top' }, el('h2', null, t('Find a card', 'Βρες μια κάρτα')), el('span', { class: 'k4-noprint' }, K.printBtn(t('Print the cards', 'Εκτύπωσε τις κάρτες')))),
            el('p', { class: 'k4-fine' }, t('Every example on this page uses numbers that were made up to explain an idea. Real readings always carry a time and the layer they came from; these do not, on purpose.', 'Κάθε παράδειγμα σε αυτή τη σελίδα έχει αριθμούς που φτιάχτηκαν για να εξηγήσουν μια ιδέα. Οι πραγματικές μετρήσεις έχουν πάντα ώρα και το στρώμα από όπου ήρθαν· αυτές δεν έχουν, επίτηδες.')),
            el('nav', { class: 'k4-toc k4-noprint', 'aria-label': t('Cards', 'Κάρτες') }, CARDS.map((C, i) => el('a', { href: '#/methods/' + C.id, onclick: (e) => { e.preventDefault(); jump(C.id, true); } }, (i + 1) + '. ' + T2(C.title))))),
          el('div', { class: 'k4-cards' }, CARDS.map(card)),
          el('div', { class: 'k4-links k4-noprint' }, K.toolLink('lessons', '', t('Use these ideas in a lesson', 'Χρησιμοποίησε αυτές τις ιδέες σε ένα μάθημα'))));
        const want = ctx.args && ctx.args[0];
        if (want && CARDS.some((C) => C.id === want)) setTimeout(() => alive && jump(want, false), 60);
      }).catch(() => { if (alive) host.replaceChildren(el('div', { class: 'err', role: 'alert' }, t('This page could not be loaded. Reload and try again.', 'Η σελίδα δεν φορτώθηκε. Κάνε ανανέωση και δοκίμασε ξανά.'))); });
      document.body.classList.add('k4-on');
      return () => { alive = false; document.body.classList.remove('k4-on'); };
    },
  });
})();
