/*
  Forecast strip data (pure, tested by tests/viz/forecast_test.js). Built from the answer of /api/forecast (server.js `forecast`):
    { source:'Open-Meteo', place:'Central Cyprus', days:[{date:'YYYY-MM-DD', tmax, tmin, code, wind, windDir}], updated: ISO, mock: bool }
  It is the output of a WEATHER MODEL for one point in central Cyprus, not a measurement and not the forecast of the Cyprus
  Department of Meteorology. The model carries that sentence (`label`) and the widget must draw it inside the canvas.
    - One cell per forecast step the answer really has. The answer has DAYS (daily high and low in °C, the day's highest wind
      in m/s with its dominant direction, a WMO weather code). It has no hours and no rain amount, so none are shown.
      A day is used only when it has a date and a numeric tmax and tmin; nothing is filled in.
    - `rain` (mm) is read only if a day carries a finite `rain` number; the present server does not send one.
    - Printed temperatures are rounded to whole degrees (cell.hi / cell.lo); cell.values keeps the numbers of the answer.
    - The line scale is fixed for the strip: lowest low rounded DOWN to a multiple of 5, highest high rounded UP to a multiple of 5.
    - `mock:true` (the server's test mode) is said on the picture: `mockLabel`.
    - now = ms since 1970, passed in (never read from the clock): used for "today" (Cyprus date) and the age of the forecast.
  build(answer, opts, now) ->
    { id:'forecast', title, available, empty|null, step:'day', label, mock, mockLabel|null, source:[en,el]|null, place:[en,el]|null,
      made:{iso, text:[en,el], ageSeconds|null, ageText:[en,el]|null}|null, meta:[en,el], unit:[en,el], windUnit:[en,el],
      scale:{min,max,text}|null, cells:[cell], first (index of today's cell, else 0), strings, legend:[[en,el]], note, now,
      textRows:[[en,el]], ariaLabel:[en,el] }
  cell = { i, time (the date), dayName:[en,el], dayShort:[en,el], dateText:[en,el], isToday, past,
           tmax, tmin, hi, lo (texts), tHi, tLo (0..1 on the scale), sky:{kind, text:[en,el]}|null,
           wind:{value, text, dir|null, compass:[en,el]|null, short:[en,el], long:[en,el]}|null, rain:{value, text:[en,el]}|null,
           values:{tmax, tmin, code, wind, windDir, rain}, label:[en,el] }
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.forecastData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const TZ = 'Asia/Nicosia';
  const MONTHS = [['January', 'Ιανουαρίου'], ['February', 'Φεβρουαρίου'], ['March', 'Μαρτίου'], ['April', 'Απριλίου'], ['May', 'Μαΐου'], ['June', 'Ιουνίου'], ['July', 'Ιουλίου'], ['August', 'Αυγούστου'], ['September', 'Σεπτεμβρίου'], ['October', 'Οκτωβρίου'], ['November', 'Νοεμβρίου'], ['December', 'Δεκεμβρίου']];
  const DAYS = [['Sunday', 'Κυριακή'], ['Monday', 'Δευτέρα'], ['Tuesday', 'Τρίτη'], ['Wednesday', 'Τετάρτη'], ['Thursday', 'Πέμπτη'], ['Friday', 'Παρασκευή'], ['Saturday', 'Σάββατο']];
  const DAYS_S = [['Sun', 'Κυρ'], ['Mon', 'Δευ'], ['Tue', 'Τρί'], ['Wed', 'Τετ'], ['Thu', 'Πέμ'], ['Fri', 'Παρ'], ['Sat', 'Σάβ']];
  const COMPASS = [['N', 'Β'], ['NE', 'ΒΑ'], ['E', 'Α'], ['SE', 'ΝΑ'], ['S', 'Ν'], ['SW', 'ΝΔ'], ['W', 'Δ'], ['NW', 'ΒΔ']];
  const COMPASS_L = [['north', 'βόρειος'], ['north-east', 'βορειοανατολικός'], ['east', 'ανατολικός'], ['south-east', 'νοτιοανατολικός'], ['south', 'νότιος'], ['south-west', 'νοτιοδυτικός'], ['west', 'δυτικός'], ['north-west', 'βορειοδυτικός']];
  const TITLE = ['Weather model forecast, day by day', 'Πρόγνωση μοντέλου καιρού, μέρα με τη μέρα'];
  const LABEL = ['Forecast from a weather model, not a measurement', 'Πρόγνωση από μοντέλο καιρού, όχι μέτρηση'];
  const MOCK = ['Test values from the server test mode, not a real forecast', 'Δοκιμαστικές τιμές του διακομιστή, όχι πραγματική πρόγνωση'];
  const EMPTY = ['The weather model forecast is not available right now. Nothing is shown in its place.', 'Η πρόγνωση του μοντέλου καιρού δεν είναι διαθέσιμη αυτή τη στιγμή. Δεν εμφανίζεται τίποτα στη θέση της.'];
  const STRINGS = { high: ['high', 'μέγιστη'], low: ['low', 'ελάχιστη'], today: ['Today', 'Σήμερα'], wind: ['wind', 'άνεμος'], rain: ['rain', 'βροχή'] };
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  // the words of the weather page (public/site/pages/weather.js) for the WMO weather code of the model
  function sky(c) {
    if (!isNum(c)) return null;
    if (c === 0) return { kind: 'sun', text: ['Sunny', 'Ηλιοφάνεια'] };
    if (c === 1) return { kind: 'sun', text: ['Mostly sunny', 'Κυρίως ηλιοφάνεια'] };
    if (c === 2) return { kind: 'part', text: ['Sunny spells, some cloud', 'Ηλιοφάνεια με λίγη νέφωση'] };
    if (c === 3) return { kind: 'cloud', text: ['Cloudy', 'Συννεφιά'] };
    if (c === 45 || c === 48) return { kind: 'cloud', text: ['Fog', 'Ομίχλη'] };
    if (c >= 51 && c <= 57) return { kind: 'rain', text: ['Light drizzle', 'Ελαφριά ψιχάλα'] };
    if (c >= 61 && c <= 67) return { kind: 'rain', text: ['Rain', 'Βροχή'] };
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { kind: 'snow', text: ['Snow', 'Χιόνι'] };
    if (c >= 80 && c <= 82) return { kind: 'rain', text: ['Showers', 'Μπόρες'] };
    if (c >= 95) return { kind: 'storm', text: ['Thunderstorms', 'Καταιγίδες'] };
    return { kind: 'cloud', text: ['Cloudy', 'Συννεφιά'] };
  }
  const whole = (v) => String(Math.round(v) || 0);   // "|| 0" turns -0 into 0
  const compassIndex = (deg) => (isNum(deg) ? ((Math.round(deg / 45) % 8) + 8) % 8 : null);

  // Cyprus calendar date and clock of an instant: { key:'YYYY-MM-DD', y, m, d, hh, mm } or null
  function cyprus(ms) {
    if (!isNum(ms)) return null;
    try {
      const p = {};
      for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms))) p[x.type] = x.value;
      return { key: p.year + '-' + p.month + '-' + p.day, y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: p.hour, mm: p.minute };
    } catch (e) { return null; }
  }
  function ageText(s) {
    if (s == null) return null;
    if (s < 60) return ['less than a minute ago', 'πριν από λιγότερο από ένα λεπτό'];
    if (s < 3600) { const m = Math.floor(s / 60); return [m + ' min ago', 'πριν από ' + m + (m === 1 ? ' λεπτό' : ' λεπτά')]; }
    if (s < 86400) { const h = Math.floor(s / 3600); return [h + ' h ago', 'πριν από ' + h + (h === 1 ? ' ώρα' : ' ώρες')]; }
    const d = Math.floor(s / 86400); return [d + (d === 1 ? ' day ago' : ' days ago'), 'πριν από ' + d + (d === 1 ? ' ημέρα' : ' ημέρες')];
  }

  function emptyModel(now) {
    return { id: 'forecast', title: TITLE, available: false, empty: EMPTY, step: 'day', label: LABEL, mock: false, mockLabel: null, source: null, place: null, made: null,
      meta: EMPTY, unit: ['°C', '°C'], windUnit: ['m/s', 'm/s'], scale: null, cells: [], first: 0, strings: STRINGS, legend: [], note: EMPTY, now: isNum(now) ? now : null,
      textRows: [EMPTY], ariaLabel: EMPTY };
  }

  function build(ans, opts, now) {
    if (!ans || typeof ans !== 'object' || !Array.isArray(ans.days)) return emptyModel(now);
    const days = ans.days.filter((d) => d && typeof d.date === 'string' && DATE.test(d.date) && isNum(d.tmax) && isNum(d.tmin));
    if (!days.length) return emptyModel(now);
    const today = cyprus(now), todayKey = today ? today.key : null;
    const lo = Math.min(...days.map((d) => d.tmin)), hi = Math.max(...days.map((d) => d.tmax));
    let smin = Math.floor(lo / 5) * 5, smax = Math.ceil(hi / 5) * 5;
    if (smax <= smin) smax = smin + 5;
    const span = smax - smin, tOf = (v) => Math.max(0, Math.min(1, (v - smin) / span));
    const scale = { min: smin, max: smax, text: [
      'Line scale: ' + smin + ' to ' + smax + ' °C, fixed for the whole strip (the lowest low rounded down and the highest high rounded up to a multiple of 5). It is a drawing scale, not a limit.',
      'Κλίμακα γραμμής: ' + smin + ' έως ' + smax + ' °C, σταθερή για όλη τη λωρίδα (η χαμηλότερη ελάχιστη στρογγυλεμένη προς τα κάτω και η υψηλότερη μέγιστη προς τα πάνω, σε πολλαπλάσιο του 5). Είναι κλίμακα σχεδίασης, όχι όριο.'] };

    const cells = days.map((d, i) => {
      const m = DATE.exec(d.date), wd = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay(), mo = MONTHS[Number(m[2]) - 1] || ['', ''];
      const dateText = [Number(m[3]) + ' ' + mo[0], Number(m[3]) + ' ' + mo[1]];
      const isToday = todayKey === d.date, past = !!todayKey && d.date < todayKey;
      const hiT = whole(d.tmax), loT = whole(d.tmin), s = sky(d.code);
      let wind = null;
      if (isNum(d.wind)) {
        const ci = compassIndex(d.windDir), wt = whole(d.wind);
        wind = { value: d.wind, text: wt, dir: isNum(d.windDir) ? d.windDir : null, compass: ci == null ? null : COMPASS[ci],
          short: ci == null ? [wt + ' m/s', wt + ' m/s'] : [COMPASS[ci][0] + ' ' + wt + ' m/s', COMPASS[ci][1] + ' ' + wt + ' m/s'],
          long: ci == null ? ['wind up to ' + wt + ' m/s', 'άνεμος έως ' + wt + ' m/s'] : ['wind from the ' + COMPASS_L[ci][0] + ', up to ' + wt + ' m/s', 'άνεμος ' + COMPASS_L[ci][1] + ', έως ' + wt + ' m/s'] };
      }
      let rain = null;
      if (isNum(d.rain) && d.rain >= 0) { const rt = String(Math.round(d.rain * 10) / 10); rain = { value: d.rain, text: [rt + ' mm', rt + ' mm'] }; }
      const head = [(isToday ? 'Today, ' : '') + DAYS[wd][0] + ' ' + dateText[0], (isToday ? 'Σήμερα, ' : '') + DAYS[wd][1] + ' ' + dateText[1]];
      const bits = [['high ' + hiT + ' °C', 'μέγιστη ' + hiT + ' °C'], ['low ' + loT + ' °C', 'ελάχιστη ' + loT + ' °C']];
      if (s) bits.push([s.text[0].toLowerCase(), s.text[1].toLowerCase()]);
      if (rain) bits.push(['rain ' + rain.text[0], 'βροχή ' + rain.text[1]]);
      bits.push(wind ? wind.long : ['wind not given', 'χωρίς στοιχεία ανέμου']);
      const label = [head[0] + ': ' + bits.map((b) => b[0]).join(', ') + '. Model forecast, not a measurement.', head[1] + ': ' + bits.map((b) => b[1]).join(', ') + '. Πρόγνωση μοντέλου, όχι μέτρηση.'];
      return { i, time: d.date, dayName: DAYS[wd], dayShort: DAYS_S[wd], dateText, isToday, past, tmax: d.tmax, tmin: d.tmin, hi: hiT, lo: loT, tHi: tOf(d.tmax), tLo: tOf(d.tmin), sky: s, wind, rain,
        values: { tmax: d.tmax, tmin: d.tmin, code: isNum(d.code) ? d.code : null, wind: wind ? wind.value : null, windDir: wind ? wind.dir : null, rain: rain ? rain.value : null }, label };
    });

    const src = typeof ans.source === 'string' && ans.source.trim() ? ans.source.trim() : null;
    const source = src ? [src, src] : null;
    const pl = typeof ans.place === 'string' && ans.place.trim() ? ans.place.trim() : null;
    const place = pl ? (/^central cyprus$/i.test(pl) ? ['central Cyprus', 'κεντρική Κύπρος'] : [pl, pl]) : null;
    const mock = ans.mock === true;
    let made = null;
    const t = typeof ans.updated === 'string' ? Date.parse(ans.updated) : NaN, c = cyprus(t);
    if (c) {
      const age = isNum(now) ? Math.max(0, Math.round((now - t) / 1000)) : null, mo = MONTHS[c.m - 1];
      made = { iso: ans.updated, ageSeconds: age, ageText: ageText(age),
        text: ['fetched ' + c.d + ' ' + mo[0] + ' ' + c.y + ', ' + c.hh + ':' + c.mm + ' Cyprus time', 'λήψη ' + c.d + ' ' + mo[1] + ' ' + c.y + ', ' + c.hh + ':' + c.mm + ' ώρα Κύπρου'] };
    }
    const metaBits = [];
    metaBits.push(source ? ['Source: ' + source[0], 'Πηγή: ' + source[1]] : ['Source not stated', 'Η πηγή δεν δηλώνεται']);
    if (place) metaBits.push(place);
    metaBits.push(made ? made.text : ['time of the forecast not given', 'χωρίς ώρα πρόγνωσης']);
    const meta = [metaBits.map((b) => b[0]).join(' · '), metaBits.map((b) => b[1]).join(' · ')];
    const n = cells.length;
    const legend = [
      ['Each cell is one day of the forecast: the big number is the high, the small one the low, in °C, rounded to whole degrees.', 'Κάθε κελί είναι μία μέρα της πρόγνωσης: ο μεγάλος αριθμός είναι η μέγιστη, ο μικρός η ελάχιστη, σε °C, στρογγυλεμένες σε ακέραιο.'],
      ['Wind is the highest wind the model gives for the day, in m/s, with the direction it mostly blows from.', 'Ο άνεμος είναι ο ισχυρότερος που δίνει το μοντέλο για τη μέρα, σε m/s, με την κατεύθυνση από την οποία φυσά κυρίως.'],
    ];
    const note = ['This is what a weather model works out for one point' + (place ? ' in ' + place[0] : '') + '. It is not a measurement and not the forecast of the Cyprus Department of Meteorology. The answer has days only: no hours and no rain amounts.',
      'Αυτό είναι ό,τι υπολογίζει ένα μοντέλο καιρού για ένα σημείο' + (place ? ' (' + place[1] + ')' : '') + '. Δεν είναι μέτρηση ούτε η πρόγνωση του Τμήματος Μετεωρολογίας Κύπρου. Η απάντηση έχει μόνο μέρες: ούτε ώρες ούτε ποσότητες βροχής.'];
    const first = Math.max(0, cells.findIndex((x) => x.isToday));
    const textRows = [[LABEL[0] + '. ' + meta[0] + '.', LABEL[1] + '. ' + meta[1] + '.']];
    if (mock) textRows.push(MOCK);
    if (made && made.ageText) textRows.push(['The forecast was fetched ' + made.ageText[0] + '.', 'Η πρόγνωση λήφθηκε ' + made.ageText[1] + '.']);
    for (const x of cells) textRows.push(x.label);
    textRows.push(scale.text); for (const l of legend) textRows.push(l); textRows.push(note);
    const ariaLabel = [
      LABEL[0] + ': ' + n + (n === 1 ? ' day' : ' days') + ', ' + cells[0].dateText[0] + (n > 1 ? ' to ' + cells[n - 1].dateText[0] : '') + '. ' + meta[0] + '.' + (mock ? ' ' + MOCK[0] + '.' : '') + ' Left and Right arrows move the marker from day to day.',
      LABEL[1] + ': ' + n + (n === 1 ? ' μέρα' : ' μέρες') + ', ' + cells[0].dateText[1] + (n > 1 ? ' έως ' + cells[n - 1].dateText[1] : '') + '. ' + meta[1] + '.' + (mock ? ' ' + MOCK[1] + '.' : '') + ' Τα βέλη αριστερά και δεξιά μετακινούν τον δείκτη από μέρα σε μέρα.'];
    return { id: 'forecast', title: TITLE, available: true, empty: null, step: 'day', label: LABEL, mock, mockLabel: mock ? MOCK : null, source, place, made, meta,
      unit: ['°C', '°C'], windUnit: ['m/s', 'm/s'], scale, cells, first, strings: STRINGS, legend, note, now: isNum(now) ? now : null, textRows, ariaLabel };
  }

  const api = { build, emptyModel, sky, compassIndex, ageText, LABEL, EMPTY };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.forecastData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
