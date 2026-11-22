/*
  Scatter data (pure, tested by tests/viz/scatter_test.js). Builds the model of the earthquake dot cloud from the answer of
  /api/stack/earthquakes. Every number and every position on screen is computed here, never in the drawing code.

  One dot per listed event, nothing else. Two views of the same dots:
    'magnitude': time across, magnitude up.
    'depth':     time across, depth in km DOWN from the surface (0 at the top), dot size by magnitude.
  It is a list of past events. There is no line through the dots, no average, no fitted curve: the picture says nothing about
  what comes next or why. The catalogue's own lower limit (minimumMagnitude) is a line in the magnitude view, because an empty
  space below it means "not listed", not "did not happen".

  Positions are fractions so the drawing code only multiplies: x 0..1 left to right over the time axis; yMag 0..1 from the bottom
  of the magnitude axis to its top; yDepth 0..1 from the surface (top) to the deepest tick (bottom); size 0..1 over the magnitudes
  that occur. An event with no usable time is not a dot (counted in counts.noTime and said in textRows). An event with no
  magnitude is a dot only in the depth view (hollow, smallest size), one with no depth only in the magnitude view: null, never 0.

  model = { id, n:[en,el], view, views:[{k,label,yTitle,aria}], available, empty:[en,el]|null,
            points:[{i,id,time,t,lat,lng,depthKm,magnitude,magnitudeType,place,reviewStatus,url,x,yMag,yDepth,size,
                     date:[en,el], magText:[en,el]|null, depthText:[en,el]|null, label:[en,el]}],   (time order)
            axes:{ time:{min,max,zone,title,ticks:[{t,at,label}]}, magnitude:{min,max,title,ticks:[{v,at,label}]},
                   depth:{min,max,title,ticks:[{v,at,label}]} },
            floor:{v,at,label:[en,el]}|null, counts:{events,drawn,noTime,noMagnitude,noDepth},
            range:{magnitude:[lo,hi]|null, depthKm:[lo,hi]|null, time:[first,last]|null},
            strings:{caption,sizeKey,countLine,sourceLine,pickHint,noDots,tip:{magnitude,depth,none}}, note:[en,el]|null, source, sourceUrl, period,
            textRows:[[en,el]], ariaLabel:[en,el], aria:[en,el] }
  Browser: window.SC.viz.scatterData; Node: module.exports.
*/
(function (root) {
  'use strict';
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_EL = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
  const VIEWS = ['magnitude', 'depth'];
  const DAY = 86400000;

  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
  const pairOf = (p, fb) => (Array.isArray(p) && typeof p[0] === 'string' && p[0] ? [p[0], typeof p[1] === 'string' && p[1] ? p[1] : p[0]] : typeof p === 'string' && p ? [p, p] : fb || null);
  const r2 = (v) => Math.round(v * 100) / 100;
  // a number as text: at most 2 decimals, Greek uses a decimal comma
  function num(v, minDecimals) {
    let s = String(r2(v));
    if (minDecimals && s.indexOf('.') < 0) s = r2(v).toFixed(minDecimals);
    return [s, s.replace('.', ',')];
  }
  const two = (n) => String(n).padStart(2, '0');
  function dateLabel(t, withTime) {
    const d = new Date(t), tail = withTime ? ', ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC' : '';
    return [d.getUTCDate() + ' ' + MON_EN[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + tail, d.getUTCDate() + ' ' + MON_EL[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + tail];
  }
  const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

  // ---- events ------------------------------------------------------------------------------------------------------
  // Keeps what the answer says; sorts by time (ties by id). Returns { events, noTime }.
  function events(features) {
    const out = []; let noTime = 0;
    for (const f of Array.isArray(features) ? features : []) {
      if (!f || typeof f !== 'object') continue;
      const t = typeof f.time === 'string' || isNum(f.time) ? new Date(f.time).getTime() : NaN;
      if (!Number.isFinite(t)) { noTime++; continue; }
      out.push({ id: f.id == null ? '' : String(f.id), time: new Date(t).toISOString(), t, lat: isNum(f.lat) ? f.lat : null, lng: isNum(f.lng) ? f.lng : null,
        depthKm: isNum(f.depthKm) ? f.depthKm : null, magnitude: isNum(f.magnitude) ? f.magnitude : null,
        magnitudeType: typeof f.magnitudeType === 'string' && f.magnitudeType ? f.magnitudeType : null,
        place: typeof f.place === 'string' && f.place ? f.place : null, reviewStatus: typeof f.reviewStatus === 'string' ? f.reviewStatus : null, url: safeUrl(f.url) });
    }
    out.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { events: out, noTime };
  }

  // ---- axes --------------------------------------------------------------------------------------------------------
  // Time axis: the catalogue's own period when it is given ("2015-01-01 / 2026-11-19"), widened if an event falls outside;
  // otherwise whole years around the events. Ticks at 1 January (or at the first of each month when the span is under 2 years).
  function timeAxis(period, ts) {
    let min = null, max = null;
    const m = typeof period === 'string' ? period.match(/^\s*(\d{4}-\d{2}-\d{2})\s*\/\s*(\d{4}-\d{2}-\d{2})\s*$/) : null;
    if (m) { const a = Date.parse(m[1] + 'T00:00:00Z'), b = Date.parse(m[2] + 'T00:00:00Z'); if (Number.isFinite(a) && Number.isFinite(b) && b > a) { min = a; max = b + DAY; } }
    if (ts.length) {
      const lo = Math.min(...ts), hi = Math.max(...ts);
      if (min === null) { min = Date.UTC(new Date(lo).getUTCFullYear(), 0, 1); max = Date.UTC(new Date(hi).getUTCFullYear() + 1, 0, 1); }
      if (lo < min) min = Date.UTC(new Date(lo).getUTCFullYear(), new Date(lo).getUTCMonth(), 1);
      if (hi > max) max = Date.UTC(new Date(hi).getUTCFullYear(), new Date(hi).getUTCMonth() + 1, 1);
    }
    if (min === null) return { min: null, max: null, ticks: [] };
    const at = (t) => (t - min) / (max - min), ticks = [];
    const y0 = new Date(min).getUTCFullYear(), y1 = new Date(max).getUTCFullYear();
    for (let y = y0; y <= y1; y++) { const t = Date.UTC(y, 0, 1); if (t >= min && t <= max) ticks.push({ t, at: at(t), label: [String(y), String(y)] }); }
    if (ticks.length < 2) {
      ticks.length = 0;
      for (let y = y0; y <= y1; y++) for (let mo = 0; mo < 12; mo++) { const t = Date.UTC(y, mo, 1); if (t >= min && t <= max) ticks.push({ t, at: at(t), label: [MON_EN[mo] + ' ' + y, MON_EL[mo] + ' ' + y] }); }
    }
    return { min, max, ticks };
  }

  // Magnitude axis in tenths (whole numbers, so no floating error): half a unit of empty space under the catalogue's lower
  // limit so the "not listed" zone is visible, and the top on the next half unit above the largest listed magnitude.
  function magnitudeAxis(mags, floorV) {
    if (!mags.length && !isNum(floorV)) return { min: null, max: null, ticks: [] };
    const lows = mags.concat(isNum(floorV) ? [floorV] : []), highs = lows;
    const loData = Math.min(...lows), hiData = Math.max(...highs);
    let lo = Math.floor(Math.round(loData * 10) / 5) * 5 - 5, hi = Math.ceil(Math.round(hiData * 10) / 5) * 5;
    if (hi - hiData * 10 < 1) hi += 5;
    if (lo < 0) lo = 0;
    const step = hi - lo > 40 ? 10 : 5, ticks = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push({ v: v / 10, at: (v - lo) / (hi - lo), label: num(v / 10, 1) });
    return { min: lo / 10, max: hi / 10, ticks };
  }

  // Depth axis: 0 (the surface) at the top, down to the next round step below the deepest listed event.
  function depthAxis(depths) {
    if (!depths.length) return { min: 0, max: null, ticks: [] };
    const deepest = Math.max(0, ...depths);
    const step = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((s) => deepest / s <= 5) || 1000;
    let max = Math.ceil(deepest / step) * step; if (max === 0) max = step; if (max - deepest < step * 0.08) max += step;
    const ticks = []; for (let v = 0; v <= max; v += step) ticks.push({ v, at: v / max, label: num(v) });
    return { min: 0, max, ticks };
  }

  // The answer gives the units in English. Greek for the two sentences the sheet uses today; any other wording falls back to a
  // plain Greek name of the quantity (the English one is kept as given).
  const UNIT_EL = { 'magnitude (the type is given with each event)': 'μέγεθος (ο τύπος δίνεται με κάθε σεισμό)', 'km below the surface': 'χλμ κάτω από την επιφάνεια' };
  const unitPair = (s, fbEn, fbEl) => (typeof s === 'string' && s ? [s, UNIT_EL[s] || fbEl] : [fbEn, fbEl]);

  const EMPTY_OFF = ['The earthquake list is not available right now, so nothing is drawn.', 'Ο κατάλογος σεισμών δεν είναι διαθέσιμος αυτή τη στιγμή, γι’ αυτό δεν σχεδιάζεται τίποτα.'];
  const EMPTY_NONE = ['The catalogue lists no earthquake for this area and period.', 'Ο κατάλογος δεν έχει κανέναν σεισμό για αυτή την περιοχή και περίοδο.'];
  const EMPTY_NOTIME = ['The listed earthquakes have no usable time, so no dot can be drawn.', 'Οι σεισμοί του καταλόγου δεν έχουν χρήσιμη ώρα, άρα δεν μπορεί να σχεδιαστεί καμία κουκκίδα.'];
  const CAPTION = ['A list of past earthquakes, one dot each. It says nothing about the future and nothing about causes.', 'Κατάλογος σεισμών που έγιναν, μία κουκκίδα ο καθένας. Δεν λέει τίποτα για το μέλλον ούτε για αιτίες.'];
  const elCount = (n) => n + (n === 1 ? ' σεισμός' : ' σεισμοί');
  const enCount = (n) => n + (n === 1 ? ' earthquake' : ' earthquakes');

  // ---- model -------------------------------------------------------------------------------------------------------
  function build(answer, opts) {
    opts = opts || {};
    const a = answer && typeof answer === 'object' ? answer : {};
    const view = VIEWS.indexOf(opts.view) >= 0 ? opts.view : 'magnitude';
    const title = pairOf(a.title, ['Earthquakes', 'Σεισμοί']);
    const units = a.units && typeof a.units === 'object' ? a.units : {};
    const magTitle = unitPair(units.magnitude, 'magnitude', 'μέγεθος'), depthTitle = unitPair(units.depthKm, 'km', 'χλμ');
    const zone = typeof a.timeZone === 'string' && a.timeZone ? a.timeZone : 'UTC';
    const source = pairOf(a.source), note = pairOf(a.note), period = typeof a.period === 'string' && a.period ? a.period : null;
    const floorV = isNum(a.minimumMagnitude) ? a.minimumMagnitude : null;
    const views = [
      { k: 'magnitude', label: ['Magnitude', 'Μέγεθος'], yTitle: ['↑ ' + magTitle[0], '↑ ' + magTitle[1]] },
      { k: 'depth', label: ['Depth', 'Βάθος'], yTitle: ['↓ ' + depthTitle[0], '↓ ' + depthTitle[1]] }];
    const base = { id: 'scatter', n: title, view, views, available: a.available !== false, source, sourceUrl: safeUrl(a.sourceUrl), period, note,
      strings: { caption: CAPTION, sizeKey: ['Bigger dot = bigger magnitude', 'Μεγαλύτερη κουκκίδα = μεγαλύτερο μέγεθος'],
        pickHint: ['Left and Right arrows walk the earthquakes in time order, Enter picks one, V changes the view.', 'Τα βέλη αριστερά και δεξιά περνούν τους σεισμούς με χρονική σειρά, το Enter διαλέγει έναν, το V αλλάζει την όψη.'],
        noDots: ['No listed earthquake has this value, so this view has no dots.', 'Κανένας σεισμός του καταλόγου δεν έχει αυτή την τιμή, άρα αυτή η όψη δεν έχει κουκκίδες.'],
        tip: { magnitude: ['Magnitude', 'Μέγεθος'], depth: ['Depth', 'Βάθος'], none: ['not given', 'δεν δίνεται'] } } };
    const srcRow = source ? [['Source: ' + source[0] + '.' + (period ? ' Period: ' + period.replace(/\s*\/\s*/, ' to ') + ' (' + zone + ').' : ''), 'Πηγή: ' + source[1] + '.' + (period ? ' Περίοδος: ' + period.replace(/\s*\/\s*/, ' έως ') + ' (' + zone + ').' : '')]] : [];
    const empty = (msg) => {
      const rows = [msg].concat(srcRow, note ? [note] : []);
      views.forEach((v) => { v.aria = msg; });
      return Object.assign(base, { points: [], axes: { time: { min: null, max: null, zone, title: ['time (' + zone + ')', 'χρόνος (' + zone + ')'], ticks: [] }, magnitude: { min: null, max: null, title: magTitle, ticks: [] }, depth: { min: 0, max: null, title: depthTitle, ticks: [] } },
        floor: null, counts: { events: 0, drawn: { magnitude: 0, depth: 0 }, noTime: 0, noMagnitude: 0, noDepth: 0 }, range: { magnitude: null, depthKm: null, time: null }, empty: msg, textRows: rows, ariaLabel: msg, aria: msg });
    };
    if (a.available === false) return empty(EMPTY_OFF);
    const ev = events(a.features), list = ev.events;
    if (!list.length) return empty(ev.noTime ? EMPTY_NOTIME : EMPTY_NONE);

    const mags = list.filter((e) => e.magnitude !== null).map((e) => e.magnitude), depths = list.filter((e) => e.depthKm !== null).map((e) => e.depthKm);
    const tAx = timeAxis(period, list.map((e) => e.t)), mAx = magnitudeAxis(mags, floorV), dAx = depthAxis(depths);
    const mLo = mags.length ? Math.min(...mags) : null, mHi = mags.length ? Math.max(...mags) : null;
    const dLo = depths.length ? Math.min(...depths) : null, dHi = depths.length ? Math.max(...depths) : null;
    const none = base.strings.tip.none;
    const points = list.map((e, i) => {
      const date = dateLabel(e.t, true), mt = e.magnitude === null ? null : num(e.magnitude, 1), dt = e.depthKm === null ? null : num(e.depthKm);
      const magText = mt ? [mt[0] + (e.magnitudeType ? ' (' + e.magnitudeType + ')' : ''), mt[1] + (e.magnitudeType ? ' (' + e.magnitudeType + ')' : '')] : null;
      const depthText = dt ? [dt[0] + ' km', dt[1] + ' χλμ'] : null;
      const place = e.place ? ', ' + e.place : '';
      const label = [date[0] + ': magnitude ' + (magText ? magText[0] : none[0]) + ', depth ' + (depthText ? depthText[0] : none[0]) + place,
        date[1] + ': μέγεθος ' + (magText ? magText[1] : none[1]) + ', βάθος ' + (depthText ? depthText[1] : none[1]) + place];
      return Object.assign({ i }, e, {
        x: (e.t - tAx.min) / (tAx.max - tAx.min),
        yMag: e.magnitude === null ? null : (e.magnitude - mAx.min) / (mAx.max - mAx.min),
        yDepth: e.depthKm === null ? null : e.depthKm / dAx.max,
        size: e.magnitude === null ? null : mHi > mLo ? (e.magnitude - mLo) / (mHi - mLo) : 0.5,
        date, magText, depthText, label });
    });
    const floor = floorV === null || mAx.min === null ? null : { v: floorV, at: (floorV - mAx.min) / (mAx.max - mAx.min),
      label: ['Magnitude ' + num(floorV, 1)[0] + ': nothing below this is listed', 'Μέγεθος ' + num(floorV, 1)[1] + ': τίποτα κάτω από αυτό δεν υπάρχει στον κατάλογο'] };
    const counts = { events: list.length, drawn: { magnitude: mags.length, depth: depths.length }, noTime: ev.noTime, noMagnitude: list.length - mags.length, noDepth: list.length - depths.length };
    const first = dateLabel(list[0].t), last = dateLabel(list[list.length - 1].t);
    const range = { magnitude: mags.length ? [mLo, mHi] : null, depthKm: depths.length ? [dLo, dHi] : null, time: [list[0].time, list[list.length - 1].time] };
    base.strings.countLine = [enCount(list.length) + (floorV !== null ? ' of magnitude ' + num(floorV, 1)[0] + ' or more' : ''), elCount(list.length) + (floorV !== null ? ' μεγέθους ' + num(floorV, 1)[1] + ' ή μεγαλύτερου' : '')];
    base.strings.sourceLine = source ? [source[0] + (period ? ' · ' + period : ''), source[1] + (period ? ' · ' + period : '')] : period ? [period, period] : null;

    const textRows = points.map((p) => [p.label[0] + '.', p.label[1] + '.']);
    if (ev.noTime) textRows.push([ev.noTime + (ev.noTime === 1 ? ' listed event has' : ' listed events have') + ' no usable time and cannot be drawn.', ev.noTime + (ev.noTime === 1 ? ' σεισμός του καταλόγου δεν έχει' : ' σεισμοί του καταλόγου δεν έχουν') + ' χρήσιμη ώρα και δεν σχεδιάζονται.']);
    if (counts.noMagnitude) textRows.push([counts.noMagnitude + ' without a magnitude: drawn only in the depth view.', counts.noMagnitude + ' χωρίς μέγεθος: φαίνονται μόνο στην όψη βάθους.']);
    if (counts.noDepth) textRows.push([counts.noDepth + ' without a depth: drawn only in the magnitude view.', counts.noDepth + ' χωρίς βάθος: φαίνονται μόνο στην όψη μεγέθους.']);
    if (floor) textRows.push([floor.label[0] + '.', floor.label[1] + '.']);
    srcRow.forEach((r) => textRows.push(r));
    if (note) textRows.push(note);
    textRows.push(CAPTION);

    const span = [', from ' + first[0] + ' to ' + last[0], ', από ' + first[1] + ' έως ' + last[1]];
    const mr = range.magnitude ? [' Magnitudes from ' + num(mLo, 1)[0] + ' to ' + num(mHi, 1)[0] + '.', ' Μεγέθη από ' + num(mLo, 1)[1] + ' έως ' + num(mHi, 1)[1] + '.'] : ['', ''];
    const dr = range.depthKm ? [' Depths from ' + num(dLo)[0] + ' to ' + num(dHi)[0] + ' km.', ' Βάθη από ' + num(dLo)[1] + ' έως ' + num(dHi)[1] + ' χλμ.'] : ['', ''];
    const how = { magnitude: [' Each dot is one earthquake: time across, magnitude up.', ' Κάθε κουκκίδα είναι ένας σεισμός: ο χρόνος οριζόντια, το μέγεθος προς τα πάνω.'],
      depth: [' Each dot is one earthquake: time across, depth downward from the surface, bigger dot for bigger magnitude.', ' Κάθε κουκκίδα είναι ένας σεισμός: ο χρόνος οριζόντια, το βάθος προς τα κάτω από την επιφάνεια, μεγαλύτερη κουκκίδα για μεγαλύτερο μέγεθος.'] };
    views.forEach((v) => {
      v.aria = [title[0] + ': ' + base.strings.countLine[0] + span[0] + '.' + how[v.k][0] + mr[0] + dr[0] + (floor && v.k === 'magnitude' ? ' ' + floor.label[0] + '.' : '') + ' ' + CAPTION[0] + ' ' + base.strings.pickHint[0],
        title[1] + ': ' + base.strings.countLine[1] + span[1] + '.' + how[v.k][1] + mr[1] + dr[1] + (floor && v.k === 'magnitude' ? ' ' + floor.label[1] + '.' : '') + ' ' + CAPTION[1] + ' ' + base.strings.pickHint[1]];
    });
    const aria = views.find((v) => v.k === view).aria;
    return Object.assign(base, { points,
      axes: { time: { min: tAx.min, max: tAx.max, zone, title: ['time (' + zone + ')', 'χρόνος (' + zone + ')'], ticks: tAx.ticks }, magnitude: { min: mAx.min, max: mAx.max, title: magTitle, ticks: mAx.ticks }, depth: { min: dAx.min, max: dAx.max, title: depthTitle, ticks: dAx.ticks } },
      floor, counts, range, empty: null, textRows, ariaLabel: aria, aria });
  }

  const api = { build, events, timeAxis, magnitudeAxis, depthAxis, dateLabel, num, VIEWS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.scatterData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
