'use strict';
// Standalone test for public/site/viz/nodelink-data.js. Run: node tests/viz/nodelink_test.js
const D = require('../../public/site/viz/nodelink-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ')');

// the 21 sheets as the running server gave them: id, band, kind, live, source en, source el, licence (hand-copied)
const REAL = [
  ["population", "CITY", "census", false, "Statistical Service of Cyprus (CYSTAT), Census of Population and Housing 2021", "Στατιστική Υπηρεσία Κύπρου (CYSTAT), Απογραφή Πληθυσμού και Κατοικιών 2021", "CYSTAT data reuse terms. Attribute the source and identify modifications."],
  ["age", "CITY", "census", false, "Statistical Service of Cyprus (CYSTAT), Census of Population and Housing 2021", "Στατιστική Υπηρεσία Κύπρου (CYSTAT), Απογραφή Πληθυσμού και Κατοικιών 2021", "CYSTAT data reuse terms. Attribute the source and identify modifications."],
  ["buildings", "CITY", "periodic", false, "OpenStreetMap, through the Overpass service; a copy is kept for 30 days", "OpenStreetMap, μέσω της υπηρεσίας Overpass· ένα αντίγραφο κρατιέται για 30 ημέρες", "Open Database Licence (ODbL) 1.0"],
  ["bus-network", "CITY", "periodic", false, "Cyprus National Access Point for transport (traffic4cyprus.org.cy), Public Works Department: static GTFS timetables", "Εθνικό Σημείο Πρόσβασης για τις μεταφορές (traffic4cyprus.org.cy), Τμήμα Δημοσίων Έργων: στατικά δρομολόγια GTFS", "CC BY 4.0"],
  ["bus-now", "CITY", "scheduled", false, "Cyprus National Access Point for transport (traffic4cyprus.org.cy), Public Works Department: static GTFS timetables", "Εθνικό Σημείο Πρόσβασης για τις μεταφορές (traffic4cyprus.org.cy), Τμήμα Δημοσίων Έργων: στατικά δρομολόγια GTFS", "CC BY 4.0"],
  ["own-vehicles", "CITY", "delayed", false, "Kleanthis: the SenseCAP sensors the schools carry on buses and cars", "Κλεάνθης: οι αισθητήρες SenseCAP που έχουν τα σχολεία σε λεωφορεία και αυτοκίνητα", "Own data of the project. Positions are public only in this delayed and rounded form."],
  ["earthquakes", "GROUND", "catalogue", false, "US Geological Survey, ANSS Comprehensive Earthquake Catalog", "US Geological Survey, ANSS Comprehensive Earthquake Catalog", "Public domain (US Geological Survey). USGS asks to be credited as the source."],
  ["ev-charging", "CITY", "snapshot", false, "Department of Electrical and Mechanical Services, through the National Access Point (CyNAP)", "Τμήμα Ηλεκτρομηχανολογικών Υπηρεσιών, μέσω του Εθνικού Σημείου Πρόσβασης (CyNAP)", "CC BY 4.0"],
  ["crossings", "CITY", "snapshot", false, "Public Works Department, through the National Access Point (CyNAP)", "Τμήμα Δημοσίων Έργων, μέσω του Εθνικού Σημείου Πρόσβασης (CyNAP)", "CC BY 4.0"],
  ["flood-reaches", "WATER", "snapshot", false, "Water Development Department, Republic of Cyprus: designated river reaches and flood risk maps", "Τμήμα Αναπτύξεως Υδάτων, Κυπριακή Δημοκρατία: καθορισμένα τμήματα ποταμών και χάρτες κινδύνου πλημμύρας", "Designated reaches: CC BY 4.0. Floodplain polygons: CC BY (version unspecified)."],
  ["fire-hotspots", "GROUND", "live", true, "NASA FIRMS active fire detections (VIIRS and MODIS)", "Ανιχνεύσεις ενεργών πυρκαγιών NASA FIRMS (VIIRS και MODIS)", "NASA open data; acknowledgement requested"],
  ["burnt-areas", "GROUND", "periodic", false, "EFFIS (European Forest Fire Information System), Copernicus Emergency Management Service", "EFFIS (Ευρωπαϊκό Σύστημα Πληροφοριών για τις Δασικές Πυρκαγιές), Υπηρεσία Διαχείρισης Εκτάκτων Αναγκών Copernicus", "CC BY 4.0"],
  ["air-stations", "AIR", "live", true, "European Environment Agency, Air Quality Download Service: stations reported by the Cyprus Department of Labour Inspection", "Ευρωπαϊκός Οργανισμός Περιβάλλοντος, Υπηρεσία Λήψης Δεδομένων Ποιότητας Αέρα: σταθμοί που αναφέρει το Τμήμα Επιθεώρησης Εργασίας Κύπρου", "EEA reuse policy: reuse with credit. The licence id of this dataset is recorded as unknown until a teacher reads its factsheet."],
  ["met-stations", "AIR", "live", true, "Cyprus Department of Meteorology, automatic weather stations (open data)", "Τμήμα Μετεωρολογίας Κύπρου, αυτόματοι μετεωρολογικοί σταθμοί (ανοικτά δεδομένα)", "Open data of the Department of Meteorology; the licence id is recorded as unknown in sources/cydom-stations.json."],
  ["airports", "AIR", "live", true, "Airport weather reports (METAR) from the NOAA Aviation Weather Center", "Μετεωρολογικές αναφορές αεροδρομίων (METAR) από το NOAA Aviation Weather Center", "US government open data; the licence id is recorded as unknown in sources/metar-airports.json."],
  ["permits", "CITY", "periodic", false, "Statistical Service of Cyprus (CYSTAT), building permits, table 1440010E", "Στατιστική Υπηρεσία Κύπρου (CYSTAT), άδειες οικοδομής, πίνακας 1440010E", "CYSTAT data reuse terms. Attribute the source and identify modifications."],
  ["air-day", "AIR", "snapshot", false, "Cyprus Department of Labour Inspection, Air Quality Monitoring Network", "Τμήμα Επιθεώρησης Εργασίας Κύπρου, Δίκτυο Παρακολούθησης Ποιότητας Αέρα", "Creative Commons Attribution 4.0 International (CC BY 4.0)"],
  ["drought", "GROUND", "snapshot", false, "European Drought Observatory, Joint Research Centre: Combined Drought Indicator", "Ευρωπαϊκό Παρατηρητήριο Ξηρασίας, Κοινό Κέντρο Ερευνών: Συνδυασμένος Δείκτης Ξηρασίας", "CC BY 4.0"],
  ["bathing-water", "WATER", "snapshot", false, "European Environment Agency and DG Environment, bathing water status", "Ευρωπαϊκός Οργανισμός Περιβάλλοντος και ΓΔ Περιβάλλοντος, κατάσταση νερών κολύμβησης", "CC BY 4.0"],
  ["seabed-profiles", "WATER", "snapshot", false, "EMODnet Bathymetry Consortium, EMODnet Digital Terrain Model", "EMODnet Bathymetry Consortium, ψηφιακό μοντέλο εδάφους EMODnet", "CC BY 4.0"],
  ["aerosol-sites", "AIR", "snapshot", false, "NASA AERONET Version 3, Level 2.0", "NASA AERONET Έκδοση 3, Επίπεδο 2.0", "Public domain. AERONET requests site PI consultation and acknowledgement."],];
const cat = { sheets: REAL.map((r) => ({ id: r[0], band: r[1], kind: r[2], live: r[3], title: [r[0], r[0]] })) };
const ans = {}; for (const r of REAL) ans[r[0]] = { source: [r[4], r[5]], licence: r[6] };
const m = D.build(cat, ans);
const pub = (id) => m.publishers.find((p) => p.id === id);

// 1. normaliser on 8 real source strings
const EIGHT = [
  ['Statistical Service of Cyprus (CYSTAT), Census of Population and Housing 2021', ['cystat']],
  ['OpenStreetMap, through the Overpass service; a copy is kept for 30 days', ['osm']],
  ['US Geological Survey, ANSS Comprehensive Earthquake Catalog', ['usgs']],
  ['Cyprus Department of Meteorology, automatic weather stations (open data)', ['met']],
  ['Airport weather reports (METAR) from the NOAA Aviation Weather Center', ['noaa']],
  ['Public Works Department, through the National Access Point (CyNAP)', ['nap', 'pwd']],
  ['European Environment Agency and DG Environment, bathing water status', ['eea', 'dgenv']],
  ['Kleanthis: the SenseCAP sensors the schools carry on buses and cars', ['own']]];
for (const [s, ids] of EIGHT) eq(D.normalise([s, s]).map((p) => p.id).sort(), ids.slice().sort(), 'normalise ' + s.slice(0, 30));
ok(D.normalise([EIGHT[1][0], 'x'])[0].n[1] === 'OpenStreetMap', 'Greek name of publisher is bilingual pair');

// 2. unmapped fallback: own node, shortened, never guessed
const u = D.normalise(['Some Unknown Observatory of Mars with an extremely long descriptive source text that goes on', 'Άγνωστος φορέας']);
ok(u.length === 1 && u[0].mapped === false && u[0].id.startsWith('other:'), 'unmapped becomes own node');
ok(u[0].n[0].length <= 48 && u[0].n[0].endsWith('…') && u[0].n[1] === 'Άγνωστος φορέας', 'unmapped label shortened, bilingual');
eq(D.normalise(['', '']), [], 'empty source gives no node');
const um = D.build({ sheets: [{ id: 'z', band: 'AIR', kind: 'snapshot', live: false, title: ['Z', 'Ζ'] }] }, { z: { source: ['Mystery body', 'Άγνωστος'], licence: 'L' } });
ok(um.publishers.length === 1 && um.publishers[0].mapped === false && um.edges.length === 1, 'unmapped source still gets one edge');

// 3. counts on the real 21 sheets
eq(m.sheets.length, 21, 'sheets');
const expectEdges = { cystat: 3, osm: 1, nap: 4, pwd: 3, ems: 1, wdd: 1, usgs: 1, firms: 1, aeronet: 1, effis: 1, eea: 2, dgenv: 1, dli: 2, met: 1, noaa: 1, edo: 1, emodnet: 1, own: 1 };
for (const k of Object.keys(expectEdges)) eq(pub(k) && pub(k).count, expectEdges[k], 'edges of ' + k);
eq(m.publishers.length, Object.keys(expectEdges).length, 'publisher count');
eq(m.publishers.filter((p) => !p.mapped).length, 0, 'every real source is mapped');
eq(m.edges.length, Object.values(expectEdges).reduce((a, b) => a + b, 0), 'total edges');
ok(m.sheets.every((s) => s.publishers.length >= 1), 'every sheet has at least one publisher');
ok(m.edges.every((e) => m.sheets.find((s) => s.id === e.to).publishers.includes(e.from)), 'edges agree with sheets');
eq(m.publishers.reduce((a, p) => a + p.count, 0), m.edges.length, 'node size = sheet count adds up to edges');
eq(pub('cystat').sheets, ['population', 'age', 'permits'], 'CYSTAT sheets');
const names = m.publishers.map((p) => p.n[0]); eq(names, names.slice().sort((a, b) => a.localeCompare(b)), 'publishers alphabetical, not ranked');

// 4. band order
eq(m.bands.map((b) => b.k), ['WATER', 'GROUND', 'CITY', 'AIR'], 'bands in order, empty SPACE left out');
const rank = { WATER: 0, GROUND: 1, CITY: 2, AIR: 3, SPACE: 4 };
ok(m.sheets.every((s, i) => i === 0 || rank[m.sheets[i - 1].band] <= rank[s.band]), 'sheets sorted by band');
eq(m.sheets.filter((s) => s.band === 'CITY').map((s) => s.id).slice(0, 2), ['population', 'age'], 'catalogue order kept inside a band');

// 5. style mapping
const st = (id) => m.sheets.find((s) => s.id === id).style;
eq(['fire-hotspots', 'air-stations', 'met-stations', 'airports'].map(st), ['flow', 'flow', 'flow', 'flow'], 'live feeds flow');
eq(['bus-now', 'own-vehicles'].map(st), ['dash', 'dash'], 'scheduled and delayed are still dashed');
eq(['population', 'earthquakes', 'bus-network', 'ev-charging', 'burnt-areas', 'permits'].map(st), ['solid', 'solid', 'solid', 'solid', 'solid', 'solid'], 'fixed, catalogue and periodic are solid');
ok(m.edges.every((e) => e.style === st(e.sheet)), 'edge style = sheet style');
eq(m.edges.filter((e) => e.style === 'flow').length, 5, 'live edges: firms, eea, dli, met, noaa');

// 6. licences
ok(pub('cystat').licences.length === 1 && /reuse terms/.test(pub('cystat').licences[0]), 'CYSTAT licence from answers');
eq(pub('nap').licences, ['CC BY 4.0'], 'NAP sheets share one licence, listed once');
ok(pub('osm').licences[0] === 'Open Database Licence (ODbL) 1.0', 'OSM licence');

// 7. bilingual strings and text rows
const pair = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0] && v[1];
ok(pair(m.title) && pair(m.note) && pair(m.aria), 'title, note, aria are pairs');
ok(m.publishers.every((p) => pair(p.n)) && m.sheets.every((s) => pair(s.n)) && m.bands.every((b) => pair(b.n)) && m.styles.every((s) => pair(s.n)), 'all labels are pairs');
eq(m.textRows.length, m.publishers.length, 'one text row per publisher');
ok(m.textRows.every((r) => pair(r) && r[0] !== r[1]), 'text rows bilingual');
ok(m.textRows.every((r) => !/[«»]/.test(r.join())) && !/[«»]/.test(JSON.stringify(m)), 'no guillemets');
ok(/Licence: /.test(m.textRows[0][0]) && /Άδεια/.test(m.textRows[0][1]), 'text rows carry the licence');
ok(!/best|top|most important|rank/i.test(JSON.stringify([m.note, m.textRows, m.aria])), 'no ranking words');

// 8. empty state
const e = D.build({ sheets: [] }, {});
ok(pair(e.empty) && e.publishers.length === 0 && e.edges.length === 0 && pair(e.aria), 'honest empty state in two languages');
ok(D.build(null, null).empty !== null, 'null input is empty, not a crash');

console.log('nodelink: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
