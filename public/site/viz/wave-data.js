/*
  Wave data (pure, tested by tests/viz/wave_test.js). Builds the model of the mirrored year-on-year chart from the answer of
  /api/stack/permits. Every number on screen is computed here, never in the drawing code.

  What is mirrored: for each month, (permits that month) minus (permits in the same month one year earlier). Above the centre
  line = more permits than a year before, below = fewer. It says nothing about why. A month with no value, a value CYSTAT marks
  N.A. (null), or no earlier-year month is a GAP (change = null), never 0. A real 0 is an observation.

  Which series: the answer carries one series per district (permitsByMonth) and the published reporting total only for the
  latest month. A total holds its parts, so districts are never added up here. If an answer ever carries a monthly series of the
  whole total as `reportingTotalByMonth` (array aligned with `months`) it is used; otherwise ONE district is shown (opts.district,
  a code from model.choices; default the first) and its name is in the title.

  model = { id, n, unit, note, scope:'total'|'district', series:{code,name}, choices:[{code,name}], months:[..], points:[{m, label:[en,el],
            v, prev, prevM, change, gap, reason}], band:{from,to,text,url,span}|null, turns:[{i,kind}], stats, legend, empty,
            textRows:[[en,el]], aria:[en,el], asOf, source:[en,el], sourceUrl }
  Browser: window.SC.viz.waveData; Node: module.exports.
*/
(function (root) {
  'use strict';
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'];
  const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
  const WINDOW = 6; // a turning point is the highest or lowest change within this many months each side

  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const monthLabel = (m) => { const r = MONTH_RE.exec(String(m)); return r ? [MON_EN[+r[2] - 1] + ' ' + r[1], MON_EL[+r[2] - 1] + ' ' + r[1]] : [String(m), String(m)]; };
  const sgn = (n) => (n > 0 ? '+' + n : String(n));
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const monthBefore = (m, k) => { const r = MONTH_RE.exec(m); return r ? (+r[1] - k) + '-' + r[2] : null; };

  // ---- year-on-year ------------------------------------------------------------------------------------------------
  // months: 'YYYY-MM' strings; values: number | null | 'N.A.' (anything not a finite number is missing).
  // The same month a year earlier is found by its label, so a month that is absent from the list is a gap, never a guess.
  function yoy(months, values) {
    const at = new Map(); months.forEach((m, i) => at.set(m, i));
    return months.map((m, i) => {
      const v = isNum(values[i]) ? values[i] : null;
      const pm = monthBefore(m, 1), pi = at.has(pm) ? at.get(pm) : -1;
      const prev = pi >= 0 && isNum(values[pi]) ? values[pi] : null;
      let reason = null;
      if (v === null) reason = 'value';
      else if (pi < 0) reason = 'noearlier';
      else if (prev === null) reason = 'earlier';
      const gap = reason !== null;
      return { m, label: monthLabel(m), v, prev, prevM: pm, change: gap ? null : v - prev, gap, reason };
    });
  }

  // ---- numbers -----------------------------------------------------------------------------------------------------
  function stats(points) {
    let up = 0, down = 0, flat = 0, gaps = 0, rise = null, fall = null;
    for (const p of points) {
      if (p.gap) { gaps++; continue; }
      if (p.change > 0) { up++; if (!rise || p.change > rise.change) rise = p; }
      else if (p.change < 0) { down++; if (!fall || p.change < fall.change) fall = p; }
      else flat++;
    }
    const pick = (p) => (p ? { m: p.m, label: p.label, change: p.change, v: p.v, prev: p.prev } : null);
    return { months: points.length, comparable: up + down + flat, up, down, flat, gaps, maxRise: pick(rise), maxFall: pick(fall) };
  }

  // turning points: strict local extremes of the change within WINDOW months each side, gaps skipped
  function turns(points) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i]; if (p.gap) continue;
      let hi = true, lo = true, seen = 0;
      for (let j = Math.max(0, i - WINDOW); j <= Math.min(points.length - 1, i + WINDOW); j++) {
        if (j === i || points[j].gap) continue;
        seen++;
        if (points[j].change >= p.change) hi = false;
        if (points[j].change <= p.change) lo = false;
      }
      if (seen < WINDOW) continue; // not enough neighbours to call it a turn
      if (hi && p.change > 0) out.push({ i, kind: 'peak' });
      else if (lo && p.change < 0) out.push({ i, kind: 'trough' });
    }
    return out;
  }

  // the answer's annotation as a band. Its text comes from the answer. A year-on-year change is affected for the 12 months from
  // the annotated one (their year-earlier month lies before it), so the band spans those, cut at the last month.
  function band(annotation, months) {
    if (!annotation || !MONTH_RE.test(String(annotation.month))) return null;
    const from = months.indexOf(annotation.month); if (from < 0) return null;
    const text = Array.isArray(annotation.text) ? annotation.text : [String(annotation.text || ''), String(annotation.text || '')];
    return { month: annotation.month, label: monthLabel(annotation.month), from, to: Math.min(from + 11, months.length - 1), span: [
      'Shaded: months whose year-earlier month lies before this date.', 'Σκιασμένα: μήνες που ο ίδιος μήνας της προηγούμενης χρονιάς είναι πριν από αυτή την ημερομηνία.'], text, url: annotation.url || null };
  }

  // ---- strings -----------------------------------------------------------------------------------------------------
  function rowOf(p, unit) {
    if (p.gap) {
      const why = { value: ['no figure published (N.A.)', 'δεν δημοσιεύτηκε τιμή (N.A.)'], noearlier: ['no same month a year earlier in the series', 'δεν υπάρχει ο ίδιος μήνας της προηγούμενης χρονιάς στη σειρά'],
        earlier: ['the same month a year earlier has no figure (N.A.)', 'ο ίδιος μήνας της προηγούμενης χρονιάς δεν έχει τιμή (N.A.)'] }[p.reason];
      return [p.label[0] + ': gap, ' + why[0] + '.', p.label[1] + ': κενό, ' + why[1] + '.'];
    }
    const dir = p.change > 0 ? ['more', 'περισσότερες'] : p.change < 0 ? ['fewer', 'λιγότερες'] : ['the same number', 'ίδιες'];
    return [p.label[0] + ': ' + p.v + ' ' + unit[0] + ', ' + p.prev + ' in ' + monthLabel(p.prevM)[0] + ', change ' + sgn(p.change) + (p.change === 0 ? '' : ' (' + dir[0] + ')') + '.',
      p.label[1] + ': ' + p.v + ' ' + unit[1] + ', ' + p.prev + ' τον ' + monthLabel(p.prevM)[1] + ', μεταβολή ' + sgn(p.change) + (p.change === 0 ? '' : ' (' + dir[1] + ')') + '.'];
  }

  const EMPTY = ['No monthly permit figures are available to draw.', 'Δεν υπάρχουν μηνιαίες τιμές αδειών για να σχεδιαστούν.'];
  const EMPTY_NOYOY = ['Fewer than 13 months of figures: no month has a year-earlier month to compare with.', 'Λιγότεροι από 13 μήνες τιμών: κανένας μήνας δεν έχει ίδιο μήνα προηγούμενης χρονιάς για σύγκριση.'];

  // ---- model -------------------------------------------------------------------------------------------------------
  function build(answer, opts) {
    opts = opts || {};
    const a = answer || {}, months = Array.isArray(a.months) ? a.months.map(String) : [];
    const unit = ['permits', 'άδειες'];
    const choices = (Array.isArray(a.permitsByMonth) ? a.permitsByMonth : []).filter((s) => s && Array.isArray(s.values)).map((s) => ({ code: String(s.code), name: Array.isArray(s.name) ? s.name : [String(s.name), String(s.name)] }));
    let values = null, scope = 'district', series = null;
    if (Array.isArray(a.reportingTotalByMonth) && a.reportingTotalByMonth.length === months.length && opts.district == null) {
      values = a.reportingTotalByMonth; scope = 'total'; series = { code: 'total', name: ['All of Cyprus, as published', 'Όλη η Κύπρος, όπως δημοσιεύεται'] };
    } else if (choices.length) {
      const s = a.permitsByMonth.find((x) => String(x.code) === String(opts.district)) || a.permitsByMonth.find((x) => x && Array.isArray(x.values));
      if (s.values.length === months.length) { values = s.values; series = choices.find((c) => c.code === String(s.code)); }
    }
    const note = ['Each bar is a month compared with the same month a year earlier. Up means more permits than a year before, down means fewer. It does not say why.',
      'Κάθε μήνας συγκρίνεται με τον ίδιο μήνα ένα χρόνο νωρίτερα. Πάνω σημαίνει περισσότερες άδειες από ένα χρόνο πριν, κάτω λιγότερες. Δεν λέει γιατί.'];
    const base = { id: 'wave', n: ['Building permits: change on a year earlier', 'Άδειες οικοδομής: μεταβολή σε σχέση με ένα χρόνο πριν'], unit, note, scope, series, choices, months,
      asOf: a.period || (months.length ? months[months.length - 1] : null), source: a.source || null, sourceUrl: a.sourceUrl || null,
      legend: { up: ['▲ More permits than a year before', '▲ Περισσότερες άδειες από ένα χρόνο πριν'], down: ['▼ Fewer permits than a year before', '▼ Λιγότερες άδειες από ένα χρόνο πριν'], gap: ['Gap: no comparison possible', 'Κενό: δεν γίνεται σύγκριση'] } };
    const empty = (msg) => Object.assign(base, { points: [], band: null, turns: [], stats: stats([]), panel: [], empty: msg, textRows: [msg], aria: msg });
    if (!values || !months.length || !months.every((m) => MONTH_RE.test(m))) return empty(EMPTY);
    const points = yoy(months, values), st = stats(points);
    if (st.comparable === 0) return empty(EMPTY_NOYOY);
    const bd = band(a.annotation, months), tn = turns(points);
    const textRows = points.slice(-24).map((p) => rowOf(p, unit));
    const who = scope === 'total' ? ['all of Cyprus', 'όλη η Κύπρος'] : [series.name[0], series.name[1]];
    const first = months[0], last = months[months.length - 1], f = monthLabel(first), l = monthLabel(last);
    const rf = st.maxRise ? [' Largest rise ' + sgn(st.maxRise.change) + ' in ' + st.maxRise.label[0] + '.', ' Μεγαλύτερη αύξηση ' + sgn(st.maxRise.change) + ' τον ' + st.maxRise.label[1] + '.'] : ['', ''];
    const ff = st.maxFall ? [' Largest fall ' + sgn(st.maxFall.change) + ' in ' + st.maxFall.label[0] + '.', ' Μεγαλύτερη μείωση ' + sgn(st.maxFall.change) + ' τον ' + st.maxFall.label[1] + '.'] : ['', ''];
    const aria = ['Building permits, ' + who[0] + ', ' + f[0] + ' to ' + l[0] + ': change of each month against the same month a year earlier. ' + plural(st.up, 'month', 'months') + ' up, ' + plural(st.down, 'month', 'months') + ' down' + (st.gaps ? ', ' + plural(st.gaps, 'gap', 'gaps') : '') + '.' + rf[0] + ff[0] + (bd ? ' Note: ' + bd.text[0] : ''),
      'Άδειες οικοδομής, ' + who[1] + ', ' + f[1] + ' έως ' + l[1] + ': μεταβολή κάθε μήνα σε σχέση με τον ίδιο μήνα ένα χρόνο πριν. ' + st.up + (st.up === 1 ? ' μήνας' : ' μήνες') + ' πάνω, ' + st.down + (st.down === 1 ? ' μήνας' : ' μήνες') + ' κάτω' + (st.gaps ? ', ' + st.gaps + (st.gaps === 1 ? ' κενό' : ' κενά') : '') + '.' + rf[1] + ff[1] + (bd ? ' Σημείωση: ' + bd.text[1] : '')];
    const ch = (p) => (p ? sgn(p.change) + ' (' + p.label[0] + ')' : null), ch2 = (p) => (p ? sgn(p.change) + ' (' + p.label[1] + ')' : null);
    const panel = [
      { k: 'up', label: ['Months up', 'Μήνες πάνω'], value: st.up, text: [String(st.up), String(st.up)] },
      { k: 'down', label: ['Months down', 'Μήνες κάτω'], value: st.down, text: [String(st.down), String(st.down)] },
      { k: 'rise', label: ['Largest rise', 'Μεγαλύτερη αύξηση'], value: st.maxRise ? st.maxRise.change : null, text: st.maxRise ? [ch(st.maxRise), ch2(st.maxRise)] : ['none', 'καμία'] },
      { k: 'fall', label: ['Largest fall', 'Μεγαλύτερη μείωση'], value: st.maxFall ? st.maxFall.change : null, text: st.maxFall ? [ch(st.maxFall), ch2(st.maxFall)] : ['none', 'καμία'] },
      { k: 'gaps', label: ['Months with no comparison', 'Μήνες χωρίς σύγκριση'], value: st.gaps, text: [String(st.gaps), String(st.gaps)] }];
    return Object.assign(base, { points, band: bd, turns: tn, stats: st, panel, empty: null, textRows, aria });
  }

  const api = { build, yoy, stats, turns, band, monthLabel, WINDOW };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.waveData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
