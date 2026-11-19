'use strict';
/* The data side of the 3D data stack (#/stack): one read-only API that hands every dataset with a place on the map to the drawing
 * code as a small, honest, map-ready answer. Mounted at /api/stack. The full inventory, the verdict on every dataset and the spec
 * the drawing code follows are in docs/STACK-DATA.md.
 *
 *   GET /api/stack            the list of sheets: id, title, band, kind, whether it is live, how often to ask again
 *   GET /api/stack/<id>       one sheet. Always 200 for a known id: when the data is not there the answer says available: false and why
 *
 * Every answer carries the same head: { id, title: [en, el], band, unit, kind, live, refreshSeconds, geometry, period or updated,
 *   source: [en, el], sourceUrl, licence, licenceUrl, attribution, honesty: [en, el], note: [en, el], demo, available, coordinates: 'lat,lng' }
 *   kind     live       observed by an instrument and refreshed by the server (the answer says how old it is)
 *            delayed    our own vehicles: at least PUBLIC_POS_DELAY_MIN minutes old and rounded to PUBLIC_POS_GRID degrees (privacy.js)
 *            scheduled  worked out from a timetable for this minute; nothing was observed
 *            periodic   a file the publisher replaces from time to time (timetables, the OpenStreetMap copy, monthly statistics)
 *            snapshot   one dated copy of an inventory or a past period; it does not change
 *            census     the count of one day (1 October 2021)
 *            catalogue  a list of dated past events
 *   honesty  the one line the key of the sheet must show, word for word
 *   demo     true when the VALUES in this answer are made up by the test mode. A frozen copy of a published file is real in every mode.
 *
 * Rules the code keeps
 *   - Nothing is fetched here. Every answer is built from what another module already holds (its cache or its saved file) or from a
 *     frozen copy in the repo (fieldwork/, fieldwork/stack/, context/).
 *   - No invented value. Missing stays null with a reason; zero stays zero; a total is never put in the same list as its parts.
 *   - Every number has a unit, a period and a source. Every coordinate is [latitude, longitude].
 *   - Own vehicles: ONLY what trailsFor('public') gives a visitor, passed through privacy.js a second time, without device ids, names
 *     or schools. Nothing about a person. No list is sorted by value, so nothing here ranks a school or a city.
 *
 * createStackData({ root, demo, mock, priv, trailsFor, devices, cityBuildings, gtfs, eea, satellite, context, cydom, metar, log, now })
 *   -> { ids, handle(req, res, url), build(id), _t }
 *   gtfs, eea, satellite are functions that return the module or null (they start after the server does).
 */
const fs = require('fs');
const path = require('path');
const { simplify } = require('./gtfs');
const { CITIES: CITY_CENTRES } = require('./city-buildings');

const B = (en, el) => [en, el];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const iso = (ms) => (isNum(ms) && ms > 0 ? new Date(ms).toISOString() : null);
const WD = 1, SA = 2, SU = 4;   // the day types of gtfs.js

/* The four cities: the census municipality behind each, and the centre the site already uses for it (city-buildings.js CITIES).
   Listed in the order of the site's menus, never by a value. */
const CITIES = [
  { key: 'larnaka', code: '4000', census: 'Larnaka', name: B('Larnaka', 'Λάρνακα') },
  { key: 'lefkosia', code: '1000', census: 'Lefkosia', name: B('Lefkosia', 'Λευκωσία') },
  { key: 'limassol', code: '5000', census: 'Lemesos', name: B('Lemesos (Limassol)', 'Λεμεσός') },
  { key: 'paphos', code: '6000', census: 'Pafos', name: B('Pafos', 'Πάφος') },
];
/* The five reporting districts of the census and of the permits table. `polygon` is the key of the district outline in
   public/site/island.js; `anchor` is a place the site already uses inside the government-controlled part of the district (the centre of
   its main town). The outline is the whole district as drawn there, which for Lefkosia, Ammochostos and Larnaka reaches beyond the
   area the statistics cover, so the anchor, not the middle of the outline, is where a value may stand. */
const DISTRICTS = [
  { code: '1', permits: 'Lefkosia', polygon: 'nicosia', name: B('Lefkosia district', 'Επαρχία Λευκωσίας'), anchor: { ...pick(CITY_CENTRES.lefkosia), from: 'city-buildings.js, Lefkosia centre' }, whole: false },
  { code: '3', permits: 'Ammochostos', polygon: 'famagusta', name: B('Ammochostos district', 'Επαρχία Αμμοχώστου'), anchor: { lat: 35.04, lng: 33.98, from: 'public/site/island.js, ISLAND.stations: Paralimni (two decimals)' }, whole: false },
  { code: '4', permits: 'Larnaka', polygon: 'larnaca', name: B('Larnaka district', 'Επαρχία Λάρνακας'), anchor: { ...pick(CITY_CENTRES.larnaka), from: 'city-buildings.js, Larnaka centre' }, whole: false },
  { code: '5', permits: 'Lemesos', polygon: 'limassol', name: B('Lemesos district', 'Επαρχία Λεμεσού'), anchor: { ...pick(CITY_CENTRES.limassol), from: 'city-buildings.js, Limassol centre' }, whole: true },
  { code: '6', permits: 'Pafos', polygon: 'paphos', name: B('Pafos district', 'Επαρχία Πάφου'), anchor: { ...pick(CITY_CENTRES.paphos), from: 'city-buildings.js, Paphos centre' }, whole: true },
];
function pick(c) { return { lat: c.lat, lng: c.lng }; }

const CENSUS_LINE = B('Census of 1 October 2021 — not live', 'Απογραφή 1ης Οκτωβρίου 2021 — όχι ζωντανά δεδομένα');
const DENSITY = {
  available: false,
  reason: B(
    'Density is not available yet. The census counts 396 municipalities and communities by their CYSTAT code; the only shapes in the repo (public/site/island.js) are 618 outlines without a name or a code, grouped into six districts, and nothing records where they came from or under which licence. No shape can be joined to a census area, so no area in square kilometres can be trusted and nothing is divided.',
    'Η πυκνότητα δεν είναι διαθέσιμη ακόμη. Η απογραφή μετρά 396 δήμους και κοινότητες με τον κωδικό CYSTAT· τα μόνα σχήματα στο αποθετήριο (public/site/island.js) είναι 618 περιγράμματα χωρίς όνομα ή κωδικό, ομαδοποιημένα σε έξι επαρχίες, και πουθενά δεν γράφει από πού ήρθαν ή με ποια άδεια. Κανένα σχήμα δεν ενώνεται με περιοχή της απογραφής, άρα καμία έκταση σε τετραγωνικά χιλιόμετρα δεν είναι αξιόπιστη και δεν γίνεται καμία διαίρεση.'),
  unlock: B(
    'A boundary file of the municipalities and communities of the 2021 census that carries the CYSTAT code of each one, with its licence and credit line (for example from the Department of Lands and Surveys on the national open data portal), plus the line of the government-controlled area. Then area comes from the shape on an equal-area basis and density is residents per square kilometre.',
    'Ένα αρχείο ορίων των δήμων και κοινοτήτων της απογραφής 2021 που έχει τον κωδικό CYSTAT του καθενός, με την άδεια και την αναφορά πηγής του (για παράδειγμα από το Τμήμα Κτηματολογίου και Χωρομετρίας στην εθνική πύλη ανοικτών δεδομένων), και η γραμμή των ελεγχόμενων από την κυβέρνηση περιοχών. Τότε η έκταση βγαίνει από το σχήμα σε ισοεμβαδική βάση και η πυκνότητα είναι κάτοικοι ανά τετραγωνικό χιλιόμετρο.'),
};
const VINTAGE = {
  numbers: B('Municipalities and communities as they existed on census day, 1 October 2021 (before the local government reform of 1 July 2024).', 'Δήμοι και κοινότητες όπως ήταν την ημέρα της απογραφής, 1 Οκτωβρίου 2021 (πριν από τη μεταρρύθμιση της τοπικής αυτοδιοίκησης της 1ης Ιουλίου 2024).'),
  recast: B('The 2024 figure adds the 2021 residents of the areas that form the municipality since 1 July 2024. It is not the population of 2024.', 'Ο αριθμός του 2024 προσθέτει τους κατοίκους του 2021 στις περιοχές που αποτελούν τον δήμο από την 1η Ιουλίου 2024. Δεν είναι ο πληθυσμός του 2024.'),
  polygons: B('The district outlines of the site (public/site/island.js) follow the six districts, including parts the census does not cover. Their source, date and licence are not recorded in the repo, so their vintage is unknown; they are a drawing, not an official boundary.', 'Τα περιγράμματα των επαρχιών του ιστότοπου (public/site/island.js) ακολουθούν τις έξι επαρχίες, μαζί με τμήματα που η απογραφή δεν καλύπτει. Η πηγή, η ημερομηνία και η άδειά τους δεν είναι γραμμένες στο αποθετήριο, άρα η χρονιά τους είναι άγνωστη· είναι σχέδιο, όχι επίσημο όριο.'),
};

/* ---------- the sheets: what each one is, in both languages (the spec in docs/STACK-DATA.md repeats these lines) ---------- */
const SHEETS = {
  population: { band: 'CITY', kind: 'census', geometry: 'points', unit: 'residents', title: B('Residents', 'Κάτοικοι'), honesty: CENSUS_LINE },
  age: { band: 'CITY', kind: 'census', geometry: 'points', unit: 'years; % of residents', title: B('Age of residents', 'Ηλικία κατοίκων'), honesty: CENSUS_LINE },
  buildings: { band: 'CITY', kind: 'periodic', geometry: 'grid', unit: '% of ground under a building', title: B('Built-up ground', 'Δομημένο έδαφος'),
    honesty: B('Four city centres of 1.8 km only, from OpenStreetMap — not the island', 'Μόνο τέσσερα κέντρα πόλεων του 1,8 km, από το OpenStreetMap — όχι όλο το νησί') },
  'bus-network': { band: 'CITY', kind: 'periodic', geometry: 'lines', unit: 'lines and stops', title: B('Bus lines and stops', 'Γραμμές και στάσεις λεωφορείων'),
    honesty: B('Official timetable files — lines and stops, no buses', 'Επίσημα αρχεία δρομολογίων — γραμμές και στάσεις, όχι λεωφορεία') },
  'bus-now': { band: 'CITY', kind: 'scheduled', geometry: 'points', unit: 'scheduled buses', title: B('Buses by the timetable', 'Λεωφορεία σύμφωνα με το δρομολόγιο'),
    honesty: B('Timetable, not observed buses', 'Δρομολόγιο, όχι λεωφορεία που παρατηρήθηκαν') },
  'own-vehicles': { band: 'CITY', kind: 'delayed', geometry: 'lines', unit: 'vehicles', title: B('Our sensor vehicles', 'Τα οχήματα με τους αισθητήρες μας'), honesty: null },
  earthquakes: { band: 'GROUND', kind: 'catalogue', geometry: 'points', unit: 'magnitude', title: B('Earthquakes since 2015', 'Σεισμοί από το 2015'),
    honesty: B('Past earthquakes of magnitude 4.5 and above, 2015 to 19 November 2026 — a list, not a live feed', 'Σεισμοί μεγέθους 4,5 και πάνω, 2015 έως 19 Νοεμβρίου 2026 — κατάλογος, όχι ζωντανή ροή') },
  'ev-charging': { band: 'CITY', kind: 'snapshot', geometry: 'points', unit: 'charging points', title: B('EV charging points', 'Σημεία φόρτισης ηλεκτρικών οχημάτων'),
    honesty: B('Inventory published 15 November 2026 — it does not say whether a charger is free or working', 'Κατάλογος που δημοσιεύτηκε στις 15 Νοεμβρίου 2026 — δεν λέει αν ένας φορτιστής είναι ελεύθερος ή αν δουλεύει') },
  crossings: { band: 'CITY', kind: 'snapshot', geometry: 'points', unit: 'signal-controlled crossings', title: B('Pedestrian crossings with signals', 'Διαβάσεις πεζών με φωτεινό σηματοδότη'),
    honesty: B('Inventory published 15 November 2026 — signal-controlled crossings only, not a measure of safety', 'Κατάλογος που δημοσιεύτηκε στις 15 Νοεμβρίου 2026 — μόνο διαβάσεις με σηματοδότη, όχι μέτρο ασφάλειας') },
  'flood-reaches': { band: 'WATER', kind: 'snapshot', geometry: 'lines', unit: 'flood-scenario polygons touching the reach', title: B('River reaches with flood scenarios', 'Τμήματα ποταμών με σενάρια πλημμύρας'),
    honesty: B('Modelled flood scenarios, not a flood that happened and not a forecast', 'Σενάρια πλημμύρας από μοντέλο, όχι πλημμύρα που έγινε και όχι πρόγνωση') },
  'fire-hotspots': { band: 'GROUND', kind: 'live', geometry: 'points', unit: 'hotspots in the last 24 hours', title: B('Fire hotspots from space', 'Θερμές κηλίδες φωτιάς από δορυφόρο'),
    honesty: B('Heat seen by a passing satellite in the last 24 hours — not a confirmed fire', 'Θερμότητα που είδε δορυφόρος στο πέρασμά του τις τελευταίες 24 ώρες — όχι επιβεβαιωμένη φωτιά') },
  'burnt-areas': { band: 'GROUND', kind: 'periodic', geometry: 'points', unit: 'ha', title: B('Burnt areas mapped from space', 'Καμένες εκτάσεις χαρτογραφημένες από δορυφόρο'),
    honesty: B('Burnt land mapped by EFFIS in the last 30 days — larger fires only, often a day or more late', 'Καμένη γη που χαρτογράφησε η EFFIS τις τελευταίες 30 ημέρες — μόνο μεγαλύτερες φωτιές, συχνά με μία μέρα ή και περισσότερο καθυστέρηση') },
  'air-stations': { band: 'AIR', kind: 'live', geometry: 'points', unit: 'µg/m³', title: B('Official air-quality stations', 'Επίσημοι σταθμοί ποιότητας αέρα'),
    honesty: B('Hourly values from official stations, not yet verified by the publisher', 'Ωριαίες τιμές από επίσημους σταθμούς, χωρίς ακόμη επαλήθευση από τον εκδότη') },
  'met-stations': { band: 'AIR', kind: 'live', geometry: 'points', unit: '°C, %, m/s, mm', title: B('Met Office stations', 'Σταθμοί της Μετεωρολογικής Υπηρεσίας'),
    honesty: B('Readings of the official stations, about every 10 minutes', 'Μετρήσεις των επίσημων σταθμών, περίπου κάθε 10 λεπτά') },
  airports: { band: 'AIR', kind: 'live', geometry: 'points', unit: '°C, m/s', title: B('Airport weather', 'Καιρός αεροδρομίων'),
    honesty: B('Airport weather reports (METAR), about every 30 minutes — weather, not flights', 'Μετεωρολογικές αναφορές αεροδρομίων (METAR), περίπου κάθε 30 λεπτά — καιρός, όχι πτήσεις') },
  permits: { band: 'CITY', kind: 'periodic', geometry: 'districts', unit: 'permits per month', title: B('Building permits', 'Άδειες οικοδομής'),
    honesty: B('Permits authorised in July 2026, by district — a monthly statistic, not live', 'Άδειες που εγκρίθηκαν τον Ιούλιο 2026, ανά επαρχία — μηνιαίο στατιστικό, όχι ζωντανά δεδομένα') },
  'air-day': { band: 'AIR', kind: 'snapshot', geometry: 'points', unit: 'µg/m³', title: B('One day of air pollution, hour by hour', 'Μία μέρα ατμοσφαιρικής ρύπανσης, ώρα με την ώρα'),
    honesty: B('One past day, 15 May 2024 — a replay, not today', 'Μία περασμένη μέρα, 15 Μαΐου 2024 — επανάληψη, όχι σήμερα') },
  drought: { band: 'GROUND', kind: 'snapshot', geometry: 'points', unit: 'drought class', title: B('Farm drought in 2022', 'Γεωργική ξηρασία το 2022'),
    honesty: B('Four grid cells in 2022, every ten days — a past year, not now', 'Τέσσερα κελιά πλέγματος το 2022, κάθε δέκα ημέρες — περασμένη χρονιά, όχι τώρα') },
  'bathing-water': { band: 'WATER', kind: 'snapshot', geometry: 'points', unit: 'quality label of the season', title: B('Bathing water quality', 'Ποιότητα νερών κολύμβησης'),
    honesty: B('The label of the 2025 bathing season — not today’s water', 'Η ετικέτα της κολυμβητικής περιόδου 2025 — όχι το σημερινό νερό') },
  'seabed-profiles': { band: 'WATER', kind: 'snapshot', geometry: 'lines', unit: 'm', title: B('Seabed profiles', 'Προφίλ βυθού'),
    honesty: B('Three lines cut through a gridded seabed model — estimates, not soundings', 'Τρεις γραμμές που κόβουν ένα πλεγματικό μοντέλο βυθού — εκτιμήσεις, όχι βυθομετρήσεις') },
  'aerosol-sites': { band: 'AIR', kind: 'snapshot', geometry: 'points', unit: 'AOD (500 nm)', title: B('Haze measured from the ground, July 2022', 'Θολούρα μετρημένη από το έδαφος, Ιούλιος 2022'),
    honesty: B('Two sun photometers, daily means of July 2022 — a past month, not now', 'Δύο ηλιακά φωτόμετρα, ημερήσιοι μέσοι όροι του Ιουλίου 2022 — περασμένος μήνας, όχι τώρα') },
};
const IDS = Object.keys(SHEETS);

/* ---------- small geometry ---------- */
// the point of a planned run at `rel` minutes after its first stop: [index of the stop behind, lat, lng]
function alongPattern(stops, off, rel, coord) {
  const n = off.length;
  let i = 0;
  while (i < n - 2 && off[i + 1] <= rel) i++;
  const a = coord(stops[i]), b = coord(stops[i + 1]);
  const span = off[i + 1] - off[i];
  const f = span > 0 ? Math.min(1, Math.max(0, (rel - off[i]) / span)) : 0;
  return [i, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
const inRing = (ring, x, y) => {   // ring = [x0, y0, x1, y1, ...]
  let c = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    if ((ring[i + 1] > y) !== (ring[j + 1] > y) && x < ((ring[j] - ring[i]) * (y - ring[i + 1])) / (ring[j + 1] - ring[i + 1]) + ring[i]) c = !c;
  }
  return c;
};
/* One city centre from city-buildings.js -> a grid of square cells. For every cell: the share of its ground that lies under a building
   footprint, and how many buildings have their middle in it. The share is counted, not estimated from sizes: the box is covered with
   sample points every `step` metres and a point counts when it lies inside a footprint (and not in a courtyard). With cell 100 m and
   step 10 m a cell has 100 sample points, so the share is good to one percent. */
function buildingGrid(city, cell = 100, step = 10) {
  const half = city.box.half, n = Math.round((2 * half) / cell), per = Math.round(cell / step), side = n * per;
  const hit = new Uint8Array(side * side), count = new Array(n * n).fill(0);
  const at = (v) => (v + half) / step - 0.5;   // sample index of a coordinate (samples sit in the middle of their step)
  for (const b of city.buildings) {
    const ring = b[2], holes = b[3] || [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, sx = 0, sy = 0;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); y0 = Math.min(y0, ring[i + 1]); y1 = Math.max(y1, ring[i + 1]); sx += ring[i]; sy += ring[i + 1]; }
    const cx = Math.floor((sx / (ring.length / 2) + half) / cell), cy = Math.floor((sy / (ring.length / 2) + half) / cell);
    if (cx >= 0 && cx < n && cy >= 0 && cy < n) count[cy * n + cx]++;
    for (let iy = Math.max(0, Math.ceil(at(y0))); iy <= Math.min(side - 1, Math.floor(at(y1))); iy++) {
      const y = -half + (iy + 0.5) * step;
      for (let ix = Math.max(0, Math.ceil(at(x0))); ix <= Math.min(side - 1, Math.floor(at(x1))); ix++) {
        if (hit[iy * side + ix]) continue;
        const x = -half + (ix + 0.5) * step;
        if (inRing(ring, x, y) && !holes.some((h) => inRing(h, x, y))) hit[iy * side + ix] = 1;
      }
    }
  }
  const share = new Array(n * n).fill(0);
  for (let iy = 0; iy < side; iy++) for (let ix = 0; ix < side; ix++) if (hit[iy * side + ix]) share[Math.floor(iy / per) * n + Math.floor(ix / per)]++;
  const total = hit.reduce((a, v) => a + v, 0);
  return { cols: n, rows: n, cellMetres: cell, sampleMetres: step, share: share.map((v) => Math.round((v * 100) / (per * per))), count, coveredPercent: Math.round((total * 1000) / (side * side)) / 10 };
}

// "now" on the clock of Cyprus: the date, the minute of the day (with seconds as a fraction) and the day type of the timetables
function cyprusClock(ms) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Nicosia', hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  const type = (w) => (w === 'Sun' ? SU : w === 'Sat' ? SA : WD);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const before = days[(days.indexOf(p.weekday) + 6) % 7];
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, minute: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60, type: type(p.weekday), typeBefore: type(before) };
}
const DAY_NAME = { [WD]: B('weekday', 'καθημερινή'), [SA]: B('Saturday', 'Σάββατο'), [SU]: B('Sunday', 'Κυριακή') };

function createStackData(o) {
  const root = o.root || __dirname;
  const log = o.log || (() => {});
  const now = o.now || Date.now;
  const priv = o.priv;
  const demo = !!o.demo, mock = !!o.mock;
  const lazy = (f) => { try { return typeof f === 'function' ? f() : f || null; } catch (e) { return null; } };

  /* ----- frozen files: read once, read again when the file changes ----- */
  const files = new Map();
  function frozen(rel) {
    const file = path.join(root, rel);
    const st = fs.statSync(file);
    const hit = files.get(rel);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.data;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    files.set(rel, { mtimeMs: st.mtimeMs, size: st.size, data });
    return data;
  }
  const credit = (d) => ({ source: null, sourceUrl: d.sourceUrl || null, licence: d.licence || null, licenceUrl: d.licenceUrl || null, attribution: d.attribution || null, attributionEl: d.attributionEl || d.attribution || null });

  /* ----- answers are kept for a short while, and two visitors asking at once share one build ----- */
  const kept = new Map();
  function keep(id, ttl, fn) {
    const hit = kept.get(id), t = now();
    if (hit && (hit.pending || t - hit.at < ttl)) return hit.p;
    const e = { at: t, pending: true, p: null };
    e.p = Promise.resolve().then(fn).then((v) => { e.pending = false; e.at = now(); return v; }, (err) => { kept.delete(id); throw err; });
    kept.set(id, e);
    return e.p;
  }

  const head = (id, more) => {
    const s = SHEETS[id];
    return { id, title: s.title, band: s.band, unit: s.unit, kind: s.kind, live: s.kind === 'live', geometry: s.geometry, coordinates: 'lat,lng', honesty: s.honesty, demo: false, available: true, ...more };
  };
  const missing = (id, more, reason) => ({ ...head(id, more), available: false, reason });

  /* ================= people ================= */
  const CENSUS_FILE = 'fieldwork/stack/census-localities.json';
  const censusHead = (d) => ({
    period: d.referenceDate, retrieved: d.retrievedAt, refreshSeconds: null,
    source: B('Statistical Service of Cyprus (CYSTAT), Census of Population and Housing 2021', 'Στατιστική Υπηρεσία Κύπρου (CYSTAT), Απογραφή Πληθυσμού και Κατοικιών 2021'),
    sourceUrl: d.sourceUrl, licence: d.licence, licenceUrl: d.licenceUrl, attribution: d.attribution, attributionEl: d.attributionEl,
    coverage: B('The government-controlled areas of the Republic of Cyprus.', 'Οι ελεγχόμενες από την κυβέρνηση περιοχές της Κυπριακής Δημοκρατίας.'),
    vintage: VINTAGE,
    levels: B('Three lists that overlap: the four municipalities, the five districts (each holds its municipalities) and the other areas without a place. Draw one level at a time and never add one to another.', 'Τρεις λίστες που επικαλύπτονται: οι τέσσερις δήμοι, οι πέντε επαρχίες (καθεμία περιέχει τους δήμους της) και οι υπόλοιπες περιοχές χωρίς θέση. Σχεδίασε ένα επίπεδο κάθε φορά και μην προσθέτεις ποτέ το ένα στο άλλο.'),
  });
  const UNPLACED = {
    reason: B('The repo holds no coordinates and no shape for these municipalities and communities, so they cannot be drawn. The numbers are real and complete.', 'Το αποθετήριο δεν έχει συντεταγμένες ούτε σχήμα για αυτούς τους δήμους και τις κοινότητες, άρα δεν μπορούν να σχεδιαστούν. Οι αριθμοί είναι πραγματικοί και πλήρεις.'),
    unlock: DENSITY.unlock,
    names: B('Names are the English labels of CYSTAT; the file has no Greek names.', 'Τα ονόματα είναι οι αγγλικές ετικέτες της CYSTAT· το αρχείο δεν έχει ελληνικά ονόματα.'),
  };
  const cityPlace = (c) => ({ lat: CITY_CENTRES[c.key].lat, lng: CITY_CENTRES[c.key].lng, placeFrom: 'city-buildings.js: the centre the site already uses for this city (a point, not the middle of the municipality)' });
  const districtBase = (x, row) => ({ code: x.code, name: x.name, publisherName: row.name, level: 'district', polygon: x.polygon, polygonCoversMore: !x.whole, lat: x.anchor.lat, lng: x.anchor.lng, placeFrom: x.anchor.from });
  const NO_KYRENIA = { polygon: 'kyrenia', name: B('Keryneia district', 'Επαρχία Κερύνειας'), value: null, reason: B('The 2021 census covers the government-controlled areas only; it has no figure for this district.', 'Η απογραφή 2021 καλύπτει μόνο τις ελεγχόμενες από την κυβέρνηση περιοχές· δεν έχει αριθμό για αυτή την επαρχία.') };

  function population() {
    const d = frozen(CENSUS_FILE);
    const by = new Map(d.localities.map((l) => [l.code, l]));
    const recast = new Map(d.recast2024.map((r) => [r.ownCode, r]));
    const placed = new Set(CITIES.map((c) => c.code));
    const features = CITIES.map((c) => {
      const l = by.get(c.code), r = recast.get(c.code);
      return { code: c.code, key: c.key, name: c.name, publisherName: l.name, level: 'municipality', boundary: '2021 municipality', ...cityPlace(c), residents: l.residents, density: null,
        recast2024: { residents: r.residents, components: r.components, sameAs2021: r.components.length === 1, evidenceUrl: r.evidenceUrl } };
    });
    const districts = DISTRICTS.map((x) => { const row = d.districts.find((q) => q.code === x.code); return { ...districtBase(x, row), residents: row.residents, density: null }; });
    const rest = d.localities.filter((l) => !placed.has(l.code));
    return head('population', {
      ...censusHead(d),
      note: B('Residents counted on census day. Four municipalities have a place (their city centre); five districts stand at the centre of their main town; the other 392 municipalities and communities are listed without a place. Circles should grow with the number of residents by area, not by radius.',
        'Κάτοικοι που μετρήθηκαν την ημέρα της απογραφής. Τέσσερις δήμοι έχουν θέση (το κέντρο της πόλης τους)· πέντε επαρχίες στέκονται στο κέντρο της κύριας πόλης τους· οι άλλοι 392 δήμοι και κοινότητες είναι στη λίστα χωρίς θέση. Οι κύκλοι να μεγαλώνουν με τον αριθμό των κατοίκων κατά εμβαδόν, όχι κατά ακτίνα.'),
      total: { residents: d.total.residents, what: B('All reporting districts together. Not a sum to add to anything below.', 'Όλες οι επαρχίες αναφοράς μαζί. Δεν προστίθεται σε τίποτα από τα παρακάτω.') },
      density: DENSITY,
      features,
      districts,
      districtsWithoutData: [{ ...NO_KYRENIA, residents: null }],
      unplaced: { count: rest.length, residents: rest.reduce((a, l) => a + l.residents, 0), ...UNPLACED, fields: ['code', 'name', 'district', 'residents'], rows: rest.map((l) => [l.code, l.name, l.district, l.residents]) },
    });
  }

  function age() {
    const d = frozen(CENSUS_FILE);
    const by = new Map(d.localities.map((l) => [l.code, l]));
    const recast = new Map(d.recast2024.map((r) => [r.ownCode, r]));
    const placed = new Set(CITIES.map((c) => c.code));
    const ages = (l) => ({ residents: l.residents, meanAge: l.meanAge, under15Percent: l.under15Percent, age15to64Percent: l.ageWithheld ? null : Math.round((100 - l.under15Percent - l.age65plusPercent) * 100) / 100, age65plusPercent: l.age65plusPercent, counts: l.ageWithheld ? null : { under15: l.under15, age15to64: l.age15to64, age65plus: l.age65plus } });
    const features = CITIES.map((c) => {
      const l = by.get(c.code), r = recast.get(c.code);
      return { code: c.code, key: c.key, name: c.name, publisherName: l.name, level: 'municipality', boundary: '2021 municipality', ...cityPlace(c), ...ages(l),
        recast2024: { residents: r.residents, meanAge: null, meanAgeReason: B('CYSTAT published no mean age for the recast municipality, and none is estimated.', 'Η CYSTAT δεν δημοσίευσε μέση ηλικία για τον δήμο μετά τη μεταρρύθμιση, και δεν γίνεται εκτίμηση.'), under15Percent: r.under15Percent, age65plusPercent: r.age65plusPercent, counts: { under15: r.under15, age15to64: r.age15to64, age65plus: r.age65plus }, components: r.components, sameAs2021: r.components.length === 1 } };
    });
    const districts = DISTRICTS.map((x) => { const row = d.districts.find((q) => q.code === x.code); return { ...districtBase(x, row), ...ages(row) }; });
    const rest = d.localities.filter((l) => !placed.has(l.code));
    return head('age', {
      ...censusHead(d),
      units: { meanAge: 'years', under15Percent: '% of residents', age15to64Percent: '% of residents', age65plusPercent: '% of residents' },
      note: B(`Mean age is copied from CYSTAT. The shares are worked out from the published age bands: under 15, 15 to 64, 65 and over. A place with fewer than ${d.ageFloor} residents has no age figures here: an average of a handful of people would be about those people.`,
        `Η μέση ηλικία είναι αντιγραμμένη από τη CYSTAT. Τα ποσοστά βγαίνουν από τις δημοσιευμένες ηλικιακές ομάδες: κάτω των 15, 15 έως 64, 65 και άνω. Ένα μέρος με λιγότερους από ${d.ageFloor} κατοίκους δεν έχει εδώ στοιχεία ηλικίας: ο μέσος όρος μιας χούφτας ανθρώπων θα μιλούσε για αυτούς τους ανθρώπους.`),
      total: { residents: d.total.residents, meanAge: d.total.meanAge, under15Percent: d.total.under15Percent, age65plusPercent: d.total.age65plusPercent, what: B('All reporting districts together, for the legend only.', 'Όλες οι επαρχίες αναφοράς μαζί, μόνο για το υπόμνημα.') },
      ageFloor: d.ageFloor,
      features,
      districts,
      districtsWithoutData: [{ ...NO_KYRENIA, meanAge: null }],
      unplaced: { count: rest.length, withheld: rest.filter((l) => l.ageWithheld).length, ...UNPLACED, fields: ['code', 'name', 'district', 'meanAge', 'under15Percent', 'age65plusPercent'], rows: rest.map((l) => [l.code, l.name, l.district, l.meanAge, l.under15Percent, l.age65plusPercent]) },
    });
  }

  /* ================= city ================= */
  const grids = new WeakMap();
  function buildings() {
    const cb = o.cityBuildings;
    let newest = 0, anyDemo = false, ok = 0;
    const features = CITIES.map((c) => {
      const base = { key: c.key, name: B(CITY_CENTRES[c.key].name[0], CITY_CENTRES[c.key].name[1]), centre: pick(CITY_CENTRES[c.key]) };
      const v = cb ? cb.get(c.key) : { code: 503 };
      if (v.code !== 200) {
        return { ...base, available: false, reason: v.code === 202 ? B('The first copy of this city centre is being fetched from OpenStreetMap. Ask again in a minute.', 'Το πρώτο αντίγραφο αυτού του κέντρου πόλης κατεβαίνει από το OpenStreetMap. Ρώτα ξανά σε ένα λεπτό.') : B('The buildings of this city centre could not be fetched from OpenStreetMap yet.', 'Τα κτίρια αυτού του κέντρου πόλης δεν έχουν κατέβει ακόμη από το OpenStreetMap.') };
      }
      const body = v.body;
      if (!grids.has(body)) grids.set(body, buildingGrid(body));
      ok++; newest = Math.max(newest, body.at || 0); if (body.mock) anyDemo = true;
      return { ...base, available: true, box: { south: body.box.s, west: body.box.w, north: body.box.n, east: body.box.e, halfMetres: body.box.half }, fetched: iso(body.at), demo: !!body.mock,
        buildings: body.stats.buildings, heights: { recorded: body.stats.tagged, fromFloors: body.stats.levels, notRecorded: body.stats.guessed }, ...grids.get(body) };
    });
    return head('buildings', {
      demo: anyDemo, available: ok > 0, updated: iso(newest), refreshSeconds: 86400,
      source: B('OpenStreetMap, through the Overpass service; a copy is kept for 30 days', 'OpenStreetMap, μέσω της υπηρεσίας Overpass· ένα αντίγραφο κρατιέται για 30 ημέρες'),
      sourceUrl: 'https://www.openstreetmap.org/copyright', licence: 'Open Database Licence (ODbL) 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      attribution: '© OpenStreetMap contributors', attributionEl: '© Συντελεστές του OpenStreetMap',
      coverage: B('Four boxes of 1.8 km by 1.8 km around the four city centres. Nothing outside them, and not the island.', 'Τέσσερα πλαίσια 1,8 km επί 1,8 km γύρω από τα τέσσερα κέντρα πόλεων. Τίποτα έξω από αυτά, και όχι όλο το νησί.'),
      grid: B('Each city is a square grid, row by row from the south-west corner (first west to east, then north). share[i] is the percent of the cell under a building footprint; count[i] is the number of buildings whose middle lies in the cell.', 'Κάθε πόλη είναι τετράγωνο πλέγμα, γραμμή προς γραμμή από τη νοτιοδυτική γωνία (πρώτα από δύση προς ανατολή, μετά προς βορρά). Το share[i] είναι το ποσοστό του κελιού κάτω από κτίριο· το count[i] είναι ο αριθμός των κτιρίων που έχουν το κέντρο τους στο κελί.'),
      note: B('Volunteers draw OpenStreetMap, so a building nobody has drawn yet is missing and a cell can look emptier than it is. Building heights are mostly not recorded and are not used here.', 'Το OpenStreetMap το σχεδιάζουν εθελοντές, άρα ένα κτίριο που κανείς δεν σχεδίασε ακόμη λείπει και ένα κελί μπορεί να φαίνεται πιο άδειο απ’ όσο είναι. Τα ύψη των κτιρίων συνήθως δεν είναι καταγεγραμμένα και δεν χρησιμοποιούνται εδώ.'),
      ...(ok ? {} : { reason: B('No city centre has been fetched from OpenStreetMap yet.', 'Κανένα κέντρο πόλης δεν έχει κατέβει ακόμη από το OpenStreetMap.') }),
      features,
    });
  }

  /* ----- buses: the official static timetables (gtfs.js). Never the real-time feed ----- */
  const GTFS_CREDIT = {
    source: B('Cyprus National Access Point for transport (traffic4cyprus.org.cy), Public Works Department: static GTFS timetables', 'Εθνικό Σημείο Πρόσβασης για τις μεταφορές (traffic4cyprus.org.cy), Τμήμα Δημοσίων Έργων: στατικά δρομολόγια GTFS'),
    sourceUrl: 'https://traffic4cyprus.org.cy/dataset/publictransportstatic', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  };
  const gtfsCredit = () => { const g = require('./gtfs'); return { ...GTFS_CREDIT, attribution: g.ATTRIBUTION.en, attributionEl: g.ATTRIBUTION.el }; };
  const NO_TIMETABLE = B('No timetable file is loaded on this server right now.', 'Κανένα αρχείο δρομολογίων δεν είναι φορτωμένο σε αυτόν τον διακομιστή αυτή τη στιγμή.');
  const timetables = () => { const g = lazy(o.gtfs); return g && typeof g.timetables === 'function' ? g.timetables() : []; };
  const expired = (c, date) => !!(c.validTo && c.validTo < date);
  const MAX_LINE_POINTS = 14000, MAX_STOPS = 7000;

  function busNetwork() {
    const tt = timetables(), today = cyprusClock(now()).date;
    const more = { ...gtfsCredit(), demo: mock, refreshSeconds: 3600, updated: iso(Math.max(0, ...tt.map((t) => t.checkedAt || 0))),
      note: B('Lines are drawn from the shapes in the timetable files, thinned so the answer stays small; a line whose file has no shape is drawn straight from stop to stop and says so. Stops are places only.', 'Οι γραμμές σχεδιάζονται από τα σχήματα των αρχείων δρομολογίων, αραιωμένα για να μένει μικρή η απάντηση· μια γραμμή που το αρχείο της δεν έχει σχήμα σχεδιάζεται ευθεία από στάση σε στάση και το λέει. Οι στάσεις είναι μόνο θέσεις.') };
    if (!tt.length) return missing('bus-network', { ...more, feeds: [], lines: [], stops: { count: 0, points: [] } }, NO_TIMETABLE);
    const raw = [];
    for (const t of tt) {
      const c = t.data;
      c.routes.forEach((rt, ri) => {
        const sh = c.shapes && c.shapes[ri] && c.shapes[ri][0];
        let pts = null, drawn = null;
        if (sh) { pts = []; for (let i = 0; i + 1 < sh.length; i += 2) pts.push([sh[i], sh[i + 1]]); drawn = 'shape'; }
        else if (Array.isArray(c.patterns)) {
          let best = null;
          for (const p of c.patterns) if (p[0] === ri && (!best || p[2].length > best[2].length)) best = p;
          if (best) { pts = best[2].map((s) => [c.stops[s][2], c.stops[s][3]]); drawn = 'stops'; }
        }
        raw.push({ feed: c.id, short: rt[1], long: rt[2], drawn, pts });
      });
    }
    let tol = 60, lines, total;
    do {
      total = 0;
      lines = raw.map((l) => {
        if (!l.pts) return { feed: l.feed, short: l.short, long: l.long, drawn: null, line: null };
        const s = l.drawn === 'shape' ? simplify(l.pts, tol) : l.pts;
        total += s.length;
        const flat = []; for (const p of s) flat.push(r4(p[0]), r4(p[1]));
        return { feed: l.feed, short: l.short, long: l.long, drawn: l.drawn, line: flat };
      });
      tol *= 2;
    } while (total > MAX_LINE_POINTS && tol <= 2000);
    const seen = new Set(), stopPts = [];
    let stopCount = 0;
    for (const t of tt) for (const s of t.data.stops) {
      stopCount++;
      const k = r4(s[2]) + ',' + r4(s[3]);
      if (seen.has(k) || seen.size >= MAX_STOPS) continue;
      seen.add(k); stopPts.push(r4(s[2]), r4(s[3]));
    }
    return head('bus-network', {
      ...more,
      feeds: tt.map((t) => ({ id: t.id, name: B(t.name, t.nameEl), validFrom: t.data.validFrom, validTo: t.data.validTo, expired: expired(t.data, today), checked: iso(t.checkedAt), lines: t.data.routes.length, stops: t.data.stops.length, hasShapes: !!t.data.hasShapes, hasRuns: Array.isArray(t.data.runs) })),
      counts: { lines: lines.length, drawnFromShape: lines.filter((l) => l.drawn === 'shape').length, drawnThroughStops: lines.filter((l) => l.drawn === 'stops').length, notDrawn: lines.filter((l) => !l.drawn).length, stops: stopCount, stopPlaces: stopPts.length / 2 },
      simplifiedToMetres: tol / 2, lineFormat: 'line = [lat, lng, lat, lng, ...]',
      lines,
      stops: { count: stopCount, format: 'points = [lat, lng, lat, lng, ...], four decimals, places that fall on the same point once', points: stopPts },
    });
  }

  const MAX_TRIPS = 400, AHEAD_STOPS = 4;
  function busNow() {
    const t0 = now(), clock = cyprusClock(t0), tt = timetables();
    const more = { ...gtfsCredit(), demo: mock, refreshSeconds: 45, updated: iso(t0), at: iso(t0), cyprusTime: clock.time, cyprusDate: clock.date, dayType: DAY_NAME[clock.type],
      realtime: B('The real-time bus feed is not connected. Nothing here was observed.', 'Η ροή πραγματικού χρόνου των λεωφορείων δεν είναι συνδεδεμένη. Τίποτα εδώ δεν παρατηρήθηκε.'),
      note: B('For this minute on the clock of Cyprus: every planned trip that has left its first stop and not yet reached its last. Each one is placed on the straight line between the stop behind it and the stop ahead, in proportion to the planned minutes. Day types are weekday, Saturday or Sunday as the timetable file gives them; public holidays and cancelled trips are not taken into account. Times in the files are whole minutes.',
        'Για αυτό το λεπτό στο ρολόι της Κύπρου: κάθε προγραμματισμένο δρομολόγιο που έχει φύγει από την πρώτη του στάση και δεν έχει φτάσει ακόμη στην τελευταία. Το καθένα μπαίνει στην ευθεία ανάμεσα στη στάση πίσω του και τη στάση μπροστά του, ανάλογα με τα προγραμματισμένα λεπτά. Οι τύποι ημέρας είναι καθημερινή, Σάββατο ή Κυριακή όπως τους δίνει το αρχείο δρομολογίων· οι αργίες και τα ακυρωμένα δρομολόγια δεν λαμβάνονται υπόψη. Οι ώρες στα αρχεία είναι ολόκληρα λεπτά.'),
      pathFormat: 'path = [[seconds from `at`, lat, lng], ...]: the stop behind (zero or negative seconds), then the next stops. Move the bus along it in real seconds.' };
    if (!tt.length) return missing('bus-now', { ...more, feeds: [], lines: [], trips: [], counts: { running: 0, shown: 0 } }, NO_TIMETABLE);
    const feeds = [], all = [], lineIdx = new Map(), lines = [];
    for (const t of tt) {
      const c = t.data, f = { id: t.id, name: B(t.name, t.nameEl), state: 'ok', running: 0, validTo: c.validTo };
      feeds.push(f);
      if (!Array.isArray(c.runs) || !Array.isArray(c.patterns)) { f.state = 'no-runs'; f.why = B('This saved timetable was built before planned runs were kept. It gains them at its next download.', 'Αυτό το αποθηκευμένο δρομολόγιο φτιάχτηκε πριν κρατιούνται τα προγραμματισμένα δρομολόγια. Θα τα αποκτήσει στο επόμενο κατέβασμα.'); continue; }
      if (expired(c, clock.date)) { f.state = 'expired'; f.why = B('This timetable ended on ' + c.validTo + ', so it is not used for today.', 'Αυτό το δρομολόγιο έληξε στις ' + c.validTo + ', άρα δεν χρησιμοποιείται για σήμερα.'); continue; }
      const coord = (s) => [c.stops[s][2], c.stops[s][3]];
      // today's service day, and yesterday's for trips that run past midnight (25:10 is 01:10 the next morning)
      for (const [bit, minute] of [[clock.type, clock.minute], [clock.typeBefore, clock.minute + 1440]]) {
        for (const run of c.runs) {
          if (run[1] > minute) break;                       // runs are sorted by the minute they start
          if (!(run[2] & bit)) continue;
          const p = c.patterns[run[0]], off = p[3], lastOff = off[off.length - 1];
          if (lastOff <= 0 || run[1] + lastOff < minute) continue;
          const rel = minute - run[1];
          const [i, lat, lng] = alongPattern(p[2], off, rel, coord);
          const key = c.id + '|' + p[0] + '|' + p[1];
          let li = lineIdx.get(key);
          if (li === undefined) { li = lines.length; lineIdx.set(key, li); const rt = c.routes[p[0]]; lines.push({ feed: c.id, short: rt[1], long: rt[2], towards: c.heads[p[1]] || null }); }
          const pathPts = [];
          for (let j = i; j < off.length && j <= i + AHEAD_STOPS; j++) { const q = coord(p[2][j]); pathPts.push([Math.round((off[j] - rel) * 60), r4(q[0]), r4(q[1])]); }
          all.push({ line: li, lat: r4(lat), lng: r4(lng), path: pathPts });
          f.running++;
        }
      }
    }
    // too many to send: every k-th one, so the picture stays even across lines (and the answer says how many were left out)
    const stepBy = Math.max(1, Math.ceil(all.length / MAX_TRIPS));
    const trips = stepBy === 1 ? all : all.filter((_, i) => i % stepBy === 0);
    const usable = feeds.some((f) => f.state === 'ok');
    return head('bus-now', {
      ...more, available: usable,
      ...(usable ? {} : { reason: B('No loaded timetable can be used for today (see feeds).', 'Κανένα φορτωμένο δρομολόγιο δεν μπορεί να χρησιμοποιηθεί για σήμερα (δες τα feeds).') }),
      feeds, counts: { running: all.length, shown: trips.length, cappedAt: MAX_TRIPS },
      lines, trips,
    });
  }

  /* ----- our own sensor vehicles: only the public view, a second time through privacy.js, and nothing that names a vehicle ----- */
  function delayWords() {
    const m = priv.delayMin, km = Math.max(1, Math.round(priv.grid * 111));
    const en = m === 120 ? 'About two hours late' : m % 60 === 0 && m >= 60 ? `About ${m / 60} hours late` : `About ${m} minutes late`;
    const el = m === 120 ? 'Περίπου δύο ώρες αργότερα' : m % 60 === 0 && m >= 60 ? `Περίπου ${m / 60} ώρες αργότερα` : `Περίπου ${m} λεπτά αργότερα`;
    return B(`${en} and rounded to ${km} km`, `${el} και στρογγυλεμένα στο ${km} km`);
  }
  const VEHICLE_HOURS = 24, MAX_TRAIL_POINTS = 600;   // the newest points of a trail are the ones kept
  async function ownVehicles() {
    const t0 = now();
    const more = { honesty: delayWords(), demo, refreshSeconds: 300, updated: iso(t0), delayMinutes: priv.delayMin, gridDegrees: priv.grid, gridKm: Math.max(1, Math.round(priv.grid * 111)), windowHours: VEHICLE_HOURS,
      source: B('Kleanthis: the SenseCAP sensors the schools carry on buses and cars', 'Κλεάνθης: οι αισθητήρες SenseCAP που έχουν τα σχολεία σε λεωφορεία και αυτοκίνητα'), sourceUrl: null,
      licence: 'Own data of the project. Positions are public only in this delayed and rounded form.', licenceUrl: null, attribution: 'Kleanthis, Smart Cities Cyprus school teams', attributionEl: 'Κλεάνθης, σχολικές ομάδες Smart Cities Cyprus',
      note: B(`Each trail is where a vehicle was, never where it is: only points at least ${priv.delayMin} minutes old, each moved to the nearest corner of a grid of ${priv.grid} degrees, repeats removed. A vehicle has a number for this answer only; no name, no device and no school is given. Replay the trail in order of time; a long silence between two points is a gap, not a jump.`,
        `Κάθε διαδρομή δείχνει πού ήταν ένα όχημα, ποτέ πού είναι: μόνο σημεία τουλάχιστον ${priv.delayMin} λεπτών, το καθένα μετακινημένο στην πιο κοντινή γωνία ενός πλέγματος ${priv.grid} μοιρών, χωρίς επαναλήψεις. Ένα όχημα έχει αριθμό μόνο για αυτή την απάντηση· δεν δίνεται όνομα, συσκευή ή σχολείο. Παίξε τη διαδρομή με τη σειρά του χρόνου· μια μεγάλη σιωπή ανάμεσα σε δύο σημεία είναι κενό, όχι άλμα.`),
      trailFormat: 'trail = [[seconds since 1970 (UTC), lat, lng], ...], oldest first' };
    let answer, devs;
    try { answer = await o.trailsFor('public', VEHICLE_HOURS, ''); devs = await o.devices(); }
    catch (e) {
      const off = e && e.switchedOff;
      return missing('own-vehicles', { ...more, vehicles: [], counts: { vehicles: 0, withTrail: 0 } }, off ? B('A teacher has switched the sensor feed off.', 'Ένας εκπαιδευτικός έχει κλείσει τη ροή των αισθητήρων.') : B('The sensor feed is not answering right now.', 'Η ροή των αισθητήρων δεν απαντά αυτή τη στιγμή.'));
    }
    const kind = new Map();
    for (const d of devs || []) { const n = String(d.name || '').toLowerCase(); kind.set(d.eui, /\bbus\b|λεωφορ/.test(n) ? 'bus' : /\bcar\b|αυτοκίν/.test(n) ? 'car' : 'vehicle'); }
    const ok2 = (v) => Math.abs(v * 10 ** priv.decimals - Math.round(v * 10 ** priv.decimals)) < 1e-6;
    const vehicles = [];
    let n = 0;
    for (const eui of Object.keys(answer.trails || {}).sort()) {
      // a second pass through the privacy rules: whatever reached this point, only old and rounded points leave
      const pts = priv.publicTrail(answer.trails[eui], t0).filter((p) => ok2(p[1]) && ok2(p[2]) && t0 - p[0] >= priv.delayMs).slice(-MAX_TRAIL_POINTS);
      n++;
      if (!pts.length) continue;
      vehicles.push({ n: vehicles.length + 1, type: kind.get(eui) || 'vehicle', points: pts.length, from: iso(pts[0][0]), to: iso(pts[pts.length - 1][0]), trail: pts.map((p) => [Math.round(p[0] / 1000), p[1], p[2]]) });
    }
    return head('own-vehicles', { ...more, newestPointAllowed: iso(t0 - priv.delayMs), counts: { vehicles: n, withTrail: vehicles.length }, vehicles });
  }

  /* ================= frozen inventories and past periods ================= */
  function earthquakes() {
    const d = frozen('fieldwork/stack/earthquakes.json');
    return head('earthquakes', {
      ...credit(d), source: B('US Geological Survey, ANSS Comprehensive Earthquake Catalog', 'US Geological Survey, ANSS Comprehensive Earthquake Catalog'),
      period: d.referenceDate, retrieved: d.retrievedAt, refreshSeconds: null, timeZone: 'UTC',
      units: { magnitude: 'magnitude (the type is given with each event)', depthKm: 'km below the surface' },
      box: d.box, minimumMagnitude: d.minimumMagnitude,
      note: B('Every event of magnitude 4.5 or more that the USGS lists inside a rectangle from 34 to 36 degrees north and 32 to 35 degrees east. The rectangle also covers sea and is not a border. Five of the 14 are one cluster of November 2025. The weekly USGS feed is not connected, so a new earthquake does not appear here.',
        'Κάθε σεισμός μεγέθους 4,5 ή μεγαλύτερος που καταγράφει η USGS μέσα σε ένα ορθογώνιο από 34 έως 36 μοίρες βόρεια και 32 έως 35 μοίρες ανατολικά. Το ορθογώνιο πιάνει και θάλασσα και δεν είναι σύνορο. Πέντε από τους 14 είναι μία ομάδα του Νοεμβρίου 2025. Η εβδομαδιαία ροή της USGS δεν είναι συνδεδεμένη, άρα ένας νέος σεισμός δεν εμφανίζεται εδώ.'),
      counts: { events: d.events.length },
      features: d.events.map((e) => ({ id: e.id, time: e.time, lat: e.latitude, lng: e.longitude, depthKm: e.depthKm, magnitude: e.magnitude, magnitudeType: e.magnitudeType, place: e.place, reviewStatus: e.reviewStatus, url: e.url })),
    });
  }

  function evCharging() {
    const d = frozen('fieldwork/ev.json');
    return head('ev-charging', {
      ...credit(d), source: B('Department of Electrical and Mechanical Services, through the National Access Point (CyNAP)', 'Τμήμα Ηλεκτρομηχανολογικών Υπηρεσιών, μέσω του Εθνικού Σημείου Πρόσβασης (CyNAP)'),
      period: String(d.publishedAt).slice(0, 10), retrieved: String(d.retrievedAt).slice(0, 10), refreshSeconds: null,
      note: B(d.method, d.methodEl),
      counts: { records: d.locations.length, places: d.coverage.distinctCoordinates, connectors: d.coverage.connectors },
      features: d.locations.map((p) => ({ lat: r5(p.latitude), lng: r5(p.longitude), name: p.name, current: p.currentType, connectors: p.connectors, operator: p.operator })),
    });
  }

  function crossings() {
    const d = frozen('fieldwork/crossings.json');
    const f = d.locationFields, iLat = f.indexOf('latitude'), iLng = f.indexOf('longitude'), iCity = f.indexOf('cityWithinRadius');
    return head('crossings', {
      ...credit(d), attributionEl: d.attribution, source: B('Public Works Department, through the National Access Point (CyNAP)', 'Τμήμα Δημοσίων Έργων, μέσω του Εθνικού Σημείου Πρόσβασης (CyNAP)'),
      period: String(d.publishedAt).slice(0, 10), retrieved: String(d.retrievedAt).slice(0, 10), refreshSeconds: null,
      note: B('Every record of the published inventory with its place. The source gives no date for when a crossing was built or checked. `near` names the city centre within 5 km in a straight line, or is null.', 'Κάθε εγγραφή του δημοσιευμένου καταλόγου με τη θέση της. Η πηγή δεν δίνει ημερομηνία για το πότε φτιάχτηκε ή ελέγχθηκε μια διάβαση. Το `near` λέει το κέντρο πόλης σε ευθεία απόσταση έως 5 km, αλλιώς είναι null.'),
      counts: { records: d.coverage.sourceRecords, withPlace: d.locations.length, withoutPlace: d.coverage.missingCoordinates },
      features: d.locations.map((p) => ({ lat: r5(p[iLat]), lng: r5(p[iLng]), near: p[iCity] || null })),
    });
  }

  function floodReaches() {
    const d = frozen('fieldwork/flood.json');
    const by = {};
    for (const s of d.series) by[s.code] = new Map(s.points);
    return head('flood-reaches', {
      ...credit(d), source: B('Water Development Department, Republic of Cyprus: designated river reaches and flood risk maps', 'Τμήμα Αναπτύξεως Υδάτων, Κυπριακή Δημοκρατία: καθορισμένα τμήματα ποταμών και χάρτες κινδύνου πλημμύρας'),
      period: 'scenarios last edited 2024-01-30; reaches last edited 2022-05-10', retrieved: String(d.retrievedAt).slice(0, 10), refreshSeconds: null,
      note: B(d.method, d.methodEl),
      scenarios: d.scenarios.map((s) => ({ id: s.id, name: B(s.name, s.nameEl) })),
      lineFormat: 'lines = [[lat, lng, lat, lng, ...], ...]: the parts of one reach, thinned at 75 m for display',
      features: d.reaches.map((r) => ({ code: r.code, name: r.name, district: r.district, identifiedYear: r.identifiedYear,
        polygons: Object.fromEntries(d.scenarios.map((s) => [s.id, by[s.id] && by[s.id].has(r.code) ? by[s.id].get(r.code) : null])),
        lines: r.mapLines.map((l) => { const flat = []; for (const p of l) flat.push(r5(p[1]), r5(p[0])); return flat; }) })),
    });
  }

  function permits() {
    const d = frozen('fieldwork/stack/permits.json');
    const series = new Map(d.permitsByMonth.map((s) => [s.name, s.values]));
    return head('permits', {
      ...credit(d), source: B('Statistical Service of Cyprus (CYSTAT), building permits, table 1440010E', 'Στατιστική Υπηρεσία Κύπρου (CYSTAT), άδειες οικοδομής, πίνακας 1440010E'),
      period: d.latestMonth, retrieved: d.retrievedAt, refreshSeconds: null,
      units: Object.fromEntries(d.indicators.map((i) => [i.key, i.unit])),
      annotation: { month: d.annotation.month, text: B(d.annotation.text, d.annotation.textEl), url: d.annotation.url },
      note: B('Five reporting districts, each with its total and its urban and rural parts. A total holds its parts: show one of them at a time. A cell CYSTAT marks N.A. is null with its mark. A district value stands at the centre of its main town; the district outline of the site may be tinted, but for Lefkosia, Ammochostos and Larnaka it reaches beyond the area the statistics cover.',
        'Πέντε επαρχίες αναφοράς, καθεμία με το σύνολό της και το αστικό και αγροτικό της μέρος. Το σύνολο περιέχει τα μέρη του: δείξε ένα κάθε φορά. Ένα κελί που η CYSTAT σημειώνει N.A. είναι null με τη σημείωσή του. Η τιμή μιας επαρχίας στέκεται στο κέντρο της κύριας πόλης της· το περίγραμμα της επαρχίας στον ιστότοπο μπορεί να χρωματιστεί, αλλά για τη Λευκωσία, την Αμμόχωστο και τη Λάρνακα φτάνει πέρα από την περιοχή που καλύπτουν τα στατιστικά.'),
      polygons: VINTAGE.polygons,
      features: DISTRICTS.map((x) => { const row = d.latest.find((q) => q.name === x.permits); return { ...districtBase(x, row), total: row.total, urban: row.urban, rural: row.rural }; }),
      reportingTotal: { what: B('All five districts together, as published. Not a sum to add to them.', 'Και οι πέντε επαρχίες μαζί, όπως δημοσιεύτηκαν. Δεν προστίθεται σε αυτές.'), ...d.reportingTotal.total },
      months: d.months,
      permitsByMonth: DISTRICTS.map((x) => ({ code: x.code, name: x.name, values: series.get(x.permits) })),
    });
  }

  function airDay() {
    const d = frozen('fieldwork/gases.json');
    const st = new Map();
    for (const s of d.series) {
      if (!st.has(s.stationCode)) st.set(s.stationCode, { id: s.stationCode, name: B(s.name, s.nameEl), type: B(s.stationType, s.stationTypeEl), lat: r5(s.latitude), lng: r5(s.longitude), no2: null, o3: null });
      st.get(s.stationCode)[s.pollutant === 'NO2' ? 'no2' : 'o3'] = s.points.map((p) => p[1]);
    }
    const hours = d.series[0].points.map((p) => p[0]);
    return head('air-day', {
      ...credit(d), source: B('Cyprus Department of Labour Inspection, Air Quality Monitoring Network', 'Τμήμα Επιθεώρησης Εργασίας Κύπρου, Δίκτυο Παρακολούθησης Ποιότητας Αέρα'),
      period: d.referenceDate, retrieved: d.retrievedAt, refreshSeconds: null,
      units: { no2: 'µg/m³ nitrogen dioxide', o3: 'µg/m³ ozone' },
      note: B(d.method, d.methodEl),
      hours, features: [...st.values()],
    });
  }

  function drought() {
    const d = frozen('fieldwork/drought.json');
    const periods = d.series[0].points.map((p) => p[0]);
    return head('drought', {
      ...credit(d), source: B('European Drought Observatory, Joint Research Centre: Combined Drought Indicator', 'Ευρωπαϊκό Παρατηρητήριο Ξηρασίας, Κοινό Κέντρο Ερευνών: Συνδυασμένος Δείκτης Ξηρασίας'),
      period: d.referenceDate, retrieved: String(d.retrievedAt).slice(0, 10), refreshSeconds: null,
      note: B(d.method, d.methodEl),
      classes: Object.fromEntries(Object.entries(d.classLabels).map(([k, v]) => [k, B(v[0], v[1])])),
      classesAreNotAScale: B('Classes 4 to 6 are kinds of recovery, not "more drought" than class 3. Do not draw the class number as a height.', 'Οι κατηγορίες 4 έως 6 είναι είδη ανάκαμψης, όχι «περισσότερη ξηρασία» από την κατηγορία 3. Μη σχεδιάσεις τον αριθμό της κατηγορίας ως ύψος.'),
      periods, periodEnds: periods.map((p) => d.periodEnds[p] || null),
      features: d.series.map((s) => ({ name: B(s.name, s.nameEl), lat: s.cellLatitude, lng: s.cellLongitude, cellDegrees: 1 / 24, classes: s.points.map((p) => p[1]) })),
    });
  }

  function bathingWater() {
    const ctx = o.context;
    const v = ctx && ctx.has && ctx.has('bathing-water-history') ? ctx.view('bathing-water-history') : null;
    const more = { source: B('European Environment Agency and DG Environment, bathing water status', 'Ευρωπαϊκός Οργανισμός Περιβάλλοντος και ΓΔ Περιβάλλοντος, κατάσταση νερών κολύμβησης'),
      sourceUrl: 'https://www.eea.europa.eu/en/datahub/datahubitem-view/c3858959-90da-4c1b-b9ca-492db2f7e0a7', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', refreshSeconds: null,
      note: B('One label per bathing site for one whole season, as reported. No score and no "safe" badge is made from it; a site without a label for the season has none here.', 'Μία ετικέτα ανά σημείο κολύμβησης για μια ολόκληρη περίοδο, όπως αναφέρθηκε. Δεν φτιάχνεται βαθμός ούτε σήμα «ασφαλές»· ένα σημείο χωρίς ετικέτα για την περίοδο δεν έχει καμία εδώ.') };
    if (!v || !v.available) return missing('bathing-water', { ...more, attribution: null, attributionEl: null, period: null, features: [] }, B('The reviewed file could not be read, so nothing is shown.', 'Το ελεγμένο αρχείο δεν διαβάστηκε, άρα δεν εμφανίζεται τίποτα.'));
    const placed = v.sites.filter((s) => isNum(s.lat) && isNum(s.lng));
    return head('bathing-water', {
      ...more, attribution: v.attribution, attributionEl: v.attribution, period: String(v.season), published: v.published, seasons: [v.seasons[0], v.seasons[v.seasons.length - 1]],
      counts: { sites: v.sites.length, withPlace: placed.length, labels: v.counts },
      features: placed.map((s) => ({ id: s.id, name: s.name, lat: r5(s.lat), lng: r5(s.lng), label: s.label })),
    });
  }

  function seabedProfiles() {
    const d = frozen('fieldwork/coast.json');
    return head('seabed-profiles', {
      ...credit(d), attributionEl: d.attribution, source: B('EMODnet Bathymetry Consortium, EMODnet Digital Terrain Model', 'EMODnet Bathymetry Consortium, ψηφιακό μοντέλο εδάφους EMODnet'),
      period: 'static terrain model', retrieved: String(d.retrievedAt).slice(0, 10), refreshSeconds: null,
      units: { elevation: 'm (negative is below the sea surface)', distance: 'km along the line' },
      note: B(d.method + ' ' + d.limitations, 'Κάθε γραμμή ξεκινά από τα ανοιχτά. Οι τιμές είναι εκτιμήσεις ενός πλεγματικού μοντέλου και μπορεί να είναι παρεμβολή από γειτονικά κελιά· δεν είναι βυθομετρήσεις για ναυσιπλοΐα.'),
      features: d.series.map((s) => ({ name: s.name, start: s.startLabel, points: s.points.map((p, i) => ({ km: p[0], lat: r5(s.coordinatesLonLat[i][1]), lng: r5(s.coordinatesLonLat[i][0]), elevation: p[1], interpolated: !!s.interpolated[i] })) })),
    });
  }

  function aerosolSites() {
    const d = frozen('fieldwork/aeronet.json');
    return head('aerosol-sites', {
      ...credit(d), source: B('NASA AERONET Version 3, Level 2.0', 'NASA AERONET Έκδοση 3, Επίπεδο 2.0'),
      period: d.referenceDate, retrieved: d.retrievedAt, refreshSeconds: null,
      note: B(d.method, d.methodEl),
      features: d.series.map((s) => ({ id: s.code, name: B(s.name, s.nameEl), lat: r5(s.latitude), lng: r5(s.longitude), days: s.points.map((p) => p[0]), aod: s.points.map((p) => p[1]) })),
    });
  }

  /* ================= live points other modules already hold ================= */
  async function fromSatellite(id, feedId, more, build) {
    const sat = lazy(o.satellite);
    const got = sat && typeof sat.points === 'function' ? await sat.points(feedId) : null;
    if (!got) {
      let why = null;
      try { const p = sat ? await sat.probe(feedId) : null; if (p && !p.ok && p.note) why = B('This feed gives nothing right now: ' + p.note + '.', 'Αυτή η πηγή δεν δίνει τίποτα αυτή τη στιγμή: ' + (p.noteEl || p.note) + '.'); } catch (e) { why = null; }
      return missing(id, { ...more, updated: null, features: [] }, why || B('This satellite feed is not running on this server.', 'Αυτή η δορυφορική πηγή δεν τρέχει σε αυτόν τον διακομιστή.'));
    }
    return head(id, { ...more, updated: iso(got.at), ...build(got) });
  }
  const fireHotspots = () => fromSatellite('fire-hotspots', 'fire-hotspots', {
    refreshSeconds: 1800, source: B('NASA FIRMS active fire detections (VIIRS and MODIS)', 'Ανιχνεύσεις ενεργών πυρκαγιών NASA FIRMS (VIIRS και MODIS)'), sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
    licence: 'NASA open data; acknowledgement requested', licenceUrl: 'https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance',
    attribution: 'Fire data: NASA FIRMS (LANCE, NASA ESDIS). Not endorsed by NASA.', attributionEl: 'Δεδομένα πυρκαγιών: NASA FIRMS (LANCE, NASA ESDIS). Χωρίς έγκριση της NASA.',
    note: B('Places where a satellite saw heat in the 24 hours before `updated`; repeat sightings of one place count once. A pixel is 375 m to 1 km wide. Gas flares, industry and farm burning show up too. An empty list does not prove nothing is burning. If you see smoke or fire, call 112.',
      'Σημεία όπου δορυφόρος είδε θερμότητα τις 24 ώρες πριν από το `updated`· οι επαναλήψεις του ίδιου σημείου μετρούν μία φορά. Ένα εικονοστοιχείο έχει πλάτος 375 m έως 1 km. Φαίνονται και φλόγες αερίων, βιομηχανία και καύσεις στα χωράφια. Μια άδεια λίστα δεν αποδεικνύει ότι δεν καίγεται κάτι. Αν δεις καπνό ή φωτιά, πάρε στο 112.'),
  }, (g) => ({ windowHours: g.windowHours || 24, listsThatDidNotAnswer: g.late || [], counts: { hotspots: g.points.length }, features: g.points.map((p) => ({ lat: r4(p.lat), lng: r4(p.lng), seen: iso(p.t), satellites: p.sats || [] })) }));
  const burntAreas = () => fromSatellite('burnt-areas', 'effis-burnt-areas', {
    refreshSeconds: 21600, source: B('EFFIS (European Forest Fire Information System), Copernicus Emergency Management Service', 'EFFIS (Ευρωπαϊκό Σύστημα Πληροφοριών για τις Δασικές Πυρκαγιές), Υπηρεσία Διαχείρισης Εκτάκτων Αναγκών Copernicus'), sourceUrl: 'https://forest-fire.emergency.copernicus.eu/',
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Burnt areas: EFFIS, Copernicus Emergency Management Service, European Commission Joint Research Centre. Reduced by Kleanthis to the middle and the area of each perimeter.', attributionEl: 'Καμένες εκτάσεις: EFFIS, Copernicus Emergency Management Service, Κοινό Κέντρο Ερευνών της Ευρωπαϊκής Επιτροπής. Ο Κλεάνθης κράτησε το κέντρο και την έκταση κάθε περιμέτρου.',
    note: B('Each point is the middle of a mapped burnt perimeter with its area in hectares; the outline itself is not kept. Only larger fires are mapped (roughly 30 hectares or more) and a map can come a day or more after the fire. An empty list does not mean there was no fire. This feed is planned: its address was never confirmed from a running server.',
      'Κάθε σημείο είναι το κέντρο μιας χαρτογραφημένης καμένης περιμέτρου με την έκτασή της σε εκτάρια· το ίδιο το περίγραμμα δεν κρατιέται. Χαρτογραφούνται μόνο οι μεγαλύτερες πυρκαγιές (περίπου 30 εκτάρια ή περισσότερο) και ο χάρτης μπορεί να έρθει μία μέρα ή και περισσότερο μετά τη φωτιά. Μια άδεια λίστα δεν σημαίνει ότι δεν έγινε φωτιά. Η πηγή αυτή είναι σχεδιασμένη: η διεύθυνσή της δεν επιβεβαιώθηκε ποτέ από διακομιστή που τρέχει.'),
  }, (g) => ({ windowDays: g.windowDays || 30, counts: { areas: g.points.length }, features: g.points.map((p) => ({ lat: r4(p.lat), lng: r4(p.lng), hectares: p.ha, firstSeen: iso(p.t0), lastUpdate: iso(p.t1) })) }));

  function airStations() {
    const e = lazy(o.eea);
    const more = { refreshSeconds: 1800, source: B('European Environment Agency, Air Quality Download Service: stations reported by the Cyprus Department of Labour Inspection', 'Ευρωπαϊκός Οργανισμός Περιβάλλοντος, Υπηρεσία Λήψης Δεδομένων Ποιότητας Αέρα: σταθμοί που αναφέρει το Τμήμα Επιθεώρησης Εργασίας Κύπρου'),
      sourceUrl: 'https://eeadmz1-downloads-webapp.azurewebsites.net/', licence: 'EEA reuse policy: reuse with credit. The licence id of this dataset is recorded as unknown until a teacher reads its factsheet.', licenceUrl: 'https://www.eea.europa.eu/en/legal-notice',
      attribution: 'European Environment Agency (EEA), Air Quality Download Service; data reported by the Cyprus Department of Labour Inspection.', attributionEl: 'Ευρωπαϊκός Οργανισμός Περιβάλλοντος (ΕΟΠ), Υπηρεσία Λήψης Δεδομένων Ποιότητας Αέρα· δεδομένα από το Τμήμα Επιθεώρησης Εργασίας Κύπρου.',
      units: { pm25: 'µg/m³, mean of one hour', pm10: 'µg/m³, mean of one hour' },
      note: B('The newest hour each station has reported, for fine dust (PM2.5) and coarse dust (PM10). Each value has the end of its own hour; the two can differ. These are outdoor stations. Up-to-date values are not yet verified and can change.', 'Η πιο πρόσφατη ώρα που έχει αναφέρει κάθε σταθμός, για λεπτή σκόνη (PM2.5) και χονδρή σκόνη (PM10). Κάθε τιμή έχει το τέλος της δικής της ώρας· οι δύο μπορεί να διαφέρουν. Είναι υπαίθριοι σταθμοί. Οι τρέχουσες τιμές δεν έχουν ακόμη επαληθευτεί και μπορεί να αλλάξουν.') };
    let snap = null;
    try { snap = e ? e.snapshot() : null; } catch (err) { snap = null; }
    if (!snap || !snap.points || !snap.points.length) {
      const st = snap && snap.status;
      return missing('air-stations', { ...more, updated: null, features: [] }, st && st.off ? B('The official air-quality download is switched off on this server (' + (st.reason || 'off') + ').', 'Η λήψη των επίσημων δεδομένων ποιότητας αέρα είναι κλειστή σε αυτόν τον διακομιστή.') : B('No official station has reported yet.', 'Κανένας επίσημος σταθμός δεν έχει αναφέρει ακόμη.'));
    }
    const newest = Math.max(0, ...snap.points.map((p) => (p.time ? Date.parse(p.time) : 0)));
    return head('air-stations', { ...more, updated: iso(newest), saved: snap.updated, counts: { stations: snap.points.length },
      features: snap.points.map((p) => ({ id: p.id, name: p.name, lat: r5(p.lat), lng: r5(p.lng), stationType: p.type || null, area: p.area || null, pm25: p.pm25, pm25HourEnds: p.pm25Time, pm10: p.pm10, pm10HourEnds: p.pm10Time })) });
  }

  async function metStations() {
    const more = { demo: mock, refreshSeconds: 600, source: B('Cyprus Department of Meteorology, automatic weather stations (open data)', 'Τμήμα Μετεωρολογίας Κύπρου, αυτόματοι μετεωρολογικοί σταθμοί (ανοικτά δεδομένα)'), sourceUrl: 'https://www.dom.org.cy/',
      licence: 'Open data of the Department of Meteorology; the licence id is recorded as unknown in sources/cydom-stations.json.', licenceUrl: null,
      units: { temp: '°C', humidity: '%', wind: 'm/s', windFrom: 'degrees', rain10min: 'mm', rain24h: 'mm' },
      note: B('The newest reading of each station, with its own time. A station that did not report a value has null there.', 'Η πιο πρόσφατη μέτρηση κάθε σταθμού, με τη δική της ώρα. Ένας σταθμός που δεν ανέφερε μια τιμή έχει null εκεί.') };
    let d;
    try { d = await o.cydom(); }
    catch (e) { return missing('met-stations', { ...more, attribution: 'Weather Data Copyright The Cyprus Department of Meteorology', attributionEl: null, updated: null, features: [] }, e && e.switchedOff ? B('A teacher has switched this feed off.', 'Ένας εκπαιδευτικός έχει κλείσει αυτή τη ροή.') : B('The Met Office feed is not answering right now.', 'Η ροή της Μετεωρολογικής Υπηρεσίας δεν απαντά αυτή τη στιγμή.')); }
    const v = (x) => (isNum(x) ? x : null);
    return head('met-stations', { ...more, attribution: d.copyright || 'Weather Data Copyright The Cyprus Department of Meteorology', attributionEl: d.copyright || 'Weather Data Copyright The Cyprus Department of Meteorology', updated: d.feedTime || d.updated || null, counts: { stations: d.points.length },
      features: d.points.map((p) => ({ id: p.id, name: p.name, lat: r4(p.lat), lng: r4(p.lng), time: p.time || null, temp: v(p.temp), humidity: v(p.hum), wind: v(p.ws), windFrom: v(p.wd), rain10min: v(p.rain10), rain24h: v(p.rain24) })) });
  }

  async function airports() {
    const more = { demo: mock, refreshSeconds: 600, source: B('Airport weather reports (METAR) from the NOAA Aviation Weather Center', 'Μετεωρολογικές αναφορές αεροδρομίων (METAR) από το NOAA Aviation Weather Center'), sourceUrl: 'https://aviationweather.gov/',
      licence: 'US government open data; the licence id is recorded as unknown in sources/metar-airports.json.', licenceUrl: null, attribution: 'NOAA Aviation Weather Center', attributionEl: 'NOAA Aviation Weather Center',
      units: { temp: '°C', wind: 'm/s', windFrom: 'degrees' },
      note: B('The newest weather report of each airport that answered. This is the weather at the airport, not its flights or passengers; the repo holds no flight data with a place.', 'Η πιο πρόσφατη μετεωρολογική αναφορά κάθε αεροδρομίου που απάντησε. Είναι ο καιρός στο αεροδρόμιο, όχι οι πτήσεις ή οι επιβάτες του· το αποθετήριο δεν έχει δεδομένα πτήσεων με θέση.') };
    let d;
    try { d = await o.metar(); }
    catch (e) { return missing('airports', { ...more, updated: null, features: [] }, e && e.switchedOff ? B('A teacher has switched this feed off.', 'Ένας εκπαιδευτικός έχει κλείσει αυτή τη ροή.') : B('The airport weather feed is not answering right now.', 'Η ροή του καιρού των αεροδρομίων δεν απαντά αυτή τη στιγμή.')); }
    const v = (x) => (isNum(x) ? x : null);
    const newest = Math.max(0, ...d.points.map((p) => (p.time ? Date.parse(p.time) : 0)));
    return head('airports', { ...more, updated: iso(newest), counts: { airports: d.points.length },
      features: d.points.map((p) => ({ id: p.id, name: p.name, lat: r4(p.lat), lng: r4(p.lng), time: p.time || null, temp: v(p.temp), wind: v(p.ws), windFrom: v(p.wd) })) });
  }

  /* ----- which builder, and how long its answer is kept ----- */
  const FOREVER = 6 * 3600000;   // a frozen file: the build is kept for hours (frozen() notices a changed file by itself at the next build)
  const BUILD = {
    population: [population, FOREVER], age: [age, FOREVER], buildings: [buildings, 60000], 'bus-network': [busNetwork, 600000], 'bus-now': [busNow, 45000],
    'own-vehicles': [ownVehicles, 60000], earthquakes: [earthquakes, FOREVER], 'ev-charging': [evCharging, FOREVER], crossings: [crossings, FOREVER],
    'flood-reaches': [floodReaches, FOREVER], 'fire-hotspots': [fireHotspots, 60000], 'burnt-areas': [burntAreas, 60000], 'air-stations': [airStations, 60000],
    'met-stations': [metStations, 60000], airports: [airports, 60000], permits: [permits, FOREVER], 'air-day': [airDay, FOREVER], drought: [drought, FOREVER],
    'bathing-water': [bathingWater, FOREVER], 'seabed-profiles': [seabedProfiles, FOREVER], 'aerosol-sites': [aerosolSites, FOREVER],
  };
  const build = (id) => keep(id, BUILD[id][1], async () => {
    const body = await BUILD[id][0]();
    return { body, text: JSON.stringify({ ...body, generated: iso(now()) }) };
  });
  const FROZEN = new Set(IDS.filter((id) => BUILD[id][1] === FOREVER));

  /* ----- the HTTP side ----- */
  const hits = new Map();
  const RATE = Math.max(10, Math.min(100000, Number(process.env.STACK_RATE_PER_MIN) || 240));
  function tooMany(req) {
    const t = now(), ip = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '?').slice(0, 64);
    let h = hits.get(ip);
    if (!h || t - h[1] > 60000) { h = [0, t]; hits.set(ip, h); if (hits.size > 4000) hits.clear(); }
    return ++h[0] > RATE;
  }
  function send(res, status, text, cache, extra) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': cache || 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...(extra || {}) });
    res.end(text);
  }
  const index = () => JSON.stringify({
    name: 'Kleanthis data stack', about: 'One sheet per dataset that has a place on the map. The spec for drawing them is in docs/STACK-DATA.md.',
    coordinates: 'lat,lng', demo: { sensors: demo, weather: mock },
    sheets: IDS.map((id) => { const s = SHEETS[id]; return { id, url: '/api/stack/' + id, title: s.title, band: s.band, kind: s.kind, live: s.kind === 'live', geometry: s.geometry, unit: s.unit, honesty: id === 'own-vehicles' ? delayWords() : s.honesty }; }),
  });
  async function handle(req, res, url) {
    const m = /^\/api\/stack(?:\/([a-z0-9-]{1,40}))?\/?$/.exec(url.pathname);
    if (!m) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, '{"error":"Use GET."}', null, { Allow: 'GET, HEAD' }); return true; }
    if (tooMany(req)) { send(res, 429, '{"error":"Too many requests, try again in a minute."}', null, { 'Retry-After': '60' }); return true; }
    if (!m[1]) { send(res, 200, index(), 'no-store'); return true; }
    if (!Object.prototype.hasOwnProperty.call(BUILD, m[1])) { send(res, 404, JSON.stringify({ error: 'No such sheet.', sheets: IDS })); return true; }
    try {
      const { text } = await build(m[1]);
      send(res, 200, text, FROZEN.has(m[1]) ? 'public, max-age=300' : 'no-store');
    } catch (e) {
      log('Stack data: ' + m[1] + ' could not be built: ' + String((e && e.message) || e).slice(0, 160));
      send(res, 200, JSON.stringify({ ...missing(m[1], { features: [], ...(m[1] === 'own-vehicles' ? { honesty: delayWords() } : {}) }, B('This sheet could not be prepared on the server.', 'Αυτό το φύλλο δεν μπόρεσε να ετοιμαστεί στον διακομιστή.')), generated: iso(now()) }));
    }
    return true;
  }

  return { ids: IDS, handle, build: async (id) => (await build(id)).body, _t: { buildingGrid, alongPattern, cyprusClock, SHEETS, CITIES, DISTRICTS } };
}

module.exports = { createStackData, buildingGrid, alongPattern, cyprusClock, SHEETS, IDS };
