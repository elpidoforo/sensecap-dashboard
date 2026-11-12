/*
  aqi.js - air-quality index maths and ONE shared PM2.5 colour/band scale for the whole site.
  Pure functions, no network, no DOM (except legend()/chip(), which only run in a browser). Works as CommonJS on the server
  (require('./aqi')) and as window.SC.aqi in the browser (public/site/aqi.js is a byte-identical copy: a test checks it).

  WHAT IS HERE
    1. US EPA AQI (index 0-500) for PM2.5 (the table in force since 6 May 2024), PM10, ozone 8-hour and NO2 1-hour.
       usIndex(pollutant, concentration)    pollutant: 'pm25' | 'pm10' (ug/m3, 24-hour mean), 'o3_8h' (ppm, 8-hour mean), 'no2_1h' (ppb, 1-hour)
    2. European Air Quality Index (EEA "EAQI", bands revised in 2024), six bands per pollutant, hourly ug/m3.
       eaqiLevel(pollutant, ugm3) -> 1..6     eaqi({ pm25, pm10, no2, o3, so2 }) -> the worst band
    3. One colour scale: Viridis (colour-blind safe, equal steps in lightness), the slice that stays readable on our navy panels.
       classify(value, { scale: 'eaqi' | 'us', pollutant: 'pm25', source: 'sensor' | 'model' | 'station' })
         -> { scale, pollutant, value, unit, level (1-6), id, name: { en, el }, index, indexKind, color, ink, indicative, caveat }
       bands(scale, pollutant) -> the six bands for a legend;  colorAt(value, ...) -> continuous colour;  rgbAt(), gradient()
       legend(opts), chip(result) -> DOM helpers for the pages (browser only; styles in /site/aqi.css)

  HONEST LABELS
    - The EAQI is defined for HOURLY concentrations. A reading from a low-cost sensor or from a model is "indicative":
      classify() sets indicative = true unless source is 'station'. Pages must show the caveat next to the legend.
    - The colours are this project's own. They are NOT the colours of the EEA or of the US EPA (the EPA asks that only its own six
      colours are used when the US AQI is shown in colour: see US_COLOR_NAMES). Do not call them "official".
    - The 0-100+ number that Open-Meteo calls european_aqi is Open-Meteo's own interpolation, the EEA publishes six classes only.
      eaqiIndex() and fromOpenMeteoIndex() follow Open-Meteo's documented band limits (20, 40, 60, 80, 100).
    - Greek band names are ours (the EEA's own Greek level names could not be checked): a teacher should read them.

  WHERE THE NUMBERS COME FROM (read on 2026-11-12; see SOURCES at the bottom for the status of each)
    US PM2.5 (2024 table): https://www.epa.gov/system/files/documents/2024-02/pm-naaqs-air-quality-index-fact-sheet.pdf and 40 CFR part 58 appendix G
      (https://www.law.cornell.edu/cfr/text/40/appendix-G_to_part_58); AQI 500 = 325.4 ug/m3 from the Federal Register notice of 6 March 2024
      (https://www.federalregister.gov/documents/2024/03/06/2024-02637/reconsideration-of-the-national-ambient-air-quality-standards-for-particulate-matter).
    EAQI bands: https://airindex.eea.europa.eu/AQI and ETC HE Report 2024/17, table 5.2 (both give the same table).
    ppb to ug/m3 (25 C, 1013 mb): https://uk-air.defra.gov.uk/reports/cat06/0502160851_Conversion_Factors_Between_ppb_and.pdf (WHO column).

  COLOUR DATA
    The 256 Viridis colours below are the table shipped in d3-scale-chromatic 3.1.1 (https://github.com/d3/d3-scale-chromatic, commit cce6eb39,
    src/sequential-multi/viridis.js). Viridis was designed by Eric Firing, Nathaniel J. Smith and Stefan van der Walt for matplotlib and is
    released as CC0 (matplotlib's colour-map header, as quoted in Octave's viridis.m). d3-scale-chromatic is ISC licensed:

      Copyright 2010-2026 Mike Bostock
      Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that
      the above copyright notice and this permission notice appear in all copies.
      THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES
      OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR
      ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
      ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { const SC = (root.SC = root.SC || {}); SC.aqi = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- colour: Viridis, the readable slice ---------- */
  const VIRIDIS = (
    '44015444025645045745055946075a46085c460a5d460b5e470d60470e61471063471164471365481467481668481769' +
    '48186a481a6c481b6d481c6e481d6f481f70482071482173482374482475482576482677482878482979472a7a472c7a' +
    '472d7b472e7c472f7d46307e46327e46337f463480453581453781453882443983443a83443b84433d84433e85423f85' +
    '4240864241864142874144874045884046883f47883f48893e49893e4a893e4c8a3d4d8a3d4e8a3c4f8a3c508b3b518b' +
    '3b528b3a538b3a548c39558c39568c38588c38598c375a8c375b8d365c8d365d8d355e8d355f8d34608d34618d33628d' +
    '33638d32648e32658e31668e31678e31688e30698e306a8e2f6b8e2f6c8e2e6d8e2e6e8e2e6f8e2d708e2d718e2c718e' +
    '2c728e2c738e2b748e2b758e2a768e2a778e2a788e29798e297a8e297b8e287c8e287d8e277e8e277f8e27808e26818e' +
    '26828e26828e25838e25848e25858e24868e24878e23888e23898e238a8d228b8d228c8d228d8d218e8d218f8d21908d' +
    '21918c20928c20928c20938c1f948c1f958b1f968b1f978b1f988b1f998a1f9a8a1e9b8a1e9c891e9d891f9e891f9f88' +
    '1fa0881fa1881fa1871fa28720a38620a48621a58521a68522a78522a88423a98324aa8325ab8225ac8226ad8127ad81' +
    '28ae8029af7f2ab07f2cb17e2db27d2eb37c2fb47c31b57b32b67a34b67935b77937b87838b9773aba763bbb753dbc74' +
    '3fbc7340bd7242be7144bf7046c06f48c16e4ac16d4cc26c4ec36b50c46a52c56954c56856c66758c7655ac8645cc863' +
    '5ec96260ca6063cb5f65cb5e67cc5c69cd5b6ccd5a6ece5870cf5773d05675d05477d1537ad1517cd2507fd34e81d34d' +
    '84d44b86d54989d5488bd6468ed64590d74393d74195d84098d83e9bd93c9dd93ba0da39a2da37a5db36a8db34aadc32' +
    'addc30b0dd2fb2dd2db5de2bb8de29bade28bddf26c0df25c2df23c5e021c8e020cae11fcde11dd0e11cd2e21bd5e21a' +
    'd8e219dae319dde318dfe318e2e418e5e419e7e419eae51aece51befe51cf1e51df4e61ef6e620f8e621fbe723fde725'
  );
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const h2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const TABLE = []; for (let i = 0; i < 256; i++) TABLE.push([0, 2, 4].map((k) => parseInt(VIRIDIS.slice(i * 6 + k, i * 6 + k + 2), 16)));
  function viridisRgb(t) {   // t 0..1, linear between the 256 table entries
    t = Math.max(0, Math.min(1, +t || 0));
    const p = t * 255, i = Math.min(254, Math.floor(p)), f = p - i, a = TABLE[i], b = TABLE[i + 1];
    return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f);
  }
  const toHex = (rgb) => '#' + rgb.map(h2).join('');
  const viridis = (t) => toHex(viridisRgb(t));
  // The full Viridis starts at a dark purple that cannot be seen on our navy panels. We start at 0.58, where the colour (#20a386) still
  // has 3:1 contrast against the lightest panel tone, and end at the bright yellow. A test checks this.
  const T0 = 0.58;
  const NAVY = '#0C1626', WHITE = '#FFFFFF';   // label colours on a filled band
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const luminance = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };   // WCAG 2.x relative luminance
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const inkFor = (color) => (contrast(color, NAVY) >= contrast(color, WHITE) ? NAVY : WHITE);
  const colorOfNode = (k) => viridis(T0 + (1 - T0) * (k / 5));   // band k (0-5) is the node k/5 of the slice

  /* ---------- names ---------- */
  const EAQI_NAMES = [
    { id: 'good', en: 'Good', el: 'Καλή' },
    { id: 'fair', en: 'Fair', el: 'Ικανοποιητική' },
    { id: 'moderate', en: 'Moderate', el: 'Μέτρια' },
    { id: 'poor', en: 'Poor', el: 'Κακή' },
    { id: 'very-poor', en: 'Very poor', el: 'Πολύ κακή' },
    { id: 'extremely-poor', en: 'Extremely poor', el: 'Εξαιρετικά κακή' },
  ];
  const US_NAMES = [
    { id: 'good', en: 'Good', el: 'Καλή' },
    { id: 'moderate', en: 'Moderate', el: 'Μέτρια' },
    { id: 'unhealthy-sensitive', en: 'Unhealthy for sensitive groups', el: 'Ανθυγιεινή για ευαίσθητες ομάδες' },
    { id: 'unhealthy', en: 'Unhealthy', el: 'Ανθυγιεινή' },
    { id: 'very-unhealthy', en: 'Very unhealthy', el: 'Πολύ ανθυγιεινή' },
    { id: 'hazardous', en: 'Hazardous', el: 'Επικίνδυνη' },
  ];
  // 40 CFR 58 appendix G table 1 names these colours (the exact RGB values were not checked): only for a page that shows the US AQI in colour.
  const US_COLOR_NAMES = ['Green', 'Yellow', 'Orange', 'Red', 'Purple', 'Maroon'];
  const NAMES = { eaqi: EAQI_NAMES, us: US_NAMES };

  /* ---------- 1. US EPA AQI ---------- */
  // rows: [concentration low, concentration high, index low, index high]; dec = decimals the concentration is TRUNCATED to before the lookup
  const US = {
    pm25: { unit: 'µg/m³', dec: 1, rows: [[0.0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]] },
    pm10: { unit: 'µg/m³', dec: 0, rows: [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 504, 301, 400], [505, 604, 401, 500]] },
    o3_8h: { unit: 'ppm', dec: 3, rows: [[0.000, 0.054, 0, 50], [0.055, 0.070, 51, 100], [0.071, 0.085, 101, 150], [0.086, 0.105, 151, 200], [0.106, 0.200, 201, 300]] },   // the 8-hour table stops at 300
    no2_1h: { unit: 'ppb', dec: 0, rows: [[0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150], [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 1649, 301, 400], [1650, 2049, 401, 500]] },
  };
  const PPB_TO_UGM3 = { o3: 1.96, no2: 1.88 };   // 25 C, 1013 mb (WHO column of the Defra table)
  const trunc = (v, d) => { const m = Math.pow(10, d); return Math.floor(v * m + 1e-7) / m; };
  const okNum = (v) => typeof v === 'number' && isFinite(v) && v >= 0;
  // The EPA equation: I = (IHi - ILo) / (BPHi - BPLo) * (C - BPLo) + ILo, C truncated, I rounded to the nearest whole number.
  // Above the last row the answer stays at the last row's top (500, or 300 for 8-hour ozone) and capped is true.
  function usIndex(pollutant, concentration) {
    const t = US[pollutant];
    if (!t || !okNum(concentration)) return null;
    const c = trunc(concentration, t.dec), last = t.rows[t.rows.length - 1];
    if (c > last[1]) return { index: last[3], capped: true, truncated: c };
    const r = t.rows.find((x) => c >= x[0] && c <= x[1]) || t.rows.find((x) => c <= x[1]);
    const idx = (r[3] - r[2]) / (r[1] - r[0]) * (c - r[0]) + r[2];
    return { index: Math.round(idx), capped: false, truncated: c };
  }
  const usLevel = (index) => (index <= 50 ? 1 : index <= 100 ? 2 : index <= 150 ? 3 : index <= 200 ? 4 : index <= 300 ? 5 : 6);

  /* ---------- 2. European Air Quality Index ---------- */
  // Upper edge of bands 1-5 (inclusive), ug/m3 per hour. Band 6 is everything above the last number. The EEA writes whole numbers
  // (0-5, 6-15, ...); for a reading with decimals we read the edge as "up to": 5.0 is Good, 5.1 is Fair (the cautious reading).
  const EAQI_BP = { pm25: [5, 15, 50, 90, 140], pm10: [15, 45, 120, 195, 270], no2: [10, 25, 60, 100, 150], o3: [60, 100, 120, 160, 180], so2: [20, 40, 125, 190, 275] };
  // The top band has no upper limit; for the colour and the 0-100+ index it is given the width of the band below it.
  const capOf = (bp) => bp[4] + (bp[4] - bp[3]);
  const edgesOf = (bp) => [0].concat(bp, capOf(bp));
  function eaqiLevel(pollutant, ugm3) {
    const bp = EAQI_BP[pollutant];
    if (!bp || !okNum(ugm3)) return null;
    const k = bp.findIndex((e) => ugm3 <= e);
    return k < 0 ? 6 : k + 1;
  }
  // position on the six equal steps: 0 to 6 (band k is k to k+1), straight line inside a band
  function eaqiPosition(pollutant, ugm3) {
    const bp = EAQI_BP[pollutant];
    if (!bp || !okNum(ugm3)) return null;
    const e = edgesOf(bp), k = eaqiLevel(pollutant, ugm3) - 1;
    return Math.min(6, k + (ugm3 - e[k]) / (e[k + 1] - e[k]));
  }
  // Open-Meteo style number: 20 per band, so Good 0-20, Fair 20-40 ... Extremely poor above 100 (their documented limits).
  const eaqiIndex = (pollutant, ugm3) => { const s = eaqiPosition(pollutant, ugm3); return s == null ? null : Math.round(s * 20); };
  function fromOpenMeteoIndex(n) {   // the european_aqi number of the Open-Meteo air-quality API -> a result like classify()
    if (typeof n !== 'number' || !isFinite(n) || n < 0) return null;
    const level = n <= 20 ? 1 : n <= 40 ? 2 : n <= 60 ? 3 : n <= 80 ? 4 : n <= 100 ? 5 : 6;
    return build('eaqi', 'all', n, level, Math.round(n), 'open-meteo', 'model');
  }
  // every pollutant you have, the worst band wins (this is how the EAQI works)
  function eaqi(values, o) {
    const parts = {}; let level = 0, worst = [];
    Object.keys(EAQI_BP).forEach((p) => {
      const l = values && eaqiLevel(p, values[p]);
      if (!l) return;
      parts[p] = l;
      if (l > level) { level = l; worst = [p]; } else if (l === level) worst.push(p);
    });
    if (!level) return null;
    const idx = Math.max(...Object.keys(parts).map((p) => eaqiIndex(p, values[p])));
    const r = build('eaqi', 'all', null, level, idx, 'open-meteo', (o && o.source) || 'sensor');
    r.parts = parts; r.worst = worst;
    return r;
  }

  /* ---------- 3. bands, classify, colours ---------- */
  const CAVEAT = {
    en: 'Indicative: the bands are for hourly values, and single readings from low-cost sensors or models can be off.',
    el: 'Ενδεικτικό: οι ζώνες ισχύουν για ωριαίες τιμές και μεμονωμένες μετρήσεις από αισθητήρες χαμηλού κόστους ή μοντέλα μπορεί να αποκλίνουν.',
  };
  function unitOf(scale, pollutant) { return scale === 'us' && US[pollutant] ? US[pollutant].unit : 'µg/m³'; }
  const BAND_CACHE = {};
  function bands(scale, pollutant) {
    scale = scale === 'us' ? 'us' : 'eaqi'; pollutant = pollutant || 'pm25';
    const key = scale + ':' + pollutant;
    if (BAND_CACHE[key]) return BAND_CACHE[key];
    let up;   // upper edge of each band (the last one is Infinity)
    if (scale === 'eaqi') { const bp = EAQI_BP[pollutant]; if (!bp) return null; up = bp.concat(Infinity); }
    else {
      const t = US[pollutant]; if (!t) return null;
      up = [50, 100, 150, 200, 300, 500].map((m, k) => { if (k === 5) return Infinity; const rows = t.rows.filter((r) => r[3] <= m); return rows[rows.length - 1][1]; });
    }
    const out = up.map((hi, k) => {
      const color = colorOfNode(k);
      return { scale, pollutant, level: k + 1, id: NAMES[scale][k].id, en: NAMES[scale][k].en, el: NAMES[scale][k].el, lo: k ? up[k - 1] : 0, hi, color, ink: inkFor(color), unit: unitOf(scale, pollutant) };
    });
    BAND_CACHE[key] = out;
    return out;
  }
  function build(scale, pollutant, value, level, index, indexKind, source) {
    const b = NAMES[scale][level - 1], color = colorOfNode(level - 1), indicative = source !== 'station';
    return { scale, pollutant, value, unit: unitOf(scale, pollutant), level, id: b.id, name: { en: b.en, el: b.el }, index, indexKind, color, ink: inkFor(color), source, indicative, caveat: indicative ? CAVEAT : null };
  }
  // value -> { index, level, id, name: {en, el}, color, ink, indicative ... }, or null when there is no usable number
  function classify(value, o) {
    o = o || {}; const scale = o.scale === 'us' ? 'us' : 'eaqi', pollutant = o.pollutant || 'pm25', source = o.source || 'sensor';
    if (!okNum(value)) return null;
    if (scale === 'eaqi') {
      const l = eaqiLevel(pollutant, value);
      return l ? build('eaqi', pollutant, value, l, eaqiIndex(pollutant, value), 'open-meteo', source) : null;
    }
    // US: pm25 and pm10 in ug/m3 (24-hour mean); o3 (8-hour mean) and no2 (1-hour) given in ug/m3 are converted to ppm / ppb first
    const conv = { pm25: ['pm25', 1], pm10: ['pm10', 1], o3: ['o3_8h', 1 / PPB_TO_UGM3.o3 / 1000], no2: ['no2_1h', 1 / PPB_TO_UGM3.no2] }[pollutant];
    if (!conv) return null;
    const r = usIndex(conv[0], value * conv[1]);
    return r ? Object.assign(build('us', pollutant, value, usLevel(r.index), r.index, 'epa', source), { capped: r.capped }) : null;
  }

  // continuous colour: straight line between the band colours, anchored at the middle of each band, so colorAt(middle of band k) is the colour of band k
  function nodesOf(scale, pollutant) {
    const b = bands(scale, pollutant);
    if (!b) return null;
    const edges = b.map((x) => x.lo).concat(scale === 'eaqi' ? capOf(EAQI_BP[pollutant]) : US[pollutant].rows[US[pollutant].rows.length - 1][1]);
    return b.map((x, k) => (edges[k] + edges[k + 1]) / 2);
  }
  function rgbAt(value, scale, pollutant) {
    scale = scale === 'us' ? 'us' : 'eaqi'; pollutant = pollutant || 'pm25';
    const m = nodesOf(scale, pollutant);
    if (!m || !okNum(value)) return null;
    let g;
    if (value <= m[0]) g = 0; else if (value >= m[5]) g = 1;
    else { let k = 0; while (value > m[k + 1]) k++; g = (k + (value - m[k]) / (m[k + 1] - m[k])) / 5; }
    return viridisRgb(T0 + (1 - T0) * g);
  }
  const colorAt = (value, scale, pollutant) => { const r = rgbAt(value, scale, pollutant); return r ? toHex(r) : null; };
  // CSS gradient across a range of values (for a legend bar)
  function gradient(lo, hi, scale, pollutant, steps) {
    steps = steps || 12; const s = [];
    for (let i = 0; i <= steps; i++) s.push(colorAt(lo + (hi - lo) * i / steps, scale, pollutant) + ' ' + Math.round(i / steps * 100) + '%');
    return 'linear-gradient(90deg,' + s.join(',') + ')';
  }
  function pageSC() { return typeof window !== 'undefined' ? window.SC : null; }
  const lang = () => (pageSC() && pageSC().lang === 'el' ? 'el' : 'en');
  const nameOf = (x, l) => ((l || lang()) === 'el' ? (x.name ? x.name.el : x.el) : (x.name ? x.name.en : x.en));
  // "≤5", "≤15", ... ">140"
  const rangeOf = (b) => (b.hi === Infinity ? '>' + b.lo : '≤' + b.hi);

  /* ---------- browser helpers (the same markup on every page) ---------- */
  // <ul class="aqi-legend"> with the six bands, then the caveat. opts: { scale, pollutant, level (highlight), note (default true) }
  function legend(opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    const SC = pageSC(); if (SC && SC.css) SC.css('/site/aqi.css');
    const l = lang(), box = document.createElement('div'), ul = document.createElement('ul');
    box.className = 'aqi-legend-box'; ul.className = 'aqi-legend';
    ul.setAttribute('aria-label', l === 'el' ? 'Ζώνες δείκτη ποιότητας αέρα' : 'Air quality bands');
    bands(opts.scale, opts.pollutant).forEach((b) => {
      const li = document.createElement('li'), sw = document.createElement('i'), nm = document.createElement('span'), em = document.createElement('em');
      sw.style.background = b.color; sw.setAttribute('aria-hidden', 'true');
      nm.textContent = nameOf(b, l); em.textContent = rangeOf(b) + (b.level === 1 ? ' µg/m³' : '');
      if (opts.level === b.level) li.className = 'on';
      li.append(sw, nm, em); ul.append(li);
    });
    box.append(ul);
    if (opts.note !== false) {
      const p = document.createElement('p'); p.className = 'aqi-note';
      p.textContent = l === 'el'
        ? 'Ζώνες του Ευρωπαϊκού Δείκτη Ποιότητας Αέρα για PM2.5 (ωριαίες τιμές), με χρώματα δικά μας. Οι τιμές από αισθητήρες και μοντέλα είναι ενδεικτικές.'
        : 'Bands of the European Air Quality Index for PM2.5 (hourly values), in our own colours. Values from sensors and models are indicative.';
      box.append(p);
    }
    return box;
  }
  // a small filled label with the band name: <span class="nm-badge aqi-chip">Fair</span>; extra (optional) text such as a number is appended
  function chip(result, extra) {
    if (typeof document === 'undefined' || !result) return null;
    const s = document.createElement('span');
    s.className = 'nm-badge aqi-chip'; s.style.background = result.color; s.style.color = result.ink;
    s.textContent = nameOf(result) + (extra ? ' ' + extra : '');
    return s;
  }

  /* ---------- where each number stands (for the README and the tests) ---------- */
  const SOURCES = {
    usPm25: { status: 'verified', note: 'EPA fact sheet (Feb 2024) and 40 CFR 58 App. G table 2; AQI 500 at 325.4 from the Federal Register notice of 6 March 2024.' },
    usPm10: { status: 'verified up to 424; 425-504 and 505-604 from an older copy', note: 'The current copy of App. G shows 425+ for this row; values up to 424 are identical in the old and new copies.' },
    usO3_8h: { status: 'verified', note: 'ppm, 8-hour mean, App. G table 2. The 8-hour table does not define values above 300.' },
    usNo2_1h: { status: 'verified up to 1249; 1250-1649 and 1650-2049 from an older copy', note: 'ppb, 1-hour mean.' },
    usTruncation: { status: 'verified', note: 'App. G: PM2.5 truncated to 1 decimal, PM10 to a whole number, ozone to 3 decimals, NO2 to a whole number; index rounded to the nearest whole number.' },
    eaqiBands: { status: 'verified', note: 'airindex.eea.europa.eu/AQI and ETC HE Report 2024/17 table 5.2 agree. Upper edge inclusive is our reading (the EEA lists whole numbers).' },
    eaqiIndexNumber: { status: 'our reading of Open-Meteo', note: 'Open-Meteo documents 0-20 Good ... above 100 Extremely poor and says values are interpolated between thresholds; its exact formula was not seen.' },
    ppbToUgm3: { status: 'verified', note: 'WHO column of the Defra table: 25 C, 1013 mb, O3 1.96 and NO2 1.88 ug/m3 per ppb.' },
    greekNames: { status: 'unverified', note: 'Ours. The EEA page that names the index in Greek does not name the six levels.' },
    colours: { status: 'ours', note: 'Viridis slice 0.58-1.0 (CC0 colour map, ISC table from d3-scale-chromatic). Not the EEA or EPA colours.' },
    notDone: { status: 'not implemented', note: 'NowCast and 24-hour averaging (the US AQI needs a 24-hour mean for PM), SO2 and CO for the US AQI, 1-hour ozone.' },
  };

  return {
    VERSION: 1, T0, SOURCES, EAQI_BP, US_TABLES: US, PPB_TO_UGM3, US_COLOR_NAMES, CAVEAT,
    usIndex, usLevel, eaqiLevel, eaqiPosition, eaqiIndex, eaqi, fromOpenMeteoIndex,
    bands, classify, colorAt, rgbAt, gradient, viridis, viridisRgb, colorOfNode, nameOf, rangeOf,
    luminance, contrast, inkFor, legend, chip, NAVY, WHITE,
  };
});
