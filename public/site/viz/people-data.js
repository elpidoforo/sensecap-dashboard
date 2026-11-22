/*
  People data (pure, tested by tests/viz/people_test.js). Built from the answers of /api/stack/population and /api/stack/age
  (CYSTAT census of 1 October 2021). Both list `features` = four municipalities (the city centres of the site), joined here by
  `key` (or `code`): population gives `residents`; age gives `counts` {under15, age15to64, age65plus} and `meanAge` (years).
  ONE city at a time. Every number is computed here, never in the drawing code.
    - Residents: a field of blocks, one block = `unit` residents (1, 2, 5, 10, ... the smallest step that keeps every city of
      the answer within BLOCK_CAP blocks, so a block means the same on every city). A started block counts as one.
    - Age: the bands the sheet really has (three: under 15, 15 to 64, 65 and over), each with its count and its share of the
      people in that city's bands. If the bands do not add up to the residents figure the model says so (age.matches false,
      age.sumNote); nothing is forced to fit.
    - Cities are never put on one picture and never ranked; no string compares one city with another.
    - If one answer is missing or unavailable, the other part is still built and the missing part carries an honest sentence.
  model = { id, title, available, empty|null, city (key), choices:[{id,name}], cities:{<key>:view}, unit (residents per block|null),
            censusDate:[en,el]|null, strings:{...pairs}, honesty|null, source|null, asOf|null, ...view of the chosen city }
  view  = { cityName, boundary:[en,el]|null,
            residents:{ available, empty|null, value, text:[en,el], blocks, unit, unitText:[en,el], label:[en,el] },
            age:{ available, empty|null, bands:[band], sum, sumText, matches (true|false|null), sumNote:[en,el]|null,
                  axis:{label, ticks:[{t,text}]}, meanAge:{value, text, short, label}|null },
            recast:{ residents|null, sameAs2021, text:[en,el] }|null, notes:[[en,el]], ariaLabel, textRows }
  band  = { band ('under15'|'age15to64'|'age65plus'), name:[en,el], count, share (0..1 of the bands' sum), t (= share, bar length),
            countText:[en,el], shareText:[en,el], label:[en,el] (full sentence) }
  select(model, cityKey) -> the same model with another city's view on top (used by the widget's set({city})).
  Every visible string is a pair [english, greek]. Works as a browser script (window.SC.viz.peopleData) and as CommonJS.
*/
(function (root) {
  'use strict';
  const MONTHS = [['January', 'Ιανουαρίου'], ['February', 'Φεβρουαρίου'], ['March', 'Μαρτίου'], ['April', 'Απριλίου'], ['May', 'Μαΐου'], ['June', 'Ιουνίου'],
    ['July', 'Ιουλίου'], ['August', 'Αυγούστου'], ['September', 'Σεπτεμβρίου'], ['October', 'Οκτωβρίου'], ['November', 'Νοεμβρίου'], ['December', 'Δεκεμβρίου']];
  const TITLE = ['Residents and their ages, one city at a time', 'Κάτοικοι και ηλικίες, μία πόλη κάθε φορά'];
  const EMPTY = ['No census figures for residents or their ages are available right now.', 'Δεν υπάρχουν διαθέσιμα στοιχεία απογραφής για τους κατοίκους ή τις ηλικίες τους αυτή τη στιγμή.'];
  const NO_POP = ['The residents answer is not available right now, so no blocks are drawn.', 'Η απάντηση για τους κατοίκους δεν είναι διαθέσιμη αυτή τη στιγμή, άρα δεν σχεδιάζονται τετράγωνα.'];
  const NO_POP_CITY = ['The residents answer has no figure for this city, so no blocks are drawn.', 'Η απάντηση για τους κατοίκους δεν έχει αριθμό για αυτή την πόλη, άρα δεν σχεδιάζονται τετράγωνα.'];
  const NO_AGE = ['The age answer is not available right now, so no age bars are drawn.', 'Η απάντηση για τις ηλικίες δεν είναι διαθέσιμη αυτή τη στιγμή, άρα δεν σχεδιάζονται ράβδοι ηλικίας.'];
  const NO_AGE_CITY = ['The age answer has no age bands for this city, so no age bars are drawn.', 'Η απάντηση για τις ηλικίες δεν έχει ηλικιακές ομάδες για αυτή την πόλη, άρα δεν σχεδιάζονται ράβδοι ηλικίας.'];
  const BANDS = [
    { band: 'under15', name: ['under 15 years', 'κάτω των 15 ετών'] },
    { band: 'age15to64', name: ['15 to 64 years', '15 έως 64 ετών'] },
    { band: 'age65plus', name: ['65 years and over', '65 ετών και άνω'] },
  ];
  const STEPS = [1, 2, 5], BLOCK_CAP = 240;
  const S = {
    choose: ['City', 'Πόλη'],
    residents: ['residents', 'κάτοικοι'],
    ages: ['Age bands', 'Ηλικιακές ομάδες'],
    hint: ['Point at an age bar, or use the up and down arrow keys, to read one band.', 'Δείξε μια ράβδο ηλικίας, ή χρησιμοποίησε τα βέλη πάνω και κάτω, για να διαβάσεις μία ομάδα.'],
    started: ['A started block counts as one block.', 'Ένα τετράγωνο που έχει αρχίσει μετρά ως ένα τετράγωνο.'],
    oneCity: ['One city at a time. The cities are not drawn together.', 'Μία πόλη κάθε φορά. Οι πόλεις δεν σχεδιάζονται μαζί.'],
    municipality: ['These are the residents of the municipality itself. Neighbouring municipalities and communities are counted separately in the census.',
      'Αυτοί είναι οι κάτοικοι του ίδιου του δήμου. Οι γειτονικοί δήμοι και κοινότητες μετριούνται χωριστά στην απογραφή.'],
    axis: ['bar length = share of the people in this city\'s age bands', 'μήκος ράβδου = ποσοστό των ανθρώπων στις ηλικιακές ομάδες αυτής της πόλης'],
  };
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isCount = (v) => isNum(v) && v >= 0;
  const pair = (p, fb) => (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null ? [String(p[0]), String(p[1])] : [String(fb), String(fb)]);
  const clean = (p) => [p[0].replace(/[«»]/g, '"'), p[1].replace(/[«»]/g, '"')];
  const opt = (p) => (Array.isArray(p) && p.length >= 2 && p[0] && p[1] ? clean(pair(p, '')) : null);
  const group = (v, sep) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const int = (v) => [group(v, ','), group(v, '.')];
  const dec = (v, n) => { const s = v.toFixed(n); return [s, s.replace('.', ',')]; };
  const pct = (share) => { const d = dec(share * 100, 1); return [d[0] + '%', d[1] + '%']; };
  const join = (a, b, sep) => [a[0] + (sep || ' ') + b[0], a[1] + (sep || ' ') + b[1]];
  const ok = (ans) => !!ans && typeof ans === 'object' && ans.available !== false && Array.isArray(ans.features);
  const feats = (ans) => (ok(ans) ? ans.features.filter((f) => f && typeof f === 'object') : []);
  const keyOf = (f) => (f.key != null && f.key !== '' ? String(f.key) : (f.code != null && f.code !== '' ? String(f.code) : null));

  function censusDate(period) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(period || '')); if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3]; if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return [d + ' ' + MONTHS[mo - 1][0] + ' ' + y, (d === 1 ? '1ης' : String(d)) + ' ' + MONTHS[mo - 1][1] + ' ' + y];
  }
  // smallest "one block = N residents" (1, 2, 5, 10, 20, 50, ...) so that the largest figure needs at most cap blocks
  function blockUnit(counts, cap) {
    const mx = Math.max(0, ...counts.filter(isCount)); cap = cap > 0 ? cap : BLOCK_CAP;
    let mag = 1;
    for (;;) { for (const k of STEPS) { const n = k * mag; if (Math.ceil(mx / n) <= cap) return n; } mag *= 10; }
  }
  const blocksOf = (count, n) => (count > 0 ? Math.ceil(count / n) : 0);
  const unitText = (n) => (n === 1 ? ['one block = 1 resident', 'ένα τετράγωνο = 1 κάτοικος'] : ['one block = ' + int(n)[0] + ' residents', 'ένα τετράγωνο = ' + int(n)[1] + ' κάτοικοι']);

  function residentsPart(pf, popOk, unit, name, when) {
    if (!popOk) return { available: false, empty: NO_POP, value: null, text: null, blocks: 0, unit: null, unitText: null, label: NO_POP };
    if (!pf || !isCount(pf.residents)) return { available: false, empty: NO_POP_CITY, value: null, text: null, blocks: 0, unit: null, unitText: null, label: NO_POP_CITY };
    const v = pf.residents, text = int(v), blocks = blocksOf(v, unit), bt = int(blocks);
    return { available: true, empty: null, value: v, text, blocks, unit, unitText: unitText(unit),
      label: [name[0] + when[0] + ': ' + text[0] + ' residents, drawn as ' + bt[0] + (blocks === 1 ? ' block' : ' blocks') + ' (' + unitText(unit)[0] + ').',
        name[1] + when[1] + ': ' + text[1] + ' κάτοικοι, σχεδιασμένοι ως ' + bt[1] + (blocks === 1 ? ' τετράγωνο' : ' τετράγωνα') + ' (' + unitText(unit)[1] + ').'] };
  }

  function agePart(af, ageOk, res, name) {
    const none = (e) => ({ available: false, empty: e, bands: [], sum: null, sumText: null, matches: null, sumNote: null, axis: { label: S.axis, ticks: [] }, meanAge: null });
    if (!ageOk) return none(NO_AGE);
    const c = af && af.counts && typeof af.counts === 'object' ? af.counts : null;
    const have = c ? BANDS.filter((b) => isCount(c[b.band])) : [];
    const sum = have.reduce((s, b) => s + c[b.band], 0);
    const mean = af && isNum(af.meanAge) ? { value: af.meanAge, text: dec(af.meanAge, 2), short: ['Mean age: ' + dec(af.meanAge, 2)[0] + ' years', 'Μέση ηλικία: ' + dec(af.meanAge, 2)[1] + ' έτη'],
      label: ['Mean age: ' + dec(af.meanAge, 2)[0] + ' years (as published by CYSTAT).', 'Μέση ηλικία: ' + dec(af.meanAge, 2)[1] + ' έτη (όπως τη δημοσίευσε η CYSTAT).'] } : null;
    if (!have.length || !(sum > 0)) { const n = none(NO_AGE_CITY); n.meanAge = mean; n.available = !!mean; return n; }
    const sumText = int(sum);
    const bands = have.map((b) => {
      const count = c[b.band], share = count / sum, ct = int(count), st = pct(share);
      return { band: b.band, name: b.name, count, share, t: share, countText: ct, shareText: st,
        label: [name[0] + ', ' + b.name[0] + ': ' + ct[0] + ' residents, ' + st[0] + ' of the ' + sumText[0] + ' people in the age bands.',
          name[1] + ', ' + b.name[1] + ': ' + ct[1] + ' κάτοικοι, ' + st[1] + ' από τους ' + sumText[1] + ' ανθρώπους στις ηλικιακές ομάδες.'] };
    });
    // the figure the bands should add up to: the residents answer when it has this city, else the age answer's own residents
    const ref = res.available ? res.value : (af && isCount(af.residents) ? af.residents : null);
    const matches = ref == null ? null : ref === sum;
    let sumNote;
    if (matches === true) sumNote = ['The age bands add up to the residents figure: ' + sumText[0] + '.', 'Οι ηλικιακές ομάδες δίνουν άθροισμα ίσο με τον αριθμό των κατοίκων: ' + sumText[1] + '.'];
    else if (matches === false) sumNote = ['The age bands add up to ' + sumText[0] + ' people, but the residents figure is ' + int(ref)[0] + '. The two do not agree; the shares are of the ' + sumText[0] + ' people in the bands.',
      'Οι ηλικιακές ομάδες δίνουν άθροισμα ' + sumText[1] + ' ανθρώπους, όμως ο αριθμός των κατοίκων είναι ' + int(ref)[1] + '. Οι δύο αριθμοί δεν συμφωνούν· τα ποσοστά είναι επί των ' + sumText[1] + ' ανθρώπων στις ομάδες.'];
    else sumNote = ['The age bands add up to ' + sumText[0] + ' people. There is no residents figure to check this against.', 'Οι ηλικιακές ομάδες δίνουν άθροισμα ' + sumText[1] + ' ανθρώπους. Δεν υπάρχει αριθμός κατοίκων για έλεγχο.'];
    return { available: true, empty: null, bands, sum, sumText, matches, sumNote,
      axis: { label: S.axis, ticks: [{ t: 0, text: ['0%', '0%'] }, { t: 0.5, text: ['50%', '50%'] }, { t: 1, text: ['100%', '100%'] }] }, meanAge: mean };
  }

  function recastPart(pf, recastNote) {
    const r = pf && pf.recast2024 && typeof pf.recast2024 === 'object' ? pf.recast2024 : null; if (!r) return null;
    if (r.sameAs2021 === true) return { residents: isCount(r.residents) ? r.residents : null, sameAs2021: true,
      text: ['The boundary of this municipality after the 2024 reform is the same as on census day.', 'Το όριο αυτού του δήμου μετά τη μεταρρύθμιση του 2024 είναι ίδιο με της ημέρας της απογραφής.'] };
    if (!isCount(r.residents)) return null;
    const t = int(r.residents), lead = ['Inside the boundary this municipality has since 2024: ' + t[0] + ' of the residents counted in 2021.', 'Μέσα στο όριο που έχει αυτός ο δήμος από το 2024: ' + t[1] + ' από τους κατοίκους που μετρήθηκαν το 2021.'];
    return { residents: r.residents, sameAs2021: false, text: recastNote ? join(lead, recastNote) : lead };
  }

  function cityView(pf, af, ctx) {
    const f = pf || af, name = pair(f.name, f.publisherName || keyOf(f) || '?');
    const when = ctx.censusDate ? [', census of ' + ctx.censusDate[0], ', απογραφή της ' + ctx.censusDate[1]] : ['', ''];
    const residents = residentsPart(pf, ctx.popOk, ctx.unit, name, when);
    const age = agePart(af, ctx.ageOk, residents, name);
    const recast = residents.available ? recastPart(pf, ctx.recastNote) : null;
    const level = String(f.level || '') === 'municipality';
    const boundary = level ? (ctx.censusDate ? ['Municipality as it was on census day, ' + ctx.censusDate[0], 'Ο δήμος όπως ήταν την ημέρα της απογραφής, ' + ctx.censusDate[1]] : ['Municipality', 'Δήμος']) : null;
    const notes = [];
    if (ctx.honesty) notes.push(ctx.honesty);
    if (residents.available) notes.push(join(residents.unitText.map((t) => t.charAt(0).toUpperCase() + t.slice(1)), S.started, '. '));
    if (age.sumNote) notes.push(age.sumNote);
    if (level) notes.push(S.municipality);
    if (recast) notes.push(recast.text);
    notes.push(S.oneCity);
    if (ctx.source) notes.push(['Source: ' + ctx.source[0], 'Πηγή: ' + ctx.source[1]]);
    const head = residents.available ? residents.label : [name[0] + when[0] + ': ' + residents.empty[0], name[1] + when[1] + ': ' + residents.empty[1]];
    const ageRows = age.available ? age.bands.map((b) => b.label).concat(age.meanAge ? [age.meanAge.label] : []) : [];
    if (!age.bands.length) ageRows.push(age.empty);
    const textRows = [head].concat(ageRows, notes);
    const bandsEn = age.bands.map((b) => b.name[0] + ' ' + b.countText[0] + ' (' + b.shareText[0] + ')').join('; ');
    const bandsEl = age.bands.map((b) => b.name[1] + ' ' + b.countText[1] + ' (' + b.shareText[1] + ')').join('· ');
    const ariaLabel = [head[0] + ' ' + (age.bands.length ? 'Age bands: ' + bandsEn + '.' : age.empty[0]) + (age.meanAge ? ' ' + age.meanAge.label[0] : '') + (ctx.honesty ? ' ' + ctx.honesty[0] + '.' : ''),
      head[1] + ' ' + (age.bands.length ? 'Ηλικιακές ομάδες: ' + bandsEl + '.' : age.empty[1]) + (age.meanAge ? ' ' + age.meanAge.label[1] : '') + (ctx.honesty ? ' ' + ctx.honesty[1] + '.' : '')];
    return { cityName: name, boundary, residents, age, recast, notes, ariaLabel, textRows };
  }

  function emptyModel(why) {
    const e = why || EMPTY, none = (x) => ({ available: false, empty: x });
    return { id: 'people', title: TITLE, available: false, empty: e, city: null, choices: [], cities: {}, unit: null, censusDate: null, strings: S, honesty: null, source: null, asOf: null,
      cityName: null, boundary: null,
      residents: Object.assign(none(NO_POP), { value: null, text: null, blocks: 0, unit: null, unitText: null, label: NO_POP }),
      age: Object.assign(none(NO_AGE), { bands: [], sum: null, sumText: null, matches: null, sumNote: null, axis: { label: S.axis, ticks: [] }, meanAge: null }),
      recast: null, notes: [], ariaLabel: e, textRows: [e] };
  }

  function select(model, id) {
    const v = model && model.cities && model.cities[id];
    return v ? Object.assign({}, model, v, { city: String(id) }) : model;
  }

  function build(answers, opts) {
    opts = opts || {}; answers = answers || {};
    const pop = answers.population, ageAns = answers.age, popOk = ok(pop), ageOk = ok(ageAns);
    const pf = feats(pop).filter((f) => keyOf(f)), af = feats(ageAns).filter((f) => keyOf(f));
    if (!pf.length && !af.length) return emptyModel();
    const lead = pf.length ? pop : ageAns;
    const date = censusDate(lead.period), honesty = opt(lead.honesty), source = opt(lead.source);
    const recastNote = pop && pop.vintage ? opt(pop.vintage.recast) : null;
    const unit = pf.length ? blockUnit(pf.map((f) => f.residents), opts.cap) : null;
    const ctx = { popOk: popOk && pf.length > 0, ageOk: ageOk && af.length > 0, unit, censusDate: date, honesty, source, recastNote };
    const cities = {}, choices = [];
    const add = (k) => { if (cities[k]) return; const p = pf.find((f) => keyOf(f) === k) || null, a = af.find((f) => keyOf(f) === k) || null; cities[k] = cityView(p, a, ctx); choices.push({ id: k, name: cities[k].cityName }); };
    pf.forEach((f) => add(keyOf(f))); af.forEach((f) => add(keyOf(f)));
    const want = opts.city != null && cities[String(opts.city)] ? String(opts.city) : choices[0].id;
    const base = { id: 'people', title: TITLE, available: true, empty: null, city: want, choices, cities, unit, censusDate: date, strings: S, honesty, source, asOf: lead.period || lead.retrieved || null };
    return select(base, want);
  }

  const api = { build, select, emptyModel, blockUnit, blocksOf, EMPTY, BANDS, BLOCK_CAP };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.viz = root.SC.viz || {}; root.SC.viz.peopleData = api; }
})(typeof window !== 'undefined' ? window : globalThis);
