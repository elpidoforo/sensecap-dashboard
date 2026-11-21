/*
  Node-link widget data (pure, tested by tests/viz/nodelink_test.js). "Where our data comes from": publishers on the left,
  the stack sheets (grouped by band) on the right, one edge per sheet per publisher named in that sheet's `source` text.
  Nothing is invented: a publisher exists only if its name is written in a source string; a source that cannot be mapped
  becomes its own node with the string shortened. Works as a browser script (window.SC.viz.nodelinkData) and as CommonJS.
    model = { id, title, note, empty|null, bands:[{k,n}], publishers:[{id,n,count,sheets,licences,mapped}],
              sheets:[{id,n,band,kind,style,publishers}], edges:[{from,to,sheet,style}], styles:[{k,n}],
              textRows:[[en,el]], aria:[en,el] }
*/
(function (root) {
  'use strict';
  const BANDS = [
    { k: 'WATER', n: ['Water', 'Νερό'] }, { k: 'GROUND', n: ['Ground', 'Έδαφος'] }, { k: 'CITY', n: ['City', 'Πόλη'] },
    { k: 'AIR', n: ['Air', 'Αέρας'] }, { k: 'SPACE', n: ['Space', 'Διάστημα'] }];
  const STYLES = [
    { k: 'flow', n: ['Live feed: slow moving dashes', 'Ζωντανή ροή: αργά κινούμενες διακεκομμένες'] },
    { k: 'dash', n: ['Delayed or scheduled: still dashed line', 'Με καθυστέρηση ή προγραμματισμένα: ακίνητη διακεκομμένη'] },
    { k: 'solid', n: ['Fixed, snapshot, census or periodic: still thin line', 'Σταθερά, στιγμιότυπο, απογραφή ή περιοδικά: ακίνητη λεπτή γραμμή'] }];
  // Publisher names, matched in the English source text of a sheet. A sheet gets one edge for every publisher whose
  // pattern matches. The match is on the words of the answer only; the Greek name is the one written in the Greek source.
  const PUBLISHERS = [
    { id: 'cystat', n: ['CYSTAT (Statistical Service of Cyprus)', 'CYSTAT (Στατιστική Υπηρεσία Κύπρου)'], re: /CYSTAT|Statistical Service of Cyprus/i },
    { id: 'osm', n: ['OpenStreetMap', 'OpenStreetMap'], re: /OpenStreetMap/i },
    { id: 'nap', n: ['National Access Point (CyNAP)', 'Εθνικό Σημείο Πρόσβασης (CyNAP)'], re: /National Access Point|CyNAP/i },
    { id: 'pwd', n: ['Public Works Department', 'Τμήμα Δημοσίων Έργων'], re: /Public Works Department/i },
    { id: 'ems', n: ['Dept. of Electrical and Mechanical Services', 'Τμήμα Ηλεκτρομηχανολογικών Υπηρεσιών'], re: /Electrical and Mechanical Services/i },
    { id: 'wdd', n: ['Water Development Department', 'Τμήμα Αναπτύξεως Υδάτων'], re: /Water Development Department/i },
    { id: 'usgs', n: ['USGS (US Geological Survey)', 'USGS (Γεωλογική Υπηρεσία ΗΠΑ)'], re: /US Geological Survey|USGS/i },
    { id: 'firms', n: ['NASA FIRMS', 'NASA FIRMS'], re: /NASA FIRMS/i },
    { id: 'aeronet', n: ['NASA AERONET', 'NASA AERONET'], re: /NASA AERONET|AERONET/i },
    { id: 'effis', n: ['EFFIS / Copernicus EMS', 'EFFIS / Copernicus EMS'], re: /EFFIS|Copernicus/i },
    { id: 'eea', n: ['European Environment Agency', 'Ευρωπαϊκός Οργανισμός Περιβάλλοντος'], re: /European Environment Agency/i },
    { id: 'dgenv', n: ['DG Environment', 'ΓΔ Περιβάλλοντος'], re: /DG Environment/i },
    { id: 'dli', n: ['Dept. of Labour Inspection', 'Τμήμα Επιθεώρησης Εργασίας'], re: /Department of Labour Inspection/i },
    { id: 'met', n: ['Department of Meteorology', 'Τμήμα Μετεωρολογίας'], re: /Department of Meteorology/i },
    { id: 'noaa', n: ['NOAA Aviation Weather Center', 'NOAA Aviation Weather Center'], re: /NOAA/i },
    { id: 'edo', n: ['European Drought Observatory (JRC)', 'Ευρωπαϊκό Παρατηρητήριο Ξηρασίας (JRC)'], re: /European Drought Observatory|Joint Research Centre/i },
    { id: 'emodnet', n: ['EMODnet Bathymetry', 'EMODnet Bathymetry'], re: /EMODnet/i },
    { id: 'own', n: ['Kleanthis (own sensors)', 'Κλεάνθης (δικοί μας αισθητήρες)'], re: /^Kleanthis\b/i }];
  const pair = (v) => (Array.isArray(v) ? [String(v[0] == null ? '' : v[0]), String(v[1] == null ? v[0] : v[1])] : [String(v == null ? '' : v), String(v == null ? '' : v)]);
  const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };

  // source ([en,el] or string) -> [{id,n,mapped}]. An empty or unmappable source gives one node of its own, never a guess.
  function normalise(source) {
    const s = pair(source), out = [];
    for (const p of PUBLISHERS) if (p.re.test(s[0])) out.push({ id: p.id, n: p.n.slice(), mapped: true });
    if (out.length) return out;
    if (!s[0].trim() && !s[1].trim()) return [];
    return [{ id: 'other:' + s[0].trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80), n: [cut(s[0] || s[1], 48), cut(s[1] || s[0], 48)], mapped: false }];
  }
  // live feeds move; delayed or scheduled are still dashed; everything else is a still thin line.
  function styleOf(sheet) {
    if (sheet.live === true || sheet.kind === 'live') return 'flow';
    if (sheet.kind === 'delayed' || sheet.kind === 'scheduled') return 'dash';
    return 'solid';
  }
  // catalogue = answer of /api/stack ({sheets:[...]}), answers = { id: answer of /api/stack/<id> }
  function build(catalogue, answers) {
    const cat = ((catalogue && catalogue.sheets) || []).filter((s) => s && s.id), ans = answers || {};
    const order = (b) => { const i = BANDS.findIndex((x) => x.k === b); return i < 0 ? BANDS.length : i; };
    const sheets = cat.map((s, i) => ({ s, i })).sort((a, b) => order(a.s.band) - order(b.s.band) || a.i - b.i).map(({ s }) => {
      const a = ans[s.id] || {};
      return { id: s.id, n: pair(s.title || s.id), band: s.band, kind: s.kind, style: styleOf(s), licence: a.licence ? String(a.licence) : null, src: normalise(a.source) };
    });
    const pubs = new Map(), edges = [];
    for (const sh of sheets) for (const p of sh.src) {
      if (!pubs.has(p.id)) pubs.set(p.id, { id: p.id, n: p.n, count: 0, sheets: [], licences: [], mapped: p.mapped });
      const q = pubs.get(p.id); q.count++; q.sheets.push(sh.id);
      if (sh.licence && !q.licences.includes(sh.licence)) q.licences.push(sh.licence);
      edges.push({ from: p.id, to: sh.id, sheet: sh.id, style: sh.style });
    }
    // alphabetical, so the order never reads as a ranking
    const publishers = [...pubs.values()].sort((a, b) => a.n[0].localeCompare(b.n[0]));
    const outSheets = sheets.map((sh) => ({ id: sh.id, n: sh.n, band: sh.band, kind: sh.kind, style: sh.style, publishers: sh.src.map((p) => p.id) }));
    const usedBands = BANDS.filter((b) => outSheets.some((s) => s.band === b.k));
    const byId = new Map(outSheets.map((s) => [s.id, s]));
    const textRows = publishers.map((p) => {
      const names = p.sheets.map((id) => byId.get(id).n);
      const lic = p.licences.length ? p.licences : null;
      return [p.n[0] + ' (' + p.count + (p.count === 1 ? ' sheet' : ' sheets') + '): ' + names.map((n) => n[0]).join(', ') + '. Licence: ' + (lic ? lic.join(' | ') : 'not stated in the answer') + '.',
        p.n[1] + ' (' + p.count + (p.count === 1 ? ' φύλλο' : ' φύλλα') + '): ' + names.map((n) => n[1]).join(', ') + '. Άδεια (στα αγγλικά, όπως δημοσιεύεται): ' + (lic ? lic.join(' | ') : 'δεν αναφέρεται στην απάντηση') + '.'];
    });
    const empty = outSheets.length ? null : ['No data sheets were loaded, so there is no map of sources yet.', 'Δεν φορτώθηκαν φύλλα δεδομένων, άρα δεν υπάρχει ακόμη χάρτης πηγών.'];
    const aria = empty || ['Diagram of where our data comes from: ' + publishers.length + ' publishers on the left, ' + outSheets.length + ' data sheets on the right, ' + edges.length + ' lines, each meaning that a sheet is built from that publisher.',
      'Διάγραμμα για το από πού έρχονται τα δεδομένα μας: ' + publishers.length + ' φορείς αριστερά, ' + outSheets.length + ' φύλλα δεδομένων δεξιά, ' + edges.length + ' γραμμές, κάθε μία σημαίνει ότι ένα φύλλο στηρίζεται σε αυτόν τον φορέα.'];
    return { id: 'nodelink', title: ['Where our data comes from', 'Από πού έρχονται τα δεδομένα μας'],
      note: ['Circle size is the number of sheets, nothing more. Publishers are listed alphabetically.', 'Το μέγεθος του κύκλου είναι ο αριθμός φύλλων, τίποτα άλλο. Οι φορείς είναι με αλφαβητική σειρά.'],
      empty, bands: usedBands, publishers, sheets: outSheets, edges, styles: STYLES, textRows, aria };
  }
  const api = { build, normalise, styleOf, BANDS, STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.nodelinkData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
