/*
  Lesson builder: a teacher starts from a question their class can go outside and answer, and the plan writes itself -
  the aim, the indicators, the lesson minute by minute, what could fool them, the differentiation, the rubric, who
  hears the result, and the sheet the class carries. Three A4 pages.

  There is no form. The plan is the interface: the phrases that can change are underlined inside it, and pressing one
  opens its choices on that phrase. Everything is a choice, written here in both languages; the only free line is the
  aim in the teacher's own words, which passes the site's privacy check. The whole plan lives in the link after the #.

  The engine (the two screens, the link, printing, the time ribbon, the assistant) is in lb-core.js.
  Link: #/lessonbuilder?q=heat&y=12-15&d=2x45&stops=yard-shade.street&meas=temperature.surface&share=board&aim=...
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  const core = () => (SC.LB ? Promise.resolve(SC.LB) : (window.__lbp = window.__lbp || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = '/site/pages/lb-core.js?v=2';
    s.onload = () => (SC.LB ? res(SC.LB) : rej(new Error('core'))); s.onerror = () => { window.__lbp = null; s.remove(); rej(new Error('core')); };
    document.head.append(s);
  })));

  /* ---------- the banks ---------- */
  const QUESTIONS = [
    { id: 'heat', hue: '#F7C46B', label: ['Is our yard hotter than the street?', 'Είναι η αυλή μας πιο ζεστή από τον δρόμο;'],
      blurb: ['A thermometer, a few stops and the nearest official station. The class finds out that where you stand changes the number.',
        'Ένα θερμόμετρο, μερικά σημεία και ο πλησιέστερος επίσημος σταθμός. Η τάξη ανακαλύπτει ότι το πού στέκεσαι αλλάζει τον αριθμό.'],
      tags: [['Air temperature', 'Θερμοκρασία αέρα'], ['Surface', 'Επιφάνεια'], ['Outdoors', 'Έξω']],
      meta: ['AGES 10–15 · 1–2 LESSONS', 'ΗΛΙΚΙΕΣ 10–15 · 1–2 ΜΑΘΗΜΑΤΑ'],
      aim: ['Pupils measure air temperature at several places around the school, compare what they measured with what the nearest official station reports, and say why the two differ.',
        'Οι μαθητές μετρούν τη θερμοκρασία του αέρα σε διάφορα σημεία γύρω από το σχολείο, τη συγκρίνουν με όσα αναφέρει ο πλησιέστερος επίσημος σταθμός και εξηγούν γιατί διαφέρουν.'],
      meas: ['temperature', 'surface', 'shade'], stops: ['yard-shade', 'yard-open', 'street'],
      pages: ['board', 'layers', 'weather'], traps: ['indoor-outdoor', 'sample-size', 'correlation'], ind: ['record', 'range', 'differ', 'claim'] },
    { id: 'co2', hue: '#5EE0A8', label: ['Does our classroom get stuffy by the end of the lesson?', 'Μπαίνει αποπνικτικά η τάξη μας στο τέλος του μαθήματος;'],
      blurb: ['Watch the carbon dioxide climb through a lesson, open one window, and judge honestly whether that did anything.',
        'Παρακολούθησε το διοξείδιο του άνθρακα να ανεβαίνει μέσα στο μάθημα, άνοιξε ένα παράθυρο και κρίνε με ειλικρίνεια αν αυτό έκανε κάτι.'],
      tags: [['CO₂', 'CO₂'], ['People', 'Άτομα'], ['Indoors', 'Μέσα']],
      meta: ['AGES 10–18 · 1 LESSON', 'ΗΛΙΚΙΕΣ 10–18 · 1 ΜΑΘΗΜΑ'],
      aim: ['Pupils watch the carbon dioxide in their own room across a lesson, try one change to the room, and judge whether the change did anything.',
        'Οι μαθητές παρακολουθούν το διοξείδιο του άνθρακα στην τάξη τους σε ένα μάθημα, δοκιμάζουν μία αλλαγή στον χώρο και κρίνουν αν η αλλαγή έκανε κάτι.'],
      meas: ['co2', 'temperature', 'people'], stops: ['classroom', 'corridor', 'yard-open'],
      pages: ['board', 'vent', 'explore'], traps: ['sample-size', 'calibration', 'correlation'], ind: ['record', 'change', 'claim', 'method'] },
    { id: 'agree', hue: '#4CCBEA', label: ['Do our sensor, the station and the model agree?', 'Συμφωνούν ο αισθητήρας μας, ο σταθμός και το μοντέλο;'],
      blurb: ['The same measurement from three kinds of source at the same minute. The spread between them is the lesson.',
        'Η ίδια μέτρηση από τρία είδη πηγών το ίδιο λεπτό. Η διαφορά τους είναι το μάθημα.'],
      tags: [['Temperature', 'Θερμοκρασία'], ['Humidity', 'Υγρασία'], ['Mixed', 'Μικτό']],
      meta: ['AGES 12–18 · 2 LESSONS', 'ΗΛΙΚΙΕΣ 12–18 · 2 ΜΑΘΗΜΑΤΑ'],
      aim: ['Pupils collect the same measurement from three kinds of source at the same moment, work out the spread, and say which differences matter.',
        'Οι μαθητές παίρνουν την ίδια μέτρηση από τρία είδη πηγών την ίδια στιγμή, υπολογίζουν το εύρος και λένε ποιες διαφορές μετρούν.'],
      meas: ['temperature', 'humidity'], stops: ['yard-open', 'classroom'],
      pages: ['layers', 'health', 'stack'], traps: ['indoor-outdoor', 'model-says', 'rounding-units'], ind: ['record', 'range', 'differ', 'method'] },
    { id: 'traffic', hue: '#ff9a8b', label: ['Can we see the traffic in the air?', 'Φαίνεται η κίνηση στον αέρα;'],
      blurb: ['Count vehicles at the gate while the sensors read the air — then face the question of what the numbers cannot prove.',
        'Μέτρησε οχήματα στην πύλη όσο οι αισθητήρες διαβάζουν τον αέρα — και μετά αντιμετώπισε το τι δεν μπορούν να αποδείξουν οι αριθμοί.'],
      tags: [['PM2.5', 'PM2.5'], ['Vehicles', 'Οχήματα'], ['Outdoors', 'Έξω']],
      meta: ['AGES 12–18 · 2 LESSONS', 'ΗΛΙΚΙΕΣ 12–18 · 2 ΜΑΘΗΜΑΤΑ'],
      aim: ['Pupils count vehicles at the gate while the sensors read the air, then test honestly whether the two are related or only happened together.',
        'Οι μαθητές μετρούν οχήματα στην πύλη ενώ οι αισθητήρες διαβάζουν τον αέρα, και μετά ελέγχουν με ειλικρίνεια αν τα δύο σχετίζονται ή απλώς συνέβησαν μαζί.'],
      meas: ['traffic', 'pm25', 'sound'], stops: ['street', 'yard-open', 'busstop'],
      pages: ['board', 'layers', 'claims'], traps: ['correlation', 'sample-size', 'honest-chart'], ind: ['record', 'claim', 'differ', 'method'] },
    { id: 'water', hue: '#C4B8FF', label: ['How much water is left in our dams?', 'Πόσο νερό έχει μείνει στα φράγματά μας;'],
      blurb: ['The published reservoir record, this year beside the last ten. No sensor needed — and no guessing allowed.',
        'Το δημοσιευμένο αρχείο των φραγμάτων, φέτος δίπλα στα δέκα προηγούμενα χρόνια. Χωρίς αισθητήρα — και χωρίς εικασίες.'],
      tags: [['Reservoirs', 'Φράγματα'], ['Rainfall', 'Βροχόπτωση'], ['Desk work', 'Στο θρανίο']],
      meta: ['AGES 12–18 · 1 LESSON', 'ΗΛΙΚΙΕΣ 12–18 · 1 ΜΑΘΗΜΑ'],
      aim: ['Pupils read the published reservoir record, work out what this year looks like beside earlier years, and write what they can and cannot conclude.',
        'Οι μαθητές διαβάζουν το δημοσιευμένο αρχείο των φραγμάτων, βλέπουν πώς στέκεται η φετινή χρονιά δίπλα σε προηγούμενες και γράφουν τι μπορούν και τι δεν μπορούν να συμπεράνουν.'],
      meas: ['rain-felt'], stops: ['classroom'],
      pages: ['fieldwork', 'archive', 'explore'], traps: ['honest-chart', 'rounding-units', 'average-median'], ind: ['record', 'range', 'claim', 'source'] },
    { id: 'shade', hue: '#8fd3a8', label: ['Which places in our school need shade?', 'Ποια σημεία του σχολείου μας χρειάζονται σκιά;'],
      blurb: ['Map the hot and the cool corners of the grounds, then make the case — with your own numbers — for where shade should go.',
        'Χαρτογράφησε τις ζεστές και τις δροσερές γωνιές της αυλής και μετά υποστήριξε — με δικούς σου αριθμούς — πού πρέπει να μπει σκιά.'],
      tags: [['Temperature', 'Θερμοκρασία'], ['Surface', 'Επιφάνεια'], ['Outdoors', 'Έξω']],
      meta: ['AGES 10–18 · 2 LESSONS', 'ΗΛΙΚΙΕΣ 10–18 · 2 ΜΑΘΗΜΑΤΑ'],
      aim: ['Pupils map the hot and cool places of the school grounds and make a case, with their own numbers, for where shade should go.',
        'Οι μαθητές χαρτογραφούν τα ζεστά και τα δροσερά σημεία του σχολείου και υποστηρίζουν, με δικούς τους αριθμούς, πού πρέπει να μπει σκιά.'],
      meas: ['temperature', 'surface', 'shade', 'people'], stops: ['yard-shade', 'yard-open', 'carpark', 'street'],
      pages: ['board', 'city', 'reports'], traps: ['sample-size', 'indoor-outdoor', 'honest-chart'], ind: ['record', 'range', 'claim', 'share'] },
  ];

  const YEARS = [
    { id: '8-10', label: ['ages 8–10', 'ηλικίες 8–10'], sub: ['Counting and comparing', 'Καταμέτρηση και σύγκριση'] },
    { id: '10-12', label: ['ages 10–12', 'ηλικίες 10–12'], sub: ['Tables, biggest and smallest', 'Πίνακες, μεγαλύτερο και μικρότερο'] },
    { id: '12-15', label: ['ages 12–15', 'ηλικίες 12–15'], sub: ['Range, averages, a written claim', 'Εύρος, μέσοι όροι, γραπτός ισχυρισμός'] },
    { id: '15-18', label: ['ages 15–18', 'ηλικίες 15–18'], sub: ['Uncertainty, method, a defended conclusion', 'Αβεβαιότητα, μέθοδος, τεκμηριωμένο συμπέρασμα'] },
  ];
  const LENGTH = [
    { id: '45', label: ['one lesson', 'ένα μάθημα'], sub: ['45 minutes', '45 λεπτά'], mins: 45 },
    { id: '2x45', label: ['two lessons', 'δύο μαθήματα'], sub: ['90 minutes in all', '90 λεπτά συνολικά'], mins: 90 },
    { id: 'half', label: ['half a day outside', 'μισή μέρα έξω'], sub: ['About three hours', 'Περίπου τρεις ώρες'], mins: 180 },
    { id: 'weeks', label: ['across three weeks', 'σε τρεις εβδομάδες'], sub: ['A lesson a week', 'Ένα μάθημα την εβδομάδα'], mins: 135 },
  ];
  const STOPS = [
    { id: 'yard-shade', label: ['the yard in shade', 'η αυλή στη σκιά'], sub: ['Under the trees', 'Κάτω από τα δέντρα'] },
    { id: 'yard-open', label: ['the open yard', 'η ανοιχτή αυλή'], sub: ['The middle of the yard', 'Η μέση της αυλής'] },
    { id: 'street', label: ['the street outside', 'ο δρόμος έξω'], sub: ['Read from the pavement', 'Μέτρηση από το πεζοδρόμιο'] },
    { id: 'carpark', label: ['the car park', 'ο χώρος στάθμευσης'] },
    { id: 'busstop', label: ['the bus stop', 'η στάση λεωφορείου'] },
    { id: 'park', label: ['the nearest trees', 'τα κοντινά δέντρα'] },
    { id: 'classroom', label: ['our classroom', 'η τάξη μας'] },
    { id: 'corridor', label: ['the corridor', 'ο διάδρομος'] },
  ];
  const MEASURES = [
    { id: 'temperature', label: ['air temperature', 'θερμοκρασία αέρα'], unit: '°C' },
    { id: 'surface', label: ['the surface underfoot', 'η επιφάνεια κάτω από τα πόδια'], unit: '°C' },
    { id: 'humidity', label: ['humidity', 'υγρασία'], unit: '%' },
    { id: 'co2', label: ['carbon dioxide', 'διοξείδιο του άνθρακα'], unit: 'ppm' },
    { id: 'pm25', label: ['PM2.5', 'PM2.5'], unit: 'µg/m³' },
    { id: 'shade', label: ['shade or sun', 'σκιά ή ήλιος'], unit: '' },
    { id: 'traffic', label: ['vehicles in two minutes', 'οχήματα σε δύο λεπτά'], unit: '' },
    { id: 'people', label: ['people in the space', 'άτομα στον χώρο'], unit: '' },
    { id: 'sound', label: ['what we can hear (0–3)', 'τι ακούμε (0–3)'], unit: '' },
    { id: 'rain-felt', label: ['rain since yesterday', 'βροχή από χθες'], unit: '' },
  ];
  const TRAPS = {
    'indoor-outdoor': [['A thermometer in the sun reads the sun, not the air.', 'Ένα θερμόμετρο στον ήλιο μετρά τον ήλιο, όχι τον αέρα.'], 'indoor-outdoor', ['Indoor against outdoor', 'Μέσα απέναντι σε έξω']],
    'sample-size': [['A few readings in one hour are not a day, and not a season.', 'Λίγες μετρήσεις σε μία ώρα δεν είναι μέρα, ούτε εποχή.'], 'sample-size', ['Sample size and time of day', 'Μέγεθος δείγματος και ώρα της μέρας']],
    correlation: [['Two things moving together does not mean one caused the other.', 'Δύο πράγματα που κινούνται μαζί δεν σημαίνει ότι το ένα προκάλεσε το άλλο.'], 'correlation', ['Correlation is not cause', 'Η συσχέτιση δεν είναι αιτία']],
    calibration: [['Two sensors can disagree and both be working. Check them side by side first.', 'Δύο αισθητήρες μπορεί να διαφωνούν και να δουλεύουν και οι δύο. Έλεγξέ τους δίπλα-δίπλα πρώτα.'], 'calibration', ['Calibration', 'Βαθμονόμηση']],
    'model-says': [['A model gives a number for an 11 km square, not for our yard.', 'Ένα μοντέλο δίνει αριθμό για τετράγωνο 11 χλμ., όχι για την αυλή μας.'], 'model-says', ['What “the model says” means', 'Τι σημαίνει «το μοντέλο λέει»']],
    'rounding-units': [['Write the unit every time. A number without a unit means nothing.', 'Γράψε τη μονάδα κάθε φορά. Αριθμός χωρίς μονάδα δεν σημαίνει τίποτα.'], 'rounding-units', ['Rounding and units', 'Στρογγυλοποίηση και μονάδες']],
    'average-median': [['One strange reading drags an average. Look at the middle value too.', 'Μία περίεργη μέτρηση τραβά τον μέσο όρο. Κοίτα και τη μεσαία τιμή.'], 'average-median', ['Average and median', 'Μέσος όρος και διάμεσος']],
    'honest-chart': [['A chart that does not start at zero can make a small change look huge.', 'Ένα διάγραμμα που δεν ξεκινά από το μηδέν κάνει μια μικρή αλλαγή να φαίνεται τεράστια.'], 'honest-chart', ['Reading a chart honestly', 'Διαβάζω ένα διάγραμμα με ειλικρίνεια']],
  };
  const IND = {
    record: ['Records a measurement with its unit, its place and its time.', 'Καταγράφει μια μέτρηση με τη μονάδα, το σημείο και την ώρα της.'],
    range: ['Works out the lowest, the highest and the range, and says what they show.', 'Βρίσκει τη μικρότερη, τη μεγαλύτερη τιμή και το εύρος, και λέει τι δείχνουν.'],
    differ: ['Names one reason why two sources of the same measurement can differ.', 'Αναφέρει έναν λόγο για τον οποίο δύο πηγές της ίδιας μέτρησης μπορεί να διαφέρουν.'],
    claim: ['States a claim, the evidence under it, and what would change their mind.', 'Διατυπώνει έναν ισχυρισμό, τα στοιχεία που τον στηρίζουν, και τι θα άλλαζε τη γνώμη τους.'],
    method: ['Describes the method so another class could repeat it.', 'Περιγράφει τη μέθοδο ώστε μια άλλη τάξη να μπορεί να την επαναλάβει.'],
    change: ['Describes what changed after one thing was changed on purpose.', 'Περιγράφει τι άλλαξε αφού άλλαξαν επίτηδες ένα πράγμα.'],
    source: ['Names the publisher of the data and the licence it carries.', 'Αναφέρει τον εκδότη των δεδομένων και την άδεια που φέρουν.'],
    share: ['Presents the result to someone outside the class.', 'Παρουσιάζει το αποτέλεσμα σε κάποιον έξω από την τάξη.'],
  };
  const SHARE = [
    { id: 'board', label: ['a poster on the school notice board', 'μια αφίσα στον πίνακα ανακοινώσεων'] },
    { id: 'assembly', label: ['two minutes at assembly', 'δύο λεπτά στη συγκέντρωση'] },
    { id: 'letter', label: ['a letter to the municipality', 'μια επιστολή στον δήμο'] },
    { id: 'report', label: ['a report on Kleanthis', 'μια αναφορά στον Κλεάνθη'], sub: ['The Reports page', 'Η σελίδα Αναφορές'] },
    { id: 'parents', label: ['a stand at the parents’ evening', 'ένα περίπτερο στη συνάντηση γονέων'] },
    { id: 'school', label: ['another school on the platform', 'ένα άλλο σχολείο της πλατφόρμας'] },
  ];

  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const w = (p) => T(p[0], p[1]);
  const listWords = (items) => {
    const names = items.map((x) => w(x.label));
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + T(' and ', ' και ') + names[names.length - 1];
  };

  /* ---------- the plan ---------- */
  function plan(S, K, E) {
    const Q = byId(QUESTIONS, S.q), year = byId(YEARS, S.y), len = byId(LENGTH, S.d), share = byId(SHARE, S.share);
    const stops = (S.stops || []).map((id) => byId(STOPS, id)).filter(Boolean);
    const meas = (S.meas || []).map((id) => byId(MEASURES, id)).filter(Boolean);
    const mins = len ? len.mins : 90;
    // One clock for the whole lesson: the ribbon and the times printed beside each stage are
    // cut from the same boundaries, so the parts always add up to the length on the page.
    const CUTS = [0, .13, .52, .69, .88, 1], STAGES = ['acquire', 'investigate', 'collaborate', 'discuss', 'produce'];
    const at = CUTS.map((f) => Math.round(mins * f));
    const minutes = {};
    STAGES.forEach((k, i) => { minutes[k] = at[i + 1] - at[i]; });

    const sections = [];
    const stopsPhrase = E('stops', stops.length ? (stops.length + T(' stops', ' σημεία')) : T('choose the stops', 'διάλεξε τα σημεία'));
    const measPhrase = E('meas', meas.length ? listWords(meas) : T('choose what they record', 'διάλεξε τι καταγράφουν'));

    sections.push({ key: 'aim', need: ['q'], h: T('Aim of the lesson', 'Σκοπός του μαθήματος'),
      body: el('p', null, E('aim', S.aim ? S.aim : w(Q.aim))) });

    sections.push({ key: 'ind', need: ['q', 'y'], h: T('Success indicators', 'Δείκτες επιτυχίας'),
      body: [el('ul', null, ...Q.ind.map((k) => el('li', null, w(IND[k])))),
        el('p', { class: 'lb-small' }, T('Written for ', 'Γραμμένοι για '), E('y', year ? w(year.label) : T('any age', 'κάθε ηλικία')), '.')] });

    const pageNames = Q.pages.filter((id) => SC.ready && SC.ready.has(id)).map((id) => (SC.pageInfo(id) || {}).name).filter(Boolean);
    const openWords = pageNames.length ? pageNames.join(T(' and ', ' και ')) : T('the platform', 'την πλατφόρμα');
    const stage = (when, type, ...body) => el('div', { class: 'lb-stage' },
      el('b', null, when), el('span', null, ...body, el('span', { class: 'lb-type' }, T(SC.LB.TYPES[type][0], SC.LB.TYPES[type][1]))));
    sections.push({ key: 'lesson', need: ['q', 'd', 'stops'], h: T('The lesson', 'Το μάθημα'), body: [
      el('p', { class: 'lb-small' }, T('Planned as ', 'Σχεδιασμένο ως '), E('d', len ? w(len.label) : T('one lesson', 'ένα μάθημα')), '.'),
      stage('0–' + at[1], 'acquire', T('Open ', 'Άνοιξε '), openWords, T(' on the screen and read today’s number for your city aloud. Ask whether the yard would say the same.',
        ' στην οθόνη και διάβασε φωναχτά τον σημερινό αριθμό της πόλης σας. Ρώτα αν η αυλή θα έλεγε το ίδιο.')),
      stage(at[1] + '–' + at[2], 'investigate', T('Outside. ', 'Έξω. '), stopsPhrase, T(', three readings each of ', ', τρεις μετρήσεις σε κάθε ένα για '), measPhrase,
        T(', onto the sheet on page 3.', ', στο φύλλο της σελίδας 3.')),
      stage(at[2] + '–' + at[3], 'collaborate', T('Back inside. Every group puts its numbers on one board. Lowest, highest, range.',
        'Πίσω στην τάξη. Κάθε ομάδα γράφει τους αριθμούς της σε έναν πίνακα. Μικρότερη, μεγαλύτερη, εύρος.')),
      stage(at[3] + '–' + at[4], 'discuss', T('Put the same measurement from the platform beside theirs. Why are they not the same number?',
        'Βάλε την ίδια μέτρηση από την πλατφόρμα δίπλα στις δικές τους. Γιατί δεν είναι ο ίδιος αριθμός;')),
      stage(at[4] + '–' + at[5], 'produce', T('Each group writes one claim, the evidence under it, and what would change their mind.',
        'Κάθε ομάδα γράφει έναν ισχυρισμό, τα στοιχεία του, και τι θα άλλαζε τη γνώμη της.')),
    ] });

    sections.push({ key: 'fool', need: ['q'], h: T('What could fool us', 'Τι μπορεί να μας ξεγελάσει'),
      body: el('ul', null, ...Q.traps.map((k) => el('li', null, w(TRAPS[k][0]), el('span', { class: 'lb-ref' }, T('Methods: ', 'Μέθοδοι: ') + w(TRAPS[k][2]))))) });

    sections.push({ key: 'diff', need: ['y'], page: true, h: T('Differentiation', 'Διαφοροποίηση'), body: el('ul', null,
      el('li', null, T('Support: a reading partner, and the first stop already filled in on the sheet.', 'Στήριξη: συμμαθητής-βοηθός και το πρώτο σημείο ήδη συμπληρωμένο στο φύλλο.')),
      el('li', null, T('Core: the plan as it stands.', 'Βασικό: το σχέδιο όπως είναι.')),
      el('li', null, year && (year.id === '15-18' || year.id === '12-15')
        ? T('Extension: repeat at a second time of day and say whether the difference holds.', 'Επέκταση: επανάληψη σε δεύτερη ώρα της ημέρας και κρίση αν η διαφορά κρατά.')
        : T('Extension: one more stop of the group’s own choosing, with a reason for choosing it.', 'Επέκταση: ένα ακόμη σημείο της επιλογής τους, με αιτιολόγηση.'))) });

    sections.push({ key: 'assess', need: ['q'], h: T('Assessment', 'Αξιολόγηση'), body: [
      el('p', null, T('Claim, evidence, reasoning — and the column a class is almost never asked for.', 'Ισχυρισμός, στοιχεία, συλλογιστική — και η στήλη που σπάνια ζητείται από μια τάξη.')),
      el('table', { class: 'lb-tab' },
        el('tr', null, el('th', null, T('Claim', 'Ισχυρισμός')), el('th', null, T('Evidence', 'Στοιχεία')), el('th', null, T('Reasoning', 'Συλλογιστική')), el('th', null, T('What would change my mind', 'Τι θα άλλαζε τη γνώμη μου'))),
        el('tr', null, el('td', null, ' '), el('td', null, ' '), el('td', null, ' '), el('td', null, ' '))),
    ] });

    sections.push({ key: 'share', need: ['share'], h: T('Who hears the result', 'Ποιος ακούει το αποτέλεσμα'),
      body: el('p', null, T('The class takes the result to ', 'Η τάξη πηγαίνει το αποτέλεσμα σε '),
        E('share', share ? w(share.label) : T('somebody outside the classroom', 'κάποιον έξω από την τάξη')), '.') });

    sections.push({ key: 'sheet', need: ['stops', 'meas'], page: true, h: T('Recording sheet', 'Φύλλο καταγραφής'), body: [
      el('p', null, T('One row per reading. Write the unit every time.', 'Μία γραμμή ανά μέτρηση. Γράφε τη μονάδα κάθε φορά.')),
      el('table', { class: 'lb-tab' },
        el('tr', null, el('th', null, T('Stop', 'Σημείο')), el('th', null, T('Time', 'Ώρα')),
          ...meas.map((m) => el('th', null, w(m.label) + (m.unit ? ' (' + m.unit + ')' : ''))), el('th', null, T('Who read it', 'Ποιος μέτρησε'))),
        ...(stops.length ? stops : [{ label: ['—', '—'] }]).flatMap((st) => [0, 1, 2].map(() => el('tr', null,
          el('td', null, w(st.label)), el('td', null, ' '), ...meas.map(() => el('td', null, ' ')), el('td', null, ' ')))))] });

    sections.push({ key: 'data', need: ['q'], h: T('Data this lesson uses', 'Δεδομένα που χρησιμοποιεί το μάθημα'),
      body: el('p', { class: 'lb-src' }, T('Cyprus Department of Meteorology automatic stations (CyDoM open data) · Open-Meteo model, 11 km grid · the school’s own SenseCAP sensors. Every number copied from Kleanthis carries the time it was read and the source it came from.',
        'Αυτόματοι σταθμοί της Μετεωρολογικής Υπηρεσίας Κύπρου (ανοιχτά δεδομένα CyDoM) · μοντέλο Open-Meteo, πλέγμα 11 χλμ. · οι αισθητήρες SenseCAP του σχολείου. Κάθε αριθμός που αντιγράφεται από τον Κλεάνθη φέρει την ώρα και την πηγή του.')) });

    return {
      title: w(Q.label),
      meta: [T('A class of ', 'Τάξη '), E('y', year ? w(year.label) : T('any age', 'κάθε ηλικίας')), ' · ', E('d', len ? w(len.label) : T('one lesson', 'ένα μάθημα')), ' · ' + SC.date(Date.now())],
      line: [T('Field lesson', 'Μάθημα πεδίου'), year ? w(year.label) : '', len ? w(len.label) : ''].filter(Boolean).join(' · '),
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
          primary: 'q',
          head: {
            crumb: ['Classroom · Lesson builder', 'Τάξη · Φτιάξε μάθημα'],
            big: ['Start with a question your class can go outside and answer.', 'Ξεκίνα με μια ερώτηση που η τάξη σου μπορεί να απαντήσει έξω.'],
            lede: ['Every question here is already wired to what Kleanthis measures: the stops, the instruments, the pages they open and the traps that could fool them. Pick one and the plan is half written.',
              'Κάθε ερώτηση εδώ είναι ήδη συνδεδεμένη με όσα μετρά ο Κλεάνθης: τα σημεία, τα όργανα, τις σελίδες που ανοίγουν και τις παγίδες που μπορεί να τους ξεγελάσουν. Διάλεξε μία και το σχέδιο είναι μισογραμμένο.'],
            stamp: ['Kleanthis · field lesson', 'Κλεάνθης · μάθημα πεδίου'],
            facts: [
              ['Three pages print: the lesson, the assessment, and the sheet they take outside.', 'Εκτυπώνονται τρεις σελίδες: το μάθημα, η αξιολόγηση και το φύλλο που παίρνουν έξω.'],
              ['Nothing is stored. The whole plan lives in the link, so a colleague opens it from an email.', 'Δεν αποθηκεύεται τίποτα. Όλο το σχέδιο ζει στον σύνδεσμο, ώστε ένας συνάδελφος να το ανοίγει από ένα email.'],
              ['Tell it your class’s age and it suggests the changes — you press to accept.', 'Πες του την ηλικία της τάξης σου και προτείνει τις αλλαγές — εσύ πατάς για να τις δεχτείς.'],
            ],
          },
          fields: [
            { key: 'q', kind: 'one', opts: QUESTIONS, short: ['Question', 'Ερώτηση'],
              step: { title: ['The question', 'Η ερώτηση'], hint: ['Everything follows from this: what they measure, where they stand, which pages they open.', 'Όλα προκύπτουν από αυτή: τι μετρούν, πού στέκονται, ποιες σελίδες ανοίγουν.'] } },
            { key: 'y', kind: 'one', opts: YEARS, short: ['Age of the class', 'Ηλικία της τάξης'],
              step: { title: ['Age of the class', 'Ηλικία της τάξης'], hint: ['This changes what the plan asks them to work out, not the question itself.', 'Αυτό αλλάζει τι ζητά το σχέδιο να υπολογίσουν, όχι την ίδια την ερώτηση.'] } },
            { key: 'd', kind: 'one', opts: LENGTH, short: ['How long', 'Διάρκεια'],
              step: { title: ['How long', 'Πόση ώρα'], hint: ['One lesson keeps it to one measurement. Longer lets them repeat, which is what makes it science.', 'Ένα μάθημα κρατά μία μέτρηση. Περισσότερος χρόνος επιτρέπει επανάληψη, που είναι και η ουσία.'] } },
            { key: 'stops', kind: 'many', opts: STOPS, max: 6, atLeastOne: true, short: ['Stops', 'Σημεία'],
              step: { title: ['Where the class goes', 'Πού πηγαίνει η τάξη'], hint: ['Each stop becomes three rows on the sheet they carry. The plan carries a safety line: inside the gate unless a second adult is with them, no road crossing, the street read from the pavement, nobody photographed.',
                'Κάθε σημείο γίνεται τρεις γραμμές στο φύλλο τους. Το σχέδιο κουβαλά γραμμή ασφάλειας: εντός της πύλης εκτός αν συνοδεύει δεύτερος ενήλικας, χωρίς διάσχιση δρόμου, ο δρόμος μετριέται από το πεζοδρόμιο, κανείς δεν φωτογραφίζεται.'] } },
            { key: 'meas', kind: 'many', opts: MEASURES, max: 5, atLeastOne: true, short: ['What they record', 'Τι καταγράφουν'],
              step: { title: ['What they record', 'Τι καταγράφουν'], hint: ['Two or three is plenty: each one is another column to fill in at every stop.', 'Δύο ή τρία αρκούν: κάθε επιπλέον είναι άλλη μια στήλη σε κάθε σημείο.'] } },
            { key: 'aim', kind: 'text', max: 160, short: ['The aim', 'Ο σκοπός'],
              step: { title: ['The aim, in your own words', 'Ο σκοπός, με δικά σου λόγια'], hint: ['Leave it empty and the plan keeps the aim written for this question.', 'Άσ’ το κενό και το σχέδιο κρατά τον σκοπό που είναι γραμμένος για αυτή την ερώτηση.'] } },
            { key: 'share', kind: 'one', opts: SHARE, short: ['Who hears it', 'Ποιος το ακούει'],
              step: { title: ['Who hears the result', 'Ποιος ακούει το αποτέλεσμα'], hint: ['A measurement nobody hears about stops being useful the moment the bell goes.', 'Μια μέτρηση που δεν τη μαθαίνει κανείς παύει να χρησιμεύει μόλις χτυπήσει το κουδούνι.'] } },
          ],
          // a question arrives with the stops and measures it was written for, so the plan is half written at once
          seed: (o, S) => {
            S.stops = (o.stops || []).slice();
            S.meas = (o.meas || []).slice();
            if (!S.y) S.y = '12-15';
            if (!S.d) S.d = '2x45';
          },
          plan,
          chat: { summary },
        });
      }).catch(() => { if (alive) root.append(el('div', { class: 'err', role: 'alert' }, T('The lesson builder could not be loaded.', 'Το εργαλείο δεν φόρτωσε.'))); });
      return () => { alive = false; if (stop) stop(); };
    },
  });
}());
