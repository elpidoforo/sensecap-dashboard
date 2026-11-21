/*
  Tile grid data (pure, tested by tests/viz/tilegrid_test.js). One tile per data sheet of /api/stack.
  Every status and age is computed here from the answers and the `now` that the page hands in; the drawing code computes nothing.

  build(catalogue, details, now) -> model
    catalogue : the answer of /api/stack ({ sheets:[{id,title,band,kind,live,...}] }) or just its sheets array
    details   : { [id]: answer of /api/stack/<id> | null | { error } }   (null / missing / error = the fetch failed)
    now       : Date, ms number or ISO string (an argument, so tests are deterministic)

  Status (never a score, never a ranking; tiles are only grouped by band):
    sheet with refreshSeconds > 0 and a time (updated, else retrieved, else generated):
      fresh       age <  1 interval
      ageing      1 interval <= age <= 3 intervals
      overdue     age >  3 intervals
    available false, or the fetch failed   -> unavailable (keeps the sheet's own reason)
    refreshSeconds null / absent (census, snapshot, catalogue, periodic without interval) -> fixed ('fixed by design'; never fresh, never stale)
    timed sheet without any usable time    -> unknown (says so; nothing is guessed)

  model = { id:'tilegrid', title:[en,el], note:[en,el], asOf (ISO), total, counts:{fresh,ageing,overdue,unavailable,fixed,unknown},
            empty:[en,el]|null, bands:[{k,n:[en,el],tiles:[tile]}], tiles:[tile], textRows:[[en,el]], ariaLabel:[en,el] }
  tile  = { id, title, band, kind, live, status, statusLabel:[en,el], glyph (circle|half|triangle|cross|square|dash), glyphChar,
            pulse (live and fresh), ageSeconds|null, ageText:[en,el]|null, intervalSeconds|null, line:[en,el] (the age line of the tile),
            reason:[en,el]|null, source:[en,el]|null, sourceUrl|null, licence|null, retrieved|null, period|null, honesty|null }
  Works as a browser script (window.SC.viz.tilegridData) and as a CommonJS module.
*/
(function (root) {
  'use strict';
  const BAND_ORDER = ['WATER', 'GROUND', 'CITY', 'AIR', 'SPACE'];
  const BAND_NAME = {
    WATER: ['Water', 'Νερό'], GROUND: ['Ground', 'Έδαφος'], CITY: ['City', 'Πόλη'], AIR: ['Air', 'Αέρας'], SPACE: ['Space', 'Διάστημα'],
    OTHER: ['Other', 'Άλλα'],
  };
  const STATUS = {
    fresh: { label: ['Fresh', 'Ενημερωμένο'], glyph: 'circle', ch: '●' },
    ageing: { label: ['Ageing', 'Παλαιώνει'], glyph: 'half', ch: '◐' },
    overdue: { label: ['Overdue', 'Καθυστερεί'], glyph: 'triangle', ch: '▲' },
    unavailable: { label: ['Unavailable', 'Μη διαθέσιμο'], glyph: 'cross', ch: '✕' },
    fixed: { label: ['Fixed by design', 'Σταθερό εκ σχεδιασμού'], glyph: 'square', ch: '■' },
    unknown: { label: ['No time recorded', 'Χωρίς καταγεγραμμένη ώρα'], glyph: 'dash', ch: '–' },
  };
  const ORDER = ['fresh', 'ageing', 'overdue', 'unavailable', 'fixed', 'unknown'];
  const NO_REASON = ['The answer of this sheet could not be fetched.', 'Η απάντηση αυτού του φύλλου δεν μπόρεσε να ληφθεί.'];
  const NO_SHEETS = ['No data sheets were listed, so there is nothing to show yet.', 'Δεν έχει καταχωριστεί κανένα φύλλο δεδομένων, οπότε δεν υπάρχει τίποτα να εμφανιστεί ακόμη.'];

  const isPair = (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string';
  const pair = (p, fb) => (isPair(p) ? [p[0], p[1]] : fb || null);
  const str = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  const toMs = (t) => {
    if (t == null || t === '') return null;
    const v = t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(String(t));
    return Number.isFinite(v) ? v : null;
  };

  // age as short bilingual text, whole units, rounded down
  function ageText(sec) {
    const s = Math.max(0, Math.floor(sec));
    if (s < 60) return [s + ' s ago', 'πριν ' + s + ' δευτ.'];
    if (s < 3600) { const m = Math.floor(s / 60); return [m + ' min ago', 'πριν ' + m + ' λ.']; }
    if (s < 86400) { const h = Math.floor(s / 3600); return [h + ' h ago', 'πριν ' + h + ' ώ.']; }
    const d = Math.floor(s / 86400); return [d + ' d ago', 'πριν ' + d + ' ημ.'];
  }
  function intervalText(sec) {
    if (sec < 120) return [sec + ' s', sec + ' δευτ.'];
    if (sec < 7200) { const m = Math.round(sec / 60); return [m + ' min', m + ' λ.']; }
    if (sec < 172800) { const h = Math.round(sec / 3600); return [h + ' h', h + ' ώ.']; }
    const d = Math.round(sec / 86400); return [d + ' d', d + ' ημ.'];
  }

  // The status of one sheet. Pure. det = the answer of /api/stack/<id> or null.
  function statusOf(det, nowMs) {
    if (!det || typeof det !== 'object' || det.error || det.available === false) {
      return { status: 'unavailable', ageSeconds: null, intervalSeconds: null, reason: pair(det && det.reason, NO_REASON) };
    }
    const iv = Number(det.refreshSeconds);
    if (!(iv > 0)) return { status: 'fixed', ageSeconds: null, intervalSeconds: null, reason: null };
    const t = toMs(det.updated) ?? toMs(det.retrieved) ?? toMs(det.generated);
    if (t == null) return { status: 'unknown', ageSeconds: null, intervalSeconds: iv, reason: null };
    const age = Math.max(0, (nowMs - t) / 1000);
    const status = age < iv ? 'fresh' : age <= 3 * iv ? 'ageing' : 'overdue';
    return { status, ageSeconds: age, intervalSeconds: iv, reason: null };
  }

  function tileOf(sheet, det, nowMs) {
    const st = statusOf(det, nowMs), meta = STATUS[st.status], d = det && typeof det === 'object' ? det : {};
    const period = str(d.period), retrieved = str(d.retrieved);
    const ageT = st.ageSeconds == null ? null : ageText(st.ageSeconds);
    let line;
    if (st.status === 'fixed') {
      line = retrieved ? ['Retrieved ' + retrieved, 'Λήψη ' + retrieved] : period ? ['Period ' + period, 'Περίοδος ' + period] : ['Vintage not recorded', 'Η χρονιά δεν έχει καταγραφεί'];
    } else if (st.status === 'unavailable') line = ['No answer', 'Καμία απάντηση'];
    else if (st.status === 'unknown') line = ['Age not known', 'Η ηλικία δεν είναι γνωστή'];
    else line = ageT;
    return {
      id: String(sheet.id), title: pair(sheet.title, [String(sheet.id), String(sheet.id)]), band: BAND_NAME[sheet.band] ? sheet.band : 'OTHER',
      kind: sheet.kind || null, live: sheet.live === true,
      status: st.status, statusLabel: meta.label.slice(), glyph: meta.glyph, glyphChar: meta.ch,
      pulse: sheet.live === true && st.status === 'fresh',
      ageSeconds: st.ageSeconds, ageText: ageT, intervalSeconds: st.intervalSeconds, line, reason: st.reason,
      source: pair(d.source), sourceUrl: str(d.sourceUrl), licence: str(d.licence), retrieved, period,
      honesty: pair(sheet.honesty),
    };
  }

  function textRow(t) {
    const src = t.source || ['source not given', 'η πηγή δεν δίνεται'];
    const how = t.status === 'unavailable' && t.reason ? [' (' + t.reason[0] + ')', ' (' + t.reason[1] + ')'] : ['', ''];
    const age = t.status === 'fixed' || t.status === 'unavailable' || t.status === 'unknown' ? t.line : t.ageText;
    return [
      t.title[0] + ': ' + t.statusLabel[0] + how[0] + ', ' + age[0] + '. Source: ' + src[0],
      t.title[1] + ': ' + t.statusLabel[1] + how[1] + ', ' + age[1] + '. Πηγή: ' + src[1],
    ];
  }

  function build(catalogue, details, now) {
    const nowMs = toMs(now);
    if (nowMs == null) throw new TypeError('tilegrid: now must be a Date, a number or an ISO string');
    const sheets = Array.isArray(catalogue) ? catalogue : catalogue && Array.isArray(catalogue.sheets) ? catalogue.sheets : [];
    const det = details || {};
    const tiles0 = sheets.filter((s) => s && s.id != null).map((s) => tileOf(s, det[s.id], nowMs));
    const keys = BAND_ORDER.concat(tiles0.some((t) => t.band === 'OTHER') ? ['OTHER'] : []);
    const bands = keys.map((k) => ({ k, n: BAND_NAME[k].slice(), tiles: tiles0.filter((t) => t.band === k) })).filter((b) => b.tiles.length);
    const tiles = [].concat(...bands.map((b) => b.tiles));
    const counts = {}; for (const k of ORDER) counts[k] = 0; for (const t of tiles) counts[t.status]++;
    const total = tiles.length;
    const parts = ORDER.filter((k) => counts[k]).map((k) => [counts[k] + ' ' + STATUS[k].label[0].toLowerCase(), counts[k] + ' ' + STATUS[k].label[1].toLowerCase()]);
    const ariaLabel = total
      ? ['Status of ' + total + ' data sheets, grouped by band: ' + parts.map((p) => p[0]).join(', ') + '. Fixed by design means the sheet has no refresh interval and is never called fresh or stale.',
         'Κατάσταση ' + total + ' φύλλων δεδομένων, ομαδοποιημένων ανά ζώνη: ' + parts.map((p) => p[1]).join(', ') + '. Σταθερό εκ σχεδιασμού σημαίνει ότι το φύλλο δεν έχει διάστημα ανανέωσης και δεν χαρακτηρίζεται ποτέ ενημερωμένο ή παλιό.']
      : NO_SHEETS.slice();
    return {
      id: 'tilegrid', title: ['Data sheets at a glance', 'Τα φύλλα δεδομένων με μια ματιά'],
      note: ['Each tile is one data sheet. The status says how old its answer is against its own refresh interval. Tiles are grouped by band, not ranked.',
             'Κάθε πλακίδιο είναι ένα φύλλο δεδομένων. Η κατάσταση δείχνει πόσο παλιά είναι η απάντησή του σε σχέση με το δικό του διάστημα ανανέωσης. Τα πλακίδια ομαδοποιούνται ανά ζώνη, δεν κατατάσσονται.'],
      asOf: new Date(nowMs).toISOString(), total, counts, empty: total ? null : NO_SHEETS.slice(),
      bands, tiles, textRows: tiles.map(textRow), ariaLabel,
    };
  }

  const api = { BAND_ORDER, BAND_NAME, STATUS, statusOf, ageText, build };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.tilegridData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
