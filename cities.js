'use strict';
/* /cities/api/overview: what the site and the Build studio pages show.
 * Privacy by design: no vehicle positions and no raw GPS. Per school we return averages and counts, and routes only as
 * grid cells (about 1 km) built from points older than the public delay, with the count of visits per cell.
 * The delay and the grid are the same as for the public vehicle positions (PUBLIC_POS_DELAY_MIN, PUBLIC_POS_GRID, see privacy.js). */
const { createPrivacy } = require('./privacy');
const priv = createPrivacy();

const SCHOOLS = [
  { key: 'PASCAL Larnaka', id: 'larnaca', name: 'PASCAL English School Larnaca', el: 'PASCAL English School Λάρνακα', lat: 34.9217, lng: 33.6232 },
  { key: 'PASCAL Lefkosia', id: 'lefkosia', name: 'PASCAL English School Lefkosia', el: 'PASCAL English School Λευκωσία', lat: 35.1856, lng: 33.3823 },
  { key: 'PASCAL Limassol', id: 'limassol', name: 'PASCAL English School Limassol', el: 'PASCAL English School Λεμεσός', lat: 34.6841, lng: 33.0379 },
  { key: 'International School of Paphos', id: 'paphos', name: 'International School of Paphos', el: 'Διεθνές Σχολείο Πάφου', lat: 34.7754, lng: 32.4245 },
];

const avg = (a) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);

function cellsFrom(trails, now) {
  const m = new Map();
  for (const pts of Object.values(trails || {})) {
    let last = '';
    for (const p of pts || []) {
      if (!Array.isArray(p) || !isFinite(p[1]) || !isFinite(p[2]) || now - p[0] < priv.delayMs) continue;
      const la = priv.snap(p[1]), ln = priv.snap(p[2]);
      const k = la + ',' + ln;
      if (k === last) continue;
      last = k;
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
  return [...m.entries()].map(([k, c]) => { const [la, ln] = k.split(',').map(Number); return [la, ln, c]; });
}

async function overview({ devices, latest, trails }) {
  const now = Date.now();
  const devs = await devices(), lat = await latest();
  let tr = {};
  try { tr = (await trails(24)).trails || {}; } catch (e) { tr = {}; }
  const out = SCHOOLS.map((s) => {
    const mine = devs.filter((d) => d.group === s.key);
    const get = (mid) => avg(mine.map((d) => lat[d.eui] && lat[d.eui][mid] && lat[d.eui][mid].v).filter((v) => typeof v === 'number'));
    const own = {};
    mine.forEach((d) => { if (tr[d.eui]) own[d.eui] = tr[d.eui]; });
    return {
      id: s.id, name: s.name, el: s.el, lat: s.lat, lng: s.lng,
      sensors: mine.length, online: mine.filter((d) => d.online).length,
      temp: get('4097'), humidity: get('4098'), co2: get('4100'),
      cells: cellsFrom(own, now),
    };
  });
  return { updated: new Date().toISOString(), delayMinutes: priv.delayMin, cellKm: Math.max(1, Math.round(priv.grid * 111)), schools: out };
}

module.exports = { overview, SCHOOLS };
