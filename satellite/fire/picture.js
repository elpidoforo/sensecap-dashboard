'use strict';
/* satellite/fire/picture.js: the "fire hotspots over Cyprus" picture, drawn on the server as one self-contained SVG.
 * No map tiles, no network, no scripts, no fonts to load. The island outline comes from public/site/island.js (see geo.loadIsland);
 * when that file is not there, a plain frame is drawn instead.
 * Text in the picture is short and in English and Greek. Only numbers, our own words and the city names from vocab/places.json
 * reach the SVG, and all of it is escaped. Nothing that names a person or a property is ever drawn.
 */
const { RADII_KM } = require('./firms');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = (v) => Math.round(v * 10) / 10;

// "12 Nov, 14:35" in Cyprus time, English or Greek. Falls back to UTC when the time zone data is not there.
function cyprusTime(ms, el) {
  try {
    return new Intl.DateTimeFormat(el ? 'el-GR' : 'en-GB', { timeZone: 'Asia/Nicosia', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

const COL = { sea: '#0c2433', land: '#17405a', coast: '#5fb0cb', ring: '#8fe3f7', text: '#e8f6fb', sub: '#b6d8e4', hot: '#ff6a00', hotRim: '#fff1d6', old: '#ffb340', panel: 'rgba(8,24,35,.82)', warn: '#ffd9a8' };
const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const RECENT_MS = 6 * 3600 * 1000;

/* o = {
 *   island: from geo.loadIsland,  cities: [{ id, name:[en,el], lat, lng }],  hotspots: [{ lat, lng, t }],
 *   windowEnd: ms, fromFallback?: bool }
 * returns { svg, bbox:[w,s,e,n], drawn, outside, descEn, descEl } */
function renderHotspotsSvg(o) {
  const I = o.island;
  const W = I.W, H = I.H, P = I.project;
  const X0 = -30, X1 = W + 30, Y0 = -30, Y1 = H + 30;   // the map part of the picture (what the bbox describes)
  const FOOT = 176;                                     // the strip under the map: key, a note, the safety line
  const vbW = X1 - X0, vbH = Y1 - Y0 + FOOT;
  const [west, north] = I.unproject(X0, Y0), [east, south] = I.unproject(X1, Y1);
  const bbox = [Math.round(west * 1e3) / 1e3, Math.round(south * 1e3) / 1e3, Math.round(east * 1e3) / 1e3, Math.round(north * 1e3) / 1e3];
  const hs = (o.hotspots || []).slice().sort((a, b) => a.t - b.t);   // older first, so the newer sit on top
  let drawn = 0, outside = 0;
  const dots = [];
  for (const h of hs) {
    const [x, y] = P(h.lng, h.lat);
    if (!(x >= X0 && x <= X1 && y >= Y0 && y <= Y1)) { outside++; continue; }
    drawn++;
    const recent = o.windowEnd - h.t <= RECENT_MS;
    dots.push(recent
      ? `<circle cx="${r1(x)}" cy="${r1(y)}" r="13" fill="${COL.hot}" stroke="${COL.hotRim}" stroke-width="3"/>`
      : `<circle cx="${r1(x)}" cy="${r1(y)}" r="9" fill="none" stroke="${COL.old}" stroke-width="4"/>`);
  }
  // The outline file is cut into many small areas. Two passes draw the island as one shape: a wide coast-coloured pass underneath,
  // then the land colour on top, which hides every inner border and leaves only the coast line.
  const shape = Object.keys(I.districts).map((n) => `<path d="${I.districts[n]}"/>`).join('');
  const land = `<defs><g id="isl">${shape}</g></defs>`
    + `<use href="#isl" fill="${COL.coast}" stroke="${COL.coast}" stroke-width="3" stroke-linejoin="round"/>`
    + `<use href="#isl" fill="${COL.land}" stroke="${COL.land}" stroke-width="1.2" stroke-linejoin="round"/>`;
  const rings = [], labels = [];
  for (const c of o.cities || []) {
    const [x, y] = P(c.lng, c.lat);
    rings.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(RADII_KM.near * I.kmPx)}" fill="none" stroke="${COL.ring}" stroke-opacity=".55" stroke-width="1.6" stroke-dasharray="3 6"/>`);
    rings.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(RADII_KM.around * I.kmPx)}" fill="none" stroke="${COL.ring}" stroke-opacity=".32" stroke-width="1.6" stroke-dasharray="12 8"/>`);
    labels.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="6.5" fill="${COL.text}" stroke="${COL.sea}" stroke-width="3"/>`
      + `<text x="${r1(x + 13)}" y="${r1(y - 2)}" font-size="25" font-weight="600" fill="${COL.text}" stroke="${COL.sea}" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${esc(c.name[0])}</text>`
      + `<text x="${r1(x + 13)}" y="${r1(y + 21)}" font-size="21" fill="${COL.sub}" stroke="${COL.sea}" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${esc(c.name[1])}</text>`);
  }
  const n = drawn;
  const countEn = n === 0 ? 'No hotspots seen' : n === 1 ? '1 hotspot seen' : `${n} hotspots seen`;
  const countEl = n === 0 ? 'Καμία θερμή κηλίδα' : n === 1 ? '1 θερμή κηλίδα' : `${n} θερμές κηλίδες`;
  const when = o.windowEnd ? cyprusTime(o.windowEnd, false) : '';
  const whenEl = o.windowEnd ? cyprusTime(o.windowEnd, true) : '';
  const hx = X0 + 24, hy = Y0 + 6;   // the title panel (top left, over the open sea north-west of the island)
  const header = `<rect x="${hx - 18}" y="${hy}" width="560" height="176" rx="10" fill="${COL.panel}"/>`
    + `<text x="${hx}" y="${hy + 38}" font-size="31" font-weight="700" fill="${COL.text}">Fire hotspots seen from space</text>`
    + `<text x="${hx}" y="${hy + 70}" font-size="25" fill="${COL.sub}">Θερμές κηλίδες από δορυφόρο</text>`
    + `<text x="${hx}" y="${hy + 108}" font-size="25" font-weight="700" fill="${COL.text}">${esc(countEn)} · <tspan fill="${COL.sub}" font-weight="600">${esc(countEl)}</tspan></text>`
    + (when ? `<text x="${hx}" y="${hy + 138}" font-size="20" fill="${COL.text}">last 24 hours, to ${esc(when)} (Cyprus time)</text><text x="${hx}" y="${hy + 162}" font-size="17" fill="${COL.sub}">τελευταίες 24 ώρες, έως ${esc(whenEl)} (ώρα Κύπρου)</text>` : '');
  const ky = Y1 + 36;   // the key under the map
  const key = (i, sym, en, el) => {
    const x = X0 + 18 + i * 345;
    return sym(x + 14, ky - 6) + `<text x="${x + 42}" y="${ky}" font-size="21" fill="${COL.text}">${en}</text><text x="${x + 42}" y="${ky + 22}" font-size="18" fill="${COL.sub}">${el}</text>`;
  };
  const legend = key(0, (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="${COL.hot}" stroke="${COL.hotRim}" stroke-width="3"/>`, 'seen in the last 6 hours', 'τις τελευταίες 6 ώρες')
    + key(1, (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${COL.old}" stroke-width="4"/>`, 'seen 6 to 24 hours ago', 'πριν από 6 έως 24 ώρες')
    + key(2, (x, y) => `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="${COL.ring}" stroke-opacity=".8" stroke-width="1.8" stroke-dasharray="3 5"/>`, `rings: ${RADII_KM.near} km and ${RADII_KM.around} km`, `κύκλοι: ${RADII_KM.near} km και ${RADII_KM.around} km`);
  const note = outside > 0
    ? `<text x="${X0 + 18}" y="${Y1 + 86}" font-size="17" fill="${COL.sub}">${outside === 1 ? '1 more hotspot lies outside this picture' : outside + ' more hotspots lie outside this picture'} · ${outside === 1 ? '1 ακόμη θερμή κηλίδα είναι εκτός εικόνας' : outside + ' ακόμη θερμές κηλίδες είναι εκτός εικόνας'}</text>` : '';
  const fy = Y1 + 124;
  const foot = `<rect x="${X0}" y="${Y1}" width="${vbW}" height="${FOOT}" fill="#07151f"/>${legend}${note}`
    + `<line x1="${X0 + 18}" x2="${X1 - 18}" y1="${Y1 + 98}" y2="${Y1 + 98}" stroke="${COL.coast}" stroke-opacity=".35"/>`
    + `<text x="${X0 + 18}" y="${fy}" font-size="23" font-weight="700" fill="${COL.warn}">A hotspot is a heat spot, not a confirmed fire. If you see smoke or fire, call 112.</text>`
    + `<text x="${X0 + 18}" y="${fy + 30}" font-size="20" fill="${COL.sub}">Μια θερμή κηλίδα δεν είναι επιβεβαιωμένη φωτιά. Αν δεις καπνό ή φωτιά, πάρε στο 112.</text>`
    + (o.fromFallback ? `<text x="${X1 - 12}" y="${Y1 + FOOT - 8}" font-size="14" text-anchor="end" fill="${COL.sub}">island outline not available</text>` : '');
  const descEn = `${countEn} in the last 24 hours around Cyprus${when ? ' (to ' + when + ' Cyprus time)' : ''}. A hotspot is a heat spot a satellite saw, not a confirmed fire. If you see smoke or fire, call 112.`;
  const descEl = `${countEl} τις τελευταίες 24 ώρες γύρω από την Κύπρο${whenEl ? ' (έως ' + whenEl + ' ώρα Κύπρου)' : ''}. Μια θερμή κηλίδα είναι θερμό σημείο που είδε δορυφόρος, όχι επιβεβαιωμένη φωτιά. Αν δεις καπνό ή φωτιά, πάρε στο 112.`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${X0} ${Y0} ${vbW} ${vbH}" width="${vbW}" height="${vbH}" role="img" aria-labelledby="t d" font-family="${esc(FONT)}">`
    + `<title id="t">Fire hotspots seen from space over Cyprus · Θερμές κηλίδες φωτιάς από δορυφόρο πάνω από την Κύπρο</title>`
    + `<desc id="d">${esc(descEn)} ${esc(descEl)}</desc>`
    + `<rect x="${X0}" y="${Y0}" width="${vbW}" height="${vbH}" fill="${COL.sea}"/>`
    + `${land}<g>${rings.join('')}</g><g>${dots.join('')}</g><g>${labels.join('')}</g>${header}${foot}</svg>`;
  return { svg, bbox, drawn, outside, descEn, descEl };
}

module.exports = { renderHotspotsSvg, cyprusTime, esc };
