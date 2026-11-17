/*
  Lesson builder: a teacher (or a team) turns a question into a field lesson - the class goes outside, measures
  something, and comes back to check it against what Kleanthis holds. The plan prints on three A4 pages: the lesson,
  the assessment, and the recording sheet the class takes outside.

  Everything is a choice, not free typing: the questions, the stops, the measures, the indicators and the traps are
  banks of text written here in both languages. The one free line is the aim in the teacher's own words, which passes
  the site's privacy check. The whole plan lives in the link after the #, so nothing about a class is stored here.

  The engine (steps, link, print, the balance of learning types, the plan assistant) is in lb-core.js.
  Link: #/lessonbuilder?q=heat&y=12&d=2x45&stops=yard-shade.street&meas=temperature.surface&share=board&aim=...
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const core = () => (SC.LB ? Promise.resolve(SC.LB) : (window.__lbp = window.__lbp || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/lb-core.js?v=1';
    s.onload = () => (SC.LB ? res(SC.LB) : rej(new Error('core'))); s.onerror = () => { window.__lbp = null; s.remove(); rej(new Error('core')); };
    document.head.append(s);
  })));

  /* ---------- the banks ---------- */
  // A question carries everything that follows from it: what it measures, where the class stands, which pages of the
  // platform it opens, which method cards guard it, and the indicators it can honestly claim.
  const QUESTIONS = [
    { id: 'heat', label: ['Is our yard hotter than the street?', 'Είναι η αυλή μας πιο ζεστή από τον δρόμο;'],
      aim: ['Pupils measure air temperature at several places around the school, compare what they measured with what the nearest official station reports, and say why the two differ.',
        'Οι μαθητές μετρούν τη θερμοκρασία του αέρα σε διάφορα σημεία γύρω από το σχολείο, τη συγκρίνουν με όσα αναφέρει ο πλησιέστερος επίσημος σταθμός και εξηγούν γιατί διαφέρουν.'],
      meas: ['temperature', 'surface', 'shade'], stops: ['yard-shade', 'yard-open', 'street'],
      pages: ['board', 'layers', 'weather'], traps: ['indoor-outdoor', 'sample-size', 'correlation'],
      ind: ['record', 'range', 'differ', 'claim'] },
    { id: 'co2', label: ['Does our classroom get stuffy by the end of the lesson?', 'Μπαίνει αποπνικτικά η τάξη μας στο τέλος του μαθήματος;'],
      aim: ['Pupils watch the carbon dioxide in their own room across a lesson, try one change to the room, and judge whether the change did anything.',
        'Οι μαθητές παρακολουθούν το διοξείδιο του άνθρακα στην τάξη τους σε ένα μάθημα, δοκιμάζουν μία αλλαγή στον χώρο και κρίνουν αν η αλλαγή έκανε κάτι.'],
      meas: ['co2', 'temperature', 'people'], stops: ['classroom', 'corridor', 'yard-open'],
      pages: ['board', 'vent', 'explore'], traps: ['sample-size', 'calibration', 'correlation'],
      ind: ['record', 'change', 'claim', 'method'] },
    { id: 'agree', label: ['Do our sensor, the station and the model agree?', 'Συμφωνούν ο αισθητήρας μας, ο σταθμός και το μοντέλο;'],
      aim: ['Pupils collect the same measurement from three kinds of source at the same moment, work out the spread, and say which differences matter.',
        'Οι μαθητές παίρνουν την ίδια μέτρηση από τρία είδη πηγών την ίδια στιγμή, υπολογίζουν το εύρος και λένε ποιες διαφορές μετρούν.'],
      meas: ['temperature', 'humidity'], stops: ['yard-open', 'classroom'],
      pages: ['layers', 'health', 'stack'], traps: ['indoor-outdoor', 'model-says', 'rounding-units'],
      ind: ['record', 'range', 'differ', 'method'] },
    { id: 'traffic', label: ['Can we see the traffic in the air?', 'Φαίνεται η κίνηση στον αέρα;'],
      aim: ['Pupils count vehicles at the gate while the sensors read the air, then test honestly whether the two are related or only happened together.',
        'Οι μαθητές μετρούν οχήματα στην πύλη ενώ οι αισθητήρες διαβάζουν τον αέρα, και μετά ελέγχουν με ειλικρίνεια αν τα δύο σχετίζονται ή απλώς συνέβησαν μαζί.'],
      meas: ['traffic', 'pm25', 'sound'], stops: ['street', 'yard-open', 'busstop'],
      pages: ['board', 'layers', 'claims'], traps: ['correlation', 'sample-size', 'honest-chart'],
      ind: ['record', 'claim', 'differ', 'method'] },
    { id: 'water', label: ['How much water is left in our dams?', 'Πόσο νερό έχει μείνει στα φράγματά μας;'],
      aim: ['Pupils read the published reservoir record, work out what this year looks like beside earlier years, and write what they can and cannot conclude.',
        'Οι μαθητές διαβάζουν το δημοσιευμένο αρχείο των φραγμάτων, βλέπουν πώς στέκεται η φετινή χρονιά δίπλα σε προηγούμενες και γράφουν τι μπορούν και τι δεν μπορούν να συμπεράνουν.'],
      meas: ['rain-felt'], stops: ['classroom'],
      pages: ['fieldwork', 'archive', 'explore'], traps: ['honest-chart', 'rounding-units', 'average-median'],
      ind: ['record', 'range', 'claim', 'source'] },
    { id: 'shade', label: ['Which places in our school need shade?', 'Ποια σημεία του σχολείου μας χρειάζονται σκιά;'],
      aim: ['Pupils map the hot and cool places of the school grounds and make a case, with their own numbers, for where shade should go.',
        'Οι μαθητές χαρτογραφούν τα ζεστά και τα δροσερά σημεία του σχολείου και υποστηρίζουν, με δικούς τους αριθμούς, πού πρέπει να μπει σκιά.'],
      meas: ['temperature', 'surface', 'shade', 'people'], stops: ['yard-shade', 'yard-open', 'carpark', 'street'],
      pages: ['board', 'city', 'reports'], traps: ['sample-size', 'indoor-outdoor', 'honest-chart'],
      ind: ['record', 'range', 'claim', 'share'] },
  ];

  const YEARS = [
    { id: '8-10', label: ['Ages 8–10', 'Ηλικίες 8–10'], sub: ['Simple counting and comparing', 'Απλή καταμέτρηση και σύγκριση'] },
    { id: '10-12', label: ['Ages 10–12', 'Ηλικίες 10–12'], sub: ['Tables, biggest and smallest', 'Πίνακες, μεγαλύτερο και μικρότερο'] },
    { id: '12-15', label: ['Ages 12–15', 'Ηλικίες 12–15'], sub: ['Range, averages, a written claim', 'Εύρος, μέσοι όροι, γραπτός ισχυρισμός'] },
    { id: '15-18', label: ['Ages 15–18', 'Ηλικίες 15–18'], sub: ['Uncertainty, method, a defended conclusion', 'Αβεβαιότητα, μέθοδος, τεκμηριωμένο συμπέρασμα'] },
  ];
  const LENGTH = [
    { id: '45', label: ['One lesson · 45 min', 'Ένα μάθημα · 45 λεπτά'] },
    { id: '2x45', label: ['Two lessons', 'Δύο μαθήματα'] },
    { id: 'half', label: ['Half a day outside', 'Μισή μέρα έξω'] },
    { id: 'weeks', label: ['Across three weeks', 'Σε τρεις εβδομάδες'] },
  ];
  const STOPS = [
    { id: 'yard-shade', label: ['School yard · in shade', 'Αυλή · στη σκιά'] },
    { id: 'yard-open', label: ['School yard · in the open', 'Αυλή · στον ήλιο'] },
    { id: 'street', label: ['Street outside the gate', 'Δρόμος έξω από την πύλη'], sub: ['Read from the pavement', 'Μέτρηση από το πεζοδρόμιο'] },
    { id: 'carpark', label: ['Car park', 'Χώρος στάθμευσης'] },
    { id: 'busstop', label: ['Bus stop', 'Στάση λεωφορείου'] },
    { id: 'park', label: ['Nearest park or trees', 'Κοντινό πάρκο ή δέντρα'] },
    { id: 'classroom', label: ['Our classroom', 'Η τάξη μας'] },
    { id: 'corridor', label: ['Corridor', 'Διάδρομος'] },
  ];
  const MEASURES = [
    { id: 'temperature', label: ['Air temperature', 'Θερμοκρασία αέρα'], unit: '°C' },
    { id: 'surface', label: ['Surface under their feet', 'Επιφάνεια κάτω από τα πόδια'], unit: '°C' },
    { id: 'humidity', label: ['Humidity', 'Υγρασία'], unit: '%' },
    { id: 'co2', label: ['Carbon dioxide (our sensor)', 'Διοξείδιο του άνθρακα (ο αισθητήρας μας)'], unit: 'ppm' },
    { id: 'pm25', label: ['PM2.5 (our sensor)', 'PM2.5 (ο αισθητήρας μας)'], unit: 'µg/m³' },
    { id: 'shade', label: ['Shade or sun', 'Σκιά ή ήλιος'], unit: '' },
    { id: 'traffic', label: ['Vehicles counted in 2 minutes', 'Οχήματα σε 2 λεπτά'], unit: '' },
    { id: 'people', label: ['People in the space', 'Άτομα στον χώρο'], unit: '' },
    { id: 'sound', label: ['What we can hear (0–3)', 'Τι ακούμε (0–3)'], unit: '' },
    { id: 'rain-felt', label: ['Rain since yesterday (yes/no)', 'Βροχή από χθες (ναι/όχι)'], unit: '' },
  ];
  const TRAPS = {
    'indoor-outdoor': [['A thermometer in the sun reads the sun, not the air.', 'Ένα θερμόμετρο στον ήλιο μετρά τον ήλιο, όχι τον αέρα.'], 'indoor-outdoor'],
    'sample-size': [['A few readings in one hour are not a day, and not a season.', 'Λίγες μετρήσεις σε μία ώρα δεν είναι μέρα, ούτε εποχή.'], 'sample-size'],
    correlation: [['Two things moving together does not mean one caused the other.', 'Δύο πράγματα που κινούνται μαζί δεν σημαίνει ότι το ένα προκάλεσε το άλλο.'], 'correlation'],
    calibration: [['Two sensors can disagree and both be working. Check them side by side first.', 'Δύο αισθητήρες μπορεί να διαφωνούν και να δουλεύουν και οι δύο. Έλεγξέ τους δίπλα-δίπλα πρώτα.'], 'calibration'],
    'model-says': [['A model gives a number for an 11 km square, not for our yard.', 'Ένα μοντέλο δίνει αριθμό για τετράγωνο 11 χλμ., όχι για την αυλή μας.'], 'model-says'],
    'rounding-units': [['Write the unit every time. A number without a unit means nothing.', 'Γράψε τη μονάδα κάθε φορά. Αριθμός χωρίς μονάδα δεν σημαίνει τίποτα.'], 'rounding-units'],
    'average-median': [['One strange reading drags an average. Look at the middle value too.', 'Μία περίεργη μέτρηση τραβά τον μέσο όρο. Κοίτα και τη μεσαία τιμή.'], 'average-median'],
    'honest-chart': [['A chart that does not start at zero can make a small change look huge.', 'Ένα διάγραμμα που δεν ξεκινά από το μηδέν κάνει μια μικρή αλλαγή να φαίνεται τεράστια.'], 'honest-chart'],
  };
  const IND = {
    record: [['Records a measurement with its unit, its place and its time.', 'Καταγράφει μια μέτρηση με τη μονάδα, το σημείο και την ώρα της.']],
    range: [['Works out the lowest, the highest and the range, and says what they show.', 'Βρίσκει τη μικρότερη, τη μεγαλύτερη τιμή και το εύρος, και λέει τι δείχνουν.']],
    differ: [['Names one reason why two sources of the same measurement can differ.', 'Αναφέρει έναν λόγο για τον οποίο δύο πηγές της ίδιας μέτρησης μπορεί να διαφέρουν.']],
    claim: [['States a claim, the evidence under it, and what would change their mind.', 'Διατυπώνει έναν ισχυρισμό, τα στοιχεία που τον στηρίζουν, και τι θα άλλαζε τη γνώμη τους.']],
    method: [['Describes the method so another class could repeat it.', 'Περιγράφει τη μέθοδο ώστε μια άλλη τάξη να μπορεί να την επαναλάβει.']],
    change: [['Describes what changed after one thing was changed on purpose.', 'Περιγράφει τι άλλαξε αφού άλλαξαν επίτηδες ένα πράγμα.']],
    source: [['Names the publisher of the data and the licence it carries.', 'Αναφέρει τον εκδότη των δεδομένων και την άδεια που φέρουν.']],
    share: [['Presents the result to someone outside the class.', 'Παρουσιάζει το αποτέλεσμα σε κάποιον έξω από την τάξη.']],
  };
  const SHARE = [
    { id: 'board', label: ['A poster on the school notice board', 'Αφίσα στον πίνακα ανακοινώσεων'] },
    { id: 'assembly', label: ['Two minutes at assembly', 'Δύο λεπτά στη συγκέντρωση'] },
    { id: 'letter', label: ['A letter to the municipality', 'Επιστολή στον δήμο'] },
    { id: 'report', label: ['A report on Kleanthis', 'Αναφορά στον Κλεάνθη'], sub: ['Reports page', 'Σελίδα Αναφορές'] },
    { id: 'parents', label: ['A stand at the parents’ evening', 'Περίπτερο στη συνάντηση γονέων'] },
    { id: 'school', label: ['Send it to another school on the platform', 'Στείλ’ το σε άλλο σχολείο της πλατφόρμας'] },
  ];

  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const words = (p) => T(p[0], p[1]);

  /* ---------- the plan ---------- */
  function plan(S, K) {
    const Q = byId(QUESTIONS, S.q);
    const year = byId(YEARS, S.y), len = byId(LENGTH, S.d), share = byId(SHARE, S.share);
    const stops = (S.stops || []).map((id) => byId(STOPS, id)).filter(Boolean);
    const meas = (S.meas || []).map((id) => byId(MEASURES, id)).filter(Boolean);
    const blank = (en, elx) => el('em', { class: 'lb-blank' }, T(en, elx));
    const minutes = len && len.id === '45'
      ? { acquire: 8, investigate: 22, collaborate: 8, discuss: 7 }
      : { acquire: 10, investigate: 35, collaborate: 15, discuss: 15, practise: 10, produce: 5 };

    const sections = [];
    sections.push({ h: T('Aim of the lesson · Σκοπός', 'Σκοπός του μαθήματος'),
      body: el('p', null, S.aim ? S.aim : Q ? words(Q.aim) : blank('Choose a question and the aim appears here.', 'Διάλεξε ερώτηση και ο σκοπός εμφανίζεται εδώ.')) });

    sections.push({ h: T('Success indicators · Δείκτες επιτυχίας', 'Δείκτες επιτυχίας'),
      body: Q ? el('ul', null, ...Q.ind.map((k) => el('li', null, words(IND[k][0])))) : blank('—', '—') });

    const row = (when, what) => el('div', { class: 'lb-row' }, el('b', null, when), el('span', null, what));
    const pages = Q ? Q.pages.filter((id) => SC.ready && SC.ready.has(id)) : [];
    const pageWords = pages.map((id) => (SC.pageInfo(id) || {}).name).filter(Boolean).join(', ');
    sections.push({ h: T('The lesson', 'Το μάθημα'), body: [
      row(T('Before', 'Πριν'), T('Open ' + (pageWords || 'the platform') + ' on the screen and read today’s number for your city aloud. Ask the class whether the yard would say the same.',
        'Άνοιξε ' + (pageWords || 'την πλατφόρμα') + ' στην οθόνη και διάβασε φωναχτά τον σημερινό αριθμό της πόλης σας. Ρώτα αν η αυλή θα έλεγε το ίδιο.')),
      row(T('Outside', 'Έξω'), stops.length && meas.length
        ? T(stops.length + ' stops, ' + meas.length + ' things measured at each, three readings per stop, onto the sheet on page 3.',
          stops.length + ' σημεία, ' + meas.length + ' μετρήσεις στο καθένα, τρεις μετρήσεις ανά σημείο, στο φύλλο της σελίδας 3.')
        : T('Choose the stops and the measures.', 'Διάλεξε τα σημεία και τις μετρήσεις.')),
      row(T('Back inside', 'Πίσω στην τάξη'), T('Every group puts its numbers on the board. Lowest, highest, range. Then the same measurement on the platform, beside theirs.',
        'Κάθε ομάδα γράφει τους αριθμούς της στον πίνακα. Μικρότερη, μεγαλύτερη, εύρος. Μετά η ίδια μέτρηση στην πλατφόρμα, δίπλα στις δικές τους.')),
      row(T('To finish', 'Στο τέλος'), T('Each group writes one claim, the evidence under it, and one thing that would change their mind.',
        'Κάθε ομάδα γράφει έναν ισχυρισμό, τα στοιχεία του, και ένα πράγμα που θα άλλαζε τη γνώμη της.')),
    ] });

    sections.push({ h: T('What could fool us', 'Τι μπορεί να μας ξεγελάσει'),
      body: Q ? el('ul', null, ...Q.traps.map((k) => el('li', null, words(TRAPS[k][0]),
        SC.ready && SC.ready.has('methods') ? el('span', { class: 'lb-tag' }, T('Methods: ', 'Μέθοδοι: ') + TRAPS[k][1]) : null))) : blank('—', '—') });

    sections.push({ h: T('Differentiation · Διαφοροποίηση', 'Διαφοροποίηση'), page: true, body: el('ul', null,
      el('li', null, T('Support: a reading partner, and the table already filled in for the first stop.', 'Στήριξη: συμμαθητής-βοηθός και ο πίνακας συμπληρωμένος για το πρώτο σημείο.')),
      el('li', null, T('Core: the plan as it stands.', 'Βασικό: το σχέδιο όπως είναι.')),
      el('li', null, year && (year.id === '15-18' || year.id === '12-15')
        ? T('Extension: repeat at a second time of day and say whether the difference holds.', 'Επέκταση: επανάληψη σε δεύτερη ώρα της ημέρας και κρίση αν η διαφορά κρατά.')
        : T('Extension: one more stop of the group’s own choosing, with a reason for choosing it.', 'Επέκταση: ένα ακόμη σημείο της επιλογής τους, με αιτιολόγηση.'))) });

    sections.push({ h: T('Assessment · Αξιολόγηση', 'Αξιολόγηση'), body: [
      el('p', null, T('Claim, evidence, reasoning — and one column the class usually never gets asked for.', 'Ισχυρισμός, στοιχεία, συλλογιστική — και μία στήλη που σπάνια ζητείται.')),
      el('table', { class: 'lb-tab' },
        el('tr', null, el('th', null, T('Claim', 'Ισχυρισμός')), el('th', null, T('Evidence', 'Στοιχεία')), el('th', null, T('Reasoning', 'Συλλογιστική')), el('th', null, T('What would change my mind', 'Τι θα άλλαζε τη γνώμη μου'))),
        el('tr', null, el('td', null, ' '), el('td', null, ' '), el('td', null, ' '), el('td', null, ' '))),
    ] });

    sections.push({ h: T('Share it', 'Μοιράσου το'),
      body: el('p', null, share ? words(share.label) : blank('Choose who hears the result.', 'Διάλεξε ποιος θα ακούσει το αποτέλεσμα.')) });

    // the recording sheet, on its own page
    sections.push({ h: T('Recording sheet', 'Φύλλο καταγραφής'), page: true, body: [
      el('p', null, T('One row per reading. Write the unit every time.', 'Μία γραμμή ανά μέτρηση. Γράφε τη μονάδα κάθε φορά.')),
      el('table', { class: 'lb-tab' },
        el('tr', null, el('th', null, T('Stop', 'Σημείο')), el('th', null, T('Time', 'Ώρα')),
          ...meas.map((m) => el('th', null, words(m.label) + (m.unit ? ' (' + m.unit + ')' : ''))), el('th', null, T('Who read it', 'Ποιος μέτρησε'))),
        ...(stops.length ? stops : [{ label: ['—', '—'] }]).flatMap((st) => [0, 1, 2].map(() => el('tr', null,
          el('td', null, words(st.label)), el('td', null, ' '), ...meas.map(() => el('td', null, ' ')), el('td', null, ' ')))))] });

    sections.push({ h: T('Data this lesson uses', 'Δεδομένα που χρησιμοποιεί το μάθημα'), body: el('p', { class: 'lb-src' },
      T('Cyprus Department of Meteorology automatic stations (CyDoM open data) · Open-Meteo model, 11 km grid · the school’s own SenseCAP sensors. Every number the class copies from Kleanthis carries the time it was read and the source it came from.',
        'Αυτόματοι σταθμοί της Μετεωρολογικής Υπηρεσίας Κύπρου (ανοιχτά δεδομένα CyDoM) · μοντέλο Open-Meteo, πλέγμα 11 χλμ. · οι αισθητήρες SenseCAP του σχολείου. Κάθε αριθμός που αντιγράφει η τάξη από τον Κλεάνθη φέρει την ώρα και την πηγή του.')) });

    return {
      title: Q ? words(Q.label) : T('Your field lesson', 'Το μάθημα πεδίου σου'),
      meta: [T('Field lesson', 'Μάθημα πεδίου'), year ? words(year.label) : T('any age', 'κάθε ηλικία'), len ? words(len.label) : T('any length', 'ελεύθερη διάρκεια'), SC.date(Date.now())],
      sections, minutes,
    };
  }

  function summary(S) {
    const Q = byId(QUESTIONS, S.q), year = byId(YEARS, S.y), len = byId(LENGTH, S.d);
    return [
      'question = ' + (Q ? Q.id + ' (' + Q.label[0] + ')' : 'not chosen'),
      'age = ' + (year ? year.id : 'not chosen'),
      'length = ' + (len ? len.id : 'not chosen'),
      'stops = ' + ((S.stops || []).join(', ') || 'none'),
      'measures = ' + ((S.meas || []).join(', ') || 'none'),
      'share = ' + (S.share || 'not chosen'),
      S.aim ? 'the teacher wrote this aim: ' + S.aim : '',
    ].filter(Boolean).join('\n');
  }

  SC.register('lessonbuilder', {
    title: ['Lesson builder', 'Φτιάξε μάθημα'],
    render(root, ctx) {
      SC.css('/site/pages/tk4.css');
      SC.css('/site/pages/lessonbuilder.css');
      let stop = null, alive = true;
      core().then((LB) => {
        if (!alive) return;
        stop = LB.mount(root, ctx, {
          id: 'lessonbuilder',
          head: {
            title: ['Lesson builder', 'Φτιάξε μάθημα'],
            lede: ['Turn a question into a field lesson: the class goes outside, measures something, and comes back to check it against what Kleanthis holds. Three pages to print, or a link to send a colleague.',
              'Κάνε μια ερώτηση μάθημα πεδίου: η τάξη βγαίνει έξω, μετρά κάτι και επιστρέφει για να το ελέγξει με όσα κρατά ο Κλεάνθης. Τρεις σελίδες για εκτύπωση ή ένας σύνδεσμος για έναν συνάδελφο.'],
            help: ['Work down the steps on the left. The plan on the right is what will print: page 1 the lesson, page 2 the assessment, page 3 the sheet the class takes outside. Nothing is saved on the site: the whole plan lives in the link, so copy the link to keep it. Do not write names or exact places in the aim.',
              'Προχώρα στα βήματα αριστερά. Το σχέδιο δεξιά είναι αυτό που θα εκτυπωθεί: σελίδα 1 το μάθημα, σελίδα 2 η αξιολόγηση, σελίδα 3 το φύλλο που παίρνει η τάξη έξω. Τίποτα δεν αποθηκεύεται: όλο το σχέδιο ζει στον σύνδεσμο, οπότε αντίγραψέ τον για να το κρατήσεις. Μη γράφεις ονόματα ή ακριβή σημεία στον σκοπό.'],
          },
          fields: [
            { key: 'q', kind: 'one', opts: QUESTIONS,
              step: { title: ['The question', 'Η ερώτηση'], hint: ['Everything else follows from this: what they measure, where they stand, which pages they open.', 'Όλα τα υπόλοιπα προκύπτουν από αυτή: τι μετρούν, πού στέκονται, ποιες σελίδες ανοίγουν.'] } },
            { key: 'y', kind: 'one', opts: YEARS,
              step: { title: ['Age of the class', 'Ηλικία της τάξης'], hint: ['The age changes what the plan asks them to work out, not the question itself.', 'Η ηλικία αλλάζει τι ζητά το σχέδιο να υπολογίσουν, όχι την ίδια την ερώτηση.'] } },
            { key: 'd', kind: 'one', opts: LENGTH,
              step: { title: ['How long', 'Πόση ώρα'], hint: ['One lesson keeps it to one measurement. Longer lets them repeat, which is what makes it science.', 'Ένα μάθημα κρατά μία μέτρηση. Περισσότερος χρόνος επιτρέπει επανάληψη, που είναι και η ουσία.'] } },
            { key: 'stops', kind: 'many', opts: STOPS, max: 6,
              step: { title: ['Where the class goes', 'Πού πηγαίνει η τάξη'], hint: ['Pick the stops. Each one becomes three rows on the recording sheet.', 'Διάλεξε τα σημεία. Κάθε ένα γίνεται τρεις γραμμές στο φύλλο καταγραφής.'] },
              after: () => el('p', { class: 'lb-safe' }, T('The plan carries this safety line: stay inside the gate unless a second adult is with the group, no road crossing, the street stop is read from the pavement, and nobody is photographed.',
                'Το σχέδιο κουβαλά αυτή τη γραμμή ασφάλειας: μένουμε εντός της πύλης εκτός αν συνοδεύει δεύτερος ενήλικας, χωρίς διάσχιση δρόμου, η μέτρηση στον δρόμο γίνεται από το πεζοδρόμιο, και δεν φωτογραφίζεται κανείς.')) },
            { key: 'meas', kind: 'many', opts: MEASURES, max: 5,
              step: { title: ['What they record', 'Τι καταγράφουν'], hint: ['Two or three is plenty. Every one you add is another column to fill in at every stop.', 'Δύο ή τρία αρκούν. Κάθε επιπλέον είναι άλλη μια στήλη σε κάθε σημείο.'] } },
            { key: 'share', kind: 'one', opts: SHARE,
              step: { title: ['Who hears the result', 'Ποιος ακούει το αποτέλεσμα'], hint: ['A measurement nobody hears about stops being useful the moment the bell goes.', 'Μια μέτρηση που δεν τη μαθαίνει κανείς παύει να χρησιμεύει μόλις χτυπήσει το κουδούνι.'] } },
            { key: 'aim', kind: 'text', max: 160, label: ['The aim, in your own words (optional)', 'Ο σκοπός, με δικά σου λόγια (προαιρετικό)'],
              step: { title: ['Your own words', 'Με δικά σου λόγια'], hint: ['Leave it empty and the plan uses the aim written for this question.', 'Άσ’ το κενό και το σχέδιο χρησιμοποιεί τον σκοπό που είναι γραμμένος για αυτή την ερώτηση.'] } },
          ],
          plan,
          chat: { summary },
        });
      }).catch(() => { if (alive) root.append(el('div', { class: 'err', role: 'alert' }, T('The lesson builder could not be loaded.', 'Το εργαλείο δεν φόρτωσε.'))); });
      return () => { alive = false; if (stop) stop(); };
    },
  });
}());
