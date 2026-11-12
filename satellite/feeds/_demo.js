'use strict';
/* satellite/feeds/_demo.js: a MADE-UP satellite feed for looking at the Data layers page without the network.
 * It is loaded only with SATELLITE_DEMO=1 (a file name that starts with "_" is a demo/test feed, see satellite/index.js) and its id is
 * "satellite-demo". It draws eight stylised SVG "pictures" of Cyprus (one per day, clouds in different places, one day mostly cloud) and
 * gives one made-up ground temperature per city. Nothing here is real data and every text says so. It never calls the network.
 *
 * Because it has no file in sources/, it brings its own source description (feed.source); layers.js adds it to the register.
 */
const fs = require('fs');
const path = require('path');

const BBOX = [32.2, 34.5, 34.7, 35.75];   // west, south, east, north
const W = 640, H = 392;
const X = (lon) => Math.round(((lon - BBOX[0]) / (BBOX[2] - BBOX[0])) * W * 10) / 10;
const Y = (lat) => Math.round(((BBOX[3] - lat) / (BBOX[3] - BBOX[1])) * H * 10) / 10;
// A rough, hand-made outline of the island. It is a drawing, not a map.
const ISLAND = [[32.27, 35.07], [32.42, 35.04], [32.55, 35.17], [32.8, 35.17], [32.93, 35.40], [33.3, 35.34], [33.8, 35.35], [34.1, 35.44], [34.45, 35.62], [34.58, 35.69], [34.6, 35.6], [34.3, 35.4], [34.05, 35.3], [33.95, 35.12], [34.08, 34.96], [33.63, 34.91], [33.6, 34.8], [33.33, 34.72], [33.03, 34.67], [32.92, 34.6], [32.85, 34.66], [32.55, 34.78], [32.42, 34.76], [32.27, 34.9]];

const DAYS = 8;
const CLOUD = [8, 22, 55, 15, 90, 30, 12, 40];   // percent of the picture that is cloud, newest first: one day is mostly cloud on purpose

const SOURCE = {
  schema: 'smartcities.source/1',
  id: 'satellite-demo',
  name: 'Satellite demo (made-up pictures)',
  summary: 'Made-up pictures and one made-up number, drawn by our own server, to try out how satellite layers look. Nothing here is real. It exists only when the server runs in demo mode.',
  layer: 'model',
  status: 'active',
  tagline: 'demo · made up',
  i18n: {
    el: {
      name: 'Δορυφορικό demo (φανταστικές εικόνες)',
      summary: 'Φανταστικές εικόνες και ένας φανταστικός αριθμός, φτιαγμένα από τον δικό μας διακομιστή, για να δούμε πώς φαίνονται τα δορυφορικά στρώματα. Τίποτα εδώ δεν είναι αληθινό. Υπάρχει μόνο σε λειτουργία demo.',
      tagline: 'demo · φανταστικό',
    },
  },
  themes: ['heat'],
  publisher: { name: 'Smart Cities Cyprus (demo)', url: 'https://example.org', kind: 'own' },
  licence: { id: 'CC0-1.0', attribution: 'Made-up demo pictures, not satellite data', commercial_use: true, share_alike: false, checked_on: '2026-11-12' },
  access: { type: 'manual', url: 'https://example.org', auth: { type: 'none' } },
  coverage: { area: 'Cyprus (drawing)', bbox: BBOX, resolution_m: 1000 },
  update: { every: 'P1D' },
  variables: [{ id: 'land_surface_temperature', unit: 'Cel', kind: 'measured' }],
  representativeness: { environment: 'outdoor', scale_m: 1000 },
  quality: {
    kind: 'satellite',
    uncertainty: 'Made up. A real satellite value would describe the ground over about one square kilometre, not the air and not one spot.',
    known_issues: ['Not real data', 'A real satellite picture shows clouds and has gaps between passes'],
    stale_after: 'P3D',
  },
  added: { by: 'smart-cities-team', on: '2026-11-12' },
};

// A small deterministic random generator, so the same day always draws the same picture.
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function svg(dayIndex, cloudPct, dateText) {
  const r = rng(7919 * (dayIndex + 3));
  const land = ISLAND.map(([lo, la]) => `${X(lo)},${Y(la)}`).join(' ');
  const clouds = [];
  const n = Math.round((cloudPct / 100) * 26);
  for (let i = 0; i < n; i++) {
    const cx = Math.round(r() * W), cy = Math.round(r() * H), rx = 30 + Math.round(r() * 70), ry = 14 + Math.round(r() * 34);
    clouds.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${(0.55 + r() * 0.35).toFixed(2)}" transform="rotate(${Math.round(r() * 40 - 20)} ${cx} ${cy})"/>`);
  }
  const lines = [];
  for (let lon = 33; lon < BBOX[2]; lon += 1) lines.push(`<line x1="${X(lon)}" y1="0" x2="${X(lon)}" y2="${H}"/>`);
  for (let lat = 35; lat < BBOX[3]; lat += 1) lines.push(`<line x1="0" y1="${Y(lat)}" x2="${W}" y2="${Y(lat)}"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Made-up satellite picture of Cyprus, ${dateText}">
<defs><linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d4a73"/><stop offset="1" stop-color="#1b7da8"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="6"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#sea)"/>
<g stroke="#ffffff" stroke-opacity="0.12" stroke-width="1">${lines.join('')}</g>
<polygon points="${land}" fill="#8a7d52" stroke="#c9bd8c" stroke-width="2" stroke-linejoin="round"/>
<polygon points="${land}" fill="#5f7a43" opacity="0.35" transform="translate(6 4)"/>
<g filter="url(#soft)">${clouds.join('')}</g>
<rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" opacity="0.55"/>
<text x="14" y="${H - 12}" font-family="sans-serif" font-size="15" fill="#fff">DEMO · made-up picture, not real satellite data · ${dateText}</text>
</svg>
`;
}

module.exports = function create(ctx) {
  let list = [];
  const pad = (n) => String(n).padStart(2, '0');

  function observation(dayIndex) {
    const t = new Date(ctx.now());
    const base = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 10, 30);
    return (base > ctx.now() ? base - 86400000 : base) - dayIndex * 86400000;
  }

  function draw() {
    const out = [];
    for (let i = 0; i < DAYS; i++) {
      const time = observation(i), d = new Date(time);
      const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
      const file = path.join(ctx.dir, `demo-${date}.svg`);
      const dateText = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      try { fs.writeFileSync(file, svg(i, CLOUD[i], dateText)); } catch (e) { ctx.log('could not write a demo picture'); continue; }
      out.push({
        id: `demo-${date}`, title: 'Made-up picture of Cyprus', titleEl: 'Φανταστική εικόνα της Κύπρου',
        text: 'A drawing of the island from above, made up to show how a satellite picture looks here. Sea is blue, land is brown, clouds are white.',
        textEl: 'Ένα σχέδιο του νησιού από ψηλά, φτιαγμένο για να δείξει πώς φαίνεται εδώ μια δορυφορική εικόνα. Η θάλασσα είναι μπλε, η στεριά καφέ, τα σύννεφα λευκά.',
        time, bbox: BBOX, file, contentType: 'image/svg+xml', cloud: CLOUD[i],
        attribution: 'Made-up demo picture, not satellite data', attributionEl: 'Φανταστική εικόνα demo, όχι δορυφορικά δεδομένα',
      });
    }
    list = out;
  }

  return {
    id: 'satellite-demo',
    hosts: ['example.org'],
    source: SOURCE,
    start() { try { draw(); } catch (e) { ctx.log('could not draw the demo pictures'); } },
    stop() {},
    probe() {
      if (!list.length) { try { draw(); } catch (e) { /* the note below says it */ } }
      const at = list.length ? list[0].time : null;
      return { ok: list.length > 0, n: list.length, at, note: list.length ? `${list.length} made-up pictures` : 'no demo pictures', noteEl: list.length ? `${list.length} φανταστικές εικόνες` : 'δεν υπάρχουν εικόνες demo' };
    },
    read(cityId) {
      const c = ctx.places[cityId];
      if (!c) return [];
      const base = 33 + ((c.lat * 13 + c.lng * 7) % 6);   // a made-up but steady number per city
      return [{
        variable: 'land_surface_temperature', value: Math.round(base * 10) / 10, unit: 'Cel', time: observation(0),
        where: 'a made-up 1 km pixel around the city centre', whereEl: 'ένα φανταστικό εικονοστοιχείο 1 χλμ γύρω από το κέντρο της πόλης',
        note: 'Made-up demo value. A real satellite gives the heat of the ground and roofs over about a square kilometre, not of the air, and only when the sky is clear.',
        noteEl: 'Φανταστική τιμή demo. Ένας αληθινός δορυφόρος δίνει τη θερμότητα του εδάφους και των στεγών σε περίπου ένα τετραγωνικό χιλιόμετρο, όχι του αέρα, και μόνο όταν ο ουρανός είναι καθαρός.',
      }];
    },
    images() { if (!list.length) { try { draw(); } catch (e) { /* nothing to show */ } } return list; },
  };
};
