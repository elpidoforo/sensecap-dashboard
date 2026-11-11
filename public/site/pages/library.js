/*
  Library: four tabs and one search box.
    #/library                              opens on the handbook
    #/library?tab=handbook|guides|sources|glossary   opens that tab
    #/library?tab=guides&doc=<title>       opens one page of the handbook or one sensor guide (title, or the sensor name for a guide)
    #/library?tab=glossary&term=<term>     opens at one glossary term;  &q=<text> starts with a search
  Sources: GET /app/api/handbook/public -> { docs:[{ title, body, updated_at }] }   (the handbook and the "Sensor guide: ..." pages)
           GET /api/feeds -> { feeds:[{ id, name, what, home, enabled, lastOk, lastError, ok24h, fail24h, everyMin }] }
           (when /api/feeds is not there yet the tab shows the static list of the five sources and says that live status is missing)
  The glossary is written here (29 terms, English and Greek). Search looks in all four tabs and shows how many matches each has.
  Nothing on this page is invented: a missing source says so. No student names, no positions.
*/
(function () {
  'use strict';
  const T = SC.t, el = SC.el;
  SC.css('/site/pages/library.css');

  const GUIDE_RE = /^\s*sensor guide\s*[:\-–]\s*/i;
  const fold = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = (q) => fold(q).split(/\s+/).filter(Boolean);
  const hit = (hay, ws) => !ws.length || ws.every((w) => fold(hay).includes(w));
  const dateOf = (v) => { const n = typeof v === 'number' ? v : Date.parse(v); return isFinite(n) && n > 0 ? n : null; };

  /* ---------- the glossary (written for this site) ---------- */
  // g: air = air and sensors, wx = weather, data = working with data, ours = how this project handles data
  const GL = [
    { id: 'pm25', g: 'air', en: ['PM2.5', 'Tiny particles in the air, smaller than 2.5 micrometres, counted in micrograms per cubic metre (µg/m³). They are small enough to go deep into the lungs. Traffic, smoke and dust all add to them.'],
      el: ['PM2.5 (λεπτά σωματίδια)', 'Πολύ μικρά σωματίδια στον αέρα, μικρότερα από 2,5 μικρόμετρα, που μετριούνται σε μικρογραμμάρια ανά κυβικό μέτρο (µg/m³). Είναι αρκετά μικρά για να φτάσουν βαθιά στους πνεύμονες. Τα αυξάνουν η κυκλοφορία, ο καπνός και η σκόνη.'] },
    { id: 'pm10', g: 'air', en: ['PM10', 'Particles in the air smaller than 10 micrometres. They include dust and sand. In Cyprus they rise sharply when dust arrives from the Sahara.'],
      el: ['PM10', 'Σωματίδια στον αέρα μικρότερα από 10 μικρόμετρα. Περιλαμβάνουν σκόνη και άμμο. Στην Κύπρο αυξάνονται έντονα όταν φτάνει σκόνη από τη Σαχάρα.'] },
    { id: 'ugm3', g: 'air', en: ['µg/m³ (micrograms per cubic metre)', 'How much of a substance is in one cubic metre of air. One microgram is a millionth of a gram.'],
      el: ['µg/m³ (μικρογραμμάρια ανά κυβικό μέτρο)', 'Πόση ποσότητα μιας ουσίας υπάρχει σε ένα κυβικό μέτρο αέρα. Ένα μικρογραμμάριο είναι το ένα εκατομμυριοστό του γραμμαρίου.'] },
    { id: 'co2', g: 'air', en: ['CO2 (carbon dioxide)', 'A gas we breathe out. Outdoors it is about 420 ppm. In a crowded room or bus it climbs, and above about 1000 ppm people often say the air feels stuffy. It shows how much fresh air gets in. At these levels it is not a poison.'],
      el: ['CO2 (διοξείδιο του άνθρακα)', 'Αέριο που εκπνέουμε. Στο ύπαιθρο είναι περίπου 420 ppm. Σε γεμάτη αίθουσα ή λεωφορείο ανεβαίνει, και πάνω από περίπου 1000 ppm οι άνθρωποι συχνά λένε ότι ο αέρας είναι αποπνικτικός. Δείχνει πόσος καθαρός αέρας μπαίνει. Σε αυτά τα επίπεδα δεν είναι δηλητηριώδες.'] },
    { id: 'ppm', g: 'air', en: ['ppm (parts per million)', 'A way to say how much of a gas is in the air. 420 ppm means 420 parts of the gas in every million parts of air.'],
      el: ['ppm (μέρη ανά εκατομμύριο)', 'Τρόπος να πούμε πόσο αέριο υπάρχει στον αέρα. 420 ppm σημαίνει 420 μέρη του αερίου σε κάθε εκατομμύριο μέρη αέρα.'] },
    { id: 'rh', g: 'wx', en: ['Relative humidity (%RH)', 'How full of water vapour the air is, compared with the most it could hold at that temperature. Warm air holds more, so the same air shows a lower humidity when it warms up.'],
      el: ['Σχετική υγρασία (%RH)', 'Πόσο γεμάτος με υδρατμούς είναι ο αέρας, σε σχέση με το μέγιστο που μπορεί να κρατήσει στη συγκεκριμένη θερμοκρασία. Ο ζεστός αέρας κρατά περισσότερους, οπότε ο ίδιος αέρας δείχνει χαμηλότερη υγρασία όταν ζεσταίνεται.'] },
    { id: 'dew', g: 'wx', en: ['Dew point', 'The temperature at which the air would be full of water vapour and dew starts to form. A dew point of about 20 °C or more usually feels muggy.'],
      el: ['Σημείο δρόσου', 'Η θερμοκρασία στην οποία ο αέρας γεμίζει με υδρατμούς και αρχίζει να σχηματίζεται δροσιά. Σημείο δρόσου γύρω στους 20 °C ή περισσότερο συνήθως δίνει αίσθηση πνιγηρού καιρού.'] },
    { id: 'pressure', g: 'wx', en: ['Barometric pressure', 'The weight of the air above us. It tends to fall before storms and rise in settled weather. At sea level it is about 1013 hPa. Some sensors give it in pascals (1 hPa = 100 Pa).'],
      el: ['Ατμοσφαιρική πίεση', 'Το βάρος του αέρα πάνω από εμάς. Συνήθως πέφτει πριν από καταιγίδες και ανεβαίνει σε σταθερό καιρό. Στη στάθμη της θάλασσας είναι περίπου 1013 hPa. Ορισμένοι αισθητήρες την αναφέρουν σε pascal (1 hPa = 100 Pa).'] },
    { id: 'pmsl', g: 'wx', en: ['Sea-level pressure (pmsl)', 'Pressure corrected as if the station stood at sea level, so stations at different heights can be compared. Our station tables show it as pmsl.'],
      el: ['Πίεση στάθμης θάλασσας (pmsl)', 'Πίεση διορθωμένη σαν ο σταθμός να βρισκόταν στη στάθμη της θάλασσας, ώστε σταθμοί σε διαφορετικά υψόμετρα να συγκρίνονται. Στους πίνακες σταθμών εμφανίζεται ως pmsl.'] },
    { id: 'lux', g: 'air', en: ['Lux (light intensity)', 'A measure of how bright it is. A dim room is around 100 lux, a bright office a few hundred, and full sunshine tens of thousands.'],
      el: ['Lux (ένταση φωτός)', 'Μέτρο του πόσο φωτεινά είναι τα πράγματα. Ένα αμυδρά φωτισμένο δωμάτιο έχει γύρω στα 100 lux, ένα φωτεινό γραφείο μερικές εκατοντάδες και ο πλήρης ήλιος δεκάδες χιλιάδες.'] },
    { id: 'discomfort', g: 'wx', en: ['Discomfort index', 'One number that combines temperature and humidity to say how uncomfortable people feel. The Met Office publishes it for some stations.'],
      el: ['Δείκτης δυσφορίας', 'Ένας αριθμός που συνδυάζει θερμοκρασία και υγρασία για να δείξει πόσο άβολα νιώθουν οι άνθρωποι. Η Μετεωρολογική Υπηρεσία τον δημοσιεύει για ορισμένους σταθμούς.'] },
    { id: 'beaufort', g: 'wx', en: ['Beaufort scale', 'A scale from 0 to 12 that describes wind by what you can see: 0 is calm, 4 moves small branches, 8 is a gale and 12 is a hurricane.'],
      el: ['Κλίμακα Μποφόρ', 'Κλίμακα από 0 έως 12 που περιγράφει τον άνεμο από ό,τι βλέπουμε: 0 είναι νηνεμία, 4 κινεί μικρά κλαδιά, 8 είναι θυελλώδης άνεμος και 12 είναι τυφώνας.'] },
    { id: 'gust', g: 'wx', en: ['Wind gust', 'A short burst of stronger wind, usually a few seconds long. A gust can be much stronger than the average wind speed.'],
      el: ['Ριπή ανέμου', 'Μια σύντομη έκρηξη πιο δυνατού ανέμου, συνήθως λίγων δευτερολέπτων. Η ριπή μπορεί να είναι πολύ ισχυρότερη από τη μέση ταχύτητα του ανέμου.'] },
    { id: 'metar', g: 'wx', en: ['METAR', 'A coded weather report from an airport, issued about once an hour. Pilots use it. We show the reports for the Larnaka and Pafos airports.'],
      el: ['METAR', 'Κωδικοποιημένο δελτίο καιρού από αεροδρόμιο, που εκδίδεται περίπου μία φορά την ώρα. Το χρησιμοποιούν οι πιλότοι. Εμείς δείχνουμε τα δελτία των αεροδρομίων Λάρνακας και Πάφου.'] },
    { id: 'aws', g: 'wx', en: ['Automatic weather station', 'A weather station that measures and sends its readings by itself, with no person needed. The Met Office has about 54 of them across Cyprus, and each reports about every 10 minutes.'],
      el: ['Αυτόματος μετεωρολογικός σταθμός', 'Σταθμός που μετρά και στέλνει μόνος του τις μετρήσεις, χωρίς να χρειάζεται άνθρωπος. Η Μετεωρολογική Υπηρεσία έχει περίπου 54 σε όλη την Κύπρο και ο καθένας αναφέρει περίπου κάθε 10 λεπτά.'] },
    { id: 'dom', g: 'wx', en: ['Met Office (Department of Meteorology)', 'The official weather service of Cyprus. Its warnings, forecasts and station readings are the reference we compare our own sensors with.'],
      el: ['Μετεωρολογική Υπηρεσία (Τμήμα Μετεωρολογίας)', 'Η επίσημη μετεωρολογική υπηρεσία της Κύπρου. Οι προειδοποιήσεις, οι προγνώσεις και οι μετρήσεις των σταθμών της είναι η αναφορά με την οποία συγκρίνουμε τους δικούς μας αισθητήρες.'] },
    { id: 'model', g: 'data', en: ['Model estimate', 'A number worked out by a computer model from other data, not measured at that place. Open-Meteo values are model estimates, so they can be off near mountains and coasts.'],
      el: ['Εκτίμηση μοντέλου', 'Αριθμός που υπολογίζεται από μοντέλο υπολογιστή με βάση άλλα δεδομένα, χωρίς να μετρηθεί στο συγκεκριμένο σημείο. Οι τιμές του Open-Meteo είναι εκτιμήσεις μοντέλου, οπότε μπορεί να αποκλίνουν κοντά σε βουνά και ακτές.'] },
    { id: 'aggregation', g: 'data', en: ['Aggregation', 'Combining many readings into one number, for example a 10-minute, hourly or daily average, a maximum or a count. It makes a long record easy to read, but it hides short spikes.'],
      el: ['Συνάθροιση', 'Ο συνδυασμός πολλών μετρήσεων σε έναν αριθμό, π.χ. μέσος όρος 10 λεπτών, ωριαίος ή ημερήσιος, μέγιστο ή πλήθος. Κάνει ένα μακρύ ιστορικό εύκολο στην ανάγνωση, αλλά κρύβει τις σύντομες αιχμές.'] },
    { id: 'mean', g: 'data', en: ['Average (mean)', 'All the values added up and divided by how many there are. One very high or very low reading can pull it away from what is typical.'],
      el: ['Μέσος όρος', 'Όλες οι τιμές προστίθενται και διαιρούνται με το πλήθος τους. Μία πολύ υψηλή ή πολύ χαμηλή μέτρηση μπορεί να τον απομακρύνει από το τυπικό.'] },
    { id: 'median', g: 'data', en: ['Median', 'The middle value when the readings are put in order. Half are lower and half are higher, so one odd reading hardly changes it.'],
      el: ['Διάμεσος', 'Η μεσαία τιμή όταν οι μετρήσεις τοποθετηθούν σε σειρά. Οι μισές είναι χαμηλότερες και οι μισές υψηλότερες, οπότε μία παράξενη μέτρηση σχεδόν δεν τον αλλάζει.'] },
    { id: 'outlier', g: 'data', en: ['Outlier', 'A reading far from the others. It can be real, for example a sensor next to a hot engine, or a fault. Check it before you trust it or delete it.'],
      el: ['Ακραία τιμή', 'Μια μέτρηση πολύ μακριά από τις υπόλοιπες. Μπορεί να είναι αληθινή, π.χ. αισθητήρας δίπλα σε ζεστό κινητήρα, ή βλάβη. Ελέγξτε την πριν την εμπιστευτείτε ή τη διαγράψετε.'] },
    { id: 'calibration', g: 'air', en: ['Calibration', 'Checking a sensor against a trusted reference and adjusting it so that it reads correctly. Low-cost sensors drift over time, so they need checking.'],
      el: ['Βαθμονόμηση', 'Έλεγχος ενός αισθητήρα με μια αξιόπιστη αναφορά και ρύθμισή του ώστε να μετρά σωστά. Οι αισθητήρες χαμηλού κόστους αποκλίνουν με τον χρόνο, γι’ αυτό χρειάζονται έλεγχο.'] },
    { id: 'interval', g: 'data', en: ['Sampling interval', 'How often a sensor takes or sends a reading, for example every 10 minutes. A short event can happen between two readings and never show up.'],
      el: ['Διάστημα δειγματοληψίας', 'Κάθε πόσο ένας αισθητήρας παίρνει ή στέλνει μέτρηση, π.χ. κάθε 10 λεπτά. Ένα σύντομο γεγονός μπορεί να συμβεί ανάμεσα σε δύο μετρήσεις και να μη φανεί ποτέ.'] },
    { id: 'stale', g: 'data', en: ['Stale reading', 'A reading that is old. This site marks data as old when the newest reading is hours behind, so that nobody mistakes yesterday’s number for now.'],
      el: ['Παλιά μέτρηση', 'Μια μέτρηση που έχει παλιώσει. Ο ιστότοπος σημειώνει τα δεδομένα ως παλιά όταν η νεότερη μέτρηση έχει καθυστέρηση ωρών, ώστε κανείς να μη θεωρήσει τον χθεσινό αριθμό σημερινό.'] },
    { id: 'dust', g: 'air', en: ['Saharan dust', 'Fine sand carried by the wind from the Sahara. It turns the sky yellow-brown and raises PM10 strongly, often for a day or two.'],
      el: ['Σκόνη από τη Σαχάρα', 'Λεπτή άμμος που μεταφέρεται με τον άνεμο από τη Σαχάρα. Κιτρινίζει τον ουρανό και αυξάνει έντονα το PM10, συχνά για μία ή δύο μέρες.'] },
    { id: 'cell', g: 'ours', en: ['Route square', 'A square of about 1 km on the map. Vehicle trips are grouped into squares and shown at least 2 hours late, so nobody can follow a vehicle. The Districts page draws them.'],
      el: ['Τετράγωνο διαδρομής', 'Ένα τετράγωνο περίπου 1 χλμ στον χάρτη. Οι διαδρομές των οχημάτων ομαδοποιούνται σε τετράγωνα και εμφανίζονται με καθυστέρηση τουλάχιστον 2 ωρών, ώστε κανείς να μην μπορεί να ακολουθήσει ένα όχημα. Η σελίδα Επαρχίες τα σχεδιάζει.'] },
    { id: 'delayed', g: 'ours', en: ['Delayed position', 'Public pages show a vehicle where it was at least 2 hours ago, rounded to about 1 km, and never its live position. Text says “about 1 km from the nearest school or town, about 2 hours ago”.'],
      el: ['Θέση με καθυστέρηση', 'Οι δημόσιες σελίδες δείχνουν ένα όχημα εκεί που ήταν πριν από τουλάχιστον 2 ώρες, στρογγυλοποιημένη στο 1 χλμ, και ποτέ τη ζωντανή του θέση. Το κείμενο λέει «περίπου 1 χλμ από το πλησιέστερο σχολείο ή πόλη, πριν από περίπου 2 ώρες».'] },
    { id: 'who', g: 'air', en: ['WHO guideline', 'Health advice levels from the World Health Organization. For PM2.5 they are 15 µg/m³ as a 24-hour average and 5 µg/m³ as a yearly average (2021).'],
      el: ['Οδηγία ΠΟΥ', 'Επίπεδα συμβουλών υγείας από τον Παγκόσμιο Οργανισμό Υγείας. Για το PM2.5 είναι 15 µg/m³ ως μέσος όρος 24 ωρών και 5 µg/m³ ως ετήσιος μέσος όρος (2021).'] },
    { id: 'aqi', g: 'air', en: ['Air quality index', 'One number or colour that sums up how clean the air is, built from several pollutants. Countries use different scales, so only compare numbers from the same scale.'],
      el: ['Δείκτης ποιότητας αέρα', 'Ένας αριθμός ή χρώμα που συνοψίζει πόσο καθαρός είναι ο αέρας, με βάση διάφορους ρύπους. Οι χώρες χρησιμοποιούν διαφορετικές κλίμακες, γι’ αυτό συγκρίνετε μόνο αριθμούς από την ίδια κλίμακα.'] },
  ];
  const GROUPS = [['all', 'All', 'Όλα'], ['air', 'Air and sensors', 'Αέρας και αισθητήρες'], ['wx', 'Weather', 'Καιρός'], ['data', 'Working with data', 'Δουλεύοντας με δεδομένα'], ['ours', 'How we show it', 'Πώς το δείχνουμε']];

  /* ---------- the five sources, when the live list is not there ---------- */
  const STATIC_FEEDS = [
    { id: 'sensecap', name: 'SenseCAP', what: ['Our own sensors on buses, cars and in classrooms. This is measured data.', 'Οι δικοί μας αισθητήρες σε λεωφορεία, αυτοκίνητα και αίθουσες. Είναι μετρημένα δεδομένα.'], home: 'https://sensecap.seeed.cc' },
    { id: 'dom', name: 'Cyprus Met Office', what: ['About 54 automatic stations, warnings, forecast and radar, updated about every 10 minutes.', 'Περίπου 54 αυτόματοι σταθμοί, προειδοποιήσεις, πρόγνωση και ραντάρ, με ενημέρωση περίπου ανά 10 λεπτά.'], home: 'https://www.dom.org.cy' },
    { id: 'openmeteo', name: 'Open-Meteo', what: ['A weather and air-quality computer model on a grid over Cyprus. A model estimate, not a measurement.', 'Μοντέλο καιρού και ποιότητας αέρα σε πλέγμα πάνω από την Κύπρο. Εκτίμηση μοντέλου, όχι μέτρηση.'], home: 'https://open-meteo.com' },
    { id: 'sensorcommunity', name: 'Sensor.Community', what: ['Particle sensors run by volunteers. Useful for the idea, but a single sensor can be wrong.', 'Αισθητήρες σωματιδίων που τρέχουν εθελοντές. Χρήσιμοι ως ιδέα, αλλά ένας μεμονωμένος αισθητήρας μπορεί να κάνει λάθος.'], home: 'https://sensor.community' },
    { id: 'metar', name: 'Airport METAR', what: ['Weather reports from Larnaka and Pafos airports, about once an hour.', 'Δελτία καιρού από τα αεροδρόμια Λάρνακας και Πάφου, περίπου μία φορά την ώρα.'], home: 'https://aviationweather.gov' },
  ];

  /* ---------- text pieces ---------- */
  function mark(text, ws) {   // [nodes]: text with the searched words in <mark>
    text = String(text == null ? '' : text);
    if (!ws.length || !text) return [text];
    const f = Array.from(text).map((c) => fold(c)).join('');
    if (f.length !== text.length) return [text];
    const spans = [];
    ws.forEach((w) => { let i = f.indexOf(w); while (i >= 0) { spans.push([i, i + w.length]); i = f.indexOf(w, i + w.length); } });
    if (!spans.length) return [text];
    spans.sort((a, b) => a[0] - b[0]);
    const out = []; let at = 0, cur = null;
    const merged = [];
    spans.forEach((s) => { if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]); else { cur = [s[0], s[1]]; merged.push(cur); } });
    merged.forEach((s) => { if (s[0] > at) out.push(text.slice(at, s[0])); out.push(el('mark', null, text.slice(s[0], s[1]))); at = s[1]; });
    if (at < text.length) out.push(text.slice(at));
    return out;
  }
  function snippet(body, ws, n) {
    const text = String(body || '').replace(/\s+/g, ' ').trim();
    n = n || 150;
    if (!text) return '';
    if (ws.length) {
      const f = fold(text);
      const i = f.length === text.length ? f.indexOf(ws.find((w) => f.includes(w)) || '\u0000') : -1;
      if (i > 60) { const s = text.lastIndexOf(' ', i - 40); return '… ' + text.slice(s > 0 ? s + 1 : 0, (s > 0 ? s + 1 : 0) + n); }
    }
    return text.length > n ? text.slice(0, text.lastIndexOf(' ', n) > 40 ? text.lastIndexOf(' ', n) : n) + ' …' : text;
  }
  // body text -> paragraphs, lists and small headings. Text only, never HTML.
  function blocks(body, ws) {
    const out = []; let list = null;
    const flush = () => { list = null; };
    String(body || '').split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      let m;
      if ((m = line.match(/^#{1,4}\s+(.*)$/))) { flush(); out.push(el('h3', { class: 'lb-h3' }, mark(m[1], ws))); return; }
      if ((m = line.match(/^[-*•]\s+(.*)$/))) { if (!list || list.tagName !== 'UL') { list = el('ul'); out.push(list); } list.append(el('li', null, mark(m[1], ws))); return; }
      if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { if (!list || list.tagName !== 'OL') { list = el('ol'); out.push(list); } list.append(el('li', null, mark(m[1], ws))); return; }
      flush();
      out.push(el('p', null, mark(line, ws)));
    });
    return out;
  }

  SC.register('library', {
    title: ['Library', 'Βιβλιοθήκη'],
    async render(root, ctx) {
      const TABS = [['handbook', T('Handbook', 'Εγχειρίδιο')], ['guides', T('Sensor guides', 'Οδηγοί αισθητήρων')], ['sources', T('Data sources', 'Πηγές δεδομένων')], ['glossary', T('Glossary', 'Γλωσσάρι')]];
      const q0 = ctx.query;
      const S = {
        tab: TABS.some((x) => x[0] === q0.get('tab')) ? q0.get('tab') : 'handbook', q: (q0.get('q') || '').slice(0, 80),
        doc: { handbook: null, guides: null }, group: 'all', term: q0.get('term') || null,
        docs: null, docsErr: null, feeds: null, feedsErr: null, feedsStatic: false,
      };
      if (q0.get('doc')) S.pendingDoc = q0.get('doc');
      let alive = true;

      const cfg = await SC.cached('/api/config', 600000).catch(() => null);
      root.append(SC.head({
        title: T('Library', 'Βιβλιοθήκη'),
        tags: cfg && cfg.demo ? [{ text: T('Demo data', 'Δεδομένα επίδειξης'), cls: 'demo' }] : [],
        lede: T('The handbook the assistant reads, one guide for each kind of sensor, where our numbers come from, and a glossary in English and Greek. One search box looks in all four.',
          'Το εγχειρίδιο που διαβάζει ο βοηθός, ένας οδηγός για κάθε είδος αισθητήρα, από πού προέρχονται οι αριθμοί μας και ένα γλωσσάρι σε αγγλικά και ελληνικά. Ένα πλαίσιο αναζήτησης ψάχνει και στις τέσσερις καρτέλες.'),
        help: [
          'Pick a tab, or type in the search box: the number on each tab is how many pages, sources or terms match. The handbook and the sensor guides are written by teachers and are the same pages the assistant reads. Open a page and press “Copy link” to share it. The glossary is available in English and Greek: open “Show in Greek” on a term.',
          'Επιλέξτε καρτέλα ή πληκτρολογήστε στο πλαίσιο αναζήτησης: ο αριθμός σε κάθε καρτέλα δείχνει πόσες σελίδες, πηγές ή όροι ταιριάζουν. Το εγχειρίδιο και οι οδηγοί αισθητήρων γράφονται από εκπαιδευτικούς και είναι οι ίδιες σελίδες που διαβάζει ο βοηθός. Ανοίξτε μια σελίδα και πατήστε «Αντιγραφή συνδέσμου» για να τη μοιραστείτε. Το γλωσσάρι είναι διαθέσιμο σε αγγλικά και ελληνικά: ανοίξτε το «Εμφάνιση στα αγγλικά» σε έναν όρο.',
        ],
      }));

      /* search + tabs */
      const input = el('input', { class: 'nm-input lb-q', type: 'search', placeholder: T('Search the handbook, guides, sources and glossary…', 'Αναζήτηση σε εγχειρίδιο, οδηγούς, πηγές και γλωσσάρι…'), 'aria-label': T('Search the library', 'Αναζήτηση στη βιβλιοθήκη'), value: S.q, autocomplete: 'off', spellcheck: 'false' });
      const clear = el('button', { class: 'lb-clear', type: 'button', 'aria-label': T('Clear the search', 'Καθαρισμός αναζήτησης'), onclick: () => { input.value = ''; setQ(''); input.focus(); } }, SC.icon('close', 16));
      const searchBox = el('div', { class: 'lb-search' }, SC.icon('search', 18), input, clear);
      const pills = el('div', { class: 'nm-pillbar lb-pills', role: 'tablist', 'aria-label': T('Library tabs', 'Καρτέλες βιβλιοθήκης') });
      const bar = el('div', { class: 'lb-bar' }, pills, searchBox);
      const panel = el('div', { class: 'lb-panel', role: 'tabpanel', tabindex: '-1' });
      root.append(bar, panel);

      /* ---------- data ---------- */
      const guides = () => (S.docs || []).filter((d) => GUIDE_RE.test(d.title));
      const handbook = () => (S.docs || []).filter((d) => !GUIDE_RE.test(d.title));
      const guideName = (d) => d.title.replace(GUIDE_RE, '');
      const feedList = () => S.feeds || [];
      const ws = () => words(S.q);
      const docHit = (d) => hit(d.title + ' ' + d.body, ws());
      const feedHit = (f) => hit(f.name + ' ' + f.what, ws());
      const glHit = (t) => hit(t.en[0] + ' ' + t.en[1] + ' ' + t.el[0] + ' ' + t.el[1], ws());
      const counts = () => ({ handbook: handbook().filter(docHit).length, guides: guides().filter(docHit).length, sources: feedList().filter(feedHit).length, glossary: GL.filter(glHit).length });

      async function loadDocs() {
        S.docsErr = null;
        try {
          const r = await SC.api('/app/api/handbook/public');
          S.docs = (r && Array.isArray(r.docs) ? r.docs : []).filter((d) => d && d.title).map((d) => ({ title: String(d.title), body: String(d.body || ''), at: dateOf(d.updated_at) }))
            .sort((a, b) => a.title.localeCompare(b.title));
        } catch (e) { S.docs = null; S.docsErr = e; }
      }
      async function loadFeeds() {
        S.feedsErr = null; S.feedsStatic = false;
        try {
          const r = await SC.api('/api/feeds');
          const list = r && Array.isArray(r.feeds) ? r.feeds : [];
          S.feeds = list.map((f) => ({ id: f.id, name: f.name || f.id, what: f.what || '', home: f.home || '', enabled: f.enabled !== false, lastOk: dateOf(f.lastOk), lastError: f.lastError && f.lastError.message ? { at: dateOf(f.lastError.at), message: String(f.lastError.message) } : null,
            ok24h: Number(f.ok24h) || 0, fail24h: Number(f.fail24h) || 0, everyMin: Number(f.everyMin) || 0 }));
        } catch (e) {
          S.feedsErr = e; S.feedsStatic = true;
          S.feeds = STATIC_FEEDS.map((f) => ({ id: f.id, name: f.name, what: T(f.what[0], f.what[1]), home: f.home, enabled: null, lastOk: null, lastError: null, ok24h: 0, fail24h: 0, everyMin: 0, plain: true }));
        }
      }

      /* ---------- URL and state ---------- */
      function sync() {
        const p = new URLSearchParams();
        p.set('tab', S.tab);
        if (S.q) p.set('q', S.q);
        const sel = S.doc[S.tab];
        if ((S.tab === 'handbook' || S.tab === 'guides') && sel) p.set('doc', S.tab === 'guides' ? guideName(sel) : sel.title);
        if (S.tab === 'glossary' && S.term) p.set('term', S.term);
        try { history.replaceState(history.state, '', '#/library?' + p.toString()); } catch (e) { /* the address bar stays as it is */ }
      }
      let qTimer = 0;
      function setQ(v) { S.q = v.slice(0, 80); clear.hidden = !S.q; clearTimeout(qTimer); qTimer = setTimeout(() => { drawPills(); drawPanel(); sync(); }, 110); }
      input.addEventListener('input', () => setQ(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { input.value = ''; setQ(''); } });
      clear.hidden = !S.q;

      function openTab(id, focus) { S.tab = id; drawPills(); drawPanel(); sync(); if (focus) { const b = pills.querySelector('[aria-selected="true"]'); if (b) b.focus(); } }
      function drawPills() {
        const c = counts();
        pills.replaceChildren(...TABS.map(([id, label], i) => el('button', {
          type: 'button', role: 'tab', id: 'lb-tab-' + id, class: S.tab === id ? 'on' : '', 'aria-selected': S.tab === id ? 'true' : 'false', tabindex: S.tab === id ? '0' : '-1',
          onclick: () => openTab(id),
          onkeydown: (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); openTab(TABS[(i + d + TABS.length) % TABS.length][0], true); } },
        }, label, S.q ? el('span', { class: 'lb-n' + (c[id] ? '' : ' zero'), 'aria-label': T(c[id] + ' matches', c[id] + ' αποτελέσματα') }, String(c[id])) : null)));
        panel.setAttribute('aria-labelledby', 'lb-tab-' + S.tab);
      }

      /* ---------- shared bits ---------- */
      const errBox = (what, whatEl, e, retry) => el('div', { class: 'lb-err' },
        el('div', { class: 'err', role: 'alert' }, T('Could not load ' + what + '. ', 'Δεν φορτώθηκε ' + whatEl + '. '), e && e.message ? el('span', { class: 'muted' }, e.message) : null),
        el('div', null, el('button', { class: 'nm-btn', type: 'button', onclick: retry }, T('Try again', 'Δοκιμάστε ξανά'))));
      const noMatch = (here) => {
        const c = counts(), other = TABS.filter((x) => x[0] !== S.tab && c[x[0]] > 0);
        return el('div', { class: 'empty' }, T('Nothing in ' + here[0] + ' matches “' + S.q + '”.', 'Τίποτα στο «' + here[1] + '» δεν ταιριάζει με «' + S.q + '».'),
          other.length ? el('div', { class: 'lb-other' }, T('Matches in: ', 'Αποτελέσματα σε: '), other.map((x) => el('button', { class: 'lb-chipbtn', type: 'button', onclick: () => openTab(x[0]) }, x[1] + ' (' + c[x[0]] + ')'))) : el('div', { class: 'lb-other' }, T('Try a shorter word, or clear the search.', 'Δοκιμάστε μια πιο σύντομη λέξη ή καθαρίστε την αναζήτηση.')));
      };
      const copyLink = (label) => el('button', { class: 'nm-btn lb-copy', type: 'button', onclick: () => {
        const href = location.href;
        const done = () => SC.toast(T('Link copied.', 'Ο σύνδεσμος αντιγράφηκε.'));
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(href).then(done, () => SC.toast(href));
        else SC.toast(href);
      } }, SC.icon('external', 16), label || T('Copy link', 'Αντιγραφή συνδέσμου'));

      /* ---------- handbook and guides ---------- */
      function drawDocs(kind) {
        if (S.docsErr) { panel.replaceChildren(errBox(T('the handbook', 'το εγχειρίδιο'), T('the handbook', 'το εγχειρίδιο'), S.docsErr, async () => { panel.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); await loadDocs(); if (alive) { drawPills(); drawPanel(); } })); return; }
        const all = kind === 'guides' ? guides() : handbook();
        const list = all.filter(docHit);
        if (!all.length) {
          panel.replaceChildren(el('div', { class: 'empty' }, kind === 'guides'
            ? T('No sensor guides have been published yet. Teachers add pages titled “Sensor guide: …” in the student app, and they appear here.', 'Δεν έχουν δημοσιευτεί ακόμα οδηγοί αισθητήρων. Οι εκπαιδευτικοί προσθέτουν σελίδες με τίτλο «Sensor guide: …» στην εφαρμογή μαθητών και εμφανίζονται εδώ.')
            : T('The handbook has no public pages yet. Teachers write them in the student app.', 'Το εγχειρίδιο δεν έχει ακόμα δημόσιες σελίδες. Τις γράφουν οι εκπαιδευτικοί στην εφαρμογή μαθητών.')));
          return;
        }
        if (!list.length) { panel.replaceChildren(noMatch([kind === 'guides' ? 'Sensor guides' : 'Handbook', kind === 'guides' ? 'Οδηγοί αισθητήρων' : 'Εγχειρίδιο'])); return; }
        // which page is open
        if (S.pendingDoc) {
          const want = fold(S.pendingDoc), w2 = fold(S.pendingDoc.replace(GUIDE_RE, ''));
          const m = all.find((d) => fold(d.title) === want || fold(guideName(d)) === w2);
          if (m) S.doc[kind] = m; else if (S.tab === kind) S.doc[kind] = null;
          S.pendingDoc = null;
        }
        if (!S.doc[kind] || !list.includes(S.doc[kind])) S.doc[kind] = list[0];
        const sel = S.doc[kind], w = ws();
        const listEl = el('ul', { class: 'lb-list', 'aria-label': kind === 'guides' ? T('Sensor guides', 'Οδηγοί αισθητήρων') : T('Handbook pages', 'Σελίδες εγχειριδίου') },
          list.map((d, i) => el('li', null, el('button', { type: 'button', class: 'lb-item' + (d === sel ? ' on' : ''), 'aria-current': d === sel ? 'true' : null, 'data-i': String(i), onclick: () => { S.doc[kind] = d; sync(); drawDocs(kind); const r = panel.querySelector('.lb-read'); if (r && matchMedia('(max-width: 899px)').matches) r.scrollIntoView({ block: 'start' }); } },
            el('b', null, mark(kind === 'guides' ? guideName(d) : d.title, w)), el('span', null, mark(snippet(d.body, w, 110), w))))));
        const read = el('article', { class: 'nm-card lb-read', 'aria-live': 'polite' },
          el('div', { class: 'lb-read-top' }, el('div', null, el('div', { class: 'card-eye' }, kind === 'guides' ? T('Sensor guide', 'Οδηγός αισθητήρα') : T('Handbook', 'Εγχειρίδιο')),
            el('h2', { class: 'card-h' }, mark(kind === 'guides' ? guideName(sel) : sel.title, w))), copyLink()),
          sel.at ? el('p', { class: 'lb-upd muted' }, T('Updated ' + SC.date(sel.at), 'Ενημερώθηκε ' + SC.date(sel.at))) : null,
          el('div', { class: 'lb-body' }, blocks(sel.body, w)),
          el('div', { class: 'lb-read-foot' }, el('span', { class: 't team' }, T('Written by teachers', 'Γραμμένο από εκπαιδευτικούς')), el('span', { class: 'muted' }, T('The assistant reads this page too.', 'Αυτή τη σελίδα τη διαβάζει και ο βοηθός.')),
            kind === 'guides' ? el('a', { class: 'pill-link', href: '#/guides?doc=' + encodeURIComponent(guideName(sel)) }, T('See it next to live readings', 'Δείτε το δίπλα στις ζωντανές μετρήσεις'), SC.icon('arrow', 14)) : null));
        panel.replaceChildren(el('div', { class: 'lb-docs' }, el('div', { class: 'lb-listwrap' }, el('div', { class: 'lb-count muted' }, S.q ? T(list.length + ' of ' + all.length + ' match', list.length + ' από ' + all.length + ' ταιριάζουν') : T(all.length + (all.length === 1 ? ' page' : ' pages'), all.length + (all.length === 1 ? ' σελίδα' : ' σελίδες'))), listEl), read));
      }

      /* ---------- data sources ---------- */
      function feedState(f) {
        if (f.plain) return ['info', T('Status not available', 'Η κατάσταση δεν είναι διαθέσιμη')];
        if (!f.enabled) return ['warn', T('Switched off', 'Απενεργοποιημένη')];
        const err = f.lastError && f.lastError.at && (!f.lastOk || f.lastError.at > f.lastOk);
        if (err) return ['bad', T('Problem', 'Πρόβλημα')];
        if (!f.lastOk) return ['info', T('No reading yet', 'Καμία μέτρηση ακόμα')];
        const every = (f.everyMin || 10) * 60000;
        if (Date.now() - f.lastOk > every * 3 + 120000) return ['warn', T('Late', 'Καθυστερεί')];
        return ['ok', T('Working', 'Λειτουργεί')];
      }
      function drawSources() {
        const all = feedList(), list = all.filter(feedHit), w = ws();
        if (!all.length) { panel.replaceChildren(el('div', { class: 'empty' }, T('No data sources are listed.', 'Δεν υπάρχουν καταχωρισμένες πηγές δεδομένων.'))); return; }
        if (!list.length) { panel.replaceChildren(noMatch(['Data sources', 'Πηγές δεδομένων'])); return; }
        const wrap = el('div', { class: 'lb-src' });
        if (S.feedsStatic) wrap.append(el('div', { class: 'nm-callout nm-callout--warn lb-note' }, T('Live status is not available right now, so this is only the list of sources.', 'Η ζωντανή κατάσταση δεν είναι διαθέσιμη αυτή τη στιγμή, οπότε εμφανίζεται μόνο η λίστα των πηγών.'),
          ' ', el('button', { class: 'link', type: 'button', onclick: async () => { await loadFeeds(); if (alive) { drawPills(); drawPanel(); } } }, T('Check again', 'Έλεγχος ξανά'))));
        const grid = el('div', { class: 'cols-3 lb-feeds' });
        list.forEach((f) => {
          const [cls, txt] = feedState(f);
          const tot = f.ok24h + f.fail24h;
          grid.append(el('article', { class: 'nm-card lb-feed' },
            el('div', { class: 'lb-feed-top' }, el('h3', null, mark(f.name, w)), f.plain && cls === 'info' ? null : el('span', { class: 'nm-badge nm-badge--' + cls }, txt)),
            el('p', { class: 'lb-what' }, mark(f.what, w)),
            f.plain ? null : el('dl', { class: 'lb-dl' },
              el('div', null, el('dt', null, T('Last good reading', 'Τελευταία επιτυχία')), el('dd', null, f.lastOk ? SC.ago(f.lastOk) : T('none yet', 'καμία ακόμα'))),
              el('div', null, el('dt', null, T('Checked', 'Έλεγχος')), el('dd', null, f.everyMin ? T('every ' + f.everyMin + ' min', 'ανά ' + f.everyMin + ' λεπτά') : '–'))),
            !f.plain && tot ? el('div', { class: 'lb-health' },
              el('div', { class: 'lb-hbar', role: 'img', 'aria-label': T(f.ok24h + ' good and ' + f.fail24h + ' failed checks in 24 hours', f.ok24h + ' επιτυχείς και ' + f.fail24h + ' αποτυχημένοι έλεγχοι σε 24 ώρες') },
                el('i', { class: 'ok', style: { width: (f.ok24h / tot * 100) + '%' } }), f.fail24h ? el('i', { class: 'bad', style: { width: (f.fail24h / tot * 100) + '%' } }) : null),
              el('small', null, T('Last 24 hours: ' + f.ok24h + ' good, ' + f.fail24h + ' failed', 'Τελευταίες 24 ώρες: ' + f.ok24h + ' επιτυχείς, ' + f.fail24h + ' αποτυχημένοι'))) : (!f.plain ? el('small', { class: 'muted' }, T('No checks in the last 24 hours.', 'Κανένας έλεγχος τις τελευταίες 24 ώρες.')) : null),
            f.lastError ? el('p', { class: 'lb-lasterr' }, T('Last problem' + (f.lastError.at ? ' (' + SC.ago(f.lastError.at) + ')' : '') + ': ', 'Τελευταίο πρόβλημα' + (f.lastError.at ? ' (' + SC.ago(f.lastError.at) + ')' : '') + ': '), f.lastError.message) : null,
            f.home ? el('a', { class: 'pill-link', href: f.home, target: '_blank', rel: 'noopener noreferrer' }, T('Open the source', 'Άνοιγμα της πηγής'), SC.icon('external', 14)) : null));
        });
        wrap.append(grid, el('p', { class: 'lb-foot muted' }, T('A source that is switched off still shows the readings kept from before. Teachers switch sources on and off on ', 'Μια πηγή που είναι απενεργοποιημένη δείχνει ακόμα τις μετρήσεις που είχαν αποθηκευτεί. Οι εκπαιδευτικοί ενεργοποιούν και απενεργοποιούν τις πηγές στη σελίδα '), el('a', { class: 'link', href: '#/feeds' }, T('Feed list', 'Λίστα πηγών')), '.'));
        panel.replaceChildren(wrap);
      }

      /* ---------- glossary ---------- */
      function drawGlossary() {
        const w = ws();
        const chips = el('div', { class: 'lb-chips', role: 'group', 'aria-label': T('Topic', 'Θέμα') }, GROUPS.map(([id, en, elx]) => el('button', { type: 'button', class: 'lb-chip' + (S.group === id ? ' on' : ''), 'aria-pressed': S.group === id ? 'true' : 'false', onclick: () => { S.group = id; drawGlossary(); } }, T(en, elx))));
        let list = GL.filter(glHit).filter((t) => S.group === 'all' || t.g === S.group);
        list = list.slice().sort((a, b) => fold(T(a.en[0], a.el[0])).localeCompare(fold(T(b.en[0], b.el[0])), SC.lang));
        const other = SC.lang === 'el' ? 0 : 1;   // the other language
        const grid = el('div', { class: 'lb-terms' });
        list.forEach((t) => {
          const cur = SC.lang === 'el' ? t.el : t.en, alt = SC.lang === 'el' ? t.en : t.el;
          const open = S.term === t.id;
          grid.append(el('article', { class: 'nm-card nm-card--well lb-term' + (open ? ' on' : ''), id: 'lb-t-' + t.id },
            el('h3', null, mark(cur[0], w)), el('p', null, mark(cur[1], w)),
            el('details', { class: 'lb-alt', open: open ? true : null }, el('summary', null, T('Show in Greek', 'Εμφάνιση στα αγγλικά')),
              el('div', { lang: other ? 'el' : 'en' }, el('b', null, mark(alt[0], w)), el('p', null, mark(alt[1], w))))));
        });
        panel.replaceChildren(el('div', { class: 'lb-gl' }, chips,
          el('div', { class: 'lb-count muted' }, T(list.length + ' of ' + GL.length + ' terms', list.length + ' από ' + GL.length + ' όρους')),
          list.length ? grid : (S.q ? noMatch(['Glossary', 'Γλωσσάρι']) : el('div', { class: 'empty' }, T('No terms in this topic.', 'Δεν υπάρχουν όροι σε αυτό το θέμα.')))));
        if (S.term) { const n = panel.querySelector('#lb-t-' + S.term); if (n && n.scrollIntoView) setTimeout(() => n.scrollIntoView({ block: 'center' }), 50); }
      }

      function drawPanel() {
        if (!alive) return;
        if (S.tab === 'handbook' || S.tab === 'guides') {
          if (S.docs == null && !S.docsErr) { panel.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); return; }
          drawDocs(S.tab);
        } else if (S.tab === 'sources') {
          if (S.feeds == null) { panel.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση'))); return; }
          drawSources();
        } else drawGlossary();
      }

      /* ---------- start ---------- */
      if (S.term) { const t = GL.find((x) => fold(x.en[0]).split(' ')[0] === fold(S.term) || x.id === S.term || fold(x.en[0]) === fold(S.term)); S.term = t ? t.id : null; if (t && q0.get('tab') == null) S.tab = 'glossary'; }
      drawPills();
      panel.replaceChildren(el('div', { class: 'loading' }, T('Loading', 'Φόρτωση')));
      if (S.tab === 'glossary') drawPanel();
      await Promise.all([loadDocs(), loadFeeds()]);
      if (!alive) return;
      drawPills(); drawPanel(); sync();

      return () => { alive = false; clearTimeout(qTimer); };
    },
  });
})();
