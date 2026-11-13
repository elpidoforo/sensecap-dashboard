/*
  Shared helpers of four toolkit pages: forecast, beforeafter, timemachine, askmap. Not a page itself (it is not in index.json).
  A page loads it with SC.tk3load() (defined at the top of each of the four pages) and gets window.SC.tk3:
    n(v, d)                  a number in the page's language (comma in Greek), "–" when there is none
    cityName(id), CITY       the four cities
    DNAME, dName(id)         the six districts of the island picture (island.js)
    districtOf(lng, lat)     the district whose shape holds the point; a point just off the drawn coast gets the nearest shape within
                             about 5 km; else null. Our own rule on a simplified outline, not an official boundary.
    km(aLat, aLng, bLat, bLng)
    parseCsv(text)           rows of cells (quotes and commas inside quotes are understood; lines that start with # are skipped)
    cell(v), toCsv(rows)     CSV text; a cell that starts with = + - @ (or a tab) gets a leading ' so a spreadsheet never runs it
    download(name, text)     saves a text file from the browser
    bathing()                the reviewed bathing-water history: { years, labels, sites: Map(id -> {id, name, lat, lng, district}), byYear: Map(year -> Map(id -> label)), meta }
    LABELS                   label -> { c: colour, n: [en, el] }
    island(opts)             an <svg> of the island with one <path> per district: { svg, paths, layer }
  Nothing here reads vehicles or people.
*/
(function () {
  'use strict';
  const SC = window.SC, T = SC.t, sv = SC.svgEl;
  const isEl = () => SC.lang === 'el';
  const n = (v, d) => (v == null || !isFinite(v) ? '–' : Number(v).toFixed(d == null ? 1 : d).replace('-', '−').replace('.', isEl() ? ',' : '.'));

  const CITY = { larnaka: ['Larnaka', 'Λάρνακα'], lefkosia: ['Lefkosia', 'Λευκωσία'], limassol: ['Limassol', 'Λεμεσός'], paphos: ['Paphos', 'Πάφος'] };
  const cityName = (c) => (CITY[c] || [c, c])[isEl() ? 1 : 0];
  const DNAME = { nicosia: ['Lefkosia district', 'Επαρχία Λευκωσίας'], larnaca: ['Larnaka district', 'Επαρχία Λάρνακας'], limassol: ['Limassol district', 'Επαρχία Λεμεσού'],
    paphos: ['Paphos district', 'Επαρχία Πάφου'], famagusta: ['Famagusta district', 'Επαρχία Αμμοχώστου'], kyrenia: ['Kyrenia district', 'Επαρχία Κερύνειας'] };
  const dName = (id) => (DNAME[id] || [id, id])[isEl() ? 1 : 0];

  function km(aLat, aLng, bLat, bLng) {
    const rad = Math.PI / 180, dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  /* ---------- districts: point in polygon on the outlines of island.js ---------- */
  let polys = null;
  function shapes() {
    if (polys) return polys;
    polys = [];
    if (!window.ISLAND || !ISLAND.districts) return polys;
    Object.keys(ISLAND.districts).forEach((id) => ISLAND.districts[id].split('M').forEach((seg) => {
      const pts = seg.replace(/Z/g, '').split('L').map((p) => p.trim().split(/[ ,]+/).map(Number)).filter((p) => p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
      if (pts.length < 3) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
      polys.push({ id, pts, box: [x0, y0, x1, y1] });
    }));
    return polys;
  }
  function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y) && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  }
  const NEAR_PX = 24;   // about 5 km on the island picture
  function districtOf(lng, lat) {
    if (!window.ISLAND || !isFinite(lng) || !isFinite(lat)) return null;
    const q = ISLAND.project(Number(lng), Number(lat));
    for (const p of shapes()) { if (q[0] < p.box[0] || q[0] > p.box[2] || q[1] < p.box[1] || q[1] > p.box[3]) continue; if (inPoly(p.pts, q[0], q[1])) return p.id; }
    let best = null, bd = NEAR_PX * NEAR_PX;
    for (const p of shapes()) {
      if (q[0] < p.box[0] - NEAR_PX || q[0] > p.box[2] + NEAR_PX || q[1] < p.box[1] - NEAR_PX || q[1] > p.box[3] + NEAR_PX) continue;
      for (const v of p.pts) { const d = (v[0] - q[0]) ** 2 + (v[1] - q[1]) ** 2; if (d < bd) { bd = d; best = p.id; } }
    }
    return best;
  }

  /* ---------- CSV ---------- */
  function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', quoted = false;
    const s = String(text || '').replace(/^﻿/, '');
    const endRow = () => { row.push(cur); cur = ''; if (!(row.length === 1 && row[0] === '') && !(row[0] || '').startsWith('#')) rows.push(row); row = []; };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch;
      } else if (ch === '"' && cur === '') quoted = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') endRow();
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) endRow();
    return rows;
  }
  // a cell a spreadsheet could read as a formula gets a leading apostrophe; then normal CSV quoting
  function cell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  function download(name, text) {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    const a = SC.el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- bathing-water history (reviewed file, labels exactly as reported) ---------- */
  const LABELS = {
    '1 - Excellent': { c: '#4CCBEA', n: ['Excellent', 'Εξαιρετική'] },
    '2 - Good': { c: '#7FD6A0', n: ['Good', 'Καλή'] },
    '3 - Good or Sufficient': { c: '#C9D66B', n: ['Good or Sufficient (older scheme)', 'Καλή ή Επαρκής (παλιό σύστημα)'] },
    '3 - Sufficient': { c: '#FFC857', n: ['Sufficient', 'Επαρκής'] },
    '4 - Poor': { c: '#FF7A6A', n: ['Poor', 'Ανεπαρκής'] },
    '0 - Not classified': { c: '#8793A6', n: ['Not classified', 'Χωρίς ταξινόμηση'] },
  };
  const LABEL_ORDER = Object.keys(LABELS);
  const labelName = (l) => (LABELS[l] ? LABELS[l].n[isEl() ? 1 : 0] : String(l));
  const labelColour = (l) => (LABELS[l] ? LABELS[l].c : '#8793A6');
  let bathingP = null;
  function bathing() {
    if (bathingP) return bathingP;
    bathingP = (async () => {
      const [view, text] = await Promise.all([SC.api('/layers/api/context/bathing-water-history'), SC.api('/layers/api/context/bathing-water-history.csv', { text: true })]);
      if (!view || !view.available) { const e = new Error(T('The reviewed bathing-water file is not available right now, so nothing is shown.', 'Το ελεγμένο αρχείο για τα νερά κολύμβησης δεν είναι διαθέσιμο τώρα, γι’ αυτό δεν εμφανίζεται τίποτα.')); e.unavailable = true; throw e; }
      const rows = parseCsv(text), head = rows.shift() || [];
      const iId = head.indexOf('site_id'), iName = head.indexOf('site_name'), iYear = head.indexOf('season'), iLab = head.indexOf('quality_label_as_reported');
      if (iId < 0 || iYear < 0 || iLab < 0) throw new Error(T('The bathing-water file has a shape this page does not know.', 'Το αρχείο για τα νερά κολύμβησης έχει μορφή που η σελίδα δεν γνωρίζει.'));
      const sites = new Map(), byYear = new Map();
      (view.sites || []).forEach((s) => { if (s.lat != null && s.lng != null) sites.set(s.id, { id: s.id, name: s.name || s.id, lat: Number(s.lat), lng: Number(s.lng), district: districtOf(Number(s.lng), Number(s.lat)) }); });
      for (const r of rows) {
        const y = Number(r[iYear]);
        if (!Number.isInteger(y) || !r[iId]) continue;
        if (!byYear.has(y)) byYear.set(y, new Map());
        byYear.get(y).set(r[iId], r[iLab]);
        if (!sites.has(r[iId])) sites.set(r[iId], { id: r[iId], name: r[iName] || r[iId], lat: null, lng: null, district: null });   // not in the newest list of places: its old place is not assumed
      }
      const years = (view.seasons || [...byYear.keys()]).filter((y) => byYear.has(y)).sort((a, b) => a - b);
      return { years, sites, byYear, meta: { release: view.release, published: view.published, attribution: view.attribution, placesFrom: view.places_from_season, sha: (view.identity || {}).artifact_sha256 || '' } };
    })();
    bathingP.catch(() => { bathingP = null; });
    return bathingP;
  }

  /* ---------- the island picture ---------- */
  function island(o) {
    o = o || {};
    if (!window.ISLAND || !ISLAND.districts) return null;
    const svg = sv('svg', { viewBox: '0 0 ' + ISLAND.W + ' ' + ISLAND.H, class: 't3-island', role: 'img', 'aria-label': o.label || T('Map of Cyprus by district', 'Χάρτης της Κύπρου ανά επαρχία') });
    const defs = sv('defs', null,
      sv('pattern', { id: 't3-mixed', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, sv('rect', { width: 8, height: 8, fill: 'rgba(76,203,234,.30)' }), sv('rect', { width: 3, height: 8, fill: 'rgba(255,200,87,.75)' })));
    svg.append(defs);
    const paths = {};
    Object.keys(ISLAND.districts).forEach((id) => { paths[id] = sv('path', { d: ISLAND.districts[id], class: 't3-d', 'data-d': id }, sv('title', null, dName(id))); svg.append(paths[id]); });
    const layer = sv('g', null);
    svg.append(layer);
    return { svg, paths, layer, defs };
  }
  function schoolMarks(layer, pick) {
    (ISLAND.schools || []).forEach((s) => {
      const p = ISLAND.project(s.lng, s.lat);
      const g = sv('g', { class: 't3-school' + (pick === s.id ? ' on' : ''), 'data-school': s.id },
        sv('rect', { x: (p[0] - 7).toFixed(1), y: (p[1] - 7).toFixed(1), width: 14, height: 14, rx: 3, transform: 'rotate(45 ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')' }),
        sv('text', { x: (p[0] + 13).toFixed(1), y: (p[1] + 5).toFixed(1) }, cityName(s.id)),
        sv('title', null, T('School: ', 'Σχολείο: ') + s.name));
      layer.append(g);
    });
  }

  SC.tk3 = { n, isEl, CITY, cityName, DNAME, dName, km, districtOf, parseCsv, cell, toCsv, download, bathing, LABELS, LABEL_ORDER, labelName, labelColour, island, schoolMarks,
    still: () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) };
})();
