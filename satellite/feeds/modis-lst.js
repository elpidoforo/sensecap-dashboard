'use strict';
/* satellite/feeds/modis-lst.js: land surface temperature (day and night) from NASA MODIS on Terra and Aqua.
 *
 *   id        modis-lst            descriptor: sources/modis-lst.json
 *   host      modis.ornl.gov       the ORNL DAAC "MODIS and VIIRS Land Product Subsets" web service, no key
 *   products  MYD11A2 (Aqua) and MOD11A2 (Terra): 8-day composites, 1 km pixels, collection 6.1
 *   variable  land_surface_temperature (Cel), the SAME id as every other source of ground temperature
 *
 * How a value is made (all of it from the LP DAAC file specification of MOD11A2, read 2026-11-12):
 *   LST_Day_1km / LST_Night_1km  uint16, valid 7500 to 65535, scale 0.02, kelvin. 0 is "no value" (no clear day in the 8 days).
 *   QC_Day / QC_Night            uint8 flags, decoded by lstQa() in ../lib/modis-ornl.js: a pixel is used when it was produced and
 *                                its error class is at most 3 K; pixels "not produced because of cloud" are never used.
 *   Day_view_time / Night_view_time  hours x 10 (fill 255): the local solar time the satellite really saw the pixel (orbit drift!)
 *   Clear_sky_days / Clear_sky_nights  8 bits, one per day of the period: how many days were clear
 *   value (Celsius) = DN x 0.02 - 273.15
 * Window: kmAboveBelow = kmLeftRight = 1 gives 3 x 3 pixels of 1 km, the city centre in the middle. The reading is the mean of the usable
 * pixels of the 3 x 3 block when at least 4 are usable (a 1 km pixel can sit half on the sea or on a roof); with fewer, it is the centre
 * pixel alone, or nothing. The centre pixel is always named in the note.
 * `time` of a reading is the middle of the 8-day period (the composite is an average over the clear days of that period).
 * Never air temperature: the text says so in every reading.
 */

const fs = require('fs');
const path = require('path');
const M = require('../lib/modis-ornl');

const PRODUCTS = [
  { product: 'MYD11A2', sat: 'Aqua', satEl: 'Aqua', days: 8 },
  { product: 'MOD11A2', sat: 'Terra', satEl: 'Terra', days: 8 },
];
const SCALE = 0.02, DN_MIN = 7500, DN_MAX = 65535, K0 = 273.15;
const MIN_BLOCK = 4;   // usable pixels (of 9) needed to quote the block mean
const VARIABLE = 'land_surface_temperature';

function vocabRange() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'vocab', 'variables.json'), 'utf8'))[VARIABLE];
    if (v && Array.isArray(v.range) && v.range.length === 2) return v.range;
  } catch (e) { /* the file is read only to stay in step with the vocabulary */ }
  return [-10, 80];
}

// One pixel: its raw value and QC byte -> { ok: true, c (Celsius), good } or { ok: false, why }.
function decodePixel(dn, qcByte, range) {
  const v = M.num(dn);
  if (v == null || v < DN_MIN) return { ok: false, why: 'fill' };          // 0 is the fill value; anything under the valid range is no value
  if (v > DN_MAX) return { ok: false, why: 'range' };
  const qa = M.lstQa(qcByte);
  if (!qa) return { ok: false, why: 'noqa' };
  if (!qa.usable) return { ok: false, why: qa.cloud ? 'cloud' : 'quality' };
  const c = v * SCALE - K0;
  if (!(c >= range[0] && c <= range[1])) return { ok: false, why: 'range' };
  return { ok: true, c, good: qa.good };
}
const popcount = (b) => { let n = 0; for (let x = b; x > 0; x >>= 1) n += x & 1; return n; };
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

function decodePart(lst, qc, vt, clear, grid, range, warn) {
  const win = M.windowOf(lst.data.length, grid.nrows, grid.ncols);
  if (!win) throw new Error(`the pixel grid has an unexpected shape (${lst.data.length} values, ${grid.nrows} x ${grid.ncols})`);
  if (lst.scale != null && Math.abs(lst.scale - SCALE) > 1e-9) warn.push(`the service reports scale ${lst.scale} for ${lst.band}; the documented ${SCALE} is used`);
  const used = [], rej = { fill: 0, cloud: 0, quality: 0, range: 0, noqa: 0 };
  let centre = null;
  for (const i of win.block) {
    const p = decodePixel(lst.data[i], qc ? qc.data[i] : null, range);
    if (p.ok) { used.push({ i, p }); if (i === win.centre) centre = p; } else rej[p.why]++;
  }
  const of = win.block.length;
  let value = null, basis = null;
  if (used.length >= MIN_BLOCK) { value = used.reduce((s, u) => s + u.p.c, 0) / used.length; basis = 'mean'; }
  else if (centre) { value = centre.c; basis = 'centre'; }
  const times = vt ? used.map((u) => M.num(vt.data[u.i])).filter((t) => t != null && t >= 0 && t <= 240).map((t) => t / 10) : [];
  const clears = clear ? used.map((u) => M.num(clear.data[u.i])).filter((c) => c != null && c >= 1 && c <= 255).map(popcount) : [];
  return {
    value: value == null ? null : round(value, 2), basis, n: used.length, of,
    centre: centre ? round(centre.c, 2) : null,
    min: used.length ? round(Math.min(...used.map((u) => u.p.c)), 2) : null, max: used.length ? round(Math.max(...used.map((u) => u.p.c)), 2) : null,
    timeH: times.length ? round(times.reduce((s, t) => s + t, 0) / times.length, 2) : null,
    clear: clears.length ? Math.round(clears.reduce((s, c) => s + c, 0) / clears.length) : null,
    good: used.length > 0 && used.every((u) => u.p.good), rej,
  };
}

// What we keep for one city and one composite: { day, night } (each a decodePart result or null).
function summarise(items, grid, range, log) {
  const by = {};
  for (const it of items) if (!by[it.key]) by[it.key] = it;
  const out = { day: null, night: null };
  const warn = [];
  for (const part of ['day', 'night']) {
    const lst = by[`lst${part}1km`];
    if (!lst) continue;
    out[part] = decodePart(lst, by[`qc${part}`], by[`${part}viewtime`], by[`clearsky${part}s`], grid, range, warn);
  }
  if (!out.day && !out.night) throw new Error(`no band named like LST_Day_1km or LST_Night_1km in the answer (bands seen: ${[...new Set(items.map((i) => i.band))].slice(0, 8).join(', ') || 'none'})`);
  for (const w of warn) log(w);
  return out;
}

/* ---------- words ---------- */

function noteFor(part, s, p, spec) {
  const day = part === 'day';
  const c = s.centre, t = M.hhmm(s.timeH);
  const en = [
    'Temperature of the surface (ground, roofs, roads) as the satellite sees it, NOT the air temperature.',
    s.basis === 'mean'
      ? `Average of ${s.n} clear pixels of a 3 x 3 block (about 2.8 km wide) around the city centre${c != null ? `; the centre pixel alone is ${M.fmtNum(c, 1)} °C` : ''}.`
      : 'One clear 1 km pixel at the city centre.',
    `${p.days}-day period ${M.periodText(p, false)}${s.clear != null ? `, ${s.clear} of ${p.days} ${day ? 'days' : 'nights'} clear` : ''}${t ? `, seen about ${t} solar time` : ''}.`,
    s.good ? 'Indicative; clouds leave gaps.' : 'Indicative; some pixels are flagged as lower quality and clouds leave gaps.',
  ];
  const el = [
    'Θερμοκρασία επιφάνειας (έδαφος, στέγες, δρόμοι) όπως τη βλέπει ο δορυφόρος, ΟΧΙ θερμοκρασία αέρα.',
    s.basis === 'mean'
      ? `Μέσος όρος ${s.n} καθαρών εικονοστοιχείων σε μπλοκ 3 x 3 (περίπου 2,8 km) γύρω από το κέντρο${c != null ? `· το κεντρικό μόνο ${M.fmtNum(c, 1, true)} °C` : ''}.`
      : 'Ένα καθαρό εικονοστοιχείο 1 km στο κέντρο της πόλης.',
    `Περίοδος ${p.days} ημερών ${M.periodText(p, true)}${s.clear != null ? `, ${s.clear} από ${p.days} ${day ? 'ημέρες καθαρές' : 'νύχτες καθαρές'}` : ''}${t ? `, γύρω στις ${t} ηλιακή ώρα` : ''}.`,
    s.good ? 'Ενδεικτικό· τα σύννεφα αφήνουν κενά.' : 'Ενδεικτικό· κάποια εικονοστοιχεία χαμηλότερης ποιότητας και τα σύννεφα αφήνουν κενά.',
  ];
  return { note: M.fit(en, 390), noteEl: M.fit(el, 390) };
}
const whereFor = (part, spec) => ({
  where: `ground and roof surface seen by the ${spec.sat} satellite (${spec.product}), ${part === 'day' ? 'daytime' : 'night-time'} pass, pixels around the city centre; not air temperature`,
  whereEl: `επιφάνεια εδάφους και στεγών όπως τη βλέπει ο δορυφόρος ${spec.satEl} (${spec.product}), πέρασμα ${part === 'day' ? 'ημέρας' : 'νύχτας'}, εικονοστοιχεία γύρω από το κέντρο της πόλης· όχι θερμοκρασία αέρα`,
});

module.exports = function create(ctx) {
  const range = vocabRange();
  const R = M.createRefresher(ctx, {
    products: PRODUCTS.map((p) => p.product), history: 3, km: 1,
    startDelayMs: 12000, everyMs: 12 * M.HOUR, gapMs: 1500,
    summarise: (product, items, grid) => summarise(items, grid, range, (m) => ctx.log(`${product}: ${m}`)),
  });

  // All the readings of one city: the day readings first (newest first), then the night readings. [ { reading, p, spec } ]
  function build(cityId) {
    const rows = [];
    for (const spec of PRODUCTS) {
      for (const part of ['day', 'night']) {
        const hit = R.entries(spec.product, cityId).find((e) => e.s && e.s[part] && e.s[part].value != null);
        if (!hit) continue;
        const s = hit.s[part], p = M.period(hit.ms, spec.days);
        rows.push({ part, p, spec, reading: { variable: VARIABLE, value: Math.round(s.value * 10) / 10, unit: 'Cel', time: p.midMs, ...whereFor(part, spec), ...noteFor(part, s, p, spec) } });
      }
    }
    rows.sort((a, b) => (a.part === b.part ? 0 : a.part === 'day' ? -1 : 1) || b.p.midMs - a.p.midMs);
    return rows;
  }

  function probe() {
    const ids = Object.keys(ctx.places).filter((k) => k[0] !== '_');
    let n = 0, at = null, newest = null;
    for (const id of ids) {
      const rows = build(id);
      if (!rows.length) continue;
      n++;
      for (const r of rows) if (at == null || r.reading.time > at) { at = r.reading.time; newest = r; }
    }
    const st = R.status();
    if (n) {
      const bad = !!st.lastError;   // cleared by the next fully good round
      return {
        ok: true, n, at,
        note: `${n} of ${ids.length} cities, newest ${newest.p.days}-day period ${M.periodText(newest.p, false)} (${newest.spec.sat})${bad ? '; the last refresh had a problem' : ''}`,
        noteEl: `${n} από ${ids.length} πόλεις, νεότερη περίοδος ${newest.p.days} ημερών ${M.periodText(newest.p, true)} (${newest.spec.satEl})${bad ? '· η τελευταία ανανέωση είχε πρόβλημα' : ''}`,
      };
    }
    if (!st.attempted) return { ok: false, n: 0, at: null, note: 'waiting for the first answer from the NASA ORNL DAAC service', noteEl: 'αναμονή για την πρώτη απάντηση από την υπηρεσία NASA ORNL DAAC' };
    if (st.lastError) return { ok: false, n: 0, at: null, note: `not available right now: ${st.lastError}`.slice(0, 160), noteEl: 'δεν είναι διαθέσιμο αυτή τη στιγμή· η υπηρεσία NASA ORNL DAAC δεν έδωσε χρήσιμη απάντηση' };
    return { ok: false, n: 0, at: null, note: 'the service answered, but no clear pixel was found yet', noteEl: 'η υπηρεσία απάντησε, αλλά δεν βρέθηκε ακόμη καθαρό εικονοστοιχείο' };
  }

  return {
    id: 'modis-lst', hosts: [M.HOST],
    start: () => R.start(), stop: () => R.stop(),
    refresh: () => R.refresh(),          // for tests and for a teacher who wants an immediate refresh
    probe,
    read: (cityId) => (ctx.places[cityId] ? build(cityId).map((r) => r.reading) : []),
  };
};
module.exports._t = { decodePixel, decodePart, summarise, noteFor, PRODUCTS, SCALE, DN_MIN, DN_MAX };
